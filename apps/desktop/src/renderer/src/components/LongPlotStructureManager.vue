<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type {
  LongDisclosureLevel,
  LongEventConnectionType,
  LongForeshadowingBeatType,
  LongForeshadowingStatus,
  LongNarrativeMode,
  LongStoryTimeMode,
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import {
  createLongStructureMutationBuilder,
  type LongOrderDirection,
  type LongStructureMutationBuilder
} from "../types/longStructureMutations";
import type { LongStructureMutationCompletion } from "../types/longWorkspace";
import PopupSelect, {
  type PopupSelectOption,
  type PopupSelectValue
} from "./PopupSelect.vue";

type PlotSection =
  | "event"
  | "connection"
  | "placement"
  | "foreshadowing"
  | "foreshadowingBeat";

interface PlotRow {
  id: string;
  title: string;
  details: string[];
  scopeId: string;
  editLocked?: boolean;
  deleteLocked?: boolean;
  reorderLocked?: boolean;
}

interface PlotDraft {
  id: string | null;
  title: string;
  summary: string;
  timeMode: LongStoryTimeMode;
  timeLabel: string;
  timeValue: string;
  location: string;
  arcIds: string[];
  characterIds: string[];
  sourceEventId: string;
  targetEventId: string;
  connectionType: LongEventConnectionType;
  note: string;
  eventId: string;
  chapterCardId: string;
  narrativeMode: LongNarrativeMode;
  disclosure: LongDisclosureLevel;
  writingPrompt: string;
  coreQuestion: string;
  truthEventId: string;
  expectedReaderEffect: string;
  foreshadowingStatus: LongForeshadowingStatus;
  threadId: string;
  beatType: LongForeshadowingBeatType;
  placementId: string;
  plannedScope: string;
  executionStatus: string;
  commitId: string;
}

const props = withDefaults(
  defineProps<{
    snapshot: LongWorkspaceIndexSnapshot;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const emit = defineEmits<{
  mutation: [
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion
  ];
}>();

const sectionLabels: Record<PlotSection, string> = {
  event: "故事事件",
  connection: "事件连接",
  placement: "叙事落点",
  foreshadowing: "伏笔线程",
  foreshadowingBeat: "伏笔节拍"
};

const sectionOptions: readonly PopupSelectOption[] = (
  Object.entries(sectionLabels) as Array<[PlotSection, string]>
).map(([value, label]) => ({ value, label }));

const timeModeLabels: Record<LongStoryTimeMode, string> = {
  exact: "精确时间",
  relative: "相对时间",
  sequence: "顺序时间",
  unknown: "时间未知"
};
const timeModeOptions = enumOptions(timeModeLabels);

const connectionTypeLabels: Record<LongEventConnectionType, string> = {
  before: "先于",
  same_time: "同时",
  overlaps: "时间重叠",
  causes: "导致",
  enables: "促成",
  conceals: "掩盖"
};
const connectionTypeOptions = enumOptions(connectionTypeLabels);

const narrativeModeLabels: Record<LongNarrativeMode, string> = {
  scene: "当前场景",
  flashback: "闪回",
  retelling: "转述",
  clue: "线索",
  misdirection: "误导",
  reveal: "揭示",
  dream: "梦境",
  prophecy: "预言"
};
const narrativeModeOptions = enumOptions(narrativeModeLabels);

const disclosureLabels: Record<LongDisclosureLevel, string> = {
  hint: "暗示",
  partial: "部分披露",
  full: "完整披露",
  false: "虚假披露"
};
const disclosureOptions = enumOptions(disclosureLabels);

const foreshadowingStatusLabels: Record<LongForeshadowingStatus, string> = {
  planned: "计划中",
  open: "已埋设",
  progressing: "推进中",
  resolved: "已回收",
  abandoned: "已放弃"
};
const foreshadowingStatusOptions: readonly PopupSelectOption[] = (
  Object.entries(foreshadowingStatusLabels) as Array<
    [LongForeshadowingStatus, string]
  >
).map(([value, label]) => ({
  value,
  label,
  disabled: value !== "planned" && value !== "abandoned",
  description:
    value === "planned" || value === "abandoned"
      ? "可在结构管理中设置"
      : "由写作提交和连续性账本维护"
}));

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
const beatTypeOptions = enumOptions(beatTypeLabels);

function enumOptions<T extends string>(
  labels: Record<T, string>
): PopupSelectOption[] {
  return (Object.entries(labels) as Array<[T, string]>).map(
    ([value, label]) => ({ value, label })
  );
}

function emptyDraft(): PlotDraft {
  return {
    id: null,
    title: "",
    summary: "",
    timeMode: "unknown",
    timeLabel: "",
    timeValue: "",
    location: "",
    arcIds: [],
    characterIds: [],
    sourceEventId: "",
    targetEventId: "",
    connectionType: "before",
    note: "",
    eventId: "",
    chapterCardId: "",
    narrativeMode: "scene",
    disclosure: "hint",
    writingPrompt: "",
    coreQuestion: "",
    truthEventId: "",
    expectedReaderEffect: "",
    foreshadowingStatus: "planned",
    threadId: "",
    beatType: "plant",
    placementId: "",
    plannedScope: "",
    executionStatus: "planned",
    commitId: ""
  };
}

const activeSection = ref<PlotSection>("event");
const formOpen = ref(false);
const formMode = ref<"create" | "edit">("create");
const pendingDelete = ref<PlotRow | null>(null);
const cascadeDelete = ref(false);
const draft = reactive<PlotDraft>(emptyDraft());
type MutationSurface = "form" | "delete" | "background";
const pendingMutation = ref<{
  id: number;
  surface: MutationSurface;
} | null>(null);
let mutationClock = 0;
const mutationLocked = computed(
  () => props.disabled || pendingMutation.value !== null
);

const eventById = computed(
  () =>
    new Map(
      props.snapshot.plot.storyEvents.map((event) => [event.id, event] as const)
    )
);
const chapterById = computed(
  () =>
    new Map(
      props.snapshot.plot.chapterCards.map(
        (chapter) => [chapter.id, chapter] as const
      )
    )
);
const arcById = computed(
  () =>
    new Map(props.snapshot.plot.arcs.map((arc) => [arc.id, arc] as const))
);
const characterById = computed(
  () =>
    new Map(
      props.snapshot.characters.map(
        (character) => [character.id, character] as const
      )
    )
);
const placementById = computed(
  () =>
    new Map(
      props.snapshot.plot.narrativePlacements.map(
        (placement) => [placement.id, placement] as const
      )
    )
);
const threadById = computed(
  () =>
    new Map(
      props.snapshot.plot.foreshadowing.map(
        (thread) => [thread.id, thread] as const
      )
    )
);

const eventOptions = computed<PopupSelectOption[]>(() =>
  [...props.snapshot.plot.storyEvents]
    .sort((left, right) => left.storyOrder - right.storyOrder)
    .map((event) => ({ value: event.id, label: event.title }))
);
const optionalEventOptions = computed<PopupSelectOption[]>(() => [
  { value: "", label: "不关联事件" },
  ...eventOptions.value
]);
const chapterOptions = computed<PopupSelectOption[]>(() =>
  [...props.snapshot.plot.chapterCards]
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder)
    .map((chapter) => ({ value: chapter.id, label: chapter.title }))
);
const optionalChapterOptions = computed<PopupSelectOption[]>(() => [
  { value: "", label: "不关联章卡" },
  ...chapterOptions.value
]);
const placementOptions = computed<PopupSelectOption[]>(() =>
  [...props.snapshot.plot.narrativePlacements]
    .sort(
      (left, right) =>
        left.chapterCardId.localeCompare(right.chapterCardId) ||
        left.orderInChapter - right.orderInChapter
    )
    .map((placement) => ({
      value: placement.id,
      label: `${chapterTitle(placement.chapterCardId)} · ${eventTitle(
        placement.eventId
      )}`
    }))
);
const optionalPlacementOptions = computed<PopupSelectOption[]>(() => [
  { value: "", label: "不关联叙事落点" },
  ...placementOptions.value
]);
const threadOptions = computed<PopupSelectOption[]>(() =>
  props.snapshot.plot.foreshadowing.map((thread) => ({
    value: thread.id,
    label: thread.title
  }))
);

const rows = computed<PlotRow[]>(() => {
  switch (activeSection.value) {
    case "event":
      return [...props.snapshot.plot.storyEvents]
        .sort((left, right) => left.storyOrder - right.storyOrder)
        .map((event) => ({
          id: event.id,
          title: `${event.storyOrder}. ${event.title}`,
          scopeId: "story",
          editLocked: false,
          deleteLocked: false,
          // Story order is a dense sequence. Moving any sibling across a committed
          // event would also rewrite that committed event's order, so the whole
          // sequence becomes immutable once it contains an audited fact.
          reorderLocked: false,
          details: [
            `时间：${timeModeLabels[event.timeMode]} · ${
              event.timeLabel || "未填写显示时间"
            } · 机器值：${event.timeValue || "未填写"}`,
            `地点：${event.location || "未填写"} · 剧情弧：${names(
              event.arcIds,
              arcById.value,
              (value) => value.title
            )}`,
            `人物：${names(
              event.characterIds,
              characterById.value,
              (value) => value.name
            )}`,
            `摘要：${event.summary || "未填写"}`
          ]
        }));
    case "connection":
      return props.snapshot.plot.eventConnections.map((connection) => {
        return {
          id: connection.id,
          title: `${eventTitle(connection.sourceEventId)} → ${eventTitle(
            connection.targetEventId
          )}`,
          scopeId: "connections",
          editLocked: false,
          deleteLocked: false,
          details: [
            `关系：${connectionTypeLabels[connection.type]}`,
            `备注：${connection.note || "未填写"}`
          ]
        };
      });
    case "placement":
      return [...props.snapshot.plot.narrativePlacements]
        .sort(
          (left, right) =>
            left.chapterCardId.localeCompare(right.chapterCardId) ||
            left.orderInChapter - right.orderInChapter
        )
        .map((placement) => {
          return {
            id: placement.id,
            title: `${chapterTitle(placement.chapterCardId)} · ${
              placement.orderInChapter
            }. ${eventTitle(placement.eventId)}`,
            scopeId: placement.chapterCardId,
            editLocked: false,
            deleteLocked: false,
            reorderLocked: false,
            details: [
              `呈现：${narrativeModeLabels[placement.mode]} · ${
                disclosureLabels[placement.disclosure]
              }`,
              `状态：${placement.status} · 提交：${
                placement.commitId ?? "未提交"
              }`,
              `写作提示：${placement.writingPrompt || "未填写"}`
            ]
          };
        });
    case "foreshadowing":
      return props.snapshot.plot.foreshadowing.map((thread) => {
        return {
          id: thread.id,
          title: thread.title,
          scopeId: "foreshadowing",
          editLocked: false,
          deleteLocked: false,
          details: [
            `状态：${foreshadowingStatusLabels[thread.status]} · 真相事件：${
              thread.truthEventId
                ? eventTitle(thread.truthEventId)
                : "暂未关联"
            }`,
            `核心问题：${thread.coreQuestion || "未填写"}`,
            `预期读者效果：${thread.expectedReaderEffect || "未填写"}`,
            `节拍数：${thread.beats.length}`
          ]
        };
      });
    case "foreshadowingBeat":
      return props.snapshot.plot.foreshadowing.flatMap((thread) =>
        [...thread.beats]
          .sort((left, right) => left.order - right.order)
          .map((beat) => {
            return {
              id: beat.id,
              title: `${thread.title} · ${beat.order}. ${
                beatTypeLabels[beat.type]
              }`,
              scopeId: thread.id,
              editLocked: false,
              deleteLocked: false,
              reorderLocked: false,
              details: [
                `事件：${
                  beat.eventId ? eventTitle(beat.eventId) : "未关联"
                } · 落点：${
                  beat.placementId
                    ? placementTitle(beat.placementId)
                    : "未关联"
                }`,
                `章卡：${
                  beat.chapterCardId
                    ? chapterTitle(beat.chapterCardId)
                    : "未关联"
                } · 计划范围：${beat.plannedScope || "未填写"}`,
                `状态：${beat.status} · 提交：${beat.commitId ?? "未提交"}`,
                `备注：${beat.note || "未填写"}`
              ]
            };
          })
      );
  }
});

const selectedSectionLabel = computed(
  () => sectionLabels[activeSection.value]
);
const formTitle = computed(
  () =>
    `${formMode.value === "create" ? "新建" : "编辑"}${
      selectedSectionLabel.value
    }`
);
const supportsReorder = computed(
  () => activeSection.value !== "connection"
);
const supportsCascade = computed(
  () =>
    activeSection.value === "event" ||
    activeSection.value === "placement" ||
    activeSection.value === "foreshadowing"
);

function names<T>(
  ids: readonly string[],
  source: ReadonlyMap<string, T>,
  label: (value: T) => string
): string {
  if (ids.length === 0) return "无";
  return ids
    .map((id) => {
      const value = source.get(id);
      return value ? label(value) : `缺失引用（${id}）`;
    })
    .join("、");
}

function eventTitle(id: string): string {
  return eventById.value.get(id)?.title ?? `缺失事件（${id}）`;
}

function chapterTitle(id: string): string {
  return chapterById.value.get(id)?.title ?? `缺失章卡（${id}）`;
}

function placementTitle(id: string): string {
  const placement = placementById.value.get(id);
  return placement
    ? `${chapterTitle(placement.chapterCardId)} / ${eventTitle(
        placement.eventId
      )}`
    : `缺失落点（${id}）`;
}

function setSection(value: PopupSelectValue): void {
  if (typeof value !== "string" || !(value in sectionLabels)) return;
  activeSection.value = value as PlotSection;
  closeForm();
  closeDelete();
}

function resetDraft(): void {
  Object.assign(draft, emptyDraft());
}

function firstString(options: readonly PopupSelectOption[]): string {
  const value = options[0]?.value;
  return typeof value === "string" ? value : "";
}

function openCreate(): void {
  if (
    activeSection.value === "connection" &&
    eventOptions.value.length < 2
  ) {
    uiMessage.warning("事件连接至少需要两个故事事件。");
    return;
  }
  if (
    activeSection.value === "placement" &&
    (eventOptions.value.length === 0 || chapterOptions.value.length === 0)
  ) {
    uiMessage.warning("创建叙事落点前，需要至少一个故事事件和一个章卡。");
    return;
  }
  if (
    activeSection.value === "foreshadowingBeat" &&
    threadOptions.value.length === 0
  ) {
    uiMessage.warning("创建伏笔节拍前，请先创建伏笔线程。");
    return;
  }
  resetDraft();
  formMode.value = "create";
  if (activeSection.value === "connection") {
    draft.sourceEventId = firstString(eventOptions.value);
    draft.targetEventId =
      typeof eventOptions.value[1]?.value === "string"
        ? eventOptions.value[1].value
        : "";
  } else if (activeSection.value === "placement") {
    draft.eventId = firstString(eventOptions.value);
    draft.chapterCardId = firstString(chapterOptions.value);
  } else if (activeSection.value === "foreshadowingBeat") {
    draft.threadId = firstString(threadOptions.value);
  }
  formOpen.value = true;
}

function missingReferenceMessage(row: PlotRow): string | null {
  const missing = row.details.filter((line) => line.includes("缺失"));
  return missing.length > 0
    ? `“${row.title}”存在缺失依赖，请先修复引用后再编辑。`
    : null;
}

function openEdit(row: PlotRow): void {
  if (row.editLocked) {
    uiMessage.info("该结构已成为连续性事实，不能编辑；请先回滚相关提交。");
    return;
  }
  const missing = missingReferenceMessage(row);
  if (missing) {
    uiMessage.warning(missing);
  }
  resetDraft();
  formMode.value = "edit";
  draft.id = row.id;
  switch (activeSection.value) {
    case "event": {
      const event = eventById.value.get(row.id);
      if (!event) return;
      Object.assign(draft, {
        title: event.title,
        summary: event.summary,
        timeMode: event.timeMode,
        timeLabel: event.timeLabel,
        timeValue: event.timeValue ?? "",
        location: event.location,
        arcIds: [...event.arcIds],
        characterIds: [...event.characterIds]
      });
      break;
    }
    case "connection": {
      const connection = props.snapshot.plot.eventConnections.find(
        (candidate) => candidate.id === row.id
      );
      if (!connection) return;
      Object.assign(draft, {
        sourceEventId: connection.sourceEventId,
        targetEventId: connection.targetEventId,
        connectionType: connection.type,
        note: connection.note
      });
      break;
    }
    case "placement": {
      const placement = placementById.value.get(row.id);
      if (!placement) return;
      Object.assign(draft, {
        eventId: placement.eventId,
        chapterCardId: placement.chapterCardId,
        narrativeMode: placement.mode,
        disclosure: placement.disclosure,
        writingPrompt: placement.writingPrompt,
        executionStatus: placement.status,
        commitId: placement.commitId ?? ""
      });
      break;
    }
    case "foreshadowing": {
      const thread = threadById.value.get(row.id);
      if (!thread) return;
      Object.assign(draft, {
        title: thread.title,
        coreQuestion: thread.coreQuestion,
        truthEventId: thread.truthEventId ?? "",
        expectedReaderEffect: thread.expectedReaderEffect,
        foreshadowingStatus: thread.status
      });
      break;
    }
    case "foreshadowingBeat": {
      const located = props.snapshot.plot.foreshadowing
        .map((thread) => ({
          thread,
          beat: thread.beats.find((beat) => beat.id === row.id)
        }))
        .find((entry) => entry.beat);
      if (!located?.beat) return;
      Object.assign(draft, {
        threadId: located.thread.id,
        beatType: located.beat.type,
        eventId: located.beat.eventId ?? "",
        placementId: located.beat.placementId ?? "",
        chapterCardId: located.beat.chapterCardId ?? "",
        plannedScope: located.beat.plannedScope,
        note: located.beat.note,
        executionStatus: located.beat.status,
        commitId: located.beat.commitId ?? ""
      });
      break;
    }
  }
  formOpen.value = true;
}

function closeForm(): void {
  if (mutationLocked.value) return;
  formOpen.value = false;
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
    pendingDelete.value = null;
    cascadeDelete.value = false;
  }
}

function emitMutation(
  build: (builder: LongStructureMutationBuilder) => LongWorkspaceOperationBatch,
  surface: MutationSurface = "background"
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
  } catch (error) {
    uiMessage.warning(
      error instanceof Error
        ? error.message
        : "无法生成长篇剧情结构变更。"
    );
    return false;
  }
}

function validateDraft(): boolean {
  if (
    (activeSection.value === "event" ||
      activeSection.value === "foreshadowing") &&
    !draft.title.trim()
  ) {
    uiMessage.warning("请输入标题。");
    return false;
  }
  if (
    activeSection.value === "connection" &&
    (!draft.sourceEventId ||
      !draft.targetEventId ||
      draft.sourceEventId === draft.targetEventId)
  ) {
    uiMessage.warning("事件连接必须选择两个不同的故事事件。");
    return false;
  }
  if (
    activeSection.value === "placement" &&
    (!draft.eventId || !draft.chapterCardId)
  ) {
    uiMessage.warning("叙事落点必须关联故事事件和章卡。");
    return false;
  }
  if (
    activeSection.value === "foreshadowingBeat" &&
    (!draft.threadId ||
      (!draft.eventId &&
        !draft.placementId &&
        !draft.chapterCardId &&
        !draft.plannedScope.trim()))
  ) {
    uiMessage.warning(
      "伏笔节拍必须选择线程，并关联事件、落点、章卡或填写计划范围。"
    );
    return false;
  }
  return true;
}

function eventTimeValuePatch(): { timeValue?: string } {
  const current =
    formMode.value === "edit" && draft.id
      ? eventById.value.get(draft.id)
      : undefined;
  return draft.timeValue.length > 0 || current?.timeValue !== undefined
    ? { timeValue: draft.timeValue }
    : {};
}

function submitForm(): void {
  if (!validateDraft()) return;
  emitMutation((builder) => {
    if (formMode.value === "create") {
      switch (activeSection.value) {
        case "event":
          return builder.createStoryEvent({
            title: draft.title,
            summary: draft.summary,
            timeMode: draft.timeMode,
            timeLabel: draft.timeLabel,
            ...eventTimeValuePatch(),
            location: draft.location,
            arcIds: draft.arcIds,
            characterIds: draft.characterIds
          });
        case "connection":
          return builder.createEventConnection({
            sourceEventId: draft.sourceEventId,
            targetEventId: draft.targetEventId,
            type: draft.connectionType,
            note: draft.note
          });
        case "placement":
          return builder.createNarrativePlacement({
            eventId: draft.eventId,
            chapterCardId: draft.chapterCardId,
            mode: draft.narrativeMode,
            disclosure: draft.disclosure,
            writingPrompt: draft.writingPrompt
          });
        case "foreshadowing":
          return builder.createForeshadowing({
            title: draft.title,
            coreQuestion: draft.coreQuestion,
            truthEventId: draft.truthEventId || null,
            expectedReaderEffect: draft.expectedReaderEffect,
            status: draft.foreshadowingStatus
          });
        case "foreshadowingBeat":
          return builder.createForeshadowingBeat({
            threadId: draft.threadId,
            type: draft.beatType,
            eventId: draft.eventId || null,
            placementId: draft.placementId || null,
            chapterCardId: draft.chapterCardId || null,
            plannedScope: draft.plannedScope,
            note: draft.note
          });
      }
    }
    if (!draft.id) throw new Error("缺少待编辑条目的稳定 ID。");
    switch (activeSection.value) {
      case "event":
        return builder.updateStoryEvent(draft.id, {
          title: draft.title,
          summary: draft.summary,
          timeMode: draft.timeMode,
          timeLabel: draft.timeLabel,
          ...eventTimeValuePatch(),
          location: draft.location,
          arcIds: draft.arcIds,
          characterIds: draft.characterIds
        });
      case "connection":
        return builder.updateEventConnection(draft.id, {
          sourceEventId: draft.sourceEventId,
          targetEventId: draft.targetEventId,
          type: draft.connectionType,
          note: draft.note
        });
      case "placement":
        return builder.updateNarrativePlacement(draft.id, {
          eventId: draft.eventId,
          chapterCardId: draft.chapterCardId,
          mode: draft.narrativeMode,
          disclosure: draft.disclosure,
          writingPrompt: draft.writingPrompt
        });
      case "foreshadowing":
        return builder.updateForeshadowing(draft.id, {
          title: draft.title,
          coreQuestion: draft.coreQuestion,
          truthEventId: draft.truthEventId || null,
          expectedReaderEffect: draft.expectedReaderEffect,
          ...(draft.foreshadowingStatus === "planned" ||
          draft.foreshadowingStatus === "abandoned"
            ? { status: draft.foreshadowingStatus }
            : {})
        });
      case "foreshadowingBeat":
        return builder.updateForeshadowingBeat(draft.id, {
          threadId: draft.threadId,
          type: draft.beatType,
          eventId: draft.eventId || null,
          placementId: draft.placementId || null,
          chapterCardId: draft.chapterCardId || null,
          plannedScope: draft.plannedScope,
          note: draft.note
        });
    }
  }, "form");
}

function siblingIds(row: PlotRow): string[] {
  return rows.value
    .filter((candidate) => candidate.scopeId === row.scopeId)
    .map((candidate) => candidate.id);
}

function canMove(row: PlotRow, direction: LongOrderDirection): boolean {
  if (!supportsReorder.value || row.reorderLocked) return false;
  const ids = siblingIds(row);
  const index = ids.indexOf(row.id);
  return direction === "up" ? index > 0 : index >= 0 && index < ids.length - 1;
}

function reorder(row: PlotRow, direction: LongOrderDirection): void {
  if (row.reorderLocked) {
    uiMessage.info("该顺序范围包含已提交事实，不能重排。");
    return;
  }
  emitMutation((builder) => {
    switch (activeSection.value) {
      case "event":
        return builder.reorderStoryEvent(row.id, direction);
      case "placement":
        return builder.reorderNarrativePlacement(row.id, direction);
      case "foreshadowing":
        return builder.reorderForeshadowing(row.id, direction);
      case "foreshadowingBeat":
        return builder.reorderForeshadowingBeat(row.id, direction);
      case "connection":
        throw new Error("事件连接没有独立顺序。");
    }
  });
}

function openDelete(row: PlotRow): void {
  if (row.deleteLocked) {
    uiMessage.info("该条目已成为或已被连续性事实引用，不能删除。");
    return;
  }
  cascadeDelete.value = false;
  pendingDelete.value = row;
}

function closeDelete(): void {
  if (mutationLocked.value) return;
  pendingDelete.value = null;
  cascadeDelete.value = false;
}

function confirmDelete(): void {
  const target = pendingDelete.value;
  if (!target) return;
  emitMutation((builder) => {
    switch (activeSection.value) {
      case "event":
        return builder.deleteStoryEvent(target.id, cascadeDelete.value);
      case "connection":
        return builder.deleteEventConnection(target.id);
      case "placement":
        return builder.deleteNarrativePlacement(
          target.id,
          cascadeDelete.value
        );
      case "foreshadowing":
        return builder.deleteForeshadowing(
          target.id,
          cascadeDelete.value
        );
      case "foreshadowingBeat":
        return builder.deleteForeshadowingBeat(target.id);
    }
  }, "delete");
}

function toggleId(
  field: "arcIds" | "characterIds",
  id: string,
  event: Event
): void {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  const values = draft[field];
  draft[field] = input.checked
    ? [...new Set([...values, id])]
    : values.filter((value) => value !== id);
}

function setString(value: PopupSelectValue, apply: (value: string) => void) {
  if (typeof value === "string") apply(value);
}

function setTimeMode(value: PopupSelectValue) {
  setString(value, (next) => {
    draft.timeMode = next as LongStoryTimeMode;
  });
}
function setConnectionType(value: PopupSelectValue) {
  setString(value, (next) => {
    draft.connectionType = next as LongEventConnectionType;
  });
}
function setNarrativeMode(value: PopupSelectValue) {
  setString(value, (next) => {
    draft.narrativeMode = next as LongNarrativeMode;
  });
}
function setDisclosure(value: PopupSelectValue) {
  setString(value, (next) => {
    draft.disclosure = next as LongDisclosureLevel;
  });
}
function setForeshadowingStatus(value: PopupSelectValue) {
  setString(value, (next) => {
    draft.foreshadowingStatus = next as LongForeshadowingStatus;
  });
}
function setBeatType(value: PopupSelectValue) {
  setString(value, (next) => {
    draft.beatType = next as LongForeshadowingBeatType;
  });
}
function setBeatPlacement(value: PopupSelectValue) {
  setString(value, (next) => {
    draft.placementId = next;
    if (!next) return;
    const placement = placementById.value.get(next);
    if (!placement) {
      uiMessage.warning(`找不到叙事落点依赖：${next}`);
      return;
    }
    draft.eventId = placement.eventId;
    draft.chapterCardId = placement.chapterCardId;
  });
}
</script>

<template>
  <section class="plot-manager" aria-label="长篇剧情结构管理">
    <header class="plot-toolbar">
      <div>
        <strong>剧情与叙事结构</strong>
        <span>迁移数据会完整列出；手工修改会直接保存到本机。</span>
      </div>
      <div class="toolbar-actions">
        <div class="plot-section-tabs" role="tablist" aria-label="剧情叙事结构类型">
          <button
            v-for="section in sectionOptions"
            :id="`long-plot-section-${section.value}`"
            :key="section.value"
            type="button"
            role="tab"
            :aria-selected="activeSection === section.value"
            :disabled="mutationLocked"
            @click="setSection(section.value)"
          >
            {{ section.label }}
          </button>
        </div>
        <button
          class="primary-button"
          type="button"
          :disabled="mutationLocked"
          @click="openCreate"
        >
          新建{{ selectedSectionLabel }}
        </button>
      </div>
    </header>

    <div v-if="rows.length === 0" class="plot-empty">
      <strong>还没有{{ selectedSectionLabel }}</strong>
      <span>可以新建，也可导入旧版本长篇后在这里核对字段。</span>
    </div>
    <ol v-else class="plot-list">
      <li v-for="row in rows" :key="row.id" class="plot-row">
        <div class="row-copy">
          <strong>{{ row.title }}</strong>
          <span v-for="detail in row.details" :key="detail">{{ detail }}</span>
          <code>{{ row.id }}</code>
          <small v-if="row.editLocked">连续性事实已锁定编辑</small>
          <small v-else-if="row.deleteLocked">已被连续性事实引用，禁止删除</small>
        </div>
        <div class="row-actions">
          <button
            v-if="supportsReorder"
            type="button"
            :aria-label="`上移${row.title}`"
            :disabled="mutationLocked || !canMove(row, 'up')"
            @click="reorder(row, 'up')"
          >
            ↑
          </button>
          <button
            v-if="supportsReorder"
            type="button"
            :aria-label="`下移${row.title}`"
            :disabled="mutationLocked || !canMove(row, 'down')"
            @click="reorder(row, 'down')"
          >
            ↓
          </button>
          <button
            type="button"
            :disabled="mutationLocked || row.editLocked"
            @click="openEdit(row)"
          >
            编辑
          </button>
          <button
            class="delete-button"
            type="button"
            :disabled="mutationLocked || row.deleteLocked"
            @click="openDelete(row)"
          >
            删除
          </button>
        </div>
      </li>
    </ol>

    <Teleport to="body">
      <div
        v-if="formOpen"
        class="dialog-backdrop plot-modal-overlay"
        @mousedown.self="closeForm"
        @keydown.esc.stop="closeForm"
      >
        <section
          class="plot-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="formTitle"
        >
          <form @submit.prevent="submitForm">
            <header class="modal-header">
              <div>
                <span>{{ formMode === "create" ? "CREATE" : "EDIT" }}</span>
                <h3>{{ formTitle }}</h3>
              </div>
              <button
                type="button"
                aria-label="关闭"
                :disabled="mutationLocked"
                @click="closeForm"
              >
                ×
              </button>
            </header>
            <fieldset class="modal-body" :disabled="mutationLocked">
              <template v-if="activeSection === 'event'">
                <label class="form-field">
                  <span>事件标题</span>
                  <input
                    v-model="draft.title"
                    maxlength="256"
                    autofocus
                    required
                  />
                </label>
                <label class="form-field">
                  <span>事件摘要</span>
                  <textarea v-model="draft.summary" rows="4" maxlength="200000" />
                </label>
                <div class="field-grid">
                  <label class="form-field">
                    <span>时间类型</span>
                    <PopupSelect
                      :model-value="draft.timeMode"
                      :options="timeModeOptions"
                      accessible-label="选择故事时间类型"
                      :menu-z-index="2300"
                      @update:model-value="setTimeMode"
                    />
                  </label>
                  <label class="form-field">
                    <span>时间显示文本</span>
                    <input v-model="draft.timeLabel" maxlength="1000" />
                  </label>
                  <label class="form-field">
                    <span>机器时间值（timeValue）</span>
                    <input
                      v-model="draft.timeValue"
                      maxlength="1000"
                      placeholder="如 1897-06-03T23:00:00"
                    />
                  </label>
                  <label class="form-field">
                    <span>地点</span>
                    <input v-model="draft.location" maxlength="1000" />
                  </label>
                </div>
                <fieldset class="check-picker">
                  <legend>关联剧情弧</legend>
                  <p v-if="snapshot.plot.arcs.length === 0">暂无剧情弧。</p>
                  <label
                    v-for="arc in snapshot.plot.arcs"
                    v-else
                    :key="arc.id"
                  >
                    <input
                      type="checkbox"
                      :checked="draft.arcIds.includes(arc.id)"
                      @change="toggleId('arcIds', arc.id, $event)"
                    />
                    <span>{{ arc.title }}</span>
                    <code>{{ arc.id }}</code>
                  </label>
                </fieldset>
                <fieldset class="check-picker">
                  <legend>关联人物</legend>
                  <p v-if="snapshot.characters.length === 0">暂无人物。</p>
                  <label
                    v-for="character in snapshot.characters"
                    v-else
                    :key="character.id"
                  >
                    <input
                      type="checkbox"
                      :checked="draft.characterIds.includes(character.id)"
                      @change="toggleId('characterIds', character.id, $event)"
                    />
                    <span>{{ character.name }}</span>
                    <code>{{ character.id }}</code>
                  </label>
                </fieldset>
              </template>

              <template v-else-if="activeSection === 'connection'">
                <label class="form-field">
                  <span>起点事件</span>
                  <PopupSelect
                    :model-value="draft.sourceEventId"
                    :options="eventOptions"
                    accessible-label="选择连接起点事件"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.sourceEventId = value))
                    "
                  />
                </label>
                <label class="form-field">
                  <span>终点事件</span>
                  <PopupSelect
                    :model-value="draft.targetEventId"
                    :options="eventOptions"
                    accessible-label="选择连接终点事件"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.targetEventId = value))
                    "
                  />
                </label>
                <label class="form-field">
                  <span>关系类型</span>
                  <PopupSelect
                    :model-value="draft.connectionType"
                    :options="connectionTypeOptions"
                    accessible-label="选择事件关系"
                    :menu-z-index="2300"
                    @update:model-value="setConnectionType"
                  />
                </label>
                <label class="form-field">
                  <span>备注</span>
                  <textarea v-model="draft.note" rows="3" maxlength="4000" />
                </label>
              </template>

              <template v-else-if="activeSection === 'placement'">
                <label class="form-field">
                  <span>故事事件</span>
                  <PopupSelect
                    :model-value="draft.eventId"
                    :options="eventOptions"
                    accessible-label="选择落点事件"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.eventId = value))
                    "
                  />
                </label>
                <label class="form-field">
                  <span>所属章卡（编辑时可移动）</span>
                  <PopupSelect
                    :model-value="draft.chapterCardId"
                    :options="chapterOptions"
                    accessible-label="选择落点章卡"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.chapterCardId = value))
                    "
                  />
                </label>
                <div class="field-grid">
                  <label class="form-field">
                    <span>呈现方式</span>
                    <PopupSelect
                      :model-value="draft.narrativeMode"
                      :options="narrativeModeOptions"
                      accessible-label="选择叙事呈现方式"
                      :menu-z-index="2300"
                      @update:model-value="setNarrativeMode"
                    />
                  </label>
                  <label class="form-field">
                    <span>披露程度</span>
                    <PopupSelect
                      :model-value="draft.disclosure"
                      :options="disclosureOptions"
                      accessible-label="选择信息披露程度"
                      :menu-z-index="2300"
                      @update:model-value="setDisclosure"
                    />
                  </label>
                </div>
                <label class="form-field">
                  <span>写作提示</span>
                  <textarea
                    v-model="draft.writingPrompt"
                    rows="3"
                    maxlength="4000"
                  />
                </label>
                <div v-if="formMode === 'edit'" class="ledger-field">
                  <span>执行状态：{{ draft.executionStatus }}</span>
                  <span>账本提交：{{ draft.commitId || "未提交" }}</span>
                  <small>执行状态和提交 ID 由章节提交/回滚流程维护。</small>
                </div>
              </template>

              <template v-else-if="activeSection === 'foreshadowing'">
                <label class="form-field">
                  <span>线程标题</span>
                  <input v-model="draft.title" maxlength="256" required />
                </label>
                <label class="form-field">
                  <span>核心问题</span>
                  <textarea
                    v-model="draft.coreQuestion"
                    rows="3"
                    maxlength="200000"
                  />
                </label>
                <label class="form-field">
                  <span>真相事件</span>
                  <PopupSelect
                    :model-value="draft.truthEventId"
                    :options="optionalEventOptions"
                    accessible-label="选择伏笔真相事件"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.truthEventId = value))
                    "
                  />
                </label>
                <label class="form-field">
                  <span>预期读者效果</span>
                  <textarea
                    v-model="draft.expectedReaderEffect"
                    rows="3"
                    maxlength="200000"
                  />
                </label>
                <label class="form-field">
                  <span>线程状态</span>
                  <PopupSelect
                    :model-value="draft.foreshadowingStatus"
                    :options="foreshadowingStatusOptions"
                    accessible-label="选择伏笔线程状态"
                    :menu-z-index="2300"
                    @update:model-value="setForeshadowingStatus"
                  />
                  <small>已埋设、推进中和已回收状态由写作账本控制。</small>
                </label>
              </template>

              <template v-else>
                <label class="form-field">
                  <span>所属伏笔线程（编辑时可移动）</span>
                  <PopupSelect
                    :model-value="draft.threadId"
                    :options="threadOptions"
                    accessible-label="选择伏笔线程"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.threadId = value))
                    "
                  />
                </label>
                <label class="form-field">
                  <span>节拍类型</span>
                  <PopupSelect
                    :model-value="draft.beatType"
                    :options="beatTypeOptions"
                    accessible-label="选择伏笔节拍类型"
                    :menu-z-index="2300"
                    @update:model-value="setBeatType"
                  />
                </label>
                <label class="form-field">
                  <span>关联事件</span>
                  <PopupSelect
                    :model-value="draft.eventId"
                    :options="optionalEventOptions"
                    accessible-label="选择节拍事件"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.eventId = value))
                    "
                  />
                </label>
                <label class="form-field">
                  <span>关联叙事落点</span>
                  <PopupSelect
                    :model-value="draft.placementId"
                    :options="optionalPlacementOptions"
                    accessible-label="选择节拍叙事落点"
                    :menu-z-index="2300"
                    @update:model-value="setBeatPlacement"
                  />
                </label>
                <label class="form-field">
                  <span>关联章卡</span>
                  <PopupSelect
                    :model-value="draft.chapterCardId"
                    :options="optionalChapterOptions"
                    accessible-label="选择节拍章卡"
                    :menu-z-index="2300"
                    @update:model-value="
                      setString($event, (value) => (draft.chapterCardId = value))
                    "
                  />
                </label>
                <label class="form-field">
                  <span>计划范围</span>
                  <input v-model="draft.plannedScope" maxlength="1000" />
                </label>
                <label class="form-field">
                  <span>备注</span>
                  <textarea v-model="draft.note" rows="3" maxlength="4000" />
                </label>
                <div v-if="formMode === 'edit'" class="ledger-field">
                  <span>执行状态：{{ draft.executionStatus }}</span>
                  <span>账本提交：{{ draft.commitId || "未提交" }}</span>
                  <small>执行状态和提交 ID 由章节提交/回滚流程维护。</small>
                </div>
              </template>
            </fieldset>
            <footer class="modal-actions">
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
        v-if="pendingDelete"
        class="dialog-backdrop plot-modal-overlay"
        @mousedown.self="closeDelete"
        @keydown.esc.stop="closeDelete"
      >
        <section
          class="plot-modal delete-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="long-plot-delete-title"
          aria-describedby="long-plot-delete-description"
        >
          <header class="modal-header">
            <div>
              <span>DELETE</span>
              <h3 id="long-plot-delete-title">
                删除“{{ pendingDelete.title }}”
              </h3>
            </div>
          </header>
          <fieldset class="modal-body" :disabled="mutationLocked">
            <p id="long-plot-delete-description" class="delete-copy">
              删除会直接保存到本机；若仍有依赖，保存会被阻止。
            </p>
            <label v-if="supportsCascade" class="cascade-option">
              <input v-model="cascadeDelete" type="checkbox" />
              <span>
                同时删除依赖项
                <small>会一并删除引用当前条目的相关结构。</small>
              </span>
            </label>
          </fieldset>
          <footer class="modal-actions">
            <button
              type="button"
              :disabled="mutationLocked"
              autofocus
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
.plot-manager {
  display: grid;
  min-width: 0;
  gap: 0.75rem;
}

.plot-toolbar,
.toolbar-actions,
.row-actions,
.modal-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plot-toolbar {
  justify-content: space-between;
  padding: 0.75rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.7rem;
  background: var(--surface-muted);
}

.toolbar-actions {
  min-width: 0;
}

.plot-section-tabs {
  display: flex;
  min-width: 0;
  max-width: 34rem;
  overflow-x: auto;
  padding: 0.18rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.65rem;
  background: var(--surface-main);
}

.plot-section-tabs button {
  flex: 0 0 auto;
  min-height: 1.9rem;
  padding: 0.34rem 0.58rem;
  border-color: transparent;
  background: transparent;
  white-space: nowrap;
}

.plot-section-tabs button[aria-selected="true"] {
  border-color: var(--theme-line);
  color: var(--accent);
  background: var(--surface-raised);
}

.plot-toolbar > div:first-child {
  display: grid;
  gap: 0.15rem;
}

.plot-toolbar span,
.row-copy span,
.ledger-field small {
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1.45;
}

button,
input,
textarea {
  font: inherit;
}

button {
  min-height: 2rem;
  padding: 0.38rem 0.7rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.55rem;
  color: var(--text-secondary);
  background: var(--surface-raised);
  cursor: pointer;
}

button:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--surface-hover);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.primary-button {
  border-color: var(--neutral-solid);
  color: var(--accent-contrast);
  background: var(--neutral-solid);
  font-weight: 650;
}

.plot-list {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plot-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
  padding: 0.75rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.7rem;
  background: var(--surface-raised);
}

.plot-row:hover {
  border-color: var(--theme-line);
  background: var(--surface-hover);
}

.row-copy {
  display: grid;
  min-width: 0;
  gap: 0.18rem;
}

.row-copy strong,
.row-copy span,
.row-copy code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-copy code,
.check-picker code {
  color: var(--text-tertiary);
  font: 0.72rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.delete-button {
  color: var(--danger);
}

.plot-empty {
  display: grid;
  place-items: center;
  gap: 0.35rem;
  padding: 2rem 1rem;
  border: 1px dashed var(--theme-line);
  border-radius: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
  background: var(--surface-muted);
}

.plot-empty span {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

.plot-modal-overlay {
  z-index: 2200;
  overflow: auto;
  padding: 1rem;
}

.plot-modal {
  width: min(42rem, 100%);
  max-height: min(90vh, 52rem);
  overflow: auto;
  border: 1px solid var(--theme-line);
  border-radius: 0.9rem;
  color: var(--text-primary);
  background: var(--surface-main);
  box-shadow: 0 1.2rem 3.5rem
    color-mix(in srgb, var(--theme-foreground) 24%, transparent);
  font-size: 0.875rem;
}

.modal-header,
.modal-actions {
  justify-content: space-between;
  padding: 0.9rem 1rem;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid var(--theme-line-soft);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.05rem;
}

.modal-header span {
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.modal-body {
  display: grid;
  min-inline-size: 0;
  gap: 0.85rem;
  margin: 0;
  padding: 1rem;
  border: 0;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.form-field {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
  color: var(--text-secondary);
  font-weight: 600;
}

.form-field input,
.form-field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.65rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.6rem;
  color: var(--text-primary);
  background: var(--surface-raised);
  font-weight: 400;
  line-height: 1.5;
}

.form-field textarea {
  resize: vertical;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 0.2rem var(--accent-soft);
}

.check-picker {
  display: grid;
  gap: 0.4rem;
  max-height: 12rem;
  overflow: auto;
  margin: 0;
  padding: 0.75rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.65rem;
  background: var(--surface-muted);
}

.check-picker > label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem;
  border-radius: 0.45rem;
  background: var(--surface-raised);
}

.check-picker p,
.delete-copy {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.ledger-field {
  display: grid;
  gap: 0.25rem;
  padding: 0.7rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.6rem;
  color: var(--text-secondary);
  background: var(--surface-muted);
}

.modal-actions {
  justify-content: flex-end;
  border-top: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.delete-modal {
  width: min(31rem, 100%);
}

.cascade-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.65rem;
  background: var(--surface-muted);
}

.cascade-option span {
  display: grid;
  gap: 0.2rem;
}

.cascade-option small {
  color: var(--text-tertiary);
}

.danger-button {
  border-color: var(--danger);
  color: #fff;
  background: var(--danger);
  font-weight: 650;
}

@media (max-width: 42rem) {
  .plot-toolbar,
  .plot-row,
  .field-grid {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .toolbar-actions,
  .row-actions {
    flex-wrap: wrap;
  }

  .plot-section-tabs {
    max-width: 100%;
  }

  .row-actions button {
    flex: 1 1 auto;
  }
}
</style>
