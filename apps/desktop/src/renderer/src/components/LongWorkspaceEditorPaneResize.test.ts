import { describe, expect, it } from "vitest";
import source from "./LongWorkspaceEditor.vue?raw";

describe("LongWorkspaceEditor internal pane resizing", () => {
  it("renders independent accessible separators for both nested lists", () => {
    expect(source).toContain('class="long-editor-internal-resizer long-entry-list-resizer"');
    expect(source).toContain('class="long-editor-internal-resizer long-story-plot-resizer"');
    expect(source).toContain('aria-label="调整右侧条目列表宽度"');
    expect(source).toContain('aria-label="调整当前剧情点涉及列表宽度"');
    expect(source.match(/role="separator"/g)).toHaveLength(2);
    expect(source).toContain("handleLongEditorPaneResizeKeydown");
  });

  it("shares the outer resize behavior across every right-list layout", () => {
    expect(source).toContain("const currentUsesAnyRightEntryList = computed");
    expect(source).toContain("currentUsesRightWorldbuildingList.value");
    expect(source).toContain("currentUsesRightCharacterList.value");
    expect(source).toContain("currentUsesRightBookLineList.value");
    expect(source).toContain("currentUsesRightPlotPointList.value");
    expect(source).toContain("currentUsesRightChapterCardList.value");
    expect(source).toContain("currentUsesRightContinuityList.value");
    expect(source).toContain('v-if="currentUsesAnyRightEntryList"');
  });

  it("clamps, persists, reconciles, and cleans up resize state", () => {
    expect(source).toContain("LONG_EDITOR_LIST_MIN_WIDTH");
    expect(source).toContain("LONG_EDITOR_LIST_MAX_WIDTH");
    expect(source).toContain("containerWidth * LONG_EDITOR_DEFAULT_LIST_RATIO");
    expect(source).toContain("saveLongEditorPanePreferences(window.localStorage");
    expect(source).toContain("new ResizeObserver");
    expect(source).toContain('window.addEventListener("resize", reconcileLongEditorPaneWidths)');
    expect(source).toContain('window.removeEventListener("pointermove", handleLongEditorPaneResizeMove)');
    expect(source).toContain("entryListResizeObserver?.disconnect()");
    expect(source).toContain("storyPlotListResizeObserver?.disconnect()");
  });

  it("uses pixel grid variables and hides vertical handles in stacked layouts", () => {
    expect(source).toContain("--long-entry-list-width");
    expect(source).toContain("--long-story-plot-list-width");
    expect(source).toContain('<style scoped src="./LongWorkspaceEditor.css"></style>');
  });
});
