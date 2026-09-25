import { describe, expect, it } from "vitest";
import {
  beginAgentEditProposalCommit,
  completeAgentEditProposalCommit,
  createAgentEditProposalRevisionLane,
  failAgentEditProposalCommit,
  readyAutomaticAgentEditProposalGeneration,
  stageAgentEditProposalRevision,
  type AgentEditProposalRevisionLane
} from "./agentEditProposalRevisionLane";

interface TestProposal {
  id: string;
  text: string;
  toolCallIds: string[];
}

function createLane(): AgentEditProposalRevisionLane<TestProposal> {
  return createAgentEditProposalRevisionLane({
    targetKey: "book-1:draft:section-1-body",
    durableRevision: "R0"
  });
}

function stage(
  lane: AgentEditProposalRevisionLane<TestProposal>,
  version: number,
  approvalMode: "request-approval" | "auto-approve" = "auto-approve"
) {
  return stageAgentEditProposalRevision(lane, {
    approvalMode,
    sourceBaseRevision: `R${version - 1}`,
    proposedRevision: `R${version}`,
    proposal: {
      id: "stable-proposal-id",
      text: `正文 V${version}`,
      toolCallIds: [`tool-${version}`]
    }
  });
}

describe("agent edit proposal revision lane", () => {
  it("tracks independent overlay, durable, and generation revisions", () => {
    const first = stage(createLane(), 1);
    expect(first.status).toBe("staged");
    if (first.status !== "staged") return;

    expect(first.lane).toMatchObject({
      overlayRevision: "R1",
      durableRevision: "R0",
      generation: 1
    });
    expect(readyAutomaticAgentEditProposalGeneration(first.lane)).toBe(1);
  });

  it("rejects an out-of-order overlay mutation without changing the lane", () => {
    const lane = createLane();
    const result = stageAgentEditProposalRevision(lane, {
      approvalMode: "auto-approve",
      sourceBaseRevision: "stale",
      proposedRevision: "R1",
      proposal: { id: "p", text: "V1", toolCallIds: ["tool-1"] }
    });

    expect(result).toEqual({
      status: "source-conflict",
      lane,
      expectedSourceRevision: "R0",
      receivedSourceRevision: "stale"
    });
  });

  it("freezes an immutable V1 snapshot before an async commit starts", () => {
    const original: TestProposal = {
      id: "stable-proposal-id",
      text: "正文 V1",
      toolCallIds: ["tool-1"]
    };
    const staged = stageAgentEditProposalRevision(createLane(), {
      approvalMode: "auto-approve",
      sourceBaseRevision: "R0",
      proposedRevision: "R1",
      proposal: original
    });
    expect(staged.status).toBe("staged");
    if (staged.status !== "staged") return;
    original.text = "外部突变";
    original.toolCallIds.push("external");

    const started = beginAgentEditProposalCommit(staged.lane, {
      generation: 1,
      token: "commit-V1"
    });
    expect(started.status).toBe("started");
    if (started.status !== "started") return;

    expect(started.snapshot).toMatchObject({
      generation: 1,
      token: "commit-V1",
      applyBaseRevision: "R0",
      proposedRevision: "R1",
      proposal: {
        text: "正文 V1",
        toolCallIds: ["tool-1"]
      }
    });
    expect(Object.isFrozen(started.snapshot)).toBe(true);
    expect(Object.isFrozen(started.snapshot.proposal)).toBe(true);
    expect(Object.isFrozen(started.snapshot.proposal.toolCallIds)).toBe(true);
  });

  it("does not let V2 or V3 overwrite an applying V1 snapshot", () => {
    const stagedV1 = stage(createLane(), 1);
    expect(stagedV1.status).toBe("staged");
    if (stagedV1.status !== "staged") return;
    const startedV1 = beginAgentEditProposalCommit(stagedV1.lane, {
      generation: 1,
      token: "commit-V1"
    });
    expect(startedV1.status).toBe("started");
    if (startedV1.status !== "started") return;

    const stagedV2 = stage(startedV1.lane, 2);
    expect(stagedV2.status).toBe("staged");
    if (stagedV2.status !== "staged") return;
    const stagedV3 = stage(stagedV2.lane, 3);
    expect(stagedV3.status).toBe("staged");
    if (stagedV3.status !== "staged") return;

    expect(stagedV3.replacedGeneration).toBe(2);
    expect(stagedV3.lane.activeCommit).toMatchObject({
      generation: 1,
      token: "commit-V1",
      proposedRevision: "R1",
      proposal: { text: "正文 V1" }
    });
    expect(stagedV3.lane.pending).toMatchObject({
      generation: 3,
      proposedRevision: "R3",
      proposal: { text: "正文 V3" }
    });
    expect(stagedV3.lane).toMatchObject({
      overlayRevision: "R3",
      durableRevision: "R0",
      generation: 3
    });
    expect(readyAutomaticAgentEditProposalGeneration(stagedV3.lane)).toBeUndefined();
  });

  it("uses generation and token CAS and drains the latest auto proposal after V1", () => {
    const stagedV1 = stage(createLane(), 1);
    if (stagedV1.status !== "staged") throw new Error("V1 was not staged");
    const startedV1 = beginAgentEditProposalCommit(stagedV1.lane, {
      generation: 1,
      token: "commit-V1"
    });
    if (startedV1.status !== "started") throw new Error("V1 was not started");
    const stagedV2 = stage(startedV1.lane, 2);
    if (stagedV2.status !== "staged") throw new Error("V2 was not staged");

    const stale = completeAgentEditProposalCommit(stagedV2.lane, {
      generation: 1,
      token: "wrong-token"
    });
    expect(stale.status).toBe("stale");
    expect(stale.lane).toBe(stagedV2.lane);

    const completedV1 = completeAgentEditProposalCommit(stagedV2.lane, {
      generation: 1,
      token: "commit-V1"
    });
    expect(completedV1.status).toBe("completed");
    if (completedV1.status !== "completed") return;
    expect(completedV1.lane).toMatchObject({
      overlayRevision: "R2",
      durableRevision: "R1",
      generation: 2
    });
    expect(readyAutomaticAgentEditProposalGeneration(completedV1.lane)).toBe(2);

    const startedV2 = beginAgentEditProposalCommit(completedV1.lane, {
      generation: 2,
      token: "commit-V2"
    });
    expect(startedV2.status).toBe("started");
    if (startedV2.status !== "started") return;
    expect(startedV2.snapshot.applyBaseRevision).toBe("R1");
    expect(startedV2.snapshot.proposedRevision).toBe("R2");
  });

  it("keeps a newer manual generation pending after V1 completes", () => {
    const stagedV1 = stage(createLane(), 1, "request-approval");
    if (stagedV1.status !== "staged") throw new Error("V1 was not staged");
    const startedV1 = beginAgentEditProposalCommit(stagedV1.lane, {
      generation: 1,
      token: "manual-V1"
    });
    if (startedV1.status !== "started") throw new Error("V1 was not started");
    const stagedV2 = stage(startedV1.lane, 2, "request-approval");
    if (stagedV2.status !== "staged") throw new Error("V2 was not staged");

    const completed = completeAgentEditProposalCommit(stagedV2.lane, {
      generation: 1,
      token: "manual-V1"
    });
    expect(completed.status).toBe("completed");
    if (completed.status !== "completed") return;

    expect(completed.lane.pending).toMatchObject({
      generation: 2,
      approvalMode: "request-approval",
      proposedRevision: "R2"
    });
    expect(readyAutomaticAgentEditProposalGeneration(completed.lane)).toBeUndefined();
  });

  it("prevents a stale UI action from approving a coalesced newer generation", () => {
    const stagedV1 = stage(createLane(), 1, "request-approval");
    if (stagedV1.status !== "staged") throw new Error("V1 was not staged");
    const stagedV2 = stage(stagedV1.lane, 2, "request-approval");
    if (stagedV2.status !== "staged") throw new Error("V2 was not staged");

    const staleClick = beginAgentEditProposalCommit(stagedV2.lane, {
      generation: 1,
      token: "stale-click"
    });
    expect(staleClick.status).toBe("stale-generation");
    expect(staleClick.lane.pending?.generation).toBe(2);
  });

  it("requeues a retryable failed snapshot only when no newer proposal exists", () => {
    const stagedV1 = stage(createLane(), 1);
    if (stagedV1.status !== "staged") throw new Error("V1 was not staged");
    const startedV1 = beginAgentEditProposalCommit(stagedV1.lane, {
      generation: 1,
      token: "commit-V1"
    });
    if (startedV1.status !== "started") throw new Error("V1 was not started");

    const retryable = failAgentEditProposalCommit(startedV1.lane, {
      generation: 1,
      token: "commit-V1",
      requeue: true
    });
    expect(retryable.status).toBe("failed");
    if (retryable.status !== "failed") return;
    expect(retryable.requeued).toBe(true);
    expect(retryable.lane.pending?.generation).toBe(1);

    const restartedV1 = beginAgentEditProposalCommit(retryable.lane, {
      generation: 1,
      token: "commit-V1-retry"
    });
    if (restartedV1.status !== "started") throw new Error("V1 was not retried");
    const stagedV2 = stage(restartedV1.lane, 2);
    if (stagedV2.status !== "staged") throw new Error("V2 was not staged");
    const failedOldV1 = failAgentEditProposalCommit(stagedV2.lane, {
      generation: 1,
      token: "commit-V1-retry",
      requeue: true
    });
    expect(failedOldV1.status).toBe("failed");
    if (failedOldV1.status !== "failed") return;
    expect(failedOldV1.requeued).toBe(false);
    expect(failedOldV1.lane.pending?.generation).toBe(2);
  });
});
