import { toRaw } from "vue";
import {
  AgentEvaluationSnapshotSchema,
  CharacterStructureMutationSchema,
  LibraryAgentWorkspaceSnapshotSchema,
  LongCharacterFileChangeSchema,
  LongChapterBodyChangeSchema,
  LongWorldbuildingFileChangeSchema,
  LongWorkspaceOperationBatchSchema,
  ScriptWorkspaceSnapshotSchema,
  ShortWorkspaceSnapshotSchema,
  createExpertDraftDirectoryRevision,
  createShortWorkspaceContentRevision,
  type AgentRuntimeRef,
  type AgentUsage,
  type LongCharacterFileChange
} from "@deepwrite/contracts";
import type {
  AgentApprovalMode,
  AgentEditProposal,
  AgentSubagentProcessingStep,
  AgentSubagentRun,
  AgentTextDiffHunk,
  AgentTextDiffLine,
  AgentToolTrace,
  ChatMessage
} from "../types/conversation";

const MAX_STORED_CONVERSATIONS = 20;

interface ConversationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface AgentConversationPersistenceRecord {
  sessionId: string;
  messages: ChatMessage[];
  draft: string;
  approvalMode: AgentApprovalMode;
  createdAt: string;
  updatedAt: string;
  temperature: number;
}

export interface AgentConversationPersistenceSnapshot {
  version: 1;
  activeSessionId: string;
  conversations: AgentConversationPersistenceRecord[];
}

function cloneTextDiffLine(line: AgentTextDiffLine): AgentTextDiffLine {
  line = toRaw(line);
  return { ...line };
}

function cloneTextDiffHunk(hunk: AgentTextDiffHunk): AgentTextDiffHunk {
  hunk = toRaw(hunk);
  return {
    ...hunk,
    lines: hunk.lines.map(cloneTextDiffLine)
  };
}

export function cloneJsonRecord<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(toRaw(value))) as Value;
}

export function cloneEditProposal(proposal: AgentEditProposal): AgentEditProposal {
  try {
    return cloneJsonRecord(proposal);
  } catch {
    proposal = toRaw(proposal);
    return {
      ...proposal,
      toolCallIds: [...proposal.toolCallIds],
      hunks: proposal.hunks.map(cloneTextDiffHunk)
    };
  }
}

export function cloneSubagentRun(run: AgentSubagentRun): AgentSubagentRun {
  run = toRaw(run);
  return {
    ...run,
    runtime: { ...run.runtime },
    ...(run.retry ? { retry: { ...run.retry } } : {}),
    ...(run.usage ? { usage: { ...run.usage } } : {}),
    toolCalls: run.toolCalls.map((toolCall) => ({ ...toolCall })),
    processingSteps: run.processingSteps.map((step) => ({ ...step }))
  };
}

function parseStoredLibraryTarget(
  value: unknown
): AgentEditProposal["libraryTarget"] | undefined {
  if (
    !isRecord(value) ||
    (value.operation !== "create" && value.operation !== "edit") ||
    (value.domain !== "material" && value.domain !== "skill") ||
    typeof value.libraryId !== "string" ||
    typeof value.stageId !== "string" ||
    (value.baseProjectRevision !== undefined &&
      !nonnegativeInteger(value.baseProjectRevision)) ||
    (value.entryId !== undefined && typeof value.entryId !== "string") ||
    (value.operation === "edit" && typeof value.entryId !== "string")
  ) {
    return undefined;
  }
  return {
    operation: value.operation,
    domain: value.domain,
    libraryId: value.libraryId,
    stageId: value.stageId,
    ...(value.baseProjectRevision === undefined
      ? {}
      : { baseProjectRevision: value.baseProjectRevision }),
    ...(value.entryId === undefined ? {} : { entryId: value.entryId })
  };
}

function cloneJsonValue(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as unknown;
  }
}

function cloneEvaluationSnapshot(
  snapshot: ChatMessage["evaluationSnapshot"]
): ChatMessage["evaluationSnapshot"] | undefined {
  if (!snapshot) return undefined;
  try {
    const parsed = AgentEvaluationSnapshotSchema.safeParse(
      cloneJsonValue(toRaw(snapshot))
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function cloneMessage(message: ChatMessage): ChatMessage {
  message = toRaw(message);
  const evaluationSnapshot = cloneEvaluationSnapshot(message.evaluationSnapshot);
  const { evaluationSnapshot: _ignored, ...rest } = message;
  return {
    ...rest,
    ...(evaluationSnapshot ? { evaluationSnapshot } : {}),
    ...(message.retry ? { retry: { ...message.retry } } : {}),
    ...(message.attachments
      ? { attachments: message.attachments.map((attachment) => ({ ...attachment })) }
      : {}),
    ...(message.tools
      ? { tools: message.tools.map((tool) => ({ ...tool })) }
      : {}),
    ...(message.toolCalls
      ? { toolCalls: message.toolCalls.map((toolCall) => ({ ...toolCall })) }
      : {}),
    ...(message.processingSteps
      ? { processingSteps: message.processingSteps.map((step) => ({ ...step })) }
      : {}),
    ...(message.subagentRuns
      ? {
          subagentRuns: message.subagentRuns.map(cloneSubagentRun)
        }
      : {}),
    ...(message.editProposals
      ? { editProposals: message.editProposals.map(cloneEditProposal) }
      : {})
  };
}

export function cloneMessageForPersistence(message: ChatMessage): ChatMessage {
  const cloned = cloneMessage(message);
  // Durable conversation history is an observation log. `streaming` only
  // exists in the live UI; restore already treats it as stopped.
  if (cloned.status === "streaming") {
    cloned.status = "stopped";
  }
  return cloned;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseStoredTextDiffLine(value: unknown): AgentTextDiffLine | undefined {
  if (
    !isRecord(value) ||
    !["context", "addition", "deletion"].includes(String(value.type)) ||
    typeof value.text !== "string" ||
    (value.oldLineNumber !== undefined && !nonnegativeInteger(value.oldLineNumber)) ||
    (value.newLineNumber !== undefined && !nonnegativeInteger(value.newLineNumber))
  ) {
    return undefined;
  }
  return {
    type: value.type as AgentTextDiffLine["type"],
    text: value.text,
    ...(value.oldLineNumber === undefined
      ? {}
      : { oldLineNumber: value.oldLineNumber as number }),
    ...(value.newLineNumber === undefined
      ? {}
      : { newLineNumber: value.newLineNumber as number })
  };
}

function parseStoredTextDiffHunk(value: unknown): AgentTextDiffHunk | undefined {
  if (
    !isRecord(value) ||
    !nonnegativeInteger(value.oldStart) ||
    !nonnegativeInteger(value.oldLines) ||
    !nonnegativeInteger(value.newStart) ||
    !nonnegativeInteger(value.newLines) ||
    !Array.isArray(value.lines)
  ) {
    return undefined;
  }
  const lines = value.lines
    .map(parseStoredTextDiffLine)
    .filter((line): line is AgentTextDiffLine => line !== undefined);
  if (lines.length !== value.lines.length) return undefined;
  return {
    oldStart: value.oldStart,
    oldLines: value.oldLines,
    newStart: value.newStart,
    newLines: value.newLines,
    lines
  };
}

function parseStoredDraftSectionCreationTarget(
  value: unknown
): AgentEditProposal["draftSectionCreationTarget"] | undefined {
  if (!isRecord(value) || !Array.isArray(value.sections) || value.sections.length === 0) {
    return undefined;
  }
  const sections: Array<{
    title: string;
    wordCountRequirement: string;
    provisionalSectionId: string;
    realSectionId?: string;
  }> = [];
  for (const [index, section] of value.sections.entries()) {
    if (
      !isRecord(section) ||
      typeof section.title !== "string" ||
      typeof section.wordCountRequirement !== "string" ||
      (section.realSectionId !== undefined &&
        typeof section.realSectionId !== "string")
    ) {
      return undefined;
    }
    sections.push({
      title: section.title,
      wordCountRequirement: section.wordCountRequirement,
      provisionalSectionId:
        typeof section.provisionalSectionId === "string" &&
        section.provisionalSectionId.trim()
          ? section.provisionalSectionId
          : `pending:section:legacy-${index + 1}`,
      ...(typeof section.realSectionId === "string"
        ? { realSectionId: section.realSectionId }
        : {})
    });
  }
  if (
    value.afterSectionId !== undefined &&
    typeof value.afterSectionId !== "string"
  ) {
    return undefined;
  }
  if (
    value.baseProjectRevision !== undefined &&
    !nonnegativeInteger(value.baseProjectRevision)
  ) {
    return undefined;
  }
  if (
    value.acceptedDirectoryRevision !== undefined &&
    typeof value.acceptedDirectoryRevision !== "string"
  ) {
    return undefined;
  }
  return {
    sections,
    ...(typeof value.afterSectionId === "string"
      ? { afterSectionId: value.afterSectionId }
      : {}),
    ...(typeof value.baseProjectRevision === "number"
      ? { baseProjectRevision: value.baseProjectRevision }
      : {}),
    ...(typeof value.acceptedDirectoryRevision === "string"
      ? { acceptedDirectoryRevision: value.acceptedDirectoryRevision }
      : {})
  };
}

function parseStoredDraftSectionRenameTarget(
  value: unknown
): AgentEditProposal["draftSectionRenameTarget"] | undefined {
  if (
    !isRecord(value) ||
    typeof value.sectionId !== "string" ||
    !value.sectionId.trim() ||
    typeof value.previousTitle !== "string" ||
    !value.previousTitle.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim()
  ) {
    return undefined;
  }
  if (
    value.baseProjectRevision !== undefined &&
    !nonnegativeInteger(value.baseProjectRevision)
  ) {
    return undefined;
  }
  return {
    sectionId: value.sectionId,
    previousTitle: value.previousTitle,
    title: value.title,
    ...(typeof value.baseProjectRevision === "number"
      ? { baseProjectRevision: value.baseProjectRevision }
      : {})
  };
}

function parseStoredDraftSectionDeletionTarget(
  value: unknown
): AgentEditProposal["draftSectionDeletionTarget"] | undefined {
  if (
    !isRecord(value) ||
    typeof value.sectionId !== "string" ||
    !value.sectionId.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim()
  ) {
    return undefined;
  }
  if (
    value.baseProjectRevision !== undefined &&
    !nonnegativeInteger(value.baseProjectRevision)
  ) {
    return undefined;
  }
  return {
    sectionId: value.sectionId,
    title: value.title,
    ...(typeof value.baseProjectRevision === "number"
      ? { baseProjectRevision: value.baseProjectRevision }
      : {})
  };
}

function parseStoredCharacterStructureTarget(
  value: unknown
): AgentEditProposal["characterStructureTarget"] | undefined {
  if (!isRecord(value)) return undefined;
  const mutation = CharacterStructureMutationSchema.safeParse(value.mutation);
  if (!mutation.success) return undefined;
  if (
    value.baseProjectRevision !== undefined &&
    !nonnegativeInteger(value.baseProjectRevision)
  ) {
    return undefined;
  }
  return {
    mutation: mutation.data,
    ...(value.baseProjectRevision === undefined
      ? {}
      : { baseProjectRevision: value.baseProjectRevision })
  };
}

function parseStoredLongWorldbuildingTarget(
  value: unknown
): AgentEditProposal["longWorldbuildingTarget"] | undefined {
  if (
    !isRecord(value) ||
    typeof value.bookId !== "string" ||
    !value.bookId.trim() ||
    !nonnegativeInteger(value.baseProjectRevision)
  ) {
    return undefined;
  }
  const batch = LongWorkspaceOperationBatchSchema.safeParse(value.batch);
  const file = LongWorldbuildingFileChangeSchema.safeParse(value.file);
  if (!batch.success || !file.success) return undefined;
  return {
    bookId: value.bookId,
    batch: batch.data,
    baseProjectRevision: value.baseProjectRevision,
    file: file.data
  };
}

function parseStoredLongCharacterTarget(
  value: unknown
): AgentEditProposal["longCharacterTarget"] | undefined {
  if (
    !isRecord(value) ||
    typeof value.bookId !== "string" ||
    !value.bookId.trim() ||
    !nonnegativeInteger(value.baseProjectRevision) ||
    !Array.isArray(value.files) ||
    value.files.length < 1
  ) {
    return undefined;
  }
  const batch = LongWorkspaceOperationBatchSchema.safeParse(value.batch);
  if (!batch.success) return undefined;
  const files: LongCharacterFileChange[] = [];
  for (const file of value.files) {
    const parsed = LongCharacterFileChangeSchema.safeParse(file);
    if (!parsed.success) return undefined;
    files.push(parsed.data);
  }
  return {
    bookId: value.bookId,
    batch: batch.data,
    baseProjectRevision: value.baseProjectRevision,
    files
  };
}

function parseStoredLongPlotDesignTarget(
  value: unknown
): AgentEditProposal["longPlotDesignTarget"] | undefined {
  const appliedProjectRevision = isRecord(value)
    ? value.appliedProjectRevision
    : undefined;
  if (
    !isRecord(value) ||
    typeof value.bookId !== "string" ||
    !value.bookId.trim() ||
    !nonnegativeInteger(value.baseProjectRevision) ||
    (appliedProjectRevision !== undefined &&
      !nonnegativeInteger(appliedProjectRevision))
  ) {
    return undefined;
  }
  const batch = LongWorkspaceOperationBatchSchema.safeParse(value.batch);
  if (!batch.success) return undefined;
  return {
    bookId: value.bookId,
    batch: batch.data,
    baseProjectRevision: value.baseProjectRevision,
    ...(appliedProjectRevision === undefined
      ? {}
      : { appliedProjectRevision })
  };
}

function parseStoredLongDraftTarget(
  value: unknown
): AgentEditProposal["longDraftTarget"] | undefined {
  if (
    !isRecord(value) ||
    typeof value.bookId !== "string" ||
    !value.bookId.trim()
  ) {
    return undefined;
  }
  const batch = LongWorkspaceOperationBatchSchema.safeParse(value.batch);
  const file = LongChapterBodyChangeSchema.safeParse(value.file);
  if (
    !batch.success ||
    !file.success ||
    typeof value.baseProjectRevision !== "number" ||
    !Number.isInteger(value.baseProjectRevision) ||
    value.baseProjectRevision < 0
  ) {
    return undefined;
  }
  const appliedProjectRevision =
    typeof value.appliedProjectRevision === "number" &&
    Number.isInteger(value.appliedProjectRevision) &&
    value.appliedProjectRevision >= 0
      ? value.appliedProjectRevision
      : undefined;
  return {
    bookId: value.bookId,
    batch: batch.data,
    baseProjectRevision: value.baseProjectRevision,
    ...(appliedProjectRevision === undefined
      ? {}
      : { appliedProjectRevision }),
    file: file.data
  };
}

function parseStoredEditProposal(value: unknown): AgentEditProposal | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.runId !== "string" ||
    typeof value.workspaceId !== "string" ||
    (typeof value.stageId !== "string" ||
      value.stageId.length > 120 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value.stageId)) ||
    typeof value.documentId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    !["pending", "accepting", "accepted", "rejected", "conflict", "error"].includes(
      String(value.status)
    ) ||
    typeof value.baseRevision !== "string" ||
    typeof value.proposedRevision !== "string" ||
    (value.proposedText !== undefined && typeof value.proposedText !== "string") ||
    !Array.isArray(value.toolCallIds) ||
    !value.toolCallIds.every((toolCallId) => typeof toolCallId === "string") ||
    !nonnegativeInteger(value.additions) ||
    !nonnegativeInteger(value.deletions) ||
    !Array.isArray(value.hunks) ||
    (value.truncated !== undefined && typeof value.truncated !== "boolean") ||
    (value.statusMessage !== undefined && typeof value.statusMessage !== "string") ||
    (value.laneId !== undefined && typeof value.laneId !== "string") ||
    (value.generation !== undefined &&
      (!nonnegativeInteger(value.generation) || value.generation < 1)) ||
    (value.approvalMode !== undefined &&
      value.approvalMode !== "request-approval" &&
      value.approvalMode !== "auto-approve") ||
    (value.predecessorProposalId !== undefined &&
      typeof value.predecessorProposalId !== "string") ||
    (value.sourceBaseRevision !== undefined &&
      typeof value.sourceBaseRevision !== "string") ||
    (value.decisionToken !== undefined &&
      typeof value.decisionToken !== "string") ||
    (value.provisionalExpertSection !== undefined &&
      typeof value.provisionalExpertSection !== "boolean") ||
    (value.provisionalCharacterItemId !== undefined &&
      typeof value.provisionalCharacterItemId !== "string") ||
    !validDate(value.createdAt) ||
    !validDate(value.updatedAt)
  ) {
    return undefined;
  }
  const libraryTarget = parseStoredLibraryTarget(value.libraryTarget);
  const longWorldbuildingTarget = parseStoredLongWorldbuildingTarget(
    value.longWorldbuildingTarget
  );
  const longCharacterTarget = parseStoredLongCharacterTarget(
    value.longCharacterTarget
  );
  const longPlotDesignTarget = parseStoredLongPlotDesignTarget(
    value.longPlotDesignTarget
  );
  const longDraftTarget = parseStoredLongDraftTarget(value.longDraftTarget);
  if (
    (value.stageId === "library" && !libraryTarget) ||
    (value.stageId !== "library" && value.libraryTarget !== undefined) ||
    (value.stageId === "long-worldbuilding" &&
      !longWorldbuildingTarget) ||
    (value.stageId !== "long-worldbuilding" &&
      value.longWorldbuildingTarget !== undefined) ||
    (value.stageId === "long-character" && !longCharacterTarget) ||
    (value.stageId !== "long-character" &&
      value.longCharacterTarget !== undefined) ||
    (value.stageId === "long-plot-design" && !longPlotDesignTarget) ||
    (value.stageId !== "long-plot-design" &&
      value.longPlotDesignTarget !== undefined) ||
    (value.stageId === "long-draft" && !longDraftTarget) ||
    (value.stageId !== "long-draft" && value.longDraftTarget !== undefined)
  ) {
    return undefined;
  }
  const draftSectionCreationTarget = parseStoredDraftSectionCreationTarget(
    value.draftSectionCreationTarget
  );
  if (
    value.draftSectionCreationTarget !== undefined &&
    !draftSectionCreationTarget
  ) {
    return undefined;
  }
  const draftSectionRenameTarget = parseStoredDraftSectionRenameTarget(
    value.draftSectionRenameTarget
  );
  if (
    value.draftSectionRenameTarget !== undefined &&
    !draftSectionRenameTarget
  ) {
    return undefined;
  }
  const draftSectionDeletionTarget = parseStoredDraftSectionDeletionTarget(
    value.draftSectionDeletionTarget
  );
  if (
    value.draftSectionDeletionTarget !== undefined &&
    !draftSectionDeletionTarget
  ) {
    return undefined;
  }
  const characterStructureTarget = parseStoredCharacterStructureTarget(
    value.characterStructureTarget
  );
  if (
    value.characterStructureTarget !== undefined &&
    !characterStructureTarget
  ) {
    return undefined;
  }
  const hunks = value.hunks
    .map(parseStoredTextDiffHunk)
    .filter((hunk): hunk is AgentTextDiffHunk => hunk !== undefined);
  if (hunks.length !== value.hunks.length) return undefined;
  return {
    id: value.id,
    ...(value.laneId === undefined ? {} : { laneId: value.laneId }),
    ...(value.generation === undefined
      ? {}
      : { generation: value.generation as number }),
    ...(value.approvalMode === undefined
      ? {}
      : { approvalMode: value.approvalMode as AgentApprovalMode }),
    ...(value.predecessorProposalId === undefined
      ? {}
      : { predecessorProposalId: value.predecessorProposalId }),
    ...(value.sourceBaseRevision === undefined
      ? {}
      : { sourceBaseRevision: value.sourceBaseRevision }),
    ...(value.decisionToken === undefined
      ? {}
      : { decisionToken: value.decisionToken }),
    runId: value.runId,
    workspaceId: value.workspaceId,
    stageId: value.stageId as AgentEditProposal["stageId"],
    documentId: value.documentId,
    title: value.title,
    summary: value.summary,
    status: value.status === "accepting"
      ? "pending"
      : value.status as AgentEditProposal["status"],
    baseRevision: value.baseRevision,
    proposedRevision: value.proposedRevision,
    ...(value.proposedText === undefined ? {} : { proposedText: value.proposedText }),
    toolCallIds: [...value.toolCallIds] as string[],
    additions: value.additions,
    deletions: value.deletions,
    hunks,
    ...(value.truncated === undefined ? {} : { truncated: value.truncated }),
    ...(value.statusMessage === undefined ? {} : { statusMessage: value.statusMessage }),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(libraryTarget ? { libraryTarget } : {}),
    ...(longWorldbuildingTarget ? { longWorldbuildingTarget } : {}),
    ...(longCharacterTarget ? { longCharacterTarget } : {}),
    ...(longPlotDesignTarget ? { longPlotDesignTarget } : {}),
    ...(longDraftTarget ? { longDraftTarget } : {}),
    ...(draftSectionCreationTarget ? { draftSectionCreationTarget } : {}),
    ...(draftSectionRenameTarget ? { draftSectionRenameTarget } : {}),
    ...(draftSectionDeletionTarget ? { draftSectionDeletionTarget } : {}),
    ...(characterStructureTarget ? { characterStructureTarget } : {}),
    ...(value.provisionalExpertSection
      ? { provisionalExpertSection: true }
      : {}),
    ...(typeof value.provisionalCharacterItemId === "string"
      ? { provisionalCharacterItemId: value.provisionalCharacterItemId }
      : {})
  };
}

function parseStoredRuntime(value: unknown): AgentRuntimeRef | undefined {
  if (
    !isRecord(value) ||
    typeof value.provider !== "string" ||
    !value.provider ||
    typeof value.model !== "string" ||
    !value.model ||
    (value.mode !== "local-faux" && value.mode !== "provider")
  ) {
    return undefined;
  }
  return {
    provider: value.provider,
    model: value.model,
    mode: value.mode
  };
}

function parseStoredUsage(value: unknown): AgentUsage | undefined {
  if (!isRecord(value)) return undefined;
  const keys = [
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "totalTokens"
  ] as const;
  if (!keys.every((key) => nonnegativeInteger(value[key]))) return undefined;
  return {
    inputTokens: value.inputTokens as number,
    outputTokens: value.outputTokens as number,
    cacheReadTokens: value.cacheReadTokens as number,
    cacheWriteTokens: value.cacheWriteTokens as number,
    totalTokens: value.totalTokens as number
  };
}

function parseStoredToolTrace(value: unknown): AgentToolTrace | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !["preparing", "running", "completed", "error"].includes(String(value.status)) ||
    typeof value.requestedAt !== "string"
  ) {
    return undefined;
  }
  return {
    id: value.id,
    ...(typeof value.streamId === "string" ? { streamId: value.streamId } : {}),
    name: value.name,
    args: value.args,
    ...(typeof value.argumentsText === "string"
      ? { argumentsText: value.argumentsText }
      : {}),
    ...(typeof value.argumentsComplete === "boolean"
      ? { argumentsComplete: value.argumentsComplete }
      : {}),
    status: value.status as AgentToolTrace["status"],
    requestedAt: value.requestedAt,
    ...(typeof value.completedAt === "string"
      ? { completedAt: value.completedAt }
      : {}),
    ...(typeof value.resultSummary === "string"
      ? { resultSummary: value.resultSummary }
      : {}),
    ...(typeof value.isError === "boolean" ? { isError: value.isError } : {})
  };
}

function parseStoredSubagentStep(
  value: unknown
): AgentSubagentProcessingStep | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return undefined;
  }
  if (value.type === "thinking" && typeof value.content === "string") {
    return {
      id: value.id,
      type: "thinking",
      content: value.content,
      createdAt: value.createdAt
    };
  }
  if (value.type === "response" && typeof value.content === "string") {
    return {
      id: value.id,
      type: "response",
      content: value.content,
      createdAt: value.createdAt
    };
  }
  if (value.type === "tool" && typeof value.toolCallId === "string") {
    return {
      id: value.id,
      type: "tool",
      toolCallId: value.toolCallId,
      createdAt: value.createdAt
    };
  }
  return undefined;
}

function parseStoredSubagentRun(value: unknown): AgentSubagentRun | undefined {
  if (
    !isRecord(value) ||
    typeof value.parentToolCallId !== "string" ||
    typeof value.subagentRunId !== "string" ||
    typeof value.subagentId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.task !== "string" ||
    !["running", "completed", "error", "stopped", "interrupted"].includes(
      String(value.status)
    ) ||
    !validDate(value.startedAt) ||
    !Array.isArray(value.toolCalls) ||
    !Array.isArray(value.processingSteps)
  ) {
    return undefined;
  }
  const runtime = parseStoredRuntime(value.runtime);
  if (!runtime) return undefined;
  const toolCalls = value.toolCalls
    .map(parseStoredToolTrace)
    .filter((toolCall): toolCall is AgentToolTrace => toolCall !== undefined);
  const processingSteps = value.processingSteps
    .map(parseStoredSubagentStep)
    .filter((step): step is AgentSubagentProcessingStep => step !== undefined);
  if (
    toolCalls.length !== value.toolCalls.length ||
    processingSteps.length !== value.processingSteps.length
  ) {
    return undefined;
  }

  const restoredWhileRunning = value.status === "running";
  const restoredAt = new Date().toISOString();
  const normalizedToolCalls = restoredWhileRunning
    ? toolCalls.map((toolCall) =>
        toolCall.status === "preparing" || toolCall.status === "running"
          ? {
              ...toolCall,
              status: "error" as const,
              completedAt: restoredAt,
              resultSummary: toolCall.resultSummary ?? "会话恢复时子任务已停止。",
              isError: true
            }
          : toolCall
      )
    : toolCalls;
  const usage = parseStoredUsage(value.usage);
  return {
    parentToolCallId: value.parentToolCallId,
    subagentRunId: value.subagentRunId,
    subagentId: value.subagentId,
    name: value.name,
    task: value.task,
    status:
      restoredWhileRunning || value.status === "interrupted"
        ? "stopped"
        : value.status as AgentSubagentRun["status"],
    runtime,
    ...(typeof value.thinking === "string" ? { thinking: value.thinking } : {}),
    ...(typeof value.output === "string" ? { output: value.output } : {}),
    toolCalls: normalizedToolCalls,
    processingSteps,
    startedAt: value.startedAt,
    ...(typeof value.completedAt === "string"
      ? { completedAt: value.completedAt }
      : restoredWhileRunning
        ? { completedAt: restoredAt }
        : {}),
    ...(typeof value.summary === "string" ? { summary: value.summary } : {}),
    ...(typeof value.errorMessage === "string"
      ? { errorMessage: value.errorMessage }
      : restoredWhileRunning
        ? { errorMessage: "应用关闭或对话恢复时，子任务仍在运行。" }
        : {}),
    ...(usage ? { usage } : {})
  };
}

function parseStoredMessage(value: unknown): ChatMessage | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.id !== "string" ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.content !== "string" ||
    !validDate(value.createdAt)
  ) {
    return undefined;
  }

  const status = ["streaming", "completed", "stopped", "error"].includes(
    String(value.status)
  )
    ? (value.status as ChatMessage["status"])
    : undefined;
  const message: ChatMessage = {
    id: value.id,
    role: value.role,
    content: value.content,
    createdAt: value.createdAt,
    ...(status ? { status: status === "streaming" ? "stopped" : status } : {})
  };

  if (Array.isArray(value.attachments)) {
    message.attachments = value.attachments.flatMap((attachment) => {
      if (
        !isRecord(attachment) ||
        typeof attachment.id !== "string" ||
        typeof attachment.name !== "string" ||
        (attachment.kind !== "text" && attachment.kind !== "image") ||
        typeof attachment.mediaType !== "string" ||
        !nonnegativeInteger(attachment.size)
      ) {
        return [];
      }
      return [{
        id: attachment.id,
        name: attachment.name,
        kind: attachment.kind,
        mediaType: attachment.mediaType,
        size: attachment.size,
        ...(attachment.truncated === true ? { truncated: true } : {})
      }];
    });
  }

  for (const key of [
    "runId",
    "thinking",
    "processingStartedAt",
    "processingCompletedAt",
    "errorMessage"
  ] as const) {
    if (typeof value[key] === "string") {
      message[key] = value[key];
    }
  }
  if (value.activityOnly === true) message.activityOnly = true;

  if (value.evaluationSnapshot !== undefined) {
    const parsedEvaluation = AgentEvaluationSnapshotSchema.safeParse(
      value.evaluationSnapshot
    );
    if (parsedEvaluation.success) {
      message.evaluationSnapshot = parsedEvaluation.data;
    }
  }

  if (Array.isArray(value.tools)) {
    message.tools = value.tools.flatMap((tool) => {
      if (
        !isRecord(tool) ||
        typeof tool.id !== "string" ||
        typeof tool.name !== "string" ||
        !["running", "completed", "error"].includes(String(tool.status))
      ) {
        return [];
      }
      return [{
        id: tool.id,
        name: tool.name,
        status: tool.status as "running" | "completed" | "error",
        ...(typeof tool.summary === "string" ? { summary: tool.summary } : {})
      }];
    });
  }

  if (Array.isArray(value.toolCalls)) {
    message.toolCalls = value.toolCalls
      .map(parseStoredToolTrace)
      .filter((toolCall): toolCall is AgentToolTrace => toolCall !== undefined);
  }

  if (Array.isArray(value.processingSteps)) {
    const processingSteps: NonNullable<ChatMessage["processingSteps"]> = [];
    for (const step of value.processingSteps) {
      if (
        !isRecord(step) ||
        typeof step.id !== "string" ||
        typeof step.createdAt !== "string"
      ) {
        continue;
      }
      if (step.type === "thinking" && typeof step.content === "string") {
        processingSteps.push({
          id: step.id,
          type: "thinking",
          content: step.content,
          createdAt: step.createdAt
        });
        continue;
      }
      if (step.type === "response" && typeof step.content === "string") {
        processingSteps.push({
          id: step.id,
          type: "response",
          content: step.content,
          createdAt: step.createdAt
        });
        continue;
      }
      if (step.type === "tool" && typeof step.toolCallId === "string") {
        processingSteps.push({
          id: step.id,
          type: "tool",
          toolCallId: step.toolCallId,
          createdAt: step.createdAt
        });
      }
    }
    message.processingSteps = processingSteps;
  }

  if (Array.isArray(value.subagentRuns)) {
    message.subagentRuns = value.subagentRuns
      .map(parseStoredSubagentRun)
      .filter((run): run is AgentSubagentRun => run !== undefined);
  }

  if (Array.isArray(value.editProposals)) {
    const editProposals = value.editProposals
      .map(parseStoredEditProposal)
      .filter((proposal): proposal is AgentEditProposal => proposal !== undefined);
    if (
      editProposals.length !== value.editProposals.length ||
      editProposals.some((proposal) => proposal.runId !== message.runId)
    ) {
      return undefined;
    }
    message.editProposals = editProposals;
  }

  if (message.status === "stopped" && message.processingStartedAt && !message.processingCompletedAt) {
    message.processingCompletedAt = new Date().toISOString();
  }
  return message;
}

function parsePersistenceRecord(
  value: unknown
): AgentConversationPersistenceRecord | undefined {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    !Array.isArray(value.messages) ||
    !validDate(value.createdAt) ||
    !validDate(value.updatedAt) ||
    (value.approvalMode !== undefined &&
      value.approvalMode !== "request-approval" &&
      value.approvalMode !== "auto-approve") ||
    (value.draft !== undefined && typeof value.draft !== "string") ||
    (value.temperature !== undefined &&
      (typeof value.temperature !== "number" ||
        !Number.isFinite(value.temperature)))
  ) {
    return undefined;
  }
  const messages = value.messages
    .map(parseStoredMessage)
    .filter((message): message is ChatMessage => message !== undefined);
  if (messages.length !== value.messages.length) return undefined;
  return {
    sessionId: value.sessionId,
    messages,
    draft: typeof value.draft === "string" ? value.draft : "",
    approvalMode:
      value.approvalMode === "auto-approve" ? "auto-approve" : "request-approval",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    temperature:
      typeof value.temperature === "number" && Number.isFinite(value.temperature)
        ? value.temperature
        : 0.7
  };
}

export function parseAgentConversationPersistenceSnapshot(
  value: unknown
): AgentConversationPersistenceSnapshot | undefined {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.activeSessionId !== "string" ||
    !Array.isArray(value.conversations)
  ) {
    return undefined;
  }
  const conversations = value.conversations
    .map(parsePersistenceRecord)
    .filter(
      (
        conversation
      ): conversation is AgentConversationPersistenceRecord =>
        conversation !== undefined
    );
  if (!conversations.length && value.conversations.length > 0) {
    return undefined;
  }
  const limited = conversations
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    )
    .slice(0, MAX_STORED_CONVERSATIONS);
  const activeSessionId = limited.some(
    (conversation) => conversation.sessionId === value.activeSessionId
  )
    ? value.activeSessionId
    : limited[0]?.sessionId ?? value.activeSessionId;
  return {
    version: 1,
    activeSessionId,
    conversations: limited
  };
}

export function mergeAgentConversationPersistenceSnapshots(
  targetValue: unknown,
  sourceValues: readonly unknown[]
): AgentConversationPersistenceSnapshot | undefined {
  const target = parseAgentConversationPersistenceSnapshot(targetValue);
  const sources = sourceValues
    .map(parseAgentConversationPersistenceSnapshot)
    .filter(
      (
        envelope
      ): envelope is AgentConversationPersistenceSnapshot =>
        envelope !== undefined && envelope.conversations.length > 0
    );
  if (!sources.length) return target;

  const conversationBySessionId = new Map<
    string,
    AgentConversationPersistenceRecord
  >();
  for (const envelope of [...(target ? [target] : []), ...sources]) {
    for (const conversation of envelope.conversations) {
      const existing = conversationBySessionId.get(conversation.sessionId);
      if (
        !existing ||
        Date.parse(conversation.updatedAt) > Date.parse(existing.updatedAt)
      ) {
        conversationBySessionId.set(conversation.sessionId, conversation);
      }
    }
  }
  const sortedConversations = [...conversationBySessionId.values()].sort(
    (left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
  const preferredActiveConversation = target
    ? conversationBySessionId.get(target.activeSessionId)
    : undefined;
  let conversations = sortedConversations.slice(0, MAX_STORED_CONVERSATIONS);
  if (
    preferredActiveConversation &&
    !conversations.some(
      (conversation) =>
        conversation.sessionId === preferredActiveConversation.sessionId
    )
  ) {
    conversations = [
      ...conversations.slice(0, MAX_STORED_CONVERSATIONS - 1),
      preferredActiveConversation
    ].sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
  }
  if (!conversations.length) return undefined;
  const activeSessionId =
    target &&
    conversations.some(
      (conversation) => conversation.sessionId === target.activeSessionId
    )
      ? target.activeSessionId
      : conversations[0]!.sessionId;
  return { version: 1, activeSessionId, conversations };
}

/**
 * @deprecated Text-storage migration belongs in the persistence adapter. This
 * compatibility export remains temporarily so callers can migrate without a
 * flag day; it deliberately performs no synchronous reads or writes.
 */
export function mergeStoredConversationHistories(
  _storage: ConversationStorage,
  _targetKey: string,
  _sourceKeys: readonly string[]
): boolean {
  return false;
}
