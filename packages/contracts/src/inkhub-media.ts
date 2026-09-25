import { z } from "zod";

export const INKHUB_MEDIA_IPC_CHANNEL = "inkhub:media";

export const InkHubCoverPlatformIdSchema = z.enum([
  "qimao",
  "fanqie",
  "jinjiang",
  "kindle",
  "web-fiction"
]);
export type InkHubCoverPlatformId = z.infer<typeof InkHubCoverPlatformIdSchema>;

export const InkHubCoverPlatformPresetSchema = z.object({
  id: InkHubCoverPlatformIdSchema,
  label: z.string().min(1).max(80),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  format: z.enum(["png", "jpeg"]),
  safeInsetRatio: z.number().min(0).max(0.25),
  evidence: z.enum(["official", "platform-reference", "generic"]),
  note: z.string().min(1).max(500),
  sourceUrl: z.url().max(2_000).optional()
});
export type InkHubCoverPlatformPreset = z.infer<
  typeof InkHubCoverPlatformPresetSchema
>;

export const InkHubCoverStyleIdSchema = z.enum([
  "ink-gold-fantasy",
  "crimson-silhouette-suspense",
  "dynasty-scroll-epic",
  "neon-cyber-night",
  "retro-sci-fi-animation",
  "minimal-symbolic",
  "torn-paper-mystery",
  "block-world-adventure",
  "brick-kingdom",
  "giant-title-impact",
  "editorial-fiction",
  "archive-dossier",
  "diffuse-dream",
  "monochrome-geometry",
  "midcentury-surreal",
  "lonely-public-space",
  "retro-architecture",
  "ink-dot-metaphor",
  "black-modernist",
  "silver-blue-premium",
  "constructivist-megastructure",
  "french-ink-poetry",
  "fate-thread-connection",
  "paper-acrylic-quiet"
]);
export type InkHubCoverStyleId = z.infer<typeof InkHubCoverStyleIdSchema>;

export const InkHubCoverStyleSchema = z.object({
  id: InkHubCoverStyleIdSchema,
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  bestFor: z.string().min(1).max(300),
  sourceLabel: z.string().min(1).max(120),
  sourceRef: z.string().min(1).max(500),
  adaptation: z.literal("clean-room")
}).strict();
export type InkHubCoverStyle = z.infer<typeof InkHubCoverStyleSchema>;

export const InkHubIllustrationPlanItemSchema = z.object({
  id: z.string().min(1).max(120),
  documentPath: z.string().min(1).max(2_000),
  chapterTitle: z.string().min(1).max(256),
  excerpt: z.string().min(1).max(2_000),
  prompt: z.string().min(1).max(8_000)
});
export type InkHubIllustrationPlanItem = z.infer<
  typeof InkHubIllustrationPlanItemSchema
>;

export const InkHubIllustrationPlanSchema = z.object({
  entryId: z.string().min(1),
  novelTitle: z.string().min(1).max(256),
  items: z.array(InkHubIllustrationPlanItemSchema).max(12),
  localHeuristic: z.literal(true)
});
export type InkHubIllustrationPlan = z.infer<
  typeof InkHubIllustrationPlanSchema
>;

export const InkHubGeneratedMediaSchema = z.object({
  entryId: z.string().min(1),
  kind: z.enum(["cover", "illustration"]),
  path: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.literal("image/png"),
  dataUrl: z.string().startsWith("data:image/png;base64,").max(40_000_000)
});
export type InkHubGeneratedMedia = z.infer<typeof InkHubGeneratedMediaSchema>;

const ConfirmedGenerationSchema = z.object({
  entryId: z.string().min(1),
  modelId: z.string().min(1).max(120),
  confirmBillable: z.literal(true)
});

export const InkHubMediaRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("listCoverPresets") }),
  z.object({ operation: z.literal("listCoverStyles") }),
  z.object({
    operation: z.literal("planIllustrations"),
    entryId: z.string().min(1),
    count: z.number().int().min(1).max(12)
  }),
  ConfirmedGenerationSchema.extend({
    operation: z.literal("generateCover"),
    platformId: InkHubCoverPlatformIdSchema,
    styleId: InkHubCoverStyleIdSchema,
    title: z.string().trim().min(1).max(120),
    author: z.string().trim().max(80),
    prompt: z.string().trim().min(1).max(8_000)
  }),
  ConfirmedGenerationSchema.extend({
    operation: z.literal("generateIllustration"),
    chapterTitle: z.string().trim().min(1).max(256),
    prompt: z.string().trim().min(1).max(8_000)
  }),
  z.object({
    operation: z.literal("revealMedia"),
    entryId: z.string().min(1),
    path: z.string().min(1).max(4_000)
  })
]);
export type InkHubMediaRequest = z.infer<typeof InkHubMediaRequestSchema>;
