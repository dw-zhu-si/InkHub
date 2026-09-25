import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter } from "./skillFrontmatter";

describe("parseSkillFrontmatter", () => {
  it("accepts the required fields in either order and allows extra fields", () => {
    expect(
      parseSkillFrontmatter(`---
description: 当用户进行人物设计时，使用当前技能。
category: character
name: 人设卡建设
---

技能正文`)
    ).toEqual({
      valid: true,
      name: "人设卡建设",
      description: "当用户进行人物设计时，使用当前技能。",
      body: "技能正文"
    });
  });

  it.each([
    {
      label: "the opening delimiter is missing",
      content: "name: 人设卡建设\ndescription: 人物设计\n---",
      code: "missing-opening-delimiter",
      message: "技能格式错误 · 首行缺少 ---"
    },
    {
      label: "a blank line precedes the opening delimiter",
      content: "\n---\nname: 人设卡建设\ndescription: 人物设计\n---",
      code: "missing-opening-delimiter",
      message: "技能格式错误 · 首行缺少 ---"
    },
    {
      label: "body text precedes the opening delimiter",
      content: "正文\n---\nname: 人设卡建设\ndescription: 人物设计\n---",
      code: "missing-opening-delimiter",
      message: "技能格式错误 · 首行缺少 ---"
    },
    {
      label: "the closing delimiter is missing",
      content: "---\nname: 人设卡建设\ndescription: 人物设计",
      code: "missing-closing-delimiter",
      message: "技能格式错误 · 缺少结束分隔符 ---"
    },
    {
      label: "name is missing",
      content: "---\ndescription: 人物设计\n---",
      code: "missing-name",
      message: "技能格式错误 · 缺少 name 字段"
    },
    {
      label: "name is empty",
      content: "---\nname:   \ndescription: 人物设计\n---",
      code: "empty-name",
      message: "技能格式错误 · name 不能为空"
    },
    {
      label: "description is missing",
      content: "---\nname: 人设卡建设\n---",
      code: "missing-description",
      message: "技能格式错误 · 缺少 description 字段"
    },
    {
      label: "description is empty",
      content: "---\nname: 人设卡建设\ndescription:\n---",
      code: "empty-description",
      message: "技能格式错误 · description 不能为空"
    },
    {
      label: "the body is empty",
      content: "---\nname: 人设卡建设\ndescription: 人物设计\n---\n   ",
      code: "empty-body",
      message: "技能格式错误 · 技能正文不能为空"
    }
  ])("returns a specific reason when $label", ({ content, code, message }) => {
    expect(parseSkillFrontmatter(content)).toEqual({ valid: false, code, message });
  });
});
