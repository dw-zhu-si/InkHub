import type {
  AppLanguage,
  CatalogSnapshot,
  GeneralPermissionMode,
  LearningImitationSettings,
  LibraryAgentSettings,
  LongAgentSettings,
  LongAgentTeamSettings,
  ModelConfig,
  MarketplaceSession,
  ModelSettings,
  ModelUsageDashboard,
  SkillLibrary,
  WorkspaceAgentSettings,
  WorkspaceAgentTeamSettings
} from "@deepwrite/contracts";
import type { LearningImitationController } from "../composables/useLearningImitation";
import type { SubagentAuthoringController } from "../composables/useSubagentAuthoring";

export interface SettingsFeatureModule {
  kind: "settings";
  initialCategory: string;
  permissionMode: GeneralPermissionMode;
  autoSaveEnabled: boolean;
  language: AppLanguage;
  showInMenuBar: boolean;
  workspaceAgentSettings: readonly WorkspaceAgentSettings[];
  longAgentSettings: LongAgentSettings | null;
  workspaceAgentLoading: boolean;
  workspaceAgentSaving: boolean;
  longAgentLoading: boolean;
  longAgentSaving: boolean;
  longAgentError: string | null;
  libraryAgentSettings: LibraryAgentSettings | null;
  libraryAgentLoading: boolean;
  libraryAgentSaving: boolean;
  learningImitationSettings: LearningImitationSettings | null;
  learningImitationLoading: boolean;
  learningImitationSaving: boolean;
  modelUsageDashboard: ModelUsageDashboard | null;
  modelUsageLoading: boolean;
  modelSettings: ModelSettings | null;
  modelLoading: boolean;
  modelSaving: boolean;
  modelError: string | null;
  modelTestMessage: string | null;
  testingModelId: string | null;
  runtimeAvailable: boolean;
}

export interface AgentTeamFeatureModule {
  kind: "agent-team";
  settings: readonly WorkspaceAgentTeamSettings[];
  longSettings: LongAgentTeamSettings | null;
  models: readonly ModelConfig[];
  skills: readonly SkillLibrary[];
  preferredModelId: string | null;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  longLoading: boolean;
  longSaving: boolean;
  longLoadError: string | null;
  runtimeAvailable: boolean;
  authoring: SubagentAuthoringController | null;
}

export interface DirectoryFeatureModule {
  kind: "directory";
  path: string | null;
  loading: boolean;
}

export interface ModelsFeatureModule {
  kind: "models";
  settings: ModelSettings | null;
  loading: boolean;
  saving: boolean;
  freeModelsRefreshing: boolean;
  error: string | null;
  testMessage: string | null;
  testingModelId: string | null;
}

export interface ImitationFeatureModule {
  kind: "imitation";
  controller: LearningImitationController | null;
  models: readonly ModelConfig[];
  catalogSnapshot: CatalogSnapshot | null;
  approvalMode: GeneralPermissionMode;
}

export interface MarketplaceFeatureModule {
  kind: "marketplace";
  catalogSnapshot: CatalogSnapshot | null;
  session: MarketplaceSession | null;
}

export interface CloudBackupFeatureModule {
  kind: "cloud-backup";
}

export interface InkHubLibraryFeatureModule {
  kind: "inkhub-library";
}

export type WorkspaceFeatureModule =
  | SettingsFeatureModule
  | AgentTeamFeatureModule
  | DirectoryFeatureModule
  | ModelsFeatureModule
  | ImitationFeatureModule
  | MarketplaceFeatureModule
  | CloudBackupFeatureModule
  | InkHubLibraryFeatureModule;
