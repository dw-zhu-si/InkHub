import {
  MATERIAL_KINDS,
  SKILL_KINDS,
  getDefaultLongAgentProfile,
  longAgentAcceptsWorldbuildingDirectory,
  resolveLongAgentIdForRoot,
  type CatalogSnapshot,
  type LongAgentProfile,
  type LongAgentSettings,
  type LongBookSummary,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceRuntimeContext
} from "@deepwrite/contracts";
import {
  computed,
  shallowRef,
  type ComputedRef,
  type Ref
} from "vue";
import type {
  LongWorkspaceFileContext,
  LongWorkspaceRefreshStatus,
  LongWorkspaceRevisionSyncRequirement
} from "../stores/longWorkspaceStore";
import type { LongWorkspaceSelection } from "../types/longWorkspace";
import { nextWritableLongChapterId } from "../types/longWorkspace";
import type { WorkspaceDocument } from "../types/workspace";
import { agentRunScopeForDocument } from "../utils/agentRunPreferences";
import {
  buildLibraryAttachments,
  type LibraryAttachmentBuildResult
} from "../utils/libraryAttachments";
import { buildLongWorldbuildingDirectorySnapshot } from "../utils/longWorldbuildingDirectorySnapshot";

type LongLedgerCommit =
  LongWorkspaceIndexSnapshot["ledger"]["commits"][number];

type LongReadableAttachments = Pick<
  LibraryAttachmentBuildResult,
  "attachedSkills" | "attachedMaterials"
>;

interface LongConversationProposalStatus {
  readonly status: string;
}

export interface LongWorkspacePresentationWorkflowPort {
  readonly activeConversationProposalItems: Readonly<
    Ref<readonly LongConversationProposalStatus[]>
  >;
}

export interface LongWorkspacePresentationEditorPort {
  readonly selectedResourceId: Readonly<Ref<string>>;
  readonly activeDocument: Readonly<Ref<WorkspaceDocument>>;
  readonly activeAgentDocument: Readonly<Ref<WorkspaceDocument>>;
  promptDocumentForResourceId(
    resourceId: string
  ): WorkspaceDocument | undefined;
}

export interface LongWorkspacePresentationConversationState {
  readonly isBusy: Readonly<Ref<boolean>>;
  readonly hasPendingEditReview: Readonly<Ref<boolean>>;
}

export interface LongWorkspacePresentationCoordinatorOptions {
  isLongWorkspaceActive: Readonly<Ref<boolean>>;
  long: {
    activeBookId: Readonly<Ref<string | null>>;
    activeBookSummary: Readonly<Ref<LongBookSummary | null>>;
    workspaceIndex: Readonly<Ref<LongWorkspaceIndexSnapshot | null>>;
    selection: Readonly<Ref<LongWorkspaceSelection | null>>;
    fileContext: Readonly<Ref<LongWorkspaceFileContext | null>>;
    contextReady: Readonly<Ref<boolean>>;
    agentSettings: Readonly<Ref<LongAgentSettings>>;
    rollbackCommitId: Readonly<Ref<string | null>>;
    rollbackPending: Readonly<Ref<boolean>>;
    refreshStatus: Readonly<Ref<LongWorkspaceRefreshStatus | null>>;
    revisionRequirement: Readonly<
      Ref<LongWorkspaceRevisionSyncRequirement | null>
    >;
    sendPreflightPending: Readonly<Ref<boolean>>;
    proposalApprovalPending: Readonly<Ref<boolean>>;
  };
  catalog: {
    documents: Readonly<Ref<readonly WorkspaceDocument[]>>;
  };
  conversations: {
    /**
     * Keep these as refs even though their Map identities are stable. The
     * store uses triggerRef after registration/removal, which must invalidate
     * the aggregated scope state below.
     */
    controllers: Readonly<
      Ref<
        ReadonlyMap<
          string,
          LongWorkspacePresentationConversationState
        >
      >
    >;
    scopesByKey: Readonly<Ref<ReadonlyMap<string, string>>>;
  };
  edits: {
    acceptingDocumentIds: Readonly<Ref<Set<string>>>;
    acceptingWorkspaceIds: Readonly<Ref<Set<string>>>;
    savingDocumentIds: Readonly<Ref<Set<string>>>;
  };
}

export interface LongWorkspacePresentationCoordinator {
  activeLongRoot: ComputedRef<
    LongWorkspaceRuntimeContext["activeRoot"]
  >;
  activeLongChapterWriterEnabled: ComputedRef<boolean>;
  activeLongAgentProfile: ComputedRef<LongAgentProfile | null>;
  activeLongRuntimeContext: ComputedRef<LongWorkspaceRuntimeContext | null>;
  latestLongLedgerCommit: ComputedRef<LongLedgerCommit | undefined>;
  longRollbackCommit: ComputedRef<LongLedgerCommit | undefined>;
  longRollbackChapterTitle: ComputedRef<string>;
  activeLongAgentRunScope: ComputedRef<string | null>;
  longEditorLocked: ComputedRef<boolean>;
  longEditorLockedReason: ComputedRef<string>;
  editorLocked: ComputedRef<boolean>;
  editorLockedLabel: ComputedRef<string | undefined>;
  editorSaving: ComputedRef<boolean>;
  buildLongLibraryAttachmentsForProfile(
    summary: LongBookSummary,
    snapshot: CatalogSnapshot,
    profile: LongAgentProfile
  ): LibraryAttachmentBuildResult;
  filterLongReadableAttachmentsForProfile(
    attachments: LibraryAttachmentBuildResult,
    profile: LongAgentProfile
  ): LongReadableAttachments;
  buildLongReadableAttachmentsForProfile(
    summary: LongBookSummary,
    snapshot: CatalogSnapshot | null,
    profile: LongAgentProfile
  ): LongReadableAttachments;
  longCatalogContextDocuments(
    summary: LongBookSummary,
    profile: LongAgentProfile
  ): WorkspaceDocument[];
  agentRunScopeHasWriteBarrier(scope: string): boolean;
  agentRunScopeIsBusy(scope: string): boolean;
  agentRunScopeHasPendingEditReview(scope: string): boolean;
  documentHasWriteBarrier(document: WorkspaceDocument): boolean;
  bindWorkflow(port: LongWorkspacePresentationWorkflowPort): void;
  bindEditor(port: LongWorkspacePresentationEditorPort): void;
}

interface ConversationScopeState {
  busy: boolean;
  pendingEditReview: boolean;
}

/**
 * Owns long-workspace display derivations and the shared editor write barrier.
 * Workflow and generic editor sources bind in two phases because they are
 * assembled later in WorkspaceShell. Before binding, their presentation is
 * deliberately conservative and side-effect free.
 */
export function useLongWorkspacePresentationCoordinator(
  options: LongWorkspacePresentationCoordinatorOptions
): LongWorkspacePresentationCoordinator {
  const workflowPort = shallowRef<LongWorkspacePresentationWorkflowPort | null>(
    null
  );
  const editorPort = shallowRef<LongWorkspacePresentationEditorPort | null>(
    null
  );

  function bindWorkflow(port: LongWorkspacePresentationWorkflowPort): void {
    if (workflowPort.value && workflowPort.value !== port) {
      throw new Error("Long workspace presentation workflow port is already bound.");
    }
    workflowPort.value = port;
  }

  function bindEditor(port: LongWorkspacePresentationEditorPort): void {
    if (editorPort.value && editorPort.value !== port) {
      throw new Error("Long workspace presentation editor port is already bound.");
    }
    editorPort.value = port;
  }

  const activeLongRoot = computed(
    () => options.long.selection.value?.root ?? "worldbuilding"
  );

  const chapterPresentation = computed(() => {
    const index = options.long.workspaceIndex.value;
    const byCardId = new Map<
      string,
      LongWorkspaceIndexSnapshot["chapters"][number]
    >();
    for (const chapter of index?.chapters ?? []) {
      byCardId.set(chapter.chapterCardId, chapter);
    }
    return {
      byCardId,
      nextWritableChapterCardId: index
        ? nextWritableLongChapterId(index)
        : undefined
    };
  });

  const chapterTitleByCardId = computed(() => {
    const result = new Map<string, string>();
    for (const chapter of
      options.long.activeBookSummary.value?.navigation.chapterCards ?? []) {
      result.set(chapter.id, chapter.title);
    }
    return result;
  });

  const activeLongChapterWriterEnabled = computed(() => {
    const chapterCardId = options.long.selection.value?.chapterCardId;
    const chapter = chapterCardId
      ? chapterPresentation.value.byCardId.get(chapterCardId)
      : undefined;
    return Boolean(
      activeLongRoot.value === "draft" &&
        chapterCardId &&
        chapter &&
        (chapter.commitId !== null ||
          chapter.bodyStatus === "written" ||
          chapterPresentation.value.nextWritableChapterCardId === chapterCardId)
    );
  });

  const activeLongAgentProfile = computed<LongAgentProfile | null>(() => {
    if (!options.long.activeBookSummary.value) return null;
    const agentId = resolveLongAgentIdForRoot(activeLongRoot.value);
    return (
      options.long.agentSettings.value.agents.find(
        (profile) => profile.id === agentId
      ) ?? getDefaultLongAgentProfile(agentId)
    );
  });

  function buildLongLibraryAttachmentsForProfile(
    summary: LongBookSummary,
    snapshot: CatalogSnapshot,
    profile: LongAgentProfile
  ): LibraryAttachmentBuildResult {
    const skillKinds = new Set(profile.readAccess.skillKinds);
    const materialKinds = new Set(profile.readAccess.materialKinds);
    return buildLibraryAttachments(snapshot, {
      id: summary.id,
      bookType: "long",
      linkedMaterialIdsByKind: {
        character: materialKinds.has("character")
          ? summary.linkedMaterialIdsByKind.character
          : [],
        gimmick: materialKinds.has("gimmick")
          ? summary.linkedMaterialIdsByKind.gimmick
          : [],
        plot: materialKinds.has("plot")
          ? summary.linkedMaterialIdsByKind.plot
          : [],
        draft: materialKinds.has("draft")
          ? summary.linkedMaterialIdsByKind.draft
          : [],
        other: materialKinds.has("other")
          ? summary.linkedMaterialIdsByKind.other
          : []
      },
      linkedSkillIdsByKind: {
        general: skillKinds.has("general")
          ? summary.linkedSkillIdsByKind.general
          : [],
        plot: skillKinds.has("plot")
          ? summary.linkedSkillIdsByKind.plot
          : [],
        style: skillKinds.has("style")
          ? summary.linkedSkillIdsByKind.style
          : [],
        other: skillKinds.has("other")
          ? summary.linkedSkillIdsByKind.other
          : []
      }
    });
  }

  function filterLongReadableAttachmentsForProfile(
    attachments: LibraryAttachmentBuildResult,
    profile: LongAgentProfile
  ): LongReadableAttachments {
    const skillKinds = new Set(profile.readAccess.skillKinds);
    const materialKinds = new Set(profile.readAccess.materialKinds);
    return {
      attachedSkills: attachments.attachedSkills.filter(
        (skill) => skill.kind !== undefined && skillKinds.has(skill.kind)
      ),
      attachedMaterials: attachments.attachedMaterials.filter(
        (material) =>
          material.kind !== undefined && materialKinds.has(material.kind)
      )
    };
  }

  function buildLongReadableAttachmentsForProfile(
    summary: LongBookSummary,
    snapshot: CatalogSnapshot | null,
    profile: LongAgentProfile
  ): LongReadableAttachments {
    if (!snapshot) {
      return {
        attachedSkills: [],
        attachedMaterials: []
      };
    }
    return filterLongReadableAttachmentsForProfile(
      buildLongLibraryAttachmentsForProfile(summary, snapshot, profile),
      profile
    );
  }

  function longCatalogContextDocuments(
    summary: LongBookSummary,
    profile: LongAgentProfile
  ): WorkspaceDocument[] {
    const libraryIds = new Set<string>();
    const materialKinds = new Set(profile.readAccess.materialKinds);
    const skillKinds = new Set(profile.readAccess.skillKinds);
    for (const kind of MATERIAL_KINDS) {
      if (materialKinds.has(kind)) {
        summary.linkedMaterialIdsByKind[kind].forEach((id) =>
          libraryIds.add(id)
        );
      }
    }
    for (const kind of SKILL_KINDS) {
      if (skillKinds.has(kind)) {
        summary.linkedSkillIdsByKind[kind].forEach((id) => libraryIds.add(id));
      }
    }
    // Filtering the source array preserves the context ordering used by
    // previous sends; gathering from per-library buckets would reorder it.
    return options.catalog.documents.value.filter(
      (document) =>
        document.libraryId !== undefined && libraryIds.has(document.libraryId)
    );
  }

  const activeLongRuntimeContext =
    computed<LongWorkspaceRuntimeContext | null>(() => {
      const summary = options.long.activeBookSummary.value;
      const workspaceIndex = options.long.workspaceIndex.value;
      const profile = activeLongAgentProfile.value;
      if (
        !summary ||
        !workspaceIndex ||
        !profile ||
        !options.long.contextReady.value
      ) {
        return null;
      }
      const selection = options.long.selection.value;
      const candidateFileContext = options.long.fileContext.value;
      const fileContext =
        candidateFileContext?.bookId === summary.id &&
        selection?.files.some(
          ({ file }) => file.id === candidateFileContext.fileId
        )
          ? candidateFileContext
          : null;
      return {
        bookId: summary.id,
        title: summary.title,
        activeRoot: activeLongRoot.value,
        activeAgentId: profile.id,
        ...(fileContext
          ? {
              activeFileId: fileContext.fileId,
              activeFileRevision: fileContext.fileRevision
            }
          : {}),
        ...(selection?.chapterCardId
          ? { activeChapterCardId: selection.chapterCardId }
          : {}),
        workspaceRevision: workspaceIndex.revision,
        projectRevision: summary.projectRevision,
        navigation: summary.navigation,
        ...(longAgentAcceptsWorldbuildingDirectory(profile.id)
          ? {
              worldbuildingDirectory:
                buildLongWorldbuildingDirectorySnapshot(
                  workspaceIndex.worldbuilding
                )
            }
          : {})
      };
    });

  const ledgerPresentation = computed(() => {
    const byId = new Map<string, LongLedgerCommit>();
    let latest: LongLedgerCommit | undefined;
    for (const commit of options.long.workspaceIndex.value?.ledger.commits ?? []) {
      byId.set(commit.id, commit);
      if (!latest || commit.sequence > latest.sequence) latest = commit;
    }
    return { byId, latest };
  });

  const latestLongLedgerCommit = computed(
    () => ledgerPresentation.value.latest
  );
  const longRollbackCommit = computed(() => {
    const commitId = options.long.rollbackCommitId.value;
    return commitId ? ledgerPresentation.value.byId.get(commitId) : undefined;
  });
  const longRollbackChapterTitle = computed(() => {
    const chapterId = longRollbackCommit.value?.chapterCardId;
    return (
      (chapterId
        ? chapterTitleByCardId.value.get(chapterId)
        : undefined) ?? "对应章节"
    );
  });

  const conversationStateByScope = computed(() => {
    // Reading both refs is intentional: their Maps retain identity and the
    // store publishes topology changes with triggerRef.
    const controllers = options.conversations.controllers.value;
    const scopesByKey = options.conversations.scopesByKey.value;
    const result = new Map<string, ConversationScopeState>();
    for (const [key, conversation] of controllers) {
      const scope = scopesByKey.get(key);
      if (!scope) continue;
      const previous = result.get(scope);
      result.set(scope, {
        busy: Boolean(previous?.busy || conversation.isBusy.value),
        pendingEditReview: Boolean(
          previous?.pendingEditReview ||
            conversation.hasPendingEditReview.value
        )
      });
    }
    return result;
  });

  function agentRunScopeHasWriteBarrier(scope: string): boolean {
    if (scope === "general") return false;
    const state = conversationStateByScope.value.get(scope);
    return Boolean(state?.busy || state?.pendingEditReview);
  }

  function agentRunScopeIsBusy(scope: string): boolean {
    return conversationStateByScope.value.get(scope)?.busy ?? false;
  }

  function agentRunScopeHasPendingEditReview(scope: string): boolean {
    return (
      conversationStateByScope.value.get(scope)?.pendingEditReview ?? false
    );
  }

  function documentHasWriteBarrier(document: WorkspaceDocument): boolean {
    return agentRunScopeHasWriteBarrier(agentRunScopeForDocument(document));
  }

  const activeLongAgentRunScope = computed(() => {
    const summary = options.long.activeBookSummary.value;
    return summary ? `long:${summary.id}` : null;
  });

  const longEditorLocked = computed(() => {
    const scope = activeLongAgentRunScope.value;
    const workspaceId = scope;
    const proposalItems =
      workflowPort.value?.activeConversationProposalItems.value ?? [];
    return (
      options.long.rollbackPending.value ||
      Boolean(options.long.refreshStatus.value?.pending) ||
      options.long.revisionRequirement.value !== null ||
      options.long.sendPreflightPending.value ||
      options.long.proposalApprovalPending.value ||
      Boolean(
        workspaceId &&
          options.edits.acceptingWorkspaceIds.value.has(workspaceId)
      ) ||
      Boolean(scope && agentRunScopeHasWriteBarrier(scope)) ||
      proposalItems.some(({ status }) => status !== "accepted")
    );
  });

  const longEditorLockedReason = computed(() => {
    if (options.long.rollbackPending.value) {
      return "正在回滚连续性账本并同步最新版本，编辑暂时锁定";
    }
    if (options.long.revisionRequirement.value) {
      return "账本已回滚，正在等待最新版本同步，编辑暂时锁定";
    }
    if (options.long.refreshStatus.value?.pending) {
      return "正在同步长篇工作区最新版本，编辑暂时锁定";
    }
    if (options.long.sendPreflightPending.value) {
      return "正在保存并准备发送，编辑暂时锁定";
    }
    const workspaceId = activeLongAgentRunScope.value;
    if (
      options.long.proposalApprovalPending.value ||
      Boolean(
        workspaceId &&
          options.edits.acceptingWorkspaceIds.value.has(workspaceId)
      )
    ) {
      return "正在应用长篇提案，编辑暂时锁定";
    }
    const scope = activeLongAgentRunScope.value;
    if (scope && agentRunScopeIsBusy(scope)) {
      return "长篇智能体运行中 · 暂停编辑以防止版本冲突";
    }
    return "请先接受或拒绝待审阅变更，再继续编辑";
  });

  const editorLocked = computed(() => {
    const editor = editorPort.value;
    if (!editor) return false;
    const activeDocument = editor.activeDocument.value;
    const activeAgentDocument = editor.activeAgentDocument.value;
    const selectedDocument =
      editor.promptDocumentForResourceId(editor.selectedResourceId.value) ??
      activeDocument;
    return (
      options.edits.acceptingDocumentIds.value.has(activeDocument.id) ||
      options.edits.acceptingWorkspaceIds.value.has(
        agentRunScopeForDocument(activeAgentDocument)
      ) ||
      (activeDocument.workspaceId !== undefined &&
        options.edits.acceptingWorkspaceIds.value.has(
          activeDocument.workspaceId
        )) ||
      documentHasWriteBarrier(selectedDocument)
    );
  });

  const editorLockedLabel = computed(() => {
    const editor = editorPort.value;
    if (!editor) return undefined;
    const activeDocument = editor.activeDocument.value;
    const activeAgentDocument = editor.activeAgentDocument.value;
    if (
      options.edits.acceptingDocumentIds.value.has(activeDocument.id) ||
      options.edits.acceptingWorkspaceIds.value.has(
        agentRunScopeForDocument(activeAgentDocument)
      ) ||
      (activeDocument.workspaceId !== undefined &&
        options.edits.acceptingWorkspaceIds.value.has(activeDocument.workspaceId))
    ) {
      return "正在接受并保存智能体修改";
    }
    return agentRunScopeHasPendingEditReview(
      agentRunScopeForDocument(activeAgentDocument)
    )
      ? "请先接受或拒绝待审阅变更"
      : undefined;
  });

  const editorSaving = computed(() => {
    const activeDocument = editorPort.value?.activeDocument.value;
    return Boolean(
      activeDocument &&
        options.edits.savingDocumentIds.value.has(activeDocument.id)
    );
  });

  return {
    activeLongRoot,
    activeLongChapterWriterEnabled,
    activeLongAgentProfile,
    activeLongRuntimeContext,
    latestLongLedgerCommit,
    longRollbackCommit,
    longRollbackChapterTitle,
    activeLongAgentRunScope,
    longEditorLocked,
    longEditorLockedReason,
    editorLocked,
    editorLockedLabel,
    editorSaving,
    buildLongLibraryAttachmentsForProfile,
    filterLongReadableAttachmentsForProfile,
    buildLongReadableAttachmentsForProfile,
    longCatalogContextDocuments,
    agentRunScopeHasWriteBarrier,
    agentRunScopeIsBusy,
    agentRunScopeHasPendingEditReview,
    documentHasWriteBarrier,
    bindWorkflow,
    bindEditor
  };
}
