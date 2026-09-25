import { describe, expect, it } from "vitest";
import source from "./LongStructureManager.vue?raw";

describe("LongStructureManager", () => {
  it("manages worldbuilding categories and text-only character types", () => {
    expect(source).toContain("结构管理");
    expect(source).toContain("管理世界观分类、人物类型、功能配置和长篇上下文");
    expect(source).toContain("props.snapshot.worldbuilding");
    expect(source).toContain("builder.createWorldbuilding");
    expect(source).toContain("builder.updateWorldbuilding");
    expect(source).toContain("builder.reorderWorldbuilding");
    expect(source).toContain("builder.deleteWorldbuilding");
    expect(source).toContain("新建世界观分类");
    expect(source).toContain("加载其他书籍世界观");
    expect(source).toContain("同步其他长篇书籍世界观");
    expect(source).toContain("包括分类结构与各分类正文");
    expect(source).toContain('"syncWorldbuilding"');
    expect(source).not.toContain("builder.createVolume");
    expect(source).not.toContain("builder.createArc");
    expect(source).not.toContain("builder.createChapter");
    expect(source).toContain("builder.createCharacterType");
    expect(source).toContain("builder.updateCharacterType");
    expect(source).toContain("builder.reorderCharacterType");
    expect(source).toContain("builder.deleteCharacterType");
    expect(source).toContain("人物类型");
    expect(source).toContain("迁移人物并删除");
    expect(source).toContain("activeFoundationSection === 'worldbuilding'");
    expect(source).not.toContain("builder.updateVolume");
    expect(source).not.toContain("builder.updateArc");
    expect(source).not.toContain("builder.updateChapter");
    expect(source).not.toContain("builder.deleteVolume");
    expect(source).not.toContain("builder.deleteArc");
    expect(source).not.toContain("builder.deleteChapter");
  });

  it("replaces narrative management with worldbuilding feature settings", () => {
    expect(source).toContain('type StructurePanel = "foundation" | "features" | "agents"');
    expect(source).toContain('label: "基础结构"');
    expect(source).toContain('label: "功能配置"');
    expect(source).toContain('label: "长篇上下文"');
    expect(source.indexOf('label: "长篇上下文"')).toBeLessThan(
      source.indexOf('label: "基础结构"')
    );
    expect(source.indexOf('label: "基础结构"')).toBeLessThan(
      source.indexOf('label: "功能配置"')
    );
    expect(source).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(source).not.toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(source).toContain("世界观条目样式");
    expect(source).toContain("人物与连续性条目样式");
    expect(source).toContain("剧情设计条目样式");
    expect(source).toContain('value: "top-tabs"');
    expect(source).toContain('value: "right-list"');
    expect(source).toContain('value: "left-tree"');
    expect(source).toContain('label: "左侧树形结构"');
    expect(source).toContain("builder.updateFeatureSettings");
    expect(source).toContain(
      "snapshot.featureSettings.worldbuildingItemLayout"
    );
    expect(source).toContain(
      "snapshot.featureSettings.characterAndContinuityItemLayout"
    );
    expect(source).toContain("snapshot.featureSettings.plotItemLayout");
    expect(source).toContain("<PopupSelect");
    expect(source).not.toContain('label: "剧情与叙事"');
    expect(source).not.toContain("<LongPlotStructureManager");
    expect(source).not.toContain('label: "人物"');
    expect(source).not.toContain('label: "分卷"');
    expect(source).not.toContain('label: "剧情点"');
    expect(source).not.toContain('label: "章卡"');
    expect(source).not.toContain("功能配置项暂时为空");
    expect(source).toContain('id="long-structure-panel-content-agents"');
    expect(source).toContain('aria-label="长篇上下文"');
    expect(source).toContain('"saveAgentsMd"');
    expect(source).toContain("flushAgentsMdIfNeeded");
  });

  it("waits for durable completion and preserves form drafts on failure", () => {
    expect(source).toContain("const pendingMutation = ref<");
    expect(source).toContain(
      "() => props.disabled || pendingMutation.value !== null"
    );
    expect(source).toContain(
      'succeed: () => finishMutation(requestId, "succeeded")'
    );
    expect(source).toContain(
      'fail: () => finishMutation(requestId, "failed")'
    );
    expect(source).toContain("appliedButRefreshFailed");
    expect(source).toContain('if (outcome === "failed") return');
    expect(source).toContain('}, "form")');
    expect(source).toContain('"delete"');
    expect(source).toContain(':disabled="mutationLocked"');
  });

  it("uses shared themed controls and compact teleported dialogs", () => {
    expect(source).toContain("<PopupSelect");
    expect(source.match(/<Teleport to="body">/gu)).toHaveLength(3);
    expect(source).toContain(":menu-z-index=\"2300\"");
    for (const themeToken of [
      "--surface-main",
      "--surface-raised",
      "--surface-muted",
      "--surface-hover",
      "--theme-line",
      "--theme-line-soft",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--accent",
      "--accent-soft",
      "--neutral-solid"
    ]) {
      expect(source).toContain(`var(${themeToken})`);
    }
    expect(source).toContain("font-size: 0.875rem");
    expect(source).toContain("@media (max-width: 42rem)");
    expect(source).toContain("uiMessage.warning");
    expect(source).toContain('@keydown.esc.stop="closeForm"');
    expect(source).toContain('@keydown.esc.stop="closeDelete"');
    expect(source).toContain('@keydown.esc.stop="closeSync"');
    expect(source).toContain("danger-button");
    expect(source).toContain("确认同步全部数据");
  });

  it("publishes one prioritized child modal so its parent can suspend", () => {
    expect(source).toContain("const activeModal = computed");
    expect(source).toContain('modalActiveChange: [active: boolean]');
    expect(source).toContain('activeModal === \'form\'');
    expect(source).toContain('activeModal === \'sync\'');
    expect(source).toContain('activeModal === \'delete\'');
  });
});
