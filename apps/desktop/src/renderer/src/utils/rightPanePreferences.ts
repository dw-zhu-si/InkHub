export const RIGHT_PANE_PREFERENCES_STORAGE_KEY =
  "deepwrite:right-pane-preferences:v1";
export const RIGHT_PANE_MIN_WIDTH = 320;
export const RIGHT_PANE_MAX_WIDTH = 1013;

export interface RightPanePreferences {
  widths: Record<string, number>;
}

interface RightPanePreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RightPaneStageDocument {
  domain: string;
  workspaceType?: "short" | "script" | "long";
  stageId?: string;
}

const DEFAULT_RIGHT_PANE_PREFERENCES: RightPanePreferences = { widths: {} };

function isValidWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= RIGHT_PANE_MIN_WIDTH &&
    value <= RIGHT_PANE_MAX_WIDTH
  );
}

/**
 * Short fiction and scripts remember one width per major workspace area:
 * character, plot, and draft. All configurable plot stages intentionally share
 * the plot width. Long-form keeps its existing root-specific layout memory.
 * Writing types remain isolated because similarly named areas can have
 * different layouts.
 */
export function rightPanePreferenceKey(
  document: RightPaneStageDocument
): string | undefined {
  if (
    document.domain !== "creation" ||
    (document.workspaceType !== "short" &&
      document.workspaceType !== "script" &&
      document.workspaceType !== "long") ||
    typeof document.stageId !== "string" ||
    document.stageId.trim().length === 0
  ) {
    return undefined;
  }
  const stageId = document.stageId.trim();
  if (document.workspaceType === "long") {
    return `long:${stageId}`;
  }
  const area =
    stageId === "character_design"
      ? "character"
      : stageId === "draft"
        ? "draft"
        : "plot";
  return `${document.workspaceType}:${area}`;
}

export function parseRightPanePreferences(
  storedValue: string | null
): RightPanePreferences {
  if (!storedValue) return { widths: {} };
  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { widths: {} };
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.version !== 1 ||
      !candidate.widths ||
      typeof candidate.widths !== "object" ||
      Array.isArray(candidate.widths)
    ) {
      return { widths: {} };
    }
    const entries = Object.entries(candidate.widths as Record<string, unknown>);
    if (
      entries.some(
        ([key, width]) => key.trim().length === 0 || !isValidWidth(width)
      )
    ) {
      return { widths: {} };
    }
    return { widths: Object.fromEntries(entries) as Record<string, number> };
  } catch {
    return { widths: {} };
  }
}

export function loadRightPanePreferences(
  storage: Pick<RightPanePreferencesStorage, "getItem">
): RightPanePreferences {
  try {
    return parseRightPanePreferences(storage.getItem(RIGHT_PANE_PREFERENCES_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_RIGHT_PANE_PREFERENCES, widths: {} };
  }
}

export function saveRightPanePreferences(
  storage: Pick<RightPanePreferencesStorage, "setItem">,
  preferences: RightPanePreferences
): boolean {
  try {
    storage.setItem(
      RIGHT_PANE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, widths: preferences.widths })
    );
    return true;
  } catch {
    return false;
  }
}
