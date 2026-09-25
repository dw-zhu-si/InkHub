import {
  LongWorkspaceOperationBatchSchema,
  LongWorkspaceIndexSnapshotSchema,
  createEmptyLongMarkdownFileReference,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterHandoffFileId,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterFilePath,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  longStoryPlotBodyFileId,
  longStoryPlotFilePath,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  type LongCharacterGroup,
  type LongCharacterTypeId,
  type LongDisclosureLevel,
  type LongEventConnectionType,
  type LongForeshadowingBeatType,
  type LongForeshadowingSpan,
  type LongForeshadowingStatus,
  type LongNarrativeMode,
  type LongStoryTimeMode,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch,
  type LongWorldbuildingFormat,
  type LongWorldbuildingItemLayout
} from "@deepwrite/contracts";
import { createId as createSharedId } from "@deepwrite/shared";

type OperationOf<T extends LongWorkspaceOperation["type"]> = Extract<
  LongWorkspaceOperation,
  { type: T }
>;

export type LongOrderDirection = "up" | "down";

export interface LongStructureMutationBuilderOptions {
  now?: () => string;
  createId?: (prefix: string) => string;
}

export interface CreateLongWorldbuildingInput {
  title: string;
  format: LongWorldbuildingFormat;
}

export interface UpdateLongWorldbuildingInput {
  title?: string;
  format?: LongWorldbuildingFormat;
}

function longStructureFingerprint(
  snapshot: LongWorkspaceIndexSnapshot
): string {
  const normalized = LongWorkspaceIndexSnapshotSchema.parse(snapshot);
  return JSON.stringify(normalized, (key, value) =>
    key === "revision" || key === "updatedAt" ? undefined : value
  );
}

/**
 * Direct document saves advance the workspace revision even though the
 * structural graph is unchanged. Rebase a structure batch only for that exact
 * case; a real concurrent structure change must still surface as a conflict.
 */
export function rebaseLongStructureBatchAfterDocumentSave(input: {
  batch: LongWorkspaceOperationBatch;
  before: LongWorkspaceIndexSnapshot;
  after: LongWorkspaceIndexSnapshot;
}): LongWorkspaceOperationBatch {
  if (input.batch.baseRevision === input.after.revision) {
    return input.batch;
  }
  if (
    input.batch.baseRevision !== input.before.revision ||
    longStructureFingerprint(input.before) !==
      longStructureFingerprint(input.after)
  ) {
    throw new Error("长篇结构已更新，请基于最新结构重新修改。");
  }
  return LongWorkspaceOperationBatchSchema.parse({
    ...input.batch,
    baseRevision: input.after.revision
  });
}

export interface CreateLongCharacterInput {
  name: string;
  group: LongCharacterGroup;
  aliases?: string[];
}

export interface CreateLongCharacterTypeInput {
  title: string;
}

export interface UpdateLongCharacterTypeInput {
  title: string;
}

export interface UpdateLongCharacterInput {
  name?: string;
  aliases?: string[];
  group?: LongCharacterGroup;
}

export interface CreateLongVolumeInput {
  title: string;
  summary?: string;
}

export interface UpdateLongVolumeInput {
  title?: string;
  summary?: string;
}

export interface CreateLongArcInput {
  volumeId: string;
  title: string;
  summary?: string;
  outline?: string;
}

export interface UpdateLongArcInput {
  title?: string;
  summary?: string;
  outline?: string;
  volumeId?: string;
}

export interface CreateLongChapterInput {
  volumeId: string;
  primaryArcId: string | null;
  title: string;
}

export interface UpdateLongChapterInput {
  title?: string;
  volumeId?: string;
  primaryArcId?: string | null;
}

export interface CreateLongStoryEventInput {
  title: string;
  summary?: string;
  timeMode: LongStoryTimeMode;
  timeLabel?: string;
  timeValue?: string;
  location?: string;
  arcIds?: string[];
  characterIds?: string[];
}

export type UpdateLongStoryEventInput = Partial<CreateLongStoryEventInput>;

export interface CreateLongStoryPlotInput {
  arcId: string;
  title: string;
}

export interface UpdateLongStoryPlotInput {
  title?: string;
}

export interface CreateLongEventConnectionInput {
  sourceEventId: string;
  targetEventId: string;
  type: LongEventConnectionType;
  note?: string;
}

export type UpdateLongEventConnectionInput =
  Partial<CreateLongEventConnectionInput>;

export interface CreateLongNarrativePlacementInput {
  eventId: string;
  chapterCardId: string;
  mode: LongNarrativeMode;
  disclosure: LongDisclosureLevel;
  writingPrompt?: string;
}

export interface UpdateLongNarrativePlacementInput {
  eventId?: string;
  chapterCardId?: string;
  mode?: LongNarrativeMode;
  disclosure?: LongDisclosureLevel;
  writingPrompt?: string;
}

export interface CreateLongForeshadowingInput {
  title: string;
  coreQuestion?: string;
  hiddenTruth?: string;
  plannedSpan?: LongForeshadowingSpan;
  truthEventId?: string | null;
  expectedReaderEffect?: string;
  status?: LongForeshadowingStatus;
}

export interface UpdateLongForeshadowingInput {
  title?: string;
  coreQuestion?: string;
  hiddenTruth?: string;
  plannedSpan?: LongForeshadowingSpan;
  truthEventId?: string | null;
  expectedReaderEffect?: string;
  status?: "planned" | "abandoned";
}

export interface CreateLongForeshadowingBeatInput {
  threadId: string;
  type: LongForeshadowingBeatType;
  volumeId?: string | null;
  arcId?: string | null;
  eventId?: string | null;
  placementId?: string | null;
  chapterCardId?: string | null;
  plannedScope?: string;
  note?: string;
}

export interface UpdateLongForeshadowingBeatInput {
  threadId?: string;
  type?: LongForeshadowingBeatType;
  volumeId?: string | null;
  arcId?: string | null;
  eventId?: string | null;
  placementId?: string | null;
  chapterCardId?: string | null;
  plannedScope?: string;
  note?: string;
}

export interface LongStructureMutationBuilder {
  updateFeatureSettings(input: {
    worldbuildingItemLayout?: LongWorldbuildingItemLayout;
    characterAndContinuityItemLayout?: LongWorldbuildingItemLayout;
    plotItemLayout?: LongWorldbuildingItemLayout;
  }): LongWorkspaceOperationBatch;
  createWorldbuilding(
    input: CreateLongWorldbuildingInput
  ): LongWorkspaceOperationBatch;
  updateWorldbuilding(
    id: string,
    input: UpdateLongWorldbuildingInput
  ): LongWorkspaceOperationBatch;
  reorderWorldbuilding(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteWorldbuilding(
    id: string,
    cascade: boolean
  ): LongWorkspaceOperationBatch;
  createWorldbuildingItem(
    categoryId: string,
    title?: string
  ): LongWorkspaceOperationBatch;
  reorderWorldbuildingItem(
    categoryId: string,
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteWorldbuildingItem(
    categoryId: string,
    id: string
  ): LongWorkspaceOperationBatch;

  createCharacterType(
    input: CreateLongCharacterTypeInput
  ): LongWorkspaceOperationBatch;
  updateCharacterType(
    id: LongCharacterTypeId,
    input: UpdateLongCharacterTypeInput
  ): LongWorkspaceOperationBatch;
  reorderCharacterType(
    id: LongCharacterTypeId,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteCharacterType(
    id: LongCharacterTypeId,
    moveCharactersToTypeId?: LongCharacterTypeId
  ): LongWorkspaceOperationBatch;

  createCharacter(input: CreateLongCharacterInput): LongWorkspaceOperationBatch;
  updateCharacter(
    id: string,
    input: UpdateLongCharacterInput
  ): LongWorkspaceOperationBatch;
  moveCharacter(
    id: string,
    toGroup: LongCharacterGroup,
    beforeCharacterId?: string
  ): LongWorkspaceOperationBatch;
  reorderCharacter(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteCharacter(id: string, cascade: boolean): LongWorkspaceOperationBatch;

  createVolume(input: CreateLongVolumeInput): LongWorkspaceOperationBatch;
  updateVolume(
    id: string,
    input: UpdateLongVolumeInput
  ): LongWorkspaceOperationBatch;
  reorderVolume(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteVolume(id: string, cascade: boolean): LongWorkspaceOperationBatch;

  createArc(input: CreateLongArcInput): LongWorkspaceOperationBatch;
  updateArc(id: string, input: UpdateLongArcInput): LongWorkspaceOperationBatch;
  moveArc(
    id: string,
    toVolumeId: string,
    beforeArcId?: string
  ): LongWorkspaceOperationBatch;
  reorderArc(id: string, direction: LongOrderDirection): LongWorkspaceOperationBatch;
  deleteArc(id: string, cascade: boolean): LongWorkspaceOperationBatch;

  createChapter(input: CreateLongChapterInput): LongWorkspaceOperationBatch;
  updateChapter(
    id: string,
    input: UpdateLongChapterInput
  ): LongWorkspaceOperationBatch;
  moveChapter(
    id: string,
    toVolumeId: string,
    toPrimaryArcId: string | null,
    beforeChapterCardId?: string
  ): LongWorkspaceOperationBatch;
  reorderChapter(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteChapter(id: string, cascade: boolean): LongWorkspaceOperationBatch;

  createStoryEvent(
    input: CreateLongStoryEventInput
  ): LongWorkspaceOperationBatch;
  updateStoryEvent(
    id: string,
    input: UpdateLongStoryEventInput
  ): LongWorkspaceOperationBatch;
  reorderStoryEvent(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteStoryEvent(id: string, cascade: boolean): LongWorkspaceOperationBatch;

  createStoryPlot(input: CreateLongStoryPlotInput): LongWorkspaceOperationBatch;
  updateStoryPlot(
    id: string,
    input: UpdateLongStoryPlotInput
  ): LongWorkspaceOperationBatch;
  reorderStoryPlot(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteStoryPlot(id: string, cascade?: boolean): LongWorkspaceOperationBatch;

  createEventConnection(
    input: CreateLongEventConnectionInput
  ): LongWorkspaceOperationBatch;
  updateEventConnection(
    id: string,
    input: UpdateLongEventConnectionInput
  ): LongWorkspaceOperationBatch;
  deleteEventConnection(id: string): LongWorkspaceOperationBatch;

  createNarrativePlacement(
    input: CreateLongNarrativePlacementInput
  ): LongWorkspaceOperationBatch;
  updateNarrativePlacement(
    id: string,
    input: UpdateLongNarrativePlacementInput
  ): LongWorkspaceOperationBatch;
  moveNarrativePlacement(
    id: string,
    toChapterCardId: string,
    beforePlacementId?: string
  ): LongWorkspaceOperationBatch;
  reorderNarrativePlacement(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteNarrativePlacement(
    id: string,
    cascade: boolean
  ): LongWorkspaceOperationBatch;

  createForeshadowing(
    input: CreateLongForeshadowingInput
  ): LongWorkspaceOperationBatch;
  updateForeshadowing(
    id: string,
    input: UpdateLongForeshadowingInput
  ): LongWorkspaceOperationBatch;
  reorderForeshadowing(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteForeshadowing(
    id: string,
    cascade: boolean
  ): LongWorkspaceOperationBatch;

  createForeshadowingBeat(
    input: CreateLongForeshadowingBeatInput
  ): LongWorkspaceOperationBatch;
  updateForeshadowingBeat(
    id: string,
    input: UpdateLongForeshadowingBeatInput
  ): LongWorkspaceOperationBatch;
  moveForeshadowingBeat(
    id: string,
    toThreadId: string,
    beforeBeatId?: string
  ): LongWorkspaceOperationBatch;
  reorderForeshadowingBeat(
    id: string,
    direction: LongOrderDirection
  ): LongWorkspaceOperationBatch;
  deleteForeshadowingBeat(id: string): LongWorkspaceOperationBatch;
}

function normalizedList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function assertPresent<T>(
  value: T | undefined,
  label: string
): asserts value is T {
  if (value === undefined) {
    throw new Error(`${label} does not exist in the long workspace snapshot.`);
  }
}

function nonEmptyOperations(
  operations: Array<LongWorkspaceOperation | undefined>
): LongWorkspaceOperation[] {
  const present = operations.filter(
    (operation): operation is LongWorkspaceOperation => operation !== undefined
  );
  if (present.length === 0) {
    throw new Error("A structure mutation must contain at least one change.");
  }
  return present;
}

export function moveLongOrderedId(
  orderedIds: readonly string[],
  id: string,
  direction: LongOrderDirection
): string[] {
  const next = [...orderedIds];
  const currentIndex = next.indexOf(id);
  if (currentIndex < 0) {
    throw new Error(`Cannot reorder missing id: ${id}`);
  }
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= next.length) {
    throw new Error(`Cannot move ${id} ${direction}; it is already at the boundary.`);
  }
  [next[currentIndex], next[targetIndex]] = [
    next[targetIndex]!,
    next[currentIndex]!
  ];
  return next;
}

export function createLongStructureMutationBuilder(
  snapshot: LongWorkspaceIndexSnapshot,
  options: LongStructureMutationBuilderOptions = {}
): LongStructureMutationBuilder {
  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? createSharedId;

  const batch = (
    operations: Array<LongWorkspaceOperation | undefined>,
    updatedAt = now()
  ): LongWorkspaceOperationBatch =>
    LongWorkspaceOperationBatchSchema.parse({
      baseRevision: snapshot.revision,
      updatedAt,
      operations: nonEmptyOperations(operations),
      documentWrites: []
    });

  const volume = (id: string) =>
    snapshot.plot.volumes.find((candidate) => candidate.id === id);
  const arc = (id: string) =>
    snapshot.plot.arcs.find((candidate) => candidate.id === id);
  const chapter = (id: string) =>
    snapshot.plot.chapterCards.find((candidate) => candidate.id === id);
  const character = (id: string) =>
    snapshot.characters.find((candidate) => candidate.id === id);
  const characterType = (id: string) =>
    snapshot.characterTypes.find((candidate) => candidate.id === id);
  const worldbuilding = (id: string) =>
    snapshot.worldbuilding.find((candidate) => candidate.id === id);
  const storyEvent = (id: string) =>
    snapshot.plot.storyEvents.find((candidate) => candidate.id === id);
  const storyPlot = (id: string) =>
    (snapshot.plot.storyPlots ?? []).find(
      (candidate) => candidate.id === id
    );
  const eventConnection = (id: string) =>
    snapshot.plot.eventConnections.find((candidate) => candidate.id === id);
  const narrativePlacement = (id: string) =>
    snapshot.plot.narrativePlacements.find((candidate) => candidate.id === id);
  const foreshadowing = (id: string) =>
    snapshot.plot.foreshadowing.find((candidate) => candidate.id === id);
  const foreshadowingBeat = (id: string) => {
    for (const thread of snapshot.plot.foreshadowing) {
      const beat = thread.beats.find((candidate) => candidate.id === id);
      if (beat) {
        return { thread, beat };
      }
    }
    return undefined;
  };

  const orderedWorldbuilding = () =>
    [...snapshot.worldbuilding]
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  const orderedWorldbuildingItems = (categoryId: string) => {
    const category = worldbuilding(categoryId);
    assertPresent(category, "Worldbuilding category");
    if (category.format !== "list") {
      throw new Error("Worldbuilding category is not list-based.");
    }
    return [...category.items]
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  };
  const orderedCharacters = (group: LongCharacterGroup) =>
    snapshot.characters
      .filter((candidate) => candidate.group === group)
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  const orderedCharacterTypes = () =>
    [...snapshot.characterTypes]
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  const orderedVolumes = () =>
    [...snapshot.plot.volumes]
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  const orderedArcs = (volumeId: string) =>
    snapshot.plot.arcs
      .filter((candidate) => candidate.volumeId === volumeId)
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  const orderedChapters = (volumeId: string) =>
    snapshot.plot.chapterCards
      .filter((candidate) => candidate.volumeId === volumeId)
      .sort((left, right) => left.narrativeOrder - right.narrativeOrder)
      .map(({ id }) => id);
  const orderedStoryEvents = () =>
    [...snapshot.plot.storyEvents]
      .sort((left, right) => left.storyOrder - right.storyOrder)
      .map(({ id }) => id);
  const orderedStoryPlots = (arcId: string) =>
    (snapshot.plot.storyPlots ?? [])
      .filter((candidate) => candidate.arcId === arcId)
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  const orderedNarrativePlacements = (chapterCardId: string) =>
    snapshot.plot.narrativePlacements
      .filter((candidate) => candidate.chapterCardId === chapterCardId)
      .sort((left, right) => left.orderInChapter - right.orderInChapter)
      .map(({ id }) => id);
  const orderedForeshadowing = () =>
    snapshot.plot.foreshadowing.map(({ id }) => id);
  const orderedForeshadowingBeats = (threadId: string) => {
    const thread = foreshadowing(threadId);
    assertPresent(thread, "Foreshadowing thread");
    return [...thread.beats]
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
  };

  const assertArcIds = (arcIds: readonly string[] | undefined): string[] => {
    const ids = normalizedList(arcIds);
    ids.forEach((id) => assertPresent(arc(id), "Story event arc"));
    return ids;
  };

  const assertCharacterIds = (
    characterIds: readonly string[] | undefined
  ): string[] => {
    const ids = normalizedList(characterIds);
    ids.forEach((id) =>
      assertPresent(character(id), "Story event character")
    );
    return ids;
  };

  const assertBeatReferences = (input: {
    volumeId?: string | null;
    arcId?: string | null;
    eventId?: string | null;
    placementId?: string | null;
    chapterCardId?: string | null;
    plannedScope?: string;
  }): void => {
    const volumeAnchor =
      input.volumeId === null || input.volumeId === undefined
        ? undefined
        : volume(input.volumeId);
    const arcAnchor =
      input.arcId === null || input.arcId === undefined
        ? undefined
        : arc(input.arcId);
    const event =
      input.eventId === null || input.eventId === undefined
        ? undefined
        : storyEvent(input.eventId);
    const placement =
      input.placementId === null || input.placementId === undefined
        ? undefined
        : narrativePlacement(input.placementId);
    const chapterCard =
      input.chapterCardId === null || input.chapterCardId === undefined
        ? undefined
        : chapter(input.chapterCardId);
    if (input.volumeId) {
      assertPresent(volumeAnchor, "Foreshadowing beat planning volume");
    }
    if (input.arcId) {
      assertPresent(arcAnchor, "Foreshadowing beat planning arc");
    }
    if (input.eventId) assertPresent(event, "Foreshadowing beat event");
    if (input.placementId) {
      assertPresent(placement, "Foreshadowing beat placement");
    }
    if (input.chapterCardId) {
      assertPresent(chapterCard, "Foreshadowing beat chapter");
    }
    if (
      volumeAnchor &&
      arcAnchor &&
      arcAnchor.volumeId !== volumeAnchor.id
    ) {
      throw new Error(
        "Foreshadowing beat planning arc must belong to its planning volume."
      );
    }
    if (placement && event && placement.eventId !== event.id) {
      throw new Error(
        "Foreshadowing beat event must match its narrative placement."
      );
    }
    if (
      placement &&
      chapterCard &&
      placement.chapterCardId !== chapterCard.id
    ) {
      throw new Error(
        "Foreshadowing beat chapter must match its narrative placement."
      );
    }
    const anchoredChapter =
      chapterCard ??
      (placement ? chapter(placement.chapterCardId) : undefined);
    if (
      volumeAnchor &&
      anchoredChapter &&
      anchoredChapter.volumeId !== volumeAnchor.id
    ) {
      throw new Error(
        "Foreshadowing beat planning volume must match its concrete chapter."
      );
    }
    if (
      arcAnchor &&
      anchoredChapter &&
      anchoredChapter.primaryArcId !== null &&
      anchoredChapter.primaryArcId !== arcAnchor.id
    ) {
      throw new Error(
        "Foreshadowing beat planning arc must match its concrete chapter."
      );
    }
    if (
      arcAnchor &&
      event &&
      !event.arcIds.includes(arcAnchor.id)
    ) {
      throw new Error(
        "Foreshadowing beat planning arc must match its concrete event."
      );
    }
    if (
      volumeAnchor &&
      event &&
      !event.arcIds.some(
        (eventArcId) => arc(eventArcId)?.volumeId === volumeAnchor.id
      )
    ) {
      throw new Error(
        "Foreshadowing beat planning volume must match its concrete event."
      );
    }
    if (
      !volumeAnchor &&
      !arcAnchor &&
      !event &&
      !placement &&
      !chapterCard &&
      !(input.plannedScope ?? "").trim()
    ) {
      throw new Error(
        "Foreshadowing beat needs a volume, plot point, event, placement, chapter, or planned scope."
      );
    }
  };

  const moveCharacter = (
    id: string,
    toGroup: LongCharacterGroup,
    beforeCharacterId?: string
  ): LongWorkspaceOperationBatch =>
    batch([
      {
        type: "character.move",
        id,
        toGroup,
        ...(beforeCharacterId ? { beforeCharacterId } : {})
      }
    ]);

  const moveArc = (
    id: string,
    toVolumeId: string,
    beforeArcId?: string
  ): LongWorkspaceOperationBatch => {
    assertPresent(volume(toVolumeId), "Target volume");
    return batch([
      {
        type: "arc.move",
        id,
        toVolumeId,
        ...(beforeArcId ? { beforeArcId } : {})
      }
    ]);
  };

  const moveChapter = (
    id: string,
    toVolumeId: string,
    toPrimaryArcId: string | null,
    beforeChapterCardId?: string
  ): LongWorkspaceOperationBatch => {
    assertPresent(volume(toVolumeId), "Target volume");
    if (toPrimaryArcId !== null) {
      const targetArc = arc(toPrimaryArcId);
      assertPresent(targetArc, "Target primary arc");
      if (targetArc.volumeId !== toVolumeId) {
        throw new Error("Target primary arc must belong to the target volume.");
      }
    }
    return batch([
      {
        type: "chapter.move",
        id,
        toVolumeId,
        toPrimaryArcId,
        ...(beforeChapterCardId ? { beforeChapterCardId } : {})
      }
    ]);
  };

  const moveNarrativePlacement = (
    id: string,
    toChapterCardId: string,
    beforePlacementId?: string
  ): LongWorkspaceOperationBatch => {
    assertPresent(narrativePlacement(id), "Narrative placement");
    assertPresent(chapter(toChapterCardId), "Target chapter");
    if (beforePlacementId) {
      const before = narrativePlacement(beforePlacementId);
      assertPresent(before, "Target placement");
      if (before.chapterCardId !== toChapterCardId) {
        throw new Error(
          "Target placement must belong to the selected chapter."
        );
      }
    }
    return batch([
      {
        type: "placement.move",
        id,
        toChapterCardId,
        ...(beforePlacementId ? { beforePlacementId } : {})
      }
    ]);
  };

  const moveForeshadowingBeat = (
    id: string,
    toThreadId: string,
    beforeBeatId?: string
  ): LongWorkspaceOperationBatch => {
    assertPresent(foreshadowingBeat(id), "Foreshadowing beat");
    const targetThread = foreshadowing(toThreadId);
    assertPresent(targetThread, "Target foreshadowing thread");
    if (
      beforeBeatId &&
      !targetThread.beats.some((beat) => beat.id === beforeBeatId)
    ) {
      throw new Error(
        "Target beat must belong to the selected foreshadowing thread."
      );
    }
    return batch([
      {
        type: "foreshadowingBeat.move",
        id,
        toThreadId,
        ...(beforeBeatId ? { beforeBeatId } : {})
      }
    ]);
  };

  return {
    updateFeatureSettings(input) {
      const patch = {
        ...(input.worldbuildingItemLayout !== undefined
          ? { worldbuildingItemLayout: input.worldbuildingItemLayout }
          : {}),
        ...(input.characterAndContinuityItemLayout !== undefined
          ? {
              characterAndContinuityItemLayout:
                input.characterAndContinuityItemLayout
            }
          : {}),
        ...(input.plotItemLayout !== undefined
          ? { plotItemLayout: input.plotItemLayout }
          : {})
      };
      return batch([
        {
          type: "featureSettings.update",
          patch
        }
      ]);
    },

    createWorldbuilding(input) {
      const updatedAt = now();
      const id = createId("world");
      const operation: OperationOf<"worldbuilding.create"> = {
        type: "worldbuilding.create",
        category:
          input.format === "list"
            ? {
                id,
                title: input.title.trim(),
                order: snapshot.worldbuilding.length + 1,
                format: "list",
                contentAuthority: "files",
                overview: createEmptyLongMarkdownFileReference(
                  longWorldbuildingOverviewFileId(id),
                  longWorldbuildingOverviewContentPath(id),
                  updatedAt
                ),
                items: []
              }
            : {
                id,
                title: input.title.trim(),
                order: snapshot.worldbuilding.length + 1,
                format: "text",
                contentAuthority: "markdown",
                file: createEmptyLongMarkdownFileReference(
                  longWorldbuildingFileId(id),
                  longWorldbuildingContentPath(id),
                  updatedAt
                )
              }
      };
      return batch([operation], updatedAt);
    },

    updateWorldbuilding(id, input) {
      const patch: OperationOf<"worldbuilding.update">["patch"] = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.format !== undefined ? { format: input.format } : {})
      };
      return batch([{ type: "worldbuilding.update", id, patch }]);
    },

    reorderWorldbuilding(id, direction) {
      return batch([
        {
          type: "worldbuilding.reorder",
          orderedIds: moveLongOrderedId(
            orderedWorldbuilding(),
            id,
            direction
          )
        }
      ]);
    },

    deleteWorldbuilding(id, cascade) {
      return batch([{ type: "worldbuilding.delete", id, cascade }]);
    },

    createWorldbuildingItem(categoryId, requestedTitle) {
      const category = worldbuilding(categoryId);
      assertPresent(category, "Worldbuilding category");
      if (category.format !== "list") {
        throw new Error("只有列表型世界观分类可以新增条目。");
      }
      if (category.items.length >= 10_000) {
        throw new Error("单个世界观分类最多支持 10000 个条目。");
      }
      const usedTitles = new Set(category.items.map(({ title }) => title));
      let sequence = category.items.length + 1;
      let title = requestedTitle?.trim() || `新条目 ${sequence}`;
      while (!requestedTitle?.trim() && usedTitles.has(title)) {
        sequence += 1;
        title = `新条目 ${sequence}`;
      }
      const id = createId("worlditem");
      const updatedAt = now();
      return batch(
        [
          {
            type: "worldbuildingItem.create",
            categoryId,
            item: {
              id,
              title,
              order: category.items.length + 1,
              file: createEmptyLongMarkdownFileReference(
                longWorldbuildingItemFileId(id),
                longWorldbuildingItemContentPath(categoryId, id),
                updatedAt
              )
            }
          }
        ],
        updatedAt
      );
    },

    reorderWorldbuildingItem(categoryId, id, direction) {
      return batch([
        {
          type: "worldbuildingItem.reorder",
          categoryId,
          orderedIds: moveLongOrderedId(
            orderedWorldbuildingItems(categoryId),
            id,
            direction
          )
        }
      ]);
    },

    deleteWorldbuildingItem(categoryId, id) {
      return batch([
        {
          type: "worldbuildingItem.delete",
          categoryId,
          id,
          cascade: true
        }
      ]);
    },

    createCharacterType(input) {
      const id = createId("chartype");
      return batch([
        {
          type: "characterType.create",
          characterType: {
            id,
            title: input.title.trim(),
            order: snapshot.characterTypes.length + 1
          }
        }
      ]);
    },

    updateCharacterType(id, input) {
      assertPresent(characterType(id), "Character type");
      return batch([
        {
          type: "characterType.update",
          id,
          patch: { title: input.title.trim() }
        }
      ]);
    },

    reorderCharacterType(id, direction) {
      assertPresent(characterType(id), "Character type");
      return batch([
        {
          type: "characterType.reorder",
          orderedIds: moveLongOrderedId(
            orderedCharacterTypes(),
            id,
            direction
          )
        }
      ]);
    },

    deleteCharacterType(id, moveCharactersToTypeId) {
      assertPresent(characterType(id), "Character type");
      if (moveCharactersToTypeId) {
        assertPresent(characterType(moveCharactersToTypeId), "Target character type");
      }
      return batch([
        {
          type: "characterType.delete",
          id,
          ...(moveCharactersToTypeId ? { moveCharactersToTypeId } : {})
        }
      ]);
    },

    createCharacter(input) {
      assertPresent(characterType(input.group), "Character type");
      const updatedAt = now();
      const id = createId("character");
      const operation: OperationOf<"character.create"> = {
        type: "character.create",
        character: {
          id,
          name: input.name.trim(),
          group: input.group,
          order:
            snapshot.characters.filter(
              (candidate) => candidate.group === input.group
            ).length + 1,
          aliases: normalizedList(input.aliases)
        },
        files: {
          characterId: id,
          coreProfile: createEmptyLongMarkdownFileReference(
            longCharacterCoreProfileFileId(id),
            longCharacterFilePath(id, "core-profile.md"),
            updatedAt
          ),
          relationships: createEmptyLongMarkdownFileReference(
            longCharacterRelationshipsFileId(id),
            longCharacterFilePath(id, "relationships.md"),
            updatedAt
          ),
          currentState: createEmptyLongMarkdownFileReference(
            longCharacterCurrentStateFileId(id),
            longCharacterFilePath(id, "current-state.md"),
            updatedAt
          ),
          history: createEmptyLongMarkdownFileReference(
            longCharacterHistoryFileId(id),
            longCharacterFilePath(id, "history.md"),
            updatedAt
          )
        }
      };
      return batch([operation], updatedAt);
    },

    updateCharacter(id, input) {
      const current = character(id);
      assertPresent(current, "Character");
      const patch: Partial<OperationOf<"character.update">["patch"]> = {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.aliases !== undefined
          ? { aliases: normalizedList(input.aliases) }
          : {})
      };
      const update =
        Object.keys(patch).length > 0
          ? ({
              type: "character.update",
              id,
              patch
            } as OperationOf<"character.update">)
          : undefined;
      const move =
        input.group !== undefined && input.group !== current.group
          ? ({
              type: "character.move",
              id,
              toGroup: input.group
            } as OperationOf<"character.move">)
          : undefined;
      return batch([update, move]);
    },

    moveCharacter,

    reorderCharacter(id, direction) {
      const current = character(id);
      assertPresent(current, "Character");
      return batch([
        {
          type: "character.reorder",
          group: current.group,
          orderedIds: moveLongOrderedId(
            orderedCharacters(current.group),
            id,
            direction
          )
        }
      ]);
    },

    deleteCharacter(id, cascade) {
      return batch([{ type: "character.delete", id, cascade }]);
    },

    createVolume(input) {
      const id = createId("volume");
      return batch([
        {
          type: "volume.create",
          volume: {
            id,
            title: input.title.trim(),
            order: snapshot.plot.volumes.length + 1,
            summary: input.summary ?? ""
          }
        }
      ]);
    },

    updateVolume(id, input) {
      const patch: OperationOf<"volume.update">["patch"] = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {})
      };
      return batch([{ type: "volume.update", id, patch }]);
    },

    reorderVolume(id, direction) {
      return batch([
        {
          type: "volume.reorder",
          orderedIds: moveLongOrderedId(orderedVolumes(), id, direction)
        }
      ]);
    },

    deleteVolume(id, cascade) {
      return batch([{ type: "volume.delete", id, cascade }]);
    },

    createArc(input) {
      assertPresent(volume(input.volumeId), "Volume");
      const id = createId("arc");
      return batch([
        {
          type: "arc.create",
          arc: {
            id,
            volumeId: input.volumeId,
            title: input.title.trim(),
            order:
              snapshot.plot.arcs.filter(
                (candidate) => candidate.volumeId === input.volumeId
              ).length + 1,
            ...(input.summary !== undefined
              ? { summary: input.summary }
              : {}),
            outline: input.outline ?? ""
          }
        }
      ]);
    },

    updateArc(id, input) {
      const current = arc(id);
      assertPresent(current, "Arc");
      const targetVolumeId = input.volumeId ?? current.volumeId;
      assertPresent(volume(targetVolumeId), "Target volume");
      const patch: Partial<OperationOf<"arc.update">["patch"]> = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.outline !== undefined ? { outline: input.outline } : {})
      };
      return batch([
        Object.keys(patch).length > 0
          ? ({
              type: "arc.update",
              id,
              patch
            } as OperationOf<"arc.update">)
          : undefined,
        targetVolumeId !== current.volumeId
          ? {
              type: "arc.move",
              id,
              toVolumeId: targetVolumeId
            }
          : undefined
      ]);
    },

    moveArc,

    reorderArc(id, direction) {
      const current = arc(id);
      assertPresent(current, "Arc");
      return batch([
        {
          type: "arc.reorder",
          volumeId: current.volumeId,
          orderedIds: moveLongOrderedId(
            orderedArcs(current.volumeId),
            id,
            direction
          )
        }
      ]);
    },

    deleteArc(id, cascade) {
      return batch([{ type: "arc.delete", id, cascade }]);
    },

    createChapter(input) {
      assertPresent(volume(input.volumeId), "Volume");
      if (input.primaryArcId !== null) {
        const primaryArc = arc(input.primaryArcId);
        assertPresent(primaryArc, "Primary arc");
        if (primaryArc.volumeId !== input.volumeId) {
          throw new Error("Primary arc must belong to the selected volume.");
        }
      }
      const updatedAt = now();
      const id = createId("chapter");
      const operation: OperationOf<"chapter.create"> = {
        type: "chapter.create",
        chapterCard: {
          id,
          volumeId: input.volumeId,
          primaryArcId: input.primaryArcId,
          title: input.title.trim(),
          narrativeOrder:
            snapshot.plot.chapterCards.filter(
              (candidate) => candidate.volumeId === input.volumeId
            ).length + 1
        },
        files: {
          chapterCardId: id,
          bodyStatus: "empty",
          body: createEmptyLongMarkdownFileReference(
            longChapterBodyFileId(id),
            longChapterFilePath(id, "body.md"),
            updatedAt
          ),
          card: createEmptyLongMarkdownFileReference(
            longChapterCardFileId(id),
            longChapterFilePath(id, "card.md"),
            updatedAt
          ),
          characterState: createEmptyLongMarkdownFileReference(
            longChapterCharacterStateFileId(id),
            longChapterFilePath(id, "character-state.md"),
            updatedAt
          ),
          handoff: createEmptyLongMarkdownFileReference(
            longChapterHandoffFileId(id),
            longChapterFilePath(id, "handoff.md"),
            updatedAt
          ),
          foreshadowingChanges: createEmptyLongMarkdownFileReference(
            longChapterForeshadowingChangesFileId(id),
            longChapterContinuityFilePath(
              id,
              "foreshadowing-changes.md"
            ),
            updatedAt
          ),
          worldReveals: null,
          characterContinuity: [],
          commitId: null
        }
      };
      return batch([operation], updatedAt);
    },

    updateChapter(id, input) {
      const current = chapter(id);
      assertPresent(current, "Chapter card");
      const targetVolumeId = input.volumeId ?? current.volumeId;
      const targetArcId =
        input.primaryArcId === undefined
          ? current.primaryArcId
          : input.primaryArcId;
      assertPresent(volume(targetVolumeId), "Target volume");
      if (targetArcId !== null) {
        const targetArc = arc(targetArcId);
        assertPresent(targetArc, "Target primary arc");
        if (targetArc.volumeId !== targetVolumeId) {
          throw new Error("Target primary arc must belong to the target volume.");
        }
      }
      const patch: Partial<OperationOf<"chapter.update">["patch"]> = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {})
      };
      const moved =
        targetVolumeId !== current.volumeId ||
        targetArcId !== current.primaryArcId;
      return batch([
        Object.keys(patch).length > 0
          ? ({
              type: "chapter.update",
              id,
              patch
            } as OperationOf<"chapter.update">)
          : undefined,
        moved
          ? {
              type: "chapter.move",
              id,
              toVolumeId: targetVolumeId,
              toPrimaryArcId: targetArcId
            }
          : undefined
      ]);
    },

    moveChapter,

    reorderChapter(id, direction) {
      const current = chapter(id);
      assertPresent(current, "Chapter card");
      return batch([
        {
          type: "chapter.reorder",
          volumeId: current.volumeId,
          orderedIds: moveLongOrderedId(
            orderedChapters(current.volumeId),
            id,
            direction
          )
        }
      ]);
    },

    deleteChapter(id, cascade) {
      return batch([{ type: "chapter.delete", id, cascade }]);
    },

    createStoryEvent(input) {
      const id = createId("event");
      return batch([
        {
          type: "event.create",
          event: {
            id,
            title: input.title.trim(),
            summary: input.summary ?? "",
            timeMode: input.timeMode,
            timeLabel: input.timeLabel ?? "",
            ...(input.timeValue !== undefined
              ? { timeValue: input.timeValue }
              : {}),
            storyOrder: snapshot.plot.storyEvents.length + 1,
            location: input.location ?? "",
            arcIds: assertArcIds(input.arcIds),
            characterIds: assertCharacterIds(input.characterIds)
          }
        }
      ]);
    },

    updateStoryEvent(id, input) {
      assertPresent(storyEvent(id), "Story event");
      const patch: OperationOf<"event.update">["patch"] = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.timeMode !== undefined ? { timeMode: input.timeMode } : {}),
        ...(input.timeLabel !== undefined
          ? { timeLabel: input.timeLabel }
          : {}),
        ...(input.timeValue !== undefined
          ? { timeValue: input.timeValue }
          : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.arcIds !== undefined
          ? { arcIds: assertArcIds(input.arcIds) }
          : {}),
        ...(input.characterIds !== undefined
          ? { characterIds: assertCharacterIds(input.characterIds) }
          : {})
      };
      return batch([{ type: "event.update", id, patch }]);
    },

    reorderStoryEvent(id, direction) {
      return batch([
        {
          type: "event.reorder",
          orderedIds: moveLongOrderedId(orderedStoryEvents(), id, direction)
        }
      ]);
    },

    deleteStoryEvent(id, cascade) {
      return batch([{ type: "event.delete", id, cascade }]);
    },

    createStoryPlot(input) {
      assertPresent(arc(input.arcId), "Arc");
      const id = createId("storyplot");
      const updatedAt = now();
      return batch(
        [
          {
            type: "storyPlot.create",
            storyPlot: {
              id,
              arcId: input.arcId,
              title: input.title.trim(),
              order: orderedStoryPlots(input.arcId).length + 1,
              file: createEmptyLongMarkdownFileReference(
                longStoryPlotBodyFileId(id),
                longStoryPlotFilePath(id),
                updatedAt
              )
            }
          }
        ],
        updatedAt
      );
    },

    updateStoryPlot(id, input) {
      assertPresent(storyPlot(id), "Story plot");
      const patch: OperationOf<"storyPlot.update">["patch"] = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {})
      };
      return batch([{ type: "storyPlot.update", id, patch }]);
    },

    reorderStoryPlot(id, direction) {
      const current = storyPlot(id);
      assertPresent(current, "Story plot");
      return batch([
        {
          type: "storyPlot.reorder",
          arcId: current.arcId,
          orderedIds: moveLongOrderedId(
            orderedStoryPlots(current.arcId),
            id,
            direction
          )
        }
      ]);
    },

    deleteStoryPlot(id, cascade = true) {
      assertPresent(storyPlot(id), "Story plot");
      return batch([{ type: "storyPlot.delete", id, cascade }]);
    },

    createEventConnection(input) {
      assertPresent(storyEvent(input.sourceEventId), "Source story event");
      assertPresent(storyEvent(input.targetEventId), "Target story event");
      if (input.sourceEventId === input.targetEventId) {
        throw new Error("An event connection needs two different events.");
      }
      return batch([
        {
          type: "connection.create",
          connection: {
            id: createId("connection"),
            sourceEventId: input.sourceEventId,
            targetEventId: input.targetEventId,
            type: input.type,
            note: input.note ?? ""
          }
        }
      ]);
    },

    updateEventConnection(id, input) {
      const current = eventConnection(id);
      assertPresent(current, "Event connection");
      const sourceEventId = input.sourceEventId ?? current.sourceEventId;
      const targetEventId = input.targetEventId ?? current.targetEventId;
      assertPresent(storyEvent(sourceEventId), "Source story event");
      assertPresent(storyEvent(targetEventId), "Target story event");
      if (sourceEventId === targetEventId) {
        throw new Error("An event connection needs two different events.");
      }
      const patch: OperationOf<"connection.update">["patch"] = {
        ...(input.sourceEventId !== undefined ? { sourceEventId } : {}),
        ...(input.targetEventId !== undefined ? { targetEventId } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.note !== undefined ? { note: input.note } : {})
      };
      return batch([{ type: "connection.update", id, patch }]);
    },

    deleteEventConnection(id) {
      return batch([{ type: "connection.delete", id, cascade: false }]);
    },

    createNarrativePlacement(input) {
      assertPresent(storyEvent(input.eventId), "Placement story event");
      assertPresent(chapter(input.chapterCardId), "Placement chapter");
      return batch([
        {
          type: "placement.create",
          placement: {
            id: createId("placement"),
            eventId: input.eventId,
            chapterCardId: input.chapterCardId,
            orderInChapter:
              snapshot.plot.narrativePlacements.filter(
                (placement) =>
                  placement.chapterCardId === input.chapterCardId
              ).length + 1,
            mode: input.mode,
            disclosure: input.disclosure,
            writingPrompt: input.writingPrompt ?? "",
            status: "planned",
            commitId: null
          }
        }
      ]);
    },

    updateNarrativePlacement(id, input) {
      const current = narrativePlacement(id);
      assertPresent(current, "Narrative placement");
      const targetChapterCardId =
        input.chapterCardId ?? current.chapterCardId;
      if (input.eventId !== undefined) {
        assertPresent(storyEvent(input.eventId), "Placement story event");
      }
      assertPresent(chapter(targetChapterCardId), "Placement chapter");
      const patch: Partial<OperationOf<"placement.update">["patch"]> = {
        ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.disclosure !== undefined
          ? { disclosure: input.disclosure }
          : {}),
        ...(input.writingPrompt !== undefined
          ? { writingPrompt: input.writingPrompt }
          : {})
      };
      return batch([
        Object.keys(patch).length > 0
          ? ({
              type: "placement.update",
              id,
              patch
            } as OperationOf<"placement.update">)
          : undefined,
        targetChapterCardId !== current.chapterCardId
          ? {
              type: "placement.move",
              id,
              toChapterCardId: targetChapterCardId
            }
          : undefined
      ]);
    },

    moveNarrativePlacement,

    reorderNarrativePlacement(id, direction) {
      const current = narrativePlacement(id);
      assertPresent(current, "Narrative placement");
      return batch([
        {
          type: "placement.reorder",
          chapterCardId: current.chapterCardId,
          orderedIds: moveLongOrderedId(
            orderedNarrativePlacements(current.chapterCardId),
            id,
            direction
          )
        }
      ]);
    },

    deleteNarrativePlacement(id, cascade) {
      return batch([{ type: "placement.delete", id, cascade }]);
    },

    createForeshadowing(input) {
      if (input.truthEventId) {
        assertPresent(
          storyEvent(input.truthEventId),
          "Foreshadowing truth event"
        );
      }
      return batch([
        {
          type: "foreshadowing.create",
          thread: {
            id: createId("foreshadow"),
            title: input.title.trim(),
            coreQuestion: input.coreQuestion ?? "",
            ...(input.hiddenTruth !== undefined
              ? { hiddenTruth: input.hiddenTruth }
              : {}),
            ...(input.plannedSpan !== undefined
              ? { plannedSpan: input.plannedSpan }
              : {}),
            truthEventId: input.truthEventId ?? null,
            expectedReaderEffect: input.expectedReaderEffect ?? "",
            status: input.status ?? "planned",
            beats: []
          }
        }
      ]);
    },

    updateForeshadowing(id, input) {
      assertPresent(foreshadowing(id), "Foreshadowing thread");
      if (input.truthEventId) {
        assertPresent(
          storyEvent(input.truthEventId),
          "Foreshadowing truth event"
        );
      }
      const patch: OperationOf<"foreshadowing.update">["patch"] = {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.coreQuestion !== undefined
          ? { coreQuestion: input.coreQuestion }
          : {}),
        ...(input.hiddenTruth !== undefined
          ? { hiddenTruth: input.hiddenTruth }
          : {}),
        ...(input.plannedSpan !== undefined
          ? { plannedSpan: input.plannedSpan }
          : {}),
        ...(input.truthEventId !== undefined
          ? { truthEventId: input.truthEventId }
          : {}),
        ...(input.expectedReaderEffect !== undefined
          ? { expectedReaderEffect: input.expectedReaderEffect }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      };
      return batch([{ type: "foreshadowing.update", id, patch }]);
    },

    reorderForeshadowing(id, direction) {
      return batch([
        {
          type: "foreshadowing.reorder",
          orderedIds: moveLongOrderedId(
            orderedForeshadowing(),
            id,
            direction
          )
        }
      ]);
    },

    deleteForeshadowing(id, cascade) {
      return batch([{ type: "foreshadowing.delete", id, cascade }]);
    },

    createForeshadowingBeat(input) {
      const thread = foreshadowing(input.threadId);
      assertPresent(thread, "Foreshadowing thread");
      assertBeatReferences(input);
      return batch([
        {
          type: "foreshadowingBeat.create",
          threadId: input.threadId,
          beat: {
            id: createId("beat"),
            type: input.type,
            order: thread.beats.length + 1,
            ...(input.volumeId !== undefined
              ? { volumeId: input.volumeId }
              : {}),
            ...(input.arcId !== undefined ? { arcId: input.arcId } : {}),
            eventId: input.eventId ?? null,
            placementId: input.placementId ?? null,
            chapterCardId: input.chapterCardId ?? null,
            plannedScope: input.plannedScope ?? "",
            note: input.note ?? "",
            status: "planned",
            commitId: null
          }
        }
      ]);
    },

    updateForeshadowingBeat(id, input) {
      const current = foreshadowingBeat(id);
      assertPresent(current, "Foreshadowing beat");
      const resolvedVolumeId =
        input.volumeId !== undefined
          ? input.volumeId
          : current.beat.volumeId;
      const resolvedArcId =
        input.arcId !== undefined ? input.arcId : current.beat.arcId;
      const references = {
        ...(resolvedVolumeId !== undefined
          ? { volumeId: resolvedVolumeId }
          : {}),
        ...(resolvedArcId !== undefined ? { arcId: resolvedArcId } : {}),
        eventId:
          input.eventId !== undefined
            ? input.eventId
            : current.beat.eventId,
        placementId:
          input.placementId !== undefined
            ? input.placementId
            : current.beat.placementId,
        chapterCardId:
          input.chapterCardId !== undefined
            ? input.chapterCardId
            : current.beat.chapterCardId,
        plannedScope:
          input.plannedScope !== undefined
            ? input.plannedScope
            : current.beat.plannedScope
      };
      assertBeatReferences(references);
      const targetThreadId = input.threadId ?? current.thread.id;
      assertPresent(
        foreshadowing(targetThreadId),
        "Target foreshadowing thread"
      );
      const patch: Partial<
        OperationOf<"foreshadowingBeat.update">["patch"]
      > = {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.volumeId !== undefined
          ? { volumeId: input.volumeId }
          : {}),
        ...(input.arcId !== undefined ? { arcId: input.arcId } : {}),
        ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
        ...(input.placementId !== undefined
          ? { placementId: input.placementId }
          : {}),
        ...(input.chapterCardId !== undefined
          ? { chapterCardId: input.chapterCardId }
          : {}),
        ...(input.plannedScope !== undefined
          ? { plannedScope: input.plannedScope }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {})
      };
      return batch([
        Object.keys(patch).length > 0
          ? ({
              type: "foreshadowingBeat.update",
              id,
              patch
            } as OperationOf<"foreshadowingBeat.update">)
          : undefined,
        targetThreadId !== current.thread.id
          ? {
              type: "foreshadowingBeat.move",
              id,
              toThreadId: targetThreadId
            }
          : undefined
      ]);
    },

    moveForeshadowingBeat,

    reorderForeshadowingBeat(id, direction) {
      const current = foreshadowingBeat(id);
      assertPresent(current, "Foreshadowing beat");
      return batch([
        {
          type: "foreshadowingBeat.reorder",
          threadId: current.thread.id,
          orderedIds: moveLongOrderedId(
            orderedForeshadowingBeats(current.thread.id),
            id,
            direction
          )
        }
      ]);
    },

    deleteForeshadowingBeat(id) {
      return batch([
        { type: "foreshadowingBeat.delete", id, cascade: false }
      ]);
    }
  };
}
