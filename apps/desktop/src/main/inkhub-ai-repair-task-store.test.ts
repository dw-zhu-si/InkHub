import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { InkHubNovelAiRepairTask } from "@deepwrite/contracts";
import { InkHubAiRepairTaskStore } from "./inkhub-ai-repair-task-store";
import mainSource from "./index.ts?raw";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

function completedTask(): InkHubNovelAiRepairTask {
  const updatedAt = "2026-08-22T08:00:00.000Z";
  return {
    entryId: "novel-one",
    status: "completed",
    sourceContentHash: "a".repeat(64),
    requestedModelId: "model-one",
    progress: {
      entryId: "novel-one",
      stage: "completed",
      completedBatches: 1,
      totalBatches: 1,
      completedChapters: 1,
      totalChapters: 1,
      message: "AI 修复稿已生成，等待审阅。",
      updatedAt
    },
    plan: {
      id: "plan-one",
      entryId: "novel-one",
      generatedAt: updatedAt,
      modelId: "model-one",
      modelLabel: "Model One",
      issueCount: 1,
      warnings: [],
      proposals: [{
        id: "proposal-one",
        chapterId: "chapter-one",
        chapterTitle: "第一章",
        volumeTitle: "第一卷",
        relativePath: "第一卷/第一章.md",
        expectedSourceRevision: "b".repeat(64),
        issueIds: ["issue-one"],
        originalContent: "原稿",
        proposedContent: "修复稿",
        rationale: "修复重复段落",
        agents: [{ id: "editor", name: "文风编辑" }],
        skills: [{ id: "continuity", name: "连续性检查" }]
      }]
    },
    lastError: null,
    updatedAt
  };
}

describe("InkHubAiRepairTaskStore review lifecycle", () => {
  it("does not restore a consumed repair task after the application reopens", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-ai-repair-consumed-"));
    temporaryRoots.push(root);
    const firstSession = new InkHubAiRepairTaskStore(root);
    firstSession.put(completedTask());

    const consumed = firstSession.consume(
      "novel-one",
      "2026-08-22T09:00:00.000Z"
    );
    firstSession.close();

    expect(consumed).toMatchObject({ entryId: "novel-one", status: "consumed" });
    const reopenedSession = new InkHubAiRepairTaskStore(root);
    expect(reopenedSession.get("novel-one")).toBeNull();
    reopenedSession.close();
  });

  it("marks the persisted task consumed only after batch writeback succeeds", () => {
    const start = mainSource.indexOf('case "applyNovelChapterRepairs"');
    const body = mainSource.slice(start, start + 700);

    expect(body).toContain("await inkHubAssetStore.applyNovelChapterRepairs");
    expect(body).toContain("inkHubAiRepairTaskStore.consume(request.input.entryId)");
    expect(body.indexOf("await inkHubAssetStore.applyNovelChapterRepairs")).toBeLessThan(
      body.indexOf("inkHubAiRepairTaskStore.consume")
    );
  });
});
