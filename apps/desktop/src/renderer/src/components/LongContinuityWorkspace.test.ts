import { describe, expect, it } from "vitest";
import source from "./LongContinuityWorkspace.vue?raw";

describe("LongContinuityWorkspace", () => {
  it("is only a text-preview compatibility shell", () => {
    expect(source).toContain("Compatibility-only shell");
    expect(source).toContain("<MarkdownContent");
    expect(source).toContain("连续性章节文本预览");
    expect(source).not.toContain("continuity-view-tabs");
    expect(source).not.toContain("LongContinuityProjectionPanel");
    expect(source).not.toContain("JSON.parse");
  });

  it("uses the shared surface and text tokens", () => {
    expect(source).toContain("var(--surface-main)");
    expect(source).toContain("var(--text-primary)");
    expect(source).toContain("var(--text-tertiary)");
  });
});
