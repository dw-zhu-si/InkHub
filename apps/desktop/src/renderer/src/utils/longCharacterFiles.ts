import type {
  LongFileId,
  LongWorkspaceFileReference,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";

/**
 * Returns every Markdown file owned by the character-design index.
 * The stage overview is listed before per-character documents.
 */
export function longCharacterFiles(
  index: Pick<
    LongWorkspaceIndexSnapshot,
    "characterOverview" | "characterFiles"
  >
): LongWorkspaceFileReference[] {
  return [
    ...(index.characterOverview ? [index.characterOverview] : []),
    ...index.characterFiles.flatMap((entry) => [
      entry.coreProfile,
      entry.relationships,
      entry.currentState,
      entry.history
    ])
  ];
}

export function findLongCharacterFile(
  index: Pick<
    LongWorkspaceIndexSnapshot,
    "characterOverview" | "characterFiles"
  >,
  fileId: LongFileId
): LongWorkspaceFileReference | undefined {
  return longCharacterFiles(index).find(({ id }) => id === fileId);
}
