import { describe, expect, it } from "vitest";
import longEditorSource from "./LongWorkspaceEditor.vue?raw";
import rightEditorSource from "./RightEditorPane.vue?raw";

describe("editor text hot paths", () => {
  it("routes textarea edits through bounded incremental history", () => {
    for (const source of [rightEditorSource, longEditorSource]) {
      expect(source).toContain("createBoundedTextHistory()");
      expect(source).toContain("textHistory.recordInput({");
      expect(source).toContain('@beforeinput="handleEditorBeforeInput"');
      expect(source).toContain('@input="handleEditorInput"');
      expect(source).not.toContain("recordUndoSnapshot");
      expect(source).not.toContain("HISTORY_LIMIT");
    }
  });

  it("updates the character count from edit deltas instead of filtering the full text", () => {
    expect(rightEditorSource).toContain(
      "historyResult?.nonWhitespaceDelta"
    );
    expect(longEditorSource).toContain(
      "updateVisibleCharacterCount("
    );
    expect(rightEditorSource).not.toContain(
      'content.value.replace(/\\s/g, "").length'
    );
    expect(longEditorSource).not.toContain(
      'currentVisibleContent.value.replace(/\\s/gu, "").length'
    );
  });

  it("mutates only the active long-document text field while typing", () => {
    expect(longEditorSource).toContain("state.content = content;");
    expect(longEditorSource).not.toMatch(
      /replaceDocumentState\(key, \{\s*\.\.\.state,\s*content\s*\}\)/u
    );
    expect(longEditorSource).toContain(
      "plotPointSummaryDrafts.value[plotPoint.id] = current;"
    );
    expect(longEditorSource).toContain(
      "volumeOutlineDrafts.value[volume.id] = current;"
    );
  });
});
