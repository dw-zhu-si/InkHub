import type {
  LongBookSummary,
  LongRollbackLastCommitInput,
  LongRollbackLastCommitResult,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import type { Ref } from "vue";
import type { LongWorkspaceRevisionSyncRequirement } from "../stores/longWorkspaceStore";

type LedgerCommit = LongWorkspaceIndexSnapshot["ledger"]["commits"][number];

export interface LongRollbackTarget {
  readonly requestId: number;
  readonly bookId: string;
  readonly commitId: string;
  readonly commitSequence: number;
  readonly capturedWorkspaceRevision: number;
  readonly capturedProjectRevision: number;
}

export interface LongRollbackTargetIdentityState {
  requestClock: number;
  current: LongRollbackTarget | null;
}

export interface LongRollbackApi {
  rollbackLastCommit(
    input: LongRollbackLastCommitInput
  ): Promise<LongRollbackLastCommitResult>;
}

export interface LongRollbackState {
  activeBookId: Readonly<Ref<string | null>>;
  activeBookSummary: Readonly<Ref<LongBookSummary | null>>;
  workspaceIndex: Readonly<Ref<LongWorkspaceIndexSnapshot | null>>;
  revisionRequirement: Ref<LongWorkspaceRevisionSyncRequirement | null>;
  rollbackDialogOpen: Ref<boolean>;
  rollbackPending: Ref<boolean>;
  rollbackCommitId: Ref<string | null>;
}

export interface LongRollbackSessionPort {
  saveActiveEditorChanges(): Promise<boolean>;
  refreshActiveWorkspace(bookId: string): Promise<boolean>;
  refreshAndSynchronizeRequiredRevision(bookId: string): Promise<boolean>;
}

export interface LongRollbackNavigationPort {
  clearRolledBackCommitSelection(bookId: string, commitId: string): void;
}

export interface LongRollbackCatalogPort {
  loadBookList(options: { readonly force: true }): Promise<void>;
}

export interface LongRollbackSchedulerPort {
  settleUi(): Promise<void>;
}

export interface LongRollbackNotifications {
  error(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface LongRollbackCoordinatorOptions {
  api(): LongRollbackApi | undefined;
  state: LongRollbackState;
  session: LongRollbackSessionPort;
  navigation: LongRollbackNavigationPort;
  catalog: LongRollbackCatalogPort;
  scheduler: LongRollbackSchedulerPort;
  blockWritingPlan(action: string): boolean;
  notifications: LongRollbackNotifications;
  /** Shared with the lazy facade so opening remains synchronous before load. */
  targetIdentity?: LongRollbackTargetIdentityState;
}

export interface LongRollbackCoordinator {
  openLongRollbackDialog(): void;
  closeLongRollbackDialog(): void;
  confirmLongRollback(): Promise<void>;
  currentTarget(): LongRollbackTarget | null;
  ownsPending(): boolean;
  drain(): Promise<void>;
  dispose(): Promise<void>;
}

interface PendingLease {
  readonly requestId: number;
  readonly pending: Ref<boolean>;
}

interface AuthoritativeRollbackState {
  readonly summary: LongBookSummary;
  readonly index: LongWorkspaceIndexSnapshot;
  readonly commit: LedgerCommit;
}

/**
 * Owns the rollback confirmation and its CAS boundary. The coordinator has no
 * runtime dependency on ledger projection or manuscript utilities, so moving it
 * behind a lazy facade does not pull those utilities into the app-ready chunk.
 */
export function useLongRollbackCoordinator(
  options: LongRollbackCoordinatorOptions
): LongRollbackCoordinator {
  const {
    catalog,
    navigation,
    notifications,
    scheduler,
    session,
    state
  } = options;

  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  let pendingRequestClock = 0;
  const targetIdentity = options.targetIdentity ?? {
    requestClock: 0,
    current: null
  };
  let ownedPendingLease: PendingLease | null = null;
  const inFlightOperations = new Set<Promise<unknown>>();

  function latestCommit(
    index: LongWorkspaceIndexSnapshot
  ): LedgerCommit | null {
    let latest: LedgerCommit | null = null;
    for (const commit of index.ledger.commits) {
      if (!latest || commit.sequence > latest.sequence) latest = commit;
    }
    return latest;
  }

  function latestReversibleCommit(
    index: LongWorkspaceIndexSnapshot
  ): LedgerCommit | null {
    const latest = latestCommit(index);
    return latest?.reversible ? latest : null;
  }

  function targetMatchesExternalState(candidate: LongRollbackTarget): boolean {
    return (
      targetIdentity.current === candidate &&
      state.rollbackDialogOpen.value &&
      state.rollbackCommitId.value === candidate.commitId
    );
  }

  function requestCanPublish(candidate: LongRollbackTarget): boolean {
    return !disposed && targetIdentity.requestClock === candidate.requestId;
  }

  function cancelCurrentTarget(candidate?: LongRollbackTarget): void {
    if (candidate && !targetMatchesExternalState(candidate)) return;
    targetIdentity.requestClock += 1;
    targetIdentity.current = null;
    state.rollbackDialogOpen.value = false;
    state.rollbackCommitId.value = null;
  }

  function completeCurrentTarget(candidate: LongRollbackTarget): boolean {
    if (!targetMatchesExternalState(candidate)) return false;
    targetIdentity.current = null;
    state.rollbackDialogOpen.value = false;
    state.rollbackCommitId.value = null;
    return true;
  }

  function rejectChangedTarget(candidate: LongRollbackTarget): void {
    if (!requestCanPublish(candidate) || !targetMatchesExternalState(candidate)) {
      return;
    }
    cancelCurrentTarget(candidate);
    notifications.warning("最后提交已经变化，请刷新后重新确认回滚。");
  }

  function activeBookMatches(candidate: LongRollbackTarget): boolean {
    return (
      state.activeBookId.value === candidate.bookId &&
      state.activeBookSummary.value?.id === candidate.bookId
    );
  }

  function authoritativeRollbackState(
    candidate: LongRollbackTarget
  ): AuthoritativeRollbackState | null {
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    const commit = index ? latestReversibleCommit(index) : null;
    if (
      !summary ||
      summary.id !== candidate.bookId ||
      state.activeBookId.value !== candidate.bookId ||
      !index ||
      !commit ||
      commit.id !== candidate.commitId ||
      commit.sequence !== candidate.commitSequence
    ) {
      return null;
    }
    return { summary, index, commit };
  }

  function acquirePendingLease(): PendingLease | null {
    if (disposed || ownedPendingLease || state.rollbackPending.value) return null;
    const lease: PendingLease = {
      requestId: ++pendingRequestClock,
      pending: state.rollbackPending
    };
    ownedPendingLease = lease;
    lease.pending.value = true;
    return lease;
  }

  function leaseCanIssueIo(lease: PendingLease): boolean {
    return !disposed && ownedPendingLease === lease;
  }

  function releasePendingLease(lease: PendingLease): void {
    // A true pending ref without this exact lease belongs to another boundary.
    if (ownedPendingLease !== lease) return;
    ownedPendingLease = null;
    lease.pending.value = false;
  }

  async function runTracked<Value>(task: () => Promise<Value>): Promise<Value> {
    const operation = task();
    inFlightOperations.add(operation);
    try {
      return await operation;
    } finally {
      inFlightOperations.delete(operation);
    }
  }

  async function runWithLease(
    lease: PendingLease,
    task: () => Promise<void>
  ): Promise<void> {
    await runTracked(async () => {
      try {
        await task();
      } finally {
        releasePendingLease(lease);
      }
    });
  }

  function openLongRollbackDialog(): void {
    if (disposed) return;
    // Foreign pending work owns the shared flag. An operation owned by this
    // coordinator may be superseded by a newer immutable dialog target.
    if (state.rollbackPending.value && !ownedPendingLease) return;
    if (options.blockWritingPlan("回滚连续性提交")) return;
    const bookId = state.activeBookId.value;
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    const commit = index ? latestReversibleCommit(index) : null;
    if (!bookId || summary?.id !== bookId || !index || !commit) {
      notifications.warning("当前没有可回滚的最后提交。");
      return;
    }
    const nextTarget = Object.freeze({
      requestId: ++targetIdentity.requestClock,
      bookId,
      commitId: commit.id,
      commitSequence: commit.sequence,
      capturedWorkspaceRevision: index.revision,
      capturedProjectRevision: summary.projectRevision
    });
    targetIdentity.current = nextTarget;
    state.rollbackCommitId.value = nextTarget.commitId;
    state.rollbackDialogOpen.value = true;
  }

  function closeLongRollbackDialog(): void {
    if (disposed || state.rollbackPending.value) return;
    cancelCurrentTarget();
  }

  function publishRevisionRequirement(
    result: LongRollbackLastCommitResult
  ): LongWorkspaceRevisionSyncRequirement {
    const requirement: LongWorkspaceRevisionSyncRequirement = {
      bookId: result.bookId,
      workspaceRevision: result.workspaceRevision,
      projectRevision: result.projectRevision
    };
    state.revisionRequirement.value = requirement;
    return requirement;
  }

  function preserveRevisionRequirement(
    requirement: LongWorkspaceRevisionSyncRequirement
  ): void {
    const current = state.revisionRequirement.value;
    if (!current) {
      state.revisionRequirement.value = requirement;
      return;
    }
    if (
      current.bookId === requirement.bookId &&
      (current.workspaceRevision < requirement.workspaceRevision ||
        current.projectRevision < requirement.projectRevision)
    ) {
      state.revisionRequirement.value = requirement;
    }
  }

  function confirmLongRollback(): Promise<void> {
    const api = options.api();
    const operationTarget = targetIdentity.current;
    if (!api) {
      if (!disposed) notifications.warning("当前环境未连接长篇工作区。");
      return Promise.resolve();
    }
    if (
      disposed ||
      !operationTarget ||
      !targetMatchesExternalState(operationTarget)
    ) {
      return Promise.resolve();
    }
    if (options.blockWritingPlan("回滚连续性提交")) {
      cancelCurrentTarget(operationTarget);
      return Promise.resolve();
    }
    const lease = acquirePendingLease();
    if (!lease) return Promise.resolve();

    return runWithLease(lease, async () => {
      try {
        await scheduler.settleUi();
        if (!leaseCanIssueIo(lease)) return;
        if (!targetMatchesExternalState(operationTarget)) return;
        if (!activeBookMatches(operationTarget)) {
          rejectChangedTarget(operationTarget);
          return;
        }
        if (!(await session.saveActiveEditorChanges())) return;
        if (!leaseCanIssueIo(lease)) return;
        if (!targetMatchesExternalState(operationTarget)) return;
        if (!activeBookMatches(operationTarget)) {
          rejectChangedTarget(operationTarget);
          return;
        }
        if (!(await session.refreshActiveWorkspace(operationTarget.bookId))) {
          return;
        }
        if (!leaseCanIssueIo(lease)) return;
        if (!targetMatchesExternalState(operationTarget)) return;
        const authoritative = authoritativeRollbackState(operationTarget);
        if (!authoritative) {
          rejectChangedTarget(operationTarget);
          return;
        }

        const rollback = await api.rollbackLastCommit({
          bookId: operationTarget.bookId,
          expectedCommitId: operationTarget.commitId,
          baseWorkspaceRevision: authoritative.index.revision,
          baseProjectRevision: authoritative.summary.projectRevision
        });

        // From here on the disk mutation is durable. Teardown may suppress UI
        // publication, but must wait for and preserve revision reconciliation.
        const requirement = publishRevisionRequirement(rollback);
        if (
          requestCanPublish(operationTarget) &&
          targetMatchesExternalState(operationTarget) &&
          activeBookMatches(operationTarget)
        ) {
          navigation.clearRolledBackCommitSelection(
            operationTarget.bookId,
            operationTarget.commitId
          );
        }

        let synchronized = false;
        try {
          synchronized = await session.refreshAndSynchronizeRequiredRevision(
            operationTarget.bookId
          );
        } catch {
          synchronized = false;
        }
        if (!synchronized) {
          preserveRevisionRequirement(requirement);
          if (
            requestCanPublish(operationTarget) &&
            targetMatchesExternalState(operationTarget)
          ) {
            completeCurrentTarget(operationTarget);
            notifications.warning(
              "连续性账本已回滚，但最新版本尚未同步；正文编辑已锁定，请点击“重新同步”。"
            );
          }
          return;
        }

        const mayPublish =
          requestCanPublish(operationTarget) &&
          targetMatchesExternalState(operationTarget);
        if (mayPublish) completeCurrentTarget(operationTarget);
        if (!disposed) {
          try {
            await catalog.loadBookList({ force: true });
          } catch (error: unknown) {
            if (requestCanPublish(operationTarget)) {
              notifications.warning(
                error instanceof Error
                  ? `连续性账本已回滚，但长篇列表刷新失败：${error.message}`
                  : "连续性账本已回滚，但长篇列表刷新失败。"
              );
            }
            return;
          }
        }
        if (mayPublish && requestCanPublish(operationTarget)) {
          notifications.success(
            `已回滚提交 #${operationTarget.commitSequence}。`
          );
        }
      } catch (error: unknown) {
        if (
          requestCanPublish(operationTarget) &&
          targetMatchesExternalState(operationTarget)
        ) {
          notifications.error(
            error instanceof Error ? error.message : "回滚最后提交失败。"
          );
        }
      }
    });
  }

  function currentTarget(): LongRollbackTarget | null {
    return targetIdentity.current;
  }

  function ownsPending(): boolean {
    return ownedPendingLease !== null;
  }

  async function drain(): Promise<void> {
    while (inFlightOperations.size > 0) {
      await Promise.allSettled([...inFlightOperations]);
    }
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    disposed = true;
    targetIdentity.requestClock += 1;
    targetIdentity.current = null;
    disposePromise = (async () => {
      await drain();
      if (ownedPendingLease) releasePendingLease(ownedPendingLease);
    })();
    return disposePromise;
  }

  return {
    openLongRollbackDialog,
    closeLongRollbackDialog,
    confirmLongRollback,
    currentTarget,
    ownsPending,
    drain,
    dispose
  };
}
