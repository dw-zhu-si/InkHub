import { describe, expect, it } from "vitest";
import source from "./CreateLongCharacterDialog.vue?raw";

describe("CreateLongCharacterDialog", () => {
  it("creates a named character in the selected fixed group", () => {
    expect(source).toContain("人物设计 · {{ groupLabel }}");
    expect(source).toContain("人物姓名");
    expect(source).toContain("别名");
    expect(source).toContain('emit("submit", {');
    expect(source).toContain("name: normalizedName");
    expect(source).toContain("aliases: aliasesFromDraft()");
    expect(source).not.toContain("<select");
    expect(source).not.toContain("<PopupSelect");
  });

  it("uses non-layout feedback, themed surfaces, and a neutral primary action", () => {
    expect(source).toContain('uiMessage.warning("请输入人物姓名。")');
    expect(source).not.toContain("form-error");
    expect(source).toContain("<Teleport to=\"body\">");
    expect(source).toContain("var(--surface-raised)");
    expect(source).toContain("var(--theme-line)");
    expect(source).toContain("var(--text-primary)");
    expect(source).toContain("var(--neutral-solid)");
  });
});
