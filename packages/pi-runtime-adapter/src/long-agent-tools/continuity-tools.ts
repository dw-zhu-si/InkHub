import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "typebox";
import {
  EMPTY_LONG_MARKDOWN_REVISION,
  LongCommitChapterInputSchema,
  LongWorkspaceOperationBatchSchema,
  createEmptyLongMarkdownFileReference,
  longChapterCharacterContinuityFilePath,
  longChapterCharacterCurrentStateFileId,
  longChapterCharacterHistoryFileId,
  longChapterContinuityFilePath,
  longChapterWorldRevealsFileId,
  type LongContinuityFileChange,
  type LongContinuityFileRole,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import {
  continuityCreateTargetParameter,
  continuityFileTargetParameter,
  stableIdParameter,
  strictObject,
  worldbuildingReadModeParameter
} from "./schemas";
import {
  defineTool,
  literalUnion,
  nextContentRevision,
  stableHash,
  textResult
} from "./shared";
import { orderedLongChapterCards } from "./dispatch";
import { longProposalResultSummary, type LongToolContext } from "./context";

export function buildContinuityTools(ctx: LongToolContext): AgentTool[] {
  const { input, workspace, profile, readableRoots, writableRoots, capabilities, isContinuityLedgerAgent, execute, loadIndex, formLongMutationProposal, loadActiveChapterMutationContext, readChapterBodySnapshots, chapterBodyOverlay, fullyReadContinuityDocuments, continuityDocumentOverlay, pendingDeletedContinuityKeys, readWholeChapterBody } = ctx;
  const tools: AgentTool[] = [];
  const CONTINUITY_DOCUMENT_TITLES: Record<
    LongContinuityFileRole,
    string
  > = {
    foreshadowing_changes: "伏笔变化",
    world_reveals: "世界观揭露",
    character_current_state: "人物当前状态",
    character_history: "人物历史轨迹",
    chapter_end_state: "章末状态",
    handoff: "接续包"
  };

  const continuityOverlayKey = (
    chapterCardId: string,
    role: LongContinuityFileRole,
    characterId: string | null
  ) => `${chapterCardId}\0${role}\0${characterId ?? ""}`;

  const findContinuityOverlay = (
    chapterCardId: string,
    role: LongContinuityFileRole,
    characterId: string | null
  ) =>
    [...continuityDocumentOverlay.values()].find(
      (candidate) =>
        continuityOverlayKey(
          candidate.chapterCardId,
          candidate.role,
          candidate.characterId
        ) === continuityOverlayKey(chapterCardId, role, characterId)
    );

  const resolveContinuityFileTarget = (
    index: LongWorkspaceIndexSnapshot,
    chapterCardId: string,
    role: LongContinuityFileRole,
    characterId: string | null
  ): {
    chapterTitle: string;
    characterName: string | null;
    file: LongWorkspaceFileReference;
    overlay?: {
      content: string;
      pendingCreation: boolean;
    };
  } => {
    const chapterCard = index.plot.chapterCards.find(
      ({ id }) => id === chapterCardId
    );
    const chapter = index.chapters.find(
      (candidate) => candidate.chapterCardId === chapterCardId
    );
    if (!chapterCard || !chapter) {
      throw new Error(`Chapter ${chapterCardId} does not exist.`);
    }
    const characterRole =
      role === "character_current_state" || role === "character_history";
    if (characterRole !== (characterId !== null)) {
      throw new Error(
        "Character continuity documents require exactly one character_id."
      );
    }
    if (
      pendingDeletedContinuityKeys.has(
        continuityOverlayKey(chapterCardId, role, characterId)
      )
    ) {
      throw new Error(
        `${CONTINUITY_DOCUMENT_TITLES[role]} is pending deletion for this chapter.`
      );
    }
    const overlay = findContinuityOverlay(
      chapterCardId,
      role,
      characterId
    );
    let file: LongWorkspaceFileReference | null = null;
    if (role === "chapter_end_state") file = chapter.characterState;
    else if (role === "handoff") file = chapter.handoff;
    else if (role === "foreshadowing_changes") {
      file = chapter.foreshadowingChanges;
    } else if (role === "world_reveals") {
      file = chapter.worldReveals;
    } else {
      const character = chapter.characterContinuity.find(
        (candidate) => candidate.characterId === characterId
      );
      file =
        role === "character_current_state"
          ? character?.currentState ?? null
          : character?.history ?? null;
    }
    file = overlay?.file ?? file;
    if (!file) {
      const label = CONTINUITY_DOCUMENT_TITLES[role];
      throw new Error(
        `${label} does not exist for this chapter. Create it before writing.`
      );
    }
    return {
      chapterTitle: chapterCard.title,
      characterName:
        characterId === null
          ? null
          : index.characters.find(({ id }) => id === characterId)?.name ??
            characterId,
      file,
      ...(overlay
        ? {
            overlay: {
              content: overlay.content,
              pendingCreation: overlay.pendingCreation
            }
          }
        : {})
    };
  };

  const continuityTargetFromParameter = (
    target: Static<typeof continuityFileTargetParameter>
  ): { role: LongContinuityFileRole; characterId: string | null } => ({
    role: target.document,
    characterId:
      "character_id" in target ? target.character_id : null
  });

  const chapterForeshadowingCandidates = (
    index: LongWorkspaceIndexSnapshot,
    chapterCardId: string
  ) => {
    const placementById = new Map(
      index.plot.narrativePlacements.map((placement) => [
        placement.id,
        placement
      ])
    );
    return index.plot.foreshadowing.flatMap((thread) =>
      thread.beats.flatMap((beat) => {
        const placement =
          beat.placementId === null
            ? undefined
            : placementById.get(beat.placementId);
        if (
          (beat.chapterCardId ?? placement?.chapterCardId ?? null) !==
          chapterCardId
        ) {
          return [];
        }
        return [{ thread, beat, placement }];
      })
    );
  };

  const continuityDocumentTitle = (
    chapterTitle: string,
    role: LongContinuityFileRole,
    characterName: string | null
  ) =>
    `${chapterTitle} / ${
      characterName ? `${characterName} / ` : ""
    }${CONTINUITY_DOCUMENT_TITLES[role]}`;

  if (
    capabilities.has("query_structure") &&
    readableRoots.has("continuity_ledger")
  ) {
    tools.push(
      defineTool({
        name: "list_continuity_files",
        label: "列出连续性文件",
        description:
          "按章节列出连续性文本文件，并列出本章在伏笔总览中已规划的伏笔触点候选。伏笔候选给出 foreshadowing_id 与 beat_id；没有候选且没有历史内容时不显示伏笔变化文件。同时给出全部已有正文、尚未记录章节的追记建议：前文 brief，叙事顺序最后一张 full。不暴露路径、fileId 或版本信息。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index } = await loadIndex(signal);
          const ordered = orderedLongChapterCards(index).filter(
            (chapter) =>
              !params.chapter_card_id || chapter.id === params.chapter_card_id
          );
          if (params.chapter_card_id && ordered.length === 0) {
            throw new Error(
              `Chapter ${params.chapter_card_id} does not exist.`
            );
          }
          const page = params.page ?? 1;
          const limit = params.limit ?? 50;
          const start = (page - 1) * limit;
          const items = ordered.slice(start, start + limit).map((card) => {
            const chapter = index.chapters.find(
              ({ chapterCardId }) => chapterCardId === card.id
            );
            if (!chapter) {
              throw new Error(`Chapter files are missing for ${card.id}.`);
            }
            const describe = (
              role: LongContinuityFileRole,
              file: LongWorkspaceFileReference | null,
              characterId: string | null = null
            ) => {
              const pendingDeletion = pendingDeletedContinuityKeys.has(
                continuityOverlayKey(card.id, role, characterId)
              );
              const overlay = findContinuityOverlay(
                card.id,
                role,
                characterId
              );
              const visibleFile = pendingDeletion
                ? null
                : overlay?.file ?? file;
              return {
                document: role,
                ...(characterId ? { character_id: characterId } : {}),
                exists: visibleFile !== null,
                status:
                  pendingDeletion
                    ? "pending_deletion"
                    : visibleFile === null
                      ? "not_created"
                      : overlay
                        ? overlay.content.trim()
                          ? "written"
                          : "empty"
                        : visibleFile.revision === EMPTY_LONG_MARKDOWN_REVISION
                          ? "empty"
                          : "written"
              };
            };
            const characterIds = new Set(
              chapter.characterContinuity.map(({ characterId }) => characterId)
            );
            for (const overlay of continuityDocumentOverlay.values()) {
              if (
                overlay.chapterCardId === card.id &&
                overlay.characterId !== null
              ) {
                characterIds.add(overlay.characterId);
              }
            }
            const characterFiles = [...characterIds]
              .sort((left, right) => left.localeCompare(right))
              .flatMap((characterId) => {
                const character = chapter.characterContinuity.find(
                  (candidate) => candidate.characterId === characterId
                );
                return [
                  describe(
                    "character_current_state",
                    character?.currentState ?? null,
                    characterId
                  ),
                  describe(
                    "character_history",
                    character?.history ?? null,
                    characterId
                  )
                ];
              });
            const foreshadowingCandidates =
              chapterForeshadowingCandidates(index, card.id);
            const foreshadowingFile = describe(
              "foreshadowing_changes",
              chapter.foreshadowingChanges
            );
            const showForeshadowingFile =
              foreshadowingCandidates.length > 0 ||
              foreshadowingFile.status === "written" ||
              foreshadowingFile.status === "pending_deletion";
            return {
              chapter_card_id: card.id,
              title: card.title,
              narrative_order: card.narrativeOrder,
              commit_status: chapter.commitId ? "committed" : "uncommitted",
              active: workspace.activeChapterCardId === card.id,
              files: [
                describe("chapter_end_state", chapter.characterState),
                describe("handoff", chapter.handoff),
                ...(showForeshadowingFile ? [foreshadowingFile] : []),
                describe("world_reveals", chapter.worldReveals),
                ...characterFiles
              ],
              foreshadowing_touchpoint_candidates:
                foreshadowingCandidates.map(
                  ({ thread, beat, placement }) => ({
                    foreshadowing_id: thread.id,
                    foreshadowing_title: thread.title,
                    foreshadowing_status: thread.status,
                    core_question: thread.coreQuestion,
                    hidden_truth: thread.hiddenTruth ?? null,
                    planned_span: thread.plannedSpan ?? null,
                    truth_event_id: thread.truthEventId,
                    expected_reader_effect: thread.expectedReaderEffect,
                    beat_id: beat.id,
                    beat_type: beat.type,
                    beat_status: beat.status,
                    planned_scope: beat.plannedScope,
                    note: beat.note,
                    event_id: beat.eventId,
                    placement_id: beat.placementId,
                    chapter_card_id:
                      beat.chapterCardId ?? placement?.chapterCardId ?? null
                  })
                )
            };
          });
          const pendingCatchup = orderedLongChapterCards(index).flatMap(
            (card) => {
              const chapter = index.chapters.find(
                ({ chapterCardId }) => chapterCardId === card.id
              );
              if (
                !chapter ||
                chapter.commitId ||
                chapter.bodyStatus !== "written"
              ) {
                return [];
              }
              return [
                {
                  chapter_card_id: card.id,
                  title: card.title
                }
              ];
            }
          );
          return textResult(
            JSON.stringify(
              {
                page,
                limit,
                total: ordered.length,
                items,
                next_page:
                  start + items.length < ordered.length ? page + 1 : null,
                pending_catchup: pendingCatchup.map((item, itemIndex) => ({
                  ...item,
                  suggested_record:
                    itemIndex === pendingCatchup.length - 1 ? "full" : "brief"
                }))
              },
              null,
              2
            )
          );
        }
      }),
      defineTool({
        name: "read_continuity_file",
        label: "读取连续性文件",
        description:
          "按 chapter_card_id 和文本种类读取一份连续性文件。人物文件还需 character_id。mode=full 会建立后续覆盖或局部编辑所需的完整读取凭据。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          target: continuityFileTargetParameter,
          mode: Type.Optional(worldbuildingReadModeParameter)
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const chapterCardId =
            params.chapter_card_id ?? workspace.activeChapterCardId;
          if (!chapterCardId) {
            throw new Error(
              "A chapter_card_id is required when no chapter is active."
            );
          }
          const { role, characterId } = continuityTargetFromParameter(
            params.target
          );
          const target = resolveContinuityFileTarget(
            index,
            chapterCardId,
            role,
            characterId
          );
          const result = target.overlay
            ? { content: target.overlay.content, file: target.file }
            : await readWholeChapterBody(
                target.file,
                index.revision,
                projectRevision,
                signal
              );
          const mode = params.mode ?? "full";
          if (mode === "full") {
            fullyReadContinuityDocuments.set(result.file.id, {
              content: result.content,
              file: result.file,
              workspaceRevision: index.revision,
              projectRevision
            });
          }
          const previewLimit = 32_768;
          return textResult(
            JSON.stringify(
              {
                chapter_card_id: chapterCardId,
                title: continuityDocumentTitle(
                  target.chapterTitle,
                  role,
                  target.characterName
                ),
                document: role,
                ...(characterId ? { character_id: characterId } : {}),
                mode,
                content:
                  mode === "full"
                    ? result.content
                    : result.content.slice(0, previewLimit),
                truncated:
                  mode === "preview" && result.content.length > previewLimit
              },
              null,
              2
            )
          );
        }
      })
    );
  }

  if (
    isContinuityLedgerAgent &&
    capabilities.has("commit_ledger") &&
    writableRoots.has("continuity_ledger")
  ) {
    const continuityProposalResult = (
      batch: LongWorkspaceOperationBatch,
      projectRevision: number,
      summary: string,
      files: LongContinuityFileChange[]
    ) =>
      textResult(
        longProposalResultSummary(
          input,
          "已形成连续性文本文件提案，等待客户端审阅与冲突检查。"
        ),
        {
          kind: "long-continuity-file-proposal" as const,
          bookId: workspace.bookId,
          agentId: profile.id,
          batch,
          baseProjectRevision: projectRevision,
          summary,
          files
        }
      );

    tools.push(
      defineTool({
        name: "create_continuity_file",
        label: "创建连续性文件",
        description:
          "为指定或当前未记录章创建可选世界观揭露文件，或为一名涉及人物同时创建当前状态与历史轨迹两份空白文件。未选中章卡时必须提供 chapter_card_id。人物历史轨迹应读取上一份已提交记录并累积到本章。章末状态和接续包随章卡存在；伏笔变化不通过本工具创建，只在 list_continuity_files 返回既有触点候选时写入，没有候选时不产生记录。创建后再用 write_continuity_file 写入文本。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          target: continuityCreateTargetParameter,
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const {
            index,
            projectRevision,
            activeChapterCardId,
            chapter
          } = await loadActiveChapterMutationContext(
            signal,
            params.chapter_card_id
          );
          const chapterCard = index.plot.chapterCards.find(
            ({ id }) => id === activeChapterCardId
          )!;
          const timestamp = new Date().toISOString();
          const changes: LongContinuityFileChange[] = [];
          let operation: LongWorkspaceOperation;
          let summary: string;

          if (params.target.document === "world_reveals") {
            if (
              chapter.worldReveals ||
              findContinuityOverlay(
                activeChapterCardId,
                "world_reveals",
                null
              )
            ) {
              throw new Error(
                "The active chapter already has a world-reveals file."
              );
            }
            const file = createEmptyLongMarkdownFileReference(
              longChapterWorldRevealsFileId(activeChapterCardId),
              longChapterContinuityFilePath(
                activeChapterCardId,
                "world-reveals.md"
              ),
              timestamp
            );
            operation = {
              type: "chapterContinuity.worldReveals.create",
              chapterCardId: activeChapterCardId,
              file
            };
            summary =
              params.summary?.trim() ||
              `创建《${chapterCard.title}》世界观揭露文件`;
            changes.push({
              chapterCardId: activeChapterCardId,
              role: "world_reveals",
              characterId: null,
              fileId: file.id,
              filePath: file.path,
              title: continuityDocumentTitle(
                chapterCard.title,
                "world_reveals",
                null
              ),
              operation: "create",
              beforeText: "",
              afterText: "",
              beforeRevision: null,
              nextRevision: file.revision
            });
            continuityDocumentOverlay.set(file.id, {
              chapterCardId: activeChapterCardId,
              chapterTitle: chapterCard.title,
              role: "world_reveals",
              characterId: null,
              characterName: null,
              file,
              content: "",
              pendingCreation: true
            });
          } else {
            if (!("character_id" in params.target)) {
              throw new Error(
                "Character continuity creation requires character_id."
              );
            }
            const characterId = params.target.character_id;
            const character = index.characters.find(
              ({ id }) => id === characterId
            );
            if (!character) {
              throw new Error(
                `Character ${characterId} does not exist.`
              );
            }
            if (
              chapter.characterContinuity.some(
                ({ characterId }) =>
                  characterId === character.id
              ) ||
              findContinuityOverlay(
                activeChapterCardId,
                "character_current_state",
                character.id
              )
            ) {
              throw new Error(
                "The active chapter already has continuity files for this character."
              );
            }
            const currentState = createEmptyLongMarkdownFileReference(
              longChapterCharacterCurrentStateFileId(
                activeChapterCardId,
                character.id
              ),
              longChapterCharacterContinuityFilePath(
                activeChapterCardId,
                character.id,
                "current-state.md"
              ),
              timestamp
            );
            const history = createEmptyLongMarkdownFileReference(
              longChapterCharacterHistoryFileId(
                activeChapterCardId,
                character.id
              ),
              longChapterCharacterContinuityFilePath(
                activeChapterCardId,
                character.id,
                "history.md"
              ),
              timestamp
            );
            operation = {
              type: "chapterContinuity.character.create",
              chapterCardId: activeChapterCardId,
              characterId: character.id,
              currentState,
              history
            };
            summary =
              params.summary?.trim() ||
              `创建《${chapterCard.title}》中${character.name}的人物连续性文件`;
            for (const [role, file] of [
              ["character_current_state", currentState],
              ["character_history", history]
            ] as const) {
              changes.push({
                chapterCardId: activeChapterCardId,
                role,
                characterId: character.id,
                fileId: file.id,
                filePath: file.path,
                title: continuityDocumentTitle(
                  chapterCard.title,
                  role,
                  character.name
                ),
                operation: "create",
                beforeText: "",
                afterText: "",
                beforeRevision: null,
                nextRevision: file.revision
              });
              continuityDocumentOverlay.set(file.id, {
                chapterCardId: activeChapterCardId,
                chapterTitle: chapterCard.title,
                role,
                characterId: character.id,
                characterName: character.name,
                file,
                content: "",
                pendingCreation: true
              });
            }
          }

          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [operation],
            documentWrites: changes.map((change, changeIndex) => ({
              proposalId: `proposal_${stableHash(
                `${workspace.bookId}:${input.runId}:${toolCallId}:create:${changeIndex}`
              ).slice(0, 24)}`,
              fileId: change.fileId,
              content: "",
              mode: "create" as const,
              expectedRevision: null,
              nextRevision: change.nextRevision,
              updatedAt: timestamp,
              reason: summary
            }))
          });
          return continuityProposalResult(
            batch,
            projectRevision,
            summary,
            changes
          );
        }
      }),
      defineTool({
        name: "delete_continuity_file",
        label: "删除可选连续性文件",
        description:
          "仅用于误创建或已不再适用的可选文件：删除指定或当前未提交章节的世界观揭露，或按人物成对删除当前状态与历史轨迹。未选中章卡时必须提供 chapter_card_id。不能删除正文、章末状态、接续包或伏笔变化，也不能删除已提交章节中的任何文件。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          target: continuityCreateTargetParameter,
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, params, signal) => {
          const {
            index,
            projectRevision,
            activeChapterCardId
          } = await loadActiveChapterMutationContext(
            signal,
            params.chapter_card_id
          );
          let operation: LongWorkspaceOperation;
          let summary: string;
          let verifiedPendingDependency = false;
          const deletedKeys: string[] = [];
          if (params.target.document === "world_reveals") {
            const target = resolveContinuityFileTarget(
              index,
              activeChapterCardId,
              "world_reveals",
              null
            );
            operation = {
              type: "chapterContinuity.worldReveals.delete",
              chapterCardId: activeChapterCardId
            };
            summary =
              params.summary?.trim() ||
              `删除《${target.chapterTitle}》误创建或不再适用的世界观揭露文件`;
            verifiedPendingDependency =
              target.overlay?.pendingCreation === true;
            deletedKeys.push(
              continuityOverlayKey(
                activeChapterCardId,
                "world_reveals",
                null
              )
            );
          } else {
            if (!("character_id" in params.target)) {
              throw new Error(
                "Character continuity deletion requires character_id."
              );
            }
            const characterId = params.target.character_id;
            const currentState = resolveContinuityFileTarget(
              index,
              activeChapterCardId,
              "character_current_state",
              characterId
            );
            const history = resolveContinuityFileTarget(
              index,
              activeChapterCardId,
              "character_history",
              characterId
            );
            operation = {
              type: "chapterContinuity.character.delete",
              chapterCardId: activeChapterCardId,
              characterId
            };
            summary =
              params.summary?.trim() ||
              `成对删除《${currentState.chapterTitle}》中${
                currentState.characterName ?? characterId
              }误创建或不再适用的当前状态与历史轨迹`;
            verifiedPendingDependency =
              currentState.overlay?.pendingCreation === true &&
              history.overlay?.pendingCreation === true;
            deletedKeys.push(
              continuityOverlayKey(
                activeChapterCardId,
                "character_current_state",
                characterId
              ),
              continuityOverlayKey(
                activeChapterCardId,
                "character_history",
                characterId
              )
            );
          }
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: new Date().toISOString(),
            operations: [operation],
            documentWrites: []
          });
          const proposal = formLongMutationProposal({
            index,
            batch,
            projectRevision,
            summary,
            message:
              "已形成可选连续性文件删除提案，等待客户端审阅与冲突检查。",
            verifiedPendingDependency
          });
          if (proposal.details?.kind !== "long-mutation-proposal") {
            return proposal;
          }
          deletedKeys.forEach((key) =>
            pendingDeletedContinuityKeys.add(key)
          );
          return proposal;
        }
      }),
      defineTool({
        name: "write_continuity_file",
        label: "写入连续性文件",
        description:
          "向指定或当前未记录章的一份连续性文件写入完整文本。未选中章卡时必须提供 chapter_card_id。空文件可直接写入；已有正文必须先用 read_continuity_file mode=full 完整读取，并明确 allow_overwrite_existing=true。局部修改应使用 edit_continuity_file。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          target: continuityFileTargetParameter,
          text: Type.String({ minLength: 1, maxLength: 1_000_000 }),
          allow_overwrite_existing: Type.Optional(Type.Literal(true)),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          if (!params.text.trim()) {
            throw new Error("Continuity file text must be non-empty.");
          }
          const {
            index,
            projectRevision,
            activeChapterCardId
          } = await loadActiveChapterMutationContext(
            signal,
            params.chapter_card_id
          );
          const { role, characterId } = continuityTargetFromParameter(
            params.target
          );
          if (
            role === "foreshadowing_changes" &&
            chapterForeshadowingCandidates(
              index,
              activeChapterCardId
            ).length === 0
          ) {
            throw new Error(
              "本章没有关联伏笔总览中的既有触点，不能新增伏笔变化记录。未规划线索只能在对话中提示用户返回剧情设计处理。"
            );
          }
          const target = resolveContinuityFileTarget(
            index,
            activeChapterCardId,
            role,
            characterId
          );
          const live = target.overlay
            ? { content: target.overlay.content, file: target.file }
            : await readWholeChapterBody(
                target.file,
                index.revision,
                projectRevision,
                signal
              );
          const evidence = fullyReadContinuityDocuments.get(live.file.id);
          if (live.content.trim() && !evidence) {
            return textResult(
              "未写入：目标已有正文，请先调用 read_continuity_file（mode=full）完整读取。"
            );
          }
          if (
            live.content.trim() &&
            params.allow_overwrite_existing !== true
          ) {
            return textResult(
              "未写入：目标已有正文；局部修改请使用 edit_continuity_file，整体重写需设置 allow_overwrite_existing=true。"
            );
          }
          if (
            evidence &&
            (evidence.file.revision !== live.file.revision ||
              evidence.workspaceRevision !== index.revision ||
              evidence.projectRevision !== projectRevision ||
              evidence.content !== live.content)
          ) {
            throw new Error(
              "Continuity document changed after it was read."
            );
          }
          const timestamp = new Date().toISOString();
          const nextRevision = nextContentRevision(
            live.file.revision,
            params.text
          );
          const summary =
            params.summary?.trim() ||
            `写入${continuityDocumentTitle(
              target.chapterTitle,
              role,
              target.characterName
            )}`;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [
              {
                proposalId: `proposal_${stableHash(
                  `${workspace.bookId}:${input.runId}:${toolCallId}`
                ).slice(0, 24)}`,
                fileId: live.file.id,
                content: params.text,
                mode: "replace",
                expectedRevision: live.file.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }
            ]
          });
          const nextFile = {
            ...live.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          continuityDocumentOverlay.set(live.file.id, {
            chapterCardId: activeChapterCardId,
            chapterTitle: target.chapterTitle,
            role,
            characterId,
            characterName: target.characterName,
            file: nextFile,
            content: params.text,
            pendingCreation: target.overlay?.pendingCreation ?? false
          });
          fullyReadContinuityDocuments.set(live.file.id, {
            content: params.text,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return continuityProposalResult(
            batch,
            projectRevision,
            summary,
            [
              {
                chapterCardId: activeChapterCardId,
                role,
                characterId,
                fileId: live.file.id,
                filePath: live.file.path,
                title: continuityDocumentTitle(
                  target.chapterTitle,
                  role,
                  target.characterName
                ),
                operation: "write",
                beforeText: live.content,
                afterText: params.text,
                beforeRevision: live.file.revision,
                nextRevision
              }
            ]
          );
        }
      }),
      defineTool({
        name: "edit_continuity_file",
        label: "编辑连续性文件",
        description:
          "在已用 read_continuity_file mode=full 完整读取的指定或当前未记录章连续性文件中按原文片段精确替换。未选中章卡时必须提供 chapter_card_id。每个 original_text 必须唯一存在。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          target: continuityFileTargetParameter,
          replacements: Type.Array(
            strictObject({
              original_text: Type.String({ minLength: 1, maxLength: 200_000 }),
              new_text: Type.String({ maxLength: 200_000 })
            }),
            { minItems: 1, maxItems: 100 }
          ),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const {
            index,
            projectRevision,
            activeChapterCardId
          } = await loadActiveChapterMutationContext(
            signal,
            params.chapter_card_id
          );
          const { role, characterId } = continuityTargetFromParameter(
            params.target
          );
          if (
            role === "foreshadowing_changes" &&
            chapterForeshadowingCandidates(
              index,
              activeChapterCardId
            ).length === 0
          ) {
            throw new Error(
              "本章没有关联伏笔总览中的既有触点，不能新增伏笔变化记录。未规划线索只能在对话中提示用户返回剧情设计处理。"
            );
          }
          const target = resolveContinuityFileTarget(
            index,
            activeChapterCardId,
            role,
            characterId
          );
          const evidence = fullyReadContinuityDocuments.get(target.file.id);
          if (
            !evidence ||
            evidence.workspaceRevision !== index.revision ||
            evidence.projectRevision !== projectRevision ||
            evidence.file.revision !== target.file.revision
          ) {
            return textResult(
              "未编辑：请先调用 read_continuity_file（mode=full）完整读取目标内容。"
            );
          }
          let content = evidence.content;
          for (const replacement of params.replacements) {
            const first = content.indexOf(replacement.original_text);
            const second =
              first < 0
                ? -1
                : content.indexOf(
                    replacement.original_text,
                    first + replacement.original_text.length
                  );
            if (first < 0 || second >= 0) {
              return textResult(
                `未替换：原文片段必须唯一存在：${replacement.original_text.slice(0, 80)}`
              );
            }
            content =
              content.slice(0, first) +
              replacement.new_text +
              content.slice(first + replacement.original_text.length);
          }
          if (!content.trim()) {
            throw new Error("Continuity edits cannot clear the whole file.");
          }
          const timestamp = new Date().toISOString();
          const nextRevision = nextContentRevision(
            evidence.file.revision,
            content
          );
          const summary =
            params.summary?.trim() ||
            `编辑${continuityDocumentTitle(
              target.chapterTitle,
              role,
              target.characterName
            )}`;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [
              {
                proposalId: `proposal_${stableHash(
                  `${workspace.bookId}:${input.runId}:${toolCallId}`
                ).slice(0, 24)}`,
                fileId: evidence.file.id,
                content,
                mode: "replace",
                expectedRevision: evidence.file.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }
            ]
          });
          const nextFile = {
            ...evidence.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          continuityDocumentOverlay.set(evidence.file.id, {
            chapterCardId: activeChapterCardId,
            chapterTitle: target.chapterTitle,
            role,
            characterId,
            characterName: target.characterName,
            file: nextFile,
            content,
            pendingCreation: target.overlay?.pendingCreation ?? false
          });
          fullyReadContinuityDocuments.set(evidence.file.id, {
            content,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return continuityProposalResult(
            batch,
            projectRevision,
            summary,
            [
              {
                chapterCardId: activeChapterCardId,
                role,
                characterId,
                fileId: evidence.file.id,
                filePath: evidence.file.path,
                title: continuityDocumentTitle(
                  target.chapterTitle,
                  role,
                  target.characterName
                ),
                operation: "edit",
                beforeText: evidence.content,
                afterText: content,
                beforeRevision: evidence.file.revision,
                nextRevision
              }
            ]
          );
        }
      }),
      defineTool({
        name: "propose_continuity_commit",
        label: "保存连续性记录",
        description:
          "为指定或当前已有正文、尚未记录的章节登记连续性记录。未选中章卡时必须提供 chapter_card_id。记录不要求前文章节已经归档，也不会锁定正文或剧情结构。必须逐项提交本章伏笔总览候选触点的结果和正文证据；没有候选时传空数组且不写伏笔变化文件。多章追记时前文可只交章末状态与接续包，最后一张交完整账本。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          summary: Type.String({ minLength: 1, maxLength: 1_000 }),
          foreshadowing_touchpoint_decisions: Type.Array(
            strictObject({
              foreshadowing_id: stableIdParameter("foreshadow"),
              beat_id: stableIdParameter("beat"),
              status: literalUnion(["committed", "missed"] as const),
              evidence: Type.String({ minLength: 1, maxLength: 4_000 })
            }),
            { maxItems: 100_000 }
          )
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, params, signal) => {
          const {
            index,
            projectRevision,
            activeChapterCardId,
            chapter
          } = await loadActiveChapterMutationContext(
            signal,
            params.chapter_card_id
          );
          if (chapter.bodyStatus !== "written") {
            throw new Error(
              "Only a chapter with saved body text can receive a continuity record."
            );
          }
          const summary = params.summary.trim();
          if (!summary) {
            throw new Error("Continuity commit summary must be non-empty.");
          }
          const foreshadowingCandidates =
            chapterForeshadowingCandidates(
              index,
              activeChapterCardId
            );
          const candidateByBeatId = new Map(
            foreshadowingCandidates.map((candidate) => [
              candidate.beat.id,
              candidate
            ])
          );
          const receivedBeatIds = new Set<string>();
          for (const decision of params.foreshadowing_touchpoint_decisions) {
            if (receivedBeatIds.has(decision.beat_id)) {
              throw new Error(
                `伏笔触点 ${decision.beat_id} 不能重复提交决策。`
              );
            }
            receivedBeatIds.add(decision.beat_id);
            const candidate = candidateByBeatId.get(decision.beat_id);
            if (!candidate) {
              throw new Error(
                `伏笔触点 ${decision.beat_id} 不属于当前章节的既有候选。`
              );
            }
            if (candidate.thread.id !== decision.foreshadowing_id) {
              throw new Error(
                `伏笔触点 ${decision.beat_id} 不属于伏笔线 ${decision.foreshadowing_id}。`
              );
            }
          }
          if (
            receivedBeatIds.size !== candidateByBeatId.size ||
            [...candidateByBeatId.keys()].some(
              (beatId) => !receivedBeatIds.has(beatId)
            )
          ) {
            throw new Error(
              "伏笔触点决策必须完整覆盖本章在伏笔总览中的既有候选，且不能包含其他触点。"
            );
          }
          const bodyOverlay = chapterBodyOverlay.get(chapter.body.id);
          const previouslyReadBody = readChapterBodySnapshots.get(
            chapter.body.id
          );
          const body = bodyOverlay
            ? { content: bodyOverlay.content, file: bodyOverlay.file }
            : await readWholeChapterBody(
                chapter.body,
                index.revision,
                projectRevision,
                signal
              );
          if (
            previouslyReadBody &&
            (previouslyReadBody.file.revision !== body.file.revision ||
              previouslyReadBody.content !== body.content)
          ) {
            throw new Error(
              "The chapter body changed after continuity analysis started."
            );
          }

          const targets: Array<{
            role: LongContinuityFileRole;
            characterId: string | null;
          }> = [
            { role: "chapter_end_state", characterId: null },
            { role: "handoff", characterId: null },
            ...(foreshadowingCandidates.length > 0
              ? [
                  {
                    role: "foreshadowing_changes" as const,
                    characterId: null
                  }
                ]
              : [])
          ];
          if (
            !pendingDeletedContinuityKeys.has(
              continuityOverlayKey(
                activeChapterCardId,
                "world_reveals",
                null
              )
            ) &&
            (chapter.worldReveals ||
              findContinuityOverlay(
                activeChapterCardId,
                "world_reveals",
                null
              ))
          ) {
            targets.push({ role: "world_reveals", characterId: null });
          }
          const characterIds = new Set(
            chapter.characterContinuity.flatMap(({ characterId }) =>
              pendingDeletedContinuityKeys.has(
                continuityOverlayKey(
                  activeChapterCardId,
                  "character_current_state",
                  characterId
                )
              )
                ? []
                : [characterId]
            )
          );
          for (const overlay of continuityDocumentOverlay.values()) {
            if (
              overlay.chapterCardId === activeChapterCardId &&
              overlay.characterId !== null &&
              !pendingDeletedContinuityKeys.has(
                continuityOverlayKey(
                  activeChapterCardId,
                  "character_current_state",
                  overlay.characterId
                )
              )
            ) {
              characterIds.add(overlay.characterId);
            }
          }
          for (const characterId of [...characterIds].sort((left, right) =>
            left.localeCompare(right)
          )) {
            targets.push(
              { role: "character_current_state", characterId },
              { role: "character_history", characterId }
            );
          }

          const continuityFiles: Array<{
            role: LongContinuityFileRole;
            characterId: string | null;
            content: string;
            file: LongWorkspaceFileReference;
          }> = [];
          for (const item of targets) {
            const target = resolveContinuityFileTarget(
              index,
              activeChapterCardId,
              item.role,
              item.characterId
            );
            const live = target.overlay
              ? { content: target.overlay.content, file: target.file }
              : await readWholeChapterBody(
                  target.file,
                  index.revision,
                  projectRevision,
                  signal
                );
            continuityFiles.push({ ...item, ...live });
          }

          const missing = [
            ...(body.content.trim() ? [] : ["正文"]),
            ...continuityFiles.flatMap((file) =>
              file.content.trim()
                ? []
                : [
                    file.characterId
                      ? `${file.characterId} / ${CONTINUITY_DOCUMENT_TITLES[file.role]}`
                      : CONTINUITY_DOCUMENT_TITLES[file.role]
                  ]
            )
          ];
          if (missing.length > 0) {
            return textResult(
              `未登记归档：以下文本尚为空：${missing.join("、")}。`
            );
          }

          const commitInput = LongCommitChapterInputSchema.parse({
            mode: "text_files",
            bookId: workspace.bookId,
            chapterCardId: activeChapterCardId,
            chapterFileRevisions: { body: body.file.revision },
            continuityFileRevisions: continuityFiles.map(({ file }) => ({
              fileId: file.id,
              revision: file.revision
            })),
            foreshadowingBeatDecisions: Object.fromEntries(
              params.foreshadowing_touchpoint_decisions.map(
                (decision) => [
                  decision.beat_id,
                  {
                    status: decision.status,
                    note: decision.evidence.trim()
                  }
                ]
              )
            ),
            commitMessage: summary,
            baseWorkspaceRevision: index.revision,
            baseProjectRevision: projectRevision
          });
          return textResult(
            longProposalResultSummary(
              input,
              `仅已登记《${
                index.plot.chapterCards.find(
                  ({ id }) => id === activeChapterCardId
                )?.title ?? activeChapterCardId
              }》连续性记录请求（${continuityFiles.length} 份连续性文件），当前尚未保存。客户端将在文件卡全部获批后尝试保存记录。`
            ),
            {
              kind: "long-ledger-commit-proposal",
              bookId: workspace.bookId,
              agentId: profile.id,
              input: commitInput,
              summary
            }
          );
        }
      })
    );
  }
  return tools;
}
