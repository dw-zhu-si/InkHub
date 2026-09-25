import {
  parseSkillMarkdown,
  type SkillMarkdownErrorCode,
  type SkillMarkdownParseResult
} from "@deepwrite/contracts";

export type SkillFrontmatterErrorCode = SkillMarkdownErrorCode;
export type SkillFrontmatterParseResult = SkillMarkdownParseResult;

export const parseSkillFrontmatter = parseSkillMarkdown;
