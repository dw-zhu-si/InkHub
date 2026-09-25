import { createHash } from "node:crypto";
import {
  LONG_BOOK_LINE_FILE_ID,
  LONG_CHARACTER_OVERVIEW_FILE_ID,
  LONG_CHARACTER_OVERVIEW_PATH,
  LONG_WORKSPACE_INDEX_FILE_ID,
  LONG_WORKSPACE_INDEX_PATH,
  LongProjectManifestSchema,
  LongLedgerCommitRecordSchema,
  LongWorkspaceIndexSnapshotSchema,
  deriveLongForeshadowingStatusFromCommittedBeats,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterHandoffFileId,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  longLedgerCommitFileId,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  type LinkedMaterialIdsByKind,
  type LinkedSkillIdsByKind,
  type LongFileRevision,
  type LongProjectManifest,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import {
  readWriteClawLongSource,
  type WriteClawLongArchiveSource
} from "./write-claw-long-archive";

const BOOK_LINE_PATH = "long/plot/book-line.md";
const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const MAX_IMPORTED_TEXT_DOCUMENT_BYTES = 28 * 1024 * 1024;
const MAX_INDEX_TEXT = 200_000;
const MAX_SHORT_TEXT = 4_000;
const MAX_WORLD_ITEM_TEXT = 1_000_000;
const MAX_WORLD_ITEMS_PER_CATEGORY = 10_000;
const MAX_STRUCTURAL_WORLD_CATEGORIES = 9_000;
// Leave room for up to 10,000 UTF-8 titles and list markers beneath the
// 32 MiB per-document store limit. Legacy values clipped by these budgets are
// retained verbatim in migration evidence.
const MAX_WORLD_LIST_CONTENT_CHARACTERS = 4 * 1024 * 1024;
const MAX_WORLD_TEXT_DOCUMENT_CHARACTERS = 7 * 1024 * 1024;
const MIGRATION_EVIDENCE_CHUNK_CHARACTERS = 4 * 1024 * 1024;
const MAX_MIGRATION_EVIDENCE_DOCUMENT_BYTES = 28 * 1024 * 1024;
const WORLD_ITEM_MARKER_PREFIX = "<!-- deepwrite-world-item:";
const MAX_MIGRATION_WARNINGS = 10_000;
const MAX_MIGRATION_WARNING_CHARACTERS = 4_000;
const MIGRATION_WARNING_OVERFLOW =
  "迁移过程中还有更多重复或次要警告；已达到 10,000 条返回上限。原始导入文件未被修改，已生成的迁移证据仍保留在项目中。";

const DEFAULT_WORLD_CATEGORIES = [
  ["rules", "规则"],
  ["factions", "势力"],
  ["geography", "地理"],
  ["history", "历史"],
  ["terminology", "术语"],
  ["realms", "境界"],
  ["items", "物品"]
] as const;

const CHARACTER_GROUPS = [
  ["protagonists", "protagonist"],
  ["major_supporting", "major_supporting"],
  ["minor_supporting", "minor_supporting"],
  ["passersby", "passerby"]
] as const;

const EVENT_CONNECTION_TYPES = new Set([
  "before",
  "same_time",
  "overlaps",
  "causes",
  "enables",
  "conceals"
]);
const STORY_TIME_MODES = new Set([
  "exact",
  "relative",
  "sequence",
  "unknown"
]);
const NARRATIVE_MODES = new Set([
  "scene",
  "flashback",
  "retelling",
  "clue",
  "misdirection",
  "reveal",
  "dream",
  "prophecy"
]);
const DISCLOSURE_LEVELS = new Set(["hint", "partial", "full", "false"]);
const BEAT_TYPES = new Set([
  "source",
  "plant",
  "reinforce",
  "misdirect",
  "partial_reveal",
  "reveal",
  "payoff",
  "aftermath"
]);
const FORESHADOWING_STATUSES = new Set([
  "planned",
  "open",
  "progressing",
  "resolved",
  "abandoned"
]);

export type WriteClawLongImportSourceKind =
  WriteClawLongArchiveSource["sourceKind"];

export interface WriteClawLongImportDocument {
  fileId: string;
  path: string;
  kind: "markdown" | "json";
  content: string;
  revision: LongFileRevision;
}

export interface WriteClawLongImportPlan {
  schemaVersion: 1;
  sourceKind: WriteClawLongImportSourceKind;
  legacySchemaVersion: number;
  committedChapterPolicy: "written-uncommitted" | "legacy-checkpoints";
  manifest: LongProjectManifest;
  index: LongWorkspaceIndexSnapshot;
  documents: WriteClawLongImportDocument[];
  warnings: string[];
  idMap: Record<string, Record<string, string>>;
}

export interface CreateWriteClawLongImportPlanOptions {
  importedAt?: string;
  title?: string;
  genre?: string;
  sourceIdentity?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  const raw = stringValue(value).trim();
  if (!raw) return fallback;
  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.valueOf()) ? fallback : timestamp.toISOString();
}

function normalizeImportedAt(value: string | undefined): string {
  const fallback = new Date().toISOString();
  return normalizeTimestamp(value, fallback);
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function contentSha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function fileRevision(content: string): LongFileRevision {
  const bytes = Buffer.from(content, "utf8");
  return `v2:${bytes.byteLength}:${contentSha256(bytes)}` as LongFileRevision;
}

function storageKey(id: string): string {
  return contentSha256(id).slice(0, 32);
}

function characterPath(characterId: string, filename: string): string {
  return `long/characters/${storageKey(characterId)}/${filename}`;
}

function chapterPath(chapterId: string, filename: string): string {
  return `long/chapters/${storageKey(chapterId)}/${filename}`;
}

function ledgerPath(commitId: string): string {
  return `long/ledger/${storageKey(commitId)}.json`;
}

class WarningCollector {
  private readonly values: string[] = [];
  private readonly seen = new Set<string>();
  private overflowed = false;
  private readonly decisions: Array<{
    action: "drop" | "merge" | "coerce" | "unresolved-reference";
    sourcePath: string;
    reason: string;
    raw: unknown;
  }> = [];
  private readonly evidence: Array<{
    title: string;
    source: string;
    content: string;
  }> = [];

  add(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    let normalized = trimmed.slice(0, MAX_MIGRATION_WARNING_CHARACTERS);
    if (/[\uD800-\uDBFF]/u.test(normalized.at(-1) ?? "")) {
      normalized = normalized.slice(0, -1);
    }
    if (!normalized || this.seen.has(normalized)) return;
    if (this.values.length >= MAX_MIGRATION_WARNINGS - 1) {
      this.overflowed = true;
      return;
    }
    this.seen.add(normalized);
    this.values.push(normalized);
  }

  all(): string[] {
    return this.overflowed
      ? [...this.values, MIGRATION_WARNING_OVERFLOW]
      : [...this.values];
  }

  preserve(title: string, source: string, content: string): void {
    if (!content) return;
    this.evidence.push({ title, source, content });
  }

  preserveDecision(
    action: "drop" | "merge" | "coerce" | "unresolved-reference",
    sourcePath: string,
    reason: string,
    raw: unknown
  ): void {
    this.decisions.push({
      action,
      sourcePath,
      reason,
      raw: raw === undefined ? null : raw
    });
  }

  preserved(): ReadonlyArray<{
    title: string;
    source: string;
    content: string;
  }> {
    if (this.decisions.length === 0) return this.evidence;
    return [
      ...this.evidence,
      {
        title: "迁移决策完整审计日志",
        source: "migration.decisions.json",
        content: serializeJson({
          schema: "deepwrite.write-claw-migration-decisions",
          schemaVersion: 1,
          decisions: this.decisions
        })
      }
    ];
  }
}

function safeUnicode(
  value: unknown,
  warnings: WarningCollector,
  label: string
): string {
  const content = stringValue(value);
  const roundTrip = Buffer.from(content, "utf8").toString("utf8");
  if (roundTrip !== content) {
    warnings.add(`${label}包含无效 Unicode，已替换为安全字符。`);
  }
  return roundTrip;
}

function clipped(
  value: unknown,
  maxLength: number,
  warnings: WarningCollector,
  label: string
): string {
  const content = safeUnicode(value, warnings, label);
  if (content.length <= maxLength) return content;
  warnings.preserve(`${label}（完整溢出原文）`, label, content);
  warnings.add(
    `${label}超过当前长篇结构字段上限；结构字段保留前 ${maxLength} 个字符，完整原文已写入只读迁移证据。`
  );
  return content.slice(0, maxLength);
}

function clippedTextDocument(
  value: unknown,
  warnings: WarningCollector,
  label: string
): string {
  const content = safeUnicode(value, warnings, label);
  if (
    Buffer.byteLength(content, "utf8") <=
    MAX_IMPORTED_TEXT_DOCUMENT_BYTES
  ) {
    return content;
  }
  warnings.preserve(`${label}（完整溢出原文）`, label, content);
  warnings.add(
    `${label}超过当前单文档 28 MiB 导入预算；可编辑文档已安全裁剪，完整原文已写入只读迁移证据。`
  );
  return splitTextByUtf8Bytes(
    content,
    MAX_IMPORTED_TEXT_DOCUMENT_BYTES
  )[0]!;
}

function title(
  value: unknown,
  fallback: string,
  warnings: WarningCollector,
  label: string
): string {
  return (
    clipped(value, 256, warnings, label).trim() ||
    fallback.slice(0, 256)
  );
}

function worldItemTitle(
  value: unknown,
  fallback: string,
  warnings: WarningCollector,
  label: string,
  sourcePath: string
): string {
  const normalized = title(value, fallback, warnings, label);
  const singleLine = normalized
    .replace(/\r\n?|\n/gu, " ")
    .replace(/[^\S\r\n]+/gu, " ")
    .trim();
  if (singleLine !== normalized) {
    warnings.add(
      `${label}包含换行或多余空白，结构标题已规范为单行；完整原值已写入迁移证据。`
    );
    warnings.preserveDecision(
      "coerce",
      sourcePath,
      "当前世界观条目标题必须为单行，已将换行规范为空格。",
      value
    );
  }
  return singleLine || fallback.slice(0, 256);
}

function worldItemContent(
  value: unknown,
  warnings: WarningCollector,
  label: string,
  sourcePath: string,
  raw: unknown
): string {
  const normalized = safeUnicode(value, warnings, label);
  const escaped = normalized.includes(WORLD_ITEM_MARKER_PREFIX)
    ? normalized.replaceAll(
        WORLD_ITEM_MARKER_PREFIX,
        "<!-- deepwrite-world-item&#58;"
      )
    : normalized;
  if (escaped !== normalized) {
    warnings.add(
      `${label}包含当前格式的保留标记，结构正文已安全转义；完整原值已写入迁移证据。`
    );
    warnings.preserveDecision(
      "coerce",
      sourcePath,
      "世界观列表正文不能包含兼容条目标记，已对标记冒号进行转义。",
      raw
    );
  }
  return clipped(
    escaped,
    MAX_WORLD_ITEM_TEXT,
    warnings,
    label
  );
}

class DeterministicIdRegistry {
  private readonly firstByKindAndLegacy = new Map<string, string>();
  private readonly counts = new Map<string, number>();
  private readonly exportMap = new Map<string, Map<string, string>>();

  constructor(
    private readonly namespace: string,
    private readonly warnings: WarningCollector
  ) {}

  allocate(
    kind: string,
    prefix: string,
    legacyValue: unknown,
    fallbackKey: string
  ): string {
    const legacyId = stringValue(legacyValue).trim();
    const externalKey = legacyId || fallbackKey;
    const internalKey = `${kind}\0${externalKey}`;
    const occurrence = (this.counts.get(internalKey) ?? 0) + 1;
    this.counts.set(internalKey, occurrence);
    if (occurrence > 1 && legacyId) {
      this.warnings.add(
        `旧版 ${kind} ID“${legacyId}”重复；引用将指向首个条目，重复条目已获得独立稳定 ID。`
      );
      this.warnings.preserveDecision(
        "coerce",
        `$legacy.${kind}[id=${JSON.stringify(legacyId)}].id`,
        `重复旧版 ID 的第 ${occurrence} 个实体已获得独立稳定 ID；旧引用仍指向首个实体。`,
        legacyValue
      );
    }
    const seed =
      occurrence === 1
        ? `${this.namespace}\0${kind}\0${externalKey}`
        : `${this.namespace}\0${kind}\0${externalKey}\0duplicate-${occurrence}`;
    const id = `${prefix}_legacy-${contentSha256(seed).slice(0, 24)}`;
    if (!this.firstByKindAndLegacy.has(internalKey)) {
      this.firstByKindAndLegacy.set(internalKey, id);
      const map = this.exportMap.get(kind) ?? new Map<string, string>();
      map.set(externalKey, id);
      this.exportMap.set(kind, map);
    } else {
      const map = this.exportMap.get(kind) ?? new Map<string, string>();
      map.set(`${externalKey}#duplicate-${occurrence}`, id);
      this.exportMap.set(kind, map);
    }
    return id;
  }

  resolve(kind: string, legacyValue: unknown): string | undefined {
    const legacyId = stringValue(legacyValue).trim();
    return legacyId
      ? this.firstByKindAndLegacy.get(`${kind}\0${legacyId}`)
      : undefined;
  }

  alias(kind: string, legacyValue: unknown, id: string): void {
    const legacyId = stringValue(legacyValue).trim();
    if (!legacyId) return;
    const internalKey = `${kind}\0${legacyId}`;
    if (this.firstByKindAndLegacy.has(internalKey)) return;
    this.firstByKindAndLegacy.set(internalKey, id);
    const map = this.exportMap.get(kind) ?? new Map<string, string>();
    map.set(legacyId, id);
    this.exportMap.set(kind, map);
  }

  snapshot(): Record<string, Record<string, string>> {
    return Object.fromEntries(
      [...this.exportMap.entries()].map(([kind, values]) => [
        kind,
        Object.fromEntries(values)
      ])
    );
  }
}

const CHARACTER_OVERVIEW_GROUPS = [
  ["protagonist", "主角"],
  ["major_supporting", "主要配角"],
  ["minor_supporting", "次要配角"],
  ["passerby", "路人"]
] as const;

function buildCharacterOverviewMarkdown(
  characters: LongWorkspaceIndexSnapshot["characters"]
): string {
  if (characters.length === 0) return "";
  const sections = CHARACTER_OVERVIEW_GROUPS.map(([group, label]) => {
    const rows = characters
      .filter((character) => character.group === group)
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id)
      )
      .map((character) => {
        const aliases = character.aliases.length
          ? `；别名：${character.aliases.join("、")}`
          : "";
        return `- character_id=\`${character.id}\` ${character.name}${aliases}`;
      });
    return [
      `## ${label}`,
      "",
      ...(rows.length ? rows : ["（暂无）"])
    ].join("\n");
  });
  return [
    "# 人物概览",
    "",
    "按分组统计当前阶段全部人物的简单信息；智能体应先读本概览，再按 character_id 直接读取人物文档。",
    "",
    ...sections,
    ""
  ].join("\n");
}

interface ImportDocumentBuilder {
  documents: WriteClawLongImportDocument[];
  add(
    fileId: string,
    path: string,
    content: string,
    kind?: "markdown" | "json"
  ): LongWorkspaceFileReference;
}

function createDocumentBuilder(
  updatedAt: string,
  warnings: WarningCollector
): ImportDocumentBuilder {
  const documents: WriteClawLongImportDocument[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  return {
    documents,
    add(fileId, path, rawContent, kind = "markdown") {
      const content = safeUnicode(rawContent, warnings, `文档 ${path}`);
      const size = Buffer.byteLength(content, "utf8");
      if (size > MAX_DOCUMENT_BYTES) {
        throw new Error(`导入文档 ${path} 超过 32 MB 安全上限。`);
      }
      const pathKey = path.normalize("NFC").toLocaleLowerCase("en-US");
      if (ids.has(fileId) || paths.has(pathKey)) {
        throw new Error(`导入计划生成了重复文件：${fileId} / ${path}。`);
      }
      ids.add(fileId);
      paths.add(pathKey);
      const revision = fileRevision(content);
      documents.push({
        fileId,
        path,
        kind,
        content,
        revision
      });
      return { id: fileId, path, revision, updatedAt };
    }
  };
}

function sourceRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return list(record(value).entries);
}

function uniqueMappedReferences(
  values: unknown,
  kind: string,
  ids: DeterministicIdRegistry,
  warnings: WarningCollector,
  sourcePath: string
): string[] {
  const mapped: string[] = [];
  list(values).forEach((value, index) => {
    const resolved = ids.resolve(kind, value);
    if (!resolved) {
      warnings.preserveDecision(
        "unresolved-reference",
        `${sourcePath}[${index}]`,
        `旧版 ${kind} 引用无法解析，未写入当前结构。`,
        value
      );
      return;
    }
    if (mapped.includes(resolved)) {
      warnings.preserveDecision(
        "merge",
        `${sourcePath}[${index}]`,
        `旧版 ${kind} 引用重复，已合并为单一引用。`,
        value
      );
      return;
    }
    mapped.push(resolved);
  });
  return mapped;
}

function executionStatus(
  raw: unknown,
  warnings: WarningCollector,
  sourcePath = "long_workspace.json"
): "planned" | "written" {
  const value = stringValue(raw).trim();
  if (
    value === "committed" ||
    value === "missed" ||
    value === "completed" ||
    value === "executed"
  ) {
    warnings.add(
      "旧版已落盘/已执行状态未伪造为当前可逆账本提交，已统一转为 written，导入后可重新核验并提交。"
    );
    warnings.preserveDecision(
      "coerce",
      sourcePath,
      "旧版执行状态没有可验证的现代可逆账本记录，已保守转为 written。",
      raw
    );
    return "written";
  }
  return value === "written" ? "written" : "planned";
}

function legacyExecutionDecision(
  raw: unknown
): "committed" | "missed" | null {
  const value = stringValue(raw).trim();
  if (value === "missed") return "missed";
  if (
    value === "committed" ||
    value === "completed" ||
    value === "executed"
  ) {
    return "committed";
  }
  return null;
}

function legacyChapterLocatorMatches(
  row: Record<string, unknown>,
  legacyCardId: string,
  stageId: string
): boolean {
  const rowStage = stringValue(row.chapter_stage_id).trim();
  const rowCard = stringValue(row.chapter_card_id).trim();
  return (
    Boolean(rowStage || rowCard) &&
    (!rowStage || rowStage === stageId) &&
    (!rowCard || rowCard === legacyCardId)
  );
}

function legacyLedgerChapterSummary(
  workspace: Record<string, unknown>,
  legacyCardId: string,
  stageId: string
) {
  const ledger = record(workspace.ledger);
  const keys = [
    "timeline",
    "character_states",
    "faction_states",
    "realm_states",
    "foreshadowing_states",
    "continuity_notes"
  ] as const;
  const values = Object.fromEntries(
    keys.map((key) => {
      const lines = list(ledger[key]).flatMap((raw) => {
        const row = typeof raw === "string" ? { content: raw } : record(raw);
        if (!legacyChapterLocatorMatches(row, legacyCardId, stageId)) {
          return [];
        }
        const content = stringValue(
          row.content ?? row.description ?? row.detail ?? row.state ?? row.note
        ).trim();
        return content ? [content] : [];
      });
      for (const rawChange of list(ledger.chapter_changes)) {
        const change = record(rawChange);
        if (!legacyChapterLocatorMatches(change, legacyCardId, stageId)) {
          continue;
        }
        const content = stringValue(record(change.text)[key]).trim();
        if (content && content !== "本章无变化") lines.push(content);
      }
      return [key, lines.join("\n") || "旧版未提供本项摘要。"];
    })
  ) as Record<(typeof keys)[number], string>;
  return {
    timeline: values.timeline,
    characterStates: values.character_states,
    factionStates: values.faction_states,
    realmStates: values.realm_states,
    foreshadowingStates: values.foreshadowing_states,
    continuityNotes: values.continuity_notes
  };
}

function hasLegacyTimelineAudit(
  workspace: Record<string, unknown>,
  legacyCardId: string,
  stageId: string,
  legacyCommitId: string
): boolean {
  return list(record(workspace.ledger).timeline).some((raw) => {
    const row = typeof raw === "string" ? { content: raw } : record(raw);
    const rowCommitId = stringValue(row.commit_id).trim();
    return (
      Boolean(
        stringValue(
          row.content ?? row.description ?? row.detail ?? row.note
        ).trim()
      ) &&
      legacyChapterLocatorMatches(row, legacyCardId, stageId) &&
      rowCommitId === legacyCommitId
    );
  });
}

function enumValue(
  value: unknown,
  allowed: ReadonlySet<string>,
  fallback: string,
  aliases: Readonly<Record<string, string>> = {},
  audit?: {
    warnings: WarningCollector;
    sourcePath: string;
  }
): string {
  const raw = stringValue(value).trim();
  const normalized = aliases[raw] ?? (allowed.has(raw) ? raw : fallback);
  if (audit && raw && normalized !== raw) {
    audit.warnings.preserveDecision(
      "coerce",
      audit.sourcePath,
      aliases[raw]
        ? `旧枚举值已映射为 ${normalized}。`
        : `未知枚举值已回退为 ${fallback}。`,
      value
    );
  }
  return normalized;
}

function appendLegacyLedgerText(
  workspace: Record<string, unknown>,
  legacyCardId: string,
  stageId: string,
  currentText: string
): string {
  const ledger = record(workspace.ledger);
  const sections: string[] = [];
  const buckets = [
    ["timeline", "时间线"],
    ["character_states", "人物状态"],
    ["faction_states", "势力状态"],
    ["realm_states", "境界状态"],
    ["foreshadowing_states", "伏笔状态"],
    ["continuity_notes", "连续性记录"]
  ] as const;
  for (const [key, label] of buckets) {
    const lines = list(ledger[key]).flatMap((raw) => {
      const row = typeof raw === "string" ? { content: raw } : record(raw);
      if (!legacyChapterLocatorMatches(row, legacyCardId, stageId)) {
        return [];
      }
      const content = stringValue(
        row.content ?? row.description ?? row.detail ?? row.state ?? row.note
      ).trim();
      return content ? [content] : [];
    });
    if (lines.length > 0) {
      sections.push(`### ${label}\n\n${lines.join("\n")}`);
    }
  }
  for (const rawChange of list(ledger.chapter_changes)) {
    const change = record(rawChange);
    if (!legacyChapterLocatorMatches(change, legacyCardId, stageId)) {
      continue;
    }
    const text = record(change.text);
    for (const [key, label] of buckets) {
      const content = stringValue(text[key]).trim();
      if (content && content !== "本章无变化") {
        sections.push(`### ${label}\n\n${content}`);
      }
    }
  }
  const plot = record(workspace.plot);
  const placementChapterById = new Map<string, string>();
  const placementDecisionLines = list(plot.narrative_placements).flatMap(
    (rawPlacement) => {
      const placement = record(rawPlacement);
      const id = stringValue(placement.id).trim();
      const chapterCardId = stringValue(placement.chapter_card_id).trim();
      if (id) placementChapterById.set(id, chapterCardId);
      if (chapterCardId !== legacyCardId) return [];
      const status = stringValue(
        placement.execution_status ?? placement.status
      ).trim();
      if (
        status !== "committed" &&
        status !== "missed" &&
        status !== "completed" &&
        status !== "executed"
      ) {
        return [];
      }
      const note = stringValue(
        placement.note ?? placement.writing_prompt
      )
        .trim()
        .slice(0, 4_000);
      return [
        `- placement_id=${id || "unknown"}；旧状态=${status}${
          note ? `；证据/说明=${note}` : ""
        }`
      ];
    }
  );
  if (placementDecisionLines.length > 0) {
    sections.push(
      `### 旧版叙事落点执行判定（迁移证据）\n\n${placementDecisionLines.join("\n")}`
    );
  }

  const beatDecisionLines = list(plot.foreshadowing).flatMap(
    (rawThread) => {
      const thread = record(rawThread);
      const threadId = stringValue(thread.id).trim();
      return list(thread.beats).flatMap((rawBeat) => {
        const beat = record(rawBeat);
        const placementId = stringValue(beat.placement_id).trim();
        const chapterCardId =
          stringValue(beat.chapter_card_id).trim() ||
          placementChapterById.get(placementId) ||
          "";
        if (chapterCardId !== legacyCardId) return [];
        const status = stringValue(
          beat.status ?? beat.execution_status
        ).trim();
        if (
          status !== "committed" &&
          status !== "missed" &&
          status !== "completed" &&
          status !== "executed"
        ) {
          return [];
        }
        const note = stringValue(
          beat.note ?? beat.intended_knowledge ?? beat.target_scope
        )
          .trim()
          .slice(0, 4_000);
        return [
          `- foreshadowing_id=${threadId || "unknown"}；beat_id=${
            stringValue(beat.id).trim() || "unknown"
          }；旧状态=${status}${note ? `；证据/说明=${note}` : ""}`
        ];
      });
    }
  );
  if (beatDecisionLines.length > 0) {
    sections.push(
      `### 旧版伏笔节拍执行判定（迁移证据）\n\n${beatDecisionLines.join("\n")}`
    );
  }

  if (sections.length === 0) return currentText;
  return [
    currentText.trimEnd(),
    "## 旧版状态账本（待重新提交）",
    sections.join("\n\n")
  ]
    .filter(Boolean)
    .join("\n\n");
}

function beforePathExists(
  adjacency: Map<string, Set<string>>,
  start: string,
  target: string
): boolean {
  const pending = [start];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

function sourceIdentity(
  source: WriteClawLongArchiveSource,
  override: string | undefined
): string {
  if (override?.trim()) return override.trim();
  const legacyBookId = stringValue(source.book?.id).trim();
  if (legacyBookId) return `write-claw-book:${legacyBookId}`;
  return `write-claw-workspace:${contentSha256(JSON.stringify(source.workspace))}`;
}

function extractGenre(
  book: Record<string, unknown> | null,
  override: string | undefined,
  warnings: WarningCollector
): string {
  if (override?.trim()) {
    return clipped(override.trim(), 120, warnings, "题材").trim();
  }
  const direct = stringValue(book?.genre).trim();
  if (direct) return clipped(direct, 120, warnings, "题材").trim();
  const firstCategory = list(book?.categories)
    .map((value) => stringValue(value).trim())
    .find(Boolean);
  return clipped(
    firstCategory || "长篇",
    120,
    warnings,
    "题材"
  ).trim();
}

function splitEvidenceContent(content: string): string[] {
  if (content.length <= MIGRATION_EVIDENCE_CHUNK_CHARACTERS) return [content];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < content.length) {
    let end = Math.min(
      content.length,
      offset + MIGRATION_EVIDENCE_CHUNK_CHARACTERS
    );
    if (
      end < content.length &&
      end > offset &&
      /[\uD800-\uDBFF]/u.test(content[end - 1]!)
    ) {
      end -= 1;
    }
    chunks.push(content.slice(offset, end));
    offset = end;
  }
  return chunks;
}

function appendMigrationEvidenceCategories(
  worldbuilding: LongWorkspaceIndexSnapshot["worldbuilding"],
  documents: ImportDocumentBuilder,
  warnings: WarningCollector
): void {
  const blocks: Array<{
    title: string;
    source: string;
    chunk: string;
    chunkIndex: number;
    chunkCount: number;
    evidenceIndex: number;
  }> = [];
  warnings.preserved().forEach((entry, evidenceIndex) => {
    const chunks = splitEvidenceContent(entry.content);
    chunks.forEach((chunk, chunkIndex) => {
      const partLabel =
        chunks.length > 1 ? `（${chunkIndex + 1}/${chunks.length}）` : "";
      blocks.push({
        title: `${entry.title}${partLabel}`,
        source: entry.source,
        chunk,
        chunkIndex,
        chunkCount: chunks.length,
        evidenceIndex
      });
    });
  });
  const availableCategories = 10_000 - worldbuilding.length;
  const payloadBudget =
    MAX_MIGRATION_EVIDENCE_DOCUMENT_BYTES - 16 * 1024;
  const renderStandalone = (
    block: (typeof blocks)[number]
  ): string =>
    [
      `# ${block.title}`,
      "",
      "> 这是迁移时生成的只读证据副本。其内容可被长篇搜索与 Agent 按需读取；请勿将其误认为当前结构字段。",
      "",
      `- 来源：${block.source}`,
      `- 分片：${block.chunkIndex + 1}/${block.chunkCount}`,
      "",
      "## 旧版完整原文",
      "",
      block.chunk
    ].join("\n");
  const pushCategory = (
    categoryTitle: string,
    content: string,
    seed: string
  ): void => {
    const categoryId = `world_migration-evidence-${contentSha256(
      seed
    ).slice(0, 24)}`;
    worldbuilding.push({
      id: categoryId,
      title: categoryTitle.slice(0, 256),
      order: worldbuilding.length + 1,
      format: "text",
      contentAuthority: "markdown",
      file: documents.add(
        longWorldbuildingFileId(categoryId),
        longWorldbuildingContentPath(categoryId),
        content
      )
    });
  };
  const keepStandalone =
    blocks.length <= Math.min(availableCategories, 1_000) &&
    blocks.every(
      (block) =>
        Buffer.byteLength(renderStandalone(block), "utf8") <=
        MAX_MIGRATION_EVIDENCE_DOCUMENT_BYTES
    );
  if (keepStandalone) {
    blocks.forEach((block) => {
      pushCategory(
        block.title,
        renderStandalone(block),
        `${block.source}\0${block.evidenceIndex + 1}\0${block.chunkIndex + 1}`
      );
    });
    return;
  }

  const renderedBlocks = blocks.map((block) =>
    [
      `## 证据 ${block.evidenceIndex + 1} · ${block.title}`,
      "",
      `- 来源：${block.source}`,
      `- 原证据分片：${block.chunkIndex + 1}/${block.chunkCount}`,
      "",
      "### 旧版完整原文",
      "",
      block.chunk
    ].join("\n")
  );
  const bundles: string[][] = [];
  let current: string[] = [];
  let currentBytes = 0;
  for (const block of renderedBlocks) {
    const pieces =
      Buffer.byteLength(block, "utf8") <= payloadBudget
        ? [block]
        : splitTextByUtf8Bytes(block, payloadBudget);
    for (const piece of pieces) {
      const pieceBytes = Buffer.byteLength(piece, "utf8");
      const separatorBytes = current.length ? 2 : 0;
      if (
        current.length &&
        currentBytes + separatorBytes + pieceBytes > payloadBudget
      ) {
        bundles.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(piece);
      currentBytes += (current.length > 1 ? 2 : 0) + pieceBytes;
    }
  }
  if (current.length) bundles.push(current);

  if (bundles.length > availableCategories) {
    throw new Error(
      "旧版迁移证据超过当前长篇索引的安全容量；原文件未被修改。"
    );
  }
  bundles.forEach((parts, bundleIndex) => {
    const categoryTitle =
      `迁移证据包 ${bundleIndex + 1}/${bundles.length}`.slice(0, 256);
    const payload = parts.join("\n\n");
    const content = [
      `# ${categoryTitle}`,
      "",
      "> 这是迁移时生成的只读证据副本。其内容可被长篇搜索与 Agent 按需读取；请勿将其误认为当前结构字段。",
      "",
      `- 证据包：${bundleIndex + 1}/${bundles.length}`,
      "",
      payload
    ].join("\n");
    pushCategory(
      categoryTitle,
      content,
      `bundle\0${bundleIndex + 1}\0${payload}`
    );
  });
}

function splitTextByUtf8Bytes(
  content: string,
  maxBytes: number
): string[] {
  if (Buffer.byteLength(content, "utf8") <= maxBytes) return [content];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < content.length) {
    let low = offset + 1;
    let high = content.length;
    let end = low;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate =
        middle < content.length &&
        /[\uD800-\uDBFF]/u.test(content[middle - 1]!)
          ? middle - 1
          : middle;
      if (
        candidate > offset &&
        Buffer.byteLength(content.slice(offset, candidate), "utf8") <=
          maxBytes
      ) {
        end = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (end <= offset) {
      throw new Error("迁移证据包含无法按 UTF-8 安全分片的内容。");
    }
    chunks.push(content.slice(offset, end));
    offset = end;
  }
  return chunks;
}

function memoryArchiveMarkdown(book: Record<string, unknown>): string {
  const memories = list(book.memories);
  const hasCaptureSetting = "memory_auto_capture_enabled" in book;
  if (memories.length === 0 && !hasCaptureSetting) return "";
  const captureSetting = hasCaptureSetting
    ? booleanValue(book.memory_auto_capture_enabled)
      ? "旧版为开启；当前仅存档，没有在墨枢长篇中启用自动捕获。"
      : "旧版为关闭；当前仅存档，没有在墨枢长篇中启用自动捕获。"
    : "旧版未提供；当前未启用自动捕获。";
  const sections = memories.map((rawMemory, index) => {
    const memory = record(rawMemory);
    const preserved = {
      id: stringValue(memory.id),
      tag: stringValue(memory.tag),
      content: stringValue(memory.content),
      created_at: stringValue(memory.created_at),
      updated_at: stringValue(memory.updated_at)
    };
    return [
      `## 记忆 ${index + 1}${preserved.tag ? ` · ${preserved.tag}` : ""}`,
      "",
      `- id：${JSON.stringify(preserved.id)}`,
      `- tag：${JSON.stringify(preserved.tag)}`,
      `- created_at：${JSON.stringify(preserved.created_at)}`,
      `- updated_at：${JSON.stringify(preserved.updated_at)}`,
      "",
      "### 内容",
      "",
      preserved.content,
      "",
      "<details><summary>旧版字段精确副本</summary>",
      "",
      "```json",
      JSON.stringify(preserved, null, 2),
      "```",
      "",
      "原始记录（包含当前模型未识别的扩展字段）：",
      "",
      "```json",
      JSON.stringify(rawMemory, null, 2),
      "```",
      "",
      "</details>"
    ].join("\n");
  });
  return [
    "# 书籍记忆（旧版）",
    "",
    `> 自动捕获设置：${captureSetting}`,
    "",
    ...sections
  ].join("\n");
}

function legacyLinkIds(
  value: unknown,
  warnings: WarningCollector,
  label: string
): string[] {
  const rawValues = Array.isArray(value) ? value : value == null ? [] : [value];
  const ids: string[] = [];
  for (const rawValue of rawValues) {
    const candidate = isRecord(rawValue)
      ? stringValue(rawValue.id).trim()
      : stringValue(rawValue).trim();
    if (!candidate) {
      if (rawValue != null) {
        warnings.add(`${label}包含无法解析的空 ID；原始值已写入迁移证据。`);
        warnings.preserve(
          `${label}（无法解析值）`,
          label,
          serializeJson(rawValue)
        );
      }
      continue;
    }
    if (candidate.length > 512) {
      warnings.add(
        `${label}包含超过当前 ID 上限的值；完整 ID 已写入迁移证据，绑定字段保留前 512 个字符。`
      );
      warnings.preserve(
        `${label}（超长 ID）`,
        label,
        candidate
      );
    }
    const normalized = candidate.slice(0, 512);
    if (!ids.includes(normalized)) ids.push(normalized);
  }
  return ids;
}

function normalizeLegacyMaterialLinks(
  book: Record<string, unknown> | null,
  warnings: WarningCollector
): LinkedMaterialIdsByKind {
  const source = record(book?.linked_material_ids_by_kind);
  const result: LinkedMaterialIdsByKind = {
    character: legacyLinkIds(source.character, warnings, "人设素材库绑定"),
    gimmick: legacyLinkIds(source.gimmick, warnings, "梗素材库绑定"),
    plot: legacyLinkIds(source.plot, warnings, "剧情素材库绑定"),
    draft: legacyLinkIds(source.draft, warnings, "正文素材库绑定"),
    other: legacyLinkIds(source.other, warnings, "其他素材库绑定")
  };
  for (const [kind, rawValue] of Object.entries(source)) {
    if (kind in result) continue;
    const unknownIds = legacyLinkIds(
      rawValue,
      warnings,
      `未知素材分类“${kind}”`
    );
    for (const id of unknownIds) {
      if (!Object.values(result).some((values) => values.includes(id))) {
        result.other.push(id);
      }
    }
    if (unknownIds.length) {
      warnings.add(`旧版未知素材分类“${kind}”已保守归入 other。`);
      warnings.preserveDecision(
        "coerce",
        `book.json.linked_material_ids_by_kind.${kind}`,
        "当前长篇不识别该素材分类，绑定已保守归入 other。",
        rawValue
      );
    }
  }
  for (const id of legacyLinkIds(
    book?.linked_material_id,
    warnings,
    "旧版单值素材库绑定"
  )) {
    if (!Object.values(result).some((values) => values.includes(id))) {
      result.other.push(id);
    }
  }
  return result;
}

function normalizeLegacySkillLinks(
  book: Record<string, unknown> | null,
  warnings: WarningCollector
): LinkedSkillIdsByKind {
  const source = record(book?.linked_skill_ids_by_kind);
  const result: LinkedSkillIdsByKind = {
    general: legacyLinkIds(source.general, warnings, "通用技能库绑定"),
    plot: legacyLinkIds(source.plot, warnings, "剧情技能库绑定"),
    style: legacyLinkIds(source.style, warnings, "文风技能库绑定"),
    other: legacyLinkIds(source.other, warnings, "其他技能库绑定")
  };
  for (const [kind, rawValue] of Object.entries(source)) {
    if (kind in result) continue;
    const unknownIds = legacyLinkIds(
      rawValue,
      warnings,
      `未知技能分类“${kind}”`
    );
    for (const id of unknownIds) {
      if (!Object.values(result).some((values) => values.includes(id))) {
        result.other.push(id);
      }
    }
    if (unknownIds.length) {
      warnings.add(`旧版未知技能分类“${kind}”已保守归入 other。`);
      warnings.preserveDecision(
        "coerce",
        `book.json.linked_skill_ids_by_kind.${kind}`,
        "当前长篇不识别该技能分类，绑定已保守归入 other。",
        rawValue
      );
    }
  }
  for (const id of legacyLinkIds(
    book?.linked_skill_id,
    warnings,
    "旧版单值技能库绑定"
  )) {
    if (!Object.values(result).some((values) => values.includes(id))) {
      result.other.push(id);
    }
  }
  return result;
}

export function createWriteClawLongImportPlan(
  source: WriteClawLongArchiveSource,
  options: CreateWriteClawLongImportPlanOptions = {}
): WriteClawLongImportPlan {
  const warnings = new WarningCollector();
  source.warnings.forEach((warning) => warnings.add(warning));
  const workspace = source.workspace;
  warnings.preserve(
    "旧版本原始工作区完整快照",
    "long_workspace.json",
    serializeJson(workspace)
  );
  if (source.book) {
    warnings.preserve(
      "旧版本原始书籍元数据完整快照",
      "book.json",
      serializeJson(source.book)
    );
  }
  const legacySchemaVersion = Math.max(
    0,
    Math.floor(Number(workspace.schema_version) || 0)
  );
  if (legacySchemaVersion > 5) {
    throw new Error(
      `旧版本长篇 schema v${legacySchemaVersion} 高于当前导入器支持的 v5。`
    );
  }
  if (legacySchemaVersion !== 5) {
    warnings.add(
      `来源长篇 schema 版本为 v${legacySchemaVersion || "未知"}；已按旧版本 v5 兼容字段进行保守迁移。`
    );
  }

  const importedAt = normalizeImportedAt(options.importedAt);
  const namespace = sourceIdentity(source, options.sourceIdentity);
  const ids = new DeterministicIdRegistry(namespace, warnings);
  const documents = createDocumentBuilder(importedAt, warnings);
  const legacyBookId = stringValue(source.book?.id).trim();
  const bookId = ids.allocate(
    "book",
    "longbook",
    legacyBookId,
    contentSha256(namespace)
  );
  const bookTitle = title(
    options.title ?? source.book?.title ?? workspace.title,
    "导入长篇",
    warnings,
    "书名"
  );
  const bookGenre = extractGenre(source.book, options.genre, warnings);
  const memoryArchive = source.book
    ? memoryArchiveMarkdown(source.book)
    : "";
  if (memoryArchive) {
    warnings.preserve(
      "书籍记忆（旧版）",
      "book.json.memories / memory_auto_capture_enabled",
      memoryArchive
    );
    warnings.add(
      "旧版书籍记忆已写入可搜索的“书籍记忆（旧版）”迁移证据；自动捕获设置仅存档，未在当前长篇中启用。"
    );
  }
  if (source.book && isRecord(source.book.expert_draft)) {
    warnings.preserve(
      "专家正文结构（旧版）",
      "book.json.expert_draft",
      serializeJson(source.book.expert_draft)
    );
    warnings.add(
      "book.json 中的旧版专家正文结构已完整存入可搜索迁移证据。"
    );
  }
  (source.evidenceFiles ?? []).forEach((file) => {
    warnings.preserve(
      `旧版附件 · ${file.archivePath.split("/").at(-1) || "未命名文件"}`,
      `ZIP:${file.archivePath}`,
      file.content
    );
    warnings.add(
      `旧版附件“${file.archivePath}”已迁入可搜索的只读证据。`
    );
  });
  const legacyLedger = record(workspace.ledger);
  if (Object.keys(legacyLedger).length > 0) {
    warnings.preserve(
      "全书状态账本（旧版迁移证据）",
      "long_workspace.json.ledger",
      serializeJson(legacyLedger)
    );
    warnings.add(
      "旧版全书状态账本已完整存入可搜索迁移证据；无章节归属的条目不会被静默丢弃。"
    );
  }
  const linkedMaterialIdsByKind = normalizeLegacyMaterialLinks(
    source.book,
    warnings
  );
  const linkedSkillIdsByKind = normalizeLegacySkillLinks(
    source.book,
    warnings
  );
  const hasLegacyBindings =
    Object.values(linkedMaterialIdsByKind).some((values) => values.length > 0) ||
    Object.values(linkedSkillIdsByKind).some((values) => values.length > 0);
  if (hasLegacyBindings) {
    warnings.add(
      "旧版素材库/技能库绑定 ID 已按原分类保留；当前 Catalog 中缺失的 ID 会在 Agent 使用时明确诊断，不会导致导入失败。"
    );
  }

  const plot = record(workspace.plot);
  const bookLineContent = clippedTextDocument(
    plot.book_line,
    warnings,
    "全书主线"
  );
  const bookLine = documents.add(
    LONG_BOOK_LINE_FILE_ID,
    BOOK_LINE_PATH,
    bookLineContent
  );

  const worldSource = record(workspace.worldbuilding);
  let rawWorldCategories = list(worldSource.categories);
  if (rawWorldCategories.length > MAX_STRUCTURAL_WORLD_CATEGORIES) {
    warnings.add(
      `来源世界观分类超过 ${MAX_STRUCTURAL_WORLD_CATEGORIES} 项；当前结构保留前 ${MAX_STRUCTURAL_WORLD_CATEGORIES} 项，其余分类完整保存在迁移证据中。`
    );
    warnings.preserveDecision(
      "drop",
      `long_workspace.json.worldbuilding.categories[${MAX_STRUCTURAL_WORLD_CATEGORIES}:]`,
      "为当前索引和只读迁移证据预留安全容量，超出结构上限的分类未写入可编辑结构。",
      rawWorldCategories.slice(MAX_STRUCTURAL_WORLD_CATEGORIES)
    );
    rawWorldCategories = rawWorldCategories.slice(
      0,
      MAX_STRUCTURAL_WORLD_CATEGORIES
    );
  }
  if (rawWorldCategories.length === 0) {
    rawWorldCategories = DEFAULT_WORLD_CATEGORIES.map(([id, name]) => ({
      id,
      name,
      format: "list",
      items: []
    }));
    warnings.add("来源缺少世界观分类，已补齐七个默认分类。");
  }
  const worldbuilding: LongWorkspaceIndexSnapshot["worldbuilding"] =
    rawWorldCategories.map((rawCategory, index) => {
    const category = record(rawCategory);
    const legacyCategoryId =
      stringValue(category.id).trim() || `category-${index + 1}`;
    const categoryId = ids.allocate(
      "worldbuilding",
      "world",
      category.id,
      `category-${index + 1}`
    );
    const format = category.format === "text" ? "text" : "list";
    if (
      category.format !== undefined &&
      category.format !== "text" &&
      category.format !== "list"
    ) {
      warnings.preserveDecision(
        "coerce",
        `long_workspace.json.worldbuilding.categories[${index}].format`,
        "未知世界观格式已回退为 list。",
        category.format
      );
    }
    let content = "";
    let listItems: Array<{
      id: string;
      title: string;
      content: string;
    }> = [];
    if (format === "text") {
      content = clipped(
        [stringValue(category.overview), stringValue(category.text)]
          .map((part) => part.trim())
          .filter(Boolean)
          .join("\n\n"),
        MAX_WORLD_TEXT_DOCUMENT_CHARACTERS,
        warnings,
        `世界观“${legacyCategoryId}”文本正文`
      );
    } else {
      const markdownItems: Array<{
        id: string;
        title: string;
        content: string;
      }> = [];
      let remainingContentCharacters =
        MAX_WORLD_LIST_CONTENT_CHARACTERS;
      const overview = worldItemContent(
        category.overview,
        warnings,
        `世界观“${legacyCategoryId}”概览`,
        `long_workspace.json.worldbuilding.categories[${index}].overview`,
        category.overview
      ).trim();
      if (overview) {
        const retainedOverview = overview.slice(
          0,
          remainingContentCharacters
        );
        remainingContentCharacters -= retainedOverview.length;
        markdownItems.push({
          id: ids.allocate(
            `worldItem:${legacyCategoryId}`,
            "worlditem",
            "__overview__",
            "overview"
          ),
          title: "分类概览",
          content: retainedOverview
        });
      }
      let rawItems = list(category.items);
      const itemCapacity =
        MAX_WORLD_ITEMS_PER_CATEGORY - markdownItems.length;
      if (rawItems.length > itemCapacity) {
        warnings.add(
          `世界观“${legacyCategoryId}”条目超过 ${MAX_WORLD_ITEMS_PER_CATEGORY} 项；结构保留前 ${itemCapacity} 个旧版条目，其余条目完整保存在迁移证据中。`
        );
        warnings.preserveDecision(
          "drop",
          `long_workspace.json.worldbuilding.categories[${index}].items[${itemCapacity}:]`,
          "当前世界观 Markdown 列表最多容纳 10,000 项，超出部分未写入可编辑结构。",
          rawItems.slice(itemCapacity)
        );
        rawItems = rawItems.slice(0, itemCapacity);
      }
      let contentBudgetDecisionRecorded = false;
      rawItems.forEach((rawItem, itemIndex) => {
        const item = record(rawItem);
        const itemContentSource = [
          stringValue(item.description).trim()
            ? `描述：${stringValue(item.description).trim()}`
            : "",
          stringValue(item.detail ?? item.introduction).trim()
        ]
          .filter(Boolean)
          .join("\n\n");
        const itemContent =
          remainingContentCharacters > 0
            ? worldItemContent(
                itemContentSource,
                warnings,
                `世界观条目 ${itemIndex + 1} 内容`,
                `long_workspace.json.worldbuilding.categories[${index}].items[${itemIndex}]`,
                rawItem
              )
            : "";
        const retainedContent = itemContent.slice(
          0,
          remainingContentCharacters
        );
        if (
          retainedContent.length < itemContent.length &&
          !contentBudgetDecisionRecorded
        ) {
          contentBudgetDecisionRecorded = true;
          warnings.add(
            `世界观“${legacyCategoryId}”列表正文超过当前单文档安全预算；后续结构正文已裁剪，完整条目仍保存在迁移证据中。`
          );
          warnings.preserveDecision(
            "coerce",
            `long_workspace.json.worldbuilding.categories[${index}].items[${itemIndex}:]`,
            "当前世界观列表文档需保持在 16 MiB 解析预算内，后续条目正文已裁剪。",
            rawItems.slice(itemIndex)
          );
        }
        if (
          remainingContentCharacters === 0 &&
          itemContentSource &&
          !contentBudgetDecisionRecorded
        ) {
          contentBudgetDecisionRecorded = true;
          warnings.add(
            `世界观“${legacyCategoryId}”列表正文超过当前单文档安全预算；后续结构正文已裁剪，完整条目仍保存在迁移证据中。`
          );
          warnings.preserveDecision(
            "coerce",
            `long_workspace.json.worldbuilding.categories[${index}].items[${itemIndex}:]`,
            "当前世界观列表文档需保持在 16 MiB 解析预算内，后续条目正文已裁剪。",
            rawItems.slice(itemIndex)
          );
        }
        remainingContentCharacters -= retainedContent.length;
        markdownItems.push({
          id: ids.allocate(
            `worldItem:${legacyCategoryId}`,
            "worlditem",
            item.id,
            `item-${itemIndex + 1}`
          ),
          title: worldItemTitle(
            item.name,
            `未命名条目${itemIndex + 1}`,
            warnings,
            `世界观条目 ${itemIndex + 1} 标题`,
            `long_workspace.json.worldbuilding.categories[${index}].items[${itemIndex}].name`
          ),
          content: retainedContent
        });
      });
      const legacyText = stringValue(category.text).trim();
      if (legacyText && markdownItems.length === 0) {
        const legacyContent = worldItemContent(
          legacyText,
          warnings,
          `世界观“${legacyCategoryId}”正文`,
          `long_workspace.json.worldbuilding.categories[${index}].text`,
          category.text
        ).slice(0, remainingContentCharacters);
        markdownItems.push({
          id: ids.allocate(
            `worldItem:${legacyCategoryId}`,
            "worlditem",
            "__legacy_text__",
            "legacy-text"
          ),
          title: "正文",
          content: legacyContent
        });
      }
      listItems = markdownItems;
    }
    const categoryTitle = title(
      category.name,
      `未命名分类${index + 1}`,
      warnings,
      `世界观分类 ${index + 1} 标题`
    );
    return format === "text"
      ? {
          id: categoryId,
          title: categoryTitle,
          order: index + 1,
          format: "text" as const,
          contentAuthority: "markdown" as const,
          file: documents.add(
            longWorldbuildingFileId(categoryId),
            longWorldbuildingContentPath(categoryId),
            content
          )
        }
      : {
          id: categoryId,
          title: categoryTitle,
          order: index + 1,
          format: "list" as const,
          contentAuthority: "files" as const,
          overview: documents.add(
            longWorldbuildingOverviewFileId(categoryId),
            longWorldbuildingOverviewContentPath(categoryId),
            ""
          ),
          items: listItems.map((item, itemIndex) => ({
            id: item.id,
            title: item.title,
            order: itemIndex + 1,
            file: documents.add(
              longWorldbuildingItemFileId(item.id),
              longWorldbuildingItemContentPath(categoryId, item.id),
              item.content
            )
          }))
        };
  });

  const charactersSource = record(workspace.characters);
  const characters: LongWorkspaceIndexSnapshot["characters"] = [];
  const characterFiles: LongWorkspaceIndexSnapshot["characterFiles"] = [];
  for (const [legacyGroup, group] of CHARACTER_GROUPS) {
    const rows = sourceRows(charactersSource[legacyGroup]);
    rows.forEach((rawCharacter, index) => {
      const character = record(rawCharacter);
      const rawAliases = list(character.aliases);
      if (rawAliases.length > 64) {
        warnings.preserve(
          `人物 ${index + 1} 别名（完整列表）`,
          `characters.${legacyGroup}[${index}].aliases`,
          serializeJson(rawAliases)
        );
        warnings.add(
          `人物 ${index + 1} 别名超过 64 项；结构保留前 64 项，完整列表已写入迁移证据。`
        );
      }
      const characterId = ids.allocate(
        "character",
        "character",
        character.id,
        `${legacyGroup}-${index + 1}`
      );
      const normalizedAliases = rawAliases
        .map((alias, aliasIndex) =>
          clipped(
            stringValue(alias).trim(),
            120,
            warnings,
            `人物 ${index + 1} 别名 ${aliasIndex + 1}`
          ).trim()
        )
        .filter(Boolean);
      normalizedAliases.forEach((alias, aliasIndex) => {
        if (normalizedAliases.indexOf(alias) !== aliasIndex) {
          warnings.preserveDecision(
            "merge",
            `long_workspace.json.characters.${legacyGroup}.entries[${index}].aliases[${aliasIndex}]`,
            "规范化后重复的人物别名已合并。",
            rawAliases[aliasIndex]
          );
        }
      });
      characters.push({
        id: characterId,
        name: title(
          character.name,
          `未命名人物${index + 1}`,
          warnings,
          `人物 ${index + 1} 姓名`
        ),
        group,
        order: index + 1,
        aliases: normalizedAliases
          .filter((alias, aliasIndex, aliases) => aliases.indexOf(alias) === aliasIndex)
          .slice(0, 64)
      });
      characterFiles.push({
        characterId,
        coreProfile: documents.add(
          longCharacterCoreProfileFileId(characterId),
          characterPath(characterId, "core-profile.md"),
          clippedTextDocument(
            character.core_profile,
            warnings,
            "人物核心档案"
          )
        ),
        relationships: documents.add(
          longCharacterRelationshipsFileId(characterId),
          characterPath(characterId, "relationships.md"),
          clippedTextDocument(
            character.relationships,
            warnings,
            "人物关系"
          )
        ),
        currentState: documents.add(
          longCharacterCurrentStateFileId(characterId),
          characterPath(characterId, "current-state.md"),
          clippedTextDocument(
            character.current_state,
            warnings,
            "人物当前状态"
          )
        ),
        history: documents.add(
          longCharacterHistoryFileId(characterId),
          characterPath(characterId, "history.md"),
          clippedTextDocument(
            character.history,
            warnings,
            "人物历史"
          )
        )
      });
    });
  }

  let rawVolumes = list(plot.volumes);
  if (rawVolumes.length === 0) {
    rawVolumes = [{ id: "volume-1", name: "第一卷", outline: "", order: 1 }];
    warnings.add("来源缺少分卷，已补充默认第一卷。");
  }
  const volumeRows = rawVolumes
    .map((rawVolume, sourceIndex) => {
      const volume = record(rawVolume);
      return {
        raw: volume,
        sourceIndex,
        legacyId: stringValue(volume.id).trim() || `volume-${sourceIndex + 1}`,
        id: ids.allocate(
          "volume",
          "volume",
          volume.id,
          `volume-${sourceIndex + 1}`
        ),
        sourceOrder: positiveNumber(volume.order, sourceIndex + 1)
      };
    })
    .sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder ||
        left.sourceIndex - right.sourceIndex
    );
  const volumes = volumeRows.map((row, index) => ({
    id: row.id,
    title: title(
      row.raw.name,
      `第${index + 1}卷`,
      warnings,
      `分卷 ${index + 1} 标题`
    ),
    order: index + 1,
    summary: clipped(
      row.raw.outline,
      MAX_INDEX_TEXT,
      warnings,
      `分卷 ${index + 1} 大纲`
    )
  }));

  const rawArcs = list(plot.arcs);
  const arcRows = rawArcs.map((rawArc, sourceIndex) => {
    const arc = record(rawArc);
    const resolvedVolumeId = ids.resolve("volume", arc.volume_id);
    if (!resolvedVolumeId) {
      warnings.add("部分剧情弧引用了不存在的分卷，已迁入第一卷。");
      warnings.preserveDecision(
        "unresolved-reference",
        `long_workspace.json.plot.arcs[${sourceIndex}].volume_id`,
        "剧情弧引用的分卷不存在，已迁入第一卷。",
        rawArc
      );
    }
    return {
      raw: arc,
      sourceIndex,
      legacyId: stringValue(arc.id).trim() || `arc-${sourceIndex + 1}`,
      id: ids.allocate(
        "arc",
        "arc",
        arc.id,
        `arc-${sourceIndex + 1}`
      ),
      volumeId: resolvedVolumeId ?? volumes[0]!.id,
      sourceOrder: positiveNumber(arc.order, sourceIndex + 1)
    };
  });
  if (arcRows.length === 0) {
    const fallbackId = ids.allocate("arc", "arc", "arc-1-1", "arc-1-1");
    arcRows.push({
      raw: { name: "第一剧情弧线", outline: "" },
      sourceIndex: 0,
      legacyId: "arc-1-1",
      id: fallbackId,
      volumeId: volumes[0]!.id,
      sourceOrder: 1
    });
    warnings.add("来源缺少有效剧情弧，已补充默认剧情弧。");
  }
  const arcOrderByVolume = new Map<string, number>();
  arcRows.sort(
    (left, right) =>
      volumes.findIndex(({ id }) => id === left.volumeId) -
        volumes.findIndex(({ id }) => id === right.volumeId) ||
      left.sourceOrder - right.sourceOrder ||
      left.sourceIndex - right.sourceIndex
  );
  const arcs = arcRows.map((row) => {
    const order = (arcOrderByVolume.get(row.volumeId) ?? 0) + 1;
    arcOrderByVolume.set(row.volumeId, order);
    return {
      id: row.id,
      volumeId: row.volumeId,
      title: title(
        row.raw.name,
        `剧情弧${order}`,
        warnings,
        `剧情弧 ${order} 标题`
      ),
      order,
      outline: clipped(
        row.raw.outline,
        MAX_INDEX_TEXT,
        warnings,
        `剧情弧 ${order} 大纲`
      )
    };
  });

  const rawChapters = record(workspace.chapters);
  const rawCards = [...list(plot.chapter_cards)];
  const knownStageIds = new Set(
    rawCards.map((rawCard) => stringValue(record(rawCard).stage_id).trim())
  );
  for (const stageId of Object.keys(rawChapters)) {
    if (!stageId || knownStageIds.has(stageId)) continue;
    rawCards.push({
      id: `chapter-from-stage:${stageId}`,
      volume_id: volumeRows[0]!.legacyId,
      stage_id: stageId,
      title: record(rawChapters[stageId]).title || "未命名章节",
      narrative_order: rawCards.length + 1
    });
    knownStageIds.add(stageId);
    warnings.add("来源存在没有章卡的章节正文，已为其补建章卡。");
  }
  if (rawCards.length === 0) {
    rawCards.push({
      id: "chapter-card-1-1-1",
      volume_id: volumeRows[0]!.legacyId,
      stage_id: "draft.volume-1.arc-1.chapter-1",
      title: "第一章",
      narrative_order: 1
    });
    warnings.add("来源缺少章卡，已补充默认第一章。");
  }

  const chapterRows = rawCards.map((rawCard, sourceIndex) => {
    const card = record(rawCard);
    const requestedVolume = ids.resolve("volume", card.volume_id);
    const arcId = ids.resolve("arc", card.arc_id) ?? null;
    if (card.arc_id && arcId === null) {
      warnings.add("部分章卡引用了不存在的剧情弧，已移除该关联。");
      warnings.preserveDecision(
        "unresolved-reference",
        `long_workspace.json.plot.chapter_cards[${sourceIndex}].arc_id`,
        "章卡引用的剧情弧不存在，已保留章卡并移除剧情点关联。",
        rawCard
      );
    }
    const currentArc =
      arcId === null ? undefined : arcs.find(({ id }) => id === arcId);
    const stageId =
      stringValue(card.stage_id).trim() || `legacy-stage-${sourceIndex + 1}`;
    return {
      raw: card,
      sourceIndex,
      stageId,
      legacyId: stringValue(card.id).trim() || `chapter-${sourceIndex + 1}`,
      id: ids.allocate(
        "chapter",
        "chapter",
        card.id,
        `chapter-${sourceIndex + 1}:${stageId}`
      ),
      volumeId: currentArc?.volumeId ?? requestedVolume ?? volumes[0]!.id,
      arcId: currentArc?.id ?? null,
      sourceOrder: positiveNumber(
        card.narrative_order ?? card.order,
        sourceIndex + 1
      )
    };
  });
  chapterRows.forEach((row) => ids.alias("chapterStage", row.stageId, row.id));
  chapterRows.sort(
    (left, right) =>
      volumes.findIndex(({ id }) => id === left.volumeId) -
        volumes.findIndex(({ id }) => id === right.volumeId) ||
      left.sourceOrder - right.sourceOrder ||
      left.sourceIndex - right.sourceIndex
  );
  const narrativeOrderByVolume = new Map<string, number>();
  const characterNameById = new Map(
    characters.map((character) => [character.id, character.name])
  );
  const chapterCards: LongWorkspaceIndexSnapshot["plot"]["chapterCards"] = [];
  const chapterFiles: LongWorkspaceIndexSnapshot["chapters"] = [];
  const committedChapterRows: Array<{
    chapterCardId: string;
    legacyCardId: string;
    stageId: string;
    rawChapter: Record<string, unknown>;
  }> = [];
  const currentChapterIdByLegacyStage = new Map<string, string>();
  let committedChapterCount = 0;
  let preservedLedgerChapterCount = 0;
  for (const row of chapterRows) {
    const narrativeOrder =
      (narrativeOrderByVolume.get(row.volumeId) ?? 0) + 1;
    narrativeOrderByVolume.set(row.volumeId, narrativeOrder);
    const rawChapter = record(rawChapters[row.stageId]);
    const characterNames = uniqueMappedReferences(
      row.raw.characters,
      "character",
      ids,
      warnings,
      `long_workspace.json.plot.chapter_cards[${row.sourceIndex}].characters`
    )
      .map((characterId) => characterNameById.get(characterId) ?? characterId)
      .join("、");
    const cardContent = [
      clipped(
        row.raw.outline,
        MAX_INDEX_TEXT,
        warnings,
        `章节 ${narrativeOrder} 大纲`
      ).trim(),
      clipped(
        row.raw.world_constraints,
        MAX_INDEX_TEXT,
        warnings,
        `章节 ${narrativeOrder} 世界约束`
      ).trim(),
      characterNames ? `出场人物：${characterNames}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    chapterCards.push({
      id: row.id,
      volumeId: row.volumeId,
      primaryArcId: row.arcId,
      title: title(
        rawChapter.title ?? row.raw.title,
        `第${narrativeOrder}章`,
        warnings,
        `章节 ${narrativeOrder} 标题`
      ),
      narrativeOrder
    });
    const legacyStages = record(source.book?.stages);
    const body = clippedTextDocument(
      rawChapter.body ?? legacyStages[row.stageId],
      warnings,
      "章节正文"
    );
    const rawCharacterState = safeUnicode(
      rawChapter.character_state,
      warnings,
      "章节人物状态"
    );
    const characterState = clippedTextDocument(
      appendLegacyLedgerText(
        workspace,
        row.legacyId,
        row.stageId,
        rawCharacterState
      ),
      warnings,
      "章节人物状态（含旧版账本）"
    );
    if (characterState !== rawCharacterState) preservedLedgerChapterCount += 1;
    const handoff = clippedTextDocument(
      rawChapter.handoff ?? rawChapter.handoff_notes,
      warnings,
      "章节交接注意"
    );
    if (
      booleanValue(rawChapter.committed) ||
      stringValue(rawChapter.commit_id).trim()
    ) {
      committedChapterCount += 1;
      committedChapterRows.push({
        chapterCardId: row.id,
        legacyCardId: row.legacyId,
        stageId: row.stageId,
        rawChapter
      });
    }
    chapterFiles.push({
      chapterCardId: row.id,
      bodyStatus: body.trim() ? "written" : "empty",
      body: documents.add(
        longChapterBodyFileId(row.id),
        chapterPath(row.id, "body.md"),
        body
      ),
      card: documents.add(
        longChapterCardFileId(row.id),
        chapterPath(row.id, "card.md"),
        cardContent
      ),
      characterState: documents.add(
        longChapterCharacterStateFileId(row.id),
        chapterPath(row.id, "character-state.md"),
        characterState
      ),
      handoff: documents.add(
        longChapterHandoffFileId(row.id),
        chapterPath(row.id, "handoff.md"),
        handoff
      ),
      foreshadowingChanges: documents.add(
        longChapterForeshadowingChangesFileId(row.id),
        longChapterContinuityFilePath(
          row.id,
          "foreshadowing-changes.md"
        ),
        ""
      ),
      worldReveals: null,
      characterContinuity: [],
      commitId: null
    });
    currentChapterIdByLegacyStage.set(row.stageId, row.id);
  }
  if (committedChapterCount > 0) {
    warnings.add(
      `${committedChapterCount} 个旧版已落盘章节将恢复为只读、不可逆的迁移检查点；旧版没有精确 before/after 的记录不会伪造成可逆提交。`
    );
  }
  if (preservedLedgerChapterCount > 0) {
    warnings.add(
      `旧版状态账本文本已并入 ${preservedLedgerChapterCount} 个章节的人物状态文件，等待重新核验后提交。`
    );
  }

  const eventRows = list(plot.story_events)
    .map((rawEvent, sourceIndex) => {
      const event = record(rawEvent);
      return {
        raw: event,
        sourceIndex,
        legacyId: stringValue(event.id).trim() || `event-${sourceIndex + 1}`,
        id: ids.allocate(
          "event",
          "event",
          event.id,
          `event-${sourceIndex + 1}`
        ),
        sourceOrder: positiveNumber(
          event.story_order ?? event.order,
          sourceIndex + 1
        )
      };
    })
    .sort(
      (left, right) =>
        left.sourceOrder - right.sourceOrder ||
        left.sourceIndex - right.sourceIndex
    );
  const storyEvents = eventRows.map((row, index) => ({
    id: row.id,
    title: title(
      row.raw.title ?? row.raw.name,
      `未命名故事事件${index + 1}`,
      warnings,
      `故事事件 ${index + 1} 标题`
    ),
    summary: clipped(
      row.raw.summary ?? row.raw.description,
      MAX_INDEX_TEXT,
      warnings,
      `故事事件 ${index + 1} 摘要`
    ),
    timeMode: enumValue(
      row.raw.time_mode,
      STORY_TIME_MODES,
      "unknown",
      {
        absolute: "exact",
        simultaneous: "sequence",
        overlapping: "sequence"
      },
      {
        warnings,
        sourcePath: `long_workspace.json.plot.story_events[${row.sourceIndex}].time_mode`
      }
    ) as "exact" | "relative" | "sequence" | "unknown",
    timeLabel: clipped(
      row.raw.time_label ?? row.raw.story_time,
      1_000,
      warnings,
      `故事事件 ${index + 1} 时间标签`
    ),
    timeValue: clipped(
      row.raw.time_value,
      1_000,
      warnings,
      `故事事件 ${index + 1} 时间值`
    ),
    storyOrder: index + 1,
    location: clipped(
      row.raw.location,
      1_000,
      warnings,
      `故事事件 ${index + 1} 地点`
    ),
    arcIds: uniqueMappedReferences(
      row.raw.arc_ids,
      "arc",
      ids,
      warnings,
      `long_workspace.json.plot.story_events[${row.sourceIndex}].arc_ids`
    ),
    characterIds: uniqueMappedReferences(
      row.raw.character_ids,
      "character",
      ids,
      warnings,
      `long_workspace.json.plot.story_events[${row.sourceIndex}].character_ids`
    )
  }));

  const eventConnections: LongWorkspaceIndexSnapshot["plot"]["eventConnections"] =
    [];
  const connectionKeys = new Set<string>();
  const beforeAdjacency = new Map<string, Set<string>>();
  list(plot.event_links).forEach((rawConnection, sourceIndex) => {
    const connection = record(rawConnection);
    const sourcePath =
      `long_workspace.json.plot.event_links[${sourceIndex}]`;
    let sourceEventId = ids.resolve("event", connection.source_event_id);
    let targetEventId = ids.resolve("event", connection.target_event_id);
    let type = stringValue(connection.type ?? connection.kind).trim();
    if (type === "after") {
      [sourceEventId, targetEventId] = [targetEventId, sourceEventId];
      type = "before";
      warnings.preserveDecision(
        "coerce",
        `${sourcePath}.type`,
        "after 连接已通过交换端点规范化为 before。",
        connection.type ?? connection.kind
      );
    }
    type = enumValue(
      type,
      EVENT_CONNECTION_TYPES,
      "before",
      { simultaneous: "same_time" },
      { warnings, sourcePath: `${sourcePath}.type` }
    );
    if (
      !sourceEventId ||
      !targetEventId ||
      sourceEventId === targetEventId
    ) {
      warnings.add("部分事件连接引用无效或自引用，已跳过。");
      warnings.preserveDecision(
        !sourceEventId || !targetEventId
          ? "unresolved-reference"
          : "drop",
        sourcePath,
        !sourceEventId || !targetEventId
          ? "连接端点引用的旧版事件不存在，连接已跳过。"
          : "事件连接自引用，无法进入当前结构，已跳过。",
        rawConnection
      );
      return;
    }
    const key = `${sourceEventId}\0${targetEventId}\0${type}`;
    if (connectionKeys.has(key)) {
      warnings.add("重复的事件连接已合并。");
      warnings.preserveDecision(
        "merge",
        sourcePath,
        "相同端点和类型的事件连接已经存在，本条已合并。",
        rawConnection
      );
      return;
    }
    if (
      type === "before" &&
      beforePathExists(beforeAdjacency, targetEventId, sourceEventId)
    ) {
      warnings.add("会形成循环的 before 事件连接已跳过。");
      warnings.preserveDecision(
        "drop",
        sourcePath,
        "该 before 连接会形成有向循环，已跳过。",
        rawConnection
      );
      return;
    }
    connectionKeys.add(key);
    if (type === "before") {
      const targets = beforeAdjacency.get(sourceEventId) ?? new Set<string>();
      targets.add(targetEventId);
      beforeAdjacency.set(sourceEventId, targets);
    }
    eventConnections.push({
      id: ids.allocate(
        "connection",
        "connection",
        connection.id,
        `connection-${sourceIndex + 1}`
      ),
      sourceEventId,
      targetEventId,
      type: type as
        | "before"
        | "same_time"
        | "overlaps"
        | "causes"
        | "enables"
        | "conceals",
      note: clipped(
        connection.note ?? connection.description,
        MAX_SHORT_TEXT,
        warnings,
        `事件连接 ${sourceIndex + 1} 说明`
      )
    });
  });

  const rawPlacements = list(plot.narrative_placements);
  const placementRows = rawPlacements.flatMap((rawPlacement, sourceIndex) => {
    const placement = record(rawPlacement);
    const sourcePath =
      `long_workspace.json.plot.narrative_placements[${sourceIndex}]`;
    const eventId = ids.resolve("event", placement.event_id);
    const chapterCardId =
      ids.resolve("chapter", placement.chapter_card_id) ??
      currentChapterIdByLegacyStage.get(
        stringValue(placement.chapter_stage_id).trim()
      );
    if (!eventId || !chapterCardId) {
      warnings.add("部分叙事落点引用了不存在的事件或章卡，已跳过。");
      warnings.preserveDecision(
        "unresolved-reference",
        sourcePath,
        !eventId && !chapterCardId
          ? "叙事落点的事件和章卡引用均无法解析，已跳过。"
          : !eventId
            ? "叙事落点的事件引用无法解析，已跳过。"
            : "叙事落点的章卡引用无法解析，已跳过。",
        rawPlacement
      );
      return [];
    }
    return [
      {
        raw: placement,
        sourceIndex,
        legacyId:
          stringValue(placement.id).trim() || `placement-${sourceIndex + 1}`,
        id: ids.allocate(
          "placement",
          "placement",
          placement.id,
          `placement-${sourceIndex + 1}`
        ),
        eventId,
        chapterCardId,
        sourceOrder: positiveNumber(placement.order, sourceIndex + 1)
      }
    ];
  });
  placementRows.sort(
    (left, right) =>
      chapterCards.findIndex(({ id }) => id === left.chapterCardId) -
        chapterCards.findIndex(({ id }) => id === right.chapterCardId) ||
      left.sourceOrder - right.sourceOrder ||
      left.sourceIndex - right.sourceIndex
  );
  const placementOrderByChapter = new Map<string, number>();
  const narrativePlacements: LongWorkspaceIndexSnapshot["plot"]["narrativePlacements"] =
    placementRows.map((row) => {
    const orderInChapter =
      (placementOrderByChapter.get(row.chapterCardId) ?? 0) + 1;
    placementOrderByChapter.set(row.chapterCardId, orderInChapter);
    return {
      id: row.id,
      eventId: row.eventId,
      chapterCardId: row.chapterCardId,
      orderInChapter,
      mode: enumValue(
        row.raw.mode ?? row.raw.kind,
        NARRATIVE_MODES,
        "scene",
        { live: "scene" },
        {
          warnings,
          sourcePath: `long_workspace.json.plot.narrative_placements[${row.sourceIndex}].mode`
        }
      ) as
        | "scene"
        | "flashback"
        | "retelling"
        | "clue"
        | "misdirection"
        | "reveal"
        | "dream"
        | "prophecy",
      disclosure: enumValue(
        row.raw.disclosure,
        DISCLOSURE_LEVELS,
        "hint",
        {},
        {
          warnings,
          sourcePath: `long_workspace.json.plot.narrative_placements[${row.sourceIndex}].disclosure`
        }
      ) as "hint" | "partial" | "full" | "false",
      writingPrompt: clipped(
        row.raw.note ?? row.raw.intended_knowledge,
        MAX_SHORT_TEXT,
        warnings,
        `叙事落点 ${row.sourceIndex + 1} 写作提示`
      ),
      status: executionStatus(
        row.raw.execution_status ?? row.raw.status,
        warnings,
        `long_workspace.json.plot.narrative_placements[${row.sourceIndex}].execution_status`
      ),
      commitId: null
    };
  });
  const placementByLegacyId = new Map<string, (typeof placementRows)[number]>();
  placementRows.forEach((row) => {
    if (!placementByLegacyId.has(row.legacyId)) {
      placementByLegacyId.set(row.legacyId, row);
    }
  });

  const legacyBeatStatusById = new Map<string, unknown>();
  const foreshadowing: LongWorkspaceIndexSnapshot["plot"]["foreshadowing"] =
    list(plot.foreshadowing).map(
    (rawThread, threadIndex) => {
      const thread = record(rawThread);
      const threadId = ids.allocate(
        "foreshadowing",
        "foreshadow",
        thread.id,
        `foreshadow-${threadIndex + 1}`
      );
      const threadTitle = title(
        thread.name ?? thread.title,
        `未命名伏笔${threadIndex + 1}`,
        warnings,
        `伏笔 ${threadIndex + 1} 标题`
      );
      const beats = list(thread.beats)
        .map((rawBeat, beatIndex) => {
          const beat = record(rawBeat);
          const beatSourcePath =
            `long_workspace.json.plot.foreshadowing[${threadIndex}].beats[${beatIndex}]`;
          const legacyPlacementId = stringValue(beat.placement_id).trim();
          const placement = placementByLegacyId.get(legacyPlacementId);
          if (legacyPlacementId && !placement) {
            warnings.preserveDecision(
              "unresolved-reference",
              `${beatSourcePath}.placement_id`,
              "伏笔节拍引用的旧版叙事落点不存在；将继续尝试独立事件或章卡引用。",
              beat.placement_id
            );
          }
          const placementId = placement?.id ?? null;
          const directEventId = ids.resolve("event", beat.event_id);
          if (
            !placement &&
            stringValue(beat.event_id).trim() &&
            !directEventId
          ) {
            warnings.preserveDecision(
              "unresolved-reference",
              `${beatSourcePath}.event_id`,
              "伏笔节拍引用的旧版事件不存在。",
              beat.event_id
            );
          }
          const eventId = placement?.eventId ?? directEventId ?? null;
          const directChapterId = ids.resolve(
            "chapter",
            beat.chapter_card_id
          );
          const stageChapterId = currentChapterIdByLegacyStage.get(
            stringValue(beat.chapter_stage_id).trim()
          );
          if (
            !placement &&
            !directChapterId &&
            !stageChapterId &&
            (stringValue(beat.chapter_card_id).trim() ||
              stringValue(beat.chapter_stage_id).trim())
          ) {
            warnings.preserveDecision(
              "unresolved-reference",
              `${beatSourcePath}.chapter_card_id`,
              "伏笔节拍引用的旧版章卡或章节阶段不存在。",
              {
                chapter_card_id: beat.chapter_card_id,
                chapter_stage_id: beat.chapter_stage_id
              }
            );
          }
          const chapterCardId =
            placement?.chapterCardId ??
            directChapterId ??
            stageChapterId ??
            null;
          let plannedScope = clipped(
            beat.target_scope,
            1_000,
            warnings,
            `伏笔节拍 ${beatIndex + 1} 范围`
          );
          if (
            !eventId &&
            !placementId &&
            !chapterCardId &&
            !plannedScope.trim()
          ) {
            plannedScope = `旧版未指定范围：${threadTitle}`;
          }
          const beatId = ids.allocate(
              "beat",
              "beat",
              beat.id,
              `foreshadow-${threadIndex + 1}-beat-${beatIndex + 1}`
            );
          legacyBeatStatusById.set(
            beatId,
            beat.status ?? beat.execution_status
          );
          return {
            id: beatId,
            type: enumValue(
              beat.kind ?? beat.type,
              BEAT_TYPES,
              "plant",
              {
                resolve: "payoff",
                resolution: "payoff",
                consequence: "aftermath"
              },
              {
                warnings,
                sourcePath: `${beatSourcePath}.type`
              }
            ) as
              | "source"
              | "plant"
              | "reinforce"
              | "misdirect"
              | "partial_reveal"
              | "reveal"
              | "payoff"
              | "aftermath",
            order: beatIndex + 1,
            eventId,
            placementId,
            chapterCardId,
            plannedScope,
            note: clipped(
              beat.intended_knowledge ?? beat.note,
              MAX_SHORT_TEXT,
              warnings,
              `伏笔节拍 ${beatIndex + 1} 说明`
            ),
            status: executionStatus(
              beat.status,
              warnings,
              `${beatSourcePath}.status`
            ),
            commitId: null
          };
        });
      const truthEventId = ids.resolve("event", thread.truth_event_id);
      if (stringValue(thread.truth_event_id).trim() && !truthEventId) {
        warnings.preserveDecision(
          "unresolved-reference",
          `long_workspace.json.plot.foreshadowing[${threadIndex}].truth_event_id`,
          "伏笔线引用的真相事件不存在，已保守置空。",
          thread.truth_event_id
        );
      }
      return {
        id: threadId,
        title: threadTitle,
        coreQuestion: clipped(
          thread.question,
          MAX_INDEX_TEXT,
          warnings,
          `伏笔 ${threadIndex + 1} 核心问题`
        ),
        truthEventId: truthEventId ?? null,
        expectedReaderEffect: clipped(
          thread.intended_effect,
          MAX_INDEX_TEXT,
          warnings,
          `伏笔 ${threadIndex + 1} 预期效果`
        ),
        status: enumValue(
          thread.status,
          FORESHADOWING_STATUSES,
          "open",
          { progressed: "progressing", completed: "resolved" },
          {
            warnings,
            sourcePath: `long_workspace.json.plot.foreshadowing[${threadIndex}].status`
          }
        ) as "planned" | "open" | "progressing" | "resolved" | "abandoned",
        beats
      };
    }
  );

  const legacyCommits: LongWorkspaceIndexSnapshot["ledger"]["commits"] =
    [];
  for (const thread of foreshadowing) {
    if (thread.status !== "abandoned") {
      thread.status =
        deriveLongForeshadowingStatusFromCommittedBeats(thread.beats);
    }
  }
  if (committedChapterRows.length > 0) {
    const committedIds = new Set(
      committedChapterRows.map(({ chapterCardId }) => chapterCardId)
    );
    const prefixIsContiguous = chapterCards.every(
      (chapter, index) =>
        index < committedChapterRows.length
          ? committedIds.has(chapter.id)
          : !committedIds.has(chapter.id)
    );
    if (!prefixIsContiguous) {
      throw new Error(
        "旧版已落盘章节不是连续叙事前缀，无法安全恢复连续性检查点。"
      );
    }

    const placementRawById = new Map(
      placementRows.map((row) => [row.id, row.raw])
    );
    for (const [commitIndex, committedRow] of committedChapterRows.entries()) {
      const sequence = commitIndex + 1;
      const legacyCommitId = stringValue(
        committedRow.rawChapter.commit_id
      ).trim();
      const rawCommittedAt = stringValue(
        committedRow.rawChapter.committed_at
      ).trim();
      const parsedCommittedAt = new Date(rawCommittedAt);
      if (
        legacySchemaVersion >= 3 &&
        (!legacyCommitId ||
          !rawCommittedAt ||
          Number.isNaN(parsedCommittedAt.valueOf()) ||
          !hasLegacyTimelineAudit(
            workspace,
            committedRow.legacyCardId,
            committedRow.stageId,
            legacyCommitId
          ))
      ) {
        throw new Error(
          `旧版 schema v${legacySchemaVersion} 的已提交章节缺少 commit_id、committed_at 或时间线审计，已拒绝不完整迁移。`
        );
      }
      const commitId = ids.allocate(
        "commit",
        "commit",
        legacyCommitId,
        `legacy-import-${sequence}-${committedRow.legacyCardId}`
      );
      const committedAt = Number.isNaN(parsedCommittedAt.valueOf())
        ? new Date(sequence * 1_000).toISOString()
        : parsedCommittedAt.toISOString();
      if (!rawCommittedAt) {
        warnings.add(
          "旧版 v1/v2 已提交章节缺少时间，迁移检查点使用稳定的未知时间占位。"
        );
      }

      const placements = narrativePlacements.filter(
        ({ chapterCardId }) =>
          chapterCardId === committedRow.chapterCardId
      );
      const placementChanges = placements.map((placement) => {
        const raw = placementRawById.get(placement.id);
        const decision =
          legacyExecutionDecision(
            raw?.execution_status ?? raw?.status
          ) ?? "missed";
        placement.status = decision;
        placement.commitId = commitId;
        return {
          placementId: placement.id,
          before: { status: "planned" as const, commitId: null },
          after: { status: decision, commitId },
          note:
            clipped(
              raw?.note ?? raw?.writing_prompt,
              4_000,
              warnings,
              "旧版落点迁移证据"
            ).trim() || "旧版检查点未提供单独证据。"
        };
      });

      const beatChanges: Array<{
        beatId: string;
        before: { status: "planned"; commitId: null };
        after: {
          status: "committed" | "missed";
          commitId: string;
        };
        note: string;
      }> = [];
      const changedBeatIds = new Set<string>();
      for (const thread of foreshadowing) {
        for (const beat of thread.beats) {
          const placement = beat.placementId
            ? narrativePlacements.find(
                (candidate) => candidate.id === beat.placementId
              )
            : undefined;
          const resolvedChapterId =
            beat.chapterCardId ?? placement?.chapterCardId ?? null;
          if (resolvedChapterId !== committedRow.chapterCardId) continue;
          const decision =
            legacyExecutionDecision(legacyBeatStatusById.get(beat.id)) ??
            "missed";
          beat.status = decision;
          beat.commitId = commitId;
          changedBeatIds.add(beat.id);
          beatChanges.push({
            beatId: beat.id,
            before: { status: "planned", commitId: null },
            after: { status: decision, commitId },
            note: beat.note.trim() || "旧版检查点未提供单独证据。"
          });
        }
      }

      const threadChanges = foreshadowing
        .filter((thread) =>
          thread.beats.some((beat) => changedBeatIds.has(beat.id))
        )
        .map((thread) => {
          const before = thread.status;
          const after =
            before === "abandoned"
              ? "abandoned"
              : deriveLongForeshadowingStatusFromCommittedBeats(
                  thread.beats
                );
          thread.status = after;
          return {
            foreshadowingId: thread.id,
            before,
            after
          };
        });

      const record = LongLedgerCommitRecordSchema.parse({
        schemaVersion: 1,
        id: commitId,
        bookId,
        sequence,
        chapterCardId: committedRow.chapterCardId,
        committedAt,
        commitMessage: `旧版兼容迁移检查点 #${sequence}`,
        chapterSummary: legacyLedgerChapterSummary(
          workspace,
          committedRow.legacyCardId,
          committedRow.stageId
        ),
        reversible: false,
        sourceWorkspaceRevision: sequence - 1,
        committedWorkspaceRevision: sequence,
        sourceProjectRevision: sequence - 1,
        committedProjectRevision: sequence,
        previousCommittedThroughChapterId:
          committedChapterRows[commitIndex - 1]?.chapterCardId ?? null,
        committedThroughChapterId: committedRow.chapterCardId,
        previousChapterCommitId: null,
        placementChanges,
        foreshadowingBeatChanges: beatChanges,
        foreshadowingThreadChanges: threadChanges,
        fileChanges: []
      });
      const recordReference = documents.add(
        longLedgerCommitFileId(commitId),
        ledgerPath(commitId),
        serializeJson(record),
        "json"
      );
      const chapterFile = chapterFiles.find(
        ({ chapterCardId }) =>
          chapterCardId === committedRow.chapterCardId
      )!;
      chapterFile.commitId = commitId;
      legacyCommits.push({
        id: commitId,
        mode: "structured",
        sequence,
        chapterCardId: committedRow.chapterCardId,
        committedAt,
        reversible: false,
        sourceRevision: sequence - 1,
        placementIds: placements.map(({ id }) => id),
        foreshadowingBeatIds: beatChanges.map(({ beatId }) => beatId),
        recordFile: recordReference
      });
    }
    warnings.add(
      "旧版连续性已恢复为不可逆迁移检查点；如需改写已提交前缀，请复制内容到新项目或从源文件重新迁移。"
    );
  }

  const idMap = ids.snapshot();
  warnings.preserve(
    "旧版 → 墨枢完整 ID 映射",
    "migration.id-map.json",
    serializeJson({
      schema: "deepwrite.write-claw-id-map",
      schemaVersion: 1,
      sourceIdentity: namespace,
      idMap
    })
  );

  appendMigrationEvidenceCategories(
    worldbuilding,
    documents,
    warnings
  );

  const characterOverview = documents.add(
    LONG_CHARACTER_OVERVIEW_FILE_ID,
    LONG_CHARACTER_OVERVIEW_PATH,
    buildCharacterOverviewMarkdown(characters)
  );

  const index = LongWorkspaceIndexSnapshotSchema.parse({
    schemaVersion: 1,
    revision: legacyCommits.length,
    bookId,
    updatedAt: importedAt,
    bookLine,
    worldbuilding,
    characterOverview,
    characters,
    characterFiles,
    plot: {
      volumes,
      arcs,
      chapterCards,
      storyEvents,
      eventConnections,
      narrativePlacements,
      foreshadowing
    },
    chapters: chapterFiles,
    ledger: {
      committedThroughChapterId:
        legacyCommits.at(-1)?.chapterCardId ?? null,
      commits: legacyCommits
    }
  });

  const createdAt = normalizeTimestamp(source.book?.created_at, importedAt);
  const indexContent = serializeJson(index);
  const manifest = LongProjectManifestSchema.parse({
    schemaVersion: 1,
    revision: legacyCommits.length,
    kind: "deepwrite.long-book",
    id: bookId,
    title: bookTitle,
    bookType: "long",
    genre: bookGenre,
    status: source.book?.status === "completed" ? "completed" : "editing",
    linkedMaterialIdsByKind,
    linkedSkillIdsByKind,
    createdAt,
    updatedAt: importedAt,
    workspaceIndexFile: {
      id: LONG_WORKSPACE_INDEX_FILE_ID,
      path: LONG_WORKSPACE_INDEX_PATH,
      revision: fileRevision(indexContent),
      updatedAt: importedAt
    }
  });

  return {
    schemaVersion: 1,
    sourceKind: source.sourceKind,
    legacySchemaVersion,
    committedChapterPolicy:
      legacyCommits.length > 0
        ? "legacy-checkpoints"
        : "written-uncommitted",
    manifest,
    index,
    documents: documents.documents,
    warnings: warnings.all(),
    idMap
  };
}

export async function readWriteClawLongImportPlan(
  path: string,
  options: CreateWriteClawLongImportPlanOptions = {}
): Promise<WriteClawLongImportPlan> {
  const source = await readWriteClawLongSource(path);
  return createWriteClawLongImportPlan(source, options);
}
