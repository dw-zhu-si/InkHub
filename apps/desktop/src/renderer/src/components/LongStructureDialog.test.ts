import { describe, expect, it } from "vitest";
import dialog from "./LongStructureDialog.vue?raw";
import completeness from "../utils/longOutlineCompleteness.ts?raw";

describe("LongStructureDialog outline completeness summary", () => {
  it("shows volume/arc/beat/chapter coverage and explicit human-review limits", () => {
    expect(dialog).toContain("大纲完整性");
    expect(dialog).toContain("outlineReport.completeVolumes");
    expect(dialog).toContain("outlineReport.totalStoryBeats");
    expect(dialog).toContain("作者人工确认读者承诺、因果、节奏与人物动机");
    expect(completeness).toContain("cannot judge");
    expect(completeness).toContain("readerPromiseNeedsReview: true");
  });
});
