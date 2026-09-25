import {
  getDefaultLongAgentProfile,
  longAgentAcceptsWorldbuildingDirectory,
  type LongAgentProfile,
  type LongAgentSettings,
  type LongBookSummary,
  type LongChapterReadiness,
  type LongFileId,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceRuntimeContext,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import { computed, nextTick, type Ref } from "vue";
import type {
  AgentConversationController,
  AgentRunSettings
} from "./useAgentConversation";
import {
  useLongWorkspaceProposals,
  type LongWorkspaceProposalEvent,
  type LongWorkspaceProposalItem
} from "./useLongWorkspaceProposals";
import {
  canApproveLongWritingProposal,
  useLongWritingOrchestrator,
  type LongWritingRunGuard
} from "./useLongWritingOrchestrator";
import type { LongWorkspaceRevisionSyncRequirement } from "../stores/longWorkspaceStore";
import {
  createLongChapterSelection,
  nextWritableLongChapterId,
  type LongWorkspaceRendererApi,
  type LongWorkspaceSelection
} from "../types/longWorkspace";
import type { WorkspaceDocument } from "../types/workspace";
import { matchesLongWritingProposalExpectation } from "../utils/longWritingEventExpectation";
import { buildLongWorldbuildingDirectorySnapshot } from "../utils/longWorldbuildingDirectorySnapshot";

type LongRuntimeAttachments = NonNullable<
  Parameters<AgentConversationController["sendLongMessage"]>[1]
>;

export interface LongWritingWorkflowNotifications {
  error(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

export interface LongWritingWorkflowState {
  activeBookId: Ref<string | null>;
  activeBookSummary: Readonly<Ref<LongBookSummary | null>>;
  workspaceIndex: Ref<LongWorkspaceIndexSnapshot | null>;
  proposalApprovalPending: Ref<boolean>;
  revisionRequirement: Ref<LongWorkspaceRevisionSyncRequirement | null>;
  agentSettings: Readonly<Ref<LongAgentSettings>>;
  agentLoadError: Readonly<Ref<string | null>>;
}

export interface LongWritingConversationRegistry {
  byKey: Map<string, AgentConversationController>;
  getOrCreate(
    key: string,
    scope: string
  ): AgentConversationController;
  remove(
    key: string,
    options?: { clearPersistence?: boolean }
  ): void;
  active(): AgentConversationController | null;
}

export interface LongWritingCatalogPort {
  documentsForProfile(
    summary: LongBookSummary,
    profile: LongAgentProfile
  ): WorkspaceDocument[];
  ensureDocumentsLoaded(
    documents: readonly WorkspaceDocument[]
  ): Promise<boolean>;
  readableAttachments(
    summary: LongBookSummary,
    profile: LongAgentProfile
  ): LongRuntimeAttachments;
}

export interface LongWritingWorkspacePort {
  saveActiveEditorChanges(): Promise<boolean>;
  refreshActiveWorkspace(bookId: string): Promise<boolean>;
  refreshBookList(): Promise<void>;
  synchronizeEditorRevisions(
    workspaceRevision: number,
    projectRevision: number
  ): void;
  selectWorkspaceFile(selection: LongWorkspaceSelection): Promise<boolean>;
}

export interface LongWritingWorkflowCoordinatorContext {
  state: LongWritingWorkflowState;
  api(): LongWorkspaceRendererApi | undefined;
  conversations: LongWritingConversationRegistry;
  catalog: LongWritingCatalogPort;
  workspace: LongWritingWorkspacePort;
  ensureAgentSettingsLoaded(): Promise<boolean>;
  approvalMode(): AgentRunSettings["approvalMode"];
  removeAgentRunPreferences(scope: string): void;
  navigateToAcceptedProposal(
    item: LongWorkspaceProposalItem
  ): Promise<boolean>;
  notifications: LongWritingWorkflowNotifications;
}

interface LongWritingAgentRunExpectation {
  bookId: string;
  chapterCardId: string;
  agentId: "draft" | "continuity_ledger";
  sessionId: string;
  runId?: string;
  proposalSeen: boolean;
  terminalError?: string;
}

/**
 * Owns serial long-writing plans and the proposal/event runtime that advances
 * them. Catalog storage and the generic editor persistence pipeline remain
 * outside behind explicit ports.
 */
export function useLongWritingWorkflowCoordinator(
  context: LongWritingWorkflowCoordinatorContext
) {
  const { state, notifications } = context;
  let runExpectation: LongWritingAgentRunExpectation | null = null;
  let disposed = false;

  const writingOrchestrator = useLongWritingOrchestrator({
    resolveReadiness: resolveLiveChapterReadiness,
    startWriter: startFreshChapterWriter,
    saveBarrier: refreshSaveBarrier,
    notifications
  });

  const workspaceProposals = useLongWorkspaceProposals({
    api: context.api,
    acceptsEvent: acceptsProposalEvent,
    approvalModeForEvent: proposalApprovalMode,
    prepareAutoApprove: prepareAutomaticProposal,
    canFinalizeContinuity: canApproveProposal,
    onContinuityFinalizationFailed: (event, message) => {
      if (!canApproveProposal(event)) return false;
      return writingOrchestrator.handleRunFailure(
        "continuity_ledger",
        `文件已保存，但自动归档失败：${message}`
      );
    },
    onApplied: handleProposalApplied,
    onDispatchApproved: handleChapterDispatchApproved,
    onRejected: (event) => {
      if (!canApproveProposal(event)) return;
      if (event.payload.agentId === "continuity_ledger") {
        writingOrchestrator.handleRejected(event);
      }
    },
    notifications
  });
  const activeProposalItems = computed(() =>
    workspaceProposals.itemsForBook(state.activeBookId.value)
  );
  const activeConversationProposalItems = computed(() => {
    const sessionId = context.conversations.active()?.sessionId.value;
    return activeProposalItems.value.filter(
      (item) => item.event.payload.sessionId === sessionId
    );
  });

  function conversationKey(
    bookId: string,
    agentId: string,
    activeRoot: LongWorkspaceRuntimeContext["activeRoot"],
    chapterCardId?: string
  ): string {
    const conversationRoot = agentId === "setting" ? "setting" : activeRoot;
    const conversationChapterCardId =
      agentId === "plot_design" || agentId === "draft"
        ? undefined
        : chapterCardId;
    return `long:${encodeURIComponent(bookId)}:${agentId}:${conversationRoot}:${encodeURIComponent(
      conversationChapterCardId ?? "__book__"
    )}`;
  }

  function conversationForProposalEvent(
    event:
      | LongWorkspaceProposalEvent
      | Extract<
          SystemEventEnvelope,
          { type: "long.chapter_write_proposal" }
        >
  ): AgentConversationController | undefined {
    const prefix = `long:${encodeURIComponent(event.payload.bookId)}:`;
    for (const [key, conversation] of context.conversations.byKey) {
      if (
        key.startsWith(prefix) &&
        conversation.acceptsRunEvent(
          event.payload.sessionId,
          event.payload.runId
        )
      ) {
        return conversation;
      }
    }
    return undefined;
  }

  function acceptsProposalEvent(event: LongWorkspaceProposalEvent): boolean {
    return !disposed && conversationForProposalEvent(event) !== undefined;
  }

  function proposalApprovalMode(
    event: LongWorkspaceProposalEvent
  ): AgentRunSettings["approvalMode"] | undefined {
    return conversationForProposalEvent(event)?.approvalModeForRun(
      event.payload.sessionId,
      event.payload.runId
    );
  }

  function observeAgentEvent(event: SystemEventEnvelope): void {
    if (disposed) return;
    const expectation = runExpectation;
    if (!expectation) return;
    if (
      event.type !== "long.chapter_write_proposal" &&
      event.type !== "long.ledger_commit_proposal" &&
      event.type !== "agent.message_completed" &&
      event.type !== "agent.error"
    ) {
      return;
    }
    if (event.payload.sessionId !== expectation.sessionId) return;
    const matchesExpectedProposal =
      event.type === "long.chapter_write_proposal" ||
      event.type === "long.ledger_commit_proposal"
        ? matchesLongWritingProposalExpectation(expectation, event)
        : false;
    if (
      (event.type === "long.chapter_write_proposal" ||
        event.type === "long.ledger_commit_proposal") &&
      !matchesExpectedProposal
    ) {
      return;
    }
    if (expectation.runId && expectation.runId !== event.payload.runId) {
      return;
    }
    expectation.runId ??= event.payload.runId;
    if (matchesExpectedProposal) {
      expectation.proposalSeen = true;
      return;
    }
    if (
      event.type !== "agent.message_completed" &&
      event.type !== "agent.error"
    ) {
      return;
    }
    expectation.terminalError =
      event.type === "agent.error"
        ? event.payload.message
        : "智能体运行已结束，但没有形成当前章的待审批提案";
    if (
      !expectation.proposalSeen &&
      writingOrchestrator.state.value.phase === "awaiting_writer_approval"
    ) {
      writingOrchestrator.handleRunFailure(
        expectation.agentId,
        expectation.terminalError
      );
    }
  }

  async function refreshSaveBarrier(bookId: string): Promise<boolean> {
    if (disposed) return false;
    const refreshed = await context.workspace.refreshActiveWorkspace(bookId);
    if (
      !disposed &&
      refreshed &&
      state.activeBookId.value === bookId &&
      state.workspaceIndex.value &&
      state.activeBookSummary.value?.id === bookId
    ) {
      context.workspace.synchronizeEditorRevisions(
        state.workspaceIndex.value.revision,
        state.activeBookSummary.value.projectRevision
      );
    }
    await context.workspace.refreshBookList();
    return !disposed && refreshed;
  }

  async function handleProposalApplied(
    event: Exclude<
      LongWorkspaceProposalEvent,
      { type: "long.chapter_dispatch_proposal" }
    >
  ): Promise<void> {
    if (
      canApproveProposal(event) &&
      event.type === "long.ledger_commit_proposal" &&
      (await writingOrchestrator.handleApplied(event))
    ) {
      return;
    }
    await refreshSaveBarrier(event.payload.bookId);
  }

  async function readDocumentPresence(
    bookId: string,
    fileId: LongFileId
  ): Promise<{
    hasContent: boolean;
    workspaceRevision: number;
    projectRevision: number;
  }> {
    const api = context.api();
    if (!api) {
      throw new Error("当前环境未连接长篇工作区。");
    }
    let offset = 0;
    let workspaceRevision: number | undefined;
    let projectRevision: number | undefined;
    while (true) {
      const page = await api.readDocument({
        bookId,
        fileId,
        offset,
        maxCharacters: 262_144
      });
      if (
        page.bookId !== bookId ||
        page.file.id !== fileId ||
        page.offset !== offset ||
        (workspaceRevision !== undefined &&
          page.workspaceRevision !== workspaceRevision) ||
        (projectRevision !== undefined &&
          page.projectRevision !== projectRevision)
      ) {
        throw new Error("章节正文读取结果与当前章不一致。");
      }
      workspaceRevision ??= page.workspaceRevision;
      projectRevision ??= page.projectRevision;
      if (page.content.trim()) {
        return { hasContent: true, workspaceRevision, projectRevision };
      }
      if (page.nextOffset === null) {
        return { hasContent: false, workspaceRevision, projectRevision };
      }
      if (page.nextOffset <= offset) {
        throw new Error("章节正文分页游标无效。");
      }
      offset = page.nextOffset;
    }
  }

  async function resolveLiveChapterReadiness(
    bookId: string,
    chapterCardId: string
  ): Promise<LongChapterReadiness> {
    if (!(await context.workspace.saveActiveEditorChanges())) {
      throw new Error("当前长篇修改尚未保存，无法重新检查章节正文。");
    }
    if (!(await context.workspace.refreshActiveWorkspace(bookId))) {
      throw new Error("当前长篇工作区尚未完成刷新，无法重新检查章节正文。");
    }
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    if (!summary || !index || summary.id !== bookId) {
      throw new Error("串行写作计划对应的长篇工作区尚未载入。");
    }
    const chapter = index.plot.chapterCards.find(
      ({ id }) => id === chapterCardId
    );
    const files = index.chapters.find(
      (entry) => entry.chapterCardId === chapterCardId
    );
    if (!chapter || !files) {
      throw new Error("串行写作计划中的章卡或正文文件已经不存在。");
    }
    if (files.commitId !== null) {
      throw new Error(`“${chapter.title}”已经提交，不能重复执行写作计划。`);
    }
    const body = await readDocumentPresence(bookId, files.body.id);
    const missingFiles: LongChapterReadiness["missingFiles"] = [];
    if (!body.hasContent) missingFiles.push("body");
    return {
      chapterCardId,
      title: chapter.title,
      status: missingFiles.length === 1 ? "empty" : "ready_to_commit",
      missingFiles
    };
  }

  function workflowRuntimeContext(
    summary: LongBookSummary,
    index: LongWorkspaceIndexSnapshot,
    profile: LongAgentProfile,
    activeRoot: LongWorkspaceRuntimeContext["activeRoot"],
    chapterCardId: string
  ): LongWorkspaceRuntimeContext {
    return {
      bookId: summary.id,
      title: summary.title,
      activeRoot,
      activeAgentId: profile.id,
      activeChapterCardId: chapterCardId,
      workspaceRevision: index.revision,
      projectRevision: summary.projectRevision,
      navigation: summary.navigation,
      ...(longAgentAcceptsWorldbuildingDirectory(profile.id)
        ? {
            worldbuildingDirectory: buildLongWorldbuildingDirectorySnapshot(
              index.worldbuilding
            )
          }
        : {})
    };
  }

  async function startFreshAgentRun(
    input: {
      bookId: string;
      chapterCardId: string;
      agentId: "draft" | "continuity_ledger";
      activeRoot: "draft" | "continuity_ledger";
      prompt: string;
    },
    guard: LongWritingRunGuard
  ): Promise<void> {
    if (disposed || !guard.isCurrent()) return;
    if (!(await context.ensureAgentSettingsLoaded())) {
      if (disposed || !guard.isCurrent()) return;
      throw new Error(
        state.agentLoadError.value ??
          "长篇智能体设置尚未加载，无法启动串行写作。"
      );
    }
    if (disposed || !guard.isCurrent()) return;
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    if (!summary || !index || summary.id !== input.bookId) {
      throw new Error("启动章节智能体前，长篇工作区已经切换。");
    }
    const profile =
      state.agentSettings.value.agents.find(
        ({ id }) => id === input.agentId
      ) ?? getDefaultLongAgentProfile(input.agentId);
    const conversation = context.conversations.getOrCreate(
      conversationKey(
        summary.id,
        input.agentId,
        input.activeRoot,
        input.chapterCardId
      ),
      `long:${summary.id}`
    );
    if (conversation.isBusy.value) {
      throw new Error(
        `${profile.label}的上一轮仍在收尾，请稍后重试当前章；计划不会跳章。`
      );
    }
    if (disposed || !guard.isCurrent()) return;
    const sessionId = conversation.sessionId.value;
    const expectation: LongWritingAgentRunExpectation = {
      bookId: input.bookId,
      chapterCardId: input.chapterCardId,
      agentId: input.agentId,
      sessionId,
      proposalSeen: false
    };
    runExpectation = expectation;
    const abandonExpectation = (): void => {
      if (runExpectation === expectation) runExpectation = null;
    };
    conversation.selectApprovalMode(context.approvalMode());
    conversation.draft.value = input.prompt;
    if (disposed || !guard.isCurrent()) {
      abandonExpectation();
      return;
    }
    try {
      if (
        !(await context.catalog.ensureDocumentsLoaded(
          context.catalog.documentsForProfile(summary, profile)
        ))
      ) {
        throw new Error("长篇绑定资料正文读取失败，写作计划未启动。");
      }
      if (disposed || !guard.isCurrent()) {
        abandonExpectation();
        return;
      }
      await conversation.sendLongMessage(
        workflowRuntimeContext(
          summary,
          index,
          profile,
          input.activeRoot,
          input.chapterCardId
        ),
        context.catalog.readableAttachments(summary, profile)
      );
      if (disposed || !guard.isCurrent()) {
        abandonExpectation();
        return;
      }
      if (conversation.conversationError.value) {
        throw new Error(conversation.conversationError.value);
      }
      if (
        runExpectation === expectation &&
        expectation.terminalError &&
        !expectation.proposalSeen
      ) {
        throw new Error(expectation.terminalError);
      }
    } catch (error: unknown) {
      abandonExpectation();
      throw error;
    }
  }

  async function startFreshChapterWriter(
    bookId: string,
    readiness: LongChapterReadiness,
    guard: LongWritingRunGuard
  ): Promise<void> {
    if (disposed || !guard.isCurrent()) return;
    const summary = state.activeBookSummary.value;
    const index = state.workspaceIndex.value;
    if (!summary || !index || summary.id !== bookId) {
      throw new Error("当前长篇工作区已经切换。");
    }
    const selection = createLongChapterSelection(
      summary,
      index,
      readiness.chapterCardId
    );
    if (!selection) {
      throw new Error("当前长篇修改尚未保存，当前章写作未启动。");
    }
    const selected = await context.workspace.selectWorkspaceFile(selection);
    if (disposed || !guard.isCurrent()) return;
    if (!selected) {
      throw new Error("当前长篇修改尚未保存，当前章写作未启动。");
    }
    const missingLabels = readiness.missingFiles.map((role) =>
      role === "body"
        ? "正文"
        : role === "character_state"
          ? "旧版人物状态候选"
          : "旧版 Handoff 候选"
    );
    await startFreshAgentRun(
      {
        bookId,
        chapterCardId: readiness.chapterCardId,
        agentId: "draft",
        activeRoot: "draft",
        prompt:
          `执行串行写作计划中的《${readiness.title}》。` +
          `当前正文状态为 ${readiness.status}，缺失：${missingLabels.join("、") || "无"}。` +
          "请先读取章卡、可用的前文章节记录、相关设计资料及本章现有正文；只完成本章正文，已有非空正文原则上保持原文，除非用户明确要求修订。" +
          "一张章卡只对应一个独立 Markdown 正文文件，本轮唯一写作产物是当前章小说正文，不得把相邻章节、章节标题、分析过程或写作参数混入正文。章节及空白正文文件已由剧情设计阶段创建，不要在写作阶段重复创建。正文为空时调用 write_chapter_draft 首次写入；已有正文需先用 read_chapter mode=full 完整读取，再按任务使用 write_chapter_draft 或 edit_chapter_draft。必须提交正文 diff 审批卡，未获用户批准前不得声称已经保存。禁止编写、草拟、补全或修改连续性文件；正文保存后直接推进计划，连续性记录由用户之后按需触发。"
      },
      guard
    );
  }

  async function handleChapterDispatchApproved(
    event: Extract<
      LongWorkspaceProposalEvent,
      { type: "long.chapter_dispatch_proposal" }
    >
  ): Promise<void> {
    const summary = state.activeBookSummary.value;
    const workspaceIndex = state.workspaceIndex.value;
    if (
      !summary ||
      !workspaceIndex ||
      summary.id !== event.payload.bookId
    ) {
      throw new Error("该单章调度提案不属于当前活动长篇。");
    }
    if (
      workspaceIndex.revision !== event.payload.workspaceRevision ||
      summary.projectRevision !== event.payload.projectRevision
    ) {
      throw new Error(
        "长篇结构已在提案后更新，请让写手智能体重新选择连续下一章。"
      );
    }
    if (
      nextWritableLongChapterId(workspaceIndex) !==
      event.payload.chapterCardId
    ) {
      throw new Error("串行写作计划不再从连续下一章开始，请重新生成提案。");
    }
    const volumeOrder = new Map(
      workspaceIndex.plot.volumes.map(({ id, order }) => [id, order])
    );
    const orderedChapters = [...workspaceIndex.plot.chapterCards].sort(
      (left, right) =>
        (volumeOrder.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
          (volumeOrder.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
        left.narrativeOrder - right.narrativeOrder ||
        left.id.localeCompare(right.id)
    );
    const firstEmptyIndex = orderedChapters.findIndex((chapter) =>
      workspaceIndex.chapters.some(
        ({ chapterCardId, bodyStatus }) =>
          chapterCardId === chapter.id && bodyStatus === "empty"
      )
    );
    const remaining =
      firstEmptyIndex < 0 ? [] : orderedChapters.slice(firstEmptyIndex);
    const first = remaining[0]!;
    const expected: typeof remaining = [];
    if (event.payload.scope === "arc" && first.primaryArcId === null) {
      throw new Error("连续下一章没有主剧情点，不能启动剧情点写作。");
    }
    for (const chapter of remaining) {
      if (
        expected.length > 0 &&
        (event.payload.scope === "chapter" ||
          chapter.volumeId !== first.volumeId ||
          (event.payload.scope === "arc" &&
            chapter.primaryArcId !== first.primaryArcId))
      ) {
        break;
      }
      expected.push(chapter);
    }
    if (
      expected.length !== event.payload.chapters.length ||
      expected.some(
        ({ id }, index) =>
          event.payload.chapters[index]?.chapterCardId !== id
      )
    ) {
      throw new Error("串行写作章序与当前卷/剧情点不一致，请重新生成提案。");
    }
    await writingOrchestrator.startDispatch(event);
  }

  function blockActivePlan(
    action: string,
    options: {
      targetBookId?: string | null;
      allowPlanBook?: boolean;
    } = {}
  ): boolean {
    if (!writingOrchestrator.active.value) return false;
    const planBookId = writingOrchestrator.state.value.bookId;
    if (
      options.allowPlanBook &&
      options.targetBookId &&
      options.targetBookId === planBookId
    ) {
      return false;
    }
    notifications.warning(
      `当前长篇串行写作计划尚未完成；请先取消计划，再${action}。`
    );
    return true;
  }

  function bookConversationEntries(
    bookId: string
  ): Array<[string, AgentConversationController]> {
    const prefix = `long:${encodeURIComponent(bookId)}:`;
    return [...context.conversations.byKey.entries()].filter(([key]) =>
      key.startsWith(prefix)
    );
  }

  async function stopBookAgentRuns(bookId: string): Promise<void> {
    const entries = bookConversationEntries(bookId);
    for (const [, conversation] of entries) {
      const sessionId = conversation.sessionId.value;
      if (sessionId) {
        workspaceProposals.quarantineSession(bookId, sessionId);
      }
    }
    for (const [, conversation] of entries) {
      if (!conversation.isBusy.value) continue;
      const stopAccepted = await conversation.stopGeneration();
      if (!stopAccepted) {
        throw new Error(
          "长篇智能体正在启动，暂时无法安全移除项目；请稍后重试。"
        );
      }
    }
    workspaceProposals.discardBook(bookId);
  }

  function disposeBookConversations(bookId: string): void {
    for (const [key] of bookConversationEntries(bookId)) {
      context.conversations.remove(key, { clearPersistence: true });
    }
  }

  function disposeBookWorkflowState(bookId: string): void {
    workspaceProposals.discardBook(bookId);
    if (writingOrchestrator.state.value.bookId === bookId) {
      writingOrchestrator.cancel();
    }
    if (runExpectation?.bookId === bookId) runExpectation = null;
    if (state.revisionRequirement.value?.bookId === bookId) {
      state.revisionRequirement.value = null;
    }
    context.removeAgentRunPreferences(`long:${bookId}`);
  }

  function disposeBookRuntime(bookId: string): void {
    disposeBookConversations(bookId);
    disposeBookWorkflowState(bookId);
  }

  async function stopActiveGeneration(): Promise<void> {
    const conversation = context.conversations.active();
    if (!conversation) return;
    try {
      if (await conversation.stopGeneration()) {
        notifications.info("已停止长篇生成。");
      }
    } catch (error: unknown) {
      notifications.error(
        error instanceof Error
          ? error.message
          : "停止长篇生成失败，请稍后重试。"
      );
    }
  }

  async function cancelWorkflow(): Promise<void> {
    const expectation = runExpectation;
    if (expectation) {
      workspaceProposals.quarantineSession(
        expectation.bookId,
        expectation.sessionId
      );
    }
    runExpectation = null;
    writingOrchestrator.cancel();
    if (expectation) {
      const activeRoot =
        expectation.agentId === "draft"
          ? "draft"
          : "continuity_ledger";
      const conversation = context.conversations.byKey.get(
        conversationKey(
          expectation.bookId,
          expectation.agentId,
          activeRoot,
          expectation.chapterCardId
        )
      );
      if (
        conversation &&
        conversation.sessionId.value === expectation.sessionId
      ) {
        const canceledPending = conversation.cancelPendingGeneration();
        const stopPromise =
          !canceledPending && conversation.isBusy.value
            ? conversation.stopGeneration()
            : Promise.resolve(false);
        try {
          await stopPromise;
        } catch (error: unknown) {
          notifications.warning(
            error instanceof Error
              ? `写作计划已取消；停止后台生成时出现提示：${error.message}`
              : "写作计划已取消；后台生成可能仍在收尾。"
          );
          return;
        }
      }
    }
    notifications.info("已取消长篇串行写作计划。");
  }

  function canApproveProposal(event: LongWorkspaceProposalEvent): boolean {
    return canApproveLongWritingProposal({
      active: writingOrchestrator.active.value,
      state: writingOrchestrator.state.value,
      currentChapter: writingOrchestrator.currentChapter.value,
      expectation: runExpectation,
      event
    });
  }

  async function prepareAutomaticProposal(
    event: LongWorkspaceProposalEvent
  ): Promise<void> {
    if (!canApproveProposal(event)) {
      throw new Error(
        "长篇串行写作阶段已变化，实时自动保存已暂停；请核对当前章后重试。"
      );
    }
    if (state.activeBookId.value !== event.payload.bookId) return;
    await nextTick();
    if (!(await context.workspace.saveActiveEditorChanges())) {
      throw new Error(
        "当前长篇编辑内容尚未保存，智能体提案未自动覆盖；请处理编辑器保存状态后重试。"
      );
    }
    if (!canApproveProposal(event)) {
      throw new Error(
        "长篇串行写作阶段已在保存检查期间变化，实时自动保存已暂停。"
      );
    }
  }

  async function approveProposal(eventId: string): Promise<void> {
    const bookId = state.activeBookId.value;
    if (!bookId || state.proposalApprovalPending.value) return;
    const item = workspaceProposals
      .itemsForBook(bookId)
      .find(({ event }) => event.id === eventId);
    if (!item) return;
    const wasPlanBound = writingOrchestrator.active.value;
    if (!canApproveProposal(item.event)) {
      notifications.warning(
        "长篇串行写作计划执行中，只能审批当前章当前阶段的提案；请先处理当前章或取消计划。"
      );
      return;
    }
    state.proposalApprovalPending.value = true;
    try {
      await nextTick();
      if (!(await context.workspace.saveActiveEditorChanges())) return;
      if (state.activeBookId.value !== bookId) {
        notifications.info("活动长篇已切换，本次审批已取消。");
        return;
      }
      if (wasPlanBound && !writingOrchestrator.active.value) {
        notifications.info("串行写作计划已取消，本次审批未执行。");
        return;
      }
      const currentItem = workspaceProposals
        .itemsForBook(bookId)
        .find(({ event }) => event.id === eventId);
      if (!currentItem) return;
      if (!canApproveProposal(currentItem.event)) {
        notifications.warning(
          "串行写作阶段已变化，本次审批已取消；请核对当前章后重试。"
        );
        return;
      }
      await workspaceProposals.approve(bookId, eventId);
    } finally {
      state.proposalApprovalPending.value = false;
    }
  }

  function rejectProposal(eventId: string): void {
    const bookId = state.activeBookId.value;
    if (!bookId) return;
    const item = workspaceProposals
      .itemsForBook(bookId)
      .find(({ event }) => event.id === eventId);
    const quarantineContinuitySession = Boolean(
      item &&
        item.event.payload.agentId === "continuity_ledger" &&
        canApproveProposal(item.event)
    );
    if (workspaceProposals.reject(bookId, eventId)) {
      if (quarantineContinuitySession && item) {
        workspaceProposals.quarantineSession(
          bookId,
          item.event.payload.sessionId
        );
      }
      notifications.info("已拒绝该长篇提案，未写入任何文件。");
    }
  }

  function retryProposalPreview(eventId: string): void {
    const bookId = state.activeBookId.value;
    if (!bookId) return;
    void workspaceProposals.retryPreview(bookId, eventId);
  }

  async function locateAcceptedProposal(eventId: string): Promise<void> {
    const bookId = state.activeBookId.value;
    if (!bookId) return;
    const item = workspaceProposals
      .itemsForBook(bookId)
      .find(({ event }) => event.id === eventId);
    if (!item || item.status !== "accepted") return;
    if (!(await context.navigateToAcceptedProposal(item))) {
      notifications.warning("目标文件或所属条目已不存在，无法跳转。");
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    runExpectation = null;
    writingOrchestrator.cancel();
  }

  return {
    writingOrchestrator,
    workspaceProposals,
    activeProposalItems,
    activeConversationProposalItems,
    conversationKey,
    conversationForProposalEvent,
    observeAgentEvent,
    refreshSaveBarrier,
    blockActivePlan,
    stopBookAgentRuns,
    disposeBookWorkflowState,
    disposeBookConversations,
    disposeBookRuntime,
    stopActiveGeneration,
    cancelWorkflow,
    canApproveProposal,
    approveProposal,
    rejectProposal,
    retryProposalPreview,
    locateAcceptedProposal,
    dispose
  };
}
