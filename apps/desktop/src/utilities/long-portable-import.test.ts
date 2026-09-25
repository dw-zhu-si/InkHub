import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LONG_WORKSPACE_INDEX_FILE_ID,
  LONG_WORKSPACE_INDEX_PATH,
  LongLedgerCommitRecordSchema,
  LongProjectManifestSchema,
  LongWorkspaceIndexSnapshotSchema,
  longLedgerCommitFileId,
  longWorldbuildingItemFileId,
  serializeLongWorldbuildingMarkdownList
} from "@deepwrite/contracts";
import {
  LONG_PORTABLE_BUNDLE_SCHEMA,
  LONG_PORTABLE_BUNDLE_SCHEMA_VERSION,
  parseLongPortableExportBundle,
  type LongPortableExportBundle
} from "./long-portable-bundle";
import { parseWriteClawLongSourceBytes } from "./write-claw-long-archive";
import { createWriteClawLongImportPlan } from "./write-claw-long-import";

const FIXED_NOW = "2026-07-26T12:00:00.000Z";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function revision(content: string): string {
  return `v2:${Buffer.byteLength(content, "utf8")}:${sha256(content)}`;
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function basePlan() {
  const workspace = {
    schema_version: 5,
    worldbuilding: {
      categories: [
        {
          id: "rules",
          name: "规则",
          format: "text",
          overview: "",
          items: [],
          text: "规则正文"
        }
      ]
    },
    characters: {
      protagonists: { entries: [] },
      major_supporting: { entries: [] },
      minor_supporting: { entries: [] },
      passersby: { entries: [] }
    },
    plot: {
      book_line: "主线",
      volumes: [{ id: "v1", name: "第一卷", outline: "", order: 1 }],
      arcs: [
        {
          id: "a1",
          volume_id: "v1",
          name: "第一弧",
          outline: "",
          order: 1
        }
      ],
      chapter_cards: [
        {
          id: "c1",
          volume_id: "v1",
          arc_id: "a1",
          stage_id: "draft.volume-1.arc-1.chapter-1",
          title: "第一章",
          outline: "",
          world_constraints: "",
          characters: [],
          narrative_order: 1
        }
      ],
      story_events: [],
      event_links: [],
      narrative_placements: [],
      foreshadowing: []
    },
    chapters: {
      "draft.volume-1.arc-1.chapter-1": {
        title: "第一章",
        body: "正文",
        character_state: "状态",
        handoff: "交接",
        committed: false
      }
    },
    ledger: {
      committed_through: "",
      timeline: [],
      character_states: [],
      faction_states: [],
      realm_states: [],
      foreshadowing_states: [],
      continuity_notes: [],
      chapter_changes: []
    }
  };
  const source = parseWriteClawLongSourceBytes(
    Buffer.from(JSON.stringify(workspace), "utf8"),
    "long_workspace.json"
  );
  return createWriteClawLongImportPlan(source, {
    importedAt: FIXED_NOW,
    title: "可移植导入测试",
    sourceIdentity: "portable-import-test"
  });
}

function portableImportFixture(): LongPortableExportBundle {
  const plan = basePlan();
  const commitId = "commit_bundle";
  const chapterId = plan.index.plot.chapterCards[0]!.id;
  const record = LongLedgerCommitRecordSchema.parse({
    schemaVersion: 1,
    id: commitId,
    bookId: plan.index.bookId,
    sequence: 1,
    chapterCardId: chapterId,
    committedAt: FIXED_NOW,
    reversible: true,
    sourceWorkspaceRevision: 0,
    committedWorkspaceRevision: 1,
    sourceProjectRevision: 0,
    committedProjectRevision: 1,
    previousCommittedThroughChapterId: null,
    committedThroughChapterId: chapterId,
    previousChapterCommitId: null,
    placementChanges: [],
    foreshadowingBeatChanges: [],
    fileChanges: []
  });
  const recordContent = serializeJson(record);
  const recordPath = `long/ledger/${sha256(commitId).slice(0, 32)}.json`;
  const index = LongWorkspaceIndexSnapshotSchema.parse({
    ...plan.index,
    revision: 1,
    chapters: plan.index.chapters.map((chapter) => ({
      ...chapter,
      commitId
    })),
    ledger: {
      committedThroughChapterId: chapterId,
      commits: [
        {
          id: commitId,
          sequence: 1,
          chapterCardId: chapterId,
          committedAt: FIXED_NOW,
          reversible: true,
          sourceRevision: 0,
          placementIds: [],
          foreshadowingBeatIds: [],
          recordFile: {
            id: longLedgerCommitFileId(commitId),
            path: recordPath,
            revision: revision(recordContent),
            updatedAt: FIXED_NOW
          }
        }
      ]
    }
  });
  const manifest = LongProjectManifestSchema.parse({
    ...plan.manifest,
    revision: 1,
    workspaceIndexFile: {
      id: LONG_WORKSPACE_INDEX_FILE_ID,
      path: LONG_WORKSPACE_INDEX_PATH,
      revision: revision(serializeJson(index)),
      updatedAt: FIXED_NOW
    }
  });
  const files = [
    ...plan.documents.map((document) => ({
      id: document.fileId,
      path: document.path,
      kind: "markdown" as const,
      revision: document.revision,
      sha256: sha256(document.content),
      content: document.content
    })),
    {
      id: longLedgerCommitFileId(commitId),
      path: recordPath,
      kind: "ledger-record" as const,
      revision: revision(recordContent),
      sha256: sha256(recordContent),
      content: recordContent
    }
  ];
  return {
    schema: LONG_PORTABLE_BUNDLE_SCHEMA,
    schemaVersion: LONG_PORTABLE_BUNDLE_SCHEMA_VERSION,
    exportedAt: FIXED_NOW,
    bookId: manifest.id,
    manifest: {
      mediaType: "application/json",
      sha256: sha256(serializeJson(manifest)),
      value: manifest
    },
    index: {
      mediaType: "application/json",
      sha256: sha256(serializeJson(index)),
      value: index
    },
    files
  };
}

function rehashLedgerMutation(
  bundle: LongPortableExportBundle,
  mutate: (record: Record<string, unknown>) => void
): void {
  const ledgerFile = bundle.files.find(
    ({ kind }) => kind === "ledger-record"
  )!;
  const record = JSON.parse(ledgerFile.content) as Record<string, unknown>;
  mutate(record);
  ledgerFile.content = serializeJson(record);
  ledgerFile.revision = revision(ledgerFile.content);
  ledgerFile.sha256 = sha256(ledgerFile.content);
  bundle.index.value.ledger.commits[0]!.recordFile.revision =
    ledgerFile.revision as never;
  const indexText = serializeJson(bundle.index.value);
  bundle.index.sha256 = sha256(indexText);
  bundle.manifest.value.workspaceIndexFile.revision =
    revision(indexText) as never;
  bundle.manifest.sha256 = sha256(serializeJson(bundle.manifest.value));
}

function portableTextFileCommitFixture(): LongPortableExportBundle {
  const bundle = portableImportFixture();
  const chapter = bundle.index.value.chapters[0]!;
  bundle.index.value.ledger.commits[0]!.mode = "text_files";
  rehashLedgerMutation(bundle, (record) => {
    record.schemaVersion = 4;
    record.commitMessage = "留存第一章连续性文本";
    record.continuityFiles = [
      chapter.characterState,
      chapter.handoff,
      chapter.foreshadowingChanges
    ].map(({ id, path, revision: fileRevision }) => ({
      fileId: id,
      path,
      revision: fileRevision
    }));
  });
  return bundle;
}

describe("long portable import parser", () => {
  it("accepts a complete bundle with a cross-validated ledger record", () => {
    const parsed = parseLongPortableExportBundle(portableImportFixture());

    expect(parsed.index.value.ledger.commits).toHaveLength(1);
    expect(parsed.files.some(({ kind }) => kind === "ledger-record")).toBe(
      true
    );
  });

  it("accepts a lightweight v4 text-file commit and rejects an audited revision mismatch", () => {
    const parsed = parseLongPortableExportBundle(
      portableTextFileCommitFixture()
    );
    expect(parsed.index.value.ledger.commits[0]).toMatchObject({
      mode: "text_files",
      chapterCardId: parsed.index.value.chapters[0]!.chapterCardId
    });
    const parsedRecord = JSON.parse(
      parsed.files.find(({ kind }) => kind === "ledger-record")!.content
    ) as { schemaVersion: number; fileChanges: unknown[] };
    expect(parsedRecord).toMatchObject({
      schemaVersion: 4,
      fileChanges: []
    });

    const mismatched = portableTextFileCommitFixture();
    rehashLedgerMutation(mismatched, (record) => {
      const continuityFiles = record.continuityFiles as Array<
        Record<string, unknown>
      >;
      continuityFiles[0]!.revision = revision("不匹配的连续性文件");
    });
    expect(() => parseLongPortableExportBundle(mismatched)).toThrow(
      /v4 连续性账本的文件清单与章节索引不一致/u
    );
  });

  it("accepts a v4 commit without a foreshadowing file audit when the chapter has no touchpoints", () => {
    const bundle = portableTextFileCommitFixture();
    const foreshadowingFileId =
      bundle.index.value.chapters[0]!.foreshadowingChanges.id;
    rehashLedgerMutation(bundle, (record) => {
      record.continuityFiles = (
        record.continuityFiles as Array<Record<string, unknown>>
      ).filter(({ fileId }) => fileId !== foreshadowingFileId);
    });

    const parsed = parseLongPortableExportBundle(bundle);
    const record = JSON.parse(
      parsed.files.find(({ kind }) => kind === "ledger-record")!.content
    ) as { continuityFiles: Array<{ fileId: string }> };
    expect(record.continuityFiles.map(({ fileId }) => fileId)).toEqual([
      parsed.index.value.chapters[0]!.characterState.id,
      parsed.index.value.chapters[0]!.handoff.id
    ]);
  });

  it("hydrates an older portable index that predates the continuity projection", () => {
    const legacy = structuredClone(portableImportFixture());
    const legacyLedger = legacy.index.value.ledger as unknown as Record<
      string,
      unknown
    >;
    delete legacyLedger.projection;
    const legacyIndexContent = serializeJson(legacy.index.value);
    legacy.index.sha256 = sha256(legacyIndexContent);
    legacy.manifest.value.workspaceIndexFile.revision =
      revision(legacyIndexContent) as never;
    legacy.manifest.sha256 = sha256(
      serializeJson(legacy.manifest.value)
    );

    const parsed = parseLongPortableExportBundle(legacy);

    expect(parsed.index.value.ledger.projection).toEqual({
      throughCommitId: null,
      facts: [],
      knowledge: [],
      openLoops: [],
      latestHandoff: null
    });
    expect(parsed.manifest.value.workspaceIndexFile.revision).toBe(
      revision(serializeJson(parsed.index.value))
    );
  });

  it("migrates an older aggregate worldbuilding list into item files", () => {
    const legacy = structuredClone(portableImportFixture());
    const category = legacy.index.value.worldbuilding[0] as unknown as Record<
      string,
      unknown
    >;
    const categoryFile = category.file as Record<string, unknown>;
    const aggregateContent = serializeLongWorldbuildingMarkdownList([
      {
        id: "worlditem_legacy_rule",
        title: "潮汐规则",
        content: "逆潮每十年出现一次。"
      }
    ]);
    const aggregateRevision = revision(aggregateContent);
    const aggregateFile = legacy.files.find(
      ({ id }) => id === categoryFile.id
    )!;
    aggregateFile.content = aggregateContent;
    aggregateFile.revision = aggregateRevision;
    aggregateFile.sha256 = sha256(aggregateContent);
    category.format = "list";
    category.contentAuthority = "markdown";
    categoryFile.revision = aggregateRevision;

    const legacyIndexContent = serializeJson(legacy.index.value);
    legacy.index.sha256 = sha256(legacyIndexContent);
    legacy.manifest.value.workspaceIndexFile.revision =
      revision(legacyIndexContent) as never;
    legacy.manifest.sha256 = sha256(
      serializeJson(legacy.manifest.value)
    );

    const parsed = parseLongPortableExportBundle(legacy);
    const migrated = parsed.index.value.worldbuilding[0]!;

    expect(migrated).toMatchObject({
      format: "list",
      contentAuthority: "files",
      items: [
        {
          id: "worlditem_legacy_rule",
          title: "潮汐规则",
          order: 1
        }
      ]
    });
    expect(
      parsed.files.find(
        ({ id }) =>
          id === longWorldbuildingItemFileId("worlditem_legacy_rule")
      )
    ).toMatchObject({
      content: "逆潮每十年出现一次。"
    });
    expect(parsed.files).not.toContainEqual(
      expect.objectContaining({ id: categoryFile.id })
    );
  });

  it("rejects tampered content and manifest hashes", () => {
    const tamperedContent = structuredClone(portableImportFixture());
    tamperedContent.files[0]!.content += "篡改";
    expect(() => parseLongPortableExportBundle(tamperedContent)).toThrow(
      /完整性/u
    );

    const tamperedManifest = structuredClone(portableImportFixture());
    tamperedManifest.manifest.sha256 = "0".repeat(64);
    expect(() => parseLongPortableExportBundle(tamperedManifest)).toThrow(
      /SHA-256/u
    );
  });

  it("rejects missing, duplicate and case-equivalent file paths", () => {
    const incomplete = structuredClone(portableImportFixture());
    incomplete.files.pop();
    expect(() => parseLongPortableExportBundle(incomplete)).toThrow(/完整/u);

    const duplicate = structuredClone(portableImportFixture());
    duplicate.files[1] = { ...duplicate.files[0]! };
    expect(() => parseLongPortableExportBundle(duplicate)).toThrow(/重复/u);

    const pathCollision = structuredClone(portableImportFixture());
    pathCollision.files[1]!.path =
      pathCollision.files[0]!.path.toLocaleUpperCase("en-US");
    expect(() => parseLongPortableExportBundle(pathCollision)).toThrow(
      /重复/u
    );
  });

  it("rejects a fully rehashed record that no longer matches its index", () => {
    const tampered = structuredClone(portableImportFixture());
    rehashLedgerMutation(tampered, (record) => {
      record.sourceWorkspaceRevision = 5;
      record.committedWorkspaceRevision = 6;
      record.sourceProjectRevision = 5;
      record.committedProjectRevision = 6;
    });

    expect(() => parseLongPortableExportBundle(tampered)).toThrow(
      /账本记录.*索引不一致/u
    );
  });

  it("rejects a rehashed v3 record whose fact subject is not in the workspace", () => {
    const orphanedFact = structuredClone(portableImportFixture());
    rehashLedgerMutation(orphanedFact, (record) => {
      record.schemaVersion = 3;
      record.commitMessage = "伪造 v3 记录";
      record.chapterSummary = {
        timeline: "时间线无变化。",
        characterStates: "人物状态无变化。",
        factionStates: "阵营状态无变化。",
        realmStates: "境界状态无变化。",
        foreshadowingStates: "伏笔状态无变化。",
        continuityNotes: "伪造世界事实。"
      };
      record.coverage = {
        character: { status: "unchanged", note: "无人物变化。" },
        plot: { status: "unchanged", note: "无剧情变化。" },
        foreshadowing: { status: "unchanged", note: "无伏笔变化。" },
        world: { status: "changed", note: "伪造世界事实。" },
        knowledge: { status: "unchanged", note: "无认知变化。" },
        openLoops: { status: "unchanged", note: "无未闭合事项。" }
      };
      record.chapterOutputs = {
        characterState: "章末状态",
        handoff: {
          summary: "继续下一章。",
          mustCarry: [],
          nextChapterConstraints: [],
          openLoops: []
        }
      };
      record.factChanges = [
        {
          before: null,
          after: {
            factId: "fact_orphan-world",
            domain: "world",
            subjectId: "world_missing",
            field: "rule",
            value: "不存在的世界事实",
            sourceCommitId: record.id,
            sourceChapterCardId: record.chapterCardId,
            evidence: "伪造证据。"
          }
        }
      ];
      record.knowledgeChanges = [];
      record.openLoopChanges = [];
    });

    expect(() => parseLongPortableExportBundle(orphanedFact)).toThrow(
      /孤立 subjectId/u
    );
  });

  it("rejects rehashed project-revision and previous-commit forgeries", () => {
    const splitRevision = structuredClone(portableImportFixture());
    rehashLedgerMutation(splitRevision, (record) => {
      record.sourceProjectRevision = 5;
      record.committedProjectRevision = 6;
    });
    expect(() => parseLongPortableExportBundle(splitRevision)).toThrow(
      /revision/u
    );

    const inventedPreviousCommit = structuredClone(portableImportFixture());
    rehashLedgerMutation(inventedPreviousCommit, (record) => {
      record.previousChapterCommitId = "commit_forged";
    });
    expect(() =>
      parseLongPortableExportBundle(inventedPreviousCommit)
    ).toThrow(/回滚前态/u);
  });
});
