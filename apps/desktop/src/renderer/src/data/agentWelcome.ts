import type {
  LibraryAgentDomain,
  LibraryAgentSkill,
  LongAgentId,
  ScriptAgentWelcomeShortcuts,
  ScriptWorkspaceAgentId,
  ShortAgentWelcomeShortcuts,
  ShortWorkspaceAgentId,
  WorkspaceAgentId
} from "@deepwrite/contracts";
import {
  DEFAULT_LONG_AGENT_PROFILES,
  DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS,
  DEFAULT_SHORT_AGENT_WELCOME_SHORTCUTS
} from "@deepwrite/contracts";

export interface AgentWelcomeContent {
  title: string;
  description: string;
  questions: readonly [string, string, string];
}

export const DEFAULT_AGENT_WELCOME: AgentWelcomeContent = {
  title: "从一个创作目标开始",
  description: "告诉我你想完成的创作任务，我会结合当前文稿与你一起推进。",
  questions: ["帮我梳理当前创作目标", "检查当前文稿的问题", "告诉我下一步可以做什么"]
};

export const SHORT_AGENT_WELCOME_CONTENT = {
  character_design: {
    title: "从一个人物设计开始",
    description:
      "我是人物设计智能体，用于创建、管理和完善优秀的人设，让角色能够直接服务于后续剧情与正文。",
    questions: DEFAULT_SHORT_AGENT_WELCOME_SHORTCUTS.character_design
  },
  plot_design: {
    title: "从一个精彩剧情开始",
    description:
      "我是剧情设计智能体，用于设计和管理故事主线、导语钩子与剧情细节，让冲突、转折和结局前后连贯。",
    questions: DEFAULT_SHORT_AGENT_WELCOME_SHORTCUTS.plot_design
  },
  expert_draft_coordinator: {
    title: "从一篇完整正文开始",
    description:
      "我是正文专家智能体，统一负责正文结构、整篇创作、当前小节写作，以及成稿审阅、润色和跨节修订。",
    questions: DEFAULT_SHORT_AGENT_WELCOME_SHORTCUTS.expert_draft_coordinator
  }
} as const satisfies Record<ShortWorkspaceAgentId, AgentWelcomeContent>;

export const SCRIPT_AGENT_WELCOME_CONTENT = {
  character_design: {
    title: "从一组剧本人物开始",
    description: "我是剧本人物智能体，用于创建和完善适合镜头、行动与对白呈现的人物设计。",
    questions: DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS.character_design
  },
  plot_design: {
    title: "从一条剧本主线开始",
    description: "我是剧本剧情智能体，用于设计可拆场、可拍摄且因果连贯的剧情结构。",
    questions: DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS.plot_design
  },
  expert_draft_coordinator: {
    title: "从一部完整剧本开始",
    description: "我是剧本正文专家，统一负责剧集结构、全剧创作、当前剧集写作和跨集修订。",
    questions: DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS.expert_draft_coordinator
  }
} as const satisfies Record<ScriptWorkspaceAgentId, AgentWelcomeContent>;

export const LIBRARY_AGENT_WELCOME_CONTENT = {
  skill: {
    title: "从创建一个技能开始",
    description:
      "我是技能库管理智能体，用于创建、整理和维护可复用的写作方法、检查清单与协作流程。",
    questions: ["初始化库介绍", "创建一个技能", "整理一个技能"]
  },
  material: {
    title: "从创建一个素材开始",
    description:
      "我是素材库管理智能体，用于创建、整理和维护可由短篇、剧本和长篇共用的素材条目。",
    questions: ["初始化库介绍", "创建一个素材", "整理一个素材"]
  }
} as const satisfies Record<LibraryAgentDomain, AgentWelcomeContent>;

export const LONG_AGENT_WELCOME_CONTENT = Object.fromEntries(
  DEFAULT_LONG_AGENT_PROFILES.map((profile) => [
    profile.id,
    {
      title: `从${profile.label.replace(/智能体$/u, "")}开始`,
      description: profile.description,
      questions: profile.welcomeShortcuts
    }
  ])
) as unknown as Record<LongAgentId, AgentWelcomeContent>;

export function resolveAgentWelcome(
  agentId: WorkspaceAgentId | LongAgentId | undefined,
  libraryDomain?: LibraryAgentDomain,
  librarySkills?: readonly Pick<LibraryAgentSkill, "name">[],
  welcomeShortcuts?:
    | ShortAgentWelcomeShortcuts
    | ScriptAgentWelcomeShortcuts
    | readonly string[],
  workspaceType: "short" | "script" | "long" = "short"
): AgentWelcomeContent {
  if (agentId && workspaceType === "script") {
    const base = SCRIPT_AGENT_WELCOME_CONTENT[agentId as ScriptWorkspaceAgentId];
    if (base) return withWelcomeShortcuts(base, welcomeShortcuts);
  }
  if (
    agentId &&
    (workspaceType === "long" ||
      !(agentId in SHORT_AGENT_WELCOME_CONTENT))
  ) {
    const base = LONG_AGENT_WELCOME_CONTENT[agentId as LongAgentId];
    if (base) {
      if (
        welcomeShortcuts &&
        welcomeShortcuts.length === 3 &&
        welcomeShortcuts.every(
          (value) => typeof value === "string" && value.trim().length > 0
        )
      ) {
        return {
          ...base,
          questions: [
            welcomeShortcuts[0]!.trim(),
            welcomeShortcuts[1]!.trim(),
            welcomeShortcuts[2]!.trim()
          ]
        };
      }
      return base;
    }
  }
  if (agentId) {
    const base =
      SHORT_AGENT_WELCOME_CONTENT[agentId as ShortWorkspaceAgentId] ??
      DEFAULT_AGENT_WELCOME;
    if (
      welcomeShortcuts &&
      welcomeShortcuts.length === 3 &&
      welcomeShortcuts.every((value) => typeof value === "string" && value.trim().length > 0)
    ) {
      return {
        ...base,
        questions: [
          welcomeShortcuts[0].trim(),
          welcomeShortcuts[1].trim(),
          welcomeShortcuts[2].trim()
        ]
      };
    }
    return base;
  }
  if (libraryDomain) {
    const base = LIBRARY_AGENT_WELCOME_CONTENT[libraryDomain];
    if (!librarySkills?.length) {
      return base;
    }
    const questions = librarySkills.slice(0, 3).map((skill) => skill.name);
    while (questions.length < 3) {
      questions.push(base.questions[questions.length] ?? "");
    }
    return {
      ...base,
      questions: questions as [string, string, string]
    };
  }
  return DEFAULT_AGENT_WELCOME;
}

function withWelcomeShortcuts(
  base: AgentWelcomeContent,
  welcomeShortcuts?: readonly string[]
): AgentWelcomeContent {
  if (
    welcomeShortcuts?.length === 3 &&
    welcomeShortcuts.every(
      (value) => typeof value === "string" && value.trim().length > 0
    )
  ) {
    return {
      ...base,
      questions: [
        welcomeShortcuts[0]!.trim(),
        welcomeShortcuts[1]!.trim(),
        welcomeShortcuts[2]!.trim()
      ]
    };
  }
  return base;
}
