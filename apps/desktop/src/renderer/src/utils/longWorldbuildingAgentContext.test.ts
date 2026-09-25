import { describe, expect, it, vi } from "vitest";
import type {
  LongReadDocumentInput,
  LongReadDocumentResult,
  LongWorldbuildingCategory
} from "@deepwrite/contracts";
import type { LongWorkspaceSelection } from "../types/longWorkspace";
import { buildLongWorldbuildingFocusSnapshot } from "./longWorldbuildingAgentContext";
import { buildLongWorldbuildingDirectorySnapshot } from "./longWorldbuildingDirectorySnapshot";

const UPDATED_AT = "2026-07-30T10:00:00.000Z";

function file(id: string, path: string) {
  return {
    id,
    path,
    revision: "v1:3:1234abcd",
    updatedAt: UPDATED_AT
  };
}

function page(
  input: LongReadDocumentInput,
  content: string,
  totalCharacters = Array.from(content).length
): LongReadDocumentResult {
  const visible = Array.from(content)
    .slice(0, input.maxCharacters)
    .join("");
  const end = input.offset + Array.from(visible).length;
  return {
    bookId: input.bookId,
    file: file(input.fileId, `long/test/${input.fileId}.md`),
    content: visible,
    offset: input.offset,
    totalCharacters,
    nextOffset: end < totalCharacters ? end : null,
    workspaceRevision: 3,
    projectRevision: 5
  };
}

describe("long worldbuilding agent context", () => {
  it("builds a lightweight ordered directory without document contents", () => {
    const categories: LongWorldbuildingCategory[] = [
      {
        id: "world_factions",
        title: "势力",
        order: 2,
        format: "list",
        contentAuthority: "files",
        overview: file(
          "file_world_factions:overview",
          "long/worldbuilding/world_factions/overview.md"
        ),
        items: [
          {
            id: "worlditem_harbor",
            title: "港务会",
            order: 2,
            file: file(
              "file_worlditem_harbor:content",
              "long/worldbuilding/world_factions/items/worlditem_harbor.md"
            )
          },
          {
            id: "worlditem_watchers",
            title: "守夜人",
            order: 1,
            file: file(
              "file_worlditem_watchers:content",
              "long/worldbuilding/world_factions/items/worlditem_watchers.md"
            )
          }
        ]
      },
      {
        id: "world_rules",
        title: "规则",
        order: 1,
        format: "text",
        contentAuthority: "markdown",
        file: file(
          "file_world_rules:content",
          "long/worldbuilding/world_rules/content.md"
        )
      }
    ];

    expect(buildLongWorldbuildingDirectorySnapshot(categories)).toEqual({
      categories: [
        {
          categoryId: "world_rules",
          title: "规则",
          order: 1,
          format: "text"
        },
        {
          categoryId: "world_factions",
          title: "势力",
          order: 2,
          format: "list",
          itemCount: 2,
          items: [
            { itemId: "worlditem_watchers", title: "守夜人", order: 1 },
            { itemId: "worlditem_harbor", title: "港务会", order: 2 }
          ],
          omittedItemCount: 0
        }
      ],
      omittedCategoryCount: 0
    });
  });

  it("captures the active list item together with its category overview", async () => {
    const overview = file(
      "file_factions:overview",
      "long/worldbuilding/factions/overview.md"
    );
    const item = file(
      "file_faction_watch:content",
      "long/worldbuilding/factions/items/watch.md"
    );
    const selection: LongWorkspaceSelection = {
      key: "worldbuilding:factions",
      root: "worldbuilding",
      title: "势力",
      breadcrumbs: ["雾港", "世界观", "势力"],
      worldbuildingFormat: "list",
      worldbuildingItems: [
        { id: "faction_watch", title: "守夜人", order: 1, file: item }
      ],
      files: [
        { role: "overview", label: "概览", file: overview },
        { role: "content", label: "守夜人", file: item }
      ],
      preferredRole: "content",
      description: "列表型世界设定。"
    };
    const readDocument = vi.fn(
      async (input: LongReadDocumentInput): Promise<LongReadDocumentResult> =>
        page(
          input,
          input.fileId === item.id
            ? "守夜人负责维持雾港宵禁。"
            : "势力围绕港务权和雾潮资源竞争。"
        )
    );

    const result = await buildLongWorldbuildingFocusSnapshot({
      bookId: "longbook_focus",
      selection,
      activeFileId: item.id,
      readDocument
    });

    expect(result).toEqual({
      categoryTitle: "势力",
      format: "list",
      currentStage: {
        kind: "item",
        title: "守夜人",
        text: { content: "守夜人负责维持雾港宵禁。" }
      },
      overview: { content: "势力围绕港务权和雾潮资源竞争。" }
    });
    expect(readDocument).toHaveBeenCalledTimes(2);
    expect(readDocument.mock.calls.map(([input]) => input.maxCharacters)).toEqual(
      expect.arrayContaining([12_000, 8_000])
    );
  });

  it("captures only the active stage for a text category", async () => {
    const contentFile = file(
      "file_world_rules:content",
      "long/worldbuilding/world_rules/content.md"
    );
    const selection: LongWorkspaceSelection = {
      key: "worldbuilding:world_rules",
      root: "worldbuilding",
      title: "世界规则",
      breadcrumbs: ["雾港", "世界观", "世界规则"],
      worldbuildingFormat: "text",
      files: [{ role: "content", label: "设定正文", file: contentFile }],
      preferredRole: "content",
      description: "文本型世界设定。"
    };
    const readDocument = vi.fn(
      async (input: LongReadDocumentInput): Promise<LongReadDocumentResult> =>
        page(input, "雾潮出现时，城内不得点燃蓝焰。")
    );

    const result = await buildLongWorldbuildingFocusSnapshot({
      bookId: "longbook_focus",
      selection,
      activeFileId: contentFile.id,
      readDocument
    });

    expect(result).toEqual({
      categoryTitle: "世界规则",
      format: "text",
      currentStage: {
        kind: "text",
        title: "世界规则",
        text: { content: "雾潮出现时，城内不得点燃蓝焰。" }
      }
    });
    expect(result).not.toHaveProperty("overview");
    expect(readDocument).toHaveBeenCalledTimes(1);
    expect(readDocument).toHaveBeenCalledWith(
      expect.objectContaining({ maxCharacters: 20_000 })
    );
  });
});
