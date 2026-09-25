import { describe, expect, it } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  createAssistantMessageEventStream,
  type AssistantMessage
} from "@earendil-works/pi-ai";
import {
  DEFAULT_LIBRARY_AGENT_PROFILES,
  DEFAULT_LONG_AGENT_PROFILES,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
  SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS,
  SCRIPT_WORKSPACE_TEXT_STAGE_IDS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  cloneEmptyLearningImitationResult,
  createDefaultCreativePlotStages,
  createShortWorkspaceContentRevision,
  type AgentProviderRuntimeConfig,
  type LongWorkspaceRuntimeContext,
  type ScriptWorkspaceAgentProfile,
  type ScriptWorkspaceSnapshot,
  type ShortWorkspaceSnapshot
} from "@deepwrite/contracts";
import {
  buildEffectiveSystemPrompt,
  buildAgentEvaluationSnapshot,
  evaluationConversationHistory,
  buildProviderRuntime,
  buildRawUserMessage,
  buildRuntimeUserPrompt,
  interceptToolCallStream,
  PiAgentRuntimeAdapter,
  reconcileToolCallArguments,
  toRuntimeEvents,
  toToolStreamRuntimeEvent,
  toUsageObservedRuntimeEvent,
  type AgentRuntimeEvent
} from "./index";

const providerRuntime = {
  provider: "deepseek",
  model: "deepseek-chat",
  mode: "provider" as const
};

function scriptAgentProfile(): ScriptWorkspaceAgentProfile {
  const profile = DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.find(
    ({ id }) => id === "expert_draft_coordinator"
  )!;
  return {
    ...profile,
    systemPrompt: "用户在设置中编辑的剧本正文专家提示词。"
  };
}

function screenplayWorkspace(): ScriptWorkspaceSnapshot {
  const emptyRevision = createShortWorkspaceContentRevision("");
  return {
    id: "script-runtime-test",
    title: "雾港剧本",
    categories: ["悬疑"],
    activeStageId: "draft",
    activeAgentId: "expert_draft_coordinator",
    activeSectionId: "episode-1",
    characterStructure: { format: "text" },
    plotStages: createDefaultCreativePlotStages(),
    expertDraft: {
      id: "draft",
      title: "正文",
      revision: createShortWorkspaceContentRevision("episode-1"),
      sections: [{
        id: "episode-1",
        title: "第一集",
        wordCountRequirement: "15 分钟",
        body: {
          documentId: "draft:episode-1:body",
          title: "第一集",
          content: "",
          revision: emptyRevision
        },
        characterState: {
          documentId: "draft:episode-1:state",
          title: "第一集 · 人物状态",
          content: "",
          revision: emptyRevision
        }
      }]
    },
    stages: SCRIPT_WORKSPACE_TEXT_STAGE_IDS.map(
      (stageId) => ({
        stageId,
        title: stageId,
        content: "",
        revision: emptyRevision
      })
    )
  };
}

function toolCallMessage(id: string, name: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id, name, arguments: {} }],
    api: "openai-completions",
    provider: "deepseek",
    model: "deepseek-chat",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: "toolUse",
    timestamp: Date.now()
  };
}

async function captureDisabledThinkingPayload(
  config: AgentProviderRuntimeConfig
): Promise<Record<string, unknown>> {
  const { model, streamFn } = buildProviderRuntime(
    config,
    config.temperatureOptions[1],
    "off"
  );
  let capturedPayload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Reply with OK only.",
      messages: [{
        role: "user",
        content: "OK",
        timestamp: Date.now()
      }]
    },
    {
      onPayload: (payload) => {
        capturedPayload = payload;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  expect(capturedPayload).toBeDefined();
  return capturedPayload as Record<string, unknown>;
}

async function captureThinkingPayload(
  config: AgentProviderRuntimeConfig,
  configuredLevel: "low" | "high" | "max"
): Promise<Record<string, unknown>> {
  const { model, streamFn } = buildProviderRuntime(
    config,
    undefined,
    configuredLevel
  );
  let capturedPayload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Reply with OK only.",
      messages: [{
        role: "user",
        content: "OK",
        timestamp: Date.now()
      }]
    },
    {
      reasoning: configuredLevel === "max" ? "xhigh" : configuredLevel,
      onPayload: (payload) => {
        capturedPayload = payload;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  expect(capturedPayload).toBeDefined();
  return capturedPayload as Record<string, unknown>;
}

function ollamaGrammarRegressionTool(): AgentTool {
  const parameters = Type.Object({
    direct_text: Type.String({ maxLength: 200_000 }),
    replacements: Type.Array(
      Type.Object({
        original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
        new_text: Type.String({ maxLength: 20_000 })
      })
    )
  });
  return {
    name: "edit_text",
    label: "Edit text",
    description: "Edit text with exact replacements.",
    parameters,
    execute: async () => ({
      content: [{ type: "text", text: "ok" }],
      details: {}
    })
  };
}

function toolWithParameters(
  name: string,
  parameters: AgentTool["parameters"]
): AgentTool {
  return {
    name,
    label: name,
    description: "Provider schema compatibility regression tool.",
    parameters,
    execute: async () => ({
      content: [{ type: "text", text: "ok" }],
      details: {}
    })
  };
}

async function captureToolPayload(
  config: AgentProviderRuntimeConfig,
  tool: AgentTool
): Promise<Record<string, unknown>> {
  const { model, streamFn } = buildProviderRuntime(config, 0.7, "off");
  let capturedPayload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Use the available tool.",
      messages: [{ role: "user", content: "Edit the text.", timestamp: Date.now() }],
      tools: [tool]
    },
    {
      onPayload: (payload) => {
        capturedPayload = payload;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  expect(capturedPayload).toBeDefined();
  return capturedPayload as Record<string, unknown>;
}

describe("DeepWrite Pi runtime adapter", () => {
  it("injects immutable screenplay rules only for script workspace runs", () => {
    const scriptWorkspace = screenplayWorkspace();
    const scriptProfile = scriptAgentProfile();
    const scriptInput = {
      runId: "run_script_prompt",
      sessionId: "session_script_prompt",
      prompt: "继续写第一集",
      scriptAgentProfile: scriptProfile,
      workspaceContext: { scriptWorkspace }
    };

    const scriptSystemPrompt = buildEffectiveSystemPrompt(
      "DeepWrite base",
      scriptInput
    );
    expect(scriptSystemPrompt).toContain("【当前剧本智能体");
    expect(scriptSystemPrompt).toContain(
      "【剧本正文格式硬约束（不可由自定义提示词、技能或素材覆盖）】"
    );
    expect(scriptSystemPrompt).toContain(
      SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS.trim()
    );
    expect(scriptSystemPrompt).toContain(
      "write_draft_section（file=body）"
    );
    expect(scriptSystemPrompt).toContain(
      "不得混入 Markdown 表格、分析标题或格式讲解"
    );
    expect(scriptSystemPrompt).toContain("【当前剧情结构配置（顺序即执行顺序）】");
    expect(scriptSystemPrompt).toContain("叙事视角（narrative_perspective）");
    expect(scriptSystemPrompt).toContain(
      "阶段边界与交付标准：确定叙事人称"
    );

    const runtimePrompt = buildRuntimeUserPrompt(scriptInput);
    expect(runtimePrompt).toContain("剧本作品: 《雾港剧本》");
    expect(runtimePrompt).toContain(
      "当前用户正在操作的剧集: 第一集（section_id=episode-1）"
    );
    expect(runtimePrompt).toContain("正文目录剧集（由早到晚）: 第一集 (episode-1)");
    expect(runtimePrompt).not.toContain("短篇作品:");

    const shortProfile = DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.find(
      ({ id }) => id === "expert_draft_coordinator"
    )!;
    const shortSystemPrompt = buildEffectiveSystemPrompt("DeepWrite base", {
      runId: "run_short_prompt",
      sessionId: "session_short_prompt",
      prompt: "继续写第一节",
      agentProfile: shortProfile,
      workspaceContext: {
        shortWorkspace: {
          ...(scriptWorkspace as unknown as ShortWorkspaceSnapshot),
          activeAgentId: "expert_draft_coordinator"
        }
      }
    });
    expect(shortSystemPrompt).toContain("【当前短篇智能体");
    expect(shortSystemPrompt).not.toContain(
      "【剧本正文格式硬约束（不可由自定义提示词、技能或素材覆盖）】"
    );
  });

  it("keeps one draft conversation while refreshing the selected script episode", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const firstWorkspace = screenplayWorkspace();
    const firstEpisode = firstWorkspace.expertDraft.sections[0]!;
    const emptyRevision = createShortWorkspaceContentRevision("");
    const secondWorkspace: ScriptWorkspaceSnapshot = {
      ...firstWorkspace,
      activeSectionId: "episode-2",
      expertDraft: {
        ...firstWorkspace.expertDraft,
        revision: createShortWorkspaceContentRevision("episode-1\nepisode-2"),
        sections: [
          firstEpisode,
          {
            id: "episode-2",
            title: "第二集",
            wordCountRequirement: "15 分钟",
            body: {
              documentId: "draft:episode-2:body",
              title: "第二集",
              content: "",
              revision: emptyRevision
            },
            characterState: {
              documentId: "draft:episode-2:state",
              title: "第二集 · 人物状态",
              content: "",
              revision: emptyRevision
            }
          }
        ]
      }
    };
    const profile = scriptAgentProfile();
    const sessionId = "session_script_shared_draft";

    for await (const _event of runtime.start({
      runId: "run_script_episode_1",
      sessionId,
      prompt: "先写第一集",
      thinkingLevel: "off",
      scriptAgentProfile: profile,
      workspaceContext: { scriptWorkspace: firstWorkspace }
    })) {
      // Consume the first turn before changing the UI focus.
    }
    for await (const _event of runtime.start({
      runId: "run_script_episode_2",
      sessionId,
      prompt: "再写第二集",
      thinkingLevel: "off",
      scriptAgentProfile: profile,
      workspaceContext: { scriptWorkspace: secondWorkspace }
    })) {
      // Consume the follow-up turn so the same cached agent is refreshed.
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          {
            state: {
              systemPrompt: string;
              messages: Array<{ role?: string; content?: unknown }>;
              tools: AgentTool[];
            };
          }
        >;
      }
    ).conversationAgents;
    expect(cache).toHaveLength(1);
    const agent = cache.get(`${sessionId}:script:expert_draft_coordinator`);
    expect(
      agent?.state.messages.filter((message) => message.role === "user")
    ).toHaveLength(2);
    expect(agent?.state.systemPrompt).toContain(
      "【当前用户正在操作的剧集】\n标题：第二集"
    );
    expect(agent?.state.systemPrompt).not.toContain(
      "【当前用户正在操作的剧集】\n标题：第一集"
    );

    const write = agent?.state.tools.find(
      (candidate) => candidate.name === "write_draft_section"
    );
    if (!write) throw new Error("Missing refreshed draft write tool.");
    const result = await write.execute("write-focused-episode", {
      text: "第二集正式正文。"
    });
    expect(result.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      documentId: "draft:episode-2:body",
      sectionId: "episode-2",
      fileKind: "body"
    });
  });

  it("reminds draft agents to read character items in list mode", () => {
    const profile = DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.find(
      ({ id }) => id === "expert_draft_coordinator"
    )!;
    const shortWorkspace = {
      ...(screenplayWorkspace() as unknown as ShortWorkspaceSnapshot),
      activeAgentId: "expert_draft_coordinator" as const,
      characterStructure: {
        format: "list" as const,
        items: [
          {
            id: "character-linmo",
            title: "林默",
            order: 1,
            content: "雾港巡夜人。",
            revision: createShortWorkspaceContentRevision("雾港巡夜人。")
          }
        ]
      }
    };
    const systemPrompt = buildEffectiveSystemPrompt("DeepWrite base", {
      runId: "run_draft_character_list",
      sessionId: "session_draft_character_list",
      prompt: "写当前章节",
      agentProfile: profile,
      workspaceContext: { shortWorkspace }
    });

    expect(systemPrompt).toContain("当前人物结构为条目样式");
    expect(systemPrompt).toContain("read_character（指定 item_id）");
    expect(systemPrompt).toContain("不得只读概览");
    expect(systemPrompt).toContain("list_characters");
  });

  it("describes realtime serialized persistence for auto-approved long proposals", () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "plot_design"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_prompt",
      title: "雾港长篇",
      activeRoot: "plot_design",
      activeAgentId: profile.id,
      workspaceRevision: 3,
      projectRevision: 5,
      navigation: {
        schemaVersion: 1,
        revision: 3,
        bookId: "longbook_prompt",
        updatedAt: "2026-07-26T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 0,
          characters: 0,
          volumes: 1,
          arcs: 0,
          chapterCards: 0,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [],
        characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
        characters: [],
        volumes: [{ id: "volume_prompt", title: "第一卷", order: 1 }],
        arcs: [],
        chapterCards: [],
        committedThroughChapterId: null
      }
    };
    const prompt = buildEffectiveSystemPrompt("DeepWrite base", {
      runId: "run_long_prompt",
      sessionId: "session_long_prompt",
      prompt: "调整结构",
      writeApprovalMode: "auto-approve",
      longAgentProfile: profile,
      workspaceContext: { longWorkspace }
    });

    expect(prompt).toContain("立即加入按书籍串行的后台队列");
    expect(prompt).toContain("影响预览");
    expect(prompt).toContain("自动完成");
    expect(prompt).not.toContain("本轮完成后");
  });

  it("keeps the long chapter-writer runtime boundary limited to novel body", () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "draft"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_writer_prompt",
      title: "雾港长篇",
      activeRoot: "draft",
      activeAgentId: profile.id,
      activeChapterCardId: "chapter_writer_prompt",
      workspaceRevision: 3,
      projectRevision: 5,
      navigation: {
        schemaVersion: 1,
        revision: 3,
        bookId: "longbook_writer_prompt",
        updatedAt: "2026-08-02T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 0,
          characters: 0,
          volumes: 1,
          arcs: 1,
          chapterCards: 1,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [],
        characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
        characters: [],
        volumes: [{ id: "volume_writer_prompt", title: "第一卷", order: 1 }],
        arcs: [{
          id: "arc_writer_prompt",
          volumeId: "volume_writer_prompt",
          title: "主线",
          order: 1
        }],
        chapterCards: [{
          id: "chapter_writer_prompt",
          volumeId: "volume_writer_prompt",
          primaryArcId: "arc_writer_prompt",
          title: "第一章",
          narrativeOrder: 1,
          bodyStatus: "empty"
        }],
        committedThroughChapterId: null
      }
    };

    const prompt = buildEffectiveSystemPrompt("DeepWrite base", {
      runId: "run_writer_prompt",
      sessionId: "session_writer_prompt",
      prompt: "写第一章",
      longAgentProfile: profile,
      workspaceContext: { longWorkspace }
    });

    expect(prompt).toContain("只允许为上下文锁定的当前章形成小说正文提案");
    expect(prompt).toContain("不得生成或修改人物状态、handoff、接续包");
    expect(prompt).toContain("世界观、人物目录与长篇结构导航已写入本轮固定上下文");
    expect(prompt).not.toContain("按稳定实体 ID 和 fileId 查询");
    expect(prompt).not.toContain("必须同时形成正文、人物状态和 handoff");
  });

  it("lets the continuity ledger write any unrecorded chapter and catch up in one pass", () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "continuity_ledger"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_ledger_prompt",
      title: "雾港长篇",
      activeRoot: "continuity_ledger",
      activeAgentId: profile.id,
      workspaceRevision: 3,
      projectRevision: 5,
      navigation: {
        schemaVersion: 1,
        revision: 3,
        bookId: "longbook_ledger_prompt",
        updatedAt: "2026-08-16T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 0,
          characters: 0,
          volumes: 1,
          arcs: 0,
          chapterCards: 0,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [],
        characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
        characters: [],
        volumes: [{ id: "volume_ledger_prompt", title: "第一卷", order: 1 }],
        arcs: [],
        chapterCards: [],
        committedThroughChapterId: null
      }
    };

    const prompt = buildEffectiveSystemPrompt("DeepWrite base", {
      runId: "run_ledger_prompt",
      sessionId: "session_ledger_prompt",
      prompt: "批量提交所有未提交章节",
      longAgentProfile: profile,
      workspaceContext: { longWorkspace }
    });

    expect(prompt).toContain("可对任意已有正文、尚未记录的章卡写入");
    expect(prompt).toContain("未选中章卡时必须带 chapter_card_id");
    expect(prompt).toContain("pending_catchup");
    expect(prompt).toContain("前文 brief 只写简短章末状态与接续包");
    expect(prompt).toContain("最后一张 full 写完整账本");
    expect(prompt).toContain("批量提交所有未提交章节");
  });

  it("keeps worldbuilding prompts on business ids and hides file controls", () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "setting"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_world_prompt",
      title: "雾港长篇",
      activeRoot: "worldbuilding",
      activeAgentId: profile.id,
      activeFileId: "file_world_rules:content",
      activeFileRevision: "v1:0:00000000",
      workspaceRevision: 3,
      projectRevision: 5,
      worldbuildingDirectory: {
        categories: [
          {
            categoryId: "world_rules",
            title: "世界规则",
            order: 1,
            format: "text"
          },
          {
            categoryId: "world_factions",
            title: "势力",
            order: 2,
            format: "list",
            itemCount: 2,
            items: [
              {
                itemId: "worlditem_watchers",
                title: "守夜人",
                order: 1
              },
              {
                itemId: "worlditem_harbor",
                title: "港务会",
                order: 2
              }
            ],
            omittedItemCount: 0
          }
        ],
        omittedCategoryCount: 0
      },
      worldbuildingFocus: {
        categoryTitle: "世界规则",
        format: "text",
        currentStage: {
          kind: "text",
          title: "世界规则",
          text: { content: "雾潮期间禁止点燃蓝焰。" }
        }
      },
      navigation: {
        schemaVersion: 1,
        revision: 3,
        bookId: "longbook_world_prompt",
        updatedAt: "2026-07-26T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 1,
          characters: 0,
          volumes: 1,
          arcs: 0,
          chapterCards: 0,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [{
          id: "world_rules",
          title: "世界规则",
          order: 1,
          format: "text"
        }],
        characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
        characters: [],
        volumes: [{ id: "volume_world_prompt", title: "第一卷", order: 1 }],
        arcs: [],
        chapterCards: [],
        committedThroughChapterId: null
      }
    };
    const input = {
      runId: "run_world_prompt",
      sessionId: "session_world_prompt",
      prompt: "核对世界规则",
      longAgentProfile: profile,
      workspaceContext: { longWorkspace }
    };

    const systemPrompt = buildEffectiveSystemPrompt("DeepWrite base", input);
    expect(systemPrompt).toContain("category_id");
    expect(systemPrompt).toContain("item_id");
    expect(systemPrompt).toContain("list_setting");
    expect(systemPrompt).not.toContain("fileId");
    expect(systemPrompt).not.toContain("file_id");
    expect(systemPrompt).not.toContain("bookId");
    expect(systemPrompt).not.toContain(" / worldbuilding");
    expect(systemPrompt).toContain("长篇结构导航已写入固定上下文");
    expect(systemPrompt).toContain("不得修改剧情结构");

    const userPrompt = buildRuntimeUserPrompt(input);
    expect(userPrompt).toContain("长篇作品: 《雾港长篇》");
    expect(userPrompt).toContain("【世界观条目列表（发送时快照）】");
    expect(userPrompt).toContain("【人物设计列表（发送时快照）】");
    expect(userPrompt).toContain(
      "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(userPrompt).toContain("【当前阶段信息与要求】");
    expect(userPrompt.indexOf("【世界观条目列表（发送时快照）】")).toBeLessThan(
      userPrompt.indexOf("【人物设计列表（发送时快照）】")
    );
    expect(userPrompt.indexOf("【人物设计列表（发送时快照）】")).toBeLessThan(
      userPrompt.indexOf(
        "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
      )
    );
    expect(
      userPrompt.indexOf(
        "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
      )
    ).toBeLessThan(userPrompt.indexOf("【当前阶段信息与要求】"));
    expect(userPrompt).toContain(
      "全书共 1 卷、0 个剧情点、0 张章卡、0 条故事情节、0 个故事事件、0 条伏笔线"
    );
    expect(userPrompt).toContain(
      "- 第 1 卷「第一卷」(volume_world_prompt): 暂无剧情点"
    );
    expect(userPrompt).not.toContain("当前剧情工作区");
    expect(userPrompt).toContain(
      "世界规则（category_id=world_rules；类型=文本）"
    );
    expect(userPrompt).toContain(
      "势力（category_id=world_factions；类型=条目列表；共 2 项）"
    );
    expect(userPrompt).toContain(
      "守夜人（item_id=worlditem_watchers；顺序=1）"
    );
    expect(userPrompt).toContain("主角（type_id=protagonist；共 0 人）");
    expect(userPrompt).toContain("当前智能体: 设定智能体");
    expect(userPrompt).toContain(
      "当前用户所处的世界观阶段: 文本型分类「世界规则」（category_id=world_rules）"
    );
    expect(userPrompt).toContain(
      "当前阶段简要信息: 仅定位当前页面，正文未注入；需要时调用 read_setting（domain=worldbuilding, category_id=world_rules）读取。"
    );
    expect(userPrompt).not.toContain("雾潮期间禁止点燃蓝焰。");
    expect(userPrompt).not.toContain("当前阶段信息:");
    expect(userPrompt).not.toContain("当前分类概览");
    expect(userPrompt).not.toContain("另一侧人物");
    expect(userPrompt).not.toContain("当前根节点:");
    expect(userPrompt).not.toContain("(worldbuilding)");
    expect(userPrompt).not.toContain("longbook_world_prompt");
    expect(userPrompt).not.toContain("file_world_rules:content");
    expect(userPrompt).not.toContain("v1:0:00000000");
    expect(userPrompt).not.toContain("session_world_prompt");
    expect(userPrompt).not.toContain("run_world_prompt");

    const listPrompt = buildRuntimeUserPrompt({
      ...input,
      workspaceContext: {
        longWorkspace: {
          ...longWorkspace,
          worldbuildingFocus: {
            categoryTitle: "势力",
            format: "list",
            currentStage: {
              kind: "item",
              title: "守夜人",
              text: { content: "守夜人负责执行宵禁。" }
            },
            overview: { content: "各势力争夺港务权。" }
          }
        }
      }
    });
    expect(listPrompt).toContain(
      "当前用户所处的世界观阶段: 列表型分类「势力」 / 条目「守夜人」（category_id=world_factions；item_id=worlditem_watchers）"
    );
    expect(listPrompt).toContain(
      "当前阶段简要信息: 仅定位当前页面，正文未注入；需要时调用 read_setting（domain=worldbuilding, category_id=world_factions, item_id=worlditem_watchers）读取。"
    );
    expect(listPrompt).not.toContain("守夜人负责执行宵禁。");
    expect(listPrompt).not.toContain("各势力争夺港务权。");
    expect(listPrompt).not.toContain("当前分类概览");
  });

  it("keeps character prompts on business ids and injects a brief focused stage", () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "setting"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_character_prompt",
      title: "雾港长篇",
      activeRoot: "character_design",
      activeAgentId: profile.id,
      activeFileId: "file_character_lan:relationships",
      activeFileRevision: "v1:0:00000000",
      workspaceRevision: 3,
      projectRevision: 5,
      worldbuildingDirectory: {
        categories: [
          {
            categoryId: "world_rules",
            title: "世界规则",
            order: 1,
            format: "text"
          }
        ],
        omittedCategoryCount: 0
      },
      characterFocus: {
        characterName: "林岚",
        group: "chartype_viewpoint",
        currentDocument: {
          kind: "relationships",
          title: "人物关系",
          text: { content: "与沈砚暂时合作。" }
        },
        coreProfile: { content: "雾港巡夜人，害怕深水。" }
      },
      navigation: {
        schemaVersion: 1,
        revision: 3,
        bookId: "longbook_character_prompt",
        updatedAt: "2026-07-26T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 0,
          characters: 1,
          volumes: 1,
          arcs: 0,
          chapterCards: 0,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [],
        characterTypes: [
          { id: "chartype_viewpoint", title: "视角人物", order: 1 }
        ],
        characters: [
          {
            id: "character_lan",
            name: "林岚",
            group: "chartype_viewpoint",
            order: 1
          }
        ],
        volumes: [{ id: "volume_character_prompt", title: "第一卷", order: 1 }],
        arcs: [],
        chapterCards: [],
        committedThroughChapterId: null
      }
    };
    const input = {
      runId: "run_character_prompt",
      sessionId: "session_character_prompt",
      prompt: "完善人物关系",
      longAgentProfile: profile,
      workspaceContext: { longWorkspace }
    };

    const systemPrompt = buildEffectiveSystemPrompt("DeepWrite base", input);
    expect(systemPrompt).toContain("list_setting");
    expect(systemPrompt).toContain("read_setting");
    expect(systemPrompt).not.toContain("fileId");
    expect(systemPrompt).not.toContain("file_id");
    expect(systemPrompt).not.toContain("bookId");

    const userPrompt = buildRuntimeUserPrompt(input);
    expect(userPrompt).toContain("【世界观条目列表（发送时快照）】");
    expect(userPrompt).toContain(
      "世界规则（category_id=world_rules；类型=文本）"
    );
    expect(userPrompt).toContain("【人物设计列表（发送时快照）】");
    expect(userPrompt).toContain(
      "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(userPrompt).toContain("【当前阶段信息与要求】");
    expect(userPrompt.indexOf("【人物设计列表（发送时快照）】")).toBeLessThan(
      userPrompt.indexOf(
        "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
      )
    );
    expect(
      userPrompt.indexOf(
        "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
      )
    ).toBeLessThan(userPrompt.indexOf("【当前阶段信息与要求】"));
    expect(userPrompt).toContain(
      "全书共 1 卷、0 个剧情点、0 张章卡、0 条故事情节、0 个故事事件、0 条伏笔线"
    );
    expect(userPrompt).not.toContain("当前剧情工作区");
    expect(userPrompt).toContain(
      "视角人物（type_id=chartype_viewpoint；共 1 人）"
    );
    expect(userPrompt).toContain(
      "林岚（character_id=character_lan；顺序=1）"
    );
    expect(userPrompt).toContain(
      "当前用户所处的人物阶段: 「林岚」 / 人物关系（character_id=character_lan；document=relationships；type_id=chartype_viewpoint）"
    );
    expect(userPrompt).toContain(
      "当前阶段简要信息: 仅定位当前人物文档，正文未注入；需要时调用 read_setting（domain=character, character_id=character_lan, document=relationships）读取。"
    );
    expect(userPrompt).not.toContain("与沈砚暂时合作。");
    expect(userPrompt).not.toContain("雾港巡夜人，害怕深水。");
    expect(userPrompt).not.toContain("人物核心档案:");
    expect(userPrompt).not.toContain("【人物类型目录");
    expect(userPrompt).not.toContain("另一侧世界观");
    expect(userPrompt).not.toContain("当前根节点:");
    expect(userPrompt).not.toContain("longbook_character_prompt");
    expect(userPrompt).not.toContain("file_character_lan:relationships");
    expect(userPrompt).not.toContain("session_character_prompt");
    expect(userPrompt).not.toContain("run_character_prompt");
  });

  it("caps the setting-agent character directory at 50 people per type", () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "setting"
    )!;
    const extras = Array.from({ length: 52 }, (_, index) => ({
      id: `character_extra_${String(index + 1).padStart(2, "0")}`,
      name: `配角${index + 1}`,
      group: "supporting",
      order: index + 1
    }));
    const userPrompt = buildRuntimeUserPrompt({
      runId: "run_character_directory_cap",
      sessionId: "session_character_directory_cap",
      prompt: "补充配角",
      longAgentProfile: profile,
      workspaceContext: {
        longWorkspace: {
          bookId: "longbook_character_directory",
          title: "雾港长篇",
          activeRoot: "worldbuilding",
          activeAgentId: profile.id,
          workspaceRevision: 3,
          projectRevision: 5,
          worldbuildingDirectory: {
            categories: [
              {
                categoryId: "world_rules",
                title: "世界规则",
                order: 1,
                format: "text"
              }
            ],
            omittedCategoryCount: 0
          },
          navigation: {
            schemaVersion: 1,
            revision: 3,
            bookId: "longbook_character_directory",
            updatedAt: "2026-07-26T10:00:00.000Z",
            counts: {
              worldbuildingCategories: 0,
              characters: extras.length,
              volumes: 1,
              arcs: 0,
              chapterCards: 0,
              storyEvents: 0,
              storyPlots: 0,
              foreshadowingThreads: 0,
              committedChapters: 0
            },
            worldbuilding: [],
            characterTypes: [
              { id: "supporting", title: "配角", order: 1 }
            ],
            characters: extras,
            volumes: [
              { id: "volume_character_directory", title: "第一卷", order: 1 }
            ],
            arcs: [],
            chapterCards: [],
            committedThroughChapterId: null
          }
        }
      }
    });

    expect(userPrompt).toContain("【世界观条目列表（发送时快照）】");
    expect(userPrompt).toContain("【人物设计列表（发送时快照）】");
    expect(userPrompt).toContain("配角（type_id=supporting；共 52 人）");
    expect(userPrompt).toContain(
      "配角1（character_id=character_extra_01；顺序=1）"
    );
    expect(userPrompt).toContain(
      "配角50（character_id=character_extra_50；顺序=50）"
    );
    expect(userPrompt).not.toContain("character_extra_51");
    expect(userPrompt).not.toContain("配角51");
    expect(userPrompt).toContain(
      "另有 2 人未进入固定上下文，需要时调用 list_setting（domain=character, type_id=supporting）查询。"
    );
  });

  it("injects plot structure navigation and refreshes the plot position on every turn", async () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "plot_design"
    )!;
    const navigation = {
      schemaVersion: 1 as const,
      revision: 3,
      bookId: "longbook_plot_prompt",
      updatedAt: "2026-07-26T10:00:00.000Z",
      counts: {
        worldbuildingCategories: 1,
        characters: 1,
        volumes: 2,
        arcs: 3,
        chapterCards: 1,
        storyEvents: 0,
        storyPlots: 2,
        foreshadowingThreads: 1,
        committedChapters: 1
      },
      worldbuilding: [
        {
          id: "world_rules",
          title: "世界规则",
          order: 1,
          format: "text" as const
        }
      ],
      characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
      characters: [
        {
          id: "character_lan",
          name: "林岚",
          group: "protagonist",
          order: 1
        }
      ],
      volumes: [
        { id: "volume_plot_a", title: "起势", order: 1 },
        { id: "volume_plot_b", title: "转折", order: 2 }
      ],
      arcs: [
        { id: "arc_plot_main", volumeId: "volume_plot_a", title: "主线", order: 1 },
        { id: "arc_plot_hidden", volumeId: "volume_plot_a", title: "暗线", order: 2 },
        { id: "arc_plot_turn", volumeId: "volume_plot_b", title: "反击", order: 1 }
      ],
      chapterCards: [
        {
          id: "chapter_plot_one",
          volumeId: "volume_plot_a",
          primaryArcId: "arc_plot_main",
          title: "第一章",
          narrativeOrder: 1,
          bodyStatus: "written" as const
        }
      ],
      committedThroughChapterId: "chapter_plot_one"
    };
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_plot_prompt",
      title: "雾港长篇",
      activeRoot: "plot_design",
      activeAgentId: profile.id,
      activeFileId: "file_long-book-line",
      activeFileRevision:
        "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      workspaceRevision: 3,
      projectRevision: 5,
      agentsMd: "# 长篇上下文\n\n## 剧情点阶段\n维护结构。",
      worldbuildingDirectory: {
        categories: [
          {
            categoryId: "world_rules",
            title: "世界规则",
            order: 1,
            format: "text"
          },
          {
            categoryId: "world_factions",
            title: "势力",
            order: 2,
            format: "list",
            itemCount: 1,
            items: [
              {
                itemId: "worlditem_watchers",
                title: "守夜人",
                order: 1
              }
            ],
            omittedItemCount: 0
          }
        ],
        omittedCategoryCount: 0
      },
      navigation,
      plotFocus: {
        section: "plot_point",
        volumeId: "volume_plot_a",
        volumeTitle: "起势",
        arcId: "arc_plot_main",
        arcTitle: "主线"
      }
    };
    const input = {
      runId: "run_plot_prompt",
      sessionId: "session_plot_prompt",
      prompt: "梳理这一卷的节奏",
      longAgentProfile: profile,
      workspaceContext: { longWorkspace }
    };

    const userPrompt = buildRuntimeUserPrompt(input);
    const systemPrompt = buildEffectiveSystemPrompt("DeepWrite base", input);
    expect(systemPrompt).toContain("连续性记录只提供按章参考");
    expect(systemPrompt).toContain("不锁定章卡、故事情节或伏笔结构");
    expect(systemPrompt).toContain("删除章卡时客户端会在危险确认后级联清理");
    expect(systemPrompt).toContain("剧情点关联可为 null");
    expect(systemPrompt).toContain("非空时必须与章卡属于同一分卷");
    expect(systemPrompt).toContain("移动或删除剧情点只解除章卡的弱关联");
    expect(systemPrompt).toContain("全书故事线用 book_line");
    expect(systemPrompt).toContain("世界观与人物目录已写入本轮固定上下文");
    expect(systemPrompt).toContain("不得把设定正文或 fileId 写入本轮固定上下文");
    expect(systemPrompt).not.toContain("按稳定实体 ID 和 fileId 查询");
    expect(userPrompt).toContain(
      "全书共 2 卷、3 个剧情点、1 张章卡、2 条故事情节、0 个故事事件、1 条伏笔线"
    );
    expect(userPrompt).toContain(
      "连续性记录：1 章；最高连续记录位置为「第一章」(chapter_plot_one)"
    );
    expect(userPrompt).toContain("记录只作参考，不锁定正文或结构");
    expect(userPrompt).toContain(
      "已有正文章卡（由早到晚）：「第一章」(chapter_plot_one)"
    );
    expect(userPrompt).toContain(
      "- 第 1 卷「起势」(volume_plot_a): 「主线」(arc_plot_main)、「暗线」(arc_plot_hidden)"
    );
    expect(userPrompt).toContain(
      "- 第 2 卷「转折」(volume_plot_b): 「反击」(arc_plot_turn)"
    );
    expect(userPrompt).toContain(
      "当前剧情工作区: 剧情点「主线」(arc_plot_main)，所属分卷「起势」(volume_plot_a)"
    );
    expect(userPrompt).toContain("【世界观条目列表（发送时快照）】");
    expect(userPrompt).toContain(
      "世界规则（category_id=world_rules；类型=文本）"
    );
    expect(userPrompt).toContain(
      "守夜人（item_id=worlditem_watchers；顺序=1）"
    );
    expect(userPrompt).toContain("【人物设计列表（发送时快照）】");
    expect(userPrompt).toContain(
      "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(userPrompt).not.toContain("【当前阶段信息与要求】");
    expect(userPrompt.indexOf("【人物设计列表（发送时快照）】")).toBeLessThan(
      userPrompt.indexOf(
        "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
      )
    );
    expect(userPrompt).toContain("主角（type_id=protagonist；共 1 人）");
    expect(userPrompt).toContain(
      "林岚（character_id=character_lan；顺序=1）"
    );
    expect(userPrompt).not.toContain("session_plot_prompt");
    expect(userPrompt).not.toContain("run_plot_prompt");
    expect(userPrompt).not.toContain("当前根节点:");
    expect(userPrompt).not.toContain("当前文件:");
    expect(userPrompt).not.toContain("file_long-book-line");
    expect(userPrompt).not.toContain("当前用户所处的世界观阶段");
    expect(userPrompt).not.toContain("当前用户所处的人物阶段");

    const chapterCardPrompt = buildRuntimeUserPrompt({
      ...input,
      workspaceContext: {
        longWorkspace: {
          ...longWorkspace,
          activeChapterCardId: "chapter_plot_one",
          plotFocus: {
            section: "chapter_card",
            volumeId: "volume_plot_a",
            volumeTitle: "起势",
            chapterCardId: "chapter_plot_one",
            chapterCardTitle: "第一章"
          }
        }
      }
    });
    expect(chapterCardPrompt).toContain(
      "当前剧情工作区: 章卡「第一章」(chapter_plot_one)，所属分卷「起势」(volume_plot_a)"
    );

    const bookLinePrompt = buildRuntimeUserPrompt({
      ...input,
      workspaceContext: {
        longWorkspace: {
          ...longWorkspace,
          plotFocus: { section: "book_line" }
        }
      }
    });
    expect(bookLinePrompt).toContain("当前剧情工作区: 全书故事线");
    expect(bookLinePrompt).not.toContain("当前文件:");
    expect(bookLinePrompt).not.toContain("file_long-book-line");

    const draftProfile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "draft"
    )!;
    const draftPrompt = buildRuntimeUserPrompt({
      ...input,
      longAgentProfile: draftProfile,
      workspaceContext: {
        longWorkspace: {
          ...longWorkspace,
          activeRoot: "draft",
          activeAgentId: "draft",
          plotFocus: undefined
        }
      }
    });
    expect(draftPrompt).toContain("【世界观条目列表（发送时快照）】");
    expect(draftPrompt).toContain("【人物设计列表（发送时快照）】");
    expect(draftPrompt).toContain(
      "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(draftPrompt).toContain(
      "世界规则（category_id=world_rules；类型=文本）"
    );
    expect(draftPrompt).toContain(
      "林岚（character_id=character_lan；顺序=1）"
    );
    expect(draftPrompt).not.toContain("当前剧情工作区");
    expect(draftPrompt).not.toContain("session_plot_prompt");
    expect(draftPrompt).not.toContain("run_plot_prompt");
    expect(draftPrompt).not.toContain("当前根节点:");
    expect(draftPrompt).not.toContain("当前文件:");

    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const turnContexts: LongWorkspaceRuntimeContext[] = [
      {
        ...longWorkspace,
        plotFocus: { section: "book_line" }
      },
      {
        ...longWorkspace,
        workspaceRevision: 4,
        projectRevision: 6,
        navigation: {
          ...navigation,
          revision: 4,
          updatedAt: "2026-07-26T10:01:00.000Z"
        },
        plotFocus: {
          section: "plot_point",
          volumeId: "volume_plot_a",
          volumeTitle: "起势",
          arcId: "arc_plot_hidden",
          arcTitle: "暗线"
        }
      },
      {
        ...longWorkspace,
        workspaceRevision: 5,
        projectRevision: 7,
        activeChapterCardId: "chapter_plot_one",
        navigation: {
          ...navigation,
          revision: 5,
          updatedAt: "2026-07-26T10:02:00.000Z"
        },
        plotFocus: {
          section: "chapter_card",
          volumeId: "volume_plot_a",
          volumeTitle: "起势",
          chapterCardId: "chapter_plot_one",
          chapterCardTitle: "第一章"
        }
      }
    ];
    for (const [turnIndex, context] of turnContexts.entries()) {
      for await (const _event of runtime.start({
        runId: `run_plot_turn_${turnIndex}`,
        sessionId: "session_plot_turns",
        prompt: `剧情请求 ${turnIndex + 1}`,
        thinkingLevel: "off",
        longAgentProfile: profile,
        workspaceContext: { longWorkspace: context }
      })) {
        // Consume every turn before inspecting the cached model transcript.
      }
    }
    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { messages: Array<{ role?: string; content?: unknown }> } }
        >;
      }
    ).conversationAgents;
    const agent = cache.get(
      "session_plot_turns:long:plot_design:longbook_plot_prompt"
    );
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );
    expect(userMessages).toHaveLength(3);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "当前剧情工作区: 全书故事线"
    );
    expect(String(userMessages?.[0]?.content)).not.toContain("session_plot_turns");
    expect(String(userMessages?.[0]?.content)).not.toContain("当前文件:");
    expect(String(userMessages?.[0]?.content)).not.toContain("file_long-book-line");
    expect(String(userMessages?.[0]?.content)).toContain("【世界观条目列表（发送时快照）】");
    expect(String(userMessages?.[0]?.content)).toContain("【人物设计列表（发送时快照）】");
    expect(String(userMessages?.[1]?.content)).toContain(
      "【本轮剧情工作区上下文】"
    );
    expect(String(userMessages?.[1]?.content)).toContain(
      "【长篇结构导航（本轮发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(String(userMessages?.[1]?.content)).toContain(
      "【长篇上下文（AGENTS.md）】"
    );
    expect(String(userMessages?.[1]?.content)).not.toContain("【世界观条目列表");
    expect(String(userMessages?.[1]?.content)).not.toContain("【人物设计列表");
    expect(String(userMessages?.[1]?.content)).toContain(
      "结构版本 4；项目版本 6"
    );
    expect(String(userMessages?.[1]?.content)).toContain(
      "当前剧情工作区: 剧情点「暗线」(arc_plot_hidden)"
    );
    expect(String(userMessages?.[1]?.content)).not.toContain("当前文件:");
    expect(String(userMessages?.[1]?.content)).not.toContain("file_long-book-line");
    expect(String(userMessages?.[1]?.content)).not.toContain("当前根节点:");
    expect(String(userMessages?.[2]?.content)).toContain(
      "当前章卡: chapter_plot_one"
    );
    expect(String(userMessages?.[2]?.content)).toContain(
      "当前剧情工作区: 章卡「第一章」(chapter_plot_one)"
    );
    expect(String(userMessages?.[2]?.content)).not.toContain("当前文件:");
  });

  it("injects design directories for the chapter writer and refreshes plot navigation later", async () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "draft"
    )!;
    const navigation = {
      schemaVersion: 1 as const,
      revision: 3,
      bookId: "longbook_draft_prompt",
      updatedAt: "2026-07-26T10:00:00.000Z",
      counts: {
        worldbuildingCategories: 1,
        characters: 1,
        volumes: 1,
        arcs: 1,
        chapterCards: 1,
        storyEvents: 0,
        storyPlots: 0,
        foreshadowingThreads: 0,
        committedChapters: 0
      },
      worldbuilding: [
        {
          id: "world_rules",
          title: "世界规则",
          order: 1,
          format: "text" as const
        }
      ],
      characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
      characters: [
        {
          id: "character_lan",
          name: "林岚",
          group: "protagonist",
          order: 1
        }
      ],
      volumes: [{ id: "volume_draft_a", title: "起势", order: 1 }],
      arcs: [
        {
          id: "arc_draft_main",
          volumeId: "volume_draft_a",
          title: "主线",
          order: 1
        }
      ],
      chapterCards: [
        {
          id: "chapter_draft_one",
          volumeId: "volume_draft_a",
          primaryArcId: "arc_draft_main",
          title: "第一章",
          narrativeOrder: 1,
          bodyStatus: "empty" as const
        }
      ],
      committedThroughChapterId: null
    };
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_draft_prompt",
      title: "雾港长篇",
      activeRoot: "draft",
      activeAgentId: profile.id,
      activeChapterCardId: "chapter_draft_one",
      workspaceRevision: 3,
      projectRevision: 5,
      agentsMd: "# 长篇上下文\n\n## 正文阶段\n按章写作。",
      worldbuildingDirectory: {
        categories: [
          {
            categoryId: "world_rules",
            title: "世界规则",
            order: 1,
            format: "text"
          }
        ],
        omittedCategoryCount: 0
      },
      navigation
    };
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    for (const [turnIndex, context] of [
      longWorkspace,
      {
        ...longWorkspace,
        workspaceRevision: 4,
        projectRevision: 6,
        navigation: {
          ...navigation,
          revision: 4,
          updatedAt: "2026-07-26T10:01:00.000Z"
        }
      }
    ].entries()) {
      for await (const _event of runtime.start({
        runId: `run_draft_turn_${turnIndex}`,
        sessionId: "session_draft_turns",
        prompt: `写手请求 ${turnIndex + 1}`,
        thinkingLevel: "off",
        longAgentProfile: profile,
        workspaceContext: { longWorkspace: context }
      })) {
        // Consume every turn before inspecting the cached model transcript.
      }
    }
    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { messages: Array<{ role?: string; content?: unknown }> } }
        >;
      }
    ).conversationAgents;
    const agent = cache.get(
      "session_draft_turns:long:draft:longbook_draft_prompt"
    );
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );
    expect(userMessages).toHaveLength(2);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "【世界观条目列表（发送时快照）】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "【人物设计列表（发送时快照）】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(String(userMessages?.[1]?.content)).toContain(
      "【本轮写手工作区上下文】"
    );
    expect(String(userMessages?.[1]?.content)).toContain(
      "【长篇结构导航（本轮发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(String(userMessages?.[1]?.content)).toContain(
      "结构版本 4；项目版本 6"
    );
    expect(String(userMessages?.[1]?.content)).toContain(
      "当前章卡: chapter_draft_one"
    );
    expect(String(userMessages?.[1]?.content)).not.toContain("【世界观条目列表");
    expect(String(userMessages?.[1]?.content)).not.toContain("【人物设计列表");
    expect(String(userMessages?.[1]?.content)).not.toContain("当前剧情工作区");
  });

  it("injects AGENTS.md into every long agent and later plot-design turns", () => {
    const agentsMd = "# 长篇上下文\n\n## 世界观阶段\n维护设定。";
    const navigation = {
      schemaVersion: 1 as const,
      revision: 3,
      bookId: "longbook_agents_md",
      updatedAt: "2026-07-26T10:00:00.000Z",
      counts: {
        worldbuildingCategories: 0,
        characters: 0,
        volumes: 1,
        arcs: 0,
        chapterCards: 0,
        storyEvents: 0,
        storyPlots: 0,
        foreshadowingThreads: 0,
        committedChapters: 0
      },
      worldbuilding: [],
      characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
      characters: [],
      volumes: [{ id: "volume_agents", title: "第一卷", order: 1 }],
      arcs: [],
      chapterCards: [],
      committedThroughChapterId: null
    };

    for (const profile of DEFAULT_LONG_AGENT_PROFILES) {
      const root =
        profile.id === "setting"
          ? "worldbuilding"
          : profile.id === "plot_design"
            ? "plot_design"
            : profile.id === "draft"
              ? "draft"
              : "continuity_ledger";
      const prompt = buildRuntimeUserPrompt({
        runId: `run_${profile.id}`,
        sessionId: `session_${profile.id}`,
        prompt: "继续",
        longAgentProfile: profile,
        workspaceContext: {
          longWorkspace: {
            bookId: "longbook_agents_md",
            title: "雾港长篇",
            activeRoot: root,
            activeAgentId: profile.id,
            workspaceRevision: 3,
            projectRevision: 5,
            navigation,
            agentsMd
          }
        }
      });
      expect(prompt).toContain("【长篇上下文（AGENTS.md）】");
      expect(prompt).toContain("## 世界观阶段");
    }

    const emptyPrompt = buildRuntimeUserPrompt({
      runId: "run_empty_agents",
      sessionId: "session_empty_agents",
      prompt: "继续",
      longAgentProfile: DEFAULT_LONG_AGENT_PROFILES.find(
        ({ id }) => id === "draft"
      )!,
      workspaceContext: {
        longWorkspace: {
          bookId: "longbook_agents_md",
          title: "雾港长篇",
          activeRoot: "draft",
          activeAgentId: "draft",
          workspaceRevision: 3,
          projectRevision: 5,
          navigation,
          agentsMd: "   "
        }
      }
    });
    expect(emptyPrompt).not.toContain("【长篇上下文（AGENTS.md）】");
  });

  it("lets configured long-form teams delegate with the same bounded tools", async () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "plot_design"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_subagents",
      title: "雾港长篇",
      activeRoot: "plot_design",
      activeAgentId: profile.id,
      workspaceRevision: 3,
      projectRevision: 5,
      navigation: {
        schemaVersion: 1,
        revision: 3,
        bookId: "longbook_subagents",
        updatedAt: "2026-07-26T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 0,
          characters: 0,
          volumes: 1,
          arcs: 0,
          chapterCards: 0,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [],
        characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
        characters: [],
        volumes: [{ id: "volume_subagents", title: "第一卷", order: 1 }],
        arcs: [],
        chapterCards: [],
        committedThroughChapterId: null
      }
    };
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    for await (const _event of runtime.start({
      runId: "run_long_subagents",
      sessionId: "session_long_subagents",
      prompt: "委派检查时间线",
      thinkingLevel: "off",
      longAgentProfile: profile,
      subagentDefinitions: [
        {
          id: "timeline_reviewer",
          name: "时间线审阅",
          description: "核对事件顺序与叙事落点。",
          systemPrompt: "只检查时间线并把结论交还主智能体。",
          enabled: true,
          modelMode: "inherit"
        }
      ],
      workspaceContext: { longWorkspace }
    })) {
      // Consume the local run before inspecting the cached parent agent.
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { tools: Array<{ name: string }> } }
        >;
      }
    ).conversationAgents;
    const names =
      cache.get(
        "session_long_subagents:long:plot_design:longbook_subagents"
      )?.state.tools.map(({ name }) => name) ?? [];
    expect(names).toContain("spawn_subagent");
    expect(names).toContain("list_plot_design");
    expect(names).toContain("read_plot_design");
    expect(names).not.toContain("get_long_workspace_index");
    expect(names).toContain("propose_long_mutation");
  });

  it("keeps model reasoning capability separate from the per-run thinking switch", () => {
    const config: AgentProviderRuntimeConfig = {
      id: "writer",
      label: "Writer",
      provider: "custom",
      modelId: "writer-model",
      api: "openai-completions",
      baseUrl: "https://ollama.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["low", "high"],
      temperatureOptions: [0.2, 0.6, 1.2],
      apiKey: ""
    };

    expect(buildProviderRuntime(config, undefined, "high").model.reasoning).toBe(true);
    expect(buildProviderRuntime(config, 0.6, "off").model.reasoning).toBe(true);
    expect(
      buildProviderRuntime({ ...config, reasoning: true }, 0.6, "off").model.reasoning
    ).toBe(true);

    const knownNonReasoningConfig: AgentProviderRuntimeConfig = {
      ...config,
      id: "gpt-5-chat-latest",
      label: "GPT-5 Chat",
      provider: "openai",
      modelId: "gpt-5-chat-latest",
      api: "openai-responses",
      baseUrl: "https://api.openai.com.example.test/v1"
    };
    expect(
      buildProviderRuntime(knownNonReasoningConfig, 0.6, "off").model.reasoning
    ).toBe(false);
  });

  it("uses the GPT-5.6 Sol capacity baseline when no model catalog matches", () => {
    const config: AgentProviderRuntimeConfig = {
      id: "unknown-writer",
      label: "Unknown writer",
      provider: "custom",
      modelId: "unknown-writer-model",
      api: "openai-completions",
      baseUrl: "https://example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["low", "medium", "high"],
      temperatureOptions: [0.2, 0.7, 1.2],
      apiKey: "test-only"
    };

    expect(buildProviderRuntime(config).model).toMatchObject({
      contextWindow: 272_000,
      maxTokens: 128_000
    });
  });

  it.each(["openai-completions", "openai-responses"] as const)(
    "normalizes object-union tool roots before an %s request",
    async (api) => {
      const config: AgentProviderRuntimeConfig = {
        id: `schema-${api}`,
        label: `Schema ${api}`,
        provider: "custom",
        modelId: "schema-test-model",
        api,
        baseUrl: "https://schema.example.test/v1",
        reasoning: false,
        defaultThinkingLevel: "off",
        thinkingLevelOptions: ["off"],
        temperatureOptions: [0.2, 0.7, 1.2],
        apiKey: "test-only"
      };
      const parameters = Type.Union([
        Type.Object({ domain: Type.Literal("worldbuilding") }),
        Type.Object({ domain: Type.Literal("character") })
      ]);
      const payload = await captureToolPayload(
        config,
        toolWithParameters("list_setting_regression", parameters)
      );
      const providerSchema =
        api === "openai-completions"
          ? (
              payload.tools as Array<{
                function: { parameters: Record<string, unknown> };
              }>
            )[0]!.function.parameters
          : (
              payload.tools as Array<{
                parameters: Record<string, unknown>;
              }>
            )[0]!.parameters;

      expect(providerSchema).toMatchObject({
        type: "object",
        anyOf: expect.any(Array)
      });
      expect(parameters).not.toHaveProperty("type");
    }
  );

  it("rejects a non-object tool root before sending a provider request", async () => {
    const config: AgentProviderRuntimeConfig = {
      id: "invalid-schema",
      label: "Invalid schema",
      provider: "custom",
      modelId: "schema-test-model",
      api: "openai-completions",
      baseUrl: "https://schema.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["off"],
      temperatureOptions: [0.2, 0.7, 1.2],
      apiKey: "test-only"
    };

    await expect(
      captureToolPayload(
        config,
        toolWithParameters("invalid_text_tool", Type.String())
      )
    ).rejects.toThrow(/invalid_text_tool.*type: "object"/u);
  });

  it("sanitizes only Ollama transport schemas without weakening local validation", async () => {
    const baseConfig: AgentProviderRuntimeConfig = {
      id: "local-writer",
      label: "Local writer",
      provider: "ollama",
      modelId: "qwen3",
      api: "openai-completions",
      baseUrl: "https://ollama.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["low", "medium", "high"],
      temperatureOptions: [0.2, 0.7, 1.2],
      apiKey: ""
    };
    const tool = ollamaGrammarRegressionTool();
    const ollamaPayload = await captureToolPayload(baseConfig, tool);
    const ollamaParameters = (
      ollamaPayload.tools as Array<{
        function: { parameters: Record<string, unknown> };
      }>
    )[0]!.function.parameters;

    expect(ollamaParameters).toMatchObject({
      properties: {
        direct_text: { type: "string", maxLength: 200_000 },
        replacements: {
          items: {
            properties: {
              original_text: { type: "string", minLength: 1 },
              new_text: { type: "string" }
            }
          }
        }
      }
    });
    const ollamaNested = (
      (ollamaParameters.properties as Record<string, unknown>).replacements as {
        items: { properties: Record<string, Record<string, unknown>> };
      }
    ).items.properties;
    expect(ollamaNested.original_text).not.toHaveProperty("maxLength");
    expect(ollamaNested.new_text).not.toHaveProperty("maxLength");

    const originalParameters = tool.parameters as unknown as {
      properties: Record<string, unknown>;
    };
    const originalNested = (
      originalParameters.properties.replacements as {
        items: { properties: Record<string, Record<string, unknown>> };
      }
    ).items.properties;
    expect(originalNested.original_text).toHaveProperty("maxLength", 2_400);
    expect(originalNested.new_text).toHaveProperty("maxLength", 20_000);

    const customPayload = await captureToolPayload(
      { ...baseConfig, provider: "custom", apiKey: "test-only" },
      tool
    );
    const customParameters = (
      customPayload.tools as Array<{
        function: { parameters: Record<string, unknown> };
      }>
    )[0]!.function.parameters;
    const customNested = (
      (customParameters.properties as Record<string, unknown>).replacements as {
        items: { properties: Record<string, Record<string, unknown>> };
      }
    ).items.properties;
    expect(customNested.original_text).toHaveProperty("maxLength", 2_400);
    expect(customNested.new_text).toHaveProperty("maxLength", 20_000);
  });

  it("uses a provider routing id without replacing the public model id", async () => {
    const config: AgentProviderRuntimeConfig = {
      id: "routed-model",
      label: "Routed model",
      provider: "custom",
      modelId: "public-model-id",
      requestModelId: "provider-route-id",
      api: "openai-completions",
      baseUrl: "https://example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
      temperatureOptions: [0.1, 0.7, 1],
      apiKey: "test-only"
    };

    const runtime = buildProviderRuntime(config, 0.7, "off");
    expect(runtime.model.id).toBe("provider-route-id");
    expect(new PiAgentRuntimeAdapter().describe(config)).toMatchObject({
      model: "public-model-id",
      configId: config.id
    });
    await expect(captureDisabledThinkingPayload(config)).resolves.toMatchObject({
      model: "provider-route-id"
    });
  });

  it("uses the system role when an official-compatible endpoint disables developer messages", async () => {
    const config: AgentProviderRuntimeConfig = {
      id: "deepwrite-deepseek-v4-flash",
      label: "Official DeepSeek Flash",
      provider: "deepseek-official",
      modelId: "deepseek-v4-flash-202605",
      api: "openai-completions",
      baseUrl: "https://tokenhub.tencentmaas.com.example.test/v1",
      reasoning: true,
      supportsDeveloperRole: false,
      defaultThinkingLevel: "high",
      thinkingLevelOptions: ["low", "high", "max"],
      temperatureOptions: [0.7, 1, 1.5],
      managedBy: "deepwrite-official",
      apiKey: "test-only"
    };

    const payload = await captureDisabledThinkingPayload(config);
    expect(payload.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      expect.objectContaining({ role: "user" })
    ]);
    expect(buildProviderRuntime(config).model.compat).toMatchObject({
      supportsDeveloperRole: false
    });
  });

  it("uses the system role for ModelHub routes by default", async () => {
    const config: AgentProviderRuntimeConfig = {
      id: "modelhub-qwen3-8-max",
      label: "Qwen 3.8 Max",
      provider: "modelhub",
      modelId: "qwen3.8-max",
      api: "openai-completions",
      baseUrl: "http://127.0.0.1:11435/v1",
      reasoning: true,
      defaultThinkingLevel: "medium",
      thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
      temperatureOptions: [0.1, 0.7, 1],
      apiKey: "test-only"
    };

    const payload = await captureDisabledThinkingPayload(config);
    expect(payload.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      expect.objectContaining({ role: "user" })
    ]);
    expect(buildProviderRuntime(config).model.compat).toMatchObject({
      supportsDeveloperRole: false
    });
  });

  it("uses the DeepWrite Kimi K3 runtime catalog for an official gateway route", async () => {
    const config: AgentProviderRuntimeConfig = {
      id: "deepwrite-kimi-k3",
      label: "Kimi K3",
      provider: "deepseek-official",
      modelId: "kimi-k3",
      api: "openai-completions",
      baseUrl: "https://www.moxing.pro.example.test/v1",
      reasoning: true,
      supportsDeveloperRole: false,
      defaultThinkingLevel: "high",
      thinkingLevelOptions: ["low", "high", "max"],
      temperatureOptions: [0.7, 1, 1.5],
      managedBy: "deepwrite-official",
      apiKey: "test-only"
    };

    const high = buildProviderRuntime(config, undefined, "high").model;
    expect(high).toMatchObject({
      id: "kimi-k3",
      provider: "deepseek-official",
      baseUrl: "https://www.moxing.pro.example.test/v1",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 1_048_576,
      maxTokens: 131_072,
      thinkingLevelMap: {
        off: null,
        low: "low",
        high: "high",
        xhigh: "max"
      },
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: true,
        maxTokensField: "max_completion_tokens",
        requiresReasoningContentOnAssistantMessages: true,
        thinkingFormat: "openai",
        supportsStrictMode: true
      }
    });

    expect(buildProviderRuntime(config, undefined, "max").model.thinkingLevelMap)
      .toMatchObject({ xhigh: "max" });
    await expect(captureThinkingPayload(config, "high")).resolves.toMatchObject({
      model: "kimi-k3",
      reasoning_effort: "high"
    });
    await expect(captureThinkingPayload(config, "max")).resolves.toMatchObject({
      model: "kimi-k3",
      reasoning_effort: "max"
    });
  });

  it("uses the production DeepSeek V4 Flash metadata for the 0731 gateway route", () => {
    const config: AgentProviderRuntimeConfig = {
      id: "deepwrite-deepseek-v4-flash-0731",
      label: "DeepSeek-V4-Flash-正式版",
      provider: "deepseek-official",
      modelId: "deepseek-v4-flash-0731",
      api: "openai-completions",
      baseUrl: "https://www.moxing.pro.example.test/v1/",
      reasoning: true,
      supportsDeveloperRole: true,
      defaultThinkingLevel: "high",
      thinkingLevelOptions: ["low", "high", "max"],
      temperatureOptions: [0.7, 1, 1.5],
      managedBy: "deepwrite-official",
      apiKey: "test-only"
    };

    expect(buildProviderRuntime(config, undefined, "max").model).toMatchObject({
      id: "deepseek-v4-flash-0731",
      provider: "deepseek-official",
      baseUrl: "https://www.moxing.pro.example.test/v1/",
      contextWindow: 1_000_000,
      maxTokens: 384_000,
      input: ["text"],
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: "high",
        xhigh: "max"
      },
      compat: {
        supportsStore: false,
        supportsDeveloperRole: true,
        requiresReasoningContentOnAssistantMessages: true,
        thinkingFormat: "deepseek"
      }
    });
  });

  it.each([
    ["deepseek-v4-pro", "DeepSeek V4 Pro"],
    ["deepseek-v4-flash", "DeepSeek V4 Flash"]
  ] as const)(
    "uses the DeepWrite %s runtime catalog for an official gateway route",
    (modelId, label) => {
      const config: AgentProviderRuntimeConfig = {
        id: `deepwrite-${modelId}`,
        label,
        provider: "deepseek-official",
        modelId,
        api: "openai-completions",
        baseUrl: "https://example.test/v1",
        reasoning: true,
        supportsDeveloperRole: false,
        defaultThinkingLevel: "high",
        thinkingLevelOptions: ["low", "high", "max"],
        temperatureOptions: [0.7, 1, 1.5],
        managedBy: "deepwrite-official",
        apiKey: "test-only"
      };

      expect(buildProviderRuntime(config, undefined, "max").model).toMatchObject({
        id: modelId,
        provider: "deepseek-official",
        baseUrl: "https://example.test/v1",
        contextWindow: 1_000_000,
        maxTokens: 384_000,
        input: ["text"],
        thinkingLevelMap: {
          minimal: null,
          low: "high",
          medium: "high",
          high: "high",
          xhigh: "max"
        },
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: true,
          maxTokensField: "max_tokens",
          requiresReasoningContentOnAssistantMessages: true,
          thinkingFormat: "deepseek",
          supportsStrictMode: true
        }
      });
    }
  );

  it.each([
    ["glm-5.3", "GLM-5.3", 1_000_000, 131_072, "zai"],
    ["glm-5.2", "GLM-5.2", 1_000_000, 131_072, "zai"],
    ["qwen3.7-plus", "Qwen3.7 Plus", 1_000_000, 131_072, "openai"]
  ] as const)(
    "uses the DeepWrite %s runtime catalog for an official gateway route",
    (modelId, label, contextWindow, maxTokens, thinkingFormat) => {
      const config: AgentProviderRuntimeConfig = {
        id: `deepwrite-${modelId}`,
        label,
        provider: "deepseek-official",
        modelId,
        api: "openai-completions",
        baseUrl: "https://example.test/v1",
        reasoning: true,
        supportsDeveloperRole: false,
        defaultThinkingLevel: "high",
        thinkingLevelOptions: ["low", "high", "max"],
        temperatureOptions: [0.7, 1, 1.5],
        managedBy: "deepwrite-official",
        apiKey: "test-only"
      };

      expect(buildProviderRuntime(config, undefined, "max").model).toMatchObject({
        id: modelId,
        provider: "deepseek-official",
        baseUrl: "https://example.test/v1",
        contextWindow,
        maxTokens,
        thinkingLevelMap: {
          low: expect.anything(),
          high: expect.anything(),
          xhigh: expect.anything()
        },
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: true,
          maxTokensField: "max_completion_tokens",
          requiresReasoningContentOnAssistantMessages: true,
          thinkingFormat,
          supportsStrictMode: true
        }
      });
    }
  );

  it("keeps GLM-5.3 thinking enabled and maps all supported effort levels", async () => {
    const config: AgentProviderRuntimeConfig = {
      id: "deepwrite-glm-5.3",
      label: "GLM-5.3",
      provider: "deepseek-official",
      modelId: "glm-5.3",
      api: "openai-completions",
      baseUrl: "https://example.test/v1",
      reasoning: true,
      supportsDeveloperRole: false,
      defaultThinkingLevel: "max",
      thinkingLevelOptions: ["low", "high", "max"],
      temperatureOptions: [0.7, 1, 1.5],
      managedBy: "deepwrite-official",
      apiKey: "test-only"
    };

    expect(buildProviderRuntime(config, undefined, "max").model).toMatchObject({
      id: "glm-5.3",
      input: ["text"],
      contextWindow: 1_000_000,
      maxTokens: 131_072,
      thinkingLevelMap: {
        off: null,
        low: "low",
        high: "high",
        xhigh: "max"
      },
      compat: {
        thinkingFormat: "zai",
        supportsReasoningEffort: true,
        zaiToolStream: true
      }
    });

    await expect(captureThinkingPayload(config, "low")).resolves.toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "low"
    });
    await expect(captureThinkingPayload(config, "high")).resolves.toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "high"
    });
    await expect(captureThinkingPayload(config, "max")).resolves.toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max"
    });
    const disabledPayload = await captureDisabledThinkingPayload(config);
    expect(disabledPayload).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "low"
    });
    expect(disabledPayload).not.toHaveProperty("temperature");
  });

  it.each([
    ["gpt-5.6-sol", "GPT-5.6 Sol"],
    ["gpt-5.6-terra", "GPT-5.6 Terra"],
    ["gpt-5.6-luna", "GPT-5.6 Luna"]
  ] as const)(
    "uses the DeepWrite %s runtime catalog instead of the generic fallback",
    (modelId, label) => {
      const config: AgentProviderRuntimeConfig = {
        id: `deepwrite-${modelId}`,
        label,
        provider: "openai",
        modelId,
        api: "openai-responses",
        baseUrl: "https://local-model.example.test/v1",
        reasoning: true,
        defaultThinkingLevel: "medium",
        thinkingLevelOptions: ["low", "medium", "high", "xhigh", "max"],
        temperatureOptions: [0.1, 0.7, 1.5],
        apiKey: "test-only"
      };

      expect(buildProviderRuntime(config).model).toMatchObject({
        id: modelId,
        provider: "openai",
        baseUrl: "https://local-model.example.test/v1",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 272_000,
        maxTokens: 128_000,
        thinkingLevelMap: {
          off: "none",
          minimal: null,
          xhigh: "xhigh",
          max: "max"
        }
      });
    }
  );

  it.each([
    ["qwen3.8-max", "none"],
    ["qwen3.8-max-preview", null]
  ] as const)(
    "uses the DeepWrite %s runtime catalog for an official gateway route",
    async (modelId, offMapping) => {
      const config: AgentProviderRuntimeConfig = {
        id: `deepwrite-${modelId}`,
        label: modelId === "qwen3.8-max" ? "Qwen3.8 Max" : "Qwen3.8 Max Preview",
        provider: "deepseek-official",
        modelId,
        api: "openai-completions",
        baseUrl: "https://www.moxing.pro.example.test/v1",
        reasoning: true,
        supportsDeveloperRole: false,
        defaultThinkingLevel: "high",
        thinkingLevelOptions: ["low", "high", "max"],
        temperatureOptions: [0.7, 1, 1.5],
        managedBy: "deepwrite-official",
        apiKey: "test-only"
      };

      const high = buildProviderRuntime(config, undefined, "high").model;
      expect(high).toMatchObject({
        id: modelId,
        provider: "deepseek-official",
        baseUrl: "https://www.moxing.pro.example.test/v1",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 983_616,
        maxTokens: 131_072,
        thinkingLevelMap: {
          off: offMapping,
          low: "low",
          high: "xhigh",
          xhigh: "xhigh"
        },
        compat: {
          supportsStore: false,
          supportsDeveloperRole: false,
          supportsReasoningEffort: true,
          maxTokensField: "max_completion_tokens",
          requiresReasoningContentOnAssistantMessages: true,
          thinkingFormat: "openai",
          supportsStrictMode: true
        }
      });

      await expect(captureThinkingPayload(config, "low")).resolves.toMatchObject({
        model: modelId,
        reasoning_effort: "low"
      });
      await expect(captureThinkingPayload(config, "high")).resolves.toMatchObject({
        model: modelId,
        reasoning_effort: "xhigh"
      });
      await expect(captureThinkingPayload(config, "max")).resolves.toMatchObject({
        model: modelId,
        reasoning_effort: "max"
      });
      const disabledPayload = await captureDisabledThinkingPayload(config);
      if (offMapping === null) {
        expect(disabledPayload).not.toHaveProperty("reasoning_effort");
        expect(disabledPayload).not.toHaveProperty("temperature");
      } else {
        expect(disabledPayload).toMatchObject({
          reasoning_effort: "none",
          temperature: 1
        });
      }
    }
  );

  it("serializes disabled thinking for supported provider protocols", async () => {
    const baseConfig: AgentProviderRuntimeConfig = {
      id: "writer",
      label: "Writer",
      provider: "deepseek",
      modelId: "deepseek-chat",
      api: "openai-completions",
      baseUrl: "https://api.deepseek.com.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["low", "medium", "high"],
      temperatureOptions: [0.2, 0.6, 1.2],
      apiKey: "test-key"
    };

    await expect(captureDisabledThinkingPayload(baseConfig)).resolves.toMatchObject({
      thinking: { type: "disabled" },
      temperature: 0.6
    });

    await expect(captureDisabledThinkingPayload({
      ...baseConfig,
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      api: "anthropic-messages",
      baseUrl: "https://api.anthropic.com.example.test"
    })).resolves.toMatchObject({
      thinking: { type: "disabled" },
      temperature: 0.6
    });

    await expect(captureDisabledThinkingPayload({
      ...baseConfig,
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      provider: "google",
      modelId: "gemini-2.5-flash",
      api: "google-generative-ai",
      baseUrl: "https://generativelanguage.googleapis.com.example.test/v1beta"
    })).resolves.toMatchObject({
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        temperature: 0.6
      }
    });

    await expect(captureDisabledThinkingPayload({
      ...baseConfig,
      id: "gpt-5.4",
      label: "GPT-5.4",
      provider: "openai",
      modelId: "gpt-5.4",
      api: "openai-responses",
      baseUrl: "https://api.openai.com.example.test/v1"
    })).resolves.toMatchObject({
      reasoning: { effort: "none" },
      temperature: 0.6
    });

    await expect(captureDisabledThinkingPayload({
      ...baseConfig,
      id: "qwen-plus",
      label: "Qwen Plus",
      provider: "custom",
      modelId: "qwen-plus",
      api: "openai-completions",
      baseUrl:
        "https://dashscope.aliyuncs.com.example.test/compatible-mode/v1"
    })).resolves.toMatchObject({
      enable_thinking: false,
      temperature: 0.6
    });

    await expect(captureDisabledThinkingPayload({
      ...baseConfig,
      id: "glm-4.7",
      label: "GLM-4.7",
      provider: "custom",
      modelId: "glm-4.7",
      api: "openai-completions",
      baseUrl: "https://open.bigmodel.cn.example.test/api/paas/v4"
    })).resolves.toMatchObject({
      thinking: { type: "disabled" },
      temperature: 0.6
    });
  });

  it("omits disabled-thinking controls for catalog models that cannot turn thinking off", async () => {
    const payload = await captureDisabledThinkingPayload({
      id: "gpt-5",
      label: "GPT-5",
      provider: "openai",
      modelId: "gpt-5",
      api: "openai-responses",
      baseUrl: "https://api.openai.com.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["low", "medium", "high"],
      temperatureOptions: [0.2, 0.6, 1.2],
      apiKey: "test-key"
    });

    expect(payload).not.toHaveProperty("reasoning");
    expect(payload).not.toHaveProperty("temperature");
  });

  it("preserves built-in thinking maps while carrying max and custom levels", () => {
    const builtinConfig: AgentProviderRuntimeConfig = {
      id: "deepseek-v4-flash",
      label: "DeepSeek V4 Flash",
      provider: "deepseek",
      modelId: "deepseek-v4-flash",
      api: "openai-completions",
      baseUrl: "",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
      temperatureOptions: [0.2, 0.6, 1.2],
      apiKey: ""
    };

    expect(buildProviderRuntime(builtinConfig, undefined, "low").model.thinkingLevelMap)
      .toMatchObject({ low: null, max: "max" });
    expect(buildProviderRuntime(builtinConfig, undefined, "xhigh").model.thinkingLevelMap)
      .toMatchObject({ low: null, max: "max" });
    expect(buildProviderRuntime(builtinConfig, undefined, "max").model.thinkingLevelMap)
      .toMatchObject({ low: null, max: "max", xhigh: "max" });

    const customConfig: AgentProviderRuntimeConfig = {
      ...builtinConfig,
      provider: "custom",
      modelId: "custom-writer",
      baseUrl: "https://ollama.example.test/v1",
      thinkingLevelOptions: [
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
        "ultra"
      ]
    };
    expect(buildProviderRuntime(customConfig, undefined, "xhigh").model.thinkingLevelMap)
      .toMatchObject({ xhigh: "xhigh" });
    expect(buildProviderRuntime(customConfig, undefined, "ultra").model.thinkingLevelMap)
      .toMatchObject({ xhigh: "ultra" });
  });

  it("keeps uploaded text and images as native user-message content", () => {
    const message = buildRawUserMessage({
      runId: "run_attachment",
      sessionId: "session_attachment",
      prompt: "结合附件分析场景",
      attachments: [
        {
          id: "notes",
          kind: "text",
          name: "notes.md",
          mediaType: "text/markdown",
          size: 12,
          content: "雨夜，旧站台。"
        },
        {
          id: "reference",
          kind: "image",
          name: "reference.png",
          mediaType: "image/png",
          size: 3,
          data: "AQID"
        }
      ]
    }, 123);

    expect(message.timestamp).toBe(123);
    expect(message.content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("雨夜，旧站台。")
      },
      { type: "image", data: "AQID", mimeType: "image/png" }
    ]);
  });

  it("does not silently ignore images on the local text-only runtime", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const consume = async () => {
      for await (const _event of runtime.start({
        runId: "run_image_faux",
        sessionId: "session_image_faux",
        prompt: "分析图片",
        attachments: [{
          id: "reference",
          kind: "image",
          name: "reference.png",
          mediaType: "image/png",
          size: 3,
          data: "AQID"
        }]
      })) {
        // The capability check fails before a stream is created.
      }
    };

    await expect(consume()).rejects.toThrow("Faux 不支持图片理解");
  });

  it("observes raw tool chunks while forwarding them to pi-agent-core", async () => {
    const source = createAssistantMessageEventStream();
    const observed: Array<{ type: string; turn: number }> = [];
    const intercepted = interceptToolCallStream(
      async () => source,
      (event, turn) => observed.push({ type: event.type, turn })
    );
    const message = toolCallMessage("tool_write", "write_workspace_editor");
    const forwarded = await intercepted(
      {} as Parameters<typeof intercepted>[0],
      { messages: [] },
      undefined
    );
    const received: string[] = [];
    const consume = (async () => {
      for await (const event of forwarded) received.push(event.type);
    })();

    source.push({ type: "start", partial: message });
    source.push({ type: "toolcall_start", contentIndex: 0, partial: message });
    source.push({
      type: "toolcall_delta",
      contentIndex: 0,
      delta: '{"text":"第一段',
      partial: message
    });
    source.push({
      type: "toolcall_end",
      contentIndex: 0,
      toolCall: message.content[0] as Extract<AssistantMessage["content"][number], { type: "toolCall" }>,
      partial: message
    });
    source.push({ type: "done", reason: "toolUse", message });
    await consume;

    expect(observed).toEqual([
      { type: "toolcall_start", turn: 0 },
      { type: "toolcall_delta", turn: 0 },
      { type: "toolcall_end", turn: 0 }
    ]);
    expect(received).toEqual([
      "start",
      "toolcall_start",
      "toolcall_delta",
      "toolcall_end",
      "done"
    ]);
  });

  it("turns an intercepted iterator rejection into a retryable error terminal", async () => {
    const partial = toolCallMessage("tool_interrupted", "write_workspace_editor");
    const source = {
      async *[Symbol.asyncIterator]() {
        yield { type: "start", partial } as const;
        throw new Error("socket hang up");
      },
      result: async () => partial
    };
    const intercepted = interceptToolCallStream(
      async () => source as unknown as ReturnType<typeof createAssistantMessageEventStream>,
      () => {}
    );
    const forwarded = await intercepted(
      {} as Parameters<typeof intercepted>[0],
      { messages: [] },
      undefined
    );
    const received: string[] = [];
    for await (const event of forwarded) received.push(event.type);

    expect(received).toEqual(["start", "error"]);
    await expect(forwarded.result()).resolves.toMatchObject({
      stopReason: "error",
      errorMessage: "socket hang up"
    });
  });

  it("assigns unique tool stream ids when content indexes repeat across model turns", () => {
    const input = {
      runId: "run_repeated_content_index",
      sessionId: "session_repeated_content_index",
      prompt: "先读取再写入"
    };
    const messageId = "run_repeated_content_index_assistant";
    const firstMessage = toolCallMessage("tool_read", "read_workspace_content");
    const secondMessage = toolCallMessage("tool_write", "write_workspace_editor");

    const first = toToolStreamRuntimeEvent(
      {
        type: "toolcall_start",
        contentIndex: 0,
        partial: firstMessage
      },
      input,
      providerRuntime,
      messageId,
      0
    );
    const second = toToolStreamRuntimeEvent(
      {
        type: "toolcall_start",
        contentIndex: 0,
        partial: secondMessage
      },
      input,
      providerRuntime,
      messageId,
      1
    );

    expect(first).toMatchObject({
      type: "agent.tool_stream",
      payload: { streamId: `${messageId}:0:0`, toolCallId: "tool_read" }
    });
    expect(second).toMatchObject({
      type: "agent.tool_stream",
      payload: { streamId: `${messageId}:1:0`, toolCallId: "tool_write" }
    });
  });

  it.each([
    "write_draft_section",
    "replace_draft_section_text"
  ])("captures an early argument snapshot for %s", (toolName) => {
    const input = {
      runId: `run_${toolName}`,
      sessionId: `session_${toolName}`,
      prompt: "写正文"
    };
    const message = toolCallMessage(`tool_${toolName}`, toolName);
    const toolCall = message.content[0] as Extract<
      AssistantMessage["content"][number],
      { type: "toolCall" }
    > & { partialJson?: string };
    toolCall.partialJson = toolName === "write_draft_section"
      ? '{"section_id":"section-1","text":"第一段'
      : '{"section_id":"section-1","replacements":[{"original_text":"旧片段';

    const event = toToolStreamRuntimeEvent(
      { type: "toolcall_start", contentIndex: 0, partial: message },
      input,
      providerRuntime,
      `${input.runId}_assistant`,
      0
    );

    expect(event.payload).toMatchObject({
      toolName,
      phase: "start",
      argumentsDelta: "",
      argumentsSnapshot: toolCall.partialJson
    });
  });

  it("reduces cumulative tool argument snapshots to non-duplicated deltas", () => {
    const first = reconcileToolCallArguments("", "", '{"text":"第一');
    const second = reconcileToolCallArguments(
      first.next,
      "段",
      '{"text":"第一段'
    );
    const completed = reconcileToolCallArguments(
      second.next,
      "",
      '{"text":"第一段正文"}'
    );

    expect(first).toEqual({ delta: '{"text":"第一', next: '{"text":"第一' });
    expect(second).toEqual({ delta: "段", next: '{"text":"第一段' });
    expect(completed).toEqual({
      delta: '正文"}',
      next: '{"text":"第一段正文"}'
    });
    expect(
      reconcileToolCallArguments(completed.next, completed.next, completed.next)
    ).toEqual({ delta: "", next: completed.next });
  });

  it("observes intermediate tool turns and provider errors for accounting", () => {
    const input = {
      runId: "run_usage_observed",
      sessionId: "session_usage_observed",
      prompt: "执行工具后继续"
    };
    const intermediate = toUsageObservedRuntimeEvent(
      toolCallMessage("tool_usage", "write_draft_section"),
      input,
      providerRuntime,
      "run_usage_observed_assistant",
      { turnId: "run_usage_observed:turn:1", attempt: 1, maxAttempts: 6 }
    );
    const failedMessage: AssistantMessage = {
      ...toolCallMessage("tool_unused", "unused"),
      content: [{ type: "text", text: "" }],
      usage: {
        input: 21,
        output: 8,
        cacheRead: 3,
        cacheWrite: 2,
        totalTokens: 34,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      },
      stopReason: "error",
      errorMessage: "connection reset"
    };
    const failed = toUsageObservedRuntimeEvent(
      failedMessage,
      input,
      providerRuntime,
      "run_usage_observed_assistant",
      { turnId: "run_usage_observed:turn:2", attempt: 2, maxAttempts: 6 }
    );

    expect(intermediate).toMatchObject({
      type: "agent.usage_observed",
      payload: {
        observationId: "run_usage_observed:turn:1:attempt:1",
        turnId: "run_usage_observed:turn:1",
        attempt: 1,
        status: "completed",
        hadToolCall: true,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        },
        runtime: providerRuntime
      }
    });
    expect(failed).toMatchObject({
      type: "agent.usage_observed",
      payload: {
        observationId: "run_usage_observed:turn:2:attempt:2",
        status: "error",
        hadToolCall: false,
        usage: {
          inputTokens: 21,
          outputTokens: 8,
          cacheReadTokens: 3,
          cacheWriteTokens: 2,
          totalTokens: 34
        }
      }
    });
  });

  it("streams thinking and text through pi-agent-core without an API key", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of runtime.start({
      runId: "run_1",
      sessionId: "session_1",
      prompt: "续写当前章节",
      thinkingLevel: "medium",
      workspaceContext: {
        activeResource: {
          id: "chapter_3",
          domain: "creation",
          title: "第三章 雨夜回声",
          path: ["雾港来信", "第三章 雨夜回声"],
          format: "正文",
          source: "live-editor",
          content: "雨是在午夜以后落下来的。"
        }
      }
    })) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<AgentRuntimeEvent, { type: "agent.delta" }> => event.type === "agent.delta")
      .map((event) => event.payload.delta)
      .join("");
    const thinking = events.filter((event) => event.type === "agent.thinking_delta");
    const completed = events.find((event) => event.type === "agent.completed");
    const usageObserved = events.filter(
      (event): event is Extract<AgentRuntimeEvent, { type: "agent.usage_observed" }> =>
        event.type === "agent.usage_observed"
    );

    expect(thinking.length).toBeGreaterThan(0);
    expect(deltas).toBe(completed?.payload.content);
    expect(completed?.payload.content).toContain("第三章 雨夜回声");
    expect(completed?.payload.runtime.mode).toBe("local-faux");
    expect(usageObserved).toHaveLength(1);
    expect(usageObserved[0]).toMatchObject({
      payload: {
        status: "completed",
        hadToolCall: false,
        turnId: "run_1:turn:1",
        attempt: 1
      }
    });
    expect(usageObserved[0]?.payload.usage).toEqual(completed?.payload.usage);
    expect(events.some((event) => event.type === "agent.evaluation_snapshot")).toBe(
      false
    );
    expect(events.filter((event) => event.type === "agent.turn_started"))
      .toEqual([
        expect.objectContaining({
          runId: "run_1",
          sessionId: "session_1",
          payload: expect.objectContaining({ attempt: 1, maxAttempts: 6 })
        })
      ]);
    expect(events.filter((event) => event.type === "agent.completed" || event.type === "agent.error")).toHaveLength(1);
    expect(events.every((event) => event.runId === "run_1" && event.sessionId === "session_1")).toBe(true);
  });

  it("emits one error terminal when the run stays idle", async () => {
    const runtime = new PiAgentRuntimeAdapter({ idleTimeoutMs: 1, tokensPerSecond: 0.01 });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of runtime.start({
      runId: "run_timeout",
      sessionId: "session_timeout",
      prompt: "验证超时"
    })) {
      events.push(event);
    }

    expect(events.filter((event) => event.type === "agent.error")).toHaveLength(1);
    expect(events.some((event) => event.type === "agent.completed")).toBe(false);
  });

  it("keeps a run alive while streamed events continue", async () => {
    const runtime = new PiAgentRuntimeAdapter({ idleTimeoutMs: 100, tokensPerSecond: 200 });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of runtime.start({
      runId: "run_active_stream",
      sessionId: "session_active_stream",
      prompt: "验证持续流式事件",
      thinkingLevel: "off"
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "agent.error")).toBe(false);
    expect(events.filter((event) => event.type === "agent.completed")).toHaveLength(1);
  });

  it("does not emit thinking when thinking is disabled", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of runtime.start({
      runId: "run_no_thinking",
      sessionId: "session_no_thinking",
      prompt: "只验证回复流",
      thinkingLevel: "off"
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "agent.thinking_delta")).toBe(false);
    expect(events.filter((event) => event.type === "agent.completed")).toHaveLength(1);
  });

  it("permanently injects context only into the first user message", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });

    for (const [index, prompt] of ["先检查人物", "再检查剧情"].entries()) {
      for await (const _event of runtime.start({
        runId: `run_history_${index}`,
        sessionId: "session_history",
        prompt,
        thinkingLevel: "off",
        workspaceContext: {
          activeResource: {
            id: "chapter_history",
            domain: "creation",
            title: "历史测试",
            path: ["历史测试"],
            source: "live-editor",
            content: `第 ${index + 1} 轮快照`
          }
        }
      })) {
        // Consume the complete run before inspecting the cached transcript.
      }
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { messages: Array<{ role?: string; content?: unknown }> } }
        >;
      }
    ).conversationAgents;
    const agent = cache.get("session_history:default");
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );

    expect(userMessages).toHaveLength(2);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "实时内容:\n第 1 轮快照"
    );
    expect(String(userMessages?.[0]?.content)).toContain("先检查人物");
    expect(userMessages?.[1]?.content).toBe("再检查剧情");
    expect(String(userMessages?.[0]?.content)).not.toContain("run_history_1");
  });

  it("uses the same permanent-context transcript for creative workspace agents", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    const scriptWorkspace = screenplayWorkspace();
    const profile = scriptAgentProfile();

    for (const [index, prompt] of ["先规划第一集", "继续细化开场"].entries()) {
      for await (const _event of runtime.start({
        runId: `run_script_history_${index}`,
        sessionId: "session_script_history",
        prompt,
        thinkingLevel: "off",
        scriptAgentProfile: profile,
        workspaceContext: { scriptWorkspace }
      })) {
        // Consume both turns before inspecting the script-agent transcript.
      }
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { messages: Array<{ role?: string; content?: unknown }> } }
        >;
      }
    ).conversationAgents;
    const agent = cache.get(
      "session_script_history:script:expert_draft_coordinator"
    );
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );

    expect(userMessages).toHaveLength(2);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "剧本作品: 《雾港剧本》"
    );
    expect(String(userMessages?.[0]?.content)).toContain("先规划第一集");
    expect(userMessages?.[1]?.content).toBe("继续细化开场");

    const shortProfile = DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.find(
      ({ id }) => id === "expert_draft_coordinator"
    )!;
    const shortWorkspace = {
      ...(scriptWorkspace as unknown as ShortWorkspaceSnapshot),
      id: "short-history",
      title: "雾港短篇",
      activeAgentId: "expert_draft_coordinator" as const
    };
    for (const [index, prompt] of ["先规划第一节", "继续细化冲突"].entries()) {
      for await (const _event of runtime.start({
        runId: `run_short_history_${index}`,
        sessionId: "session_short_history",
        prompt,
        thinkingLevel: "off",
        agentProfile: shortProfile,
        workspaceContext: { shortWorkspace }
      })) {
        // Consume both turns before inspecting the short-agent transcript.
      }
    }
    const shortAgent = cache.get(
      "session_short_history:expert_draft_coordinator"
    );
    const shortUserMessages = shortAgent?.state.messages.filter(
      (message) => message.role === "user"
    );
    expect(shortUserMessages).toHaveLength(2);
    expect(String(shortUserMessages?.[0]?.content)).toContain(
      "短篇作品: 《雾港短篇》"
    );
    expect(shortUserMessages?.[1]?.content).toBe("继续细化冲突");
  });

  it("permanently injects worldbuilding context only into the first user message", async () => {
    const profile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "setting"
    )!;
    const longWorkspace: LongWorkspaceRuntimeContext = {
      bookId: "longbook_world_history",
      title: "雾港长篇",
      activeRoot: "worldbuilding",
      activeAgentId: profile.id,
      activeFileId: "file_faction_watch:content",
      activeFileRevision: "v1:3:1234abcd",
      workspaceRevision: 3,
      projectRevision: 5,
      worldbuildingDirectory: {
        categories: [
          {
            categoryId: "world_factions",
            title: "势力",
            order: 1,
            format: "list",
            itemCount: 1,
            items: [
              {
                itemId: "worlditem_watchers",
                title: "守夜人",
                order: 1
              }
            ],
            omittedItemCount: 0
          }
        ],
        omittedCategoryCount: 0
      },
      worldbuildingFocus: {
        categoryTitle: "势力",
        format: "list",
        currentStage: {
          kind: "item",
          title: "守夜人",
          text: { content: "守夜人负责执行宵禁。" }
        },
        overview: { content: "各势力争夺港务权。" }
      },
      navigation: {
        schemaVersion: 1,
        revision: 3,
        bookId: "longbook_world_history",
        updatedAt: "2026-07-30T10:00:00.000Z",
        counts: {
          worldbuildingCategories: 0,
          characters: 0,
          volumes: 1,
          arcs: 0,
          chapterCards: 0,
          storyEvents: 0,
          storyPlots: 0,
          foreshadowingThreads: 0,
          committedChapters: 0
        },
        worldbuilding: [],
        characterTypes: [{ id: "protagonist", title: "主角", order: 1 }],
        characters: [],
        volumes: [{ id: "volume_world_history", title: "第一卷", order: 1 }],
        arcs: [],
        chapterCards: [],
        committedThroughChapterId: null
      }
    };
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });

    for (const [index, prompt] of ["先检查世界规则", "再补充力量体系"].entries()) {
      for await (const _event of runtime.start({
        runId: `run_world_history_${index}`,
        sessionId: "session_world_history",
        prompt,
        thinkingLevel: "off",
        longAgentProfile: profile,
        workspaceContext: { longWorkspace }
      })) {
        // Consume both turns before inspecting the cache-stable transcript.
      }
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { messages: Array<{ role?: string; content?: unknown }> } }
        >;
      }
    ).conversationAgents;
    const agent = cache.get(
      "session_world_history:long:setting:longbook_world_history"
    );
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );

    expect(userMessages).toHaveLength(2);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "长篇作品: 《雾港长篇》"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "势力（category_id=world_factions；类型=条目列表；共 1 项）"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "守夜人（item_id=worlditem_watchers；顺序=1）"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "当前用户所处的世界观阶段: 列表型分类「势力」 / 条目「守夜人」（category_id=world_factions；item_id=worlditem_watchers）"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "当前阶段简要信息: 仅定位当前页面，正文未注入"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "【当前阶段信息与要求】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "【长篇结构导航（发送时快照；条目正文与最新修订请通过工具读取）】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "全书共 1 卷、0 个剧情点、0 张章卡、0 条故事情节、0 个故事事件、0 条伏笔线"
    );
    expect(String(userMessages?.[0]?.content)).not.toContain("当前剧情工作区");
    expect(String(userMessages?.[0]?.content)).not.toContain(
      "各势力争夺港务权。"
    );
    expect(String(userMessages?.[0]?.content)).not.toContain(
      "守夜人负责执行宵禁。"
    );
    expect(String(userMessages?.[0]?.content)).toContain("先检查世界规则");
    expect(userMessages?.[1]?.content).toBe("再补充力量体系");
  });

  it("assembles only the active library tools and keeps entry bodies out of the prompt", async () => {
    const profile = DEFAULT_LIBRARY_AGENT_PROFILES.find(
      ({ domain }) => domain === "material"
    )!;
    const entryBody = "DO_NOT_INLINE_LIBRARY_BODY_7d9d";
    const input = {
      runId: "run_library",
      sessionId: "session_library",
      prompt: "整理这个素材库",
      thinkingLevel: "off" as const,
      libraryAgentProfile: profile,
      workspaceContext: {
        activeResource: {
          id: "material-document-1",
          domain: "material" as const,
          title: "雨夜人物",
          path: ["人物素材", "雨夜人物"],
          source: "live-editor" as const,
          content: entryBody
        },
        libraryWorkspace: {
          domain: "material" as const,
          libraryId: "material-library-1",
          title: "人物素材",
          libraryType: "short" as const,
          kind: "character" as const,
          overviewDocumentId: "material-overview-1",
          overview: "仅用于都市悬疑人物",
          overviewRevision: createShortWorkspaceContentRevision(
            "仅用于都市悬疑人物"
          ),
          readOnly: false,
          activeEntryId: "material-entry-1",
          projectRevision: 2,
          entries: [
            {
              id: "material-entry-1",
              documentId: "material-document-1",
              stageId: "character" as const,
              title: "雨夜人物",
              content: entryBody,
              revision: createShortWorkspaceContentRevision(entryBody),
              readOnly: false
            }
          ]
        }
      }
    };

    const prompt = buildRuntimeUserPrompt(input);
    expect(prompt).toContain("雨夜人物 (material-entry-1)");
    expect(prompt).toContain("仅用于都市悬疑人物");
    expect(prompt).not.toContain(entryBody);

    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });
    for await (const _event of runtime.start(input)) {
      // Consume the local run before inspecting its domain-scoped agent.
    }
    for await (const _event of runtime.start({
      ...input,
      runId: "run_library_followup",
      prompt: "继续整理人物关系"
    })) {
      // Consume the follow-up turn to verify the stable library prefix.
    }
    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          {
            state: {
              tools: Array<{ name: string }>;
              systemPrompt: string;
              messages: Array<{ role?: string; content?: unknown }>;
            };
          }
        >;
      }
    ).conversationAgents;
    const agent = cache.get(
      "session_library:library:material:material-library-1"
    );
    expect(agent?.state.tools.map(({ name }) => name)).toEqual([
      "list_material_entries",
      "read_material_entry",
      "search_material_entries",
      "load_skill",
      "create_material_entry",
      "edit_material_entry",
      "edit_material_library_overview"
    ]);
    expect(agent?.state.systemPrompt).toContain("素材库管理智能体");
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );
    expect(userMessages).toHaveLength(2);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "当前资料库: 《人物素材》"
    );
    expect(userMessages?.[1]?.content).toBe("继续整理人物关系");
  });

  it("uses the same permanent-context transcript for skill-library agents", async () => {
    const profile = DEFAULT_LIBRARY_AGENT_PROFILES.find(
      ({ domain }) => domain === "skill"
    )!;
    const libraryWorkspace = {
      domain: "skill" as const,
      libraryId: "skill-library-history",
      title: "悬疑写作技能",
      libraryType: "short" as const,
      kind: "general" as const,
      overviewDocumentId: "skill-overview-history",
      overview: "沉淀悬疑写作检查方法",
      overviewRevision: createShortWorkspaceContentRevision(
        "沉淀悬疑写作检查方法"
      ),
      readOnly: false,
      projectRevision: 1,
      entries: []
    };
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });

    for (const [index, prompt] of ["先检查技能结构", "继续补充验收标准"].entries()) {
      for await (const _event of runtime.start({
        runId: `run_skill_library_history_${index}`,
        sessionId: "session_skill_library_history",
        prompt,
        thinkingLevel: "off",
        libraryAgentProfile: profile,
        workspaceContext: { libraryWorkspace }
      })) {
        // Consume both turns before inspecting the skill-library transcript.
      }
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { messages: Array<{ role?: string; content?: unknown }> } }
        >;
      }
    ).conversationAgents;
    const agent = cache.get(
      "session_skill_library_history:library:skill:skill-library-history"
    );
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );

    expect(userMessages).toHaveLength(2);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain(
      "当前资料库: 《悬疑写作技能》"
    );
    expect(String(userMessages?.[0]?.content)).toContain("先检查技能结构");
    expect(userMessages?.[1]?.content).toBe("继续补充验收标准");
  });

  it("injects spawn_subagent only when the active short agent has enabled definitions", async () => {
    const agentProfile = DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.find(
      ({ id }) => id === "character_design"
    )!;
    const shortWorkspace = {
      id: "short-subagent-test",
      title: "雾港回声",
      categories: ["悬疑"],
      activeStageId: "character_design" as const,
      activeAgentId: "character_design" as const,
      characterStructure: { format: "text" as const },
      plotStages: createDefaultCreativePlotStages(),
      expertDraft: {
        id: "draft" as const,
        title: "正文",
        revision: createShortWorkspaceContentRevision(""),
        sections: []
      },
      stages: SHORT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
        stageId,
        title: stageId,
        content: "",
        revision: createShortWorkspaceContentRevision("")
      }))
    };
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });

    for await (const _event of runtime.start({
      runId: "run_with_subagent",
      sessionId: "session_with_subagent",
      prompt: "检查人物",
      thinkingLevel: "off",
      agentProfile,
      subagentDefinitions: [{
        id: "character_reviewer",
        name: "人物审校",
        description: "检查人物设定冲突。",
        systemPrompt: "只做人物一致性检查。",
        enabled: true,
        modelMode: "inherit"
      }],
      workspaceContext: { shortWorkspace }
    })) {
      // Consume before reading the parent agent's current tool set.
    }
    for await (const _event of runtime.start({
      runId: "run_without_subagent",
      sessionId: "session_without_subagent",
      prompt: "检查人物",
      thinkingLevel: "off",
      agentProfile,
      subagentDefinitions: [{
        id: "disabled_reviewer",
        name: "停用审校",
        description: "当前停用。",
        systemPrompt: "不要执行。",
        enabled: false,
        modelMode: "inherit"
      }],
      workspaceContext: { shortWorkspace }
    })) {
      // Consume before reading the second parent agent's current tool set.
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<string, { state: { tools: Array<{ name: string }> } }>;
      }
    ).conversationAgents;
    expect(
      cache.get("session_with_subagent:character_design")?.state.tools.map(({ name }) => name)
    ).toContain("spawn_subagent");
    expect(
      cache.get("session_without_subagent:character_design")?.state.tools.map(({ name }) => name)
    ).not.toContain("spawn_subagent");
  });

  it("projects child mutation details onto the parent run with a namespaced tool id", () => {
    const baseRevision = createShortWorkspaceContentRevision("修改前");
    const events = toRuntimeEvents(
      {
        type: "tool_execution_update",
        toolCallId: "parent-spawn-call",
        toolName: "spawn_subagent",
        args: {},
        partialResult: {
          content: [{ type: "text", text: "子工具结果已同步" }],
          details: {
            kind: "subagent-progress",
            progress: {
              type: "child_tool_details",
              parentToolCallId: "parent-spawn-call",
              subagentRunId: "subrun-1",
              subagentId: "draft_reviewer",
              name: "正文审校",
              toolCallId: "subrun-1:child-write",
              toolName: "write_workspace_editor",
              isError: false,
              result: {
                content: [{ type: "text", text: "等待审阅" }],
                details: {
                  kind: "workspace-editor-mutation",
                  workspaceId: "short-1",
                  stageId: "character_design",
                  text: "修改后",
                  baseRevision,
                  summary: "等待审阅"
                }
              }
            }
          }
        }
      } as never,
      {
        runId: "parent-run",
        sessionId: "parent-session",
        prompt: "委派修改"
      },
      providerRuntime,
      "parent-assistant"
    );

    expect(events).toEqual([{
      type: "workspace.editor_mutation",
      runId: "parent-run",
      sessionId: "parent-session",
      payload: {
        toolCallId: "subrun-1:child-write",
        workspaceId: "short-1",
        stageId: "character_design",
        text: "修改后",
        baseRevision,
        summary: "等待审阅",
        runtime: providerRuntime
      }
    }]);
  });

  it("projects all child long-form proposals onto the parent approval chain", () => {
    const proposals = [
      {
        toolName: "propose_long_mutation",
        eventType: "long.mutation_proposal",
        details: {
          kind: "long-mutation-proposal",
          bookId: "longbook-child",
          agentId: "setting",
          batch: {
            baseRevision: 3,
            updatedAt: "2026-07-26T12:00:00.000Z",
            operations: [],
            documentWrites: []
          },
          baseProjectRevision: 5,
          summary: "更新世界规则"
        }
      },
      {
        toolName: "write_worldbuilding_file",
        eventType: "long.worldbuilding_file_proposal",
        details: {
          kind: "long-worldbuilding-file-proposal",
          bookId: "longbook-child",
          agentId: "setting",
          batch: {
            baseRevision: 3,
            updatedAt: "2026-07-26T12:00:00.000Z",
            operations: [],
            documentWrites: [
              {
                proposalId: "proposal_world_rules",
                fileId: "long.worldbuilding.world_rules",
                content: "新规则",
                mode: "replace",
                expectedRevision: "v1:0:00000000",
                nextRevision: "v1:3:12345678",
                updatedAt: "2026-07-26T12:00:00.000Z",
                reason: "更新世界规则文件"
              }
            ]
          },
          baseProjectRevision: 5,
          summary: "更新世界规则文件",
          files: [
            {
              categoryId: "world_rules",
              fileId: "long.worldbuilding.world_rules",
              filePath: "long/worldbuilding/world_rules/content.md",
              title: "世界规则",
              operation: "edit",
              beforeText: "旧规则",
              afterText: "新规则",
              beforeRevision: "v1:0:00000000",
              nextRevision: "v1:3:12345678"
            }
          ]
        }
      },
      {
        toolName: "write_continuity_file",
        eventType: "long.continuity_file_proposal",
        details: {
          kind: "long-continuity-file-proposal",
          bookId: "longbook-child",
          agentId: "continuity_ledger",
          batch: {
            baseRevision: 3,
            updatedAt: "2026-07-26T12:00:00.000Z",
            operations: [],
            documentWrites: [
              {
                proposalId: "proposal_continuity_foreshadowing",
                fileId:
                  "file_chapter_one:continuity:foreshadowing-changes",
                content: "蜡封伏笔已种下。",
                mode: "replace",
                expectedRevision: "v1:0:00000000",
                nextRevision: "v1:8:12345678",
                updatedAt: "2026-07-26T12:00:00.000Z",
                reason: "记录伏笔变化"
              }
            ]
          },
          baseProjectRevision: 5,
          summary: "记录伏笔变化",
          files: [
            {
              chapterCardId: "chapter_one",
              role: "foreshadowing_changes",
              characterId: null,
              fileId:
                "file_chapter_one:continuity:foreshadowing-changes",
              filePath:
                "long/continuity/chapters/chapter_one/foreshadowing-changes.md",
              title: "第一章 / 伏笔变化",
              operation: "edit",
              beforeText: "无变化。",
              afterText: "蜡封伏笔已种下。",
              beforeRevision: "v1:0:00000000",
              nextRevision: "v1:8:12345678"
            }
          ]
        }
      },
      {
        toolName: "propose_long_chapter_dispatch",
        eventType: "long.chapter_dispatch_proposal",
        details: {
          kind: "long-chapter-dispatch-proposal",
          bookId: "longbook-child",
          agentId: "draft",
          scope: "chapter",
          chapterCardId: "chapter_one",
          title: "第一章",
          chapters: [
            {
              chapterCardId: "chapter_one",
              title: "第一章",
              status: "empty",
              missingFiles: ["body"]
            }
          ],
          workspaceRevision: 3,
          projectRevision: 5,
          summary: "调度第一章"
        }
      },
      {
        toolName: "propose_long_chapter_write",
        eventType: "long.chapter_write_proposal",
        details: {
          kind: "long-chapter-write-proposal",
          bookId: "longbook-child",
          agentId: "draft",
          batch: {
            baseRevision: 3,
            updatedAt: "2026-07-26T12:00:00.000Z",
            operations: [],
            documentWrites: [{
              proposalId: "proposal_chapter_one",
              fileId: "file_chapter_one:body",
              content: "正文",
              mode: "replace",
              expectedRevision: "v1:0:00000000",
              nextRevision: "v1:2:00000000",
              updatedAt: "2026-07-26T12:00:00.000Z",
              reason: "写入第一章"
            }]
          },
          baseProjectRevision: 5,
          file: {
            chapterCardId: "chapter_one",
            chapterTitle: "第一章",
            fileId: "file_chapter_one:body",
            filePath: "long/chapters/chapter_one/body.md",
            operation: "create",
            beforeText: "",
            afterText: "正文",
            beforeRevision: "v1:0:00000000",
            nextRevision: "v1:2:00000000"
          },
          summary: "写入第一章"
        }
      },
      {
        toolName: "propose_long_ledger_commit",
        eventType: "long.ledger_commit_proposal",
        details: {
          kind: "long-ledger-commit-proposal",
          bookId: "longbook-child",
          agentId: "continuity_ledger",
          input: {
            bookId: "longbook-child",
            chapterCardId: "chapter_one",
            chapterFileRevisions: {
              body: "v1:0:00000000",
              characterState: "v1:0:00000000",
              handoff: "v1:0:00000000"
            },
            commitMessage: "提交第一章",
            chapterSummary: {
              timeline: "时间线",
              characterStates: "人物状态",
              factionStates: "势力状态",
              realmStates: "境界状态",
              foreshadowingStates: "伏笔状态",
              continuityNotes: "连续性说明"
            },
            placementDecisions: {},
            foreshadowingBeatDecisions: {},
            fileUpdates: [],
            coverage: {
              character: { status: "changed", note: "人物状态已核验。" },
              plot: { status: "changed", note: "剧情推进已核验。" },
              foreshadowing: { status: "unchanged", note: "伏笔状态已核验。" },
              world: { status: "unchanged", note: "世界状态已核验。" },
              knowledge: { status: "changed", note: "知识边界已核验。" },
              openLoops: { status: "changed", note: "开放环已核验。" }
            },
            factMutations: [
              {
                factId: "fact_alice_location",
                domain: "character",
                subjectId: "character_alice",
                field: "location",
                value: "北门",
                evidence: "正文写明林岚抵达北门。"
              }
            ],
            knowledgeMutations: [
              {
                factId: "fact_alice_location",
                audienceType: "reader",
                audienceId: null,
                level: "knows",
                evidence: "正文直接呈现。"
              }
            ],
            openLoopMutations: [
              {
                loopId: "loop_alice_return",
                kind: "character",
                status: "open",
                detail: "林岚能否安全返回。",
                subjectId: "character_alice",
                factId: "fact_alice_location",
                evidence: "章末仍有追兵。"
              }
            ],
            chapterOutputs: {
              characterState: "林岚已抵达北门。",
              handoff: {
                summary: "下一章从北门继续。",
                mustCarry: ["林岚位于北门。"],
                nextChapterConstraints: ["追兵仍在场。"],
                openLoops: ["loop_alice_return"]
              }
            },
            baseWorkspaceRevision: 3,
            baseProjectRevision: 5
          },
          summary: "提交第一章连续性"
        }
      }
    ] as const;

    const events = proposals.flatMap((proposal, index) =>
      toRuntimeEvents(
        {
          type: "tool_execution_update",
          toolCallId: "parent-long-spawn",
          toolName: "spawn_subagent",
          args: {},
          partialResult: {
            content: [{ type: "text", text: "子工具结果已同步" }],
            details: {
              kind: "subagent-progress",
              progress: {
                type: "child_tool_details",
                parentToolCallId: "parent-long-spawn",
                subagentRunId: "subrun-long",
                subagentId: "long_reviewer",
                name: "长篇子智能体",
                toolCallId: `subrun-long:child-${index + 1}`,
                toolName: proposal.toolName,
                isError: false,
                result: {
                  content: [{ type: "text", text: "等待审阅" }],
                  details: proposal.details
                }
              }
            }
          }
        } as never,
        {
          runId: "parent-long-run",
          sessionId: "parent-long-session",
          prompt: "委派长篇修改"
        },
        providerRuntime,
        "parent-long-assistant"
      )
    );

    expect(events.map((event) => event.type)).toEqual(
      proposals.map(({ eventType }) => eventType)
    );
    expect(
      events.map((event) => ({
        runId: event.runId,
        sessionId: event.sessionId,
        toolCallId:
          "toolCallId" in event.payload
            ? event.payload.toolCallId
            : undefined
      }))
    ).toEqual(
      proposals.map((_, index) => ({
        runId: "parent-long-run",
        sessionId: "parent-long-session",
        toolCallId: `subrun-long:child-${index + 1}`
      }))
    );
    expect(
      events.every((event) => event.payload.runtime === providerRuntime)
    ).toBe(true);
  });

  it("maps a batch chapter-file creation result into one reviewable workspace event", () => {
    const baseRevision = createShortWorkspaceContentRevision("draft-directory");
    const events = toRuntimeEvents(
      {
        type: "tool_execution_end",
        toolCallId: "create-chapters",
        toolName: "create_expert_draft_sections",
        isError: false,
        result: {
          content: [{ type: "text", text: "等待审阅" }],
          details: {
            kind: "workspace-expert-draft-section-creation",
            workspaceId: "short-1",
            stageId: "draft",
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
            afterSectionId: "section-1",
            baseRevision,
            summary: "已生成创建 2 个空白章节文件的变更，等待用户审阅。"
          }
        }
      } as never,
      {
        runId: "run-create-chapters",
        sessionId: "session-create-chapters",
        prompt: "初始化正文"
      },
      providerRuntime,
      "assistant-create-chapters"
    );

    expect(events.at(-1)).toEqual({
      type: "workspace.editor_mutation",
      runId: "run-create-chapters",
      sessionId: "session-create-chapters",
      payload: {
        toolCallId: "create-chapters",
        workspaceId: "short-1",
        stageId: "draft",
        text: "1. 第二章（1200 字）\n2. 第三章",
        mutationTarget: {
          kind: "expert-draft-section-creation",
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
        baseRevision,
        summary: "已生成创建 2 个空白章节文件的变更，等待用户审阅。",
        runtime: providerRuntime
      }
    });
  });

  it("captures exact prompt, injected context, and tool schemas only in evaluation mode", async () => {
    const runtime = new PiAgentRuntimeAdapter({
      evaluationMode: true,
      tokensPerSecond: 0
    });
    const events: AgentRuntimeEvent[] = [];
    const workspace = screenplayWorkspace();

    for await (const event of runtime.start({
      runId: "run_evaluation_capture",
      sessionId: "session_evaluation_capture",
      prompt: "检查第一集并继续写作",
      thinkingLevel: "off",
      scriptAgentProfile: scriptAgentProfile(),
      workspaceContext: { scriptWorkspace: workspace }
    })) {
      events.push(event);
    }

    const captured = events.find(
      (
        event
      ): event is Extract<
        AgentRuntimeEvent,
        { type: "agent.evaluation_snapshot" }
      > => event.type === "agent.evaluation_snapshot"
    );
    expect(captured?.payload.snapshot).toMatchObject({
      schemaVersion: 1,
      runtimeContext: { kind: "initial-session-context" }
    });
    expect(captured?.payload.snapshot.systemPrompt).toContain(
      "用户在设置中编辑的剧本正文专家提示词"
    );
    expect(captured?.payload.snapshot.runtimeContext.text).toContain(
      "检查第一集并继续写作"
    );
    expect(captured?.payload.snapshot.runtimeContext.text).toContain(
      "剧本作品: 《雾港剧本》"
    );
    const snapshots = events.filter(
      (
        event
      ): event is Extract<
        AgentRuntimeEvent,
        { type: "agent.evaluation_snapshot" }
      > => event.type === "agent.evaluation_snapshot"
    );
    expect(
      snapshots.at(-1)?.payload.snapshot.conversationHistory?.some(
        (message) =>
          message.role === "user" && message.text.includes("检查第一集并继续写作")
      )
    ).toBe(true);
    expect(
      captured?.payload.snapshot.tools.find(
        (tool) => tool.name === "write_draft_section"
      )
    ).toMatchObject({
      label: expect.any(String),
      description: expect.any(String),
      inputSchema: { type: "object" }
    });
  });

  it("serializes evaluation tool schemas without executable TypeBox metadata", () => {
    const parameters = Type.Object({ query: Type.String({ minLength: 1 }) });
    const snapshot = buildAgentEvaluationSnapshot(
      "system",
      "runtime context",
      false,
      [
        {
          name: "search_fixture",
          label: "搜索夹具",
          description: "Searches a test fixture.",
          parameters,
          executionMode: "sequential"
        }
      ],
      "2026-08-13T00:00:00.000Z"
    );

    expect(snapshot).toEqual({
      schemaVersion: 1,
      capturedAt: "2026-08-13T00:00:00.000Z",
      systemPrompt: "system",
      runtimeContext: { kind: "turn-context", text: "runtime context" },
      tools: [
        {
          name: "search_fixture",
          label: "搜索夹具",
          description: "Searches a test fixture.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", minLength: 1 }
            },
            required: ["query"]
          },
          executionMode: "sequential"
        }
      ]
    });
  });

  it("compacts model-visible conversation history for evaluation snapshots", () => {
    expect(
      evaluationConversationHistory([
        { role: "user", content: "继续写第二章", timestamp: 1 },
        toolCallMessage("tool_read", "read_workspace_content"),
        {
          role: "toolResult",
          toolCallId: "tool_read",
          toolName: "read_workspace_content",
          content: [{ type: "text", text: "已读取第二章正文。" }],
          isError: false,
          timestamp: 3
        }
      ])
    ).toEqual([
      { role: "user", text: "继续写第二章" },
      {
        role: "assistant",
        text: "",
        toolName: "read_workspace_content",
        toolCallId: "tool_read"
      },
      {
        role: "tool",
        text: "已读取第二章正文。",
        toolName: "read_workspace_content",
        toolCallId: "tool_read"
      }
    ]);
  });

  it("omits blank tool names from evaluation conversation history", () => {
    expect(
      evaluationConversationHistory([
        toolCallMessage(" ", " "),
        {
          role: "toolResult",
          toolCallId: "   ",
          toolName: "",
          content: [{ type: "text", text: "工具已返回。" }],
          isError: false,
          timestamp: 2
        }
      ])
    ).toEqual([
      { role: "assistant", text: "" },
      { role: "tool", text: "工具已返回。" }
    ]);
  });

  it("maps a chapter deletion result into one reviewable workspace event", () => {
    const baseRevision = createShortWorkspaceContentRevision("draft-directory");
    const events = toRuntimeEvents(
      {
        type: "tool_execution_end",
        toolCallId: "delete-chapter",
        toolName: "delete_draft_section",
        isError: false,
        result: {
          content: [{ type: "text", text: "等待审阅" }],
          details: {
            kind: "workspace-expert-draft-section-deletion",
            workspaceId: "short-1",
            stageId: "draft",
            sectionId: "section-2",
            title: "第二节·暗房",
            baseRevision,
            summary:
              "已生成删除章节「第二节·暗房」及其正文与人物状态文件的变更，等待用户审阅。"
          }
        }
      } as never,
      {
        runId: "run-delete-chapter",
        sessionId: "session-delete-chapter",
        prompt: "删除"
      },
      providerRuntime,
      "assistant-delete-chapter"
    );

    expect(events.at(-1)).toEqual({
      type: "workspace.editor_mutation",
      runId: "run-delete-chapter",
      sessionId: "session-delete-chapter",
      payload: {
        toolCallId: "delete-chapter",
        workspaceId: "short-1",
        stageId: "draft",
        text: "删除：第二节·暗房",
        mutationTarget: {
          kind: "expert-draft-section-deletion",
          sectionId: "section-2",
          title: "第二节·暗房"
        },
        baseRevision,
        summary:
          "已生成删除章节「第二节·暗房」及其正文与人物状态文件的变更，等待用户审阅。",
        runtime: providerRuntime
      }
    });
  });

  it("maps a chapter rename result into one reviewable workspace event", () => {
    const baseRevision = createShortWorkspaceContentRevision("draft-directory");
    const events = toRuntimeEvents(
      {
        type: "tool_execution_end",
        toolCallId: "rename-chapter",
        toolName: "rename_draft_section",
        isError: false,
        result: {
          content: [{ type: "text", text: "等待审阅" }],
          details: {
            kind: "workspace-expert-draft-section-rename",
            workspaceId: "short-1",
            stageId: "draft",
            sectionId: "section-2",
            previousTitle: "第二节·暗房",
            title: "第二节·底片",
            baseRevision,
            summary: "已生成将章节「第二节·暗房」改名为「第二节·底片」的变更，等待用户审阅。"
          }
        }
      } as never,
      {
        runId: "run-rename-chapter",
        sessionId: "session-rename-chapter",
        prompt: "改名"
      },
      providerRuntime,
      "assistant-rename-chapter"
    );

    expect(events.at(-1)).toEqual({
      type: "workspace.editor_mutation",
      runId: "run-rename-chapter",
      sessionId: "session-rename-chapter",
      payload: {
        toolCallId: "rename-chapter",
        workspaceId: "short-1",
        stageId: "draft",
        text: "第二节·暗房 → 第二节·底片",
        mutationTarget: {
          kind: "expert-draft-section-rename",
          sectionId: "section-2",
          previousTitle: "第二节·暗房",
          title: "第二节·底片"
        },
        baseRevision,
        summary: "已生成将章节「第二节·暗房」改名为「第二节·底片」的变更，等待用户审阅。",
        runtime: providerRuntime
      }
    });
  });

  it("maps subagent progress updates in started-activity-completed order", () => {
    const input = {
      runId: "parent-run-order",
      sessionId: "parent-session-order",
      prompt: "委派检查"
    };
    const progress = [
      {
        type: "started",
        parentToolCallId: "spawn-order",
        subagentRunId: "subrun-order",
        subagentId: "reviewer",
        name: "审校",
        task: "检查时间线"
      },
      {
        type: "activity",
        parentToolCallId: "spawn-order",
        subagentRunId: "subrun-order",
        subagentId: "reviewer",
        name: "审校",
        activity: { type: "message_delta", delta: "结论" }
      },
      {
        type: "completed",
        parentToolCallId: "spawn-order",
        subagentRunId: "subrun-order",
        subagentId: "reviewer",
        name: "审校",
        status: "completed",
        summary: "检查完成"
      }
    ];
    const events = progress.flatMap((item) =>
      toRuntimeEvents(
        {
          type: "tool_execution_update",
          toolCallId: "spawn-order",
          toolName: "spawn_subagent",
          args: {},
          partialResult: {
            content: [{ type: "text", text: "progress" }],
            details: { kind: "subagent-progress", progress: item }
          }
        } as never,
        input,
        providerRuntime,
        "parent-assistant-order"
      )
    );

    expect(events.map((event) => event.type)).toEqual([
      "subagent.started",
      "subagent.activity",
      "subagent.completed"
    ]);
    expect(events.every((event) =>
      event.runId === input.runId && event.sessionId === input.sessionId
    )).toBe(true);
  });

  it("projects a child usage observation once without using its completed summary", () => {
    const input = {
      runId: "parent-usage-run",
      sessionId: "parent-usage-session",
      prompt: "委派统计"
    };
    const events = toRuntimeEvents(
      {
        type: "tool_execution_update",
        toolCallId: "spawn-usage",
        toolName: "spawn_subagent",
        args: {},
        partialResult: {
          content: [{ type: "text", text: "子智能体模型请求已完成。" }],
          details: {
            kind: "subagent-progress",
            progress: {
              type: "usage_observed",
              parentToolCallId: "spawn-usage",
              subagentRunId: "subrun-usage",
              subagentId: "reviewer",
              name: "审校",
              observationId: "subrun-usage:turn:1:attempt:1",
              observedAt: "2026-07-29T10:00:00.000Z",
              messageId: "subrun-usage_assistant",
              turnId: "subrun-usage:turn:1",
              attempt: 1,
              status: "completed",
              hadToolCall: true,
              usage: {
                inputTokens: 12,
                outputTokens: 5,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                totalTokens: 17
              },
              runtime: {
                provider: "openai",
                model: "child-model",
                mode: "provider",
                configId: "child-config"
              }
            }
          }
        }
      } as never,
      input,
      providerRuntime,
      "parent-usage-assistant"
    );

    expect(events).toEqual([{
      type: "agent.usage_observed",
      runId: input.runId,
      sessionId: input.sessionId,
      payload: {
        observationId: "subrun-usage:turn:1:attempt:1",
        observedAt: "2026-07-29T10:00:00.000Z",
        messageId: "subrun-usage_assistant",
        turnId: "subrun-usage:turn:1",
        attempt: 1,
        status: "completed",
        hadToolCall: true,
        usage: {
          inputTokens: 12,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 17
        },
        runtime: {
          provider: "openai",
          model: "child-model",
          mode: "provider",
          configId: "child-config"
        },
        parentToolCallId: "spawn-usage",
        subagentRunId: "subrun-usage",
        subagentId: "reviewer"
      }
    }]);
  });

  it("maps library mutation tool details to the renderer event contract", () => {
    const events = toRuntimeEvents(
      {
        type: "tool_execution_end",
        toolCallId: "tool_edit_material",
        toolName: "edit_material_entry",
        isError: false,
        result: {
          content: [{ type: "text", text: "等待审阅" }],
          details: {
            kind: "library-entry-mutation",
            operation: "edit",
            domain: "material",
            libraryId: "material-library-1",
            entryId: "entry-1",
            documentId: "document-1",
            stageId: "character",
            title: "人物甲",
            text: "修改后",
            baseRevision: createShortWorkspaceContentRevision("修改前"),
            baseProjectRevision: 4,
            summary: "等待审阅"
          }
        }
      } as never,
      {
        runId: "run_library_event",
        sessionId: "session_library_event",
        prompt: "修改人物"
      },
      providerRuntime,
      "assistant-library"
    );

    expect(events).toContainEqual({
      type: "library.editor_mutation",
      runId: "run_library_event",
      sessionId: "session_library_event",
      payload: {
        toolCallId: "tool_edit_material",
        operation: "edit",
        domain: "material",
        libraryId: "material-library-1",
        entryId: "entry-1",
        documentId: "document-1",
        stageId: "character",
        title: "人物甲",
        text: "修改后",
        baseRevision: createShortWorkspaceContentRevision("修改前"),
        baseProjectRevision: 4,
        summary: "等待审阅",
        runtime: providerRuntime
      }
    });

    const overviewEvents = toRuntimeEvents(
      {
        type: "tool_execution_end",
        toolCallId: "tool_edit_overview",
        toolName: "edit_material_library_overview",
        isError: false,
        result: {
          content: [{ type: "text", text: "等待审阅" }],
          details: {
            kind: "library-overview-mutation",
            operation: "edit-overview",
            domain: "material",
            libraryId: "material-library-1",
            documentId: "material-overview-1",
            title: "人物素材 · 库介绍",
            text: "修改后的库介绍",
            baseRevision: createShortWorkspaceContentRevision("修改前的库介绍"),
            baseProjectRevision: 5,
            summary: "等待审阅"
          }
        }
      } as never,
      {
        runId: "run_library_overview_event",
        sessionId: "session_library_event",
        prompt: "修改库介绍"
      },
      providerRuntime,
      "assistant-library-overview"
    );

    expect(overviewEvents).toContainEqual({
      type: "library.editor_mutation",
      runId: "run_library_overview_event",
      sessionId: "session_library_event",
      payload: {
        toolCallId: "tool_edit_overview",
        operation: "edit-overview",
        domain: "material",
        libraryId: "material-library-1",
        documentId: "material-overview-1",
        title: "人物素材 · 库介绍",
        text: "修改后的库介绍",
        baseRevision: createShortWorkspaceContentRevision("修改前的库介绍"),
        baseProjectRevision: 5,
        summary: "等待审阅",
        runtime: providerRuntime
      }
    });
  });

  it("starts each learning-imitation preset from a clean runtime transcript", async () => {
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0 });

    for (const [index, prompt] of ["第一次素材学习", "第二次素材学习"].entries()) {
      for await (const _event of runtime.start({
        runId: `run_learning_${index}`,
        sessionId: "session_learning",
        prompt,
        thinkingLevel: "off",
        learningImitationProfile: {
          id: "material_split",
          label: "素材拆分",
          systemPrompt: "分析当前样本文档。"
        },
        workspaceContext: {
          learningImitation: {
            stageId: "material_split",
            documents: [{
              id: "sample",
              name: "sample.txt",
              extension: "txt",
              mediaType: "text/plain",
              size: 4,
              text: "测试正文",
              charCount: 4
            }],
            result: cloneEmptyLearningImitationResult()
          }
        }
      })) {
        // Consume both complete runs before inspecting the stage-scoped cache.
      }
    }

    const cache = (
      runtime as unknown as {
        conversationAgents: Map<
          string,
          { state: { messages: Array<{ role?: string; content?: unknown }> } }
        >;
      }
    ).conversationAgents;
    const agent = cache.get("session_learning:learning-imitation:material_split");
    const userMessages = agent?.state.messages.filter(
      (message) => message.role === "user"
    );

    expect(userMessages).toHaveLength(1);
    expect(String(userMessages?.[0]?.content)).toContain(
      "【本次智能体会话固定上下文】"
    );
    expect(String(userMessages?.[0]?.content)).toContain("第二次素材学习");
  });

  it("aborts an active run through the caller signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const runtime = new PiAgentRuntimeAdapter({ tokensPerSecond: 0.01 });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of runtime.start({
      runId: "run_aborted",
      sessionId: "session_aborted",
      prompt: "验证主动中止",
      signal: controller.signal
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent.error",
      payload: { code: "pi_agent.aborted" }
    });
  });
});
