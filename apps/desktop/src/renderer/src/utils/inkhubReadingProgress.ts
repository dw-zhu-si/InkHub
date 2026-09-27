import type { InkHubNovelChapterPage } from "@deepwrite/contracts";

export type InkHubChapterPageReader = (
  offset: number,
  limit: number
) => Promise<InkHubNovelChapterPage>;

export interface InkHubLoadedChapterContent {
  initialPage: InkHubNovelChapterPage;
  content: string;
  loadedEndOffset: number;
  nextOffset: number | null;
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export async function loadInkHubChapterThroughOffset(
  readPage: InkHubChapterPageReader,
  targetOffset: number,
  pageSize = 100_000
): Promise<InkHubLoadedChapterContent> {
  const initialPage = await readPage(0, pageSize);
  const boundedTarget = Math.max(
    0,
    Math.min(initialPage.totalCharacters, Math.floor(targetOffset))
  );
  let currentPage = initialPage;
  let content = initialPage.content;

  while (
    currentPage.nextOffset !== null &&
    currentPage.endOffset < boundedTarget
  ) {
    const expectedOffset = currentPage.nextOffset;
    const nextPage = await readPage(expectedOffset, pageSize);
    if (
      nextPage.entryId !== initialPage.entryId ||
      nextPage.chapterId !== initialPage.chapterId ||
      nextPage.sourceRevision !== initialPage.sourceRevision ||
      nextPage.totalCharacters !== initialPage.totalCharacters ||
      nextPage.startOffset !== expectedOffset ||
      nextPage.endOffset <= currentPage.endOffset
    ) {
      throw new Error("章节分页在恢复阅读进度时发生变化，请重新打开本章。");
    }
    content += nextPage.content;
    currentPage = nextPage;
  }

  return {
    initialPage,
    content,
    loadedEndOffset: currentPage.endOffset,
    nextOffset: currentPage.nextOffset
  };
}

export function scrollFractionForLoadedOffset(
  characterOffset: number,
  loadedEndOffset: number
): number {
  if (loadedEndOffset <= 0) return 0;
  return clampFraction(characterOffset / loadedEndOffset);
}

export function calculateInkHubReadingPosition(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  loadedEndOffset: number;
  totalCharacters: number;
}): { characterOffset: number; scrollFraction: number } {
  const available = Math.max(1, input.scrollHeight - input.clientHeight);
  const loadedFraction = clampFraction(input.scrollTop / available);
  const loadedEndOffset = Math.max(
    0,
    Math.min(input.loadedEndOffset, input.totalCharacters)
  );
  const characterOffset = Math.round(loadedEndOffset * loadedFraction);
  return {
    characterOffset,
    scrollFraction: input.totalCharacters > 0
      ? clampFraction(characterOffset / input.totalCharacters)
      : 0
  };
}
