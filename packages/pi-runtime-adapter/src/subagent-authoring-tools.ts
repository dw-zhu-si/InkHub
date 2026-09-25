import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "typebox";
import {
  SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS,
  SubagentAuthoringDraftSchema,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext
} from "@deepwrite/contracts";

export type SubagentAuthoringToolDetails = {
  kind: "subagent-authoring-draft-update";
  draft: SubagentAuthoringDraft;
};

type SubagentAuthoringToolResultDetails =
  | { kind: "none" }
  | SubagentAuthoringToolDetails;

function textResult(
  text: string,
  details: SubagentAuthoringToolResultDetails = { kind: "none" }
): AgentToolResult<SubagentAuthoringToolResultDetails> {
  return { content: [{ type: "text", text }], details };
}

function primitiveTypeOf(value: unknown): string | undefined {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  return undefined;
}

function sanitizeToolSchemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolSchemaForGemini(item));
  }
  if (!value || typeof value !== "object") return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    output[key] = sanitizeToolSchemaForGemini(child);
  }

  for (const unionKey of ["anyOf", "oneOf"]) {
    const union = output[unionKey];
    if (!Array.isArray(union) || union.length === 0) continue;
    const branches = union as Array<Record<string, unknown>>;
    const values = branches.map((branch) => {
      if (
        branch &&
        typeof branch === "object" &&
        Object.prototype.hasOwnProperty.call(branch, "const")
      ) {
        return { matched: true, value: branch.const };
      }
      if (Array.isArray(branch?.enum) && branch.enum.length === 1) {
        return { matched: true, value: branch.enum[0] };
      }
      return { matched: false, value: undefined };
    });
    if (values.every((value) => value.matched)) {
      const enumValues = values.map((value) => value.value);
      delete output[unionKey];
      output.enum = enumValues;
      if (!output.type) {
        const types = [
          ...new Set(enumValues.map(primitiveTypeOf).filter(Boolean))
        ];
        if (types.length === 1) output.type = types[0];
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(output, "const")) {
    output.enum = [output.const];
    if (!output.type) output.type = primitiveTypeOf(output.const);
    delete output.const;
  }
  return output;
}

function defineTool<T extends ReturnType<typeof Type.Object>>(definition: {
  name: string;
  label: string;
  description: string;
  parameters: T;
  execute: (
    toolCallId: string,
    params: Static<T>,
    signal?: AbortSignal
  ) => Promise<AgentToolResult<SubagentAuthoringToolResultDetails>>;
}): AgentTool<T, SubagentAuthoringToolResultDetails> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: sanitizeToolSchemaForGemini(definition.parameters) as T,
    execute: definition.execute
  };
}

export function renderSubagentAuthoringSystemPrompt(
  context: SubagentAuthoringRuntimeContext
): string {
  const modeLabel = SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS[context.outputMode];
  const skillLines = context.skills.map(
    (skill, index) =>
      `${index + 1}. id=${skill.id} · ${skill.libraryTitle} · ${skill.title}`
  );
  const existingNames = context.existingSubagentNames.length
    ? context.existingSubagentNames.map((name) => `- ${name}`).join("\n")
    : "（当前主智能体下还没有其它子智能体）";
  const outputGuidance =
    context.outputMode === "write"
      ? [
          "用户已确认：该子智能体应通过写入 / 替换工具直接修改工作区文档。",
          "生成的 systemPrompt 必须明确要求：先读后写、正文只能经工具落盘、交接摘要只说明改了什么与是否已产生待审阅变更，禁止用摘要代替写入。"
        ].join("\n")
      : [
          "用户已确认：该子智能体只把结论、问题清单或要点交回主智能体，不要直接改文档。",
          "生成的 systemPrompt 必须明确要求：可读工具可用于核对；不要调用写入 / 替换工具；交接摘要给出主智能体可继续处理的结论与要点，不要整段粘贴文件原文。"
        ].join("\n");

  return [
    "你是墨枢的「技能转子智能体」助手。根据用户选定的技能正文，为当前主智能体生成一份可保存的子智能体草稿。",
    "",
    `【目标主智能体】${context.parentAgentLabel}（${context.parentAgentId}）`,
    `【用户确认的产出方式】${modeLabel}`,
    outputGuidance,
    "",
    "【可选技能】",
    ...skillLines,
    "",
    "【当前同队已有子智能体名称】",
    existingNames,
    "",
    "工作流程：",
    "1. 先用 read_authoring_skill 读取全部选定技能正文，必要时可多次读取。",
    "2. 把技能方法改写成适合子智能体执行的系统提示词：保留可操作步骤，去掉对用户对话口吻或技能库管理无关的内容。",
    "3. 子智能体运行时没有 load_skill，因此必须把技能中真正需要的方法要点写进 systemPrompt，不能假设运行时还能加载技能。",
    "4. 名称要简短且与同队已有名称不重复；能力说明写给主智能体看，说明何时委派。",
    "5. 完成后调用 write_subagent_draft 提交 name、description、systemPrompt；可多次调用覆盖草稿。",
    "6. 工具写入成功后，简短告知用户草稿已就绪，等待界面确认加入团队。"
  ].join("\n");
}

function buildListAuthoringSkillsTool(
  context: SubagentAuthoringRuntimeContext
): AgentTool {
  return defineTool({
    name: "list_authoring_skills",
    label: "列出选定技能",
    description: "列出本轮用户选定、可用于建设子智能体的技能 id、库名与标题。",
    parameters: Type.Object({}),
    execute: async () =>
      textResult(
        context.skills
          .map(
            (skill, index) =>
              `${index + 1}. id=${skill.id}\n库：${skill.libraryTitle}\n标题：${skill.title}\n字数：${skill.body.length}`
          )
          .join("\n\n")
      )
  });
}

function buildReadAuthoringSkillTool(
  context: SubagentAuthoringRuntimeContext
): AgentTool {
  return defineTool({
    name: "read_authoring_skill",
    label: "读取选定技能",
    description: "读取用户在本轮选定的技能正文。skill_id 必须来自 list_authoring_skills。",
    parameters: Type.Object({
      skill_id: Type.String({ minLength: 1, maxLength: 240 })
    }),
    execute: async (_toolCallId, params) => {
      const skillId = String(params.skill_id ?? "").trim();
      const skill = context.skills.find((item) => item.id === skillId);
      if (!skill) {
        return textResult(
          `未找到技能：${skillId}\n可用：${context.skills.map((item) => item.id).join(", ")}`
        );
      }
      return textResult(
        `【技能：${skill.libraryTitle} · ${skill.title}】\n\n${skill.body}`
      );
    }
  });
}

function buildWriteSubagentDraftTool(): AgentTool {
  return defineTool({
    name: "write_subagent_draft",
    label: "写入子智能体草稿",
    description:
      "把生成的子智能体草稿写入界面预览区。只更新预览，不会直接保存到智能体团队；用户确认后才会加入。",
    parameters: Type.Object({
      name: Type.String({ minLength: 1, maxLength: 80 }),
      description: Type.String({ minLength: 1, maxLength: 1_000 }),
      system_prompt: Type.String({ minLength: 1, maxLength: 20_000 })
    }),
    execute: async (_toolCallId, params) => {
      const draft = SubagentAuthoringDraftSchema.parse({
        name: String(params.name ?? "").trim(),
        description: String(params.description ?? "").trim(),
        systemPrompt: String(params.system_prompt ?? "").trim()
      });
      return textResult("已写入子智能体草稿预览，等待用户确认加入团队。", {
        kind: "subagent-authoring-draft-update",
        draft
      });
    }
  });
}

export function buildSubagentAuthoringTools(
  context: SubagentAuthoringRuntimeContext
): AgentTool[] {
  return [
    buildListAuthoringSkillsTool(context),
    buildReadAuthoringSkillTool(context),
    buildWriteSubagentDraftTool()
  ];
}

export function isSubagentAuthoringToolDetails(
  value: unknown
): value is SubagentAuthoringToolDetails {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const details = value as Record<string, unknown>;
  if (details.kind !== "subagent-authoring-draft-update") return false;
  return SubagentAuthoringDraftSchema.safeParse(details.draft).success;
}
