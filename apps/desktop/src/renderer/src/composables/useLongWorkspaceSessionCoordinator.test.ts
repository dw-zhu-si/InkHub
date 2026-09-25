import {
  type LongBookSummary,
  type LongFileId,
  type LongFileRevision,
  type LongListBooksResult,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import { createPinia, setActivePinia, storeToRefs } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongWorkspaceStore } from "../stores/longWorkspaceStore";
import type {
  LongWorkspaceRendererApi,
  LongWorkspaceSelection
} from "../types/longWorkspace";
import {
  useLongWorkspaceSessionCoordinator,
  type LongWorkspaceEditorPort
} from "./useLongWorkspaceSessionCoordinator";

const NOW = "2026-08-14T08:00:00.000Z";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

function index(bookId: string, revision = 1): LongWorkspaceIndexSnapshot {
  const stableBookId = bookId.startsWith("longbook_")
    ? bookId
    : `longbook_${bookId.replace(/[^A-Za-z0-9._:-]/g, "_")}`;
  return {
    schemaVersion: 1,
    revision,
    bookId: stableBookId,
    updatedAt: NOW,
    worldbuilding: [],
    characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
    characters: [],
    characterFiles: [],
    plot: {
      volumes: [
        {
          id: "volume_one",
          title: "第一卷",
          order: 1,
          summary: ""
        }
      ],
      arcs: [],
      chapterCards: [],
      storyEvents: [],
      storyPlots: [],
      eventConnections: [],
      narrativePlacements: [],
      foreshadowing: []
    },
    chapters: [],
    ledger: { committedThroughChapterId: null, commits: [] }
  } as unknown as LongWorkspaceIndexSnapshot;
}

function summary(
  bookId: string,
  revision = 1,
  projectRevision = revision
): LongBookSummary {
  return {
    id: bookId,
    title: `长篇 ${bookId}`,
    projectRevision,
    updatedAt: NOW,
    navigation: {
      revision,
      worldbuilding: [],
      characterTypes: [],
      characters: [],
      volumes: [],
      arcs: [],
      chapterCards: [],
      counts: {
        worldbuildingCategories: 0,
        characters: 0,
        arcs: 0,
        volumes: 0,
        chapterCards: 0,
        foreshadowingThreads: 0,
        committedChapters: 0
      }
    }
  } as unknown as LongBookSummary;
}

function listResult(
  books: readonly LongBookSummary[],
  diagnostics: LongListBooksResult["diagnostics"] = []
): LongListBooksResult {
  return {
    revision: books.length,
    updatedAt: NOW,
    books: [...books],
    diagnostics
  };
}

function selection(
  key: string,
  files: LongWorkspaceSelection["files"] = [],
  preferredFileId?: LongFileId
): LongWorkspaceSelection {
  return {
    key,
    root: "worldbuilding",
    title: key,
    breadcrumbs: [key],
    files,
    preferredRole: "content",
    ...(preferredFileId ? { preferredFileId } : {})
  };
}

function editorPort(overrides: Partial<LongWorkspaceEditorPort> = {}) {
  return {
    saveAllChanges: vi.fn(async () => true),
    selectBookLineVolume: vi.fn(),
    focusFile: vi.fn(async () => true),
    focusTarget: vi.fn(async () => true),
    captureNavigationSelection: vi.fn(() => ({})),
    ensureDocumentsLoaded: vi.fn(async () => true),
    synchronizeProjectRevisions: vi.fn(),
    synchronizeProjectRevisionsIfClean: vi.fn(() => true),
    ...overrides
  } satisfies LongWorkspaceEditorPort;
}

function createHarness(apiOverrides: Record<string, unknown> = {}) {
  const store = useLongWorkspaceStore();
  const refs = storeToRefs(store);
  const api = {
    list: vi.fn(async () => listResult([])),
    open: vi.fn(),
    getWorkspaceIndex: vi.fn(),
    ...apiOverrides
  };
  const notifications = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  };
  const blockWritingPlan = vi.fn(() => false);
  const prepareOpenDependencies = vi.fn(async () => undefined);
  const activateProposalBook = vi.fn();
  const synchronizeSelectedResourceForLayout = vi.fn();
  const selectFallbackAfterClear = vi.fn(async () => undefined);
  const coordinator = useLongWorkspaceSessionCoordinator({
    store,
    state: {
      longBooks: refs.longBooks,
      activeBookId: refs.activeBookId,
      activeBookSummary: refs.activeBookSummary,
      workspaceIndex: refs.workspaceIndex,
      selection: refs.selection,
      fileContext: refs.fileContext,
      refreshStatus: refs.refreshStatus,
      activeRefreshStatus: refs.activeRefreshStatus,
      revisionRequirement: refs.revisionRequirement,
      activeRevisionRequirement: refs.activeRevisionRequirement
    },
    api: () => api as unknown as LongWorkspaceRendererApi,
    isWorkspaceActive: () => false,
    blockWritingPlan,
    prepareOpenDependencies,
    activateProposalBook,
    synchronizeSelectedResourceForLayout,
    selectFallbackAfterClear,
    notifications,
    scheduler: {
      setTimeout: (task, delayMs) => setTimeout(task, delayMs),
      clearTimeout: (handle) => clearTimeout(handle)
    }
  });
  return {
    activateProposalBook,
    api,
    blockWritingPlan,
    coordinator,
    notifications,
    prepareOpenDependencies,
    refs,
    selectFallbackAfterClear,
    store,
    synchronizeSelectedResourceForLayout
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("long workspace session coordinator", () => {
  it("saves before switching and publishes the requested selection before open settles", async () => {
    const pendingOpen = deferred<{
      book: { workspaceIndex: LongWorkspaceIndexSnapshot };
      summary: LongBookSummary;
    }>();
    const harness = createHarness({
      open: vi.fn(() => pendingOpen.promise)
    });
    harness.store.publishBookList(
      listResult([summary("longbook_a"), summary("longbook_b")])
    );
    harness.store.publishBook(summary("longbook_a"), index("longbook_a"));
    const saveAllChanges = vi.fn(async () => false);
    const currentEditor = editorPort({ saveAllChanges });
    harness.coordinator.editor.value = currentEditor;
    const requestedSelection = selection("worldbuilding:book-b");

    await harness.coordinator.openBook("longbook_b", requestedSelection);
    expect(harness.api.open).not.toHaveBeenCalled();
    expect(harness.refs.activeBookId.value).toBe("longbook_a");

    saveAllChanges.mockResolvedValue(true);
    const opening = harness.coordinator.openBook(
      "longbook_b",
      requestedSelection
    );
    await flushMicrotasks();
    expect(harness.refs.activeBookId.value).toBe("longbook_b");
    expect(harness.refs.selection.value).toBe(requestedSelection);
    expect(harness.activateProposalBook).toHaveBeenCalledWith("longbook_b");

    pendingOpen.resolve({
      book: { workspaceIndex: index("longbook_b", 2) },
      summary: summary("longbook_b", 2, 3)
    });
    await opening;
    expect(harness.refs.workspaceIndex.value?.revision).toBe(2);
    expect(harness.prepareOpenDependencies).toHaveBeenCalledOnce();
  });

  it("publishes only the latest monotonic refresh and synchronizes layout after publication", async () => {
    const first = deferred<{
      bookId: string;
      workspaceIndex: LongWorkspaceIndexSnapshot;
      projectRevision: number;
    }>();
    const second = deferred<{
      bookId: string;
      workspaceIndex: LongWorkspaceIndexSnapshot;
      projectRevision: number;
    }>();
    const harness = createHarness({
      getWorkspaceIndex: vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)
        .mockResolvedValueOnce({
          bookId: "longbook_a",
          workspaceIndex: index("longbook_a", 2),
          projectRevision: 5
        })
    });
    harness.store.publishBook(
      summary("longbook_a", 1, 1),
      index("longbook_a", 1)
    );
    harness.synchronizeSelectedResourceForLayout.mockImplementation(() => {
      expect(harness.refs.workspaceIndex.value?.revision).toBe(3);
      expect(harness.refs.activeBookSummary.value?.projectRevision).toBe(4);
    });

    const staleRefresh =
      harness.coordinator.refreshActiveWorkspace("longbook_a");
    const currentRefresh =
      harness.coordinator.refreshActiveWorkspace("longbook_a");
    second.resolve({
      bookId: "longbook_a",
      workspaceIndex: index("longbook_a", 3),
      projectRevision: 4
    });
    await expect(currentRefresh).resolves.toBe(true);
    first.resolve({
      bookId: "longbook_a",
      workspaceIndex: index("longbook_a", 2),
      projectRevision: 2
    });
    await expect(staleRefresh).resolves.toBe(false);
    expect(harness.refs.workspaceIndex.value?.revision).toBe(3);
    expect(harness.synchronizeSelectedResourceForLayout).toHaveBeenCalledOnce();

    await expect(
      harness.coordinator.refreshActiveWorkspace("longbook_a")
    ).resolves.toBe(true);
    expect(harness.refs.workspaceIndex.value?.revision).toBe(3);
    expect(harness.refs.activeBookSummary.value?.projectRevision).toBe(4);
  });

  it("keeps the revision barrier until both revisions are reached and adopted", async () => {
    const harness = createHarness({
      getWorkspaceIndex: vi
        .fn()
        .mockResolvedValueOnce({
          bookId: "longbook_a",
          workspaceIndex: index("longbook_a", 2),
          projectRevision: 4
        })
        .mockResolvedValueOnce({
          bookId: "longbook_a",
          workspaceIndex: index("longbook_a", 3),
          projectRevision: 5
        })
    });
    harness.store.publishBook(
      summary("longbook_a", 1, 1),
      index("longbook_a", 1)
    );
    harness.store.setRevisionRequirement({
      bookId: "longbook_a",
      workspaceRevision: 3,
      projectRevision: 5
    });
    const currentEditor = editorPort();
    harness.coordinator.editor.value = currentEditor;

    await expect(
      harness.coordinator.refreshAndSynchronizeRequiredRevision("longbook_a")
    ).resolves.toBe(true);
    expect(harness.api.getWorkspaceIndex).toHaveBeenCalledTimes(2);
    expect(currentEditor.synchronizeProjectRevisions).toHaveBeenCalledWith(3, 5);
    expect(harness.refs.revisionRequirement.value).toBeNull();
  });

  it("preserves the revision barrier and exposes a retry error when editor adoption fails", async () => {
    const harness = createHarness({
      getWorkspaceIndex: vi.fn(async () => ({
        bookId: "longbook_a",
        workspaceIndex: index("longbook_a", 3),
        projectRevision: 5
      }))
    });
    harness.store.publishBook(
      summary("longbook_a", 1, 1),
      index("longbook_a", 1)
    );
    harness.store.setRevisionRequirement({
      bookId: "longbook_a",
      workspaceRevision: 3,
      projectRevision: 5
    });
    harness.coordinator.editor.value = editorPort({
      synchronizeProjectRevisions: vi.fn(() => {
        throw new Error("editor rejected baseline");
      })
    });

    await expect(
      harness.coordinator.refreshAndSynchronizeRequiredRevision("longbook_a")
    ).resolves.toBe(false);
    expect(harness.api.getWorkspaceIndex).toHaveBeenCalledTimes(2);
    expect(harness.refs.revisionRequirement.value).not.toBeNull();
    expect(harness.refs.activeRefreshStatus.value?.error).toContain(
      "正文编辑已锁定"
    );
  });

  it("saves and preloads the preferred file before publishing a new selection", async () => {
    const order: string[] = [];
    const firstFileId = "long-file-first" as LongFileId;
    const preferredFileId = "long-file-preferred" as LongFileId;
    const revision = "v2:test-placeholder" as LongFileRevision;
    const currentEditor = editorPort({
      saveAllChanges: vi.fn(async () => {
        order.push("save");
        return true;
      }),
      ensureDocumentsLoaded: vi.fn(async (files) => {
        order.push(`load:${files[0]?.file.id}`);
        return true;
      })
    });
    const harness = createHarness();
    harness.store.publishBook(summary("longbook_a"), index("longbook_a"));
    harness.store.publishSelection("longbook_a", selection("old"));
    harness.coordinator.editor.value = currentEditor;
    const nextSelection = selection(
      "next",
      [
        {
          role: "content",
          label: "首文件",
          file: {
            id: firstFileId,
            path: "drafts/first.md",
            revision,
            updatedAt: NOW
          }
        },
        {
          role: "content",
          label: "目标文件",
          file: {
            id: preferredFileId,
            path: "drafts/preferred.md",
            revision,
            updatedAt: NOW
          }
        }
      ],
      preferredFileId
    );

    await expect(
      harness.coordinator.selectWorkspaceFile(nextSelection)
    ).resolves.toBe(true);
    expect(order).toEqual(["save", `load:${preferredFileId}`]);
    expect(harness.refs.selection.value).toBe(nextSelection);
  });

  it("deduplicates diagnostics and allows a resolved diagnostic to be reported again", async () => {
    const diagnostic = {
      bookId: "book-unavailable",
      code: "unavailable" as const,
      message: "测试项目暂时不可读"
    };
    const harness = createHarness({
      list: vi
        .fn()
        .mockResolvedValueOnce(listResult([], [diagnostic]))
        .mockResolvedValueOnce(listResult([], [diagnostic]))
        .mockResolvedValueOnce(listResult([], []))
        .mockResolvedValueOnce(listResult([], [diagnostic]))
    });

    await harness.coordinator.loadBookList({ notify: true, force: true });
    await harness.coordinator.loadBookList({ notify: true, force: true });
    await harness.coordinator.loadBookList({ notify: true, force: true });
    await harness.coordinator.loadBookList({ notify: true, force: true });
    expect(harness.notifications.warning).toHaveBeenCalledTimes(2);
  });

  it("retries silent book-list failures twice and cancels pending retry on dispose", async () => {
    const harness = createHarness({
      list: vi.fn(async () => {
        throw new Error("temporary list failure");
      })
    });

    await harness.coordinator.loadBookList({ notify: false });
    expect(harness.api.list).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(harness.api.list).toHaveBeenCalledTimes(2);
    harness.coordinator.dispose();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(harness.api.list).toHaveBeenCalledTimes(2);
    expect(harness.refs.activeBookId.value).toBeNull();
  });

  it("refreshes on focus and preserves an editor baseline when live content is dirty", async () => {
    const harness = createHarness({
      getWorkspaceIndex: vi.fn(async () => ({
        bookId: "longbook_a",
        workspaceIndex: index("longbook_a", 2),
        projectRevision: 3
      }))
    });
    harness.store.publishBook(
      summary("longbook_a", 1, 1),
      index("longbook_a", 1)
    );
    const currentEditor = editorPort({
      synchronizeProjectRevisionsIfClean: vi.fn(() => false)
    });
    harness.coordinator.editor.value = currentEditor;

    await harness.coordinator.refreshOnWindowFocus("longbook_a");
    expect(
      currentEditor.synchronizeProjectRevisionsIfClean
    ).toHaveBeenCalledWith("longbook_a", 2, 3);
    expect(harness.notifications.warning).toHaveBeenCalledWith(
      expect.stringContaining("当前有未保存内容")
    );
  });

  it("invalidates and clears the active session before selecting a fallback", async () => {
    const harness = createHarness();
    harness.store.publishBook(summary("longbook_a"), index("longbook_a"));

    await harness.coordinator.clearActiveBook("longbook_a");
    expect(harness.refs.activeBookId.value).toBeNull();
    expect(harness.refs.workspaceIndex.value).toBeNull();
    expect(harness.selectFallbackAfterClear).toHaveBeenCalledOnce();
  });
});
