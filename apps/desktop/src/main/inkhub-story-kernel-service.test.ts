import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentProviderRuntimeConfig, InkHubNovelChapter } from "@deepwrite/contracts";
import {
  InkHubStoryKernelService,
  type InkHubStoryKernelModelRunner,
  type InkHubStoryKernelRunnerInput
} from "./inkhub-story-kernel-service";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const runtimeConfig: AgentProviderRuntimeConfig = {
  id: "modelhub-qwen", label: "Qwen", provider: "modelhub", modelId: "qwen3.8",
  api: "openai-completions", baseUrl: "http://127.0.0.1:11435/v1", reasoning: false,
  defaultThinkingLevel: "off", thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
  temperatureOptions: [0.1, 0.7, 1], apiKey: ""
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "inkhub-story-kernel-"));
  roots.push(root);
  const contents = new Map([
    ["c1", "# 第一章\n林舟在雨城收到银叶钥匙。"],
    ["c2", "# 第二章\n林舟知道钥匙能打开北门。"],
    ["c3", "# 第一章\n第二卷开始，林舟抵达北门。"]
  ]);
  const revision = (id: string) => (id === "c3" ? "c" : id === "c2" ? "b" : "a").repeat(64);
  const chapters: InkHubNovelChapter[] = [
    { id: "c1", entryId: "novel", ordinal: 0, title: "第一章", volumeTitle: "第一卷", relativePath: "第一卷/第一章.md", characterCount: contents.get("c1")!.length, sourceRevision: revision("c1"), updatedAt: "2026-08-21T01:00:00.000Z" },
    { id: "c2", entryId: "novel", ordinal: 1, title: "第二章", volumeTitle: "第一卷", relativePath: "第一卷/第二章.md", characterCount: contents.get("c2")!.length, sourceRevision: revision("c2"), updatedAt: "2026-08-21T01:00:00.000Z" },
    { id: "c3", entryId: "novel", ordinal: 2, title: "第一章", volumeTitle: "第二卷", relativePath: "第二卷/第一章.md", characterCount: contents.get("c3")!.length, sourceRevision: revision("c3"), updatedAt: "2026-08-21T01:00:00.000Z" }
  ];
  let contentHash = "d".repeat(64);
  const assets = {
    getNovelIndex: vi.fn(async () => ({
      entryId: "novel", status: "ready" as const, documentCount: 3, indexedDocumentCount: 3,
      skippedDocumentCount: 0, chapterCount: chapters.length, totalCharacters: [...contents.values()].join("").length,
      contentComplete: true, contentHash, indexedAt: "2026-08-21T01:00:00.000Z", warnings: []
    })),
    listNovelChapters: vi.fn(async (_entryId: string, offset: number) => ({
      summary: await assets.getNovelIndex(), chapters: chapters.slice(offset), offset, total: chapters.length, nextOffset: null
    })),
    readNovelChapter: vi.fn(async (_entryId: string, chapterId: string) => {
      const chapter = chapters.find((item) => item.id === chapterId)!;
      const content = contents.get(chapterId)!;
      return { entryId: "novel", chapterId, title: chapter.title, content, startOffset: 0, endOffset: content.length,
        totalCharacters: content.length, nextOffset: null, previousChapterId: null, nextChapterId: null,
        sourceRevision: chapter.sourceRevision, readOnly: true as const };
    })
  };
  return {
    root, assets, chapters, contents,
    changeSecondChapter() {
      contents.set("c2", "# 第二章\n林舟后来知道钥匙只能打开北门一次。");
      chapters[1] = { ...chapters[1]!, sourceRevision: "e".repeat(64), characterCount: contents.get("c2")!.length };
      contentHash = "f".repeat(64);
    }
  };
}

function reconstructionOutput(input: InkHubStoryKernelRunnerInput): string {
  return JSON.stringify({ chapters: input.chapters.map((chapter) => {
    const marker = chapter.content.includes("钥匙") ? "钥匙" : "林舟";
    const startOffset = chapter.content.indexOf(marker);
    return { chapterId: chapter.chapterId, summary: `${chapter.chapterTitle}摘要`, facts: [{
      category: "event", subject: "林舟", predicate: "经历", object: chapter.chapterTitle,
      status: "active", confidence: 0.9, startOffset, endOffset: startOffset + marker.length, excerpt: marker
    }] };
  }) });
}

describe("InkHubStoryKernelService", () => {
  it("按卷分批持久化重建，并只重算源版本变化的章节", async () => {
    const data = await fixture();
    const run = vi.fn(async (input: InkHubStoryKernelRunnerInput) => ({
      content: reconstructionOutput(input),
      runtime: { provider: "modelhub", model: "qwen3.8", mode: "provider" as const, configId: "modelhub-qwen" }
    }));
    const service = new InkHubStoryKernelService({
      storageDirectory: data.root, assets: data.assets, models: { resolve: async () => runtimeConfig }, runner: { run }
    });
    const first = await service.reconstruct({ entryId: "novel", confirmBillable: true });
    expect(first.summary).toMatchObject({ status: "ready", analyzedChapters: 3, reusedChapters: 0, pendingChapters: 0, factCount: 3 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((call) => [...new Set(call[0].chapters.map((chapter) => chapter.volumeTitle))])).toEqual([["第一卷"], ["第二卷"]]);

    const second = await service.reconstruct({ entryId: "novel", confirmBillable: true });
    expect(second.summary.reusedChapters).toBe(3);
    expect(run).toHaveBeenCalledTimes(2);

    data.changeSecondChapter();
    const third = await service.reconstruct({ entryId: "novel", confirmBillable: true });
    expect(third.summary.reusedChapters).toBe(2);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls[2]![0].chapters.map((chapter) => chapter.chapterId)).toEqual(["c2"]);
  });

  it("在应用内生成不写回的续写草稿和可失效的非正史推演", async () => {
    const data = await fixture();
    const runner: InkHubStoryKernelModelRunner = { run: vi.fn(async (input) => {
      if (input.operation === "reconstruct") return { content: reconstructionOutput(input), runtime: { provider: "modelhub", model: "qwen", mode: "provider" as const, configId: "modelhub-qwen" } };
      if (input.operation === "continuation") return { content: JSON.stringify({ title: "第三章", plan: ["抵达北门"], draft: "林舟推开了北门。", continuityNotes: ["延续钥匙线索"], evidenceChapterIds: ["c2"] }), runtime: { provider: "modelhub", model: "qwen", mode: "provider" as const, configId: "modelhub-qwen" } };
      return { content: JSON.stringify({ branches: [
        { title: "开门", premise: "立即开门", beats: ["试钥匙", "进入"], opportunities: ["推进主线"], risks: ["暴露"], evidenceChapterIds: ["c2"] },
        { title: "等待", premise: "先侦察", beats: ["观察", "绕行"], opportunities: ["补线索"], risks: ["节奏变慢"], evidenceChapterIds: ["c3"] }
      ] }), runtime: { provider: "modelhub", model: "qwen", mode: "provider" as const, configId: "modelhub-qwen" } };
    }) };
    const service = new InkHubStoryKernelService({ storageDirectory: data.root, assets: data.assets, models: { resolve: async () => runtimeConfig }, runner });
    await service.reconstruct({ entryId: "novel", confirmBillable: true });
    const continuation = await service.generateContinuation({ entryId: "novel", authorIntent: "写到北门", currentFocus: "林舟", targetCharacters: 1_000, confirmBillable: true });
    expect(continuation).toMatchObject({ canonical: false, writebackPerformed: false, draft: "林舟推开了北门。" });
    expect(continuation.evidence[0]).toMatchObject({ chapterId: "c2", excerpt: "钥匙" });

    const forecast = await service.generateForecast({ entryId: "novel", question: "北门之后如何发展？", branchCount: 2, confirmBillable: true });
    expect(forecast).toMatchObject({ canonical: false, stale: false });
    data.changeSecondChapter();
    expect((await service.listForecasts("novel")).forecasts[0]).toMatchObject({ id: forecast.id, stale: true });
  });
});
