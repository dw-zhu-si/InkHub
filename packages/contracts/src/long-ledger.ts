import { z } from "zod";
import {
  LongBookIdSchema,
  LongChapterCardIdSchema,
  LongContinuityAudienceTypeSchema,
  LongContinuityDomainSchema,
  LongContinuityFactFieldSchema,
  LongContinuityFactIdSchema,
  LongContinuityFactSchema,
  LongContinuityHandoffSchema,
  LongContinuityKnowledgeLevelSchema,
  LongContinuityKnowledgeSchema,
  LongContinuityOpenLoopIdSchema,
  LongContinuityOpenLoopKindSchema,
  LongContinuityOpenLoopSchema,
  LongContinuityOpenLoopStatusSchema,
  LongExecutionStatusSchema,
  LongFileIdSchema,
  LongFileRevisionSchema,
  LongForeshadowingBeatIdSchema,
  LongForeshadowingIdSchema,
  LongForeshadowingStatusSchema,
  LongLedgerCommitIdSchema,
  LongNarrativePlacementIdSchema,
  LongProjectRelativePathSchema,
  LongStableIdSchema
} from "./long-workspace";

const LedgerTimestampSchema = z.string().datetime();
const LedgerRevisionSchema = z.number().int().nonnegative();
const LedgerContentSchema = z.string().max(16 * 1024 * 1024);
const LedgerCommitMessageSchema = z.string().trim().max(4_000);
const LedgerSummaryTextSchema = z.string().trim().max(200_000);
const LedgerEvidenceNoteSchema = z.string().trim().max(4_000);
const RequiredLedgerCommitMessageSchema =
  LedgerCommitMessageSchema.min(1);
const RequiredLedgerSummaryTextSchema = LedgerSummaryTextSchema.min(1);
const RequiredLedgerEvidenceNoteSchema = LedgerEvidenceNoteSchema.min(1);

export const LongChapterSummarySchema = z
  .object({
    timeline: LedgerSummaryTextSchema,
    characterStates: LedgerSummaryTextSchema,
    factionStates: LedgerSummaryTextSchema,
    realmStates: LedgerSummaryTextSchema,
    foreshadowingStates: LedgerSummaryTextSchema,
    continuityNotes: LedgerSummaryTextSchema
  })
  .strict();
export type LongChapterSummary = z.infer<
  typeof LongChapterSummarySchema
>;

const EMPTY_LONG_CHAPTER_SUMMARY: LongChapterSummary = {
  timeline: "",
  characterStates: "",
  factionStates: "",
  realmStates: "",
  foreshadowingStates: "",
  continuityNotes: ""
};

export const LongRequiredChapterSummarySchema = z
  .object({
    timeline: RequiredLedgerSummaryTextSchema,
    characterStates: RequiredLedgerSummaryTextSchema,
    factionStates: RequiredLedgerSummaryTextSchema,
    realmStates: RequiredLedgerSummaryTextSchema,
    foreshadowingStates: RequiredLedgerSummaryTextSchema,
    continuityNotes: RequiredLedgerSummaryTextSchema
  })
  .strict();

export const LongLedgerExecutionDecisionSchema = z
  .object({
    status: LongExecutionStatusSchema,
    commitId: LongLedgerCommitIdSchema.nullable()
  })
  .strict();
export type LongLedgerExecutionDecision = z.infer<
  typeof LongLedgerExecutionDecisionSchema
>;

export const LongLedgerPlacementChangeSchema = z
  .object({
    placementId: LongNarrativePlacementIdSchema,
    before: LongLedgerExecutionDecisionSchema,
    after: LongLedgerExecutionDecisionSchema,
    note: LedgerEvidenceNoteSchema.default("")
  })
  .strict();
export type LongLedgerPlacementChange = z.infer<
  typeof LongLedgerPlacementChangeSchema
>;

export const LongLedgerForeshadowingBeatChangeSchema = z
  .object({
    /** Direct link to the owning item in the plot-design foreshadowing overview. */
    foreshadowingId: LongForeshadowingIdSchema.optional(),
    beatId: LongForeshadowingBeatIdSchema,
    before: LongLedgerExecutionDecisionSchema,
    after: LongLedgerExecutionDecisionSchema,
    note: LedgerEvidenceNoteSchema.default("")
  })
  .strict();
export type LongLedgerForeshadowingBeatChange = z.infer<
  typeof LongLedgerForeshadowingBeatChangeSchema
>;

export const LongLedgerForeshadowingThreadChangeSchema = z
  .object({
    foreshadowingId: LongForeshadowingIdSchema,
    before: LongForeshadowingStatusSchema,
    after: LongForeshadowingStatusSchema
  })
  .strict();
export type LongLedgerForeshadowingThreadChange = z.infer<
  typeof LongLedgerForeshadowingThreadChangeSchema
>;

export const LongLedgerFileStateSchema = z
  .object({
    revision: LongFileRevisionSchema,
    content: LedgerContentSchema
  })
  .strict();
export type LongLedgerFileState = z.infer<
  typeof LongLedgerFileStateSchema
>;

export const LongLedgerFileChangeSchema = z
  .object({
    fileId: LongFileIdSchema,
    path: LongProjectRelativePathSchema,
    mode: z.enum(["replace", "append"]).default("replace"),
    before: LongLedgerFileStateSchema,
    after: LongLedgerFileStateSchema
  })
  .strict();
export type LongLedgerFileChange = z.infer<
  typeof LongLedgerFileChangeSchema
>;

/**
 * Lightweight v4 audit metadata for a chapter continuity file. Text is kept
 * in the Markdown file itself and is intentionally not copied into the
 * ledger JSON record.
 */
export const LongLedgerContinuityFileAuditSchema = z
  .object({
    fileId: LongFileIdSchema,
    path: LongProjectRelativePathSchema,
    revision: LongFileRevisionSchema
  })
  .strict();
export type LongLedgerContinuityFileAudit = z.infer<
  typeof LongLedgerContinuityFileAuditSchema
>;

export const LongLedgerContinuityFilesAuditSchema = z
  .array(LongLedgerContinuityFileAuditSchema)
  .max(100_000)
  .superRefine((files, context) => {
    const fileIds = new Set<string>();
    const paths = new Set<string>();
    files.forEach((file, index) => {
      if (fileIds.has(file.fileId)) {
        context.addIssue({
          code: "custom",
          path: [index, "fileId"],
          message: "A continuity audit cannot contain the same file twice."
        });
      }
      fileIds.add(file.fileId);
      const portablePath = file.path
        .normalize("NFC")
        .toLocaleLowerCase("en-US");
      if (paths.has(portablePath)) {
        context.addIssue({
          code: "custom",
          path: [index, "path"],
          message:
            "A continuity audit cannot contain duplicate portable file paths."
        });
      }
      paths.add(portablePath);
    });
  });
export type LongLedgerContinuityFilesAudit = z.infer<
  typeof LongLedgerContinuityFilesAuditSchema
>;

export const LongLedgerCoverageStatusSchema = z.enum([
  "changed",
  "unchanged",
  "not_applicable"
]);
export type LongLedgerCoverageStatus = z.infer<
  typeof LongLedgerCoverageStatusSchema
>;

export const LongLedgerCoverageItemSchema = z
  .object({
    status: LongLedgerCoverageStatusSchema,
    note: LedgerEvidenceNoteSchema
  })
  .strict();
export type LongLedgerCoverageItem = z.infer<
  typeof LongLedgerCoverageItemSchema
>;

export const LongRequiredLedgerCoverageItemSchema = z
  .object({
    status: LongLedgerCoverageStatusSchema,
    note: RequiredLedgerEvidenceNoteSchema
  })
  .strict();

export const LongLedgerCoverageSchema = z
  .object({
    character: LongLedgerCoverageItemSchema,
    plot: LongLedgerCoverageItemSchema,
    foreshadowing: LongLedgerCoverageItemSchema,
    world: LongLedgerCoverageItemSchema,
    knowledge: LongLedgerCoverageItemSchema,
    openLoops: LongLedgerCoverageItemSchema
  })
  .strict();
export type LongLedgerCoverage = z.infer<
  typeof LongLedgerCoverageSchema
>;

export const LongRequiredLedgerCoverageSchema = z
  .object({
    character: LongRequiredLedgerCoverageItemSchema,
    plot: LongRequiredLedgerCoverageItemSchema,
    foreshadowing: LongRequiredLedgerCoverageItemSchema,
    world: LongRequiredLedgerCoverageItemSchema,
    knowledge: LongRequiredLedgerCoverageItemSchema,
    openLoops: LongRequiredLedgerCoverageItemSchema
  })
  .strict();

const EMPTY_LONG_LEDGER_COVERAGE: LongLedgerCoverage = {
  character: { status: "not_applicable", note: "" },
  plot: { status: "not_applicable", note: "" },
  foreshadowing: { status: "not_applicable", note: "" },
  world: { status: "not_applicable", note: "" },
  knowledge: { status: "not_applicable", note: "" },
  openLoops: { status: "not_applicable", note: "" }
};

const EmptyLongContinuityHandoffSchema = z
  .object({
    summary: z.literal(""),
    mustCarry: z.array(z.never()).max(0),
    nextChapterConstraints: z.array(z.never()).max(0),
    openLoops: z.array(z.never()).max(0)
  })
  .strict();

export const LongLedgerChapterOutputsSchema = z
  .object({
    characterState: LedgerSummaryTextSchema,
    handoff: z.union([
      LongContinuityHandoffSchema,
      EmptyLongContinuityHandoffSchema
    ])
  })
  .strict();
export type LongLedgerChapterOutputs = z.infer<
  typeof LongLedgerChapterOutputsSchema
>;

export const LongRequiredLedgerChapterOutputsSchema = z
  .object({
    characterState: RequiredLedgerSummaryTextSchema,
    handoff: LongContinuityHandoffSchema
  })
  .strict();
export type LongRequiredLedgerChapterOutputs = z.infer<
  typeof LongRequiredLedgerChapterOutputsSchema
>;

const EMPTY_LONG_LEDGER_CHAPTER_OUTPUTS: LongLedgerChapterOutputs = {
  characterState: "",
  handoff: {
    summary: "",
    mustCarry: [],
    nextChapterConstraints: [],
    openLoops: []
  }
};

export const LongLedgerFactMutationSchema = z
  .object({
    factId: LongContinuityFactIdSchema,
    domain: LongContinuityDomainSchema,
    subjectId: LongStableIdSchema,
    field: LongContinuityFactFieldSchema,
    value: RequiredLedgerSummaryTextSchema,
    evidence: RequiredLedgerEvidenceNoteSchema
  })
  .strict();
export type LongLedgerFactMutation = z.infer<
  typeof LongLedgerFactMutationSchema
>;

export const LongLedgerKnowledgeMutationSchema = z
  .object({
    factId: LongContinuityFactIdSchema,
    audienceType: LongContinuityAudienceTypeSchema,
    audienceId: LongStableIdSchema.nullable(),
    level: LongContinuityKnowledgeLevelSchema,
    evidence: RequiredLedgerEvidenceNoteSchema
  })
  .strict()
  .superRefine((mutation, context) => {
    if (
      (mutation.audienceType === "reader") !==
      (mutation.audienceId === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["audienceId"],
        message:
          "Reader knowledge must use a null audience id; character and faction knowledge require one."
      });
    }
    if (
      mutation.audienceType === "character" &&
      !mutation.audienceId?.startsWith("character_")
    ) {
      context.addIssue({
        code: "custom",
        path: ["audienceId"],
        message: "Character knowledge requires a stable character id."
      });
    }
  });
export type LongLedgerKnowledgeMutation = z.infer<
  typeof LongLedgerKnowledgeMutationSchema
>;

export const LongLedgerOpenLoopMutationSchema = z
  .object({
    loopId: LongContinuityOpenLoopIdSchema,
    kind: LongContinuityOpenLoopKindSchema,
    status: LongContinuityOpenLoopStatusSchema,
    detail: RequiredLedgerSummaryTextSchema,
    subjectId: LongStableIdSchema.nullable().default(null),
    factId: LongContinuityFactIdSchema.nullable().default(null),
    evidence: RequiredLedgerEvidenceNoteSchema
  })
  .strict();
export type LongLedgerOpenLoopMutation = z.infer<
  typeof LongLedgerOpenLoopMutationSchema
>;

export const LongLedgerFactChangeSchema = z
  .object({
    before: LongContinuityFactSchema.nullable(),
    after: LongContinuityFactSchema
  })
  .strict()
  .superRefine((change, context) => {
    if (
      change.before &&
      (change.before.factId !== change.after.factId ||
        change.before.domain !== change.after.domain ||
        change.before.subjectId !== change.after.subjectId ||
        change.before.field !== change.after.field)
    ) {
      context.addIssue({
        code: "custom",
        path: ["before"],
        message: "A continuity fact change cannot change its logical key."
      });
    }
  });
export type LongLedgerFactChange = z.infer<
  typeof LongLedgerFactChangeSchema
>;

export const LongLedgerKnowledgeChangeSchema = z
  .object({
    before: LongContinuityKnowledgeSchema.nullable(),
    after: LongContinuityKnowledgeSchema
  })
  .strict()
  .superRefine((change, context) => {
    if (
      change.before &&
      (change.before.factId !== change.after.factId ||
        change.before.audienceType !== change.after.audienceType ||
        change.before.audienceId !== change.after.audienceId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["before"],
        message: "A continuity knowledge change cannot change its logical key."
      });
    }
  });
export type LongLedgerKnowledgeChange = z.infer<
  typeof LongLedgerKnowledgeChangeSchema
>;

export const LongLedgerOpenLoopChangeSchema = z
  .object({
    before: LongContinuityOpenLoopSchema.nullable(),
    after: LongContinuityOpenLoopSchema
  })
  .strict()
  .superRefine((change, context) => {
    if (
      change.before &&
      change.before.loopId !== change.after.loopId
    ) {
      context.addIssue({
        code: "custom",
        path: ["before", "loopId"],
        message: "A continuity open-loop change cannot change its id."
      });
    }
  });
export type LongLedgerOpenLoopChange = z.infer<
  typeof LongLedgerOpenLoopChangeSchema
>;

/**
 * The record contains the exact before/after values needed for deterministic
 * last-commit rollback. It is an audit record, not an alternate workspace
 * index, so unrelated structure is never duplicated.
 */
export const LongLedgerCommitRecordSchema = z
  .object({
    schemaVersion: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4)
    ]),
    id: LongLedgerCommitIdSchema,
    bookId: LongBookIdSchema,
    sequence: z.number().int().positive(),
    chapterCardId: LongChapterCardIdSchema,
    committedAt: LedgerTimestampSchema,
    /**
     * Defaults preserve compatibility with schemaVersion 1 records written
     * before continuity summaries became part of the permanent audit trail.
     */
    commitMessage: LedgerCommitMessageSchema.default(""),
    chapterSummary: LongChapterSummarySchema.default(
      EMPTY_LONG_CHAPTER_SUMMARY
    ),
    reversible: z.boolean(),
    sourceWorkspaceRevision: LedgerRevisionSchema,
    committedWorkspaceRevision: LedgerRevisionSchema,
    sourceProjectRevision: LedgerRevisionSchema,
    committedProjectRevision: LedgerRevisionSchema,
    previousCommittedThroughChapterId:
      LongChapterCardIdSchema.nullable(),
    committedThroughChapterId: LongChapterCardIdSchema.nullable(),
    previousChapterCommitId: LongLedgerCommitIdSchema.nullable(),
    placementChanges: z
      .array(LongLedgerPlacementChangeSchema)
      .max(100_000),
    foreshadowingBeatChanges: z
      .array(LongLedgerForeshadowingBeatChangeSchema)
      .max(100_000),
    foreshadowingThreadChanges: z
      .array(LongLedgerForeshadowingThreadChangeSchema)
      .max(100_000)
      .default([]),
    fileChanges: z.array(LongLedgerFileChangeSchema).max(1_024),
    continuityFiles: LongLedgerContinuityFilesAuditSchema.default([]),
    coverage: LongLedgerCoverageSchema.default(
      EMPTY_LONG_LEDGER_COVERAGE
    ),
    factChanges: z
      .array(LongLedgerFactChangeSchema)
      .max(200_000)
      .default([]),
    knowledgeChanges: z
      .array(LongLedgerKnowledgeChangeSchema)
      .max(400_000)
      .default([]),
    openLoopChanges: z
      .array(LongLedgerOpenLoopChangeSchema)
      .max(200_000)
      .default([]),
    chapterOutputs: LongLedgerChapterOutputsSchema.default(
      EMPTY_LONG_LEDGER_CHAPTER_OUTPUTS
    )
  })
  .strict()
  .superRefine((record, context) => {
    if (record.schemaVersion >= 2) {
      if (record.commitMessage.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["commitMessage"],
          message: "A current ledger record requires a non-empty commit message."
        });
      }
    }
    if (record.schemaVersion === 2 || record.schemaVersion === 3) {
      for (const key of Object.keys(
        record.chapterSummary
      ) as Array<keyof LongChapterSummary>) {
        if (record.chapterSummary[key].length === 0) {
          context.addIssue({
            code: "custom",
            path: ["chapterSummary", key],
            message:
              "A current ledger record requires all six continuity summaries."
          });
        }
      }
      for (const [index, change] of record.placementChanges.entries()) {
        if (change.note.length === 0) {
          context.addIssue({
            code: "custom",
            path: ["placementChanges", index, "note"],
            message:
              "A current ledger placement decision requires an evidence note."
          });
        }
      }
      for (const [
        index,
        change
      ] of record.foreshadowingBeatChanges.entries()) {
        if (change.note.length === 0) {
          context.addIssue({
            code: "custom",
            path: ["foreshadowingBeatChanges", index, "note"],
            message:
              "A current ledger beat decision requires an evidence note."
          });
        }
      }
    }
    if (record.schemaVersion === 4) {
      if (record.continuityFiles.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["continuityFiles"],
          message:
            "A v4 ledger record requires at least one continuity file revision."
        });
      }
      if (record.fileChanges.length !== 0) {
        context.addIssue({
          code: "custom",
          path: ["fileChanges"],
          message:
            "A v4 ledger record stores lightweight file revisions instead of copied text."
        });
      }
    }
    if (record.schemaVersion === 3) {
      for (const [key, item] of Object.entries(record.coverage)) {
        if (item.note.length === 0) {
          context.addIssue({
            code: "custom",
            path: ["coverage", key, "note"],
            message:
              "A v3 ledger record requires a non-empty note for every coverage domain."
          });
        }
      }
      if (
        record.chapterOutputs.characterState.length === 0 ||
        record.chapterOutputs.handoff.summary.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["chapterOutputs"],
          message:
            "A v3 ledger record requires non-empty character state and handoff outputs."
        });
      }
      record.factChanges.forEach((change, index) => {
        if (
          change.after.sourceCommitId !== record.id ||
          change.after.sourceChapterCardId !== record.chapterCardId
        ) {
          context.addIssue({
            code: "custom",
            path: ["factChanges", index, "after"],
            message:
              "A v3 fact change must carry this commit and chapter as its source."
          });
        }
      });
      record.knowledgeChanges.forEach((change, index) => {
        if (
          change.after.sourceCommitId !== record.id ||
          change.after.sourceChapterCardId !== record.chapterCardId
        ) {
          context.addIssue({
            code: "custom",
            path: ["knowledgeChanges", index, "after"],
            message:
              "A v3 knowledge change must carry this commit and chapter as its source."
          });
        }
      });
      record.openLoopChanges.forEach((change, index) => {
        if (
          change.after.sourceCommitId !== record.id ||
          change.after.sourceChapterCardId !== record.chapterCardId
        ) {
          context.addIssue({
            code: "custom",
            path: ["openLoopChanges", index, "after"],
            message:
              "A v3 open-loop change must carry this commit and chapter as its source."
          });
        }
      });
    }
    if (
      record.committedWorkspaceRevision !==
      record.sourceWorkspaceRevision + 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["committedWorkspaceRevision"],
        message: "A ledger commit must advance the workspace revision once."
      });
    }
    if (
      record.committedProjectRevision !==
      record.sourceProjectRevision + 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["committedProjectRevision"],
        message: "A ledger commit must advance the project revision once."
      });
    }
    for (const [index, change] of record.placementChanges.entries()) {
      if (
        change.after.commitId !== record.id ||
        (change.after.status !== "committed" &&
          change.after.status !== "missed")
      ) {
        context.addIssue({
          code: "custom",
          path: ["placementChanges", index, "after"],
          message:
            "Committed placement decisions must reference this ledger commit."
        });
      }
    }
    const placementIds = record.placementChanges.map(
      ({ placementId }) => placementId
    );
    if (new Set(placementIds).size !== placementIds.length) {
      context.addIssue({
        code: "custom",
        path: ["placementChanges"],
        message: "A ledger record cannot decide the same placement twice."
      });
    }
    for (const [index, change] of record.foreshadowingBeatChanges.entries()) {
      if (
        change.after.commitId !== record.id ||
        (change.after.status !== "committed" &&
          change.after.status !== "missed")
      ) {
        context.addIssue({
          code: "custom",
          path: ["foreshadowingBeatChanges", index, "after"],
          message:
            "Committed foreshadowing decisions must reference this ledger commit."
        });
      }
    }
    const beatIds = record.foreshadowingBeatChanges.map(
      ({ beatId }) => beatId
    );
    if (new Set(beatIds).size !== beatIds.length) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingBeatChanges"],
        message:
          "A ledger record cannot decide the same foreshadowing beat twice."
      });
    }
    const changedThreadIds = record.foreshadowingThreadChanges.map(
      ({ foreshadowingId }) => foreshadowingId
    );
    if (new Set(changedThreadIds).size !== changedThreadIds.length) {
      context.addIssue({
        code: "custom",
        path: ["foreshadowingThreadChanges"],
        message:
          "A ledger record cannot change the same foreshadowing thread twice."
      });
    }
    const fileIds = record.fileChanges.map(({ fileId }) => fileId);
    if (new Set(fileIds).size !== fileIds.length) {
      context.addIssue({
        code: "custom",
        path: ["fileChanges"],
        message: "A ledger record cannot change the same file twice."
      });
    }
    const contentCharacters = record.fileChanges.reduce(
      (total, change) =>
        total + change.before.content.length + change.after.content.length,
      0
    );
    if (contentCharacters > 64 * 1024 * 1024) {
      context.addIssue({
        code: "custom",
        path: ["fileChanges"],
        message: "Ledger rollback content exceeds the 64 MiB safety budget."
      });
    }
    const factIds = record.factChanges.map(
      ({ after }) => after.factId
    );
    const factKeys = record.factChanges.map(
      ({ after }) =>
        `${after.domain}\0${after.subjectId}\0${after.field.normalize("NFC")}`
    );
    if (
      new Set(factIds).size !== factIds.length ||
      new Set(factKeys).size !== factKeys.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["factChanges"],
        message:
          "A ledger record cannot change the same continuity fact key twice."
      });
    }
    const knowledgeKeys = record.knowledgeChanges.map(
      ({ after }) =>
        `${after.factId}\0${after.audienceType}\0${after.audienceId ?? ""}`
    );
    if (new Set(knowledgeKeys).size !== knowledgeKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["knowledgeChanges"],
        message:
          "A ledger record cannot change the same knowledge key twice."
      });
    }
    const loopIds = record.openLoopChanges.map(
      ({ after }) => after.loopId
    );
    if (new Set(loopIds).size !== loopIds.length) {
      context.addIssue({
        code: "custom",
        path: ["openLoopChanges"],
        message:
          "A ledger record cannot change the same open loop twice."
      });
    }
  });
export type LongLedgerCommitRecord = z.infer<
  typeof LongLedgerCommitRecordSchema
>;

export const LongChapterFileWriteSchema = z
  .object({
    content: LedgerContentSchema,
    baseRevision: LongFileRevisionSchema
  })
  .strict();
export type LongChapterFileWrite = z.infer<
  typeof LongChapterFileWriteSchema
>;

export const LongWriteChapterInputSchema = z
  .object({
    bookId: LongBookIdSchema,
    chapterCardId: LongChapterCardIdSchema,
    body: LongChapterFileWriteSchema,
    characterState: LongChapterFileWriteSchema,
    handoff: LongChapterFileWriteSchema,
    baseWorkspaceRevision: LedgerRevisionSchema,
    baseProjectRevision: LedgerRevisionSchema
  })
  .strict();
export type LongWriteChapterInput = z.infer<
  typeof LongWriteChapterInputSchema
>;

export const LongWriteChapterResultSchema = z
  .object({
    bookId: LongBookIdSchema,
    chapterCardId: LongChapterCardIdSchema,
    bodyRevision: LongFileRevisionSchema,
    characterStateRevision: LongFileRevisionSchema,
    handoffRevision: LongFileRevisionSchema,
    workspaceRevision: LedgerRevisionSchema,
    projectRevision: LedgerRevisionSchema
  })
  .strict();
export type LongWriteChapterResult = z.infer<
  typeof LongWriteChapterResultSchema
>;

export const LongCommitExecutionDecisionInputSchema = z
  .object({
    status: z.enum(["committed", "missed"]),
    note: RequiredLedgerEvidenceNoteSchema
  })
  .strict();

export const LongChapterFileRevisionSnapshotSchema = z
  .object({
    body: LongFileRevisionSchema,
    characterState: LongFileRevisionSchema,
    handoff: LongFileRevisionSchema
  })
  .strict();
export type LongChapterFileRevisionSnapshot = z.infer<
  typeof LongChapterFileRevisionSnapshotSchema
>;

export const LongTextChapterFileRevisionSnapshotSchema = z
  .object({
    body: LongFileRevisionSchema
  })
  .strict();
export type LongTextChapterFileRevisionSnapshot = z.infer<
  typeof LongTextChapterFileRevisionSnapshotSchema
>;

export const LongContinuityFileRevisionSchema = z
  .object({
    fileId: LongFileIdSchema,
    revision: LongFileRevisionSchema
  })
  .strict();
export type LongContinuityFileRevision = z.infer<
  typeof LongContinuityFileRevisionSchema
>;

export const LongContinuityFileRevisionsSchema = z
  .array(LongContinuityFileRevisionSchema)
  .min(1)
  .max(100_000)
  .superRefine((files, context) => {
    const fileIds = new Set<string>();
    files.forEach((file, index) => {
      if (fileIds.has(file.fileId)) {
        context.addIssue({
          code: "custom",
          path: [index, "fileId"],
          message:
            "A text-file commit cannot include the same continuity file twice."
        });
      }
      fileIds.add(file.fileId);
    });
  });
export type LongContinuityFileRevisions = z.infer<
  typeof LongContinuityFileRevisionsSchema
>;

const LongStructuredCommitChapterInputSchema = z
  .object({
    mode: z.literal("structured").default("structured"),
    bookId: LongBookIdSchema,
    chapterCardId: LongChapterCardIdSchema,
    chapterFileRevisions: LongChapterFileRevisionSnapshotSchema,
    commitMessage: RequiredLedgerCommitMessageSchema,
    chapterSummary: LongRequiredChapterSummarySchema,
    placementDecisions: z
      .record(
        LongNarrativePlacementIdSchema,
        LongCommitExecutionDecisionInputSchema
      )
      .default({}),
    foreshadowingBeatDecisions: z
      .record(
        LongForeshadowingBeatIdSchema,
        LongCommitExecutionDecisionInputSchema
      )
      .default({}),
    fileUpdates: z
      .array(
        z
          .object({
            fileId: LongFileIdSchema,
            content: LedgerContentSchema,
            baseRevision: LongFileRevisionSchema,
            mode: z.enum(["replace", "append"]).default("replace")
          })
          .strict()
      )
      .max(1_024)
      .default([]),
    coverage: LongLedgerCoverageSchema.default(
      EMPTY_LONG_LEDGER_COVERAGE
    ),
    factMutations: z
      .array(LongLedgerFactMutationSchema)
      .max(200_000)
      .default([]),
    knowledgeMutations: z
      .array(LongLedgerKnowledgeMutationSchema)
      .max(400_000)
      .default([]),
    openLoopMutations: z
      .array(LongLedgerOpenLoopMutationSchema)
      .max(200_000)
      .default([]),
    chapterOutputs: LongLedgerChapterOutputsSchema.default(
      EMPTY_LONG_LEDGER_CHAPTER_OUTPUTS
    ),
    baseWorkspaceRevision: LedgerRevisionSchema,
    baseProjectRevision: LedgerRevisionSchema
  })
  .strict()
  .superRefine((input, context) => {
    const factIds = input.factMutations.map(({ factId }) => factId);
    const factKeys = input.factMutations.map(
      ({ domain, subjectId, field }) =>
        `${domain}\0${subjectId}\0${field.normalize("NFC")}`
    );
    if (
      new Set(factIds).size !== factIds.length ||
      new Set(factKeys).size !== factKeys.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["factMutations"],
        message:
          "A ledger commit cannot mutate the same continuity fact key twice."
      });
    }
    const knowledgeKeys = input.knowledgeMutations.map(
      ({ factId, audienceType, audienceId }) =>
        `${factId}\0${audienceType}\0${audienceId ?? ""}`
    );
    if (new Set(knowledgeKeys).size !== knowledgeKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["knowledgeMutations"],
        message:
          "A ledger commit cannot mutate the same knowledge key twice."
      });
    }
    const loopIds = input.openLoopMutations.map(({ loopId }) => loopId);
    if (new Set(loopIds).size !== loopIds.length) {
      context.addIssue({
        code: "custom",
        path: ["openLoopMutations"],
        message:
          "A ledger commit cannot mutate the same open loop twice."
      });
    }
  });

export const LongTextFilesCommitChapterInputSchema = z
  .object({
    mode: z.literal("text_files"),
    bookId: LongBookIdSchema,
    chapterCardId: LongChapterCardIdSchema,
    chapterFileRevisions: LongTextChapterFileRevisionSnapshotSchema,
    continuityFileRevisions: LongContinuityFileRevisionsSchema,
    foreshadowingBeatDecisions: z
      .record(
        LongForeshadowingBeatIdSchema,
        LongCommitExecutionDecisionInputSchema
      )
      .default({}),
    commitMessage: RequiredLedgerCommitMessageSchema,
    baseWorkspaceRevision: LedgerRevisionSchema,
    baseProjectRevision: LedgerRevisionSchema
  })
  .strict();
export type LongTextFilesCommitChapterInput = z.infer<
  typeof LongTextFilesCommitChapterInputSchema
>;

export const LongCommitChapterInputSchema = z.union([
  LongStructuredCommitChapterInputSchema,
  LongTextFilesCommitChapterInputSchema
]);
export type LongCommitChapterInput = z.infer<
  typeof LongCommitChapterInputSchema
>;

export const LongCommitChapterResultSchema = z
  .object({
    record: LongLedgerCommitRecordSchema,
    workspaceRevision: LedgerRevisionSchema,
    projectRevision: LedgerRevisionSchema
  })
  .strict();
export type LongCommitChapterResult = z.infer<
  typeof LongCommitChapterResultSchema
>;

export const LongRollbackLastCommitInputSchema = z
  .object({
    bookId: LongBookIdSchema,
    expectedCommitId: LongLedgerCommitIdSchema,
    baseWorkspaceRevision: LedgerRevisionSchema,
    baseProjectRevision: LedgerRevisionSchema
  })
  .strict();
export type LongRollbackLastCommitInput = z.infer<
  typeof LongRollbackLastCommitInputSchema
>;

export const LongRollbackLastCommitResultSchema = z
  .object({
    bookId: LongBookIdSchema,
    rolledBackCommitId: LongLedgerCommitIdSchema,
    committedThroughChapterId: LongChapterCardIdSchema.nullable(),
    workspaceRevision: LedgerRevisionSchema,
    projectRevision: LedgerRevisionSchema
  })
  .strict();
export type LongRollbackLastCommitResult = z.infer<
  typeof LongRollbackLastCommitResultSchema
>;
