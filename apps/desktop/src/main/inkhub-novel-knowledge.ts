import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { lstat, opendir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inflateRawSync } from "node:zlib";
import type {
  InkHubNovelChapter,
  InkHubNovelChapterCatalog,
  InkHubNovelChapterPage,
  InkHubNovelChapterRepairInput,
  InkHubNovelChapterRepairResult,
  InkHubNovelBatchRepairItem,
  InkHubNovelBatchRepairResult,
  InkHubNovelContextPacket,
  InkHubNovelIndexSummary,
  InkHubNovelQualityIssue,
  InkHubNovelQualityReport,
  InkHubNovelReadingProgress,
  InkHubNovelSearchResponse
} from "@deepwrite/contracts";

const INDEXABLE_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx", ".epub"]);
const TEXT_EXTENSIONS = new Set([".md", ".txt"]);
const MAX_INDEX_FILES = 100_000;
const MAX_INDEX_DIRECTORIES = 50_000;
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_CHAPTER_PAGE = 200_000;
const MIN_DUPLICATE_PARAGRAPH_CHARACTERS = 48;
const CURRENT_INDEX_FORMAT_VERSION = 6;
const STALE_INDEX_WARNING = "全书索引格式已升级（contentless FTS、源文件校验与中文短词检索）：请先执行安全迁移或更新全书索引，再阅读、搜索、质检或 AI 修复。";
const SOURCE_STALE_WARNING = "原稿内容或文件清单已变化：请更新全书索引后再阅读、搜索、质检或 AI 修复。";
const NUMBER_TOKEN = "[0-9零一二三四五六七八九十百千万两〇○]+";
const CHAPTER_HEADING = new RegExp(`^(?:#{1,6}\\s*)?((?:第${NUMBER_TOKEN}卷\\s*)?(?:第${NUMBER_TOKEN}(?:章|回|节|集|幕|篇))[^\\n]{0,160}|chapter\\s+\\d+[^\\n]{0,160})\\s*$`, "iu");
const VOLUME_HEADING = new RegExp(`^(?:#{1,6}\\s*)?((?:第${NUMBER_TOKEN}卷|(?:volume|part)\\s+\\d+)[^\\n]{0,160})\\s*$`, "iu");
const VOLUME_DIRECTORY = new RegExp(`^(?:第${NUMBER_TOKEN}卷|终卷|(?:volume|part)\\s*\\d+)(?:$|[：:._\\-\\s])`, "iu");
const CHAPTER_NUMBER = /(?:第|chapter\s*)([0-9零一二三四五六七八九十百千万两〇○]+)(?:章|回|节|集|幕|篇)?/iu;
const VOLUME_NUMBER = /(?:第|(?:volume|part)\s*)([0-9零一二三四五六七八九十百千万两〇○]+)(?:卷)?/iu;
const MANUSCRIPT_DIRECTORY = /^(?:chapters?|manuscript|drafts?|正文|章节|稿件|文章)$/iu;
const MANUSCRIPT_FILE = /(?:正文|全书|全本|合订|稿件|小说|manuscript|chapters?|draft)/iu;
const REFERENCE_NAME = /(?:设定|大纲|细纲|梗概|报告|质检|复盘|总结|规则|规范|说明|清单|索引|人物|档案|世界观|时间线|素材|备忘|计划|来源|report|outline|setting|index|summary|readme|bible|ledger)/iu;
const NON_MANUSCRIPT_DIRECTORY = /(?:^|[_\-\s])backup(?:$|[_\-\s])|备份|非正文|完稿归档|质检与修复|修复记录|创作辅助系统|记忆系统|进度报告|重复章文件移出|(?:^|[_\-\s])archive(?:$|[_\-\s])|(?:^|[_\-\s])rollback(?:$|[_\-\s])|runtime_and_state|^snapshots?$|^chinese-novelist$/iu;
const IGNORED_DIRECTORIES = new Set([".git", ".svn", ".codex", ".trae", ".trae-cn", "node_modules", "dist", "build", "output", "assets"]);

interface IndexedSource {
  relativePath: string;
  extension: string;
  size: number;
  updatedAt: string;
  content: string;
  sourceRevision: string;
  manuscript: boolean;
}

interface SourceManifestItem {
  relativePath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  sourceRevision: string | null;
}

interface ChapterDraft {
  id: string;
  title: string;
  volumeTitle: string | null;
  relativePath: string;
  content: string;
  sourceRevision: string;
  updatedAt: string;
  naturalNumber: number | null;
  sequence: number;
  volumeNaturalNumber: number | null;
  volumeSequence: number;
}

interface NovelRow {
  entry_id: string;
  entry_path_hash: string;
  status: InkHubNovelIndexSummary["status"];
  document_count: number;
  indexed_document_count: number;
  skipped_document_count: number;
  chapter_count: number;
  total_characters: number;
  content_complete: number;
  content_hash: string | null;
  indexed_at: string | null;
  warnings_json: string;
  index_format_version: number;
  source_stale: number;
}

interface SourceManifestRow {
  relative_path: string;
  size: number;
  mtime_ms: number;
  ctime_ms: number;
  source_revision: string | null;
}

interface ChapterRow {
  id: string;
  entry_id: string;
  ordinal: number;
  title: string;
  volume_title: string | null;
  relative_path: string;
  content: string;
  character_count: number;
  source_revision: string;
  updated_at: string;
}

interface ContentRow {
  id: string;
  kind: "chapter" | "reference";
  chapter_id: string | null;
  title: string;
  relative_path: string;
  content: string;
  score?: number;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function shortSearchTokens(value: string): string {
  const tokens = new Set<string>();
  let previous: string | null = null;
  for (const character of value.toLocaleLowerCase("zh-CN")) {
    if (!/[\p{L}\p{M}\p{N}]/u.test(character)) {
      previous = null;
      continue;
    }
    if (previous !== null) tokens.add(`${previous}${character}`);
    previous = character;
  }
  return [...tokens].join(" ");
}

function containsPath(parent: string, candidate: string): boolean {
  const offset = relative(parent, candidate);
  return offset === "" || (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset));
}

function parseChineseNumber(raw: string): number | null {
  if (/^\d+$/u.test(raw)) return Number(raw);
  const normalized = raw.replace(/[两〇○]/gu, (value) => value === "两" ? "二" : "零");
  const digit: Record<string, number> = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const unit: Record<string, number> = { 十: 10, 百: 100, 千: 1_000, 万: 10_000 };
  let section = 0;
  let total = 0;
  let current = 0;
  for (const character of normalized) {
    if (character in digit) {
      current = digit[character]!;
      continue;
    }
    const multiplier = unit[character];
    if (!multiplier) return null;
    if (multiplier === 10_000) {
      total += (section + current) * multiplier;
      section = 0;
      current = 0;
    } else {
      section += (current || 1) * multiplier;
      current = 0;
    }
  }
  return total + section + current;
}

function chapterNumber(title: string): number | null {
  const match = CHAPTER_NUMBER.exec(title);
  return match?.[1] ? parseChineseNumber(match[1]) : null;
}

function volumeNumber(title: string | null): number | null {
  if (!title) return null;
  const match = VOLUME_NUMBER.exec(title);
  return match?.[1] ? parseChineseNumber(match[1]) : null;
}

function titleFromPath(relativePath: string): string {
  return basename(relativePath, extname(relativePath)).replace(/^\d+[._ -]*/u, "").trim() || basename(relativePath);
}

function pathParts(relativePath: string): string[] {
  return relativePath.split(/[\\/]/u).filter(Boolean);
}

function hasNonManuscriptDirectory(relativePath: string): boolean {
  return pathParts(relativePath).slice(0, -1).some((part) => NON_MANUSCRIPT_DIRECTORY.test(part));
}

function isReferencePath(relativePath: string): boolean {
  return hasNonManuscriptDirectory(relativePath) || pathParts(relativePath).some((part) => REFERENCE_NAME.test(part));
}

function isManuscriptPath(relativePath: string): boolean {
  if (isReferencePath(relativePath)) return false;
  const parts = pathParts(relativePath);
  if (parts.slice(0, -1).some((part) => MANUSCRIPT_DIRECTORY.test(part))) return true;
  const title = titleFromPath(relativePath);
  return MANUSCRIPT_FILE.test(title) || CHAPTER_HEADING.test(title);
}

function isStructuredManuscriptPath(relativePath: string): boolean {
  return pathParts(relativePath).slice(0, -1).some((part) =>
    MANUSCRIPT_DIRECTORY.test(part) || VOLUME_DIRECTORY.test(part)
  );
}

function manuscriptCohort(relativePath: string): string {
  return pathParts(relativePath).slice(0, -1)[0] ?? "__root__";
}

function selectCanonicalManuscripts(sources: IndexedSource[]): number {
  const candidates = sources.filter((source) => source.manuscript);
  if (candidates.length <= 1) return 0;
  const structured = candidates.filter((source) => isStructuredManuscriptPath(source.relativePath));
  let selected = new Set<IndexedSource>();
  if (structured.length) {
    selected = new Set(structured);
  } else {
    const cohorts = new Map<string, IndexedSource[]>();
    for (const source of candidates) {
      const key = manuscriptCohort(source.relativePath);
      const cohort = cohorts.get(key) ?? [];
      cohort.push(source);
      cohorts.set(key, cohort);
    }
    const preferred = [...cohorts.entries()].sort((left, right) => {
      if (left[1].length !== right[1].length) return right[1].length - left[1].length;
      const leftUpdated = Math.max(...left[1].map((source) => Date.parse(source.updatedAt) || 0));
      const rightUpdated = Math.max(...right[1].map((source) => Date.parse(source.updatedAt) || 0));
      if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;
      if (left[0] === "__root__") return -1;
      if (right[0] === "__root__") return 1;
      return left[0].localeCompare(right[0], "zh-CN", { numeric: true });
    })[0]?.[1] ?? [];
    selected = new Set(preferred);
  }
  let rerouted = 0;
  for (const source of candidates) {
    if (selected.has(source)) continue;
    source.manuscript = false;
    rerouted += 1;
  }
  return rerouted;
}

function normalizeChapterTitle(line: string, fallback: string): string {
  return line.replace(/^#{1,6}\s*/u, "").trim().slice(0, 500) || fallback;
}

function normalizeVolumeTitle(line: string): string {
  return line.replace(/^#{1,6}\s*/u, "").trim().slice(0, 500);
}

function volumeTitleFromPath(relativePath: string): string | null {
  const directories = relativePath.split(sep).slice(0, -1);
  const explicit = directories.find((part) => /(?:卷|volume|part)/iu.test(part));
  if (explicit) return explicit.slice(0, 500);
  const meaningful = directories.filter((part) => !MANUSCRIPT_DIRECTORY.test(part));
  return meaningful.at(-1)?.slice(0, 500) ?? null;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/giu, (match, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[named?.toLowerCase() ?? ""] ?? match;
  });
}

function stripMarkup(value: string, kind: "docx" | "html"): string {
  const withBreaks = kind === "docx"
    ? value
        .replace(/<w:tab\b[^>]*\/?\s*>/giu, "\t")
        .replace(/<w:br\b[^>]*\/?\s*>/giu, "\n")
        .replace(/<\/w:p\s*>/giu, "\n\n")
    : value
        .replace(/<(?:br|hr)\b[^>]*\/?\s*>/giu, "\n")
        .replace(/<\/(?:p|div|section|article|h[1-6]|li|blockquote|tr)\s*>/giu, "\n\n");
  return decodeXmlEntities(withBreaks.replace(/<[^>]+>/gu, ""))
    .replace(/[\t ]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function zipEntries(buffer: Buffer): Map<string, Buffer> {
  const minimumEocd = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minimumEocd; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("归档文件缺少 ZIP 中心目录。");
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  let centralOffset = buffer.readUInt32LE(eocd + 16);
  if (count > 20_000 || centralOffset + centralSize > buffer.length) throw new Error("归档文件的 ZIP 目录超出安全上限。");
  const entries = new Map<string, Buffer>();
  let extractedBytes = 0;
  for (let index = 0; index < count; index += 1) {
    if (centralOffset + 46 > buffer.length || buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("归档文件的 ZIP 目录已损坏。");
    const flags = buffer.readUInt16LE(centralOffset + 8);
    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
    const nameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const nameStart = centralOffset + 46;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString((flags & 0x0800) !== 0 ? "utf8" : "latin1").replace(/\\/gu, "/");
    if (!name || name.startsWith("/") || name.split("/").includes("..") || name.includes("\0")) throw new Error("归档文件含不安全路径。");
    centralOffset = nameStart + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if ((flags & 0x0001) !== 0 || ![0, 8].includes(method)) throw new Error("归档文件使用了不支持的加密或压缩方式。");
    if (uncompressedSize > MAX_FILE_BYTES || extractedBytes + uncompressedSize > MAX_FILE_BYTES * 2) throw new Error("归档文件解压后超出安全上限。");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("归档文件的 ZIP 本地条目已损坏。");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error("归档文件数据超出 ZIP 边界。");
    const compressed = buffer.subarray(dataStart, dataEnd);
    const content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: uncompressedSize + 1 });
    if (content.length !== uncompressedSize) throw new Error("归档文件解压长度与目录不一致。");
    extractedBytes += content.length;
    entries.set(name, content);
  }
  return entries;
}

async function extractDocumentContent(extension: string, bytes: Buffer): Promise<string> {
  if (TEXT_EXTENSIONS.has(extension)) return bytes.toString("utf8");
  if (extension === ".docx") {
    const document = zipEntries(bytes).get("word/document.xml");
    if (!document) throw new Error("DOCX 缺少 word/document.xml。");
    return stripMarkup(document.toString("utf8"), "docx");
  }
  if (extension === ".epub") {
    const entries = zipEntries(bytes);
    const pages = [...entries.entries()]
      .filter(([name]) => /\.(?:xhtml|html|htm)$/iu.test(name) && !/(?:^|\/)(?:nav|toc|cover|title)(?:[._-]|$)/iu.test(name))
      .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }));
    if (!pages.length) throw new Error("EPUB 中没有可读的 HTML 正文。");
    return pages.map(([, page]) => stripMarkup(page.toString("utf8"), "html")).filter(Boolean).join("\n\n");
  }
  if (extension === ".pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const document = await task.promise;
    try {
      if (document.numPages > 20_000) throw new Error("PDF 页数超出全文索引安全上限。");
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim());
        page.cleanup();
      }
      return pages.join("\n\n");
    } finally {
      await task.destroy();
    }
  }
  throw new Error(`不支持的全文格式：${extension}`);
}

function splitChapters(source: IndexedSource, entryId: string, initialSequence: number): ChapterDraft[] {
  const lines = source.content.split(/\r?\n/u);
  const headings: Array<{ index: number; title: string; volumeTitle: string | null; volumeSequence: number }> = [];
  let activeVolumeTitle = volumeTitleFromPath(source.relativePath);
  let activeVolumeSequence = initialSequence;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    const volumeMatch = VOLUME_HEADING.exec(line);
    const chapterMatch = CHAPTER_HEADING.exec(line);
    if (volumeMatch?.[1] && !chapterMatch?.[1]) {
      activeVolumeTitle = normalizeVolumeTitle(volumeMatch[1]);
      activeVolumeSequence = initialSequence + headings.length;
      continue;
    }
    if (chapterMatch?.[1]) {
      const inlineVolume = VOLUME_HEADING.exec(chapterMatch[1].replace(new RegExp(`(第${NUMBER_TOKEN}(?:章|回|节|集|幕|篇)).*$`, "u"), "").trim());
      if (inlineVolume?.[1]) activeVolumeTitle = normalizeVolumeTitle(inlineVolume[1]);
      headings.push({
        index,
        title: normalizeChapterTitle(chapterMatch[1].replace(new RegExp(`^(第${NUMBER_TOKEN}卷)\\s*`, "u"), ""), titleFromPath(source.relativePath)),
        volumeTitle: activeVolumeTitle,
        volumeSequence: activeVolumeSequence
      });
    }
  }
  if (!headings.length) {
    const title = titleFromPath(source.relativePath);
    return [{
      id: sha256(`${entryId}:${source.relativePath}:chapter:0`).slice(0, 32),
      title,
      volumeTitle: activeVolumeTitle,
      relativePath: source.relativePath,
      content: source.content,
      sourceRevision: source.sourceRevision,
      updatedAt: source.updatedAt,
      naturalNumber: chapterNumber(title),
      sequence: initialSequence,
      volumeNaturalNumber: volumeNumber(activeVolumeTitle),
      volumeSequence: initialSequence
    }];
  }
  return headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? lines.length;
    const content = lines.slice(heading.index, end).join("\n").trimEnd();
    return {
      id: sha256(`${entryId}:${source.relativePath}:chapter:${index}`).slice(0, 32),
      title: heading.title,
      volumeTitle: heading.volumeTitle,
      relativePath: source.relativePath,
      content,
      sourceRevision: source.sourceRevision,
      updatedAt: source.updatedAt,
      naturalNumber: chapterNumber(heading.title),
      sequence: initialSequence + index,
      volumeNaturalNumber: volumeNumber(heading.volumeTitle),
      volumeSequence: heading.volumeSequence
    };
  });
}

function safeWarnings(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 200) : [];
  } catch {
    return ["索引警告记录损坏，请重建全书索引。"];
  }
}

function staleWarning(summary: InkHubNovelIndexSummary): string {
  return summary.warnings[0] ?? STALE_INDEX_WARNING;
}

function chapterOrderGapIssues(chapters: readonly ChapterRow[]): InkHubNovelQualityIssue[] {
  const byVolume = new Map<string, ChapterRow[]>();
  for (const chapter of chapters) {
    const key = chapter.volume_title ?? "";
    const grouped = byVolume.get(key) ?? [];
    grouped.push(chapter);
    byVolume.set(key, grouped);
  }
  const issues: InkHubNovelQualityIssue[] = [];
  for (const [volumeTitle, volumeChapters] of byVolume) {
    const numbered = volumeChapters
      .map((chapter) => ({ chapter, number: chapterNumber(chapter.title) }))
      .filter((item): item is { chapter: ChapterRow; number: number } => item.number !== null)
      .sort((left, right) => left.number - right.number || left.chapter.ordinal - right.chapter.ordinal);
    let previous = numbered[0];
    for (let index = 1; index < numbered.length; index += 1) {
      const current = numbered[index]!;
      if (!previous || current.number === previous.number) {
        previous = current;
        continue;
      }
      if (current.number > previous.number + 1) {
        const missingStart = previous.number + 1;
        const missingEnd = current.number - 1;
        const missing = missingStart === missingEnd
          ? `第 ${missingStart} 章`
          : `第 ${missingStart}–${missingEnd} 章`;
        const scope = volumeTitle || "未分卷正文";
        issues.push({
          id: `order-gap:${sha256(`${volumeTitle}:${previous.number}:${current.number}`).slice(0, 20)}`,
          rule: "chapter-order-gap",
          severity: "warning",
          title: `${scope}：章节序号存在缺口`,
          detail: `卷内章节序号从第 ${previous.number} 章跳到第 ${current.number} 章，缺少${missing}。请核对是否为缺章、误编号或有意留白。`,
          chapterIds: [previous.chapter.id, current.chapter.id]
        });
      }
      previous = current;
      if (issues.length >= 5_000) return issues;
    }
  }
  return issues;
}

async function discoverIndexCandidates(entryPath: string): Promise<{
  root: string;
  candidates: string[];
  complete: boolean;
  warnings: string[];
}> {
  const rootInfo = await lstat(entryPath);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("小说来源必须是本地真实目录。");
  const root = await realpath(entryPath);
  const pending = [root];
  const candidates: string[] = [];
  const warnings: string[] = [];
  let directories = 0;
  let complete = true;
  while (pending.length) {
    const directoryPath = pending.pop()!;
    directories += 1;
    if (directories > MAX_INDEX_DIRECTORIES) {
      complete = false;
      warnings.push(`目录数超过 ${MAX_INDEX_DIRECTORIES}，已停止继续扫描。`);
      break;
    }
    const directory = await opendir(directoryPath);
    for await (const item of directory) {
      if (item.isSymbolicLink()) continue;
      const absolute = join(directoryPath, item.name);
      if (item.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(item.name) && !item.name.startsWith(".")) pending.push(absolute);
        continue;
      }
      if (!item.isFile() || !INDEXABLE_EXTENSIONS.has(extname(item.name).toLowerCase())) continue;
      const normalized = item.name.toLowerCase();
      if (normalized === "agents.md" || normalized === "skill.md") continue;
      candidates.push(absolute);
      if (candidates.length >= MAX_INDEX_FILES) {
        complete = false;
        warnings.push(`文档数超过 ${MAX_INDEX_FILES}，已停止继续扫描。`);
        break;
      }
    }
    if (!complete) break;
  }
  candidates.sort((left, right) => relative(root, left).localeCompare(relative(root, right), "zh-CN", { numeric: true }));
  return { root, candidates, complete, warnings };
}

export class InkHubNovelKnowledgeService {
  private readonly database: DatabaseSync;
  private readonly indexDirectory: string;
  private repairChain: Promise<void> = Promise.resolve();

  constructor(indexDirectory: string) {
    this.indexDirectory = indexDirectory;
    mkdirSync(indexDirectory, { recursive: true, mode: 0o700 });
    const databasePath = join(indexDirectory, "knowledge.sqlite");
    this.database = new DatabaseSync(databasePath);
    chmodSync(databasePath, 0o600);
    this.database.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA foreign_keys=ON;
      PRAGMA wal_autocheckpoint=1000;
      PRAGMA journal_size_limit=67108864;
    `);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS novels (
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
        index_format_version INTEGER NOT NULL DEFAULT ${CURRENT_INDEX_FORMAT_VERSION},
        source_stale INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS source_manifest (
        entry_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms REAL NOT NULL,
        ctime_ms REAL NOT NULL,
        source_revision TEXT,
        PRIMARY KEY(entry_id, relative_path),
        FOREIGN KEY(entry_id) REFERENCES novels(entry_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS chapters (
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
      CREATE INDEX IF NOT EXISTS chapters_entry_order ON chapters(entry_id, ordinal);
      CREATE TABLE IF NOT EXISTS content_items (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        chapter_id TEXT,
        title TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        content TEXT NOT NULL,
        FOREIGN KEY(entry_id) REFERENCES novels(entry_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS content_items_entry ON content_items(entry_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
        title,
        content,
        content='',
        contentless_delete=1,
        tokenize='trigram'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS content_short_fts USING fts5(
        tokens,
        content='',
        contentless_delete=1,
        tokenize='unicode61 remove_diacritics 0'
      );
      CREATE TABLE IF NOT EXISTS reading_progress (
        entry_id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        character_offset INTEGER NOT NULL,
        scroll_fraction REAL NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const novelColumns = this.database.prepare("PRAGMA table_info(novels)").all() as Array<{ name: string }>;
    if (!novelColumns.some((column) => column.name === "index_format_version")) {
      this.database.exec("ALTER TABLE novels ADD COLUMN index_format_version INTEGER NOT NULL DEFAULT 1;");
    }
    if (!novelColumns.some((column) => column.name === "source_stale")) {
      this.database.exec("ALTER TABLE novels ADD COLUMN source_stale INTEGER NOT NULL DEFAULT 0;");
    }
    const fullTextSchema = this.database.prepare("SELECT sql FROM sqlite_master WHERE name = 'content_fts'").get() as { sql?: string } | undefined;
    const shortTextSchema = this.database.prepare("SELECT sql FROM sqlite_master WHERE name = 'content_short_fts'").get() as { sql?: string } | undefined;
    if (!/content\s*=\s*''/iu.test(fullTextSchema?.sql ?? "") || !/content\s*=\s*''/iu.test(shortTextSchema?.sql ?? "")) {
      this.database.close();
      throw new Error("检测到旧版全文索引。为保护原稿和阅读进度，请先执行墨枢的 v6 旁路迁移；应用不会直接改写旧库。");
    }
    const databaseVersion = this.database.prepare("PRAGMA user_version").get() as { user_version: number };
    if (databaseVersion.user_version !== CURRENT_INDEX_FORMAT_VERSION) {
      this.database.exec(`PRAGMA user_version=${CURRENT_INDEX_FORMAT_VERSION};`);
    }
  }

  private async scan(entryPath: string): Promise<{
    sources: IndexedSource[];
    manifest: SourceManifestItem[];
    documentCount: number;
    skipped: number;
    complete: boolean;
    warnings: string[];
  }> {
    const discovered = await discoverIndexCandidates(entryPath);
    const { root, candidates } = discovered;
    const warnings = [...discovered.warnings];
    let complete = discovered.complete;
    const sources: IndexedSource[] = [];
    const manifest: SourceManifestItem[] = [];
    let skipped = 0;
    let totalBytes = 0;
    for (const absolute of candidates) {
      const info = await stat(absolute);
      const relativePath = relative(root, absolute);
      const extension = extname(absolute).toLowerCase();
      const manifestItem: SourceManifestItem = {
        relativePath,
        size: info.size,
        mtimeMs: info.mtimeMs,
        ctimeMs: info.ctimeMs,
        sourceRevision: null
      };
      manifest.push(manifestItem);
      if (info.size > MAX_FILE_BYTES || totalBytes + info.size > MAX_TOTAL_BYTES) {
        skipped += 1;
        complete = false;
        warnings.push(`${relativePath} 超过全文索引安全预算，未纳入内容匹配。`);
        continue;
      }
      const canonical = await realpath(absolute);
      if (!containsPath(root, canonical)) {
        skipped += 1;
        complete = false;
        warnings.push(`${relativePath} 解析后超出小说目录，已跳过。`);
        continue;
      }
      const bytes = await readFile(canonical);
      const sourceRevision = sha256(bytes);
      manifestItem.sourceRevision = sourceRevision;
      totalBytes += bytes.byteLength;
      let content: string;
      try {
        content = (await extractDocumentContent(extension, bytes)).replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
      } catch (error: unknown) {
        skipped += 1;
        complete = false;
        warnings.push(`${relativePath} 全文解析失败：${error instanceof Error ? error.message : "未知错误"}`.slice(0, 1_000));
        continue;
      }
      sources.push({
        relativePath,
        extension,
        size: info.size,
        updatedAt: info.mtime.toISOString(),
        content,
        sourceRevision,
        manuscript: isManuscriptPath(relativePath)
      });
    }
    if (sources.length === 1 && !sources[0]!.manuscript) sources[0]!.manuscript = true;
    const rerouted = selectCanonicalManuscripts(sources);
    if (rerouted > 0) {
      warnings.push(`已将 ${rerouted} 个备份、归档或替代稿作为全文资料索引，不纳入章节目录、质检与 AI 修复。`);
    }
    return { sources, manifest, documentCount: candidates.length, skipped, complete, warnings };
  }

  async build(input: { entryId: string; title: string; entryPath: string }): Promise<InkHubNovelIndexSummary> {
    const scanned = await this.scan(input.entryPath);
    const canonicalEntryPath = await realpath(input.entryPath);
    const drafts: ChapterDraft[] = [];
    let sequence = 0;
    for (const source of scanned.sources.filter((item) => item.manuscript)) {
      const split = splitChapters(source, input.entryId, sequence);
      drafts.push(...split);
      sequence += Math.max(1, split.length);
    }
    drafts.sort((left, right) => {
      if (left.volumeTitle !== right.volumeTitle) {
        if (left.volumeNaturalNumber !== null && right.volumeNaturalNumber !== null && left.volumeNaturalNumber !== right.volumeNaturalNumber) {
          return left.volumeNaturalNumber - right.volumeNaturalNumber;
        }
        if (left.volumeNaturalNumber !== null && right.volumeNaturalNumber === null) return -1;
        if (left.volumeNaturalNumber === null && right.volumeNaturalNumber !== null) return 1;
        if (left.volumeSequence !== right.volumeSequence) return left.volumeSequence - right.volumeSequence;
        return (left.volumeTitle ?? "").localeCompare(right.volumeTitle ?? "", "zh-CN", { numeric: true });
      }
      if (left.naturalNumber !== null && right.naturalNumber !== null && left.naturalNumber !== right.naturalNumber) {
        return left.naturalNumber - right.naturalNumber;
      }
      if (left.naturalNumber !== null && right.naturalNumber === null) return -1;
      if (left.naturalNumber === null && right.naturalNumber !== null) return 1;
      const leftCompilation = /(?:合订|全书|全本)/u.test(left.relativePath) ? 0 : 1;
      const rightCompilation = /(?:合订|全书|全本)/u.test(right.relativePath) ? 0 : 1;
      if (leftCompilation !== rightCompilation) return leftCompilation - rightCompilation;
      return left.sequence - right.sequence || left.relativePath.localeCompare(right.relativePath, "zh-CN", { numeric: true });
    });
    const indexedAt = new Date().toISOString();
    const contentHash = sha256([
      `index-format:${CURRENT_INDEX_FORMAT_VERSION}`,
      ...scanned.sources.map((source) => `${source.relativePath}:${source.sourceRevision}`)
    ].join("\n"));
    const totalCharacters = scanned.sources.reduce((total, source) => total + source.content.length, 0);
    const status: InkHubNovelIndexSummary["status"] = scanned.complete ? "ready" : "partial";
    const write = this.database.prepare(`INSERT OR REPLACE INTO novels
      (entry_id,title,entry_path_hash,status,document_count,indexed_document_count,skipped_document_count,chapter_count,total_characters,content_complete,content_hash,indexed_at,warnings_json,index_format_version,source_stale)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM content_fts WHERE rowid IN (SELECT rowid FROM content_items WHERE entry_id = ?)").run(input.entryId);
      this.database.prepare("DELETE FROM content_short_fts WHERE rowid IN (SELECT rowid FROM content_items WHERE entry_id = ?)").run(input.entryId);
      this.database.prepare("DELETE FROM content_items WHERE entry_id = ?").run(input.entryId);
      this.database.prepare("DELETE FROM chapters WHERE entry_id = ?").run(input.entryId);
      write.run(
        input.entryId, input.title, sha256(canonicalEntryPath), status, scanned.documentCount,
        scanned.sources.length, scanned.skipped, drafts.length, totalCharacters, scanned.complete ? 1 : 0,
        contentHash, indexedAt, JSON.stringify(scanned.warnings), CURRENT_INDEX_FORMAT_VERSION, 0
      );
      const insertManifest = this.database.prepare(`INSERT INTO source_manifest
        (entry_id,relative_path,size,mtime_ms,ctime_ms,source_revision) VALUES (?,?,?,?,?,?)`);
      for (const item of scanned.manifest) {
        insertManifest.run(input.entryId, item.relativePath, item.size, item.mtimeMs, item.ctimeMs, item.sourceRevision);
      }
      const insertChapter = this.database.prepare(`INSERT INTO chapters
        (id,entry_id,ordinal,title,volume_title,relative_path,content,character_count,source_revision,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
      const insertContent = this.database.prepare(`INSERT INTO content_items
        (id,entry_id,kind,chapter_id,title,relative_path,content) VALUES (?,?,?,?,?,?,?)`);
      const insertFts = this.database.prepare("INSERT INTO content_fts (rowid,title,content) VALUES (?,?,?)");
      const insertShortFts = this.database.prepare("INSERT INTO content_short_fts (rowid,tokens) VALUES (?,?)");
      for (let ordinal = 0; ordinal < drafts.length; ordinal += 1) {
        const chapter = drafts[ordinal]!;
        insertChapter.run(chapter.id, input.entryId, ordinal, chapter.title, chapter.volumeTitle, chapter.relativePath, chapter.content, chapter.content.length, chapter.sourceRevision, chapter.updatedAt);
        const id = `chapter:${chapter.id}`;
        // The canonical chapter text already lives in `chapters` and FTS keeps
        // its own searchable copy. Keep only metadata here to avoid a third
        // full manuscript copy in the regular SQLite tables.
        const contentItem = insertContent.run(id, input.entryId, "chapter", chapter.id, chapter.title, chapter.relativePath, "");
        insertFts.run(contentItem.lastInsertRowid, chapter.title, chapter.content);
        const tokens = shortSearchTokens(chapter.content);
        if (tokens) insertShortFts.run(contentItem.lastInsertRowid, tokens);
      }
      for (const source of scanned.sources.filter((item) => !item.manuscript)) {
        const id = `reference:${sha256(`${input.entryId}:${source.relativePath}`).slice(0, 32)}`;
        const title = titleFromPath(source.relativePath);
        const contentItem = insertContent.run(id, input.entryId, "reference", null, title, source.relativePath, source.content);
        insertFts.run(contentItem.lastInsertRowid, title, source.content);
        const tokens = shortSearchTokens(source.content);
        if (tokens) insertShortFts.run(contentItem.lastInsertRowid, tokens);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.getSummary(input.entryId);
  }

  async refreshSourceFreshness(entryId: string, entryPath: string): Promise<InkHubNovelIndexSummary> {
    const row = this.database.prepare("SELECT * FROM novels WHERE entry_id = ?").get(entryId) as unknown as NovelRow | undefined;
    if (!row || row.index_format_version < CURRENT_INDEX_FORMAT_VERSION) return this.getSummary(entryId);
    const discovered = await discoverIndexCandidates(entryPath);
    if (row.entry_path_hash !== sha256(discovered.root)) {
      this.database.prepare("UPDATE novels SET source_stale = 1 WHERE entry_id = ?").run(entryId);
      return this.getSummary(entryId);
    }

    const stored = this.database.prepare(`SELECT relative_path,size,mtime_ms,ctime_ms,source_revision
      FROM source_manifest WHERE entry_id = ? ORDER BY relative_path`).all(entryId) as unknown as SourceManifestRow[];
    if (!discovered.complete || stored.length !== discovered.candidates.length) {
      this.database.prepare("UPDATE novels SET source_stale = 1 WHERE entry_id = ?").run(entryId);
      return this.getSummary(entryId);
    }

    const storedByPath = new Map(stored.map((item) => [item.relative_path, item]));
    const changedMetadata: SourceManifestItem[] = [];
    let stale = false;
    for (const absolute of discovered.candidates) {
      const relativePath = relative(discovered.root, absolute);
      const previous = storedByPath.get(relativePath);
      if (!previous) {
        stale = true;
        break;
      }
      const info = await stat(absolute);
      const metadataChanged = previous.size !== info.size || previous.mtime_ms !== info.mtimeMs || previous.ctime_ms !== info.ctimeMs;
      if (metadataChanged) {
        if (!previous.source_revision || info.size > MAX_FILE_BYTES) {
          stale = true;
          break;
        }
        const canonical = await realpath(absolute);
        if (!containsPath(discovered.root, canonical)) {
          stale = true;
          break;
        }
        const bytes = await readFile(canonical);
        if (sha256(bytes) !== previous.source_revision) {
          stale = true;
          break;
        }
      }
      if (metadataChanged) {
        changedMetadata.push({
          relativePath,
          size: info.size,
          mtimeMs: info.mtimeMs,
          ctimeMs: info.ctimeMs,
          sourceRevision: previous.source_revision
        });
      }
    }

    const staleValue = stale ? 1 : 0;
    const staleStateChanged = row.source_stale !== staleValue;
    // A read-only freshness check used to UPDATE every manifest row, even when
    // no source changed. Large libraries could therefore write gigabytes to
    // the WAL while merely opening the library. Leave SQLite completely
    // untouched when both the source state and metadata are unchanged.
    if (!staleStateChanged && (stale || changedMetadata.length === 0)) {
      return this.getSummary(entryId);
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (staleStateChanged) {
        this.database.prepare("UPDATE novels SET source_stale = ? WHERE entry_id = ?").run(staleValue, entryId);
      }
      if (!stale) {
        const updateManifest = this.database.prepare(`UPDATE source_manifest
          SET size = ?, mtime_ms = ?, ctime_ms = ? WHERE entry_id = ? AND relative_path = ?`);
        for (const item of changedMetadata) {
          updateManifest.run(item.size, item.mtimeMs, item.ctimeMs, entryId, item.relativePath);
        }
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.getSummary(entryId);
  }

  getSummary(entryId: string): InkHubNovelIndexSummary {
    const row = this.database.prepare("SELECT * FROM novels WHERE entry_id = ?").get(entryId) as unknown as NovelRow | undefined;
    if (!row) {
      return {
        entryId, status: "not-indexed", documentCount: 0, indexedDocumentCount: 0,
        skippedDocumentCount: 0, chapterCount: 0, totalCharacters: 0, contentComplete: false,
        contentHash: null, indexedAt: null, warnings: []
      };
    }
    if (row.index_format_version < CURRENT_INDEX_FORMAT_VERSION) {
      return {
        entryId: row.entry_id,
        status: "stale",
        documentCount: row.document_count,
        indexedDocumentCount: row.indexed_document_count,
        skippedDocumentCount: row.skipped_document_count,
        chapterCount: row.chapter_count,
        totalCharacters: row.total_characters,
        contentComplete: false,
        contentHash: row.content_hash,
        indexedAt: row.indexed_at,
        warnings: [STALE_INDEX_WARNING, ...safeWarnings(row.warnings_json)].slice(0, 200)
      };
    }
    if (row.source_stale === 1) {
      return {
        entryId: row.entry_id,
        status: "stale",
        documentCount: row.document_count,
        indexedDocumentCount: row.indexed_document_count,
        skippedDocumentCount: row.skipped_document_count,
        chapterCount: row.chapter_count,
        totalCharacters: row.total_characters,
        contentComplete: false,
        contentHash: row.content_hash,
        indexedAt: row.indexed_at,
        warnings: [SOURCE_STALE_WARNING, ...safeWarnings(row.warnings_json)].slice(0, 200)
      };
    }
    return {
      entryId: row.entry_id,
      status: row.status,
      documentCount: row.document_count,
      indexedDocumentCount: row.indexed_document_count,
      skippedDocumentCount: row.skipped_document_count,
      chapterCount: row.chapter_count,
      totalCharacters: row.total_characters,
      contentComplete: row.content_complete === 1,
      contentHash: row.content_hash,
      indexedAt: row.indexed_at,
      warnings: safeWarnings(row.warnings_json)
    };
  }

  private chapterFromRow(row: ChapterRow): InkHubNovelChapter {
    return {
      id: row.id,
      entryId: row.entry_id,
      ordinal: row.ordinal,
      title: row.title,
      volumeTitle: row.volume_title,
      relativePath: row.relative_path,
      characterCount: row.character_count,
      sourceRevision: row.source_revision,
      updatedAt: row.updated_at
    };
  }

  listChapters(entryId: string, offset = 0, limit = 200): InkHubNovelChapterCatalog {
    const safeOffset = Math.max(0, Math.trunc(offset));
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const summary = this.getSummary(entryId);
    if (summary.status === "not-indexed") throw new Error("请先构建这部作品的全书索引。");
    if (summary.status === "stale") throw new Error(staleWarning(summary));
    const rows = this.database.prepare("SELECT * FROM chapters WHERE entry_id = ? ORDER BY ordinal LIMIT ? OFFSET ?").all(entryId, safeLimit, safeOffset) as unknown as ChapterRow[];
    const total = summary.chapterCount;
    const next = safeOffset + rows.length;
    return { summary, chapters: rows.map((row) => this.chapterFromRow(row)), offset: safeOffset, total, nextOffset: next < total ? next : null };
  }

  readChapter(entryId: string, chapterId: string, offset = 0, limit = 100_000): InkHubNovelChapterPage {
    const summary = this.getSummary(entryId);
    if (summary.status === "stale") throw new Error(staleWarning(summary));
    const row = this.database.prepare("SELECT * FROM chapters WHERE entry_id = ? AND id = ?").get(entryId, chapterId) as unknown as ChapterRow | undefined;
    if (!row) throw new Error("章节不存在，或全书索引已变化。");
    const safeStart = Math.max(0, Math.min(row.character_count, Math.trunc(offset)));
    const safeLimit = Math.max(1, Math.min(MAX_CHAPTER_PAGE, Math.trunc(limit)));
    const end = Math.min(row.character_count, safeStart + safeLimit);
    const neighbors = this.database.prepare(`SELECT
      (SELECT id FROM chapters WHERE entry_id = ? AND ordinal = ?) AS previous_id,
      (SELECT id FROM chapters WHERE entry_id = ? AND ordinal = ?) AS next_id`).get(entryId, row.ordinal - 1, entryId, row.ordinal + 1) as unknown as { previous_id: string | null; next_id: string | null };
    return {
      entryId,
      chapterId,
      title: row.title,
      content: row.content.slice(safeStart, end),
      startOffset: safeStart,
      endOffset: end,
      totalCharacters: row.character_count,
      nextOffset: end < row.character_count ? end : null,
      previousChapterId: neighbors.previous_id,
      nextChapterId: neighbors.next_id,
      sourceRevision: row.source_revision,
      readOnly: true
    };
  }

  search(entryId: string, rawQuery: string, limit = 20): InkHubNovelSearchResponse {
    const summary = this.getSummary(entryId);
    if (summary.status === "stale") throw new Error(staleWarning(summary));
    const query = rawQuery.trim().slice(0, 200);
    if (!query) throw new Error("请输入要在全书中匹配的文字。");
    const queryCharacters = Array.from(query);
    if (queryCharacters.length < 2) throw new Error("为了避免大型小说全表扫描，请至少输入 2 个字。");
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const rows = queryCharacters.length >= 3
      ? this.database.prepare(`SELECT content_items.id,content_items.kind,content_items.chapter_id,
          content_items.title,content_items.relative_path,
          CASE content_items.kind WHEN 'chapter' THEN chapters.content ELSE content_items.content END AS content,
          bm25(content_fts, 3.0, 1.0) AS score
          FROM content_fts JOIN content_items ON content_items.rowid = content_fts.rowid
          LEFT JOIN chapters ON chapters.id = content_items.chapter_id AND chapters.entry_id = content_items.entry_id
          WHERE content_fts MATCH ? AND content_items.entry_id = ?
          ORDER BY score, CASE content_items.kind WHEN 'chapter' THEN 0 ELSE 1 END,
            content_items.relative_path LIMIT ?`)
          .all(`content : "${query.replace(/"/gu, '""')}"`, entryId, safeLimit) as unknown as ContentRow[]
      : this.database.prepare(`SELECT content_items.id,content_items.kind,content_items.chapter_id,
          content_items.title,content_items.relative_path,
          CASE content_items.kind WHEN 'chapter' THEN chapters.content ELSE content_items.content END AS content,
          bm25(content_short_fts, 1.0) AS score
          FROM content_short_fts JOIN content_items ON content_items.rowid = content_short_fts.rowid
          LEFT JOIN chapters ON chapters.id = content_items.chapter_id AND chapters.entry_id = content_items.entry_id
          WHERE content_short_fts MATCH ? AND content_items.entry_id = ?
          ORDER BY score, CASE content_items.kind WHEN 'chapter' THEN 0 ELSE 1 END,
            content_items.relative_path LIMIT ?`)
          .all(`tokens : "${query.toLocaleLowerCase("zh-CN").replace(/"/gu, '""')}"`, entryId, safeLimit) as unknown as ContentRow[];
    return {
      entryId,
      query,
      results: rows.map((row) => {
        const contentPosition = row.content.toLocaleLowerCase("zh-CN").indexOf(query.toLocaleLowerCase("zh-CN"));
        const position = contentPosition;
        const matchLength = query.length;
        const start = Math.max(0, position - 180);
        const end = Math.min(row.content.length, position + matchLength + 320);
        return {
          id: row.id,
          kind: row.kind,
          title: row.title,
          relativePath: row.relative_path,
          chapterId: row.chapter_id,
          snippet: `${start > 0 ? "…" : ""}${row.content.slice(start, end).replace(/\s+/gu, " ").trim()}${end < row.content.length ? "…" : ""}`.slice(0, 1_200),
          score: Number((-(row.score ?? 0)).toFixed(8)),
          matchStart: position,
          matchEnd: position + matchLength
        };
      })
    };
  }

  runLocalQualityCheck(entryId: string): InkHubNovelQualityReport {
    const coverage = this.getSummary(entryId);
    if (coverage.status === "not-indexed") throw new Error("请先构建全书索引，再执行质检。");
    if (coverage.status === "stale") throw new Error(staleWarning(coverage));
    const chapters = this.database.prepare("SELECT * FROM chapters WHERE entry_id = ? ORDER BY ordinal").all(entryId) as unknown as ChapterRow[];
    const issues: InkHubNovelQualityIssue[] = chapterOrderGapIssues(chapters);
    const paragraphs = new Map<string, Array<{ chapterId: string; title: string }>>();
    for (const chapter of chapters) {
      const plain = chapter.content.replace(/^#{1,6}[^\n]*\n?/u, "").trim();
      if (!plain) {
        issues.push({ id: `empty:${chapter.id}`, rule: "empty-chapter", severity: "error", title: `${chapter.title}：正文为空`, detail: "该章只有标题或空白内容。", chapterIds: [chapter.id] });
      } else if (plain.length < 200) {
        issues.push({ id: `short:${chapter.id}`, rule: "very-short-chapter", severity: "info", title: `${chapter.title}：篇幅较短`, detail: `正文约 ${plain.length} 字，请确认是否为完整章节。`, chapterIds: [chapter.id] });
      }
      for (const rawParagraph of plain.split(/\n\s*\n/u)) {
        const normalized = rawParagraph.replace(/\s+/gu, "").trim();
        // Short dialogue and stock phrases repeat naturally in long fiction. Treat
        // only substantive paragraph-sized matches as actionable AI repair input.
        if (normalized.length < MIN_DUPLICATE_PARAGRAPH_CHARACTERS || normalized.length > 2_000) continue;
        const list = paragraphs.get(normalized) ?? [];
        if (!list.some((item) => item.chapterId === chapter.id)) list.push({ chapterId: chapter.id, title: chapter.title });
        paragraphs.set(normalized, list);
      }
    }
    for (const [paragraph, occurrences] of paragraphs) {
      if (occurrences.length < 2 || issues.length >= 5_000) continue;
      const chapterIds = occurrences.slice(0, 20).map((item) => item.chapterId);
      issues.push({
        id: `duplicate:${sha256(paragraph).slice(0, 20)}`,
        rule: "duplicate-paragraph",
        severity: "warning",
        title: `重复段落：${occurrences.slice(0, 3).map((item) => item.title).join("、")}`,
        detail: `同一段落在 ${occurrences.length} 个章节中出现：${paragraph.slice(0, 180)}${paragraph.length > 180 ? "…" : ""}`,
        chapterIds
      });
    }
    return { entryId, generatedAt: new Date().toISOString(), localOnly: true, coverage, issues: issues.slice(0, 5_000) };
  }

  async applyChapterRepair(
    input: InkHubNovelChapterRepairInput & { entryPath: string }
  ): Promise<InkHubNovelChapterRepairResult> {
    const row = this.database.prepare("SELECT * FROM chapters WHERE entry_id = ? AND id = ?").get(input.entryId, input.chapterId) as unknown as ChapterRow | undefined;
    if (!row || row.source_revision !== input.expectedSourceRevision) {
      throw new Error("原稿索引已变化，请重新质检并打开最新章节后再修复。");
    }
    const freshness = await this.refreshSourceFreshness(input.entryId, input.entryPath);
    if (freshness.status === "stale") throw new Error(staleWarning(freshness));
    const extension = extname(row.relative_path).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) {
      throw new Error("当前只支持把 Markdown 或 TXT 章节写回原稿；其他格式请复制修复稿后在原编辑器中替换。");
    }
    const root = await realpath(input.entryPath);
    const requested = resolve(root, row.relative_path);
    if (!containsPath(root, requested)) throw new Error("修复目标超出已授权的小说目录。");
    const sourcePath = await realpath(requested);
    if (!containsPath(root, sourcePath)) throw new Error("修复目标解析后超出已授权的小说目录。");
    const sourceInfo = await lstat(sourcePath);
    if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) throw new Error("修复目标不是可安全写回的本地文件。");
    const originalBytes = await readFile(sourcePath);
    if (sha256(originalBytes) !== input.expectedSourceRevision) {
      throw new Error("原稿已变化，为避免覆盖新内容，本次修复已停止。请重建索引后重试。");
    }
    const originalText = originalBytes.toString("utf8").replace(/^\uFEFF/u, "");
    const normalized = originalText.replace(/\r\n?/gu, "\n");
    const targetStart = normalized.indexOf(row.content);
    if (targetStart < 0 || normalized.indexOf(row.content, targetStart + 1) >= 0) {
      throw new Error("无法唯一定位原章节，未写回任何内容。请在原编辑器中手动应用修复稿。");
    }
    const repaired = `${normalized.slice(0, targetStart)}${input.content.trimEnd()}${normalized.slice(targetStart + row.content.length)}`;
    const newline = originalText.includes("\r\n") ? "\r\n" : "\n";
    const repairedBytes = Buffer.from(newline === "\n" ? repaired : repaired.replace(/\n/gu, newline), "utf8");
    const backupDirectory = join(this.indexDirectory, "repair-backups", sha256(input.entryId).slice(0, 16));
    mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const backupPath = join(backupDirectory, `${Date.now()}-${sha256(row.relative_path).slice(0, 12)}.bak`);
    await writeFile(backupPath, originalBytes, { flag: "wx", mode: 0o600 });
    const temporaryPath = join(dirname(sourcePath), `.inkhub-repair-${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, repairedBytes, { flag: "wx", mode: sourceInfo.mode & 0o777 });
      await rename(temporaryPath, sourcePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    const title = this.database.prepare("SELECT title FROM novels WHERE entry_id = ?").get(input.entryId) as unknown as { title: string } | undefined;
    const summary = await this.build({ entryId: input.entryId, title: title?.title ?? "未命名作品", entryPath: root });
    return {
      entryId: input.entryId,
      relativePath: row.relative_path,
      backupCreated: true,
      appliedAt: new Date().toISOString(),
      summary
    };
  }

  async applyChapterRepairs(input: {
    entryId: string;
    entryPath: string;
    repairs: readonly InkHubNovelBatchRepairItem[];
  }): Promise<InkHubNovelBatchRepairResult> {
    let resolved: InkHubNovelBatchRepairResult | undefined;
    const operation = this.repairChain.then(async () => {
      if (!input.repairs.length) throw new Error("批量修复至少需要一章。");
      const freshness = await this.refreshSourceFreshness(input.entryId, input.entryPath);
      if (freshness.status === "stale") throw new Error(staleWarning(freshness));
      if (new Set(input.repairs.map((repair) => repair.chapterId)).size !== input.repairs.length) {
        throw new Error("同一章节不能在一批修复中重复出现。");
      }
      const root = await realpath(input.entryPath);
      const repairsById = new Map(input.repairs.map((repair) => [repair.chapterId, repair]));
      const rows = input.repairs.map((repair) => {
        const row = this.database.prepare("SELECT * FROM chapters WHERE entry_id = ? AND id = ?")
          .get(input.entryId, repair.chapterId) as unknown as ChapterRow | undefined;
        if (!row || row.source_revision !== repair.expectedSourceRevision) {
          throw new Error("批量修复中至少一章的原稿索引已变化；整批未写回，请重新质检。");
        }
        if (!TEXT_EXTENSIONS.has(extname(row.relative_path).toLowerCase())) {
          throw new Error(`《${row.title}》不是可安全写回的 Markdown 或 TXT 章节；整批未写回。`);
        }
        return row;
      });
      const rowsByPath = new Map<string, ChapterRow[]>();
      for (const row of rows) {
        const grouped = rowsByPath.get(row.relative_path) ?? [];
        grouped.push(row);
        rowsByPath.set(row.relative_path, grouped);
      }

      interface PreparedFile {
        relativePath: string;
        sourcePath: string;
        mode: number;
        originalBytes: Buffer;
        repairedBytes: Buffer;
        temporaryPath: string;
        backupPath: string;
      }
      const prepared: PreparedFile[] = [];
      const backupDirectory = join(
        this.indexDirectory,
        "repair-backups",
        sha256(input.entryId).slice(0, 16),
        `${Date.now()}-${randomUUID()}`
      );
      mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
      try {
        for (const [relativePath, fileRows] of rowsByPath) {
          const requested = resolve(root, relativePath);
          if (!containsPath(root, requested)) throw new Error("批量修复目标超出已授权的小说目录。");
          const sourcePath = await realpath(requested);
          if (!containsPath(root, sourcePath)) throw new Error("批量修复目标解析后超出已授权的小说目录。");
          const sourceInfo = await lstat(sourcePath);
          if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) throw new Error("批量修复目标不是可安全写回的本地文件。");
          const originalBytes = await readFile(sourcePath);
          const sourceRevision = sha256(originalBytes);
          if (fileRows.some((row) => row.source_revision !== sourceRevision)) {
            throw new Error("批量修复中至少一个源文件已变化；整批未写回，请更新索引后重试。");
          }
          const originalText = originalBytes.toString("utf8").replace(/^\uFEFF/u, "");
          const normalized = originalText.replace(/\r\n?/gu, "\n");
          const replacements = fileRows.map((row) => {
            const start = normalized.indexOf(row.content);
            if (start < 0 || normalized.indexOf(row.content, start + 1) >= 0) {
              throw new Error(`无法唯一定位《${row.title}》；整批未写回。`);
            }
            return {
              start,
              end: start + row.content.length,
              content: repairsById.get(row.id)!.content.trimEnd()
            };
          }).sort((left, right) => right.start - left.start);
          for (let index = 1; index < replacements.length; index += 1) {
            if (replacements[index - 1]!.start < replacements[index]!.end) {
              throw new Error("批量修复章节范围发生重叠；整批未写回。");
            }
          }
          let repaired = normalized;
          for (const replacement of replacements) {
            repaired = `${repaired.slice(0, replacement.start)}${replacement.content}${repaired.slice(replacement.end)}`;
          }
          const newline = originalText.includes("\r\n") ? "\r\n" : "\n";
          const repairedBytes = Buffer.from(newline === "\n" ? repaired : repaired.replace(/\n/gu, newline), "utf8");
          const temporaryPath = join(dirname(sourcePath), `.inkhub-repair-batch-${randomUUID()}.tmp`);
          const backupPath = join(backupDirectory, `${sha256(relativePath).slice(0, 12)}-${basename(relativePath)}.bak`);
          await writeFile(backupPath, originalBytes, { flag: "wx", mode: 0o600 });
          await writeFile(temporaryPath, repairedBytes, { flag: "wx", mode: sourceInfo.mode & 0o777 });
          prepared.push({ relativePath, sourcePath, mode: sourceInfo.mode & 0o777, originalBytes, repairedBytes, temporaryPath, backupPath });
        }

        const committed: PreparedFile[] = [];
        try {
          for (const file of prepared) {
            const currentBytes = await readFile(file.sourcePath);
            if (!currentBytes.equals(file.originalBytes)) {
              throw new Error(`源文件 ${file.relativePath} 在提交前发生变化；整批正在回滚。`);
            }
            await rename(file.temporaryPath, file.sourcePath);
            committed.push(file);
          }
          const title = this.database.prepare("SELECT title FROM novels WHERE entry_id = ?")
            .get(input.entryId) as unknown as { title: string } | undefined;
          const summary = await this.build({
            entryId: input.entryId,
            title: title?.title ?? "未命名作品",
            entryPath: root
          });
          resolved = {
            entryId: input.entryId,
            appliedChapterCount: input.repairs.length,
            appliedFileCount: prepared.length,
            backupsCreated: prepared.length,
            appliedAt: new Date().toISOString(),
            summary
          };
        } catch (error: unknown) {
          const rollbackErrors: string[] = [];
          for (const file of committed.reverse()) {
            const rollbackPath = join(dirname(file.sourcePath), `.inkhub-repair-rollback-${randomUUID()}.tmp`);
            try {
              await writeFile(rollbackPath, file.originalBytes, { flag: "wx", mode: file.mode });
              await rename(rollbackPath, file.sourcePath);
            } catch (rollbackError: unknown) {
              await rm(rollbackPath, { force: true }).catch(() => undefined);
              rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : "unknown rollback error");
            }
          }
          if (rollbackErrors.length) {
            throw new Error(`批量修复提交失败且回滚不完整：${rollbackErrors.join("；")}。私有备份仍保留。`, { cause: error });
          }
          throw error;
        }
      } finally {
        await Promise.all(
          prepared.map((file) => rm(file.temporaryPath, { force: true }).catch(() => undefined))
        );
      }
    });
    this.repairChain = operation.then(() => undefined, () => undefined);
    await operation;
    return resolved!;
  }

  createContextPacket(entryId: string, purpose: "quality-check" | "continue-writing"): InkHubNovelContextPacket {
    const indexSummary = this.getSummary(entryId);
    if (indexSummary.status === "not-indexed") throw new Error("请先构建全书索引。");
    if (indexSummary.status === "stale") throw new Error(staleWarning(indexSummary));
    const order = purpose === "continue-writing" ? "DESC" : "ASC";
    const rows = this.database.prepare(`SELECT * FROM chapters WHERE entry_id = ? ORDER BY ordinal ${order} LIMIT 12`).all(entryId) as unknown as ChapterRow[];
    if (purpose === "continue-writing") rows.reverse();
    const excerpts = rows.map((row) => ({
      chapterId: row.id,
      title: row.title,
      relativePath: row.relative_path,
      content: (purpose === "continue-writing" ? row.content.slice(-5_000) : row.content.slice(0, 5_000))
    }));
    const prompt = purpose === "continue-writing"
      ? `基于《${this.database.prepare("SELECT title FROM novels WHERE entry_id = ?").get(entryId)?.title ?? "未命名作品"}》已建立的完整本地索引继续创作。先核对人物状态、时间线、伏笔和末章未完事项；不得改写已完成章节。当前索引覆盖 ${indexSummary.indexedDocumentCount}/${indexSummary.documentCount} 个文档、${indexSummary.chapterCount} 章。`
      : `对《${this.database.prepare("SELECT title FROM novels WHERE entry_id = ?").get(entryId)?.title ?? "未命名作品"}》执行全书质检。按章检查一致性、逻辑、人物状态、时间线、伏笔、重复和文风偏移，结论必须引用章节标题与可核对片段。当前索引覆盖 ${indexSummary.indexedDocumentCount}/${indexSummary.documentCount} 个文档、${indexSummary.chapterCount} 章。`;
    return { entryId, purpose, generatedAt: new Date().toISOString(), indexSummary, prompt, excerpts };
  }

  saveProgress(input: Omit<InkHubNovelReadingProgress, "updatedAt">): InkHubNovelReadingProgress {
    const chapter = this.database.prepare("SELECT character_count FROM chapters WHERE entry_id = ? AND id = ?").get(input.entryId, input.chapterId) as unknown as { character_count: number } | undefined;
    if (!chapter) throw new Error("无法为不存在的章节保存阅读进度。");
    const progress: InkHubNovelReadingProgress = {
      entryId: input.entryId,
      chapterId: input.chapterId,
      characterOffset: Math.max(0, Math.min(chapter.character_count, Math.trunc(input.characterOffset))),
      scrollFraction: Math.max(0, Math.min(1, input.scrollFraction)),
      updatedAt: new Date().toISOString()
    };
    this.database.prepare(`INSERT INTO reading_progress (entry_id,chapter_id,character_offset,scroll_fraction,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET chapter_id=excluded.chapter_id,character_offset=excluded.character_offset,scroll_fraction=excluded.scroll_fraction,updated_at=excluded.updated_at`)
      .run(progress.entryId, progress.chapterId, progress.characterOffset, progress.scrollFraction, progress.updatedAt);
    return progress;
  }

  getProgress(entryId: string): InkHubNovelReadingProgress | null {
    const row = this.database.prepare("SELECT * FROM reading_progress WHERE entry_id = ?").get(entryId) as unknown as {
      entry_id: string; chapter_id: string; character_offset: number; scroll_fraction: number; updated_at: string;
    } | undefined;
    return row ? { entryId: row.entry_id, chapterId: row.chapter_id, characterOffset: row.character_offset, scrollFraction: row.scroll_fraction, updatedAt: row.updated_at } : null;
  }
}
