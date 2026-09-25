import type {
  DeepWriteApi,
  LearningImitationSettingsInput,
  LearningImitationStageId,
  LibraryAgentDomain,
  LibraryAgentSettingsInput,
  LongAgentSettingsInput,
  LongAgentTeamSettingsInput,
  ModelConfigInput,
  ModelSettings,
  ModelSettingsInput,
  ModelUsageQueryInput,
  WorkspaceAgentSettingsInput,
  WorkspaceAgentTeamSettingsInput
} from "@deepwrite/contracts";
import { useSettingsStore } from "../stores/settingsStore";

export interface SettingsFeatureNotifications {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface SettingsFeatureCoordinatorContext {
  api(): DeepWriteApi | undefined;
  settingsStore: ReturnType<typeof useSettingsStore>;
  notifications: SettingsFeatureNotifications;
  onModelsLoaded(settings: ModelSettings): void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useSettingsFeatureCoordinator(
  context: SettingsFeatureCoordinatorContext
) {
  const {
    settingsStore,
    notifications: uiMessage
  } = context;
  let modelUsageRequestSequence = 0;
  let lastPublishedModelSettings: ModelSettings | null = null;

  function applyLoadedModelSettings(settings: ModelSettings): void {
    if (settingsStore.modelSettings !== settings) {
      settingsStore.markLoaded("models", settings);
    }
    if (lastPublishedModelSettings === settings) return;
    lastPublishedModelSettings = settings;
    context.onModelsLoaded(settings);
  }

  async function loadModelSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      const settings = await settingsStore.ensureModelsLoaded(() =>
        api.models.list()
      );
      applyLoadedModelSettings(settings);
    } catch {
      // The store retains a retriable error for the active feature surface.
    }
  }

  async function loadAppAlerts(): Promise<void> {
    const api = context.api()?.appAlerts;
    if (!api) return;
    try {
      const snapshot = await api.get();
      settingsStore.modelAlertMessages = [...snapshot.modelMessages];
      if (snapshot.shouldShowDesktop) {
        settingsStore.startupAlertMessages = [...snapshot.desktopMessages];
        settingsStore.startupAlertRevision = snapshot.desktopRevision;
      }
    } catch (error: unknown) {
      console.warn(
        "InkHub app alerts could not be loaded:",
        errorMessage(error, "unknown error")
      );
    }
  }

  function closeStartupAlert(): void {
    const revision = settingsStore.startupAlertRevision;
    settingsStore.startupAlertMessages = [];
    settingsStore.startupAlertRevision = "";
    const api = context.api()?.appAlerts;
    if (!revision || !api) return;
    void api.acknowledgeDesktop(revision).catch((error: unknown) => {
      console.warn(
        "InkHub desktop alert acknowledgement could not be saved:",
        errorMessage(error, "unknown error")
      );
    });
  }

  async function loadModelUsage(
    input: ModelUsageQueryInput = settingsStore.modelUsageQuery
  ): Promise<void> {
    const api = context.api()?.modelUsage;
    if (!api) return;
    const query = {
      ...(input.startAt ? { startAt: input.startAt } : {}),
      ...(input.endAt ? { endAt: input.endAt } : {}),
      ...(input.modelConfigIds?.length
        ? { modelConfigIds: [...input.modelConfigIds] }
        : {}),
      ...(input.managedBy ? { managedBy: input.managedBy } : {}),
      ...(input.modules?.length ? { modules: [...input.modules] } : {})
    } satisfies ModelUsageQueryInput;
    const requestSequence = ++modelUsageRequestSequence;
    settingsStore.modelUsageLoading = true;
    settingsStore.modelUsageError = null;
    try {
      const dashboard = await api.query(query);
      if (requestSequence !== modelUsageRequestSequence) return;
      settingsStore.modelUsageDashboard = dashboard;
      settingsStore.modelUsageQuery = query;
    } catch (error: unknown) {
      if (requestSequence !== modelUsageRequestSequence) return;
      settingsStore.modelUsageError = errorMessage(
        error,
        "加载模型用量失败。"
      );
      uiMessage.warning(settingsStore.modelUsageError);
    } finally {
      if (requestSequence === modelUsageRequestSequence) {
        settingsStore.modelUsageLoading = false;
      }
    }
  }

  async function queryOfficialModelUsage(api: DeepWriteApi) {
    return api.modelUsage.query({ managedBy: "deepwrite-official" });
  }

  async function queryOfficialBalance(api: DeepWriteApi) {
    try {
      return await api.models.queryOfficialBalance();
    } catch (error: unknown) {
      uiMessage.warning(errorMessage(error, "查询官方模型消费信息失败。"));
      return null;
    }
  }

  async function loadOfficialModels(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      const snapshot = await settingsStore.ensureOfficialModelsLoaded(
        async () => {
          const settings = await api.models.refreshOfficial();
          const [usageDashboard, balance] = await Promise.all([
            queryOfficialModelUsage(api),
            queryOfficialBalance(api)
          ]);
          return { settings, usageDashboard, balance };
        }
      );
      applyLoadedModelSettings(snapshot.settings);
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "加载官方模型失败。"));
    }
  }

  async function saveOfficialToken(apiKey: string): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.officialModelsSaving) return;
    settingsStore.officialModelsSaving = true;
    try {
      const settings = await api.models.saveOfficialToken(apiKey);
      const [usageDashboard, balance] = await Promise.all([
        queryOfficialModelUsage(api),
        queryOfficialBalance(api)
      ]);
      settingsStore.markLoaded("officialModels", {
        settings,
        usageDashboard,
        balance
      });
      applyLoadedModelSettings(settings);
      uiMessage.success("官方令牌已安全保存，官方模型现在可以直接使用。");
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "保存官方令牌失败。"));
    } finally {
      settingsStore.officialModelsSaving = false;
    }
  }

  async function clearOfficialToken(): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.officialModelsSaving) return;
    settingsStore.officialModelsSaving = true;
    try {
      const settings = await api.models.clearOfficialToken();
      const [usageDashboard, balance] = await Promise.all([
        queryOfficialModelUsage(api),
        queryOfficialBalance(api)
      ]);
      settingsStore.markLoaded("officialModels", {
        settings,
        usageDashboard,
        balance
      });
      applyLoadedModelSettings(settings);
      uiMessage.info("官方令牌已移除，历史用量仍保留在本机账本中。");
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "移除官方令牌失败。"));
    } finally {
      settingsStore.officialModelsSaving = false;
    }
  }

  async function setOfficialModelEnabled(
    modelId: string,
    enabled: boolean
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.officialModelsSaving) return;
    settingsStore.officialModelsSaving = true;
    try {
      const settings = await api.models.setOfficialModelEnabled(
        modelId,
        enabled
      );
      settingsStore.markLoaded("officialModels", {
        settings,
        usageDashboard: settingsStore.officialModelUsageDashboard,
        balance: settingsStore.officialModelBalance
      });
      applyLoadedModelSettings(settings);
      uiMessage.success(
        enabled
          ? "模型已启用，并显示在模型配置中。"
          : "模型已停用，并从模型配置中隐藏。"
      );
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "更新模型启用状态失败。"));
    } finally {
      settingsStore.officialModelsSaving = false;
    }
  }

  async function saveModelSettings(settings: ModelSettingsInput): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.modelSaving) return;
    settingsStore.modelSaving = true;
    settingsStore.modelError = null;
    settingsStore.modelTestMessage = null;
    try {
      const saved = await api.models.save(settings);
      applyLoadedModelSettings(saved);
      settingsStore.modelTestMessage =
        "模型配置已保存，并已同步到后续对话。";
    } catch (error: unknown) {
      settingsStore.modelError = errorMessage(error, "保存模型配置失败。");
    } finally {
      settingsStore.modelSaving = false;
    }
  }

  async function refreshFreeModels(): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.freeModelsRefreshing) return;
    settingsStore.freeModelsRefreshing = true;
    settingsStore.modelError = null;
    settingsStore.modelTestMessage = null;
    try {
      const settings = await api.models.refreshFree();
      applyLoadedModelSettings(settings);
      settingsStore.modelTestMessage = "免费模型配置已刷新。";
    } catch (error: unknown) {
      settingsStore.modelError = errorMessage(error, "刷新免费模型配置失败。");
    } finally {
      settingsStore.freeModelsRefreshing = false;
    }
  }

  async function testModel(model: ModelConfigInput): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.testingModelId) return;
    settingsStore.testingModelId = model.id;
    settingsStore.modelError = null;
    settingsStore.modelTestMessage = null;
    try {
      const result = await api.models.test(model);
      settingsStore.modelTestMessage = result.message;
    } catch (error: unknown) {
      settingsStore.modelError = errorMessage(error, "模型连接测试失败。");
      uiMessage.error(settingsStore.modelError);
    } finally {
      settingsStore.testingModelId = null;
    }
  }

  async function loadShortAndScriptAgentSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureWorkspaceAgentsLoaded(() =>
        Promise.all([
          api.workspaceAgents.list("short"),
          api.workspaceAgents.list("script")
        ])
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(error, "加载创作空间智能体设置失败。")
      );
    }
  }

  async function loadLongAgentSettings(): Promise<boolean> {
    const api = context.api();
    if (!api) return false;
    try {
      await settingsStore.ensureLongAgentsLoaded(() => api.longAgents.list());
      return true;
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "加载长篇智能体设置失败。"));
      return false;
    }
  }

  async function ensureLongAgentSettingsLoaded(): Promise<boolean> {
    return settingsStore.longAgentLoaded || (await loadLongAgentSettings());
  }

  async function loadWorkspaceAgentSettings(): Promise<void> {
    await Promise.all([
      loadShortAndScriptAgentSettings(),
      loadLongAgentSettings()
    ]);
  }

  async function saveWorkspaceAgentSettings(
    settings: WorkspaceAgentSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.workspaceAgentSaving) return;
    settingsStore.workspaceAgentSaving = true;
    try {
      const saved = await api.workspaceAgents.save(settings);
      settingsStore.markLoaded("workspaceAgents", [
        ...settingsStore.workspaceAgentSettings.filter(
          (candidate) => candidate.workspaceType !== saved.workspaceType
        ),
        saved
      ]);
      uiMessage.success(
        `${saved.workspaceType === "script" ? "剧本" : "短篇"}智能体提示词、欢迎快捷与读取范围已保存，下一轮对话立即生效。`
      );
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "保存创作空间智能体设置失败。"));
    } finally {
      settingsStore.workspaceAgentSaving = false;
    }
  }

  async function saveLongAgentSettings(
    settings: LongAgentSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.longAgentSaving) return;
    settingsStore.longAgentSaving = true;
    try {
      const saved = await api.longAgents.save(settings);
      settingsStore.markLoaded("longAgents", saved);
      uiMessage.success(
        "长篇四个阶段智能体的提示词与欢迎快捷已保存，下一轮对话立即生效。"
      );
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "保存长篇智能体设置失败。"));
    } finally {
      settingsStore.longAgentSaving = false;
    }
  }

  async function loadShortAndScriptAgentTeamSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureAgentTeamsLoaded(() =>
        Promise.all([
          api.agentTeams.list("short"),
          api.agentTeams.list("script")
        ])
      );
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "加载智能体团队设置失败。"));
    }
  }

  async function loadLongAgentTeamSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureLongAgentTeamsLoaded(() =>
        api.longAgentTeams.list()
      );
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "加载长篇智能体团队设置失败。"));
    }
  }

  async function loadAgentTeamSettings(): Promise<void> {
    await Promise.all([
      loadShortAndScriptAgentTeamSettings(),
      loadLongAgentTeamSettings()
    ]);
  }

  async function saveAgentTeamSettings(
    settings: WorkspaceAgentTeamSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.agentTeamSaving) return;
    settingsStore.agentTeamSaving = true;
    try {
      const saved = await api.agentTeams.save(settings);
      settingsStore.markLoaded("agentTeams", [
        ...settingsStore.agentTeamSettings.filter(
          (candidate) => candidate.workspaceType !== saved.workspaceType
        ),
        saved
      ]);
      uiMessage.success("智能体团队已保存，下一轮对话立即生效。");
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "保存智能体团队设置失败。"));
    } finally {
      settingsStore.agentTeamSaving = false;
    }
  }

  async function saveLongAgentTeamSettings(
    settings: LongAgentTeamSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.longAgentTeamSaving) return;
    settingsStore.longAgentTeamSaving = true;
    try {
      const saved = await api.longAgentTeams.save(settings);
      settingsStore.markLoaded("longAgentTeams", saved);
      uiMessage.success("长篇智能体团队已保存，下一轮对话立即生效。");
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "保存长篇智能体团队设置失败。"));
    } finally {
      settingsStore.longAgentTeamSaving = false;
    }
  }

  async function loadLibraryAgentSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureLibraryAgentsLoaded(() =>
        api.libraryAgents.list()
      );
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "加载资料库智能体设置失败。"));
    }
  }

  async function saveLibraryAgentSettings(
    settings: LibraryAgentSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.libraryAgentSaving) return;
    settingsStore.libraryAgentSaving = true;
    try {
      const saved = await api.libraryAgents.save(settings);
      settingsStore.markLoaded("libraryAgents", saved);
      uiMessage.success("资料库智能体设置已保存，下一轮对话立即生效。");
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "保存资料库智能体设置失败。"));
    } finally {
      settingsStore.libraryAgentSaving = false;
    }
  }

  async function resetLibraryAgentSettings(
    domain: LibraryAgentDomain
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.libraryAgentSaving) return;
    settingsStore.libraryAgentSaving = true;
    try {
      const saved = await api.libraryAgents.reset(domain);
      settingsStore.markLoaded("libraryAgents", saved);
      uiMessage.success(
        `${domain === "skill" ? "技能库" : "素材库"}智能体已恢复默认设置。`
      );
    } catch (error: unknown) {
      uiMessage.error(
        errorMessage(error, "恢复资料库智能体默认设置失败。")
      );
    } finally {
      settingsStore.libraryAgentSaving = false;
    }
  }

  async function loadLearningImitationSettings(): Promise<void> {
    const api = context.api();
    if (!api) return;
    try {
      await settingsStore.ensureLearningImitationLoaded(() =>
        api.learningImitationSettings.list()
      );
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "加载学习仿写设置失败。"));
    }
  }

  async function saveLearningImitationSettings(
    settings: LearningImitationSettingsInput
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.learningImitationSaving) return;
    settingsStore.learningImitationSaving = true;
    try {
      const saved = await api.learningImitationSettings.save(settings);
      settingsStore.markLoaded("learningImitation", saved);
      uiMessage.success("学习仿写提示词已保存，下一次运行对应阶段时生效。");
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "保存学习仿写设置失败。"));
    } finally {
      settingsStore.learningImitationSaving = false;
    }
  }

  async function resetLearningImitationSettings(
    stageId: LearningImitationStageId
  ): Promise<void> {
    const api = context.api();
    if (!api || settingsStore.learningImitationSaving) return;
    settingsStore.learningImitationSaving = true;
    try {
      const saved = await api.learningImitationSettings.reset(stageId);
      settingsStore.markLoaded("learningImitation", saved);
      uiMessage.success("当前阶段已恢复默认提示词。");
    } catch (error: unknown) {
      uiMessage.error(errorMessage(error, "恢复学习仿写默认设置失败。"));
    } finally {
      settingsStore.learningImitationSaving = false;
    }
  }

  return {
    loadModelSettings,
    loadAppAlerts,
    closeStartupAlert,
    loadModelUsage,
    loadOfficialModels,
    saveOfficialToken,
    clearOfficialToken,
    setOfficialModelEnabled,
    saveModelSettings,
    refreshFreeModels,
    testModel,
    loadShortAndScriptAgentSettings,
    loadLongAgentSettings,
    ensureLongAgentSettingsLoaded,
    loadWorkspaceAgentSettings,
    saveWorkspaceAgentSettings,
    saveLongAgentSettings,
    loadAgentTeamSettings,
    saveAgentTeamSettings,
    saveLongAgentTeamSettings,
    loadLibraryAgentSettings,
    saveLibraryAgentSettings,
    resetLibraryAgentSettings,
    loadLearningImitationSettings,
    saveLearningImitationSettings,
    resetLearningImitationSettings
  };
}
