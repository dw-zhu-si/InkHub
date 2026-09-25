import { describe, expect, it } from "vitest";
import source from "./CreateLongVolumeDialog.vue?raw";

describe("CreateLongVolumeDialog", () => {
  it("uses a focused create form instead of the full structure manager", () => {
    expect(source).toContain("新建分卷");
    expect(source).toContain("分卷名称");
    expect(source).toContain("卷纲");
    expect(source).toContain('uiMessage.warning("请输入分卷名称。")');
    expect(source).toContain("<Teleport to=\"body\">");
    expect(source).not.toContain("LongStructureManager");
  });

  it("submits the title and initial outline", () => {
    expect(source).toContain('submit: [input: { title: string; summary: string }]');
    expect(source).toContain("title: normalizedTitle");
    expect(source).toContain("summary: summary.value");
  });
});
