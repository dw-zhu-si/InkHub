import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommandEnvelopeSchema,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_LONG_AGENT_PROFILES,
  LongGetWorkspaceIndexCommandEnvelopeSchema,
  SystemEventEnvelopeSchema,
  createEnvelope,
  createDefaultCreativePlotStages,
  createExpertDraftDirectoryRevision,
  createShortWorkspaceContentRevision,
  longChapterBodyFileId,
  longChapterFilePath,
  type CommandResult,
  type SystemEventEnvelope
} from "@deepwrite/contracts";
import type {
  AgentRunInput,
  AgentRuntimeEvent
} from "@deepwrite/pi-runtime-adapter";
import type {
  UtilityCommandHandlerContext,
  UtilityRuntimeOptions
} from "./runtime";

type AgentCommandHandler = NonNullable<UtilityRuntimeOptions["commandHandler"]>;

const captured = vi.hoisted(() => ({
  commandHandler: undefined as AgentCommandHandler | undefined,
  startInputs: [] as AgentRunInput[],
  runtimeEvents: [] as AgentRuntimeEvent[]
}));

vi.mock("./runtime", () => ({
  bootUtility: vi.fn(
    (
      _worker: string,
      options: { commandHandler?: AgentCommandHandler }
    ): void => {
      captured.commandHandler = options.commandHandler;
    }
  )
}));

vi.mock("@deepwrite/pi-runtime-adapter", () => ({
  PiAgentRuntimeAdapter: class {
    describe(): {
      provider: string;
      model: string;
      mode: "local-faux";
    } {
      return {
        provider: "deepwrite",
        model: "deepwrite-writing-faux",
        mode: "local-faux"
      };
    }

    async *start(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent> {
      captured.startInputs.push(input);
      for (const event of captured.runtimeEvents.splice(0)) {
        yield event;
      }
    }

    async testConnection(): Promise<never> {
      throw new Error("Not used by this test.");
    }
  }
}));

describe("Agent Utility prompt forwarding", () => {
  beforeEach(() => {
    captured.startInputs.length = 0;
    captured.runtimeEvents.length = 0;
  });

  it("forwards scriptAgentProfile from the command payload into streamPrompt", async () => {
    await import("./agent-entry");

    const scriptAgentProfile =
      DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.find(
        (profile) => profile.id === "character_design"
      )!;
    const emptyRevision = createShortWorkspaceContentRevision("");
    const characterContent = "人物设定快照";
    const plotStages = createDefaultCreativePlotStages();
    const command = CommandEnvelopeSchema.parse(
      createEnvelope(
        "agent.prompt",
        {
          sessionId: "session-script-forwarding",
          message: "请检查人物设定",
          scriptAgentProfile,
          workspaceContext: {
            activeResource: {
              id: "script-1:character_design",
              domain: "creation",
              title: "人物设计",
              path: ["测试剧本", "人物设计"],
              source: "live-editor",
              content: characterContent
            },
            scriptWorkspace: {
              id: "script-1",
              title: "测试剧本",
              categories: ["悬疑"],
              activeStageId: "character_design",
              activeAgentId: "character_design",
              plotStages,
              expertDraft: {
                id: "draft",
                title: "剧集",
                revision: createExpertDraftDirectoryRevision([
                  {
                    id: "episode-1",
                    title: "第一集",
                    wordCountRequirement: ""
                  }
                ]),
                sections: [
                  {
                    id: "episode-1",
                    title: "第一集",
                    wordCountRequirement: "",
                    body: {
                      documentId: "draft-section:episode-1:body",
                      title: "第一集",
                      content: "",
                      revision: emptyRevision
                    },
                    characterState: {
                      documentId:
                        "draft-section:episode-1:character-state",
                      title: "第一集 · 人物状态",
                      content: "",
                      revision: emptyRevision
                    }
                  }
                ]
              },
              stages: [
                {
                  stageId: "character_design",
                  title: "人物设计",
                  content: characterContent,
                  revision:
                    createShortWorkspaceContentRevision(characterContent)
                },
                ...plotStages.map((stage) => ({
                  stageId: stage.id,
                  title: stage.title,
                  content: "",
                  revision: emptyRevision
                }))
              ]
            }
          }
        },
        {
          id: "command-script-forwarding",
          context: {
            correlationId: "correlation-script-forwarding",
            sessionId: "session-script-forwarding",
            resourceId: "script-1:character_design"
          }
        }
      )
    );
    const emittedEvents: SystemEventEnvelope[] = [];

    const handler = captured.commandHandler;
    expect(handler).toBeTypeOf("function");
    const result = (await handler!(
      command,
      (event) => emittedEvents.push(event)
    )) as CommandResult;

    expect(result).toMatchObject({
      status: "accepted",
      requestId: "command-script-forwarding",
      payload: {
        sessionId: "session-script-forwarding"
      }
    });
    await vi.waitFor(() => {
      expect(captured.startInputs).toHaveLength(1);
    });
    expect(captured.startInputs[0]).toMatchObject({
      sessionId: "session-script-forwarding",
      prompt: "请检查人物设定",
      scriptAgentProfile,
      workspaceContext: {
        scriptWorkspace: {
          id: "script-1",
          activeAgentId: "character_design"
        }
      }
    });
    expect(captured.startInputs[0]?.agentProfile).toBeUndefined();
    expect(emittedEvents).toEqual([]);
  });

  it("forwards the isolated longAgentProfile and navigation context", async () => {
    await import("./agent-entry");
    const longAgentProfile = DEFAULT_LONG_AGENT_PROFILES.find(
      (profile) => profile.id === "setting"
    )!;
    const command = CommandEnvelopeSchema.parse(
      createEnvelope(
        "agent.prompt",
        {
          sessionId: "session-long-forwarding",
          message: "检查世界规则",
          longAgentProfile,
          workspaceContext: {
            longWorkspace: {
              bookId: "longbook_forwarding",
              title: "长篇测试",
              activeRoot: "worldbuilding",
              activeAgentId: "setting",
              workspaceRevision: 0,
              projectRevision: 0,
              navigation: {
                schemaVersion: 1,
                revision: 0,
                bookId: "longbook_forwarding",
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
                characters: [],
                volumes: [
                  { id: "volume_default", title: "第一卷", order: 1 }
                ],
                arcs: [],
                chapterCards: [],
                committedThroughChapterId: null
              }
            }
          }
        },
        {
          id: "command-long-forwarding",
          context: {
            correlationId: "correlation-long-forwarding",
            sessionId: "session-long-forwarding"
          }
        }
      )
    );

    const requestInternalCommand = vi.fn<
      UtilityCommandHandlerContext["requestInternalCommand"]
    >(async (_target, internalCommand) => ({
      status: "accepted",
      requestId: internalCommand.id,
      payload: { forwarded: true }
    }));
    const utilityContext: UtilityCommandHandlerContext = {
      worker: "agent",
      requestId: command.id,
      requestInternalCommand
    };
    const result = await captured.commandHandler!(
      command,
      () => undefined,
      utilityContext
    );
    expect(result.status).toBe("accepted");
    await vi.waitFor(() => expect(captured.startInputs).toHaveLength(1));
    expect(captured.startInputs[0]).toMatchObject({
      longAgentProfile: { id: "setting" },
      workspaceContext: {
        longWorkspace: {
          bookId: "longbook_forwarding",
          activeRoot: "worldbuilding"
        }
      }
    });
    expect(captured.startInputs[0]?.agentProfile).toBeUndefined();
    expect(captured.startInputs[0]?.scriptAgentProfile).toBeUndefined();
    expect(captured.startInputs[0]?.longCommandExecutor).toBeTypeOf("function");

    const queryCommand = LongGetWorkspaceIndexCommandEnvelopeSchema.parse(
      createEnvelope(
        "long.getWorkspaceIndex",
        { bookId: "longbook_forwarding" },
        {
          id: "query-long-forwarding",
          context: {
            correlationId: "correlation-long-forwarding",
            sessionId: "session-long-forwarding",
            runId: "run-long-forwarding",
            resourceId: "longbook_forwarding"
          }
        }
      )
    );
    const querySignal = new AbortController();
    await expect(
      captured.startInputs[0]!.longCommandExecutor!(
        queryCommand,
        querySignal.signal
      )
    ).resolves.toMatchObject({
      status: "accepted",
      requestId: "query-long-forwarding"
    });
    expect(requestInternalCommand).toHaveBeenCalledWith(
      "core",
      queryCommand,
      { timeoutMs: 60_000 }
    );

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      captured.startInputs[0]!.longCommandExecutor!(
        queryCommand,
        aborted.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(requestInternalCommand).toHaveBeenCalledTimes(1);
  });

  it("forwards internal usage observations to Main as validated envelopes", async () => {
    await import("./agent-entry");
    captured.runtimeEvents.push({
      type: "agent.usage_observed",
      runId: "run-usage-envelope",
      sessionId: "session-usage-envelope",
      payload: {
        observationId: "run-usage-envelope:turn:1:attempt:1",
        observedAt: "2026-07-29T10:00:00.000Z",
        messageId: "run-usage-envelope_assistant",
        turnId: "run-usage-envelope:turn:1",
        attempt: 1,
        status: "completed",
        hadToolCall: false,
        usage: {
          inputTokens: 10,
          outputTokens: 4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 14
        },
        runtime: {
          provider: "openai",
          model: "writer",
          mode: "provider",
          configId: "writer-config"
        }
      }
    });
    const command = CommandEnvelopeSchema.parse(
      createEnvelope(
        "agent.prompt",
        {
          sessionId: "session-usage-envelope",
          message: "记录用量"
        },
        {
          id: "command-usage-envelope",
          context: {
            correlationId: "correlation-usage-envelope",
            sessionId: "session-usage-envelope"
          }
        }
      )
    );
    const emitted: SystemEventEnvelope[] = [];

    await expect(
      captured.commandHandler!(command, (event) => emitted.push(event))
    ).resolves.toMatchObject({ status: "accepted" });
    await vi.waitFor(() => expect(emitted).toHaveLength(1));

    expect(SystemEventEnvelopeSchema.parse(emitted[0]).type).toBe(
      "agent.usage_observed"
    );
    expect(emitted[0]).toMatchObject({
      payload: {
        observationId: "run-usage-envelope:turn:1:attempt:1",
        runtime: { configId: "writer-config" }
      }
    });
  });

  it("maps all long proposal runtime events to validated system envelopes", async () => {
    await import("./agent-entry");
    const eventBase = {
      runId: "run-long-proposals",
      sessionId: "session-long-proposals"
    };
    const payloadBase = {
      toolCallId: "tool-long-proposal",
      bookId: "longbook_proposals",
      summary: "等待审阅。",
      runtime: {
        provider: "deepwrite",
        model: "proposal-test",
        mode: "local-faux" as const
      }
    };
    captured.runtimeEvents.push(
      {
        ...eventBase,
        type: "long.mutation_proposal",
        payload: {
          ...payloadBase,
          agentId: "setting",
          batch: {
            baseRevision: 2,
            updatedAt: "2026-07-26T12:00:00.000Z",
            operations: [
              {
                type: "worldbuilding.update",
                id: "world_rules",
                patch: { title: "硬规则" }
              }
            ],
            documentWrites: []
          },
          baseProjectRevision: 3
        }
      },
      {
        ...eventBase,
        type: "long.worldbuilding_file_proposal",
        payload: {
          ...payloadBase,
          agentId: "setting",
          batch: {
            baseRevision: 2,
            updatedAt: "2026-07-26T12:00:00.000Z",
            operations: [
              {
                type: "worldbuildingItem.create",
                categoryId: "world_rules",
                item: {
                  id: "worlditem_memory",
                  title: "记忆代价",
                  order: 1,
                  file: {
                    id: "file_worlditem_memory:content",
                    path:
                      "long/worldbuilding/world_rules/items/worlditem_memory.md",
                    revision: "v1:0:00000000",
                    updatedAt: "2026-07-26T12:00:00.000Z"
                  }
                }
              }
            ],
            documentWrites: []
          },
          baseProjectRevision: 3,
          files: [
            {
              categoryId: "world_rules",
              itemId: "worlditem_memory",
              fileId: "file_worlditem_memory:content",
              filePath:
                "long/worldbuilding/world_rules/items/worlditem_memory.md",
              title: "记忆代价",
              operation: "create",
              beforeText: "",
              afterText: "",
              beforeRevision: null,
              nextRevision: "v1:0:00000000"
            }
          ]
        }
      },
      {
        ...eventBase,
        type: "long.chapter_dispatch_proposal",
        payload: {
          ...payloadBase,
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
          workspaceRevision: 2,
          projectRevision: 3
        }
      },
      {
        ...eventBase,
        type: "long.chapter_write_proposal",
        payload: {
          ...payloadBase,
          agentId: "draft",
          batch: {
            baseRevision: 2,
            updatedAt: "2026-07-26T12:00:00.000Z",
            operations: [],
            documentWrites: [{
              proposalId: "proposal_chapter_one",
              fileId: longChapterBodyFileId("chapter_one"),
              content: "正文",
              mode: "replace",
              expectedRevision: "v1:0:00000000",
              nextRevision: "v1:2:00000000",
              updatedAt: "2026-07-26T12:00:00.000Z",
              reason: "完成第一章"
            }]
          },
          baseProjectRevision: 3,
          file: {
            chapterCardId: "chapter_one",
            chapterTitle: "第一章",
            fileId: longChapterBodyFileId("chapter_one"),
            filePath: longChapterFilePath("chapter_one", "body.md"),
            operation: "create",
            beforeText: "",
            afterText: "正文",
            beforeRevision: "v1:0:00000000",
            nextRevision: "v1:2:00000000"
          }
        }
      },
      {
        ...eventBase,
        type: "long.ledger_commit_proposal",
        payload: {
          ...payloadBase,
          agentId: "continuity_ledger",
          input: {
            mode: "structured",
            bookId: "longbook_proposals",
            chapterCardId: "chapter_one",
            chapterFileRevisions: {
              body: "v1:0:00000000",
              characterState: "v1:0:00000000",
              handoff: "v1:0:00000000"
            },
            commitMessage: "提交第一章连续性",
            chapterSummary: {
              timeline: "第一天。",
              characterStates: "人物状态已核对。",
              factionStates: "势力状态无变化。",
              realmStates: "境界状态无变化。",
              foreshadowingStates: "伏笔状态已核对。",
              continuityNotes: "下一章继续。"
            },
            placementDecisions: {},
            foreshadowingBeatDecisions: {},
            fileUpdates: [],
            coverage: {
              character: {
                status: "unchanged",
                note: "人物状态已核验。"
              },
              plot: {
                status: "unchanged",
                note: "剧情推进已核验。"
              },
              foreshadowing: {
                status: "unchanged",
                note: "伏笔状态已核验。"
              },
              world: {
                status: "unchanged",
                note: "世界状态已核验。"
              },
              knowledge: {
                status: "unchanged",
                note: "知识边界已核验。"
              },
              openLoops: {
                status: "unchanged",
                note: "开放事项已核验。"
              }
            },
            factMutations: [],
            knowledgeMutations: [],
            openLoopMutations: [],
            chapterOutputs: {
              characterState: "第一章章末人物状态。",
              handoff: {
                summary: "下一章继续。",
                mustCarry: [],
                nextChapterConstraints: [],
                openLoops: []
              }
            },
            baseWorkspaceRevision: 2,
            baseProjectRevision: 3
          }
        }
      }
    );
    const command = CommandEnvelopeSchema.parse(
      createEnvelope(
        "agent.prompt",
        {
          sessionId: "session-long-proposals",
          message: "生成三类长篇提案"
        },
        {
          id: "command-long-proposals",
          context: {
            correlationId: "correlation-long-proposals",
            sessionId: "session-long-proposals"
          }
        }
      )
    );
    const emitted: SystemEventEnvelope[] = [];

    await expect(
      captured.commandHandler!(command, (event) => emitted.push(event))
    ).resolves.toMatchObject({ status: "accepted" });
    await vi.waitFor(() => expect(emitted).toHaveLength(5));

    expect(
      emitted.map((event) => SystemEventEnvelopeSchema.parse(event).type)
    ).toEqual([
      "long.mutation_proposal",
      "long.worldbuilding_file_proposal",
      "long.chapter_dispatch_proposal",
      "long.chapter_write_proposal",
      "long.ledger_commit_proposal"
    ]);
    expect(emitted[0]).toMatchObject({
      type: "long.mutation_proposal",
      payload: {
        sessionId: "session-long-proposals",
        runId: "run-long-proposals",
        bookId: "longbook_proposals",
        baseProjectRevision: 3
      }
    });
  });
});
