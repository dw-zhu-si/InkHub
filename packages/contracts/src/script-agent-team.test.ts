import { describe, expect, it } from "vitest";
import {
  AgentTeamsListCommandEnvelopeSchema,
  AgentTeamsSaveCommandEnvelopeSchema,
  DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS,
  SCRIPT_WORKSPACE_AGENT_IDS,
  ScriptAgentTeamSettingsInputSchema,
  ScriptAgentTeamSettingsSchema,
  WorkspaceAgentTeamSettingsInputSchema,
  WorkspaceAgentTeamSettingsSchema,
  createEnvelope
} from "./index";

describe("script agent-team contracts", () => {
  it("provides one isolated empty team for every script parent agent", () => {
    const settings = ScriptAgentTeamSettingsSchema.parse(
      DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS
    );
    expect(settings.workspaceType).toBe("script");
    expect(settings.teams.map(({ parentAgentId }) => parentAgentId)).toEqual(
      SCRIPT_WORKSPACE_AGENT_IDS
    );
    expect(settings.teams.every(({ subagents }) => subagents.length === 0)).toBe(
      true
    );
    expect(
      WorkspaceAgentTeamSettingsSchema.parse(settings).workspaceType
    ).toBe("script");
    expect(
      ScriptAgentTeamSettingsInputSchema.parse(settings).workspaceType
    ).toBe("script");
    expect(
      WorkspaceAgentTeamSettingsInputSchema.parse(settings).workspaceType
    ).toBe("script");
  });

  it("accepts script agent-team list and save commands", () => {
    expect(
      AgentTeamsListCommandEnvelopeSchema.parse(
        createEnvelope(
          "agentTeams.list",
          { workspaceType: "script" as const },
          { id: "script_team_list" }
        )
      ).payload.workspaceType
    ).toBe("script");
    expect(
      AgentTeamsSaveCommandEnvelopeSchema.parse(
        createEnvelope(
          "agentTeams.save",
          DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS,
          { id: "script_team_save" }
        )
      ).payload.workspaceType
    ).toBe("script");
  });

  it("rejects incomplete or duplicate script parent teams", () => {
    const duplicate = {
      ...DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS,
      teams: DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS.teams.map((team, index) =>
        index === 1
          ? { ...team, parentAgentId: "character_design" as const }
          : team
      )
    };
    expect(() => ScriptAgentTeamSettingsSchema.parse(duplicate)).toThrow();
  });
});
