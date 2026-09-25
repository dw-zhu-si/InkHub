import {
  getDefaultLongAgentProfile,
  type CatalogIndexSnapshot,
  type CatalogSnapshot,
  type LongBookSummary,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceRuntimeContext
} from "@deepwrite/contracts";
import { computed, nextTick, ref, shallowRef } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { AgentConversationController } from "./useAgentConversation";
import {
  useLongConversationCoordinator,
  type LongConversationCoordinatorOptions
} from "./useLongConversationCoordinator";
import type {
  LongWorkspaceRendererApi,
  LongWorkspaceSelection
} from "../types/longWorkspace";
import type { LibraryAttachmentBuildResult } from "../utils/libraryAttachments";

const BOOK_ID = "long-book-one";
const NOW = "2026-08-14T00:00:00.000Z";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function bookSummary(): LongBookSummary {
  return {
    id: BOOK_ID,
    title: "长篇测试书",
    projectRevision: 3,
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
      revision: 2,
      bookId: BOOK_ID,
      updatedAt: NOW,
      counts: {
        worldbuildingCategories: 0,
        characters: 0,
        volumes: 0,
        arcs: 0,
        chapterCards: 0,
        storyEvents: 0,
        storyPlots: 0,
        foreshadowingThreads: 0,
        committedChapters: 0
      },
      worldbuilding: [],
      characterTypes: [],
      characters: [],
      volumes: [],
      arcs: [],
      chapterCards: [],
      committedThroughChapterId: null
    }
  } as unknown as LongBookSummary;
}

function selection(key = "plot-design:book-line"): LongWorkspaceSelection {
  return {
    key,
    root: "plot_design",
    title: "全书故事线",
    breadcrumbs: ["长篇测试书", "剧情设计"],
    files: [],
    preferredRole: "body"
  };
}

function runtimeContext(
  summary: LongBookSummary
): LongWorkspaceRuntimeContext {
  return {
    bookId: summary.id,
    title: summary.title,
    activeRoot: "plot_design",
    activeAgentId: "plot_design",
    workspaceRevision: summary.navigation.revision,
    projectRevision: summary.projectRevision,
    navigation: summary.navigation
  };
}

function attachmentResult(): LibraryAttachmentBuildResult {
  return {
    bookId: BOOK_ID,
    attachedSkills: [],
    attachedMaterials: [],
    diagnostics: [],
    omittedAttachments: [],
    complete: true
  };
}

function controllerFixture() {
  const sessionId = ref("session-one");
  const draft = ref("继续设计剧情");
  const isBusy = ref(false);
  const conversationError = ref<string | null>(null);
  const selectedModelId = ref("model-one");
  const thinkingLevel = ref<"off" | "low" | "medium" | "high">("medium");
  const temperature = ref(0.7);
  const approvalMode = ref<"request-approval" | "auto-approve">(
    "request-approval"
  );
  const sendLongMessage = vi.fn(
    async (_context?: LongWorkspaceRuntimeContext) => {
      draft.value = "";
    }
  );
  const newConversation = vi.fn(() => {
    sessionId.value = "session-new";
    draft.value = "";
  });
  const selectConversation = vi.fn((nextSessionId: string) => {
    if (isBusy.value) return false;
    sessionId.value = nextSessionId;
    return true;
  });
  const selectModel = vi.fn((modelId: string) => {
    selectedModelId.value = modelId;
  });
  const selectThinkingLevel = vi.fn(
    (level: "off" | "low" | "medium" | "high") => {
      thinkingLevel.value = level;
    }
  );
  const selectTemperature = vi.fn((value: number) => {
    temperature.value = value;
  });
  const selectApprovalMode = vi.fn(
    (mode: "request-approval" | "auto-approve") => {
      approvalMode.value = mode;
    }
  );
  const stopGeneration = vi.fn(async () => {
    isBusy.value = false;
    return true;
  });
  const controller = {
    sessionId,
    draft,
    isBusy,
    conversationError,
    selectedModelId,
    thinkingLevel,
    temperature,
    approvalMode,
    sendLongMessage,
    newConversation,
    selectConversation,
    useSuggestion: vi.fn((value: string) => {
      draft.value = value;
    }),
    selectModel,
    selectThinkingLevel,
    selectTemperature,
    selectApprovalMode,
    stopGeneration
  } as unknown as AgentConversationController;
  return {
    controller,
    draft,
    isBusy,
    newConversation,
    selectApprovalMode,
    selectConversation,
    selectModel,
    selectTemperature,
    selectThinkingLevel,
    selectedModelId,
    sendLongMessage,
    sessionId,
    stopGeneration
  };
}

function createHarness() {
  const summary = shallowRef<LongBookSummary | null>(bookSummary());
  const activeSelection = shallowRef<LongWorkspaceSelection | null>(
    selection()
  );
  const profile = shallowRef(
    getDefaultLongAgentProfile("plot_design")
  );
  const context = shallowRef<LongWorkspaceRuntimeContext | null>(
    runtimeContext(summary.value!)
  );
  const conversation = controllerFixture();
  const sendPreflightPending = ref(false);
  const ensureAgentSettingsLoaded = vi.fn(async () => true);
  const saveActiveEditorChanges = vi.fn(async () => true);
  const refreshActiveWorkspace = vi.fn(async () => true);
  const documentsForProfile = vi.fn(() => []);
  const ensureDocumentsLoaded = vi.fn(async () => true);
  const hydratedSnapshot = vi.fn(() => null as CatalogSnapshot | null);
  const buildAttachments = vi.fn(() => attachmentResult());
  const filterReadableAttachments = vi.fn(() => ({
    attachedSkills: [],
    attachedMaterials: []
  }));
  const notifications = {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn()
  };
  const showConversation = vi.fn();
  const stopGeneration = vi.fn(async () => undefined);
  const blockActiveWritingPlan = vi.fn(() => false);
  const synchronizeSessionModelSelection = vi.fn();
  const synchronizeRunPreferences = vi.fn();
  const updatePermissionMode = vi.fn();
  const indexSnapshot = shallowRef<CatalogIndexSnapshot | null>(null);
  const options: LongConversationCoordinatorOptions = {
    state: {
      activeBookId: ref(BOOK_ID),
      activeBookSummary: summary,
      workspaceIndex: shallowRef(
        {} as unknown as LongWorkspaceIndexSnapshot
      ),
      selection: activeSelection,
      fileContext: shallowRef(null),
      activeRoot: computed(
        () => activeSelection.value?.root ?? "worldbuilding"
      ),
      activeAgentProfile: profile,
      activeRuntimeContext: context,
      sendPreflightPending,
      agentLoadError: ref(null)
    },
    runtime: {
      conversationKey: vi.fn(
        (bookId, agentId, root, chapterCardId) =>
          [bookId, agentId, root, chapterCardId ?? "none"].join(":")
      ),
      conversationForKey: vi.fn(() => conversation.controller),
      synchronizeSessionModelSelection,
      synchronizeRunPreferences
    },
    workspace: {
      blockActiveWritingPlan,
      ensureAgentSettingsLoaded,
      saveActiveEditorChanges,
      refreshActiveWorkspace,
      api: vi.fn(() => undefined)
    },
    catalog: {
      indexSnapshot,
      documentsForProfile,
      ensureDocumentsLoaded,
      hydratedSnapshot,
      buildAttachments,
      filterReadableAttachments
    },
    settings: {
      permissionMode: vi.fn(() => "request-approval" as const),
      updatePermissionMode
    },
    commands: { stopGeneration },
    showConversation,
    notifications
  };
  const coordinator = useLongConversationCoordinator(options);
  return {
    activeSelection,
    blockActiveWritingPlan,
    buildAttachments,
    context,
    conversation,
    coordinator,
    documentsForProfile,
    ensureAgentSettingsLoaded,
    ensureDocumentsLoaded,
    filterReadableAttachments,
    hydratedSnapshot,
    indexSnapshot,
    notifications,
    options,
    profile,
    refreshActiveWorkspace,
    saveActiveEditorChanges,
    sendPreflightPending,
    showConversation,
    stopGeneration,
    summary,
    synchronizeSessionModelSelection,
    synchronizeRunPreferences,
    updatePermissionMode
  };
}

async function waitForCall(mock: ReturnType<typeof vi.fn>): Promise<void> {
  await vi.waitFor(() => expect(mock).toHaveBeenCalled());
}

describe("useLongConversationCoordinator", () => {
  it("builds UI references from metadata and full attachments only on send", async () => {
    const test = createHarness();
    test.summary.value = {
      ...test.summary.value!,
      linkedMaterialIdsByKind: {
        ...test.summary.value!.linkedMaterialIdsByKind,
        character: ["material-library"]
      },
      linkedSkillIdsByKind: {
        ...test.summary.value!.linkedSkillIdsByKind,
        plot: ["skill-library"]
      }
    };
    test.context.value = runtimeContext(test.summary.value);
    test.indexSnapshot.value = {
      skills: [
        {
          id: "skill-library",
          title: "剧情方法",
          skillKind: "plot",
          entries: [
            {
              id: "skill-entry",
              title: "冲突升级",
              body: "",
              contentBytes: 18
            }
          ]
        }
      ],
      materials: [
        {
          id: "material-library",
          title: "人物素材",
          entries: [
            {
              id: "material-entry",
              title: "主角档案",
              stageId: "character",
              body: "",
              contentBytes: 24
            }
          ]
        }
      ]
    } as unknown as CatalogIndexSnapshot;

    expect(test.coordinator.availableSkillReferences.value).toEqual([
      {
        id: "skill:skill-library:skill-entry",
        label: "剧情方法 · 冲突升级",
        detail: "剧情设计技能库 · 当前长篇已绑定"
      }
    ]);
    expect(test.coordinator.availableMaterialReferences.value).toEqual([
      {
        id: "material:material-library:material-entry",
        label: "人物素材 · 主角档案",
        detail: "人设素材库 · 当前长篇已绑定"
      }
    ]);
    expect(test.hydratedSnapshot).not.toHaveBeenCalled();
    expect(test.buildAttachments).not.toHaveBeenCalled();

    test.hydratedSnapshot.mockReturnValue({} as CatalogSnapshot);
    await test.coordinator.sendLongMessage();

    expect(test.documentsForProfile).toHaveBeenCalledOnce();
    expect(test.ensureDocumentsLoaded).toHaveBeenCalledOnce();
    expect(test.hydratedSnapshot).toHaveBeenCalledOnce();
    expect(test.buildAttachments).toHaveBeenCalledOnce();
    expect(test.filterReadableAttachments).toHaveBeenCalledOnce();
    expect(test.conversation.sendLongMessage).toHaveBeenCalledOnce();
  });

  it("injects AGENTS.md into the long runtime context before sending", async () => {
    const test = createHarness();
    const readAgentsMd = vi.fn(async () => ({
      bookId: BOOK_ID,
      content: "# 长篇上下文\n\n## 正文阶段\n写当前章。",
      truncated: false
    }));
    test.options.workspace.api = vi.fn(() =>
      ({
        readAgentsMd
      }) as unknown as LongWorkspaceRendererApi
    );

    await test.coordinator.sendLongMessage();

    expect(readAgentsMd).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(test.conversation.sendLongMessage).toHaveBeenCalledOnce();
    const [context] = test.conversation.sendLongMessage.mock.calls[0]!;
    expect(context).toMatchObject({
      bookId: BOOK_ID,
      agentsMd: "# 长篇上下文\n\n## 正文阶段\n写当前章。"
    });
  });

  it("still sends when AGENTS.md cannot be read and warns that it was not injected", async () => {
    const test = createHarness();
    const readAgentsMd = vi.fn(async () => {
      throw new Error("工作区未就绪");
    });
    test.options.workspace.api = vi.fn(() =>
      ({
        readAgentsMd
      }) as unknown as LongWorkspaceRendererApi
    );

    await test.coordinator.sendLongMessage();

    expect(readAgentsMd).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(test.notifications.warning).toHaveBeenCalledWith(
      "长篇上下文未注入：工作区未就绪"
    );
    expect(test.conversation.sendLongMessage).toHaveBeenCalledOnce();
    const [context] = test.conversation.sendLongMessage.mock.calls[0]!;
    expect(context).toMatchObject({ bookId: BOOK_ID });
    expect(context).not.toHaveProperty("agentsMd");
  });

  it("rejects a second send while the first preflight is pending", async () => {
    const gate = deferred<boolean>();
    const test = createHarness();
    test.ensureAgentSettingsLoaded.mockImplementation(() => gate.promise);

    const first = test.coordinator.sendLongMessage();
    await test.coordinator.sendLongMessage();

    expect(test.notifications.info).toHaveBeenCalledWith(
      "正在准备上一条长篇消息，请稍候。"
    );
    await waitForCall(test.ensureAgentSettingsLoaded);
    expect(test.ensureAgentSettingsLoaded).toHaveBeenCalledOnce();
    gate.resolve(true);
    await first;
    expect(test.conversation.sendLongMessage).toHaveBeenCalledOnce();
  });

  it("protects conversation and model commands during preflight", async () => {
    const gate = deferred<boolean>();
    const test = createHarness();
    test.ensureAgentSettingsLoaded.mockImplementation(() => gate.promise);
    const sending = test.coordinator.sendLongMessage();

    test.coordinator.newConversation();
    test.coordinator.selectConversation("session-two");
    test.coordinator.selectModel("model-two");
    test.coordinator.selectThinking("high");
    test.coordinator.selectTemperature(0.2);
    test.coordinator.selectApprovalMode("auto-approve");

    expect(test.conversation.newConversation).not.toHaveBeenCalled();
    expect(test.conversation.selectConversation).not.toHaveBeenCalled();
    expect(test.conversation.selectModel).not.toHaveBeenCalled();
    expect(test.conversation.selectThinkingLevel).not.toHaveBeenCalled();
    expect(test.conversation.selectTemperature).not.toHaveBeenCalled();
    expect(test.conversation.selectApprovalMode).not.toHaveBeenCalled();
    expect(test.updatePermissionMode).not.toHaveBeenCalled();
    expect(test.showConversation).not.toHaveBeenCalled();

    gate.resolve(true);
    await sending;
  });

  it("blocks a new conversation while the controller is busy", () => {
    const test = createHarness();
    test.conversation.isBusy.value = true;

    test.coordinator.newConversation();

    expect(test.conversation.newConversation).not.toHaveBeenCalled();
    expect(test.notifications.warning).toHaveBeenCalledWith(
      "请先停止当前长篇回复，再新建对话。"
    );
    expect(test.showConversation).not.toHaveBeenCalled();
  });

  it("cancels after an awaited save when the semantic selection changes", async () => {
    const gate = deferred<boolean>();
    const test = createHarness();
    test.saveActiveEditorChanges.mockImplementation(() => gate.promise);
    const sending = test.coordinator.sendLongMessage();
    await waitForCall(test.saveActiveEditorChanges);

    test.activeSelection.value = selection("plot-design:book-line:other");
    gate.resolve(true);
    await sending;

    expect(test.refreshActiveWorkspace).not.toHaveBeenCalled();
    expect(test.conversation.sendLongMessage).not.toHaveBeenCalled();
    expect(test.notifications.info).toHaveBeenCalledWith(
      "长篇上下文、会话、模型设置或输入内容已切换，本次发送已取消。"
    );
  });

  it("cancels after Catalog loading when the captured model changes", async () => {
    const gate = deferred<boolean>();
    const test = createHarness();
    test.ensureDocumentsLoaded.mockImplementation(() => gate.promise);
    const sending = test.coordinator.sendLongMessage();
    await waitForCall(test.ensureDocumentsLoaded);

    test.conversation.selectedModelId.value = "model-two";
    gate.resolve(true);
    await sending;

    expect(test.hydratedSnapshot).not.toHaveBeenCalled();
    expect(test.conversation.sendLongMessage).not.toHaveBeenCalled();
  });

  it("disposal invalidates and drains an active preflight silently", async () => {
    const gate = deferred<boolean>();
    const test = createHarness();
    test.ensureAgentSettingsLoaded.mockImplementation(() => gate.promise);
    const sending = test.coordinator.sendLongMessage();
    await nextTick();
    const disposing = test.coordinator.dispose();

    gate.resolve(true);
    await Promise.all([sending, disposing]);

    expect(test.conversation.sendLongMessage).not.toHaveBeenCalled();
    expect(test.sendPreflightPending.value).toBe(false);
    expect(test.notifications.info).not.toHaveBeenCalledWith(
      "长篇上下文、会话、模型设置或输入内容已切换，本次发送已取消。"
    );
  });

  it("stops a busy active controller before draining disposal", async () => {
    const gate = deferred<void>();
    const test = createHarness();
    test.conversation.sendLongMessage.mockImplementation(async () => {
      test.conversation.isBusy.value = true;
      await gate.promise;
      test.conversation.isBusy.value = false;
    });
    test.conversation.stopGeneration.mockImplementation(async () => {
      test.conversation.isBusy.value = false;
      gate.resolve();
      return true;
    });

    const sending = test.coordinator.sendLongMessage();
    await waitForCall(test.conversation.sendLongMessage);
    await test.coordinator.dispose();
    await sending;

    expect(test.conversation.stopGeneration).toHaveBeenCalledOnce();
    expect(test.sendPreflightPending.value).toBe(false);
  });

  it("delegates stop generation through its command port", async () => {
    const test = createHarness();

    await test.coordinator.stopGeneration();

    expect(test.stopGeneration).toHaveBeenCalledOnce();
  });
});
