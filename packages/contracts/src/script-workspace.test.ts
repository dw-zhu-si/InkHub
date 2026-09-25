import { describe, expect, it } from "vitest";
import {
  AgentPromptCommandPayloadSchema,
  CreativeWorkspaceSnapshotSchema,
  DEFAULT_SCRIPT_AGENT_READ_ACCESS,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
  SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS,
  SCRIPT_WORKSPACE_STAGE_IDS,
  SCRIPT_WORKSPACE_TEXT_STAGE_IDS,
  ScriptWorkspaceAgentSettingsInputSchema,
  ScriptWorkspaceAgentSettingsSchema,
  ScriptWorkspaceSnapshotSchema,
  WorkspaceAgentProfileSchema,
  WorkspaceAgentSettingsInputSchema,
  WorkspaceAgentSettingsSchema,
  WorkspaceAgentsListCommandEnvelopeSchema,
  WorkspaceAgentsResetCommandEnvelopeSchema,
  WorkspaceAgentsSaveCommandEnvelopeSchema,
  WorkspaceRuntimeContextSchema,
  createEnvelope,
  createDefaultCreativePlotStages,
  createExpertDraftDirectoryRevision,
  createShortWorkspaceContentRevision,
  resolveScriptWorkspaceAgentIdForStage
} from "./index";

function scriptDraftFile(documentId: string, title: string, content: string) {
  return {
    documentId,
    title,
    content,
    revision: createShortWorkspaceContentRevision(content)
  };
}

function scriptWorkspaceSnapshot() {
  const sections = [
    {
      id: "episode-1",
      title: "第一集",
      wordCountRequirement: "",
      body: scriptDraftFile(
        "draft-section:episode-1:body",
        "第一集",
        "1. 内景 客厅 - 夜\n△灯光熄灭。"
      ),
      characterState: scriptDraftFile(
        "draft-section:episode-1:character-state",
        "第一集 · 人物状态",
        "林默发现停电。"
      )
    }
  ];
  return {
    id: "script_1",
    title: "测试剧本",
    categories: ["悬疑"],
    activeStageId: "plot_refine" as const,
    plotStages: createDefaultCreativePlotStages(),
    expertDraft: {
      id: "draft" as const,
      title: "剧集",
      revision: createExpertDraftDirectoryRevision(sections),
      sections
    },
    stages: SCRIPT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => {
      const content = stageId === "plot_refine" ? "停电触发密室冲突。" : "";
      return {
        stageId,
        title: stageId,
        content,
        revision: createShortWorkspaceContentRevision(content)
      };
    })
  };
}

describe("script workspace contracts", () => {
  it("uses the same default dynamic plot structure as short stories", () => {
    expect(SCRIPT_WORKSPACE_STAGE_IDS).toEqual([
      "character_design",
      "worldbuilding",
      "plot_design",
      "intro_design",
      "plot_refine",
      "narrative_perspective",
      "outline",
      "draft"
    ]);
    expect(DEFAULT_SCRIPT_AGENT_READ_ACCESS.expert_draft_coordinator).toEqual({
      material: ["character", "gimmick", "plot", "draft", "other"],
      skill: ["style", "general", "other"]
    });
    const legacy = structuredClone(DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS);
    Object.assign(legacy.agents[0]!.readAccess, { workspace: ["character_design"] });
    expect(ScriptWorkspaceAgentSettingsInputSchema.safeParse(legacy).success).toBe(
      false
    );
    expect(resolveScriptWorkspaceAgentIdForStage("plot_refine")).toBe(
      "plot_design"
    );
  });

  it("exports one screenplay-format contract bound to the current draft tools", () => {
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain(
      "序号. 内景/外景 地点 - 时间"
    );
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("“△”开头");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("OS");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("VO");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("成对的开始/结束标记");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("write_draft_section");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain(
      "replace_draft_section_text"
    );
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("Markdown 表格");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("分析标题");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).toContain("格式讲解");
    expect(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS).not.toContain(
      ["write", "section", "body"].join("_")
    );

    const coordinator = DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.find(
      ({ id }) => id === "expert_draft_coordinator"
    )!;
    expect(coordinator.systemPrompt).toContain(SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS);
    expect(coordinator.systemPrompt).toContain("剧本唯一的正文写作智能体");
  });

  it("validates script snapshots, profiles, and discriminated settings", () => {
    const snapshot = ScriptWorkspaceSnapshotSchema.parse(
      scriptWorkspaceSnapshot()
    );
    expect(snapshot.stages).toHaveLength(SCRIPT_WORKSPACE_TEXT_STAGE_IDS.length);
    expect(CreativeWorkspaceSnapshotSchema.parse(snapshot).id).toBe("script_1");

    for (const profile of DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES) {
      expect(WorkspaceAgentProfileSchema.parse(profile).id).toBe(profile.id);
    }
    expect(
      ScriptWorkspaceAgentSettingsSchema.parse(
        DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS
      ).workspaceType
    ).toBe("script");
    expect(
      WorkspaceAgentSettingsSchema.parse(
        DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS
      ).workspaceType
    ).toBe("script");

    const input = {
      workspaceType: "script" as const,
      agents: DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.map(
        ({ id, systemPrompt, welcomeShortcuts, readAccess }) => ({
          id,
          systemPrompt,
          welcomeShortcuts,
          readAccess
        })
      )
    };
    expect(ScriptWorkspaceAgentSettingsInputSchema.parse(input).agents).toHaveLength(
      3
    );
    expect(WorkspaceAgentSettingsInputSchema.parse(input).workspaceType).toBe(
      "script"
    );
    expect(() =>
      ScriptWorkspaceSnapshotSchema.parse({
        ...scriptWorkspaceSnapshot(),
        activeStageId: "draft",
        activeAgentId: "expert_draft_coordinator",
        activeSectionId: "episode-1"
      })
    ).not.toThrow();
    expect(() =>
      ScriptWorkspaceSnapshotSchema.parse({
        ...scriptWorkspaceSnapshot(),
        activeStageId: "draft",
        activeAgentId: "expert_section_writer",
        activeSectionId: "episode-1"
      })
    ).toThrow();
    expect(() =>
      ScriptWorkspaceSnapshotSchema.parse({
        ...scriptWorkspaceSnapshot(),
        characterStructure: {
          format: "list",
          items: [
            {
              id: "character-1",
              title: "林默",
              order: 1,
              content: "前段",
              revision: createShortWorkspaceContentRevision("前段"),
              truncated: true,
              originalLength: 10
            }
          ]
        }
      })
    ).not.toThrow();
    expect(() =>
      ScriptWorkspaceSnapshotSchema.parse({
        ...scriptWorkspaceSnapshot(),
        characterStructure: {
          format: "list",
          items: [
            {
              id: "character-1",
              title: "林默",
              order: 1,
              content: "前段",
              revision: createShortWorkspaceContentRevision("前段"),
              originalLength: 10
            }
          ]
        }
      })
    ).toThrow();
  });

  it("validates script runtime context and its independent active profile", () => {
    const scriptWorkspace = ScriptWorkspaceSnapshotSchema.parse(
      scriptWorkspaceSnapshot()
    );
    const context = {
      activeResource: {
        id: "plot-refine",
        domain: "creation" as const,
        title: "剧情细化",
        path: ["测试剧本", "剧情细化"],
        source: "live-editor" as const,
        content: "停电触发密室冲突。"
      },
      scriptWorkspace
    };
    expect(
      WorkspaceRuntimeContextSchema.parse(context).scriptWorkspace?.id
    ).toBe("script_1");
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        ...context,
        activeResource: { ...context.activeResource, content: "不匹配" }
      })
    ).toThrow();

    const longPlotContent = `停电触发密室冲突。${"长".repeat(20_000)}`;
    const workspaceWithLongPlot = ScriptWorkspaceSnapshotSchema.parse({
      ...scriptWorkspaceSnapshot(),
      stages: scriptWorkspaceSnapshot().stages.map((stage) =>
        stage.stageId === "plot_refine"
          ? {
              ...stage,
              content: longPlotContent,
              revision: createShortWorkspaceContentRevision(longPlotContent)
            }
          : stage
      )
    });
    const truncatedActiveResource = {
      ...context.activeResource,
      content: longPlotContent.slice(0, 20_000),
      truncated: true as const,
      originalLength: longPlotContent.length
    };
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource: truncatedActiveResource,
        scriptWorkspace: workspaceWithLongPlot
      })
    ).not.toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource: {
          ...truncatedActiveResource,
          content: `错${truncatedActiveResource.content.slice(1)}`
        },
        scriptWorkspace: workspaceWithLongPlot
      })
    ).toThrow();
    expect(() =>
      WorkspaceRuntimeContextSchema.parse({
        activeResource: {
          ...truncatedActiveResource,
          originalLength: longPlotContent.length - 1
        },
        scriptWorkspace: workspaceWithLongPlot
      })
    ).toThrow();

    const plotProfile = DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.find(
      ({ id }) => id === "plot_design"
    )!;
    expect(
      AgentPromptCommandPayloadSchema.parse({
        sessionId: "session_1",
        message: "细化密室冲突",
        workspaceContext: { scriptWorkspace },
        scriptAgentProfile: plotProfile
      }).scriptAgentProfile?.id
    ).toBe("plot_design");
    expect(() =>
      AgentPromptCommandPayloadSchema.parse({
        sessionId: "session_1",
        message: "细化密室冲突",
        workspaceContext: { scriptWorkspace }
      })
    ).toThrow();
    expect(() =>
      AgentPromptCommandPayloadSchema.parse({
        sessionId: "session_1",
        message: "细化密室冲突",
        workspaceContext: { scriptWorkspace },
        scriptAgentProfile: plotProfile,
        agentProfile: DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.find(
          ({ id }) => id === "plot_design"
        )
      })
    ).toThrow();
  });

  it("accepts script workspace-agent command envelopes", () => {
    const input = {
      workspaceType: "script" as const,
      agents: DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.map(
        ({ id, systemPrompt, welcomeShortcuts, readAccess }) => ({
          id,
          systemPrompt,
          welcomeShortcuts,
          readAccess
        })
      )
    };
    expect(
      WorkspaceAgentsListCommandEnvelopeSchema.parse(
        createEnvelope(
          "workspaceAgents.list",
          { workspaceType: "script" as const },
          { id: "script_agents_list" }
        )
      ).payload.workspaceType
    ).toBe("script");
    expect(
      WorkspaceAgentsSaveCommandEnvelopeSchema.parse(
        createEnvelope("workspaceAgents.save", input, {
          id: "script_agents_save"
        })
      ).payload.workspaceType
    ).toBe("script");
    expect(
      WorkspaceAgentsResetCommandEnvelopeSchema.parse(
        createEnvelope(
          "workspaceAgents.reset",
          {
            workspaceType: "script" as const,
            agentId: "expert_draft_coordinator" as const
          },
          { id: "script_agents_reset" }
        )
      ).payload.workspaceType
    ).toBe("script");
  });
});
