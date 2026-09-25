import { z } from "zod";
import {
  ShortAgentSubagentDefinitionsSchema
} from "./agent-team";
import { EnvelopeBaseSchema } from "./envelope";
import {
  LONG_AGENT_IDS,
  LongAgentIdSchema,
  type LongAgentId
} from "./long-workspace";

export const LongAgentTeamSchema = z
  .object({
    parentAgentId: LongAgentIdSchema,
    subagents: ShortAgentSubagentDefinitionsSchema
  })
  .strict();
export type LongAgentTeam = z.infer<typeof LongAgentTeamSchema>;

function validateCompleteLongAgentTeams(
  teams: readonly { parentAgentId: LongAgentId }[],
  context: z.core.$RefinementCtx<unknown>
): void {
  const ids = teams.map((team) => team.parentAgentId);
  ids.forEach((id, index) => {
    if (ids.indexOf(id) !== index) {
      context.addIssue({
        code: "custom",
        path: ["teams", index, "parentAgentId"],
        message: `Duplicate long parent agent team: ${id}`
      });
    }
  });
  for (const id of LONG_AGENT_IDS) {
    if (!ids.includes(id)) {
      context.addIssue({
        code: "custom",
        path: ["teams"],
        message: `Missing long parent agent team: ${id}`
      });
    }
  }
}

export const LongAgentTeamSettingsSchema = z
  .object({
    workspaceType: z.literal("long"),
    teams: z
      .array(LongAgentTeamSchema)
      .length(LONG_AGENT_IDS.length)
  })
  .strict()
  .superRefine((value, context) =>
    validateCompleteLongAgentTeams(value.teams, context)
  );
export type LongAgentTeamSettings = z.infer<
  typeof LongAgentTeamSettingsSchema
>;

export const LongAgentTeamSettingsInputSchema =
  LongAgentTeamSettingsSchema;
export type LongAgentTeamSettingsInput = z.infer<
  typeof LongAgentTeamSettingsInputSchema
>;

export const DEFAULT_LONG_AGENT_TEAM_SETTINGS: LongAgentTeamSettings = {
  workspaceType: "long",
  teams: LONG_AGENT_IDS.map((parentAgentId) => ({
    parentAgentId,
    subagents: []
  }))
};

export const LongAgentTeamsListCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("longAgentTeams.list"),
    payload: z.object({}).strict()
  });

export const LongAgentTeamsSaveCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("longAgentTeams.save"),
    payload: LongAgentTeamSettingsInputSchema
  });

export type LongAgentTeamsListCommandEnvelope = z.infer<
  typeof LongAgentTeamsListCommandEnvelopeSchema
>;
export type LongAgentTeamsSaveCommandEnvelope = z.infer<
  typeof LongAgentTeamsSaveCommandEnvelopeSchema
>;
