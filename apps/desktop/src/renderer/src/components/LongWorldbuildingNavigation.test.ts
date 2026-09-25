import { describe, expect, it } from "vitest";
import editorSource from "./LongWorkspaceEditor.vue?raw";
import source from "./LongWorldbuildingNavigation.vue?raw";

describe("LongWorldbuildingNavigation", () => {
  it("owns both configured worldbuilding navigation layouts", () => {
    expect(source).toContain('mode: "top-tabs" | "right-list"');
    expect(source).toContain(`v-if="mode === 'top-tabs'"`);
    expect(source).toContain(
      'class="section-tabs-bar long-worldbuilding-tabs"'
    );
    expect(source).toContain(
      'class="long-story-plot-pane long-entry-list-pane"'
    );
    expect(source).toContain('aria-label="世界观条目"');
    expect(source).toContain('aria-label="世界观条目列表"');
  });

  it("exposes navigation and mutation intent without owning persistence", () => {
    expect(source).toContain("selectOverview: []");
    expect(source).toContain("selectItem: [itemId: string]");
    expect(source).toContain("addItem: []");
    expect(source).toContain("deleteItem: [itemId: string]");
    expect(source).not.toContain("resolveLongWorkspaceApi");
    expect(source).not.toContain("LongWorkspaceOperationBatch");
    expect(source).not.toContain("writeDocument");
  });

  it("keeps selection, pending and read-only behavior explicit", () => {
    expect(source).toContain("'is-active': activeItemId === null");
    expect(source).toContain("'is-loading': pendingOverview");
    expect(source).toContain("'is-loading': pendingItemId === item.id");
    expect(source).toContain('v-if="!readOnly"');
    expect(source).toContain(':disabled="locked || !activeItem"');
    expect(source).toContain("emit('deleteItem', activeItem.id)");
  });

  it("is wired twice while the parent retains document orchestration", () => {
    expect(editorSource).toContain(
      'import LongWorldbuildingNavigation from "./LongWorldbuildingNavigation.vue"'
    );
    expect(editorSource.match(/<LongWorldbuildingNavigation/gu)).toHaveLength(2);
    expect(editorSource).toContain(
      '@select-overview="selectWorldbuildingOverview"'
    );
    expect(editorSource).toContain('@select-item="selectWorldbuildingItem"');
    expect(editorSource).toContain('@add-item="addWorldbuildingItem"');
    expect(editorSource).toContain(
      '@delete-item="openWorldbuildingItemDelete"'
    );
    expect(editorSource).toContain("async function loadWorkspaceDocument(");
  });

  it("projects navigation metadata without subscribing to every item body", () => {
    const projectionStart = editorSource.indexOf(
      "const currentWorldbuildingListState = computed"
    );
    const projectionEnd = editorSource.indexOf(
      "const currentWorldbuildingItems = computed",
      projectionStart
    );
    const projection = editorSource.slice(projectionStart, projectionEnd);

    expect(projection).toContain(
      "items: props.selection?.worldbuildingItems ?? []"
    );
    expect(projection).not.toContain("documentStates");
    expect(projection).not.toContain("item.file.id");
  });
});
