import { describe, expect, it } from "vitest";
import type { InkHubNovelAiRepairPlan } from "@deepwrite/contracts";
import {
  acceptedInkHubRepairDrafts,
  createInkHubRepairReviewDrafts
} from "./inkhubRepairReview";

function repairPlan(relativePath = "第一卷/第1章.md"): InkHubNovelAiRepairPlan {
  return {
    id: "repair-plan-one",
    entryId: "novel-one",
    generatedAt: "2026-08-22T08:00:00.000Z",
    modelId: "model-one",
    modelLabel: "Model One",
    issueCount: 1,
    warnings: [],
    proposals: [{
      id: "proposal-one",
      chapterId: "chapter-one",
      chapterTitle: "第1章",
      volumeTitle: "第一卷",
      relativePath,
      expectedSourceRevision: "a".repeat(64),
      issueIds: ["issue-one"],
      originalContent: "原稿",
      proposedContent: "修复稿",
      rationale: "修复重复段落",
      agents: [{ id: "editor", name: "文风编辑" }],
      skills: [{ id: "continuity", name: "连续性检查" }]
    }]
  };
}

describe("墨枢 AI 修复审阅状态", () => {
  it("生成稿默认待选择，不把模型输出误当作者接受", () => {
    const drafts = createInkHubRepairReviewDrafts(repairPlan());

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.decision).toBe("pending");
    expect(acceptedInkHubRepairDrafts(drafts)).toEqual([]);
  });

  it("只把作者明确接受且内容发生变化的 Markdown/TXT 章节列入写回", () => {
    const drafts = createInkHubRepairReviewDrafts(repairPlan());
    drafts[0]!.decision = "accepted";

    expect(acceptedInkHubRepairDrafts(drafts).map((draft) => draft.proposal.id)).toEqual([
      "proposal-one"
    ]);

    const unsupported = createInkHubRepairReviewDrafts(repairPlan("第一卷/第1章.docx"));
    unsupported[0]!.decision = "accepted";
    expect(acceptedInkHubRepairDrafts(unsupported)).toEqual([]);
  });
});
