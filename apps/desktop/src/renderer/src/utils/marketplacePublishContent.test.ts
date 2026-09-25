import { describe, expect, it } from "vitest";
import type { CatalogReadDocumentInput } from "@deepwrite/contracts";
import {
  formatMarketplaceContractError,
  formatMarketplacePublishEmptyContentMessage,
  loadMarketplacePublishLibraryContent,
  loadMarketplacePublishSkillContent,
  skillLibraryPublishSource
} from "./marketplacePublishContent";

const NOW = "2026-08-16T08:00:00.000Z";

function reader(contents: Record<string, string>) {
  return {
    async readDocument(input: CatalogReadDocumentInput) {
      const key =
        input.target === "overview"
          ? `${input.projectId}:overview`
          : `${input.projectId}:${input.documentId}`;
      const content = contents[key];
      if (content === undefined) {
        throw new Error(`missing catalog document ${key}`);
      }
      return { content };
    }
  };
}

describe("marketplace publish content", () => {
  it("loads skill and library bodies from catalog documents instead of index fields", async () => {
    const loaded = await loadMarketplacePublishLibraryContent(
      reader({
        "skill-general:overview": "通用库介绍",
        "skill-general:entry-draft": "推进正文的测试内容",
        "skill-general:entry-empty": "   "
      }),
      skillLibraryPublishSource({
        id: "skill-general",
        title: "通用技能库",
        skillKind: "general",
        skillType: "short",
        entries: [
          {
            id: "entry-draft",
            stageId: "draft",
            title: "推进正文",
            body: "",
            createdAt: NOW,
            updatedAt: NOW
          },
          {
            id: "entry-empty",
            stageId: "outline",
            title: "空技能",
            body: "",
            createdAt: NOW,
            updatedAt: NOW
          }
        ]
      })
    );

    expect(loaded).toMatchObject({
      title: "通用技能库",
      overview: "通用库介绍",
      kind: "general",
      libraryType: "short",
      emptyTitles: ["空技能"],
      entries: [
        {
          stageId: "draft",
          title: "推进正文",
          content: "推进正文的测试内容"
        }
      ]
    });
    expect(
      await loadMarketplacePublishSkillContent(
        reader({ "skill-general:entry-draft": "推进正文的测试内容" }),
        "skill-general",
        "entry-draft"
      )
    ).toBe("推进正文的测试内容");
  });

  it("explains empty bodies and raw contract validation errors", () => {
    expect(formatMarketplacePublishEmptyContentMessage(["推进正文"])).toBe(
      "技能「推进正文」没有正文，无法发布。"
    );
    expect(
      formatMarketplacePublishEmptyContentMessage(["一", "二", "三", "四"])
    ).toContain("没有正文，无法发布。");
    expect(
      formatMarketplaceContractError(
        JSON.stringify([
          {
            origin: "string",
            code: "too_small",
            minimum: 1,
            inclusive: true,
            path: ["libraries", 0, "entries", 0, "content"],
            message: "Invalid input"
          }
        ])
      )
    ).toBe("技能正文为空，无法发布。请确认本地技能已填写内容后再提交。");
    expect(formatMarketplaceContractError("提交发布内容失败。")).toBeNull();
  });
});
