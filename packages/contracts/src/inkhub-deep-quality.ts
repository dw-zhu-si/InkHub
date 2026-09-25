import { z } from "zod";

export const INKHUB_DEEP_QUALITY_DOMAINS = [
  "timeline",
  "character",
  "world",
  "causality",
  "pov",
  "style",
  "foreshadowing"
] as const;

export const InkHubDeepQualityDomainSchema = z.enum(INKHUB_DEEP_QUALITY_DOMAINS);
export type InkHubDeepQualityDomain = z.infer<typeof InkHubDeepQualityDomainSchema>;

export const InkHubDeepQualityCapabilitySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120)
}).strict();
export type InkHubDeepQualityCapability = z.infer<typeof InkHubDeepQualityCapabilitySchema>;

export const InkHubDeepQualityEvidenceSchema = z.object({
  chapterId: z.string().min(1).max(128),
  chapterTitle: z.string().min(1).max(500),
  volumeTitle: z.string().min(1).max(500).nullable(),
  relativePath: z.string().min(1).max(4_000),
  ordinal: z.number().int().nonnegative(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  excerpt: z.string().min(1).max(2_000)
}).strict().superRefine((value, context) => {
  if (value.endOffset <= value.startOffset) {
    context.addIssue({ code: "custom", path: ["endOffset"], message: "Deep-quality evidence must be non-empty." });
  }
});
export type InkHubDeepQualityEvidence = z.infer<typeof InkHubDeepQualityEvidenceSchema>;

export const InkHubDeepQualityFindingSchema = z.object({
  id: z.string().min(1).max(160),
  domain: InkHubDeepQualityDomainSchema,
  severity: z.enum(["info", "warning", "error"]),
  title: z.string().min(1).max(500),
  detail: z.string().min(1).max(4_000),
  evidence: z.array(InkHubDeepQualityEvidenceSchema).min(1).max(12),
  agents: z.array(InkHubDeepQualityCapabilitySchema).min(1).max(12),
  skills: z.array(InkHubDeepQualityCapabilitySchema).min(1).max(12),
  repairInstruction: z.string().min(1).max(2_000).optional()
}).strict();
export type InkHubDeepQualityFinding = z.infer<typeof InkHubDeepQualityFindingSchema>;

export const InkHubDeepQualityCoverageSchema = z.object({
  domain: InkHubDeepQualityDomainSchema,
  windows: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  agents: z.array(InkHubDeepQualityCapabilitySchema).min(1).max(12),
  skills: z.array(InkHubDeepQualityCapabilitySchema).min(1).max(12)
}).strict();
export type InkHubDeepQualityCoverage = z.infer<typeof InkHubDeepQualityCoverageSchema>;

export const InkHubDeepQualityReportSchema = z.object({
  version: z.literal(1),
  entryId: z.string().min(1),
  generatedAt: z.string().datetime(),
  chaptersAnalyzed: z.number().int().nonnegative(),
  volumesAnalyzed: z.number().int().nonnegative(),
  coverage: z.array(InkHubDeepQualityCoverageSchema).length(INKHUB_DEEP_QUALITY_DOMAINS.length),
  findings: z.array(InkHubDeepQualityFindingSchema).max(20_000)
}).strict();
export type InkHubDeepQualityReport = z.infer<typeof InkHubDeepQualityReportSchema>;

export const InkHubDeepQualityRequestSchema = z.object({
  entryId: z.string().min(1),
  modelId: z.string().min(1).max(120).optional(),
  confirmBillable: z.literal(true)
}).strict();
export type InkHubDeepQualityRequest = z.infer<typeof InkHubDeepQualityRequestSchema>;

export const InkHubDeepQualityProgressSchema = z.object({
  entryId: z.string().min(1),
  stage: z.enum(["preparing", "analyzing", "paused", "completed", "failed", "cancelled"]),
  completedWindows: z.number().int().nonnegative(),
  totalWindows: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  message: z.string().min(1).max(500),
  updatedAt: z.string().datetime()
}).strict().superRefine((value, context) => {
  if (value.completedWindows > value.totalWindows) {
    context.addIssue({ code: "custom", message: "Deep-quality progress exceeds its declared total." });
  }
});
export type InkHubDeepQualityProgress = z.infer<typeof InkHubDeepQualityProgressSchema>;

export const InkHubDeepQualityCheckpointSchema = z.object({
  nextInvocation: z.number().int().nonnegative(),
  findings: z.array(InkHubDeepQualityFindingSchema).max(20_000)
}).strict();
export type InkHubDeepQualityCheckpoint = z.infer<typeof InkHubDeepQualityCheckpointSchema>;

export const InkHubDeepQualityTaskSchema = z.object({
  entryId: z.string().min(1),
  status: z.enum(["running", "paused", "completed", "failed", "cancelled"]),
  sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  requestedModelId: z.string().min(1).max(120).nullable(),
  modelId: z.string().min(1).max(240),
  modelLabel: z.string().min(1).max(120),
  progress: InkHubDeepQualityProgressSchema,
  checkpoint: InkHubDeepQualityCheckpointSchema,
  report: InkHubDeepQualityReportSchema.nullable(),
  lastError: z.string().min(1).max(2_000).nullable(),
  updatedAt: z.string().datetime()
}).strict();
export type InkHubDeepQualityTask = z.infer<typeof InkHubDeepQualityTaskSchema>;

export const InkHubDeepQualityCancelRequestSchema = z.object({
  entryId: z.string().min(1),
  confirmCancel: z.literal(true)
}).strict();
export type InkHubDeepQualityCancelRequest = z.infer<typeof InkHubDeepQualityCancelRequestSchema>;
