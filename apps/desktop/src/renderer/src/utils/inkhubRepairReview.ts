import type {
  InkHubNovelAiRepairPlan,
  InkHubNovelAiRepairTask
} from "@deepwrite/contracts";

export type InkHubRepairReviewDecision = "pending" | "accepted" | "kept";

export interface InkHubRepairReviewDraft {
  proposal: InkHubNovelAiRepairPlan["proposals"][number];
  content: string;
  decision: InkHubRepairReviewDecision;
}

export function isWritableNovelRepairPath(relativePath: string): boolean {
  return /\.(?:md|txt)$/iu.test(relativePath);
}

export function createInkHubRepairReviewDrafts(
  plan: InkHubNovelAiRepairPlan
): InkHubRepairReviewDraft[] {
  return plan.proposals.map((proposal) => ({
    proposal,
    content: proposal.proposedContent,
    // A generated draft is not user approval. Keeping the initial state
    // undecided makes the first click observable and prevents accidental
    // bulk writeback of chapters the author has not reviewed.
    decision: isWritableNovelRepairPath(proposal.relativePath) ? "pending" : "kept"
  }));
}

export function restorableInkHubRepairPlan(
  task: InkHubNovelAiRepairTask | null
): InkHubNovelAiRepairPlan | null {
  if (!task || task.status === "consumed" || task.plan.proposals.length === 0) {
    return null;
  }
  return task.plan;
}

export function acceptedInkHubRepairDrafts(
  drafts: readonly InkHubRepairReviewDraft[]
): InkHubRepairReviewDraft[] {
  return drafts.filter((draft) =>
    draft.decision === "accepted" &&
    draft.content !== draft.proposal.originalContent &&
    isWritableNovelRepairPath(draft.proposal.relativePath)
  );
}
