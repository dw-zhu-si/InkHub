import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";
import type {
  LongRollbackCoordinator,
  LongRollbackCoordinatorOptions,
  LongRollbackTarget,
  LongRollbackTargetIdentityState
} from "./useLongRollbackCoordinator";

type LedgerCommit = LongWorkspaceIndexSnapshot["ledger"]["commits"][number];

export interface LongRollbackCoordinatorModule {
  useLongRollbackCoordinator(
    options: LongRollbackCoordinatorOptions
  ): LongRollbackCoordinator;
}

export type LongRollbackCoordinatorModuleLoader =
  () => Promise<LongRollbackCoordinatorModule>;

function loadLongRollbackCoordinatorModule(): Promise<LongRollbackCoordinatorModule> {
  return import("./useLongRollbackCoordinator");
}

/**
 * Keeps target capture and dialog intent synchronous while deferring the CAS,
 * compensation and teardown implementation to its own Vite chunk.
 */
export function useLazyLongRollbackCoordinator(
  context: LongRollbackCoordinatorOptions,
  loadModule: LongRollbackCoordinatorModuleLoader =
    loadLongRollbackCoordinatorModule
): LongRollbackCoordinator {
  const targetIdentity: LongRollbackTargetIdentityState =
    context.targetIdentity ?? {
      requestClock: 0,
      current: null
    };
  const coordinatorOptions: LongRollbackCoordinatorOptions = {
    ...context,
    targetIdentity
  };
  let coordinator: LongRollbackCoordinator | null = null;
  let coordinatorPromise: Promise<LongRollbackCoordinator | null> | null =
    null;
  let disposed = false;
  let disposePromise: Promise<void> | null = null;
  let loadFailureReported = false;

  function latestCommit(
    index: LongWorkspaceIndexSnapshot
  ): LedgerCommit | null {
    let latest: LedgerCommit | null = null;
    for (const commit of index.ledger.commits) {
      if (!latest || commit.sequence > latest.sequence) latest = commit;
    }
    return latest;
  }

  function loadCoordinator(): Promise<LongRollbackCoordinator | null> {
    if (disposed) return Promise.resolve(null);
    if (coordinator) return Promise.resolve(coordinator);
    if (coordinatorPromise) return coordinatorPromise;
    loadFailureReported = false;
    const loading = loadModule()
      .then(async ({ useLongRollbackCoordinator }) => {
        const loaded = useLongRollbackCoordinator(coordinatorOptions);
        coordinator = loaded;
        if (disposed) {
          await loaded.dispose();
          return null;
        }
        return loaded;
      })
      .catch((error: unknown) => {
        if (coordinatorPromise === loading) coordinatorPromise = null;
        throw error;
      });
    coordinatorPromise = loading;
    return loading;
  }

  function reportLoadFailure(error: unknown): void {
    if (disposed || loadFailureReported) return;
    loadFailureReported = true;
    context.notifications.error(
      error instanceof Error
        ? error.message
        : "加载长篇回滚协调器失败。"
    );
  }

  function ensureLoaded(): Promise<LongRollbackCoordinator | null> {
    return loadCoordinator().catch((error: unknown) => {
      reportLoadFailure(error);
      return null;
    });
  }

  function targetMatchesExternalState(candidate: LongRollbackTarget): boolean {
    return (
      targetIdentity.current === candidate &&
      context.state.rollbackDialogOpen.value &&
      context.state.rollbackCommitId.value === candidate.commitId
    );
  }

  function openLongRollbackDialog(): void {
    if (disposed) return;
    const pendingOwnedByCoordinator = coordinator?.ownsPending() ?? false;
    if (
      context.state.rollbackPending.value &&
      !pendingOwnedByCoordinator
    ) {
      return;
    }
    if (context.blockWritingPlan("回滚连续性提交")) return;
    const bookId = context.state.activeBookId.value;
    const summary = context.state.activeBookSummary.value;
    const index = context.state.workspaceIndex.value;
    const latest = index ? latestCommit(index) : null;
    if (!bookId || summary?.id !== bookId || !index || !latest?.reversible) {
      context.notifications.warning("当前没有可回滚的最后提交。");
      return;
    }
    const current = targetIdentity.current;
    if (
      current &&
      targetMatchesExternalState(current) &&
      current.bookId === bookId &&
      current.commitId === latest.id &&
      current.commitSequence === latest.sequence
    ) {
      void ensureLoaded();
      return;
    }
    const nextTarget = Object.freeze({
      requestId: ++targetIdentity.requestClock,
      bookId,
      commitId: latest.id,
      commitSequence: latest.sequence,
      capturedWorkspaceRevision: index.revision,
      capturedProjectRevision: summary.projectRevision
    });
    targetIdentity.current = nextTarget;
    context.state.rollbackCommitId.value = nextTarget.commitId;
    context.state.rollbackDialogOpen.value = true;
    void ensureLoaded();
  }

  function closeLongRollbackDialog(): void {
    if (disposed || context.state.rollbackPending.value) return;
    if (coordinator) {
      coordinator.closeLongRollbackDialog();
      return;
    }
    targetIdentity.requestClock += 1;
    targetIdentity.current = null;
    context.state.rollbackDialogOpen.value = false;
    context.state.rollbackCommitId.value = null;
  }

  function confirmLongRollback(): Promise<void> {
    if (disposed) return Promise.resolve();
    return ensureLoaded().then((loaded) => loaded?.confirmLongRollback());
  }

  function currentTarget(): LongRollbackTarget | null {
    return targetIdentity.current;
  }

  function ownsPending(): boolean {
    return coordinator?.ownsPending() ?? false;
  }

  function drain(): Promise<void> {
    if (disposePromise) return disposePromise;
    if (coordinator) return coordinator.drain();
    if (!coordinatorPromise) return Promise.resolve();
    return coordinatorPromise
      .then((loaded) => loaded?.drain())
      .then(() => undefined)
      .catch(reportLoadFailure);
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    disposed = true;
    targetIdentity.requestClock += 1;
    targetIdentity.current = null;
    const loading = coordinatorPromise;
    disposePromise = (async () => {
      if (coordinator) {
        await coordinator.dispose();
        return;
      }
      if (!loading) return;
      try {
        const loaded = await loading;
        await loaded?.dispose();
      } catch {
        // A rejected lazy import must never block the remaining cleanup stack.
      }
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
