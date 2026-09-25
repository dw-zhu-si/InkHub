import { describe, expect, it } from "vitest";
import {
  AgentEvaluationSnapshotEventEnvelopeSchema,
  AgentMessageCompletedEventEnvelopeSchema,
  AgentMessageDeltaEventEnvelopeSchema,
  AgentUsageObservedEventEnvelopeSchema,
  AgentRetryScheduledEventEnvelopeSchema,
  AgentTurnStartedEventEnvelopeSchema,
  AgentPromptCommandPayloadSchema,
  ActiveResourceSnapshotSchema,
  AppearanceSettingsSchema,
  AppearanceSettingsSnapshotSchema,
  CommandEnvelopeSchema,
  ExpertDraftFileSnapshotSchema,
  ExpertDraftSchema,
  ModelSettingsInputSchema,
  ModelSettingsSchema,
  ExportShortManuscriptResultSchema,
  DEFAULT_LIBRARY_AGENT_SETTINGS,
  LearningImitationDocumentSchema,
  LibraryAgentSettingsInputSchema,
  PROTOCOL_VERSION,
  PROMPT_IMAGE_ATTACHMENT_MAX_BYTES,
  PromptTextAttachmentSchema,
  SHORT_WORKSPACE_FILE_MAX_CHARACTERS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  ShortCharacterItemSnapshotSchema,
  ShortWorkspaceStageSnapshotSchema,
  SessionPromptAcceptedPayloadSchema,
  SystemEventEnvelopeSchema,
  SystemHealthPayloadSchema,
  SubagentActivitySchema,
  UtilityInboundMessageSchema,
  UtilityOutboundMessageSchema,
  UserPromptAttachmentsSchema,
  WorkspaceRuntimeContextSchema,
  WorkspaceEditorMutationPayloadSchema,
  createDefaultCreativePlotStages,
  createDefaultAppearanceSettings,
  listAppearanceEditorFontFamilyOptions,
  listAppearanceUiFontFamilyOptions,
  resolveAppearanceEditorFontStack,
  resolveAppearanceUiFontStack,
  createShortWorkspaceContentRevision,
  createEnvelope
} from "./index";

const runtime = {
  provider: "deepwrite",
  model: "deepwrite-writing-faux",
  mode: "local-faux" as const
};

function shortWorkspaceRuntimeFixture() {
  const contentRevision = (content: string): string =>
    createShortWorkspaceContentRevision(content);
  const plotStages = createDefaultCreativePlotStages();

  return {
    id: "book_runtime",
    title: "运行时正文",
    categories: ["悬疑"],
    activeStageId: "draft" as const,
    activeAgentId: "expert_draft_coordinator" as const,
    plotStages,
    expertDraft: {
      id: "draft" as const,
      title: "正文",
      revision: contentRevision("draft-directory"),
      sections: [
        {
          id: "section-1",
          title: "第一节",
          wordCountRequirement: "1000 字",
          body: {
            documentId: "draft:section-1:body",
            title: "第一节·正文",
            content: "第一节正文。",
            revision: contentRevision("第一节正文。")
          },
          characterState: {
            documentId: "draft:section-1:state",
            title: "第一节·人物状态",
            content: "人物仍在雨中。",
            revision: contentRevision("人物仍在雨中。")
          }
        },
        {
          id: "section-2",
          title: "第二节",
          wordCountRequirement: "1200 字",
          body: {
            documentId: "draft:section-2:body",
            title: "第二节·正文",
            content: "第二节正文。",
            revision: contentRevision("第二节正文。")
          },
          characterState: {
            documentId: "draft:section-2:state",
            title: "第二节·人物状态",
            content: "人物进入车站。",
            revision: contentRevision("人物进入车站。")
          }
        }
      ]
    },
    stages: SHORT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => {
      const content = stageId === "outline" ? "第一节：雨夜。" : "";
      return {
        stageId,
        title: stageId,
        content,
        revision: contentRevision(content)
      };
    })
  };
}

describe("DeepWrite desktop contracts", () => {
  it("creates a versioned command envelope with a correlation id", () => {
    const envelope = createEnvelope("system.health", {}, { id: "cmd_health" });

    expect(CommandEnvelopeSchema.parse(envelope)).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      id: "cmd_health",
      type: "system.health",
      context: { correlationId: "cmd_health" }
    });
  });

  it("rejects unknown protocol versions", () => {
    const envelope = createEnvelope("system.health", {}, { id: "cmd_health" });

    expect(() => CommandEnvelopeSchema.parse({ ...envelope, protocolVersion: 2 })).toThrow();
  });

  it("accepts a validated short manuscript export command and result", () => {
    const envelope = createEnvelope(
      "manuscript.exportShort",
      {
        title: "雨夜来信",
        format: "epub" as const,
        sections: [
          { title: "导语", content: "雨落下来。" },
          { title: "第一节", content: "她打开了门。" }
        ]
      },
      { id: "cmd_export_short" }
    );

    expect(CommandEnvelopeSchema.parse(envelope)).toMatchObject({
      type: "manuscript.exportShort",
      payload: { format: "epub" }
    });
    expect(
      ExportShortManuscriptResultSchema.parse({
        status: "saved",
        filePath: "/tmp/雨夜来信.epub"
      })
    ).toMatchObject({ status: "saved" });
  });

  it("accepts three healthy utility workers", () => {
    const workers = ["core", "agent", "tool"].map((name, index) => ({
      name,
      status: "ok",
      pid: 1000 + index,
      details: {}
    }));

    expect(
      SystemHealthPayloadSchema.parse({
        status: "ok",
        checkedAt: new Date().toISOString(),
        workers
      }).workers
    ).toHaveLength(3);
  });

  it("accepts a prompt with a matching session and live editor snapshot", () => {
    const envelope = createEnvelope(
      "session.prompt",
      {
        sessionId: "session_1",
        message: "续写这一段",
        thinkingLevel: "medium" as const,
        writeApprovalMode: "auto-approve" as const,
        workspaceContext: {
          activeResource: {
            id: "chapter_1",
            domain: "creation" as const,
            title: "第一章",
            path: ["长篇小说", "第一章"],
            format: "markdown",
            source: "live-editor" as const,
            content: "窗外正在下雨。"
          }
        }
      },
      {
        id: "cmd_prompt",
        context: { sessionId: "session_1", resourceId: "chapter_1" }
      }
    );

    expect(CommandEnvelopeSchema.parse(envelope)).toMatchObject({
      type: "session.prompt",
      payload: { writeApprovalMode: "auto-approve" }
    });
  });

  it("accepts extracted text and base64 image prompt attachments", () => {
    const attachments = UserPromptAttachmentsSchema.parse([
      {
        id: "attachment_notes",
        kind: "text",
        name: "notes.md",
        mediaType: "text/markdown",
        size: 18,
        content: "雨夜场景需要更压抑。"
      },
      {
        id: "attachment_reference",
        kind: "image",
        name: "reference.png",
        mediaType: "image/png",
        size: 3,
        data: "AQID"
      }
    ]);

    expect(attachments.map((attachment) => attachment.kind)).toEqual(["text", "image"]);
    expect(() =>
      UserPromptAttachmentsSchema.parse([
        {
          id: "too_large",
          kind: "image",
          name: "too-large.png",
          mediaType: "image/png",
          size: PROMPT_IMAGE_ATTACHMENT_MAX_BYTES + 1,
          data: "AQID"
        }
      ])
    ).toThrow();
    expect(() =>
      UserPromptAttachmentsSchema.parse([
        {
          id: "forged_size",
          kind: "image",
          name: "forged.png",
          mediaType: "image/png",
          size: 1,
          data: "AQID"
        }
      ])
    ).toThrow();
  });

  it("normalizes public model settings without exposing API keys", () => {
    const settings = ModelSettingsSchema.parse({
      defaultModelId: "deepseek",
      models: [
        {
          id: "deepseek",
          label: "DeepSeek",
          provider: "deepseek",
          modelId: "deepseek-chat",
          api: "openai-completions",
          baseUrl: "https://api.deepseek.com.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "xhigh",
          hasApiKey: true,
          apiKey: "must-not-cross-the-boundary"
        }
      ]
    });

    expect(settings.models[0]?.defaultThinkingLevel).toBe("xhigh");
    expect(settings.models[0]?.thinkingLevelOptions).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]);
    expect(settings.models[0]?.temperatureOptions).toEqual([0.1, 0.7, 1]);
    expect("apiKey" in (settings.models[0] ?? {})).toBe(false);
  });

  it("accepts max and one custom provider thinking level", () => {
    const settings = ModelSettingsInputSchema.parse({
      defaultModelId: "writer",
      models: [
        {
          id: "writer",
          label: "Writer",
          provider: "custom",
          modelId: "writer-model",
          api: "openai-responses",
          baseUrl: "https://ollama.example.test/v1",
          reasoning: true,
          defaultThinkingLevel: "ultra",
          thinkingLevelOptions: ["low", "medium", "high", "xhigh", "max", "ultra"],
          temperatureOptions: [0.1, 0.7, 1]
        }
      ]
    });

    expect(settings.models[0]?.thinkingLevelOptions).toContain("max");
    expect(settings.models[0]?.defaultThinkingLevel).toBe("ultra");
  });

  it("rejects invalid model defaults and reasoning defaults", () => {
    const model = {
      id: "plain",
      label: "Plain model",
      provider: "custom",
      modelId: "plain-model",
      api: "openai-completions" as const,
      baseUrl: "https://ollama.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "high" as const
    };

    expect(() =>
      ModelSettingsInputSchema.parse({ models: [model], defaultModelId: "plain" })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [{ ...model, reasoning: true, defaultThinkingLevel: "medium" }],
        defaultModelId: "missing"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [
          {
            ...model,
            reasoning: true,
            defaultThinkingLevel: "high",
            thinkingLevelOptions: ["low", "medium"]
          }
        ],
        defaultModelId: "plain"
      })
    ).toThrow();
    expect(() =>
      ModelSettingsInputSchema.parse({
        models: [
          {
            ...model,
            defaultThinkingLevel: "off",
            temperatureOptions: [0.7, 0.7, 1]
          }
        ],
        defaultModelId: "plain"
      })
    ).toThrow();
  });

  it("accepts an unsaved model draft for a connection test", () => {
    const envelope = createEnvelope(
      "models.test",
      {
        model: {
          id: "draft-model",
          label: "Draft model",
          provider: "custom",
          modelId: "draft-v1",
          api: "openai-completions" as const,
          baseUrl: "https://ollama.example.test/v1",
          reasoning: false,
          defaultThinkingLevel: "off" as const,
          apiKey: "not-yet-saved"
        }
      },
      { id: "cmd_test_draft" }
    );

    expect(CommandEnvelopeSchema.parse(envelope).type).toBe("models.test");
  });

  it("accepts a remote model list request from an unsaved draft", () => {
    const envelope = createEnvelope(
      "models.listRemote",
      {
        id: "draft-model",
        provider: "custom",
        api: "openai-completions" as const,
        baseUrl: "https://api.example.test/v1",
        apiKey: "not-a-real-key"
      },
      { id: "cmd_list_remote" }
    );

    expect(CommandEnvelopeSchema.parse(envelope).type).toBe("models.listRemote");
  });

  it("rejects blank prompts and mismatched session context", () => {
    const blank = createEnvelope(
      "session.prompt",
      { sessionId: "session_1", message: "   " },
      { id: "cmd_blank", context: { sessionId: "session_1" } }
    );
    const mismatch = createEnvelope(
      "session.prompt",
      { sessionId: "session_1", message: "继续" },
      { id: "cmd_mismatch", context: { sessionId: "session_2" } }
    );

    expect(() => CommandEnvelopeSchema.parse(blank)).toThrow();
    expect(() => CommandEnvelopeSchema.parse(mismatch)).toThrow();
  });

  it("validates a session abort against its session and run context", () => {
    const abort = createEnvelope(
      "session.abort",
      { sessionId: "session_1", runId: "run_1" },
      {
        id: "cmd_abort",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );
    const mismatch = createEnvelope(
      "session.abort",
      { sessionId: "session_1", runId: "run_1" },
      {
        id: "cmd_abort_mismatch",
        context: { sessionId: "session_1", runId: "run_2" }
      }
    );

    expect(CommandEnvelopeSchema.parse(abort).type).toBe("session.abort");
    expect(() => CommandEnvelopeSchema.parse(mismatch)).toThrow();
  });

  it("validates quick acceptance independently from streamed events", () => {
    expect(
      SessionPromptAcceptedPayloadSchema.parse({
        sessionId: "session_1",
        runId: "run_1",
        acceptedAt: new Date().toISOString(),
        runtime
      })
    ).toMatchObject({ runId: "run_1", runtime });
  });

  it("accepts delta and completion events with consistent envelope identity", () => {
    const delta = createEnvelope(
      "agent.message_delta",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        delta: "第一段",
        runtime
      },
      {
        id: "event_delta",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );
    const completed = createEnvelope(
      "agent.message_completed",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        role: "assistant" as const,
        content: "第一段",
        thinking: "先理解上下文。",
        stopReason: "stop",
        runtime
      },
      {
        id: "event_completed",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );

    expect(AgentMessageDeltaEventEnvelopeSchema.parse(delta).payload.delta).toBe("第一段");
    expect(AgentMessageCompletedEventEnvelopeSchema.parse(completed).payload.content).toBe(
      "第一段"
    );
    expect(SystemEventEnvelopeSchema.parse(completed).type).toBe("agent.message_completed");
  });

  it("validates an evaluation snapshot tied to its run and assistant message", () => {
    const context = { sessionId: "session_eval", runId: "run_eval" };
    const snapshot = createEnvelope(
      "agent.evaluation_snapshot",
      {
        ...context,
        messageId: "run_eval_assistant",
        runtime,
        snapshot: {
          schemaVersion: 1 as const,
          capturedAt: "2026-08-13T00:00:00.000Z",
          systemPrompt: "最终系统提示词",
          runtimeContext: {
            kind: "initial-session-context" as const,
            text: "运行时注入文本"
          },
            tools: [
              {
                name: "read_fixture",
                label: "读取夹具",
                description: "读取测试夹具。",
                inputSchema: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"]
                }
              }
            ],
            conversationHistory: [
              { role: "user", text: "运行时注入文本" }
            ]
          }
      },
      { id: "event_eval", context }
    );

    expect(
      AgentEvaluationSnapshotEventEnvelopeSchema.parse(snapshot).payload.snapshot
        .conversationHistory
    ).toEqual([{ role: "user", text: "运行时注入文本" }]);
    expect(SystemEventEnvelopeSchema.parse(snapshot).type).toBe(
      "agent.evaluation_snapshot"
    );
  });

  it("validates internal assistant usage observations without making them UI terminal events", () => {
    const context = { sessionId: "session_usage", runId: "run_usage" };
    const observed = createEnvelope(
      "agent.usage_observed",
      {
        ...context,
        messageId: "run_usage_assistant",
        observationId: "run_usage:turn:1:attempt:1",
        observedAt: "2026-07-29T10:00:00.000Z",
        turnId: "run_usage:turn:1",
        attempt: 1,
        status: "completed" as const,
        hadToolCall: true,
        usage: {
          inputTokens: 13,
          outputTokens: 5,
          cacheReadTokens: 2,
          cacheWriteTokens: 0,
          totalTokens: 20
        },
        runtime: {
          provider: "openai",
          model: "gpt-test",
          mode: "provider" as const,
          configId: "model-config-1"
        }
      },
      { id: "event_usage", context }
    );

    expect(AgentUsageObservedEventEnvelopeSchema.parse(observed).payload).toMatchObject({
      observationId: "run_usage:turn:1:attempt:1",
      hadToolCall: true,
      runtime: { configId: "model-config-1" }
    });
    expect(SystemEventEnvelopeSchema.parse(observed).type).toBe("agent.usage_observed");
  });

  it("validates turn attempts and scheduled retries as non-terminal agent events", () => {
    const context = { sessionId: "session_retry", runId: "run_retry" };
    const turnStarted = createEnvelope(
      "agent.turn_started",
      {
        ...context,
        messageId: "message_retry",
        turnId: "turn_retry",
        attempt: 1,
        maxAttempts: 6,
        runtime
      },
      { id: "event_turn_started", context }
    );
    const retryScheduled = createEnvelope(
      "agent.retry_scheduled",
      {
        ...context,
        messageId: "message_retry",
        turnId: "turn_retry",
        failedAttempt: 1,
        nextAttempt: 2,
        maxAttempts: 6,
        delayMs: 2_000,
        retryAt: "2026-07-26T12:00:02.000Z",
        reason: "Network connection reset.",
        runtime
      },
      { id: "event_retry_scheduled", context }
    );

    expect(AgentTurnStartedEventEnvelopeSchema.parse(turnStarted).payload.attempt).toBe(1);
    expect(
      AgentRetryScheduledEventEnvelopeSchema.parse(retryScheduled).payload.nextAttempt
    ).toBe(2);
    expect(SystemEventEnvelopeSchema.parse(turnStarted).type).toBe("agent.turn_started");
    expect(SystemEventEnvelopeSchema.parse(retryScheduled).type).toBe(
      "agent.retry_scheduled"
    );
    expect(
      UtilityOutboundMessageSchema.parse({
        kind: "utility.command.event",
        worker: "agent",
        requestId: "request_retry",
        event: retryScheduled
      }).kind
    ).toBe("utility.command.event");

    expect(() =>
      AgentTurnStartedEventEnvelopeSchema.parse({
        ...turnStarted,
        payload: { ...turnStarted.payload, attempt: 7 }
      })
    ).toThrow();
    expect(() =>
      AgentRetryScheduledEventEnvelopeSchema.parse({
        ...retryScheduled,
        payload: { ...retryScheduled.payload, nextAttempt: 3 }
      })
    ).toThrow();
  });

  it("validates subagent retry lifecycle activities", () => {
    expect(
      SubagentActivitySchema.parse({
        type: "turn_started",
        turnId: "subagent_turn_1",
        attempt: 2,
        maxAttempts: 6
      })
    ).toMatchObject({ type: "turn_started", attempt: 2 });
    expect(
      SubagentActivitySchema.parse({
        type: "retry_scheduled",
        turnId: "subagent_turn_1",
        failedAttempt: 2,
        nextAttempt: 3,
        maxAttempts: 6,
        delayMs: 5_000,
        retryAt: "2026-07-26T12:00:05.000Z",
        reason: "Provider temporarily unavailable."
      })
    ).toMatchObject({ type: "retry_scheduled", nextAttempt: 3 });

    expect(() =>
      SubagentActivitySchema.parse({
        type: "retry_scheduled",
        turnId: "subagent_turn_1",
        failedAttempt: 6,
        nextAttempt: 7,
        maxAttempts: 6,
        delayMs: 30_000,
        retryAt: "2026-07-26T12:00:30.000Z",
        reason: "Provider temporarily unavailable."
      })
    ).toThrow();
  });

  it("rejects an event whose run context differs from its payload", () => {
    const event = createEnvelope(
      "agent.message_delta",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        delta: "内容",
        runtime
      },
      {
        id: "event_bad_run",
        context: { sessionId: "session_1", runId: "run_2" }
      }
    );

    expect(() => AgentMessageDeltaEventEnvelopeSchema.parse(event)).toThrow();
  });

  it("validates targeted expert-draft file mutations", () => {
    const event = createEnvelope(
      "workspace.editor_mutation",
      {
        sessionId: "session_section_mutation",
        runId: "run_section_mutation",
        toolCallId: "tool_section_mutation",
        workspaceId: "book-1",
        stageId: "draft" as const,
        text: "第三节的新正文。",
        mutationTarget: {
          kind: "expert-draft-file" as const,
          documentId: "draft:section-3:body",
          sectionId: "section-3",
          fileKind: "body" as const
        },
        baseRevision: "v1:100:1234abcd",
        summary: "已生成第三节正文变更。",
        runtime
      },
      {
        id: "event_section_mutation",
        context: {
          sessionId: "session_section_mutation",
          runId: "run_section_mutation"
        }
      }
    );

    expect(SystemEventEnvelopeSchema.parse(event)).toMatchObject({
      payload: {
        mutationTarget: {
          documentId: "draft:section-3:body",
          sectionId: "section-3",
          fileKind: "body"
        }
      }
    });
    expect(() =>
      SystemEventEnvelopeSchema.parse({
        ...event,
        payload: { ...event.payload, stageId: "outline" }
      })
    ).toThrow();
    expect(() =>
      SystemEventEnvelopeSchema.parse({
        ...event,
        payload: { ...event.payload, mutationTarget: undefined }
      })
    ).toThrow();
  });

  it("validates batch expert-draft section creation mutations", () => {
    const payload = {
      sessionId: "session_section_creation",
      runId: "run_section_creation",
      toolCallId: "tool_section_creation",
      workspaceId: "book-1",
      stageId: "draft" as const,
      text: "1. 第二章（1200 字）\n2. 第三章",
      mutationTarget: {
        kind: "expert-draft-section-creation" as const,
        sections: [
          {
            title: "第二章",
            wordCountRequirement: "1200 字",
            provisionalSectionId: "pending:section:1"
          },
          {
            title: "第三章",
            wordCountRequirement: "",
            provisionalSectionId: "pending:section:2"
          }
        ],
        afterSectionId: "section-1"
      },
      baseRevision: "v1:100:1234abcd",
      summary: "已生成创建 2 个空白章节文件的变更。",
      runtime
    };

    expect(WorkspaceEditorMutationPayloadSchema.parse(payload)).toMatchObject({
      mutationTarget: {
        kind: "expert-draft-section-creation",
        sections: [
          { title: "第二章", provisionalSectionId: "pending:section:1" },
          { title: "第三章", provisionalSectionId: "pending:section:2" }
        ]
      }
    });
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        mutationTarget: { ...payload.mutationTarget, sections: [] }
      }).success
    ).toBe(false);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        stageId: "outline"
      }).success
    ).toBe(false);
  });

  it("validates expert-draft section rename mutations", () => {
    const payload = {
      sessionId: "session_section_rename",
      runId: "run_section_rename",
      toolCallId: "tool_section_rename",
      workspaceId: "book-1",
      stageId: "draft" as const,
      text: "旧章名 → 新章名",
      mutationTarget: {
        kind: "expert-draft-section-rename" as const,
        sectionId: "section-1",
        previousTitle: "旧章名",
        title: "新章名"
      },
      baseRevision: "v1:100:1234abcd",
      summary: "已生成章节改名变更。",
      runtime
    };

    expect(WorkspaceEditorMutationPayloadSchema.parse(payload)).toMatchObject({
      mutationTarget: {
        kind: "expert-draft-section-rename",
        sectionId: "section-1",
        previousTitle: "旧章名",
        title: "新章名"
      }
    });
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        mutationTarget: {
          ...payload.mutationTarget,
          title: ""
        }
      }).success
    ).toBe(false);
  });

  it("validates expert-draft section deletion mutations", () => {
    const payload = {
      sessionId: "session_section_deletion",
      runId: "run_section_deletion",
      toolCallId: "tool_section_deletion",
      workspaceId: "book-1",
      stageId: "draft" as const,
      text: "删除：旧章名",
      mutationTarget: {
        kind: "expert-draft-section-deletion" as const,
        sectionId: "section-1",
        title: "旧章名"
      },
      baseRevision: "v1:100:1234abcd",
      summary: "已生成章节删除变更。",
      runtime
    };

    expect(WorkspaceEditorMutationPayloadSchema.parse(payload)).toMatchObject({
      mutationTarget: {
        kind: "expert-draft-section-deletion",
        sectionId: "section-1",
        title: "旧章名"
      }
    });
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...payload,
        mutationTarget: {
          ...payload.mutationTarget,
          title: ""
        }
      }).success
    ).toBe(false);
  });

  it("validates command and event messages at the Utility boundary", () => {
    const command = createEnvelope(
      "session.prompt",
      { sessionId: "session_1", message: "分析人物动机" },
      { id: "cmd_utility", context: { sessionId: "session_1" } }
    );
    const event = createEnvelope(
      "agent.message_delta",
      {
        sessionId: "session_1",
        runId: "run_1",
        messageId: "message_1",
        delta: "正在分析",
        runtime
      },
      {
        id: "event_utility",
        context: { sessionId: "session_1", runId: "run_1" }
      }
    );

    expect(
      UtilityInboundMessageSchema.parse({
        kind: "utility.command.request",
        requestId: "request_1",
        command
      }).kind
    ).toBe("utility.command.request");
    expect(
      UtilityOutboundMessageSchema.parse({
        kind: "utility.command.event",
        worker: "agent",
        requestId: "request_1",
        event
      }).kind
    ).toBe("utility.command.event");

    const internalCommand = createEnvelope(
      "system.health",
      {},
      { id: "cmd_internal_health" }
    );
    expect(
      UtilityOutboundMessageSchema.parse({
        kind: "utility.internal.command.request",
        worker: "agent",
        target: "core",
        requestId: "internal_request_1",
        parentRequestId: "request_1",
        timeoutMs: 5_000,
        command: internalCommand
      }).kind
    ).toBe("utility.internal.command.request");
    expect(
      UtilityInboundMessageSchema.parse({
        kind: "utility.internal.command.result",
        worker: "agent",
        target: "core",
        requestId: "internal_request_1",
        parentRequestId: "request_1",
        result: {
          status: "accepted",
          requestId: internalCommand.id,
          payload: { status: "ok" }
        }
      }).kind
    ).toBe("utility.internal.command.result");
    expect(
      UtilityOutboundMessageSchema.safeParse({
        kind: "utility.internal.command.request",
        worker: "core",
        target: "tool",
        requestId: "internal_request_wrong_source",
        parentRequestId: "request_1",
        timeoutMs: 5_000,
        command: internalCommand
      }).success
    ).toBe(false);
    expect(
      UtilityOutboundMessageSchema.safeParse({
        kind: "utility.internal.command.request",
        worker: "agent",
        target: "agent",
        requestId: "internal_request_loop",
        parentRequestId: "request_1",
        timeoutMs: 5_000,
        command: internalCommand
      }).success
    ).toBe(false);
  });

  it("validates streamed tool arguments before tool execution", () => {
    const event = createEnvelope(
      "tool.call_stream",
      {
        sessionId: "session_tool_stream",
        runId: "run_tool_stream",
        streamId: "message_tool_stream:0",
        toolCallId: "tool_write_1",
        toolName: "write_workspace_editor",
        phase: "delta" as const,
        argumentsDelta: '{"text":"开场',
        runtime
      },
      {
        id: "event_tool_stream",
        context: { sessionId: "session_tool_stream", runId: "run_tool_stream" }
      }
    );

    expect(SystemEventEnvelopeSchema.parse(event).type).toBe("tool.call_stream");
  });

  it("requires truthful truncation metadata for a shortened live snapshot", () => {
    const snapshot = {
      id: "chapter_long",
      domain: "creation" as const,
      title: "长章节",
      path: ["作品", "长章节"],
      source: "live-editor" as const,
      content: "字".repeat(20_000),
      truncated: true,
      originalLength: 20_010
    };

    expect(ActiveResourceSnapshotSchema.parse(snapshot).originalLength).toBe(20_010);
    expect(() =>
      ActiveResourceSnapshotSchema.parse({ ...snapshot, originalLength: 20_000 })
    ).toThrow();
    expect(() =>
      ActiveResourceSnapshotSchema.parse({
        ...snapshot,
        truncated: false,
        originalLength: 20_010
      })
    ).toThrow();
    const { truncated: _truncated, ...withoutTruncated } = snapshot;
    expect(() => ActiveResourceSnapshotSchema.parse(withoutTruncated)).toThrow();
  });

  it("requires truthful truncation metadata across bounded text snapshots", () => {
    const revision = createShortWorkspaceContentRevision("前段");
    const bounded = { content: "前段", truncated: true, originalLength: 10 };

    expect(() =>
      ShortWorkspaceStageSnapshotSchema.parse({
        stageId: "outline",
        title: "大纲",
        revision,
        ...bounded
      })
    ).not.toThrow();
    expect(() =>
      ShortWorkspaceStageSnapshotSchema.parse({
        stageId: "outline",
        title: "大纲",
        revision,
        content: "前段",
        originalLength: 10
      })
    ).toThrow();

    expect(() =>
      ShortCharacterItemSnapshotSchema.parse({
        id: "character-1",
        title: "林默",
        order: 1,
        revision,
        ...bounded
      })
    ).not.toThrow();
    expect(() =>
      ShortCharacterItemSnapshotSchema.parse({
        id: "character-1",
        title: "林默",
        order: 1,
        revision,
        content: "前段",
        truncated: true
      })
    ).toThrow();

    expect(() =>
      PromptTextAttachmentSchema.parse({
        id: "attachment-1",
        kind: "text",
        name: "资料.txt",
        mediaType: "text/plain",
        size: 10,
        content: "前段",
        originalLength: 10
      })
    ).toThrow();
    expect(() =>
      LearningImitationDocumentSchema.parse({
        id: "learning-1",
        name: "样本.txt",
        extension: ".txt",
        mediaType: "text/plain",
        size: 10,
        text: "前段",
        charCount: 10,
        originalLength: 10
      })
    ).toThrow();
  });

  it("uses one 32 MiB character boundary across stored and runtime text files", () => {
    const atLimit = "a".repeat(SHORT_WORKSPACE_FILE_MAX_CHARACTERS);
    const overLimit = `${atLimit}a`;
    const revision = "v1:0:811c9dc5";
    const draftSection = {
      id: "section-1",
      title: "第一节",
      wordCountRequirement: "",
      body: atLimit,
      characterState: ""
    };
    const draftFile = {
      documentId: "d".repeat(4_096),
      title: "第一节·正文",
      content: atLimit,
      revision
    };
    const activeResource = {
      id: "draft:section-1:body",
      domain: "creation" as const,
      title: "第一节·正文",
      path: ["正文", "第一节", "正文"],
      source: "live-editor" as const,
      content: atLimit
    };
    const stage = {
      stageId: "outline" as const,
      title: "大纲",
      content: atLimit,
      revision
    };
    const mutation = {
      sessionId: "session-boundary",
      runId: "run-boundary",
      toolCallId: "tool-boundary",
      workspaceId: "book-boundary",
      stageId: "draft" as const,
      text: atLimit,
      mutationTarget: {
        kind: "expert-draft-file" as const,
        documentId: "d".repeat(4_096),
        sectionId: "section-1",
        fileKind: "body" as const
      },
      baseRevision: revision,
      summary: "边界写入",
      runtime
    };

    expect(ExpertDraftSchema.safeParse({ sections: [draftSection] }).success).toBe(true);
    expect(ExpertDraftFileSnapshotSchema.safeParse(draftFile).success).toBe(true);
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        title: "节".repeat(256),
        content: ""
      }).success
    ).toBe(true);
    expect(ActiveResourceSnapshotSchema.safeParse(activeResource).success).toBe(true);
    expect(
      ActiveResourceSnapshotSchema.safeParse({
        ...activeResource,
        content: "",
        truncated: true,
        originalLength: SHORT_WORKSPACE_FILE_MAX_CHARACTERS
      }).success
    ).toBe(true);
    expect(ShortWorkspaceStageSnapshotSchema.safeParse(stage).success).toBe(true);
    expect(WorkspaceEditorMutationPayloadSchema.safeParse(mutation).success).toBe(true);

    expect(
      ExpertDraftSchema.safeParse({
        sections: [{ ...draftSection, body: overLimit }]
      }).success
    ).toBe(false);
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        content: overLimit
      }).success
    ).toBe(false);
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        documentId: "d".repeat(4_097),
        content: ""
      }).success
    ).toBe(false);
    expect(
      ExpertDraftFileSnapshotSchema.safeParse({
        ...draftFile,
        title: "节".repeat(257),
        content: ""
      }).success
    ).toBe(false);
    expect(
      ActiveResourceSnapshotSchema.safeParse({
        ...activeResource,
        content: "",
        originalLength: SHORT_WORKSPACE_FILE_MAX_CHARACTERS + 1
      }).success
    ).toBe(false);
    expect(
      ShortWorkspaceStageSnapshotSchema.safeParse({
        ...stage,
        content: overLimit
      }).success
    ).toBe(false);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...mutation,
        text: overLimit
      }).success
    ).toBe(false);
    expect(
      WorkspaceEditorMutationPayloadSchema.safeParse({
        ...mutation,
        text: "",
        mutationTarget: {
          ...mutation.mutationTarget,
          documentId: "d".repeat(4_097)
        }
      }).success
    ).toBe(false);
  });

  it("allows a draft coordinator to bind the virtual draft directory", () => {
    const shortWorkspace = shortWorkspaceRuntimeFixture();

    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        shortWorkspace,
        activeResource: {
          id: "draft",
          domain: "creation",
          title: "正文",
          path: ["运行时正文", "正文"],
          source: "live-editor",
          content: ""
        }
      })
    ).not.toThrow();
  });

  it("binds the unified draft agent's active section to its physical files", () => {
    const base = shortWorkspaceRuntimeFixture();
    const shortWorkspace = {
      ...base,
      activeAgentId: "expert_draft_coordinator" as const,
      activeSectionId: "section-1"
    };

    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        shortWorkspace,
        activeResource: {
          id: "draft:section-1:body",
          domain: "creation",
          title: "第一节·正文",
          path: ["运行时正文", "正文", "第一节", "正文"],
          source: "live-editor",
          content: "第一节正文。"
        }
      })
    ).not.toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        shortWorkspace,
        activeResource: {
          id: "draft:section-2:body",
          domain: "creation",
          title: "第二节·正文",
          path: ["运行时正文", "正文", "第二节", "正文"],
          source: "live-editor",
          content: "第二节正文。"
        }
      })
    ).toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        shortWorkspace,
        activeResource: {
          id: "draft",
          domain: "creation",
          title: "正文",
          path: ["运行时正文", "正文"],
          source: "live-editor",
          content: ""
        }
      })
    ).toThrow();
  });

  it("matches bounded live snapshots across short stages and draft files", () => {
    const longContent = `雨夜。${"长".repeat(20_000)}`;
    const base = shortWorkspaceRuntimeFixture();
    const outlineWorkspace = {
      ...base,
      activeStageId: "outline" as const,
      activeAgentId: "plot_design" as const,
      stages: base.stages.map((stage) =>
        stage.stageId === "outline"
          ? {
              ...stage,
              content: longContent,
              revision: createShortWorkspaceContentRevision(longContent)
            }
          : stage
      )
    };
    const boundedResource = {
      id: "outline",
      domain: "creation" as const,
      title: "大纲",
      path: ["运行时正文", "大纲"],
      source: "live-editor" as const,
      content: longContent.slice(0, 20_000),
      truncated: true as const,
      originalLength: longContent.length
    };

    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        shortWorkspace: outlineWorkspace,
        activeResource: boundedResource
      })
    ).not.toThrow();

    const draftWorkspace = {
      ...base,
      activeSectionId: "section-1",
      expertDraft: {
        ...base.expertDraft,
        sections: base.expertDraft.sections.map((section) =>
          section.id === "section-1"
            ? {
                ...section,
                body: {
                  ...section.body,
                  content: longContent,
                  revision: createShortWorkspaceContentRevision(longContent)
                }
              }
            : section
        )
      }
    };
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        shortWorkspace: draftWorkspace,
        activeResource: {
          ...boundedResource,
          id: "draft:section-1:body",
          title: "第一节·正文"
        }
      })
    ).not.toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        shortWorkspace: draftWorkspace,
        activeResource: {
          ...boundedResource,
          id: "draft:section-1:body",
          content: `错${boundedResource.content.slice(1)}`
        }
      })
    ).toThrow();
  });

  it("does not allow material snapshots in the attached skill list", () => {
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        attachedSkills: [
          {
            id: "material_1",
            title: "雨夜声音",
            source: "attached-material",
            content: "雨声素材"
          }
        ]
      })
    ).toThrow();
  });

  it("validates complete library-agent settings and configuration commands", () => {
    expect(DEFAULT_LIBRARY_AGENT_SETTINGS.agents.map(({ domain }) => domain)).toEqual([
      "material",
      "skill"
    ]);
    const input = {
      agents: DEFAULT_LIBRARY_AGENT_SETTINGS.agents.map((agent) => ({
        domain: agent.domain,
        systemPrompt: agent.systemPrompt,
        readAccess: {
          skills: agent.readAccess.skills.map((skill) => ({ ...skill }))
        }
      }))
    };
    expect(LibraryAgentSettingsInputSchema.parse(input)).toEqual(input);
    expect(
      LibraryAgentSettingsInputSchema.safeParse({
        agents: [input.agents[0], input.agents[0]]
      }).success
    ).toBe(false);
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("libraryAgents.save", input, { id: "library-save" })
      ).type
    ).toBe("libraryAgents.save");
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope(
          "libraryAgents.reset",
          { domain: "skill" },
          { id: "library-reset" }
        )
      ).type
    ).toBe("libraryAgents.reset");
  });

  it("accepts appearance list and save commands with durable settings payloads", () => {
    const settings = createDefaultAppearanceSettings();
    settings.light.uiFontSize = 16.5;
    settings.mode = "dark";

    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("appearance.list", {}, { id: "appearance-list" })
      ).type
    ).toBe("appearance.list");
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("appearance.save", settings, { id: "appearance-save" })
      )
    ).toMatchObject({
      type: "appearance.save",
      payload: {
        mode: "dark",
        light: { uiFontSize: 16.5 }
      }
    });
    expect(AppearanceSettingsSnapshotSchema.parse({
      persisted: true,
      settings
    })).toMatchObject({
      persisted: true,
      settings: {
        mode: "dark",
        light: { uiFontSize: 16.5 },
        uiFontFamily: "system",
        editorFontFamily: "song"
      }
    });
  });

  it("defaults missing appearance font families and rejects unknown ids", () => {
    const settings = createDefaultAppearanceSettings();
    const parsed = AppearanceSettingsSchema.parse({
      mode: settings.mode,
      light: settings.light,
      dark: settings.dark
    });
    expect(parsed.uiFontFamily).toBe("system");
    expect(parsed.editorFontFamily).toBe("song");
    expect(resolveAppearanceUiFontStack("sans")).toContain("PingFang SC");
    expect(resolveAppearanceEditorFontStack("kai")).toContain("Kaiti SC");
    expect(resolveAppearanceUiFontStack("missing")).toBe(
      resolveAppearanceUiFontStack("system")
    );
    expect(listAppearanceUiFontFamilyOptions().map((option) => option.value)).toEqual([
      "system",
      "sans",
      "yuan"
    ]);
    expect(listAppearanceEditorFontFamilyOptions().map((option) => option.value)).toEqual([
      "song",
      "kai",
      "fangsong",
      "sans",
      "yuan"
    ]);
    expect(
      AppearanceSettingsSchema.safeParse({
        ...settings,
        uiFontFamily: "comic-sans"
      } as unknown).success
    ).toBe(false);
    expect(
      AppearanceSettingsSchema.safeParse({
        ...settings,
        editorFontFamily: "times"
      } as unknown).success
    ).toBe(false);
  });

  it("keeps library workspaces isolated from short and learning contexts", () => {
    const body = "人物素材正文";
    const libraryWorkspace = {
      domain: "material" as const,
      libraryId: "material-library-1",
      title: "人物素材",
      libraryType: "short" as const,
      kind: "character" as const,
      overviewDocumentId: "material-overview-1",
      overview: "只用于人物设定",
      overviewRevision: createShortWorkspaceContentRevision("只用于人物设定"),
      readOnly: false,
      activeEntryId: "entry-1",
      projectRevision: 2,
      entries: [
        {
          id: "entry-1",
          documentId: "document-1",
          stageId: "character" as const,
          title: "人物甲",
          content: body,
          revision: createShortWorkspaceContentRevision(body),
          readOnly: false
        }
      ]
    };
    const activeResource = {
      id: "document-1",
      domain: "material" as const,
      title: "人物甲",
      path: ["人物素材", "人物甲"],
      source: "live-editor" as const,
      content: body
    };
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource,
        libraryWorkspace
      })
    ).not.toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource: { ...activeResource, content: "过期的编辑器内容" },
        libraryWorkspace
      })
    ).toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource: { ...activeResource, domain: "skill" },
        libraryWorkspace
      })
    ).toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource,
        libraryWorkspace,
        shortWorkspace: shortWorkspaceRuntimeFixture()
      })
    ).toThrow();

    const profile = DEFAULT_LIBRARY_AGENT_SETTINGS.agents.find(
      ({ domain }) => domain === "material"
    )!;
    expect(() =>
      AgentPromptCommandPayloadSchema.parse({
        sessionId: "session-library",
        message: "整理素材",
        workspaceContext: { activeResource, libraryWorkspace },
        libraryAgentProfile: profile
      })
    ).not.toThrow();
    expect(() =>
      AgentPromptCommandPayloadSchema.parse({
        sessionId: "session-library",
        message: "整理素材",
        workspaceContext: { activeResource, libraryWorkspace }
      })
    ).toThrow();
  });

  it("binds truncated library entry and overview snapshots to the live editor", () => {
    const fullContent = `资料库。${"长".repeat(50_000)}`;
    const entrySnapshot = fullContent.slice(0, 40_000);
    const activeSnapshot = fullContent.slice(0, 20_000);
    const commonWorkspace = {
      domain: "material" as const,
      libraryId: "material-library-long",
      title: "长素材库",
      libraryType: "short" as const,
      kind: "character" as const,
      overviewDocumentId: "overview-long",
      overview: "素材库概览",
      overviewRevision: createShortWorkspaceContentRevision("素材库概览"),
      readOnly: false,
      activeEntryId: "entry-long",
      entries: [
        {
          id: "entry-long",
          documentId: "document-long",
          stageId: "character" as const,
          title: "长人物资料",
          content: entrySnapshot,
          revision: createShortWorkspaceContentRevision(entrySnapshot),
          readOnly: false,
          truncated: true,
          originalLength: fullContent.length
        }
      ]
    };
    const activeResource = {
      id: "document-long",
      domain: "material" as const,
      title: "长人物资料",
      path: ["长素材库", "长人物资料"],
      source: "live-editor" as const,
      content: activeSnapshot,
      truncated: true as const,
      originalLength: fullContent.length
    };

    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource,
        libraryWorkspace: commonWorkspace
      })
    ).not.toThrow();

    const overviewWorkspace = {
      ...commonWorkspace,
      overview: entrySnapshot,
      overviewRevision: createShortWorkspaceContentRevision(entrySnapshot),
      overviewTruncated: true as const,
      overviewOriginalLength: fullContent.length,
      activeEntryId: undefined
    };
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource: { ...activeResource, id: "overview-long" },
        libraryWorkspace: overviewWorkspace
      })
    ).not.toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource: { ...activeResource, id: "wrong-overview" },
        libraryWorkspace: overviewWorkspace
      })
    ).toThrow();
  });

  it("validates create and edit library mutation events", () => {
    const base = {
      sessionId: "session-library-edit",
      runId: "run-library-edit",
      toolCallId: "tool-library-edit",
      domain: "material" as const,
      libraryId: "material-library-1",
      stageId: "character",
      title: "人物甲",
      text: "更新后正文",
      baseRevision: createShortWorkspaceContentRevision("更新前正文"),
      baseProjectRevision: 3,
      summary: "已生成条目修改。",
      runtime
    };
    const context = {
      sessionId: base.sessionId,
      runId: base.runId
    };
    expect(
      SystemEventEnvelopeSchema.parse(
        createEnvelope(
          "library.editor_mutation",
          {
            ...base,
            operation: "edit" as const,
            entryId: "entry-1",
            documentId: "document-1"
          },
          { id: "library-edit-event", context }
        )
      ).type
    ).toBe("library.editor_mutation");
    expect(
      SystemEventEnvelopeSchema.parse(
        createEnvelope(
          "library.editor_mutation",
          { ...base, operation: "create" as const },
          { id: "library-create-event", context }
        )
      ).type
    ).toBe("library.editor_mutation");
    const { stageId: _stageId, ...overviewBase } = base;
    expect(
      SystemEventEnvelopeSchema.parse(
        createEnvelope(
          "library.editor_mutation",
          {
            ...overviewBase,
            operation: "edit-overview" as const,
            documentId: "material-overview-1",
            title: "人物素材 · 库介绍",
            text: "更新后的库介绍"
          },
          { id: "library-overview-event", context }
        )
      ).type
    ).toBe("library.editor_mutation");
    expect(() =>
      SystemEventEnvelopeSchema.parse(
        createEnvelope(
          "library.editor_mutation",
          { ...base, operation: "edit" as const },
          { id: "library-bad-edit-event", context }
        )
      )
    ).toThrow();
  });
});
