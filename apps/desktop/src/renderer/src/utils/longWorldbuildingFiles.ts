import type {
  LongFileId,
  LongWorkspaceFileReference,
  LongWorldbuildingCategory
} from "@deepwrite/contracts";

/**
 * Returns every Markdown file owned by the worldbuilding index.
 * List categories own both an optional overview and their item files.
 */
export function longWorldbuildingFiles(
  categories: readonly LongWorldbuildingCategory[]
): LongWorkspaceFileReference[] {
  return categories.flatMap((category) =>
    category.format === "text"
      ? [category.file]
      : [
          ...(category.overview ? [category.overview] : []),
          ...category.items.map(({ file }) => file)
        ]
  );
}

export function findLongWorldbuildingFile(
  categories: readonly LongWorldbuildingCategory[],
  fileId: LongFileId
): LongWorkspaceFileReference | undefined {
  return longWorldbuildingFiles(categories).find(({ id }) => id === fileId);
}
