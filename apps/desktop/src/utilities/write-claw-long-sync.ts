import { createHash } from "node:crypto";
import {
  LongWorkspaceOperationBatchSchema,
  type LongLegacySyncCounts,
  type LongLegacySyncModule,
  type LongPreviewLegacySyncAtPathResult,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import { createLongFileRevision } from "./long-project-store";
import { readWriteClawLongSource } from "./write-claw-long-archive";
import {
  createWriteClawLongImportPlan,
  type WriteClawLongImportDocument,
  type WriteClawLongImportPlan
} from "./write-claw-long-import";

const EMPTY_COUNTS: LongLegacySyncCounts = {
  worldbuilding: 0,
  characters: 0,
  outline: 0,
  volumes: 0,
  plotPoints: 0,
  storyEvents: 0,
  chapterCards: 0
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sourceCounts(workspace: Record<string, unknown>): LongLegacySyncCounts {
  const worldbuilding = record(workspace.worldbuilding);
  const characters = record(workspace.characters);
  const plot = record(workspace.plot);
  return {
    worldbuilding: list(worldbuilding.categories).length,
    characters: [
      "protagonists",
      "major_supporting",
      "minor_supporting",
      "passersby"
    ].reduce(
      (total, group) => total + list(record(characters[group]).entries).length,
      0
    ),
    outline:
      typeof plot.book_line === "string" && plot.book_line.trim() ? 1 : 0,
    volumes: list(plot.volumes).length,
    plotPoints: list(plot.arcs).length,
    storyEvents: list(plot.story_events).length,
    chapterCards: list(plot.chapter_cards).length
  };
}

function sourceMappedIds(
  plan: WriteClawLongImportPlan,
  workspace: Record<string, unknown>
): {
  worldbuilding: Set<string>;
  characters: Set<string>;
  volumes: Set<string>;
  plotPoints: Set<string>;
  storyEvents: Set<string>;
  chapterCards: Set<string>;
} {
  const mapped = (kind: string, keys: string[]): Set<string> => {
    const table = plan.idMap[kind] ?? {};
    return new Set(keys.map((key) => table[key]).filter((id): id is string => Boolean(id)));
  };
  const worldbuilding = record(workspace.worldbuilding);
  const characters = record(workspace.characters);
  const plot = record(workspace.plot);
  const categoryKeys = list(worldbuilding.categories).map((value, index) => {
    const category = record(value);
    return String(category.id ?? "").trim() || `category-${index + 1}`;
  });
  const characterKeys: string[] = [];
  for (const group of ["protagonists", "major_supporting", "minor_supporting", "passersby"]) {
    list(record(characters[group]).entries).forEach((value, index) => {
      const character = record(value);
      characterKeys.push(String(character.id ?? "").trim() || `${group}-${index + 1}`);
    });
  }
  const volumeKeys = list(plot.volumes).map((value, index) => {
    const volume = record(value);
    return String(volume.id ?? "").trim() || `volume-${index + 1}`;
  });
  const arcKeys = list(plot.arcs).map((value, index) => {
    const arc = record(value);
    return String(arc.id ?? "").trim() || `arc-${index + 1}`;
  });
  const eventKeys = list(plot.story_events).map((value, index) => {
    const event = record(value);
    return String(event.id ?? "").trim() || `event-${index + 1}`;
  });
  const chapterKeys = list(plot.chapter_cards).map((value, index) => {
    const chapter = record(value);
    const stageId = String(chapter.stage_id ?? "").trim() || `legacy-stage-${index + 1}`;
    return String(chapter.id ?? "").trim() || `chapter-${index + 1}:${stageId}`;
  });
  return {
    worldbuilding: mapped("worldbuilding", categoryKeys),
    characters: mapped("character", characterKeys),
    volumes: mapped("volume", volumeKeys),
    plotPoints: mapped("arc", arcKeys),
    storyEvents: mapped("event", eventKeys),
    chapterCards: mapped("chapter", chapterKeys)
  };
}

function fingerprintSource(source: {
  book: Record<string, unknown> | null;
  workspace: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({ book: source.book, workspace: source.workspace }))
    .digest("hex");
}

export async function previewWriteClawLongSync(
  sourcePath: string
): Promise<LongPreviewLegacySyncAtPathResult> {
  const source = await readWriteClawLongSource(sourcePath);
  const plan = createWriteClawLongImportPlan(source);
  return {
    sourceTitle: plan.manifest.title,
    sourceKind: source.sourceKind,
    legacySchemaVersion: plan.legacySchemaVersion,
    counts: sourceCounts(source.workspace),
    warnings: source.warnings,
    sourceFingerprint: fingerprintSource(source)
  };
}

function documentMap(plan: WriteClawLongImportPlan): Map<string, WriteClawLongImportDocument> {
  return new Map(plan.documents.map((document) => [document.fileId, document]));
}

function selected(modules: readonly LongLegacySyncModule[], module: LongLegacySyncModule): boolean {
  return modules.includes(module);
}

export interface BuildWriteClawLongSyncInput {
  sourcePath: string;
  expectedFingerprint: string;
  modules: readonly LongLegacySyncModule[];
  target: LongWorkspaceIndexSnapshot;
  targetBookLineContent: string;
  updatedAt: string;
}

export interface BuildWriteClawLongSyncResult {
  batch: LongWorkspaceOperationBatch | null;
  imported: LongLegacySyncCounts;
  skipped: LongLegacySyncCounts;
  warnings: string[];
}

export async function buildWriteClawLongSync(
  input: BuildWriteClawLongSyncInput
): Promise<BuildWriteClawLongSyncResult> {
  const source = await readWriteClawLongSource(input.sourcePath);
  if (fingerprintSource(source) !== input.expectedFingerprint) {
    throw new Error("旧版本压缩包在预览后发生变化，请重新选择。");
  }
  const plan = createWriteClawLongImportPlan(source, {
    importedAt: input.updatedAt
  });
  const counts = sourceCounts(source.workspace);
  const sourceIds = sourceMappedIds(plan, source.workspace);
  const docs = documentMap(plan);
  const operations: LongWorkspaceOperation[] = [];
  const documentWrites: LongWorkspaceOperationBatch["documentWrites"] = [];
  const imported = { ...EMPTY_COUNTS };
  const skipped = { ...EMPTY_COUNTS };
  const warnings = [...source.warnings];

  const addCreateDocument = (fileId: string, contentOverride?: string): void => {
    const document = docs.get(fileId);
    if (!document) throw new Error(`旧版本同步缺少文档：${fileId}`);
    const content = contentOverride ?? document.content;
    documentWrites.push({
      proposalId: `proposal_legacy-sync-create-${fileId}`,
      fileId,
      content,
      mode: "create",
      expectedRevision: null,
      nextRevision: createLongFileRevision(content),
      updatedAt: input.updatedAt,
      reason: "同步旧版本长篇"
    });
  };

  if (selected(input.modules, "worldbuilding")) {
    const existingIds = new Set(input.target.worldbuilding.map(({ id }) => id));
    const categories = plan.index.worldbuilding.filter(({ id }) => sourceIds.worldbuilding.has(id));
    let nextOrder = input.target.worldbuilding.length + 1;
    for (const category of categories) {
      if (existingIds.has(category.id)) {
        skipped.worldbuilding += 1;
        continue;
      }
      const nextCategory = { ...category, order: nextOrder++ };
      operations.push({ type: "worldbuilding.create", category: nextCategory });
      if (category.format === "text") {
        addCreateDocument(category.file.id);
      } else {
        if (!category.overview) {
          throw new Error(`旧版本同步缺少世界观概览：${category.id}`);
        }
        addCreateDocument(category.overview.id);
        category.items.forEach((item) => addCreateDocument(item.file.id));
      }
      imported.worldbuilding += 1;
    }
  }

  const importedCharacterIds = new Set<string>();
  if (selected(input.modules, "characters")) {
    const existingIds = new Set(input.target.characters.map(({ id }) => id));
    const groupCounts = new Map<string, number>();
    input.target.characters.forEach((character) =>
      groupCounts.set(character.group, (groupCounts.get(character.group) ?? 0) + 1)
    );
    const filesByCharacter = new Map(
      plan.index.characterFiles.map((files) => [files.characterId, files])
    );
    for (const character of plan.index.characters.filter(({ id }) => sourceIds.characters.has(id))) {
      if (existingIds.has(character.id)) {
        skipped.characters += 1;
        importedCharacterIds.add(character.id);
        continue;
      }
      const files = filesByCharacter.get(character.id);
      if (!files) throw new Error(`旧版本同步缺少人物文件：${character.id}`);
      const order = (groupCounts.get(character.group) ?? 0) + 1;
      groupCounts.set(character.group, order);
      operations.push({
        type: "character.create",
        character: { ...character, order },
        files
      });
      addCreateDocument(files.coreProfile.id);
      addCreateDocument(files.relationships.id);
      addCreateDocument(files.currentState.id);
      addCreateDocument(files.history.id);
      importedCharacterIds.add(character.id);
      imported.characters += 1;
    }
  }

  if (selected(input.modules, "plot")) {
    const marker = `<!-- deepwrite-legacy-sync:${plan.manifest.id} -->`;
    const outlineDocument = docs.get(plan.index.bookLine.id);
    if (counts.outline > 0 && outlineDocument?.content.trim()) {
      if (input.targetBookLineContent.includes(marker)) {
        skipped.outline = 1;
      } else {
        const content = [
          input.targetBookLineContent.trimEnd(),
          marker,
          `## 旧版本同步 · ${plan.manifest.title}`,
          outlineDocument.content.trim()
        ].filter(Boolean).join("\n\n") + "\n";
        documentWrites.push({
          proposalId: `proposal_legacy-sync-book-line-${plan.manifest.id}`,
          fileId: input.target.bookLine.id,
          content,
          mode: "replace",
          expectedRevision: input.target.bookLine.revision,
          nextRevision: createLongFileRevision(content),
          updatedAt: input.updatedAt,
          reason: "追加旧版本全书大纲"
        });
        imported.outline = 1;
      }
    }

    const existingVolumeIds = new Set(input.target.plot.volumes.map(({ id }) => id));
    const availableVolumeIds = new Set(existingVolumeIds);
    let volumeOrder = input.target.plot.volumes.length + 1;
    for (const volume of plan.index.plot.volumes.filter(({ id }) => sourceIds.volumes.has(id))) {
      availableVolumeIds.add(volume.id);
      if (existingVolumeIds.has(volume.id)) {
        skipped.volumes += 1;
      } else {
        operations.push({ type: "volume.create", volume: { ...volume, order: volumeOrder++ } });
        imported.volumes += 1;
      }
    }

    const existingArcIds = new Set(input.target.plot.arcs.map(({ id }) => id));
    const availableArcIds = new Set(existingArcIds);
    const arcOrders = new Map<string, number>();
    input.target.plot.arcs.forEach((arc) =>
      arcOrders.set(arc.volumeId, (arcOrders.get(arc.volumeId) ?? 0) + 1)
    );
    for (const arc of plan.index.plot.arcs.filter(({ id }) => sourceIds.plotPoints.has(id))) {
      if (!availableVolumeIds.has(arc.volumeId)) {
        skipped.plotPoints += 1;
        warnings.push(`剧情点“${arc.title}”缺少可同步分卷，已跳过。`);
        continue;
      }
      availableArcIds.add(arc.id);
      if (existingArcIds.has(arc.id)) {
        skipped.plotPoints += 1;
      } else {
        const order = (arcOrders.get(arc.volumeId) ?? 0) + 1;
        arcOrders.set(arc.volumeId, order);
        operations.push({ type: "arc.create", arc: { ...arc, order } });
        imported.plotPoints += 1;
      }
    }

    const existingCharacterIds = new Set(input.target.characters.map(({ id }) => id));
    importedCharacterIds.forEach((id) => existingCharacterIds.add(id));
    const existingEventIds = new Set(input.target.plot.storyEvents.map(({ id }) => id));
    let storyOrder = input.target.plot.storyEvents.length + 1;
    for (const event of plan.index.plot.storyEvents.filter(({ id }) => sourceIds.storyEvents.has(id))) {
      if (existingEventIds.has(event.id)) {
        skipped.storyEvents += 1;
        continue;
      }
      const arcIds = event.arcIds.filter((id) => availableArcIds.has(id));
      const characterIds = event.characterIds.filter((id) => existingCharacterIds.has(id));
      if (characterIds.length !== event.characterIds.length) {
        warnings.push(`故事事件“${event.title}”的部分人物引用未同步，已移除。`);
      }
      operations.push({
        type: "event.create",
        event: { ...event, storyOrder: storyOrder++, arcIds, characterIds }
      });
      imported.storyEvents += 1;
    }

    const existingChapterIds = new Set(input.target.plot.chapterCards.map(({ id }) => id));
    const chapterOrders = new Map<string, number>();
    input.target.plot.chapterCards.forEach((chapter) =>
      chapterOrders.set(chapter.volumeId, (chapterOrders.get(chapter.volumeId) ?? 0) + 1)
    );
    const filesByChapter = new Map(
      plan.index.chapters.map((files) => [files.chapterCardId, files])
    );
    for (const chapter of plan.index.plot.chapterCards.filter(({ id }) => sourceIds.chapterCards.has(id))) {
      if (existingChapterIds.has(chapter.id)) {
        skipped.chapterCards += 1;
        continue;
      }
      if (
        !availableVolumeIds.has(chapter.volumeId) ||
        (chapter.primaryArcId !== null &&
          !availableArcIds.has(chapter.primaryArcId))
      ) {
        skipped.chapterCards += 1;
        warnings.push(`章卡“${chapter.title}”缺少可同步分卷或关联剧情点，已跳过。`);
        continue;
      }
      const sourceFiles = filesByChapter.get(chapter.id);
      if (!sourceFiles) throw new Error(`旧版本同步缺少章卡文件：${chapter.id}`);
      const emptyRevision = createLongFileRevision("");
      const emptyFile = <T extends { revision: string; updatedAt: string }>(file: T): T => ({
        ...file,
        revision: emptyRevision,
        updatedAt: input.updatedAt
      });
      const files = {
        chapterCardId: chapter.id,
        bodyStatus: "empty" as const,
        body: emptyFile(sourceFiles.body),
        card: { ...sourceFiles.card, updatedAt: input.updatedAt },
        characterState: emptyFile(sourceFiles.characterState),
        handoff: emptyFile(sourceFiles.handoff),
        foreshadowingChanges: emptyFile(sourceFiles.foreshadowingChanges),
        worldReveals: null,
        characterContinuity: [],
        commitId: null
      };
      const narrativeOrder = (chapterOrders.get(chapter.volumeId) ?? 0) + 1;
      chapterOrders.set(chapter.volumeId, narrativeOrder);
      operations.push({
        type: "chapter.create",
        chapterCard: { ...chapter, narrativeOrder },
        files
      });
      addCreateDocument(files.body.id, "");
      addCreateDocument(files.card.id);
      addCreateDocument(files.characterState.id, "");
      addCreateDocument(files.handoff.id, "");
      addCreateDocument(files.foreshadowingChanges.id, "");
      imported.chapterCards += 1;
    }
  }

  if (operations.length === 0 && documentWrites.length === 0) {
    return { batch: null, imported, skipped, warnings };
  }
  return {
    batch: LongWorkspaceOperationBatchSchema.parse({
      baseRevision: input.target.revision,
      updatedAt: input.updatedAt,
      operations,
      documentWrites
    }),
    imported,
    skipped,
    warnings
  };
}
