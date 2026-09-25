import { z } from "zod";
import {
  CommandEnvelopeSchema,
  CommandResultSchema,
  SystemEventEnvelopeSchema,
  UtilityHealthPayloadSchema,
  UtilityWorkerNameSchema
} from "./system";

export const UtilityHealthRequestMessageSchema = z.object({
  kind: z.literal("utility.health.request"),
  requestId: z.string().min(1)
});

export const UtilityShutdownMessageSchema = z.object({
  kind: z.literal("utility.shutdown"),
  requestId: z.string().min(1)
});

export const UtilityCommandRequestMessageSchema = z.object({
  kind: z.literal("utility.command.request"),
  requestId: z.string().min(1),
  command: CommandEnvelopeSchema
});

export const UtilityInternalCommandTargetSchema = z.enum(["core", "tool"]);
export type UtilityInternalCommandTarget = z.infer<
  typeof UtilityInternalCommandTargetSchema
>;

export const UtilityInternalCommandResultMessageSchema = z.object({
  kind: z.literal("utility.internal.command.result"),
  worker: z.literal("agent"),
  target: UtilityInternalCommandTargetSchema,
  requestId: z.string().min(1),
  parentRequestId: z.string().min(1),
  result: CommandResultSchema
});

export const UtilityInboundMessageSchema = z.discriminatedUnion("kind", [
  UtilityHealthRequestMessageSchema,
  UtilityShutdownMessageSchema,
  UtilityCommandRequestMessageSchema,
  UtilityInternalCommandResultMessageSchema
]);
export type UtilityInboundMessage = z.infer<typeof UtilityInboundMessageSchema>;

export const UtilityReadyMessageSchema = z.object({
  kind: z.literal("utility.ready"),
  worker: UtilityWorkerNameSchema,
  pid: z.number().int().positive(),
  startedAt: z.string().datetime()
});

export const UtilityHeartbeatMessageSchema = z.object({
  kind: z.literal("utility.heartbeat"),
  worker: UtilityWorkerNameSchema,
  pid: z.number().int().positive(),
  timestamp: z.string().datetime()
});

export const UtilityHealthMessageSchema = z.object({
  kind: z.literal("utility.health"),
  worker: UtilityWorkerNameSchema,
  requestId: z.string().min(1),
  payload: UtilityHealthPayloadSchema
});

export const UtilityShutdownAckMessageSchema = z.object({
  kind: z.literal("utility.shutdown_ack"),
  worker: UtilityWorkerNameSchema,
  requestId: z.string().min(1),
  timestamp: z.string().datetime()
});

export const UtilityCommandResultMessageSchema = z.object({
  kind: z.literal("utility.command.result"),
  worker: UtilityWorkerNameSchema,
  requestId: z.string().min(1),
  result: CommandResultSchema
});

export const UtilityCommandEventMessageSchema = z.object({
  kind: z.literal("utility.command.event"),
  worker: UtilityWorkerNameSchema,
  requestId: z.string().min(1),
  event: SystemEventEnvelopeSchema
});

export const UtilityInternalCommandRequestMessageSchema = z.object({
  kind: z.literal("utility.internal.command.request"),
  worker: z.literal("agent"),
  target: UtilityInternalCommandTargetSchema,
  requestId: z.string().min(1),
  parentRequestId: z.string().min(1),
  timeoutMs: z.number().int().min(1).max(120_000),
  command: CommandEnvelopeSchema
});
export type UtilityInternalCommandRequestMessage = z.infer<
  typeof UtilityInternalCommandRequestMessageSchema
>;

export const UtilityOutboundMessageSchema = z.discriminatedUnion("kind", [
  UtilityReadyMessageSchema,
  UtilityHeartbeatMessageSchema,
  UtilityHealthMessageSchema,
  UtilityShutdownAckMessageSchema,
  UtilityCommandResultMessageSchema,
  UtilityCommandEventMessageSchema,
  UtilityInternalCommandRequestMessageSchema
]);
export type UtilityOutboundMessage = z.infer<typeof UtilityOutboundMessageSchema>;
