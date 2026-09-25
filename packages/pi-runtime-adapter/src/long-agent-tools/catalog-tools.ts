import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  LongReadDocumentCommandEnvelopeSchema,
  LongReadDocumentResultSchema,
  LongSearchCommandEnvelopeSchema,
  LongSearchResultSchema,
  MATERIAL_KINDS,
  createEnvelope,
  type LongWorkspaceRoot
} from "@deepwrite/contracts";
import {
  LOAD_SKILL_NAME_PARAMETER,
  LOAD_SKILL_TOOL_DESCRIPTION,
  formatLoadSkillToolResult,
  resolveAttachedSkill,
  type LoadSkillCandidate
} from "../resolve-attached-skill";
import { ALL_ROOTS } from "./schemas";
import {
  defineTool,
  filePathBelongsToRoot,
  fileRootMap,
  literalUnion,
  projectIndex,
  textResult
} from "./shared";
import type { LongToolContext } from "./context";
import type { BuildLongWorkspaceToolsInput } from "./index";

export function buildQueryLinkedMaterialEntriesTool(
  input: BuildLongWorkspaceToolsInput
): AgentTool {
  const allowedKinds = input.profile.readAccess.materialKinds;
  return defineTool({
    name: "query_linked_material_entries",
    label: "查询关联素材条目",
    description:
      "列出、搜索或读取当前长篇显式绑定且位于本智能体读取范围内的素材。缺失或未绑定的 Catalog 内容不会被猜测。",
    parameters: Type.Object({
      mode: Type.Union([
        Type.Literal("list"),
        Type.Literal("search"),
        Type.Literal("read")
      ]),
      query: Type.Optional(Type.String({ maxLength: 300 })),
      entry_name: Type.Optional(Type.String({ maxLength: 240 })),
      material_kind: Type.Optional(
        literalUnion(allowedKinds.length ? allowedKinds : MATERIAL_KINDS)
      )
    }),
    execute: async (_toolCallId, params) => {
      const items = (input.attachedMaterials ?? []).filter(
        (item) =>
          item.kind !== undefined && allowedKinds.includes(item.kind)
      );
      const kind = params.material_kind
        ? String(params.material_kind)
        : "";
      const scoped = kind
        ? items.filter((item) => item.kind === kind)
        : items;
      if (params.mode === "read") {
        const name = String(
          params.entry_name ?? params.query ?? ""
        ).trim();
        const found = scoped.find((item) => item.title === name);
        return textResult(
          found
            ? `【${found.title}】${found.kind ? `（${found.kind}）` : ""}\n\n${found.content}`
            : "没有找到同名的已绑定长篇素材条目。"
        );
      }
      if (params.mode === "search") {
        const query = String(params.query ?? "").trim();
        const found = scoped.filter(
          (item) =>
            item.title.includes(query) || item.content.includes(query)
        );
        return textResult(
          found.length
            ? found
                .map(
                  (item) =>
                    `- ${item.title}${item.kind ? ` [${item.kind}]` : ""}: ${item.content.slice(0, 220)}`
                )
                .join("\n")
            : "已绑定长篇素材中没有匹配条目。"
        );
      }
      return textResult(
        scoped.length
          ? scoped
              .map(
                (item) =>
                  `- ${item.title}${item.kind ? ` [${item.kind}]` : ""}`
              )
              .join("\n")
          : "本轮没有当前智能体可读的已绑定长篇素材。"
      );
    }
  });
}

export function buildLoadSkillTool(
  input: BuildLongWorkspaceToolsInput
): AgentTool {
  const allowedKinds = input.profile.readAccess.skillKinds;
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
        formatLoadSkillToolResult(
          name,
          result,
          attached.filter(isReadable)
        )
      );
    }
  });
}


export function buildCatalogTools(ctx: LongToolContext): AgentTool[] {
  const { input, workspace, profile, readableRoots, capabilities, isSettingAgent, isPlotDesignAgent, isDraftWritingAgent, isContinuityLedgerAgent, execute, loadIndex, nextQuerySequence } = ctx;
  const tools: AgentTool[] = [];
  if (
    capabilities.has("query_structure") &&
    readableRoots.size > 0 &&
    !isSettingAgent &&
    !isPlotDesignAgent &&
    !isDraftWritingAgent &&
    !isContinuityLedgerAgent
  ) {
    tools.push(
      defineTool({
        name: "get_long_workspace_index",
        label: "读取长篇结构索引",
        description:
          "读取当前长篇项目中本智能体获准访问的结构根。bookId 与路径由运行时锁定。",
        parameters: Type.Object({}),
        execute: async (_toolCallId, _params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          return textResult(
            JSON.stringify(
              projectIndex(index, projectRevision, readableRoots),
              null,
              2
            )
          );
        }
      }),
      defineTool({
        name: "read_long_document",
        label: "读取长篇文档",
        description:
          "按稳定 fileId 分页读取当前长篇中已授权根下的文档。不能传路径或 bookId。",
        parameters: Type.Object({
          file_id: Type.String({ minLength: 3, maxLength: 160 }),
          offset: Type.Optional(Type.Integer({ minimum: 0 })),
          max_characters: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 262_144 })
          )
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index } = await loadIndex(signal);
          const known = fileRootMap(index).get(params.file_id);
          if (!known || !readableRoots.has(known.root)) {
            throw new Error("The requested long document is outside this agent's read roots.");
          }
          const command = LongReadDocumentCommandEnvelopeSchema.parse(
            createEnvelope(
              "long.readDocument",
              {
                bookId: workspace.bookId,
                fileId: params.file_id,
                offset: params.offset ?? 0,
                maxCharacters: params.max_characters ?? 32_768
              },
              {
                id: `long-query-${input.runId}-read-${nextQuerySequence()}`,
                context: {
                  sessionId: input.sessionId,
                  runId: input.runId,
                  resourceId: workspace.bookId
                }
              }
            )
          );
          const result = LongReadDocumentResultSchema.parse(
            await execute(command, signal)
          );
          if (
            result.bookId !== workspace.bookId ||
            result.file.id !== params.file_id ||
            result.file.path !== known.file.path ||
            result.offset !== (params.offset ?? 0) ||
            !filePathBelongsToRoot(result.file, known.root)
          ) {
            throw new Error("Core returned a long document outside the authorized file.");
          }
          return textResult(JSON.stringify(result, null, 2));
        }
      }),
      defineTool({
        name: "search_long_workspace",
        label: "搜索长篇工作区",
        description:
          "在本智能体获准读取的单个根中搜索当前长篇。不能传路径或 bookId。",
        parameters: Type.Object({
          query: Type.String({ minLength: 1, maxLength: 256 }),
          scope: Type.Optional(
            literalUnion(
              readableRoots.size === ALL_ROOTS.size
                ? ["all", ...profile.readAccess.workspaceRoots]
                : profile.readAccess.workspaceRoots
            )
          ),
          cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          max_snippet_characters: Type.Optional(
            Type.Integer({ minimum: 40, maximum: 2_000 })
          )
        }),
        execute: async (_toolCallId, params, signal) => {
          const defaultScope = readableRoots.has(workspace.activeRoot)
            ? workspace.activeRoot
            : profile.readAccess.workspaceRoots[0]!;
          const scope = params.scope ?? defaultScope;
          if (
            scope !== "all" &&
            !readableRoots.has(scope as LongWorkspaceRoot)
          ) {
            throw new Error("The requested search scope is not authorized.");
          }
          if (scope === "all" && readableRoots.size !== ALL_ROOTS.size) {
            throw new Error("Searching all roots requires read access to every root.");
          }
          const command = LongSearchCommandEnvelopeSchema.parse(
            createEnvelope(
              "long.search",
              {
                bookId: workspace.bookId,
                query: params.query,
                scope,
                ...(params.cursor ? { cursor: params.cursor } : {}),
                limit: params.limit ?? 20,
                maxSnippetCharacters: params.max_snippet_characters ?? 320
              },
              {
                id: `long-query-${input.runId}-search-${nextQuerySequence()}`,
                context: {
                  sessionId: input.sessionId,
                  runId: input.runId,
                  resourceId: workspace.bookId
                }
              }
            )
          );
          const result = LongSearchResultSchema.parse(
            await execute(command, signal)
          );
          if (
            result.bookId !== workspace.bookId ||
            result.hits.some((hit) => !readableRoots.has(hit.root))
          ) {
            throw new Error("Core returned search hits outside the authorized roots.");
          }
          return textResult(JSON.stringify(result, null, 2));
        }
      })
    );
  }
  return tools;
}
