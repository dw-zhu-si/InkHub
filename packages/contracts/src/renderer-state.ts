import { z } from "zod";
import { EnvelopeBaseSchema } from "./envelope";

export const RENDERER_STATE_KEY_MAX_LENGTH = 240;
export const RENDERER_STATE_KEY_PREFIXES = [
  "conversation-history:",
  "conversation-preferences:"
] as const;

const RENDERER_STATE_KEY_PATTERN =
  /^(?:conversation-history:|conversation-preferences:)(?:[A-Za-z0-9!()*'._~:-]|%[0-9A-Fa-f]{2})+$/u;

export const RendererStateKeySchema = z
  .string()
  .max(RENDERER_STATE_KEY_MAX_LENGTH)
  .regex(
    RENDERER_STATE_KEY_PATTERN,
    "Renderer state key must use an allowed conversation prefix and encoded suffix."
  );
export type RendererStateKey = z.infer<typeof RendererStateKeySchema>;

const RendererStateSavePayloadSchema = z
  .object({
    key: RendererStateKeySchema,
    value: z.unknown()
  })
  .strict()
  .superRefine((payload, context) => {
    if (!Object.prototype.hasOwnProperty.call(payload, "value")) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Renderer state save payload must include a value."
      });
    }
  });

export const RendererStateLoadResultSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }).strict(),
  z
    .object({ found: z.literal(true), value: z.unknown() })
    .strict()
    .superRefine((result, context) => {
      if (!Object.prototype.hasOwnProperty.call(result, "value")) {
        context.addIssue({
          code: "custom",
          path: ["value"],
          message: "A found renderer state result must include its value."
        });
      }
    })
]);
export type RendererStateLoadResult = z.infer<
  typeof RendererStateLoadResultSchema
>;

export const RendererStateMutationResultSchema = z
  .object({ ok: z.literal(true) })
  .strict();
export type RendererStateMutationResult = z.infer<
  typeof RendererStateMutationResultSchema
>;

export const RendererStateLoadCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("rendererState.load"),
  payload: z.object({ key: RendererStateKeySchema }).strict()
});

export const RendererStateSaveCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("rendererState.save"),
  payload: RendererStateSavePayloadSchema
});

export const RendererStateRemoveCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("rendererState.remove"),
  payload: z.object({ key: RendererStateKeySchema }).strict()
});

export interface ConversationPersistenceApi {
  load(key: string): Promise<unknown | undefined>;
  save(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
