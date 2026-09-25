import type { InkHubNovelQualityIssue } from "@deepwrite/contracts";

export interface InkHubRepairRoute {
  agents: readonly string[];
  skills: readonly string[];
  instruction: string;
}

export const INKHUB_REPAIR_ROUTES = {
  "duplicate-paragraph": {
    agents: ["inkhub_continuity_editor", "inkhub_prose_editor", "inkhub_reader_advocate"],
    skills: ["consistency-check", "novel-text-polish", "inkhub-volume-chapter-continuity", "inkhub-review-revise-reaudit", "inkhub-semantic-deslop"],
    instruction: "保留最早且最符合因果链的一次表达，删除或重写后续重复；不得同时改写两端事实，也不得损坏伏笔、人物状态与叙事声线。"
  },
  "empty-chapter": {
    agents: ["inkhub_narratologist", "inkhub_scene_director", "inkhub_continuity_editor"],
    skills: ["novel-chapter-generate", "novel-outline-refine", "consistency-check", "inkhub-longform-structure-analysis", "inkhub-volume-chapter-continuity", "inkhub-review-revise-reaudit"],
    instruction: "依据相邻章节和已有设定补全章节功能、场景目标、阻力与离场状态；证据不足时只给最小连贯稿，不擅自新增核心设定。"
  },
  "very-short-chapter": {
    agents: ["inkhub_scene_director", "inkhub_narratologist", "inkhub_reader_advocate"],
    skills: ["novel-chapter-generate", "chapter-hook-generate", "plot-pleasure-rhythm", "inkhub-author-style-fingerprint", "inkhub-semantic-deslop", "inkhub-review-revise-reaudit"],
    instruction: "先判断短章是否有独立功能；需要扩写时只补足动作、冲突、信息与余波，保持既有节奏和事实，不为凑字数加入无效描写。"
  },
  "chapter-order-gap": {
    agents: ["inkhub_continuity_editor", "inkhub_volume_architect", "inkhub_narratologist"],
    skills: ["consistency-check", "logic-check", "novel-outline-refine", "inkhub-volume-chapter-continuity", "inkhub-longform-structure-analysis", "inkhub-review-revise-reaudit"],
    instruction: "按卷分别核对章节序号与因果顺序；优先修正文内衔接，不跨卷重排同号章节，不凭编号缺口虚构缺失剧情。"
  }
} as const satisfies Record<InkHubNovelQualityIssue["rule"], InkHubRepairRoute>;

export function repairRouteForRule(
  rule: InkHubNovelQualityIssue["rule"]
): InkHubRepairRoute {
  return INKHUB_REPAIR_ROUTES[rule];
}
