import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LONG_AGENTS_MD,
  LONG_AGENTS_MD_PATH,
  LONG_BOOK_LINE_FILE_ID,
  LONG_CHARACTER_OVERVIEW_FILE_ID,
  LONG_CHARACTER_OVERVIEW_PATH,
  LONG_WORKSPACE_INDEX_PATH,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterContinuityFilePath,
  longChapterCharacterCurrentStateFileId,
  longChapterCharacterHistoryFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterHandoffFileId,
  longChapterWorldRevealsFileId,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterFilePath,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  createEmptyLongMarkdownFileReference,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  serializeLongWorldbuildingMarkdownList,
  type LongForeshadowing
} from "@deepwrite/contracts";
import {
  projectTransactionContentSha256
} from "./project-transaction";
import {
  createLongFileRevision,
  deriveLongForeshadowingStatus,
  LongProjectStore
} from "./long-project-store";

const FIXED_NOW = "2026-07-26T12:00:00.000Z";
const MAX_MARKDOWN_BYTES = 32 * 1024 * 1024;
const temporaryRoots: string[] = [];

async function temporaryParent(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-long-project-"));
  temporaryRoots.push(root);
  return root;
}

function store(): LongProjectStore {
  return new LongProjectStore({ now: () => FIXED_NOW });
}

async function createFixture(suffix: string) {
  const parent = await temporaryParent();
  const projectStore = store();
  const created = await projectStore.createBook(parent, {
    id: `longbook_${suffix}`,
    title: `长篇 ${suffix}`,
    genre: "悬疑"
  });
  return { parent, projectStore, created };
}

function firstChapterFiles(
  book: Awaited<ReturnType<LongProjectStore["openBook"]>>["book"]
) {
  const chapter = book.workspaceIndex.chapters[0]!;
  return {
    body: chapter.body,
    card: chapter.card,
    characterState: chapter.characterState,
    handoff: chapter.handoff
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("LongProjectStore", () => {
  it("initializes AGENTS.md, lazily restores missing files, and copies it on duplicate", async () => {
    const { parent, projectStore, created } = await createFixture("agents-md");
    const agentsPath = join(created.projectDirectory, LONG_AGENTS_MD_PATH);
    await expect(readFile(agentsPath, "utf8")).resolves.toBe(
      DEFAULT_LONG_AGENTS_MD
    );
    await expect(
      projectStore.readAgentsMd(created.projectDirectory)
    ).resolves.toEqual({
      content: DEFAULT_LONG_AGENTS_MD,
      truncated: false
    });

    const custom = "# 长篇上下文\n\n自定义说明";
    await projectStore.writeAgentsMd(created.projectDirectory, custom);
    await expect(
      projectStore.readAgentsMd(created.projectDirectory)
    ).resolves.toEqual({ content: custom, truncated: false });

    await unlink(agentsPath);
    await expect(
      projectStore.readAgentsMd(created.projectDirectory)
    ).resolves.toEqual({
      content: DEFAULT_LONG_AGENTS_MD,
      truncated: false
    });
    await expect(readFile(agentsPath, "utf8")).resolves.toBe(
      DEFAULT_LONG_AGENTS_MD
    );

    await projectStore.writeAgentsMd(created.projectDirectory, custom);
    const duplicated = await projectStore.duplicateBook(
      parent,
      created.projectDirectory,
      "副本"
    );
    await expect(
      projectStore.readAgentsMd(duplicated.projectDirectory)
    ).resolves.toEqual({ content: custom, truncated: false });
  });

  it("defaults new long books to right-side item layouts and persists changes", async () => {
    const { projectStore, created } = await createFixture(
      "worldbuilding-item-layout"
    );
    expect(
      created.book.workspaceIndex.featureSettings.worldbuildingItemLayout
    ).toBe("right-list");
    expect(
      created.book.workspaceIndex.featureSettings
        .characterAndContinuityItemLayout
    ).toBe("right-list");
    expect(created.book.workspaceIndex.featureSettings.plotItemLayout).toBe(
      "right-list"
    );

    await projectStore.applyWorkspaceOperations(created.projectDirectory, {
      batch: {
        baseRevision: created.book.workspaceIndex.revision,
        updatedAt: FIXED_NOW,
        operations: [
          {
            type: "featureSettings.update",
            patch: {
              worldbuildingItemLayout: "left-tree",
              characterAndContinuityItemLayout: "left-tree",
              plotItemLayout: "left-tree"
            }
          }
        ],
        documentWrites: []
      },
      expectedProjectRevision: created.summary.projectRevision
    });

    const reopened = await store().openBook(created.projectDirectory);
    expect(
      reopened.book.workspaceIndex.featureSettings.worldbuildingItemLayout
    ).toBe("left-tree");
    expect(
      reopened.book.workspaceIndex.featureSettings
        .characterAndContinuityItemLayout
    ).toBe("left-tree");
    expect(reopened.book.workspaceIndex.featureSettings.plotItemLayout).toBe(
      "left-tree"
    );
  });

  it("creates a missing nested parent directory for a new long book", async () => {
    const root = await temporaryParent();
    const parent = join(root, "小说", "Deepwrite", "books");

    const created = await store().createBook(parent, {
      id: "longbook_missing-parent",
      title: "首次创建长篇",
      genre: "悬疑"
    });

    expect(created.projectDirectory).toBe(
      join(await realpath(parent), "longbook_missing-parent")
    );
    expect((await lstat(parent)).isDirectory()).toBe(true);
    expect((await lstat(created.projectDirectory)).isDirectory()).toBe(true);
  });

  it("uses a full SHA-256 v2 revision with UTF-8 byte length", () => {
    expect(createLongFileRevision("正文")).toMatch(
      /^v2:6:[0-9a-f]{64}$/u
    );
    expect(createLongFileRevision("正文")).toBe(
      `v2:6:${projectTransactionContentSha256("正文")}`
    );
  });

  it("reads legacy v1 revisions and upgrades the hydrated file to v2", async () => {
    const { projectStore, created } = await createFixture("legacy-revision");
    const indexPath = join(
      created.projectDirectory,
      LONG_WORKSPACE_INDEX_PATH
    );
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as {
      chapters: Array<{ body: { revision: string } }>;
    };
    index.chapters[0]!.body.revision = `v1:0:${projectTransactionContentSha256(
      ""
    ).slice(0, 8)}`;
    const indexContent = `${JSON.stringify(index, null, 2)}\n`;
    await writeFile(indexPath, indexContent, "utf8");
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8")
    ) as { workspaceIndexFile: { revision: string } };
    manifest.workspaceIndexFile.revision = `v1:${Buffer.byteLength(
      indexContent,
      "utf8"
    )}:${projectTransactionContentSha256(indexContent).slice(0, 8)}`;
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const opened = await projectStore.openBook(created.projectDirectory);
    const body = firstChapterFiles(opened.book).body;
    expect(body.revision).toMatch(/^v1:/u);
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: body.id
      })
    ).resolves.toMatchObject({
      content: "",
      revision: expect.stringMatching(/^v2:0:[0-9a-f]{64}$/u)
    });
  });

  it("migrates legacy aggregate worldbuilding Markdown into independent item files on open", async () => {
    const { projectStore, created } = await createFixture(
      "legacy-worldbuilding-storage"
    );
    const indexPath = join(created.projectDirectory, LONG_WORKSPACE_INDEX_PATH);
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const legacyPath = "long/worldbuilding/legacy-rules/content.md";
    const legacyContent = serializeLongWorldbuildingMarkdownList([
      {
        id: "worlditem_legacy_rule",
        title: "旧规则",
        content: "旧项目中的独立规则正文。"
      }
    ]);
    await mkdir(join(created.projectDirectory, "long/worldbuilding/legacy-rules"), {
      recursive: true
    });
    await writeFile(
      join(created.projectDirectory, legacyPath),
      legacyContent,
      "utf8"
    );
    const index = JSON.parse(await readFile(indexPath, "utf8")) as {
      worldbuilding: Array<Record<string, unknown>>;
    };
    const category = index.worldbuilding[0]!;
    const overview = category.overview as { path: string };
    await unlink(join(created.projectDirectory, overview.path));
    index.worldbuilding[0] = {
      id: category.id,
      title: category.title,
      order: category.order,
      format: "list",
      contentAuthority: "markdown",
      file: {
        id: longWorldbuildingFileId(String(category.id)),
        path: legacyPath,
        revision: createLongFileRevision(legacyContent),
        updatedAt: FIXED_NOW
      }
    };
    const indexContent = `${JSON.stringify(index, null, 2)}\n`;
    await writeFile(indexPath, indexContent, "utf8");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      workspaceIndexFile: { revision: string };
    };
    manifest.workspaceIndexFile.revision =
      createLongFileRevision(indexContent);
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const opened = await projectStore.openBook(created.projectDirectory);
    const migrated = opened.book.workspaceIndex.worldbuilding[0]!;
    if (migrated.format !== "list") throw new Error("expected list category");
    expect(migrated.contentAuthority).toBe("files");
    expect(migrated.overview).toMatchObject({
      id: longWorldbuildingOverviewFileId(migrated.id),
      path: longWorldbuildingOverviewContentPath(migrated.id)
    });
    expect(migrated.items).toHaveLength(1);
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: migrated.items[0]!.file.id
      })
    ).resolves.toMatchObject({
      content: "旧项目中的独立规则正文。"
    });
    await expect(
      lstat(join(created.projectDirectory, legacyPath))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves an existing chapter-card file while migrating legacy structured fields", async () => {
    const { projectStore, created } = await createFixture(
      "legacy-chapter-card-content"
    );
    const indexPath = join(created.projectDirectory, LONG_WORKSPACE_INDEX_PATH);
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as {
      plot: { chapterCards: Array<Record<string, unknown>> };
      chapters: Array<{ card: { id: string; path: string; revision: string } }>;
    };
    const chapterCard = index.plot.chapterCards[0]!;
    const cardFile = index.chapters[0]!.card;
    const existingContent = "## 已有章卡内容\n\n保留这段人工编辑。";
    await writeFile(
      join(created.projectDirectory, cardFile.path),
      existingContent,
      "utf8"
    );
    cardFile.revision = createLongFileRevision(existingContent);
    chapterCard.outline = "旧版章节规划";
    chapterCard.worldConstraints = "旧版世界约束";
    chapterCard.characterIds = [];
    const indexContent = `${JSON.stringify(index, null, 2)}\n`;
    await writeFile(indexPath, indexContent, "utf8");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      workspaceIndexFile: { revision: string };
    };
    manifest.workspaceIndexFile.revision = createLongFileRevision(indexContent);
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const opened = await projectStore.openBook(created.projectDirectory);
    const migratedCard = opened.book.workspaceIndex.plot.chapterCards[0]!;
    expect(migratedCard).not.toHaveProperty("outline");
    expect(migratedCard).not.toHaveProperty("worldConstraints");
    expect(migratedCard).not.toHaveProperty("characterIds");
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: cardFile.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining(existingContent)
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: cardFile.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining("旧版章节规划")
    });
  });

  it("recreates a missing chapter-card file from legacy structured content", async () => {
    const { created } = await createFixture("missing-legacy-chapter-card");
    const indexPath = join(created.projectDirectory, LONG_WORKSPACE_INDEX_PATH);
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as {
      plot: { chapterCards: Array<Record<string, unknown>> };
      chapters: Array<{ card: { id: string; path: string } }>;
    };
    const chapterCard = index.plot.chapterCards[0]!;
    const cardFile = index.chapters[0]!.card;
    chapterCard.outline = "重启后应恢复的章节规划";
    chapterCard.worldConstraints = "重启后应恢复的世界约束";
    chapterCard.characterIds = [];
    await unlink(join(created.projectDirectory, cardFile.path));
    const indexContent = `${JSON.stringify(index, null, 2)}\n`;
    await writeFile(indexPath, indexContent, "utf8");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      workspaceIndexFile: { revision: string };
    };
    manifest.workspaceIndexFile.revision = createLongFileRevision(indexContent);
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const restartedStore = store();
    const reopened = await restartedStore.openBook(created.projectDirectory);
    const recoveredCard = reopened.book.workspaceIndex.chapters[0]!.card;
    await expect(
      restartedStore.readDocument(created.projectDirectory, {
        fileId: recoveredCard.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining("重启后应恢复的章节规划")
    });
    await expect(
      lstat(join(created.projectDirectory, recoveredCard.path))
    ).resolves.toBeDefined();
  });

  it("repairs missing overview files for existing list worldbuilding categories", async () => {
    const { projectStore, created } = await createFixture(
      "missing-worldbuilding-overview"
    );
    const categories = created.book.workspaceIndex.worldbuilding.filter(
      (category) => category.format === "list"
    );
    expect(categories.length).toBeGreaterThan(1);
    for (const category of categories) {
      expect(category.overview).toBeDefined();
      await expect(
        lstat(
          join(
            created.projectDirectory,
            category.overview!.path
          )
        )
      ).resolves.toBeDefined();
    }

    const target = categories[0]!;
    await unlink(join(created.projectDirectory, target.overview!.path));

    const opened = await projectStore.openBook(created.projectDirectory);
    const repaired = opened.book.workspaceIndex.worldbuilding.find(
      ({ id }) => id === target.id
    );
    if (!repaired || repaired.format !== "list" || !repaired.overview) {
      throw new Error("expected repaired list worldbuilding category");
    }
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: repaired.overview.id
      })
    ).resolves.toMatchObject({ content: "" });
  });

  it("derives every foreshadowing lifecycle status from committed beat types", () => {
    const thread = (
      status: LongForeshadowing["status"],
      types: LongForeshadowing["beats"][number]["type"][]
    ): LongForeshadowing =>
      ({
        id: "foreshadow_status",
        title: "状态推导",
        coreQuestion: "",
        truthEventId: null,
        expectedReaderEffect: "",
        status,
        beats: types.map((type, index) => ({
          id: `beat_status-${index}`,
          type,
          order: index + 1,
          eventId: null,
          placementId: null,
          chapterCardId: null,
          plannedScope: "测试",
          note: "",
          status: "committed",
          commitId: "commit_status"
        }))
      }) as LongForeshadowing;

    expect(deriveLongForeshadowingStatus(thread("planned", ["source"]))).toBe(
      "planned"
    );
    expect(deriveLongForeshadowingStatus(thread("planned", ["plant"]))).toBe(
      "open"
    );
    for (const type of [
      "reinforce",
      "misdirect",
      "partial_reveal"
    ] as const) {
      expect(
        deriveLongForeshadowingStatus(thread("open", [type]))
      ).toBe("progressing");
    }
    for (const type of ["reveal", "payoff"] as const) {
      expect(
        deriveLongForeshadowingStatus(thread("progressing", [type]))
      ).toBe("resolved");
    }
    expect(
      deriveLongForeshadowingStatus(thread("abandoned", ["payoff"]))
    ).toBe("abandoned");
  });

  it("creates through staging and opens the independent default project", async () => {
    const { parent, projectStore, created } = await createFixture("create");

    expect(created.book.bookType).toBe("long");
    expect(created.book.workspaceIndex.worldbuilding).toHaveLength(7);
    expect(created.book.workspaceIndex.characterTypes.map(({ id }) => id)).toEqual([
      "protagonist",
      "major_supporting",
      "minor_supporting",
      "passerby"
    ]);
    expect(created.book.workspaceIndex.plot.volumes).toHaveLength(1);
    expect(created.book.workspaceIndex.plot.arcs).toHaveLength(1);
    expect(created.book.workspaceIndex.plot.arcs[0]?.title).toBe("第一剧情点");
    expect(created.book.workspaceIndex.plot.chapterCards).toHaveLength(1);
    expect(created.book.workspaceIndex.chapters).toHaveLength(1);
    expect(
      created.book.workspaceIndex.chapters[0]!.foreshadowingChanges
    ).toMatchObject({
      id: longChapterForeshadowingChangesFileId(
        created.book.workspaceIndex.chapters[0]!.chapterCardId
      ),
      path: longChapterContinuityFilePath(
        created.book.workspaceIndex.chapters[0]!.chapterCardId,
        "foreshadowing-changes.md"
      )
    });
    expect(created.summary.navigation.counts).toMatchObject({
      worldbuildingCategories: 7,
      volumes: 1,
      arcs: 1,
      chapterCards: 1
    });

    const files = [
      created.book.workspaceIndex.bookLine,
      ...Object.values(firstChapterFiles(created.book)),
      created.book.workspaceIndex.chapters[0]!.foreshadowingChanges
    ];
    for (const file of files) {
      await expect(
        projectStore.readDocument(created.projectDirectory, {
          fileId: file.id
        })
      ).resolves.toMatchObject({ content: "", totalCharacters: 0 });
    }

    const opened = await projectStore.openBook(created.projectDirectory);
    expect(opened.book.id).toBe(created.book.id);
    expect(JSON.stringify(opened.summary)).not.toContain("workspaceIndex");
    expect(JSON.stringify(opened.summary)).not.toContain("body.md");
    expect(await readdir(parent)).toEqual(["longbook_create"]);
    await expect(
      lstat(join(created.projectDirectory, "deepwrite.json"))
    ).resolves.toMatchObject({ isFile: expect.any(Function) });
    await expect(
      lstat(join(created.projectDirectory, LONG_WORKSPACE_INDEX_PATH))
    ).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it("persists chapter-card text across a complete store restart", async () => {
    const { created } = await createFixture("chapter-card-restart");
    const card = firstChapterFiles(created.book).card;
    const content = "## 第一章\n\n这是重启后仍需读取的章卡内容。";
    const initialStore = store();
    await initialStore.writeDocument(created.projectDirectory, {
      fileId: card.id,
      content,
      expectedFileRevision: card.revision,
      expectedWorkspaceRevision: 0,
      expectedProjectRevision: 0
    });

    const restartedStore = store();
    const reopened = await restartedStore.openBook(created.projectDirectory);
    const reopenedCard = firstChapterFiles(reopened.book).card;
    await expect(
      restartedStore.readDocument(created.projectDirectory, {
        fileId: reopenedCard.id
      })
    ).resolves.toMatchObject({ content });
  });

  it("commits a chapter without adding foreshadowing output when no overview touchpoint applies", async () => {
    const { projectStore, created } = await createFixture(
      "text-file-no-foreshadowing"
    );
    const chapter = created.book.workspaceIndex.chapters[0]!;
    const contents = [
      [chapter.body, "第一章正文没有触及任何已规划伏笔。"],
      [chapter.characterState, "章末状态保持稳定。"],
      [chapter.handoff, "下一章从日常行程继续。"]
    ] as const;
    const written = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: FIXED_NOW,
          operations: [],
          documentWrites: contents.map(([reference, content], index) => ({
            proposalId: `proposal_no_foreshadowing_${index}`,
            fileId: reference.id,
            mode: "replace" as const,
            expectedRevision: reference.revision,
            nextRevision: createLongFileRevision(content),
            updatedAt: FIXED_NOW,
            content,
            reason: "写入无伏笔章节的连续性文件"
          }))
        },
        expectedProjectRevision: 0
      }
    );
    const writtenChapter = written.book.workspaceIndex.chapters[0]!;
    const committed = await projectStore.commitChapter(
      created.projectDirectory,
      {
        mode: "text_files",
        chapterCardId: writtenChapter.chapterCardId,
        chapterFileRevisions: { body: writtenChapter.body.revision },
        continuityFileRevisions: [
          {
            fileId: writtenChapter.characterState.id,
            revision: writtenChapter.characterState.revision
          },
          {
            fileId: writtenChapter.handoff.id,
            revision: writtenChapter.handoff.revision
          }
        ],
        foreshadowingBeatDecisions: {},
        commitMessage: "归档无既有伏笔触点的章节",
        baseWorkspaceRevision: 1,
        baseProjectRevision: 1
      }
    );

    expect(committed.record.foreshadowingBeatChanges).toEqual([]);
    expect(committed.record.foreshadowingThreadChanges).toEqual([]);
    expect(
      committed.record.continuityFiles.map(({ fileId }) => fileId)
    ).toEqual([
      writtenChapter.characterState.id,
      writtenChapter.handoff.id
    ]);
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: writtenChapter.foreshadowingChanges.id
      })
    ).resolves.toMatchObject({ content: "" });

    await expect(
      projectStore.rollbackLastCommit(created.projectDirectory, {
        expectedCommitId: committed.record.id,
        baseWorkspaceRevision: 2,
        baseProjectRevision: 2
      })
    ).resolves.toMatchObject({
      rolledBackCommitId: committed.record.id,
      committedThroughChapterId: null,
      workspaceRevision: 3,
      projectRevision: 3
    });
  });

  it("commits chapter continuity as lightweight per-chapter text files and leaves them editable after rollback", async () => {
    const { projectStore, created } = await createFixture(
      "text-file-continuity"
    );
    const chapterCardId =
      created.book.workspaceIndex.plot.chapterCards[0]!.id;
    const arcId = created.book.workspaceIndex.plot.arcs[0]!.id;
    const emptyRevision = createLongFileRevision("");
    const characterId = "character_linlan";
    const characterFiles = {
      characterId,
      coreProfile: createEmptyLongMarkdownFileReference(
        longCharacterCoreProfileFileId(characterId),
        longCharacterFilePath(characterId, "core-profile.md"),
        FIXED_NOW
      ),
      relationships: createEmptyLongMarkdownFileReference(
        longCharacterRelationshipsFileId(characterId),
        longCharacterFilePath(characterId, "relationships.md"),
        FIXED_NOW
      ),
      currentState: createEmptyLongMarkdownFileReference(
        longCharacterCurrentStateFileId(characterId),
        longCharacterFilePath(characterId, "current-state.md"),
        FIXED_NOW
      ),
      history: createEmptyLongMarkdownFileReference(
        longCharacterHistoryFileId(characterId),
        longCharacterFilePath(characterId, "history.md"),
        FIXED_NOW
      )
    };
    const worldReveals = createEmptyLongMarkdownFileReference(
      longChapterWorldRevealsFileId(chapterCardId),
      longChapterContinuityFilePath(chapterCardId, "world-reveals.md"),
      FIXED_NOW
    );
    const characterCurrentState =
      createEmptyLongMarkdownFileReference(
        longChapterCharacterCurrentStateFileId(
          chapterCardId,
          characterId
        ),
        longChapterCharacterContinuityFilePath(
          chapterCardId,
          characterId,
          "current-state.md"
        ),
        FIXED_NOW
      );
    const characterHistory = createEmptyLongMarkdownFileReference(
      longChapterCharacterHistoryFileId(chapterCardId, characterId),
      longChapterCharacterContinuityFilePath(
        chapterCardId,
        characterId,
        "history.md"
      ),
      FIXED_NOW
    );

    const withContinuityFiles =
      await projectStore.applyWorkspaceOperations(
        created.projectDirectory,
        {
          batch: {
            baseRevision: 0,
            updatedAt: FIXED_NOW,
            operations: [
              {
                type: "character.create",
                character: {
                  id: characterId,
                  name: "林岚",
                  group: "protagonist",
                  order: 1,
                  aliases: []
                },
                files: characterFiles
              },
              {
                type: "event.create",
                event: {
                  id: "event_text_continuity",
                  title: "收到旧信",
                  summary: "林岚在雨夜收到无法烧毁的信。",
                  timeMode: "sequence",
                  timeLabel: "第一天",
                  storyOrder: 1,
                  location: "林岚家",
                  arcIds: [arcId],
                  characterIds: [characterId]
                }
              },
              {
                type: "placement.create",
                placement: {
                  id: "placement_text_continuity",
                  eventId: "event_text_continuity",
                  chapterCardId,
                  orderInChapter: 1,
                  mode: "scene",
                  disclosure: "hint",
                  writingPrompt: "在雨夜呈现来信。",
                  status: "planned",
                  commitId: null
                }
              },
              {
                type: "foreshadowing.create",
                thread: {
                  id: "foreshadow_text_continuity",
                  title: "寄信人身份",
                  coreQuestion: "谁寄出了旧信？",
                  truthEventId: "event_text_continuity",
                  expectedReaderEffect: "产生怀疑。",
                  status: "planned",
                  beats: [
                    {
                      id: "beat_text_continuity",
                      type: "plant",
                      order: 1,
                      eventId: "event_text_continuity",
                      placementId: "placement_text_continuity",
                      chapterCardId,
                      plannedScope: "",
                      note: "首次出现。",
                      status: "planned",
                      commitId: null
                    }
                  ]
                }
              },
              {
                type: "chapterContinuity.worldReveals.create",
                chapterCardId,
                file: worldReveals
              },
              {
                type: "chapterContinuity.character.create",
                chapterCardId,
                characterId,
                currentState: characterCurrentState,
                history: characterHistory
              }
            ],
            documentWrites: []
          },
          expectedProjectRevision: 0
        }
      );
    const createdChapter =
      withContinuityFiles.book.workspaceIndex.chapters[0]!;
    expect(createdChapter.worldReveals).toEqual(worldReveals);
    expect(createdChapter.characterContinuity).toEqual([
      {
        characterId,
        currentState: characterCurrentState,
        history: characterHistory
      }
    ]);
    for (const reference of [
      worldReveals,
      characterCurrentState,
      characterHistory
    ]) {
      await expect(
        projectStore.readDocument(created.projectDirectory, {
          fileId: reference.id
        })
      ).resolves.toMatchObject({ content: "", revision: emptyRevision });
    }

    const chapterContinuity = createdChapter.characterContinuity[0]!;
    const textDocuments = [
      {
        reference: createdChapter.body,
        content: "雨夜里，林岚收到一封带有旧王朝印记的信。"
      },
      {
        reference: createdChapter.characterState,
        content: "林岚持有旧信，决定追查寄信人。"
      },
      {
        reference: createdChapter.handoff,
        content: "下一章从信封上的旧邮戳继续追查。"
      },
      {
        reference: createdChapter.foreshadowingChanges,
        content: "寄信人身份伏笔已种下，等待后续揭露。"
      },
      {
        reference: createdChapter.worldReveals!,
        content: "旧王朝曾使用带月纹的官方火漆。"
      },
      {
        reference: chapterContinuity.currentState,
        content: "林岚：警觉；持有旧信；目标是确认寄信人。"
      },
      {
        reference: chapterContinuity.history,
        content: "第一章：收到旧信并开始调查。"
      }
    ];
    const written = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 1,
          updatedAt: FIXED_NOW,
          operations: [],
          documentWrites: textDocuments.map(
            ({ reference, content }, index) => ({
              proposalId: `proposal_continuity_${index}`,
              fileId: reference.id,
              mode: "replace" as const,
              expectedRevision: reference.revision,
              nextRevision: createLongFileRevision(content),
              updatedAt: FIXED_NOW,
              content,
              reason: "记录第一章连续性"
            })
          )
        },
        expectedProjectRevision: 1
      }
    );
    const writtenChapter = written.book.workspaceIndex.chapters[0]!;
    const writtenCharacterContinuity =
      writtenChapter.characterContinuity[0]!;
    const continuityReferences = [
      writtenChapter.characterState,
      writtenChapter.handoff,
      writtenChapter.foreshadowingChanges,
      writtenChapter.worldReveals!,
      writtenCharacterContinuity.currentState,
      writtenCharacterContinuity.history
    ];
    const continuityFileRevisions = continuityReferences.map(
      ({ id, revision }) => ({ fileId: id, revision })
    );
    const commitInput = {
      mode: "text_files" as const,
      chapterCardId,
      chapterFileRevisions: {
        body: writtenChapter.body.revision
      },
      continuityFileRevisions,
      foreshadowingBeatDecisions: {
        beat_text_continuity: {
          status: "committed" as const,
          note: "正文写明林岚收到带旧王朝印记与火漆的信。"
        }
      },
      commitMessage: "留存第一章连续性文本",
      baseWorkspaceRevision: 2,
      baseProjectRevision: 2
    };

    await expect(
      projectStore.commitChapter(created.projectDirectory, {
        ...commitInput,
        foreshadowingBeatDecisions: {}
      })
    ).rejects.toThrow(/伏笔触点决策必须完整覆盖/u);
    await expect(
      projectStore.commitChapter(created.projectDirectory, {
        ...commitInput,
        continuityFileRevisions: continuityFileRevisions.slice(0, -1)
      })
    ).rejects.toThrow(/必须精确引用/u);
    await expect(
      projectStore.commitChapter(created.projectDirectory, {
        ...commitInput,
        continuityFileRevisions: continuityFileRevisions.map(
          (entry, index) =>
            index === 0
              ? {
                  ...entry,
                  revision: createLongFileRevision("过期的章末状态")
                }
              : entry
        )
      })
    ).rejects.toMatchObject({ scope: "file" });

    const projectionBefore = structuredClone(
      written.book.workspaceIndex.ledger.projection
    );
    const globalCharacterFilesBefore =
      written.book.workspaceIndex.characterFiles[0]!;
    const committed = await projectStore.commitChapter(
      created.projectDirectory,
      commitInput
    );
    expect(committed.record).toMatchObject({
      schemaVersion: 4,
      sequence: 1,
      chapterCardId,
      commitMessage: "留存第一章连续性文本",
      placementChanges: [
        {
          placementId: "placement_text_continuity",
          before: { status: "planned", commitId: null },
          after: {
            status: "committed",
            commitId: committed.record.id
          },
          note: ""
        }
      ],
      foreshadowingBeatChanges: [
        {
          foreshadowingId: "foreshadow_text_continuity",
          beatId: "beat_text_continuity",
          before: { status: "planned", commitId: null },
          after: {
            status: "committed",
            commitId: committed.record.id
          },
          note: "正文写明林岚收到带旧王朝印记与火漆的信。"
        }
      ],
      foreshadowingThreadChanges: [
        {
          foreshadowingId: "foreshadow_text_continuity",
          before: "planned",
          after: "open"
        }
      ],
      fileChanges: [],
      continuityFiles: continuityReferences.map(({ id, path, revision }) => ({
        fileId: id,
        path,
        revision
      }))
    });
    const afterCommit = await projectStore.openBook(
      created.projectDirectory
    );
    expect(afterCommit.book.workspaceIndex.ledger.projection).toEqual(
      projectionBefore
    );
    expect(afterCommit.book.workspaceIndex.characterFiles[0]).toEqual(
      globalCharacterFilesBefore
    );
    for (const reference of Object.values(globalCharacterFilesBefore).filter(
      (value): value is typeof globalCharacterFilesBefore.coreProfile =>
        typeof value === "object"
    )) {
      await expect(
        projectStore.readDocument(created.projectDirectory, {
          fileId: reference.id
        })
      ).resolves.toMatchObject({ content: "", revision: emptyRevision });
    }
    const commitEntry =
      afterCommit.book.workspaceIndex.ledger.commits[0]!;
    expect(commitEntry.mode).toBe("text_files");
    const rawRecord = await readFile(
      join(created.projectDirectory, commitEntry.recordFile.path),
      "utf8"
    );
    expect(rawRecord).not.toContain("收到旧信并开始调查");
    expect(rawRecord).not.toContain("旧王朝曾使用");

    const committedChapter =
      afterCommit.book.workspaceIndex.chapters[0]!;
    expect(
      afterCommit.book.workspaceIndex.plot.narrativePlacements[0]
    ).toMatchObject({
      id: "placement_text_continuity",
      status: "committed",
      commitId: committed.record.id
    });
    expect(
      afterCommit.book.workspaceIndex.plot.foreshadowing[0]!.beats[0]
    ).toMatchObject({
      id: "beat_text_continuity",
      status: "committed",
      commitId: committed.record.id
    });
    const refinedBody = "第一章正文（提交后精修措辞）。";
    const refined = await projectStore.writeDocument(
      created.projectDirectory,
      {
        fileId: committedChapter.body.id,
        content: refinedBody,
        expectedFileRevision: committedChapter.body.revision,
        expectedWorkspaceRevision: 3,
        expectedProjectRevision: 3
      }
    );
    expect(refined).toMatchObject({
      workspaceRevision: 4,
      projectRevision: 4
    });
    expect(
      refined.book.workspaceIndex.chapters[0]!.commitId
    ).toBe(committed.record.id);
    const refinedBodyReference =
      refined.book.workspaceIndex.chapters[0]!.body;
    const agentRefinedBody = "第一章正文（提交后由智能体继续精修措辞）。";
    const agentRefined = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 4,
          updatedAt: FIXED_NOW,
          operations: [],
          documentWrites: [
            {
              proposalId: "proposal_refine_committed_body",
              fileId: refinedBodyReference.id,
              mode: "replace",
              expectedRevision: refinedBodyReference.revision,
              nextRevision: createLongFileRevision(agentRefinedBody),
              updatedAt: FIXED_NOW,
              content: agentRefinedBody,
              reason: "精修已提交正文"
            }
          ]
        },
        expectedProjectRevision: 4
      }
    );
    expect(agentRefined.book.workspaceIndex.chapters[0]!.commitId).toBe(
      committed.record.id
    );
    const refinedCardContent = "章卡内容（提交后精修）。";
    const refinedCard = await projectStore.writeDocument(
      created.projectDirectory,
      {
        fileId: committedChapter.card.id,
        content: refinedCardContent,
        expectedFileRevision: committedChapter.card.revision,
        expectedWorkspaceRevision: 5,
        expectedProjectRevision: 5
      }
    );
    expect(refinedCard).toMatchObject({
      workspaceRevision: 6,
      projectRevision: 6
    });
    expect(refinedCard.book.workspaceIndex.chapters[0]!.commitId).toBe(
      committed.record.id
    );

    for (const reference of [
      committedChapter.characterState,
      committedChapter.handoff,
      committedChapter.foreshadowingChanges,
      committedChapter.worldReveals!,
      ...committedChapter.characterContinuity.flatMap((entry) => [
        entry.currentState,
        entry.history
      ])
    ]) {
      await expect(
        projectStore.writeDocument(created.projectDirectory, {
          fileId: reference.id,
          content: "提交后不应允许覆盖",
          expectedFileRevision: reference.revision,
          expectedWorkspaceRevision: 6,
          expectedProjectRevision: 6
        })
      ).rejects.toThrow(/已提交章节/u);
    }

    const rolledBack = await projectStore.rollbackLastCommit(
      created.projectDirectory,
      {
        expectedCommitId: committed.record.id,
        baseWorkspaceRevision: 6,
        baseProjectRevision: 6
      }
    );
    expect(rolledBack).toMatchObject({
      rolledBackCommitId: committed.record.id,
      committedThroughChapterId: null,
      workspaceRevision: 7,
      projectRevision: 7
    });
    const afterRollback = await projectStore.openBook(
      created.projectDirectory
    );
    expect(afterRollback.book.workspaceIndex.ledger.commits).toEqual([]);
    expect(afterRollback.book.workspaceIndex.chapters[0]!.commitId).toBeNull();
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedChapter.body.id
      })
    ).resolves.toMatchObject({ content: agentRefinedBody });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedChapter.card.id
      })
    ).resolves.toMatchObject({ content: refinedCardContent });
    expect(
      afterRollback.book.workspaceIndex.plot.narrativePlacements[0]
    ).toMatchObject({
      id: "placement_text_continuity",
      status: "planned",
      commitId: null
    });
    expect(
      afterRollback.book.workspaceIndex.plot.foreshadowing[0]!.beats[0]
    ).toMatchObject({
      id: "beat_text_continuity",
      status: "planned",
      commitId: null
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: writtenCharacterContinuity.history.id
      })
    ).resolves.toMatchObject({
      content: "第一章：收到旧信并开始调查。"
    });
    await expect(
      projectStore.writeDocument(created.projectDirectory, {
        fileId: writtenCharacterContinuity.currentState.id,
        content: "回滚后可继续修订人物当前状态。",
        expectedFileRevision: writtenCharacterContinuity.currentState.revision,
        expectedWorkspaceRevision: 7,
        expectedProjectRevision: 7
      })
    ).resolves.toMatchObject({
      workspaceRevision: 8,
      projectRevision: 8
    });
  }, 10_000);

  it("updates only long-book bindings with project-revision CAS", async () => {
    const { projectStore, created } = await createFixture("bindings");
    const originalWorkspaceRevision = created.book.workspaceIndex.revision;
    const updated = await projectStore.updateBindings(
      created.projectDirectory,
      {
        expectedProjectRevision: created.summary.projectRevision,
        linkedMaterialIdsByKind: {
          character: [],
          gimmick: [],
          plot: ["material-long-plot", "missing-material"],
          draft: [],
          other: []
        },
        linkedSkillIdsByKind: {
          general: [],
          plot: [],
          style: ["skill-long-style"],
          other: []
        }
      }
    );

    expect(updated.summary.projectRevision).toBe(
      created.summary.projectRevision + 1
    );
    expect(updated.book.workspaceIndex.revision).toBe(
      originalWorkspaceRevision + 1
    );
    expect(updated.book.linkedMaterialIdsByKind.plot).toEqual([
      "material-long-plot",
      "missing-material"
    ]);
    expect(updated.book.linkedSkillIdsByKind.style).toEqual([
      "skill-long-style"
    ]);
    await expect(
      projectStore.updateBindings(created.projectDirectory, {
        expectedProjectRevision: created.summary.projectRevision,
        linkedMaterialIdsByKind:
          updated.book.linkedMaterialIdsByKind,
        linkedSkillIdsByKind: updated.book.linkedSkillIdsByKind
      })
    ).rejects.toThrow(/project revision 冲突/u);
  });

  it("renames a long book without renaming its project directory", async () => {
    const { projectStore, created } = await createFixture("rename-book");
    const originalWorkspaceRevision = created.book.workspaceIndex.revision;
    const updated = await projectStore.renameBook(created.projectDirectory, {
      expectedProjectRevision: created.summary.projectRevision,
      title: "新的长篇名称"
    });

    expect(updated.summary.title).toBe("新的长篇名称");
    expect(updated.summary.projectRevision).toBe(
      created.summary.projectRevision + 1
    );
    expect(updated.book.workspaceIndex.revision).toBe(
      originalWorkspaceRevision + 1
    );
    await expect(
      projectStore.openBook(created.projectDirectory)
    ).resolves.toMatchObject({ summary: { title: "新的长篇名称" } });
    await expect(
      projectStore.renameBook(created.projectDirectory, {
        expectedProjectRevision: created.summary.projectRevision,
        title: "过期修改"
      })
    ).rejects.toThrow(/project revision 冲突/u);
  });

  it(
    "rejects an oversized chapter before mutating manifest, index, or files",
    async () => {
      const { projectStore, created } = await createFixture(
        "chapter-byte-limit"
      );
      const files = firstChapterFiles(created.book);
      const manifestPath = join(created.projectDirectory, "deepwrite.json");
      const indexPath = join(
        created.projectDirectory,
        LONG_WORKSPACE_INDEX_PATH
      );
      const before = await Promise.all(
        [manifestPath, indexPath, join(created.projectDirectory, files.body.path)].map(
          async (path) =>
            projectTransactionContentSha256(await readFile(path))
        )
      );
      const oversizedBody = "界".repeat(
        Math.floor(MAX_MARKDOWN_BYTES / 3) + 1
      );

      await expect(
        projectStore.writeChapter(created.projectDirectory, {
          chapterCardId:
            created.book.workspaceIndex.plot.chapterCards[0]!.id,
          body: {
            content: oversizedBody,
            baseRevision: files.body.revision
          },
          characterState: {
            content: "角色状态",
            baseRevision: files.characterState.revision
          },
          handoff: {
            content: "交接摘要",
            baseRevision: files.handoff.revision
          },
          baseWorkspaceRevision: 0,
          baseProjectRevision: 0
        })
      ).rejects.toThrow(/UTF-8 字节限制/u);

      const after = await Promise.all(
        [manifestPath, indexPath, join(created.projectDirectory, files.body.path)].map(
          async (path) =>
            projectTransactionContentSha256(await readFile(path))
        )
      );
      expect(after).toEqual(before);
    },
    30_000
  );

  it(
    "rejects an append crossing the Markdown byte limit without publishing its index change",
    async () => {
      const { projectStore, created } = await createFixture(
        "append-byte-limit"
      );
      const body = firstChapterFiles(created.book).body;
      const bodyPath = join(created.projectDirectory, body.path);
      const nearLimit = "界".repeat(
        Math.floor((MAX_MARKDOWN_BYTES - 3) / 3)
      );
      const written = await projectStore.writeDocument(
        created.projectDirectory,
        {
          fileId: body.id,
          content: nearLimit,
          expectedFileRevision: body.revision,
          expectedWorkspaceRevision: 0,
          expectedProjectRevision: 0
        }
      );
      const indexPath = join(
        created.projectDirectory,
        LONG_WORKSPACE_INDEX_PATH
      );
      const manifestPath = join(created.projectDirectory, "deepwrite.json");
      const before = await Promise.all(
        [manifestPath, indexPath, bodyPath].map(async (path) =>
          projectTransactionContentSha256(await readFile(path))
        )
      );
      const appended = `${nearLimit}界界`;

      await expect(
        projectStore.applyWorkspaceOperations(created.projectDirectory, {
          batch: {
            baseRevision: 1,
            updatedAt: FIXED_NOW,
            operations: [
              {
                type: "chapter.update",
                id:
                  created.book.workspaceIndex.plot.chapterCards[0]!.id,
                patch: { title: "验证越界 append 不落盘" }
              }
            ],
            documentWrites: [
              {
                proposalId: "proposal_oversized_append",
                fileId: body.id,
                mode: "append",
                expectedRevision: written.fileRevision,
                nextRevision: createLongFileRevision(appended),
                updatedAt: FIXED_NOW,
                content: "界界",
                reason: "验证最终 UTF-8 字节边界"
              }
            ]
          },
          expectedProjectRevision: 1
        })
      ).rejects.toThrow(/UTF-8 字节限制/u);

      const after = await Promise.all(
        [manifestPath, indexPath, bodyPath].map(async (path) =>
          projectTransactionContentSha256(await readFile(path))
        )
      );
      expect(after).toEqual(before);
    },
    30_000
  );

  it("rejects a manifest-sized binding update before either revision changes", async () => {
    const { projectStore, created } = await createFixture(
      "binding-byte-limit"
    );
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const indexPath = join(
      created.projectDirectory,
      LONG_WORKSPACE_INDEX_PATH
    );
    const before = await Promise.all(
      [manifestPath, indexPath].map(async (path) =>
        projectTransactionContentSha256(await readFile(path))
      )
    );
    const oversizedIds = Array.from(
      { length: 2_200 },
      (_, index) => `material-${index}-${"x".repeat(470)}`
    );

    await expect(
      projectStore.updateBindings(created.projectDirectory, {
        expectedProjectRevision: 0,
        linkedMaterialIdsByKind: {
          character: [],
          gimmick: [],
          plot: oversizedIds,
          draft: [],
          other: []
        },
        linkedSkillIdsByKind: {
          general: [],
          plot: [],
          style: [],
          other: []
        }
      })
    ).rejects.toThrow(/UTF-8 字节限制/u);

    const after = await Promise.all(
      [manifestPath, indexPath].map(async (path) =>
        projectTransactionContentSha256(await readFile(path))
      )
    );
    expect(after).toEqual(before);
  });

  it("writes atomically, reads by character page and searches only explicit file scopes", async () => {
    const { projectStore, created } = await createFixture("read-search");
    const body = firstChapterFiles(created.book).body;
    const written = await projectStore.writeDocument(
      created.projectDirectory,
      {
        fileId: body.id,
        content: "甲乙关键词丙丁\n第二行关键词",
        expectedFileRevision: body.revision,
        expectedWorkspaceRevision: created.book.workspaceIndex.revision,
        expectedProjectRevision: created.book.projectRevision!
      }
    );

    expect(written.workspaceRevision).toBe(1);
    expect(written.projectRevision).toBe(1);
    const page = await projectStore.readDocument(created.projectDirectory, {
      fileId: body.id,
      offset: 2,
      limit: 3
    });
    expect(page.content).toBe("关键词");
    expect(page.nextOffset).toBe(5);

    await writeFile(
      join(created.projectDirectory, "orphan.md"),
      "关键词不应被搜索",
      "utf8"
    );
    const scoped = await projectStore.search(created.projectDirectory, {
      query: "关键词",
      fileIds: [body.id],
      maxResults: 10
    });
    expect(scoped.matches).toHaveLength(2);
    expect(scoped.matches.every((match) => match.fileId === body.id)).toBe(true);

    const excluded = await projectStore.search(created.projectDirectory, {
      query: "关键词",
      fileIds: [LONG_BOOK_LINE_FILE_ID]
    });
    expect(excluded.matches).toEqual([]);
    await expect(
      lstat(join(created.projectDirectory, ".deepwrite", "transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("supports the public 256K Unicode-character page limit", async () => {
    const { projectStore, created } = await createFixture("large-page");
    const body = firstChapterFiles(created.book).body;
    const content = "😀".repeat(70_000);
    await projectStore.writeDocument(created.projectDirectory, {
      fileId: body.id,
      content,
      expectedFileRevision: body.revision,
      expectedWorkspaceRevision: created.book.workspaceIndex.revision,
      expectedProjectRevision: created.book.projectRevision!
    });

    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: body.id,
        limit: 256 * 1024
      })
    ).resolves.toMatchObject({
      content,
      totalCharacters: 70_000,
      nextOffset: null
    });

    await projectStore.writeDocument(created.projectDirectory, {
      fileId: body.id,
      content: "甲😀乙😀丙",
      expectedFileRevision: (
        await projectStore.readDocument(created.projectDirectory, {
          fileId: body.id,
          limit: 1
        })
      ).revision,
      expectedWorkspaceRevision: 1,
      expectedProjectRevision: 1
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: body.id,
        offset: 1,
        limit: 3
      })
    ).resolves.toMatchObject({
      content: "😀乙😀",
      totalCharacters: 5,
      nextOffset: 4
    });
  });

  it("creates a stage-level character overview file for new books", async () => {
    const { projectStore, created } = await createFixture("character-overview");
    expect(created.book.workspaceIndex.characterOverview).toMatchObject({
      id: LONG_CHARACTER_OVERVIEW_FILE_ID,
      path: LONG_CHARACTER_OVERVIEW_PATH
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: LONG_CHARACTER_OVERVIEW_FILE_ID
      })
    ).resolves.toMatchObject({ content: "" });
  });

  it("migrates missing character overview onto existing projects", async () => {
    const { projectStore, created } = await createFixture(
      "missing-character-overview"
    );
    const indexPath = join(created.projectDirectory, LONG_WORKSPACE_INDEX_PATH);
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as {
      characterOverview?: unknown;
    };
    expect(index.characterOverview).toBeDefined();
    await unlink(join(created.projectDirectory, LONG_CHARACTER_OVERVIEW_PATH));
    delete index.characterOverview;
    const indexContent = `${JSON.stringify(index, null, 2)}\n`;
    await writeFile(indexPath, indexContent, "utf8");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      workspaceIndexFile: { revision: string };
    };
    manifest.workspaceIndexFile.revision =
      createLongFileRevision(indexContent);
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const opened = await projectStore.openBook(created.projectDirectory);
    expect(opened.book.workspaceIndex.characterOverview).toMatchObject({
      id: LONG_CHARACTER_OVERVIEW_FILE_ID,
      path: LONG_CHARACTER_OVERVIEW_PATH
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: LONG_CHARACTER_OVERVIEW_FILE_ID
      })
    ).resolves.toMatchObject({ content: "" });
  });

  it("migrates and writes back the default character type directory", async () => {
    const { projectStore, created } = await createFixture(
      "missing-character-types"
    );
    const indexPath = join(created.projectDirectory, LONG_WORKSPACE_INDEX_PATH);
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as {
      characterTypes?: unknown;
    };
    delete index.characterTypes;
    const indexContent = `${JSON.stringify(index, null, 2)}\n`;
    await writeFile(indexPath, indexContent, "utf8");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      workspaceIndexFile: { revision: string };
    };
    manifest.workspaceIndexFile.revision = createLongFileRevision(indexContent);
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const opened = await projectStore.openBook(created.projectDirectory);
    expect(opened.book.workspaceIndex.characterTypes.map(({ id }) => id)).toEqual([
      "protagonist",
      "major_supporting",
      "minor_supporting",
      "passerby"
    ]);
    const writtenBack = JSON.parse(await readFile(indexPath, "utf8")) as {
      characterTypes?: unknown[];
    };
    expect(writtenBack.characterTypes).toHaveLength(4);
  });

  it("stores every list worldbuilding item in its own versioned Markdown file", async () => {
    const { projectStore, created } = await createFixture("world-list");
    const category = created.book.workspaceIndex.worldbuilding[0]!;
    expect(category.format).toBe("list");
    if (category.format !== "list") throw new Error("expected list category");
    expect(category.overview).toMatchObject({
      id: longWorldbuildingOverviewFileId(category.id),
      path: longWorldbuildingOverviewContentPath(category.id)
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: category.overview!.id
      })
    ).resolves.toMatchObject({ content: "" });
    const itemId = "worlditem_memory_cost";
    const updatedAt = FIXED_NOW;
    const file = createEmptyLongMarkdownFileReference(
      longWorldbuildingItemFileId(itemId),
      longWorldbuildingItemContentPath(category.id, itemId),
      updatedAt
    );
    const createdItem = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt,
          operations: [{
            type: "worldbuildingItem.create",
            categoryId: category.id,
            item: {
              id: itemId,
              title: "记忆代价",
              order: 1,
              file
            }
          }],
          documentWrites: []
        },
        expectedProjectRevision: 0
      }
    );
    const item = createdItem.book.workspaceIndex.worldbuilding[0]!;
    if (item.format !== "list") throw new Error("expected list category");
    expect(item.items).toHaveLength(1);
    await expect(
      projectStore.writeDocument(created.projectDirectory, {
        fileId: item.items[0]!.file.id,
        content: "每次施法都会遗忘一段记忆。",
        expectedFileRevision: item.items[0]!.file.revision,
        expectedWorkspaceRevision: 1,
        expectedProjectRevision: 1
      })
    ).resolves.toMatchObject({ workspaceRevision: 2 });
  });

  it("converts worldbuilding list/text formats transactionally without dropping existing content", async () => {
    const { projectStore, created } = await createFixture(
      "world-format-conversion"
    );
    const category = created.book.workspaceIndex.worldbuilding[0]!;
    if (category.format !== "list") throw new Error("expected list category");
    const itemId = "worlditem_conversion_source";
    const itemFile = createEmptyLongMarkdownFileReference(
      longWorldbuildingItemFileId(itemId),
      longWorldbuildingItemContentPath(category.id, itemId),
      FIXED_NOW
    );
    const withItem = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: FIXED_NOW,
          operations: [{
            type: "worldbuildingItem.create",
            categoryId: category.id,
            item: {
              id: itemId,
              title: "潮汐历法",
              order: 1,
              file: itemFile
            }
          }],
          documentWrites: []
        },
        expectedProjectRevision: 0
      }
    );
    const written = await projectStore.writeDocument(
      created.projectDirectory,
      {
        fileId: itemFile.id,
        content: "每逢双月，海岸时间会比内陆慢一刻。",
        expectedFileRevision: itemFile.revision,
        expectedWorkspaceRevision: withItem.book.workspaceIndex.revision,
        expectedProjectRevision: withItem.projectRevision
      }
    );

    const conversionBatch = {
      baseRevision: written.workspaceRevision,
      updatedAt: FIXED_NOW,
      operations: [
        {
          type: "worldbuilding.update" as const,
          id: category.id,
          patch: { format: "text" as const }
        }
      ],
      documentWrites: []
    };
    const conversionPreview =
      await projectStore.previewWorkspaceOperations(
        created.projectDirectory,
        conversionBatch
      );
    expect(conversionPreview.documentWrites).toHaveLength(1);
    expect(conversionPreview.documentWrites[0]).toMatchObject({
      mode: "create",
      content: expect.stringContaining(
        "每逢双月，海岸时间会比内陆慢一刻。"
      )
    });
    expect(
      conversionPreview.entityChanges.find(
        ({ id }) => id === category.id
      )?.after
    ).toEqual(
      expect.objectContaining({
        format: "text",
        file: expect.objectContaining({
          revision: conversionPreview.documentWrites[0]!.nextRevision
        })
      })
    );

    const convertedToText =
      await projectStore.applyWorkspaceOperations(
        created.projectDirectory,
        {
          batch: conversionBatch,
          expectedProjectRevision: written.projectRevision
        }
      );
    const textCategory =
      convertedToText.book.workspaceIndex.worldbuilding[0]!;
    if (textCategory.format !== "text") throw new Error("expected text category");
    const textDocument = await projectStore.readDocument(
      created.projectDirectory,
      { fileId: textCategory.file.id }
    );
    expect(textDocument.content).not.toContain(
      "deepwrite-worldbuilding-list:v1"
    );
    expect(textDocument.content).toContain("## 潮汐历法");
    expect(textDocument.content).toContain(
      "每逢双月，海岸时间会比内陆慢一刻。"
    );
    expect(
      convertedToText.book.workspaceIndex.worldbuilding[0]!.format
    ).toBe("text");

    const convertedBack =
      await projectStore.applyWorkspaceOperations(
        created.projectDirectory,
        {
          batch: {
            baseRevision:
              convertedToText.book.workspaceIndex.revision,
            updatedAt: FIXED_NOW,
            operations: [
              {
                type: "worldbuilding.update",
                id: category.id,
                patch: { format: "list" }
              }
            ],
            documentWrites: []
          },
          expectedProjectRevision: convertedToText.projectRevision
        }
      );
    const listCategory = convertedBack.book.workspaceIndex.worldbuilding[0]!;
    if (listCategory.format !== "list") throw new Error("expected list category");
    const listDocument = await projectStore.readDocument(
      created.projectDirectory,
      { fileId: listCategory.items[0]!.file.id }
    );
    expect(listCategory.items).toHaveLength(1);
    expect(listDocument.content).toContain("## 潮汐历法");
    expect(listDocument.content).toContain(
      "每逢双月，海岸时间会比内陆慢一刻。"
    );
    expect(
      convertedBack.book.workspaceIndex.worldbuilding[0]!.format
    ).toBe("list");
  });

  it("physically deletes workspace files transactionally and permits the same id and path to be recreated", async () => {
    const { projectStore, created } = await createFixture("delete-recreate");
    const initialCategory = created.book.workspaceIndex.worldbuilding[0]!;
    const converted = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: FIXED_NOW,
          operations: [{
            type: "worldbuilding.update",
            id: initialCategory.id,
            patch: { format: "text" }
          }],
          documentWrites: []
        },
        expectedProjectRevision: 0
      }
    );
    const category = structuredClone(
      converted.book.workspaceIndex.worldbuilding[0]!
    );
    if (category.format !== "text") throw new Error("expected text category");

    await expect(
      projectStore.applyWorkspaceOperations(created.projectDirectory, {
        batch: {
          baseRevision: 1,
          updatedAt: FIXED_NOW,
          operations: [
            {
              type: "worldbuilding.delete",
              id: category.id,
              cascade: false
            }
          ],
          documentWrites: []
        },
        expectedProjectRevision: 1
      })
    ).resolves.toMatchObject({ projectRevision: 2 });
    await expect(
      lstat(join(created.projectDirectory, category.file.path))
    ).rejects.toMatchObject({ code: "ENOENT" });

    const content = "重建后的世界观内容";
    const recreatedFile = {
      ...category.file,
      revision: createLongFileRevision(content),
      updatedAt: FIXED_NOW
    };
    await expect(
      projectStore.applyWorkspaceOperations(created.projectDirectory, {
        batch: {
          baseRevision: 2,
          updatedAt: FIXED_NOW,
          operations: [
            {
              type: "worldbuilding.create",
              category: {
                ...category,
                file: recreatedFile
              }
            }
          ],
          documentWrites: [
            {
              proposalId: "proposal_recreate_worldbuilding",
              fileId: recreatedFile.id,
              mode: "create",
              expectedRevision: null,
              nextRevision: recreatedFile.revision,
              updatedAt: FIXED_NOW,
              content,
              reason: "验证删除后的同路径安全重建"
            }
          ]
        },
        expectedProjectRevision: 2
      })
    ).resolves.toMatchObject({ projectRevision: 3 });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: recreatedFile.id
      })
    ).resolves.toMatchObject({ content });
  });

  it("refuses to delete an indexed file changed outside DeepWrite", async () => {
    const { projectStore, created } = await createFixture(
      "delete-external-conflict"
    );
    const initialCategory = created.book.workspaceIndex.worldbuilding[0]!;
    const converted = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: FIXED_NOW,
          operations: [{
            type: "worldbuilding.update",
            id: initialCategory.id,
            patch: { format: "text" }
          }],
          documentWrites: []
        },
        expectedProjectRevision: 0
      }
    );
    const category = converted.book.workspaceIndex.worldbuilding[0]!;
    if (category.format !== "text") throw new Error("expected text category");
    const externalContent = "该内容尚未经过 DeepWrite 的 CAS 确认。";
    await writeFile(
      join(created.projectDirectory, category.file.path),
      externalContent,
      "utf8"
    );

    await expect(
      projectStore.applyWorkspaceOperations(created.projectDirectory, {
        batch: {
          baseRevision: 1,
          updatedAt: FIXED_NOW,
          operations: [
            {
              type: "worldbuilding.delete",
              id: category.id,
              cascade: false
            }
          ],
          documentWrites: []
        },
        expectedProjectRevision: 1
      })
    ).rejects.toMatchObject({ scope: "file" });
    await expect(
      readFile(join(created.projectDirectory, category.file.path), "utf8")
    ).resolves.toBe(externalContent);
    await expect(
      projectStore.openBook(created.projectDirectory)
    ).resolves.toMatchObject({
      book: {
        projectRevision: 1,
        workspaceIndex: { revision: 1 }
      }
    });
  });

  it("enforces file, workspace and project CAS independently", async () => {
    const { projectStore, created } = await createFixture("cas");
    const initialBody = firstChapterFiles(created.book).body;
    const written = await projectStore.writeDocument(
      created.projectDirectory,
      {
        fileId: initialBody.id,
        content: "第一版",
        expectedFileRevision: initialBody.revision,
        expectedWorkspaceRevision: 0,
        expectedProjectRevision: 0
      }
    );

    await expect(
      projectStore.writeDocument(created.projectDirectory, {
        fileId: initialBody.id,
        content: "错误覆盖",
        expectedFileRevision: initialBody.revision,
        expectedWorkspaceRevision: written.workspaceRevision,
        expectedProjectRevision: written.projectRevision
      })
    ).rejects.toMatchObject({ scope: "file" });

    await expect(
      projectStore.writeDocument(created.projectDirectory, {
        fileId: initialBody.id,
        content: "错误覆盖",
        expectedFileRevision: written.fileRevision,
        expectedWorkspaceRevision: 0,
        expectedProjectRevision: written.projectRevision
      })
    ).rejects.toMatchObject({ scope: "workspace" });

    await expect(
      projectStore.writeDocument(created.projectDirectory, {
        fileId: initialBody.id,
        content: "错误覆盖",
        expectedFileRevision: written.fileRevision,
        expectedWorkspaceRevision: written.workspaceRevision,
        expectedProjectRevision: 0
      })
    ).rejects.toMatchObject({ scope: "project" });
  });

  it("writes the chapter triplet atomically, commits continuity, and rolls back only the last commit", async () => {
    const { projectStore, created } = await createFixture("ledger");
    const chapterCardId =
      created.book.workspaceIndex.plot.chapterCards[0]!.id;
    const arcId = created.book.workspaceIndex.plot.arcs[0]!.id;
    const files = firstChapterFiles(created.book);
    const emptyRevision = createLongFileRevision("");
    const characterFiles = {
      characterId: "character_alice",
      coreProfile: {
        id: longCharacterCoreProfileFileId("character_alice"),
        path: "long/characters/alice/core-profile.md",
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      relationships: {
        id: longCharacterRelationshipsFileId("character_alice"),
        path: "long/characters/alice/relationships.md",
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      currentState: {
        id: longCharacterCurrentStateFileId("character_alice"),
        path: "long/characters/alice/current-state.md",
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      history: {
        id: longCharacterHistoryFileId("character_alice"),
        path: "long/characters/alice/history.md",
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      }
    };
    await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: FIXED_NOW,
          operations: [
            {
              type: "character.create",
              character: {
                id: "character_alice",
                name: "林岚",
                group: "protagonist",
                order: 1,
                aliases: []
              },
              files: characterFiles
            },
            {
              type: "event.create",
              event: {
                id: "event_letter",
                title: "收到旧信",
                summary: "林岚在雨夜收到无法烧毁的信。",
                timeMode: "sequence",
                timeLabel: "第一天",
                storyOrder: 1,
                location: "林岚家",
                arcIds: [arcId],
                characterIds: []
              }
            },
            {
              type: "placement.create",
              placement: {
                id: "placement_letter",
                eventId: "event_letter",
                chapterCardId,
                orderInChapter: 1,
                mode: "scene",
                disclosure: "hint",
                writingPrompt: "在雨夜呈现来信。",
                status: "planned",
                commitId: null
              }
            },
            {
              type: "foreshadowing.create",
              thread: {
                id: "foreshadow_letter",
                title: "寄信人身份",
                coreQuestion: "谁寄出了旧信？",
                truthEventId: "event_letter",
                expectedReaderEffect: "产生怀疑。",
                status: "planned",
                beats: [
                  {
                    id: "beat_letter",
                    type: "plant",
                    order: 1,
                    eventId: "event_letter",
                    placementId: "placement_letter",
                    chapterCardId,
                    plannedScope: "",
                    note: "首次出现。",
                    status: "planned",
                    commitId: null
                  }
                ]
              }
            }
          ],
          documentWrites: []
        },
        expectedProjectRevision: 0
      }
    );

    await expect(
      projectStore.writeChapter(created.projectDirectory, {
        chapterCardId,
        body: { content: "雨夜里，她收到一封信。", baseRevision: files.body.revision },
        characterState: {
          content: "林岚：开始怀疑寄信人。",
          baseRevision: files.characterState.revision
        },
        handoff: {
          content: "下一章追查信封上的旧邮戳。",
          baseRevision: "v1:0:deadbeef"
        },
        baseWorkspaceRevision: 1,
        baseProjectRevision: 1
      })
    ).rejects.toMatchObject({ scope: "file" });
    for (const file of Object.values(files)) {
      await expect(
        projectStore.readDocument(created.projectDirectory, {
          fileId: file.id
        })
      ).resolves.toMatchObject({ content: "" });
    }

    const written = await projectStore.writeChapter(
      created.projectDirectory,
      {
        chapterCardId,
        body: {
          content: "雨夜里，她收到一封信。",
          baseRevision: files.body.revision
        },
        characterState: {
          content: "",
          baseRevision: files.characterState.revision
        },
        handoff: {
          content: "",
          baseRevision: files.handoff.revision
        },
        baseWorkspaceRevision: 1,
        baseProjectRevision: 1
      }
    );
    expect(written).toMatchObject({
      chapterCardId,
      workspaceRevision: 2,
      projectRevision: 2
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: files.characterState.id
      })
    ).resolves.toMatchObject({ content: "" });

    const bookLine = created.book.workspaceIndex.bookLine;
    const commitInput: Parameters<LongProjectStore["commitChapter"]>[1] = {
        chapterCardId,
        chapterFileRevisions: {
          body: written.bodyRevision,
          characterState: written.characterStateRevision,
          handoff: written.handoffRevision
        },
        commitMessage: "确认第一章连续性",
        chapterSummary: {
          timeline: "第一天雨夜收到旧信。",
          characterStates: "林岚开始怀疑寄信人。",
          factionStates: "守夜人尚未介入。",
          realmStates: "本章无境界变化。",
          foreshadowingStates: "寄信人身份伏笔已经种下。",
          continuityNotes: "下一章追查信封上的旧邮戳。"
        },
        placementDecisions: {
          placement_letter: {
            status: "committed",
            note: "正文明确写出林岚收到旧信。"
          }
        },
        foreshadowingBeatDecisions: {
          beat_letter: {
            status: "committed",
            note: "正文展示旧信与寄信人身份线索。"
          }
        },
        fileUpdates: [
          {
            fileId: characterFiles.currentState.id,
            content: "林岚已收到旧信并开始追查寄信人。",
            baseRevision: characterFiles.currentState.revision,
            mode: "replace"
          },
          {
            fileId: characterFiles.history.id,
            content: "收到旧信，决定调查寄信人。",
            baseRevision: characterFiles.history.revision,
            mode: "append"
          }
        ],
        coverage: {
          character: {
            status: "changed",
            note: "林岚收到旧信并决定追查寄信人。"
          },
          plot: {
            status: "changed",
            note: "旧信推动调查线正式开始。"
          },
          foreshadowing: {
            status: "changed",
            note: "寄信人身份伏笔已经种下。"
          },
          world: {
            status: "unchanged",
            note: "本章没有新增世界观揭露。"
          },
          knowledge: {
            status: "changed",
            note: "读者确认旧信存在。"
          },
          openLoops: {
            status: "changed",
            note: "留下旧邮戳追查事项。"
          }
        },
        factMutations: [
          {
            factId: "fact_alice-suspicion",
            domain: "character",
            subjectId: "character_alice",
            field: "current_goal",
            value: "追查旧信的寄信人",
            evidence: "正文写明林岚决定调查寄信人。"
          }
        ],
        knowledgeMutations: [
          {
            factId: "fact_alice-suspicion",
            audienceType: "reader",
            audienceId: null,
            level: "knows",
            evidence: "读者随林岚一同看到旧信。"
          }
        ],
        openLoopMutations: [
          {
            loopId: "loop_old-postmark",
            kind: "plot",
            status: "open",
            detail: "追查信封上的旧邮戳",
            subjectId: "event_letter",
            factId: "fact_alice-suspicion",
            evidence: "章末决定从旧邮戳继续调查。"
          }
        ],
        chapterOutputs: {
          characterState: "林岚已收到旧信，当前目标是追查寄信人。",
          handoff: {
            summary: "下一章从旧邮戳线索继续追查。",
            mustCarry: ["林岚已经持有旧信"],
            nextChapterConstraints: ["调查必须从旧邮戳展开"],
            openLoops: ["loop_old-postmark"]
          }
        },
        baseWorkspaceRevision: 2,
        baseProjectRevision: 2
    };
    await writeFile(
      join(created.projectDirectory, files.body.path),
      "提案形成后被外部改写的正文",
      "utf8"
    );
    await expect(
      projectStore.commitChapter(created.projectDirectory, commitInput)
    ).rejects.toMatchObject({ scope: "file" });
    await writeFile(
      join(created.projectDirectory, files.body.path),
      "雨夜里，她收到一封信。",
      "utf8"
    );
    const preexistingRelationshipContent =
      "首次提交前由外部编辑器补充的人物关系。";
    await writeFile(
      join(created.projectDirectory, characterFiles.relationships.path),
      preexistingRelationshipContent,
      "utf8"
    );
    await expect(
      projectStore.commitChapter(created.projectDirectory, {
        ...commitInput,
        factMutations: [
          {
            ...commitInput.factMutations![0]!,
            subjectId: "character_missing"
          }
        ]
      })
    ).rejects.toThrow(/subjectId 未关联工作区现有对象/u);
    await expect(
      projectStore.commitChapter(created.projectDirectory, {
        ...commitInput,
        fileUpdates: commitInput.fileUpdates.filter(
          ({ fileId }) => fileId !== characterFiles.history.id
        )
      })
    ).rejects.toThrow(/必须同步更新人物当前状态和历史轨迹/u);
    const committed = await projectStore.commitChapter(
      created.projectDirectory,
      commitInput
    );
    expect(committed.record).toMatchObject({
      schemaVersion: 3,
      sequence: 1,
      chapterCardId,
      sourceWorkspaceRevision: 2,
      committedWorkspaceRevision: 3,
      commitMessage: "确认第一章连续性",
      chapterSummary: {
        timeline: "第一天雨夜收到旧信。",
        characterStates: "林岚开始怀疑寄信人。",
        factionStates: "守夜人尚未介入。",
        realmStates: "本章无境界变化。",
        foreshadowingStates: "寄信人身份伏笔已经种下。",
        continuityNotes: "下一章追查信封上的旧邮戳。"
      },
      placementChanges: [
        { note: "正文明确写出林岚收到旧信。" }
      ],
      foreshadowingBeatChanges: [
        { note: "正文展示旧信与寄信人身份线索。" }
      ],
      foreshadowingThreadChanges: [
        {
          foreshadowingId: "foreshadow_letter",
          before: "planned",
          after: "open"
        }
      ],
      factChanges: [
        {
          before: null,
          after: {
            factId: "fact_alice-suspicion",
            value: "追查旧信的寄信人"
          }
        }
      ],
      openLoopChanges: [
        {
          before: null,
          after: { loopId: "loop_old-postmark", status: "open" }
        }
      ]
    });
    const afterCommit = await projectStore.openBook(
      created.projectDirectory
    );
    expect(afterCommit.book.workspaceIndex.ledger.commits).toHaveLength(1);
    expect(afterCommit.book.workspaceIndex.ledger.commits[0]!.mode).toBe(
      "structured"
    );
    expect(afterCommit.book.workspaceIndex.chapters[0]!.commitId).toBe(
      committed.record.id
    );
    const migratedContinuityChapter =
      afterCommit.book.workspaceIndex.chapters[0]!;
    expect(migratedContinuityChapter.worldReveals).toBeNull();
    expect(migratedContinuityChapter.characterContinuity).toEqual([
      expect.objectContaining({ characterId: "character_alice" })
    ]);
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: migratedContinuityChapter.foreshadowingChanges.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining("beat_letter: planned → committed")
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId:
          migratedContinuityChapter.characterContinuity[0]!.currentState.id
      })
    ).resolves.toMatchObject({
      content: "林岚已收到旧信并开始追查寄信人。"
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: migratedContinuityChapter.characterContinuity[0]!.history.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining("收到旧信，决定调查寄信人")
    });
    expect(
      afterCommit.book.workspaceIndex.plot.foreshadowing[0]!.status
    ).toBe("open");
    expect(afterCommit.book.workspaceIndex.ledger.projection).toMatchObject({
      throughCommitId: committed.record.id,
      facts: [
        {
          factId: "fact_alice-suspicion",
          value: "追查旧信的寄信人"
        }
      ],
      knowledge: [
        {
          factId: "fact_alice-suspicion",
          audienceType: "reader",
          level: "knows"
        }
      ],
      openLoops: [
        { loopId: "loop_old-postmark", status: "open" }
      ],
      latestHandoff: {
        commitId: committed.record.id,
        summary: "下一章从旧邮戳线索继续追查。"
      }
    });
    const committedFiles = firstChapterFiles(afterCommit.book);
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedFiles.characterState.id
      })
    ).resolves.toMatchObject({
      content: "林岚已收到旧信，当前目标是追查寄信人。"
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedFiles.handoff.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining(
        "## 未闭合事项\n\n- loop_old-postmark"
      )
    });
    for (const file of [
      committedFiles.characterState,
      committedFiles.handoff
    ]) {
      await expect(
        projectStore.writeDocument(created.projectDirectory, {
          fileId: file.id,
          content: "不应覆盖已提交章节",
          expectedFileRevision: file.revision,
          expectedWorkspaceRevision: 3,
          expectedProjectRevision: 3
        })
      ).rejects.toThrow(/已提交章节|由连续性账本生成/u);
    }
    await writeFile(
      join(created.projectDirectory, committedFiles.body.path),
      "外部篡改已提交正文",
      "utf8"
    );
    await expect(
      projectStore.rollbackLastCommit(created.projectDirectory, {
        expectedCommitId: committed.record.id,
        baseWorkspaceRevision: 3,
        baseProjectRevision: 3
      })
    ).rejects.toThrow(/索引外修改/u);
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedFiles.body.id
      })
    ).rejects.toThrow(/索引外修改/u);
    await writeFile(
      join(created.projectDirectory, committedFiles.body.path),
      "雨夜里，她收到一封信。",
      "utf8"
    );
    const committedCharacterFiles =
      afterCommit.book.workspaceIndex.characterFiles[0]!;
    expect(committedCharacterFiles.relationships.revision).toBe(
      createLongFileRevision(preexistingRelationshipContent)
    );
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.relationships.id
      })
    ).resolves.toMatchObject({
      content: preexistingRelationshipContent
    });
    await writeFile(
      join(
        created.projectDirectory,
        committedCharacterFiles.relationships.path
      ),
      "外部篡改未被本次提交更新的人物关系",
      "utf8"
    );
    await expect(
      projectStore.rollbackLastCommit(created.projectDirectory, {
        expectedCommitId: committed.record.id,
        baseWorkspaceRevision: 3,
        baseProjectRevision: 3
      })
    ).rejects.toThrow(/索引外修改/u);
    await writeFile(
      join(
        created.projectDirectory,
        committedCharacterFiles.relationships.path
      ),
      preexistingRelationshipContent,
      "utf8"
    );
    // Continuity records no longer take ownership of character design files;
    // direct-write behavior is covered by the focused store and operation tests.
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.currentState.id
      })
    ).resolves.toMatchObject({
      content: "林岚已收到旧信并开始追查寄信人。"
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.history.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining("收到旧信，决定调查寄信人。")
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.history.id
      })
    ).resolves.toMatchObject({
      content: expect.stringContaining(`提交：${committed.record.id}`)
    });

    const overwriteThreadStatus = async (
      status: "open" | "progressing"
    ): Promise<void> => {
      const indexPath = join(
        created.projectDirectory,
        LONG_WORKSPACE_INDEX_PATH
      );
      const manifestPath = join(
        created.projectDirectory,
        "deepwrite.json"
      );
      const index = JSON.parse(await readFile(indexPath, "utf8")) as {
        plot: {
          foreshadowing: Array<{ status: "open" | "progressing" }>;
        };
      };
      index.plot.foreshadowing[0]!.status = status;
      const indexContent = `${JSON.stringify(index, null, 2)}\n`;
      await writeFile(indexPath, indexContent, "utf8");
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8")
      ) as {
        workspaceIndexFile: { revision: string };
      };
      manifest.workspaceIndexFile.revision =
        createLongFileRevision(indexContent);
      await writeFile(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8"
      );
    };
    await overwriteThreadStatus("progressing");
    await expect(
      projectStore.rollbackLastCommit(created.projectDirectory, {
        expectedCommitId: committed.record.id,
        baseWorkspaceRevision: 3,
        baseProjectRevision: 3
      })
    ).rejects.toThrow(
      /Foreshadowing status must be open|伏笔线状态已在提交后发生变化/u
    );
    await overwriteThreadStatus("open");

    const coreProfileWrite = await projectStore.writeDocument(
      created.projectDirectory,
      {
        fileId: committedCharacterFiles.coreProfile.id,
        content: "核心档案可在账本启动后继续编辑。",
        expectedFileRevision: committedCharacterFiles.coreProfile.revision,
        expectedWorkspaceRevision: 3,
        expectedProjectRevision: 3
      }
    );
    expect(coreProfileWrite).toMatchObject({
      workspaceRevision: 4,
      projectRevision: 4
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: bookLine.id
      })
    ).resolves.toMatchObject({ content: "" });

    const rolledBack = await projectStore.rollbackLastCommit(
      created.projectDirectory,
      {
        expectedCommitId: committed.record.id,
        baseWorkspaceRevision: 4,
        baseProjectRevision: 4
      }
    );
    expect(rolledBack).toMatchObject({
      rolledBackCommitId: committed.record.id,
      committedThroughChapterId: null,
      workspaceRevision: 5,
      projectRevision: 5
    });
    const afterRollback = await projectStore.openBook(
      created.projectDirectory
    );
    expect(afterRollback.book.workspaceIndex.ledger.commits).toEqual([]);
    expect(afterRollback.book.workspaceIndex.ledger.projection).toEqual({
      throughCommitId: null,
      facts: [],
      knowledge: [],
      openLoops: [],
      latestHandoff: null
    });
    expect(afterRollback.book.workspaceIndex.chapters[0]!.commitId).toBeNull();
    expect(
      afterRollback.book.workspaceIndex.plot.narrativePlacements[0]
    ).toMatchObject({ status: "planned", commitId: null });
    expect(
      afterRollback.book.workspaceIndex.plot.foreshadowing[0]!.beats[0]
    ).toMatchObject({ status: "planned", commitId: null });
    expect(
      afterRollback.book.workspaceIndex.plot.foreshadowing[0]!.status
    ).toBe("planned");
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedFiles.body.id
      })
    ).resolves.toMatchObject({ content: "雨夜里，她收到一封信。" });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedFiles.characterState.id
      })
    ).resolves.toMatchObject({ content: "" });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedFiles.handoff.id
      })
    ).resolves.toMatchObject({ content: "" });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.relationships.id
      })
    ).resolves.toMatchObject({
      content: preexistingRelationshipContent
    });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.currentState.id
      })
    ).resolves.toMatchObject({ content: "" });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.history.id
      })
    ).resolves.toMatchObject({ content: "" });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: committedCharacterFiles.coreProfile.id
      })
    ).resolves.toMatchObject({
      content: "核心档案可在账本启动后继续编辑。"
    });
    await expect(
      projectStore.writeDocument(created.projectDirectory, {
        fileId: firstChapterFiles(afterRollback.book).body.id,
        content: "回滚后可以继续修改正文。",
        expectedFileRevision: firstChapterFiles(afterRollback.book).body.revision,
        expectedWorkspaceRevision: 5,
        expectedProjectRevision: 5
      })
    ).resolves.toMatchObject({
      workspaceRevision: 6,
      projectRevision: 6
    });
    await expect(
      lstat(
        join(
          created.projectDirectory,
          afterCommit.book.workspaceIndex.ledger.commits[0]!.recordFile.path
        )
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: bookLine.id
      })
    ).resolves.toMatchObject({ content: "" });
  }, 15_000);

  it("fails closed before extending a ledger with any tampered pinned file", async () => {
    const { projectStore, created } = await createFixture(
      "pinned-integrity"
    );
    const emptyRevision = createLongFileRevision("");
    const secondChapterId = "chapter_second";
    const secondChapterStorage = projectTransactionContentSha256(
      secondChapterId
    ).slice(0, 32);
    const secondChapterFiles = {
      chapterCardId: secondChapterId,
      bodyStatus: "empty" as const,
      body: {
        id: longChapterBodyFileId(secondChapterId),
        path: `long/chapters/${secondChapterStorage}/body.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      card: {
        id: longChapterCardFileId(secondChapterId),
        path: `long/chapters/${secondChapterStorage}/card.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      characterState: {
        id: longChapterCharacterStateFileId(secondChapterId),
        path: `long/chapters/${secondChapterStorage}/character-state.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      handoff: {
        id: longChapterHandoffFileId(secondChapterId),
        path: `long/chapters/${secondChapterStorage}/handoff.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      foreshadowingChanges: {
        id: longChapterForeshadowingChangesFileId(secondChapterId),
        path: longChapterContinuityFilePath(
          secondChapterId,
          "foreshadowing-changes.md"
        ),
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      worldReveals: null,
      characterContinuity: [],
      commitId: null
    };
    const characterId = "character_guard";
    const characterStorage =
      projectTransactionContentSha256(characterId).slice(0, 32);
    const characterFiles = {
      characterId,
      coreProfile: {
        id: longCharacterCoreProfileFileId(characterId),
        path: `long/characters/${characterStorage}/core-profile.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      relationships: {
        id: longCharacterRelationshipsFileId(characterId),
        path: `long/characters/${characterStorage}/relationships.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      currentState: {
        id: longCharacterCurrentStateFileId(characterId),
        path: `long/characters/${characterStorage}/current-state.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      },
      history: {
        id: longCharacterHistoryFileId(characterId),
        path: `long/characters/${characterStorage}/history.md`,
        revision: emptyRevision,
        updatedAt: FIXED_NOW
      }
    };
    const volume = created.book.workspaceIndex.plot.volumes[0]!;
    const arc = created.book.workspaceIndex.plot.arcs[0]!;
    const structured = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: FIXED_NOW,
          operations: [
            {
              type: "character.create",
              character: {
                id: characterId,
                name: "守门人",
                group: "minor_supporting",
                order: 1,
                aliases: []
              },
              files: characterFiles
            },
            {
              type: "chapter.create",
              chapterCard: {
                id: secondChapterId,
                volumeId: volume.id,
                primaryArcId: arc.id,
                title: "第二章",
                narrativeOrder: 2
              },
              files: secondChapterFiles
            }
          ],
          documentWrites: []
        },
        expectedProjectRevision: 0
      }
    );
    const firstChapterId =
      structured.book.workspaceIndex.plot.chapterCards[0]!.id;
    const firstFiles = firstChapterFiles(structured.book);
    const firstWritten = await projectStore.writeChapter(
      created.projectDirectory,
      {
        chapterCardId: firstChapterId,
        body: {
          content: "第一章正文",
          baseRevision: firstFiles.body.revision
        },
        characterState: {
          content: "第一章角色状态",
          baseRevision: firstFiles.characterState.revision
        },
        handoff: {
          content: "转入第二章",
          baseRevision: firstFiles.handoff.revision
        },
        baseWorkspaceRevision: 1,
        baseProjectRevision: 1
      }
    );
    const chapterSummary = {
      timeline: "第一日。",
      characterStates: "守门人保持警觉。",
      factionStates: "阵营状态不变。",
      realmStates: "境界状态不变。",
      foreshadowingStates: "没有新增伏笔。",
      continuityNotes: "连续进入下一章。"
    };
    const firstCommitted = await projectStore.commitChapter(
      created.projectDirectory,
      {
        chapterCardId: firstChapterId,
        chapterFileRevisions: {
          body: firstWritten.bodyRevision,
          characterState: firstWritten.characterStateRevision,
          handoff: firstWritten.handoffRevision
        },
        commitMessage: "提交第一章",
        chapterSummary,
        placementDecisions: {},
        foreshadowingBeatDecisions: {},
        fileUpdates: [],
        baseWorkspaceRevision: 2,
        baseProjectRevision: 2
      }
    );
    const secondWritten = await projectStore.writeChapter(
      created.projectDirectory,
      {
        chapterCardId: secondChapterId,
        body: {
          content: "第二章正文",
          baseRevision: secondChapterFiles.body.revision
        },
        characterState: {
          content: "第二章角色状态",
          baseRevision: secondChapterFiles.characterState.revision
        },
        handoff: {
          content: "继续后续情节",
          baseRevision: secondChapterFiles.handoff.revision
        },
        baseWorkspaceRevision: 3,
        baseProjectRevision: 3
      }
    );
    const secondCommitInput: Parameters<
      LongProjectStore["commitChapter"]
    >[1] = {
      chapterCardId: secondChapterId,
      chapterFileRevisions: {
        body: secondWritten.bodyRevision,
        characterState: secondWritten.characterStateRevision,
        handoff: secondWritten.handoffRevision
      },
      commitMessage: "提交第二章",
      chapterSummary: {
        ...chapterSummary,
        timeline: "第二日。"
      },
      placementDecisions: {},
      foreshadowingBeatDecisions: {},
      fileUpdates: [],
      baseWorkspaceRevision: 4,
      baseProjectRevision: 4
    };
    const opened = await projectStore.openBook(created.projectDirectory);
    const ledgerPath =
      opened.book.workspaceIndex.ledger.commits[0]!.recordFile.path;
    const indexPath = join(
      created.projectDirectory,
      LONG_WORKSPACE_INDEX_PATH
    );
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const stableMetadataHashes = await Promise.all(
      [manifestPath, indexPath].map(async (path) =>
        projectTransactionContentSha256(await readFile(path))
      )
    );
    const tamperCases = [
      {
        path: join(created.projectDirectory, ledgerPath),
        content: "{\"tampered\":true}\n"
      },
      {
        path: join(created.projectDirectory, firstFiles.body.path),
        content: "篡改第一章正文"
      },
      {
        path: join(
          created.projectDirectory,
          characterFiles.relationships.path
        ),
        content: "篡改账本接管的人物关系"
      }
    ];

    for (const tamperCase of tamperCases) {
      const original = await readFile(tamperCase.path);
      await writeFile(tamperCase.path, tamperCase.content, "utf8");
      await expect(
        projectStore.commitChapter(
          created.projectDirectory,
          secondCommitInput
        )
      ).rejects.toThrow();
      const currentMetadataHashes = await Promise.all(
        [manifestPath, indexPath].map(async (path) =>
          projectTransactionContentSha256(await readFile(path))
        )
      );
      expect(currentMetadataHashes).toEqual(stableMetadataHashes);
      await writeFile(tamperCase.path, original);
    }

    const ledgerAbsolutePath = join(created.projectDirectory, ledgerPath);
    const ledgerOriginal = await readFile(ledgerAbsolutePath);
    let injectAfterGate = true;
    const racingStore = new LongProjectStore({
      now: () => {
        if (injectAfterGate) {
          injectAfterGate = false;
          writeFileSync(
            ledgerAbsolutePath,
            "{\"changedAfterIntegrityGate\":true}\n",
            "utf8"
          );
        }
        return FIXED_NOW;
      }
    });
    await expect(
      racingStore.commitChapter(
        created.projectDirectory,
        secondCommitInput
      )
    ).rejects.toMatchObject({ scope: "transaction" });
    const afterRaceMetadataHashes = await Promise.all(
      [manifestPath, indexPath].map(async (path) =>
        projectTransactionContentSha256(await readFile(path))
      )
    );
    expect(afterRaceMetadataHashes).toEqual(stableMetadataHashes);
    await writeFile(ledgerAbsolutePath, ledgerOriginal);

    const after = await projectStore.openBook(created.projectDirectory);
    expect(after.book.workspaceIndex.revision).toBe(4);
    expect(after.book.workspaceIndex.ledger.commits).toHaveLength(1);
    expect(after.book.workspaceIndex.ledger.commits[0]!.id).toBe(
      firstCommitted.record.id
    );
  });

  it("reports actual revisions on the first lazy read after an external edit", async () => {
    const { projectStore, created } = await createFixture("external");
    const initialBody = firstChapterFiles(created.book).body;
    await writeFile(
      join(created.projectDirectory, initialBody.path),
      "外部编辑器写入的正文",
      "utf8"
    );

    const opened = await projectStore.openBook(created.projectDirectory);
    expect(firstChapterFiles(opened.book).body.revision).toBe(
      initialBody.revision
    );
    const read = await projectStore.readDocument(created.projectDirectory, {
      fileId: initialBody.id
    });
    expect(read.content).toBe("外部编辑器写入的正文");
    expect(read.revision).not.toBe(initialBody.revision);

    await expect(
      projectStore.writeDocument(created.projectDirectory, {
        fileId: initialBody.id,
        content: "确认外部版本后继续写",
        expectedFileRevision: read.revision,
        expectedWorkspaceRevision: opened.book.workspaceIndex.revision,
        expectedProjectRevision: opened.book.projectRevision!
      })
    ).resolves.toMatchObject({
      workspaceRevision: 1,
      projectRevision: 1
    });
  });

  it("recovers an interrupted project transaction before opening", async () => {
    const { projectStore, created } = await createFixture("recovery");
    const body = firstChapterFiles(created.book).body;
    const transactionId = "txn-2000-a1b2c3d4";
    const transactionRoot = join(
      created.projectDirectory,
      ".deepwrite",
      "transactions",
      transactionId
    );
    await mkdir(join(transactionRoot, "stage"), { recursive: true });
    await writeFile(
      join(transactionRoot, "stage", "0.next"),
      "恢复后的正文",
      "utf8"
    );
    await writeFile(
      join(created.projectDirectory, ".deepwrite", "transaction.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          transactionId,
          phase: "prepared",
          appliedCount: 0,
          operations: [
            {
              path: body.path,
              stagePath: `.deepwrite/transactions/${transactionId}/stage/0.next`,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/0.previous`,
              beforeSha256: projectTransactionContentSha256(""),
              afterSha256:
                projectTransactionContentSha256("恢复后的正文")
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await expect(
      projectStore.readDocument(created.projectDirectory, {
        fileId: body.id
      })
    ).resolves.toMatchObject({ content: "恢复后的正文" });
    await expect(
      lstat(join(created.projectDirectory, ".deepwrite", "transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("opens a migrated copy whose prepared transaction already applied the manifest", async () => {
    const { projectStore, created } = await createFixture(
      "migrated-prepared-recovery"
    );
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const indexPath = join(
      created.projectDirectory,
      LONG_WORKSPACE_INDEX_PATH
    );
    const previousManifestContent = await readFile(manifestPath, "utf8");
    const previousIndexContent = await readFile(indexPath, "utf8");
    const previousManifest = JSON.parse(previousManifestContent) as {
      revision: number;
      workspaceIndexFile: {
        revision: string;
        updatedAt: string;
      };
      updatedAt: string;
    };
    const previousIndex = JSON.parse(previousIndexContent) as {
      revision: number;
      updatedAt: string;
      [key: string]: unknown;
    };
    const migratedAt = "2026-07-26T12:01:00.000Z";
    const nextIndexContent = `${JSON.stringify(
      {
        ...previousIndex,
        revision: previousIndex.revision + 1,
        updatedAt: migratedAt
      },
      null,
      2
    )}\n`;
    const nextManifestContent = `${JSON.stringify(
      {
        ...previousManifest,
        revision: previousManifest.revision + 1,
        updatedAt: migratedAt,
        workspaceIndexFile: {
          ...previousManifest.workspaceIndexFile,
          revision: createLongFileRevision(nextIndexContent),
          updatedAt: migratedAt
        }
      },
      null,
      2
    )}\n`;
    const transactionId = "txn-2001-b2c3d4e5";
    const transactionRoot = join(
      created.projectDirectory,
      ".deepwrite",
      "transactions",
      transactionId
    );
    await mkdir(join(transactionRoot, "stage"), { recursive: true });
    await mkdir(join(transactionRoot, "backup"), { recursive: true });
    await writeFile(
      join(transactionRoot, "stage", "0.next"),
      nextIndexContent,
      "utf8"
    );
    await writeFile(
      join(transactionRoot, "stage", "1.next"),
      nextManifestContent,
      "utf8"
    );
    await writeFile(
      join(transactionRoot, "backup", "0.previous"),
      previousIndexContent,
      "utf8"
    );
    await writeFile(
      join(transactionRoot, "backup", "1.previous"),
      previousManifestContent,
      "utf8"
    );

    // A directory migration can observe the manifest replacement before it
    // observes the journal phase update or the index replacement.
    await writeFile(manifestPath, nextManifestContent, "utf8");
    await writeFile(
      join(created.projectDirectory, ".deepwrite", "transaction.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          transactionId,
          phase: "prepared",
          appliedCount: 0,
          operations: [
            {
              action: "write",
              path: LONG_WORKSPACE_INDEX_PATH,
              stagePath: `.deepwrite/transactions/${transactionId}/stage/0.next`,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/0.previous`,
              beforeSha256: projectTransactionContentSha256(
                previousIndexContent
              ),
              afterSha256: projectTransactionContentSha256(nextIndexContent)
            },
            {
              action: "write",
              path: "deepwrite.json",
              stagePath: `.deepwrite/transactions/${transactionId}/stage/1.next`,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/1.previous`,
              beforeSha256: projectTransactionContentSha256(
                previousManifestContent
              ),
              afterSha256:
                projectTransactionContentSha256(nextManifestContent)
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const opened = await projectStore.openBook(created.projectDirectory);
    expect(opened.book.projectRevision).toBe(previousManifest.revision + 1);
    expect(opened.book.workspaceIndex.revision).toBe(
      previousIndex.revision + 1
    );
    await expect(readFile(indexPath, "utf8")).resolves.toBe(nextIndexContent);
    await expect(readFile(manifestPath, "utf8")).resolves.toBe(
      nextManifestContent
    );
    await expect(
      lstat(join(created.projectDirectory, ".deepwrite", "transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects unsafe indexed paths eagerly and validates document bytes lazily", async () => {
    const unsafe = await createFixture("unsafe-path");
    const unsafeIndexPath = join(
      unsafe.created.projectDirectory,
      LONG_WORKSPACE_INDEX_PATH
    );
    const unsafeIndex = JSON.parse(
      await readFile(unsafeIndexPath, "utf8")
    ) as {
      chapters: Array<{ body: { path: string } }>;
    };
    unsafeIndex.chapters[0]!.body.path = "../outside.md";
    await writeFile(
      unsafeIndexPath,
      `${JSON.stringify(unsafeIndex, null, 2)}\n`,
      "utf8"
    );
    await expect(
      unsafe.projectStore.openBook(unsafe.created.projectDirectory)
    ).rejects.toThrow();

    const linked = await createFixture("symlink");
    const linkedBody = firstChapterFiles(linked.created.book).body;
    const linkedBodyPath = join(
      linked.created.projectDirectory,
      linkedBody.path
    );
    const outsidePath = join(linked.parent, "outside.md");
    await writeFile(outsidePath, "项目外正文", "utf8");
    await unlink(linkedBodyPath);
    await symlink(outsidePath, linkedBodyPath);
    await expect(
      linked.projectStore.openBook(linked.created.projectDirectory)
    ).resolves.toMatchObject({ book: { id: linked.created.book.id } });
    await expect(
      linked.projectStore.readDocument(linked.created.projectDirectory, {
        fileId: linkedBody.id
      })
    ).rejects.toThrow(/普通文件|符号链接/u);

    const invalidUtf8 = await createFixture("utf8");
    const utf8Body = firstChapterFiles(invalidUtf8.created.book).body;
    await writeFile(
      join(invalidUtf8.created.projectDirectory, utf8Body.path),
      Buffer.from([0xff, 0xfe, 0xfd])
    );
    await expect(
      invalidUtf8.projectStore.openBook(invalidUtf8.created.projectDirectory)
    ).resolves.toMatchObject({ book: { id: invalidUtf8.created.book.id } });
    await expect(
      invalidUtf8.projectStore.readDocument(
        invalidUtf8.created.projectDirectory,
        { fileId: utf8Body.id }
      )
    ).rejects.toThrow(/UTF-8/u);
  });

  it("rejects worldbuilding files placed outside the worldbuilding role directory", async () => {
    const { projectStore, created } = await createFixture(
      "world-role-path"
    );
    const category = created.book.workspaceIndex.worldbuilding[0]!;
    if (category.format !== "list") throw new Error("expected list category");
    const itemId = "worlditem_wrong_role_path";
    const itemFile = createEmptyLongMarkdownFileReference(
      longWorldbuildingItemFileId(itemId),
      longWorldbuildingItemContentPath(category.id, itemId),
      FIXED_NOW
    );
    await projectStore.applyWorkspaceOperations(created.projectDirectory, {
      batch: {
        baseRevision: 0,
        updatedAt: FIXED_NOW,
        operations: [{
          type: "worldbuildingItem.create",
          categoryId: category.id,
          item: {
            id: itemId,
            title: "错误目录测试",
            order: 1,
            file: itemFile
          }
        }],
        documentWrites: []
      },
      expectedProjectRevision: 0
    });

    const indexPath = join(
      created.projectDirectory,
      LONG_WORKSPACE_INDEX_PATH
    );
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as {
      worldbuilding: Array<{
        items: Array<{ file: { path: string } }>;
      }>;
    };
    index.worldbuilding[0]!.items[0]!.file.path =
      "long/chapters/rogue-worldbuilding.md";
    const indexContent = `${JSON.stringify(index, null, 2)}\n`;
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8")
    ) as { workspaceIndexFile: { revision: string } };
    manifest.workspaceIndexFile.revision =
      createLongFileRevision(indexContent);
    await writeFile(indexPath, indexContent, "utf8");
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    await expect(
      projectStore.openBook(created.projectDirectory)
    ).rejects.toThrow(/文件路径不符合其文件角色/u);
  });

  it("continues to open legacy hashed worldbuilding paths", async () => {
    const { projectStore, created } = await createFixture(
      "legacy-world-role-path"
    );
    const categoryId = "world_legacy_hashed_path";
    const legacyPath =
      `long/worldbuilding/${
        projectTransactionContentSha256(categoryId).slice(0, 32)
      }/content.md`;
    const result = await projectStore.applyWorkspaceOperations(
      created.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: FIXED_NOW,
          operations: [{
            type: "worldbuilding.create",
            category: {
              id: categoryId,
              title: "旧版哈希路径",
              order: created.book.workspaceIndex.worldbuilding.length + 1,
              format: "text",
              contentAuthority: "markdown",
              file: createEmptyLongMarkdownFileReference(
                longWorldbuildingFileId(categoryId),
                legacyPath,
                FIXED_NOW
              )
            }
          }],
          documentWrites: []
        },
        expectedProjectRevision: 0
      }
    );

    await expect(
      projectStore.openBook(created.projectDirectory)
    ).resolves.toMatchObject({
      book: {
        workspaceIndex: {
          revision: result.book.workspaceIndex.revision
        }
      }
    });
  });
});
