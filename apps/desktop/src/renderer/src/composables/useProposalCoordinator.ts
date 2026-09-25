import {
  nextTick,
  type ComputedRef,
  type Ref,
  type ShallowRef
} from "vue";
import {
  LongWorkspaceOperationBatchSchema,
  MaterialStageIdSchema,
  SkillStageIdSchema,
  catalogDraftBodyDocumentId,
  catalogDraftCharacterStateDocumentId,
  createExpertDraftDirectoryRevision,
  createShortWorkspaceContentRevision,
  isProvisionalExpertDraftSectionId,
  parseCatalogDraftDocumentId,
  type Book,
  type CatalogIndexSnapshot,
  type CatalogLibrary,
  type CatalogLibraryEntry,
  type CharacterStructureMutation,
  type DeepWriteApi,
  type LongBookSummary,
  type LongWorkspaceOperationBatch,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import type { CatalogWorkspaceProjection } from "../data/catalogWorkspace";
import type { AgentEditProposal } from "../types/conversation";
import {
  replaceLongBookSummary,
  resolveLongWorkspaceApi
} from "../types/longWorkspace";
import type {
  EditorDraftState,
  WorkspaceDocument
} from "../types/workspace";
import {
  beginAgentEditProposalCommit,
  createAgentEditProposalRevisionLane,
  stageAgentEditProposalRevision,
  type AgentEditProposalCommitSnapshot
} from "../utils/agentEditProposalRevisionLane";
import {
  agentEditProposalGenerationId,
  agentEditProposalId,
  classifyAgentEditAcceptance,
  expectedMutationBaseRevision,
  expectedMutationDurableRevision,
  latestAgentEditProposalInLane,
  resolveAgentEditProposalGeneration,
  resolveAgentEditorMutationText
} from "../utils/agentEditReview";
import { buildAgentTextDiff } from "../utils/agentTextDiff";
import {
  captureWorkspaceDocumentBaselines,
  type WorkspaceDocumentBaseline
} from "../utils/catalogSaveReconciliation";
import { draftCharacterStateTitle } from "../utils/draftFileTitles";
import {
  advanceDraftSectionCreationRevision,
  draftSectionCreationRevisionKey,
  expectedDraftSectionCreationRevision,
  resolveDraftSectionCreationCommitPlan,
  type DraftSectionCreationRevisionCursor
} from "../utils/draftSectionCreationRevision";
import { findLongWorldbuildingFile } from "../utils/longWorldbuildingFiles";
import { createKeyedSerialTaskQueue } from "../utils/keyedSerialTaskQueue";
import { resolveProvisionalWriteStagingMode } from "../utils/provisionalExpertSectionStaging";
import type { AgentConversationController } from "./useAgentConversation";
import type { LongWorkspaceProposalEvent } from "./useLongWorkspaceProposals";
import type { LongWritingOrchestrator } from "./useLongWritingOrchestrator";

type LongChapterWriteProposalEvent = Extract<
  SystemEventEnvelope,
  { type: "long.chapter_write_proposal" }
>;

export interface QueuedAgentEdit {
  conversation: AgentConversationController;
  sessionId: string;
  runId: string;
  proposalId: string;
  workspaceId: string;
  automatic: boolean;
  expectedProposedRevision: string;
  decisionToken: string;
  snapshot: AgentEditProposalCommitSnapshot<AgentEditProposal>;
}

export interface ProposalCoordinatorNotifications {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface ProposalCoordinatorContext {
  api(): DeepWriteApi | undefined;
  notifications: ProposalCoordinatorNotifications;
  catalog: {
    snapshot: ShallowRef<CatalogIndexSnapshot | null>;
    projection: ShallowRef<CatalogWorkspaceProjection | null>;
    catalogBook(bookId: string): Book | undefined;
    findCatalogLibrary(
      domain: "material" | "skill",
      libraryId: string
    ): CatalogLibrary | undefined;
    loadSnapshot(): Promise<unknown>;
    applyAcceptedDocumentLocally(
      payload: { id: string; title: string; content: string },
      savedProjectRevision: number | undefined,
      draftAtAccept: EditorDraftState | undefined
    ): void;
    applyCreatedLibraryEntry(
      domain: "material" | "skill",
      libraryId: string,
      created: CatalogLibraryEntry,
      projectRevision: number | undefined
    ): Promise<void>;
    applySavedLibraryEntry(
      domain: "material" | "skill",
      libraryId: string,
      saved: CatalogLibraryEntry,
      projectRevision: number | undefined
    ): Promise<number | undefined>;
    applyUpdatedLibrary(
      domain: "material" | "skill",
      updated: CatalogLibrary
    ): Promise<void>;
    isConflict(error: unknown): boolean;
    refreshBookAfterSave(
      workspaceId: string,
      expectedDocuments: ReadonlyMap<string, WorkspaceDocumentBaseline>,
      minimumProjectRevision?: number
    ): Promise<boolean>;
  };
  editor: {
    documents: ShallowRef<WorkspaceDocument[]>;
    drafts: Ref<Record<string, EditorDraftState>>;
    liveDocuments: ComputedRef<WorkspaceDocument[]>;
    selectedDraftFileKinds: Ref<Record<string, "body" | "character-state">>;
    selectedExpertSectionIds: Ref<Record<string, string>>;
    acceptingWorkspaceIds: Ref<Set<string>>;
    savingDocumentIds: Ref<Set<string>>;
    rememberWorkspaceMutationEvent(eventId: string): boolean;
    setDocumentAccepting(documentId: string, accepting: boolean): void;
    setWorkspaceAccepting(workspaceId: string, accepting: boolean): void;
  };
  conversations: {
    active: ComputedRef<AgentConversationController>;
    activeLong: ComputedRef<AgentConversationController | null>;
    byKey: Map<string, AgentConversationController>;
    all(): AgentConversationController[];
    remove(
      key: string,
      options?: { dispose?: boolean; clearPersistence?: boolean }
    ): AgentConversationController | undefined;
    legacyDraftSectionKeys(workspaceId: string, sectionId: string): string[];
    forLongProposal(
      event: LongWorkspaceProposalEvent | LongChapterWriteProposalEvent
    ): AgentConversationController | undefined;
  };
  longWorkspace: {
    activeBookId: Ref<string | null>;
    books: ShallowRef<readonly LongBookSummary[]>;
    writingOrchestrator: LongWritingOrchestrator;
    refreshWritingSaveBarrier(bookId: string): Promise<boolean>;
    saveActiveEditorChanges(): Promise<boolean>;
  };
  navigation: {
    selectedResourceId: Ref<string>;
    activeCreationResourceId: Ref<string>;
    rightCollapsed: Ref<boolean>;
  };
}

export function useProposalCoordinator(context: ProposalCoordinatorContext) {
  const { api, notifications: uiMessage } = context;
  const {
    snapshot: catalogSnapshot,
    projection: catalogProjection,
    catalogBook,
    findCatalogLibrary,
    loadSnapshot: loadCatalogSnapshot,
    applyAcceptedDocumentLocally: applyAcceptedAgentDocumentLocally,
    applyCreatedLibraryEntry,
    applySavedLibraryEntry,
    applyUpdatedLibrary: applyUpdatedCatalogLibrary,
    isConflict: isCatalogConflict,
    refreshBookAfterSave: refreshBookAfterSuccessfulDocumentSave
  } = context.catalog;
  const {
    documents,
    drafts: editorDrafts,
    liveDocuments: liveWorkspaceDocuments,
    selectedDraftFileKinds,
    selectedExpertSectionIds,
    acceptingWorkspaceIds: acceptingAgentEditWorkspaceIds,
    savingDocumentIds,
    rememberWorkspaceMutationEvent,
    setDocumentAccepting: setAgentEditDocumentAccepting,
    setWorkspaceAccepting: setAgentEditWorkspaceAccepting
  } = context.editor;
  const {
    active: activeConversation,
    activeLong: activeLongConversation,
    byKey: conversations,
    all: allConversations,
    remove: removeConversation,
    legacyDraftSectionKeys: legacyDraftSectionConversationKeys,
    forLongProposal: longConversationForProposalEvent
  } = context.conversations;
  const {
    activeBookId: activeLongBookId,
    books: longBooks,
    writingOrchestrator: longWritingOrchestrator,
    refreshWritingSaveBarrier: refreshLongWritingSaveBarrier,
    saveActiveEditorChanges: saveActiveLongEditorChanges
  } = context.longWorkspace;
  const {
    selectedResourceId,
    activeCreationResourceId,
    rightCollapsed
  } = context.navigation;
  const queuedAgentEdits = new Map<string, QueuedAgentEdit>();
  const agentEditCommitQueue = createKeyedSerialTaskQueue<string>();
  const activeCoordinatorInvocations = new Set<Promise<void>>();
  const activeAgentEditCommitTasks = new Set<Promise<void>>();
  let coordinatorDisposed = false;
  let coordinatorDisposePromise: Promise<void> | undefined;
  let agentEditDecisionSequence = 0;
  const acceptedLibraryMutationCounts = new Map<string, number>();
  const acceptedDraftSectionCreationRevisions = new Map<
    string,
    DraftSectionCreationRevisionCursor
  >();
  const acceptedProvisionalExpertSectionIds = new Map<
    string,
    Map<string, string>
  >();

  type WorkspaceEditorMutationEvent = Extract<
    SystemEventEnvelope,
    { type: "workspace.editor_mutation" }
  >;
  type LibraryEditorMutationEvent = Extract<
    SystemEventEnvelope,
    { type: "library.editor_mutation" }
  >;
  type LongWorldbuildingFileMutationEvent = Extract<
    SystemEventEnvelope,
    { type: "long.worldbuilding_file_proposal" }
  >;
  type LongCharacterFileMutationEvent = Extract<
    SystemEventEnvelope,
    { type: "long.character_file_proposal" }
  >;
  type LongPlotDesignMutationEvent = Extract<
    SystemEventEnvelope,
    { type: "long.mutation_proposal" }
  >;
  type LongDraftMutationEvent = Extract<
    SystemEventEnvelope,
    { type: "long.chapter_write_proposal" }
  >;

  interface AgentEditReviewRequest {
    runId: string;
    proposalId: string;
    decision: "accept" | "reject";
  }

  function libraryMutationCountKey(proposal: AgentEditProposal): string {
    const target = proposal.libraryTarget!;
    return `${proposal.runId}\u0000${target.domain}\u0000${target.libraryId}`;
  }

  function currentLibraryProjectRevisionMatches(
    proposal: AgentEditProposal,
    currentRevision: number | undefined
  ): boolean {
    const baseRevision = proposal.libraryTarget?.baseProjectRevision;
    if (baseRevision === undefined || currentRevision === undefined) {
      return baseRevision === currentRevision;
    }
    const acceptedCount =
      acceptedLibraryMutationCounts.get(libraryMutationCountKey(proposal)) ?? 0;
    return currentRevision === baseRevision + acceptedCount;
  }

  function rememberAcceptedLibraryMutation(proposal: AgentEditProposal): void {
    const key = libraryMutationCountKey(proposal);
    acceptedLibraryMutationCounts.set(
      key,
      (acceptedLibraryMutationCounts.get(key) ?? 0) + 1
    );
    while (acceptedLibraryMutationCounts.size > 2_000) {
      const oldest = acceptedLibraryMutationCounts.keys().next().value as
        | string
        | undefined;
      if (!oldest) break;
      acceptedLibraryMutationCounts.delete(oldest);
    }
  }

  function expectedDraftSectionCreationBaseRevision(
    proposal: AgentEditProposal
  ): string {
    return expectedDraftSectionCreationRevision(
      proposal.baseRevision,
      acceptedDraftSectionCreationRevisions.get(
        draftSectionCreationRevisionKey(proposal.runId, proposal.workspaceId)
      )
    );
  }

  function rememberAcceptedDraftSectionCreation(
    proposal: AgentEditProposal,
    currentRevision: string
  ): void {
    const key = draftSectionCreationRevisionKey(
      proposal.runId,
      proposal.workspaceId
    );
    acceptedDraftSectionCreationRevisions.set(
      key,
      advanceDraftSectionCreationRevision(
        proposal.baseRevision,
        currentRevision,
        acceptedDraftSectionCreationRevisions.get(key)
      )
    );
    while (acceptedDraftSectionCreationRevisions.size > 2_000) {
      const oldest = acceptedDraftSectionCreationRevisions.keys().next().value as
        | string
        | undefined;
      if (!oldest) break;
      acceptedDraftSectionCreationRevisions.delete(oldest);
    }
  }

  async function acceptLibraryCreationProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean
  ): Promise<void> {
    const target = proposal.libraryTarget;
    if (
      !target ||
      target.operation !== "create" ||
      typeof proposal.proposedText !== "string"
    ) {
      const message = "待审阅的新条目缺少完整内容，请重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const currentApi = api();
    if (!currentApi) {
      const message = "桌面文件服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const library = findCatalogLibrary(target.domain, target.libraryId);
    const readOnly =
      !library ||
      (target.domain === "skill" && "isBuiltin" in library && library.isBuiltin);
    if (readOnly) {
      const message = "目标资料库已不可用或只读，无法创建条目。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (
      !currentLibraryProjectRevisionMatches(proposal, library.projectRevision)
    ) {
      const message = "资料库目录已发生变化，未创建条目，请重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      uiMessage.info("同一资料库正在保存其他修改，请稍候再接受");
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? "正在自动批准并创建资料库条目…"
        : "正在校验资料库版本并创建条目…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    try {
      const commonInput = {
        libraryId: target.libraryId,
        title: proposal.title,
        content: proposal.proposedText,
        ...(library.projectRevision === undefined
          ? {}
          : { baseProjectRevision: library.projectRevision })
      };
      const created =
        target.domain === "material"
          ? await currentApi.catalog.createLibraryEntry({
              ...commonInput,
              domain: "material",
              stageId: MaterialStageIdSchema.parse(target.stageId)
            })
          : await currentApi.catalog.createLibraryEntry({
              ...commonInput,
              domain: "skill",
              stageId: SkillStageIdSchema.parse(target.stageId)
            });
      const nextProjectRevision =
        library.projectRevision === undefined
          ? undefined
          : library.projectRevision + 1;
      await applyCreatedLibraryEntry(
        target.domain,
        target.libraryId,
        created,
        nextProjectRevision
      );
      rememberAcceptedLibraryMutation(proposal);
      const createdDocument = documents.value.find(
        (document) =>
          document.domain === target.domain &&
          document.libraryId === target.libraryId &&
          document.catalogEntryId === created.id
      );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        ...(createdDocument ? { documentId: createdDocument.id } : {}),
        libraryTarget: {
          ...target,
          entryId: created.id
        },
        statusMessage: automatic
          ? "已自动批准并创建资料库条目。"
          : "已创建并保存到本地 Markdown。"
      });
      if (createdDocument) {
        selectedResourceId.value = createdDocument.id;
        rightCollapsed.value = false;
      }
      uiMessage.success(
        automatic ? "已自动批准并创建资料库条目" : "已创建资料库条目"
      );
    } catch (error: unknown) {
      const message = isCatalogConflict(error)
        ? "资料库已在外部更新，未创建条目；请重新生成。"
        : error instanceof Error
          ? error.message
          : "创建资料库条目失败。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: isCatalogConflict(error) ? "conflict" : "error",
        statusMessage: message
      });
      if (isCatalogConflict(error)) {
        await loadCatalogSnapshot();
        uiMessage.warning(message);
      } else {
        uiMessage.error(message);
      }
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  function currentExpertDraftDirectoryRevision(
    workspaceId: string
  ): string | undefined {
    const sections = new Map<
      string,
      {
        order: number;
        title: string;
        wordCountRequirement: string;
        hasBody: boolean;
        hasCharacterState: boolean;
      }
    >();
    for (const document of liveWorkspaceDocuments.value) {
      if (
        document.workspaceId !== workspaceId ||
        document.stageId !== "draft" ||
        !document.expertSectionId ||
        !document.draftFileKind
      ) {
        continue;
      }
      const section = sections.get(document.expertSectionId) ?? {
        order: document.expertSectionOrder ?? Number.MAX_SAFE_INTEGER,
        title:
          document.draftFileKind === "body"
            ? document.title
            : document.title.replace(/\s*·\s*人物状态$/u, ""),
        wordCountRequirement: document.expertWordCountRequirement ?? "",
        hasBody: false,
        hasCharacterState: false
      };
      if (document.draftFileKind === "body") {
        section.title = document.title;
        section.wordCountRequirement = document.expertWordCountRequirement ?? "";
        section.hasBody = true;
      } else {
        section.hasCharacterState = true;
      }
      sections.set(document.expertSectionId, section);
    }
    const complete = [...sections.entries()]
      .filter(([, section]) => section.hasBody && section.hasCharacterState)
      .sort((left, right) => left[1].order - right[1].order);
    if (complete.length === 0) return undefined;
    return createExpertDraftDirectoryRevision(
      complete.map(([sectionId, section]) => ({
        id: sectionId,
        title: section.title,
        wordCountRequirement: section.wordCountRequirement
      }))
    );
  }

  function provisionalExpertSectionMapKey(runId: string, workspaceId: string): string {
    return `${runId}\u0000${workspaceId}`;
  }

  function rememberProvisionalExpertSectionMapping(
    runId: string,
    workspaceId: string,
    provisionalSectionId: string,
    realSectionId: string
  ): void {
    const key = provisionalExpertSectionMapKey(runId, workspaceId);
    const map = acceptedProvisionalExpertSectionIds.get(key) ?? new Map<string, string>();
    map.set(provisionalSectionId, realSectionId);
    acceptedProvisionalExpertSectionIds.set(key, map);
    while (acceptedProvisionalExpertSectionIds.size > 2_000) {
      const oldest = acceptedProvisionalExpertSectionIds.keys().next().value as
        | string
        | undefined;
      if (!oldest) break;
      acceptedProvisionalExpertSectionIds.delete(oldest);
    }
  }

  function resolveProvisionalExpertSectionId(
    runId: string,
    workspaceId: string,
    sectionId: string
  ): string {
    if (!isProvisionalExpertDraftSectionId(sectionId)) return sectionId;
    return (
      acceptedProvisionalExpertSectionIds
        .get(provisionalExpertSectionMapKey(runId, workspaceId))
        ?.get(sectionId) ?? sectionId
    );
  }

  function findPendingDraftSectionCreationForProvisional(
    conversation: AgentConversationController,
    runId: string,
    provisionalSectionId: string
  ): AgentEditProposal | undefined {
    return conversation.listEditProposals(runId).find((proposal) =>
      Boolean(
        proposal.draftSectionCreationTarget?.sections.some(
          (section) => section.provisionalSectionId === provisionalSectionId
        ) &&
          (proposal.status === "pending" ||
            proposal.status === "accepting" ||
            proposal.status === "error")
      )
    );
  }

  function findPendingCharacterCreationForProvisional(
    conversation: AgentConversationController,
    runId: string,
    itemId: string
  ): AgentEditProposal | undefined {
    return conversation.listEditProposals(runId).find((proposal) => {
      const mutation = proposal.characterStructureTarget?.mutation;
      return Boolean(
        mutation?.type === "createItem" &&
          mutation.itemId === itemId &&
          (proposal.status === "pending" ||
            proposal.status === "accepting" ||
            proposal.status === "error")
      );
    });
  }

  function remapProvisionalExpertSectionFileProposals(
    conversation: AgentConversationController,
    runId: string,
    workspaceId: string,
    mapping: ReadonlyMap<string, string>
  ): void {
    for (const proposal of conversation.listEditProposals(runId)) {
      if (!proposal.provisionalExpertSection) continue;
      if (
        proposal.status !== "pending" &&
        proposal.status !== "accepting" &&
        proposal.status !== "error"
      ) {
        continue;
      }
      for (const [provisionalSectionId, realSectionId] of mapping) {
        const provisionalBodyId = catalogDraftBodyDocumentId(provisionalSectionId);
        const provisionalStateId =
          catalogDraftCharacterStateDocumentId(provisionalSectionId);
        const fileKind =
          proposal.documentId === provisionalBodyId
            ? ("body" as const)
            : proposal.documentId === provisionalStateId
              ? ("character-state" as const)
              : undefined;
        if (!fileKind) continue;
        const realDocument = liveWorkspaceDocuments.value.find(
          (document) =>
            document.workspaceId === workspaceId &&
            document.stageId === "draft" &&
            document.expertSectionId === realSectionId &&
            document.draftFileKind === fileKind
        );
        if (!realDocument) continue;
        conversation.updateEditProposal(runId, proposal.id, {
          documentId: realDocument.id,
          title: realDocument.title,
          provisionalExpertSection: false,
          baseRevision: proposal.predecessorProposalId
            ? proposal.baseRevision
            : createShortWorkspaceContentRevision(realDocument.content),
          statusMessage:
            proposal.statusMessage ??
            "已关联到新创建的章节文件，接受后将写入正文。"
        });
        break;
      }
    }
  }

  function restoreAcceptedDraftSectionCreationMappings(
    conversation: AgentConversationController
  ): void {
    for (const message of conversation.messages.value) {
      for (const proposal of message.editProposals ?? []) {
        if (
          proposal.status !== "accepted" ||
          !proposal.draftSectionCreationTarget
        ) {
          continue;
        }
        const mapping = new Map<string, string>();
        for (const section of proposal.draftSectionCreationTarget.sections) {
          if (!section.realSectionId) continue;
          mapping.set(section.provisionalSectionId, section.realSectionId);
          rememberProvisionalExpertSectionMapping(
            proposal.runId,
            proposal.workspaceId,
            section.provisionalSectionId,
            section.realSectionId
          );
        }
        if (mapping.size === 0) continue;
        const acceptedDirectoryRevision =
          proposal.draftSectionCreationTarget.acceptedDirectoryRevision;
        if (acceptedDirectoryRevision) {
          rememberAcceptedDraftSectionCreation(
            proposal,
            acceptedDirectoryRevision
          );
        }
        remapProvisionalExpertSectionFileProposals(
          conversation,
          proposal.runId,
          proposal.workspaceId,
          mapping
        );
      }
    }
  }

  function pauseDependentProvisionalFileProposals(
    conversation: AgentConversationController,
    runId: string,
    provisionalSectionIds: readonly string[],
    message: string
  ): void {
    const provisionalSet = new Set(provisionalSectionIds);
    for (const proposal of conversation.listEditProposals(runId)) {
      if (!proposal.provisionalExpertSection) continue;
      const parsed = parseCatalogDraftDocumentId(proposal.documentId);
      if (
        !parsed ||
        !provisionalSet.has(parsed.sectionId) ||
        (proposal.status !== "pending" &&
          proposal.status !== "accepting" &&
          proposal.status !== "error")
      ) {
        continue;
      }
      removeQueuedAgentEdit(conversation, runId, proposal.id);
      conversation.updateEditProposal(runId, proposal.id, {
        status: "pending",
        statusMessage: message
      });
    }
  }

  function conflictDependentProvisionalFileProposals(
    conversation: AgentConversationController,
    runId: string,
    provisionalSectionIds: readonly string[],
    message: string
  ): void {
    const provisionalSet = new Set(provisionalSectionIds);
    for (const proposal of conversation.listEditProposals(runId)) {
      if (!proposal.provisionalExpertSection) continue;
      if (
        proposal.status !== "pending" &&
        proposal.status !== "accepting" &&
        proposal.status !== "error"
      ) {
        continue;
      }
      const matches = [...provisionalSet].some((sectionId) => {
        const bodyId = catalogDraftBodyDocumentId(sectionId);
        const stateId = catalogDraftCharacterStateDocumentId(sectionId);
        return proposal.documentId === bodyId || proposal.documentId === stateId;
      });
      if (!matches) continue;
      removeQueuedAgentEdit(conversation, runId, proposal.id);
      conversation.updateEditProposal(runId, proposal.id, {
        status: "conflict",
        statusMessage: message,
        proposedText: undefined
      });
    }
  }

  function autoApproveEditPriority(
    conversation: AgentConversationController,
    runId: string,
    proposalId: string
  ): number {
    const proposal = conversation.getEditProposal(runId, proposalId);
    if (!proposal) return 2;
    if (proposal.draftSectionCreationTarget) return 0;
    if (proposal.characterStructureTarget?.mutation.type === "createItem") return 0;
    if (
      proposal.longWorldbuildingTarget?.file.operation === "create"
    ) return 0;
    if (
      proposal.longCharacterTarget?.files.every(
        ({ operation }) => operation === "create"
      )
    ) return 0;
    if (proposal.longWorldbuildingTarget?.file.beforeRevision !== null) {
      return proposal.predecessorProposalId ? 1 : 2;
    }
    if (
      proposal.longCharacterTarget &&
      proposal.longCharacterTarget.files.some(
        ({ beforeRevision }) => beforeRevision !== null
      )
    ) {
      return proposal.predecessorProposalId ? 1 : 2;
    }
    if (proposal.longPlotDesignTarget) {
      return 2;
    }
    if (proposal.longDraftTarget) {
      return proposal.predecessorProposalId ? 1 : 2;
    }
    if (proposal.provisionalExpertSection) return 1;
    if (proposal.provisionalCharacterItemId) return 1;
    return 2;
  }

  function agentEditQueueKey(
    sessionId: string,
    runId: string,
    proposalId: string
  ): string {
    return `${sessionId}\u0000${runId}\u0000${proposalId}`;
  }

  function nextAgentEditDecisionToken(proposal: AgentEditProposal): string {
    agentEditDecisionSequence += 1;
    return `${proposal.runId}:${proposal.id}:${proposal.generation ?? 1}:${agentEditDecisionSequence}`;
  }

  function draftSectionCreationOperationId(
    proposal: AgentEditProposal
  ): string {
    return [
      "agent-draft-sections",
      proposal.proposedRevision,
      proposal.runId.slice(-120),
      proposal.id.slice(-240)
    ].join(":");
  }

  function latestProposalForLane(
    conversation: AgentConversationController,
    runId: string,
    laneId: string
  ): AgentEditProposal | undefined {
    return latestAgentEditProposalInLane(
      conversation.listEditProposals(runId),
      laneId
    );
  }

  function expectedLaneDurableRevision(
    conversation: AgentConversationController,
    runId: string,
    existing: AgentEditProposal | undefined,
    currentText: string
  ): string {
    let cursor = existing;
    const seen = new Set<string>();
    while (
      cursor?.predecessorProposalId &&
      cursor.status !== "accepted" &&
      !seen.has(cursor.id)
    ) {
      seen.add(cursor.id);
      const predecessor = conversation.getEditProposal(
        runId,
        cursor.predecessorProposalId
      );
      if (!predecessor || predecessor.status === "accepted") break;
      cursor = predecessor;
    }
    return expectedMutationDurableRevision(cursor, currentText);
  }

  function laneDurableRevisionMatches(
    conversation: AgentConversationController,
    runId: string,
    existing: AgentEditProposal | undefined,
    currentText: string,
    currentRevision: string
  ): boolean {
    if (!existing) {
      return (
        currentRevision === createShortWorkspaceContentRevision(currentText)
      );
    }
    const compatible = new Set<string>();
    let cursor: AgentEditProposal | undefined = existing;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      compatible.add(cursor.baseRevision);
      if (
        cursor.status === "accepting" ||
        cursor.status === "accepted"
      ) {
        compatible.add(cursor.proposedRevision);
      }
      cursor = cursor.predecessorProposalId
        ? conversation.getEditProposal(runId, cursor.predecessorProposalId)
        : undefined;
    }
    compatible.add(
      expectedLaneDurableRevision(
        conversation,
        runId,
        existing,
        currentText
      )
    );
    return compatible.has(currentRevision);
  }

  function blockedAgentEditLaneMessage(
    proposal: AgentEditProposal | undefined
  ): string | undefined {
    if (proposal?.status === "rejected") {
      return "此前版本已被拒绝；为避免把被拒内容随后续全文重新带回，本次变更已阻断。";
    }
    if (proposal?.status === "conflict") {
      return "此前版本存在冲突，本次后续变更已阻断，未覆盖当前文稿。";
    }
    return undefined;
  }

  function isShortOrScriptAgentEdit(proposal: AgentEditProposal): boolean {
    if (proposal.libraryTarget) return false;
    const book = catalogBook(proposal.workspaceId);
    return book?.bookType === "short" || book?.bookType === "script";
  }

  function canReviewAgentEditDuringRun(proposal: AgentEditProposal): boolean {
    return (
      Boolean(proposal.libraryTarget) ||
      Boolean(proposal.longWorldbuildingTarget) ||
      Boolean(proposal.longCharacterTarget) ||
      Boolean(proposal.longPlotDesignTarget) ||
      Boolean(proposal.longDraftTarget) ||
      isShortOrScriptAgentEdit(proposal)
    );
  }

  function removeQueuedAgentEdit(
    conversation: AgentConversationController,
    runId: string,
    proposalId: string
  ): void {
    for (const [key, queued] of queuedAgentEdits) {
      if (
        queued.conversation === conversation &&
        queued.runId === runId &&
        queued.proposalId === proposalId
      ) {
        queuedAgentEdits.delete(key);
      }
    }
  }

  function blockLaterAgentEditGenerations(
    conversation: AgentConversationController,
    rejected: AgentEditProposal
  ): void {
    const laneId = rejected.laneId ?? rejected.id;
    const generation = rejected.generation ?? 1;
    for (const candidate of conversation.listEditProposals(rejected.runId)) {
      if (
        candidate.id === rejected.id ||
        (candidate.laneId ?? candidate.id) !== laneId ||
        (candidate.generation ?? 1) <= generation ||
        (candidate.status !== "pending" && candidate.status !== "error")
      ) {
        continue;
      }
      removeQueuedAgentEdit(
        conversation,
        candidate.runId,
        candidate.id
      );
      conversation.updateEditProposal(candidate.runId, candidate.id, {
        status: "conflict",
        proposedText: undefined,
        statusMessage:
          "此前正文版本已被拒绝；该版本继承了被拒内容，因此未写入本地文件。"
      });
    }
  }

  function queueAgentEdit(
    conversation: AgentConversationController,
    sessionId: string,
    runId: string,
    proposalId: string,
    automatic: boolean,
    scheduleImmediately: boolean
  ): void {
    const proposal = conversation.getEditProposal(runId, proposalId);
    if (
      !proposal ||
      (proposal.status !== "pending" && proposal.status !== "error")
    ) {
      return;
    }

    const key = agentEditQueueKey(sessionId, runId, proposalId);
    const existingQueued = queuedAgentEdits.get(key);
    if (
      existingQueued?.expectedProposedRevision === proposal.proposedRevision
    ) {
      if (scheduleImmediately) {
        scheduleQueuedAgentEdits(
          (queued) => queued === queuedAgentEdits.get(key)
        );
      }
      return;
    }
    const decisionToken = nextAgentEditDecisionToken(proposal);
    const staged = stageAgentEditProposalRevision(
      createAgentEditProposalRevisionLane<AgentEditProposal>({
        targetKey: proposal.laneId ?? proposal.id,
        durableRevision: proposal.baseRevision,
        overlayRevision: proposal.sourceBaseRevision ?? proposal.baseRevision,
        generation: Math.max(0, (proposal.generation ?? 1) - 1)
      }),
      {
        approvalMode:
          proposal.approvalMode ??
          (automatic ? "auto-approve" : "request-approval"),
        sourceBaseRevision:
          proposal.sourceBaseRevision ?? proposal.baseRevision,
        proposedRevision: proposal.proposedRevision,
        proposal
      }
    );
    if (staged.status !== "staged") {
      return;
    }
    const started = beginAgentEditProposalCommit(staged.lane, {
      generation: proposal.generation ?? 1,
      token: decisionToken
    });
    if (started.status !== "started") {
      return;
    }
    if (scheduleImmediately && !automatic) {
      conversation.updateEditProposal(runId, proposalId, {
        status: "accepting",
        decisionToken,
        statusMessage: automatic
          ? "已进入实时自动保存队列…"
          : "已批准，正在等待本作品的保存队列…"
      });
    }
    queuedAgentEdits.set(key, {
      conversation,
      sessionId,
      runId,
      proposalId,
      workspaceId: proposal.workspaceId,
      automatic,
      expectedProposedRevision: proposal.proposedRevision,
      decisionToken,
      snapshot: started.snapshot
    });
    if (scheduleImmediately) {
      scheduleQueuedAgentEdits((queued) => queued === queuedAgentEdits.get(key));
    }
  }

  async function acceptCharacterStructureProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean,
    reserved = false
  ): Promise<void> {
    if (
      (proposal.status === "accepting" && !reserved) ||
      proposal.status === "accepted" ||
      proposal.status === "rejected" ||
      proposal.status === "conflict"
    ) return;
    const target = proposal.characterStructureTarget;
    const book = catalogBook(proposal.workspaceId);
    const currentApi = api();
    if (!target || !book || book.projectRevision === undefined || !currentApi) {
      const message = "人物结构目标已不可用，无法应用本次变更。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const hasAcceptedSameRunPredecessor = conversation
      .listEditProposals(request.runId)
      .some(
        (candidate) =>
          candidate.id !== proposal.id &&
          candidate.workspaceId === proposal.workspaceId &&
          candidate.status === "accepted" &&
          candidate.createdAt <= proposal.createdAt
      );
    if (
      target.baseProjectRevision !== undefined &&
      book.projectRevision !== target.baseProjectRevision &&
      !hasAcceptedSameRunPredecessor
    ) {
      const message = "人物结构版本已变化，未接受本次智能体修改。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic ? "正在自动保存人物结构…" : "正在保存人物结构…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    try {
      await currentApi.catalog.mutateCharacterStructure({
        bookId: proposal.workspaceId,
        baseProjectRevision: book.projectRevision,
        mutation: target.mutation
      });
      await loadCatalogSnapshot();
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage: automatic
          ? "已自动批准并保存人物结构变更。"
          : "人物结构变更已保存到本地。"
      });
      if (!automatic) uiMessage.success("人物结构变更已保存");
    } catch (error) {
      await loadCatalogSnapshot();
      const message = error instanceof Error ? error.message : "人物结构变更保存失败。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: isCatalogConflict(error) ? "conflict" : "error",
        statusMessage: message
      });
      uiMessage.error(message);
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  function resumeRecoveredAutomaticAgentEdits(
    conversationsToScan: readonly AgentConversationController[] =
      allConversations()
  ): void {
    if (!catalogSnapshot.value) return;
    for (const conversation of conversationsToScan) {
      restoreAcceptedDraftSectionCreationMappings(conversation);
    }
    for (const conversation of conversationsToScan) {
      for (const message of conversation.messages.value) {
        for (const proposal of message.editProposals ?? []) {
          if (
            proposal.approvalMode !== "auto-approve" ||
            proposal.status !== "pending" ||
            !canReviewAgentEditDuringRun(proposal)
          ) {
            continue;
          }
          queueAgentEdit(
            conversation,
            conversation.sessionId.value,
            proposal.runId,
            proposal.id,
            true,
            true
          );
        }
      }
    }
  }

  function stageAgentEditProposal(event: WorkspaceEditorMutationEvent): void {
    if (!rememberWorkspaceMutationEvent(event.id)) return;
    const sourceConversation = allConversations().find((conversation) =>
      conversation.acceptsRunEvent(event.payload.sessionId, event.payload.runId)
    );
    if (!sourceConversation) return;
    const runApprovalMode =
      sourceConversation.approvalModeForRun(
        event.payload.sessionId,
        event.payload.runId
      ) ?? "request-approval";

    const mutationTarget = event.payload.mutationTarget;
    if (mutationTarget?.kind === "character-structure") {
      const book = catalogBook(event.payload.workspaceId);
      if (!book || book.characterStructure.format !== "list") {
        const message = "人物结构已变化，本次条目操作未进入审阅。";
        sourceConversation.markToolConflict(event.payload.runId, event.payload.toolCallId, message);
        uiMessage.warning(message);
        return;
      }
      const source = mutationTarget.mutation;
      const mutation: CharacterStructureMutation =
        source.type === "createItem"
          ? { type: "createItem", title: source.title, itemId: source.provisionalItemId }
          : source.type === "updateItem"
            ? { type: "updateItem", itemId: source.itemId, title: source.title }
            : source.type === "moveItem"
              ? { type: "moveItem", itemId: source.itemId, direction: source.direction }
              : { type: "deleteItem", itemId: source.itemId };
      const documentId = `character-structure:${event.payload.toolCallId}`;
      const proposalId = agentEditProposalId(
        event.payload.runId,
        event.payload.workspaceId,
        "character_design",
        documentId
      );
      if (sourceConversation.getEditProposal(event.payload.runId, proposalId)) return;
      const beforeText =
        source.type === "deleteItem"
          ? source.deletedText
          : source.type === "updateItem"
            ? source.previousTitle
            : "";
      const afterText =
        source.type === "deleteItem"
          ? ""
          : source.type === "updateItem"
            ? source.title
            : source.type === "createItem"
              ? source.title
              : event.payload.text;
      const diff = buildAgentTextDiff(beforeText, afterText);
      const proposal: AgentEditProposal = {
        id: proposalId,
        laneId: proposalId,
        generation: 1,
        approvalMode: runApprovalMode,
        sourceBaseRevision: event.payload.baseRevision,
        runId: event.payload.runId,
        workspaceId: event.payload.workspaceId,
        stageId: "character_design",
        documentId,
        title:
          source.type === "createItem"
            ? `创建人物条目：${source.title}`
            : source.type === "updateItem"
              ? `修改人物名称：${source.previousTitle} → ${source.title}`
              : source.type === "moveItem"
                ? `${source.direction === "up" ? "上移" : "下移"}人物条目：${source.title}`
                : `删除人物条目：${source.title}`,
        summary: event.payload.summary,
        status: "pending",
        baseRevision: event.payload.baseRevision,
        proposedRevision: createShortWorkspaceContentRevision(afterText),
        proposedText: afterText,
        toolCallIds: [event.payload.toolCallId],
        additions: diff.additions,
        deletions: diff.deletions,
        hunks: diff.hunks,
        ...(diff.truncated ? { truncated: true } : {}),
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        characterStructureTarget: {
          mutation,
          ...(book.projectRevision === undefined
            ? {}
            : { baseProjectRevision: book.projectRevision })
        }
      };
      sourceConversation.upsertEditProposal(event.payload.runId, proposal);
      if (runApprovalMode === "auto-approve") {
        queueAgentEdit(
          sourceConversation,
          event.payload.sessionId,
          event.payload.runId,
          proposalId,
          true,
          true
        );
      }
      return;
    }
    if (mutationTarget?.kind === "expert-draft-section-creation") {
      const directory = catalogProjection.value?.draftDirectories.find(
        (candidate) => candidate.workspaceId === event.payload.workspaceId
      );
      const book = catalogBook(event.payload.workspaceId);
      const currentRevision = currentExpertDraftDirectoryRevision(
        event.payload.workspaceId
      );
      // Same cursor as accept: same-run creates keep frozen baseRevision R0, but after
      // an earlier accept the live directory may already be R1/R2/...
      const expectedDirectoryRevision = expectedDraftSectionCreationRevision(
        event.payload.baseRevision,
        acceptedDraftSectionCreationRevisions.get(
          draftSectionCreationRevisionKey(
            event.payload.runId,
            event.payload.workspaceId
          )
        )
      );
      if (!directory || !book || currentRevision !== expectedDirectoryRevision) {
        const message =
          "正文目录版本已变化，本次章节创建未进入审阅，也没有改动现有文件。";
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }

      const documentId = `draft-section-creation:${event.payload.toolCallId}`;
      const proposalId = agentEditProposalId(
        event.payload.runId,
        event.payload.workspaceId,
        "draft",
        documentId
      );
      const existing = sourceConversation.getEditProposal(
        event.payload.runId,
        proposalId
      );
      if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;

      const proposedText = event.payload.text;
      const diff = buildAgentTextDiff("", proposedText);
      const proposal: AgentEditProposal = {
        id: proposalId,
        laneId: proposalId,
        generation: 1,
        approvalMode: runApprovalMode,
        sourceBaseRevision: event.payload.baseRevision,
        runId: event.payload.runId,
        workspaceId: event.payload.workspaceId,
        stageId: "draft",
        documentId,
        title: `创建 ${mutationTarget.sections.length} 个空白章节`,
        summary: event.payload.summary,
        status: "pending",
        baseRevision: event.payload.baseRevision,
        proposedRevision: createShortWorkspaceContentRevision(proposedText),
        proposedText,
        toolCallIds: [event.payload.toolCallId],
        additions: diff.additions,
        deletions: diff.deletions,
        hunks: diff.hunks,
        ...(diff.truncated ? { truncated: true } : {}),
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        draftSectionCreationTarget: {
          sections: mutationTarget.sections.map((section) => ({ ...section })),
          ...(mutationTarget.afterSectionId
            ? { afterSectionId: mutationTarget.afterSectionId }
            : {}),
          ...(book.projectRevision === undefined
            ? {}
            : { baseProjectRevision: book.projectRevision })
        }
      };
      sourceConversation.upsertEditProposal(event.payload.runId, proposal);
      if (runApprovalMode === "auto-approve") {
        queueAgentEdit(
          sourceConversation,
          event.payload.sessionId,
          event.payload.runId,
          proposalId,
          true,
          true
        );
      }
      return;
    }

    if (mutationTarget?.kind === "expert-draft-section-rename") {
      const directory = catalogProjection.value?.draftDirectories.find(
        (candidate) => candidate.workspaceId === event.payload.workspaceId
      );
      const book = catalogBook(event.payload.workspaceId);
      const currentRevision = currentExpertDraftDirectoryRevision(
        event.payload.workspaceId
      );
      const expectedDirectoryRevision = expectedDraftSectionCreationRevision(
        event.payload.baseRevision,
        acceptedDraftSectionCreationRevisions.get(
          draftSectionCreationRevisionKey(
            event.payload.runId,
            event.payload.workspaceId
          )
        )
      );
      const section = directory?.sections.find(
        (candidate) => candidate.id === mutationTarget.sectionId
      );
      if (
        !directory ||
        !book ||
        !section ||
        currentRevision !== expectedDirectoryRevision
      ) {
        const message =
          "正文目录版本已变化，本次章节改名未进入审阅，也没有改动现有文件。";
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      if (section.title !== mutationTarget.previousTitle) {
        const message =
          `章节「${mutationTarget.previousTitle}」的当前标题已变化，本次改名未进入审阅。`;
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      if (
        directory.sections.some(
          (candidate) =>
            candidate.id !== mutationTarget.sectionId &&
            candidate.title === mutationTarget.title
        )
      ) {
        const message = `正文目录已存在同名章节「${mutationTarget.title}」，本次改名未进入审阅。`;
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }

      const documentId = `draft-section-rename:${event.payload.toolCallId}`;
      const proposalId = agentEditProposalId(
        event.payload.runId,
        event.payload.workspaceId,
        "draft",
        documentId
      );
      const existing = sourceConversation.getEditProposal(
        event.payload.runId,
        proposalId
      );
      if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;

      const proposedText = event.payload.text;
      const diff = buildAgentTextDiff(mutationTarget.previousTitle, mutationTarget.title);
      const proposal: AgentEditProposal = {
        id: proposalId,
        laneId: proposalId,
        generation: 1,
        approvalMode: runApprovalMode,
        sourceBaseRevision: event.payload.baseRevision,
        runId: event.payload.runId,
        workspaceId: event.payload.workspaceId,
        stageId: "draft",
        documentId,
        title: `修改章节名称：${mutationTarget.previousTitle} → ${mutationTarget.title}`,
        summary: event.payload.summary,
        status: "pending",
        baseRevision: event.payload.baseRevision,
        proposedRevision: createShortWorkspaceContentRevision(proposedText),
        proposedText,
        toolCallIds: [event.payload.toolCallId],
        additions: diff.additions,
        deletions: diff.deletions,
        hunks: diff.hunks,
        ...(diff.truncated ? { truncated: true } : {}),
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        draftSectionRenameTarget: {
          sectionId: mutationTarget.sectionId,
          previousTitle: mutationTarget.previousTitle,
          title: mutationTarget.title,
          ...(book.projectRevision === undefined
            ? {}
            : { baseProjectRevision: book.projectRevision })
        }
      };
      sourceConversation.upsertEditProposal(event.payload.runId, proposal);
      if (runApprovalMode === "auto-approve") {
        queueAgentEdit(
          sourceConversation,
          event.payload.sessionId,
          event.payload.runId,
          proposalId,
          true,
          true
        );
      }
      return;
    }

    if (mutationTarget?.kind === "expert-draft-section-deletion") {
      const directory = catalogProjection.value?.draftDirectories.find(
        (candidate) => candidate.workspaceId === event.payload.workspaceId
      );
      const book = catalogBook(event.payload.workspaceId);
      const currentRevision = currentExpertDraftDirectoryRevision(
        event.payload.workspaceId
      );
      const expectedDirectoryRevision = expectedDraftSectionCreationRevision(
        event.payload.baseRevision,
        acceptedDraftSectionCreationRevisions.get(
          draftSectionCreationRevisionKey(
            event.payload.runId,
            event.payload.workspaceId
          )
        )
      );
      const section = directory?.sections.find(
        (candidate) => candidate.id === mutationTarget.sectionId
      );
      if (
        !directory ||
        !book ||
        !section ||
        currentRevision !== expectedDirectoryRevision
      ) {
        const message =
          "正文目录版本已变化，本次章节删除未进入审阅，也没有改动现有文件。";
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      if (section.title !== mutationTarget.title) {
        const message =
          `章节「${mutationTarget.title}」的当前标题已变化，本次删除未进入审阅。`;
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      if (directory.sections.length <= 1) {
        const message = "正文至少需要保留一个章节，本次删除未进入审阅。";
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }

      const documentId = `draft-section-deletion:${event.payload.toolCallId}`;
      const proposalId = agentEditProposalId(
        event.payload.runId,
        event.payload.workspaceId,
        "draft",
        documentId
      );
      const existing = sourceConversation.getEditProposal(
        event.payload.runId,
        proposalId
      );
      if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;

      const proposedText = event.payload.text;
      const diff = buildAgentTextDiff(mutationTarget.title, "");
      const proposal: AgentEditProposal = {
        id: proposalId,
        laneId: proposalId,
        generation: 1,
        approvalMode: runApprovalMode,
        sourceBaseRevision: event.payload.baseRevision,
        runId: event.payload.runId,
        workspaceId: event.payload.workspaceId,
        stageId: "draft",
        documentId,
        title: `删除章节：${mutationTarget.title}`,
        summary: event.payload.summary,
        status: "pending",
        baseRevision: event.payload.baseRevision,
        proposedRevision: createShortWorkspaceContentRevision(proposedText),
        proposedText,
        toolCallIds: [event.payload.toolCallId],
        additions: diff.additions,
        deletions: diff.deletions,
        hunks: diff.hunks,
        ...(diff.truncated ? { truncated: true } : {}),
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
        draftSectionDeletionTarget: {
          sectionId: mutationTarget.sectionId,
          title: mutationTarget.title,
          ...(book.projectRevision === undefined
            ? {}
            : { baseProjectRevision: book.projectRevision })
        }
      };
      sourceConversation.upsertEditProposal(event.payload.runId, proposal);
      if (runApprovalMode === "auto-approve") {
        queueAgentEdit(
          sourceConversation,
          event.payload.sessionId,
          event.payload.runId,
          proposalId,
          true,
          true
        );
      }
      return;
    }

    const expectedDraftFileKind =
      mutationTarget?.kind === "expert-draft-file" && mutationTarget.fileKind === "characterState"
        ? "character-state"
        : mutationTarget?.kind === "expert-draft-file"
          ? mutationTarget.fileKind
          : undefined;
    const target = liveWorkspaceDocuments.value.find((document) =>
      mutationTarget?.kind === "character-file"
        ? document.catalogDocumentId === mutationTarget.documentId &&
          document.workspaceId === event.payload.workspaceId &&
          document.stageId === "character_design"
        : mutationTarget?.kind === "expert-draft-file"
        ? document.id === mutationTarget.documentId &&
          document.workspaceId === event.payload.workspaceId &&
          document.stageId === "draft" &&
          document.expertSectionId === mutationTarget.sectionId &&
          document.draftFileKind === expectedDraftFileKind
        : document.workspaceId === event.payload.workspaceId &&
          document.stageId === event.payload.stageId &&
          document.draftFileKind === undefined
    );
    if (
      (!target || target.readOnly) &&
      mutationTarget?.kind === "expert-draft-file" &&
      isProvisionalExpertDraftSectionId(mutationTarget.sectionId)
    ) {
      const creation = findPendingDraftSectionCreationForProvisional(
        sourceConversation,
        event.payload.runId,
        mutationTarget.sectionId
      );
      const realSectionId = resolveProvisionalExpertSectionId(
        event.payload.runId,
        event.payload.workspaceId,
        mutationTarget.sectionId
      );
      const stagingMode = resolveProvisionalWriteStagingMode({
        hasPendingCreation: Boolean(creation),
        provisionalSectionId: mutationTarget.sectionId,
        resolvedSectionId: realSectionId
      });

      // Mid-run accept already landed the chapter: keep staging on the same
      // provisional-keyed proposal id, but validate/write against the real file.
      if (stagingMode === "mapped-real") {
        const realTarget = liveWorkspaceDocuments.value.find(
          (document) =>
            document.workspaceId === event.payload.workspaceId &&
            document.stageId === "draft" &&
            document.expertSectionId === realSectionId &&
            document.draftFileKind === expectedDraftFileKind
        );
        if (!realTarget || realTarget.readOnly) {
          const message =
            "目标章节尚未创建或已失效，本次智能体变更未进入审阅。";
          sourceConversation.markToolConflict(
            event.payload.runId,
            event.payload.toolCallId,
            message
          );
          uiMessage.warning(message);
          return;
        }

        const laneId = agentEditProposalId(
          event.payload.runId,
          event.payload.workspaceId,
          event.payload.stageId,
          mutationTarget.documentId
        );
        const existing = latestProposalForLane(
          sourceConversation,
          event.payload.runId,
          laneId
        );
        if (existing?.toolCallIds.includes(event.payload.toolCallId)) {
          return;
        }
        const blockedMessage = blockedAgentEditLaneMessage(existing);
        if (blockedMessage) {
          sourceConversation.markToolConflict(
            event.payload.runId,
            event.payload.toolCallId,
            blockedMessage
          );
          return;
        }
        const currentRevision = createShortWorkspaceContentRevision(realTarget.content);
        const expectedBaseRevision = expectedMutationBaseRevision(
          existing,
          realTarget.content
        );
        if (
          event.payload.baseRevision !== expectedBaseRevision ||
          !laneDurableRevisionMatches(
            sourceConversation,
            event.payload.runId,
            existing,
            realTarget.content,
            currentRevision
          )
        ) {
          const message =
            "文稿版本已变化，本次智能体变更未进入审阅，也没有覆盖你的最新编辑。";
          if (
            existing &&
            (existing.status === "pending" || existing.status === "error")
          ) {
            sourceConversation.updateEditProposal(event.payload.runId, existing.id, {
              status: "conflict",
              statusMessage: message,
              updatedAt: event.timestamp
            });
          }
          sourceConversation.markToolConflict(
            event.payload.runId,
            event.payload.toolCallId,
            message
          );
          uiMessage.warning(message);
          return;
        }

        const resolvedMutation = resolveAgentEditorMutationText(
          existing?.proposedText !== undefined
            ? existing.proposedText
            : realTarget.content,
          event.payload
        );
        if ("error" in resolvedMutation) {
          if (existing) {
            sourceConversation.updateEditProposal(event.payload.runId, existing.id, {
              status: "conflict",
              statusMessage: resolvedMutation.error,
              updatedAt: event.timestamp
            });
          }
          sourceConversation.markToolConflict(
            event.payload.runId,
            event.payload.toolCallId,
            resolvedMutation.error
          );
          uiMessage.warning(resolvedMutation.error);
          return;
        }
        const proposedText = resolvedMutation.text;
        const proposedRevision = createShortWorkspaceContentRevision(proposedText);
        const diff = buildAgentTextDiff(realTarget.content, proposedText);
        const identity = resolveAgentEditProposalGeneration(laneId, existing);
        const applyBaseRevision = identity.coalescesExisting
          ? existing!.baseRevision
          : existing?.proposedRevision ?? event.payload.baseRevision;
        const noChanges =
          proposedRevision === currentRevision &&
          (!existing || existing.status === "accepted" || identity.coalescesExisting);
        const proposal: AgentEditProposal = {
          id: identity.id,
          laneId,
          generation: identity.generation,
          approvalMode: runApprovalMode,
          sourceBaseRevision: event.payload.baseRevision,
          ...(identity.predecessorProposalId
            ? { predecessorProposalId: identity.predecessorProposalId }
            : {}),
          runId: event.payload.runId,
          workspaceId: event.payload.workspaceId,
          stageId: event.payload.stageId,
          documentId: realTarget.id,
          title: realTarget.title,
          summary: event.payload.summary,
          status: noChanges ? "accepted" : "pending",
          baseRevision: applyBaseRevision,
          proposedRevision,
          ...(noChanges ? {} : { proposedText }),
          toolCallIds: [
            ...new Set([
              ...(identity.coalescesExisting ? existing?.toolCallIds ?? [] : []),
              event.payload.toolCallId
            ])
          ],
          additions: diff.additions,
          deletions: diff.deletions,
          hunks: diff.hunks,
          ...(diff.truncated ? { truncated: true } : {}),
          ...(noChanges
            ? { statusMessage: "文本没有实际变化，无需保存。" }
            : {}),
          createdAt:
            identity.coalescesExisting && existing
              ? existing.createdAt
              : event.timestamp,
          updatedAt: event.timestamp,
          provisionalExpertSection: false
        };
        sourceConversation.upsertEditProposal(event.payload.runId, proposal);
        if (!noChanges && runApprovalMode === "auto-approve") {
          queueAgentEdit(
            sourceConversation,
            event.payload.sessionId,
            event.payload.runId,
            proposal.id,
            true,
            true
          );
        }
        return;
      }

      if (stagingMode === "unavailable" || !creation) {
        const message =
          "目标章节尚未创建或已失效，本次智能体变更未进入审阅。";
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      const laneId = agentEditProposalId(
        event.payload.runId,
        event.payload.workspaceId,
        event.payload.stageId,
        mutationTarget.documentId
      );
      const existing = latestProposalForLane(
        sourceConversation,
        event.payload.runId,
        laneId
      );
      if (existing?.toolCallIds.includes(event.payload.toolCallId)) {
        return;
      }
      const blockedMessage = blockedAgentEditLaneMessage(existing);
      if (blockedMessage) {
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          blockedMessage
        );
        return;
      }
      const baseText = existing?.proposedText ?? "";
      const expectedBaseRevision = expectedMutationBaseRevision(existing, baseText);
      if (event.payload.baseRevision !== expectedBaseRevision) {
        const message =
          "待创建章节的文稿版本已变化，本次智能体变更未进入审阅。";
        if (
          existing &&
          (existing.status === "pending" || existing.status === "error")
        ) {
          sourceConversation.updateEditProposal(event.payload.runId, existing.id, {
            status: "conflict",
            statusMessage: message,
            updatedAt: event.timestamp
          });
        }
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      const resolvedMutation = resolveAgentEditorMutationText(baseText, event.payload);
      if ("error" in resolvedMutation) {
        if (existing) {
          sourceConversation.updateEditProposal(event.payload.runId, existing.id, {
            status: "conflict",
            statusMessage: resolvedMutation.error,
            updatedAt: event.timestamp
          });
        }
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          resolvedMutation.error
        );
        uiMessage.warning(resolvedMutation.error);
        return;
      }
      const proposedText = resolvedMutation.text;
      const proposedRevision = createShortWorkspaceContentRevision(proposedText);
      const diff = buildAgentTextDiff(baseText, proposedText);
      const identity = resolveAgentEditProposalGeneration(laneId, existing);
      const applyBaseRevision = identity.coalescesExisting
        ? existing!.baseRevision
        : existing?.proposedRevision ?? event.payload.baseRevision;
      const noChanges =
        proposedRevision === createShortWorkspaceContentRevision("") &&
        (!existing || existing.status === "accepted" || identity.coalescesExisting);
      const sectionTitle =
        creation.draftSectionCreationTarget?.sections.find(
          (section) => section.provisionalSectionId === mutationTarget.sectionId
        )?.title ?? "新章节";
      const title =
        mutationTarget.fileKind === "characterState"
          ? `${sectionTitle} · 人物状态`
          : sectionTitle;
      const proposal: AgentEditProposal = {
        id: identity.id,
        laneId,
        generation: identity.generation,
        approvalMode: runApprovalMode,
        sourceBaseRevision: event.payload.baseRevision,
        ...(identity.predecessorProposalId
          ? { predecessorProposalId: identity.predecessorProposalId }
          : {}),
        runId: event.payload.runId,
        workspaceId: event.payload.workspaceId,
        stageId: event.payload.stageId,
        documentId: mutationTarget.documentId,
        title,
        summary: event.payload.summary,
        status: noChanges ? "accepted" : "pending",
        baseRevision: applyBaseRevision,
        proposedRevision,
        ...(noChanges ? {} : { proposedText }),
        toolCallIds: [
          ...new Set([
            ...(identity.coalescesExisting ? existing?.toolCallIds ?? [] : []),
            event.payload.toolCallId
          ])
        ],
        additions: diff.additions,
        deletions: diff.deletions,
        hunks: diff.hunks,
        ...(diff.truncated ? { truncated: true } : {}),
        ...(noChanges ? { statusMessage: "文本没有实际变化，无需保存。" } : {}),
        createdAt:
          identity.coalescesExisting && existing
            ? existing.createdAt
            : event.timestamp,
        updatedAt: event.timestamp,
        provisionalExpertSection: true
      };
      sourceConversation.upsertEditProposal(event.payload.runId, proposal);
      if (!noChanges && runApprovalMode === "auto-approve") {
        queueAgentEdit(
          sourceConversation,
          event.payload.sessionId,
          event.payload.runId,
          proposal.id,
          true,
          true
        );
      }
      return;
    }

    if (
      (!target || target.readOnly) &&
      mutationTarget?.kind === "character-file" &&
      mutationTarget.itemId
    ) {
      const creation = findPendingCharacterCreationForProvisional(
        sourceConversation,
        event.payload.runId,
        mutationTarget.itemId
      );
      const creationMutation = creation?.characterStructureTarget?.mutation;
      if (!creation || creationMutation?.type !== "createItem") {
        const message = "目标人物条目尚未创建或已失效，本次智能体变更未进入审阅。";
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      const futureDocumentId = [
        "catalog",
        "book-document",
        encodeURIComponent(event.payload.workspaceId),
        encodeURIComponent(mutationTarget.itemId)
      ].join(":");
      const laneId = agentEditProposalId(
        event.payload.runId,
        event.payload.workspaceId,
        event.payload.stageId,
        futureDocumentId
      );
      const existing = latestProposalForLane(
        sourceConversation,
        event.payload.runId,
        laneId
      );
      if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;
      const blockedMessage = blockedAgentEditLaneMessage(existing);
      if (blockedMessage) {
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          blockedMessage
        );
        return;
      }
      const baseText = existing?.proposedText ?? "";
      if (
        event.payload.baseRevision !==
        expectedMutationBaseRevision(existing, baseText)
      ) {
        const message = "待创建人物条目的文稿版本已变化，本次智能体变更未进入审阅。";
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          message
        );
        uiMessage.warning(message);
        return;
      }
      const resolvedMutation = resolveAgentEditorMutationText(
        baseText,
        event.payload
      );
      if ("error" in resolvedMutation) {
        sourceConversation.markToolConflict(
          event.payload.runId,
          event.payload.toolCallId,
          resolvedMutation.error
        );
        uiMessage.warning(resolvedMutation.error);
        return;
      }
      const proposedText = resolvedMutation.text;
      const proposedRevision = createShortWorkspaceContentRevision(proposedText);
      const diff = buildAgentTextDiff(baseText, proposedText);
      const identity = resolveAgentEditProposalGeneration(laneId, existing);
      const proposal: AgentEditProposal = {
        id: identity.id,
        laneId,
        generation: identity.generation,
        approvalMode: runApprovalMode,
        sourceBaseRevision: event.payload.baseRevision,
        ...(identity.predecessorProposalId
          ? { predecessorProposalId: identity.predecessorProposalId }
          : {}),
        runId: event.payload.runId,
        workspaceId: event.payload.workspaceId,
        stageId: event.payload.stageId,
        documentId: futureDocumentId,
        title: creationMutation.title,
        summary: event.payload.summary,
        status: "pending",
        baseRevision: identity.coalescesExisting
          ? existing!.baseRevision
          : existing?.proposedRevision ?? event.payload.baseRevision,
        proposedRevision,
        proposedText,
        toolCallIds: [
          ...new Set([
            ...(identity.coalescesExisting ? existing?.toolCallIds ?? [] : []),
            event.payload.toolCallId
          ])
        ],
        additions: diff.additions,
        deletions: diff.deletions,
        hunks: diff.hunks,
        ...(diff.truncated ? { truncated: true } : {}),
        createdAt:
          identity.coalescesExisting && existing
            ? existing.createdAt
            : event.timestamp,
        updatedAt: event.timestamp,
        provisionalCharacterItemId: mutationTarget.itemId
      };
      sourceConversation.upsertEditProposal(event.payload.runId, proposal);
      if (runApprovalMode === "auto-approve") {
        queueAgentEdit(
          sourceConversation,
          event.payload.sessionId,
          event.payload.runId,
          proposal.id,
          true,
          true
        );
      }
      return;
    }

    if (!target || target.readOnly) {
      const message = "目标文稿不可写，本次智能体变更未进入审阅。";
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }

    const laneId = agentEditProposalId(
      event.payload.runId,
      event.payload.workspaceId,
      event.payload.stageId,
      target.id
    );
    const existing = latestProposalForLane(
      sourceConversation,
      event.payload.runId,
      laneId
    );
    if (existing?.toolCallIds.includes(event.payload.toolCallId)) {
      return;
    }
    const blockedMessage = blockedAgentEditLaneMessage(existing);
    if (blockedMessage) {
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        blockedMessage
      );
      return;
    }
    const currentRevision = createShortWorkspaceContentRevision(target.content);
    const expectedBaseRevision = expectedMutationBaseRevision(
      existing,
      target.content
    );
    if (
      event.payload.baseRevision !== expectedBaseRevision ||
      !laneDurableRevisionMatches(
        sourceConversation,
        event.payload.runId,
        existing,
        target.content,
        currentRevision
      )
    ) {
      const message =
        "文稿版本已变化，本次智能体变更未进入审阅，也没有覆盖你的最新编辑。";
      if (
        existing &&
        (existing.status === "pending" || existing.status === "error")
      ) {
        sourceConversation.updateEditProposal(event.payload.runId, existing.id, {
          status: "conflict",
          statusMessage: message,
          updatedAt: event.timestamp
        });
      }
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }

    const resolvedMutation = resolveAgentEditorMutationText(
      event.payload.mutationTarget && existing?.proposedText !== undefined
        ? existing.proposedText
        : target.content,
      event.payload
    );
    if ("error" in resolvedMutation) {
      if (
        existing &&
        (existing.status === "pending" || existing.status === "error")
      ) {
        sourceConversation.updateEditProposal(event.payload.runId, existing.id, {
          status: "conflict",
          statusMessage: resolvedMutation.error,
          updatedAt: event.timestamp
        });
      }
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        resolvedMutation.error
      );
      uiMessage.warning(resolvedMutation.error);
      return;
    }
    const proposedText = resolvedMutation.text;
    const proposedRevision = createShortWorkspaceContentRevision(proposedText);

    const diff = buildAgentTextDiff(target.content, proposedText);
    const identity = resolveAgentEditProposalGeneration(laneId, existing);
    const applyBaseRevision = identity.coalescesExisting
      ? existing!.baseRevision
      : existing?.proposedRevision ?? event.payload.baseRevision;
    const noChanges =
      proposedRevision === currentRevision &&
      (!existing || existing.status === "accepted" || identity.coalescesExisting);
    const proposal: AgentEditProposal = {
      id: identity.id,
      laneId,
      generation: identity.generation,
      approvalMode: runApprovalMode,
      sourceBaseRevision: event.payload.baseRevision,
      ...(identity.predecessorProposalId
        ? { predecessorProposalId: identity.predecessorProposalId }
        : {}),
      runId: event.payload.runId,
      workspaceId: event.payload.workspaceId,
      stageId: event.payload.stageId,
      documentId: target.id,
      title: target.title,
      summary: event.payload.summary,
      status: noChanges ? "accepted" : "pending",
      baseRevision: applyBaseRevision,
      proposedRevision,
      ...(noChanges ? {} : { proposedText }),
      toolCallIds: [
        ...new Set([
          ...(identity.coalescesExisting ? existing?.toolCallIds ?? [] : []),
          event.payload.toolCallId
        ])
      ],
      additions: diff.additions,
      deletions: diff.deletions,
      hunks: diff.hunks,
      ...(diff.truncated ? { truncated: true } : {}),
      ...(noChanges ? { statusMessage: "文本没有实际变化，无需保存。" } : {}),
      createdAt:
        identity.coalescesExisting && existing
          ? existing.createdAt
          : event.timestamp,
      updatedAt: event.timestamp
    };
    sourceConversation.upsertEditProposal(event.payload.runId, proposal);
    if (!noChanges && runApprovalMode === "auto-approve") {
      queueAgentEdit(
        sourceConversation,
        event.payload.sessionId,
        event.payload.runId,
        proposal.id,
        true,
        true
      );
    }
  }

  function longWorldbuildingBatchForFile(
    event: LongWorldbuildingFileMutationEvent
  ): LongWorkspaceOperationBatch | undefined {
    const file = event.payload.files[0];
    if (!file || event.payload.files.length !== 1) return undefined;
    const operations = event.payload.batch.operations.filter(
      (operation) =>
        file.operation === "create" &&
        operation.type === "worldbuildingItem.create" &&
        operation.categoryId === file.categoryId &&
        operation.item.id === file.itemId &&
        operation.item.file.id === file.fileId
    );
    const documentWrites = event.payload.batch.documentWrites.filter(
      (write) =>
        file.operation !== "create" && write.fileId === file.fileId
    );
    if (
      (file.operation === "create" &&
        (operations.length !== 1 || documentWrites.length !== 0)) ||
      (file.operation !== "create" &&
        (operations.length !== 0 || documentWrites.length !== 1))
    ) {
      return undefined;
    }
    return LongWorkspaceOperationBatchSchema.parse({
      ...event.payload.batch,
      operations,
      documentWrites
    });
  }

  function longPlotDesignProposalText(
    batch: LongWorkspaceOperationBatch
  ): string {
    return JSON.stringify(
      {
        structureOperations: batch.operations,
        documentWrites: batch.documentWrites
      },
      null,
      2
    );
  }

  function stageLongPlotDesignEditProposal(
    event: LongPlotDesignMutationEvent
  ): void {
    if (!rememberWorkspaceMutationEvent(event.id)) return;
    const sourceConversation = longConversationForProposalEvent(event);
    if (!sourceConversation) return;
    const runApprovalMode =
      sourceConversation.approvalModeForRun(
        event.payload.sessionId,
        event.payload.runId
      ) ?? "request-approval";
    const workspaceId = `long:${event.payload.bookId}`;
    const laneId = agentEditProposalId(
      event.payload.runId,
      workspaceId,
      "long-plot-design",
      "plot-design"
    );
    const existing = latestProposalForLane(
      sourceConversation,
      event.payload.runId,
      laneId
    );
    if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;
    const blockedMessage = blockedAgentEditLaneMessage(existing);
    if (blockedMessage) {
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        blockedMessage
      );
      return;
    }
    const generation = existing ? (existing.generation ?? 1) + 1 : 1;
    const proposalId = agentEditProposalGenerationId(laneId, generation);
    const sourceRevision = `long-plot:${event.payload.baseProjectRevision}:${event.payload.batch.baseRevision}`;
    const proposedRevision = `${sourceRevision}:${event.payload.toolCallId}`;
    const proposalText = longPlotDesignProposalText(event.payload.batch);
    const diff = buildAgentTextDiff("", proposalText);
    const proposal: AgentEditProposal = {
      id: proposalId,
      laneId,
      generation,
      approvalMode: runApprovalMode,
      sourceBaseRevision: sourceRevision,
      ...(existing ? { predecessorProposalId: existing.id } : {}),
      runId: event.payload.runId,
      workspaceId,
      stageId: "long-plot-design",
      documentId: "plot-design",
      title: "剧情设计变更",
      summary: event.payload.summary,
      status: "pending",
      baseRevision: sourceRevision,
      proposedRevision,
      proposedText: proposalText,
      toolCallIds: [event.payload.toolCallId],
      additions: diff.additions,
      deletions: diff.deletions,
      hunks: diff.hunks,
      ...(diff.truncated ? { truncated: true } : {}),
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      longPlotDesignTarget: {
        bookId: event.payload.bookId,
        batch: LongWorkspaceOperationBatchSchema.parse(event.payload.batch),
        baseProjectRevision: event.payload.baseProjectRevision
      }
    };
    sourceConversation.upsertEditProposal(event.payload.runId, proposal);
    if (runApprovalMode === "auto-approve") {
      queueAgentEdit(
        sourceConversation,
        event.payload.sessionId,
        event.payload.runId,
        proposal.id,
        true,
        true
      );
    }
  }

  function stageLongWorldbuildingEditProposal(
    event: LongWorldbuildingFileMutationEvent
  ): void {
    if (!rememberWorkspaceMutationEvent(event.id)) return;
    const sourceConversation = longConversationForProposalEvent(event);
    if (!sourceConversation) return;
    const file = event.payload.files[0];
    const batch = longWorldbuildingBatchForFile(event);
    if (!file || !batch) {
      const message =
        "世界观文件工具必须一次只形成一个独立文件变更，本次结果未进入审批。";
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }
    const runApprovalMode =
      sourceConversation.approvalModeForRun(
        event.payload.sessionId,
        event.payload.runId
      ) ?? "request-approval";
    const workspaceId = `long:${event.payload.bookId}`;
    const laneDocumentId =
      file.operation === "create"
        ? `create:${file.fileId}`
        : file.fileId;
    const laneId = agentEditProposalId(
      event.payload.runId,
      workspaceId,
      "long-worldbuilding",
      laneDocumentId
    );
    const existing = latestProposalForLane(
      sourceConversation,
      event.payload.runId,
      laneId
    );
    if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;
    const blockedMessage = blockedAgentEditLaneMessage(existing);
    if (blockedMessage) {
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        blockedMessage
      );
      return;
    }
    if (
      existing &&
      file.beforeRevision !== existing.proposedRevision
    ) {
      const message =
        "世界观文件的待审批版本链已经变化，本次变更未进入审批。";
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }
    const creationPredecessor =
      file.operation === "create"
        ? undefined
        : sourceConversation
            .listEditProposals(event.payload.runId)
            .find(
              (proposal) =>
                proposal.longWorldbuildingTarget?.file.fileId ===
                  file.fileId &&
                proposal.longWorldbuildingTarget.file.operation ===
                  "create" &&
                proposal.longWorldbuildingTarget.file.nextRevision ===
                  file.beforeRevision &&
                proposal.status !== "rejected" &&
                proposal.status !== "conflict"
            );
    const generation = existing
      ? (existing.generation ?? 1) + 1
      : 1;
    const proposalId = agentEditProposalGenerationId(laneId, generation);
    const predecessorProposalId =
      existing?.id ?? creationPredecessor?.id;
    const beforeRevision =
      file.beforeRevision ?? `long-missing:${file.fileId}`;
    const diff = buildAgentTextDiff(file.beforeText, file.afterText);
    const noChanges =
      file.operation !== "create" &&
      file.beforeText === file.afterText;
    const proposal: AgentEditProposal = {
      id: proposalId,
      laneId,
      generation,
      approvalMode: runApprovalMode,
      sourceBaseRevision: beforeRevision,
      ...(predecessorProposalId ? { predecessorProposalId } : {}),
      runId: event.payload.runId,
      workspaceId,
      stageId: "long-worldbuilding",
      documentId: file.fileId,
      title: file.title,
      summary: event.payload.summary,
      status: noChanges ? "accepted" : "pending",
      baseRevision: beforeRevision,
      proposedRevision: file.nextRevision,
      ...(noChanges ? {} : { proposedText: file.afterText }),
      toolCallIds: [event.payload.toolCallId],
      additions: diff.additions,
      deletions: diff.deletions,
      hunks: diff.hunks,
      ...(diff.truncated ? { truncated: true } : {}),
      ...(noChanges
        ? { statusMessage: "文本没有实际变化，无需保存。" }
        : {}),
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      longWorldbuildingTarget: {
        bookId: event.payload.bookId,
        batch,
        baseProjectRevision: event.payload.baseProjectRevision,
        file
      }
    };
    sourceConversation.upsertEditProposal(event.payload.runId, proposal);
    if (!noChanges && runApprovalMode === "auto-approve") {
      queueAgentEdit(
        sourceConversation,
        event.payload.sessionId,
        event.payload.runId,
        proposal.id,
        true,
        true
      );
    }
  }

  function longCharacterBatchForFiles(
    event: LongCharacterFileMutationEvent
  ): LongWorkspaceOperationBatch | undefined {
    const files = event.payload.files;
    if (!files.length) return undefined;
    const isCreation = files.every(({ operation }) => operation === "create");
    if (isCreation) {
      const characterIds = new Set(files.map(({ characterId }) => characterId));
      const documents = new Set(files.map(({ document }) => document));
      const operation = event.payload.batch.operations.find(
        (candidate) => candidate.type === "character.create"
      );
      if (
        characterIds.size !== 1 ||
        documents.size !== 4 ||
        files.length !== 4 ||
        event.payload.batch.operations.length !== 1 ||
        event.payload.batch.documentWrites.length !== 0 ||
        !operation ||
        operation.character.id !== files[0]?.characterId ||
        !files.every((file) => {
          const operationFiles = operation.files;
          switch (file.document) {
            case "core_profile":
              return operationFiles.coreProfile.id === file.fileId;
            case "relationships":
              return operationFiles.relationships.id === file.fileId;
            case "current_state":
              return operationFiles.currentState.id === file.fileId;
            case "history":
              return operationFiles.history.id === file.fileId;
            case "overview":
              return false;
          }
        })
      ) {
        return undefined;
      }
      return LongWorkspaceOperationBatchSchema.parse(event.payload.batch);
    }
    const file = files[0];
    if (
      files.length !== 1 ||
      !file ||
      file.operation === "create" ||
      event.payload.batch.operations.length !== 0
    ) {
      return undefined;
    }
    const documentWrites = event.payload.batch.documentWrites.filter(
      (write) => write.fileId === file.fileId
    );
    if (
      documentWrites.length !== 1 ||
      event.payload.batch.documentWrites.length !== 1
    ) {
      return undefined;
    }
    return LongWorkspaceOperationBatchSchema.parse({
      ...event.payload.batch,
      operations: [],
      documentWrites
    });
  }

  function stageLongCharacterEditProposal(
    event: LongCharacterFileMutationEvent
  ): void {
    if (!rememberWorkspaceMutationEvent(event.id)) return;
    const sourceConversation = longConversationForProposalEvent(event);
    if (!sourceConversation) return;
    const files = event.payload.files;
    const batch = longCharacterBatchForFiles(event);
    if (!files.length || !batch) {
      const message =
        "人物文件工具必须形成一名人物的完整创建变更，或一次只修改一份人物档案；本次结果未进入审批。";
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }
    const isCreation = files.every(({ operation }) => operation === "create");
    const primaryFile = files[0]!;
    const runApprovalMode =
      sourceConversation.approvalModeForRun(
        event.payload.sessionId,
        event.payload.runId
      ) ?? "request-approval";
    const workspaceId = `long:${event.payload.bookId}`;
    const laneDocumentId = isCreation
      ? `create:${primaryFile.characterId}`
      : primaryFile.fileId;
    const laneId = agentEditProposalId(
      event.payload.runId,
      workspaceId,
      "long-character",
      laneDocumentId
    );
    const existing = latestProposalForLane(
      sourceConversation,
      event.payload.runId,
      laneId
    );
    if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;
    const blockedMessage = blockedAgentEditLaneMessage(existing);
    if (blockedMessage) {
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        blockedMessage
      );
      return;
    }
    if (
      !isCreation &&
      existing &&
      primaryFile.beforeRevision !== existing.proposedRevision
    ) {
      const message =
        "人物档案的待审批版本链已经变化，本次变更未进入审批。";
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }
    const creationPredecessor = isCreation
      ? undefined
      : sourceConversation
          .listEditProposals(event.payload.runId)
          .find(
            (proposal) =>
              proposal.longCharacterTarget?.files.some(
                (file) =>
                  file.fileId === primaryFile.fileId &&
                  file.operation === "create" &&
                  file.nextRevision === primaryFile.beforeRevision
              ) &&
              proposal.status !== "rejected" &&
              proposal.status !== "conflict"
          );
    const generation = existing
      ? (existing.generation ?? 1) + 1
      : 1;
    const proposalId = agentEditProposalGenerationId(laneId, generation);
    const predecessorProposalId = existing?.id ?? creationPredecessor?.id;
    const beforeRevision = isCreation
      ? `long-missing:${primaryFile.characterId}`
      : primaryFile.beforeRevision ?? `long-missing:${primaryFile.fileId}`;
    const proposedRevision = isCreation
      ? `long-character-create:${files.map(({ nextRevision }) => nextRevision).join(":")}`
      : primaryFile.nextRevision;
    const diff = buildAgentTextDiff(
      isCreation ? "" : primaryFile.beforeText,
      isCreation ? "" : primaryFile.afterText
    );
    const noChanges =
      !isCreation && primaryFile.beforeText === primaryFile.afterText;
    const proposal: AgentEditProposal = {
      id: proposalId,
      laneId,
      generation,
      approvalMode: runApprovalMode,
      sourceBaseRevision: beforeRevision,
      ...(predecessorProposalId ? { predecessorProposalId } : {}),
      runId: event.payload.runId,
      workspaceId,
      stageId: "long-character",
      documentId: laneDocumentId,
      title: isCreation
        ? `${primaryFile.characterName} / 新建人物`
        : primaryFile.title,
      summary: event.payload.summary,
      status: noChanges ? "accepted" : "pending",
      baseRevision: beforeRevision,
      proposedRevision,
      ...(!noChanges && !isCreation
        ? { proposedText: primaryFile.afterText }
        : {}),
      toolCallIds: [event.payload.toolCallId],
      additions: diff.additions,
      deletions: diff.deletions,
      hunks: diff.hunks,
      ...(diff.truncated ? { truncated: true } : {}),
      ...(noChanges
        ? { statusMessage: "文本没有实际变化，无需保存。" }
        : {}),
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      longCharacterTarget: {
        bookId: event.payload.bookId,
        batch,
        baseProjectRevision: event.payload.baseProjectRevision,
        files
      }
    };
    sourceConversation.upsertEditProposal(event.payload.runId, proposal);
    if (!noChanges && runApprovalMode === "auto-approve") {
      queueAgentEdit(
        sourceConversation,
        event.payload.sessionId,
        event.payload.runId,
        proposal.id,
        true,
        true
      );
    }
  }

  function stageLongDraftEditProposal(event: LongDraftMutationEvent): void {
    if (!rememberWorkspaceMutationEvent(event.id)) return;
    const sourceConversation = longConversationForProposalEvent(event);
    if (!sourceConversation) return;
    const file = event.payload.file;
    const runApprovalMode =
      sourceConversation.approvalModeForRun(
        event.payload.sessionId,
        event.payload.runId
      ) ?? "request-approval";
    const workspaceId = `long:${event.payload.bookId}`;
    const laneId = agentEditProposalId(
      event.payload.runId,
      workspaceId,
      "long-draft",
      file.fileId
    );
    const existing = latestProposalForLane(
      sourceConversation,
      event.payload.runId,
      laneId
    );
    if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;
    const blockedMessage = blockedAgentEditLaneMessage(existing);
    if (blockedMessage) {
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        blockedMessage
      );
      return;
    }
    if (existing && file.beforeRevision !== existing.proposedRevision) {
      const message = "章节正文的待审批版本链已经变化，本次变更未进入审批。";
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }
    const generation = existing ? (existing.generation ?? 1) + 1 : 1;
    const proposalId = agentEditProposalGenerationId(laneId, generation);
    const diff = buildAgentTextDiff(file.beforeText, file.afterText);
    const noChanges = file.beforeText === file.afterText;
    const proposal: AgentEditProposal = {
      id: proposalId,
      laneId,
      generation,
      approvalMode: runApprovalMode,
      sourceBaseRevision: file.beforeRevision,
      ...(existing ? { predecessorProposalId: existing.id } : {}),
      runId: event.payload.runId,
      workspaceId,
      stageId: "long-draft",
      documentId: file.fileId,
      title: `${file.chapterTitle} / 正文`,
      summary: event.payload.summary,
      status: noChanges ? "accepted" : "pending",
      baseRevision: file.beforeRevision,
      proposedRevision: file.nextRevision,
      ...(noChanges ? {} : { proposedText: file.afterText }),
      toolCallIds: [event.payload.toolCallId],
      additions: diff.additions,
      deletions: diff.deletions,
      hunks: diff.hunks,
      ...(diff.truncated ? { truncated: true } : {}),
      ...(noChanges ? { statusMessage: "正文没有实际变化，无需保存。" } : {}),
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      longDraftTarget: {
        bookId: event.payload.bookId,
        batch: event.payload.batch,
        baseProjectRevision: event.payload.baseProjectRevision,
        file
      }
    };
    sourceConversation.upsertEditProposal(event.payload.runId, proposal);
    if (!noChanges && runApprovalMode === "auto-approve") {
      queueAgentEdit(
        sourceConversation,
        event.payload.sessionId,
        event.payload.runId,
        proposal.id,
        true,
        true
      );
    }
  }

  function stageLibraryEditProposal(event: LibraryEditorMutationEvent): void {
    if (!rememberWorkspaceMutationEvent(event.id)) return;
    const sourceConversation = allConversations().find((conversation) =>
      conversation.acceptsRunEvent(event.payload.sessionId, event.payload.runId)
    );
    if (!sourceConversation) return;
    const runApprovalMode =
      sourceConversation.approvalModeForRun(
        event.payload.sessionId,
        event.payload.runId
      ) ?? "request-approval";

    const library = findCatalogLibrary(
      event.payload.domain,
      event.payload.libraryId
    );
    const libraryReadOnly =
      !library ||
      (event.payload.domain === "skill" &&
        "isBuiltin" in library &&
        library.isBuiltin);
    let target: WorkspaceDocument | undefined;
    if (event.payload.operation === "edit") {
      const editPayload = event.payload;
      target = liveWorkspaceDocuments.value.find(
        (document) =>
          document.id === editPayload.documentId &&
          document.domain === editPayload.domain &&
          document.libraryId === editPayload.libraryId &&
          document.catalogEntryId === editPayload.entryId
      );
    } else if (event.payload.operation === "edit-overview") {
      const overviewPayload = event.payload;
      target = liveWorkspaceDocuments.value.find(
        (document) =>
          document.id === overviewPayload.documentId &&
          document.domain === overviewPayload.domain &&
          document.libraryId === overviewPayload.libraryId &&
          document.catalogLibraryField === "overview"
      );
    }
    if (
      libraryReadOnly ||
      (event.payload.operation !== "create" && (!target || target.readOnly))
    ) {
      const message = "目标资料库或条目不可写，本次智能体变更未进入审阅。";
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }

    const scopeId = `library:${event.payload.domain}:${event.payload.libraryId}`;
    const documentId =
      event.payload.operation !== "create"
        ? event.payload.documentId
        : `library-create:${event.payload.toolCallId}`;
    const proposalId = agentEditProposalId(
      event.payload.runId,
      scopeId,
      "library",
      documentId
    );
    const existing = sourceConversation.getEditProposal(
      event.payload.runId,
      proposalId
    );
    if (existing?.toolCallIds.includes(event.payload.toolCallId)) return;

    const currentText = target?.content ?? "";
    const currentRevision = createShortWorkspaceContentRevision(currentText);
    const expectedBaseRevision = expectedMutationBaseRevision(
      existing,
      currentText
    );
    if (
      event.payload.baseRevision !== expectedBaseRevision ||
      (existing !== undefined && currentRevision !== existing.baseRevision)
    ) {
      const message =
        "资料库内容版本已变化，本次智能体变更未进入审阅，也没有覆盖你的最新编辑。";
      if (existing) {
        sourceConversation.updateEditProposal(event.payload.runId, proposalId, {
          status: "conflict",
          statusMessage: message,
          updatedAt: event.timestamp
        });
      }
      sourceConversation.markToolConflict(
        event.payload.runId,
        event.payload.toolCallId,
        message
      );
      uiMessage.warning(message);
      return;
    }

    const proposedText = event.payload.text;
    const proposedRevision = createShortWorkspaceContentRevision(proposedText);
    const diff = buildAgentTextDiff(currentText, proposedText);
    const noChanges =
      event.payload.operation !== "create" &&
      proposedRevision === (existing?.baseRevision ?? currentRevision) &&
      event.payload.title === target?.title;
    const proposal: AgentEditProposal = {
      id: proposalId,
      approvalMode: runApprovalMode,
      runId: event.payload.runId,
      workspaceId: scopeId,
      stageId: "library",
      documentId,
      title: event.payload.title,
      summary: event.payload.summary,
      status: noChanges ? "accepted" : "pending",
      baseRevision: existing?.baseRevision ?? event.payload.baseRevision,
      proposedRevision,
      ...(noChanges ? {} : { proposedText }),
      toolCallIds: [
        ...new Set([...(existing?.toolCallIds ?? []), event.payload.toolCallId])
      ],
      additions: diff.additions,
      deletions: diff.deletions,
      hunks: diff.hunks,
      ...(diff.truncated ? { truncated: true } : {}),
      ...(noChanges ? { statusMessage: "资料库内容没有实际变化，无需保存。" } : {}),
      createdAt: existing?.createdAt ?? event.timestamp,
      updatedAt: event.timestamp,
      libraryTarget: {
        operation: event.payload.operation,
        domain: event.payload.domain,
        libraryId: event.payload.libraryId,
        ...(event.payload.operation === "edit-overview"
          ? {}
          : { stageId: event.payload.stageId }),
        ...(event.payload.baseProjectRevision === undefined
          ? {}
          : { baseProjectRevision: event.payload.baseProjectRevision }),
        ...(event.payload.operation === "edit"
          ? { entryId: event.payload.entryId }
          : {})
      }
    };
    sourceConversation.upsertEditProposal(event.payload.runId, proposal);
    if (!noChanges && runApprovalMode === "auto-approve") {
      queueAgentEdit(
        sourceConversation,
        event.payload.sessionId,
        event.payload.runId,
        proposalId,
        true,
        true
      );
    }
  }

  async function acceptDraftSectionCreationProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean,
    reserved = false
  ): Promise<void> {
    if (
      (proposal.status === "accepting" && !reserved) ||
      proposal.status === "accepted" ||
      proposal.status === "rejected" ||
      proposal.status === "conflict"
    ) {
      return;
    }
    const target = proposal.draftSectionCreationTarget;
    if (!target || target.sections.length === 0) {
      const message = "待审阅的章节创建缺少完整参数，请重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const currentApi = api();
    if (!currentApi) {
      const message = "桌面文件服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const directory = catalogProjection.value?.draftDirectories.find(
      (candidate) => candidate.workspaceId === proposal.workspaceId
    );
    const book = catalogBook(proposal.workspaceId);
    if (!directory || !book) {
      const message = "目标正文目录已不可用，无法创建章节。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const currentDirectoryRevision = currentExpertDraftDirectoryRevision(
      proposal.workspaceId
    );
    const expectedDirectoryRevision =
      expectedDraftSectionCreationBaseRevision(proposal);
    const commitPlan = resolveDraftSectionCreationCommitPlan({
      currentDirectoryRevision,
      expectedDirectoryRevision,
      capturedBaseProjectRevision: target.baseProjectRevision,
      currentProjectRevision: book.projectRevision
    });
    if (commitPlan.mode === "conflict") {
      const message = "正文目录已发生变化，未创建章节，请基于最新目录重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const requiresIdempotentRecoveryProbe =
      commitPlan.mode === "idempotent-recovery";
    if (
      !requiresIdempotentRecoveryProbe &&
      directory.sections.length + target.sections.length > 100
    ) {
      const message = "创建后将超过正文最多 100 个章节的限制。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const existingTitles = new Set(directory.sections.map((section) => section.title));
    const duplicateTitle = requiresIdempotentRecoveryProbe
      ? undefined
      : target.sections.find((section) =>
          existingTitles.has(section.title)
        )?.title;
    if (duplicateTitle) {
      const message = `正文目录已存在同名章节“${duplicateTitle}”，未重复创建。`;
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const resolvedAfterSectionId = target.afterSectionId
      ? resolveProvisionalExpertSectionId(
          request.runId,
          proposal.workspaceId,
          target.afterSectionId
        )
      : undefined;
    if (
      !requiresIdempotentRecoveryProbe &&
      resolvedAfterSectionId &&
      !directory.sections.some((section) => section.id === resolvedAfterSectionId)
    ) {
      const message = "指定的章节插入位置已不存在，未创建章节。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      const message = automatic
        ? "检测到作品正在保存其他内容，实时自动建章已暂停，请稍后人工重试。"
        : "同一作品正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? "正在自动批准并创建空白章节文件…"
        : "正在校验目录版本并创建空白章节文件…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    let createdCount = 0;
    let lastCreatedSectionId: string | undefined;
    const createdMapping = new Map<string, string>();
    try {
      const created = await currentApi.catalog.createDraftSections({
        operationId: draftSectionCreationOperationId(proposal),
        bookId: proposal.workspaceId,
        ...(resolvedAfterSectionId
          ? { afterSectionId: resolvedAfterSectionId }
          : {}),
        ...(commitPlan.baseProjectRevision === undefined
          ? {}
          : { baseProjectRevision: commitPlan.baseProjectRevision }),
        sections: target.sections.map((section) => ({
          clientSectionId: section.provisionalSectionId,
          title: section.title,
          ...(section.wordCountRequirement
            ? { wordCountRequirement: section.wordCountRequirement }
            : {})
        }))
      });
      createdCount = created.sections.length;
      for (const result of created.sections) {
        lastCreatedSectionId = result.section.id;
        createdMapping.set(result.clientSectionId, result.section.id);
        rememberProvisionalExpertSectionMapping(
          request.runId,
          proposal.workspaceId,
          result.clientSectionId,
          result.section.id
        );
      }
      await loadCatalogSnapshot();
      const savedDirectoryRevision = currentExpertDraftDirectoryRevision(
        proposal.workspaceId
      );
      if (!savedDirectoryRevision) {
        throw new Error("创建完成后无法读取最新正文目录版本。");
      }
      rememberAcceptedDraftSectionCreation(proposal, savedDirectoryRevision);
      remapProvisionalExpertSectionFileProposals(
        conversation,
        request.runId,
        proposal.workspaceId,
        createdMapping
      );
      const refreshedDirectory = catalogProjection.value?.draftDirectories.find(
        (candidate) => candidate.workspaceId === proposal.workspaceId
      );
      if (refreshedDirectory && !automatic) {
        selectedResourceId.value = refreshedDirectory.id;
        activeCreationResourceId.value = refreshedDirectory.id;
        if (lastCreatedSectionId) {
          selectedExpertSectionIds.value = {
            ...selectedExpertSectionIds.value,
            [refreshedDirectory.id]: lastCreatedSectionId
          };
          selectedDraftFileKinds.value = {
            ...selectedDraftFileKinds.value,
            [refreshedDirectory.id]: "body"
          };
        }
      }
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        draftSectionCreationTarget: {
          ...target,
          acceptedDirectoryRevision: savedDirectoryRevision,
          sections: target.sections.map((section) => ({
            ...section,
            ...(createdMapping.get(section.provisionalSectionId)
              ? {
                  realSectionId: createdMapping.get(
                    section.provisionalSectionId
                  )!
                }
              : {})
          }))
        },
        statusMessage: automatic
          ? `已自动批准并创建 ${createdCount} 个空白章节；每章均包含正文和人物状态文件。`
          : `已创建 ${createdCount} 个空白章节并保存到本地 Markdown。`
      });
      if (!automatic) {
        uiMessage.success(`已创建 ${createdCount} 个空白章节文件`);
      }
    } catch (error: unknown) {
      await loadCatalogSnapshot();
      const conflict = isCatalogConflict(error);
      const message =
        error instanceof Error ? error.message : "创建空白章节失败。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: conflict ? "conflict" : "error",
        statusMessage: message
      });
      if (conflict) {
        conflictDependentProvisionalFileProposals(
          conversation,
          request.runId,
          target.sections.map((section) => section.provisionalSectionId),
          "关联的空白章节确认未能创建，相关正文写入已取消。"
        );
      } else {
        pauseDependentProvisionalFileProposals(
          conversation,
          request.runId,
          target.sections.map((section) => section.provisionalSectionId),
          "章节创建结果尚未确认，正文内容已保留；请先重试章节创建。"
        );
      }
      uiMessage.error(message);
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  async function acceptDraftSectionRenameProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean,
    reserved = false
  ): Promise<void> {
    if (
      (proposal.status === "accepting" && !reserved) ||
      proposal.status === "accepted" ||
      proposal.status === "rejected" ||
      proposal.status === "conflict"
    ) {
      return;
    }
    const target = proposal.draftSectionRenameTarget;
    if (!target) {
      const message = "待审阅的章节改名缺少完整参数，请重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const currentApi = api();
    if (!currentApi) {
      const message = "桌面文件服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const directory = catalogProjection.value?.draftDirectories.find(
      (candidate) => candidate.workspaceId === proposal.workspaceId
    );
    const book = catalogBook(proposal.workspaceId);
    const bodyDocument = liveWorkspaceDocuments.value.find(
      (document) =>
        document.workspaceId === proposal.workspaceId &&
        document.stageId === "draft" &&
        document.expertSectionId === target.sectionId &&
        document.draftFileKind === "body" &&
        document.catalogDocumentId
    );
    if (!directory || !book || !bodyDocument?.catalogDocumentId) {
      const message = "目标章节已不可用，无法修改名称。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const section = directory.sections.find(
      (candidate) => candidate.id === target.sectionId
    );
    if (!section) {
      const message = "目标章节已不存在，无法修改名称。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const currentDirectoryRevision = currentExpertDraftDirectoryRevision(
      proposal.workspaceId
    );
    const expectedDirectoryRevision =
      expectedDraftSectionCreationBaseRevision(proposal);
    if (currentDirectoryRevision !== expectedDirectoryRevision) {
      const message = "正文目录已发生变化，未修改章节名称，请基于最新目录重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (section.title !== target.previousTitle) {
      if (section.title === target.title) {
        rememberAcceptedDraftSectionCreation(
          proposal,
          currentDirectoryRevision ?? proposal.baseRevision
        );
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "accepted",
          proposedText: undefined,
          statusMessage: automatic
            ? `章节名称已是「${target.title}」，无需重复保存。`
            : `章节名称已是「${target.title}」，无需重复保存。`
        });
        return;
      }
      const message = `章节「${target.previousTitle}」的当前标题已变化，未应用本次改名。`;
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (
      directory.sections.some(
        (candidate) =>
          candidate.id !== target.sectionId && candidate.title === target.title
      )
    ) {
      const message = `正文目录已存在同名章节「${target.title}」，未修改名称。`;
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      const message = automatic
        ? "检测到作品正在保存其他内容，实时自动改名已暂停，请稍后人工重试。"
        : "同一作品正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? "正在自动批准并修改章节名称…"
        : "正在校验目录版本并修改章节名称…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    try {
      // Rename must preserve on-disk body bytes; dirty editor drafts stay local.
      const diskContent = bodyDocument.content;
      const saved = await currentApi.catalog.saveDocument({
        bookId: proposal.workspaceId,
        documentId: bodyDocument.catalogDocumentId,
        title: target.title,
        content: diskContent,
        baseRevision: createShortWorkspaceContentRevision(diskContent),
        ...(book.projectRevision === undefined
          ? {}
          : { baseProjectRevision: book.projectRevision })
      });
      applyAcceptedAgentDocumentLocally(
        {
          id: bodyDocument.id,
          title: saved.title,
          content: saved.content
        },
        saved.projectRevision,
        undefined
      );
      const expectedDocuments = captureWorkspaceDocumentBaselines(
        documents.value,
        proposal.workspaceId
      );
      await refreshBookAfterSuccessfulDocumentSave(
        proposal.workspaceId,
        expectedDocuments,
        saved.projectRevision
      );
      const draft = editorDrafts.value[bodyDocument.id];
      if (draft) {
        editorDrafts.value = {
          ...editorDrafts.value,
          [bodyDocument.id]: {
            ...draft,
            title: saved.title
          }
        };
      }
      const characterStateDocument = liveWorkspaceDocuments.value.find(
        (document) =>
          document.workspaceId === proposal.workspaceId &&
          document.stageId === "draft" &&
          document.expertSectionId === target.sectionId &&
          document.draftFileKind === "character-state"
      );
      const characterDraft = characterStateDocument
        ? editorDrafts.value[characterStateDocument.id]
        : undefined;
      if (characterStateDocument && characterDraft) {
        editorDrafts.value = {
          ...editorDrafts.value,
          [characterStateDocument.id]: {
            ...characterDraft,
            title: draftCharacterStateTitle(saved.title)
          }
        };
      }
      const savedDirectoryRevision = currentExpertDraftDirectoryRevision(
        proposal.workspaceId
      );
      if (!savedDirectoryRevision) {
        throw new Error("改名完成后无法读取最新正文目录版本。");
      }
      rememberAcceptedDraftSectionCreation(proposal, savedDirectoryRevision);
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage: automatic
          ? `已自动批准并将章节「${target.previousTitle}」改名为「${target.title}」。`
          : `已将章节「${target.previousTitle}」改名为「${target.title}」并保存到本机。`
      });
      if (!automatic) {
        uiMessage.success(`已将章节改名为「${target.title}」`);
      }
    } catch (error: unknown) {
      await loadCatalogSnapshot();
      const conflict = isCatalogConflict(error);
      const message =
        error instanceof Error ? error.message : "修改章节名称失败。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: conflict ? "conflict" : "error",
        statusMessage: message
      });
      uiMessage.error(message);
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  function conflictDependentDeletedSectionProposals(
    conversation: AgentConversationController,
    runId: string,
    sectionId: string,
    message: string,
    exceptProposalId?: string
  ): void {
    const bodyId = catalogDraftBodyDocumentId(sectionId);
    const stateId = catalogDraftCharacterStateDocumentId(sectionId);
    for (const candidate of conversation.listEditProposals(runId)) {
      if (exceptProposalId && candidate.id === exceptProposalId) continue;
      if (
        candidate.status !== "pending" &&
        candidate.status !== "error" &&
        candidate.status !== "accepting"
      ) {
        continue;
      }
      const targetsDeletedSection =
        candidate.documentId === bodyId ||
        candidate.documentId === stateId ||
        candidate.draftSectionRenameTarget?.sectionId === sectionId ||
        (candidate.draftSectionDeletionTarget?.sectionId === sectionId &&
          candidate.id !== exceptProposalId);
      if (!targetsDeletedSection) continue;
      removeQueuedAgentEdit(conversation, runId, candidate.id);
      conversation.updateEditProposal(runId, candidate.id, {
        status: "conflict",
        proposedText: undefined,
        statusMessage: message
      });
    }
  }

  async function acceptDraftSectionDeletionProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean,
    reserved = false
  ): Promise<void> {
    if (
      (proposal.status === "accepting" && !reserved) ||
      proposal.status === "accepted" ||
      proposal.status === "rejected" ||
      proposal.status === "conflict"
    ) {
      return;
    }
    const target = proposal.draftSectionDeletionTarget;
    if (!target) {
      const message = "待审阅的章节删除缺少完整参数，请重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const currentApi = api();
    if (!currentApi) {
      const message = "桌面文件服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    const directory = catalogProjection.value?.draftDirectories.find(
      (candidate) => candidate.workspaceId === proposal.workspaceId
    );
    const book = catalogBook(proposal.workspaceId);
    if (!directory || !book) {
      const message = "目标正文目录已不可用，无法删除章节。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const section = directory.sections.find(
      (candidate) => candidate.id === target.sectionId
    );
    if (!section) {
      rememberAcceptedDraftSectionCreation(
        proposal,
        currentExpertDraftDirectoryRevision(proposal.workspaceId) ??
          proposal.baseRevision
      );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage: `章节「${target.title}」已不存在，无需重复删除。`
      });
      conflictDependentDeletedSectionProposals(
        conversation,
        request.runId,
        target.sectionId,
        "目标章节已删除，相关正文变更无法落盘。",
        request.proposalId
      );
      return;
    }
    if (section.title !== target.title) {
      const message = `章节「${target.title}」的当前标题已变化，未应用本次删除。`;
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (directory.sections.length <= 1) {
      const message = "正文至少需要保留一个章节，未删除。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    const currentDirectoryRevision = currentExpertDraftDirectoryRevision(
      proposal.workspaceId
    );
    const expectedDirectoryRevision =
      expectedDraftSectionCreationBaseRevision(proposal);
    if (currentDirectoryRevision !== expectedDirectoryRevision) {
      const message = "正文目录已发生变化，未删除章节，请基于最新目录重新生成。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      const message = automatic
        ? "检测到作品正在保存其他内容，实时自动删除已暂停，请稍后人工重试。"
        : "同一作品正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? "正在自动批准并删除章节…"
        : "正在校验目录版本并删除章节…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    try {
      const removedIndex = directory.sections.findIndex(
        (candidate) => candidate.id === target.sectionId
      );
      const fallbackSections = directory.sections.filter(
        (candidate) => candidate.id !== target.sectionId
      );
      const fallbackSection =
        fallbackSections[Math.min(removedIndex, fallbackSections.length - 1)];
      const deleted = await currentApi.catalog.deleteDraftSection({
        bookId: proposal.workspaceId,
        sectionId: target.sectionId,
        ...(book.projectRevision === undefined
          ? {}
          : { baseProjectRevision: book.projectRevision })
      });
      if (!deleted.deleted) {
        throw new Error(`章节「${target.title}」已经不存在。`);
      }
      const nextDrafts = { ...editorDrafts.value };
      delete nextDrafts[section.bodyDocumentId];
      delete nextDrafts[section.characterStateDocumentId];
      editorDrafts.value = nextDrafts;
      for (const conversationKey of legacyDraftSectionConversationKeys(
        proposal.workspaceId,
        target.sectionId
      )) {
        removeConversation(conversationKey);
      }
      await loadCatalogSnapshot();
      if (!automatic) {
        selectedResourceId.value = directory.id;
        activeCreationResourceId.value = directory.id;
        if (fallbackSection) {
          selectedExpertSectionIds.value = {
            ...selectedExpertSectionIds.value,
            [directory.id]: fallbackSection.id
          };
        }
        selectedDraftFileKinds.value = {
          ...selectedDraftFileKinds.value,
          [directory.id]: "body"
        };
      }
      const savedDirectoryRevision = currentExpertDraftDirectoryRevision(
        proposal.workspaceId
      );
      if (!savedDirectoryRevision) {
        throw new Error("删除完成后无法读取最新正文目录版本。");
      }
      rememberAcceptedDraftSectionCreation(proposal, savedDirectoryRevision);
      conflictDependentDeletedSectionProposals(
        conversation,
        request.runId,
        target.sectionId,
        "目标章节已删除，相关正文变更无法落盘。",
        request.proposalId
      );
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage: automatic
          ? `已自动批准并删除章节「${target.title}」及其正文与人物状态文件。`
          : `已删除章节「${target.title}」及其正文与人物状态文件。`
      });
      if (!automatic) {
        uiMessage.success(`已删除“${target.title}”及对应人物状态文件`);
      }
    } catch (error: unknown) {
      await loadCatalogSnapshot();
      const conflict = isCatalogConflict(error);
      const message =
        error instanceof Error ? error.message : "删除章节失败。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: conflict ? "conflict" : "error",
        statusMessage: message
      });
      uiMessage.error(message);
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  function conflictDependentLongWorldbuildingProposals(
    conversation: AgentConversationController,
    proposal: AgentEditProposal,
    message: string
  ): void {
    for (const candidate of conversation.listEditProposals(proposal.runId)) {
      if (
        candidate.predecessorProposalId !== proposal.id ||
        !candidate.longWorldbuildingTarget ||
        (candidate.status !== "pending" && candidate.status !== "error")
      ) {
        continue;
      }
      removeQueuedAgentEdit(
        conversation,
        candidate.runId,
        candidate.id
      );
      conversation.updateEditProposal(candidate.runId, candidate.id, {
        status: "conflict",
        proposedText: undefined,
        statusMessage: message
      });
    }
  }

  function conflictDependentLongCharacterProposals(
    conversation: AgentConversationController,
    proposal: AgentEditProposal,
    message: string
  ): void {
    const createdFileIds = new Set(
      proposal.longCharacterTarget?.files
        .filter(({ operation }) => operation === "create")
        .map(({ fileId }) => fileId) ?? []
    );
    if (!createdFileIds.size) return;
    for (const candidate of conversation.listEditProposals(proposal.runId)) {
      if (
        candidate.predecessorProposalId !== proposal.id ||
        !candidate.longCharacterTarget?.files.some(({ fileId }) =>
          createdFileIds.has(fileId)
        ) ||
        (candidate.status !== "pending" && candidate.status !== "error")
      ) {
        continue;
      }
      removeQueuedAgentEdit(conversation, candidate.runId, candidate.id);
      conversation.updateEditProposal(candidate.runId, candidate.id, {
        status: "conflict",
        proposedText: undefined,
        statusMessage: message
      });
    }
  }

  async function acceptLongPlotDesignProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean
  ): Promise<void> {
    const target = proposal.longPlotDesignTarget;
    const api = resolveLongWorkspaceApi();
    if (!target || !api) {
      const message = "长篇剧情设计服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      const message = automatic
        ? "检测到本书正在保存其他内容，剧情设计实时自动落盘已暂停，请稍后重试。"
        : "同一本书正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? "正在自动批准、校验影响并保存剧情设计…"
        : "正在校验影响并保存剧情设计…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    let applied = false;
    try {
      if (activeLongBookId.value === target.bookId) {
        await nextTick();
        if (!(await saveActiveLongEditorChanges())) {
          throw new Error("当前长篇编辑内容尚未保存，未覆盖剧情设计。");
        }
      }
      const latest = await api.getWorkspaceIndex({ bookId: target.bookId });
      const predecessor = proposal.predecessorProposalId
        ? conversation.getEditProposal(
            request.runId,
            proposal.predecessorProposalId
          )
        : undefined;
      const predecessorProjectRevision =
        predecessor?.status === "accepted"
          ? predecessor.longPlotDesignTarget?.appliedProjectRevision
          : undefined;
      if (
        latest.projectRevision !== target.baseProjectRevision &&
        latest.projectRevision !== predecessorProjectRevision
      ) {
        const message =
          "剧情设计已在审阅期间发生变化，未覆盖最新结构。请基于当前内容重新生成。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        uiMessage.warning(message);
        return;
      }
      const batch = LongWorkspaceOperationBatchSchema.parse({
        ...target.batch,
        baseRevision: latest.workspaceIndex.revision
      });
      const preview = await api.previewOperations({
        bookId: target.bookId,
        batch
      });
      if (
        preview.bookId !== target.bookId ||
        preview.projectRevision !== latest.projectRevision
      ) {
        throw new Error(
          "长篇项目已在审批期间更新，请基于最新剧情设计重新生成。"
        );
      }
      const result = await api.applyOperations({
        bookId: target.bookId,
        batch: LongWorkspaceOperationBatchSchema.parse({
          ...batch,
          expectedImpact: preview.preview.impact
        }),
        baseProjectRevision: latest.projectRevision
      });
      applied = true;
      longBooks.value = replaceLongBookSummary(longBooks.value, result.summary);
      const refreshed = await refreshLongWritingSaveBarrier(target.bookId);
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        longPlotDesignTarget: {
          ...target,
          appliedProjectRevision: result.projectRevision
        },
        statusMessage: refreshed
          ? `${automatic ? "已自动批准并" : "已接受并"}保存剧情设计。`
          : "剧情设计已保存，但界面刷新失败；请手动刷新长篇工作区。"
      });
      if (!automatic) {
        uiMessage.success("已接受并保存剧情设计");
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "保存剧情设计失败，当前结构保持不变。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: applied ? "accepted" : "error",
        statusMessage: applied
          ? `剧情设计已经保存，但刷新失败：${message}`
          : message
      });
      if (applied) {
        uiMessage.warning(`剧情设计已经保存，但刷新失败：${message}`);
      } else {
        uiMessage.error(message);
      }
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  async function acceptLongWorldbuildingFileProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean
  ): Promise<void> {
    const target = proposal.longWorldbuildingTarget;
    const api = resolveLongWorkspaceApi();
    if (!target || !api) {
      const message = "长篇世界观文件服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      const message = automatic
        ? "检测到本书正在保存其他内容，实时自动落盘已暂停，请稍后重试。"
        : "同一本书正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage:
        target.file.operation === "create"
          ? automatic
            ? "正在自动批准并创建空白世界观文件…"
            : "正在校验目录版本并创建空白世界观文件…"
          : automatic
            ? "正在自动批准、校验版本并保存世界观文件…"
            : "正在校验版本并保存世界观文件…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    let applied = false;
    try {
      if (activeLongBookId.value === target.bookId) {
        await nextTick();
        if (!(await saveActiveLongEditorChanges())) {
          throw new Error(
            "当前长篇编辑内容尚未保存，未覆盖世界观文件。"
          );
        }
      }
      const latest = await api.getWorkspaceIndex({
        bookId: target.bookId
      });
      const currentFile = findLongWorldbuildingFile(
        latest.workspaceIndex.worldbuilding,
        target.file.fileId
      );
      if (currentFile?.revision === target.file.nextRevision) {
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "accepted",
          proposedText: undefined,
          statusMessage:
            "该世界观文件变更已经存在于本地 Markdown 中。"
        });
        await refreshLongWritingSaveBarrier(target.bookId);
        return;
      }
      if (target.file.operation === "create") {
        if (currentFile) {
          const message =
            "世界观目录已存在同一文件，未重复创建。";
          conversation.updateEditProposal(request.runId, request.proposalId, {
            status: "conflict",
            statusMessage: message
          });
          uiMessage.warning(message);
          return;
        }
      } else if (
        !currentFile ||
        currentFile.revision !== target.file.beforeRevision
      ) {
        const message =
          "世界观文件已在审阅期间发生变化，未覆盖最新内容。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        await refreshLongWritingSaveBarrier(target.bookId);
        uiMessage.warning(message);
        return;
      }

      const nextOrderByCategory = new Map<string, number>();
      const batch = LongWorkspaceOperationBatchSchema.parse({
        ...target.batch,
        baseRevision: latest.workspaceIndex.revision,
        operations: target.batch.operations.map((operation) => {
          if (operation.type !== "worldbuildingItem.create") {
            return operation;
          }
          const category = latest.workspaceIndex.worldbuilding.find(
            ({ id }) => id === operation.categoryId
          );
          if (!category || category.format !== "list") {
            throw new Error(
              "世界观文件的目标分类已不存在或不再是列表型。"
            );
          }
          const nextOrder =
            (nextOrderByCategory.get(category.id) ??
              category.items.length) + 1;
          nextOrderByCategory.set(category.id, nextOrder);
          return {
            ...operation,
            item: {
              ...operation.item,
              order: nextOrder
            }
          };
        })
      });
      const preview = await api.previewOperations({
        bookId: target.bookId,
        batch
      });
      if (
        preview.bookId !== target.bookId ||
        preview.projectRevision !== latest.projectRevision
      ) {
        throw new Error(
          "长篇项目已在审批期间更新，请基于最新世界观重新生成。"
        );
      }
      const result = await api.applyOperations({
        bookId: target.bookId,
        batch: LongWorkspaceOperationBatchSchema.parse({
          ...batch,
          expectedImpact: preview.preview.impact
        }),
        baseProjectRevision: latest.projectRevision
      });
      applied = true;
      longBooks.value = replaceLongBookSummary(
        longBooks.value,
        result.summary
      );
      const refreshed = await refreshLongWritingSaveBarrier(target.bookId);
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage:
          target.file.operation === "create"
            ? automatic
              ? "已自动批准并创建空白世界观文件。"
              : "已创建空白世界观文件并保存到本地 Markdown。"
            : refreshed
              ? `${automatic ? "已自动批准并" : "已接受并"}保存到本地 Markdown。`
              : "已保存到本地 Markdown，但界面刷新失败；请手动刷新长篇工作区。"
      });
      if (!automatic) {
        uiMessage.success(
          target.file.operation === "create"
            ? "已创建空白世界观文件"
            : "已接受并保存世界观文件"
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "保存世界观文件失败，原文件保持不变。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: applied ? "accepted" : "error",
        statusMessage: applied
          ? `世界观文件已经保存，但刷新失败：${message}`
          : message
      });
      if (applied) {
        uiMessage.warning(`世界观文件已经保存，但刷新失败：${message}`);
      } else {
        uiMessage.error(message);
      }
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  async function acceptLongCharacterFileProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean
  ): Promise<void> {
    const target = proposal.longCharacterTarget;
    const api = resolveLongWorkspaceApi();
    if (!target || !api) {
      const message = "长篇人物文件服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      const message = automatic
        ? "检测到本书正在保存其他内容，实时自动落盘已暂停，请稍后重试。"
        : "同一本书正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    const isCreation = target.files.every(
      ({ operation }) => operation === "create"
    );
    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: isCreation
        ? automatic
          ? "正在自动批准并创建人物档案…"
          : "正在校验目录版本并创建人物档案…"
        : automatic
          ? "正在自动批准、校验版本并保存人物档案…"
          : "正在校验版本并保存人物档案…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    let applied = false;
    try {
      if (activeLongBookId.value === target.bookId) {
        await nextTick();
        if (!(await saveActiveLongEditorChanges())) {
          throw new Error("当前长篇编辑内容尚未保存，未覆盖人物档案。");
        }
      }
      const latest = await api.getWorkspaceIndex({ bookId: target.bookId });
      const currentFiles = new Map([
        ...(latest.workspaceIndex.characterOverview
          ? [[
              latest.workspaceIndex.characterOverview.id,
              latest.workspaceIndex.characterOverview
            ] as const]
          : []),
        ...latest.workspaceIndex.characterFiles.flatMap((entry) => [
          [entry.coreProfile.id, entry.coreProfile] as const,
          [entry.relationships.id, entry.relationships] as const,
          [entry.currentState.id, entry.currentState] as const,
          [entry.history.id, entry.history] as const
        ])
      ]);
      if (
        target.files.every(
          (file) =>
            currentFiles.get(file.fileId)?.revision === file.nextRevision
        )
      ) {
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "accepted",
          proposedText: undefined,
          statusMessage: "该人物档案变更已经存在于本地 Markdown 中。"
        });
        await refreshLongWritingSaveBarrier(target.bookId);
        return;
      }
      if (isCreation) {
        if (target.files.some((file) => currentFiles.has(file.fileId))) {
          const message = "人物目录已存在同一人物的部分档案，未重复创建。";
          conversation.updateEditProposal(request.runId, request.proposalId, {
            status: "conflict",
            statusMessage: message
          });
          uiMessage.warning(message);
          return;
        }
      } else {
        const changed = target.files.find((file) => {
          const current = currentFiles.get(file.fileId);
          return !current || current.revision !== file.beforeRevision;
        });
        if (changed) {
          const message = "人物档案已在审阅期间发生变化，未覆盖最新内容。";
          conversation.updateEditProposal(request.runId, request.proposalId, {
            status: "conflict",
            statusMessage: message
          });
          await refreshLongWritingSaveBarrier(target.bookId);
          uiMessage.warning(message);
          return;
        }
      }

      const nextOrderByGroup = new Map<string, number>();
      const batch = LongWorkspaceOperationBatchSchema.parse({
        ...target.batch,
        baseRevision: latest.workspaceIndex.revision,
        operations: target.batch.operations.map((operation) => {
          if (operation.type !== "character.create") return operation;
          const group = operation.character.group;
          const nextOrder =
            (nextOrderByGroup.get(group) ??
              latest.workspaceIndex.characters.filter(
                (character) => character.group === group
              ).length) + 1;
          nextOrderByGroup.set(group, nextOrder);
          return {
            ...operation,
            character: { ...operation.character, order: nextOrder }
          };
        })
      });
      const preview = await api.previewOperations({
        bookId: target.bookId,
        batch
      });
      if (
        preview.bookId !== target.bookId ||
        preview.projectRevision !== latest.projectRevision
      ) {
        throw new Error(
          "长篇项目已在审批期间更新，请基于最新人物档案重新生成。"
        );
      }
      const result = await api.applyOperations({
        bookId: target.bookId,
        batch: LongWorkspaceOperationBatchSchema.parse({
          ...batch,
          expectedImpact: preview.preview.impact
        }),
        baseProjectRevision: latest.projectRevision
      });
      applied = true;
      longBooks.value = replaceLongBookSummary(longBooks.value, result.summary);
      const refreshed = await refreshLongWritingSaveBarrier(target.bookId);
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage: isCreation
          ? automatic
            ? "已自动批准并创建人物及四份空白档案。"
            : "已创建人物及四份空白档案并保存到本地 Markdown。"
          : refreshed
            ? `${automatic ? "已自动批准并" : "已接受并"}保存到本地 Markdown。`
            : "已保存到本地 Markdown，但界面刷新失败；请手动刷新长篇工作区。"
      });
      if (!automatic) {
        uiMessage.success(isCreation ? "已创建人物档案" : "已接受并保存人物档案");
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "保存人物档案失败，原文件保持不变。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: applied ? "accepted" : "error",
        statusMessage: applied
          ? `人物档案已经保存，但刷新失败：${message}`
          : message
      });
      if (applied) {
        uiMessage.warning(`人物档案已经保存，但刷新失败：${message}`);
      } else {
        uiMessage.error(message);
      }
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  async function acceptLongDraftProposal(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    proposal: AgentEditProposal,
    automatic: boolean
  ): Promise<void> {
    const target = proposal.longDraftTarget;
    const api = resolveLongWorkspaceApi();
    if (!target || !api) {
      const message = "长篇正文服务当前不可用。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    if (acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId)) {
      const message = automatic
        ? "检测到本书正在保存其他内容，正文实时自动落盘已暂停，请稍后重试。"
        : "同一本书正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? "正在自动批准、校验版本并保存章节正文…"
        : "正在校验版本并保存章节正文…"
    });
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    let applied = false;
    try {
      if (activeLongBookId.value === target.bookId) {
        await nextTick();
        if (!(await saveActiveLongEditorChanges())) {
          throw new Error("当前长篇编辑内容尚未保存，未覆盖章节正文。");
        }
      }
      const latest = await api.getWorkspaceIndex({ bookId: target.bookId });
      const chapter = latest.workspaceIndex.chapters.find(
        ({ chapterCardId }) => chapterCardId === target.file.chapterCardId
      );
      if (!chapter || chapter.body.id !== target.file.fileId) {
        const message = "目标章卡或章节正文已经不存在，未保存本次修改。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        uiMessage.warning(message);
        return;
      }
      if (chapter.body.revision === target.file.nextRevision) {
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "accepted",
          proposedText: undefined,
          statusMessage: "该章节正文变更已经存在于本地 Markdown 中。"
        });
        const refreshed = await refreshLongWritingSaveBarrier(target.bookId);
        if (refreshed) {
          await longWritingOrchestrator.handleChapterSaved(
            target.bookId,
            target.file.chapterCardId
          );
        }
        return;
      }
      const predecessor = proposal.predecessorProposalId
        ? conversation.getEditProposal(
            request.runId,
            proposal.predecessorProposalId
          )
        : undefined;
      const predecessorProjectRevision =
        predecessor?.status === "accepted"
          ? predecessor.longDraftTarget?.appliedProjectRevision
          : undefined;
      if (
        latest.projectRevision !== target.baseProjectRevision &&
        latest.projectRevision !== predecessorProjectRevision
      ) {
        const message =
          "章节正文已在审阅期间发生变化，未覆盖最新内容。请基于当前正文重新生成。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        uiMessage.warning(message);
        return;
      }
      if (chapter.body.revision !== target.file.beforeRevision) {
        const message = "章节正文已在审阅期间发生变化，未覆盖最新内容。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        await refreshLongWritingSaveBarrier(target.bookId);
        uiMessage.warning(message);
        return;
      }
      const batch = LongWorkspaceOperationBatchSchema.parse({
        ...target.batch,
        baseRevision: latest.workspaceIndex.revision
      });
      const preview = await api.previewOperations({
        bookId: target.bookId,
        batch
      });
      if (
        preview.bookId !== target.bookId ||
        preview.projectRevision !== latest.projectRevision
      ) {
        throw new Error(
          "长篇项目已在审批期间更新，请基于最新正文重新生成。"
        );
      }
      const result = await api.applyOperations({
        bookId: target.bookId,
        batch: LongWorkspaceOperationBatchSchema.parse({
          ...batch,
          expectedImpact: preview.preview.impact
        }),
        baseProjectRevision: latest.projectRevision
      });
      applied = true;
      longBooks.value = replaceLongBookSummary(longBooks.value, result.summary);
      const refreshed = await refreshLongWritingSaveBarrier(target.bookId);
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        longDraftTarget: {
          ...target,
          appliedProjectRevision: result.projectRevision
        },
        statusMessage: refreshed
          ? `${automatic ? "已自动批准并" : "已接受并"}保存章节正文到本地 Markdown。`
          : "章节正文已保存，但界面刷新失败；请手动刷新长篇工作区。"
      });
      if (refreshed) {
        await longWritingOrchestrator.handleChapterSaved(
          target.bookId,
          target.file.chapterCardId
        );
      }
      if (!automatic) {
        uiMessage.success("已接受并保存章节正文");
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "保存章节正文失败，原文件保持不变。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: applied ? "accepted" : "error",
        statusMessage: applied
          ? `章节正文已经保存，但刷新失败：${message}`
          : message
      });
      if (applied) {
        uiMessage.warning(`章节正文已经保存，但刷新失败：${message}`);
      } else {
        uiMessage.error(message);
      }
    } finally {
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  async function applyAgentEdit(
    conversation: AgentConversationController,
    request: AgentEditReviewRequest,
    automatic = false,
    reservation?: {
      decisionToken: string;
      expectedProposedRevision: string;
    }
  ): Promise<void> {
    let proposal = conversation.getEditProposal(request.runId, request.proposalId);
    if (!proposal) {
      uiMessage.error("待审阅的智能体变更已不存在，请重新生成修改。");
      return;
    }
    const reserved = Boolean(
      reservation &&
        proposal.status === "accepting" &&
        proposal.decisionToken === reservation.decisionToken &&
        proposal.proposedRevision === reservation.expectedProposedRevision
    );
    if (reservation && !reserved) {
      return;
    }
    if (
      conversation.isBusy.value &&
      !canReviewAgentEditDuringRun(proposal)
    ) {
      uiMessage.info("请等待本轮智能体完成后再审阅文稿变更");
      return;
    }

    if (request.decision === "reject") {
      if (proposal.status === "accepting" || proposal.status === "accepted") return;
      removeQueuedAgentEdit(conversation, request.runId, request.proposalId);
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "rejected",
        proposedText: undefined,
        statusMessage: proposal.longPlotDesignTarget
          ? "已拒绝，剧情设计保持不变。"
          : proposal.longDraftTarget
            ? "已拒绝，章节正文保持不变。"
          : "已拒绝，原文保持不变。"
      });
      if (proposal.draftSectionCreationTarget) {
        conflictDependentProvisionalFileProposals(
          conversation,
          request.runId,
          proposal.draftSectionCreationTarget.sections.map(
            (section) => section.provisionalSectionId
          ),
          "空白章节创建已被拒绝，相关正文写入无法落盘。"
        );
      }
      if (
        proposal.longWorldbuildingTarget?.file.operation === "create"
      ) {
        conflictDependentLongWorldbuildingProposals(
          conversation,
          proposal,
          "空白世界观文件创建已被拒绝，相关正文写入无法落盘。"
        );
      }
      if (
        proposal.longCharacterTarget?.files.every(
          ({ operation }) => operation === "create"
        )
      ) {
        conflictDependentLongCharacterProposals(
          conversation,
          proposal,
          "人物创建已被拒绝，相关人物档案写入无法落盘。"
        );
      }
      blockLaterAgentEditGenerations(conversation, proposal);
      if (proposal.longDraftTarget) {
        longWritingOrchestrator.handleChapterRejected(
          proposal.longDraftTarget.bookId,
          proposal.longDraftTarget.file.chapterCardId
        );
      }
      uiMessage.info(
        proposal.longPlotDesignTarget
          ? "已拒绝剧情设计变更，当前结构未改变"
          : proposal.longDraftTarget
            ? "已拒绝章节正文变更，当前正文未改变"
          : "已拒绝智能体修改，原文未改变"
      );
      return;
    }

    if (
      (proposal.status === "accepting" && !reserved) ||
      proposal.status === "accepted" ||
      proposal.status === "rejected" ||
      proposal.status === "conflict"
    ) {
      return;
    }

    if (proposal.predecessorProposalId) {
      const predecessor = conversation.getEditProposal(
        request.runId,
        proposal.predecessorProposalId
      );
      if (
        !predecessor ||
        predecessor.status === "rejected" ||
        predecessor.status === "conflict" ||
        predecessor.status === "error"
      ) {
        const message =
          "前一版智能体修改未能落盘，本版依赖已阻断，没有覆盖当前文稿。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          proposedText: undefined,
          statusMessage: message
        });
        return;
      }
      if (predecessor.status !== "accepted") {
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "pending",
          statusMessage: "正在等待前一版修改完成落盘…"
        });
        return;
      }
    }

    if (proposal.libraryTarget?.operation === "create") {
      await acceptLibraryCreationProposal(
        conversation,
        request,
        proposal,
        automatic
      );
      return;
    }

    if (proposal.longWorldbuildingTarget) {
      await acceptLongWorldbuildingFileProposal(
        conversation,
        request,
        proposal,
        automatic
      );
      return;
    }

    if (proposal.longCharacterTarget) {
      await acceptLongCharacterFileProposal(
        conversation,
        request,
        proposal,
        automatic
      );
      return;
    }

    if (proposal.longPlotDesignTarget) {
      await acceptLongPlotDesignProposal(
        conversation,
        request,
        proposal,
        automatic
      );
      return;
    }

    if (proposal.longDraftTarget) {
      await acceptLongDraftProposal(
        conversation,
        request,
        proposal,
        automatic
      );
      return;
    }

    if (proposal.characterStructureTarget) {
      await acceptCharacterStructureProposal(
        conversation,
        request,
        proposal,
        automatic,
        reserved
      );
      return;
    }

    if (proposal.draftSectionCreationTarget) {
      await acceptDraftSectionCreationProposal(
        conversation,
        request,
        proposal,
        automatic,
        reserved
      );
      return;
    }

    if (proposal.draftSectionRenameTarget) {
      await acceptDraftSectionRenameProposal(
        conversation,
        request,
        proposal,
        automatic,
        reserved
      );
      return;
    }

    if (proposal.draftSectionDeletionTarget) {
      await acceptDraftSectionDeletionProposal(
        conversation,
        request,
        proposal,
        automatic,
        reserved
      );
      return;
    }

    if (proposal.provisionalExpertSection) {
      const parsedDocumentId = parseCatalogDraftDocumentId(proposal.documentId);
      if (!parsedDocumentId) {
        const message = "待审阅的临时章节文件标识无效，请重新生成。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "error",
          statusMessage: message
        });
        uiMessage.warning(message);
        return;
      }
      const provisionalSectionId = parsedDocumentId.sectionId;
      const creation = findPendingDraftSectionCreationForProvisional(
        conversation,
        request.runId,
        provisionalSectionId
      );
      if (creation?.status === "error" || creation?.status === "accepting") {
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "pending",
          statusMessage:
            creation.status === "error"
              ? "章节创建结果尚未确认，正文内容已保留；请先重试章节创建。"
              : "正在等待关联章节创建完成…"
        });
        return;
      }
      if (creation) {
        await acceptDraftSectionCreationProposal(
          conversation,
          {
            runId: request.runId,
            proposalId: creation.id,
            decision: "accept"
          },
          creation,
          automatic
        );
      } else {
        const realSectionId = resolveProvisionalExpertSectionId(
          request.runId,
          proposal.workspaceId,
          provisionalSectionId
        );
        if (realSectionId !== provisionalSectionId) {
          remapProvisionalExpertSectionFileProposals(
            conversation,
            request.runId,
            proposal.workspaceId,
            new Map([[provisionalSectionId, realSectionId]])
          );
        } else {
          const inFlight = conversation.listEditProposals(request.runId).find(
            (candidate) =>
              candidate.draftSectionCreationTarget?.sections.some(
                (section) => section.provisionalSectionId === provisionalSectionId
              ) && candidate.status === "accepting"
          );
          if (inFlight) {
            uiMessage.info("同一作品正在保存其他修改，请稍候再接受");
            return;
          }
        }
      }
      const remapped = conversation.getEditProposal(
        request.runId,
        request.proposalId
      );
      if (!remapped) {
        uiMessage.error("待审阅的智能体变更已不存在，请重新生成修改。");
        return;
      }
      proposal = remapped;
      if (proposal.provisionalExpertSection) {
        const message =
          "目标空白章节尚未落盘，无法写入正文。请先接受章节创建，或重新生成。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        uiMessage.warning(message);
        return;
      }
    }

    if (proposal.provisionalCharacterItemId) {
      const creation = findPendingCharacterCreationForProvisional(
        conversation,
        request.runId,
        proposal.provisionalCharacterItemId
      );
      if (creation?.status === "error" || creation?.status === "accepting") {
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "pending",
          statusMessage:
            creation.status === "error"
              ? "人物条目创建结果尚未确认，正文内容已保留；请先重试创建操作。"
              : "正在等待关联人物条目创建完成…"
        });
        return;
      }
      if (creation) {
        await acceptCharacterStructureProposal(
          conversation,
          {
            runId: request.runId,
            proposalId: creation.id,
            decision: "accept"
          },
          creation,
          automatic
        );
      }
      const createdTarget = liveWorkspaceDocuments.value.find(
        (document) =>
          document.workspaceId === proposal.workspaceId &&
          document.catalogDocumentId === proposal.provisionalCharacterItemId
      );
      if (!createdTarget) {
        const message =
          "目标人物条目尚未落盘，无法写入正文。请先接受人物条目创建，或重新生成。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        uiMessage.warning(message);
        return;
      }
    }

    const target = liveWorkspaceDocuments.value.find(
      (document) => document.id === proposal.documentId
    );
    const persistedDocument = documents.value.find(
      (document) => document.id === proposal.documentId
    );
    if (!target || !persistedDocument || target.readOnly) {
      const message = "目标文稿已不可用，无法接受这项智能体修改。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }

    if (proposal.libraryTarget) {
      const library = findCatalogLibrary(
        proposal.libraryTarget.domain,
        proposal.libraryTarget.libraryId
      );
      if (
        !library ||
        !currentLibraryProjectRevisionMatches(proposal, library.projectRevision)
      ) {
        const message =
          "资料库目录已在审阅期间发生变化，未接受智能体修改。";
        conversation.updateEditProposal(request.runId, request.proposalId, {
          status: "conflict",
          statusMessage: message
        });
        uiMessage.warning(message);
        return;
      }
    }

    if (
      acceptingAgentEditWorkspaceIds.value.has(proposal.workspaceId) ||
      documents.value.some(
        (document) =>
          (document.workspaceId === proposal.workspaceId ||
            (proposal.libraryTarget !== undefined &&
              document.domain === proposal.libraryTarget.domain &&
              document.libraryId === proposal.libraryTarget.libraryId)) &&
          savingDocumentIds.value.has(document.id)
      )
    ) {
      const message = automatic
        ? "检测到作品正在保存其他内容，实时自动落盘已暂停，请稍后人工重试。"
        : "同一作品正在保存其他修改，请稍候再接受";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: automatic ? "error" : "pending",
        statusMessage: message
      });
      uiMessage.info(message);
      return;
    }

    const currentDraft = editorDrafts.value[target.id];
    const persistedRevision = createShortWorkspaceContentRevision(
      persistedDocument.content
    );
    if (
      persistedRevision === proposal.proposedRevision &&
      (!proposal.libraryTarget || persistedDocument.title === proposal.title)
    ) {
      const draftRevision = currentDraft
        ? createShortWorkspaceContentRevision(currentDraft.content)
        : undefined;
      const staleRecoveryDraft = Boolean(
        currentDraft &&
          currentDraft.title === persistedDocument.title &&
          (draftRevision === proposal.baseRevision ||
            draftRevision === proposal.proposedRevision)
      );
      if (staleRecoveryDraft) {
        const nextDrafts = { ...editorDrafts.value };
        delete nextDrafts[target.id];
        editorDrafts.value = nextDrafts;
      }
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage:
          currentDraft && !staleRecoveryDraft
            ? "修改已在本地 Markdown 中；检测到另一份未保存草稿，已为你保留。"
            : "修改已经存在于本地 Markdown 中。"
      });
      if (!automatic) {
        uiMessage.success("智能体修改已经保存在本地文稿中");
      }
      return;
    }

    const acceptance = classifyAgentEditAcceptance(proposal, target.content);
    if (acceptance === "missing-proposed-text") {
      const message = "待审阅变更缺少完整修改稿，请重新生成修改。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "error",
        statusMessage: message
      });
      uiMessage.error(message);
      return;
    }
    if (acceptance === "conflict") {
      const message =
        "文稿已在审阅期间发生变化，未接受智能体修改，也没有覆盖最新内容。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "conflict",
        statusMessage: message
      });
      uiMessage.warning(message);
      return;
    }

    const proposedText = proposal.proposedText!;
    const payload = {
      id: target.id,
      title: proposal.title,
      content: proposedText
    };
    conversation.updateEditProposal(request.runId, request.proposalId, {
      status: "accepting",
      statusMessage: automatic
        ? "正在自动批准、校验版本并保存到本地 Markdown…"
        : "正在校验版本并保存到本地 Markdown…"
    });
    setAgentEditDocumentAccepting(target.id, true);
    setAgentEditWorkspaceAccepting(proposal.workspaceId, true);
    const draftAtAccept = currentDraft;
    const currentApi = api();

    try {
      let persisted = false;
      let newerDraftPreserved = false;
      if (persistedDocument.workspaceId && persistedDocument.catalogDocumentId) {
        if (!currentApi) {
          throw new Error("桌面文件服务当前不可用。");
        }
        const projectRevision =
          currentDraft?.baseProjectRevision ?? persistedDocument.catalogProjectRevision;
        const saved = await currentApi.catalog.saveDocument({
          bookId: persistedDocument.workspaceId,
          documentId: persistedDocument.catalogDocumentId,
          title: payload.title,
          content: payload.content,
          baseRevision:
            currentDraft?.baseRevision ??
            createShortWorkspaceContentRevision(persistedDocument.content),
          ...(projectRevision === undefined
            ? {}
            : { baseProjectRevision: projectRevision })
        });
        const normalizedPayload = {
          id: payload.id,
          title: saved.title,
          content: saved.content
        };
        applyAcceptedAgentDocumentLocally(
          normalizedPayload,
          saved.projectRevision,
          draftAtAccept
        );
        const expectedDocuments = captureWorkspaceDocumentBaselines(
          documents.value,
          persistedDocument.workspaceId
        );
        await refreshBookAfterSuccessfulDocumentSave(
          persistedDocument.workspaceId,
          expectedDocuments,
          saved.projectRevision
        );
        newerDraftPreserved = Boolean(editorDrafts.value[payload.id]);
        persisted = true;
      } else if (
        proposal.libraryTarget?.operation === "edit-overview" &&
        persistedDocument.catalogLibraryField === "overview" &&
        persistedDocument.libraryId &&
        (persistedDocument.domain === "material" ||
          persistedDocument.domain === "skill")
      ) {
        if (!currentApi) {
          throw new Error("桌面文件服务当前不可用。");
        }
        const updated = await currentApi.catalog.updateLibrary({
          domain: persistedDocument.domain,
          libraryId: persistedDocument.libraryId,
          overview: payload.content,
          ...(persistedDocument.catalogProjectRevision === undefined
            ? {}
            : {
                baseProjectRevision:
                  findCatalogLibrary(
                    persistedDocument.domain,
                    persistedDocument.libraryId
                  )?.projectRevision ??
                  persistedDocument.catalogProjectRevision
              })
        });
        const normalizedPayload = {
          id: payload.id,
          title: persistedDocument.title,
          content: updated.overview
        };
        await applyUpdatedCatalogLibrary(persistedDocument.domain, updated);
        applyAcceptedAgentDocumentLocally(
          normalizedPayload,
          updated.projectRevision,
          draftAtAccept
        );
        rememberAcceptedLibraryMutation(proposal);
        newerDraftPreserved = Boolean(editorDrafts.value[payload.id]);
        persisted = true;
      } else if (
        proposal.libraryTarget?.operation === "edit" &&
        persistedDocument.catalogEntryId &&
        persistedDocument.libraryId &&
        (persistedDocument.domain === "material" ||
          persistedDocument.domain === "skill")
      ) {
        if (!currentApi) {
          throw new Error("桌面文件服务当前不可用。");
        }
        const library = findCatalogLibrary(
          persistedDocument.domain,
          persistedDocument.libraryId
        );
        if (!library) {
          throw new Error("目标资料库已不存在。");
        }
        const projectRevision = library.projectRevision;
        const saved = await currentApi.catalog.saveLibraryEntry({
          domain: persistedDocument.domain,
          libraryId: persistedDocument.libraryId,
          entryId: persistedDocument.catalogEntryId,
          title: payload.title,
          content: payload.content,
          baseRevision:
            currentDraft?.baseRevision ??
            createShortWorkspaceContentRevision(persistedDocument.content),
          ...(projectRevision === undefined
            ? {}
            : { baseProjectRevision: projectRevision })
        });
        const savedProjectRevision =
          projectRevision === undefined ? undefined : projectRevision + 1;
        const normalizedPayload = {
          id: payload.id,
          title: saved.title,
          content: saved.body
        };
        const synchronizedProjectRevision = await applySavedLibraryEntry(
          persistedDocument.domain,
          persistedDocument.libraryId,
          saved,
          savedProjectRevision
        );
        applyAcceptedAgentDocumentLocally(
          normalizedPayload,
          synchronizedProjectRevision,
          draftAtAccept
        );
        rememberAcceptedLibraryMutation(proposal);
        newerDraftPreserved = Boolean(editorDrafts.value[payload.id]);
        persisted = true;
      } else {
        applyAcceptedAgentDocumentLocally(payload, undefined, draftAtAccept);
        newerDraftPreserved = Boolean(editorDrafts.value[payload.id]);
      }

      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: "accepted",
        proposedText: undefined,
        statusMessage: newerDraftPreserved
          ? `${automatic ? "已自动批准并" : "已"}保存审阅时的智能体修改；保存期间出现的更新草稿已保留。`
          : persisted
            ? `${automatic ? "已自动批准并" : "已接受并"}保存到本地文件。`
            : `${automatic ? "已自动批准并写入" : "已接受到"}当前工作区；该预览资源没有对应的本地文件。`
      });
      if (!automatic) {
        uiMessage.success(
          persisted ? "已接受并保存智能体修改" : "已接受智能体修改"
        );
      }
    } catch (error: unknown) {
      const conflict = isCatalogConflict(error);
      const message = conflict
        ? "本地 Markdown 已在其他位置更新，未保存智能体修改；请基于最新文稿重新生成。"
        : error instanceof Error
          ? error.message
          : "保存智能体修改失败，原文保持不变。";
      conversation.updateEditProposal(request.runId, request.proposalId, {
        status: conflict ? "conflict" : "error",
        statusMessage: message
      });
      if (conflict) {
        await loadCatalogSnapshot();
        uiMessage.warning(message);
      } else {
        uiMessage.error(message);
      }
    } finally {
      setAgentEditDocumentAccepting(target.id, false);
      setAgentEditWorkspaceAccepting(proposal.workspaceId, false);
    }
  }

  async function reviewAgentEdit(request: AgentEditReviewRequest): Promise<void> {
    const conversation = activeConversation.value;
    const proposal = conversation.getEditProposal(
      request.runId,
      request.proposalId
    );
    if (
      request.decision === "accept" &&
      proposal &&
      canReviewAgentEditDuringRun(proposal)
    ) {
      queueAgentEdit(
        conversation,
        conversation.sessionId.value,
        request.runId,
        request.proposalId,
        false,
        true
      );
      return;
    }
    await applyAgentEdit(conversation, request);
  }

  async function reviewLongAgentEdit(
    request: AgentEditReviewRequest
  ): Promise<void> {
    const conversation = activeLongConversation.value;
    if (!conversation) return;
    const proposal = conversation.getEditProposal(
      request.runId,
      request.proposalId
    );
    if (
      request.decision === "accept" &&
      proposal &&
      canReviewAgentEditDuringRun(proposal)
    ) {
      queueAgentEdit(
        conversation,
        conversation.sessionId.value,
        request.runId,
        request.proposalId,
        false,
        true
      );
      return;
    }
    await applyAgentEdit(conversation, request);
  }

  async function drainQueuedAgentEditsForWorkspace(
    workspaceId: string
  ): Promise<void> {
    const entries = [...queuedAgentEdits.entries()]
      .filter(([, queued]) => queued.workspaceId === workspaceId)
      .sort(([, left], [, right]) => {
        const priority =
          autoApproveEditPriority(
            left.conversation,
            left.runId,
            left.proposalId
          ) -
          autoApproveEditPriority(
            right.conversation,
            right.runId,
            right.proposalId
          );
        if (priority !== 0) return priority;
        const leftProposal = left.conversation.getEditProposal(
          left.runId,
          left.proposalId
        );
        const rightProposal = right.conversation.getEditProposal(
          right.runId,
          right.proposalId
        );
        return (
          (leftProposal?.generation ?? 1) -
            (rightProposal?.generation ?? 1) ||
          Date.parse(leftProposal?.createdAt ?? "") -
            Date.parse(rightProposal?.createdAt ?? "")
        );
      });

    for (const [key, queued] of entries) {
      if (queuedAgentEdits.get(key) !== queued) {
        continue;
      }
      const current = queued.conversation.getEditProposal(
        queued.runId,
        queued.proposalId
      );
      if (
        !current ||
        queued.snapshot.token !== queued.decisionToken ||
        queued.snapshot.proposal.id !== queued.proposalId ||
        queued.snapshot.proposedRevision !== queued.expectedProposedRevision ||
        current.proposedRevision !== queued.expectedProposedRevision ||
        (current.status !== "pending" &&
          current.status !== "error" &&
          !(
            current.status === "accepting" &&
            current.decisionToken === queued.decisionToken
          ))
      ) {
        if (queuedAgentEdits.get(key) === queued) {
          queuedAgentEdits.delete(key);
        }
        continue;
      }
      if (
        current.status === "pending" ||
        current.status === "error"
      ) {
        queued.conversation.updateEditProposal(
          queued.runId,
          queued.proposalId,
          {
            status: "accepting",
            decisionToken: queued.decisionToken,
            statusMessage: queued.automatic
              ? "已进入自动保存队列…"
              : "已批准，正在等待本作品的保存队列…"
          }
        );
      }

      if (queuedAgentEdits.get(key) !== queued) {
        continue;
      }
      queuedAgentEdits.delete(key);
      await applyAgentEdit(
        queued.conversation,
        {
          runId: queued.runId,
          proposalId: queued.proposalId,
          decision: "accept"
        },
        queued.automatic,
        {
          decisionToken: queued.decisionToken,
          expectedProposedRevision: queued.expectedProposedRevision
        }
      );
    }
  }

  function scheduleQueuedAgentEdits(
    matches: (queued: QueuedAgentEdit) => boolean
  ): void {
    const workspaceIds = new Set(
      [...queuedAgentEdits.values()]
        .filter(matches)
        .map((queued) => queued.workspaceId)
    );
    for (const workspaceId of workspaceIds) {
      const task = agentEditCommitQueue
        .enqueue(workspaceId, () =>
          drainQueuedAgentEditsForWorkspace(workspaceId)
        )
        .catch((error: unknown) => {
          uiMessage.error(
            error instanceof Error ? error.message : "批准智能体修改失败。"
          );
        });
      activeAgentEditCommitTasks.add(task);
      void task.then(
        () => {
          activeAgentEditCommitTasks.delete(task);
        },
        () => {
          activeAgentEditCommitTasks.delete(task);
        }
      );
    }
  }

  function hasQueuedAgentEdits(): boolean {
    return queuedAgentEdits.size > 0 || activeAgentEditCommitTasks.size > 0;
  }

  function invokeWhileActive(operation: () => Promise<void>): Promise<void> {
    if (coordinatorDisposed) return Promise.resolve();
    const invocation = operation();
    activeCoordinatorInvocations.add(invocation);
    void invocation.then(
      () => {
        activeCoordinatorInvocations.delete(invocation);
      },
      () => {
        activeCoordinatorInvocations.delete(invocation);
      }
    );
    return invocation;
  }

  async function drain(): Promise<void> {
    while (
      activeCoordinatorInvocations.size > 0 ||
      activeAgentEditCommitTasks.size > 0
    ) {
      await Promise.allSettled([
        ...activeCoordinatorInvocations,
        ...activeAgentEditCommitTasks
      ]);
    }
  }

  function dispose(): Promise<void> {
    if (coordinatorDisposePromise) return coordinatorDisposePromise;
    coordinatorDisposed = true;
    coordinatorDisposePromise = drain().finally(() => {
      // Unscheduled proposals remain durable in their conversations and can be
      // recovered by the next coordinator. This map is only an in-memory lane.
      queuedAgentEdits.clear();
    });
    return coordinatorDisposePromise;
  }

  return {
    resumeRecoveredAutomaticAgentEdits: (
      ...args: Parameters<typeof resumeRecoveredAutomaticAgentEdits>
    ) => {
      if (!coordinatorDisposed) resumeRecoveredAutomaticAgentEdits(...args);
    },
    hasQueuedAgentEdits,
    reviewAgentEdit: (...args: Parameters<typeof reviewAgentEdit>) =>
      invokeWhileActive(() => reviewAgentEdit(...args)),
    reviewLongAgentEdit: (...args: Parameters<typeof reviewLongAgentEdit>) =>
      invokeWhileActive(() => reviewLongAgentEdit(...args)),
    scheduleQueuedAgentEdits: (
      ...args: Parameters<typeof scheduleQueuedAgentEdits>
    ) => {
      if (!coordinatorDisposed) scheduleQueuedAgentEdits(...args);
    },
    stageAgentEditProposal: (
      ...args: Parameters<typeof stageAgentEditProposal>
    ) => {
      if (!coordinatorDisposed) stageAgentEditProposal(...args);
    },
    stageLibraryEditProposal: (
      ...args: Parameters<typeof stageLibraryEditProposal>
    ) => {
      if (!coordinatorDisposed) stageLibraryEditProposal(...args);
    },
    stageLongCharacterEditProposal: (
      ...args: Parameters<typeof stageLongCharacterEditProposal>
    ) => {
      if (!coordinatorDisposed) stageLongCharacterEditProposal(...args);
    },
    stageLongDraftEditProposal: (
      ...args: Parameters<typeof stageLongDraftEditProposal>
    ) => {
      if (!coordinatorDisposed) stageLongDraftEditProposal(...args);
    },
    stageLongPlotDesignEditProposal: (
      ...args: Parameters<typeof stageLongPlotDesignEditProposal>
    ) => {
      if (!coordinatorDisposed) stageLongPlotDesignEditProposal(...args);
    },
    stageLongWorldbuildingEditProposal: (
      ...args: Parameters<typeof stageLongWorldbuildingEditProposal>
    ) => {
      if (!coordinatorDisposed) stageLongWorldbuildingEditProposal(...args);
    },
    drain,
    dispose
  };
}

export type ProposalCoordinator = ReturnType<typeof useProposalCoordinator>;
