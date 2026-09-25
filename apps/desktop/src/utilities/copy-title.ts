const COPY_SUFFIX_PATTERN = /^(.*)copy(\d+)$/iu;

function comparableTitle(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

/**
 * Returns the first available `copyN` title for a project collection.
 * Existing `copyN` suffixes are treated as copies of the same base title.
 */
export function nextCopyTitle(
  sourceTitle: string,
  existingTitles: readonly string[],
  maxCharacters = 256
): string {
  const normalized = sourceTitle.normalize("NFC").trim();
  const match = normalized.match(COPY_SUFFIX_PATTERN);
  const base = match?.[1]?.trim() || normalized;
  const parsedSourceIndex = Number(match?.[2]);
  const firstIndex =
    Number.isSafeInteger(parsedSourceIndex) && parsedSourceIndex >= 1
      ? parsedSourceIndex + 1
      : 1;
  const occupied = new Set(existingTitles.map(comparableTitle));

  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    const index = firstIndex + attempt;
    const suffix = `copy${index}`;
    const maximumBaseCharacters = Math.max(
      1,
      maxCharacters - [...suffix].length
    );
    const shortenedBase = [...base]
      .slice(0, maximumBaseCharacters)
      .join("")
      .trimEnd();
    const candidate = `${shortenedBase || "项目"}${suffix}`;
    if (!occupied.has(comparableTitle(candidate))) {
      return candidate;
    }
  }

  throw new Error("无法为副本生成不重复的名称。");
}
