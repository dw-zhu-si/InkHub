import { describe, expect, it } from "vitest";
import {
  InkHubStoryContinuationRequestSchema,
  InkHubStoryEvidenceSchema,
  InkHubStoryForecastResultSchema,
  InkHubStoryStateSummarySchema
} from "./inkhub-story-kernel";

describe("InkHub story-kernel contracts", () => {
  it("requires non-empty, revision-bound evidence", () => {
    expect(() => InkHubStoryEvidenceSchema.parse({
      chapterId: "c1", chapterTitle: "第一章", volumeTitle: "第一卷", relativePath: "第一卷/第一章.md",
      sourceRevision: "a".repeat(64), startOffset: 9, endOffset: 9, excerpt: "证据"
    })).toThrow(/range|Evidence/u);
  });

  it("keeps continuation billable and explicitly non-writeback", () => {
    expect(() => InkHubStoryContinuationRequestSchema.parse({ entryId: "novel", authorIntent: "继续", confirmBillable: false })).toThrow();
  });

  it("rejects impossible state counters and canonical forecasts", () => {
    expect(() => InkHubStoryStateSummarySchema.parse({
      entryId: "novel", status: "partial", stateVersion: null, sourceContentHash: null,
      totalChapters: 1, analyzedChapters: 1, reusedChapters: 0, pendingChapters: 1,
      failedChapters: 0, factCount: 0, updatedAt: null, message: "测试"
    })).toThrow(/counts/u);
    expect(() => InkHubStoryForecastResultSchema.parse({ canonical: true })).toThrow();
  });
});
