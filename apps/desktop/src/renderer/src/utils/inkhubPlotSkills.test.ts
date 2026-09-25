import { describe, expect, it } from "vitest";
import { INKHUB_PLOT_SKILLS, renderInkHubPlotSkill } from "./inkhubPlotSkills";

describe("墨枢剧情设计 Skills", () => {
  it("提供八项可追溯、指令型且不直接执行第三方代码的剧情能力", () => {
    expect(INKHUB_PLOT_SKILLS).toHaveLength(8);
    expect(new Set(INKHUB_PLOT_SKILLS.map((skill) => skill.id)).size).toBe(8);
    for (const skill of INKHUB_PLOT_SKILLS) {
      const body = renderInkHubPlotSkill(skill);
      expect(skill.sourceUrl).toMatch(/^https:\/\/github\.com\//u);
      expect(skill.sourceRef).toMatch(/^[a-f0-9]{40}$/u);
      expect(["MIT", "Apache-2.0"]).toContain(skill.license);
      expect(body).toContain("adaptation:clean-room");
      expect(body).toContain("不自动写入或覆盖小说源文件");
      expect(body).not.toMatch(/curl\s|wget\s|npm\s+install|pip\s+install|\.\/scripts\//iu);
    }
  });
});
