<script setup lang="ts">
import type {
  AppLanguage,
  GeneralPermissionMode,
  LearningImitationSettingsInput,
  LearningImitationStageId,
  LibraryAgentDomain,
  LibraryAgentSettingsInput,
  LongAgentSettingsInput,
  LongAgentTeamSettingsInput,
  MarketplaceSession,
  ModelConfigInput,
  ModelSettingsInput,
  ModelUsageQueryInput,
  WorkspaceAgentSettingsInput,
  WorkspaceAgentTeamSettingsInput
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import {
  AgentTeamSettingsPanel,
  CloudBackupPage,
  LearningImitationDialog,
  ModelSettingsFeature,
  SettingsPage,
  SkillMarketplacePage,
  WorkspaceDirectoryFeature,
  InkHubLibraryPage
} from "./lazyAppComponents";
import type { WorkspaceFeatureModule } from "./WorkspaceFeatureModules.types";
import WorkspaceFeatureFrame from "./WorkspaceFeatureFrame.vue";
import {
  generateWorkspaceFeatureSubagent,
  resetWorkspaceFeatureSubagent,
  stopWorkspaceFeatureSubagent
} from "./workspaceFeatureModuleAuthoring";

defineProps<{
  module: WorkspaceFeatureModule;
  leftCollapsed: boolean;
}>();

const emit = defineEmits<{
  expandLeft: [];
  back: [];
  updatePermissionMode: [mode: GeneralPermissionMode];
  updateAutoSave: [enabled: boolean];
  updateLanguage: [language: AppLanguage];
  updateShowInMenuBar: [enabled: boolean];
  saveWorkspaceAgents: [settings: WorkspaceAgentSettingsInput];
  retryLongAgents: [];
  saveLongAgents: [settings: LongAgentSettingsInput];
  saveLibraryAgents: [settings: LibraryAgentSettingsInput];
  resetLibraryAgent: [domain: LibraryAgentDomain];
  saveLearningImitation: [settings: LearningImitationSettingsInput];
  resetLearningImitation: [stageId: LearningImitationStageId];
  loadModelUsage: [input?: ModelUsageQueryInput];
  loadModels: [];
  saveModels: [settings: ModelSettingsInput];
  testModel: [model: ModelConfigInput];
  retryAgentTeam: [];
  saveAgentTeam: [settings: WorkspaceAgentTeamSettingsInput];
  saveLongAgentTeam: [settings: LongAgentTeamSettingsInput];
  chooseWorkspaceDirectory: [];
  refreshFreeModels: [];
  refreshCatalog: [];
  marketplaceSessionChange: [session: MarketplaceSession];
}>();

</script>

<template>
  <SettingsPage
    v-if="module.kind === 'settings'"
    :initial-category="module.initialCategory"
    :permission-mode="module.permissionMode"
    :auto-save-enabled="module.autoSaveEnabled"
    :language="module.language"
    :show-in-menu-bar="module.showInMenuBar"
    :workspace-agent-settings="module.workspaceAgentSettings"
    :long-agent-settings="module.longAgentSettings"
    :workspace-agent-loading="module.workspaceAgentLoading"
    :workspace-agent-saving="module.workspaceAgentSaving"
    :long-agent-loading="module.longAgentLoading"
    :long-agent-saving="module.longAgentSaving"
    :long-agent-error="module.longAgentError"
    :library-agent-settings="module.libraryAgentSettings"
    :library-agent-loading="module.libraryAgentLoading"
    :library-agent-saving="module.libraryAgentSaving"
    :learning-imitation-settings="module.learningImitationSettings"
    :learning-imitation-loading="module.learningImitationLoading"
    :learning-imitation-saving="module.learningImitationSaving"
    :model-usage-dashboard="module.modelUsageDashboard"
    :model-usage-loading="module.modelUsageLoading"
    :model-settings="module.modelSettings"
    :model-loading="module.modelLoading"
    :model-saving="module.modelSaving"
    :model-error="module.modelError"
    :model-test-message="module.modelTestMessage"
    :testing-model-id="module.testingModelId"
    :runtime-available="module.runtimeAvailable"
    @back="emit('back')"
    @update-permission-mode="emit('updatePermissionMode', $event)"
    @update-auto-save="emit('updateAutoSave', $event)"
    @update-language="emit('updateLanguage', $event)"
    @update-show-in-menu-bar="emit('updateShowInMenuBar', $event)"
    @save-workspace-agents="emit('saveWorkspaceAgents', $event)"
    @retry-long-agents="emit('retryLongAgents')"
    @save-long-agents="emit('saveLongAgents', $event)"
    @save-library-agents="emit('saveLibraryAgents', $event)"
    @reset-library-agent="emit('resetLibraryAgent', $event)"
    @save-learning-imitation="emit('saveLearningImitation', $event)"
    @reset-learning-imitation="emit('resetLearningImitation', $event)"
    @load-model-usage="emit('loadModelUsage', $event)"
    @load-models="emit('loadModels')"
    @save-models="emit('saveModels', $event)"
    @test-model="emit('testModel', $event)"
  />

  <WorkspaceFeatureFrame
    v-else-if="module.kind === 'agent-team'"
    class="agent-team-main-view"
    :left-collapsed="leftCollapsed"
    expand-button-class="agent-team-expand-sidebar"
    label="智能体团队"
    @expand-left="emit('expandLeft')"
  >
    <AgentTeamSettingsPanel
      v-if="module.authoring"
      :settings="module.settings"
      :long-settings="module.longSettings"
      :models="module.models"
      :skills="module.skills"
      :preferred-model-id="module.preferredModelId"
      :loading="module.loading"
      :saving="module.saving"
      :load-error="module.loadError"
      :long-loading="module.longLoading"
      :long-saving="module.longSaving"
      :long-load-error="module.longLoadError"
      :runtime-available="module.runtimeAvailable"
      :authoring-generating="module.authoring.isBusy.value"
      :authoring-draft="module.authoring.draft.value"
      :authoring-status-text="module.authoring.statusText.value"
      :authoring-error="module.authoring.error.value"
      @retry="emit('retryAgentTeam')"
      @save="emit('saveAgentTeam', $event)"
      @save-long="emit('saveLongAgentTeam', $event)"
      @authoring-generate="generateWorkspaceFeatureSubagent(module, $event)"
      @authoring-stop="stopWorkspaceFeatureSubagent(module)"
      @authoring-reset="resetWorkspaceFeatureSubagent(module)"
    />
  </WorkspaceFeatureFrame>

  <WorkspaceFeatureFrame
    v-else-if="module.kind === 'directory'"
    class="workspace-settings-main-view"
    :left-collapsed="leftCollapsed"
    expand-button-class="workspace-settings-expand-sidebar"
    label="工作目录"
    @expand-left="emit('expandLeft')"
  >
    <WorkspaceDirectoryFeature
      :path="module.path"
      :loading="module.loading"
      @choose="emit('chooseWorkspaceDirectory')"
    />
  </WorkspaceFeatureFrame>

  <WorkspaceFeatureFrame
    v-else-if="module.kind === 'inkhub-library'"
    class="inkhub-library-main-view"
    :left-collapsed="leftCollapsed"
    expand-button-class="inkhub-library-expand-sidebar"
    label="墨枢资料库"
    @expand-left="emit('expandLeft')"
  >
    <InkHubLibraryPage @catalog-changed="emit('refreshCatalog')" />
  </WorkspaceFeatureFrame>

  <WorkspaceFeatureFrame
    v-else-if="module.kind === 'models'"
    class="workspace-settings-main-view"
    :left-collapsed="leftCollapsed"
    expand-button-class="workspace-settings-expand-sidebar"
    label="模型配置"
    @expand-left="emit('expandLeft')"
  >
    <ModelSettingsFeature
      active
      :model-settings="module.settings"
      :model-loading="module.loading"
      :model-saving="module.saving"
      :free-models-refreshing="module.freeModelsRefreshing"
      :model-error="module.error"
      :model-test-message="module.testMessage"
      :testing-model-id="module.testingModelId"
      @save-models="emit('saveModels', $event)"
      @refresh-free-models="emit('refreshFreeModels')"
      @test-model="emit('testModel', $event)"
    />
  </WorkspaceFeatureFrame>

  <WorkspaceFeatureFrame
    v-else-if="module.kind === 'imitation'"
    class="learning-imitation-main-view"
    :left-collapsed="leftCollapsed"
    expand-button-class="learning-imitation-expand-sidebar"
    label="短篇学习仿写"
    @expand-left="emit('expandLeft')"
  >
    <LearningImitationDialog
      v-if="module.controller"
      active
      :controller="module.controller"
      :models="module.models"
      :catalog-snapshot="module.catalogSnapshot"
      :approval-mode="module.approvalMode"
      @refresh-catalog="emit('refreshCatalog')"
    />
  </WorkspaceFeatureFrame>

  <main
    v-else-if="module.kind === 'marketplace'"
    class="marketplace-main-view"
    aria-label="技能广场"
  >
    <button
      v-if="leftCollapsed"
      class="icon-button marketplace-expand-sidebar"
      type="button"
      aria-label="展开左侧栏"
      @click="emit('expandLeft')"
    >
      <AppIcon name="panel-left" :size="18" />
    </button>
    <SkillMarketplacePage
      active
      :catalog-snapshot="module.catalogSnapshot"
      :initial-session="module.session"
      @refresh-catalog="emit('refreshCatalog')"
      @session-change="emit('marketplaceSessionChange', $event)"
    />
  </main>

  <main
    v-else-if="module.kind === 'cloud-backup'"
    class="marketplace-main-view"
    aria-label="云端备份"
  >
    <button
      v-if="leftCollapsed"
      class="icon-button marketplace-expand-sidebar"
      type="button"
      aria-label="展开左侧栏"
      @click="emit('expandLeft')"
    >
      <AppIcon name="panel-left" :size="18" />
    </button>
    <CloudBackupPage
      active
      @refresh-catalog="emit('refreshCatalog')"
    />
  </main>
</template>
