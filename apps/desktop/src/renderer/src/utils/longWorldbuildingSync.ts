import {
  EMPTY_LONG_MARKDOWN_REVISION,
  LongWorkspaceOperationBatchSchema,
  createEmptyLongMarkdownFileReference,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  type LongDocumentWriteProposal,
  type LongFileId,
  type LongFileRevision,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceOperation,
  type LongWorkspaceOperationBatch,
  type LongWorldbuildingCategory
} from "@deepwrite/contracts";
import { createId as createSharedId } from "@deepwrite/shared";
import { isLongMigrationEvidenceCategoryId } from "../types/longWorkspace";
import { longWorldbuildingFiles } from "./longWorldbuildingFiles";

export interface LongWorldbuildingSyncBookOption {
  id: string;
  title: string;
  categoryCount: number;
}

export interface LongWorldbuildingContentByFileId {
  readonly [fileId: string]: string;
}

export interface BuildLongWorldbuildingSyncBatchInput {
  target: LongWorkspaceIndexSnapshot;
  source: LongWorkspaceIndexSnapshot;
  contents: LongWorldbuildingContentByFileId;
  updatedAt?: string;
  createId?: (prefix: string) => string;
  createFileRevision?: (content: string) => LongFileRevision | Promise<LongFileRevision>;
}

export interface LongWorldbuildingSyncBatchPlan {
  batch: LongWorkspaceOperationBatch;
  createdCategoryCount: number;
  deletedCategoryCount: number;
  writtenFileCount: number;
}

type ReadLongDocumentPage = (input: {
  bookId: string;
  fileId: LongFileId;
  offset: number;
  maxCharacters: number;
}) => Promise<{
  bookId: string;
  file: { id: LongFileId };
  offset: number;
  content: string;
  nextOffset: number | null;
}>;

/**
 * Syncable categories exclude migration-evidence rows that must stay on the
 * target book and are never imported from another long-form project.
 */
export function filterSyncableWorldbuildingCategories(
  categories: readonly LongWorldbuildingCategory[]
): LongWorldbuildingCategory[] {
  return [...categories]
    .filter((category) => !isLongMigrationEvidenceCategoryId(category.id))
    .sort((left, right) => left.order - right.order);
}

export function filterPreservedWorldbuildingCategoryIds(
  categories: readonly LongWorldbuildingCategory[]
): string[] {
  return [...categories]
    .filter((category) => isLongMigrationEvidenceCategoryId(category.id))
    .sort((left, right) => left.order - right.order)
    .map(({ id }) => id);
}

export async function createLongMarkdownFileRevision(
  content: string
): Promise<LongFileRevision> {
  if (content === "") {
    return EMPTY_LONG_MARKDOWN_REVISION;
  }
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `v2:${bytes.byteLength}:${hash}` as LongFileRevision;
}

export async function readLongDocumentFullContent(
  readDocument: ReadLongDocumentPage,
  bookId: string,
  fileId: LongFileId
): Promise<string> {
  let offset = 0;
  const chunks: string[] = [];
  while (true) {
    const page = await readDocument({
      bookId,
      fileId,
      offset,
      maxCharacters: 262_144
    });
    if (
      page.bookId !== bookId ||
      page.file.id !== fileId ||
      page.offset !== offset
    ) {
      throw new Error("世界观正文读取结果与请求不一致。");
    }
    chunks.push(page.content);
    if (page.nextOffset === null) {
      return chunks.join("");
    }
    if (page.nextOffset <= offset) {
      throw new Error("世界观正文分页游标无效。");
    }
    offset = page.nextOffset;
  }
}

export async function loadSourceWorldbuildingContents(
  readDocument: ReadLongDocumentPage,
  bookId: string,
  categories: readonly LongWorldbuildingCategory[]
): Promise<LongWorldbuildingContentByFileId> {
  const contents: Record<string, string> = {};
  for (const file of longWorldbuildingFiles(categories)) {
    contents[file.id] = await readLongDocumentFullContent(
      readDocument,
      bookId,
      file.id
    );
  }
  return contents;
}

function proposalIdForFile(fileId: string): string {
  return `proposal_sync_${fileId.replace(/[^A-Za-z0-9._:-]/gu, "_")}`;
}

async function cloneCategoryForSync(
  category: LongWorldbuildingCategory,
  order: number,
  updatedAt: string,
  contents: LongWorldbuildingContentByFileId,
  createId: (prefix: string) => string,
  createFileRevision: (
    content: string
  ) => LongFileRevision | Promise<LongFileRevision>
): Promise<{
  category: LongWorldbuildingCategory;
  writes: LongDocumentWriteProposal[];
}> {
  const writes: LongDocumentWriteProposal[] = [];
  const pushWrite = async (
    fileId: LongFileId,
    sourceFileId: LongFileId
  ): Promise<void> => {
    const content = contents[sourceFileId] ?? "";
    if (!content) return;
    const nextRevision = await createFileRevision(content);
    writes.push({
      proposalId: proposalIdForFile(fileId),
      fileId,
      mode: "create",
      expectedRevision: null,
      nextRevision,
      updatedAt,
      content,
      reason: "从其他长篇同步世界观正文"
    });
  };

  if (category.format === "text") {
    const id = createId("world");
    const file = createEmptyLongMarkdownFileReference(
      longWorldbuildingFileId(id),
      longWorldbuildingContentPath(id),
      updatedAt
    );
    await pushWrite(file.id, category.file.id);
    return {
      category: {
        id,
        title: category.title,
        order,
        format: "text",
        contentAuthority: "markdown",
        file
      },
      writes
    };
  }

  const id = createId("world");
  const overview = createEmptyLongMarkdownFileReference(
    longWorldbuildingOverviewFileId(id),
    longWorldbuildingOverviewContentPath(id),
    updatedAt
  );
  if (category.overview) {
    await pushWrite(overview.id, category.overview.id);
  }
  const items = [];
  for (const [itemIndex, item] of category.items
    .slice()
    .sort((left, right) => left.order - right.order)
    .entries()) {
    const itemId = createId("worlditem");
    const file = createEmptyLongMarkdownFileReference(
      longWorldbuildingItemFileId(itemId),
      longWorldbuildingItemContentPath(id, itemId),
      updatedAt
    );
    await pushWrite(file.id, item.file.id);
    items.push({
      id: itemId,
      title: item.title,
      order: itemIndex + 1,
      file
    });
  }
  return {
    category: {
      id,
      title: category.title,
      order,
      format: "list",
      contentAuthority: "files",
      overview,
      items
    },
    writes
  };
}

/**
 * Builds a single replace batch: delete editable target categories, recreate
 * source structure with fresh stable ids, and seed non-empty Markdown bodies.
 * Migration-evidence categories on the target are preserved.
 */
export async function buildLongWorldbuildingSyncBatch(
  input: BuildLongWorldbuildingSyncBatchInput
): Promise<LongWorldbuildingSyncBatchPlan> {
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  const createId = input.createId ?? createSharedId;
  const createFileRevision =
    input.createFileRevision ?? createLongMarkdownFileRevision;
  const sourceCategories = filterSyncableWorldbuildingCategories(
    input.source.worldbuilding
  );
  if (sourceCategories.length === 0) {
    throw new Error("所选长篇没有可同步的世界观分类。");
  }

  const deletable = filterSyncableWorldbuildingCategories(
    input.target.worldbuilding
  );
  const preservedIds = filterPreservedWorldbuildingCategoryIds(
    input.target.worldbuilding
  );
  const operations: LongWorkspaceOperation[] = deletable.map((category) => ({
    type: "worldbuilding.delete",
    id: category.id,
    cascade: true
  }));
  const documentWrites: LongDocumentWriteProposal[] = [];
  const createdIds: string[] = [];

  for (const [index, sourceCategory] of sourceCategories.entries()) {
    const cloned = await cloneCategoryForSync(
      sourceCategory,
      index + 1,
      updatedAt,
      input.contents,
      createId,
      createFileRevision
    );
    operations.push({
      type: "worldbuilding.create",
      category: cloned.category
    });
    createdIds.push(cloned.category.id);
    documentWrites.push(...cloned.writes);
  }

  const orderedIds = [...createdIds, ...preservedIds];
  if (orderedIds.length > 1) {
    operations.push({
      type: "worldbuilding.reorder",
      orderedIds
    });
  }

  const batch = LongWorkspaceOperationBatchSchema.parse({
    baseRevision: input.target.revision,
    updatedAt,
    operations,
    documentWrites
  });

  return {
    batch,
    createdCategoryCount: createdIds.length,
    deletedCategoryCount: deletable.length,
    writtenFileCount: documentWrites.length
  };
}
