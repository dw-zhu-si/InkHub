import {
  LONG_BOOK_LINE_FILE_ID,
  LongWorkspaceIndexSnapshotSchema,
  type LongBookSummary,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import { computed, ref, shallowRef } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { LongWorkspaceRendererApi } from "../types/longWorkspace";
import { createLongStructureMutationBuilder } from "../types/longStructureMutations";
import {
  useLongStructureTransactionsCoordinator,
  type LongStructureTransactionsCoordinatorOptions
} from "./useLongStructureTransactionsCoordinator";

const NOW = "2026-08-14T08:00:00.000Z";
const BOOK_ID = "longbook_structure_alpha";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function workspaceIndex(
  bookId = BOOK_ID,
  revision = 1
): LongWorkspaceIndexSnapshot {
  return LongWorkspaceIndexSnapshotSchema.parse({
    schemaVersion: 1,
    revision,
    bookId,
    updatedAt: NOW,
    bookLine: {
      id: LONG_BOOK_LINE_FILE_ID,
      path: "long/plot/book-line.md",
      revision: "v1:0:00000000",
      updatedAt: NOW
    },
    worldbuilding: [],
    characters: [],
    characterFiles: [],
    plot: {
      volumes: [{ id: "volume_one", title: "第一卷", order: 1, summary: "" }],
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
  });
}

function bookSummary(
  bookId = BOOK_ID,
  workspaceRevision = 1,
  projectRevision = 10
): LongBookSummary {
  return {
    id: bookId,
    title: `长篇 ${bookId}`,
    projectRevision,
    updatedAt: NOW,
    navigation: {
      revision: workspaceRevision,
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

function mutationBatch(
  index: LongWorkspaceIndexSnapshot
): LongWorkspaceOperationBatch {
  return createLongStructureMutationBuilder(index).createVolume({
    title: "第二卷",
    summary: ""
  });
}

function createHarness(overrides: {
  previewOperations?: LongWorkspaceRendererApi["previewOperations"];
  applyOperations?: LongWorkspaceRendererApi["applyOperations"];
  saveActiveEditorChanges?: () => Promise<boolean>;
  refreshActiveWorkspace?: (bookId: string) => Promise<boolean>;
  refreshWritingSaveBarrier?: (bookId: string) => Promise<boolean>;
} = {}) {
  const activeLongBookId = ref<string | null>(BOOK_ID);
  const activeLongWorkspaceIndex = shallowRef<LongWorkspaceIndexSnapshot | null>(
    workspaceIndex()
  );
  const longBooks = shallowRef<readonly LongBookSummary[]>([bookSummary()]);
  const activeLongBookSummary = computed(
    () =>
      longBooks.value.find(({ id }) => id === activeLongBookId.value) ?? null
  );
  const previewOperations = vi.fn(
    overrides.previewOperations ??
      (async ({ bookId }) => ({
        bookId,
        projectRevision: activeLongBookSummary.value?.projectRevision ?? 0,
        preview: { impact: {} }
      }) as never)
  );
  const applyOperations = vi.fn(
    overrides.applyOperations ??
      (async ({ bookId, baseProjectRevision }) => ({
        bookId,
        projectRevision: baseProjectRevision + 1,
        summary: bookSummary(
          bookId,
          (activeLongWorkspaceIndex.value?.revision ?? 0) + 1,
          baseProjectRevision + 1
        ),
        operationResult: {}
      }) as never)
  );
  const api = {
    previewOperations,
    applyOperations,
    getWorkspaceIndex: vi.fn(),
    readDocument: vi.fn()
  } as unknown as LongWorkspaceRendererApi;
  const notifications = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  };
  const refreshWritingSaveBarrier = vi.fn(
    overrides.refreshWritingSaveBarrier ?? (async () => true)
  );
  const options: LongStructureTransactionsCoordinatorOptions = {
    api: () => api,
    state: {
      longBooks,
      activeBookId: activeLongBookId,
      activeBookSummary: activeLongBookSummary,
      workspaceIndex: activeLongWorkspaceIndex,
      selection: shallowRef(null),
      mutationPending: ref(false),
      structureDialogOpen: ref(true),
      characterCreateTarget: shallowRef(null),
      worldbuildingItemCreateTarget: shallowRef(null),
      plotPointCreateTarget: shallowRef(null),
      chapterCardCreateTarget: shallowRef(null),
      draftSectionDeleteTarget: shallowRef(null),
      treeItemDeleteTarget: shallowRef(null),
      volumeCreateTarget: shallowRef(null),
      selectedResourceId: ref("")
    },
    session: {
      blockWritingPlan: vi.fn(() => false),
      saveActiveEditorChanges: vi.fn(
        overrides.saveActiveEditorChanges ?? (async () => true)
      ),
      saveActiveEditorBeforeLeaving: vi.fn(async () => true),
      openBook: vi.fn(async () => undefined),
      refreshActiveWorkspace: vi.fn(
        overrides.refreshActiveWorkspace ?? (async () => true)
      ),
      refreshWritingSaveBarrier,
      selectWorkspaceFile: vi.fn(async () => true),
      selectChapterCardTab: vi.fn(async () => undefined),
      editor: shallowRef(null)
    },
    resources: {
      node: vi.fn(() => undefined),
      select: vi.fn(async () => undefined),
      synchronizeSelectedResourceForLayout: vi.fn(),
      revealEditor: vi.fn()
    },
    notifications
  };
  const coordinator = useLongStructureTransactionsCoordinator(options);
  return {
    ...options.state,
    api,
    applyOperations,
    coordinator,
    notifications,
    previewOperations,
    refreshWritingSaveBarrier
  };
}

function completion() {
  return {
    succeed: vi.fn(),
    fail: vi.fn(),
    appliedButRefreshFailed: vi.fn()
  };
}

describe("useLongStructureTransactionsCoordinator", () => {
  it("single-flights duplicate submissions", async () => {
    const pendingApply = deferred<never>();
    const harness = createHarness({
      applyOperations: vi.fn(() => pendingApply.promise)
    });
    const firstCompletion = completion();
    const duplicateCompletion = completion();
    const batch = mutationBatch(harness.workspaceIndex.value!);

    const first = harness.coordinator.handleActiveLongStructureMutation(
      batch,
      firstCompletion
    );
    await vi.waitFor(() => {
      expect(harness.applyOperations).toHaveBeenCalledTimes(1);
    });
    const duplicate = harness.coordinator.handleActiveLongStructureMutation(
      batch,
      duplicateCompletion
    );

    expect(duplicateCompletion.fail).toHaveBeenCalledWith(
      "另一项长篇结构修改仍在处理中。"
    );
    pendingApply.resolve({
      bookId: BOOK_ID,
      projectRevision: 11,
      summary: bookSummary(BOOK_ID, 2, 11),
      operationResult: {}
    } as never);
    await Promise.all([first, duplicate]);
    expect(firstCompletion.succeed).toHaveBeenCalledTimes(1);
  });

  it("does not publish a late apply result into a different active book", async () => {
    const pendingApply = deferred<never>();
    const harness = createHarness({
      applyOperations: vi.fn(() => pendingApply.promise)
    });
    const result = completion();
    const request = harness.coordinator.handleActiveLongStructureMutation(
      mutationBatch(harness.workspaceIndex.value!),
      result
    );
    await flushMicrotasks();

    const otherBookId = "longbook_structure_beta";
    harness.activeBookId.value = otherBookId;
    harness.longBooks.value = [bookSummary(otherBookId, 4, 20)];
    harness.workspaceIndex.value = workspaceIndex(otherBookId, 4);
    pendingApply.resolve({
      bookId: BOOK_ID,
      projectRevision: 11,
      summary: bookSummary(BOOK_ID, 2, 11),
      operationResult: {}
    } as never);
    await request;

    expect(result.succeed).not.toHaveBeenCalled();
    expect(result.appliedButRefreshFailed).toHaveBeenCalledTimes(1);
    expect(harness.longBooks.value.map(({ id }) => id)).toEqual([otherBookId]);
    expect(harness.refreshWritingSaveBarrier).not.toHaveBeenCalled();
  });

  it("rebases against the authoritative revisions advanced by editor save", async () => {
    let harness!: ReturnType<typeof createHarness>;
    const save = vi.fn(async () => {
      harness.workspaceIndex.value = workspaceIndex(BOOK_ID, 2);
      harness.longBooks.value = [bookSummary(BOOK_ID, 2, 14)];
      return true;
    });
    harness = createHarness({ saveActiveEditorChanges: save });
    const initialIndex = harness.workspaceIndex.value!;
    const result = completion();

    await harness.coordinator.handleActiveLongStructureMutation(
      mutationBatch(initialIndex),
      result
    );

    expect(harness.previewOperations).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: BOOK_ID,
        batch: expect.objectContaining({ baseRevision: 2 })
      })
    );
    expect(harness.applyOperations).toHaveBeenCalledWith(
      expect.objectContaining({ baseProjectRevision: 14 })
    );
    expect(result.succeed).toHaveBeenCalledTimes(1);
  });

  it("rejects a batch when the target changes after preview", async () => {
    const pendingPreview = deferred<never>();
    const harness = createHarness({
      previewOperations: vi.fn(() => pendingPreview.promise)
    });
    const result = completion();
    const request = harness.coordinator.handleActiveLongStructureMutation(
      mutationBatch(harness.workspaceIndex.value!),
      result
    );
    await flushMicrotasks();
    harness.workspaceIndex.value = workspaceIndex(BOOK_ID, 2);
    pendingPreview.resolve({
      bookId: BOOK_ID,
      projectRevision: 10,
      preview: { impact: {} }
    } as never);
    await request;

    expect(harness.applyOperations).not.toHaveBeenCalled();
    expect(result.fail).toHaveBeenCalledTimes(1);
    expect(result.succeed).not.toHaveBeenCalled();
  });

  it("drains an issued apply during dispose and suppresses late UI publication", async () => {
    const pendingApply = deferred<never>();
    const harness = createHarness({
      applyOperations: vi.fn(() => pendingApply.promise)
    });
    const result = completion();
    const request = harness.coordinator.handleActiveLongStructureMutation(
      mutationBatch(harness.workspaceIndex.value!),
      result
    );
    await flushMicrotasks();

    let disposed = false;
    const dispose = harness.coordinator.dispose().then(() => {
      disposed = true;
    });
    await flushMicrotasks();
    expect(disposed).toBe(false);
    pendingApply.resolve({
      bookId: BOOK_ID,
      projectRevision: 11,
      summary: bookSummary(BOOK_ID, 2, 11),
      operationResult: {}
    } as never);
    await Promise.all([request, dispose]);

    expect(result.succeed).not.toHaveBeenCalled();
    expect(result.fail).not.toHaveBeenCalled();
    expect(result.appliedButRefreshFailed).not.toHaveBeenCalled();
    expect(harness.refreshWritingSaveBarrier).not.toHaveBeenCalled();
    expect(harness.notifications.success).not.toHaveBeenCalled();
    expect(harness.mutationPending.value).toBe(false);
  });

  it("reports an applied mutation separately when refresh fails", async () => {
    const harness = createHarness({
      refreshWritingSaveBarrier: vi.fn(async () => false)
    });
    const result = completion();

    await harness.coordinator.handleActiveLongStructureMutation(
      mutationBatch(harness.workspaceIndex.value!),
      result
    );

    expect(result.succeed).not.toHaveBeenCalled();
    expect(result.fail).not.toHaveBeenCalled();
    expect(result.appliedButRefreshFailed).toHaveBeenCalledWith(
      "结构修改已保存，但界面未能同步最新结构。"
    );
    expect(harness.structureDialogOpen.value).toBe(false);
  });
});
