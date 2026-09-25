export const LONG_EDITOR_PANE_PREFERENCES_STORAGE_KEY =
  "deepwrite:long-editor-pane-preferences:v1";

export const LONG_EDITOR_LIST_MIN_WIDTH = 170;
export const LONG_EDITOR_LIST_MAX_WIDTH = 1600;

export interface LongEditorPanePreferences {
  entryListWidth?: number;
  storyPlotListWidth?: number;
}

interface LongEditorPanePreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isValidWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= LONG_EDITOR_LIST_MIN_WIDTH &&
    value <= LONG_EDITOR_LIST_MAX_WIDTH
  );
}

export function parseLongEditorPanePreferences(
  storedValue: string | null
): LongEditorPanePreferences {
  if (!storedValue) return {};
  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== 1) return {};

    const preferences: LongEditorPanePreferences = {};
    if (candidate.entryListWidth !== undefined) {
      if (!isValidWidth(candidate.entryListWidth)) return {};
      preferences.entryListWidth = candidate.entryListWidth;
    }
    if (candidate.storyPlotListWidth !== undefined) {
      if (!isValidWidth(candidate.storyPlotListWidth)) return {};
      preferences.storyPlotListWidth = candidate.storyPlotListWidth;
    }
    return preferences;
  } catch {
    return {};
  }
}

export function loadLongEditorPanePreferences(
  storage: Pick<LongEditorPanePreferencesStorage, "getItem">
): LongEditorPanePreferences {
  try {
    return parseLongEditorPanePreferences(
      storage.getItem(LONG_EDITOR_PANE_PREFERENCES_STORAGE_KEY)
    );
  } catch {
    return {};
  }
}

export function saveLongEditorPanePreferences(
  storage: Pick<LongEditorPanePreferencesStorage, "setItem">,
  preferences: LongEditorPanePreferences
): boolean {
  try {
    storage.setItem(
      LONG_EDITOR_PANE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, ...preferences })
    );
    return true;
  } catch {
    return false;
  }
}
