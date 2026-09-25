import { createHash } from "node:crypto";
import {
  LongContinuityProjectionSchema,
  LongLedgerCommitRecordSchema,
  LongProjectManifestSchema,
  LongWorkspaceFileReferenceSchema,
  LongWorkspaceIndexSnapshotSchema,
  longChapterContinuityFilePath,
  longChapterForeshadowingChangesFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  parseLongWorldbuildingMarkdownList,
  type LongContinuityHandoff,
  type LongContinuityProjection,
  type LongLedgerCommitRecord,
  type LongLedgerCommitIndexEntry,
  type LongProjectManifest,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";

export const LONG_PORTABLE_BUNDLE_SCHEMA =
  "deepwrite.long-book.portable" as const;
export const LONG_PORTABLE_BUNDLE_SCHEMA_VERSION = 1 as const;

/**
 * Portable JSON is currently parsed/stringified in memory. Keep the hard
 * ceiling well below the former 512 MiB value so raw UTF-8, decoded strings
 * and the serialized result cannot combine into a multi-gigabyte peak.
 */
export const LONG_PORTABLE_BUNDLE_MAX_BYTES = 64 * 1024 * 1024;
const LONG_PORTABLE_BUNDLE_MAX_LABEL = "64 MB";
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_LEDGER_RECORD_BYTES = 128 * 1024 * 1024;

export interface LongPortableBundleJsonEntry<T> {
  mediaType: "application/json";
  sha256: string;
  value: T;
}

export interface LongPortableBundleFile {
  id: string;
  path: string;
  kind: "markdown" | "ledger-record";
  revision: string;
  sha256: string;
  content: string;
}

export interface LongPortableExportBundle {
  schema: typeof LONG_PORTABLE_BUNDLE_SCHEMA;
  schemaVersion: typeof LONG_PORTABLE_BUNDLE_SCHEMA_VERSION;
  exportedAt: string;
  bookId: string;
  manifest: LongPortableBundleJsonEntry<LongProjectManifest>;
  index: LongPortableBundleJsonEntry<LongWorkspaceIndexSnapshot>;
  files: LongPortableBundleFile[];
  agentsMd?: string;
}

interface IndexedPortableFile {
  reference: LongWorkspaceFileReference;
  kind: LongPortableBundleFile["kind"];
  commitId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function contentRevision(content: string): string {
  return `v2:${Buffer.byteLength(content, "utf8")}:${sha256(content)}`;
}

function revisionMatchesContent(revision: string, content: string): boolean {
  const bytes = Buffer.from(content, "utf8");
  const match = /^(v1|v2):(\d+):([0-9a-f]+)$/u.exec(revision);
  if (!match || Number(match[2]) !== bytes.byteLength) return false;
  const digest = sha256(bytes);
  return match[1] === "v1"
    ? digest.startsWith(match[3]!)
    : digest === match[3];
}

function continuityFactKey(
  value: Pick<
    LongContinuityProjection["facts"][number],
    "domain" | "subjectId" | "field"
  >
): string {
  return `${value.domain}\0${value.subjectId}\0${value.field.normalize("NFC")}`;
}

function continuityKnowledgeKey(
  value: Pick<
    LongContinuityProjection["knowledge"][number],
    "factId" | "audienceType" | "audienceId"
  >
): string {
  return `${value.factId}\0${value.audienceType}\0${value.audienceId ?? ""}`;
}

function sameContinuityEntity(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function serializeContinuityHandoff(
  handoff: LongContinuityHandoff
): string {
  const bullets = (items: readonly string[]): string =>
    items.length === 0
      ? "- 无"
      : items
          .map(
            (item) =>
              `- ${item.replace(/\r\n?/gu, "\n").replace(/\n/gu, "\n  ")}`
          )
          .join("\n");
  return [
    "# 下一章交接",
    "",
    "## 摘要",
    "",
    handoff.summary,
    "",
    "## 必须承接",
    "",
    bullets(handoff.mustCarry),
    "",
    "## 下一章约束",
    "",
    bullets(handoff.nextChapterConstraints),
    "",
    "## 未闭合事项",
    "",
    bullets(handoff.openLoops),
    ""
  ].join("\n");
}

function replayContinuityProjection(
  records: readonly LongLedgerCommitRecord[]
): LongContinuityProjection {
  const projection: LongContinuityProjection = {
    throughCommitId: null,
    facts: [],
    knowledge: [],
    openLoops: [],
    latestHandoff: null
  };
  const factIndexById = new Map<string, number>();
  const factIndexByKey = new Map<string, number>();
  const knowledgeIndexByKey = new Map<string, number>();
  const openLoopIndexById = new Map<string, number>();
  for (const record of records) {
    if (record.schemaVersion !== 3) continue;
    for (const change of record.factChanges) {
      const factKey = continuityFactKey(change.after);
      const idIndex = factIndexById.get(change.after.factId);
      const keyIndex = factIndexByKey.get(factKey);
      if (
        idIndex !== keyIndex ||
        (change.before === null
          ? idIndex !== undefined
          : idIndex === undefined ||
            !sameContinuityEntity(
              projection.facts[idIndex],
              change.before
            ))
      ) {
        throw new Error(
          `连续性事实变更链不一致：${change.after.factId}。`
        );
      }
      if (idIndex === undefined) {
        const nextIndex = projection.facts.length;
        projection.facts.push({ ...change.after });
        factIndexById.set(change.after.factId, nextIndex);
        factIndexByKey.set(factKey, nextIndex);
      } else {
        projection.facts[idIndex] = { ...change.after };
      }
    }
    for (const change of record.knowledgeChanges) {
      const key = continuityKnowledgeKey(change.after);
      const index = knowledgeIndexByKey.get(key);
      if (
        change.before === null
          ? index !== undefined
          : index === undefined ||
            !sameContinuityEntity(
              projection.knowledge[index],
              change.before
            )
      ) {
        throw new Error(`连续性认知变更链不一致：${key}。`);
      }
      if (index === undefined) {
        knowledgeIndexByKey.set(key, projection.knowledge.length);
        projection.knowledge.push({ ...change.after });
      } else {
        projection.knowledge[index] = { ...change.after };
      }
    }
    for (const change of record.openLoopChanges) {
      const index = openLoopIndexById.get(change.after.loopId);
      if (
        change.before === null
          ? index !== undefined
          : index === undefined ||
            !sameContinuityEntity(
              projection.openLoops[index],
              change.before
            )
      ) {
        throw new Error(
          `连续性未闭合事项变更链不一致：${change.after.loopId}。`
        );
      }
      if (index === undefined) {
        openLoopIndexById.set(
          change.after.loopId,
          projection.openLoops.length
        );
        projection.openLoops.push({ ...change.after });
      } else {
        projection.openLoops[index] = { ...change.after };
      }
    }
    projection.throughCommitId = record.id;
    projection.latestHandoff = {
      ...record.chapterOutputs.handoff,
      mustCarry: [...record.chapterOutputs.handoff.mustCarry],
      nextChapterConstraints: [
        ...record.chapterOutputs.handoff.nextChapterConstraints
      ],
      openLoops: [...record.chapterOutputs.handoff.openLoops],
      chapterCardId: record.chapterCardId,
      commitId: record.id
    };
  }
  return LongContinuityProjectionSchema.parse(projection);
}

function normalizedTimestamp(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.valueOf())) {
    throw new Error("长篇可移植包导出时间不是有效的 ISO 时间。");
  }
  return date.toISOString();
}

function indexedFiles(
  index: LongWorkspaceIndexSnapshot
): IndexedPortableFile[] {
  return [
    { reference: index.bookLine, kind: "markdown" },
    ...index.worldbuilding.flatMap((category) =>
      (category.format === "text"
        ? [category.file]
        : [
            ...(category.overview ? [category.overview] : []),
            ...category.items.map(({ file }) => file)
          ]
      ).map((reference) => ({
        reference,
        kind: "markdown" as const
      }))
    ),
    ...(index.characterOverview
      ? [{ reference: index.characterOverview, kind: "markdown" as const }]
      : []),
    ...index.characterFiles.flatMap((entry) => [
      { reference: entry.coreProfile, kind: "markdown" as const },
      { reference: entry.relationships, kind: "markdown" as const },
      { reference: entry.currentState, kind: "markdown" as const },
      { reference: entry.history, kind: "markdown" as const }
    ]),
    ...index.chapters.flatMap((entry) => [
      { reference: entry.body, kind: "markdown" as const },
      { reference: entry.card, kind: "markdown" as const },
      { reference: entry.characterState, kind: "markdown" as const },
      { reference: entry.handoff, kind: "markdown" as const },
      { reference: entry.foreshadowingChanges, kind: "markdown" as const },
      ...(entry.worldReveals
        ? [{ reference: entry.worldReveals, kind: "markdown" as const }]
        : []),
      ...entry.characterContinuity.flatMap((continuity) => [
        { reference: continuity.currentState, kind: "markdown" as const },
        { reference: continuity.history, kind: "markdown" as const }
      ])
    ]),
    ...index.plot.storyPlots.map((entry) => ({
      reference: entry.file,
      kind: "markdown" as const
    })),
    ...index.ledger.commits.map((commit) => ({
      reference: commit.recordFile,
      kind: "ledger-record" as const,
      commitId: commit.id
    }))
  ];
}

function validateManifestIndexPair(
  manifest: LongProjectManifest,
  index: LongWorkspaceIndexSnapshot
): void {
  if (manifest.id !== index.bookId) {
    throw new Error("长篇清单与工作区索引的 bookId 不一致。");
  }
  if (manifest.revision !== index.revision) {
    throw new Error("长篇清单与工作区索引的项目 revision 不一致。");
  }
  if (
    !revisionMatchesContent(
      manifest.workspaceIndexFile.revision,
      serializeJson(index)
    )
  ) {
    throw new Error("长篇清单中的工作区索引 revision 与索引内容不一致。");
  }
}

function validateLedgerRecord(
  content: string,
  expectedBookId: string,
  expectedCommitId: string
): LongLedgerCommitRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch {
    throw new Error(`账本记录 ${expectedCommitId} 不是有效 JSON。`);
  }
  const record = LongLedgerCommitRecordSchema.parse(raw);
  if (record.bookId !== expectedBookId || record.id !== expectedCommitId) {
    throw new Error(`账本记录 ${expectedCommitId} 的身份与索引不一致。`);
  }
  return record;
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  return (
    left.length === right.length &&
    leftIds.size === left.length &&
    rightIds.size === right.length &&
    leftIds.size === rightIds.size &&
    left.every((id) => rightIds.has(id))
  );
}

export function assertLongLedgerRecordMatchesIndex(
  index: LongWorkspaceIndexSnapshot,
  entry: LongLedgerCommitIndexEntry,
  record: LongLedgerCommitRecord,
  recordContent?: string
): void {
  const indexedPosition = index.ledger.commits.findIndex(
    (candidate) => candidate.id === entry.id
  );
  const chapter = index.chapters.find(
    (candidate) => candidate.chapterCardId === entry.chapterCardId
  );
  const importCheckpointMatches =
    entry.mode === "import_checkpoint" &&
    record.schemaVersion === 1 &&
    !record.reversible &&
    record.placementChanges.length === 0 &&
    record.foreshadowingBeatChanges.length === 0 &&
    record.foreshadowingThreadChanges.length === 0 &&
    record.fileChanges.length === 0 &&
    record.continuityFiles.length === 0 &&
    record.factChanges.length === 0 &&
    record.knowledgeChanges.length === 0 &&
    record.openLoopChanges.length === 0;
  const modeMatches =
    importCheckpointMatches ||
    (entry.mode === "text_files" && record.schemaVersion === 4) ||
    (entry.mode === "structured" && record.schemaVersion !== 4);
  if (
    indexedPosition < 0 ||
    record.id !== entry.id ||
    record.bookId !== index.bookId ||
    record.sequence !== entry.sequence ||
    record.chapterCardId !== entry.chapterCardId ||
    record.committedAt !== entry.committedAt ||
    record.reversible !== entry.reversible ||
    record.sourceWorkspaceRevision !== entry.sourceRevision ||
    !modeMatches ||
    chapter?.commitId !== entry.id ||
    !sameIdSet(
      entry.placementIds,
      record.placementChanges.map(({ placementId }) => placementId)
    ) ||
    !sameIdSet(
      entry.foreshadowingBeatIds,
      record.foreshadowingBeatChanges.map(({ beatId }) => beatId)
    ) ||
    (recordContent !== undefined &&
      !revisionMatchesContent(entry.recordFile.revision, recordContent))
  ) {
    throw new Error(`账本记录 ${entry.id} 与工作区索引不一致。`);
  }
}

export function assertLongLedgerRecordChain(
  index: LongWorkspaceIndexSnapshot,
  records: readonly LongLedgerCommitRecord[],
  finalProjectRevision = index.revision
): void {
  if (records.length !== index.ledger.commits.length) {
    throw new Error("连续性账本记录链数量与索引不一致。");
  }
  const recordsById = new Map(
    records.map((record) => [record.id, record] as const)
  );
  if (recordsById.size !== records.length) {
    throw new Error("连续性账本包含重复记录身份。");
  }
  if (finalProjectRevision !== index.revision) {
    throw new Error("连续性账本的工作区与项目末态 revision 不一致。");
  }

  const continuityFiles = new Map<
    string,
    {
      reference: LongWorkspaceFileReference;
      role:
        | "relationships"
        | "current-state"
        | "history"
        | "chapter-character-state"
        | "chapter-handoff";
      chapterCardId?: string;
    }
  >();
  for (const entry of index.characterFiles) {
    continuityFiles.set(entry.relationships.id, {
      reference: entry.relationships,
      role: "relationships"
    });
    continuityFiles.set(entry.currentState.id, {
      reference: entry.currentState,
      role: "current-state"
    });
    continuityFiles.set(entry.history.id, {
      reference: entry.history,
      role: "history"
    });
  }
  for (const chapter of index.chapters) {
    continuityFiles.set(chapter.characterState.id, {
      reference: chapter.characterState,
      role: "chapter-character-state",
      chapterCardId: chapter.chapterCardId
    });
    continuityFiles.set(chapter.handoff.id, {
      reference: chapter.handoff,
      role: "chapter-handoff",
      chapterCardId: chapter.chapterCardId
    });
  }
  const characterSubjectIds = new Set(
    index.characters.map(({ id }) => id)
  );
  const worldSubjectIds = new Set(
    index.worldbuilding.map(({ id }) => id)
  );
  const plotSubjectIds = new Set<string>([
    index.bookId,
    ...index.plot.volumes.map(({ id }) => id),
    ...index.plot.arcs.map(({ id }) => id),
    ...index.plot.chapterCards.map(({ id }) => id),
    ...index.plot.storyEvents.map(({ id }) => id),
    ...index.plot.storyPlots.map(({ id }) => id),
    ...index.plot.eventConnections.map(({ id }) => id),
    ...index.plot.narrativePlacements.map(({ id }) => id)
  ]);
  const foreshadowingSubjectIds = new Set<string>(
    index.plot.foreshadowing.flatMap((thread) => [
      thread.id,
      ...thread.beats.map(({ id }) => id)
    ])
  );
  const characterFilesByCharacterId = new Map(
    index.characterFiles.map((entry) => [entry.characterId, entry] as const)
  );
  const lastFileState = new Map<
    string,
    LongLedgerCommitRecord["fileChanges"][number]["after"]
  >();
  let previousRecord: LongLedgerCommitRecord | undefined;
  const orderedRecords: LongLedgerCommitRecord[] = [];
  for (const entry of index.ledger.commits) {
    const record = recordsById.get(entry.id);
    if (!record) throw new Error(`连续性账本缺少记录：${entry.id}。`);
    assertLongLedgerRecordMatchesIndex(index, entry, record);
    if (
      record.sourceWorkspaceRevision !== record.sourceProjectRevision ||
      record.committedWorkspaceRevision !==
        record.committedProjectRevision ||
      record.committedWorkspaceRevision > index.revision ||
      record.committedProjectRevision > finalProjectRevision ||
      (previousRecord !== undefined &&
        (record.sourceWorkspaceRevision <
          previousRecord.committedWorkspaceRevision ||
          record.sourceProjectRevision <
            previousRecord.committedProjectRevision)) ||
      record.previousChapterCommitId !== null
    ) {
      throw new Error(
        `连续性账本 revision 或章节回滚前态不一致：${record.id}。`
      );
    }
    previousRecord = record;
    orderedRecords.push(record);
    if (record.schemaVersion === 4) {
      const chapter = index.chapters.find(
        ({ chapterCardId }) => chapterCardId === record.chapterCardId
      );
      if (!chapter) {
        throw new Error(
          `v4 连续性账本引用了不存在的章节：${record.chapterCardId}。`
        );
      }
      const auditsForeshadowingChanges =
        entry.foreshadowingBeatIds.length > 0 ||
        record.continuityFiles.some(
          ({ fileId }) => fileId === chapter.foreshadowingChanges.id
        );
      const expectedFiles = [
        chapter.characterState,
        chapter.handoff,
        ...(auditsForeshadowingChanges
          ? [chapter.foreshadowingChanges]
          : []),
        ...(chapter.worldReveals ? [chapter.worldReveals] : []),
        ...chapter.characterContinuity.flatMap((continuity) => [
          continuity.currentState,
          continuity.history
        ])
      ];
      const auditedById = new Map(
        record.continuityFiles.map((file) => [file.fileId, file])
      );
      if (
        auditedById.size !== expectedFiles.length ||
        expectedFiles.some((reference) => {
          const audited = auditedById.get(reference.id);
          return (
            !audited ||
            audited.path !== reference.path ||
            audited.revision !== reference.revision
          );
        })
      ) {
        throw new Error(
          `v4 连续性账本的文件清单与章节索引不一致：${record.id}。`
        );
      }
    }
    if (record.schemaVersion === 3) {
      const changedFileIds = new Set(
        record.fileChanges.map(({ fileId }) => fileId)
      );
      for (const { after: fact } of record.factChanges) {
        const subjectExists =
          fact.domain === "character" ||
          fact.domain === "relationship"
            ? characterSubjectIds.has(fact.subjectId)
            : fact.domain === "world"
              ? worldSubjectIds.has(fact.subjectId)
              : fact.domain === "plot"
                ? plotSubjectIds.has(fact.subjectId)
                : foreshadowingSubjectIds.has(fact.subjectId);
        if (!subjectExists) {
          throw new Error(
            `v3 连续性事实包含孤立 subjectId：${fact.factId} / ${fact.subjectId}。`
          );
        }
        if (
          fact.domain !== "character" &&
          fact.domain !== "relationship"
        ) {
          continue;
        }
        const files = characterFilesByCharacterId.get(fact.subjectId);
        const requiredFileIds =
          files === undefined
            ? []
            : fact.domain === "character"
              ? [files.currentState.id, files.history.id]
              : [files.relationships.id, files.history.id];
        if (
          requiredFileIds.length !== 2 ||
          requiredFileIds.some((fileId) => !changedFileIds.has(fileId))
        ) {
          throw new Error(
            `v3 连续性事实缺少人物物化文件变更：${fact.factId}。`
          );
        }
      }
      const chapter = index.chapters.find(
        ({ chapterCardId }) => chapterCardId === record.chapterCardId
      );
      const characterStateChange = record.fileChanges.find(
        ({ fileId }) => fileId === chapter?.characterState.id
      );
      const handoffChange = record.fileChanges.find(
        ({ fileId }) => fileId === chapter?.handoff.id
      );
      if (
        !chapter ||
        !characterStateChange ||
        characterStateChange.mode !== "replace" ||
        characterStateChange.after.content !==
          record.chapterOutputs.characterState ||
        !handoffChange ||
        handoffChange.mode !== "replace" ||
        handoffChange.after.content !==
          serializeContinuityHandoff(record.chapterOutputs.handoff)
      ) {
        throw new Error(
          `v3 连续性账本缺少可信的章节输出变更：${record.id}。`
        );
      }
    }
    for (const change of record.fileChanges) {
      const file = continuityFiles.get(change.fileId);
      const previous = lastFileState.get(change.fileId);
      const chapterOutput =
        file?.role === "chapter-character-state" ||
        file?.role === "chapter-handoff";
      if (
        !file ||
        file.reference.path !== change.path ||
        (chapterOutput &&
          (record.schemaVersion !== 3 ||
            file.chapterCardId !== record.chapterCardId)) ||
        (file.role === "history" && change.mode !== "append") ||
        (file.role !== "history" && change.mode !== "replace") ||
        !revisionMatchesContent(
          change.before.revision,
          change.before.content
        ) ||
        !revisionMatchesContent(
          change.after.revision,
          change.after.content
        ) ||
        (change.mode === "append" &&
          !change.after.content.startsWith(change.before.content)) ||
        (previous !== undefined &&
          (previous.content !== change.before.content ||
            previous.revision !== change.before.revision))
      ) {
        throw new Error(
          `连续性账本文件变更链不一致：${change.fileId}。`
        );
      }
      lastFileState.set(change.fileId, change.after);
    }
  }
  for (const [fileId, state] of lastFileState) {
    const indexed = continuityFiles.get(fileId)!.reference;
    if (
      !revisionMatchesContent(state.revision, state.content) ||
      indexed.revision !== state.revision
    ) {
      throw new Error(`连续性账本末态与索引不一致：${fileId}。`);
    }
  }
  const replayedProjection = replayContinuityProjection(orderedRecords);
  if (!sameContinuityEntity(replayedProjection, index.ledger.projection)) {
    throw new Error("连续性账本类型化投影与记录链不一致。");
  }

  const placementState = new Map(
    index.plot.narrativePlacements.map((placement) => [
      placement.id,
      { status: placement.status, commitId: placement.commitId }
    ])
  );
  const beatState = new Map(
    index.plot.foreshadowing.flatMap((thread) =>
      thread.beats.map(
        (beat) =>
          [
            beat.id,
            { status: beat.status, commitId: beat.commitId }
          ] as const
      )
    )
  );
  const threadState = new Map(
    index.plot.foreshadowing.map((thread) => [
      thread.id,
      thread.status
    ])
  );
  const touchedPlacements = new Set<string>();
  const touchedBeats = new Set<string>();
  for (const record of [...orderedRecords].reverse()) {
    for (const change of record.placementChanges) {
      const current = placementState.get(change.placementId);
      if (
        !current ||
        current.status !== change.after.status ||
        current.commitId !== change.after.commitId
      ) {
        throw new Error(
          `连续性账本叙事落点回滚链不一致：${change.placementId}。`
        );
      }
      placementState.set(change.placementId, { ...change.before });
      touchedPlacements.add(change.placementId);
    }
    for (const change of record.foreshadowingBeatChanges) {
      const current = beatState.get(change.beatId);
      if (
        !current ||
        current.status !== change.after.status ||
        current.commitId !== change.after.commitId
      ) {
        throw new Error(
          `连续性账本伏笔节拍回滚链不一致：${change.beatId}。`
        );
      }
      beatState.set(change.beatId, { ...change.before });
      touchedBeats.add(change.beatId);
    }
    for (const change of record.foreshadowingThreadChanges) {
      if (threadState.get(change.foreshadowingId) !== change.after) {
        throw new Error(
          `连续性账本伏笔线回滚链不一致：${change.foreshadowingId}。`
        );
      }
      threadState.set(change.foreshadowingId, change.before);
    }
  }
  for (const placementId of touchedPlacements) {
    const state = placementState.get(placementId)!;
    if (
      state.commitId !== null ||
      (state.status !== "planned" && state.status !== "written")
    ) {
      throw new Error(
        `连续性账本叙事落点缺少可信回滚前态：${placementId}。`
      );
    }
  }
  for (const beatId of touchedBeats) {
    const state = beatState.get(beatId)!;
    if (
      state.commitId !== null ||
      (state.status !== "planned" && state.status !== "written")
    ) {
      throw new Error(
        `连续性账本伏笔节拍缺少可信回滚前态：${beatId}。`
      );
    }
  }
}

function assertUniqueIndexedFiles(files: readonly IndexedPortableFile[]): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const { reference } of files) {
    const pathKey = reference.path
      .normalize("NFC")
      .toLocaleLowerCase("en-US");
    if (ids.has(reference.id) || paths.has(pathKey)) {
      throw new Error(
        `长篇工作区索引包含重复文件：${reference.id} / ${reference.path}。`
      );
    }
    ids.add(reference.id);
    paths.add(pathKey);
  }
}

function parseBundleInput(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") {
    if (!isRecord(raw)) {
      throw new Error("长篇可移植包必须是 JSON 对象。");
    }
    return raw;
  }
  if (Buffer.byteLength(raw, "utf8") > LONG_PORTABLE_BUNDLE_MAX_BYTES) {
    throw new Error(
      `长篇可移植包超过 ${LONG_PORTABLE_BUNDLE_MAX_LABEL} 内存安全上限。`
    );
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value)) throw new Error();
    return value;
  } catch {
    throw new Error("长篇可移植包不是有效 JSON 对象。");
  }
}

function parseJsonEntry(
  raw: unknown,
  label: string
): {
  sha256: string;
  value: unknown;
} {
  const entry = recordOrThrow(raw, `${label}条目`);
  if (
    entry.mediaType !== "application/json" ||
    typeof entry.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(entry.sha256)
  ) {
    throw new Error(`长篇可移植包的${label}条目格式无效。`);
  }
  return { sha256: entry.sha256, value: entry.value };
}

function recordOrThrow(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`长篇可移植包的${label}格式无效。`);
  }
  return value;
}

function normalizeLegacyPortableWorldbuilding(
  rawIndex: unknown,
  rawFiles: unknown
): {
  index: unknown;
  files: unknown[];
} {
  if (!Array.isArray(rawFiles)) {
    throw new Error("长篇可移植包的 files 格式无效。");
  }
  if (
    !isRecord(rawIndex) ||
    !Array.isArray(rawIndex.worldbuilding)
  ) {
    return { index: rawIndex, files: rawFiles };
  }

  let migrated = false;
  let files = [...rawFiles];
  const worldbuilding = rawIndex.worldbuilding.map((rawCategory) => {
    if (
      !isRecord(rawCategory) ||
      rawCategory.format !== "list" ||
      rawCategory.contentAuthority !== "markdown"
    ) {
      return rawCategory;
    }

    const categoryId =
      typeof rawCategory.id === "string" ? rawCategory.id : "";
    const legacyFile = LongWorkspaceFileReferenceSchema.parse(
      rawCategory.file
    );
    const matching = files.filter(
      (rawFile) =>
        isRecord(rawFile) && rawFile.id === legacyFile.id
    );
    if (matching.length !== 1) {
      throw new Error(
        `旧版世界观分类 ${categoryId} 的聚合文件缺失或重复。`
      );
    }
    const aggregate = recordOrThrow(
      matching[0],
      `旧版世界观分类 ${categoryId} 的聚合文件`
    );
    if (
      aggregate.kind !== "markdown" ||
      aggregate.path !== legacyFile.path ||
      aggregate.revision !== legacyFile.revision ||
      typeof aggregate.sha256 !== "string" ||
      typeof aggregate.content !== "string" ||
      aggregate.sha256 !== sha256(aggregate.content) ||
      !revisionMatchesContent(legacyFile.revision, aggregate.content)
    ) {
      throw new Error(
        `旧版世界观分类 ${categoryId} 的聚合文件完整性校验失败。`
      );
    }

    const items = parseLongWorldbuildingMarkdownList(
      aggregate.content
    ).map((item, itemIndex) => {
      const path = longWorldbuildingItemContentPath(
        categoryId,
        item.id
      );
      const revision = contentRevision(item.content);
      const file = {
        id: longWorldbuildingItemFileId(item.id),
        path,
        revision,
        updatedAt: legacyFile.updatedAt
      };
      files.push({
        id: file.id,
        path,
        kind: "markdown",
        revision,
        sha256: sha256(item.content),
        content: item.content
      });
      return {
        id: item.id,
        title: item.title,
        order: itemIndex + 1,
        file
      };
    });
    files = files.filter((rawFile) => rawFile !== matching[0]);
    const overviewPath = longWorldbuildingOverviewContentPath(categoryId);
    const overviewRevision = contentRevision("");
    const overview = {
      id: longWorldbuildingOverviewFileId(categoryId),
      path: overviewPath,
      revision: overviewRevision,
      updatedAt: legacyFile.updatedAt
    };
    files.push({
      id: overview.id,
      path: overviewPath,
      kind: "markdown",
      revision: overviewRevision,
      sha256: sha256(""),
      content: ""
    });
    migrated = true;
    return {
      id: rawCategory.id,
      title: rawCategory.title,
      order: rawCategory.order,
      format: "list",
      contentAuthority: "files",
      overview,
      items
    };
  });

  return migrated
    ? {
        index: {
          ...rawIndex,
          worldbuilding
        },
        files
      }
    : { index: rawIndex, files };
}

function normalizeLegacyPortableChapterContinuity(
  rawIndex: unknown,
  rawFiles: unknown
): { index: unknown; files: unknown[] } {
  if (
    !isRecord(rawIndex) ||
    !Array.isArray(rawIndex.chapters) ||
    !Array.isArray(rawFiles)
  ) {
    return {
      index: rawIndex,
      files: Array.isArray(rawFiles) ? rawFiles : []
    };
  }
  let migrated = false;
  const files = [...rawFiles];
  const chapters = rawIndex.chapters.map((rawChapter) => {
    if (
      !isRecord(rawChapter) ||
      typeof rawChapter.chapterCardId !== "string" ||
      isRecord(rawChapter.foreshadowingChanges)
    ) {
      return rawChapter;
    }
    migrated = true;
    const body = isRecord(rawChapter.body) ? rawChapter.body : {};
    const chapterCardId = rawChapter.chapterCardId;
    const id = longChapterForeshadowingChangesFileId(chapterCardId);
    const path = longChapterContinuityFilePath(
      chapterCardId,
      "foreshadowing-changes.md"
    );
    const existing = files.find(
      (rawFile) => isRecord(rawFile) && rawFile.id === id
    );
    const content =
      isRecord(existing) && typeof existing.content === "string"
        ? existing.content
        : "";
    const revision = contentRevision(content);
    if (!existing) {
      files.push({
        id,
        path,
        kind: "markdown",
        revision,
        sha256: sha256(content),
        content
      });
    }
    return {
      ...rawChapter,
      foreshadowingChanges: {
        id,
        path,
        revision,
        updatedAt:
          typeof body.updatedAt === "string"
            ? body.updatedAt
            : "1970-01-01T00:00:00.000Z"
      },
      worldReveals: rawChapter.worldReveals ?? null,
      characterContinuity: rawChapter.characterContinuity ?? []
    };
  });
  return migrated
    ? { index: { ...rawIndex, chapters }, files }
    : { index: rawIndex, files };
}

export function parseLongPortableExportBundle(
  raw: unknown
): LongPortableExportBundle {
  const bundle = parseBundleInput(raw);
  if (
    bundle.schema !== LONG_PORTABLE_BUNDLE_SCHEMA ||
    bundle.schemaVersion !== LONG_PORTABLE_BUNDLE_SCHEMA_VERSION
  ) {
    throw new Error("不支持的长篇可移植包 schema。");
  }
  const exportedAt = normalizedTimestamp(bundle.exportedAt);
  const manifestEntry = parseJsonEntry(bundle.manifest, "manifest");
  const indexEntry = parseJsonEntry(bundle.index, "index");
  const rawManifestContent = serializeJson(manifestEntry.value);
  const rawIndexContent = serializeJson(indexEntry.value);
  if (
    manifestEntry.sha256 !== sha256(rawManifestContent) ||
    indexEntry.sha256 !== sha256(rawIndexContent)
  ) {
    throw new Error("长篇可移植包的 manifest 或 index SHA-256 校验失败。");
  }
  const normalizedWorldbuilding = normalizeLegacyPortableWorldbuilding(
    indexEntry.value,
    bundle.files
  );
  const normalizedContinuity = normalizeLegacyPortableChapterContinuity(
    normalizedWorldbuilding.index,
    normalizedWorldbuilding.files
  );
  let manifest = LongProjectManifestSchema.parse(manifestEntry.value);
  const index = LongWorkspaceIndexSnapshotSchema.parse(
    normalizedContinuity.index
  );
  if (
    manifest.id !== index.bookId ||
    manifest.revision !== index.revision ||
    !revisionMatchesContent(
      manifest.workspaceIndexFile.revision,
      rawIndexContent
    )
  ) {
    throw new Error("长篇清单与可移植包原始索引不一致。");
  }
  const normalizedIndexContent = serializeJson(index);
  if (normalizedIndexContent !== rawIndexContent) {
    manifest = LongProjectManifestSchema.parse({
      ...manifest,
      workspaceIndexFile: {
        ...manifest.workspaceIndexFile,
        revision: `v2:${Buffer.byteLength(
          normalizedIndexContent,
          "utf8"
        )}:${sha256(normalizedIndexContent)}`
      }
    });
  }
  validateManifestIndexPair(manifest, index);
  if (bundle.bookId !== manifest.id) {
    throw new Error("长篇可移植包顶层 bookId 与 manifest 不一致。");
  }

  const expected = indexedFiles(index);
  assertUniqueIndexedFiles(expected);
  const expectedById = new Map(
    expected.map((entry) => [entry.reference.id, entry])
  );
  if (
    normalizedContinuity.files.length !== expected.length
  ) {
    throw new Error("长篇可移植包没有完整包含索引中的全部文档。");
  }
  let totalBytes = 0;
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const ledgerRecords: LongLedgerCommitRecord[] = [];
  const files = normalizedContinuity.files.map((rawFile) => {
    const file = recordOrThrow(rawFile, "文件条目");
    if (
      typeof file.id !== "string" ||
      typeof file.path !== "string" ||
      typeof file.revision !== "string" ||
      typeof file.sha256 !== "string" ||
      typeof file.content !== "string" ||
      (file.kind !== "markdown" && file.kind !== "ledger-record") ||
      !/^[0-9a-f]{64}$/u.test(file.sha256)
    ) {
      throw new Error("长篇可移植包包含格式无效的文件条目。");
    }
    const expectedFile = expectedById.get(file.id);
    if (!expectedFile) {
      throw new Error(`长篇可移植包包含索引外文件：${file.id}。`);
    }
    const pathKey = file.path.normalize("NFC").toLocaleLowerCase("en-US");
    if (seenIds.has(file.id) || seenPaths.has(pathKey)) {
      throw new Error(`长篇可移植包包含重复文件：${file.id}。`);
    }
    seenIds.add(file.id);
    seenPaths.add(pathKey);
    if (
      file.path !== expectedFile.reference.path ||
      file.revision !== expectedFile.reference.revision ||
      file.kind !== expectedFile.kind
    ) {
      throw new Error(`长篇可移植包中文件 ${file.id} 与索引不一致。`);
    }
    const bytes = Buffer.from(file.content, "utf8");
    if (bytes.toString("utf8") !== file.content) {
      throw new Error(`长篇可移植包中文件 ${file.id} 包含无效 Unicode。`);
    }
    totalBytes += bytes.byteLength;
    if (
      bytes.byteLength >
        (expectedFile.kind === "ledger-record"
          ? MAX_LEDGER_RECORD_BYTES
          : MAX_FILE_BYTES) ||
      totalBytes > LONG_PORTABLE_BUNDLE_MAX_BYTES
    ) {
      throw new Error("长篇可移植包的文件内容超过安全上限。");
    }
    if (
      sha256(bytes) !== file.sha256 ||
      !revisionMatchesContent(file.revision, file.content)
    ) {
      throw new Error(`长篇可移植包中文件 ${file.id} 完整性校验失败。`);
    }
    if (file.kind === "ledger-record") {
      const record = validateLedgerRecord(
        file.content,
        index.bookId,
        expectedFile.commitId!
      );
      const entry = index.ledger.commits.find(
        (candidate) => candidate.id === expectedFile.commitId
      )!;
      assertLongLedgerRecordMatchesIndex(
        index,
        entry,
        record,
        file.content
      );
      ledgerRecords.push(record);
    }
    return {
      id: file.id,
      path: file.path,
      kind: file.kind,
      revision: file.revision,
      sha256: file.sha256,
      content: file.content
    } satisfies LongPortableBundleFile;
  });
  if (seenIds.size !== expectedById.size) {
    throw new Error("长篇可移植包缺少索引中的文档。");
  }
  assertLongLedgerRecordChain(index, ledgerRecords, manifest.revision);
  const agentsMd =
    typeof bundle.agentsMd === "string" ? bundle.agentsMd : undefined;
  return {
    schema: LONG_PORTABLE_BUNDLE_SCHEMA,
    schemaVersion: LONG_PORTABLE_BUNDLE_SCHEMA_VERSION,
    exportedAt,
    bookId: manifest.id,
    manifest: {
      mediaType: "application/json",
      sha256: sha256(serializeJson(manifest)),
      value: manifest
    },
    index: {
      mediaType: "application/json",
      sha256: sha256(normalizedIndexContent),
      value: index
    },
    files,
    ...(agentsMd !== undefined ? { agentsMd } : {})
  };
}
