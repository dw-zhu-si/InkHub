import { describe, expect, it } from "vitest";
import source from "./LeftSidebar.vue?raw";

describe("LeftSidebar account controls", () => {
  it("separates the account menu from the settings-page button", () => {
    expect(source).toContain('@click="toggleAccountMenu"');
    expect(source).toContain('aria-label="打开设置"');
    expect(source).toContain('@click="openSettings"');
    expect(source).not.toContain('@click="emit(\'openSettings\')"');
  });

  it("offers settings and updates without upstream author contact", () => {
    expect(source).toContain("<span>设置</span>");
    expect(source).toContain('@click="openSettings"');
    expect(source).toContain("<span>版本更新</span>");
    expect(source).not.toContain("联系作者");
    expect(source).not.toContain('profileDialog.value = "contact"');
    expect(source).not.toContain("<span>姓名</span>");
    expect(source).not.toContain("openNameDialog");
    expect(source).not.toContain("设置姓名");
  });

  it("does not retain upstream author contact or local name persistence", () => {
    expect(source).not.toContain("USER_NAME_STORAGE_KEY");
    expect(source).not.toContain("saveUserName");
    expect(source).not.toContain("userNameDraft");
    expect(source).not.toContain("deepseekwrite");
  });

  it("prefers the signed-in marketplace display name", () => {
    expect(source).toContain("marketplaceDisplayName?: string | undefined");
    expect(source).toContain(
      "props.marketplaceDisplayName?.trim() || DEFAULT_USER_NAME"
    );
    expect(source).toContain("{{ displayedUserName }}");
  });

  it("shows a background-running marker for learning imitation", () => {
    expect(source).toContain("imitationRunning");
    expect(source).toContain("nav-background-status");
    expect(source).toContain("后台中");
  });

  it("turns the top action into create-book instead of a new conversation", () => {
    expect(source).toContain('label: "新建书籍"');
    expect(source).toContain('id: "create-book"');
    expect(source).toContain('aria-label="新建书籍"');
    expect(source).toContain('emit("createBook")');
    expect(source).not.toContain('label: "新建对话"');
    expect(source).not.toContain("newConversation");
    expect(source).toContain('navigator.platform');
    expect(source).toContain('"⌘ N" : "Ctrl N"');
  });

  it("keeps agent-team management in the primary navigation", () => {
    expect(source).toContain('id: "agent-teams"');
    expect(source).toContain('emit("openAgentTeams")');
    expect(source).toContain("props.activePrimaryFeature");
    expect(source).toContain("'is-active'");
    expect(source).toContain("'page'");
  });

  it("exposes AI creation chat as a visible primary navigation destination", () => {
    expect(source).toContain('{ id: "conversation", label: "AI 创作对话"');
    expect(source).toContain("openConversation: []");
    expect(source).toContain('emit("openConversation")');
    expect(source).toContain("item.id === props.activePrimaryFeature");
  });

  it("moves learning imitation into more features and keeps its state feedback", () => {
    const primaryFeatures = source.slice(
      source.indexOf("const navItems"),
      source.indexOf("function loadPinnedResourceIds")
    );
    const moreFeatures = source.slice(
      source.indexOf("const moreFeatures"),
      source.indexOf("function activateMoreFeature")
    );

    expect(primaryFeatures).not.toContain('label: "短篇学习仿写"');
    expect(moreFeatures).toContain('{ id: "imitation", label: "短篇学习仿写"');
    expect(source).toContain('emit("openDialog", "imitation")');
    expect(source).toContain("feature.id === props.activePrimaryFeature");
    expect(source).toContain("feature.id === 'imitation' && props.imitationRunning");
  });

  it("keeps external channels out of navigation while exposing the local novel library", () => {
    expect(source).not.toContain('{ id: "skill-marketplace", label: "技能广场"');
    expect(source).not.toContain('{ id: "cloud-backup", label: "云端备份"');
    expect(source).toContain('{ id: "inkhub-library", label: "我的小说"');
    expect(source).toContain('{ id: "runtime", label: "运行设置"');
    expect(source).not.toContain('{ id: "history", label: "版本历史"');
    expect(source).not.toContain('{ id: "search", label: "全局检索"');
    expect(source).not.toContain('{ id: "transfer", label: "导入与导出"');
    expect(source).toContain('@click="activateMoreFeature(feature.id)"');
  });

  it("shows and locks the update dialog while macOS hands off to the installer", () => {
    expect(source).toContain(
      'const updateInstalling = computed(() => updateState.value.status === "installing")'
    );
    expect(source).toContain("正在安全退出并准备安装…");
    expect(source).toContain(':disabled="updateInstalling"');
    expect(source).toContain("正在安装…");
  });
});
