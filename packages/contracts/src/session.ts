import { z } from "zod";
import { EnvelopeBaseSchema, type Envelope } from "./envelope";
import { SHORT_WORKSPACE_FILE_MAX_CHARACTERS } from "./expert-draft";
import { MaterialStageIdSchema, SkillStageIdSchema } from "./catalog";
import {
  AgentProviderRuntimeConfigSchema,
  TemperatureSchema,
  ThinkingLevelSchema
} from "./models";
import type { ThinkingLevel } from "./models";
import {
  ShortMaterialKindSchema,
  ShortSkillKindSchema,
  ShortWorkspaceStageIdSchema,
  ShortWorkspaceAgentProfileSchema,
  ShortWorkspaceSnapshotSchema,
  resolveShortWorkspaceAgentIdForStage
} from "./workspace";
import {
  ScriptWorkspaceAgentProfileSchema,
  ScriptWorkspaceSnapshotSchema,
  resolveScriptWorkspaceAgentIdForStage
} from "./script-workspace";
import {
  LongAgentIdSchema,
  LongAgentProfileSchema,
  LongBookIdSchema,
  LongChapterCardIdSchema,
  LongCharacterIdSchema,
  LongFileIdSchema,
  LongFileRevisionSchema,
  LongProjectRelativePathSchema,
  resolveLongAgentIdForRoot
} from "./long-workspace";
import { LongWorkspaceRuntimeContextSchema } from "./long-workspace-api";
import { LongCommitChapterInputSchema } from "./long-ledger";
import { LongWorkspaceOperationBatchSchema } from "./long-workspace-operations";
import { ShortAgentSubagentDefinitionsSchema } from "./agent-team";
import {
  LearningImitationAgentProfileSchema,
  LearningImitationRuntimeContextSchema,
  LearningImitationStageIdSchema,
  LearningImitationWritePayloadSchema
} from "./learning-imitation";
import {
  LibraryAgentProfileSchema,
  LibraryAgentWorkspaceSnapshotSchema
} from "./library-agent";
import {
  SubagentAuthoringDraftSchema,
  SubagentAuthoringRuntimeContextSchema
} from "./subagent-authoring";

export type { ThinkingLevel } from "./models";

export const AgentWriteApprovalModeSchema = z.enum([
  "request-approval",
  "auto-approve"
]);
export type AgentWriteApprovalMode = z.infer<typeof AgentWriteApprovalModeSchema>;

export const AgentRuntimeRefSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  mode: z.enum(["local-faux", "provider"]),
  /**
   * The local model-configuration id that resolved this runtime. It is kept
   * optional for the built-in faux runtime and for historical event payloads.
   */
  configId: z.string().trim().min(1).max(120).optional()
});
export type AgentRuntimeRef = z.infer<typeof AgentRuntimeRefSchema>;

export const ActiveResourceSnapshotSchema = z.object({
  id: z.string().min(1),
  domain: z.enum(["creation", "skill", "material"]),
  title: z.string().min(1).max(240),
  path: z.array(z.string().min(1).max(240)).max(16),
  format: z.string().min(1).max(80).optional(),
  source: z.literal("live-editor"),
  content: z.string().max(SHORT_WORKSPACE_FILE_MAX_CHARACTERS),
  truncated: z.boolean().optional(),
  originalLength: z
    .number()
    .int()
    .nonnegative()
    .max(SHORT_WORKSPACE_FILE_MAX_CHARACTERS)
    .optional()
}).superRefine((value, context) => {
  if (
    value.truncated === true &&
    (value.originalLength === undefined || value.originalLength <= value.content.length)
  ) {
    context.addIssue({
      code: "custom",
      path: ["originalLength"],
      message: "A truncated resource must report an originalLength larger than content."
    });
  }
  if (value.truncated !== true && value.originalLength !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["originalLength"],
      message: "An untruncated resource must omit originalLength."
    });
  }
});
export type ActiveResourceSnapshot = z.infer<typeof ActiveResourceSnapshotSchema>;

interface ComparableTextSnapshot {
  content: string;
  truncated?: boolean | undefined;
  originalLength?: number | undefined;
}

function matchesActiveResourceContent(
  candidate: string | ComparableTextSnapshot,
  active: ActiveResourceSnapshot
): boolean {
  const snapshot = typeof candidate === "string"
    ? { content: candidate }
    : candidate;
  const candidateLength = snapshot.truncated === true
    ? snapshot.originalLength
    : snapshot.content.length;
  const activeLength = active.truncated === true
    ? active.originalLength
    : active.content.length;
  if (
    candidateLength === undefined ||
    activeLength === undefined ||
    candidateLength !== activeLength
  ) {
    return false;
  }
  const sharedLength = Math.min(snapshot.content.length, active.content.length);
  return (
    (sharedLength > 0 || candidateLength === 0) &&
    snapshot.content.slice(0, sharedLength) === active.content.slice(0, sharedLength)
  );
}

export const ATTACHED_CONTEXT_MAX_ITEMS = 64;
export const ATTACHED_CONTEXT_MAX_CONTENT_LENGTH = 20_000;

const AttachedContextSnapshotBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(240),
  content: z.string().max(ATTACHED_CONTEXT_MAX_CONTENT_LENGTH)
});

export const AttachedSkillSnapshotSchema = AttachedContextSnapshotBaseSchema.extend({
  source: z.literal("attached-skill"),
  kind: ShortSkillKindSchema.optional()
});

export const AttachedMaterialSnapshotSchema = AttachedContextSnapshotBaseSchema.extend({
  source: z.literal("attached-material"),
  kind: ShortMaterialKindSchema.optional()
});

export const AttachedContextSnapshotSchema = z.discriminatedUnion("source", [
  AttachedSkillSnapshotSchema,
  AttachedMaterialSnapshotSchema
]);
export type AttachedContextSnapshot = z.infer<typeof AttachedContextSnapshotSchema>;

export const WorkspaceRuntimeContextSchema = z.object({
  activeResource: ActiveResourceSnapshotSchema.optional(),
  shortWorkspace: ShortWorkspaceSnapshotSchema.optional(),
  scriptWorkspace: ScriptWorkspaceSnapshotSchema.optional(),
  longWorkspace: LongWorkspaceRuntimeContextSchema.optional(),
  libraryWorkspace: LibraryAgentWorkspaceSnapshotSchema.optional(),
  learningImitation: LearningImitationRuntimeContextSchema.optional(),
  subagentAuthoring: SubagentAuthoringRuntimeContextSchema.optional(),
  attachedSkills: z
    .array(AttachedSkillSnapshotSchema)
    .max(ATTACHED_CONTEXT_MAX_ITEMS)
    .optional(),
  attachedMaterials: z
    .array(AttachedMaterialSnapshotSchema)
    .max(ATTACHED_CONTEXT_MAX_ITEMS)
    .optional()
}).superRefine((value, context) => {
  const exclusiveContexts = [
    value.shortWorkspace,
    value.scriptWorkspace,
    value.longWorkspace,
    value.libraryWorkspace,
    value.learningImitation,
    value.subagentAuthoring
  ].filter(Boolean).length;
  if (exclusiveContexts > 1) {
    context.addIssue({
      code: "custom",
      path: ["libraryWorkspace"],
      message: "A run can use only one managed workspace context."
    });
  }
  if (value.libraryWorkspace && value.activeResource) {
    if (value.libraryWorkspace.domain !== value.activeResource.domain) {
      context.addIssue({
        code: "custom",
        path: ["libraryWorkspace", "domain"],
        message: "The active resource must match the library workspace domain."
      });
    }
    if (value.libraryWorkspace.activeEntryId) {
      const activeEntry = value.libraryWorkspace.entries.find(
        (entry) => entry.id === value.libraryWorkspace?.activeEntryId
      );
      if (
        !activeEntry ||
        activeEntry.documentId !== value.activeResource.id ||
        !matchesActiveResourceContent(activeEntry, value.activeResource)
      ) {
        context.addIssue({
          code: "custom",
          path: ["libraryWorkspace", "activeEntryId"],
          message: "The active library entry must match the live active resource snapshot."
        });
      }
    } else if (
      value.libraryWorkspace.overviewDocumentId !== value.activeResource.id ||
      !matchesActiveResourceContent(
        {
          content: value.libraryWorkspace.overview,
          ...(value.libraryWorkspace.overviewTruncated === undefined
            ? {}
            : { truncated: value.libraryWorkspace.overviewTruncated }),
          ...(value.libraryWorkspace.overviewOriginalLength === undefined
            ? {}
            : { originalLength: value.libraryWorkspace.overviewOriginalLength })
        },
        value.activeResource
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["libraryWorkspace", "overviewDocumentId"],
        message: "The active library overview must match the live active resource snapshot."
      });
    }
  }
  const active = value.activeResource;
  if (!active) return;

  if (
    value.longWorkspace?.activeFileId &&
    active.id !== value.longWorkspace.activeFileId
  ) {
    context.addIssue({
      code: "custom",
      path: ["longWorkspace", "activeFileId"],
      message:
        "The active long-form file must match the live active resource snapshot."
    });
  }

  const creativeWorkspaces = [
    {
      key: "shortWorkspace",
      label: "short",
      workspace: value.shortWorkspace
    },
    {
      key: "scriptWorkspace",
      label: "script",
      workspace: value.scriptWorkspace
    }
  ] as const;
  for (const { key, label, workspace } of creativeWorkspaces) {
    if (!workspace) continue;
    const matchesActiveStage = workspace.activeStageId === "draft"
      ? (
          workspace.activeSectionId === undefined &&
          active.id === workspace.expertDraft.id &&
          active.content === ""
        ) || workspace.expertDraft.sections
          .filter(
            (section) =>
              workspace.activeSectionId === undefined ||
              section.id === workspace.activeSectionId
          )
          .some((section) =>
            [section.body, section.characterState].some(
              (file) =>
                file.documentId === active.id &&
                matchesActiveResourceContent(file, active)
            )
          )
      : workspace.stages.some(
          (stage) =>
            stage.stageId === workspace.activeStageId &&
            matchesActiveResourceContent(stage, active)
        );
    if (!matchesActiveStage) {
      context.addIssue({
        code: "custom",
        path: [key, "activeStageId"],
        message: `The active ${label} stage must match the live active resource snapshot.`
      });
    }
  }
});
export type WorkspaceRuntimeContext = z.infer<typeof WorkspaceRuntimeContextSchema>;

export const PROMPT_ATTACHMENT_MAX_ITEMS = 8;
export const PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH = 100_000;
export const PROMPT_TEXT_ATTACHMENTS_MAX_CONTENT_LENGTH = 200_000;
export const PROMPT_IMAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PROMPT_IMAGE_ATTACHMENTS_MAX_BYTES = 25 * 1024 * 1024;

const PromptAttachmentBaseSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(240),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024)
});

export const PromptTextAttachmentSchema = PromptAttachmentBaseSchema.extend({
  kind: z.literal("text"),
  mediaType: z.string().trim().min(1).max(120),
  content: z.string().max(PROMPT_TEXT_ATTACHMENT_MAX_CONTENT_LENGTH),
  truncated: z.boolean().optional(),
  originalLength: z.number().int().nonnegative().max(10_000_000).optional()
}).superRefine((value, context) => {
  if (
    value.truncated === true &&
    (value.originalLength === undefined || value.originalLength <= value.content.length)
  ) {
    context.addIssue({
      code: "custom",
      path: ["originalLength"],
      message: "A truncated text attachment must report its original length."
    });
  }
  if (value.truncated !== true && value.originalLength !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["originalLength"],
      message: "An untruncated text attachment must omit originalLength."
    });
  }
});
export type PromptTextAttachment = z.infer<typeof PromptTextAttachmentSchema>;

export const PromptImageMediaTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);
export type PromptImageMediaType = z.infer<typeof PromptImageMediaTypeSchema>;

function decodedBase64ByteLength(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor(value.length * 3 / 4) - padding;
}

export const PromptImageAttachmentSchema = PromptAttachmentBaseSchema.extend({
  kind: z.literal("image"),
  mediaType: PromptImageMediaTypeSchema,
  data: z
    .string()
    .min(1)
    .max(Math.ceil(PROMPT_IMAGE_ATTACHMENT_MAX_BYTES / 3) * 4 + 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Image attachment data must be base64 encoded.")
}).superRefine((value, context) => {
  if (value.size > PROMPT_IMAGE_ATTACHMENT_MAX_BYTES) {
    context.addIssue({
      code: "custom",
      path: ["size"],
      message: "Image attachment exceeds the per-file size limit."
    });
  }
  if (decodedBase64ByteLength(value.data) !== value.size) {
    context.addIssue({
      code: "custom",
      path: ["data"],
      message: "Image attachment byte size does not match its base64 payload."
    });
  }
});
export type PromptImageAttachment = z.infer<typeof PromptImageAttachmentSchema>;

export const UserPromptAttachmentSchema = z.discriminatedUnion("kind", [
  PromptTextAttachmentSchema,
  PromptImageAttachmentSchema
]);
export type UserPromptAttachment = z.infer<typeof UserPromptAttachmentSchema>;

export const UserPromptAttachmentsSchema = z
  .array(UserPromptAttachmentSchema)
  .max(PROMPT_ATTACHMENT_MAX_ITEMS)
  .superRefine((attachments, context) => {
    const ids = new Set<string>();
    let textLength = 0;
    let imageBytes = 0;
    attachments.forEach((attachment, index) => {
      if (ids.has(attachment.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Prompt attachment ids must be unique."
        });
      }
      ids.add(attachment.id);
      if (attachment.kind === "text") {
        textLength += attachment.content.length;
      } else {
        imageBytes += attachment.size;
      }
    });
    if (textLength > PROMPT_TEXT_ATTACHMENTS_MAX_CONTENT_LENGTH) {
      context.addIssue({
        code: "custom",
        message: "Text attachments exceed the total extracted-content limit."
      });
    }
    if (imageBytes > PROMPT_IMAGE_ATTACHMENTS_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        message: "Image attachments exceed the total size limit."
      });
    }
  });

export const SessionPromptCommandPayloadSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().trim().min(1).max(20_000),
  attachments: UserPromptAttachmentsSchema.optional(),
  modelId: z.string().min(1).max(120).optional(),
  thinkingLevel: ThinkingLevelSchema.optional(),
  temperature: TemperatureSchema.optional(),
  writeApprovalMode: AgentWriteApprovalModeSchema.optional(),
  workspaceContext: WorkspaceRuntimeContextSchema.optional()
});
export type SessionPromptCommandPayload = z.infer<typeof SessionPromptCommandPayloadSchema>;

export const SessionPromptAcceptedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  acceptedAt: z.string().datetime(),
  runtime: AgentRuntimeRefSchema
});
export type SessionPromptAcceptedPayload = z.infer<typeof SessionPromptAcceptedPayloadSchema>;

export const SessionPromptCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("session.prompt"),
  payload: SessionPromptCommandPayloadSchema
}).superRefine((value, context) => {
  if (value.context.sessionId !== value.payload.sessionId) {
    context.addIssue({
      code: "custom",
      path: ["context", "sessionId"],
      message: "Envelope sessionId must match session.prompt payload."
    });
  }
  const activeResourceId = value.payload.workspaceContext?.activeResource?.id;
  if (activeResourceId && value.context.resourceId !== activeResourceId) {
    context.addIssue({
      code: "custom",
      path: ["context", "resourceId"],
      message: "Envelope resourceId must match the active resource snapshot."
    });
  }
});

export const SessionAbortCommandPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1)
});
export type SessionAbortCommandPayload = z.infer<typeof SessionAbortCommandPayloadSchema>;

export const SessionAbortAcceptedPayloadSchema = SessionAbortCommandPayloadSchema.extend({
  abortedAt: z.string().datetime()
});
export type SessionAbortAcceptedPayload = z.infer<typeof SessionAbortAcceptedPayloadSchema>;

function validateAbortCommandContext(
  value: {
    context: { sessionId?: string | undefined; runId?: string | undefined };
    payload: SessionAbortCommandPayload;
  },
  context: z.core.$RefinementCtx<any>
): void {
  if (value.context.sessionId !== value.payload.sessionId) {
    context.addIssue({
      code: "custom",
      path: ["context", "sessionId"],
      message: "Envelope sessionId must match abort payload."
    });
  }
  if (value.context.runId !== value.payload.runId) {
    context.addIssue({
      code: "custom",
      path: ["context", "runId"],
      message: "Envelope runId must match abort payload."
    });
  }
}

export const SessionAbortCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("session.abort"),
  payload: SessionAbortCommandPayloadSchema
}).superRefine(validateAbortCommandContext);

export const AgentPromptCommandPayloadSchema = SessionPromptCommandPayloadSchema.extend({
  runtimeConfig: AgentProviderRuntimeConfigSchema.optional(),
  agentProfile: ShortWorkspaceAgentProfileSchema.optional(),
  scriptAgentProfile: ScriptWorkspaceAgentProfileSchema.optional(),
  longAgentProfile: LongAgentProfileSchema.optional(),
  subagentDefinitions: ShortAgentSubagentDefinitionsSchema.optional(),
  /**
   * Runtime-only map of model config id → resolved provider config for
   * subagents that use `modelMode: "custom"`. Never persisted with teams.
   */
  subagentRuntimeConfigs: z
    .record(z.string().min(1).max(120), AgentProviderRuntimeConfigSchema)
    .optional(),
  libraryAgentProfile: LibraryAgentProfileSchema.optional(),
  learningImitationProfile: LearningImitationAgentProfileSchema.optional()
}).superRefine((value, context) => {
  const shortWorkspace = value.workspaceContext?.shortWorkspace;
  const scriptWorkspace = value.workspaceContext?.scriptWorkspace;
  const longWorkspace = value.workspaceContext?.longWorkspace;
  if (
    value.subagentDefinitions !== undefined &&
    !(
      (shortWorkspace && value.agentProfile) ||
      (scriptWorkspace && value.scriptAgentProfile) ||
      (longWorkspace && value.longAgentProfile)
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["subagentDefinitions"],
      message:
        "Subagent definitions require a short, script or long workspace and its agent profile."
    });
  }
  if (
    value.subagentRuntimeConfigs !== undefined &&
    value.subagentDefinitions === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["subagentRuntimeConfigs"],
      message: "Subagent runtime configs require subagent definitions."
    });
  }
  if (value.subagentDefinitions && value.subagentRuntimeConfigs) {
    for (const definition of value.subagentDefinitions) {
      if (definition.modelMode !== "custom" || !definition.modelId) continue;
      if (!value.subagentRuntimeConfigs[definition.modelId]) {
        context.addIssue({
          code: "custom",
          path: ["subagentRuntimeConfigs", definition.modelId],
          message: `Missing runtime config for subagent model: ${definition.modelId}`
        });
      }
    }
  }
  if (Boolean(shortWorkspace) !== Boolean(value.agentProfile)) {
    context.addIssue({
      code: "custom",
      path: ["agentProfile"],
      message: "Short workspace context and agent profile must be provided together."
    });
  }
  if (shortWorkspace && value.agentProfile) {
    const activeAgentId =
      shortWorkspace.activeAgentId ??
      resolveShortWorkspaceAgentIdForStage(shortWorkspace.activeStageId);
    if (value.agentProfile.id !== activeAgentId) {
      context.addIssue({
        code: "custom",
        path: ["agentProfile", "id"],
        message: "Short workspace agent profile must match the active parent agent."
      });
    }
  }
  if (Boolean(scriptWorkspace) !== Boolean(value.scriptAgentProfile)) {
    context.addIssue({
      code: "custom",
      path: ["scriptAgentProfile"],
      message: "Script workspace context and agent profile must be provided together."
    });
  }
  if (scriptWorkspace && value.scriptAgentProfile) {
    const activeAgentId =
      scriptWorkspace.activeAgentId ??
      resolveScriptWorkspaceAgentIdForStage(scriptWorkspace.activeStageId);
    if (value.scriptAgentProfile.id !== activeAgentId) {
      context.addIssue({
        code: "custom",
        path: ["scriptAgentProfile", "id"],
        message: "Script workspace agent profile must match the active parent agent."
      });
    }
  }
  if (Boolean(longWorkspace) !== Boolean(value.longAgentProfile)) {
    context.addIssue({
      code: "custom",
      path: ["longAgentProfile"],
      message:
        "Long workspace context and agent profile must be provided together."
    });
  }
  if (longWorkspace && value.longAgentProfile) {
    const expectedAgentId =
      longWorkspace.activeAgentId ??
      resolveLongAgentIdForRoot(longWorkspace.activeRoot);
    if (value.longAgentProfile.id !== expectedAgentId) {
      context.addIssue({
        code: "custom",
        path: ["longAgentProfile", "id"],
        message:
          "Long workspace agent profile must match the active long-form agent."
      });
    }
  }
  if (
    Boolean(value.workspaceContext?.learningImitation) !==
    Boolean(value.learningImitationProfile)
  ) {
    context.addIssue({
      code: "custom",
      path: ["learningImitationProfile"],
      message: "Learning-imitation context and agent profile must be provided together."
    });
  }
  if (
    value.learningImitationProfile &&
    value.workspaceContext?.learningImitation?.stageId !==
      value.learningImitationProfile.id
  ) {
    context.addIssue({
      code: "custom",
      path: ["learningImitationProfile", "id"],
      message: "Learning-imitation profile must match the active stage."
    });
  }
  if (
    Boolean(value.workspaceContext?.libraryWorkspace) !==
    Boolean(value.libraryAgentProfile)
  ) {
    context.addIssue({
      code: "custom",
      path: ["libraryAgentProfile"],
      message: "Library workspace context and agent profile must be provided together."
    });
  }
  if (
    value.libraryAgentProfile &&
    value.workspaceContext?.libraryWorkspace?.domain !==
      value.libraryAgentProfile.domain
  ) {
    context.addIssue({
      code: "custom",
      path: ["libraryAgentProfile", "domain"],
      message: "Library agent profile must match the active library domain."
    });
  }
});
export type AgentPromptCommandPayload = z.infer<typeof AgentPromptCommandPayloadSchema>;

export const AgentPromptCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.prompt"),
  payload: AgentPromptCommandPayloadSchema
}).superRefine((value, context) => {
  if (value.context.sessionId !== value.payload.sessionId) {
    context.addIssue({
      code: "custom",
      path: ["context", "sessionId"],
      message: "Envelope sessionId must match agent.prompt payload."
    });
  }
  const activeResourceId = value.payload.workspaceContext?.activeResource?.id;
  if (activeResourceId && value.context.resourceId !== activeResourceId) {
    context.addIssue({
      code: "custom",
      path: ["context", "resourceId"],
      message: "Envelope resourceId must match the active resource snapshot."
    });
  }
});

export const AgentAbortCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.abort"),
  payload: SessionAbortCommandPayloadSchema
}).superRefine(validateAbortCommandContext);

const AgentEventIdentitySchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  messageId: z.string().min(1),
  runtime: AgentRuntimeRefSchema
});

export const AgentEvaluationToolConfigurationSchema = z.object({
  name: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  description: z.string(),
  inputSchema: z.unknown(),
  executionMode: z.string().trim().min(1).optional()
});
export type AgentEvaluationToolConfiguration = z.infer<
  typeof AgentEvaluationToolConfigurationSchema
>;

export const AgentEvaluationHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  text: z.string().max(8_000),
  toolName: z.string().trim().min(1).optional(),
  toolCallId: z.string().trim().min(1).optional(),
  isError: z.boolean().optional()
});
export type AgentEvaluationHistoryMessage = z.infer<
  typeof AgentEvaluationHistoryMessageSchema
>;

/**
 * Exact run-time evidence captured only when DeepWrite is explicitly started
 * in evaluation mode. It deliberately excludes provider credentials and image
 * bytes while preserving every text fragment injected into the model turn,
 * plus a compact, truncated copy of the model-visible message array.
 */
export const AgentEvaluationSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string().datetime(),
  systemPrompt: z.string(),
  runtimeContext: z.object({
    kind: z.enum(["initial-session-context", "turn-context"]),
    text: z.string()
  }),
  tools: z.array(AgentEvaluationToolConfigurationSchema),
  conversationHistory: z.array(AgentEvaluationHistoryMessageSchema).optional()
});
export type AgentEvaluationSnapshot = z.infer<
  typeof AgentEvaluationSnapshotSchema
>;

export const AgentEvaluationSnapshotPayloadSchema =
  AgentEventIdentitySchema.extend({
    snapshot: AgentEvaluationSnapshotSchema
  });
export type AgentEvaluationSnapshotPayload = z.infer<
  typeof AgentEvaluationSnapshotPayloadSchema
>;

const AgentTurnStartedFieldsSchema = z.object({
  turnId: z.string().min(1),
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive()
});

const AgentRetryScheduledFieldsSchema = z.object({
  turnId: z.string().min(1),
  failedAttempt: z.number().int().positive(),
  nextAttempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  delayMs: z.number().int().nonnegative(),
  retryAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(4_000)
});

function validateTurnAttempt(
  value: { attempt: number; maxAttempts: number },
  context: z.core.$RefinementCtx<any>
): void {
  if (value.attempt > value.maxAttempts) {
    context.addIssue({
      code: "custom",
      path: ["attempt"],
      message: "Attempt must not exceed maxAttempts."
    });
  }
}

function validateRetryAttempt(
  value: { failedAttempt: number; nextAttempt: number; maxAttempts: number },
  context: z.core.$RefinementCtx<any>
): void {
  if (value.nextAttempt !== value.failedAttempt + 1) {
    context.addIssue({
      code: "custom",
      path: ["nextAttempt"],
      message: "nextAttempt must immediately follow failedAttempt."
    });
  }
  if (value.nextAttempt > value.maxAttempts) {
    context.addIssue({
      code: "custom",
      path: ["nextAttempt"],
      message: "nextAttempt must not exceed maxAttempts."
    });
  }
}

export const AgentTurnStartedPayloadSchema = AgentEventIdentitySchema.extend(
  AgentTurnStartedFieldsSchema.shape
).superRefine(validateTurnAttempt);
export type AgentTurnStartedPayload = z.infer<typeof AgentTurnStartedPayloadSchema>;

export const AgentRetryScheduledPayloadSchema = AgentEventIdentitySchema.extend(
  AgentRetryScheduledFieldsSchema.shape
).superRefine(validateRetryAttempt);
export type AgentRetryScheduledPayload = z.infer<
  typeof AgentRetryScheduledPayloadSchema
>;

export const AgentMessageDeltaPayloadSchema = AgentEventIdentitySchema.extend({
  delta: z.string()
});
export type AgentMessageDeltaPayload = z.infer<typeof AgentMessageDeltaPayloadSchema>;

export const AgentThinkingDeltaPayloadSchema = AgentEventIdentitySchema.extend({
  delta: z.string()
});
export type AgentThinkingDeltaPayload = z.infer<typeof AgentThinkingDeltaPayloadSchema>;

export const AgentUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative()
});
export type AgentUsage = z.infer<typeof AgentUsageSchema>;

export const AgentUsageObservationStatusSchema = z.enum([
  "completed",
  "error",
  "aborted"
]);
export type AgentUsageObservationStatus = z.infer<
  typeof AgentUsageObservationStatusSchema
>;

/**
 * One provider-returned assistant message, including intermediate tool-call
 * turns and retry attempts. This is an internal accounting event: consumers
 * must not derive usage from `agent.message_completed` or `subagent.completed`,
 * because those UI lifecycle events deliberately omit intermediate turns.
 */
export const AgentUsageObservedPayloadSchema = AgentEventIdentitySchema.extend({
  /** Stable retry-safe id for local at-least-once persistence. */
  // Main prefixes this with `v2:` before persisting it in a 240-character
  // ModelUsageRecord id, so reserve those three characters here.
  observationId: z.string().trim().min(1).max(237),
  observedAt: z.string().datetime(),
  turnId: z.string().min(1),
  attempt: z.number().int().positive(),
  status: AgentUsageObservationStatusSchema,
  hadToolCall: z.boolean(),
  usage: AgentUsageSchema,
  /** Present only when this model message came from a delegated child run. */
  parentToolCallId: z.string().min(1).optional(),
  subagentRunId: z.string().min(1).optional(),
  subagentId: z.string().min(1).max(120).optional()
});
export type AgentUsageObservedPayload = z.infer<
  typeof AgentUsageObservedPayloadSchema
>;

export const SubagentEventBaseSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  parentToolCallId: z.string().min(1),
  subagentRunId: z.string().min(1),
  subagentId: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  runtime: AgentRuntimeRefSchema
});
export type SubagentEventBase = z.infer<typeof SubagentEventBaseSchema>;

export const SubagentActivitySchema = z.discriminatedUnion("type", [
  AgentTurnStartedFieldsSchema.extend({
    type: z.literal("turn_started")
  }).superRefine(validateTurnAttempt),
  AgentRetryScheduledFieldsSchema.extend({
    type: z.literal("retry_scheduled")
  }).superRefine(validateRetryAttempt),
  z.object({
    type: z.literal("thinking_delta"),
    delta: z.string()
  }),
  z.object({
    type: z.literal("message_delta"),
    delta: z.string()
  }),
  z.object({
    type: z.literal("tool_requested"),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    args: z.unknown()
  }),
  z.object({
    type: z.literal("tool_completed"),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    resultSummary: z.string().max(4_000),
    isError: z.boolean()
  })
]);
export type SubagentActivity = z.infer<typeof SubagentActivitySchema>;

export const SubagentStartedPayloadSchema = SubagentEventBaseSchema.extend({
  task: z.string().trim().min(1).max(20_000)
});
export type SubagentStartedPayload = z.infer<
  typeof SubagentStartedPayloadSchema
>;

export const SubagentActivityPayloadSchema = SubagentEventBaseSchema.extend({
  activity: SubagentActivitySchema
});
export type SubagentActivityPayload = z.infer<
  typeof SubagentActivityPayloadSchema
>;

export const SubagentCompletedPayloadSchema = SubagentEventBaseSchema.extend({
  status: z.enum(["completed", "error", "aborted"]),
  summary: z.string().max(20_000),
  errorMessage: z.string().min(1).max(4_000).optional(),
  usage: AgentUsageSchema.optional()
});
export type SubagentCompletedPayload = z.infer<
  typeof SubagentCompletedPayloadSchema
>;

export const AgentMessageCompletedPayloadSchema = AgentEventIdentitySchema.extend({
  role: z.literal("assistant"),
  content: z.string(),
  thinking: z.string().optional(),
  stopReason: z.string().min(1).optional(),
  usage: AgentUsageSchema.optional()
});
export type AgentMessageCompletedPayload = z.infer<typeof AgentMessageCompletedPayloadSchema>;

export const AgentToolRequestedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown(),
  runtime: AgentRuntimeRefSchema
});
export type AgentToolRequestedPayload = z.infer<typeof AgentToolRequestedPayloadSchema>;

export const AgentToolCallStreamPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  streamId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
  phase: z.enum(["start", "delta", "end"]),
  argumentsDelta: z.string(),
  args: z.unknown().optional(),
  runtime: AgentRuntimeRefSchema
});
export type AgentToolCallStreamPayload = z.infer<typeof AgentToolCallStreamPayloadSchema>;

export const AgentToolCompletedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  resultSummary: z.string().max(4_000),
  isError: z.boolean(),
  runtime: AgentRuntimeRefSchema
});
export type AgentToolCompletedPayload = z.infer<typeof AgentToolCompletedPayloadSchema>;

export const LearningImitationResultUpdatedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  stageId: LearningImitationStageIdSchema,
  update: LearningImitationWritePayloadSchema,
  runtime: AgentRuntimeRefSchema
});
export type LearningImitationResultUpdatedPayload = z.infer<
  typeof LearningImitationResultUpdatedPayloadSchema
>;

export const SubagentAuthoringDraftUpdatedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  draft: SubagentAuthoringDraftSchema,
  runtime: AgentRuntimeRefSchema
});
export type SubagentAuthoringDraftUpdatedPayload = z.infer<
  typeof SubagentAuthoringDraftUpdatedPayloadSchema
>;

export const WorkspaceEditorMutationTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("expert-draft-file"),
    documentId: z.string().trim().min(1).max(4_096),
    sectionId: z.string().trim().min(1).max(120),
    fileKind: z.enum(["body", "characterState"])
  }),
  z.object({
    kind: z.literal("expert-draft-section-creation"),
    sections: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(240),
          wordCountRequirement: z.string().max(1_000),
          provisionalSectionId: z.string().trim().min(1).max(120)
        })
      )
      .min(1)
      .max(100),
    afterSectionId: z.string().trim().min(1).max(120).optional()
  }),
  z.object({
    kind: z.literal("expert-draft-section-rename"),
    sectionId: z.string().trim().min(1).max(120),
    previousTitle: z.string().trim().min(1).max(240),
    title: z.string().trim().min(1).max(240)
  }),
  z.object({
    kind: z.literal("expert-draft-section-deletion"),
    sectionId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(240)
  }),
  z.object({
    kind: z.literal("character-file"),
    documentId: z.string().trim().min(1).max(4_096),
    itemId: z.string().trim().min(1).max(512).optional()
  }),
  z.object({
    kind: z.literal("character-structure"),
    mutation: z.discriminatedUnion("type", [
      z.object({ type: z.literal("createItem"), title: z.string().trim().min(1).max(256), provisionalItemId: z.string().trim().min(1).max(512) }),
      z.object({ type: z.literal("updateItem"), itemId: z.string().trim().min(1).max(512), previousTitle: z.string().trim().min(1).max(256), title: z.string().trim().min(1).max(256) }),
      z.object({ type: z.literal("moveItem"), itemId: z.string().trim().min(1).max(512), direction: z.enum(["up", "down"]), title: z.string().trim().min(1).max(256) }),
      z.object({ type: z.literal("deleteItem"), itemId: z.string().trim().min(1).max(512), title: z.string().trim().min(1).max(256), deletedText: z.string().max(SHORT_WORKSPACE_FILE_MAX_CHARACTERS) })
    ])
  })
]);
export type WorkspaceEditorMutationTarget = z.infer<
  typeof WorkspaceEditorMutationTargetSchema
>;

export const WorkspaceEditorMutationPayloadSchema = z
  .object({
    sessionId: z.string().min(1),
    runId: z.string().min(1),
    toolCallId: z.string().min(1),
    workspaceId: z.string().min(1).max(240),
    stageId: ShortWorkspaceStageIdSchema,
    text: z.string().max(SHORT_WORKSPACE_FILE_MAX_CHARACTERS),
    mutationTarget: WorkspaceEditorMutationTargetSchema.optional(),
    baseRevision: z.string().regex(/^v1:\d+:[0-9a-f]{8}$/),
    summary: z.string().min(1).max(1_000),
    runtime: AgentRuntimeRefSchema
  })
  .superRefine((value, context) => {
    if (
      value.mutationTarget !== undefined &&
      value.mutationTarget.kind.startsWith("expert-draft") &&
      value.stageId !== "draft"
    ) {
      context.addIssue({
        code: "custom",
        path: ["mutationTarget"],
        message: "Expert draft mutations must target the draft stage."
      });
    }
    if (value.stageId === "draft" && value.mutationTarget === undefined) {
      context.addIssue({
        code: "custom",
        path: ["mutationTarget"],
        message:
          "Draft mutations must target a physical file, section creation, section rename, or section deletion."
      });
    }
    if (
      value.mutationTarget?.kind.startsWith("character-") &&
      value.stageId !== "character_design"
    ) {
      context.addIssue({
        code: "custom",
        path: ["mutationTarget"],
        message: "Character mutations must target character_design."
      });
    }
  });
export type WorkspaceEditorMutationPayload = z.infer<
  typeof WorkspaceEditorMutationPayloadSchema
>;

const LongProposalBasePayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  bookId: LongBookIdSchema,
  agentId: LongAgentIdSchema,
  summary: z.string().trim().min(1).max(1_000),
  runtime: AgentRuntimeRefSchema
});

export const LongMutationProposalPayloadSchema =
  LongProposalBasePayloadSchema.extend({
    batch: LongWorkspaceOperationBatchSchema,
    baseProjectRevision: z.number().int().nonnegative()
  });
export type LongMutationProposalPayload = z.infer<
  typeof LongMutationProposalPayloadSchema
>;

export const LongWorldbuildingFileChangeSchema = z
  .object({
    categoryId: z.string().trim().min(3).max(160),
    itemId: z.string().trim().min(3).max(160).optional(),
    fileId: LongFileIdSchema,
    filePath: LongProjectRelativePathSchema,
    title: z.string().trim().min(1).max(256),
    operation: z.enum(["create", "write", "edit"]),
    beforeText: z.string().max(1_000_000),
    afterText: z.string().max(1_000_000),
    beforeRevision: LongFileRevisionSchema.nullable(),
    nextRevision: LongFileRevisionSchema
  })
  .strict();
export type LongWorldbuildingFileChange = z.infer<
  typeof LongWorldbuildingFileChangeSchema
>;

export const LongWorldbuildingFileProposalPayloadSchema =
  LongProposalBasePayloadSchema.extend({
    batch: LongWorkspaceOperationBatchSchema,
    baseProjectRevision: z.number().int().nonnegative(),
    files: z.array(LongWorldbuildingFileChangeSchema).min(1).max(100)
  }).superRefine((value, context) => {
    const fileIds = new Set(value.files.map(({ fileId }) => fileId));
    if (fileIds.size !== value.files.length) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "Worldbuilding file proposals must target unique files."
      });
    }
    const proposedFileIds = new Set(
      value.batch.documentWrites.map(({ fileId }) => fileId)
    );
    for (const [index, file] of value.files.entries()) {
      if (
        file.operation !== "create" &&
        !proposedFileIds.has(file.fileId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "fileId"],
          message:
            "Worldbuilding write and edit changes must have a document write proposal."
        });
      }
      if (
        file.operation === "create" &&
        file.beforeRevision !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "beforeRevision"],
          message: "Created worldbuilding files cannot have a prior revision."
        });
      }
    }
  });
export type LongWorldbuildingFileProposalPayload = z.infer<
  typeof LongWorldbuildingFileProposalPayloadSchema
>;

export const LONG_CHARACTER_DOCUMENTS = [
  "core_profile",
  "relationships",
  "current_state",
  "history"
] as const;
export const LongCharacterDocumentSchema = z.enum(
  LONG_CHARACTER_DOCUMENTS
);
export type LongCharacterDocument = z.infer<
  typeof LongCharacterDocumentSchema
>;

/** Stage-level overview is proposed alongside character file changes. */
export const LONG_CHARACTER_OVERVIEW_CHANGE_ID =
  "characters_overview" as const;
export const LONG_CHARACTER_FILE_CHANGE_DOCUMENTS = [
  ...LONG_CHARACTER_DOCUMENTS,
  "overview"
] as const;
export const LongCharacterFileChangeDocumentSchema = z.enum(
  LONG_CHARACTER_FILE_CHANGE_DOCUMENTS
);
export type LongCharacterFileChangeDocument = z.infer<
  typeof LongCharacterFileChangeDocumentSchema
>;

export const LongCharacterFileChangeSchema = z
  .object({
    characterId: z.string().trim().min(3).max(160),
    characterName: z.string().trim().min(1).max(256),
    document: LongCharacterFileChangeDocumentSchema,
    fileId: LongFileIdSchema,
    filePath: LongProjectRelativePathSchema,
    title: z.string().trim().min(1).max(256),
    operation: z.enum(["create", "write", "edit"]),
    beforeText: z.string().max(1_000_000),
    afterText: z.string().max(1_000_000),
    beforeRevision: LongFileRevisionSchema.nullable(),
    nextRevision: LongFileRevisionSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.document === "overview") {
      if (value.characterId !== LONG_CHARACTER_OVERVIEW_CHANGE_ID) {
        context.addIssue({
          code: "custom",
          path: ["characterId"],
          message:
            "Character overview changes must use the stage-level overview id."
        });
      }
      return;
    }
    if (value.characterId === LONG_CHARACTER_OVERVIEW_CHANGE_ID) {
      context.addIssue({
        code: "custom",
        path: ["characterId"],
        message:
          "Stage-level overview id is reserved for character overview changes."
      });
    }
  });
export type LongCharacterFileChange = z.infer<
  typeof LongCharacterFileChangeSchema
>;

export const LongCharacterFileProposalPayloadSchema =
  LongProposalBasePayloadSchema.extend({
    batch: LongWorkspaceOperationBatchSchema,
    baseProjectRevision: z.number().int().nonnegative(),
    files: z.array(LongCharacterFileChangeSchema).min(1).max(100)
  }).superRefine((value, context) => {
    const fileIds = new Set(value.files.map(({ fileId }) => fileId));
    if (fileIds.size !== value.files.length) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "Character file proposals must target unique files."
      });
    }
    const proposedFileIds = new Set(
      value.batch.documentWrites.map(({ fileId }) => fileId)
    );
    for (const [index, file] of value.files.entries()) {
      if (
        file.operation !== "create" &&
        !proposedFileIds.has(file.fileId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "fileId"],
          message:
            "Character write and edit changes must have a document write proposal."
        });
      }
      if (file.operation === "create" && file.beforeRevision !== null) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "beforeRevision"],
          message: "Created character files cannot have a prior revision."
        });
      }
    }
  });
export type LongCharacterFileProposalPayload = z.infer<
  typeof LongCharacterFileProposalPayloadSchema
>;

export const LONG_CONTINUITY_FILE_ROLES = [
  "foreshadowing_changes",
  "world_reveals",
  "character_current_state",
  "character_history",
  "chapter_end_state",
  "handoff"
] as const;
export const LongContinuityFileRoleSchema = z.enum(
  LONG_CONTINUITY_FILE_ROLES
);
export type LongContinuityFileRole = z.infer<
  typeof LongContinuityFileRoleSchema
>;

export const LongContinuityFileChangeSchema = z
  .object({
    chapterCardId: LongChapterCardIdSchema,
    role: LongContinuityFileRoleSchema,
    characterId: LongCharacterIdSchema.nullable().default(null),
    fileId: LongFileIdSchema,
    filePath: LongProjectRelativePathSchema,
    title: z.string().trim().min(1).max(256),
    operation: z.enum(["create", "write", "edit"]),
    beforeText: z.string().max(1_000_000),
    afterText: z.string().max(1_000_000),
    beforeRevision: LongFileRevisionSchema.nullable(),
    nextRevision: LongFileRevisionSchema
  })
  .strict()
  .superRefine((file, context) => {
    const isCharacterRole =
      file.role === "character_current_state" ||
      file.role === "character_history";
    if (isCharacterRole !== (file.characterId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["characterId"],
        message:
          "Only character continuity roles may carry a character id."
      });
    }
    if ((file.operation === "create") !== (file.beforeRevision === null)) {
      context.addIssue({
        code: "custom",
        path: ["beforeRevision"],
        message:
          "Created continuity files require a null prior revision; writes and edits require one."
      });
    }
  });
export type LongContinuityFileChange = z.infer<
  typeof LongContinuityFileChangeSchema
>;

export const LongContinuityFileProposalPayloadSchema =
  LongProposalBasePayloadSchema.extend({
    batch: LongWorkspaceOperationBatchSchema,
    baseProjectRevision: z.number().int().nonnegative(),
    files: z.array(LongContinuityFileChangeSchema).min(1).max(1_024)
  }).superRefine((value, context) => {
    if (value.agentId !== "continuity_ledger") {
      context.addIssue({
        code: "custom",
        path: ["agentId"],
        message:
          "Continuity file proposals must be authored by the continuity ledger agent."
      });
    }
    const fileIds = new Set(value.files.map(({ fileId }) => fileId));
    if (fileIds.size !== value.files.length) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "Continuity file proposals must target unique files."
      });
    }
    const createdTargets = new Map<
      string,
      {
        chapterCardId: string;
        role: LongContinuityFileRole;
        characterId: string | null;
        filePath: string;
        revision: string;
      }
    >();
    const addCreatedTarget = (
      target: {
        chapterCardId: string;
        role: LongContinuityFileRole;
        characterId: string | null;
        fileId: string;
        filePath: string;
        revision: string;
      },
      operationIndex: number
    ): void => {
      if (createdTargets.has(target.fileId)) {
        context.addIssue({
          code: "custom",
          path: ["batch", "operations", operationIndex],
          message:
            "Continuity file proposals cannot create the same file twice."
        });
        return;
      }
      createdTargets.set(target.fileId, target);
    };
    value.batch.operations.forEach((operation, operationIndex) => {
      if (operation.type === "chapterContinuity.worldReveals.create") {
        addCreatedTarget(
          {
            chapterCardId: operation.chapterCardId,
            role: "world_reveals",
            characterId: null,
            fileId: operation.file.id,
            filePath: operation.file.path,
            revision: operation.file.revision
          },
          operationIndex
        );
        return;
      }
      if (operation.type === "chapterContinuity.character.create") {
        addCreatedTarget(
          {
            chapterCardId: operation.chapterCardId,
            role: "character_current_state",
            characterId: operation.characterId,
            fileId: operation.currentState.id,
            filePath: operation.currentState.path,
            revision: operation.currentState.revision
          },
          operationIndex
        );
        addCreatedTarget(
          {
            chapterCardId: operation.chapterCardId,
            role: "character_history",
            characterId: operation.characterId,
            fileId: operation.history.id,
            filePath: operation.history.path,
            revision: operation.history.revision
          },
          operationIndex
        );
        return;
      }
      context.addIssue({
        code: "custom",
        path: ["batch", "operations", operationIndex, "type"],
        message:
          "Continuity file proposals may only create chapter continuity files."
      });
    });
    if (value.batch.documentWrites.length !== value.files.length) {
      context.addIssue({
        code: "custom",
        path: ["batch", "documentWrites"],
        message:
          "Continuity file proposals require exactly one document write per file change."
      });
    }
    for (const [index, file] of value.files.entries()) {
      const write = value.batch.documentWrites.find(
        ({ fileId }) => fileId === file.fileId
      );
      const modeMatches =
        file.operation === "create"
          ? write?.mode === "create" && write.expectedRevision === null
          : write?.mode !== "create" &&
            write?.expectedRevision === file.beforeRevision;
      const createdTarget = createdTargets.get(file.fileId);
      if (
        !write ||
        !modeMatches ||
        write.content !== file.afterText ||
        write.nextRevision !== file.nextRevision
      ) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "fileId"],
          message:
            "Each continuity file change must match its document write and revisions."
        });
      }
      if (file.operation === "create") {
        if (
          !createdTarget ||
          createdTarget.chapterCardId !== file.chapterCardId ||
          createdTarget.role !== file.role ||
          createdTarget.characterId !== file.characterId ||
          createdTarget.filePath !== file.filePath ||
          createdTarget.revision !== file.nextRevision ||
          file.beforeText !== ""
        ) {
          context.addIssue({
            code: "custom",
            path: ["files", index],
            message:
              "Created continuity file metadata must match its chapter operation and start empty."
          });
        }
      } else if (createdTarget) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "operation"],
          message:
            "A newly created continuity file must be displayed as a create operation."
        });
      }
    }
    for (const fileId of createdTargets.keys()) {
      if (!fileIds.has(fileId)) {
        context.addIssue({
          code: "custom",
          path: ["batch", "operations"],
          message:
            "Every created continuity file must have a matching displayed file change."
        });
      }
    }
  });
export type LongContinuityFileProposalPayload = z.infer<
  typeof LongContinuityFileProposalPayloadSchema
>;

export const LongChapterBodyChangeSchema = z
  .object({
    chapterCardId: LongChapterCardIdSchema,
    chapterTitle: z.string().trim().min(1).max(256),
    fileId: LongFileIdSchema,
    filePath: LongProjectRelativePathSchema,
    operation: z.enum(["create", "write", "edit"]),
    beforeText: z.string().max(10_000_000),
    afterText: z.string().max(10_000_000),
    beforeRevision: LongFileRevisionSchema,
    nextRevision: LongFileRevisionSchema
  })
  .strict();
export type LongChapterBodyChange = z.infer<
  typeof LongChapterBodyChangeSchema
>;

export const LongChapterWriteProposalPayloadSchema =
  LongProposalBasePayloadSchema.extend({
    batch: LongWorkspaceOperationBatchSchema,
    baseProjectRevision: z.number().int().nonnegative(),
    file: LongChapterBodyChangeSchema
  }).superRefine((value, context) => {
    const documentWrite = value.batch.documentWrites.find(
      ({ fileId }) => fileId === value.file.fileId
    );
    if (
      value.batch.operations.length !== 0 ||
      value.batch.documentWrites.length !== 1 ||
      !documentWrite ||
      documentWrite.mode !== "replace" ||
      documentWrite.expectedRevision !== value.file.beforeRevision ||
      documentWrite.nextRevision !== value.file.nextRevision ||
      documentWrite.content !== value.file.afterText
    ) {
      context.addIssue({
        code: "custom",
        path: ["batch", "documentWrites"],
        message:
          "Chapter proposals must contain exactly one matching body document write."
      });
    }
  });
export type LongChapterWriteProposalPayload = z.infer<
  typeof LongChapterWriteProposalPayloadSchema
>;

export const LongLedgerCommitProposalPayloadSchema =
  LongProposalBasePayloadSchema.extend({
    input: LongCommitChapterInputSchema
  }).superRefine((value, context) => {
    if (value.input.bookId !== value.bookId) {
      context.addIssue({
        code: "custom",
        path: ["input", "bookId"],
        message: "Ledger proposal input must belong to the proposal book."
      });
    }
  });
export type LongLedgerCommitProposalPayload = z.infer<
  typeof LongLedgerCommitProposalPayloadSchema
>;

export const LongWritingScopeSchema = z.enum([
  "chapter",
  "arc",
  "volume"
]);
export type LongWritingScope = z.infer<typeof LongWritingScopeSchema>;

export const LongChapterTripletRoleSchema = z.enum([
  "body",
  "character_state",
  "handoff"
]);
export type LongChapterTripletRole = z.infer<
  typeof LongChapterTripletRoleSchema
>;

export const LongChapterReadinessStatusSchema = z.enum([
  "empty",
  "partial",
  "ready_to_commit"
]);
export type LongChapterReadinessStatus = z.infer<
  typeof LongChapterReadinessStatusSchema
>;

export const LongChapterReadinessSchema = z
  .object({
    chapterCardId: LongChapterCardIdSchema,
    title: z.string().trim().min(1).max(256),
    status: LongChapterReadinessStatusSchema,
    missingFiles: z
      .array(LongChapterTripletRoleSchema)
      .max(3)
  })
  .strict()
  .superRefine((value, context) => {
    const uniqueMissing = new Set(value.missingFiles);
    if (uniqueMissing.size !== value.missingFiles.length) {
      context.addIssue({
        code: "custom",
        path: ["missingFiles"],
        message: "Chapter readiness cannot repeat a missing triplet file."
      });
    }
    const expectedStatus =
      value.missingFiles.length === 0
        ? "ready_to_commit"
        : value.missingFiles.includes("body")
          ? "empty"
          : "partial";
    if (value.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message:
          "Chapter readiness status must match the missing body evidence or legacy output files."
      });
    }
  });
export type LongChapterReadiness = z.infer<
  typeof LongChapterReadinessSchema
>;

export const LongChapterDispatchProposalPayloadSchema =
  LongProposalBasePayloadSchema.extend({
    scope: LongWritingScopeSchema,
    chapterCardId: LongChapterCardIdSchema,
    title: z.string().trim().min(1).max(256),
    chapters: z.array(LongChapterReadinessSchema).min(1).max(100_000),
    workspaceRevision: z.number().int().nonnegative(),
    projectRevision: z.number().int().nonnegative()
  }).superRefine((value, context) => {
    const chapterIds = value.chapters.map(({ chapterCardId }) => chapterCardId);
    if (new Set(chapterIds).size !== chapterIds.length) {
      context.addIssue({
        code: "custom",
        path: ["chapters"],
        message: "A chapter dispatch plan cannot repeat a chapter."
      });
    }
    if (
      value.chapters[0]?.chapterCardId !== value.chapterCardId ||
      value.chapters[0]?.title !== value.title
    ) {
      context.addIssue({
        code: "custom",
        path: ["chapters", 0],
        message:
          "Dispatch summary chapter must match the first scheduled chapter."
      });
    }
  });
export type LongChapterDispatchProposalPayload = z.infer<
  typeof LongChapterDispatchProposalPayloadSchema
>;

const LibraryEditorMutationBaseSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  domain: z.enum(["material", "skill"]),
  libraryId: z.string().trim().min(1).max(512),
  title: z.string().trim().min(1).max(256),
  text: z.string().max(SHORT_WORKSPACE_FILE_MAX_CHARACTERS),
  baseRevision: z.string().regex(/^v1:\d+:[0-9a-f]{8}$/),
  baseProjectRevision: z.number().int().nonnegative().optional(),
  summary: z.string().trim().min(1).max(1_000),
  runtime: AgentRuntimeRefSchema
});

export const LibraryEditorMutationPayloadSchema = z
  .discriminatedUnion("operation", [
    LibraryEditorMutationBaseSchema.extend({
      operation: z.literal("create"),
      stageId: z.string().trim().min(1).max(120)
    }),
    LibraryEditorMutationBaseSchema.extend({
      operation: z.literal("edit"),
      stageId: z.string().trim().min(1).max(120),
      entryId: z.string().trim().min(1).max(512),
      documentId: z.string().trim().min(1).max(4_096)
    }),
    LibraryEditorMutationBaseSchema.extend({
      operation: z.literal("edit-overview"),
      documentId: z.string().trim().min(1).max(4_096)
    })
  ])
  .superRefine((value, context) => {
    if (value.operation === "edit-overview") return;
    const validStage =
      value.domain === "material"
        ? MaterialStageIdSchema.safeParse(value.stageId).success
        : SkillStageIdSchema.safeParse(value.stageId).success;
    if (!validStage) {
      context.addIssue({
        code: "custom",
        path: ["stageId"],
        message: `Stage ${value.stageId} does not belong to ${value.domain}.`
      });
    }
  });
export type LibraryEditorMutationPayload = z.infer<
  typeof LibraryEditorMutationPayloadSchema
>;

export const WorkspaceStageSelectionPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolCallId: z.string().min(1),
  workspaceId: z.string().min(1).max(240),
  stageId: ShortWorkspaceStageIdSchema,
  runtime: AgentRuntimeRefSchema
});
export type WorkspaceStageSelectionPayload = z.infer<
  typeof WorkspaceStageSelectionPayloadSchema
>;

export const AgentErrorPayloadSchema = z.object({
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  runtime: AgentRuntimeRefSchema.optional()
});
export type AgentErrorPayload = z.infer<typeof AgentErrorPayloadSchema>;

export const AgentMessageDeltaEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.message_delta"),
  payload: AgentMessageDeltaPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentEvaluationSnapshotEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("agent.evaluation_snapshot"),
    payload: AgentEvaluationSnapshotPayloadSchema
  }).superRefine(validateAgentEventContext);

export const AgentTurnStartedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.turn_started"),
  payload: AgentTurnStartedPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentRetryScheduledEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.retry_scheduled"),
  payload: AgentRetryScheduledPayloadSchema
}).superRefine(validateAgentEventContext);

export const SubagentStartedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("subagent.started"),
  payload: SubagentStartedPayloadSchema
}).superRefine(validateAgentEventContext);

export const SubagentActivityEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("subagent.activity"),
  payload: SubagentActivityPayloadSchema
}).superRefine(validateAgentEventContext);

export const SubagentCompletedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("subagent.completed"),
  payload: SubagentCompletedPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentThinkingDeltaEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.thinking_delta"),
  payload: AgentThinkingDeltaPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentMessageCompletedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.message_completed"),
  payload: AgentMessageCompletedPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentUsageObservedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.usage_observed"),
  payload: AgentUsageObservedPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentToolRequestedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("tool.call_requested"),
  payload: AgentToolRequestedPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentToolCallStreamEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("tool.call_stream"),
  payload: AgentToolCallStreamPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentToolCompletedEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("tool.execution_completed"),
  payload: AgentToolCompletedPayloadSchema
}).superRefine(validateAgentEventContext);

export const LearningImitationResultUpdatedEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("learning_imitation.result_updated"),
    payload: LearningImitationResultUpdatedPayloadSchema
  }).superRefine(validateAgentEventContext);

export const SubagentAuthoringDraftUpdatedEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("subagent_authoring.draft_updated"),
    payload: SubagentAuthoringDraftUpdatedPayloadSchema
  }).superRefine(validateAgentEventContext);

export const WorkspaceEditorMutationEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("workspace.editor_mutation"),
  payload: WorkspaceEditorMutationPayloadSchema
}).superRefine(validateAgentEventContext);

export const LongMutationProposalEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("long.mutation_proposal"),
    payload: LongMutationProposalPayloadSchema
  }).superRefine(validateAgentEventContext);

export const LongWorldbuildingFileProposalEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("long.worldbuilding_file_proposal"),
    payload: LongWorldbuildingFileProposalPayloadSchema
  }).superRefine(validateAgentEventContext);

export const LongCharacterFileProposalEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("long.character_file_proposal"),
    payload: LongCharacterFileProposalPayloadSchema
  }).superRefine(validateAgentEventContext);

export const LongContinuityFileProposalEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("long.continuity_file_proposal"),
    payload: LongContinuityFileProposalPayloadSchema
  }).superRefine(validateAgentEventContext);

export const LongChapterWriteProposalEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("long.chapter_write_proposal"),
    payload: LongChapterWriteProposalPayloadSchema
  }).superRefine(validateAgentEventContext);

export const LongLedgerCommitProposalEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("long.ledger_commit_proposal"),
    payload: LongLedgerCommitProposalPayloadSchema
  }).superRefine(validateAgentEventContext);

export const LongChapterDispatchProposalEventEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("long.chapter_dispatch_proposal"),
    payload: LongChapterDispatchProposalPayloadSchema
  }).superRefine(validateAgentEventContext);

export const LibraryEditorMutationEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("library.editor_mutation"),
  payload: LibraryEditorMutationPayloadSchema
}).superRefine(validateAgentEventContext);

export const WorkspaceStageSelectionEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("workspace.stage_selection"),
  payload: WorkspaceStageSelectionPayloadSchema
}).superRefine(validateAgentEventContext);

export const AgentErrorEventEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("agent.error"),
  payload: AgentErrorPayloadSchema
}).superRefine(validateAgentEventContext);

function validateAgentEventContext(
  value: {
    context: { sessionId?: string | undefined; runId?: string | undefined };
    payload: { sessionId: string; runId: string };
  },
  context: z.core.$RefinementCtx<any>
): void {
  if (value.context.sessionId !== value.payload.sessionId) {
    context.addIssue({
      code: "custom",
      path: ["context", "sessionId"],
      message: "Envelope and payload sessionId must match."
    });
  }
  if (value.context.runId !== value.payload.runId) {
    context.addIssue({
      code: "custom",
      path: ["context", "runId"],
      message: "Envelope and payload runId must match."
    });
  }
}

export type AgentMessageDeltaEventEnvelope = Envelope<AgentMessageDeltaPayload, "agent.message_delta">;
export type AgentEvaluationSnapshotEventEnvelope = Envelope<
  AgentEvaluationSnapshotPayload,
  "agent.evaluation_snapshot"
>;
export type AgentTurnStartedEventEnvelope = Envelope<
  AgentTurnStartedPayload,
  "agent.turn_started"
>;
export type AgentRetryScheduledEventEnvelope = Envelope<
  AgentRetryScheduledPayload,
  "agent.retry_scheduled"
>;
export type SubagentStartedEventEnvelope = Envelope<
  SubagentStartedPayload,
  "subagent.started"
>;
export type SubagentActivityEventEnvelope = Envelope<
  SubagentActivityPayload,
  "subagent.activity"
>;
export type SubagentCompletedEventEnvelope = Envelope<
  SubagentCompletedPayload,
  "subagent.completed"
>;
export type AgentThinkingDeltaEventEnvelope = Envelope<AgentThinkingDeltaPayload, "agent.thinking_delta">;
export type AgentMessageCompletedEventEnvelope = Envelope<AgentMessageCompletedPayload, "agent.message_completed">;
export type AgentUsageObservedEventEnvelope = Envelope<
  AgentUsageObservedPayload,
  "agent.usage_observed"
>;
export type AgentToolRequestedEventEnvelope = Envelope<AgentToolRequestedPayload, "tool.call_requested">;
export type AgentToolCallStreamEventEnvelope = Envelope<
  AgentToolCallStreamPayload,
  "tool.call_stream"
>;
export type AgentToolCompletedEventEnvelope = Envelope<AgentToolCompletedPayload, "tool.execution_completed">;
export type LearningImitationResultUpdatedEventEnvelope = Envelope<
  LearningImitationResultUpdatedPayload,
  "learning_imitation.result_updated"
>;
export type SubagentAuthoringDraftUpdatedEventEnvelope = Envelope<
  SubagentAuthoringDraftUpdatedPayload,
  "subagent_authoring.draft_updated"
>;
export type WorkspaceEditorMutationEventEnvelope = Envelope<
  WorkspaceEditorMutationPayload,
  "workspace.editor_mutation"
>;
export type LongMutationProposalEventEnvelope = Envelope<
  LongMutationProposalPayload,
  "long.mutation_proposal"
>;
export type LongWorldbuildingFileProposalEventEnvelope = Envelope<
  LongWorldbuildingFileProposalPayload,
  "long.worldbuilding_file_proposal"
>;
export type LongCharacterFileProposalEventEnvelope = Envelope<
  LongCharacterFileProposalPayload,
  "long.character_file_proposal"
>;
export type LongContinuityFileProposalEventEnvelope = Envelope<
  LongContinuityFileProposalPayload,
  "long.continuity_file_proposal"
>;
export type LongChapterWriteProposalEventEnvelope = Envelope<
  LongChapterWriteProposalPayload,
  "long.chapter_write_proposal"
>;
export type LongLedgerCommitProposalEventEnvelope = Envelope<
  LongLedgerCommitProposalPayload,
  "long.ledger_commit_proposal"
>;
export type LongChapterDispatchProposalEventEnvelope = Envelope<
  LongChapterDispatchProposalPayload,
  "long.chapter_dispatch_proposal"
>;
export type LibraryEditorMutationEventEnvelope = Envelope<
  LibraryEditorMutationPayload,
  "library.editor_mutation"
>;
export type WorkspaceStageSelectionEventEnvelope = Envelope<
  WorkspaceStageSelectionPayload,
  "workspace.stage_selection"
>;
export type AgentErrorEventEnvelope = Envelope<AgentErrorPayload, "agent.error">;
