import { describe, expect, it } from "vitest";
import {
  CommandEnvelopeSchema,
  DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  LongAgentTeamSettingsSchema,
  createEnvelope
} from "./index";

describe("long agent team contracts", () => {
  it("defines a complete four-role team without widening WorkspaceType", () => {
    const settings = LongAgentTeamSettingsSchema.parse(
      DEFAULT_LONG_AGENT_TEAM_SETTINGS
    );
    expect(settings.workspaceType).toBe("long");
    expect(settings.teams).toHaveLength(4);
  });

  it("rejects duplicate or missing long parent roles", () => {
    const settings = structuredClone(DEFAULT_LONG_AGENT_TEAM_SETTINGS);
    settings.teams[4] = structuredClone(settings.teams[0]!);
    expect(() => LongAgentTeamSettingsSchema.parse(settings)).toThrow(
      /Duplicate|Missing/
    );
  });

  it("validates independent list and save commands", () => {
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("longAgentTeams.list", {}, {
          id: "cmd_long_agent_teams_list"
        })
      ).type
    ).toBe("longAgentTeams.list");
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope(
          "longAgentTeams.save",
          DEFAULT_LONG_AGENT_TEAM_SETTINGS,
          { id: "cmd_long_agent_teams_save" }
        )
      ).type
    ).toBe("longAgentTeams.save");
  });
});
