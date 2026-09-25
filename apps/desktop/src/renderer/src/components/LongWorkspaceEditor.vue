<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from "vue";
import {
  LongFileRevisionSchema,
  createEmptyLongMarkdownFileReference,
  longStoryPlotBodyFileId,
  longStoryPlotFilePath,
  type LongLedgerCommitIndexEntry,
  type LongArcId,
  type LongChapterCardId,
  type LongCharacterId,
  type LongFileId,
  type LongFileRevision,
  type LongReadDocumentResult,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperationBatch,
  type LongWorkspaceOperation,
  type LongWorkspaceFileReference,
  type LongWriteDocumentResult
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";
import { uiMessage } from "../ui-feedback";
import {
  LONG_EDITOR_LIST_MAX_WIDTH,
  LONG_EDITOR_LIST_MIN_WIDTH,
  loadLongEditorPanePreferences,
  saveLongEditorPanePreferences
} from "../utils/longEditorPanePreferences";
import {
  countNonWhitespaceCharacters,
  createBoundedTextHistory,
  type TextHistoryRestoreResult,
  type TextSelectionRange
} from "../utils/boundedTextHistory";
import { handleHorizontalOverflowWheel } from "../utils/horizontalOverflow";
import {
  isEditableLongFile,
  resolveLongWorkspaceApi,
  type LongStructureMutationCompletion,
  type LongWorkspaceFileRole,
  type LongWorkspaceSelection,
  type LongWorkspaceSelectionFile
} from "../types/longWorkspace";
import type { LongApprovalEditorFocus } from "../utils/approvalNavigation";
import AppIcon from "./AppIcon.vue";
import LongCharacterNavigation from "./LongCharacterNavigation.vue";
import LongContinuityLedgerNavigation from "./LongContinuityLedgerNavigation.vue";
import LongForeshadowingWorkspace from "./LongForeshadowingWorkspace.vue";
import LongManuscriptEditor from "./LongManuscriptEditor.vue";
import LongManuscriptNavigation from "./LongManuscriptNavigation.vue";
import LongPlotStoryListPane from "./LongPlotStoryListPane.vue";
import LongWorldbuildingNavigation from "./LongWorldbuildingNavigation.vue";
import MarkdownContent from "./MarkdownContent.vue";

const props = defineProps<{
  bookId: string;
  selection: LongWorkspaceSelection | null;
  workspaceIndex: LongWorkspaceIndexSnapshot | null;
  latestCommit?: LongLedgerCommitIndexEntry | undefined;
  locked?: boolean;
  lockedReason?: string | undefined;
}>();

const emit = defineEmits<{
  collapse: [];
  saved: [result: LongWriteDocumentResult];
  contextChange: [
    context: {
      bookId: string;
      fileId: LongFileId;
      fileRevision: LongFileRevision;
    } | null
  ];
  rollback: [];
  selectCharacter: [
    characterId: LongCharacterId,
    done?: (accepted: boolean) => void
  ];
  selectPlotPoint: [plotPointId: LongArcId];
  selectChapterCard: [chapterCardId: LongChapterCardId];
  renameCharacter: [
    input: { characterId: LongCharacterId; name: string },
    completion: (succeeded: boolean) => void
  ];
  renameStructureTitle: [
    input: {
      kind: "worldbuilding" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void
  ];
  createCharacter: [];
  createWorldbuildingItem: [];
  createPlotPoint: [];
  createChapterCard: [];
  createVolume: [];
  deleteStructure: [
    input: {
      kind: "character" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void
  ];
  saveVolumeOutline: [
    input: { volumeId: string; outline: string },
    completion: (succeeded: boolean) => void
  ];
  savePlotPointContent: [
    input: {
      plotPointId: LongArcId;
      field: "summary";
      content: string;
    },
    completion: (succeeded: boolean) => void
  ];
  mutation: [
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion
  ];
}>();

interface LongDocumentState {
  bookId: string;
  file: LongWorkspaceFileReference;
  content: string;
  savedContent: string;
  workspaceRevision: number;
  projectRevision: number;
  loading: boolean;
  saving: boolean;
  loaded: boolean;
  loadError: string | null;
}

interface LongVolumeOutlineDraft {
  content: string;
  savedContent: string;
  saving: boolean;
}

interface LongStructureTitleTarget {
  kind: "worldbuilding" | "volume" | "plotPoint" | "chapterCard";
  id: string;
  title: string;
  inputLabel: string;
  emptyMessage: string;
}

interface LongNavigationDeleteTarget {
  kind: "character" | "volume" | "plotPoint" | "chapterCard";
  id: string;
  title: string;
  label: string;
  description: string;
}

const DOCUMENT_PAGE_CHARACTERS = 256 * 1024;
const RECOVERY_STORAGE_PREFIX = "deepwrite:long-editor-recovery:v1:";
const RECOVERY_WRITE_DEBOUNCE_MS = 300;
const RECOVERY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERY_MAX_RECORD_CHARACTERS = 4 * 1024 * 1024;
const RECOVERY_CLOCK_SKEW_MS = 5 * 60 * 1000;
const LONG_EDITOR_DIVIDER_WIDTH = 7;
const LONG_EDITOR_DEFAULT_LIST_RATIO = 0.38;
const LONG_EDITOR_ENTRY_CONTENT_MIN_WIDTH = 240;
const LONG_EDITOR_STORY_DETAIL_MIN_WIDTH = 320;

type LongEditorResizablePane = "entry-list" | "story-plot-list";

interface LongEditorRecoveryRecord {
  schemaVersion: 1;
  bookId: string;
  fileId: LongFileId;
  filePath: string;
  content: string;
  savedContent: string;
  baseRevision: LongFileRevision;
  workspaceRevision: number;
  projectRevision: number;
  timestamp: number;
}

const documentStates = ref<Record<string, LongDocumentState>>({});
const staleRecoveryByKey = ref<Record<string, LongEditorRecoveryRecord>>({});
const activeRole = ref<LongWorkspaceFileRole>("content");
const activeFileId = ref<string | null>(null);
const activeWorldbuildingItemId = ref<string | null>(null);
const pendingWorldbuildingItemId = ref<string | null>(null);
const pendingWorldbuildingOverview = ref(false);
const activeStoryPlotId = ref<string | null>(null);
const pendingStoryPlotId = ref<string | null>(null);
const pendingStoryPlotDeleteId = ref<string | null>(null);
const storyPlotActionMenuId = ref<string | null>(null);
const longEditorDocumentElement = ref<HTMLElement | null>(null);
const storyPlotLayoutElement = ref<HTMLElement | null>(null);
const longEditorPanePreferences = loadLongEditorPanePreferences(
  window.localStorage
);
const preferredEntryListWidth = ref(
  longEditorPanePreferences.entryListWidth
);
const preferredStoryPlotListWidth = ref(
  longEditorPanePreferences.storyPlotListWidth
);
const entryListWidth = ref<number>();
const storyPlotListWidth = ref<number>();
const entryListMaxWidth = ref(LONG_EDITOR_LIST_MAX_WIDTH);
const storyPlotListMaxWidth = ref(LONG_EDITOR_LIST_MAX_WIDTH);
const resizingLongEditorPane = ref<LongEditorResizablePane | null>(null);
let entryListResizeObserver: ResizeObserver | undefined;
let storyPlotListResizeObserver: ResizeObserver | undefined;
let storyPlotSelectionRequest = 0;
const pendingCharacterId = ref<string | null>(null);
const pendingRole = ref<LongWorkspaceFileRole | null>(null);
const pendingFileId = ref<string | null>(null);
const heldSelectionFile = ref<LongWorkspaceSelectionFile | null>(null);
const foreshadowingWorkspace = ref<{
  focusTarget(threadId?: string, beatId?: string): Promise<boolean>;
} | null>(null);
let worldbuildingPrefetchRequest = 0;
let selectionPrefetchRequest = 0;
const activeBookLineVolumeId = ref<string | null>(null);
const activeBookLineContentTab = ref<"outline" | "foreshadowing">(
  "outline"
);
const activePlotPointTab = ref<
  "summary" | "storyline" | "foreshadowing"
>("summary");
const volumeOutlineDrafts = ref<Record<string, LongVolumeOutlineDraft>>({});
const plotPointSummaryDrafts = ref<Record<string, LongVolumeOutlineDraft>>({});
const pendingWorldbuildingDeleteId = ref<string | null>(null);
const characterNameDraft = ref("");
const characterNameSaving = ref(false);
const structureTitleDraft = ref("");
const structureTitleSaving = ref(false);
const worldbuildingDeleteDialog = ref<HTMLElement>();
const worldbuildingDeleteCancelButton = ref<HTMLButtonElement>();
const navigationDeleteTarget = ref<LongNavigationDeleteTarget | null>(null);
const navigationDeletePending = ref(false);
const navigationDeleteDialog = ref<HTMLElement>();
const navigationDeleteCancelButton = ref<HTMLButtonElement>();
const workspaceSavePending = ref(false);
const editorInput = ref<HTMLTextAreaElement | null>(null);
const editorToolsElement = ref<HTMLElement>();
const findPanelElement = ref<HTMLElement>();
const findInput = ref<HTMLInputElement>();
const viewMode = ref<"edit" | "preview">("edit");
const findPanelOpen = ref(false);
const findPanelMode = ref<"find" | "replace">("find");
const searchQuery = ref("");
const replacementText = ref("");
const currentMatchIndex = ref(-1);
const searchAnchor = ref(0);
const textHistory = createBoundedTextHistory();
const historyVersion = ref(0);
let pendingEditorInput: {
  selectionBefore: TextSelectionRange;
  inputType: string;
  timestamp: number;
} | null = null;

function setEditorInputElement(element: HTMLTextAreaElement | null): void {
  editorInput.value = element;
}

const requestClockByFile = new Map<string, number>();
const inflightDocumentLoads = new Map<string, Promise<void>>();
const recoveryWriteTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const recoveryWriteWarningKeys = new Set<string>();
let requestClock = 0;
let activeSavePromise: Promise<boolean> | null = null;
let worldbuildingDeletePreviousFocus: HTMLElement | null = null;
let navigationDeletePreviousFocus: HTMLElement | null = null;
let volumeDraftBookId = "";
let worldbuildingSelectionRequest = 0;
interface LongEditorSearchMatch {
  start: number;
  end: number;
}

const currentSelectionFile = computed<LongWorkspaceSelectionFile | undefined>(
  () => {
    const selection = props.selection;
    if (!selection) return undefined;
    const explicitlySelectedFile = selection.preferredFileId
      ? selection.files.find(
          ({ file }) => file.id === selection.preferredFileId
        )
      : undefined;
    if (selection.worldbuildingFormat === "list") {
      const selectedItemId =
        selection.worldbuildingItemId !== undefined
          ? selection.worldbuildingItemId
          : activeWorldbuildingItemId.value;
      const item = selection.worldbuildingItems?.find(
        ({ id }) => id === selectedItemId
      );
      return explicitlySelectedFile ?? (item
        ? selection.files.find(({ file }) => file.id === item.file.id)
        : selection.files.find(({ role }) => role === "overview") ??
            selection.files[0]);
    }
    if (
      selection.plotPointId &&
      activePlotPointTab.value === "storyline"
    ) {
      if (explicitlySelectedFile) return explicitlySelectedFile;
      const item = selection.storyPlots?.find(
        ({ id }) => id === activeStoryPlotId.value
      );
      return item
        ? selection.files.find(({ file }) => file.id === item.file.id)
        : undefined;
    }
    if (
      selection.plotPointId &&
      (activePlotPointTab.value === "summary" ||
        activePlotPointTab.value === "foreshadowing")
    ) {
      return selection.files.find(({ role }) => role === "book-line");
    }
    return (
      explicitlySelectedFile ??
      selection.files.find(({ file }) => file.id === activeFileId.value) ??
      selection.files.find(({ role }) => role === activeRole.value) ??
      selection.files[0]
    );
  }
);

function stateKey(fileId: string, bookId = props.bookId): string {
  return `${bookId}\u0000${fileId}`;
}

const currentState = computed<LongDocumentState | undefined>(() => {
  const selectedFile = currentSelectionFile.value;
  return selectedFile
    ? documentStates.value[stateKey(selectedFile.file.id)]
    : undefined;
});
const isDocumentSwitchPending = computed(() => {
  const target = currentSelectionFile.value;
  if (!target) return false;
  const targetState = documentStates.value[stateKey(target.file.id)];
  if (targetState?.loaded || Boolean(targetState?.content)) return false;
  const held = heldSelectionFile.value;
  if (!held || held.file.id === target.file.id) return false;
  const heldState = documentStates.value[stateKey(held.file.id)];
  return Boolean(heldState?.loaded || heldState?.content);
});
const displayDocumentState = computed<LongDocumentState | undefined>(() => {
  if (isDocumentSwitchPending.value && heldSelectionFile.value) {
    return documentStates.value[stateKey(heldSelectionFile.value.file.id)];
  }
  return currentState.value;
});
const showEditorLoading = computed(() => {
  if (isDocumentSwitchPending.value) return false;
  const state = currentState.value;
  return Boolean(state?.loading && !state.loaded && !state.content);
});
const showEditorLoadError = computed(() => {
  if (isDocumentSwitchPending.value) return false;
  const state = currentState.value;
  return Boolean(state?.loadError && !state.loaded && !state.content);
});
const currentIsBookLineWorkspace = computed(
  () =>
    props.selection?.key === "plot-design:book-line" &&
    props.selection.root === "plot_design"
);
const currentIsPlotPointWorkspace = computed(
  () =>
    props.selection?.key.startsWith("plot-design:plot-points:") &&
    props.selection.root === "plot_design"
);
const currentIsChapterCardWorkspace = computed(
  () =>
    props.selection?.key.startsWith("plot-design:chapter-cards:") &&
    props.selection.root === "plot_design"
);
const currentIsForeshadowingWorkspace = computed(
  () =>
    props.selection?.key === "plot-design:foreshadowing" &&
    props.selection.root === "plot_design"
);
const currentIsCharacterGroup = computed(
  () =>
    props.selection?.root === "character_design" &&
    Boolean(props.selection.characterGroup)
);
const currentIsCharacterDocument = computed(
  () =>
    props.selection?.root === "character_design" &&
    Boolean(props.selection.characterId)
);
const currentEmptyCollection = computed<{
  icon: "file" | "user";
  title: string;
  description: string;
  buttonLabel: string;
  action: "character" | "plotPoint" | "chapterCard";
} | null>(() => {
  const selection = props.selection;
  if (
    currentIsCharacterGroup.value &&
    selection?.characterTabs?.length === 0
  ) {
    return {
      icon: "user",
      title: `还没有${selection.title}`,
      description: currentUsesLeftTreeCharacter.value
        ? "新建人物后，可从左侧树选择并编辑人物档案。"
        : "新建人物后，可通过条目导航切换并编辑人物档案。",
      buttonLabel: "新建第一个人物",
      action: "character"
    };
  }
  if (
    currentIsPlotPointWorkspace.value &&
    selection?.plotPointTabs?.length === 0
  ) {
    return {
      icon: "file",
      title: "还没有剧情点",
      description: currentUsesLeftTreePlot.value
        ? "新建剧情点后，可从左侧树选择并编辑内容。"
        : "新建剧情点后，可通过条目导航切换并编辑内容。",
      buttonLabel: "新建第一个剧情点",
      action: "plotPoint"
    };
  }
  if (
    currentIsChapterCardWorkspace.value &&
    selection?.chapterCardTabs?.length === 0
  ) {
    return {
      icon: "file",
      title: "还没有章卡",
      description: currentUsesLeftTreePlot.value
        ? "新建章卡后，可从左侧树选择并编辑内容。"
        : "新建章卡后，可通过条目导航切换并编辑内容。",
      buttonLabel: "新建第一张章卡",
      action: "chapterCard"
    };
  }
  return null;
});

function createFirstCollectionItem(): void {
  const action = currentEmptyCollection.value?.action;
  if (action === "character") {
    emit("createCharacter");
  } else if (action === "plotPoint") {
    emit("createPlotPoint");
  } else if (action === "chapterCard") {
    emit("createChapterCard");
  }
}
const currentStructureTitleTarget = computed<LongStructureTitleTarget | null>(
  () => {
    if (currentIsPlotPointWorkspace.value && currentPlotPoint.value) {
      return {
        kind: "plotPoint",
        id: currentPlotPoint.value.id,
        title: currentPlotPoint.value.title,
        inputLabel: "剧情点标题",
        emptyMessage: "剧情点标题不能为空。"
      };
    }
    if (currentIsVolumeOutline.value && currentBookLineVolume.value) {
      return {
        kind: "volume",
        id: currentBookLineVolume.value.id,
        title: currentBookLineVolume.value.title,
        inputLabel: "分卷名称",
        emptyMessage: "分卷名称不能为空。"
      };
    }
    if (
      (currentIsChapterCardWorkspace.value ||
        props.selection?.root === "draft") &&
      props.selection?.chapterCardId
    ) {
      const chapter = props.workspaceIndex?.plot.chapterCards.find(
        ({ id }) => id === props.selection?.chapterCardId
      );
      if (chapter) {
        return {
          kind: "chapterCard",
          id: chapter.id,
          title: chapter.title,
          inputLabel: "章卡标题",
          emptyMessage: "章卡标题不能为空。"
        };
      }
    }
    if (
      props.selection?.root === "worldbuilding" &&
      props.selection.key.startsWith("worldbuilding:")
    ) {
      const categoryId = props.selection.key.slice("worldbuilding:".length);
      const category = props.workspaceIndex?.worldbuilding.find(
        ({ id }) => id === categoryId
      );
      if (category) {
        return {
          kind: "worldbuilding",
          id: category.id,
          title: category.title,
          inputLabel: "世界观分类名称",
          emptyMessage: "世界观分类名称不能为空。"
        };
      }
    }
    return null;
  }
);
const currentStructureTitleReadOnly = computed(() => {
  const target = currentStructureTitleTarget.value;
  if (!target) return true;
  return Boolean(
    props.locked || currentReadOnly.value || structureTitleSaving.value
  );
});
const orderedBookLineVolumes = computed(() =>
  [...(props.workspaceIndex?.plot.volumes ?? [])].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id)
  )
);
const currentBookLineVolume = computed(
  () =>
    orderedBookLineVolumes.value.find(
      ({ id }) => id === activeBookLineVolumeId.value
    ) ?? null
);
const currentPlotPoint = computed(
  () =>
    props.workspaceIndex?.plot.arcs.find(
      ({ id }) => id === props.selection?.plotPointId
    ) ?? null
);
const currentChapterCard = computed(
  () =>
    props.workspaceIndex?.plot.chapterCards.find(
      ({ id }) => id === props.selection?.chapterCardId
    ) ?? null
);
const currentNavigationDeleteTarget = computed<LongNavigationDeleteTarget | null>(
  () => {
    const index = props.workspaceIndex;
    const selection = props.selection;
    if (!index || !selection) return null;
    if (currentIsCharacterGroup.value && selection.characterId) {
      const character = index.characters.find(
        ({ id }) => id === selection.characterId
      );
      if (!character) return null;
      const eventReferences = index.plot.storyEvents.filter((event) =>
        event.characterIds.includes(character.id)
      ).length;
      const referenceCopy =
        eventReferences > 0
          ? `，并从 ${eventReferences} 个故事事件中移除人物引用`
          : "";
      return {
        kind: "character",
        id: character.id,
        title: character.name,
        label: "人物",
        description: `将永久删除该人物的核心档案、人物关系、当前状态和历史轨迹${referenceCopy}。`
      };
    }
    if (currentIsBookLineWorkspace.value && currentBookLineVolume.value) {
      const volume = currentBookLineVolume.value;
      const plotPointCount = index.plot.arcs.filter(
        ({ volumeId }) => volumeId === volume.id
      ).length;
      const chapterCount = index.plot.chapterCards.filter(
        ({ volumeId }) => volumeId === volume.id
      ).length;
      return {
        kind: "volume",
        id: volume.id,
        title: volume.title,
        label: "分卷",
        description: `将永久删除该分卷，以及其中 ${plotPointCount} 个剧情点、${chapterCount} 张章卡及对应正文文件和关联数据。`
      };
    }
    if (currentIsPlotPointWorkspace.value && currentPlotPoint.value) {
      const plotPoint = currentPlotPoint.value;
      return {
        kind: "plotPoint",
        id: plotPoint.id,
        title: plotPoint.title,
        label: "剧情点",
        description:
          "将永久删除该剧情点、相关事件和伏笔关联；已关联章卡会保留并解除关联。"
      };
    }
    if (currentIsChapterCardWorkspace.value && currentChapterCard.value) {
      const chapterCard = currentChapterCard.value;
      return {
        kind: "chapterCard",
        id: chapterCard.id,
        title: chapterCard.title,
        label: "章卡",
        description:
          "将永久删除该章卡、章节正文、章末人物状态、下一章接续包，以及相关剧情落点和伏笔触点。"
      };
    }
    return null;
  }
);
const currentVolumeOutlineDraft = computed(() => {
  const volumeId =
    currentIsBookLineWorkspace.value &&
    activeBookLineContentTab.value === "outline"
    ? currentBookLineVolume.value?.id
    : undefined;
  return volumeId ? volumeOutlineDrafts.value[volumeId] : undefined;
});
const currentPlotPointDraft = computed(() => {
  const plotPointId = currentPlotPoint.value?.id;
  if (!plotPointId || activePlotPointTab.value !== "summary") {
    return undefined;
  }
  return plotPointSummaryDrafts.value[plotPointId];
});
const currentChapterCardCommitted = computed(() => {
  const chapterCardId = currentChapterCard.value?.id;
  return Boolean(
    chapterCardId &&
      props.workspaceIndex?.chapters.some(
        (entry) =>
          entry.chapterCardId === chapterCardId && entry.commitId !== null
      )
  );
});

const currentIsCommittedEditableDocument = computed(
  () =>
    currentChapterCardCommitted.value &&
    ((props.selection?.root === "draft" &&
      currentSelectionFile.value?.role === "body") ||
      (currentIsChapterCardWorkspace.value &&
        currentSelectionFile.value?.role === "card"))
);
const currentCommittedEditNotice = computed(() =>
  currentIsChapterCardWorkspace.value
    ? "章卡已有连续性记录；仍可编辑、移动或删除，删除时会同时清理该章正文与记录。"
    : "本章已有连续性记录；记录仅供参考，不限制正文修改。"
);
const currentIsVolumeOutline = computed(
  () =>
    currentIsBookLineWorkspace.value &&
    currentBookLineVolume.value !== null &&
    activeBookLineContentTab.value === "outline"
);
const currentIsVolumeForeshadowing = computed(
  () =>
    currentIsBookLineWorkspace.value &&
    currentBookLineVolume.value !== null &&
    activeBookLineContentTab.value === "foreshadowing"
);
const currentIsPlotPointSummary = computed(
  () =>
    currentIsPlotPointWorkspace.value &&
    currentPlotPoint.value !== null &&
    activePlotPointTab.value === "summary"
);
const currentIsPlotPointStoryline = computed(
  () =>
    currentIsPlotPointWorkspace.value &&
    currentPlotPoint.value !== null &&
    activePlotPointTab.value === "storyline"
);
const currentIsPlotPointForeshadowing = computed(
  () =>
    currentIsPlotPointWorkspace.value &&
    currentPlotPoint.value !== null &&
    activePlotPointTab.value === "foreshadowing"
);
const currentIsForeshadowingView = computed(
  () =>
    currentIsForeshadowingWorkspace.value ||
    currentIsVolumeForeshadowing.value ||
    currentIsPlotPointForeshadowing.value
);
const currentForeshadowingMode = computed<
  "overview" | "volume" | "plotPoint"
>(() =>
    currentIsForeshadowingWorkspace.value
      ? "overview"
      : currentIsVolumeForeshadowing.value
        ? "volume"
        : "plotPoint"
);
const currentForeshadowingVolumeId = computed(
  () => {
    if (currentIsVolumeForeshadowing.value) {
      return currentBookLineVolume.value?.id;
    }
    if (currentIsPlotPointForeshadowing.value) {
      return currentPlotPoint.value?.volumeId;
    }
    return undefined;
  }
);
const currentIsChapterCardContent = computed(
  () =>
    currentIsChapterCardWorkspace.value &&
    currentChapterCard.value !== null
);
const currentIsStructuredText = computed(
  () => currentIsVolumeOutline.value || currentIsPlotPointSummary.value
);
const currentStoryPlots = computed(
  () => props.selection?.storyPlots ?? []
);
const currentStoryPlot = computed(
  () =>
    currentStoryPlots.value.find(
      ({ id }) => id === activeStoryPlotId.value
    ) ?? null
);
const pendingStoryPlotDelete = computed(
  () =>
    currentStoryPlots.value.find(
      ({ id }) => id === pendingStoryPlotDeleteId.value
    ) ?? null
);
const isDocumentContentBusy = computed(() => {
  if (isDocumentSwitchPending.value) return true;
  if (
    currentIsStructuredText.value ||
    currentIsForeshadowingView.value
  ) {
    return false;
  }
  const state = currentState.value;
  return Boolean(state?.loading || (state && !state.loaded));
});
const currentReadOnly = computed(() => {
  const selectedFile = currentSelectionFile.value;
  return Boolean(
    props.locked ||
      selectedFile?.readOnly ||
      (selectedFile && !isEditableLongFile(selectedFile.file))
  );
});
const currentDirty = computed(
  () => {
    if (currentIsVolumeForeshadowing.value) {
      const volumeId = currentBookLineVolume.value?.id;
      const draft = volumeId
        ? volumeOutlineDrafts.value[volumeId]
        : undefined;
      return Boolean(draft && draft.content !== draft.savedContent);
    }
    if (currentIsPlotPointForeshadowing.value) {
      const plotPointId = currentPlotPoint.value?.id;
      const summaryDraft = plotPointId
        ? plotPointSummaryDrafts.value[plotPointId]
        : undefined;
      return Boolean(
        summaryDraft && summaryDraft.content !== summaryDraft.savedContent
      );
    }
    if (currentIsStructuredText.value) {
      const draft =
        currentPlotPointDraft.value ??
        currentVolumeOutlineDraft.value;
      return Boolean(draft && draft.content !== draft.savedContent);
    }
    return (
      Boolean(currentState.value?.loaded) &&
      currentState.value?.content !== currentState.value?.savedContent
    );
  }
);
const currentStaleRecovery = computed<LongEditorRecoveryRecord | null>(() => {
  const selectedFile = currentSelectionFile.value;
  return selectedFile
    ? staleRecoveryByKey.value[stateKey(selectedFile.file.id)] ?? null
    : null;
});
const currentStaleRecoveryPreview = computed(() => {
  const content = currentStaleRecovery.value?.content ?? "";
  return content.length > 600 ? `${content.slice(0, 600)}…` : content;
});
const currentIsWorldbuildingList = computed(
  () =>
    props.selection?.root === "worldbuilding" &&
    props.selection.worldbuildingFormat === "list"
);
const currentWorldbuildingItemLayout = computed(
  () =>
    props.workspaceIndex?.featureSettings.worldbuildingItemLayout ??
    "top-tabs"
);
const currentUsesLeftTreeWorldbuilding = computed(
  () =>
    currentIsWorldbuildingList.value &&
    currentWorldbuildingItemLayout.value === "left-tree"
);
const currentUsesTopWorldbuildingTabs = computed(
  () =>
    currentIsWorldbuildingList.value &&
    currentWorldbuildingItemLayout.value === "top-tabs"
);
const currentUsesRightWorldbuildingList = computed(
  () =>
    currentIsWorldbuildingList.value &&
    currentWorldbuildingItemLayout.value === "right-list"
);
const currentSharedItemLayout = computed(
  () =>
    props.workspaceIndex?.featureSettings.characterAndContinuityItemLayout ??
    "top-tabs"
);
const currentPlotItemLayout = computed(
  () => props.workspaceIndex?.featureSettings.plotItemLayout ?? "top-tabs"
);
const currentUsesLeftTreeCharacter = computed(
  () =>
    currentIsCharacterGroup.value && currentSharedItemLayout.value === "left-tree"
);
const currentUsesLeftTreePlot = computed(
  () =>
    (currentIsBookLineWorkspace.value ||
      currentIsPlotPointWorkspace.value ||
      currentIsChapterCardWorkspace.value) &&
    currentPlotItemLayout.value === "left-tree"
);
const currentUsesLeftTreeContinuity = computed(
  () =>
    props.selection?.root === "continuity_ledger" &&
    currentSharedItemLayout.value === "left-tree"
);
const currentUsesTopCharacterTabs = computed(
  () =>
    currentIsCharacterGroup.value && currentSharedItemLayout.value === "top-tabs"
);
const currentUsesRightCharacterList = computed(
  () =>
    currentIsCharacterGroup.value && currentSharedItemLayout.value === "right-list"
);
const currentCharacterNavigationItems = computed(
  () => props.selection?.characterTabs ?? []
);
const currentUsesTopPlotTabs = computed(
  () =>
    (currentIsBookLineWorkspace.value ||
      currentIsPlotPointWorkspace.value ||
      currentIsChapterCardWorkspace.value) &&
    currentPlotItemLayout.value === "top-tabs"
);
const currentUsesRightBookLineList = computed(
  () =>
    currentIsBookLineWorkspace.value && currentPlotItemLayout.value === "right-list"
);
const currentUsesRightPlotPointList = computed(
  () =>
    currentIsPlotPointWorkspace.value &&
    currentPlotItemLayout.value === "right-list"
);
const currentUsesRightChapterCardList = computed(
  () =>
    currentIsChapterCardWorkspace.value &&
    currentPlotItemLayout.value === "right-list"
);
const currentUsesTopContinuityTabs = computed(
  () =>
    props.selection?.root === "continuity_ledger" &&
    currentSharedItemLayout.value === "top-tabs"
);
const currentUsesRightContinuityList = computed(
  () =>
    props.selection?.root === "continuity_ledger" &&
    currentSharedItemLayout.value === "right-list"
);
const currentContinuityNavigationItems = computed(() =>
  props.selection?.root === "continuity_ledger"
    ? props.selection.files.map((file) => ({
        id: file.file.id,
        label: file.label
      }))
    : []
);
const currentUsesAnyRightEntryList = computed(
  () =>
    currentUsesRightWorldbuildingList.value ||
    currentUsesRightCharacterList.value ||
    currentUsesRightBookLineList.value ||
    currentUsesRightPlotPointList.value ||
    currentUsesRightChapterCardList.value ||
    currentUsesRightContinuityList.value
);
const entryListGridStyle = computed(() =>
  entryListWidth.value === undefined
    ? undefined
    : { "--long-entry-list-width": `${entryListWidth.value}px` }
);
const storyPlotListGridStyle = computed(() =>
  storyPlotListWidth.value === undefined
    ? undefined
    : { "--long-story-plot-list-width": `${storyPlotListWidth.value}px` }
);

function longEditorPaneContainer(
  pane: LongEditorResizablePane
): HTMLElement | null {
  return pane === "entry-list"
    ? longEditorDocumentElement.value
    : storyPlotLayoutElement.value;
}

function longEditorPaneContentMinWidth(pane: LongEditorResizablePane): number {
  if (pane === "story-plot-list") {
    return LONG_EDITOR_STORY_DETAIL_MIN_WIDTH;
  }
  return currentIsPlotPointStoryline.value
    ? LONG_EDITOR_STORY_DETAIL_MIN_WIDTH +
        LONG_EDITOR_LIST_MIN_WIDTH +
        LONG_EDITOR_DIVIDER_WIDTH
    : LONG_EDITOR_ENTRY_CONTENT_MIN_WIDTH;
}

function preferredLongEditorPaneWidth(
  pane: LongEditorResizablePane
): number | undefined {
  return pane === "entry-list"
    ? preferredEntryListWidth.value
    : preferredStoryPlotListWidth.value;
}

function resolveLongEditorPaneWidth(
  pane: LongEditorResizablePane,
  requestedWidth?: number
): { width: number; max: number } | undefined {
  const container = longEditorPaneContainer(pane);
  if (!container) return undefined;
  const containerWidth = container.getBoundingClientRect().width;
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return undefined;
  const availableMax = Math.max(
    LONG_EDITOR_LIST_MIN_WIDTH,
    Math.floor(
      containerWidth -
        longEditorPaneContentMinWidth(pane) -
        LONG_EDITOR_DIVIDER_WIDTH
    )
  );
  const max = Math.min(LONG_EDITOR_LIST_MAX_WIDTH, availableMax);
  const target =
    requestedWidth ??
    preferredLongEditorPaneWidth(pane) ??
    Math.round(containerWidth * LONG_EDITOR_DEFAULT_LIST_RATIO);
  return {
    width: Math.round(
      Math.min(Math.max(target, LONG_EDITOR_LIST_MIN_WIDTH), max)
    ),
    max
  };
}

function setDisplayedLongEditorPaneWidth(
  pane: LongEditorResizablePane,
  requestedWidth?: number
): void {
  const resolved = resolveLongEditorPaneWidth(pane, requestedWidth);
  if (!resolved) return;
  if (pane === "entry-list") {
    entryListWidth.value = resolved.width;
    entryListMaxWidth.value = resolved.max;
    return;
  }
  storyPlotListWidth.value = resolved.width;
  storyPlotListMaxWidth.value = resolved.max;
}

function reconcileLongEditorPaneWidths(): void {
  if (currentUsesAnyRightEntryList.value) {
    setDisplayedLongEditorPaneWidth("entry-list");
  }
  if (currentIsPlotPointStoryline.value) {
    setDisplayedLongEditorPaneWidth("story-plot-list");
  }
}

function persistLongEditorPaneWidths(): void {
  saveLongEditorPanePreferences(window.localStorage, {
    ...(preferredEntryListWidth.value === undefined
      ? {}
      : { entryListWidth: preferredEntryListWidth.value }),
    ...(preferredStoryPlotListWidth.value === undefined
      ? {}
      : { storyPlotListWidth: preferredStoryPlotListWidth.value })
  });
}

function commitLongEditorPaneWidth(pane: LongEditorResizablePane): void {
  if (pane === "entry-list") {
    preferredEntryListWidth.value = entryListWidth.value;
  } else {
    preferredStoryPlotListWidth.value = storyPlotListWidth.value;
  }
  persistLongEditorPaneWidths();
}

function handleLongEditorPaneResizeMove(event: PointerEvent): void {
  const pane = resizingLongEditorPane.value;
  const container = pane ? longEditorPaneContainer(pane) : null;
  if (!pane || !container) return;
  const bounds = container.getBoundingClientRect();
  setDisplayedLongEditorPaneWidth(pane, bounds.right - event.clientX);
}

function stopLongEditorPaneResize(): void {
  const pane = resizingLongEditorPane.value;
  resizingLongEditorPane.value = null;
  window.removeEventListener("pointermove", handleLongEditorPaneResizeMove);
  window.removeEventListener("pointerup", stopLongEditorPaneResize);
  window.removeEventListener("pointercancel", stopLongEditorPaneResize);
  document.documentElement.classList.remove("is-long-editor-pane-resizing");
  if (pane) commitLongEditorPaneWidth(pane);
}

function startLongEditorPaneResize(
  pane: LongEditorResizablePane,
  event: PointerEvent
): void {
  event.preventDefault();
  event.stopPropagation();
  resizingLongEditorPane.value = pane;
  document.documentElement.classList.add("is-long-editor-pane-resizing");
  window.addEventListener("pointermove", handleLongEditorPaneResizeMove);
  window.addEventListener("pointerup", stopLongEditorPaneResize);
  window.addEventListener("pointercancel", stopLongEditorPaneResize);
}

function handleLongEditorPaneResizeKeydown(
  pane: LongEditorResizablePane,
  event: KeyboardEvent
): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const currentWidth =
    pane === "entry-list" ? entryListWidth.value : storyPlotListWidth.value;
  if (currentWidth === undefined) return;
  setDisplayedLongEditorPaneWidth(
    pane,
    currentWidth + (event.key === "ArrowLeft" ? 12 : -12)
  );
  commitLongEditorPaneWidth(pane);
}
const showGenericFileTabs = computed(
  () =>
    Boolean(props.selection && props.selection.files.length > 1) &&
    !currentIsWorldbuildingList.value &&
    !currentIsPlotPointWorkspace.value &&
    !currentIsBookLineWorkspace.value &&
    !currentIsChapterCardWorkspace.value &&
    !currentUsesTopContinuityTabs.value &&
    !currentUsesRightContinuityList.value &&
    !currentUsesLeftTreeContinuity.value
);
const currentWorldbuildingListState = computed<{
  items: Array<{ id: string; title: string }>;
  error: string | null;
}>(() => {
  if (!currentIsWorldbuildingList.value) {
    return { items: [], error: null };
  }
  return {
    items: props.selection?.worldbuildingItems ?? [],
    error: null
  };
});
const currentWorldbuildingItems = computed(
  () => currentWorldbuildingListState.value.items
);
const currentWorldbuildingItem = computed(
  () =>
    currentWorldbuildingItems.value.find(
      ({ id }) => id === activeWorldbuildingItemId.value
    ) ?? null
);
const pendingWorldbuildingDeleteItem = computed(
  () =>
    currentWorldbuildingItems.value.find(
      ({ id }) => id === pendingWorldbuildingDeleteId.value
    ) ?? null
);
const currentVisibleContent = computed(() => {
  if (currentIsPlotPointSummary.value) {
    return currentPlotPointDraft.value?.content ?? "";
  }
  if (currentIsVolumeOutline.value) {
    return currentVolumeOutlineDraft.value?.content ?? "";
  }
  if (isDocumentSwitchPending.value) {
    return displayDocumentState.value?.content ?? "";
  }
  return currentState.value?.content ?? "";
});
const currentDocumentTitle = computed(
  () =>
    (currentIsWorldbuildingList.value &&
    activeWorldbuildingItemId.value === null
      ? "概览"
      : undefined) ??
    (currentIsChapterCardWorkspace.value
      ? currentChapterCard.value?.title
      : undefined) ??
    (currentIsPlotPointWorkspace.value
      ? currentPlotPoint.value?.title
      : undefined) ??
    (currentIsBookLineWorkspace.value
      ? currentBookLineVolume.value?.title
      : undefined) ??
    (currentIsBookLineWorkspace.value
      ? "全书总纲"
      : props.selection?.title ?? "")
);
const currentDocumentFormat = computed(() =>
  currentIsChapterCardContent.value
    ? "章卡内容"
    : currentIsPlotPointStoryline.value
        ? "故事情节"
        : currentIsPlotPointSummary.value
          ? "概要"
          : currentIsVolumeOutline.value
            ? "卷纲"
            : currentIsBookLineWorkspace.value
              ? "全书总纲"
              : currentSelectionFile.value?.label ?? ""
);
const currentSaving = computed(
  () =>
    characterNameSaving.value ||
    structureTitleSaving.value ||
    Boolean(
      currentPlotPointDraft.value?.saving ??
        currentVolumeOutlineDraft.value?.saving ??
        currentState.value?.saving ??
        false
    )
);
const searchMatches = computed<LongEditorSearchMatch[]>(() => {
  const content = currentVisibleContent.value;
  const query = searchQuery.value;
  if (!query) return [];

  const matches: LongEditorSearchMatch[] = [];
  let start = 0;
  while (start <= content.length - query.length) {
    const index = content.indexOf(query, start);
    if (index < 0) break;
    matches.push({ start: index, end: index + query.length });
    start = index + query.length;
  }
  return matches;
});
const searchResultLabel = computed(() => {
  if (!searchQuery.value) return "0/0";
  if (!searchMatches.value.length) return "无结果";
  const current = currentMatchIndex.value >= 0 ? currentMatchIndex.value + 1 : 0;
  return `${current}/${searchMatches.value.length}`;
});
const documentEyebrow = computed(() => {
  const role = currentSelectionFile.value?.role;
  if (props.selection?.root === "draft") {
    if (role === "character-state") return "长篇 · 章节人物状态";
    if (role === "handoff") return "长篇 · 章节交接";
    return "长篇 · 章节正文";
  }
  if (props.selection?.root === "worldbuilding") return "长篇 · 世界设定";
  if (props.selection?.root === "character_design") return "长篇 · 人物档案";
  if (props.selection?.root === "plot_design") return "长篇 · 剧情设计";
  if (props.selection?.root === "continuity_ledger") {
    return "长篇 · 连续性记录";
  }
  return "长篇文稿";
});
const characterCount = ref(
  countNonWhitespaceCharacters(currentVisibleContent.value)
);
let countedVisibleContent = currentVisibleContent.value;
watch(
  currentVisibleContent,
  (nextContent) => {
    if (nextContent === countedVisibleContent) return;
    countedVisibleContent = nextContent;
    characterCount.value = countNonWhitespaceCharacters(nextContent);
  },
  { flush: "post" }
);
const canUseTextTools = computed(
  () =>
    !currentIsForeshadowingView.value &&
    (Boolean(currentState.value?.loaded) ||
      currentIsStructuredText.value) &&
    Boolean(
      !currentIsWorldbuildingList.value ||
        currentWorldbuildingListState.value.error ||
        currentSelectionFile.value
    ) &&
    Boolean(
      !currentIsPlotPointStoryline.value || currentStoryPlot.value
    )
);
const canUndo = computed(() => {
  void historyVersion.value;
  return (
    canUseTextTools.value &&
    !currentReadOnly.value &&
    textHistory.canUndo
  );
});
const canRedo = computed(() => {
  void historyVersion.value;
  return (
    canUseTextTools.value &&
    !currentReadOnly.value &&
    textHistory.canRedo
  );
});
const hasUnsavedChanges = computed(() =>
  Object.values(documentStates.value).some(
    (state) => state.loaded && state.content !== state.savedContent
  ) ||
  Object.values(volumeOutlineDrafts.value).some(
    (draft) => draft.content !== draft.savedContent
  ) ||
  Object.values(plotPointSummaryDrafts.value).some(
    (draft) => draft.content !== draft.savedContent
  )
);

function replaceDocumentState(key: string, state: LongDocumentState): void {
  documentStates.value = {
    ...documentStates.value,
    [key]: state
  };
}

function recoveryStorageKey(bookId: string, fileId: string): string {
  return `${RECOVERY_STORAGE_PREFIX}${encodeURIComponent(bookId)}:${encodeURIComponent(fileId)}`;
}

function resolveRecoveryStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function removeStaleRecoveryState(key: string): void {
  if (!staleRecoveryByKey.value[key]) return;
  const next = { ...staleRecoveryByKey.value };
  delete next[key];
  staleRecoveryByKey.value = next;
}

function cancelRecoveryWrite(key: string): void {
  const timer = recoveryWriteTimers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    recoveryWriteTimers.delete(key);
  }
}

function removeStoredRecovery(bookId: string, fileId: string): void {
  try {
    resolveRecoveryStorage()?.removeItem(recoveryStorageKey(bookId, fileId));
  } catch {
    // A disabled or unavailable localStorage must never break the editor.
  }
}

function clearRecoveryRecordForKey(
  key: string,
  bookId: string,
  fileId: string
): void {
  cancelRecoveryWrite(key);
  removeStoredRecovery(bookId, fileId);
  removeStaleRecoveryState(key);
  recoveryWriteWarningKeys.delete(key);
}

function parseStoredRecovery(
  raw: string,
  expectedBookId: string,
  expectedFileId: LongFileId
): LongEditorRecoveryRecord | null {
  if (raw.length > RECOVERY_MAX_RECORD_CHARACTERS) return null;
  try {
    const value = JSON.parse(raw) as Partial<LongEditorRecoveryRecord>;
    const revision = LongFileRevisionSchema.safeParse(value.baseRevision);
    const now = Date.now();
    if (
      value.schemaVersion !== 1 ||
      value.bookId !== expectedBookId ||
      value.fileId !== expectedFileId ||
      typeof value.filePath !== "string" ||
      value.filePath.length > 4096 ||
      typeof value.content !== "string" ||
      typeof value.savedContent !== "string" ||
      !revision.success ||
      !Number.isInteger(value.workspaceRevision) ||
      Number(value.workspaceRevision) < 0 ||
      !Number.isInteger(value.projectRevision) ||
      Number(value.projectRevision) < 0 ||
      typeof value.timestamp !== "number" ||
      !Number.isFinite(value.timestamp) ||
      value.timestamp <= 0 ||
      value.timestamp > now + RECOVERY_CLOCK_SKEW_MS ||
      now - value.timestamp > RECOVERY_MAX_AGE_MS
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      bookId: value.bookId,
      fileId: value.fileId,
      filePath: value.filePath,
      content: value.content,
      savedContent: value.savedContent,
      baseRevision: revision.data,
      workspaceRevision: Number(value.workspaceRevision),
      projectRevision: Number(value.projectRevision),
      timestamp: value.timestamp
    };
  } catch {
    return null;
  }
}

function readRecoveryRecord(
  bookId: string,
  fileId: LongFileId
): LongEditorRecoveryRecord | null {
  const storage = resolveRecoveryStorage();
  if (!storage) return null;
  const storageKey = recoveryStorageKey(bookId, fileId);
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null) return null;
    const record = parseStoredRecovery(raw, bookId, fileId);
    if (record) return record;
    storage.removeItem(storageKey);
  } catch {
    // Corrupt or inaccessible recovery state is ignored without blocking load.
  }
  return null;
}

function warnRecoveryWriteFailure(key: string, message: string): void {
  if (recoveryWriteWarningKeys.has(key)) return;
  recoveryWriteWarningKeys.add(key);
  uiMessage.warning(message);
}

function persistRecoveryForKey(key: string): void {
  cancelRecoveryWrite(key);
  const state = documentStates.value[key];
  if (!state || !state.loaded || !isEditableLongFile(state.file)) return;
  if (state.content === state.savedContent) {
    clearRecoveryRecordForKey(key, state.bookId, state.file.id);
    return;
  }

  const record: LongEditorRecoveryRecord = {
    schemaVersion: 1,
    bookId: state.bookId,
    fileId: state.file.id,
    filePath: state.file.path,
    content: state.content,
    savedContent: state.savedContent,
    baseRevision: state.file.revision,
    workspaceRevision: state.workspaceRevision,
    projectRevision: state.projectRevision,
    timestamp: Date.now()
  };
  if (
    state.content.length + state.savedContent.length >
    RECOVERY_MAX_RECORD_CHARACTERS - 16 * 1024
  ) {
    removeStoredRecovery(state.bookId, state.file.id);
    warnRecoveryWriteFailure(
      key,
      "当前长篇文件过大，无法写入本机崩溃恢复副本；请立即手动保存。"
    );
    return;
  }
  const serialized = JSON.stringify(record);
  if (serialized.length > RECOVERY_MAX_RECORD_CHARACTERS) {
    removeStoredRecovery(state.bookId, state.file.id);
    warnRecoveryWriteFailure(
      key,
      "当前长篇文件过大，无法写入本机崩溃恢复副本；请立即手动保存。"
    );
    return;
  }

  const storage = resolveRecoveryStorage();
  if (!storage) {
    warnRecoveryWriteFailure(
      key,
      "本机存储当前不可用，无法保存长篇崩溃恢复副本；请立即手动保存。"
    );
    return;
  }
  try {
    storage.setItem(
      recoveryStorageKey(state.bookId, state.file.id),
      serialized
    );
    recoveryWriteWarningKeys.delete(key);
  } catch {
    // setItem is atomic, but an older value may still exist after quota failure.
    // Removing it prevents a later restart from silently restoring stale text.
    removeStoredRecovery(state.bookId, state.file.id);
    warnRecoveryWriteFailure(
      key,
      "长篇崩溃恢复副本写入失败，请立即手动保存当前文件。"
    );
  }
}

function scheduleRecoveryWrite(key: string): void {
  cancelRecoveryWrite(key);
  recoveryWriteTimers.set(
    key,
    setTimeout(() => {
      recoveryWriteTimers.delete(key);
      persistRecoveryForKey(key);
    }, RECOVERY_WRITE_DEBOUNCE_MS)
  );
}

function flushAllRecoveryRecords(): void {
  for (const key of Object.keys(documentStates.value)) {
    const state = documentStates.value[key];
    if (
      state?.loaded &&
      isEditableLongFile(state.file) &&
      state.content !== state.savedContent
    ) {
      persistRecoveryForKey(key);
    }
  }
}

function updateCurrentContent(content: string): void {
  const state = currentState.value;
  const file = currentSelectionFile.value;
  if (
    !state ||
    !file ||
    currentReadOnly.value ||
    state.loading ||
    !state.loaded ||
    isDocumentSwitchPending.value
  ) {
    return;
  }
  const key = stateKey(file.file.id);
  // `documentStates` is deeply reactive. Mutating this one hot field avoids
  // cloning every open document entry for each keystroke.
  state.content = content;
  if (content === state.savedContent) {
    clearRecoveryRecordForKey(key, state.bookId, state.file.id);
  } else {
    scheduleRecoveryWrite(key);
  }
}

function emitWorldbuildingItemMutation(
  operations: LongWorkspaceOperation[],
  onSuccess?: () => void
): void {
  const index = props.workspaceIndex;
  if (!index || currentReadOnly.value) return;
  emit(
    "mutation",
    {
      baseRevision: index.revision,
      updatedAt: new Date().toISOString(),
      operations,
      documentWrites: []
    },
    {
      succeed() {
        onSuccess?.();
      },
      fail() {},
      appliedButRefreshFailed() {
        onSuccess?.();
      }
    }
  );
}

async function selectWorldbuildingItem(itemId: string): Promise<void> {
  if (
    itemId === activeWorldbuildingItemId.value ||
    itemId === pendingWorldbuildingItemId.value
  ) {
    return;
  }
  const selection = props.selection;
  const item = selection?.worldbuildingItems?.find(
    ({ id }) => id === itemId
  );
  const selectedFile = item
    ? selection?.files.find(({ file }) => file.id === item.file.id)
    : undefined;
  if (!selection || !item || !selectedFile) return;

  const request = ++worldbuildingSelectionRequest;
  const bookId = props.bookId;
  const selectionKey = selection.key;
  pendingWorldbuildingOverview.value = false;
  pendingWorldbuildingItemId.value = itemId;
  await loadWorkspaceDocument(selectedFile);

  if (
    request !== worldbuildingSelectionRequest ||
    props.bookId !== bookId ||
    props.selection?.key !== selectionKey
  ) {
    return;
  }
  pendingWorldbuildingItemId.value = null;
  const state = documentStates.value[stateKey(selectedFile.file.id, bookId)];
  if (state?.loaded || Boolean(state?.content)) {
    activeWorldbuildingItemId.value = itemId;
  }
}

async function selectWorldbuildingOverview(): Promise<void> {
  if (
    activeWorldbuildingItemId.value === null &&
    !pendingWorldbuildingOverview.value &&
    pendingWorldbuildingItemId.value === null
  ) {
    return;
  }
  const selection = props.selection;
  const selectedFile = selection?.files.find(
    ({ role }) => role === "overview"
  );
  if (!selection || !selectedFile) return;

  const request = ++worldbuildingSelectionRequest;
  const bookId = props.bookId;
  const selectionKey = selection.key;
  pendingWorldbuildingItemId.value = null;
  pendingWorldbuildingOverview.value = true;
  await loadWorkspaceDocument(selectedFile);
  if (
    request !== worldbuildingSelectionRequest ||
    props.bookId !== bookId ||
    props.selection?.key !== selectionKey
  ) {
    return;
  }
  pendingWorldbuildingOverview.value = false;
  const state = documentStates.value[stateKey(selectedFile.file.id, bookId)];
  if (state?.loaded || Boolean(state?.content)) {
    activeWorldbuildingItemId.value = null;
  }
}

function addWorldbuildingItem(): void {
  if (currentReadOnly.value) return;
  emit("createWorldbuildingItem");
}

function updateWorldbuildingItemContent(
  itemId: string,
  content: string
): void {
  if (currentWorldbuildingItem.value?.id === itemId) {
    updateCurrentContent(content);
  }
}

function updateVisibleContent(content: string): void {
  const plotPoint = currentPlotPoint.value;
  if (
    currentIsPlotPointWorkspace.value &&
    plotPoint &&
    activePlotPointTab.value === "summary"
  ) {
    const persistedContent = plotPoint.summary ?? "";
    let current = plotPointSummaryDrafts.value[plotPoint.id];
    if (!current) {
      current = {
        content,
        savedContent: persistedContent,
        saving: false
      };
      plotPointSummaryDrafts.value[plotPoint.id] = current;
      return;
    }
    current.content = content;
    return;
  }
  const volume = currentBookLineVolume.value;
  if (currentIsVolumeOutline.value && volume) {
    let current = volumeOutlineDrafts.value[volume.id];
    if (!current) {
      current = {
        content,
        savedContent: volume.summary,
        saving: false
      };
      volumeOutlineDrafts.value[volume.id] = current;
      return;
    }
    current.content = content;
    return;
  }
  const item = currentWorldbuildingItem.value;
  if (
    currentIsWorldbuildingList.value &&
    !currentWorldbuildingListState.value.error &&
    item
  ) {
    updateWorldbuildingItemContent(item.id, content);
    return;
  }
  updateCurrentContent(content);
}

function resetEditorHistory(): void {
  pendingEditorInput = null;
  textHistory.clear();
  historyVersion.value += 1;
}

function selectBookLineOverview(): void {
  activeBookLineVolumeId.value = null;
  activeBookLineContentTab.value = "outline";
  resetEditorHistory();
}

function selectBookLineVolume(volumeId: string): void {
  if (!orderedBookLineVolumes.value.some(({ id }) => id === volumeId)) {
    return;
  }
  activeBookLineVolumeId.value = volumeId;
  activeBookLineContentTab.value = "outline";
  resetEditorHistory();
}

async function selectBookLineContentTab(
  tab: "outline" | "foreshadowing"
): Promise<void> {
  if (tab === "foreshadowing") {
    // 锁定期间编辑器只读、不会产生脏数据，跳过保存以避免与智能体写入冲突
    if (!props.locked && !(await saveAllChanges())) return;
    await nextTick();
  }
  activeBookLineContentTab.value = tab;
  resetEditorHistory();
}

async function selectPlotPointTab(
  tab: "summary" | "storyline" | "foreshadowing"
): Promise<void> {
  if (tab === "foreshadowing" || tab === "storyline") {
    // 同上：锁定时允许只读切换，不再触发保存
    if (!props.locked && !(await saveAllChanges())) return;
    await nextTick();
  }
  activePlotPointTab.value = tab;
  resetEditorHistory();
  if (tab === "storyline") {
    await ensureActiveStoryPlotSelection();
  }
}

function requestCreateVolume(): void {
  if (!currentReadOnly.value) {
    emit("createVolume");
  }
}

function forwardForeshadowingMutation(
  batch: LongWorkspaceOperationBatch,
  completion: LongStructureMutationCompletion
): void {
  emit("mutation", batch, completion);
}

async function saveVolumeOutline(volumeId: string): Promise<boolean> {
  const draft = volumeOutlineDrafts.value[volumeId];
  if (!draft || draft.saving || draft.content === draft.savedContent) {
    return Boolean(draft && !draft.saving);
  }
  const submittedContent = draft.content;
  volumeOutlineDrafts.value = {
    ...volumeOutlineDrafts.value,
    [volumeId]: { ...draft, saving: true }
  };
  return await new Promise<boolean>((resolve) => {
    emit(
      "saveVolumeOutline",
      { volumeId, outline: submittedContent },
      (succeeded) => {
        const latest = volumeOutlineDrafts.value[volumeId];
        if (latest) {
          volumeOutlineDrafts.value = {
            ...volumeOutlineDrafts.value,
            [volumeId]: {
              ...latest,
              ...(succeeded ? { savedContent: submittedContent } : {}),
              saving: false
            }
          };
        }
        resolve(succeeded);
      }
    );
  });
}

async function savePlotPointContent(
  plotPointId: LongArcId,
  field: "summary" = "summary"
): Promise<boolean> {
  const draft = plotPointSummaryDrafts.value[plotPointId];
  if (!draft || draft.saving || draft.content === draft.savedContent) {
    return Boolean(draft && !draft.saving);
  }
  const submittedContent = draft.content;
  plotPointSummaryDrafts.value = {
    ...plotPointSummaryDrafts.value,
    [plotPointId]: { ...draft, saving: true }
  };
  return await new Promise<boolean>((resolve) => {
    emit(
      "savePlotPointContent",
      { plotPointId, field, content: submittedContent },
      (succeeded) => {
        const latest = plotPointSummaryDrafts.value[plotPointId];
        if (latest) {
          plotPointSummaryDrafts.value = {
            ...plotPointSummaryDrafts.value,
            [plotPointId]: {
              ...latest,
              ...(succeeded ? { savedContent: submittedContent } : {}),
              saving: false
            }
          };
        }
        resolve(succeeded);
      }
    );
  });
}

function emitStoryPlotMutation(
  operations: LongWorkspaceOperation[],
  onSuccess?: () => void
): void {
  const index = props.workspaceIndex;
  if (!index || currentReadOnly.value) return;
  emit(
    "mutation",
    {
      baseRevision: index.revision,
      updatedAt: new Date().toISOString(),
      operations,
      documentWrites: []
    },
    {
      succeed() {
        onSuccess?.();
      },
      fail() {},
      appliedButRefreshFailed() {
        onSuccess?.();
      }
    }
  );
}

async function selectStoryPlot(storyPlotId: string): Promise<void> {
  closeStoryPlotActionMenu();
  if (
    storyPlotId === activeStoryPlotId.value ||
    storyPlotId === pendingStoryPlotId.value
  ) {
    return;
  }
  const selection = props.selection;
  const item = selection?.storyPlots?.find(({ id }) => id === storyPlotId);
  const selectedFile = item
    ? selection?.files.find(({ file }) => file.id === item.file.id)
    : undefined;
  if (!selection || !item || !selectedFile) return;

  const request = ++storyPlotSelectionRequest;
  const bookId = props.bookId;
  const selectionKey = selection.key;
  pendingStoryPlotId.value = storyPlotId;
  await loadWorkspaceDocument(selectedFile);
  if (
    request !== storyPlotSelectionRequest ||
    props.bookId !== bookId ||
    props.selection?.key !== selectionKey
  ) {
    return;
  }
  pendingStoryPlotId.value = null;
  const state = documentStates.value[stateKey(selectedFile.file.id, bookId)];
  if (state?.loaded || Boolean(state?.content)) {
    activeStoryPlotId.value = storyPlotId;
  }
}

async function ensureActiveStoryPlotSelection(): Promise<void> {
  const plots = currentStoryPlots.value;
  if (!plots.length) {
    activeStoryPlotId.value = null;
    pendingStoryPlotId.value = null;
    return;
  }
  if (
    activeStoryPlotId.value &&
    plots.some(({ id }) => id === activeStoryPlotId.value)
  ) {
    const selected = plots.find(({ id }) => id === activeStoryPlotId.value);
    const selectedFile = selected
      ? props.selection?.files.find(
          ({ file }) => file.id === selected.file.id
        )
      : undefined;
    if (selectedFile) {
      await loadWorkspaceDocument(selectedFile);
    }
    return;
  }
  await selectStoryPlot(plots[0]!.id);
}

function addStoryPlot(): void {
  const plotPointId = currentPlotPoint.value?.id;
  const plots = currentStoryPlots.value;
  if (!plotPointId || currentReadOnly.value || plots.length >= 200_000) {
    if (plots.length >= 200_000) {
      uiMessage.warning("故事情节数量已达上限。");
    }
    return;
  }
  const usedTitles = new Set(plots.map(({ title }) => title));
  let sequence = plots.length + 1;
  let title = `故事情节 ${sequence}`;
  while (usedTitles.has(title)) {
    sequence += 1;
    title = `故事情节 ${sequence}`;
  }
  const id = createId("storyplot");
  const updatedAt = new Date().toISOString();
  emitStoryPlotMutation(
    [
      {
        type: "storyPlot.create",
        storyPlot: {
          id,
          arcId: plotPointId,
          title,
          order: plots.length + 1,
          file: createEmptyLongMarkdownFileReference(
            longStoryPlotBodyFileId(id),
            longStoryPlotFilePath(id),
            updatedAt
          )
        }
      }
    ],
    () => {
      void selectStoryPlot(id);
    }
  );
}

function updateStoryPlotTitle(
  storyPlotId: string,
  event: Event
): void {
  const title = (event.target as HTMLInputElement).value.trim();
  const current = currentStoryPlots.value.find(
    ({ id }) => id === storyPlotId
  );
  if (!current || currentReadOnly.value) return;
  if (!title) {
    uiMessage.warning("故事情节名称不能为空。");
    (event.target as HTMLInputElement).value = current.title;
    return;
  }
  if (title === current.title) return;
  emitStoryPlotMutation([
    {
      type: "storyPlot.update",
      id: storyPlotId,
      patch: { title }
    }
  ]);
}

function openStoryPlotDelete(storyPlotId: string): void {
  pendingStoryPlotDeleteId.value = storyPlotId;
}

function cancelStoryPlotDelete(): void {
  pendingStoryPlotDeleteId.value = null;
}

function confirmStoryPlotDelete(): void {
  const storyPlotId = pendingStoryPlotDeleteId.value;
  if (!storyPlotId) return;
  pendingStoryPlotDeleteId.value = null;
  emitStoryPlotMutation(
    [
      {
        type: "storyPlot.delete",
        id: storyPlotId,
        cascade: true
      }
    ],
    () => {
      if (activeStoryPlotId.value === storyPlotId) {
        activeStoryPlotId.value = null;
        void ensureActiveStoryPlotSelection();
      }
    }
  );
}

function reorderStoryPlot(
  storyPlotId: string,
  direction: "up" | "down"
): void {
  const plots = currentStoryPlots.value;
  const index = plots.findIndex(({ id }) => id === storyPlotId);
  if (index < 0) return;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= plots.length) return;
  const orderedIds = plots.map(({ id }) => id);
  [orderedIds[index], orderedIds[targetIndex]] = [
    orderedIds[targetIndex]!,
    orderedIds[index]!
  ];
  const arcId = currentPlotPoint.value?.id;
  if (!arcId) return;
  emitStoryPlotMutation([
    {
      type: "storyPlot.reorder",
      arcId,
      orderedIds
    }
  ]);
}

function getEditorSelection(
  fallback = currentVisibleContent.value.length
): TextSelectionRange {
  const input = editorInput.value;
  return {
    start: input?.selectionStart ?? fallback,
    end: input?.selectionEnd ?? fallback
  };
}

function notifyHistoryChanged(): void {
  historyVersion.value += 1;
}

function handleEditorBeforeInput(event: InputEvent): void {
  if (currentReadOnly.value) return;
  if (event.inputType === "historyUndo") {
    event.preventDefault();
    pendingEditorInput = null;
    undo();
    return;
  }
  if (event.inputType === "historyRedo") {
    event.preventDefault();
    pendingEditorInput = null;
    redo();
    return;
  }
  const input = event.currentTarget as HTMLTextAreaElement;
  pendingEditorInput = {
    selectionBefore: {
      start: input.selectionStart ?? currentVisibleContent.value.length,
      end: input.selectionEnd ?? currentVisibleContent.value.length
    },
    inputType: event.inputType,
    timestamp: event.timeStamp
  };
}

function handleEditorInput(event: Event): void {
  if (currentReadOnly.value || isDocumentContentBusy.value) return;
  const input = event.currentTarget as HTMLTextAreaElement;
  const beforeContent = currentVisibleContent.value;
  const afterContent = input.value;
  const selectionAfter = {
    start: input.selectionStart ?? afterContent.length,
    end: input.selectionEnd ?? afterContent.length
  };
  const pending = pendingEditorInput;
  pendingEditorInput = null;
  const historyResult = textHistory.recordInput({
    beforeContent,
    afterContent,
    selectionBefore: pending?.selectionBefore ?? selectionAfter,
    selectionAfter,
    inputType:
      pending?.inputType ??
      (event instanceof InputEvent ? event.inputType : ""),
    timestamp: pending?.timestamp ?? event.timeStamp
  });
  if (historyResult) {
    notifyHistoryChanged();
  }
  updateVisibleContent(afterContent);
  updateVisibleCharacterCount(
    afterContent,
    historyResult?.nonWhitespaceDelta
  );
}

function recordProgrammaticChange(
  nextContent: string,
  selectionAfter: TextSelectionRange
): number | undefined {
  const result = textHistory.recordChange({
    beforeContent: currentVisibleContent.value,
    afterContent: nextContent,
    selectionBefore: getEditorSelection(),
    selectionAfter
  });
  if (result) {
    notifyHistoryChanged();
  }
  return result?.nonWhitespaceDelta;
}

function updateVisibleCharacterCount(
  nextContent: string,
  nonWhitespaceDelta?: number
): void {
  if (currentVisibleContent.value !== nextContent) return;
  countedVisibleContent = nextContent;
  characterCount.value =
    nonWhitespaceDelta === undefined
      ? countNonWhitespaceCharacters(nextContent)
      : Math.max(0, characterCount.value + nonWhitespaceDelta);
}

async function restoreEditorHistory(
  result: TextHistoryRestoreResult
): Promise<void> {
  viewMode.value = "edit";
  updateVisibleContent(result.content);
  updateVisibleCharacterCount(result.content, result.nonWhitespaceDelta);
  await nextTick();
  const input = editorInput.value;
  if (!input) return;
  input.focus({ preventScroll: true });
  input.setSelectionRange(result.start, result.end, "forward");
  scrollEditorToRange(input, result.start);
}

function undo(): void {
  if (!canUndo.value) return;
  pendingEditorInput = null;
  const result = textHistory.undo(currentVisibleContent.value);
  notifyHistoryChanged();
  if (result) void restoreEditorHistory(result);
}

function redo(): void {
  if (!canRedo.value) return;
  pendingEditorInput = null;
  const result = textHistory.redo(currentVisibleContent.value);
  notifyHistoryChanged();
  if (result) void restoreEditorHistory(result);
}

function closeFindPanel(): void {
  findPanelOpen.value = false;
  currentMatchIndex.value = -1;
}

async function toggleFindPanel(mode: "find" | "replace"): Promise<void> {
  if (!canUseTextTools.value) return;
  if (findPanelOpen.value && findPanelMode.value === mode) {
    closeFindPanel();
    return;
  }
  viewMode.value = "edit";
  findPanelMode.value = mode;
  findPanelOpen.value = true;
  searchAnchor.value = editorInput.value?.selectionStart ?? 0;
  currentMatchIndex.value = -1;
  await nextTick();
  findInput.value?.focus({ preventScroll: true });
  findInput.value?.select();
}

function resolveInitialMatchIndex(direction: 1 | -1): number {
  const matches = searchMatches.value;
  if (!matches.length) return -1;
  if (direction === 1) {
    const index = matches.findIndex(
      (match) => match.start >= searchAnchor.value
    );
    return index >= 0 ? index : 0;
  }
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (matches[index]!.end <= searchAnchor.value) return index;
  }
  return matches.length - 1;
}

function scrollEditorToRange(
  input: HTMLTextAreaElement,
  start: number
): void {
  const line = currentVisibleContent.value.slice(0, start).split("\n").length;
  const computedStyle = globalThis.getComputedStyle(input);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight);
  const resolvedLineHeight = Number.isFinite(lineHeight)
    ? lineHeight
    : Number.parseFloat(computedStyle.fontSize) * 1.95;
  input.scrollTop = Math.max(
    0,
    (line - 1) * resolvedLineHeight - input.clientHeight / 3
  );
}

async function selectSearchMatch(index: number): Promise<void> {
  const match = searchMatches.value[index];
  if (!match) return;
  currentMatchIndex.value = index;
  viewMode.value = "edit";
  await nextTick();
  const input = editorInput.value;
  if (!input) return;
  input.focus({ preventScroll: true });
  input.setSelectionRange(match.start, match.end, "forward");
  scrollEditorToRange(input, match.start);
  await nextTick();
  findInput.value?.focus({ preventScroll: true });
}

function findMatch(direction: 1 | -1, quiet = false): void {
  if (!searchQuery.value) {
    if (!quiet) uiMessage.info("请输入要查找的文字");
    return;
  }
  if (!searchMatches.value.length) {
    currentMatchIndex.value = -1;
    if (!quiet) uiMessage.info("未找到匹配文字");
    return;
  }
  const nextIndex =
    currentMatchIndex.value < 0
      ? resolveInitialMatchIndex(direction)
      : (currentMatchIndex.value + direction + searchMatches.value.length) %
        searchMatches.value.length;
  void selectSearchMatch(nextIndex);
}

function handleFindInput(): void {
  currentMatchIndex.value = -1;
  if (searchQuery.value) findMatch(1, true);
}

function replaceCurrentMatch(): void {
  if (currentReadOnly.value) return;
  const index =
    currentMatchIndex.value >= 0
      ? currentMatchIndex.value
      : resolveInitialMatchIndex(1);
  const match = searchMatches.value[index];
  if (!match) {
    uiMessage.info(
      searchQuery.value ? "未找到可替换的文字" : "请输入要替换的文字"
    );
    return;
  }
  const content = currentVisibleContent.value;
  const nextContent =
    content.slice(0, match.start) +
    replacementText.value +
    content.slice(match.end);
  if (nextContent === content) {
    findMatch(1);
    return;
  }
  const nonWhitespaceDelta = recordProgrammaticChange(nextContent, {
    start: match.start + replacementText.value.length,
    end: match.start + replacementText.value.length
  });
  updateVisibleContent(nextContent);
  updateVisibleCharacterCount(nextContent, nonWhitespaceDelta);
  searchAnchor.value = match.start + replacementText.value.length;
  void nextTick(() => findMatch(1, true));
}

function replaceAllMatches(): void {
  if (currentReadOnly.value) return;
  const matches = searchMatches.value;
  if (!searchQuery.value || !matches.length) {
    uiMessage.info(
      searchQuery.value ? "未找到可替换的文字" : "请输入要替换的文字"
    );
    return;
  }
  const content = currentVisibleContent.value;
  let cursor = 0;
  let nextContent = "";
  for (const match of matches) {
    nextContent +=
      content.slice(cursor, match.start) + replacementText.value;
    cursor = match.end;
  }
  nextContent += content.slice(cursor);
  if (nextContent === content) {
    uiMessage.info("查找文字与替换文字相同");
    return;
  }
  const nonWhitespaceDelta = recordProgrammaticChange(nextContent, {
    start: 0,
    end: 0
  });
  updateVisibleContent(nextContent);
  updateVisibleCharacterCount(nextContent, nonWhitespaceDelta);
  searchAnchor.value = 0;
  uiMessage.success(`已替换 ${matches.length} 处文字`);
}

function handleEditorKeydown(event: KeyboardEvent): void {
  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (modifier && key === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (event.ctrlKey && !event.metaKey && key === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (modifier && key === "f" && !(event.metaKey && event.altKey)) {
    event.preventDefault();
    void toggleFindPanel("find");
    return;
  }
  if (
    (event.ctrlKey && !event.metaKey && key === "h") ||
    (event.metaKey && event.altKey && key === "f")
  ) {
    event.preventDefault();
    void toggleFindPanel("replace");
  }
}

function toggleStoryPlotActionMenu(storyPlotId: string): void {
  storyPlotActionMenuId.value =
    storyPlotActionMenuId.value === storyPlotId ? null : storyPlotId;
}

function closeStoryPlotActionMenu(): void {
  storyPlotActionMenuId.value = null;
}

function reorderChapterCard(
  chapterCardId: LongChapterCardId,
  direction: "up" | "down"
): void {
  const tabs = props.selection?.chapterCardTabs ?? [];
  const index = tabs.findIndex(({ id }) => id === chapterCardId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (
    props.locked ||
    index < 0 ||
    targetIndex < 0 ||
    targetIndex >= tabs.length
  ) {
    return;
  }
  const orderedIds = tabs.map(({ id }) => id);
  [orderedIds[index], orderedIds[targetIndex]] = [
    orderedIds[targetIndex]!,
    orderedIds[index]!
  ];
  const volumeId = props.selection?.chapterCardVolumeId;
  if (!volumeId) return;
  emitStoryPlotMutation([
    {
      type: "chapter.reorder",
      volumeId,
      orderedIds
    }
  ]);
}

function openChapterCardDelete(chapterCardId: LongChapterCardId): void {
  if (
    props.locked ||
    currentReadOnly.value
  ) {
    return;
  }
  const chapterCard = props.workspaceIndex?.plot.chapterCards.find(
    ({ id }) => id === chapterCardId
  );
  if (!chapterCard) return;
  showNavigationDelete({
    kind: "chapterCard",
    id: chapterCard.id,
    title: chapterCard.title,
    label: "章卡",
    description:
      "将永久删除该章卡、章节正文、章末人物状态、下一章接续包，以及相关剧情落点和伏笔触点。"
  });
}

function runStoryPlotMenuAction(
  storyPlotId: string,
  action: "up" | "down" | "delete"
): void {
  closeStoryPlotActionMenu();
  if (action === "delete") {
    openStoryPlotDelete(storyPlotId);
    return;
  }
  reorderStoryPlot(storyPlotId, action);
}

function handleWindowPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (
    !editorToolsElement.value?.contains(target) &&
    !findPanelElement.value?.contains(target)
  ) {
    closeFindPanel();
  }
  if (
    storyPlotActionMenuId.value &&
    (!(target instanceof Element) ||
      !target.closest(".long-story-plot-card-actions"))
  ) {
    closeStoryPlotActionMenu();
  }
}

function updateWorldbuildingItemTitle(itemId: string, event: Event): void {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  const title = input.value.trim();
  const current = currentWorldbuildingItems.value.find(
    (item) => item.id === itemId
  );
  if (!current) return;
  if (!title) {
    input.value = current.title;
    uiMessage.warning("世界观条目名称不能为空。");
    return;
  }
  const categoryId = props.selection?.key.slice("worldbuilding:".length);
  if (!categoryId) {
    input.value = current.title;
    return;
  }
  emitWorldbuildingItemMutation(
    [{
      type: "worldbuildingItem.update",
      categoryId,
      id: itemId,
      patch: { title }
    }],
    () => {
      input.value = title;
    }
  );
}

function resetCharacterNameDraft(): void {
  characterNameDraft.value = props.selection?.title ?? "";
}

function saveCharacterName(): void {
  const characterId = props.selection?.characterId;
  if (
    !currentIsCharacterDocument.value ||
    !characterId ||
    characterNameSaving.value
  ) {
    return;
  }
  const name = characterNameDraft.value.trim();
  if (!name) {
    resetCharacterNameDraft();
    uiMessage.warning("人物姓名不能为空。");
    return;
  }
  if (name === props.selection?.title) {
    characterNameDraft.value = name;
    return;
  }

  characterNameDraft.value = name;
  characterNameSaving.value = true;
  emit("renameCharacter", { characterId, name }, (succeeded) => {
    characterNameSaving.value = false;
    if (!succeeded) {
      resetCharacterNameDraft();
    }
  });
}

function handleCharacterNameKeydown(event: KeyboardEvent): void {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  if (event.key === "Enter") {
    event.preventDefault();
    input.blur();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    resetCharacterNameDraft();
    input.blur();
  }
}

function resetStructureTitleDraft(): void {
  structureTitleDraft.value = currentStructureTitleTarget.value?.title ?? "";
}

function saveStructureTitle(): void {
  const target = currentStructureTitleTarget.value;
  if (!target || currentStructureTitleReadOnly.value) return;
  const title = structureTitleDraft.value.trim();
  if (!title) {
    resetStructureTitleDraft();
    uiMessage.warning(target.emptyMessage);
    return;
  }
  if (title === target.title) {
    structureTitleDraft.value = title;
    return;
  }

  structureTitleDraft.value = title;
  structureTitleSaving.value = true;
  emit(
    "renameStructureTitle",
    { kind: target.kind, id: target.id, title },
    (succeeded) => {
      structureTitleSaving.value = false;
      if (!succeeded) {
        resetStructureTitleDraft();
      }
    }
  );
}

function handleStructureTitleKeydown(event: KeyboardEvent): void {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  if (event.key === "Enter") {
    event.preventDefault();
    input.blur();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    resetStructureTitleDraft();
    input.blur();
  }
}

function openWorldbuildingItemDelete(itemId: string): void {
  if (currentReadOnly.value) return;
  worldbuildingDeletePreviousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  pendingWorldbuildingDeleteId.value = itemId;
  void nextTick(() => {
    worldbuildingDeleteCancelButton.value?.focus({ preventScroll: true });
  });
}

function closeWorldbuildingItemDelete(): void {
  pendingWorldbuildingDeleteId.value = null;
  const previousFocus = worldbuildingDeletePreviousFocus;
  worldbuildingDeletePreviousFocus = null;
  void nextTick(() => {
    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  });
}

function handleWorldbuildingDeleteKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeWorldbuildingItemDelete();
    return;
  }
  if (event.key !== "Tab" || !worldbuildingDeleteDialog.value) return;
  const focusable = Array.from(
    worldbuildingDeleteDialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )
  );
  if (!focusable.length) {
    event.preventDefault();
    worldbuildingDeleteDialog.value.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function confirmWorldbuildingItemDelete(): void {
  const target = pendingWorldbuildingDeleteItem.value;
  if (!target) return;
  const items = currentWorldbuildingItems.value;
  const targetIndex = items.findIndex(({ id }) => id === target.id);
  const nextItems = items.filter(({ id }) => id !== target.id);
  const categoryId = props.selection?.key.slice("worldbuilding:".length);
  if (!categoryId) return;
  emitWorldbuildingItemMutation(
    [{
      type: "worldbuildingItem.delete",
      categoryId,
      id: target.id,
      cascade: true
    }],
    () => {
      closeWorldbuildingItemDelete();
      const nextId =
        nextItems[Math.min(targetIndex, nextItems.length - 1)]?.id ?? null;
      if (nextId) {
        void selectWorldbuildingItem(nextId);
        return;
      }
      void selectWorldbuildingOverview();
    }
  );
}

function showNavigationDelete(target: LongNavigationDeleteTarget): void {
  navigationDeletePreviousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  navigationDeleteTarget.value = target;
  void nextTick(() => {
    navigationDeleteCancelButton.value?.focus({ preventScroll: true });
  });
}

function openNavigationDelete(): void {
  const target = currentNavigationDeleteTarget.value;
  if (!target || props.locked || currentReadOnly.value) return;
  showNavigationDelete(target);
}

function closeNavigationDelete(): void {
  if (navigationDeletePending.value) return;
  navigationDeleteTarget.value = null;
  const previousFocus = navigationDeletePreviousFocus;
  navigationDeletePreviousFocus = null;
  void nextTick(() => {
    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  });
}

function handleNavigationDeleteKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeNavigationDelete();
    return;
  }
  if (event.key !== "Tab" || !navigationDeleteDialog.value) return;
  const focusable = Array.from(
    navigationDeleteDialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )
  );
  if (!focusable.length) {
    event.preventDefault();
    navigationDeleteDialog.value.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function confirmNavigationDelete(): void {
  const target = navigationDeleteTarget.value;
  if (!target || navigationDeletePending.value) return;
  navigationDeletePending.value = true;
  emit(
    "deleteStructure",
    {
      kind: target.kind,
      id: target.id,
      title: target.title
    },
    (succeeded) => {
      navigationDeletePending.value = false;
      if (succeeded) closeNavigationDelete();
    }
  );
}

function initializeLoadingState(
  key: string,
  bookId: string,
  file: LongWorkspaceFileReference
): void {
  const existing = documentStates.value[key];
  const dirty = existing
    ? existing.loaded && existing.content !== existing.savedContent
    : false;
  replaceDocumentState(key, {
    bookId,
    file,
    content: existing?.content ?? "",
    savedContent: existing?.savedContent ?? "",
    workspaceRevision: existing?.workspaceRevision ?? 0,
    projectRevision: existing?.projectRevision ?? 0,
    loading: true,
    saving: false,
    // Keep dirty drafts editable/saveable. Clean revision refreshes stay
    // visible for UX but must not remain editable against the new CAS baseline.
    loaded: dirty,
    loadError: null
  });
}

function assertSameReadSnapshot(
  first: LongReadDocumentResult,
  next: LongReadDocumentResult
): void {
  if (
    first.file.id !== next.file.id ||
    first.file.revision !== next.file.revision ||
    first.workspaceRevision !== next.workspaceRevision ||
    first.projectRevision !== next.projectRevision ||
    first.totalCharacters !== next.totalCharacters
  ) {
    throw new Error("长篇文件在分页读取期间发生变化，请重新打开。");
  }
}

async function loadWorkspaceDocument(
  selectedFile: LongWorkspaceSelectionFile,
  force = false
): Promise<void> {
  const bookId = props.bookId;
  const api = resolveLongWorkspaceApi();
  if (!api) {
    uiMessage.warning("当前环境未连接长篇工作区，请使用桌面客户端。");
    return;
  }

  const key = stateKey(selectedFile.file.id, bookId);
  const existing = documentStates.value[key];
  if (
    !force &&
    existing?.loaded &&
    !existing.loading &&
    (existing.file.revision === selectedFile.file.revision ||
      existing.content !== existing.savedContent)
  ) {
    return;
  }
  const inflight = inflightDocumentLoads.get(key);
  if (
    !force &&
    inflight &&
    existing?.file.revision === selectedFile.file.revision
  ) {
    await inflight;
    return;
  }
  const ownRequest = ++requestClock;
  requestClockByFile.set(key, ownRequest);
  initializeLoadingState(key, bookId, selectedFile.file);

  let loadPromise: Promise<void> | null = null;
  loadPromise = (async () => {
    try {
      let offset = 0;
      const contentChunks: string[] = [];
      let firstPage: LongReadDocumentResult | undefined;
      while (true) {
        const page = await api.readDocument({
          bookId,
          fileId: selectedFile.file.id,
          offset,
          maxCharacters: DOCUMENT_PAGE_CHARACTERS
        });
        if (requestClockByFile.get(key) !== ownRequest) return;
        if (page.file.id !== selectedFile.file.id) {
          throw new Error("长篇文档读取结果与所选文件不一致。");
        }
        if (firstPage) {
          assertSameReadSnapshot(firstPage, page);
        } else {
          firstPage = page;
        }
        contentChunks.push(page.content);
        if (page.nextOffset === null) break;
        if (page.nextOffset <= offset) {
          throw new Error("长篇文档分页游标无效。");
        }
        offset = page.nextOffset;
      }

      if (!firstPage || requestClockByFile.get(key) !== ownRequest) return;
      const content = contentChunks.join("");
      // `locked` is a transient write barrier (proposal approval / send
      // preflight), not a property of the document. Recovery still needs to be
      // discovered while that barrier is active so it is not silently skipped
      // until a later remount.
      const editable =
        !selectedFile.readOnly && isEditableLongFile(firstPage.file);
      const recovery = editable
        ? readRecoveryRecord(bookId, firstPage.file.id)
        : null;
      const recoveryMatchesDisk =
        recovery?.baseRevision === firstPage.file.revision;
      const recoveredContent =
        recoveryMatchesDisk && recovery.content !== content
          ? recovery.content
          : content;
      const latestState = documentStates.value[key];
      replaceDocumentState(key, {
        bookId,
        file: firstPage.file,
        content: recoveredContent,
        savedContent: content,
        // Another document save can advance the shared CAS baseline while this
        // file is being paged in. Never regress to the older read baseline.
        workspaceRevision: Math.max(
          firstPage.workspaceRevision,
          latestState?.workspaceRevision ?? 0
        ),
        projectRevision: Math.max(
          firstPage.projectRevision,
          latestState?.projectRevision ?? 0
        ),
        loading: false,
        saving: false,
        loaded: true,
        loadError: null
      });
      if (recovery?.content === content) {
        clearRecoveryRecordForKey(key, bookId, firstPage.file.id);
      } else if (recoveryMatchesDisk) {
        removeStaleRecoveryState(key);
        uiMessage.info(
          `已恢复“${props.selection?.title ?? firstPage.file.path}”的本机未保存内容。`
        );
      } else if (recovery) {
        staleRecoveryByKey.value = {
          ...staleRecoveryByKey.value,
          [key]: recovery
        };
        uiMessage.warning(
          "检测到基于旧版本的长篇恢复副本：磁盘内容未被覆盖，副本已保留供你核对。"
        );
      } else {
        removeStaleRecoveryState(key);
      }
      if (
        props.bookId === bookId &&
        currentSelectionFile.value?.file.id === firstPage.file.id
      ) {
        emit("contextChange", {
          bookId,
          fileId: firstPage.file.id,
          fileRevision: firstPage.file.revision
        });
      }
    } catch (error: unknown) {
      const latest = documentStates.value[key];
      if (requestClockByFile.get(key) === ownRequest && latest) {
        const message =
          error instanceof Error ? error.message : "读取长篇文件失败。";
        replaceDocumentState(key, {
          ...latest,
          loading: false,
          // Preserve any previously shown text, but never keep it editable after
          // a failed refresh against a newer CAS baseline.
          loaded: false,
          loadError: message
        });
        uiMessage.error(message);
      }
    } finally {
      if (inflightDocumentLoads.get(key) === loadPromise) {
        inflightDocumentLoads.delete(key);
      }
    }
  })();
  inflightDocumentLoads.set(key, loadPromise);
  await loadPromise;
}

async function loadSelectedDocument(force = false): Promise<void> {
  const selectedFile = currentSelectionFile.value;
  if (!selectedFile) return;
  await loadWorkspaceDocument(selectedFile, force);
}

async function prefetchWorldbuildingSelectionFiles(): Promise<void> {
  if (!currentIsWorldbuildingList.value) return;
  const selection = props.selection;
  if (!selection?.files.length) return;
  const request = ++worldbuildingPrefetchRequest;
  const bookId = props.bookId;
  const selectionKey = selection.key;
  const files = [...selection.files];
  await Promise.all(
    files.map(async (file) => {
      if (
        request !== worldbuildingPrefetchRequest ||
        props.bookId !== bookId ||
        props.selection?.key !== selectionKey
      ) {
        return;
      }
      await loadWorkspaceDocument(file);
    })
  );
}

async function prefetchActiveSelectionFiles(): Promise<void> {
  // Worldbuilding list has its own prefetch. Avoid unbounded sibling character
  // prefetches: only warm the files belonging to the active selection.
  if (currentIsWorldbuildingList.value) return;
  const selection = props.selection;
  if (!selection?.files.length) return;
  const request = ++selectionPrefetchRequest;
  const bookId = props.bookId;
  const selectionKey = selection.key;
  const characterId = selection.characterId ?? null;
  const files = [...selection.files];
  await Promise.all(
    files.map(async (file) => {
      if (
        request !== selectionPrefetchRequest ||
        props.bookId !== bookId ||
        props.selection?.key !== selectionKey ||
        (characterId !== null &&
          (props.selection?.characterId ?? null) !== characterId)
      ) {
        return;
      }
      await loadWorkspaceDocument(file);
    })
  );
}

function restoreStaleRecovery(): void {
  const selectedFile = currentSelectionFile.value;
  const state = currentState.value;
  const recovery = currentStaleRecovery.value;
  if (
    !selectedFile ||
    !state ||
    !recovery ||
    currentReadOnly.value ||
    state.loading ||
    recovery.bookId !== state.bookId ||
    recovery.fileId !== state.file.id
  ) {
    return;
  }
  const key = stateKey(state.file.id, state.bookId);
  replaceDocumentState(key, {
    ...state,
    content: recovery.content
  });
  removeStaleRecoveryState(key);
  if (recovery.content === state.savedContent) {
    clearRecoveryRecordForKey(key, state.bookId, state.file.id);
  } else {
    // This explicit action rebases only the local recovery record. The next
    // disk save still uses the freshly-read disk CAS revisions in `state`.
    persistRecoveryForKey(key);
  }
  uiMessage.info("已载入恢复副本供你核对；磁盘文件尚未被修改。");
}

async function copyStaleRecovery(): Promise<void> {
  const recovery = currentStaleRecovery.value;
  if (!recovery) return;
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("当前环境不支持剪贴板");
    }
    await navigator.clipboard.writeText(recovery.content);
    uiMessage.success("恢复副本已复制到剪贴板。");
  } catch {
    uiMessage.warning("无法写入剪贴板；你仍可载入恢复副本后手工复制。");
  }
}

async function selectRole(role: LongWorkspaceFileRole): Promise<void> {
  if (role === activeRole.value || role === pendingRole.value) return;
  const selectedFile = props.selection?.files.find(
    (file) => file.role === role
  );
  if (!selectedFile) {
    activeRole.value = role;
    activeFileId.value = null;
    return;
  }
  await selectWorkspaceFile(selectedFile.file.id);
}

async function selectWorkspaceFile(fileId: string): Promise<void> {
  if (fileId === activeFileId.value || fileId === pendingFileId.value) return;
  const selectedFile = props.selection?.files.find(
    ({ file }) => file.id === fileId
  );
  if (!selectedFile) return;
  const bookId = props.bookId;
  const selectionKey = props.selection?.key;
  pendingRole.value = selectedFile.role;
  pendingFileId.value = fileId;
  await loadWorkspaceDocument(selectedFile);
  if (
    props.bookId !== bookId ||
    props.selection?.key !== selectionKey ||
    pendingFileId.value !== fileId
  ) {
    return;
  }
  pendingRole.value = null;
  pendingFileId.value = null;
  const state = documentStates.value[stateKey(selectedFile.file.id, bookId)];
  if (state?.loaded || Boolean(state?.content)) {
    activeRole.value = selectedFile.role;
    activeFileId.value = fileId;
    viewMode.value = selectedFile.readOnly ? "preview" : "edit";
  }
}

async function focusFile(fileId: string): Promise<boolean> {
  const selection = props.selection;
  if (!selection?.files.some(({ file }) => file.id === fileId)) return false;
  if (selection.worldbuildingFormat === "list") {
    const item = selection.worldbuildingItems?.find(
      ({ file }) => file.id === fileId
    );
    if (item) {
      await selectWorldbuildingItem(item.id);
    } else {
      await selectWorldbuildingOverview();
    }
  } else {
    const storyPlot = selection.storyPlots?.find(
      ({ file }) => file.id === fileId
    );
    if (storyPlot) {
      await selectPlotPointTab("storyline");
      await selectStoryPlot(storyPlot.id);
    } else {
      await selectWorkspaceFile(fileId);
    }
  }
  return currentSelectionFile.value?.file.id === fileId;
}

async function focusTarget(target: LongApprovalEditorFocus): Promise<boolean> {
  if (target.bookLineVolumeId) {
    selectBookLineVolume(target.bookLineVolumeId);
  }
  if (target.foreshadowingThreadId || target.foreshadowingBeatId) {
    await nextTick();
    if (
      !(await foreshadowingWorkspace.value?.focusTarget(
        target.foreshadowingThreadId,
        target.foreshadowingBeatId
      ))
    ) {
      return false;
    }
  }
  return target.fileId ? focusFile(target.fileId) : true;
}

function captureNavigationSelection(): Partial<LongWorkspaceSelection> {
  const selection = props.selection;
  if (!selection) return {};
  const selectedFile = currentSelectionFile.value;
  return {
    ...(selection.worldbuildingFormat === "list"
      ? { worldbuildingItemId: activeWorldbuildingItemId.value }
      : {}),
    ...(currentIsBookLineWorkspace.value
      ? { bookLineVolumeId: activeBookLineVolumeId.value }
      : {}),
    ...(selectedFile ? { preferredFileId: selectedFile.file.id } : {})
  };
}

function requestSelectCharacter(characterId: LongCharacterId): void {
  if (
    characterId === props.selection?.characterId ||
    characterId === pendingCharacterId.value
  ) {
    return;
  }
  pendingCharacterId.value = characterId;
  emit("selectCharacter", characterId, (accepted) => {
    if (!accepted && pendingCharacterId.value === characterId) {
      pendingCharacterId.value = null;
    }
  });
}

async function ensureDocumentsLoaded(
  files: LongWorkspaceSelectionFile[]
): Promise<boolean> {
  if (!files.length) return true;
  await Promise.all(files.map((file) => loadWorkspaceDocument(file)));
  return files.every((file) => {
    const state = documentStates.value[stateKey(file.file.id)];
    return Boolean(state?.loaded || state?.content);
  });
}

async function saveDocumentState(
  key: string,
  announceSuccess: boolean
): Promise<boolean> {
  const api = resolveLongWorkspaceApi();
  const state = documentStates.value[key];
  if (
    !api ||
    !state ||
    state.loading ||
    state.saving ||
    state.content === state.savedContent
  ) {
    if (!api) {
      uiMessage.warning("当前环境未连接长篇工作区，请使用桌面客户端。");
    }
    return Boolean(api && state && !state.loading && !state.saving);
  }

  const bookId = state.bookId;
  const submittedContent = state.content;
  replaceDocumentState(key, { ...state, saving: true });
  try {
    const result = await api.writeDocument({
      bookId,
      fileId: state.file.id,
      content: submittedContent,
      baseRevision: state.file.revision,
      baseWorkspaceRevision: state.workspaceRevision,
      baseProjectRevision: state.projectRevision
    });
    const latest = documentStates.value[key];
    if (!latest) return false;
    const bookKeyPrefix = `${bookId}\u0000`;
    documentStates.value = Object.fromEntries(
      Object.entries(documentStates.value).map(([stateKeyValue, value]) => [
        stateKeyValue,
        stateKeyValue.startsWith(bookKeyPrefix)
          ? {
              ...value,
              ...(stateKeyValue === key
                ? {
                    file: result.file,
                    savedContent: submittedContent,
                    saving: false,
                    loaded: true,
                    loadError: null
                  }
                : {}),
              workspaceRevision: result.workspaceRevision,
              projectRevision: result.projectRevision
            }
          : value
      ])
    );
    emit("saved", result);
    if (
      props.bookId === bookId &&
      currentSelectionFile.value?.file.id === result.file.id
    ) {
      emit("contextChange", {
        bookId,
        fileId: result.file.id,
        fileRevision: result.file.revision
      });
    }
    const savedState = documentStates.value[key];
    if (savedState?.content === savedState?.savedContent) {
      clearRecoveryRecordForKey(key, bookId, result.file.id);
    } else if (savedState) {
      persistRecoveryForKey(key);
    }
    if (announceSuccess) {
      if (savedState?.content === savedState?.savedContent) {
        uiMessage.success(
          `已保存“${props.selection?.title ?? state.file.path}”`
        );
      } else {
        uiMessage.info("已保存提交时版本；保存期间的新修改仍待保存。");
      }
    }
    return true;
  } catch (error: unknown) {
    const latest = documentStates.value[key];
    if (latest) {
      replaceDocumentState(key, { ...latest, saving: false });
    }
    const message =
      error instanceof Error ? error.message : "保存长篇文件失败。";
    if (/revision|冲突|conflict/iu.test(message)) {
      uiMessage.warning(
        "文件已在其他位置更新，本次修改未覆盖磁盘内容；请保留当前文本并重新打开后合并。"
      );
    } else {
      uiMessage.error(message);
    }
    return false;
  }
}

function runExclusiveSave(task: () => Promise<boolean>): Promise<boolean> {
  if (activeSavePromise) return activeSavePromise;
  workspaceSavePending.value = true;
  const pending = task().finally(() => {
    workspaceSavePending.value = false;
    if (activeSavePromise === pending) {
      activeSavePromise = null;
    }
  });
  activeSavePromise = pending;
  return pending;
}

async function saveCurrentDocument(): Promise<void> {
  if (currentIsStructuredText.value) {
    if (!currentReadOnly.value && currentDirty.value) {
      await saveAllChanges();
    }
    return;
  }
  const selectedFile = currentSelectionFile.value;
  if (
    !selectedFile ||
    currentReadOnly.value ||
    !currentDirty.value
  ) {
    return;
  }
  await runExclusiveSave(() =>
    saveDocumentState(stateKey(selectedFile.file.id), true)
  );
}

/**
 * App.vue calls this before changing books or unmounting the long editor.
 * Writes are sequential because each CAS write advances the shared workspace
 * and project revisions consumed by the next dirty document.
 */
async function saveAllChanges(): Promise<boolean> {
  if (activeSavePromise && !(await activeSavePromise)) {
    return false;
  }
  const bookPrefix = `${props.bookId}\u0000`;
  const dirtyKeys = Object.entries(documentStates.value)
    .filter(
      ([key, state]) =>
        key.startsWith(bookPrefix) &&
        state.loaded &&
        state.content !== state.savedContent
    )
    .map(([key]) => key);
  const dirtyVolumeIds = Object.entries(volumeOutlineDrafts.value)
    .filter(
      ([, draft]) =>
        !draft.saving && draft.content !== draft.savedContent
    )
    .map(([volumeId]) => volumeId);
  const dirtyPlotPointSummaryIds = Object.entries(
    plotPointSummaryDrafts.value
  )
    .filter(
      ([, draft]) =>
        !draft.saving && draft.content !== draft.savedContent
    )
    .map(([plotPointId]) => plotPointId as LongArcId);
  if (
    !dirtyKeys.length &&
    !dirtyVolumeIds.length &&
    !dirtyPlotPointSummaryIds.length
  ) {
    return true;
  }

  const saved = await runExclusiveSave(async () => {
    for (const key of dirtyKeys) {
      if (!(await saveDocumentState(key, false))) {
        return false;
      }
    }
    for (const volumeId of dirtyVolumeIds) {
      if (!(await saveVolumeOutline(volumeId))) {
        return false;
      }
    }
    for (const plotPointId of dirtyPlotPointSummaryIds) {
      if (!(await savePlotPointContent(plotPointId, "summary"))) {
        return false;
      }
    }
    // Editing remains available during an asynchronous save. A keystroke
    // after a file's submitted snapshot must keep navigation blocked instead
    // of being mistaken for part of the successful write.
    return !Object.entries(documentStates.value).some(
      ([key, state]) =>
        key.startsWith(bookPrefix) &&
        state.loaded &&
        state.content !== state.savedContent
    ) &&
      !Object.values(volumeOutlineDrafts.value).some(
        (draft) => draft.content !== draft.savedContent
      ) &&
      !Object.values(plotPointSummaryDrafts.value).some(
        (draft) => draft.content !== draft.savedContent
      );
  });
  if (saved) {
    const savedCount =
      dirtyKeys.length +
      dirtyVolumeIds.length +
      dirtyPlotPointSummaryIds.length;
    uiMessage.success(
      `离开前已自动保存 ${savedCount} 项长篇修改`
    );
  } else {
    uiMessage.warning("长篇修改尚未保存，已取消切换以保留当前内容。");
  }
  return saved;
}

function synchronizeProjectRevisions(
  workspaceRevision: number,
  projectRevision: number
): void {
  if (
    !synchronizeProjectRevisionsIfClean(
      props.bookId,
      workspaceRevision,
      projectRevision,
      false
    )
  ) {
    throw new Error("存在未保存的长篇文档，不能刷新项目版本基线。");
  }
}

function synchronizeProjectRevisionsIfClean(
  bookId: string,
  workspaceRevision: number,
  projectRevision: number,
  includeVolumeDrafts = true
): boolean {
  // A ref can briefly outlive a book switch until Vue applies the new props.
  // Treat an inactive book as a no-op; `false` is reserved for a dirty current
  // book so App.vue only shows a conflict warning for real unsaved content.
  if (bookId !== props.bookId) return true;
  const prefix = `${bookId}\u0000`;
  const currentBookStates = Object.entries(documentStates.value).filter(
    ([key]) => key.startsWith(prefix)
  );
  if (
    includeVolumeDrafts &&
    (Object.values(volumeOutlineDrafts.value).some(
      (draft) =>
        !draft.saving && draft.content !== draft.savedContent
    ) ||
      Object.values(plotPointSummaryDrafts.value).some(
        (draft) =>
          !draft.saving && draft.content !== draft.savedContent
      ))
  ) {
    return false;
  }
  if (
    currentBookStates.every(
      ([, state]) =>
        state.workspaceRevision === workspaceRevision &&
        state.projectRevision === projectRevision
    )
  ) {
    return true;
  }
  if (
    currentBookStates.some(
      ([, state]) => state.loaded && state.content !== state.savedContent
    )
  ) {
    return false;
  }
  documentStates.value = Object.fromEntries(
    Object.entries(documentStates.value).map(([key, state]) => [
      key,
      key.startsWith(prefix)
        ? {
            ...state,
            workspaceRevision,
            projectRevision
          }
        : state
    ])
  );
  return true;
}

defineExpose({
  saveAllChanges,
  selectBookLineVolume,
  focusFile,
  focusTarget,
  captureNavigationSelection,
  ensureDocumentsLoaded,
  synchronizeProjectRevisions,
  synchronizeProjectRevisionsIfClean
});

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  flushAllRecoveryRecords();
  if (!hasUnsavedChanges.value) return;
  event.preventDefault();
  event.returnValue = "";
}

watch(
  () =>
    [
      props.bookId,
      props.workspaceIndex?.revision
    ] as const,
  () => {
    if (volumeDraftBookId !== props.bookId) {
      volumeDraftBookId = props.bookId;
      volumeOutlineDrafts.value = {};
      plotPointSummaryDrafts.value = {};
      activeBookLineVolumeId.value = null;
      activeBookLineContentTab.value = "outline";
      activePlotPointTab.value = "summary";
      activeStoryPlotId.value = null;
    }
    const volumes = props.workspaceIndex?.plot.volumes ?? [];
    const next: Record<string, LongVolumeOutlineDraft> = {};
    for (const volume of volumes) {
      const existing = volumeOutlineDrafts.value[volume.id];
      next[volume.id] =
        existing &&
        (existing.saving ||
          existing.content !== existing.savedContent)
          ? existing
          : {
              content: volume.summary,
              savedContent: volume.summary,
              saving: false
            };
    }
    volumeOutlineDrafts.value = next;
    const nextSummaries: Record<string, LongVolumeOutlineDraft> = {};
    for (const plotPoint of props.workspaceIndex?.plot.arcs ?? []) {
      const existingSummary = plotPointSummaryDrafts.value[plotPoint.id];
      nextSummaries[plotPoint.id] =
        existingSummary &&
        (existingSummary.saving ||
          existingSummary.content !== existingSummary.savedContent)
          ? existingSummary
          : {
              content: plotPoint.summary ?? "",
              savedContent: plotPoint.summary ?? "",
              saving: false
            };
    }
    plotPointSummaryDrafts.value = nextSummaries;
    if (
      activeBookLineVolumeId.value &&
      !volumes.some(({ id }) => id === activeBookLineVolumeId.value)
    ) {
      activeBookLineVolumeId.value = null;
    }
  },
  // The workspace index is replaced atomically for every refresh. Tracking its
  // monotonic revision avoids recursively subscribing to every plot entity and
  // lets Vue batch the draft reconciliation outside the input event.
  { immediate: true, flush: "post" }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.key,
      props.selection?.preferredRole,
      props.selection?.preferredFileId
    ] as const,
  () => {
    const preferredRole = props.selection?.preferredRole ?? "content";
    activeRole.value = preferredRole;
    activeFileId.value =
      props.selection?.preferredFileId ??
      props.selection?.files.find(({ role }) => role === preferredRole)?.file.id ??
      props.selection?.files[0]?.file.id ??
      null;
  },
  { immediate: true, flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.key,
      props.selection?.worldbuildingItemId
    ] as const,
  ([, , itemId]) => {
    if (itemId !== undefined) {
      activeWorldbuildingItemId.value = itemId;
    }
  },
  { immediate: true, flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.key,
      props.selection?.bookLineVolumeId
    ] as const,
  ([, , volumeId]) => {
    if (volumeId !== undefined) {
      activeBookLineVolumeId.value = volumeId;
    }
  },
  { immediate: true, flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.key,
      props.selection?.plotPointId,
      activePlotPointTab.value,
      (props.selection?.storyPlots ?? []).map(({ id }) => id).join("\0")
    ] as const,
  () => {
    if (!currentIsPlotPointStoryline.value) return;
    void ensureActiveStoryPlotSelection();
  },
  { flush: "post" }
);

watch(
  () =>
    [
      props.bookId,
      currentStructureTitleTarget.value?.kind,
      currentStructureTitleTarget.value?.id,
      currentStructureTitleTarget.value?.title
    ] as const,
  resetStructureTitleDraft,
  { immediate: true, flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.characterId,
      props.selection?.title
    ] as const,
  resetCharacterNameDraft,
  { immediate: true, flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      currentSelectionFile.value?.file.id,
      activeWorldbuildingItemId.value,
      activeBookLineVolumeId.value,
      activeBookLineContentTab.value,
      props.selection?.plotPointId,
      activePlotPointTab.value,
      props.selection?.chapterCardId
    ] as const,
  () => {
    viewMode.value = currentSelectionFile.value?.readOnly ? "preview" : "edit";
    closeFindPanel();
    searchQuery.value = "";
    replacementText.value = "";
    resetEditorHistory();
  },
  { flush: "sync" }
);

watch(
  () => props.bookId,
  () => {
    heldSelectionFile.value = null;
  },
  { flush: "sync" }
);

watch(
  [
    () => props.bookId,
    () => props.selection?.key
  ],
  () => {
    worldbuildingSelectionRequest += 1;
    pendingWorldbuildingItemId.value = null;
    pendingWorldbuildingOverview.value = false;
    pendingRole.value = null;
    pendingFileId.value = null;
  },
  { flush: "sync" }
);

watch(
  () => props.selection?.characterId ?? null,
  (characterId) => {
    if (
      pendingCharacterId.value !== null &&
      characterId === pendingCharacterId.value
    ) {
      pendingCharacterId.value = null;
    }
  },
  { flush: "sync" }
);

watch(
  () =>
    currentCharacterNavigationItems.value
      .map(({ id }) => id)
      .join("\u0000"),
  () => {
    if (
      pendingCharacterId.value &&
      !currentCharacterNavigationItems.value.some(
        ({ id }) => id === pendingCharacterId.value
      )
    ) {
      pendingCharacterId.value = null;
    }
  },
  { flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.key,
      currentWorldbuildingItems.value.map(({ id }) => id).join("\u0000")
    ] as const,
  () => {
    const items = currentWorldbuildingItems.value;
    if (
      pendingWorldbuildingItemId.value &&
      !items.some(({ id }) => id === pendingWorldbuildingItemId.value)
    ) {
      worldbuildingSelectionRequest += 1;
      pendingWorldbuildingItemId.value = null;
    }
    if (
      activeWorldbuildingItemId.value !== null &&
      !items.some(({ id }) => id === activeWorldbuildingItemId.value)
    ) {
      activeWorldbuildingItemId.value = null;
    }
    if (
      !items.some(({ id }) => id === pendingWorldbuildingDeleteId.value)
    ) {
      pendingWorldbuildingDeleteId.value = null;
    }
  },
  { immediate: true, flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      currentSelectionFile.value?.file.id,
      currentState.value?.loaded,
      currentState.value?.content,
      currentState.value?.loading
    ] as const,
  () => {
    const target = currentSelectionFile.value;
    if (!target) {
      heldSelectionFile.value = null;
      return;
    }
    const state = documentStates.value[stateKey(target.file.id)];
    if (state?.loaded || Boolean(state?.content)) {
      heldSelectionFile.value = target;
      return;
    }
    const held = heldSelectionFile.value;
    if (held) {
      const heldState = documentStates.value[stateKey(held.file.id)];
      if (heldState?.loaded || Boolean(heldState?.content)) {
        return;
      }
    }
    heldSelectionFile.value = target;
  },
  { immediate: true, flush: "sync" }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.key,
      currentIsWorldbuildingList.value,
      currentWorldbuildingItems.value.map(({ id }) => id).join("\u0000")
    ] as const,
  () => {
    if (currentIsWorldbuildingList.value) {
      selectionPrefetchRequest += 1;
      void prefetchWorldbuildingSelectionFiles();
      return;
    }
    worldbuildingPrefetchRequest += 1;
  },
  { immediate: true }
);

watch(
  () =>
    [
      props.bookId,
      props.selection?.key,
      props.selection?.characterId ?? null,
      props.selection?.files.map(({ file }) => file.id).join("\u0000") ?? ""
    ] as const,
  () => {
    if (currentIsWorldbuildingList.value) return;
    void prefetchActiveSelectionFiles();
  },
  { immediate: true }
);

watch(
  () =>
    [
      props.bookId,
      currentSelectionFile.value?.file.id,
      currentSelectionFile.value?.file.revision
    ] as const,
  () => {
    const selectedFile = currentSelectionFile.value;
    emit(
      "contextChange",
      selectedFile
        ? {
            bookId: props.bookId,
            fileId: selectedFile.file.id,
            fileRevision: selectedFile.file.revision
          }
        : null
    );
    void loadSelectedDocument();
  },
  { immediate: true }
);

watch(
  longEditorDocumentElement,
  (current, previous) => {
    if (previous) entryListResizeObserver?.unobserve(previous);
    if (current) entryListResizeObserver?.observe(current);
    void nextTick(() => setDisplayedLongEditorPaneWidth("entry-list"));
  },
  { flush: "post" }
);

watch(
  storyPlotLayoutElement,
  (current, previous) => {
    if (previous) storyPlotListResizeObserver?.unobserve(previous);
    if (current) storyPlotListResizeObserver?.observe(current);
    void nextTick(() => setDisplayedLongEditorPaneWidth("story-plot-list"));
  },
  { flush: "post" }
);

watch(
  [currentUsesAnyRightEntryList, currentIsPlotPointStoryline],
  () => void nextTick(reconcileLongEditorPaneWidths),
  { flush: "post" }
);

onMounted(() => {
  entryListResizeObserver = new ResizeObserver(() => {
    if (resizingLongEditorPane.value !== "entry-list") {
      setDisplayedLongEditorPaneWidth("entry-list");
    }
  });
  storyPlotListResizeObserver = new ResizeObserver(() => {
    if (resizingLongEditorPane.value !== "story-plot-list") {
      setDisplayedLongEditorPaneWidth("story-plot-list");
    }
  });
  if (longEditorDocumentElement.value) {
    entryListResizeObserver.observe(longEditorDocumentElement.value);
  }
  if (storyPlotLayoutElement.value) {
    storyPlotListResizeObserver.observe(storyPlotLayoutElement.value);
  }
  reconcileLongEditorPaneWidths();
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pointerdown", handleWindowPointerDown, true);
  window.addEventListener("resize", reconcileLongEditorPaneWidths);
});
onBeforeUnmount(() => {
  stopLongEditorPaneResize();
  entryListResizeObserver?.disconnect();
  storyPlotListResizeObserver?.disconnect();
  worldbuildingSelectionRequest += 1;
  worldbuildingPrefetchRequest += 1;
  selectionPrefetchRequest += 1;
  flushAllRecoveryRecords();
  for (const key of [...recoveryWriteTimers.keys()]) {
    cancelRecoveryWrite(key);
  }
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pointerdown", handleWindowPointerDown, true);
  window.removeEventListener("resize", reconcileLongEditorPaneWidths);
  requestClockByFile.clear();
  inflightDocumentLoads.clear();
});
</script>

<template>
  <section
    class="long-workspace-editor"
    :class="{
      'is-foreshadowing-overview': currentIsForeshadowingWorkspace,
      'has-navigation-tabs':
        currentUsesTopCharacterTabs ||
        currentUsesTopPlotTabs ||
        currentUsesTopWorldbuildingTabs
    }"
    aria-label="长篇文件编辑器"
  >
    <template v-if="selection">
      <header class="long-editor-header">
        <div
          class="long-editor-breadcrumbs"
          :title="selection.breadcrumbs.join(' / ')"
        >
          <span
            v-for="(part, index) in selection.breadcrumbs"
            :key="`${part}-${index}`"
          >
            {{ part }}
            <i v-if="index < selection.breadcrumbs.length - 1">/</i>
          </span>
        </div>
        <div class="long-editor-header-actions">
          <span
            class="long-editor-save-state"
            :class="{ 'is-dirty': currentDirty }"
          >
            <AppIcon
              :name="currentDirty ? 'save' : 'check'"
              :size="13"
            />
            <span>
              {{
                currentIsForeshadowingView
                  ? locked
                    ? lockedReason ?? "编辑暂时锁定"
                    : currentDirty
                      ? "关联文本有未保存修改"
                      : "伏笔数据已同步"
                  : !currentSelectionFile && !currentIsStructuredText
                  ? "已选择工作区上下文"
                  : locked
                    ? lockedReason ?? "编辑暂时锁定"
                    : currentSelectionFile?.readOnly
                      ? "只读记录"
                      : isDocumentSwitchPending || currentState?.loading
                        ? "正在读取"
                        : currentSaving
                          ? "正在保存到本机"
                          : currentDirty
                            ? "有未保存修改"
                            : currentState?.loaded || currentIsStructuredText
                              ? "已保存到本机"
                              : "等待读取"
              }}
            </span>
          </span>
          <button
            class="long-editor-collapse-button"
            type="button"
            aria-label="收起长篇编辑栏"
            @click="emit('collapse')"
          >
            <AppIcon name="panel-right" :size="18" />
          </button>
        </div>
      </header>

      <LongCharacterNavigation
        v-if="currentUsesTopCharacterTabs"
        mode="top-tabs"
        :label="`${selection.characterGroup ?? '人物'}人物`"
        :title="selection.title"
        :items="currentCharacterNavigationItems"
        :active-character-id="selection.characterId ?? null"
        :pending-character-id="pendingCharacterId"
        :locked="locked"
        :can-delete="Boolean(currentNavigationDeleteTarget)"
        @select-character="requestSelectCharacter"
        @create-character="emit('createCharacter')"
        @delete-character="openNavigationDelete"
      />

      <nav
        v-if="currentIsBookLineWorkspace && currentUsesTopPlotTabs"
        class="section-tabs-bar long-worldbuilding-tabs long-book-line-tabs"
        aria-label="全书故事线"
      >
        <div
          class="section-tabs-scroll"
          role="tablist"
          @wheel="handleHorizontalOverflowWheel"
        >
          <button
            class="section-tab"
            :class="{ 'is-active': activeBookLineVolumeId === null }"
            type="button"
            role="tab"
            :aria-selected="activeBookLineVolumeId === null"
            title="全书总纲"
            @click="selectBookLineOverview"
          >
            全书总纲
          </button>
          <button
            v-for="volume in orderedBookLineVolumes"
            :key="volume.id"
            class="section-tab"
            :class="{ 'is-active': activeBookLineVolumeId === volume.id }"
            type="button"
            role="tab"
            :aria-selected="activeBookLineVolumeId === volume.id"
            :title="volume.title"
            @click="selectBookLineVolume(volume.id)"
          >
            {{ volume.title }}
          </button>
        </div>
        <button
          v-if="!currentReadOnly"
          class="long-worldbuilding-add"
          type="button"
          aria-label="新建分卷"
          title="新建分卷"
          @click="requestCreateVolume"
        >
          <AppIcon name="plus" :size="15" />
        </button>
        <button
          v-if="!currentReadOnly"
          class="long-worldbuilding-remove"
          type="button"
          aria-label="删除当前分卷"
          :title="
            currentBookLineVolume ? '删除当前分卷' : '请先选择一个分卷'
          "
          :disabled="locked || !currentNavigationDeleteTarget"
          @click="openNavigationDelete"
        >
          <AppIcon name="minus" :size="15" />
        </button>
      </nav>

      <nav
        v-if="currentIsPlotPointWorkspace && currentUsesTopPlotTabs"
        class="section-tabs-bar long-worldbuilding-tabs long-plot-point-tabs"
        :aria-label="`${selection.breadcrumbs.at(-1) ?? '当前分卷'}剧情点`"
      >
        <div
          class="section-tabs-scroll"
          role="tablist"
          @wheel="handleHorizontalOverflowWheel"
        >
          <button
            v-for="plotPoint in selection.plotPointTabs"
            :key="plotPoint.id"
            class="section-tab"
            :class="{ 'is-active': selection.plotPointId === plotPoint.id }"
            type="button"
            role="tab"
            :aria-selected="selection.plotPointId === plotPoint.id"
            :title="plotPoint.label"
            @click="emit('selectPlotPoint', plotPoint.id)"
          >
            {{ plotPoint.label }}
          </button>
        </div>
        <button
          v-if="!currentReadOnly"
          class="long-worldbuilding-add"
          type="button"
          aria-label="新增剧情点"
          title="新增剧情点"
          :disabled="locked"
          @click="emit('createPlotPoint')"
        >
          <AppIcon name="plus" :size="15" />
        </button>
        <button
          v-if="!currentReadOnly"
          class="long-worldbuilding-remove"
          type="button"
          aria-label="删除当前剧情点"
          title="删除当前剧情点"
          :disabled="locked || !currentNavigationDeleteTarget"
          @click="openNavigationDelete"
        >
          <AppIcon name="minus" :size="15" />
        </button>
      </nav>

      <LongManuscriptNavigation
        v-if="currentIsChapterCardWorkspace && currentUsesTopPlotTabs"
        mode="top-tabs"
        :label="`${selection.breadcrumbs[3] ?? '当前分卷'}章卡`"
        :items="selection.chapterCardTabs ?? []"
        :active-chapter-id="selection.chapterCardId ?? null"
        :locked="locked"
        :committed="currentChapterCardCommitted"
        @select-chapter="emit('selectChapterCard', $event)"
        @create-chapter="emit('createChapterCard')"
        @delete-chapter="openChapterCardDelete"
        @reorder-chapter="reorderChapterCard"
      />

      <LongWorldbuildingNavigation
        v-if="currentUsesTopWorldbuildingTabs"
        mode="top-tabs"
        :items="currentWorldbuildingItems"
        :active-item-id="activeWorldbuildingItemId"
        :pending-item-id="pendingWorldbuildingItemId"
        :pending-overview="pendingWorldbuildingOverview"
        :read-only="currentReadOnly"
        :locked="locked"
        @select-overview="selectWorldbuildingOverview"
        @select-item="selectWorldbuildingItem"
        @add-item="addWorldbuildingItem"
        @delete-item="openWorldbuildingItemDelete"
      />

      <div
        v-if="!currentIsForeshadowingWorkspace"
        class="long-editor-toolbar"
      >
        <div
          v-if="currentIsBookLineWorkspace && currentBookLineVolume"
          class="long-editor-file-tabs"
          role="tablist"
          :aria-label="`${currentBookLineVolume.title}内容`"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="activeBookLineContentTab === 'outline'"
            :class="{
              'is-active': activeBookLineContentTab === 'outline'
            }"
            @click="selectBookLineContentTab('outline')"
          >
            卷纲
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="
              activeBookLineContentTab === 'foreshadowing'
            "
            :class="{
              'is-active':
                activeBookLineContentTab === 'foreshadowing'
            }"
            @click="selectBookLineContentTab('foreshadowing')"
          >
            本卷伏笔
          </button>
        </div>
        <div
          v-if="currentIsPlotPointWorkspace && currentPlotPoint"
          class="long-editor-file-tabs"
          role="tablist"
          :aria-label="`${currentPlotPoint?.title ?? '当前剧情点'}内容`"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="activePlotPointTab === 'summary'"
            :class="{ 'is-active': activePlotPointTab === 'summary' }"
            @click="selectPlotPointTab('summary')"
          >
            概要
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activePlotPointTab === 'storyline'"
            :class="{ 'is-active': activePlotPointTab === 'storyline' }"
            @click="selectPlotPointTab('storyline')"
          >
            故事情节
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activePlotPointTab === 'foreshadowing'"
            :class="{
              'is-active': activePlotPointTab === 'foreshadowing'
            }"
            @click="selectPlotPointTab('foreshadowing')"
          >
            伏笔触点
          </button>
        </div>
        <LongContinuityLedgerNavigation
          v-if="currentUsesTopContinuityTabs"
          mode="top-tabs"
          :title="selection.title"
          :items="currentContinuityNavigationItems"
          :active-file-id="currentSelectionFile?.file.id ?? null"
          :pending-file-id="pendingFileId"
          @select-file="selectWorkspaceFile"
        />
        <div
          v-if="showGenericFileTabs"
          class="long-editor-file-tabs"
          role="tablist"
          :aria-label="`${selection.title}文件`"
        >
          <button
            v-for="file in selection.files"
            :key="file.file.id"
            type="button"
            role="tab"
            :aria-selected="currentSelectionFile?.file.id === file.file.id"
            :class="{
              'is-active': currentSelectionFile?.file.id === file.file.id,
              'is-loading': pendingFileId === file.file.id
            }"
            :aria-busy="pendingFileId === file.file.id"
            @click="selectWorkspaceFile(file.file.id)"
          >
            {{ file.label }}
          </button>
        </div>
        <span
          v-if="
            !currentIsForeshadowingView &&
            !currentIsPlotPointStoryline &&
            ((currentIsBookLineWorkspace && currentBookLineVolume) ||
              (currentIsPlotPointWorkspace && currentPlotPoint) ||
              (currentIsChapterCardWorkspace && currentChapterCard) ||
              currentUsesTopContinuityTabs ||
              showGenericFileTabs)
          "
          class="long-toolbar-separator"
        />
        <div
          v-if="
            !currentIsForeshadowingView &&
            !currentIsPlotPointStoryline
          "
          class="long-editor-view-tabs"
          role="tablist"
          aria-label="文本视图"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="viewMode === 'edit'"
            :class="{ 'is-active': viewMode === 'edit' }"
            :disabled="!canUseTextTools || currentReadOnly"
            @click="viewMode = 'edit'"
          >
            编辑
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="viewMode === 'preview'"
            :class="{ 'is-active': viewMode === 'preview' }"
            :disabled="!canUseTextTools"
            @click="viewMode = 'preview'"
          >
            预览
          </button>
        </div>
        <span
          v-if="
            !currentIsForeshadowingView &&
            !currentIsPlotPointStoryline
          "
          class="long-toolbar-separator"
        />
        <div
          v-if="
            !currentIsForeshadowingView &&
            !currentIsPlotPointStoryline
          "
          ref="editorToolsElement"
          class="long-editor-text-tools"
          role="group"
          aria-label="文本操作"
        >
          <button
            class="long-format-button"
            type="button"
            aria-label="撤销"
            title="撤销（⌘/Ctrl+Z）"
            :disabled="!canUndo"
            @mousedown.prevent
            @click="undo"
          >
            <AppIcon name="undo" :size="16" />
          </button>
          <button
            class="long-format-button"
            type="button"
            aria-label="还原"
            title="还原（⌘/Ctrl+Shift+Z）"
            :disabled="!canRedo"
            @mousedown.prevent
            @click="redo"
          >
            <AppIcon name="redo" :size="16" />
          </button>
          <button
            class="long-format-button"
            :class="{
              'is-active': findPanelOpen && findPanelMode === 'find'
            }"
            type="button"
            aria-label="查找"
            title="查找（⌘/Ctrl+F）"
            :disabled="!canUseTextTools"
            :aria-pressed="findPanelOpen && findPanelMode === 'find'"
            @mousedown.prevent
            @click="toggleFindPanel('find')"
          >
            <AppIcon name="search" :size="16" />
          </button>
          <button
            class="long-format-button"
            :class="{
              'is-active': findPanelOpen && findPanelMode === 'replace'
            }"
            type="button"
            aria-label="替换"
            title="替换（⌘⌥F / Ctrl+H）"
            :disabled="!canUseTextTools"
            :aria-pressed="findPanelOpen && findPanelMode === 'replace'"
            @mousedown.prevent
            @click="toggleFindPanel('replace')"
          >
            <AppIcon name="replace" :size="16" />
          </button>

          <div
            v-if="findPanelOpen"
            ref="findPanelElement"
            class="long-editor-find-panel"
            role="dialog"
            :aria-label="
              findPanelMode === 'replace' ? '查找和替换' : '查找文字'
            "
            @keydown.esc.stop="closeFindPanel"
          >
            <div class="long-editor-find-row">
              <label class="long-editor-find-field">
                <AppIcon name="search" :size="14" />
                <input
                  ref="findInput"
                  v-model="searchQuery"
                  type="text"
                  aria-label="查找文字"
                  placeholder="查找"
                  @input="handleFindInput"
                  @keydown.enter.prevent="
                    findMatch($event.shiftKey ? -1 : 1)
                  "
                />
                <span class="long-editor-find-count" aria-live="polite">
                  {{ searchResultLabel }}
                </span>
              </label>
              <button
                class="long-editor-find-icon-button is-previous"
                type="button"
                aria-label="查找上一个"
                title="查找上一个"
                @click="findMatch(-1)"
              >
                <AppIcon name="chevron" :size="14" />
              </button>
              <button
                class="long-editor-find-icon-button"
                type="button"
                aria-label="查找下一个"
                title="查找下一个"
                @click="findMatch(1)"
              >
                <AppIcon name="chevron" :size="14" />
              </button>
              <button
                class="long-editor-find-icon-button"
                type="button"
                aria-label="关闭查找"
                title="关闭"
                @click="closeFindPanel"
              >
                <AppIcon name="close" :size="14" />
              </button>
            </div>
            <div
              v-if="findPanelMode === 'replace'"
              class="long-editor-replace-row"
            >
              <label class="long-editor-find-field">
                <AppIcon name="replace" :size="14" />
                <input
                  v-model="replacementText"
                  type="text"
                  aria-label="替换为"
                  placeholder="替换为"
                  :disabled="currentReadOnly"
                  @keydown.enter.prevent="replaceCurrentMatch"
                />
              </label>
              <button
                class="long-editor-find-action"
                type="button"
                :disabled="currentReadOnly"
                @click="replaceCurrentMatch"
              >
                替换
              </button>
              <button
                class="long-editor-find-action"
                type="button"
                :disabled="currentReadOnly"
                @click="replaceAllMatches"
              >
                全部
              </button>
            </div>
          </div>
        </div>
        <span class="long-toolbar-spacer" />
        <div class="long-editor-toolbar-actions">
          <button
            v-if="
              latestCommit?.reversible &&
              (selection.root === 'draft' ||
                selection.root === 'continuity_ledger')
            "
            class="long-editor-rollback-button"
            type="button"
            :title="`回滚提交 #${latestCommit.sequence}`"
            :disabled="locked"
            @click="emit('rollback')"
          >
            <AppIcon name="history" :size="14" />
            <span>回滚最后提交</span>
          </button>
        </div>
      </div>

      <div
        ref="longEditorDocumentElement"
        class="long-editor-document"
        :style="entryListGridStyle"
        :class="{
          'is-entry-right-list': currentUsesAnyRightEntryList,
          'is-resizing-entry-list': resizingLongEditorPane === 'entry-list'
        }"
      >
        <aside
          v-if="currentStaleRecovery"
          class="long-editor-recovery"
          role="status"
          aria-live="polite"
        >
          <details open>
            <summary>发现旧版本恢复副本</summary>
            <div class="long-editor-recovery-content">
              <p>
                磁盘文件已变化，因此没有自动覆盖。副本仍保存在本机，
                你可以先复制，或明确载入后自行核对合并。
              </p>
              <small>
                副本基线 {{ currentStaleRecovery.baseRevision }} ·
                {{ new Date(currentStaleRecovery.timestamp).toLocaleString() }}
              </small>
              <pre>{{ currentStaleRecoveryPreview }}</pre>
              <div class="long-editor-recovery-actions">
                <button type="button" @click="copyStaleRecovery">
                  复制副本
                </button>
                <button
                  class="is-primary"
                  type="button"
                  :disabled="currentReadOnly"
                  @click="restoreStaleRecovery"
                >
                  载入副本核对
                </button>
              </div>
            </div>
          </details>
        </aside>
        <LongForeshadowingWorkspace
          v-if="currentIsForeshadowingView && workspaceIndex"
          ref="foreshadowingWorkspace"
          :snapshot="workspaceIndex"
          :mode="currentForeshadowingMode"
          :volume-id="currentForeshadowingVolumeId"
          :plot-point-id="currentPlotPoint?.id"
          :disabled="locked"
          @mutation="forwardForeshadowingMutation"
        />
        <section
          v-else-if="currentIsPlotPointStoryline"
          class="long-story-plot-workspace"
          :aria-label="`${currentPlotPoint?.title ?? '当前剧情点'} · 故事情节`"
        >
          <header class="long-story-plot-header">
            <div class="long-story-plot-heading">
              <h2>
                {{ currentPlotPoint?.title ?? "当前剧情点" }} · 故事情节
              </h2>
            </div>
            <div class="long-story-plot-header-actions">
              <button
                v-if="!currentReadOnly"
                class="long-story-plot-add"
                type="button"
                :disabled="locked"
                @click="addStoryPlot"
              >
                <AppIcon name="plus" :size="15" />
                新增情节
              </button>
            </div>
          </header>

          <div
            ref="storyPlotLayoutElement"
            class="long-story-plot-layout"
            :class="{
              'is-resizing-story-list':
                resizingLongEditorPane === 'story-plot-list'
            }"
            :style="storyPlotListGridStyle"
          >
            <LongPlotStoryListPane
              :plots="currentStoryPlots"
              :active-story-plot-id="activeStoryPlotId"
              :pending-story-plot-id="pendingStoryPlotId"
              :action-menu-id="storyPlotActionMenuId"
              :read-only="currentReadOnly"
              :locked="locked"
              @select="selectStoryPlot"
              @toggle-action-menu="toggleStoryPlotActionMenu"
              @close-action-menu="closeStoryPlotActionMenu"
              @menu-action="runStoryPlotMenuAction"
            />

            <div
              class="long-editor-internal-resizer long-story-plot-resizer"
              role="separator"
              aria-label="调整当前剧情点涉及列表宽度"
              aria-orientation="vertical"
              :aria-valuemin="LONG_EDITOR_LIST_MIN_WIDTH"
              :aria-valuemax="storyPlotListMaxWidth"
              :aria-valuenow="storyPlotListWidth ?? LONG_EDITOR_LIST_MIN_WIDTH"
              tabindex="0"
              @pointerdown="
                startLongEditorPaneResize('story-plot-list', $event)
              "
              @keydown="
                handleLongEditorPaneResizeKeydown('story-plot-list', $event)
              "
            />

            <main class="long-story-plot-detail" aria-label="故事情节正文">
              <div
                v-if="showEditorLoading"
                class="long-editor-loading"
              >
                <span class="long-loading-dot" />
                <span>正在读取文件内容…</span>
              </div>
              <div
                v-else-if="showEditorLoadError"
                class="long-editor-unavailable"
                role="status"
              >
                <AppIcon name="file" :size="22" />
                <strong>文件读取失败</strong>
                <span>{{ currentState?.loadError }}</span>
              </div>
              <div
                v-else-if="currentStoryPlot"
                class="long-story-plot-writing-surface"
                :class="{
                  'is-readonly': currentReadOnly || isDocumentContentBusy
                }"
              >
                <input
                  :value="currentStoryPlot.title"
                  class="long-story-plot-title-input"
                  :readonly="
                    currentReadOnly || locked || isDocumentContentBusy
                  "
                  maxlength="256"
                  autocomplete="off"
                  aria-label="故事情节名称"
                  @change="
                    updateStoryPlotTitle(currentStoryPlot.id, $event)
                  "
                />
                <div class="long-story-plot-text-toolbar">
                  <div
                    class="long-editor-view-tabs"
                    role="tablist"
                    aria-label="文本视图"
                  >
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="viewMode === 'edit'"
                      :class="{ 'is-active': viewMode === 'edit' }"
                      :disabled="!canUseTextTools"
                      @click="viewMode = 'edit'"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      role="tab"
                      :aria-selected="viewMode === 'preview'"
                      :class="{ 'is-active': viewMode === 'preview' }"
                      :disabled="!canUseTextTools"
                      @click="viewMode = 'preview'"
                    >
                      预览
                    </button>
                  </div>
                  <span class="long-toolbar-separator" />
                  <div
                    ref="editorToolsElement"
                    class="long-editor-text-tools"
                    role="group"
                    aria-label="文本操作"
                  >
                    <button
                      class="long-format-button"
                      type="button"
                      aria-label="撤销"
                      title="撤销（⌘/Ctrl+Z）"
                      :disabled="!canUndo"
                      @mousedown.prevent
                      @click="undo"
                    >
                      <AppIcon name="undo" :size="16" />
                    </button>
                    <button
                      class="long-format-button"
                      type="button"
                      aria-label="还原"
                      title="还原（⌘/Ctrl+Shift+Z）"
                      :disabled="!canRedo"
                      @mousedown.prevent
                      @click="redo"
                    >
                      <AppIcon name="redo" :size="16" />
                    </button>
                    <button
                      class="long-format-button"
                      :class="{
                        'is-active':
                          findPanelOpen && findPanelMode === 'find'
                      }"
                      type="button"
                      aria-label="查找"
                      title="查找（⌘/Ctrl+F）"
                      :disabled="!canUseTextTools"
                      :aria-pressed="
                        findPanelOpen && findPanelMode === 'find'
                      "
                      @mousedown.prevent
                      @click="toggleFindPanel('find')"
                    >
                      <AppIcon name="search" :size="16" />
                    </button>
                    <button
                      class="long-format-button"
                      :class="{
                        'is-active':
                          findPanelOpen && findPanelMode === 'replace'
                      }"
                      type="button"
                      aria-label="替换"
                      title="替换（⌘⌥F / Ctrl+H）"
                      :disabled="!canUseTextTools"
                      :aria-pressed="
                        findPanelOpen && findPanelMode === 'replace'
                      "
                      @mousedown.prevent
                      @click="toggleFindPanel('replace')"
                    >
                      <AppIcon name="replace" :size="16" />
                    </button>

                    <div
                      v-if="findPanelOpen"
                      ref="findPanelElement"
                      class="long-editor-find-panel"
                      role="dialog"
                      :aria-label="
                        findPanelMode === 'replace'
                          ? '查找和替换'
                          : '查找文字'
                      "
                      @keydown.esc.stop="closeFindPanel"
                    >
                      <div class="long-editor-find-row">
                        <label class="long-editor-find-field">
                          <AppIcon name="search" :size="14" />
                          <input
                            ref="findInput"
                            v-model="searchQuery"
                            type="text"
                            aria-label="查找文字"
                            placeholder="查找"
                            @input="handleFindInput"
                            @keydown.enter.prevent="
                              findMatch($event.shiftKey ? -1 : 1)
                            "
                          />
                          <span
                            class="long-editor-find-count"
                            aria-live="polite"
                          >
                            {{ searchResultLabel }}
                          </span>
                        </label>
                        <button
                          class="long-editor-find-icon-button is-previous"
                          type="button"
                          aria-label="查找上一个"
                          title="查找上一个"
                          @click="findMatch(-1)"
                        >
                          <AppIcon name="chevron" :size="14" />
                        </button>
                        <button
                          class="long-editor-find-icon-button"
                          type="button"
                          aria-label="查找下一个"
                          title="查找下一个"
                          @click="findMatch(1)"
                        >
                          <AppIcon name="chevron" :size="14" />
                        </button>
                        <button
                          class="long-editor-find-icon-button"
                          type="button"
                          aria-label="关闭查找"
                          title="关闭"
                          @click="closeFindPanel"
                        >
                          <AppIcon name="close" :size="14" />
                        </button>
                      </div>
                      <div
                        v-if="findPanelMode === 'replace'"
                        class="long-editor-replace-row"
                      >
                        <label class="long-editor-find-field">
                          <AppIcon name="replace" :size="14" />
                          <input
                            v-model="replacementText"
                            type="text"
                            aria-label="替换为"
                            placeholder="替换为"
                            :disabled="currentReadOnly"
                            @keydown.enter.prevent="replaceCurrentMatch"
                          />
                        </label>
                        <button
                          class="long-editor-find-action"
                          type="button"
                          :disabled="currentReadOnly"
                          @click="replaceCurrentMatch"
                        >
                          替换
                        </button>
                        <button
                          class="long-editor-find-action"
                          type="button"
                          :disabled="currentReadOnly"
                          @click="replaceAllMatches"
                        >
                          全部
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <textarea
                  v-if="viewMode === 'edit'"
                  ref="editorInput"
                  :value="currentVisibleContent"
                  class="long-document-editor long-story-plot-editor"
                  :readonly="currentReadOnly || isDocumentContentBusy"
                  :aria-label="`${currentStoryPlot.title}正文`"
                  spellcheck="false"
                  @beforeinput="handleEditorBeforeInput"
                  @input="handleEditorInput"
                  @keydown="handleEditorKeydown"
                />
                <article
                  v-else
                  class="long-document-preview long-story-plot-editor"
                >
                  <MarkdownContent
                    v-if="currentVisibleContent.trim()"
                    :content="currentVisibleContent"
                  />
                  <p v-else class="is-empty">
                    暂无故事情节正文
                  </p>
                </article>
              </div>
              <div v-else class="long-story-plot-detail-empty">
                <AppIcon name="sparkles" :size="26" />
                <strong>选择一条故事情节查看正文</strong>
                <span>右侧列表管理情节条目，左侧文本框编写内容。</span>
              </div>
            </main>
          </div>
        </section>
        <div
          v-else-if="showEditorLoading"
          class="long-editor-loading"
        >
          <span class="long-loading-dot" />
          <span>正在读取文件内容…</span>
        </div>
        <div
          v-else-if="showEditorLoadError"
          class="long-editor-unavailable"
          role="status"
        >
          <AppIcon name="file" :size="22" />
          <strong>文件读取失败</strong>
          <span>{{ currentState?.loadError }}</span>
          <button
            type="button"
            :disabled="workspaceSavePending"
            @click="loadSelectedDocument(true)"
          >
            重新读取
          </button>
        </div>
        <LongManuscriptEditor
          v-else-if="
            selection.root === 'draft' &&
            (currentState?.loaded ||
              Boolean(currentState?.content) ||
              isDocumentSwitchPending)
          "
          v-model:title-draft="structureTitleDraft"
          :title="currentDocumentTitle"
          :title-editable="Boolean(currentStructureTitleTarget)"
          :title-read-only="currentStructureTitleReadOnly"
          :eyebrow="documentEyebrow"
          :format="currentDocumentFormat"
          :content="currentVisibleContent"
          :view-mode="viewMode"
          :read-only="currentReadOnly"
          :busy="isDocumentContentBusy"
          :committed-notice="
            currentIsCommittedEditableDocument
              ? currentCommittedEditNotice
              : undefined
          "
          @title-change="saveStructureTitle"
          @title-keydown="handleStructureTitleKeydown"
          @beforeinput="handleEditorBeforeInput"
          @input="handleEditorInput"
          @keydown="handleEditorKeydown"
          @editor-element-change="setEditorInputElement"
        />
        <div
          v-else-if="
            currentState?.loaded ||
            Boolean(currentState?.content) ||
            isDocumentSwitchPending ||
            currentIsWorldbuildingList ||
            (currentIsChapterCardWorkspace && currentChapterCard)
          "
          class="long-editor-writing-surface"
          :class="{
            'is-readonly': currentReadOnly || isDocumentContentBusy
          }"
        >
          <div
            v-if="
              currentIsWorldbuildingList &&
              !currentWorldbuildingListState.error &&
              !currentSelectionFile
            "
            class="long-worldbuilding-empty"
          >
            <AppIcon name="file" :size="22" />
            <strong>还没有世界观条目</strong>
            <span>
              新建条目后，可通过{{
                currentUsesLeftTreeWorldbuilding
                  ? "左侧树"
                  : currentUsesRightWorldbuildingList
                    ? "右侧列表"
                    : "上方 Tab"
              }}切换并编辑内容。
            </span>
            <button
              v-if="!currentReadOnly"
              type="button"
              @click="addWorldbuildingItem"
            >
              新建第一个条目
            </button>
          </div>
          <template v-else>
            <div class="long-document-meta-row">
              <span>{{ documentEyebrow }}</span>
              <span v-if="currentDocumentFormat" class="long-document-format">
                {{ currentDocumentFormat }}
              </span>
              <span
                v-if="currentIsCommittedEditableDocument"
                class="long-committed-content-notice"
              >
                {{ currentCommittedEditNotice }}
              </span>
              <span v-else-if="currentReadOnly" class="long-readonly-badge">
                只读内容
              </span>
              <button
                v-if="
                  currentUsesTopWorldbuildingTabs &&
                  currentWorldbuildingItem &&
                  !currentReadOnly
                "
                class="long-worldbuilding-delete-button"
                type="button"
                :disabled="locked"
                @click="
                  openWorldbuildingItemDelete(
                    currentWorldbuildingItem.id
                  )
                "
              >
                删除条目
              </button>
            </div>
            <input
              v-if="
                currentIsWorldbuildingList &&
                !currentWorldbuildingListState.error &&
                currentWorldbuildingItem
              "
              :value="currentWorldbuildingItem.title"
              class="long-document-title-input"
              :readonly="currentReadOnly || locked || isDocumentContentBusy"
              maxlength="256"
              autocomplete="off"
              aria-label="世界观条目名称"
              @change="
                updateWorldbuildingItemTitle(
                  currentWorldbuildingItem.id,
                  $event
                )
              "
            />
            <input
              v-else-if="currentIsCharacterDocument"
              v-model="characterNameDraft"
              class="long-document-title-input"
              :readonly="locked || characterNameSaving"
              maxlength="256"
              autocomplete="off"
              aria-label="人物姓名"
              @change="saveCharacterName"
              @keydown="handleCharacterNameKeydown"
            />
            <input
              v-else-if="currentStructureTitleTarget"
              v-model="structureTitleDraft"
              class="long-document-title-input"
              :readonly="currentStructureTitleReadOnly"
              maxlength="256"
              autocomplete="off"
              :aria-label="currentStructureTitleTarget.inputLabel"
              @change="saveStructureTitle"
              @keydown="handleStructureTitleKeydown"
            />
            <h1 v-else class="long-document-title">
              {{ currentDocumentTitle }}
            </h1>
            <textarea
              v-if="viewMode === 'edit' && !currentReadOnly"
              ref="editorInput"
              :value="currentVisibleContent"
              class="long-document-editor"
              :readonly="currentReadOnly || isDocumentContentBusy"
              :aria-label="`${currentDocumentTitle}${currentDocumentFormat || '内容'}`"
              :maxlength="
                currentIsStructuredText
                  ? 200000
                  : currentIsWorldbuildingList &&
                      !currentWorldbuildingListState.error
                    ? 1000000
                    : undefined
              "
              spellcheck="false"
              @beforeinput="handleEditorBeforeInput"
              @input="handleEditorInput"
              @keydown="handleEditorKeydown"
            />
            <article v-else class="long-document-preview">
              <MarkdownContent
                v-if="currentVisibleContent.trim()"
                :content="currentVisibleContent"
              />
              <p v-else class="is-empty">
                {{
                  currentIsPlotPointStoryline
                    ? "暂无故事情节"
                    : currentIsPlotPointSummary
                      ? "暂无概要"
                      : currentIsChapterCardContent
                        ? "暂无章卡内容"
                      : currentIsVolumeOutline
                        ? "暂无卷纲"
                        : "暂无正文"
                }}
              </p>
            </article>
          </template>
        </div>
        <div
          v-else-if="currentEmptyCollection"
          class="long-editor-writing-surface"
        >
          <div class="long-worldbuilding-empty">
            <AppIcon :name="currentEmptyCollection.icon" :size="22" />
            <strong>{{ currentEmptyCollection.title }}</strong>
            <span>{{ currentEmptyCollection.description }}</span>
            <button
              type="button"
              :disabled="locked"
              @click="createFirstCollectionItem"
            >
              {{ currentEmptyCollection.buttonLabel }}
            </button>
          </div>
        </div>
        <div v-else class="long-editor-unavailable">
          <AppIcon
            :name="
              selection.key.startsWith('character-group:')
                ? 'user'
                : 'file'
            "
            :size="22"
          />
          <strong>{{ selection.title }}</strong>
          <span>
            {{
              selection.description ??
              "选择该目录中的文件后将在这里加载内容。"
            }}
          </span>
        </div>

        <div
          v-if="currentUsesAnyRightEntryList"
          class="long-editor-internal-resizer long-entry-list-resizer"
          role="separator"
          aria-label="调整右侧条目列表宽度"
          aria-orientation="vertical"
          :aria-valuemin="LONG_EDITOR_LIST_MIN_WIDTH"
          :aria-valuemax="entryListMaxWidth"
          :aria-valuenow="entryListWidth ?? LONG_EDITOR_LIST_MIN_WIDTH"
          tabindex="0"
          @pointerdown="startLongEditorPaneResize('entry-list', $event)"
          @keydown="handleLongEditorPaneResizeKeydown('entry-list', $event)"
        />

        <LongWorldbuildingNavigation
          v-if="currentUsesRightWorldbuildingList"
          mode="right-list"
          :items="currentWorldbuildingItems"
          :active-item-id="activeWorldbuildingItemId"
          :pending-item-id="pendingWorldbuildingItemId"
          :pending-overview="pendingWorldbuildingOverview"
          :read-only="currentReadOnly"
          :locked="locked"
          @select-overview="selectWorldbuildingOverview"
          @select-item="selectWorldbuildingItem"
          @add-item="addWorldbuildingItem"
          @delete-item="openWorldbuildingItemDelete"
        />
        <LongCharacterNavigation
          v-if="currentUsesRightCharacterList"
          mode="right-list"
          :label="`${selection.characterGroup ?? '人物'}人物`"
          :title="selection.title"
          :items="currentCharacterNavigationItems"
          :active-character-id="selection.characterId ?? null"
          :pending-character-id="pendingCharacterId"
          :locked="locked"
          :can-delete="Boolean(currentNavigationDeleteTarget)"
          @select-character="requestSelectCharacter"
          @create-character="emit('createCharacter')"
          @delete-character="openNavigationDelete"
        />
        <aside
          v-if="currentUsesRightBookLineList"
          class="long-story-plot-pane long-entry-list-pane"
          aria-label="全书故事线列表"
        >
          <header>
            <div>
              <strong>全书故事线</strong>
              <span>{{ orderedBookLineVolumes.length + 1 }}</span>
            </div>
            <div v-if="!currentReadOnly" class="long-entry-list-actions">
              <button type="button" aria-label="新建分卷" title="新建分卷" @click="requestCreateVolume">
                <AppIcon name="plus" :size="14" />
              </button>
              <button
                type="button"
                aria-label="删除当前分卷"
                :disabled="locked || !currentNavigationDeleteTarget"
                @click="openNavigationDelete"
              >
                <AppIcon name="minus" :size="14" />
              </button>
            </div>
          </header>
          <div class="long-story-plot-list" role="list">
            <article class="long-story-plot-card" :class="{ 'is-active': activeBookLineVolumeId === null }" role="listitem">
              <button class="long-story-plot-card-main" type="button" :aria-pressed="activeBookLineVolumeId === null" @click="selectBookLineOverview">
                <span class="long-story-plot-card-order">—</span>
                <span class="long-story-plot-card-title">全书总纲</span>
              </button>
            </article>
            <article
              v-for="volume in orderedBookLineVolumes"
              :key="volume.id"
              class="long-story-plot-card"
              :class="{ 'is-active': activeBookLineVolumeId === volume.id }"
              role="listitem"
            >
              <button class="long-story-plot-card-main" type="button" :aria-pressed="activeBookLineVolumeId === volume.id" :title="volume.title" @click="selectBookLineVolume(volume.id)">
                <span class="long-story-plot-card-order">{{ volume.order }}</span>
                <span class="long-story-plot-card-title">{{ volume.title }}</span>
              </button>
            </article>
          </div>
        </aside>
        <aside
          v-if="currentUsesRightPlotPointList"
          class="long-story-plot-pane long-entry-list-pane"
          aria-label="剧情点列表"
        >
          <header>
            <div>
              <strong>剧情点</strong>
              <span>{{ selection.plotPointTabs?.length ?? 0 }}</span>
            </div>
            <div v-if="!currentReadOnly" class="long-entry-list-actions">
              <button type="button" aria-label="新增剧情点" title="新增剧情点" :disabled="locked" @click="emit('createPlotPoint')">
                <AppIcon name="plus" :size="14" />
              </button>
              <button type="button" aria-label="删除当前剧情点" :disabled="locked || !currentNavigationDeleteTarget" @click="openNavigationDelete">
                <AppIcon name="minus" :size="14" />
              </button>
            </div>
          </header>
          <div class="long-story-plot-list" role="list">
            <article
              v-for="(plotPoint, index) in selection.plotPointTabs"
              :key="plotPoint.id"
              class="long-story-plot-card"
              :class="{ 'is-active': selection.plotPointId === plotPoint.id }"
              role="listitem"
            >
              <button class="long-story-plot-card-main" type="button" :aria-pressed="selection.plotPointId === plotPoint.id" :title="plotPoint.label" @click="emit('selectPlotPoint', plotPoint.id)">
                <span class="long-story-plot-card-order">{{ index + 1 }}</span>
                <span class="long-story-plot-card-title">{{ plotPoint.label }}</span>
              </button>
            </article>
          </div>
        </aside>
        <LongManuscriptNavigation
          v-if="currentUsesRightChapterCardList"
          mode="right-list"
          label="章卡列表"
          :items="selection.chapterCardTabs ?? []"
          :active-chapter-id="selection.chapterCardId ?? null"
          :locked="locked"
          :committed="currentChapterCardCommitted"
          @select-chapter="emit('selectChapterCard', $event)"
          @create-chapter="emit('createChapterCard')"
          @delete-chapter="openChapterCardDelete"
          @reorder-chapter="reorderChapterCard"
        />
        <LongContinuityLedgerNavigation
          v-if="currentUsesRightContinuityList"
          mode="right-list"
          :title="selection.title"
          :items="currentContinuityNavigationItems"
          :active-file-id="currentSelectionFile?.file.id ?? null"
          :pending-file-id="pendingFileId"
          @select-file="selectWorkspaceFile"
        />
      </div>

      <footer class="long-editor-footer">
        <span>
          {{
            currentIsForeshadowingView
              ? `${workspaceIndex?.plot.foreshadowing.length ?? 0} 条伏笔线`
              : currentIsPlotPointStoryline
                ? `${currentStoryPlots.length} 条故事情节`
                : `${characterCount.toLocaleString("zh-CN")} 字`
          }}
        </span>
        <span>
          {{
            currentIsForeshadowingView
              ? locked
                ? lockedReason ?? "编辑暂时锁定"
                : "结构修改会直接保存到本机"
              : currentIsPlotPointStoryline
                ? locked
                  ? lockedReason ?? "编辑暂时锁定"
                  : currentDirty
                    ? "本机文稿 · 有未保存修改"
                    : currentStoryPlot
                      ? "结构修改会直接保存到本机"
                      : "选择情节后可编辑正文"
              : locked
              ? lockedReason ?? "编辑暂时锁定 · 防止版本冲突"
              : currentSaving
                ? "正在原子保存本机文稿"
                : currentReadOnly
                  ? "本机文稿 · 只读"
                  : currentDirty
                    ? "本机文稿 · 有未保存修改"
                    : currentState?.loaded || currentIsStructuredText
                      ? "本机文稿 · 已保存"
                      : "本机文稿 · 等待读取"
          }}
        </span>
        <span class="long-footer-spacer" />
        <button
          v-if="!currentIsForeshadowingView"
          class="long-editor-save-button"
          type="button"
          :disabled="
            currentReadOnly ||
            !currentDirty ||
            isDocumentContentBusy ||
            currentSaving ||
            workspaceSavePending
          "
          @click="saveCurrentDocument"
        >
          <AppIcon name="save" :size="14" />
          {{ currentSaving ? "保存中…" : "立即保存" }}
        </button>
      </footer>
    </template>

    <div v-else class="long-editor-empty">
      <span class="long-editor-empty-icon">
        <AppIcon name="book" :size="28" />
      </span>
      <h2>选择一个长篇文件</h2>
      <p>从左侧五个工作区根目录中选择设定、人物、故事线、章节或账本记录。</p>
    </div>

    <Teleport to="body">
      <div
        v-if="pendingStoryPlotDelete"
        class="dialog-backdrop long-worldbuilding-delete-overlay"
        @mousedown.self="cancelStoryPlotDelete"
      >
        <section
          class="long-worldbuilding-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="long-story-plot-delete-title"
          aria-describedby="long-story-plot-delete-description"
          tabindex="-1"
        >
          <span>删除故事情节</span>
          <h3 id="long-story-plot-delete-title">
            确认删除“{{ pendingStoryPlotDelete.title }}”？
          </h3>
          <p id="long-story-plot-delete-description">
            保存后该情节及其正文文件将从本机删除。
          </p>
          <footer>
            <button type="button" @click="cancelStoryPlotDelete">
              取消
            </button>
            <button
              class="is-danger"
              type="button"
              @click="confirmStoryPlotDelete"
            >
              确认删除
            </button>
          </footer>
        </section>
      </div>
      <div
        v-if="pendingWorldbuildingDeleteItem"
        class="dialog-backdrop long-worldbuilding-delete-overlay"
        @mousedown.self="closeWorldbuildingItemDelete"
        @keydown="handleWorldbuildingDeleteKeydown"
      >
        <section
          ref="worldbuildingDeleteDialog"
          class="long-worldbuilding-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="long-worldbuilding-delete-title"
          aria-describedby="long-worldbuilding-delete-description"
          tabindex="-1"
        >
          <span>删除世界观条目</span>
          <h3 id="long-worldbuilding-delete-title">
            确认删除“{{ pendingWorldbuildingDeleteItem.title }}”？
          </h3>
          <p id="long-worldbuilding-delete-description">
            保存后该条目及其内容将从本机文件中删除。
          </p>
          <footer>
            <button
              ref="worldbuildingDeleteCancelButton"
              type="button"
              @click="closeWorldbuildingItemDelete"
            >
              取消
            </button>
            <button
              class="is-danger"
              type="button"
              @click="confirmWorldbuildingItemDelete"
            >
              确认删除
            </button>
          </footer>
        </section>
      </div>
      <div
        v-if="navigationDeleteTarget"
        class="dialog-backdrop long-navigation-delete-overlay"
        @mousedown.self="closeNavigationDelete"
        @keydown="handleNavigationDeleteKeydown"
      >
        <section
          ref="navigationDeleteDialog"
          class="long-navigation-delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="long-navigation-delete-title"
          aria-describedby="long-navigation-delete-description"
          tabindex="-1"
        >
          <span>删除{{ navigationDeleteTarget.label }}</span>
          <h3 id="long-navigation-delete-title">
            确认删除“{{ navigationDeleteTarget.title }}”？
          </h3>
          <p id="long-navigation-delete-description">
            {{ navigationDeleteTarget.description }}
          </p>
          <footer>
            <button
              ref="navigationDeleteCancelButton"
              type="button"
              :disabled="navigationDeletePending"
              @click="closeNavigationDelete"
            >
              取消
            </button>
            <button
              class="is-danger"
              type="button"
              :disabled="navigationDeletePending"
              @click="confirmNavigationDelete"
            >
              {{ navigationDeletePending ? "删除中…" : "确认删除" }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./LongWorkspaceEditor.css"></style>
