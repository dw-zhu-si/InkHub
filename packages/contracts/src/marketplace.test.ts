import { describe, expect, it } from "vitest";
import {
  CatalogInstallMarketplaceSkillContentCommandEnvelopeSchema,
  MarketplaceContentPageSchema,
  MarketplaceContentSummarySchema,
  MarketplaceListFilterSchema,
  MarketplaceInstallPackageSchema,
  MarketplacePublishInputSchema,
  MarketplaceSessionSchema,
  createEnvelope
} from "./index";

describe("marketplace contracts", () => {
  it("does not allow a session token across the Renderer contract", () => {
    expect(() =>
      MarketplaceSessionSchema.parse({
        authenticated: true,
        user: {
          id: "user-test",
          username: "writer-test",
          displayName: "测试作者",
          avatarUrl: "",
          bio: "",
          createdAt: "2026-08-11T08:00:00.000Z"
        },
        expiresAt: "2026-09-10T08:00:00.000Z",
        persistent: true,
        insecureTransport: true,
        token: "dw_user_must-not-cross"
      })
    ).toThrow();
  });

  it("requires likedByMe and validates a complete marketplace summary", () => {
    expect(() =>
      MarketplaceContentSummarySchema.parse({
        contentType: "skill",
        id: "skill-test",
        title: "测试技能",
        overview: "",
        kind: "style",
        libraryType: "short",
        stageId: "draft",
        version: 1,
        coverUrl: "",
        visibility: "public",
        status: "published",
        downloadCount: 0,
        likeCount: 0,
        itemCount: 0,
        ownerUsername: "writer-test",
        ownerName: "测试作者",
        ownerAvatarUrl: "",
        metadata: {},
        createdAt: "2026-08-11T08:00:00.000Z",
        updatedAt: "2026-08-11T08:00:00.000Z"
      })
    ).toThrow();
  });

  it("validates page-based marketplace list requests and responses", () => {
    expect(
      MarketplaceListFilterSchema.parse({ page: 2, pageSize: 20 })
    ).toEqual({ page: 2, pageSize: 20 });
    expect(() =>
      MarketplaceListFilterSchema.parse({ page: 0, pageSize: 20 })
    ).toThrow();
    expect(
      MarketplaceContentPageSchema.parse({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0
      })
    ).toMatchObject({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it("accepts the retained deleted publication lifecycle fields", () => {
    const value = MarketplaceContentSummarySchema.parse({
      contentType: "skill",
      id: "deleted-skill-test",
      title: "已删除测试技能",
      overview: "",
      kind: "style",
      libraryType: "short",
      stageId: "draft",
      version: 1,
      coverUrl: "",
      visibility: "unlisted",
      status: "deleted",
      enabled: false,
      downloadCount: 0,
      likeCount: 0,
      likedByMe: false,
      itemCount: 0,
      ownerUsername: "writer-test",
      ownerName: "测试作者",
      ownerAvatarUrl: "",
      metadata: {},
      deletedAt: "2026-08-11T08:00:00.000Z",
      purgeAt: "2026-08-21T08:00:00.000Z",
      createdAt: "2026-08-10T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z"
    });

    expect(value).toMatchObject({ status: "deleted", enabled: false });
  });

  it("accepts the atomic catalog install command package", () => {
    const payload = MarketplaceInstallPackageSchema.parse({
      source: { contentType: "skill", contentId: "remote-skill", version: 1 },
      title: "测试技能",
      overview: "",
      createGroup: false,
      buckets: [
        {
          kind: "style",
          libraryType: "short",
          availableLibraryTypes: ["short"],
          entries: [
            {
              marketplaceSkillId: "remote-skill",
              title: "测试技能",
              stageId: "draft",
              content: "明显无害的测试正文"
            }
          ]
        }
      ]
    });
    const command = CatalogInstallMarketplaceSkillContentCommandEnvelopeSchema.parse(
      createEnvelope("catalog.installMarketplaceSkillContent", payload, {
        id: "marketplace-install-test",
        correlationId: "marketplace-install-test"
      })
    );
    expect(command.type).toBe("catalog.installMarketplaceSkillContent");
  });

  it("publishes a local skill group as complete nested skill libraries", () => {
    const input = MarketplacePublishInputSchema.parse({
      contentType: "group",
      title: "完整写作技能组",
      overview: "直接来自本地技能库分组",
      libraries: [
        {
          title: "通用技能库",
          overview: "通用写作能力",
          kind: "general",
          libraryType: "short",
          entries: [
            {
              stageId: "draft",
              title: "推进正文",
              content: "使用明显无害的测试内容。"
            }
          ]
        }
      ]
    });

    expect(input).toMatchObject({ contentType: "group" });
    expect("libraries" in input && input.libraries).toHaveLength(1);
  });
});
