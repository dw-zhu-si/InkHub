import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  LongProjectManifestSchema,
  LongWorkspaceIndexSnapshotSchema
} from "@deepwrite/contracts";
import {
  parseWriteClawLongSourceBytes
} from "./write-claw-long-archive";
import {
  createWriteClawLongImportPlan
} from "./write-claw-long-import";

const FIXED_NOW = "2026-07-26T12:00:00.000Z";

let crcTable: Uint32Array | undefined;

function crc32(content: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value =
          (value & 1) !== 0
            ? 0xedb88320 ^ (value >>> 1)
            : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let value = 0xffffffff;
  for (const byte of content) {
    value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

interface ZipFixtureEntry {
  name: string;
  content: string;
  method?: 0 | 8;
  declaredUncompressedSize?: number;
}

function zipFixture(entries: ZipFixtureEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const method = entry.method ?? 8;
    const compressed = method === 0 ? content : deflateRawSync(content);
    const declaredSize = entry.declaredUncompressedSize ?? content.byteLength;
    const checksum = crc32(content);
    const local = Buffer.alloc(30 + name.byteLength);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.byteLength, 18);
    local.writeUInt32LE(declaredSize, 22);
    local.writeUInt16LE(name.byteLength, 26);
    name.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + name.byteLength);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.byteLength, 20);
    central.writeUInt32LE(declaredSize, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centrals.push(central);
    localOffset += local.byteLength + compressed.byteLength;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function legacyWorkspace() {
  return {
    schema_version: 5,
    revision: 17,
    worldbuilding: {
      categories: [
        {
          id: "rules/unsafe old id",
          name: "规则",
          format: "list",
          overview: "世界由潮汐驱动。",
          items: [
            {
              id: "tide:item",
              name: "逆潮",
              description: "每十年一次",
              detail: "逆潮会让记忆倒流。"
            }
          ],
          text: ""
        }
      ]
    },
    characters: {
      protagonists: {
        entries: [
          {
            id: "../hero",
            name: "林舟",
            core_profile: "潮汐学者",
            relationships: "与沈星是盟友",
            current_state: "失忆",
            history: "曾穿越逆潮"
          }
        ]
      },
      major_supporting: { entries: [] },
      minor_supporting: { entries: [] },
      passersby: { entries: [] }
    },
    plot: {
      book_line: "林舟找回被逆潮抹去的历史。",
      volumes: [
        {
          id: "volume old",
          name: "潮起",
          outline: "发现异常",
          order: 9
        }
      ],
      arcs: [
        {
          id: "arc old",
          volume_id: "volume old",
          name: "失忆弧",
          outline: "寻找线索",
          order: 4
        }
      ],
      chapter_cards: [
        {
          id: "chapter old",
          volume_id: "volume old",
          arc_id: "arc old",
          stage_id: "draft.volume-1.arc-1.chapter-1",
          title: "潮声",
          outline: "林舟醒来",
          world_constraints: "不能直接恢复记忆",
          characters: ["../hero"],
          narrative_order: 20
        }
      ],
      story_events: [
        {
          id: "event-a",
          title: "逆潮发生",
          summary: "全城失忆",
          time_mode: "exact",
          time_label: "十年前",
          time_value: "子夜",
          story_order: 8,
          arc_ids: ["arc old"],
          character_ids: ["../hero"],
          location: "潮城"
        },
        {
          id: "event-b",
          title: "林舟醒来",
          summary: "故事开始",
          time_mode: "sequence",
          time_label: "现在",
          story_order: 9,
          arc_ids: ["arc old"],
          character_ids: ["../hero"],
          location: "海岸"
        }
      ],
      event_links: [
        {
          id: "link old",
          source_event_id: "event-a",
          target_event_id: "event-b",
          type: "before",
          note: "前因"
        }
      ],
      narrative_placements: [
        {
          id: "placement old",
          event_id: "event-a",
          chapter_card_id: "chapter old",
          order: 4,
          mode: "flashback",
          disclosure: "partial",
          note: "通过梦境展示",
          execution_status: "committed"
        }
      ],
      foreshadowing: [
        {
          id: "foreshadow old",
          name: "倒流的钟",
          status: "progressing",
          question: "钟为何倒走？",
          truth_event_id: "event-a",
          intended_effect: "制造时间错觉",
          beats: [
            {
              id: "beat old",
              kind: "plant",
              event_id: "event-a",
              placement_id: "placement old",
              chapter_card_id: "chapter old",
              target_scope: "第一卷",
              intended_knowledge: "读者只知道钟异常",
              status: "committed",
              order: 6
            }
          ]
        }
      ]
    },
    chapters: {
      "draft.volume-1.arc-1.chapter-1": {
        title: "潮声",
        body: "林舟在潮声中醒来。",
        character_state: "林舟不知道自己的过去。",
        handoff: "下一章检查旧钟。",
        committed: true,
        committed_at: "2025-01-01T00:00:00Z",
        commit_id: "old-commit"
      }
    },
    ledger: {
      committed_through: "draft.volume-1.arc-1.chapter-1",
      timeline: [
        {
          id: "timeline-old",
          chapter_stage_id: "draft.volume-1.arc-1.chapter-1",
          chapter_card_id: "chapter old",
          content: "林舟于海岸醒来。",
          commit_id: "old-commit"
        }
      ],
      character_states: [],
      faction_states: [],
      realm_states: [],
      foreshadowing_states: [],
      continuity_notes: [],
      chapter_changes: []
    }
  };
}

function legacyBook(workspace = legacyWorkspace()) {
  return {
    id: "book/../../unsafe",
    title: "逆潮",
    book_type: "long",
    categories: ["科幻"],
    status: "editing",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-02-01T00:00:00Z",
    long_workspace: workspace
  };
}

describe("Write Claw long-form import", () => {
  it.each([0, 8] as const)(
    "reads store/deflate zip and maps the complete v5 workspace (method %s)",
    (method) => {
      const workspace = legacyWorkspace();
      const book = legacyBook(workspace);
      const archive = zipFixture([
        {
          name: "book.json",
          content: JSON.stringify(book),
          method
        },
        {
          name: "long_workspace.json",
          content: JSON.stringify(workspace),
          method
        },
        {
          name: "metadata.json",
          content: JSON.stringify({
            library_type: "book",
            data: book
          }),
          method
        }
      ]);

      const source = parseWriteClawLongSourceBytes(archive, "逆潮.zip");
      const plan = createWriteClawLongImportPlan(source, {
        importedAt: FIXED_NOW
      });

      expect(LongProjectManifestSchema.parse(plan.manifest).title).toBe("逆潮");
      expect(LongWorkspaceIndexSnapshotSchema.parse(plan.index).bookId).toBe(
        plan.manifest.id
      );
      expect(plan.manifest.id).toMatch(/^longbook_legacy-[0-9a-f]{24}$/u);
      expect(plan.index.worldbuilding[0]).toMatchObject({
        title: "规则",
        format: "list"
      });
      expect(plan.index.worldbuilding).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "全书状态账本（旧版迁移证据）",
            format: "text"
          })
        ])
      );
      expect(plan.index.characters).toHaveLength(1);
      expect(plan.index.plot).toMatchObject({
        volumes: [expect.objectContaining({ order: 1, title: "潮起" })],
        arcs: [expect.objectContaining({ order: 1, title: "失忆弧" })],
        chapterCards: [
          expect.objectContaining({
            narrativeOrder: 1,
            title: "潮声"
          })
        ],
        storyEvents: [
          expect.objectContaining({
            storyOrder: 1,
            title: "逆潮发生",
            timeLabel: "十年前",
            timeValue: "子夜"
          }),
          expect.objectContaining({ storyOrder: 2, title: "林舟醒来" })
        ],
        eventConnections: [
          expect.objectContaining({ type: "before", note: "前因" })
        ],
        narrativePlacements: [
          expect.objectContaining({
            orderInChapter: 1,
            status: "committed",
            commitId: expect.stringMatching(/^commit_/u)
          })
        ]
      });
      expect(plan.index.plot.foreshadowing[0]).toMatchObject({
        title: "倒流的钟",
        status: "open",
        beats: [
          expect.objectContaining({
            order: 1,
            status: "committed",
            commitId: expect.stringMatching(/^commit_/u)
          })
        ]
      });
      expect(plan.index.ledger.commits).toHaveLength(1);
      expect(plan.index.ledger).toMatchObject({
        committedThroughChapterId: plan.index.plot.chapterCards[0]!.id,
        commits: [
          expect.objectContaining({
            chapterCardId: plan.index.plot.chapterCards[0]!.id,
            reversible: false
          })
        ]
      });
      expect(plan.index.chapters[0]?.commitId).toBe(
        plan.index.ledger.commits[0]!.id
      );
      expect(
        plan.idMap.chapterStage?.["draft.volume-1.arc-1.chapter-1"]
      ).toBe(plan.index.plot.chapterCards[0]!.id);
      expect(plan.documents.length).toBeGreaterThanOrEqual(1 + 1 + 4 + 3);
      const worldCategory = plan.index.worldbuilding[0]!;
      if (worldCategory.format !== "list") throw new Error("expected list");
      const worldItems = worldCategory.items.map((item) => ({
        title: item.title,
        content:
          plan.documents.find(({ fileId }) => fileId === item.file.id)
            ?.content ?? ""
      }));
      expect(worldItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "分类概览",
            content: "世界由潮汐驱动。"
          }),
          expect.objectContaining({
            title: "逆潮",
            content: expect.stringContaining("逆潮会让记忆倒流")
          })
        ])
      );
      const chapterState = plan.documents.find(
        ({ fileId }) => fileId === plan.index.chapters[0]!.characterState.id
      )!;
      const foreshadowingChanges = plan.documents.find(
        ({ fileId }) =>
          fileId === plan.index.chapters[0]!.foreshadowingChanges.id
      )!;
      expect(foreshadowingChanges).toMatchObject({
        path: plan.index.chapters[0]!.foreshadowingChanges.path,
        content: ""
      });
      expect(chapterState.content).toContain("旧版状态账本（待重新提交）");
      expect(chapterState.content).toContain("林舟于海岸醒来");
      expect(chapterState.content).toContain("旧版叙事落点执行判定");
      expect(chapterState.content).toContain(
        "placement_id=placement old；旧状态=committed"
      );
      expect(chapterState.content).toContain("旧版伏笔节拍执行判定");
      expect(chapterState.content).toContain("旧状态=committed");
      expect(plan.warnings.join("\n")).toContain("不可逆的迁移检查点");
    }
  );

  it("produces deterministic safe ids for the same legacy identities", () => {
    const source = parseWriteClawLongSourceBytes(
      Buffer.from(JSON.stringify(legacyBook()), "utf8"),
      "book.json"
    );
    const first = createWriteClawLongImportPlan(source, {
      importedAt: FIXED_NOW
    });
    const second = createWriteClawLongImportPlan(source, {
      importedAt: FIXED_NOW
    });

    expect(second.manifest.id).toBe(first.manifest.id);
    expect(second.idMap).toEqual(first.idMap);
    expect(second.index).toEqual(first.index);
    expect(
      first.documents.every(
        ({ path }) => !path.includes("..") && !path.includes("unsafe")
      )
    ).toBe(true);
  });

  it("bounds migration warnings before a completed import reaches the IPC result schema", () => {
    const source = parseWriteClawLongSourceBytes(
      Buffer.from(JSON.stringify(legacyBook()), "utf8"),
      "book.json"
    );
    source.warnings = Array.from({ length: 10_005 }, (_, index) =>
      index === 0 ? `  ${"警".repeat(5_000)}  ` : `迁移警告 ${index}`
    );

    const plan = createWriteClawLongImportPlan(source, {
      importedAt: FIXED_NOW
    });

    expect(plan.warnings).toHaveLength(10_000);
    expect(plan.warnings[0]).toHaveLength(4_000);
    expect(
      plan.warnings.every(
        (warning) =>
          warning.length >= 1 &&
          warning.length <= 4_000 &&
          warning === warning.trim()
      )
    ).toBe(true);
    expect(plan.warnings.at(-1)).toContain("10,000 条返回上限");
  });

  it("normalizes uncommitted legacy foreshadowing to its derived planned state", () => {
    const workspace = legacyWorkspace();
    workspace.chapters[
      "draft.volume-1.arc-1.chapter-1"
    ]!.committed = false;
    workspace.chapters[
      "draft.volume-1.arc-1.chapter-1"
    ]!.commit_id = "";
    workspace.ledger.committed_through = "";
    workspace.ledger.timeline = [];
    const plan = createWriteClawLongImportPlan(
      parseWriteClawLongSourceBytes(
        Buffer.from(JSON.stringify(legacyBook(workspace)), "utf8"),
        "book.json"
      ),
      { importedAt: FIXED_NOW }
    );

    expect(plan.index.ledger.commits).toEqual([]);
    expect(plan.index.plot.foreshadowing[0]).toMatchObject({
      status: "planned",
      beats: [
        expect.objectContaining({ status: "written", commitId: null })
      ]
    });
  });

  it("rejects incomplete v3+ audit metadata but restores v1/v2 checkpoints conservatively", () => {
    const invalidV5 = legacyWorkspace();
    invalidV5.chapters[
      "draft.volume-1.arc-1.chapter-1"
    ]!.commit_id = "";
    expect(() =>
      createWriteClawLongImportPlan(
        parseWriteClawLongSourceBytes(
          Buffer.from(JSON.stringify(legacyBook(invalidV5)), "utf8"),
          "book.json"
        ),
        { importedAt: FIXED_NOW }
      )
    ).toThrow(/缺少 commit_id、committed_at 或时间线审计/u);

    const legacyV2 = legacyWorkspace();
    legacyV2.schema_version = 2;
    legacyV2.chapters[
      "draft.volume-1.arc-1.chapter-1"
    ]!.commit_id = "";
    legacyV2.chapters[
      "draft.volume-1.arc-1.chapter-1"
    ]!.committed_at = "";
    legacyV2.ledger.timeline = [];
    const plan = createWriteClawLongImportPlan(
      parseWriteClawLongSourceBytes(
        Buffer.from(JSON.stringify(legacyBook(legacyV2)), "utf8"),
        "book.json"
      ),
      { importedAt: FIXED_NOW }
    );
    expect(plan.committedChapterPolicy).toBe("legacy-checkpoints");
    expect(plan.index.ledger.commits).toEqual([
      expect.objectContaining({ reversible: false })
    ]);
    expect(plan.warnings.join("\n")).toContain("未知时间占位");
  });

  it("requires v3+ timeline evidence to match every locator and the chapter commit", () => {
    const invalidTimelines = [
      {
        chapter_stage_id: "draft.other.chapter",
        chapter_card_id: "chapter old",
        commit_id: "old-commit"
      },
      {
        chapter_stage_id: "draft.volume-1.arc-1.chapter-1",
        chapter_card_id: "chapter other",
        commit_id: "old-commit"
      },
      {
        chapter_stage_id: "draft.volume-1.arc-1.chapter-1",
        chapter_card_id: "chapter old",
        commit_id: ""
      },
      {
        chapter_stage_id: "draft.volume-1.arc-1.chapter-1",
        chapter_card_id: "chapter old",
        commit_id: "other-commit"
      }
    ];

    for (const locator of invalidTimelines) {
      const workspace = legacyWorkspace();
      Object.assign(workspace.ledger.timeline[0]!, locator);
      expect(() =>
        createWriteClawLongImportPlan(
          parseWriteClawLongSourceBytes(
            Buffer.from(JSON.stringify(legacyBook(workspace)), "utf8"),
            "book.json"
          ),
          { importedAt: FIXED_NOW }
        )
      ).toThrow(/缺少 commit_id、committed_at 或时间线审计/u);
    }
  });

  it("uses metadata.json book metadata when a zip has no book.json", () => {
    const workspace = legacyWorkspace();
    const archive = zipFixture([
      {
        name: "nested/metadata.json",
        content: JSON.stringify({
          library_type: "book",
          data: {
            id: "metadata-book",
            title: "元数据书名",
            book_type: "long",
            categories: ["奇幻"]
          }
        }),
        method: 0
      },
      {
        name: "nested/long_workspace.json",
        content: JSON.stringify(workspace),
        method: 8
      }
    ]);
    const plan = createWriteClawLongImportPlan(
      parseWriteClawLongSourceBytes(archive, "metadata-only.zip"),
      { importedAt: FIXED_NOW }
    );

    expect(plan.manifest).toMatchObject({
      title: "元数据书名",
      genre: "奇幻"
    });
  });

  it("prefers a root authority file when nested copies are also present", () => {
    const rootWorkspace = legacyWorkspace();
    const nestedWorkspace = {
      ...legacyWorkspace(),
      revision: 999
    };
    const archive = zipFixture([
      {
        name: "book.json",
        content: JSON.stringify(legacyBook(rootWorkspace))
      },
      {
        name: "long_workspace.json",
        content: JSON.stringify(rootWorkspace)
      },
      {
        name: "backup/long_workspace.json",
        content: JSON.stringify(nestedWorkspace)
      }
    ]);

    const source = parseWriteClawLongSourceBytes(archive, "root-priority.zip");

    expect(source.workspace.revision).toBe(rootWorkspace.revision);
    expect(source.warnings.join("\n")).toContain(
      "已优先采用根目录“long_workspace.json”"
    );
    expect(source.warnings.join("\n")).toContain(
      "backup/long_workspace.json"
    );
  });

  it("deduplicates identical nested authority files deterministically", () => {
    const workspace = legacyWorkspace();
    const archive = zipFixture([
      {
        name: "book.json",
        content: JSON.stringify(legacyBook(workspace))
      },
      {
        name: "export/long_workspace.json",
        content: JSON.stringify(workspace)
      },
      {
        name: "backup/long_workspace.json",
        content: JSON.stringify(workspace)
      }
    ]);

    const source = parseWriteClawLongSourceBytes(archive, "same-copies.zip");

    expect(source.workspace.revision).toBe(workspace.revision);
    expect(source.warnings.join("\n")).toContain(
      "多份内容相同的 long_workspace.json"
    );
    expect(source.warnings.join("\n")).toContain(
      "已自动去重并采用“backup/long_workspace.json”"
    );
  });

  it("lists conflicting nested authority paths instead of choosing silently", () => {
    const archive = zipFixture([
      {
        name: "first/long_workspace.json",
        content: JSON.stringify(legacyWorkspace())
      },
      {
        name: "second/long_workspace.json",
        content: JSON.stringify({
          ...legacyWorkspace(),
          revision: 999
        })
      }
    ]);

    expect(() =>
      parseWriteClawLongSourceBytes(archive, "conflicting-copies.zip")
    ).toThrow(
      /内容不一致的 long_workspace\.json.*first\/long_workspace\.json.*second\/long_workspace\.json/u
    );
  });

  it("preserves legacy bindings, memories, orphan ledger, overflow text and zip artifacts", () => {
    const workspace = legacyWorkspace();
    workspace.plot.volumes[0]!.outline = `${"长".repeat(200_000)}完整尾部`;
    workspace.ledger.timeline.push({
      id: "orphan-ledger",
      chapter_stage_id: "",
      chapter_card_id: "",
      content: "没有章节归属但必须保留",
      commit_id: ""
    });
    const book = {
      ...legacyBook(workspace),
      linked_material_ids_by_kind: {
        character: ["material-character"],
        plot: ["material-plot"],
        custom: ["material-custom"]
      },
      linked_material_id: "material-plot",
      linked_skill_ids_by_kind: {
        plot: ["skill-plot"],
        style: ["skill-style"]
      },
      linked_skill_id: "skill-other",
      memories: [
        {
          id: "memory-1",
          tag: "人物",
          content: "林舟害怕失去记忆。",
          created_at: "2025-01-02T03:04:05Z",
          updated_at: "2025-02-03T04:05:06Z"
        }
      ],
      memory_auto_capture_enabled: true,
      expert_draft: {
        sections: [{ id: "legacy-section", title: "旧章节", body: "旧正文" }]
      }
    };
    const source = parseWriteClawLongSourceBytes(
      zipFixture([
        { name: "book.json", content: JSON.stringify(book) },
        {
          name: "long_workspace.json",
          content: JSON.stringify(workspace)
        },
        {
          name: "expert_draft.json",
          content: JSON.stringify(book.expert_draft)
        },
        {
          name: "files/作者备注.md",
          content: "附件中的关键迁移证据"
        }
      ]),
      "lossless.zip"
    );
    const plan = createWriteClawLongImportPlan(source, {
      importedAt: FIXED_NOW
    });

    expect(plan.manifest.linkedMaterialIdsByKind).toEqual({
      character: ["material-character"],
      gimmick: [],
      plot: ["material-plot"],
      draft: [],
      other: ["material-custom"]
    });
    expect(plan.manifest.linkedSkillIdsByKind).toEqual({
      general: [],
      plot: ["skill-plot"],
      style: ["skill-style"],
      other: ["skill-other"]
    });

    const evidenceDocuments = plan.index.worldbuilding
      .flatMap((category) =>
        category.format === "text"
          ? [
              plan.documents.find(
                ({ fileId }) => fileId === category.file.id
              )?.content ?? ""
            ]
          : []
      )
      .join("\n");
    expect(evidenceDocuments).toContain("书籍记忆（旧版）");
    expect(evidenceDocuments).toContain('"id": "memory-1"');
    expect(evidenceDocuments).toContain('"tag": "人物"');
    expect(evidenceDocuments).toContain("2025-01-02T03:04:05Z");
    expect(evidenceDocuments).toContain("自动捕获设置：旧版为开启；当前仅存档");
    expect(evidenceDocuments).toContain("没有章节归属但必须保留");
    expect(evidenceDocuments).toContain("完整尾部");
    expect(evidenceDocuments).toContain("legacy-section");
    expect(evidenceDocuments).toContain("附件中的关键迁移证据");
    expect(plan.warnings.join("\n")).toContain("缺失的 ID");
    expect(plan.warnings.join("\n")).toContain("自动捕获设置仅存档");
    expect(plan.warnings.join("\n")).toContain("完整原文已写入");
  });

  it("normalizes oversized worldbuilding lists without losing original values", () => {
    const workspace = legacyWorkspace();
    workspace.worldbuilding.categories = [
      {
        id: "large-world",
        name: "超大世界观",
        format: "list",
        overview: "分类概览",
        text: "",
        items: Array.from({ length: 10_000 }, (_, index) => ({
          id: `world-item-${index + 1}`,
          name: index === 0 ? "双行\n标题" : `条目 ${index + 1}`,
          description:
            index === 0
              ? "包含 <!-- deepwrite-world-item:legacy --> 保留标记"
              : "",
          detail: `详情 ${index + 1}`
        }))
      }
    ];
    const plan = createWriteClawLongImportPlan(
      parseWriteClawLongSourceBytes(
        Buffer.from(JSON.stringify(legacyBook(workspace)), "utf8"),
        "book.json"
      ),
      { importedAt: FIXED_NOW }
    );
    const category = plan.index.worldbuilding.find(
      ({ title }) => title === "超大世界观"
    )!;
    if (category.format !== "list") throw new Error("expected list");
    const items = category.items.map((item) => ({
      title: item.title,
      content:
        plan.documents.find(({ fileId }) => fileId === item.file.id)
          ?.content ?? ""
    }));

    expect(items).toHaveLength(10_000);
    expect(items[1]).toMatchObject({ title: "双行 标题" });
    expect(items[1]?.content).toContain(
      "<!-- deepwrite-world-item&#58;legacy -->"
    );
    expect(items[1]?.content).not.toContain(
      "<!-- deepwrite-world-item:"
    );
    expect(plan.warnings.join("\n")).toMatch(
      /超过 10000 项|超过 10,000 项/u
    );
    const evidence = plan.index.worldbuilding
      .filter(({ id }) => id.startsWith("world_migration-evidence-"))
      .flatMap((category) =>
        category.format === "text"
          ? [
              plan.documents.find(
                ({ fileId }) => fileId === category.file.id
              )?.content ?? ""
            ]
          : []
      )
      .join("\n");
    expect(evidence).toContain(
      "<!-- deepwrite-world-item:legacy -->"
    );
    expect(evidence).toContain("world-item-10000");
  });

  it("packs many legacy attachments into bounded searchable evidence categories", () => {
    const source = parseWriteClawLongSourceBytes(
      Buffer.from(JSON.stringify(legacyBook()), "utf8"),
      "book.json"
    );
    source.evidenceFiles = Array.from({ length: 10_050 }, (_, index) => ({
      archivePath: `files/attachment-${index + 1}.txt`,
      content: `附件证据 ${index + 1}`
    }));
    const plan = createWriteClawLongImportPlan(source, {
      importedAt: FIXED_NOW
    });
    const evidenceCategories = plan.index.worldbuilding.filter(({ id }) =>
      id.startsWith("world_migration-evidence-")
    );
    const evidenceDocuments = evidenceCategories.flatMap((category) =>
      category.format === "text"
        ? [
            plan.documents.find(
              ({ fileId }) => fileId === category.file.id
            )?.content ?? ""
          ]
        : []
    );

    expect(plan.index.worldbuilding.length).toBeLessThanOrEqual(10_000);
    expect(evidenceCategories.length).toBeLessThan(1_000);
    expect(
      evidenceDocuments.some((content) =>
        content.includes("附件证据 1")
      )
    ).toBe(true);
    expect(
      evidenceDocuments.some((content) =>
        content.includes("附件证据 10050")
      )
    ).toBe(true);
    expect(
      evidenceDocuments.some((content) =>
        content.includes("files/attachment-10050.txt")
      )
    ).toBe(true);
  });

  it("keeps dropped, merged and unresolved graph data plus the complete id map searchable", () => {
    const workspace = structuredClone(legacyWorkspace());
    workspace.plot.story_events[0]!.character_ids.push(
      "character-reference-does-not-exist"
    );
    workspace.plot.chapter_cards[0]!.arc_id = "arc-does-not-exist";
    workspace.plot.narrative_placements.push({
      id: "dangling-placement-search-marker",
      event_id: "event-does-not-exist",
      chapter_card_id: "chapter-does-not-exist",
      order: 99,
      mode: "unknown-mode",
      disclosure: "unknown-disclosure",
      note: "dangling placement raw payload",
      execution_status: "planned"
    });
    workspace.plot.event_links.push(
      {
        id: "duplicate-link-search-marker",
        source_event_id: "event-a",
        target_event_id: "event-b",
        type: "before",
        note: "duplicate link raw payload"
      },
      {
        id: "cycle-link-search-marker",
        source_event_id: "event-b",
        target_event_id: "event-a",
        type: "before",
        note: "cycle link raw payload"
      }
    );

    const source = parseWriteClawLongSourceBytes(
      Buffer.from(JSON.stringify(legacyBook(workspace)), "utf8"),
      "book.json"
    );
    const plan = createWriteClawLongImportPlan(source, {
      importedAt: FIXED_NOW
    });
    const searchableEvidence = plan.index.worldbuilding
      .filter(({ id }) => id.startsWith("world_migration-evidence-"))
      .flatMap((category) =>
        category.format === "text"
          ? [
              plan.documents.find(
                ({ fileId }) => fileId === category.file.id
              )?.content ?? ""
            ]
          : []
      )
      .join("\n");

    expect(searchableEvidence).toContain(
      "long_workspace.json.plot.narrative_placements[1]"
    );
    expect(searchableEvidence).toContain(
      "dangling-placement-search-marker"
    );
    expect(searchableEvidence).toContain("duplicate-link-search-marker");
    expect(searchableEvidence).toContain("cycle-link-search-marker");
    expect(searchableEvidence).toContain(
      "character-reference-does-not-exist"
    );
    expect(searchableEvidence).toContain("unresolved-reference");
    expect(plan.index.plot.chapterCards[0]!.primaryArcId).toBeNull();
    expect(plan.warnings.join("\n")).toContain("已移除该关联");
    expect(searchableEvidence).toContain('"action": "merge"');
    expect(searchableEvidence).toContain('"action": "drop"');
    expect(searchableEvidence).toContain(
      "旧版 → 墨枢完整 ID 映射"
    );
    expect(searchableEvidence).toContain('"sourceIdentity"');
    expect(searchableEvidence).toContain(plan.idMap.event!["event-a"]!);
  });

  it("fills a valid minimum structure when optional v5 data is missing", () => {
    const source = parseWriteClawLongSourceBytes(
      Buffer.from(
        JSON.stringify({
          schema_version: 5,
          worldbuilding: {},
          characters: {},
          plot: {},
          chapters: {},
          ledger: {}
        }),
        "utf8"
      ),
      "long_workspace.json"
    );
    const plan = createWriteClawLongImportPlan(source, {
      importedAt: FIXED_NOW,
      title: "空白迁移"
    });

    expect(
      plan.index.worldbuilding.filter(
        ({ id }) => !id.startsWith("world_migration-evidence-")
      )
    ).toHaveLength(7);
    expect(plan.index.plot.volumes).toHaveLength(1);
    expect(plan.index.plot.arcs).toHaveLength(1);
    expect(plan.index.plot.chapterCards).toHaveLength(1);
    expect(plan.index.chapters).toHaveLength(1);
    expect(plan.warnings.join("\n")).toContain("已补充默认第一章");
  });

  it("rejects zip slip, duplicate entries and zip-bomb declarations", () => {
    expect(() =>
      parseWriteClawLongSourceBytes(
        zipFixture([
          {
            name: "../book.json",
            content: JSON.stringify(legacyBook())
          }
        ]),
        "slip.zip"
      )
    ).toThrow(/不安全/u);

    expect(() =>
      parseWriteClawLongSourceBytes(
        zipFixture([
          {
            name: "book.json",
            content: JSON.stringify(legacyBook())
          },
          {
            name: "book.json",
            content: JSON.stringify(legacyBook())
          }
        ]),
        "duplicate.zip"
      )
    ).toThrow(/重复文件/u);

    expect(() =>
      parseWriteClawLongSourceBytes(
        zipFixture([
          {
            name: "book.json",
            content: "{}",
            declaredUncompressedSize: 300 * 1024 * 1024
          }
        ]),
        "bomb.zip"
      )
    ).toThrow(/压缩率异常|总大小/u);
  });

  it("accepts a real Write Claw projection layout beyond 4,096 entries", () => {
    const workspace = legacyWorkspace();
    const projections = Array.from({ length: 1_025 }, (_, index) => {
      const chapter = index + 1;
      const volume = chapter % 2 === 0 ? "Volume" : "volume";
      const prefix = `long_chapters/${volume}/arc/${String(chapter).padStart(4, "0")}-chapter`;
      return [
        {
          name: `stages/draft.volume-1.arc-1.chapter-${chapter}.txt`,
          content: "",
          method: 0 as const
        },
        { name: `${prefix}.txt`, content: "", method: 0 as const },
        {
          name: `${prefix}-人物状态.txt`,
          content: "",
          method: 0 as const
        },
        {
          name: `${prefix}-交接注意.txt`,
          content: "",
          method: 0 as const
        }
      ];
    }).flat();
    const source = parseWriteClawLongSourceBytes(
      zipFixture([
        {
          name: "book.json",
          content: JSON.stringify(legacyBook(workspace)),
          method: 0
        },
        {
          name: "long_workspace.json",
          content: JSON.stringify(workspace),
          method: 0
        },
        {
          name: "long_chapters/Volume/arc/0000-case.txt",
          content: "",
          method: 0
        },
        {
          name: "long_chapters/volume/arc/0000-case.txt",
          content: "",
          method: 0
        },
        ...projections
      ]),
      "large-projection-layout.zip"
    );

    expect(projections.length).toBeGreaterThan(4_096);
    expect(source.workspace.schema_version).toBe(5);
  });

  it("reads authority JSON above the attachment evidence limit", () => {
    const workspace = legacyWorkspace();
    const exportPadding = "x".repeat(33 * 1024 * 1024);
    const source = parseWriteClawLongSourceBytes(
      zipFixture([
        {
          name: "book.json",
          content: JSON.stringify({
            ...legacyBook(workspace),
            export_padding: exportPadding
          }),
          method: 0
        },
        {
          name: "long_workspace.json",
          content: JSON.stringify(workspace),
          method: 0
        }
      ]),
      "large-book-json.zip"
    );

    expect(source.book?.export_padding).toBe(exportPadding);
  });

  it("rejects a direct book.json without long_workspace", () => {
    expect(() =>
      parseWriteClawLongSourceBytes(
        Buffer.from(
          JSON.stringify({
            id: "short-book",
            title: "不是长篇数据",
            book_type: "long"
          }),
          "utf8"
        ),
        "book.json"
      )
    ).toThrow(/缺少 long_workspace/u);
  });
});
