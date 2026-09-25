import type {
  LongChapterReadiness,
  LongWorkspaceIndexSnapshot,
  LongWritingScope
} from "@deepwrite/contracts";
import type { LongAgentToolDetails } from "./index";

export function isLongAgentToolDetails(
  value: unknown
): value is LongAgentToolDetails {
  if (!value || typeof value !== "object" || !("kind" in value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "none" ||
    kind === "long-mutation-proposal" ||
    kind === "long-worldbuilding-file-proposal" ||
    kind === "long-character-file-proposal" ||
    kind === "long-continuity-file-proposal" ||
    kind === "long-chapter-write-proposal" ||
    kind === "long-ledger-commit-proposal" ||
    kind === "long-chapter-dispatch-proposal"
  );
}
export function orderedLongChapterCards(
  index: LongWorkspaceIndexSnapshot
): LongWorkspaceIndexSnapshot["plot"]["chapterCards"] {
  const volumeOrder = new Map(
    index.plot.volumes.map((volume) => [volume.id, volume.order])
  );
  return [...index.plot.chapterCards].sort(
    (left, right) =>
      (volumeOrder.get(left.volumeId) ?? Number.MAX_SAFE_INTEGER) -
        (volumeOrder.get(right.volumeId) ?? Number.MAX_SAFE_INTEGER) ||
      left.narrativeOrder - right.narrativeOrder ||
      left.id.localeCompare(right.id)
  );
}

/** @internal Exported for deterministic ordering regression tests. */
export function selectNextLongChapterForDispatch(
  index: LongWorkspaceIndexSnapshot
): LongWorkspaceIndexSnapshot["plot"]["chapterCards"][number] | undefined {
  const chapters = index.chapters ?? [];
  if (chapters.length === 0) {
    return orderedLongChapterCards(index)[index.ledger.commits.length];
  }
  return orderedLongChapterCards(index).find((chapter) =>
    chapters.some(
      (entry) =>
        entry.chapterCardId === chapter.id && entry.bodyStatus === "empty"
    )
  );
}

export interface SelectLongWritingScopeInput {
  scope: LongWritingScope;
  chapterCardId?: string;
  arcId?: string;
  volumeId?: string;
}

/**
 * Resolves only a continuous, unwritten suffix. Arc and volume scheduling
 * deliberately stop at the first chapter outside the requested scope so the
 * coordinator can never skip an intervening chapter.
 */
export function selectLongChaptersForWritingScope(
  index: LongWorkspaceIndexSnapshot,
  input: SelectLongWritingScopeInput
): LongWorkspaceIndexSnapshot["plot"]["chapterCards"] {
  if (
    input.scope !== "chapter" &&
    input.scope !== "arc" &&
    input.scope !== "volume"
  ) {
    throw new Error(
      "Long writing scope must be chapter, arc, or volume; whole-book scheduling is not supported."
    );
  }
  if (
    (input.scope === "chapter" && (input.arcId || input.volumeId)) ||
    (input.scope === "arc" && (input.chapterCardId || input.volumeId)) ||
    (input.scope === "volume" && (input.chapterCardId || input.arcId))
  ) {
    throw new Error(
      "Long writing scope includes a selector that belongs to another scope."
    );
  }
  const ordered = orderedLongChapterCards(index);
  const chapterFiles = index.chapters ?? [];
  if (chapterFiles.length === 0) {
    const legacyFirstIndex = index.ledger.commits.length;
    const legacyFirst = ordered[legacyFirstIndex];
    if (!legacyFirst) return [];
  }
  const firstIndex = ordered.findIndex((chapter) =>
    chapterFiles.some(
      (entry) =>
        entry.chapterCardId === chapter.id && entry.bodyStatus === "empty"
    )
  );
  const resolvedFirstIndex =
    firstIndex < 0 && chapterFiles.length === 0
      ? index.ledger.commits.length
      : firstIndex;
  if (resolvedFirstIndex < 0) return [];
  const first = ordered[resolvedFirstIndex];
  if (!first) return [];

  if (input.scope === "chapter") {
    if (input.chapterCardId && input.chapterCardId !== first.id) {
      throw new Error(
        "Chapter writing must start from the continuous next chapter."
      );
    }
    return [first];
  }

  if (input.scope === "arc") {
    const arcId = input.arcId ?? first.primaryArcId ?? undefined;
    if (!arcId || first.primaryArcId !== arcId) {
      throw new Error(
        "Arc writing must target the continuous next chapter's primary arc."
      );
    }
    const chapters: typeof ordered = [];
    for (const chapter of ordered.slice(resolvedFirstIndex)) {
      if (
        chapter.volumeId !== first.volumeId ||
        chapter.primaryArcId !== arcId
      ) {
        break;
      }
      chapters.push(chapter);
    }
    return chapters;
  }

  const volumeId = input.volumeId ?? first.volumeId;
  if (volumeId !== first.volumeId) {
    throw new Error(
      "Volume writing must target the continuous next chapter's volume."
    );
  }
  const chapters: typeof ordered = [];
  for (const chapter of ordered.slice(resolvedFirstIndex)) {
    if (chapter.volumeId !== volumeId) break;
    chapters.push(chapter);
  }
  return chapters;
}

export function classifyLongChapterReadiness(
  input: {
    chapterCardId: string;
    title: string;
    body: string;
    characterState: string;
    handoff: string;
  }
): LongChapterReadiness {
  const missingFiles: LongChapterReadiness["missingFiles"] = [];
  if (!input.body.trim()) missingFiles.push("body");
  return {
    chapterCardId: input.chapterCardId,
    title: input.title,
    status:
      missingFiles.length === 1
        ? "empty"
        : "ready_to_commit",
    missingFiles
  };
}
