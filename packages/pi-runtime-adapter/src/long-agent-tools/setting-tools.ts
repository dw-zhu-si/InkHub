import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  LONG_CHARACTER_OVERVIEW_CHANGE_ID,
  LongReadDocumentCommandEnvelopeSchema,
  LongReadDocumentResultSchema,
  LongSearchCommandEnvelopeSchema,
  LongSearchResultSchema,
  LongWorkspaceOperationBatchSchema,
  createEmptyLongMarkdownFileReference,
  createEnvelope,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterFilePath,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  type LongCharacterFileChange,
  type LongSearchResult,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch,
  type LongWorldbuildingFileChange
} from "@deepwrite/contracts";
import {
  aliasesParameter,
  characterDocumentParameter,
  characterTypeIdParameter,
  providerObjectUnion,
  settingCharacterDocumentParameter,
  stableIdParameter,
  strictObject,
  titleParameter,
  worldbuildingCategoryIdParameter,
  worldbuildingItemIdParameter,
  worldbuildingReadModeParameter
} from "./schemas";
import {
  formatCharacterList,
  formatWorldbuildingCategoryList,
  formatWorldbuildingItemList
} from "./formatting";
import {
  defineTool,
  maxOrder,
  nextContentRevision,
  stableEntityId,
  stableHash,
  textResult
} from "./shared";
import { longProposalResultSummary, type LongToolContext } from "./context";
import type { LongAgentToolDetails } from "./index";

export function buildSettingTools(ctx: LongToolContext): AgentTool[] {
  const { input, workspace, profile, readableRoots, writableRoots, capabilities, isSettingAgent, isPlotDesignAgent, isDraftWritingAgent, isContinuityLedgerAgent, execute, loadIndex, nextQuerySequence, fullyReadWorldbuildingDocuments, worldbuildingDocumentOverlay, fullyReadCharacterDocuments, characterDocumentOverlay, readWholeWorldbuildingDocument } = ctx;
  const tools: AgentTool[] = [];
  const resolveWorldbuildingTarget = (
    index: LongWorkspaceIndexSnapshot,
    categoryId: string,
    itemId?: string
  ): {
    categoryTitle: string;
    itemTitle?: string;
    file: LongWorkspaceFileReference;
    overlay?: {
      content: string;
      pendingCreation: boolean;
    };
  } => {
    const category = index.worldbuilding.find(({ id }) => id === categoryId);
    if (!category) {
      throw new Error(`Worldbuilding category ${categoryId} does not exist.`);
    }
    if (category.format === "text") {
      if (itemId) {
        throw new Error("Text worldbuilding categories do not have items.");
      }
      const overlay = worldbuildingDocumentOverlay.get(category.file.id);
      return {
        categoryTitle: category.title,
        file: overlay?.file ?? category.file,
        ...(overlay
          ? {
              overlay: {
                content: overlay.content,
                pendingCreation: overlay.pendingCreation
              }
            }
          : {})
      };
    }
    if (!itemId) {
      if (!category.overview) {
        throw new Error(
          `Worldbuilding category ${categoryId} does not have an overview file.`
        );
      }
      const overlay = worldbuildingDocumentOverlay.get(category.overview.id);
      return {
        categoryTitle: category.title,
        itemTitle: "概览",
        file: overlay?.file ?? category.overview,
        ...(overlay
          ? {
              overlay: {
                content: overlay.content,
                pendingCreation: overlay.pendingCreation
              }
            }
          : {})
      };
    }
    const pending = [...worldbuildingDocumentOverlay.values()].find(
      (candidate) =>
        candidate.categoryId === categoryId &&
        candidate.itemId === itemId
    );
    const item = category.items.find(({ id }) => id === itemId);
    if (!item && pending) {
      return {
        categoryTitle: pending.categoryTitle,
        ...(pending.itemTitle ? { itemTitle: pending.itemTitle } : {}),
        file: pending.file,
        overlay: {
          content: pending.content,
          pendingCreation: pending.pendingCreation
        }
      };
    }
    if (!item) {
      throw new Error(
        `Worldbuilding item ${itemId} does not exist in ${categoryId}.`
      );
    }
    const overlay = worldbuildingDocumentOverlay.get(item.file.id);
    return {
      categoryTitle: category.title,
      itemTitle: item.title,
      file: overlay?.file ?? item.file,
      ...(overlay
        ? {
            overlay: {
              content: overlay.content,
              pendingCreation: overlay.pendingCreation
            }
          }
        : {})
    };
  };

  const resolveCharacterOverviewTarget = (
    index: LongWorkspaceIndexSnapshot
  ): {
    file: LongWorkspaceFileReference;
    overlay?: {
      content: string;
      pendingCreation: boolean;
    };
  } => {
    if (!index.characterOverview) {
      throw new Error("Character overview file does not exist.");
    }
    const overlay = characterDocumentOverlay.get(index.characterOverview.id);
    return {
      file: overlay?.file ?? index.characterOverview,
      ...(overlay
        ? {
            overlay: {
              content: overlay.content,
              pendingCreation: overlay.pendingCreation
            }
          }
        : {})
    };
  };

  const resolveCharacterDocumentTarget = (
    index: LongWorkspaceIndexSnapshot,
    characterId: string,
    document:
      | "core_profile"
      | "relationships"
      | "current_state"
      | "history"
  ): {
    characterName: string;
    file: LongWorkspaceFileReference;
    overlay?: {
      content: string;
      pendingCreation: boolean;
    };
  } => {
    const character = index.characters.find(({ id }) => id === characterId);
    const files = index.characterFiles.find(
      (entry) => entry.characterId === characterId
    );
    const pending = [...characterDocumentOverlay.values()].find(
      (candidate) =>
        candidate.characterId === characterId &&
        candidate.document === document
    );
    if ((!character || !files) && pending) {
      return {
        characterName: pending.characterName,
        file: pending.file,
        overlay: {
          content: pending.content,
          pendingCreation: pending.pendingCreation
        }
      };
    }
    if (!character || !files) {
      throw new Error(`Character ${characterId} does not exist.`);
    }
    const documents = {
      core_profile: files.coreProfile,
      relationships: files.relationships,
      current_state: files.currentState,
      history: files.history
    } as const;
    const file = documents[document];
    const overlay = characterDocumentOverlay.get(file.id);
    return {
      characterName: character.name,
      file: overlay?.file ?? file,
      ...(overlay
        ? {
            overlay: {
              content: overlay.content,
              pendingCreation: overlay.pendingCreation
            }
          }
        : {})
    };
  };

  const readWholeCharacterDocument = async (
    file: LongWorkspaceFileReference,
    expectedWorkspaceRevision: number,
    expectedProjectRevision: number,
    signal?: AbortSignal
  ) => {
    let offset = 0;
    let content = "";
    let authoritativeFile = file;
    while (true) {
      const command = LongReadDocumentCommandEnvelopeSchema.parse(
        createEnvelope(
          "long.readDocument",
          {
            bookId: workspace.bookId,
            fileId: file.id,
            offset,
            maxCharacters: 262_144
          },
          {
            id: `long-query-${input.runId}-character-${nextQuerySequence()}`,
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
        result.file.id !== file.id ||
        result.file.path !== file.path ||
        result.offset !== offset ||
        result.workspaceRevision !== expectedWorkspaceRevision ||
        result.projectRevision !== expectedProjectRevision
      ) {
        throw new Error("Core returned a different character document.");
      }
      authoritativeFile = result.file;
      content += result.content;
      if (result.nextOffset === null) {
        return { content, file: authoritativeFile };
      }
      offset = result.nextOffset;
    }
  };

  const worldbuildingQueryTools: AgentTool[] = [];
  if (
    (isSettingAgent ||
      isPlotDesignAgent ||
      isDraftWritingAgent ||
      isContinuityLedgerAgent) &&
    capabilities.has("query_structure") &&
    readableRoots.has("worldbuilding")
  ) {
    worldbuildingQueryTools.push(
      defineTool({
        name: "list_worldbuilding",
        label: "列出世界观",
        description:
          "一次列出全部世界观分类；指定 category_id 时列出该列表型分类的全部条目，并自动附带该分类手动维护的概览内容。按行段落返回，顺序就是当前顺序，只显示分类和条目的业务 ID，不显示文件或版本信息。",
        parameters: strictObject({
          category_id: Type.Optional(worldbuildingCategoryIdParameter)
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          if (!params.category_id) {
            const categories = index.worldbuilding.map((category) => {
              const pendingItemCount =
                category.format === "list"
                  ? [...worldbuildingDocumentOverlay.values()].filter(
                      (candidate) =>
                        candidate.pendingCreation &&
                        candidate.categoryId === category.id
                    ).length
                  : 0;
              return {
                category_id: category.id,
                title: category.title,
                format: category.format,
                ...(category.format === "list"
                  ? { item_count: category.items.length + pendingItemCount }
                  : {})
              };
            });
            return textResult(formatWorldbuildingCategoryList(categories));
          }

          const category = index.worldbuilding.find(
            ({ id }) => id === params.category_id
          );
          if (!category) {
            throw new Error(
              `Worldbuilding category ${params.category_id} does not exist.`
            );
          }
          const items =
            category.format === "list"
              ? [
                  ...category.items.map((item) => ({
                    item_id: item.id,
                    title: item.title
                  })),
                  ...[...worldbuildingDocumentOverlay.values()]
                    .filter(
                      (candidate) =>
                        candidate.pendingCreation &&
                        candidate.categoryId === category.id &&
                        candidate.itemId !== undefined
                    )
                    .map((candidate) => ({
                      item_id: candidate.itemId!,
                      title: candidate.itemTitle ?? "未命名条目"
                    }))
                ]
              : [];
          let overview: string | undefined;
          if (category.format === "list" && category.overview) {
            const cached = worldbuildingDocumentOverlay.get(
              category.overview.id
            );
            if (cached) {
              overview = cached.content;
            } else {
              const result = await readWholeWorldbuildingDocument(
                category.overview,
                index.revision,
                projectRevision,
                signal
              );
              overview = result.content;
              worldbuildingDocumentOverlay.set(category.overview.id, {
                categoryId: category.id,
                categoryTitle: category.title,
                itemTitle: "概览",
                file: result.file,
                content: result.content,
                pendingCreation: false
              });
            }
          }
          return textResult(
            formatWorldbuildingItemList({
              category_id: category.id,
              title: category.title,
              format: category.format,
              ...(category.format === "list"
                ? {
                    overview: overview ?? "",
                    items
                  }
                : {})
            })
          );
        }
      }),
      defineTool({
        name: "search_worldbuilding",
        label: "搜索世界观",
        description:
          "在世界观正文中搜索，返回可继续读取的分类/条目 ID、标题和少量命中上下文；不返回文件、路径或版本信息。",
        parameters: strictObject({
          query: Type.String({ minLength: 1, maxLength: 256 }),
          category_id: Type.Optional(worldbuildingCategoryIdParameter),
          page: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 100 })
          ),
          limit: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 100 })
          )
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index } = await loadIndex(signal);
          const categoryId = params.category_id;
          if (
            categoryId &&
            !index.worldbuilding.some(({ id }) => id === categoryId)
          ) {
            throw new Error(
              `Worldbuilding category ${categoryId} does not exist.`
            );
          }
          const page = params.page ?? 1;
          const limit = params.limit ?? 20;
          let cursor: string | undefined;
          let result: LongSearchResult | undefined;
          for (let currentPage = 1; currentPage <= page; currentPage += 1) {
            if (currentPage > 1 && !cursor) break;
            const command = LongSearchCommandEnvelopeSchema.parse(
              createEnvelope(
                "long.search",
                {
                  bookId: workspace.bookId,
                  query: params.query,
                  scope: "worldbuilding",
                  ...(cursor ? { cursor } : {}),
                  limit,
                  maxSnippetCharacters: 320
                },
                {
                  id: `long-query-${input.runId}-worldbuilding-search-${nextQuerySequence()}`,
                  context: {
                    sessionId: input.sessionId,
                    runId: input.runId,
                    resourceId: workspace.bookId
                  }
                }
              )
            );
            const candidate = LongSearchResultSchema.parse(
              await execute(command, signal)
            );
            if (
              candidate.bookId !== workspace.bookId ||
              candidate.scope !== "worldbuilding" ||
              candidate.hits.some((hit) => hit.root !== "worldbuilding")
            ) {
              throw new Error("Core returned search results outside worldbuilding.");
            }
            result = candidate;
            cursor = candidate.nextCursor ?? undefined;
          }
          if (!result) {
            return textResult(JSON.stringify({ hits: [], next_page: null }));
          }

          const targets = new Map<
            string,
            { category_id: string; item_id?: string; title: string }
          >();
          for (const category of index.worldbuilding) {
            if (category.format === "text") {
              targets.set(category.file.id, {
                category_id: category.id,
                title: category.title
              });
              continue;
            }
            if (category.overview) {
              targets.set(category.overview.id, {
                category_id: category.id,
                title: `${category.title} / 概览`
              });
            }
            for (const item of category.items) {
              targets.set(item.file.id, {
                category_id: category.id,
                item_id: item.id,
                title: item.title
              });
            }
          }
          const hits = result.hits.flatMap((hit) => {
            const target = targets.get(hit.fileId);
            if (!target) {
              throw new Error("Core returned an unknown worldbuilding document.");
            }
            if (categoryId && target.category_id !== categoryId) return [];
            return [{ ...target, snippet: hit.snippet }];
          });
          return textResult(JSON.stringify({
            hits,
            next_page:
              result.nextCursor === null || page >= 100 ? null : page + 1
          }));
        }
      }),
      defineTool({
        name: "read_worldbuilding",
        label: "读取世界观",
        description:
          "按世界观分类与条目 ID 读取内容。文本型分类省略 item_id；列表型分类省略 item_id 时读取概览，指定 item_id 时读取具体条目。mode=preview 只返回摘录，mode=full 会建立本轮后续编辑所需的完整读取凭据。",
        parameters: strictObject({
          category_id: worldbuildingCategoryIdParameter,
          item_id: Type.Optional(worldbuildingItemIdParameter),
          mode: Type.Optional(worldbuildingReadModeParameter)
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const mode = params.mode ?? "full";
          const target = resolveWorldbuildingTarget(
            index,
            params.category_id,
            params.item_id
          );
          const render = (
            content: string,
            pendingCreation: boolean
          ): AgentToolResult<LongAgentToolDetails> => {
            const title = target.itemTitle
              ? `${target.categoryTitle} / ${target.itemTitle}`
              : target.categoryTitle;
            const previewLength = 240;
            const preview =
              content.length <= previewLength * 2
                ? content
                : `${content.slice(0, previewLength)}\n\n……（中间省略 ${content.length - previewLength * 2} 个字符）……\n\n${content.slice(-previewLength)}`;
            return textResult(
              [
                `【${title}】`,
                mode === "preview"
                  ? "预览（不建立整体覆盖凭据）："
                  : "正文：",
                "",
                mode === "preview" ? preview || "（正文为空）" : content || "（正文为空）",
                ...(pendingCreation
                  ? ["", "（本条目为本轮待创建内容，尚未落盘。）"]
                  : [])
              ].join("\n")
            );
          };
          if (target.overlay) {
            if (mode === "full") {
              fullyReadWorldbuildingDocuments.set(target.file.id, {
                content: target.overlay.content,
                file: target.file,
                workspaceRevision: index.revision,
                projectRevision
              });
            }
            return render(
              target.overlay.content,
              target.overlay.pendingCreation
            );
          }
          const result = await readWholeWorldbuildingDocument(
            target.file,
            index.revision,
            projectRevision,
            signal
          );
          worldbuildingDocumentOverlay.set(target.file.id, {
            categoryId: params.category_id,
            categoryTitle: target.categoryTitle,
            ...(params.item_id ? { itemId: params.item_id } : {}),
            ...(target.itemTitle ? { itemTitle: target.itemTitle } : {}),
            file: result.file,
            content: result.content,
            pendingCreation: false
          });
          if (mode === "full") {
            fullyReadWorldbuildingDocuments.set(target.file.id, {
              content: result.content,
              file: result.file,
              workspaceRevision: index.revision,
              projectRevision
            });
          }
          return render(result.content, false);
        }
      })
    );
  }

  const worldbuildingMutationTools: AgentTool[] = [];
  if (
    capabilities.has("mutate_structure") &&
    writableRoots.has("worldbuilding")
  ) {
    const proposalResult = (
      batch: LongWorkspaceOperationBatch,
      projectRevision: number,
      summary: string,
      files: LongWorldbuildingFileChange[]
    ) =>
      textResult(longProposalResultSummary(
        input,
        "已形成世界观文件变更提案，等待客户端审阅与冲突检查。"
      ), {
        kind: "long-worldbuilding-file-proposal" as const,
        bookId: workspace.bookId,
        agentId: profile.id,
        batch,
        baseProjectRevision: projectRevision,
        summary,
        files
      });

    worldbuildingMutationTools.push(
      defineTool({
        name: "create_worldbuilding_file",
        label: "创建世界观文件",
        description:
          "在一个列表型世界观分类中创建一个空白 Markdown 条目文件，并返回稳定 item_id。同一轮可立即把该 item_id 交给 write_worldbuilding_file；本工具不接受也不写入初始化正文。",
        parameters: strictObject({
          category_id: worldbuildingCategoryIdParameter,
          title: Type.String({ minLength: 1, maxLength: 256 }),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const category = index.worldbuilding.find(
            ({ id }) => id === params.category_id
          );
          if (!category || category.format !== "list") {
            throw new Error(
              "Worldbuilding items can only be created in an existing list category."
            );
          }
          const pendingItems = [...worldbuildingDocumentOverlay.values()]
            .filter(
              (candidate) =>
                candidate.pendingCreation &&
                candidate.categoryId === category.id
            );
          if (category.items.length + pendingItems.length >= 10_000) {
            throw new Error(
              "A worldbuilding list category supports at most 10,000 items."
            );
          }
          const title = params.title.trim();
          if (
            category.items.some((item) => item.title === title) ||
            pendingItems.some((item) => item.itemTitle === title)
          ) {
            throw new Error(
              "A worldbuilding file with the same title already exists or is pending creation."
            );
          }
          const timestamp = new Date().toISOString();
          const itemId = stableEntityId(
            "worlditem",
            `${workspace.bookId}:${input.runId}:${toolCallId}`
          );
          const file = createEmptyLongMarkdownFileReference(
            longWorldbuildingItemFileId(itemId),
            longWorldbuildingItemContentPath(category.id, itemId),
            timestamp
          );
          const operation: LongWorkspaceOperation = {
            type: "worldbuildingItem.create",
            categoryId: category.id,
            item: {
              id: itemId,
              title,
              order: category.items.length + pendingItems.length + 1,
              file
            }
          };
          const fileChange: LongWorldbuildingFileChange = {
            categoryId: category.id,
            itemId,
            fileId: file.id,
            filePath: file.path,
            title,
            operation: "create",
            beforeText: "",
            afterText: "",
            beforeRevision: null,
            nextRevision: file.revision
          };
          worldbuildingDocumentOverlay.set(file.id, {
            categoryId: category.id,
            categoryTitle: category.title,
            itemId,
            itemTitle: title,
            file,
            content: "",
            pendingCreation: true
          });
          const summary =
            params.summary?.trim() ||
            `创建世界观文件“${title}”`;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [operation],
            documentWrites: []
          });
          return textResult(
            `${longProposalResultSummary(
              input,
              "已形成一个空白世界观文件创建提案，等待客户端审阅与冲突检查。"
            )}\n${title} → item_id=${itemId}\n同一轮内可立即使用该 item_id 调用 write_setting（domain=worldbuilding）写入正文。`,
            {
              kind: "long-worldbuilding-file-proposal",
              bookId: workspace.bookId,
              agentId: profile.id,
              batch,
              baseProjectRevision: projectRevision,
              summary,
              files: [fileChange]
            }
          );
        }
      }),
      defineTool({
        name: "write_worldbuilding_file",
        label: "写入世界观文件",
        description:
          "覆盖一个文本型世界观分类、列表型分类概览（省略 item_id）或列表型条目的完整 Markdown 文件。空文件可直接写入；已有正文必须先完整读取并明确 allow_overwrite_existing=true。局部修改应使用 edit_worldbuilding_file。",
        parameters: strictObject({
          category_id: worldbuildingCategoryIdParameter,
          item_id: Type.Optional(worldbuildingItemIdParameter),
          text: Type.String({ minLength: 1, maxLength: 1_000_000 }),
          allow_overwrite_existing: Type.Optional(Type.Boolean()),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const target = resolveWorldbuildingTarget(
            index,
            params.category_id,
            params.item_id
          );
          const live = target.overlay
            ? {
                file: target.file,
                content: target.overlay.content
              }
            : await readWholeWorldbuildingDocument(
                target.file,
                index.revision,
                projectRevision,
                signal
              );
          const evidence = fullyReadWorldbuildingDocuments.get(
            target.file.id
          );
          if (live.content.trim() && !evidence) {
            return textResult(
              "未写入：目标已有正文，请先调用 read_setting（domain=worldbuilding，mode=full）完整读取。"
            );
          }
          if (
            live.content.trim() &&
            params.allow_overwrite_existing !== true
          ) {
            return textResult(
              "未写入：目标已有正文；局部修改请使用 edit_setting（domain=worldbuilding），整体重写需设置 allow_overwrite_existing=true。"
            );
          }
          if (
            evidence &&
            (evidence.file.revision !== live.file.revision ||
              evidence.workspaceRevision !== index.revision ||
              evidence.projectRevision !== projectRevision)
          ) {
            throw new Error(
              "Worldbuilding content changed after it was read."
            );
          }
          const timestamp = new Date().toISOString();
          const nextRevision = nextContentRevision(
            live.file.revision,
            params.text
          );
          const summary =
            params.summary?.trim() ||
            `写入世界观“${target.itemTitle ?? target.categoryTitle}”`;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [{
              proposalId: `proposal_${stableHash(
                `${workspace.bookId}:${input.runId}:${toolCallId}`
              ).slice(0, 24)}`,
              fileId: live.file.id,
              content: params.text,
              mode: "replace",
              expectedRevision: live.file.revision,
              nextRevision,
              updatedAt: timestamp,
              reason: summary
            }]
          });
          const nextFile = {
            ...live.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          worldbuildingDocumentOverlay.set(live.file.id, {
            categoryId: params.category_id,
            categoryTitle: target.categoryTitle,
            ...(params.item_id ? { itemId: params.item_id } : {}),
            ...(target.itemTitle ? { itemTitle: target.itemTitle } : {}),
            file: nextFile,
            content: params.text,
            pendingCreation: target.overlay?.pendingCreation ?? false
          });
          fullyReadWorldbuildingDocuments.set(live.file.id, {
            content: params.text,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return proposalResult(batch, projectRevision, summary, [{
            categoryId: params.category_id,
            ...(params.item_id ? { itemId: params.item_id } : {}),
            fileId: live.file.id,
            filePath: live.file.path,
            title: target.itemTitle ?? target.categoryTitle,
            operation: "write",
            beforeText: live.content,
            afterText: params.text,
            beforeRevision: live.file.revision,
            nextRevision
          }]);
        }
      }),
      defineTool({
        name: "edit_worldbuilding_file",
        label: "编辑世界观文件",
        description:
          "在已完整读取的文本型世界观分类、列表型分类概览（省略 item_id）或列表条目中按原文片段精确替换。每个 original_text 必须唯一存在。",
        parameters: strictObject({
          category_id: worldbuildingCategoryIdParameter,
          item_id: Type.Optional(worldbuildingItemIdParameter),
          replacements: Type.Array(
            Type.Object({
              original_text: Type.String({
                minLength: 1,
                maxLength: 2_400
              }),
              new_text: Type.String({ maxLength: 20_000 })
            }),
            { minItems: 1, maxItems: 20 }
          ),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params) => {
          const { index, projectRevision } = await loadIndex();
          const target = resolveWorldbuildingTarget(
            index,
            params.category_id,
            params.item_id
          );
          const evidence = fullyReadWorldbuildingDocuments.get(
            target.file.id
          );
          if (
            !evidence ||
            evidence.workspaceRevision !== index.revision ||
            evidence.projectRevision !== projectRevision ||
            evidence.file.revision !== target.file.revision
          ) {
            return textResult(
              "未编辑：请先调用 read_setting（domain=worldbuilding，mode=full）完整读取目标内容。"
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
          const timestamp = new Date().toISOString();
          const summary =
            params.summary?.trim() ||
            `局部修改世界观“${target.itemTitle ?? target.categoryTitle}”`;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [{
              proposalId: `proposal_${stableHash(
                `${workspace.bookId}:${input.runId}:${toolCallId}`
              ).slice(0, 24)}`,
              fileId: evidence.file.id,
              content,
              mode: "replace",
              expectedRevision: evidence.file.revision,
              nextRevision: nextContentRevision(
                evidence.file.revision,
                content
              ),
              updatedAt: timestamp,
              reason: summary
            }]
          });
          const nextRevision = nextContentRevision(
            evidence.file.revision,
            content
          );
          const nextFile = {
            ...evidence.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          worldbuildingDocumentOverlay.set(evidence.file.id, {
            categoryId: params.category_id,
            categoryTitle: target.categoryTitle,
            ...(params.item_id ? { itemId: params.item_id } : {}),
            ...(target.itemTitle ? { itemTitle: target.itemTitle } : {}),
            file: nextFile,
            content,
            pendingCreation: target.overlay?.pendingCreation ?? false
          });
          fullyReadWorldbuildingDocuments.set(evidence.file.id, {
            content,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return proposalResult(batch, projectRevision, summary, [{
            categoryId: params.category_id,
            ...(params.item_id ? { itemId: params.item_id } : {}),
            fileId: evidence.file.id,
            filePath: evidence.file.path,
            title: target.itemTitle ?? target.categoryTitle,
            operation: "edit",
            beforeText: evidence.content,
            afterText: content,
            beforeRevision: evidence.file.revision,
            nextRevision
          }]);
        }
      })
    );
  }

  const CHARACTER_DOCUMENT_TITLES = {
    core_profile: "核心档案",
    relationships: "人物关系",
    current_state: "当前状态",
    history: "历史轨迹"
  } as const;

  const assertCharacterDocumentIsDirectlyWritable = (
    index: LongWorkspaceIndexSnapshot,
    document: keyof typeof CHARACTER_DOCUMENT_TITLES
  ) => {
    void index;
    void document;
  };

  const characterQueryTools: AgentTool[] = [];
  if (
    (isSettingAgent ||
      isPlotDesignAgent ||
      isDraftWritingAgent ||
      isContinuityLedgerAgent) &&
    capabilities.has("query_structure") &&
    readableRoots.has("character_design")
  ) {
    characterQueryTools.push(
      defineTool({
        name: "list_characters",
        label: "列出人物",
        description:
          "一次列出当前人物类型目录和全部人物业务索引，可按 type_id 筛选，并自动附带人物设计阶段手动维护的概览完整内容，同时建立本轮 write_character_overview / edit_character_overview 所需的完整读取凭据。按行段落返回稳定 type_id、类型名称、character_id、姓名和别名，不暴露文件与版本信息。",
        parameters: strictObject({
          type_id: Type.Optional(characterTypeIdParameter)
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const pending = new Map<
            string,
            {
              character_id: string;
              name: string;
              type_id: string;
              type_title: string;
              aliases: string[];
            }
          >();
          for (const candidate of characterDocumentOverlay.values()) {
            if (
              !candidate.pendingCreation ||
              candidate.document === "overview" ||
              pending.has(candidate.characterId)
            ) {
              continue;
            }
            pending.set(candidate.characterId, {
              character_id: candidate.characterId,
              name: candidate.characterName,
              type_id: candidate.characterGroup ?? "major_supporting",
              type_title:
                index.characterTypes.find(
                  ({ id }) => id === candidate.characterGroup
                )?.title ?? candidate.characterGroup ?? "主要配角",
              aliases: candidate.aliases ?? []
            });
          }
          const characters = [
            ...index.characters.map((character) => ({
              character_id: character.id,
              name: character.name,
              type_id: character.group,
              type_title:
                index.characterTypes.find(({ id }) => id === character.group)
                  ?.title ?? character.group,
              aliases: character.aliases
            })),
            ...pending.values()
          ].filter(
            (character) =>
              !params.type_id || character.type_id === params.type_id
          );
          if (
            params.type_id &&
            !index.characterTypes.some(({ id }) => id === params.type_id)
          ) {
            throw new Error("The requested character type does not exist.");
          }
          let overview = "";
          if (index.characterOverview) {
            const cached = characterDocumentOverlay.get(
              index.characterOverview.id
            );
            if (cached) {
              overview = cached.content;
              fullyReadCharacterDocuments.set(cached.file.id, {
                content: cached.content,
                file: cached.file,
                workspaceRevision: index.revision,
                projectRevision
              });
            } else {
              const result = await readWholeCharacterDocument(
                index.characterOverview,
                index.revision,
                projectRevision,
                signal
              );
              overview = result.content;
              characterDocumentOverlay.set(result.file.id, {
                characterId: LONG_CHARACTER_OVERVIEW_CHANGE_ID,
                characterName: "人物概览",
                document: "overview",
                file: result.file,
                content: result.content,
                pendingCreation: false
              });
              fullyReadCharacterDocuments.set(result.file.id, {
                content: result.content,
                file: result.file,
                workspaceRevision: index.revision,
                projectRevision
              });
            }
          }
          return textResult(
            formatCharacterList({
              types: [...index.characterTypes]
                .sort((left, right) => left.order - right.order)
                .map((characterType) => ({
                  type_id: characterType.id,
                  title: characterType.title,
                  order: characterType.order,
                  character_count: index.characters.filter(
                    ({ group }) => group === characterType.id
                  ).length
                })),
              overview,
              characters
            })
          );
        }
      }),
      defineTool({
        name: "search_characters",
        label: "搜索人物",
        description:
          "搜索人物四类文档，可按现有 type_id 筛选，返回可继续读取的 character_id、姓名、type_id、类型名称、document 和少量上下文；不返回文件、路径或版本信息。",
        parameters: strictObject({
          query: Type.String({ minLength: 1, maxLength: 256 }),
          type_id: Type.Optional(characterTypeIdParameter),
          document: Type.Optional(characterDocumentParameter),
          page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index } = await loadIndex(signal);
          if (
            params.type_id &&
            !index.characterTypes.some(({ id }) => id === params.type_id)
          ) {
            throw new Error("The requested character type does not exist.");
          }
          const page = params.page ?? 1;
          const limit = params.limit ?? 20;
          let cursor: string | undefined;
          let result: LongSearchResult | undefined;
          for (let currentPage = 1; currentPage <= page; currentPage += 1) {
            if (currentPage > 1 && !cursor) break;
            const command = LongSearchCommandEnvelopeSchema.parse(
              createEnvelope(
                "long.search",
                {
                  bookId: workspace.bookId,
                  query: params.query,
                  scope: "character_design",
                  ...(cursor ? { cursor } : {}),
                  limit,
                  maxSnippetCharacters: 320
                },
                {
                  id: `long-query-${input.runId}-character-search-${nextQuerySequence()}`,
                  context: {
                    sessionId: input.sessionId,
                    runId: input.runId,
                    resourceId: workspace.bookId
                  }
                }
              )
            );
            const candidate = LongSearchResultSchema.parse(
              await execute(command, signal)
            );
            if (
              candidate.bookId !== workspace.bookId ||
              candidate.scope !== "character_design" ||
              candidate.hits.some((hit) => hit.root !== "character_design")
            ) {
              throw new Error(
                "Core returned search results outside character design."
              );
            }
            result = candidate;
            cursor = candidate.nextCursor ?? undefined;
          }
          if (!result) {
            return textResult(JSON.stringify({ hits: [], next_page: null }));
          }
          const targets = new Map<
            string,
            {
              character_id: string;
              name: string;
              type_id: string;
              type_title: string;
              document: keyof typeof CHARACTER_DOCUMENT_TITLES;
            }
          >();
          for (const character of index.characters) {
            const files = index.characterFiles.find(
              ({ characterId }) => characterId === character.id
            );
            if (!files) continue;
            targets.set(files.coreProfile.id, {
              character_id: character.id,
              name: character.name,
              type_id: character.group,
              type_title:
                index.characterTypes.find(({ id }) => id === character.group)
                  ?.title ?? character.group,
              document: "core_profile"
            });
            targets.set(files.relationships.id, {
              character_id: character.id,
              name: character.name,
              type_id: character.group,
              type_title:
                index.characterTypes.find(({ id }) => id === character.group)
                  ?.title ?? character.group,
              document: "relationships"
            });
            targets.set(files.currentState.id, {
              character_id: character.id,
              name: character.name,
              type_id: character.group,
              type_title:
                index.characterTypes.find(({ id }) => id === character.group)
                  ?.title ?? character.group,
              document: "current_state"
            });
            targets.set(files.history.id, {
              character_id: character.id,
              name: character.name,
              type_id: character.group,
              type_title:
                index.characterTypes.find(({ id }) => id === character.group)
                  ?.title ?? character.group,
              document: "history"
            });
          }
          const hits = result.hits.flatMap((hit) => {
            const target = targets.get(hit.fileId);
            if (!target) {
              throw new Error("Core returned an unknown character document.");
            }
            if (
              (params.type_id && target.type_id !== params.type_id) ||
              (params.document && target.document !== params.document)
            ) return [];
            return [
              {
                character_id: target.character_id,
                name: target.name,
                type_id: target.type_id,
                type_title: target.type_title,
                document: target.document,
                snippet: hit.snippet
              }
            ];
          });
          return textResult(
            JSON.stringify({
              hits,
              next_page:
                result.nextCursor === null || page >= 100
                  ? null
                  : page + 1
            })
          );
        }
      }),
      defineTool({
        name: "read_character",
        label: "读取人物",
        description:
          "按 character_id 和 document 读取人物内容。mode=preview 只返回摘录，mode=full 会建立本轮后续编辑所需的完整读取凭据。",
        parameters: strictObject({
          character_id: stableIdParameter("character"),
          document: characterDocumentParameter,
          mode: Type.Optional(worldbuildingReadModeParameter)
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const mode = params.mode ?? "full";
          const target = resolveCharacterDocumentTarget(
            index,
            params.character_id,
            params.document
          );
          const result = target.overlay
            ? { content: target.overlay.content, file: target.file }
            : await readWholeCharacterDocument(
                target.file,
                index.revision,
                projectRevision,
                signal
              );
          characterDocumentOverlay.set(result.file.id, {
            ...(characterDocumentOverlay.get(result.file.id) ?? {}),
            characterId: params.character_id,
            characterName: target.characterName,
            document: params.document,
            file: result.file,
            content: result.content,
            pendingCreation: target.overlay?.pendingCreation ?? false
          });
          if (mode === "full") {
            fullyReadCharacterDocuments.set(result.file.id, {
              content: result.content,
              file: result.file,
              workspaceRevision: index.revision,
              projectRevision
            });
          }
          const previewLength = 240;
          const visible =
            mode === "preview" && result.content.length > previewLength * 2
              ? `${result.content.slice(0, previewLength)}\n\n……（中间省略 ${result.content.length - previewLength * 2} 个字符）……\n\n${result.content.slice(-previewLength)}`
              : result.content;
          return textResult(
            [
              `【${target.characterName} / ${CHARACTER_DOCUMENT_TITLES[params.document]}】`,
              mode === "preview"
                ? "预览（不建立整体覆盖凭据）："
                : "正文：",
              "",
              visible || "（正文为空）",
              ...(target.overlay?.pendingCreation
                ? ["", "（本人物为本轮待创建内容，尚未落盘。）"]
                : [])
            ].join("\n")
          );
        }
      })
    );
  }

  const callNamedTool = (
    collection: readonly AgentTool[],
    name: string,
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal
  ) => {
    const tool = collection.find((candidate) => candidate.name === name);
    if (!tool) {
      throw new Error(`Setting domain tool ${name} is not available.`);
    }
    return tool.execute(toolCallId, params as never, signal);
  };

  if (worldbuildingQueryTools.length > 0 || characterQueryTools.length > 0) {
    tools.push(
      defineTool({
        name: "list_setting",
        label: "列出设定",
        description:
          "按 domain 列出世界观或人物。domain=worldbuilding 一次列出全部分类，指定 category_id 时列出该列表型分类条目并附带概览；domain=character 列出人物类型目录和人物索引，可按 type_id 筛选，并附带人物概览（同时建立后续写入概览所需的完整读取凭据）。",
        parameters: providerObjectUnion([
          strictObject({
            domain: Type.Literal("worldbuilding"),
            category_id: Type.Optional(worldbuildingCategoryIdParameter)
          }),
          strictObject({
            domain: Type.Literal("character"),
            type_id: Type.Optional(characterTypeIdParameter)
          })
        ]),
        execute: async (toolCallId, params, signal) => {
          if (params.domain === "worldbuilding") {
            return callNamedTool(
              worldbuildingQueryTools,
              "list_worldbuilding",
              toolCallId,
              { category_id: params.category_id },
              signal
            );
          }
          return callNamedTool(
            characterQueryTools,
            "list_characters",
            toolCallId,
            { type_id: params.type_id },
            signal
          );
        }
      }),
      defineTool({
        name: "search_setting",
        label: "搜索设定",
        description:
          "按 domain 搜索世界观或人物正文，返回可继续读取的业务 ID、标题和少量命中上下文；不返回文件、路径或版本信息。",
        parameters: providerObjectUnion([
          strictObject({
            domain: Type.Literal("worldbuilding"),
            query: Type.String({ minLength: 1, maxLength: 256 }),
            category_id: Type.Optional(worldbuildingCategoryIdParameter),
            page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
          }),
          strictObject({
            domain: Type.Literal("character"),
            query: Type.String({ minLength: 1, maxLength: 256 }),
            type_id: Type.Optional(characterTypeIdParameter),
            document: Type.Optional(characterDocumentParameter),
            page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
          })
        ]),
        execute: async (toolCallId, params, signal) => {
          if (params.domain === "worldbuilding") {
            return callNamedTool(
              worldbuildingQueryTools,
              "search_worldbuilding",
              toolCallId,
              {
                query: params.query,
                category_id: params.category_id,
                page: params.page,
                limit: params.limit
              },
              signal
            );
          }
          return callNamedTool(
            characterQueryTools,
            "search_characters",
            toolCallId,
            {
              query: params.query,
              type_id: params.type_id,
              document: params.document,
              page: params.page,
              limit: params.limit
            },
            signal
          );
        }
      }),
      defineTool({
        name: "read_setting",
        label: "读取设定",
        description:
          "按 domain 读取世界观或人物正文。世界观：文本型分类和列表型分类概览省略 item_id，列表条目同时提供 category_id 和 item_id。人物：读取文档时同时提供 character_id 和 document；读取概览时指定 document=overview 且省略 character_id。mode=preview 只返回摘录，mode=full 建立本轮后续编辑凭据。",
        parameters: providerObjectUnion([
          strictObject({
            domain: Type.Literal("worldbuilding"),
            category_id: worldbuildingCategoryIdParameter,
            item_id: Type.Optional(worldbuildingItemIdParameter),
            mode: Type.Optional(worldbuildingReadModeParameter)
          }),
          strictObject({
            domain: Type.Literal("character"),
            character_id: Type.Optional(stableIdParameter("character")),
            document: settingCharacterDocumentParameter,
            mode: Type.Optional(worldbuildingReadModeParameter)
          })
        ]),
        execute: async (toolCallId, params, signal) => {
          if (params.domain === "worldbuilding") {
            return callNamedTool(
              worldbuildingQueryTools,
              "read_worldbuilding",
              toolCallId,
              {
                category_id: params.category_id,
                item_id: params.item_id,
                mode: params.mode
              },
              signal
            );
          }
          if (params.document === "overview") {
            if (params.character_id) {
              throw new Error(
                "Character overview reads must omit character_id."
              );
            }
            const { index, projectRevision } = await loadIndex(signal);
            const mode = params.mode ?? "full";
            const target = resolveCharacterOverviewTarget(index);
            const result = target.overlay
              ? { content: target.overlay.content, file: target.file }
              : await readWholeCharacterDocument(
                  target.file,
                  index.revision,
                  projectRevision,
                  signal
                );
            characterDocumentOverlay.set(result.file.id, {
              characterId: LONG_CHARACTER_OVERVIEW_CHANGE_ID,
              characterName: "人物概览",
              document: "overview",
              file: result.file,
              content: result.content,
              pendingCreation: target.overlay?.pendingCreation ?? false
            });
            if (mode === "full") {
              fullyReadCharacterDocuments.set(result.file.id, {
                content: result.content,
                file: result.file,
                workspaceRevision: index.revision,
                projectRevision
              });
            }
            const previewLength = 240;
            const visible =
              mode === "preview" && result.content.length > previewLength * 2
                ? `${result.content.slice(0, previewLength)}\n\n……（中间省略 ${result.content.length - previewLength * 2} 个字符）……\n\n${result.content.slice(-previewLength)}`
                : result.content;
            return textResult(
              [
                "【人物概览】",
                mode === "preview"
                  ? "预览（不建立整体覆盖凭据）："
                  : "正文：",
                "",
                visible || "（正文为空）"
              ].join("\n")
            );
          }
          if (!params.character_id) {
            throw new Error(
              "Character document reads require character_id and document."
            );
          }
          return callNamedTool(
            characterQueryTools,
            "read_character",
            toolCallId,
            {
              character_id: params.character_id,
              document: params.document,
              mode: params.mode
            },
            signal
          );
        }
      })
    );
  }

  const characterMutationTools: AgentTool[] = [];
  if (
    capabilities.has("mutate_structure") &&
    writableRoots.has("character_design")
  ) {
    const proposalResult = (
      batch: LongWorkspaceOperationBatch,
      projectRevision: number,
      summary: string,
      files: LongCharacterFileChange[]
    ) =>
      textResult(
        longProposalResultSummary(
          input,
          "已形成人物文件变更提案，等待客户端审阅与冲突检查。"
        ),
        {
          kind: "long-character-file-proposal" as const,
          bookId: workspace.bookId,
          agentId: profile.id,
          batch,
          baseProjectRevision: projectRevision,
          summary,
          files
        }
      );

    characterMutationTools.push(
      defineTool({
        name: "create_character",
        label: "创建人物",
        description:
          "在现有 type_id 下创建一名人物及核心档案、人物关系、当前状态、历史轨迹四份空白 Markdown 文档，返回稳定 character_id。本工具不接受初始化正文；type_id 必须来自人物类型目录，创建后分别使用 write_character_file。",
        parameters: strictObject({
          name: titleParameter,
          type_id: characterTypeIdParameter,
          aliases: Type.Optional(aliasesParameter),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const pendingCharacterIds = new Set(
            [...characterDocumentOverlay.values()]
              .filter(({ pendingCreation }) => pendingCreation)
              .map(({ characterId }) => characterId)
          );
          const pendingInGroup = new Set(
            [...characterDocumentOverlay.values()]
              .filter(
                (candidate) =>
                  candidate.pendingCreation &&
                  candidate.characterGroup === params.type_id
              )
              .map(({ characterId }) => characterId)
          ).size;
          if (index.characters.length + pendingCharacterIds.size >= 100_000) {
            throw new Error(
              "A long workspace supports at most 100,000 characters."
            );
          }
          if (!index.characterTypes.some(({ id }) => id === params.type_id)) {
            throw new Error("The requested character type does not exist.");
          }
          const name = params.name.trim();
          if (
            index.characters.some((character) => character.name === name) ||
            [...characterDocumentOverlay.values()].some(
              (candidate) =>
                candidate.pendingCreation &&
                candidate.characterName === name
            )
          ) {
            throw new Error(
              "A character with the same name already exists or is pending creation."
            );
          }
          const timestamp = new Date().toISOString();
          const characterId = stableEntityId(
            "character",
            `${workspace.bookId}:${input.runId}:${toolCallId}`
          );
          const files = {
            core_profile: createEmptyLongMarkdownFileReference(
              longCharacterCoreProfileFileId(characterId),
              longCharacterFilePath(characterId, "core-profile.md"),
              timestamp
            ),
            relationships: createEmptyLongMarkdownFileReference(
              longCharacterRelationshipsFileId(characterId),
              longCharacterFilePath(characterId, "relationships.md"),
              timestamp
            ),
            current_state: createEmptyLongMarkdownFileReference(
              longCharacterCurrentStateFileId(characterId),
              longCharacterFilePath(characterId, "current-state.md"),
              timestamp
            ),
            history: createEmptyLongMarkdownFileReference(
              longCharacterHistoryFileId(characterId),
              longCharacterFilePath(characterId, "history.md"),
              timestamp
            )
          };
          const operation: LongWorkspaceOperation = {
            type: "character.create",
            character: {
              id: characterId,
              name,
              group: params.type_id,
              order: maxOrder(
                index.characters
                  .filter(({ group }) => group === params.type_id)
                  .map(({ order }) => order)
              ) + pendingInGroup + 1,
              aliases: params.aliases ?? []
            },
            files: {
              characterId,
              coreProfile: files.core_profile,
              relationships: files.relationships,
              currentState: files.current_state,
              history: files.history
            }
          };
          const changes = (Object.keys(files) as Array<keyof typeof files>).map(
            (document): LongCharacterFileChange => ({
              characterId,
              characterName: name,
              document,
              fileId: files[document].id,
              filePath: files[document].path,
              title: `${name} / ${CHARACTER_DOCUMENT_TITLES[document]}`,
              operation: "create",
              beforeText: "",
              afterText: "",
              beforeRevision: null,
              nextRevision: files[document].revision
            })
          );
          for (const change of changes) {
            const document = change.document as keyof typeof files;
            characterDocumentOverlay.set(change.fileId, {
              characterId,
              characterName: name,
              characterGroup: params.type_id,
              aliases: params.aliases ?? [],
              document,
              file: files[document],
              content: "",
              pendingCreation: true
            });
          }
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [operation],
            documentWrites: []
          });
          const summary = params.summary?.trim() || `创建人物“${name}”`;
          return textResult(
            `${longProposalResultSummary(
              input,
              "已形成一名人物及四份空白文档的创建提案，等待客户端审阅与冲突检查。"
            )}\n${name} → character_id=${characterId}\n同一轮内可立即使用该 character_id 调用 write_setting（domain=character）写入正文。`,
            {
              kind: "long-character-file-proposal",
              bookId: workspace.bookId,
              agentId: profile.id,
              batch,
              baseProjectRevision: projectRevision,
              summary,
              files: changes
            }
          );
        }
      }),
      defineTool({
        name: "write_character_file",
        label: "写入人物文件",
        description:
          "覆盖一名人物的一份完整文档。空文件可直接写入；已有正文必须先用 read_character mode=full 完整读取并明确 allow_overwrite_existing=true。局部修改应使用 edit_character_file。",
        parameters: strictObject({
          character_id: stableIdParameter("character"),
          document: characterDocumentParameter,
          text: Type.String({ minLength: 1, maxLength: 1_000_000 }),
          allow_overwrite_existing: Type.Optional(Type.Boolean()),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          assertCharacterDocumentIsDirectlyWritable(index, params.document);
          const target = resolveCharacterDocumentTarget(
            index,
            params.character_id,
            params.document
          );
          const live = target.overlay
            ? { file: target.file, content: target.overlay.content }
            : await readWholeCharacterDocument(
                target.file,
                index.revision,
                projectRevision,
                signal
              );
          const evidence = fullyReadCharacterDocuments.get(target.file.id);
          if (live.content.trim() && !evidence) {
            return textResult(
              "未写入：目标已有正文，请先调用 read_setting（domain=character，mode=full）完整读取。"
            );
          }
          if (live.content.trim() && params.allow_overwrite_existing !== true) {
            return textResult(
              "未写入：目标已有正文；局部修改请使用 edit_setting（domain=character），整体重写需设置 allow_overwrite_existing=true。"
            );
          }
          if (
            evidence &&
            (evidence.file.revision !== live.file.revision ||
              evidence.workspaceRevision !== index.revision ||
              evidence.projectRevision !== projectRevision)
          ) {
            throw new Error("Character document changed after it was read.");
          }
          const timestamp = new Date().toISOString();
          const nextRevision = nextContentRevision(
            live.file.revision,
            params.text
          );
          const summary =
            params.summary?.trim() ||
            `写入人物“${target.characterName}”的${CHARACTER_DOCUMENT_TITLES[params.document]}`;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [{
              proposalId: `proposal_${stableHash(
                `${workspace.bookId}:${input.runId}:${toolCallId}`
              ).slice(0, 24)}`,
              fileId: live.file.id,
              content: params.text,
              mode: "replace",
              expectedRevision: live.file.revision,
              nextRevision,
              updatedAt: timestamp,
              reason: summary
            }]
          });
          const nextFile = {
            ...live.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          characterDocumentOverlay.set(live.file.id, {
            ...(characterDocumentOverlay.get(live.file.id) ?? {}),
            characterId: params.character_id,
            characterName: target.characterName,
            document: params.document,
            file: nextFile,
            content: params.text,
            pendingCreation: target.overlay?.pendingCreation ?? false
          });
          fullyReadCharacterDocuments.set(live.file.id, {
            content: params.text,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return proposalResult(batch, projectRevision, summary, [
            {
              characterId: params.character_id,
              characterName: target.characterName,
              document: params.document,
              fileId: live.file.id,
              filePath: live.file.path,
              title: `${target.characterName} / ${CHARACTER_DOCUMENT_TITLES[params.document]}`,
              operation: "write",
              beforeText: live.content,
              afterText: params.text,
              beforeRevision: live.file.revision,
              nextRevision
            }
          ]);
        }
      }),
      defineTool({
        name: "edit_character_file",
        label: "编辑人物文件",
        description:
          "在已用 read_character mode=full 完整读取的人物文档中按原文片段精确替换。每个 original_text 必须唯一存在。",
        parameters: strictObject({
          character_id: stableIdParameter("character"),
          document: characterDocumentParameter,
          replacements: Type.Array(
            strictObject({
              original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
              new_text: Type.String({ maxLength: 20_000 })
            }),
            { minItems: 1, maxItems: 20 }
          ),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params) => {
          const { index, projectRevision } = await loadIndex();
          assertCharacterDocumentIsDirectlyWritable(index, params.document);
          const target = resolveCharacterDocumentTarget(
            index,
            params.character_id,
            params.document
          );
          const evidence = fullyReadCharacterDocuments.get(target.file.id);
          if (
            !evidence ||
            evidence.workspaceRevision !== index.revision ||
            evidence.projectRevision !== projectRevision ||
            evidence.file.revision !== target.file.revision
          ) {
            return textResult(
              "未编辑：请先调用 read_setting（domain=character，mode=full）完整读取目标内容。"
            );
          }
          let content = evidence.content;
          for (const replacement of params.replacements) {
            const first = content.indexOf(replacement.original_text);
            const second = first < 0
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
          const timestamp = new Date().toISOString();
          const nextRevision = nextContentRevision(
            evidence.file.revision,
            content
          );
          const summary =
            params.summary?.trim() ||
            `局部修改人物“${target.characterName}”的${CHARACTER_DOCUMENT_TITLES[params.document]}`;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [{
              proposalId: `proposal_${stableHash(
                `${workspace.bookId}:${input.runId}:${toolCallId}`
              ).slice(0, 24)}`,
              fileId: evidence.file.id,
              content,
              mode: "replace",
              expectedRevision: evidence.file.revision,
              nextRevision,
              updatedAt: timestamp,
              reason: summary
            }]
          });
          const nextFile = {
            ...evidence.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          characterDocumentOverlay.set(evidence.file.id, {
            ...(characterDocumentOverlay.get(evidence.file.id) ?? {}),
            characterId: params.character_id,
            characterName: target.characterName,
            document: params.document,
            file: nextFile,
            content,
            pendingCreation: target.overlay?.pendingCreation ?? false
          });
          fullyReadCharacterDocuments.set(evidence.file.id, {
            content,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return proposalResult(batch, projectRevision, summary, [
            {
              characterId: params.character_id,
              characterName: target.characterName,
              document: params.document,
              fileId: evidence.file.id,
              filePath: evidence.file.path,
              title: `${target.characterName} / ${CHARACTER_DOCUMENT_TITLES[params.document]}`,
              operation: "edit",
              beforeText: evidence.content,
              afterText: content,
              beforeRevision: evidence.file.revision,
              nextRevision
            }
          ]);
        }
      }),
      defineTool({
        name: "write_character_overview",
        label: "写入人物概览",
        description:
          "覆盖人物设计阶段概览。空文件可直接写入；已有正文必须先用 list_characters 完整读取概览并明确 allow_overwrite_existing=true。局部修改应使用 edit_character_overview。概览应持续同步全部人物的 character_id、姓名、分组、别名与一句话定位。",
        parameters: strictObject({
          text: Type.String({ minLength: 1, maxLength: 1_000_000 }),
          allow_overwrite_existing: Type.Optional(Type.Boolean()),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const target = resolveCharacterOverviewTarget(index);
          const live = target.overlay
            ? { file: target.file, content: target.overlay.content }
            : await readWholeCharacterDocument(
                target.file,
                index.revision,
                projectRevision,
                signal
              );
          const evidence = fullyReadCharacterDocuments.get(target.file.id);
          if (live.content.trim() && !evidence) {
            return textResult(
              "未写入：目标已有正文，请先调用 read_setting（domain=character，document=overview，mode=full）完整读取概览。"
            );
          }
          if (live.content.trim() && params.allow_overwrite_existing !== true) {
            return textResult(
              "未写入：目标已有正文；局部修改请使用 edit_character_overview，整体重写需设置 allow_overwrite_existing=true。"
            );
          }
          if (
            evidence &&
            (evidence.file.revision !== live.file.revision ||
              evidence.workspaceRevision !== index.revision ||
              evidence.projectRevision !== projectRevision)
          ) {
            throw new Error("Character overview changed after it was read.");
          }
          const timestamp = new Date().toISOString();
          const nextRevision = nextContentRevision(
            live.file.revision,
            params.text
          );
          const summary = params.summary?.trim() || "写入人物概览";
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [{
              proposalId: `proposal_${stableHash(
                `${workspace.bookId}:${input.runId}:${toolCallId}`
              ).slice(0, 24)}`,
              fileId: live.file.id,
              content: params.text,
              mode: "replace",
              expectedRevision: live.file.revision,
              nextRevision,
              updatedAt: timestamp,
              reason: summary
            }]
          });
          const nextFile = {
            ...live.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          characterDocumentOverlay.set(live.file.id, {
            characterId: LONG_CHARACTER_OVERVIEW_CHANGE_ID,
            characterName: "人物概览",
            document: "overview",
            file: nextFile,
            content: params.text,
            pendingCreation: false
          });
          fullyReadCharacterDocuments.set(live.file.id, {
            content: params.text,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return proposalResult(batch, projectRevision, summary, [
            {
              characterId: LONG_CHARACTER_OVERVIEW_CHANGE_ID,
              characterName: "人物概览",
              document: "overview",
              fileId: live.file.id,
              filePath: live.file.path,
              title: "人物概览",
              operation: "write",
              beforeText: live.content,
              afterText: params.text,
              beforeRevision: live.file.revision,
              nextRevision
            }
          ]);
        }
      }),
      defineTool({
        name: "edit_character_overview",
        label: "编辑人物概览",
        description:
          "在已用 list_characters 完整读取的人物概览中按原文片段精确替换。每个 original_text 必须唯一存在。创建、重命名、改组或删除人物后应同步更新概览。",
        parameters: strictObject({
          replacements: Type.Array(
            strictObject({
              original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
              new_text: Type.String({ maxLength: 20_000 })
            }),
            { minItems: 1, maxItems: 20 }
          ),
          summary: Type.Optional(
            Type.String({ minLength: 1, maxLength: 1_000 })
          )
        }),
        executionMode: "sequential",
        execute: async (toolCallId, params) => {
          const { index, projectRevision } = await loadIndex();
          const target = resolveCharacterOverviewTarget(index);
          const evidence = fullyReadCharacterDocuments.get(target.file.id);
          if (
            !evidence ||
            evidence.workspaceRevision !== index.revision ||
            evidence.projectRevision !== projectRevision ||
            evidence.file.revision !== target.file.revision
          ) {
            return textResult(
              "未编辑：请先调用 read_setting（domain=character，document=overview，mode=full）完整读取概览内容。"
            );
          }
          let content = evidence.content;
          for (const replacement of params.replacements) {
            const first = content.indexOf(replacement.original_text);
            const second = first < 0
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
          const timestamp = new Date().toISOString();
          const nextRevision = nextContentRevision(
            evidence.file.revision,
            content
          );
          const summary = params.summary?.trim() || "局部修改人物概览";
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [],
            documentWrites: [{
              proposalId: `proposal_${stableHash(
                `${workspace.bookId}:${input.runId}:${toolCallId}`
              ).slice(0, 24)}`,
              fileId: evidence.file.id,
              content,
              mode: "replace",
              expectedRevision: evidence.file.revision,
              nextRevision,
              updatedAt: timestamp,
              reason: summary
            }]
          });
          const nextFile = {
            ...evidence.file,
            revision: nextRevision,
            updatedAt: timestamp
          };
          characterDocumentOverlay.set(evidence.file.id, {
            characterId: LONG_CHARACTER_OVERVIEW_CHANGE_ID,
            characterName: "人物概览",
            document: "overview",
            file: nextFile,
            content,
            pendingCreation: false
          });
          fullyReadCharacterDocuments.set(evidence.file.id, {
            content,
            file: nextFile,
            workspaceRevision: index.revision,
            projectRevision
          });
          return proposalResult(batch, projectRevision, summary, [
            {
              characterId: LONG_CHARACTER_OVERVIEW_CHANGE_ID,
              characterName: "人物概览",
              document: "overview",
              fileId: evidence.file.id,
              filePath: evidence.file.path,
              title: "人物概览",
              operation: "edit",
              beforeText: evidence.content,
              afterText: content,
              beforeRevision: evidence.file.revision,
              nextRevision
            }
          ]);
        }
      })
    );
  }

  if (
    worldbuildingMutationTools.length > 0 ||
    characterMutationTools.length > 0
  ) {
    tools.push(
      defineTool({
        name: "create_setting",
        label: "创建设定",
        description:
          "按 domain 创建一个空白设定文件。domain=worldbuilding 在列表型分类中创建一个空白条目并返回 item_id；domain=character 在现有 type_id 下创建一名人物及四份空白文档并返回 character_id。本工具不接受初始化正文。",
        parameters: providerObjectUnion([
          strictObject({
            domain: Type.Literal("worldbuilding"),
            category_id: worldbuildingCategoryIdParameter,
            title: Type.String({ minLength: 1, maxLength: 256 }),
            summary: Type.Optional(
              Type.String({ minLength: 1, maxLength: 1_000 })
            )
          }),
          strictObject({
            domain: Type.Literal("character"),
            name: Type.String({ minLength: 1, maxLength: 256 }),
            type_id: characterTypeIdParameter,
            aliases: Type.Optional(aliasesParameter),
            summary: Type.Optional(
              Type.String({ minLength: 1, maxLength: 1_000 })
            )
          })
        ]),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          if (params.domain === "worldbuilding") {
            return callNamedTool(
              worldbuildingMutationTools,
              "create_worldbuilding_file",
              toolCallId,
              {
                category_id: params.category_id,
                title: params.title,
                summary: params.summary
              },
              signal
            );
          }
          return callNamedTool(
            characterMutationTools,
            "create_character",
            toolCallId,
            {
              name: params.name,
              type_id: params.type_id,
              aliases: params.aliases,
              summary: params.summary
            },
            signal
          );
        }
      }),
      defineTool({
        name: "write_setting",
        label: "写入设定",
        description:
          "按 domain 覆盖世界观或人物的完整 Markdown。空文件可直接写入；已有正文必须先用 read_setting（mode=full）完整读取并明确 allow_overwrite_existing=true。人物概览指定 document=overview 且省略 character_id。局部修改应使用 edit_setting。",
        parameters: providerObjectUnion([
          strictObject({
            domain: Type.Literal("worldbuilding"),
            category_id: worldbuildingCategoryIdParameter,
            item_id: Type.Optional(worldbuildingItemIdParameter),
            text: Type.String({ minLength: 1, maxLength: 1_000_000 }),
            allow_overwrite_existing: Type.Optional(Type.Boolean()),
            summary: Type.Optional(
              Type.String({ minLength: 1, maxLength: 1_000 })
            )
          }),
          strictObject({
            domain: Type.Literal("character"),
            character_id: Type.Optional(stableIdParameter("character")),
            document: settingCharacterDocumentParameter,
            text: Type.String({ minLength: 1, maxLength: 1_000_000 }),
            allow_overwrite_existing: Type.Optional(Type.Boolean()),
            summary: Type.Optional(
              Type.String({ minLength: 1, maxLength: 1_000 })
            )
          })
        ]),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          if (params.domain === "worldbuilding") {
            return callNamedTool(
              worldbuildingMutationTools,
              "write_worldbuilding_file",
              toolCallId,
              {
                category_id: params.category_id,
                item_id: params.item_id,
                text: params.text,
                allow_overwrite_existing: params.allow_overwrite_existing,
                summary: params.summary
              },
              signal
            );
          }
          if (params.document === "overview") {
            if (params.character_id) {
              throw new Error(
                "Character overview writes must omit character_id."
              );
            }
            return callNamedTool(
              characterMutationTools,
              "write_character_overview",
              toolCallId,
              {
                text: params.text,
                allow_overwrite_existing: params.allow_overwrite_existing,
                summary: params.summary
              },
              signal
            );
          }
          if (!params.character_id) {
            throw new Error(
              "Character document writes require character_id and document."
            );
          }
          return callNamedTool(
            characterMutationTools,
            "write_character_file",
            toolCallId,
            {
              character_id: params.character_id,
              document: params.document,
              text: params.text,
              allow_overwrite_existing: params.allow_overwrite_existing,
              summary: params.summary
            },
            signal
          );
        }
      }),
      defineTool({
        name: "edit_setting",
        label: "编辑设定",
        description:
          "按 domain 在已完整读取的世界观或人物正文中按原文片段精确替换。每个 original_text 必须唯一存在。人物概览指定 document=overview 且省略 character_id。",
        parameters: providerObjectUnion([
          strictObject({
            domain: Type.Literal("worldbuilding"),
            category_id: worldbuildingCategoryIdParameter,
            item_id: Type.Optional(worldbuildingItemIdParameter),
            replacements: Type.Array(
              Type.Object({
                original_text: Type.String({
                  minLength: 1,
                  maxLength: 2_400
                }),
                new_text: Type.String({ maxLength: 20_000 })
              }),
              { minItems: 1, maxItems: 20 }
            ),
            summary: Type.Optional(
              Type.String({ minLength: 1, maxLength: 1_000 })
            )
          }),
          strictObject({
            domain: Type.Literal("character"),
            character_id: Type.Optional(stableIdParameter("character")),
            document: settingCharacterDocumentParameter,
            replacements: Type.Array(
              Type.Object({
                original_text: Type.String({
                  minLength: 1,
                  maxLength: 2_400
                }),
                new_text: Type.String({ maxLength: 20_000 })
              }),
              { minItems: 1, maxItems: 20 }
            ),
            summary: Type.Optional(
              Type.String({ minLength: 1, maxLength: 1_000 })
            )
          })
        ]),
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          if (params.domain === "worldbuilding") {
            return callNamedTool(
              worldbuildingMutationTools,
              "edit_worldbuilding_file",
              toolCallId,
              {
                category_id: params.category_id,
                item_id: params.item_id,
                replacements: params.replacements,
                summary: params.summary
              },
              signal
            );
          }
          if (params.document === "overview") {
            if (params.character_id) {
              throw new Error(
                "Character overview edits must omit character_id."
              );
            }
            return callNamedTool(
              characterMutationTools,
              "edit_character_overview",
              toolCallId,
              {
                replacements: params.replacements,
                summary: params.summary
              },
              signal
            );
          }
          if (!params.character_id) {
            throw new Error(
              "Character document edits require character_id and document."
            );
          }
          return callNamedTool(
            characterMutationTools,
            "edit_character_file",
            toolCallId,
            {
              character_id: params.character_id,
              document: params.document,
              replacements: params.replacements,
              summary: params.summary
            },
            signal
          );
        }
      })
    );
  }
  return tools;
}
