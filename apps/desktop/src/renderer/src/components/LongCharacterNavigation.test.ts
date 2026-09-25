import { describe, expect, it } from "vitest";
import source from "./LongCharacterNavigation.vue?raw";
import editorSource from "./LongWorkspaceEditor.vue?raw";

describe("LongCharacterNavigation", () => {
  it("owns both configured character navigation layouts", () => {
    expect(source).toContain('mode: "top-tabs" | "right-list"');
    expect(source).toContain(`v-if="mode === 'top-tabs'"`);
    expect(source).toContain(
      'class="section-tabs-bar long-worldbuilding-tabs long-character-tabs"'
    );
    expect(source).toContain(
      'class="long-story-plot-pane long-entry-list-pane"'
    );
    expect(source).toContain(':aria-label="`${label}列表`"');
  });

  it("emits navigation and mutation intent without owning persistence", () => {
    expect(source).toContain(
      "selectCharacter: [characterId: LongCharacterId]"
    );
    expect(source).toContain("createCharacter: []");
    expect(source).toContain("deleteCharacter: []");
    expect(source).toContain("emit('selectCharacter', character.id)");
    expect(source).toContain("emit('createCharacter')");
    expect(source).toContain("emit('deleteCharacter')");
    expect(source).not.toContain("resolveLongWorkspaceApi");
    expect(source).not.toContain("LongWorkspaceOperationBatch");
    expect(source).not.toContain("writeDocument");
  });

  it("keeps selection, pending and operation availability explicit", () => {
    expect(source).toContain("'is-active': activeCharacterId === character.id");
    expect(source).toContain(
      "'is-loading': pendingCharacterId === character.id"
    );
    expect(source).toContain(':disabled="locked || !canDelete"');
    expect(source).toContain(':aria-busy="pendingCharacterId === character.id"');
  });

  it("is wired for both layouts while the parent retains orchestration", () => {
    expect(editorSource).toContain(
      'import LongCharacterNavigation from "./LongCharacterNavigation.vue"'
    );
    expect(editorSource.match(/<LongCharacterNavigation/gu)).toHaveLength(2);
    expect(editorSource).toContain('@select-character="requestSelectCharacter"');
    expect(editorSource).toContain('@create-character="emit(\'createCharacter\')"');
    expect(editorSource).toContain('@delete-character="openNavigationDelete"');
    expect(editorSource).toContain("async function loadWorkspaceDocument(");
    expect(editorSource).toContain('emit(\n    "deleteStructure"');
  });

  it("projects only navigation metadata instead of sibling body state", () => {
    const projectionStart = editorSource.indexOf(
      "const currentCharacterNavigationItems = computed"
    );
    const projectionEnd = editorSource.indexOf(
      "const currentUsesTopPlotTabs = computed",
      projectionStart
    );
    const projection = editorSource.slice(projectionStart, projectionEnd);

    expect(projection).toContain(
      "() => props.selection?.characterTabs ?? []"
    );
    expect(projection).not.toContain("documentStates");
    expect(projection).not.toContain("content");
    expect(projection).not.toContain("file.id");
    expect(source).not.toContain("LongWorkspaceSelection");
  });
});
