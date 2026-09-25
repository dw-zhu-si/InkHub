import { describe, expect, it } from "vitest";
import {
  CatalogCommandEnvelopeSchema,
  CatalogIndexDocumentSchema,
  CatalogIndexSnapshotSchema,
  CatalogReadDocumentInputSchema,
  CatalogReadDocumentResultSchema,
  CatalogSnapshotSchema,
  CommandEnvelopeSchema,
  createDefaultCreativePlotStages,
  createEnvelope,
  createShortWorkspaceContentRevision,
  type CatalogSnapshot
} from "./index";

const timestamp = "2026-08-14T01:02:03.000Z";

function catalogIndexFixture(): unknown {
  return {
    schemaVersion: 1,
    revision: 4,
    creativePlotStages: createDefaultCreativePlotStages(),
    books: [],
    materials: [
      {
        id: "material-library-1",
        title: "人物素材",
        materialType: "short",
        materialKind: "character",
        parentGenre: "悬疑",
        subGenre: "",
        overview: "",
        overviewContentBytes: 12,
        overviewContentStamp: `manifest-v1:12:${timestamp}`,
        entries: [
          {
            id: "material-entry-1",
            stageId: "character",
            title: "守夜人",
            body: "",
            contentBytes: 24,
            contentStamp: "fs-v1:24:100:200",
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        projectRevision: 2,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    materialGroups: [],
    skills: [],
    skillGroups: [],
    updatedAt: timestamp
  };
}

describe("Catalog metadata index contracts", () => {
  it("is structurally assignable to CatalogSnapshot while preserving byte metadata", () => {
    const index = CatalogIndexSnapshotSchema.parse(catalogIndexFixture());
    const compatibleSnapshot: CatalogSnapshot = index;

    expect(CatalogSnapshotSchema.parse(compatibleSnapshot).materials[0]).toMatchObject({
      overview: "",
      entries: [{ body: "" }]
    });
    expect(index.materials[0]).toMatchObject({
      overviewContentBytes: 12,
      overviewContentStamp: `manifest-v1:12:${timestamp}`,
      entries: [{ contentBytes: 24, contentStamp: "fs-v1:24:100:200" }]
    });
  });

  it("requires empty projected content and rejects unknown metadata keys", () => {
    expect(
      CatalogIndexDocumentSchema.safeParse({
        id: "document-1",
        title: "世界观",
        content: "尚未清空的正文",
        contentBytes: 24,
        contentStamp: "fs-v1:24:100:200",
        createdAt: timestamp,
        updatedAt: timestamp
      }).success
    ).toBe(false);

    expect(
      CatalogIndexSnapshotSchema.safeParse({
        ...(catalogIndexFixture() as Record<string, unknown>),
        unexpected: true
      }).success
    ).toBe(false);
  });
});

describe("Catalog on-demand read contracts", () => {
  it("accepts only the two strict read targets", () => {
    expect(
      CatalogReadDocumentInputSchema.parse({
        projectId: "book-1",
        target: "document",
        documentId: "worldbuilding"
      })
    ).toEqual({
      projectId: "book-1",
      target: "document",
      documentId: "worldbuilding"
    });
    expect(
      CatalogReadDocumentInputSchema.parse({
        projectId: "material-1",
        target: "overview"
      })
    ).toEqual({ projectId: "material-1", target: "overview" });
    expect(
      CatalogReadDocumentInputSchema.safeParse({
        projectId: "book-1",
        target: "overview",
        documentId: "unexpected"
      }).success
    ).toBe(false);
  });

  it("validates structured results and both command envelopes", () => {
    const content = "按需读取的正文";
    expect(
      CatalogReadDocumentResultSchema.parse({
        projectId: "book-1",
        target: "document",
        documentId: "worldbuilding",
        title: "世界观",
        content,
        contentBytes: 24,
        revision: createShortWorkspaceContentRevision(content),
        projectRevision: 7,
        updatedAt: timestamp
      })
    ).toMatchObject({ content, projectRevision: 7 });

    const indexCommandId = "catalog-index-command";
    expect(
      CatalogCommandEnvelopeSchema.parse(
        createEnvelope("catalog.index", {}, {
          id: indexCommandId,
          correlationId: indexCommandId
        })
      ).type
    ).toBe("catalog.index");

    const readCommandId = "catalog-read-command";
    expect(
      CatalogCommandEnvelopeSchema.parse(
        createEnvelope(
          "catalog.readDocument",
          {
            projectId: "skill-1",
            target: "document",
            documentId: "entry-1"
          },
          { id: readCommandId, correlationId: readCommandId }
        )
      ).type
    ).toBe("catalog.readDocument");
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("catalog.index", {}, {
          id: "system-catalog-index-command",
          correlationId: "system-catalog-index-command"
        })
      ).type
    ).toBe("catalog.index");
  });
});
