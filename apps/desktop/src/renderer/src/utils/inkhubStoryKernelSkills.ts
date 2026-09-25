import authorStyleFingerprint from "../skills/story-kernel/inkhub-author-style-fingerprint/SKILL.md?raw";
import bookReferenceBinding from "../skills/story-kernel/inkhub-book-reference-binding/SKILL.md?raw";
import characterKnowledgeBoundary from "../skills/story-kernel/inkhub-character-knowledge-boundary/SKILL.md?raw";
import foreshadowingLifecycle from "../skills/story-kernel/inkhub-foreshadowing-lifecycle/SKILL.md?raw";
import longformStructureAnalysis from "../skills/story-kernel/inkhub-longform-structure-analysis/SKILL.md?raw";
import noncanonicalForecast from "../skills/story-kernel/inkhub-noncanonical-forecast/SKILL.md?raw";
import reviewReviseReaudit from "../skills/story-kernel/inkhub-review-revise-reaudit/SKILL.md?raw";
import semanticDeslop from "../skills/story-kernel/inkhub-semantic-deslop/SKILL.md?raw";
import storyImportReconstruction from "../skills/story-kernel/inkhub-story-import-reconstruction/SKILL.md?raw";
import volumeChapterContinuity from "../skills/story-kernel/inkhub-volume-chapter-continuity/SKILL.md?raw";

export interface InkHubStoryKernelSkill {
  id: string;
  title: string;
  description: string;
  focus: string;
  content: string;
}

export const INKHUB_STORY_KERNEL_SKILLS: readonly InkHubStoryKernelSkill[] = [
  {
    id: "inkhub-story-import-reconstruction",
    title: "全书导入与状态重建",
    description: "按卷章导入完整小说，重建带证据且可增量恢复的故事状态。",
    focus: "导入 · 分卷 · 状态重建",
    content: storyImportReconstruction
  },
  {
    id: "inkhub-longform-structure-analysis",
    title: "长篇拆解与结构分析",
    description: "分析长篇的卷弧、因果链、人物弧、节奏和读者承诺。",
    focus: "结构 · 因果 · 节奏",
    content: longformStructureAnalysis
  },
  {
    id: "inkhub-volume-chapter-continuity",
    title: "卷章连续性审计",
    description: "按卷核对章序、事实状态、时间地点和跨卷因果桥。",
    focus: "分卷 · 连续性 · 证据",
    content: volumeChapterContinuity
  },
  {
    id: "inkhub-review-revise-reaudit",
    title: "审稿—修订—复审闭环",
    description: "把质检、AI 修复、人工审阅和修后复检连接为可恢复闭环。",
    focus: "质检 · 修订 · 复审",
    content: reviewReviseReaudit
  },
  {
    id: "inkhub-author-style-fingerprint",
    title: "作者风格指纹",
    description: "从作者自有语料建立可解释的风格基线并检测偏移。",
    focus: "自有语料 · 风格 · 偏移",
    content: authorStyleFingerprint
  },
  {
    id: "inkhub-semantic-deslop",
    title: "语义去 AI 味",
    description: "在保持事实与作者风格的前提下修复模板化和空泛表达。",
    focus: "语义 · 具体化 · 风格保持",
    content: semanticDeslop
  },
  {
    id: "inkhub-book-reference-binding",
    title: "本书参考资料绑定",
    description: "将资料按书籍、范围与用途绑定，并返回可追溯检索证据。",
    focus: "资料 · 绑定 · 检索",
    content: bookReferenceBinding
  },
  {
    id: "inkhub-noncanonical-forecast",
    title: "非正史剧情推演",
    description: "基于当前正史生成隔离候选分支，采用前不修改正文与状态。",
    focus: "分支 · 比较 · 非正史",
    content: noncanonicalForecast
  },
  {
    id: "inkhub-foreshadowing-lifecycle",
    title: "伏笔生命周期管理",
    description: "跟踪伏笔从埋设、强化、误导到回收和后果的完整状态。",
    focus: "伏笔 · 知识差 · 回收",
    content: foreshadowingLifecycle
  },
  {
    id: "inkhub-character-knowledge-boundary",
    title: "角色知识边界检查",
    description: "区分事实、读者知识与角色知识，定位全知穿帮和对话泄密。",
    focus: "人物 · 知识 · 连续性",
    content: characterKnowledgeBoundary
  }
] as const;

export function renderInkHubStoryKernelSkill(skill: InkHubStoryKernelSkill): string {
  return skill.content.trimEnd() + "\n";
}
