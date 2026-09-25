import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  LongSearchCommandEnvelopeSchema,
  LongSearchResultSchema,
  LongWorkspaceOperationBatchSchema,
  createEnvelope,
  type LongChapterBodyChange,
  type LongChapterReadiness
} from "@deepwrite/contracts";
import {
  stableIdParameter,
  strictObject,
  worldbuildingReadModeParameter
} from "./schemas";
import {
  defineTool,
  literalUnion,
  nextContentRevision,
  stableHash,
  textResult,
  throwIfAborted
} from "./shared";
import {
  orderedLongChapterCards,
  selectLongChaptersForWritingScope
} from "./dispatch";
import { longProposalResultSummary, type LongToolContext } from "./context";
import {
  formatChapterList,
  formatChapterRead,
  formatChapterReadiness,
  formatChapterSearch
} from "./formatting";
import type { LongAgentToolDetails } from "./index";

export function buildChapterReadinessTools(ctx: LongToolContext): AgentTool[] {
  const { workspace, readableRoots, capabilities, execute, loadIndex, loadChapterReadiness } = ctx;
  const tools: AgentTool[] = [];
  if (
    capabilities.has("query_structure") &&
    readableRoots.has("draft")
  ) {
    tools.push(
      defineTool({
        name: "get_long_chapter_readiness",
        label: "检查章节正文证据",
        description:
          "检查当前或指定未提交章的正文是否已经形成可供连续性结算的证据。按行段落返回标题、chapter_card_id、状态与缺失文件，不包装成 JSON。状态为 empty、partial 或 ready_to_commit。",
        parameters: Type.Object({
          chapter_card_id: Type.Optional(
            Type.String({ minLength: 3, maxLength: 160 })
          )
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const chapterCardId =
            params.chapter_card_id ?? workspace.activeChapterCardId;
          if (!chapterCardId) {
            throw new Error(
              "A chapter must be active or explicitly selected for readiness."
            );
          }
          return textResult(
            formatChapterReadiness(
              await loadChapterReadiness(
                index,
                projectRevision,
                chapterCardId,
                signal
              )
            )
          );
        }
      })
    );
  }
  return tools;
}

export function buildChapterTools(ctx: LongToolContext): AgentTool[] {
  const { input, workspace, profile, readableRoots, writableRoots, capabilities, execute, loadIndex, loadActiveChapterMutationContext, nextQuerySequence, fullyReadChapterBodies, readChapterBodySnapshots, chapterBodyOverlay, loadChapterReadiness, resolveChapterDocumentTarget, readWholeChapterBody } = ctx;
  const tools: AgentTool[] = [];
  if (
    capabilities.has("dispatch_chapter_writer") &&
    (profile.id === "draft" || profile.id === "plot_design")
  ) {
    tools.push(
      defineTool({
        name: "propose_long_chapter_dispatch",
        label: "提议启动长篇写作",
        description:
          "按卷序和卷内叙事顺序，为单章、当前主弧的连续章节或当前卷形成串行写作调度提案；不支持整本调度。提案由客户端依据本轮审批模式处理，获批后复用同一写手智能体和同一对话历史继续各章正文，不按章节隔离会话。",
        parameters: Type.Object({
          scope: Type.Optional(
            literalUnion(["chapter", "arc", "volume"])
          ),
          chapter_card_id: Type.Optional(
            Type.String({ minLength: 3, maxLength: 160 })
          ),
          arc_id: Type.Optional(
            Type.String({ minLength: 3, maxLength: 160 })
          ),
          volume_id: Type.Optional(
            Type.String({ minLength: 3, maxLength: 160 })
          ),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (_toolCallId, params, signal) => {
          throwIfAborted(signal);
          const { index, projectRevision } = await loadIndex(signal);
          const scope = params.scope ?? "chapter";
          const selectedChapters = selectLongChaptersForWritingScope(index, {
            scope,
            ...(params.chapter_card_id
              ? { chapterCardId: params.chapter_card_id }
              : {}),
            ...(params.arc_id ? { arcId: params.arc_id } : {}),
            ...(params.volume_id ? { volumeId: params.volume_id } : {})
          });
          const firstChapter = selectedChapters[0];
          if (!firstChapter) {
            return textResult("全部章卡均已有正文，没有可调度的下一章。");
          }
          const chapters: LongChapterReadiness[] = [];
          for (const chapter of selectedChapters) {
            chapters.push(
              await loadChapterReadiness(
                index,
                projectRevision,
                chapter.id,
                signal
              )
            );
          }
          const summary =
            params.summary?.trim() ||
            `准备按${scope === "chapter" ? "单章" : scope === "arc" ? "主弧" : "当前卷"}串行写作 ${chapters.length} 章，从《${firstChapter.title}》开始。`;
          return textResult(
            longProposalResultSummary(
              input,
              `已形成从《${firstChapter.title}》开始的 ${chapters.length} 章串行写作调度提案，等待客户端审阅。`
            ),
            {
              kind: "long-chapter-dispatch-proposal",
              bookId: workspace.bookId,
              agentId: profile.id,
              scope,
              chapterCardId: firstChapter.id,
              title: firstChapter.title,
              chapters,
              workspaceRevision: index.revision,
              projectRevision,
              summary
            }
          );
        }
      })
    );
  }

  if (
    capabilities.has("query_structure") &&
    readableRoots.has("draft")
  ) {
    tools.push(
      defineTool({
        name: "list_chapters",
        label: "列出正文章节",
        description:
          "按叙事顺序列出正文阶段概览。按行段落返回 chapter_card_id、标题、正文状态与提交状态，不包装成 JSON；各阶段均可据此进一步读取正文、章末人物状态和接续包，不暴露文件和版本信息。",
        parameters: strictObject({
          page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index } = await loadIndex(signal);
          const page = params.page ?? 1;
          const limit = params.limit ?? 50;
          const start = (page - 1) * limit;
          const ordered = orderedLongChapterCards(index);
          const items = ordered.slice(start, start + limit).map((card) => {
            const chapter = index.chapters.find(
              ({ chapterCardId }) => chapterCardId === card.id
            );
            if (!chapter) {
              throw new Error(`Chapter files are missing for ${card.id}.`);
            }
            const overlay = chapterBodyOverlay.get(chapter.body.id);
            return {
              chapter_card_id: card.id,
              title: card.title,
              narrative_order: card.narrativeOrder,
              body_status: overlay
                ? overlay.content.trim()
                  ? "written"
                  : "empty"
                : chapter.bodyStatus,
              record_status: chapter.commitId ? "recorded" as const : "unrecorded" as const,
              active: workspace.activeChapterCardId === card.id
            };
          });
          return textResult(
            formatChapterList({
              page,
              limit,
              total: ordered.length,
              items
            })
          );
        }
      }),
      defineTool({
        name: "search_chapters",
        label: "搜索正文章节",
        description:
          "搜索正文阶段内容；命中同时覆盖正文、章末人物状态和接续包。按行段落返回可交给 read_chapter 的 chapter_card_id、document 和少量上下文，不包装成 JSON。",
        parameters: strictObject({
          query: Type.String({ minLength: 1, maxLength: 256 }),
          cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          max_snippet_characters: Type.Optional(
            Type.Integer({ minimum: 40, maximum: 2_000 })
          )
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index } = await loadIndex(signal);
          const command = LongSearchCommandEnvelopeSchema.parse(
            createEnvelope(
              "long.search",
              {
                bookId: workspace.bookId,
                query: params.query,
                scope: "draft",
                ...(params.cursor ? { cursor: params.cursor } : {}),
                limit: params.limit ?? 20,
                maxSnippetCharacters: params.max_snippet_characters ?? 320
              },
              {
                id: `long-query-${input.runId}-chapter-search-${nextQuerySequence()}`,
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
          const chapterTargetByFileId = new Map<
            string,
            {
              chapterCardId: string;
              document: "body" | "character_state" | "handoff";
            }
          >(
            index.chapters.flatMap((chapter) => [
              [chapter.body.id, { chapterCardId: chapter.chapterCardId, document: "body" as const }],
              [chapter.characterState.id, { chapterCardId: chapter.chapterCardId, document: "character_state" as const }],
              [chapter.handoff.id, { chapterCardId: chapter.chapterCardId, document: "handoff" as const }]
            ] as const)
          );
          return textResult(
            formatChapterSearch({
              query: result.query,
              hits: result.hits.flatMap((hit) => {
                const target = chapterTargetByFileId.get(hit.fileId);
                if (!target) return [];
                return [{
                  chapter_card_id: target.chapterCardId,
                  document: target.document,
                  title: hit.title,
                  snippet: hit.snippet
                }];
              }),
              next_cursor: result.nextCursor
            })
          );
        }
      }),
      defineTool({
        name: "read_chapter",
        label: "读取正文阶段内容",
        description:
          "按 chapter_card_id 读取正文阶段的具体内容。按行段落返回标题、稳定业务 ID 和正文，不包装成 JSON。所有阶段都可用 document 读取正文、章末人物状态或接续包。写手读取任意章节仅作写作参考，写入仍只限运行时锁定的当前章正文。",
        parameters: strictObject({
          chapter_card_id: Type.Optional(stableIdParameter("chapter")),
          document: Type.Optional(
            literalUnion(["body", "character_state", "handoff"])
          ),
          mode: Type.Optional(worldbuildingReadModeParameter)
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const chapterCardId = params.chapter_card_id ?? workspace.activeChapterCardId;
          if (!chapterCardId) {
            throw new Error("A chapter_card_id is required when no chapter is active.");
          }
          const document = params.document ?? "body";
          const target = resolveChapterDocumentTarget(
            index,
            chapterCardId,
            document
          );
          const mode = params.mode ?? "preview";
          let content: string;
          let file = target.file;
          if (target.content !== undefined) {
            content = target.content;
          } else {
            const result = await readWholeChapterBody(
              target.file,
              index.revision,
              projectRevision,
              signal
            );
            content = result.content;
            file = result.file;
          }
          if (mode === "full" && document === "body") {
            fullyReadChapterBodies.set(file.id, {
              content,
              file,
              workspaceRevision: index.revision,
              projectRevision
            });
          }
          if (document === "body") {
            readChapterBodySnapshots.set(file.id, { content, file });
          }
          const previewLimit = 32_768;
          const truncated = mode === "preview" && content.length > previewLimit;
          return textResult(
            formatChapterRead({
              chapter_card_id: chapterCardId,
              title: target.chapterTitle,
              document,
              mode,
              content: mode === "full" ? content : content.slice(0, previewLimit),
              ...(truncated ? { truncated: true } : {})
            })
          );
        }
      })
    );
  }

  if (
    capabilities.has("write_chapter_files") &&
    writableRoots.has("draft") &&
    profile.id === "draft" &&
    workspace.activeChapterCardId
  ) {
    const chapterContentParameter = Type.String({
      minLength: 1,
      maxLength: 10_000_000,
      description:
        "运行时锁定的当前章完整小说正文；不要包含章节标题、相邻章节、分析过程、写作说明、工具参数、章末人物状态、交接文档或下一章接续包。"
    });
    const buildChapterProposal = async (
      toolCallId: string,
      content: string,
      summary: string,
      operation: LongChapterBodyChange["operation"],
      allowOverwriteExisting = false,
      signal?: AbortSignal
    ): Promise<AgentToolResult<LongAgentToolDetails>> => {
      const {
        index,
        projectRevision,
        activeChapterCardId,
        chapter
      } = await loadActiveChapterMutationContext(signal);
      const chapterCard = index.plot.chapterCards.find(
        ({ id }) => id === activeChapterCardId
      )!;
      const overlay = chapterBodyOverlay.get(chapter.body.id);
      const live = overlay
        ? { content: overlay.content, file: overlay.file }
        : await readWholeChapterBody(
            chapter.body,
            index.revision,
            projectRevision,
            signal
          );
      if (
        operation === "write" &&
        live.content.trim() &&
        !allowOverwriteExisting
      ) {
        return textResult(
          "未写入：当前章已有正文，整体重写需设置 allow_overwrite_existing=true。"
        );
      }
      if (operation === "edit" || live.content.trim()) {
        const evidence = fullyReadChapterBodies.get(live.file.id);
        if (!evidence) {
          return textResult(
            `未${operation === "edit" ? "编辑" : "写入"}：请先调用 read_chapter（mode=full）完整读取当前章正文。`
          );
        }
        if (
          evidence.file.revision !== live.file.revision ||
          evidence.workspaceRevision !== index.revision ||
          evidence.projectRevision !== projectRevision ||
          evidence.content !== live.content
        ) {
          throw new Error(
            "The active chapter changed after it was read. Read it in full again before writing or editing."
          );
        }
      }
      const nextRevision = nextContentRevision(live.file.revision, content);
      const timestamp = new Date().toISOString();
      const nextFile = {
        ...live.file,
        revision: nextRevision,
        updatedAt: timestamp
      };
      chapterBodyOverlay.set(chapter.body.id, {
        chapterCardId: activeChapterCardId,
        chapterTitle: chapterCard.title,
        file: nextFile,
        content
      });
      fullyReadChapterBodies.set(chapter.body.id, {
        content,
        file: nextFile,
        workspaceRevision: index.revision,
        projectRevision
      });
      const batch = LongWorkspaceOperationBatchSchema.parse({
        baseRevision: index.revision,
        updatedAt: timestamp,
        operations: [],
        documentWrites: [
          {
            proposalId: `proposal_${stableHash(
              `${workspace.bookId}:${input.runId}:${toolCallId}`
            ).slice(0, 24)}`,
            fileId: live.file.id,
            content,
            mode: "replace",
            expectedRevision: live.file.revision,
            nextRevision,
            updatedAt: timestamp,
            reason: summary
          }
        ]
      });
      const file: LongChapterBodyChange = {
        chapterCardId: activeChapterCardId,
        chapterTitle: chapterCard.title,
        fileId: live.file.id,
        filePath: live.file.path,
        operation,
        beforeText: live.content,
        afterText: content,
        beforeRevision: live.file.revision,
        nextRevision
      };
      return textResult(
        longProposalResultSummary(
          input,
          `已形成《${chapterCard.title}》正文${operation === "edit" ? "编辑" : "写入"}提案，等待客户端审阅。`
        ),
        {
          kind: "long-chapter-write-proposal",
          bookId: workspace.bookId,
          agentId: profile.id,
          batch,
          baseProjectRevision: projectRevision,
          file,
          summary
        }
      );
    };
    tools.push(
      defineTool({
        name: "write_chapter_draft",
        label: "写入当前章正文",
        description:
          "只向运行时锁定章节的独立 body.md 写入完整小说正文；已有正文必须先用 read_chapter mode=full 完整读取，并明确设置 allow_overwrite_existing=true 才能整体重写。已有连续性记录只作参考，不限制整体重写。形成会话 diff 审批卡，不直接写磁盘；不编写或修改章末人物状态与交接文档。",
        parameters: strictObject({
          content: chapterContentParameter,
          allow_overwrite_existing: Type.Optional(Type.Literal(true)),
          summary: Type.String({ minLength: 1, maxLength: 1_000 })
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const summary = params.summary.trim();
          if (!summary || !params.content.trim()) {
            throw new Error("Chapter draft content and summary must be non-empty.");
          }
          return buildChapterProposal(
            toolCallId,
            params.content,
            summary,
            "write",
            params.allow_overwrite_existing === true,
            signal
          );
        }
      }),
      defineTool({
        name: "edit_chapter_draft",
        label: "编辑当前章正文",
        description:
          "只在已用 read_chapter mode=full 完整读取的当前章 body.md 上做唯一原文片段替换；已有连续性记录只作参考，不限制局部或大幅修改。形成会话 diff 审批卡；不编写或修改章末人物状态与交接文档。",
        parameters: strictObject({
          replacements: Type.Array(
            strictObject({
              original_text: Type.String({ minLength: 1, maxLength: 200_000 }),
              new_text: Type.String({ maxLength: 200_000 })
            }),
            { minItems: 1, maxItems: 100 }
          ),
          summary: Type.String({ minLength: 1, maxLength: 1_000 })
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const summary = params.summary.trim();
          if (!summary) {
            throw new Error("Chapter edit summary must be non-empty.");
          }
          const { chapter } = await loadActiveChapterMutationContext(signal);
          const target = chapterBodyOverlay.get(chapter.body.id)?.file ?? chapter.body;
          const evidence = fullyReadChapterBodies.get(target.id);
          if (!evidence || evidence.file.revision !== target.revision) {
            return textResult(
              "未编辑：请先调用 read_chapter（mode=full）完整读取当前章正文。"
            );
          }
          let content = evidence.content;
          for (const replacement of params.replacements) {
            const first = content.indexOf(replacement.original_text);
            const second =
              first < 0
                ? -1
                : content.indexOf(
                    replacement.original_text,
                    first + replacement.original_text.length
                  );
            if (first < 0 || second >= 0) {
              return textResult(
                `未替换：原文片段必须唯一存在：${replacement.original_text.slice(0, 80)}`
              );
            }
            content =
              content.slice(0, first) +
              replacement.new_text +
              content.slice(first + replacement.original_text.length);
          }
          if (!content.trim()) {
            throw new Error("Chapter edits cannot clear the complete body.");
          }
          return buildChapterProposal(
            toolCallId,
            content,
            summary,
            "edit",
            false,
            signal
          );
        }
      })
    );
  }
  return tools;
}
