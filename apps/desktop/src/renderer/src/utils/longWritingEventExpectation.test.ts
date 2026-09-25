import type { SystemEventEnvelope } from "@deepwrite/contracts";
import { describe, expect, it } from "vitest";
import { matchesLongWritingProposalExpectation } from "./longWritingEventExpectation";

type ProposalEvent = Extract<
  SystemEventEnvelope,
  {
    type: "long.chapter_write_proposal" | "long.ledger_commit_proposal";
  }
>;

function chapterWriteProposal(
  patch: Partial<{
    bookId: string;
    agentId: "draft";
    chapterCardId: string;
  }> = {}
) : ProposalEvent {
  return {
    type: "long.chapter_write_proposal",
    payload: {
      sessionId: "session-1",
      runId: "run-1",
      bookId: patch.bookId ?? "book-1",
      agentId: patch.agentId ?? "draft",
      file: {
        chapterCardId: patch.chapterCardId ?? "chapter-1"
      }
    }
  } as ProposalEvent;
}

function ledgerProposal(): ProposalEvent {
  return {
    type: "long.ledger_commit_proposal",
    payload: {
      sessionId: "session-1",
      runId: "run-1",
      bookId: "book-1",
      agentId: "continuity_ledger",
      input: {
        chapterCardId: "chapter-1"
      }
    }
  } as ProposalEvent;
}

describe("long-writing proposal expectation", () => {
  const writerExpectation = {
    bookId: "book-1",
    chapterCardId: "chapter-1",
    agentId: "draft"
  } as const;

  it("accepts only the exact book, agent, chapter, and proposal phase", () => {
    expect(
      matchesLongWritingProposalExpectation(
        writerExpectation,
        chapterWriteProposal()
      )
    ).toBe(true);
    expect(
      matchesLongWritingProposalExpectation(
        writerExpectation,
        chapterWriteProposal({ bookId: "book-2" })
      )
    ).toBe(false);
    expect(
      matchesLongWritingProposalExpectation(
        writerExpectation,
        chapterWriteProposal({ chapterCardId: "chapter-2" })
      )
    ).toBe(false);
    expect(
      matchesLongWritingProposalExpectation(writerExpectation, ledgerProposal())
    ).toBe(false);
  });
});
