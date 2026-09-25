import { describe, expect, it } from "vitest";
import mainSource from "./index.ts?raw";
import { INKHUB_ACCEPTANCE_SKILL_DEFINITIONS } from "./inkhub-agent-skill-registry";

describe("InkHub acceptance isolation", () => {
  it("uses three fixture Skills and a fixture home instead of the user's real local sources", () => {
    expect(mainSource).toContain('const acceptanceSkillDefinitions = process.env.INKHUB_ACCEPTANCE === "1"');
    expect(mainSource).toContain("? INKHUB_ACCEPTANCE_SKILL_DEFINITIONS");
    expect(mainSource).toContain('resolve(acceptanceNovelRoot, "..", "..")');
    expect(mainSource).toContain("acceptanceSkillDefinitions,\n      acceptanceNovelRoot");
    expect(INKHUB_ACCEPTANCE_SKILL_DEFINITIONS.map((skill) => skill.id)).toEqual([
      "novel-chapter-generate",
      "chapter-hook-generate",
      "plot-pleasure-rhythm"
    ]);
    expect(INKHUB_ACCEPTANCE_SKILL_DEFINITIONS.every((skill) => skill.path.startsWith(".inkhub-acceptance/"))).toBe(true);
  });
});
