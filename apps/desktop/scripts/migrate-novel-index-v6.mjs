import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const TARGET_VERSION = 6;

function argumentsFrom(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`无法识别的参数：${key ?? ""}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} 缺少值。`);
    values.set(key.slice(2), value);
    index += 1;
  }
  return values;
}

function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`缺少 --${key}。`);
  return resolve(value);
}

async function assertRegularFile(path, label) {
  const info = await lstat(path).catch(() => null);
  if (!info?.isFile()) throw new Error(`${label}不是普通文件：${path}`);
}

async function assertAbsent(path, label) {
  const info = await lstat(path).catch(() => null);
  if (info) throw new Error(`${label}已存在，拒绝覆盖：${path}`);
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function schema(database) {
  database.exec(`
    CREATE TABLE novels (
      entry_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      entry_path_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      document_count INTEGER NOT NULL,
      indexed_document_count INTEGER NOT NULL,
      skipped_document_count INTEGER NOT NULL,
      chapter_count INTEGER NOT NULL,
      total_characters INTEGER NOT NULL,
      content_complete INTEGER NOT NULL,
      content_hash TEXT,
      indexed_at TEXT,
      warnings_json TEXT NOT NULL,
      index_format_version INTEGER NOT NULL DEFAULT 6,
      source_stale INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE source_manifest (
      entry_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms REAL NOT NULL,
      ctime_ms REAL NOT NULL,
      source_revision TEXT,
      PRIMARY KEY(entry_id, relative_path),
      FOREIGN KEY(entry_id) REFERENCES novels(entry_id) ON DELETE CASCADE
    );
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL,
      volume_title TEXT,
      relative_path TEXT NOT NULL,
      content TEXT NOT NULL,
      character_count INTEGER NOT NULL,
      source_revision TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(entry_id) REFERENCES novels(entry_id) ON DELETE CASCADE
    );
    CREATE TABLE content_items (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      chapter_id TEXT,
      title TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY(entry_id) REFERENCES novels(entry_id) ON DELETE CASCADE
    );
    CREATE VIRTUAL TABLE content_fts USING fts5(
      title,
      content,
      content='',
      contentless_delete=1,
      tokenize='trigram'
    );
    CREATE VIRTUAL TABLE content_short_fts USING fts5(
      tokens,
      content='',
      contentless_delete=1,
      tokenize='unicode61 remove_diacritics 0'
    );
    CREATE TABLE reading_progress (
      entry_id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      character_offset INTEGER NOT NULL,
      scroll_fraction REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

const regularTables = [
  ["novels", ["entry_id", "title", "entry_path_hash", "status", "document_count", "indexed_document_count", "skipped_document_count", "chapter_count", "total_characters", "content_complete", "content_hash", "indexed_at", "warnings_json", "index_format_version", "source_stale"]],
  ["source_manifest", ["entry_id", "relative_path", "size", "mtime_ms", "ctime_ms", "source_revision"]],
  ["chapters", ["id", "entry_id", "ordinal", "title", "volume_title", "relative_path", "content", "character_count", "source_revision", "updated_at"]],
  ["reading_progress", ["entry_id", "chapter_id", "character_offset", "scroll_fraction", "updated_at"]]
];

function copyRows(source, candidate, table, columns, includeRowid = false) {
  const selectColumns = includeRowid ? `rowid AS _rowid,${columns.join(",")}` : columns.join(",");
  const insertColumns = includeRowid ? ["rowid", ...columns] : columns;
  const select = source.prepare(`SELECT ${selectColumns} FROM ${table}`);
  const insert = candidate.prepare(`INSERT INTO ${table} (${insertColumns.join(",")}) VALUES (${insertColumns.map(() => "?").join(",")})`);
  let count = 0;
  for (const row of select.iterate()) {
    const values = includeRowid ? [row._rowid, ...columns.map((column) => row[column])] : columns.map((column) => row[column]);
    insert.run(...values);
    count += 1;
    if (count % 5_000 === 0) console.log(`migration_progress table=${table} rows=${count}`);
  }
  console.log(`migration_table table=${table} rows=${count}`);
  return count;
}

function copyContentItems(source, candidate) {
  const select = source.prepare(`SELECT rowid AS _rowid,id,entry_id,kind,chapter_id,title,relative_path,
    CASE kind WHEN 'chapter' THEN '' ELSE content END AS content
    FROM content_items ORDER BY rowid`);
  const insert = candidate.prepare(`INSERT INTO content_items
    (rowid,id,entry_id,kind,chapter_id,title,relative_path,content) VALUES (?,?,?,?,?,?,?,?)`);
  let count = 0;
  for (const row of select.iterate()) {
    insert.run(row._rowid, row.id, row.entry_id, row.kind, row.chapter_id, row.title, row.relative_path, row.content);
    count += 1;
    if (count % 5_000 === 0) console.log(`migration_progress table=content_items rows=${count}`);
  }
  console.log(`migration_table table=content_items rows=${count}`);
  return count;
}

function tableCount(database, table) {
  return Number(database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count);
}

function quickCheck(database, label) {
  const rows = database.prepare("PRAGMA quick_check").all();
  if (rows.length !== 1 || rows[0].quick_check !== "ok") throw new Error(`${label} quick_check 未通过。`);
}

function foreignKeyCheck(database) {
  if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("候选库 foreign_key_check 未通过。");
}

function ftsSchemas(database) {
  return database.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('content_fts','content_short_fts') ORDER BY name").all();
}

function isContentlessV6(database) {
  const schemas = ftsSchemas(database);
  return schemas.length === 2 && schemas.every(({ sql }) => /content\s*=\s*''/iu.test(sql) && /contentless_delete\s*=\s*1/iu.test(sql));
}

function sampleQueries(source) {
  const queries = new Set();
  const statement = source.prepare(`SELECT CASE content_items.kind WHEN 'chapter' THEN chapters.content ELSE content_items.content END AS content
    FROM content_items LEFT JOIN chapters ON chapters.id = content_items.chapter_id AND chapters.entry_id = content_items.entry_id
    WHERE length(CASE content_items.kind WHEN 'chapter' THEN chapters.content ELSE content_items.content END) >= 3
    ORDER BY content_items.rowid LIMIT 200`);
  for (const { content } of statement.iterate()) {
    for (const match of String(content).matchAll(/[\p{L}\p{M}\p{N}]{3}/gu)) {
      queries.add(match[0]);
      if (queries.size >= 12) return [...queries];
    }
  }
  return [...queries];
}

function searchIds(database, query, legacy) {
  const escaped = query.replace(/"/gu, '""');
  if (legacy) {
    return database.prepare(`SELECT id FROM content_fts WHERE content_fts MATCH ?
      ORDER BY bm25(content_fts, 0, 0, 0, 0, 3.0, 1.0), id LIMIT 50`)
      .all(`content : "${escaped}"`).map(({ id }) => id);
  }
  return database.prepare(`SELECT content_items.id FROM content_fts
    JOIN content_items ON content_items.rowid = content_fts.rowid
    WHERE content_fts MATCH ?
    ORDER BY bm25(content_fts, 3.0, 1.0), content_items.id LIMIT 50`)
    .all(`content : "${escaped}"`).map(({ id }) => id);
}

function validateEquivalent(source, candidate) {
  quickCheck(candidate, "候选库");
  foreignKeyCheck(candidate);
  if (!isContentlessV6(candidate)) throw new Error("候选库不是 contentless FTS v6。 ");
  const counts = {};
  for (const table of ["novels", "source_manifest", "chapters", "content_items", "reading_progress", "content_fts", "content_short_fts"]) {
    const before = tableCount(source, table);
    const after = tableCount(candidate, table);
    if (before !== after) throw new Error(`${table} 行数不一致：${before} != ${after}`);
    counts[table] = after;
  }
  const oldCharacters = source.prepare("SELECT coalesce(sum(character_count),0) AS total FROM chapters").get().total;
  const newCharacters = candidate.prepare("SELECT coalesce(sum(character_count),0) AS total FROM chapters").get().total;
  if (oldCharacters !== newCharacters) throw new Error("章节字符总数不一致。 ");
  const orphanChapters = candidate.prepare(`SELECT count(*) AS count FROM content_items
    LEFT JOIN chapters ON chapters.id=content_items.chapter_id AND chapters.entry_id=content_items.entry_id
    WHERE content_items.kind='chapter' AND chapters.id IS NULL`).get().count;
  if (Number(orphanChapters) !== 0) throw new Error("候选库存在没有正文权威来源的章节索引项。 ");
  const duplicateChapterCharacters = candidate.prepare(`SELECT coalesce(sum(length(content)),0) AS total
    FROM content_items WHERE kind='chapter'`).get().total;
  if (Number(duplicateChapterCharacters) !== 0) throw new Error("候选库仍保留章节正文冗余副本。 ");
  const sourceReferenceCharacters = source.prepare(`SELECT coalesce(sum(length(content)),0) AS total
    FROM content_items WHERE kind!='chapter'`).get().total;
  const candidateReferenceCharacters = candidate.prepare(`SELECT coalesce(sum(length(content)),0) AS total
    FROM content_items WHERE kind!='chapter'`).get().total;
  if (sourceReferenceCharacters !== candidateReferenceCharacters) throw new Error("资料正文字符总数不一致。 ");
  for (const query of sampleQueries(source)) {
    const before = searchIds(source, query, true);
    const after = searchIds(candidate, query, false);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`搜索样本不等价：${query}`);
  }
  const versions = candidate.prepare("SELECT min(index_format_version) AS minimum,max(index_format_version) AS maximum FROM novels").get();
  if (Number(versions.minimum ?? TARGET_VERSION) !== TARGET_VERSION || Number(versions.maximum ?? TARGET_VERSION) !== TARGET_VERSION) {
    throw new Error("候选库的小说索引版本不是 v6。 ");
  }
  return counts;
}

async function stage(sourcePath, candidatePath) {
  await assertRegularFile(sourcePath, "源数据库");
  await assertAbsent(candidatePath, "候选数据库");
  await assertAbsent(`${candidatePath}-wal`, "候选 WAL");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const legacy = !isContentlessV6(source);
  if (!legacy) {
    source.close();
    throw new Error("源数据库已经是 contentless FTS v6，无需重复迁移。 ");
  }
  quickCheck(source, "源数据库");
  const candidate = new DatabaseSync(candidatePath);
  try {
    candidate.exec("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA foreign_keys=OFF;");
    schema(candidate);
    candidate.exec("BEGIN IMMEDIATE");
    for (const [table, columns] of regularTables) copyRows(source, candidate, table, columns);
    copyContentItems(source, candidate);
    candidate.prepare(`UPDATE novels SET index_format_version = ?`).run(TARGET_VERSION);

    const insertFull = candidate.prepare("INSERT INTO content_fts(rowid,title,content) VALUES (?,?,?)");
    let fullCount = 0;
    const documents = source.prepare(`SELECT content_items.rowid AS _rowid,content_items.title,
      CASE content_items.kind WHEN 'chapter' THEN chapters.content ELSE content_items.content END AS content
      FROM content_items LEFT JOIN chapters ON chapters.id = content_items.chapter_id AND chapters.entry_id = content_items.entry_id
      ORDER BY content_items.rowid`);
    for (const row of documents.iterate()) {
      insertFull.run(row._rowid, row.title, row.content);
      fullCount += 1;
      if (fullCount % 5_000 === 0) console.log(`migration_progress table=content_fts rows=${fullCount}`);
    }
    console.log(`migration_table table=content_fts rows=${fullCount}`);

    const insertShort = candidate.prepare("INSERT INTO content_short_fts(rowid,tokens) VALUES (?,?)");
    let shortCount = 0;
    for (const row of source.prepare("SELECT rowid AS _rowid,tokens FROM content_short_fts ORDER BY rowid").iterate()) {
      insertShort.run(row._rowid, row.tokens);
      shortCount += 1;
      if (shortCount % 5_000 === 0) console.log(`migration_progress table=content_short_fts rows=${shortCount}`);
    }
    console.log(`migration_table table=content_short_fts rows=${shortCount}`);
    candidate.exec(`
      CREATE INDEX chapters_entry_order ON chapters(entry_id, ordinal);
      CREATE INDEX content_items_entry ON content_items(entry_id);
      PRAGMA user_version=${TARGET_VERSION};
      COMMIT;
    `);
    candidate.exec("VACUUM;");
    candidate.exec("PRAGMA foreign_keys=ON;");
    const counts = validateEquivalent(source, candidate);
    candidate.close();
    source.close();
    await chmod(candidatePath, 0o600);
    const sourceInfo = await stat(sourcePath);
    const candidateInfo = await stat(candidatePath);
    const manifest = {
      schemaVersion: 1,
      targetIndexVersion: TARGET_VERSION,
      source: { path: sourcePath, bytes: sourceInfo.size, sha256: await sha256(sourcePath) },
      candidate: { path: candidatePath, bytes: candidateInfo.size, sha256: await sha256(candidatePath) },
      savedBytes: sourceInfo.size - candidateInfo.size,
      savedRatio: Number((1 - candidateInfo.size / sourceInfo.size).toFixed(6)),
      counts,
      validation: {
        quickCheck: "ok",
        foreignKeyCheck: "ok",
        sampledSearches: "equivalent",
        contentlessFts: true,
        canonicalChapterContent: true
      }
    };
    await writeFile(`${candidatePath}.migration.json`, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    console.log(JSON.stringify(manifest));
  } catch (error) {
    try { candidate.exec("ROLLBACK"); } catch {}
    try { candidate.close(); } catch {}
    try { source.close(); } catch {}
    throw error;
  }
}

async function apply(sourcePath, candidatePath, backupPath) {
  await assertRegularFile(sourcePath, "源数据库");
  await assertRegularFile(candidatePath, "候选数据库");
  await assertAbsent(backupPath, "外部回滚备份");
  const source = new DatabaseSync(sourcePath);
  source.exec("PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE);");
  source.close();
  const walSize = await stat(`${sourcePath}-wal`).then(({ size }) => size).catch(() => 0);
  if (walSize !== 0) throw new Error(`源数据库 WAL 尚有 ${walSize} B，拒绝切换。`);
  const sourceRead = new DatabaseSync(sourcePath, { readOnly: true });
  const candidateRead = new DatabaseSync(candidatePath, { readOnly: true });
  const counts = validateEquivalent(sourceRead, candidateRead);
  sourceRead.close();
  candidateRead.close();

  await copyFile(sourcePath, backupPath, 0);
  const [sourceHash, backupHash] = await Promise.all([sha256(sourcePath), sha256(backupPath)]);
  if (sourceHash !== backupHash) {
    await unlink(backupPath).catch(() => undefined);
    throw new Error("外部回滚备份 SHA-256 不一致。 ");
  }
  const localRollback = join(dirname(sourcePath), `${basename(sourcePath)}.v5-local-rollback`);
  await assertAbsent(localRollback, "本地交换回滚文件");
  await rename(sourcePath, localRollback);
  try {
    await rename(candidatePath, sourcePath);
    await chmod(sourcePath, 0o600);
  } catch (error) {
    await rename(localRollback, sourcePath);
    throw error;
  }
  const installed = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    quickCheck(installed, "切换后的数据库");
    if (!isContentlessV6(installed)) throw new Error("切换后的数据库不是 contentless FTS v6。 ");
  } finally {
    installed.close();
  }
  const result = {
    schemaVersion: 1,
    applied: true,
    sourcePath,
    backupPath,
    backupSha256: backupHash,
    localRollback,
    counts
  };
  await writeFile(`${sourcePath}.migration-result.json`, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(JSON.stringify(result));
}

async function main() {
  const values = argumentsFrom(process.argv.slice(2));
  const mode = values.get("mode") ?? "stage";
  const sourcePath = required(values, "source");
  const candidatePath = required(values, "candidate");
  if (mode === "stage") return stage(sourcePath, candidatePath);
  if (mode === "apply") return apply(sourcePath, candidatePath, required(values, "backup"));
  throw new Error(`不支持的迁移模式：${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
