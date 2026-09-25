import { describe, expect, it } from "vitest";
import source from "./CreateLongWorldbuildingItemDialog.vue?raw";

describe("CreateLongWorldbuildingItemDialog", () => {
  it("opens a focused worldbuilding item form in a themed overlay", () => {
    expect(source).toContain("新建世界观条目");
    expect(source).toContain("世界观 · {{ categoryTitle }}");
    expect(source).toContain("条目名称");
    expect(source).toContain("确认新建");
    expect(source).toContain(
      'uiMessage.warning("请输入世界观条目名称。")'
    );
    expect(source).toContain("<Teleport to=\"body\">");
    expect(source).not.toContain("LongStructureManager");
  });

  it("submits a title and uses a neutral primary action", () => {
    expect(source).toContain("submit: [input: { title: string }]");
    expect(source).toContain("title: normalizedTitle");
    expect(source).not.toContain("<select");
    expect(source).not.toContain("<PopupSelect");
    expect(source).toContain("var(--surface-raised)");
    expect(source).toContain("var(--theme-line)");
    expect(source).toContain("var(--text-primary)");
    expect(source).toContain("var(--neutral-solid)");
  });
});
