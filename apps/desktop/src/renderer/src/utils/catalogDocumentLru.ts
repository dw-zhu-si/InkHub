export interface CatalogDocumentLruValue {
  /**
   * Document text retained by the cache. Capacity is measured with the
   * string's UTF-16 length so accounting remains O(1) for large documents.
   */
  readonly content: string;
}

export interface CatalogDocumentLruOptions {
  maxEntries?: number;
  maxRetainedCharacters?: number;
}

export interface CatalogDocumentLruStats {
  readonly entries: number;
  readonly retainedCharacters: number;
  readonly maxEntries: number;
  readonly maxRetainedCharacters: number;
}

export interface CatalogDocumentLru<
  Value extends CatalogDocumentLruValue = CatalogDocumentLruValue
> {
  /** Returns the cached value and promotes it to the most-recent position. */
  get(key: string): Readonly<Value> | undefined;
  /**
   * Stores an immutable document value. Returns false when the value cannot
   * fit within the configured limits. An oversized replacement also removes
   * the stale value previously stored under the same key.
   */
  set(key: string, value: Readonly<Value>): boolean;
  delete(key: string): boolean;
  clear(): void;
  /** Returns a frozen point-in-time snapshot; no internal Map is exposed. */
  stats(): Readonly<CatalogDocumentLruStats>;
}

export const DEFAULT_CATALOG_DOCUMENT_LRU_MAX_ENTRIES = 64;
export const DEFAULT_CATALOG_DOCUMENT_LRU_MAX_RETAINED_CHARACTERS =
  4 * 1024 * 1024;

interface RetainedCatalogDocument<Value extends CatalogDocumentLruValue> {
  readonly value: Readonly<Value>;
  readonly characterCount: number;
}

function finiteNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return resolved;
}

/**
 * Creates a non-reactive, bounded LRU suitable for keeping inside a
 * `shallowRef`-backed store. Cached values are retained by reference and are
 * never mutated by the cache.
 */
export function createCatalogDocumentLru<
  Value extends CatalogDocumentLruValue = CatalogDocumentLruValue
>(options: CatalogDocumentLruOptions = {}): CatalogDocumentLru<Value> {
  const maxEntries = finiteNonNegativeInteger(
    options.maxEntries,
    DEFAULT_CATALOG_DOCUMENT_LRU_MAX_ENTRIES,
    "maxEntries"
  );
  const maxRetainedCharacters = finiteNonNegativeInteger(
    options.maxRetainedCharacters,
    DEFAULT_CATALOG_DOCUMENT_LRU_MAX_RETAINED_CHARACTERS,
    "maxRetainedCharacters"
  );
  const entries = new Map<string, RetainedCatalogDocument<Value>>();
  let retainedCharacters = 0;

  function remove(key: string): boolean {
    const existing = entries.get(key);
    if (!existing) return false;
    entries.delete(key);
    retainedCharacters -= existing.characterCount;
    return true;
  }

  function evictUntilBounded(): void {
    while (
      entries.size > maxEntries ||
      retainedCharacters > maxRetainedCharacters
    ) {
      const oldestKey = entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      remove(oldestKey);
    }
  }

  return {
    get(key) {
      const retained = entries.get(key);
      if (!retained) return undefined;
      // Map iteration order is insertion order. Reinsert on access so the
      // first key remains the least-recently used eviction candidate.
      entries.delete(key);
      entries.set(key, retained);
      return retained.value;
    },
    set(key, value) {
      const characterCount = value.content.length;
      if (
        maxEntries === 0 ||
        characterCount > maxRetainedCharacters
      ) {
        // Never leave a stale version behind when an update is too large to
        // cache, and never evict unrelated entries for a value we will reject.
        remove(key);
        return false;
      }

      remove(key);
      entries.set(key, { value, characterCount });
      retainedCharacters += characterCount;
      evictUntilBounded();
      return entries.has(key);
    },
    delete: remove,
    clear() {
      entries.clear();
      retainedCharacters = 0;
    },
    stats() {
      return Object.freeze({
        entries: entries.size,
        retainedCharacters,
        maxEntries,
        maxRetainedCharacters
      });
    }
  };
}
