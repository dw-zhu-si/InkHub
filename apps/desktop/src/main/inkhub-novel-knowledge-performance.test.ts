import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { InkHubNovelKnowledgeService } from "./inkhub-novel-knowledge";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("InkHubNovelKnowledgeService performance boundaries", () => {
  it("在万章级合成索引中以短词索引完成无结果查询", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-novel-performance-"));
    temporaryRoots.push(root);
    const novel = join(root, "大书");
    await mkdir(join(novel, "正文"), { recursive: true });
    const repeatedBody = "雨落在旧城的石板路上，守夜人沿着长街巡行。".repeat(25);
    const manuscript = Array.from({ length: 10_000 }, (_, index) =>
      `# 第${index + 1}章\n${repeatedBody}`
    ).join("\n");
    await writeFile(join(novel, "正文", "全书.md"), manuscript, "utf8");
    const service = new InkHubNovelKnowledgeService(join(root, "index"));
    await service.build({ entryId: "large-index", title: "性能边界", entryPath: novel });

    const database = new DatabaseSync(join(root, "index", "knowledge.sqlite"));
    const plan = database.prepare(`EXPLAIN QUERY PLAN
      SELECT content_items.id FROM content_short_fts
      JOIN content_items ON content_items.rowid = content_short_fts.rowid
      WHERE content_short_fts MATCH ? AND content_items.entry_id = ?`).all('tokens : "罕词"', "large-index") as Array<{ detail: string }>;
    expect(plan.some((step) => /VIRTUAL TABLE INDEX/iu.test(step.detail))).toBe(true);
    database.close();

    const startedAt = performance.now();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(service.search("large-index", "罕词", 20).results).toEqual([]);
    }
    const elapsed = performance.now() - startedAt;
    if (process.env.INKHUB_PERF_REPORT === "1") {
      const legacyDatabase = new DatabaseSync(join(root, "index", "knowledge.sqlite"));
      const legacyQuery = legacyDatabase.prepare(`SELECT id FROM content_items
        WHERE entry_id = ? AND instr(lower(content), lower(?)) > 0 LIMIT 20`);
      const legacyStartedAt = performance.now();
      for (let attempt = 0; attempt < 5; attempt += 1) legacyQuery.all("large-index", "罕词");
      const legacyElapsed = performance.now() - legacyStartedAt;
      legacyDatabase.close();
      console.info(`inkhub-short-search: indexed=${elapsed.toFixed(3)}ms legacy-scan=${legacyElapsed.toFixed(3)}ms / 5 queries / 10,000 chapters`);
    }

    expect(elapsed).toBeLessThan(150);
  }, 20_000);
});
