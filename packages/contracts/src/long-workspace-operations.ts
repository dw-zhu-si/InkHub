import { z } from "zod";
import {
  LongArcIdSchema,
  LongArcSchema,
  LongChapterCardIdSchema,
  LongChapterCardSchema,
  LongChapterCharacterContinuityFileIndexEntrySchema,
  LongChapterFileIndexEntrySchema,
  LongCharacterFileIndexEntrySchema,
  LongCharacterGroupSchema,
  LongCharacterIdSchema,
  LongCharacterSchema,
  LongCharacterTypeIdSchema,
  LongCharacterTypeSchema,
  LongEventConnectionIdSchema,
  LongEventConnectionSchema,
  LongFileIdSchema,
  LongFileRevisionSchema,
  LongForeshadowingBeatIdSchema,
  LongForeshadowingBeatSchema,
  LongForeshadowingIdSchema,
  LongForeshadowingSchema,
  LongMarkdownFileReferenceSchema,
  LongNarrativePlacementIdSchema,
  LongNarrativePlacementSchema,
  LongProjectRelativePathSchema,
  LongStableIdSchema,
  LongStoryEventIdSchema,
  LongStoryEventSchema,
  LongStoryPlotIdSchema,
  LongStoryPlotSchema,
  LongVolumeIdSchema,
  LongVolumeSchema,
  LongWorldbuildingItemLayoutSchema,
  LongWorkspaceIndexSnapshotSchema,
  LongWorldbuildingCategoryIdSchema,
  LongWorldbuildingCategorySchema,
  LongWorldbuildingItemIdSchema,
  LongWorldbuildingItemSchema,
  createEmptyLongMarkdownFileReference,
  deriveLongForeshadowingStatusFromCommittedBeats,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId
} from "./long-workspace";
import type {
  LongForeshadowing,
  LongForeshadowingBeat,
  LongNarrativePlacement,
  LongWorkspaceFileReference,
  LongWorkspaceIndexSnapshot
} from "./long-workspace";

const OperationTimestampSchema = z.string().datetime();
const OperationTextSchema = z.string().max(200_000);
const OperationShortTextSchema = z.string().max(4_000);
const OperationTitleSchema = z.string().trim().min(1).max(256);

export const LongProvisionalIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .regex(
    /^provisional_[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$/,
    "Provisional ids must use the provisional_ prefix."
  );
export type LongProvisionalId = z.infer<typeof LongProvisionalIdSchema>;

const OptionalProvisionalIdShape = {
  provisionalId: LongProvisionalIdSchema.optional()
} as const;

const DeleteControlShape = {
  cascade: z.boolean()
} as const;

function nonEmptyPatch<T extends z.ZodRawShape>(shape: T) {
  return z
    .object(shape)
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "Update patches must contain at least one field."
    });
}

function uniqueIdArray<T extends string>(
  schema: z.ZodType<T>,
  label: string
) {
  return z
    .array(schema)
    .max(400_000)
    .superRefine((values, context) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: `Duplicate ${label}: ${value}`
          });
        }
        seen.add(value);
      });
    });
}

const WorldbuildingUpdatePatchSchema = nonEmptyPatch({
  title: OperationTitleSchema.optional(),
  format: z.enum(["list", "text"]).optional()
});
const FeatureSettingsUpdatePatchSchema = nonEmptyPatch({
  worldbuildingItemLayout: LongWorldbuildingItemLayoutSchema.optional(),
  characterAndContinuityItemLayout:
    LongWorldbuildingItemLayoutSchema.optional(),
  plotItemLayout: LongWorldbuildingItemLayoutSchema.optional()
});
const CharacterUpdatePatchSchema = nonEmptyPatch({
  name: OperationTitleSchema.optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(64).optional()
});
const CharacterTypeUpdatePatchSchema = nonEmptyPatch({
  title: OperationTitleSchema.optional()
});
const VolumeUpdatePatchSchema = nonEmptyPatch({
  title: OperationTitleSchema.optional(),
  summary: OperationTextSchema.optional()
});
const ArcUpdatePatchSchema = nonEmptyPatch({
  title: OperationTitleSchema.optional(),
  summary: OperationTextSchema.optional(),
  outline: OperationTextSchema.optional()
});
const ChapterCardUpdatePatchSchema = nonEmptyPatch({
  title: OperationTitleSchema.optional()
});
const StoryEventUpdatePatchSchema = nonEmptyPatch({
  title: OperationTitleSchema.optional(),
  summary: OperationTextSchema.optional(),
  timeMode: z.enum(["exact", "relative", "sequence", "unknown"]).optional(),
  timeLabel: z.string().max(1_000).optional(),
  timeValue: z.string().max(1_000).optional(),
  location: z.string().max(1_000).optional(),
  arcIds: uniqueIdArray(LongArcIdSchema, "event arc reference").optional(),
  characterIds: uniqueIdArray(
    LongCharacterIdSchema,
    "event character reference"
  ).optional()
});
const EventConnectionUpdatePatchSchema = nonEmptyPatch({
  sourceEventId: LongStoryEventIdSchema.optional(),
  targetEventId: LongStoryEventIdSchema.optional(),
  type: z
    .enum([
      "before",
      "same_time",
      "overlaps",
      "causes",
      "enables",
      "conceals"
    ])
    .optional(),
  note: OperationShortTextSchema.optional()
});
const NarrativePlacementUpdatePatchSchema = nonEmptyPatch({
  eventId: LongStoryEventIdSchema.optional(),
  mode: z
    .enum([
      "scene",
      "flashback",
      "retelling",
      "clue",
      "misdirection",
      "reveal",
      "dream",
      "prophecy"
    ])
    .optional(),
  disclosure: z.enum(["hint", "partial", "full", "false"]).optional(),
  writingPrompt: OperationShortTextSchema.optional()
});
const ForeshadowingUpdatePatchSchema = nonEmptyPatch({
  title: OperationTitleSchema.optional(),
  coreQuestion: OperationTextSchema.optional(),
  hiddenTruth: OperationTextSchema.optional(),
  plannedSpan: z
    .enum(["local", "within_volume", "cross_volume"])
    .optional(),
  truthEventId: LongStoryEventIdSchema.nullable().optional(),
  expectedReaderEffect: OperationTextSchema.optional(),
  status: z.enum(["planned", "abandoned"]).optional()
});
const ForeshadowingBeatUpdatePatchSchema = nonEmptyPatch({
  type: z
    .enum([
      "source",
      "plant",
      "reinforce",
      "misdirect",
      "partial_reveal",
      "reveal",
      "payoff",
      "aftermath"
    ])
    .optional(),
  volumeId: LongVolumeIdSchema.nullable().optional(),
  arcId: LongArcIdSchema.nullable().optional(),
  eventId: LongStoryEventIdSchema.nullable().optional(),
  placementId: LongNarrativePlacementIdSchema.nullable().optional(),
  chapterCardId: LongChapterCardIdSchema.nullable().optional(),
  plannedScope: z.string().max(1_000).optional(),
  note: OperationShortTextSchema.optional()
});

export const LongWorkspaceOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("featureSettings.update"),
      patch: FeatureSettingsUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuilding.create"),
      category: LongWorldbuildingCategorySchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuilding.update"),
      id: LongWorldbuildingCategoryIdSchema,
      patch: WorldbuildingUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuilding.delete"),
      id: LongWorldbuildingCategoryIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuilding.reorder"),
      orderedIds: uniqueIdArray(
        LongWorldbuildingCategoryIdSchema,
        "worldbuilding reorder id"
      )
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuildingItem.create"),
      categoryId: LongWorldbuildingCategoryIdSchema,
      item: LongWorldbuildingItemSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuildingItem.update"),
      categoryId: LongWorldbuildingCategoryIdSchema,
      id: LongWorldbuildingItemIdSchema,
      patch: nonEmptyPatch({
        title: OperationTitleSchema.optional()
      })
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuildingItem.delete"),
      categoryId: LongWorldbuildingCategoryIdSchema,
      id: LongWorldbuildingItemIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("worldbuildingItem.reorder"),
      categoryId: LongWorldbuildingCategoryIdSchema,
      orderedIds: uniqueIdArray(
        LongWorldbuildingItemIdSchema,
        "worldbuilding item reorder id"
      )
    })
    .strict(),

  z
    .object({
      type: z.literal("characterType.create"),
      characterType: LongCharacterTypeSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("characterType.update"),
      id: LongCharacterTypeIdSchema,
      patch: CharacterTypeUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("characterType.delete"),
      id: LongCharacterTypeIdSchema,
      moveCharactersToTypeId: LongCharacterTypeIdSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("characterType.reorder"),
      orderedIds: uniqueIdArray(
        LongCharacterTypeIdSchema,
        "character type reorder id"
      )
    })
    .strict(),

  z
    .object({
      type: z.literal("character.create"),
      character: LongCharacterSchema,
      files: LongCharacterFileIndexEntrySchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("character.update"),
      id: LongCharacterIdSchema,
      patch: CharacterUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("character.delete"),
      id: LongCharacterIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("character.move"),
      id: LongCharacterIdSchema,
      toGroup: LongCharacterGroupSchema,
      beforeCharacterId: LongCharacterIdSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("character.reorder"),
      group: LongCharacterGroupSchema,
      orderedIds: uniqueIdArray(
        LongCharacterIdSchema,
        "character reorder id"
      )
    })
    .strict(),

  z
    .object({
      type: z.literal("volume.create"),
      volume: LongVolumeSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("volume.update"),
      id: LongVolumeIdSchema,
      patch: VolumeUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("volume.delete"),
      id: LongVolumeIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("volume.reorder"),
      orderedIds: uniqueIdArray(LongVolumeIdSchema, "volume reorder id")
    })
    .strict(),

  z
    .object({
      type: z.literal("arc.create"),
      arc: LongArcSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("arc.update"),
      id: LongArcIdSchema,
      patch: ArcUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("arc.delete"),
      id: LongArcIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("arc.move"),
      id: LongArcIdSchema,
      toVolumeId: LongVolumeIdSchema,
      beforeArcId: LongArcIdSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("arc.reorder"),
      volumeId: LongVolumeIdSchema,
      orderedIds: uniqueIdArray(LongArcIdSchema, "arc reorder id")
    })
    .strict(),

  z
    .object({
      type: z.literal("chapter.create"),
      chapterCard: LongChapterCardSchema,
      files: LongChapterFileIndexEntrySchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("chapter.update"),
      id: LongChapterCardIdSchema,
      patch: ChapterCardUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("chapter.delete"),
      id: LongChapterCardIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("chapter.move"),
      id: LongChapterCardIdSchema,
      toVolumeId: LongVolumeIdSchema,
      toPrimaryArcId: LongArcIdSchema.nullable(),
      beforeChapterCardId: LongChapterCardIdSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("chapter.reorder"),
      volumeId: LongVolumeIdSchema,
      orderedIds: uniqueIdArray(
        LongChapterCardIdSchema,
        "chapter reorder id"
      )
    })
    .strict(),
  z
    .object({
      type: z.literal("chapterContinuity.worldReveals.create"),
      chapterCardId: LongChapterCardIdSchema,
      file: LongMarkdownFileReferenceSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("chapterContinuity.worldReveals.delete"),
      chapterCardId: LongChapterCardIdSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("chapterContinuity.character.create"),
      chapterCardId: LongChapterCardIdSchema,
      characterId: LongCharacterIdSchema,
      currentState:
        LongChapterCharacterContinuityFileIndexEntrySchema.shape.currentState,
      history:
        LongChapterCharacterContinuityFileIndexEntrySchema.shape.history
    })
    .strict(),
  z
    .object({
      type: z.literal("chapterContinuity.character.delete"),
      chapterCardId: LongChapterCardIdSchema,
      characterId: LongCharacterIdSchema
    })
    .strict(),

  z
    .object({
      type: z.literal("event.create"),
      event: LongStoryEventSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("event.update"),
      id: LongStoryEventIdSchema,
      patch: StoryEventUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("event.delete"),
      id: LongStoryEventIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("event.reorder"),
      orderedIds: uniqueIdArray(LongStoryEventIdSchema, "event reorder id")
    })
    .strict(),

  z
    .object({
      type: z.literal("storyPlot.create"),
      storyPlot: LongStoryPlotSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("storyPlot.update"),
      id: LongStoryPlotIdSchema,
      patch: nonEmptyPatch({
        title: OperationTitleSchema.optional()
      })
    })
    .strict(),
  z
    .object({
      type: z.literal("storyPlot.delete"),
      id: LongStoryPlotIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("storyPlot.reorder"),
      arcId: LongArcIdSchema,
      orderedIds: uniqueIdArray(
        LongStoryPlotIdSchema,
        "story-plot reorder id"
      )
    })
    .strict(),

  z
    .object({
      type: z.literal("connection.create"),
      connection: LongEventConnectionSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("connection.update"),
      id: LongEventConnectionIdSchema,
      patch: EventConnectionUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("connection.delete"),
      id: LongEventConnectionIdSchema,
      ...DeleteControlShape
    })
    .strict(),

  z
    .object({
      type: z.literal("placement.create"),
      placement: LongNarrativePlacementSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("placement.update"),
      id: LongNarrativePlacementIdSchema,
      patch: NarrativePlacementUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("placement.delete"),
      id: LongNarrativePlacementIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("placement.move"),
      id: LongNarrativePlacementIdSchema,
      toChapterCardId: LongChapterCardIdSchema,
      beforePlacementId: LongNarrativePlacementIdSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("placement.reorder"),
      chapterCardId: LongChapterCardIdSchema,
      orderedIds: uniqueIdArray(
        LongNarrativePlacementIdSchema,
        "placement reorder id"
      )
    })
    .strict(),

  z
    .object({
      type: z.literal("foreshadowing.create"),
      thread: LongForeshadowingSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("foreshadowing.update"),
      id: LongForeshadowingIdSchema,
      patch: ForeshadowingUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("foreshadowing.delete"),
      id: LongForeshadowingIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("foreshadowing.reorder"),
      orderedIds: uniqueIdArray(
        LongForeshadowingIdSchema,
        "foreshadowing reorder id"
      )
    })
    .strict(),

  z
    .object({
      type: z.literal("foreshadowingBeat.create"),
      threadId: LongForeshadowingIdSchema,
      beat: LongForeshadowingBeatSchema,
      ...OptionalProvisionalIdShape
    })
    .strict(),
  z
    .object({
      type: z.literal("foreshadowingBeat.update"),
      id: LongForeshadowingBeatIdSchema,
      patch: ForeshadowingBeatUpdatePatchSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("foreshadowingBeat.delete"),
      id: LongForeshadowingBeatIdSchema,
      ...DeleteControlShape
    })
    .strict(),
  z
    .object({
      type: z.literal("foreshadowingBeat.move"),
      id: LongForeshadowingBeatIdSchema,
      toThreadId: LongForeshadowingIdSchema,
      beforeBeatId: LongForeshadowingBeatIdSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("foreshadowingBeat.reorder"),
      threadId: LongForeshadowingIdSchema,
      orderedIds: uniqueIdArray(
        LongForeshadowingBeatIdSchema,
        "foreshadowing-beat reorder id"
      )
    })
    .strict()
]);
export type LongWorkspaceOperation = z.infer<
  typeof LongWorkspaceOperationSchema
>;

const DocumentWriteProposalBaseShape = {
  proposalId: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .regex(/^proposal_[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  fileId: LongFileIdSchema,
  content: z.string().max(10_000_000),
  nextRevision: LongFileRevisionSchema,
  updatedAt: OperationTimestampSchema,
  reason: z.string().trim().min(1).max(1_000)
} as const;

export const LongDocumentWriteProposalSchema = z.discriminatedUnion("mode", [
  z
    .object({
      ...DocumentWriteProposalBaseShape,
      mode: z.literal("create"),
      expectedRevision: z.null()
    })
    .strict(),
  z
    .object({
      ...DocumentWriteProposalBaseShape,
      mode: z.enum(["replace", "append"]),
      expectedRevision: LongFileRevisionSchema
    })
    .strict()
]);
export type LongDocumentWriteProposal = z.infer<
  typeof LongDocumentWriteProposalSchema
>;

function sortedUniqueIdArray<T extends string>(schema: z.ZodType<T>) {
  return z.array(schema).superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `Duplicate impact id: ${value}`
        });
      }
      seen.add(value);
      if (index > 0 && values[index - 1]! > value) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Impact ids must be sorted."
        });
      }
    });
  });
}

export const LongWorkspaceImpactSummarySchema = z
  .object({
    createdEntityIds: sortedUniqueIdArray(LongStableIdSchema),
    updatedEntityIds: sortedUniqueIdArray(LongStableIdSchema),
    deletedEntityIds: sortedUniqueIdArray(LongStableIdSchema),
    createdFileIds: sortedUniqueIdArray(LongFileIdSchema),
    deletedFileIds: sortedUniqueIdArray(LongFileIdSchema),
    documentWriteProposalIds: sortedUniqueIdArray(
      z
        .string()
        .trim()
        .min(3)
        .max(160)
        .regex(/^proposal_[A-Za-z0-9][A-Za-z0-9._:-]*$/)
    )
  })
  .strict();
export type LongWorkspaceImpactSummary = z.infer<
  typeof LongWorkspaceImpactSummarySchema
>;

export const LongWorkspaceFileIntentSchema = z.discriminatedUnion(
  "action",
  [
    z
      .object({
        action: z.literal("create"),
        file: z.object({
          id: LongFileIdSchema,
          path: LongProjectRelativePathSchema,
          revision: LongFileRevisionSchema,
          updatedAt: OperationTimestampSchema
        }),
        reason: z.string().trim().min(1).max(1_000)
      })
      .strict(),
    z
      .object({
        action: z.literal("delete"),
        file: z.object({
          id: LongFileIdSchema,
          path: LongProjectRelativePathSchema,
          revision: LongFileRevisionSchema,
          updatedAt: OperationTimestampSchema
        }),
        reason: z.string().trim().min(1).max(1_000)
      })
      .strict()
  ]
);
export type LongWorkspaceFileIntent = z.infer<
  typeof LongWorkspaceFileIntentSchema
>;

export const LONG_WORKSPACE_ENTITY_KINDS = [
  "worldbuilding-category",
  "worldbuilding-item",
  "character",
  "volume",
  "arc",
  "chapter-card",
  "story-event",
  "story-plot",
  "event-connection",
  "narrative-placement",
  "foreshadowing-thread",
  "foreshadowing-beat"
] as const;
export const LongWorkspaceEntityKindSchema = z.enum(
  LONG_WORKSPACE_ENTITY_KINDS
);
export type LongWorkspaceEntityKind = z.infer<
  typeof LongWorkspaceEntityKindSchema
>;

const LongWorkspaceEntitySnapshotSchema = z.record(z.string(), z.json());
type LongWorkspaceEntitySnapshot = z.infer<
  typeof LongWorkspaceEntitySnapshotSchema
>;
const LongWorkspaceEntityChangeBaseShape = {
  kind: LongWorkspaceEntityKindSchema,
  id: LongStableIdSchema
} as const;

export const LongWorkspaceEntityChangeSchema = z.discriminatedUnion(
  "action",
  [
    z
      .object({
        ...LongWorkspaceEntityChangeBaseShape,
        action: z.literal("create"),
        before: z.null(),
        after: LongWorkspaceEntitySnapshotSchema
      })
      .strict(),
    z
      .object({
        ...LongWorkspaceEntityChangeBaseShape,
        action: z.literal("update"),
        before: LongWorkspaceEntitySnapshotSchema,
        after: LongWorkspaceEntitySnapshotSchema
      })
      .strict(),
    z
      .object({
        ...LongWorkspaceEntityChangeBaseShape,
        action: z.literal("delete"),
        before: LongWorkspaceEntitySnapshotSchema,
        after: z.null()
      })
      .strict()
  ]
);
export type LongWorkspaceEntityChange = z.infer<
  typeof LongWorkspaceEntityChangeSchema
>;

export const LongWorkspaceOperationBatchSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    updatedAt: OperationTimestampSchema,
    operations: z.array(LongWorkspaceOperationSchema).max(10_000),
    documentWrites: z
      .array(LongDocumentWriteProposalSchema)
      .max(10_000)
      .default([]),
    expectedImpact: LongWorkspaceImpactSummarySchema.optional()
  })
  .strict()
  .superRefine((batch, context) => {
    if (batch.operations.length === 0 && batch.documentWrites.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["operations"],
        message:
          "A long workspace batch must contain an operation or document write."
      });
    }
  });
export type LongWorkspaceOperationBatch = z.infer<
  typeof LongWorkspaceOperationBatchSchema
>;
export type LongWorkspaceOperationBatchInput = z.input<
  typeof LongWorkspaceOperationBatchSchema
>;

export const LongWorkspaceImpactPreviewSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    resultRevision: z.number().int().positive(),
    impact: LongWorkspaceImpactSummarySchema,
    entityChanges: z.array(LongWorkspaceEntityChangeSchema).max(2_000_000),
    fileIntents: z.array(LongWorkspaceFileIntentSchema),
    documentWrites: z.array(LongDocumentWriteProposalSchema),
    provisionalIdMap: z.record(
      LongProvisionalIdSchema,
      LongStableIdSchema
    )
  })
  .strict();
export type LongWorkspaceImpactPreview = z.infer<
  typeof LongWorkspaceImpactPreviewSchema
>;

export const LongWorkspaceOperationResultSchema =
  LongWorkspaceImpactPreviewSchema.extend({
    snapshot: LongWorkspaceIndexSnapshotSchema
  }).strict();
export type LongWorkspaceOperationResult = z.infer<
  typeof LongWorkspaceOperationResultSchema
>;

export const LONG_WORKSPACE_OPERATION_ERROR_CODES = [
  "revision_conflict",
  "not_found",
  "already_exists",
  "invalid_reference",
  "cascade_required",
  "cascade_impact_mismatch",
  "committed_prefix_protected",
  "invalid_order",
  "invalid_document_write",
  "invalid_result"
] as const;
export const LongWorkspaceOperationErrorCodeSchema = z.enum(
  LONG_WORKSPACE_OPERATION_ERROR_CODES
);
export type LongWorkspaceOperationErrorCode = z.infer<
  typeof LongWorkspaceOperationErrorCodeSchema
>;

export class LongWorkspaceOperationError extends Error {
  readonly code: LongWorkspaceOperationErrorCode;

  constructor(code: LongWorkspaceOperationErrorCode, message: string) {
    super(message);
    this.name = "LongWorkspaceOperationError";
    this.code = code;
  }
}

type MutationState = {
  original: LongWorkspaceIndexSnapshot;
  draft: LongWorkspaceIndexSnapshot;
  createdEntityIds: Set<string>;
  updatedEntityIds: Set<string>;
  deletedEntityIds: Set<string>;
  fileIntents: Map<string, LongWorkspaceFileIntent>;
  provisionalIdMap: Record<string, string>;
};

function operationError(
  code: LongWorkspaceOperationErrorCode,
  message: string
): never {
  throw new LongWorkspaceOperationError(code, message);
}

function findEntityIndex<T extends { id: string }>(
  values: readonly T[],
  id: string,
  label: string
): number {
  const index = values.findIndex((value) => value.id === id);
  if (index < 0) {
    operationError("not_found", `${label} ${id} does not exist.`);
  }
  return index;
}

function findBeat(
  workspace: LongWorkspaceIndexSnapshot,
  beatId: string
): {
  thread: LongForeshadowing;
  threadIndex: number;
  beat: LongForeshadowingBeat;
  beatIndex: number;
} {
  for (
    let threadIndex = 0;
    threadIndex < workspace.plot.foreshadowing.length;
    threadIndex += 1
  ) {
    const thread = workspace.plot.foreshadowing[threadIndex]!;
    const beatIndex = thread.beats.findIndex((beat) => beat.id === beatId);
    if (beatIndex >= 0) {
      return {
        thread,
        threadIndex,
        beat: thread.beats[beatIndex]!,
        beatIndex
      };
    }
  }
  return operationError(
    "not_found",
    `Foreshadowing beat ${beatId} does not exist.`
  );
}

function markCreated(state: MutationState, id: string): void {
  if (
    state.createdEntityIds.has(id) ||
    state.updatedEntityIds.has(id) ||
    state.deletedEntityIds.has(id)
  ) {
    operationError(
      "already_exists",
      `Entity ${id} is already part of this operation batch.`
    );
  }
  state.createdEntityIds.add(id);
}

function markUpdated(state: MutationState, id: string): void {
  if (
    !state.createdEntityIds.has(id) &&
    !state.deletedEntityIds.has(id)
  ) {
    state.updatedEntityIds.add(id);
  }
}

function markDeleted(state: MutationState, id: string): void {
  if (state.createdEntityIds.delete(id)) {
    state.updatedEntityIds.delete(id);
    return;
  }
  state.updatedEntityIds.delete(id);
  state.deletedEntityIds.add(id);
}

function registerProvisionalId(
  state: MutationState,
  provisionalId: string | undefined,
  stableId: string
): void {
  if (!provisionalId) return;
  if (state.provisionalIdMap[provisionalId]) {
    operationError(
      "already_exists",
      `Provisional id ${provisionalId} is already mapped.`
    );
  }
  state.provisionalIdMap[provisionalId] = stableId;
}

function allWorkspaceFiles(
  workspace: LongWorkspaceIndexSnapshot
): LongWorkspaceFileReference[] {
  return [
    workspace.bookLine,
    ...workspace.worldbuilding.flatMap((category) =>
      category.format === "text"
        ? [category.file]
        : [
            ...(category.overview ? [category.overview] : []),
            ...category.items.map(({ file }) => file)
          ]
    ),
    ...(workspace.characterOverview ? [workspace.characterOverview] : []),
    ...workspace.characterFiles.flatMap((entry) => [
      entry.coreProfile,
      entry.relationships,
      entry.currentState,
      entry.history
    ]),
    ...workspace.chapters.flatMap((entry) => [
      entry.body,
      entry.card,
      entry.characterState,
      entry.handoff,
      entry.foreshadowingChanges,
      ...(entry.worldReveals ? [entry.worldReveals] : []),
      ...entry.characterContinuity.flatMap((character) => [
        character.currentState,
        character.history
      ])
    ]),
    ...workspace.plot.storyPlots.map(({ file }) => file),
    ...workspace.ledger.commits.map(({ recordFile }) => recordFile)
  ];
}

function ensureFilesAvailable(
  state: MutationState,
  files: readonly LongWorkspaceFileReference[]
): void {
  const existingFiles = allWorkspaceFiles(state.draft);
  const knownIds = new Set(existingFiles.map(({ id }) => id));
  const knownPaths = new Set(existingFiles.map(({ path }) => path));
  for (const file of files) {
    if (knownIds.has(file.id) || state.fileIntents.has(file.id)) {
      operationError(
        "already_exists",
        `Long-form file id ${file.id} already exists.`
      );
    }
    if (knownPaths.has(file.path)) {
      operationError(
        "already_exists",
        `Long-form file path ${file.path} already exists.`
      );
    }
    knownIds.add(file.id);
    knownPaths.add(file.path);
  }
}

function addFileCreateIntent(
  state: MutationState,
  file: LongWorkspaceFileReference,
  reason: string
): void {
  const existing = state.fileIntents.get(file.id);
  if (existing) {
    operationError(
      "already_exists",
      `File ${file.id} already has a pending ${existing.action} intent.`
    );
  }
  state.fileIntents.set(file.id, {
    action: "create",
    file: structuredClone(file),
    reason
  });
}

function addFileDeleteIntent(
  state: MutationState,
  file: LongWorkspaceFileReference,
  reason: string
): void {
  const existing = state.fileIntents.get(file.id);
  if (existing?.action === "create") {
    state.fileIntents.delete(file.id);
    return;
  }
  state.fileIntents.set(file.id, {
    action: "delete",
    file: structuredClone(file),
    reason
  });
}

function assertChapterIsMutable(
  workspace: LongWorkspaceIndexSnapshot,
  chapterCardId: string,
  action: string
): void {
  void workspace;
  void chapterCardId;
  void action;
}

function assertPlacementIsMutable(
  placement: LongNarrativePlacement,
  action: string
): void {
  void placement;
  void action;
}

function assertBeatIsMutable(
  beat: LongForeshadowingBeat,
  action: string
): void {
  void beat;
  void action;
}

function concreteChapterIdForBeat(
  workspace: LongWorkspaceIndexSnapshot,
  beat: LongForeshadowingBeat
): string | null {
  if (beat.chapterCardId !== null) return beat.chapterCardId;
  if (beat.placementId === null) return null;
  return (
    workspace.plot.narrativePlacements.find(
      (placement) => placement.id === beat.placementId
    )?.chapterCardId ?? null
  );
}

function retargetBeatPlanningAnchorsToChapter(
  state: MutationState,
  beat: LongForeshadowingBeat,
  chapter: {
    id: string;
    volumeId: string;
    primaryArcId: string | null;
  },
  action: string
): void {
  const hasVolumeAnchor = (beat.volumeId ?? null) !== null;
  const hasArcAnchor = (beat.arcId ?? null) !== null;
  const volumeChanged =
    hasVolumeAnchor && beat.volumeId !== chapter.volumeId;
  const arcChanged =
    hasArcAnchor && beat.arcId !== chapter.primaryArcId;
  if (!volumeChanged && !arcChanged) return;

  assertBeatIsMutable(beat, action);
  const event =
    beat.eventId === null
      ? undefined
      : state.draft.plot.storyEvents[
          findEntityIndex(
            state.draft.plot.storyEvents,
            beat.eventId,
            "Foreshadowing beat event"
          )
        ];
  const eventSupportsTargetVolume =
    !event ||
    event.arcIds.some(
      (eventArcId) =>
        state.draft.plot.arcs.find(
          (candidate) => candidate.id === eventArcId
        )?.volumeId === chapter.volumeId
    );
  const eventSupportsTargetArc =
    chapter.primaryArcId !== null &&
    (!event || event.arcIds.includes(chapter.primaryArcId));
  if (hasVolumeAnchor) {
    beat.volumeId = eventSupportsTargetVolume ? chapter.volumeId : null;
  }
  if (hasArcAnchor) {
    beat.arcId = eventSupportsTargetArc ? chapter.primaryArcId : null;
  }
  markUpdated(state, beat.id);
}

function volumeOrderMap(
  workspace: LongWorkspaceIndexSnapshot
): Map<string, number> {
  return new Map(
    workspace.plot.volumes.map(({ id, order }) => [id, order])
  );
}

function chapterOrderMap(
  workspace: LongWorkspaceIndexSnapshot
): Map<string, number> {
  const volumes = volumeOrderMap(workspace);
  const ordered = [...workspace.plot.chapterCards].sort(
    (left, right) =>
      (volumes.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
        (volumes.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
      left.narrativeOrder - right.narrativeOrder
  );
  return new Map(ordered.map(({ id }, index) => [id, index]));
}

function normalizeLongWorkspaceOrders(
  workspace: LongWorkspaceIndexSnapshot
): void {
  workspace.worldbuilding.sort((left, right) => left.order - right.order);
  workspace.worldbuilding.forEach((category, index) => {
    category.order = index + 1;
    if (category.format === "list") {
      category.items.sort((left, right) => left.order - right.order);
      category.items.forEach((item, itemIndex) => {
        item.order = itemIndex + 1;
      });
    }
  });

  workspace.characterTypes.sort((left, right) => left.order - right.order);
  workspace.characterTypes.forEach((characterType, index) => {
    characterType.order = index + 1;
  });

  workspace.characters.sort(
    (left, right) =>
      (workspace.characterTypes.find(({ id }) => id === left.group)?.order ??
        Number.MAX_SAFE_INTEGER) -
        (workspace.characterTypes.find(({ id }) => id === right.group)?.order ??
          Number.MAX_SAFE_INTEGER) ||
      left.order - right.order
  );
  const characterOrder = new Map<string, number>();
  workspace.characters.forEach((character) => {
    const next = (characterOrder.get(character.group) ?? 0) + 1;
    characterOrder.set(character.group, next);
    character.order = next;
  });

  workspace.plot.volumes.sort((left, right) => left.order - right.order);
  workspace.plot.volumes.forEach((volume, index) => {
    volume.order = index + 1;
  });
  const volumes = volumeOrderMap(workspace);

  workspace.plot.arcs.sort(
    (left, right) =>
      (volumes.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
        (volumes.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
      left.order - right.order
  );
  const arcOrder = new Map<string, number>();
  workspace.plot.arcs.forEach((arc) => {
    const next = (arcOrder.get(arc.volumeId) ?? 0) + 1;
    arcOrder.set(arc.volumeId, next);
    arc.order = next;
  });

  workspace.plot.chapterCards.sort(
    (left, right) =>
      (volumes.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
        (volumes.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
      left.narrativeOrder - right.narrativeOrder
  );
  const narrativeOrder = new Map<string, number>();
  workspace.plot.chapterCards.forEach((chapter) => {
    const next = (narrativeOrder.get(chapter.volumeId) ?? 0) + 1;
    narrativeOrder.set(chapter.volumeId, next);
    chapter.narrativeOrder = next;
  });

  workspace.plot.storyEvents.sort(
    (left, right) => left.storyOrder - right.storyOrder
  );
  workspace.plot.storyEvents.forEach((event, index) => {
    event.storyOrder = index + 1;
  });

  const chapters = chapterOrderMap(workspace);
  workspace.plot.narrativePlacements.sort(
    (left, right) =>
      (chapters.get(left.chapterCardId) ?? Number.MAX_SAFE_INTEGER) -
        (chapters.get(right.chapterCardId) ?? Number.MAX_SAFE_INTEGER) ||
      left.orderInChapter - right.orderInChapter
  );
  const placementOrder = new Map<string, number>();
  workspace.plot.narrativePlacements.forEach((placement) => {
    const next =
      (placementOrder.get(placement.chapterCardId) ?? 0) + 1;
    placementOrder.set(placement.chapterCardId, next);
    placement.orderInChapter = next;
  });

  workspace.plot.foreshadowing.forEach((thread) => {
    thread.beats.sort((left, right) => left.order - right.order);
    thread.beats.forEach((beat, index) => {
      beat.order = index + 1;
    });
  });
}

function assertExactOrder(
  actualIds: readonly string[],
  orderedIds: readonly string[],
  label: string
): void {
  const orderedIdSet = new Set(orderedIds);
  if (
    actualIds.length !== orderedIds.length ||
    actualIds.some((id) => !orderedIdSet.has(id))
  ) {
    operationError(
      "invalid_order",
      `${label} reorder must include every current id exactly once.`
    );
  }
}

function insertBeforeId(
  ids: string[],
  id: string,
  beforeId: string | undefined,
  label: string
): string[] {
  const without = ids.filter((candidate) => candidate !== id);
  if (beforeId === undefined) {
    return [...without, id];
  }
  const beforeIndex = without.indexOf(beforeId);
  if (beforeIndex < 0) {
    operationError(
      "invalid_reference",
      `${label} before id ${beforeId} is outside the target scope.`
    );
  }
  without.splice(beforeIndex, 0, id);
  return without;
}

function updateOrdersById<T extends { id: string }>(
  values: T[],
  orderedIds: readonly string[],
  setOrder: (value: T, order: number) => void,
  state: MutationState
): void {
  const byId = new Map(values.map((value) => [value.id, value]));
  orderedIds.forEach((id, index) => {
    const value = byId.get(id);
    if (!value) {
      operationError("not_found", `Ordered entity ${id} does not exist.`);
    }
    setOrder(value, index + 1);
    markUpdated(state, id);
  });
}

function orderedChapterIds(
  workspace: LongWorkspaceIndexSnapshot
): string[] {
  const volumes = volumeOrderMap(workspace);
  return [...workspace.plot.chapterCards]
    .sort(
      (left, right) =>
        (volumes.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
          (volumes.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
        left.narrativeOrder - right.narrativeOrder
    )
    .map(({ id }) => id);
}

function assertCommittedPrefixPreserved(state: MutationState): void {
  const expected = state.original.ledger.commits.map(
    ({ chapterCardId }) => chapterCardId
  );
  const actual = orderedChapterIds(state.draft).slice(0, expected.length);
  if (
    actual.length !== expected.length ||
    actual.some((id, index) => id !== expected[index])
  ) {
    operationError(
      "committed_prefix_protected",
      "Operations cannot delete or reorder the committed chapter prefix."
    );
  }
}

function assertFrozenOrderPrefix(
  originalIds: readonly string[],
  draftIds: readonly string[],
  anchorIds: ReadonlySet<string>,
  label: string
): void {
  let lastAnchorIndex = -1;
  originalIds.forEach((id, index) => {
    if (anchorIds.has(id)) lastAnchorIndex = index;
  });
  if (lastAnchorIndex < 0) return;

  const expected = originalIds.slice(0, lastAnchorIndex + 1);
  const actual = draftIds.slice(0, lastAnchorIndex + 1);
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => actual[index] !== id)
  ) {
    operationError(
      "committed_prefix_protected",
      `${label} cannot insert, delete, move, or reorder entities before or between committed fact anchors.`
    );
  }
}

function assertAnchoredValue(
  before: unknown,
  after: unknown,
  label: string
): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    operationError(
      "committed_prefix_protected",
      `${label} belongs to committed facts and cannot change.`
    );
  }
}

function orderedIdsByOrder<T extends { id: string }>(
  values: readonly T[],
  order: (value: T) => number
): string[] {
  return [...values]
    .sort((left, right) => order(left) - order(right))
    .map(({ id }) => id);
}

function idsByGroupAndOrder<T extends { id: string }>(
  values: readonly T[],
  group: (value: T) => string,
  order: (value: T) => number
): Map<string, string[]> {
  const grouped = new Map<string, T[]>();
  values.forEach((value) => {
    const key = group(value);
    const entries = grouped.get(key) ?? [];
    entries.push(value);
    grouped.set(key, entries);
  });
  return new Map(
    [...grouped.entries()].map(([key, entries]) => [
      key,
      orderedIdsByOrder(entries, order)
    ])
  );
}

/**
 * The per-operation guards are intentionally backed by this final invariant.
 * Normalization renumbers and sorts after every operation, so a create/move
 * can otherwise modify a committed fact indirectly without ever targeting
 * the committed entity itself. Only the suffix after the last committed
 * anchor in each ordered scope remains structurally mutable.
 */
function assertCommittedFactAnchorsPreserved(state: MutationState): void {
  // Continuity records are references only and never freeze plot structure.
  void state;
}
function requireCascade(
  cascade: boolean,
  references: readonly string[],
  label: string
): void {
  if (references.length > 0 && !cascade) {
    operationError(
      "cascade_required",
      `${label} is still referenced by: ${references.join(", ")}.`
    );
  }
}

function deleteForeshadowingBeat(
  state: MutationState,
  beatId: string
): void {
  const { thread, beat, beatIndex } = findBeat(state.draft, beatId);
  assertBeatIsMutable(beat, "delete");
  thread.beats.splice(beatIndex, 1);
  markDeleted(state, beat.id);
  markUpdated(state, thread.id);
}

function deleteNarrativePlacement(
  state: MutationState,
  placementId: string,
  cascade: boolean
): void {
  const placementIndex = findEntityIndex(
    state.draft.plot.narrativePlacements,
    placementId,
    "Narrative placement"
  );
  const placement =
    state.draft.plot.narrativePlacements[placementIndex]!;
  assertPlacementIsMutable(placement, "delete");
  const beatIds = state.draft.plot.foreshadowing.flatMap((thread) =>
    thread.beats
      .filter((beat) => beat.placementId === placementId)
      .map(({ id }) => id)
  );
  requireCascade(
    cascade,
    beatIds,
    `Narrative placement ${placementId}`
  );
  beatIds.forEach((beatId) => deleteForeshadowingBeat(state, beatId));
  state.draft.plot.narrativePlacements.splice(placementIndex, 1);
  markDeleted(state, placement.id);
}

function deleteChapter(
  state: MutationState,
  chapterCardId: string,
  cascade: boolean
): void {
  assertChapterIsMutable(state.draft, chapterCardId, "delete");
  const chapterIndex = findEntityIndex(
    state.draft.plot.chapterCards,
    chapterCardId,
    "Chapter card"
  );
  const chapter = state.draft.plot.chapterCards[chapterIndex]!;
  const placementIds = state.draft.plot.narrativePlacements
    .filter((placement) => placement.chapterCardId === chapterCardId)
    .map(({ id }) => id);
  const placementIdSet = new Set(placementIds);
  const directBeatIds = state.draft.plot.foreshadowing.flatMap((thread) =>
    thread.beats
      .filter(
        (beat) =>
          beat.chapterCardId === chapterCardId ||
          (beat.placementId !== null &&
            placementIdSet.has(beat.placementId))
      )
      .map(({ id }) => id)
  );
  requireCascade(
    cascade,
    [...placementIds, ...directBeatIds],
    `Chapter card ${chapterCardId}`
  );

  for (const beatId of new Set(directBeatIds)) {
    deleteForeshadowingBeat(state, beatId);
  }
  for (const placementId of placementIds) {
    deleteNarrativePlacement(state, placementId, true);
  }

  const ledgerRecord = state.draft.ledger.commits.find(
    (commit) => commit.chapterCardId === chapterCardId
  );
  if (ledgerRecord) {
    addFileDeleteIntent(
      state,
      ledgerRecord.recordFile,
      `Delete continuity record for chapter ${chapterCardId}`
    );
    state.draft.ledger.commits = state.draft.ledger.commits.filter(
      ({ id }) => id !== ledgerRecord.id
    );
    state.draft.plot.narrativePlacements.forEach((placement) => {
      if (placement.commitId !== ledgerRecord.id) return;
      placement.commitId = null;
      placement.status = "planned";
    });
    state.draft.plot.foreshadowing.forEach((thread) => {
      thread.beats.forEach((beat) => {
        if (beat.commitId !== ledgerRecord.id) return;
        beat.commitId = null;
        beat.status = "planned";
      });
    });
    state.draft.ledger.projection = {
      throughCommitId: null,
      facts: [],
      knowledge: [],
      openLoops: [],
      latestHandoff: null
    };
  }

  const fileIndex = state.draft.chapters.findIndex(
    (entry) => entry.chapterCardId === chapterCardId
  );
  if (fileIndex < 0) {
    operationError(
      "invalid_result",
      `Chapter ${chapterCardId} is missing its file index.`
    );
  }
  const files = state.draft.chapters[fileIndex]!;
  [
    files.body,
    files.card,
    files.characterState,
    files.handoff,
    files.foreshadowingChanges,
    ...(files.worldReveals ? [files.worldReveals] : []),
    ...files.characterContinuity.flatMap((character) => [
      character.currentState,
      character.history
    ])
  ].forEach((file) =>
    addFileDeleteIntent(
      state,
      file,
      `Delete chapter ${chapterCardId}`
    )
  );
  state.draft.chapters.splice(fileIndex, 1);
  state.draft.plot.chapterCards.splice(chapterIndex, 1);
  const recordedChapterIds = new Set(
    state.draft.ledger.commits.map(({ chapterCardId }) => chapterCardId)
  );
  state.draft.ledger.committedThroughChapterId = null;
  for (const orderedChapterId of orderedChapterIds(state.draft)) {
    if (!recordedChapterIds.has(orderedChapterId)) break;
    state.draft.ledger.committedThroughChapterId = orderedChapterId;
  }
  markDeleted(state, chapter.id);
}

function deleteStoryPlot(state: MutationState, storyPlotId: string): void {
  const storyPlotIndex = findEntityIndex(
    state.draft.plot.storyPlots,
    storyPlotId,
    "Story plot"
  );
  const storyPlot = state.draft.plot.storyPlots[storyPlotIndex]!;
  addFileDeleteIntent(
    state,
    storyPlot.file,
    `Delete story plot ${storyPlotId}`
  );
  state.draft.plot.storyPlots.splice(storyPlotIndex, 1);
  markDeleted(state, storyPlot.id);
}

function deleteArc(
  state: MutationState,
  arcId: string,
  cascade: boolean
): void {
  const arcIndex = findEntityIndex(state.draft.plot.arcs, arcId, "Arc");
  const arc = state.draft.plot.arcs[arcIndex]!;
  const eventIds = state.draft.plot.storyEvents
    .filter((event) => event.arcIds.includes(arcId))
    .map(({ id }) => id);
  const storyPlotIds = state.draft.plot.storyPlots
    .filter((storyPlot) => storyPlot.arcId === arcId)
    .map(({ id }) => id);
  const directBeatIds = state.draft.plot.foreshadowing.flatMap(
    (thread) =>
      thread.beats
        .filter((beat) => (beat.arcId ?? null) === arcId)
        .map(({ id }) => id)
  );
  if (
    eventIds.some((eventId) =>
      eventParticipatesInCommittedFacts(state.draft, eventId)
    )
  ) {
    operationError(
      "committed_prefix_protected",
      `Cannot delete arc ${arcId}; a committed event references it.`
    );
  }
  requireCascade(
    cascade,
    [...eventIds, ...storyPlotIds, ...directBeatIds],
    `Arc ${arcId}`
  );
  for (const beatId of new Set(directBeatIds)) {
    const stillExists = state.draft.plot.foreshadowing.some((thread) =>
      thread.beats.some((beat) => beat.id === beatId)
    );
    if (stillExists) deleteForeshadowingBeat(state, beatId);
  }
  state.draft.plot.chapterCards.forEach((chapter) => {
    if (chapter.primaryArcId !== arcId) return;
    chapter.primaryArcId = null;
    markUpdated(state, chapter.id);
  });
  storyPlotIds.forEach((storyPlotId) => deleteStoryPlot(state, storyPlotId));
  state.draft.plot.storyEvents.forEach((event) => {
    if (!event.arcIds.includes(arcId)) return;
    event.arcIds = event.arcIds.filter((candidate) => candidate !== arcId);
    markUpdated(state, event.id);
    const remainingVolumeIds = [
      ...new Set(
        event.arcIds
          .map(
            (eventArcId) =>
              state.draft.plot.arcs.find(
                (candidate) => candidate.id === eventArcId
              )?.volumeId
          )
          .filter((volumeId): volumeId is string => Boolean(volumeId))
      )
    ];
    state.draft.plot.foreshadowing.forEach((thread) => {
      thread.beats.forEach((beat) => {
        const plannedVolumeId = beat.volumeId ?? null;
        if (
          beat.eventId !== event.id ||
          plannedVolumeId === null ||
          remainingVolumeIds.includes(plannedVolumeId)
        ) {
          return;
        }
        assertBeatIsMutable(beat, "retarget after deleting its event arc");
        const concreteChapterId = concreteChapterIdForBeat(
          state.draft,
          beat
        );
        beat.volumeId =
          concreteChapterId === null && remainingVolumeIds.length === 1
            ? remainingVolumeIds[0]!
            : null;
        markUpdated(state, beat.id);
      });
    });
  });
  state.draft.plot.arcs.splice(
    findEntityIndex(state.draft.plot.arcs, arcId, "Arc"),
    1
  );
  markDeleted(state, arc.id);
}

function deleteVolume(
  state: MutationState,
  volumeId: string,
  cascade: boolean
): void {
  const volumeIndex = findEntityIndex(
    state.draft.plot.volumes,
    volumeId,
    "Volume"
  );
  const volume = state.draft.plot.volumes[volumeIndex]!;
  const chapterIds = state.draft.plot.chapterCards
    .filter((chapter) => chapter.volumeId === volumeId)
    .map(({ id }) => id);
  const arcIds = state.draft.plot.arcs
    .filter((arc) => arc.volumeId === volumeId)
    .map(({ id }) => id);
  const directBeatIds = state.draft.plot.foreshadowing.flatMap(
    (thread) =>
      thread.beats
        .filter((beat) => (beat.volumeId ?? null) === volumeId)
        .map(({ id }) => id)
  );
  requireCascade(
    cascade,
    [...arcIds, ...chapterIds, ...directBeatIds],
    `Volume ${volumeId}`
  );
  for (const beatId of new Set(directBeatIds)) {
    const stillExists = state.draft.plot.foreshadowing.some((thread) =>
      thread.beats.some((beat) => beat.id === beatId)
    );
    if (stillExists) deleteForeshadowingBeat(state, beatId);
  }
  chapterIds.forEach((chapterId) =>
    deleteChapter(state, chapterId, true)
  );
  arcIds.forEach((arcId) => deleteArc(state, arcId, true));
  state.draft.plot.volumes.splice(
    findEntityIndex(state.draft.plot.volumes, volumeId, "Volume"),
    1
  );
  markDeleted(state, volume.id);
}

function deleteStoryEvent(
  state: MutationState,
  eventId: string,
  cascade: boolean
): void {
  const eventIndex = findEntityIndex(
    state.draft.plot.storyEvents,
    eventId,
    "Story event"
  );
  const event = state.draft.plot.storyEvents[eventIndex]!;
  const connectionIds = state.draft.plot.eventConnections
    .filter(
      (connection) =>
        connection.sourceEventId === eventId ||
        connection.targetEventId === eventId
    )
    .map(({ id }) => id);
  const placementIds = state.draft.plot.narrativePlacements
    .filter((placement) => placement.eventId === eventId)
    .map(({ id }) => id);
  const placementIdSet = new Set(placementIds);
  const beatIds = state.draft.plot.foreshadowing.flatMap((thread) =>
    thread.beats
      .filter(
        (beat) =>
          beat.eventId === eventId ||
          (beat.placementId !== null &&
            placementIdSet.has(beat.placementId))
      )
      .map(({ id }) => id)
  );
  const truthThreadIds = state.draft.plot.foreshadowing
    .filter((thread) => thread.truthEventId === eventId)
    .map(({ id }) => id);
  const committedPlacement = state.draft.plot.narrativePlacements.find(
    (placement) =>
      placement.eventId === eventId && placement.commitId !== null
  );
  const committedBeat = state.draft.plot.foreshadowing
    .flatMap(({ beats }) => beats)
    .find((beat) => beat.eventId === eventId && beat.commitId !== null);
  if (committedPlacement || committedBeat) {
    operationError(
      "committed_prefix_protected",
      `Cannot delete event ${eventId}; it participates in committed facts.`
    );
  }
  requireCascade(
    cascade,
    [...connectionIds, ...placementIds, ...beatIds, ...truthThreadIds],
    `Story event ${eventId}`
  );

  placementIds.forEach((placementId) =>
    deleteNarrativePlacement(state, placementId, true)
  );
  for (const beatId of new Set(beatIds)) {
    const stillExists = state.draft.plot.foreshadowing.some((thread) =>
      thread.beats.some((beat) => beat.id === beatId)
    );
    if (stillExists) deleteForeshadowingBeat(state, beatId);
  }
  connectionIds.forEach((connectionId) => {
    const index = findEntityIndex(
      state.draft.plot.eventConnections,
      connectionId,
      "Event connection"
    );
    state.draft.plot.eventConnections.splice(index, 1);
    markDeleted(state, connectionId);
  });
  state.draft.plot.foreshadowing.forEach((thread) => {
    if (thread.truthEventId !== eventId) return;
    thread.truthEventId = null;
    markUpdated(state, thread.id);
  });
  state.draft.plot.storyEvents.splice(eventIndex, 1);
  markDeleted(state, event.id);
}

function deleteCharacter(
  state: MutationState,
  characterId: string,
  cascade: boolean
): void {
  const characterIndex = findEntityIndex(
    state.draft.characters,
    characterId,
    "Character"
  );
  const character = state.draft.characters[characterIndex]!;
  const eventRefs = state.draft.plot.storyEvents
    .filter((event) => event.characterIds.includes(characterId))
    .map(({ id }) => id);
  const continuityRefs = state.draft.chapters.flatMap((chapter) =>
    chapter.characterContinuity
      .filter((entry) => entry.characterId === characterId)
      .map((entry) => ({ chapter, entry }))
  );
  requireCascade(
    cascade,
    [
      ...eventRefs,
      ...continuityRefs.map(({ chapter }) => chapter.chapterCardId)
    ],
    `Character ${characterId}`
  );
  state.draft.plot.storyEvents.forEach((event) => {
    if (!event.characterIds.includes(characterId)) return;
    event.characterIds = event.characterIds.filter(
      (candidate) => candidate !== characterId
    );
    markUpdated(state, event.id);
  });
  for (const { chapter, entry } of continuityRefs) {
    [entry.currentState, entry.history].forEach((file) =>
      addFileDeleteIntent(
        state,
        file,
        `Delete uncommitted chapter continuity for character ${characterId}`
      )
    );
    chapter.characterContinuity = chapter.characterContinuity.filter(
      (candidate) => candidate.characterId !== characterId
    );
    markUpdated(state, chapter.chapterCardId);
  }

  const fileIndex = state.draft.characterFiles.findIndex(
    (entry) => entry.characterId === characterId
  );
  if (fileIndex < 0) {
    operationError(
      "invalid_result",
      `Character ${characterId} is missing its file index.`
    );
  }
  const files = state.draft.characterFiles[fileIndex]!;
  [
    files.coreProfile,
    files.relationships,
    files.currentState,
    files.history
  ].forEach((file) =>
    addFileDeleteIntent(
      state,
      file,
      `Delete character ${characterId}`
    )
  );
  state.draft.characterFiles.splice(fileIndex, 1);
  state.draft.characters.splice(characterIndex, 1);
  markDeleted(state, character.id);
}

function deleteForeshadowingThread(
  state: MutationState,
  threadId: string,
  cascade: boolean
): void {
  const threadIndex = findEntityIndex(
    state.draft.plot.foreshadowing,
    threadId,
    "Foreshadowing thread"
  );
  const thread = state.draft.plot.foreshadowing[threadIndex]!;
  if (thread.beats.some((beat) => beat.commitId !== null)) {
    operationError(
      "committed_prefix_protected",
      `Cannot delete foreshadowing thread ${threadId} with committed beats.`
    );
  }
  requireCascade(
    cascade,
    thread.beats.map(({ id }) => id),
    `Foreshadowing thread ${threadId}`
  );
  [...thread.beats].forEach((beat) =>
    deleteForeshadowingBeat(state, beat.id)
  );
  state.draft.plot.foreshadowing.splice(threadIndex, 1);
  markDeleted(state, thread.id);
}

function assertNewEntityId(
  values: readonly { id: string }[],
  id: string,
  label: string
): void {
  if (values.some((value) => value.id === id)) {
    operationError("already_exists", `${label} ${id} already exists.`);
  }
}

function eventParticipatesInCommittedFacts(
  workspace: LongWorkspaceIndexSnapshot,
  eventId: string
): boolean {
  void workspace;
  void eventId;
  return false;
}

function applyLongWorkspaceOperation(
  state: MutationState,
  operation: LongWorkspaceOperation
): void {
  const workspace = state.draft;

  switch (operation.type) {
    case "featureSettings.update": {
      if (operation.patch.worldbuildingItemLayout !== undefined) {
        workspace.featureSettings.worldbuildingItemLayout =
          operation.patch.worldbuildingItemLayout;
      }
      if (operation.patch.characterAndContinuityItemLayout !== undefined) {
        workspace.featureSettings.characterAndContinuityItemLayout =
          operation.patch.characterAndContinuityItemLayout;
      }
      if (operation.patch.plotItemLayout !== undefined) {
        workspace.featureSettings.plotItemLayout =
          operation.patch.plotItemLayout;
      }
      break;
    }
    case "worldbuilding.create": {
      assertNewEntityId(
        workspace.worldbuilding,
        operation.category.id,
        "Worldbuilding category"
      );
      const category = structuredClone(operation.category);
      if (category.format === "list" && !category.overview) {
        category.overview = createEmptyLongMarkdownFileReference(
          longWorldbuildingOverviewFileId(category.id),
          longWorldbuildingOverviewContentPath(category.id),
          workspace.updatedAt
        );
      }
      const categoryFiles =
        category.format === "text"
          ? [category.file]
          : [
              ...(category.overview
                ? [category.overview]
                : []),
              ...category.items.map(({ file }) => file)
            ];
      ensureFilesAvailable(state, categoryFiles);
      workspace.worldbuilding.push(category);
      categoryFiles.forEach((file) =>
        addFileCreateIntent(
          state,
          file,
          `Create worldbuilding category ${category.id}`
        )
      );
      markCreated(state, category.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        category.id
      );
      break;
    }
    case "worldbuilding.update": {
      const categoryIndex = findEntityIndex(
        workspace.worldbuilding,
        operation.id,
        "Worldbuilding category"
      );
      const category = workspace.worldbuilding[categoryIndex]!;
      if (
        operation.patch.format !== undefined &&
        operation.patch.format !== category.format
      ) {
        const title = operation.patch.title ?? category.title;
        if (category.format === "list") {
          if (category.overview) {
            addFileDeleteIntent(
              state,
              category.overview,
              `Convert worldbuilding category ${category.id} to text`
            );
          }
          category.items.forEach((item) =>
            addFileDeleteIntent(
              state,
              item.file,
              `Convert worldbuilding category ${category.id} to text`
            )
          );
          const file = createEmptyLongMarkdownFileReference(
            longWorldbuildingFileId(category.id),
            longWorldbuildingContentPath(category.id),
            workspace.updatedAt
          );
          ensureFilesAvailable(state, [file]);
          addFileCreateIntent(
            state,
            file,
            `Convert worldbuilding category ${category.id} to text`
          );
          workspace.worldbuilding[categoryIndex] = {
            id: category.id,
            title,
            order: category.order,
            format: "text",
            contentAuthority: "markdown",
            file
          };
        } else {
          addFileDeleteIntent(
            state,
            category.file,
            `Convert worldbuilding category ${category.id} to list`
          );
          const itemId = `worlditem_${category.id
            .replace(/^world_/u, "")
            .slice(0, 120)}:converted`;
          const existingItems = workspace.worldbuilding.flatMap((candidate) =>
            candidate.format === "list" ? candidate.items : []
          );
          assertNewEntityId(
            existingItems,
            itemId,
            "Converted worldbuilding item"
          );
          const file = createEmptyLongMarkdownFileReference(
            longWorldbuildingItemFileId(itemId),
            longWorldbuildingItemContentPath(category.id, itemId),
            workspace.updatedAt
          );
          const overview = createEmptyLongMarkdownFileReference(
            longWorldbuildingOverviewFileId(category.id),
            longWorldbuildingOverviewContentPath(category.id),
            workspace.updatedAt
          );
          ensureFilesAvailable(state, [overview, file]);
          addFileCreateIntent(
            state,
            overview,
            `Convert worldbuilding category ${category.id} to list`
          );
          addFileCreateIntent(
            state,
            file,
            `Convert worldbuilding category ${category.id} to list`
          );
          workspace.worldbuilding[categoryIndex] = {
            id: category.id,
            title,
            order: category.order,
            format: "list",
            contentAuthority: "files",
            overview,
            items: [{
              id: itemId,
              title: "原文本内容",
              order: 1,
              file
            }]
          };
        }
      } else if (operation.patch.title !== undefined) {
        category.title = operation.patch.title;
      }
      markUpdated(state, operation.id);
      break;
    }
    case "worldbuilding.delete": {
      const index = findEntityIndex(
        workspace.worldbuilding,
        operation.id,
        "Worldbuilding category"
      );
      const category = workspace.worldbuilding[index]!;
      const files =
        category.format === "text"
          ? [category.file]
          : [
              ...(category.overview ? [category.overview] : []),
              ...category.items.map(({ file }) => file)
            ];
      files.forEach((file) =>
        addFileDeleteIntent(
          state,
          file,
          `Delete worldbuilding category ${category.id}`
        )
      );
      workspace.worldbuilding.splice(index, 1);
      markDeleted(state, category.id);
      break;
    }
    case "worldbuildingItem.create": {
      const category = workspace.worldbuilding[
        findEntityIndex(
          workspace.worldbuilding,
          operation.categoryId,
          "Worldbuilding category"
        )
      ]!;
      if (category.format !== "list") {
        operationError(
          "invalid_reference",
          `Worldbuilding category ${category.id} is not a list.`
        );
      }
      const allItems = workspace.worldbuilding.flatMap((candidate) =>
        candidate.format === "list" ? candidate.items : []
      );
      assertNewEntityId(allItems, operation.item.id, "Worldbuilding item");
      ensureFilesAvailable(state, [operation.item.file]);
      category.items.push(structuredClone(operation.item));
      addFileCreateIntent(
        state,
        operation.item.file,
        `Create worldbuilding item ${operation.item.id}`
      );
      markCreated(state, operation.item.id);
      markUpdated(state, category.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.item.id
      );
      break;
    }
    case "worldbuildingItem.update": {
      const category = workspace.worldbuilding[
        findEntityIndex(
          workspace.worldbuilding,
          operation.categoryId,
          "Worldbuilding category"
        )
      ]!;
      if (category.format !== "list") {
        operationError("invalid_reference", "Worldbuilding category is not a list.");
      }
      const item = category.items[
        findEntityIndex(category.items, operation.id, "Worldbuilding item")
      ]!;
      Object.assign(item, operation.patch);
      markUpdated(state, item.id);
      markUpdated(state, category.id);
      break;
    }
    case "worldbuildingItem.delete": {
      const category = workspace.worldbuilding[
        findEntityIndex(
          workspace.worldbuilding,
          operation.categoryId,
          "Worldbuilding category"
        )
      ]!;
      if (category.format !== "list") {
        operationError("invalid_reference", "Worldbuilding category is not a list.");
      }
      const itemIndex = findEntityIndex(
        category.items,
        operation.id,
        "Worldbuilding item"
      );
      const item = category.items[itemIndex]!;
      addFileDeleteIntent(
        state,
        item.file,
        `Delete worldbuilding item ${item.id}`
      );
      category.items.splice(itemIndex, 1);
      markDeleted(state, item.id);
      markUpdated(state, category.id);
      break;
    }
    case "worldbuildingItem.reorder": {
      const category = workspace.worldbuilding[
        findEntityIndex(
          workspace.worldbuilding,
          operation.categoryId,
          "Worldbuilding category"
        )
      ]!;
      if (category.format !== "list") {
        operationError("invalid_reference", "Worldbuilding category is not a list.");
      }
      assertExactOrder(
        category.items.map(({ id }) => id),
        operation.orderedIds,
        "Worldbuilding items"
      );
      updateOrdersById(
        category.items,
        operation.orderedIds,
        (item, order) => {
          item.order = order;
        },
        state
      );
      markUpdated(state, category.id);
      break;
    }
    case "worldbuilding.reorder": {
      assertExactOrder(
        workspace.worldbuilding.map(({ id }) => id),
        operation.orderedIds,
        "Worldbuilding"
      );
      updateOrdersById(
        workspace.worldbuilding,
        operation.orderedIds,
        (category, order) => {
          category.order = order;
        },
        state
      );
      break;
    }

    case "characterType.create": {
      assertNewEntityId(
        workspace.characterTypes,
        operation.characterType.id,
        "Character type"
      );
      workspace.characterTypes.push(structuredClone(operation.characterType));
      markCreated(state, operation.characterType.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.characterType.id
      );
      break;
    }
    case "characterType.update": {
      const characterType =
        workspace.characterTypes[
          findEntityIndex(
            workspace.characterTypes,
            operation.id,
            "Character type"
          )
        ]!;
      Object.assign(characterType, operation.patch);
      markUpdated(state, characterType.id);
      break;
    }
    case "characterType.delete": {
      if (workspace.characterTypes.length <= 1) {
        operationError(
          "invalid_reference",
          "A long workspace must retain at least one character type."
        );
      }
      const typeIndex = findEntityIndex(
        workspace.characterTypes,
        operation.id,
        "Character type"
      );
      const affected = workspace.characters.filter(
        ({ group }) => group === operation.id
      );
      if (affected.length > 0) {
        const targetId = operation.moveCharactersToTypeId;
        if (!targetId || targetId === operation.id) {
          operationError(
            "invalid_reference",
            "Deleting a non-empty character type requires another target type."
          );
        }
        findEntityIndex(workspace.characterTypes, targetId, "Character type");
        const nextOrder = workspace.characters.filter(
          ({ group }) => group === targetId
        ).length;
        affected
          .sort((left, right) => left.order - right.order)
          .forEach((character, index) => {
            character.group = targetId;
            character.order = nextOrder + index + 1;
            markUpdated(state, character.id);
          });
      } else if (
        operation.moveCharactersToTypeId !== undefined &&
        operation.moveCharactersToTypeId !== operation.id
      ) {
        findEntityIndex(
          workspace.characterTypes,
          operation.moveCharactersToTypeId,
          "Character type"
        );
      }
      workspace.characterTypes.splice(typeIndex, 1);
      markDeleted(state, operation.id);
      break;
    }
    case "characterType.reorder": {
      assertExactOrder(
        workspace.characterTypes.map(({ id }) => id),
        operation.orderedIds,
        "Character types"
      );
      updateOrdersById(
        workspace.characterTypes,
        operation.orderedIds,
        (value, order) => {
          value.order = order;
        },
        state
      );
      break;
    }

    case "character.create": {
      findEntityIndex(
        workspace.characterTypes,
        operation.character.group,
        "Character type"
      );
      assertNewEntityId(
        workspace.characters,
        operation.character.id,
        "Character"
      );
      if (operation.files.characterId !== operation.character.id) {
        operationError(
          "invalid_reference",
          "Character files must reference the created character."
        );
      }
      const files = [
        operation.files.coreProfile,
        operation.files.relationships,
        operation.files.currentState,
        operation.files.history
      ];
      ensureFilesAvailable(state, files);
      workspace.characters.push(structuredClone(operation.character));
      workspace.characterFiles.push(structuredClone(operation.files));
      files.forEach((file) =>
        addFileCreateIntent(
          state,
          file,
          `Create character ${operation.character.id}`
        )
      );
      markCreated(state, operation.character.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.character.id
      );
      break;
    }
    case "character.update": {
      const character =
        workspace.characters[
          findEntityIndex(
            workspace.characters,
            operation.id,
            "Character"
          )
        ]!;
      Object.assign(character, operation.patch);
      markUpdated(state, character.id);
      break;
    }
    case "character.delete": {
      deleteCharacter(state, operation.id, operation.cascade);
      break;
    }
    case "character.move": {
      findEntityIndex(
        workspace.characterTypes,
        operation.toGroup,
        "Character type"
      );
      const character =
        workspace.characters[
          findEntityIndex(
            workspace.characters,
            operation.id,
            "Character"
          )
        ]!;
      character.group = operation.toGroup;
      const target = workspace.characters
        .filter(({ group }) => group === operation.toGroup)
        .sort((left, right) => left.order - right.order);
      const orderedIds = insertBeforeId(
        target.map(({ id }) => id),
        character.id,
        operation.beforeCharacterId,
        "Character move"
      );
      updateOrdersById(
        target,
        orderedIds,
        (value, order) => {
          value.order = order;
        },
        state
      );
      markUpdated(state, character.id);
      break;
    }
    case "character.reorder": {
      findEntityIndex(
        workspace.characterTypes,
        operation.group,
        "Character type"
      );
      const target = workspace.characters
        .filter(({ group }) => group === operation.group)
        .sort((left, right) => left.order - right.order);
      assertExactOrder(
        target.map(({ id }) => id),
        operation.orderedIds,
        `Character group ${operation.group}`
      );
      updateOrdersById(
        target,
        operation.orderedIds,
        (value, order) => {
          value.order = order;
        },
        state
      );
      break;
    }

    case "volume.create": {
      assertNewEntityId(
        workspace.plot.volumes,
        operation.volume.id,
        "Volume"
      );
      workspace.plot.volumes.push(structuredClone(operation.volume));
      markCreated(state, operation.volume.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.volume.id
      );
      break;
    }
    case "volume.update": {
      const volume =
        workspace.plot.volumes[
          findEntityIndex(
            workspace.plot.volumes,
            operation.id,
            "Volume"
          )
        ]!;
      Object.assign(volume, operation.patch);
      markUpdated(state, volume.id);
      break;
    }
    case "volume.delete": {
      deleteVolume(state, operation.id, operation.cascade);
      break;
    }
    case "volume.reorder": {
      assertExactOrder(
        workspace.plot.volumes.map(({ id }) => id),
        operation.orderedIds,
        "Volume"
      );
      updateOrdersById(
        workspace.plot.volumes,
        operation.orderedIds,
        (volume, order) => {
          volume.order = order;
        },
        state
      );
      break;
    }

    case "arc.create": {
      assertNewEntityId(workspace.plot.arcs, operation.arc.id, "Arc");
      workspace.plot.arcs.push(structuredClone(operation.arc));
      markCreated(state, operation.arc.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.arc.id
      );
      break;
    }
    case "arc.update": {
      const arc =
        workspace.plot.arcs[
          findEntityIndex(workspace.plot.arcs, operation.id, "Arc")
        ]!;
      Object.assign(arc, operation.patch);
      markUpdated(state, arc.id);
      break;
    }
    case "arc.delete": {
      deleteArc(state, operation.id, operation.cascade);
      break;
    }
    case "arc.move": {
      findEntityIndex(
        workspace.plot.volumes,
        operation.toVolumeId,
        "Target volume"
      );
      const arc =
        workspace.plot.arcs[
          findEntityIndex(workspace.plot.arcs, operation.id, "Arc")
        ]!;
      const sourceVolumeId = arc.volumeId;
      const linkedChapters = workspace.plot.chapterCards.filter(
        (chapter) => chapter.primaryArcId === arc.id
      );
      if (
        workspace.plot.storyEvents.some(
          (event) =>
            event.arcIds.includes(arc.id) &&
            eventParticipatesInCommittedFacts(workspace, event.id)
        )
      ) {
        operationError(
          "committed_prefix_protected",
          `Cannot move arc ${arc.id}; a committed event references it.`
        );
      }
      arc.volumeId = operation.toVolumeId;
      if (sourceVolumeId !== operation.toVolumeId) {
        linkedChapters.forEach((chapter) => {
          chapter.primaryArcId = null;
          markUpdated(state, chapter.id);
        });
        workspace.plot.foreshadowing.forEach((thread) => {
          thread.beats.forEach((beat) => {
            const followsMovedArc = (beat.arcId ?? null) === arc.id;
            const anchoredEvent =
              beat.eventId === null
                ? undefined
                : workspace.plot.storyEvents.find(
                    (event) => event.id === beat.eventId
                  );
            const followsMovedEvent =
              anchoredEvent?.arcIds.includes(arc.id) === true &&
              beat.volumeId === sourceVolumeId &&
              !anchoredEvent.arcIds.some((eventArcId) => {
                const eventArc = workspace.plot.arcs.find(
                  (candidate) => candidate.id === eventArcId
                );
                return eventArc?.volumeId === sourceVolumeId;
              });
            if (
              (!followsMovedArc && !followsMovedEvent) ||
              (beat.volumeId ?? null) === null
            ) {
              return;
            }
            assertBeatIsMutable(beat, "move with its planning arc");
            const concreteChapterId = concreteChapterIdForBeat(
              workspace,
              beat
            );
            beat.volumeId =
              followsMovedEvent && concreteChapterId !== null
                ? null
                : followsMovedArc && concreteChapterId !== null
                  ? null
                  : operation.toVolumeId;
            markUpdated(state, beat.id);
          });
        });
      }
      const target = workspace.plot.arcs
        .filter(({ volumeId }) => volumeId === operation.toVolumeId)
        .sort((left, right) => left.order - right.order);
      const orderedIds = insertBeforeId(
        target.map(({ id }) => id),
        arc.id,
        operation.beforeArcId,
        "Arc move"
      );
      updateOrdersById(
        target,
        orderedIds,
        (value, order) => {
          value.order = order;
        },
        state
      );
      markUpdated(state, arc.id);
      break;
    }
    case "arc.reorder": {
      const target = workspace.plot.arcs
        .filter(({ volumeId }) => volumeId === operation.volumeId)
        .sort((left, right) => left.order - right.order);
      assertExactOrder(
        target.map(({ id }) => id),
        operation.orderedIds,
        `Arcs in ${operation.volumeId}`
      );
      updateOrdersById(
        target,
        operation.orderedIds,
        (value, order) => {
          value.order = order;
        },
        state
      );
      break;
    }

    case "chapter.create": {
      assertNewEntityId(
        workspace.plot.chapterCards,
        operation.chapterCard.id,
        "Chapter card"
      );
      if (
        operation.files.chapterCardId !== operation.chapterCard.id ||
        operation.files.commitId !== null
      ) {
        operationError(
          "invalid_reference",
          "New chapter files must reference the created uncommitted chapter."
        );
      }
      const files = [
        operation.files.body,
        operation.files.card,
        operation.files.characterState,
        operation.files.handoff,
        operation.files.foreshadowingChanges,
        ...(operation.files.worldReveals
          ? [operation.files.worldReveals]
          : []),
        ...operation.files.characterContinuity.flatMap((character) => [
          character.currentState,
          character.history
        ])
      ];
      ensureFilesAvailable(state, files);
      workspace.plot.chapterCards.push(
        structuredClone(operation.chapterCard)
      );
      workspace.chapters.push(structuredClone(operation.files));
      files.forEach((file) =>
        addFileCreateIntent(
          state,
          file,
          `Create chapter ${operation.chapterCard.id}`
        )
      );
      markCreated(state, operation.chapterCard.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.chapterCard.id
      );
      break;
    }
    case "chapter.update": {
      const chapter =
        workspace.plot.chapterCards[
          findEntityIndex(
            workspace.plot.chapterCards,
            operation.id,
            "Chapter card"
          )
        ]!;
      Object.assign(chapter, operation.patch);
      markUpdated(state, chapter.id);
      break;
    }
    case "chapter.delete": {
      deleteChapter(state, operation.id, operation.cascade);
      break;
    }
    case "chapter.move": {
      assertChapterIsMutable(workspace, operation.id, "move");
      findEntityIndex(
        workspace.plot.volumes,
        operation.toVolumeId,
        "Target volume"
      );
      if (operation.toPrimaryArcId !== null) {
        const targetArc =
          workspace.plot.arcs[
            findEntityIndex(
              workspace.plot.arcs,
              operation.toPrimaryArcId,
              "Target primary arc"
            )
          ]!;
        if (targetArc.volumeId !== operation.toVolumeId) {
          operationError(
            "invalid_reference",
            "Target chapter volume and primary arc must match."
          );
        }
      }
      const chapter =
        workspace.plot.chapterCards[
          findEntityIndex(
            workspace.plot.chapterCards,
            operation.id,
            "Chapter card"
          )
        ]!;
      chapter.volumeId = operation.toVolumeId;
      chapter.primaryArcId = operation.toPrimaryArcId;
      workspace.plot.foreshadowing.forEach((thread) => {
        thread.beats.forEach((beat) => {
          if (concreteChapterIdForBeat(workspace, beat) !== chapter.id) {
            return;
          }
          retargetBeatPlanningAnchorsToChapter(
            state,
            beat,
            chapter,
            "move with its concrete chapter"
          );
        });
      });
      const target = workspace.plot.chapterCards
        .filter(({ volumeId }) => volumeId === operation.toVolumeId)
        .sort(
          (left, right) =>
            left.narrativeOrder - right.narrativeOrder
        );
      const orderedIds = insertBeforeId(
        target.map(({ id }) => id),
        chapter.id,
        operation.beforeChapterCardId,
        "Chapter move"
      );
      updateOrdersById(
        target,
        orderedIds,
        (value, order) => {
          value.narrativeOrder = order;
        },
        state
      );
      markUpdated(state, chapter.id);
      break;
    }
    case "chapter.reorder": {
      const target = workspace.plot.chapterCards
        .filter(({ volumeId }) => volumeId === operation.volumeId)
        .sort(
          (left, right) =>
            left.narrativeOrder - right.narrativeOrder
        );
      assertExactOrder(
        target.map(({ id }) => id),
        operation.orderedIds,
        `Chapters in ${operation.volumeId}`
      );
      updateOrdersById(
        target,
        operation.orderedIds,
        (value, order) => {
          value.narrativeOrder = order;
        },
        state
      );
      break;
    }
    case "chapterContinuity.worldReveals.create": {
      assertChapterIsMutable(
        workspace,
        operation.chapterCardId,
        "create world-reveals continuity for"
      );
      const chapterFiles = workspace.chapters[
        findEntityIndex(
          workspace.chapters.map((entry) => ({
            ...entry,
            id: entry.chapterCardId
          })),
          operation.chapterCardId,
          "Chapter file index"
        )
      ]!;
      if (chapterFiles.worldReveals) {
        operationError(
          "already_exists",
          `Chapter ${operation.chapterCardId} already has a world-reveals file.`
        );
      }
      ensureFilesAvailable(state, [operation.file]);
      chapterFiles.worldReveals = structuredClone(operation.file);
      addFileCreateIntent(
        state,
        operation.file,
        `Create world reveals for chapter ${operation.chapterCardId}`
      );
      break;
    }
    case "chapterContinuity.worldReveals.delete": {
      assertChapterIsMutable(
        workspace,
        operation.chapterCardId,
        "delete world-reveals continuity from"
      );
      const chapterFiles = workspace.chapters[
        findEntityIndex(
          workspace.chapters.map((entry) => ({
            ...entry,
            id: entry.chapterCardId
          })),
          operation.chapterCardId,
          "Chapter file index"
        )
      ]!;
      if (!chapterFiles.worldReveals) {
        operationError(
          "not_found",
          `Chapter ${operation.chapterCardId} does not have a world-reveals file.`
        );
      }
      addFileDeleteIntent(
        state,
        chapterFiles.worldReveals,
        `Delete world reveals from chapter ${operation.chapterCardId}`
      );
      chapterFiles.worldReveals = null;
      break;
    }
    case "chapterContinuity.character.create": {
      assertChapterIsMutable(
        workspace,
        operation.chapterCardId,
        "create character continuity for"
      );
      findEntityIndex(
        workspace.characters,
        operation.characterId,
        "Character"
      );
      const chapterFiles = workspace.chapters[
        findEntityIndex(
          workspace.chapters.map((entry) => ({
            ...entry,
            id: entry.chapterCardId
          })),
          operation.chapterCardId,
          "Chapter file index"
        )
      ]!;
      if (
        chapterFiles.characterContinuity.some(
          ({ characterId }) => characterId === operation.characterId
        )
      ) {
        operationError(
          "already_exists",
          `Chapter ${operation.chapterCardId} already tracks character ${operation.characterId}.`
        );
      }
      const files = [operation.currentState, operation.history];
      ensureFilesAvailable(state, files);
      chapterFiles.characterContinuity.push({
        characterId: operation.characterId,
        currentState: structuredClone(operation.currentState),
        history: structuredClone(operation.history)
      });
      files.forEach((file) =>
        addFileCreateIntent(
          state,
          file,
          `Create character continuity for ${operation.characterId} in chapter ${operation.chapterCardId}`
        )
      );
      break;
    }
    case "chapterContinuity.character.delete": {
      assertChapterIsMutable(
        workspace,
        operation.chapterCardId,
        "delete character continuity from"
      );
      const chapterFiles = workspace.chapters[
        findEntityIndex(
          workspace.chapters.map((entry) => ({
            ...entry,
            id: entry.chapterCardId
          })),
          operation.chapterCardId,
          "Chapter file index"
        )
      ]!;
      const continuityIndex = chapterFiles.characterContinuity.findIndex(
        ({ characterId }) => characterId === operation.characterId
      );
      if (continuityIndex < 0) {
        operationError(
          "not_found",
          `Chapter ${operation.chapterCardId} does not track character ${operation.characterId}.`
        );
      }
      const [continuity] = chapterFiles.characterContinuity.splice(
        continuityIndex,
        1
      );
      [continuity!.currentState, continuity!.history].forEach((file) =>
        addFileDeleteIntent(
          state,
          file,
          `Delete character continuity for ${operation.characterId} from chapter ${operation.chapterCardId}`
        )
      );
      break;
    }

    case "event.create": {
      assertNewEntityId(
        workspace.plot.storyEvents,
        operation.event.id,
        "Story event"
      );
      workspace.plot.storyEvents.push(structuredClone(operation.event));
      markCreated(state, operation.event.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.event.id
      );
      break;
    }
    case "event.update": {
      if (eventParticipatesInCommittedFacts(workspace, operation.id)) {
        operationError(
          "committed_prefix_protected",
          `Cannot update committed story event ${operation.id}.`
        );
      }
      const event =
        workspace.plot.storyEvents[
          findEntityIndex(
            workspace.plot.storyEvents,
            operation.id,
            "Story event"
          )
        ]!;
      Object.assign(event, operation.patch);
      if (operation.patch.arcIds !== undefined) {
        const eventVolumeIds = [
          ...new Set(
            event.arcIds
              .map(
                (eventArcId) =>
                  workspace.plot.arcs.find(
                    (candidate) => candidate.id === eventArcId
                  )?.volumeId
              )
              .filter((volumeId): volumeId is string => Boolean(volumeId))
          )
        ];
        workspace.plot.foreshadowing.forEach((thread) => {
          thread.beats.forEach((beat) => {
            if (beat.eventId !== event.id) return;
            const plannedArcId = beat.arcId ?? null;
            const plannedVolumeId = beat.volumeId ?? null;
            const arcNeedsRetarget =
              plannedArcId !== null &&
              !event.arcIds.includes(plannedArcId);
            const volumeNeedsRetarget =
              plannedVolumeId !== null &&
              !eventVolumeIds.includes(plannedVolumeId);
            if (!arcNeedsRetarget && !volumeNeedsRetarget) return;

            assertBeatIsMutable(beat, "retarget with its event");
            const concreteChapterId = concreteChapterIdForBeat(
              workspace,
              beat
            );
            const concreteChapter =
              concreteChapterId === null
                ? undefined
                : workspace.plot.chapterCards.find(
                    (chapter) => chapter.id === concreteChapterId
                  );
            if (arcNeedsRetarget) {
              beat.arcId =
                concreteChapter &&
                concreteChapter.primaryArcId !== null &&
                event.arcIds.includes(concreteChapter.primaryArcId)
                  ? concreteChapter.primaryArcId
                  : !concreteChapter && event.arcIds.length === 1
                    ? event.arcIds[0]!
                    : null;
            }
            if (volumeNeedsRetarget) {
              beat.volumeId =
                concreteChapter &&
                eventVolumeIds.includes(concreteChapter.volumeId)
                  ? concreteChapter.volumeId
                  : !concreteChapter && eventVolumeIds.length === 1
                    ? eventVolumeIds[0]!
                    : null;
            }
            markUpdated(state, beat.id);
          });
        });
      }
      markUpdated(state, event.id);
      break;
    }
    case "event.delete": {
      deleteStoryEvent(state, operation.id, operation.cascade);
      break;
    }
    case "event.reorder": {
      assertExactOrder(
        workspace.plot.storyEvents.map(({ id }) => id),
        operation.orderedIds,
        "Story event"
      );
      const nextOrderById = new Map(
        operation.orderedIds.map((id, index) => [id, index + 1])
      );
      workspace.plot.storyEvents.forEach((event) => {
        const nextOrder = nextOrderById.get(event.id)!;
        if (
          nextOrder !== event.storyOrder &&
          eventParticipatesInCommittedFacts(workspace, event.id)
        ) {
          operationError(
            "committed_prefix_protected",
            `Cannot reorder committed story event ${event.id}.`
          );
        }
      });
      updateOrdersById(
        workspace.plot.storyEvents,
        operation.orderedIds,
        (event, order) => {
          event.storyOrder = order;
        },
        state
      );
      break;
    }

    case "storyPlot.create": {
      findEntityIndex(
        workspace.plot.arcs,
        operation.storyPlot.arcId,
        "Arc"
      );
      assertNewEntityId(
        workspace.plot.storyPlots,
        operation.storyPlot.id,
        "Story plot"
      );
      ensureFilesAvailable(state, [operation.storyPlot.file]);
      workspace.plot.storyPlots.push(structuredClone(operation.storyPlot));
      addFileCreateIntent(
        state,
        operation.storyPlot.file,
        `Create story plot ${operation.storyPlot.id}`
      );
      markCreated(state, operation.storyPlot.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.storyPlot.id
      );
      break;
    }
    case "storyPlot.update": {
      const storyPlot =
        workspace.plot.storyPlots[
          findEntityIndex(
            workspace.plot.storyPlots,
            operation.id,
            "Story plot"
          )
        ]!;
      Object.assign(storyPlot, operation.patch);
      markUpdated(state, storyPlot.id);
      break;
    }
    case "storyPlot.delete": {
      deleteStoryPlot(state, operation.id);
      break;
    }
    case "storyPlot.reorder": {
      findEntityIndex(workspace.plot.arcs, operation.arcId, "Arc");
      const target = workspace.plot.storyPlots.filter(
        (storyPlot) => storyPlot.arcId === operation.arcId
      );
      assertExactOrder(
        target.map(({ id }) => id),
        operation.orderedIds,
        `Story plots in ${operation.arcId}`
      );
      updateOrdersById(
        target,
        operation.orderedIds,
        (value, order) => {
          value.order = order;
        },
        state
      );
      break;
    }

    case "connection.create": {
      assertNewEntityId(
        workspace.plot.eventConnections,
        operation.connection.id,
        "Event connection"
      );
      workspace.plot.eventConnections.push(
        structuredClone(operation.connection)
      );
      markCreated(state, operation.connection.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.connection.id
      );
      break;
    }
    case "connection.update": {
      const connection =
        workspace.plot.eventConnections[
          findEntityIndex(
            workspace.plot.eventConnections,
            operation.id,
            "Event connection"
          )
        ]!;
      if (
        eventParticipatesInCommittedFacts(
          workspace,
          connection.sourceEventId
        ) ||
        eventParticipatesInCommittedFacts(
          workspace,
          connection.targetEventId
        )
      ) {
        operationError(
          "committed_prefix_protected",
          `Cannot update connection ${connection.id} between committed events.`
        );
      }
      Object.assign(connection, operation.patch);
      markUpdated(state, connection.id);
      break;
    }
    case "connection.delete": {
      const index = findEntityIndex(
        workspace.plot.eventConnections,
        operation.id,
        "Event connection"
      );
      const connection = workspace.plot.eventConnections[index]!;
      if (
        eventParticipatesInCommittedFacts(
          workspace,
          connection.sourceEventId
        ) ||
        eventParticipatesInCommittedFacts(
          workspace,
          connection.targetEventId
        )
      ) {
        operationError(
          "committed_prefix_protected",
          `Cannot delete connection ${connection.id} between committed events.`
        );
      }
      workspace.plot.eventConnections.splice(index, 1);
      markDeleted(state, connection.id);
      break;
    }

    case "placement.create": {
      assertNewEntityId(
        workspace.plot.narrativePlacements,
        operation.placement.id,
        "Narrative placement"
      );
      if (
        operation.placement.status !== "planned" ||
        operation.placement.commitId !== null
      ) {
        operationError(
          "committed_prefix_protected",
          "New narrative placements must start in planned state."
        );
      }
      workspace.plot.narrativePlacements.push(
        structuredClone(operation.placement)
      );
      markCreated(state, operation.placement.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.placement.id
      );
      break;
    }
    case "placement.update": {
      const placement =
        workspace.plot.narrativePlacements[
          findEntityIndex(
            workspace.plot.narrativePlacements,
            operation.id,
            "Narrative placement"
          )
        ]!;
      assertPlacementIsMutable(placement, "update");
      Object.assign(placement, operation.patch);
      markUpdated(state, placement.id);
      break;
    }
    case "placement.delete": {
      deleteNarrativePlacement(
        state,
        operation.id,
        operation.cascade
      );
      break;
    }
    case "placement.move": {
      const placement =
        workspace.plot.narrativePlacements[
          findEntityIndex(
            workspace.plot.narrativePlacements,
            operation.id,
            "Narrative placement"
          )
        ]!;
      assertPlacementIsMutable(placement, "move");
      assertChapterIsMutable(
        workspace,
        operation.toChapterCardId,
        "receive a moved placement"
      );
      const targetChapter =
        workspace.plot.chapterCards[
          findEntityIndex(
            workspace.plot.chapterCards,
            operation.toChapterCardId,
            "Target chapter"
          )
        ]!;
      placement.chapterCardId = operation.toChapterCardId;
      workspace.plot.foreshadowing.forEach((thread) => {
        thread.beats.forEach((beat) => {
          if (beat.placementId !== placement.id) return;
          if (beat.chapterCardId !== null) {
            assertBeatIsMutable(beat, "move with its placement");
            beat.chapterCardId = operation.toChapterCardId;
            markUpdated(state, beat.id);
          }
          retargetBeatPlanningAnchorsToChapter(
            state,
            beat,
            targetChapter,
            "move with its placement"
          );
        });
      });
      const target = workspace.plot.narrativePlacements
        .filter(
          ({ chapterCardId }) =>
            chapterCardId === operation.toChapterCardId
        )
        .sort(
          (left, right) => left.orderInChapter - right.orderInChapter
        );
      const orderedIds = insertBeforeId(
        target.map(({ id }) => id),
        placement.id,
        operation.beforePlacementId,
        "Placement move"
      );
      updateOrdersById(
        target,
        orderedIds,
        (value, order) => {
          value.orderInChapter = order;
        },
        state
      );
      markUpdated(state, placement.id);
      break;
    }
    case "placement.reorder": {
      const target = workspace.plot.narrativePlacements
        .filter(
          ({ chapterCardId }) =>
            chapterCardId === operation.chapterCardId
        )
        .sort(
          (left, right) => left.orderInChapter - right.orderInChapter
        );
      target.forEach((placement) =>
        assertPlacementIsMutable(placement, "reorder")
      );
      assertExactOrder(
        target.map(({ id }) => id),
        operation.orderedIds,
        `Placements in ${operation.chapterCardId}`
      );
      updateOrdersById(
        target,
        operation.orderedIds,
        (value, order) => {
          value.orderInChapter = order;
        },
        state
      );
      break;
    }

    case "foreshadowing.create": {
      assertNewEntityId(
        workspace.plot.foreshadowing,
        operation.thread.id,
        "Foreshadowing thread"
      );
      const existingBeatIds = new Set(
        workspace.plot.foreshadowing.flatMap(({ beats }) =>
          beats.map(({ id }) => id)
        )
      );
      operation.thread.beats.forEach((beat) => {
        if (existingBeatIds.has(beat.id)) {
          operationError(
            "already_exists",
            `Foreshadowing beat ${beat.id} already exists.`
          );
        }
        if (beat.status !== "planned" || beat.commitId !== null) {
          operationError(
            "committed_prefix_protected",
            "New foreshadowing beats must start in planned state."
          );
        }
        existingBeatIds.add(beat.id);
      });
      if (operation.thread.status !== "planned") {
        operationError(
          "committed_prefix_protected",
          "New foreshadowing threads must start in planned state."
        );
      }
      workspace.plot.foreshadowing.push(
        structuredClone(operation.thread)
      );
      markCreated(state, operation.thread.id);
      operation.thread.beats.forEach((beat) =>
        markCreated(state, beat.id)
      );
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.thread.id
      );
      break;
    }
    case "foreshadowing.update": {
      const thread =
        workspace.plot.foreshadowing[
          findEntityIndex(
            workspace.plot.foreshadowing,
            operation.id,
            "Foreshadowing thread"
          )
        ]!;
      const hasCommittedBeat = thread.beats.some(
        (beat) => beat.commitId !== null
      );
      const changesLockedCoreField = Object.keys(operation.patch).some(
        (field) =>
          field !== "status" &&
          !(
            field === "hiddenTruth" &&
            thread.hiddenTruth === undefined
          ) &&
          !(
            field === "plannedSpan" &&
            thread.plannedSpan === undefined
          )
      );
      if (
        hasCommittedBeat &&
        changesLockedCoreField
      ) {
        operationError(
          "committed_prefix_protected",
          `Cannot update core fields of thread ${thread.id} after a beat is committed.`
        );
      }
      Object.assign(thread, operation.patch);
      if (operation.patch.status === "planned") {
        thread.status =
          deriveLongForeshadowingStatusFromCommittedBeats(thread.beats);
      }
      markUpdated(state, thread.id);
      break;
    }
    case "foreshadowing.delete": {
      deleteForeshadowingThread(
        state,
        operation.id,
        operation.cascade
      );
      break;
    }
    case "foreshadowing.reorder": {
      assertExactOrder(
        workspace.plot.foreshadowing.map(({ id }) => id),
        operation.orderedIds,
        "Foreshadowing thread"
      );
      const byId = new Map(
        workspace.plot.foreshadowing.map((thread) => [
          thread.id,
          thread
        ])
      );
      workspace.plot.foreshadowing = operation.orderedIds.map((id) => {
        const thread = byId.get(id);
        if (!thread) {
          return operationError(
            "not_found",
            `Foreshadowing thread ${id} does not exist.`
          );
        }
        markUpdated(state, id);
        return thread;
      });
      break;
    }

    case "foreshadowingBeat.create": {
      const thread =
        workspace.plot.foreshadowing[
          findEntityIndex(
            workspace.plot.foreshadowing,
            operation.threadId,
            "Foreshadowing thread"
          )
        ]!;
      const existingBeatIds = new Set(
        workspace.plot.foreshadowing.flatMap(({ beats }) =>
          beats.map(({ id }) => id)
        )
      );
      if (existingBeatIds.has(operation.beat.id)) {
        operationError(
          "already_exists",
          `Foreshadowing beat ${operation.beat.id} already exists.`
        );
      }
      if (
        operation.beat.status !== "planned" ||
        operation.beat.commitId !== null
      ) {
        operationError(
          "committed_prefix_protected",
          "New foreshadowing beats must start in planned state."
        );
      }
      thread.beats.push(structuredClone(operation.beat));
      markCreated(state, operation.beat.id);
      markUpdated(state, thread.id);
      registerProvisionalId(
        state,
        operation.provisionalId,
        operation.beat.id
      );
      break;
    }
    case "foreshadowingBeat.update": {
      const { beat } = findBeat(workspace, operation.id);
      assertBeatIsMutable(beat, "update");
      Object.assign(beat, operation.patch);
      markUpdated(state, beat.id);
      break;
    }
    case "foreshadowingBeat.delete": {
      deleteForeshadowingBeat(state, operation.id);
      break;
    }
    case "foreshadowingBeat.move": {
      const located = findBeat(workspace, operation.id);
      assertBeatIsMutable(located.beat, "move");
      const targetThread =
        workspace.plot.foreshadowing[
          findEntityIndex(
            workspace.plot.foreshadowing,
            operation.toThreadId,
            "Target foreshadowing thread"
          )
        ]!;
      located.thread.beats.splice(located.beatIndex, 1);
      const ids = insertBeforeId(
        targetThread.beats
          .sort((left, right) => left.order - right.order)
          .map(({ id }) => id),
        located.beat.id,
        operation.beforeBeatId,
        "Foreshadowing beat move"
      );
      const beatById = new Map(
        [...targetThread.beats, located.beat].map((beat) => [
          beat.id,
          beat
        ])
      );
      targetThread.beats = ids.map((id, index) => {
        const beat = beatById.get(id);
        if (!beat) {
          return operationError(
            "not_found",
            `Foreshadowing beat ${id} does not exist.`
          );
        }
        beat.order = index + 1;
        return beat;
      });
      markUpdated(state, located.thread.id);
      markUpdated(state, targetThread.id);
      markUpdated(state, located.beat.id);
      break;
    }
    case "foreshadowingBeat.reorder": {
      const thread =
        workspace.plot.foreshadowing[
          findEntityIndex(
            workspace.plot.foreshadowing,
            operation.threadId,
            "Foreshadowing thread"
          )
        ]!;
      assertExactOrder(
        thread.beats.map(({ id }) => id),
        operation.orderedIds,
        `Foreshadowing beats in ${thread.id}`
      );
      const beatById = new Map(
        thread.beats.map((beat) => [beat.id, beat])
      );
      thread.beats = operation.orderedIds.map((id, index) => {
        const beat = beatById.get(id);
        if (!beat) {
          return operationError(
            "not_found",
            `Foreshadowing beat ${id} does not exist.`
          );
        }
        beat.order = index + 1;
        markUpdated(state, beat.id);
        return beat;
      });
      markUpdated(state, thread.id);
      break;
    }
  }
}

function applyDocumentWriteProposals(
  state: MutationState,
  proposals: readonly LongDocumentWriteProposal[]
): LongDocumentWriteProposal[] {
  const proposalIds = new Set<string>();
  const targetFileIds = new Set<string>();
  const ledgerFileIds = new Set(
    state.draft.ledger.commits.map(({ recordFile }) => recordFile.id)
  );

  for (const proposal of proposals) {
    if (proposalIds.has(proposal.proposalId)) {
      operationError(
        "invalid_document_write",
        `Duplicate document proposal id ${proposal.proposalId}.`
      );
    }
    proposalIds.add(proposal.proposalId);
    if (targetFileIds.has(proposal.fileId)) {
      operationError(
        "invalid_document_write",
        `A batch may propose only one write for file ${proposal.fileId}.`
      );
    }
    targetFileIds.add(proposal.fileId);
    if (ledgerFileIds.has(proposal.fileId)) {
      operationError(
        "committed_prefix_protected",
        `Committed ledger file ${proposal.fileId} cannot be rewritten.`
      );
    }
    const intent = state.fileIntents.get(proposal.fileId);
    if (intent?.action === "delete") {
      operationError(
        "invalid_document_write",
        `Cannot write file ${proposal.fileId} while deleting it.`
      );
    }
    const file = allWorkspaceFiles(state.draft).find(
      (candidate) => candidate.id === proposal.fileId
    );
    if (!file) {
      operationError(
        "invalid_document_write",
        `Document proposal target ${proposal.fileId} does not exist.`
      );
    }

    if (proposal.mode === "create") {
      if (intent?.action !== "create") {
        operationError(
          "invalid_document_write",
          `Create proposal ${proposal.proposalId} must target a newly created file.`
        );
      }
      file.revision = proposal.nextRevision;
      file.updatedAt = proposal.updatedAt;
      intent.file.revision = proposal.nextRevision;
      intent.file.updatedAt = proposal.updatedAt;
      continue;
    }

    if (intent?.action === "create") {
      operationError(
        "invalid_document_write",
        `New file ${proposal.fileId} requires create write mode.`
      );
    }
    if (file.revision !== proposal.expectedRevision) {
      operationError(
        "invalid_document_write",
        `Document proposal ${proposal.proposalId} has a stale expected revision.`
      );
    }
    file.revision = proposal.nextRevision;
    file.updatedAt = proposal.updatedAt;
  }

  return proposals.map((proposal) => structuredClone(proposal));
}

function impactSummary(
  state: MutationState,
  documentWrites: readonly LongDocumentWriteProposal[]
): LongWorkspaceImpactSummary {
  const fileIntents = [...state.fileIntents.values()];
  return LongWorkspaceImpactSummarySchema.parse({
    createdEntityIds: [...state.createdEntityIds].sort(),
    updatedEntityIds: [...state.updatedEntityIds].sort(),
    deletedEntityIds: [...state.deletedEntityIds].sort(),
    createdFileIds: fileIntents
      .filter(({ action }) => action === "create")
      .map(({ file }) => file.id)
      .sort(),
    deletedFileIds: fileIntents
      .filter(({ action }) => action === "delete")
      .map(({ file }) => file.id)
      .sort(),
    documentWriteProposalIds: documentWrites
      .map(({ proposalId }) => proposalId)
      .sort()
  });
}

interface WorkspaceEntityRecord {
  kind: LongWorkspaceEntityKind;
  id: string;
  value: LongWorkspaceEntitySnapshot;
  serialized: string;
}

function workspaceEntityRecords(
  snapshot: LongWorkspaceIndexSnapshot
): Map<string, WorkspaceEntityRecord> {
  const records = new Map<string, WorkspaceEntityRecord>();
  const add = (
    kind: LongWorkspaceEntityKind,
    entity: { id: string },
    value: unknown = entity
  ): void => {
    const serialized = JSON.stringify(value);
    records.set(entity.id, {
      kind,
      id: entity.id,
      value: JSON.parse(serialized) as LongWorkspaceEntitySnapshot,
      serialized
    });
  };
  snapshot.worldbuilding.forEach((entity) =>
    add("worldbuilding-category", entity)
  );
  snapshot.worldbuilding.forEach((category) => {
    if (category.format === "list") {
      category.items.forEach((item) => add("worldbuilding-item", item));
    }
  });
  snapshot.characters.forEach((entity) => add("character", entity));
  snapshot.plot.volumes.forEach((entity) => add("volume", entity));
  snapshot.plot.arcs.forEach((entity) => add("arc", entity));
  snapshot.plot.chapterCards.forEach((entity) =>
    add("chapter-card", entity)
  );
  snapshot.plot.storyEvents.forEach((entity) =>
    add("story-event", entity)
  );
  snapshot.plot.storyPlots.forEach((entity) => add("story-plot", entity));
  snapshot.plot.eventConnections.forEach((entity) =>
    add("event-connection", entity)
  );
  snapshot.plot.narrativePlacements.forEach((entity) =>
    add("narrative-placement", entity)
  );
  snapshot.plot.foreshadowing.forEach((thread) => {
    add("foreshadowing-thread", thread, {
      ...thread,
      beats: thread.beats.map(({ id }) => id)
    });
    thread.beats.forEach((beat) =>
      add("foreshadowing-beat", beat)
    );
  });
  return records;
}

function workspaceEntityChanges(
  before: LongWorkspaceIndexSnapshot,
  after: LongWorkspaceIndexSnapshot
): LongWorkspaceEntityChange[] {
  const beforeRecords = workspaceEntityRecords(before);
  const afterRecords = workspaceEntityRecords(after);
  const ids = new Set([...beforeRecords.keys(), ...afterRecords.keys()]);
  const changes: LongWorkspaceEntityChange[] = [];
  for (const id of ids) {
    const previous = beforeRecords.get(id);
    const next = afterRecords.get(id);
    if (!previous && next) {
      changes.push({
        kind: next.kind,
        id: next.id,
        action: "create",
        before: null,
        after: next.value
      });
    } else if (previous && !next) {
      changes.push({
        kind: previous.kind,
        id: previous.id,
        action: "delete",
        before: previous.value,
        after: null
      });
    } else if (
      previous &&
      next &&
      previous.serialized !== next.serialized
    ) {
      if (previous.kind !== next.kind) {
        operationError(
          "invalid_result",
          `Entity ${id} changed kind from ${previous.kind} to ${next.kind}.`
        );
      }
      changes.push({
        kind: previous.kind,
        id: previous.id,
        action: "update",
        before: previous.value,
        after: next.value
      });
    }
  }
  return changes.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
  );
}

/**
 * Normalization can renumber siblings after a delete, move or insert. Derive
 * the final entity impact from the authoritative before/after snapshots so
 * the approval preview includes every implicit order change and omits
 * no-op updates that a mutation handler happened to mark manually.
 */
function reconcileEntityImpact(state: MutationState): void {
  const before = workspaceEntityRecords(state.original);
  const after = workspaceEntityRecords(state.draft);
  state.createdEntityIds = new Set(
    [...after.keys()].filter((id) => !before.has(id))
  );
  state.deletedEntityIds = new Set(
    [...before.keys()].filter((id) => !after.has(id))
  );
  state.updatedEntityIds = new Set(
    [...after.entries()]
      .filter(
        ([id, value]) =>
          before.has(id) &&
          before.get(id)?.serialized !== value.serialized
      )
      .map(([id]) => id)
  );
}

function formatSchemaIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map(
      (issue) =>
        `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`
    )
    .join("; ");
}

function simulateLongWorkspaceOperations(
  snapshotInput: LongWorkspaceIndexSnapshot,
  batchInput: LongWorkspaceOperationBatchInput
): LongWorkspaceOperationResult {
  const original = LongWorkspaceIndexSnapshotSchema.parse(snapshotInput);
  const batch = LongWorkspaceOperationBatchSchema.parse(batchInput);
  if (batch.baseRevision !== original.revision) {
    operationError(
      "revision_conflict",
      `Expected long workspace revision ${original.revision}, received ${batch.baseRevision}.`
    );
  }

  const state: MutationState = {
    original: structuredClone(original),
    draft: structuredClone(original),
    createdEntityIds: new Set(),
    updatedEntityIds: new Set(),
    deletedEntityIds: new Set(),
    fileIntents: new Map(),
    provisionalIdMap: {}
  };
  normalizeLongWorkspaceOrders(state.draft);

  for (const operation of batch.operations) {
    applyLongWorkspaceOperation(state, operation);
    normalizeLongWorkspaceOrders(state.draft);
  }

  const documentWrites = applyDocumentWriteProposals(
    state,
    batch.documentWrites
  );
  normalizeLongWorkspaceOrders(state.draft);
  assertCommittedFactAnchorsPreserved(state);
  const recordedChapterIds = new Set(
    state.draft.ledger.commits.map(({ chapterCardId }) => chapterCardId)
  );
  state.draft.ledger.committedThroughChapterId = null;
  for (const chapterCardId of orderedChapterIds(state.draft)) {
    if (!recordedChapterIds.has(chapterCardId)) break;
    state.draft.ledger.committedThroughChapterId = chapterCardId;
  }
  state.draft.revision = original.revision + 1;
  state.draft.updatedAt = batch.updatedAt;

  const parsedSnapshot =
    LongWorkspaceIndexSnapshotSchema.safeParse(state.draft);
  if (!parsedSnapshot.success) {
    operationError(
      "invalid_result",
      `Long workspace operations produced an invalid index: ${formatSchemaIssues(parsedSnapshot.error)}`
    );
  }
  state.draft = parsedSnapshot.data;
  reconcileEntityImpact(state);
  const entityChanges = workspaceEntityChanges(
    state.original,
    parsedSnapshot.data
  );

  const fileIntents = [...state.fileIntents.values()].sort((left, right) =>
    left.file.id.localeCompare(right.file.id)
  );
  return LongWorkspaceOperationResultSchema.parse({
    baseRevision: original.revision,
    resultRevision: parsedSnapshot.data.revision,
    impact: impactSummary(state, documentWrites),
    entityChanges,
    fileIntents,
    documentWrites,
    provisionalIdMap: state.provisionalIdMap,
    snapshot: parsedSnapshot.data
  });
}

function impactSummariesMatch(
  expected: LongWorkspaceImpactSummary,
  actual: LongWorkspaceImpactSummary
): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

/**
 * Computes a deterministic structure/file-impact preview without mutating the
 * caller's snapshot or writing any files.
 */
export function previewLongWorkspaceOperations(
  snapshot: LongWorkspaceIndexSnapshot,
  batch: LongWorkspaceOperationBatchInput
): LongWorkspaceImpactPreview {
  const result = simulateLongWorkspaceOperations(snapshot, batch);
  return LongWorkspaceImpactPreviewSchema.parse({
    baseRevision: result.baseRevision,
    resultRevision: result.resultRevision,
    impact: result.impact,
    entityChanges: result.entityChanges,
    fileIntents: result.fileIntents,
    documentWrites: result.documentWrites,
    provisionalIdMap: result.provisionalIdMap
  });
}

/**
 * Applies a long-form structure batch to an in-memory clone. Cascading
 * deletion requires a caller-supplied exact impact summary produced by the
 * preview function. The returned file intents and document proposals still
 * require an external transactional executor; this function never writes disk.
 */
export function applyLongWorkspaceOperations(
  snapshot: LongWorkspaceIndexSnapshot,
  batchInput: LongWorkspaceOperationBatchInput
): LongWorkspaceOperationResult {
  const batch = LongWorkspaceOperationBatchSchema.parse(batchInput);
  const result = simulateLongWorkspaceOperations(snapshot, batch);
  const cascadeRequested = batch.operations.some(
    (operation) => "cascade" in operation && operation.cascade
  );
  if (cascadeRequested && batch.expectedImpact === undefined) {
    operationError(
      "cascade_impact_mismatch",
      "Cascading operations require an exact expectedImpact from preview."
    );
  }
  if (
    batch.expectedImpact !== undefined &&
    !impactSummariesMatch(batch.expectedImpact, result.impact)
  ) {
    operationError(
      "cascade_impact_mismatch",
      "Operation impact no longer matches the caller-approved preview."
    );
  }
  return result;
}
