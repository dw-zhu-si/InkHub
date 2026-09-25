import { access, lstat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";

const indexDirectory = resolve(process.argv[2] || join(process.env.HOME || "", "Library/Application Support/@deepwrite/desktop/indexes/novels"));
const databasePath = join(indexDirectory, "knowledge.sqlite");
const workerPath = resolve(import.meta.dirname, "../out/main/inkhub-quality-worker.js");

await access(workerPath);
const databaseInfo = await lstat(databasePath);
if (!databaseInfo.isFile() || (databaseInfo.mode & 0o077) !== 0) {
  throw new Error("真实小说索引必须是权限 0600 的普通文件。");
}

const database = new DatabaseSync(databasePath, { readOnly: true });
const schema = database.prepare("SELECT sql FROM sqlite_master WHERE name IN ('content_fts','content_short_fts') ORDER BY name").all();
if (schema.length !== 2 || !schema.every(({ sql }) => /content\s*=\s*''/iu.test(sql) && /contentless_delete\s*=\s*1/iu.test(sql))) {
  throw new Error("真实小说索引不是 contentless FTS v6。");
}
if (database.prepare("PRAGMA user_version").get().user_version !== 6) {
  throw new Error("真实小说索引 user_version 不是 6。");
}
const quickCheck = database.prepare("PRAGMA quick_check").all();
if (quickCheck.length !== 1 || quickCheck[0].quick_check !== "ok") {
  throw new Error("真实小说索引 quick_check 未通过。");
}
const target = database.prepare(`SELECT novels.entry_id,novels.chapter_count,chapters.id AS chapter_id,chapters.content
  FROM novels JOIN chapters ON chapters.entry_id=novels.entry_id AND chapters.ordinal=0
  WHERE novels.index_format_version=6 AND novels.status IN ('ready','partial')
  ORDER BY novels.chapter_count DESC LIMIT 1`).get();
if (!target?.entry_id || !target.chapter_id || !target.content) {
  throw new Error("真实小说索引缺少可验收章节。");
}
const novelCount = Number(database.prepare("SELECT count(*) AS count FROM novels").get().count);
const progressSample = database.prepare("SELECT entry_id FROM reading_progress ORDER BY entry_id LIMIT 1").get();
const readingProgressCount = Number(database.prepare("SELECT count(*) AS count FROM reading_progress").get().count);
const query = String(target.content).match(/[\p{L}\p{M}\p{N}]{3}/u)?.[0] ?? "";
database.close();
if ([...query].length < 3) throw new Error("真实索引样本不足以执行全文搜索。");

const worker = new Worker(workerPath);
let nextId = 1;
const pending = new Map();
worker.on("message", (message) => {
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timeout);
  if (message.ok) request.resolve(message.result);
  else request.reject(new Error(message.error || "真实索引 Worker 请求失败。"));
});
worker.on("error", (error) => {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
});

function request(operation, input = {}, timeoutMs = 120_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const id = nextId++;
    const timeout = setTimeout(() => {
      pending.delete(id);
      rejectPromise(new Error(`${operation} 超过 ${timeoutMs} ms。`));
    }, timeoutMs);
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timeout });
    worker.postMessage({ id, indexDirectory, operation, ...input });
  });
}

const startedAt = performance.now();
try {
  const summary = await request("summary", { entryId: target.entry_id });
  if (!["ready", "partial"].includes(summary.status) || summary.chapterCount !== target.chapter_count) {
    throw new Error("真实索引摘要与 SQLite 基线不一致。");
  }
  const catalog = await request("list-chapters", { entryId: target.entry_id, offset: 0, limit: 20 });
  if (!catalog.chapters?.length || catalog.total !== target.chapter_count) {
    throw new Error("真实索引章节目录不完整。");
  }
  const chapter = await request("read-chapter", {
    entryId: target.entry_id,
    chapterId: catalog.chapters[0].id,
    offset: 0,
    limit: 2_000
  });
  if (!chapter.content || chapter.content.length === 0) throw new Error("真实索引章节正文为空。");

  const searchDurations = [];
  let lastSearchCount = 0;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const searchStartedAt = performance.now();
    const search = await request("search", { entryId: target.entry_id, query, limit: 20 });
    searchDurations.push(performance.now() - searchStartedAt);
    lastSearchCount = search.results?.length ?? 0;
  }
  if (lastSearchCount === 0) throw new Error("真实索引搜索没有命中抽样正文。");
  searchDurations.sort((left, right) => left - right);
  const p50 = searchDurations[Math.floor(searchDurations.length / 2)];
  const p95 = searchDurations[Math.ceil(searchDurations.length * 0.95) - 1];
  if (p95 > 1_000) throw new Error(`真实索引搜索 P95 ${p95.toFixed(1)} ms 超过 1,000 ms 门禁。`);

  const qualityStartedAt = performance.now();
  const quality = await request("quality", { entryId: target.entry_id }, 180_000);
  const qualityMs = performance.now() - qualityStartedAt;
  if (!quality.coverage || !Array.isArray(quality.issues)) throw new Error("真实索引质检报告无效。");
  const progress = progressSample?.entry_id
    ? await request("get-progress", { entryId: progressSample.entry_id }, 30_000)
    : null;
  if (readingProgressCount > 0 && progress === null) throw new Error("真实索引阅读进度未能通过 Worker 恢复。");

  console.log(JSON.stringify({
    status: "verified",
    schemaVersion: 6,
    databaseBytes: databaseInfo.size,
    novelCount,
    selectedChapterCount: target.chapter_count,
    catalogCount: catalog.total,
    chapterReadable: true,
    search: { attempts: 10, resultCount: lastSearchCount, p50Ms: Number(p50.toFixed(3)), p95Ms: Number(p95.toFixed(3)) },
    quality: { issueCount: quality.issues.length, durationMs: Number(qualityMs.toFixed(3)) },
    readingProgressCount,
    readingProgressRestored: readingProgressCount === 0 || progress !== null,
    totalDurationMs: Number((performance.now() - startedAt).toFixed(3))
  }, null, 2));
} finally {
  await worker.terminate();
}
