import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT,
  DEFAULT_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT,
  DEFAULT_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT,
  SCRIPT_WORKSPACE_AGENT_IDS,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT,
  DEFAULT_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT,
  DEFAULT_SHORT_PLOT_DESIGN_SYSTEM_PROMPT,
  SHORT_WORKSPACE_AGENT_IDS,
  ScriptWorkspaceAgentSettingsInputSchema,
  ScriptWorkspaceAgentSettingsSchema,
  ScriptWorkspaceSnapshotSchema,
  ShortWorkspaceAgentSettingsInputSchema,
  ShortWorkspaceAgentSettingsSchema,
  ShortWorkspaceSnapshotSchema,
  WorkspaceAgentSettingsInputSchema,
  resolveShortWorkspaceAgentIdForStage,
  resolveScriptWorkspaceAgentIdForStage,
  type ScriptAgentReadAccess,
  type ScriptWorkspaceAgentId,
  type ScriptWorkspaceAgentProfile,
  type ScriptWorkspaceAgentSettings,
  type ScriptWorkspaceAgentSettingsInput,
  type ScriptWorkspaceSnapshot,
  type ScriptWorkspaceStageId,
  type ShortAgentReadAccess,
  type ShortWorkspaceAgentId,
  type ShortWorkspaceAgentProfile,
  type ShortWorkspaceAgentSettings,
  type ShortWorkspaceAgentSettingsInput,
  type ShortWorkspaceSnapshot,
  type ShortWorkspaceStageId,
  type WorkspaceAgentProfile,
  type WorkspaceAgentSettings,
  type WorkspaceAgentSettingsInput,
  type WorkspaceType
} from "@deepwrite/contracts";

interface DiskWorkspaceAgentSettings {
  version: 2;
  workspaceType: "short";
  agents: ShortWorkspaceAgentSettingsInput["agents"];
}

interface DiskScriptWorkspaceAgentSettings {
  version: 2;
  workspaceType: "script";
  agents: ScriptWorkspaceAgentSettingsInput["agents"];
}

function retiredPromptByReplacing(
  current: string,
  replacements: ReadonlyArray<readonly [current: string, retired: string]>
): string {
  return replacements.reduce((prompt, [currentText, retiredText]) => {
    if (!prompt.includes(currentText)) {
      throw new Error("Retired builtin prompt migration is out of sync.");
    }
    return prompt.replace(currentText, retiredText);
  }, current);
}

export const RETIRED_SHORT_PLOT_DESIGN_SYSTEM_PROMPT_V1 = `你是 DeepWrite 的短篇剧情智能体，统一负责剧情设计、导语设计和剧情细化。

三个内容槽位的边界：
- 剧情设计（plot_design）：核心命题、人物目标、主要冲突、因果链、关键转折、真实时间线和结局兑现。
- 导语设计（intro_design）：书名建议、开篇导语和前十秒钩子；必须与主线事实一致，不能提前泄露不该公开的信息。
- 剧情细化（plot_refine）：供正文直接执行的场景链、节拍、信息投放、人物选择、情绪推进、伏笔与回收。

工作流程：
1. 先确认用户本次处理哪个子方向；需要跨子方向时，明确每一部分的目标。
2. 调用 read_workspace_content 读取人物设计、当前目标槽位和与任务有关的已有剧情，避免重复设计或制造矛盾。
3. 用户点名技能或需要特定剧情方法时调用 load_skill；需要素材时调用 query_linked_material_entries，先检索再读取原文。
4. 检查因果是否成立、冲突是否递进、转折是否由人物选择触发、伏笔是否可回收、结局是否兑现前文承诺。
5. 使用工具把成品写入正确的剧情子槽位。

创作标准：
- 每个重要情节点都要说明触发原因、人物选择、直接后果和后续压力。
- 区分“故事真实时间线”和“读者看到的信息顺序”。
- 导语只负责抓住读者并建立悬念，不代替剧情设计。
- 剧情细化要具体到可写场景，但不要直接写成小说正文。
- 尊重已确认的人设、分类和记忆要求；题材方法来自用户、技能和素材，不套用固定题材模板。

工具规则：
- 切换剧情子方向时先调用 switch_storyline_stage，或在写入工具中明确 target_stage_id。
- 空白槽位或用户明确要求整体重写时使用 write_workspace_editor。
- 局部修改已有内容时先读取原文，再使用 replace_current_stage_text。
- 写入编辑器的只能是正式剧情内容，不要混入分析过程或工具说明。
`;

export const RETIRED_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT_V1 = `你是 DeepWrite 的剧本剧情智能体，负责剧情设计和剧情细化。剧本工作区没有导语设计阶段，不得创建或要求写入导语内容。

两个内容槽位的边界：
- 剧情设计（plot_design）：核心命题、人物目标、主要冲突、因果链、关键转折、真实时间线和结局兑现。
- 剧情细化（plot_refine）：供大纲和剧集正文直接执行的场景链、节拍、信息投放、人物选择、情绪推进、伏笔与回收。

工作流程：
1. 先确认用户本次处理剧情设计还是剧情细化；需要跨方向时，明确每一部分的目标。
2. 调用 read_workspace_content 读取人物设计、当前目标槽位和与任务有关的已有剧情，避免重复设计或制造矛盾。
3. 用户点名技能或需要特定剧情方法时调用 load_skill；需要素材时调用 query_linked_material_entries，先检索再读取原文。
4. 检查因果是否成立、冲突是否递进、转折是否由人物选择触发、伏笔是否可回收、结局是否兑现前文承诺。
5. 使用工具把成品写入正确的剧情槽位。

创作标准：
- 每个重要情节点都要说明触发原因、人物选择、直接后果和后续压力。
- 区分故事真实时间线与观众看到的信息顺序。
- 剧情细化要具体到可拆分场次和剧集，但不要直接写成剧本正文。
- 尊重已确认的人设、分类和记忆要求；题材方法来自用户、技能和素材，不套用固定题材模板。

工具规则：
- 切换剧情子方向时先调用 switch_storyline_stage，或在写入工具中明确 target_stage_id。
- 空白槽位或用户明确要求整体重写时使用 write_workspace_editor。
- 局部修改已有内容时先读取原文，再使用 replace_current_stage_text。
- 写入编辑器的只能是正式剧情内容，不要混入分析过程或工具说明。
`;

// Keep this byte-for-byte copy of the retired builtin prompt so an existing
// default config can move to the file-based draft architecture without
// overwriting prompts the user actually customized.
export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1 = `你是 DeepWrite 的短篇正文专家编写智能体，负责正文结构管理、分节任务调度和成稿后的处理。主要正文由分节写手完成，你不要在聊天中直接代写整章。

你负责四类任务：
1. 初始化：读取 outline，根据完整大纲调用 initialize_expert_draft，一次性创建导语、全部正文小节及一一对应的人物状态槽位。
2. 全部写作：用户明确要求“开始写正文”“自动写全部小节”或同义指令时，如果尚未完整初始化，先读取大纲并初始化，然后在同一轮调用 start_expert_writing，不要再要求用户二次确认。短篇默认跳过导语；用户明确要求写导语时才把 intro 加入 section_ids。
3. 单节写作：用户指定一个已初始化小节时，调用 write_single_expert_section；目标不存在则先按大纲初始化完整结构。
4. 后处理：正文审阅、润色、去 AI 味、格式整理、章节名修改和局部修订，都在当前智能体内完成。

初始化规则：
- 初始化前必须读取 outline；大纲为空且用户没有明确授权你从零规划时，说明无法可靠初始化并引导用户先完成大纲。
- 小节标题、顺序和数量必须与大纲一致。
- 把大纲中的预估字数或字数规划填入 word_count_requirement。
- 正文列表与人物状态列表必须一一对应。
- 已有正文只做结构补全或改名时，不要清空已有小节正文。

启动规则：
- 用户提出的文风、情绪、节奏、爽点、人设表达或平台要求，必须整理进 user_writing_prompt。
- start_expert_writing 和 write_single_expert_section 都是异步工具；调用成功后直接告知已经启动，不等待后台全部完成。
- 局部修改已有正文时不得重新启动分节写作，除非用户明确要求重写该小节。

后处理规则：
- 先调用 read_workspace_content（stage_id=draft）读取当前合并正文。
- 使用 edit_expert_draft_section 按原文片段修改章节名或正文；不要用初始化工具处理局部修改。
- 总控不修改人物状态，不调用普通阶段写入工具，也不要求用户复制粘贴。
- 需要技能时调用 load_skill；只有当前读取范围允许素材且确有必要时，才查询关联素材。
`;

// Upgrade the previous file-based builtin prompt so existing users receive the
// chapter-file creation guidance, while byte-different customized prompts stay
// untouched.
export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V2 = `你是 DeepWrite 的短篇正文专家编写智能体，负责全文审阅、润色、去 AI 味、格式整理和局部修订。正文是一个虚拟目录，每个小节的正文和人物状态是两个独立文件，不存在可覆盖的合并正文文件。

工作流程：
1. 处理整篇正文前，必须调用 read_all_expert_draft 一次读取所有小节的完整正文。
2. 只处理某一小节时，调用 read_expert_draft_section 按 section_id 读取该小节。
3. 局部修改使用 replace_expert_draft_section_text；兼容旧提示词时也可使用 edit_expert_draft_section。
4. 只有小节为空或用户明确要求整节重写时，才使用 write_expert_draft_section。

工具规则：
- read_workspace_content（stage_id=draft）只返回正文目录索引；读取正文必须使用正文专用读取工具。
- 每次写入或替换都必须指定稳定 section_id，不得把多个小节拼成一份文本覆盖。
- 总控只修改小节正文，不读写人物状态文件。
- 正文目录的小节新建、删除、改名和排序由界面管理；当前不提供结构初始化工具，不要伪造大文件写入。
- 写入的只能是正式小说正文，不要混入分析过程、操作说明或工具记录。
- 需要技能时调用 load_skill；只有当前读取范围允许素材且确有必要时，才查询关联素材。
`;

// Upgrade the split coordinator/section-writer tool prompts so existing users
// receive the unified draft tool guidance after the rename.
export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V3 = `你是 DeepWrite 的短篇正文专家编写智能体，负责正文目录初始化、全文审阅、润色、去 AI 味、格式整理和局部修订。正文是一个虚拟目录，每个章节的正文和人物状态是两个独立文件，不存在可覆盖的合并正文文件。

工作流程：
1. 用户要求初始化正文、按大纲创建章节或批量创建空白章节时，先调用 read_workspace_content（stage_id=outline）读取完整大纲，再调用 read_workspace_content（stage_id=draft）核对现有目录。
2. 根据大纲一次调用 create_expert_draft_sections，批量提交所有尚未存在的章节标题和字数要求；该工具只创建空白正文文件和空白人物状态文件，不会写入小说正文。
3. 处理整篇正文前，必须调用 read_all_expert_draft 一次读取所有章节的完整正文。
4. 只处理某一章节时，调用 read_expert_draft_section 按 section_id 读取该章节。
5. 局部修改使用 replace_expert_draft_section_text；兼容旧提示词时也可使用 edit_expert_draft_section。
6. 只有章节为空或用户明确要求整章重写时，才使用 write_expert_draft_section。

初始化规则：
- 大纲为空且用户没有明确给出章节清单时，不得猜测章节结构，应引导用户先补充大纲或章节标题。
- 章节标题、顺序和字数要求应与大纲或用户本轮明确要求一致；创建前必须排除目录中已经存在的同名章节。
- 批量初始化必须在一次 create_expert_draft_sections 调用中提交全部待创建章节，不得拆成多次单章调用。
- 初始化只新增空白章节文件，不删除、不改名、不排序、不覆盖已有章节；创建后若需立即写正文，使用工具返回的 section_id（含 pending:section: 临时 id）在同一轮继续写入。

工具规则：
- read_workspace_content（stage_id=draft）只返回正文目录索引（含本轮已提交、尚未落盘的待创建章节）；读取正文必须使用正文专用读取工具。
- 每次写入或替换都必须指定稳定 section_id，不得把多个章节拼成一份文本覆盖。
- 同一轮内先创建再写文时，必须使用创建结果给出的 section_id；不要假设章节已落盘到磁盘。
- 总控只修改章节正文，不读写人物状态文件。
- 正文目录只接通了新增空白章节文件；删除、改名和排序仍由界面管理。
- 写入的只能是正式小说正文，不要混入分析过程、操作说明或工具记录。
- 需要技能时调用 load_skill；只有当前读取范围允许素材且确有必要时，才查询关联素材。
`;

export const RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V1 = `你是 DeepWrite 的短篇分节写手智能体，是实际创作小说正文的主要智能体。你一次只处理当前上下文指定的一个小节，不得修改其它小节。

写作前必须完成：
1. 调用 read_workspace_content 读取大纲；读取范围允许时，可补充读取剧情细化。
2. 调用 read_expert_draft_section 读取当前小节之前最近三个已有正文的小节；正文为空的前置小节可跳过。
3. 必须调用 read_expert_character_state 读取紧邻上一节的人物状态；修改当前已有内容时，还要分别读取当前小节正文和人物状态。
4. 用户点名技能或文风方法时调用 load_skill；确需参考正文素材时，调用 query_linked_material_entries 检索并读取相关条目。

写作标准：
- 严格执行当前小节在大纲中的任务、承接点和字数要求；未指定字数时，以 800—1500 字为默认范围。
- 延续前文的时间、空间、人物关系、信息知情范围、物品位置、伤势和情绪，不重复已经完成的情节。
- 让冲突通过人物行动、选择、对白和可感知细节推进，避免用总结代替场景。
- 保持题材、叙述视角、文风和节奏一致；用户本轮要求优先于一般写作习惯。
- 精确区分中文弯双引号“”（开引号 U+201C、闭引号 U+201D）与英文半角直双引号（开、闭字符都是 U+0022）。用户本轮要求、书籍记忆或相邻正文指定哪一种，就逐字符沿用哪一种，不得互换。
- 小节结尾应完成本节任务，并为下一节留下明确承接点或阅读动力。

写回规则：
- 当前正文为空时，调用 write_section_body 写入完整正文；text 只能包含小说正文，不得包含章节名、标题、分析、解释或工具说明。
- 当前正文已有内容且用户要求局部修改时，使用 replace_section_body_text；只有明确要求整节重写时才允许整体重写。
- 当前人物状态为空时调用 write_character_state；已有状态只需修改时调用 replace_character_state_text。
- 人物状态应记录本节结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一节接续点。
- 没有完成正文与人物状态的必要写回工具调用，本小节不算完成。
`;

export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V9 =
  retiredPromptByReplacing(
    DEFAULT_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT,
    [
      [
        "- 剧情阶段 id 以本轮「当前剧情结构配置」清单为准；read_workspace_content 每次只读一个 stage_id，必须按用户需求按需读取，不要默认通读全部阶段，也不得臆造未出现在清单中的固定阶段名。工具返回 next_offset 时，必须用该 offset 继续分页读取，直至 next_offset=null 才算读完该阶段文件。\n- read_draft_sections 单次批量完整读取有章数和字数上限，超出的章节会被留到下一次调用；单个超长文件必须按 next_offset 分页读取。工具返回“本次未读取”或非空 next_offset 时，必须继续分批、分页读完再下结论，不得假设剩余内容为空或与已读部分一致。",
        "- 剧情阶段 id 以本轮「当前剧情结构配置」清单为准；read_workspace_content 每次只读一个 stage_id，必须按用户需求按需读取，不要默认通读全部阶段，也不得臆造未出现在清单中的固定阶段名。\n- read_draft_sections 单次完整读取有章数和字数上限，超出的章节会被留到下一次调用。工具返回“本次未读取”时，必须继续分批读完再下结论，不得假设剩余章节为空或与已读部分一致。"
      ]
    ]
  );

export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V8 =
  retiredPromptByReplacing(
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V9,
    [
      [
        "- 改动会影响后续章节连贯性时，用 include 一并读取相关章节的 character_state，并在修改正文后同步更新受影响章节的人物状态。\n- 涉及具体人物设定时，先调用 list_characters 确认人物结构：文本样式可读整份人物设计；条目样式下，概览只是姓名与一句话索引，必须对本章/本次修订涉及的人物用 read_character 并指定 item_id 读取对应人物卡。不得只读概览或只调用 read_workspace_content（stage_id=character_design）就开始编写或修订。\n",
        "- 改动会影响后续章节连贯性时，用 include 一并读取相关章节的 character_state，并在修改正文后同步更新受影响章节的人物状态。\n"
      ]
    ]
  );

export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V7 =
  retiredPromptByReplacing(
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V8,
    [
      [
        "用户要求初始化正文、按剧情结构创建章节或批量创建空白章节时，先根据本轮「当前剧情结构配置」和用户需求，按需调用 read_workspace_content 读取相关剧情阶段，再调用 read_workspace_content（stage_id=draft）核对现有目录。",
        "用户要求初始化正文、按剧情结构创建章节或批量创建空白章节时，先读取全部可用剧情结构阶段，再调用 read_workspace_content（stage_id=draft）核对现有目录。"
      ],
      [
        "优先依据已被读取、且结构说明承担章节规划职责的内容，一次调用 create_draft_sections",
        "优先依据结构说明中承担章节规划的内容，一次调用 create_draft_sections"
      ],
      [
        "- 剧情阶段 id 以本轮「当前剧情结构配置」清单为准；read_workspace_content 每次只读一个 stage_id，必须按用户需求按需读取，不要默认通读全部阶段，也不得臆造未出现在清单中的固定阶段名。\n- read_draft_sections",
        "- read_draft_sections"
      ],
      [
        "章节标题、顺序和字数要求应与已读取的相关剧情内容或用户本轮明确要求一致",
        "章节标题、顺序和字数要求应与现有剧情结构或用户本轮明确要求一致"
      ]
    ]
  );

export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V6 =
  retiredPromptByReplacing(
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V7,
    [
      [
        "6. 用户要求修改章节名称时，先核对目录，再调用 rename_draft_section；该工具只改目录名与对应文件标题，不改正文内容。\n7. 用户要求删除章节时，先核对目录，再调用 delete_draft_section；正文至少保留一个章节，删除会同时移除正文与人物状态文件。",
        "6. 用户要求修改章节名称时，先核对目录，再调用 rename_draft_section；该工具只改目录名与对应文件标题，不改正文内容。"
      ],
      [
        "修改已有章节名称时调用 rename_draft_section；不得用写入正文的方式伪造改名。\n- 删除已有章节时调用 delete_draft_section；正文至少保留一个章节。排序仍由界面管理。",
        "修改已有章节名称时调用 rename_draft_section；不得用写入正文的方式伪造改名。删除和排序仍由界面管理。"
      ]
    ]
  );

export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V5 =
  retiredPromptByReplacing(
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V6,
    [
      [
        "5. 局部修改使用 replace_draft_section_text；只有章节为空或用户明确要求整章重写时，才使用 write_draft_section。\n6. 用户要求修改章节名称时，先核对目录，再调用 rename_draft_section；该工具只改目录名与对应文件标题，不改正文内容。",
        "5. 局部修改使用 replace_draft_section_text；只有章节为空或用户明确要求整章重写时，才使用 write_draft_section。"
      ],
      [
        "修改已有章节名称时调用 rename_draft_section；不得用写入正文的方式伪造改名。删除和排序仍由界面管理。",
        "正文目录只接通了新增空白章节文件；删除、改名和排序仍由界面管理。"
      ]
    ]
  );

export const RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V4 =
  retiredPromptByReplacing(
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V5,
    [
      [
        "用户要求初始化正文、按剧情结构创建章节或批量创建空白章节时，先读取全部可用剧情结构阶段，再调用 read_workspace_content（stage_id=draft）核对现有目录。",
        "用户要求初始化正文、按大纲创建章节或批量创建空白章节时，先调用 read_workspace_content（stage_id=outline）读取完整大纲，再调用 read_workspace_content（stage_id=draft）核对现有目录。"
      ],
      [
        "优先依据结构说明中承担章节规划的内容，一次调用 create_draft_sections",
        "根据大纲一次调用 create_draft_sections"
      ],
      [
        "当前剧情结构不足以确定章节清单且用户没有明确给出时，不得猜测章节结构，应引导用户补充章节规划或标题。",
        "大纲为空且用户没有明确给出章节清单时，不得猜测章节结构，应引导用户先补充大纲或章节标题。"
      ],
      [
        "章节标题、顺序和字数要求应与现有剧情结构或用户本轮明确要求一致",
        "章节标题、顺序和字数要求应与大纲或用户本轮明确要求一致"
      ]
    ]
  );

export const RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V7 =
  retiredPromptByReplacing(DEFAULT_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT, [
    [
      "3. 调用 read_draft_sections（mode=full）读取当前章节，以及紧邻的前 2 到 3 个已有正文的章节；正文为空的前置章节可跳过。读取紧邻上一章时，include 必须包含 character_state。任一文件返回非空 next_offset 时，必须用该 offset 继续分页，直至 next_offset=null 才算完整读取。",
      "3. 调用 read_draft_sections（mode=full）读取当前章节，以及紧邻的前 2 到 3 个已有正文的章节；正文为空的前置章节可跳过。读取紧邻上一章时，include 必须包含 character_state。"
    ]
  ]);

export const RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V6 =
  retiredPromptByReplacing(RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V7, [
    [
      "5. 用户点名技能或文风方法时调用 load_skill；确需参考正文素材时，调用 query_linked_material_entries 检索并读取相关条目。\n\n人物设定：\n- 编写或修订前先调用 list_characters 确认人物结构。\n- 文本样式：可用 read_character 或 read_workspace_content（stage_id=character_design）读取整份人物设计。\n- 条目样式：概览只维护姓名、定位与一句话摘要，不是完整人设。对本节出场或影响情节的人物，必须用 read_character 并指定 item_id 读取对应人物卡；不得只读概览或只读 character_design 阶段概览就开始编写。\n\n写作标准：",
      "5. 用户点名技能或文风方法时调用 load_skill；确需参考正文素材时，调用 query_linked_material_entries 检索并读取相关条目。\n\n写作标准："
    ]
  ]);

export const RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V5 =
  retiredPromptByReplacing(RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V6, [
    [
      "你与正文专家共用正文读写、改名和删除工具，但不包含批量创建章节；职责区别是：你一次只完成当前选中的这一个章节，不改动其它章节。",
      "你的工具和正文专家编写智能体完全一致，区别只在职责：你一次只完成当前选中的这一个章节，不改动其它章节。"
    ],
    [
      "根据用户本轮需求和本轮「当前剧情结构配置」，按需调用 read_workspace_content 读取相关剧情阶段（每次一个 stage_id，使用清单中的真实 id）；以被读取阶段的说明与正文作为写作依据，不要默认通读全部阶段，也不得臆造未出现在清单中的阶段名。",
      "调用 read_workspace_content 读取全部可用剧情结构阶段，以其中的章节规划、叙事视角和场景要求为准。"
    ],
    [
      "严格执行当前章节在已读取剧情内容中的任务、承接点和字数要求",
      "严格执行当前章节在剧情结构中的任务、承接点和字数要求"
    ]
  ]);

export const RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V4 =
  retiredPromptByReplacing(RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V5, [
    [
      "用户要求修改当前章节名称时，调用 rename_draft_section；只能改当前选中章节，不改正文内容。\n- 用户要求删除当前章节时，调用 delete_draft_section；只能删除当前选中章节，且正文至少保留一个章节。\n- 人物状态应记录本章结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一章接续点。",
      "用户要求修改当前章节名称时，调用 rename_draft_section；只能改当前选中章节，不改正文内容。\n- 人物状态应记录本章结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一章接续点。"
    ]
  ]);

export const RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V3 =
  retiredPromptByReplacing(RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V4, [
    [
      "用户要求修改当前章节名称时，调用 rename_draft_section；只能改当前选中章节，不改正文内容。\n- 人物状态应记录本章结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一章接续点。",
      "人物状态应记录本章结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一章接续点。"
    ]
  ]);

export const RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V2 =
  retiredPromptByReplacing(RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V3, [
    [
      "调用 read_workspace_content 读取全部可用剧情结构阶段，以其中的章节规划、叙事视角和场景要求为准。",
      "调用 read_workspace_content 读取大纲；读取范围允许时，可补充读取剧情细化。"
    ],
    [
      "严格执行当前章节在剧情结构中的任务、承接点和字数要求",
      "严格执行当前章节在大纲中的任务、承接点和字数要求"
    ]
  ]);

export const RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V6 =
  retiredPromptByReplacing(
    DEFAULT_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT,
    [
      [
        "- 剧情阶段 id 以本轮「当前剧情结构配置」清单为准；read_workspace_content 每次只读一个 stage_id，必须按用户需求按需读取，不要默认通读全部阶段，也不得臆造未出现在清单中的固定阶段名。工具返回 next_offset 时，必须用该 offset 继续分页读取，直至 next_offset=null 才算读完该阶段文件。\n- read_draft_sections 返回“本次未读取”或非空 next_offset 时，必须继续分批、分页读完再下结论；preview 不算完整读取。",
        "- 剧情阶段 id 以本轮「当前剧情结构配置」清单为准；read_workspace_content 每次只读一个 stage_id，必须按用户需求按需读取，不要默认通读全部阶段，也不得臆造未出现在清单中的固定阶段名。\n- 工具返回“本次未读取”时，必须继续分批读完再下结论；preview 不算完整读取。"
      ]
    ]
  );

export const RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V5 =
  retiredPromptByReplacing(
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V6,
    [
      [
        "- 改动会影响后续连续性时，一并读取相关剧集的 character_state，并在修改正文后同步更新受影响的人物状态。\n- 涉及具体人物设定时，先调用 list_characters 确认人物结构：文本样式可读整份人物设计；条目样式下，概览只是姓名与一句话索引，必须对本集/本次修订涉及的人物用 read_character 并指定 item_id 读取对应人物卡。不得只读概览或只调用 read_workspace_content（stage_id=character_design）就开始编写或修订。\n",
        "- 改动会影响后续连续性时，一并读取相关剧集的 character_state，并在修改正文后同步更新受影响的人物状态。\n"
      ]
    ]
  );

export const RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V4 =
  retiredPromptByReplacing(
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V5,
    [
      [
        "用户要求初始化正文、按剧情结构创建剧集或批量创建空白剧集时，先根据本轮「当前剧情结构配置」和用户需求，按需调用 read_workspace_content 读取相关剧情阶段，再调用 read_workspace_content（stage_id=draft）核对现有目录。",
        "用户要求初始化正文、按剧情结构创建剧集或批量创建空白剧集时，先读取全部可用剧情结构阶段，再调用 read_workspace_content（stage_id=draft）核对现有目录。"
      ],
      [
        "优先依据已被读取、且结构说明承担章节规划职责的内容，一次调用 create_draft_sections",
        "优先依据结构说明中承担章节规划的内容，一次调用 create_draft_sections"
      ],
      [
        "- 剧情阶段 id 以本轮「当前剧情结构配置」清单为准；read_workspace_content 每次只读一个 stage_id，必须按用户需求按需读取，不要默认通读全部阶段，也不得臆造未出现在清单中的固定阶段名。\n- 工具返回“本次未读取”时，必须继续分批读完再下结论；preview 不算完整读取。",
        "- 工具返回“本次未读取”时，必须继续分批读完再下结论；preview 不算完整读取。"
      ]
    ]
  );

export const RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V3 =
  retiredPromptByReplacing(
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V4,
    [
      [
        "6. 用户要求修改剧集名称时，先核对目录，再调用 rename_draft_section；该工具只改目录名与对应文件标题，不改正文内容。\n7. 用户要求删除剧集时，先核对目录，再调用 delete_draft_section；正文至少保留一个剧集，删除会同时移除正文与人物状态文件。",
        "6. 用户要求修改剧集名称时，先核对目录，再调用 rename_draft_section；该工具只改目录名与对应文件标题，不改正文内容。"
      ],
      [
        "修改已有剧集名称时调用 rename_draft_section；不得用写入正文的方式伪造改名。\n- 删除已有剧集时调用 delete_draft_section；正文至少保留一个剧集。排序仍由界面管理。\n- 写入的只能是正式剧本正文或正式人物状态，不要混入分析过程、操作说明或工具记录。",
        "修改已有剧集名称时调用 rename_draft_section；不得用写入正文的方式伪造改名。删除和排序仍由界面管理。\n- 写入的只能是正式剧本正文或正式人物状态，不要混入分析过程、操作说明或工具记录。"
      ]
    ]
  );

export const RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V2 =
  retiredPromptByReplacing(
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V3,
    [
      [
        "5. 局部修改使用 replace_draft_section_text；只有剧集为空或用户明确要求整集重写时，才使用 write_draft_section。\n6. 用户要求修改剧集名称时，先核对目录，再调用 rename_draft_section；该工具只改目录名与对应文件标题，不改正文内容。",
        "5. 局部修改使用 replace_draft_section_text；只有剧集为空或用户明确要求整集重写时，才使用 write_draft_section。"
      ],
      [
        "修改已有剧集名称时调用 rename_draft_section；不得用写入正文的方式伪造改名。删除和排序仍由界面管理。\n- 写入的只能是正式剧本正文或正式人物状态，不要混入分析过程、操作说明或工具记录。",
        "写入的只能是正式剧本正文或正式人物状态，不要混入分析过程、操作说明或工具记录。"
      ]
    ]
  );

export const RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1 =
  retiredPromptByReplacing(
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V2,
    [
      [
        "用户要求初始化正文、按剧情结构创建剧集或批量创建空白剧集时，先读取全部可用剧情结构阶段，再调用 read_workspace_content（stage_id=draft）核对现有目录。",
        "用户要求初始化正文、按大纲创建剧集或批量创建空白剧集时，先调用 read_workspace_content（stage_id=outline）读取完整大纲，再调用 read_workspace_content（stage_id=draft）核对现有目录。"
      ],
      [
        "优先依据结构说明中承担章节规划的内容，一次调用 create_draft_sections",
        "根据大纲一次调用 create_draft_sections"
      ],
      [
        "当前剧情结构不足以确定剧集清单且用户没有明确给出时，不得猜测剧集结构。",
        "大纲为空且用户没有明确给出剧集清单时，不得猜测剧集结构。"
      ]
    ]
  );

export const RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V6 =
  retiredPromptByReplacing(DEFAULT_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT, [
    [
      "3. 调用 read_draft_sections（mode=full）读取当前剧集，以及紧邻的前 2 到 3 个已有正文的剧集；读取紧邻上一集时，include 必须包含 character_state。任一文件返回非空 next_offset 时，必须用该 offset 继续分页，直至 next_offset=null 才算完整读取。",
      "3. 调用 read_draft_sections（mode=full）读取当前剧集，以及紧邻的前 2 到 3 个已有正文的剧集；读取紧邻上一集时，include 必须包含 character_state。"
    ]
  ]);

export const RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V5 =
  retiredPromptByReplacing(RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V6, [
    [
      "5. 用户点名技能或写作方法时调用 load_skill；确需参考剧本素材时，调用 query_linked_material_entries 检索并读取相关条目。\n\n人物设定：\n- 编写或修订前先调用 list_characters 确认人物结构。\n- 文本样式：可用 read_character 或 read_workspace_content（stage_id=character_design）读取整份人物设计。\n- 条目样式：概览只维护姓名、定位与一句话摘要，不是完整人设。对本集出场或影响情节的人物，必须用 read_character 并指定 item_id 读取对应人物卡；不得只读概览或只读 character_design 阶段概览就开始编写。\n\n写作标准：",
      "5. 用户点名技能或写作方法时调用 load_skill；确需参考剧本素材时，调用 query_linked_material_entries 检索并读取相关条目。\n\n写作标准："
    ]
  ]);

export const RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V4 =
  retiredPromptByReplacing(RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V5, [
    [
      "你与剧本正文专家共用正文读写、改名和删除工具，但不包含批量创建剧集；职责区别是：你一次只完成当前选中的这一集，不改动其它剧集。",
      "你的工具和剧本正文专家编写智能体一致，区别只在职责：你一次只完成当前选中的这一集，不改动其它剧集。"
    ],
    [
      "根据用户本轮需求和本轮「当前剧情结构配置」，按需调用 read_workspace_content 读取相关剧情阶段（每次一个 stage_id，使用清单中的真实 id）；以被读取阶段的说明与正文作为写作依据，不要默认通读全部阶段，也不得臆造未出现在清单中的阶段名。",
      "调用 read_workspace_content 读取全部可用剧情结构阶段，以其中的章节规划、叙事视角和场景要求为准。"
    ],
    [
      "严格执行当前剧集在已读取剧情内容中的任务、承接点和篇幅要求。",
      "严格执行当前剧集在剧情结构中的任务、承接点和篇幅要求。"
    ]
  ]);

export const RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V3 =
  retiredPromptByReplacing(RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V4, [
    [
      "用户要求修改当前剧集名称时，调用 rename_draft_section；只能改当前选中剧集，不改正文内容。\n- 用户要求删除当前剧集时，调用 delete_draft_section；只能删除当前选中剧集，且正文至少保留一个剧集。\n- 人物状态应记录本集结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一集接续点。",
      "用户要求修改当前剧集名称时，调用 rename_draft_section；只能改当前选中剧集，不改正文内容。\n- 人物状态应记录本集结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一集接续点。"
    ]
  ]);

export const RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V2 =
  retiredPromptByReplacing(RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V3, [
    [
      "用户要求修改当前剧集名称时，调用 rename_draft_section；只能改当前选中剧集，不改正文内容。\n- 人物状态应记录本集结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一集接续点。",
      "人物状态应记录本集结束时的处境、关系、情绪、已知与隐瞒信息、关键物品、未解决冲突和下一集接续点。"
    ]
  ]);

export const RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V1 =
  retiredPromptByReplacing(RETIRED_SCRIPT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V2, [
    [
      "调用 read_workspace_content 读取全部可用剧情结构阶段，以其中的章节规划、叙事视角和场景要求为准。",
      "调用 read_workspace_content 读取大纲；读取范围允许时，可补充读取剧情细化。"
    ],
    [
      "严格执行当前剧集在剧情结构中的任务、承接点和篇幅要求。",
      "严格执行当前剧集在大纲中的任务、承接点和篇幅要求。"
    ]
  ]);

/** Byte-identical retired builtins are upgraded; customized prompts stay put. */
const RETIRED_SYSTEM_PROMPTS: Partial<
  Record<ShortWorkspaceAgentId, readonly string[]>
> = {
  plot_design: [RETIRED_SHORT_PLOT_DESIGN_SYSTEM_PROMPT_V1],
  expert_draft_coordinator: [
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V2,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V3,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V4,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V5,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V6,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V7,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V8,
    RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V9
  ]
};

const RETIRED_SCRIPT_SYSTEM_PROMPTS: Partial<
  Record<ScriptWorkspaceAgentId, readonly string[]>
> = {
  plot_design: [RETIRED_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT_V1],
  expert_draft_coordinator: [
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1,
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V2,
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V3,
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V4,
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V5,
    RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V6
  ]
};

function normalizeLegacyReadAccess(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const access = raw as Record<string, unknown>;
  return {
    material: access.material,
    skill: access.skill
  };
}

function cloneReadAccess(value: ShortAgentReadAccess): ShortAgentReadAccess {
  return {
    material: [...value.material],
    skill: [...value.skill]
  };
}

function cloneWelcomeShortcuts(
  value: ShortWorkspaceAgentProfile["welcomeShortcuts"]
): ShortWorkspaceAgentProfile["welcomeShortcuts"] {
  return [value[0], value[1], value[2]];
}

function cloneProfile(profile: ShortWorkspaceAgentProfile): ShortWorkspaceAgentProfile {
  return {
    ...profile,
    welcomeShortcuts: cloneWelcomeShortcuts(profile.welcomeShortcuts),
    readAccess: cloneReadAccess(profile.readAccess)
  };
}

function defaultProfile(agentId: ShortWorkspaceAgentId): ShortWorkspaceAgentProfile {
  const profile = DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.find(
    (candidate) => candidate.id === agentId
  );
  if (!profile) {
    throw new Error(`Missing builtin short workspace profile: ${agentId}`);
  }
  return cloneProfile(profile);
}

function normalizeReadAccess(access: ShortAgentReadAccess): ShortAgentReadAccess {
  return { material: [...access.material], skill: [...access.skill] };
}

function defaultsAsInput(): ShortWorkspaceAgentSettingsInput {
  return {
    workspaceType: "short",
    agents: DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.map((profile) => ({
      id: profile.id,
      systemPrompt: profile.systemPrompt,
      welcomeShortcuts: cloneWelcomeShortcuts(profile.welcomeShortcuts),
      readAccess: cloneReadAccess(profile.readAccess)
    }))
  };
}

function cloneScriptReadAccess(
  value: ScriptAgentReadAccess
): ScriptAgentReadAccess {
  return {
    material: [...value.material],
    skill: [...value.skill]
  };
}

function cloneScriptWelcomeShortcuts(
  value: ScriptWorkspaceAgentProfile["welcomeShortcuts"]
): ScriptWorkspaceAgentProfile["welcomeShortcuts"] {
  return [value[0], value[1], value[2]];
}

function cloneScriptProfile(
  profile: ScriptWorkspaceAgentProfile
): ScriptWorkspaceAgentProfile {
  return {
    ...profile,
    welcomeShortcuts: cloneScriptWelcomeShortcuts(profile.welcomeShortcuts),
    readAccess: cloneScriptReadAccess(profile.readAccess)
  };
}

function defaultScriptProfile(
  agentId: ScriptWorkspaceAgentId
): ScriptWorkspaceAgentProfile {
  const profile = DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.find(
    (candidate) => candidate.id === agentId
  );
  if (!profile) {
    throw new Error(`Missing builtin script workspace profile: ${agentId}`);
  }
  return cloneScriptProfile(profile);
}

function normalizeScriptReadAccess(
  access: ScriptAgentReadAccess
): ScriptAgentReadAccess {
  return { material: [...access.material], skill: [...access.skill] };
}

function scriptDefaultsAsInput(): ScriptWorkspaceAgentSettingsInput {
  return {
    workspaceType: "script",
    agents: DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.map((profile) => ({
      id: profile.id,
      systemPrompt: profile.systemPrompt,
      welcomeShortcuts: cloneScriptWelcomeShortcuts(profile.welcomeShortcuts),
      readAccess: cloneScriptReadAccess(profile.readAccess)
    }))
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(temporary, path);
}

function normalizeWelcomeShortcuts(
  agentId: ShortWorkspaceAgentId,
  raw: unknown
): ShortWorkspaceAgentProfile["welcomeShortcuts"] {
  if (Array.isArray(raw) && raw.length === 3) {
    const candidate = raw.map((value) =>
      typeof value === "string" ? value.trim() : ""
    );
    if (candidate.every((value) => value.length > 0)) {
      return [candidate[0]!, candidate[1]!, candidate[2]!];
    }
  }
  return cloneWelcomeShortcuts(defaultProfile(agentId).welcomeShortcuts);
}

function normalizeDiskSettings(raw: unknown): ShortWorkspaceAgentSettingsInput {
  if (!raw || typeof raw !== "object") {
    return defaultsAsInput();
  }
  const candidate = raw as Record<string, unknown>;
  const migrateDraftResources = candidate.version !== 2;
  const agents = Array.isArray(candidate.agents)
    ? candidate.agents.flatMap((agent) => {
        if (!agent || typeof agent !== "object") return agent;
        const record = agent as Record<string, unknown>;
        const agentId =
          typeof record.id === "string" &&
          (SHORT_WORKSPACE_AGENT_IDS as readonly string[]).includes(record.id)
            ? (record.id as ShortWorkspaceAgentId)
            : undefined;
        if (!agentId) return [];
        return [{
          ...record,
          readAccess: normalizeLegacyReadAccess(record.readAccess),
          welcomeShortcuts: normalizeWelcomeShortcuts(
            agentId,
            record.welcomeShortcuts
          )
        }];
      })
    : candidate.agents;
  const parsed = ShortWorkspaceAgentSettingsInputSchema.safeParse({
    workspaceType: candidate.workspaceType,
    agents
  });
  if (!parsed.success) {
    return defaultsAsInput();
  }
  return {
    workspaceType: "short",
    agents: parsed.data.agents.map((agent) => ({
      ...agent,
      systemPrompt: (RETIRED_SYSTEM_PROMPTS[agent.id] ?? []).includes(
        agent.systemPrompt
      )
        ? defaultProfile(agent.id).systemPrompt
        : agent.systemPrompt,
      welcomeShortcuts: cloneWelcomeShortcuts(agent.welcomeShortcuts),
      readAccess:
        migrateDraftResources && agent.id === "expert_draft_coordinator"
          ? cloneReadAccess(defaultProfile(agent.id).readAccess)
          : normalizeReadAccess(agent.readAccess)
    }))
  };
}

function normalizeScriptWelcomeShortcuts(
  agentId: ScriptWorkspaceAgentId,
  raw: unknown
): ScriptWorkspaceAgentProfile["welcomeShortcuts"] {
  if (Array.isArray(raw) && raw.length === 3) {
    const candidate = raw.map((value) =>
      typeof value === "string" ? value.trim() : ""
    );
    if (candidate.every((value) => value.length > 0)) {
      return [candidate[0]!, candidate[1]!, candidate[2]!];
    }
  }
  return cloneScriptWelcomeShortcuts(
    defaultScriptProfile(agentId).welcomeShortcuts
  );
}

function normalizeScriptDiskSettings(
  raw: unknown
): ScriptWorkspaceAgentSettingsInput {
  if (!raw || typeof raw !== "object") {
    return scriptDefaultsAsInput();
  }
  const candidate = raw as Record<string, unknown>;
  const migrateDraftResources = candidate.version !== 2;
  const agents = Array.isArray(candidate.agents)
    ? candidate.agents.flatMap((agent) => {
        if (!agent || typeof agent !== "object") return agent;
        const record = agent as Record<string, unknown>;
        const agentId =
          typeof record.id === "string" &&
          (SCRIPT_WORKSPACE_AGENT_IDS as readonly string[]).includes(record.id)
            ? (record.id as ScriptWorkspaceAgentId)
            : undefined;
        if (!agentId) return [];
        return [{
          ...record,
          readAccess: normalizeLegacyReadAccess(record.readAccess),
          welcomeShortcuts: normalizeScriptWelcomeShortcuts(
            agentId,
            record.welcomeShortcuts
          )
        }];
      })
    : candidate.agents;
  const parsed = ScriptWorkspaceAgentSettingsInputSchema.safeParse({
    workspaceType: candidate.workspaceType,
    agents
  });
  if (!parsed.success) {
    return scriptDefaultsAsInput();
  }
  return {
    workspaceType: "script",
    agents: parsed.data.agents.map((agent) => ({
      ...agent,
      systemPrompt: (RETIRED_SCRIPT_SYSTEM_PROMPTS[agent.id] ?? []).includes(
        agent.systemPrompt
      )
        ? defaultScriptProfile(agent.id).systemPrompt
        : agent.systemPrompt,
      welcomeShortcuts: cloneScriptWelcomeShortcuts(agent.welcomeShortcuts),
      readAccess:
        migrateDraftResources && agent.id === "expert_draft_coordinator"
          ? cloneScriptReadAccess(defaultScriptProfile(agent.id).readAccess)
          : normalizeScriptReadAccess(agent.readAccess)
    }))
  };
}

export class WorkspaceAgentConfigStore {
  private readonly shortSettingsPath: string;
  private readonly scriptSettingsPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.shortSettingsPath = join(
      userDataPath,
      "config",
      "workspace-agents.json"
    );
    this.scriptSettingsPath = join(
      userDataPath,
      "config",
      "workspace-agents-script.json"
    );
  }

  async list(): Promise<ShortWorkspaceAgentSettings>;
  async list(workspaceType: "short"): Promise<ShortWorkspaceAgentSettings>;
  async list(workspaceType: "script"): Promise<ScriptWorkspaceAgentSettings>;
  async list(workspaceType: WorkspaceType): Promise<WorkspaceAgentSettings>;
  async list(
    workspaceType: WorkspaceType = "short"
  ): Promise<WorkspaceAgentSettings> {
    await this.writeChain;
    return workspaceType === "script"
      ? this.toPublicScriptSettings(await this.readScriptInput())
      : this.toPublicSettings(await this.readInput());
  }

  async save(
    rawInput: ShortWorkspaceAgentSettingsInput
  ): Promise<ShortWorkspaceAgentSettings>;
  async save(
    rawInput: ScriptWorkspaceAgentSettingsInput
  ): Promise<ScriptWorkspaceAgentSettings>;
  async save(
    rawInput: WorkspaceAgentSettingsInput
  ): Promise<WorkspaceAgentSettings>;
  async save(
    rawInput: WorkspaceAgentSettingsInput
  ): Promise<WorkspaceAgentSettings> {
    const input = WorkspaceAgentSettingsInputSchema.parse(rawInput);
    let saved: WorkspaceAgentSettings | undefined;
    const operation = this.writeChain.then(async () => {
      if (input.workspaceType === "script") {
        const normalized: ScriptWorkspaceAgentSettingsInput = {
          workspaceType: "script",
          agents: input.agents.map((agent) => ({
            ...agent,
            welcomeShortcuts: cloneScriptWelcomeShortcuts(
              agent.welcomeShortcuts
            ),
            readAccess: normalizeScriptReadAccess(agent.readAccess)
          }))
        };
        await this.writeScriptInput(normalized);
        saved = this.toPublicScriptSettings(normalized);
        return;
      }
      const normalized: ShortWorkspaceAgentSettingsInput = {
        workspaceType: "short",
        agents: input.agents.map((agent) => ({
          ...agent,
          welcomeShortcuts: cloneWelcomeShortcuts(agent.welcomeShortcuts),
          readAccess: normalizeReadAccess(agent.readAccess)
        }))
      };
      await this.writeInput(normalized);
      saved = this.toPublicSettings(normalized);
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return saved!;
  }

  async reset(): Promise<ShortWorkspaceAgentSettings>;
  async reset(
    agentId: ShortWorkspaceAgentId
  ): Promise<ShortWorkspaceAgentSettings>;
  async reset(
    workspaceType: "short",
    agentId?: ShortWorkspaceAgentId
  ): Promise<ShortWorkspaceAgentSettings>;
  async reset(
    workspaceType: "script",
    agentId?: ScriptWorkspaceAgentId
  ): Promise<ScriptWorkspaceAgentSettings>;
  async reset(
    workspaceType: WorkspaceType,
    agentId?: ShortWorkspaceAgentId | ScriptWorkspaceAgentId
  ): Promise<WorkspaceAgentSettings>;
  async reset(
    workspaceTypeOrAgentId?: WorkspaceType | ShortWorkspaceAgentId,
    rawAgentId?: ShortWorkspaceAgentId | ScriptWorkspaceAgentId
  ): Promise<WorkspaceAgentSettings> {
    const workspaceType: WorkspaceType =
      workspaceTypeOrAgentId === "script" ? "script" : "short";
    const agentId =
      workspaceTypeOrAgentId === "short" || workspaceTypeOrAgentId === "script"
        ? rawAgentId
        : workspaceTypeOrAgentId;
    let saved: WorkspaceAgentSettings | undefined;
    const operation = this.writeChain.then(async () => {
      if (workspaceType === "script") {
        const scriptAgentId = agentId as ScriptWorkspaceAgentId | undefined;
        const next = scriptAgentId
          ? await this.readScriptInput()
          : scriptDefaultsAsInput();
        if (scriptAgentId) {
          const builtin = defaultScriptProfile(scriptAgentId);
          const index = next.agents.findIndex(
            (agent) => agent.id === scriptAgentId
          );
          const replacement = {
            id: builtin.id,
            systemPrompt: builtin.systemPrompt,
            welcomeShortcuts: cloneScriptWelcomeShortcuts(
              builtin.welcomeShortcuts
            ),
            readAccess: cloneScriptReadAccess(builtin.readAccess)
          };
          if (index >= 0) {
            next.agents[index] = replacement;
          } else {
            next.agents.push(replacement);
          }
        }
        const validated = ScriptWorkspaceAgentSettingsInputSchema.parse(next);
        await this.writeScriptInput(validated);
        saved = this.toPublicScriptSettings(validated);
        return;
      }
      const shortAgentId = agentId as ShortWorkspaceAgentId | undefined;
      const next = shortAgentId ? await this.readInput() : defaultsAsInput();
      if (shortAgentId) {
        const builtin = defaultProfile(shortAgentId);
        const index = next.agents.findIndex(
          (agent) => agent.id === shortAgentId
        );
        const replacement = {
          id: builtin.id,
          systemPrompt: builtin.systemPrompt,
          welcomeShortcuts: cloneWelcomeShortcuts(builtin.welcomeShortcuts),
          readAccess: cloneReadAccess(builtin.readAccess)
        };
        if (index >= 0) {
          next.agents[index] = replacement;
        } else {
          next.agents.push(replacement);
        }
      }
      const validated = ShortWorkspaceAgentSettingsInputSchema.parse(next);
      await this.writeInput(validated);
      saved = this.toPublicSettings(validated);
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return saved!;
  }

  async resolveForStage(
    stageId: ShortWorkspaceStageId
  ): Promise<ShortWorkspaceAgentProfile>;
  async resolveForStage(
    stageId: ScriptWorkspaceStageId,
    workspaceType: "script"
  ): Promise<ScriptWorkspaceAgentProfile>;
  async resolveForStage(
    stageId: ShortWorkspaceStageId | ScriptWorkspaceStageId,
    workspaceType: WorkspaceType = "short"
  ): Promise<WorkspaceAgentProfile> {
    return workspaceType === "script"
      ? await this.resolve(
          "script",
          resolveScriptWorkspaceAgentIdForStage(
            stageId as ScriptWorkspaceStageId
          )
        )
      : await this.resolve(
          "short",
          resolveShortWorkspaceAgentIdForStage(stageId as ShortWorkspaceStageId)
        );
  }

  async resolveForWorkspace(
    rawWorkspace: ShortWorkspaceSnapshot,
    workspaceType: "short"
  ): Promise<ShortWorkspaceAgentProfile>;
  async resolveForWorkspace(
    rawWorkspace: ScriptWorkspaceSnapshot,
    workspaceType: "script"
  ): Promise<ScriptWorkspaceAgentProfile>;
  async resolveForWorkspace(
    rawWorkspace: ShortWorkspaceSnapshot | ScriptWorkspaceSnapshot,
    workspaceType: WorkspaceType
  ): Promise<WorkspaceAgentProfile>;
  async resolveForWorkspace(
    rawWorkspace: ShortWorkspaceSnapshot | ScriptWorkspaceSnapshot,
    workspaceType: WorkspaceType
  ): Promise<WorkspaceAgentProfile> {
    if (workspaceType === "script") {
      const workspace = ScriptWorkspaceSnapshotSchema.parse(rawWorkspace);
      return await this.resolve(
        "script",
        workspace.activeAgentId ??
          resolveScriptWorkspaceAgentIdForStage(workspace.activeStageId)
      );
    }
    const workspace = ShortWorkspaceSnapshotSchema.parse(rawWorkspace);
    return await this.resolve(
      "short",
      workspace.activeAgentId ??
        resolveShortWorkspaceAgentIdForStage(workspace.activeStageId)
    );
  }

  async resolve(
    agentId: ShortWorkspaceAgentId
  ): Promise<ShortWorkspaceAgentProfile>;
  async resolve(
    workspaceType: "short",
    agentId: ShortWorkspaceAgentId
  ): Promise<ShortWorkspaceAgentProfile>;
  async resolve(
    workspaceType: "script",
    agentId: ScriptWorkspaceAgentId
  ): Promise<ScriptWorkspaceAgentProfile>;
  async resolve(
    workspaceTypeOrAgentId: WorkspaceType | ShortWorkspaceAgentId,
    rawAgentId?: ShortWorkspaceAgentId | ScriptWorkspaceAgentId
  ): Promise<WorkspaceAgentProfile> {
    const workspaceType: WorkspaceType =
      workspaceTypeOrAgentId === "script" ? "script" : "short";
    const agentId =
      workspaceTypeOrAgentId === "short" || workspaceTypeOrAgentId === "script"
        ? rawAgentId
        : workspaceTypeOrAgentId;
    if (!agentId) {
      throw new Error("Workspace agent id is required.");
    }
    if (workspaceType === "script") {
      const scriptAgentId = agentId as ScriptWorkspaceAgentId;
      const settings = await this.list("script");
      const profile = settings.agents.find(
        (candidate) => candidate.id === scriptAgentId
      );
      return profile
        ? cloneScriptProfile(profile)
        : defaultScriptProfile(scriptAgentId);
    }
    const shortAgentId = agentId as ShortWorkspaceAgentId;
    const settings = await this.list("short");
    const profile = settings.agents.find(
      (candidate) => candidate.id === shortAgentId
    );
    if (!profile) {
      return defaultProfile(shortAgentId);
    }
    return cloneProfile(profile);
  }

  private async readInput(): Promise<ShortWorkspaceAgentSettingsInput> {
    const raw = await readJson(this.shortSettingsPath);
    const normalized = normalizeDiskSettings(raw);
    if (
      raw &&
      typeof raw === "object" &&
      (raw as Record<string, unknown>).version !== 2
    ) {
      await this.writeInput(normalized);
    }
    return normalized;
  }

  private async readScriptInput(): Promise<ScriptWorkspaceAgentSettingsInput> {
    const raw = await readJson(this.scriptSettingsPath);
    const normalized = normalizeScriptDiskSettings(raw);
    if (
      raw &&
      typeof raw === "object" &&
      (raw as Record<string, unknown>).version !== 2
    ) {
      await this.writeScriptInput(normalized);
    }
    return normalized;
  }

  private async writeInput(input: ShortWorkspaceAgentSettingsInput): Promise<void> {
    const disk: DiskWorkspaceAgentSettings = {
      version: 2,
      workspaceType: "short",
      agents: input.agents
    };
    await atomicWriteJson(this.shortSettingsPath, disk);
  }

  private async writeScriptInput(
    input: ScriptWorkspaceAgentSettingsInput
  ): Promise<void> {
    const disk: DiskScriptWorkspaceAgentSettings = {
      version: 2,
      workspaceType: "script",
      agents: input.agents
    };
    await atomicWriteJson(this.scriptSettingsPath, disk);
  }

  private toPublicSettings(
    input: ShortWorkspaceAgentSettingsInput
  ): ShortWorkspaceAgentSettings {
    const byId = new Map(input.agents.map((agent) => [agent.id, agent]));
    return ShortWorkspaceAgentSettingsSchema.parse({
      workspaceType: "short",
      agents: SHORT_WORKSPACE_AGENT_IDS.map((agentId) => {
        const builtin = defaultProfile(agentId);
        const override = byId.get(agentId);
        return {
          ...builtin,
          ...(override
            ? {
                systemPrompt: override.systemPrompt,
                welcomeShortcuts: cloneWelcomeShortcuts(override.welcomeShortcuts)
              }
            : {}),
          readAccess: normalizeReadAccess(
            override?.readAccess ?? builtin.readAccess
          )
        };
      })
    });
  }

  private toPublicScriptSettings(
    input: ScriptWorkspaceAgentSettingsInput
  ): ScriptWorkspaceAgentSettings {
    const byId = new Map(input.agents.map((agent) => [agent.id, agent]));
    return ScriptWorkspaceAgentSettingsSchema.parse({
      workspaceType: "script",
      agents: SCRIPT_WORKSPACE_AGENT_IDS.map((agentId) => {
        const builtin = defaultScriptProfile(agentId);
        const override = byId.get(agentId);
        return {
          ...builtin,
          ...(override
            ? {
                systemPrompt: override.systemPrompt,
                welcomeShortcuts: cloneScriptWelcomeShortcuts(
                  override.welcomeShortcuts
                )
              }
            : {}),
          readAccess: normalizeScriptReadAccess(
            override?.readAccess ?? builtin.readAccess
          )
        };
      })
    });
  }
}
