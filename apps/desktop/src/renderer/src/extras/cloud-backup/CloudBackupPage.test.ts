import { describe, expect, it } from "vitest";
import source from "./CloudBackupPage.vue?raw";
import appSource from "../../WorkspaceShell.vue?raw";
import sidebarSource from "../../components/LeftSidebar.vue?raw";
import featureModulesSource from "../../components/WorkspaceFeatureModules.vue?raw";
import featureHostSource from "../../composables/useWorkspaceFeatureHostCoordinator.ts?raw";

describe("CloudBackupPage", () => {
  it("remains isolated from navigation and never asks the user to log in", () => {
    expect(source).toContain("云端备份");
    expect(source).toContain("请在墨枢桌面客户端中打开云端备份");
    expect(source).not.toContain("DeepWrite 桌面客户端");
    expect(source).toContain("无需登录");
    expect(source).toContain("本机备份密钥");
    expect(source).not.toContain("password");
    expect(source).not.toContain("authMode");
    expect(sidebarSource).not.toContain('{ id: "cloud-backup", label: "云端备份"');
    expect(appSource).toContain('@open-cloud-backup="openCloudBackup"');
    expect(featureHostSource).toContain('case "cloud-backup":');
    expect(featureHostSource).toContain(
      'return { kind: "cloud-backup" };'
    );
    expect(featureHostSource).toContain(
      'options.view.workspaceMain.value = "cloud-backup"'
    );
    expect(featureModulesSource).toContain(
      'v-else-if="module.kind === \'cloud-backup\'"'
    );
  });

  it("requires a confirmation dialog before backup or restore writes data", () => {
    expect(source).toContain("确认同步内容");
    expect(source).toContain("将新增");
    expect(source).toContain("将覆盖");
    expect(source).toContain("不会改动");
    expect(source).toContain("confirmPreview");
    expect(source).toContain("danger-button");
    expect(source).toContain("100 MB");
  });

  it("keeps status in the shared settings store and coalesces first-entry loading", () => {
    expect(source).toContain("useSettingsStore");
    expect(source).toContain("ensureCloudBackupLoaded");
    expect(source).toContain('invalidate("cloudBackup")');
    expect(source).not.toContain("onMounted");
  });
});
