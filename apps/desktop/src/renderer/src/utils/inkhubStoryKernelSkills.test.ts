import { describe, expect, it } from "vitest";
import {
  INKHUB_STORY_KERNEL_SKILLS,
  renderInkHubStoryKernelSkill
} from "./inkhubStoryKernelSkills";

describe("墨枢全书创作内核 Skills", () => {
  it("提供十项项目自有、标准 SKILL.md 且可安全装配的能力", () => {
    expect(INKHUB_STORY_KERNEL_SKILLS).toHaveLength(10);
    expect(new Set(INKHUB_STORY_KERNEL_SKILLS.map((skill) => skill.id)).size).toBe(10);

    for (const skill of INKHUB_STORY_KERNEL_SKILLS) {
      const body = renderInkHubStoryKernelSkill(skill);
      expect(skill.id).toMatch(/^[a-z0-9-]+$/u);
      expect(body).toMatch(/^---\nname: [a-z0-9-]+\ndescription: .+\n---\n/u);
      expect(body).toContain(`name: ${skill.id}`);
      expect(body).toContain("## 输出合同");
      expect(body).toContain("## 安全边界");
      expect(body).toContain("原稿仍是权威来源");
      expect(body).toContain(`inkhub-story-kernel-skill:${skill.id}`);
      expect(body).not.toMatch(/curl\s|wget\s|npm\s+install|pip\s+install|\.\/scripts\//iu);
    }
  });

  it("覆盖导入、分析、连续性、复审、风格、参考、推演、伏笔与知识边界", () => {
    expect(INKHUB_STORY_KERNEL_SKILLS.map((skill) => skill.id)).toEqual([
      "inkhub-story-import-reconstruction",
      "inkhub-longform-structure-analysis",
      "inkhub-volume-chapter-continuity",
      "inkhub-review-revise-reaudit",
      "inkhub-author-style-fingerprint",
      "inkhub-semantic-deslop",
      "inkhub-book-reference-binding",
      "inkhub-noncanonical-forecast",
      "inkhub-foreshadowing-lifecycle",
      "inkhub-character-knowledge-boundary"
    ]);
  });
});
