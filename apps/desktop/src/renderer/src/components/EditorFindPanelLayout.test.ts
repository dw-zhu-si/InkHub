import { describe, expect, it } from "vitest";
import longWorkspaceEditorSource from "./LongWorkspaceEditor.vue?raw";

describe("editor find panel layout", () => {
  it("loads the extracted stylesheet that defines find-panel anchoring", () => {
    expect(longWorkspaceEditorSource).toContain(
      '<style scoped src="./LongWorkspaceEditor.css"></style>'
    );
  });
});
