import { describe, expect, it } from "vitest";
import learningImitationSource from "./LearningImitationDialog.vue?raw";
import longProposalSource from "./LongProposalReview.vue?raw";
import longWorkspaceEditorSource from "./LongWorkspaceEditor.vue?raw";

describe("scoped global style selectors", () => {
  it("keeps the complete descendant selector inside :global()", () => {
    for (const source of [
      learningImitationSource,
      longProposalSource,
      longWorkspaceEditorSource
    ]) {
      expect(source).not.toMatch(
        /:global\(html\[data-(?:platform|theme)="[^"]+"\]\)\s+\./
      );
    }
  });

  it("does not leak macOS editor sizing onto the html root", () => {
    expect(longWorkspaceEditorSource).toContain(
      '<style scoped src="./LongWorkspaceEditor.css"></style>'
    );
  });
});
