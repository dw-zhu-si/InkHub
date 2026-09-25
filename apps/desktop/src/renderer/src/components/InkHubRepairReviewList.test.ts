import { describe, expect, it } from "vitest";
import source from "./InkHubRepairReviewList.vue?raw";
import {
  createBoundedRepairReviewPage,
  repairReviewPageAfterKey
} from "../utils/inkhubDeepQualityReview";

const drafts = Array.from({ length: 500 }, (_, index) => ({
  proposal: {
    id: `proposal-${index + 1}`,
    chapterId: `chapter-${index + 1}`,
    chapterTitle: `第${index + 1}章`,
    volumeTitle: "第一卷",
    relativePath: `第一卷/第${index + 1}章.md`,
    expectedSourceRevision: "a".repeat(64),
    issueIds: [`issue-${index + 1}`],
    originalContent: "原稿",
    proposedContent: "修复稿",
    rationale: "修复连续性问题",
    agents: [{ id: "continuity", name: "连续性审校师" }],
    skills: [{ id: "timeline", name: "时间线审计" }]
  },
  content: "修复稿",
  decision: "pending" as const
}));

describe("InkHubRepairReviewList", () => {
  it("keeps the mounted editor set bounded for a 500-chapter repair plan", () => {
    const first = createBoundedRepairReviewPage(drafts, 1, 50);
    const last = createBoundedRepairReviewPage(drafts, 25, 50);

    expect(first.items).toHaveLength(20);
    expect(first.pageSize).toBe(20);
    expect(first.totalPages).toBe(25);
    expect(last.items).toHaveLength(20);
    expect(source).toContain('v-for="draft in page.items"');
    expect(source).not.toContain('v-for="draft in drafts"');
  });

  it("supports bounded keyboard paging without wrapping beyond the list", () => {
    expect(repairReviewPageAfterKey(1, 25, "ArrowLeft")).toBe(1);
    expect(repairReviewPageAfterKey(1, 25, "ArrowRight")).toBe(2);
    expect(repairReviewPageAfterKey(25, 25, "ArrowRight")).toBe(25);
    expect(repairReviewPageAfterKey(12, 25, "Home")).toBe(1);
    expect(repairReviewPageAfterKey(12, 25, "End")).toBe(25);
    expect(repairReviewPageAfterKey(12, 25, "Escape")).toBe(12);
  });

  it("exposes semantic batch, paging, decision and editor controls", () => {
    expect(source).toContain('aria-labelledby="repair-review-title"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-label="修复审阅分页"');
    expect(source).toContain(':aria-pressed="draft.decision === \'accepted\'"');
    expect(source).toContain("全部接受");
    expect(source).toContain("全部保留");
    expect(source).toContain("@keydown=\"handlePagerKeydown\"");
    expect(source).toContain("update: [proposalId: string, content: string]");
    expect(source).toContain('decision: [proposalId: string, decision: Exclude<InkHubRepairReviewDecision, "pending">]');
  });
});
