import { z } from "zod";
import { EnvelopeBaseSchema } from "./envelope";

export const AppearanceModeSchema = z.enum(["system", "light", "dark"]);
export type AppearanceMode = z.infer<typeof AppearanceModeSchema>;

export const AppearanceColorSchemeSchema = z.enum(["light", "dark"]);
export type AppearanceColorScheme = z.infer<typeof AppearanceColorSchemeSchema>;

export const APPEARANCE_FONT_SIZE_LIMITS = {
  uiFontSize: { min: 10, max: 24 },
  codeFontSize: { min: 10, max: 24 }
} as const;

export const DEFAULT_APPEARANCE_UI_FONT_SIZE = 14;
export const DEFAULT_APPEARANCE_CODE_FONT_SIZE = 13;

export const APPEARANCE_UI_FONT_FAMILIES = ["system", "sans", "yuan"] as const;
export const AppearanceUiFontFamilySchema = z.enum(APPEARANCE_UI_FONT_FAMILIES);
export type AppearanceUiFontFamily = z.infer<typeof AppearanceUiFontFamilySchema>;

export const APPEARANCE_EDITOR_FONT_FAMILIES = [
  "song",
  "kai",
  "fangsong",
  "sans",
  "yuan"
] as const;
export const AppearanceEditorFontFamilySchema = z.enum(
  APPEARANCE_EDITOR_FONT_FAMILIES
);
export type AppearanceEditorFontFamily = z.infer<
  typeof AppearanceEditorFontFamilySchema
>;

export const DEFAULT_APPEARANCE_UI_FONT_FAMILY: AppearanceUiFontFamily =
  "system";
export const DEFAULT_APPEARANCE_EDITOR_FONT_FAMILY: AppearanceEditorFontFamily =
  "song";

export const APPEARANCE_FONT_FAMILY_LABELS = {
  system: "系统默认",
  sans: "黑体",
  song: "宋体",
  kai: "楷体",
  fangsong: "仿宋",
  yuan: "圆体"
} as const;

export const APPEARANCE_UI_FONT_STACKS = {
  system:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  sans: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif',
  yuan: '"Yuanti SC", "YouYuan", "PingFang SC", "Microsoft YaHei", sans-serif'
} as const satisfies Record<AppearanceUiFontFamily, string>;

export const APPEARANCE_EDITOR_FONT_STACKS = {
  song: '"Songti SC", "SimSun", "Noto Serif SC", Georgia, serif',
  kai: '"Kaiti SC", "STKaiti", "KaiTi", serif',
  fangsong: '"STFangsong", "FangSong", "KaiTi", serif',
  sans: APPEARANCE_UI_FONT_STACKS.sans,
  yuan: APPEARANCE_UI_FONT_STACKS.yuan
} as const satisfies Record<AppearanceEditorFontFamily, string>;

export interface AppearanceFontFamilyOption<T extends string> {
  value: T;
  label: string;
  stack: string;
}

export function resolveAppearanceUiFontStack(
  family: string | undefined
): string {
  if (family && family in APPEARANCE_UI_FONT_STACKS) {
    return APPEARANCE_UI_FONT_STACKS[family as AppearanceUiFontFamily];
  }
  return APPEARANCE_UI_FONT_STACKS[DEFAULT_APPEARANCE_UI_FONT_FAMILY];
}

export function resolveAppearanceEditorFontStack(
  family: string | undefined
): string {
  if (family && family in APPEARANCE_EDITOR_FONT_STACKS) {
    return APPEARANCE_EDITOR_FONT_STACKS[family as AppearanceEditorFontFamily];
  }
  return APPEARANCE_EDITOR_FONT_STACKS[DEFAULT_APPEARANCE_EDITOR_FONT_FAMILY];
}

export function listAppearanceUiFontFamilyOptions(): Array<
  AppearanceFontFamilyOption<AppearanceUiFontFamily>
> {
  return APPEARANCE_UI_FONT_FAMILIES.map((value) => ({
    value,
    label: APPEARANCE_FONT_FAMILY_LABELS[value],
    stack: APPEARANCE_UI_FONT_STACKS[value]
  }));
}

export function listAppearanceEditorFontFamilyOptions(): Array<
  AppearanceFontFamilyOption<AppearanceEditorFontFamily>
> {
  return APPEARANCE_EDITOR_FONT_FAMILIES.map((value) => ({
    value,
    label: APPEARANCE_FONT_FAMILY_LABELS[value],
    stack: APPEARANCE_EDITOR_FONT_STACKS[value]
  }));
}

const HexColorSchema = z
  .string()
  .regex(/^#[\da-f]{6}$/iu, "颜色必须是 6 位十六进制值")
  .transform((value) => value.toUpperCase());

function fontSizeSchema(limits: { min: number; max: number }) {
  return z
    .number()
    .finite()
    .min(limits.min)
    .max(limits.max)
    .transform((value) => Math.round(value * 2) / 2);
}

export const AppearanceThemeConfigSchema = z.object({
  preset: z.string().trim().min(1),
  accent: HexColorSchema,
  background: HexColorSchema,
  foreground: HexColorSchema,
  uiFontSize: fontSizeSchema(APPEARANCE_FONT_SIZE_LIMITS.uiFontSize),
  codeFontSize: fontSizeSchema(APPEARANCE_FONT_SIZE_LIMITS.codeFontSize),
  translucentSidebar: z.boolean()
});
export type AppearanceThemeConfig = z.infer<typeof AppearanceThemeConfigSchema>;

export const AppearanceSettingsSchema = z.object({
  mode: AppearanceModeSchema,
  light: AppearanceThemeConfigSchema,
  dark: AppearanceThemeConfigSchema,
  uiFontFamily: AppearanceUiFontFamilySchema.default(
    DEFAULT_APPEARANCE_UI_FONT_FAMILY
  ),
  editorFontFamily: AppearanceEditorFontFamilySchema.default(
    DEFAULT_APPEARANCE_EDITOR_FONT_FAMILY
  )
});
export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>;

export const AppearanceSettingsSnapshotSchema = z.object({
  persisted: z.boolean(),
  settings: AppearanceSettingsSchema
});
export type AppearanceSettingsSnapshot = z.infer<
  typeof AppearanceSettingsSnapshotSchema
>;

export function createDefaultAppearanceTheme(
  scheme: AppearanceColorScheme
): AppearanceThemeConfig {
  if (scheme === "dark") {
    return {
      preset: "codex",
      accent: "#5EACFF",
      background: "#17191C",
      foreground: "#F3F4F6",
      uiFontSize: DEFAULT_APPEARANCE_UI_FONT_SIZE,
      codeFontSize: DEFAULT_APPEARANCE_CODE_FONT_SIZE,
      translucentSidebar: true
    };
  }
  return {
    preset: "codex",
    accent: "#339CFF",
    background: "#FFFFFF",
    foreground: "#1A1C1F",
    uiFontSize: DEFAULT_APPEARANCE_UI_FONT_SIZE,
    codeFontSize: DEFAULT_APPEARANCE_CODE_FONT_SIZE,
    translucentSidebar: true
  };
}

export function createDefaultAppearanceSettings(): AppearanceSettings {
  return {
    mode: "system",
    light: createDefaultAppearanceTheme("light"),
    dark: createDefaultAppearanceTheme("dark"),
    uiFontFamily: DEFAULT_APPEARANCE_UI_FONT_FAMILY,
    editorFontFamily: DEFAULT_APPEARANCE_EDITOR_FONT_FAMILY
  };
}

export const AppearanceListCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("appearance.list"),
  payload: z.object({})
});

export const AppearanceSaveCommandEnvelopeSchema = EnvelopeBaseSchema.extend({
  type: z.literal("appearance.save"),
  payload: AppearanceSettingsSchema
});
