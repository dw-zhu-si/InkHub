import { z } from "zod";
import { EnvelopeBaseSchema } from "./envelope";

export const GeneralPermissionModeSchema = z.enum([
  "request-approval",
  "auto-approve"
]);
export type GeneralPermissionMode = z.infer<
  typeof GeneralPermissionModeSchema
>;

export const AppLanguageSchema = z.enum(["auto", "zh-CN"]);
export type AppLanguage = z.infer<typeof AppLanguageSchema>;

export const GeneralSettingsSchema = z.object({
  permissionMode: GeneralPermissionModeSchema,
  autoSave: z.boolean(),
  language: AppLanguageSchema,
  showInMenuBar: z.boolean()
});
export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

export const GeneralSettingsSnapshotSchema = z.object({
  persisted: z.boolean(),
  settings: GeneralSettingsSchema
});
export type GeneralSettingsSnapshot = z.infer<
  typeof GeneralSettingsSnapshotSchema
>;

export function createDefaultGeneralSettings(): GeneralSettings {
  return {
    permissionMode: "auto-approve",
    autoSave: true,
    language: "auto",
    showInMenuBar: true
  };
}

export const GeneralSettingsListCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("generalSettings.list"),
    payload: z.object({})
  });

export const GeneralSettingsSaveCommandEnvelopeSchema =
  EnvelopeBaseSchema.extend({
    type: z.literal("generalSettings.save"),
    payload: GeneralSettingsSchema
  });
