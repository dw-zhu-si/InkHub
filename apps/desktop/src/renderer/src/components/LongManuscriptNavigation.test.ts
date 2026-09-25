import { describe, expect, it } from "vitest";
import source from "./LongManuscriptNavigation.vue?raw";
import editorSource from "./LongWorkspaceEditor.vue?raw";

describe("LongManuscriptNavigation", () => {
  it("owns chapter navigation for top tabs and the right list", () => {
    expect(source).toContain('mode: "top-tabs" | "right-list"');
    expect(source).toContain(`v-if="mode === 'top-tabs'"`);
    expect(source).toContain(
      'class="section-tabs-bar long-worldbuilding-tabs long-chapter-card-tabs"'
    );
    expect(source).toContain('aria-label="章卡列表"');
    expect(source).toContain("actionMenuId");
    expect(source).toContain("runMenuAction");
  });

  it("emits structure intent without applying mutations itself", () => {
    expect(source).toContain(
      "selectChapter: [chapterCardId: LongChapterCardId]"
    );
    expect(source).toContain("createChapter: []");
    expect(source).toContain(
      "deleteChapter: [chapterCardId: LongChapterCardId]"
    );
    expect(source).toContain("reorderChapter:");
    expect(source).not.toContain("LongWorkspaceOperationBatch");
    expect(source).not.toContain("resolveLongWorkspaceApi");
    expect(source).not.toContain("writeDocument");
    expect(source).not.toContain('type: "chapter.reorder"');
  });

  it("keeps reordering and deletion orchestration in the parent", () => {
    expect(editorSource.match(/<LongManuscriptNavigation/gu)).toHaveLength(2);
    expect(editorSource).toContain('@delete-chapter="openChapterCardDelete"');
    expect(editorSource).toContain('@reorder-chapter="reorderChapterCard"');
    expect(editorSource).toContain('type: "chapter.reorder"');
    expect(editorSource).toContain('emit(\n    "deleteStructure"');
    expect(editorSource).toContain("async function saveCurrentDocument(");
  });

  it("closes its own action menu without leaking menu state to the editor", () => {
    expect(source).toContain(
      'window.addEventListener("pointerdown", handleWindowPointerDown, true)'
    );
    expect(source).toContain(
      'window.removeEventListener("pointerdown", handleWindowPointerDown, true)'
    );
    expect(editorSource).not.toContain("chapterCardActionMenuId");
    expect(editorSource).not.toContain("toggleChapterCardActionMenu");
    expect(editorSource).not.toContain("runChapterCardMenuAction");
  });
});
