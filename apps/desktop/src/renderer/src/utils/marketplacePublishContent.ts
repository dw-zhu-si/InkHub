import type {
  CatalogReadDocumentInput,
  CatalogReadDocumentResult,
  MarketplacePublishEntry,
  MarketplacePublishGroupLibrary,
  MarketplaceSkillStage,
  SkillLibrary
} from "@deepwrite/contracts";

export interface MarketplacePublishDocumentReader {
  readDocument(
    input: CatalogReadDocumentInput
  ): Promise<Pick<CatalogReadDocumentResult, "content">>;
}

export interface MarketplacePublishSkillLibrarySource {
  id: string;
  title: string;
  overview?: string;
  skillKind: MarketplacePublishGroupLibrary["kind"];
  skillType: MarketplacePublishGroupLibrary["libraryType"];
  entries: ReadonlyArray<{
    id: string;
    stageId: MarketplaceSkillStage;
    title: string;
  }>;
}

export interface LoadedMarketplacePublishLibrary {
  title: string;
  overview: string;
  kind: MarketplacePublishGroupLibrary["kind"];
  libraryType: MarketplacePublishGroupLibrary["libraryType"];
  entries: MarketplacePublishEntry[];
  emptyTitles: string[];
}

/**
 * Catalog index snapshots keep skill bodies as empty strings. Publish payloads
 * must read the on-disk Markdown instead of copying the index `body` field.
 */
export async function readMarketplaceCatalogText(
  reader: MarketplacePublishDocumentReader,
  input: CatalogReadDocumentInput
): Promise<string> {
  const result = await reader.readDocument(input);
  return result.content;
}

export async function loadMarketplacePublishSkillContent(
  reader: MarketplacePublishDocumentReader,
  libraryId: string,
  entryId: string
): Promise<string> {
  return readMarketplaceCatalogText(reader, {
    projectId: libraryId,
    target: "document",
    documentId: entryId
  });
}

export async function loadMarketplacePublishLibraryOverview(
  reader: MarketplacePublishDocumentReader,
  libraryId: string
): Promise<string> {
  return readMarketplaceCatalogText(reader, {
    projectId: libraryId,
    target: "overview"
  });
}

export async function loadMarketplacePublishLibraryContent(
  reader: MarketplacePublishDocumentReader,
  library: MarketplacePublishSkillLibrarySource
): Promise<LoadedMarketplacePublishLibrary> {
  const [overview, ...contents] = await Promise.all([
    loadMarketplacePublishLibraryOverview(reader, library.id),
    ...library.entries.map((entry) =>
      loadMarketplacePublishSkillContent(reader, library.id, entry.id)
    )
  ]);
  const emptyTitles: string[] = [];
  const entries: MarketplacePublishEntry[] = [];
  for (const [index, entry] of library.entries.entries()) {
    const content = contents[index] ?? "";
    if (!content.trim()) {
      emptyTitles.push(entry.title);
      continue;
    }
    entries.push({
      stageId: entry.stageId,
      title: entry.title,
      content
    });
  }
  return {
    title: library.title,
    overview,
    kind: library.skillKind,
    libraryType: library.skillType,
    entries,
    emptyTitles
  };
}

export function skillLibraryPublishSource(
  library: Pick<
    SkillLibrary,
    "id" | "title" | "skillKind" | "skillType" | "entries"
  >
): MarketplacePublishSkillLibrarySource {
  return {
    id: library.id,
    title: library.title,
    skillKind: library.skillKind,
    skillType: library.skillType,
    entries: library.entries.map((entry) => ({
      id: entry.id,
      stageId: entry.stageId,
      title: entry.title
    }))
  };
}

export function formatMarketplacePublishEmptyContentMessage(
  titles: readonly string[]
): string {
  if (titles.length === 0) {
    return "技能正文为空，无法发布。请确认本地技能已填写内容后再提交。";
  }
  if (titles.length === 1) {
    return `技能「${titles[0]}」没有正文，无法发布。`;
  }
  const preview = titles.slice(0, 3).join("、");
  const suffix = titles.length > 3 ? `等 ${titles.length} 条` : "";
  return `技能「${preview}」${suffix}没有正文，无法发布。`;
}

export function formatMarketplaceContractError(message: string): string | null {
  try {
    const parsed: unknown = JSON.parse(message);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const issues = parsed.filter(
      (item): item is { code?: unknown; path?: unknown } =>
        typeof item === "object" && item !== null
    );
    if (issues.length !== parsed.length) return null;
    const emptyContent = issues.some((item) => {
      if (item.code !== "too_small" || !Array.isArray(item.path)) return false;
      return item.path.at(-1) === "content";
    });
    if (emptyContent) {
      return formatMarketplacePublishEmptyContentMessage([]);
    }
    return "提交内容未通过校验，请检查标题和技能正文。";
  } catch {
    return null;
  }
}
