import { describe, expect, it, vi } from "vitest";
import { SystemEventEnvelopeSchema } from "@deepwrite/contracts/system";
import {
  createEnvelope,
  longCharacterCoreProfileFileId,
  longCharacterFilePath,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterHandoffFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  type LongWorkspaceOperationBatch,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import type { LongWorkspaceRendererApi } from "../types/longWorkspace";
import {
  useLongWorkspaceProposals,
  type LongMutationProposalEvent
} from "./useLongWorkspaceProposals";

const runtime = {
  provider: "deepwrite",
  model: "long-proposal-test",
  mode: "local-faux" as const
};
const envelopeContext = {
  sessionId: "session_long",
  runId: "run_long",
  resourceId: "longbook_test"
};
const proposalBase = {
  sessionId: envelopeContext.sessionId,
  runId: envelopeContext.runId,
  toolCallId: "tool_long",
  bookId: "longbook_test",
  agentId: "setting" as const,
  summary: "待审阅长篇提案",
  runtime
};
const fileRevision = "v1:0:00000000";
const ledgerAudit = {
  commitMessage: "核验并提交第一章",
  chapterSummary: {
    timeline: "第一天。",
    characterStates: "人物状态。",
    factionStates: "势力状态。",
    realmStates: "境界状态。",
    foreshadowingStates: "伏笔状态。",
    continuityNotes: "连续性说明。"
  }
};
const emptyImpact = {
  createdEntityIds: [] as string[],
  updatedEntityIds: ["world_rules"],
  deletedEntityIds: [] as string[],
  createdFileIds: [] as string[],
  deletedFileIds: [] as string[],
  documentWriteProposalIds: [] as string[]
};

function systemEvent(event: unknown): SystemEventEnvelope {
  return SystemEventEnvelopeSchema.parse(event);
}

function mutationEvent(
  options: {
    id?: string;
    toolCallId?: string;
    title?: string;
  } = {}
): LongMutationProposalEvent {
  return systemEvent(
    createEnvelope(
      "long.mutation_proposal",
      {
        ...proposalBase,
        toolCallId: options.toolCallId ?? proposalBase.toolCallId,
        batch: {
          baseRevision: 7,
          updatedAt: "2026-07-26T12:00:00.000Z",
          operations: [
            {
              type: "worldbuilding.update" as const,
              id: "world_rules",
              patch: { title: options.title ?? "世界规则" }
            }
          ],
          documentWrites: []
        },
        baseProjectRevision: 11
      },
      { id: options.id ?? "event_mutation", context: envelopeContext }
    )
  ) as LongMutationProposalEvent;
}

function worldbuildingFileEvent() {
  const fileId = longWorldbuildingItemFileId("worlditem_memory");
  const filePath = longWorldbuildingItemContentPath(
    "world_rules",
    "worlditem_memory"
  );
  return systemEvent(
    createEnvelope(
      "long.worldbuilding_file_proposal",
      {
        ...proposalBase,
        batch: {
          baseRevision: 7,
          updatedAt: "2026-07-26T12:00:00.000Z",
          operations: [
            {
              type: "worldbuildingItem.create" as const,
              categoryId: "world_rules",
              item: {
                id: "worlditem_memory",
                title: "记忆代价",
                order: 1,
                file: {
                  id: fileId,
                  path: filePath,
                  revision: fileRevision,
                  updatedAt: "2026-07-26T12:00:00.000Z"
                }
              }
            }
          ],
          documentWrites: []
        },
        baseProjectRevision: 11,
        files: [
          {
            categoryId: "world_rules",
            itemId: "worlditem_memory",
            fileId,
            filePath,
            title: "记忆代价",
            operation: "create" as const,
            beforeText: "",
            afterText: "",
            beforeRevision: null,
            nextRevision: fileRevision
          }
        ]
      },
      { id: "event_worldbuilding_file", context: envelopeContext }
    )
  );
}

function worldbuildingWriteEvent() {
  const fileId = longWorldbuildingItemFileId("worlditem_memory");
  const filePath = longWorldbuildingItemContentPath(
    "world_rules",
    "worlditem_memory"
  );
  return systemEvent(
    createEnvelope(
      "long.worldbuilding_file_proposal",
      {
        ...proposalBase,
        toolCallId: "tool_worldbuilding_write",
        summary: "写入记忆代价",
        batch: {
          baseRevision: 7,
          updatedAt: "2026-07-26T12:00:01.000Z",
          operations: [],
          documentWrites: [
            {
              proposalId: "proposal_worlditem_memory_write",
              fileId,
              content: "每次施法都会遗忘一段记忆。",
              mode: "replace" as const,
              expectedRevision: fileRevision,
              nextRevision: "v1:4:11111111",
              updatedAt: "2026-07-26T12:00:01.000Z",
              reason: "写入记忆代价"
            }
          ]
        },
        baseProjectRevision: 11,
        files: [
          {
            categoryId: "world_rules",
            itemId: "worlditem_memory",
            fileId,
            filePath,
            title: "记忆代价",
            operation: "write" as const,
            beforeText: "",
            afterText: "每次施法都会遗忘一段记忆。",
            beforeRevision: fileRevision,
            nextRevision: "v1:4:11111111"
          }
        ]
      },
      { id: "event_worldbuilding_write", context: envelopeContext }
    )
  );
}

function characterWriteEvent() {
  const fileId = longCharacterCoreProfileFileId("character_lan");
  const filePath = longCharacterFilePath(
    "character_lan",
    "core-profile.md"
  );
  return systemEvent(
    createEnvelope(
      "long.character_file_proposal",
      {
        ...proposalBase,
        agentId: "setting" as const,
        toolCallId: "tool_character_write",
        summary: "写入林岚核心档案",
        batch: {
          baseRevision: 7,
          updatedAt: "2026-07-26T12:00:01.000Z",
          operations: [],
          documentWrites: [
            {
              proposalId: "proposal_character_lan_core",
              fileId,
              content: "雾港巡夜人。",
              mode: "replace" as const,
              expectedRevision: fileRevision,
              nextRevision: "v1:6:12345678",
              updatedAt: "2026-07-26T12:00:01.000Z",
              reason: "写入林岚核心档案"
            }
          ]
        },
        baseProjectRevision: 11,
        files: [
          {
            characterId: "character_lan",
            characterName: "林岚",
            document: "core_profile" as const,
            fileId,
            filePath,
            title: "林岚 / 核心档案",
            operation: "write" as const,
            beforeText: "",
            afterText: "雾港巡夜人。",
            beforeRevision: fileRevision,
            nextRevision: "v1:6:12345678"
          }
        ]
      },
      { id: "event_character_file", context: envelopeContext }
    )
  );
}

function continuityWriteEvent() {
  const chapterCardId = "chapter_one";
  const fileId = longChapterForeshadowingChangesFileId(chapterCardId);
  const filePath = longChapterContinuityFilePath(
    chapterCardId,
    "foreshadowing-changes.md"
  );
  return systemEvent(
    createEnvelope(
      "long.continuity_file_proposal",
      {
        ...proposalBase,
        agentId: "continuity_ledger" as const,
        toolCallId: "tool_continuity_write",
        summary: "记录第一章伏笔变化",
        batch: {
          baseRevision: 7,
          updatedAt: "2026-07-26T12:00:01.000Z",
          operations: [],
          documentWrites: [
            {
              proposalId: "proposal_chapter_one_foreshadowing",
              fileId,
              content: "本章无伏笔变化。",
              mode: "replace" as const,
              expectedRevision: fileRevision,
              nextRevision: "v1:9:12345678",
              updatedAt: "2026-07-26T12:00:01.000Z",
              reason: "记录第一章伏笔变化"
            }
          ]
        },
        baseProjectRevision: 11,
        files: [
          {
            chapterCardId,
            role: "foreshadowing_changes" as const,
            characterId: null,
            fileId,
            filePath,
            title: "第一章 / 伏笔变化",
            operation: "write" as const,
            beforeText: "",
            afterText: "本章无伏笔变化。",
            beforeRevision: fileRevision,
            nextRevision: "v1:9:12345678"
          }
        ]
      },
      { id: "event_continuity_file", context: envelopeContext }
    )
  );
}

function chapterEvent() {
  return systemEvent(
    createEnvelope(
      "long.chapter_write_proposal",
      {
        ...proposalBase,
        agentId: "draft" as const,
        batch: {
          baseRevision: 7,
          updatedAt: "2026-07-26T12:00:00.000Z",
          operations: [],
          documentWrites: [{
            proposalId: "proposal_chapter_one",
            fileId: longChapterBodyFileId("chapter_one"),
            content: "正文",
            mode: "replace" as const,
            expectedRevision: fileRevision,
            nextRevision: "v1:2:12345678",
            updatedAt: "2026-07-26T12:00:00.000Z",
            reason: "完成第一章"
          }]
        },
        baseProjectRevision: 11,
        file: {
          chapterCardId: "chapter_one",
          chapterTitle: "第一章",
          fileId: longChapterBodyFileId("chapter_one"),
          filePath: longChapterFilePath("chapter_one", "body.md"),
          operation: "create" as const,
          beforeText: "",
          afterText: "正文",
          beforeRevision: fileRevision,
          nextRevision: "v1:2:12345678"
        }
      },
      { id: "event_chapter", context: envelopeContext }
    )
  );
}

function ledgerEvent() {
  return systemEvent(
    createEnvelope(
      "long.ledger_commit_proposal",
      {
        ...proposalBase,
        agentId: "continuity_ledger" as const,
        input: {
          bookId: proposalBase.bookId,
          chapterCardId: "chapter_one",
          chapterFileRevisions: {
            body: fileRevision,
            characterState: fileRevision,
            handoff: fileRevision
          },
          placementDecisions: {},
          foreshadowingBeatDecisions: {},
          fileUpdates: [],
          ...ledgerAudit,
          baseWorkspaceRevision: 7,
          baseProjectRevision: 11
        }
      },
      { id: "event_ledger", context: envelopeContext }
    )
  );
}

function textFilesLedgerEvent() {
  return systemEvent(
    createEnvelope(
      "long.ledger_commit_proposal",
      {
        ...proposalBase,
        agentId: "continuity_ledger" as const,
        toolCallId: "tool_text_files_commit",
        input: {
          mode: "text_files" as const,
          bookId: proposalBase.bookId,
          chapterCardId: "chapter_one",
          chapterFileRevisions: { body: fileRevision },
          continuityFileRevisions: [
            {
              fileId: longChapterCharacterStateFileId("chapter_one"),
              revision: fileRevision
            },
            {
              fileId: longChapterHandoffFileId("chapter_one"),
              revision: fileRevision
            }
          ],
          foreshadowingBeatDecisions: {},
          commitMessage: "留存第一章连续性文本",
          baseWorkspaceRevision: 7,
          baseProjectRevision: 11
        }
      },
      { id: "event_text_files_ledger", context: envelopeContext }
    )
  );
}

function dispatchEvent() {
  return systemEvent(
    createEnvelope(
      "long.chapter_dispatch_proposal",
      {
        ...proposalBase,
        agentId: "draft" as const,
        scope: "chapter" as const,
        chapterCardId: "chapter_one",
        title: "第一章",
        chapters: [
          {
            chapterCardId: "chapter_one",
            title: "第一章",
            status: "empty" as const,
            missingFiles: [
              "body" as const,
              "character_state" as const,
              "handoff" as const
            ]
          }
        ],
        workspaceRevision: 7,
        projectRevision: 11
      },
      { id: "event_dispatch", context: envelopeContext }
    )
  );
}

function harness(
  acceptsEvent = true,
  approvalMode: "request-approval" | "auto-approve" = "request-approval"
) {
  const previewOperations = vi.fn(async (_input: {
    bookId: string;
    batch: LongWorkspaceOperationBatch;
  }) => {
    structuredClone(_input);
    return {
      bookId: proposalBase.bookId,
      preview: {
        baseRevision: _input.batch.baseRevision,
        resultRevision: _input.batch.baseRevision + 1,
        impact: emptyImpact,
        entityChanges: [],
        fileIntents: [],
        documentWrites:
          [] as LongWorkspaceOperationBatch["documentWrites"],
        provisionalIdMap: {}
      },
      projectRevision: 13
    };
  });
  const applyOperations = vi.fn(async (input: unknown) => {
    structuredClone(input);
    return undefined;
  });
  const getWorkspaceIndex = vi.fn(async () => ({
    bookId: proposalBase.bookId,
    workspaceIndex: {
      bookId: proposalBase.bookId,
      revision: 9,
      characters: [{ id: "character_lan", name: "林岚" }],
      plot: {
        chapterCards: [{ id: "chapter_one", title: "第一章" }]
      },
      worldbuilding: [
        {
          id: "world_rules",
          title: "世界规则",
          order: 1,
          format: "list" as const,
          contentAuthority: "files" as const,
          items: [
            {
              id: "worlditem_existing",
              title: "已有条目",
              order: 1,
              file: {
                id: longWorldbuildingItemFileId("worlditem_existing"),
                path: longWorldbuildingItemContentPath(
                  "world_rules",
                  "worlditem_existing"
                ),
                revision: fileRevision,
                updatedAt: "2026-07-26T11:00:00.000Z"
              }
            }
          ]
        }
      ],
      characterFiles: [
        {
          characterId: "character_lan",
          coreProfile: {
            id: longCharacterCoreProfileFileId("character_lan"),
            path: longCharacterFilePath(
              "character_lan",
              "core-profile.md"
            ),
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          relationships: {
            id: "file_character_lan:relationships",
            path: "long/characters/character_lan/relationships.md",
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          currentState: {
            id: "file_character_lan:current-state",
            path: "long/characters/character_lan/current-state.md",
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          history: {
            id: "file_character_lan:history",
            path: "long/characters/character_lan/history.md",
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          }
        }
      ],
      chapters: [
        {
          chapterCardId: "chapter_one",
          body: {
            id: longChapterBodyFileId("chapter_one"),
            path: longChapterFilePath("chapter_one", "body.md"),
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          card: {
            id: longChapterCardFileId("chapter_one"),
            path: longChapterFilePath("chapter_one", "card.md"),
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          characterState: {
            id: longChapterCharacterStateFileId("chapter_one"),
            path: longChapterFilePath(
              "chapter_one",
              "character-state.md"
            ),
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          handoff: {
            id: longChapterHandoffFileId("chapter_one"),
            path: longChapterFilePath("chapter_one", "handoff.md"),
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          foreshadowingChanges: {
            id: longChapterForeshadowingChangesFileId("chapter_one"),
            path: longChapterContinuityFilePath(
              "chapter_one",
              "foreshadowing-changes.md"
            ),
            revision: fileRevision,
            updatedAt: "2026-07-26T11:00:00.000Z"
          },
          worldReveals: null,
          characterContinuity: [],
          commitId: null
        }
      ]
    },
    projectRevision: 13
  }));
  const readDocument = vi.fn(
    async ({ bookId, fileId, offset = 0 }: {
      bookId: string;
      fileId: string;
      offset?: number;
    }) => {
      const expectedFileId =
        longChapterForeshadowingChangesFileId("chapter_one");
      if (bookId !== proposalBase.bookId || fileId !== expectedFileId) {
        throw new Error("测试未配置该文档。");
      }
      return {
        bookId,
        file: {
          id: expectedFileId,
          path: longChapterContinuityFilePath(
            "chapter_one",
            "foreshadowing-changes.md"
          ),
          revision: fileRevision,
          updatedAt: "2026-07-26T11:00:00.000Z"
        },
        content: "",
        offset,
        totalCharacters: 0,
        nextOffset: null,
        workspaceRevision: 9,
        projectRevision: 13
      };
    }
  );
  const writeChapter = vi.fn(async () => undefined);
  const commitChapter = vi.fn(async (input: unknown) => {
    structuredClone(input);
  });
  const api = {
    getWorkspaceIndex,
    readDocument,
    previewOperations,
    applyOperations,
    writeChapter,
    commitChapter
  } as unknown as LongWorkspaceRendererApi;
  const notifications = {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  };
  const onApplied = vi.fn();
  const onDispatchApproved = vi.fn();
  const onRejected = vi.fn();
  const prepareAutoApprove = vi.fn(async () => undefined);
  const controller = useLongWorkspaceProposals({
    api: () => api,
    acceptsEvent: () => acceptsEvent,
    approvalModeForEvent: () => approvalMode,
    prepareAutoApprove,
    onApplied,
    onDispatchApproved,
    onRejected,
    notifications
  });
  return {
    controller,
    getWorkspaceIndex,
    readDocument,
    previewOperations,
    applyOperations,
    writeChapter,
    commitChapter,
    onApplied,
    onDispatchApproved,
    onRejected,
    prepareAutoApprove,
    notifications
  };
}

describe("long workspace proposal approval", () => {
  it("previews and applies character file proposals through the same file path", async () => {
    const test = harness();
    test.previewOperations.mockImplementation(async ({ batch }) => ({
      bookId: proposalBase.bookId,
      preview: {
        baseRevision: batch.baseRevision,
        resultRevision: batch.baseRevision + 1,
        impact: emptyImpact,
        entityChanges: [],
        fileIntents: [],
        documentWrites: batch.documentWrites,
        provisionalIdMap: {}
      },
      projectRevision: 13
    }));

    await test.controller.handleEvent(characterWriteEvent());

    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "ready",
        event: { type: "long.character_file_proposal" }
      }
    ]);
    await test.controller.approve("longbook_test", "event_character_file");
    expect(test.applyOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({
        baseRevision: 9,
        documentWrites: [
          expect.objectContaining({
            fileId: longCharacterCoreProfileFileId("character_lan")
          })
        ]
      }),
      baseProjectRevision: 13
    });
    expect(test.notifications.success).toHaveBeenCalledWith(
      "人物文件变更已保存到本地 Markdown。"
    );
  });

  it("previews and saves per-chapter continuity Markdown proposals", async () => {
    const test = harness();
    test.previewOperations.mockImplementation(async ({ batch }) => ({
      bookId: proposalBase.bookId,
      preview: {
        baseRevision: batch.baseRevision,
        resultRevision: batch.baseRevision + 1,
        impact: emptyImpact,
        entityChanges: [],
        fileIntents: [],
        documentWrites: batch.documentWrites,
        provisionalIdMap: {}
      },
      projectRevision: 13
    }));

    await test.controller.handleEvent(continuityWriteEvent());

    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "ready",
        event: { type: "long.continuity_file_proposal" }
      }
    ]);
    await test.controller.approve(
      "longbook_test",
      "event_continuity_file"
    );
    expect(test.applyOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({
        baseRevision: 9,
        documentWrites: [
          expect.objectContaining({
            fileId: longChapterForeshadowingChangesFileId("chapter_one")
          })
        ]
      }),
      baseProjectRevision: 13
    });
    expect(test.notifications.success).toHaveBeenCalledWith(
      "本章连续性记录已保存到本地 Markdown。"
    );
  });

  it("revalidates each manual file approval after earlier cards advance the project revision", async () => {
    const test = harness();
    const baseSnapshot = await test.getWorkspaceIndex();
    const baseDocument = await test.readDocument({
      bookId: proposalBase.bookId,
      fileId: longChapterForeshadowingChangesFileId("chapter_one"),
      offset: 0
    });
    let liveWorkspaceRevision = 9;
    let liveProjectRevision = 13;

    test.getWorkspaceIndex.mockImplementation(async () => ({
      ...structuredClone(baseSnapshot),
      workspaceIndex: {
        ...structuredClone(baseSnapshot.workspaceIndex),
        revision: liveWorkspaceRevision
      },
      projectRevision: liveProjectRevision
    }));
    test.readDocument.mockImplementation(async ({ offset = 0 }) => ({
      ...structuredClone(baseDocument),
      offset,
      workspaceRevision: liveWorkspaceRevision,
      projectRevision: liveProjectRevision
    }));
    test.previewOperations.mockImplementation(async ({ batch }) => {
      expect(batch.baseRevision).toBe(liveWorkspaceRevision);
      return {
        bookId: proposalBase.bookId,
        preview: {
          baseRevision: batch.baseRevision,
          resultRevision: batch.baseRevision + 1,
          impact: emptyImpact,
          entityChanges: [],
          fileIntents: [],
          documentWrites: batch.documentWrites,
          provisionalIdMap: {}
        },
        projectRevision: liveProjectRevision
      };
    });
    test.applyOperations.mockImplementation(async (...args: unknown[]) => {
      const input = args[0] as {
        batch: LongWorkspaceOperationBatch;
        baseProjectRevision: number;
      };
      if (
        input.batch.baseRevision !== liveWorkspaceRevision ||
        input.baseProjectRevision !== liveProjectRevision
      ) {
        throw new Error("审批仍在使用已过期的全局 revision。");
      }
      liveWorkspaceRevision += 1;
      liveProjectRevision += 1;
      return undefined;
    });

    await test.controller.handleEvent(characterWriteEvent());
    await test.controller.handleEvent(continuityWriteEvent());
    expect(test.controller.itemsForBook(proposalBase.bookId)).toMatchObject([
      { status: "ready" },
      { status: "ready" }
    ]);

    await Promise.all([
      test.controller.approve(
        proposalBase.bookId,
        "event_character_file"
      ),
      test.controller.approve(
        proposalBase.bookId,
        "event_continuity_file"
      )
    ]);

    expect(test.applyOperations).toHaveBeenCalledTimes(2);
    expect(test.applyOperations).toHaveBeenLastCalledWith({
      bookId: proposalBase.bookId,
      batch: expect.objectContaining({ baseRevision: 10 }),
      baseProjectRevision: 14
    });
    expect(test.notifications.error).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook(proposalBase.bookId)).toMatchObject([
      { status: "accepted" },
      { status: "accepted" }
    ]);
  });

  it("clears a previously trusted continuity diff when retry validation fails", async () => {
    const test = harness();
    test.previewOperations.mockImplementation(async ({ batch }) => ({
      bookId: proposalBase.bookId,
      preview: {
        baseRevision: batch.baseRevision,
        resultRevision: batch.baseRevision + 1,
        impact: emptyImpact,
        entityChanges: [],
        fileIntents: [],
        documentWrites: batch.documentWrites,
        provisionalIdMap: {}
      },
      projectRevision: 13
    }));
    await test.controller.handleEvent(continuityWriteEvent());
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "ready",
      preview: expect.any(Object)
    });

    const changedContent = "文件已在磁盘发生变化。";
    test.readDocument.mockResolvedValueOnce({
      bookId: proposalBase.bookId,
      file: {
        id: longChapterForeshadowingChangesFileId("chapter_one"),
        path: longChapterContinuityFilePath(
          "chapter_one",
          "foreshadowing-changes.md"
        ),
        revision: fileRevision,
        updatedAt: "2026-07-26T11:00:00.000Z"
      },
      content: changedContent,
      offset: 0,
      totalCharacters: Array.from(changedContent).length,
      nextOffset: null,
      workspaceRevision: 9,
      projectRevision: 13
    });

    await test.controller.retryPreview(
      "longbook_test",
      "event_continuity_file"
    );

    const item = test.controller.itemsForBook("longbook_test")[0]!;
    expect(item).toMatchObject({
      status: "error",
      error: expect.stringContaining("原始内容与实际文件不一致")
    });
    expect(item).not.toHaveProperty("preview");
    expect(item).not.toHaveProperty("effectiveBatch");
  });

  it.each([
    {
      label: "伪造路径",
      suffix: "path",
      patch: {
        filePath:
          "long/chapters/chapter_two/continuity/foreshadowing-changes.md"
      },
      error: "文件路径",
      readCount: 0
    },
    {
      label: "伪造原文",
      suffix: "before",
      patch: { beforeText: "这是伪造的文件原文。" },
      error: "原始内容与实际文件不一致",
      readCount: 1
    }
  ])(
    "fails closed before previewing continuity proposals with $label",
    async ({ suffix, patch, error, readCount }) => {
      const test = harness();
      const original = continuityWriteEvent();
      if (original.type !== "long.continuity_file_proposal") {
        throw new Error("测试提案类型不正确。");
      }
      const forged = systemEvent({
        ...original,
        id: `event_continuity_forged_${suffix}`,
        payload: {
          ...original.payload,
          toolCallId: `tool_continuity_forged_${suffix}`,
          files: original.payload.files.map((file) => ({
            ...file,
            ...patch
          }))
        }
      });

      await test.controller.handleEvent(forged);

      expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
        {
          status: "error",
          error: expect.stringContaining(error)
        }
      ]);
      expect(test.readDocument).toHaveBeenCalledTimes(readCount);
      expect(test.previewOperations).not.toHaveBeenCalled();
      expect(test.applyOperations).not.toHaveBeenCalled();
    }
  );

  it("rebases lightweight continuity commits after their file proposals", async () => {
    const test = harness();

    await test.controller.handleEvent(textFilesLedgerEvent());

    expect(test.commitChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "text_files",
        baseWorkspaceRevision: 9,
        baseProjectRevision: 13,
        chapterFileRevisions: { body: fileRevision },
        continuityFileRevisions: expect.not.arrayContaining([
          expect.objectContaining({
            fileId: longChapterForeshadowingChangesFileId("chapter_one")
          })
        ]),
        foreshadowingBeatDecisions: {}
      })
    );
    expect(test.notifications.error).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
  });

  it("finalizes two text-file continuity commits from the same run in order", async () => {
    const test = harness();
    const latest = await test.getWorkspaceIndex();
    test.getWorkspaceIndex.mockResolvedValue({
      ...latest,
      workspaceIndex: {
        ...latest.workspaceIndex,
        plot: {
          chapterCards: [
            { id: "chapter_one", title: "第一章" },
            { id: "chapter_two", title: "第二章" }
          ]
        },
        chapters: [
          ...latest.workspaceIndex.chapters,
          {
            chapterCardId: "chapter_two",
            body: {
              id: longChapterBodyFileId("chapter_two"),
              path: longChapterFilePath("chapter_two", "body.md"),
              revision: fileRevision,
              updatedAt: "2026-07-26T11:00:00.000Z"
            },
            card: {
              id: longChapterCardFileId("chapter_two"),
              path: longChapterFilePath("chapter_two", "card.md"),
              revision: fileRevision,
              updatedAt: "2026-07-26T11:00:00.000Z"
            },
            characterState: {
              id: longChapterCharacterStateFileId("chapter_two"),
              path: longChapterFilePath("chapter_two", "character-state.md"),
              revision: fileRevision,
              updatedAt: "2026-07-26T11:00:00.000Z"
            },
            handoff: {
              id: longChapterHandoffFileId("chapter_two"),
              path: longChapterFilePath("chapter_two", "handoff.md"),
              revision: fileRevision,
              updatedAt: "2026-07-26T11:00:00.000Z"
            },
            foreshadowingChanges: {
              id: longChapterForeshadowingChangesFileId("chapter_two"),
              path: longChapterContinuityFilePath(
                "chapter_two",
                "foreshadowing-changes.md"
              ),
              revision: fileRevision,
              updatedAt: "2026-07-26T11:00:00.000Z"
            },
            worldReveals: null,
            characterContinuity: [],
            commitId: null
          }
        ]
      }
    });

    await test.controller.handleEvent(textFilesLedgerEvent());
    await test.controller.handleEvent(
      systemEvent(
        createEnvelope(
          "long.ledger_commit_proposal",
          {
            ...proposalBase,
            agentId: "continuity_ledger" as const,
            toolCallId: "tool_text_files_commit_two",
            input: {
              mode: "text_files" as const,
              bookId: proposalBase.bookId,
              chapterCardId: "chapter_two",
              chapterFileRevisions: { body: fileRevision },
              continuityFileRevisions: [
                {
                  fileId: longChapterCharacterStateFileId("chapter_two"),
                  revision: fileRevision
                },
                {
                  fileId: longChapterHandoffFileId("chapter_two"),
                  revision: fileRevision
                }
              ],
              foreshadowingBeatDecisions: {},
              commitMessage: "留存第二章连续性文本",
              baseWorkspaceRevision: 7,
              baseProjectRevision: 11
            }
          },
          { id: "event_text_files_ledger_two", context: envelopeContext }
        )
      )
    );

    expect(test.commitChapter).toHaveBeenCalledTimes(2);
    expect(test.commitChapter).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        chapterCardId: "chapter_one",
        baseWorkspaceRevision: 9,
        baseProjectRevision: 13
      })
    );
    expect(test.commitChapter).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chapterCardId: "chapter_two",
        baseWorkspaceRevision: 9,
        baseProjectRevision: 13
      })
    );
    expect(test.notifications.error).not.toHaveBeenCalled();
  });

  it("waits for an empty-file creation before previewing its separate write", async () => {
    const test = harness();
    test.previewOperations.mockImplementation(async ({ batch }) => ({
      bookId: proposalBase.bookId,
      preview: {
        baseRevision: batch.baseRevision,
        resultRevision: batch.baseRevision + 1,
        impact: emptyImpact,
        entityChanges: [],
        fileIntents: [],
        documentWrites: batch.documentWrites,
        provisionalIdMap: {}
      },
      projectRevision: 13
    }));

    await test.controller.handleEvent(worldbuildingFileEvent());
    await test.controller.handleEvent(worldbuildingWriteEvent());

    expect(test.previewOperations).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      { status: "ready" },
      {
        status: "waiting",
        event: { type: "long.worldbuilding_file_proposal" }
      }
    ]);

    expect(
      test.controller.reject(
        "longbook_test",
        "event_worldbuilding_file"
      )
    ).toBe(true);
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "error",
        error: expect.stringContaining("前序写入已被拒绝")
      }
    ]);
  });

  it("rebases and retains accepted long worldbuilding file cards", async () => {
    const test = harness(true, "auto-approve");
    test.previewOperations.mockImplementationOnce(async ({ batch }) => ({
      bookId: proposalBase.bookId,
      preview: {
        baseRevision: batch.baseRevision,
        resultRevision: batch.baseRevision + 1,
        impact: {
          ...emptyImpact,
          createdEntityIds: ["worlditem_memory"],
          createdFileIds: [
            longWorldbuildingItemFileId("worlditem_memory")
          ]
        },
        entityChanges: [],
        fileIntents: [],
        documentWrites: [],
        provisionalIdMap: {}
      },
      projectRevision: 13
    }));

    await test.controller.handleEvent(worldbuildingFileEvent());

    expect(test.getWorkspaceIndex).toHaveBeenCalledWith({
      bookId: "longbook_test"
    });
    expect(test.previewOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({
        baseRevision: 9,
        operations: [
          expect.objectContaining({
            item: expect.objectContaining({ order: 2 })
          })
        ]
      })
    });
    expect(test.applyOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({
        baseRevision: 9,
        expectedImpact: expect.objectContaining({
          createdEntityIds: ["worlditem_memory"]
        })
      }),
      baseProjectRevision: 13
    });
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "accepted",
        event: { type: "long.worldbuilding_file_proposal" }
      }
    ]);
  });

  it("previews and atomically applies auto-approved structure proposals immediately", async () => {
    const test = harness(true, "auto-approve");

    await test.controller.handleEvent(mutationEvent());

    expect(test.previewOperations).toHaveBeenCalledTimes(1);
    expect(test.prepareAutoApprove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event_mutation" })
    );
    expect(test.applyOperations).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "accepted",
        event: { id: "event_mutation", type: "long.mutation_proposal" }
      }
    ]);
  });

  it("queues same-run mutation proposals and rebases the next one after approval", async () => {
    const test = harness();
    const first = mutationEvent();
    const second = mutationEvent({
      id: "event_mutation_second",
      toolCallId: "tool_long_second",
      title: "世界法则"
    });

    await test.controller.handleEvent(first);
    await test.controller.handleEvent(second);

    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      { status: "ready", event: { id: "event_mutation" } },
      { status: "waiting", event: { id: "event_mutation_second" } }
    ]);

    await test.controller.approve("longbook_test", "event_mutation");

    expect(test.controller.itemsForBook("longbook_test")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "accepted",
          event: expect.objectContaining({ id: "event_mutation" })
        }),
        expect.objectContaining({
          status: "ready",
          event: expect.objectContaining({ id: "event_mutation_second" }),
          effectiveBatch: expect.objectContaining({ baseRevision: 9 }),
          effectiveProjectRevision: 13
        })
      ])
    );
  });

  it("marks deterministic preview validation failures as non-retryable", async () => {
    const test = harness();
    test.previewOperations.mockRejectedValueOnce(
      new Error(
        "long.operation.invalid_reference: Target chapter volume and primary arc must match."
      )
    );

    await test.controller.handleEvent(mutationEvent());

    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "error",
        errorPhase: "preview",
        errorRetryable: false,
        error: expect.stringContaining("long.operation.invalid_reference")
      }
    ]);
    expect(test.applyOperations).not.toHaveBeenCalled();
  });

  it("keeps chapter drafts out of the legacy long queue and routes the remaining proposal types", async () => {
    const chapter = harness(true, "auto-approve");
    expect(await chapter.controller.handleEvent(chapterEvent())).toBe(false);
    expect(chapter.writeChapter).not.toHaveBeenCalled();

    const ledger = harness(true, "auto-approve");
    await ledger.controller.handleEvent(ledgerEvent());
    expect(ledger.commitChapter).toHaveBeenCalledTimes(1);
    expect(ledger.onApplied).toHaveBeenCalledTimes(1);
    expect(ledger.notifications.error).not.toHaveBeenCalled();
    expect(ledger.controller.itemsForBook("longbook_test")).toEqual([]);

    const dispatch = harness(true, "auto-approve");
    await dispatch.controller.handleEvent(dispatchEvent());
    expect(dispatch.onDispatchApproved).toHaveBeenCalledTimes(1);
  });

  it("serializes realtime durable writes for the same long book", async () => {
    const test = harness(true, "auto-approve");
    const order: string[] = [];
    let releaseMutation!: () => void;
    test.applyOperations.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          order.push("mutation:start");
          releaseMutation = () => {
            order.push("mutation:end");
            resolve(undefined);
          };
        })
    );
    test.commitChapter.mockImplementationOnce(async () => {
      order.push("ledger");
      return undefined;
    });

    const mutation = test.controller.handleEvent(mutationEvent());
    const ledger = test.controller.handleEvent(ledgerEvent());
    await vi.waitFor(() => {
      expect(order).toEqual(["mutation:start"]);
    });
    expect(test.commitChapter).not.toHaveBeenCalled();

    releaseMutation();
    await Promise.all([mutation, ledger]);

    expect(order).toEqual(["mutation:start", "mutation:end", "ledger"]);
  });

  it("previews structure impact before apply and binds expected impact", async () => {
    const test = harness();
    await test.controller.handleEvent(mutationEvent());

    expect(test.previewOperations).toHaveBeenCalledTimes(1);
    expect(test.applyOperations).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "ready",
      previewProjectRevision: 13
    });

    await test.controller.approve("longbook_test", "event_mutation");

    expect(test.applyOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({
        baseRevision: 9,
        expectedImpact: emptyImpact
      }),
      baseProjectRevision: 13
    });
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "accepted",
        event: { type: "long.mutation_proposal" }
      }
    ]);
  });

  it("enqueues schema-valid manual mutations through preview and approval", async () => {
    const test = harness(false);
    const event = await test.controller.enqueueManualMutation({
      bookId: proposalBase.bookId,
      batch: mutationEvent().payload.batch,
      baseProjectRevision: 11,
      summary: "手工调整世界观结构"
    });

    expect(SystemEventEnvelopeSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      type: "long.mutation_proposal",
      payload: {
        bookId: "longbook_test",
        agentId: "plot_design",
        summary: "手工调整世界观结构",
        baseProjectRevision: 11,
        runtime: {
          provider: "deepwrite",
          model: "manual-structure-manager",
          mode: "local-faux"
        }
      },
      context: {
        sessionId: event.payload.sessionId,
        runId: event.payload.runId,
        resourceId: "longbook_test"
      }
    });
    expect(test.previewOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({
        ...event.payload.batch,
        baseRevision: 9
      })
    });
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      event: { id: event.id },
      status: "ready",
      previewProjectRevision: 13
    });

    await test.controller.approve("longbook_test", event.id);

    expect(test.applyOperations).toHaveBeenCalledWith({
      bookId: "longbook_test",
      batch: expect.objectContaining({
        baseRevision: 9,
        expectedImpact: emptyImpact
      }),
      baseProjectRevision: 13
    });
    expect(test.onApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "long.mutation_proposal",
        payload: expect.objectContaining({ bookId: "longbook_test" })
      })
    );
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      {
        status: "accepted",
        event: { id: event.id, type: "long.mutation_proposal" }
      }
    ]);
  });

  it("creates unique manual proposal envelopes and validates their payload", async () => {
    const test = harness();
    const first = await test.controller.enqueueManualMutation({
      bookId: proposalBase.bookId,
      batch: mutationEvent().payload.batch,
      baseProjectRevision: 11,
      summary: "第一次手工调整"
    });
    const second = await test.controller.enqueueManualMutation({
      bookId: proposalBase.bookId,
      agentId: "setting",
      batch: mutationEvent().payload.batch,
      baseProjectRevision: 11,
      summary: "第二次手工调整"
    });

    expect(second.id).not.toBe(first.id);
    expect(second.payload.sessionId).not.toBe(first.payload.sessionId);
    expect(second.payload.runId).not.toBe(first.payload.runId);
    expect(second.payload.toolCallId).not.toBe(first.payload.toolCallId);
    expect(second.payload.agentId).toBe("setting");
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(2);

    await expect(
      test.controller.enqueueManualMutation({
        bookId: proposalBase.bookId,
        batch: mutationEvent().payload.batch,
        baseProjectRevision: 11,
        summary: " "
      })
    ).rejects.toThrow();
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(2);
    expect(test.previewOperations).toHaveBeenCalledTimes(2);
  });

  it("does not reactivate a discarded book when manual proposal validation fails", async () => {
    const test = harness();
    test.controller.discardBook("longbook_test");

    await expect(
      test.controller.enqueueManualMutation({
        bookId: proposalBase.bookId,
        batch: mutationEvent().payload.batch,
        baseProjectRevision: 11,
        summary: " "
      })
    ).rejects.toThrow();

    expect(await test.controller.handleEvent(ledgerEvent())).toBe(false);
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
    expect(test.previewOperations).not.toHaveBeenCalled();
  });

  it("keeps internal continuity finalization out of the review queue", async () => {
    const ignored = harness(false);
    expect(await ignored.controller.handleEvent(ledgerEvent())).toBe(false);
    expect(ignored.controller.itemsForBook("longbook_test")).toEqual([]);

    const test = harness();
    await test.controller.handleEvent(ledgerEvent());

    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.onRejected).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
  });

  it("deduplicates a replayed tool proposal even when it has a new envelope id", async () => {
    const test = harness();
    const original = ledgerEvent();
    const replay = systemEvent({
      ...original,
      id: "event_ledger_replayed"
    });

    expect(await test.controller.handleEvent(original)).toBe(true);
    expect(await test.controller.handleEvent(replay)).toBe(false);

    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
  });

  it("quarantines a removed book and rejects late proposal events", async () => {
    const test = harness();
    await test.controller.handleEvent(mutationEvent());
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);

    test.controller.discardBook("longbook_test");
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
    expect(await test.controller.handleEvent(dispatchEvent())).toBe(false);
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);

    test.controller.activateBook("longbook_test");
    expect(await test.controller.handleEvent(dispatchEvent())).toBe(true);
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);
  });

  it("quarantines a canceled session, removes queued proposals, and rejects late ones", async () => {
    const test = harness();
    await test.controller.handleEvent(dispatchEvent());
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);

    test.controller.quarantineSession(
      "longbook_test",
      envelopeContext.sessionId
    );
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
    expect(await test.controller.handleEvent(dispatchEvent())).toBe(false);
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);

    const originalDispatchEvent = dispatchEvent();
    const otherSessionEvent = systemEvent({
      ...originalDispatchEvent,
      id: "event_dispatch_other_session",
      context: {
        ...originalDispatchEvent.context,
        sessionId: "session_long_other"
      },
      payload: {
        ...originalDispatchEvent.payload,
        sessionId: "session_long_other",
        toolCallId: "tool_dispatch_other_session"
      }
    });
    expect(
      await test.controller.handleEvent(otherSessionEvent)
    ).toBe(true);
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);
  });

  it("coalesces duplicate preview retries while one retry is in flight", async () => {
    const test = harness();
    test.previewOperations.mockRejectedValueOnce(
      new Error("首次预览失败")
    );
    await test.controller.handleEvent(mutationEvent());
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "error"
    });

    const firstRetry = test.controller.retryPreview(
      "longbook_test",
      "event_mutation"
    );
    const duplicateRetry = test.controller.retryPreview(
      "longbook_test",
      "event_mutation"
    );
    await Promise.all([firstRetry, duplicateRetry]);

    expect(test.previewOperations).toHaveBeenCalledTimes(2);
    expect(test.controller.itemsForBook("longbook_test")[0]).toMatchObject({
      status: "ready"
    });
  });

  it("routes chapter drafts away and finalizes continuity on its dedicated API", async () => {
    const test = harness();
    expect(await test.controller.handleEvent(chapterEvent())).toBe(false);
    await test.controller.handleEvent(ledgerEvent());

    expect(test.writeChapter).not.toHaveBeenCalled();
    expect(test.commitChapter).toHaveBeenCalledWith(
      expect.objectContaining({ chapterCardId: "chapter_one" })
    );
    expect(test.onApplied).toHaveBeenCalledTimes(1);
    expect(test.notifications.error).not.toHaveBeenCalled();
  });

  it("waits for file approval before running hidden continuity finalization", async () => {
    const test = harness();
    test.previewOperations.mockImplementation(async ({ batch }) => ({
      bookId: proposalBase.bookId,
      preview: {
        baseRevision: batch.baseRevision,
        resultRevision: batch.baseRevision + 1,
        impact: emptyImpact,
        entityChanges: [],
        fileIntents: [],
        documentWrites: batch.documentWrites,
        provisionalIdMap: {}
      },
      projectRevision: 13
    }));
    await test.controller.handleEvent(continuityWriteEvent());
    await test.controller.handleEvent(ledgerEvent());

    expect(test.commitChapter).not.toHaveBeenCalled();
    expect(test.controller.itemsForBook("longbook_test")).toHaveLength(1);

    await test.controller.approve(
      "longbook_test",
      "event_continuity_file"
    );

    expect(test.notifications.error).not.toHaveBeenCalled();
    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.onApplied).toHaveBeenCalledTimes(2);
    expect(test.onApplied).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "long.ledger_commit_proposal" })
    );
    expect(test.controller.itemsForBook("longbook_test")).toMatchObject([
      { status: "accepted" }
    ]);
  });

  it("does not turn a post-write refresh failure into a retryable write", async () => {
    const test = harness();
    test.onApplied.mockRejectedValueOnce(new Error("刷新超时"));
    await test.controller.handleEvent(ledgerEvent());

    expect(test.commitChapter).toHaveBeenCalledTimes(1);
    expect(test.controller.itemsForBook("longbook_test")).toEqual([]);
    expect(test.notifications.success).toHaveBeenCalledWith(
      "本章连续性文件已完成归档。"
    );
    expect(test.notifications.warning).toHaveBeenCalledWith(
      "连续性文件已经归档，但后续刷新失败：刷新超时"
    );
    expect(test.notifications.error).not.toHaveBeenCalled();

    await test.controller.handleEvent(ledgerEvent());
    expect(test.commitChapter).toHaveBeenCalledTimes(1);
  });

  it("delegates an approved dispatch to the serial orchestrator without writing directly", async () => {
    const test = harness();
    await test.controller.handleEvent(dispatchEvent());
    await test.controller.approve("longbook_test", "event_dispatch");

    expect(test.onDispatchApproved).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "long.chapter_dispatch_proposal",
        payload: expect.objectContaining({
          chapterCardId: "chapter_one"
        })
      })
    );
    expect(test.applyOperations).not.toHaveBeenCalled();
    expect(test.writeChapter).not.toHaveBeenCalled();
    expect(test.commitChapter).not.toHaveBeenCalled();
    expect(test.onApplied).not.toHaveBeenCalled();
  });
});
