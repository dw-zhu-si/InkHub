import { describe, expect, it } from "vitest";
import {
  EMPTY_LONG_MARKDOWN_REVISION,
  LONG_BOOK_LINE_FILE_ID,
  LONG_CHARACTER_OVERVIEW_FILE_ID,
  LONG_CHARACTER_OVERVIEW_PATH,
  LongWorkspaceIndexSnapshotSchema,
  LongWorkspaceOperationBatchSchema,
  applyLongWorkspaceOperations,
  createEmptyLongMarkdownFileReference,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  previewLongWorkspaceOperations,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import {
  buildLongWorldbuildingSyncBatch,
  createLongMarkdownFileRevision,
  filterPreservedWorldbuildingCategoryIds,
  filterSyncableWorldbuildingCategories
} from "./longWorldbuildingSync";

const updatedAt = "2026-08-01T00:00:00.000Z";

function emptyIndex(
  bookId: string,
  worldbuilding: LongWorkspaceIndexSnapshot["worldbuilding"],
  revision = 3
): LongWorkspaceIndexSnapshot {
  return LongWorkspaceIndexSnapshotSchema.parse({
    schemaVersion: 1,
    bookId,
    revision,
    updatedAt,
    bookLine: createEmptyLongMarkdownFileReference(
      LONG_BOOK_LINE_FILE_ID,
      "long/plot/book-line.md",
      updatedAt
    ),
    worldbuilding,
    characterOverview: createEmptyLongMarkdownFileReference(
      LONG_CHARACTER_OVERVIEW_FILE_ID,
      LONG_CHARACTER_OVERVIEW_PATH,
      updatedAt
    ),
    characters: [],
    characterFiles: [],
    plot: {
      volumes: [
        {
          id: "volume_one",
          title: "第一卷",
          order: 1,
          summary: ""
        }
      ],
      arcs: [],
      chapterCards: [],
      storyEvents: [],
      storyPlots: [],
      eventConnections: [],
      narrativePlacements: [],
      foreshadowing: []
    },
    chapters: [],
    ledger: {
      committedThroughChapterId: null,
      commits: []
    }
  });
}

describe("longWorldbuildingSync", () => {
  it("filters migration-evidence categories out of syncable sources", () => {
    const categories = [
      {
        id: "world_rules",
        title: "规则",
        order: 1,
        format: "text" as const,
        contentAuthority: "markdown" as const,
        file: createEmptyLongMarkdownFileReference(
          longWorldbuildingFileId("world_rules"),
          longWorldbuildingContentPath("world_rules"),
          updatedAt
        )
      },
      {
        id: "world_migration-evidence-1",
        title: "迁移证据",
        order: 2,
        format: "text" as const,
        contentAuthority: "markdown" as const,
        file: createEmptyLongMarkdownFileReference(
          longWorldbuildingFileId("world_migration-evidence-1"),
          longWorldbuildingContentPath("world_migration-evidence-1"),
          updatedAt
        )
      }
    ];

    expect(
      filterSyncableWorldbuildingCategories(categories).map(({ id }) => id)
    ).toEqual(["world_rules"]);
    expect(filterPreservedWorldbuildingCategoryIds(categories)).toEqual([
      "world_migration-evidence-1"
    ]);
  });

  it("builds a replace batch that deletes editable categories and recreates source structure with content", async () => {
    const target = emptyIndex("longbook_target", [
      {
        id: "world_old",
        title: "旧分类",
        order: 1,
        format: "text",
        contentAuthority: "markdown",
        file: createEmptyLongMarkdownFileReference(
          longWorldbuildingFileId("world_old"),
          longWorldbuildingContentPath("world_old"),
          updatedAt
        )
      },
      {
        id: "world_migration-evidence-keep",
        title: "迁移证据",
        order: 2,
        format: "text",
        contentAuthority: "markdown",
        file: createEmptyLongMarkdownFileReference(
          longWorldbuildingFileId("world_migration-evidence-keep"),
          longWorldbuildingContentPath("world_migration-evidence-keep"),
          updatedAt
        )
      }
    ]);
    const source = emptyIndex(
      "longbook_source",
      [
        {
          id: "world_rules",
          title: "规则",
          order: 1,
          format: "text",
          contentAuthority: "markdown",
          file: {
            id: longWorldbuildingFileId("world_rules"),
            path: longWorldbuildingContentPath("world_rules"),
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt
          }
        },
        {
          id: "world_factions",
          title: "势力",
          order: 2,
          format: "list",
          contentAuthority: "files",
          overview: {
            id: longWorldbuildingOverviewFileId("world_factions"),
            path: longWorldbuildingOverviewContentPath("world_factions"),
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt
          },
          items: [
            {
              id: "worlditem_one",
              title: "归墟会",
              order: 1,
              file: {
                id: longWorldbuildingItemFileId("worlditem_one"),
                path: longWorldbuildingItemContentPath(
                  "world_factions",
                  "worlditem_one"
                ),
                revision: EMPTY_LONG_MARKDOWN_REVISION,
                updatedAt
              }
            }
          ]
        }
      ],
      9
    );

    const contents = {
      [longWorldbuildingFileId("world_rules")]: "# 规则正文\n",
      [longWorldbuildingOverviewFileId("world_factions")]: "",
      [longWorldbuildingItemFileId("worlditem_one")]: "势力条目"
    };

    let sequence = 0;
    const plan = await buildLongWorldbuildingSyncBatch({
      target,
      source,
      contents,
      updatedAt,
      createId: (prefix) => `${prefix}_sync${(sequence += 1)}`,
      createFileRevision: createLongMarkdownFileRevision
    });

    expect(plan.deletedCategoryCount).toBe(1);
    expect(plan.createdCategoryCount).toBe(2);
    expect(plan.writtenFileCount).toBe(2);
    expect(plan.batch.operations[0]).toMatchObject({
      type: "worldbuilding.delete",
      id: "world_old",
      cascade: true
    });
    expect(
      plan.batch.operations.filter(({ type }) => type === "worldbuilding.create")
    ).toHaveLength(2);
    expect(plan.batch.operations.at(-1)).toMatchObject({
      type: "worldbuilding.reorder",
      orderedIds: [
        "world_sync1",
        "world_sync2",
        "world_migration-evidence-keep"
      ]
    });
    expect(
      LongWorkspaceOperationBatchSchema.safeParse(plan.batch).success
    ).toBe(true);

    const preview = previewLongWorkspaceOperations(target, plan.batch);
    const result = applyLongWorkspaceOperations(target, {
      ...plan.batch,
      expectedImpact: preview.impact
    });
    expect(result.impact.deletedEntityIds).toContain("world_old");
    expect(result.impact.createdEntityIds).toEqual(
      expect.arrayContaining(["world_sync1", "world_sync2", "worlditem_sync3"])
    );
    expect(result.snapshot.worldbuilding.map(({ title }) => title)).toEqual([
      "规则",
      "势力",
      "迁移证据"
    ]);
  });
});
