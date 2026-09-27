import { describe, expect, it, vi } from "vitest";
import type { InkHubNovelChapterPage } from "@deepwrite/contracts";
import {
  calculateInkHubReadingPosition,
  loadInkHubChapterThroughOffset,
  scrollFractionForLoadedOffset
} from "./inkhubReadingProgress";

const TOTAL_CHARACTERS = 250_000;

function chapterPage(offset: number, limit: number): InkHubNovelChapterPage {
  const endOffset = Math.min(TOTAL_CHARACTERS, offset + limit);
  return {
    entryId: "novel-one",
    chapterId: "chapter-long",
    title: "超长章节",
    content: "字".repeat(endOffset - offset),
    startOffset: offset,
    endOffset,
    totalCharacters: TOTAL_CHARACTERS,
    nextOffset: endOffset < TOTAL_CHARACTERS ? endOffset : null,
    previousChapterId: null,
    nextChapterId: null,
    sourceRevision: "a".repeat(64),
    readOnly: true
  };
}

describe("InkHub long-chapter reading progress", () => {
  it("loads 100k pages until the restored character offset is covered", async () => {
    const readPage = vi.fn(async (offset: number, limit: number) =>
      chapterPage(offset, limit)
    );

    const loaded = await loadInkHubChapterThroughOffset(
      readPage,
      175_000,
      100_000
    );

    expect(readPage.mock.calls).toEqual([
      [0, 100_000],
      [100_000, 100_000]
    ]);
    expect(loaded.content).toHaveLength(200_000);
    expect(loaded.loadedEndOffset).toBe(200_000);
    expect(loaded.nextOffset).toBe(200_000);
    expect(scrollFractionForLoadedOffset(175_000, loaded.loadedEndOffset)).toBe(0.875);
  });

  it("does not treat the bottom of the first 100k block as the end of a 250k chapter", () => {
    const position = calculateInkHubReadingPosition({
      scrollTop: 900,
      scrollHeight: 1_000,
      clientHeight: 100,
      loadedEndOffset: 100_000,
      totalCharacters: TOTAL_CHARACTERS
    });

    expect(position.characterOffset).toBe(100_000);
    expect(position.scrollFraction).toBe(0.4);
  });
});
