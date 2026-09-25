import { describe, expect, it } from "vitest";
import source from "./WorkspaceShell.vue?raw";
import longWorkspaceSource from "./components/LongWorkspaceModule.vue?raw";
import coordinatorSource from "./composables/useGeneralSettingsCoordinator.ts?raw";
import lifecycleSource from "./composables/useWorkspaceLifecycleCoordinator.ts?raw";
import runtimeRegistrySource from "./composables/useConversationRuntimeRegistryCoordinator.ts?raw";
import shortConversationSource from "./composables/useShortConversationCoordinator.ts?raw";
import longConversationSource from "./composables/useLongConversationCoordinator.ts?raw";

describe("App general settings integration", () => {
  it("loads and persists general settings through the desktop runtime", () => {
    expect(source).toContain("loadGeneralSettings,");
    expect(lifecycleSource).toContain("options.loadGeneralSettings()");
    expect(source).toContain("window.deepwrite?.generalSettings");
    expect(source).toContain("useGeneralSettingsCoordinator({");
    expect(coordinatorSource).toContain("await api.save(snapshot);");
  });

  it("uses the configured permission as every agent's default approval mode", () => {
    expect(source).toContain(
      "permissionMode: () => generalSettings.value.permissionMode"
    );
    expect(runtimeRegistrySource).toContain(
      "conversation.selectApprovalMode(options.permissionMode())"
    );
    expect(runtimeRegistrySource).toContain(
      "conversation.selectApprovalMode(permissionMode)"
    );
    expect(source).toContain("applyApprovalMode: applyDefaultApprovalMode");
    expect(coordinatorSource).toContain(
      "options.applyApprovalMode(permissionMode)"
    );
    expect(shortConversationSource).toContain(
      "options.settings.updatePermissionMode(mode)"
    );
    expect(longConversationSource).toContain(
      "options.settings.updatePermissionMode(mode)"
    );
    expect(longWorkspaceSource).toContain(
      ':approval-mode="conversationController.approvalMode.value"'
    );
    expect(source).toContain('@update-permission-mode="updatePermissionMode"');
  });

  it("applies language and menu-bar setting changes", () => {
    expect(source).toContain("documentRoot: document.documentElement");
    expect(coordinatorSource).toContain(
      "options.documentRoot.lang = resolvedLanguage"
    );
    expect(source).toContain('@update-language="updateAppLanguage"');
    expect(source).toContain('@update-show-in-menu-bar="updateShowInMenuBar"');
  });
});
