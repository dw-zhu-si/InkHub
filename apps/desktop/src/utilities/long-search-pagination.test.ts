import {
  mkdtemp,
  realpath,
  rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptyLongMarkdownFileReference,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterFilePath,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId
} from "@deepwrite/contracts";
import {
  LongProjectStore,
  type LongProjectSearchResume
} from "./long-project-store";
import { LongWorkspaceService } from "./long-workspace-service";

const FIXED_NOW = "2026-07-26T12:00:00.000Z";
const temporaryRoots: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("LongProjectStore resumable search", () => {
  it("searches a single document larger than the former 8 MiB batch limit", async () => {
    const root = await temporaryRoot("deepwrite-long-large-search-");
    const store = new LongProjectStore({ now: () => FIXED_NOW });
    const created = await store.createBook(root, {
      id: "longbook_large-search",
      title: "大型搜索",
      genre: "其他"
    });
    const body = created.book.workspaceIndex.chapters[0]!.body;
    const content = `${"a".repeat(8 * 1024 * 1024 + 1)}Needle`;
    const written = await store.writeDocument(created.projectDirectory, {
      fileId: body.id,
      content,
      expectedFileRevision: body.revision,
      expectedWorkspaceRevision: 0,
      expectedProjectRevision: 0
    });

    let resume: LongProjectSearchResume | undefined;
    let pageCount = 0;
    let found:
      | Awaited<ReturnType<LongProjectStore["search"]>>["matches"][number]
      | undefined;
    do {
      const page = await store.search(created.projectDirectory, {
        query: "needle",
        fileIds: [body.id],
        maxResults: 10,
        ...(resume ? { resume } : {})
      });
      pageCount += 1;
      found ??= page.matches[0];
      resume = page.nextResume ?? undefined;
    } while (resume);

    expect(pageCount).toBeGreaterThan(1);
    expect(found).toMatchObject({
      fileId: body.id,
      revision: written.fileRevision,
      offset: 8 * 1024 * 1024 + 1,
      endOffset: 8 * 1024 * 1024 + 7
    });
  });

  it("uses Unicode code-point offsets and NFC-equivalent matching", async () => {
    const root = await temporaryRoot("deepwrite-long-unicode-search-");
    const store = new LongProjectStore({ now: () => FIXED_NOW });
    const created = await store.createBook(root, {
      id: "longbook_unicode-search",
      title: "Unicode 搜索",
      genre: "其他"
    });
    const body = created.book.workspaceIndex.chapters[0]!.body;
    await store.writeDocument(created.projectDirectory, {
      fileId: body.id,
      content: "😀Cafe\u0301 之后",
      expectedFileRevision: body.revision,
      expectedWorkspaceRevision: 0,
      expectedProjectRevision: 0
    });

    const page = await store.search(created.projectDirectory, {
      query: "Café",
      fileIds: [body.id],
      maxResults: 10
    });
    expect(page.matches).toEqual([
      expect.objectContaining({
        fileId: body.id,
        offset: 1,
        endOffset: 6,
        preview: "😀Cafe\u0301 之后"
      })
    ]);
  });

  it("resumes by file and character without losing more than 100 hits", async () => {
    const root = await temporaryRoot("deepwrite-long-resume-search-");
    const store = new LongProjectStore({ now: () => FIXED_NOW });
    const created = await store.createBook(root, {
      id: "longbook_resume-search",
      title: "游标搜索",
      genre: "其他"
    });
    const body = created.book.workspaceIndex.chapters[0]!.body;
    await store.writeDocument(created.projectDirectory, {
      fileId: body.id,
      content: "hit ".repeat(250),
      expectedFileRevision: body.revision,
      expectedWorkspaceRevision: 0,
      expectedProjectRevision: 0
    });

    const offsets: number[] = [];
    const pageSizes: number[] = [];
    let resume: LongProjectSearchResume | undefined;
    do {
      const page = await store.search(created.projectDirectory, {
        query: "hit",
        fileIds: [body.id],
        maxResults: 100,
        ...(resume ? { resume } : {})
      });
      offsets.push(...page.matches.map(({ offset }) => offset));
      pageSizes.push(page.matches.length);
      resume = page.nextResume ?? undefined;
    } while (resume);

    expect(pageSizes).toEqual([100, 100, 50]);
    expect(offsets).toHaveLength(250);
    expect(offsets).toEqual(
      Array.from({ length: 250 }, (_, index) => index * 4)
    );
  });

  it("rejects a resume cursor after its current file changes", async () => {
    const root = await temporaryRoot("deepwrite-long-stale-search-");
    const store = new LongProjectStore({ now: () => FIXED_NOW });
    const created = await store.createBook(root, {
      id: "longbook_stale-search",
      title: "失效游标",
      genre: "其他"
    });
    const body = created.book.workspaceIndex.chapters[0]!.body;
    const written = await store.writeDocument(created.projectDirectory, {
      fileId: body.id,
      content: "hit hit",
      expectedFileRevision: body.revision,
      expectedWorkspaceRevision: 0,
      expectedProjectRevision: 0
    });
    const firstPage = await store.search(created.projectDirectory, {
      query: "hit",
      fileIds: [body.id],
      maxResults: 1
    });
    expect(firstPage.nextResume).not.toBeNull();

    await store.writeDocument(created.projectDirectory, {
      fileId: body.id,
      content: "hit changed",
      expectedFileRevision: written.fileRevision,
      expectedWorkspaceRevision: written.workspaceRevision,
      expectedProjectRevision: written.projectRevision
    });

    await expect(
      store.search(created.projectDirectory, {
        query: "hit",
        fileIds: [body.id],
        maxResults: 1,
        resume: firstPage.nextResume!
      })
    ).rejects.toThrow(/文件已发生变化/u);
  });
});

describe("LongWorkspaceService opaque search cursor", () => {
  it("paginates every hit in one file and binds the cursor to its query/revision", async () => {
    const root = await temporaryRoot("deepwrite-long-service-search-");
    const service = new LongWorkspaceService({
      userDataPath: join(root, "user-data"),
      now: () => FIXED_NOW
    });
    const created = await service.create(root, {
      title: "分页搜索",
      genre: "其他"
    });
    const chapter = created.book.workspaceIndex.chapters[0]!;
    const initial = await service.readDocument({
      bookId: created.book.id,
      fileId: chapter.body.id,
      offset: 0,
      maxCharacters: 10
    });
    await service.writeDocument({
      bookId: created.book.id,
      fileId: chapter.body.id,
      content: "needle ".repeat(235),
      baseRevision: initial.file.revision,
      baseWorkspaceRevision: initial.workspaceRevision,
      baseProjectRevision: initial.projectRevision
    });

    const offsets: number[] = [];
    let cursor: string | undefined;
    let firstCursor: string | undefined;
    do {
      const page = await service.search({
        bookId: created.book.id,
        query: "needle",
        scope: "draft",
        limit: 37,
        maxSnippetCharacters: 80,
        ...(cursor ? { cursor } : {})
      });
      offsets.push(...page.hits.map(({ start }) => start));
      cursor = page.nextCursor ?? undefined;
      firstCursor ??= cursor;
      if (cursor) expect(cursor).toMatch(/^v2\.[A-Za-z0-9_-]+$/u);
    } while (cursor);

    expect(offsets).toHaveLength(235);
    expect(new Set(offsets).size).toBe(235);
    expect(offsets).toEqual(
      Array.from({ length: 235 }, (_, index) => index * 7)
    );
    await expect(
      service.search({
        bookId: created.book.id,
        query: "other",
        scope: "draft",
        cursor: firstCursor!,
        limit: 10,
        maxSnippetCharacters: 80
      })
    ).rejects.toThrow(/游标/u);

    const latestBody = await service.readDocument({
      bookId: created.book.id,
      fileId: chapter.body.id,
      offset: 0,
      maxCharacters: 10
    });
    await service.writeDocument({
      bookId: created.book.id,
      fileId: chapter.body.id,
      content: "结构版本发生变化",
      baseRevision: latestBody.file.revision,
      baseWorkspaceRevision: latestBody.workspaceRevision,
      baseProjectRevision: latestBody.projectRevision
    });
    await expect(
      service.search({
        bookId: created.book.id,
        query: "needle",
        scope: "draft",
        cursor: firstCursor!,
        limit: 10,
        maxSnippetCharacters: 80
      })
    ).rejects.toThrow(/游标/u);
  });

  it("resumes across more than 500 authorized files and finds a later hit", async () => {
    const root = await temporaryRoot("deepwrite-long-many-file-search-");
    const service = new LongWorkspaceService({
      userDataPath: join(root, "user-data"),
      now: () => FIXED_NOW
    });
    const created = await service.create(root, {
      title: "多文件搜索",
      genre: "其他"
    });
    const operations = Array.from({ length: 130 }, (_, index) => {
      const characterId = `character_search-${index + 1}`;
      const reference = (id: string, filename: Parameters<
        typeof longCharacterFilePath
      >[1]) =>
        createEmptyLongMarkdownFileReference(
          id,
          longCharacterFilePath(characterId, filename),
          FIXED_NOW
        );
      return {
        type: "character.create" as const,
        character: {
          id: characterId,
          name: `人物${index + 1}`,
          group: "major_supporting" as const,
          order: index + 1,
          aliases: []
        },
        files: {
          characterId,
          coreProfile: reference(
            longCharacterCoreProfileFileId(characterId),
            "core-profile.md"
          ),
          relationships: reference(
            longCharacterRelationshipsFileId(characterId),
            "relationships.md"
          ),
          currentState: reference(
            longCharacterCurrentStateFileId(characterId),
            "current-state.md"
          ),
          history: reference(
            longCharacterHistoryFileId(characterId),
            "history.md"
          )
        }
      };
    });
    await service.applyOperations({
      bookId: created.book.id,
      batch: {
        baseRevision: 0,
        updatedAt: FIXED_NOW,
        operations,
        documentWrites: []
      },
      baseProjectRevision: 0
    });
    const opened = await service.open({ bookId: created.book.id });
    const lastHistory = opened.book.workspaceIndex.characterFiles.at(-1)!.history;
    const initial = await service.readDocument({
      bookId: created.book.id,
      fileId: lastHistory.id,
      offset: 0,
      maxCharacters: 10
    });
    await service.writeDocument({
      bookId: created.book.id,
      fileId: lastHistory.id,
      content: "第 520 个角色文件中的 needle",
      baseRevision: initial.file.revision,
      baseWorkspaceRevision: initial.workspaceRevision,
      baseProjectRevision: initial.projectRevision
    });

    let cursor: string | undefined;
    let searchPages = 0;
    let hits: Awaited<ReturnType<typeof service.search>>["hits"] = [];
    do {
      const page = await service.search({
        bookId: created.book.id,
        query: "needle",
        scope: "character_design",
        limit: 20,
        maxSnippetCharacters: 80,
        ...(cursor ? { cursor } : {})
      });
      searchPages += 1;
      hits.push(...page.hits);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(searchPages).toBeGreaterThan(8);
    expect(hits).toEqual([
      expect.objectContaining({
        fileId: lastHistory.id,
        root: "character_design",
        title: "人物130 · 历史"
      })
    ]);
    await expect(
      service.search({
        bookId: created.book.id,
        query: "needle",
        scope: "draft",
        limit: 20,
        maxSnippetCharacters: 80
      })
    ).resolves.toMatchObject({ hits: [], nextCursor: null });
  }, 60_000);
});
