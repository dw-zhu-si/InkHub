import { computed, ref, type ComputedRef, type Ref } from "vue";
import type {
  LongChapterReadiness,
  LongWritingScope,
  SystemEventEnvelope
} from "@deepwrite/contracts";

type LongWritingWorkflowEvent = Extract<
  SystemEventEnvelope,
  {
    type:
      | "long.chapter_dispatch_proposal"
      | "long.chapter_write_proposal"
      | "long.continuity_file_proposal"
      | "long.mutation_proposal"
      | "long.ledger_commit_proposal";
  }
>;

export type LongWritingWorkflowPhase =
  | "idle"
  | "checking"
  | "awaiting_writer_approval"
  | "saving"
  | "error"
  | "complete";

type RetryPoint = "check" | "after_write";

export interface LongWritingWorkflowState {
  bookId: string | null;
  scope: LongWritingScope | null;
  chapters: LongChapterReadiness[];
  currentIndex: number;
  phase: LongWritingWorkflowPhase;
  error: string | null;
  retryPoint: RetryPoint | null;
}

export interface LongWritingApprovalExpectation {
  bookId: string;
  chapterCardId: string;
  agentId: "draft" | "continuity_ledger";
  sessionId: string;
  runId?: string;
}

export function canApproveLongWritingProposal(input: {
  active: boolean;
  state: LongWritingWorkflowState;
  currentChapter: LongChapterReadiness | null;
  expectation: LongWritingApprovalExpectation | null;
  event: SystemEventEnvelope;
}): boolean {
  if (!input.active) return true;
  const { state, currentChapter: chapter, expectation, event } = input;
  if (
    event.type !== "long.chapter_write_proposal" &&
    event.type !== "long.continuity_file_proposal" &&
    event.type !== "long.mutation_proposal" &&
    event.type !== "long.ledger_commit_proposal"
  ) {
    return false;
  }
  if (
    !chapter ||
    !expectation ||
    state.bookId !== event.payload.bookId ||
    expectation.bookId !== event.payload.bookId ||
    expectation.chapterCardId !== chapter.chapterCardId ||
    event.payload.agentId !== expectation.agentId ||
    event.payload.sessionId !== expectation.sessionId ||
    (expectation.runId !== undefined &&
      event.payload.runId !== expectation.runId)
  ) {
    return false;
  }
  return (
    state.phase === "awaiting_writer_approval" &&
    expectation.agentId === "draft" &&
    event.type === "long.chapter_write_proposal" &&
    event.payload.file.chapterCardId === chapter.chapterCardId
  );
}

interface LongWritingWorkflowNotifications {
  success(message: string): void;
  info(message: string): void;
  error(message: string): void;
}

export interface LongWritingRunGuard {
  isCurrent(): boolean;
}

export interface UseLongWritingOrchestratorOptions {
  resolveReadiness(
    bookId: string,
    chapterCardId: string
  ): Promise<LongChapterReadiness>;
  startWriter(
    bookId: string,
    readiness: LongChapterReadiness,
    guard: LongWritingRunGuard
  ): Promise<void>;
  /** @deprecated Continuity recording is intentionally outside writing plans. */
  startLedger?(
    bookId: string,
    readiness: LongChapterReadiness,
    guard: LongWritingRunGuard
  ): Promise<void>;
  saveBarrier(bookId: string): Promise<boolean>;
  notifications: LongWritingWorkflowNotifications;
}

export interface LongWritingOrchestrator {
  state: Ref<LongWritingWorkflowState>;
  active: ComputedRef<boolean>;
  currentChapter: ComputedRef<LongChapterReadiness | null>;
  startDispatch(
    event: Extract<
      LongWritingWorkflowEvent,
      { type: "long.chapter_dispatch_proposal" }
    >
  ): Promise<void>;
  handleApplied(event: LongWritingWorkflowEvent): Promise<boolean>;
  handleChapterSaved(bookId: string, chapterCardId: string): Promise<boolean>;
  handleChapterRejected(bookId: string, chapterCardId: string): boolean;
  handleRejected(event: SystemEventEnvelope): boolean;
  handleRunFailure(
    agentId: "draft" | "continuity_ledger",
    error: string
  ): boolean;
  retry(): Promise<void>;
  cancel(): void;
}

const EMPTY_STATE: LongWritingWorkflowState = {
  bookId: null,
  scope: null,
  chapters: [],
  currentIndex: 0,
  phase: "idle",
  error: null,
  retryPoint: null
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useLongWritingOrchestrator(
  options: UseLongWritingOrchestratorOptions
): LongWritingOrchestrator {
  const state = ref<LongWritingWorkflowState>({ ...EMPTY_STATE });
  let epoch = 0;

  const currentChapter = computed(
    () => state.value.chapters[state.value.currentIndex] ?? null
  );
  const active = computed(
    () =>
      state.value.phase !== "idle" &&
      state.value.phase !== "complete"
  );

  function patch(values: Partial<LongWritingWorkflowState>): void {
    state.value = { ...state.value, ...values };
  }

  function fail(error: unknown, retryPoint: RetryPoint): void {
    const message = errorMessage(error, "长篇串行写作编排失败。");
    patch({ phase: "error", error: message, retryPoint });
    options.notifications.error(message);
  }

  function replaceReadiness(readiness: LongChapterReadiness): void {
    const chapters = [...state.value.chapters];
    chapters[state.value.currentIndex] = readiness;
    patch({ chapters });
  }

  function runGuard(runEpoch: number): LongWritingRunGuard {
    return {
      isCurrent: () => runEpoch === epoch
    };
  }

  async function advanceAfterBody(runEpoch: number): Promise<void> {
    if (runEpoch !== epoch) return;
    const nextIndex = state.value.currentIndex + 1;
    if (nextIndex >= state.value.chapters.length) {
      patch({
        currentIndex: nextIndex,
        phase: "complete",
        error: null,
        retryPoint: null
      });
      options.notifications.success("本次长篇串行写作计划已全部完成。");
      return;
    }
    patch({ currentIndex: nextIndex });
    await checkAndStart(runEpoch);
  }

  async function checkAndStart(runEpoch: number): Promise<void> {
    const bookId = state.value.bookId;
    const chapter = currentChapter.value;
    if (!bookId || !chapter || runEpoch !== epoch) return;
    patch({ phase: "checking", error: null, retryPoint: null });
    try {
      const readiness = await options.resolveReadiness(
        bookId,
        chapter.chapterCardId
      );
      if (runEpoch !== epoch) return;
      if (readiness.chapterCardId !== chapter.chapterCardId) {
        throw new Error("章节正文检查返回了错误的章卡。");
      }
      replaceReadiness(readiness);
      if (readiness.status === "ready_to_commit") {
        await advanceAfterBody(runEpoch);
        return;
      }
      patch({
        phase: "awaiting_writer_approval",
        error: null,
        retryPoint: null
      });
      await options.startWriter(bookId, readiness, runGuard(runEpoch));
    } catch (error: unknown) {
      if (
        runEpoch === epoch &&
        state.value.phase === "awaiting_writer_approval" &&
        currentChapter.value?.chapterCardId === chapter.chapterCardId
      ) {
        fail(error, "check");
      }
    }
  }

  async function passWriteBarrier(runEpoch: number): Promise<void> {
    const bookId = state.value.bookId;
    const chapter = currentChapter.value;
    if (!bookId || !chapter || runEpoch !== epoch) return;
    patch({ phase: "saving", error: null, retryPoint: null });
    try {
      if (!(await options.saveBarrier(bookId))) {
        throw new Error(
          "章节正文已经写入，但工作区刷新屏障尚未完成；请重试后再进入连续性结算。"
        );
      }
      if (runEpoch !== epoch) return;
      const readiness = await options.resolveReadiness(
        bookId,
        chapter.chapterCardId
      );
      if (runEpoch !== epoch) return;
      if (readiness.chapterCardId !== chapter.chapterCardId) {
        throw new Error("章节正文保存检查返回了错误的章卡。");
      }
      if (readiness.status !== "ready_to_commit") {
        throw new Error(
          `章节正文保存后仍不完整：${readiness.missingFiles.join("、")}。`
        );
      }
      replaceReadiness(readiness);
      await advanceAfterBody(runEpoch);
    } catch (error: unknown) {
      if (runEpoch === epoch) fail(error, "after_write");
    }
  }

  async function startDispatch(
    event: Extract<
      LongWritingWorkflowEvent,
      { type: "long.chapter_dispatch_proposal" }
    >
  ): Promise<void> {
    if (active.value) {
      throw new Error(
        "已有长篇串行写作计划正在执行，请先完成当前计划。"
      );
    }
    epoch += 1;
    const runEpoch = epoch;
    state.value = {
      bookId: event.payload.bookId,
      scope: event.payload.scope,
      chapters: event.payload.chapters.map((chapter) => ({
        ...chapter,
        missingFiles: [...chapter.missingFiles]
      })),
      currentIndex: 0,
      phase: "checking",
      error: null,
      retryPoint: null
    };
    options.notifications.info(
      `已启动 ${event.payload.chapters.length} 章串行写作计划。`
    );
    await checkAndStart(runEpoch);
  }

  async function handleApplied(
    event: LongWritingWorkflowEvent
  ): Promise<boolean> {
    const bookId = state.value.bookId;
    const chapter = currentChapter.value;
    if (
      !bookId ||
      !chapter ||
      event.payload.bookId !== bookId
    ) {
      return false;
    }
    const runEpoch = epoch;
    if (event.type === "long.ledger_commit_proposal") return false;
    return false;
  }

  async function handleChapterSaved(
    bookId: string,
    chapterCardId: string
  ): Promise<boolean> {
    const chapter = currentChapter.value;
    if (
      !chapter ||
      state.value.bookId !== bookId ||
      state.value.phase !== "awaiting_writer_approval" ||
      chapter.chapterCardId !== chapterCardId
    ) {
      return false;
    }
    await passWriteBarrier(epoch);
    return true;
  }

  function handleChapterRejected(
    bookId: string,
    chapterCardId: string
  ): boolean {
    const chapter = currentChapter.value;
    if (
      !chapter ||
      state.value.bookId !== bookId ||
      state.value.phase !== "awaiting_writer_approval" ||
      chapter.chapterCardId !== chapterCardId
    ) {
      return false;
    }
    fail(
      new Error(
        `已拒绝“${chapter.title}”的正文写入；可修改要求后重试当前章，计划不会跳章。`
      ),
      "check"
    );
    return true;
  }

  async function retry(): Promise<void> {
    if (
      state.value.phase !== "error" ||
      state.value.retryPoint === null
    ) {
      return;
    }
    const runEpoch = epoch;
    if (state.value.retryPoint === "after_write") {
      await passWriteBarrier(runEpoch);
      return;
    }
    await checkAndStart(runEpoch);
  }

  function handleRejected(event: SystemEventEnvelope): boolean {
    void event;
    return false;
  }

  function handleRunFailure(
    agentId: "draft" | "continuity_ledger",
    error: string
  ): boolean {
    const chapter = currentChapter.value;
    if (!chapter) return false;
    if (
      agentId === "draft" &&
      state.value.phase === "awaiting_writer_approval"
    ) {
      fail(
        new Error(
          `“${chapter.title}”写手运行失败：${error}。可重试当前章，计划不会跳章。`
        ),
        "check"
      );
      return true;
    }
    void error;
    return false;
  }

  function cancel(): void {
    epoch += 1;
    state.value = { ...EMPTY_STATE };
  }

  return {
    state,
    active,
    currentChapter,
    startDispatch,
    handleApplied,
    handleChapterSaved,
    handleChapterRejected,
    handleRejected,
    handleRunFailure,
    retry,
    cancel
  };
}
