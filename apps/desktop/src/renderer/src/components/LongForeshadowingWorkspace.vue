<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch
} from "vue";
import type {
  LongExecutionStatus,
  LongForeshadowingBeatType,
  LongForeshadowingStatus,
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import {
  createLongStructureMutationBuilder,
  type LongStructureMutationBuilder
} from "../types/longStructureMutations";
import type { LongStructureMutationCompletion } from "../types/longWorkspace";
import AppIcon from "./AppIcon.vue";
import PopupSelect, {
  type PopupSelectOption,
  type PopupSelectValue
} from "./PopupSelect.vue";

type WorkspaceMode = "overview" | "volume" | "plotPoint";
type PlannedSpan = "local" | "within_volume" | "cross_volume";
type FilterValue = "all" | LongForeshadowingStatus;
type SpanFilterValue = "all" | PlannedSpan;
type FormKind = "thread" | "beat";
type FormMode = "create" | "edit";
type MutationSurface = "form" | "delete" | "background";

type SnapshotThread =
  LongWorkspaceIndexSnapshot["plot"]["foreshadowing"][number];
type SnapshotBeat = SnapshotThread["beats"][number];

interface ForeshadowingBeat extends SnapshotBeat {
  volumeId?: string | null;
  arcId?: string | null;
}

interface ForeshadowingThread extends Omit<SnapshotThread, "beats"> {
  hiddenTruth?: string;
  plannedSpan?: PlannedSpan;
  beats: ForeshadowingBeat[];
}

interface ThreadDraft {
  id: string | null;
  title: string;
  coreQuestion: string;
  hiddenTruth: string;
  expectedReaderEffect: string;
  plannedSpan: PlannedSpan;
  status: "planned" | "abandoned";
}

interface BeatDraft {
  id: string | null;
  threadId: string;
  type: LongForeshadowingBeatType;
  volumeId: string;
  arcId: string;
  plannedScope: string;
  note: string;
}

interface BeatItem {
  thread: ForeshadowingThread;
  beat: ForeshadowingBeat;
}

interface VolumeSummarySection {
  id: "plant" | "progress" | "payoff" | "carry";
  title: string;
  description: string;
  items: BeatItem[];
}

type DeleteTarget =
  | {
      kind: "thread";
      thread: ForeshadowingThread;
    }
  | {
      kind: "beat";
      thread: ForeshadowingThread;
      beat: ForeshadowingBeat;
    };

const props = withDefaults(
  defineProps<{
    snapshot: LongWorkspaceIndexSnapshot;
    mode: WorkspaceMode;
    volumeId?: string | undefined;
    plotPointId?: string | undefined;
    disabled?: boolean;
  }>(),
  {
    disabled: false
  }
);

const emit = defineEmits<{
  mutation: [
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion
  ];
}>();

const spanLabels: Record<PlannedSpan, string> = {
  local: "剧情点内",
  within_volume: "卷内",
  cross_volume: "跨卷"
};

const lifecycleLabels: Record<LongForeshadowingStatus, string> = {
  planned: "构思中",
  open: "已埋设",
  progressing: "发展中",
  resolved: "已回收",
  abandoned: "已废弃"
};

const beatTypeLabels: Record<LongForeshadowingBeatType, string> = {
  source: "真相源头",
  plant: "埋设",
  reinforce: "强化",
  misdirect: "误导",
  partial_reveal: "部分揭示",
  reveal: "揭示",
  payoff: "回收",
  aftermath: "余波"
};

const executionStatusLabels: Record<LongExecutionStatus, string> = {
  planned: "待写入",
  written: "已写入",
  committed: "已提交",
  missed: "已错过"
};

const spanOptions: readonly PopupSelectOption[] = (
  Object.entries(spanLabels) as Array<[PlannedSpan, string]>
).map(([value, label]) => ({ value, label }));

const spanFilterOptions: readonly PopupSelectOption[] = [
  { value: "all", label: "全部跨度" },
  ...spanOptions
];

const lifecycleFilterOptions: readonly PopupSelectOption[] = [
  { value: "all", label: "全部生命周期" },
  ...(
    Object.entries(lifecycleLabels) as Array<
      [LongForeshadowingStatus, string]
    >
  ).map(([value, label]) => ({ value, label }))
];

const editableLifecycleOptions: readonly PopupSelectOption[] = [
  {
    value: "planned",
    label: lifecycleLabels.planned,
    description: "尚未由正文提交产生实际触点"
  },
  {
    value: "abandoned",
    label: lifecycleLabels.abandoned,
    description: "保留记录，但不再继续推进"
  }
];

const beatTypeOptions: readonly PopupSelectOption[] = (
  Object.entries(beatTypeLabels) as Array<
    [LongForeshadowingBeatType, string]
  >
).map(([value, label]) => ({ value, label }));

const query = ref("");
const lifecycleFilter = ref<FilterValue>("all");
const spanFilter = ref<SpanFilterValue>("all");
const activeThreadId = ref<string | null>(null);
const workspaceElement = ref<HTMLElement | null>(null);
const formOpen = ref(false);
const formKind = ref<FormKind>("thread");
const formMode = ref<FormMode>("create");
const deleteTarget = ref<DeleteTarget | null>(null);
const formDialog = ref<HTMLElement | null>(null);
const deleteDialog = ref<HTMLElement | null>(null);
const firstFormInput = ref<HTMLInputElement | null>(null);
const deleteCancelButton = ref<HTMLButtonElement | null>(null);
const pendingMutation = ref<{
  id: number;
  surface: MutationSurface;
} | null>(null);
let mutationClock = 0;
let previousFocus: HTMLElement | null = null;

const threadDraft = reactive<ThreadDraft>(emptyThreadDraft());
const beatDraft = reactive<BeatDraft>(emptyBeatDraft());

function emptyThreadDraft(): ThreadDraft {
  return {
    id: null,
    title: "",
    coreQuestion: "",
    hiddenTruth: "",
    expectedReaderEffect: "",
    plannedSpan: "local",
    status: "planned"
  };
}

function emptyBeatDraft(): BeatDraft {
  return {
    id: null,
    threadId: "",
    type: "plant",
    volumeId: "",
    arcId: "",
    plannedScope: "",
    note: ""
  };
}

const mutationLocked = computed(
  () => props.disabled || pendingMutation.value !== null
);

const threads = computed(
  () =>
    props.snapshot.plot.foreshadowing as ForeshadowingThread[]
);

const volumeById = computed(
  () =>
    new Map(
      props.snapshot.plot.volumes.map((volume) => [
        volume.id,
        volume
      ] as const)
    )
);

const arcById = computed(
  () =>
    new Map(
      props.snapshot.plot.arcs.map((arc) => [arc.id, arc] as const)
    )
);

const chapterById = computed(
  () =>
    new Map(
      props.snapshot.plot.chapterCards.map((chapter) => [
        chapter.id,
        chapter
      ] as const)
    )
);

const eventById = computed(
  () =>
    new Map(
      props.snapshot.plot.storyEvents.map((event) => [
        event.id,
        event
      ] as const)
    )
);

const placementById = computed(
  () =>
    new Map(
      props.snapshot.plot.narrativePlacements.map((placement) => [
        placement.id,
        placement
      ] as const)
    )
);

const currentVolume = computed(() =>
  props.volumeId ? volumeById.value.get(props.volumeId) ?? null : null
);

const currentPlotPoint = computed(() =>
  props.plotPointId ? arcById.value.get(props.plotPointId) ?? null : null
);

const resolvedContextVolumeId = computed(
  () => props.volumeId ?? currentPlotPoint.value?.volumeId
);

const volumeOptions = computed<PopupSelectOption[]>(() => [
  { value: "", label: "暂不指定分卷" },
  ...[...props.snapshot.plot.volumes]
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id)
    )
    .map((volume) => ({
      value: volume.id,
      label: volume.title
    }))
]);

const arcOptions = computed<PopupSelectOption[]>(() => {
  const scopedVolumeId =
    props.mode === "overview" ? undefined : resolvedContextVolumeId.value;
  return [
    { value: "", label: "暂不指定剧情点" },
    ...[...props.snapshot.plot.arcs]
      .filter((arc) => !scopedVolumeId || arc.volumeId === scopedVolumeId)
      .sort((left, right) => {
        const leftVolume = volumeById.value.get(left.volumeId)?.order ?? 0;
        const rightVolume = volumeById.value.get(right.volumeId)?.order ?? 0;
        return (
          leftVolume - rightVolume ||
          left.order - right.order ||
          left.id.localeCompare(right.id)
        );
      })
      .map((arc) => ({
        value: arc.id,
        label: `${volumeTitle(arc.volumeId)} · ${arc.title}`
      }))
  ];
});

const threadOptions = computed<PopupSelectOption[]>(() =>
  threads.value.map((thread) => ({
    value: thread.id,
    label: thread.title
  }))
);

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function resolveBeatArcIds(beat: ForeshadowingBeat): string[] {
  if (beat.arcId) return [beat.arcId];

  const chapterId =
    beat.chapterCardId ??
    (beat.placementId
      ? placementById.value.get(beat.placementId)?.chapterCardId
      : undefined);
  const chapterArcId = chapterId
    ? chapterById.value.get(chapterId)?.primaryArcId
    : undefined;
  if (chapterArcId) return [chapterArcId];

  const eventArcIds = beat.eventId
    ? unique(eventById.value.get(beat.eventId)?.arcIds ?? [])
    : [];
  return beat.volumeId
    ? eventArcIds.filter(
        (arcId) => arcById.value.get(arcId)?.volumeId === beat.volumeId
      )
    : eventArcIds;
}

function resolveBeatVolumeIds(beat: ForeshadowingBeat): string[] {
  if (beat.arcId) {
    const arcVolumeId = arcById.value.get(beat.arcId)?.volumeId;
    return arcVolumeId ? [arcVolumeId] : [];
  }
  if (beat.volumeId) return [beat.volumeId];

  const arcVolumeIds = resolveBeatArcIds(beat).map(
    (arcId) => arcById.value.get(arcId)?.volumeId
  );
  if (arcVolumeIds.some(Boolean)) return unique(arcVolumeIds);

  const chapterId =
    beat.chapterCardId ??
    (beat.placementId
      ? placementById.value.get(beat.placementId)?.chapterCardId
      : undefined);
  const chapterVolumeId = chapterId
    ? chapterById.value.get(chapterId)?.volumeId
    : undefined;
  return chapterVolumeId ? [chapterVolumeId] : [];
}

function beatMatchesVolume(
  beat: ForeshadowingBeat,
  volumeId: string | undefined
): boolean {
  return Boolean(
    volumeId && resolveBeatVolumeIds(beat).includes(volumeId)
  );
}

function beatMatchesPlotPoint(
  beat: ForeshadowingBeat,
  plotPointId: string | undefined
): boolean {
  return Boolean(
    plotPointId && resolveBeatArcIds(beat).includes(plotPointId)
  );
}

function threadMatchesScope(thread: ForeshadowingThread): boolean {
  if (props.mode === "overview") return true;
  if (props.mode === "volume") {
    return thread.beats.some((beat) =>
      beatMatchesVolume(beat, resolvedContextVolumeId.value)
    );
  }
  return thread.beats.some((beat) =>
    beatMatchesPlotPoint(beat, props.plotPointId)
  );
}

function derivedSpan(thread: ForeshadowingThread): PlannedSpan {
  if (thread.plannedSpan) return thread.plannedSpan;
  const volumeIds = unique(
    thread.beats.flatMap((beat) => resolveBeatVolumeIds(beat))
  );
  if (volumeIds.length > 1) return "cross_volume";
  const arcIds = unique(
    thread.beats.flatMap((beat) => resolveBeatArcIds(beat))
  );
  if (arcIds.length > 1) return "within_volume";
  return volumeIds.length === 1 && arcIds.length === 0
    ? "within_volume"
    : "local";
}

function threadSearchText(thread: ForeshadowingThread): string {
  return [
    thread.title,
    thread.coreQuestion,
    thread.hiddenTruth ?? "",
    thread.expectedReaderEffect,
    ...thread.beats.flatMap((beat) => [
      beat.plannedScope,
      beat.note,
      beatTypeLabels[beat.type]
    ])
  ]
    .join("\n")
    .toLocaleLowerCase("zh-CN");
}

const visibleThreads = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase("zh-CN");
  return threads.value.filter((thread) => {
    if (!threadMatchesScope(thread)) return false;
    if (
      props.mode === "overview" &&
      lifecycleFilter.value !== "all" &&
      thread.status !== lifecycleFilter.value
    ) {
      return false;
    }
    if (
      props.mode === "overview" &&
      spanFilter.value !== "all" &&
      derivedSpan(thread) !== spanFilter.value
    ) {
      return false;
    }
    return (
      props.mode !== "overview" ||
      !normalizedQuery ||
      threadSearchText(thread).includes(normalizedQuery)
    );
  });
});

const activeThread = computed(
  () =>
    visibleThreads.value.find(
      (thread) => thread.id === activeThreadId.value
    ) ??
    visibleThreads.value[0] ??
    null
);

const editingThread = computed(() =>
  formKind.value === "thread" &&
  formMode.value === "edit" &&
  threadDraft.id
    ? threads.value.find((thread) => thread.id === threadDraft.id) ?? null
    : null
);

const editingCommittedThread = computed(() =>
  editingThread.value ? isThreadLocked(editingThread.value) : false
);

const activeThreadBeats = computed(() => {
  const thread = activeThread.value;
  if (!thread) return [];
  return [...thread.beats]
    .filter((beat) => {
      if (props.mode === "overview") return true;
      if (props.mode === "volume") {
        return beatMatchesVolume(beat, resolvedContextVolumeId.value);
      }
      return beatMatchesPlotPoint(beat, props.plotPointId);
    })
    .sort((left, right) => left.order - right.order);
});

const overviewStats = computed(() => ({
  total: threads.value.length,
  active: threads.value.filter(
    ({ status }) => status === "open" || status === "progressing"
  ).length,
  resolved: threads.value.filter(({ status }) => status === "resolved").length,
  plannedBeats: threads.value.reduce(
    (count, thread) =>
      count +
      thread.beats.filter(({ status }) => status === "planned").length,
    0
  )
}));

const volumeSummarySections = computed<VolumeSummarySection[]>(() => {
  const volumeId = resolvedContextVolumeId.value;
  const items = threads.value.flatMap<BeatItem>((thread) =>
    thread.beats
      .filter((beat) => beatMatchesVolume(beat, volumeId))
      .map((beat) => ({ thread, beat }))
  );
  const carryItems = threads.value.flatMap<BeatItem>((thread) => {
    if (thread.status === "resolved" || thread.status === "abandoned") {
      return [];
    }
    const beats = thread.beats
      .filter((beat) => beatMatchesVolume(beat, volumeId))
      .sort((left, right) => left.order - right.order);
    const lastBeat = beats.at(-1);
    if (!lastBeat) return [];
    const currentVolumeOrder = volumeId
      ? volumeById.value.get(volumeId)?.order
      : undefined;
    const hasLaterVolumeBeat =
      currentVolumeOrder !== undefined &&
      thread.beats.some((beat) =>
        resolveBeatVolumeIds(beat).some(
          (beatVolumeId) =>
            (volumeById.value.get(beatVolumeId)?.order ?? -1) >
            currentVolumeOrder
        )
      );
    const resolvesInCurrentVolume = beats.some(
      ({ type, status }) =>
        status !== "missed" &&
        (type === "reveal" || type === "payoff")
    );
    const isPlannedCrossVolume =
      derivedSpan(thread) === "cross_volume" &&
      !resolvesInCurrentVolume;
    return hasLaterVolumeBeat || isPlannedCrossVolume
      ? [{ thread, beat: lastBeat }]
      : [];
  });

  return [
    {
      id: "plant",
      title: "本卷新埋",
      description: "真相源头与首次埋设",
      items: items.filter(({ beat }) =>
        beat.type === "source" || beat.type === "plant"
      )
    },
    {
      id: "progress",
      title: "本卷推进",
      description: "强化、误导与部分揭示",
      items: items.filter(({ beat }) =>
        ["reinforce", "misdirect", "partial_reveal"].includes(beat.type)
      )
    },
    {
      id: "payoff",
      title: "本卷回收",
      description: "揭示真相或兑现回收",
      items: items.filter(({ beat }) =>
        beat.type === "reveal" || beat.type === "payoff"
      )
    },
    {
      id: "carry",
      title: "带往后卷",
      description: "本卷出现、但仍需继续推进的伏笔线",
      items: carryItems
    }
  ];
});

const workspaceTitle = computed(() => {
  if (props.mode === "volume") {
    return `${currentVolume.value?.title ?? "当前分卷"} · 本卷伏笔`;
  }
  if (props.mode === "plotPoint") {
    return `${currentPlotPoint.value?.title ?? "当前剧情点"} · 伏笔触点`;
  }
  return "伏笔总览";
});

const workspaceDescription = computed(() => {
  if (props.mode === "volume") {
    return "按本卷新埋、推进、回收和带往后卷自动汇总，无需重复维护。";
  }
  if (props.mode === "plotPoint") {
    return "这里只显示锚定到当前剧情点的触点，修改会同步回伏笔总览。";
  }
  return "集中管理伏笔线的完整生命周期；每个触点仍锚定在卷或剧情点中。";
});

const formTitle = computed(() => {
  const action = formMode.value === "create" ? "新建" : "编辑";
  return `${action}${formKind.value === "thread" ? "伏笔线" : "伏笔触点"}`;
});

const deleteTitle = computed(() => {
  const target = deleteTarget.value;
  if (!target) return "确认删除";
  return target.kind === "thread"
    ? `删除伏笔线“${target.thread.title}”`
    : `删除“${target.thread.title}”的${beatTypeLabels[target.beat.type]}触点`;
});

watch(
  () => [
    props.mode,
    props.volumeId,
    props.plotPointId,
    visibleThreads.value.map(({ id }) => id).join("\u0000")
  ],
  () => {
    if (
      !activeThreadId.value ||
      !visibleThreads.value.some(
        (thread) => thread.id === activeThreadId.value
      )
    ) {
      activeThreadId.value = visibleThreads.value[0]?.id ?? null;
    }
  },
  { immediate: true }
);

function volumeTitle(volumeId: string): string {
  return volumeById.value.get(volumeId)?.title ?? `缺失分卷（${volumeId}）`;
}

function arcTitle(arcId: string): string {
  return arcById.value.get(arcId)?.title ?? `缺失剧情点（${arcId}）`;
}

function beatContextLabel(beat: ForeshadowingBeat): string {
  const arcIds = resolveBeatArcIds(beat);
  if (arcIds.length) {
    return arcIds
      .map((arcId) => {
        const arc = arcById.value.get(arcId);
        return arc
          ? `${volumeTitle(arc.volumeId)} · ${arc.title}`
          : arcTitle(arcId);
      })
      .join(" / ");
  }
  const volumeIds = resolveBeatVolumeIds(beat);
  if (volumeIds.length) {
    return `${volumeIds.map(volumeTitle).join(" / ")} · 待落到剧情点`;
  }
  return beat.plannedScope || "尚未绑定卷或剧情点";
}

function beatBody(beat: ForeshadowingBeat): string {
  return beat.note || beat.plannedScope || "尚未补充呈现说明";
}

function isThreadLocked(thread: ForeshadowingThread): boolean {
  void thread;
  return false;
}

function canBackfillThreadMetadata(
  thread: ForeshadowingThread
): boolean {
  return (
    isThreadLocked(thread) &&
    (thread.hiddenTruth === undefined ||
      thread.plannedSpan === undefined)
  );
}

function isBeatLocked(beat: ForeshadowingBeat): boolean {
  void beat;
  return false;
}

function selectThread(threadId: string): void {
  activeThreadId.value = threadId;
}

async function focusTarget(
  threadId?: string,
  beatId?: string
): Promise<boolean> {
  const thread = threadId
    ? threads.value.find(({ id }) => id === threadId)
    : beatId
      ? threads.value.find(({ beats }) =>
          beats.some(({ id }) => id === beatId)
        )
      : threads.value[0];
  if (!thread) return false;
  query.value = "";
  lifecycleFilter.value = "all";
  spanFilter.value = "all";
  activeThreadId.value = thread.id;
  await nextTick();
  const selector = beatId
    ? `[data-foreshadowing-beat-id="${CSS.escape(beatId)}"]`
    : `[data-foreshadowing-thread-id="${CSS.escape(thread.id)}"]`;
  const target = workspaceElement.value?.querySelector<HTMLElement>(selector);
  if (!target) return false;
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
}

defineExpose({ focusTarget });

function setLifecycleFilter(value: PopupSelectValue): void {
  if (
    value === "all" ||
    Object.prototype.hasOwnProperty.call(lifecycleLabels, value)
  ) {
    lifecycleFilter.value = value as FilterValue;
  }
}

function setSpanFilter(value: PopupSelectValue): void {
  if (
    value === "all" ||
    Object.prototype.hasOwnProperty.call(spanLabels, value)
  ) {
    spanFilter.value = value as SpanFilterValue;
  }
}

function setThreadSpan(value: PopupSelectValue): void {
  if (Object.prototype.hasOwnProperty.call(spanLabels, value)) {
    threadDraft.plannedSpan = value as PlannedSpan;
  }
}

function setThreadStatus(value: PopupSelectValue): void {
  if (value === "planned" || value === "abandoned") {
    threadDraft.status = value;
  }
}

function setBeatThread(value: PopupSelectValue): void {
  if (typeof value === "string") beatDraft.threadId = value;
}

function setBeatType(value: PopupSelectValue): void {
  if (Object.prototype.hasOwnProperty.call(beatTypeLabels, value)) {
    beatDraft.type = value as LongForeshadowingBeatType;
  }
}

function setBeatVolume(value: PopupSelectValue): void {
  if (typeof value !== "string") return;
  beatDraft.volumeId = value;
  if (value) beatDraft.arcId = "";
}

function setBeatArc(value: PopupSelectValue): void {
  if (typeof value !== "string") return;
  beatDraft.arcId = value;
  if (value) beatDraft.volumeId = "";
}

function rememberFocus(): void {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
}

function restoreFocus(): void {
  const target = previousFocus;
  previousFocus = null;
  void nextTick(() => {
    if (target?.isConnected) target.focus({ preventScroll: true });
  });
}

function focusOpenedForm(): void {
  void nextTick(() => {
    const firstEnabledControl =
      formDialog.value?.querySelector<HTMLElement>(
        "fieldset input:not(:disabled), fieldset textarea:not(:disabled), fieldset button:not(:disabled)"
      );
    (firstEnabledControl ?? formDialog.value)?.focus({
      preventScroll: true
    });
  });
}

function openCreateThread(): void {
  if (mutationLocked.value) return;
  Object.assign(threadDraft, emptyThreadDraft());
  formKind.value = "thread";
  formMode.value = "create";
  rememberFocus();
  formOpen.value = true;
  focusOpenedForm();
}

function openEditThread(thread: ForeshadowingThread): void {
  if (mutationLocked.value) return;
  if (isThreadLocked(thread) && !canBackfillThreadMetadata(thread)) {
    uiMessage.info("该伏笔线正在处理其它变更，请稍后重试。");
    return;
  }
  Object.assign(threadDraft, {
    id: thread.id,
    title: thread.title,
    coreQuestion: thread.coreQuestion,
    hiddenTruth: thread.hiddenTruth ?? "",
    expectedReaderEffect: thread.expectedReaderEffect,
    plannedSpan: derivedSpan(thread),
    status: thread.status === "abandoned" ? "abandoned" : "planned"
  } satisfies ThreadDraft);
  formKind.value = "thread";
  formMode.value = "edit";
  rememberFocus();
  formOpen.value = true;
  focusOpenedForm();
}

function defaultBeatAnchor(): Pick<BeatDraft, "volumeId" | "arcId"> {
  if (props.mode === "plotPoint" && props.plotPointId) {
    return { volumeId: "", arcId: props.plotPointId };
  }
  if (props.mode === "volume" && resolvedContextVolumeId.value) {
    return { volumeId: resolvedContextVolumeId.value, arcId: "" };
  }
  return { volumeId: "", arcId: "" };
}

function openCreateBeat(thread?: ForeshadowingThread | null): void {
  if (mutationLocked.value) return;
  const targetThread = thread ?? activeThread.value ?? threads.value[0];
  if (!targetThread) {
    uiMessage.info("请先在伏笔总览中新建一条伏笔线。");
    return;
  }
  Object.assign(beatDraft, {
    ...emptyBeatDraft(),
    ...defaultBeatAnchor(),
    threadId: targetThread.id
  });
  formKind.value = "beat";
  formMode.value = "create";
  rememberFocus();
  formOpen.value = true;
  focusOpenedForm();
}

function openEditBeat(
  thread: ForeshadowingThread,
  beat: ForeshadowingBeat
): void {
  if (mutationLocked.value) return;
  if (isBeatLocked(beat)) {
    uiMessage.info("该触点已经提交，需先回滚相关连续性提交才能修改。");
    return;
  }
  // Keep legacy event/chapter/placement anchors untouched. The derived
  // context is for display only; persisting it as a new direct anchor could
  // make an otherwise valid legacy touchpoint contradictory.
  const directArcId = beat.arcId ?? "";
  const directVolumeId = directArcId ? "" : beat.volumeId ?? "";
  Object.assign(beatDraft, {
    id: beat.id,
    threadId: thread.id,
    type: beat.type,
    volumeId: directVolumeId,
    arcId: directArcId,
    plannedScope: beat.plannedScope,
    note: beat.note
  } satisfies BeatDraft);
  formKind.value = "beat";
  formMode.value = "edit";
  rememberFocus();
  formOpen.value = true;
  focusOpenedForm();
}

function closeForm(): void {
  if (mutationLocked.value) return;
  formOpen.value = false;
  restoreFocus();
}

function requestDeleteThread(thread: ForeshadowingThread): void {
  if (mutationLocked.value) return;
  if (isThreadLocked(thread)) {
    uiMessage.info("该伏笔线包含已提交触点，不能删除。");
    return;
  }
  rememberFocus();
  deleteTarget.value = { kind: "thread", thread };
  void nextTick(() =>
    deleteCancelButton.value?.focus({ preventScroll: true })
  );
}

function requestDeleteBeat(
  thread: ForeshadowingThread,
  beat: ForeshadowingBeat
): void {
  if (mutationLocked.value) return;
  if (isBeatLocked(beat)) {
    uiMessage.info("该触点已经提交，需先回滚相关连续性提交才能删除。");
    return;
  }
  rememberFocus();
  deleteTarget.value = { kind: "beat", thread, beat };
  void nextTick(() =>
    deleteCancelButton.value?.focus({ preventScroll: true })
  );
}

function toggleThreadAbandoned(thread: ForeshadowingThread): void {
  if (mutationLocked.value) return;
  rememberFocus();
  const emitted = emitMutation(
    (builder) =>
      builder.updateForeshadowing(thread.id, {
        status: thread.status === "abandoned" ? "planned" : "abandoned"
      }),
    "background"
  );
  if (!emitted) restoreFocus();
}

function closeDelete(): void {
  if (mutationLocked.value) return;
  deleteTarget.value = null;
  restoreFocus();
}

function finishMutation(
  requestId: number,
  outcome: "succeeded" | "failed" | "applied-refresh-failed"
): void {
  const pending = pendingMutation.value;
  if (!pending || pending.id !== requestId) return;
  pendingMutation.value = null;
  if (outcome === "failed") return;
  if (pending.surface === "form") {
    formOpen.value = false;
  } else if (pending.surface === "delete") {
    deleteTarget.value = null;
  }
  restoreFocus();
}

function emitMutation(
  build: (builder: LongStructureMutationBuilder) => LongWorkspaceOperationBatch,
  surface: MutationSurface
): boolean {
  if (mutationLocked.value) return false;
  try {
    const batch = build(createLongStructureMutationBuilder(props.snapshot));
    const requestId = ++mutationClock;
    pendingMutation.value = { id: requestId, surface };
    emit("mutation", batch, {
      succeed: () => finishMutation(requestId, "succeeded"),
      fail: () => finishMutation(requestId, "failed"),
      appliedButRefreshFailed: () =>
        finishMutation(requestId, "applied-refresh-failed")
    });
    return true;
  } catch (error: unknown) {
    uiMessage.warning(
      error instanceof Error ? error.message : "无法生成伏笔结构变更。"
    );
    return false;
  }
}

function submitThread(): void {
  const title = threadDraft.title.trim();
  if (!title) {
    uiMessage.warning("请输入伏笔线名称。");
    firstFormInput.value?.focus({ preventScroll: true });
    return;
  }

  emitMutation((builder) => {
    const input = {
      title,
      coreQuestion: threadDraft.coreQuestion,
      hiddenTruth: threadDraft.hiddenTruth,
      expectedReaderEffect: threadDraft.expectedReaderEffect,
      plannedSpan: threadDraft.plannedSpan,
      status:
        formMode.value === "create" ? ("planned" as const) : threadDraft.status
    };
    if (formMode.value === "create") {
      return builder.createForeshadowing(input);
    }
    if (!threadDraft.id) throw new Error("缺少待编辑伏笔线的稳定 ID。");
    const originalThread = threads.value.find(
      (thread) => thread.id === threadDraft.id
    );
    if (originalThread && isThreadLocked(originalThread)) {
      return builder.updateForeshadowing(threadDraft.id, {
        ...(originalThread.hiddenTruth === undefined
          ? { hiddenTruth: threadDraft.hiddenTruth }
          : {}),
        ...(originalThread.plannedSpan === undefined
          ? { plannedSpan: threadDraft.plannedSpan }
          : {}),
        status: threadDraft.status
      });
    }
    return builder.updateForeshadowing(threadDraft.id, input);
  }, "form");
}

function submitBeat(): void {
  if (!beatDraft.threadId) {
    uiMessage.warning("请选择所属伏笔线。");
    return;
  }
  const originalBeat =
    formMode.value === "edit" && beatDraft.id
      ? threads.value
          .flatMap((thread) => thread.beats)
          .find((beat) => beat.id === beatDraft.id)
      : undefined;
  const hasLegacyAnchor = Boolean(
    originalBeat?.eventId ||
      originalBeat?.placementId ||
      originalBeat?.chapterCardId
  );
  if (
    !beatDraft.volumeId &&
    !beatDraft.arcId &&
    !beatDraft.plannedScope.trim() &&
    !hasLegacyAnchor
  ) {
    uiMessage.warning("请选择分卷或剧情点，或填写计划范围。");
    return;
  }

  emitMutation((builder) => {
    const input = {
      threadId: beatDraft.threadId,
      type: beatDraft.type,
      volumeId: beatDraft.arcId ? null : beatDraft.volumeId || null,
      arcId: beatDraft.arcId || null,
      plannedScope: beatDraft.plannedScope,
      note: beatDraft.note
    };
    if (formMode.value === "create") {
      return builder.createForeshadowingBeat(input);
    }
    if (!beatDraft.id) throw new Error("缺少待编辑触点的稳定 ID。");
    return builder.updateForeshadowingBeat(beatDraft.id, input);
  }, "form");
}

function submitForm(): void {
  if (formKind.value === "thread") {
    submitThread();
  } else {
    submitBeat();
  }
}

function confirmDelete(): void {
  const target = deleteTarget.value;
  if (!target) return;
  emitMutation(
    (builder) =>
      target.kind === "thread"
        ? builder.deleteForeshadowing(target.thread.id, true)
        : builder.deleteForeshadowingBeat(target.beat.id),
    "delete"
  );
}

function activateSummaryItem(item: BeatItem): void {
  activeThreadId.value = item.thread.id;
  openEditBeat(item.thread, item.beat);
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  return root
    ? Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("hidden"))
    : [];
}

function trapFocus(event: KeyboardEvent, root: HTMLElement | null): void {
  if (
    event.key !== "Tab" ||
    !root ||
    !(event.target instanceof Node) ||
    !root.contains(event.target)
  ) {
    return;
  }
  const elements = focusableElements(root);
  if (!elements.length) {
    event.preventDefault();
    root.focus({ preventScroll: true });
    return;
  }
  const first = elements[0]!;
  const last = elements.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (formOpen.value) {
    if (event.key === "Escape") {
      closeForm();
      return;
    }
    trapFocus(event, formDialog.value);
    return;
  }
  if (deleteTarget.value) {
    if (event.key === "Escape") {
      closeDelete();
      return;
    }
    trapFocus(event, deleteDialog.value);
  }
}

onMounted(() => document.addEventListener("keydown", handleDocumentKeydown));
onBeforeUnmount(() =>
  document.removeEventListener("keydown", handleDocumentKeydown)
);
</script>

<template>
  <section
    ref="workspaceElement"
    class="foreshadow-workspace"
    :class="`is-${mode}`"
    :aria-label="workspaceTitle"
  >
    <header class="foreshadow-header">
      <div class="foreshadow-heading">
        <h2>{{ workspaceTitle }}</h2>
        <p>{{ workspaceDescription }}</p>
      </div>
      <div class="foreshadow-header-actions">
        <button
          v-if="mode === 'overview'"
          class="primary-button"
          type="button"
          :disabled="mutationLocked"
          @click="openCreateThread"
        >
          <AppIcon name="plus" :size="15" />
          新建伏笔线
        </button>
        <button
          v-else
          class="primary-button"
          type="button"
          :disabled="mutationLocked || threads.length === 0"
          @click="openCreateBeat()"
        >
          <AppIcon name="plus" :size="15" />
          新增触点
        </button>
      </div>
    </header>

    <section v-if="mode === 'overview'" class="overview-dashboard">
      <dl class="overview-stats">
        <div>
          <dt>全部伏笔线</dt>
          <dd>{{ overviewStats.total }}</dd>
        </div>
        <div>
          <dt>正在推进</dt>
          <dd>{{ overviewStats.active }}</dd>
        </div>
        <div>
          <dt>已经回收</dt>
          <dd>{{ overviewStats.resolved }}</dd>
        </div>
        <div>
          <dt>待写入触点</dt>
          <dd>{{ overviewStats.plannedBeats }}</dd>
        </div>
      </dl>
      <div class="overview-filters">
        <label class="search-field">
          <AppIcon name="search" :size="15" />
          <input
            v-model="query"
            type="search"
            autocomplete="off"
            placeholder="搜索名称、问题、真相或触点"
            aria-label="搜索伏笔"
          />
        </label>
        <PopupSelect
          :model-value="lifecycleFilter"
          :options="lifecycleFilterOptions"
          accessible-label="按生命周期筛选伏笔"
          variant="compact"
          size="small"
          :disabled="mutationLocked"
          @update:model-value="setLifecycleFilter"
        />
        <PopupSelect
          :model-value="spanFilter"
          :options="spanFilterOptions"
          accessible-label="按跨度筛选伏笔"
          variant="compact"
          size="small"
          :disabled="mutationLocked"
          @update:model-value="setSpanFilter"
        />
      </div>
    </section>

    <section
      v-if="mode === 'volume'"
      class="volume-summary"
      aria-label="本卷伏笔自动汇总"
    >
      <article
        v-for="section in volumeSummarySections"
        :key="section.id"
        class="summary-column"
        :class="`is-${section.id}`"
      >
        <header>
          <div>
            <h3>{{ section.title }}</h3>
            <p>{{ section.description }}</p>
          </div>
          <span>{{ section.items.length }}</span>
        </header>
        <div v-if="section.items.length" class="summary-items">
          <button
            v-for="item in section.items"
            :key="`${section.id}-${item.thread.id}-${item.beat.id}`"
            type="button"
            :disabled="mutationLocked"
            @click="activateSummaryItem(item)"
          >
            <strong>{{ item.thread.title }}</strong>
            <span v-if="section.id !== 'carry'">
              {{ beatTypeLabels[item.beat.type] }} ·
              {{ beatContextLabel(item.beat) }}
            </span>
            <span v-else>
              {{ lifecycleLabels[item.thread.status] }} ·
              最近触点：{{ beatTypeLabels[item.beat.type] }}
            </span>
          </button>
        </div>
        <p v-else class="summary-empty">暂无</p>
      </article>
    </section>

    <div class="foreshadow-layout">
      <aside class="thread-pane" aria-label="伏笔线列表">
        <header>
          <div>
            <strong>
              {{
                mode === "overview"
                  ? "伏笔线"
                  : mode === "volume"
                    ? "本卷涉及"
                    : "当前剧情点涉及"
              }}
            </strong>
            <span>{{ visibleThreads.length }}</span>
          </div>
          <button
            v-if="mode !== 'overview'"
            type="button"
            class="quiet-add-button"
            :disabled="mutationLocked"
            title="新伏笔线请到伏笔总览创建"
            @click="
              uiMessage.info('新伏笔线请在“伏笔总览”中创建。')
            "
          >
            <AppIcon name="sparkles" :size="14" />
            总览创建
          </button>
        </header>

        <div v-if="visibleThreads.length" class="thread-list" role="list">
          <article
            v-for="thread in visibleThreads"
            :key="thread.id"
            class="thread-card"
            :data-foreshadowing-thread-id="thread.id"
            :class="{ 'is-active': activeThread?.id === thread.id }"
            role="listitem"
          >
            <button
              class="thread-card-main"
              type="button"
              :aria-pressed="activeThread?.id === thread.id"
              @click="selectThread(thread.id)"
            >
              <span class="thread-card-title">
                <strong>{{ thread.title }}</strong>
                <small
                  class="status-pill"
                  :class="`is-${thread.status}`"
                >
                  {{ lifecycleLabels[thread.status] }}
                </small>
              </span>
              <span class="thread-card-meta">
                {{ spanLabels[derivedSpan(thread)] }} ·
                {{ thread.beats.length }} 个触点
              </span>
              <span>{{ thread.coreQuestion || "尚未填写核心问题" }}</span>
            </button>
            <div v-if="mode === 'overview'" class="thread-card-actions">
              <button
                type="button"
                :disabled="mutationLocked || isThreadLocked(thread)"
                :aria-label="`编辑伏笔线${thread.title}`"
                title="编辑伏笔线"
                @click="openEditThread(thread)"
              >
                <AppIcon name="edit" :size="14" />
              </button>
              <button
                class="danger-ghost-button"
                type="button"
                :disabled="mutationLocked || isThreadLocked(thread)"
                :aria-label="`删除伏笔线${thread.title}`"
                title="删除伏笔线"
                @click="requestDeleteThread(thread)"
              >
                <AppIcon name="trash" :size="14" />
              </button>
            </div>
          </article>
        </div>
        <div v-else class="pane-empty">
          <AppIcon name="sparkles" :size="22" />
          <strong>
            {{
              mode === "overview"
                ? "没有符合条件的伏笔线"
                : "当前范围还没有伏笔触点"
            }}
          </strong>
          <span>
            {{
              mode === "overview"
                ? "调整筛选条件，或新建第一条伏笔线。"
                : "从已有伏笔线新增触点后会自动出现在这里。"
            }}
          </span>
        </div>
      </aside>

      <main class="thread-detail" aria-label="伏笔线详情">
        <template v-if="activeThread">
          <header class="thread-detail-header">
            <div>
              <span class="detail-kicker">
                {{ spanLabels[derivedSpan(activeThread)] }}
                <i>·</i>
                {{ lifecycleLabels[activeThread.status] }}
              </span>
              <h3>{{ activeThread.title }}</h3>
            </div>
            <div class="detail-actions">
              <button
                v-if="mode === 'overview'"
                type="button"
                :disabled="
                  mutationLocked ||
                  (isThreadLocked(activeThread) &&
                    !canBackfillThreadMetadata(activeThread))
                "
                @click="openEditThread(activeThread)"
              >
                {{
                  canBackfillThreadMetadata(activeThread)
                    ? "补全伏笔信息"
                    : "编辑伏笔线"
                }}
              </button>
              <button
                v-if="mode === 'overview'"
                type="button"
                :disabled="mutationLocked"
                @click="toggleThreadAbandoned(activeThread)"
              >
                {{
                  pendingMutation?.surface === "background"
                    ? "更新状态中…"
                    : activeThread.status === "abandoned"
                      ? "恢复伏笔线"
                      : "标记废弃"
                }}
              </button>
              <button
                class="primary-button"
                type="button"
                :disabled="mutationLocked"
                @click="openCreateBeat(activeThread)"
              >
                <AppIcon name="plus" :size="14" />
                新增触点
              </button>
            </div>
          </header>

          <dl class="thread-facts">
            <div>
              <dt>核心问题</dt>
              <dd>{{ activeThread.coreQuestion || "尚未填写" }}</dd>
            </div>
            <div>
              <dt>隐藏真相</dt>
              <dd>{{ activeThread.hiddenTruth || "尚未填写" }}</dd>
            </div>
            <div>
              <dt>预期读者效果</dt>
              <dd>{{ activeThread.expectedReaderEffect || "尚未填写" }}</dd>
            </div>
          </dl>

          <section class="beat-section">
            <header>
              <div>
                <h4>
                  {{
                    mode === "overview"
                      ? "完整触点链"
                      : mode === "volume"
                        ? "本卷触点"
                        : "当前剧情点触点"
                  }}
                </h4>
                <span>{{ activeThreadBeats.length }} 个</span>
              </div>
              <small v-if="isThreadLocked(activeThread)">
                已提交触点保持只读；如需修改，请先回滚相关提交。
              </small>
            </header>

            <ol v-if="activeThreadBeats.length" class="beat-timeline">
              <li
                v-for="beat in activeThreadBeats"
                :key="beat.id"
                :class="`is-${beat.type}`"
                :data-foreshadowing-beat-id="beat.id"
              >
                <span class="beat-marker" />
                <article>
                  <header>
                    <div>
                      <span class="beat-order">触点 {{ beat.order }}</span>
                      <strong>{{ beatTypeLabels[beat.type] }}</strong>
                    </div>
                    <span
                      class="execution-pill"
                      :class="`is-${beat.status}`"
                    >
                      {{ executionStatusLabels[beat.status] }}
                    </span>
                  </header>
                  <p class="beat-context">
                    <AppIcon name="pin" :size="13" />
                    {{ beatContextLabel(beat) }}
                  </p>
                  <p class="beat-copy">{{ beatBody(beat) }}</p>
                  <div class="beat-actions">
                    <button
                      type="button"
                      :disabled="mutationLocked || isBeatLocked(beat)"
                      @click="openEditBeat(activeThread, beat)"
                    >
                      编辑
                    </button>
                    <button
                      class="danger-text-button"
                      type="button"
                      :disabled="mutationLocked || isBeatLocked(beat)"
                      @click="requestDeleteBeat(activeThread, beat)"
                    >
                      删除
                    </button>
                  </div>
                </article>
              </li>
            </ol>
            <div v-else class="beat-empty">
              <strong>当前范围还没有触点</strong>
              <span>新增后会自动出现在剧情点、本卷汇总和伏笔总览中。</span>
              <button
                type="button"
                :disabled="mutationLocked"
                @click="openCreateBeat(activeThread)"
              >
                新增第一个触点
              </button>
            </div>
          </section>
        </template>
        <div v-else class="detail-empty">
          <AppIcon name="sparkles" :size="26" />
          <strong>选择一条伏笔线查看详情</strong>
          <span>伏笔线集中管理，触点分布在卷与剧情点中。</span>
        </div>
      </main>
    </div>

    <Teleport to="body">
      <div
        v-if="formOpen"
        class="dialog-backdrop foreshadow-dialog-overlay"
        @mousedown.self="closeForm"
      >
        <section
          ref="formDialog"
          class="foreshadow-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="foreshadow-form-title"
          tabindex="-1"
        >
          <form @submit.prevent="submitForm">
            <header class="dialog-header">
              <div>
                <span>{{ formMode === "create" ? "CREATE" : "EDIT" }}</span>
                <h3 id="foreshadow-form-title">{{ formTitle }}</h3>
              </div>
              <button
                type="button"
                aria-label="关闭伏笔编辑弹窗"
                :disabled="mutationLocked"
                @click="closeForm"
              >
                <AppIcon name="close" :size="16" />
              </button>
            </header>

            <fieldset class="dialog-body" :disabled="mutationLocked">
              <template v-if="formKind === 'thread'">
                <p
                  v-if="editingCommittedThread"
                  class="committed-backfill-note"
                >
                  已提交触点仍锁定原有核心信息；这里只能补填旧项目中此前不存在的隐藏真相或计划跨度。
                </p>
                <label class="form-field">
                  <span>伏笔线名称</span>
                  <input
                    ref="firstFormInput"
                    v-model="threadDraft.title"
                    :disabled="editingCommittedThread"
                    maxlength="256"
                    autocomplete="off"
                    placeholder="例如：师父与旧城火灾的关系"
                    required
                  />
                </label>
                <div
                  class="form-grid"
                  :class="{ 'is-single': formMode === 'create' }"
                >
                  <label class="form-field">
                    <span>计划跨度</span>
                    <PopupSelect
                      :model-value="threadDraft.plannedSpan"
                      :options="spanOptions"
                      :disabled="
                        editingCommittedThread &&
                        editingThread?.plannedSpan !== undefined
                      "
                      accessible-label="选择伏笔计划跨度"
                      :menu-z-index="2600"
                      @update:model-value="setThreadSpan"
                    />
                  </label>
                  <label v-if="formMode === 'edit'" class="form-field">
                    <span>生命周期</span>
                    <PopupSelect
                      :model-value="threadDraft.status"
                      :options="editableLifecycleOptions"
                      accessible-label="选择伏笔生命周期"
                      :menu-z-index="2600"
                      @update:model-value="setThreadStatus"
                    />
                  </label>
                </div>
                <label class="form-field">
                  <span>核心问题</span>
                  <textarea
                    v-model="threadDraft.coreQuestion"
                    :disabled="editingCommittedThread"
                    rows="3"
                    maxlength="200000"
                    placeholder="读者会持续追问什么？"
                  />
                </label>
                <label class="form-field">
                  <span>隐藏真相</span>
                  <textarea
                    v-model="threadDraft.hiddenTruth"
                    :disabled="
                      editingCommittedThread &&
                      editingThread?.hiddenTruth !== undefined
                    "
                    rows="4"
                    maxlength="200000"
                    placeholder="作者掌握、但暂时不直接告诉读者的答案"
                  />
                </label>
                <label class="form-field">
                  <span>预期读者效果</span>
                  <textarea
                    v-model="threadDraft.expectedReaderEffect"
                    :disabled="editingCommittedThread"
                    rows="3"
                    maxlength="200000"
                    placeholder="希望读者产生怎样的怀疑、误判或恍然大悟"
                  />
                </label>
              </template>

              <template v-else>
                <label class="form-field">
                  <span>所属伏笔线</span>
                  <PopupSelect
                    :model-value="beatDraft.threadId"
                    :options="threadOptions"
                    accessible-label="选择触点所属伏笔线"
                    :menu-z-index="2600"
                    @update:model-value="setBeatThread"
                  />
                </label>
                <label class="form-field">
                  <span>触点作用</span>
                  <PopupSelect
                    :model-value="beatDraft.type"
                    :options="beatTypeOptions"
                    accessible-label="选择伏笔触点作用"
                    :menu-z-index="2600"
                    @update:model-value="setBeatType"
                  />
                </label>
                <div class="form-grid">
                  <label class="form-field">
                    <span>分卷待落点</span>
                    <PopupSelect
                      :model-value="beatDraft.volumeId"
                      :options="volumeOptions"
                      accessible-label="选择触点所属分卷"
                      :menu-z-index="2600"
                      @update:model-value="setBeatVolume"
                    />
                    <small>选择剧情点后，这里会自动清空。</small>
                  </label>
                  <label class="form-field">
                    <span>剧情点</span>
                    <PopupSelect
                      :model-value="beatDraft.arcId"
                      :options="arcOptions"
                      accessible-label="选择触点所属剧情点"
                      :menu-z-index="2600"
                      @update:model-value="setBeatArc"
                    />
                    <small>精确到剧情点时只保存剧情点锚点。</small>
                  </label>
                </div>
                <label class="form-field">
                  <span>计划范围</span>
                  <input
                    v-model="beatDraft.plannedScope"
                    maxlength="1000"
                    autocomplete="off"
                    placeholder="尚未确定具体落点时，可填写阶段或范围"
                  />
                </label>
                <label class="form-field">
                  <span>呈现说明</span>
                  <textarea
                    v-model="beatDraft.note"
                    rows="4"
                    maxlength="4000"
                    placeholder="读者实际看到什么，以及希望形成什么判断"
                  />
                </label>
              </template>
            </fieldset>

            <footer class="dialog-actions">
              <button
                type="button"
                :disabled="mutationLocked"
                @click="closeForm"
              >
                取消
              </button>
              <button
                class="primary-button"
                type="submit"
                :disabled="mutationLocked"
              >
                {{
                  pendingMutation?.surface === "form"
                    ? "保存中…"
                    : formMode === "create"
                      ? "创建"
                      : "保存修改"
                }}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="deleteTarget"
        class="dialog-backdrop foreshadow-dialog-overlay"
        @mousedown.self="closeDelete"
      >
        <section
          ref="deleteDialog"
          class="foreshadow-dialog delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="foreshadow-delete-title"
          aria-describedby="foreshadow-delete-description"
          tabindex="-1"
        >
          <header class="dialog-header">
            <div>
              <span>DELETE</span>
              <h3 id="foreshadow-delete-title">{{ deleteTitle }}</h3>
            </div>
          </header>
          <div class="dialog-body">
            <p id="foreshadow-delete-description" class="delete-copy">
              {{
                deleteTarget.kind === "thread"
                  ? "这会同时删除该伏笔线下全部尚未提交的触点，保存后无法从当前界面恢复。"
                  : "这会删除该触点，其他卷和剧情点中的同一伏笔线不会被删除。"
              }}
            </p>
          </div>
          <footer class="dialog-actions">
            <button
              ref="deleteCancelButton"
              type="button"
              :disabled="mutationLocked"
              @click="closeDelete"
            >
              取消
            </button>
            <button
              class="danger-button"
              type="button"
              :disabled="mutationLocked"
              @click="confirmDelete"
            >
              {{
                pendingMutation?.surface === "delete"
                  ? "删除中…"
                  : "确认删除"
              }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.foreshadow-workspace {
  container-type: inline-size;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--surface-main);
  color: var(--text-primary);
}

.foreshadow-workspace.is-plotPoint {
  grid-template-rows: auto minmax(0, 1fr);
}

.foreshadow-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
  gap: 16px;
  padding: 18px 20px 15px;
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-raised);
}

.foreshadow-heading {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.foreshadow-heading h2 {
  overflow: hidden;
  margin: 0;
  font-size: 1.142857rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foreshadow-heading p {
  max-width: 56rem;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.5;
}

.foreshadow-header-actions,
.detail-actions,
.beat-actions,
.dialog-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

button,
input,
textarea {
  font: inherit;
}

button {
  border: 0;
}

.primary-button,
.thread-detail-header button,
.beat-empty button,
.dialog-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 31px;
  gap: 5px;
  padding: 6px 11px;
  border: 1px solid var(--theme-line);
  border-radius: 7px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  cursor: pointer;
}

.primary-button {
  border-color: var(--neutral-solid);
  background: var(--neutral-solid);
  color: var(--accent-contrast, #ffffff);
  font-weight: 620;
}

button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.primary-button:hover:not(:disabled) {
  background: var(--neutral-solid);
  color: var(--accent-contrast, #ffffff);
  filter: brightness(1.08);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.overview-dashboard {
  display: grid;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.overview-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  margin: 0;
}

.overview-stats > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-raised);
}

.overview-stats dt {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 0.678571rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-stats dd {
  margin: 0;
  font-size: 0.928571rem;
  font-weight: 680;
}

.overview-filters {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.search-field {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 9rem;
  height: 32px;
  gap: 7px;
  padding: 0 9px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  background: var(--surface-main);
  color: var(--text-tertiary);
}

.search-field:focus-within {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--theme-line));
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.search-field input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.75rem;
}

.search-field input::placeholder {
  color: var(--text-tertiary);
}

.volume-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 8px;
  padding: 12px;
  overflow-x: auto;
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.summary-column {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  background: var(--surface-raised);
}

.summary-column > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 7px;
}

.summary-column > header div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.summary-column h3 {
  margin: 0;
  font-size: 0.785714rem;
}

.summary-column header p,
.summary-empty {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  line-height: 1.4;
}

.summary-column > header > span {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--surface-selected);
  color: var(--text-secondary);
  font-size: 0.642857rem;
  font-weight: 650;
}

.summary-items {
  display: grid;
  gap: 5px;
}

.summary-items button {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 7px;
  border-radius: 7px;
  background: var(--surface-main);
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.summary-items strong,
.summary-items span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-items strong {
  color: var(--text-primary);
  font-size: 0.714286rem;
}

.summary-items span {
  font-size: 0.607143rem;
}

.foreshadow-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, 38%);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.thread-pane {
  order: 2;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--theme-line-soft);
  background: var(--surface-raised);
}

.thread-pane > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 8px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--theme-line-soft);
}

.thread-pane > header > div {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.thread-pane > header strong {
  font-size: 0.75rem;
}

.thread-pane > header span {
  color: var(--text-tertiary);
  font-size: 0.642857rem;
}

.quiet-add-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  cursor: pointer;
}

.thread-list {
  min-height: 0;
  padding: 7px;
  overflow-y: auto;
}

.thread-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 9px;
}

.thread-card + .thread-card {
  margin-top: 4px;
}

.thread-card:hover,
.thread-card.is-active {
  border-color: var(--theme-line-soft);
  background: var(--surface-hover);
}

.thread-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--theme-line));
  background: var(--surface-selected);
}

.thread-card-main {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 9px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.thread-card-main > span:last-child {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.678571rem;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.thread-card-title,
.thread-card-meta {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.thread-card-title strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-card-meta {
  color: var(--text-tertiary);
  font-size: 0.607143rem;
}

.status-pill,
.execution-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 18px;
  padding: 1px 6px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 9px;
  background: var(--surface-raised);
  color: var(--text-tertiary);
  font-size: 0.571429rem;
  font-weight: 620;
}

.status-pill.is-open,
.status-pill.is-progressing {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--theme-line));
  background: var(--accent-soft);
  color: var(--accent);
}

.status-pill.is-resolved,
.execution-pill.is-committed {
  border-color: color-mix(in srgb, var(--success) 28%, var(--theme-line));
  background: var(--success-soft);
  color: var(--success);
}

.status-pill.is-abandoned,
.execution-pill.is-missed {
  opacity: 0.68;
}

.thread-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 5px;
}

.thread-card-actions button {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.danger-ghost-button:hover:not(:disabled),
.danger-text-button:hover:not(:disabled) {
  color: var(--danger);
}

.thread-detail {
  order: 1;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 24px;
  overflow-y: auto;
  background: var(--surface-main);
}

.thread-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
  gap: 12px;
}

.thread-detail-header > div:first-child {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.thread-detail-header h3 {
  overflow: hidden;
  margin: 0;
  font-family: var(--editor-font);
  font-size: 1.285714rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-kicker {
  color: var(--accent);
  font-size: 0.642857rem;
  font-weight: 650;
}

.detail-kicker i {
  margin-inline: 4px;
  color: var(--text-tertiary);
  font-style: normal;
}

.thread-facts {
  display: grid;
  gap: 7px;
  margin: 14px 0 18px;
}

.thread-facts > div {
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr);
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-muted);
}

.thread-facts dt {
  color: var(--text-tertiary);
  font-size: 0.678571rem;
  font-weight: 600;
}

.thread-facts dd {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.714286rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.beat-section {
  display: grid;
  gap: 10px;
}

.beat-section > header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
}

.beat-section > header > div {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.beat-section h4 {
  margin: 0;
  font-size: 0.857143rem;
}

.beat-section header span,
.beat-section header small {
  color: var(--text-tertiary);
  font-size: 0.642857rem;
}

.beat-timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.beat-timeline > li {
  position: relative;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 7px;
}

.beat-timeline > li:not(:last-child)::before {
  position: absolute;
  top: 16px;
  bottom: -7px;
  left: 6px;
  width: 1px;
  background: var(--theme-line);
  content: "";
}

.beat-timeline > li + li {
  margin-top: 7px;
}

.beat-marker {
  position: relative;
  z-index: 1;
  width: 13px;
  height: 13px;
  margin-top: 12px;
  border: 3px solid var(--surface-main);
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 1px var(--theme-line);
}

.beat-timeline > li.is-misdirect .beat-marker {
  background: var(--warning);
}

.beat-timeline > li.is-reveal .beat-marker,
.beat-timeline > li.is-payoff .beat-marker {
  background: var(--success);
}

.beat-timeline article {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 9px;
  background: var(--surface-raised);
}

.beat-timeline article > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 7px;
}

.beat-timeline article > header > div {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 6px;
}

.beat-timeline article strong {
  font-size: 0.75rem;
}

.beat-order {
  color: var(--text-tertiary);
  font-size: 0.607143rem;
}

.beat-context {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0;
  color: var(--accent);
  font-size: 0.642857rem;
  line-height: 1.4;
}

.beat-copy {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.714286rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.beat-actions {
  justify-content: flex-end;
  margin-top: 6px;
}

.beat-actions button {
  padding: 3px 5px;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  cursor: pointer;
}

.pane-empty,
.detail-empty,
.beat-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  min-height: 0;
  gap: 6px;
  padding: 24px;
  color: var(--text-tertiary);
  text-align: center;
}

.pane-empty strong,
.detail-empty strong,
.beat-empty strong {
  color: var(--text-primary);
  font-size: 0.785714rem;
}

.pane-empty span,
.detail-empty span,
.beat-empty span {
  font-size: 0.678571rem;
  line-height: 1.5;
}

.detail-empty {
  height: 100%;
}

.beat-empty {
  min-height: 150px;
  border: 1px dashed var(--theme-line);
  border-radius: 10px;
  background: var(--surface-muted);
}

.foreshadow-dialog-overlay {
  z-index: 2400;
  overflow-y: auto;
  padding: 16px;
}

.foreshadow-dialog {
  width: min(620px, 94vw);
  max-height: min(820px, 92vh);
  overflow-y: auto;
  border: 1px solid var(--theme-line);
  border-radius: 14px;
  background: var(--surface-raised);
  box-shadow: 0 22px 70px
    color-mix(in srgb, var(--text-primary) 20%, transparent);
  color: var(--text-primary);
}

.foreshadow-dialog form {
  display: grid;
}

.dialog-header,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 15px;
}

.dialog-header {
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.dialog-header > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.dialog-header span {
  color: var(--accent);
  font-size: 0.607143rem;
  font-weight: 720;
  letter-spacing: 0.1em;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1rem;
}

.dialog-header > button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.dialog-body {
  display: grid;
  min-inline-size: 0;
  gap: 12px;
  margin: 0;
  padding: 15px;
  border: 0;
}

.committed-backfill-note {
  margin: 0;
  padding: 9px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.785714rem;
  line-height: 1.55;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.form-grid.is-single {
  grid-template-columns: minmax(0, 1fr);
}

.form-field {
  display: grid;
  min-width: 0;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}

.form-field input,
.form-field textarea {
  width: 100%;
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  outline: 0;
  background: var(--surface-main);
  color: var(--text-primary);
  font-weight: 400;
  line-height: 1.5;
}

.form-field textarea {
  resize: vertical;
}

.form-field input:focus,
.form-field textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--theme-line));
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.form-field small {
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  font-weight: 400;
}

.dialog-actions {
  justify-content: flex-end;
  border-top: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.delete-dialog {
  width: min(470px, 94vw);
}

.delete-copy {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.785714rem;
  line-height: 1.65;
}

.danger-button {
  border-color: var(--danger) !important;
  background: var(--danger) !important;
  color: #ffffff !important;
  font-weight: 620;
}

@container (max-width: 38rem) {
  .foreshadow-header {
    padding: 14px;
  }

  .foreshadow-heading p {
    display: none;
  }

  .overview-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-filters {
    flex-wrap: wrap;
  }

  .search-field {
    flex-basis: 100%;
  }

  .volume-summary {
    grid-template-columns: repeat(4, minmax(165px, 1fr));
  }

  .foreshadow-layout {
    grid-template-columns: minmax(0, 1fr) minmax(145px, 35%);
  }

  .thread-detail {
    padding-inline: 12px;
  }

  .thread-detail-header {
    display: grid;
  }

  .detail-actions {
    flex-wrap: wrap;
  }

  .thread-facts > div {
    grid-template-columns: 1fr;
    gap: 3px;
  }
}

@container (max-width: 28rem) {
  .foreshadow-header {
    align-items: center;
  }

  .foreshadow-header-actions .primary-button svg,
  .quiet-add-button span {
    display: none;
  }

  .foreshadow-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .thread-pane {
    max-height: 210px;
    border-left: 0;
    border-top: 1px solid var(--theme-line-soft);
  }

  .thread-detail {
    overflow: visible;
  }

  .beat-section > header {
    align-items: flex-start;
  }
}

@media (max-width: 560px), (max-height: 680px) {
  .foreshadow-dialog-overlay {
    padding: 8px;
  }

  .foreshadow-dialog {
    max-height: calc(100vh - 16px);
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
  }
}
</style>
