import { describe, expect, it } from "vitest";
import { INKHUB_STYLE_PRESETS, renderInkHubStylePresetSkill } from "./inkhubStylePresets";

describe("墨枢通用文风预设", () => {
  it("提供 20 个去作品化、唯一路由的十维文风预设", () => {
    expect(INKHUB_STYLE_PRESETS).toHaveLength(20);
    expect(new Set(INKHUB_STYLE_PRESETS.map((preset) => preset.id)).size).toBe(20);
    for (const preset of INKHUB_STYLE_PRESETS) {
      const skill = renderInkHubStylePresetSkill(preset);
      expect(skill).toContain("十维文风指纹");
      expect(skill).toContain("不得复现参考文本中的连续表达");
      expect(skill).toContain("upstream-content-copied:false");
      expect(skill).not.toMatch(/(?:古龙|十日终焉|楚留香|李寻欢|我在精神病院学斩神)/u);
    }
  });
});
