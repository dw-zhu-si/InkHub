import type { EditorDraftState } from "../types/workspace";

export function legacyBookDraftRecoveryKey(bookId: string): string {
  return [
    "catalog",
    "book-document",
    encodeURIComponent(bookId),
    "draft"
  ].join(":");
}

/**
 * Keeps the normal Catalog index path independent from the legacy Markdown
 * parser. The full aggregate snapshot and migration module are needed only
 * while one of these retired combined-draft entries is still dirty.
 */
export function hasDirtyLegacyDraftRecoveries(
  drafts: Readonly<Record<string, EditorDraftState>>,
  snapshot: Readonly<{ books: ReadonlyArray<Readonly<{ id: string }>> }>
): boolean {
  return snapshot.books.some(
    (book) => drafts[legacyBookDraftRecoveryKey(book.id)]?.dirty === true
  );
}
