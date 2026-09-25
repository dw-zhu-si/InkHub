import type { CatalogDraftRecovery } from "@deepwrite/contracts";
import type { EditorDraftState } from "../types/workspace";

const MIN_DATE_TIMESTAMP = -8_640_000_000_000_000;
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000;

export interface DraftRecoveryClock {
  observe(value: string | undefined): void;
  next(): string;
}

function parseDraftRecoveryTimestamp(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeClockValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    MAX_DATE_TIMESTAMP,
    Math.max(MIN_DATE_TIMESTAMP, Math.trunc(value))
  );
}

/**
 * Creates the monotonic clock used to order draft-recovery snapshots.
 *
 * The injected time source keeps the helper deterministic in tests. Observed
 * recovery timestamps advance the clock as well, so a generated timestamp
 * never moves behind a valid timestamp already present in a recovery payload.
 */
export function createDraftRecoveryClock(
  now: () => number = Date.now
): DraftRecoveryClock {
  let latestTimestamp: number | null = null;

  return {
    observe(value) {
      const timestamp = parseDraftRecoveryTimestamp(value);
      if (timestamp === null) return;
      latestTimestamp = Math.max(latestTimestamp ?? timestamp, timestamp);
    },
    next() {
      const currentTimestamp = normalizeClockValue(now());
      const nextTimestamp =
        latestTimestamp === null
          ? currentTimestamp
          : Math.max(currentTimestamp, latestTimestamp + 1);

      // Valid contract timestamps cannot exceed the ECMAScript Date range.
      // Staying at its upper bound is the only safe fallback after observing
      // that theoretical limit; ordinary timestamps remain strictly monotonic.
      latestTimestamp = normalizeClockValue(nextTimestamp);
      return new Date(latestTimestamp).toISOString();
    }
  };
}

/** Returns an immutable recovery payload containing only unsaved editor data. */
export function dirtyDraftRecovery(
  drafts: Readonly<Record<string, EditorDraftState>>
): CatalogDraftRecovery {
  return Object.fromEntries(
    Object.entries(drafts).flatMap(([id, draft]) =>
      draft.dirty
        ? [
            [
              id,
              {
                title: draft.title,
                content: draft.content,
                dirty: true as const,
                ...(typeof draft.recoveryUpdatedAt === "string"
                  ? { recoveryUpdatedAt: draft.recoveryUpdatedAt }
                  : {}),
                ...(typeof draft.baseRevision === "string"
                  ? { baseRevision: draft.baseRevision }
                  : {}),
                ...(typeof draft.baseProjectRevision === "number"
                  ? { baseProjectRevision: draft.baseProjectRevision }
                  : {})
              }
            ] as const
          ]
        : []
    )
  );
}

interface RecoveryCandidate {
  draft: CatalogDraftRecovery[string];
  timestamp: number | null;
}

/**
 * Reconciles the persisted Core snapshot with the renderer's live fallback.
 * Valid timestamps are ordered newest-first. Equal or incomparable timestamps
 * prefer the live snapshot because it represents the latest in-window state.
 */
export function mergeRecoveredEditorDrafts(
  coreDrafts: CatalogDraftRecovery,
  liveDrafts: CatalogDraftRecovery,
  clock: DraftRecoveryClock
): Record<string, EditorDraftState> {
  const selected = new Map<string, RecoveryCandidate>();

  for (const drafts of [coreDrafts, liveDrafts]) {
    for (const [id, draft] of Object.entries(drafts)) {
      if (!draft.dirty) continue;

      const timestamp = parseDraftRecoveryTimestamp(draft.recoveryUpdatedAt);
      clock.observe(draft.recoveryUpdatedAt);
      const existing = selected.get(id);

      if (
        existing &&
        existing.timestamp !== null &&
        timestamp !== null &&
        timestamp < existing.timestamp
      ) {
        continue;
      }
      selected.set(id, { draft, timestamp });
    }
  }

  return Object.fromEntries(
    [...selected.entries()].map(([id, { draft, timestamp }]) => [
      id,
      {
        title: draft.title,
        content: draft.content,
        dirty: true,
        recoveryUpdatedAt:
          timestamp === null ? clock.next() : draft.recoveryUpdatedAt!,
        ...(typeof draft.baseRevision === "string"
          ? { baseRevision: draft.baseRevision }
          : {}),
        ...(typeof draft.baseProjectRevision === "number"
          ? { baseProjectRevision: draft.baseProjectRevision }
          : {})
      }
    ])
  );
}
