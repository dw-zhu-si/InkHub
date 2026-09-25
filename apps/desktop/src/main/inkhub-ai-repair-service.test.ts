import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentProviderRuntimeConfig,
  InkHubNovelChapter,
  InkHubNovelQualityReport,
  ShortAgentSubagentDefinition
} from "@deepwrite/contracts";
import {
  InkHubAiRepairService,
  type InkHubRepairModelRunner,
  type InkHubRepairRunnerInput
} from "./inkhub-ai-repair-service";
import { InkHubAiRepairTaskStore } from "./inkhub-ai-repair-task-store";

const temporaryRoots: string[] = [];
afterEach(async () => Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const revision = "a".repeat(64);
const chapters: InkHubNovelChapter[] = [
  {
    id: "chapter-one", entryId: "novel-one", ordinal: 0, title: "第一章", volumeTitle: "第一卷",
    relativePath: "第一卷/第一章.md", characterCount: 12, sourceRevision: revision, updatedAt: "2026-08-17T08:00:00.000Z"
  },
  {
    id: "chapter-two", entryId: "novel-one", ordinal: 1, title: "第二章", volumeTitle: "第一卷",
    relativePath: "第一卷/第二章.md", characterCount: 18, sourceRevision: revision, updatedAt: "2026-08-17T08:00:00.000Z"
  }
];

const report: InkHubNovelQualityReport = {
  entryId: "novel-one",
  generatedAt: "2026-08-17T08:00:00.000Z",
  localOnly: true,
  coverage: {
    entryId: "novel-one", status: "ready", documentCount: 2, indexedDocumentCount: 2,
    skippedDocumentCount: 0, chapterCount: 2, totalCharacters: 30, contentComplete: true,
    contentHash: "b".repeat(64), indexedAt: "2026-08-17T08:00:00.000Z", warnings: []
  },
  issues: [{
    id: "duplicate-one", rule: "duplicate-paragraph", severity: "warning",
    title: "重复段落", detail: "同一句在两章出现。", chapterIds: ["chapter-one", "chapter-two"]
  }]
};

const runtimeConfig: AgentProviderRuntimeConfig = {
  id: "modelhub-qwen", label: "Qwen", provider: "modelhub", modelId: "qwen3.8",
  api: "openai-completions", baseUrl: "http://127.0.0.1:11435/v1", reasoning: false,
  defaultThinkingLevel: "off", thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
  temperatureOptions: [0.1, 0.7, 1], apiKey: ""
};

const agents: ShortAgentSubagentDefinition[] = [
  { id: "inkhub_continuity_editor", name: "连续性审校师", description: "连续性", systemPrompt: "逐章核对连续性与事实。", enabled: true, modelMode: "inherit" },
  { id: "inkhub_prose_editor", name: "语言与文风编辑", description: "文风", systemPrompt: "只做最小语言修订。", enabled: true, modelMode: "inherit" },
  { id: "inkhub_reader_advocate", name: "读者体验测试员", description: "读者", systemPrompt: "从读者视角验证修订。", enabled: true, modelMode: "inherit" }
];

function fixture(runner: InkHubRepairModelRunner, installedSkills = ["consistency-check", "novel-text-polish"]) {
  const assets = {
    runNovelQualityCheck: vi.fn(async () => report),
    listNovelChapters: vi.fn(async () => ({ summary: report.coverage, chapters, offset: 0, total: 2, nextOffset: null })),
    readNovelChapter: vi.fn(async (_entryId: string, chapterId: string) => ({
      entryId: "novel-one", chapterId, title: chapters.find((chapter) => chapter.id === chapterId)!.title,
      content: chapterId === "chapter-one" ? "# 第一章\n\n重复正文。" : "# 第二章\n\n重复正文。\n\n后续。",
      startOffset: 0, endOffset: chapterId === "chapter-one" ? 12 : 18,
      totalCharacters: chapterId === "chapter-one" ? 12 : 18, nextOffset: null,
      previousChapterId: chapterId === "chapter-two" ? "chapter-one" : null,
      nextChapterId: chapterId === "chapter-one" ? "chapter-two" : null,
      sourceRevision: revision, readOnly: true as const
    })),
    listSkills: vi.fn(async () => ({
      verifiedAt: "2026-08-17T08:00:00.000Z",
      skills: installedSkills.map((id) => ({
        id, title: id, source: "trae" as const, path: `/skills/${id}/SKILL.md`, expectedSha256: revision,
        actualSha256: revision, status: "verified" as const, license: "未声明", enabled: true,
        executable: true, capabilityKind: "prompt-skill" as const, skillKind: "plot" as const,
        installState: "installed" as const, runtimeState: "ready" as const
      }))
    })),
    readSkill: vi.fn(async (id: string) => ({ id, content: `# ${id}\n按证据执行最小修复。`, truncated: false, readOnly: true as const }))
  };
  return {
    service: new InkHubAiRepairService({
      assets: assets as never,
      models: { resolve: vi.fn(async () => runtimeConfig) } as never,
      loadAgents: async () => agents,
      runner
    }),
    assets
  };
}

describe("InkHub AI repair service", () => {
  it("keeps the first duplicate occurrence and repairs the later chapter with verified capabilities", async () => {
    const run = vi.fn(async (input: InkHubRepairRunnerInput) => ({
      content: JSON.stringify({ repairs: [{ chapterId: "chapter-two", content: "# 第二章\n\n改写正文。\n\n后续。", rationale: "保留第一章，改写第二章重复段落。" }] }),
      runtime: { provider: "modelhub", model: "qwen3.8", mode: "provider" as const, configId: "modelhub-qwen" }
    }));
    const { service } = fixture({ run });
    const plan = await service.generate({ entryId: "novel-one", confirmBillable: true });

    expect(plan.proposals).toHaveLength(1);
    expect(plan.proposals[0]).toMatchObject({
      chapterId: "chapter-two",
      issueIds: ["duplicate-one"],
      proposedContent: "# 第二章\n\n改写正文。\n\n后续。"
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].agents.map((agent) => agent.id)).toEqual([
      "inkhub_continuity_editor", "inkhub_prose_editor", "inkhub_reader_advocate"
    ]);
    expect(run.mock.calls[0]?.[0].skills.map((skill) => skill.id)).toEqual([
      "consistency-check", "novel-text-polish", "inkhub-volume-chapter-continuity",
      "inkhub-review-revise-reaudit", "inkhub-semantic-deslop"
    ]);
    expect(service.getProgress("novel-one")).toMatchObject({
      stage: "completed",
      completedBatches: 1,
      totalBatches: 1,
      completedChapters: 1,
      totalChapters: 1
    });
  });

  it("fails before a model call when a required installed skill is missing", async () => {
    const runner = { run: vi.fn() };
    const { service } = fixture(runner, ["consistency-check"]);
    await expect(service.generate({ entryId: "novel-one", confirmBillable: true }))
      .rejects.toThrow(/Skill|技能/u);
    expect(runner.run).not.toHaveBeenCalled();
    expect(service.getProgress("novel-one")).toMatchObject({ stage: "failed" });
  });

  it("rejects model output that edits an unrequested chapter", async () => {
    const { service } = fixture({ run: vi.fn(async () => ({
      content: JSON.stringify({ repairs: [{ chapterId: "chapter-one", content: "越权改写", rationale: "错误" }] }),
      runtime: { provider: "modelhub", model: "qwen3.8", mode: "provider" as const, configId: "modelhub-qwen" }
    })) });
    await expect(service.generate({ entryId: "novel-one", confirmBillable: true }))
      .rejects.toThrow(/章节|chapter/u);
  });

  it("persists each paid batch and resumes only unfinished chapters after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-ai-repair-task-"));
    temporaryRoots.push(root);
    const bulkChapters: InkHubNovelChapter[] = Array.from({ length: 10 }, (_, index) => ({
      id: `chapter-${index}`, entryId: "novel-bulk", ordinal: index, title: `第${index}章`, volumeTitle: "第一卷",
      relativePath: `第一卷/第${index}章.md`, characterCount: 20, sourceRevision: revision,
      updatedAt: "2026-08-17T08:00:00.000Z"
    }));
    const bulkReport: InkHubNovelQualityReport = {
      ...report,
      entryId: "novel-bulk",
      coverage: { ...report.coverage, entryId: "novel-bulk", documentCount: 10, indexedDocumentCount: 10, chapterCount: 10, totalCharacters: 200 },
      issues: Array.from({ length: 9 }, (_, index) => ({
        id: `duplicate-${index + 1}`, rule: "duplicate-paragraph" as const, severity: "warning" as const,
        title: "重复段落", detail: "后续章重复。", chapterIds: ["chapter-0", `chapter-${index + 1}`]
      }))
    };
    const assets = {
      runNovelQualityCheck: vi.fn(async () => bulkReport),
      listNovelChapters: vi.fn(async () => ({ summary: bulkReport.coverage, chapters: bulkChapters, offset: 0, total: 10, nextOffset: null })),
      readNovelChapter: vi.fn(async (_entryId: string, chapterId: string) => {
        const chapter = bulkChapters.find((item) => item.id === chapterId)!;
        const content = `# ${chapter.title}\n\n原始正文 ${chapterId}`;
        return { entryId: "novel-bulk", chapterId, title: chapter.title, content, startOffset: 0, endOffset: content.length,
          totalCharacters: content.length, nextOffset: null, previousChapterId: null, nextChapterId: null,
          sourceRevision: revision, readOnly: true as const };
      }),
      listSkills: vi.fn(async () => ({ verifiedAt: "2026-08-17T08:00:00.000Z", skills: ["consistency-check", "novel-text-polish"].map((id) => ({
        id, title: id, source: "trae" as const, path: `/skills/${id}/SKILL.md`, expectedSha256: revision, actualSha256: revision,
        status: "verified" as const, license: "未声明", enabled: true, executable: true,
        capabilityKind: "prompt-skill" as const, skillKind: "plot" as const, installState: "installed" as const, runtimeState: "ready" as const
      })) })),
      readSkill: vi.fn(async (id: string) => ({ id, content: `# ${id}\n按证据修复。`, truncated: false, readOnly: true as const }))
    };
    const firstRun = vi.fn(async (input: InkHubRepairRunnerInput) => {
      if (firstRun.mock.calls.length === 2) throw new Error("模拟第二批网络失败");
      return { content: JSON.stringify({ repairs: input.chapters.map((chapter) => ({ chapterId: chapter.chapterId, content: `${chapter.content}\n已修复`, rationale: "去重" })) }),
        runtime: { provider: "modelhub", model: "qwen", mode: "provider" as const, configId: "modelhub-qwen" } };
    });
    const createService = (runner: InkHubRepairModelRunner) => new InkHubAiRepairService({
      assets: assets as never, models: { resolve: async () => runtimeConfig }, loadAgents: async () => agents,
      runner, taskStore: new InkHubAiRepairTaskStore(root)
    });
    await expect(createService({ run: firstRun }).generate({ entryId: "novel-bulk", confirmBillable: true }))
      .rejects.toThrow(/第二批/u);
    const storedAfterFailure = new InkHubAiRepairTaskStore(root).get("novel-bulk");
    expect(storedAfterFailure).toMatchObject({ status: "failed", progress: { completedBatches: 1, completedChapters: 8 } });
    expect(storedAfterFailure?.plan.proposals).toHaveLength(8);

    const resumedRun = vi.fn(async (input: InkHubRepairRunnerInput) => ({
      content: JSON.stringify({ repairs: input.chapters.map((chapter) => ({ chapterId: chapter.chapterId, content: `${chapter.content}\n恢复修复`, rationale: "恢复" })) }),
      runtime: { provider: "modelhub", model: "qwen", mode: "provider" as const, configId: "modelhub-qwen" }
    }));
    const plan = await createService({ run: resumedRun }).resume({ entryId: "novel-bulk", confirmBillable: true });
    expect(resumedRun).toHaveBeenCalledTimes(1);
    expect(resumedRun.mock.calls[0]![0].chapters.map((chapter) => chapter.chapterId)).toEqual(["chapter-9"]);
    expect(plan.proposals).toHaveLength(9);
    expect(new InkHubAiRepairTaskStore(root).get("novel-bulk")?.status).toBe("completed");
  });
});
