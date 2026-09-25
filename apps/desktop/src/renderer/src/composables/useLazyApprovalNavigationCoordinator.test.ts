import { describe, expect, it, vi } from "vitest";
import type { ApprovalNavigationCoordinatorContext } from "./useApprovalNavigationCoordinator";
import { useLazyApprovalNavigationCoordinator } from "./useLazyApprovalNavigationCoordinator";

const target = {
  kind: "document",
  documentId: "document-1",
  workspaceId: "workspace-1"
} as const;

function unusedContext(): ApprovalNavigationCoordinatorContext {
  return {} as ApprovalNavigationCoordinatorContext;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("useLazyApprovalNavigationCoordinator", () => {
  it("loads only on first navigation and retries after a rejected chunk", async () => {
    const navigateToTarget = vi.fn(async () => true);
    const dispose = vi.fn(async () => undefined);
    const createCoordinator = vi.fn(() => ({
      dispose,
      drain: vi.fn(),
      navigateToApprovalDocument: vi.fn(),
      navigateToCharacterItem: vi.fn(),
      navigateToDocument: vi.fn(),
      navigateToDraftSection: vi.fn(),
      navigateToLibrary: vi.fn(),
      navigateToLong: vi.fn(),
      navigateToTarget
    }));
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValue({
        useApprovalNavigationCoordinator: createCoordinator
      });
    const error = vi.fn();
    const lazy = useLazyApprovalNavigationCoordinator({
      context: unusedContext(),
      notifications: { error },
      load
    });

    expect(load).not.toHaveBeenCalled();
    await expect(lazy.navigateToTarget(target)).resolves.toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      "加载审批跳转能力失败：chunk unavailable"
    );

    await expect(lazy.navigateToTarget(target)).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(createCoordinator).toHaveBeenCalledTimes(1);
    expect(navigateToTarget).toHaveBeenCalledWith(target);
  });

  it("reports one error when concurrent callers share a failed attempt", async () => {
    const load = vi.fn(async () => {
      throw new Error("offline");
    });
    const error = vi.fn();
    const lazy = useLazyApprovalNavigationCoordinator({
      context: unusedContext(),
      notifications: { error },
      load
    });

    await expect(
      Promise.all([
        lazy.navigateToTarget(target),
        lazy.navigateToTarget(target)
      ])
    ).resolves.toEqual([false, false]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("does not let a rejected load escape disposal or trigger later loads", async () => {
    const load = vi.fn(async () => {
      throw new Error("chunk unavailable");
    });
    const lazy = useLazyApprovalNavigationCoordinator({
      context: unusedContext(),
      notifications: { error: vi.fn() },
      load
    });

    await lazy.navigateToTarget(target);
    await expect(lazy.dispose()).resolves.toBeUndefined();
    await expect(lazy.navigateToTarget(target)).resolves.toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("disposes a coordinator loaded during teardown exactly once", async () => {
    const pendingModule = deferred<
      Awaited<ReturnType<NonNullable<Parameters<
        typeof useLazyApprovalNavigationCoordinator
      >[0]["load"]>>>
    >();
    const dispose = vi.fn(async () => undefined);
    const load = vi.fn(() => pendingModule.promise);
    const lazy = useLazyApprovalNavigationCoordinator({
      context: unusedContext(),
      notifications: { error: vi.fn() },
      load
    });

    const navigation = lazy.navigateToTarget(target);
    const firstDispose = lazy.dispose();
    const secondDispose = lazy.dispose();
    pendingModule.resolve({
      useApprovalNavigationCoordinator: () => ({
        dispose,
        drain: vi.fn(),
        navigateToApprovalDocument: vi.fn(),
        navigateToCharacterItem: vi.fn(),
        navigateToDocument: vi.fn(),
        navigateToDraftSection: vi.fn(),
        navigateToLibrary: vi.fn(),
        navigateToLong: vi.fn(),
        navigateToTarget: vi.fn(async () => true)
      })
    });

    await expect(
      Promise.all([navigation, firstDispose, secondDispose])
    ).resolves.toEqual([false, undefined, undefined]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
