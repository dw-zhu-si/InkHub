import { z } from "zod";
import { SkillKindSchema } from "./catalog";

export const INKHUB_ASSETS_IPC_CHANNEL = "inkhub:assets";

export const InkHubNovelCategorySchema = z.enum(["长篇", "短篇", "系列", "其他"]);
export type InkHubNovelCategory = z.infer<typeof InkHubNovelCategorySchema>;

export const InkHubNovelRootSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  label: z.string().min(1),
  available: z.boolean()
});
export type InkHubNovelRoot = z.infer<typeof InkHubNovelRootSchema>;

export const InkHubNovelEntrySchema = z.object({
  id: z.string().min(1),
  rootId: z.string().min(1),
  title: z.string().min(1),
  category: InkHubNovelCategorySchema,
  path: z.string().min(1),
  relativePath: z.string().min(1),
  documentCount: z.number().int().nonnegative(),
  formats: z.array(z.string().min(1)).max(16),
  updatedAt: z.string().datetime().nullable(),
  hasAgentRules: z.boolean(),
  hasTraeAssets: z.boolean(),
  truncated: z.boolean()
});
export type InkHubNovelEntry = z.infer<typeof InkHubNovelEntrySchema>;

export const InkHubNovelSnapshotSchema = z.object({
  roots: z.array(InkHubNovelRootSchema),
  entries: z.array(InkHubNovelEntrySchema),
  scannedAt: z.string().datetime(),
  truncated: z.boolean()
});
export type InkHubNovelSnapshot = z.infer<typeof InkHubNovelSnapshotSchema>;

export const InkHubNovelDocumentSchema = z.object({
  relativePath: z.string().min(1),
  title: z.string().min(1),
  extension: z.string().min(1),
  size: z.number().int().nonnegative(),
  updatedAt: z.string().datetime()
});
export type InkHubNovelDocument = z.infer<typeof InkHubNovelDocumentSchema>;

export const InkHubNovelDocumentListSchema = z.object({
  entryId: z.string().min(1),
  documents: z.array(InkHubNovelDocumentSchema),
  truncated: z.boolean()
});
export type InkHubNovelDocumentList = z.infer<typeof InkHubNovelDocumentListSchema>;

export const InkHubNovelDocumentPreviewSchema = z.object({
  entryId: z.string().min(1),
  relativePath: z.string().min(1),
  content: z.string(),
  truncated: z.boolean(),
  readOnly: z.literal(true)
});
export type InkHubNovelDocumentPreview = z.infer<typeof InkHubNovelDocumentPreviewSchema>;

export const InkHubSkillSourceSchema = z.enum([
  "codex",
  "trae",
  "novel-project",
  "collaboration",
  "codex-agent"
]);
export type InkHubSkillSource = z.infer<typeof InkHubSkillSourceSchema>;

export const InkHubSkillRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: InkHubSkillSourceSchema,
  path: z.string().min(1),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  actualSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  status: z.enum(["verified", "changed", "missing"]),
  license: z.string().min(1),
  enabled: z.boolean(),
  executable: z.boolean(),
  capabilityKind: z.enum(["prompt-skill", "agent-template", "spec", "reference"]),
  skillKind: SkillKindSchema.optional(),
  installState: z.enum(["available", "installed", "blocked"]),
  runtimeState: z.enum(["ready", "disabled", "adapter-required", "source-error"]),
  conflictGroup: z.string().min(1).optional(),
  note: z.string().max(500).optional()
});
export type InkHubSkillRecord = z.infer<typeof InkHubSkillRecordSchema>;

export const InkHubSkillSnapshotSchema = z.object({
  skills: z.array(InkHubSkillRecordSchema).max(128),
  verifiedAt: z.string().datetime()
});
export type InkHubSkillSnapshot = z.infer<typeof InkHubSkillSnapshotSchema>;

export const InkHubSkillPreviewSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  truncated: z.boolean(),
  readOnly: z.literal(true)
});
export type InkHubSkillPreview = z.infer<typeof InkHubSkillPreviewSchema>;

export const InkHubAttachedSkillsSchema = z.object({
  skills: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(240),
      content: z.string().max(20_000),
      kind: SkillKindSchema,
      source: z.literal("attached-skill")
    })
  ).max(64)
});
export type InkHubAttachedSkills = z.infer<typeof InkHubAttachedSkillsSchema>;

export const InkHubAssetsRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("listNovels") }),
  z.object({ operation: z.literal("chooseNovelRoot") }),
  z.object({ operation: z.literal("removeNovelRoot"), rootId: z.string().min(1) }),
  z.object({ operation: z.literal("listNovelDocuments"), entryId: z.string().min(1) }),
  z.object({
    operation: z.literal("readNovelDocument"),
    entryId: z.string().min(1),
    relativePath: z.string().min(1).max(2_000)
  }),
  z.object({ operation: z.literal("revealNovel"), entryId: z.string().min(1) }),
  z.object({
    operation: z.literal("getNovelIndex"),
    entryId: z.string().min(1),
    verifyFreshness: z.boolean().default(true)
  }),
  z.object({ operation: z.literal("buildNovelIndex"), entryId: z.string().min(1) }),
  z.object({
    operation: z.literal("listNovelChapters"),
    entryId: z.string().min(1),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(500).default(200)
  }),
  z.object({
    operation: z.literal("readNovelChapter"),
    entryId: z.string().min(1),
    chapterId: z.string().min(1).max(128),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(200_000).default(100_000)
  }),
  z.object({
    operation: z.literal("searchNovel"),
    entryId: z.string().min(1),
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(50).default(20)
  }),
  z.object({ operation: z.literal("runNovelQualityCheck"), entryId: z.string().min(1) }),
  z.object({
    operation: z.literal("applyNovelChapterRepair"),
    entryId: z.string().min(1),
    chapterId: z.string().min(1).max(128),
    expectedSourceRevision: z.string().regex(/^[a-f0-9]{64}$/u),
    content: z.string().min(1).max(2_000_000),
    confirmWrite: z.literal(true)
  }),
  z.object({
    operation: z.literal("createNovelContext"),
    entryId: z.string().min(1),
    purpose: z.enum(["quality-check", "continue-writing"])
  }),
  z.object({ operation: z.literal("getNovelReadingProgress"), entryId: z.string().min(1) }),
  z.object({
    operation: z.literal("saveNovelReadingProgress"),
    entryId: z.string().min(1),
    chapterId: z.string().min(1).max(128),
    characterOffset: z.number().int().nonnegative(),
    scrollFraction: z.number().min(0).max(1)
  }),
  z.object({ operation: z.literal("listSkills") }),
  z.object({ operation: z.literal("installSkills") }),
  z.object({
    operation: z.literal("setSkillEnabled"),
    skillId: z.string().min(1),
    enabled: z.boolean()
  }),
  z.object({ operation: z.literal("readSkill"), skillId: z.string().min(1) }),
  z.object({ operation: z.literal("attachedSkills") })
]);
export type InkHubAssetsRequest = z.infer<typeof InkHubAssetsRequestSchema>;
