import {
  CatalogSnapshotSchema,
  type CatalogReadDocumentInput,
  type CatalogReadDocumentResult
} from "@deepwrite/contracts";
import { createPinia, setActivePinia } from "pinia";
import { watch } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CatalogWorkspaceProjection,
  type CatalogWorkspaceProjectionIndex
} from "../data/catalogWorkspace";
import { useCatalogIndexStore } from "../stores/catalogIndexStore";
import type { WorkspaceDocument } from "../types/workspace";
import { catalogDocumentReadDescriptor } from "../utils/catalogDocumentContent";
import { useCatalogDocumentLoader } from "./useCatalogDocumentLoader";

const NOW = "2026-08-14T00:00:00.000Z";

type WorkspaceDocumentPatch = {
  [Key in keyof WorkspaceDocument]?: WorkspaceDocument[Key] | undefined;
};

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function document(
  id: string,
  stamp: string,
  patch: WorkspaceDocumentPatch = {}
): WorkspaceDocument {
  return {
    id,
    domain: "creation",
    title: `文档 ${id}`,
    eyebrow: "短篇 · 正文",
    path: ["测试短篇", `文档 ${id}`],
    content: "",
    workspaceId: "book-one",
    catalogDocumentId: id,
    catalogProjectRevision: 1,
    catalogContentBytes: 0,
    catalogContentStamp: stamp,
    catalogContentLoaded: false,
    ...patch
  } as WorkspaceDocument;
}

function projection(
  workspaceDocuments: readonly WorkspaceDocument[]
): CatalogWorkspaceProjection {
  const workspaceDocumentById = new Map(
    workspaceDocuments.map((item) => [item.id, item] as const)
  );
  const index: CatalogWorkspaceProjectionIndex = {
    resourceNodeById: new Map(),
    workspaceDocumentById,
    resourceIdByDocumentId: new Map(),
    resourceTargetDocumentIdById: new Map(),
    draftDirectoryById: new Map(),
    draftDirectoryByWorkspaceId: new Map(),
    preferredResourceIdByWorkspaceId: new Map(),
    workspaceIdByResourceId: new Map()
  };
  return {
    resourceSections: [],
    workspaceDocuments: [...workspaceDocuments],
    draftDirectories: [],
    index
  };
}

function readResult(
  input: CatalogReadDocumentInput,
  content: string,
  projectRevision = 1
): CatalogReadDocumentResult {
  const shared = {
    projectId: input.projectId,
    title: "测试正文",
    content,
    contentBytes: new TextEncoder().encode(content).byteLength,
    revision: "v1:1:12345678",
    projectRevision,
    updatedAt: NOW
  };
  return input.target === "overview"
    ? { ...shared, target: "overview" }
    : {
        ...shared,
        target: "document",
        documentId: input.documentId
      };
}

type Reader = (
  input: CatalogReadDocumentInput
) => Promise<CatalogReadDocumentResult>;

function createHarness(reader?: Reader) {
  const catalogIndex = useCatalogIndexStore();
  const readDocument = vi.fn<Reader>(
    reader ?? (async (input) => readResult(input, `正文 ${input.projectId}`))
  );
  const loader = useCatalogDocumentLoader({
    catalogIndex,
    reader: () => ({ readDocument })
  });
  return { catalogIndex, loader, readDocument };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("catalog document loader", () => {
  it("retains bodies only while the projected stamped descriptor is unchanged", () => {
    const { catalogIndex, loader } = createHarness();
    const first = document("draft-body", "fs-v1:10:1:1");
    loader.reconcileProjection(projection([first]));
    loader.documents.value = [
      {
        ...first,
        content: "已加载正文",
        catalogContentLoaded: true
      }
    ];
    const firstDescriptor = catalogDocumentReadDescriptor(first)!;
    catalogIndex.cacheDocument(firstDescriptor.cacheKey, {
      content: "缓存正文"
    });

    const sameStamp = document("draft-body", "fs-v1:10:1:1", {
      title: "更新后的标题",
      catalogProjectRevision: 2
    });
    const retained = loader.reconcileProjection(projection([sameStamp]));
    expect(retained.retainedBodyIds).toEqual(["draft-body"]);
    expect(loader.documentsById.value.get("draft-body")).toMatchObject({
      title: "更新后的标题",
      content: "已加载正文",
      catalogContentLoaded: true,
      catalogProjectRevision: 2
    });

    const changedStamp = document("draft-body", "fs-v1:10:2:2");
    const discarded = loader.reconcileProjection(projection([changedStamp]));
    expect(discarded.discardedBodyIds).toEqual(["draft-body"]);
    expect(loader.documentsById.value.get("draft-body")).toMatchObject({
      content: "",
      catalogContentLoaded: false,
      catalogContentStamp: "fs-v1:10:2:2"
    });
    expect(
      catalogIndex.getCachedDocument(firstDescriptor.cacheKey)
    ).toBeUndefined();

    const removed = loader.reconcileProjection(projection([]));
    expect(removed.removedIds).toEqual(["draft-body"]);
    expect(loader.documentsById.value.has("draft-body")).toBe(false);
  });

  it("publishes all successful reads with one shallow overlay replacement", async () => {
    const { loader, readDocument } = createHarness(async (input) =>
      readResult(input, `已加载 ${input.target === "document" ? input.documentId : "overview"}`)
    );
    loader.reconcileProjection(
      projection([
        document("first", "fs-v1:0:1:1"),
        document("second", "fs-v1:0:1:2")
      ])
    );
    const publications = vi.fn();
    const stop = watch(loader.documents, publications, { flush: "sync" });

    const result = await loader.ensureLoaded([
      loader.documentsById.value.get("first")!,
      loader.documentsById.value.get("second")!,
      loader.documentsById.value.get("first")!
    ]);
    stop();

    expect(result).toMatchObject({
      ok: true,
      requestedIds: ["first", "second"],
      loadedIds: ["first", "second"],
      failures: [],
      published: true
    });
    expect(readDocument).toHaveBeenCalledTimes(2);
    expect(publications).toHaveBeenCalledTimes(1);
    expect(loader.documents.value.every((item) => item.catalogContentLoaded)).toBe(
      true
    );
  });

  it("returns structured partial failures and still publishes successes once", async () => {
    const { loader } = createHarness(async (input) => {
      if (input.target === "document" && input.documentId === "failed") {
        throw new Error("temporary read failure");
      }
      return readResult(input, "可用正文");
    });
    loader.reconcileProjection(
      projection([
        document("loaded", "fs-v1:0:1:1"),
        document("failed", "fs-v1:0:1:2")
      ])
    );
    const publications = vi.fn();
    const stop = watch(loader.documents, publications, { flush: "sync" });

    const result = await loader.ensureLoaded(loader.documents.value);
    stop();

    expect(result.ok).toBe(false);
    expect(result.loadedIds).toEqual(["loaded"]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        documentId: "failed",
        code: "read-failed",
        attempts: 1,
        error: expect.any(Error)
      })
    ]);
    expect(publications).toHaveBeenCalledTimes(1);
    expect(loader.documentsById.value.get("loaded")?.content).toBe("可用正文");
    expect(loader.documentsById.value.get("failed")?.catalogContentLoaded).toBe(
      false
    );
  });

  it("retries an invalidated read once using the latest descriptor", async () => {
    const firstRead = deferred<CatalogReadDocumentResult>();
    const latestRead = deferred<CatalogReadDocumentResult>();
    const { loader, readDocument } = createHarness(
      vi
        .fn<Reader>()
        .mockReturnValueOnce(firstRead.promise)
        .mockReturnValueOnce(latestRead.promise)
    );
    const first = document("draft-body", "fs-v1:0:1:1");
    loader.reconcileProjection(projection([first]));

    const loading = loader.ensureOne(first);
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledTimes(1));
    const latest = document("draft-body", "fs-v1:0:2:2", {
      catalogProjectRevision: 2
    });
    loader.reconcileProjection(projection([latest]));
    firstRead.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "draft-body" },
        "过期正文"
      )
    );
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledTimes(2));
    latestRead.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "draft-body" },
        "最新正文",
        2
      )
    );

    const result = await loading;
    expect(result).toMatchObject({
      ok: true,
      loadedIds: ["draft-body"],
      retriedIds: ["draft-body"],
      published: true
    });
    expect(result.document).toMatchObject({
      content: "最新正文",
      catalogContentStamp: "fs-v1:0:2:2",
      catalogProjectRevision: 2,
      catalogContentLoaded: true
    });
  });

  it("joins a newer refresh when the same descriptor invalidates its read", async () => {
    const firstRead = deferred<CatalogReadDocumentResult>();
    const newerRead = deferred<CatalogReadDocumentResult>();
    const { loader, readDocument } = createHarness(
      vi
        .fn<Reader>()
        .mockReturnValueOnce(firstRead.promise)
        .mockReturnValueOnce(newerRead.promise)
    );
    const source = document("draft-body", "fs-v1:0:1:1");
    loader.reconcileProjection(projection([source]));

    const firstLoading = loader.ensureOne(source, { refresh: true });
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledTimes(1));
    const newerLoading = loader.ensureOne(source, { refresh: true });
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledTimes(2));

    firstRead.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "draft-body" },
        "已失效正文"
      )
    );
    newerRead.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "draft-body" },
        "最新正文"
      )
    );

    const [firstResult, newerResult] = await Promise.all([
      firstLoading,
      newerLoading
    ]);
    expect(readDocument).toHaveBeenCalledTimes(2);
    expect(firstResult).toMatchObject({
      ok: true,
      loadedIds: ["draft-body"],
      retriedIds: ["draft-body"]
    });
    expect(newerResult).toMatchObject({
      ok: true,
      loadedIds: ["draft-body"]
    });
    expect(loader.documentsById.value.get("draft-body")?.content).toBe(
      "最新正文"
    );
  });

  it("never lets an older settled batch result overwrite a later refresh", async () => {
    const slowSecond = deferred<CatalogReadDocumentResult>();
    let firstReads = 0;
    const { loader, readDocument } = createHarness(async (input) => {
      if (input.target === "document" && input.documentId === "second") {
        return slowSecond.promise;
      }
      firstReads += 1;
      return readResult(
        input,
        firstReads === 1 ? "第一份旧正文" : "第一份最新正文"
      );
    });
    const first = document("first", "fs-v1:0:1:1");
    const second = document("second", "fs-v1:0:1:2");
    loader.reconcileProjection(projection([first, second]));

    const olderBatch = loader.ensureLoaded([first, second]);
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledTimes(2));
    const latest = await loader.ensureOne(first, { refresh: true });
    expect(latest.document?.content).toBe("第一份最新正文");

    slowSecond.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "second" },
        "第二份正文"
      )
    );
    const olderResult = await olderBatch;

    expect(olderResult.retriedIds).toContain("first");
    expect(loader.documentsById.value.get("first")?.content).toBe(
      "第一份最新正文"
    );
  });

  it("never performs a third read when the descriptor changes during its retry", async () => {
    const firstRead = deferred<CatalogReadDocumentResult>();
    const secondRead = deferred<CatalogReadDocumentResult>();
    const { loader, readDocument } = createHarness(
      vi
        .fn<Reader>()
        .mockReturnValueOnce(firstRead.promise)
        .mockReturnValueOnce(secondRead.promise)
    );
    const first = document("draft-body", "fs-v1:0:1:1");
    loader.reconcileProjection(projection([first]));

    const loading = loader.ensureOne(first);
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledTimes(1));
    loader.reconcileProjection(
      projection([document("draft-body", "fs-v1:0:2:2")])
    );
    firstRead.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "draft-body" },
        "第一版"
      )
    );
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledTimes(2));
    loader.reconcileProjection(
      projection([document("draft-body", "fs-v1:0:3:3")])
    );
    secondRead.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "draft-body" },
        "第二版"
      )
    );

    const result = await loading;
    expect(readDocument).toHaveBeenCalledTimes(2);
    expect(result.loadedIds).toEqual([]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        documentId: "draft-body",
        code: "stale-descriptor",
        attempts: 2
      })
    ]);
    expect(result.document).toMatchObject({
      content: "",
      catalogContentStamp: "fs-v1:0:3:3",
      catalogContentLoaded: false
    });
  });

  it("does not resurrect a document removed while its read is pending", async () => {
    const pending = deferred<CatalogReadDocumentResult>();
    const { loader, readDocument } = createHarness(() => pending.promise);
    const source = document("removed", "fs-v1:0:1:1");
    loader.reconcileProjection(projection([source]));

    const loading = loader.ensureOne(source);
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledOnce());
    loader.reconcileProjection(projection([]));
    pending.resolve(
      readResult(
        { projectId: "book-one", target: "document", documentId: "removed" },
        "不应发布的正文"
      )
    );

    const result = await loading;
    expect(result).toMatchObject({
      ok: false,
      loadedIds: [],
      published: false,
      document: undefined
    });
    expect(result.failures).toEqual([
      expect.objectContaining({
        documentId: "removed",
        code: "document-removed",
        attempts: 1
      })
    ]);
    expect(readDocument).toHaveBeenCalledOnce();
    expect(loader.documents.value).toEqual([]);
  });

  it("invalidates pending reads and refuses new I/O after disposal", async () => {
    const pending = deferred<CatalogReadDocumentResult>();
    const { loader, readDocument } = createHarness(() => pending.promise);
    const source = document("draft-body", "fs-v1:0:1:1");
    loader.reconcileProjection(projection([source]));

    const loading = loader.ensureOne(source);
    await vi.waitFor(() => expect(readDocument).toHaveBeenCalledOnce());
    loader.dispose();
    pending.resolve(
      readResult(
        {
          projectId: "book-one",
          target: "document",
          documentId: "draft-body"
        },
        "关闭后不应发布的正文"
      )
    );

    const result = await loading;
    expect(result).toMatchObject({
      ok: false,
      loadedIds: [],
      published: false
    });
    expect(result.failures).toEqual([
      expect.objectContaining({
        documentId: "draft-body",
        code: "stale-descriptor",
        attempts: 1
      })
    ]);
    expect(loader.documentsById.value.get("draft-body")).toMatchObject({
      content: "",
      catalogContentLoaded: false
    });

    const afterDispose = await loader.ensureOne(source, { refresh: true });
    expect(afterDispose).toMatchObject({ ok: false, published: false });
    expect(readDocument).toHaveBeenCalledOnce();
  });

  it("builds a context snapshot from loaded overlays without mutating the index", () => {
    const { loader } = createHarness();
    const snapshot = CatalogSnapshotSchema.parse({
      schemaVersion: 1,
      revision: 1,
      updatedAt: NOW,
      books: [],
      materials: [
        {
          id: "material-one",
          title: "测试素材库",
          materialType: "short",
          materialKind: "plot",
          parentGenre: "测试类型",
          subGenre: "",
          overview: "",
          entries: [
            {
              id: "entry-one",
              stageId: "pacing",
              title: "测试条目",
              body: "",
              createdAt: NOW,
              updatedAt: NOW
            }
          ],
          createdAt: NOW,
          updatedAt: NOW
        }
      ],
      materialGroups: [],
      skills: [],
      skillGroups: []
    });
    loader.documents.value = [
      document("material-entry", "fs-v1:12:1:1", {
        domain: "material",
        workspaceId: undefined,
        catalogDocumentId: undefined,
        libraryId: "material-one",
        catalogEntryId: "entry-one",
        content: "上下文素材正文",
        catalogContentLoaded: true
      })
    ];

    const context = loader.contextSnapshot(snapshot);

    expect(context?.materials[0]?.entries[0]?.body).toBe("上下文素材正文");
    expect(snapshot.materials[0]?.entries[0]?.body).toBe("");
  });
});
