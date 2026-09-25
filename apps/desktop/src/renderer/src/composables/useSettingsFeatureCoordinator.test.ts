import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DeepWriteApi,
  ModelSettings,
  ModelSettingsInput,
  ModelUsageDashboard
} from "@deepwrite/contracts";
import {
  DEFAULT_AGENT_TEAM_SETTINGS,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS,
  DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS
} from "@deepwrite/contracts";
import { useSettingsStore } from "../stores/settingsStore";
import {
  useSettingsFeatureCoordinator,
  type SettingsFeatureNotifications
} from "./useSettingsFeatureCoordinator";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function modelSettings(defaultModelId: string): ModelSettings {
  return {
    defaultModelId,
    models: []
  } as ModelSettings;
}

function usageDashboard(generatedAt: string): ModelUsageDashboard {
  return {
    generatedAt,
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

function createNotifications(): SettingsFeatureNotifications {
  return {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  };
}

function createApi(overrides: Record<string, unknown> = {}): DeepWriteApi {
  return {
    models: {
      list: vi.fn(),
      save: vi.fn()
    },
    modelUsage: {
      query: vi.fn()
    },
    workspaceAgents: {
      list: vi.fn()
    },
    longAgents: {
      list: vi.fn()
    },
    agentTeams: {
      list: vi.fn()
    },
    longAgentTeams: {
      list: vi.fn()
    },
    ...overrides
  } as unknown as DeepWriteApi;
}

function createHarness(api: DeepWriteApi) {
  const settingsStore = useSettingsStore();
  const notifications = createNotifications();
  const onModelsLoaded = vi.fn();
  const coordinator = useSettingsFeatureCoordinator({
    api: () => api,
    settingsStore,
    notifications,
    onModelsLoaded
  });
  return {
    coordinator,
    notifications,
    onModelsLoaded,
    settingsStore
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("settings feature coordinator", () => {
  it("single-flights concurrent model loads and publishes the shared snapshot once", async () => {
    const pending = deferred<ModelSettings>();
    const list = vi.fn(() => pending.promise);
    const api = createApi({ models: { list, save: vi.fn() } });
    const { coordinator, onModelsLoaded, settingsStore } = createHarness(api);

    const first = coordinator.loadModelSettings();
    const second = coordinator.loadModelSettings();

    expect(list).toHaveBeenCalledOnce();
    expect(settingsStore.modelLoading).toBe(true);

    const loaded = modelSettings("model-shared");
    pending.resolve(loaded);
    await Promise.all([first, second]);

    expect(settingsStore.modelSettings).toBe(loaded);
    expect(settingsStore.modelsLoaded).toBe(true);
    expect(settingsStore.modelLoading).toBe(false);
    expect(onModelsLoaded).toHaveBeenCalledOnce();
    expect(onModelsLoaded).toHaveBeenCalledWith(loaded);

    await coordinator.loadModelSettings();
    expect(list).toHaveBeenCalledOnce();
    expect(onModelsLoaded).toHaveBeenCalledOnce();
  });

  it("keeps the newest model-usage response when an older request resolves late", async () => {
    const older = deferred<ModelUsageDashboard>();
    const newer = deferred<ModelUsageDashboard>();
    const query = vi
      .fn()
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    const api = createApi({ modelUsage: { query } });
    const { coordinator, notifications, settingsStore } = createHarness(api);

    const olderRequest = coordinator.loadModelUsage({
      modelConfigIds: ["model-old"]
    });
    const newerRequest = coordinator.loadModelUsage({
      modelConfigIds: ["model-new"]
    });
    expect(settingsStore.modelUsageLoading).toBe(true);

    const newestDashboard = usageDashboard("2026-08-14T02:00:00.000Z");
    newer.resolve(newestDashboard);
    await newerRequest;

    expect(settingsStore.modelUsageDashboard).toBe(newestDashboard);
    expect(settingsStore.modelUsageQuery).toEqual({
      modelConfigIds: ["model-new"]
    });
    expect(settingsStore.modelUsageLoading).toBe(false);

    older.resolve(usageDashboard("2026-08-14T01:00:00.000Z"));
    await olderRequest;

    expect(settingsStore.modelUsageDashboard).toBe(newestDashboard);
    expect(settingsStore.modelUsageQuery).toEqual({
      modelConfigIds: ["model-new"]
    });
    expect(notifications.warning).not.toHaveBeenCalled();
  });

  it("resets the saving flag and preserves the last model snapshot after save failure", async () => {
    const pending = deferred<ModelSettings>();
    const save = vi.fn(() => pending.promise);
    const api = createApi({ models: { list: vi.fn(), save } });
    const { coordinator, onModelsLoaded, settingsStore } = createHarness(api);
    const existing = modelSettings("model-existing");
    settingsStore.markLoaded("models", existing);

    const saving = coordinator.saveModelSettings({
      defaultModelId: "model-next",
      models: []
    } as ModelSettingsInput);
    expect(settingsStore.modelSaving).toBe(true);
    expect(settingsStore.modelError).toBeNull();

    pending.reject(new Error("模型配置暂时不可写"));
    await saving;

    expect(settingsStore.modelSaving).toBe(false);
    expect(settingsStore.modelError).toBe("模型配置暂时不可写");
    expect(settingsStore.modelSettings).toBe(existing);
    expect(onModelsLoaded).not.toHaveBeenCalled();
  });

  it("single-flights short/script agent settings across concurrent feature loads", async () => {
    const list = vi.fn(async (workspaceType: "short" | "script") =>
      workspaceType === "short"
        ? structuredClone(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS)
        : structuredClone(DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS)
    );
    const api = createApi({ workspaceAgents: { list } });
    const { coordinator, notifications, settingsStore } = createHarness(api);

    await Promise.all([
      coordinator.loadShortAndScriptAgentSettings(),
      coordinator.loadShortAndScriptAgentSettings()
    ]);

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith("short");
    expect(list).toHaveBeenCalledWith("script");
    expect(settingsStore.workspaceAgentsLoaded).toBe(true);
    expect(settingsStore.workspaceAgentSettings).toHaveLength(2);

    await coordinator.loadShortAndScriptAgentSettings();
    expect(list).toHaveBeenCalledTimes(2);
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it("single-flights short/script and long agent-team settings together", async () => {
    const list = vi.fn(async (workspaceType: "short" | "script") =>
      workspaceType === "short"
        ? structuredClone(DEFAULT_AGENT_TEAM_SETTINGS)
        : { workspaceType: "script" as const, teams: [] }
    );
    const listLong = vi.fn(async () =>
      structuredClone(DEFAULT_LONG_AGENT_TEAM_SETTINGS)
    );
    const api = createApi({
      agentTeams: { list },
      longAgentTeams: { list: listLong }
    });
    const { coordinator, notifications, settingsStore } = createHarness(api);

    await Promise.all([
      coordinator.loadAgentTeamSettings(),
      coordinator.loadAgentTeamSettings()
    ]);

    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith("short");
    expect(list).toHaveBeenCalledWith("script");
    expect(listLong).toHaveBeenCalledOnce();
    expect(settingsStore.agentTeamLoaded).toBe(true);
    expect(settingsStore.longAgentTeamLoaded).toBe(true);

    await coordinator.loadAgentTeamSettings();
    expect(list).toHaveBeenCalledTimes(2);
    expect(listLong).toHaveBeenCalledOnce();
    expect(notifications.error).not.toHaveBeenCalled();
  });
});
