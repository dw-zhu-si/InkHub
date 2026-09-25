import type { AgentApprovalMode } from "../types/conversation";

type DeepReadonly<T> =
  T extends (...args: never[]) => unknown
    ? T
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : T extends object
        ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
        : T;

export interface AgentEditProposalRevisionCandidate<Proposal> {
  readonly generation: number;
  readonly approvalMode: AgentApprovalMode;
  /**
   * Revision of the agent's overlay immediately before this proposal.
   *
   * This is intentionally separate from the durable document revision: the
   * agent can keep producing V2/V3 while V1 is still being persisted.
   */
  readonly sourceBaseRevision: string;
  readonly proposedRevision: string;
  readonly proposal: DeepReadonly<Proposal>;
}

export interface AgentEditProposalCommitSnapshot<Proposal>
  extends AgentEditProposalRevisionCandidate<Proposal> {
  /**
   * Opaque, caller-created token for matching an async persistence response.
   */
  readonly token: string;
  /**
   * Durable document revision captured when this commit started.
   */
  readonly applyBaseRevision: string;
}

export interface AgentEditProposalRevisionLane<Proposal> {
  readonly targetKey: string;
  /** Latest revision visible to the running agent. */
  readonly overlayRevision: string;
  /** Last revision confirmed by the persistence layer. */
  readonly durableRevision: string;
  /** Monotonically increasing proposal generation for this target. */
  readonly generation: number;
  /**
   * Latest proposal not currently being persisted.
   *
   * Later proposals deliberately coalesce here because editor mutations carry
   * complete target text. They never replace `activeCommit`.
   */
  readonly pending?: AgentEditProposalRevisionCandidate<Proposal>;
  /** Immutable proposal currently owned by an async persistence request. */
  readonly activeCommit?: AgentEditProposalCommitSnapshot<Proposal>;
}

export interface CreateAgentEditProposalRevisionLaneInput {
  targetKey: string;
  durableRevision: string;
  overlayRevision?: string;
  generation?: number;
}

export interface StageAgentEditProposalRevisionInput<Proposal> {
  approvalMode: AgentApprovalMode;
  sourceBaseRevision: string;
  proposedRevision: string;
  proposal: Proposal;
}

export type StageAgentEditProposalRevisionResult<Proposal> =
  | {
      status: "staged";
      lane: AgentEditProposalRevisionLane<Proposal>;
      candidate: AgentEditProposalRevisionCandidate<Proposal>;
      replacedGeneration?: number;
    }
  | {
      status: "source-conflict";
      lane: AgentEditProposalRevisionLane<Proposal>;
      expectedSourceRevision: string;
      receivedSourceRevision: string;
    };

export interface BeginAgentEditProposalCommitInput {
  generation: number;
  token: string;
}

export type BeginAgentEditProposalCommitResult<Proposal> =
  | {
      status: "started";
      lane: AgentEditProposalRevisionLane<Proposal>;
      snapshot: AgentEditProposalCommitSnapshot<Proposal>;
    }
  | {
      status: "busy" | "empty" | "stale-generation" | "invalid-token";
      lane: AgentEditProposalRevisionLane<Proposal>;
    };

export interface CompleteAgentEditProposalCommitInput {
  generation: number;
  token: string;
  /**
   * Actual revision returned by persistence. Defaults to proposedRevision when
   * the storage layer did not normalize the text.
   */
  durableRevision?: string;
}

export type CompleteAgentEditProposalCommitResult<Proposal> =
  | {
      status: "completed";
      lane: AgentEditProposalRevisionLane<Proposal>;
      snapshot: AgentEditProposalCommitSnapshot<Proposal>;
    }
  | {
      status: "stale";
      lane: AgentEditProposalRevisionLane<Proposal>;
    };

export interface FailAgentEditProposalCommitInput {
  generation: number;
  token: string;
  /**
   * Requeue the failed snapshot only when no newer full-text proposal exists.
   * This is useful for retryable transport errors. Conflicts should set false.
   */
  requeue: boolean;
}

export type FailAgentEditProposalCommitResult<Proposal> =
  | {
      status: "failed";
      lane: AgentEditProposalRevisionLane<Proposal>;
      snapshot: AgentEditProposalCommitSnapshot<Proposal>;
      requeued: boolean;
    }
  | {
      status: "stale";
      lane: AgentEditProposalRevisionLane<Proposal>;
    };

function frozenClone<T>(value: T): DeepReadonly<T> {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (value === null || typeof value !== "object") {
    return value as DeepReadonly<T>;
  }
  if (seen.has(value)) {
    return value as DeepReadonly<T>;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

export function createAgentEditProposalRevisionLane<Proposal>(
  input: CreateAgentEditProposalRevisionLaneInput
): AgentEditProposalRevisionLane<Proposal> {
  return {
    targetKey: input.targetKey,
    durableRevision: input.durableRevision,
    overlayRevision: input.overlayRevision ?? input.durableRevision,
    generation: input.generation ?? 0
  };
}

/**
 * Stages one complete-text proposal on the agent overlay.
 *
 * A source revision mismatch is rejected without changing the lane. While an
 * async commit is active, later generations only replace `pending`; the frozen
 * active snapshot remains untouched.
 */
export function stageAgentEditProposalRevision<Proposal>(
  lane: AgentEditProposalRevisionLane<Proposal>,
  input: StageAgentEditProposalRevisionInput<Proposal>
): StageAgentEditProposalRevisionResult<Proposal> {
  if (input.sourceBaseRevision !== lane.overlayRevision) {
    return {
      status: "source-conflict",
      lane,
      expectedSourceRevision: lane.overlayRevision,
      receivedSourceRevision: input.sourceBaseRevision
    };
  }

  const candidate = deepFreeze({
    generation: lane.generation + 1,
    approvalMode: input.approvalMode,
    sourceBaseRevision: input.sourceBaseRevision,
    proposedRevision: input.proposedRevision,
    proposal: frozenClone(input.proposal)
  }) as AgentEditProposalRevisionCandidate<Proposal>;
  const replacedGeneration = lane.pending?.generation;
  const nextLane: AgentEditProposalRevisionLane<Proposal> = {
    ...lane,
    overlayRevision: input.proposedRevision,
    generation: candidate.generation,
    pending: candidate
  };

  return {
    status: "staged",
    lane: nextLane,
    candidate,
    ...(replacedGeneration === undefined ? {} : { replacedGeneration })
  };
}

/**
 * Freezes the selected pending generation for one persistence call.
 *
 * The generation argument is a UI/queue CAS: a click or queued job for V1
 * cannot accidentally approve V2 after V2 has replaced the pending proposal.
 */
export function beginAgentEditProposalCommit<Proposal>(
  lane: AgentEditProposalRevisionLane<Proposal>,
  input: BeginAgentEditProposalCommitInput
): BeginAgentEditProposalCommitResult<Proposal> {
  if (!input.token) {
    return { status: "invalid-token", lane };
  }
  if (lane.activeCommit) {
    return { status: "busy", lane };
  }
  if (!lane.pending) {
    return { status: "empty", lane };
  }
  if (lane.pending.generation !== input.generation) {
    return { status: "stale-generation", lane };
  }

  const snapshot = deepFreeze({
    ...lane.pending,
    token: input.token,
    applyBaseRevision: lane.durableRevision
  }) as AgentEditProposalCommitSnapshot<Proposal>;
  const { pending: _pending, ...laneWithoutPending } = lane;
  const nextLane: AgentEditProposalRevisionLane<Proposal> = {
    ...laneWithoutPending,
    activeCommit: snapshot
  };

  return { status: "started", lane: nextLane, snapshot };
}

/**
 * Completes a persistence request only when both generation and opaque token
 * still identify the active snapshot.
 */
export function completeAgentEditProposalCommit<Proposal>(
  lane: AgentEditProposalRevisionLane<Proposal>,
  input: CompleteAgentEditProposalCommitInput
): CompleteAgentEditProposalCommitResult<Proposal> {
  const snapshot = lane.activeCommit;
  if (
    !snapshot ||
    snapshot.generation !== input.generation ||
    snapshot.token !== input.token
  ) {
    return { status: "stale", lane };
  }

  const { activeCommit: _activeCommit, ...laneWithoutActiveCommit } = lane;
  const nextLane: AgentEditProposalRevisionLane<Proposal> = {
    ...laneWithoutActiveCommit,
    durableRevision: input.durableRevision ?? snapshot.proposedRevision
  };
  return { status: "completed", lane: nextLane, snapshot };
}

/**
 * Releases a failed commit with the same generation/token CAS as completion.
 *
 * A retryable failure may restore the failed generation only if no newer
 * complete-text proposal is already pending.
 */
export function failAgentEditProposalCommit<Proposal>(
  lane: AgentEditProposalRevisionLane<Proposal>,
  input: FailAgentEditProposalCommitInput
): FailAgentEditProposalCommitResult<Proposal> {
  const snapshot = lane.activeCommit;
  if (
    !snapshot ||
    snapshot.generation !== input.generation ||
    snapshot.token !== input.token
  ) {
    return { status: "stale", lane };
  }

  const { activeCommit: _activeCommit, ...laneWithoutActiveCommit } = lane;
  const shouldRequeue = input.requeue && lane.pending === undefined;
  const restoredCandidate = Object.freeze({
    generation: snapshot.generation,
    approvalMode: snapshot.approvalMode,
    sourceBaseRevision: snapshot.sourceBaseRevision,
    proposedRevision: snapshot.proposedRevision,
    proposal: snapshot.proposal
  }) as AgentEditProposalRevisionCandidate<Proposal>;
  const nextLane: AgentEditProposalRevisionLane<Proposal> = {
    ...laneWithoutActiveCommit,
    ...(shouldRequeue ? { pending: restoredCandidate } : {})
  };
  return {
    status: "failed",
    lane: nextLane,
    snapshot,
    requeued: shouldRequeue
  };
}

/**
 * Returns the generation that an automatic drain may start now.
 *
 * Manual proposals deliberately return undefined and remain pending through
 * the rest of the running agent turn.
 */
export function readyAutomaticAgentEditProposalGeneration<Proposal>(
  lane: AgentEditProposalRevisionLane<Proposal>
): number | undefined {
  if (lane.activeCommit || lane.pending?.approvalMode !== "auto-approve") {
    return undefined;
  }
  return lane.pending.generation;
}
