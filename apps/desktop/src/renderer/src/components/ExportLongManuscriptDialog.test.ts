import { describe, expect, it } from "vitest";
import source from "./ExportLongManuscriptDialog.vue?raw";

describe("ExportLongManuscriptDialog", () => {
  it("offers all four selectable long-form export sections", () => {
    expect(source).toContain('id: "worldbuilding"');
    expect(source).toContain('id: "characters"');
    expect(source).toContain('id: "plot"');
    expect(source).toContain('id: "manuscript"');
    expect(source).toContain("不使用内部 ID");
  });
});
