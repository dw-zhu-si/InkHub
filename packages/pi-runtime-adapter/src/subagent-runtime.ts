import { randomBytes } from "node:crypto";
import {
  Agent,
  type AfterToolCallContext,
  type AfterToolCallResult,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type AgentToolResult,
  type BeforeToolCallContext,
  type BeforeToolCallResult,
  type StreamFn,
  type ThinkingLevel as PiThinkingLevel
} from "@earendil-works/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  type Model,
  type Usage,
  type UserMessage
} from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import {
  type AgentRuntimeRef,
  type AgentUsage,
  type AgentUsageObservationStatus,
  type AgentProviderRuntimeConfig,
  type ShortAgentSubagentDefinition
} from "@deepwrite/contracts";
import {
  runAgentWithTurnRetries,
  type AgentTurnAttempt,
  type AgentTurnRetrySchedule,
  type AgentTurnRetryPolicyOptions
} from "./agent-turn-retry";
import { sanitizeToolSchemaForGemini } from "./short-agent-tools";

const SUBAGENT_SUMMARY_MAX_LENGTH = 20_000;
export const DEFAULT_SUBAGENT_TIMEOUT_MS = 10 * 60_000;

export interface AgentToolExecutionHooks {
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal
  ) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal
  ) => Promise<AfterToolCallResult | undefined>;
}

export type SubagentProjectedActivity =
  | ({ type: "turn_started" } & AgentTurnAttempt)
  | ({ type: "retry_scheduled" } & AgentTurnRetrySchedule)
  | { type: "thinking_delta"; delta: string }
  | { type: "message_delta"; delta: string }
  | {
      type: "tool_requested";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_completed";
      toolCallId: string;
      toolName: string;
      resultSummary: string;
      isError: boolean;
    };

interface SubagentProgressBase {
  parentToolCallId: string;
  subagentRunId: string;
  subagentId: string;
  name: string;
  /**
   * The child can use a custom model different from its parent. Older progress
   * payloads do not contain this field, so projection retains a parent-runtime
   * fallback for backward compatibility.
   */
  runtime?: AgentRuntimeRef;
}

export type SubagentToolProgress =
  | (SubagentProgressBase & {
      type: "started";
      task: string;
    })
  | (SubagentProgressBase & {
      type: "activity";
      activity: SubagentProjectedActivity;
    })
  | (SubagentProgressBase & {
      type: "completed";
      status: "completed" | "error" | "aborted";
      summary: string;
      errorMessage?: string;
      usage?: AgentUsage;
    })
  | (SubagentProgressBase & {
      type: "usage_observed";
      observationId: string;
      observedAt: string;
      messageId: string;
      turnId: string;
      attempt: number;
      status: AgentUsageObservationStatus;
      hadToolCall: boolean;
      usage: AgentUsage;
      runtime: AgentRuntimeRef;
    })
  | (SubagentProgressBase & {
      type: "child_tool_details";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    });

export type SubagentToolDetails =
  | { kind: "subagent-progress"; progress: SubagentToolProgress }
  | { kind: "subagent-result" };

export function isSubagentToolProgressDetails(
  value: unknown
): value is Extract<SubagentToolDetails, { kind: "subagent-progress" }> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "subagent-progress" &&
    "progress" in value
  );
}

export interface BuildSpawnSubagentToolInput {
  parentSessionId: string;
  /** Runtime attribution inherited by children using `modelMode: inherit`. */
  parentRuntime?: AgentRuntimeRef;
  model: Model<Api>;
  thinkingLevel: PiThinkingLevel;
  streamFn: StreamFn;
  definitions: readonly ShortAgentSubagentDefinition[];
  /** Runtime-owned requirements appended after the editable child role prompt. */
  systemPromptRequirements?: string;
  /**
   * Resolved provider configs keyed by model config id, for subagents with
   * `modelMode: "custom"`.
   */
  subagentRuntimeConfigs?: Readonly<Record<string, AgentProviderRuntimeConfig>>;
  /**
   * Builds a child model + stream from a custom runtime config. Required when
   * any enabled definition uses `modelMode: "custom"`.
   */
  buildCustomModelRuntime?: (
    config: AgentProviderRuntimeConfig,
    options?: {
      thinkingLevel?: ShortAgentSubagentDefinition["thinkingLevel"];
      temperature?: ShortAgentSubagentDefinition["temperature"];
    }
  ) => {
    model: Model<Api>;
    streamFn: StreamFn;
    thinkingLevel: PiThinkingLevel;
  };
  buildChildTools: () => AgentTool[];
  toolExecutionHooks?: AgentToolExecutionHooks;
  retryPolicy?: AgentTurnRetryPolicyOptions;
  timeoutMs?: number;
  depth?: number;
  createRunId?: () => string;
}

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: "text", text }], details };
}

function namespaceChildToolCallId(subagentRunId: string, toolCallId: string): string {
  return `${subagentRunId}:${toolCallId}`;
}

function readAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

function normalizeUsage(usage: Usage | undefined): AgentUsage | undefined {
  if (!usage) return undefined;
  const values = [
    usage.input,
    usage.output,
    usage.cacheRead,
    usage.cacheWrite,
    usage.totalTokens
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return undefined;
  }
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    totalTokens: usage.totalTokens
  };
}

function runtimeFromConfig(
  config: AgentProviderRuntimeConfig
): AgentRuntimeRef {
  return {
    provider: config.provider,
    model: config.modelId,
    mode: "provider",
    configId: config.id
  };
}

function runtimeFromModel(model: Model<Api>): AgentRuntimeRef {
  return {
    provider: model.provider,
    model: model.id,
    mode: "provider"
  };
}

function usageObservationStatus(
  message: AssistantMessage
): AgentUsageObservationStatus {
  if (message.stopReason === "aborted") return "aborted";
  if (message.stopReason === "error" || message.errorMessage) return "error";
  return "completed";
}

function summarizeToolResult(result: unknown): string {
  if (typeof result === "object" && result !== null && "content" in result) {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (item): item is { type: "text"; text: string } =>
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            item.type === "text" &&
            "text" in item &&
            typeof item.text === "string"
        )
        .map((item) => item.text)
        .join("\n");
      if (text) return text.slice(0, 4_000);
    }
  }
  if (result === undefined || result === null) return "工具执行完成。";
  try {
    return (JSON.stringify(result) || "工具执行完成。").slice(0, 4_000);
  } catch {
    return "工具已执行完成。";
  }
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return typeof message === "object" && message !== null && message.role === "assistant";
}

/**
 * Child agents keep their own role prompt (no parent prompt inheritance). The
 * appended block states only runtime facts the child cannot observe on its own
 * — fresh context, no recursion, the live tool list, and how its final reply is
 * consumed. Whether the child should write through tools or hand information
 * back to the parent is left entirely to `definition.systemPrompt`.
 */
export function buildSubagentSystemPrompt(
  definition: ShortAgentSubagentDefinition,
  childTools: readonly AgentTool[],
  systemPromptRequirements?: string
): string {
  const toolLines = childTools.map((tool) => {
    const label = "label" in tool && typeof tool.label === "string" && tool.label.trim()
      ? tool.label.trim()
      : tool.name;
    return `- ${tool.name}（${label}）`;
  });
  return [
    definition.systemPrompt.trim(),
    ...(systemPromptRequirements?.trim()
      ? [
          "",
          "【本轮不可编辑的写作约束】",
          systemPromptRequirements.trim()
        ]
      : []),
    "",
    `【当前子智能体：${definition.name} / ${definition.id}】`,
    "【本轮运行事实】",
    "你由当前主智能体为一个明确子任务临时创建。本次运行使用全新上下文，不继承主对话历史。",
    "你不能创建或调用其它子智能体。",
    ...(toolLines.length > 0
      ? [
          "本轮可用工具：",
          ...toolLines,
          "没有出现在上面清单里的能力本轮不可用，不得声称已经执行。"
        ]
      : ["本轮没有可用工具，只能返回文字结论。"]),
    `你的最终回复会原样返回给主智能体，并计入主智能体的上下文（超过 ${SUBAGENT_SUMMARY_MAX_LENGTH} 字会被截断）。只写主智能体真正需要的信息，不要整段粘贴文件原文。`
  ].join("\n");
}

/**
 * Builds the sole delegation capability exposed to a parent short-workspace
 * agent. Every invocation creates a fresh, uncached Agent instance.
 */
export function buildSpawnSubagentTool(
  input: BuildSpawnSubagentToolInput
): AgentTool | undefined {
  const definitions = input.definitions.filter((definition) => definition.enabled);
  if (definitions.length === 0 || (input.depth ?? 0) > 0) return undefined;

  const parameters = Type.Object({
    subagent_id: Type.Union(
      definitions.map((definition) => Type.Literal(definition.id))
    ),
    task: Type.String({ minLength: 1, maxLength: 20_000 })
  });

  const tool: AgentTool<typeof parameters, SubagentToolDetails> = {
    name: "spawn_subagent",
    label: "调用子智能体",
    description: [
      "调用一个预先配置的子智能体完成明确、边界清晰的子任务。调用会阻塞到子智能体完成，并只返回最终交接摘要。",
      "可用子智能体：",
      ...definitions.map(
        (definition) => `- ${definition.name} (${definition.id})：${definition.description}`
      )
    ].join("\n"),
    parameters: sanitizeToolSchemaForGemini(parameters) as typeof parameters,
    executionMode: "sequential",
    execute: async (
      parentToolCallId: string,
      params: Static<typeof parameters>,
      signal?: AbortSignal,
      onUpdate?: (partialResult: AgentToolResult<SubagentToolDetails>) => void
    ): Promise<AgentToolResult<SubagentToolDetails>> => {
      if ((input.depth ?? 0) !== 0) {
        throw new Error("子智能体不允许递归调用 spawn_subagent。");
      }
      const subagentId = String(params.subagent_id ?? "");
      const definition = definitions.find((candidate) => candidate.id === subagentId);
      if (!definition) {
        throw new Error(`未知或已停用的子智能体：${subagentId}`);
      }
      const task = String(params.task ?? "").trim();
      if (!task) throw new Error("子智能体任务不能为空。");

      const subagentRunId = input.createRunId?.() ?? `subrun_${randomBytes(4).toString("hex")}`;
      const configuredChildModelId = definition.modelMode === "custom"
        ? definition.modelId?.trim()
        : undefined;
      const configuredChildRuntime = configuredChildModelId
        ? input.subagentRuntimeConfigs?.[configuredChildModelId]
        : undefined;
      const childRuntime = configuredChildRuntime
        ? runtimeFromConfig(configuredChildRuntime)
        : input.parentRuntime ?? runtimeFromModel(input.model);
      const progressBase: SubagentProgressBase = {
        parentToolCallId,
        subagentRunId,
        subagentId: definition.id,
        name: definition.name,
        runtime: childRuntime
      };
      const emitProgress = (progress: SubagentToolProgress, text: string): void => {
        onUpdate?.(textResult(text, { kind: "subagent-progress", progress }));
      };

      emitProgress(
        { ...progressBase, type: "started", task },
        `子智能体「${definition.name}」已开始执行。`
      );

      let child: Agent;
      try {
        let childModel = input.model;
        let childStreamFn = input.streamFn;
        let childThinkingLevel = input.thinkingLevel;
        if (definition.modelMode === "custom") {
          const modelId = definition.modelId?.trim();
          if (!modelId) {
            throw new Error(`子智能体「${definition.name}」未配置模型。`);
          }
          const runtimeConfig = input.subagentRuntimeConfigs?.[modelId];
          if (!runtimeConfig) {
            throw new Error(
              `子智能体「${definition.name}」配置的模型不可用，请重新保存智能体团队或刷新模型配置。`
            );
          }
          if (!input.buildCustomModelRuntime) {
            throw new Error("当前运行时不支持子智能体单独配置模型。");
          }
          const customRuntime = input.buildCustomModelRuntime(runtimeConfig, {
            ...(definition.thinkingLevel !== undefined
              ? { thinkingLevel: definition.thinkingLevel }
              : {}),
            ...(definition.temperature !== undefined
              ? { temperature: definition.temperature }
              : {})
          });
          childModel = customRuntime.model;
          childStreamFn = customRuntime.streamFn;
          childThinkingLevel = customRuntime.thinkingLevel;
        }
        const childTools = input.buildChildTools().filter(
          (tool) => tool.name !== "load_skill" && tool.name !== "spawn_subagent"
        );
        const childStreamWithoutProviderRetries: StreamFn = (
          requestModel,
          context,
          options
        ) => childStreamFn(requestModel, context, {
          ...options,
          // The visible turn coordinator owns the complete retry budget. Keep
          // provider SDK retries disabled for inherited and custom child models
          // as well, otherwise one child attempt can fan out into 2+ requests.
          maxRetries: 0
        });
        child = new Agent({
          initialState: {
            systemPrompt: buildSubagentSystemPrompt(
              definition,
              childTools,
              input.systemPromptRequirements
            ),
            model: childModel,
            thinkingLevel: childThinkingLevel,
            messages: [],
            // buildChildTools() creates fresh read evidence while closing over the
            // same parent-run mutation/revision overlay.
            tools: childTools
          },
          streamFn: childStreamWithoutProviderRetries,
          sessionId: `${input.parentSessionId}:${subagentRunId}`,
          toolExecution: "sequential",
          ...input.toolExecutionHooks
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "子智能体初始化失败。";
        const summary = `子智能体执行失败：${errorMessage}`.slice(
          0,
          SUBAGENT_SUMMARY_MAX_LENGTH
        );
        emitProgress(
          {
            ...progressBase,
            type: "completed",
            status: "error",
            summary,
            errorMessage: errorMessage.slice(0, 4_000)
          },
          summary
        );
        return textResult(summary, { kind: "subagent-result" });
      }

      let terminalMessage: AssistantMessage | undefined;
      let terminalError: string | undefined;
      let terminalAborted = false;
      const handleChildEvent = (event: AgentEvent): void => {
        if (event.type === "message_update" && isAssistantMessage(event.message)) {
          if (event.assistantMessageEvent.type === "thinking_delta") {
            emitProgress(
              {
                ...progressBase,
                type: "activity",
                activity: {
                  type: "thinking_delta",
                  delta: event.assistantMessageEvent.delta
                }
              },
              "子智能体正在思考。"
            );
          } else if (event.assistantMessageEvent.type === "text_delta") {
            emitProgress(
              {
                ...progressBase,
                type: "activity",
                activity: {
                  type: "message_delta",
                  delta: event.assistantMessageEvent.delta
                }
              },
              "子智能体正在输出交接摘要。"
            );
          }
          return;
        }

        if (event.type === "tool_execution_start") {
          emitProgress(
            {
              ...progressBase,
              type: "activity",
              activity: {
                type: "tool_requested",
                toolCallId: namespaceChildToolCallId(subagentRunId, event.toolCallId),
                toolName: event.toolName,
                args: event.args
              }
            },
            `子智能体正在调用 ${event.toolName}。`
          );
          return;
        }

        if (event.type === "tool_execution_end") {
          const toolCallId = namespaceChildToolCallId(subagentRunId, event.toolCallId);
          emitProgress(
            {
              ...progressBase,
              type: "activity",
              activity: {
                type: "tool_completed",
                toolCallId,
                toolName: event.toolName,
                resultSummary: summarizeToolResult(event.result),
                isError: event.isError
              }
            },
            `子智能体已完成 ${event.toolName}。`
          );
          emitProgress(
            {
              ...progressBase,
              type: "child_tool_details",
              toolCallId,
              toolName: event.toolName,
              result: event.result,
              isError: event.isError
            },
            `子智能体工具 ${event.toolName} 的业务结果已同步。`
          );
          return;
        }

        if (event.type === "message_end" && isAssistantMessage(event.message)) {
          if (event.message.stopReason === "aborted") {
            terminalAborted = true;
            terminalError = event.message.errorMessage || "子智能体运行已中止。";
          } else if (event.message.stopReason === "error" || event.message.errorMessage) {
            terminalError = event.message.errorMessage || "子智能体模型返回错误终态。";
          } else if (!event.message.content.some((item) => item.type === "toolCall")) {
            terminalMessage = event.message;
          }
        }
      };

      type PromptOutcome =
        | { kind: "completed" }
        | { kind: "failed"; error: unknown }
        | { kind: "aborted" }
        | { kind: "timeout" };
      let resolveEarly: ((outcome: PromptOutcome) => void) | undefined;
      let cancellationRequested = signal?.aborted === true;
      const lifecycleController = new AbortController();
      const abortChild = (): void => {
        cancellationRequested = true;
        lifecycleController.abort();
        child.abort();
        resolveEarly?.({ kind: "aborted" });
      };
      if (!cancellationRequested) {
        signal?.addEventListener("abort", abortChild, { once: true });
      }

      let status: "completed" | "error" | "aborted" = "completed";
      let errorMessage: string | undefined;
      let summary = "";
      let timedOut = false;
      let timeout: NodeJS.Timeout | undefined;
      const timeoutMs =
        input.timeoutMs !== undefined &&
        Number.isFinite(input.timeoutMs) &&
        input.timeoutMs > 0
          ? input.timeoutMs
          : DEFAULT_SUBAGENT_TIMEOUT_MS;
      try {
        if (cancellationRequested) {
          status = "aborted";
          errorMessage = "子智能体运行已中止。";
        } else {
          const early = new Promise<PromptOutcome>((resolve) => {
            resolveEarly = resolve;
          });
          timeout = setTimeout(() => {
            timedOut = true;
            lifecycleController.abort();
            child.abort();
            resolveEarly?.({ kind: "timeout" });
          }, timeoutMs);
          timeout.unref();
          const prompt: Promise<PromptOutcome> = runAgentWithTurnRetries({
            agent: child,
            initialPrompt: {
              role: "user",
              content: task,
              timestamp: Date.now()
            } satisfies UserMessage,
            runId: subagentRunId,
            signal: lifecycleController.signal,
            ...(input.retryPolicy ? { retryPolicy: input.retryPolicy } : {}),
            onEvent: handleChildEvent,
            onAssistantMessageEnded: (message, attempt) => {
              const usage = normalizeUsage(message.usage);
              if (!usage) return;
              emitProgress(
                {
                  ...progressBase,
                  type: "usage_observed",
                  observationId:
                    `${attempt.turnId}:attempt:${attempt.attempt}`,
                  observedAt: new Date().toISOString(),
                  messageId: `${subagentRunId}_assistant`,
                  turnId: attempt.turnId,
                  attempt: attempt.attempt,
                  status: usageObservationStatus(message),
                  hadToolCall: message.content.some(
                    (item) => item.type === "toolCall"
                  ),
                  usage,
                  runtime: childRuntime
                },
                "子智能体模型请求已完成。"
              );
            },
            onTurnStarted: (attempt) => {
              emitProgress(
                {
                  ...progressBase,
                  type: "activity",
                  activity: { type: "turn_started", ...attempt }
                },
                `子智能体正在进行第 ${attempt.attempt} 次模型请求。`
              );
            },
            onRetryScheduled: (retry) => {
              emitProgress(
                {
                  ...progressBase,
                  type: "activity",
                  activity: { type: "retry_scheduled", ...retry }
                },
                `子智能体网络连接波动，将进行第 ${retry.nextAttempt - 1}/${retry.maxAttempts - 1} 次重试。`
              );
            }
          })
            .then((): PromptOutcome => ({ kind: "completed" }))
            .catch(
              (error: unknown): PromptOutcome => ({ kind: "failed", error })
            );
          const outcome = await Promise.race([prompt, early]);
          if (outcome.kind === "failed") throw outcome.error;
          if (outcome.kind === "aborted") {
            status = "aborted";
            errorMessage = "子智能体运行已中止。";
          }
        }
        if (timedOut) {
          status = "error";
          errorMessage = `子智能体超过 ${Math.ceil(timeoutMs / 1_000)} 秒硬截止时间，运行已终止。`;
        } else if (
          status === "completed" &&
          (cancellationRequested || terminalAborted)
        ) {
          status = "aborted";
          errorMessage = terminalError ?? "子智能体运行已中止。";
        } else if (terminalError) {
          status = "error";
          errorMessage = terminalError;
        } else if (status === "completed" && !terminalMessage) {
          status = "error";
          errorMessage = "子智能体运行结束，但没有返回最终交接摘要。";
        }
      } catch (error: unknown) {
        status = cancellationRequested || signal?.aborted ? "aborted" : "error";
        errorMessage = timedOut
          ? `子智能体超过 ${Math.ceil(timeoutMs / 1_000)} 秒硬截止时间，运行已终止。`
          : error instanceof Error
            ? error.message
            : "子智能体运行失败。";
      } finally {
        if (timeout) clearTimeout(timeout);
        resolveEarly = undefined;
        signal?.removeEventListener("abort", abortChild);
      }

      if (status === "completed") {
        summary = readAssistantText(terminalMessage!).trim().slice(0, SUBAGENT_SUMMARY_MAX_LENGTH);
        if (!summary) {
          status = "error";
          errorMessage = "子智能体没有生成可交接的摘要。";
        }
      }
      if (status !== "completed") {
        summary = `${status === "aborted" ? "子智能体执行已中止" : "子智能体执行失败"}：${errorMessage}`
          .slice(0, SUBAGENT_SUMMARY_MAX_LENGTH);
      }

      const usage = terminalMessage ? normalizeUsage(terminalMessage.usage) : undefined;
      emitProgress(
        {
          ...progressBase,
          type: "completed",
          status,
          summary,
          ...(errorMessage ? { errorMessage: errorMessage.slice(0, 4_000) } : {}),
          ...(usage ? { usage } : {})
        },
        status === "completed"
          ? `子智能体「${definition.name}」已完成。`
          : summary
      );

      return textResult(summary, { kind: "subagent-result" });
    }
  };
  return tool;
}
