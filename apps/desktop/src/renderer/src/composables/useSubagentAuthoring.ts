import {
  SubagentAuthoringDraftSchema,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";
import { computed, ref, type Ref } from "vue";

type SessionApi = {
  prompt: (payload: {
    sessionId: string;
    message: string;
    modelId?: string;
    workspaceContext?: { subagentAuthoring: SubagentAuthoringRuntimeContext };
  }) => Promise<{ sessionId: string; runId: string }>;
  abort: (payload: { sessionId: string; runId: string }) => Promise<unknown>;
};

export type SubagentAuthoringRunStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "completed"
  | "error";

export interface UseSubagentAuthoringOptions {
  api: () => { session: SessionApi } | undefined;
  createId?: (prefix: string) => string;
}

export interface SubagentAuthoringController {
  draft: Ref<SubagentAuthoringDraft | null>;
  status: Ref<SubagentAuthoringRunStatus>;
  error: Ref<string | null>;
  statusText: Ref<string | null>;
  isBusy: Ref<boolean>;
  generate: (
    context: SubagentAuthoringRuntimeContext,
    modelId: string
  ) => Promise<boolean>;
  stop: () => Promise<void>;
  reset: () => void;
  handleEvent: (event: SystemEventEnvelope) => void;
}

function fallbackId(prefix: string): string {
  return createId(prefix);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

export function useSubagentAuthoring(
  options: UseSubagentAuthoringOptions
): SubagentAuthoringController {
  const makeId = options.createId ?? fallbackId;
  const sessionId = ref(makeId("subagent_authoring_session"));
  const draft = ref<SubagentAuthoringDraft | null>(null);
  const status = ref<SubagentAuthoringRunStatus>("idle");
  const error = ref<string | null>(null);
  const statusText = ref<string | null>(null);
  const activeRunId = ref<string | null>(null);
  const observedRunId = ref<string | null>(null);
  let stopRequested = false;

  const isBusy = computed(
    () =>
      status.value === "starting" ||
      status.value === "running" ||
      status.value === "stopping"
  );

  function reset(): void {
    if (isBusy.value) return;
    sessionId.value = makeId("subagent_authoring_session");
    draft.value = null;
    status.value = "idle";
    error.value = null;
    statusText.value = null;
    activeRunId.value = null;
    observedRunId.value = null;
    stopRequested = false;
  }

  function bindRun(runId: string): boolean {
    if (activeRunId.value && activeRunId.value !== runId) return false;
    if (observedRunId.value && observedRunId.value !== runId) return false;
    observedRunId.value = runId;
    activeRunId.value = runId;
    if (!stopRequested) status.value = "running";
    return true;
  }

  async function generate(
    context: SubagentAuthoringRuntimeContext,
    modelId: string
  ): Promise<boolean> {
    const api = options.api();
    if (!api) {
      error.value = "当前环境无法调用智能体。";
      status.value = "error";
      return false;
    }
    if (isBusy.value) {
      error.value = "生成进行中，请先停止或等待完成。";
      return false;
    }
    if (!modelId.trim()) {
      error.value = "请先在模型配置中添加可用模型。";
      status.value = "error";
      return false;
    }

    sessionId.value = makeId("subagent_authoring_session");
    draft.value = null;
    error.value = null;
    statusText.value = "正在根据技能生成子智能体草稿…";
    status.value = "starting";
    activeRunId.value = null;
    observedRunId.value = null;
    stopRequested = false;

    const modeLabel =
      context.outputMode === "write" ? "直接写入文档" : "只交回结论";
    const skillTitles = context.skills
      .map((skill) => `${skill.libraryTitle} · ${skill.title}`)
      .join("、");
    const message = [
      `请根据已选定的技能，为「${context.parentAgentLabel}」生成一个子智能体草稿。`,
      `产出方式（用户已确认）：${modeLabel}。`,
      `选定技能：${skillTitles}。`,
      "请先读取技能正文，再调用 write_subagent_draft 提交名称、能力说明和系统提示词。"
    ].join("\n");

    try {
      const accepted = await api.session.prompt({
        sessionId: sessionId.value,
        message,
        modelId,
        workspaceContext: { subagentAuthoring: context }
      });
      if (stopRequested) {
        status.value = "idle";
        statusText.value = null;
        return false;
      }
      bindRun(accepted.runId);
      return true;
    } catch (cause: unknown) {
      status.value = "error";
      error.value = errorMessage(cause, "生成子智能体草稿失败。");
      statusText.value = null;
      return false;
    }
  }

  async function stop(): Promise<void> {
    const api = options.api();
    if (!api || !activeRunId.value || !isBusy.value) return;
    stopRequested = true;
    status.value = "stopping";
    statusText.value = "正在停止…";
    try {
      await api.session.abort({
        sessionId: sessionId.value,
        runId: activeRunId.value
      });
    } catch (cause: unknown) {
      error.value = errorMessage(cause, "停止生成失败。");
      status.value = "error";
      statusText.value = null;
    }
  }

  function handleEvent(event: SystemEventEnvelope): void {
    if (
      event.type !== "agent.turn_started" &&
      event.type !== "agent.retry_scheduled" &&
      event.type !== "agent.message_delta" &&
      event.type !== "agent.message_completed" &&
      event.type !== "agent.error" &&
      event.type !== "tool.call_requested" &&
      event.type !== "tool.execution_completed" &&
      event.type !== "subagent_authoring.draft_updated"
    ) {
      return;
    }
    if (event.payload.sessionId !== sessionId.value) return;
    if (!bindRun(event.payload.runId)) return;

    if (event.type === "agent.retry_scheduled") {
      const retryNumber = Math.max(1, event.payload.nextAttempt - 1);
      const maxRetries = Math.max(1, event.payload.maxAttempts - 1);
      statusText.value = `网络波动，${Math.ceil(event.payload.delayMs / 1_000)}s 后重试（第 ${retryNumber}/${maxRetries} 次）`;
      return;
    }

    if (event.type === "agent.turn_started") {
      if (event.payload.attempt > 1) {
        const retryNumber = event.payload.attempt - 1;
        const maxRetries = Math.max(1, event.payload.maxAttempts - 1);
        statusText.value = `正在重试（第 ${retryNumber}/${maxRetries} 次）`;
      }
      return;
    }

    if (event.type === "subagent_authoring.draft_updated") {
      const parsed = SubagentAuthoringDraftSchema.safeParse(event.payload.draft);
      if (parsed.success) {
        draft.value = parsed.data;
        statusText.value = "草稿已更新，可确认加入团队或继续等待生成完成。";
      }
      return;
    }

    if (event.type === "tool.call_requested") {
      statusText.value = `正在调用 ${event.payload.toolName}…`;
      return;
    }

    if (event.type === "agent.message_completed") {
      status.value = draft.value ? "completed" : "error";
      if (!draft.value) {
        error.value = "生成已结束，但未收到子智能体草稿。请重试。";
        statusText.value = null;
      } else {
        statusText.value = "草稿已就绪，确认后加入当前主智能体团队。";
      }
      activeRunId.value = null;
      return;
    }

    if (event.type === "agent.error") {
      status.value = "error";
      error.value = event.payload.message || "生成子智能体草稿失败。";
      statusText.value = null;
      activeRunId.value = null;
    }
  }

  return {
    draft,
    status,
    error,
    statusText,
    isBusy,
    generate,
    stop,
    reset,
    handleEvent
  };
}
