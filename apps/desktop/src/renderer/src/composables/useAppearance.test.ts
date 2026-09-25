import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import source from "./useAppearance.ts?raw";

type AppearanceModule = typeof import("./useAppearance");

let appearanceModule: AppearanceModule;

beforeAll(async () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => undefined
    },
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined
    })
  });
  appearanceModule = await import("./useAppearance");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("useAppearance", () => {
  it("persists appearance through the desktop config API", () => {
    expect(source).toContain("window.deepwrite?.appearance");
    expect(source).toContain("api.save(");
    expect(source).toContain("api.list()");
    expect(source).toContain('LEGACY_STORAGE_KEY = "deepwrite.appearance.v1"');
    expect(source).toContain("clearLegacyStorage()");
  });

  it("migrates legacy localStorage settings when disk config is missing", () => {
    expect(source).toContain("if (!snapshot.persisted)");
    expect(source).toContain("await api.save(legacy.data)");
    expect(source).toContain("hydrateFromDesktop");
  });

  it("applies selected font families to document CSS variables", () => {
    expect(source).toContain('root.style.setProperty("--ui-font"');
    expect(source).toContain('root.style.setProperty(');
    expect(source).toContain('"--editor-font"');
    expect(source).toContain("resolveAppearanceUiFontStack(state.uiFontFamily)");
    expect(source).toContain("resolveAppearanceEditorFontStack(state.editorFontFamily)");
    expect(source).toContain("setUiFontFamily");
    expect(source).toContain("setEditorFontFamily");
  });

  it("derives readable tertiary and accent text tokens", () => {
    expect(source).toContain('"--accent-text",');
    expect(source).toContain('scheme === "dark" ? 0.54 : 0.62');

    for (const preset of appearanceModule.themePresets) {
      for (const scheme of ["light", "dark"] as const) {
        const theme = preset[scheme];
        const accentText = appearanceModule.resolveReadableAccentTextColor(
          theme.accent,
          theme.background,
          theme.foreground
        );
        const tertiaryText = appearanceModule.resolveTertiaryTextColor(
          theme.background,
          theme.foreground,
          scheme
        );
        expect(
          appearanceModule.contrastRatio(accentText, theme.background),
          `${preset.id} ${scheme} accent text`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          appearanceModule.contrastRatio(tertiaryText, theme.background),
          `${preset.id} ${scheme} tertiary text`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(
      appearanceModule.resolveReadableAccentTextColor(
        "#5EACFF",
        "#17191C",
        "#F3F4F6"
      )
    ).toBe("#5EACFF");
  });
});
