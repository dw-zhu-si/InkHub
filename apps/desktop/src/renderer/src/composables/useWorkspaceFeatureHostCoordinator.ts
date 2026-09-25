import type {
  CatalogSnapshot,
  DeepWriteApi,
  MarketplaceSession
} from "@deepwrite/contracts";
import {
  computed,
  ref,
  watch,
  type ComputedRef,
  type Ref
} from "vue";
import type { WorkspaceFeatureModule } from "../components/WorkspaceFeatureModules.types";
import type {
  AppView,
  WorkspaceMainView
} from "../stores/layoutStore";
import type { useSettingsStore } from "../stores/settingsStore";
import type { DialogMode } from "../types/workspace";
import type {
  LazyLearningImitationController,
  LazySubagentAuthoringController
} from "./useLazyFeatureControllers";

export type ActiveFeature =
  | WorkspaceMainView
  | "settings"
  | "long-workspace";

export interface WorkspaceFeatureHostNotifications {
  error(message: string): void;
  success(message: string): void;
}

export interface WorkspaceFeatureHostApi {
  marketplace: Pick<DeepWriteApi["marketplace"], "session">;
  workspaceDirectory: Pick<
    DeepWriteApi["workspaceDirectory"],
    "choose" | "list"
  >;
}

export interface WorkspaceFeatureHostCoordinatorOptions {
  api(): WorkspaceFeatureHostApi | undefined;
  view: {
    current: Ref<AppView>;
    settingsInitialCategory: Ref<string>;
    workspaceMain: Ref<WorkspaceMainView>;
    activeLongBookId: Readonly<Ref<string | null>>;
  };
  settingsStore: ReturnType<typeof useSettingsStore>;
  catalogSnapshot: Readonly<Ref<CatalogSnapshot | null>>;
  features: {
    learningImitation: {
      controller: LazyLearningImitationController["controller"];
      ensureLoaded(): Promise<unknown>;
    };
    subagentAuthoring: {
      controller: LazySubagentAuthoringController["controller"];
      ensureLoaded(): Promise<unknown>;
    };
  };
  actions: {
    saveActiveLongEditorBeforeLeaving(): Promise<boolean>;
    newShortConversation(): void;
    newLongConversation(): void;
  };
  loaders: {
    loadModelSettings(): Promise<unknown>;
    loadShortAndScriptAgentSettings(): Promise<unknown>;
    ensureLongAgentSettingsLoaded(): Promise<unknown>;
    loadWorkspaceAgentSettings(): Promise<unknown>;
    loadAgentTeamSettings(): Promise<unknown>;
    loadLibraryAgentSettings(): Promise<unknown>;
    loadLearningImitationSettings(): Promise<unknown>;
    loadCatalogSnapshot(): Promise<unknown>;
  };
  notifications: WorkspaceFeatureHostNotifications;
}

export interface WorkspaceFeatureHostCoordinator {
  isLongWorkspaceActive: ComputedRef<boolean>;
  activeFeature: ComputedRef<ActiveFeature>;
  workspaceFeatureModule: ComputedRef<WorkspaceFeatureModule | null>;
  marketplaceDisplayName: Ref<string | undefined>;
  showConversation(): void;
  newConversation(): void;
  openWorkspaceDialog(mode: DialogMode): Promise<void>;
  openSettings(category?: string): Promise<void>;
  openAgentTeams(): Promise<void>;
  openMarketplace(): Promise<void>;
  openCloudBackup(): Promise<void>;
  loadWorkspaceDirectory(): Promise<void>;
  chooseWorkspaceDirectory(): Promise<void>;
  closeSettings(): void;
  applyMarketplaceSession(session: MarketplaceSession): void;
  loadMarketplaceSession(): Promise<void>;
  ensureActiveFeatureDependencies(feature: ActiveFeature): Promise<void>;
  dispose(): void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Owns navigation and render descriptors for the mutually exclusive workspace
 * feature pages. Loader/action ports are deliberately invoked only from public
 * methods so the shell can pass thunks for coordinators declared later.
 */
export function useWorkspaceFeatureHostCoordinator(
  options: WorkspaceFeatureHostCoordinatorOptions
): WorkspaceFeatureHostCoordinator {
  const { settingsStore } = options;
  const marketplaceDisplayName = ref<string>();
  const knownMarketplaceSession = ref<MarketplaceSession | null>(null);
  let active = true;
  let navigationGeneration = 0;
  let marketplaceRevision = 0;
  let marketplaceRequestGeneration = 0;
  let directoryChooseGeneration = 0;
  let directoryChoosePending = false;

  const isLongWorkspaceActive = computed(
    () =>
      options.view.workspaceMain.value === "conversation" &&
      options.view.activeLongBookId.value !== null
  );
  const activeFeature = computed<ActiveFeature>(() =>
    options.view.current.value === "settings"
      ? "settings"
      : isLongWorkspaceActive.value
        ? "long-workspace"
        : options.view.workspaceMain.value
  );

  const workspaceFeatureModule = computed<WorkspaceFeatureModule | null>(() => {
    switch (activeFeature.value) {
      case "settings":
        return {
          kind: "settings",
          initialCategory: options.view.settingsInitialCategory.value,
          permissionMode: settingsStore.generalSettings.permissionMode,
          autoSaveEnabled: settingsStore.editorAutoSaveEnabled,
          language: settingsStore.generalSettings.language,
          showInMenuBar: settingsStore.generalSettings.showInMenuBar,
          workspaceAgentSettings: settingsStore.workspaceAgentSettings,
          longAgentSettings: settingsStore.longAgentSettings,
          workspaceAgentLoading: settingsStore.workspaceAgentLoading,
          workspaceAgentSaving: settingsStore.workspaceAgentSaving,
          longAgentLoading: settingsStore.longAgentLoading,
          longAgentSaving: settingsStore.longAgentSaving,
          longAgentError: settingsStore.longAgentLoadError,
          libraryAgentSettings: settingsStore.libraryAgentSettings,
          libraryAgentLoading: settingsStore.libraryAgentLoading,
          libraryAgentSaving: settingsStore.libraryAgentSaving,
          learningImitationSettings: settingsStore.learningImitationSettings,
          learningImitationLoading: settingsStore.learningImitationLoading,
          learningImitationSaving: settingsStore.learningImitationSaving,
          modelUsageDashboard: settingsStore.modelUsageDashboard,
          modelUsageLoading: settingsStore.modelUsageLoading,
          modelSettings: settingsStore.modelSettings,
          modelLoading: settingsStore.modelLoading,
          modelSaving: settingsStore.modelSaving,
          modelError: settingsStore.modelError,
          modelTestMessage: settingsStore.modelTestMessage,
          testingModelId: settingsStore.testingModelId,
          runtimeAvailable: Boolean(options.api())
        };
      case "agent-team":
        return {
          kind: "agent-team",
          settings: settingsStore.agentTeamSettings,
          longSettings: settingsStore.longAgentTeamSettings,
          models: settingsStore.modelSettings?.models ?? [],
          skills: options.catalogSnapshot.value?.skills ?? [],
          preferredModelId:
            settingsStore.modelSettings?.defaultModelId ?? null,
          loading: settingsStore.agentTeamLoading,
          saving: settingsStore.agentTeamSaving,
          loadError: settingsStore.agentTeamLoadError,
          longLoading: settingsStore.longAgentTeamLoading,
          longSaving: settingsStore.longAgentTeamSaving,
          longLoadError: settingsStore.longAgentTeamLoadError,
          runtimeAvailable: Boolean(options.api()),
          authoring: options.features.subagentAuthoring.controller.value
        };
      case "directory":
        return {
          kind: "directory",
          path: settingsStore.workspaceDirectoryPath,
          loading: settingsStore.workspaceDirectoryLoading
        };
      case "inkhub-library":
        return { kind: "inkhub-library" };
      case "models":
        return {
          kind: "models",
          settings: settingsStore.modelSettings,
          loading: settingsStore.modelLoading,
          saving: settingsStore.modelSaving,
          freeModelsRefreshing: settingsStore.freeModelsRefreshing,
          error: settingsStore.modelError,
          testMessage: settingsStore.modelTestMessage,
          testingModelId: settingsStore.testingModelId
        };
      case "imitation":
        return {
          kind: "imitation",
          controller: options.features.learningImitation.controller.value,
          models: settingsStore.modelSettings?.models ?? [],
          catalogSnapshot: options.catalogSnapshot.value,
          approvalMode: settingsStore.generalSettings.permissionMode
        };
      case "marketplace":
        return {
          kind: "marketplace",
          catalogSnapshot: options.catalogSnapshot.value,
          session: knownMarketplaceSession.value
        };
      case "cloud-backup":
        return { kind: "cloud-backup" };
      case "conversation":
      case "long-workspace":
        return null;
    }
  });

  const stopLearningErrorWatch = watch(
    () => options.features.learningImitation.controller.value?.error.value ?? null,
    (message) => {
      if (active && message) options.notifications.error(message);
    }
  );
  const stopAuthoringErrorWatch = watch(
    () => options.features.subagentAuthoring.controller.value?.error.value ?? null,
    (message) => {
      if (active && message) options.notifications.error(message);
    }
  );

  function beginNavigation(): number {
    return ++navigationGeneration;
  }

  function navigationIsCurrent(generation: number): boolean {
    return active && generation === navigationGeneration;
  }

  function issueBackground(task: () => Promise<unknown>): void {
    try {
      void task().catch(() => undefined);
    } catch {
      // Background loaders own their visible feedback. This guard also keeps a
      // synchronous port failure from escaping a void UI event handler.
    }
  }

  async function canApplyNavigation(generation: number): Promise<boolean> {
    const saved = await options.actions.saveActiveLongEditorBeforeLeaving();
    return saved && navigationIsCurrent(generation);
  }

  function newConversation(): void {
    beginNavigation();
    if (!active) return;
    if (options.view.activeLongBookId.value !== null) {
      options.actions.newLongConversation();
      return;
    }
    options.actions.newShortConversation();
  }

  function showConversation(): void {
    beginNavigation();
    if (active) options.view.workspaceMain.value = "conversation";
  }

  async function openWorkspaceDialog(mode: DialogMode): Promise<void> {
    const generation = beginNavigation();
    if (!(await canApplyNavigation(generation))) return;
    if (mode === "imitation") {
      try {
        await options.features.learningImitation.ensureLoaded();
      } catch (error: unknown) {
        if (navigationIsCurrent(generation)) {
          options.notifications.error(
            errorMessage(error, "加载学习仿写模块失败。")
          );
        }
        return;
      }
      if (!navigationIsCurrent(generation)) return;
    }
    options.view.workspaceMain.value = mode;
    if (mode === "directory" && options.api()) {
      issueBackground(loadWorkspaceDirectory);
    }
    if (
      (mode === "models" || mode === "imitation") &&
      !settingsStore.modelSettings &&
      options.api()
    ) {
      issueBackground(options.loaders.loadModelSettings);
    }
  }

  async function openSettings(initialCategory = "general"): Promise<void> {
    const generation = beginNavigation();
    if (!(await canApplyNavigation(generation))) return;
    options.view.settingsInitialCategory.value = initialCategory;
    options.view.current.value = "settings";
    if (!options.api()) return;
    if (!settingsStore.modelSettings) {
      issueBackground(options.loaders.loadModelSettings);
    }
    issueBackground(options.loaders.loadWorkspaceAgentSettings);
    issueBackground(options.loaders.loadLibraryAgentSettings);
    issueBackground(options.loaders.loadLearningImitationSettings);
  }

  async function openAgentTeams(): Promise<void> {
    const generation = beginNavigation();
    if (!(await canApplyNavigation(generation))) return;
    try {
      await options.features.subagentAuthoring.ensureLoaded();
    } catch (error: unknown) {
      if (navigationIsCurrent(generation)) {
        options.notifications.error(
          errorMessage(error, "加载智能体团队模块失败。")
        );
      }
      return;
    }
    if (!navigationIsCurrent(generation)) return;
    options.view.workspaceMain.value = "agent-team";
    if (
      options.api() &&
      (!settingsStore.agentTeamLoaded || !settingsStore.longAgentTeamLoaded)
    ) {
      issueBackground(options.loaders.loadAgentTeamSettings);
    }
    if (options.api() && !settingsStore.modelSettings) {
      issueBackground(options.loaders.loadModelSettings);
    }
    if (options.api() && !options.catalogSnapshot.value) {
      issueBackground(options.loaders.loadCatalogSnapshot);
    }
  }

  async function openMarketplace(): Promise<void> {
    const generation = beginNavigation();
    if (!(await canApplyNavigation(generation))) return;
    options.view.workspaceMain.value = "marketplace";
    if (options.api() && !options.catalogSnapshot.value) {
      issueBackground(options.loaders.loadCatalogSnapshot);
    }
  }

  async function openCloudBackup(): Promise<void> {
    const generation = beginNavigation();
    if (!(await canApplyNavigation(generation))) return;
    options.view.workspaceMain.value = "cloud-backup";
  }

  async function loadWorkspaceDirectory(): Promise<void> {
    const api = options.api();
    if (!active || !api) return;
    try {
      await settingsStore.ensureWorkspaceDirectoryLoaded(() =>
        api.workspaceDirectory.list()
      );
    } catch (error: unknown) {
      if (active) {
        options.notifications.error(
          errorMessage(error, "加载工作目录失败。")
        );
      }
    }
  }

  async function chooseWorkspaceDirectory(): Promise<void> {
    const api = options.api();
    if (
      !active ||
      !api ||
      directoryChoosePending ||
      settingsStore.workspaceDirectoryLoading
    ) {
      return;
    }
    const generation = ++directoryChooseGeneration;
    directoryChoosePending = true;
    settingsStore.workspaceDirectoryLoading = true;
    try {
      const settings = await api.workspaceDirectory.choose();
      if (!active || generation !== directoryChooseGeneration || !settings) {
        return;
      }
      settingsStore.markLoaded("workspaceDirectory", settings);
      options.notifications.success(
        "工作目录已切换；现有项目保持原位置不变"
      );
    } catch (error: unknown) {
      if (active && generation === directoryChooseGeneration) {
        options.notifications.error(
          errorMessage(error, "切换工作目录失败。")
        );
      }
    } finally {
      if (generation === directoryChooseGeneration) {
        directoryChoosePending = false;
        settingsStore.workspaceDirectoryLoading = false;
      }
    }
  }

  function closeSettings(): void {
    beginNavigation();
    if (active) options.view.current.value = "workspace";
  }

  function applyMarketplaceSession(session: MarketplaceSession): void {
    if (!active) return;
    marketplaceRevision += 1;
    knownMarketplaceSession.value = session;
    marketplaceDisplayName.value = session.authenticated
      ? session.user?.displayName
      : undefined;
  }

  async function loadMarketplaceSession(): Promise<void> {
    const api = options.api()?.marketplace;
    if (!active || !api) return;
    const requestRevision = marketplaceRevision;
    const requestGeneration = ++marketplaceRequestGeneration;
    try {
      const session = await api.session();
      if (
        !active ||
        requestRevision !== marketplaceRevision ||
        requestGeneration !== marketplaceRequestGeneration
      ) {
        return;
      }
      applyMarketplaceSession(session);
    } catch {
      // Startup session discovery is best-effort. The marketplace page owns
      // visible feedback when the user explicitly opens it.
    }
  }

  async function ensureActiveFeatureDependencies(
    feature: ActiveFeature
  ): Promise<void> {
    if (!active || !options.api()) return;
    if (feature === "conversation") {
      await Promise.all([
        options.loaders.loadModelSettings(),
        options.loaders.loadShortAndScriptAgentSettings()
      ]);
      return;
    }
    if (feature === "long-workspace") {
      await Promise.all([
        options.loaders.loadModelSettings(),
        options.loaders.ensureLongAgentSettingsLoaded()
      ]);
      return;
    }
    if (feature === "models") {
      await options.loaders.loadModelSettings();
    }
  }

  function dispose(): void {
    if (!active) return;
    active = false;
    navigationGeneration += 1;
    marketplaceRevision += 1;
    marketplaceRequestGeneration += 1;
    directoryChooseGeneration += 1;
    if (directoryChoosePending) {
      directoryChoosePending = false;
      settingsStore.workspaceDirectoryLoading = false;
    }
    stopLearningErrorWatch();
    stopAuthoringErrorWatch();
  }

  return {
    isLongWorkspaceActive,
    activeFeature,
    workspaceFeatureModule,
    marketplaceDisplayName,
    showConversation,
    newConversation,
    openWorkspaceDialog,
    openSettings,
    openAgentTeams,
    openMarketplace,
    openCloudBackup,
    loadWorkspaceDirectory,
    chooseWorkspaceDirectory,
    closeSettings,
    applyMarketplaceSession,
    loadMarketplaceSession,
    ensureActiveFeatureDependencies,
    dispose
  };
}
