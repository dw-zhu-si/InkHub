import { ref, type Ref } from "vue";
import {
  LONG_DOCUMENT_PAGE_MAX_CHARACTERS,
  LongCommitChapterInputSchema,
  LongMutationProposalEventEnvelopeSchema,
  LongWorkspaceOperationBatchSchema,
  createEnvelope,
  type AgentWriteApprovalMode,
  type LongAgentId,
  type LongContinuityFileChange,
  type LongContinuityFileRole,
  type LongWorkspaceImpactPreview,
  type LongWorkspaceFileReference,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperationBatch,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";
import type { LongWorkspaceRendererApi } from "../types/longWorkspace";
import { createKeyedSerialTaskQueue } from "../utils/keyedSerialTaskQueue";
import { longWorldbuildingFiles } from "../utils/longWorldbuildingFiles";

export type LongWorkspaceProposalEvent = Extract<
  SystemEventEnvelope,
  {
    type:
      | "long.mutation_proposal"
      | "long.worldbuilding_file_proposal"
      | "long.character_file_proposal"
      | "long.continuity_file_proposal"
      | "long.chapter_dispatch_proposal"
      | "long.ledger_commit_proposal";
  }
>;

export type LongMutationProposalEvent = Extract<
  LongWorkspaceProposalEvent,
  { type: "long.mutation_proposal" }
>;

export type LongWorldbuildingFileProposalEvent = Extract<
  LongWorkspaceProposalEvent,
  { type: "long.worldbuilding_file_proposal" }
>;

export type LongCharacterFileProposalEvent = Extract<
  LongWorkspaceProposalEvent,
  { type: "long.character_file_proposal" }
>;

export type LongContinuityFileProposalEvent = Extract<
  LongWorkspaceProposalEvent,
  { type: "long.continuity_file_proposal" }
>;

type LongWorkspaceReviewEvent = Exclude<
  LongWorkspaceProposalEvent,
  { type: "long.ledger_commit_proposal" }
>;

type LongContentFileProposalEvent =
  | LongWorldbuildingFileProposalEvent
  | LongCharacterFileProposalEvent
  | LongContinuityFileProposalEvent;

type LongBatchProposalEvent =
  | LongMutationProposalEvent
  | LongContentFileProposalEvent;

function isContentFileProposal(
  event: LongWorkspaceProposalEvent
): event is LongContentFileProposalEvent {
  return (
    event.type === "long.worldbuilding_file_proposal" ||
    event.type === "long.character_file_proposal" ||
    event.type === "long.continuity_file_proposal"
  );
}

function isBatchProposal(
  event: LongWorkspaceProposalEvent
): event is LongBatchProposalEvent {
  return event.type === "long.mutation_proposal" || isContentFileProposal(event);
}

function createdFilesForBatch(
  batch: LongWorkspaceOperationBatch
): LongWorkspaceFileReference[] {
  return batch.operations.flatMap((operation) => {
    if (operation.type === "worldbuilding.create") {
      return operation.category.format === "text"
        ? [operation.category.file]
        : [
            ...(operation.category.overview
              ? [operation.category.overview]
              : []),
            ...operation.category.items.map(({ file }) => file)
          ];
    }
    if (operation.type === "worldbuildingItem.create") {
      return [operation.item.file];
    }
    if (operation.type === "storyPlot.create") {
      return [operation.storyPlot.file];
    }
    if (operation.type === "character.create") {
      return [
        operation.files.coreProfile,
        operation.files.relationships,
        operation.files.currentState,
        operation.files.history
      ];
    }
    if (operation.type === "chapter.create") {
      return [
        operation.files.body,
        operation.files.card,
        operation.files.characterState,
        operation.files.handoff,
        operation.files.foreshadowingChanges,
        ...(operation.files.worldReveals
          ? [operation.files.worldReveals]
          : []),
        ...operation.files.characterContinuity.flatMap((entry) => [
          entry.currentState,
          entry.history
        ])
      ];
    }
    if (operation.type === "chapterContinuity.worldReveals.create") {
      return [operation.file];
    }
    if (operation.type === "chapterContinuity.character.create") {
      return [operation.currentState, operation.history];
    }
    return [];
  });
}

function producedFileRevision(
  event: LongBatchProposalEvent,
  fileId: string
): string | undefined {
  if (isContentFileProposal(event)) {
    return [...event.payload.files]
      .reverse()
      .find((file) => file.fileId === fileId)?.nextRevision;
  }
  const write = [...event.payload.batch.documentWrites]
    .reverse()
    .find((candidate) => candidate.fileId === fileId);
  if (write) return write.nextRevision;
  return createdFilesForBatch(event.payload.batch).find(
    (file) => file.id === fileId
  )?.revision;
}

function proposalFileIds(event: LongBatchProposalEvent): Set<string> {
  return new Set([
    ...createdFilesForBatch(event.payload.batch).map(({ id }) => id),
    ...event.payload.batch.documentWrites.map(({ fileId }) => fileId)
  ]);
}

const CONTINUITY_FILE_ROLE_LABELS: Record<
  LongContinuityFileRole,
  string
> = {
  foreshadowing_changes: "伏笔变化",
  world_reveals: "世界观揭露",
  character_current_state: "人物当前状态",
  character_history: "人物历史轨迹",
  chapter_end_state: "章末状态",
  handoff: "接续包"
};

interface LongContinuityFileTarget {
  chapterCardId: string;
  role: LongContinuityFileRole;
  characterId: string | null;
  file: LongWorkspaceFileReference;
}

function continuityFileTitle(
  index: LongWorkspaceIndexSnapshot,
  target: LongContinuityFileTarget
): string {
  const chapter = index.plot.chapterCards.find(
    ({ id }) => id === target.chapterCardId
  );
  if (!chapter) {
    throw new Error("连续性提案指向了不存在的章卡。");
  }
  const isCharacterRole =
    target.role === "character_current_state" ||
    target.role === "character_history";
  if (isCharacterRole !== (target.characterId !== null)) {
    throw new Error("连续性提案的人物文件身份不完整。");
  }
  let characterName: string | null = null;
  if (target.characterId !== null) {
    const character = index.characters.find(
      ({ id }) => id === target.characterId
    );
    if (!character) {
      throw new Error("连续性提案指向了不存在的人物。");
    }
    characterName = character.name;
  }
  return `${chapter.title} / ${
    characterName ? `${characterName} / ` : ""
  }${CONTINUITY_FILE_ROLE_LABELS[target.role]}`;
}

function continuityFileTargets(
  index: LongWorkspaceIndexSnapshot
): Map<string, LongContinuityFileTarget> {
  const targets = new Map<string, LongContinuityFileTarget>();
  const add = (target: LongContinuityFileTarget): void => {
    if (targets.has(target.file.id)) {
      throw new Error("长篇工作区包含重复的连续性文件标识。");
    }
    targets.set(target.file.id, target);
  };
  for (const chapter of index.chapters) {
    add({
      chapterCardId: chapter.chapterCardId,
      role: "chapter_end_state",
      characterId: null,
      file: chapter.characterState
    });
    add({
      chapterCardId: chapter.chapterCardId,
      role: "handoff",
      characterId: null,
      file: chapter.handoff
    });
    add({
      chapterCardId: chapter.chapterCardId,
      role: "foreshadowing_changes",
      characterId: null,
      file: chapter.foreshadowingChanges
    });
    if (chapter.worldReveals) {
      add({
        chapterCardId: chapter.chapterCardId,
        role: "world_reveals",
        characterId: null,
        file: chapter.worldReveals
      });
    }
    for (const continuity of chapter.characterContinuity) {
      add({
        chapterCardId: chapter.chapterCardId,
        role: "character_current_state",
        characterId: continuity.characterId,
        file: continuity.currentState
      });
      add({
        chapterCardId: chapter.chapterCardId,
        role: "character_history",
        characterId: continuity.characterId,
        file: continuity.history
      });
    }
  }
  return targets;
}

function createdContinuityFileTarget(
  event: LongContinuityFileProposalEvent,
  fileId: string
): LongContinuityFileTarget | undefined {
  for (const operation of event.payload.batch.operations) {
    if (
      operation.type === "chapterContinuity.worldReveals.create" &&
      operation.file.id === fileId
    ) {
      return {
        chapterCardId: operation.chapterCardId,
        role: "world_reveals",
        characterId: null,
        file: operation.file
      };
    }
    if (operation.type === "chapterContinuity.character.create") {
      if (operation.currentState.id === fileId) {
        return {
          chapterCardId: operation.chapterCardId,
          role: "character_current_state",
          characterId: operation.characterId,
          file: operation.currentState
        };
      }
      if (operation.history.id === fileId) {
        return {
          chapterCardId: operation.chapterCardId,
          role: "character_history",
          characterId: operation.characterId,
          file: operation.history
        };
      }
    }
  }
  return undefined;
}

function assertContinuityFileMetadata(
  index: LongWorkspaceIndexSnapshot,
  change: LongContinuityFileChange,
  target: LongContinuityFileTarget
): void {
  if (
    change.fileId !== target.file.id ||
    change.filePath !== target.file.path ||
    change.chapterCardId !== target.chapterCardId ||
    change.role !== target.role ||
    change.characterId !== target.characterId ||
    change.title !== continuityFileTitle(index, target)
  ) {
    throw new Error(
      "连续性提案的文件路径、章节、角色或人物与当前工作区不一致。"
    );
  }
}

async function readAuthoritativeContinuityText(
  api: LongWorkspaceRendererApi,
  input: {
    bookId: string;
    target: LongContinuityFileTarget;
    workspaceRevision: number;
    projectRevision: number;
  }
): Promise<string> {
  let offset = 0;
  let totalCharacters: number | null = null;
  let content = "";
  for (;;) {
    const page = await api.readDocument({
      bookId: input.bookId,
      fileId: input.target.file.id,
      offset,
      maxCharacters: LONG_DOCUMENT_PAGE_MAX_CHARACTERS
    });
    if (
      page.bookId !== input.bookId ||
      page.file.id !== input.target.file.id ||
      page.file.path !== input.target.file.path ||
      page.file.revision !== input.target.file.revision ||
      page.offset !== offset ||
      page.workspaceRevision !== input.workspaceRevision ||
      page.projectRevision !== input.projectRevision
    ) {
      throw new Error("连续性文件读取结果与当前工作区不一致。");
    }
    if (
      totalCharacters !== null &&
      page.totalCharacters !== totalCharacters
    ) {
      throw new Error("连续性文件在完整读取期间发生了变化。");
    }
    totalCharacters ??= page.totalCharacters;
    const pageCharacters = Array.from(page.content).length;
    const endOffset = offset + pageCharacters;
    if (
      endOffset > page.totalCharacters ||
      (page.nextOffset !== null &&
        (page.nextOffset !== endOffset ||
          page.nextOffset >= page.totalCharacters)) ||
      (page.nextOffset === null && endOffset !== page.totalCharacters)
    ) {
      throw new Error("连续性文件返回了无效的分页。");
    }
    content += page.content;
    if (content.length > 1_000_000) {
      throw new Error("连续性文件超出可审批的文本长度。");
    }
    if (page.nextOffset === null) return content;
    offset = page.nextOffset;
  }
}

export type LongWorkspaceProposalStatus =
  | "previewing"
  | "waiting"
  | "ready"
  | "submitting"
  | "error"
  | "accepted";

export interface LongWorkspaceProposalItem {
  event: LongWorkspaceReviewEvent;
  approvalMode: AgentWriteApprovalMode;
  status: LongWorkspaceProposalStatus;
  preview?: LongWorkspaceImpactPreview;
  previewProjectRevision?: number;
  effectiveBatch?: LongWorkspaceOperationBatch;
  effectiveProjectRevision?: number;
  error?: string;
  errorPhase?: "preview" | "apply";
  errorRetryable?: boolean;
}

interface LongProposalNotifications {
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface UseLongWorkspaceProposalsOptions {
  api: () => LongWorkspaceRendererApi | undefined;
  acceptsEvent: (event: LongWorkspaceProposalEvent) => boolean;
  approvalModeForEvent?: (
    event: LongWorkspaceProposalEvent
  ) => AgentWriteApprovalMode | undefined;
  prepareAutoApprove?: (
    event: LongWorkspaceProposalEvent
  ) => void | Promise<void>;
  canFinalizeContinuity?: (
    event: Extract<
      LongWorkspaceProposalEvent,
      { type: "long.ledger_commit_proposal" }
    >
  ) => boolean;
  onContinuityFinalizationFailed?: (
    event: Extract<
      LongWorkspaceProposalEvent,
      { type: "long.ledger_commit_proposal" }
    >,
    message: string
  ) => boolean;
  onApplied?: (
    event: Exclude<
      LongWorkspaceProposalEvent,
      { type: "long.chapter_dispatch_proposal" }
    >
  ) => void | Promise<void>;
  onDispatchApproved?: (
    event: Extract<
      LongWorkspaceProposalEvent,
      { type: "long.chapter_dispatch_proposal" }
    >
  ) => void | Promise<void>;
  onRejected?: (event: LongWorkspaceProposalEvent) => void;
  notifications: LongProposalNotifications;
}

export interface EnqueueManualLongMutationInput {
  bookId: string;
  agentId?: LongAgentId;
  batch: LongWorkspaceOperationBatch;
  baseProjectRevision: number;
  summary: string;
}

export interface LongWorkspaceProposalController {
  queues: Ref<Record<string, LongWorkspaceProposalItem[]>>;
  itemsForBook(bookId: string | null | undefined): LongWorkspaceProposalItem[];
  activateBook(bookId: string): void;
  discardBook(bookId: string): void;
  quarantineSession(bookId: string, sessionId: string): void;
  handleEvent(event: SystemEventEnvelope): Promise<boolean>;
  enqueueManualMutation(
    input: EnqueueManualLongMutationInput
  ): Promise<LongMutationProposalEvent>;
  retryPreview(bookId: string, eventId: string): Promise<void>;
  approve(bookId: string, eventId: string): Promise<void>;
  reject(bookId: string, eventId: string): boolean;
}

const LONG_PROPOSAL_TYPES = new Set<SystemEventEnvelope["type"]>([
  "long.mutation_proposal",
  "long.worldbuilding_file_proposal",
  "long.character_file_proposal",
  "long.continuity_file_proposal",
  "long.chapter_dispatch_proposal",
  "long.ledger_commit_proposal"
]);

function isLongProposalEvent(
  event: SystemEventEnvelope
): event is LongWorkspaceProposalEvent {
  return LONG_PROPOSAL_TYPES.has(event.type);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isRetryableLongProposalError(error: unknown): boolean {
  const message = errorMessage(error, "");
  if (
    message.startsWith("long.operation.") ||
    message.startsWith("long.conflict:") ||
    message.includes("请基于最新结构重新生成提案") ||
    message.includes("未覆盖最新内容")
  ) {
    return false;
  }
  return true;
}

function ipcSafeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useLongWorkspaceProposals(
  options: UseLongWorkspaceProposalsOptions
): LongWorkspaceProposalController {
  const queues = ref<Record<string, LongWorkspaceProposalItem[]>>({});
  const handledEventIds = new Set<string>();
  const handledProposalKeys = new Set<string>();
  const discardedBookIds = new Set<string>();
  const quarantinedSessions = new Set<string>();
  const proposalApprovalQueue = createKeyedSerialTaskQueue<string>();
  const pendingContinuityFinalizations = new Map<
    string,
    Extract<
      LongWorkspaceProposalEvent,
      { type: "long.ledger_commit_proposal" }
    >
  >();
  const continuityFinalizationsInFlight = new Set<string>();

  function sessionKey(bookId: string, sessionId: string): string {
    return `${bookId}\u0000${sessionId}`;
  }

  function proposalKey(event: LongWorkspaceProposalEvent): string {
    return [
      event.type,
      event.payload.bookId,
      event.payload.sessionId,
      event.payload.runId,
      event.payload.toolCallId
    ].join("\u0000");
  }

  function continuityFinalizationKey(
    event: Extract<
      LongWorkspaceProposalEvent,
      { type: "long.ledger_commit_proposal" }
    >
  ): string {
    return `${event.payload.bookId}\u0000${event.payload.input.chapterCardId}`;
  }

  function clearContinuityFinalizations(
    matches: (
      event: Extract<
        LongWorkspaceProposalEvent,
        { type: "long.ledger_commit_proposal" }
      >
    ) => boolean
  ): void {
    for (const [key, event] of pendingContinuityFinalizations) {
      if (matches(event)) pendingContinuityFinalizations.delete(key);
    }
  }

  function itemsForBook(
    bookId: string | null | undefined
  ): LongWorkspaceProposalItem[] {
    return bookId ? queues.value[bookId] ?? [] : [];
  }

  function setBookItems(
    bookId: string,
    items: LongWorkspaceProposalItem[]
  ): void {
    const pending = items.filter(({ status }) => status !== "accepted");
    const accepted = items
      .filter(({ status }) => status === "accepted")
      .slice(-100);
    const retained = [...pending, ...accepted].sort(
      (left, right) =>
        left.event.timestamp.localeCompare(right.event.timestamp)
    );
    const next = { ...queues.value };
    if (retained.length) {
      next[bookId] = retained;
    } else {
      delete next[bookId];
    }
    queues.value = next;
  }

  function activateBook(bookId: string): void {
    discardedBookIds.delete(bookId);
  }

  function discardBook(bookId: string): void {
    discardedBookIds.add(bookId);
    clearContinuityFinalizations(
      (event) => event.payload.bookId === bookId
    );
    setBookItems(bookId, []);
  }

  function quarantineSession(bookId: string, sessionId: string): void {
    quarantinedSessions.add(sessionKey(bookId, sessionId));
    clearContinuityFinalizations(
      (event) =>
        event.payload.bookId === bookId &&
        event.payload.sessionId === sessionId
    );
    while (quarantinedSessions.size > 2_000) {
      const oldest = quarantinedSessions.values().next().value as
        | string
        | undefined;
      if (!oldest) break;
      quarantinedSessions.delete(oldest);
    }
    setBookItems(
      bookId,
      itemsForBook(bookId).filter(
        (item) => item.event.payload.sessionId !== sessionId
      )
    );
  }

  function updateItem(
    bookId: string,
    eventId: string,
    patch: Partial<Omit<LongWorkspaceProposalItem, "event">> & {
      clearError?: boolean;
      clearPreview?: boolean;
    }
  ): void {
    setBookItems(
      bookId,
      itemsForBook(bookId).map((item) => {
        if (item.event.id !== eventId) return item;
        const { clearError, clearPreview, ...values } = patch;
        const next = { ...item, ...values };
        if (clearError) {
          delete next.error;
          delete next.errorPhase;
          delete next.errorRetryable;
        }
        if (clearPreview) {
          delete next.preview;
          delete next.previewProjectRevision;
          delete next.effectiveBatch;
          delete next.effectiveProjectRevision;
        }
        return next;
      })
    );
  }

  function removeItem(bookId: string, eventId: string): void {
    setBookItems(
      bookId,
      itemsForBook(bookId).filter((item) => item.event.id !== eventId)
    );
  }

  function currentItem(
    bookId: string,
    eventId: string
  ): LongWorkspaceProposalItem | undefined {
    return itemsForBook(bookId).find(
      (item) => item.event.id === eventId
    );
  }

  function pendingFilePredecessor(
    item: LongWorkspaceProposalItem,
    fileId: string,
    expectedRevision: string | null
  ): LongWorkspaceProposalItem | undefined {
    const items = itemsForBook(item.event.payload.bookId);
    const currentIndex = items.findIndex(
      ({ event }) => event.id === item.event.id
    );
    if (currentIndex < 0) return undefined;
    return items
      .slice(0, currentIndex)
      .reverse()
      .find(
        (candidate) =>
          isBatchProposal(candidate.event) &&
          producedFileRevision(candidate.event, fileId) ===
            expectedRevision &&
          candidate.status !== "error"
      );
  }

  function pendingBatchPredecessor(
    item: LongWorkspaceProposalItem
  ): LongWorkspaceProposalItem | undefined {
    const items = itemsForBook(item.event.payload.bookId);
    const currentIndex = items.findIndex(
      ({ event }) => event.id === item.event.id
    );
    if (currentIndex < 0) return undefined;
    return items
      .slice(0, currentIndex)
      .reverse()
      .find(
        (candidate) =>
          isBatchProposal(candidate.event) &&
          candidate.event.payload.sessionId ===
            item.event.payload.sessionId &&
          candidate.event.payload.runId === item.event.payload.runId &&
          candidate.status !== "accepted" &&
          candidate.status !== "error"
      );
  }

  async function previewMutation(
    item: LongWorkspaceProposalItem
  ): Promise<void> {
    if (
      item.event.type !== "long.mutation_proposal" &&
      !isContentFileProposal(item.event)
    ) return;
    const { event } = item;
    const api = options.api();
    if (!api) {
      updateItem(event.payload.bookId, event.id, {
        status: "error",
        error: "当前环境未连接长篇工作区。",
        errorPhase: "preview",
        errorRetryable: true,
        clearPreview: true
      });
      return;
    }
    updateItem(event.payload.bookId, event.id, {
      status: "previewing",
      clearError: true,
      clearPreview: true
    });
    try {
      let effectiveBatch = event.payload.batch;
      let effectiveProjectRevision = event.payload.baseProjectRevision;
      if (event.type === "long.mutation_proposal") {
        const batchPredecessor = pendingBatchPredecessor(item);
        if (batchPredecessor) {
          updateItem(event.payload.bookId, event.id, {
            status: "waiting",
            clearError: true
          });
          return;
        }
        const latest = await api.getWorkspaceIndex({
          bookId: event.payload.bookId
        });
        if (
          latest.bookId !== event.payload.bookId ||
          latest.workspaceIndex.bookId !== event.payload.bookId
        ) {
          throw new Error("长篇工作区索引返回了错误的项目。");
        }
        for (const write of event.payload.batch.documentWrites) {
          const filePredecessor = pendingFilePredecessor(
            item,
            write.fileId,
            write.expectedRevision
          );
          if (
            filePredecessor &&
            filePredecessor.status !== "accepted"
          ) {
            updateItem(event.payload.bookId, event.id, {
              status: "waiting",
              clearError: true
            });
            return;
          }
        }
        effectiveBatch = {
          ...event.payload.batch,
          baseRevision: latest.workspaceIndex.revision
        };
        effectiveProjectRevision = latest.projectRevision;
      } else if (isContentFileProposal(event)) {
        const latest = await api.getWorkspaceIndex({
          bookId: event.payload.bookId
        });
        if (
          latest.bookId !== event.payload.bookId ||
          latest.workspaceIndex.bookId !== event.payload.bookId
        ) {
          throw new Error("长篇工作区索引返回了错误的项目。");
        }
        const continuityTargets =
          event.type === "long.continuity_file_proposal"
            ? continuityFileTargets(latest.workspaceIndex)
            : null;
        const currentFiles = new Map<string, LongWorkspaceFileReference>(
          event.type === "long.worldbuilding_file_proposal"
            ? longWorldbuildingFiles(
                latest.workspaceIndex.worldbuilding
              ).map((file) => [file.id, file] as const)
            : event.type === "long.character_file_proposal"
              ? latest.workspaceIndex.characterFiles.flatMap((entry) => [
                  [entry.coreProfile.id, entry.coreProfile] as const,
                  [entry.relationships.id, entry.relationships] as const,
                  [entry.currentState.id, entry.currentState] as const,
                  [entry.history.id, entry.history] as const
                ])
              : [...continuityTargets!.values()].map(
                  ({ file }) => [file.id, file] as const
                )
        );
        for (const file of event.payload.files) {
          const current = currentFiles.get(file.fileId);
          if (event.type === "long.continuity_file_proposal") {
            const currentTarget = continuityTargets!.get(file.fileId);
            if (file.operation === "create") {
              if (current || currentTarget) {
                throw new Error(
                  `目标连续性文件已存在，无法重复创建：${file.fileId}`
                );
              }
              const createdTarget = createdContinuityFileTarget(
                event,
                file.fileId
              );
              if (
                !createdTarget ||
                createdTarget.file.revision !== file.nextRevision ||
                file.beforeText !== ""
              ) {
                throw new Error("连续性文件创建提案的身份或初始内容不一致。");
              }
              assertContinuityFileMetadata(
                latest.workspaceIndex,
                file as LongContinuityFileChange,
                createdTarget
              );
              continue;
            }

            if (currentTarget) {
              assertContinuityFileMetadata(
                latest.workspaceIndex,
                file as LongContinuityFileChange,
                currentTarget
              );
            }
            if (
              current &&
              currentTarget &&
              current.revision === file.beforeRevision
            ) {
              const beforeText = await readAuthoritativeContinuityText(api, {
                bookId: event.payload.bookId,
                target: currentTarget,
                workspaceRevision: latest.workspaceIndex.revision,
                projectRevision: latest.projectRevision
              });
              if (beforeText !== file.beforeText) {
                throw new Error(
                  `连续性提案的原始内容与实际文件不一致：${file.fileId}`
                );
              }
              continue;
            }

            const predecessor = pendingFilePredecessor(
              item,
              file.fileId,
              file.beforeRevision
            );
            if (predecessor && predecessor.status !== "accepted") {
              if (
                predecessor.event.type !==
                "long.continuity_file_proposal"
              ) {
                throw new Error("连续性文件的前序提案类型不一致。");
              }
              const predecessorFile = predecessor.event.payload.files.find(
                (candidate) =>
                  candidate.fileId === file.fileId &&
                  candidate.nextRevision === file.beforeRevision
              );
              const predecessorTarget =
                currentTarget ??
                createdContinuityFileTarget(
                  predecessor.event,
                  file.fileId
                );
              if (!predecessorFile || !predecessorTarget) {
                throw new Error("无法确认连续性文件的前序身份。");
              }
              assertContinuityFileMetadata(
                latest.workspaceIndex,
                predecessorFile,
                predecessorTarget
              );
              assertContinuityFileMetadata(
                latest.workspaceIndex,
                file as LongContinuityFileChange,
                predecessorTarget
              );
              if (file.beforeText !== predecessorFile.afterText) {
                throw new Error(
                  `连续性提案的原始内容与前序写入不一致：${file.fileId}`
                );
              }
              updateItem(event.payload.bookId, event.id, {
                status: "waiting",
                clearError: true
              });
              return;
            }
            throw new Error(
              `目标连续性文件已在提案后更新，未覆盖最新内容：${file.fileId}`
            );
          }
          if (file.operation === "create") {
            if (current) {
              throw new Error(
                `目标文件已存在，无法重复创建：${file.filePath}`
              );
            }
          } else if (
            !current ||
            current.revision !== file.beforeRevision
          ) {
            const predecessor = pendingFilePredecessor(
              item,
              file.fileId,
              file.beforeRevision
            );
            if (predecessor && predecessor.status !== "accepted") {
              updateItem(event.payload.bookId, event.id, {
                status: "waiting",
                clearError: true
              });
              return;
            }
            throw new Error(
              `目标文件已在提案后更新，未覆盖最新内容：${file.filePath}`
            );
          }
        }
        const nextOrderByCategory = new Map<string, number>();
        const nextOrderByCharacterGroup = new Map<string, number>();
        effectiveBatch = {
          ...event.payload.batch,
          baseRevision: latest.workspaceIndex.revision,
          operations: event.payload.batch.operations.map((operation) => {
            if (operation.type === "worldbuildingItem.create") {
              const category = latest.workspaceIndex.worldbuilding.find(
                ({ id }) => id === operation.categoryId
              );
              if (!category || category.format !== "list") {
                throw new Error(
                  "世界观条目的目标分类已不存在或不再是列表型。"
                );
              }
              const nextOrder =
                (nextOrderByCategory.get(category.id) ??
                  category.items.length) + 1;
              nextOrderByCategory.set(category.id, nextOrder);
              return {
                ...operation,
                item: { ...operation.item, order: nextOrder }
              };
            }
            if (operation.type === "character.create") {
              const group = operation.character.group;
              const currentCount = latest.workspaceIndex.characters.filter(
                (character) => character.group === group
              ).length;
              const nextOrder =
                (nextOrderByCharacterGroup.get(group) ?? currentCount) + 1;
              nextOrderByCharacterGroup.set(group, nextOrder);
              return {
                ...operation,
                character: { ...operation.character, order: nextOrder }
              };
            }
            return operation;
          })
        };
        effectiveProjectRevision = latest.projectRevision;
      }
      const result = await api.previewOperations(
        ipcSafeJson({
          bookId: event.payload.bookId,
          batch: LongWorkspaceOperationBatchSchema.parse(effectiveBatch)
        })
      );
      if (result.bookId !== event.payload.bookId) {
        throw new Error("结构影响预览返回了错误的长篇项目。");
      }
      if (
        result.projectRevision !==
        effectiveProjectRevision
      ) {
        throw new Error(
          "长篇项目已在提案后更新，请基于最新结构重新生成提案。"
        );
      }
      if (!currentItem(event.payload.bookId, event.id)) return;
      updateItem(event.payload.bookId, event.id, {
        status: "ready",
        preview: result.preview,
        previewProjectRevision: result.projectRevision,
        effectiveBatch,
        effectiveProjectRevision,
        clearError: true
      });
    } catch (error: unknown) {
      if (!currentItem(event.payload.bookId, event.id)) return;
      updateItem(event.payload.bookId, event.id, {
        status: "error",
        error: errorMessage(error, "预览长篇结构影响失败。"),
        errorPhase: "preview",
        errorRetryable: isRetryableLongProposalError(error),
        clearPreview: true
      });
    }
  }

  function rememberEvent(event: LongWorkspaceProposalEvent): boolean {
    const semanticKey = proposalKey(event);
    if (
      handledEventIds.has(event.id) ||
      handledProposalKeys.has(semanticKey)
    ) {
      return false;
    }
    handledEventIds.add(event.id);
    handledProposalKeys.add(semanticKey);
    while (handledEventIds.size > 2_000) {
      const oldest = handledEventIds.values().next().value as
        | string
        | undefined;
      if (!oldest) break;
      handledEventIds.delete(oldest);
    }
    while (handledProposalKeys.size > 2_000) {
      const oldest = handledProposalKeys.values().next().value as
        | string
        | undefined;
      if (!oldest) break;
      handledProposalKeys.delete(oldest);
    }
    return true;
  }

  function continuityFinalizationHasPendingChanges(
    event: Extract<
      LongWorkspaceProposalEvent,
      { type: "long.ledger_commit_proposal" }
    >
  ): boolean {
    return itemsForBook(event.payload.bookId).some(
      (item) =>
        item.event.payload.sessionId === event.payload.sessionId &&
        item.event.payload.runId === event.payload.runId &&
        item.event.payload.agentId === "continuity_ledger" &&
        item.status !== "accepted"
    );
  }

  async function commitContinuityFinalization(
    event: Extract<
      LongWorkspaceProposalEvent,
      { type: "long.ledger_commit_proposal" }
    >
  ): Promise<void> {
    const api = options.api();
    if (!api) {
      throw new Error("当前环境未连接长篇工作区。");
    }
    const parsedInput = LongCommitChapterInputSchema.parse(event.payload.input);
    if (parsedInput.mode !== "text_files") {
      await api.commitChapter(ipcSafeJson(parsedInput));
      return;
    }
    const latest = await api.getWorkspaceIndex({
      bookId: event.payload.bookId
    });
    const chapter = latest.workspaceIndex.chapters.find(
      ({ chapterCardId }) => chapterCardId === parsedInput.chapterCardId
    );
    if (!chapter || chapter.commitId !== null) {
      throw new Error("待归档章节已不存在或已经完成连续性归档。");
    }
    if (chapter.body.revision !== parsedInput.chapterFileRevisions.body) {
      throw new Error("章节正文已更新，请重新执行连续性核对。");
    }
    const currentContinuityFiles = [
      chapter.characterState,
      chapter.handoff,
      ...(Object.keys(parsedInput.foreshadowingBeatDecisions).length > 0
        ? [chapter.foreshadowingChanges]
        : []),
      ...(chapter.worldReveals ? [chapter.worldReveals] : []),
      ...chapter.characterContinuity.flatMap((continuity) => [
        continuity.currentState,
        continuity.history
      ])
    ];
    const proposedRevisions = new Map(
      parsedInput.continuityFileRevisions.map(
        ({ fileId, revision }) => [fileId, revision] as const
      )
    );
    if (
      proposedRevisions.size !== currentContinuityFiles.length ||
      currentContinuityFiles.some(
        ({ id, revision }) => proposedRevisions.get(id) !== revision
      )
    ) {
      throw new Error(
        "本章连续性文件尚未全部保存，或已在核对后更新。"
      );
    }
    await api.commitChapter(
      ipcSafeJson(
        LongCommitChapterInputSchema.parse({
          ...parsedInput,
          baseWorkspaceRevision: latest.workspaceIndex.revision,
          baseProjectRevision: latest.projectRevision
        })
      )
    );
  }

  async function attemptContinuityFinalizations(bookId: string): Promise<void> {
    for (const [key, event] of pendingContinuityFinalizations) {
      if (
        event.payload.bookId !== bookId ||
        continuityFinalizationsInFlight.has(key) ||
        continuityFinalizationHasPendingChanges(event)
      ) {
        continue;
      }
      if (options.canFinalizeContinuity?.(event) === false) {
        pendingContinuityFinalizations.delete(key);
        continue;
      }
      continuityFinalizationsInFlight.add(key);
      try {
        await commitContinuityFinalization(event);
      } catch (error: unknown) {
        pendingContinuityFinalizations.delete(key);
        const message = errorMessage(error, "连续性文件归档失败。");
        if (!options.onContinuityFinalizationFailed?.(event, message)) {
          options.notifications.error(message);
        }
        continue;
      } finally {
        continuityFinalizationsInFlight.delete(key);
      }
      pendingContinuityFinalizations.delete(key);
      options.notifications.success("本章连续性文件已完成归档。");
      try {
        await options.onApplied?.(event);
      } catch (error: unknown) {
        options.notifications.warning(
          `连续性文件已经归档，但后续刷新失败：${errorMessage(
            error,
            "请手动刷新长篇工作区。"
          )}`
        );
      }
    }
  }

  async function processAutomaticProposal(
    event: LongWorkspaceReviewEvent,
    previewFirst: boolean
  ): Promise<void> {
    await proposalApprovalQueue.enqueue(event.payload.bookId, async () => {
      let current = currentItem(event.payload.bookId, event.id);
      if (!current) return;
      let prepared = false;
      if (
        previewFirst &&
        isContentFileProposal(current.event)
      ) {
        try {
          await options.prepareAutoApprove?.(event);
          prepared = true;
        } catch (error: unknown) {
          const message = errorMessage(
            error,
            "长篇文件实时自动保存前检查失败。"
          );
          updateItem(event.payload.bookId, event.id, {
            status: "error",
            error: message,
            clearPreview: true
          });
          options.notifications.error(message);
          return;
        }
      }
      if (
        previewFirst &&
        (current.event.type === "long.mutation_proposal" ||
          isContentFileProposal(current.event))
      ) {
        await previewMutation(current);
        current = currentItem(event.payload.bookId, event.id);
      }
      if (!current || current.status !== "ready") return;
      if (!prepared) {
        try {
          await options.prepareAutoApprove?.(event);
        } catch (error: unknown) {
          const message = errorMessage(
            error,
            "长篇提案实时自动保存前检查失败。"
          );
          updateItem(event.payload.bookId, event.id, {
            status: "error",
            error: message,
            clearPreview: true
          });
          options.notifications.error(message);
          return;
        }
      }
      await approveCurrent(event.payload.bookId, event.id, false);
    });
  }

  async function enqueueProposalEvent(
    event: LongWorkspaceReviewEvent,
    approvalMode: AgentWriteApprovalMode =
      options.approvalModeForEvent?.(event) ?? "request-approval"
  ): Promise<boolean> {
    if (!rememberEvent(event)) {
      return false;
    }

    const item: LongWorkspaceProposalItem = {
      event,
      approvalMode,
      status:
        event.type === "long.mutation_proposal" ||
        isContentFileProposal(event)
          ? "previewing"
          : "ready"
    };
    setBookItems(event.payload.bookId, [
      ...itemsForBook(event.payload.bookId),
      item
    ]);
    if (approvalMode === "auto-approve") {
      await processAutomaticProposal(event, true);
    } else if (
      event.type === "long.mutation_proposal" ||
      isContentFileProposal(event)
    ) {
      await previewMutation(item);
    }
    return true;
  }

  async function handleEvent(event: SystemEventEnvelope): Promise<boolean> {
    if (
      !isLongProposalEvent(event) ||
      discardedBookIds.has(event.payload.bookId) ||
      quarantinedSessions.has(
        sessionKey(event.payload.bookId, event.payload.sessionId)
      ) ||
      handledEventIds.has(event.id) ||
      handledProposalKeys.has(proposalKey(event)) ||
      !options.acceptsEvent(event)
    ) {
      return false;
    }
    if (event.type === "long.ledger_commit_proposal") {
      if (!rememberEvent(event)) return false;
      pendingContinuityFinalizations.set(
        continuityFinalizationKey(event),
        event
      );
      await proposalApprovalQueue.enqueue(event.payload.bookId, () =>
        attemptContinuityFinalizations(event.payload.bookId)
      );
      return true;
    }
    return enqueueProposalEvent(event);
  }

  function createUniqueManualEventId(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const eventId = createId("long_manual_mutation");
      if (!handledEventIds.has(eventId)) {
        return eventId;
      }
    }
    throw new Error("无法为手工长篇结构提案生成唯一事件 ID。");
  }

  async function enqueueManualMutation(
    input: EnqueueManualLongMutationInput
  ): Promise<LongMutationProposalEvent> {
    const eventId = createUniqueManualEventId();
    const sessionId = createId("long_manual_session");
    const runId = createId("long_manual_run");
    const event = LongMutationProposalEventEnvelopeSchema.parse(
      createEnvelope(
        "long.mutation_proposal",
        {
          sessionId,
          runId,
          toolCallId: createId("long_manual_tool"),
          bookId: input.bookId,
          agentId: input.agentId ?? "plot_design",
          summary: input.summary,
          runtime: {
            provider: "deepwrite",
            model: "manual-structure-manager",
            mode: "local-faux"
          },
          batch: input.batch,
          baseProjectRevision: input.baseProjectRevision
        },
        {
          id: eventId,
          context: {
            sessionId,
            runId,
            resourceId: input.bookId
          }
        }
      )
    );
    activateBook(input.bookId);
    if (!(await enqueueProposalEvent(event, "request-approval"))) {
      throw new Error("手工长篇结构提案事件 ID 冲突，请重试。");
    }
    return event;
  }

  async function retryPreview(
    bookId: string,
    eventId: string
  ): Promise<void> {
    const item = currentItem(bookId, eventId);
    if (
      !item ||
      item.status === "previewing" ||
      item.status === "submitting"
    ) {
      return;
    }
    if (
      item.approvalMode === "auto-approve" &&
      (item.event.type === "long.mutation_proposal" ||
        isContentFileProposal(item.event))
    ) {
      await processAutomaticProposal(item.event, true);
      return;
    }
    await previewMutation(item);
    const current = currentItem(bookId, eventId);
    if (
      current?.approvalMode === "auto-approve" &&
      current.status === "ready"
    ) {
      await processAutomaticProposal(current.event, false);
    }
  }

  async function approveCurrent(
    bookId: string,
    eventId: string,
    refreshMutationPreview: boolean
  ): Promise<void> {
    let item = currentItem(bookId, eventId);
    const api = options.api();
    if (!item || !api || item.status === "submitting") {
      if (!api) {
        options.notifications.warning("当前环境未连接长篇工作区。");
      }
      return;
    }
    if (
      refreshMutationPreview &&
      (item.event.type === "long.mutation_proposal" ||
        isContentFileProposal(item.event))
    ) {
      await previewMutation(item);
      const refreshed = currentItem(bookId, eventId);
      if (
        !refreshed ||
        refreshed.status !== "ready" ||
        !refreshed.preview
      ) {
        return;
      }
      item = refreshed;
    }
    if (
      (item.event.type === "long.mutation_proposal" ||
        isContentFileProposal(item.event)) &&
      (item.status !== "ready" || !item.preview)
    ) {
      options.notifications.warning("请先完成结构影响预览，再确认应用。");
      return;
    }
    const mutationPreview =
      item.event.type === "long.mutation_proposal" ||
      isContentFileProposal(item.event)
        ? item.preview
        : undefined;
    if (
      item.event.type !== "long.mutation_proposal" &&
      !isContentFileProposal(item.event) &&
      item.status !== "ready" &&
      item.status !== "error"
    ) {
      return;
    }

    updateItem(bookId, eventId, {
      status: "submitting",
      clearError: true
    });
    if (item.event.type === "long.chapter_dispatch_proposal") {
      try {
        await options.onDispatchApproved?.(item.event);
        removeItem(bookId, eventId);
        options.notifications.success(
          `已启动从“${item.event.payload.title}”开始的 ${item.event.payload.chapters.length} 章串行写作计划。`
        );
      } catch (error: unknown) {
        updateItem(bookId, eventId, {
          status: "error",
          error: errorMessage(error, "处理长篇提案失败。"),
          errorPhase: "apply",
          errorRetryable: isRetryableLongProposalError(error)
        });
        options.notifications.error(
          errorMessage(error, "处理长篇提案失败。")
        );
      }
      return;
    }

    try {
      if (
        item.event.type === "long.mutation_proposal" ||
        isContentFileProposal(item.event)
      ) {
        const effectiveBatch =
          item.effectiveBatch ?? item.event.payload.batch;
        const effectiveProjectRevision =
          item.effectiveProjectRevision ??
          item.event.payload.baseProjectRevision;
        await api.applyOperations(
          ipcSafeJson({
            bookId,
            batch: LongWorkspaceOperationBatchSchema.parse({
              ...effectiveBatch,
              expectedImpact: mutationPreview!.impact
            }),
            baseProjectRevision: effectiveProjectRevision
          })
        );
      } else {
        throw new Error(
          "章节正文必须通过会话 diff 审批卡保存，不能进入旧长篇提案队列。"
        );
      }
    } catch (error: unknown) {
      updateItem(bookId, eventId, {
        status: "error",
        error: errorMessage(error, "处理长篇提案失败。"),
        errorPhase: "apply",
        errorRetryable: isRetryableLongProposalError(error),
        clearPreview: true
      });
      options.notifications.error(
        errorMessage(error, "处理长篇提案失败。")
      );
      return;
    }

    if (
      item.event.type === "long.mutation_proposal" ||
      isContentFileProposal(item.event)
    ) {
      updateItem(bookId, eventId, {
        status: "accepted",
        clearError: true
      });
    } else {
      removeItem(bookId, eventId);
    }
    options.notifications.success(
      item.event.type === "long.mutation_proposal"
        ? "长篇结构提案已应用。"
        : item.event.type === "long.worldbuilding_file_proposal"
          ? "世界观文件变更已保存到本地 Markdown。"
        : item.event.type === "long.character_file_proposal"
          ? "人物文件变更已保存到本地 Markdown。"
        : "本章连续性记录已保存到本地 Markdown。"
    );
    try {
      await options.onApplied?.(item.event);
    } catch (error: unknown) {
      options.notifications.warning(
        `长篇提案已经写入，但后续刷新失败：${errorMessage(
          error,
          "请手动刷新长篇工作区。"
        )}`
      );
    }
    if (isBatchProposal(item.event)) {
      for (const waiting of itemsForBook(bookId).filter(
        (candidate) =>
          candidate.status === "waiting" &&
          isBatchProposal(candidate.event)
      )) {
        if (waiting.approvalMode === "auto-approve") {
          queueMicrotask(() => {
            void processAutomaticProposal(waiting.event, true);
          });
        } else {
          await previewMutation(waiting);
        }
      }
    }
    await attemptContinuityFinalizations(bookId);
  }

  async function approve(bookId: string, eventId: string): Promise<void> {
    await proposalApprovalQueue.enqueue(bookId, async () => {
      await approveCurrent(bookId, eventId, true);
    });
  }

  function reject(bookId: string, eventId: string): boolean {
    const item = currentItem(bookId, eventId);
    if (
      !item ||
      item.status === "submitting" ||
      item.status === "accepted"
    ) return false;
    if (isContentFileProposal(item.event)) {
      clearContinuityFinalizations(
        (event) =>
          event.payload.bookId === bookId &&
          event.payload.sessionId === item.event.payload.sessionId
      );
    }
    if (isBatchProposal(item.event)) {
      const rejectedEvent = item.event;
      const rejectedFileIds = proposalFileIds(rejectedEvent);
      for (const dependent of itemsForBook(bookId)) {
        if (
          dependent.status === "waiting" &&
          isBatchProposal(dependent.event) &&
          dependent.event.payload.batch.documentWrites.some(
            ({ fileId, expectedRevision }) =>
              rejectedFileIds.has(fileId) &&
              producedFileRevision(rejectedEvent, fileId) ===
                expectedRevision
          )
        ) {
          updateItem(bookId, dependent.event.id, {
            status: "error",
            error:
              "依赖的文件创建或前序写入已被拒绝，本次变更未保存。",
            errorPhase: "preview",
            errorRetryable: false
          });
        }
      }
    }
    options.onRejected?.(item.event);
    removeItem(bookId, eventId);
    if (isBatchProposal(item.event)) {
      for (const waiting of itemsForBook(bookId).filter(
        (candidate) =>
          candidate.status === "waiting" &&
          isBatchProposal(candidate.event)
      )) {
        queueMicrotask(() => {
          if (waiting.approvalMode === "auto-approve") {
            void processAutomaticProposal(waiting.event, true);
          } else {
            void previewMutation(waiting);
          }
        });
      }
    }
    return true;
  }

  return {
    queues,
    itemsForBook,
    activateBook,
    discardBook,
    quarantineSession,
    handleEvent,
    enqueueManualMutation,
    retryPreview,
    approve,
    reject
  };
}
