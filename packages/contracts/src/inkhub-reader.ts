import { z } from "zod";
import {
  InkHubDeepQualityCancelRequestSchema,
  InkHubDeepQualityRequestSchema
} from "./inkhub-deep-quality";

export const INKHUB_REPAIR_IPC_CHANNEL = "inkhub:repair";

export const InkHubNovelIndexStatusSchema = z.enum(["not-indexed", "indexing", "ready", "partial", "failed", "stale"]);
export type InkHubNovelIndexStatus = z.infer<typeof InkHubNovelIndexStatusSchema>;

export const InkHubNovelIndexSummarySchema = z.object({
  entryId: z.string().min(1),
  status: InkHubNovelIndexStatusSchema,
  documentCount: z.number().int().nonnegative(),
  indexedDocumentCount: z.number().int().nonnegative(),
  skippedDocumentCount: z.number().int().nonnegative(),
  chapterCount: z.number().int().nonnegative(),
  totalCharacters: z.number().int().nonnegative(),
  contentComplete: z.boolean(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  indexedAt: z.string().datetime().nullable(),
  warnings: z.array(z.string().min(1).max(1_000)).max(200)
}).strict();
export type InkHubNovelIndexSummary = z.infer<typeof InkHubNovelIndexSummarySchema>;

export const InkHubNovelChapterSchema = z.object({
  id: z.string().min(1).max(128),
  entryId: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  title: z.string().min(1).max(500),
  volumeTitle: z.string().min(1).max(500).nullable(),
  relativePath: z.string().min(1).max(4_000),
  characterCount: z.number().int().nonnegative(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  updatedAt: z.string().datetime()
}).strict();
export type InkHubNovelChapter = z.infer<typeof InkHubNovelChapterSchema>;

export const InkHubNovelChapterCatalogSchema = z.object({
  summary: InkHubNovelIndexSummarySchema,
  chapters: z.array(InkHubNovelChapterSchema).max(500),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  nextOffset: z.number().int().positive().nullable()
}).strict();
export type InkHubNovelChapterCatalog = z.infer<typeof InkHubNovelChapterCatalogSchema>;

export const InkHubNovelChapterPageSchema = z.object({
  entryId: z.string().min(1),
  chapterId: z.string().min(1).max(128),
  title: z.string().min(1).max(500),
  content: z.string().max(200_000),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  totalCharacters: z.number().int().nonnegative(),
  nextOffset: z.number().int().positive().nullable(),
  previousChapterId: z.string().min(1).max(128).nullable(),
  nextChapterId: z.string().min(1).max(128).nullable(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  readOnly: z.literal(true)
}).strict().superRefine((value, context) => {
  if (value.endOffset < value.startOffset || value.endOffset > value.totalCharacters) {
    context.addIssue({ code: "custom", path: ["endOffset"], message: "Chapter page offsets are invalid." });
  }
  if ((value.nextOffset === null) !== (value.endOffset === value.totalCharacters)) {
    context.addIssue({ code: "custom", path: ["nextOffset"], message: "Chapter page cursor does not match the page boundary." });
  }
});
export type InkHubNovelChapterPage = z.infer<typeof InkHubNovelChapterPageSchema>;

export const InkHubNovelSearchResultSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["chapter", "reference"]),
  title: z.string().min(1).max(500),
  relativePath: z.string().min(1).max(4_000),
  chapterId: z.string().min(1).max(128).nullable(),
  snippet: z.string().max(1_200),
  score: z.number().finite(),
  matchStart: z.number().int().nonnegative(),
  matchEnd: z.number().int().positive()
}).strict().superRefine((value, context) => {
  if (value.matchEnd <= value.matchStart) {
    context.addIssue({ code: "custom", path: ["matchEnd"], message: "Search evidence range must be non-empty." });
  }
});
export type InkHubNovelSearchResult = z.infer<typeof InkHubNovelSearchResultSchema>;

export const InkHubNovelSearchResponseSchema = z.object({
  entryId: z.string().min(1),
  query: z.string().min(1).max(200),
  results: z.array(InkHubNovelSearchResultSchema).max(50)
}).strict();
export type InkHubNovelSearchResponse = z.infer<typeof InkHubNovelSearchResponseSchema>;

export const InkHubNovelReadingProgressSchema = z.object({
  entryId: z.string().min(1),
  chapterId: z.string().min(1).max(128),
  characterOffset: z.number().int().nonnegative(),
  scrollFraction: z.number().min(0).max(1),
  updatedAt: z.string().datetime()
}).strict();
export type InkHubNovelReadingProgress = z.infer<typeof InkHubNovelReadingProgressSchema>;

export const InkHubNovelQualityIssueSchema = z.object({
  id: z.string().min(1),
  rule: z.enum(["duplicate-paragraph", "empty-chapter", "very-short-chapter", "chapter-order-gap"]),
  severity: z.enum(["info", "warning", "error"]),
  title: z.string().min(1).max(500),
  detail: z.string().min(1).max(2_000),
  chapterIds: z.array(z.string().min(1).max(128)).max(20)
}).strict();
export type InkHubNovelQualityIssue = z.infer<typeof InkHubNovelQualityIssueSchema>;

export const InkHubNovelQualityReportSchema = z.object({
  entryId: z.string().min(1),
  generatedAt: z.string().datetime(),
  localOnly: z.literal(true),
  coverage: InkHubNovelIndexSummarySchema,
  issues: z.array(InkHubNovelQualityIssueSchema).max(5_000)
}).strict();
export type InkHubNovelQualityReport = z.infer<typeof InkHubNovelQualityReportSchema>;

export const InkHubNovelChapterRepairInputSchema = z.object({
  entryId: z.string().min(1),
  chapterId: z.string().min(1).max(128),
  expectedSourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  content: z.string().min(1).max(2_000_000),
  confirmWrite: z.literal(true)
}).strict();
export type InkHubNovelChapterRepairInput = z.infer<typeof InkHubNovelChapterRepairInputSchema>;

export const InkHubNovelChapterRepairResultSchema = z.object({
  entryId: z.string().min(1),
  relativePath: z.string().min(1).max(4_000),
  backupCreated: z.literal(true),
  appliedAt: z.string().datetime(),
  summary: InkHubNovelIndexSummarySchema
}).strict();
export type InkHubNovelChapterRepairResult = z.infer<typeof InkHubNovelChapterRepairResultSchema>;

export const INKHUB_AI_REPAIR_MAX_PROPOSALS = 500;
export const INKHUB_AI_REPAIR_MAX_TOTAL_CHARACTERS = 20_000_000;

export const InkHubNovelAiRepairCapabilitySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120)
}).strict();
export type InkHubNovelAiRepairCapability = z.infer<typeof InkHubNovelAiRepairCapabilitySchema>;

export const InkHubNovelAiRepairProposalSchema = z.object({
  id: z.string().min(1).max(160),
  chapterId: z.string().min(1).max(128),
  chapterTitle: z.string().min(1).max(500),
  volumeTitle: z.string().min(1).max(500).nullable(),
  relativePath: z.string().min(1).max(4_000),
  expectedSourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  issueIds: z.array(z.string().min(1).max(200)).min(1).max(200),
  originalContent: z.string().min(1).max(2_000_000),
  proposedContent: z.string().min(1).max(2_000_000),
  rationale: z.string().min(1).max(2_000),
  agents: z.array(InkHubNovelAiRepairCapabilitySchema).min(1).max(12),
  skills: z.array(InkHubNovelAiRepairCapabilitySchema).min(1).max(12)
}).strict();
export type InkHubNovelAiRepairProposal = z.infer<typeof InkHubNovelAiRepairProposalSchema>;

export const InkHubNovelAiRepairPlanSchema = z.object({
  id: z.string().min(1).max(160),
  entryId: z.string().min(1),
  generatedAt: z.string().datetime(),
  modelId: z.string().min(1).max(240),
  modelLabel: z.string().min(1).max(120),
  issueCount: z.number().int().nonnegative().max(5_000),
  warnings: z.array(z.string().min(1).max(1_000)).max(100),
  proposals: z.array(InkHubNovelAiRepairProposalSchema).max(INKHUB_AI_REPAIR_MAX_PROPOSALS)
}).strict().superRefine((value, context) => {
  const total = value.proposals.reduce(
    (sum, proposal) => sum + proposal.originalContent.length + proposal.proposedContent.length,
    0
  );
  if (total > INKHUB_AI_REPAIR_MAX_TOTAL_CHARACTERS) {
    context.addIssue({
      code: "custom",
      path: ["proposals"],
      message: "AI repair plan aggregate content exceeds the total safety limit."
    });
  }
});
export type InkHubNovelAiRepairPlan = z.infer<typeof InkHubNovelAiRepairPlanSchema>;

export const InkHubNovelAiRepairRequestSchema = z.object({
  entryId: z.string().min(1),
  modelId: z.string().min(1).max(120).optional(),
  confirmBillable: z.literal(true)
}).strict();
export type InkHubNovelAiRepairRequest = z.infer<typeof InkHubNovelAiRepairRequestSchema>;

export const InkHubNovelAiRepairProgressSchema = z.object({
  entryId: z.string().min(1),
  stage: z.enum(["preparing", "generating", "paused", "completed", "failed", "cancelled"]),
  completedBatches: z.number().int().nonnegative(),
  totalBatches: z.number().int().nonnegative(),
  completedChapters: z.number().int().nonnegative(),
  totalChapters: z.number().int().nonnegative(),
  message: z.string().min(1).max(500),
  updatedAt: z.string().datetime()
}).strict().superRefine((value, context) => {
  if (value.completedBatches > value.totalBatches || value.completedChapters > value.totalChapters) {
    context.addIssue({ code: "custom", message: "AI repair progress exceeds its declared totals." });
  }
});
export type InkHubNovelAiRepairProgress = z.infer<typeof InkHubNovelAiRepairProgressSchema>;

export const InkHubNovelAiRepairTaskSchema = z.object({
  entryId: z.string().min(1),
  status: z.enum(["running", "paused", "completed", "failed", "cancelled", "consumed"]),
  sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  requestedModelId: z.string().min(1).max(120).nullable(),
  progress: InkHubNovelAiRepairProgressSchema,
  plan: InkHubNovelAiRepairPlanSchema,
  lastError: z.string().min(1).max(2_000).nullable(),
  updatedAt: z.string().datetime()
}).strict();
export type InkHubNovelAiRepairTask = z.infer<typeof InkHubNovelAiRepairTaskSchema>;

export const InkHubNovelAiRepairCancelRequestSchema = z.object({
  entryId: z.string().min(1),
  confirmCancel: z.literal(true)
}).strict();
export type InkHubNovelAiRepairCancelRequest = z.infer<typeof InkHubNovelAiRepairCancelRequestSchema>;

export const InkHubNovelAiRepairModelOutputSchema = z.object({
  repairs: z.array(z.object({
    chapterId: z.string().min(1).max(128),
    content: z.string().min(1).max(2_000_000),
    rationale: z.string().min(1).max(2_000)
  }).strict()).min(1).max(8)
}).strict();
export type InkHubNovelAiRepairModelOutput = z.infer<typeof InkHubNovelAiRepairModelOutputSchema>;

export const InkHubNovelBatchRepairItemSchema = z.object({
  chapterId: z.string().min(1).max(128),
  expectedSourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  content: z.string().min(1).max(2_000_000)
}).strict();
export type InkHubNovelBatchRepairItem = z.infer<typeof InkHubNovelBatchRepairItemSchema>;

export const InkHubNovelBatchRepairInputSchema = z.object({
  entryId: z.string().min(1),
  confirmWrite: z.literal(true),
  repairs: z.array(InkHubNovelBatchRepairItemSchema).min(1).max(INKHUB_AI_REPAIR_MAX_PROPOSALS)
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  let total = 0;
  value.repairs.forEach((repair, index) => {
    if (ids.has(repair.chapterId)) {
      context.addIssue({
        code: "custom",
        path: ["repairs", index, "chapterId"],
        message: "Each chapter may appear only once in a batch repair."
      });
    }
    ids.add(repair.chapterId);
    total += repair.content.length;
  });
  if (total > INKHUB_AI_REPAIR_MAX_TOTAL_CHARACTERS) {
    context.addIssue({
      code: "custom",
      path: ["repairs"],
      message: "Batch repair aggregate content exceeds the total safety limit."
    });
  }
});
export type InkHubNovelBatchRepairInput = z.infer<typeof InkHubNovelBatchRepairInputSchema>;

export const InkHubNovelBatchRepairResultSchema = z.object({
  entryId: z.string().min(1),
  appliedChapterCount: z.number().int().positive(),
  appliedFileCount: z.number().int().positive(),
  backupsCreated: z.number().int().positive(),
  appliedAt: z.string().datetime(),
  summary: InkHubNovelIndexSummarySchema,
  reaudit: z.object({
    generatedAt: z.string().datetime(),
    beforeIssueCount: z.number().int().nonnegative(),
    afterIssueCount: z.number().int().nonnegative(),
    resolvedIssueIds: z.array(z.string().min(1).max(200)).max(5_000),
    remainingIssueIds: z.array(z.string().min(1).max(200)).max(5_000),
    newIssueIds: z.array(z.string().min(1).max(200)).max(5_000)
  }).strict().optional()
}).strict();
export type InkHubNovelBatchRepairResult = z.infer<typeof InkHubNovelBatchRepairResultSchema>;

export const InkHubRepairIpcRequestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("getNovelDeepQualityProgress"),
    entryId: z.string().min(1)
  }).strict(),
  z.object({
    operation: z.literal("getNovelDeepQualityTask"),
    entryId: z.string().min(1)
  }).strict(),
  z.object({
    operation: z.literal("runNovelDeepQuality"),
    input: InkHubDeepQualityRequestSchema
  }).strict(),
  z.object({
    operation: z.literal("resumeNovelDeepQuality"),
    input: InkHubDeepQualityRequestSchema
  }).strict(),
  z.object({
    operation: z.literal("cancelNovelDeepQuality"),
    input: InkHubDeepQualityCancelRequestSchema
  }).strict(),
  z.object({
    operation: z.literal("getNovelAiRepairProgress"),
    entryId: z.string().min(1)
  }).strict(),
  z.object({
    operation: z.literal("getNovelAiRepairTask"),
    entryId: z.string().min(1)
  }).strict(),
  z.object({
    operation: z.literal("generateNovelAiRepairs"),
    input: InkHubNovelAiRepairRequestSchema
  }).strict(),
  z.object({
    operation: z.literal("resumeNovelAiRepairs"),
    input: InkHubNovelAiRepairRequestSchema
  }).strict(),
  z.object({
    operation: z.literal("cancelNovelAiRepairs"),
    input: InkHubNovelAiRepairCancelRequestSchema
  }).strict(),
  z.object({
    operation: z.literal("applyNovelChapterRepairs"),
    input: InkHubNovelBatchRepairInputSchema
  }).strict()
]);
export type InkHubRepairIpcRequest = z.infer<typeof InkHubRepairIpcRequestSchema>;

export const InkHubNovelContextPacketSchema = z.object({
  entryId: z.string().min(1),
  purpose: z.enum(["quality-check", "continue-writing"]),
  generatedAt: z.string().datetime(),
  indexSummary: InkHubNovelIndexSummarySchema,
  prompt: z.string().min(1).max(20_000),
  excerpts: z.array(z.object({
    chapterId: z.string().min(1).max(128).nullable(),
    title: z.string().min(1).max(500),
    relativePath: z.string().min(1).max(4_000),
    content: z.string().max(5_000)
  }).strict()).max(32)
}).strict();
export type InkHubNovelContextPacket = z.infer<typeof InkHubNovelContextPacketSchema>;
