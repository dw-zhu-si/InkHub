import { describe, expect, it } from "vitest";
import type { InkHubNovelIndexSummary, InkHubStoryStateSummary } from "@deepwrite/contracts";
import { checkNovelHealth, indexHealth, storyHealth, type NovelHealthResult } from "./novelHealth";

const hash = "a".repeat(64);
const index: InkHubNovelIndexSummary = { entryId: "novel_fixture", status: "ready", documentCount: 2, indexedDocumentCount: 2, skippedDocumentCount: 0, chapterCount: 3, totalCharacters: 500, contentComplete: true, contentHash: hash, indexedAt: "2026-10-29T00:00:00.000Z", warnings: [] };
const story: InkHubStoryStateSummary = { entryId: "novel_fixture", status: "ready", stateVersion: hash, sourceContentHash: hash, totalChapters: 3, analyzedChapters: 3, reusedChapters: 0, pendingChapters: 0, failedChapters: 0, factCount: 9, updatedAt: "2026-10-29T00:00:00.000Z", message: "测试状态" };
function result(): NovelHealthResult { return { entryId: index.entryId, checkedAt: "2026-10-29T00:00:00.000Z", index: { ...index }, story: { ...story }, indexError: null, storyError: null }; }

describe("novel health projections", () => {
  it("never treats unchecked or missing data as current", () => {
    expect(indexHealth(null).status).toBe("unknown");
    expect(storyHealth(null).status).toBe("unknown");
    const value = result();
    value.index!.status = "not-indexed";
    expect(indexHealth(value).status).toBe("missing");
    value.story!.status = "not-built";
    expect(storyHealth(value).status).toBe("missing");
  });
  it("propagates stale source and mismatched hashes to facts and summaries", () => {
    const value = result();
    expect(storyHealth(value).status).toBe("current");
    value.index!.status = "stale";
    expect(storyHealth(value).status).toBe("stale");
    value.index!.status = "ready";
    value.story!.sourceContentHash = "b".repeat(64);
    expect(storyHealth(value).status).toBe("stale");
  });
  it("distinguishes partial coverage, missing version, and failed reads", () => {
    const value = result();
    value.story!.pendingChapters = 1;
    value.story!.analyzedChapters = 2;
    expect(storyHealth(value).status).toBe("partial");
    value.index!.contentComplete = false;
    expect(indexHealth(value).status).toBe("partial");
    value.index!.contentComplete = true;
    value.index!.contentHash = null;
    expect(indexHealth(value).status).toBe("unknown");
    value.indexError = "not readable";
    expect(indexHealth(value).status).toBe("failed");
  });
});

describe("novel health checker", () => {
  it("verifies one source before reading derived state and retains no full fact payload", async () => {
    const calls: string[] = [];
    const value = await checkNovelHealth(index.entryId, {
      getNovelIndex: async (_id, verify) => { calls.push(`index:${verify}`); return index; },
      getStoryState: async () => { calls.push("story"); return { summary: story, facts: ["discarded"] }; }
    });
    expect(calls).toEqual(["index:true", "story"]);
    expect(value?.story).toBe(story);
    expect(value).not.toHaveProperty("facts");
  });
  it("does not launch the next read after cancellation and discards late responses", async () => {
    let active = true;
    let storyCalls = 0;
    const value = await checkNovelHealth(index.entryId, {
      getNovelIndex: async () => { active = false; return index; },
      getStoryState: async () => { storyCalls++; return { summary: story }; }
    }, () => active);
    expect(value).toBeNull();
    expect(storyCalls).toBe(0);
  });
  it("keeps an index failure visible and avoids unreliable derivative reads", async () => {
    let storyCalls = 0;
    const value = await checkNovelHealth(index.entryId, {
      getNovelIndex: async () => { throw new Error("permission denied"); },
      getStoryState: async () => { storyCalls++; return { summary: story }; }
    });
    expect(value?.indexError).toBe("permission denied");
    expect(storyCalls).toBe(0);
  });
  it("discards a story response that arrives after switching works", async () => {
    let active = true;
    const value = await checkNovelHealth(index.entryId, {
      getNovelIndex: async () => index,
      getStoryState: async () => { active = false; return { summary: story }; }
    }, () => active);
    expect(value).toBeNull();
  });
  it("does not read derived state for a work without an index", async () => {
    let storyCalls = 0;
    const value = await checkNovelHealth(index.entryId, {
      getNovelIndex: async () => ({ ...index, status: "not-indexed", contentHash: null }),
      getStoryState: async () => { storyCalls++; return { summary: story }; }
    });
    expect(indexHealth(value).status).toBe("missing");
    expect(storyCalls).toBe(0);
  });
});
