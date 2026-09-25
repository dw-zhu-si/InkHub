import { describe, expect, it } from "vitest";
import {
  CatalogSnapshotSchema,
  type CatalogReadDocumentResult
} from "@deepwrite/contracts";
import type { WorkspaceDocument } from "../types/workspace";
import {
  applyCatalogDocumentResult,
  catalogDocumentReadDescriptor,
  catalogSnapshotWithDocumentContents
} from "./catalogDocumentContent";

type WorkspaceDocumentPatch = {
  [Key in keyof WorkspaceDocument]?: WorkspaceDocument[Key] | undefined;
};

function document(
  patch: WorkspaceDocumentPatch = {}
): WorkspaceDocument {
  return {
    id: "workspace-document",
    domain: "creation",
    title: "正文",
    eyebrow: "短篇 · 正文",
    path: ["短篇", "正文"],
    content: "",
    workspaceId: "book-one",
    catalogDocumentId: "draft-body",
    catalogContentBytes: 12,
    catalogContentStamp: "fs-v1:12:1:1",
    catalogContentLoaded: false,
    ...patch
  } as WorkspaceDocument;
}

describe("catalog document content mapping", () => {
  it("maps book documents, library entries, and library overviews", () => {
    expect(catalogDocumentReadDescriptor(document())?.input).toEqual({
      projectId: "book-one",
      target: "document",
      documentId: "draft-body"
    });
    expect(
      catalogDocumentReadDescriptor(
        document({
          domain: "material",
          workspaceId: undefined,
          catalogDocumentId: undefined,
          libraryId: "material-one",
          catalogEntryId: "entry-one"
        })
      )?.input
    ).toEqual({
      projectId: "material-one",
      target: "document",
      documentId: "entry-one"
    });
    expect(
      catalogDocumentReadDescriptor(
        document({
          domain: "skill",
          workspaceId: undefined,
          catalogDocumentId: undefined,
          libraryId: "skill-one",
          catalogLibraryField: "overview"
        })
      )?.input
    ).toEqual({ projectId: "skill-one", target: "overview" });
  });

  it("uses the metadata stamp to invalidate same-size body cache entries", () => {
    const first = catalogDocumentReadDescriptor(document())!;
    const same = catalogDocumentReadDescriptor(document())!;
    const changed = catalogDocumentReadDescriptor(
      document({ catalogContentStamp: "fs-v1:12:2:2" })
    )!;

    expect(same.cacheKey).toBe(first.cacheKey);
    expect(changed.cacheKey).not.toBe(first.cacheKey);
  });

  it("publishes a loaded immutable document only for a matching result", () => {
    const source = document();
    const result: CatalogReadDocumentResult = {
      projectId: "book-one",
      target: "document",
      documentId: "draft-body",
      title: "正文",
      content: "按需读取的正文",
      contentBytes: 24,
      revision: "v1:24:12345678",
      projectRevision: 9,
      updatedAt: "2026-08-14T00:00:00.000Z"
    };

    expect(applyCatalogDocumentResult(source, result)).toMatchObject({
      content: "按需读取的正文",
      catalogContentBytes: 24,
      catalogContentLoaded: true,
      catalogProjectRevision: 9
    });
    expect(source.content).toBe("");
    expect(() =>
      applyCatalogDocumentResult(source, {
        ...result,
        documentId: "another-document"
      })
    ).toThrow("不匹配");
  });

  it("does not create reads for synthetic documents", () => {
    expect(
      catalogDocumentReadDescriptor(
        document({
          workspaceId: undefined,
          catalogDocumentId: undefined,
          catalogContentStamp: undefined
        })
      )
    ).toBeUndefined();
  });

  it("builds an ephemeral context snapshot without mutating the metadata index", () => {
    const timestamp = "2026-08-14T00:00:00.000Z";
    const snapshot = CatalogSnapshotSchema.parse({
      schemaVersion: 1,
      revision: 1,
      books: [],
      materials: [
        {
          id: "material-one",
          title: "素材库",
          materialType: "short",
          materialKind: "plot",
          parentGenre: "悬疑",
          subGenre: "",
          overview: "",
          entries: [
            {
              id: "entry-one",
              stageId: "pacing",
              title: "条目",
              body: "",
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      materialGroups: [],
      skills: [],
      skillGroups: [],
      updatedAt: timestamp
    });
    const loadedEntry = document({
      domain: "material",
      workspaceId: undefined,
      catalogDocumentId: undefined,
      libraryId: "material-one",
      catalogEntryId: "entry-one",
      content: "已加载素材正文",
      catalogContentLoaded: true
    });

    const context = catalogSnapshotWithDocumentContents(snapshot, [loadedEntry]);

    expect(context.materials[0]?.entries[0]?.body).toBe("已加载素材正文");
    expect(snapshot.materials[0]?.entries[0]?.body).toBe("");
  });
});
