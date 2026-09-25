import type {
  CatalogSnapshot,
  DeepWriteApi,
  InkHubSkillRecord,
  LongAgentTeamSettings,
  ShortAgentSubagentDefinition,
  WorkspaceRuntimeContext,
  WorkspaceAgentTeamSettings
} from "@deepwrite/contracts";
import {
  INKHUB_STYLE_PRESETS,
  renderInkHubStylePresetSkill,
  type InkHubStylePreset
} from "./inkhubStylePresets";
import {
  INKHUB_PLOT_SKILLS,
  renderInkHubPlotSkill,
  type InkHubPlotSkill
} from "./inkhubPlotSkills";
import {
  INKHUB_STORY_KERNEL_SKILLS,
  renderInkHubStoryKernelSkill,
  type InkHubStoryKernelSkill
} from "./inkhubStoryKernelSkills";
import {
  INKHUB_COVER_SKILLS,
  coverSkillProvenance,
  coverSkillTitle,
  renderInkHubCoverSkill,
  type InkHubCoverSkill
} from "./inkhubCoverSkills";

export const INKHUB_SKILL_LIBRARY_TITLE = "墨枢 · 本机小说 Skills";
export const INKHUB_STYLE_LIBRARY_TITLE = "墨枢 · 通用文风预设";
export const INKHUB_PLOT_LIBRARY_TITLE = "墨枢 · 剧情设计 Skills";
export const INKHUB_STORY_KERNEL_LIBRARY_TITLE = "墨枢 · 全书创作内核 Skills";
export const INKHUB_COVER_LIBRARY_TITLE = "墨枢 · 小说封面 Skills";

export interface InkHubNativeAgentDefinition
  extends ShortAgentSubagentDefinition {
  sourceLabel: string;
  specialty: string;
}

export const INKHUB_NATIVE_AGENTS: readonly InkHubNativeAgentDefinition[] = [
  {
    id: "inkhub_narratologist",
    name: "叙事学家",
    description: "检查故事结构、因果链、视角、节奏与场景功能，给出可执行的修订方案。",
    specialty: "结构 · 视角 · 节奏",
    sourceLabel: "墨枢原生适配 · Codex 角色",
    systemPrompt: "你是小说叙事学家。围绕因果链、人物行动、视角控制、信息释放、场景功能与节奏分析文本。先引用具体情节证据，再区分硬伤、风险和可选优化，并给出最小可执行改法。除非主智能体明确要求，不替作者整段改写，不虚构未提供的情节。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_story_planner",
    name: "故事策划师",
    description: "把灵感收敛为读者承诺、核心冲突、主题问题和可持续展开的故事发动机。",
    specialty: "立项 · 冲突 · 读者承诺",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是故事策划师。先从作者已给材料中提炼主角、目标、阻力、失败代价与读者承诺，再提供机制真正不同的候选方向。明确区分事实、假设和待作者决定项，不使用流行作品名称代替方案，不擅自扩写正文。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_volume_architect",
    name: "分卷架构师",
    description: "设计每卷独立目标、冲突升级、高潮结算和跨卷因果桥，避免不同卷混成平铺章节。",
    specialty: "分卷 · 升级 · 跨卷衔接",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是分卷架构师。为每卷定义起止状态、表层目标、深层命题、主要阻力、代价升级、高潮选择和卷末结算，并检查上一卷结果是否直接制造下一卷的新局面。按卷分别维护章节范围与伏笔迁移，不把不同卷的同号章节混排。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_suspense_editor",
    name: "悬念与伏笔编辑",
    description: "维护谜面、信息差、伏笔承诺、误导和回收，让反转可回看且产生后果。",
    specialty: "悬念 · 信息差 · 回收",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是悬念与伏笔编辑。记录每条谜面或承诺的首次出现、强化、误导、部分揭示、最终回收和回收后果，分别说明读者与角色知道什么。反转必须有前置证据并改写理解；只拖延不给新证据、只解释不改变局面的做法要明确指出。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_scene_director",
    name: "场景与节拍导演",
    description: "把章纲拆成目标、阻力、策略、转折和离场状态明确的可写场景卡。",
    specialty: "场景 · 节拍 · 章末钩子",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是场景与节拍导演。检查每场的视角人物、即时目标、阻力、策略、转折、信息获得与离场状态，确认相邻场景由因果或人物选择连接。指出没有状态变化的场景，并给出最小合并或强化方案；章末钩子必须来自新问题、新代价或新选择。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_dialogue_editor",
    name: "对话与人物声音编辑",
    description: "检查角色声音、潜台词、知识边界、关系权力和对话行动是否各自成立。",
    specialty: "对话 · 潜台词 · 角色声线",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是对话与人物声音编辑。逐句核对说话者目标、知识边界、关系位置、潜台词和非语言行动，找出可互换角色名仍成立的同质化对白。先引用原句和问题，再提供保留信息目的的短改法；不要用口头禅堆砌代替独特声音。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_continuity_editor",
    name: "连续性审校师",
    description: "跨卷核对时间线、人物状态、物品、地点、知识、伤势与未回收承诺。",
    specialty: "时间线 · 状态账 · 跨卷连续性",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是连续性审校师。按卷和章节建立事实证据链，核对人物位置、时间、年龄、伤势、物品、能力、关系、知识边界与开放伏笔。每项冲突必须给出两端章节证据、影响范围和最小修复顺序；证据不足时标为待核对，不自行补写设定。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_prose_editor",
    name: "语言与文风编辑",
    description: "在不改事实与人物动机的前提下，处理节奏、冗余、抽象表达、视角漂移与文风偏移。",
    specialty: "语言 · 节奏 · 文风一致性",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是语言与文风编辑。先锁定本作自身的句长、语域、视角距离、描写密度和对话比例，再检查冗余、抽象判断、重复意象、节奏单一与视角漂移。修订不得改变事实、人物动机和伏笔功能，也不得模仿在世作者的可识别文风。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_reader_advocate",
    name: "读者体验测试员",
    description: "以首次阅读视角记录理解、期待、困惑、情绪和弃读风险，并验证修订是否真正改善。",
    specialty: "理解 · 期待 · 阅读阻力",
    sourceLabel: "墨枢原生适配 · 公开方法研究",
    systemPrompt: "你是读者体验测试员。按阅读顺序记录此刻理解了什么、期待什么、困惑什么、情绪如何变化，不使用作者未在正文呈现的信息替文本补脑。区分事实硬伤、阅读阻力和个人偏好，给出证据、影响、最小修法及修后回归检查。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_psychologist",
    name: "人物心理学家",
    description: "检查欲望、恐惧、防御机制、关系张力与行为动机是否可信。",
    specialty: "动机 · 关系 · 情绪",
    sourceLabel: "墨枢原生适配 · Codex 角色",
    systemPrompt: "你是人物心理学家。分析角色的欲望、恐惧、依恋、应对方式、矛盾与关系动力，检查行为是否有充分触发和连续后果。不要进行临床诊断或给真实人物贴病理标签。输出具体证据、可信度问题和可落地的行为或台词调整。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_historian",
    name: "历史学家",
    description: "核查时代制度、技术、物质生活、称谓与历史因果的一致性。",
    specialty: "时代 · 制度 · 物质文化",
    sourceLabel: "墨枢原生适配 · Codex 角色",
    systemPrompt: "你是小说历史顾问。核查时代、制度、技术、交通、物质生活、称谓与观念是否互相一致。明确区分已知事实、合理推断和架空设定；证据不足时标注不确定性。优先给不会破坏剧情目标的修订方案。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_anthropologist",
    name: "人类学家",
    description: "建立有内部差异的亲族、仪式、信仰、交换与日常文化系统。",
    specialty: "文化 · 仪式 · 群体",
    sourceLabel: "墨枢原生适配 · Codex 角色",
    systemPrompt: "你是小说人类学顾问。检查亲族、仪式、信仰、禁忌、交换、权力与日常实践能否形成自洽文化系统，并保留群体内部差异。避免把真实文化简化为单一符号或刻板印象；输出文化机制、剧情后果和需要补足的细节。",
    enabled: true,
    modelMode: "inherit"
  },
  {
    id: "inkhub_geographer",
    name: "地理学家",
    description: "检查地形、气候、资源、交通和聚落如何真实影响故事。",
    specialty: "空间 · 气候 · 交通",
    sourceLabel: "墨枢原生适配 · Codex 角色",
    systemPrompt: "你是小说地理顾问。检查地形、气候、水系、资源、交通距离、聚落与边界是否相互支持，并推导它们对经济、战争、迁徙和生活方式的后果。指出空间矛盾时给出最小调整，不凭空扩大世界设定。",
    enabled: true,
    modelMode: "inherit"
  }
] as const;

export interface InkHubCapabilityInstallState {
  installedSkillIds: ReadonlySet<string>;
  installedAgentIds: ReadonlySet<string>;
  installedStylePresetIds: ReadonlySet<string>;
  installedPlotSkillIds: ReadonlySet<string>;
  installedStoryKernelSkillIds: ReadonlySet<string>;
  installedCoverSkillIds: ReadonlySet<string>;
  skillLibraryId: string | null;
  styleLibraryId: string | null;
  plotLibraryId: string | null;
  storyKernelLibraryId: string | null;
  coverLibraryId: string | null;
}

export interface InkHubCapabilityInstallResult
  extends InkHubCapabilityInstallState {
  installedSkills: number;
  installedAgents: number;
  skippedSkills: number;
}

function nativeSkillTitle(skill: InkHubSkillRecord): string {
  const source = skill.source === "codex"
    ? "Codex"
    : skill.source === "trae"
      ? "TRAE"
      : skill.source === "collaboration"
        ? "协作"
        : "小说项目";
  return `[${source}] ${skill.title}`;
}

function nativeSkillProvenance(skill: InkHubSkillRecord): string {
  return `<!-- inkhub-source:${skill.id}; sha256:${skill.expectedSha256} -->`;
}

function stylePresetTitle(style: InkHubStylePreset): string {
  return `[文风预设] ${style.title}`;
}

function stylePresetProvenance(style: InkHubStylePreset): string {
  return `<!-- inkhub-style-preset:${style.id}; upstream-content-copied:false -->`;
}

function plotSkillTitle(skill: InkHubPlotSkill): string {
  return `[剧情设计] ${skill.title}`;
}

function plotSkillProvenance(skill: InkHubPlotSkill): string {
  return `<!-- inkhub-plot-skill:${skill.id}; adaptation:clean-room; source-ref:${skill.sourceRef}; license:${skill.license}; external-execution:false -->`;
}

function storyKernelSkillTitle(skill: InkHubStoryKernelSkill): string {
  return `[创作内核] ${skill.title}`;
}

function storyKernelSkillProvenance(skill: InkHubStoryKernelSkill): string {
  return `<!-- inkhub-story-kernel-skill:${skill.id}; owner:inkhub; license:project-proprietary; external-execution:false -->`;
}

function isInstalledCoverSkill(
  entries: readonly { title: string; body: string }[] | undefined,
  skill: InkHubCoverSkill
): boolean {
  const expected = renderInkHubCoverSkill(skill);
  return entries?.some((entry) =>
    entry.title === coverSkillTitle(skill) &&
    entry.body === expected &&
    entry.body.includes(coverSkillProvenance(skill))
  ) ?? false;
}

export function inkHubStoryKernelAttachments(
  catalog: CatalogSnapshot
): NonNullable<WorkspaceRuntimeContext["attachedSkills"]> {
  const library = catalog.skills.find((candidate) =>
    candidate.title.startsWith(INKHUB_STORY_KERNEL_LIBRARY_TITLE) &&
    candidate.skillKind === "general"
  );
  if (!library) return [];
  return INKHUB_STORY_KERNEL_SKILLS.flatMap((skill) => {
    const title = storyKernelSkillTitle(skill);
    const expected = renderInkHubStoryKernelSkill(skill);
    const entry = library.entries.find((candidate) =>
      candidate.title === title &&
      candidate.body === expected &&
      candidate.body.includes(storyKernelSkillProvenance(skill))
    );
    return entry
      ? [{
          id: `inkhub-story-kernel:${skill.id}`,
          title,
          content: entry.body,
          kind: "general" as const,
          source: "attached-skill" as const
        }]
      : [];
  });
}

export function bundledInkHubStoryKernelAttachments(): NonNullable<WorkspaceRuntimeContext["attachedSkills"]> {
  return INKHUB_STORY_KERNEL_SKILLS.map((skill) => ({
    id: `inkhub-story-kernel:${skill.id}`,
    title: storyKernelSkillTitle(skill),
    content: renderInkHubStoryKernelSkill(skill),
    kind: "general" as const,
    source: "attached-skill" as const
  }));
}

export function inkHubStylePresetAttachments(
  catalog: CatalogSnapshot
): NonNullable<WorkspaceRuntimeContext["attachedSkills"]> {
  const library = catalog.skills.find((candidate) =>
    candidate.title.startsWith(INKHUB_STYLE_LIBRARY_TITLE) &&
    candidate.skillKind === "style"
  );
  if (!library) return [];
  return INKHUB_STYLE_PRESETS.flatMap((style) => {
    const title = stylePresetTitle(style);
    const expected = renderInkHubStylePresetSkill(style);
    const entry = library.entries.find((candidate) =>
      candidate.title === title &&
      candidate.body === expected &&
      candidate.body.includes(stylePresetProvenance(style))
    );
    return entry
      ? [{
          id: `inkhub-style:${style.id}`,
          title,
          content: entry.body,
          kind: "style" as const,
          source: "attached-skill" as const
        }]
      : [];
  });
}

export function bundledInkHubStylePresetAttachments(): NonNullable<WorkspaceRuntimeContext["attachedSkills"]> {
  return INKHUB_STYLE_PRESETS.map((style) => ({
    id: `inkhub-style:${style.id}`,
    title: stylePresetTitle(style),
    content: renderInkHubStylePresetSkill(style),
    kind: "style" as const,
    source: "attached-skill" as const
  }));
}

function matchesNativeAgent(
  agent: ShortAgentSubagentDefinition,
  expected: InkHubNativeAgentDefinition
): boolean {
  return agent.id === expected.id &&
    agent.name === expected.name &&
    agent.systemPrompt === expected.systemPrompt &&
    agent.modelMode === expected.modelMode &&
    agent.enabled === expected.enabled;
}

function isInstallableSkill(skill: InkHubSkillRecord): boolean {
  return skill.source !== "codex-agent" && skill.status === "verified" && skill.executable;
}

function mergeWorkspaceAgents(
  settings: WorkspaceAgentTeamSettings
): { value: WorkspaceAgentTeamSettings; added: number } {
  let added = 0;
  const teams = settings.teams.map((team) => {
    const expected = team.parentAgentId === "character_design"
      ? INKHUB_NATIVE_AGENTS.filter((agent) =>
          ["inkhub_psychologist", "inkhub_anthropologist", "inkhub_dialogue_editor", "inkhub_reader_advocate"].includes(agent.id)
        )
      : team.parentAgentId === "plot_design"
        ? INKHUB_NATIVE_AGENTS.filter((agent) =>
            ["inkhub_story_planner", "inkhub_narratologist", "inkhub_volume_architect", "inkhub_suspense_editor", "inkhub_scene_director", "inkhub_historian", "inkhub_geographer"].includes(agent.id)
          )
        : team.parentAgentId === "expert_draft_coordinator"
          ? INKHUB_NATIVE_AGENTS.filter((agent) =>
              ["inkhub_narratologist", "inkhub_psychologist", "inkhub_scene_director", "inkhub_dialogue_editor", "inkhub_continuity_editor", "inkhub_prose_editor", "inkhub_reader_advocate"].includes(agent.id)
            )
        : [];
    const subagents = [...team.subagents];
    for (const agent of expected) {
      const index = subagents.findIndex((candidate) => candidate.id === agent.id);
      if (index < 0) {
        subagents.push(agent);
        added += 1;
      } else if (!matchesNativeAgent(subagents[index]!, agent)) {
        subagents[index] = agent;
        added += 1;
      }
    }
    return { ...team, subagents };
  });
  return { value: { ...settings, teams } as WorkspaceAgentTeamSettings, added };
}

function longAssignments(parentAgentId: string): readonly InkHubNativeAgentDefinition[] {
  const ids = parentAgentId === "setting"
    ? ["inkhub_psychologist", "inkhub_historian", "inkhub_anthropologist", "inkhub_geographer", "inkhub_continuity_editor"]
    : parentAgentId === "plot_design"
      ? ["inkhub_story_planner", "inkhub_narratologist", "inkhub_volume_architect", "inkhub_suspense_editor", "inkhub_scene_director", "inkhub_psychologist", "inkhub_reader_advocate"]
      : parentAgentId === "draft"
        ? ["inkhub_narratologist", "inkhub_psychologist", "inkhub_scene_director", "inkhub_dialogue_editor", "inkhub_prose_editor", "inkhub_reader_advocate"]
        : ["inkhub_continuity_editor", "inkhub_suspense_editor", "inkhub_historian", "inkhub_geographer"];
  return INKHUB_NATIVE_AGENTS.filter((agent) => ids.includes(agent.id));
}

function mergeLongAgents(
  settings: LongAgentTeamSettings
): { value: LongAgentTeamSettings; added: number } {
  let added = 0;
  const teams = settings.teams.map((team) => {
    const subagents = [...team.subagents];
    for (const agent of longAssignments(team.parentAgentId)) {
      const index = subagents.findIndex((candidate) => candidate.id === agent.id);
      if (index < 0) {
        subagents.push(agent);
        added += 1;
      } else if (!matchesNativeAgent(subagents[index]!, agent)) {
        subagents[index] = agent;
        added += 1;
      }
    }
    return { ...team, subagents };
  });
  return { value: { ...settings, teams }, added };
}

export async function readInkHubCapabilityState(
  api: DeepWriteApi,
  skills: readonly InkHubSkillRecord[]
): Promise<InkHubCapabilityInstallState> {
  const [catalog, shortTeams, scriptTeams, longTeams] = await Promise.all([
    api.catalog.snapshot(),
    api.agentTeams.list("short"),
    api.agentTeams.list("script"),
    api.longAgentTeams.list()
  ]);
  const skillLibrary = catalog.skills.find((library) =>
    library.title.startsWith(INKHUB_SKILL_LIBRARY_TITLE) &&
    library.entries.some((entry) => /<!-- inkhub-source:[^;]+; sha256:[a-f0-9]{64} -->/u.test(entry.body))
  );
  const styleLibrary = catalog.skills.find((library) =>
    library.title.startsWith(INKHUB_STYLE_LIBRARY_TITLE) &&
    library.entries.some((entry) => /<!-- inkhub-style-preset:[a-z0-9-]+; upstream-content-copied:false -->/u.test(entry.body))
  );
  const plotLibrary = catalog.skills.find((library) =>
    library.title.startsWith(INKHUB_PLOT_LIBRARY_TITLE) &&
    library.skillKind === "plot" &&
    library.entries.some((entry) => /<!-- inkhub-plot-skill:[a-z0-9-]+; adaptation:clean-room;/u.test(entry.body))
  );
  const storyKernelLibrary = catalog.skills.find((library) =>
    library.title.startsWith(INKHUB_STORY_KERNEL_LIBRARY_TITLE) &&
    library.skillKind === "general" &&
    library.entries.some((entry) => /<!-- inkhub-story-kernel-skill:[a-z0-9-]+; owner:inkhub;/u.test(entry.body))
  );
  const coverLibrary = catalog.skills.find((library) =>
    library.title.startsWith(INKHUB_COVER_LIBRARY_TITLE) &&
    library.skillKind === "other" &&
    library.entries.some((entry) => /<!-- inkhub-cover-skill:[a-z0-9-]+; owner:inkhub;/u.test(entry.body))
  );
  const installedSkillIds = new Set(
    skills
      .filter((skill) => skillLibrary?.entries.some((entry) =>
        entry.title === nativeSkillTitle(skill) && entry.body.includes(nativeSkillProvenance(skill))
      ))
      .map((skill) => skill.id)
  );
  const installedAgentIds = new Set<string>();
  const installedStylePresetIds = new Set(
    INKHUB_STYLE_PRESETS
      .filter((style) => styleLibrary?.entries.some((entry) =>
        entry.title === stylePresetTitle(style) && entry.body.includes(stylePresetProvenance(style))
      ))
      .map((style) => style.id)
  );
  const installedPlotSkillIds = new Set(
    INKHUB_PLOT_SKILLS
      .filter((skill) => plotLibrary?.entries.some((entry) =>
        entry.title === plotSkillTitle(skill) &&
        entry.body === renderInkHubPlotSkill(skill) &&
        entry.body.includes(plotSkillProvenance(skill))
      ))
      .map((skill) => skill.id)
  );
  const installedStoryKernelSkillIds = new Set(
    INKHUB_STORY_KERNEL_SKILLS
      .filter((skill) => storyKernelLibrary?.entries.some((entry) =>
        entry.title === storyKernelSkillTitle(skill) &&
        entry.body === renderInkHubStoryKernelSkill(skill) &&
        entry.body.includes(storyKernelSkillProvenance(skill))
      ))
      .map((skill) => skill.id)
  );
  const installedCoverSkillIds = new Set(
    INKHUB_COVER_SKILLS
      .filter((skill) => isInstalledCoverSkill(coverLibrary?.entries, skill))
      .map((skill) => skill.id)
  );
  for (const settings of [shortTeams, scriptTeams, longTeams]) {
    for (const team of settings.teams) {
      for (const agent of team.subagents) {
        const definition = INKHUB_NATIVE_AGENTS.find((candidate) => candidate.id === agent.id);
        if (definition && matchesNativeAgent(agent, definition)) installedAgentIds.add(agent.id);
      }
    }
  }
  return {
    installedSkillIds,
    installedAgentIds,
    installedStylePresetIds,
    installedPlotSkillIds,
    installedStoryKernelSkillIds,
    installedCoverSkillIds,
    skillLibraryId: skillLibrary?.id ?? null,
    styleLibraryId: styleLibrary?.id ?? null,
    plotLibraryId: plotLibrary?.id ?? null,
    storyKernelLibraryId: storyKernelLibrary?.id ?? null,
    coverLibraryId: coverLibrary?.id ?? null
  };
}

export async function installInkHubCapabilities(
  api: DeepWriteApi,
  skills: readonly InkHubSkillRecord[]
): Promise<InkHubCapabilityInstallResult> {
  if (!api.inkHub) throw new Error("墨枢本机能力服务不可用。");
  let catalog = await api.catalog.snapshot();
  let library = catalog.skills.find((candidate) =>
    candidate.title.startsWith(INKHUB_SKILL_LIBRARY_TITLE) &&
    candidate.entries.some((entry) => /<!-- inkhub-source:[^;]+; sha256:[a-f0-9]{64} -->/u.test(entry.body))
  );
  if (!library) {
    const titleTaken = catalog.skills.some((candidate) => candidate.title === INKHUB_SKILL_LIBRARY_TITLE);
    const created = await api.catalog.createLibrary({
      domain: "skill",
      name: titleTaken ? `${INKHUB_SKILL_LIBRARY_TITLE}（受管）` : INKHUB_SKILL_LIBRARY_TITLE,
      skillKind: "general"
    });
    if (!created || !("skillKind" in created)) {
      throw new Error("没有创建本机小说技能库，能力装配已停止。");
    }
    library = created;
  }

  let installedSkills = 0;
  let skippedSkills = 0;
  for (const skill of skills.filter(isInstallableSkill)) {
    const title = nativeSkillTitle(skill);
    const existing = library.entries.find((entry) => entry.title === title);
    if (existing?.body.includes(nativeSkillProvenance(skill))) continue;
    const preview = await api.inkHub.readSkill(skill.id);
    if (preview.truncated) {
      skippedSkills += 1;
      continue;
    }
    const content = `${preview.content.trimEnd()}\n\n${nativeSkillProvenance(skill)}\n`;
    if (existing) {
      await api.catalog.saveLibraryEntry({
        domain: "skill",
        libraryId: library.id,
        entryId: existing.id,
        title,
        content
      });
    } else {
      await api.catalog.createLibraryEntry({
        domain: "skill",
        libraryId: library.id,
        title,
        content
      });
    }
    installedSkills += 1;
  }

  catalog = await api.catalog.snapshot();
  let styleLibrary = catalog.skills.find((candidate) =>
    candidate.title.startsWith(INKHUB_STYLE_LIBRARY_TITLE) &&
    candidate.entries.some((entry) => /<!-- inkhub-style-preset:[a-z0-9-]+; upstream-content-copied:false -->/u.test(entry.body))
  );
  if (!styleLibrary) {
    const titleTaken = catalog.skills.some((candidate) => candidate.title === INKHUB_STYLE_LIBRARY_TITLE);
    const created = await api.catalog.createLibrary({
      domain: "skill",
      name: titleTaken ? `${INKHUB_STYLE_LIBRARY_TITLE}（受管）` : INKHUB_STYLE_LIBRARY_TITLE,
      skillKind: "style"
    });
    if (!created || !("skillKind" in created)) {
      throw new Error("没有创建通用文风预设库，能力装配已停止。");
    }
    styleLibrary = created;
  }
  for (const style of INKHUB_STYLE_PRESETS) {
    const title = stylePresetTitle(style);
    const existing = styleLibrary.entries.find((entry) => entry.title === title);
    const content = renderInkHubStylePresetSkill(style);
    if (existing?.body.includes(stylePresetProvenance(style)) && existing.body === content) continue;
    if (existing) {
      await api.catalog.saveLibraryEntry({
        domain: "skill",
        libraryId: styleLibrary.id,
        entryId: existing.id,
        title,
        content
      });
    } else {
      await api.catalog.createLibraryEntry({
        domain: "skill",
        libraryId: styleLibrary.id,
        title,
        content
      });
    }
    installedSkills += 1;
  }

  catalog = await api.catalog.snapshot();
  let plotLibrary = catalog.skills.find((candidate) =>
    candidate.title.startsWith(INKHUB_PLOT_LIBRARY_TITLE) &&
    candidate.skillKind === "plot" &&
    candidate.entries.some((entry) => /<!-- inkhub-plot-skill:[a-z0-9-]+; adaptation:clean-room;/u.test(entry.body))
  );
  if (!plotLibrary) {
    const titleTaken = catalog.skills.some((candidate) => candidate.title === INKHUB_PLOT_LIBRARY_TITLE);
    const created = await api.catalog.createLibrary({
      domain: "skill",
      name: titleTaken ? `${INKHUB_PLOT_LIBRARY_TITLE}（受管）` : INKHUB_PLOT_LIBRARY_TITLE,
      skillKind: "plot"
    });
    if (!created || !("skillKind" in created)) {
      throw new Error("没有创建剧情设计技能库，能力装配已停止。");
    }
    plotLibrary = created;
  }
  for (const skill of INKHUB_PLOT_SKILLS) {
    const title = plotSkillTitle(skill);
    const existing = plotLibrary.entries.find((entry) => entry.title === title);
    const content = renderInkHubPlotSkill(skill);
    if (existing?.body === content && existing.body.includes(plotSkillProvenance(skill))) continue;
    if (existing) {
      await api.catalog.saveLibraryEntry({ domain: "skill", libraryId: plotLibrary.id, entryId: existing.id, title, content });
    } else {
      await api.catalog.createLibraryEntry({ domain: "skill", libraryId: plotLibrary.id, title, content });
    }
    installedSkills += 1;
  }

  catalog = await api.catalog.snapshot();
  let storyKernelLibrary = catalog.skills.find((candidate) =>
    candidate.title.startsWith(INKHUB_STORY_KERNEL_LIBRARY_TITLE) &&
    candidate.skillKind === "general" &&
    candidate.entries.some((entry) => /<!-- inkhub-story-kernel-skill:[a-z0-9-]+; owner:inkhub;/u.test(entry.body))
  );
  if (!storyKernelLibrary) {
    const titleTaken = catalog.skills.some((candidate) => candidate.title === INKHUB_STORY_KERNEL_LIBRARY_TITLE);
    const created = await api.catalog.createLibrary({
      domain: "skill",
      name: titleTaken ? `${INKHUB_STORY_KERNEL_LIBRARY_TITLE}（受管）` : INKHUB_STORY_KERNEL_LIBRARY_TITLE,
      skillKind: "general"
    });
    if (!created || !("skillKind" in created)) {
      throw new Error("没有创建全书创作内核技能库，能力装配已停止。");
    }
    storyKernelLibrary = created;
  }
  for (const skill of INKHUB_STORY_KERNEL_SKILLS) {
    const title = storyKernelSkillTitle(skill);
    const existing = storyKernelLibrary.entries.find((entry) => entry.title === title);
    const content = renderInkHubStoryKernelSkill(skill);
    if (existing?.body === content && existing.body.includes(storyKernelSkillProvenance(skill))) continue;
    if (existing) {
      await api.catalog.saveLibraryEntry({ domain: "skill", libraryId: storyKernelLibrary.id, entryId: existing.id, title, content });
    } else {
      await api.catalog.createLibraryEntry({ domain: "skill", libraryId: storyKernelLibrary.id, title, content });
    }
    installedSkills += 1;
  }

  catalog = await api.catalog.snapshot();
  let coverLibrary = catalog.skills.find((candidate) =>
    candidate.title.startsWith(INKHUB_COVER_LIBRARY_TITLE) &&
    candidate.skillKind === "other" &&
    candidate.entries.some((entry) => /<!-- inkhub-cover-skill:[a-z0-9-]+; owner:inkhub;/u.test(entry.body))
  );
  if (!coverLibrary) {
    const titleTaken = catalog.skills.some((candidate) => candidate.title === INKHUB_COVER_LIBRARY_TITLE);
    const created = await api.catalog.createLibrary({
      domain: "skill",
      name: titleTaken ? `${INKHUB_COVER_LIBRARY_TITLE}（受管）` : INKHUB_COVER_LIBRARY_TITLE,
      skillKind: "other"
    });
    if (!created || !("skillKind" in created)) {
      throw new Error("没有创建小说封面技能库，能力装配已停止。");
    }
    coverLibrary = created;
  }
  for (const skill of INKHUB_COVER_SKILLS) {
    const title = coverSkillTitle(skill);
    const existing = coverLibrary.entries.find((entry) => entry.title === title);
    const content = renderInkHubCoverSkill(skill);
    if (existing?.body === content && existing.body.includes(coverSkillProvenance(skill))) continue;
    if (existing) {
      await api.catalog.saveLibraryEntry({ domain: "skill", libraryId: coverLibrary.id, entryId: existing.id, title, content });
    } else {
      await api.catalog.createLibraryEntry({ domain: "skill", libraryId: coverLibrary.id, title, content });
    }
    installedSkills += 1;
  }

  let installedAgents = 0;
  for (const workspaceType of ["short", "script"] as const) {
    const merged = mergeWorkspaceAgents(await api.agentTeams.list(workspaceType));
    if (merged.added > 0) {
      await api.agentTeams.save(merged.value);
      installedAgents += merged.added;
    }
  }
  const mergedLong = mergeLongAgents(await api.longAgentTeams.list());
  if (mergedLong.added > 0) {
    await api.longAgentTeams.save(mergedLong.value);
    installedAgents += mergedLong.added;
  }

  catalog = await api.catalog.snapshot();
  const state = await readInkHubCapabilityState(api, skills);
  return {
    ...state,
    installedSkills,
    installedAgents,
    skippedSkills
  };
}

let capabilityInstallPromise: Promise<{
  snapshot: Awaited<ReturnType<NonNullable<DeepWriteApi["inkHub"]>["installSkills"]>>;
  result: InkHubCapabilityInstallResult;
}> | null = null;

export async function ensureInkHubCapabilities(api: DeepWriteApi): Promise<{
  snapshot: Awaited<ReturnType<NonNullable<DeepWriteApi["inkHub"]>["installSkills"]>>;
  result: InkHubCapabilityInstallResult;
}> {
  if (!api.inkHub) throw new Error("墨枢本机能力服务不可用。");
  capabilityInstallPromise ??= (async () => {
    const snapshot = await api.inkHub!.installSkills();
    const result = await installInkHubCapabilities(api, snapshot.skills);
    return { snapshot, result };
  })();
  try {
    return await capabilityInstallPromise;
  } finally {
    capabilityInstallPromise = null;
  }
}
