import { describe, expect, it } from "vitest";
import {
  LONG_EDITOR_PANE_PREFERENCES_STORAGE_KEY,
  loadLongEditorPanePreferences,
  parseLongEditorPanePreferences,
  saveLongEditorPanePreferences
} from "./longEditorPanePreferences";

describe("long editor pane preferences", () => {
  it("falls back when stored data is missing or malformed", () => {
    expect(parseLongEditorPanePreferences(null)).toEqual({});
    expect(parseLongEditorPanePreferences("not-json")).toEqual({});
    expect(
      parseLongEditorPanePreferences(
        JSON.stringify({ version: 2, entryListWidth: 360 })
      )
    ).toEqual({});
    expect(
      parseLongEditorPanePreferences(
        JSON.stringify({ version: 1, entryListWidth: 120 })
      )
    ).toEqual({});
    expect(
      parseLongEditorPanePreferences(
        JSON.stringify({ version: 1, storyPlotListWidth: "360" })
      )
    ).toEqual({});
  });

  it("supports either width independently", () => {
    expect(
      parseLongEditorPanePreferences(
        JSON.stringify({ version: 1, entryListWidth: 420 })
      )
    ).toEqual({ entryListWidth: 420 });
    expect(
      parseLongEditorPanePreferences(
        JSON.stringify({ version: 1, storyPlotListWidth: 280 })
      )
    ).toEqual({ storyPlotListWidth: 280 });
  });

  it("persists and restores both widths", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const preferences = { entryListWidth: 430, storyPlotListWidth: 310 };

    expect(saveLongEditorPanePreferences(storage, preferences)).toBe(true);
    expect(values.get(LONG_EDITOR_PANE_PREFERENCES_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, ...preferences })
    );
    expect(loadLongEditorPanePreferences(storage)).toEqual(preferences);
  });

  it("does not throw when storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      }
    };

    expect(loadLongEditorPanePreferences(storage)).toEqual({});
    expect(saveLongEditorPanePreferences(storage, {})).toBe(false);
  });
});
