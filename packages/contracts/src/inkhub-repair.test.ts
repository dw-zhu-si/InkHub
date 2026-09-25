import { describe, expect, it } from "vitest";
import {
  InkHubNovelAiRepairPlanSchema,
  InkHubNovelAiRepairProgressSchema,
  InkHubNovelAiRepairRequestSchema,
  InkHubNovelBatchRepairInputSchema
} from "./inkhub-reader";

const revision = "a".repeat(64);

describe("InkHub AI repair contracts", () => {
  it("requires an explicit billable confirmation before AI generation", () => {
    expect(() => InkHubNovelAiRepairRequestSchema.parse({
      entryId: "novel-one",
      confirmBillable: false
    })).toThrow();
    expect(InkHubNovelAiRepairRequestSchema.parse({
      entryId: "novel-one",
      confirmBillable: true
    })).toEqual({ entryId: "novel-one", confirmBillable: true });
  });

  it("keeps the selected agents, skills, source revision and complete draft auditable", () => {
    const plan = InkHubNovelAiRepairPlanSchema.parse({
      id: "repair-plan-one",
      entryId: "novel-one",
      generatedAt: "2026-08-17T08:00:00.000Z",
      modelId: "modelhub-qwen",
      modelLabel: "Qwen",
      issueCount: 1,
      warnings: [],
      proposals: [{
        id: "proposal-one",
        chapterId: "chapter-one",
        chapterTitle: "第一章",
        volumeTitle: "第一卷",
        relativePath: "第一卷/第一章.md",
        expectedSourceRevision: revision,
        issueIds: ["duplicate-one"],
        originalContent: "旧正文",
        proposedContent: "新正文",
        rationale: "删除重复段落，保留首次出现。",
        agents: [{ id: "inkhub_continuity_editor", name: "连续性审校师" }],
        skills: [{ id: "consistency-check", name: "一致性检查" }]
      }]
    });
    expect(plan.proposals[0]?.agents[0]?.id).toBe("inkhub_continuity_editor");
    expect(plan.proposals[0]?.skills[0]?.id).toBe("consistency-check");
  });

  it("validates bounded, monotonic AI repair progress", () => {
    expect(InkHubNovelAiRepairProgressSchema.parse({
      entryId: "novel-one",
      stage: "generating",
      completedBatches: 2,
      totalBatches: 5,
      completedChapters: 12,
      totalChapters: 30,
      message: "正在生成第 3/5 批修复稿",
      updatedAt: "2026-08-17T08:00:00.000Z"
    }).completedBatches).toBe(2);
    expect(() => InkHubNovelAiRepairProgressSchema.parse({
      entryId: "novel-one",
      stage: "generating",
      completedBatches: 6,
      totalBatches: 5,
      completedChapters: 12,
      totalChapters: 30,
      message: "错误进度",
      updatedAt: "2026-08-17T08:00:00.000Z"
    })).toThrow(/progress|totals/u);
  });

  it("requires a separate write confirmation and bounds aggregate repair content", () => {
    expect(() => InkHubNovelBatchRepairInputSchema.parse({
      entryId: "novel-one",
      confirmWrite: false,
      repairs: [{ chapterId: "chapter-one", expectedSourceRevision: revision, content: "新正文" }]
    })).toThrow();
    expect(() => InkHubNovelBatchRepairInputSchema.parse({
      entryId: "novel-one",
      confirmWrite: true,
      repairs: Array.from({ length: 11 }, (_, index) => ({
        chapterId: `chapter-${index}`,
        expectedSourceRevision: revision,
        content: "新".repeat(2_000_000)
      }))
    })).toThrow(/aggregate|total|总/u);
  });
});
