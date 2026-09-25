import type {
  LongBookSummary,
  LongRollbackLastCommitResult,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { LongWorkspaceRevisionSyncRequirement } from "../stores/longWorkspaceStore";
import {
  useLongRollbackCoordinator,
  type LongRollbackApi
} from "./useLongRollbackCoordinator";

const BOOK_A = "longbook_rollback_a";
const BOOK_B = "longbook_rollback_b";
const COMMIT_A = "commit_a";
const COMMIT_B = "commit_b";

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
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

function fakeSummary(
  id = BOOK_A,
  projectRevision = 10
): LongBookSummary {
  return {
    id,
    projectRevision,
    title: id === BOOK_A ? "回滚测试 A" : "回滚测试 B",
    navigation: { chapterCards: [] }
  } as unknown as LongBookSummary;
}

function fakeCommit(
  id = COMMIT_A,
  sequence = 1,
  reversible = true,
  bookId = BOOK_A
): LongWorkspaceIndexSnapshot["ledger"]["commits"][number] {
  return {
    id,
    sequence,
    reversible,
    bookId,
    chapterCardId: `chapter_${sequence}`
  } as unknown as LongWorkspaceIndexSnapshot["ledger"]["commits"][number];
}

function fakeIndex(
  commits: LongWorkspaceIndexSnapshot["ledger"]["commits"] = [
    fakeCommit()
  ],
  revision = 10
): LongWorkspaceIndexSnapshot {
  return {
    revision,
    ledger: { commits }
  } as unknown as LongWorkspaceIndexSnapshot;
}

function rollbackResult(
  bookId = BOOK_A,
  commitId = COMMIT_A,
  workspaceRevision = 11,
  projectRevision = 11
): LongRollbackLastCommitResult {
  return {
    bookId,
    rolledBackCommitId: commitId,
    committedThroughChapterId: null,
    workspaceRevision,
    projectRevision
  };
}

function createHarness(input: {
  readonly pending?: boolean;
  readonly api?: LongRollbackApi;
} = {}) {
  const activeBookId = ref<string | null>(BOOK_A);
  const activeBookSummary = ref<LongBookSummary | null>(fakeSummary());
  const workspaceIndex = ref<LongWorkspaceIndexSnapshot | null>(fakeIndex());
  const revisionRequirement = ref<LongWorkspaceRevisionSyncRequirement | null>(
    null
  );
  const rollbackDialogOpen = ref(false);
  const rollbackPending = ref(input.pending ?? false);
  const rollbackCommitId = ref<string | null>(null);
  const rollbackLastCommit = vi.fn(
    async () => rollbackResult()
  );
  const api = input.api ?? { rollbackLastCommit };
  const saveActiveEditorChanges = vi.fn(async () => true);
  const refreshActiveWorkspace = vi.fn(async () => true);
  const refreshAndSynchronizeRequiredRevision = vi.fn(async () => {
    revisionRequirement.value = null;
    return true;
  });
  const clearRolledBackCommitSelection = vi.fn();
  const loadBookList = vi.fn(async () => undefined);
  const settleUi = vi.fn(async () => undefined);
  const blockWritingPlan = vi.fn(() => false);
  const notifications = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  };
  const state = {
    activeBookId,
    activeBookSummary,
    workspaceIndex,
    revisionRequirement,
    rollbackDialogOpen,
    rollbackPending,
    rollbackCommitId
  };
  const coordinator = useLongRollbackCoordinator({
    api: () => api,
    state,
    session: {
      saveActiveEditorChanges,
      refreshActiveWorkspace,
      refreshAndSynchronizeRequiredRevision
    },
    navigation: { clearRolledBackCommitSelection },
    catalog: { loadBookList },
    scheduler: { settleUi },
    blockWritingPlan,
    notifications
  });
  return {
    api,
    blockWritingPlan,
    clearRolledBackCommitSelection,
    coordinator,
    loadBookList,
    notifications,
    refreshActiveWorkspace,
    refreshAndSynchronizeRequiredRevision,
    rollbackLastCommit,
    saveActiveEditorChanges,
    settleUi,
    state
  };
}

describe("useLongRollbackCoordinator", () => {
  it("captures the latest reversible commit as an immutable target", () => {
    const test = createHarness();
    test.state.workspaceIndex.value = fakeIndex(
      [fakeCommit("commit_old", 1), fakeCommit(COMMIT_A, 2)],
      20
    );
    test.state.activeBookSummary.value = fakeSummary(BOOK_A, 30);

    test.coordinator.openLongRollbackDialog();

    const target = test.coordinator.currentTarget();
    expect(target).toEqual({
      requestId: 1,
      bookId: BOOK_A,
      commitId: COMMIT_A,
      commitSequence: 2,
      capturedWorkspaceRevision: 20,
      capturedProjectRevision: 30
    });
    expect(Object.isFrozen(target)).toBe(true);
    expect(test.state.rollbackDialogOpen.value).toBe(true);
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_A);

    test.state.workspaceIndex.value = fakeIndex([fakeCommit(COMMIT_B, 3)], 40);
    test.state.activeBookSummary.value = fakeSummary(BOOK_A, 50);
    expect(test.coordinator.currentTarget()).toBe(target);
    expect(target?.capturedWorkspaceRevision).toBe(20);
    expect(target?.capturedProjectRevision).toBe(30);
  });

  it("uses one owned lease for duplicate confirms and CASes refreshed revisions", async () => {
    const events: string[] = [];
    const test = createHarness();
    test.settleUi.mockImplementation(async () => {
      events.push("next-tick");
    });
    test.saveActiveEditorChanges.mockImplementation(async () => {
      events.push("save");
      return true;
    });
    test.refreshActiveWorkspace.mockImplementation(async () => {
      events.push("refresh-authoritative");
      test.state.workspaceIndex.value = fakeIndex([fakeCommit()], 12);
      test.state.activeBookSummary.value = fakeSummary(BOOK_A, 13);
      return true;
    });
    test.rollbackLastCommit.mockImplementation(async () => {
      events.push("rollback-cas");
      return rollbackResult(BOOK_A, COMMIT_A, 13, 14);
    });
    test.refreshAndSynchronizeRequiredRevision.mockImplementation(async () => {
      events.push("sync-revision");
      test.state.revisionRequirement.value = null;
      return true;
    });
    test.loadBookList.mockImplementation(async () => {
      events.push("book-list");
    });
    test.coordinator.openLongRollbackDialog();

    const first = test.coordinator.confirmLongRollback();
    const duplicate = test.coordinator.confirmLongRollback();
    expect(test.state.rollbackPending.value).toBe(true);
    await Promise.all([first, duplicate]);

    expect(events).toEqual([
      "next-tick",
      "save",
      "refresh-authoritative",
      "rollback-cas",
      "sync-revision",
      "book-list"
    ]);
    expect(test.rollbackLastCommit).toHaveBeenCalledOnce();
    expect(test.rollbackLastCommit).toHaveBeenCalledWith({
      bookId: BOOK_A,
      expectedCommitId: COMMIT_A,
      baseWorkspaceRevision: 12,
      baseProjectRevision: 13
    });
    expect(test.state.rollbackPending.value).toBe(false);
    expect(test.notifications.success).toHaveBeenCalledWith(
      "已回滚提交 #1。"
    );
  });

  it("rejects the stale target when the latest commit changes after refresh", async () => {
    const test = createHarness();
    test.coordinator.openLongRollbackDialog();
    test.refreshActiveWorkspace.mockImplementation(async () => {
      test.state.workspaceIndex.value = fakeIndex(
        [fakeCommit(COMMIT_A, 1), fakeCommit(COMMIT_B, 2)],
        11
      );
      test.state.activeBookSummary.value = fakeSummary(BOOK_A, 11);
      return true;
    });

    await test.coordinator.confirmLongRollback();

    expect(test.rollbackLastCommit).not.toHaveBeenCalled();
    expect(test.state.rollbackDialogOpen.value).toBe(false);
    expect(test.state.rollbackCommitId.value).toBeNull();
    expect(test.notifications.warning).toHaveBeenCalledWith(
      "最后提交已经变化，请刷新后重新确认回滚。"
    );
  });

  it("does not save or rollback the wrong book when the target book changes", async () => {
    const test = createHarness();
    test.coordinator.openLongRollbackDialog();
    test.state.activeBookId.value = BOOK_B;
    test.state.activeBookSummary.value = fakeSummary(BOOK_B, 20);
    test.state.workspaceIndex.value = fakeIndex(
      [fakeCommit(COMMIT_B, 1, true, BOOK_B)],
      20
    );

    await test.coordinator.confirmLongRollback();

    expect(test.settleUi).toHaveBeenCalledOnce();
    expect(test.saveActiveEditorChanges).not.toHaveBeenCalled();
    expect(test.refreshActiveWorkspace).not.toHaveBeenCalled();
    expect(test.rollbackLastCommit).not.toHaveBeenCalled();
    expect(test.state.rollbackDialogOpen.value).toBe(false);
    expect(test.notifications.warning).toHaveBeenCalledWith(
      "最后提交已经变化，请刷新后重新确认回滚。"
    );
  });

  it("keeps the editor revision requirement when durable rollback refresh fails", async () => {
    const test = createHarness();
    test.coordinator.openLongRollbackDialog();
    test.rollbackLastCommit.mockResolvedValue(
      rollbackResult(BOOK_A, COMMIT_A, 21, 22)
    );
    test.refreshAndSynchronizeRequiredRevision.mockImplementation(async () => {
      test.state.revisionRequirement.value = null;
      return false;
    });

    await test.coordinator.confirmLongRollback();

    expect(test.state.revisionRequirement.value).toEqual({
      bookId: BOOK_A,
      workspaceRevision: 21,
      projectRevision: 22
    });
    expect(test.clearRolledBackCommitSelection).toHaveBeenCalledWith(
      BOOK_A,
      COMMIT_A
    );
    expect(test.state.rollbackDialogOpen.value).toBe(false);
    expect(test.state.rollbackCommitId.value).toBeNull();
    expect(test.loadBookList).not.toHaveBeenCalled();
    expect(test.notifications.success).not.toHaveBeenCalled();
    expect(test.notifications.warning).toHaveBeenCalledWith(
      "连续性账本已回滚，但最新版本尚未同步；正文编辑已锁定，请点击“重新同步”。"
    );
  });

  it("does not let an issued request close or navigate a newer dialog target", async () => {
    const pendingRollback = deferred<LongRollbackLastCommitResult>();
    const test = createHarness({
      api: { rollbackLastCommit: vi.fn(() => pendingRollback.promise) }
    });
    test.refreshAndSynchronizeRequiredRevision.mockResolvedValue(false);
    test.coordinator.openLongRollbackDialog();
    const rollback = test.coordinator.confirmLongRollback();
    await flushMicrotasks();
    expect(test.api.rollbackLastCommit).toHaveBeenCalledOnce();

    test.coordinator.closeLongRollbackDialog();
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_A);
    test.state.activeBookId.value = BOOK_B;
    test.state.activeBookSummary.value = fakeSummary(BOOK_B, 30);
    test.state.workspaceIndex.value = fakeIndex(
      [fakeCommit(COMMIT_B, 2, true, BOOK_B)],
      30
    );
    test.coordinator.openLongRollbackDialog();
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_B);

    pendingRollback.resolve(rollbackResult(BOOK_A, COMMIT_A, 31, 31));
    await rollback;

    expect(test.state.rollbackDialogOpen.value).toBe(true);
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_B);
    expect(test.coordinator.currentTarget()?.bookId).toBe(BOOK_B);
    expect(test.clearRolledBackCommitSelection).not.toHaveBeenCalled();
    expect(test.notifications.success).not.toHaveBeenCalled();
    expect(test.notifications.warning).not.toHaveBeenCalled();
  });

  it("waits for issued rollback I/O on dispose and suppresses late UI publication", async () => {
    const pendingRollback = deferred<LongRollbackLastCommitResult>();
    const test = createHarness({
      api: { rollbackLastCommit: vi.fn(() => pendingRollback.promise) }
    });
    test.refreshAndSynchronizeRequiredRevision.mockResolvedValue(false);
    test.coordinator.openLongRollbackDialog();
    const rollback = test.coordinator.confirmLongRollback();
    await flushMicrotasks();
    expect(test.api.rollbackLastCommit).toHaveBeenCalledOnce();

    let disposeSettled = false;
    const disposing = test.coordinator.dispose().then(() => {
      disposeSettled = true;
    });
    test.state.rollbackDialogOpen.value = true;
    test.state.rollbackCommitId.value = COMMIT_B;
    await flushMicrotasks();
    expect(disposeSettled).toBe(false);

    pendingRollback.resolve(rollbackResult(BOOK_A, COMMIT_A, 41, 42));
    await Promise.all([rollback, disposing]);

    expect(test.refreshAndSynchronizeRequiredRevision).toHaveBeenCalledWith(
      BOOK_A
    );
    expect(test.state.revisionRequirement.value).toEqual({
      bookId: BOOK_A,
      workspaceRevision: 41,
      projectRevision: 42
    });
    expect(test.state.rollbackDialogOpen.value).toBe(true);
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_B);
    expect(test.state.rollbackPending.value).toBe(false);
    expect(test.clearRolledBackCommitSelection).not.toHaveBeenCalled();
    expect(test.loadBookList).not.toHaveBeenCalled();
    expect(test.notifications.error).not.toHaveBeenCalled();
    expect(test.notifications.success).not.toHaveBeenCalled();
    expect(test.notifications.warning).not.toHaveBeenCalled();
    expect(test.coordinator.currentTarget()).toBeNull();
  });

  it("does not close or clear a foreign pending owner", async () => {
    const test = createHarness({ pending: true });
    test.state.rollbackDialogOpen.value = true;
    test.state.rollbackCommitId.value = COMMIT_A;

    test.coordinator.openLongRollbackDialog();
    test.coordinator.closeLongRollbackDialog();
    await test.coordinator.confirmLongRollback();
    await test.coordinator.dispose();

    expect(test.state.rollbackPending.value).toBe(true);
    expect(test.state.rollbackDialogOpen.value).toBe(true);
    expect(test.state.rollbackCommitId.value).toBe(COMMIT_A);
    expect(test.rollbackLastCommit).not.toHaveBeenCalled();
  });
});
