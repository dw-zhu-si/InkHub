import { describe, expect, it } from "vitest";
import {
  EMPTY_LONG_MARKDOWN_REVISION,
  LongWorldbuildingListCategorySchema,
  LongWorldbuildingTextCategorySchema,
  longWorldbuildingContentPath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId
} from "@deepwrite/contracts";
import {
  findLongWorldbuildingFile,
  longWorldbuildingFiles
} from "./longWorldbuildingFiles";

const updatedAt = "2026-07-31T00:00:00.000Z";
const textCategory = LongWorldbuildingTextCategorySchema.parse({
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
});
const listCategory = LongWorldbuildingListCategorySchema.parse({
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
  items: [{
    id: "worlditem_faction_one",
    title: "归墟会",
    order: 1,
    file: {
      id: longWorldbuildingItemFileId("worlditem_faction_one"),
      path: longWorldbuildingItemContentPath(
        "world_factions",
        "worlditem_faction_one"
      ),
      revision: EMPTY_LONG_MARKDOWN_REVISION,
      updatedAt
    }
  }]
});

describe("long worldbuilding file indexing", () => {
  it("indexes text files, list overviews, and list item files", () => {
    const files = longWorldbuildingFiles([textCategory, listCategory]);

    expect(files.map(({ id }) => id)).toEqual([
      longWorldbuildingFileId("world_rules"),
      longWorldbuildingOverviewFileId("world_factions"),
      longWorldbuildingItemFileId("worlditem_faction_one")
    ]);
  });

  it("finds a list overview by the file id used by agent proposals", () => {
    expect(
      findLongWorldbuildingFile(
        [textCategory, listCategory],
        longWorldbuildingOverviewFileId("world_factions")
      )?.path
    ).toBe(longWorldbuildingOverviewContentPath("world_factions"));
  });
});
