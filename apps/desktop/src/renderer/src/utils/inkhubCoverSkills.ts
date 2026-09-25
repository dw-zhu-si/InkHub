import skillContent from "../skills/media/inkhub-cover-art-direction/SKILL.md?raw";

export interface InkHubCoverSkill {
  id: string;
  title: string;
  description: string;
  sourceLabel: string;
  sourceRef: string;
  content: string;
}

export const INKHUB_COVER_SKILLS: readonly InkHubCoverSkill[] = [{
  id: "inkhub-cover-art-direction",
  title: "小说封面艺术指导",
  description: "把小说内容、平台规格和单一视觉风格编译为无文字封面底图提示，再由墨枢本地排版书名与作者名。",
  sourceLabel: "墨枢净室适配 · Punk-Skill 方法参考",
  sourceRef: "https://github.com/adrianpunk/Punk-Skill@50ea29b65b98788f9ed1df62818dbe530855bfb3",
  content: `${skillContent.trimEnd()}\n`
}] as const;

export function coverSkillTitle(skill: InkHubCoverSkill): string {
  return `[视觉封面] ${skill.title}`;
}

export function coverSkillProvenance(skill: InkHubCoverSkill): string {
  return `<!-- inkhub-cover-skill:${skill.id}; owner:inkhub; upstream-content-copied:false; external-execution:false -->`;
}

export function renderInkHubCoverSkill(skill: InkHubCoverSkill): string {
  const content = skill.content.trimEnd();
  return content.includes(coverSkillProvenance(skill))
    ? `${content}\n`
    : `${content}\n\n${coverSkillProvenance(skill)}\n`;
}
