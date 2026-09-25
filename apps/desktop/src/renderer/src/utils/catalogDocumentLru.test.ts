import { describe, expect, it } from "vitest";
import { createCatalogDocumentLru } from "./catalogDocumentLru";

interface CachedDocument {
  readonly id: string;
  readonly content: string;
  readonly revision: number;
}

function document(
  id: string,
  content: string,
  revision = 1
): CachedDocument {
  return { id, content, revision };
}

describe("catalog document LRU", () => {
  it("promotes a hit so the least-recently used entry is evicted", () => {
    const cache = createCatalogDocumentLru<CachedDocument>({
      maxEntries: 2,
      maxRetainedCharacters: 100
    });
    const first = document("first", "甲");
    const second = document("second", "乙");

    cache.set(first.id, first);
    cache.set(second.id, second);
    expect(cache.get(first.id)).toBe(first);
    cache.set("third", document("third", "丙"));

    expect(cache.get(second.id)).toBeUndefined();
    expect(cache.get(first.id)).toBe(first);
    expect(cache.get("third")?.content).toBe("丙");
  });

  it("updates an existing key, refreshes its order, and accounts for new text", () => {
    const cache = createCatalogDocumentLru<CachedDocument>({
      maxEntries: 3,
      maxRetainedCharacters: 6
    });
    cache.set("a", document("a", "甲乙丙"));
    cache.set("b", document("b", "丁戊己"));

    const updated = document("a", "甲乙丙丁", 2);
    expect(cache.set("a", updated)).toBe(true);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(updated);
    expect(cache.stats()).toEqual({
      entries: 1,
      retainedCharacters: 4,
      maxEntries: 3,
      maxRetainedCharacters: 6
    });
  });

  it("enforces entry and retained-character limits together", () => {
    const cache = createCatalogDocumentLru<CachedDocument>({
      maxEntries: 2,
      maxRetainedCharacters: 5
    });
    cache.set("a", document("a", "甲乙"));
    cache.set("b", document("b", "丙丁"));
    cache.set("c", document("c", "戊己庚"));

    expect(cache.get("a")).toBeUndefined();
    expect(cache.stats()).toMatchObject({
      entries: 2,
      retainedCharacters: 5
    });

    cache.set("d", document("d", ""));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")?.content).toBe("戊己庚");
    expect(cache.get("d")?.content).toBe("");
    expect(cache.stats().retainedCharacters).toBe(3);
  });

  it("rejects oversized items without evicting unrelated cached documents", () => {
    const cache = createCatalogDocumentLru<CachedDocument>({
      maxEntries: 3,
      maxRetainedCharacters: 4
    });
    const retained = document("retained", "甲乙");
    cache.set(retained.id, retained);

    for (let index = 0; index < 10; index += 1) {
      expect(
        cache.set(`oversized-${index}`, document(`oversized-${index}`, "一二三四五"))
      ).toBe(false);
    }

    expect(cache.get(retained.id)).toBe(retained);
    expect(cache.stats()).toEqual({
      entries: 1,
      retainedCharacters: 2,
      maxEntries: 3,
      maxRetainedCharacters: 4
    });
  });

  it("removes a stale value when its oversized replacement cannot be cached", () => {
    const cache = createCatalogDocumentLru<CachedDocument>({
      maxEntries: 2,
      maxRetainedCharacters: 3
    });
    cache.set("document", document("document", "旧"));

    expect(cache.set("document", document("document", "新的正文", 2))).toBe(false);
    expect(cache.get("document")).toBeUndefined();
    expect(cache.stats().retainedCharacters).toBe(0);
  });

  it("supports explicit deletion, clearing, and frozen point-in-time stats", () => {
    const cache = createCatalogDocumentLru<CachedDocument>({
      maxEntries: 4,
      maxRetainedCharacters: 40
    });
    cache.set("a", document("a", "甲"));
    cache.set("b", document("b", "乙丙"));

    expect(cache.delete("missing")).toBe(false);
    expect(cache.delete("a")).toBe(true);
    const beforeClear = cache.stats();
    expect(Object.isFrozen(beforeClear)).toBe(true);
    expect(beforeClear.entries).toBe(1);
    expect(beforeClear.retainedCharacters).toBe(2);

    cache.clear();
    expect(beforeClear.entries).toBe(1);
    expect(cache.stats()).toEqual({
      entries: 0,
      retainedCharacters: 0,
      maxEntries: 4,
      maxRetainedCharacters: 40
    });
  });

  it("supports a disabled zero-capacity cache", () => {
    const cache = createCatalogDocumentLru<CachedDocument>({
      maxEntries: 0,
      maxRetainedCharacters: 0
    });

    expect(cache.set("empty", document("empty", ""))).toBe(false);
    expect(cache.stats().entries).toBe(0);
  });

  it("rejects invalid limits", () => {
    expect(() => createCatalogDocumentLru({ maxEntries: -1 })).toThrow(RangeError);
    expect(() =>
      createCatalogDocumentLru({ maxRetainedCharacters: Number.POSITIVE_INFINITY })
    ).toThrow(RangeError);
  });
});
