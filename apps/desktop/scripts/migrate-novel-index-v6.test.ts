import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function legacyDatabase(path: string): void {
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE novels(entry_id TEXT PRIMARY KEY,title TEXT NOT NULL,entry_path_hash TEXT NOT NULL,status TEXT NOT NULL,document_count INTEGER NOT NULL,indexed_document_count INTEGER NOT NULL,skipped_document_count INTEGER NOT NULL,chapter_count INTEGER NOT NULL,total_characters INTEGER NOT NULL,content_complete INTEGER NOT NULL,content_hash TEXT,indexed_at TEXT,warnings_json TEXT NOT NULL,index_format_version INTEGER NOT NULL,source_stale INTEGER NOT NULL);
    CREATE TABLE source_manifest(entry_id TEXT NOT NULL,relative_path TEXT NOT NULL,size INTEGER NOT NULL,mtime_ms REAL NOT NULL,ctime_ms REAL NOT NULL,source_revision TEXT,PRIMARY KEY(entry_id,relative_path));
    CREATE TABLE chapters(id TEXT PRIMARY KEY,entry_id TEXT NOT NULL,ordinal INTEGER NOT NULL,title TEXT NOT NULL,volume_title TEXT,relative_path TEXT NOT NULL,content TEXT NOT NULL,character_count INTEGER NOT NULL,source_revision TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE content_items(id TEXT PRIMARY KEY,entry_id TEXT NOT NULL,kind TEXT NOT NULL,chapter_id TEXT,title TEXT NOT NULL,relative_path TEXT NOT NULL,content TEXT NOT NULL);
    CREATE VIRTUAL TABLE content_fts USING fts5(id UNINDEXED,entry_id UNINDEXED,kind UNINDEXED,chapter_id UNINDEXED,title,relative_path UNINDEXED,content,tokenize='trigram');
    CREATE VIRTUAL TABLE content_short_fts USING fts5(id UNINDEXED,entry_id UNINDEXED,tokens,tokenize='unicode61 remove_diacritics 0');
    CREATE TABLE reading_progress(entry_id TEXT PRIMARY KEY,chapter_id TEXT NOT NULL,character_offset INTEGER NOT NULL,scroll_fraction REAL NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO novels VALUES('novel','测试','hash','ready',2,2,0,1,22,1,'content-hash','2026-08-28T00:00:00Z','[]',5,0);
    INSERT INTO source_manifest VALUES('novel','正文/第1章.md',22,1,1,'revision');
    INSERT INTO chapters VALUES('chapter','novel',0,'第1章','第一卷','正文/第1章.md','潮声越来越近，守夜人经过石桥。',16,'revision','2026-08-28T00:00:00Z');
    INSERT INTO content_items(rowid,id,entry_id,kind,chapter_id,title,relative_path,content) VALUES(1,'chapter:chapter','novel','chapter','chapter','第1章','正文/第1章.md','潮声越来越近，守夜人经过石桥。');
    INSERT INTO content_items(rowid,id,entry_id,kind,chapter_id,title,relative_path,content) VALUES(2,'reference:setting','novel','reference',NULL,'设定','设定.md','守夜人的铜铃藏在石桥下。');
    INSERT INTO content_fts(rowid,id,entry_id,kind,chapter_id,title,relative_path,content) VALUES(1,'chapter:chapter','novel','chapter','chapter','第1章','正文/第1章.md','潮声越来越近，守夜人经过石桥。');
    INSERT INTO content_fts(rowid,id,entry_id,kind,chapter_id,title,relative_path,content) VALUES(2,'reference:setting','novel','reference',NULL,'设定','设定.md','守夜人的铜铃藏在石桥下。');
    INSERT INTO content_short_fts(rowid,id,entry_id,tokens) VALUES(1,'chapter:chapter','novel','潮声 声越 越来 来越 越近');
    INSERT INTO content_short_fts(rowid,id,entry_id,tokens) VALUES(2,'reference:setting','novel','守夜 夜人 人的 的铜 铜铃');
    INSERT INTO reading_progress VALUES('novel','chapter',4,0.5,'2026-08-28T00:00:00Z');
  `);
  database.close();
}

describe("novel index v6 migration", () => {
  it("builds a verified contentless candidate without changing the legacy database", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-index-migration-"));
    roots.push(root);
    const source = join(root, "knowledge.sqlite");
    const candidate = join(root, "knowledge.v6.sqlite");
    legacyDatabase(source);
    const before = new DatabaseSync(source, { readOnly: true });
    const legacySchema = before.prepare("SELECT sql FROM sqlite_master WHERE name='content_fts'").get() as { sql: string };
    before.close();

    await execute(process.execPath, [
      join(import.meta.dirname, "migrate-novel-index-v6.mjs"),
      "--mode", "stage",
      "--source", source,
      "--candidate", candidate
    ], { timeout: 30_000 });

    const unchanged = new DatabaseSync(source, { readOnly: true });
    expect(unchanged.prepare("SELECT sql FROM sqlite_master WHERE name='content_fts'").get()).toMatchObject({ sql: legacySchema.sql });
    unchanged.close();
    const migrated = new DatabaseSync(candidate, { readOnly: true });
    const schemas = migrated.prepare("SELECT sql FROM sqlite_master WHERE name IN ('content_fts','content_short_fts')").all() as Array<{ sql: string }>;
    expect(schemas.every(({ sql }) => /content\s*=\s*''/iu.test(sql) && /contentless_delete\s*=\s*1/iu.test(sql))).toBe(true);
    expect(migrated.prepare("SELECT index_format_version FROM novels").get()).toMatchObject({ index_format_version: 6 });
    expect(migrated.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 6 });
    expect(migrated.prepare("SELECT content FROM content_items WHERE kind='chapter'").get()).toMatchObject({ content: "" });
    expect(migrated.prepare("SELECT content FROM content_items WHERE kind='reference'").get()).toMatchObject({ content: "守夜人的铜铃藏在石桥下。" });
    expect(migrated.prepare(`SELECT content_items.id FROM content_fts JOIN content_items ON content_items.rowid=content_fts.rowid
      WHERE content_fts MATCH ? ORDER BY content_items.id`).all('content : "守夜人"')).toEqual([
      expect.objectContaining({ id: "chapter:chapter" }),
      expect.objectContaining({ id: "reference:setting" })
    ]);
    expect(migrated.prepare("SELECT * FROM reading_progress").get()).toMatchObject({ chapter_id: "chapter", character_offset: 4 });
    migrated.close();
    expect((await stat(candidate)).mode & 0o777).toBe(0o600);
  });
});
