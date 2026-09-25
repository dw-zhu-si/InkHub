import { describe, expect, it } from "vitest";
import source from "./CreateExpertSectionDialog.vue?raw";

describe("CreateExpertSectionDialog", () => {
  it("asks for a section name before creating an expert draft section", () => {
    expect(source).toContain("新建{{ unitLabel }}");
    expect(source).toContain("{{ unitLabel }}名称");
    expect(source).toContain("title.value = suggestedTitle");
    expect(source).toContain("titleInput.value?.select()");
    expect(source).toContain("DraftSectionTitleSchema.safeParse(title.value)");
    expect(source).toContain('uiMessage.warning(`请输入${unitLabel.value}名称。`)');
    expect(source).toContain("emit(\"submit\", parsed.data)");
    expect(source).toContain("确认新建");
    expect(source).not.toContain("is-danger");
    expect(source).not.toContain("<select");
  });

  it("uses non-layout feedback, themed surfaces, and a neutral primary action", () => {
    expect(source).toContain("<Teleport to=\"body\">");
    expect(source).toContain('class="dialog-backdrop create-expert-section-overlay"');
    expect(source).not.toContain("backdrop-filter:");
    expect(source).toContain("var(--surface-raised)");
    expect(source).toContain("var(--theme-line)");
    expect(source).toContain("var(--text-primary)");
    expect(source).toContain("var(--neutral-solid)");
  });
});
