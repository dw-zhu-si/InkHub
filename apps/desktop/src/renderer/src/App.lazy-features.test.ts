import { describe, expect, it } from "vitest";
import source from "./WorkspaceShell.vue?raw";
import learningSource from "./components/LearningImitationDialog.vue?raw";
import dialogLayerSource from "./components/WorkspaceDialogLayer.vue?raw";
import featureModulesSource from "./components/WorkspaceFeatureModules.vue?raw";
import lazyComponentsSource from "./components/lazyAppComponents.ts?raw";
import featureHostSource from "./composables/useWorkspaceFeatureHostCoordinator.ts?raw";

describe("App lazy feature mounting", () => {
  it("keeps only the default writing surface in the eager component imports", () => {
    expect(source).toContain(
      'from "./components/lazyAppComponents"'
    );
    expect(lazyComponentsSource).toContain("defineAsyncComponent");
    expect(lazyComponentsSource).toContain(
      '() => import("./SettingsPage.vue")'
    );
    expect(lazyComponentsSource).toContain(
      '() => import("./LongWorkspaceEditor.vue")'
    );
    expect(lazyComponentsSource).toContain(
      '() => import("./AgentTeamSettingsPanel.vue")'
    );
    expect(lazyComponentsSource).toContain(
      '() => import("../extras/cloud-backup/CloudBackupPage.vue")'
    );
    expect(lazyComponentsSource).toContain(
      '() => import("./ModelSettingsFeature.vue")'
    );
    expect(lazyComponentsSource).toContain(
      '() => import("./WorkspaceDirectoryFeature.vue")'
    );
    expect(source).not.toContain(
      'import SettingsPage from "./components/SettingsPage.vue"'
    );
    expect(source).not.toContain(
      'import LongWorkspaceEditor from "./components/LongWorkspaceEditor.vue"'
    );
  });

  it("loads model settings and workspace directory as separate features", () => {
    expect(featureModulesSource).toContain('<WorkspaceDirectoryFeature\n');
    expect(featureModulesSource).toContain('<ModelSettingsFeature\n');
    expect(source).toContain("<WorkspaceFeatureModules");
    expect(source).not.toContain("<WorkspaceDirectoryFeature");
    expect(source).not.toContain("<ModelSettingsFeature");
    expect(featureModulesSource).not.toContain(
      ':mode="workspaceMainView === \'directory\' ? \'directory\' : \'models\'"'
    );
  });

  it("conditionally mounts mutually exclusive feature pages and heavy dialogs", () => {
    expect(source).toContain("useWorkspaceFeatureHostCoordinator({");
    expect(featureHostSource).toContain(
      "const workspaceFeatureModule = computed"
    );
    expect(featureModulesSource).toContain(
      'v-else-if="module.kind === \'marketplace\'"'
    );
    expect(featureModulesSource).toContain(
      'v-else-if="module.kind === \'cloud-backup\'"'
    );
    expect(source).toContain('v-if="activeFeature === \'long-workspace\'"');
    expect(source).not.toContain("<KeepAlive>");
    expect(source).toContain(
      '<WorkspaceDialogLayer\n    v-if="workspaceDialogModule"'
    );
    expect(dialogLayerSource).toContain('<DialogHost\n    v-if="module"');
    expect(dialogLayerSource).toContain(':active-dialog="module.kind"');
    expect(dialogLayerSource).toContain(
      '<BookResourceDialog\n      v-if="module.kind === \'book-resource\'"'
    );
    expect(dialogLayerSource).toContain(
      '<CreateBookDialog\n      v-else-if="module.kind === \'create-book\'"'
    );
    expect(dialogLayerSource).toContain(
      '<SaveConflictDialog\n      v-else-if="module.kind === \'save-conflict\'"'
    );
    expect(source).not.toContain("<BookResourceDialog\n");
    expect(source).not.toContain('v-show="workspaceMainView');
  });

  it("keeps learning-page keyboard work lifecycle-safe", () => {
    expect(learningSource).toContain("onActivated(startKeydownListener)");
    expect(learningSource).toContain("onDeactivated(stopKeydownListener)");
    expect(learningSource).toContain("lastCompletedStage.value");
    expect(learningSource).toContain("{ immediate: true }");
  });
});
