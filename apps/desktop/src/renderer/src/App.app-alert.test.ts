import { describe, expect, it } from "vitest";
import source from "./WorkspaceShell.vue?raw";
import dialogLayerSource from "./components/WorkspaceDialogLayer.vue?raw";
import coordinatorSource from "./composables/useSettingsFeatureCoordinator.ts?raw";
import dialogCoordinatorSource from "./composables/useWorkspaceDialogModuleCoordinator.ts?raw";
import featureHostSource from "./composables/useWorkspaceFeatureHostCoordinator.ts?raw";
import featureModulesSource from "./components/WorkspaceFeatureModules.vue?raw";
import lifecycleSource from "./composables/useWorkspaceLifecycleCoordinator.ts?raw";
import settingsSource from "./stores/settingsStore.ts?raw";

describe("App local alerts", () => {
  it("loads local alerts at startup without restoring upstream model routes", () => {
    expect(source).toMatch(
      /startDesktopSideEffects:[\s\S]*?loadAppAlerts\(\)/u
    );
    expect(source).toContain("useSettingsFeatureCoordinator({");
    expect(coordinatorSource).toContain("await api.get()");
    expect(settingsSource).toContain("支持直连各厂家 API，也推荐使用 ModelHub 统一管理。");
    expect(featureHostSource).not.toContain("official-models");
    expect(featureModulesSource).not.toContain("open-official-models");
    expect(source).not.toContain("openOfficialModelsSettings");
  });

  it("shows unseen desktop content and acknowledges it when dismissed", () => {
    expect(coordinatorSource).toContain("snapshot.shouldShowDesktop");
    expect(coordinatorSource).toContain("snapshot.desktopRevision");
    expect(coordinatorSource).toContain("api.acknowledgeDesktop(revision)");
    expect(dialogCoordinatorSource).toContain('kind: "startup-alert"');
    expect(dialogLayerSource).toContain("<StartupAlertDialog");
    expect(dialogLayerSource).toContain(
      "@close=\"emit('closeStartupAlert')\""
    );
    expect(source).toContain('@close-startup-alert="closeStartupAlert"');
  });

  it("checks the remote alert again when a hidden window regains focus", () => {
    expect(source).toMatch(
      /async function refreshWorkspaceOnWindowFocus\(\): Promise<void> \{[\s\S]*?loadAppAlerts\(\)/u
    );
    expect(source).toContain("refreshOnFocus: refreshWorkspaceOnWindowFocus");
    expect(lifecycleSource).toContain("options.refreshOnFocus()");
    expect(lifecycleSource).toContain("trailingFocusRefreshRequested = true");
  });
});
