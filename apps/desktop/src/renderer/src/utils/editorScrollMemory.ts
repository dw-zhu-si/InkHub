import type { WorkspaceDocument } from "../types/workspace";

export type EditorScrollView = "edit" | "preview";

interface EditorScrollPosition {
  edit: number;
  preview: number;
}

const MAX_REMEMBERED_DOCUMENTS = 500;
const scrollPositions = new Map<string, EditorScrollPosition>();

export function editorScrollMemoryKey(
  document: Pick<
    WorkspaceDocument,
    "domain" | "id" | "libraryId" | "workspaceId"
  >
): string {
  return [
    document.workspaceId ?? "",
    document.libraryId ?? "",
    document.domain,
    document.id
  ].join("\u0000");
}

export function rememberEditorScrollPosition(
  key: string,
  view: EditorScrollView,
  scrollTop: number
): void {
  const position = scrollPositions.get(key) ?? { edit: 0, preview: 0 };
  position[view] = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;

  // Refresh insertion order so the least recently viewed document is evicted first.
  scrollPositions.delete(key);
  scrollPositions.set(key, position);
  if (scrollPositions.size <= MAX_REMEMBERED_DOCUMENTS) return;

  const oldestKey = scrollPositions.keys().next().value;
  if (oldestKey !== undefined) scrollPositions.delete(oldestKey);
}

export function recalledEditorScrollPosition(
  key: string,
  view: EditorScrollView
): number {
  return scrollPositions.get(key)?.[view] ?? 0;
}

export function clearEditorScrollMemory(): void {
  scrollPositions.clear();
}
