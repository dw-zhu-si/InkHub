import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  LongGetWorkspaceIndexCommandEnvelopeSchema,
  LongReadDocumentCommandEnvelopeSchema,
  LongReadDocumentResultSchema,
  LongWorkspaceIndexResultSchema,
  createEnvelope,
  type LongChapterReadiness,
  type LongContinuityFileRole,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import {
  preflightLongMutationProposal,
  requireAccepted,
  requireExecutor,
  textResult,
  throwIfAborted
} from "./shared";
import { classifyLongChapterReadiness } from "./dispatch";
import type {
  BuildLongWorkspaceToolsInput,
  LongAgentToolDetails,
  LongQueryCommandEnvelope
} from "./index";

/** mode=full 读取后建立的完整文档凭据，供同轮 write/edit 校验修订版本。 */
export interface FullyReadDocumentEntry {
  content: string;
  file: LongWorkspaceFileReference;
  workspaceRevision: number;
  projectRevision: number;
}

export function longProposalResultSummary(
  input: BuildLongWorkspaceToolsInput,
  pendingSummary: string
): string {
  return input.writeApprovalMode === "auto-approve"
    ? pendingSummary.replace(
        /等待客户端审阅(?:与冲突检查)?。$/,
        "已提交实时自动保存队列；以审批卡的落盘状态为准。"
      )
    : pendingSummary;
}

export function createLongToolContext(input: BuildLongWorkspaceToolsInput) {
  const { workspace, profile } = input;
  if (
    profile.workspaceType !== "long" ||
    profile.id !== workspace.activeAgentId
  ) {
    throw new Error("Long agent profile does not match the active workspace agent.");
  }

  const readableRoots = new Set(profile.readAccess.workspaceRoots);
  const writableRoots = new Set(profile.writeAccess.workspaceRoots);
  const capabilities = new Set(profile.writeAccess.capabilities);
  const isSettingAgent = profile.id === "setting";
  const isPlotDesignAgent = profile.id === "plot_design";
  const isDraftWritingAgent = profile.id === "draft";
  const isContinuityLedgerAgent = profile.id === "continuity_ledger";

  let indexPromise:
    | Promise<{
        index: LongWorkspaceIndexSnapshot;
        projectRevision: number;
      }>
    | undefined;

  const execute = async (
    command: LongQueryCommandEnvelope,
    signal?: AbortSignal
  ): Promise<unknown> => {
    throwIfAborted(signal);
    const result = await requireExecutor(input.executor)(command, signal);
    throwIfAborted(signal);
    return requireAccepted(result);
  };

  const loadIndex = async (
    signal?: AbortSignal
  ): Promise<{
    index: LongWorkspaceIndexSnapshot;
    projectRevision: number;
  }> => {
    if (!indexPromise) {
      const command = LongGetWorkspaceIndexCommandEnvelopeSchema.parse(
        createEnvelope(
          "long.getWorkspaceIndex",
          { bookId: workspace.bookId },
          {
            id: `long-query-${input.runId}-index`,
            context: {
              sessionId: input.sessionId,
              runId: input.runId,
              resourceId: workspace.bookId
            }
          }
        )
      );
      indexPromise = execute(command, signal)
        .then((payload) => LongWorkspaceIndexResultSchema.parse(payload))
        .then((result) => {
          if (result.bookId !== workspace.bookId) {
            throw new Error("Core returned a workspace index for another book.");
          }
          return {
            index: result.workspaceIndex,
            projectRevision: result.projectRevision
          };
        })
        .catch((error) => {
          indexPromise = undefined;
          throw error;
        });
    }
    const value = await indexPromise;
    throwIfAborted(signal);
    return value;
  };

  const formLongMutationProposal = (inputProposal: {
    index: LongWorkspaceIndexSnapshot;
    batch: LongWorkspaceOperationBatch;
    projectRevision: number;
    summary: string;
    message: string;
    plain?: boolean;
    verifiedPendingDependency?: boolean;
  }): AgentToolResult<LongAgentToolDetails> => {
    const preflightFailure = inputProposal.verifiedPendingDependency
      ? undefined
      : preflightLongMutationProposal(
          inputProposal.index,
          inputProposal.batch
        );
    if (preflightFailure) return preflightFailure;
    return textResult(
      inputProposal.plain
        ? inputProposal.message
        : longProposalResultSummary(input, inputProposal.message),
      {
        kind: "long-mutation-proposal",
        bookId: workspace.bookId,
        agentId: profile.id,
        batch: inputProposal.batch,
        baseProjectRevision: inputProposal.projectRevision,
        summary: inputProposal.summary
      }
    );
  };

  const loadActiveChapterMutationContext = async (
    signal?: AbortSignal,
    chapterCardId?: string
  ): Promise<{
    index: LongWorkspaceIndexSnapshot;
    projectRevision: number;
    activeChapterCardId: string;
    chapter: LongWorkspaceIndexSnapshot["chapters"][number];
  }> => {
    const { index, projectRevision } = await loadIndex(signal);
    const activeChapterCardId =
      chapterCardId ?? workspace.activeChapterCardId;
    if (!activeChapterCardId) {
      throw new Error(
        "需要指定 chapter_card_id，或先选中一张待记录章卡。"
      );
    }
    if (
      workspace.navigation.bookId !== index.bookId ||
      workspace.workspaceRevision !== index.revision ||
      workspace.navigation.revision !== index.revision ||
      workspace.projectRevision !== projectRevision ||
      workspace.navigation.committedThroughChapterId !==
        index.ledger.committedThroughChapterId
    ) {
      throw new Error(
        "Long workspace context no longer matches the loaded workspace index."
      );
    }

    const chapterCard = index.plot.chapterCards.find(
      (candidate) => candidate.id === activeChapterCardId
    );
    const navigationChapterCard = workspace.navigation.chapterCards.find(
      (candidate) => candidate.id === activeChapterCardId
    );
    const chapter = index.chapters.find(
      (candidate) => candidate.chapterCardId === activeChapterCardId
    );
    if (
      !chapterCard ||
      !navigationChapterCard ||
      !chapter ||
      navigationChapterCard.volumeId !== chapterCard.volumeId ||
      navigationChapterCard.primaryArcId !== chapterCard.primaryArcId ||
      navigationChapterCard.title !== chapterCard.title ||
      navigationChapterCard.narrativeOrder !== chapterCard.narrativeOrder
    ) {
      throw new Error(
        "Long workspace target chapter no longer matches the loaded workspace index."
      );
    }
    if (chapter.commitId !== null && profile.id !== "draft") {
      throw new Error("The target long chapter is already committed.");
    }
    return {
      index,
      projectRevision,
      activeChapterCardId,
      chapter
    };
  };

  let querySequence = 0;
  const nextQuerySequence = () => ++querySequence;
  const fullyReadWorldbuildingDocuments = new Map<string, FullyReadDocumentEntry>();
  const worldbuildingDocumentOverlay = new Map<
    string,
    {
      categoryId: string;
      categoryTitle: string;
      itemId?: string;
      itemTitle?: string;
      file: LongWorkspaceFileReference;
      content: string;
      pendingCreation: boolean;
    }
  >();
  const fullyReadCharacterDocuments = new Map<string, FullyReadDocumentEntry>();
  const characterDocumentOverlay = new Map<
    string,
    {
      characterId: string;
      characterName: string;
      characterGroup?: string;
      aliases?: string[];
      document:
        | "overview"
        | "core_profile"
        | "relationships"
        | "current_state"
        | "history";
      file: LongWorkspaceFileReference;
      content: string;
      pendingCreation: boolean;
    }
  >();
  const fullyReadPlotItems = new Map<
    string,
    {
      serialized: string;
      workspaceRevision: number;
      projectRevision: number;
    }
  >();
  const fullyReadChapterBodies = new Map<string, FullyReadDocumentEntry>();
  const readChapterBodySnapshots = new Map<
    string,
    {
      content: string;
      file: LongWorkspaceFileReference;
    }
  >();
  const chapterBodyOverlay = new Map<
    string,
    {
      chapterCardId: string;
      chapterTitle: string;
      file: LongWorkspaceFileReference;
      content: string;
    }
  >();
  const fullyReadContinuityDocuments = new Map<string, FullyReadDocumentEntry>();
  const continuityDocumentOverlay = new Map<
    string,
    {
      chapterCardId: string;
      chapterTitle: string;
      role: LongContinuityFileRole;
      characterId: string | null;
      characterName: string | null;
      file: LongWorkspaceFileReference;
      content: string;
      pendingCreation: boolean;
    }
  >();
  const pendingDeletedContinuityKeys = new Set<string>();

  const storyPlotOverlay = new Map<
    string,
    {
      arcId: string;
      title: string;
      order: number;
      file: LongWorkspaceFileReference;
      content: string;
      pendingCreation: boolean;
    }
  >();

  // 与 storyPlotOverlay 同理：本轮创建但尚未落盘的章卡只存在于缓存快照之外，
  // 需要内存覆盖层支撑同轮 read/write/edit 与 narrativeOrder 的连续分配。
  const chapterCardOverlay = new Map<
    string,
    {
      volumeId: string;
      primaryArcId: string | null;
      title: string;
      narrativeOrder: number;
      file: LongWorkspaceFileReference;
      content: string;
      pendingCreation: boolean;
    }
  >();

  const readWholeWorldbuildingDocument = async (
    file: LongWorkspaceFileReference,
    expectedWorkspaceRevision: number,
    expectedProjectRevision: number,
    signal?: AbortSignal
  ) => {
    let offset = 0;
    let content = "";
    let authoritativeFile = file;
    while (true) {
      const command = LongReadDocumentCommandEnvelopeSchema.parse(
        createEnvelope(
          "long.readDocument",
          {
            bookId: workspace.bookId,
            fileId: file.id,
            offset,
            maxCharacters: 262_144
          },
          {
            id: `long-query-${input.runId}-worldbuilding-${++querySequence}`,
            context: {
              sessionId: input.sessionId,
              runId: input.runId,
              resourceId: workspace.bookId
            }
          }
        )
      );
      const result = LongReadDocumentResultSchema.parse(
        await execute(command, signal)
      );
      if (
        result.bookId !== workspace.bookId ||
        result.file.id !== file.id ||
        result.file.path !== file.path ||
        result.offset !== offset ||
        result.workspaceRevision !== expectedWorkspaceRevision ||
        result.projectRevision !== expectedProjectRevision
      ) {
        throw new Error(
          "Core returned a different worldbuilding document."
        );
      }
      authoritativeFile = result.file;
      content += result.content;
      if (result.nextOffset === null) {
        return { content, file: authoritativeFile };
      }
      offset = result.nextOffset;
    }
  };

  const readDocumentHasContent = async (
    file: LongWorkspaceFileReference,
    expectedWorkspaceRevision: number,
    expectedProjectRevision: number,
    signal?: AbortSignal
  ): Promise<boolean> => {
    let offset = 0;
    while (true) {
      const command = LongReadDocumentCommandEnvelopeSchema.parse(
        createEnvelope(
          "long.readDocument",
          {
            bookId: workspace.bookId,
            fileId: file.id,
            offset,
            maxCharacters: 262_144
          },
          {
            id: `long-query-${input.runId}-readiness-${++querySequence}`,
            context: {
              sessionId: input.sessionId,
              runId: input.runId,
              resourceId: workspace.bookId
            }
          }
        )
      );
      const result = LongReadDocumentResultSchema.parse(
        await execute(command, signal)
      );
      if (
        result.bookId !== workspace.bookId ||
        result.file.id !== file.id ||
        result.offset !== offset ||
        result.workspaceRevision !== expectedWorkspaceRevision ||
        result.projectRevision !== expectedProjectRevision
      ) {
        throw new Error(
          "Core returned a different document while checking chapter readiness."
        );
      }
      if (result.content.trim()) return true;
      if (result.nextOffset === null) return false;
      offset = result.nextOffset;
    }
  };

  const loadChapterReadiness = async (
    index: LongWorkspaceIndexSnapshot,
    projectRevision: number,
    chapterCardId: string,
    signal?: AbortSignal
  ): Promise<LongChapterReadiness> => {
    const chapter = index.plot.chapterCards.find(
      ({ id }) => id === chapterCardId
    );
    const files = index.chapters.find(
      (entry) => entry.chapterCardId === chapterCardId
    );
    if (!chapter || !files) {
      throw new Error("The requested chapter or its triplet no longer exists.");
    }
    if (files.commitId !== null) {
      throw new Error("Committed chapters cannot be scheduled for writing.");
    }
    const bodyHasContent = await readDocumentHasContent(
      files.body,
      index.revision,
      projectRevision,
      signal
    );
    return classifyLongChapterReadiness({
      chapterCardId: chapter.id,
      title: chapter.title,
      body: bodyHasContent ? "present" : "",
      characterState: "",
      handoff: ""
    });
  };

  const resolveChapterBodyTarget = (
    index: LongWorkspaceIndexSnapshot,
    chapterCardId: string
  ): {
    chapterTitle: string;
    file: LongWorkspaceFileReference;
    content?: string;
  } => {
    const chapterCard = index.plot.chapterCards.find(
      ({ id }) => id === chapterCardId
    );
    const chapter = index.chapters.find(
      (candidate) => candidate.chapterCardId === chapterCardId
    );
    if (!chapterCard || !chapter) {
      throw new Error("The requested chapter does not exist.");
    }
    const overlay = chapterBodyOverlay.get(chapter.body.id);
    return {
      chapterTitle: chapterCard.title,
      file: overlay?.file ?? chapter.body,
      ...(overlay ? { content: overlay.content } : {})
    };
  };

  const resolveChapterDocumentTarget = (
    index: LongWorkspaceIndexSnapshot,
    chapterCardId: string,
    document: "body" | "character_state" | "handoff"
  ): {
    chapterTitle: string;
    file: LongWorkspaceFileReference;
    content?: string;
  } => {
    if (document === "body") {
      return resolveChapterBodyTarget(index, chapterCardId);
    }
    const chapterCard = index.plot.chapterCards.find(
      ({ id }) => id === chapterCardId
    );
    const chapter = index.chapters.find(
      (candidate) => candidate.chapterCardId === chapterCardId
    );
    if (!chapterCard || !chapter) {
      throw new Error("The requested chapter does not exist.");
    }
    return {
      chapterTitle: chapterCard.title,
      file:
        document === "character_state"
          ? chapter.characterState
          : chapter.handoff
    };
  };

  const readWholeChapterBody = async (
    file: LongWorkspaceFileReference,
    expectedWorkspaceRevision: number,
    expectedProjectRevision: number,
    signal?: AbortSignal
  ): Promise<{ content: string; file: LongWorkspaceFileReference }> => {
    let offset = 0;
    let content = "";
    let authoritativeFile = file;
    let readWorkspaceRevision: number | null = null;
    let readProjectRevision: number | null = null;
    let readFileRevision: string | null = null;
    while (true) {
      const command = LongReadDocumentCommandEnvelopeSchema.parse(
        createEnvelope(
          "long.readDocument",
          {
            bookId: workspace.bookId,
            fileId: file.id,
            offset,
            maxCharacters: 262_144
          },
          {
            id: `long-query-${input.runId}-chapter-${++querySequence}`,
            context: {
              sessionId: input.sessionId,
              runId: input.runId,
              resourceId: workspace.bookId
            }
          }
        )
      );
      const result = LongReadDocumentResultSchema.parse(
        await execute(command, signal)
      );
      if (
        result.bookId !== workspace.bookId ||
        result.file.id !== file.id ||
        result.file.path !== file.path ||
        result.offset !== offset ||
        result.workspaceRevision < expectedWorkspaceRevision ||
        result.projectRevision < expectedProjectRevision ||
        (readFileRevision !== null &&
          result.file.revision !== readFileRevision) ||
        (readWorkspaceRevision !== null &&
          result.workspaceRevision !== readWorkspaceRevision) ||
        (readProjectRevision !== null &&
          result.projectRevision !== readProjectRevision)
      ) {
        throw new Error("Core returned a different chapter body.");
      }
      readWorkspaceRevision ??= result.workspaceRevision;
      readProjectRevision ??= result.projectRevision;
      readFileRevision ??= result.file.revision;
      authoritativeFile = result.file;
      content += result.content;
      if (result.nextOffset === null) {
        return { content, file: authoritativeFile };
      }
      offset = result.nextOffset;
    }
  };

  return {
    input,
    workspace,
    profile,
    readableRoots,
    writableRoots,
    capabilities,
    isSettingAgent,
    isPlotDesignAgent,
    isDraftWritingAgent,
    isContinuityLedgerAgent,
    execute,
    loadIndex,
    formLongMutationProposal,
    loadActiveChapterMutationContext,
    nextQuerySequence,
    fullyReadWorldbuildingDocuments,
    worldbuildingDocumentOverlay,
    fullyReadCharacterDocuments,
    characterDocumentOverlay,
    fullyReadPlotItems,
    fullyReadChapterBodies,
    readChapterBodySnapshots,
    chapterBodyOverlay,
    fullyReadContinuityDocuments,
    continuityDocumentOverlay,
    pendingDeletedContinuityKeys,
    storyPlotOverlay,
    chapterCardOverlay,
    readWholeWorldbuildingDocument,
    readDocumentHasContent,
    loadChapterReadiness,
    resolveChapterBodyTarget,
    resolveChapterDocumentTarget,
    readWholeChapterBody
  };
}

export type LongToolContext = ReturnType<typeof createLongToolContext>;
