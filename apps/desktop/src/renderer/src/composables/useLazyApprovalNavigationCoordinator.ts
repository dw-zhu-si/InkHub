import type { ApprovalNavigationTarget } from "../utils/approvalNavigation";
import type { ApprovalNavigationCoordinatorContext } from "./useApprovalNavigationCoordinator";

type ApprovalNavigationCoordinatorModule = typeof import(
  "./useApprovalNavigationCoordinator"
);
type ApprovalNavigationCoordinator = ReturnType<
  ApprovalNavigationCoordinatorModule["useApprovalNavigationCoordinator"]
>;

export interface LazyApprovalNavigationNotifications {
  error(message: string): void;
}

export interface LazyApprovalNavigationCoordinatorOptions {
  context: ApprovalNavigationCoordinatorContext;
  notifications: LazyApprovalNavigationNotifications;
  load?: () => Promise<ApprovalNavigationCoordinatorModule>;
}

/**
 * Keeps the approval-navigation implementation out of the app-ready path.
 * Failed chunk loads are reported once per attempt and remain retryable.
 */
export function useLazyApprovalNavigationCoordinator(
  options: LazyApprovalNavigationCoordinatorOptions
) {
  const load =
    options.load ?? (() => import("./useApprovalNavigationCoordinator"));
  let coordinator: ApprovalNavigationCoordinator | null = null;
  let coordinatorPromise: Promise<ApprovalNavigationCoordinator> | null = null;
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  async function ensureCoordinator(): Promise<
    ApprovalNavigationCoordinator | null
  > {
    if (disposed) return null;
    if (!coordinatorPromise) {
      const attempt = load().then(({ useApprovalNavigationCoordinator }) => {
        coordinator = useApprovalNavigationCoordinator(options.context);
        return coordinator;
      });
      const guardedAttempt = attempt.catch((error: unknown) => {
        if (coordinatorPromise === guardedAttempt) {
          coordinatorPromise = null;
        }
        if (!disposed) {
          options.notifications.error(
            error instanceof Error
              ? `加载审批跳转能力失败：${error.message}`
              : "加载审批跳转能力失败，请重试。"
          );
        }
        throw error;
      });
      coordinatorPromise = guardedAttempt;
    }
    try {
      const loaded = await coordinatorPromise;
      return disposed ? null : loaded;
    } catch {
      return null;
    }
  }

  async function navigateToTarget(
    target: ApprovalNavigationTarget
  ): Promise<boolean> {
    const coordinator = await ensureCoordinator();
    return coordinator ? coordinator.navigateToTarget(target) : false;
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    disposed = true;
    const pending = coordinatorPromise;
    disposePromise = (async () => {
      if (coordinator) {
        await coordinator.dispose();
        return;
      }
      if (!pending) return;
      try {
        const loaded = await pending;
        await loaded.dispose();
      } catch {
        // A rejected lazy import was already reported by guardedAttempt. Cleanup
        // must continue through the remaining workspace lifecycle disposers.
      }
    })();
    return disposePromise;
  }

  return {
    dispose,
    navigateToTarget
  };
}
