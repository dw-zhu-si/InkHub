import { describe, expect, it, vi } from "vitest";
import type {
  ProposalCoordinator,
  ProposalCoordinatorContext
} from "./useProposalCoordinator";

const coordinatorModule = vi.hoisted(() => ({
  create: vi.fn()
}));

vi.mock("./useProposalCoordinator", () => ({
  useProposalCoordinator: (...args: unknown[]) =>
    coordinatorModule.create(...args)
}));

import { useLazyProposalCoordinator } from "./useLazyProposalCoordinator";

function deferred<Value = void>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function fakeCoordinator(
  overrides: Partial<ProposalCoordinator> = {}
): ProposalCoordinator {
  return {
    resumeRecoveredAutomaticAgentEdits: vi.fn(),
    hasQueuedAgentEdits: vi.fn(() => false),
    reviewAgentEdit: vi.fn(async () => undefined),
    reviewLongAgentEdit: vi.fn(async () => undefined),
    scheduleQueuedAgentEdits: vi.fn(),
    stageAgentEditProposal: vi.fn(),
    stageLibraryEditProposal: vi.fn(),
    stageLongCharacterEditProposal: vi.fn(),
    stageLongDraftEditProposal: vi.fn(),
    stageLongPlotDesignEditProposal: vi.fn(),
    stageLongWorldbuildingEditProposal: vi.fn(),
    drain: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    ...overrides
  } as ProposalCoordinator;
}

function context(): ProposalCoordinatorContext {
  return {
    notifications: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn()
    }
  } as unknown as ProposalCoordinatorContext;
}

describe("useLazyProposalCoordinator lifecycle", () => {
  it("drains deferred invocations before waiting for coordinator commits", async () => {
    const proposal = deferred();
    const commit = deferred();
    const reviewAgentEdit = vi.fn(() => proposal.promise);
    const stageAgentEditProposal = vi.fn();
    const drain = vi.fn(() => commit.promise);
    coordinatorModule.create.mockReturnValue(
      fakeCoordinator({ reviewAgentEdit, stageAgentEditProposal, drain })
    );
    const coordinator = useLazyProposalCoordinator(context());

    const review = coordinator.reviewAgentEdit({
      runId: "run-test",
      proposalId: "proposal-test",
      decision: "accept"
    });
    coordinator.stageAgentEditProposal({} as never);
    const draining = coordinator.drain();

    await vi.waitFor(() => expect(reviewAgentEdit).toHaveBeenCalledTimes(1));
    expect(stageAgentEditProposal).not.toHaveBeenCalled();
    expect(drain).not.toHaveBeenCalled();

    proposal.resolve();
    await review;
    await vi.waitFor(() =>
      expect(stageAgentEditProposal).toHaveBeenCalledTimes(1)
    );
    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1));

    let drained = false;
    void draining.then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    commit.resolve();
    await draining;
    expect(drained).toBe(true);
  });

  it("makes disposal idempotent and ignores calls made after disposal starts", async () => {
    const disposal = deferred();
    const stageAgentEditProposal = vi.fn();
    const reviewAgentEdit = vi.fn(async () => undefined);
    const dispose = vi.fn(() => disposal.promise);
    coordinatorModule.create.mockReturnValue(
      fakeCoordinator({ dispose, reviewAgentEdit, stageAgentEditProposal })
    );
    const coordinator = useLazyProposalCoordinator(context());

    coordinator.stageAgentEditProposal({} as never);
    await coordinator.drain();
    expect(stageAgentEditProposal).toHaveBeenCalledTimes(1);

    const disposing = coordinator.dispose();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    coordinator.stageAgentEditProposal({} as never);
    await coordinator.reviewAgentEdit({
      runId: "run-after-dispose",
      proposalId: "proposal-after-dispose",
      decision: "accept"
    });

    expect(stageAgentEditProposal).toHaveBeenCalledTimes(1);
    expect(reviewAgentEdit).not.toHaveBeenCalled();
    expect(coordinator.dispose()).toBe(disposing);
    expect(coordinator.drain()).toBe(disposing);

    disposal.resolve();
    await disposing;
  });

  it("reports a factory failure, retries the next command, and disposes safely", async () => {
    const testContext = context();
    const stageAgentEditProposal = vi.fn();
    const loaded = fakeCoordinator({ stageAgentEditProposal });
    coordinatorModule.create
      .mockReset()
      .mockImplementationOnce(() => {
        throw new Error("example.test coordinator unavailable");
      })
      .mockReturnValue(loaded);
    const coordinator = useLazyProposalCoordinator(testContext);

    coordinator.stageAgentEditProposal({} as never);
    await expect(coordinator.drain()).resolves.toBeUndefined();
    expect(testContext.notifications.error).toHaveBeenCalledOnce();
    expect(stageAgentEditProposal).not.toHaveBeenCalled();

    coordinator.stageAgentEditProposal({} as never);
    await expect(coordinator.drain()).resolves.toBeUndefined();
    expect(stageAgentEditProposal).toHaveBeenCalledOnce();
    await expect(coordinator.dispose()).resolves.toBeUndefined();
    expect(loaded.dispose).toHaveBeenCalledOnce();
  });
});
