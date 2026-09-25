import {
  Agent,
  type AgentEvent,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
  type ThinkingLevel as PiThinkingLevel
} from "@earendil-works/pi-agent-core";
import {
  createModels,
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  isRetryableAssistantError,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type Model,
  type ProviderStreams,
  type SimpleStreamOptions,
  type ThinkingLevelMap,
  type ToolResultMessage,
  type Usage,
  type UserMessage
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { googleGenerativeAIApi } from "@earendil-works/pi-ai/api/google-generative-ai.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import {
  renderLearningImitationSystemPrompt,
  SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS,
  type AgentEvaluationHistoryMessage,
  type AgentEvaluationSnapshot,
  type AgentEvaluationToolConfiguration,
  type AgentProviderRuntimeConfig,
  type AgentRuntimeRef,
  type AgentUsage,
  type AgentUsageObservationStatus,
  type AgentWriteApprovalMode,
  type LearningImitationAgentProfile,
  type LibraryAgentProfile,
  type LongAgentProfile,
  type LongPlotFocusSnapshot,
  type LongWorkspaceRuntimeContext,
  longAgentAcceptsWorldbuildingDirectory,
  type ScriptWorkspaceAgentProfile,
  type ShortAgentSubagentDefinition,
  type ShortWorkspaceAgentProfile,
  type SubagentActivity,
  type ModelConnectionTestResult,
  type ThinkingLevel as ConfiguredThinkingLevel,
  type UserPromptAttachment,
  type WorkspaceRuntimeContext
} from "@deepwrite/contracts";
import {
  buildScriptWorkspaceTools,
  buildShortWorkspaceTools,
  createScriptWorkspaceToolSharedState,
  createShortWorkspaceToolSharedState,
  isShortWorkspaceToolDetails,
  type ShortWorkspaceToolDetails
} from "./short-agent-tools";
import {
  buildSpawnSubagentTool,
  isSubagentToolProgressDetails,
  type AgentToolExecutionHooks,
  type SubagentToolProgress
} from "./subagent-runtime";
import {
  buildLearningImitationTools,
  isLearningImitationToolDetails
} from "./learning-imitation-tools";
import {
  buildLibraryAgentTools,
  isLibraryAgentToolDetails
} from "./library-agent-tools";
import {
  buildSubagentAuthoringTools,
  isSubagentAuthoringToolDetails,
  renderSubagentAuthoringSystemPrompt
} from "./subagent-authoring-tools";
import {
  runAgentWithTurnRetries,
  type AgentTurnAttempt,
  type AgentTurnRetryPolicyOptions
} from "./agent-turn-retry";
import {
  buildLongWorkspaceTools,
  isLongAgentToolDetails,
  type LongCommandExecutor
} from "./long-agent-tools";
import {
  applyOllamaToolSchemaCompatibility,
  isOllamaProviderName,
  resolveOllamaToolSchemaProfile,
  type ProviderRuntimeCompatibilityOptions
} from "./ollama-tool-schema-compat";
import { enforceProviderToolSchemaCompatibility } from "./provider-tool-schema-compat";
import { findDeepWriteRuntimeModel } from "./runtime-model-catalog";

export {
  buildLongWorkspaceTools,
  isLongAgentToolDetails,
  selectNextLongChapterForDispatch
} from "./long-agent-tools";
export type {
  BuildLongWorkspaceToolsInput,
  LongAgentToolDetails,
  LongCommandExecutor,
  LongQueryCommandEnvelope
} from "./long-agent-tools";

export interface AgentRunInput {
  runId: string;
  sessionId: string;
  prompt: string;
  attachments?: UserPromptAttachment[];
  writeApprovalMode?: AgentWriteApprovalMode;
  thinkingLevel?: ConfiguredThinkingLevel;
  temperature?: number;
  runtimeConfig?: AgentProviderRuntimeConfig;
  agentProfile?: ShortWorkspaceAgentProfile;
  scriptAgentProfile?: ScriptWorkspaceAgentProfile;
  longAgentProfile?: LongAgentProfile;
  subagentDefinitions?: ShortAgentSubagentDefinition[];
  subagentRuntimeConfigs?: Readonly<Record<string, AgentProviderRuntimeConfig>>;
  libraryAgentProfile?: LibraryAgentProfile;
  learningImitationProfile?: LearningImitationAgentProfile;
  workspaceContext?: WorkspaceRuntimeContext;
  /**
   * Narrow Agent Utility -> Core query bridge for the active long-form book.
   * Proposal tools never use this callback for mutation commands.
   */
  longCommandExecutor?: LongCommandExecutor;
  signal?: AbortSignal;
}

export type AgentRuntimeEvent =
  | {
      type: "agent.evaluation_snapshot";
      runId: string;
      sessionId: string;
      payload: {
        messageId: string;
        snapshot: AgentEvaluationSnapshot;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.turn_started";
      runId: string;
      sessionId: string;
      payload: {
        messageId: string;
        turnId: string;
        attempt: number;
        maxAttempts: number;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.retry_scheduled";
      runId: string;
      sessionId: string;
      payload: {
        messageId: string;
        turnId: string;
        failedAttempt: number;
        nextAttempt: number;
        maxAttempts: number;
        delayMs: number;
        retryAt: string;
        reason: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.delta";
      runId: string;
      sessionId: string;
      payload: {
        messageId: string;
        delta: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.thinking_delta";
      runId: string;
      sessionId: string;
      payload: {
        messageId: string;
        delta: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.completed";
      runId: string;
      sessionId: string;
      payload: {
        messageId: string;
        content: string;
        thinking?: string;
        stopReason?: string;
        usage?: AgentUsage;
        runtime: AgentRuntimeRef;
      };
    }
  /**
   * Internal accounting signal emitted once for every provider-returned
   * assistant message. Unlike `agent.completed`, this also includes tool-call
   * turns and retryable error attempts.
   */
  | {
      type: "agent.usage_observed";
      runId: string;
      sessionId: string;
      payload: {
        observationId: string;
        observedAt: string;
        messageId: string;
        turnId: string;
        attempt: number;
        status: AgentUsageObservationStatus;
        hadToolCall: boolean;
        usage: AgentUsage;
        runtime: AgentRuntimeRef;
        parentToolCallId?: string;
        subagentRunId?: string;
        subagentId?: string;
      };
    }
  | {
      type: "agent.tool_stream";
      runId: string;
      sessionId: string;
      payload: {
        streamId: string;
        toolCallId?: string;
        toolName?: string;
        phase: "start" | "delta" | "end";
        argumentsDelta: string;
        /**
         * Provider-side cumulative argument text. This stays inside the runtime
         * adapter and is reduced to argumentsDelta before crossing IPC.
         */
        argumentsSnapshot?: string;
        args?: unknown;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.tool_requested";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        toolName: string;
        args: unknown;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.tool_completed";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        toolName: string;
        resultSummary: string;
        isError: boolean;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "subagent.started";
      runId: string;
      sessionId: string;
      payload: {
        parentToolCallId: string;
        subagentRunId: string;
        subagentId: string;
        name: string;
        task: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "subagent.activity";
      runId: string;
      sessionId: string;
      payload: {
        parentToolCallId: string;
        subagentRunId: string;
        subagentId: string;
        name: string;
        activity: SubagentActivity;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "subagent.completed";
      runId: string;
      sessionId: string;
      payload: {
        parentToolCallId: string;
        subagentRunId: string;
        subagentId: string;
        name: string;
        status: "completed" | "error" | "aborted";
        summary: string;
        errorMessage?: string;
        usage?: AgentUsage;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "workspace.editor_mutation";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        workspaceId: string;
        stageId: import("@deepwrite/contracts").ShortWorkspaceStageId;
        text: string;
        mutationTarget?: {
          kind: "expert-draft-file";
          documentId: string;
          sectionId: string;
          fileKind: "body" | "characterState";
        } | {
          kind: "expert-draft-section-creation";
          sections: Array<{
            title: string;
            wordCountRequirement: string;
            provisionalSectionId: string;
          }>;
          afterSectionId?: string;
        } | {
          kind: "expert-draft-section-rename";
          sectionId: string;
          previousTitle: string;
          title: string;
        } | {
          kind: "expert-draft-section-deletion";
          sectionId: string;
          title: string;
        } | {
          kind: "character-file";
          documentId: string;
          itemId?: string;
        } | {
          kind: "character-structure";
          mutation: Extract<ShortWorkspaceToolDetails, { kind: "workspace-character-structure-mutation" }>["mutation"];
        };
        baseRevision: string;
        summary: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "workspace.stage_selection";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        workspaceId: string;
        stageId: import("@deepwrite/contracts").ShortWorkspaceStageId;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "long.mutation_proposal";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        bookId: string;
        agentId: import("@deepwrite/contracts").LongAgentId;
        batch: import("@deepwrite/contracts").LongWorkspaceOperationBatch;
        baseProjectRevision: number;
        summary: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "long.worldbuilding_file_proposal";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        bookId: string;
        agentId: import("@deepwrite/contracts").LongAgentId;
        batch: import("@deepwrite/contracts").LongWorkspaceOperationBatch;
        baseProjectRevision: number;
        summary: string;
        files: import("@deepwrite/contracts").LongWorldbuildingFileChange[];
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "long.character_file_proposal";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        bookId: string;
        agentId: import("@deepwrite/contracts").LongAgentId;
        batch: import("@deepwrite/contracts").LongWorkspaceOperationBatch;
        baseProjectRevision: number;
        summary: string;
        files: import("@deepwrite/contracts").LongCharacterFileChange[];
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "long.continuity_file_proposal";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        bookId: string;
        agentId: import("@deepwrite/contracts").LongAgentId;
        batch: import("@deepwrite/contracts").LongWorkspaceOperationBatch;
        baseProjectRevision: number;
        summary: string;
        files: import("@deepwrite/contracts").LongContinuityFileChange[];
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "long.chapter_write_proposal";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        bookId: string;
        agentId: import("@deepwrite/contracts").LongAgentId;
        batch: import("@deepwrite/contracts").LongWorkspaceOperationBatch;
        baseProjectRevision: number;
        file: import("@deepwrite/contracts").LongChapterBodyChange;
        summary: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "long.ledger_commit_proposal";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        bookId: string;
        agentId: import("@deepwrite/contracts").LongAgentId;
        input: import("@deepwrite/contracts").LongCommitChapterInput;
        summary: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "long.chapter_dispatch_proposal";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        bookId: string;
        agentId: import("@deepwrite/contracts").LongAgentId;
        scope: import("@deepwrite/contracts").LongWritingScope;
        chapterCardId: string;
        title: string;
        chapters: import("@deepwrite/contracts").LongChapterReadiness[];
        workspaceRevision: number;
        projectRevision: number;
        summary: string;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "library.editor_mutation";
      runId: string;
      sessionId: string;
      payload:
        | {
            toolCallId: string;
            operation: "create";
            domain: "material" | "skill";
            libraryId: string;
            stageId: string;
            title: string;
            text: string;
            baseRevision: string;
            baseProjectRevision?: number;
            summary: string;
            runtime: AgentRuntimeRef;
          }
        | {
            toolCallId: string;
            operation: "edit";
            domain: "material" | "skill";
            libraryId: string;
            entryId: string;
            documentId: string;
            stageId: string;
            title: string;
            text: string;
            baseRevision: string;
            baseProjectRevision?: number;
            summary: string;
            runtime: AgentRuntimeRef;
          }
        | {
            toolCallId: string;
            operation: "edit-overview";
            domain: "material" | "skill";
            libraryId: string;
            documentId: string;
            title: string;
            text: string;
            baseRevision: string;
            baseProjectRevision?: number;
            summary: string;
            runtime: AgentRuntimeRef;
          };
    }
  | {
      type: "learning_imitation.result_updated";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        stageId: import("@deepwrite/contracts").LearningImitationStageId;
        update: import("@deepwrite/contracts").LearningImitationWritePayload;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "subagent_authoring.draft_updated";
      runId: string;
      sessionId: string;
      payload: {
        toolCallId: string;
        draft: import("@deepwrite/contracts").SubagentAuthoringDraft;
        runtime: AgentRuntimeRef;
      };
    }
  | {
      type: "agent.error";
      runId: string;
      sessionId: string;
      payload: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
        runtime?: AgentRuntimeRef;
      };
    };

export interface AgentRuntime {
  describe(): AgentRuntimeRef;
  start(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent>;
}

export interface PiRuntimeAdapterOptions extends AgentToolExecutionHooks {
  idleTimeoutMs?: number;
  subagentTimeoutMs?: number;
  tokensPerSecond?: number;
  systemPrompt?: string;
  evaluationMode?: boolean;
  retryPolicy?: AgentTurnRetryPolicyOptions;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) {
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.values.shift();
        if (value !== undefined) {
          return Promise.resolve({ value, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
      }
    };
  }
}

type ToolCallAssistantEvent = Extract<
  AssistantMessageEvent,
  { type: "toolcall_start" | "toolcall_delta" | "toolcall_end" }
>;

/**
 * Observes provider tool-call chunks before pi-agent-core processes or executes
 * the completed tool. This keeps UI activity tied to the raw model stream.
 */
export function interceptToolCallStream(
  sourceStreamFn: StreamFn,
  onToolCallEvent: (event: ToolCallAssistantEvent, assistantTurnIndex: number) => void
): StreamFn {
  let assistantTurnIndex = 0;
  return async (model, context, options) => {
    const currentTurnIndex = assistantTurnIndex;
    assistantTurnIndex += 1;
    const forwarded = createAssistantMessageEventStream();
    void (async () => {
      let partialMessage: AssistantMessage | undefined;
      let terminalSeen = false;
      try {
        const source = await sourceStreamFn(model, context, {
          ...options,
          // DeepWrite owns the visible retry lifecycle. Prevent an SDK retry
          // budget from multiplying the adapter's attempt budget.
          maxRetries: 0
        });
        for await (const event of source) {
          if ("partial" in event) {
            partialMessage = event.partial;
          }
          if (
            event.type === "toolcall_start" ||
            event.type === "toolcall_delta" ||
            event.type === "toolcall_end"
          ) {
            onToolCallEvent(event, currentTurnIndex);
          }
          if (event.type === "done" || event.type === "error") {
            terminalSeen = true;
          }
          forwarded.push(event);
        }
        if (!terminalSeen) {
          forwarded.push({
            type: "error",
            reason: options?.signal?.aborted ? "aborted" : "error",
            error: createStreamFailureMessage(
              model,
              partialMessage,
              options?.signal?.aborted
                ? "模型请求已中止。"
                : "Model stream ended without a terminal event.",
              options?.signal?.aborted === true
            )
          });
        }
      } catch (error: unknown) {
        const aborted = options?.signal?.aborted === true;
        forwarded.push({
          type: "error",
          reason: aborted ? "aborted" : "error",
          error: createStreamFailureMessage(
            model,
            partialMessage,
            aborted
              ? "模型请求已中止。"
              : error instanceof Error
                ? error.message
                : String(error),
            aborted
          )
        });
      }
    })();
    return forwarded;
  };
}

function createStreamFailureMessage(
  model: Model<Api>,
  partialMessage: AssistantMessage | undefined,
  errorMessage: string,
  aborted: boolean
): AssistantMessage {
  return {
    role: "assistant",
    content: partialMessage?.content ?? [{ type: "text", text: "" }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: partialMessage?.usage ?? {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: aborted ? "aborted" : "error",
    errorMessage,
    timestamp: Date.now()
  };
}

const DEEPWRITE_FAUX_RUNTIME: AgentRuntimeRef = {
  provider: "deepwrite",
  model: "deepwrite-writing-faux",
  mode: "local-faux"
};

const TOOL_STREAM_DELTA_FLUSH_MS = 100;

export class PiAgentRuntimeAdapter implements AgentRuntime {
  private readonly idleTimeoutMs: number;
  private readonly subagentTimeoutMs: number | undefined;
  private readonly tokensPerSecond: number;
  private readonly systemPrompt: string;
  private readonly evaluationMode: boolean;
  private readonly retryPolicy: AgentTurnRetryPolicyOptions | undefined;
  private readonly toolExecutionHooks: AgentToolExecutionHooks;
  private readonly conversationAgents = new Map<string, Agent>();

  constructor(options: PiRuntimeAdapterOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60_000;
    this.subagentTimeoutMs = options.subagentTimeoutMs;
    this.tokensPerSecond = options.tokensPerSecond ?? 90;
    this.systemPrompt = options.systemPrompt ?? buildDeepWriteSystemPrompt();
    this.evaluationMode = options.evaluationMode === true;
    this.retryPolicy = options.retryPolicy;
    this.toolExecutionHooks = {
      ...(options.beforeToolCall
        ? { beforeToolCall: options.beforeToolCall }
        : {}),
      ...(options.afterToolCall ? { afterToolCall: options.afterToolCall } : {})
    };
  }

  describe(config?: AgentProviderRuntimeConfig): AgentRuntimeRef {
    if (config) {
      return {
        provider: config.provider,
        model: config.modelId,
        mode: "provider",
        configId: config.id
      };
    }
    return { ...DEEPWRITE_FAUX_RUNTIME };
  }

  async testConnection(
    config: AgentProviderRuntimeConfig
  ): Promise<ModelConnectionTestResult> {
    const { model, streamFn } = buildProviderRuntime(config);
    const stream = streamFn(
      model,
      {
        systemPrompt: "You are a connection test. Reply with OK only.",
        messages: [{ role: "user", content: "OK", timestamp: Date.now() }]
      },
      {
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        maxTokens: 8,
        maxRetries: 0,
        timeoutMs: 15_000
      }
    );
    const result = await (await stream).result();
    if (result.stopReason === "error" || result.stopReason === "aborted") {
      throw new Error(result.errorMessage || "模型连接测试失败。");
    }
    const usage = normalizeUsage(result.usage);
    return {
      modelId: config.id,
      ok: true,
      message: "连接成功，模型已返回有效响应。",
      testedAt: new Date().toISOString(),
      ...(usage ? { usage } : {})
    };
  }

  async *start(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent> {
    const queue = new AsyncEventQueue<AgentRuntimeEvent>();
    const runtime = this.describe(input.runtimeConfig);
    const messageId = `${input.runId}_assistant`;
    const ollamaToolSchemaProfile = resolveOllamaToolSchemaProfile(
      input.workspaceContext
    );
    let model: Model<Api>;
    let streamFn: StreamFn;
    let effectiveThinkingLevel: PiThinkingLevel;

    if (input.runtimeConfig) {
      const configuredThinkingLevel =
        input.thinkingLevel ?? input.runtimeConfig.defaultThinkingLevel;
      const effectiveTemperature = configuredThinkingLevel === "off"
        ? input.temperature ?? input.runtimeConfig.temperatureOptions[1]
        : undefined;
      const providerRuntime = buildProviderRuntime(
        input.runtimeConfig,
        effectiveTemperature,
        configuredThinkingLevel,
        { ollamaToolSchemaProfile }
      );
      model = providerRuntime.model;
      streamFn = providerRuntime.streamFn;
      effectiveThinkingLevel = toPiThinkingLevel(configuredThinkingLevel);
    } else {
      const models = createModels();
      const faux = fauxProvider({
        api: "deepwrite-faux",
        provider: runtime.provider,
        models: [
          {
            id: runtime.model,
            name: "InkHub Local Writing Faux",
            reasoning: true,
            input: ["text"]
          }
        ],
        tokensPerSecond: this.tokensPerSecond,
        tokenSize: { min: 2, max: 4 }
      });
      models.setProvider(faux.provider);
      const fauxModel = faux.getModel(runtime.model);
      if (!fauxModel) {
        throw new Error("InkHub faux model is unavailable.");
      }
      model = fauxModel;
      streamFn = models.streamSimple.bind(models) as StreamFn;
      effectiveThinkingLevel = toPiThinkingLevel(input.thinkingLevel ?? "medium");
      faux.setResponses([
        fauxAssistantMessage(
          effectiveThinkingLevel === "off"
            ? [fauxText(buildLocalWritingResponse(input))]
            : [
                fauxThinking(buildLocalThinking(input)),
                fauxText(buildLocalWritingResponse(input))
              ]
        )
      ]);
    }

    const shortWorkspace = input.workspaceContext?.shortWorkspace;
    const scriptWorkspace = input.workspaceContext?.scriptWorkspace;
    const longWorkspace = input.workspaceContext?.longWorkspace;
    const libraryWorkspace = input.workspaceContext?.libraryWorkspace;
    const learningImitation = input.workspaceContext?.learningImitation;
    const subagentAuthoring = input.workspaceContext?.subagentAuthoring;
    const imageAttachments = input.attachments?.filter(
      (attachment) => attachment.kind === "image"
    ) ?? [];
    if (imageAttachments.length && !model.input.includes("image")) {
      throw new Error(
        runtime.mode === "local-faux"
          ? "墨枢 Faux 不支持图片理解，请先选择支持多模态的真实模型。"
          : `当前模型 ${runtime.model} 不支持图片输入，请更换支持多模态的模型。`
      );
    }
    const systemPrompt = buildEffectiveSystemPrompt(this.systemPrompt, input);
    const writingToolSharedState = scriptWorkspace && input.scriptAgentProfile
      ? createScriptWorkspaceToolSharedState(scriptWorkspace)
      : shortWorkspace && input.agentProfile
        ? createShortWorkspaceToolSharedState(shortWorkspace)
        : undefined;
    const buildWritingTools = (): AgentTool[] => {
      if (scriptWorkspace && input.scriptAgentProfile) {
        return buildScriptWorkspaceTools({
          workspace: scriptWorkspace,
          profile: input.scriptAgentProfile,
          writeApprovalMode: input.writeApprovalMode ?? "request-approval",
          attachedSkills: input.workspaceContext?.attachedSkills,
          attachedMaterials: input.workspaceContext?.attachedMaterials,
          ...(writingToolSharedState
            ? { sharedState: writingToolSharedState }
            : {})
        });
      }
      return shortWorkspace && input.agentProfile
        ? buildShortWorkspaceTools({
            workspace: shortWorkspace,
            profile: input.agentProfile,
            writeApprovalMode: input.writeApprovalMode ?? "request-approval",
            attachedSkills: input.workspaceContext?.attachedSkills,
            attachedMaterials: input.workspaceContext?.attachedMaterials,
            ...(writingToolSharedState
              ? { sharedState: writingToolSharedState }
              : {})
          })
        : [];
    };
    const buildLongTools = (): AgentTool[] =>
      longWorkspace && input.longAgentProfile
        ? buildLongWorkspaceTools({
            workspace: longWorkspace,
            profile: input.longAgentProfile,
            sessionId: input.sessionId,
            runId: input.runId,
            writeApprovalMode:
              input.writeApprovalMode ?? "request-approval",
            attachedSkills: input.workspaceContext?.attachedSkills,
            attachedMaterials: input.workspaceContext?.attachedMaterials,
            ...(input.longCommandExecutor
              ? { executor: input.longCommandExecutor }
              : {})
          })
        : [];
    let tools: AgentTool[] = subagentAuthoring
      ? buildSubagentAuthoringTools(subagentAuthoring)
      : learningImitation && input.learningImitationProfile
      ? buildLearningImitationTools(
          learningImitation,
          input.writeApprovalMode ?? "request-approval"
        )
      : libraryWorkspace && input.libraryAgentProfile
        ? buildLibraryAgentTools({
            workspace: libraryWorkspace,
            profile: input.libraryAgentProfile,
            writeApprovalMode: input.writeApprovalMode ?? "request-approval",
            attachedSkills: input.workspaceContext?.attachedSkills
          })
      : longWorkspace && input.longAgentProfile
        ? buildLongTools()
      : (scriptWorkspace && input.scriptAgentProfile) ||
          (shortWorkspace && input.agentProfile)
        ? buildWritingTools()
        : [];
    if (
      ((scriptWorkspace && input.scriptAgentProfile) ||
        (shortWorkspace && input.agentProfile) ||
        (longWorkspace && input.longAgentProfile)) &&
      !subagentAuthoring
    ) {
      const spawnTool = buildSpawnSubagentTool({
        parentSessionId: input.sessionId,
        parentRuntime: runtime,
        model,
        thinkingLevel: effectiveThinkingLevel,
        streamFn,
        definitions: input.subagentDefinitions ?? [],
        ...(input.subagentRuntimeConfigs
          ? { subagentRuntimeConfigs: input.subagentRuntimeConfigs }
          : {}),
        buildCustomModelRuntime: (config, options) => {
          const childThinking =
            options?.thinkingLevel ?? config.defaultThinkingLevel ?? "medium";
          const childTemperature =
            childThinking === "off"
              ? options?.temperature ?? config.temperatureOptions[1]
              : undefined;
          const childRuntime = buildProviderRuntime(
            config,
            childTemperature,
            childThinking,
            { ollamaToolSchemaProfile }
          );
          return {
            model: childRuntime.model,
            streamFn: childRuntime.streamFn,
            thinkingLevel: toPiThinkingLevel(childThinking)
          };
        },
        buildChildTools:
          longWorkspace && input.longAgentProfile
            ? buildLongTools
            : buildWritingTools,
        ...(scriptWorkspace
          ? {
              systemPromptRequirements:
                scriptRuntimeFormatRequirements()
            }
          : longWorkspace
            ? {
                systemPromptRequirements:
                  input.writeApprovalMode === "auto-approve"
                    ? "这是长篇主智能体委派的单层子任务。只能使用继承的长篇查询/提案工具和当前 bookId；提案会进入实时自动保存队列，在客户端确认成功前不能宣称已落盘或已提交连续性账本。"
                    : "这是长篇主智能体委派的单层子任务。只能使用继承的长篇查询/提案工具和当前 bookId；任何写入仍须形成可审阅提案，不能宣称已落盘或已提交连续性账本。"
              }
            : {}),
        toolExecutionHooks: this.toolExecutionHooks,
        ...(this.retryPolicy ? { retryPolicy: this.retryPolicy } : {}),
        ...(this.subagentTimeoutMs === undefined
          ? {}
          : { timeoutMs: this.subagentTimeoutMs }),
        depth: 0
      });
      if (spawnTool) tools = [...tools, spawnTool];
    }
    const agentKey = `${input.sessionId}:${
      subagentAuthoring
        ? `subagent-authoring:${subagentAuthoring.parentAgentId}`
        : input.learningImitationProfile
        ? `learning-imitation:${input.learningImitationProfile.id}`
        : input.libraryAgentProfile && libraryWorkspace
          ? `library:${input.libraryAgentProfile.domain}:${libraryWorkspace.libraryId}`
        : input.scriptAgentProfile
          ? `script:${input.scriptAgentProfile.id}`
          : input.longAgentProfile && longWorkspace
            ? `long:${input.longAgentProfile.id}:${longWorkspace.bookId}`
          : input.agentProfile?.id ?? "default"
    }`;
    let emitToolCallEvent: (
      event: ToolCallAssistantEvent,
      assistantTurnIndex: number
    ) => void = () => {};
    const interceptedStreamFn = interceptToolCallStream(
      streamFn,
      (event, assistantTurnIndex) => emitToolCallEvent(event, assistantTurnIndex)
    );
    let agent = this.conversationAgents.get(agentKey);
    if (agent) {
      if (agent.state.isStreaming) {
        throw new Error("The selected conversation agent is already running.");
      }
      if (input.learningImitationProfile) {
        // Every preset analysis is self-contained. The latest documents and
        // accumulated preview are injected explicitly, so replaying prior tool
        // calls would only pollute the next learning pass.
        agent.state.messages = [];
      }
      agent.state.systemPrompt = systemPrompt;
      agent.state.model = model;
      agent.state.thinkingLevel = effectiveThinkingLevel;
      agent.state.tools = tools;
      agent.streamFunction = interceptedStreamFn;
      if (this.toolExecutionHooks.beforeToolCall) {
        agent.beforeToolCall = this.toolExecutionHooks.beforeToolCall;
      } else {
        delete agent.beforeToolCall;
      }
      if (this.toolExecutionHooks.afterToolCall) {
        agent.afterToolCall = this.toolExecutionHooks.afterToolCall;
      } else {
        delete agent.afterToolCall;
      }
      agent.sessionId = input.sessionId;
      agent.toolExecution = "sequential";
      this.conversationAgents.delete(agentKey);
      this.conversationAgents.set(agentKey, agent);
    } else {
      agent = new Agent({
        initialState: {
          systemPrompt,
          model,
          thinkingLevel: effectiveThinkingLevel,
          tools
        },
        streamFn: interceptedStreamFn,
        ...this.toolExecutionHooks,
        sessionId: input.sessionId,
        toolExecution: "sequential"
      });
      this.conversationAgents.set(agentKey, agent);
      this.trimConversationAgents();
    }

    let settled = false;
    let terminalEmitted = false;
    let evaluationSnapshotEmitter: (() => void) | undefined;
    let modelRequestInFlight = false;
    let retryWaiting = false;
    let idleModelRequestTimedOut = false;
    let currentTurnAttempt = 0;
    let currentTurnMaxAttempts = 1;
    let idleTimeout: NodeJS.Timeout | undefined;
    let abortListener: (() => void) | undefined;
    let scheduleIdleTimeout = (): void => {};
    const retryWaitController = new AbortController();
    const pendingToolDeltas = new Map<
      string,
      Extract<AgentRuntimeEvent, { type: "agent.tool_stream" }>
    >();
    const streamedToolArguments = new Map<string, string>();
    const activeSubagents = new Map<
      string,
      Extract<AgentRuntimeEvent, { type: "subagent.started" }>["payload"]
    >();
    let toolDeltaTimer: NodeJS.Timeout | undefined;

    const emit = (event: AgentRuntimeEvent): void => {
      const terminal = event.type === "agent.completed" || event.type === "agent.error";
      if (terminalEmitted && event.type !== "agent.evaluation_snapshot") {
        return;
      }
      if (event.type === "subagent.started") {
        activeSubagents.set(event.payload.subagentRunId, event.payload);
      } else if (event.type === "subagent.completed") {
        activeSubagents.delete(event.payload.subagentRunId);
      }
      if (terminal) {
        const aborted =
          event.type === "agent.error" && event.payload.code === "pi_agent.aborted";
        for (const active of activeSubagents.values()) {
          const summary = aborted
            ? "父智能体运行已中止，子智能体同步停止。"
            : "父智能体运行已结束，子智能体未返回完整终态。";
          queue.push({
            type: "subagent.completed",
            runId: input.runId,
            sessionId: input.sessionId,
            payload: {
              parentToolCallId: active.parentToolCallId,
              subagentRunId: active.subagentRunId,
              subagentId: active.subagentId,
              name: active.name,
              status: aborted ? "aborted" : "error",
              summary,
              errorMessage: summary,
              runtime: active.runtime
            }
          });
        }
        activeSubagents.clear();
        terminalEmitted = true;
        if (idleTimeout) {
          clearTimeout(idleTimeout);
          idleTimeout = undefined;
        }
      }
      queue.push(event);
      if (!terminal && !terminalEmitted) {
        scheduleIdleTimeout();
      }
    };

    const flushToolDeltas = (): void => {
      if (toolDeltaTimer) {
        clearTimeout(toolDeltaTimer);
        toolDeltaTimer = undefined;
      }
      for (const event of pendingToolDeltas.values()) emit(event);
      pendingToolDeltas.clear();
    };

    const discardAttemptToolDeltas = (): void => {
      if (toolDeltaTimer) {
        clearTimeout(toolDeltaTimer);
        toolDeltaTimer = undefined;
      }
      pendingToolDeltas.clear();
      streamedToolArguments.clear();
    };

    const emitStreamedToolEvent = (
      event: Extract<AgentRuntimeEvent, { type: "agent.tool_stream" }>
    ): void => {
      const currentArguments = streamedToolArguments.get(event.payload.streamId) ?? "";
      const normalized = reconcileToolCallArguments(
        currentArguments,
        event.payload.argumentsDelta,
        event.payload.argumentsSnapshot
      );
      event.payload.argumentsDelta = normalized.delta;
      delete event.payload.argumentsSnapshot;
      streamedToolArguments.set(event.payload.streamId, normalized.next);
      if (event.payload.phase !== "delta") {
        flushToolDeltas();
        emit(event);
        return;
      }
      const existing = pendingToolDeltas.get(event.payload.streamId);
      if (existing) {
        existing.payload.argumentsDelta += event.payload.argumentsDelta;
        if (event.payload.toolCallId) existing.payload.toolCallId = event.payload.toolCallId;
        if (event.payload.toolName) existing.payload.toolName = event.payload.toolName;
      } else {
        pendingToolDeltas.set(event.payload.streamId, event);
      }
      if (!toolDeltaTimer) {
        toolDeltaTimer = setTimeout(flushToolDeltas, TOOL_STREAM_DELTA_FLUSH_MS);
        toolDeltaTimer.unref();
      }
    };

    emitToolCallEvent = (event, assistantTurnIndex) => {
      emitStreamedToolEvent(
        toToolStreamRuntimeEvent(event, input, runtime, messageId, assistantTurnIndex)
      );
    };

    const cleanup = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = undefined;
      }
      if (toolDeltaTimer) {
        clearTimeout(toolDeltaTimer);
        toolDeltaTimer = undefined;
      }
      pendingToolDeltas.clear();
      streamedToolArguments.clear();
      activeSubagents.clear();
      retryWaitController.abort();
      if (abortListener && input.signal) {
        input.signal.removeEventListener("abort", abortListener);
      }
      queue.close();
    };

    abortListener = () => {
      idleModelRequestTimedOut = false;
      retryWaitController.abort();
      agent.abort();
      emit({
        type: "agent.error",
        runId: input.runId,
        sessionId: input.sessionId,
        payload: {
          code: "pi_agent.aborted",
          message: "智能体运行已中止。",
          runtime
        }
      });
      cleanup();
    };
    if (input.signal?.aborted) {
      abortListener();
    } else {
      input.signal?.addEventListener("abort", abortListener, { once: true });
    }

    scheduleIdleTimeout = (): void => {
      if (
        settled ||
        terminalEmitted ||
        retryWaiting ||
        this.idleTimeoutMs <= 0
      ) {
        return;
      }
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      idleTimeout = setTimeout(() => {
        idleTimeout = undefined;
        if (
          input.runtimeConfig &&
          modelRequestInFlight &&
          currentTurnAttempt < currentTurnMaxAttempts
        ) {
          // Aborting only the current Agent invocation yields an assistant
          // failure that the turn retry coordinator can resume. Tool execution
          // timeouts remain terminal so completed side effects are never replayed.
          idleModelRequestTimedOut = true;
          agent.abort();
          return;
        }
        agent.abort();
        emit({
          type: "agent.error",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            code: "pi_agent.idle_timeout",
            message: "智能体超过 5 分钟没有返回新事件，运行已中止。",
            runtime
          }
        });
        cleanup();
      }, this.idleTimeoutMs);
      idleTimeout.unref();
    };

    if (!settled) {
      scheduleIdleTimeout();
      // Preserve the first request wrapper as the stable prefix for later turns.
      // Plot-design and draft turns also receive their latest structure
      // snapshots; tools and the system prompt are still refreshed before every run.
      const persistInitialRuntimeContext = agent.state.messages.length === 0;
      const runtimeUserContent = persistInitialRuntimeContext
        ? buildRuntimeUserMessageContent(input)
        : longAgentRefreshesDesignContextOnLaterTurns(
              input.longAgentProfile?.id
            ) && input.workspaceContext?.longWorkspace
          ? buildLongFollowUpTurnUserMessageContent(input)
          : buildRawUserMessage(input).content;
      const runtimeUserMessage: UserMessage = {
        role: "user",
        content: runtimeUserContent,
        timestamp: Date.now()
      };
      if (this.evaluationMode) {
        const providerVisibleTools = applyOllamaToolSchemaCompatibility(
          enforceProviderToolSchemaCompatibility({
            systemPrompt,
            messages: [],
            tools
          }),
          runtime.provider,
          ollamaToolSchemaProfile
        ).tools ?? tools;
        const evaluationTools = providerVisibleTools.map((providerTool) => {
          const executableTool = tools.find(
            (candidate) => candidate.name === providerTool.name
          );
          return {
            name: providerTool.name,
            description: providerTool.description,
            parameters: providerTool.parameters,
            ...(executableTool?.label ? { label: executableTool.label } : {}),
            ...(executableTool?.executionMode
              ? { executionMode: executableTool.executionMode }
              : {})
          };
        });
        const emitEvaluationSnapshot = (): void => {
          emit({
            type: "agent.evaluation_snapshot",
            runId: input.runId,
            sessionId: input.sessionId,
            payload: {
              messageId,
              snapshot: buildAgentEvaluationSnapshot(
                systemPrompt,
                runtimeUserContent,
                persistInitialRuntimeContext,
                evaluationTools,
                new Date().toISOString(),
                evaluationConversationHistory(agent.state.messages)
              ),
              runtime
            }
          });
        };
        emitEvaluationSnapshot();
        evaluationSnapshotEmitter = emitEvaluationSnapshot;
      }
      void runAgentWithTurnRetries({
        agent,
        initialPrompt: runtimeUserMessage,
        runId: input.runId,
        signal: retryWaitController.signal,
        ...(this.retryPolicy ? { retryPolicy: this.retryPolicy } : {}),
        classifyFailure: (message) => {
          if (idleModelRequestTimedOut && message.stopReason === "aborted") {
            return "模型请求长时间没有返回新事件。";
          }
          return isRetryableAssistantError(message)
            ? message.errorMessage || "模型连接暂时不可用。"
            : undefined;
        },
        onTurnStarted: (attempt) => {
          retryWaiting = false;
          modelRequestInFlight = true;
          idleModelRequestTimedOut = false;
          currentTurnAttempt = attempt.attempt;
          currentTurnMaxAttempts = attempt.maxAttempts;
          emit({
            type: "agent.turn_started",
            runId: input.runId,
            sessionId: input.sessionId,
            payload: {
              messageId,
              turnId: attempt.turnId,
              attempt: attempt.attempt,
              maxAttempts: attempt.maxAttempts,
              runtime
            }
          });
        },
        onRetryRollback: () => {
          modelRequestInFlight = false;
          idleModelRequestTimedOut = false;
          if (idleTimeout) {
            clearTimeout(idleTimeout);
            idleTimeout = undefined;
          }
          discardAttemptToolDeltas();
        },
        onRetryScheduled: (schedule) => {
          retryWaiting = true;
          if (idleTimeout) {
            clearTimeout(idleTimeout);
            idleTimeout = undefined;
          }
          emit({
            type: "agent.retry_scheduled",
            runId: input.runId,
            sessionId: input.sessionId,
            payload: {
              messageId,
              ...schedule,
              runtime
            }
          });
        },
        onAssistantMessageEnded: (message, attempt) => {
          const usageEvent = toUsageObservedRuntimeEvent(
            message,
            input,
            runtime,
            messageId,
            attempt
          );
          if (usageEvent) emit(usageEvent);
        },
        onEvent: (event) => {
          if (event.type === "message_end" && isAssistantMessage(event.message)) {
            modelRequestInFlight = false;
          } else if (event.type === "tool_execution_start") {
            modelRequestInFlight = false;
          }
          for (const runtimeEvent of toRuntimeEvents(
            event,
            input,
            runtime,
            messageId
          )) {
            emit(runtimeEvent);
          }
        }
      })
        .catch((error: unknown) => {
          if (settled || retryWaitController.signal.aborted) return;
          emit({
            type: "agent.error",
            runId: input.runId,
            sessionId: input.sessionId,
            payload: {
              code: "pi_agent.prompt_failed",
              message: error instanceof Error ? error.message : "本地智能体请求失败。",
              details: { kind: error instanceof Error ? error.name : "unknown" },
              runtime
            }
          });
        })
        .finally(() => {
          if (!terminalEmitted) {
            emit({
              type: "agent.error",
              runId: input.runId,
              sessionId: input.sessionId,
              payload: {
                code: "pi_agent.missing_terminal_event",
                message: "智能体运行结束，但没有收到完成事件。",
                runtime
              }
            });
          }
          evaluationSnapshotEmitter?.();
          cleanup();
        });
    }

    try {
      for await (const event of queue) {
        yield event;
      }
    } finally {
      if (!settled) {
        agent.abort();
        cleanup();
      }
    }
  }

  private trimConversationAgents(limit = 100): void {
    if (this.conversationAgents.size <= limit) return;
    for (const [key, agent] of this.conversationAgents) {
      if (this.conversationAgents.size <= limit) return;
      if (!agent.state.isStreaming) {
        this.conversationAgents.delete(key);
      }
    }
  }
}

function evaluationContextText(content: UserMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (part): part is Extract<(typeof content)[number], { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
}

const EVALUATION_HISTORY_TEXT_LIMIT = 4_000;
const EVALUATION_HISTORY_MAX_MESSAGES = 40;

function compactEvaluationText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= EVALUATION_HISTORY_TEXT_LIMIT) return trimmed;
  return `${trimmed.slice(0, EVALUATION_HISTORY_TEXT_LIMIT)}…`;
}

function isUserAgentMessage(message: AgentMessage): message is UserMessage {
  return typeof message === "object" && message !== null && message.role === "user";
}

function isToolResultAgentMessage(
  message: AgentMessage
): message is ToolResultMessage {
  return (
    typeof message === "object" && message !== null && message.role === "toolResult"
  );
}

function evaluationHistoryToolFields(
  toolName: string | undefined,
  toolCallId: string | undefined
): Pick<AgentEvaluationHistoryMessage, "toolName" | "toolCallId"> {
  const name = toolName?.trim();
  const id = toolCallId?.trim();
  return {
    ...(name ? { toolName: name } : {}),
    ...(id ? { toolCallId: id } : {})
  };
}

function evaluationHistoryFromToolResult(
  message: ToolResultMessage
): AgentEvaluationHistoryMessage {
  const text = message.content
    .filter(
      (part): part is Extract<(typeof message.content)[number], { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n");
  return {
    role: "tool",
    text: compactEvaluationText(text || summarizeToolResult(message.details ?? message)),
    ...evaluationHistoryToolFields(message.toolName, message.toolCallId),
    ...(message.isError ? { isError: true } : {})
  };
}

/** @internal Exported for evaluation-capture regression tests. */
export function evaluationConversationHistory(
  messages: readonly AgentMessage[]
): AgentEvaluationHistoryMessage[] {
  const entries: AgentEvaluationHistoryMessage[] = [];
  for (const message of messages) {
    if (isUserAgentMessage(message)) {
      const text = compactEvaluationText(evaluationContextText(message.content));
      if (text) entries.push({ role: "user", text });
      continue;
    }
    if (isAssistantMessage(message)) {
      const text = compactEvaluationText(
        [readAssistantThinking(message), readAssistantText(message)]
          .filter(Boolean)
          .join("\n\n")
      );
      if (text) entries.push({ role: "assistant", text });
      for (const part of message.content) {
        if (part.type !== "toolCall") continue;
        entries.push({
          role: "assistant",
          text: compactEvaluationText(
            serializedToolArguments(part.arguments) ?? ""
          ),
          ...evaluationHistoryToolFields(part.name, part.id)
        });
      }
      continue;
    }
    if (isToolResultAgentMessage(message)) {
      entries.push(evaluationHistoryFromToolResult(message));
    }
  }
  return entries.length <= EVALUATION_HISTORY_MAX_MESSAGES
    ? entries
    : entries.slice(-EVALUATION_HISTORY_MAX_MESSAGES);
}

type EvaluationToolSource = Pick<
  AgentTool,
  "name" | "description" | "parameters"
> &
  Partial<Pick<AgentTool, "label" | "executionMode">>;

function evaluationToolConfiguration(
  tool: EvaluationToolSource
): AgentEvaluationToolConfiguration {
  // TypeBox schemas contain symbol metadata used by local validation. A JSON
  // clone records the exact provider-facing schema without executable hooks.
  const inputSchema = JSON.parse(JSON.stringify(tool.parameters)) as unknown;
  return {
    name: tool.name,
    ...(tool.label ? { label: tool.label } : {}),
    description: tool.description,
    inputSchema,
    ...(tool.executionMode ? { executionMode: tool.executionMode } : {})
  };
}

/** @internal Exported for evaluation-capture regression tests. */
export function buildAgentEvaluationSnapshot(
  systemPrompt: string,
  runtimeUserContent: UserMessage["content"],
  initialSessionContext: boolean,
  tools: readonly EvaluationToolSource[],
  capturedAt = new Date().toISOString(),
  conversationHistory: readonly AgentEvaluationHistoryMessage[] = []
): AgentEvaluationSnapshot {
  return {
    schemaVersion: 1,
    capturedAt,
    systemPrompt,
    runtimeContext: {
      kind: initialSessionContext
        ? "initial-session-context"
        : "turn-context",
      text: evaluationContextText(runtimeUserContent)
    },
    tools: tools.map(evaluationToolConfiguration),
    ...(conversationHistory.length > 0
      ? { conversationHistory: [...conversationHistory] }
      : {})
  };
}

function providerStreams(api: AgentProviderRuntimeConfig["api"]): ProviderStreams {
  if (api === "openai-completions") {
    return openAICompletionsApi();
  }
  if (api === "openai-responses") {
    return openAIResponsesApi();
  }
  if (api === "anthropic-messages") {
    return anthropicMessagesApi();
  }
  return googleGenerativeAIApi();
}

function findBuiltinModel(config: AgentProviderRuntimeConfig): Model<Api> | undefined {
  const provider = getBuiltinProviders().find(
    (candidate) => candidate.toLowerCase() === config.provider.toLowerCase()
  );
  if (provider) {
    const model = getBuiltinModels(provider).find(
      (candidate) => candidate.id.toLowerCase() === config.modelId.toLowerCase()
    ) as Model<Api> | undefined;
    if (model) return model;
  }
  return findDeepWriteRuntimeModel(config.modelId);
}

function resolveOpenAICompletionsCompat(
  config: AgentProviderRuntimeConfig,
  builtin: Model<Api> | undefined
): Model<"openai-completions">["compat"] | undefined {
  if (config.api !== "openai-completions") {
    return undefined;
  }

  const compat: NonNullable<Model<"openai-completions">["compat"]> = {
    ...(builtin?.api === "openai-completions" ? builtin.compat : {})
  };

  const provider = config.provider.toLowerCase();
  const baseUrl = config.baseUrl.toLowerCase();
  if (
    config.supportsDeveloperRole === undefined &&
    (provider === "modelhub" || /^http:\/\/(?:127\.0\.0\.1|localhost):11435(?:\/|$)/u.test(baseUrl))
  ) {
    // ModelHub routes models from several providers. The system role is the
    // common denominator; some compatible routes reject the newer developer role.
    compat.supportsDeveloperRole = false;
  }
  if (
    provider === "qwen" ||
    provider === "dashscope" ||
    (baseUrl.includes("dashscope") && baseUrl.includes("aliyuncs.com"))
  ) {
    compat.thinkingFormat = "qwen";
  } else if (
    provider === "zai" ||
    provider === "zhipu" ||
    baseUrl.includes("bigmodel.cn")
  ) {
    compat.thinkingFormat = "zai";
  }
  if (config.supportsDeveloperRole !== undefined) {
    compat.supportsDeveloperRole = config.supportsDeveloperRole;
  }
  return Object.keys(compat).length > 0 ? compat : undefined;
}

function toPiThinkingLevel(level: ConfiguredThinkingLevel): PiThinkingLevel {
  if (
    level === "off" ||
    level === "minimal" ||
    level === "low" ||
    level === "medium" ||
    level === "high" ||
    level === "xhigh"
  ) {
    return level;
  }
  // Pi exposes five reasoning carriers. The model-level map below rewrites the
  // xhigh carrier to max or to the user's provider-specific custom value.
  return "xhigh";
}

/** @internal Exported for runtime-configuration regression tests. */
export function buildProviderRuntime(
  config: AgentProviderRuntimeConfig,
  temperature?: number,
  configuredThinkingLevel?: ConfiguredThinkingLevel,
  compatibility: ProviderRuntimeCompatibilityOptions = {}
): {
  model: Model<Api>;
  streamFn: StreamFn;
} {
  const builtin = findBuiltinModel(config);
  const baseUrl = config.baseUrl || (builtin?.api === config.api ? builtin.baseUrl : "");
  if (!baseUrl) {
    throw new Error("当前模型不在 Pi 内置目录中，请填写 API 地址后再试。");
  }
  const effectiveTemperature =
    configuredThinkingLevel === "off" &&
    builtin?.reasoning === true &&
    builtin.thinkingLevelMap?.off === null
      ? undefined
      : temperature;
  const requestModelId = config.requestModelId ?? config.modelId;

  const thinkingLevelMap: ThinkingLevelMap = {
    ...(builtin?.thinkingLevelMap ?? {})
  };
  const compat = resolveOpenAICompletionsCompat(config, builtin);
  // Pi's Z.AI serializer emits `thinking: disabled` whenever reasoning is
  // absent, even when the catalog marks off as unsupported. GLM-5.3 rejects
  // that payload, so stale/off run settings must degrade to its lowest valid
  // effort instead of attempting to disable mandatory thinking.
  const mandatoryZaiThinkingFallback =
    configuredThinkingLevel === "off" &&
    builtin?.thinkingLevelMap?.off === null &&
    compat?.thinkingFormat === "zai"
      ? "low"
      : undefined;
  if (configuredThinkingLevel && configuredThinkingLevel !== "off") {
    const carrier = toPiThinkingLevel(configuredThinkingLevel);
    if (configuredThinkingLevel !== carrier) {
      thinkingLevelMap[carrier] = configuredThinkingLevel;
    } else if (carrier === "xhigh" && thinkingLevelMap.xhigh === undefined) {
      thinkingLevelMap.xhigh = "xhigh";
    }
  }
  const model = {
    ...(builtin?.api === config.api ? builtin : {}),
    id: requestModelId,
    name: config.label,
    api: config.api,
    provider: config.provider,
    baseUrl,
    // `reasoning` describes a model capability to pi-ai; it is not the
    // per-request switch. Keep that capability enabled while a run selects
    // "off" so pi-ai can serialize the provider-specific disable control
    // (`thinking: disabled`, `enable_thinking: false`, thinkingBudget: 0,
    // etc.). For catalog models, retain the catalog's known capability.
    // Unknown/custom models are treated as capable: compatible providers can
    // honor the control, while providers without a control simply omit it.
    reasoning: builtin?.reasoning ?? true,
    // A custom endpoint has no Pi catalog metadata. Keep image blocks enabled
    // and let that endpoint return an explicit capability error if its selected
    // model is text-only; silently dropping a user image is never acceptable.
    input: builtin?.input ?? ["text", "image"],
    cost: builtin?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // Unknown routes inherit the GPT-5.6 Sol capacity baseline so a missing
    // catalog entry does not unnecessarily constrain long-form writing runs.
    contextWindow: builtin?.contextWindow ?? 272_000,
    maxTokens: builtin?.maxTokens ?? 128_000,
    ...(builtin?.headers ? { headers: builtin.headers } : {}),
    ...(Object.keys(thinkingLevelMap).length > 0 ? { thinkingLevelMap } : {}),
    ...(compat ? { compat } : {})
  } as Model<Api>;
  const streams = providerStreams(config.api);
  const isOllamaProvider = isOllamaProviderName(config.provider);
  const isKeylessLocalProvider = ["ollama", "lm-studio"].includes(
    config.provider.trim().toLowerCase()
  );
  const streamFn = (
    requestModel: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions
  ) => streams.streamSimple(
    requestModel,
    applyOllamaToolSchemaCompatibility(
      enforceProviderToolSchemaCompatibility(context),
      config.provider,
      compatibility.ollamaToolSchemaProfile
    ),
    {
      ...options,
      ...(mandatoryZaiThinkingFallback
        ? { reasoning: mandatoryZaiThinkingFallback }
        : {}),
      ...(effectiveTemperature !== undefined
        ? { temperature: effectiveTemperature }
        : {}),
      ...(config.apiKey
        ? { apiKey: config.apiKey }
        : isKeylessLocalProvider
          ? { apiKey: config.provider.trim().toLowerCase() }
          : options?.apiKey
            ? { apiKey: options.apiKey }
            : {})
    }
  );
  return { model, streamFn: streamFn as StreamFn };
}

/** @internal Exported for protocol regression tests. */
export function toToolStreamRuntimeEvent(
  streamEvent: ToolCallAssistantEvent,
  input: AgentRunInput,
  runtime: AgentRuntimeRef,
  messageId: string,
  assistantTurnIndex: number
): Extract<AgentRuntimeEvent, { type: "agent.tool_stream" }> {
  const content = streamEvent.partial.content[streamEvent.contentIndex];
  const toolCall = content?.type === "toolCall" ? content : undefined;
  const argumentsSnapshot = toolCallArgumentsSnapshot(streamEvent, toolCall);
  const phase = streamEvent.type === "toolcall_start"
    ? "start"
    : streamEvent.type === "toolcall_delta"
      ? "delta"
      : "end";
  return {
    type: "agent.tool_stream",
    runId: input.runId,
    sessionId: input.sessionId,
    payload: {
      streamId: `${messageId}:${assistantTurnIndex}:${streamEvent.contentIndex}`,
      ...(toolCall?.id ? { toolCallId: toolCall.id } : {}),
      ...(toolCall?.name ? { toolName: toolCall.name } : {}),
      phase,
      argumentsDelta: streamEvent.type === "toolcall_delta" ? streamEvent.delta : "",
      ...(argumentsSnapshot !== undefined ? { argumentsSnapshot } : {}),
      ...(streamEvent.type === "toolcall_end"
        ? { args: streamEvent.toolCall.arguments }
        : {}),
      runtime
    }
  };
}

function serializedToolArguments(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  if (Object.keys(value).length === 0) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/** @internal Exported for protocol regression tests. */
export function toolCallArgumentsSnapshot(
  streamEvent: ToolCallAssistantEvent,
  toolCall: Extract<AssistantMessage["content"][number], { type: "toolCall" }> | undefined
): string | undefined {
  const providerToolCall = toolCall as
    | (typeof toolCall & { partialJson?: unknown; partialArgs?: unknown })
    | undefined;
  for (const candidate of [providerToolCall?.partialJson, providerToolCall?.partialArgs]) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  if (streamEvent.type === "toolcall_end") {
    return serializedToolArguments(streamEvent.toolCall.arguments);
  }
  if (streamEvent.type === "toolcall_start") {
    return serializedToolArguments(toolCall?.arguments);
  }
  return undefined;
}

/** @internal Exported for protocol regression tests. */
export function reconcileToolCallArguments(
  current: string,
  incomingDelta: string,
  snapshot?: string
): { delta: string; next: string } {
  let delta = incomingDelta;
  if (snapshot !== undefined) {
    if (snapshot.startsWith(current)) {
      delta = snapshot.slice(current.length);
    } else if (current.startsWith(snapshot)) {
      delta = "";
    } else if (!current) {
      delta = snapshot;
    }
  }
  return { delta, next: `${current}${delta}` };
}

/**
 * Converts one raw assistant terminal message into the internal accounting
 * event. This runs outside `toRuntimeEvents` because retryable failures are
 * intentionally withheld from the presentation event stream.
 *
 * @internal Exported for accounting protocol regression tests.
 */
export function toUsageObservedRuntimeEvent(
  message: AssistantMessage,
  input: AgentRunInput,
  runtime: AgentRuntimeRef,
  messageId: string,
  attempt: AgentTurnAttempt
): Extract<AgentRuntimeEvent, { type: "agent.usage_observed" }> | undefined {
  const usage = normalizeUsage(message.usage);
  if (!usage) return undefined;
  const status: AgentUsageObservationStatus = message.stopReason === "aborted"
    ? "aborted"
    : message.stopReason === "error" || message.errorMessage
      ? "error"
      : "completed";
  return {
    type: "agent.usage_observed",
    runId: input.runId,
    sessionId: input.sessionId,
    payload: {
      observationId: `${attempt.turnId}:attempt:${attempt.attempt}`,
      observedAt: new Date().toISOString(),
      messageId,
      turnId: attempt.turnId,
      attempt: attempt.attempt,
      status,
      hadToolCall: message.content.some((item) => item.type === "toolCall"),
      usage,
      runtime
    }
  };
}

/** @internal Exported for runtime event contract tests. */
export function toRuntimeEvents(
  event: AgentEvent,
  input: AgentRunInput,
  runtime: AgentRuntimeRef,
  messageId: string
): AgentRuntimeEvent[] {
  if (event.type === "tool_execution_update") {
    const details = (event.partialResult as { details?: unknown } | undefined)?.details;
    if (isSubagentToolProgressDetails(details)) {
      return toSubagentRuntimeEvents(details.progress, input, runtime, messageId);
    }
    return [];
  }

  if (event.type === "tool_execution_start") {
    return [{
      type: "agent.tool_requested",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        runtime
      }
    }];
  }

  if (event.type === "tool_execution_end") {
    const events: AgentRuntimeEvent[] = [{
      type: "agent.tool_completed",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        resultSummary: summarizeToolResult(event.result),
        isError: event.isError,
        runtime
      }
    }];
    const details = (event.result as { details?: unknown } | undefined)?.details;
    if (isShortWorkspaceToolDetails(details)) {
      if (
        details.kind === "workspace-editor-mutation" ||
        details.kind === "workspace-character-file-mutation" ||
        details.kind === "workspace-character-structure-mutation" ||
        details.kind === "workspace-expert-draft-file-mutation" ||
        details.kind === "workspace-expert-draft-section-creation" ||
        details.kind === "workspace-expert-draft-section-rename" ||
        details.kind === "workspace-expert-draft-section-deletion"
      ) {
        const text =
          details.kind === "workspace-character-structure-mutation"
            ? details.mutation.type === "deleteItem"
              ? details.mutation.deletedText
              : details.mutation.type === "updateItem"
                ? `${details.mutation.previousTitle} → ${details.mutation.title}`
                : details.mutation.type === "moveItem"
                  ? `${details.mutation.title}：${details.mutation.direction === "up" ? "上移" : "下移"}`
                  : `创建：${details.mutation.title}`
            :
          details.kind === "workspace-expert-draft-section-creation"
            ? details.sections
                .map(
                  (section, index) =>
                    `${index + 1}. ${section.title}${section.wordCountRequirement ? `（${section.wordCountRequirement}）` : ""}`
                )
                .join("\n")
            : details.kind === "workspace-expert-draft-section-rename"
              ? `${details.previousTitle} → ${details.title}`
              : details.kind === "workspace-expert-draft-section-deletion"
                ? `删除：${details.title}`
                : details.text;
        events.push({
          type: "workspace.editor_mutation",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            workspaceId: details.workspaceId,
            stageId: details.stageId,
            text,
            ...(details.kind === "workspace-expert-draft-file-mutation"
              ? {
                  mutationTarget: {
                    kind: "expert-draft-file" as const,
                    documentId: details.documentId,
                    sectionId: details.sectionId,
                    fileKind: details.fileKind
                  }
                }
              : details.kind === "workspace-character-file-mutation"
                ? {
                    mutationTarget: {
                      kind: "character-file" as const,
                      documentId: details.documentId,
                      ...(details.itemId ? { itemId: details.itemId } : {})
                    }
                  }
              : details.kind === "workspace-character-structure-mutation"
                ? {
                    mutationTarget: {
                      kind: "character-structure" as const,
                      mutation: details.mutation
                    }
                  }
              : details.kind === "workspace-expert-draft-section-creation"
                ? {
                    mutationTarget: {
                      kind: "expert-draft-section-creation" as const,
                      sections: details.sections,
                      ...(details.afterSectionId
                        ? { afterSectionId: details.afterSectionId }
                        : {})
                    }
                  }
              : details.kind === "workspace-expert-draft-section-rename"
                ? {
                    mutationTarget: {
                      kind: "expert-draft-section-rename" as const,
                      sectionId: details.sectionId,
                      previousTitle: details.previousTitle,
                      title: details.title
                    }
                  }
              : details.kind === "workspace-expert-draft-section-deletion"
                ? {
                    mutationTarget: {
                      kind: "expert-draft-section-deletion" as const,
                      sectionId: details.sectionId,
                      title: details.title
                    }
                  }
              : {}),
            baseRevision: details.baseRevision,
            summary: details.summary,
            runtime
          }
        });
      } else if (details.kind === "workspace-stage-selection") {
        events.push({
          type: "workspace.stage_selection",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            workspaceId: details.workspaceId,
            stageId: details.stageId,
            runtime
          }
        });
      }
    } else if (
      isLibraryAgentToolDetails(details) &&
      (details.kind === "library-entry-mutation" ||
        details.kind === "library-overview-mutation")
    ) {
      events.push({
        type: "library.editor_mutation",
        runId: input.runId,
        sessionId: input.sessionId,
        payload: details.kind === "library-overview-mutation"
          ? {
              toolCallId: event.toolCallId,
              operation: details.operation,
              domain: details.domain,
              libraryId: details.libraryId,
              documentId: details.documentId,
              title: details.title,
              text: details.text,
              baseRevision: details.baseRevision,
              ...(details.baseProjectRevision === undefined
                ? {}
                : { baseProjectRevision: details.baseProjectRevision }),
              summary: details.summary,
              runtime
            }
          : details.operation === "create"
          ? {
              toolCallId: event.toolCallId,
              operation: details.operation,
              domain: details.domain,
              libraryId: details.libraryId,
              stageId: details.stageId,
              title: details.title,
              text: details.text,
              baseRevision: details.baseRevision,
              ...(details.baseProjectRevision === undefined
                ? {}
                : { baseProjectRevision: details.baseProjectRevision }),
              summary: details.summary,
              runtime
            }
          : {
              toolCallId: event.toolCallId,
              operation: details.operation,
              domain: details.domain,
              libraryId: details.libraryId,
              entryId: details.entryId,
              documentId: details.documentId,
              stageId: details.stageId,
              title: details.title,
              text: details.text,
              baseRevision: details.baseRevision,
              ...(details.baseProjectRevision === undefined
                ? {}
                : { baseProjectRevision: details.baseProjectRevision }),
              summary: details.summary,
              runtime
            }
      });
    } else if (isLearningImitationToolDetails(details)) {
      events.push({
        type: "learning_imitation.result_updated",
        runId: input.runId,
        sessionId: input.sessionId,
        payload: {
          toolCallId: event.toolCallId,
          stageId: details.stageId,
          update: details.update,
          runtime
        }
      });
    } else if (isSubagentAuthoringToolDetails(details)) {
      events.push({
        type: "subagent_authoring.draft_updated",
        runId: input.runId,
        sessionId: input.sessionId,
        payload: {
          toolCallId: event.toolCallId,
          draft: details.draft,
          runtime
        }
      });
    } else if (isLongAgentToolDetails(details)) {
      if (details.kind === "long-mutation-proposal") {
        events.push({
          type: "long.mutation_proposal",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            bookId: details.bookId,
            agentId: details.agentId,
            batch: details.batch,
            baseProjectRevision: details.baseProjectRevision,
            summary: details.summary,
            runtime
          }
        });
      } else if (details.kind === "long-worldbuilding-file-proposal") {
        events.push({
          type: "long.worldbuilding_file_proposal",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            bookId: details.bookId,
            agentId: details.agentId,
            batch: details.batch,
            baseProjectRevision: details.baseProjectRevision,
            summary: details.summary,
            files: details.files,
            runtime
          }
        });
      } else if (details.kind === "long-character-file-proposal") {
        events.push({
          type: "long.character_file_proposal",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            bookId: details.bookId,
            agentId: details.agentId,
            batch: details.batch,
            baseProjectRevision: details.baseProjectRevision,
            summary: details.summary,
            files: details.files,
            runtime
          }
        });
      } else if (details.kind === "long-continuity-file-proposal") {
        events.push({
          type: "long.continuity_file_proposal",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            bookId: details.bookId,
            agentId: details.agentId,
            batch: details.batch,
            baseProjectRevision: details.baseProjectRevision,
            summary: details.summary,
            files: details.files,
            runtime
          }
        });
      } else if (details.kind === "long-chapter-write-proposal") {
        events.push({
          type: "long.chapter_write_proposal",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            bookId: details.bookId,
            agentId: details.agentId,
            batch: details.batch,
            baseProjectRevision: details.baseProjectRevision,
            file: details.file,
            summary: details.summary,
            runtime
          }
        });
      } else if (details.kind === "long-ledger-commit-proposal") {
        events.push({
          type: "long.ledger_commit_proposal",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            bookId: details.bookId,
            agentId: details.agentId,
            input: details.input,
            summary: details.summary,
            runtime
          }
        });
      } else if (details.kind === "long-chapter-dispatch-proposal") {
        events.push({
          type: "long.chapter_dispatch_proposal",
          runId: input.runId,
          sessionId: input.sessionId,
          payload: {
            toolCallId: event.toolCallId,
            bookId: details.bookId,
            agentId: details.agentId,
            scope: details.scope,
            chapterCardId: details.chapterCardId,
            title: details.title,
            chapters: details.chapters,
            workspaceRevision: details.workspaceRevision,
            projectRevision: details.projectRevision,
            summary: details.summary,
            runtime
          }
        });
      }
    }
    return events;
  }

  if (event.type === "message_update" && isAssistantMessage(event.message)) {
    const streamEvent = event.assistantMessageEvent;
    if (streamEvent.type === "text_delta") {
      return [{
        type: "agent.delta",
        runId: input.runId,
        sessionId: input.sessionId,
        payload: { messageId, delta: streamEvent.delta, runtime }
      }];
    }
    if (streamEvent.type === "thinking_delta") {
      return [{
        type: "agent.thinking_delta",
        runId: input.runId,
        sessionId: input.sessionId,
        payload: { messageId, delta: streamEvent.delta, runtime }
      }];
    }
  }

  if (event.type === "message_end" && isAssistantMessage(event.message)) {
    if (
      event.message.stopReason === "error" ||
      event.message.stopReason === "aborted" ||
      event.message.errorMessage
    ) {
      return [{
        type: "agent.error",
        runId: input.runId,
        sessionId: input.sessionId,
        payload: {
          code:
            event.message.stopReason === "aborted"
              ? "pi_agent.aborted"
              : "pi_agent.provider_error",
          message:
            event.message.errorMessage ??
            (event.message.stopReason === "aborted"
              ? "智能体运行已中止。"
              : "模型返回错误终态。"),
          runtime
        }
      }];
    }

    if (event.message.content.some((item) => item.type === "toolCall")) {
      return [];
    }

    const thinking = readAssistantThinking(event.message);
    const usage = normalizeUsage(event.message.usage);
    return [{
      type: "agent.completed",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: {
        messageId,
        content: readAssistantText(event.message),
        ...(thinking ? { thinking } : {}),
        ...(event.message.stopReason ? { stopReason: event.message.stopReason } : {}),
        ...(usage ? { usage } : {}),
        runtime
      }
    }];
  }

  return [];
}

/** @internal Exported for subagent protocol regression tests. */
export function toSubagentRuntimeEvents(
  progress: SubagentToolProgress,
  input: AgentRunInput,
  runtime: AgentRuntimeRef,
  messageId: string
): AgentRuntimeEvent[] {
  const progressRuntime = progress.runtime ?? runtime;
  const base = {
    parentToolCallId: progress.parentToolCallId,
    subagentRunId: progress.subagentRunId,
    subagentId: progress.subagentId,
    name: progress.name,
    runtime: progressRuntime
  };
  if (progress.type === "started") {
    return [{
      type: "subagent.started",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: { ...base, task: progress.task }
    }];
  }
  if (progress.type === "activity") {
    return [{
      type: "subagent.activity",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: { ...base, activity: progress.activity }
    }];
  }
  if (progress.type === "completed") {
    return [{
      type: "subagent.completed",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: {
        ...base,
        status: progress.status,
        summary: progress.summary,
        ...(progress.errorMessage ? { errorMessage: progress.errorMessage } : {}),
        ...(progress.usage ? { usage: progress.usage } : {})
      }
    }];
  }

  if (progress.type === "usage_observed") {
    return [{
      type: "agent.usage_observed",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: {
        observationId: progress.observationId,
        observedAt: progress.observedAt,
        messageId: progress.messageId,
        turnId: progress.turnId,
        attempt: progress.attempt,
        status: progress.status,
        hadToolCall: progress.hadToolCall,
        usage: progress.usage,
        runtime: progress.runtime,
        parentToolCallId: progress.parentToolCallId,
        subagentRunId: progress.subagentRunId,
        subagentId: progress.subagentId
      }
    }];
  }

  if (progress.type !== "child_tool_details") return [];

  // Child workspace mutations remain ordinary parent-run workspace events so
  // the existing review/approval chain can process them. Only their tool-call
  // id is namespaced to the ephemeral child run.
  return toRuntimeEvents(
    {
      type: "tool_execution_end",
      toolCallId: progress.toolCallId,
      toolName: progress.toolName,
      result: progress.result,
      isError: progress.isError
    },
    input,
    runtime,
    messageId
  ).filter(
    (event) =>
      event.type === "workspace.editor_mutation" ||
      event.type === "workspace.stage_selection" ||
      event.type === "long.mutation_proposal" ||
      event.type === "long.worldbuilding_file_proposal" ||
      event.type === "long.character_file_proposal" ||
      event.type === "long.continuity_file_proposal" ||
      event.type === "long.chapter_dispatch_proposal" ||
      event.type === "long.chapter_write_proposal" ||
      event.type === "long.ledger_commit_proposal"
  );
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return typeof message === "object" && message !== null && message.role === "assistant";
}

function readAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
}

function readAssistantThinking(message: AssistantMessage): string {
  return message.content
    .filter((item) => item.type === "thinking")
    .map((item) => item.thinking)
    .join("\n\n");
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
      if (text) {
        return text.slice(0, 4_000);
      }
    }
  }
  if (result === undefined || result === null) {
    return "工具执行完成。";
  }
  try {
    const summary = JSON.stringify(result);
    return summary ? summary.slice(0, 4_000) : "工具执行完成。";
  } catch {
    return "工具已执行完成。";
  }
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

function buildDeepWriteSystemPrompt(): string {
  return [
    "你是墨枢的本地创作协作智能体。",
    "用户当前明确提出的要求优先；当前实时文稿是本轮工作对象，不得凭空推翻已提供的作品事实。",
    "技能是写作方法，不是作品事实；素材是参考信息，不能自动升级为作品设定。",
    "只能声称使用了本轮上下文快照中实际提供或显式附加的内容。",
    "只能调用本轮实际列出的工具；没有列出的写回、保存、文件、Shell、HTTP 或浏览器能力不得声称已经执行。",
    "回复使用结构清晰的中文纯文本，并明确区分建议、示例和已确认事实。"
  ].join("\n");
}

function scriptRuntimeFormatRequirements(): string {
  return [
    SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS.trim(),
    "调用 write_draft_section（file=body）或 replace_draft_section_text（file=body）时，必须只提交符合上述格式的剧本正文；不得混入 Markdown 表格、分析标题或格式讲解。"
  ].join("\n");
}

function renderCreativePlotStructure(
  workspace:
    | NonNullable<WorkspaceRuntimeContext["shortWorkspace"]>
    | NonNullable<WorkspaceRuntimeContext["scriptWorkspace"]>
): string {
  return workspace.plotStages
    .map(
      (stage, index) =>
        `${index + 1}. ${stage.title}（${stage.id}）\n   阶段边界与交付标准：${stage.description}`
    )
    .join("\n");
}

function renderActiveDraftSectionContext(
  workspace:
    | NonNullable<WorkspaceRuntimeContext["shortWorkspace"]>
    | NonNullable<WorkspaceRuntimeContext["scriptWorkspace"]>,
  workspaceKind: "短篇" | "剧本"
): string | undefined {
  if (!workspace.activeSectionId) return undefined;
  const index = workspace.expertDraft.sections.findIndex(
    (section) => section.id === workspace.activeSectionId
  );
  if (index < 0) return undefined;
  const section = workspace.expertDraft.sections[index]!;
  const unitLabel = workspaceKind === "剧本" ? "剧集" : "小节";
  return [
    `【当前用户正在操作的${unitLabel}】`,
    `标题：${section.title}`,
    `section_id：${section.id}`,
    `目录位置：第 ${index + 1} / ${workspace.expertDraft.sections.length} ${workspaceKind === "剧本" ? "集" : "节"}`,
    `字数要求：${section.wordCountRequirement || "未设置"}`,
    `本轮用户界面焦点已锁定到该${unitLabel}；只处理当前${unitLabel}的请求默认作用于此 section_id，整篇或跨${unitLabel}任务仍可显式指定其它 section_id。`
  ].join("\n");
}

/** @internal Exported for workspace-type prompt regression tests. */
export function buildEffectiveSystemPrompt(
  basePrompt: string,
  input: AgentRunInput
): string {
  const subagentAuthoring = input.workspaceContext?.subagentAuthoring;
  if (subagentAuthoring) {
    return [
      basePrompt,
      "",
      "【当前任务：技能转子智能体】",
      renderSubagentAuthoringSystemPrompt(subagentAuthoring).trim(),
      "",
      "【墨枢技能转子智能体工具边界】",
      "只能使用本轮列出的技能读取与草稿写入工具。write_subagent_draft 只更新预览区，不会写入智能体团队；正式加入必须等待用户在界面中确认。"
    ].join("\n");
  }
  const learningProfile = input.learningImitationProfile;
  const learningContext = input.workspaceContext?.learningImitation;
  if (learningProfile && learningContext) {
    const writeBoundary =
      input.writeApprovalMode === "auto-approve"
        ? "只能使用本轮列出的样本文档读取、搜索与预览写入工具。write_learning_result 更新预览区后，客户端会立即把结果加入后台串行落盘队列并写入预先选择的目标库；若目标库尚未选全则保留预览。界面确认成功前不得声称已正式落盘。"
        : "只能使用本轮列出的样本文档读取、搜索与预览写入工具。write_learning_result 只更新预览区，不会写入正式素材库或技能库。正式落盘必须等待用户在界面中确认。";
    return [
      basePrompt,
      "",
      `【当前学习仿写智能体：${learningProfile.label} / ${learningProfile.id}】`,
      renderLearningImitationSystemPrompt(
        learningProfile.systemPrompt,
        learningContext
      ).trim(),
      "",
      "【墨枢学习仿写工具边界】",
      writeBoundary
    ].join("\n");
  }
  const libraryProfile = input.libraryAgentProfile;
  const libraryWorkspace = input.workspaceContext?.libraryWorkspace;
  if (libraryProfile && libraryWorkspace) {
    const writeBoundary =
      input.writeApprovalMode === "auto-approve"
        ? "写入工具只提交资料库条目或库介绍变更；提案生成后客户端会立即加入后台串行队列、自动批准并尝试保存。智能体可以继续当前回复，但在审批卡确认成功前不得声称已经保存成功。"
        : "写入工具提交待用户审阅的资料库条目或库介绍变更；用户接受后客户端才会保存到本地文件，当前回复不得提前声称已经保存。";
    return [
      basePrompt,
      "",
      `【当前资料库智能体：${libraryProfile.label} / ${libraryProfile.domain}】`,
      libraryProfile.systemPrompt.trim(),
      "",
      "【墨枢当前资料库工具边界】",
      "写入只允许管理本轮指定的当前资料库；若该库属于分组，list/read/search 也可读取同分组其它成员库条目，但不得写入那些库。",
      "条目正文必须通过本轮实际列出的读取和搜索工具按需取得。",
      "需要整理、创建或初始化等方法时，调用 load_skill 按需加载本轮可用技能；技能是方法，不会自动成为资料库事实。",
      libraryWorkspace.readOnly
        ? "当前资料库只读，本轮不会装配任何创建或编辑工具。"
        : writeBoundary,
      "当前库介绍可通过本轮列出的介绍编辑工具修改；删除条目、修改分组、绑定书籍和写入其它资料库均未接通。"
    ].join("\n");
  }
  const longWorkspace = input.workspaceContext?.longWorkspace;
  const longProfile = input.longAgentProfile;
  if (longProfile && longWorkspace) {
    const writeBoundary =
      input.writeApprovalMode === "auto-approve"
        ? "长篇写入工具只形成带基线版本和影响预览的提案；提案生成后客户端会立即加入按书籍串行的后台队列，自动完成影响预览、冲突检查和原子落盘。智能体可以继续当前回复，但在审批卡确认成功前不得声称已经保存或提交账本。"
        : "长篇写入工具只形成带基线版本和影响预览的提案；用户明确批准且冲突检查通过后才会原子落盘。不得提前声称已经保存或提交账本。";
    return [
      basePrompt,
      "",
      longProfile.id === "setting"
        ? `【当前长篇智能体：${longProfile.label}】`
        : `【当前长篇智能体：${longProfile.label} / ${longProfile.id}】`,
      longProfile.systemPrompt.trim(),
      "",
      "【墨枢长篇工具边界】",
      "四个长篇智能体读取互通：设定用 list_setting / search_setting / read_setting（指定 domain=worldbuilding 或 domain=character），剧情用 list_plot_design / search_plot_design / read_plot_design，正文、章末人物状态与接续包用 list_chapters / search_chapters / read_chapter（document 可选 body / character_state / handoff），按章连续性文件用 list_continuity_files / read_continuity_file；写入仍只限当前阶段自身范围。",
      longProfile.id === "setting"
        ? "设定只使用本次固定上下文或工具返回的业务 ID 定位内容：世界观用 category_id / item_id，人物用 character_id / document。设定内容的查询、搜索和读取使用 list_setting / search_setting / read_setting，并指定 domain=worldbuilding 或 domain=character；其它阶段内容用各自阶段的 list / search / read 工具只读查阅。固定上下文目录已经完整列出目标时，不要仅为重复取得同一列表而调用 list_setting。目录标注存在省略项或需要核验本轮结构变更时再调用列表工具。长篇结构导航已写入固定上下文，仅供对照剧情框架；不得把剧情正文写入本轮固定上下文，也不得修改剧情结构。工具会处理其余实现细节，不得索取、猜测或复述。未读取正文不得当成事实。"
        : longProfile.id === "plot_design"
          ? "剧情设计只使用本次固定上下文或工具返回的业务 ID 定位内容：全书故事线用 book_line，分卷、剧情点、故事情节、章卡、故事事件、事件连接和叙事落点用各自稳定业务 ID。查询、搜索和读取使用 list_plot_design / search_plot_design / read_plot_design。世界观与人物目录已写入本轮固定上下文；条目正文仍须通过 list_setting / search_setting / read_setting（指定 domain=worldbuilding 或 domain=character）按需读取。目录已经完整列出目标时，不要仅为重复取得同一列表而调用 list_setting。不得把设定正文或 fileId 写入本轮固定上下文。不得使用底层索引、路径或 fileId，未读取内容不得当成事实。"
        : longProfile.id === "draft"
          ? "写手只使用本次固定上下文或工具返回的业务 ID 定位内容：世界观用 category_id / item_id，人物用 character_id / document，剧情与章节用各自稳定业务 ID。查询、搜索和读取使用 list_setting / search_setting / read_setting（指定 domain=worldbuilding 或 domain=character），以及剧情和章节的 list / search / read 工具。世界观、人物目录与长篇结构导航已写入本轮固定上下文；条目正文仍须按需读取。目录已经完整列出目标时，不要仅为重复取得同一列表而调用 list_setting。不得把设定正文、剧情正文或 fileId 写入本轮固定上下文。不得使用底层索引、路径或 fileId，未读取内容不得当成事实。"
        : longProfile.id === "continuity_ledger"
          ? "连续性账本只使用 list_setting / search_setting / read_setting（指定 domain）以及剧情和正文各阶段的 list / search / read 工具及其业务 ID；不得使用底层索引、路径或 fileId，未读取内容不得当成事实。"
          : "长篇项目只在本轮授权的 bookId 内按稳定实体 ID 和 fileId 查询；不得猜测路径，也不得把未读取内容当成事实。",
      writeBoundary,
      longProfile.id === "plot_design"
        ? "连续性记录只提供按章参考，不锁定章卡、故事情节或伏笔结构。允许创建、删除、移动和重排已有记录的章卡；删除章卡时客户端会在危险确认后级联清理该章正文、连续性文件和记录索引。章卡必须指定所属分卷，剧情点关联可为 null；非空时必须与章卡属于同一分卷。调用 create_plot_design 或 propose_long_mutation 前必须核对二者；跨卷移动章卡时可改绑目标卷内剧情点或解除关联。移动或删除剧情点只解除章卡的弱关联，不移动或删除章卡。同一次运行形成多个有效提案时，客户端会按先后依赖等待前序提案处理，并基于最新工作区重新预览；不得把待审提案说成已经落盘。故事情节或章卡的纯正文写入也会按文件修订等待前序创建或写入完成。工具返回未形成提案时，必须向用户解释约束，不得要求审批不存在的卡片。"
        : "",
      longProfile.id === "draft"
        ? "写手只允许为上下文锁定的当前章形成小说正文提案；不得生成或修改人物状态、handoff、接续包及其它连续性文件，这些内容由连续性账本智能体在正文获批后独立处理。未锁定章卡时只做规划、检查和调度，不得写入正文。"
        : "",
      longProfile.id === "continuity_ledger"
        ? "连续性阶段以按章文本文件留存章末状态、接续包，以及按需创建的世界观揭露和人物当前状态/历史轨迹。可对任意已有正文、尚未记录的章卡写入；未选中章卡时必须带 chapter_card_id。多张未记录章可一次追记：list_continuity_files 的 pending_catchup 中前文 brief 只写简短章末状态与接续包，最后一张 full 写完整账本。伏笔总览是唯一设计源：只核验 list_continuity_files 返回的本章既有伏笔触点，以 foreshadowing_id、beat_id、committed/missed 和正文证据登记变化；没有候选时不得写伏笔变化或‘本章无变化’，也不得自行新增伏笔。先 list/read，再 create/write/edit；仅当可选文件误创建或不再适用时使用 delete_continuity_file。每章文件完成后调用 propose_continuity_commit 登记内部归档；客户端会在文件卡全部获批后自动执行，不产生第二次审批。不得调用旧式 set_long_ledger_* 工作流。"
        : ""
    ]
      .filter(Boolean)
      .join("\n");
  }
  const scriptWorkspace = input.workspaceContext?.scriptWorkspace;
  const shortWorkspace = input.workspaceContext?.shortWorkspace;
  const writingWorkspace = scriptWorkspace ?? shortWorkspace;
  const profile = input.scriptAgentProfile ?? input.agentProfile;
  if (!profile) return basePrompt;
  const workspaceKind = scriptWorkspace ? "剧本" : "短篇";
  const draftUnit = scriptWorkspace ? "剧集" : "章节";
  const activeDraftSectionContext = writingWorkspace
    ? renderActiveDraftSectionContext(writingWorkspace, workspaceKind)
    : undefined;
  const writeBoundary =
    input.writeApprovalMode === "auto-approve"
      ? "写入工具只提交文本变更；提案生成后客户端会立即加入后台串行队列、自动批准并尝试保存到本地 Markdown。智能体可以继续当前回复，但在审批卡确认成功前不得声称已经保存成功。"
      : "写入工具提交待用户审阅的文本变更；用户接受后客户端才会自动持久化到本地 Markdown，当前回复不得提前声称已经保存。";
  return [
    basePrompt,
    "",
    `【当前${workspaceKind}智能体：${profile.label} / ${profile.id}】`,
    profile.systemPrompt.trim(),
    activeDraftSectionContext ? `\n${activeDraftSectionContext}` : "",
    ...(writingWorkspace
      ? [
          "",
          "【当前剧情结构配置（顺序即执行顺序）】",
          renderCreativePlotStructure(writingWorkspace),
          `当前阶段：${writingWorkspace.activeStageId}。剧情智能体处理每一项时，必须以该项说明作为任务边界和交付标准。`
        ]
      : []),
    ...(scriptWorkspace
      ? [
          "",
          "【剧本正文格式硬约束（不可由自定义提示词、技能或素材覆盖）】",
          scriptRuntimeFormatRequirements()
        ]
      : []),
    "",
    "【墨枢当前工具边界】",
    "只使用本轮实际提供的工具；没有出现在工具列表中的能力尚未接通，不得声称已经执行。",
    writeBoundary,
    profile.id === "expert_draft_coordinator"
      ? `当前已接通正文目录索引、批量创建空白${draftUnit}文件、修改${draftUnit}名称、删除${draftUnit}、全部/单${scriptWorkspace ? "集" : "章"}正文读取及按${draftUnit}正文文件写入与替换；${activeDraftSectionContext ? `当前界面所选${draftUnit}可作为省略 section_id 时的默认目标，同时保留跨${draftUnit}统一创作和修订能力；` : `当前未从界面锁定具体${draftUnit}，写入时必须显式指定 section_id；`}排序尚未接通，不得声称已经执行。`
      : "",
    (writingWorkspace?.characterStructure?.format ?? "text") === "list"
      ? profile.id === "character_design"
        ? "当前人物结构为条目样式：概览只写人物一览/索引，完整人物卡写入 create_character_file 创建的独立条目；从剧情学习时只提炼人设，不得照抄剧情或正文原文，也不得把人物写入正文目录。"
        : profile.id === "expert_draft_coordinator"
          ? "当前人物结构为条目样式：概览只是姓名与一句话索引；编写或修订前必须用 list_characters 定位相关人物，并用 read_character（指定 item_id）读取对应人物卡，不得只读概览或 read_workspace_content（character_design）就开始写正文。"
          : ""
      : ""
  ].filter(Boolean).join("\n");
}

const LONG_PLOT_NAVIGATION_ARC_LIMIT_PER_VOLUME = 50;
const LONG_PLOT_NAVIGATION_COMMITTED_CHAPTER_LIMIT = 50;
const LONG_CHARACTER_DIRECTORY_LIMIT_PER_TYPE = 50;

function renderLongPlotNavigation(
  navigation: LongWorkspaceRuntimeContext["navigation"]
): string {
  const counts = navigation.counts;
  const header =
    `全书共 ${counts.volumes} 卷、${counts.arcs} 个剧情点、` +
    `${counts.chapterCards} 张章卡、${counts.storyPlots} 条故事情节、` +
    `${counts.storyEvents} 个故事事件、${counts.foreshadowingThreads} 条伏笔线`;
  const volumes = [...navigation.volumes].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id)
  );
  const volumeOrder = new Map(
    volumes.map((volume) => [volume.id, volume.order])
  );
  const orderedChapters = [...navigation.chapterCards].sort(
    (left, right) =>
      (volumeOrder.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
        (volumeOrder.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
      left.narrativeOrder - right.narrativeOrder ||
      left.id.localeCompare(right.id)
  );
  const recordedChapters = orderedChapters.filter((chapter) =>
    chapter.bodyStatus === "written"
  );
  const committedThrough = navigation.committedThroughChapterId
    ? navigation.chapterCards.find(
        (chapter) => chapter.id === navigation.committedThroughChapterId
      )
    : undefined;
  const visibleRecordedChapters = recordedChapters.slice(
    0,
    LONG_PLOT_NAVIGATION_COMMITTED_CHAPTER_LIMIT
  );
  const recordedOverflow =
    recordedChapters.length - visibleRecordedChapters.length;
  const committedStatus = counts.committedChapters
    ? [
        `连续性记录：${counts.committedChapters} 章；最高连续记录位置为${
          committedThrough
            ? `「${committedThrough.title}」(${committedThrough.id})`
            : `章卡 ${navigation.committedThroughChapterId ?? "未知"}`
        }。记录只作参考，不锁定正文或结构。`,
        `已有正文章卡（由早到晚）：${visibleRecordedChapters
          .map((chapter) => `「${chapter.title}」(${chapter.id})`)
          .join("、")}${
          recordedOverflow > 0
            ? `；另有 ${recordedOverflow} 张已有正文章卡未列出`
            : ""
        }`
      ].join("\n")
    : "连续性记录：0 章。记录不会限制正文写作或结构调整。";
  const lines = volumes.map((volume) => {
    const arcs = navigation.arcs
      .filter((arc) => arc.volumeId === volume.id)
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id)
      );
    const visible = arcs.slice(0, LONG_PLOT_NAVIGATION_ARC_LIMIT_PER_VOLUME);
    const listing = visible.length
      ? visible.map((arc) => `「${arc.title}」(${arc.id})`).join("、")
      : "暂无剧情点";
    const overflow = arcs.length - visible.length;
    return `- 第 ${volume.order} 卷「${volume.title}」(${volume.id}): ${listing}${
      overflow > 0 ? `；另有 ${overflow} 个剧情点未列出` : ""
    }`;
  });
  return `${header}\n${committedStatus}\n${lines.join("\n")}`;
}

function renderLongPlotFocus(focus: LongPlotFocusSnapshot): string {
  switch (focus.section) {
    case "book_line":
      return "全书故事线";
    case "foreshadowing":
      return "伏笔总览";
    case "plot_point":
      return focus.arcId
        ? `剧情点「${focus.arcTitle}」(${focus.arcId})，所属分卷「${focus.volumeTitle}」(${focus.volumeId})`
        : `分卷「${focus.volumeTitle}」(${focus.volumeId}) 的剧情点列表，尚未选中具体剧情点`;
    case "chapter_card":
      return focus.chapterCardId
        ? `章卡「${focus.chapterCardTitle}」(${focus.chapterCardId})，所属分卷「${focus.volumeTitle}」(${focus.volumeId})`
        : `分卷「${focus.volumeTitle}」(${focus.volumeId}) 的章卡列表，尚无章卡`;
  }
}

function renderLongWorldbuildingDirectory(
  directory: NonNullable<
    LongWorkspaceRuntimeContext["worldbuildingDirectory"]
  >
): string {
  const lines = directory.categories.flatMap((category) => {
    if (category.format === "text") {
      return [
        `- ${category.title}（category_id=${category.categoryId}；类型=文本）`
      ];
    }
    const header = `- ${category.title}（category_id=${category.categoryId}；类型=条目列表；共 ${category.itemCount} 项）`;
    const items = category.items.length
      ? category.items.map(
          (item) =>
            `  - ${item.title}（item_id=${item.itemId}；顺序=${item.order}）`
        )
      : ["  - 暂无条目"];
    if (category.omittedItemCount > 0) {
      items.push(
        `  - 另有 ${category.omittedItemCount} 项未进入固定上下文，需要时调用 list_setting（domain=worldbuilding）查询。`
      );
    }
    return [header, ...items];
  });
  if (directory.omittedCategoryCount > 0) {
    lines.push(
      `- 另有 ${directory.omittedCategoryCount} 个分类未进入固定上下文，需要时调用 list_setting（domain=worldbuilding）查询。`
    );
  }
  return lines.length ? lines.join("\n") : "- 暂无世界观分类";
}

function renderLongCharacterDirectory(
  navigation: LongWorkspaceRuntimeContext["navigation"]
): string {
  const types = [...navigation.characterTypes].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id)
  );
  const knownTypeIds = new Set(types.map((characterType) => characterType.id));
  const extraGroups = [
    ...new Set(
      navigation.characters
        .map((character) => character.group)
        .filter((group) => !knownTypeIds.has(group))
    )
  ].sort((left, right) => left.localeCompare(right));
  const sections = [
    ...types.map((characterType) => ({
      typeId: characterType.id,
      title: characterType.title
    })),
    ...extraGroups.map((group) => ({
      typeId: group,
      title: group
    }))
  ];
  const lines = sections.flatMap((section) => {
    const characters = navigation.characters
      .filter((character) => character.group === section.typeId)
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id)
      );
    const visible = characters.slice(0, LONG_CHARACTER_DIRECTORY_LIMIT_PER_TYPE);
    const header = `- ${section.title}（type_id=${section.typeId}；共 ${characters.length} 人）`;
    const items = visible.length
      ? visible.map(
          (character) =>
            `  - ${character.name}（character_id=${character.id}；顺序=${character.order}）`
        )
      : ["  - 暂无条目"];
    const omitted = characters.length - visible.length;
    if (omitted > 0) {
      items.push(
        `  - 另有 ${omitted} 人未进入固定上下文，需要时调用 list_setting（domain=character, type_id=${section.typeId}）查询。`
      );
    }
    return [header, ...items];
  });
  return lines.length ? lines.join("\n") : "- 暂无人物类型";
}

function renderLongWorldbuildingStageBrief(
  focus: NonNullable<LongWorkspaceRuntimeContext["worldbuildingFocus"]>,
  directory: LongWorkspaceRuntimeContext["worldbuildingDirectory"]
): string {
  const category = directory?.categories.find(
    (entry) => entry.title === focus.categoryTitle
  );
  const categoryId = category?.categoryId;
  const itemId =
    focus.currentStage.kind === "item" && category?.format === "list"
      ? category.items.find((item) => item.title === focus.currentStage.title)
          ?.itemId
      : undefined;
  const ids = [
    categoryId ? `category_id=${categoryId}` : "",
    itemId ? `item_id=${itemId}` : ""
  ]
    .filter(Boolean)
    .join("；");
  const location =
    focus.format === "list"
      ? `列表型分类「${focus.categoryTitle}」${
          focus.currentStage.kind === "item"
            ? ` / 条目「${focus.currentStage.title}」`
            : " / 分类概览"
        }${ids ? `（${ids}）` : ""}`
      : `文本型分类「${focus.categoryTitle}」${
          categoryId ? `（category_id=${categoryId}）` : ""
        }`;
  const readArgs = [
    "domain=worldbuilding",
    categoryId ? `category_id=${categoryId}` : "",
    itemId ? `item_id=${itemId}` : ""
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `当前用户所处的世界观阶段: ${location}`,
    `当前阶段简要信息: 仅定位当前页面，正文未注入；需要时调用 read_setting（${readArgs}）读取。`
  ].join("\n");
}

function renderLongCharacterStageBrief(
  focus: NonNullable<LongWorkspaceRuntimeContext["characterFocus"]>,
  navigation: LongWorkspaceRuntimeContext["navigation"]
): string {
  if (focus.currentDocument.kind === "overview") {
    return [
      "当前用户所处的人物阶段: 人物概览",
      "当前阶段简要信息: 仅定位人物概览，正文未注入；需要时调用 read_setting（domain=character, document=overview）读取。"
    ].join("\n");
  }
  const character = navigation.characters.find(
    (entry) =>
      entry.name === focus.characterName &&
      (focus.group === undefined || entry.group === focus.group)
  );
  const characterId = character?.id;
  const typeId = focus.group ?? character?.group;
  const ids = [
    characterId ? `character_id=${characterId}` : "",
    `document=${focus.currentDocument.kind}`,
    typeId ? `type_id=${typeId}` : ""
  ]
    .filter(Boolean)
    .join("；");
  const readArgs = [
    "domain=character",
    characterId ? `character_id=${characterId}` : "",
    `document=${focus.currentDocument.kind}`
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `当前用户所处的人物阶段: 「${focus.characterName}」 / ${focus.currentDocument.title}${
      ids ? `（${ids}）` : ""
    }`,
    `当前阶段简要信息: 仅定位当前人物文档，正文未注入；需要时调用 read_setting（${readArgs}）读取。`
  ].join("\n");
}

function renderLongCurrentStageSection(
  worldbuildingFocus: LongWorkspaceRuntimeContext["worldbuildingFocus"],
  characterFocus: LongWorkspaceRuntimeContext["characterFocus"],
  longWorkspace: LongWorkspaceRuntimeContext | undefined
): string {
  const parts = [
    worldbuildingFocus
      ? renderLongWorldbuildingStageBrief(
          worldbuildingFocus,
          longWorkspace?.worldbuildingDirectory
        )
      : "",
    characterFocus && longWorkspace
      ? renderLongCharacterStageBrief(characterFocus, longWorkspace.navigation)
      : ""
  ].filter(Boolean);
  return parts.length
    ? `【当前阶段信息与要求】\n${parts.join("\n")}`
    : "";
}

/** @internal Exported for prompt-boundary regression tests. */
export function buildRuntimeUserPrompt(input: AgentRunInput): string {
  const active = input.workspaceContext?.activeResource;
  const libraryContext = input.workspaceContext?.libraryWorkspace;
  const shortWorkspace = input.workspaceContext?.shortWorkspace;
  const scriptWorkspace = input.workspaceContext?.scriptWorkspace;
  const longWorkspace = input.workspaceContext?.longWorkspace;
  const writingWorkspace = scriptWorkspace ?? shortWorkspace;
  const writingProfile = input.scriptAgentProfile ?? input.agentProfile;
  const longProfile = input.longAgentProfile;
  const skills = input.workspaceContext?.attachedSkills ?? [];
  const materials = input.workspaceContext?.attachedMaterials ?? [];
  const isWritingAgentRun = Boolean(
    writingWorkspace && writingProfile
  );
  const isLibraryAgentRun = Boolean(
    libraryContext && input.libraryAgentProfile
  );
  const isSettingAgentRun = Boolean(
    longWorkspace && longProfile?.id === "setting"
  );
  const isPlotDesignAgentRun = Boolean(
    longWorkspace && longProfile?.id === "plot_design"
  );
  const injectsCrossDomainDesignSnapshots = Boolean(
    longWorkspace &&
      longProfile &&
      longAgentAcceptsWorldbuildingDirectory(longProfile.id)
  );
  const omitLongImplementationIds = injectsCrossDomainDesignSnapshots;
  const plotFocus = isPlotDesignAgentRun
    ? longWorkspace?.plotFocus
    : undefined;
  const worldbuildingFocus = isSettingAgentRun
    ? longWorkspace?.worldbuildingFocus
    : undefined;
  const characterFocus = isSettingAgentRun
    ? longWorkspace?.characterFocus
    : undefined;
  const learningContext = input.workspaceContext?.learningImitation;
  const readableSkills = writingProfile
    ? skills.filter(
        (item) =>
          item.kind !== undefined && writingProfile.readAccess.skill.includes(item.kind)
      )
    : longProfile
      ? skills.filter(
          (item) =>
            item.kind !== undefined &&
            longProfile.readAccess.skillKinds.includes(item.kind)
        )
    : input.libraryAgentProfile
      ? skills
      : skills;
  const readableMaterials = writingProfile
    ? materials.filter(
        (item) =>
          item.kind !== undefined && writingProfile.readAccess.material.includes(item.kind)
      )
    : longProfile
      ? materials.filter(
          (item) =>
            item.kind !== undefined &&
            longProfile.readAccess.materialKinds.includes(item.kind)
        )
      : materials;
  const isLongAgentRun = Boolean(longWorkspace && longProfile);
  const skillContext = isWritingAgentRun || isLibraryAgentRun || isLongAgentRun
    ? readableSkills.length
      ? isLibraryAgentRun
        ? `可按需加载的技能：\n${input.libraryAgentProfile!.readAccess.skills
            .map((skill) => `- ${skill.name}：${skill.description || "无描述"}`)
            .join("\n")}\n需要正文时调用 load_skill；name 可用完整名称或唯一短名。`
        : `可按需加载的技能：\n${readableSkills
            .map((item) => `- ${item.title} [${item.kind}]`)
            .join("\n")}\n需要正文时调用 load_skill；name 优先完整标题，也可用条目标题短名或库名（唯一命中即可）。`
      : "可按需加载的技能: 无"
    : skills.length
      ? `显式附加技能:\n${skills.map((item) => `- ${item.title}: ${item.content}`).join("\n")}`
      : "显式附加技能: 无";
  const materialContext = isWritingAgentRun || isLongAgentRun
    ? readableMaterials.length
      ? `当前读取范围内的关联素材：\n${readableMaterials
          .map((item) => `- ${item.title} [${item.kind}]`)
          .join("\n")}\n需要条目正文时调用 query_linked_material_entries。`
      : "当前读取范围内的关联素材: 无"
    : materials.length
      ? `显式附加素材:\n${materials
          .map((item) => `- ${item.title}: ${item.content}`)
          .join("\n")}`
      : "显式附加素材: 无";
  const lines = [
    "【本次智能体会话固定上下文】",
    omitLongImplementationIds
      ? ""
      : `sessionId: ${input.sessionId}`,
    omitLongImplementationIds
      ? ""
      : `runId: ${input.runId}`,
    writingWorkspace
      ? `${scriptWorkspace ? "剧本" : "短篇"}作品: 《${writingWorkspace.title}》`
      : "",
    longWorkspace ? `长篇作品: 《${longWorkspace.title}》` : "",
    longWorkspace?.agentsMd?.trim()
      ? `【长篇上下文（AGENTS.md）】\n${longWorkspace.agentsMd.trim()}`
      : "",
    injectsCrossDomainDesignSnapshots &&
    longWorkspace?.worldbuildingDirectory
      ? `【世界观条目列表（发送时快照）】\n${renderLongWorldbuildingDirectory(
          longWorkspace.worldbuildingDirectory
        )}`
      : "",
    injectsCrossDomainDesignSnapshots && longWorkspace
      ? `【人物设计列表（发送时快照）】\n${renderLongCharacterDirectory(
          longWorkspace.navigation
        )}\n创建、筛选或移动人物时只能使用目录中的 type_id；人物类型目录只能由用户在结构管理中维护。超出列表的人物调用 list_setting（domain=character）查询。`
      : "",
    injectsCrossDomainDesignSnapshots
      ? `【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】\n${renderLongPlotNavigation(longWorkspace!.navigation)}`
      : "",
    plotFocus ? `当前剧情工作区: ${renderLongPlotFocus(plotFocus)}` : "",
    renderLongCurrentStageSection(
      worldbuildingFocus,
      characterFocus,
      longWorkspace
    ),
    longWorkspace && !isSettingAgentRun
      ? `长篇项目: ${longWorkspace.bookId}；结构版本 ${longWorkspace.workspaceRevision}；项目版本 ${longWorkspace.projectRevision}`
      : "",
    longWorkspace && !omitLongImplementationIds
      ? `当前根节点: ${longWorkspace.activeRoot}；当前智能体: ${longWorkspace.activeAgentId}`
      : "",
    longWorkspace?.activeChapterCardId &&
    !isSettingAgentRun
      ? `当前章卡: ${longWorkspace.activeChapterCardId}`
      : "",
    longWorkspace?.activeFileId &&
    !omitLongImplementationIds
      ? `当前文件: ${longWorkspace.activeFileId} (${longWorkspace.activeFileRevision})`
      : "",
    writingWorkspace
      ? `作品分类: ${writingWorkspace.categories.join("、") || "未分类"}`
      : "",
    writingWorkspace
      ? `当前阶段: ${writingWorkspace.activeStageId}`
      : "",
    writingWorkspace
      ? `剧情结构顺序: ${writingWorkspace.plotStages
          .map((stage) => `${stage.title} (${stage.id})`)
          .join(" → ")}`
      : "",
    writingWorkspace?.activeSectionId
      ? `当前用户正在操作的${scriptWorkspace ? "剧集" : "小节"}: ${
          writingWorkspace.expertDraft.sections.find(
            (section) => section.id === writingWorkspace.activeSectionId
          )?.title ?? "未知标题"
        }（section_id=${writingWorkspace.activeSectionId}）`
      : "",
    writingWorkspace?.expertDraft.sections.length
      ? `正文目录${scriptWorkspace ? "剧集" : "小节"}（由早到晚）: ${writingWorkspace.expertDraft.sections
          .map((section) => `${section.title} (${section.id})`)
          .join("、")}`
      : "",
    writingProfile
      ? `当前智能体: ${writingProfile.label} (${writingProfile.id})`
      : longProfile
        ? isSettingAgentRun
          ? `当前智能体: ${longProfile.label}`
          : `当前智能体: ${longProfile.label} (${longProfile.id})`
      : input.libraryAgentProfile
        ? `当前智能体: ${input.libraryAgentProfile.label} (${input.libraryAgentProfile.domain})`
      : input.learningImitationProfile
        ? `当前智能体: ${input.learningImitationProfile.label} (${input.learningImitationProfile.id})`
      : "",
    learningContext
      ? `学习阶段: ${learningContext.stageId}；样本文档: ${learningContext.documents.length} 篇`
      : "",
    libraryContext
      ? `当前资料库: 《${libraryContext.title}》 (${libraryContext.domain} / ${libraryContext.kind}；短篇、剧本、长篇共用)`
      : "",
    libraryContext
      ? `资料库状态: ${libraryContext.readOnly ? "只读" : "可写"}${libraryContext.projectRevision === undefined ? "" : `；项目版本 ${libraryContext.projectRevision}`}`
      : "",
    libraryContext?.activeEntryId
      ? `当前条目: ${libraryContext.activeEntryId}`
      : "",
    libraryContext
      ? `库介绍${libraryContext.overviewTruncated ? "（已截断）" : ""}:\n${libraryContext.overview || "未填写"}`
      : "",
    libraryContext
      ? `条目索引（正文请通过工具读取）:\n${
          libraryContext.entries.length
            ? libraryContext.entries
                .map(
                  (entry) =>
                    `- ${entry.title} (${entry.id}) [${entry.stageId}]${entry.readOnly ? " [只读]" : ""}${entry.truncated ? " [正文快照已截断]" : ""}`
                )
                .join("\n")
            : "- 无条目"
        }${libraryContext.omittedEntryCount ? `\n- 另有 ${libraryContext.omittedEntryCount} 个条目未进入本轮快照` : ""}`
      : "",
    active
      ? `当前资源: ${active.title} (${active.domain}${active.format ? ` / ${active.format}` : ""})`
      : learningContext
        ? "当前资源: 学习仿写样本文档（正文请通过工具按需读取）"
        : "当前资源: 未提供",
    active && !omitLongImplementationIds
      ? `资源路径: ${active.path.join(" / ")}`
      : "",
    active &&
    !writingWorkspace &&
    !longWorkspace &&
    !input.workspaceContext?.libraryWorkspace
      ? `实时内容:\n${active.content}`
      : "",
    skillContext,
    materialContext,
    "",
    "【用户消息与上传附件】",
    buildRawUserText(input)
  ];
  return lines.filter((line) => line !== "").join("\n");
}

function buildRawUserText(input: AgentRunInput): string {
  const attachments = input.attachments ?? [];
  const textAttachments = attachments.filter(
    (attachment) => attachment.kind === "text"
  );
  const imageAttachments = attachments.filter(
    (attachment) => attachment.kind === "image"
  );
  const lines = [input.prompt];
  if (textAttachments.length) {
    lines.push("", "【用户上传的文本附件】");
    for (const attachment of textAttachments) {
      lines.push(
        "",
        `--- ${attachment.name} (${attachment.mediaType}) ---`,
        attachment.content,
        attachment.truncated
          ? `[墨枢：附件文本已截断；原文 ${attachment.originalLength?.toLocaleString("zh-CN") ?? "超过限制"} 个字符。]`
          : ""
      );
    }
  }
  if (imageAttachments.length) {
    lines.push(
      "",
      `【用户上传的图片】${imageAttachments.map((attachment) => attachment.name).join("、")}`
    );
  }
  return lines.filter((line) => line !== "").join("\n");
}

function longAgentRefreshesDesignContextOnLaterTurns(
  agentId: LongAgentProfile["id"] | undefined
): boolean {
  return agentId === "plot_design" || agentId === "draft";
}

function buildLongFollowUpTurnUserPrompt(input: AgentRunInput): string {
  const longWorkspace = input.workspaceContext?.longWorkspace;
  const agentId = input.longAgentProfile?.id;
  if (
    !longWorkspace ||
    !longAgentRefreshesDesignContextOnLaterTurns(agentId)
  ) {
    return buildRawUserText(input);
  }
  const plotFocus =
    agentId === "plot_design" ? longWorkspace.plotFocus : undefined;
  const lines = [
    agentId === "plot_design"
      ? "【本轮剧情工作区上下文】"
      : "【本轮写手工作区上下文】",
    `长篇作品: 《${longWorkspace.title}》`,
    longWorkspace.agentsMd?.trim()
      ? `【长篇上下文（AGENTS.md）】\n${longWorkspace.agentsMd.trim()}`
      : "",
    `结构版本 ${longWorkspace.workspaceRevision}；项目版本 ${longWorkspace.projectRevision}`,
    longWorkspace.activeChapterCardId
      ? `当前章卡: ${longWorkspace.activeChapterCardId}`
      : "",
    `【长篇结构导航（本轮发送时快照；条目正文与最新修订请通过工具读取）】\n${renderLongPlotNavigation(
      longWorkspace.navigation
    )}`,
    agentId === "plot_design"
      ? plotFocus
        ? `当前剧情工作区: ${renderLongPlotFocus(plotFocus)}`
        : "当前剧情工作区: 剧情设计根节点（未定位具体页面）"
      : "",
    "",
    "【用户消息与上传附件】",
    buildRawUserText(input)
  ];
  return lines.filter((line) => line !== "").join("\n");
}

function imageContentBlocks(input: AgentRunInput): Array<{
  type: "image";
  data: string;
  mimeType: string;
}> {
  return (input.attachments ?? []).flatMap((attachment) =>
    attachment.kind === "image"
      ? [{ type: "image" as const, data: attachment.data, mimeType: attachment.mediaType }]
      : []
  );
}

function buildRuntimeUserMessageContent(input: AgentRunInput): UserMessage["content"] {
  const images = imageContentBlocks(input);
  return images.length
    ? [{ type: "text", text: buildRuntimeUserPrompt(input) }, ...images]
    : buildRuntimeUserPrompt(input);
}

function buildLongFollowUpTurnUserMessageContent(
  input: AgentRunInput
): UserMessage["content"] {
  const text = buildLongFollowUpTurnUserPrompt(input);
  const images = imageContentBlocks(input);
  return images.length ? [{ type: "text", text }, ...images] : text;
}

/** @internal Exported for prompt-content regression tests. */
export function buildRawUserMessage(input: AgentRunInput, timestamp = Date.now()): UserMessage {
  const text = buildRawUserText(input);
  const images = imageContentBlocks(input);
  return {
    role: "user",
    content: images.length ? [{ type: "text", text }, ...images] : text,
    timestamp
  };
}

function buildLocalThinking(input: AgentRunInput): string {
  const title = input.workspaceContext?.activeResource?.title ?? "未命名资源";
  const selectedProfile =
    input.scriptAgentProfile ??
    input.agentProfile ??
    input.longAgentProfile ??
    input.libraryAgentProfile;
  const agent = selectedProfile ? `，由「${selectedProfile.label}」处理` : "";
  return `正在读取发送瞬间的创作上下文快照，确认当前工作对象为《${title}》${agent}，并区分用户要求、作品事实与参考信息。`;
}

function buildLocalWritingResponse(input: AgentRunInput): string {
  const active = input.workspaceContext?.activeResource;
  const request = input.prompt.replace(/\s+/g, " ").slice(0, 220);
  const activeLabel = active ? `《${active.title}》` : "当前创作资源";
  const contentLength = active?.content.replace(/\s/g, "").length ?? 0;
  const snapshotLabel = active?.truncated
    ? `${activeLabel} 前 ${active.content.length.toLocaleString("zh-CN")} 个字符的上下文快照（原文 ${active.originalLength?.toLocaleString("zh-CN") ?? "超过限制"} 个字符）`
    : `${activeLabel} 上下文快照（约 ${contentLength} 字）`;

  return [
    "本地 Faux 流式链路已就绪。",
    "",
    `我已读取本轮发送时的 ${snapshotLabel}，并收到请求：${request}`,
    "",
    "本轮可验证结果",
    "",
    "- 回复由 pi-agent-core 驱动，并通过 Agent Utility 流式返回。",
    "- Thinking 与回复内容使用独立事件，Renderer 会绑定到同一条助手消息。",
    "- 当前是无需 API Key 的本地 Faux 模型，用于验证客户端链路和上下文边界。",
    "- 本轮没有调用写入工具，也没有修改或保存右侧文稿。",
    input.scriptAgentProfile ?? input.agentProfile
      ? `- 当前已按${input.scriptAgentProfile ? "剧本" : "短篇"}阶段选择「${(input.scriptAgentProfile ?? input.agentProfile)!.label}」智能体，并装配 ${
          input.workspaceContext?.scriptWorkspace || input.workspaceContext?.shortWorkspace
            ? "阶段专属工具"
            : "通用上下文"
        }。`
      : input.libraryAgentProfile
        ? `- 当前已选择「${input.libraryAgentProfile.label}」，并且装配当前资料库读写工具与按需 load_skill。`
      : input.longAgentProfile
        ? `- 当前已按长篇根节点选择「${input.longAgentProfile.label}」智能体；结构与正文只会通过长篇专用工具按需读取。`
      : "",
    "",
    "下一切片接入真实模型配置后，可以在保持同一协议的前提下生成正式续写、润色和一致性检查结果。"
  ].filter(Boolean).join("\n");
}
