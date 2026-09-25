import { describe, expect, it, vi } from "vitest";
import type { AgentProviderRuntimeConfig } from "@deepwrite/contracts";
import { InkHubDeepQualityCoordinator } from "./inkhub-deep-quality-coordinator";
import { MemoryInkHubDeepQualityTaskStore } from "./inkhub-deep-quality-task-store";

const revision = "a".repeat(64);
const contentHash = "b".repeat(64);
const chapterContent = "沈砚在雨夜抵达河州。";
const runtimeConfig: AgentProviderRuntimeConfig = {
  id: "modelhub-test",
  label: "ModelHub Test",
  provider: "modelhub",
  modelId: "test-model",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1:11435/v1",
  apiKey: "",
  reasoning: false,
  defaultThinkingLevel: "off",
  thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
  temperatureOptions: [0.1, 0.7, 1]
};

function createOptions(run: (call: number) => Promise<{ content: string }>) {
  let calls = 0;
  return {
    calls: () => calls,
    options: {
      assets: {
        getNovelIndex: vi.fn(async () => ({
          entryId: "novel-one", status: "ready" as const, documentCount: 1,
          indexedDocumentCount: 1, skippedDocumentCount: 0, chapterCount: 1,
          totalCharacters: chapterContent.length, contentComplete: true,
          contentHash, indexedAt: "2026-08-28T08:00:00.000Z", warnings: []
        })),
        listNovelChapters: vi.fn(async () => ({
          summary: {
            entryId: "novel-one", status: "ready" as const, documentCount: 1,
            indexedDocumentCount: 1, skippedDocumentCount: 0, chapterCount: 1,
            totalCharacters: chapterContent.length, contentComplete: true,
            contentHash, indexedAt: "2026-08-28T08:00:00.000Z", warnings: []
          },
          chapters: [{
            id: "chapter-one", entryId: "novel-one", ordinal: 0, title: "第1章",
            volumeTitle: "第一卷", relativePath: "第一卷/第1章.md",
            characterCount: chapterContent.length, sourceRevision: revision,
            updatedAt: "2026-08-28T08:00:00.000Z"
          }],
          offset: 0, total: 1, nextOffset: null
        })),
        readNovelChapter: vi.fn(async () => ({
          entryId: "novel-one", chapterId: "chapter-one", title: "第1章",
          content: chapterContent, startOffset: 0, endOffset: chapterContent.length,
          totalCharacters: chapterContent.length, nextOffset: null,
          previousChapterId: null, nextChapterId: null, sourceRevision: revision,
          readOnly: true as const
        }))
      },
      models: { resolve: vi.fn(async () => runtimeConfig) },
      taskStore: new MemoryInkHubDeepQualityTaskStore(),
      runner: {
        async run() {
          calls += 1;
          const result = await run(calls);
          return {
            ...result,
            runtime: { provider: "modelhub", model: "test-model", mode: "provider" as const, configId: "modelhub-test" }
          };
        }
      }
    }
  };
}

describe("InkHubDeepQualityCoordinator", () => {
  it("persists a completed seven-domain report without writing source files", async () => {
    const fixture = createOptions(async () => ({ content: JSON.stringify({ findings: [] }) }));
    const coordinator = new InkHubDeepQualityCoordinator(fixture.options);

    const report = await coordinator.run({ entryId: "novel-one", confirmBillable: true });

    expect(report.coverage).toHaveLength(7);
    expect(fixture.calls()).toBe(7);
    expect(coordinator.getTask("novel-one")).toMatchObject({
      status: "completed",
      sourceContentHash: contentHash,
      progress: { completedWindows: 7, totalWindows: 7 }
    });
  });

  it("resumes after the last saved window instead of repeating billable calls", async () => {
    let failOnce = true;
    const fixture = createOptions(async (call) => {
      if (call === 2 && failOnce) {
        failOnce = false;
        throw new Error("temporary ModelHub failure");
      }
      return { content: JSON.stringify({ findings: [] }) };
    });
    const coordinator = new InkHubDeepQualityCoordinator(fixture.options);

    await expect(coordinator.run({ entryId: "novel-one", confirmBillable: true }))
      .rejects.toThrow("temporary ModelHub failure");
    expect(coordinator.getTask("novel-one")?.checkpoint.nextInvocation).toBe(1);

    await coordinator.resume({ entryId: "novel-one", confirmBillable: true });

    expect(fixture.calls()).toBe(8);
    expect(coordinator.getTask("novel-one")?.status).toBe("completed");
  });
});
