import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "typebox";
import {
  SHORT_MATERIAL_KINDS,
  SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS,
  SHORT_SKILL_KINDS,
  catalogDraftBodyDocumentId,
  catalogDraftCharacterStateDocumentId,
  createShortWorkspaceContentRevision,
  isProvisionalExpertDraftSectionId,
  PROVISIONAL_EXPERT_DRAFT_SECTION_ID_PREFIX,
  type AgentWriteApprovalMode,
  type ExpertDraftSectionSnapshot,
  type ScriptWorkspaceAgentProfile,
  type ScriptWorkspaceSnapshot,
  type ShortWorkspaceAgentProfile,
  type ShortWorkspaceSnapshot,
  type ShortWorkspaceStageId,
  type WorkspaceRuntimeContext
} from "@deepwrite/contracts";
import {
  LOAD_SKILL_NAME_PARAMETER,
  LOAD_SKILL_TOOL_DESCRIPTION,
  formatLoadSkillToolResult,
  resolveAttachedSkill,
  type LoadSkillCandidate
} from "./resolve-attached-skill";

export type ShortWorkspaceToolDetails =
  | { kind: "none" }
  | {
      kind: "workspace-editor-mutation";
      workspaceId: string;
      stageId: ShortWorkspaceStageId;
      text: string;
      baseRevision: string;
      summary: string;
    }
  | {
      kind: "workspace-character-file-mutation";
      workspaceId: string;
      stageId: "character_design";
      documentId: string;
      itemId?: string;
      text: string;
      baseRevision: string;
      summary: string;
    }
  | {
      kind: "workspace-character-structure-mutation";
      workspaceId: string;
      stageId: "character_design";
      mutation:
        | { type: "createItem"; title: string; provisionalItemId: string }
        | { type: "updateItem"; itemId: string; previousTitle: string; title: string }
        | { type: "moveItem"; itemId: string; direction: "up" | "down"; title: string }
        | { type: "deleteItem"; itemId: string; title: string; deletedText: string };
      baseRevision: string;
      summary: string;
    }
  | {
      kind: "workspace-expert-draft-file-mutation";
      workspaceId: string;
      stageId: "draft";
      documentId: string;
      sectionId: string;
      fileKind: "body" | "characterState";
      text: string;
      baseRevision: string;
      summary: string;
    }
  | {
      kind: "workspace-expert-draft-section-creation";
      workspaceId: string;
      stageId: "draft";
      sections: Array<{
        title: string;
        wordCountRequirement: string;
        provisionalSectionId: string;
      }>;
      afterSectionId?: string;
      baseRevision: string;
      summary: string;
    }
  | {
      kind: "workspace-expert-draft-section-rename";
      workspaceId: string;
      stageId: "draft";
      sectionId: string;
      previousTitle: string;
      title: string;
      baseRevision: string;
      summary: string;
    }
  | {
      kind: "workspace-expert-draft-section-deletion";
      workspaceId: string;
      stageId: "draft";
      sectionId: string;
      title: string;
      baseRevision: string;
      summary: string;
    }
  | {
      kind: "workspace-stage-selection";
      workspaceId: string;
      stageId: ShortWorkspaceStageId;
    };

/** Script-facing alias kept separate so its mutation protocol can diverge later. */
export type ScriptWorkspaceToolDetails = ShortWorkspaceToolDetails;

export interface BuildShortWorkspaceToolsInput {
  workspace: ShortWorkspaceSnapshot;
  profile: ShortWorkspaceAgentProfile;
  writeApprovalMode?: AgentWriteApprovalMode;
  attachedSkills?: WorkspaceRuntimeContext["attachedSkills"];
  attachedMaterials?: WorkspaceRuntimeContext["attachedMaterials"];
  /**
   * Mutable content shared by every agent participating in the same parent run.
   * Read evidence deliberately stays outside this object and is recreated by
   * every buildShortWorkspaceTools() call.
   */
  sharedState?: ShortWorkspaceToolSharedState;
}

export interface BuildScriptWorkspaceToolsInput {
  workspace: ScriptWorkspaceSnapshot;
  profile: ScriptWorkspaceAgentProfile;
  writeApprovalMode?: AgentWriteApprovalMode;
  attachedSkills?: WorkspaceRuntimeContext["attachedSkills"];
  attachedMaterials?: WorkspaceRuntimeContext["attachedMaterials"];
  /** Shared across the parent and its children during one script run. */
  sharedState?: ScriptWorkspaceToolSharedState;
}

type WritingWorkspaceType = "short" | "script";

interface WritingWorkspaceSnapshot {
  id: ShortWorkspaceSnapshot["id"];
  title: ShortWorkspaceSnapshot["title"];
  activeStageId: ShortWorkspaceStageId;
  activeAgentId?:
    | ShortWorkspaceSnapshot["activeAgentId"]
    | ScriptWorkspaceSnapshot["activeAgentId"];
  activeSectionId?: ShortWorkspaceSnapshot["activeSectionId"];
  expertDraft: ShortWorkspaceSnapshot["expertDraft"];
  plotStages: ShortWorkspaceSnapshot["plotStages"];
  characterStructure: ShortWorkspaceSnapshot["characterStructure"];
  stages: ShortWorkspaceSnapshot["stages"];
}

interface WritingWorkspaceAgentProfile {
  id: ShortWorkspaceAgentProfile["id"] | ScriptWorkspaceAgentProfile["id"];
  readAccess:
    | ShortWorkspaceAgentProfile["readAccess"]
    | ScriptWorkspaceAgentProfile["readAccess"];
}

interface BuildWritingWorkspaceToolsInput {
  workspaceType: WritingWorkspaceType;
  workspace: WritingWorkspaceSnapshot;
  profile: WritingWorkspaceAgentProfile;
  writeApprovalMode?: AgentWriteApprovalMode;
  attachedSkills?: WorkspaceRuntimeContext["attachedSkills"];
  attachedMaterials?: WorkspaceRuntimeContext["attachedMaterials"];
  sharedState?: ShortWorkspaceToolSharedState;
}

type ExpertSectionMap = Map<string, ExpertDraftSectionSnapshot>;

export interface ShortWorkspaceToolSharedState {
  stageBodies: Map<ShortWorkspaceStageId, string>;
  stageRevisions: Map<ShortWorkspaceStageId, string>;
  characterItems: Map<string, {
    id: string;
    title: string;
    order: number;
    content: string;
    revision: string;
    provisional?: boolean;
  }>;
  characterItemOrder: string[];
  pendingCharacterSeq: number;
  expertSections: ExpertSectionMap;
  /** Stable directory order including provisional sections created in this run. */
  expertSectionOrder: string[];
  pendingExpertSectionTitles: Set<string>;
  pendingSectionSeq: number;
  /**
   * Structural directory revision at run start. Section creation proposals keep
   * this base so Renderer same-run accept chaining stays valid.
   */
  expertDraftDirectoryBaseRevision: string;
}

/** Script-facing alias kept separate so its run overlay can diverge later. */
export type ScriptWorkspaceToolSharedState = ShortWorkspaceToolSharedState;

/**
 * Every creative agent can inspect draft sections. Draft mutations remain
 * exclusive to the unified draft coordinator.
 */
const SHORT_WORKSPACE_DRAFT_TOOLS = [
  "write_draft_section",
  "replace_draft_section_text",
  "rename_draft_section",
  "delete_draft_section"
] as const;

export const SHORT_WORKSPACE_TOOL_MANIFEST = {
  standard: [
    "read_workspace_content",
    "search_workspace_text",
    "query_linked_material_entries",
    "load_skill",
    "list_characters",
    "search_characters",
    "read_character",
    "read_draft_sections",
    "write_workspace_editor",
    "replace_current_stage_text"
  ],
  characterRead: ["list_characters", "search_characters", "read_character"],
  characterWrite: [
    "create_character_file",
    "write_character_file",
    "edit_character_file",
    "rename_character_item",
    "move_character_item",
    "delete_character_file"
  ],
  plot: ["switch_storyline_stage"],
  draft: SHORT_WORKSPACE_DRAFT_TOOLS,
  coordinator: ["create_draft_sections", ...SHORT_WORKSPACE_DRAFT_TOOLS],
  sectionWriter: [...SHORT_WORKSPACE_DRAFT_TOOLS]
} as const;

/**
 * Draft bodies enter the run snapshot without truncation, so one unbounded
 * batch read can exhaust the model context. Full reads are paged instead.
 */
const DRAFT_FULL_READ_CHARACTER_BUDGET = 60_000;
const DRAFT_FULL_READ_MAX_SECTIONS = 20;
const DRAFT_PREVIEW_EXCERPT_CHARACTERS = 200;
const SHORT_DOCUMENT_PAGE_DEFAULT_CHARACTERS = 32_768;
const SHORT_DOCUMENT_PAGE_MAX_CHARACTERS = 256 * 1024;

interface ShortDocumentPage {
  content: string;
  offset: number;
  returnedCharacters: number;
  totalCharacters: number;
  nextOffset: number | null;
}

interface ShortDocumentReadCoverage {
  contiguousEnd: number;
  totalCharacters: number;
}

function readShortDocumentPage(
  content: string,
  requestedOffset: number,
  requestedMaximum: number
): ShortDocumentPage {
  const offset = Math.max(0, Math.trunc(requestedOffset));
  const maximum = Math.min(
    SHORT_DOCUMENT_PAGE_MAX_CHARACTERS,
    Math.max(1, Math.trunc(requestedMaximum))
  );
  const page: string[] = [];
  let totalCharacters = 0;
  let returnedCharacters = 0;
  for (const character of content) {
    if (
      totalCharacters >= offset &&
      returnedCharacters < maximum
    ) {
      page.push(character);
      returnedCharacters += 1;
    }
    totalCharacters += 1;
  }
  const boundedOffset = Math.min(offset, totalCharacters);
  const endOffset = boundedOffset + returnedCharacters;
  return {
    content: page.join(""),
    offset: boundedOffset,
    returnedCharacters,
    totalCharacters,
    nextOffset: endOffset < totalCharacters ? endOffset : null
  };
}

function recordShortDocumentPage(
  coverage: Map<string, ShortDocumentReadCoverage>,
  documentId: string,
  page: ShortDocumentPage
): boolean {
  const previous = coverage.get(documentId);
  const contiguousEnd =
    page.offset <= (previous?.contiguousEnd ?? 0)
      ? Math.max(previous?.contiguousEnd ?? 0, page.offset + page.returnedCharacters)
      : previous?.contiguousEnd ?? 0;
  coverage.set(documentId, {
    contiguousEnd,
    totalCharacters: page.totalCharacters
  });
  return contiguousEnd >= page.totalCharacters;
}

function renderShortDocumentPageMetadata(page: ShortDocumentPage): string {
  return [
    `offset: ${page.offset}`,
    `本页字符数: ${page.returnedCharacters}`,
    `总字符数: ${page.totalCharacters}`,
    `next_offset: ${page.nextOffset ?? "null"}`
  ].join("\n");
}

type DraftFileKind = "body" | "characterState";

const DRAFT_FILE_PARAMETER_VALUES = ["body", "character_state"] as const;

function toDraftFileKind(value: unknown): DraftFileKind {
  return String(value ?? "body") === "character_state" ? "characterState" : "body";
}

function draftFileLabel(field: DraftFileKind): string {
  return field === "body" ? "正文" : "人物状态";
}

function textResult(
  text: string,
  details: ShortWorkspaceToolDetails = { kind: "none" }
): AgentToolResult<ShortWorkspaceToolDetails> {
  return { content: [{ type: "text", text }], details };
}

function literalUnion<T extends string>(values: readonly T[]) {
  if (values.length === 1) {
    return Type.Literal(values[0]!);
  }
  return Type.Union(values.map((value) => Type.Literal(value)));
}

function primitiveTypeOf(value: unknown): string | undefined {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  return undefined;
}

export function sanitizeToolSchemaForGemini(value: unknown): unknown {
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
    if (
      branches.every(
        (branch) =>
          branch &&
          typeof branch === "object" &&
          Object.prototype.hasOwnProperty.call(branch, "const")
      )
    ) {
      const values = branches.map((branch) => branch.const);
      delete output[unionKey];
      output.enum = values;
      if (!output.type) {
        const types = [...new Set(values.map(primitiveTypeOf).filter(Boolean))];
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
  ) => Promise<AgentToolResult<ShortWorkspaceToolDetails>>;
  executionMode?: AgentTool["executionMode"];
}): AgentTool<T, ShortWorkspaceToolDetails> {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    parameters: sanitizeToolSchemaForGemini(definition.parameters) as T,
    execute: definition.execute,
    ...(definition.executionMode ? { executionMode: definition.executionMode } : {})
  };
}

function stageLabel(
  input: BuildWritingWorkspaceToolsInput,
  stageId: ShortWorkspaceStageId
): string {
  if (stageId === "character_design") return "人物";
  if (stageId === "draft") return "正文";
  return (
    input.workspace.plotStages.find(({ id }) => id === stageId)?.title ??
    stageId
  );
}

function workspaceKindLabel(input: BuildWritingWorkspaceToolsInput): string {
  return input.workspaceType === "script" ? "剧本" : "短篇";
}

function workspaceTitleLabel(input: BuildWritingWorkspaceToolsInput): string {
  return input.workspaceType === "script" ? "剧名" : "书名";
}

function draftUnitLabel(input: BuildWritingWorkspaceToolsInput): string {
  return input.workspaceType === "script" ? "剧集" : "章节";
}

function draftUnitCounter(input: BuildWritingWorkspaceToolsInput): string {
  return input.workspaceType === "script" ? "集" : "章";
}

function draftContentUnitLabel(input: BuildWritingWorkspaceToolsInput): string {
  return input.workspaceType === "script" ? "剧集" : "正文章节";
}

function storylineStageIds(
  input: BuildWritingWorkspaceToolsInput
): ShortWorkspaceStageId[] {
  const available = new Set<ShortWorkspaceStageId>(
    input.workspace.stages.map((stage) => stage.stageId)
  );
  return input.workspace.plotStages
    .map(({ id }) => id)
    .filter((stageId) => available.has(stageId));
}

function readableStageIds(
  input: BuildWritingWorkspaceToolsInput
): ShortWorkspaceStageId[] {
  const targets = input.workspace.stages.map(({ stageId }) => stageId);
  if (!targets.includes("draft")) targets.push("draft");
  return targets;
}

function scriptBodyToolConstraint(
  input: BuildWritingWorkspaceToolsInput
): string {
  return input.workspaceType === "script"
    ? `\n当 file=body 时，剧本正文必须遵守以下不可编辑格式约束：\n${SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS.trim()}\n` +
        "写入 body 的 text 或 replacements[].new_text 不得包含 Markdown 表格、分析标题或格式讲解。"
    : "";
}

function lineColumnAt(text: string, index: number): { line: number; column: number } {
  const prefix = text.slice(0, index);
  const lines = prefix.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function replaceText(
  current: string,
  replacements: Array<{ original_text: string; new_text: string }>
): { next?: string; count: number; error?: string } {
  let next = current;
  let count = 0;
  for (const replacement of replacements) {
    const original = replacement.original_text;
    if (!original) {
      return { count, error: "original_text 不能为空。" };
    }
    const first = next.indexOf(original);
    if (first < 0) {
      return { count, error: `没有找到原文片段：${original.slice(0, 80)}` };
    }
    if (next.indexOf(original, first + original.length) >= 0) {
      return { count, error: `原文片段出现多次，请提供更长且唯一的上下文：${original.slice(0, 80)}` };
    }
    next = `${next.slice(0, first)}${replacement.new_text}${next.slice(first + original.length)}`;
    count += 1;
  }
  return { next, count };
}

function writableStageIds(
  input: BuildWritingWorkspaceToolsInput
): ShortWorkspaceStageId[] {
  const { profile } = input;
  if (profile.id === "character_design") return ["character_design"];
  if (profile.id === "plot_design") {
    return storylineStageIds(input);
  }
  return ["draft"];
}

function buildReadWorkspaceContentTool(
  input: BuildWritingWorkspaceToolsInput,
  stageBodies: Map<ShortWorkspaceStageId, string>
): AgentTool {
  const allowed = readableStageIds(input);
  return defineTool({
    name: "read_workspace_content",
    label: "读取工作区内容",
    description: `分页读取当前${workspaceKindLabel(input)}某一阶段的实时内容。仅允许：${allowed
      .map((stageId) => `${stageLabel(input, stageId)}(${stageId})`)
      .join("、")}。每次只读取一个阶段；根据 next_offset 继续调用可读完整个文件。draft 只返回目录，章节原文使用 read_draft_sections。`,
    parameters: Type.Object({
      stage_id: literalUnion(allowed),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      max_characters: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: SHORT_DOCUMENT_PAGE_MAX_CHARACTERS
        })
      )
    }),
    execute: async (_toolCallId, params) => {
      const stageId = String(params.stage_id) as ShortWorkspaceStageId;
      if (!allowed.includes(stageId)) {
        return textResult(
          `当前智能体不允许读取「${stageLabel(input, stageId)}」。`
        );
      }
      if (stageId === "draft") {
        const shared = input.sharedState;
        const orderedIds =
          shared?.expertSectionOrder ??
          input.workspace.expertDraft.sections.map((section) => section.id);
        const sections = orderedIds
          .map(
            (sectionId) =>
              shared?.expertSections.get(sectionId) ??
              input.workspace.expertDraft.sections.find(
                (section) => section.id === sectionId
              )
          )
          .filter((section): section is ExpertDraftSectionSnapshot => Boolean(section));
        const index = sections
          .map(
            (section, sectionIndex) =>
              `${sectionIndex + 1}. ${section.title}（${section.id}）` +
              `${isProvisionalExpertDraftSectionId(section.id) ? "〔本轮待创建〕" : ""}\n` +
              `   字数要求：${section.wordCountRequirement || "未设置"}\n` +
              `   正文文件：${section.body.title}（${section.body.documentId}）｜${fileSizeLabel(section.body.content)}\n` +
              `   人物状态文件：${section.characterState.title}（${section.characterState.documentId}）｜${fileSizeLabel(section.characterState.content)}`
          )
          .join("\n");
        const directoryRevision =
          shared?.expertDraftDirectoryBaseRevision ??
          input.workspace.expertDraft.revision;
        return textResult(
          `${workspaceTitleLabel(input)}：《${input.workspace.title}》\n【正文目录】（draft）\n` +
          `目录版本：${directoryRevision}\n` +
          `${draftUnitLabel(input)}数：${sections.length}\n\n${index}\n\n` +
          `这里只返回文件映射，不返回${draftUnitLabel(input)}原文。读取原文请调用 read_draft_sections：` +
          `整篇扫描用 mode=preview，需要精读或改写的${draftUnitLabel(input)}再用 mode=full。`
        );
      }
      const storedBody = stageBodies.get(stageId) ?? "";
      const requestedOffset = Number(params.offset ?? 0);
      const page = readShortDocumentPage(
        storedBody,
        requestedOffset,
        Number(params.max_characters ?? SHORT_DOCUMENT_PAGE_DEFAULT_CHARACTERS)
      );
      if (requestedOffset > page.totalCharacters) {
        return textResult(
          `未读取：offset ${requestedOffset} 超过「${stageLabel(input, stageId)}」总字符数 ${page.totalCharacters}。`
        );
      }
      return textResult(
        `${workspaceTitleLabel(input)}：《${input.workspace.title}》\n【${stageLabel(input, stageId)}】（${stageId}）\n` +
        `${renderShortDocumentPageMetadata(page)}\n\n${page.content || "该阶段当前文本为空。"}`
      );
    }
  });
}

function buildSearchWorkspaceTextTool(
  input: BuildWritingWorkspaceToolsInput,
  stageBodies: Map<ShortWorkspaceStageId, string>,
  expertSections: ExpertSectionMap
): AgentTool {
  const allowed = readableStageIds(input);
  return defineTool({
    name: "search_workspace_text",
    label: "搜索工作区文本",
    description:
      `在当前智能体可读的${workspaceKindLabel(input)}阶段中按原文搜索，只返回命中位置和少量上下文；局部替换前可先用它定位准确原文。`,
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 600 }),
      stage_id: Type.Optional(literalUnion(allowed)),
      max_matches: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
      context_chars: Type.Optional(Type.Integer({ minimum: 10, maximum: 300 }))
    }),
    execute: async (_toolCallId, params) => {
      const query = String(params.query ?? "");
      const selected = params.stage_id
        ? [String(params.stage_id) as ShortWorkspaceStageId]
        : allowed;
      const maxMatches = Math.min(50, Math.max(1, Number(params.max_matches ?? 10)));
      const contextChars = Math.min(300, Math.max(10, Number(params.context_chars ?? 60)));
      const matches: string[] = [];
      for (const stageId of selected) {
        if (!allowed.includes(stageId)) continue;
        const sources = stageId === "draft"
          ? orderedExpertSections(input, expertSections).map((section) => ({
              label: `${section.title}（${section.id}）`,
              body: section.body.content
            }))
          : [{ label: `${stageLabel(input, stageId)}(${stageId})`, body: stageBodies.get(stageId) ?? "" }];
        for (const source of sources) {
          let cursor = 0;
          while (matches.length < maxMatches) {
            const index = source.body.indexOf(query, cursor);
            if (index < 0) break;
            const { line, column } = lineColumnAt(source.body, index);
            const start = Math.max(0, index - contextChars);
            const end = Math.min(
              source.body.length,
              index + query.length + contextChars
            );
            matches.push(
              `${source.label} ${line}:${column} ${start > 0 ? "…" : ""}${source.body.slice(start, end)}${end < source.body.length ? "…" : ""}`
            );
            cursor = index + Math.max(1, query.length);
          }
          if (matches.length >= maxMatches) break;
        }
      }
      const truncatedLabels = selected
        .filter((stageId) =>
          input.workspace.stages.some(
            (stage) => stage.stageId === stageId && stage.truncated
          )
        )
        .map((stageId) => stageLabel(input, stageId));
      const truncationNote = truncatedLabels.length
        ? `\n\n注意：${truncatedLabels.join("、")}仅搜索了本轮可见的前段快照，不能据此判断全文无匹配。`
        : "";
      return textResult(
        matches.length
          ? `${matches.join("\n\n")}${truncationNote}`
          : truncatedLabels.length
            ? `本轮可见快照中没有找到匹配文本。${truncationNote}`
            : "没有找到匹配文本。"
      );
    }
  });
}

function buildCharacterTools(
  input: BuildWritingWorkspaceToolsInput,
  stageBodies: Map<ShortWorkspaceStageId, string>,
  stageRevisions: Map<ShortWorkspaceStageId, string>,
  sharedState: ShortWorkspaceToolSharedState
): AgentTool[] {
  const fullyRead = new Map<string, string>();
  const readCoverage = new Map<string, ShortDocumentReadCoverage>();
  // Older persisted session fixtures can reach the runtime without passing
  // through the latest snapshot parser. Treat an absent structure as the
  // backwards-compatible text format here as well.
  const characterStructure = input.workspace.characterStructure ?? {
    format: "text" as const
  };
  const isList = characterStructure.format === "list";
  const overviewId = "character_design";
  const orderedItems = () =>
    sharedState.characterItemOrder
      .map((id) => sharedState.characterItems.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const resolveTarget = (itemId?: string) => {
    if (!isList) {
      if (itemId) throw new Error("文本样式人物结构不接受 item_id。");
      return {
        documentId: overviewId,
        title: "人物",
        content: stageBodies.get("character_design") ?? "",
        revision: stageRevisions.get("character_design")!,
        itemId: undefined
      };
    }
    if (!itemId) {
      return {
        documentId: overviewId,
        title: "概览",
        content: stageBodies.get("character_design") ?? "",
        revision: stageRevisions.get("character_design")!,
        itemId: undefined
      };
    }
    const item = sharedState.characterItems.get(itemId);
    if (!item) throw new Error("人物条目不存在或已删除。");
    return {
      documentId: item.id,
      title: item.title,
      content: item.content,
      revision: item.revision,
      itemId: item.id
    };
  };
  const updateTarget = (
    target: ReturnType<typeof resolveTarget>,
    text: string,
    summary: string
  ) => {
    const baseRevision = target.revision;
    const revision = createShortWorkspaceContentRevision(text);
    if (target.itemId) {
      const item = sharedState.characterItems.get(target.itemId)!;
      sharedState.characterItems.set(target.itemId, { ...item, content: text, revision });
    } else {
      stageBodies.set("character_design", text);
      stageRevisions.set("character_design", revision);
    }
    fullyRead.set(target.documentId, text);
    return textResult(summary, {
      kind: "workspace-character-file-mutation",
      workspaceId: input.workspace.id,
      stageId: "character_design",
      documentId: target.documentId,
      ...(target.itemId ? { itemId: target.itemId } : {}),
      text,
      baseRevision,
      summary
    });
  };
  const tools: AgentTool[] = [
    defineTool({
      name: "list_characters",
      label: "列出人物",
      description: "列出当前人物结构格式、人物概览和有序人物条目，只返回业务 ID 与标题。",
      parameters: Type.Object({}),
      execute: async () =>
        textResult(JSON.stringify(
          isList
            ? {
                format: "list",
                overview: { title: "概览" },
                items: orderedItems().map(({ id, title }) => ({ item_id: id, title }))
              }
            : { format: "text", title: "人物" },
          null,
          2
        ))
    }),
    defineTool({
      name: "search_characters",
      label: "搜索人物",
      description: "搜索人物文本、概览和条目正文，返回 item_id、标题及少量上下文。",
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: 256 }),
        max_matches: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 }))
      }),
      execute: async (_id, params) => {
        const query = String(params.query);
        const sources = [
          { title: isList ? "概览" : "人物", content: stageBodies.get("character_design") ?? "" },
          ...(isList
            ? orderedItems().map((item) => ({
                item_id: item.id,
                title: item.title,
                content: item.content
              }))
            : [])
        ];
        const hits = [];
        const max = Number(params.max_matches ?? 20);
        for (const source of sources) {
          const index = source.content.indexOf(query);
          if (index < 0) continue;
          hits.push({
            ...( "item_id" in source ? { item_id: source.item_id } : {}),
            title: source.title,
            snippet: source.content.slice(Math.max(0, index - 100), index + query.length + 100)
          });
          if (hits.length >= max) break;
        }
        return textResult(JSON.stringify({ hits }, null, 2));
      }
    }),
    defineTool({
      name: "read_character",
      label: "读取人物",
      description:
        "读取人物文本。条目样式省略 item_id 读取概览，指定 item_id 读取条目；" +
        "mode=preview 返回首尾摘要，mode=full 分页返回正文。按 next_offset 连续读完所有页后才建立编辑凭据。",
      parameters: Type.Object({
        item_id: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
        mode: Type.Optional(Type.Union([Type.Literal("preview"), Type.Literal("full")])),
        offset: Type.Optional(Type.Integer({ minimum: 0 })),
        max_characters: Type.Optional(
          Type.Integer({
            minimum: 1,
            maximum: SHORT_DOCUMENT_PAGE_MAX_CHARACTERS
          })
        )
      }),
      execute: async (_id, params) => {
        const target = resolveTarget(params.item_id ? String(params.item_id) : undefined);
        const mode = params.mode ?? "full";
        if (mode === "preview") {
          const visible =
            target.content.length > 480
              ? `${target.content.slice(0, 240)}\n\n……\n\n${target.content.slice(-240)}`
              : target.content;
          return textResult(`【${target.title}】\n\n${visible || "（正文为空）"}`);
        }
        const requestedOffset = Number(params.offset ?? 0);
        const page = readShortDocumentPage(
          target.content,
          requestedOffset,
          Number(params.max_characters ?? SHORT_DOCUMENT_PAGE_DEFAULT_CHARACTERS)
        );
        if (requestedOffset > page.totalCharacters) {
          return textResult(
            `未读取：offset ${requestedOffset} 超过「${target.title}」总字符数 ${page.totalCharacters}。`
          );
        }
        if (recordShortDocumentPage(readCoverage, target.documentId, page)) {
          fullyRead.set(target.documentId, target.content);
        }
        return textResult(
          `【${target.title}】\n${renderShortDocumentPageMetadata(page)}\n\n` +
          `${page.content || "（正文为空）"}`
        );
      }
    })
  ];
  if (input.profile.id !== "character_design" || !isList) return tools;

  tools.push(
    defineTool({
      name: "create_character_file",
      label: "创建人物文件",
      description: "创建一个空白人物 Markdown 条目并返回稳定 item_id；随后可立即写入。",
      parameters: Type.Object({ title: Type.String({ minLength: 1, maxLength: 256 }) }),
      executionMode: "sequential",
      execute: async (_id, params) => {
        const title = String(params.title).trim();
        if (
          orderedItems().some(
            (item) =>
              item.title.toLocaleLowerCase() === title.toLocaleLowerCase()
          )
        ) {
          throw new Error("已存在同名人物条目。");
        }
        sharedState.pendingCharacterSeq += 1;
        const itemId = `character_${Date.now().toString(36)}_${sharedState.pendingCharacterSeq}`;
        const revision = createShortWorkspaceContentRevision("");
        sharedState.characterItems.set(itemId, {
          id: itemId,
          title,
          order: sharedState.characterItemOrder.length + 1,
          content: "",
          revision,
          provisional: true
        });
        sharedState.characterItemOrder.push(itemId);
        const summary = `已生成人物条目“${title}”的创建提案，等待用户审阅。`;
        return textResult(`${summary}\nitem_id=${itemId}`, {
          kind: "workspace-character-structure-mutation",
          workspaceId: input.workspace.id,
          stageId: "character_design",
          mutation: { type: "createItem", title, provisionalItemId: itemId },
          baseRevision: stageRevisions.get("character_design")!,
          summary
        });
      }
    }),
    defineTool({
      name: "write_character_file",
      label: "写入人物文件",
      description:
        "覆盖人物概览或条目全文。省略 item_id 只写概览（人物一览/索引），指定 item_id 写独立人物卡；不要把完整人物卡或剧情原文整段写入概览。已有内容必须先完整读取并显式允许覆盖。",
      parameters: Type.Object({
        item_id: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
        text: Type.String({ minLength: 1, maxLength: 200_000 }),
        allow_overwrite_existing: Type.Optional(Type.Boolean())
      }),
      executionMode: "sequential",
      execute: async (_id, params) => {
        const target = resolveTarget(params.item_id ? String(params.item_id) : undefined);
        if (target.content.trim() && !fullyRead.has(target.documentId)) {
          return textResult("未写入：目标已有正文，请先用 read_character（mode=full）完整读取。");
        }
        if (target.content.trim() && params.allow_overwrite_existing !== true) {
          return textResult("未写入：整体重写已有正文需设置 allow_overwrite_existing=true。");
        }
        return updateTarget(
          target,
          String(params.text),
          `已生成覆盖“${target.title}”的变更，等待用户审阅。`
        );
      }
    }),
    defineTool({
      name: "edit_character_file",
      label: "编辑人物文件",
      description: "在完整读取的人物概览或条目中按唯一原文片段精确替换。",
      parameters: Type.Object({
        item_id: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
        replacements: Type.Array(Type.Object({
          original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
          new_text: Type.String({ maxLength: 20_000 })
        }), { minItems: 1, maxItems: 20 })
      }),
      executionMode: "sequential",
      execute: async (_id, params) => {
        const target = resolveTarget(params.item_id ? String(params.item_id) : undefined);
        if (!fullyRead.has(target.documentId)) {
          return textResult("未编辑：请先用 read_character（mode=full）完整读取目标内容。");
        }
        const result = replaceText(target.content, params.replacements as Array<{ original_text: string; new_text: string }>);
        if (result.error || result.next === undefined) return textResult(`未编辑：${result.error}`);
        return updateTarget(target, result.next, `已生成“${target.title}”的局部变更，等待用户审阅。`);
      }
    }),
    ...buildCharacterStructureMutationTools(input, sharedState, stageRevisions, fullyRead)
  );
  return tools;
}

function buildCharacterStructureMutationTools(
  input: BuildWritingWorkspaceToolsInput,
  sharedState: ShortWorkspaceToolSharedState,
  stageRevisions: Map<ShortWorkspaceStageId, string>,
  fullyRead: Map<string, string>
): AgentTool[] {
  const proposal = (mutation: Extract<ShortWorkspaceToolDetails, { kind: "workspace-character-structure-mutation" }>["mutation"], summary: string) =>
    textResult(summary, {
      kind: "workspace-character-structure-mutation",
      workspaceId: input.workspace.id,
      stageId: "character_design",
      mutation,
      baseRevision: stageRevisions.get("character_design")!,
      summary
    });
  return [
    defineTool({
      name: "rename_character_item",
      label: "修改人物名称",
      description: "修改人物条目标题，不改正文。",
      parameters: Type.Object({ item_id: Type.String({ minLength: 1, maxLength: 512 }), title: Type.String({ minLength: 1, maxLength: 256 }) }),
      executionMode: "sequential",
      execute: async (_id, params) => {
        const item = sharedState.characterItems.get(String(params.item_id));
        if (!item) throw new Error("人物条目不存在。");
        const previousTitle = item.title;
        const title = String(params.title).trim();
        if (
          [...sharedState.characterItems.values()].some(
            (candidate) =>
              candidate.id !== item.id &&
              candidate.title.toLocaleLowerCase() === title.toLocaleLowerCase()
          )
        ) {
          throw new Error("已存在同名人物条目。");
        }
        sharedState.characterItems.set(item.id, { ...item, title });
        return proposal({ type: "updateItem", itemId: item.id, previousTitle, title }, `已生成人物条目改名提案：${previousTitle} → ${title}`);
      }
    }),
    defineTool({
      name: "move_character_item",
      label: "移动人物条目",
      description: "将人物条目上移或下移一位。",
      parameters: Type.Object({ item_id: Type.String({ minLength: 1, maxLength: 512 }), direction: Type.Union([Type.Literal("up"), Type.Literal("down")]) }),
      executionMode: "sequential",
      execute: async (_id, params) => {
        const itemId = String(params.item_id);
        const item = sharedState.characterItems.get(itemId);
        if (!item) throw new Error("人物条目不存在。");
        const index = sharedState.characterItemOrder.indexOf(itemId);
        const direction = params.direction as "up" | "down";
        const target = direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= sharedState.characterItemOrder.length) throw new Error("人物条目已经位于列表边界。");
        [sharedState.characterItemOrder[index], sharedState.characterItemOrder[target]] = [sharedState.characterItemOrder[target]!, sharedState.characterItemOrder[index]!];
        return proposal({ type: "moveItem", itemId, direction, title: item.title }, `已生成人物条目“${item.title}”的排序提案。`);
      }
    }),
    defineTool({
      name: "delete_character_file",
      label: "删除人物文件",
      description: "删除已完整读取的人物条目及正文；人物概览不能删除。",
      parameters: Type.Object({ item_id: Type.String({ minLength: 1, maxLength: 512 }) }),
      executionMode: "sequential",
      execute: async (_id, params) => {
        const itemId = String(params.item_id);
        const item = sharedState.characterItems.get(itemId);
        if (!item) throw new Error("人物条目不存在。");
        if (!fullyRead.has(itemId)) return textResult("未删除：请先用 read_character（mode=full）完整读取该人物条目。");
        sharedState.characterItems.delete(itemId);
        sharedState.characterItemOrder = sharedState.characterItemOrder.filter((id) => id !== itemId);
        return proposal({ type: "deleteItem", itemId, title: item.title, deletedText: item.content }, `已生成人物条目“${item.title}”的删除提案，等待用户审阅。`);
      }
    })
  ];
}

function buildQueryLinkedMaterialEntriesTool(
  input: BuildWritingWorkspaceToolsInput
): AgentTool {
  const allowedKinds = input.profile.readAccess.material;
  return defineTool({
    name: "query_linked_material_entries",
    label: "查询关联素材条目",
    description:
      "列出、搜索或读取本轮显式附加且位于当前智能体读取范围内的素材。未显式附加的素材不会被读取。",
    parameters: Type.Object({
      mode: Type.Union([Type.Literal("list"), Type.Literal("search"), Type.Literal("read")]),
      query: Type.Optional(Type.String({ maxLength: 300 })),
      entry_name: Type.Optional(Type.String({ maxLength: 240 })),
      material_kind: Type.Optional(literalUnion(allowedKinds.length ? allowedKinds : SHORT_MATERIAL_KINDS))
    }),
    execute: async (_toolCallId, params) => {
      const items = (input.attachedMaterials ?? []).filter(
        (item) => item.kind !== undefined && allowedKinds.includes(item.kind)
      );
      const kind = params.material_kind ? String(params.material_kind) : "";
      const scoped = kind ? items.filter((item) => item.kind === kind) : items;
      if (params.mode === "read") {
        const name = String(params.entry_name ?? params.query ?? "").trim();
        const found = scoped.find((item) => item.title === name);
        return textResult(
          found
            ? `【${found.title}】${found.kind ? `（${found.kind}）` : ""}\n\n${found.content}`
            : "没有找到同名的已附加素材条目。"
        );
      }
      if (params.mode === "search") {
        const query = String(params.query ?? "").trim();
        const found = scoped.filter(
          (item) => item.title.includes(query) || item.content.includes(query)
        );
        return textResult(
          found.length
            ? found
                .map((item) => `- ${item.title}${item.kind ? ` [${item.kind}]` : ""}: ${item.content.slice(0, 220)}`)
                .join("\n")
            : "已附加素材中没有匹配条目。"
        );
      }
      return textResult(
        scoped.length
          ? scoped.map((item) => `- ${item.title}${item.kind ? ` [${item.kind}]` : ""}`).join("\n")
          : "本轮没有附加当前智能体可读的素材。"
      );
    }
  });
}

function buildLoadSkillTool(input: BuildWritingWorkspaceToolsInput): AgentTool {
  const allowedKinds = input.profile.readAccess.skill;
  return defineTool({
    name: "load_skill",
    label: "加载技能",
    description: LOAD_SKILL_TOOL_DESCRIPTION,
    parameters: Type.Object({
      name: Type.String(LOAD_SKILL_NAME_PARAMETER)
    }),
    execute: async (_toolCallId, params) => {
      const name = String(params.name ?? "");
      const attached = input.attachedSkills ?? [];
      const isReadable = (item: LoadSkillCandidate): boolean =>
        item.kind !== undefined &&
        (allowedKinds as readonly string[]).includes(item.kind);
      const result = resolveAttachedSkill(name, attached, isReadable);
      return textResult(
        formatLoadSkillToolResult(name, result, attached.filter(isReadable))
      );
    }
  });
}

function buildSwitchStorylineStageTool(
  input: BuildWritingWorkspaceToolsInput,
  selectStage: (stageId: ShortWorkspaceStageId) => void
): AgentTool {
  const plotStages = storylineStageIds(input);
  return defineTool({
    name: "switch_storyline_stage",
    label: "切换剧情方向",
    description: `切换${workspaceKindLabel(input)}剧情父节点下的当前子方向；只改变选中项，不写入内容。`,
    parameters: Type.Object({ target_stage_id: literalUnion(plotStages) }),
    execute: async (_toolCallId, params) => {
      const stageId = String(params.target_stage_id) as (typeof plotStages)[number];
      if (!plotStages.includes(stageId)) {
        return textResult(
          `当前${workspaceKindLabel(input)}没有剧情方向「${stageId}」。`
        );
      }
      selectStage(stageId);
      return textResult(`已切换到「${stageLabel(input, stageId)}」。`, {
        kind: "workspace-stage-selection",
        workspaceId: input.workspace.id,
        stageId
      });
    },
    executionMode: "sequential"
  });
}

function editorMutationResult(
  input: BuildWritingWorkspaceToolsInput,
  stageBodies: Map<ShortWorkspaceStageId, string>,
  stageRevisions: Map<ShortWorkspaceStageId, string>,
  stageId: ShortWorkspaceStageId,
  text: string,
  summary: string
): AgentToolResult<ShortWorkspaceToolDetails> {
  const baseRevision = stageRevisions.get(stageId);
  if (!baseRevision) {
    return textResult(
      `未写入：缺少「${stageLabel(input, stageId)}」的基础版本标识。`
    );
  }
  stageBodies.set(stageId, text);
  stageRevisions.set(stageId, createShortWorkspaceContentRevision(text));
  const resultSummary = input.writeApprovalMode === "auto-approve"
    ? summary.replace(
        "，等待用户审阅。",
        "，将立即提交自动保存队列；以审批卡的落盘状态为准。"
      )
    : summary;
  return textResult(resultSummary, {
    kind: "workspace-editor-mutation",
    workspaceId: input.workspace.id,
    stageId,
    text,
    baseRevision,
    summary: resultSummary
  });
}

function expertDraftFileMutationResult(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap,
  sectionId: string,
  fileKind: "body" | "characterState",
  text: string,
  summary: string
): AgentToolResult<ShortWorkspaceToolDetails> {
  const section = expertSections.get(sectionId);
  const file = section?.[fileKind];
  if (!section || !file) {
    return textResult(
      `未写入：没有找到${draftContentUnitLabel(input)} ${sectionId} 的目标文件。`
    );
  }
  const baseRevision = file.revision;
  expertSections.set(sectionId, {
    ...section,
    [fileKind]: {
      ...file,
      content: text,
      revision: createShortWorkspaceContentRevision(text)
    }
  });
  const resultSummary = input.writeApprovalMode === "auto-approve"
    ? summary.replace(
        "，等待用户审阅。",
        "，将立即提交自动保存队列；以审批卡的落盘状态为准。"
      )
    : summary;
  return textResult(resultSummary, {
    kind: "workspace-expert-draft-file-mutation",
    workspaceId: input.workspace.id,
    stageId: "draft",
    documentId: file.documentId,
    sectionId,
    fileKind,
    text,
    baseRevision,
    summary: resultSummary
  });
}

function buildWriteWorkspaceEditorTool(
  input: BuildWritingWorkspaceToolsInput,
  stageBodies: Map<ShortWorkspaceStageId, string>,
  stageRevisions: Map<ShortWorkspaceStageId, string>,
  currentStage: () => ShortWorkspaceStageId
): AgentTool {
  const allowedTargets: ShortWorkspaceStageId[] = writableStageIds(input).filter(
    (stageId) => stageId !== "draft"
  );
  return defineTool({
    name: "write_workspace_editor",
    label: "写入当前文本编辑框",
    description:
      "覆盖目标阶段全文。仅用于空白阶段或用户明确要求整体重写；局部修改必须使用 replace_current_stage_text。",
    parameters: Type.Object({
      target_stage_id: Type.Optional(literalUnion(allowedTargets)),
      text: Type.String({ minLength: 1, maxLength: 200_000 }),
      allow_overwrite_existing: Type.Optional(Type.Boolean()),
      mode: Type.Literal("replace")
    }),
    execute: async (_toolCallId, params) => {
      const fallback = allowedTargets.includes(currentStage())
        ? currentStage()
        : allowedTargets[0]!;
      const stageId = params.target_stage_id
        ? (String(params.target_stage_id) as ShortWorkspaceStageId)
        : fallback;
      const snapshot = input.workspace.stages.find(
        (stage) => stage.stageId === stageId
      );
      if (snapshot?.truncated) {
        return textResult(
          `未写入：「${stageLabel(input, stageId)}」超过本轮安全快照上限，无法在看不到全文尾部时覆盖阶段内容。`
        );
      }
      const current = stageBodies.get(stageId) ?? "";
      if (current.trim() && params.allow_overwrite_existing !== true) {
        return textResult(
          `「${stageLabel(input, stageId)}」已有内容。局部修改请使用 replace_current_stage_text；整体重写需明确设置 allow_overwrite_existing=true。`
        );
      }
      const text = String(params.text ?? "").trim();
      if (!text) return textResult("未写入：文本为空。");
      return editorMutationResult(
        input,
        stageBodies,
        stageRevisions,
        stageId,
        text,
        `已生成覆盖「${stageLabel(input, stageId)}」的文本变更，等待用户审阅。`
      );
    },
    executionMode: "sequential"
  });
}

function buildReplaceStageTextTool(
  input: BuildWritingWorkspaceToolsInput,
  stageBodies: Map<ShortWorkspaceStageId, string>,
  stageRevisions: Map<ShortWorkspaceStageId, string>,
  currentStage: () => ShortWorkspaceStageId,
  options: { name?: string; label?: string } = {}
): AgentTool {
  const allowedTargets = writableStageIds(input);
  return defineTool({
    name: options.name ?? "replace_current_stage_text",
    label: options.label ?? "替换当前阶段文本",
    description:
      "按原文片段精确替换当前智能体可写阶段的内容。每个 original_text 必须在目标文本中唯一存在。",
    parameters: Type.Object({
      target_stage_id: Type.Optional(literalUnion(allowedTargets)),
      replacements: Type.Array(
        Type.Object({
          original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
          new_text: Type.String({ maxLength: 20_000 })
        }),
        { minItems: 1, maxItems: 20 }
      )
    }),
    execute: async (_toolCallId, params) => {
      const fallback = allowedTargets.includes(currentStage())
        ? currentStage()
        : allowedTargets[0]!;
      const stageId = params.target_stage_id
        ? (String(params.target_stage_id) as ShortWorkspaceStageId)
        : fallback;
      const snapshot = input.workspace.stages.find(
        (stage) => stage.stageId === stageId
      );
      if (snapshot?.truncated) {
        return textResult(
          `未替换：「${stageLabel(input, stageId)}」超过本轮安全快照上限，无法在看不到全文尾部时执行局部替换。请缩小文稿或等待后续持久化编辑接口。`
        );
      }
      const replacements = params.replacements as Array<{
        original_text: string;
        new_text: string;
      }>;
      const result = replaceText(stageBodies.get(stageId) ?? "", replacements);
      if (result.error || result.next === undefined) {
        return textResult(`未替换：${result.error ?? "未知错误"}`);
      }
      return editorMutationResult(
        input,
        stageBodies,
        stageRevisions,
        stageId,
        result.next,
        `已生成「${stageLabel(input, stageId)}」的 ${result.count} 处文本变更，等待用户审阅。`
      );
    },
    executionMode: "sequential"
  });
}

function activeExpertSectionId(
  input: BuildWritingWorkspaceToolsInput
): string | undefined {
  return input.workspace.activeSectionId;
}

/**
 * Creates the per-parent-run mutation/revision overlay. Parent and child tools
 * receive this same object, while each tool set keeps its own read evidence.
 */
function createWritingWorkspaceToolSharedState(
  workspace: WritingWorkspaceSnapshot
): ShortWorkspaceToolSharedState {
  const characterStructure = workspace.characterStructure ?? {
    format: "text" as const
  };
  const expertSections = new Map(
    workspace.expertDraft.sections.map((section) => [
      section.id,
      {
        ...section,
        body: { ...section.body },
        characterState: { ...section.characterState }
      }
    ] as const)
  );
  return {
    stageBodies: new Map<ShortWorkspaceStageId, string>(
      workspace.stages.map((stage) => [stage.stageId, stage.content])
    ),
    stageRevisions: new Map<ShortWorkspaceStageId, string>(
      workspace.stages.map((stage) => [stage.stageId, stage.revision])
    ),
    characterItems: new Map(
      characterStructure.format === "list"
        ? characterStructure.items.map((item) => [
            item.id,
            {
              id: item.id,
              title: item.title,
              order: item.order,
              content: item.content,
              revision: item.revision
            }
          ] as const)
        : []
    ),
    characterItemOrder:
      characterStructure.format === "list"
        ? [...characterStructure.items]
            .sort((left, right) => left.order - right.order)
            .map(({ id }) => id)
        : [],
    pendingCharacterSeq: 0,
    expertSections,
    expertSectionOrder: workspace.expertDraft.sections.map((section) => section.id),
    pendingExpertSectionTitles: new Set<string>(),
    pendingSectionSeq: 0,
    expertDraftDirectoryBaseRevision: workspace.expertDraft.revision
  };
}

export function createShortWorkspaceToolSharedState(
  workspace: ShortWorkspaceSnapshot
): ShortWorkspaceToolSharedState {
  return createWritingWorkspaceToolSharedState(workspace);
}

export function createScriptWorkspaceToolSharedState(
  workspace: ScriptWorkspaceSnapshot
): ScriptWorkspaceToolSharedState {
  return createWritingWorkspaceToolSharedState(workspace);
}

function nextProvisionalSectionId(
  sharedState: ShortWorkspaceToolSharedState
): string {
  sharedState.pendingSectionSeq += 1;
  return `${PROVISIONAL_EXPERT_DRAFT_SECTION_ID_PREFIX}${sharedState.pendingSectionSeq}`;
}

function createBlankProvisionalSection(
  sectionId: string,
  title: string,
  wordCountRequirement: string
): ExpertDraftSectionSnapshot {
  const emptyRevision = createShortWorkspaceContentRevision("");
  return {
    id: sectionId,
    title,
    wordCountRequirement,
    body: {
      documentId: catalogDraftBodyDocumentId(sectionId),
      title,
      content: "",
      revision: emptyRevision
    },
    characterState: {
      documentId: catalogDraftCharacterStateDocumentId(sectionId),
      title: `${title} · 人物状态`,
      content: "",
      revision: emptyRevision
    }
  };
}

function orderedExpertSections(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap
): ExpertDraftSectionSnapshot[] {
  const order =
    input.sharedState?.expertSectionOrder ??
    input.workspace.expertDraft.sections.map((section) => section.id);
  return order
    .map((sectionId) => expertSections.get(sectionId))
    .filter((section): section is ExpertDraftSectionSnapshot => Boolean(section));
}

function buildRenameExpertDraftSectionTool(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap,
  sharedState: ShortWorkspaceToolSharedState
): AgentTool {
  return defineTool({
    name: "rename_draft_section",
    label: `修改${draftUnitLabel(input)}名称`,
    description:
      `修改已有${draftContentUnitLabel(input)}的目录名称；同步更新正文文件标题与人物状态文件标题，不改正文内容、不删除、不调序。` +
      `变更形成待审阅提案，由客户端按本轮审批模式处理。`,
    parameters: Type.Object({
      section_id: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
      title: Type.String({ minLength: 1, maxLength: 240 })
    }),
    execute: async (_toolCallId, params) => {
      const target = resolveDraftWriteTarget(
        input,
        expertSections,
        params.section_id
      );
      if ("error" in target) {
        return textResult(target.error.replace(/^未修改：/u, "未改名："));
      }
      const section = expertSections.get(target.sectionId);
      if (!section) {
        return textResult(
          `未改名：没有找到${draftContentUnitLabel(input)} ${target.sectionId}。`
        );
      }
      if (isProvisionalExpertDraftSectionId(section.id)) {
        return textResult(
          `未改名：${draftUnitLabel(input)}「${section.title}」尚在本轮待创建，请在创建审批通过后再改名，或在创建时直接使用目标标题。`
        );
      }
      const title = String(params.title ?? "").trim();
      if (!title) {
        return textResult(`未改名：${draftUnitLabel(input)}标题不能为空。`);
      }
      if (title === section.title) {
        return textResult(
          `未改名：「${section.title}」的标题没有变化。`
        );
      }
      const conflicting = orderedExpertSections(input, expertSections).find(
        (candidate) =>
          candidate.id !== section.id && candidate.title === title
      );
      if (conflicting) {
        return textResult(
          `未改名：正文目录已存在同名${draftUnitLabel(input)}「${title}」。`
        );
      }
      if (sharedState.pendingExpertSectionTitles.has(title)) {
        return textResult(
          `未改名：本轮待创建目录中已有同名${draftUnitLabel(input)}「${title}」。`
        );
      }

      const previousTitle = section.title;
      expertSections.set(section.id, {
        ...section,
        title,
        body: {
          ...section.body,
          title
        },
        characterState: {
          ...section.characterState,
          title: `${title} · 人物状态`
        }
      });

      const summary = `已生成将${draftUnitLabel(input)}「${previousTitle}」改名为「${title}」的变更，等待用户审阅。`;
      const resultSummary =
        input.writeApprovalMode === "auto-approve"
          ? summary.replace(
              "，等待用户审阅。",
              "，将立即提交自动保存队列；以审批卡的落盘状态为准。"
            )
          : summary;
      return textResult(resultSummary, {
        kind: "workspace-expert-draft-section-rename",
        workspaceId: input.workspace.id,
        stageId: "draft",
        sectionId: section.id,
        previousTitle,
        title,
        baseRevision: sharedState.expertDraftDirectoryBaseRevision,
        summary: resultSummary
      });
    },
    executionMode: "sequential"
  });
}

function buildDeleteExpertDraftSectionTool(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap,
  sharedState: ShortWorkspaceToolSharedState
): AgentTool {
  return defineTool({
    name: "delete_draft_section",
    label: `删除${draftUnitLabel(input)}`,
    description:
      `删除已有${draftContentUnitLabel(input)}及其正文文件、人物状态文件；正文至少保留一个${draftUnitLabel(input)}，不改名、不调序。` +
      `变更形成待审阅提案，由客户端按本轮审批模式处理。`,
    parameters: Type.Object({
      section_id: Type.Optional(Type.String({ minLength: 1, maxLength: 120 }))
    }),
    execute: async (_toolCallId, params) => {
      const target = resolveDraftWriteTarget(
        input,
        expertSections,
        params.section_id
      );
      if ("error" in target) {
        return textResult(target.error.replace(/^未修改：/u, "未删除："));
      }
      const section = expertSections.get(target.sectionId);
      if (!section) {
        return textResult(
          `未删除：没有找到${draftContentUnitLabel(input)} ${target.sectionId}。`
        );
      }
      if (isProvisionalExpertDraftSectionId(section.id)) {
        return textResult(
          `未删除：${draftUnitLabel(input)}「${section.title}」尚在本轮待创建，请拒绝对应创建审批，或待创建落盘后再删除。`
        );
      }
      if (sharedState.expertSectionOrder.length <= 1) {
        return textResult(
          `未删除：正文至少需要保留一个${draftUnitLabel(input)}。`
        );
      }

      const title = section.title;
      expertSections.delete(section.id);
      const orderIndex = sharedState.expertSectionOrder.indexOf(section.id);
      if (orderIndex >= 0) {
        sharedState.expertSectionOrder.splice(orderIndex, 1);
      }

      const summary = `已生成删除${draftUnitLabel(input)}「${title}」及其正文与人物状态文件的变更，等待用户审阅。`;
      const resultSummary =
        input.writeApprovalMode === "auto-approve"
          ? summary.replace(
              "，等待用户审阅。",
              "，将立即提交自动保存队列；以审批卡的落盘状态为准。"
            )
          : summary;
      return textResult(resultSummary, {
        kind: "workspace-expert-draft-section-deletion",
        workspaceId: input.workspace.id,
        stageId: "draft",
        sectionId: section.id,
        title,
        baseRevision: sharedState.expertDraftDirectoryBaseRevision,
        summary: resultSummary
      });
    },
    executionMode: "sequential"
  });
}

function buildCreateExpertDraftSectionsTool(
  input: BuildWritingWorkspaceToolsInput,
  sharedState: ShortWorkspaceToolSharedState
): AgentTool {
  return defineTool({
    name: "create_draft_sections",
    label: `创建${draftUnitLabel(input)}文件`,
    description:
      `一次创建一个或多个空白${draftContentUnitLabel(input)}；每${draftUnitCounter(input)}会生成独立的正文文件和人物状态文件，并返回可在同一轮继续写入的 section_id。` +
      `只新增结构，不写正文、不删除或覆盖已有${draftUnitLabel(input)}。`,
    parameters: Type.Object({
      sections: Type.Array(
        Type.Object({
          title: Type.String({ minLength: 1, maxLength: 240 }),
          word_count_requirement: Type.Optional(
            Type.String({ maxLength: 1_000 })
          )
        }),
        { minItems: 1, maxItems: 100 }
      ),
      after_section_id: Type.Optional(
        Type.String({ minLength: 1, maxLength: 120 })
      )
    }),
    execute: async (_toolCallId, params) => {
      const requested = params.sections as Array<{
        title: string;
        word_count_requirement?: string;
      }>;
      const sections = requested.map((section) => ({
        title: String(section.title ?? "").trim(),
        wordCountRequirement: String(
          section.word_count_requirement ?? ""
        ).trim()
      }));
      if (sections.some((section) => !section.title)) {
        return textResult(`未创建：${draftUnitLabel(input)}标题不能为空。`);
      }

      const duplicateTitles = sections
        .map((section) => section.title)
        .filter((title, index, titles) => titles.indexOf(title) !== index);
      if (duplicateTitles.length > 0) {
        return textResult(
          `未创建：本次参数中包含重复${draftUnitLabel(input)}标题：${[...new Set(duplicateTitles)].join("、")}。`
        );
      }

      const existingTitles = new Set([
        ...orderedExpertSections(input, sharedState.expertSections).map(
          (section) => section.title
        ),
        ...sharedState.pendingExpertSectionTitles
      ]);
      const conflicts = sections
        .map((section) => section.title)
        .filter((title) => existingTitles.has(title));
      if (conflicts.length > 0) {
        return textResult(
          `未创建：正文目录已存在同名${draftUnitLabel(input)}：${conflicts.join("、")}。初始化时请只提交尚未存在的${draftUnitLabel(input)}。`
        );
      }

      const currentCount = sharedState.expertSectionOrder.length;
      if (currentCount + sections.length > 100) {
        return textResult(
          `未创建：正文最多支持 100 个${draftUnitLabel(input)}，当前已有或待创建 ${currentCount} 个，本次请求 ${sections.length} 个。`
        );
      }

      const afterSectionId = String(params.after_section_id ?? "").trim();
      if (afterSectionId && !sharedState.expertSections.has(afterSectionId)) {
        return textResult(
          `未创建：找不到插入位置${draftUnitLabel(input)} ${afterSectionId}。`
        );
      }

      let insertAt = sharedState.expertSectionOrder.length;
      if (afterSectionId) {
        const afterIndex = sharedState.expertSectionOrder.indexOf(afterSectionId);
        if (afterIndex < 0) {
          return textResult(
            `未创建：找不到插入位置${draftUnitLabel(input)} ${afterSectionId}。`
          );
        }
        insertAt = afterIndex + 1;
      }

      const createdSections: Array<{
        title: string;
        wordCountRequirement: string;
        provisionalSectionId: string;
      }> = [];
      for (const [offset, section] of sections.entries()) {
        const provisionalSectionId = nextProvisionalSectionId(sharedState);
        const snapshot = createBlankProvisionalSection(
          provisionalSectionId,
          section.title,
          section.wordCountRequirement
        );
        sharedState.expertSections.set(provisionalSectionId, snapshot);
        sharedState.expertSectionOrder.splice(insertAt + offset, 0, provisionalSectionId);
        sharedState.pendingExpertSectionTitles.add(section.title);
        createdSections.push({
          title: section.title,
          wordCountRequirement: section.wordCountRequirement,
          provisionalSectionId
        });
      }

      const idLines = createdSections
        .map(
          (section, index) =>
            `${index + 1}. ${section.title} → section_id=${section.provisionalSectionId}`
        )
        .join("\n");
      const summary = `已生成创建 ${createdSections.length} 个空白${draftUnitLabel(input)}文件的变更，等待用户审阅。`;
      const resultSummary =
        input.writeApprovalMode === "auto-approve"
          ? summary.replace(
              "，等待用户审阅。",
              "，将立即提交自动保存队列；以审批卡的落盘状态为准。"
            )
          : summary;
      return textResult(
        `${resultSummary}\n${idLines}\n同一轮内可立即使用上述 section_id 读取或写入正文。`,
        {
          kind: "workspace-expert-draft-section-creation",
          workspaceId: input.workspace.id,
          stageId: "draft",
          sections: createdSections,
          ...(afterSectionId ? { afterSectionId } : {}),
          baseRevision: sharedState.expertDraftDirectoryBaseRevision,
          summary: resultSummary
        }
      );
    },
    executionMode: "sequential"
  });
}

function fileSizeLabel(content: string): string {
  return content.length ? `${content.length.toLocaleString("zh-CN")} 字符` : "空";
}

function previewExcerpt(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= DRAFT_PREVIEW_EXCERPT_CHARACTERS * 2) return compact;
  return (
    `${compact.slice(0, DRAFT_PREVIEW_EXCERPT_CHARACTERS)}` +
    `……〔中间省略 ${(compact.length - DRAFT_PREVIEW_EXCERPT_CHARACTERS * 2).toLocaleString("zh-CN")} 字符〕……` +
    `${compact.slice(-DRAFT_PREVIEW_EXCERPT_CHARACTERS)}`
  );
}

function renderDraftSectionPreview(
  section: ExpertDraftSectionSnapshot,
  index: number,
  fields: readonly DraftFileKind[]
): string {
  const lines = [
    `${index + 1}. 【${section.title}】 section_id: ${section.id}`,
    `   字数要求: ${section.wordCountRequirement || "未设置"}`
  ];
  for (const field of fields) {
    const file = section[field];
    lines.push(`   ${draftFileLabel(field)}（${file.documentId}）：${fileSizeLabel(file.content)}`);
    if (file.content.trim()) {
      lines.push(`   摘录：${previewExcerpt(file.content)}`);
    }
  }
  return lines.join("\n");
}

function renderDraftSectionFull(
  section: ExpertDraftSectionSnapshot,
  index: number,
  fields: readonly DraftFileKind[],
  readCoverage: Map<string, ShortDocumentReadCoverage>,
  characterLimitPerFile?: number
): { text: string; fullyReadDocumentIds: string[] } {
  const fullyReadDocumentIds: string[] = [];
  const blocks = fields.map((field) => {
    const file = section[field];
    const page = readShortDocumentPage(
      file.content,
      0,
      characterLimitPerFile ?? SHORT_DOCUMENT_PAGE_MAX_CHARACTERS
    );
    if (recordShortDocumentPage(readCoverage, file.documentId, page)) {
      fullyReadDocumentIds.push(file.documentId);
    }
    return [
      `${draftFileLabel(field)}文件: ${file.title}（${file.documentId}）`,
      `${draftFileLabel(field)}版本: ${file.revision}`,
      renderShortDocumentPageMetadata(page),
      "",
      page.content || `（${draftFileLabel(field)}为空）`,
      ...(page.nextOffset !== null
        ? [
            "",
            `（该${draftFileLabel(field)}尚未读完；请仅指定该 section_id 和 include=["${field === "body" ? "body" : "character_state"}"]，并用 offset=${page.nextOffset} 继续分页读取。未完整读取的文件不能整体覆盖。）`
          ]
        : [])
    ].join("\n");
  });
  return {
    text: [
      `===== ${index + 1}. ${section.title} =====`,
      `section_id: ${section.id}`,
      `字数要求: ${section.wordCountRequirement || "未设置"}`,
      "",
      blocks.join("\n\n")
    ].join("\n"),
    fullyReadDocumentIds
  };
}

function renderDraftDocumentPage(
  section: ExpertDraftSectionSnapshot,
  field: DraftFileKind,
  page: ShortDocumentPage
): string {
  const file = section[field];
  return [
    `===== ${section.title} =====`,
    `section_id: ${section.id}`,
    `字数要求: ${section.wordCountRequirement || "未设置"}`,
    `${draftFileLabel(field)}文件: ${file.title}（${file.documentId}）`,
    `${draftFileLabel(field)}版本: ${file.revision}`,
    renderShortDocumentPageMetadata(page),
    "",
    page.content || `（${draftFileLabel(field)}为空）`
  ].join("\n");
}

function buildReadDraftSectionsTool(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap,
  readExpertFileIds: Set<string>,
  readCoverage: Map<string, ShortDocumentReadCoverage>
): AgentTool {
  return defineTool({
    name: "read_draft_sections",
    label:
      input.workspaceType === "script" ? "读取剧集正文" : "读取正文章节",
    description:
      `按 section_id 批量读取${draftContentUnitLabel(input)}文件，按目录顺序返回。` +
      "mode=preview 只返回标题、字数和首尾摘录，用于整篇扫描定位；" +
      `mode=full 的批量读取单次最多 ${DRAFT_FULL_READ_MAX_SECTIONS} ${draftUnitCounter(input)}且合计不超过 ${DRAFT_FULL_READ_CHARACTER_BUDGET.toLocaleString("zh-CN")} 个字符。` +
      "单个超长文件请只指定一个 section_id 和一种 include，并根据 next_offset 使用 offset、max_characters 连续分页读取。" +
      `只有被 mode=full 完整读取的文件才获得整${draftUnitCounter(input)}覆盖权限。`,
    parameters: Type.Object({
      section_ids: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), {
        minItems: 1,
        maxItems: 100
      }),
      include: Type.Optional(
        Type.Array(literalUnion(DRAFT_FILE_PARAMETER_VALUES), {
          minItems: 1,
          maxItems: DRAFT_FILE_PARAMETER_VALUES.length
        })
      ),
      mode: Type.Optional(literalUnion(["full", "preview"] as const)),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      max_characters: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: SHORT_DOCUMENT_PAGE_MAX_CHARACTERS
        })
      )
    }),
    execute: async (_toolCallId, params) => {
      const requested = (params.section_ids as string[])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      const requestedIds = new Set(requested);
      const includeValues = Array.isArray(params.include) && params.include.length
        ? (params.include as string[]).map((value) => String(value))
        : ["body"];
      const fields = DRAFT_FILE_PARAMETER_VALUES.filter((value) =>
        includeValues.includes(value)
      ).map(toDraftFileKind);
      if (fields.length === 0) fields.push("body");

      const targets = orderedExpertSections(input, expertSections).filter((section) =>
        requestedIds.has(section.id)
      );
      const missing = requested.filter(
        (sectionId) => !targets.some((section) => section.id === sectionId)
      );
      if (targets.length === 0) {
        return textResult(
          `没有找到这些${draftContentUnitLabel(input)}：${missing.join("、")}。当前目录：${orderedExpertSections(
            input,
            expertSections
          )
            .map((section) => `${section.title}（${section.id}）`)
            .join("、")}`
        );
      }

      const directoryRevision =
        input.sharedState?.expertDraftDirectoryBaseRevision ??
        input.workspace.expertDraft.revision;
      const header = [
        `${workspaceTitleLabel(input)}：《${input.workspace.title}》`,
        `正文目录版本：${directoryRevision}`
      ];
      const missingNote = missing.length
        ? [`\n没有找到这些 section_id：${missing.join("、")}。`]
        : [];

      if (String(params.mode ?? "full") === "preview") {
        const previews = targets.map((section, index) =>
          renderDraftSectionPreview(section, index, fields)
        );
        return textResult(
          [
            ...header,
            `预览 ${targets.length} ${draftUnitCounter(input)}（${fields.map(draftFileLabel).join("、")}）。预览不算完整读取，改写前仍需对目标${draftUnitLabel(input)}使用 mode=full。`,
            "",
            previews.join("\n\n"),
            ...missingNote
          ].join("\n")
        );
      }

      const explicitPagination =
        params.offset !== undefined || params.max_characters !== undefined;
      if (explicitPagination) {
        if (requested.length !== 1 || fields.length !== 1) {
          return textResult(
            "未读取：分页读取必须只指定一个 section_id，并且 include 只能包含 body 或 character_state 其中一种。"
          );
        }
        const section = targets[0]!;
        const field = fields[0]!;
        const file = section[field];
        const requestedOffset = Number(params.offset ?? 0);
        const page = readShortDocumentPage(
          file.content,
          requestedOffset,
          Number(params.max_characters ?? SHORT_DOCUMENT_PAGE_DEFAULT_CHARACTERS)
        );
        if (requestedOffset > page.totalCharacters) {
          return textResult(
            `未读取：offset ${requestedOffset} 超过「${section.title}」${draftFileLabel(field)}总字符数 ${page.totalCharacters}。`
          );
        }
        if (recordShortDocumentPage(readCoverage, file.documentId, page)) {
          readExpertFileIds.add(file.documentId);
        }
        return textResult(
          [...header, renderDraftDocumentPage(section, field, page), ...missingNote].join(
            "\n"
          )
        );
      }

      const rendered: string[] = [];
      let usedCharacters = 0;
      let fullyReadFiles = 0;
      let cutoffIndex = targets.length;
      for (const [index, section] of targets.entries()) {
        const cost = fields.reduce(
          (total, field) => total + section[field].content.length,
          0
        );
        const first = index === 0;
        if (
          !first &&
          (rendered.length >= DRAFT_FULL_READ_MAX_SECTIONS ||
            usedCharacters + cost > DRAFT_FULL_READ_CHARACTER_BUDGET)
        ) {
          cutoffIndex = index;
          break;
        }
        const oversizedAlone = first && cost > DRAFT_FULL_READ_CHARACTER_BUDGET;
        const block = renderDraftSectionFull(
          section,
          index,
          fields,
          readCoverage,
          oversizedAlone
            ? Math.floor(DRAFT_FULL_READ_CHARACTER_BUDGET / fields.length)
            : undefined
        );
        block.fullyReadDocumentIds.forEach((documentId) => {
          readExpertFileIds.add(documentId);
          fullyReadFiles += 1;
        });
        rendered.push(block.text);
        usedCharacters += cost;
      }

      const skipped = targets.slice(cutoffIndex);
      const skippedNote = skipped.length
        ? [
            `\n本次未读取 ${skipped.length} ${draftUnitCounter(input)}（已达单次读取上限）：${skipped
              .map((section) => `${section.title}（${section.id}）`)
              .join("、")}。请再次调用 read_draft_sections 继续分批读取。`
          ]
        : [];
      return textResult(
        [
          ...header,
          `本次返回 ${rendered.length} ${draftUnitCounter(input)}的${fields.map(draftFileLabel).join("和")}；已完整读取 ${fullyReadFiles} 个文件。批量内容成本约 ${usedCharacters.toLocaleString("zh-CN")} 字符。`,
          "",
          rendered.join("\n\n"),
          ...skippedNote,
          ...missingNote
        ].join("\n")
      );
    }
  });
}

/**
 * Resolves the write target shared by both draft agents. The short draft
 * coordinator may receive an active section as its default target while still
 * retaining cross-section authority.
 */
function resolveDraftWriteTarget(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap,
  rawSectionId: unknown
): { sectionId: string } | { error: string } {
  const requested = String(rawSectionId ?? "").trim();
  const active = activeExpertSectionId(input);
  const sectionId = requested || active || "";
  if (!sectionId) {
    return {
      error: `未修改：当前没有选中${draftUnitLabel(input)}，请在参数中给出 section_id。`
    };
  }
  if (!expertSections.has(sectionId)) {
    return {
      error: `未修改：没有找到${draftContentUnitLabel(input)} ${sectionId}。`
    };
  }
  return { sectionId };
}

function draftTargetParameters() {
  return {
    section_id: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    file: Type.Optional(literalUnion(DRAFT_FILE_PARAMETER_VALUES))
  };
}

function buildWriteDraftSectionTool(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap,
  readExpertFileIds: Set<string>
): AgentTool {
  return defineTool({
    name: "write_draft_section",
    label:
      input.workspaceType === "script" ? "写入剧集正文" : "写入正文章节",
    description:
      `把完整内容写入指定${draftUnitLabel(input)}的正文或人物状态文件。file 默认 body；section_id 省略时写入当前选中${draftUnitLabel(input)}。` +
      `已有内容时必须先用 read_draft_sections（mode=full）读完该文件，并明确设置 allow_overwrite_existing=true 才能整${draftUnitCounter(input)}覆盖。` +
      scriptBodyToolConstraint(input),
    parameters: Type.Object({
      ...draftTargetParameters(),
      text: Type.String({ minLength: 1, maxLength: 200_000 }),
      allow_overwrite_existing: Type.Optional(Type.Boolean())
    }),
    execute: async (_toolCallId, params) => {
      const target = resolveDraftWriteTarget(input, expertSections, params.section_id);
      if ("error" in target) return textResult(target.error.replace("未修改：", "未写入："));
      const field = toDraftFileKind(params.file);
      const section = expertSections.get(target.sectionId)!;
      const file = section[field];
      const label = draftFileLabel(field);
      if (file.content.trim() && !readExpertFileIds.has(file.documentId)) {
        return textResult(
          `未写入：请先读取「${section.title}」的完整${label}文件（read_draft_sections，mode=full），再执行整${draftUnitCounter(input)}覆盖。`
        );
      }
      if (file.content.trim() && params.allow_overwrite_existing !== true) {
        return textResult(
          `「${section.title}」的${label}已有内容；局部修改请使用 replace_draft_section_text，整${draftUnitCounter(input)}重写需明确设置 allow_overwrite_existing=true。`
        );
      }
      const text = String(params.text ?? "").trim();
      if (!text) return textResult("未写入：文本为空。");
      return expertDraftFileMutationResult(
        input,
        expertSections,
        target.sectionId,
        field,
        text,
        `已生成「${section.title}」的${label}变更，等待用户审阅。`
      );
    },
    executionMode: "sequential"
  });
}

function buildReplaceDraftSectionTextTool(
  input: BuildWritingWorkspaceToolsInput,
  expertSections: ExpertSectionMap,
  readExpertFileIds: Set<string>
): AgentTool {
  return defineTool({
    name: "replace_draft_section_text",
    label:
      input.workspaceType === "script"
        ? "替换剧集正文文本"
        : "替换正文章节文本",
    description:
      `在指定${draftUnitLabel(input)}的正文或人物状态文件中按原文片段精确替换。file 默认 body；section_id 省略时修改当前选中${draftUnitLabel(input)}。` +
      "每个 original_text 必须在该文件中唯一存在。" +
      scriptBodyToolConstraint(input),
    parameters: Type.Object({
      ...draftTargetParameters(),
      replacements: Type.Array(
        Type.Object({
          original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
          new_text: Type.String({ maxLength: 20_000 })
        }),
        { minItems: 1, maxItems: 20 }
      )
    }),
    execute: async (_toolCallId, params) => {
      const target = resolveDraftWriteTarget(input, expertSections, params.section_id);
      if ("error" in target) return textResult(target.error.replace("未修改：", "未替换："));
      const field = toDraftFileKind(params.file);
      const section = expertSections.get(target.sectionId)!;
      const file = section[field];
      const label = draftFileLabel(field);
      if (file.content.trim() && !readExpertFileIds.has(file.documentId)) {
        return textResult(
          `未替换：请先读取「${section.title}」的完整${label}文件（read_draft_sections，mode=full）。`
        );
      }
      const replacements = params.replacements as Array<{
        original_text: string;
        new_text: string;
      }>;
      const result = replaceText(file.content, replacements);
      if (result.error || result.next === undefined) {
        return textResult(`未替换：${result.error ?? "未知错误"}`);
      }
      return expertDraftFileMutationResult(
        input,
        expertSections,
        target.sectionId,
        field,
        result.next,
        `已生成「${section.title}」${label}的 ${result.count} 处文本变更，等待用户审阅。`
      );
    },
    executionMode: "sequential"
  });
}

function buildWritingWorkspaceTools(
  input: BuildWritingWorkspaceToolsInput
): AgentTool[] {
  const sharedState =
    input.sharedState ?? createWritingWorkspaceToolSharedState(input.workspace);
  const toolInput: BuildWritingWorkspaceToolsInput = { ...input, sharedState };
  const { stageBodies, stageRevisions, expertSections } = sharedState;
  // This is intentionally agent-local. A child reading a file must never grant
  // its parent permission to overwrite that file (or vice versa).
  const readExpertFileIds = new Set<string>();
  const readExpertFileCoverage = new Map<
    string,
    ShortDocumentReadCoverage
  >();
  let activeStageId = toolInput.workspace.activeStageId;
  const readTools = [
    buildReadWorkspaceContentTool(toolInput, stageBodies),
    buildSearchWorkspaceTextTool(toolInput, stageBodies, expertSections),
    buildQueryLinkedMaterialEntriesTool(toolInput),
    buildLoadSkillTool(toolInput),
    ...buildCharacterTools(toolInput, stageBodies, stageRevisions, sharedState),
    buildReadDraftSectionsTool(
      toolInput,
      expertSections,
      readExpertFileIds,
      readExpertFileCoverage
    )
  ];

  if (toolInput.profile.id === "expert_draft_coordinator") {
    const draftTools = [
      buildWriteDraftSectionTool(toolInput, expertSections, readExpertFileIds),
      buildReplaceDraftSectionTextTool(toolInput, expertSections, readExpertFileIds),
      buildRenameExpertDraftSectionTool(toolInput, expertSections, sharedState),
      buildDeleteExpertDraftSectionTool(toolInput, expertSections, sharedState)
    ];
    return [
      ...readTools,
      buildCreateExpertDraftSectionsTool(toolInput, sharedState),
      ...draftTools
    ];
  }

  const tools = [...readTools];
  if (toolInput.profile.id === "plot_design") {
    tools.push(
      buildSwitchStorylineStageTool(toolInput, (stageId) => {
        activeStageId = stageId;
      })
    );
  }
  if (
    toolInput.profile.id === "character_design" &&
    (toolInput.workspace.characterStructure?.format ?? "text") === "list"
  ) {
    return tools;
  }
  tools.push(
    buildWriteWorkspaceEditorTool(toolInput, stageBodies, stageRevisions, () => activeStageId),
    buildReplaceStageTextTool(toolInput, stageBodies, stageRevisions, () => activeStageId)
  );
  return tools;
}

export function buildShortWorkspaceTools(
  input: BuildShortWorkspaceToolsInput
): AgentTool[] {
  return buildWritingWorkspaceTools({
    workspaceType: "short",
    ...input
  });
}

export function buildScriptWorkspaceTools(
  input: BuildScriptWorkspaceToolsInput
): AgentTool[] {
  return buildWritingWorkspaceTools({
    workspaceType: "script",
    ...input
  });
}

export function isShortWorkspaceToolDetails(
  value: unknown
): value is ShortWorkspaceToolDetails {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "none" ||
    kind === "workspace-editor-mutation" ||
    kind === "workspace-character-file-mutation" ||
    kind === "workspace-character-structure-mutation" ||
    kind === "workspace-expert-draft-file-mutation" ||
    kind === "workspace-expert-draft-section-creation" ||
    kind === "workspace-expert-draft-section-rename" ||
    kind === "workspace-expert-draft-section-deletion" ||
    kind === "workspace-stage-selection"
  );
}

export function assertKnownShortWorkspaceStage(stageId: string): ShortWorkspaceStageId {
  if (
    stageId !== "character_design" &&
    stageId !== "draft" &&
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(stageId)
  ) {
    throw new Error(`Unknown short workspace stage: ${stageId}`);
  }
  return stageId as ShortWorkspaceStageId;
}

export function isKnownShortMaterialKind(kind: string): boolean {
  return SHORT_MATERIAL_KINDS.includes(kind as (typeof SHORT_MATERIAL_KINDS)[number]);
}

export function isKnownShortSkillKind(kind: string): boolean {
  return SHORT_SKILL_KINDS.includes(kind as (typeof SHORT_SKILL_KINDS)[number]);
}
