import type {
  LongBookSummary,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { LongWorkspaceRevisionSyncRequirement } from "../stores/longWorkspaceStore";
import lazySource from "./useLazyLongRollbackCoordinator.ts?raw";
import {
  useLazyLongRollbackCoordinator,
  type LongRollbackCoordinatorModule
} from "./useLazyLongRollbackCoordinator";
import type {
  LongRollbackCoordinator,
  LongRollbackCoordinatorOptions
} from "./useLongRollbackCoordinator";

const BOOK_ID = "longbook_lazy_rollback";
const COMMIT_ID = "commit_lazy_rollback";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks(turns = 8): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

function fakeSummary(): LongBookSummary {
  return {
    id: BOOK_ID,
    projectRevision: 8,
    title: "懒加载回滚",
    navigation: { chapterCards: [] }
  } as unknown as LongBookSummary;
}

function fakeIndex(): LongWorkspaceIndexSnapshot {
  return {
    revision: 7,
    ledger: {
      commits: [
        {
          id: COMMIT_ID,
          bookId: BOOK_ID,
          sequence: 3,
          reversible: true,
          chapterCardId: "chapter_lazy"
        }
      ]
    }
  } as unknown as LongWorkspaceIndexSnapshot;
}

function fakeLoadedCoordinator(): LongRollbackCoordinator {
  return {
    openLongRollbackDialog: vi.fn(),
    closeLongRollbackDialog: vi.fn(),
    confirmLongRollback: vi.fn(async () => undefined),
    currentTarget: vi.fn(() => null),
    ownsPending: vi.fn(() => false),
    drain: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined)
  };
}

function createContext(input: { readonly pending?: boolean } = {}) {
  const revisionRequirement = ref<LongWorkspaceRevisionSyncRequirement | null>(
    null
  );
  const state = {
    activeBookId: ref<string | null>(BOOK_ID),
    activeBookSummary: ref<LongBookSummary | null>(fakeSummary()),
    workspaceIndex: ref<LongWorkspaceIndexSnapshot | null>(fakeIndex()),
    revisionRequirement,
    rollbackDialogOpen: ref(false),
    rollbackPending: ref(input.pending ?? false),
    rollbackCommitId: ref<string | null>(null)
  };
  const notifications = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  };
  const context: LongRollbackCoordinatorOptions = {
    api: () => undefined,
    state,
    session: {
      saveActiveEditorChanges: vi.fn(async () => true),
      refreshActiveWorkspace: vi.fn(async () => true),
      refreshAndSynchronizeRequiredRevision: vi.fn(async () => true)
    },
    navigation: { clearRolledBackCommitSelection: vi.fn() },
    catalog: { loadBookList: vi.fn(async () => undefined) },
    scheduler: { settleUi: vi.fn(async () => undefined) },
    blockWritingPlan: vi.fn(() => false),
    notifications
  };
  return { context, notifications, state };
}

describe("useLazyLongRollbackCoordinator", () => {
  it("keeps the implementation behind a type-only dynamic boundary", () => {
    expect(lazySource).toContain(
      'import type {\n  LongRollbackCoordinator,'
    );
    expect(lazySource).not.toContain(
      'import { useLongRollbackCoordinator }'
    );
    expect(lazySource).toContain(
      'return import("./useLongRollbackCoordinator")'
    );
  });

  it("opens synchronously while one shared lazy load serves open and confirm", async () => {
    const loading = deferred<LongRollbackCoordinatorModule>();
    const loaded = fakeLoadedCoordinator();
    const useLongRollbackCoordinator = vi.fn(() => loaded);
    const loadModule = vi.fn(() => loading.promise);
    const test = createContext();
    const lazy = useLazyLongRollbackCoordinator(test.context, loadModule);

    lazy.openLongRollbackDialog();
    expect(test.state.rollbackDialogOpen.value).toBe(true);
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_ID);
    expect(lazy.currentTarget()).toEqual({
      requestId: 1,
      bookId: BOOK_ID,
      commitId: COMMIT_ID,
      commitSequence: 3,
      capturedWorkspaceRevision: 7,
      capturedProjectRevision: 8
    });
    expect(loadModule).toHaveBeenCalledOnce();

    lazy.openLongRollbackDialog();
    const confirming = lazy.confirmLongRollback();
    expect(loadModule).toHaveBeenCalledOnce();
    loading.resolve({ useLongRollbackCoordinator });
    await confirming;

    expect(useLongRollbackCoordinator).toHaveBeenCalledOnce();
    expect(loaded.openLongRollbackDialog).not.toHaveBeenCalled();
    expect(loaded.confirmLongRollback).toHaveBeenCalledOnce();
  });

  it("also loads lazily when confirm is the first facade action", async () => {
    const loaded = fakeLoadedCoordinator();
    const useLongRollbackCoordinator = vi.fn(() => loaded);
    const loadModule = vi.fn(async () => ({ useLongRollbackCoordinator }));
    const test = createContext();
    const lazy = useLazyLongRollbackCoordinator(test.context, loadModule);

    await lazy.confirmLongRollback();

    expect(loadModule).toHaveBeenCalledOnce();
    expect(loaded.confirmLongRollback).toHaveBeenCalledOnce();
  });

  it("retries a failed lazy load and does not let it block cleanup", async () => {
    const loaded = fakeLoadedCoordinator();
    const useLongRollbackCoordinator = vi.fn(() => loaded);
    const loadModule = vi
      .fn<() => Promise<LongRollbackCoordinatorModule>>()
      .mockRejectedValueOnce(new Error("rollback chunk failed"))
      .mockResolvedValueOnce({ useLongRollbackCoordinator });
    const test = createContext();
    const lazy = useLazyLongRollbackCoordinator(test.context, loadModule);

    lazy.openLongRollbackDialog();
    await flushMicrotasks();
    expect(test.notifications.error).toHaveBeenCalledWith(
      "rollback chunk failed"
    );
    expect(loadModule).toHaveBeenCalledOnce();

    await lazy.confirmLongRollback();
    expect(loadModule).toHaveBeenCalledTimes(2);
    expect(loaded.confirmLongRollback).toHaveBeenCalledOnce();
    await lazy.dispose();
    expect(loaded.dispose).toHaveBeenCalledOnce();
  });

  it("disposes without loading and preserves a foreign pending owner", async () => {
    const loadModule = vi.fn<() => Promise<LongRollbackCoordinatorModule>>();
    const test = createContext({ pending: true });
    test.state.rollbackDialogOpen.value = true;
    test.state.rollbackCommitId.value = COMMIT_ID;
    const lazy = useLazyLongRollbackCoordinator(test.context, loadModule);

    await lazy.dispose();

    expect(loadModule).not.toHaveBeenCalled();
    expect(test.state.rollbackPending.value).toBe(true);
    expect(test.state.rollbackDialogOpen.value).toBe(true);
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_ID);
  });

  it("waits for a loading coordinator, disposes it, and preserves newer refs", async () => {
    const loading = deferred<LongRollbackCoordinatorModule>();
    const loaded = fakeLoadedCoordinator();
    const useLongRollbackCoordinator = vi.fn(() => loaded);
    const test = createContext();
    const lazy = useLazyLongRollbackCoordinator(
      test.context,
      vi.fn(() => loading.promise)
    );
    lazy.openLongRollbackDialog();

    let disposeSettled = false;
    const disposing = lazy.dispose().then(() => {
      disposeSettled = true;
    });
    test.state.rollbackDialogOpen.value = true;
    test.state.rollbackCommitId.value = "commit_new_owner";
    await flushMicrotasks();
    expect(disposeSettled).toBe(false);

    loading.resolve({ useLongRollbackCoordinator });
    await disposing;

    expect(loaded.dispose).toHaveBeenCalledOnce();
    expect(test.state.rollbackDialogOpen.value).toBe(true);
    expect(test.state.rollbackCommitId.value).toBe("commit_new_owner");
    expect(test.notifications.error).not.toHaveBeenCalled();
  });

  it("delegates dispose after the coordinator is fully loaded", async () => {
    const loaded = fakeLoadedCoordinator();
    const useLongRollbackCoordinator = vi.fn(() => loaded);
    const test = createContext();
    const lazy = useLazyLongRollbackCoordinator(test.context, async () => ({
      useLongRollbackCoordinator
    }));
    lazy.openLongRollbackDialog();
    await flushMicrotasks();

    await lazy.dispose();

    expect(loaded.dispose).toHaveBeenCalledOnce();
  });
});
