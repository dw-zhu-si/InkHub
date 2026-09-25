import { describe, expect, it, vi } from "vitest";
import {
  createEnvelope,
  type SessionPromptCommandPayload,
  type SubagentAuthoringRuntimeContext
} from "@deepwrite/contracts";
import { useSubagentAuthoring } from "./useSubagentAuthoring";

const runtime = {
  provider: "deepwrite",
  model: "deepwrite-writing-faux",
  mode: "local-faux" as const
};

const context: SubagentAuthoringRuntimeContext = {
  parentAgentId: "plot_design",
  parentAgentLabel: "剧情设计师",
  outputMode: "handoff",
  skills: [
    {
      id: "skill_1",
      title: "剧情检查",
      libraryTitle: "写作技能库",
      body: "检查人物动机与事件因果。"
    }
  ],
  existingSubagentNames: []
};

describe("useSubagentAuthoring", () => {
  it("stays busy while a model turn waits for and begins a retry", async () => {
    let promptPayload: SessionPromptCommandPayload | undefined;
    const api = {
      session: {
        prompt: vi.fn(async (payload: SessionPromptCommandPayload) => {
          promptPayload = payload;
          return {
            sessionId: payload.sessionId,
            runId: "run_authoring_retry",
            acceptedAt: "2026-07-26T04:00:00.000Z",
            runtime
          };
        }),
        abort: vi.fn()
      }
    };
    const controller = useSubagentAuthoring({
      api: () => api,
      createId: () => "authoring_session_retry"
    });

    await expect(controller.generate(context, "model_a")).resolves.toBe(true);
    const sessionId = promptPayload?.sessionId;
    if (!sessionId) throw new Error("missing authoring session id");

    controller.handleEvent(createEnvelope(
      "agent.turn_started",
      {
        sessionId,
        runId: "run_authoring_retry",
        messageId: "authoring_message_retry",
        turnId: "authoring_turn_retry",
        attempt: 1,
        maxAttempts: 6,
        runtime
      },
      {
        id: "event_authoring_turn_started",
        timestamp: "2026-07-26T04:00:00.000Z",
        context: { sessionId, runId: "run_authoring_retry" }
      }
    ));
    controller.handleEvent(createEnvelope(
      "agent.retry_scheduled",
      {
        sessionId,
        runId: "run_authoring_retry",
        messageId: "authoring_message_retry",
        turnId: "authoring_turn_retry",
        failedAttempt: 1,
        nextAttempt: 2,
        maxAttempts: 6,
        delayMs: 30_000,
        retryAt: "2026-07-26T04:00:30.000Z",
        reason: "连接暂时中断",
        runtime
      },
      {
        id: "event_authoring_retry_scheduled",
        timestamp: "2026-07-26T04:00:01.000Z",
        context: { sessionId, runId: "run_authoring_retry" }
      }
    ));

    expect(controller.status.value).toBe("running");
    expect(controller.isBusy.value).toBe(true);
    expect(controller.statusText.value).toBe("网络波动，30s 后重试（第 1/5 次）");

    controller.handleEvent(createEnvelope(
      "agent.turn_started",
      {
        sessionId,
        runId: "run_authoring_retry",
        messageId: "authoring_message_retry",
        turnId: "authoring_turn_retry",
        attempt: 2,
        maxAttempts: 6,
        runtime
      },
      {
        id: "event_authoring_retry_started",
        timestamp: "2026-07-26T04:00:30.000Z",
        context: { sessionId, runId: "run_authoring_retry" }
      }
    ));

    expect(controller.status.value).toBe("running");
    expect(controller.isBusy.value).toBe(true);
    expect(controller.statusText.value).toBe("正在重试（第 1/5 次）");
  });
});
