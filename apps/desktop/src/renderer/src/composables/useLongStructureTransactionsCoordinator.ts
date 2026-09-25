import {
  type LongArcId,
  type LongBookSummary,
  type LongChapterCardId,
  type LongCharacterId,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import { computed, nextTick, type Ref } from "vue";
import type {
  LongChapterCardCreateTarget,
  LongCharacterCreateTarget,
  LongDraftSectionDeleteTarget,
  LongPlotPointCreateTarget,
  LongTreeItemDeleteTarget,
  LongWorldbuildingItemCreateTarget
} from "../stores/longWorkspaceStore";
import type {
  LongTreeItemAction,
  ResourceTreeNode
} from "../types/workspace";
import {
  createLongCharacterGroupSelection,
  createLongChapterSelection,
  isLongMigrationEvidenceCategoryId,
  replaceLongBookSummary,
  type LongStructureMutationCompletion,
  type LongWorkspaceRendererApi,
  type LongWorkspaceSelection
} from "../types/longWorkspace";
import type { LongWorldbuildingSyncBookOption } from "../utils/longWorldbuildingSync";
import { longNavigationNodeId } from "../utils/longWorkspaceResourceTree";
import type { LongWorkspaceEditorPort } from "./useLongWorkspaceSessionCoordinator";

let longStructureMutationModulePromise:
  | Promise<typeof import("../types/longStructureMutations")>
  | null = null;

function loadLongStructureMutationModule() {
  return (
    longStructureMutationModulePromise ??=
      import("../types/longStructureMutations")
  );
}

export interface LongStructureTransactionsNotifications {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface LongStructureTransactionsState {
  longBooks: Ref<readonly LongBookSummary[]>;
  activeBookId: Ref<string | null>;
  activeBookSummary: Readonly<Ref<LongBookSummary | null>>;
  workspaceIndex: Ref<LongWorkspaceIndexSnapshot | null>;
  selection: Ref<LongWorkspaceSelection | null>;
  mutationPending: Ref<boolean>;
  structureDialogOpen: Ref<boolean>;
  characterCreateTarget: Ref<LongCharacterCreateTarget | null>;
  worldbuildingItemCreateTarget: Ref<LongWorldbuildingItemCreateTarget | null>;
  plotPointCreateTarget: Ref<LongPlotPointCreateTarget | null>;
  chapterCardCreateTarget: Ref<LongChapterCardCreateTarget | null>;
  draftSectionDeleteTarget: Ref<LongDraftSectionDeleteTarget | null>;
  treeItemDeleteTarget: Ref<LongTreeItemDeleteTarget | null>;
  volumeCreateTarget: Ref<{ readonly bookId: string } | null>;
  selectedResourceId: Ref<string>;
}

export interface LongStructureTransactionsSessionPort {
  blockWritingPlan(action: string): boolean;
  saveActiveEditorChanges(): Promise<boolean>;
  saveActiveEditorBeforeLeaving(nextBookId?: string): Promise<boolean>;
  openBook(
    bookId: string,
    requestedSelection?: LongWorkspaceSelection | null
  ): Promise<void>;
  refreshActiveWorkspace(bookId: string): Promise<boolean>;
  refreshWritingSaveBarrier(bookId: string): Promise<boolean>;
  selectWorkspaceFile(selection: LongWorkspaceSelection): Promise<boolean>;
  selectChapterCardTab(chapterCardId: LongChapterCardId): Promise<void>;
  editor: Readonly<Ref<LongWorkspaceEditorPort | null>>;
}

export interface LongStructureTransactionsResourcePort {
  node(resourceId: string): ResourceTreeNode | undefined;
  select(node: ResourceTreeNode): Promise<unknown>;
  synchronizeSelectedResourceForLayout(bookId: string): void;
  revealEditor(): void;
}

export interface LongStructureTransactionsCoordinatorOptions {
  api(): LongWorkspaceRendererApi | undefined;
  state: LongStructureTransactionsState;
  session: LongStructureTransactionsSessionPort;
  resources: LongStructureTransactionsResourcePort;
  notifications: LongStructureTransactionsNotifications;
}

interface LongStructureMutationTargetSnapshot {
  readonly bookId: string;
  readonly index: LongWorkspaceIndexSnapshot;
  readonly revision: number;
}

interface LongStructureMutationLease {
  readonly requestId: number;
  readonly target: LongStructureMutationTargetSnapshot;
  applied: boolean;
}

interface LongTreeItemDetails {
  label: string;
  title: string;
  description: string;
  orderedIds: string[];
  parentResourceId: string;
  resourceIdForItem(id: string): string;
}

const NOOP_COMPLETION: LongStructureMutationCompletion = {
  succeed: () => undefined,
  fail: () => undefined,
  appliedButRefreshFailed: () => undefined
};

/**
 * Owns long-form structure CRUD and its durable preview/CAS/apply transaction.
 * Continuity rollback, generic long navigation, approvals and conversations
 * deliberately remain outside this boundary.
 */
export function useLongStructureTransactionsCoordinator(
  options: LongStructureTransactionsCoordinatorOptions
) {
  const { notifications: uiMessage, resources, session, state } = options;
  const {
    longBooks,
    activeBookId: activeLongBookId,
    activeBookSummary: activeLongBookSummary,
    workspaceIndex: activeLongWorkspaceIndex,
    selection: activeLongSelection,
    mutationPending: longBookActionPending,
    structureDialogOpen: longStructureDialogOpen,
    characterCreateTarget: longCharacterCreate,
    worldbuildingItemCreateTarget: longWorldbuildingItemCreate,
    plotPointCreateTarget: longPlotPointCreate,
    chapterCardCreateTarget: longChapterCardCreate,
    draftSectionDeleteTarget: longDraftSectionDelete,
    treeItemDeleteTarget: longTreeItemDelete,
    volumeCreateTarget: longVolumeCreate,
    selectedResourceId
  } = state;
  const {
    blockWritingPlan: blockActiveLongWritingPlan,
    saveActiveEditorChanges: saveActiveLongEditorChanges,
    saveActiveEditorBeforeLeaving: saveActiveLongEditorBeforeLeaving,
    openBook: openLongBook,
    refreshActiveWorkspace: refreshActiveLongWorkspace,
    refreshWritingSaveBarrier: refreshLongWritingSaveBarrier,
    selectWorkspaceFile: selectLongWorkspaceFile,
    selectChapterCardTab: selectLongChapterCardTab,
    editor: longWorkspaceEditor
  } = session;
  const resourceNode = resources.node;
  const selectResource = resources.select;
  const resolveLongWorkspaceApi = options.api;

  const longWorldbuildingSyncBookOptions = computed<
    LongWorldbuildingSyncBookOption[]
  >(() =>
    longBooks.value.map((book) => ({
      id: book.id,
      title: book.title,
      categoryCount: book.navigation.worldbuilding.filter(
        (category) => !isLongMigrationEvidenceCategoryId(category.id)
      ).length
    }))
  );

  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  let mutationRequestEpoch = 0;
  let dialogRequestEpoch = 0;
  let activeMutation: LongStructureMutationLease | null = null;
  const inFlightOperations = new Set<Promise<unknown>>();

  function captureLongStructureMutationTarget(
    expectedBookId: string | null | undefined
  ): LongStructureMutationTargetSnapshot | null {
    const summary = activeLongBookSummary.value;
    const index = activeLongWorkspaceIndex.value;
    if (
      !expectedBookId ||
      activeLongBookId.value !== expectedBookId ||
      summary?.id !== expectedBookId ||
      !index
    ) {
      return null;
    }
    return {
      bookId: expectedBookId,
      index,
      revision: index.revision
    };
  }

  function mutationIsCurrent(lease: LongStructureMutationLease): boolean {
    return (
      !disposed &&
      activeMutation === lease &&
      lease.requestId === mutationRequestEpoch
    );
  }

  function assertCurrentLongStructureMutationTarget(
    target: LongStructureMutationTargetSnapshot,
    lease: LongStructureMutationLease,
    message = "活动长篇或结构已切换，本次修改未保存。"
  ): void {
    const current = captureLongStructureMutationTarget(target.bookId);
    if (
      !mutationIsCurrent(lease) ||
      !current ||
      current.index !== target.index ||
      current.revision !== target.revision
    ) {
      throw new Error(message);
    }
  }

  function acquireMutation(
    expectedBookId: string | null | undefined
  ):
    | { lease: LongStructureMutationLease }
    | { message: string }
    | null {
    if (disposed) return null;
    const target = captureLongStructureMutationTarget(expectedBookId);
    if (!target) return { message: "当前长篇结构尚未就绪。" };
    if (activeMutation || longBookActionPending.value) {
      return { message: "另一项长篇结构修改仍在处理中。" };
    }
    const lease: LongStructureMutationLease = {
      requestId: ++mutationRequestEpoch,
      target,
      applied: false
    };
    activeMutation = lease;
    longBookActionPending.value = true;
    return { lease };
  }

  async function runWithMutationLease(
    lease: LongStructureMutationLease,
    task: () => Promise<void>
  ): Promise<void> {
    const operation = Promise.resolve().then(task);
    inFlightOperations.add(operation);
    try {
      await operation;
    } finally {
      inFlightOperations.delete(operation);
      if (activeMutation === lease) {
        activeMutation = null;
        longBookActionPending.value = false;
      }
    }
  }

  async function withMutation(
    expectedBookId: string | null | undefined,
    onRejected: (message: string) => void,
    task: (lease: LongStructureMutationLease) => Promise<void>
  ): Promise<void> {
    const acquired = acquireMutation(expectedBookId);
    if (!acquired) return;
    if ("message" in acquired) {
      onRejected(acquired.message);
      return;
    }
    await runWithMutationLease(acquired.lease, () => task(acquired.lease));
  }

  async function runTracked<T>(task: () => Promise<T>): Promise<T> {
    const operation = Promise.resolve().then(task);
    inFlightOperations.add(operation);
    try {
      return await operation;
    } finally {
      inFlightOperations.delete(operation);
    }
  }

  function beginDialogRequest(): number | null {
    if (disposed) return null;
    return ++dialogRequestEpoch;
  }

  function dialogRequestIsCurrent(requestId: number): boolean {
    return !disposed && dialogRequestEpoch === requestId;
  }

  function cancelDialogRequests(): void {
    dialogRequestEpoch += 1;
  }

  function closeLongStructureDialog(): void {
    cancelDialogRequests();
    longStructureDialogOpen.value = false;
  }

  function closeLongCharacterCreate(): void {
    cancelDialogRequests();
    longCharacterCreate.value = null;
  }

  function closeLongWorldbuildingItemCreate(): void {
    cancelDialogRequests();
    longWorldbuildingItemCreate.value = null;
  }

  function closeLongPlotPointCreate(): void {
    cancelDialogRequests();
    longPlotPointCreate.value = null;
  }

  function closeLongChapterCardCreate(): void {
    cancelDialogRequests();
    longChapterCardCreate.value = null;
  }

  function closeLongDraftSectionDelete(): void {
    cancelDialogRequests();
    longDraftSectionDelete.value = null;
  }

  function closeLongTreeItemDelete(): void {
    cancelDialogRequests();
    longTreeItemDelete.value = null;
  }

  function closeLongVolumeCreate(): void {
    cancelDialogRequests();
    longVolumeCreate.value = null;
  }

  async function drain(): Promise<void> {
    while (inFlightOperations.size > 0) {
      await Promise.allSettled([...inFlightOperations]);
    }
  }

  async function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    if (disposed) return;
    disposed = true;
    mutationRequestEpoch += 1;
    dialogRequestEpoch += 1;
    disposePromise = (async () => {
      await drain();
      longBookActionPending.value = false;
    })();
    await disposePromise;
  }

  async function openLongChapterCardCreateInternal(
    requestId: number,
    target?: {
      bookId: string;
      volumeId: string;
      source?: "chapter-card" | "draft";
    }
  ): Promise<void> {
    const volumeId =
      target?.volumeId ?? activeLongSelection.value?.chapterCardVolumeId;
    const bookId = target?.bookId ?? activeLongBookId.value;
    const source = target?.source ?? "chapter-card";
    if (
      !volumeId ||
      !bookId ||
      blockActiveLongWritingPlan(source === "draft" ? "新增小节" : "新增章卡")
    ) {
      return;
    }
    if (activeLongBookId.value !== bookId) {
      if (!(await saveActiveLongEditorBeforeLeaving(bookId))) return;
      if (!dialogRequestIsCurrent(requestId)) return;
      await openLongBook(bookId);
    } else if (!(await saveActiveLongEditorChanges())) {
      return;
    }
    if (!dialogRequestIsCurrent(requestId)) return;
    const index = activeLongWorkspaceIndex.value;
    const volume = index?.plot.volumes.find(({ id }) => id === volumeId);
    if (activeLongBookId.value !== bookId || !index || !volume) {
      uiMessage.warning("该分卷已不存在，请刷新后重试。");
      return;
    }
    longChapterCardCreate.value = {
      bookId,
      volumeId,
      volumeTitle: volume.title,
      arcOptions: index.plot.arcs
        .filter((arc) => arc.volumeId === volumeId)
        .sort(
          (left, right) =>
            left.order - right.order || left.id.localeCompare(right.id)
        )
        .map((arc) => ({ value: arc.id, label: arc.title })),
      source
    };
  }

  async function openLongChapterCardCreate(target?: {
    bookId: string;
    volumeId: string;
    source?: "chapter-card" | "draft";
  }): Promise<void> {
    const requestId = beginDialogRequest();
    if (requestId === null) return;
    await runTracked(() => openLongChapterCardCreateInternal(requestId, target));
  }

  async function requestCreateLongDraftSection(
    node: ResourceTreeNode
  ): Promise<void> {
    if (!node.longBookId || !node.longDraftVolumeId) {
      uiMessage.warning("当前分卷尚未准备好新建小节。");
      return;
    }
    await openLongChapterCardCreate({
      bookId: node.longBookId,
      volumeId: node.longDraftVolumeId,
      source: "draft"
    });
  }

  async function handleLongDraftSectionAction(
    action: "move-up" | "move-down" | "delete",
    node: ResourceTreeNode
  ): Promise<void> {
    await runTracked(async () => {
      const bookId = node.longBookId;
      const chapterCardId = node.longWorkspaceSelection?.chapterCardId;
      if (
        !bookId ||
        !chapterCardId ||
        node.longWorkspaceSelection?.root !== "draft"
      ) {
        uiMessage.warning("当前小节尚未准备好。");
        return;
      }
      if (
        blockActiveLongWritingPlan(
          action === "delete" ? "删除小节" : "调整小节顺序"
        )
      ) {
        return;
      }
      if (activeLongBookId.value !== bookId) {
        if (!(await saveActiveLongEditorBeforeLeaving(bookId))) return;
        await openLongBook(bookId);
      } else if (!(await saveActiveLongEditorChanges())) {
        return;
      }
      if (disposed) return;
      const index = activeLongWorkspaceIndex.value;
      const chapter = index?.plot.chapterCards.find(
        ({ id }) => id === chapterCardId
      );
      if (activeLongBookId.value !== bookId || !index || !chapter) {
        uiMessage.warning("该小节已不存在，请刷新后重试。");
        return;
      }
      if (action === "delete") {
        cancelDialogRequests();
        longDraftSectionDelete.value = {
          bookId,
          chapterCardId,
          volumeId: chapter.volumeId,
          title: chapter.title
        };
        return;
      }
      await withMutation(
        bookId,
        (message) => uiMessage.info(message),
        async (lease) => {
          if (lease.target.index !== index) {
            uiMessage.warning("活动长篇或结构已切换，本次调整已取消。");
            return;
          }
          let batch: LongWorkspaceOperationBatch;
          try {
            const { createLongStructureMutationBuilder } =
              await loadLongStructureMutationModule();
            assertCurrentLongStructureMutationTarget(
              lease.target,
              lease,
              "活动长篇或结构已切换，本次调整已取消。"
            );
            batch = createLongStructureMutationBuilder(index).reorderChapter(
              chapterCardId,
              action === "move-up" ? "up" : "down"
            );
          } catch (error: unknown) {
            if (disposed) return;
            uiMessage.warning(
              error instanceof Error ? error.message : "无法调整小节顺序。"
            );
            return;
          }
          await executeLongStructureMutation(
            lease,
            batch,
            NOOP_COMPLETION,
            {
              saveEditor: false,
              successMessage:
                action === "move-up"
                  ? `已上移小节“${chapter.title}”`
                  : `已下移小节“${chapter.title}”`
            },
            index
          );
        }
      );
    });
  }

  async function ensureLongTreeTargetBook(
    node: ResourceTreeNode,
    actionLabel: string,
    requestId: number
  ): Promise<{
    bookId: string;
    summary: LongBookSummary;
    index: LongWorkspaceIndexSnapshot;
  } | null> {
    const bookId = node.longBookId;
    if (!bookId || node.workspaceType !== "long") {
      uiMessage.warning(`当前长篇尚未准备好${actionLabel}。`);
      return null;
    }
    if (blockActiveLongWritingPlan(actionLabel)) return null;
    if (activeLongBookId.value !== bookId) {
      if (!(await saveActiveLongEditorBeforeLeaving(bookId))) return null;
      if (!dialogRequestIsCurrent(requestId)) return null;
      await openLongBook(bookId, node.longWorkspaceSelection ?? null);
    }
    if (!dialogRequestIsCurrent(requestId)) return null;
    const summary = activeLongBookSummary.value;
    const index = activeLongWorkspaceIndex.value;
    if (!summary || !index || summary.id !== bookId) {
      uiMessage.warning(`当前长篇尚未准备好${actionLabel}。`);
      return null;
    }
    return { bookId, summary, index };
  }

  function resolveLongTreeItemDetails(
    bookId: string,
    index: LongWorkspaceIndexSnapshot,
    node: ResourceTreeNode
  ): LongTreeItemDetails | null {
    const target = node.longTreeItem;
    if (!target) return null;
    if (target.kind === "worldbuilding-item") {
      const category = index.worldbuilding.find(
        ({ id }) => id === target.parentId
      );
      if (!category || category.format !== "list") return null;
      const item = category.items.find(({ id }) => id === target.id);
      if (!item) return null;
      const orderedIds = [...category.items]
        .sort((left, right) => left.order - right.order)
        .map(({ id }) => id);
      return {
        label: "世界观条目",
        title: item.title,
        description: "将永久删除该世界观条目及其正文文件。",
        orderedIds,
        parentResourceId: longNavigationNodeId(
          bookId,
          `worldbuilding:${category.id}`
        ),
        resourceIdForItem: (id) =>
          longNavigationNodeId(
            bookId,
            `worldbuilding:${category.id}:item:${id}`
          )
      };
    }
    if (target.kind === "character") {
      const character = index.characters.find(({ id }) => id === target.id);
      if (!character) return null;
      const eventReferences = index.plot.storyEvents.filter((event) =>
        event.characterIds.includes(character.id)
      ).length;
      const orderedIds = index.characters
        .filter(({ group }) => group === character.group)
        .sort((left, right) => left.order - right.order)
        .map(({ id }) => id);
      return {
        label: "人物",
        title: character.name,
        description: `将永久删除该人物的四份人物档案${
          eventReferences > 0
            ? `，并从 ${eventReferences} 个故事事件中移除人物引用`
            : ""
        }。`,
        orderedIds,
        parentResourceId: longNavigationNodeId(
          bookId,
          `character-group:${character.group}`
        ),
        resourceIdForItem: (id) =>
          longNavigationNodeId(bookId, `character:${id}`)
      };
    }
    if (target.kind === "volume") {
      const volume = index.plot.volumes.find(({ id }) => id === target.id);
      if (!volume) return null;
      const plotPointCount = index.plot.arcs.filter(
        ({ volumeId }) => volumeId === volume.id
      ).length;
      const chapterCount = index.plot.chapterCards.filter(
        ({ volumeId }) => volumeId === volume.id
      ).length;
      return {
        label: "分卷",
        title: volume.title,
        description: `将永久删除该分卷，以及其中 ${plotPointCount} 个剧情点、${chapterCount} 张章卡及对应正文文件和关联数据。`,
        orderedIds: [...index.plot.volumes]
          .sort((left, right) => left.order - right.order)
          .map(({ id }) => id),
        parentResourceId: longNavigationNodeId(
          bookId,
          "plot-design:book-line"
        ),
        resourceIdForItem: (id) =>
          longNavigationNodeId(bookId, `plot-design:book-line:volume:${id}`)
      };
    }
    if (target.kind === "plot-point") {
      const plotPoint = index.plot.arcs.find(({ id }) => id === target.id);
      if (!plotPoint) return null;
      return {
        label: "剧情点",
        title: plotPoint.title,
        description:
          "将永久删除该剧情点、相关事件和伏笔关联；已关联章卡会保留并解除关联。",
        orderedIds: index.plot.arcs
          .filter(({ volumeId }) => volumeId === plotPoint.volumeId)
          .sort((left, right) => left.order - right.order)
          .map(({ id }) => id),
        parentResourceId: longNavigationNodeId(
          bookId,
          `plot-design:plot-points:${plotPoint.volumeId}`
        ),
        resourceIdForItem: (id) =>
          longNavigationNodeId(bookId, `plot-design:plot-point:${id}`)
      };
    }
    const chapter = index.plot.chapterCards.find(({ id }) => id === target.id);
    if (!chapter) return null;
    return {
      label: "章卡",
      title: chapter.title,
      description:
        "将永久删除该章卡、章节正文、章末人物状态、下一章接续包，以及相关剧情落点和伏笔触点。",
      orderedIds: index.plot.chapterCards
        .filter(({ volumeId }) => volumeId === chapter.volumeId)
        .sort((left, right) => left.narrativeOrder - right.narrativeOrder)
        .map(({ id }) => id),
      parentResourceId: longNavigationNodeId(
        bookId,
        `plot-design:chapter-cards:${chapter.volumeId}`
      ),
      resourceIdForItem: (id) =>
        longNavigationNodeId(bookId, `plot-design:chapter-card:${id}`)
    };
  }

  function isActiveLongTreeItem(node: ResourceTreeNode): boolean {
    const target = node.longTreeItem;
    const selection = activeLongSelection.value;
    if (!target || !selection) return false;
    if (target.kind === "worldbuilding-item") {
      return selection.worldbuildingItemId === target.id;
    }
    if (target.kind === "character") {
      return selection.characterId === target.id;
    }
    if (target.kind === "volume") {
      return selection.bookLineVolumeId === target.id;
    }
    if (target.kind === "plot-point") {
      return selection.plotPointId === target.id;
    }
    return selection.chapterCardId === target.id;
  }

  async function openLongWorldbuildingItemCreateForCategoryInternal(
    requestId: number,
    bookId: string,
    categoryId: string
  ): Promise<void> {
    if (blockActiveLongWritingPlan("新增世界观条目")) return;
    if (activeLongBookId.value !== bookId) {
      if (!(await saveActiveLongEditorBeforeLeaving(bookId))) return;
      if (!dialogRequestIsCurrent(requestId)) return;
      await openLongBook(bookId);
    } else if (!(await saveActiveLongEditorChanges())) {
      return;
    }
    if (!dialogRequestIsCurrent(requestId)) return;
    const index = activeLongWorkspaceIndex.value;
    const category = index?.worldbuilding.find(({ id }) => id === categoryId);
    if (activeLongBookId.value !== bookId || !index || !category) {
      uiMessage.warning("该世界观分类已不存在，请刷新后重试。");
      return;
    }
    if (category.format !== "list") {
      uiMessage.warning("只有列表型世界观分类可以新增条目。");
      return;
    }
    if (category.items.length >= 10_000) {
      uiMessage.warning("单个世界观分类最多支持 10000 个条目。");
      return;
    }
    longWorldbuildingItemCreate.value = {
      bookId,
      categoryId,
      categoryTitle: category.title
    };
  }

  async function handleCreateLongTreeItem(node: ResourceTreeNode): Promise<void> {
    const requestId = beginDialogRequest();
    if (requestId === null) return;
    await runTracked(async () => {
      const target = node.longTreeCollection;
      if (!target) return;
      if (target.kind === "worldbuilding-item" && target.parentId) {
        const prepared = await ensureLongTreeTargetBook(
          node,
          "新增世界观条目",
          requestId
        );
        if (!prepared || !dialogRequestIsCurrent(requestId)) return;
        await openLongWorldbuildingItemCreateForCategoryInternal(
          requestId,
          prepared.bookId,
          target.parentId
        );
        return;
      }
      const prepared = await ensureLongTreeTargetBook(
        node,
        "新增条目",
        requestId
      );
      if (!prepared || !dialogRequestIsCurrent(requestId)) return;
      if (target.kind === "character" && target.parentId) {
        const group = prepared.index.characterTypes.find(
          ({ id }) => id === target.parentId
        );
        if (!group) {
          uiMessage.warning("当前人物类型已不存在，请刷新后重试。");
          return;
        }
        longCharacterCreate.value = {
          bookId: prepared.bookId,
          group: group.id,
          groupLabel: group.title
        };
        return;
      }
      if (target.kind === "volume") {
        longVolumeCreate.value = { bookId: prepared.bookId };
        return;
      }
      if (target.kind === "plot-point" && target.parentId) {
        await openLongPlotPointCreateForVolumeInternal(
          requestId,
          prepared.bookId,
          target.parentId
        );
        return;
      }
      if (target.kind === "chapter-card" && target.parentId) {
        await openLongChapterCardCreateInternal(requestId, {
          bookId: prepared.bookId,
          volumeId: target.parentId,
          source: "chapter-card"
        });
      }
    });
  }

  async function handleLongTreeItemAction(
    action: LongTreeItemAction,
    node: ResourceTreeNode
  ): Promise<void> {
    const requestId = beginDialogRequest();
    if (requestId === null) return;
    await runTracked(async () => {
      const target = node.longTreeItem;
      if (!target) return;
      const prepared = await ensureLongTreeTargetBook(
        node,
        action === "delete" ? "删除条目" : "调整条目顺序",
        requestId
      );
      if (!prepared || !dialogRequestIsCurrent(requestId)) return;
      const details = resolveLongTreeItemDetails(
        prepared.bookId,
        prepared.index,
        node
      );
      if (!details) {
        uiMessage.warning("该条目已不存在，请刷新后重试。");
        return;
      }
      if (action === "delete") {
        longTreeItemDelete.value = {
          bookId: prepared.bookId,
          node,
          label: details.label,
          title: details.title,
          description: details.description
        };
        return;
      }
      await withMutation(
        prepared.bookId,
        (message) => uiMessage.info(message),
        async (lease) => {
          if (lease.target.index !== prepared.index) return;
          let batch: LongWorkspaceOperationBatch;
          try {
            const { createLongStructureMutationBuilder } =
              await loadLongStructureMutationModule();
            assertCurrentLongStructureMutationTarget(lease.target, lease);
            const builder = createLongStructureMutationBuilder(prepared.index);
            const direction = action === "move-up" ? "up" : "down";
            if (target.kind === "worldbuilding-item") {
              if (!target.parentId) throw new Error("缺少世界观分类 ID。");
              batch = builder.reorderWorldbuildingItem(
                target.parentId,
                target.id,
                direction
              );
            } else if (target.kind === "character") {
              batch = builder.reorderCharacter(target.id, direction);
            } else if (target.kind === "volume") {
              batch = builder.reorderVolume(target.id, direction);
            } else if (target.kind === "plot-point") {
              batch = builder.reorderArc(target.id, direction);
            } else {
              batch = builder.reorderChapter(target.id, direction);
            }
          } catch (error: unknown) {
            if (disposed) return;
            uiMessage.warning(
              error instanceof Error ? error.message : "无法调整条目顺序。"
            );
            return;
          }
          await executeLongStructureMutation(
            lease,
            batch,
            NOOP_COMPLETION,
            {
              successMessage: `已${
                action === "move-up" ? "上移" : "下移"
              }${details.label}“${details.title}”`
            },
            prepared.index
          );
        }
      );
    });
  }

  async function confirmDeleteLongTreeItem(): Promise<void> {
    const pending = longTreeItemDelete.value;
    const target = pending?.node.longTreeItem;
    if (!pending || !target) return;
    await withMutation(
      pending.bookId,
      (message) => uiMessage.info(message),
      async (lease) => {
        const index = lease.target.index;
        const details = resolveLongTreeItemDetails(
          pending.bookId,
          index,
          pending.node
        );
        if (!details) {
          if (longTreeItemDelete.value === pending) {
            longTreeItemDelete.value = null;
          }
          uiMessage.warning("该条目已不存在，请刷新后重试。");
          return;
        }
        const currentIndex = details.orderedIds.indexOf(target.id);
        const fallbackItemId =
          details.orderedIds[currentIndex + 1] ??
          details.orderedIds[currentIndex - 1];
        const fallbackResourceId = fallbackItemId
          ? details.resourceIdForItem(fallbackItemId)
          : details.parentResourceId;
        const deletedSelected =
          selectedResourceId.value === pending.node.id ||
          isActiveLongTreeItem(pending.node);
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          const builder = createLongStructureMutationBuilder(index);
          if (target.kind === "worldbuilding-item") {
            if (!target.parentId) throw new Error("缺少世界观分类 ID。");
            batch = builder.deleteWorldbuildingItem(target.parentId, target.id);
          } else if (target.kind === "character") {
            batch = builder.deleteCharacter(target.id, true);
          } else if (target.kind === "volume") {
            batch = builder.deleteVolume(target.id, true);
          } else if (target.kind === "plot-point") {
            batch = builder.deleteArc(target.id, true);
          } else {
            batch = builder.deleteChapter(target.id, true);
          }
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error
              ? error.message
              : `无法删除“${details.title}”。`
          );
          return;
        }
        let succeeded = false;
        let applied = false;
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => {
              succeeded = true;
              applied = true;
            },
            fail: () => undefined,
            appliedButRefreshFailed: () => {
              applied = true;
            }
          },
          { successMessage: `已删除${details.label}“${details.title}”` },
          index
        );
        if (!applied || disposed) return;
        if (longTreeItemDelete.value === pending) {
          longTreeItemDelete.value = null;
        }
        if (!succeeded || !deletedSelected || !mutationIsCurrent(lease)) return;
        await nextTick();
        if (!mutationIsCurrent(lease)) return;
        const fallbackNode = resourceNode(fallbackResourceId);
        if (fallbackNode) await selectResource(fallbackNode);
      }
    );
  }

  async function confirmDeleteLongDraftSection(): Promise<void> {
    const pending = longDraftSectionDelete.value;
    if (!pending || blockActiveLongWritingPlan("删除小节")) return;
    await deleteLongNavigationStructure(
      pending.bookId,
      {
        kind: "chapterCard",
        id: pending.chapterCardId,
        title: pending.title
      },
      (succeeded) => {
        if (!succeeded || disposed) return;
        const deletedSelected =
          activeLongSelection.value?.chapterCardId === pending.chapterCardId ||
          selectedResourceId.value ===
            longNavigationNodeId(
              pending.bookId,
              `chapter:${pending.chapterCardId}`
            );
        if (longDraftSectionDelete.value === pending) {
          longDraftSectionDelete.value = null;
        }
        if (!deletedSelected) return;
        const summary = activeLongBookSummary.value;
        const index = activeLongWorkspaceIndex.value;
        if (!summary || !index || summary.id !== pending.bookId) return;
        const remaining = summary.navigation.chapterCards
          .filter((chapter) => chapter.volumeId === pending.volumeId)
          .sort(
            (left, right) =>
              left.narrativeOrder - right.narrativeOrder ||
              left.id.localeCompare(right.id)
          );
        const next = remaining[0];
        if (next) {
          const selection = createLongChapterSelection(summary, index, next.id);
          if (selection) {
            selectedResourceId.value = longNavigationNodeId(
              pending.bookId,
              selection.key
            );
            void runTracked(() => selectLongWorkspaceFile(selection)).catch(
              (error: unknown) => {
                if (disposed) return;
                uiMessage.error(
                  error instanceof Error
                    ? error.message
                    : "小节已删除，但无法打开下一小节。"
                );
              }
            );
            return;
          }
        }
        selectedResourceId.value = longNavigationNodeId(
          pending.bookId,
          `volume:${pending.volumeId}`
        );
      },
      () => longDraftSectionDelete.value === pending
    );
  }

  async function renameLongCharacter(
    input: { characterId: LongCharacterId; name: string },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    const expectedBookId = activeLongBookId.value;
    await withMutation(
      expectedBookId,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const character = index.characters.find(
          ({ id }) => id === input.characterId
        );
        const name = input.name.trim();
        if (!character) {
          uiMessage.warning("该人物已不存在，请刷新后重试。");
          completion(false);
          return;
        }
        if (!name) {
          uiMessage.warning("人物姓名不能为空。");
          completion(false);
          return;
        }
        if (name === character.name) {
          completion(true);
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          batch = createLongStructureMutationBuilder(index).updateCharacter(
            character.id,
            { name }
          );
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法修改人物姓名。"
          );
          completion(false);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => completion(true),
            fail: () => completion(false),
            appliedButRefreshFailed: () => completion(true)
          },
          { successMessage: `已将人物姓名修改为“${name}”` },
          index
        );
      }
    );
  }

  async function renameLongStructureTitle(
    input: {
      kind: "worldbuilding" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    await withMutation(
      activeLongBookId.value,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const title = input.title.trim();
        if (!title) {
          uiMessage.warning("标题不能为空。");
          completion(false);
          return;
        }
        let batch: LongWorkspaceOperationBatch | undefined;
        let currentTitle: string | undefined;
        let structureLabel = "结构项";
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          const builder = createLongStructureMutationBuilder(index);
          switch (input.kind) {
            case "worldbuilding": {
              const category = index.worldbuilding.find(
                ({ id }) => id === input.id
              );
              currentTitle = category?.title;
              structureLabel = "世界观分类";
              if (category) {
                batch = builder.updateWorldbuilding(category.id, { title });
              }
              break;
            }
            case "volume": {
              const volume = index.plot.volumes.find(
                ({ id }) => id === input.id
              );
              currentTitle = volume?.title;
              structureLabel = "分卷";
              if (volume) batch = builder.updateVolume(volume.id, { title });
              break;
            }
            case "plotPoint": {
              const plotPoint = index.plot.arcs.find(
                ({ id }) => id === input.id
              );
              currentTitle = plotPoint?.title;
              structureLabel = "剧情点";
              if (plotPoint) batch = builder.updateArc(plotPoint.id, { title });
              break;
            }
            case "chapterCard": {
              const chapter = index.plot.chapterCards.find(
                ({ id }) => id === input.id
              );
              currentTitle = chapter?.title;
              structureLabel = "章卡";
              if (chapter) batch = builder.updateChapter(chapter.id, { title });
              break;
            }
          }
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法修改标题。"
          );
          completion(false);
          return;
        }
        if (currentTitle === undefined || !batch) {
          uiMessage.warning(`该${structureLabel}已不存在，请刷新后重试。`);
          completion(false);
          return;
        }
        if (title === currentTitle) {
          completion(true);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => completion(true),
            fail: () => completion(false),
            appliedButRefreshFailed: () => completion(true)
          },
          { successMessage: `已将${structureLabel}标题修改为“${title}”` },
          index
        );
      }
    );
  }

  function openLongCharacterCreate(): void {
    const requestId = beginDialogRequest();
    if (requestId === null) return;
    const group = activeLongSelection.value?.characterGroup;
    const bookId = activeLongBookSummary.value?.id;
    const index = activeLongWorkspaceIndex.value;
    if (!group || !bookId || !index) {
      uiMessage.warning("当前人物分组尚未就绪。");
      return;
    }
    if (blockActiveLongWritingPlan("新增人物")) return;
    const groupOption = index.characterTypes.find(({ id }) => id === group);
    if (!groupOption || !dialogRequestIsCurrent(requestId)) return;
    longCharacterCreate.value = {
      bookId,
      group,
      groupLabel: groupOption.title
    };
  }

  async function openLongWorldbuildingItemCreate(): Promise<void> {
    const bookId = activeLongBookId.value;
    const selection = activeLongSelection.value;
    if (
      !bookId ||
      !selection?.key.startsWith("worldbuilding:") ||
      selection.key === "worldbuilding:reveals"
    ) {
      uiMessage.warning("当前世界观分类尚未就绪。");
      return;
    }
    const categoryId = selection.key.slice("worldbuilding:".length);
    const requestId = beginDialogRequest();
    if (requestId === null) return;
    await runTracked(() =>
      openLongWorldbuildingItemCreateForCategoryInternal(
        requestId,
        bookId,
        categoryId
      )
    );
  }

  async function openLongVolumeCreate(): Promise<void> {
    const requestId = beginDialogRequest();
    if (requestId === null) return;
    await runTracked(async () => {
      const bookId = activeLongBookId.value;
      if (
        !bookId ||
        !activeLongWorkspaceIndex.value ||
        activeLongSelection.value?.key !== "plot-design:book-line" ||
        blockActiveLongWritingPlan("新增分卷")
      ) {
        return;
      }
      if (!(await saveActiveLongEditorChanges())) return;
      if (
        !dialogRequestIsCurrent(requestId) ||
        !captureLongStructureMutationTarget(bookId) ||
        activeLongSelection.value?.key !== "plot-design:book-line"
      ) {
        if (dialogRequestIsCurrent(requestId)) {
          uiMessage.warning("活动长篇已切换，本次新建分卷已取消。");
        }
        return;
      }
      longVolumeCreate.value = { bookId };
    });
  }

  async function openLongPlotPointCreateForVolumeInternal(
    requestId: number,
    bookId: string,
    volumeId: string
  ): Promise<void> {
    if (blockActiveLongWritingPlan("新增剧情点")) return;
    if (activeLongBookId.value !== bookId) {
      if (!(await saveActiveLongEditorBeforeLeaving(bookId))) return;
      if (!dialogRequestIsCurrent(requestId)) return;
      await openLongBook(bookId);
    } else if (!(await saveActiveLongEditorChanges())) {
      return;
    }
    if (!dialogRequestIsCurrent(requestId)) return;
    const index = activeLongWorkspaceIndex.value;
    const volume = index?.plot.volumes.find(({ id }) => id === volumeId);
    if (activeLongBookId.value !== bookId || !index || !volume) {
      uiMessage.warning("该分卷已不存在，请刷新后重试。");
      return;
    }
    longPlotPointCreate.value = {
      bookId,
      volumeId,
      volumeTitle: volume.title
    };
  }

  async function openLongPlotPointCreateForVolume(
    bookId: string,
    volumeId: string
  ): Promise<void> {
    const requestId = beginDialogRequest();
    if (requestId === null) return;
    await runTracked(() =>
      openLongPlotPointCreateForVolumeInternal(requestId, bookId, volumeId)
    );
  }

  async function openLongPlotPointCreate(): Promise<void> {
    const bookId = activeLongBookId.value;
    const volumeId = activeLongSelection.value?.plotPointVolumeId;
    if (!bookId || !volumeId) {
      uiMessage.warning("当前分卷尚未就绪。");
      return;
    }
    await openLongPlotPointCreateForVolume(bookId, volumeId);
  }

  async function saveLongVolumeOutline(
    input: { volumeId: string; outline: string },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    await withMutation(
      activeLongBookId.value,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const volume = index.plot.volumes.find(({ id }) => id === input.volumeId);
        if (!volume) {
          uiMessage.warning("该分卷已不存在，请刷新后重试。");
          completion(false);
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          batch = createLongStructureMutationBuilder(index).updateVolume(
            volume.id,
            { summary: input.outline }
          );
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法保存分卷卷纲。"
          );
          completion(false);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => completion(true),
            fail: () => completion(false),
            appliedButRefreshFailed: () => completion(true)
          },
          { saveEditor: false, successMessage: `已保存“${volume.title}”的卷纲` },
          index
        );
      }
    );
  }

  async function saveLongPlotPointContent(
    input: {
      plotPointId: LongArcId;
      field: "summary";
      content: string;
    },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    await withMutation(
      activeLongBookId.value,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        const plotPoint = index.plot.arcs.find(
          ({ id }) => id === input.plotPointId
        );
        if (!plotPoint) {
          uiMessage.warning("该剧情点已不存在，请刷新后重试。");
          completion(false);
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          batch = createLongStructureMutationBuilder(index).updateArc(
            plotPoint.id,
            { summary: input.content }
          );
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法保存剧情点内容。"
          );
          completion(false);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => completion(true),
            fail: () => completion(false),
            appliedButRefreshFailed: () => completion(true)
          },
          {
            saveEditor: false,
            successMessage: `已保存“${plotPoint.title}”的概要`
          },
          index
        );
      }
    );
  }

  async function selectCreatedLongTreeResource(
    lease: LongStructureMutationLease,
    resourceId: string
  ): Promise<boolean> {
    await nextTick();
    if (!mutationIsCurrent(lease)) return false;
    const node = resourceNode(resourceId);
    if (!node?.longTreeItem) return false;
    await selectResource(node);
    return mutationIsCurrent(lease) && selectedResourceId.value === node.id;
  }

  async function createLongVolume(input: {
    title: string;
    summary: string;
  }): Promise<void> {
    const target = longVolumeCreate.value;
    if (!target) {
      uiMessage.warning("当前长篇工作区尚未准备好新建分卷。");
      return;
    }
    await withMutation(
      target.bookId,
      (message) => uiMessage.info(message),
      async (lease) => {
        const index = lease.target.index;
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (longVolumeCreate.value !== target) {
            throw new Error("新建分卷目标已切换，本次操作已取消。");
          }
          batch = createLongStructureMutationBuilder(index).createVolume(input);
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法创建分卷。"
          );
          return;
        }
        const created = batch.operations.find(
          (operation) => operation.type === "volume.create"
        );
        if (!created || created.type !== "volume.create") {
          uiMessage.warning("无法确定新建分卷。");
          return;
        }
        let succeeded = false;
        let applied = false;
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => {
              succeeded = true;
              applied = true;
            },
            fail: () => undefined,
            appliedButRefreshFailed: () => {
              applied = true;
            }
          },
          {},
          index
        );
        if (!applied || disposed) return;
        if (longVolumeCreate.value === target) longVolumeCreate.value = null;
        if (!succeeded || !mutationIsCurrent(lease)) return;
        if (
          await selectCreatedLongTreeResource(
            lease,
            longNavigationNodeId(
              target.bookId,
              `plot-design:book-line:volume:${created.volume.id}`
            )
          )
        ) {
          return;
        }
        if (mutationIsCurrent(lease)) {
          longWorkspaceEditor.value?.selectBookLineVolume(created.volume.id);
        }
      }
    );
  }

  async function createLongWorldbuildingItem(input: {
    title: string;
  }): Promise<void> {
    const target = longWorldbuildingItemCreate.value;
    if (!target) {
      uiMessage.warning("当前世界观分类尚未准备好新建条目。");
      return;
    }
    await withMutation(
      target.bookId,
      (message) => uiMessage.info(message),
      async (lease) => {
        const index = lease.target.index;
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (longWorldbuildingItemCreate.value !== target) {
            throw new Error("新建世界观条目目标已切换，本次操作已取消。");
          }
          batch = createLongStructureMutationBuilder(index).createWorldbuildingItem(
            target.categoryId,
            input.title
          );
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法创建世界观条目。"
          );
          return;
        }
        const created = batch.operations.find(
          (operation) => operation.type === "worldbuildingItem.create"
        );
        if (!created || created.type !== "worldbuildingItem.create") {
          uiMessage.warning("无法确定新建世界观条目。");
          return;
        }
        let succeeded = false;
        let applied = false;
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => {
              succeeded = true;
              applied = true;
            },
            fail: () => undefined,
            appliedButRefreshFailed: () => {
              applied = true;
            }
          },
          {
            saveEditor: false,
            successMessage: `已创建世界观条目“${input.title}”`
          },
          index
        );
        if (applied && longWorldbuildingItemCreate.value === target) {
          longWorldbuildingItemCreate.value = null;
        }
        if (!succeeded || !mutationIsCurrent(lease)) return;
        await selectCreatedLongTreeResource(
          lease,
          longNavigationNodeId(
            target.bookId,
            `worldbuilding:${target.categoryId}:item:${created.item.id}`
          )
        );
      }
    );
  }

  async function createLongPlotPoint(input: {
    title: string;
    summary: string;
  }): Promise<void> {
    const target = longPlotPointCreate.value;
    if (!target) {
      uiMessage.warning("当前分卷尚未准备好新建剧情点。");
      return;
    }
    await withMutation(
      target.bookId,
      (message) => uiMessage.info(message),
      async (lease) => {
        const index = lease.target.index;
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (longPlotPointCreate.value !== target) {
            throw new Error("新建剧情点目标已切换，本次操作已取消。");
          }
          batch = createLongStructureMutationBuilder(index).createArc({
            volumeId: target.volumeId,
            title: input.title,
            summary: input.summary,
            outline: ""
          });
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法创建剧情点。"
          );
          return;
        }
        const created = batch.operations.find(
          (operation) => operation.type === "arc.create"
        );
        if (!created || created.type !== "arc.create") {
          uiMessage.warning("无法确定新建剧情点。");
          return;
        }
        let succeeded = false;
        let applied = false;
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => {
              succeeded = true;
              applied = true;
            },
            fail: () => undefined,
            appliedButRefreshFailed: () => {
              applied = true;
            }
          },
          {
            saveEditor: false,
            successMessage: `已创建剧情点“${input.title}”`
          },
          index
        );
        if (applied && longPlotPointCreate.value === target) {
          longPlotPointCreate.value = null;
        }
        if (!succeeded || !mutationIsCurrent(lease)) return;
        await selectCreatedLongTreeResource(
          lease,
          longNavigationNodeId(
            target.bookId,
            `plot-design:plot-point:${created.arc.id}`
          )
        );
      }
    );
  }

  async function createLongChapterCard(input: {
    title: string;
    primaryArcId: string | null;
  }): Promise<void> {
    const target = longChapterCardCreate.value;
    const fromDraft = target?.source === "draft";
    if (!target) {
      uiMessage.warning(
        fromDraft
          ? "当前分卷尚未准备好新建小节。"
          : "当前分卷尚未准备好新建章卡。"
      );
      return;
    }
    await withMutation(
      target.bookId,
      (message) => uiMessage.info(message),
      async (lease) => {
        const index = lease.target.index;
        if (
          input.primaryArcId !== null &&
          !target.arcOptions.some(({ value }) => value === input.primaryArcId)
        ) {
          uiMessage.warning("所选剧情点已不存在，请重新打开弹窗。");
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (longChapterCardCreate.value !== target) {
            throw new Error(
              fromDraft
                ? "新建小节目标已切换，本次操作已取消。"
                : "新建章卡目标已切换，本次操作已取消。"
            );
          }
          batch = createLongStructureMutationBuilder(index).createChapter({
            volumeId: target.volumeId,
            primaryArcId: input.primaryArcId,
            title: input.title
          });
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error
              ? error.message
              : fromDraft
                ? "无法创建小节。"
                : "无法创建章卡。"
          );
          return;
        }
        const created = batch.operations.find(
          (operation) => operation.type === "chapter.create"
        );
        if (!created || created.type !== "chapter.create") {
          uiMessage.warning(
            fromDraft ? "无法确定新建小节。" : "无法确定新建章卡。"
          );
          return;
        }
        let succeeded = false;
        let applied = false;
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => {
              succeeded = true;
              applied = true;
            },
            fail: () => undefined,
            appliedButRefreshFailed: () => {
              applied = true;
            }
          },
          {
            saveEditor: false,
            successMessage: fromDraft
              ? `已新建小节“${input.title}”，并同步创建章卡`
              : `已创建章卡“${input.title}”`
          },
          index
        );
        if (!applied || disposed) return;
        if (longChapterCardCreate.value === target) {
          longChapterCardCreate.value = null;
        }
        if (!succeeded || !mutationIsCurrent(lease)) return;
        await nextTick();
        if (!mutationIsCurrent(lease)) return;
        if (fromDraft) {
          const summary = activeLongBookSummary.value;
          const nextIndex = activeLongWorkspaceIndex.value;
          const selection =
            summary && nextIndex
              ? createLongChapterSelection(
                  summary,
                  nextIndex,
                  created.chapterCard.id
                )
              : undefined;
          if (selection) {
            selectedResourceId.value = longNavigationNodeId(
              target.bookId,
              selection.key
            );
            await selectLongWorkspaceFile(selection);
          }
          return;
        }
        if (
          await selectCreatedLongTreeResource(
            lease,
            longNavigationNodeId(
              target.bookId,
              `plot-design:chapter-card:${created.chapterCard.id}`
            )
          )
        ) {
          return;
        }
        if (mutationIsCurrent(lease)) {
          await selectLongChapterCardTab(created.chapterCard.id);
        }
      }
    );
  }

  async function handleLongStructureMutation(
    expectedBookId: string,
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion
  ): Promise<void> {
    await withMutation(
      expectedBookId,
      (message) => {
        uiMessage.warning(message);
        completion.fail(message);
      },
      (lease) =>
        executeLongStructureMutation(
          lease,
          batch,
          completion,
          {},
          lease.target.index
        )
    );
  }

  async function handleActiveLongStructureMutation(
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion
  ): Promise<void> {
    const expectedBookId = activeLongBookId.value;
    if (!expectedBookId) {
      const message = "当前长篇结构尚未就绪。";
      uiMessage.warning(message);
      completion.fail(message);
      return;
    }
    await handleLongStructureMutation(expectedBookId, batch, completion);
  }

  async function handleLongWorldbuildingSync(
    payload: { sourceBookId: string; sourceTitle: string },
    completion: LongStructureMutationCompletion
  ): Promise<void> {
    const expectedBookId = activeLongBookSummary.value?.id;
    await withMutation(
      expectedBookId,
      (message) => {
        uiMessage.warning(message);
        completion.fail(message);
      },
      async (lease) => {
        const api = resolveLongWorkspaceApi();
        const summary = activeLongBookSummary.value;
        const index = activeLongWorkspaceIndex.value;
        if (!api || !summary || !index) {
          const message = "当前长篇结构尚未就绪。";
          uiMessage.warning(message);
          completion.fail(message);
          return;
        }
        if (payload.sourceBookId === summary.id) {
          uiMessage.warning("不能从当前长篇同步到自身。");
          completion.fail("不能从当前长篇同步到自身。");
          return;
        }
        try {
          const {
            buildLongWorldbuildingSyncBatch,
            filterSyncableWorldbuildingCategories,
            loadSourceWorldbuildingContents
          } = await import("../utils/longWorldbuildingSync");
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (!(await saveActiveLongEditorChanges())) {
            completion.fail("当前长篇修改尚未保存。");
            return;
          }
          if (!mutationIsCurrent(lease)) return;
          if (!captureLongStructureMutationTarget(lease.target.bookId)) {
            throw new Error("活动长篇已切换，本次世界观同步未保存。");
          }
          if (!(await refreshActiveLongWorkspace(lease.target.bookId))) {
            throw new Error("无法同步最新长篇结构，本次修改未保存。");
          }
          if (!mutationIsCurrent(lease)) return;
          const latestTarget = captureLongStructureMutationTarget(
            lease.target.bookId
          );
          const latestIndex = latestTarget?.index;
          if (!latestTarget || !latestIndex) {
            throw new Error("活动长篇已切换，本次世界观同步未保存。");
          }
          const source = await api.getWorkspaceIndex({
            bookId: payload.sourceBookId
          });
          assertCurrentLongStructureMutationTarget(
            latestTarget,
            lease,
            "活动长篇或结构已切换，本次世界观同步未保存。"
          );
          if (source.bookId !== payload.sourceBookId) {
            throw new Error("来源长篇工作区读取结果不一致。");
          }
          const sourceCategories = filterSyncableWorldbuildingCategories(
            source.workspaceIndex.worldbuilding
          );
          if (sourceCategories.length === 0) {
            throw new Error("所选长篇没有可同步的世界观分类。");
          }
          const contents = await loadSourceWorldbuildingContents(
            (input) => api.readDocument(input),
            payload.sourceBookId,
            sourceCategories
          );
          assertCurrentLongStructureMutationTarget(
            latestTarget,
            lease,
            "活动长篇或结构已切换，本次世界观同步未保存。"
          );
          const plan = await buildLongWorldbuildingSyncBatch({
            target: latestIndex,
            source: source.workspaceIndex,
            contents
          });
          assertCurrentLongStructureMutationTarget(
            latestTarget,
            lease,
            "活动长篇或结构已切换，本次世界观同步未保存。"
          );
          await executeLongStructureMutation(
            lease,
            plan.batch,
            completion,
            {
              saveEditor: false,
              successMessage: `已从「${payload.sourceTitle}」同步世界观（${plan.createdCategoryCount} 个分类）`
            },
            latestIndex
          );
        } catch (error: unknown) {
          if (disposed) return;
          const message =
            error instanceof Error ? error.message : "同步世界观失败。";
          completion.fail(message);
          uiMessage.error(message);
        }
      }
    );
  }

  async function executeLongStructureMutation(
    lease: LongStructureMutationLease,
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion,
    options: { saveEditor?: boolean; successMessage?: string } = {},
    beforeIndex: LongWorkspaceIndexSnapshot = lease.target.index
  ): Promise<void> {
    const workspaceApi = resolveLongWorkspaceApi();
    if (!workspaceApi || !mutationIsCurrent(lease)) {
      if (!disposed) {
        const message = "当前长篇结构尚未就绪。";
        uiMessage.warning(message);
        completion.fail(message);
      }
      return;
    }
    const expectedBookId = lease.target.bookId;
    const updatesItemLayout = batch.operations.some(
      (operation) => operation.type === "featureSettings.update"
    );
    if (updatesItemLayout && activeLongSelection.value) {
      activeLongSelection.value = {
        ...activeLongSelection.value,
        ...longWorkspaceEditor.value?.captureNavigationSelection()
      };
    }
    if (blockActiveLongWritingPlan("修改长篇结构")) {
      completion.fail("当前长篇串行写作计划尚未完成。");
      return;
    }
    if (
      options.saveEditor !== false &&
      !(await saveActiveLongEditorChanges())
    ) {
      if (mutationIsCurrent(lease)) {
        completion.fail("当前长篇修改尚未保存。");
      }
      return;
    }
    if (!mutationIsCurrent(lease)) return;
    if (!captureLongStructureMutationTarget(expectedBookId)) {
      const message = "活动长篇已切换，本次结构修改未保存。";
      completion.fail(message);
      uiMessage.warning(message);
      return;
    }
    try {
      if (!(await refreshActiveLongWorkspace(expectedBookId))) {
        throw new Error("无法同步最新长篇结构，本次修改未保存。");
      }
      if (!mutationIsCurrent(lease)) return;
      const latestSummary = activeLongBookSummary.value;
      const latestTarget = captureLongStructureMutationTarget(expectedBookId);
      const latestIndex = latestTarget?.index;
      if (
        !latestSummary ||
        !latestTarget ||
        !latestIndex ||
        latestSummary.id !== expectedBookId
      ) {
        throw new Error("活动长篇已切换，本次结构修改未保存。");
      }
      const baseProjectRevision =
        latestSummary.projectRevision ?? latestIndex.revision;
      const { rebaseLongStructureBatchAfterDocumentSave } =
        await loadLongStructureMutationModule();
      assertCurrentLongStructureMutationTarget(latestTarget, lease);
      const effectiveBatch = rebaseLongStructureBatchAfterDocumentSave({
        batch,
        before: beforeIndex,
        after: latestIndex
      });
      const preview = await workspaceApi.previewOperations({
        bookId: expectedBookId,
        batch: effectiveBatch
      });
      assertCurrentLongStructureMutationTarget(latestTarget, lease);
      if (
        preview.bookId !== expectedBookId ||
        preview.projectRevision !== baseProjectRevision
      ) {
        throw new Error("长篇结构已更新，请基于最新结构重新修改。");
      }
      assertCurrentLongStructureMutationTarget(latestTarget, lease);
      const applyResult = await workspaceApi.applyOperations({
        bookId: expectedBookId,
        batch: {
          ...effectiveBatch,
          expectedImpact: preview.preview.impact
        },
        baseProjectRevision
      });
      lease.applied = true;
      if (disposed) return;
      if (
        applyResult.bookId !== expectedBookId ||
        activeLongBookId.value !== expectedBookId ||
        activeLongBookSummary.value?.id !== expectedBookId
      ) {
        throw new Error("活动长篇已切换，无法发布结构保存结果。");
      }
      longBooks.value = replaceLongBookSummary(
        longBooks.value,
        applyResult.summary
      );
      const refreshed = await refreshLongWritingSaveBarrier(expectedBookId);
      if (disposed) return;
      if (!refreshed) {
        longStructureDialogOpen.value = false;
        completion.appliedButRefreshFailed(
          "结构修改已保存，但界面未能同步最新结构。"
        );
        uiMessage.warning(
          "结构修改已保存，但界面未能同步最新结构；请重新打开长篇设置。"
        );
        return;
      }
      if (updatesItemLayout) {
        resources.synchronizeSelectedResourceForLayout(expectedBookId);
      }
      completion.succeed();
      uiMessage.success(
        options.successMessage ??
          `已直接保存 ${effectiveBatch.operations.length} 项长篇结构修改`
      );
    } catch (error: unknown) {
      if (disposed) return;
      const message =
        error instanceof Error ? error.message : "保存长篇结构修改失败。";
      if (lease.applied) {
        longStructureDialogOpen.value = false;
        completion.appliedButRefreshFailed(message);
      } else {
        completion.fail(message);
      }
      uiMessage.error(message);
    }
  }

  async function deleteLongNavigationStructure(
    expectedBookId: string,
    input: {
      kind: "character" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void,
    isTargetCurrent: () => boolean = () => true
  ): Promise<void> {
    await withMutation(
      expectedBookId,
      (message) => {
        uiMessage.warning(message);
        completion(false);
      },
      async (lease) => {
        const index = lease.target.index;
        let batch: LongWorkspaceOperationBatch;
        let label: string;
        let title: string;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (!isTargetCurrent()) {
            throw new Error("删除目标已切换，本次操作已取消。");
          }
          const builder = createLongStructureMutationBuilder(index);
          if (input.kind === "character") {
            const target = index.characters.find(({ id }) => id === input.id);
            if (!target) throw new Error("该人物已不存在，请刷新后重试。");
            batch = builder.deleteCharacter(target.id, true);
            label = "人物";
            title = target.name;
          } else if (input.kind === "volume") {
            const target = index.plot.volumes.find(({ id }) => id === input.id);
            if (!target) throw new Error("该分卷已不存在，请刷新后重试。");
            batch = builder.deleteVolume(target.id, true);
            label = "分卷";
            title = target.title;
          } else if (input.kind === "plotPoint") {
            const target = index.plot.arcs.find(({ id }) => id === input.id);
            if (!target) throw new Error("该剧情点已不存在，请刷新后重试。");
            batch = builder.deleteArc(target.id, true);
            label = "剧情点";
            title = target.title;
          } else {
            const target = index.plot.chapterCards.find(
              ({ id }) => id === input.id
            );
            if (!target) throw new Error("该章卡已不存在，请刷新后重试。");
            batch = builder.deleteChapter(target.id, true);
            label = "章卡";
            title = target.title;
          }
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : `无法删除“${input.title}”。`
          );
          completion(false);
          return;
        }
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => completion(true),
            fail: () => completion(false),
            appliedButRefreshFailed: () => completion(true)
          },
          { successMessage: `已删除${label}“${title}”` },
          index
        );
      }
    );
  }

  async function deleteActiveLongNavigationStructure(
    input: {
      kind: "character" | "volume" | "plotPoint" | "chapterCard";
      id: string;
      title: string;
    },
    completion: (succeeded: boolean) => void
  ): Promise<void> {
    const expectedBookId = activeLongBookId.value;
    if (!expectedBookId) {
      uiMessage.warning("当前长篇结构尚未就绪。");
      completion(false);
      return;
    }
    await deleteLongNavigationStructure(expectedBookId, input, completion);
  }

  async function createLongCharacter(input: {
    name: string;
    aliases: string[];
  }): Promise<void> {
    const target = longCharacterCreate.value;
    if (!target) {
      uiMessage.warning("当前人物分组尚未就绪。");
      return;
    }
    await withMutation(
      target.bookId,
      (message) => uiMessage.info(message),
      async (lease) => {
        const summary = activeLongBookSummary.value;
        const index = lease.target.index;
        if (!summary || summary.id !== target.bookId) {
          uiMessage.warning("当前人物分组尚未就绪。");
          return;
        }
        let batch: LongWorkspaceOperationBatch;
        try {
          const { createLongStructureMutationBuilder } =
            await loadLongStructureMutationModule();
          assertCurrentLongStructureMutationTarget(lease.target, lease);
          if (longCharacterCreate.value !== target) {
            throw new Error("新建人物目标已切换，本次操作已取消。");
          }
          batch = createLongStructureMutationBuilder(index).createCharacter({
            name: input.name,
            group: target.group,
            aliases: input.aliases
          });
        } catch (error: unknown) {
          if (disposed) return;
          uiMessage.warning(
            error instanceof Error ? error.message : "无法创建人物。"
          );
          return;
        }
        const created = batch.operations.find(
          (operation) => operation.type === "character.create"
        );
        if (!created || created.type !== "character.create") {
          uiMessage.warning("无法确定新建人物。");
          return;
        }
        let succeeded = false;
        let applied = false;
        await executeLongStructureMutation(
          lease,
          batch,
          {
            succeed: () => {
              succeeded = true;
              applied = true;
            },
            fail: () => undefined,
            appliedButRefreshFailed: () => {
              applied = true;
            }
          },
          {},
          index
        );
        if (!applied || disposed) return;
        if (longCharacterCreate.value === target) {
          longCharacterCreate.value = null;
        }
        if (!succeeded || !mutationIsCurrent(lease)) return;
        const latestSummary = activeLongBookSummary.value;
        const latestIndex = activeLongWorkspaceIndex.value;
        if (!latestSummary || !latestIndex || latestSummary.id !== target.bookId) {
          return;
        }
        if (
          await selectCreatedLongTreeResource(
            lease,
            longNavigationNodeId(
              target.bookId,
              `character:${created.character.id}`
            )
          )
        ) {
          resources.revealEditor();
          return;
        }
        const selection = createLongCharacterGroupSelection(
          latestSummary,
          latestIndex,
          target.group,
          created.character.id
        );
        selectedResourceId.value = longNavigationNodeId(
          target.bookId,
          `character-group:${target.group}`
        );
        resources.revealEditor();
        await selectLongWorkspaceFile(selection);
      }
    );
  }

  return {
    longWorldbuildingSyncBookOptions,
    openLongChapterCardCreate,
    requestCreateLongDraftSection,
    handleLongDraftSectionAction,
    handleCreateLongTreeItem,
    handleLongTreeItemAction,
    confirmDeleteLongTreeItem,
    confirmDeleteLongDraftSection,
    renameLongCharacter,
    renameLongStructureTitle,
    openLongCharacterCreate,
    openLongWorldbuildingItemCreate,
    openLongVolumeCreate,
    openLongPlotPointCreate,
    saveLongVolumeOutline,
    saveLongPlotPointContent,
    createLongVolume,
    createLongWorldbuildingItem,
    createLongPlotPoint,
    createLongChapterCard,
    handleLongStructureMutation,
    handleActiveLongStructureMutation,
    handleLongWorldbuildingSync,
    deleteActiveLongNavigationStructure,
    createLongCharacter,
    closeLongStructureDialog,
    closeLongCharacterCreate,
    closeLongWorldbuildingItemCreate,
    closeLongPlotPointCreate,
    closeLongChapterCardCreate,
    closeLongDraftSectionDelete,
    closeLongTreeItemDelete,
    closeLongVolumeCreate,
    drain,
    dispose
  };
}

export type LongStructureTransactionsCoordinator = ReturnType<
  typeof useLongStructureTransactionsCoordinator
>;
