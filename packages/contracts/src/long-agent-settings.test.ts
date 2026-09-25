import { describe, expect, it } from "vitest";
import {
  DEFAULT_LONG_AGENT_SETTINGS,
  CommandEnvelopeSchema,
  LongAgentSettingsInputSchema,
  LongAgentSettingsSchema,
  createEnvelope,
  getDefaultLongAgentProfile
} from "./index";

function editableDefaults() {
  return {
    workspaceType: "long" as const,
    agents: DEFAULT_LONG_AGENT_SETTINGS.agents.map((agent) => ({
      id: agent.id,
      systemPrompt: agent.systemPrompt,
      welcomeShortcuts: [...agent.welcomeShortcuts] as [
        string,
        string,
        string
      ]
    }))
  };
}

describe("long agent settings contracts", () => {
  it("keeps long settings separate from short and script settings", () => {
    expect(
      LongAgentSettingsSchema.parse(DEFAULT_LONG_AGENT_SETTINGS).workspaceType
    ).toBe("long");
    expect(DEFAULT_LONG_AGENT_SETTINGS.agents).toHaveLength(4);
  });

  it("allows prompts and shortcuts to be customized", () => {
    const input = editableDefaults();
    const agent = input.agents.find(({ id }) => id === "setting")!;
    agent.systemPrompt = "先核对世界规则，再提出最小修改。";
    agent.welcomeShortcuts[0] = "检查当前世界规则";

    expect(LongAgentSettingsInputSchema.parse(input)).toMatchObject({
      workspaceType: "long",
      agents: expect.arrayContaining([
        expect.objectContaining({
          id: "setting",
          systemPrompt: "先核对世界规则，再提出最小修改。"
        })
      ])
    });
  });

  it("rejects input that still carries a configurable read access override", () => {
    const input = editableDefaults();
    Object.assign(input.agents.find(({ id }) => id === "plot_design")!, {
      readAccess: {
        workspaceRoots: ["plot_design"],
        materialKinds: [],
        skillKinds: []
      }
    });

    expect(() => LongAgentSettingsInputSchema.parse(input)).toThrow();
  });

  it("rejects public settings that try to narrow immutable read access", () => {
    const settings = structuredClone(DEFAULT_LONG_AGENT_SETTINGS);
    const agent = settings.agents.find(({ id }) => id === "plot_design")!;
    agent.readAccess.workspaceRoots = ["plot_design"];

    expect(() => LongAgentSettingsSchema.parse(settings)).toThrow(
      /read access is immutable/
    );
    expect(
      getDefaultLongAgentProfile("plot_design").readAccess.workspaceRoots
    ).toEqual([
      "worldbuilding",
      "character_design",
      "plot_design",
      "draft",
      "continuity_ledger"
    ]);
  });

  it("rejects public settings that try to widen immutable write access", () => {
    const settings = structuredClone(DEFAULT_LONG_AGENT_SETTINGS);
    const agent = settings.agents.find(({ id }) => id === "setting")!;
    agent.writeAccess.workspaceRoots.push("draft");
    agent.writeAccess.capabilities.push("write_chapter_files");

    expect(() => LongAgentSettingsSchema.parse(settings)).toThrow(
      /write access is immutable/
    );
    expect(
      getDefaultLongAgentProfile("setting").writeAccess.workspaceRoots
    ).toEqual(["worldbuilding", "character_design"]);
  });

  it("requires each of the four long agent ids exactly once", () => {
    const input = editableDefaults();
    input.agents[4] = structuredClone(input.agents[0]!);
    expect(() => LongAgentSettingsInputSchema.parse(input)).toThrow(
      /Duplicate|Missing/
    );
  });

  it("validates independent long agent list, save and reset commands", () => {
    const input = editableDefaults();
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("longAgents.list", {}, { id: "cmd_long_agents_list" })
      ).type
    ).toBe("longAgents.list");
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("longAgents.save", input, {
          id: "cmd_long_agents_save"
        })
      ).type
    ).toBe("longAgents.save");
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope(
          "longAgents.reset",
          { agentId: "continuity_ledger" },
          { id: "cmd_long_agents_reset" }
        )
      ).type
    ).toBe("longAgents.reset");
  });
});
