import {
  createLongWorkspaceNavigationSnapshot,
  type LongArcId,
  type LongBookSummary,
  type LongCharacterId,
  type LongOpenBookResult,
  type LongWorkspaceIndexSnapshot,
  type LongWriteDocumentResult
} from "@deepwrite/contracts";
import { shallowRef, type Ref } from "vue";
import type { LongApprovalEditorFocus } from "../utils/approvalNavigation";
import {
  createLongWorkspaceRefreshClock,
  hasReachedLongWorkspaceRevisionTarget,
  isMonotonicLongWorkspaceRefresh
} from "../utils/longWorkspaceRefresh";
import {
  createLongChapterCardVolumeSelection,
  createLongCharacterGroupSelection,
  createLongPlotPointVolumeSelection,
  reconcileLongWorkspaceSelection,
  replaceLongBookSummary,
  type LongWorkspaceRendererApi,
  type LongWorkspaceSelection
} from "../types/longWorkspace";
import {
  useLongWorkspaceStore,
  type LongWorkspaceFileContext,
  type LongWorkspaceRefreshStatus,
  type LongWorkspaceRevisionSyncRequirement
} from "../stores/longWorkspaceStore";

export interface LongWorkspaceSessionNotifications {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface LongWorkspaceEditorPort {
  saveAllChanges(): Promise<boolean>;
  selectBookLineVolume(volumeId: string): void;
  focusFile(fileId: string): Promise<boolean>;
  focusTarget(target: LongApprovalEditorFocus): Promise<boolean>;
  captureNavigationSelection(): Partial<LongWorkspaceSelection>;
  ensureDocumentsLoaded(
    files: LongWorkspaceSelection["files"]
  ): Promise<boolean>;
  synchronizeProjectRevisions(
    workspaceRevision: number,
    projectRevision: number
  ): void;
  synchronizeProjectRevisionsIfClean(
    bookId: string,
    workspaceRevision: number,
    projectRevision: number
  ): boolean;
}

export interface LongWorkspaceSessionState {
  longBooks: Ref<readonly LongBookSummary[]>;
  activeBookId: Ref<string | null>;
  activeBookSummary: Readonly<Ref<LongBookSummary | null>>;
  workspaceIndex: Ref<LongWorkspaceIndexSnapshot | null>;
  selection: Ref<LongWorkspaceSelection | null>;
  fileContext: Ref<LongWorkspaceFileContext | null>;
  refreshStatus: Ref<LongWorkspaceRefreshStatus | null>;
  activeRefreshStatus: Readonly<Ref<LongWorkspaceRefreshStatus | null>>;
  revisionRequirement: Ref<LongWorkspaceRevisionSyncRequirement | null>;
  activeRevisionRequirement: Readonly<
    Ref<LongWorkspaceRevisionSyncRequirement | null>
  >;
}

export interface LongWorkspaceSessionScheduler<TimerHandle> {
  setTimeout(task: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface LongWritingPlanGuardOptions {
  targetBookId?: string | null;
  allowPlanBook?: boolean;
}

export interface LongWorkspaceSessionCoordinatorContext<TimerHandle> {
  store: ReturnType<typeof useLongWorkspaceStore>;
  state: LongWorkspaceSessionState;
  api(): LongWorkspaceRendererApi | undefined;
  isWorkspaceActive(): boolean;
  blockWritingPlan(
    action: string,
    options?: LongWritingPlanGuardOptions
  ): boolean;
  prepareOpenDependencies(): Promise<unknown>;
  activateProposalBook(bookId: string): void;
  synchronizeSelectedResourceForLayout(bookId: string): void;
  selectFallbackAfterClear(): void | Promise<void>;
  notifications: LongWorkspaceSessionNotifications;
  scheduler: LongWorkspaceSessionScheduler<TimerHandle>;
}

export interface LoadLongBookListOptions {
  notify?: boolean;
  force?: boolean;
}

/**
 * Owns the active long-form workspace session and its renderer/editor bridge.
 * Catalog persistence and generic editor auto-save deliberately stay outside.
 */
export function useLongWorkspaceSessionCoordinator<TimerHandle>(
  context: LongWorkspaceSessionCoordinatorContext<TimerHandle>
) {
  const { state, store, notifications } = context;
  const editor = shallowRef<LongWorkspaceEditorPort | null>(null);
  const refreshClock = createLongWorkspaceRefreshClock();
  const seenCatalogDiagnosticKeys = new Set<string>();
  let catalogRetryAttempts = 0;
  let catalogRetryTimer: TimerHandle | undefined;
  let disposed = false;

  function cancelCatalogRetry(): void {
    if (catalogRetryTimer === undefined) return;
    context.scheduler.clearTimeout(catalogRetryTimer);
    catalogRetryTimer = undefined;
  }

  async function loadBookList(
    options: LoadLongBookListOptions = {}
  ): Promise<void> {
    if (disposed) return;
    const api = context.api();
    if (!api) return;
    const notify = options.notify ?? context.isWorkspaceActive();
    const force = options.force ?? false;
    if (notify) cancelCatalogRetry();
    if (force) store.invalidateBookList();

    try {
      const result = await store.ensureBookList(() => api.list());
      if (disposed || !result) return;
      catalogRetryAttempts = 0;
      cancelCatalogRetry();
      const currentDiagnosticKeys = new Set(
        (result.diagnostics ?? []).map(
          (diagnostic) =>
            `${diagnostic.bookId}\u0000${diagnostic.code}\u0000${diagnostic.message}`
        )
      );
      for (const key of seenCatalogDiagnosticKeys) {
        if (!currentDiagnosticKeys.has(key)) {
          seenCatalogDiagnosticKeys.delete(key);
        }
      }
      const unseen = (result.diagnostics ?? []).filter((diagnostic) => {
        const key = `${diagnostic.bookId}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
        return !seenCatalogDiagnosticKeys.has(key);
      });
      if (notify && unseen.length) {
        for (const diagnostic of unseen) {
          seenCatalogDiagnosticKeys.add(
            `${diagnostic.bookId}\u0000${diagnostic.code}\u0000${diagnostic.message}`
          );
        }
        const first = unseen[0]!;
        notifications.warning(
          `长篇项目暂时无法读取：${first.message}${
            unseen.length > 1 ? `（另有 ${unseen.length - 1} 个项目）` : ""
          }`
        );
      }
    } catch (error: unknown) {
      if (disposed) return;
      const message =
        error instanceof Error ? error.message : "加载长篇创作空间失败。";
      if (notify) {
        notifications.error(message);
      } else if (
        catalogRetryAttempts < 2 &&
        catalogRetryTimer === undefined
      ) {
        catalogRetryAttempts += 1;
        catalogRetryTimer = context.scheduler.setTimeout(() => {
          catalogRetryTimer = undefined;
          void loadBookList({ notify: false });
        }, catalogRetryAttempts * 1_500);
      }
    }
  }

  async function saveActiveEditorChanges(): Promise<boolean> {
    if (!state.activeBookId.value) return true;
    const currentEditor = editor.value;
    if (!currentEditor) return true;
    try {
      return await currentEditor.saveAllChanges();
    } catch (error: unknown) {
      notifications.error(
        error instanceof Error
          ? error.message
          : "保存长篇修改失败，已取消切换。"
      );
      return false;
    }
  }

  async function saveActiveEditorBeforeLeaving(
    nextBookId?: string
  ): Promise<boolean> {
    const currentBookId = state.activeBookId.value;
    if (!currentBookId || currentBookId === nextBookId) return true;
    return saveActiveEditorChanges();
  }

  async function openBook(
    bookId: string,
    requestedSelection: LongWorkspaceSelection | null = null
  ): Promise<void> {
    if (disposed) return;
    const api = context.api();
    if (!api) {
      notifications.warning(
        "浏览器预览不能打开长篇项目，请使用桌面客户端。"
      );
      return;
    }
    if (
      context.blockWritingPlan("打开其他长篇", {
        targetBookId: bookId,
        allowPlanBook: true
      })
    ) {
      return;
    }
    if (!(await saveActiveEditorBeforeLeaving(bookId)) || disposed) return;

    const featureDependencies = context.prepareOpenDependencies();
    context.activateProposalBook(bookId);
    // Publish the requested stage before the workspace payload so first entry
    // does not briefly restore a default stage and then reflow.
    store.activateBook(bookId, requestedSelection, true);
    refreshClock.invalidate(bookId);
    try {
      await Promise.all([
        featureDependencies,
        store.ensureWorkspace(bookId, async () => {
          const opened = await api.open({ bookId });
          return {
            bookId,
            workspaceIndex: opened.book.workspaceIndex,
            summary: opened.summary
          };
        })
      ]);
    } catch (error: unknown) {
      if (disposed) return;
      notifications.error(
        error instanceof Error ? error.message : "打开长篇项目失败。"
      );
    }
  }

  async function refreshActiveWorkspace(bookId: string): Promise<boolean> {
    if (disposed) return false;
    const api = context.api();
    if (!api) return false;
    const requestId = refreshClock.begin(bookId);
    if (state.activeBookId.value === bookId) {
      state.refreshStatus.value = {
        bookId,
        requestId,
        pending: true,
        error: null
      };
    }

    try {
      const result = await api.getWorkspaceIndex({ bookId });
      if (
        disposed ||
        state.activeBookId.value !== bookId ||
        !refreshClock.isCurrent(bookId, requestId)
      ) {
        return false;
      }
      if (result.bookId !== bookId) {
        throw new Error("长篇工作区刷新返回了其他书籍。");
      }
      const currentSummary = state.activeBookSummary.value;
      if (!currentSummary || currentSummary.id !== bookId) {
        throw new Error("活动长篇摘要已经切换，无法发布刷新结果。");
      }
      const currentIndex = state.workspaceIndex.value;
      if (
        !isMonotonicLongWorkspaceRefresh(
          currentIndex
            ? {
                workspaceRevision: currentIndex.revision,
                projectRevision: currentSummary.projectRevision
              }
            : null,
          {
            workspaceRevision: result.workspaceIndex.revision,
            projectRevision: result.projectRevision
          }
        )
      ) {
        state.refreshStatus.value = null;
        return true;
      }

      const nextSummary: LongBookSummary = {
        ...currentSummary,
        projectRevision: result.projectRevision,
        updatedAt: result.workspaceIndex.updatedAt,
        navigation: createLongWorkspaceNavigationSnapshot(
          result.workspaceIndex
        )
      };
      const currentSelection = state.selection.value;
      const nextSelection = currentSelection
        ? reconcileLongWorkspaceSelection(
            nextSummary,
            result.workspaceIndex,
            currentSelection
          ) ?? null
        : null;
      const activeFileId = state.fileContext.value?.fileId;
      const nextFile = nextSelection?.files.find(
        ({ file }) => file.id === activeFileId
      )?.file;

      // These assignments are one synchronous publication boundary. Do not
      // insert an await between the index, summary, selection and file context.
      state.workspaceIndex.value = result.workspaceIndex;
      state.longBooks.value = replaceLongBookSummary(
        state.longBooks.value,
        nextSummary
      );
      if (currentSelection) {
        state.selection.value = nextSelection;
        state.fileContext.value = nextFile
          ? {
              bookId,
              fileId: nextFile.id,
              fileRevision: nextFile.revision
            }
          : null;
      }
      context.synchronizeSelectedResourceForLayout(bookId);
      state.refreshStatus.value = null;
      return true;
    } catch (error: unknown) {
      if (
        !disposed &&
        state.activeBookId.value === bookId &&
        refreshClock.isCurrent(bookId, requestId)
      ) {
        const message =
          error instanceof Error
            ? error.message
            : "刷新长篇工作区索引失败。";
        state.refreshStatus.value = {
          bookId,
          requestId,
          pending: false,
          error: message
        };
        notifications.error(message);
      }
      return false;
    }
  }

  function synchronizeRequiredRevision(bookId: string): boolean {
    const requirement = state.revisionRequirement.value;
    if (!requirement || requirement.bookId !== bookId) return true;
    const index = state.workspaceIndex.value;
    const summary = state.activeBookSummary.value;
    if (
      state.activeBookId.value !== bookId ||
      !index ||
      !summary ||
      summary.id !== bookId ||
      !hasReachedLongWorkspaceRevisionTarget(
        {
          workspaceRevision: index.revision,
          projectRevision: summary.projectRevision
        },
        requirement
      )
    ) {
      return false;
    }
    try {
      editor.value?.synchronizeProjectRevisions(
        index.revision,
        summary.projectRevision
      );
    } catch {
      return false;
    }
    state.revisionRequirement.value = null;
    return true;
  }

  function markRevisionSyncFailure(bookId: string): void {
    if (state.activeBookId.value !== bookId) return;
    if (state.activeRefreshStatus.value?.error) return;
    state.refreshStatus.value = {
      bookId,
      requestId: refreshClock.begin(bookId),
      pending: false,
      error:
        "账本回滚已经完成，但最新工作区版本尚未同步。正文编辑已锁定，请重新同步。"
    };
  }

  async function refreshAndSynchronizeRequiredRevision(
    bookId: string
  ): Promise<boolean> {
    const requirement = state.revisionRequirement.value;
    if (!requirement || requirement.bookId !== bookId) {
      return refreshActiveWorkspace(bookId);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const refreshed = await refreshActiveWorkspace(bookId);
      if (synchronizeRequiredRevision(bookId)) return true;
      if (!refreshed && state.activeRefreshStatus.value?.error) break;
    }
    markRevisionSyncFailure(bookId);
    return false;
  }

  async function selectWorkspaceFile(
    nextSelection: LongWorkspaceSelection
  ): Promise<boolean> {
    if (
      (state.selection.value?.key !== nextSelection.key ||
        state.selection.value?.worldbuildingItemId !==
          nextSelection.worldbuildingItemId ||
        state.selection.value?.preferredFileId !==
          nextSelection.preferredFileId ||
        state.selection.value?.bookLineVolumeId !==
          nextSelection.bookLineVolumeId ||
        state.selection.value?.characterId !== nextSelection.characterId ||
        state.selection.value?.plotPointId !== nextSelection.plotPointId ||
        state.selection.value?.chapterCardId !== nextSelection.chapterCardId) &&
      !(await saveActiveEditorChanges())
    ) {
      return false;
    }
    const preferredFile =
      nextSelection.files.find(
        ({ file }) => file.id === nextSelection.preferredFileId
      ) ??
      nextSelection.files.find(
        (file) => file.role === nextSelection.preferredRole
      ) ??
      nextSelection.files[0];
    if (preferredFile) {
      await editor.value?.ensureDocumentsLoaded([preferredFile]);
    }
    state.fileContext.value = null;
    state.selection.value = nextSelection;
    return true;
  }

  async function selectCharacterTab(
    characterId: LongCharacterId,
    done?: (accepted: boolean) => void
  ): Promise<void> {
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    const group = state.selection.value?.characterGroup;
    if (!summary || !index || !group) {
      done?.(false);
      return;
    }
    const accepted = await selectWorkspaceFile(
      createLongCharacterGroupSelection(
        summary,
        index,
        group,
        characterId
      )
    );
    done?.(accepted);
  }

  async function selectPlotPointTab(plotPointId: LongArcId): Promise<void> {
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    const volumeId = state.selection.value?.plotPointVolumeId;
    if (!summary || !index || !volumeId) return;
    const nextSelection = createLongPlotPointVolumeSelection(
      summary,
      index,
      volumeId,
      plotPointId
    );
    if (nextSelection) await selectWorkspaceFile(nextSelection);
  }

  async function selectChapterCardTab(chapterCardId: string): Promise<void> {
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    const volumeId = state.selection.value?.chapterCardVolumeId;
    if (!summary || !index || !volumeId) return;
    const nextSelection = createLongChapterCardVolumeSelection(
      summary,
      index,
      volumeId,
      chapterCardId
    );
    if (nextSelection) await selectWorkspaceFile(nextSelection);
  }

  function handleFileContextChange(
    nextContext: LongWorkspaceFileContext | null
  ): void {
    if (nextContext && nextContext.bookId !== state.activeBookId.value) return;
    state.fileContext.value = nextContext;
  }

  function handleDocumentSaved(result: LongWriteDocumentResult): void {
    void refreshActiveWorkspace(result.bookId);
  }

  async function retryActiveRefresh(): Promise<void> {
    const bookId = state.activeBookId.value;
    if (!bookId || state.activeRefreshStatus.value?.pending) return;
    if (state.activeRevisionRequirement.value) {
      if (await refreshAndSynchronizeRequiredRevision(bookId)) {
        notifications.success(
          "已同步账本回滚后的最新版本，可以继续编辑正文。"
        );
      }
      return;
    }
    await refreshActiveWorkspace(bookId);
  }

  async function refreshOnWindowFocus(bookId: string): Promise<void> {
    if (!(await refreshActiveWorkspace(bookId))) return;
    const index = state.workspaceIndex.value;
    const summary = state.activeBookSummary.value;
    if (
      state.activeBookId.value !== bookId ||
      !index ||
      !summary ||
      summary.id !== bookId
    ) {
      return;
    }
    const synchronized =
      editor.value?.synchronizeProjectRevisionsIfClean(
        bookId,
        index.revision,
        summary.projectRevision
      ) ?? true;
    if (!synchronized) {
      notifications.warning(
        "长篇项目已在外部更新；当前有未保存内容，已保留编辑内容和原版本基线，请先保存并处理版本冲突。"
      );
    }
  }

  function invalidateRefresh(bookId: string): void {
    refreshClock.invalidate(bookId);
  }

  function deactivateActiveBook(): void {
    const bookId = state.activeBookId.value;
    if (bookId) refreshClock.invalidate(bookId);
    store.clearActiveBook();
  }

  async function clearActiveBook(bookId: string): Promise<void> {
    if (state.activeBookId.value !== bookId) return;
    deactivateActiveBook();
    await context.selectFallbackAfterClear();
  }

  function activateOpenedBook(opened: LongOpenBookResult): void {
    context.activateProposalBook(opened.book.id);
    refreshClock.invalidate(opened.book.id);
    state.refreshStatus.value = null;
    state.activeBookId.value = opened.book.id;
    state.workspaceIndex.value = opened.book.workspaceIndex;
    state.longBooks.value = replaceLongBookSummary(
      state.longBooks.value,
      opened.summary
    );
    state.selection.value = null;
    state.fileContext.value = null;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelCatalogRetry();
    seenCatalogDiagnosticKeys.clear();
    editor.value = null;
    store.dispose();
  }

  return {
    editor,
    loadBookList,
    saveActiveEditorChanges,
    saveActiveEditorBeforeLeaving,
    openBook,
    refreshActiveWorkspace,
    refreshAndSynchronizeRequiredRevision,
    selectWorkspaceFile,
    selectCharacterTab,
    selectPlotPointTab,
    selectChapterCardTab,
    handleFileContextChange,
    handleDocumentSaved,
    retryActiveRefresh,
    refreshOnWindowFocus,
    invalidateRefresh,
    deactivateActiveBook,
    clearActiveBook,
    activateOpenedBook,
    dispose
  };
}
