import {
  DEFAULT_LONG_AGENT_SETTINGS,
  createEnvelope,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterHandoffFileId,
  type LongBookSummary,
  type LongWorkspaceIndexSnapshot,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import { ref, type Ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { AgentConversationController } from "./useAgentConversation";
import type { LongWorkspaceProposalEvent } from "./useLongWorkspaceProposals";
import { useLongWritingWorkflowCoordinator } from "./useLongWritingWorkflowCoordinator";
import type { LongWorkspaceRendererApi } from "../types/longWorkspace";

const NOW = "2026-08-14T12:00:00.000Z";
const BOOK_ID = "longbook_workflow";
const CHAPTER_ID = "chapter_one";
const VOLUME_ID = "volume_one";
const FILE_REVISION = "v1:0:00000000";

function file(
  id: string,
  name: "body.md" | "card.md" | "character-state.md" | "handoff.md"
) {
  return {
    id,
    path: longChapterFilePath(CHAPTER_ID, name),
    revision: FILE_REVISION,
    updatedAt: NOW
  };
}

function foreshadowingFile() {
  return {
    id: longChapterForeshadowingChangesFileId(CHAPTER_ID),
    path: longChapterContinuityFilePath(
      CHAPTER_ID,
      "foreshadowing-changes.md"
    ),
    revision: FILE_REVISION,
    updatedAt: NOW
  };
}

function setConversationBusy(
  conversation: AgentConversationController,
  busy: boolean
): void {
  (conversation.isBusy as Ref<boolean>).value = busy;
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function workspaceIndex(revision = 7): LongWorkspaceIndexSnapshot {
  return {
    schemaVersion: 1,
    revision,
    bookId: BOOK_ID,
    updatedAt: NOW,
    worldbuilding: [],
    characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
    characters: [],
    characterFiles: [],
    plot: {
      volumes: [
        { id: VOLUME_ID, title: "第一卷", order: 1, summary: "" }
      ],
      arcs: [],
      chapterCards: [
        {
          id: CHAPTER_ID,
          volumeId: VOLUME_ID,
          primaryArcId: null,
          title: "第一章",
          narrativeOrder: 1,
          bodyStatus: "empty"
        }
      ],
      storyEvents: [],
      storyPlots: [],
      eventConnections: [],
      narrativePlacements: [],
      foreshadowing: []
    },
    chapters: [
      {
        chapterCardId: CHAPTER_ID,
        bodyStatus: "empty",
        body: file(longChapterBodyFileId(CHAPTER_ID), "body.md"),
        card: file(longChapterCardFileId(CHAPTER_ID), "card.md"),
        characterState: file(
          longChapterCharacterStateFileId(CHAPTER_ID),
          "character-state.md"
        ),
        handoff: file(longChapterHandoffFileId(CHAPTER_ID), "handoff.md"),
        foreshadowingChanges: foreshadowingFile(),
        worldReveals: null,
        characterContinuity: [],
        commitId: null
      }
    ],
    ledger: { committedThroughChapterId: null, commits: [] }
  } as unknown as LongWorkspaceIndexSnapshot;
}

function bookSummary(projectRevision = 11): LongBookSummary {
  return {
    id: BOOK_ID,
    title: "工作流测试书",
    projectRevision,
    updatedAt: NOW,
    linkedMaterialIdsByKind: {
      character: [],
      gimmick: [],
      plot: [],
      draft: [],
      other: []
    },
    linkedSkillIdsByKind: {
      general: [],
      plot: [],
      style: [],
      other: []
    },
    navigation: {
      schemaVersion: 1,
      revision: 7,
      bookId: BOOK_ID,
      updatedAt: NOW,
      counts: {
        worldbuildingCategories: 0,
        characters: 0,
        volumes: 1,
        arcs: 0,
        chapterCards: 1,
        storyEvents: 0,
        storyPlots: 0,
        foreshadowingThreads: 0,
        committedChapters: 0
      },
      worldbuilding: [],
      characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
      characters: [],
      volumes: [{ id: VOLUME_ID, title: "第一卷", order: 1 }],
      arcs: [],
      chapterCards: [
        {
          id: CHAPTER_ID,
          volumeId: VOLUME_ID,
          primaryArcId: null,
          title: "第一章",
          narrativeOrder: 1,
          bodyStatus: "empty"
        }
      ],
      committedThroughChapterId: null
    }
  } as unknown as LongBookSummary;
}

function fakeConversation(
  overrides: Partial<AgentConversationController> = {}
): AgentConversationController {
  return {
    sessionId: ref("session_writer"),
    draft: ref(""),
    isBusy: ref(false),
    conversationError: ref(null),
    acceptsRunEvent: vi.fn(() => true),
    approvalModeForRun: vi.fn(() => "request-approval"),
    newConversation: vi.fn(),
    selectApprovalMode: vi.fn(),
    sendLongMessage: vi.fn(async () => undefined),
    stopGeneration: vi.fn(async () => true),
    cancelPendingGeneration: vi.fn(() => false),
    ...overrides
  } as unknown as AgentConversationController;
}

function dispatchEvent(
  id = "event_dispatch"
): Extract<
  LongWorkspaceProposalEvent,
  { type: "long.chapter_dispatch_proposal" }
> {
  const sessionId = "session_dispatch";
  const runId = "run_dispatch";
  return createEnvelope(
    "long.chapter_dispatch_proposal",
    {
      sessionId,
      runId,
      toolCallId: `tool_${id}`,
      bookId: BOOK_ID,
      agentId: "draft",
      summary: "启动第一章写作",
      runtime: {
        provider: "deepwrite",
        model: "workflow-test",
        mode: "local-faux"
      },
      scope: "chapter",
      chapterCardId: CHAPTER_ID,
      title: "第一章",
      chapters: [
        {
          chapterCardId: CHAPTER_ID,
          title: "第一章",
          status: "empty",
          missingFiles: ["body"]
        }
      ],
      workspaceRevision: 7,
      projectRevision: 11
    },
    {
      id,
      context: { sessionId, runId, resourceId: BOOK_ID }
    }
  ) as Extract<
    LongWorkspaceProposalEvent,
    { type: "long.chapter_dispatch_proposal" }
  >;
}

function createHarness(options: {
  conversation?: AgentConversationController;
  refreshResult?: boolean;
} = {}) {
  const summary = ref<LongBookSummary | null>(bookSummary());
  const index = ref<LongWorkspaceIndexSnapshot | null>(workspaceIndex());
  const activeBookId = ref<string | null>(BOOK_ID);
  const proposalApprovalPending = ref(false);
  const revisionRequirement = ref<{
    bookId: string;
    workspaceRevision: number;
    projectRevision: number;
  } | null>(null);
  const agentSettings = ref(DEFAULT_LONG_AGENT_SETTINGS);
  const agentLoadError = ref<string | null>(null);
  const conversation = options.conversation ?? fakeConversation();
  const conversations = new Map<string, AgentConversationController>([
    [`long:${BOOK_ID}:draft:draft:__book__`, conversation]
  ]);
  const order: string[] = [];
  const saveActiveEditorChanges = vi.fn(async () => {
    order.push("save");
    return true;
  });
  const refreshActiveWorkspace = vi.fn(async () => {
    order.push("refresh");
    return options.refreshResult ?? true;
  });
  const refreshBookList = vi.fn(async () => {
    order.push("list");
  });
  const synchronizeEditorRevisions = vi.fn(() => {
    order.push("sync");
  });
  const selectWorkspaceFile = vi.fn(async () => {
    order.push("select");
    return true;
  });
  const getOrCreate = vi.fn((key: string) => {
    conversations.set(key, conversation);
    return conversation;
  });
  const remove = vi.fn(
    (key: string, _options?: { clearPersistence?: boolean }) => {
      conversations.delete(key);
    }
  );
  const removeAgentRunPreferences = vi.fn();
  const notifications = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  };
  const readDocument = vi.fn(async ({ bookId, fileId, offset = 0 }) => ({
    bookId,
    file: index.value!.chapters[0]!.body,
    content: "",
    offset,
    totalCharacters: 0,
    nextOffset: null,
    workspaceRevision: index.value!.revision,
    projectRevision: summary.value!.projectRevision,
    ...(fileId ? {} : {})
  }));
  const api = { readDocument };
  const coordinator = useLongWritingWorkflowCoordinator({
    state: {
      activeBookId,
      activeBookSummary: summary,
      workspaceIndex: index,
      proposalApprovalPending,
      revisionRequirement,
      agentSettings,
      agentLoadError
    },
    api: () => api as unknown as LongWorkspaceRendererApi,
    conversations: {
      byKey: conversations,
      getOrCreate,
      remove,
      active: () => conversation
    },
    catalog: {
      documentsForProfile: vi.fn(() => []),
      ensureDocumentsLoaded: vi.fn(async () => true),
      readableAttachments: vi.fn(() => ({
        attachedSkills: [],
        attachedMaterials: []
      }))
    },
    workspace: {
      saveActiveEditorChanges,
      refreshActiveWorkspace,
      refreshBookList,
      synchronizeEditorRevisions,
      selectWorkspaceFile
    },
    ensureAgentSettingsLoaded: vi.fn(async () => true),
    approvalMode: () => "request-approval",
    removeAgentRunPreferences,
    navigateToAcceptedProposal: vi.fn(async () => true),
    notifications
  });
  return {
    activeBookId,
    api,
    conversation,
    conversations,
    coordinator,
    getOrCreate,
    index,
    notifications,
    order,
    proposalApprovalPending,
    refreshActiveWorkspace,
    refreshBookList,
    remove,
    removeAgentRunPreferences,
    revisionRequirement,
    saveActiveEditorChanges,
    summary,
    synchronizeEditorRevisions
  };
}

async function startPlan(test: ReturnType<typeof createHarness>): Promise<void> {
  const event = dispatchEvent();
  await test.coordinator.workspaceProposals.handleEvent(event);
  await test.coordinator.approveProposal(event.id);
}

describe("long writing workflow coordinator", () => {
  it("shares one draft conversation across every chapter", () => {
    const test = createHarness();
    expect(
      test.coordinator.conversationKey(BOOK_ID, "draft", "draft", "chapter_one")
    ).toBe(
      test.coordinator.conversationKey(BOOK_ID, "draft", "draft", "chapter_two")
    );
    expect(
      test.coordinator.conversationKey(BOOK_ID, "draft", "draft", "chapter_one")
    ).toBe(
      `long:${encodeURIComponent(BOOK_ID)}:draft:draft:${encodeURIComponent("__book__")}`
    );
    expect(
      test.coordinator.conversationKey(
        BOOK_ID,
        "plot_design",
        "plot_design",
        "chapter_one"
      )
    ).toBe(
      test.coordinator.conversationKey(
        BOOK_ID,
        "plot_design",
        "plot_design",
        "chapter_two"
      )
    );
    expect(
      test.coordinator.conversationKey(
        BOOK_ID,
        "continuity_ledger",
        "continuity_ledger",
        "chapter_one"
      )
    ).not.toBe(
      test.coordinator.conversationKey(
        BOOK_ID,
        "continuity_ledger",
        "continuity_ledger",
        "chapter_two"
      )
    );
  });

  it("runs an approved dispatch through save, readiness, selection, and the shared writer conversation", async () => {
    const test = createHarness();

    await startPlan(test);

    expect(test.saveActiveEditorChanges).toHaveBeenCalledTimes(2);
    expect(test.refreshActiveWorkspace).toHaveBeenCalledWith(BOOK_ID);
    expect(test.api.readDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: BOOK_ID,
        fileId: longChapterBodyFileId(CHAPTER_ID)
      })
    );
    expect(test.conversation.newConversation).not.toHaveBeenCalled();
    expect(test.getOrCreate).toHaveBeenCalledWith(
      `long:${encodeURIComponent(BOOK_ID)}:draft:draft:${encodeURIComponent("__book__")}`,
      `long:${BOOK_ID}`
    );
    expect(test.conversation.selectApprovalMode).toHaveBeenCalledWith(
      "request-approval"
    );
    expect(test.conversation.sendLongMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: BOOK_ID,
        activeRoot: "draft",
        activeAgentId: "draft",
        activeChapterCardId: CHAPTER_ID,
        worldbuildingDirectory: {
          categories: [],
          omittedCategoryCount: 0
        }
      }),
      { attachedSkills: [], attachedMaterials: [] }
    );
    expect(test.coordinator.writingOrchestrator.state.value.phase).toBe(
      "awaiting_writer_approval"
    );
    expect(test.proposalApprovalPending.value).toBe(false);
  });

  it("matches the active expectation by session and does not fail after a proposal was seen", async () => {
    const test = createHarness();
    await startPlan(test);

    test.coordinator.observeAgentEvent({
      type: "agent.error",
      payload: {
        sessionId: "wrong-session",
        runId: "run_writer",
        message: "wrong run"
      }
    } as SystemEventEnvelope);
    expect(test.coordinator.writingOrchestrator.state.value.phase).toBe(
      "awaiting_writer_approval"
    );

    test.coordinator.observeAgentEvent({
      type: "long.chapter_write_proposal",
      payload: {
        sessionId: "session_writer",
        runId: "run_writer",
        bookId: BOOK_ID,
        agentId: "draft",
        file: { chapterCardId: CHAPTER_ID }
      }
    } as SystemEventEnvelope);
    test.coordinator.observeAgentEvent({
      type: "agent.message_completed",
      payload: { sessionId: "session_writer", runId: "run_writer" }
    } as SystemEventEnvelope);

    expect(test.coordinator.writingOrchestrator.state.value.phase).toBe(
      "awaiting_writer_approval"
    );
    expect(test.notifications.error).not.toHaveBeenCalled();
  });

  it("turns a matching terminal error without a proposal into a retryable plan failure", async () => {
    const test = createHarness();
    await startPlan(test);

    test.coordinator.observeAgentEvent({
      type: "agent.error",
      payload: {
        sessionId: "session_writer",
        runId: "run_writer",
        message: "writer failed before proposal"
      }
    } as SystemEventEnvelope);

    expect(test.coordinator.writingOrchestrator.state.value.phase).toBe(
      "error"
    );
    expect(test.coordinator.writingOrchestrator.state.value.error).toContain(
      "writer failed before proposal"
    );
    expect(test.notifications.error).toHaveBeenCalledWith(
      expect.stringContaining("writer failed before proposal")
    );
  });

  it("publishes the save barrier in refresh, editor-sync, book-list order", async () => {
    const test = createHarness();

    await expect(
      test.coordinator.refreshSaveBarrier(BOOK_ID)
    ).resolves.toBe(true);

    expect(test.order).toEqual(["refresh", "sync", "list"]);
    expect(test.synchronizeEditorRevisions).toHaveBeenCalledWith(7, 11);
  });

  it("blocks plan-invalidating actions but permits navigation inside the plan book", async () => {
    const test = createHarness();
    await startPlan(test);

    expect(
      test.coordinator.blockActivePlan("切换创作空间", {
        targetBookId: BOOK_ID,
        allowPlanBook: true
      })
    ).toBe(false);
    expect(test.coordinator.blockActivePlan("删除项目")).toBe(true);
    expect(test.notifications.warning).toHaveBeenCalledWith(
      expect.stringContaining("请先取消计划")
    );
  });

  it("cancels by stopping the shared writer without resetting conversation history", async () => {
    let releaseStop!: (accepted: boolean) => void;
    const stop = new Promise<boolean>((resolve) => {
      releaseStop = resolve;
    });
    const conversation = fakeConversation({
      stopGeneration: vi.fn(() => stop)
    });
    const test = createHarness({ conversation });
    await startPlan(test);
    setConversationBusy(conversation, true);

    const canceling = test.coordinator.cancelWorkflow();
    await Promise.resolve();

    expect(conversation.cancelPendingGeneration).toHaveBeenCalledOnce();
    expect(conversation.newConversation).not.toHaveBeenCalled();
    expect(conversation.stopGeneration).toHaveBeenCalledOnce();
    expect(test.coordinator.writingOrchestrator.state.value.phase).toBe("idle");
    releaseStop(true);
    await canceling;
    expect(test.notifications.info).toHaveBeenCalledWith(
      "已取消长篇串行写作计划。"
    );
  });

  it("rejects through the workflow facade without starting a plan", async () => {
    const test = createHarness();
    const event = dispatchEvent("event_reject");
    await test.coordinator.workspaceProposals.handleEvent(event);

    test.coordinator.rejectProposal(event.id);

    expect(test.coordinator.workspaceProposals.itemsForBook(BOOK_ID)).toEqual(
      []
    );
    expect(test.notifications.info).toHaveBeenCalledWith(
      "已拒绝该长篇提案，未写入任何文件。"
    );
  });

  it("stops and disposes only the target book runtime", async () => {
    const target = fakeConversation();
    setConversationBusy(target, true);
    const other = fakeConversation();
    setConversationBusy(other, true);
    const test = createHarness({ conversation: target });
    const targetKey = [...test.conversations.keys()][0]!;
    const otherKey = "long:longbook_other:draft:draft:chapter_other";
    test.conversations.set(otherKey, other);
    test.revisionRequirement.value = {
      bookId: BOOK_ID,
      workspaceRevision: 8,
      projectRevision: 12
    };

    await test.coordinator.stopBookAgentRuns(BOOK_ID);
    expect(target.stopGeneration).toHaveBeenCalledOnce();
    expect(other.stopGeneration).not.toHaveBeenCalled();

    test.coordinator.disposeBookRuntime(BOOK_ID);
    expect(test.remove).toHaveBeenCalledWith(targetKey, {
      clearPersistence: true
    });
    expect(test.conversations.has(targetKey)).toBe(false);
    expect(test.conversations.has(otherKey)).toBe(true);
    expect(test.revisionRequirement.value).toBeNull();
    expect(test.removeAgentRunPreferences).toHaveBeenCalledWith(
      `long:${BOOK_ID}`
    );
    expect(test.remove).toHaveBeenCalledTimes(1);
    expect(test.removeAgentRunPreferences).toHaveBeenCalledTimes(1);
    expect(test.remove.mock.invocationCallOrder[0]).toBeLessThan(
      test.removeAgentRunPreferences.mock.invocationCallOrder[0]!
    );
  });

  it("separates workflow-state cleanup from conversation cleanup", async () => {
    const workflowOnly = createHarness();
    const workflowConversationKey = [...workflowOnly.conversations.keys()][0]!;
    workflowOnly.revisionRequirement.value = {
      bookId: BOOK_ID,
      workspaceRevision: 8,
      projectRevision: 12
    };
    await startPlan(workflowOnly);

    workflowOnly.coordinator.disposeBookWorkflowState(BOOK_ID);
    workflowOnly.coordinator.disposeBookWorkflowState(BOOK_ID);

    expect(workflowOnly.conversations.has(workflowConversationKey)).toBe(true);
    expect(workflowOnly.remove).not.toHaveBeenCalled();
    expect(workflowOnly.coordinator.writingOrchestrator.active.value).toBe(false);
    expect(workflowOnly.revisionRequirement.value).toBeNull();
    expect(
      workflowOnly.coordinator.workspaceProposals.itemsForBook(BOOK_ID)
    ).toEqual([]);

    const conversationsOnly = createHarness();
    const conversationKey = [...conversationsOnly.conversations.keys()][0]!;
    conversationsOnly.revisionRequirement.value = {
      bookId: BOOK_ID,
      workspaceRevision: 8,
      projectRevision: 12
    };
    await startPlan(conversationsOnly);
    const targetConversationKeys = [...conversationsOnly.conversations.keys()].filter(
      (key) => key.startsWith(`long:${encodeURIComponent(BOOK_ID)}:`)
    );

    conversationsOnly.coordinator.disposeBookConversations(BOOK_ID);
    conversationsOnly.coordinator.disposeBookConversations(BOOK_ID);

    expect(conversationsOnly.conversations.has(conversationKey)).toBe(false);
    expect(conversationsOnly.remove).toHaveBeenCalledTimes(
      targetConversationKeys.length
    );
    for (const key of targetConversationKeys) {
      expect(conversationsOnly.remove).toHaveBeenCalledWith(key, {
        clearPersistence: true
      });
    }
    expect(conversationsOnly.coordinator.writingOrchestrator.active.value).toBe(
      true
    );
    expect(conversationsOnly.revisionRequirement.value?.bookId).toBe(BOOK_ID);
    expect(conversationsOnly.removeAgentRunPreferences).not.toHaveBeenCalled();
  });

  it("matches encoded book prefixes and removes only target conversations with persistence", () => {
    const targetBookId = "longbook/encoded target?#";
    const encodedPrefix = `long:${encodeURIComponent(targetBookId)}:`;
    const targetKeys = [
      `${encodedPrefix}draft:draft:chapter_one`,
      `${encodedPrefix}setting:setting`
    ];
    const rawLookalike = `long:${targetBookId}:draft:draft:chapter_raw`;
    const siblingKey = `long:${encodeURIComponent(`${targetBookId}-other`)}:draft:draft:chapter_other`;
    const test = createHarness();
    for (const key of [...targetKeys, rawLookalike, siblingKey]) {
      test.conversations.set(key, fakeConversation());
    }

    test.coordinator.disposeBookConversations(targetBookId);
    test.coordinator.disposeBookConversations(targetBookId);

    expect(test.remove).toHaveBeenCalledTimes(targetKeys.length);
    for (const key of targetKeys) {
      expect(test.remove).toHaveBeenCalledWith(key, {
        clearPersistence: true
      });
      expect(test.conversations.has(key)).toBe(false);
    }
    expect(test.conversations.has(rawLookalike)).toBe(true);
    expect(test.conversations.has(siblingKey)).toBe(true);
    expect(test.conversations.has(`long:${BOOK_ID}:draft:draft:__book__`)).toBe(
      true
    );
  });

  it("quarantines book sessions before waiting for a running stop", async () => {
    const pendingStop = deferred<boolean>();
    const conversation = fakeConversation({
      stopGeneration: vi.fn(() => pendingStop.promise)
    });
    setConversationBusy(conversation, true);
    const test = createHarness({ conversation });
    const stopping = test.coordinator.stopBookAgentRuns(BOOK_ID);
    await Promise.resolve();

    const event = dispatchEvent("late_during_stop");
    await test.coordinator.workspaceProposals.handleEvent({
      ...event,
      payload: {
        ...event.payload,
        sessionId: conversation.sessionId.value
      }
    });
    expect(
      test.coordinator.workspaceProposals.itemsForBook(BOOK_ID)
    ).toEqual([]);

    pendingStop.resolve(true);
    await stopping;
  });
});
