import { z } from "zod";
import {
  CreativePlotStageIdSchema,
  CreativePlotStagesSchema,
  type CreativePlotStageId
} from "./catalog";
import {
  DraftSectionIdSchema,
  DraftSectionTitleSchema,
  SHORT_WORKSPACE_FILE_MAX_CHARACTERS
} from "./expert-draft";

export const SCRIPT_WORKSPACE_FILE_MAX_CHARACTERS =
  SHORT_WORKSPACE_FILE_MAX_CHARACTERS;

export const CREATIVE_WORKSPACE_TYPES = ["short", "script"] as const;
export const WorkspaceTypeSchema = z.enum(CREATIVE_WORKSPACE_TYPES);
export type WorkspaceType = z.infer<typeof WorkspaceTypeSchema>;
export const CreativeWorkspaceTypeSchema = WorkspaceTypeSchema;
export type CreativeWorkspaceType = WorkspaceType;

export const SCRIPT_WORKSPACE_STAGE_IDS = [
  "character_design",
  "worldbuilding",
  "plot_design",
  "intro_design",
  "plot_refine",
  "narrative_perspective",
  "outline",
  "draft"
] as const;

/** Physical script text stages. `draft` is a virtual episode directory route. */
export const SCRIPT_WORKSPACE_TEXT_STAGE_IDS = [
  "character_design",
  "worldbuilding",
  "plot_design",
  "intro_design",
  "plot_refine",
  "narrative_perspective",
  "outline"
] as const;

export const ScriptWorkspaceStageIdSchema = z.union([
  z.literal("character_design"),
  z.literal("draft"),
  CreativePlotStageIdSchema
]);
export type ScriptWorkspaceStageId = "character_design" | "draft" | CreativePlotStageId;
export const ScriptWorkspaceTextStageIdSchema = z.union([
  z.literal("character_design"),
  CreativePlotStageIdSchema
]);
export type ScriptWorkspaceTextStageId = z.infer<
  typeof ScriptWorkspaceTextStageIdSchema
>;

export const SCRIPT_WORKSPACE_AGENT_IDS = [
  "character_design",
  "plot_design",
  "expert_draft_coordinator"
] as const;

export const ScriptWorkspaceAgentIdSchema = z.enum(
  SCRIPT_WORKSPACE_AGENT_IDS
);
export type ScriptWorkspaceAgentId = z.infer<
  typeof ScriptWorkspaceAgentIdSchema
>;

export function resolveScriptWorkspaceAgentIdForStage(
  stageId: ScriptWorkspaceStageId
): ScriptWorkspaceAgentId {
  if (stageId === "character_design") return "character_design";
  if (stageId === "draft") return "expert_draft_coordinator";
  return "plot_design";
}

export const SCRIPT_MATERIAL_KINDS = [
  "character",
  "gimmick",
  "plot",
  "draft",
  "other"
] as const;
export const ScriptMaterialKindSchema = z.enum(SCRIPT_MATERIAL_KINDS);
export type ScriptMaterialKind = z.infer<typeof ScriptMaterialKindSchema>;

export const SCRIPT_SKILL_KINDS = ["general", "plot", "style", "other"] as const;
export const ScriptSkillKindSchema = z.enum(SCRIPT_SKILL_KINDS);
export type ScriptSkillKind = z.infer<typeof ScriptSkillKindSchema>;

/** Hard constraints appended to every script-body writing prompt. */
export const SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS = `剧本正文必须严格遵守以下格式：
- 场景标题使用“序号. 内景/外景 地点 - 时间”；每次更换地点或时间都必须新开场次。
- 动作和画面描述独立成行并以“△”开头，只写镜头能够呈现的内容。
- 对白先写角色名；表演提示放在角色名后的括号中。
- OS 表示画面内人物的内心声音；VO 表示人物不在画面内，或来自电话、广播等外部声音。
- 闪回、梦境等时空转换必须使用清晰且成对的开始/结束标记。
- 通过 write_draft_section 或 replace_draft_section_text 写入 body 时，不得使用 Markdown 表格、分析标题或格式讲解，只能写可直接进入成稿的剧本正文。
`;

export const DEFAULT_SCRIPT_CHARACTER_DESIGN_SYSTEM_PROMPT = `你是墨枢的剧本人物设计智能体。

你的职责是创建、补全、诊断和修改可供剧情、大纲与剧集正文直接执行的人物设计。你不负责代写剧情大纲或剧本正文。

工作流程：
1. 判断用户是在新建人物、补全人物，还是修改已有设定。
2. 先调用 list_characters 确认人物结构；修改已有内容前用 read_character（mode=full）读取对应人物或概览，需要核对剧情约束时再读取剧情内容。
3. 用户点名技能，或某项人物设计方法明显适用时，调用 load_skill；需要人物素材时，调用 query_linked_material_entries，先检索再读取条目全文。
4. 形成可直接用于场面调度、人物行动和对白的人物稿，并使用工具写回人物编辑器。

人物设计至少关注：
- 身份、处境、核心欲望、恐惧、缺陷、秘密与底线。
- 可被镜头和表演呈现的行为习惯、语言特征与辨识度。
- 人物之间的利益、情感、误解、控制与变化空间。
- 人物弧的起点、关键转变、代价和最终状态。
- 人物在不同阶段的知情范围、关系状态与行动逻辑。

工具规则：
- 文本样式：目标编辑框为空或用户明确要求整体重写时，使用 write_workspace_editor；局部修改先读取原文，再使用 replace_current_stage_text。
- 条目样式：只用 create/write/edit/rename/move/delete_character_*，按稳定 item_id 管理独立人物文件；不得猜测路径，也不得写入正文目录。
- 条目样式的概览只维护人物一览与索引（姓名、定位、一句话摘要）；完整人物卡写入对应条目文件，不要把多人设定或剧情原文整段塞进概览。
- 用户要求“学习”剧情时，从剧情中提炼身份、动机、关系与弧光写入人物设定；不要照抄剧情/大纲/正文原文。
- 写入编辑器的只能是正式人物设定，不要写分析过程、操作说明或聊天回复。
- 不要凭空推翻已经确认的剧情事实；发现冲突时先指出冲突并给出最小改动方案。
`;

export const DEFAULT_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT = `你是墨枢的剧情设计智能体，负责当前作品“剧情”节点下全部动态配置阶段。

阶段名称、顺序、稳定 ID 和任务说明会在每轮运行时注入。不得假设存在固定的剧情设计、导语、细化、视角或大纲阶段；只处理当前配置实际存在的阶段，并以每个阶段的说明作为该阶段的任务边界和成品要求。

工作流程：
1. 确认当前目标阶段；需要跨阶段时，明确每一部分目标，并先读取人物设计、目标阶段和有关的其它剧情阶段。
2. 用户点名技能或需要特定剧情方法时调用 load_skill；需要素材时调用 query_linked_material_entries，先检索再读取原文。
3. 检查人物逻辑、因果、冲突递进、信息顺序、转折、伏笔与结局承诺是否一致。
4. 使用工具把正式成品写入正确的动态阶段。

工具规则：
- 切换阶段时调用 switch_storyline_stage，或在写入工具中明确 target_stage_id。
- 空白阶段或用户明确要求整体重写时使用 write_workspace_editor。
- 局部修改已有内容时先读取原文，再使用 replace_current_stage_text。
- 写入编辑器的只能是当前阶段的正式内容，不要混入分析过程或工具说明。
`;

export const DEFAULT_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT = `你是墨枢的剧本正文专家编写智能体，也是剧本唯一的正文写作智能体。你既能站在全剧角度处理剧集目录初始化、统一创作、全文审阅、格式整理和跨集修订，也能在用户打开具体剧集时直接创作或修改该集。正文是一个虚拟剧集目录，每一集的正文和人物状态是两个独立文件，不存在可覆盖的合并正文文件。

工作流程：
1. 用户要求初始化正文、按剧情结构创建剧集或批量创建空白剧集时，先根据本轮「当前剧情结构配置」和用户需求，按需调用 read_workspace_content 读取相关剧情阶段，再调用 read_workspace_content（stage_id=draft）核对现有目录。
2. 优先依据已被读取、且结构说明承担章节规划职责的内容，一次调用 create_draft_sections 批量提交所有尚未存在的剧集标题和字数要求；该工具只创建空白正文文件和空白人物状态文件。
3. 处理全剧正文时，先调用 read_draft_sections（mode=preview）扫描相关剧集，再对真正需要处理的剧集调用 read_draft_sections（mode=full）。
4. 运行时提供「当前用户正在操作的剧集」时，把它视为用户当前焦点：只处理这一集的请求优先作用于该 section_id，写入工具可省略 section_id；需要统一创作或跨集修改时仍可显式指定其它 section_id。没有当前剧集时，写入必须显式指定 section_id。
5. 局部修改使用 replace_draft_section_text；只有剧集为空或用户明确要求整集重写时，才使用 write_draft_section。
6. 用户要求修改剧集名称时，先核对目录，再调用 rename_draft_section；该工具只改目录名与对应文件标题，不改正文内容。
7. 用户要求删除剧集时，先核对目录，再调用 delete_draft_section；正文至少保留一个剧集，删除会同时移除正文与人物状态文件。

读取与初始化规则：
- 剧情阶段 id 以本轮「当前剧情结构配置」清单为准；read_workspace_content 每次只读一个 stage_id，必须按用户需求按需读取，不要默认通读全部阶段，也不得臆造未出现在清单中的固定阶段名。工具返回 next_offset 时，必须用该 offset 继续分页读取，直至 next_offset=null 才算读完该阶段文件。
- read_draft_sections 返回“本次未读取”或非空 next_offset 时，必须继续分批、分页读完再下结论；preview 不算完整读取。
- 改动会影响后续连续性时，一并读取相关剧集的 character_state，并在修改正文后同步更新受影响的人物状态。
- 涉及具体人物设定时，先调用 list_characters 确认人物结构：文本样式可读整份人物设计；条目样式下，概览只是姓名与一句话索引，必须对本集/本次修订涉及的人物用 read_character 并指定 item_id 读取对应人物卡。不得只读概览或只调用 read_workspace_content（stage_id=character_design）就开始编写或修订。
- 当前剧情结构不足以确定剧集清单且用户没有明确给出时，不得猜测剧集结构。
- 批量初始化必须在一次 create_draft_sections 调用中提交全部待创建剧集，不得拆成多次单集调用。
- 初始化只新增空白剧集文件，不删除、不改名、不排序、不覆盖已有剧集。

分集写作标准：
- 写作或修订当前剧集前，按需读取当前集、相邻前文和上一集人物状态；严格执行已读取剧情内容中的任务、承接点和篇幅要求。
- 延续前文的时间、空间、人物关系、信息知情范围、物品位置、伤势和情绪，不重复已经完成的情节。
- 让冲突通过可被镜头呈现的人物行动、表演和对白推进，避免用小说化总结代替场面。
- 保持题材、风格和节奏一致；剧集结尾应完成本集任务，并为下一集留下明确承接点或观看动力。

写回规则：
- 运行时提供当前剧集时，省略 section_id 默认作用于该集；仍可为全剧任务显式指定其它稳定 section_id。file 参数决定写正文还是人物状态，默认是 body。
- 同一轮内先创建再写文时，必须使用创建结果给出的 section_id。
- 修改已有剧集名称时调用 rename_draft_section；不得用写入正文的方式伪造改名。
- 删除已有剧集时调用 delete_draft_section；正文至少保留一个剧集。排序仍由界面管理。
- 写入的只能是正式剧本正文或正式人物状态，不要混入分析过程、操作说明或工具记录。
- 需要技能时调用 load_skill；只有当前读取范围允许素材且确有必要时，才查询关联素材。

${SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS}`;

export const DEFAULT_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT = `你是墨枢的剧本分集写手智能体，是实际创作剧本正文的主要智能体。你与剧本正文专家共用正文读写、改名和删除工具，但不包含批量创建剧集；职责区别是：你一次只完成当前选中的这一集，不改动其它剧集。

写作前必须完成：
1. 根据用户本轮需求和本轮「当前剧情结构配置」，按需调用 read_workspace_content 读取相关剧情阶段（每次一个 stage_id，使用清单中的真实 id）；以被读取阶段的说明与正文作为写作依据，不要默认通读全部阶段，也不得臆造未出现在清单中的阶段名。
2. 调用 read_workspace_content（stage_id=draft）确认当前剧集在目录中的位置和相邻剧集 id。
3. 调用 read_draft_sections（mode=full）读取当前剧集，以及紧邻的前 2 到 3 个已有正文的剧集；读取紧邻上一集时，include 必须包含 character_state。任一文件返回非空 next_offset 时，必须用该 offset 继续分页，直至 next_offset=null 才算完整读取。
4. 只有用户明确要求跨集呼应或必须核对前文伏笔时，才扩大读取范围，并优先用 mode=preview 扫描。
5. 用户点名技能或写作方法时调用 load_skill；确需参考剧本素材时，调用 query_linked_material_entries 检索并读取相关条目。

人物设定：
- 编写或修订前先调用 list_characters 确认人物结构。
- 文本样式：可用 read_character 或 read_workspace_content（stage_id=character_design）读取整份人物设计。
- 条目样式：概览只维护姓名、定位与一句话摘要，不是完整人设。对本集出场或影响情节的人物，必须用 read_character 并指定 item_id 读取对应人物卡；不得只读概览或只读 character_design 阶段概览就开始编写。

写作标准：
- 严格执行当前剧集在已读取剧情内容中的任务、承接点和篇幅要求。
- 延续前文的时间、空间、人物关系、信息知情范围、物品位置、伤势和情绪，不重复已经完成的情节。
- 让冲突通过可被镜头呈现的人物行动、表演和对白推进，避免用小说化总结代替场面。
- 保持题材、风格和节奏一致；用户本轮要求优先于一般写作习惯。
- 剧集结尾应完成本集任务，并为下一集留下明确承接点或观看动力。

写回规则：
- 写入工具省略 section_id 时默认作用于当前选中剧集；你只能修改当前剧集。
- 当前正文为空时，调用 write_draft_section（file=body）写入完整剧本；已有内容只需局部修改时使用 replace_draft_section_text。
- 当前人物状态为空时调用 write_draft_section（file=character_state）；已有状态只需修改时用 replace_draft_section_text（file=character_state）。
- 用户要求修改当前剧集名称时，调用 rename_draft_section；只能改当前选中剧集，不改正文内容。
- 用户要求删除当前剧集时，调用 delete_draft_section；只能删除当前选中剧集，且正文至少保留一个剧集。
- 人物状态应记录本集结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一集接续点。
- 没有完成正文与人物状态的必要写回工具调用，本集不算完成。

${SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS}`;

export const DEFAULT_SCRIPT_WORKSPACE_AGENT_SYSTEM_PROMPTS: Record<
  ScriptWorkspaceAgentId,
  string
> = {
  character_design: DEFAULT_SCRIPT_CHARACTER_DESIGN_SYSTEM_PROMPT,
  plot_design: DEFAULT_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT,
  expert_draft_coordinator: DEFAULT_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT
};

function uniqueEnumValuesSchema<T extends string>(
  schema: z.ZodType<T>,
  maxLength: number,
  label: string
) {
  return z
    .array(schema)
    .max(maxLength)
    .superRefine((values, context) => {
      values.forEach((value, index) => {
        if (values.indexOf(value) !== index) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: `Duplicate ${label}: ${value}`
          });
        }
      });
    });
}

const UniqueScriptMaterialKindsSchema = uniqueEnumValuesSchema(
  ScriptMaterialKindSchema,
  SCRIPT_MATERIAL_KINDS.length,
  "material kind"
);
const UniqueScriptSkillKindsSchema = uniqueEnumValuesSchema(
  ScriptSkillKindSchema,
  SCRIPT_SKILL_KINDS.length,
  "skill kind"
);

export const ScriptAgentReadAccessSchema = z.object({
  material: UniqueScriptMaterialKindsSchema,
  skill: UniqueScriptSkillKindsSchema
}).strict();
export type ScriptAgentReadAccess = z.infer<typeof ScriptAgentReadAccessSchema>;

export const DEFAULT_SCRIPT_AGENT_READ_ACCESS: Record<
  ScriptWorkspaceAgentId,
  ScriptAgentReadAccess
> = {
  character_design: {
    material: ["character"],
    skill: ["general", "plot", "other"]
  },
  plot_design: {
    material: ["gimmick", "character", "plot"],
    skill: ["general", "plot", "other"]
  },
  expert_draft_coordinator: {
    material: ["character", "gimmick", "plot", "draft", "other"],
    skill: ["style", "general", "other"]
  }
};

export const DEFAULT_SCRIPT_WORKSPACE_AGENT_READ_ACCESS =
  DEFAULT_SCRIPT_AGENT_READ_ACCESS;

const ScriptSystemPromptSchema = z
  .string()
  .min(1)
  .max(200_000)
  .refine((value) => value.trim().length > 0, {
    message: "System prompt must contain non-whitespace text."
  });

export const ScriptWorkspaceStageSnapshotSchema = z
  .object({
    stageId: ScriptWorkspaceTextStageIdSchema,
    title: z.string().trim().min(1).max(240),
    content: z.string().max(SCRIPT_WORKSPACE_FILE_MAX_CHARACTERS),
    revision: z.string().regex(/^v1:\d+:[0-9a-f]{8}$/),
    truncated: z.boolean().optional(),
    originalLength: z
      .number()
      .int()
      .nonnegative()
      .max(SCRIPT_WORKSPACE_FILE_MAX_CHARACTERS)
      .optional()
  })
  .superRefine((value, context) => {
    if (
      value.truncated === true &&
      (value.originalLength === undefined ||
        value.originalLength <= value.content.length)
    ) {
      context.addIssue({
        code: "custom",
        path: ["originalLength"],
        message: "A truncated stage must report an originalLength larger than content."
      });
    }
    if (value.truncated !== true && value.originalLength !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["originalLength"],
        message: "An untruncated stage must omit originalLength."
      });
    }
  });
export type ScriptWorkspaceStageSnapshot = z.infer<
  typeof ScriptWorkspaceStageSnapshotSchema
>;

const ScriptCharacterItemSnapshotSchema = z
  .object({
    id: z.string().trim().min(1).max(512),
    title: z.string().trim().min(1).max(256),
    order: z.number().int().positive(),
    content: z.string().max(SCRIPT_WORKSPACE_FILE_MAX_CHARACTERS),
    revision: z.string().regex(/^v1:\d+:[0-9a-f]{8}$/),
    truncated: z.boolean().optional(),
    originalLength: z
      .number()
      .int()
      .nonnegative()
      .max(SCRIPT_WORKSPACE_FILE_MAX_CHARACTERS)
      .optional()
  })
  .superRefine((value, context) => {
    if (
      value.truncated === true &&
      (value.originalLength === undefined ||
        value.originalLength <= value.content.length)
    ) {
      context.addIssue({
        code: "custom",
        path: ["originalLength"],
        message: "A truncated character item must report its original length."
      });
    }
    if (value.truncated !== true && value.originalLength !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["originalLength"],
        message: "An untruncated character item must omit originalLength."
      });
    }
  });

const ScriptCharacterStructureSnapshotSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("text") }),
  z.object({
    format: z.literal("list"),
    items: z.array(ScriptCharacterItemSnapshotSchema).max(4_096)
  })
]);

const ScriptExpertDraftFileSnapshotSchema = z.object({
  documentId: z.string().trim().min(1).max(4_096),
  title: z.string().trim().min(1).max(256),
  content: z.string().max(SCRIPT_WORKSPACE_FILE_MAX_CHARACTERS),
  revision: z.string().regex(/^v1:\d+:[0-9a-f]{8}$/)
});

const ScriptExpertDraftSectionSnapshotSchema = z
  .object({
    id: DraftSectionIdSchema,
    title: DraftSectionTitleSchema,
    wordCountRequirement: z.string().max(1_000),
    body: ScriptExpertDraftFileSnapshotSchema,
    characterState: ScriptExpertDraftFileSnapshotSchema
  })
  .superRefine((value, context) => {
    if (value.body.documentId === value.characterState.documentId) {
      context.addIssue({
        code: "custom",
        path: ["characterState", "documentId"],
        message: "Script body and character state must use distinct files."
      });
    }
  });

const ScriptExpertDraftDirectorySnapshotSchema = z
  .object({
    id: z.literal("draft"),
    title: z.string().trim().min(1).max(240),
    revision: z.string().regex(/^v1:\d+:[0-9a-f]{8}$/),
    sections: z.array(ScriptExpertDraftSectionSnapshotSchema).min(1).max(100)
  })
  .superRefine((value, context) => {
    const sectionIds = value.sections.map((section) => section.id);
    sectionIds.forEach((sectionId, index) => {
      if (sectionIds.indexOf(sectionId) !== index) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: `Duplicate script episode id: ${sectionId}`
        });
      }
    });
    const documentIds = value.sections.flatMap((section) => [
      section.body.documentId,
      section.characterState.documentId
    ]);
    documentIds.forEach((documentId, index) => {
      if (documentIds.indexOf(documentId) !== index) {
        context.addIssue({
          code: "custom",
          path: [
            "sections",
            Math.floor(index / 2),
            index % 2 === 0 ? "body" : "characterState",
            "documentId"
          ],
          message: `Duplicate script document id: ${documentId}`
        });
      }
    });
  });

export const ScriptWorkspaceSnapshotSchema = z
  .object({
    id: z.string().trim().min(1).max(240),
    title: z.string().trim().min(1).max(240),
    categories: z.array(z.string().trim().min(1).max(120)).max(16),
    activeStageId: ScriptWorkspaceStageIdSchema,
    activeAgentId: ScriptWorkspaceAgentIdSchema.optional(),
    activeSectionId: z.string().trim().min(1).max(120).optional(),
    plotStages: CreativePlotStagesSchema,
    characterStructure: ScriptCharacterStructureSnapshotSchema.default({
      format: "text"
    }),
    expertDraft: ScriptExpertDraftDirectorySnapshotSchema,
    stages: z.array(ScriptWorkspaceStageSnapshotSchema).min(2).max(33)
  })
  .superRefine((value, context) => {
    const stageIds = value.stages.map((stage) => stage.stageId);
    stageIds.forEach((stageId, index) => {
      if (stageIds.indexOf(stageId) !== index) {
        context.addIssue({
          code: "custom",
          path: ["stages", index, "stageId"],
          message: `Duplicate script workspace stage snapshot: ${stageId}`
        });
      }
    });
    const expectedStageIds = [
      "character_design",
      ...value.plotStages.map((stage) => stage.id)
    ];
    if (
      expectedStageIds.length !== stageIds.length ||
      expectedStageIds.some((stageId, index) => stageIds[index] !== stageId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message:
          "Script text stages must contain character design followed by configured plot stages."
      });
    }
    if (value.activeStageId !== "draft" && !stageIds.includes(value.activeStageId)) {
      context.addIssue({
        code: "custom",
        path: ["activeStageId"],
        message: "Active stage must be present in the script workspace snapshot."
      });
    }

    if (value.activeStageId !== "draft") {
      const defaultAgentId = resolveScriptWorkspaceAgentIdForStage(
        value.activeStageId
      );
      if (
        value.activeAgentId !== undefined &&
        value.activeAgentId !== defaultAgentId
      ) {
        context.addIssue({
          code: "custom",
          path: ["activeAgentId"],
          message: `Stage ${value.activeStageId} must use its default agent ${defaultAgentId}.`
        });
      }
      if (value.activeSectionId !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["activeSectionId"],
          message: "Only the script draft stage may target an episode."
        });
      }
      return;
    }

    if (
      value.activeAgentId !== undefined &&
      value.activeAgentId !== "expert_draft_coordinator"
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeAgentId"],
        message: "The script draft stage must use the draft coordinator agent."
      });
      return;
    }
    if (value.activeSectionId === undefined) return;
    if (
      !value.expertDraft.sections.some(
        (section) => section.id === value.activeSectionId
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["activeSectionId"],
        message: `Unknown script episode: ${value.activeSectionId}`
      });
    }
  });
export type ScriptWorkspaceSnapshot = z.infer<
  typeof ScriptWorkspaceSnapshotSchema
>;

export const SCRIPT_AGENT_WELCOME_SHORTCUT_MAX_LENGTH = 120;
export const ScriptAgentWelcomeShortcutsSchema = z.tuple([
  z.string().trim().min(1).max(SCRIPT_AGENT_WELCOME_SHORTCUT_MAX_LENGTH),
  z.string().trim().min(1).max(SCRIPT_AGENT_WELCOME_SHORTCUT_MAX_LENGTH),
  z.string().trim().min(1).max(SCRIPT_AGENT_WELCOME_SHORTCUT_MAX_LENGTH)
]);
export type ScriptAgentWelcomeShortcuts = z.infer<
  typeof ScriptAgentWelcomeShortcutsSchema
>;

export const DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS = {
  character_design: [
    "帮我从零创建一组剧本人物",
    "检查当前人设是否适合镜头呈现",
    "完善人物关系和人物弧光"
  ],
  plot_design: [
    "根据当前人设设计一条主线剧情",
    "检查剧情因果和转折是否成立",
    "把当前剧情细化成可拆场的节拍"
  ],
  expert_draft_coordinator: [
    "根据剧情结构初始化剧集目录",
    "按照剧情结构写当前剧集",
    "审阅并统一修订当前剧本"
  ]
} as const satisfies Record<ScriptWorkspaceAgentId, ScriptAgentWelcomeShortcuts>;

export const ScriptWorkspaceAgentProfileSchema = z.object({
  id: ScriptWorkspaceAgentIdSchema,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_000),
  systemPrompt: ScriptSystemPromptSchema,
  welcomeShortcuts: ScriptAgentWelcomeShortcutsSchema,
  readAccess: ScriptAgentReadAccessSchema
});
export type ScriptWorkspaceAgentProfile = z.infer<
  typeof ScriptWorkspaceAgentProfileSchema
>;

export const DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES: readonly ScriptWorkspaceAgentProfile[] = [
  {
    id: "character_design",
    label: "剧本人物",
    description: "创建、补全和修改可供场面调度、行动与对白直接使用的人物设计。",
    systemPrompt: DEFAULT_SCRIPT_CHARACTER_DESIGN_SYSTEM_PROMPT,
    welcomeShortcuts: [...DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS.character_design],
    readAccess: DEFAULT_SCRIPT_AGENT_READ_ACCESS.character_design
  },
  {
    id: "plot_design",
    label: "剧本剧情",
    description: "负责当前作品动态配置的全部剧情结构阶段。",
    systemPrompt: DEFAULT_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT,
    welcomeShortcuts: [...DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS.plot_design],
    readAccess: DEFAULT_SCRIPT_AGENT_READ_ACCESS.plot_design
  },
  {
    id: "expert_draft_coordinator",
    label: "剧本正文专家",
    description: "统一负责剧集结构、全剧创作、当前剧集写作与跨集修订。",
    systemPrompt: DEFAULT_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT,
    welcomeShortcuts: [
      ...DEFAULT_SCRIPT_AGENT_WELCOME_SHORTCUTS.expert_draft_coordinator
    ],
    readAccess: DEFAULT_SCRIPT_AGENT_READ_ACCESS.expert_draft_coordinator
  }
];

function validateCompleteScriptAgentSet(
  agents: readonly { id: ScriptWorkspaceAgentId }[],
  context: z.core.$RefinementCtx<unknown>
): void {
  const ids = agents.map((agent) => agent.id);
  ids.forEach((id, index) => {
    if (ids.indexOf(id) !== index) {
      context.addIssue({
        code: "custom",
        path: ["agents", index, "id"],
        message: `Duplicate script workspace agent profile: ${id}`
      });
    }
  });
}

export const ScriptWorkspaceAgentSettingsSchema = z
  .object({
    workspaceType: z.literal("script"),
    agents: z
      .array(ScriptWorkspaceAgentProfileSchema)
      .length(SCRIPT_WORKSPACE_AGENT_IDS.length)
  })
  .superRefine((value, context) =>
    validateCompleteScriptAgentSet(value.agents, context)
  );
export type ScriptWorkspaceAgentSettings = z.infer<
  typeof ScriptWorkspaceAgentSettingsSchema
>;

export const ScriptWorkspaceAgentSettingsInputAgentSchema = z.object({
  id: ScriptWorkspaceAgentIdSchema,
  systemPrompt: ScriptSystemPromptSchema,
  welcomeShortcuts: ScriptAgentWelcomeShortcutsSchema,
  readAccess: ScriptAgentReadAccessSchema
});
export type ScriptWorkspaceAgentSettingsInputAgent = z.infer<
  typeof ScriptWorkspaceAgentSettingsInputAgentSchema
>;

export const ScriptWorkspaceAgentSettingsInputSchema = z
  .object({
    workspaceType: z.literal("script"),
    agents: z
      .array(ScriptWorkspaceAgentSettingsInputAgentSchema)
      .length(SCRIPT_WORKSPACE_AGENT_IDS.length)
  })
  .superRefine((value, context) =>
    validateCompleteScriptAgentSet(value.agents, context)
  );
export type ScriptWorkspaceAgentSettingsInput = z.infer<
  typeof ScriptWorkspaceAgentSettingsInputSchema
>;

export const DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS: ScriptWorkspaceAgentSettings = {
  workspaceType: "script",
  agents: [...DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES]
};
