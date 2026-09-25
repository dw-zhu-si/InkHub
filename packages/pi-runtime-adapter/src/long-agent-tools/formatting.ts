import type {
  LongChapterReadiness,
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";

function joinLines(lines: readonly (string | undefined)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
function joinParagraphs(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join("\n\n");
}

export function formatWorldbuildingCategoryList(
  categories: readonly {
    category_id: string;
    title: string;
    format: "text" | "list";
    item_count?: number;
  }[]
): string {
  if (categories.length === 0) {
    return joinParagraphs(["世界观分类", "（暂无分类）"]);
  }
  return joinParagraphs([
    "世界观分类",
    ...categories.map((category) =>
      joinLines([
        category.title,
        `category_id=${category.category_id}`,
        `类型=${category.format === "list" ? "条目列表" : "文本"}`,
        category.format === "list"
          ? `条目数=${category.item_count ?? 0}`
          : undefined
      ])
    )
  ]);
}

export function formatWorldbuildingItemList(input: {
  category_id: string;
  title: string;
  format: "text" | "list";
  overview?: string;
  items?: readonly { item_id: string; title: string }[];
}): string {
  const header = joinLines([
    `分类：${input.title}`,
    `category_id=${input.category_id}`,
    `类型=${input.format === "list" ? "条目列表" : "文本"}`
  ]);
  if (input.format !== "list") {
    return joinParagraphs([
      header,
      "这是文本型分类；读取内容时不要传 item_id。"
    ]);
  }
  const items = input.items ?? [];
  return joinParagraphs([
    header,
    joinLines(["概览", input.overview?.trim() ? input.overview : "（空）"]),
    items.length === 0
      ? joinLines(["条目", "（暂无条目）"])
      : joinParagraphs([
          "条目",
          ...items.map((item) =>
            joinLines([item.title, `item_id=${item.item_id}`])
          )
        ])
  ]);
}

export function formatCharacterList(input: {
  types: readonly {
    type_id: string;
    title: string;
    order: number;
    character_count: number;
  }[];
  overview: string;
  characters: readonly {
    character_id: string;
    name: string;
    type_id: string;
    type_title: string;
    aliases: readonly string[];
  }[];
}): string {
  const types =
    input.types.length === 0
      ? joinLines(["人物类型", "（暂无类型）"])
      : joinParagraphs([
          "人物类型",
          ...input.types.map((characterType) =>
            joinLines([
              characterType.title,
              `type_id=${characterType.type_id}`,
              `顺序=${characterType.order}`,
              `人数=${characterType.character_count}`
            ])
          )
        ]);
  const characters =
    input.characters.length === 0
      ? joinLines(["人物", "（暂无人物）"])
      : joinParagraphs([
          "人物",
          ...input.characters.map((character) =>
            joinLines([
              character.name,
              `character_id=${character.character_id}`,
              `type_id=${character.type_id}`,
              `类型=${character.type_title}`,
              character.aliases.length > 0
                ? `别名=${character.aliases.join("、")}`
                : undefined
            ])
          )
        ]);
  return joinParagraphs([
    types,
    joinLines(["概览", input.overview.trim() ? input.overview : "（空）"]),
    characters
  ]);
}

const CHAPTER_DOCUMENT_LABELS = {
  body: "正文",
  character_state: "章末人物状态",
  handoff: "接续包"
} as const;

const CHAPTER_BODY_STATUS_LABELS = {
  written: "已写",
  empty: "空"
} as const;

const CHAPTER_RECORD_STATUS_LABELS = {
  recorded: "已记录",
  unrecorded: "未记录"
} as const;

const CHAPTER_READINESS_STATUS_LABELS = {
  empty: "空",
  partial: "部分",
  ready_to_commit: "可结算"
} as const;

export type ChapterDocumentKind = keyof typeof CHAPTER_DOCUMENT_LABELS;

export type ChapterListItem = {
  chapter_card_id: string;
  title: string;
  narrative_order: number;
  body_status: keyof typeof CHAPTER_BODY_STATUS_LABELS;
  record_status: keyof typeof CHAPTER_RECORD_STATUS_LABELS;
  active: boolean;
};

export function formatChapterList(input: {
  page: number;
  limit?: number;
  total: number;
  items: readonly ChapterListItem[];
}): string {
  const header = joinLines([
    "正文章节",
    `第 ${input.page} 页 / 共 ${input.total} 条`
  ]);
  if (input.items.length === 0) {
    return joinParagraphs([header, "（暂无章节）"]);
  }
  return joinParagraphs([
    header,
    ...input.items.map((item) =>
      joinLines([
        item.title,
        `chapter_card_id=${item.chapter_card_id}`,
        `叙事顺序=${item.narrative_order}`,
        `正文状态=${CHAPTER_BODY_STATUS_LABELS[item.body_status]}`,
        `提交状态=${CHAPTER_RECORD_STATUS_LABELS[item.record_status]}`,
        `当前章=${item.active ? "是" : "否"}`
      ])
    )
  ]);
}

export type ChapterSearchHit = {
  chapter_card_id: string;
  document: ChapterDocumentKind;
  title: string;
  snippet: string;
};

export function formatChapterSearch(input: {
  query: string;
  hits: readonly ChapterSearchHit[];
  next_cursor?: string | null;
}): string {
  const header = joinLines(["搜索", `query=${input.query}`]);
  const hits =
    input.hits.length === 0
      ? "（无命中）"
      : joinParagraphs(
          input.hits.map((hit) =>
            joinLines([
              hit.title,
              `chapter_card_id=${hit.chapter_card_id}`,
              `document=${hit.document}`,
              "摘录",
              hit.snippet.trim() ? hit.snippet : "（空）"
            ])
          )
        );
  return joinParagraphs([
    header,
    hits,
    input.next_cursor ? `next_cursor=${input.next_cursor}` : ""
  ]);
}

export function formatChapterRead(input: {
  chapter_card_id: string;
  title: string;
  document: ChapterDocumentKind;
  mode: "preview" | "full";
  content: string;
  truncated?: boolean;
}): string {
  const header = joinLines([
    input.title,
    `chapter_card_id=${input.chapter_card_id}`,
    `document=${input.document}`,
    `mode=${input.mode}`,
    input.truncated ? "truncated=true" : undefined
  ]);
  return joinParagraphs([
    input.mode === "preview"
      ? "预览（不建立整体覆盖凭据）："
      : "完整内容：",
    header,
    joinLines([
      CHAPTER_DOCUMENT_LABELS[input.document],
      input.content.trim() ? input.content : "（内容为空）"
    ])
  ]);
}

export function formatChapterReadiness(readiness: LongChapterReadiness): string {
  const missing =
    readiness.missingFiles.length === 0
      ? "（无）"
      : readiness.missingFiles
          .map((file) => CHAPTER_DOCUMENT_LABELS[file])
          .join("、");
  return joinLines([
    readiness.title,
    `chapter_card_id=${readiness.chapterCardId}`,
    `状态=${CHAPTER_READINESS_STATUS_LABELS[readiness.status]}`,
    `缺失文件=${missing}`
  ]);
}

const PLOT_DESIGN_KIND_LABELS = {
  book_line: "全书故事线",
  volume: "分卷",
  arc: "剧情点",
  story_plot: "故事情节",
  chapter: "章卡",
  event: "故事事件",
  connection: "事件连接",
  placement: "叙事落点"
} as const;

export type PlotDesignKind = keyof typeof PLOT_DESIGN_KIND_LABELS;

export type PlotDesignListItem = {
  kind: PlotDesignKind;
  title?: string;
  volume_id?: string;
  arc_id?: string;
  story_plot_id?: string;
  chapter_card_id?: string;
  event_id?: string;
  connection_id?: string;
  placement_id?: string;
  primary_arc_id?: string | null;
  source_event_id?: string;
  target_event_id?: string;
  connection_type?: string;
  order?: number;
  narrative_order?: number;
  order_in_chapter?: number;
  status?: string;
};

export function formatPlotDesignKindList(
  sections: readonly { kind: PlotDesignKind; count: number }[]
): string {
  return joinParagraphs([
    "剧情结构",
    ...sections.map((section) =>
      joinLines([
        PLOT_DESIGN_KIND_LABELS[section.kind],
        `kind=${section.kind}`,
        `条目数=${section.count}`
      ])
    )
  ]);
}

function formatPlotDesignItem(item: PlotDesignListItem): string {
  switch (item.kind) {
    case "book_line":
      return joinLines(["全书故事线", "kind=book_line"]);
    case "volume":
      return joinLines([
        item.title,
        item.volume_id ? `volume_id=${item.volume_id}` : undefined,
        item.order !== undefined ? `顺序=${item.order}` : undefined
      ]);
    case "arc":
      return joinLines([
        item.title,
        item.arc_id ? `arc_id=${item.arc_id}` : undefined,
        item.volume_id ? `volume_id=${item.volume_id}` : undefined,
        item.order !== undefined ? `顺序=${item.order}` : undefined
      ]);
    case "story_plot":
      return joinLines([
        item.title,
        item.story_plot_id ? `story_plot_id=${item.story_plot_id}` : undefined,
        item.arc_id ? `arc_id=${item.arc_id}` : undefined,
        item.order !== undefined ? `顺序=${item.order}` : undefined
      ]);
    case "chapter":
      return joinLines([
        item.title,
        item.chapter_card_id
          ? `chapter_card_id=${item.chapter_card_id}`
          : undefined,
        item.volume_id ? `volume_id=${item.volume_id}` : undefined,
        `primary_arc_id=${item.primary_arc_id ?? "null"}`,
        item.narrative_order !== undefined
          ? `叙事顺序=${item.narrative_order}`
          : undefined
      ]);
    case "event":
      return joinLines([
        item.title,
        item.event_id ? `event_id=${item.event_id}` : undefined,
        item.order !== undefined ? `顺序=${item.order}` : undefined
      ]);
    case "connection":
      return joinLines([
        item.connection_id ? `connection_id=${item.connection_id}` : undefined,
        item.source_event_id
          ? `source_event_id=${item.source_event_id}`
          : undefined,
        item.target_event_id
          ? `target_event_id=${item.target_event_id}`
          : undefined,
        item.connection_type ? `类型=${item.connection_type}` : undefined
      ]);
    case "placement":
      return joinLines([
        item.placement_id ? `placement_id=${item.placement_id}` : undefined,
        item.event_id ? `event_id=${item.event_id}` : undefined,
        item.chapter_card_id
          ? `chapter_card_id=${item.chapter_card_id}`
          : undefined,
        item.order_in_chapter !== undefined
          ? `章内顺序=${item.order_in_chapter}`
          : undefined,
        item.status ? `状态=${item.status}` : undefined
      ]);
  }
}

export function formatPlotDesignItemList(input: {
  kind: PlotDesignKind;
  items: readonly PlotDesignListItem[];
}): string {
  if (input.kind === "book_line") {
    return formatPlotDesignItem({ kind: "book_line", title: "全书故事线" });
  }
  const label = PLOT_DESIGN_KIND_LABELS[input.kind];
  if (input.items.length === 0) {
    return joinParagraphs([label, `（暂无${label}）`]);
  }
  return joinParagraphs([
    label,
    ...input.items.map((item) => formatPlotDesignItem(item))
  ]);
}

function formatPlotDesignIdList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "（无）";
  return value.map(String).join("、");
}

function formatPlotDesignTextBlock(
  label: string,
  value: unknown,
  empty = "（空）"
): string {
  const text = typeof value === "string" ? value.trim() : "";
  return joinLines([label, text || empty]);
}

export function formatPlotDesignRead(input: {
  item: Record<string, unknown>;
  body?: string;
}): string {
  const item = input.item;
  const kind = item.kind as PlotDesignKind;
  const header = joinLines([
    typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : PLOT_DESIGN_KIND_LABELS[kind],
    `kind=${kind}`,
    typeof item.story_plot_id === "string"
      ? `story_plot_id=${item.story_plot_id}`
      : undefined,
    typeof item.chapter_card_id === "string"
      ? `chapter_card_id=${item.chapter_card_id}`
      : undefined,
    typeof item.placement_id === "string"
      ? `placement_id=${item.placement_id}`
      : undefined,
    typeof item.connection_id === "string"
      ? `connection_id=${item.connection_id}`
      : undefined,
    typeof item.event_id === "string" ? `event_id=${item.event_id}` : undefined,
    typeof item.arc_id === "string" ? `arc_id=${item.arc_id}` : undefined,
    typeof item.volume_id === "string" ? `volume_id=${item.volume_id}` : undefined,
    typeof item.source_event_id === "string"
      ? `source_event_id=${item.source_event_id}`
      : undefined,
    typeof item.target_event_id === "string"
      ? `target_event_id=${item.target_event_id}`
      : undefined,
    item.kind === "chapter"
      ? `primary_arc_id=${item.primary_arc_id ?? "null"}`
      : undefined,
    item.order !== undefined ? `顺序=${item.order}` : undefined,
    item.narrative_order !== undefined
      ? `叙事顺序=${item.narrative_order}`
      : undefined,
    item.order_in_chapter !== undefined
      ? `章内顺序=${item.order_in_chapter}`
      : undefined,
    typeof item.connection_type === "string"
      ? `类型=${item.connection_type}`
      : undefined,
    typeof item.time_mode === "string" ? `时间模式=${item.time_mode}` : undefined,
    typeof item.time_label === "string" && item.time_label
      ? `时间标签=${item.time_label}`
      : undefined,
    typeof item.time_value === "string" && item.time_value
      ? `时间值=${item.time_value}`
      : undefined,
    typeof item.location === "string" && item.location
      ? `地点=${item.location}`
      : undefined,
    item.arc_ids !== undefined
      ? `剧情点=${formatPlotDesignIdList(item.arc_ids)}`
      : undefined,
    item.character_ids !== undefined
      ? `人物=${formatPlotDesignIdList(item.character_ids)}`
      : undefined,
    typeof item.mode === "string" ? `呈现方式=${item.mode}` : undefined,
    typeof item.disclosure === "string"
      ? `信息披露=${item.disclosure}`
      : undefined,
    typeof item.status === "string" ? `状态=${item.status}` : undefined,
    typeof item.commit_id === "string" ? `commit_id=${item.commit_id}` : undefined
  ]);
  if (kind === "volume") {
    return joinParagraphs([
      header,
      formatPlotDesignTextBlock("概要", item.summary)
    ]);
  }
  if (kind === "arc") {
    return joinParagraphs([
      header,
      formatPlotDesignTextBlock("概要", item.summary),
      typeof item.outline === "string" && item.outline.trim()
        ? formatPlotDesignTextBlock("大纲", item.outline)
        : ""
    ]);
  }
  if (kind === "event") {
    return joinParagraphs([
      header,
      formatPlotDesignTextBlock("概要", item.summary)
    ]);
  }
  if (kind === "connection") {
    return joinParagraphs([
      header,
      formatPlotDesignTextBlock("备注", item.note)
    ]);
  }
  if (kind === "placement") {
    return joinParagraphs([
      header,
      formatPlotDesignTextBlock("写作提示", item.writing_prompt)
    ]);
  }
  return joinParagraphs([
    header,
    formatPlotDesignTextBlock("正文", input.body, "（内容为空）")
  ]);
}

export type PlotPointRelatedForeshadowingBeat = {
  beat_id: string;
  type: string;
  order: number;
  status: string;
  note: string;
  planned_scope: string;
  volume_id?: string | null;
  arc_id?: string | null;
  event_id?: string | null;
  placement_id?: string | null;
  chapter_card_id?: string | null;
};

export type PlotPointRelatedForeshadowing = {
  foreshadowing_id: string;
  title: string;
  status: string;
  planned_span?: string;
  core_question: string;
  hidden_truth?: string;
  expected_reader_effect: string;
  truth_event_id?: string | null;
  beats: readonly PlotPointRelatedForeshadowingBeat[];
};

const FORESHADOWING_STATUS_LABELS: Record<string, string> = {
  planned: "构思中",
  open: "已埋设",
  progressing: "发展中",
  resolved: "已回收",
  abandoned: "已废弃"
};

const FORESHADOWING_SPAN_LABELS: Record<string, string> = {
  local: "剧情点内",
  within_volume: "卷内",
  cross_volume: "跨卷"
};

const FORESHADOWING_BEAT_TYPE_LABELS: Record<string, string> = {
  source: "真相源头",
  plant: "埋设",
  reinforce: "强化",
  misdirect: "误导",
  partial_reveal: "部分揭示",
  reveal: "揭示",
  payoff: "回收",
  aftermath: "余波"
};

const EXECUTION_STATUS_LABELS: Record<string, string> = {
  planned: "待写入",
  written: "已写入",
  committed: "已提交",
  missed: "已错过"
};

export function resolveForeshadowingBeatArcIds(
  beat: {
    arcId?: string | null | undefined;
    volumeId?: string | null | undefined;
    eventId: string | null;
    placementId: string | null;
    chapterCardId: string | null;
  },
  index: LongWorkspaceIndexSnapshot
): string[] {
  if (beat.arcId) return [beat.arcId];
  const chapterId =
    beat.chapterCardId ??
    (beat.placementId
      ? index.plot.narrativePlacements.find(
          (placement) => placement.id === beat.placementId
        )?.chapterCardId
      : undefined);
  const chapterArcId = chapterId
    ? index.plot.chapterCards.find((chapter) => chapter.id === chapterId)
        ?.primaryArcId
    : undefined;
  if (chapterArcId) return [chapterArcId];
  const eventArcIds =
    beat.eventId === null
      ? []
      : (index.plot.storyEvents.find((event) => event.id === beat.eventId)
          ?.arcIds ?? []);
  return beat.volumeId
    ? eventArcIds.filter((arcId) => {
        const arc = index.plot.arcs.find((candidate) => candidate.id === arcId);
        return arc?.volumeId === beat.volumeId;
      })
    : [...eventArcIds];
}

function formatForeshadowingBeat(
  beat: PlotPointRelatedForeshadowingBeat
): string {
  return joinLines([
    FORESHADOWING_BEAT_TYPE_LABELS[beat.type] ?? beat.type,
    `beat_id=${beat.beat_id}`,
    `顺序=${beat.order}`,
    `状态=${EXECUTION_STATUS_LABELS[beat.status] ?? beat.status}`,
    beat.arc_id ? `arc_id=${beat.arc_id}` : undefined,
    beat.volume_id ? `volume_id=${beat.volume_id}` : undefined,
    beat.event_id ? `event_id=${beat.event_id}` : undefined,
    beat.placement_id ? `placement_id=${beat.placement_id}` : undefined,
    beat.chapter_card_id ? `chapter_card_id=${beat.chapter_card_id}` : undefined
  ]);
}

function formatForeshadowingThread(
  thread: PlotPointRelatedForeshadowing
): string {
  const beats =
    thread.beats.length === 0
      ? joinLines(["触点", "（暂无关联触点）"])
      : joinParagraphs([
          "触点",
          ...thread.beats.map((beat) =>
            joinParagraphs([
              formatForeshadowingBeat(beat),
              formatPlotDesignTextBlock("备注", beat.note),
              formatPlotDesignTextBlock("计划范围", beat.planned_scope)
            ])
          )
        ]);
  return joinParagraphs(
    [
      joinLines([
        thread.title,
        `foreshadowing_id=${thread.foreshadowing_id}`,
        `状态=${FORESHADOWING_STATUS_LABELS[thread.status] ?? thread.status}`,
        thread.planned_span
          ? `计划跨度=${
              FORESHADOWING_SPAN_LABELS[thread.planned_span] ??
              thread.planned_span
            }`
          : undefined,
        thread.truth_event_id
          ? `真相事件=${thread.truth_event_id}`
          : undefined
      ]),
      formatPlotDesignTextBlock("核心问题", thread.core_question),
      thread.hidden_truth
        ? formatPlotDesignTextBlock("隐藏真相", thread.hidden_truth)
        : undefined,
      formatPlotDesignTextBlock("预期读者效果", thread.expected_reader_effect),
      beats
    ].filter((part): part is string => Boolean(part))
  );
}

export function formatPlotPointRead(input: {
  item: Record<string, unknown>;
  storyEvents: readonly Record<string, unknown>[];
  storyPlots: readonly { item: Record<string, unknown>; body: string }[];
  foreshadowing: readonly PlotPointRelatedForeshadowing[];
}): string {
  const events =
    input.storyEvents.length === 0
      ? joinParagraphs(["故事事件", "（暂无故事事件）"])
      : joinParagraphs([
          "故事事件",
          ...input.storyEvents.map((item) => formatPlotDesignRead({ item }))
        ]);
  const plots =
    input.storyPlots.length === 0
      ? joinParagraphs(["故事情节", "（暂无故事情节）"])
      : joinParagraphs([
          "故事情节",
          ...input.storyPlots.map((entry) =>
            formatPlotDesignRead({ item: entry.item, body: entry.body })
          )
        ]);
  const foreshadowing =
    input.foreshadowing.length === 0
      ? ""
      : joinParagraphs([
          "关联伏笔",
          ...input.foreshadowing.map((thread) =>
            formatForeshadowingThread(thread)
          )
        ]);
  return joinParagraphs([
    formatPlotDesignRead({ item: input.item }),
    events,
    plots,
    foreshadowing
  ]);
}

export function comparePlotDesignListItems(
  left: PlotDesignListItem,
  right: PlotDesignListItem
): number {
  const leftOrder =
    left.order ?? left.narrative_order ?? left.order_in_chapter ?? 0;
  const rightOrder =
    right.order ?? right.narrative_order ?? right.order_in_chapter ?? 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftId =
    left.volume_id ??
    left.arc_id ??
    left.story_plot_id ??
    left.chapter_card_id ??
    left.event_id ??
    left.connection_id ??
    left.placement_id ??
    "";
  const rightId =
    right.volume_id ??
    right.arc_id ??
    right.story_plot_id ??
    right.chapter_card_id ??
    right.event_id ??
    right.connection_id ??
    right.placement_id ??
    "";
  return leftId.localeCompare(rightId);
}

export function chapterVolumeConflictMessage(
  index: LongWorkspaceIndexSnapshot,
  batch: LongWorkspaceOperationBatch
): string | undefined {
  const arcVolumeById = new Map(
    index.plot.arcs.map((arc) => [arc.id, arc.volumeId])
  );
  const arcTitleById = new Map(
    index.plot.arcs.map((arc) => [arc.id, arc.title])
  );
  const volumeTitleById = new Map(
    index.plot.volumes.map((volume) => [volume.id, volume.title])
  );
  const chapterTitleById = new Map(
    index.plot.chapterCards.map((chapter) => [chapter.id, chapter.title])
  );

  for (const [operationIndex, operation] of batch.operations.entries()) {
    if (operation.type === "arc.create") {
      arcVolumeById.set(operation.arc.id, operation.arc.volumeId);
      arcTitleById.set(operation.arc.id, operation.arc.title);
      continue;
    }
    if (operation.type === "arc.move") {
      arcVolumeById.set(operation.id, operation.toVolumeId);
      continue;
    }
    if (operation.type === "arc.delete") {
      arcVolumeById.delete(operation.id);
      continue;
    }
    if (
      operation.type !== "chapter.move" &&
      operation.type !== "chapter.create"
    ) {
      continue;
    }

    const chapterId =
      operation.type === "chapter.move"
        ? operation.id
        : operation.chapterCard.id;
    const chapterTitle =
      operation.type === "chapter.move"
        ? chapterTitleById.get(chapterId) ?? chapterId
        : operation.chapterCard.title;
    const targetVolumeId =
      operation.type === "chapter.move"
        ? operation.toVolumeId
        : operation.chapterCard.volumeId;
    const primaryArcId =
      operation.type === "chapter.move"
        ? operation.toPrimaryArcId
        : operation.chapterCard.primaryArcId;
    if (primaryArcId === null) continue;
    const primaryArcVolumeId = arcVolumeById.get(primaryArcId);
    if (
      primaryArcVolumeId === undefined ||
      primaryArcVolumeId === targetVolumeId
    ) {
      continue;
    }
    const targetVolumeTitle =
      volumeTitleById.get(targetVolumeId) ?? targetVolumeId;
    const primaryArcTitle =
      arcTitleById.get(primaryArcId) ?? primaryArcId;
    const primaryArcVolumeTitle =
      volumeTitleById.get(primaryArcVolumeId) ?? primaryArcVolumeId;
    const action = operation.type === "chapter.move" ? "移动" : "创建";
    return [
      `未形成长篇结构变更提案：第 ${operationIndex + 1} 项章卡${action}存在跨卷绑定。`,
      `章卡“${chapterTitle}”的目标分卷是“${targetVolumeTitle}”，但关联剧情点“${primaryArcTitle}”属于“${primaryArcVolumeTitle}”。非空剧情点关联必须与章卡属于同一分卷。`,
      "不要继续提交相同参数，也不会生成审批卡。请改绑到目标分卷内的剧情点，或将剧情点关联设为 null。"
    ].join("\n");
  }
  return undefined;
}
