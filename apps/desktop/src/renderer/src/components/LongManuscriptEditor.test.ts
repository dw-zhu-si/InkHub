import { describe, expect, it } from "vitest";
import source from "./LongManuscriptEditor.vue?raw";
import editorSource from "./LongWorkspaceEditor.vue?raw";

describe("LongManuscriptEditor", () => {
  it("owns the chapter body writing and preview surface", () => {
    expect(source).toContain('aria-label="章节正文编辑区"');
    expect(source).toContain('class="long-document-title-input"');
    expect(source).toContain('class="long-document-editor"');
    expect(source).toContain('class="long-document-preview"');
    expect(source).toContain("<MarkdownContent");
    expect(source).toContain("暂无正文");
  });

  it("accepts a narrow manuscript projection and emits user intent", () => {
    expect(source).toContain('viewMode: "edit" | "preview"');
    expect(source).toContain('"update:titleDraft": [value: string]');
    expect(source).toContain("titleChange: [event: Event]");
    expect(source).toContain("beforeinput: [event: InputEvent]");
    expect(source).toContain(
      "editorElementChange: [element: HTMLTextAreaElement | null]"
    );
    expect(source).not.toContain("LongWorkspaceSelection");
    expect(source).not.toContain("LongWorkspaceIndexSnapshot");
    expect(source).not.toContain("resolveLongWorkspaceApi");
    expect(source).not.toContain("writeDocument");
  });

  it("is wired only for draft selections while the parent retains persistence", () => {
    expect(editorSource).toContain(
      'import LongManuscriptEditor from "./LongManuscriptEditor.vue"'
    );
    expect(editorSource).toContain("<LongManuscriptEditor");
    expect(editorSource).toContain("selection.root === 'draft'");
    expect(editorSource).toContain('@title-change="saveStructureTitle"');
    expect(editorSource).toContain('@input="handleEditorInput"');
    expect(editorSource).toContain(
      '@editor-element-change="setEditorInputElement"'
    );
    expect(editorSource).toContain("async function loadWorkspaceDocument(");
    expect(editorSource).toContain("async function saveCurrentDocument(");
    expect(editorSource).toContain("baseRevision: state.file.revision");
    expect(editorSource).toContain(
      "baseWorkspaceRevision: state.workspaceRevision"
    );
    expect(editorSource).toContain(
      "baseProjectRevision: state.projectRevision"
    );
  });
});
