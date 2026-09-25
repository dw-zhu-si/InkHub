import { describe, expect, it } from "vitest";
import source from "./CreateLongPlotPointDialog.vue?raw";

describe("CreateLongPlotPointDialog", () => {
  it("opens a focused plot-point form in a themed overlay", () => {
    expect(source).toContain("新建剧情点");
    expect(source).toContain("剧情点名称");
    expect(source).toContain("概要");
    expect(source).not.toContain(">故事情节<");
    expect(source).toContain(
      'uiMessage.warning("请输入剧情点名称。")'
    );
    expect(source).toContain("<Teleport to=\"body\">");
    expect(source).not.toContain("LongStructureManager");
  });

  it("submits title and summary; story plots are created in the editor", () => {
    expect(source).toContain(
      "submit: [input: { title: string; summary: string }]"
    );
    expect(source).toContain("title: normalizedTitle");
    expect(source).toContain("summary: summary.value");
    expect(source).not.toContain("outline: outline.value");
  });
});
