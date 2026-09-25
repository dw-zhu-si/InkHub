import type { SystemEventEnvelope } from "@deepwrite/contracts";

type LongWritingProposalEvent = Extract<
  SystemEventEnvelope,
  {
    type: "long.chapter_write_proposal" | "long.ledger_commit_proposal";
  }
>;

export interface LongWritingProposalExpectation {
  bookId: string;
  chapterCardId: string;
  agentId: "draft" | "continuity_ledger";
}

/**
 * A proposal may mark a serial-writing run as waiting for approval only when
 * every persisted target dimension still belongs to that run.
 */
export function matchesLongWritingProposalExpectation(
  expectation: LongWritingProposalExpectation,
  event: LongWritingProposalEvent
): boolean {
  if (
    event.payload.bookId !== expectation.bookId ||
    event.payload.agentId !== expectation.agentId
  ) {
    return false;
  }
  return (
    (event.type === "long.chapter_write_proposal" &&
      expectation.agentId === "draft" &&
      event.payload.file.chapterCardId === expectation.chapterCardId) ||
    (event.type === "long.ledger_commit_proposal" &&
      expectation.agentId === "continuity_ledger" &&
      event.payload.input.chapterCardId === expectation.chapterCardId)
  );
}
