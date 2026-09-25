import { describe, expect, it, vi } from "vitest";
import type {
  LongChapterReadiness,
  SystemEventEnvelope
} from "@deepwrite/contracts";
import {
  canApproveLongWritingProposal,
  useLongWritingOrchestrator
} from "./useLongWritingOrchestrator";

function readiness(
  chapterCardId: string,
  status: LongChapterReadiness["status"]
): LongChapterReadiness {
  return {
    chapterCardId,
    title: chapterCardId === "chapter_one" ? "第一章" : "第二章",
    status,
    missingFiles:
      status === "empty" ? ["body"] : status === "partial" ? ["handoff"] : []
  };
}

function dispatchEvent() {
  return {
    type: "long.chapter_dispatch_proposal",
    payload: {
      bookId: "longbook_test",
      scope: "arc",
      chapters: [
        readiness("chapter_one", "empty"),
        readiness("chapter_two", "empty")
      ]
    }
  } as Extract<
    SystemEventEnvelope,
    { type: "long.chapter_dispatch_proposal" }
  >;
}

function writerProposal(chapterCardId = "chapter_one") {
  return {
    type: "long.chapter_write_proposal",
    payload: {
      bookId: "longbook_test",
      agentId: "draft",
      sessionId: "session-current",
      runId: "run-current",
      file: { chapterCardId }
    }
  } as SystemEventEnvelope;
}

function ledgerProposal() {
  return {
    type: "long.ledger_commit_proposal",
    payload: {
      bookId: "longbook_test",
      agentId: "continuity_ledger",
      sessionId: "session-current",
      runId: "run-current",
      input: { chapterCardId: "chapter_one" }
    }
  } as SystemEventEnvelope;
}

function harness() {
  const live = new Map<string, LongChapterReadiness>([
    ["chapter_one", readiness("chapter_one", "empty")],
    ["chapter_two", readiness("chapter_two", "empty")]
  ]);
  const startWriter = vi.fn();
  const startLedger = vi.fn();
  const saveBarrier = vi.fn(async () => true);
  const notifications = {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  };
  const controller = useLongWritingOrchestrator({
    resolveReadiness: vi.fn(async (_bookId, chapterCardId) => {
      const result = live.get(chapterCardId);
      if (!result) throw new Error("missing fixture");
      return result;
    }),
    startWriter,
    startLedger,
    saveBarrier,
    notifications
  });
  return {
    controller,
    live,
    startWriter,
    startLedger,
    saveBarrier,
    notifications
  };
}

describe("useLongWritingOrchestrator", () => {
  it("advances immediately after saved body text without starting continuity", async () => {
    const test = harness();
    await test.controller.startDispatch(dispatchEvent());
    expect(test.startWriter).toHaveBeenCalledWith(
      "longbook_test",
      expect.objectContaining({ chapterCardId: "chapter_one" }),
      expect.objectContaining({ isCurrent: expect.any(Function) })
    );

    test.live.set("chapter_one", readiness("chapter_one", "ready_to_commit"));
    await test.controller.handleChapterSaved("longbook_test", "chapter_one");
    expect(test.controller.state.value.currentIndex).toBe(1);
    expect(test.startWriter).toHaveBeenLastCalledWith(
      "longbook_test",
      expect.objectContaining({ chapterCardId: "chapter_two" }),
      expect.anything()
    );
    expect(test.startLedger).not.toHaveBeenCalled();

    test.live.set("chapter_two", readiness("chapter_two", "ready_to_commit"));
    await test.controller.handleChapterSaved("longbook_test", "chapter_two");
    expect(test.controller.state.value.phase).toBe("complete");
    expect(test.notifications.success).toHaveBeenCalledOnce();
    expect(test.startLedger).not.toHaveBeenCalled();
  });

  it("skips a chapter whose body is already complete and never opens ledger approval", async () => {
    const test = harness();
    test.live.set("chapter_one", readiness("chapter_one", "ready_to_commit"));
    await test.controller.startDispatch(dispatchEvent());
    expect(test.controller.state.value.currentIndex).toBe(1);
    expect(test.startWriter).toHaveBeenCalledOnce();
    expect(test.startWriter).toHaveBeenCalledWith(
      "longbook_test",
      expect.objectContaining({ chapterCardId: "chapter_two" }),
      expect.anything()
    );
    expect(test.startLedger).not.toHaveBeenCalled();
  });

  it("retries the body save barrier without advancing early", async () => {
    const test = harness();
    await test.controller.startDispatch(dispatchEvent());
    test.live.set("chapter_one", readiness("chapter_one", "ready_to_commit"));
    test.saveBarrier.mockResolvedValueOnce(false);
    await test.controller.handleChapterSaved("longbook_test", "chapter_one");
    expect(test.controller.state.value).toMatchObject({
      currentIndex: 0,
      phase: "error",
      retryPoint: "after_write"
    });

    test.saveBarrier.mockResolvedValueOnce(true);
    await test.controller.retry();
    expect(test.controller.state.value.currentIndex).toBe(1);
    expect(test.startLedger).not.toHaveBeenCalled();
  });

  it("ignores continuity events because records are outside writing plans", async () => {
    const test = harness();
    await test.controller.startDispatch(dispatchEvent());
    expect(await test.controller.handleApplied(ledgerProposal() as never)).toBe(
      false
    );
    expect(test.controller.handleRejected(ledgerProposal())).toBe(false);
    expect(
      test.controller.handleRunFailure("continuity_ledger", "记录失败")
    ).toBe(false);
  });

  it("permits only the current writer proposal while a plan is active", () => {
    const state = {
      bookId: "longbook_test",
      scope: "chapter" as const,
      chapters: [readiness("chapter_one", "empty")],
      currentIndex: 0,
      phase: "awaiting_writer_approval" as const,
      error: null,
      retryPoint: null
    };
    const expectation = {
      bookId: "longbook_test",
      chapterCardId: "chapter_one",
      agentId: "draft" as const,
      sessionId: "session-current",
      runId: "run-current"
    };
    expect(
      canApproveLongWritingProposal({
        active: true,
        state,
        currentChapter: state.chapters[0]!,
        expectation,
        event: writerProposal()
      })
    ).toBe(true);
    expect(
      canApproveLongWritingProposal({
        active: true,
        state,
        currentChapter: state.chapters[0]!,
        expectation,
        event: ledgerProposal()
      })
    ).toBe(false);
  });
});
