import { z } from "zod";

export const INKHUB_STORY_KERNEL_IPC_CHANNEL = "inkhub:story-kernel";

export const InkHubStoryEvidenceSchema = z.object({
  chapterId: z.string().min(1).max(128),
  chapterTitle: z.string().min(1).max(500),
  volumeTitle: z.string().min(1).max(500).nullable(),
  relativePath: z.string().min(1).max(4_000),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  excerpt: z.string().min(1).max(1_200)
}).strict().superRefine((value, context) => {
  if (value.endOffset <= value.startOffset) {
    context.addIssue({ code: "custom", path: ["endOffset"], message: "Evidence range must be non-empty." });
  }
});
export type InkHubStoryEvidence = z.infer<typeof InkHubStoryEvidenceSchema>;

export const InkHubStoryFactCategorySchema = z.enum([
  "character", "event", "relationship", "location", "item", "knowledge", "foreshadowing"
]);
export type InkHubStoryFactCategory = z.infer<typeof InkHubStoryFactCategorySchema>;

export const InkHubStoryFactSchema = z.object({
  id: z.string().min(1).max(160),
  category: InkHubStoryFactCategorySchema,
  subject: z.string().min(1).max(300),
  predicate: z.string().min(1).max(300),
  object: z.string().min(1).max(1_000),
  status: z.enum(["active", "resolved", "superseded", "uncertain"]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(InkHubStoryEvidenceSchema).min(1).max(12)
}).strict();
export type InkHubStoryFact = z.infer<typeof InkHubStoryFactSchema>;

export const InkHubStoryChapterStateSchema = z.object({
  chapterId: z.string().min(1).max(128),
  chapterTitle: z.string().min(1).max(500),
  volumeTitle: z.string().min(1).max(500).nullable(),
  relativePath: z.string().min(1).max(4_000),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  summary: z.string().min(1).max(4_000),
  facts: z.array(InkHubStoryFactSchema).max(300),
  analyzedAt: z.string().datetime()
}).strict();
export type InkHubStoryChapterState = z.infer<typeof InkHubStoryChapterStateSchema>;

export const InkHubStoryStateSummarySchema = z.object({
  entryId: z.string().min(1),
  status: z.enum(["not-built", "building", "ready", "partial", "failed", "stale"]),
  stateVersion: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  totalChapters: z.number().int().nonnegative(),
  analyzedChapters: z.number().int().nonnegative(),
  reusedChapters: z.number().int().nonnegative(),
  pendingChapters: z.number().int().nonnegative(),
  failedChapters: z.number().int().nonnegative(),
  factCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime().nullable(),
  message: z.string().min(1).max(500)
}).strict().superRefine((value, context) => {
  if (value.analyzedChapters + value.pendingChapters + value.failedChapters > value.totalChapters) {
    context.addIssue({ code: "custom", message: "Story-state chapter counts exceed the declared total." });
  }
  if (value.reusedChapters > value.analyzedChapters) {
    context.addIssue({ code: "custom", path: ["reusedChapters"], message: "Reused chapters must be analyzed chapters." });
  }
});
export type InkHubStoryStateSummary = z.infer<typeof InkHubStoryStateSummarySchema>;

export const InkHubStoryStateSnapshotSchema = z.object({
  summary: InkHubStoryStateSummarySchema,
  chapters: z.array(InkHubStoryChapterStateSchema).max(2_000),
  facts: z.array(InkHubStoryFactSchema).max(20_000)
}).strict();
export type InkHubStoryStateSnapshot = z.infer<typeof InkHubStoryStateSnapshotSchema>;

export const InkHubStoryReconstructionRequestSchema = z.object({
  entryId: z.string().min(1),
  modelId: z.string().min(1).max(120).optional(),
  confirmBillable: z.literal(true)
}).strict();
export type InkHubStoryReconstructionRequest = z.infer<typeof InkHubStoryReconstructionRequestSchema>;

export const InkHubStoryReconstructionProgressSchema = z.object({
  entryId: z.string().min(1),
  stage: z.enum(["preparing", "reconstructing", "completed", "failed", "cancelled"]),
  completedChapters: z.number().int().nonnegative(),
  totalChapters: z.number().int().nonnegative(),
  reusedChapters: z.number().int().nonnegative(),
  message: z.string().min(1).max(500),
  updatedAt: z.string().datetime()
}).strict();
export type InkHubStoryReconstructionProgress = z.infer<typeof InkHubStoryReconstructionProgressSchema>;

export const InkHubStoryChapterModelAnalysisSchema = z.object({
  chapterId: z.string().min(1).max(128),
  summary: z.string().min(1).max(4_000),
  facts: z.array(z.object({
    category: InkHubStoryFactCategorySchema,
    subject: z.string().min(1).max(300),
    predicate: z.string().min(1).max(300),
    object: z.string().min(1).max(1_000),
    status: z.enum(["active", "resolved", "superseded", "uncertain"]),
    confidence: z.number().min(0).max(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    excerpt: z.string().min(1).max(1_200)
  }).strict()).max(300)
}).strict();

export const InkHubStoryReconstructionModelOutputSchema = z.object({
  chapters: z.array(InkHubStoryChapterModelAnalysisSchema).min(1).max(4)
}).strict();
export type InkHubStoryReconstructionModelOutput = z.infer<typeof InkHubStoryReconstructionModelOutputSchema>;

export const InkHubStoryContinuationRequestSchema = z.object({
  entryId: z.string().min(1),
  authorIntent: z.string().min(1).max(4_000),
  currentFocus: z.string().max(2_000).default(""),
  targetCharacters: z.number().int().min(300).max(20_000).default(3_000),
  modelId: z.string().min(1).max(120).optional(),
  confirmBillable: z.literal(true)
}).strict();
export type InkHubStoryContinuationRequest = z.infer<typeof InkHubStoryContinuationRequestSchema>;

export const InkHubStoryContinuationResultSchema = z.object({
  id: z.string().min(1).max(160),
  entryId: z.string().min(1),
  generatedAt: z.string().datetime(),
  sourceStateVersion: z.string().regex(/^[a-f0-9]{64}$/u),
  modelId: z.string().min(1).max(240),
  title: z.string().min(1).max(500),
  plan: z.array(z.string().min(1).max(1_000)).min(1).max(20),
  draft: z.string().min(1).max(100_000),
  continuityNotes: z.array(z.string().min(1).max(1_000)).max(30),
  evidence: z.array(InkHubStoryEvidenceSchema).max(32),
  canonical: z.literal(false),
  writebackPerformed: z.literal(false)
}).strict();
export type InkHubStoryContinuationResult = z.infer<typeof InkHubStoryContinuationResultSchema>;

export const InkHubStoryContinuationModelOutputSchema = z.object({
  title: z.string().min(1).max(500),
  plan: z.array(z.string().min(1).max(1_000)).min(1).max(20),
  draft: z.string().min(1).max(100_000),
  continuityNotes: z.array(z.string().min(1).max(1_000)).max(30),
  evidenceChapterIds: z.array(z.string().min(1).max(128)).max(32)
}).strict();

export const InkHubStoryForecastRequestSchema = z.object({
  entryId: z.string().min(1),
  question: z.string().min(1).max(4_000),
  branchCount: z.number().int().min(2).max(5).default(3),
  modelId: z.string().min(1).max(120).optional(),
  confirmBillable: z.literal(true)
}).strict();
export type InkHubStoryForecastRequest = z.infer<typeof InkHubStoryForecastRequestSchema>;

export const InkHubStoryForecastBranchSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(500),
  premise: z.string().min(1).max(2_000),
  beats: z.array(z.string().min(1).max(1_000)).min(2).max(20),
  opportunities: z.array(z.string().min(1).max(1_000)).max(12),
  risks: z.array(z.string().min(1).max(1_000)).max(12),
  evidence: z.array(InkHubStoryEvidenceSchema).max(32)
}).strict();

export const InkHubStoryForecastResultSchema = z.object({
  id: z.string().min(1).max(160),
  entryId: z.string().min(1),
  question: z.string().min(1).max(4_000),
  generatedAt: z.string().datetime(),
  sourceStateVersion: z.string().regex(/^[a-f0-9]{64}$/u),
  modelId: z.string().min(1).max(240),
  branches: z.array(InkHubStoryForecastBranchSchema).min(2).max(5),
  canonical: z.literal(false),
  stale: z.boolean()
}).strict();
export type InkHubStoryForecastResult = z.infer<typeof InkHubStoryForecastResultSchema>;

export const InkHubStoryForecastListSchema = z.object({
  entryId: z.string().min(1),
  forecasts: z.array(InkHubStoryForecastResultSchema).max(100)
}).strict();
export type InkHubStoryForecastList = z.infer<typeof InkHubStoryForecastListSchema>;

export const InkHubStoryForecastModelOutputSchema = z.object({
  branches: z.array(z.object({
    title: z.string().min(1).max(500),
    premise: z.string().min(1).max(2_000),
    beats: z.array(z.string().min(1).max(1_000)).min(2).max(20),
    opportunities: z.array(z.string().min(1).max(1_000)).max(12),
    risks: z.array(z.string().min(1).max(1_000)).max(12),
    evidenceChapterIds: z.array(z.string().min(1).max(128)).max(32)
  }).strict()).min(2).max(5)
}).strict();

export const InkHubStoryKernelIpcRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("getStoryState"), entryId: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("getStoryReconstructionProgress"), entryId: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("listStoryForecasts"), entryId: z.string().min(1) }).strict(),
  z.object({ operation: z.literal("reconstructStoryState"), input: InkHubStoryReconstructionRequestSchema }).strict(),
  z.object({ operation: z.literal("generateStoryContinuation"), input: InkHubStoryContinuationRequestSchema }).strict(),
  z.object({ operation: z.literal("generateStoryForecast"), input: InkHubStoryForecastRequestSchema }).strict()
]);
export type InkHubStoryKernelIpcRequest = z.infer<typeof InkHubStoryKernelIpcRequestSchema>;
