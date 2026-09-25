import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import {
  DEFAULT_AGENT_TEAM_SETTINGS,
  DEFAULT_LIBRARY_AGENT_SETTINGS,
  DEFAULT_LONG_AGENT_SETTINGS,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS,
  SCRIPT_WORKSPACE_TEXT_STAGE_IDS,
  SHORT_WORKSPACE_STAGE_IDS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  createDefaultAppearanceSettings,
  createDefaultCreativePlotStages,
  createEmptyLongMarkdownFileReference,
  createShortWorkspaceContentRevision,
  createEnvelope,
  longCharacterCoreProfileFileId,
  longCharacterFilePath,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  type DeepWriteApi,
  type ModelSettings,
  type SessionAbortCommandPayload,
  type SessionPromptAcceptedPayload,
  type SessionPromptCommandPayload,
} from "@deepwrite/contracts";
import {
  mergeAgentConversationPersistenceSnapshots,
  useAgentConversation,
  type AgentConversationPersistenceRecord,
  type AgentConversationPersistenceSnapshot,
  type UseAgentConversationOptions
} from "./useAgentConversation";
import type { AgentEditProposal } from "../types/conversation";
import type { WorkspaceDocument } from "../types/workspace";

const document: WorkspaceDocument = {
  id: "chapter_3",
  domain: "creation",
  title: "第三章 雨夜回声",
  eyebrow: "长篇正文",
  path: ["雾港来信", "第三章 雨夜回声"],
  format: "正文",
  content: "雨是在午夜以后落下来的。"
};

const runtime = {
  provider: "deepwrite",
  model: "deepwrite-writing-faux",
  mode: "local-faux" as const
};

const plotStages = createDefaultCreativePlotStages();

function shortStageTitle(stageId: string): string {
  return stageId === "character_design"
    ? "人物"
    : stageId === "draft"
      ? "正文"
      : plotStages.find(({ id }) => id === stageId)?.title ?? stageId;
}

function createShortWorkspaceDocuments(): WorkspaceDocument[] {
  const stages: WorkspaceDocument[] = SHORT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
    id: `short_${stageId}`,
    domain: "creation",
    title: shortStageTitle(stageId),
    eyebrow: "短篇创作",
    path: ["雨夜来信", shortStageTitle(stageId)],
    format: "设定" as const,
    content: `${stageId} 的实时内容`,
    workspaceId: "short_story_1",
    workspaceType: "short",
    workspaceTitle: "雨夜来信",
    workspaceCategories: ["都市", "悬疑"],
    stageId,
    ...(stageId === "character_design"
      ? {}
      : {
          plotStageDescription: plotStages.find(({ id }) => id === stageId)!.description,
          plotStageOrder: plotStages.findIndex(({ id }) => id === stageId)
        })
  }));
  const draftFiles: WorkspaceDocument[] = ["intro", "section-1"].flatMap(
    (sectionId, index) => {
      const title = index === 0 ? "导语" : "第一节";
      const common = {
        domain: "creation" as const,
        eyebrow: "短篇创作",
        workspaceId: "short_story_1",
        workspaceType: "short" as const,
        workspaceTitle: "雨夜来信",
        workspaceCategories: ["都市", "悬疑"],
        stageId: "draft" as const,
        shortAgentId: "expert_draft_coordinator" as const,
        expertSectionId: sectionId,
        expertSectionOrder: index,
        expertWordCountRequirement: index === 0 ? "300 字" : "1200 字",
        draftDirectoryId: "draft"
      };
      return [
        {
          ...common,
          id: `short_draft_${sectionId}_body`,
          title,
          path: ["雨夜来信", "正文", title, "正文"],
          format: "正文" as const,
          content: index === 0 ? "" : "draft 的实时内容",
          draftFileKind: "body" as const
        },
        {
          ...common,
          id: `short_draft_${sectionId}_state`,
          title: `${title} · 人物状态`,
          path: ["雨夜来信", "正文", title, "人物状态"],
          format: "账本" as const,
          content: index === 0 ? "" : "第一节人物状态",
          draftFileKind: "character-state" as const
        }
      ];
    }
  );
  return [...stages, ...draftFiles];
}

function createScriptWorkspaceDocuments(): WorkspaceDocument[] {
  const stages: WorkspaceDocument[] = SCRIPT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
    id: `script_${stageId}`,
    domain: "creation",
    title: shortStageTitle(stageId),
    eyebrow: "剧本创作",
    path: ["雨夜剧本", shortStageTitle(stageId)],
    format: "设定" as const,
    content: `${stageId} 的剧本实时内容`,
    workspaceId: "script_story_1",
    workspaceType: "script",
    workspaceTitle: "雨夜剧本",
    workspaceCategories: ["悬疑"],
    stageId,
    ...(stageId === "character_design"
      ? {}
      : {
          plotStageDescription: plotStages.find(({ id }) => id === stageId)!.description,
          plotStageOrder: plotStages.findIndex(({ id }) => id === stageId)
        })
  }));
  const common = {
    domain: "creation" as const,
    eyebrow: "剧本创作",
    workspaceId: "script_story_1",
    workspaceType: "script" as const,
    workspaceTitle: "雨夜剧本",
    workspaceCategories: ["悬疑"],
    stageId: "draft" as const,
    shortAgentId: "expert_draft_coordinator" as const,
    expertSectionId: "episode-1",
    expertSectionOrder: 0,
    expertWordCountRequirement: "1200 字",
    draftDirectoryId: "draft"
  };
  return [
    ...stages,
    {
      ...common,
      id: "script_draft_episode-1_body",
      title: "第一集",
      path: ["雨夜剧本", "正文", "第一集", "正文"],
      format: "正文" as const,
      content: "1. 内景 公寓 - 夜\n△雨水沿着窗玻璃滑落。",
      draftFileKind: "body" as const
    },
    {
      ...common,
      id: "script_draft_episode-1_state",
      title: "第一集 · 人物状态",
      path: ["雨夜剧本", "正文", "第一集", "人物状态"],
      format: "账本" as const,
      content: "林默：发现来信。",
      draftFileKind: "character-state" as const
    }
  ];
}

function createDraftCoordinatorDocument(
  workspaceDocuments: WorkspaceDocument[]
): WorkspaceDocument {
  const source = workspaceDocuments.find(
    (candidate) => candidate.draftFileKind === "body"
  );
  if (!source) throw new Error("Missing draft body document.");
  const {
    catalogDocumentId: _catalogDocumentId,
    draftFileKind: _draftFileKind,
    expertSectionId: _expertSectionId,
    expertSectionOrder: _expertSectionOrder,
    expertWordCountRequirement: _expertWordCountRequirement,
    ...coordinator
  } = source;
  return {
    ...coordinator,
    id: "draft",
    title: "正文",
    path: ["雨夜来信", "正文"],
    content: "",
    shortAgentId: "expert_draft_coordinator"
  };
}

function createDeferredApi(): {
  api: DeepWriteApi;
  prompts: SessionPromptCommandPayload[];
  aborts: SessionAbortCommandPayload[];
  resolveAccepted(index: number, payload: SessionPromptAcceptedPayload): void;
  rejectPrompt(index: number, error: Error): void;
  promptCount(): number;
} {
  const pending: Array<{
    resolve(payload: SessionPromptAcceptedPayload): void;
    reject(error: Error): void;
  }> = [];
  const prompts: SessionPromptCommandPayload[] = [];
  const aborts: SessionAbortCommandPayload[] = [];
  const api: DeepWriteApi = {
    system: {
      async health() {
        return { status: "ok", checkedAt: new Date().toISOString(), workers: [] };
      }
    },
    updates: {
      async getState() {
        return {
          status: "idle",
          currentVersion: "1.0.0",
          releaseNotes: [],
          mandatory: false,
          canDownload: false,
          canInstall: false
        };
      },
      async check() {
        return this.getState();
      },
      async download() {
        return this.getState();
      },
      async install() {},
      subscribe() {
        return () => undefined;
      }
    },
    appAlerts: {
      async get() {
        return {
          desktopMessages: [],
          modelMessages: ["模型公告"],
          desktopRevision: "0".repeat(64),
          shouldShowDesktop: false
        };
      },
      async acknowledgeDesktop() {}
    },
    marketplace: {
      async session() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async register() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async login() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async logout() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async list() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async detail() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async listMine() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async myDetail() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async publish() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async update() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async setEnabled() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async delete() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async like() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async previewInstall() {
        throw new Error("Marketplace is not used by conversation tests.");
      },
      async install() {
        throw new Error("Marketplace is not used by conversation tests.");
      }
    },
    cloudBackup: {
      async status() {
        throw new Error("Cloud backup is not used by conversation tests.");
      },
      async previewBackup() {
        throw new Error("Cloud backup is not used by conversation tests.");
      },
      async applyBackup() {
        throw new Error("Cloud backup is not used by conversation tests.");
      },
      async previewRestore() {
        throw new Error("Cloud backup is not used by conversation tests.");
      },
      async applyRestore() {
        throw new Error("Cloud backup is not used by conversation tests.");
      }
    },
    catalog: {
      loadDraftRecovery: vi.fn(async () => ({})),
      saveDraftRecovery: vi.fn(async () => undefined),
      index: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      readDocument: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      snapshot: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      openProject: vi.fn(async () => null),
      importLegacyLibrary: vi.fn(async () => null),
      chooseExternalSkills: vi.fn(async () => null),
      createShortBook: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      createScriptBook: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      mutatePlotStructure: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      mutateCharacterStructure: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      createDraftSection: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      createDraftSections: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      deleteDraftSection: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      moveDraftSection: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      createLibrary: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      updateLibrary: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      createLibraryGroup: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      updateBook: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      updateLibraryGroup: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      deleteBook: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      saveDocument: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      saveLibraryEntry: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      createLibraryEntry: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      removeLibraryEntry: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      moveLibraryEntry: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      unregisterProject: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      deleteProject: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      }),
      duplicateProject: vi.fn(async () => {
        throw new Error("Catalog is not used by conversation tests.");
      })
    },
    long: {
      list: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      create: vi.fn(async () => null),
      duplicateBook: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      rename: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      updateBindings: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      chooseLegacySyncSource: vi.fn(async () => null),
      applyLegacySync: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      importPortable: vi.fn(async () => null),
      chooseContinuationImportSource: vi.fn(async () => null),
      importContinuation: vi.fn(async () => null),
      open: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      openExisting: vi.fn(async () => null),
      getWorkspaceIndex: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      readDocument: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      writeDocument: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      readAgentsMd: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      writeAgentsMd: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      previewOperations: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      applyOperations: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      writeChapter: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      commitChapter: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      rollbackLastCommit: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      unregister: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      }),
      delete: vi.fn(async () => {
        throw new Error("Long workspace is not used by conversation tests.");
      })
    },
    session: {
      prompt(payload) {
        prompts.push(payload);
        return new Promise<SessionPromptAcceptedPayload>((resolve, reject) => {
          pending.push({ resolve, reject });
        });
      },
      async abort(payload) {
        aborts.push(payload);
        return {
          ...payload,
          abortedAt: new Date().toISOString()
        };
      }
    },
    models: {
      async list() {
        return { models: [], defaultModelId: "" };
      },
      async refreshFree() {
        return { models: [], defaultModelId: "" };
      },
      async refreshOfficial() {
        return { models: [], defaultModelId: "" };
      },
      async queryOfficialBalance() {
        return {
          queriedAt: "2026-07-06T10:04:00.000Z",
          accountBalance: 0,
          accountBalanceYuan: 0,
          keyQuotaRemaining: 0,
          keyQuotaRemainingYuan: 0,
          quotaPerUnit: 10_000
        };
      },
      async saveOfficialToken() {
        return { models: [], defaultModelId: "" };
      },
      async clearOfficialToken() {
        return { models: [], defaultModelId: "" };
      },
      async setOfficialModelEnabled() {
        return { models: [], defaultModelId: "" };
      },
      async save(settings) {
        return {
          defaultModelId: settings.defaultModelId,
          models: settings.models.map((model) => ({
            id: model.id,
            label: model.label,
            provider: model.provider,
            modelId: model.modelId,
            api: model.api,
            baseUrl: model.baseUrl,
            reasoning: model.reasoning,
            defaultThinkingLevel: model.defaultThinkingLevel,
            thinkingLevelOptions: model.thinkingLevelOptions,
            temperatureOptions: model.temperatureOptions,
            hasApiKey: Boolean(model.apiKey)
          }))
        };
      },
      async test(model) {
        return {
          modelId: model.id,
          ok: true,
          message: "连接成功",
          testedAt: new Date().toISOString()
        };
      },
      async listRemote() {
        return { models: [] };
      }
    },
    modelUsage: {
      async query() {
        return {
          generatedAt: new Date().toISOString(),
          totals: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 0,
            requestCount: 0
          },
          trendGranularity: "day",
          trend: [],
          models: [],
          modules: [],
          recentCalls: []
        };
      }
    },
    workspaceAgents: {
      async list() {
        return structuredClone(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS);
      },
      async save() {
        return structuredClone(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS);
      },
      async reset() {
        return structuredClone(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS);
      }
    },
    longAgents: {
      async list() {
        return structuredClone(DEFAULT_LONG_AGENT_SETTINGS);
      },
      async save() {
        return structuredClone(DEFAULT_LONG_AGENT_SETTINGS);
      },
      async reset() {
        return structuredClone(DEFAULT_LONG_AGENT_SETTINGS);
      }
    },
    longAgentTeams: {
      async list() {
        return structuredClone(DEFAULT_LONG_AGENT_TEAM_SETTINGS);
      },
      async save() {
        return structuredClone(DEFAULT_LONG_AGENT_TEAM_SETTINGS);
      }
    },
    agentTeams: {
      async list() {
        return structuredClone(DEFAULT_AGENT_TEAM_SETTINGS);
      },
      async save() {
        return structuredClone(DEFAULT_AGENT_TEAM_SETTINGS);
      }
    },
    libraryAgents: {
      async list() {
        return structuredClone(DEFAULT_LIBRARY_AGENT_SETTINGS);
      },
      async save() {
        return structuredClone(DEFAULT_LIBRARY_AGENT_SETTINGS);
      },
      async reset() {
        return structuredClone(DEFAULT_LIBRARY_AGENT_SETTINGS);
      }
    },
    learningImitationSettings: {
      async list() {
        throw new Error("Learning imitation settings are not used by conversation tests.");
      },
      async save() {
        throw new Error("Learning imitation settings are not used by conversation tests.");
      },
      async reset() {
        throw new Error("Learning imitation settings are not used by conversation tests.");
      }
    },
    workspaceDirectory: {
      async list() {
        return { path: null };
      },
      async choose() {
        return null;
      }
    },
    appearance: {
      async list() {
        return {
          persisted: false,
          settings: createDefaultAppearanceSettings()
        };
      },
      async save(settings) {
        return { persisted: true, settings };
      }
    },
    generalSettings: {
      async list() {
        return {
          persisted: false,
          settings: {
            permissionMode: "request-approval" as const,
            autoSave: false,
            language: "auto" as const,
            showInMenuBar: true
          }
        };
      },
      async save(settings) {
        return { persisted: true, settings };
      }
    },
    manuscript: {
      async exportLong() {
        throw new Error("Long manuscript export is not used by conversation tests.");
      },
      async exportShort() {
        throw new Error("Manuscript export is not used by conversation tests.");
      }
    },
    events: {
      subscribe() {
        return () => undefined;
      }
    }
  };
  return {
    api,
    prompts,
    aborts,
    resolveAccepted(index, payload) {
      pending[index]?.resolve(payload);
    },
    rejectPrompt(index, error) {
      pending[index]?.reject(error);
    },
    promptCount: () => prompts.length
  };
}

function eventOptions(sessionId: string, runId: string, id: string) {
  return {
    id,
    context: { correlationId: "cmd_1", sessionId, runId }
  };
}

function createMemoryStorage(): {
  options(
    key: string
  ): Pick<
    UseAgentConversationOptions,
    | "initialPersistenceSnapshot"
    | "onPersistenceSnapshot"
    | "onPersistenceRemove"
  >;
  getItem(key: string): unknown | null;
  setItem(key: string, value: unknown): void;
  removeItem(key: string): void;
} {
  const values = new Map<string, unknown>();
  return {
    options(key) {
      return {
        initialPersistenceSnapshot: structuredClone(values.get(key)),
        onPersistenceSnapshot(snapshot) {
          values.set(key, structuredClone(snapshot));
        },
        onPersistenceRemove() {
          values.delete(key);
        }
      };
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function storedConversation(
  sessionId: string,
  updatedAt: string,
  content: string
): AgentConversationPersistenceRecord {
  return {
    sessionId,
    messages: [
      {
        id: `user-${sessionId}`,
        role: "user",
        content,
        createdAt: updatedAt,
        status: "completed"
      }
    ],
    draft: "",
    approvalMode: "request-approval",
    createdAt: updatedAt,
    updatedAt,
    temperature: 0.7
  };
}

function createEditProposal(
  overrides: Partial<AgentEditProposal> = {}
): AgentEditProposal {
  return {
    id: "proposal_1",
    runId: "run_edit_1",
    workspaceId: "short_story_1",
    stageId: "plot_design",
    documentId: "short_plot_design",
    title: "剧情设计",
    summary: "调整雨夜相遇的因果关系",
    status: "pending",
    baseRevision: "v1:4:11111111",
    proposedRevision: "v1:5:22222222",
    proposedText: "新的剧情文本",
    toolCallIds: ["tool_edit_1"],
    additions: 1,
    deletions: 1,
    hunks: [
      {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        lines: [
          { type: "deletion", text: "旧句", oldLineNumber: 1 },
          { type: "addition", text: "新句", newLineNumber: 1 },
          {
            type: "context",
            text: "保留句",
            oldLineNumber: 2,
            newLineNumber: 2
          }
        ]
      }
    ],
    createdAt: "2026-07-19T11:00:00.000Z",
    updatedAt: "2026-07-19T11:00:00.000Z",
    ...overrides
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("agent conversation controller", () => {
  it("adds and replaces edit proposals with deep-cloned diff state", () => {
    const controller = useAgentConversation({ api: () => undefined });
    controller.messages.value = [{
      id: "run_edit_1_assistant",
      role: "assistant",
      content: "已生成修改建议",
      createdAt: "2026-07-19T11:00:00.000Z",
      runId: "run_edit_1",
      status: "completed"
    }];
    const proposal = createEditProposal();

    controller.upsertEditProposal("run_edit_1", proposal);
    proposal.toolCallIds.push("mutated_outside");
    proposal.hunks[0]!.lines[0]!.text = "外部改写";

    const storedProposal = controller.getEditProposal("run_edit_1", "proposal_1");
    expect(storedProposal).toMatchObject({
      summary: "调整雨夜相遇的因果关系",
      toolCallIds: ["tool_edit_1"]
    });
    expect(storedProposal?.hunks[0]?.lines[0]?.text).toBe("旧句");

    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        summary: "更新后的修改摘要",
        additions: 2,
        updatedAt: "2026-07-19T11:02:00.000Z"
      })
    );

    expect(controller.messages.value[0]?.editProposals).toHaveLength(1);
    expect(controller.getEditProposal("run_edit_1", "proposal_1")).toMatchObject({
      summary: "更新后的修改摘要",
      additions: 2,
      updatedAt: "2026-07-19T11:02:00.000Z"
    });
    controller.dispose();
  });

  it("updates completed-run proposal status and blocks sending while review is pending", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api });
    controller.messages.value = [{
      id: "run_edit_1_assistant",
      role: "assistant",
      content: "本轮已经完成",
      createdAt: "2026-07-19T11:00:00.000Z",
      runId: "run_edit_1",
      status: "completed"
    }];
    controller.upsertEditProposal("run_edit_1", createEditProposal());
    controller.draft.value = "基于修改继续创作";

    expect(controller.hasPendingEditReview.value).toBe(true);
    expect(controller.canSend.value).toBe(false);
    await controller.sendMessage(document);
    expect(deferred.promptCount()).toBe(0);

    expect(
      controller.updateEditProposal("run_edit_1", "proposal_1", {
        status: "accepting",
        statusMessage: "正在应用"
      })
    ).toMatchObject({ status: "accepting", statusMessage: "正在应用" });
    expect(controller.hasPendingEditReview.value).toBe(true);

    expect(
      controller.updateEditProposal("run_edit_1", "proposal_1", {
        status: "accepted",
        statusMessage: "已应用"
      })
    ).toMatchObject({ status: "accepted", statusMessage: "已应用" });
    expect(controller.hasPendingEditReview.value).toBe(false);
    expect(controller.canSend.value).toBe(true);
    controller.dispose();
  });

  it("unblocks sending after an in-flight proposal save fails", () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api });
    controller.messages.value = [{
      id: "run_edit_timeout_assistant",
      role: "assistant",
      content: "本轮已经完成",
      createdAt: "2026-07-19T11:00:00.000Z",
      runId: "run_edit_timeout",
      status: "completed"
    }];
    controller.upsertEditProposal(
      "run_edit_timeout",
      createEditProposal({ runId: "run_edit_timeout" })
    );
    controller.draft.value = "保存失败后继续沟通";

    controller.updateEditProposal("run_edit_timeout", "proposal_1", {
      status: "accepting",
      statusMessage: "正在保存"
    });
    expect(controller.canSend.value).toBe(false);

    controller.updateEditProposal("run_edit_timeout", "proposal_1", {
      status: "error",
      statusMessage: "保存超时"
    });
    expect(controller.hasPendingEditReview.value).toBe(false);
    expect(controller.canSend.value).toBe(true);
    controller.dispose();
  });

  it("freezes the selected approval mode for each in-flight run", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.selectApprovalMode("auto-approve");
    controller.draft.value = "自动写入这次正文修改";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);

    expect(deferred.prompts[0]?.writeApprovalMode).toBe("auto-approve");

    expect(controller.acceptsRunEvent(sessionId, "run_auto_approval")).toBe(true);
    expect(controller.approvalModeForRun(sessionId, "run_auto_approval")).toBe(
      "auto-approve"
    );

    controller.selectApprovalMode("request-approval");
    expect(controller.approvalMode.value).toBe("request-approval");
    expect(controller.approvalModeForRun(sessionId, "run_auto_approval")).toBe(
      "auto-approve"
    );

    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_auto_approval",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(controller.approvalModeForRun(sessionId, "run_auto_approval")).toBe(
      "auto-approve"
    );
    controller.dispose();
  });

  it("restores a validated structured snapshot into a pristine controller", async () => {
    const snapshot: AgentConversationPersistenceSnapshot = {
      version: 1,
      activeSessionId: "session-restored",
      conversations: [
        storedConversation(
          "session-restored",
          "2026-08-14T01:00:00.000Z",
          "从异步存储恢复的消息"
        )
      ]
    };
    snapshot.conversations[0]!.draft = "从异步存储恢复的草稿";
    const controller = useAgentConversation({ api: () => undefined });

    await expect(controller.restorePersistenceSnapshot(snapshot)).resolves.toBe(true);
    expect(controller.sessionId.value).toBe("session-restored");
    expect(controller.messages.value[0]?.content).toBe("从异步存储恢复的消息");
    expect(controller.draft.value).toBe("从异步存储恢复的草稿");
    controller.dispose();
  });

  it("does not let a late persistence snapshot overwrite a local edit", async () => {
    const snapshot: AgentConversationPersistenceSnapshot = {
      version: 1,
      activeSessionId: "session-stale",
      conversations: [
        storedConversation(
          "session-stale",
          "2026-08-14T01:00:00.000Z",
          "已经过时的历史消息"
        )
      ]
    };
    const controller = useAgentConversation({ api: () => undefined });

    const restoring = controller.restorePersistenceSnapshot(snapshot);
    controller.draft.value = "用户刚刚输入的新草稿";

    await expect(restoring).resolves.toBe(false);
    expect(controller.draft.value).toBe("用户刚刚输入的新草稿");
    expect(controller.messages.value).toEqual([]);
    controller.dispose();
  });

  it("restores a snapshot that omitted draft and temperature", async () => {
    const controller = useAgentConversation({ api: () => undefined });
    await expect(
      controller.restorePersistenceSnapshot({
        version: 1,
        activeSessionId: "session-legacy",
        conversations: [
          {
            sessionId: "session-legacy",
            messages: [
              {
                id: "user-legacy",
                role: "user",
                content: "检查设定冲突",
                createdAt: "2026-08-15T07:51:00.000Z"
              }
            ],
            createdAt: "2026-08-15T07:51:00.000Z",
            updatedAt: "2026-08-15T07:51:09.000Z"
          }
        ]
      })
    ).resolves.toBe(true);
    expect(controller.sessionId.value).toBe("session-legacy");
    expect(controller.messages.value[0]?.content).toBe("检查设定冲突");
    expect(controller.draft.value).toBe("");
    expect(controller.temperature.value).toBe(0.7);
    controller.dispose();
  });

  it("keeps valid conversations when one stored session cannot be parsed", async () => {
    const controller = useAgentConversation({ api: () => undefined });
    await expect(
      controller.restorePersistenceSnapshot({
        version: 1,
        activeSessionId: "session-valid",
        conversations: [
          storedConversation(
            "session-valid",
            "2026-08-15T07:51:00.000Z",
            "检查设定冲突"
          ),
          { sessionId: "session-invalid", messages: "invalid" }
        ]
      })
    ).resolves.toBe(true);
    expect(controller.sessionId.value).toBe("session-valid");
    expect(controller.history.value).toHaveLength(1);
    controller.dispose();
  });

  it("does not persist while hydration is holding writes", () => {
    const snapshots: AgentConversationPersistenceSnapshot[] = [];
    const controller = useAgentConversation({
      api: () => undefined,
      onPersistenceSnapshot(snapshot) {
        snapshots.push(snapshot);
      }
    });

    controller.holdPersistenceEmits();
    controller.draft.value = "水合完成前不应落盘";
    expect(snapshots).toEqual([]);
    controller.releasePersistenceEmits();
    controller.draft.value = "水合完成后可以落盘";
    expect(snapshots.at(-1)).toMatchObject({
      conversations: [{ draft: "水合完成后可以落盘" }]
    });
    controller.dispose();
  });

  it("rejects malformed snapshots without changing the active conversation", async () => {
    const controller = useAgentConversation({ api: () => undefined });
    const originalSessionId = controller.sessionId.value;

    await expect(
      controller.restorePersistenceSnapshot({
        version: 1,
        activeSessionId: "session-invalid",
        conversations: [{ sessionId: "session-invalid", messages: "invalid" }]
      })
    ).resolves.toBe(false);
    expect(controller.sessionId.value).toBe(originalSessionId);
    expect(controller.messages.value).toEqual([]);
    controller.dispose();
  });

  it("emits structured snapshots on changes but does not write during dispose", () => {
    const snapshots: AgentConversationPersistenceSnapshot[] = [];
    const controller = useAgentConversation({
      api: () => undefined,
      onPersistenceSnapshot(snapshot) {
        snapshots.push(snapshot);
      }
    });

    controller.draft.value = "需要持久化的草稿";
    expect(snapshots.at(-1)).toMatchObject({
      version: 1,
      activeSessionId: controller.sessionId.value,
      conversations: [{ draft: "需要持久化的草稿" }]
    });
    const writesBeforeDispose = snapshots.length;

    controller.dispose();
    expect(snapshots).toHaveLength(writesBeforeDispose);
  });

  it("can emit a cheap dirty signal and defer structured snapshot capture", () => {
    const changes: string[] = [];
    const eagerSnapshots: AgentConversationPersistenceSnapshot[] = [];
    const controller = useAgentConversation({
      api: () => undefined,
      onPersistenceChange() {
        changes.push("changed");
      },
      onPersistenceSnapshot(snapshot) {
        eagerSnapshots.push(snapshot);
      }
    });

    controller.draft.value = "输入热路径不复制整份历史";
    expect(changes).toEqual(["changed"]);
    expect(eagerSnapshots).toEqual([]);
    expect(controller.capturePersistenceSnapshot()).toMatchObject({
      conversations: [{ draft: "输入热路径不复制整份历史" }]
    });
    controller.dispose();
  });

  it("persists the approval mode with its conversation", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-approval-mode-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(controller.approvalMode.value).toBe("request-approval");
    controller.draft.value = "保留这份对话草稿";
    controller.selectApprovalMode("auto-approve");
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.approvalMode.value).toBe("auto-approve");
    restored.dispose();
  });

  it("stores and restores the evaluation snapshot on its assistant run", async () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-evaluation-snapshot-test";
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      ...storage.options(persistenceKey),
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "评估这一轮";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    const runId = "run_evaluation_snapshot";

    controller.handleEvent(
      createEnvelope(
        "agent.evaluation_snapshot",
        {
          sessionId,
          runId,
          messageId: `${runId}_assistant`,
          runtime,
          snapshot: {
            schemaVersion: 1 as const,
            capturedAt: "2026-08-13T00:00:00.000Z",
            systemPrompt: "最终系统提示词",
            runtimeContext: {
              kind: "initial-session-context" as const,
              text: "运行时上下文与用户消息"
            },
            tools: [
              {
                name: "read_fixture",
                label: "读取夹具",
                description: "读取评估夹具。",
                inputSchema: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"]
                }
              }
            ]
          }
        },
        {
          id: "event_evaluation_snapshot",
          context: { sessionId, runId }
        }
      )
    );
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.messages.value.find((message) => message.runId === runId))
      .toMatchObject({
        evaluationSnapshot: {
          systemPrompt: "最终系统提示词",
          runtimeContext: { text: "运行时上下文与用户消息" },
          tools: [
            {
              name: "read_fixture",
              inputSchema: { type: "object" }
            }
          ]
        }
      });
    restored.dispose({ clearPersistence: true });
  });

  it("keeps a late evaluation snapshot after the run has already completed", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "补齐评估历史";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    const runId = "run_late_evaluation_history";
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId: `${runId}_assistant`,
          role: "assistant" as const,
          content: "本轮已完成。",
          runtime
        },
        eventOptions(sessionId, runId, "evt_late_eval_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.evaluation_snapshot",
        {
          sessionId,
          runId,
          messageId: `${runId}_assistant`,
          runtime,
          snapshot: {
            schemaVersion: 1 as const,
            capturedAt: "2026-08-15T09:00:00.000Z",
            systemPrompt: "最终系统提示词",
            runtimeContext: {
              kind: "turn-context" as const,
              text: "补齐评估历史"
            },
            tools: [],
            conversationHistory: [
              { role: "user" as const, text: "补齐评估历史" },
              { role: "assistant" as const, text: "本轮已完成。" }
            ]
          }
        },
        eventOptions(sessionId, runId, "evt_late_eval_snapshot")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "completed",
      evaluationSnapshot: {
        conversationHistory: [
          { role: "user", text: "补齐评估历史" },
          { role: "assistant", text: "本轮已完成。" }
        ]
      }
    });
    controller.dispose();
  });

  it("still persists conversation history when an evaluation snapshot cannot be cloned", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-invalid-evaluation-snapshot-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.messages.value = [
      {
        id: "user-keep-history",
        role: "user",
        content: "根据第一个大纲规划剧情点",
        createdAt: "2026-08-15T10:00:00.000Z",
        status: "completed"
      },
      {
        id: "assistant-invalid-eval",
        role: "assistant",
        content: "已创建剧情点",
        createdAt: "2026-08-15T10:00:01.000Z",
        status: "stopped",
        evaluationSnapshot: {
          schemaVersion: 1,
          capturedAt: "not-a-timestamp",
          systemPrompt: "系统提示词",
          runtimeContext: { kind: "turn-context", text: "用户消息" },
          tools: [],
          conversationHistory: [{ role: "assistant", text: "", toolName: "" }]
        } as never
      }
    ];
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.messages.value.map((message) => message.content)).toEqual([
      "根据第一个大纲规划剧情点",
      "已创建剧情点"
    ]);
    expect(restored.messages.value[1]?.evaluationSnapshot).toBeUndefined();
    restored.dispose({ clearPersistence: true });
  });

  it("clears persisted conversations when a project runtime is disposed", async () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-project-removal-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.draft.value = "不应在删除项目后恢复";
    controller.dispose({ clearPersistence: true });
    await Promise.resolve();

    expect(storage.getItem(persistenceKey)).toBeNull();
    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.draft.value).toBe("");
    expect(restored.messages.value).toEqual([]);
    restored.dispose({ clearPersistence: true });
  });

  it("persists edit proposals and restores interrupted acceptance as pending", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-edit-proposal-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    const interruptedProposal = createEditProposal({
      status: "accepting",
      truncated: true,
      statusMessage: "正在写入",
      laneId: "run_edit_1:short_story_1:draft:body",
      generation: 2,
      approvalMode: "auto-approve",
      predecessorProposalId: "proposal_0",
      sourceBaseRevision: "v1:5:22222222",
      decisionToken: "commit-token-2"
    });
    delete interruptedProposal.proposedText;
    controller.upsertEditProposal("run_edit_1", interruptedProposal);
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.getEditProposal("run_edit_1", "proposal_1")).toMatchObject({
      status: "pending",
      truncated: true,
      statusMessage: "正在写入",
      laneId: "run_edit_1:short_story_1:draft:body",
      generation: 2,
      approvalMode: "auto-approve",
      predecessorProposalId: "proposal_0",
      sourceBaseRevision: "v1:5:22222222",
      decisionToken: "commit-token-2",
      hunks: [
        {
          lines: [
            { type: "deletion", text: "旧句" },
            { type: "addition", text: "新句" },
            { type: "context", text: "保留句" }
          ]
        }
      ]
    });
    expect(restored.getEditProposal("run_edit_1", "proposal_1")).not.toHaveProperty(
      "proposedText"
    );
    expect(restored.hasPendingEditReview.value).toBe(true);
    restored.dispose();
  });

  it("persists accepted draft section ids for dependent proposal recovery", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-draft-section-mapping-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        stageId: "draft",
        documentId: "draft-section-creation:proposal_1",
        title: "创建 1 个空白章节",
        status: "accepted",
        proposedText: undefined,
        draftSectionCreationTarget: {
          sections: [{
            title: "第一节",
            wordCountRequirement: "1200 字",
            provisionalSectionId: "pending:section:proposal_1:1",
            realSectionId: "section_real_1"
          }],
          baseProjectRevision: 7,
          acceptedDirectoryRevision: "v1:12:1234abcd"
        }
      })
    );
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(
      restored.getEditProposal("run_edit_1", "proposal_1")
        ?.draftSectionCreationTarget
    ).toEqual({
      sections: [{
        title: "第一节",
        wordCountRequirement: "1200 字",
        provisionalSectionId: "pending:section:proposal_1:1",
        realSectionId: "section_real_1"
      }],
      baseProjectRevision: 7,
      acceptedDirectoryRevision: "v1:12:1234abcd"
    });
    restored.dispose();
  });

  it("persists draft section rename targets for the standard approval card", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-draft-section-rename-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        stageId: "draft",
        documentId: "draft-section-rename:proposal_1",
        title: "修改章节名称：旧名 → 新名",
        status: "pending",
        proposedText: "旧名 → 新名",
        draftSectionRenameTarget: {
          sectionId: "section-1",
          previousTitle: "旧名",
          title: "新名",
          baseProjectRevision: 3
        }
      })
    );
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(
      restored.getEditProposal("run_edit_1", "proposal_1")
        ?.draftSectionRenameTarget
    ).toEqual({
      sectionId: "section-1",
      previousTitle: "旧名",
      title: "新名",
      baseProjectRevision: 3
    });
    restored.dispose();
  });

  it("persists draft section deletion targets for the standard approval card", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-draft-section-deletion-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        stageId: "draft",
        documentId: "draft-section-deletion:proposal_1",
        title: "删除章节：旧名",
        status: "pending",
        proposedText: "删除：旧名",
        draftSectionDeletionTarget: {
          sectionId: "section-1",
          title: "旧名",
          baseProjectRevision: 4
        }
      })
    );
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(
      restored.getEditProposal("run_edit_1", "proposal_1")
        ?.draftSectionDeletionTarget
    ).toEqual({
      sectionId: "section-1",
      title: "旧名",
      baseProjectRevision: 4
    });
    restored.dispose();
  });

  it("persists long worldbuilding targets for the standard approval card", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-long-worldbuilding-proposal-test";
    const file = createEmptyLongMarkdownFileReference(
      longWorldbuildingItemFileId("worlditem_memory"),
      longWorldbuildingItemContentPath(
        "world_rules",
        "worlditem_memory"
      ),
      "2026-07-30T12:00:00.000Z"
    );
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        workspaceId: "long:longbook_test",
        stageId: "long-worldbuilding",
        documentId: file.id,
        title: "记忆代价",
        baseRevision: `long-missing:${file.id}`,
        proposedRevision: file.revision,
        proposedText: "",
        longWorldbuildingTarget: {
          bookId: "longbook_test",
          baseProjectRevision: 11,
          batch: {
            baseRevision: 7,
            updatedAt: "2026-07-30T12:00:00.000Z",
            operations: [{
              type: "worldbuildingItem.create",
              categoryId: "world_rules",
              item: {
                id: "worlditem_memory",
                title: "记忆代价",
                order: 1,
                file
              }
            }],
            documentWrites: []
          },
          file: {
            categoryId: "world_rules",
            itemId: "worlditem_memory",
            fileId: file.id,
            filePath: file.path,
            title: "记忆代价",
            operation: "create",
            beforeText: "",
            afterText: "",
            beforeRevision: null,
            nextRevision: file.revision
          }
        }
      })
    );
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(
      restored.getEditProposal("run_edit_1", "proposal_1")
        ?.longWorldbuildingTarget
    ).toMatchObject({
      bookId: "longbook_test",
      baseProjectRevision: 11,
      file: {
        itemId: "worlditem_memory",
        operation: "create",
        beforeRevision: null
      },
      batch: {
        operations: [{ type: "worldbuildingItem.create" }],
        documentWrites: []
      }
    });
    restored.dispose();
  });

  it("persists long character targets for the standard approval card", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-long-character-proposal-test";
    const file = createEmptyLongMarkdownFileReference(
      longCharacterCoreProfileFileId("character_memory"),
      longCharacterFilePath("character_memory", "core-profile.md"),
      "2026-07-30T12:00:00.000Z"
    );
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        workspaceId: "long:longbook_test",
        stageId: "long-character",
        documentId: file.id,
        title: "林岚 / 核心档案",
        baseRevision: file.revision,
        proposedRevision: "v1:4:12345678",
        proposedText: "新的核心档案",
        longCharacterTarget: {
          bookId: "longbook_test",
          baseProjectRevision: 11,
          batch: {
            baseRevision: 7,
            updatedAt: "2026-07-30T12:00:00.000Z",
            operations: [],
            documentWrites: [{
              proposalId: "proposal_character_memory",
              fileId: file.id,
              content: "新的核心档案",
              mode: "replace",
              expectedRevision: file.revision,
              nextRevision: "v1:4:12345678",
              updatedAt: "2026-07-30T12:00:00.000Z",
              reason: "更新人物核心档案"
            }]
          },
          files: [{
            characterId: "character_memory",
            characterName: "林岚",
            document: "core_profile",
            fileId: file.id,
            filePath: file.path,
            title: "林岚 / 核心档案",
            operation: "edit",
            beforeText: "旧的核心档案",
            afterText: "新的核心档案",
            beforeRevision: file.revision,
            nextRevision: "v1:4:12345678"
          }]
        }
      })
    );
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(
      restored.getEditProposal("run_edit_1", "proposal_1")
        ?.longCharacterTarget
    ).toMatchObject({
      bookId: "longbook_test",
      baseProjectRevision: 11,
      files: [{
        characterId: "character_memory",
        document: "core_profile",
        operation: "edit"
      }]
    });
    restored.dispose();
  });

  it("persists long plot design targets for the standard approval card", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-long-plot-design-proposal-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        workspaceId: "long:longbook_test",
        stageId: "long-plot-design",
        documentId: "plot-design",
        title: "剧情设计变更",
        baseRevision: "long-plot:11:7",
        proposedRevision: "long-plot:11:7:tool_edit_1",
        proposedText: "创建第二卷",
        longPlotDesignTarget: {
          bookId: "longbook_test",
          baseProjectRevision: 11,
          appliedProjectRevision: 12,
          batch: {
            baseRevision: 7,
            updatedAt: "2026-07-30T12:00:00.000Z",
            operations: [{
              type: "volume.create",
              volume: {
                id: "volume_second",
                title: "第二卷",
                order: 2,
                summary: "主角进入北境"
              }
            }],
            documentWrites: []
          }
        }
      })
    );
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(
      restored.getEditProposal("run_edit_1", "proposal_1")
        ?.longPlotDesignTarget
    ).toMatchObject({
      bookId: "longbook_test",
      baseProjectRevision: 11,
      appliedProjectRevision: 12,
      batch: {
        operations: [{
          type: "volume.create",
          volume: { id: "volume_second", title: "第二卷" }
        }],
        documentWrites: []
      }
    });
    restored.dispose();
  });

  it("still persists a plot design proposal after accept clears proposedText", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-long-plot-design-accept-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        workspaceId: "long:longbook_test",
        stageId: "long-plot-design",
        documentId: "plot-design",
        title: "剧情设计变更",
        baseRevision: "long-plot:11:7",
        proposedRevision: "long-plot:11:7:tool_edit_1",
        proposedText: "创建第二卷",
        longPlotDesignTarget: {
          bookId: "longbook_test",
          baseProjectRevision: 11,
          batch: {
            baseRevision: 7,
            updatedAt: "2026-07-30T12:00:00.000Z",
            operations: [{
              type: "volume.create",
              volume: {
                id: "volume_second",
                title: "第二卷",
                order: 2,
                summary: "主角进入北境"
              }
            }],
            documentWrites: []
          }
        }
      })
    );
    controller.updateEditProposal("run_edit_1", "proposal_1", {
      status: "accepted",
      proposedText: undefined,
      statusMessage: "已自动批准并保存剧情设计。"
    });
    expect(
      controller.capturePersistenceSnapshot().conversations[0]?.messages[0]
    ).toMatchObject({
      editProposals: [{
        status: "accepted",
        statusMessage: "已自动批准并保存剧情设计。",
        longPlotDesignTarget: { bookId: "longbook_test" }
      }]
    });
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.getEditProposal("run_edit_1", "proposal_1")).toMatchObject({
      status: "accepted",
      longPlotDesignTarget: { bookId: "longbook_test" }
    });
    expect(
      restored.getEditProposal("run_edit_1", "proposal_1")?.proposedText
    ).toBeUndefined();
    restored.dispose();
  });

  it("persists the target metadata required to review a library creation", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-library-proposal-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.upsertEditProposal(
      "run_edit_1",
      createEditProposal({
        workspaceId: "library:material:library-1",
        stageId: "library",
        documentId: "library-create:tool-1",
        title: "人物甲",
        baseRevision: createShortWorkspaceContentRevision(""),
        proposedRevision: createShortWorkspaceContentRevision("人物素材"),
        proposedText: "人物素材",
        libraryTarget: {
          operation: "create",
          domain: "material",
          libraryId: "library-1",
          stageId: "character",
          baseProjectRevision: 3
        }
      })
    );
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.getEditProposal("run_edit_1", "proposal_1")).toMatchObject({
      stageId: "library",
      libraryTarget: {
        operation: "create",
        domain: "material",
        libraryId: "library-1",
        stageId: "character",
        baseProjectRevision: 3
      }
    });
    restored.dispose();
  });

  it("persists subagent details and restores interrupted child runs as stopped", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-subagent-history-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    controller.messages.value = [{
      id: "assistant-subagent-history",
      role: "assistant",
      content: "",
      createdAt: "2026-07-24T02:00:00.000Z",
      runId: "run_subagent_history",
      status: "completed",
      subagentRuns: [{
        parentToolCallId: "spawn_history",
        subagentRunId: "subrun_history",
        subagentId: "researcher",
        name: "资料员",
        task: "检查旧设定",
        status: "running",
        runtime,
        thinking: "正在检查",
        output: "已经找到两条相关设定。",
        summary: "等待父智能体接收。",
        usage: {
          inputTokens: 30,
          outputTokens: 10,
          cacheReadTokens: 2,
          cacheWriteTokens: 0,
          totalTokens: 42
        },
        toolCalls: [{
          id: "subtool_history",
          name: "read_workspace_content",
          args: { stage: "outline" },
          status: "running",
          requestedAt: "2026-07-24T02:00:01.000Z"
        }],
        processingSteps: [{
          id: "substep_history",
          type: "tool",
          toolCallId: "subtool_history",
          createdAt: "2026-07-24T02:00:01.000Z"
        }],
        startedAt: "2026-07-24T02:00:00.000Z"
      }]
    }];
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.messages.value[0]?.subagentRuns?.[0]).toMatchObject({
      subagentRunId: "subrun_history",
      status: "stopped",
      thinking: "正在检查",
      output: "已经找到两条相关设定。",
      summary: "等待父智能体接收。",
      usage: { totalTokens: 42 },
      errorMessage: "应用关闭或对话恢复时，子任务仍在运行。",
      toolCalls: [{
        id: "subtool_history",
        status: "error",
        isError: true
      }]
    });
    expect(
      restored.messages.value[0]?.subagentRuns?.[0]?.completedAt
    ).toBeTruthy();
    restored.dispose();
  });

  it("persists conversation history and restores a selected conversation", () => {
    const storage = createMemoryStorage();
    const persistenceKey = "conversation-history-test";
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    const firstSessionId = controller.sessionId.value;
    controller.messages.value = [{
      id: "first-user",
      role: "user",
      content: "分析第一章的人物动机",
      createdAt: "2026-07-19T10:00:00.000Z",
      status: "completed"
    }];

    controller.newConversation();
    const secondSessionId = controller.sessionId.value;
    controller.messages.value = [{
      id: "second-user",
      role: "user",
      content: "继续完善雨夜场景",
      createdAt: "2026-07-19T10:05:00.000Z",
      status: "completed"
    }];
    controller.draft.value = "补充环境细节";

    expect(controller.history.value).toHaveLength(2);
    expect(controller.history.value[0]).toMatchObject({
      sessionId: secondSessionId,
      title: "继续完善雨夜场景",
      current: true
    });
    expect(controller.selectConversation(firstSessionId)).toBe(true);
    expect(controller.messages.value[0]?.content).toBe("分析第一章的人物动机");
    expect(controller.sessionId.value).toBe(firstSessionId);
    controller.dispose();

    const restored = useAgentConversation({
      api: () => undefined,
      ...storage.options(persistenceKey)
    });
    expect(restored.sessionId.value).toBe(firstSessionId);
    expect(restored.history.value).toHaveLength(2);
    expect(restored.selectConversation(secondSessionId)).toBe(true);
    expect(restored.draft.value).toBe("补充环境细节");
    restored.dispose();
  });

  it("merges structured conversation snapshots into one validated history", () => {
    const activeSessionId = "session-target-active";
    const activeTimestamp = "2026-07-01T00:00:00.000Z";
    const target: AgentConversationPersistenceSnapshot = {
      version: 1,
      activeSessionId,
      conversations: [
        storedConversation(activeSessionId, activeTimestamp, "统一桶旧内容")
      ]
    };
    const sourceConversations = [
      storedConversation(
        activeSessionId,
        "2026-07-01T01:00:00.000Z",
        "同一 session 的较新内容"
      ),
      ...Array.from({ length: 19 }, (_, index) =>
        storedConversation(
          `session-source-${index}`,
          new Date(Date.UTC(2026, 6, 2, 0, index)).toISOString(),
          `章卡历史 ${index}`
        )
      )
    ];
    const source: AgentConversationPersistenceSnapshot = {
      version: 1,
      activeSessionId: "session-source-20",
      conversations: sourceConversations
    };
    const secondSource: AgentConversationPersistenceSnapshot = {
      version: 1,
      activeSessionId: "session-source-38",
      conversations: Array.from({ length: 20 }, (_, index) => {
        const sourceIndex = index + 19;
        return storedConversation(
          `session-source-${sourceIndex}`,
          new Date(Date.UTC(2026, 6, 2, 1, index)).toISOString(),
          `章卡历史 ${sourceIndex}`
        );
      })
    };

    const merged = mergeAgentConversationPersistenceSnapshots(target, [
      source,
      secondSource,
      "invalid structured snapshot",
      source
    ]);

    expect(merged?.activeSessionId).toBe(activeSessionId);
    expect(merged?.conversations).toHaveLength(20);
    expect(
      merged?.conversations.find(
        (conversation) => conversation.sessionId === activeSessionId
      )?.messages[0]?.content
    ).toBe("同一 session 的较新内容");
    expect(
      merged?.conversations.some(
        (conversation) => conversation.sessionId === "session-source-0"
      )
    ).toBe(false);
  });

  it("keeps only the 20 most recent conversations", () => {
    const storage = createMemoryStorage();
    const controller = useAgentConversation({
      api: () => undefined,
      ...storage.options("conversation-history-limit-test")
    });

    for (let index = 0; index < 22; index += 1) {
      controller.messages.value = [{
        id: `user-${index}`,
        role: "user",
        content: `历史对话 ${index}`,
        createdAt: new Date(Date.UTC(2026, 6, 19, 10, index)).toISOString(),
        status: "completed"
      }];
      controller.newConversation();
    }

    expect(controller.history.value).toHaveLength(20);
    expect(controller.history.value.some((item) => item.title === "历史对话 0")).toBe(false);
    expect(controller.history.value.some((item) => item.title === "历史对话 1")).toBe(false);
    expect(controller.history.value.some((item) => item.title === "历史对话 21")).toBe(true);
    controller.dispose();
  });

  it("uses the configured default model thinking level and carries model identity", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.applyModelSettings({
      defaultModelId: "writer",
      models: [
        {
          id: "writer",
          label: "Writer",
          provider: "openai",
          modelId: "writer-model",
          api: "openai-responses",
          baseUrl: "https://api.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "high",
          thinkingLevelOptions: ["low", "high"],
          temperatureOptions: [0.1, 0.7, 1],
          hasApiKey: true
        }
      ]
    });

    expect(controller.selectedModelId.value).toBe("writer");
    expect(controller.thinkingLevel.value).toBe("high");
    controller.selectThinkingLevel("medium");
    expect(controller.thinkingLevel.value).toBe("high");
    controller.draft.value = "按默认配置运行";
    const sending = controller.sendMessage(document);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_model",
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "openai", model: "writer-model", mode: "provider" }
    });
    await sending;

    expect(deferred.prompts[0]).toMatchObject({
      modelId: "writer",
      thinkingLevel: "high"
    });
    controller.dispose();
  });

  it("keeps the latest run choices when starting or reopening a conversation", () => {
    const controller = useAgentConversation({
      api: () => undefined
    });
    controller.applyModelSettings({
      defaultModelId: "writer",
      models: [
        {
          id: "writer",
          label: "Writer",
          provider: "openai",
          modelId: "writer-model",
          api: "openai-responses",
          baseUrl: "https://api.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "high",
          thinkingLevelOptions: ["low", "high"],
          temperatureOptions: [0.2, 0.6, 1.2],
          hasApiKey: true
        }
      ]
    });
    controller.messages.value = [{
      id: "first-user",
      role: "user",
      content: "第一条对话",
      createdAt: "2026-07-22T08:00:00.000Z",
      status: "completed"
    }];
    const firstSessionId = controller.sessionId.value;
    controller.selectThinkingLevel("off");
    controller.selectTemperature(1.2);
    controller.selectApprovalMode("auto-approve");

    controller.newConversation();
    expect(controller.selectedModelId.value).toBe("writer");
    expect(controller.thinkingLevel.value).toBe("off");
    expect(controller.temperature.value).toBe(1.2);
    expect(controller.approvalMode.value).toBe("auto-approve");

    controller.selectThinkingLevel("low");
    controller.selectApprovalMode("request-approval");
    expect(controller.selectConversation(firstSessionId)).toBe(true);
    expect(controller.selectedModelId.value).toBe("writer");
    expect(controller.thinkingLevel.value).toBe("low");
    expect(controller.temperature.value).toBe(1.2);
    expect(controller.approvalMode.value).toBe("request-approval");
    controller.dispose();
  });

  it("preserves valid run choices when model settings are refreshed", () => {
    const controller = useAgentConversation({ api: () => undefined });
    const settings: ModelSettings = {
      defaultModelId: "writer",
      models: [
        {
          id: "writer",
          label: "Writer",
          provider: "openai",
          modelId: "writer-model",
          api: "openai-responses",
          baseUrl: "https://api.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "high",
          thinkingLevelOptions: ["low", "high"],
          temperatureOptions: [0.2, 0.6, 1.2],
          hasApiKey: true
        }
      ]
    };
    controller.applyModelSettings(settings);
    controller.selectThinkingLevel("off");
    controller.selectTemperature(1.2);
    controller.selectApprovalMode("auto-approve");

    controller.applyModelSettings(settings);

    expect(controller.selectedModelId.value).toBe("writer");
    expect(controller.thinkingLevel.value).toBe("off");
    expect(controller.temperature.value).toBe(1.2);
    expect(controller.approvalMode.value).toBe("auto-approve");
    controller.dispose();
  });

  it("clears a persisted model choice when all configured models are removed", () => {
    const controller = useAgentConversation({ api: () => undefined });
    controller.applyModelSettings({
      defaultModelId: "writer",
      models: [
        {
          id: "writer",
          label: "Writer",
          provider: "openai",
          modelId: "writer-model",
          api: "openai-responses",
          baseUrl: "https://api.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "high",
          thinkingLevelOptions: ["low", "high"],
          temperatureOptions: [0.2, 0.6, 1.2],
          hasApiKey: true
        }
      ]
    });
    controller.selectThinkingLevel("off");
    controller.selectTemperature(1.2);
    controller.selectApprovalMode("auto-approve");

    controller.applyModelSettings({ defaultModelId: "", models: [] });
    controller.applyRunSettings({
      selectedModelId: "writer",
      thinkingLevel: "off",
      temperature: 1.2,
      approvalMode: "auto-approve"
    });

    expect(controller.selectedModelId.value).toBe("");
    expect(controller.thinkingLevel.value).toBe("medium");
    expect(controller.temperature.value).toBe(0.7);
    expect(controller.approvalMode.value).toBe("auto-approve");
    controller.dispose();
  });

  it("falls back to the new default settings when the selected model is removed", () => {
    const controller = useAgentConversation({ api: () => undefined });
    controller.applyRunSettings({
      selectedModelId: "removed-writer",
      thinkingLevel: "low",
      temperature: 1.2,
      approvalMode: "request-approval"
    });
    controller.applyModelSettings({
      defaultModelId: "replacement",
      models: [
        {
          id: "replacement",
          label: "Replacement",
          provider: "openai",
          modelId: "replacement-model",
          api: "openai-responses",
          baseUrl: "https://api.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "high",
          thinkingLevelOptions: ["low", "high"],
          temperatureOptions: [0.2, 0.6, 1.2],
          hasApiKey: true
        }
      ]
    });

    expect(controller.selectedModelId.value).toBe("replacement");
    expect(controller.thinkingLevel.value).toBe("high");
    expect(controller.temperature.value).toBe(0.6);
    controller.dispose();
  });

  it("sends attachment-only prompts and stores only display metadata", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    expect(controller.canSend.value).toBe(false);
    expect(controller.canSendAttachments.value).toBe(true);

    const proxiedAttachments = reactive([
      {
        id: "notes",
        kind: "text",
        name: "notes.md",
        mediaType: "text/markdown",
        size: 12,
        content: "雨夜，旧站台。"
      },
      {
        id: "reference",
        kind: "image",
        name: "reference.png",
        mediaType: "image/png",
        size: 3,
        data: "AQID"
      }
    ] as const);
    const sending = controller.sendMessage(document, [], {}, [...proxiedAttachments]);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_attachments",
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "openai", model: "vision-model", mode: "provider" }
    });
    await sending;

    expect(deferred.prompts[0]).toMatchObject({
      message: "请阅读并分析我上传的附件。",
      attachments: [
        { kind: "text", content: "雨夜，旧站台。" },
        { kind: "image", data: "AQID" }
      ]
    });
    expect(() => structuredClone(deferred.prompts[0]?.attachments)).not.toThrow();
    expect(controller.messages.value[0]).toMatchObject({
      role: "user",
      attachments: [
        { kind: "text", name: "notes.md" },
        { kind: "image", name: "reference.png" }
      ]
    });
    expect(controller.messages.value[0]?.attachments?.[1]).not.toHaveProperty("data");
    controller.dispose();
  });

  it("uses temperature when a reasoning model turns thinking off", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.applyModelSettings({
      defaultModelId: "reasoning-writer",
      models: [
        {
          id: "reasoning-writer",
          label: "Reasoning writer",
          provider: "openai",
          modelId: "reasoning-writer-model",
          api: "openai-responses",
          baseUrl: "https://api.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "high",
          thinkingLevelOptions: ["low", "high"],
          temperatureOptions: [0.2, 0.6, 1.2],
          hasApiKey: true
        }
      ]
    });

    controller.selectThinkingLevel("off");
    controller.selectTemperature(1.2);
    expect(controller.thinkingLevel.value).toBe("off");
    expect(controller.temperature.value).toBe(1.2);

    controller.draft.value = "关闭思考并提高表达变化";
    const sending = controller.sendMessage(document);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_reasoning_temperature",
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "openai", model: "reasoning-writer-model", mode: "provider" }
    });
    await sending;

    expect(deferred.prompts[0]).toMatchObject({
      modelId: "reasoning-writer",
      thinkingLevel: "off",
      temperature: 1.2
    });
    controller.dispose();
  });

  it("uses only configured temperatures when a model defaults to non-thinking mode", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.applyModelSettings({
      defaultModelId: "plain-writer",
      models: [
        {
          id: "plain-writer",
          label: "Plain writer",
          provider: "deepseek",
          modelId: "deepseek-chat",
          api: "openai-completions",
          baseUrl: "https://deepseek.example.test/v1",
          reasoning: false,
          defaultThinkingLevel: "off",
          thinkingLevelOptions: ["medium"],
          temperatureOptions: [0.2, 0.6, 1.2],
          hasApiKey: true
        }
      ]
    });

    expect(controller.thinkingLevel.value).toBe("off");
    expect(controller.temperature.value).toBe(0.6);
    controller.selectTemperature(1.5);
    expect(controller.temperature.value).toBe(0.6);
    controller.selectTemperature(1.2);
    controller.draft.value = "使用更有变化的表达";
    const sending = controller.sendMessage(document);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_temperature",
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "deepseek", model: "deepseek-chat", mode: "provider" }
    });
    await sending;

    expect(deferred.prompts[0]).toMatchObject({
      modelId: "plain-writer",
      thinkingLevel: "off",
      temperature: 1.2
    });
    controller.dispose();
  });

  it("can turn thinking on when a model defaults to non-thinking mode", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.applyModelSettings({
      defaultModelId: "plain-writer",
      models: [
        {
          id: "plain-writer",
          label: "Plain writer",
          provider: "deepseek",
          modelId: "deepseek-chat",
          api: "openai-completions",
          baseUrl: "https://deepseek.example.test/v1",
          reasoning: false,
          defaultThinkingLevel: "off",
          thinkingLevelOptions: ["low", "high"],
          temperatureOptions: [0.2, 0.6, 1.2],
          hasApiKey: true
        }
      ]
    });

    expect(controller.thinkingLevel.value).toBe("off");
    controller.selectThinkingLevel("medium");
    expect(controller.thinkingLevel.value).toBe("off");
    controller.selectThinkingLevel("high");
    expect(controller.thinkingLevel.value).toBe("high");

    controller.draft.value = "开启深度思考";
    const sending = controller.sendMessage(document);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_temperature_default_thinking_override",
      acceptedAt: new Date().toISOString(),
      runtime: { provider: "deepseek", model: "deepseek-chat", mode: "provider" }
    });
    await sending;

    expect(deferred.prompts[0]).toMatchObject({
      modelId: "plain-writer",
      thinkingLevel: "high"
    });
    expect(deferred.prompts[0]).not.toHaveProperty("temperature");
    controller.dispose();
  });

  it("accepts events before prompt accepted and prevents duplicate sends", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "续写当前章节";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);

    controller.draft.value = "重复发送";
    await controller.sendMessage(document);
    expect(deferred.promptCount()).toBe(1);

    controller.handleEvent(
      createEnvelope(
        "agent.thinking_delta",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          delta: "读取上下文",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_1")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          delta: "流式回复",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_2")
      )
    );

    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_1",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(controller.messages.value.at(-1)).toMatchObject({
      content: "流式回复",
      thinking: "读取上下文",
      status: "streaming"
    });
    expect(controller.isBusy.value).toBe(true);
    controller.dispose();
  });

  it("batches a long thinking stream by frame without dropping any text", async () => {
    const scheduledFrames: Array<(timestamp: number) => void> = [];
    const requestFrame = vi.fn((callback: (timestamp: number) => void) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);

    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "验证超长思考流";
    const sessionId = controller.sessionId.value;
    const runId = "run_long_thinking";
    const messageId = "message_long_thinking";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const thinkingChunks = Array.from(
      { length: 1_024 },
      (_, index) => `${String(index).padStart(4, "0")}:${"思考片段".repeat(24)}\n`
    );
    for (const [index, delta] of thinkingChunks.entries()) {
      controller.handleEvent(
        createEnvelope(
          "agent.thinking_delta",
          { sessionId, runId, messageId, delta, runtime },
          eventOptions(sessionId, runId, `evt_long_thinking_${index}`)
        )
      );
    }

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(
      controller.messages.value.find((message) => message.role === "assistant")
    ).toBeUndefined();

    scheduledFrames.shift()?.(16);
    const completeThinking = thinkingChunks.join("");
    expect(completeThinking.length).toBeGreaterThan(100_000);
    expect(controller.messages.value.at(-1)?.thinking).toBe(completeThinking);
    expect(controller.messages.value.at(-1)?.processingSteps).toMatchObject([
      { type: "thinking", content: completeThinking }
    ]);

    const responseChunks = ["最终", "回复", "也保持", "完整。"];
    for (const [index, delta] of responseChunks.entries()) {
      controller.handleEvent(
        createEnvelope(
          "agent.message_delta",
          { sessionId, runId, messageId, delta, runtime },
          eventOptions(sessionId, runId, `evt_long_response_${index}`)
        )
      );
    }
    const completeResponse = responseChunks.join("");
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId,
          role: "assistant" as const,
          content: completeResponse,
          thinking: completeThinking,
          runtime
        },
        eventOptions(sessionId, runId, "evt_long_thinking_completed")
      )
    );

    const message = controller.messages.value.at(-1);
    expect(message).toMatchObject({
      content: completeResponse,
      thinking: completeThinking,
      status: "completed"
    });
    expect(message?.processingSteps).toMatchObject([
      { type: "thinking", content: completeThinking },
      { type: "response", content: completeResponse }
    ]);
    expect(cancelFrame).toHaveBeenCalled();
    controller.dispose();
  });

  it("ignores accepted and events after a new conversation starts", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "旧会话问题";
    const oldSessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    controller.newConversation();

    deferred.resolveAccepted(0, {
      sessionId: oldSessionId,
      runId: "run_old",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId: oldSessionId,
          runId: "run_old",
          messageId: "message_old",
          delta: "不应出现",
          runtime
        },
        eventOptions(oldSessionId, "run_old", "evt_old")
      )
    );

    expect(controller.messages.value).toEqual([]);
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("cancels a prompt before its run id exists and aborts it once accepted", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "取消仍在受理中的请求";
    const oldSessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);

    expect(controller.cancelPendingGeneration()).toBe(true);
    expect(controller.sessionId.value).not.toBe(oldSessionId);
    expect(controller.isBusy.value).toBe(false);
    expect(
      controller.acceptsRunEvent(oldSessionId, "run_pending_cancel")
    ).toBe(false);

    deferred.resolveAccepted(0, {
      sessionId: oldSessionId,
      runId: "run_pending_cancel",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(deferred.aborts).toEqual([
      {
        sessionId: oldSessionId,
        runId: "run_pending_cancel"
      }
    ]);
    expect(controller.messages.value).toEqual([]);
    controller.dispose();
  });

  it("deduplicates events and drops late deltas after completion", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "验证事件";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_1",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const delta = createEnvelope(
      "agent.message_delta",
      {
        sessionId,
        runId: "run_1",
        messageId: "message_1",
        delta: "A",
        runtime
      },
      eventOptions(sessionId, "run_1", "evt_delta")
    );
    controller.handleEvent(delta);
    controller.handleEvent(delta);
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          role: "assistant" as const,
          content: "AB",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId,
          runId: "run_1",
          messageId: "message_1",
          delta: "迟到",
          runtime
        },
        eventOptions(sessionId, "run_1", "evt_late")
      )
    );

    expect(controller.messages.value.at(-1)?.content).toBe("AB");
    expect(controller.messages.value.at(-1)?.status).toBe("completed");
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("assembles isolated subagent activity across duplicate and out-of-order events", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "请让资料核对员先检查设定";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_subagent",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const base = {
      sessionId,
      runId: "run_subagent",
      parentToolCallId: "spawn_1",
      subagentRunId: "subrun_1",
      subagentId: "fact_checker",
      name: "资料核对员",
      runtime
    };
    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId: "run_subagent",
          toolCallId: "spawn_1",
          toolName: "spawn_subagent",
          args: {
            subagent_id: "fact_checker",
            task: "核对人物年龄与章节时间线"
          },
          runtime
        },
        eventOptions(sessionId, "run_subagent", "evt_spawn_requested")
      )
    );
    expect(controller.messages.value.at(-1)?.subagentRuns).toMatchObject([{
      parentToolCallId: "spawn_1",
      subagentRunId: "pending:spawn_1",
      task: "核对人物年龄与章节时间线",
      status: "running"
    }]);
    const thinking = createEnvelope(
      "subagent.activity",
      {
        ...base,
        activity: { type: "thinking_delta" as const, delta: "先核对时间线。" }
      },
      eventOptions(sessionId, "run_subagent", "evt_sub_thinking")
    );
    controller.handleEvent(thinking);
    controller.handleEvent(thinking);
    controller.handleEvent(
      createEnvelope(
        "subagent.completed",
        {
          ...base,
          status: "completed" as const,
          summary: "时间线一致，可以继续写作。",
          usage: {
            inputTokens: 12,
            outputTokens: 8,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 20
          }
        },
        eventOptions(sessionId, "run_subagent", "evt_sub_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        { ...base, task: "核对人物年龄与章节时间线" },
        eventOptions(sessionId, "run_subagent", "evt_sub_started_late")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.activity",
        {
          ...base,
          activity: {
            type: "tool_completed" as const,
            toolCallId: "subtool_1",
            toolName: "read_workspace_content",
            resultSummary: "已读取人物与大纲",
            isError: false
          }
        },
        eventOptions(sessionId, "run_subagent", "evt_sub_tool_completed")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.activity",
        {
          ...base,
          activity: {
            type: "tool_requested" as const,
            toolCallId: "subtool_1",
            toolName: "read_workspace_content",
            args: { stage: "character_design" }
          }
        },
        eventOptions(sessionId, "run_subagent", "evt_sub_tool_requested_late")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_subagent",
          messageId: "message_subagent",
          role: "assistant" as const,
          content: "核对完成，我会按一致的时间线继续。",
          runtime
        },
        eventOptions(sessionId, "run_subagent", "evt_parent_completed")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      id: "message_subagent",
      content: "核对完成，我会按一致的时间线继续。",
      subagentRuns: [{
        parentToolCallId: "spawn_1",
        subagentRunId: "subrun_1",
        task: "核对人物年龄与章节时间线",
        status: "completed",
        thinking: "先核对时间线。",
        summary: "时间线一致，可以继续写作。",
        usage: { totalTokens: 20 },
        toolCalls: [{
          id: "subtool_1",
          status: "completed",
          args: { stage: "character_design" },
          resultSummary: "已读取人物与大纲"
        }]
      }]
    });
    expect(controller.messages.value.at(-1)?.content).not.toContain("时间线一致");
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.processingSteps.map(
        (step) => step.type
      )
    ).toEqual(["thinking", "tool"]);
    expect(controller.messages.value.at(-1)?.subagentRuns).toHaveLength(1);
    controller.markToolConflict(
      "run_subagent",
      "subtool_1",
      "文稿版本已变化，未应用子智能体变更。"
    );
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.toolCalls[0]
    ).toMatchObject({
      status: "error",
      isError: true,
      resultSummary: "文稿版本已变化，未应用子智能体变更。"
    });
    controller.dispose();
  });

  it("settles an unfinished subagent when the parent completes", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "启动一个子任务";
    const sessionId = controller.sessionId.value;
    const runId = "run_parent_completed_with_child";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId,
          toolCallId: "spawn_unfinished",
          toolName: "spawn_subagent",
          args: {
            subagent_id: "chapter_writer",
            task: "编写当前章"
          },
          runtime
        },
        eventOptions(sessionId, runId, "evt_spawn_unfinished")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId,
          messageId: "message_parent_completed_with_child",
          role: "assistant" as const,
          content: "父任务已经完成。",
          runtime
        },
        eventOptions(sessionId, runId, "evt_parent_completed_with_child")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "completed",
      subagentRuns: [
        {
          status: "error",
          errorMessage: "父智能体运行已完成，但子任务未返回完整终态。"
        }
      ]
    });
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.completedAt
    ).toBeDefined();
    expect(controller.isBusy.value).toBe(false);

    controller.handleEvent(
      createEnvelope(
        "subagent.completed",
        {
          sessionId,
          runId,
          parentToolCallId: "spawn_unfinished",
          subagentRunId: "subrun_finished_late",
          subagentId: "chapter_writer",
          name: "单章写手",
          status: "completed" as const,
          summary: "子任务终态稍后到达。",
          runtime
        },
        eventOptions(sessionId, runId, "evt_child_completed_late")
      )
    );
    expect(controller.messages.value.at(-1)?.subagentRuns?.[0]).toMatchObject({
      subagentRunId: "subrun_finished_late",
      status: "completed",
      summary: "子任务终态稍后到达。"
    });
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.errorMessage
    ).toBeUndefined();
    controller.dispose();
  });

  it("settles streaming presentation state before disposal", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "开始流式任务";
    const sessionId = controller.sessionId.value;
    const runId = "run_disposed_while_streaming";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;
    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId,
          toolCallId: "spawn_disposed",
          toolName: "spawn_subagent",
          args: {
            subagent_id: "chapter_writer",
            task: "编写当前章"
          },
          runtime
        },
        eventOptions(sessionId, runId, "evt_spawn_disposed")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "streaming",
      subagentRuns: [{ status: "running" }]
    });
    expect(
      controller.capturePersistenceSnapshot().conversations[0]?.messages.at(-1)
    ).toMatchObject({
      status: "stopped"
    });
    expect(controller.messages.value.at(-1)?.status).toBe("streaming");
    controller.dispose();

    expect(controller.messages.value.at(-1)).toMatchObject({
      status: "stopped",
      subagentRuns: [{ status: "stopped" }]
    });
    expect(
      controller.messages.value.at(-1)?.processingCompletedAt
    ).toBeDefined();
    expect(controller.isBusy.value).toBe(false);
  });

  it("stops an in-flight subagent card when its parent run is aborted", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "启动子任务后停止";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_subagent_abort",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        {
          sessionId,
          runId: "run_subagent_abort",
          parentToolCallId: "spawn_abort",
          subagentRunId: "subrun_abort",
          subagentId: "researcher",
          name: "资料员",
          task: "查找背景资料",
          runtime
        },
        eventOptions(sessionId, "run_subagent_abort", "evt_sub_abort_started")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.error",
        {
          sessionId,
          runId: "run_subagent_abort",
          code: "pi_agent.aborted",
          message: "Agent run aborted.",
          runtime
        },
        eventOptions(sessionId, "run_subagent_abort", "evt_sub_parent_aborted")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "subagent.started",
        {
          sessionId,
          runId: "run_subagent_abort",
          parentToolCallId: "spawn_abort_late",
          subagentRunId: "subrun_abort_late",
          subagentId: "late_researcher",
          name: "迟到的资料员",
          task: "不应恢复成执行中",
          runtime
        },
        eventOptions(sessionId, "run_subagent_abort", "evt_sub_abort_started_late")
      )
    );

    expect(controller.messages.value.at(-1)?.status).toBe("stopped");
    expect(controller.messages.value.at(-1)?.subagentRuns?.[0]).toMatchObject({
      status: "stopped",
      errorMessage: "父智能体运行已停止，子任务同步停止。"
    });
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.[0]?.completedAt
    ).toBeTruthy();
    expect(
      controller.messages.value.at(-1)?.subagentRuns?.map((run) => run.status)
    ).toEqual(["stopped", "stopped"]);
    controller.dispose();
  });

  it("groups thinking and tool events into the assistant processing trace", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "检查项目";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_tools",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId: "run_tools",
          toolCallId: "tool_1",
          toolName: "read_file",
          args: { path: "README.md" },
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tool_start")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.thinking_delta",
        {
          sessionId,
          runId: "run_tools",
          messageId: "message_tools",
          delta: "先检查项目说明。",
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_thinking")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "tool.execution_completed",
        {
          sessionId,
          runId: "run_tools",
          toolCallId: "tool_1",
          toolName: "read_file",
          resultSummary: "已读取 README.md",
          isError: false,
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tool_end")
      )
    );
    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_tools",
          messageId: "message_tools",
          role: "assistant" as const,
          content: "检查完成。",
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tools_completed")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      id: "message_tools",
      content: "检查完成。",
      thinking: "先检查项目说明。",
      status: "completed",
      activityOnly: false,
      toolCalls: [
        {
          id: "tool_1",
          name: "read_file",
          status: "completed",
          resultSummary: "已读取 README.md"
        }
      ]
    });
    expect(controller.messages.value.at(-1)?.processingStartedAt).toBeTruthy();
    expect(controller.messages.value.at(-1)?.processingCompletedAt).toBeTruthy();
    expect(
      controller.messages.value.at(-1)?.processingSteps?.map((step) => step.type)
    ).toEqual(["tool", "thinking", "response"]);
    controller.dispose();
  });

  it("shows and incrementally updates a tool before execution starts", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "写入剧情";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_streaming_tool",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const stream = (
      phase: "start" | "delta" | "end",
      argumentsDelta: string,
      eventId: string,
      args?: unknown
    ) => controller.handleEvent(
      createEnvelope(
        "tool.call_stream",
        {
          sessionId,
          runId: "run_streaming_tool",
          streamId: "message_streaming_tool:0",
          toolCallId: "tool_write_1",
          toolName: "write_workspace_editor",
          phase,
          argumentsDelta,
          runtime,
          ...(args !== undefined ? { args } : {})
        },
        eventOptions(sessionId, "run_streaming_tool", eventId)
      )
    );

    stream("start", "", "evt_tool_stream_start");
    expect(controller.messages.value.at(-1)?.toolCalls).toMatchObject([
      {
        id: "tool_write_1",
        status: "preparing",
        argumentsText: ""
      }
    ]);

    stream(
      "delta",
      '{"target_stage_id":"plot_design","text":"第一',
      "evt_tool_stream_delta_1"
    );
    stream("delta", '幕"}', "evt_tool_stream_delta_2");
    stream(
      "end",
      "",
      "evt_tool_stream_end",
      { target_stage_id: "plot_design", text: "第一幕" }
    );

    const streamedTool = controller.messages.value.at(-1)?.toolCalls?.[0];
    expect(streamedTool).toMatchObject({
      id: "tool_write_1",
      name: "write_workspace_editor",
      status: "preparing",
      argumentsComplete: true,
      argumentsText: '{"target_stage_id":"plot_design","text":"第一幕"}',
      args: { target_stage_id: "plot_design", text: "第一幕" }
    });

    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId: "run_streaming_tool",
          toolCallId: "tool_write_1",
          toolName: "write_workspace_editor",
          args: { target_stage_id: "plot_design", text: "第一幕" },
          runtime
        },
        eventOptions(sessionId, "run_streaming_tool", "evt_tool_execution_start")
      )
    );

    expect(controller.messages.value.at(-1)?.toolCalls).toHaveLength(1);
    expect(controller.messages.value.at(-1)?.toolCalls?.[0]?.status).toBe("running");
    expect(controller.messages.value.at(-1)?.processingSteps).toHaveLength(1);
    controller.dispose();
  });

  it.each([
    {
      label: "write_draft_section（当前章节）",
      toolName: "write_draft_section",
      first: '{"text":"第一',
      second: '段正文"}',
      args: { text: "第一段正文" }
    },
    {
      label: "write_draft_section（指定章节）",
      toolName: "write_draft_section",
      first: '{"section_id":"section-1","text":"第一',
      second: '段正文"}',
      args: { section_id: "section-1", text: "第一段正文" }
    }
  ])("streams $label content and character progress before execution", async ({
    toolName,
    first,
    second,
    args
  }) => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "写正文";
    const sessionId = controller.sessionId.value;
    const runId = `run_${toolName}`;
    const streamId = `stream_${toolName}`;
    const toolCallId = `tool_${toolName}`;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const stream = (
      phase: "start" | "delta" | "end",
      argumentsDelta: string,
      eventId: string,
      completedArgs?: unknown
    ) => controller.handleEvent(
      createEnvelope(
        "tool.call_stream",
        {
          sessionId,
          runId,
          streamId,
          toolCallId,
          toolName,
          phase,
          argumentsDelta,
          runtime,
          ...(completedArgs !== undefined ? { args: completedArgs } : {})
        },
        eventOptions(sessionId, runId, eventId)
      )
    );

    stream("start", first, `${toolCallId}_start`);
    expect(controller.messages.value.at(-1)?.toolCalls?.[0]).toMatchObject({
      name: toolName,
      status: "preparing",
      argumentsText: first
    });

    stream("delta", second, `${toolCallId}_delta`);
    expect(controller.messages.value.at(-1)?.toolCalls?.[0]?.argumentsText).toBe(
      `${first}${second}`
    );

    stream("end", "", `${toolCallId}_end`, args);
    expect(controller.messages.value.at(-1)?.toolCalls?.[0]).toMatchObject({
      name: toolName,
      status: "preparing",
      argumentsComplete: true,
      args
    });
    expect(controller.messages.value.at(-1)?.processingSteps).toHaveLength(1);
    controller.dispose();
  });

  it("keeps later tool streams separate when a provider repeats a stream id", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "先读取再写入";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_repeated_stream_id",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const stream = (toolCallId: string, toolName: string, eventId: string) =>
      controller.handleEvent(
        createEnvelope(
          "tool.call_stream",
          {
            sessionId,
            runId: "run_repeated_stream_id",
            streamId: "provider-content-index-0",
            toolCallId,
            toolName,
            phase: "start" as const,
            argumentsDelta: "",
            runtime
          },
          eventOptions(sessionId, "run_repeated_stream_id", eventId)
        )
      );

    stream("tool_read", "read_workspace_content", "evt_repeated_stream_read");
    stream("tool_write", "write_workspace_editor", "evt_repeated_stream_write");

    expect(controller.messages.value.at(-1)?.toolCalls).toMatchObject([
      { id: "tool_read", name: "read_workspace_content", status: "preparing" },
      { id: "tool_write", name: "write_workspace_editor", status: "preparing" }
    ]);
    expect(
      controller.messages.value.at(-1)?.processingSteps?.filter((step) => step.type === "tool")
    ).toHaveLength(2);
    controller.dispose();
  });

  it("preserves interleaved thinking, responses, and tools in arrival order", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "按步骤处理";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_ordered",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const emit = (
      type: "agent.thinking_delta" | "agent.message_delta" | "tool.call_requested",
      payload: Record<string, unknown>,
      eventId: string
    ) => {
      controller.handleEvent(
        createEnvelope(
          type,
          {
            sessionId,
            runId: "run_ordered",
            runtime,
            ...payload
          } as never,
          eventOptions(sessionId, "run_ordered", eventId)
        )
      );
    };

    emit(
      "agent.thinking_delta",
      { messageId: "message_ordered", delta: "先分析。" },
      "evt_ordered_1"
    );
    emit(
      "agent.message_delta",
      { messageId: "message_ordered", delta: "先返回阶段结论。" },
      "evt_ordered_2"
    );
    emit(
      "tool.call_requested",
      { toolCallId: "tool_ordered_1", toolName: "read_file", args: { path: "one.md" } },
      "evt_ordered_3"
    );
    emit(
      "agent.thinking_delta",
      { messageId: "message_ordered", delta: "继续分析。" },
      "evt_ordered_4"
    );
    emit(
      "agent.message_delta",
      { messageId: "message_ordered", delta: "再返回阶段结论。" },
      "evt_ordered_5"
    );
    emit(
      "tool.call_requested",
      { toolCallId: "tool_ordered_2", toolName: "read_file", args: { path: "two.md" } },
      "evt_ordered_6"
    );

    expect(
      controller.messages.value.at(-1)?.processingSteps?.map((step) => step.type)
    ).toEqual(["thinking", "response", "tool", "thinking", "response", "tool"]);

    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_ordered",
          messageId: "message_ordered",
          role: "assistant" as const,
          content: "这是最后一段返回信息。",
          runtime
        },
        eventOptions(sessionId, "run_ordered", "evt_ordered_complete")
      )
    );

    const message = controller.messages.value.at(-1);
    expect(message?.processingSteps?.map((step) => step.type)).toEqual([
      "thinking",
      "response",
      "tool",
      "thinking",
      "response",
      "tool",
      "response"
    ]);
    expect(
      message?.processingSteps
        ?.filter((step) => step.type === "response")
        .map((step) => step.content)
    ).toEqual(["先返回阶段结论。", "再返回阶段结论。", "这是最后一段返回信息。"]);
    expect(message?.content).toBe("这是最后一段返回信息。");
    controller.dispose();
  });

  it("releases busy state and exposes a clear agent error", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "验证错误";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_error",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;
    controller.handleEvent(
      createEnvelope(
        "agent.error",
        {
          sessionId,
          runId: "run_error",
          code: "agent.failed",
          message: "本地运行失败",
          runtime
        },
        eventOptions(sessionId, "run_error", "evt_error")
      )
    );

    expect(controller.conversationError.value).toBe("本地运行失败");
    expect(controller.messages.value.at(-1)?.status).toBe("error");
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("rolls a failed model turn back to its checkpoint and stays stoppable while retrying", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "先查资料再回答";
    const sessionId = controller.sessionId.value;
    const runId = "run_retry";
    const messageId = "message_retry";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(createEnvelope(
      "agent.turn_started",
      { sessionId, runId, messageId, turnId: "turn_1", attempt: 1, maxAttempts: 6, runtime },
      eventOptions(sessionId, runId, "evt_retry_turn_1")
    ));
    controller.handleEvent(createEnvelope(
      "tool.call_requested",
      {
        sessionId,
        runId,
        toolCallId: "tool_kept",
        toolName: "read_file",
        args: { path: "notes.md" },
        runtime
      },
      eventOptions(sessionId, runId, "evt_retry_tool_requested")
    ));
    controller.handleEvent(createEnvelope(
      "tool.execution_completed",
      {
        sessionId,
        runId,
        toolCallId: "tool_kept",
        toolName: "read_file",
        resultSummary: "已读取 notes.md",
        isError: false,
        runtime
      },
      eventOptions(sessionId, runId, "evt_retry_tool_completed")
    ));
    controller.handleEvent(createEnvelope(
      "agent.turn_started",
      { sessionId, runId, messageId, turnId: "turn_2", attempt: 1, maxAttempts: 6, runtime },
      eventOptions(sessionId, runId, "evt_retry_turn_2")
    ));
    controller.handleEvent(createEnvelope(
      "agent.thinking_delta",
      { sessionId, runId, messageId, delta: "这段思考会被撤销", runtime },
      eventOptions(sessionId, runId, "evt_retry_partial_thinking")
    ));
    controller.handleEvent(createEnvelope(
      "agent.message_delta",
      { sessionId, runId, messageId, delta: "这段回复会被撤销", runtime },
      eventOptions(sessionId, runId, "evt_retry_partial_message")
    ));
    controller.handleEvent(createEnvelope(
      "tool.call_stream",
      {
        sessionId,
        runId,
        streamId: "retry_stream",
        toolCallId: "tool_partial",
        toolName: "write_workspace_editor",
        phase: "delta" as const,
        argumentsDelta: '{"text":"未完成',
        runtime
      },
      eventOptions(sessionId, runId, "evt_retry_partial_tool")
    ));
    controller.handleEvent(createEnvelope(
      "agent.retry_scheduled",
      {
        sessionId,
        runId,
        messageId,
        turnId: "turn_2",
        failedAttempt: 1,
        nextAttempt: 2,
        maxAttempts: 6,
        delayMs: 30_000,
        retryAt: new Date(Date.now() + 30_000).toISOString(),
        reason: "连接被重置",
        runtime
      },
      eventOptions(sessionId, runId, "evt_retry_scheduled")
    ));

    const waitingMessage = controller.messages.value.at(-1);
    expect(waitingMessage).toMatchObject({
      id: messageId,
      content: "",
      status: "streaming",
      retry: {
        state: "scheduled",
        attempt: 2,
        maxAttempts: 6,
        delayMs: 30_000,
        reason: "连接被重置"
      }
    });
    expect(waitingMessage?.thinking).toBeUndefined();
    expect(waitingMessage?.toolCalls).toMatchObject([
      { id: "tool_kept", status: "completed" }
    ]);
    expect(waitingMessage?.toolCalls?.some((tool) => tool.id === "tool_partial")).toBe(false);
    expect(controller.isBusy.value).toBe(true);
    expect(controller.canStop.value).toBe(true);

    controller.handleEvent(createEnvelope(
      "agent.message_delta",
      { sessionId, runId, messageId, delta: "失败尝试的迟到内容", runtime },
      eventOptions(sessionId, runId, "evt_retry_late_delta")
    ));
    expect(controller.messages.value.at(-1)?.content).toBe("");

    controller.handleEvent(createEnvelope(
      "agent.turn_started",
      { sessionId, runId, messageId, turnId: "turn_2", attempt: 2, maxAttempts: 6, runtime },
      eventOptions(sessionId, runId, "evt_retry_turn_2_attempt_2")
    ));
    expect(controller.messages.value.at(-1)?.retry?.state).toBe("trying");

    controller.handleEvent(createEnvelope(
      "agent.message_delta",
      { sessionId, runId, messageId, delta: "重试成功", runtime },
      eventOptions(sessionId, runId, "evt_retry_success_delta")
    ));
    expect(controller.messages.value.at(-1)?.retry).toBeUndefined();
    expect(controller.messages.value.at(-1)?.content).toBe("重试成功");

    controller.handleEvent(createEnvelope(
      "agent.message_completed",
      {
        sessionId,
        runId,
        messageId,
        role: "assistant" as const,
        content: "重试成功",
        runtime
      },
      eventOptions(sessionId, runId, "evt_retry_completed")
    ));
    expect(controller.messages.value.at(-1)?.retry).toBeUndefined();
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it.each([
    ["pi_agent.aborted", "stopped", null],
    ["agent.failed", "error", "重试最终失败"]
  ] as const)(
    "clears retry state when a waiting run ends with %s",
    async (code, expectedStatus, expectedError) => {
      const deferred = createDeferredApi();
      const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
      controller.draft.value = "验证重试终态";
      const sessionId = controller.sessionId.value;
      const runId = `run_retry_terminal_${expectedStatus}`;
      const messageId = `message_retry_terminal_${expectedStatus}`;
      const sending = controller.sendMessage(document);
      deferred.resolveAccepted(0, {
        sessionId,
        runId,
        acceptedAt: new Date().toISOString(),
        runtime
      });
      await sending;
      controller.handleEvent(createEnvelope(
        "agent.turn_started",
        { sessionId, runId, messageId, turnId: "terminal_turn", attempt: 1, maxAttempts: 6, runtime },
        eventOptions(sessionId, runId, `evt_terminal_turn_${expectedStatus}`)
      ));
      controller.handleEvent(createEnvelope(
        "agent.retry_scheduled",
        {
          sessionId,
          runId,
          messageId,
          turnId: "terminal_turn",
          failedAttempt: 1,
          nextAttempt: 2,
          maxAttempts: 6,
          delayMs: 30_000,
          retryAt: new Date(Date.now() + 30_000).toISOString(),
          reason: "暂时断线",
          runtime
        },
        eventOptions(sessionId, runId, `evt_terminal_retry_${expectedStatus}`)
      ));
      expect(controller.messages.value.at(-1)?.retry?.state).toBe("scheduled");

      controller.handleEvent(createEnvelope(
        "agent.error",
        {
          sessionId,
          runId,
          code,
          message: expectedError ?? "Agent run aborted.",
          runtime
        },
        eventOptions(sessionId, runId, `evt_terminal_end_${expectedStatus}`)
      ));

      expect(controller.messages.value.at(-1)?.status).toBe(expectedStatus);
      expect(controller.messages.value.at(-1)?.retry).toBeUndefined();
      expect(controller.conversationError.value).toBe(expectedError);
      expect(controller.isBusy.value).toBe(false);
      controller.dispose();
    }
  );

  it("rolls back failed subagent turns without discarding earlier tool results", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "让子智能体核对资料";
    const sessionId = controller.sessionId.value;
    const runId = "run_subagent_retry";
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId,
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;
    const base = {
      sessionId,
      runId,
      parentToolCallId: "spawn_retry",
      subagentRunId: "subrun_retry",
      subagentId: "researcher",
      name: "资料员",
      runtime
    };
    const activity = (
      value:
        | { type: "turn_started"; turnId: string; attempt: number; maxAttempts: number }
        | {
            type: "retry_scheduled";
            turnId: string;
            failedAttempt: number;
            nextAttempt: number;
            maxAttempts: number;
            delayMs: number;
            retryAt: string;
            reason: string;
          }
        | { type: "thinking_delta"; delta: string }
        | { type: "message_delta"; delta: string }
        | { type: "tool_requested"; toolCallId: string; toolName: string; args: unknown }
        | {
            type: "tool_completed";
            toolCallId: string;
            toolName: string;
            resultSummary: string;
            isError: boolean;
          },
      eventId: string
    ) => controller.handleEvent(createEnvelope(
      "subagent.activity",
      { ...base, activity: value },
      eventOptions(sessionId, runId, eventId)
    ));

    controller.handleEvent(createEnvelope(
      "subagent.started",
      { ...base, task: "核对背景资料" },
      eventOptions(sessionId, runId, "evt_sub_retry_started")
    ));
    activity({ type: "turn_started", turnId: "subturn_1", attempt: 1, maxAttempts: 6 }, "evt_sub_retry_turn_1");
    activity(
      { type: "tool_requested", toolCallId: "subtool_kept", toolName: "read_file", args: { path: "facts.md" } },
      "evt_sub_retry_tool_requested"
    );
    activity(
      {
        type: "tool_completed",
        toolCallId: "subtool_kept",
        toolName: "read_file",
        resultSummary: "已读取 facts.md",
        isError: false
      },
      "evt_sub_retry_tool_completed"
    );
    activity({ type: "turn_started", turnId: "subturn_2", attempt: 1, maxAttempts: 6 }, "evt_sub_retry_turn_2");
    activity({ type: "thinking_delta", delta: "未完成思考" }, "evt_sub_retry_partial_thinking");
    activity({ type: "message_delta", delta: "未完成回复" }, "evt_sub_retry_partial_message");
    activity(
      {
        type: "retry_scheduled",
        turnId: "subturn_2",
        failedAttempt: 1,
        nextAttempt: 2,
        maxAttempts: 6,
        delayMs: 30_000,
        retryAt: new Date(Date.now() + 30_000).toISOString(),
        reason: "上游暂时不可用"
      },
      "evt_sub_retry_scheduled"
    );

    const waitingRun = controller.messages.value.at(-1)?.subagentRuns?.[0];
    expect(waitingRun).toMatchObject({
      status: "running",
      retry: { state: "scheduled", attempt: 2, maxAttempts: 6 },
      toolCalls: [{ id: "subtool_kept", status: "completed" }]
    });
    expect(waitingRun?.thinking).toBeUndefined();
    expect(waitingRun?.output).toBeUndefined();
    expect(controller.isBusy.value).toBe(true);

    activity({ type: "turn_started", turnId: "subturn_2", attempt: 2, maxAttempts: 6 }, "evt_sub_retry_turn_2_attempt_2");
    expect(controller.messages.value.at(-1)?.subagentRuns?.[0]?.retry?.state).toBe("trying");
    activity({ type: "thinking_delta", delta: "重试后的思考" }, "evt_sub_retry_success_thinking");
    expect(controller.messages.value.at(-1)?.subagentRuns?.[0]?.retry).toBeUndefined();
    expect(controller.messages.value.at(-1)?.subagentRuns?.[0]?.thinking).toBe("重试后的思考");
    controller.dispose();
  });

  it("stops the active run and keeps a partial reply without treating it as an error", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "生成一段长回复";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_stop",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;
    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId,
          runId: "run_stop",
          messageId: "message_stop",
          delta: "已经生成的部分",
          runtime
        },
        eventOptions(sessionId, "run_stop", "evt_stop_delta")
      )
    );

    expect(controller.canStop.value).toBe(true);
    await expect(controller.stopGeneration()).resolves.toBe(true);
    expect(deferred.aborts).toEqual([{ sessionId, runId: "run_stop" }]);
    expect(controller.canStop.value).toBe(false);

    controller.handleEvent(
      createEnvelope(
        "agent.error",
        {
          sessionId,
          runId: "run_stop",
          code: "pi_agent.aborted",
          message: "Agent run aborted.",
          runtime
        },
        eventOptions(sessionId, "run_stop", "evt_stopped")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      content: "已经生成的部分",
      status: "stopped"
    });
    expect(controller.conversationError.value).toBeNull();
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("isolates a timed-out acceptance from the next send", async () => {
    vi.useFakeTimers();
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 50 });
    const sessionId = controller.sessionId.value;
    controller.draft.value = "第一轮";
    const first = controller.sendMessage(document);
    await vi.advanceTimersByTimeAsync(60);
    expect(controller.isBusy.value).toBe(false);

    controller.draft.value = "第二轮";
    const second = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_late",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await first;
    expect(controller.isBusy.value).toBe(true);

    deferred.resolveAccepted(1, {
      sessionId,
      runId: "run_current",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await second;
    expect(controller.isBusy.value).toBe(true);
    controller.dispose();
  });

  it("uses a five-minute idle timeout by default", async () => {
    vi.useFakeTimers();
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api });
    controller.draft.value = "验证默认空闲超时";
    void controller.sendMessage(document);

    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(controller.isBusy.value).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(controller.isBusy.value).toBe(false);
    expect(controller.conversationError.value).toBe("智能体长时间没有返回新事件，请稍后重试。");
    controller.dispose();
  });

  it("marks an existing streaming message as error on idle timeout", async () => {
    vi.useFakeTimers();
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 50 });
    controller.draft.value = "验证流超时";
    const sessionId = controller.sessionId.value;
    void controller.sendMessage(document);
    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId,
          runId: "run_timeout",
          messageId: "message_timeout",
          delta: "未完成",
          runtime
        },
        eventOptions(sessionId, "run_timeout", "evt_timeout")
      )
    );
    await vi.advanceTimersByTimeAsync(60);

    expect(controller.messages.value.at(-1)).toMatchObject({
      content: "未完成",
      status: "error"
    });
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("rejects an acceptance that disagrees with an already observed run", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "验证身份";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    controller.handleEvent(
      createEnvelope(
        "agent.message_delta",
        {
          sessionId,
          runId: "run_observed",
          messageId: "message_observed",
          delta: "先到事件",
          runtime
        },
        eventOptions(sessionId, "run_observed", "evt_observed")
      )
    );
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_other",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(controller.conversationError.value).toContain("运行标识不一致");
    expect(controller.messages.value.at(-1)?.status).toBe("error");
    expect(controller.isBusy.value).toBe(false);
    controller.dispose();
  });

  it("builds the default text stages plus the physical expert-draft directory", async () => {
    for (const [index, activeStageId] of SHORT_WORKSPACE_STAGE_IDS.entries()) {
      const deferred = createDeferredApi();
      const controller = useAgentConversation({
        api: () => deferred.api,
        idleTimeoutMs: 10_000
      });
      const workspaceDocuments = createShortWorkspaceDocuments();
      const activeDocument =
        activeStageId === "draft"
          ? createDraftCoordinatorDocument(workspaceDocuments)
          : workspaceDocuments.find(
              (candidate) => candidate.stageId === activeStageId
            );
      if (!activeDocument) throw new Error(`Missing stage document: ${activeStageId}`);

      controller.draft.value = `检查 ${activeStageId}`;
      const sending = controller.sendMessage(
        activeDocument,
        [...workspaceDocuments].reverse()
      );
      const sessionId = controller.sessionId.value;
      deferred.resolveAccepted(0, {
        sessionId,
        runId: `run_short_snapshot_${index}`,
        acceptedAt: new Date().toISOString(),
        runtime
      });
      await sending;

      const context = deferred.prompts[0]?.workspaceContext;
      expect(context?.shortWorkspace).toMatchObject({
        id: "short_story_1",
        title: "雨夜来信",
        categories: ["都市", "悬疑"],
        activeStageId,
        stages: SHORT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
          stageId,
          title: shortStageTitle(stageId),
          content: `${stageId} 的实时内容`,
          revision: createShortWorkspaceContentRevision(
            `${stageId} 的实时内容`
          )
        })),
        expertDraft: {
          id: "draft",
          title: "正文",
          sections: [
            expect.objectContaining({
              id: "intro",
              body: expect.objectContaining({
                documentId: "short_draft_intro_body",
                content: ""
              }),
              characterState: expect.objectContaining({
                documentId: "short_draft_intro_state",
                content: ""
              })
            }),
            expect.objectContaining({
              id: "section-1",
              body: expect.objectContaining({
                documentId: "short_draft_section-1_body",
                content: "draft 的实时内容"
              }),
              characterState: expect.objectContaining({
                documentId: "short_draft_section-1_state",
                content: "第一节人物状态"
              })
            })
          ]
        }
      });
      expect(context?.activeResource?.content).toBe(
        activeStageId === "draft" ? "" : `${activeStageId} 的实时内容`
      );
      if (activeStageId === "draft") {
        expect(context?.activeResource?.id).toBe("draft");
        expect(context?.shortWorkspace?.activeAgentId).toBe(
          "expert_draft_coordinator"
        );
      }
      controller.dispose();
    }
  });

  it("keeps complete short-stage files in tool context while bounding the automatic active snapshot", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    const workspaceDocuments = createShortWorkspaceDocuments();
    const activeDocument = workspaceDocuments.find(
      (candidate) => candidate.stageId === "plot_design"
    );
    if (!activeDocument) throw new Error("Missing plot stage document.");
    const tail = "完整阶段文件末尾。";
    activeDocument.content = `${"长".repeat(20_010)}${tail}`;

    controller.draft.value = "检查完整剧情文件";
    const sending = controller.sendMessage(activeDocument, workspaceDocuments);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_complete_short_stage",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const context = deferred.prompts[0]?.workspaceContext;
    const plotStage = context?.shortWorkspace?.stages.find(
      ({ stageId }) => stageId === "plot_design"
    );
    expect(plotStage?.content).toContain(tail);
    expect(plotStage?.truncated).toBeUndefined();
    expect(context?.activeResource).toMatchObject({
      truncated: true,
      originalLength: activeDocument.content.length
    });
    expect(context?.activeResource?.content).toHaveLength(20_000);
    controller.dispose();
  });

  it("builds an isolated script workspace with the shared dynamic stages", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    const workspaceDocuments = createScriptWorkspaceDocuments();
    const activeDocument = workspaceDocuments.find(
      (candidate) => candidate.draftFileKind === "body"
    );
    if (!activeDocument) throw new Error("Missing script episode body.");

    controller.draft.value = "继续编写第一集";
    const sending = controller.sendMessage(activeDocument, workspaceDocuments);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_script_snapshot",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const context = deferred.prompts[0]?.workspaceContext;
    expect(context?.shortWorkspace).toBeUndefined();
    expect(context?.scriptWorkspace).toMatchObject({
      id: "script_story_1",
      title: "雨夜剧本",
      activeStageId: "draft",
      activeAgentId: "expert_draft_coordinator",
      activeSectionId: "episode-1",
      stages: SCRIPT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
        stageId,
        content: `${stageId} 的剧本实时内容`
      })),
      expertDraft: {
        sections: [
          expect.objectContaining({
            id: "episode-1",
            title: "第一集"
          })
        ]
      }
    });
    expect(context?.scriptWorkspace?.stages.map((stage) => stage.stageId)).toContain(
      "intro_design"
    );
    controller.dispose();
  });

  it("forwards the selected draft section to the unified draft agent", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    const workspaceDocuments = createShortWorkspaceDocuments();
    const sectionDocument = workspaceDocuments.find(
      (candidate) =>
        candidate.expertSectionId === "section-1" &&
        candidate.draftFileKind === "body"
    );
    if (!sectionDocument) throw new Error("Missing draft section body.");

    controller.draft.value = "继续编写第一节";
    const sending = controller.sendMessage(sectionDocument, workspaceDocuments);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_section_writer",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(deferred.prompts[0]?.workspaceContext?.shortWorkspace).toMatchObject({
      activeStageId: "draft",
      activeAgentId: "expert_draft_coordinator",
      activeSectionId: "section-1",
      expertDraft: {
        sections: [
          expect.objectContaining({ id: "intro" }),
          expect.objectContaining({
            id: "section-1",
            body: expect.objectContaining({ content: "draft 的实时内容" }),
            characterState: expect.objectContaining({ content: "第一节人物状态" })
          })
        ]
      }
    });
    expect(
      deferred.prompts[0]?.workspaceContext?.shortWorkspace?.stages
    ).toHaveLength(SHORT_WORKSPACE_TEXT_STAGE_IDS.length);
    expect(deferred.prompts[0]?.workspaceContext?.activeResource).toMatchObject({
      id: "short_draft_section-1_body",
      content: "draft 的实时内容"
    });
    controller.dispose();
  });

  it("sends the tab-selected section body as the active physical draft file", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    const workspaceDocuments = createShortWorkspaceDocuments();
    const firstBody = workspaceDocuments.find(
      (candidate) =>
        candidate.expertSectionId === "section-1" &&
        candidate.draftFileKind === "body"
    );
    const firstState = workspaceDocuments.find(
      (candidate) =>
        candidate.expertSectionId === "section-1" &&
        candidate.draftFileKind === "character-state"
    );
    if (!firstBody || !firstState) throw new Error("Missing first section files.");
    const secondBody: WorkspaceDocument = {
      ...firstBody,
      id: "short_draft_section-2_body",
      title: "第二节",
      path: ["雨夜来信", "正文", "第二节", "正文"],
      content: "第二节实时正文",
      expertSectionId: "section-2",
      expertSectionOrder: 2
    };
    const secondState: WorkspaceDocument = {
      ...firstState,
      id: "short_draft_section-2_state",
      title: "第二节 · 人物状态",
      path: ["雨夜来信", "正文", "第二节", "人物状态"],
      content: "第二节人物状态",
      expertSectionId: "section-2",
      expertSectionOrder: 2
    };
    workspaceDocuments.push(secondBody, secondState);

    controller.draft.value = "右侧标签已切到第二节";
    const sending = controller.sendMessage(secondBody, workspaceDocuments);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_tab_selected_section",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const context = deferred.prompts[0]?.workspaceContext;
    expect(context?.shortWorkspace).toMatchObject({
      activeStageId: "draft",
      activeAgentId: "expert_draft_coordinator",
      activeSectionId: "section-2"
    });
    expect(
      context?.shortWorkspace?.expertDraft.sections.find(
        (section) => section.id === "section-2"
      )?.body
    ).toMatchObject({
      documentId: "short_draft_section-2_body",
      content: "第二节实时正文"
    });
    expect(context?.activeResource).toMatchObject({
      id: "short_draft_section-2_body",
      content: "第二节实时正文"
    });
    controller.dispose();
  });

  it("sends every physical draft file in full without the former 20k snapshot truncation", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    const ordinaryStages = createShortWorkspaceDocuments().filter(
      (candidate) => candidate.stageId !== "draft"
    );
    const firstBody = `第一节完整开头${"雨".repeat(20_100)}第一节完整结尾`;
    const draftFiles: WorkspaceDocument[] = Array.from(
      { length: 5 },
      (_, index) => {
        const sectionId = `section-${index + 1}`;
        const title = `第${index + 1}节`;
        const common = {
          domain: "creation" as const,
          eyebrow: "短篇创作",
          workspaceId: "short_story_1",
          workspaceType: "short" as const,
          workspaceTitle: "雨夜来信",
          workspaceCategories: ["都市", "悬疑"],
          stageId: "draft" as const,
          shortAgentId: "expert_draft_coordinator" as const,
          expertSectionId: sectionId,
          expertSectionOrder: index,
          expertWordCountRequirement: "1200 字",
          draftDirectoryId: "draft"
        };
        return [
          {
            ...common,
            id: `${sectionId}-body`,
            title,
            path: ["雨夜来信", "正文", title, "正文"],
            format: "正文" as const,
            content: index === 0 ? firstBody : `第${index + 1}节完整正文`,
            draftFileKind: "body" as const
          },
          {
            ...common,
            id: `${sectionId}-state`,
            title: `${title} · 人物状态`,
            path: ["雨夜来信", "正文", title, "人物状态"],
            format: "账本" as const,
            content: `第${index + 1}节人物状态`,
            draftFileKind: "character-state" as const
          }
        ];
      }
    ).flat();
    const workspaceDocuments = [...ordinaryStages, ...draftFiles];
    const sectionDocument = draftFiles.find(
      (candidate) =>
        candidate.expertSectionId === "section-5" &&
        candidate.draftFileKind === "body"
    );
    if (!sectionDocument) throw new Error("Missing fifth section body.");

    controller.draft.value = "继续编写第五节";
    const sending = controller.sendMessage(sectionDocument, workspaceDocuments);
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_long_section_writer",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    const snapshot = deferred.prompts[0]?.workspaceContext?.shortWorkspace;
    expect(snapshot?.stages.map((stage) => stage.stageId)).toEqual(
      SHORT_WORKSPACE_TEXT_STAGE_IDS
    );
    expect(snapshot?.expertDraft.sections.map((section) => section.id)).toEqual([
      "section-1",
      "section-2",
      "section-3",
      "section-4",
      "section-5"
    ]);
    expect(snapshot?.expertDraft.sections[0]?.body.content).toBe(firstBody);
    expect(snapshot?.expertDraft.sections.at(-1)?.body.content).toBe(
      "第5节完整正文"
    );
    expect(deferred.prompts[0]?.workspaceContext?.activeResource).toMatchObject({
      id: "section-5-body",
      content: "第5节完整正文"
    });
    controller.dispose();
  });

  it("tracks a requested tool as running and updates it when completed", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "读取人物内容";
    const sessionId = controller.sessionId.value;
    const sending = controller.sendMessage(document);
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_tools",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    controller.handleEvent(
      createEnvelope(
        "tool.call_requested",
        {
          sessionId,
          runId: "run_tools",
          toolCallId: "tool_read_character",
          toolName: "read_workspace_content",
          args: { stage_ids: ["character_design"] },
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tool_requested")
      )
    );

    expect(controller.messages.value.at(-1)).toMatchObject({
      id: "run_tools_assistant",
      role: "assistant",
      status: "streaming",
      tools: [
        {
          id: "tool_read_character",
          name: "read_workspace_content",
          status: "running"
        }
      ]
    });

    controller.handleEvent(
      createEnvelope(
        "tool.execution_completed",
        {
          sessionId,
          runId: "run_tools",
          toolCallId: "tool_read_character",
          toolName: "read_workspace_content",
          resultSummary: "已读取人物阶段",
          isError: false,
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tool_completed")
      )
    );

    expect(controller.messages.value.at(-1)?.tools).toEqual([
      {
        id: "tool_read_character",
        name: "read_workspace_content",
        status: "completed",
        summary: "已读取人物阶段"
      }
    ]);
    expect(controller.isBusy.value).toBe(true);
    expect(controller.acceptsRunEvent(sessionId, "run_tools")).toBe(true);
    controller.markToolConflict(
      "run_tools",
      "tool_read_character",
      "文稿版本已变化，未应用。"
    );
    expect(controller.messages.value.at(-1)?.tools?.[0]).toMatchObject({
      status: "error",
      summary: "文稿版本已变化，未应用。"
    });

    controller.handleEvent(
      createEnvelope(
        "agent.message_completed",
        {
          sessionId,
          runId: "run_tools",
          messageId: "run_tools_assistant",
          role: "assistant" as const,
          content: "检查完成。",
          runtime
        },
        eventOptions(sessionId, "run_tools", "evt_tools_completed")
      )
    );
    expect(controller.acceptsRunEvent(sessionId, "run_tools")).toBe(false);
    controller.dispose();
  });

  it("forwards explicitly bound skill and material snapshots with the short workspace", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    const workspaceDocuments = createShortWorkspaceDocuments();
    const activeDocument = workspaceDocuments.find((candidate) => candidate.stageId === "plot_design");
    if (!activeDocument) throw new Error("Missing plot_design stage document.");

    controller.draft.value = "使用绑定资料设计剧情";
    const sending = controller.sendMessage(activeDocument, workspaceDocuments, {
      attachedSkills: [
        {
          id: "skill_entry_1",
          title: "剧情反转",
          source: "attached-skill",
          kind: "plot",
          content: "先建立稳定预期，再用人物选择完成反转。"
        }
      ],
      attachedMaterials: [
        {
          id: "material_entry_1",
          title: "雨夜误导线索",
          source: "attached-material",
          kind: "plot",
          content: "雨水会冲淡脚印，但不会改变门轴上的新鲜锈痕。"
        }
      ]
    });
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_bound_libraries",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(deferred.prompts[0]?.workspaceContext).toMatchObject({
      attachedSkills: [
        {
          id: "skill_entry_1",
          title: "剧情反转",
          source: "attached-skill",
          kind: "plot"
        }
      ],
      attachedMaterials: [
        {
          id: "material_entry_1",
          title: "雨夜误导线索",
          source: "attached-material",
          kind: "plot"
        }
      ]
    });
    controller.dispose();
  });

  it("forwards only the explicitly selected library workspace for library management", async () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    const activeDocument: WorkspaceDocument = {
      id: "material-document-1",
      domain: "material",
      title: "人物甲",
      eyebrow: "短篇素材",
      path: ["人物素材", "人物甲"],
      content: "人物正文",
      libraryId: "material-library-1",
      catalogEntryId: "entry-1",
      stageCategoryId: "character"
    };
    const content = "人物正文";
    controller.draft.value = "整理当前素材";
    const sending = controller.sendMessage(activeDocument, [], {
      libraryWorkspace: {
        domain: "material",
        libraryId: "material-library-1",
        title: "人物素材",
        libraryType: "short",
        kind: "character",
        overviewDocumentId: "material-overview-1",
        overview: "人物素材边界",
        overviewRevision: createShortWorkspaceContentRevision("人物素材边界"),
        readOnly: false,
        activeEntryId: "entry-1",
        projectRevision: 7,
        entries: [
          {
            id: "entry-1",
            documentId: activeDocument.id,
            stageId: "character",
            title: activeDocument.title,
            content,
            revision: createShortWorkspaceContentRevision(content),
            readOnly: false
          }
        ]
      }
    });
    const sessionId = controller.sessionId.value;
    deferred.resolveAccepted(0, {
      sessionId,
      runId: "run_material_library",
      acceptedAt: new Date().toISOString(),
      runtime
    });
    await sending;

    expect(deferred.prompts[0]?.workspaceContext).toMatchObject({
      activeResource: {
        id: activeDocument.id,
        domain: "material"
      },
      libraryWorkspace: {
        domain: "material",
        libraryId: "material-library-1",
        activeEntryId: "entry-1",
        entries: [{ id: "entry-1", content }]
      }
    });
    expect(deferred.prompts[0]?.workspaceContext).not.toHaveProperty(
      "shortWorkspace"
    );
    expect(() =>
      structuredClone(deferred.prompts[0]?.workspaceContext?.libraryWorkspace)
    ).not.toThrow();
    controller.dispose();
  });

  it("records truncation metadata for a document over the context limit", () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({ api: () => deferred.api, idleTimeoutMs: 10_000 });
    controller.draft.value = "验证长文快照";
    void controller.sendMessage({ ...document, content: "长".repeat(20_010) });

    expect(deferred.prompts[0]?.workspaceContext?.activeResource).toMatchObject({
      truncated: true,
      originalLength: 20_010
    });
    expect(
      deferred.prompts[0]?.workspaceContext?.activeResource?.content
    ).toHaveLength(20_000);
    controller.dispose();
  });

  it("sends long-form prompts with an exclusive long workspace context", () => {
    const deferred = createDeferredApi();
    const controller = useAgentConversation({
      api: () => deferred.api,
      idleTimeoutMs: 10_000
    });
    controller.draft.value = "检查当前世界规则";
    void controller.sendLongMessage(
      {
        bookId: "longbook_context",
        title: "雾港来信",
        activeRoot: "worldbuilding",
        activeAgentId: "setting",
        activeFileId: "file_world_rules:content",
        activeFileRevision: "v1:3:1234abcd",
        workspaceRevision: 7,
        projectRevision: 11,
        navigation: {
          schemaVersion: 1,
          revision: 7,
          bookId: "longbook_context",
          updatedAt: "2026-07-26T12:00:00.000Z",
          counts: {
            worldbuildingCategories: 1,
            characters: 0,
            volumes: 1,
            arcs: 0,
            chapterCards: 0,
            storyEvents: 0,
            storyPlots: 0,
            foreshadowingThreads: 0,
            committedChapters: 0
          },
          worldbuilding: [
            {
              id: "world_rules",
              title: "世界规则",
              order: 1,
              format: "text"
            }
          ],
          characterTypes: [
            { id: "protagonist", title: "主角", order: 1 }
          ],
          characters: [],
          volumes: [{ id: "volume_one", title: "第一卷", order: 1 }],
          arcs: [],
          chapterCards: [],
          committedThroughChapterId: null
        }
      },
      {
        attachedSkills: [
          {
            id: "skill:long:world",
            title: "长篇世界构建",
            source: "attached-skill",
            kind: "general",
            content: "先建立规则边界。"
          }
        ],
        attachedMaterials: [
          {
            id: "material:long:world",
            title: "雾港地理",
            source: "attached-material",
            kind: "other",
            content: "港口终年有雾。"
          }
        ]
      }
    );

    expect(deferred.prompts[0]?.workspaceContext).toEqual({
      longWorkspace: expect.objectContaining({
        bookId: "longbook_context",
        activeRoot: "worldbuilding",
        activeAgentId: "setting",
        activeFileId: "file_world_rules:content",
        activeFileRevision: "v1:3:1234abcd",
        workspaceRevision: 7,
        projectRevision: 11
      }),
      attachedSkills: [
        expect.objectContaining({
          id: "skill:long:world",
          source: "attached-skill",
          kind: "general"
        })
      ],
      attachedMaterials: [
        expect.objectContaining({
          id: "material:long:world",
          source: "attached-material",
          kind: "other"
        })
      ]
    });
    expect(deferred.prompts[0]?.workspaceContext).not.toHaveProperty(
      "activeResource"
    );
    expect(deferred.prompts[0]?.workspaceContext).not.toHaveProperty(
      "shortWorkspace"
    );
    expect(deferred.prompts[0]?.workspaceContext).not.toHaveProperty(
      "scriptWorkspace"
    );
    controller.dispose();
  });
});
