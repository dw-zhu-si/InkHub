import { describe, expect, it } from "vitest";
import { InkHubCoverStyleSchema } from "@deepwrite/contracts";
import {
  INKHUB_COVER_METHOD_REF,
  INKHUB_COVER_SKILL_CONTENT,
  INKHUB_COVER_STYLES,
  compileInkHubCoverBackgroundPrompt,
  coverOverlayByStyleId,
  publicCoverStyle
} from "./inkhub-cover-skill";

describe("InkHub cover art direction skill", () => {
  it("ships twenty-four unique, clean-room cover styles with fixed provenance", () => {
    expect(INKHUB_COVER_STYLES).toHaveLength(24);
    expect(new Set(INKHUB_COVER_STYLES.map((style) => style.id)).size).toBe(24);
    for (const style of INKHUB_COVER_STYLES) {
      expect(InkHubCoverStyleSchema.parse(publicCoverStyle(style))).toMatchObject({
        adaptation: "clean-room",
        sourceRef: expect.stringContaining(INKHUB_COVER_METHOD_REF)
      });
      expect(style.direction.length).toBeGreaterThan(20);
      expect(style.avoid.length).toBeGreaterThan(8);
      expect(coverOverlayByStyleId(style.id)).toMatchObject({
        titleColor: expect.stringMatching(/^#/u),
        placement: expect.stringMatching(/^(top|center|bottom)$/u)
      });
    }
  });

  it("compiles one chosen style into a no-text ModelHub background prompt", () => {
    const prompt = compileInkHubCoverBackgroundPrompt({
      title: "灯下山河",
      author: "墨客",
      visualDirection: "孤城风雪中的一盏灯",
      styleId: "ink-gold-fantasy"
    });
    expect(prompt).toContain("水墨鎏金玄幻");
    expect(prompt).toContain("孤城风雪中的一盏灯");
    expect(prompt).toContain("本地叠加");
    expect(prompt).toContain("不要生成任何文字");
  });

  it("bundles only the project-owned instruction skill and forbids external execution", () => {
    expect(INKHUB_COVER_SKILL_CONTENT).toContain("upstream-content-copied:false");
    expect(INKHUB_COVER_SKILL_CONTENT).toContain("external-execution:false");
    expect(INKHUB_COVER_SKILL_CONTENT).not.toMatch(/\b(?:curl|wget|npx|npm install|pnpm add)\b/u);
  });
});
