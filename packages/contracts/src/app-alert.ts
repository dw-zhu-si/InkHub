import { z } from "zod";

export const APP_ALERT_GET_CHANNEL = "deepwrite:app-alert:get";
export const APP_ALERT_ACKNOWLEDGE_DESKTOP_CHANNEL =
  "deepwrite:app-alert:acknowledge-desktop";

const AlertMessageSchema = z.string().trim().min(1).max(500);

export const AppAlertManifestSchema = z
  .object({
    // Keep the upstream spelling for compatibility with the published file.
    desketop: z.array(AlertMessageSchema).max(20),
    model: z.array(AlertMessageSchema).min(1).max(20)
  })
  .strict();
export type AppAlertManifest = z.infer<typeof AppAlertManifestSchema>;

export const AppAlertDesktopRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const AppAlertSnapshotSchema = z.object({
  desktopMessages: z.array(AlertMessageSchema).max(20),
  modelMessages: z.array(AlertMessageSchema).min(1).max(20),
  desktopRevision: AppAlertDesktopRevisionSchema,
  shouldShowDesktop: z.boolean()
});
export type AppAlertSnapshot = z.infer<typeof AppAlertSnapshotSchema>;
