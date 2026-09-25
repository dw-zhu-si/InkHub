import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Static } from "typebox";
import {
  LongReadDocumentCommandEnvelopeSchema,
  LongReadDocumentResultSchema,
  LongWorkspaceOperationBatchSchema,
  createEnvelope,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch,
  type LongWorkspaceRoot
} from "@deepwrite/contracts";
import {
  LONG_MUTATION_PARAMETERS,
  LONG_PLOT_CREATE_PARAMETERS,
  LONG_PLOT_EDIT_PARAMETERS,
  LONG_PLOT_ITEM_TARGET_PARAMETER,
  LONG_PLOT_MUTATION_PARAMETERS,
  LONG_PLOT_WRITE_PARAMETERS,
  LONG_SETTING_MUTATION_PARAMETERS,
  plotItemKindParameter,
  stableIdParameter,
  strictObject,
  worldbuildingReadModeParameter
} from "./schemas";
import {
  comparePlotDesignListItems,
  formatPlotDesignItemList,
  formatPlotDesignKindList,
  formatPlotDesignRead,
  formatPlotPointRead,
  resolveForeshadowingBeatArcIds,
  type PlotDesignKind,
  type PlotDesignListItem,
  type PlotPointRelatedForeshadowing
} from "./formatting";
import {
  buildRuntimeDocumentWrites,
  buildRuntimeOperations,
  collectOperationFiles,
  createdFileRootForOperation,
  defineTool,
  filePathBelongsToRoot,
  nextContentRevision,
  resolveDocumentUpdateTarget,
  rootForOperation,
  stableHash,
  textResult,
  throwIfAborted,
  type LongMutationToolOperation
} from "./shared";
import type { LongToolContext } from "./context";

export function buildPlotDesignTools(ctx: LongToolContext): AgentTool[] {
  const { input, workspace, profile, readableRoots, writableRoots, capabilities, isPlotDesignAgent, execute, loadIndex, formLongMutationProposal, nextQuerySequence, fullyReadPlotItems, storyPlotOverlay, chapterCardOverlay, readWholeWorldbuildingDocument } = ctx;
  const tools: AgentTool[] = [];
  type PlotItemKind = Static<typeof plotItemKindParameter>;

  const plotItemKey = (kind: PlotItemKind, id?: string) =>
    kind === "book_line" ? kind : `${kind}:${id ?? ""}`;

  const plotBusinessId = (
    item: { kind: Exclude<PlotItemKind, "book_line"> } & Record<string, unknown>
  ): string => {
    const id =
      item.kind === "volume"
        ? item.volume_id
        : item.kind === "arc"
          ? item.arc_id
          : item.kind === "story_plot"
            ? item.story_plot_id
            : item.kind === "chapter"
              ? item.chapter_card_id
              : item.kind === "event"
                ? item.event_id
                : item.kind === "connection"
                  ? item.connection_id
                  : item.placement_id;
    if (typeof id !== "string") {
      throw new Error(`Plot ${item.kind} target is missing its business id.`);
    }
    return id;
  };

  const resolvePlotItem = (
    index: LongWorkspaceIndexSnapshot,
    kind: Exclude<PlotItemKind, "book_line">,
    id: string
  ): Record<string, unknown> => {
    const collection =
      kind === "volume"
        ? index.plot.volumes
        : kind === "arc"
          ? index.plot.arcs
          : kind === "story_plot"
            ? index.plot.storyPlots
            : kind === "chapter"
              ? index.plot.chapterCards
              : kind === "event"
                ? index.plot.storyEvents
                : kind === "connection"
                  ? index.plot.eventConnections
                  : index.plot.narrativePlacements;
    const item = collection.find((candidate) => candidate.id === id);
    if (!item) {
      throw new Error(`Plot ${kind} ${id} does not exist.`);
    }
    return item as unknown as Record<string, unknown>;
  };

  const readStoryPlotContent = async (
    index: LongWorkspaceIndexSnapshot,
    projectRevision: number,
    targetId: string,
    signal?: AbortSignal
  ): Promise<{
    meta: Record<string, unknown>;
    content: string;
  }> => {
    const overlayEntry = storyPlotOverlay.get(targetId);
    if (overlayEntry) {
      return {
        meta: {
          kind: "story_plot",
          story_plot_id: targetId,
          arc_id: overlayEntry.arcId,
          title: overlayEntry.title,
          order: overlayEntry.order
        },
        content: overlayEntry.content
      };
    }
    const item = resolvePlotItem(index, "story_plot", targetId);
    const result = await readWholeWorldbuildingDocument(
      item.file as LongWorkspaceFileReference,
      index.revision,
      projectRevision,
      signal
    );
    return {
      meta: toPlotBusinessItem("story_plot", item),
      content: result.content
    };
  };

  const collectRelatedForeshadowing = (
    index: LongWorkspaceIndexSnapshot,
    arcId: string
  ): PlotPointRelatedForeshadowing[] =>
    index.plot.foreshadowing.flatMap((thread) => {
      const beats = thread.beats
        .filter((beat) =>
          resolveForeshadowingBeatArcIds(beat, index).includes(arcId)
        )
        .sort((left, right) => left.order - right.order);
      if (beats.length === 0) return [];
      return [
        {
          foreshadowing_id: thread.id,
          title: thread.title,
          status: thread.status,
          ...(thread.plannedSpan ? { planned_span: thread.plannedSpan } : {}),
          core_question: thread.coreQuestion,
          ...(thread.hiddenTruth ? { hidden_truth: thread.hiddenTruth } : {}),
          expected_reader_effect: thread.expectedReaderEffect,
          ...(thread.truthEventId
            ? { truth_event_id: thread.truthEventId }
            : {}),
          beats: beats.map((beat) => ({
            beat_id: beat.id,
            type: beat.type,
            order: beat.order,
            status: beat.status,
            note: beat.note,
            planned_scope: beat.plannedScope,
            ...(beat.volumeId ? { volume_id: beat.volumeId } : {}),
            ...(beat.arcId ? { arc_id: beat.arcId } : {}),
            event_id: beat.eventId,
            placement_id: beat.placementId,
            chapter_card_id: beat.chapterCardId
          }))
        }
      ];
    });

  const toPlotBusinessItem = (
    kind: Exclude<PlotItemKind, "book_line">,
    item: Record<string, unknown>
  ): Record<string, unknown> => {
    if (kind === "volume") {
      return {
        kind,
        volume_id: item.id,
        title: item.title,
        order: item.order,
        summary: item.summary
      };
    }
    if (kind === "arc") {
      return {
        kind,
        arc_id: item.id,
        volume_id: item.volumeId,
        title: item.title,
        order: item.order,
        summary: item.summary ?? "",
        outline: item.outline
      };
    }
    if (kind === "story_plot") {
      return {
        kind,
        story_plot_id: item.id,
        arc_id: item.arcId,
        title: item.title,
        order: item.order
      };
    }
    if (kind === "chapter") {
      return {
        kind,
        chapter_card_id: item.id,
        volume_id: item.volumeId,
        primary_arc_id: item.primaryArcId,
        title: item.title,
        narrative_order: item.narrativeOrder
      };
    }
    if (kind === "event") {
      return {
        kind,
        event_id: item.id,
        title: item.title,
        summary: item.summary,
        time_mode: item.timeMode,
        time_label: item.timeLabel,
        ...(item.timeValue === undefined ? {} : { time_value: item.timeValue }),
        story_order: item.storyOrder,
        location: item.location,
        arc_ids: item.arcIds,
        character_ids: item.characterIds
      };
    }
    if (kind === "connection") {
      return {
        kind,
        connection_id: item.id,
        source_event_id: item.sourceEventId,
        target_event_id: item.targetEventId,
        connection_type: item.type,
        note: item.note
      };
    }
    return {
      kind,
      placement_id: item.id,
      event_id: item.eventId,
      chapter_card_id: item.chapterCardId,
      order_in_chapter: item.orderInChapter,
      mode: item.mode,
      disclosure: item.disclosure,
      writing_prompt: item.writingPrompt,
      status: item.status,
      commit_id: item.commitId
    };
  };

  const loadLiveDocumentRevision = async (
    file: LongWorkspaceFileReference,
    expectedWorkspaceRevision: number,
    expectedProjectRevision: number,
    signal?: AbortSignal
  ): Promise<string> => {
    const command = LongReadDocumentCommandEnvelopeSchema.parse(
      createEnvelope(
        "long.readDocument",
        {
          bookId: workspace.bookId,
          fileId: file.id,
          offset: 0,
          maxCharacters: 1
        },
        {
          id: `long-query-${input.runId}-commit-revision-${nextQuerySequence()}`,
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
      result.offset !== 0 ||
      result.workspaceRevision !== expectedWorkspaceRevision ||
      result.projectRevision !== expectedProjectRevision
    ) {
      throw new Error(
        "Core returned a different document while locking the ledger proposal."
      );
    }
    return result.file.revision;
  };

  if (
    capabilities.has("query_structure") &&
    readableRoots.has("plot_design")
  ) {
    const plotCollections = (index: LongWorkspaceIndexSnapshot) => ({
      volume: index.plot.volumes,
      arc: index.plot.arcs,
      story_plot: index.plot.storyPlots,
      chapter: index.plot.chapterCards,
      event: index.plot.storyEvents,
      connection: index.plot.eventConnections,
      placement: index.plot.narrativePlacements
    });

    const pendingStoryPlotEntries = (index: LongWorkspaceIndexSnapshot) =>
      [...storyPlotOverlay.entries()].filter(
        ([id, entry]) =>
          entry.pendingCreation &&
          !index.plot.storyPlots.some((storyPlot) => storyPlot.id === id)
      );

    const pendingChapterCardEntries = (index: LongWorkspaceIndexSnapshot) =>
      [...chapterCardOverlay.entries()].filter(
        ([id, entry]) =>
          entry.pendingCreation &&
          !index.plot.chapterCards.some((chapter) => chapter.id === id)
      );

    const collectPlotDesignListItems = (
      index: LongWorkspaceIndexSnapshot,
      kind: Exclude<PlotDesignKind, "book_line">,
      filters: {
        volume_id?: string | undefined;
        arc_id?: string | undefined;
        chapter_card_id?: string | undefined;
      }
    ): PlotDesignListItem[] => {
      let persisted: PlotDesignListItem[] = [];
      let pending: PlotDesignListItem[] = [];
      switch (kind) {
        case "volume":
          persisted = index.plot.volumes
            .filter(
              (volume) => !filters.volume_id || volume.id === filters.volume_id
            )
            .map((volume) => ({
              kind,
              title: volume.title,
              volume_id: volume.id,
              order: volume.order
            }));
          break;
        case "arc":
          persisted = index.plot.arcs
            .filter(
              (arc) =>
                (!filters.volume_id || arc.volumeId === filters.volume_id) &&
                (!filters.arc_id || arc.id === filters.arc_id)
            )
            .map((arc) => ({
              kind,
              title: arc.title,
              arc_id: arc.id,
              volume_id: arc.volumeId,
              order: arc.order
            }));
          break;
        case "story_plot":
          persisted = index.plot.storyPlots
            .filter(
              (storyPlot) =>
                !filters.arc_id || storyPlot.arcId === filters.arc_id
            )
            .map((storyPlot) => ({
              kind,
              title: storyPlot.title,
              story_plot_id: storyPlot.id,
              arc_id: storyPlot.arcId,
              order: storyPlot.order
            }));
          pending = pendingStoryPlotEntries(index)
            .filter(
              ([, entry]) => !filters.arc_id || entry.arcId === filters.arc_id
            )
            .map(([id, entry]) => ({
              kind,
              title: entry.title,
              story_plot_id: id,
              arc_id: entry.arcId,
              order: entry.order
            }));
          break;
        case "chapter":
          persisted = index.plot.chapterCards
            .filter(
              (chapter) =>
                (!filters.volume_id || chapter.volumeId === filters.volume_id) &&
                (!filters.arc_id || chapter.primaryArcId === filters.arc_id)
            )
            .map((chapter) => ({
              kind,
              title: chapter.title,
              chapter_card_id: chapter.id,
              volume_id: chapter.volumeId,
              primary_arc_id: chapter.primaryArcId,
              narrative_order: chapter.narrativeOrder
            }));
          pending = pendingChapterCardEntries(index)
            .filter(
              ([, entry]) =>
                (!filters.volume_id || entry.volumeId === filters.volume_id) &&
                (!filters.arc_id || entry.primaryArcId === filters.arc_id)
            )
            .map(([id, entry]) => ({
              kind,
              title: entry.title,
              chapter_card_id: id,
              volume_id: entry.volumeId,
              primary_arc_id: entry.primaryArcId,
              narrative_order: entry.narrativeOrder
            }));
          break;
        case "event":
          persisted = index.plot.storyEvents
            .filter(
              (event) =>
                !filters.arc_id || event.arcIds.includes(filters.arc_id)
            )
            .map((event) => ({
              kind,
              title: event.title,
              event_id: event.id,
              order: event.storyOrder
            }));
          break;
        case "connection":
          persisted = index.plot.eventConnections.map((connection) => ({
            kind,
            connection_id: connection.id,
            source_event_id: connection.sourceEventId,
            target_event_id: connection.targetEventId,
            connection_type: connection.type
          }));
          break;
        case "placement":
          persisted = index.plot.narrativePlacements
            .filter(
              (placement) =>
                !filters.chapter_card_id ||
                placement.chapterCardId === filters.chapter_card_id
            )
            .map((placement) => ({
              kind,
              placement_id: placement.id,
              event_id: placement.eventId,
              chapter_card_id: placement.chapterCardId,
              order_in_chapter: placement.orderInChapter,
              status: placement.status
            }));
          break;
      }
      return [...persisted, ...pending].sort(comparePlotDesignListItems);
    };

    tools.push(
      defineTool({
        name: "list_plot_design",
        label: "列出剧情设计",
        description:
          "一次列出全部剧情结构类型；指定 kind 时列出该类型的全部条目。按行段落返回稳定业务 ID、标题和关联摘要，不显示文件或版本信息。可用 volume_id / arc_id / chapter_card_id 筛选。若只要某个剧情点的故事事件正文或关联伏笔，直接 read_plot_design 该剧情点即可，不必再列出后逐条读取。伏笔不在本工具中，继续使用现有伏笔结构工具。",
        parameters: strictObject({
          kind: Type.Optional(plotItemKindParameter),
          volume_id: Type.Optional(stableIdParameter("volume")),
          arc_id: Type.Optional(stableIdParameter("arc")),
          chapter_card_id: Type.Optional(stableIdParameter("chapter"))
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index } = await loadIndex(signal);
          if (!params.kind) {
            return textResult(
              formatPlotDesignKindList([
                { kind: "book_line", count: 1 },
                { kind: "volume", count: index.plot.volumes.length },
                { kind: "arc", count: index.plot.arcs.length },
                {
                  kind: "story_plot",
                  count:
                    index.plot.storyPlots.length +
                    pendingStoryPlotEntries(index).length
                },
                {
                  kind: "chapter",
                  count:
                    index.plot.chapterCards.length +
                    pendingChapterCardEntries(index).length
                },
                { kind: "event", count: index.plot.storyEvents.length },
                {
                  kind: "connection",
                  count: index.plot.eventConnections.length
                },
                {
                  kind: "placement",
                  count: index.plot.narrativePlacements.length
                }
              ])
            );
          }
          if (params.kind === "book_line") {
            return textResult(
              formatPlotDesignItemList({
                kind: "book_line",
                items: [{ kind: "book_line", title: "全书故事线" }]
              })
            );
          }
          return textResult(
            formatPlotDesignItemList({
              kind: params.kind,
              items: collectPlotDesignListItems(index, params.kind, {
                volume_id: params.volume_id,
                arc_id: params.arc_id,
                chapter_card_id: params.chapter_card_id
              })
            })
          );
        }
      }),
      defineTool({
        name: "search_plot_design",
        label: "搜索剧情设计",
        description:
          "搜索全书故事线及非伏笔剧情结构，返回可交给 read_plot_design 的业务目标和少量上下文。若目标是剧情点，直接读取该剧情点即可同时得到其故事事件正文、故事情节正文和关联伏笔，不必再逐条读取。",
        parameters: strictObject({
          query: Type.String({ minLength: 1, maxLength: 256 }),
          kind: Type.Optional(plotItemKindParameter),
          page: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }))
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const query = params.query.normalize("NFC").toLocaleLowerCase();
          const candidates: Array<{
            target: Record<string, unknown>;
            searchable: string;
          }> = [];
          if (!params.kind || params.kind === "book_line") {
            const bookLine = await readWholeWorldbuildingDocument(
              index.bookLine,
              index.revision,
              projectRevision,
              signal
            );
            candidates.push({
              target: { kind: "book_line", title: "全书故事线" },
              searchable: bookLine.content
            });
          }
          for (const [kind, collection] of Object.entries(plotCollections(index)) as Array<[
            Exclude<PlotItemKind, "book_line">,
            Array<{ id: string }>
          ]>) {
            if (params.kind && params.kind !== kind) continue;
            for (const item of collection) {
              const business = toPlotBusinessItem(
                kind,
                item as unknown as Record<string, unknown>
              );
              candidates.push({
                target: {
                  kind,
                  ...(kind === "volume" ? { volume_id: item.id } : {}),
                  ...(kind === "arc" ? { arc_id: item.id } : {}),
                  ...(kind === "story_plot" ? { story_plot_id: item.id } : {}),
                  ...(kind === "chapter" ? { chapter_card_id: item.id } : {}),
                  ...(kind === "event" ? { event_id: item.id } : {}),
                  ...(kind === "connection" ? { connection_id: item.id } : {}),
                  ...(kind === "placement" ? { placement_id: item.id } : {}),
                  ...(business.title ? { title: business.title } : {})
                },
                searchable: JSON.stringify(business)
              });
            }
          }
          if (!params.kind || params.kind === "story_plot") {
            for (const [id, entry] of storyPlotOverlay) {
              if (!entry.pendingCreation) continue;
              if (index.plot.storyPlots.some((storyPlot) => storyPlot.id === id)) {
                continue;
              }
              candidates.push({
                target: {
                  kind: "story_plot",
                  story_plot_id: id,
                  arc_id: entry.arcId,
                  title: entry.title
                },
                searchable: JSON.stringify({
                  kind: "story_plot",
                  story_plot_id: id,
                  arc_id: entry.arcId,
                  title: entry.title,
                  order: entry.order
                })
              });
            }
          }
          if (!params.kind || params.kind === "chapter") {
            for (const [id, entry] of chapterCardOverlay) {
              if (!entry.pendingCreation) continue;
              if (index.plot.chapterCards.some((chapter) => chapter.id === id)) {
                continue;
              }
              candidates.push({
                target: {
                  kind: "chapter",
                  chapter_card_id: id,
                  volume_id: entry.volumeId,
                  title: entry.title
                },
                searchable: [
                  JSON.stringify({
                    kind: "chapter",
                    chapter_card_id: id,
                    volume_id: entry.volumeId,
                    primary_arc_id: entry.primaryArcId,
                    title: entry.title,
                    narrative_order: entry.narrativeOrder
                  }),
                  entry.content
                ].join("\n")
              });
            }
          }
          const hits = candidates.flatMap((candidate) => {
            const normalized = candidate.searchable.normalize("NFC").toLocaleLowerCase();
            const offset = normalized.indexOf(query);
            if (offset < 0) return [];
            const start = Math.max(0, offset - 120);
            const end = Math.min(candidate.searchable.length, offset + params.query.length + 200);
            return [{ ...candidate.target, snippet: candidate.searchable.slice(start, end) }];
          });
          const page = params.page ?? 1;
          const limit = params.limit ?? 20;
          const start = (page - 1) * limit;
          const end = Math.min(start + limit, hits.length);
          return textResult(JSON.stringify({
            hits: hits.slice(start, end),
            next_page: end < hits.length ? page + 1 : null
          }));
        }
      }),
      defineTool({
        name: "read_plot_design",
        label: "读取剧情设计",
        description:
          "按业务目标读取全书故事线或一个非伏笔剧情条目。按行段落返回标题、稳定业务 ID 和正文，不包装成 JSON。读取剧情点时一次返回概要、挂到该剧情点的全部故事事件（含每条事件正文）、该剧情点下全部故事情节正文，以及关联伏笔（如有）；不要再分别为这些故事事件或故事情节调用本工具。mode=preview 只返回摘录；mode=full 会建立本轮对该剧情点及其附带故事事件、故事情节进行 write_plot_design / edit_plot_design 所需的完整读取凭据。",
        parameters: strictObject({
          target: LONG_PLOT_ITEM_TARGET_PARAMETER,
          mode: Type.Optional(worldbuildingReadModeParameter)
        }),
        execute: async (_toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const mode = params.mode ?? "full";
          let serialized: string;
          let key: string;
          let display: string;
          if (params.target.kind === "book_line") {
            const result = await readWholeWorldbuildingDocument(
              index.bookLine,
              index.revision,
              projectRevision,
              signal
            );
            serialized = result.content;
            key = plotItemKey("book_line");
            display = formatPlotDesignRead({
              item: { kind: "book_line", title: "全书故事线" },
              body: serialized
            });
          } else if (params.target.kind === "story_plot") {
            const targetId = plotBusinessId(params.target);
            const loaded = await readStoryPlotContent(
              index,
              projectRevision,
              targetId,
              signal
            );
            serialized = loaded.content;
            key = plotItemKey("story_plot", targetId);
            display = formatPlotDesignRead({
              item: loaded.meta,
              body: serialized
            });
          } else if (params.target.kind === "chapter") {
            const targetId = plotBusinessId(params.target);
            const overlayEntry = chapterCardOverlay.get(targetId);
            let meta: Record<string, unknown>;
            if (overlayEntry) {
              meta = {
                kind: "chapter",
                chapter_card_id: targetId,
                volume_id: overlayEntry.volumeId,
                primary_arc_id: overlayEntry.primaryArcId,
                title: overlayEntry.title,
                narrative_order: overlayEntry.narrativeOrder
              };
              serialized = overlayEntry.content;
            } else {
              const item = resolvePlotItem(index, "chapter", targetId);
              const fileEntry = index.chapters.find(
                (entry) => entry.chapterCardId === targetId
              );
              if (!fileEntry) {
                throw new Error(`Chapter ${targetId} is missing its file index.`);
              }
              const result = await readWholeWorldbuildingDocument(
                fileEntry.card,
                index.revision,
                projectRevision,
                signal
              );
              meta = toPlotBusinessItem("chapter", item);
              serialized = result.content;
            }
            key = plotItemKey("chapter", targetId);
            display = formatPlotDesignRead({ item: meta, body: serialized });
          } else if (params.target.kind === "arc") {
            const targetId = plotBusinessId(params.target);
            const item = resolvePlotItem(index, "arc", targetId);
            const business = toPlotBusinessItem("arc", item);
            serialized = JSON.stringify(business, null, 2);
            key = plotItemKey("arc", targetId);
            const relatedEvents = index.plot.storyEvents
              .filter((event) => event.arcIds.includes(targetId))
              .sort(
                (left, right) =>
                  left.storyOrder - right.storyOrder ||
                  left.id.localeCompare(right.id)
              )
              .map((event) =>
                toPlotBusinessItem(
                  "event",
                  event as unknown as Record<string, unknown>
                )
              );
            const relatedStoryPlotIds = [
              ...index.plot.storyPlots
                .filter((storyPlot) => storyPlot.arcId === targetId)
                .map((storyPlot) => ({
                  id: storyPlot.id,
                  order: storyPlot.order
                })),
              ...pendingStoryPlotEntries(index)
                .filter(([, entry]) => entry.arcId === targetId)
                .map(([id, entry]) => ({
                  id,
                  order: entry.order
                }))
            ]
              .sort(
                (left, right) =>
                  left.order - right.order || left.id.localeCompare(right.id)
              )
              .map((entry) => entry.id);
            const relatedStoryPlots = await Promise.all(
              relatedStoryPlotIds.map((storyPlotId) =>
                readStoryPlotContent(
                  index,
                  projectRevision,
                  storyPlotId,
                  signal
                )
              )
            );
            const relatedForeshadowing = collectRelatedForeshadowing(
              index,
              targetId
            );
            display = formatPlotPointRead({
              item: business,
              storyEvents: relatedEvents,
              storyPlots: relatedStoryPlots.map((entry) => ({
                item: entry.meta,
                body: entry.content
              })),
              foreshadowing: relatedForeshadowing
            });
            if (mode === "full") {
              for (const event of relatedEvents) {
                fullyReadPlotItems.set(
                  plotItemKey("event", String(event.event_id)),
                  {
                    serialized: JSON.stringify(event, null, 2),
                    workspaceRevision: index.revision,
                    projectRevision
                  }
                );
              }
              for (const storyPlot of relatedStoryPlots) {
                fullyReadPlotItems.set(
                  plotItemKey(
                    "story_plot",
                    String(storyPlot.meta.story_plot_id)
                  ),
                  {
                    serialized: storyPlot.content,
                    workspaceRevision: index.revision,
                    projectRevision
                  }
                );
              }
            }
          } else {
            const targetId = plotBusinessId(params.target);
            const item = resolvePlotItem(index, params.target.kind, targetId);
            const business = toPlotBusinessItem(params.target.kind, item);
            serialized = JSON.stringify(business, null, 2);
            display = formatPlotDesignRead({ item: business });
            key = plotItemKey(params.target.kind, targetId);
          }
          if (mode === "full") {
            fullyReadPlotItems.set(key, {
              serialized,
              workspaceRevision: index.revision,
              projectRevision
            });
          }
          const previewLength = 320;
          const visible =
            mode === "preview" && display.length > previewLength * 2
              ? `${display.slice(0, previewLength)}\n\n……（中间省略 ${display.length - previewLength * 2} 个字符）……\n\n${display.slice(-previewLength)}`
              : display;
          return textResult(
            [
              mode === "preview" ? "预览（不建立整体覆盖凭据）：" : "完整内容：",
              "",
              visible || "（内容为空）"
            ].join("\n")
          );
        }
      })
    );
  }

  if (
    isPlotDesignAgent &&
    capabilities.has("mutate_structure") &&
    writableRoots.has("plot_design")
  ) {
    const plotProposal = (
      index: LongWorkspaceIndexSnapshot,
      batch: LongWorkspaceOperationBatch,
      projectRevision: number,
      summary: string,
      message = "已形成剧情设计变更提案，等待客户端审阅与冲突检查。",
      plain = false
    ) =>
      formLongMutationProposal({
        index,
        batch,
        projectRevision,
        summary,
        message,
        plain
      });

    const plotUpdateOperation = (
      item: Exclude<Static<typeof LONG_PLOT_WRITE_PARAMETERS>["item"], { kind: "book_line" } | { kind: "story_plot" }> |
        Exclude<Static<typeof LONG_PLOT_EDIT_PARAMETERS>["item"], { kind: "book_line" } | { kind: "story_plot" }>,
      patch: Record<string, unknown>
    ): LongWorkspaceOperation => {
      const id = plotBusinessId(item);
      if (item.kind === "volume") {
        return { type: "volume.update", id, patch } as LongWorkspaceOperation;
      }
      if (item.kind === "arc") {
        return { type: "arc.update", id, patch } as LongWorkspaceOperation;
      }
      if (item.kind === "chapter") {
        return { type: "chapter.update", id, patch } as LongWorkspaceOperation;
      }
      if (item.kind === "event") {
        return { type: "event.update", id, patch } as LongWorkspaceOperation;
      }
      if (item.kind === "connection") {
        return { type: "connection.update", id, patch } as LongWorkspaceOperation;
      }
      return { type: "placement.update", id, patch } as LongWorkspaceOperation;
    };

    tools.push(
      defineTool({
        name: "create_plot_design",
        label: "创建剧情设计",
        description:
          "一次创建一个非伏笔剧情条目并返回稳定业务 ID（叙事落点可用 placements 一次批量创建多个，只形成一张审批卡）。创建只建立结构条目（故事情节与章卡同时建立空正文文件），不在创建时初始化内容；故事情节必须通过 arc_id 挂载到既有剧情点；章卡必须指定 volume_id，primary_arc_id 可为 null，非空时必须属于同一分卷。创建提案通过预检后，故事情节与章卡可在本轮继续读取并用 write_plot_design 写入；同一轮的后续提案会按先后顺序等待前序提案获批，并基于最新工作区重新预览。伏笔线和伏笔触点继续使用现有结构提案工具。",
        parameters: LONG_PLOT_CREATE_PARAMETERS,
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const item = params.item;
          // loadIndex 在同一轮内复用缓存快照，本轮已创建但尚未落盘的故事情节只存在于
          // storyPlotOverlay；构建创建操作时必须一并计入，否则同一剧情点下的
          // order 会被重复分配，落盘校验将因 order 不连续而失败。章卡同理。
          const pendingStoryPlots = [...storyPlotOverlay.entries()]
            .filter(
              ([id, entry]) =>
                entry.pendingCreation &&
                !index.plot.storyPlots.some((storyPlot) => storyPlot.id === id)
            )
            .map(([id, entry]) => ({
              id,
              arcId: entry.arcId,
              title: entry.title,
              order: entry.order,
              file: entry.file
            }));
          const pendingChapterCards = [...chapterCardOverlay.entries()]
            .filter(
              ([id, entry]) =>
                entry.pendingCreation &&
                !index.plot.chapterCards.some((chapter) => chapter.id === id)
            )
            .map(([id, entry]) => ({
              id,
              volumeId: entry.volumeId,
              primaryArcId: entry.primaryArcId,
              title: entry.title,
              narrativeOrder: entry.narrativeOrder
            }));
          const buildIndex =
            pendingStoryPlots.length > 0 || pendingChapterCards.length > 0
              ? {
                  ...index,
                  plot: {
                    ...index.plot,
                    storyPlots: [
                      ...index.plot.storyPlots,
                      ...pendingStoryPlots
                    ],
                    chapterCards: [
                      ...index.plot.chapterCards,
                      ...pendingChapterCards
                    ]
                  }
                }
              : index;
          const rawOperations = (
            item.kind === "placements"
              ? item.items.map((placement) => ({
                  type: "placement.create" as const,
                  eventId: placement.event_id,
                  chapterCardId: placement.chapter_card_id,
                  mode: placement.mode,
                  disclosure: placement.disclosure,
                  writingPrompt: placement.writing_prompt
                }))
              : [
                  item.kind === "volume"
                    ? { type: "volume.create" as const, title: item.title, summary: item.summary }
                    : item.kind === "arc"
                      ? { type: "arc.create" as const, volumeId: item.volume_id, title: item.title, summary: item.summary, outline: item.outline }
                      : item.kind === "story_plot"
                        ? { type: "storyPlot.create" as const, arcId: item.arc_id, title: item.title }
                        : item.kind === "chapter"
                        ? {
                            type: "chapter.create" as const,
                            volumeId: item.volume_id,
                            primaryArcId: item.primary_arc_id,
                            title: item.title
                          }
                        : item.kind === "event"
                          ? {
                              type: "event.create" as const,
                              title: item.title,
                              summary: item.summary,
                              timeMode: item.time_mode,
                              timeLabel: item.time_label,
                              timeValue: item.time_value,
                              location: item.location,
                              arcIds: item.arc_ids,
                              characterIds: item.character_ids
                            }
                          : item.kind === "connection"
                            ? {
                                type: "connection.create" as const,
                                sourceEventId: item.source_event_id,
                                targetEventId: item.target_event_id,
                                connectionType: item.connection_type,
                                note: item.note
                              }
                            : {
                                type: "placement.create" as const,
                                eventId: item.event_id,
                                chapterCardId: item.chapter_card_id,
                                mode: item.mode,
                                disclosure: item.disclosure,
                                writingPrompt: item.writing_prompt
                              }
                ]
          ) as LongMutationToolOperation[];
          const built = buildRuntimeOperations({
            rawOperations,
            index: buildIndex,
            timestamp: new Date().toISOString(),
            idSeed: `${workspace.bookId}:${input.runId}:${toolCallId}`
          });
          const timestamp = new Date().toISOString();
          const created = built.operations[0];
          const createdId =
            created && "volume" in created
              ? created.volume.id
              : created && "arc" in created
                ? created.arc.id
                : created && "storyPlot" in created
                  ? created.storyPlot.id
                  : created && "chapterCard" in created
                    ? created.chapterCard.id
                    : created && "event" in created
                      ? created.event.id
                      : created && "connection" in created
                        ? created.connection.id
                        : created && "placement" in created
                          ? created.placement.id
                          : "";
          const summary = params.summary?.trim() ||
            (item.kind === "placements"
              ? `批量创建 ${item.items.length} 个叙事落点`
              : `创建${item.kind}“${"title" in item ? item.title : createdId}”`);
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: built.operations,
            documentWrites: []
          });
          const createdIdLabel =
            item.kind === "volume"
              ? "volume_id"
              : item.kind === "arc"
                ? "arc_id"
                : item.kind === "story_plot"
                  ? "story_plot_id"
                  : item.kind === "chapter"
                    ? "chapter_card_id"
                    : item.kind === "event"
                      ? "event_id"
                      : item.kind === "connection"
                        ? "connection_id"
                        : "placement_id";
          const placementIds =
            item.kind === "placements"
              ? built.operations.map((operation) =>
                  operation.type === "placement.create"
                    ? operation.placement.id
                    : ""
                )
              : [];
          const message =
            item.kind === "placements"
              ? `已形成一个叙事落点批量创建提案（${placementIds.length} 个落点），等待客户端审阅与冲突检查。\nplacements → ${placementIds.join(", ")}`
              : item.kind === "story_plot"
                ? `已形成故事情节“${item.title}”的创建提案，story_plot_id=${createdId}。可继续使用 write_plot_design 一次性写入正文；写入提案会等待本创建提案获批，无需再次读取。`
                : item.kind === "chapter"
                  ? `已形成章卡“${item.title}”的创建提案，chapter_card_id=${createdId}。可继续使用 write_plot_design 一次性写入正文；写入提案会等待本创建提案获批，无需再次读取。`
                  : `已形成一个剧情设计条目创建提案，等待客户端审阅与冲突检查。\n${item.kind} → ${createdIdLabel}=${createdId}`;
          const proposal = plotProposal(
            buildIndex,
            batch,
            projectRevision,
            summary,
            message,
            item.kind === "story_plot" || item.kind === "chapter"
          );
          if (proposal.details?.kind !== "long-mutation-proposal") {
            return proposal;
          }
          if (
            item.kind === "story_plot" &&
            created &&
            created.type === "storyPlot.create"
          ) {
            storyPlotOverlay.set(createdId, {
              arcId: created.storyPlot.arcId,
              title: created.storyPlot.title,
              order: created.storyPlot.order,
              file: created.storyPlot.file,
              content: "",
              pendingCreation: true
            });
            fullyReadPlotItems.set(plotItemKey("story_plot", createdId), {
              serialized: "",
              workspaceRevision: index.revision,
              projectRevision
            });
          }
          if (
            item.kind === "chapter" &&
            created &&
            created.type === "chapter.create"
          ) {
            chapterCardOverlay.set(createdId, {
              volumeId: created.chapterCard.volumeId,
              primaryArcId: created.chapterCard.primaryArcId,
              title: created.chapterCard.title,
              narrativeOrder: created.chapterCard.narrativeOrder,
              file: created.files.card,
              content: "",
              pendingCreation: true
            });
            fullyReadPlotItems.set(plotItemKey("chapter", createdId), {
              serialized: "",
              workspaceRevision: index.revision,
              projectRevision
            });
          }
          return proposal;
        }
      }),
      defineTool({
        name: "write_plot_design",
        label: "写入剧情设计",
        description:
          "完整覆盖全书故事线、一个既有非伏笔剧情条目的内容字段，或故事情节/章卡的整篇正文。已有连续性记录只作历史参考，不限制大幅修改。既有目标必须先用 read_plot_design mode=full 完整读取，并明确 allow_overwrite_existing=true；读取剧情点（mode=full）也会同时建立其下故事事件与故事情节的完整读取凭据，不必再分别读取。本轮刚创建的空白故事情节或章卡可直接一次性写入，无需再次读取或确认覆盖。局部修改应使用 edit_plot_design。故事情节与章卡正文一次性整篇写入，不要分段多次写入。",
        parameters: LONG_PLOT_WRITE_PARAMETERS,
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const item = params.item;
          const itemId = item.kind === "book_line" ? undefined : plotBusinessId(item);
          const key = plotItemKey(item.kind, itemId);
          const evidence = fullyReadPlotItems.get(key);
          const pendingEmptyTextItem =
            item.kind === "story_plot"
              ? (() => {
                  const entry = storyPlotOverlay.get(itemId!);
                  return entry?.pendingCreation === true && entry.content === "";
                })()
              : item.kind === "chapter"
                ? (() => {
                    const entry = chapterCardOverlay.get(itemId!);
                    return entry?.pendingCreation === true && entry.content === "";
                  })()
                : false;
          if (
            !evidence ||
            evidence.workspaceRevision !== index.revision ||
            evidence.projectRevision !== projectRevision
          ) {
            return textResult("未写入：请先调用 read_plot_design（mode=full）完整读取目标内容。");
          }
          if (!pendingEmptyTextItem && params.allow_overwrite_existing !== true) {
            return textResult("未写入：完整覆盖需明确设置 allow_overwrite_existing=true；局部修改请使用 edit_plot_design。");
          }
          const timestamp = new Date().toISOString();
          const summary = params.summary?.trim() || `完整写入剧情设计 ${key}`;
          if (item.kind === "book_line") {
            const live = await readWholeWorldbuildingDocument(
              index.bookLine,
              index.revision,
              projectRevision,
              signal
            );
            if (live.content !== evidence.serialized) {
              throw new Error("Book line changed after it was read.");
            }
            const nextRevision = nextContentRevision(live.file.revision, item.text);
            const batch = LongWorkspaceOperationBatchSchema.parse({
              baseRevision: index.revision,
              updatedAt: timestamp,
              operations: [],
              documentWrites: [{
                proposalId: `proposal_${stableHash(`${workspace.bookId}:${input.runId}:${toolCallId}`).slice(0, 24)}`,
                fileId: live.file.id,
                content: item.text,
                mode: "replace",
                expectedRevision: live.file.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }]
            });
            fullyReadPlotItems.set(key, { serialized: item.text, workspaceRevision: index.revision, projectRevision });
            return plotProposal(index, batch, projectRevision, summary);
          }
          if (item.kind === "story_plot") {
            const overlayEntry = storyPlotOverlay.get(itemId!);
            let meta: { arcId: string; title: string; order: number };
            let liveFile: LongWorkspaceFileReference;
            let liveContent: string;
            if (overlayEntry) {
              meta = {
                arcId: overlayEntry.arcId,
                title: overlayEntry.title,
                order: overlayEntry.order
              };
              liveFile = overlayEntry.file;
              liveContent = overlayEntry.content;
            } else {
              const storyPlot = resolvePlotItem(index, "story_plot", itemId!);
              const result = await readWholeWorldbuildingDocument(
                storyPlot.file as LongWorkspaceFileReference,
                index.revision,
                projectRevision,
                signal
              );
              meta = {
                arcId: storyPlot.arcId as string,
                title: storyPlot.title as string,
                order: storyPlot.order as number
              };
              liveFile = result.file;
              liveContent = result.content;
            }
            if (liveContent !== evidence.serialized) {
              throw new Error("Story plot changed after it was read.");
            }
            const nextRevision = nextContentRevision(liveFile.revision, item.text);
            const batch = LongWorkspaceOperationBatchSchema.parse({
              baseRevision: index.revision,
              updatedAt: timestamp,
              operations: [],
              documentWrites: [{
                proposalId: `proposal_${stableHash(`${workspace.bookId}:${input.runId}:${toolCallId}`).slice(0, 24)}`,
                fileId: liveFile.id,
                content: item.text,
                mode: "replace",
                expectedRevision: liveFile.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }]
            });
            storyPlotOverlay.set(itemId!, {
              ...meta,
              file: { ...liveFile, revision: nextRevision, updatedAt: timestamp },
              content: item.text,
              pendingCreation: overlayEntry?.pendingCreation ?? false
            });
            fullyReadPlotItems.set(key, { serialized: item.text, workspaceRevision: index.revision, projectRevision });
            return plotProposal(index, batch, projectRevision, summary, `已写入故事情节“${meta.title}”正文。`, true);
          }
          if (item.kind === "chapter") {
            const overlayEntry = chapterCardOverlay.get(itemId!);
            let meta: { volumeId: string; primaryArcId: string | null; title: string; narrativeOrder: number };
            let liveFile: LongWorkspaceFileReference;
            let liveContent: string;
            if (overlayEntry) {
              meta = {
                volumeId: overlayEntry.volumeId,
                primaryArcId: overlayEntry.primaryArcId,
                title: overlayEntry.title,
                narrativeOrder: overlayEntry.narrativeOrder
              };
              liveFile = overlayEntry.file;
              liveContent = overlayEntry.content;
            } else {
              resolvePlotItem(index, "chapter", itemId!);
              const fileEntry = index.chapters.find(
                (entry) => entry.chapterCardId === itemId
              );
              if (!fileEntry) {
                throw new Error(`Chapter ${itemId} is missing its file index.`);
              }
              const result = await readWholeWorldbuildingDocument(
                fileEntry.card,
                index.revision,
                projectRevision,
                signal
              );
              const chapterItem = resolvePlotItem(index, "chapter", itemId!);
              meta = {
                volumeId: chapterItem.volumeId as string,
                primaryArcId: chapterItem.primaryArcId as string | null,
                title: chapterItem.title as string,
                narrativeOrder: chapterItem.narrativeOrder as number
              };
              liveFile = result.file;
              liveContent = result.content;
            }
            if (liveContent !== evidence.serialized) {
              throw new Error("Chapter card changed after it was read.");
            }
            const nextRevision = nextContentRevision(liveFile.revision, item.text);
            const batch = LongWorkspaceOperationBatchSchema.parse({
              baseRevision: index.revision,
              updatedAt: timestamp,
              operations: [],
              documentWrites: [{
                proposalId: `proposal_${stableHash(`${workspace.bookId}:${input.runId}:${toolCallId}`).slice(0, 24)}`,
                fileId: liveFile.id,
                content: item.text,
                mode: "replace",
                expectedRevision: liveFile.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }]
            });
            chapterCardOverlay.set(itemId!, {
              ...meta,
              file: { ...liveFile, revision: nextRevision, updatedAt: timestamp },
              content: item.text,
              pendingCreation: overlayEntry?.pendingCreation ?? false
            });
            fullyReadPlotItems.set(key, { serialized: item.text, workspaceRevision: index.revision, projectRevision });
            return plotProposal(index, batch, projectRevision, summary, `已写入章卡“${meta.title}”正文。`, true);
          }
          const current = JSON.stringify(
            toPlotBusinessItem(item.kind, resolvePlotItem(index, item.kind, itemId!)),
            null,
            2
          );
          if (current !== evidence.serialized) {
            throw new Error("Plot item changed after it was read.");
          }
          const patch =
            item.kind === "volume"
              ? { summary: item.summary }
              : item.kind === "arc"
                ? { summary: item.summary, outline: item.outline }
                : item.kind === "event"
                  ? {
                      summary: item.summary,
                      timeMode: item.time_mode,
                      timeLabel: item.time_label,
                      ...(item.time_value === undefined ? {} : { timeValue: item.time_value }),
                      location: item.location,
                      arcIds: item.arc_ids,
                      characterIds: item.character_ids
                    }
                  : item.kind === "connection"
                    ? { note: item.note }
                    : { writingPrompt: item.writing_prompt };
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [plotUpdateOperation(item, patch)],
            documentWrites: []
          });
          return plotProposal(index, batch, projectRevision, summary);
        }
      }),
      defineTool({
        name: "edit_plot_design",
        label: "编辑剧情设计",
        description:
          "在已用 read_plot_design mode=full 完整读取的目标上做局部修改。读取剧情点（mode=full）后可直接局部修改该剧情点及其下故事事件、故事情节，不必再分别读取。全书故事线、故事情节与章卡正文按唯一原文片段替换；已有连续性记录不限制局部或大幅修改；其余结构化剧情条目只更新明确给出的内容字段。",
        parameters: LONG_PLOT_EDIT_PARAMETERS,
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { index, projectRevision } = await loadIndex(signal);
          const item = params.item;
          const itemId = item.kind === "book_line" ? undefined : plotBusinessId(item);
          const key = plotItemKey(item.kind, itemId);
          const evidence = fullyReadPlotItems.get(key);
          if (
            !evidence ||
            evidence.workspaceRevision !== index.revision ||
            evidence.projectRevision !== projectRevision
          ) {
            return textResult("未编辑：请先调用 read_plot_design（mode=full）完整读取目标内容。");
          }
          const timestamp = new Date().toISOString();
          const summary = params.summary?.trim() || `局部修改剧情设计 ${key}`;
          if (item.kind === "book_line") {
            const live = await readWholeWorldbuildingDocument(
              index.bookLine,
              index.revision,
              projectRevision,
              signal
            );
            if (live.content !== evidence.serialized) {
              throw new Error("Book line changed after it was read.");
            }
            let content = live.content;
            for (const replacement of item.replacements) {
              const first = content.indexOf(replacement.original_text);
              const second = first < 0 ? -1 : content.indexOf(replacement.original_text, first + replacement.original_text.length);
              if (first < 0 || second >= 0) {
                return textResult(`未替换：原文片段必须唯一存在：${replacement.original_text.slice(0, 80)}`);
              }
              content = content.slice(0, first) + replacement.new_text + content.slice(first + replacement.original_text.length);
            }
            const nextRevision = nextContentRevision(live.file.revision, content);
            const batch = LongWorkspaceOperationBatchSchema.parse({
              baseRevision: index.revision,
              updatedAt: timestamp,
              operations: [],
              documentWrites: [{
                proposalId: `proposal_${stableHash(`${workspace.bookId}:${input.runId}:${toolCallId}`).slice(0, 24)}`,
                fileId: live.file.id,
                content,
                mode: "replace",
                expectedRevision: live.file.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }]
            });
            fullyReadPlotItems.set(key, { serialized: content, workspaceRevision: index.revision, projectRevision });
            return plotProposal(index, batch, projectRevision, summary);
          }
          if (item.kind === "story_plot") {
            const overlayEntry = storyPlotOverlay.get(itemId!);
            let meta: { arcId: string; title: string; order: number };
            let liveFile: LongWorkspaceFileReference;
            let liveContent: string;
            if (overlayEntry) {
              meta = {
                arcId: overlayEntry.arcId,
                title: overlayEntry.title,
                order: overlayEntry.order
              };
              liveFile = overlayEntry.file;
              liveContent = overlayEntry.content;
            } else {
              const storyPlot = resolvePlotItem(index, "story_plot", itemId!);
              const result = await readWholeWorldbuildingDocument(
                storyPlot.file as LongWorkspaceFileReference,
                index.revision,
                projectRevision,
                signal
              );
              meta = {
                arcId: storyPlot.arcId as string,
                title: storyPlot.title as string,
                order: storyPlot.order as number
              };
              liveFile = result.file;
              liveContent = result.content;
            }
            if (liveContent !== evidence.serialized) {
              throw new Error("Story plot changed after it was read.");
            }
            let content = liveContent;
            for (const replacement of item.replacements) {
              const first = content.indexOf(replacement.original_text);
              const second = first < 0 ? -1 : content.indexOf(replacement.original_text, first + replacement.original_text.length);
              if (first < 0 || second >= 0) {
                return textResult(`未替换：原文片段必须唯一存在：${replacement.original_text.slice(0, 80)}`);
              }
              content = content.slice(0, first) + replacement.new_text + content.slice(first + replacement.original_text.length);
            }
            const nextRevision = nextContentRevision(liveFile.revision, content);
            const batch = LongWorkspaceOperationBatchSchema.parse({
              baseRevision: index.revision,
              updatedAt: timestamp,
              operations: [],
              documentWrites: [{
                proposalId: `proposal_${stableHash(`${workspace.bookId}:${input.runId}:${toolCallId}`).slice(0, 24)}`,
                fileId: liveFile.id,
                content,
                mode: "replace",
                expectedRevision: liveFile.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }]
            });
            storyPlotOverlay.set(itemId!, {
              ...meta,
              file: { ...liveFile, revision: nextRevision, updatedAt: timestamp },
              content,
              pendingCreation: overlayEntry?.pendingCreation ?? false
            });
            fullyReadPlotItems.set(key, { serialized: content, workspaceRevision: index.revision, projectRevision });
            return plotProposal(index, batch, projectRevision, summary, `已局部修改故事情节“${meta.title}”正文。`, true);
          }
          if (item.kind === "chapter") {
            const overlayEntry = chapterCardOverlay.get(itemId!);
            let meta: { volumeId: string; primaryArcId: string | null; title: string; narrativeOrder: number };
            let liveFile: LongWorkspaceFileReference;
            let liveContent: string;
            if (overlayEntry) {
              meta = {
                volumeId: overlayEntry.volumeId,
                primaryArcId: overlayEntry.primaryArcId,
                title: overlayEntry.title,
                narrativeOrder: overlayEntry.narrativeOrder
              };
              liveFile = overlayEntry.file;
              liveContent = overlayEntry.content;
            } else {
              const chapterItem = resolvePlotItem(index, "chapter", itemId!);
              const fileEntry = index.chapters.find(
                (entry) => entry.chapterCardId === itemId
              );
              if (!fileEntry) {
                throw new Error(`Chapter ${itemId} is missing its file index.`);
              }
              const result = await readWholeWorldbuildingDocument(
                fileEntry.card,
                index.revision,
                projectRevision,
                signal
              );
              meta = {
                volumeId: chapterItem.volumeId as string,
                primaryArcId: chapterItem.primaryArcId as string | null,
                title: chapterItem.title as string,
                narrativeOrder: chapterItem.narrativeOrder as number
              };
              liveFile = result.file;
              liveContent = result.content;
            }
            if (liveContent !== evidence.serialized) {
              throw new Error("Chapter card changed after it was read.");
            }
            let content = liveContent;
            for (const replacement of item.replacements) {
              const first = content.indexOf(replacement.original_text);
              const second = first < 0 ? -1 : content.indexOf(replacement.original_text, first + replacement.original_text.length);
              if (first < 0 || second >= 0) {
                return textResult(`未替换：原文片段必须唯一存在：${replacement.original_text.slice(0, 80)}`);
              }
              content = content.slice(0, first) + replacement.new_text + content.slice(first + replacement.original_text.length);
            }
            const nextRevision = nextContentRevision(liveFile.revision, content);
            const batch = LongWorkspaceOperationBatchSchema.parse({
              baseRevision: index.revision,
              updatedAt: timestamp,
              operations: [],
              documentWrites: [{
                proposalId: `proposal_${stableHash(`${workspace.bookId}:${input.runId}:${toolCallId}`).slice(0, 24)}`,
                fileId: liveFile.id,
                content,
                mode: "replace",
                expectedRevision: liveFile.revision,
                nextRevision,
                updatedAt: timestamp,
                reason: summary
              }]
            });
            chapterCardOverlay.set(itemId!, {
              ...meta,
              file: { ...liveFile, revision: nextRevision, updatedAt: timestamp },
              content,
              pendingCreation: overlayEntry?.pendingCreation ?? false
            });
            fullyReadPlotItems.set(key, { serialized: content, workspaceRevision: index.revision, projectRevision });
            return plotProposal(index, batch, projectRevision, summary, `已局部修改章卡“${meta.title}”正文。`, true);
          }
          const current = JSON.stringify(
            toPlotBusinessItem(item.kind, resolvePlotItem(index, item.kind, itemId!)),
            null,
            2
          );
          if (current !== evidence.serialized) {
            throw new Error("Plot item changed after it was read.");
          }
          const raw = item.patch as Record<string, unknown>;
          const patch =
            item.kind === "event"
              ? {
                  ...(raw.summary === undefined ? {} : { summary: raw.summary }),
                  ...(raw.time_mode === undefined ? {} : { timeMode: raw.time_mode }),
                  ...(raw.time_label === undefined ? {} : { timeLabel: raw.time_label }),
                  ...(raw.time_value === undefined ? {} : { timeValue: raw.time_value }),
                  ...(raw.location === undefined ? {} : { location: raw.location }),
                  ...(raw.arc_ids === undefined ? {} : { arcIds: raw.arc_ids }),
                  ...(raw.character_ids === undefined ? {} : { characterIds: raw.character_ids })
                }
              : item.kind === "placement"
                ? { writingPrompt: raw.writing_prompt }
                : raw;
          const batch = LongWorkspaceOperationBatchSchema.parse({
            baseRevision: index.revision,
            updatedAt: timestamp,
            operations: [plotUpdateOperation(item, patch)],
            documentWrites: []
          });
          return plotProposal(index, batch, projectRevision, summary);
        }
      })
    );
  }

  if (capabilities.has("mutate_structure") && writableRoots.size > 0) {
    tools.push(
      defineTool({
        name: "propose_long_mutation",
        label: "提议长篇结构变更",
        description:
          profile.id === "setting"
            ? "提交世界观分类与已有条目的重命名、删除和排序，以及人物重命名、别名、移动到现有人物类型、删除和排序。此工具不能创建列表条目或人物，也不能写入正文；创建必须使用 create_setting，正文必须使用 write_setting 或 edit_setting。提案只进入审阅队列，不直接写磁盘。"
            : profile.id === "plot_design"
              ? "提交既有分卷、剧情点、故事情节、章卡、故事事件、事件连接和叙事落点的重命名、关联、移动、删除、排序，以及全部伏笔线/伏笔触点变更。连续性记录只作参考，不锁定这些结构；删除已有记录的章卡会在危险确认后级联清理该章正文与记录。章卡必须属于分卷，剧情点关联可为 null；非空时必须与章卡属于同一分卷。所有结构操作会在生成审批前基于当前有效索引预检；预检失败不会生成审批卡。同一轮的多个有效提案会按先后顺序等待前序提案处理，并基于最新工作区重新预览。非伏笔条目创建必须使用 create_plot_design，内容写入必须使用 write_plot_design 或 edit_plot_design。提案只进入审阅队列，不直接写磁盘。"
            : "按显式领域操作提交当前长篇的结构变更提案。伏笔线可分别填写 hiddenTruth 与 plannedSpan，伏笔触点可用 volumeId 或 arcId 设置卷级/剧情点计划锚点。运行时锁定项目版本、生成新实体与文件信息并计算文档内容修订；只能更新逻辑文档目标，不能传路径或文件修订。提案只进入审阅队列，不直接写磁盘。",
        parameters:
          profile.id === "setting"
            ? LONG_SETTING_MUTATION_PARAMETERS
            : profile.id === "plot_design"
              ? LONG_PLOT_MUTATION_PARAMETERS
              : LONG_MUTATION_PARAMETERS,
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          throwIfAborted(signal);
          const summary = params.summary.trim();
          if (!summary) {
            throw new Error(
              "Long mutation proposal summary must contain non-whitespace text."
            );
          }
          const { index, projectRevision } = await loadIndex(signal);
          const timestamp = new Date().toISOString();
          const idSeed = `${workspace.bookId}:${input.runId}:${toolCallId}`;
          const built = buildRuntimeOperations({
            rawOperations: params.operations,
            index,
            timestamp,
            idSeed
          });
          const documentUpdates =
            "document_updates" in params
              ? params.document_updates ?? []
              : [];
          const documentTargets = documentUpdates.map((update) => {
            const target = resolveDocumentUpdateTarget(
              update,
              index,
              built.clientReferences
            );
            if (
              target.root === "draft" ||
              !writableRoots.has(target.root)
            ) {
              throw new Error(
                "Document update proposal is outside the agent's write roots."
              );
            }
            return target;
          });
          const liveRevisions = new Map(
            await Promise.all(
              documentTargets.map(async (target) => [
                target.file.id,
                await loadLiveDocumentRevision(
                  target.file,
                  index.revision,
                  projectRevision,
                  signal
                )
              ] as const)
            )
          );
          const batch = LongWorkspaceOperationBatchSchema.parse(
            {
              baseRevision: index.revision,
              updatedAt: timestamp,
              operations: built.operations,
              documentWrites: buildRuntimeDocumentWrites({
                updates: documentUpdates,
                index,
                clientReferences: built.clientReferences,
                writableRoots,
                liveRevisions,
                timestamp,
                idSeed
              })
            }
          );
          for (const operation of batch.operations) {
            const root = rootForOperation(operation);
            if (!writableRoots.has(root)) {
              throw new Error(`Operation ${operation.type} is outside the agent's write roots.`);
            }
            for (const file of collectOperationFiles(operation)) {
              const createdRoots: LongWorkspaceRoot[] =
                operation.type === "chapter.create"
                  ? ["draft", "plot_design", "continuity_ledger"]
                  : [createdFileRootForOperation(operation)];
              if (
                !createdRoots.some((candidate) =>
                  filePathBelongsToRoot(file, candidate)
                )
              ) {
                throw new Error(`Operation ${operation.type} contains an out-of-root file path.`);
              }
            }
          }
          throwIfAborted(signal);
          return formLongMutationProposal({
            index,
            batch,
            projectRevision,
            summary,
            message:
              "已形成长篇结构变更提案，等待客户端审阅与冲突检查。"
          });
        }
      })
    );
  }
  return tools;
}
