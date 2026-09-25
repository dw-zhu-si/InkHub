import {
  access,
  chmod,
  cp,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CatalogSnapshotSchema,
  catalogDraftBodyDocumentId,
  catalogDraftCharacterStateDocumentId,
  createShortWorkspaceContentRevision,
  type CatalogSnapshot
} from "@deepwrite/contracts";
import {
  assertLegacyBookMigrationSourcesUnchanged,
  FolderCatalogConflictError,
  FolderCatalogStore
} from "./folder-catalog-store";

const temporaryRoots = new Set<string>();
const timestamp = "2026-07-19T01:02:03.000Z";

async function makeTemporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function tickingClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 19, 10, 0, tick++)).toISOString();
}

function catalogFixture(): CatalogSnapshot {
  return CatalogSnapshotSchema.parse({
    schemaVersion: 1,
    revision: 17,
    updatedAt: timestamp,
    legacyImport: {
      sourceRoot: "/legacy/source",
      fingerprint: "a".repeat(64),
      importedAt: timestamp,
      materials: 1,
      skills: 1,
      materialGroups: 1,
      skillGroups: 1
    },
    books: [
      {
        id: "book-existing",
        title: "雨夜/来信",
        bookType: "short",
        genre: "悬疑",
        status: "editing",
        linkedMaterialIdsByKind: {
          character: ["material-existing"],
          gimmick: [],
          plot: [],
          draft: [],
          other: []
        },
        linkedSkillIdsByKind: {
          general: ["skill-existing"],
          plot: [],
          style: [],
          other: []
        },
        documents: [
          {
            id: "draft",
            title: "正文编写",
            content: "# 第一章\n\n门外一直在下雨。",
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    materials: [
      {
        id: "material-existing",
        title: "人物素材",
        materialType: "short",
        materialKind: "character",
        parentGenre: "悬疑",
        subGenre: "",
        overview: "人物备忘",
        entries: [
          {
            id: "material-entry",
            stageId: "character",
            title: "守夜人",
            body: "守夜人从不在白天出现。",
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    materialGroups: [
      {
        id: "material-group-existing",
        title: "悬疑素材组",
        members: { character: "material-existing" },
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    skills: [
      {
        id: "skill-existing",
        title: "通用写作技能",
        skillType: "short",
        skillKind: "general",
        overview: "",
        isBuiltin: false,
        entries: [
          {
            id: "skill-entry",
            stageId: "draft",
            title: "正文技能",
            body: "保持短句和悬念。",
            createdAt: timestamp,
            updatedAt: timestamp,
            sourceSkillId: "source-skill"
          }
        ],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ],
    skillGroups: [
      {
        id: "skill-group-existing",
        title: "悬疑技能组",
        members: { general: "skill-existing" },
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]
  });
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map((root) => rm(root, { recursive: true, force: true }))
  );
  temporaryRoots.clear();
});

describe("FolderCatalogStore", () => {
  it("rejects source changes detected immediately before a legacy manifest switch", () => {
    expect(() =>
      assertLegacyBookMigrationSourcesUnchanged({
        originalManifestText: "manifest-v1",
        currentManifestText: "manifest-v1",
        originalLegacyDraftContent: "旧正文",
        currentLegacyDraftContent: "旧正文"
      })
    ).not.toThrow();
    expect(() =>
      assertLegacyBookMigrationSourcesUnchanged({
        originalManifestText: "manifest-v1",
        currentManifestText: "manifest-v1-external-edit",
        originalLegacyDraftContent: "旧正文",
        currentLegacyDraftContent: "旧正文"
      })
    ).toThrow(/迁移期间被外部修改/u);
    expect(() =>
      assertLegacyBookMigrationSourcesUnchanged({
        originalManifestText: "manifest-v1",
        currentManifestText: "manifest-v1",
        originalLegacyDraftContent: "旧正文",
        currentLegacyDraftContent: "外部更新后的正文"
      })
    ).toThrow(/迁移期间被外部修改/u);
  });

  it("migrates a complete snapshot into manifests and Markdown while preserving data", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-migrate-");
    const store = new FolderCatalogStore({ userDataPath: join(root, "user-data") });
    const source = catalogFixture();

    const migrated = await store.migrateSnapshot(source);
    expect(migrated).toMatchObject(source);

    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      revision: number;
      updatedAt: string;
      legacyImport: { fingerprint: string };
      sourceCatalogMigrated: boolean;
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    expect(registry).toMatchObject({
      revision: 17,
      updatedAt: timestamp,
      sourceCatalogMigrated: true
    });
    expect(registry.legacyImport.fingerprint).toBe("a".repeat(64));
    expect(registry.projects).toHaveLength(5);

    await Promise.all(
      registry.projects.map(async ({ projectDirectory }) => {
        await expect(access(projectDirectory)).resolves.toBeUndefined();
        await expect(
          access(join(projectDirectory, "deepwrite.json"))
        ).resolves.toBeUndefined();
      })
    );

    const bookProject = registry.projects.find(({ id }) => id === "book-existing")!;
    expect(bookProject.projectDirectory).toContain("雨夜-来信");
    const bookManifestText = await readFile(
      join(bookProject.projectDirectory, "deepwrite.json"),
      "utf8"
    );
    expect(bookManifestText).not.toContain("门外一直在下雨");
    const bookManifest = JSON.parse(bookManifestText) as {
      schemaVersion: number;
      kind: string;
      documents: Array<{ path: string }>;
      draft: {
        sections: Array<{
          id: string;
          body: { path: string };
          characterState: { path: string };
        }>;
      };
    };
    expect(bookManifest).toMatchObject({
      schemaVersion: 4,
      kind: "deepwrite.book"
    });
    expect(bookManifest.documents).toHaveLength(7);
    expect(bookManifest.draft.sections).toHaveLength(2);
    await Promise.all(
      bookManifest.draft.sections.map(async (section, index) => {
        expect(section.body.path).toMatch(
          new RegExp(`^stages/draft/${section.id}\\.body\\.md$`, "u")
        );
        expect(section.characterState.path).toMatch(
          new RegExp(`^stages/draft/${section.id}\\.state\\.md$`, "u")
        );
        await expect(
          readFile(join(bookProject.projectDirectory, section.body.path), "utf8")
        ).resolves.toBe(source.books[0]!.draft.sections[index]!.body.content);
        await expect(
          readFile(
            join(bookProject.projectDirectory, section.characterState.path),
            "utf8"
          )
        ).resolves.toBe(
          source.books[0]!.draft.sections[index]!.characterState.content
        );
      })
    );

    const materialProject = registry.projects.find(
      ({ id }) => id === "material-existing"
    )!;
    const materialManifestText = await readFile(
      join(materialProject.projectDirectory, "deepwrite.json"),
      "utf8"
    );
    expect(materialManifestText).not.toContain("守夜人从不在白天出现");
    const materialManifest = JSON.parse(materialManifestText) as {
      kind: string;
      entries: Array<{ path: string }>;
    };
    expect(materialManifest).toMatchObject({
      kind: "deepwrite.material-library",
      entries: [{ path: "entries/material-entry.md" }]
    });
    expect(
      await readFile(
        join(materialProject.projectDirectory, materialManifest.entries[0]!.path),
        "utf8"
      )
    ).toBe(source.materials[0]!.entries[0]!.body);

    const skillProject = registry.projects.find(
      ({ id }) => id === "skill-existing"
    )!;
    const skillManifestText = await readFile(
      join(skillProject.projectDirectory, "deepwrite.json"),
      "utf8"
    );
    expect(skillManifestText).not.toContain("保持短句和悬念");
    const skillManifest = JSON.parse(skillManifestText) as {
      kind: string;
      entries: Array<{ path: string; sourceSkillId?: string }>;
    };
    expect(skillManifest).toMatchObject({
      kind: "deepwrite.skill-library",
      entries: [
        {
          path: "entries/skill-entry.md",
          sourceSkillId: "source-skill"
        }
      ]
    });
    expect(
      await readFile(
        join(skillProject.projectDirectory, skillManifest.entries[0]!.path),
        "utf8"
      )
    ).toBe(source.skills[0]!.entries[0]!.body);

    const materialGroupProject = registry.projects.find(
      ({ id }) => id === "material-group-existing"
    )!;
    expect(
      JSON.parse(
        await readFile(
          join(materialGroupProject.projectDirectory, "deepwrite.json"),
          "utf8"
        )
      )
    ).toMatchObject({
      kind: "deepwrite.material-group",
      members: { character: "material-existing" }
    });
    const skillGroupProject = registry.projects.find(
      ({ id }) => id === "skill-group-existing"
    )!;
    expect(
      JSON.parse(
        await readFile(
          join(skillGroupProject.projectDirectory, "deepwrite.json"),
          "utf8"
        )
      )
    ).toMatchObject({
      kind: "deepwrite.skill-group",
      members: { general: "skill-existing" }
    });

    const reloaded = await new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    }).snapshot();
    expect(reloaded).toMatchObject(source);
  });

  it("builds a content-aware index while Markdown files are unreadable", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-index-");
    const store = new FolderCatalogStore({ userDataPath: join(root, "user-data") });
    const source = catalogFixture();
    source.books[0]!.documents.find(({ id }) => id === "worldbuilding")!.content =
      "雾城终年没有日出。";
    source.books[0]!.draft.sections[0]!.body.content = "第一节正文";
    source.books[0]!.draft.sections[0]!.characterState.content = "主角受伤";
    source.skills[0]!.overview = "技能库介绍";
    await store.migrateSnapshot(source);

    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const markdownFiles: Array<{
      id: string;
      path: string;
      bytes: number;
    }> = [];
    for (const project of registry.projects) {
      const manifest = JSON.parse(
        await readFile(join(project.projectDirectory, "deepwrite.json"), "utf8")
      ) as {
        kind: string;
        documents?: Array<{ id: string; path: string }>;
        draft?: {
          sections: Array<{
            body: { id: string; path: string };
            characterState: { id: string; path: string };
          }>;
        };
        entries?: Array<{ id: string; path: string }>;
      };
      const items = [
        ...(manifest.documents ?? []),
        ...(manifest.draft?.sections.flatMap((section) => [
          section.body,
          section.characterState
        ]) ?? []),
        ...(manifest.entries ?? [])
      ];
      for (const item of items) {
        const path = join(project.projectDirectory, item.path);
        markdownFiles.push({
          id: item.id,
          path,
          bytes: (await stat(path)).size
        });
        await chmod(path, 0o000);
      }
    }

    await expect(readFile(markdownFiles[0]!.path, "utf8")).rejects.toMatchObject({
      code: "EACCES"
    });
    const index = await new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    }).indexSnapshot();
    expect(() => CatalogSnapshotSchema.parse(index)).not.toThrow();
    expect(index.projectDiagnostics).toBeUndefined();
    expect(index.books[0]!.documents.every(({ content }) => content === "")).toBe(
      true
    );
    expect(
      index.books[0]!.draft.sections.every(
        ({ body, characterState }) =>
          body.content === "" && characterState.content === ""
      )
    ).toBe(true);
    expect(index.materials[0]).toMatchObject({
      overview: "",
      overviewContentBytes: Buffer.byteLength("人物备忘", "utf8"),
      entries: [
        {
          id: "material-entry",
          body: "",
          contentBytes: Buffer.byteLength("守夜人从不在白天出现。", "utf8")
        }
      ]
    });
    expect(index.skills[0]).toMatchObject({
      overview: "",
      overviewContentBytes: Buffer.byteLength("技能库介绍", "utf8"),
      entries: [
        {
          id: "skill-entry",
          body: "",
          contentBytes: Buffer.byteLength("保持短句和悬念。", "utf8")
        }
      ]
    });
    for (const file of markdownFiles) {
      const indexedDocument = [
        ...index.books.flatMap((book) => [
          ...book.documents,
          ...book.draft.sections.flatMap((section) => [
            section.body,
            section.characterState
          ])
        ]),
        ...index.materials.flatMap((library) => library.entries),
        ...index.skills.flatMap((library) => library.entries)
      ].find(({ id }) => id === file.id);
      expect(indexedDocument?.contentBytes).toBe(file.bytes);
    }
  });

  it("reads book files, draft files, library entries, and overviews on demand", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-read-document-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath });
    const source = catalogFixture();
    const book = source.books[0]!;
    const ordinary = book.documents.find(({ id }) => id === "worldbuilding")!;
    ordinary.content = "世界观正文";
    book.draft.sections[0]!.body.content = "正文小节内容";
    book.draft.sections[0]!.characterState.content = "人物状态内容";
    source.skills[0]!.overview = "技能库介绍";
    await store.migrateSnapshot(source);

    const reads = await Promise.all([
      store.readDocument({
        projectId: book.id,
        target: "document",
        documentId: ordinary.id
      }),
      store.readDocument({
        projectId: book.id,
        target: "document",
        documentId: book.draft.sections[0]!.body.id
      }),
      store.readDocument({
        projectId: book.id,
        target: "document",
        documentId: book.draft.sections[0]!.characterState.id
      }),
      store.readDocument({
        projectId: source.materials[0]!.id,
        target: "document",
        documentId: source.materials[0]!.entries[0]!.id
      }),
      store.readDocument({
        projectId: source.skills[0]!.id,
        target: "document",
        documentId: source.skills[0]!.entries[0]!.id
      }),
      store.readDocument({
        projectId: source.materials[0]!.id,
        target: "overview"
      }),
      store.readDocument({
        projectId: source.skills[0]!.id,
        target: "overview"
      })
    ]);

    expect(reads.map(({ content }) => content)).toEqual([
      "世界观正文",
      "正文小节内容",
      "人物状态内容",
      "守夜人从不在白天出现。",
      "保持短句和悬念。",
      "人物备忘",
      "技能库介绍"
    ]);
    for (const result of reads) {
      expect(result.revision).toBe(
        createShortWorkspaceContentRevision(result.content)
      );
      expect(result.contentBytes).toBe(Buffer.byteLength(result.content, "utf8"));
      expect(result.projectRevision).toBe(0);
    }
    await expect(
      store.readDocument({
        projectId: book.id,
        target: "document",
        documentId: "missing-document"
      })
    ).rejects.toThrow(/文档不存在/u);
    await expect(
      store.readDocument({
        projectId: source.materialGroups[0]!.id,
        target: "overview"
      })
    ).rejects.toThrow(/素材库或技能库/u);
    await expect(
      new FolderCatalogStore({
        userDataPath,
        maxMarkdownBytes: 4
      }).readDocument({
        projectId: book.id,
        target: "document",
        documentId: ordinary.id
      })
    ).rejects.toThrow(/byte limit/u);
  });

  it("changes contentStamp after a same-byte external Markdown edit", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-content-stamp-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath });
    const source = catalogFixture();
    await store.migrateSnapshot(source);

    const before = await store.indexSnapshot();
    const beforeEntry = before.materials[0]!.entries[0]!;
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const project = registry.projects.find(
      ({ id }) => id === source.materials[0]!.id
    )!;
    const manifest = JSON.parse(
      await readFile(join(project.projectDirectory, "deepwrite.json"), "utf8")
    ) as { entries: Array<{ id: string; path: string }> };
    const entry = manifest.entries.find(({ id }) => id === beforeEntry.id)!;
    const entryPath = join(project.projectDirectory, entry.path);
    const original = await readFile(entryPath, "utf8");
    const externallyEdited = original.replace("守", "巡");
    expect(Buffer.byteLength(externallyEdited, "utf8")).toBe(
      Buffer.byteLength(original, "utf8")
    );
    await writeFile(entryPath, externallyEdited, "utf8");
    await utimes(
      entryPath,
      new Date("2030-01-01T00:00:00.000Z"),
      new Date("2030-01-01T00:00:00.000Z")
    );

    const after = await new FolderCatalogStore({ userDataPath }).indexSnapshot();
    const afterEntry = after.materials[0]!.entries[0]!;
    expect(afterEntry.contentBytes).toBe(beforeEntry.contentBytes);
    expect(afterEntry.contentStamp).not.toBe(beforeEntry.contentStamp);
    await expect(
      store.readDocument({
        projectId: source.materials[0]!.id,
        target: "document",
        documentId: entry.id
      })
    ).resolves.toMatchObject({ content: externallyEdited });
  });

  it("creates collision-safe book folders, saves with content revisions, and only unregisters", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-create-");
    const userDataPath = join(root, "user-data");
    const parentDirectory = join(root, "写作项目");
    const store = new FolderCatalogStore({
      userDataPath,
      now: tickingClock()
    });
    const first = await store.createShortBook(
      { title: "雨夜/来信", genre: "悬疑" },
      parentDirectory
    );
    const second = await store.createShortBook({
      parentDirectory,
      input: { title: "雨夜/来信", genre: "悬疑" }
    });

    expect(first.projectDirectory).toMatch(/\/雨夜-来信$/u);
    expect(second.projectDirectory).toMatch(/\/雨夜-来信-2$/u);
    expect(first.resource.id).toMatch(/^book-[0-9a-f]{8}$/);
    expect(second.resource.id).toMatch(/^book-[0-9a-f]{8}$/);
    expect(first.resource.documents).toHaveLength(7);
    expect(first.resource.draft.sections).toHaveLength(2);

    const emptyRevision = createShortWorkspaceContentRevision("");
    const bodyDocumentId = catalogDraftBodyDocumentId("section-1");
    const saved = await store.saveDocument({
      bookId: first.resource.id,
      documentId: bodyDocumentId,
      content: "新的正文",
      baseRevision: emptyRevision,
      baseProjectRevision: 0
    });
    expect(saved.content).toBe("新的正文");
    expect(saved.projectRevision).toBe(1);
    await expect(
      store.saveDocument({
        bookId: first.resource.id,
        documentId: bodyDocumentId,
        content: "会覆盖的正文",
        baseRevision: emptyRevision,
        baseProjectRevision: 0
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);

    const revision = await store.getProjectRevision(first.resource.id, "book");
    const updated = await store.updateBook({
      bookId: first.resource.id,
      title: "雨停之后",
      status: "completed",
      baseProjectRevision: revision
    });
    expect(updated).toMatchObject({ title: "雨停之后", status: "completed" });

    expect(await store.removeBook(first.resource.id)).toEqual({
      bookId: first.resource.id,
      deleted: true
    });
    await expect(access(first.projectDirectory)).resolves.toBeUndefined();
    expect((await store.snapshot()).books.map(({ id }) => id)).toEqual([
      second.resource.id
    ]);

    const reopened = await store.openBookProject(first.projectDirectory);
    expect(
      reopened.resource.draft.sections.find(({ id }) => id === "section-1")?.body
        .content
    ).toBe("新的正文");
    expect((await store.snapshot()).books).toHaveLength(2);
  });

  it("atomically creates, updates, reorders, and deletes plot structure files", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-plot-structure-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createShortBook(
      { title: "剧情结构测试", genre: "悬疑" },
      join(root, "books")
    );
    const created = await store.mutatePlotStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 0,
      mutation: {
        type: "create",
        title: "反转校验",
        description: "核对反转证据链。"
      }
    });
    const stage = created.plotStages.at(-1)!;
    expect(created.projectRevision).toBe(1);
    const createdManifest = JSON.parse(
      await readFile(join(opened.projectDirectory, "deepwrite.json"), "utf8")
    ) as {
      documents: Array<{ id: string; title: string; path: string }>;
    };
    const originalFile = createdManifest.documents.find(
      ({ id }) => id === stage.id
    )!;
    await expect(
      readFile(join(opened.projectDirectory, originalFile.path), "utf8")
    ).resolves.toBe("");

    const updated = await store.mutatePlotStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 1,
      mutation: {
        type: "update",
        stageId: stage.id,
        title: "反转与证据",
        description: "核对证据链和人物知情边界。"
      }
    });
    expect(updated.plotStages.at(-1)).toMatchObject({
      id: stage.id,
      title: "反转与证据"
    });
    const updatedManifest = JSON.parse(
      await readFile(join(opened.projectDirectory, "deepwrite.json"), "utf8")
    ) as { documents: Array<{ id: string; path: string }> };
    expect(updatedManifest.documents.find(({ id }) => id === stage.id)?.path).toBe(
      originalFile.path
    );

    const moved = await store.mutatePlotStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 2,
      mutation: { type: "move", stageId: stage.id, direction: "up" }
    });
    expect(moved.plotStages.at(-2)?.id).toBe(stage.id);
    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: stage.id,
      content: "不可静默删除的反转内容。",
      baseRevision: createShortWorkspaceContentRevision(""),
      baseProjectRevision: 3
    });
    await expect(
      store.mutatePlotStructure({
        bookId: opened.resource.id,
        baseProjectRevision: 4,
        mutation: { type: "delete", stageId: "plot_design" }
      })
    ).rejects.toThrow(/默认剧情结构不可删除/u);

    expect(
      opened.resource.plotStages
        .filter((stage) => stage.enabled)
        .map(({ id }) => id)
    ).toEqual(["plot_design", "intro_design", "plot_refine"]);
    const enabled = await store.mutatePlotStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 4,
      mutation: {
        type: "setEnabled",
        stageId: "outline",
        enabled: true
      }
    });
    expect(
      enabled.plotStages.find(({ id }) => id === "outline")?.enabled
    ).toBe(true);

    const deleted = await store.mutatePlotStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 5,
      mutation: { type: "delete", stageId: stage.id }
    });
    expect(deleted.plotStages.some(({ id }) => id === stage.id)).toBe(false);
    expect(deleted.documents.some(({ id }) => id === stage.id)).toBe(false);
    await expect(
      access(join(opened.projectDirectory, originalFile.path))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      store.mutatePlotStructure({
        bookId: opened.resource.id,
        baseProjectRevision: 5,
        mutation: {
          type: "move",
          stageId: "outline",
          direction: "up"
        }
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);

    const manifestPath = join(opened.projectDirectory, "deepwrite.json");
    const manifestBytes = Buffer.byteLength(
      await readFile(manifestPath, "utf8"),
      "utf8"
    );
    const stageFilesBefore = await readdir(join(opened.projectDirectory, "stages"));
    const constrained = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock(),
      maxManifestBytes: manifestBytes + 8
    });
    await expect(
      constrained.mutatePlotStructure({
        bookId: opened.resource.id,
        baseProjectRevision: 6,
        mutation: {
          type: "create",
          title: "无法提交的结构",
          description: "这段说明会让 manifest 超过预设测试上限。"
        }
      })
    ).rejects.toThrow(/byte limit/u);
    expect(await readdir(join(opened.projectDirectory, "stages"))).toEqual(
      stageFilesBefore
    );
  });

  it("preserves character text through list CRUD and both format conversions", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-character-structure-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createShortBook(
      { title: "人物结构测试", genre: "悬疑" },
      join(root, "books")
    );
    expect(opened.resource.characterStructure).toEqual({ format: "text" });

    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: "character_design",
      content: "林默是守夜人。",
      baseRevision: createShortWorkspaceContentRevision(""),
      baseProjectRevision: 0
    });
    const listed = await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 1,
      mutation: { type: "setFormat", format: "list" }
    });
    expect(listed.characterStructure).toMatchObject({
      format: "list",
      items: [{ title: "人物设定", order: 1 }]
    });
    const firstItem =
      listed.characterStructure.format === "list"
        ? listed.characterStructure.items[0]!
        : undefined;
    expect(firstItem).toBeDefined();
    expect(listed.documents.find(({ id }) => id === firstItem!.id)?.content).toBe(
      "林默是守夜人。"
    );
    expect(
      listed.documents.find(({ id }) => id === "character_design")
    ).toMatchObject({
      title: "概览",
      content: ""
    });

    const created = await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 2,
      mutation: {
        type: "createItem",
        itemId: "character-fixed-id",
        title: "苏遥"
      }
    });
    expect(created.characterStructure).toMatchObject({
      format: "list",
      items: [
        { id: firstItem!.id, order: 1 },
        { id: "character-fixed-id", title: "苏遥", order: 2 }
      ]
    });
    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: "character-fixed-id",
      content: "苏遥保管底片。",
      baseRevision: createShortWorkspaceContentRevision(""),
      baseProjectRevision: 3
    });
    const renamed = await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 4,
      mutation: {
        type: "updateItem",
        itemId: "character-fixed-id",
        title: "苏遥（摄影师）"
      }
    });
    expect(
      renamed.documents.find(({ id }) => id === "character-fixed-id")?.title
    ).toBe("苏遥（摄影师）");
    const moved = await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 5,
      mutation: {
        type: "moveItem",
        itemId: "character-fixed-id",
        direction: "up"
      }
    });
    expect(
      moved.characterStructure.format === "list"
        ? moved.characterStructure.items.map(({ id }) => id)
        : []
    ).toEqual(["character-fixed-id", firstItem!.id]);

    const merged = await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 6,
      mutation: { type: "setFormat", format: "text" }
    });
    expect(merged.characterStructure).toEqual({ format: "text" });
    const mergedText = merged.documents.find(
      ({ id }) => id === "character_design"
    )?.content;
    expect(mergedText).toContain("# 苏遥（摄影师）\n\n苏遥保管底片。");
    expect(mergedText).toContain("# 人物设定\n\n林默是守夜人。");
    expect(
      merged.documents.some(({ id }) => id === "character-fixed-id")
    ).toBe(false);
    await expect(
      store.mutateCharacterStructure({
        bookId: opened.resource.id,
        baseProjectRevision: 6,
        mutation: { type: "setFormat", format: "list" }
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);

    const relisted = await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 7,
      mutation: { type: "setFormat", format: "list" }
    });
    expect(
      relisted.characterStructure.format === "list"
        ? relisted.characterStructure.items.map(({ title }) => title)
        : []
    ).toEqual(["人物设定"]);
  });

  it("keeps list character files intact when merged text exceeds the limit", async () => {
    const root = await makeTemporaryRoot("deepwrite-character-rollback-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      maxMarkdownBytes: 24,
      now: tickingClock()
    });
    const opened = await store.createShortBook(
      { title: "人物回滚测试", genre: "悬疑" },
      join(root, "books")
    );
    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: "character_design",
      content: "alpha",
      baseRevision: createShortWorkspaceContentRevision(""),
      baseProjectRevision: 0
    });
    const listed = await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 1,
      mutation: { type: "setFormat", format: "list" }
    });
    const firstId =
      listed.characterStructure.format === "list"
        ? listed.characterStructure.items[0]!.id
        : "";
    await store.mutateCharacterStructure({
      bookId: opened.resource.id,
      baseProjectRevision: 2,
      mutation: { type: "createItem", itemId: "character-beta", title: "B" }
    });
    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: "character-beta",
      content: "beta",
      baseRevision: createShortWorkspaceContentRevision(""),
      baseProjectRevision: 3
    });

    await expect(
      store.mutateCharacterStructure({
        bookId: opened.resource.id,
        baseProjectRevision: 4,
        mutation: { type: "setFormat", format: "text" }
      })
    ).rejects.toThrow(/byte limit|大小|上限/u);
    const unchanged = (await store.snapshot()).books.find(
      ({ id }) => id === opened.resource.id
    )!;
    expect(unchanged.characterStructure.format).toBe("list");
    expect(unchanged.documents.find(({ id }) => id === firstId)?.content).toBe(
      "alpha"
    );
    expect(
      unchanged.documents.find(({ id }) => id === "character-beta")?.content
    ).toBe("beta");
  });

  it("migrates v2 short and script manifests to the shared default plot stages without changing existing content or revisions", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-v2-plot-migration-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({
      userDataPath,
      now: tickingClock()
    });
    const projects = [
      await store.createShortBook(
        { title: "v2 短篇", genre: "悬疑" },
        join(root, "books")
      ),
      await store.createScriptBook(
        { title: "v2 剧本", genre: "悬疑" },
        join(root, "books")
      )
    ];

    for (const project of projects) {
      await store.saveDocument({
        bookId: project.resource.id,
        documentId: "plot_design",
        content: `${project.resource.bookType} 原剧情`,
        baseRevision: createShortWorkspaceContentRevision(""),
        baseProjectRevision: 0
      });
      const manifestPath = join(project.projectDirectory, "deepwrite.json");
      const current = JSON.parse(await readFile(manifestPath, "utf8")) as {
        schemaVersion: number;
        revision: number;
        createdAt: string;
        updatedAt: string;
        plotStages?: unknown;
        documents: Array<{ id: string; path: string }>;
        [key: string]: unknown;
      };
      const missingIds = new Set(
        project.resource.bookType === "script"
          ? ["intro_design", "narrative_perspective"]
          : ["narrative_perspective"]
      );
      for (const document of current.documents) {
        if (missingIds.has(document.id)) {
          await rm(join(project.projectDirectory, document.path));
        }
      }
      const {
        plotStages: _plotStages,
        characterStructure: _characterStructure,
        ...withoutPlotStages
      } = current;
      await writeJson(manifestPath, {
        ...withoutPlotStages,
        schemaVersion: 2,
        documents: current.documents.filter(({ id }) => !missingIds.has(id))
      });
    }

    const restarted = new FolderCatalogStore({
      userDataPath,
      now: tickingClock()
    });
    const snapshot = await restarted.snapshot();
    expect(snapshot.books).toHaveLength(2);
    for (const book of snapshot.books) {
      expect(book.projectRevision).toBe(1);
      expect(book.plotStages.map(({ id }) => id)).toEqual([
        "worldbuilding",
        "plot_design",
        "intro_design",
        "plot_refine",
        "narrative_perspective",
        "outline"
      ]);
      expect(book.documents.find(({ id }) => id === "plot_design")?.content).toBe(
        `${book.bookType} 原剧情`
      );
      expect(
        book.documents.find(({ id }) => id === "narrative_perspective")?.content
      ).toBe("");
      expect(
        book.documents.find(({ id }) => id === "worldbuilding")?.content
      ).toBe("");
      expect(book.draft.sections.length).toBeGreaterThan(0);
      const migratedManifest = JSON.parse(
        await readFile(
          join(
            projects.find(({ resource }) => resource.id === book.id)!
              .projectDirectory,
            "deepwrite.json"
          ),
          "utf8"
        )
      ) as { schemaVersion: number; revision: number };
      expect(migratedManifest).toMatchObject({ schemaVersion: 4, revision: 1 });
    }
  });

  it("migrates early v3 books whose plot stages predate the enabled flag", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-v3-enabled-migration-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath, now: tickingClock() });
    const opened = await store.createShortBook(
      { title: "旧版 v3 书籍", genre: "悬疑" },
      join(root, "books")
    );
    const manifestPath = join(opened.projectDirectory, "deepwrite.json");
    const current = JSON.parse(await readFile(manifestPath, "utf8")) as {
      characterStructure: unknown;
      plotStages: Array<{
        id: string;
        title: string;
        description: string;
        enabled?: boolean;
      }>;
      [key: string]: unknown;
    };
    const { characterStructure: _characterStructure, ...withoutCharacters } =
      current;
    await writeJson(manifestPath, {
      ...withoutCharacters,
      schemaVersion: 3,
      plotStages: current.plotStages.map(({ enabled: _enabled, ...stage }) => stage)
    });

    const restarted = new FolderCatalogStore({
      userDataPath,
      now: tickingClock()
    });
    const snapshot = await restarted.snapshot();
    expect(snapshot.projectDiagnostics ?? []).toEqual([]);
    expect(snapshot.books).toMatchObject([
      {
        id: opened.resource.id,
        characterStructure: { format: "text" },
        plotStages: [
          { id: "worldbuilding", enabled: true },
          { id: "plot_design", enabled: true },
          { id: "intro_design", enabled: true },
          { id: "plot_refine", enabled: true },
          { id: "narrative_perspective", enabled: true },
          { id: "outline", enabled: true }
        ]
      }
    ]);
    expect(
      JSON.parse(await readFile(manifestPath, "utf8"))
    ).toMatchObject({
      schemaVersion: 4,
      characterStructure: { format: "text" }
    });
  });

  it("creates screenplay projects with the shared default plot structure and numbered episodes", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-script-create-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const created = await store.createScriptBook(
      { title: "雨夜剧本", genre: "悬疑" },
      join(root, "books")
    );

    expect(created.resource).toMatchObject({
      bookType: "script",
      documents: [
        { id: "character_design", title: "人物设计" },
        { id: "worldbuilding", title: "世界观" },
        { id: "plot_design", title: "剧情设计" },
        { id: "intro_design", title: "导语设计" },
        { id: "plot_refine", title: "剧情细化" },
        { id: "narrative_perspective", title: "叙事视角" },
        { id: "outline", title: "大纲" }
      ],
      draft: {
        sections: [{ id: "episode-1", title: "第一集" }]
      }
    });
    expect(
      created.resource.plotStages.find(({ id }) => id === "worldbuilding")
    ).toMatchObject({ enabled: false });
    expect(
      created.resource.documents.some(({ id }) => id === "intro_design")
    ).toBe(true);
    expect(
      created.resource.draft.sections.some(({ title }) => title === "导语")
    ).toBe(false);

    const secondEpisode = await store.createDraftSection({
      bookId: created.resource.id,
      baseProjectRevision: 0
    });
    expect(secondEpisode).toMatchObject({
      id: "episode-2",
      title: "第二集"
    });

    const reopened = await store.openBookProject(
      created.projectDirectory,
      false
    );
    expect(reopened.resource.bookType).toBe("script");
    expect(reopened.resource.draft.sections.map(({ title }) => title)).toEqual([
      "第一集",
      "第二集"
    ]);
    const manifest = JSON.parse(
      await readFile(join(created.projectDirectory, "deepwrite.json"), "utf8")
    ) as {
      bookType: string;
      documents: Array<{ id: string }>;
      draft: { sections: Array<{ id: string }> };
    };
    expect(manifest.bookType).toBe("script");
    expect(manifest.documents.map(({ id }) => id)).toEqual([
      "character_design",
      "worldbuilding",
      "plot_design",
      "intro_design",
      "plot_refine",
      "narrative_perspective",
      "outline"
    ]);
    expect(manifest.draft.sections.map(({ id }) => id)).toEqual([
      "episode-1",
      "episode-2"
    ]);
  });

  it("persists legacy library types while allowing shared cross-type bindings", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-library-type-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const parentDirectory = join(root, "projects");
    const shortMaterial = await store.createLibrary({
      domain: "material",
      name: "短篇剧情素材",
      libraryType: "short",
      materialKind: "plot",
      parentDirectory
    });
    const scriptMaterial = await store.createLibrary({
      domain: "material",
      name: "剧本剧情素材",
      libraryType: "script",
      materialKind: "plot",
      parentDirectory
    });
    const scriptSkill = await store.createLibrary({
      domain: "skill",
      name: "剧本通用技能",
      libraryType: "script",
      skillKind: "general",
      parentDirectory
    });

    expect(scriptMaterial.resource.materialType).toBe("script");
    expect(scriptSkill.resource.skillType).toBe("script");
    const correctlyBound = await store.createScriptBook(
      {
        title: "正确绑定",
        genre: "其他",
        linkedMaterialIdsByKind: { plot: [scriptMaterial.resource.id] },
        linkedSkillIdsByKind: { general: [scriptSkill.resource.id] }
      },
      parentDirectory
    );
    expect(correctlyBound.resource.bookType).toBe("script");
    const crossTypeUpdate = await store.updateBook({
      bookId: correctlyBound.resource.id,
      linkedMaterialIdsByKind: { plot: [shortMaterial.resource.id] },
      baseProjectRevision: 0
    });
    expect(crossTypeUpdate.linkedMaterialIdsByKind.plot).toEqual([
      shortMaterial.resource.id
    ]);
    expect(
      await store.getProjectRevision(correctlyBound.resource.id, "book")
    ).toBe(1);
    const scriptWithShortMaterial = await store.createScriptBook(
      {
        title: "剧本绑定短篇来源素材",
        genre: "其他",
        linkedMaterialIdsByKind: { plot: [shortMaterial.resource.id] }
      },
      parentDirectory
    );
    const shortWithScriptMaterial = await store.createShortBook(
      {
        title: "短篇绑定剧本来源素材",
        genre: "其他",
        linkedMaterialIdsByKind: { plot: [scriptMaterial.resource.id] }
      },
      parentDirectory
    );
    expect(scriptWithShortMaterial.resource.linkedMaterialIdsByKind.plot).toEqual([
      shortMaterial.resource.id
    ]);
    expect(shortWithScriptMaterial.resource.linkedMaterialIdsByKind.plot).toEqual([
      scriptMaterial.resource.id
    ]);
  });

  it("saves draft body and character-state files independently while guarding title metadata", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-draft-independent-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createShortBook(
      { title: "双文件正文", genre: "悬疑" },
      join(root, "books")
    );
    const bodyId = catalogDraftBodyDocumentId("section-1");
    const stateId = catalogDraftCharacterStateDocumentId("section-1");
    const emptyRevision = createShortWorkspaceContentRevision("");

    const savedBody = await store.saveDocument({
      bookId: opened.resource.id,
      documentId: bodyId,
      content: "第一节正文",
      baseRevision: emptyRevision,
      baseProjectRevision: 0
    });
    expect(savedBody.projectRevision).toBe(1);
    const savedState = await store.saveDocument({
      bookId: opened.resource.id,
      documentId: stateId,
      content: "林舟：仍在门外",
      baseRevision: emptyRevision,
      // A content-only save uses the target file revision, so an unrelated
      // body save must not make this independent file stale.
      baseProjectRevision: 0
    });
    expect(savedState).toMatchObject({
      content: "林舟：仍在门外",
      projectRevision: 2
    });

    await expect(
      store.saveDocument({
        bookId: opened.resource.id,
        documentId: bodyId,
        title: "雨中的门",
        content: "第一节正文",
        baseRevision: createShortWorkspaceContentRevision("第一节正文"),
        baseProjectRevision: 0
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);

    await expect(
      store.saveDocument({
        bookId: opened.resource.id,
        documentId: bodyId,
        title: "雨中的门",
        content: "第一节正文",
        baseRevision: createShortWorkspaceContentRevision("第一节正文"),
        baseProjectRevision: 2
      })
    ).resolves.toMatchObject({ title: "雨中的门" });

    const snapshot = await store.snapshot();
    const section = snapshot.books[0]?.draft.sections.find(
      ({ id }) => id === "section-1"
    );
    expect(section).toMatchObject({
      title: "雨中的门",
      body: { content: "第一节正文", title: "雨中的门" },
      characterState: {
        content: "林舟：仍在门外",
        title: "雨中的门 · 人物状态"
      }
    });
    expect(await store.getProjectRevision(opened.resource.id, "book")).toBe(3);
  });

  it("creates and deletes mapped draft section file pairs", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-draft-sections-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createShortBook(
      { title: "小节管理", genre: "其他" },
      join(root, "books")
    );
    const created = await store.createDraftSection({
      bookId: opened.resource.id,
      afterSectionId: "intro",
      title: "插入的小节",
      wordCountRequirement: "约 1500 字",
      baseProjectRevision: 0
    });
    expect(created).toMatchObject({
      id: "section-2",
      title: "插入的小节",
      body: { id: catalogDraftBodyDocumentId("section-2"), content: "" },
      characterState: {
        id: catalogDraftCharacterStateDocumentId("section-2"),
        content: ""
      }
    });

    const manifestPath = join(opened.projectDirectory, "deepwrite.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      revision: number;
      draft: {
        sections: Array<{
          id: string;
          body: { path: string };
          characterState: { path: string };
        }>;
      };
    };
    expect(manifest.revision).toBe(1);
    expect(manifest.draft.sections.map(({ id }) => id)).toEqual([
      "intro",
      "section-2",
      "section-1"
    ]);
    const mappedSection = manifest.draft.sections.find(
      ({ id }) => id === "section-2"
    )!;
    await expect(
      readFile(join(opened.projectDirectory, mappedSection.body.path), "utf8")
    ).resolves.toBe("");
    await expect(
      readFile(
        join(opened.projectDirectory, mappedSection.characterState.path),
        "utf8"
      )
    ).resolves.toBe("");

    await expect(
      store.deleteDraftSection({
        bookId: opened.resource.id,
        sectionId: "section-2",
        baseProjectRevision: 1
      })
    ).resolves.toEqual({
      bookId: opened.resource.id,
      sectionId: "section-2",
      deleted: true
    });
    const afterDelete = JSON.parse(await readFile(manifestPath, "utf8")) as {
      revision: number;
      draft: { sections: Array<{ id: string }> };
    };
    expect(afterDelete.revision).toBe(2);
    expect(afterDelete.draft.sections.map(({ id }) => id)).toEqual([
      "intro",
      "section-1"
    ]);
    await expect(
      store.saveDocument({
        bookId: opened.resource.id,
        documentId: created.body.id,
        content: "迟到的旧编辑请求不应复活正文",
        force: true
      })
    ).rejects.toThrow(/该正文小节已删除或不存在/u);
    const afterStaleSave = JSON.parse(
      await readFile(manifestPath, "utf8")
    ) as {
      revision: number;
      documents: Array<{ id: string }>;
      draft: { sections: Array<{ id: string }> };
    };
    expect(afterStaleSave).toMatchObject({ revision: 2 });
    expect(
      afterStaleSave.documents.some(({ id }) => id === created.body.id)
    ).toBe(false);
    expect(
      afterStaleSave.draft.sections.some(({ id }) => id === created.id)
    ).toBe(false);
    await expect(
      access(join(opened.projectDirectory, mappedSection.body.path))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(join(opened.projectDirectory, mappedSection.characterState.path))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("moves the complete draft section entry and preserves its paired files", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-move-draft-section-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createScriptBook(
      { title: "剧集排序", genre: "其他" },
      join(root, "books")
    );
    const firstSection = opened.resource.draft.sections[0]!;
    const secondSection = await store.createDraftSection({
      bookId: opened.resource.id,
      afterSectionId: firstSection.id,
      title: "第二集",
      baseProjectRevision: 0
    });
    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: secondSection.body.id,
      content: "第二集正文",
      baseProjectRevision: 1
    });
    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: secondSection.characterState.id,
      content: "第二集人物状态",
      baseProjectRevision: 1
    });

    await expect(
      store.moveDraftSection({
        bookId: opened.resource.id,
        sectionId: secondSection.id,
        direction: "up",
        baseProjectRevision: 3
      })
    ).resolves.toMatchObject({
      sectionId: secondSection.id,
      direction: "up",
      moved: true,
      projectRevision: 4
    });

    const snapshot = await store.snapshot();
    expect(snapshot.books[0]?.draft.sections.map(({ id }) => id)).toEqual([
      secondSection.id,
      firstSection.id
    ]);
    expect(snapshot.books[0]?.draft.sections[0]).toMatchObject({
      id: secondSection.id,
      body: { content: "第二集正文" },
      characterState: { content: "第二集人物状态" }
    });
    await expect(
      store.moveDraftSection({
        bookId: opened.resource.id,
        sectionId: secondSection.id,
        direction: "up",
        baseProjectRevision: 4
      })
    ).resolves.toMatchObject({ moved: false, projectRevision: 4 });
  });

  it("creates a draft section batch in one revision and replays it idempotently", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-draft-section-batch-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createShortBook(
      { title: "批量小节", genre: "其他" },
      join(root, "books")
    );
    const request = {
      operationId: "run-1:proposal-create:revision-1",
      bookId: opened.resource.id,
      afterSectionId: "intro",
      baseProjectRevision: 0,
      sections: [
        {
          clientSectionId: "provisional:section:alpha",
          title: "相遇",
          wordCountRequirement: "约 1200 字"
        },
        {
          clientSectionId: "provisional:section:beta",
          title: "追逐",
          wordCountRequirement: "约 1800 字"
        }
      ]
    };

    const created = await store.createDraftSections(request);
    expect(created).toMatchObject({
      operationId: request.operationId,
      bookId: opened.resource.id,
      projectRevision: 1,
      sections: [
        {
          clientSectionId: "provisional:section:alpha",
          section: {
            id: "section-2",
            title: "相遇",
            body: {
              id: catalogDraftBodyDocumentId("section-2"),
              content: ""
            },
            characterState: {
              id: catalogDraftCharacterStateDocumentId("section-2"),
              content: ""
            }
          }
        },
        {
          clientSectionId: "provisional:section:beta",
          section: {
            id: "section-3",
            title: "追逐",
            body: {
              id: catalogDraftBodyDocumentId("section-3"),
              content: ""
            },
            characterState: {
              id: catalogDraftCharacterStateDocumentId("section-3"),
              content: ""
            }
          }
        }
      ]
    });

    const manifestPath = join(opened.projectDirectory, "deepwrite.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      revision: number;
      draft: {
        sections: Array<{
          id: string;
          body: { path: string };
          characterState: { path: string };
        }>;
      };
      draftSectionCreationOperations: Array<{
        operationId: string;
        sections: Array<{ clientSectionId: string; sectionId: string }>;
      }>;
    };
    expect(manifest.revision).toBe(1);
    expect(manifest.draft.sections.map(({ id }) => id)).toEqual([
      "intro",
      "section-2",
      "section-3",
      "section-1"
    ]);
    expect(manifest.draftSectionCreationOperations).toMatchObject([
      {
        operationId: request.operationId,
        sections: [
          {
            clientSectionId: "provisional:section:alpha",
            sectionId: "section-2"
          },
          {
            clientSectionId: "provisional:section:beta",
            sectionId: "section-3"
          }
        ]
      }
    ]);
    for (const sectionId of ["section-2", "section-3"]) {
      const section = manifest.draft.sections.find(({ id }) => id === sectionId)!;
      await expect(
        readFile(join(opened.projectDirectory, section.body.path), "utf8")
      ).resolves.toBe("");
      await expect(
        readFile(
          join(opened.projectDirectory, section.characterState.path),
          "utf8"
        )
      ).resolves.toBe("");
    }

    const replayed = await store.createDraftSections(request);
    expect(replayed).toEqual(created);
    expect(await store.getProjectRevision(opened.resource.id, "book")).toBe(1);
    const replayedManifest = JSON.parse(
      await readFile(manifestPath, "utf8")
    ) as typeof manifest;
    expect(replayedManifest.draft.sections).toHaveLength(4);
    expect(replayedManifest.draftSectionCreationOperations).toHaveLength(1);

    await expect(
      store.createDraftSections({
        ...request,
        sections: [
          {
            clientSectionId: "provisional:section:alpha",
            title: "被篡改的请求"
          }
        ]
      })
    ).rejects.toThrow(/请求内容与首次提交不一致/u);
    expect(await store.getProjectRevision(opened.resource.id, "book")).toBe(1);
  });

  it("uses screenplay episode ids for a batch created through the shared path", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-episode-batch-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createScriptBook(
      { title: "批量剧集", genre: "悬疑" },
      join(root, "books")
    );

    await expect(
      store.createDraftSections({
        operationId: "script-run-1:create-episodes:revision-1",
        bookId: opened.resource.id,
        baseProjectRevision: 0,
        sections: [
          { clientSectionId: "provisional:episode:2" },
          { clientSectionId: "provisional:episode:3" }
        ]
      })
    ).resolves.toMatchObject({
      projectRevision: 1,
      sections: [
        {
          clientSectionId: "provisional:episode:2",
          section: { id: "episode-2", title: "第二集" }
        },
        {
          clientSectionId: "provisional:episode:3",
          section: { id: "episode-3", title: "第三集" }
        }
      ]
    });
  });

  it("deletes registered book, material, and skill project folders", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-delete-projects-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const parentDirectory = join(root, "projects");
    const book = await store.createShortBook(
      { title: "待删除书籍", genre: "悬疑" },
      parentDirectory
    );
    const material = await store.createLibrary({
      domain: "material",
      name: "待删除素材库",
      materialKind: "plot",
      parentDirectory
    });
    const skill = await store.createLibrary({
      domain: "skill",
      name: "待删除技能库",
      skillKind: "plot",
      parentDirectory
    });

    for (const project of [
      { domain: "book" as const, id: book.resource.id, path: book.projectDirectory },
      { domain: "material" as const, id: material.resource.id, path: material.projectDirectory },
      { domain: "skill" as const, id: skill.resource.id, path: skill.projectDirectory }
    ]) {
      await expect(
        store.deleteProject({ domain: project.domain, projectId: project.id })
      ).resolves.toEqual({
        domain: project.domain,
        projectId: project.id,
        deleted: true
      });
      await expect(access(project.path)).rejects.toMatchObject({ code: "ENOENT" });
    }

    await expect(store.snapshot()).resolves.toMatchObject({
      books: [],
      materials: [],
      skills: []
    });
  });

  it("initializes an imported legacy book as a current manifest and Markdown project", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-import-legacy-");
    const parentDirectory = join(root, "工作目录", "books");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const imported = await store.importLegacyBook(
      {
        title: "旧版雨夜来信",
        genre: "悬疑",
        status: "editing",
        linkedMaterialIdsByKind: {
          character: [], gimmick: [], plot: [], draft: [], other: []
        },
        linkedSkillIdsByKind: {
          general: [], plot: [], style: [], other: []
        },
        documents: [
          { id: "character_design", title: "人物设计", content: "旧人物" },
          { id: "plot_design", title: "剧情设计", content: "" },
          { id: "intro_design", title: "导语设计", content: "" },
          { id: "plot_refine", title: "剧情细化", content: "" },
          { id: "outline", title: "大纲", content: "旧大纲" },
          { id: "draft", title: "正文编写", content: "旧正文" },
          { id: "legacy-7-review", title: "正文审阅（旧版）", content: "旧审阅" }
        ]
      },
      parentDirectory
    );

    expect(imported.projectDirectory).toBe(
      join(await realpath(parentDirectory), "旧版雨夜来信")
    );
    expect(imported.resource.documents).toHaveLength(8);
    expect(
      imported.resource.draft.sections.find(({ id }) => id === "section-1")
        ?.body.content
    ).toBe("旧正文");
    const manifest = JSON.parse(
      await readFile(join(imported.projectDirectory, "deepwrite.json"), "utf8")
    ) as {
      schemaVersion: number;
      kind: string;
      documents: Array<{ id: string; path: string }>;
      draft: {
        sections: Array<{
          id: string;
          body: { path: string };
          characterState: { path: string };
        }>;
      };
    };
    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.kind).toBe("deepwrite.book");
    expect(manifest.documents.some(({ id }) => id === "draft")).toBe(false);
    const firstSection = manifest.draft.sections.find(({ id }) => id === "section-1")!;
    expect(firstSection.body.path).toBe("stages/draft/section-1.body.md");
    expect(firstSection.characterState.path).toBe(
      "stages/draft/section-1.state.md"
    );
    await expect(
      readFile(join(imported.projectDirectory, firstSection.body.path), "utf8")
    ).resolves.toBe("旧正文");
    await expect(
      readFile(
        join(imported.projectDirectory, firstSection.characterState.path),
        "utf8"
      )
    ).resolves.toBe("");
  });

  it("creates a new folder-backed library from legacy library data", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-import-library-");
    const parentDirectory = join(root, "工作目录", "materials");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const imported = await store.importLegacyLibrary(
      {
        domain: "material",
        library: {
          id: "legacy-material-id",
          title: "旧版人物素材库",
          materialType: "short",
          materialKind: "character",
          parentGenre: "追妻",
          subGenre: "剧情流",
          overview: "旧素材说明",
          entries: [
            {
              id: "legacy-entry-id",
              stageId: "character",
              title: "旧版女主",
              body: "她记得每一场雨。",
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ],
          createdAt: timestamp,
          updatedAt: timestamp
        }
      },
      parentDirectory
    );

    expect(imported.resource.id).not.toBe("legacy-material-id");
    expect(imported.resource.id).toMatch(/^material-[0-9a-f]{8}$/);
    expect(imported.resource.entries[0]?.id).not.toBe("legacy-entry-id");
    expect(imported.resource).toMatchObject({
      title: "旧版人物素材库",
      materialKind: "character",
      overview: "旧素材说明",
      entries: [
        {
          stageId: "character",
          title: "旧版女主",
          body: "她记得每一场雨。"
        }
      ]
    });
    const manifest = JSON.parse(
      await readFile(join(imported.projectDirectory, "deepwrite.json"), "utf8")
    ) as { kind: string; entries: Array<{ path: string }> };
    expect(manifest.kind).toBe("deepwrite.material-library");
    await expect(
      readFile(join(imported.projectDirectory, manifest.entries[0]!.path), "utf8")
    ).resolves.toBe("她记得每一场雨。");
  });

  it("does not resurrect an unregistered legacy book when the app restarts", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-unregister-restart-");
    const userDataPath = join(root, "user-data");
    const source = catalogFixture();
    const store = new FolderCatalogStore({ userDataPath, initialSnapshot: source });
    expect((await store.snapshot()).books.map(({ id }) => id)).toEqual([
      "book-existing"
    ]);

    await store.removeBook("book-existing");
    const restarted = new FolderCatalogStore({
      userDataPath,
      initialSnapshot: source
    });
    expect((await restarted.snapshot()).books).toEqual([]);
  });

  it("rejects a copied project with the same UUID while the original still exists", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-duplicate-project-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });
    const opened = await store.createShortBook(
      { title: "原始项目", genre: "其他" },
      join(root, "projects")
    );
    const copiedDirectory = join(root, "projects", "项目副本");
    await cp(opened.projectDirectory, copiedDirectory, { recursive: true });

    await expect(store.openBookProject(copiedDirectory)).rejects.toThrow(
      /相同项目 ID/u
    );
    expect((await store.snapshot()).books).toHaveLength(1);
  });

  it("preserves ids that are equal in different catalog domains", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-cross-domain-id-");
    const source = catalogFixture();
    source.books[0]!.id = "shared-id";
    source.materials[0]!.id = "shared-id";
    source.books[0]!.linkedMaterialIdsByKind.character = ["shared-id"];
    source.materialGroups[0]!.members.character = "shared-id";
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });

    const migrated = await store.migrateSnapshot(source);
    expect(migrated.books[0]?.id).toBe("shared-id");
    expect(migrated.materials[0]?.id).toBe("shared-id");
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; domain: string }>;
    };
    expect(
      registry.projects.filter(({ id }) => id === "shared-id").map(({ domain }) => domain)
    ).toEqual(["material-library", "book"]);
  });

  it("keeps available projects usable when a registered folder was moved", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-missing-project-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });
    await store.migrateSnapshot(catalogFixture());
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const missing = registry.projects.find(
      ({ id }) => id === "material-existing"
    )!;
    await rm(missing.projectDirectory, { recursive: true, force: true });

    const snapshot = await store.snapshot();
    expect(snapshot.materials).toEqual([]);
    expect(snapshot.books.map(({ id }) => id)).toEqual(["book-existing"]);
    expect(snapshot.skills.map(({ id }) => id)).toEqual(["skill-existing"]);
    expect(snapshot.projectDiagnostics).toEqual([
      expect.objectContaining({
        projectId: "material-existing",
        kind: "deepwrite.material-library",
        code: "unavailable"
      })
    ]);
  });

  it("re-reads external Markdown edits and saves material and skill entry files", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-library-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    await store.migrateSnapshot(catalogFixture());
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const bookDirectory = registry.projects.find(
      ({ id }) => id === "book-existing"
    )!.projectDirectory;
    const materialDirectory = registry.projects.find(
      ({ id }) => id === "material-existing"
    )!.projectDirectory;
    const skillDirectory = registry.projects.find(
      ({ id }) => id === "skill-existing"
    )!.projectDirectory;
    const bookManifest = JSON.parse(
      await readFile(join(bookDirectory, "deepwrite.json"), "utf8")
    ) as {
      draft: { sections: Array<{ id: string; body: { path: string } }> };
    };
    const bodyPath = bookManifest.draft.sections.find(
      ({ id }) => id === "section-1"
    )!.body.path;
    await writeFile(join(bookDirectory, bodyPath), "Cursor 外部修改", "utf8");
    expect(
      (await store.snapshot()).books[0]?.draft.sections.find(
        ({ id }) => id === "section-1"
      )?.body.content
    ).toBe("Cursor 外部修改");

    const material = await store.saveLibraryEntry({
      domain: "material",
      libraryId: "material-existing",
      entryId: "material-entry",
      title: "新守夜人",
      content: "素材的新正文",
      baseRevision: createShortWorkspaceContentRevision("守夜人从不在白天出现。"),
      baseProjectRevision: 0
    });
    expect(material).toMatchObject({ title: "新守夜人", body: "素材的新正文" });

    const skill = await store.saveLibraryEntry({
      domain: "skill",
      libraryId: "skill-existing",
      entryId: "skill-entry",
      content: "技能的新正文",
      baseRevision: createShortWorkspaceContentRevision("保持短句和悬念。"),
      baseProjectRevision: 0
    });
    expect(skill).toMatchObject({
      body: "技能的新正文",
      sourceSkillId: "source-skill"
    });

    const savedMaterialManifestText = await readFile(
      join(materialDirectory, "deepwrite.json"),
      "utf8"
    );
    expect(savedMaterialManifestText).not.toContain("素材的新正文");
    const savedMaterialManifest = JSON.parse(savedMaterialManifestText) as {
      revision: number;
      entries: Array<{ title: string; path: string }>;
    };
    expect(savedMaterialManifest).toMatchObject({
      revision: 1,
      entries: [{ title: "新守夜人", path: "entries/material-entry.md" }]
    });
    expect(
      await readFile(
        join(materialDirectory, savedMaterialManifest.entries[0]!.path),
        "utf8"
      )
    ).toBe("素材的新正文");

    const savedSkillManifestText = await readFile(
      join(skillDirectory, "deepwrite.json"),
      "utf8"
    );
    expect(savedSkillManifestText).not.toContain("技能的新正文");
    const savedSkillManifest = JSON.parse(savedSkillManifestText) as {
      revision: number;
      entries: Array<{ path: string; sourceSkillId?: string }>;
    };
    expect(savedSkillManifest).toMatchObject({
      revision: 1,
      entries: [
        {
          path: "entries/skill-entry.md",
          sourceSkillId: "source-skill"
        }
      ]
    });
    expect(
      await readFile(
        join(skillDirectory, savedSkillManifest.entries[0]!.path),
        "utf8"
      )
    ).toBe("技能的新正文");

    await expect(
      store.saveLibraryEntry({
        domain: "skill",
        libraryId: "skill-existing",
        entryId: "skill-entry",
        content: "冲突内容",
        baseRevision: createShortWorkspaceContentRevision("保持短句和悬念。"),
        baseProjectRevision: 0
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);

    const restarted = await new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    }).snapshot();
    expect(restarted.materials[0]?.entries[0]).toMatchObject({
      title: "新守夜人",
      body: "素材的新正文"
    });
    expect(restarted.skills[0]?.entries[0]).toMatchObject({
      body: "技能的新正文",
      sourceSkillId: "source-skill"
    });
  });

  it("creates folder-backed material and skill libraries and maintains entry files", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-library-crud-");
    const userDataPath = join(root, "user-data");
    const parentDirectory = join(root, "本地资源库");
    const store = new FolderCatalogStore({
      userDataPath,
      now: tickingClock()
    });

    const material = await store.createLibrary({
      domain: "material",
      name: "人物/素材",
      materialKind: "character",
      parentDirectory
    });
    const skill = await store.createLibrary({
      domain: "skill",
      name: "悬念技能",
      skillKind: "plot",
      parentDirectory
    });

    expect(material).toMatchObject({
      domain: "material-library",
      revision: 0,
      resource: {
        title: "人物/素材",
        materialType: "short",
        materialKind: "character",
        parentGenre: "",
        subGenre: "",
        overview: "",
        entries: [],
        projectRevision: 0
      }
    });
    expect(material.resource.id).toMatch(/^material-[0-9a-f]{8}$/);
    expect(skill).toMatchObject({
      domain: "skill-library",
      revision: 0,
      resource: {
        title: "悬念技能",
        skillType: "short",
        skillKind: "plot",
        overview: "",
        isBuiltin: false,
        entries: [],
        projectRevision: 0
      }
    });
    expect(skill.resource.id).toMatch(/^skill-[0-9a-f]{8}$/);
    expect(material.projectDirectory).toMatch(/\/人物-素材$/u);
    expect(skill.projectDirectory).toMatch(/\/悬念技能$/u);
    await expect(
      access(join(material.projectDirectory, "entries"))
    ).resolves.toBeUndefined();
    await expect(
      access(join(skill.projectDirectory, "entries"))
    ).resolves.toBeUndefined();

    const materialEntry = await store.createLibraryEntry({
      domain: "material",
      libraryId: material.resource.id,
      title: "守夜人",
      content: "守夜人只在雨夜出现。"
    });
    const skillEntry = await store.createLibraryEntry({
      domain: "skill",
      libraryId: skill.resource.id,
      title: "结尾留钩",
      content: "每一节结尾保留未回答的问题。"
    });
    expect(materialEntry).toMatchObject({
      stageId: "other",
      title: "守夜人",
      body: "守夜人只在雨夜出现。"
    });
    expect(materialEntry.id).toMatch(/^material-entry-[0-9a-f]{8}$/);
    expect(skillEntry).toMatchObject({
      stageId: "draft",
      title: "结尾留钩",
      body: "每一节结尾保留未回答的问题。"
    });
    expect(skillEntry.id).toMatch(/^skill-entry-[0-9a-f]{8}$/);

    const materialManifest = JSON.parse(
      await readFile(join(material.projectDirectory, "deepwrite.json"), "utf8")
    ) as {
      revision: number;
      materialKind: string;
      entries: Array<{ id: string; stageId: string; path: string }>;
    };
    const skillManifest = JSON.parse(
      await readFile(join(skill.projectDirectory, "deepwrite.json"), "utf8")
    ) as {
      revision: number;
      skillKind: string;
      entries: Array<{ id: string; stageId: string; path: string }>;
    };
    expect(materialManifest).toMatchObject({
      revision: 1,
      materialKind: "character",
      entries: [
        {
          id: materialEntry.id,
          stageId: "other"
        }
      ]
    });
    expect(skillManifest).toMatchObject({
      revision: 1,
      skillKind: "plot",
      entries: [
        {
          id: skillEntry.id,
          stageId: "draft"
        }
      ]
    });
    const materialEntryPath = join(
      material.projectDirectory,
      materialManifest.entries[0]!.path
    );
    const skillEntryPath = join(
      skill.projectDirectory,
      skillManifest.entries[0]!.path
    );
    expect(await readFile(materialEntryPath, "utf8")).toBe(
      "守夜人只在雨夜出现。"
    );
    expect(await readFile(skillEntryPath, "utf8")).toBe(
      "每一节结尾保留未回答的问题。"
    );

    await expect(
      store.removeLibraryEntry({
        domain: "material",
        libraryId: material.resource.id,
        entryId: materialEntry.id,
        baseProjectRevision: 0
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);
    await expect(access(materialEntryPath)).resolves.toBeUndefined();

    await writeFile(materialEntryPath, "Cursor 刚补充的守夜人设定", "utf8");
    await expect(
      store.removeLibraryEntry({
        domain: "material",
        libraryId: material.resource.id,
        entryId: materialEntry.id,
        baseRevision: createShortWorkspaceContentRevision(
          "守夜人只在雨夜出现。"
        ),
        baseProjectRevision: 1
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);
    expect(await readFile(materialEntryPath, "utf8")).toBe(
      "Cursor 刚补充的守夜人设定"
    );

    expect(
      await store.removeLibraryEntry({
        domain: "material",
        libraryId: material.resource.id,
        entryId: materialEntry.id,
        baseProjectRevision: 0,
        force: true
      })
    ).toEqual({
      libraryId: material.resource.id,
      entryId: materialEntry.id,
      deleted: true
    });
    await expect(access(materialEntryPath)).rejects.toMatchObject({
      code: "ENOENT"
    });
    expect(
      JSON.parse(
        await readFile(join(material.projectDirectory, "deepwrite.json"), "utf8")
      )
    ).toMatchObject({ revision: 2, entries: [] });
    expect(
      await store.removeLibraryEntry({
        domain: "material",
        libraryId: material.resource.id,
        entryId: materialEntry.id,
        baseProjectRevision: 2
      })
    ).toEqual({
      libraryId: material.resource.id,
      entryId: materialEntry.id,
      deleted: false
    });

    expect(
      await store.unregisterProject({
        domain: "skill",
        projectId: skill.resource.id
      })
    ).toEqual({
      domain: "skill",
      projectId: skill.resource.id,
      unregistered: true
    });
    await expect(access(skill.projectDirectory)).resolves.toBeUndefined();
    expect((await store.snapshot()).skills).toEqual([]);
    expect((await store.snapshot()).materials).toHaveLength(1);

    await store.openSkillProject(skill.projectDirectory);
    const restarted = await new FolderCatalogStore({ userDataPath }).snapshot();
    expect(restarted.skills[0]?.entries[0]).toMatchObject({
      id: skillEntry.id,
      body: "每一节结尾保留未回答的问题。"
    });
    expect(await readFile(skillEntryPath, "utf8")).toBe(
      "每一节结尾保留未回答的问题。"
    );
  });

  it("creates persistent material and skill groups with optional members", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-library-groups-");
    const userDataPath = join(root, "user-data");
    const libraryParent = join(root, "libraries");
    const groupParent = join(root, "groups");
    const store = new FolderCatalogStore({ userDataPath, now: tickingClock() });
    const material = await store.createLibrary({
      domain: "material",
      name: "剧情素材库",
      materialKind: "plot",
      parentDirectory: libraryParent
    });
    const replacementMaterial = await store.createLibrary({
      domain: "material",
      name: "替换剧情素材库",
      materialKind: "plot",
      parentDirectory: libraryParent
    });
    const skill = await store.createLibrary({
      domain: "skill",
      name: "通用技能库",
      skillKind: "general",
      parentDirectory: libraryParent
    });

    const emptyMaterialGroup = await store.createLibraryGroup({
      domain: "material",
      name: "待整理素材",
      members: {},
      parentDirectory: groupParent
    });
    const skillGroup = await store.createLibraryGroup({
      domain: "skill",
      name: "短篇技能组",
      members: { general: skill.resource.id },
      parentDirectory: groupParent
    });
    const materialGroup = await store.createLibraryGroup({
      domain: "material",
      name: "短篇素材组",
      members: { plot: material.resource.id },
      parentDirectory: groupParent
    });

    expect(emptyMaterialGroup).toMatchObject({
      domain: "material-group",
      resource: { title: "待整理素材", members: {}, projectRevision: 0 }
    });
    expect(emptyMaterialGroup.resource.id).toMatch(/^material-group-[0-9a-f]{8}$/);
    expect(skillGroup.resource.id).toMatch(/^skill-group-[0-9a-f]{8}$/);
    expect(materialGroup.resource.id).toMatch(/^material-group-[0-9a-f]{8}$/);
    expect(skillGroup.resource.members).toEqual({ general: skill.resource.id });
    expect(materialGroup.resource.members).toEqual({ plot: material.resource.id });
    await expect(
      access(join(skillGroup.projectDirectory, "deepwrite.json"))
    ).resolves.toBeUndefined();

    const restarted = await new FolderCatalogStore({ userDataPath }).snapshot();
    expect(restarted.materialGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "待整理素材", members: {} }),
        expect.objectContaining({
          title: "短篇素材组",
          members: { plot: material.resource.id }
        })
      ])
    );
    expect(restarted.skillGroups).toEqual([
      expect.objectContaining({
        title: "短篇技能组",
        members: { general: skill.resource.id }
      })
    ]);
    const updatedMaterialGroup = await store.updateLibraryGroup({
      domain: "material",
      groupId: materialGroup.resource.id,
      title: "已重命名素材组",
      members: { plot: replacementMaterial.resource.id },
      baseProjectRevision: 0
    });
    expect(updatedMaterialGroup).toMatchObject({
      id: materialGroup.resource.id,
      title: "已重命名素材组",
      members: { plot: replacementMaterial.resource.id },
      projectRevision: 1
    });
    await expect(
      store.updateLibraryGroup({
        domain: "material",
        groupId: materialGroup.resource.id,
        members: { plot: material.resource.id },
        baseProjectRevision: 0
      })
    ).rejects.toThrow(/当前版本 1/u);
    await expect(
      store.createLibraryGroup({
        domain: "skill",
        name: "重复技能组",
        members: { general: skill.resource.id },
        parentDirectory: groupParent
      })
    ).rejects.toThrow(/已经属于分组/u);
    await expect(
      store.createLibraryGroup({
        domain: "skill",
        name: "无效分组",
        members: { plot: skill.resource.id },
        parentDirectory: groupParent
      })
    ).rejects.toThrow(/不能放入plot分类/u);
  });

  it("cleans a newly created project when registry registration cannot commit", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-create-rollback-");
    const longParentName = Array.from(
      // Keep the registry entry larger than the manifest without exhausting
      // macOS's path limit once the implementation appends its staging name.
      { length: 40 },
      (_, index) => `父目录-${index}`
    ).join("/");
    const probeParent = join(root, longParentName, "probe");
    const probeStore = new FolderCatalogStore({
      userDataPath: join(root, "probe-user-data"),
      now: () => timestamp
    });
    const probe = await probeStore.createLibrary({
      domain: "skill",
      name: "注册回滚",
      skillKind: "general",
      parentDirectory: probeParent
    });
    const manifestBytes = Buffer.byteLength(
      await readFile(join(probe.projectDirectory, "deepwrite.json"), "utf8")
    );
    const registryBytes = Buffer.byteLength(
      await readFile(probeStore.registryPath, "utf8")
    );
    expect(registryBytes).toBeGreaterThan(manifestBytes + 8);

    const limitedParent = join(root, longParentName, "limited");
    const limitedStore = new FolderCatalogStore({
      userDataPath: join(root, "limited-user-data"),
      now: () => timestamp,
      maxManifestBytes: Math.floor((manifestBytes + registryBytes) / 2)
    });
    await expect(
      limitedStore.createLibrary({
        domain: "skill",
        name: "注册回滚",
        skillKind: "general",
        parentDirectory: limitedParent
      })
    ).rejects.toThrow(/JSON content exceeds/u);
    expect(await readdir(limitedParent)).toEqual([]);
  });

  it("keeps Markdown unchanged when its manifest update cannot commit", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-save-rollback-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath });
    const created = await store.createShortBook(
      { title: "回滚测试书籍", genre: "悬疑" },
      join(root, "books")
    );
    const registryText = await readFile(store.registryPath, "utf8");
    const bookDirectory = created.projectDirectory;
    const manifestPath = join(bookDirectory, "deepwrite.json");
    const manifestText = await readFile(manifestPath, "utf8");
    const nextManifest = JSON.parse(manifestText) as {
      documents: Array<{ title: string }>;
      draft: {
        sections: Array<{
          id: string;
          title: string;
          body: { path: string };
        }>;
      };
    };
    const firstSection = nextManifest.draft.sections.find(
      ({ id }) => id === "section-1"
    )!;
    const documentPath = join(bookDirectory, firstSection.body.path);
    firstSection.title = "长".repeat(240);
    const readableBytes = Math.max(
      Buffer.byteLength(registryText),
      Buffer.byteLength(manifestText)
    );
    expect(
      Buffer.byteLength(`${JSON.stringify(nextManifest, null, 2)}\n`)
    ).toBeGreaterThan(readableBytes + 1);

    const limitedStore = new FolderCatalogStore({
      userDataPath,
      maxManifestBytes: readableBytes + 1,
      now: tickingClock()
    });
    const originalContent = await readFile(documentPath, "utf8");
    await expect(
      limitedStore.saveDocument({
        bookId: created.resource.id,
        documentId: catalogDraftBodyDocumentId("section-1"),
        title: "长".repeat(240),
        content: "不应半提交的新内容",
        baseRevision: createShortWorkspaceContentRevision(originalContent),
        baseProjectRevision: 0
      })
    ).rejects.toThrow(/JSON content exceeds/u);
    expect(await readFile(documentPath, "utf8")).toBe(originalContent);
    expect(await readFile(manifestPath, "utf8")).toBe(manifestText);
  });

  it("rejects manifest entries that alias the same Markdown inode", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-inode-alias-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });
    await store.migrateSnapshot(catalogFixture());
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const bookDirectory = registry.projects.find(
      ({ id }) => id === "book-existing"
    )!.projectDirectory;
    const manifestPath = join(bookDirectory, "deepwrite.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      draft: {
        sections: Array<{
          id: string;
          body: { path: string };
          characterState: { path: string };
        }>;
      };
    };
    const firstSection = manifest.draft.sections.find(
      ({ id }) => id === "section-1"
    )!;
    await link(
      join(bookDirectory, firstSection.body.path),
      join(bookDirectory, "stages", "draft", "alias.state.md")
    );
    firstSection.characterState.path = "stages/draft/alias.state.md";
    await writeJson(manifestPath, manifest);

    await expect(
      store.openBookProject(bookDirectory, false)
    ).rejects.toThrow(/distinct files/u);
  });

  it("rejects non-canonical v2 draft file ids before a stale save can recreate them", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-draft-file-id-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });
    const created = await store.createShortBook(
      { title: "正文文件标识", genre: "其他" },
      join(root, "books")
    );
    const manifestPath = join(created.projectDirectory, "deepwrite.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      draft: {
        sections: Array<{ body: { id: string } }>;
      };
    };
    manifest.draft.sections[0]!.body.id = "custom-body";
    await writeJson(manifestPath, manifest);

    await expect(
      store.openBookProject(created.projectDirectory, false)
    ).rejects.toThrow(/canonical section id/u);
  });

  it("rejects a changed registered id before a v1 manifest can migrate", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-id-change-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });
    await store.migrateSnapshot(catalogFixture());
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const bookDirectory = registry.projects.find(
      ({ id }) => id === "book-existing"
    )!.projectDirectory;
    const manifestPath = join(bookDirectory, "deepwrite.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      revision: number;
      kind: "deepwrite.book";
      id: string;
      title: string;
      bookType: "short";
      genre: string;
      status: "editing" | "completed";
      linkedMaterialIdsByKind: unknown;
      linkedSkillIdsByKind: unknown;
      createdAt: string;
      updatedAt: string;
      draft: {
        sections: Array<{ id: string; body: { path: string } }>;
      };
    };
    const documentPath = join(
      bookDirectory,
      manifest.draft.sections.find(({ id }) => id === "section-1")!.body.path
    );
    const originalContent = await readFile(documentPath, "utf8");
    await rm(join(bookDirectory, "stages", "draft"), {
      recursive: true,
      force: true
    });
    const legacyDraftPath = join(bookDirectory, "stages", "draft.md");
    await writeFile(legacyDraftPath, originalContent, "utf8");
    const changedLegacyManifest = {
      schemaVersion: 1,
      revision: manifest.revision,
      kind: manifest.kind,
      id: "book-renamed-outside",
      title: manifest.title,
      bookType: manifest.bookType,
      genre: manifest.genre,
      status: manifest.status,
      linkedMaterialIdsByKind: manifest.linkedMaterialIdsByKind,
      linkedSkillIdsByKind: manifest.linkedSkillIdsByKind,
      documents: [
        {
          id: "draft",
          title: "正文编写",
          path: "stages/draft.md",
          createdAt: manifest.createdAt,
          updatedAt: manifest.updatedAt
        }
      ],
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt
    };
    await writeJson(manifestPath, changedLegacyManifest);
    const changedLegacyManifestText = await readFile(manifestPath, "utf8");

    await expect(
      store.saveDocument({
        bookId: "book-existing",
        documentId: catalogDraftBodyDocumentId("section-1"),
        content: "不应写入另一个 UUID 项目",
        force: true
      })
    ).rejects.toThrow(/标识与注册信息不一致/u);
    expect(await readFile(manifestPath, "utf8")).toBe(changedLegacyManifestText);
    expect(await readFile(legacyDraftPath, "utf8")).toBe(originalContent);
    await expect(
      access(join(bookDirectory, "stages", "draft"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("allocates portable-unique paths for case-colliding migrated entry ids", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-portable-paths-");
    const source = catalogFixture();
    source.materials[0]!.entries = [
      {
        id: "Entry",
        stageId: "character",
        title: "大写条目",
        body: "FIRST",
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: "entry",
        stageId: "character",
        title: "小写条目",
        body: "SECOND",
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });
    const migrated = await store.migrateSnapshot(source);
    expect(migrated.materials[0]?.entries.map(({ body }) => body)).toEqual([
      "FIRST",
      "SECOND"
    ]);
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const materialDirectory = registry.projects.find(
      ({ id }) => id === "material-existing"
    )!.projectDirectory;
    const manifest = JSON.parse(
      await readFile(join(materialDirectory, "deepwrite.json"), "utf8")
    ) as { entries: Array<{ path: string }> };
    expect(manifest.entries[0]!.path.toLowerCase()).not.toBe(
      manifest.entries[1]!.path.toLowerCase()
    );
  });

  it("does not overwrite untracked Markdown when allocating a new document path", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-untracked-path-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const created = await store.createShortBook(
      { title: "未跟踪文件测试", genre: "其他" },
      join(root, "books")
    );
    const untrackedPath = join(created.projectDirectory, "stages", "orphan.md");
    await writeFile(untrackedPath, "用户在 Cursor 中创建的未跟踪正文", "utf8");

    await store.saveDocument({
      bookId: created.resource.id,
      documentId: "ORPHAN",
      title: "新阶段",
      content: "DeepWrite 新阶段内容",
      baseProjectRevision: 0
    });
    expect(await readFile(untrackedPath, "utf8")).toBe(
      "用户在 Cursor 中创建的未跟踪正文"
    );
    const manifest = JSON.parse(
      await readFile(join(created.projectDirectory, "deepwrite.json"), "utf8")
    ) as { documents: Array<{ id: string; path: string }> };
    const added = manifest.documents.find(({ id }) => id === "ORPHAN")!;
    expect(added.path.toLowerCase()).not.toBe("stages/orphan.md");
    expect(
      await readFile(join(created.projectDirectory, added.path), "utf8")
    ).toBe("DeepWrite 新阶段内容");
  });

  it("restores a corrupt registry from its last known-good backup", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-registry-backup-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath });
    await store.migrateSnapshot(catalogFixture());
    await writeFile(store.registryPath, "{broken", "utf8");

    const restarted = new FolderCatalogStore({ userDataPath });
    const snapshot = await restarted.snapshot();
    expect(snapshot.books.map(({ id }) => id)).toEqual(["book-existing"]);
    expect(snapshot.materials.map(({ id }) => id)).toEqual([
      "material-existing"
    ]);
    expect(
      JSON.parse(await readFile(restarted.registryPath, "utf8"))
    ).toMatchObject({ schemaVersion: 1, sourceCatalogMigrated: true });
  });

  it("preserves an unrecoverable registry and lets open-existing rebuild the index", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-registry-rebuild-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath });
    await store.migrateSnapshot(catalogFixture());
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const bookDirectory = registry.projects.find(
      ({ id }) => id === "book-existing"
    )!.projectDirectory;
    await writeFile(store.registryPath, "{broken-primary", "utf8");
    await writeFile(store.registryBackupPath, "{broken-backup", "utf8");

    const restarted = new FolderCatalogStore({ userDataPath });
    const opened = await restarted.openBookProject(bookDirectory);
    expect(opened.resource.id).toBe("book-existing");
    expect((await restarted.snapshot()).books.map(({ id }) => id)).toEqual([
      "book-existing"
    ]);
    expect(
      (await readdir(userDataPath)).some((name) =>
        name.startsWith("catalog-registry.json.corrupt-")
      )
    ).toBe(true);
  });

  it("unregisters group projects without deleting their folders", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-group-unregister-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data")
    });
    await store.migrateSnapshot(catalogFixture());
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{
        id: string;
        domain: string;
        projectDirectory: string;
      }>;
    };
    const group = registry.projects.find(
      ({ id }) => id === "material-group-existing"
    )!;

    expect(
      await store.unregisterProject({
        domain: "material-group",
        projectId: group.id
      })
    ).toEqual({
      domain: "material-group",
      projectId: group.id,
      unregistered: true
    });
    await expect(access(group.projectDirectory)).resolves.toBeUndefined();
    expect((await store.snapshot()).materialGroups).toEqual([]);
  });

  it("persists large draft recovery files across restarts and can clear them", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-draft-recovery-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath });
    const recovery = {
      "book-large\u0000draft": {
        title: "大正文草稿",
        content: "字".repeat(2_100_000),
        dirty: true as const,
        baseRevision: "original-revision",
        baseProjectRevision: 7
      }
    };

    await store.saveDraftRecovery(recovery);
    expect((await stat(store.draftRecoveryPath)).size).toBeGreaterThan(
      5 * 1024 * 1024
    );
    expect(
      await new FolderCatalogStore({ userDataPath }).loadDraftRecovery()
    ).toEqual(recovery);

    await store.saveDraftRecovery({});
    expect(
      await new FolderCatalogStore({ userDataPath }).loadDraftRecovery()
    ).toEqual({});
    expect(await readFile(store.draftRecoveryPath, "utf8")).toBe("{}\n");
  });

  it("rejects oversized draft recovery writes without replacing the last good file", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-draft-limit-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({
      userDataPath,
      maxDraftRecoveryBytes: 512
    });
    const saved = {
      draft: {
        title: "可恢复草稿",
        content: "仍然保留",
        dirty: true as const
      }
    };
    await store.saveDraftRecovery(saved);

    await expect(
      store.saveDraftRecovery({
        oversized: {
          title: "过大草稿",
          content: "x".repeat(1_024),
          dirty: true
        }
      })
    ).rejects.toThrow(/512 byte limit/u);
    expect(await store.loadDraftRecovery()).toEqual(saved);
  });

  it("requires an explicit force flag to overwrite stale book content", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-force-save-");
    const store = new FolderCatalogStore({
      userDataPath: join(root, "user-data"),
      now: tickingClock()
    });
    const opened = await store.createShortBook(
      { title: "冲突测试", genre: "其他" },
      join(root, "projects")
    );
    const emptyRevision = createShortWorkspaceContentRevision("");
    const bodyDocumentId = catalogDraftBodyDocumentId("section-1");
    await store.saveDocument({
      bookId: opened.resource.id,
      documentId: bodyDocumentId,
      content: "磁盘上的新内容",
      baseRevision: emptyRevision,
      baseProjectRevision: 0
    });

    await expect(
      store.saveDocument({
        bookId: opened.resource.id,
        documentId: bodyDocumentId,
        content: "未明确覆盖的旧草稿",
        baseRevision: emptyRevision,
        baseProjectRevision: 0
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);
    expect(
      (await store.snapshot()).books[0]?.draft.sections.find(
        ({ id }) => id === "section-1"
      )?.body.content
    ).toBe("磁盘上的新内容");

    const forced = await store.saveDocument({
      bookId: opened.resource.id,
      documentId: bodyDocumentId,
      content: "用户明确覆盖后的内容",
      baseRevision: emptyRevision,
      baseProjectRevision: 0,
      force: true
    });
    expect(forced.content).toBe("用户明确覆盖后的内容");
    expect(
      JSON.parse(
        await readFile(join(opened.projectDirectory, "deepwrite.json"), "utf8")
      )
    ).toMatchObject({ revision: 2 });
  });

  it("opens a hand-authored external book, follows disk edits across restarts, and rejects stale writes", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-external-");
    const userDataPath = join(root, "user-data");
    const projectDirectory = join(root, "外部项目", "潮汐来信");
    const manifestPath = join(projectDirectory, "deepwrite.json");
    const draftPath = join(projectDirectory, "stages", "draft.md");
    const externalManifest = {
      schemaVersion: 1,
      revision: 4,
      kind: "deepwrite.book",
      id: "book-external",
      title: "潮汐来信",
      bookType: "short",
      genre: "科幻",
      status: "editing",
      linkedMaterialIdsByKind: {
        character: [],
        gimmick: [],
        plot: [],
        draft: [],
        other: []
      },
      linkedSkillIdsByKind: {
        general: [],
        plot: [],
        style: [],
        other: []
      },
      documents: [
        {
          id: "notes",
          title: "正文编写",
          path: "stages/notes.md",
          createdAt: timestamp,
          updatedAt: timestamp
        },
        {
          id: "draft",
          title: "正文编写",
          path: "stages/draft.md",
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await writeJson(manifestPath, externalManifest);
    await mkdir(dirname(draftPath), { recursive: true });
    await writeFile(
      join(projectDirectory, "stages", "notes.md"),
      "同名普通文档",
      "utf8"
    );
    await writeFile(draftPath, "最初由 Cursor 写下的正文", "utf8");

    const store = new FolderCatalogStore({
      userDataPath,
      now: tickingClock()
    });
    const opened = await store.openBookProject(projectDirectory);
    expect(opened).toMatchObject({
      domain: "book",
      projectDirectory: await realpath(projectDirectory),
      revision: 4,
      resource: {
        id: "book-external",
        title: "潮汐来信",
        projectRevision: 4,
        draft: { id: "draft", title: "正文" }
      }
    });
    expect(
      opened.resource.documents.find(({ id }) => id === "notes")
    ).toMatchObject({ id: "notes", content: "同名普通文档" });
    expect(opened.resource.plotStages).toHaveLength(6);
    const openedSection = opened.resource.draft.sections.find(
      ({ id }) => id === "section-1"
    );
    expect(openedSection).toMatchObject({
      body: {
        id: catalogDraftBodyDocumentId("section-1"),
        content: "最初由 Cursor 写下的正文"
      },
      characterState: {
        id: catalogDraftCharacterStateDocumentId("section-1"),
        content: ""
      }
    });
    const migratedManifest = JSON.parse(
      await readFile(manifestPath, "utf8")
    ) as {
      schemaVersion: number;
      revision: number;
      title: string;
      draft: {
        sections: Array<{
          id: string;
          body: { path: string };
          characterState: { path: string };
        }>;
      };
    };
    expect(migratedManifest).toMatchObject({ schemaVersion: 4, revision: 4 });
    const migratedSection = migratedManifest.draft.sections.find(
      ({ id }) => id === "section-1"
    )!;
    const migratedBodyPath = join(projectDirectory, migratedSection.body.path);
    await expect(readFile(draftPath, "utf8")).resolves.toBe(
      "最初由 Cursor 写下的正文"
    );
    await expect(readFile(migratedBodyPath, "utf8")).resolves.toBe(
      "最初由 Cursor 写下的正文"
    );
    await expect(
      readFile(join(projectDirectory, migratedSection.characterState.path), "utf8")
    ).resolves.toBe("");

    const restartedStore = new FolderCatalogStore({
      userDataPath,
      now: tickingClock()
    });
    expect((await restartedStore.snapshot()).books[0]).toMatchObject({
      id: "book-external",
      title: "潮汐来信"
    });

    const originalContentRevision = createShortWorkspaceContentRevision(
      "最初由 Cursor 写下的正文"
    );
    await writeFile(migratedBodyPath, "Cursor 在应用外更新的正文", "utf8");
    expect(
      (await restartedStore.snapshot()).books[0]?.draft.sections.find(
        ({ id }) => id === "section-1"
      )?.body.content
    ).toBe("Cursor 在应用外更新的正文");
    await expect(
      restartedStore.saveDocument({
        bookId: "book-external",
        documentId: catalogDraftBodyDocumentId("section-1"),
        content: "应用内仍未保存的旧草稿",
        baseRevision: originalContentRevision,
        baseProjectRevision: 4
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);
    expect(await readFile(migratedBodyPath, "utf8")).toBe(
      "Cursor 在应用外更新的正文"
    );
    expect(
      (JSON.parse(await readFile(manifestPath, "utf8")) as { revision: number })
        .revision
    ).toBe(4);

    await writeJson(manifestPath, {
      ...migratedManifest,
      revision: 5,
      title: "潮汐来信（外部改名）",
      updatedAt: "2026-07-19T02:03:04.000Z"
    });
    expect((await restartedStore.snapshot()).books[0]?.title).toBe(
      "潮汐来信（外部改名）"
    );
    await expect(
      restartedStore.updateBook({
        bookId: "book-external",
        title: "应用内旧标题",
        baseProjectRevision: 4
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);
    expect(
      (JSON.parse(await readFile(manifestPath, "utf8")) as { title: string }).title
    ).toBe("潮汐来信（外部改名）");
    await expect(
      restartedStore.saveDocument({
        bookId: "book-external",
        documentId: catalogDraftBodyDocumentId("section-1"),
        title: "应用内旧文档标题",
        content: "不会覆盖的内容",
        baseRevision: createShortWorkspaceContentRevision(
          "Cursor 在应用外更新的正文"
        ),
        baseProjectRevision: 4
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);
    expect(await readFile(migratedBodyPath, "utf8")).toBe(
      "Cursor 在应用外更新的正文"
    );
  });

  it("rejects escaping paths, symbolic-link content, invalid UTF-8, and oversized files", async () => {
    const root = await makeTemporaryRoot("deepwrite-folder-security-");
    const userDataPath = join(root, "user-data");
    const store = new FolderCatalogStore({ userDataPath });
    await store.migrateSnapshot(catalogFixture());
    const registry = JSON.parse(await readFile(store.registryPath, "utf8")) as {
      projects: Array<{ id: string; projectDirectory: string }>;
    };
    const projectDirectory = registry.projects.find(
      ({ id }) => id === "book-existing"
    )!.projectDirectory;
    const manifestPath = join(projectDirectory, "deepwrite.json");
    const original = JSON.parse(await readFile(manifestPath, "utf8")) as {
      draft: {
        sections: Array<{ id: string; body: { path: string } }>;
      };
    };
    const body = original.draft.sections.find(({ id }) => id === "section-1")!.body;
    const originalBodyPath = body.path;
    const absoluteBodyPath = join(projectDirectory, originalBodyPath);

    body.path = "../outside.md";
    await writeJson(manifestPath, original);
    await expect(store.openBookProject(projectDirectory, false)).rejects.toThrow(
      /relative Markdown paths/u
    );

    body.path = originalBodyPath;
    await writeJson(manifestPath, original);
    await rm(absoluteBodyPath);
    const outside = join(root, "outside.md");
    await writeFile(outside, "outside", "utf8");
    await symlink(outside, absoluteBodyPath);
    await expect(store.openBookProject(projectDirectory, false)).rejects.toThrow(
      /symbolic links/u
    );

    await rm(absoluteBodyPath);
    await writeFile(absoluteBodyPath, Buffer.from([0xc3, 0x28]));
    await expect(store.openBookProject(projectDirectory, false)).rejects.toThrow(
      /valid UTF-8/u
    );

    await writeFile(absoluteBodyPath, "x".repeat(17));
    const limitedStore = new FolderCatalogStore({
      userDataPath,
      maxMarkdownBytes: 16
    });
    await expect(limitedStore.openBookProject(projectDirectory, false)).rejects.toThrow(
      /16 byte limit/u
    );
  });

  it("renames libraries and persistently reorders or moves library entries", async () => {
    const root = await makeTemporaryRoot("deepwrite-library-move-");
    const store = new FolderCatalogStore({ userDataPath: join(root, "user-data"), now: tickingClock() });
    const source = await store.createLibrary({ domain: "material", name: "人物素材", materialKind: "character" });
    const target = await store.createLibrary({ domain: "material", name: "剧情素材", materialKind: "plot" });
    const moving = await store.createLibraryEntry({
      domain: "material", libraryId: source.resource.id, title: "主角", content: "主角设定", stageId: "character"
    });
    const existing = await store.createLibraryEntry({
      domain: "material", libraryId: target.resource.id, title: "已有剧情", content: "已有内容", stageId: "pacing"
    });

    await expect(store.moveLibraryEntry({
      domain: "material", sourceLibraryId: source.resource.id, targetLibraryId: target.resource.id,
      entryId: moving.id, beforeEntryId: existing.id,
      sourceBaseProjectRevision: 0, targetBaseProjectRevision: 1, targetStageId: "plot_refine"
    })).rejects.toBeInstanceOf(FolderCatalogConflictError);

    await store.moveLibraryEntry({
      domain: "material", sourceLibraryId: source.resource.id, targetLibraryId: target.resource.id,
      entryId: moving.id, beforeEntryId: existing.id,
      sourceBaseProjectRevision: 1, targetBaseProjectRevision: 1, targetStageId: "plot_refine"
    });
    let snapshot = await store.snapshot();
    expect(snapshot.materials.find(({ id }) => id === source.resource.id)?.entries).toEqual([]);
    expect(snapshot.materials.find(({ id }) => id === target.resource.id)?.entries.map(({ id }) => id)).toEqual([moving.id, existing.id]);
    expect(snapshot.materials.find(({ id }) => id === target.resource.id)?.entries[0]).toMatchObject({ stageId: "plot_refine", body: "主角设定" });

    await store.moveLibraryEntry({
      domain: "material", sourceLibraryId: target.resource.id, targetLibraryId: target.resource.id,
      entryId: existing.id, beforeEntryId: moving.id, sourceBaseProjectRevision: 2
    });
    await store.updateLibrary({
      domain: "material",
      libraryId: target.resource.id,
      title: "剧情灵感",
      overview: "用于沉淀剧情灵感。",
      baseProjectRevision: 3
    });
    await store.updateLibrary({
      domain: "material",
      libraryId: target.resource.id,
      overview: "用于沉淀可复用的剧情灵感。",
      baseProjectRevision: 4
    });
    snapshot = await store.snapshot();
    const renamed = snapshot.materials.find(({ id }) => id === target.resource.id)!;
    expect(renamed.title).toBe("剧情灵感");
    expect(renamed.overview).toBe("用于沉淀可复用的剧情灵感。");
    expect(renamed.projectRevision).toBe(5);
    expect(renamed.entries.map(({ id }) => id)).toEqual([existing.id, moving.id]);
    expect(renamed.entries[1]).toMatchObject({ body: "主角设定", stageId: "plot_refine" });

    await expect(
      store.updateLibrary({
        domain: "material",
        libraryId: target.resource.id,
        overview: "过期版本不应覆盖",
        baseProjectRevision: 4
      })
    ).rejects.toBeInstanceOf(FolderCatalogConflictError);
    const forced = await store.updateLibrary({
      domain: "material",
      libraryId: target.resource.id,
      overview: "确认强制覆盖后的介绍",
      baseProjectRevision: 4,
      force: true
    });
    expect(forced).toMatchObject({
      title: "剧情灵感",
      overview: "确认强制覆盖后的介绍",
      projectRevision: 6
    });
  });
});
