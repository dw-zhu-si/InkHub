import { describe, expect, it } from "vitest";
import parentSource from "./LongWorkspaceEditor.vue?raw";
import source from "./LongPlotStoryListPane.vue?raw";

describe("LongPlotStoryListPane", () => {
  it("owns the plot-story navigation surface while the editor keeps orchestration", () => {
    expect(parentSource).toContain(
      'import LongPlotStoryListPane from "./LongPlotStoryListPane.vue"'
    );
    expect(parentSource).toContain("<LongPlotStoryListPane");
    expect(parentSource).toContain('@select="selectStoryPlot"');
    expect(parentSource).toContain(
      '@toggle-action-menu="toggleStoryPlotActionMenu"'
    );
    expect(parentSource).toContain(
      '@menu-action="runStoryPlotMenuAction"'
    );
    expect(source).not.toContain("resolveLongWorkspaceApi");
    expect(source).not.toContain("writeDocument");
  });

  it("keeps selection, loading, menu and disabled states explicit", () => {
    expect(source).toContain("plots: StoryPlot[]");
    expect(source).toContain("activeStoryPlotId: string | null");
    expect(source).toContain("pendingStoryPlotId: string | null");
    expect(source).toContain("actionMenuId: string | null");
    expect(source).toContain("readOnly: boolean");
    expect(source).toContain("locked?: boolean");
    expect(source).toContain("'is-active': plot.id === activeStoryPlotId");
    expect(source).toContain("'is-loading': pendingStoryPlotId === plot.id");
    expect(source).toContain(':disabled="locked"');
  });

  it("preserves accessible list and menu semantics", () => {
    expect(source).toContain('aria-label="故事情节列表"');
    expect(source).toContain('role="list"');
    expect(source).toContain('role="listitem"');
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('role="menu"');
    expect(source.match(/role="menuitem"/gu)).toHaveLength(3);
    expect(source).toContain("@keydown.esc.stop=\"emit('closeActionMenu')\"");
  });

  it("owns the shared entry-list visual primitives during staged extraction", () => {
    expect(source).toContain(".long-story-plot-pane {");
    expect(source).toContain(".long-story-plot-card {");
    expect(source).toContain(".long-story-plot-action-menu {");
    expect(source).toContain(".long-story-plot-pane-empty {");
    expect(parentSource).not.toContain(".long-story-plot-card {");
  });
});
