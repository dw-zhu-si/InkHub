import { z } from "zod";
import { EnvelopeBaseSchema } from "./envelope";
import {
  DEFAULT_LONG_AGENT_PROFILES,
  LONG_AGENT_IDS,
  LongAgentIdSchema,
  LongAgentProfileSchema,
  getDefaultLongAgentProfile,
  type LongAgentId,
  type LongAgentProfile
} from "./long-workspace";

function validateCompleteLongAgentSet(
  agents: readonly { id: LongAgentId }[],
  context: z.core.$RefinementCtx<unknown>
): void {
  const ids = agents.map((agent) => agent.id);
  ids.forEach((id, index) => {
    if (ids.indexOf(id) !== index) {
      context.addIssue({
        code: "custom",
        path: ["agents", index, "id"],
        message: `Duplicate long workspace agent profile: ${id}`
      });
    }
  });
  for (const id of LONG_AGENT_IDS) {
    if (!ids.includes(id)) {
      context.addIssue({
        code: "custom",
        path: ["agents"],
        message: `Missing long workspace agent profile: ${id}`
      });
    }
  }
}

function validateImmutableLongAgentFields(
  agents: readonly LongAgentProfile[],
  context: z.core.$RefinementCtx<unknown>
): void {
  agents.forEach((agent, index) => {
    const builtin = getDefaultLongAgentProfile(agent.id);
    if (
      agent.label !== builtin.label ||
      agent.description !== builtin.description
    ) {
      context.addIssue({
        code: "custom",
        path: ["agents", index],
        message: `Long agent identity metadata is immutable: ${agent.id}`
      });
    }
    if (
      JSON.stringify(agent.readAccess) !==
      JSON.stringify(builtin.readAccess)
    ) {
      context.addIssue({
        code: "custom",
        path: ["agents", index, "readAccess"],
        message: `Long agent read access is immutable: ${agent.id}`
      });
    }
    if (
      JSON.stringify(agent.writeAccess) !==
      JSON.stringify(builtin.writeAccess)
    ) {
      context.addIssue({
        code: "custom",
        path: ["agents", index, "writeAccess"],
        message: `Long agent write access is immutable: ${agent.id}`
      });
    }
  });
}

export const LongAgentSettingsSchema = z
  .object({
    workspaceType: z.literal("long"),
    agents: z
      .array(LongAgentProfileSchema)
      .length(LONG_AGENT_IDS.length)
  })
  .strict()
  .superRefine((value, context) => {
    validateCompleteLongAgentSet(value.agents, context);
    validateImmutableLongAgentFields(value.agents, context);
  });
export type LongAgentSettings = z.infer<typeof LongAgentSettingsSchema>;

export const LongAgentSettingsInputAgentSchema = z
  .object({
    id: LongAgentIdSchema,
    systemPrompt: LongAgentProfileSchema.shape.systemPrompt,
    welcomeShortcuts: LongAgentProfileSchema.shape.welcomeShortcuts
  })
  .strict();
export type LongAgentSettingsInputAgent = z.infer<
  typeof LongAgentSettingsInputAgentSchema
>;

export const LongAgentSettingsInputSchema = z
  .object({
    workspaceType: z.literal("long"),
    agents: z
      .array(LongAgentSettingsInputAgentSchema)
      .length(LONG_AGENT_IDS.length)
  })
  .strict()
  .superRefine((value, context) =>
    validateCompleteLongAgentSet(value.agents, context)
  );
export type LongAgentSettingsInput = z.infer<
  typeof LongAgentSettingsInputSchema
>;

export const DEFAULT_LONG_AGENT_SETTINGS: LongAgentSettings =
  LongAgentSettingsSchema.parse({
    workspaceType: "long",
    agents: DEFAULT_LONG_AGENT_PROFILES.map((profile) =>
      structuredClone(profile)
    )
  });

export const LongAgentsListCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("longAgents.list"),
  payload: z.object({}).strict()
});

export const LongAgentsSaveCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("longAgents.save"),
  payload: LongAgentSettingsInputSchema
});

export const LongAgentsResetCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("longAgents.reset"),
  payload: z
    .object({
      agentId: LongAgentIdSchema.optional()
    })
    .strict()
});

export type LongAgentsListCommandEnvelope = z.infer<
  typeof LongAgentsListCommandEnvelopeSchema
>;
export type LongAgentsSaveCommandEnvelope = z.infer<
  typeof LongAgentsSaveCommandEnvelopeSchema
>;
export type LongAgentsResetCommandEnvelope = z.infer<
  typeof LongAgentsResetCommandEnvelopeSchema
>;
