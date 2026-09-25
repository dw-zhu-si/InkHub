import { describe, expect, it } from "vitest";
import {
  EMPTY_LONG_MARKDOWN_REVISION,
  LONG_BOOK_LINE_FILE_ID,
  LongWorkspaceIndexSnapshotSchema,
  previewLongWorkspaceOperations,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterHandoffFileId,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  type LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import {
  createLongStructureMutationBuilder,
  moveLongOrderedId,
  rebaseLongStructureBatchAfterDocumentSave
} from "./longStructureMutations";

const now = "2026-07-26T12:00:00.000Z";
const later = "2026-07-26T13:00:00.000Z";
const revision = "v1:0:00000000";

function file(id: string, path: string) {
  return { id, path, revision, updatedAt: now };
}

function characterFiles(characterId: string) {
  return {
    characterId,
    coreProfile: file(
      longCharacterCoreProfileFileId(characterId),
      `long/characters/${characterId}/core-profile.md`
    ),
    relationships: file(
      longCharacterRelationshipsFileId(characterId),
      `long/characters/${characterId}/relationships.md`
    ),
    currentState: file(
      longCharacterCurrentStateFileId(characterId),
      `long/characters/${characterId}/current-state.md`
    ),
    history: file(
      longCharacterHistoryFileId(characterId),
      `long/characters/${characterId}/history.md`
    )
  };
}

function chapterFiles(chapterCardId: string) {
  return {
    chapterCardId,
    body: file(
      longChapterBodyFileId(chapterCardId),
      `long/chapters/${chapterCardId}/body.md`
    ),
    card: file(
      longChapterCardFileId(chapterCardId),
      `long/chapters/${chapterCardId}/card.md`
    ),
    characterState: file(
      longChapterCharacterStateFileId(chapterCardId),
      `long/chapters/${chapterCardId}/character-state.md`
    ),
    handoff: file(
      longChapterHandoffFileId(chapterCardId),
      `long/chapters/${chapterCardId}/handoff.md`
    ),
    commitId: null
  };
}

function snapshot(): LongWorkspaceIndexSnapshot {
  return LongWorkspaceIndexSnapshotSchema.parse({
    schemaVersion: 1,
    revision: 11,
    bookId: "longbook_structure_manager",
    updatedAt: now,
    bookLine: file(LONG_BOOK_LINE_FILE_ID, "long/plot/book-line.md"),
    worldbuilding: [
      {
        id: "world_history",
        title: "历史",
        order: 1,
        format: "text",
        contentAuthority: "markdown",
        file: file(
          longWorldbuildingFileId("world_history"),
          "long/worldbuilding/world_history/content.md"
        )
      },
      {
        id: "world_geography",
        title: "地理",
        order: 2,
        format: "list",
        contentAuthority: "files",
        items: []
      }
    ],
    characters: [
      {
        id: "character_alice",
        name: "林岚",
        group: "protagonist",
        order: 1,
        aliases: []
      },
      {
        id: "character_bob",
        name: "闻川",
        group: "protagonist",
        order: 2,
        aliases: ["阿川"]
      }
    ],
    characterFiles: [
      characterFiles("character_alice"),
      characterFiles("character_bob")
    ],
    plot: {
      volumes: [
        {
          id: "volume_one",
          title: "第一卷",
          order: 1,
          summary: ""
        },
        {
          id: "volume_two",
          title: "第二卷",
          order: 2,
          summary: ""
        }
      ],
      arcs: [
        {
          id: "arc_letter",
          volumeId: "volume_one",
          title: "来信之谜",
          order: 1,
          outline: ""
        },
        {
          id: "arc_clock",
          volumeId: "volume_one",
          title: "钟楼暗线",
          order: 2,
          outline: ""
        },
        {
          id: "arc_return",
          volumeId: "volume_two",
          title: "归途",
          order: 1,
          outline: ""
        }
      ],
      chapterCards: [
        {
          id: "chapter_one",
          volumeId: "volume_one",
          primaryArcId: "arc_letter",
          title: "雨夜来信",
          narrativeOrder: 1
        },
        {
          id: "chapter_two",
          volumeId: "volume_one",
          primaryArcId: "arc_clock",
          title: "旧钟楼",
          narrativeOrder: 2
        }
      ],
      storyEvents: [],
      storyPlots: [],
      eventConnections: [],
      narrativePlacements: [],
      foreshadowing: []
    },
    chapters: [chapterFiles("chapter_one"), chapterFiles("chapter_two")],
    ledger: {
      committedThroughChapterId: null,
      commits: []
    }
  });
}

function builder(workspace = snapshot()) {
  return createLongStructureMutationBuilder(workspace, {
    now: () => later,
    createId: (prefix) => `${prefix}_generated`
  });
}

function plotSnapshot(): LongWorkspaceIndexSnapshot {
  const base = snapshot();
  return LongWorkspaceIndexSnapshotSchema.parse({
    ...base,
    plot: {
      ...base.plot,
      storyEvents: [
        {
          id: "event_letter",
          title: "收到来信",
          summary: "林岚在雨夜收到无署名来信。",
          timeMode: "exact",
          timeLabel: "六月三日深夜",
          timeValue: "1897-06-03T23:00:00",
          storyOrder: 1,
          location: "林宅",
          arcIds: ["arc_letter"],
          characterIds: ["character_alice"]
        },
        {
          id: "event_clock",
          title: "钟楼停摆",
          summary: "",
          timeMode: "relative",
          timeLabel: "来信后一日",
          storyOrder: 2,
          location: "旧钟楼",
          arcIds: ["arc_clock"],
          characterIds: ["character_alice", "character_bob"]
        }
      ],
      eventConnections: [
        {
          id: "connection_letter_clock",
          sourceEventId: "event_letter",
          targetEventId: "event_clock",
          type: "causes",
          note: "来信引导林岚前往钟楼。"
        }
      ],
      narrativePlacements: [
        {
          id: "placement_letter",
          eventId: "event_letter",
          chapterCardId: "chapter_one",
          orderInChapter: 1,
          mode: "scene",
          disclosure: "full",
          writingPrompt: "",
          status: "planned",
          commitId: null
        },
        {
          id: "placement_clock",
          eventId: "event_clock",
          chapterCardId: "chapter_one",
          orderInChapter: 2,
          mode: "clue",
          disclosure: "hint",
          writingPrompt: "只写钟摆的异常。",
          status: "planned",
          commitId: null
        }
      ],
      foreshadowing: [
        {
          id: "foreshadow_bell",
          title: "失声的钟",
          coreQuestion: "钟为何停摆？",
          truthEventId: "event_clock",
          expectedReaderEffect: "对时间记录产生怀疑。",
          status: "planned",
          beats: [
            {
              id: "beat_bell_plant",
              type: "plant",
              order: 1,
              eventId: "event_clock",
              placementId: "placement_clock",
              chapterCardId: "chapter_one",
              plannedScope: "",
              note: "钟声少了一响。",
              status: "planned",
              commitId: null
            },
            {
              id: "beat_bell_reinforce",
              type: "reinforce",
              order: 2,
              eventId: null,
              placementId: null,
              chapterCardId: "chapter_two",
              plannedScope: "",
              note: "",
              status: "planned",
              commitId: null
            }
          ]
        },
        {
          id: "foreshadow_letter",
          title: "来信笔迹",
          coreQuestion: "",
          truthEventId: "event_letter",
          expectedReaderEffect: "",
          status: "planned",
          beats: []
        }
      ]
    }
  });
}

describe("long structure mutation builder", () => {
  it("builds per-book item layout updates", () => {
    expect(
      builder().updateFeatureSettings({
        worldbuildingItemLayout: "left-tree",
        characterAndContinuityItemLayout: "left-tree",
        plotItemLayout: "left-tree"
      }).operations
    ).toEqual([
      {
        type: "featureSettings.update",
        patch: {
          worldbuildingItemLayout: "left-tree",
          characterAndContinuityItemLayout: "left-tree",
          plotItemLayout: "left-tree"
        }
      }
    ]);
  });

  it("creates, reorders and deletes list worldbuilding items", () => {
    const workspace = snapshot();
    const category = workspace.worldbuilding.find(
      ({ id }) => id === "world_geography"
    );
    if (!category || category.format !== "list") {
      throw new Error("missing worldbuilding list fixture");
    }
    category.items = [
      {
        id: "worlditem_plain",
        title: "新条目 3",
        order: 1,
        file: file(
          longWorldbuildingItemFileId("worlditem_plain"),
          longWorldbuildingItemContentPath(
            category.id,
            "worlditem_plain"
          )
        )
      },
      {
        id: "worlditem_harbor",
        title: "港口",
        order: 2,
        file: file(
          longWorldbuildingItemFileId("worlditem_harbor"),
          longWorldbuildingItemContentPath(
            category.id,
            "worlditem_harbor"
          )
        )
      }
    ];
    const mutations = builder(workspace);
    const created = mutations.createWorldbuildingItem(category.id);
    expect(created.operations).toEqual([
      {
        type: "worldbuildingItem.create",
        categoryId: category.id,
        item: {
          id: "worlditem_generated",
          title: "新条目 4",
          order: 3,
          file: {
            id: longWorldbuildingItemFileId("worlditem_generated"),
            path: longWorldbuildingItemContentPath(
              category.id,
              "worlditem_generated"
            ),
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt: later
          }
        }
      }
    ]);
    expect(
      mutations.reorderWorldbuildingItem(
        category.id,
        "worlditem_harbor",
        "up"
      ).operations
    ).toEqual([
      {
        type: "worldbuildingItem.reorder",
        categoryId: category.id,
        orderedIds: ["worlditem_harbor", "worlditem_plain"]
      }
    ]);
    expect(
      mutations.deleteWorldbuildingItem(
        category.id,
        "worlditem_plain"
      ).operations
    ).toEqual([
      {
        type: "worldbuildingItem.delete",
        categoryId: category.id,
        id: "worlditem_plain",
        cascade: true
      }
    ]);
    expect(() =>
      previewLongWorkspaceOperations(workspace, created)
    ).not.toThrow();
  });

  it("rebases a pending structure batch only across document-only revisions", () => {
    const before = snapshot();
    const batch = builder(before).updateWorldbuilding("world_history", {
      title: "新历史"
    });
    const afterDocumentSave = LongWorkspaceIndexSnapshotSchema.parse({
      ...before,
      revision: 12,
      updatedAt: later,
      bookLine: {
        ...before.bookLine,
        revision: "v1:0:11111111",
        updatedAt: later
      }
    });

    expect(
      rebaseLongStructureBatchAfterDocumentSave({
        batch,
        before,
        after: afterDocumentSave
      }).baseRevision
    ).toBe(12);

    const afterStructureChange = LongWorkspaceIndexSnapshotSchema.parse({
      ...afterDocumentSave,
      worldbuilding: afterDocumentSave.worldbuilding.map((category) =>
        category.id === "world_history"
          ? { ...category, title: "并发修改" }
          : category
      )
    });
    expect(() =>
      rebaseLongStructureBatchAfterDocumentSave({
        batch,
        before,
        after: afterStructureChange
      })
    ).toThrow(/结构已更新/u);
  });

  it("creates stable ids and complete empty Markdown file indexes", () => {
    const worldBatch = builder().createWorldbuilding({
      title: "  政治制度  ",
      format: "list"
    });
    expect(worldBatch).toMatchObject({
      baseRevision: 11,
      updatedAt: later,
      documentWrites: []
    });
    expect(worldBatch.operations).toEqual([
      {
        type: "worldbuilding.create",
        category: {
          id: "world_generated",
          title: "政治制度",
          order: 3,
          format: "list",
          contentAuthority: "files",
          overview: {
            id: "file_world_generated:overview",
            path: "long/worldbuilding/world_generated/overview.md",
            revision:
              "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            updatedAt: later
          },
          items: []
        }
      }
    ]);

    const characterBatch = builder().createCharacter({
      name: "  谢青  ",
      group: "protagonist",
      aliases: ["小谢", " 小谢 ", "", "青"]
    });
    const characterCreate = characterBatch.operations[0];
    expect(characterCreate).toMatchObject({
      type: "character.create",
      character: {
        id: "character_generated",
        name: "谢青",
        group: "protagonist",
        order: 3,
        aliases: ["小谢", "青"]
      },
      files: {
        characterId: "character_generated",
        coreProfile: {
          id: "file_character_generated:core-profile",
          path: "long/characters/character_generated/core-profile.md",
          revision: EMPTY_LONG_MARKDOWN_REVISION,
          updatedAt: later
        },
        relationships: {
          id: "file_character_generated:relationships",
          path: "long/characters/character_generated/relationships.md"
        },
        currentState: {
          id: "file_character_generated:current-state",
          path: "long/characters/character_generated/current-state.md"
        },
        history: {
          id: "file_character_generated:history",
          path: "long/characters/character_generated/history.md"
        }
      }
    });

    const chapterBatch = builder().createChapter({
      title: "追入雨幕",
      volumeId: "volume_one",
      primaryArcId: "arc_letter"
    });
    expect(chapterBatch.operations).toEqual([
      {
        type: "chapter.create",
        chapterCard: {
          id: "chapter_generated",
          volumeId: "volume_one",
          primaryArcId: "arc_letter",
          title: "追入雨幕",
          narrativeOrder: 3
        },
        files: {
          chapterCardId: "chapter_generated",
          bodyStatus: "empty",
          body: {
            id: "file_chapter_generated:body",
            path: "long/chapters/chapter_generated/body.md",
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt: later
          },
          card: {
            id: "file_chapter_generated:card",
            path: "long/chapters/chapter_generated/card.md",
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt: later
          },
          characterState: {
            id: "file_chapter_generated:character-state",
            path: "long/chapters/chapter_generated/character-state.md",
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt: later
          },
          handoff: {
            id: "file_chapter_generated:handoff",
            path: "long/chapters/chapter_generated/handoff.md",
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt: later
          },
          foreshadowingChanges: {
            id: longChapterForeshadowingChangesFileId(
              "chapter_generated"
            ),
            path: longChapterContinuityFilePath(
              "chapter_generated",
              "foreshadowing-changes.md"
            ),
            revision: EMPTY_LONG_MARKDOWN_REVISION,
            updatedAt: later
          },
          worldReveals: null,
          characterContinuity: [],
          commitId: null
        }
      }
    ]);

    expect(
      builder().createChapter({
        title: "独立章节",
        volumeId: "volume_one",
        primaryArcId: null
      }).operations[0]
    ).toMatchObject({
      type: "chapter.create",
      chapterCard: {
        volumeId: "volume_one",
        primaryArcId: null,
        title: "独立章节"
      }
    });
  });

  it("derives create order and reorder operations without mutating the snapshot", () => {
    const workspace = snapshot();
    const before = structuredClone(workspace);
    const mutations = builder(workspace);

    expect(
      mutations.createVolume({ title: "第三卷" }).operations[0]
    ).toMatchObject({
      type: "volume.create",
      volume: { id: "volume_generated", order: 3 }
    });
    expect(
      mutations.updateArc("arc_letter", {
        summary: "剧情点概要",
        outline: "完整故事情节"
      }).operations
    ).toEqual([
      {
        type: "arc.update",
        id: "arc_letter",
        patch: {
          summary: "剧情点概要",
          outline: "完整故事情节"
        }
      }
    ]);
    expect(
      mutations.createArc({
        volumeId: "volume_one",
        title: "第三条弧"
      }).operations[0]
    ).toMatchObject({
      type: "arc.create",
      arc: { id: "arc_generated", order: 3 }
    });
    expect(
      mutations.reorderWorldbuilding("world_geography", "up").operations
    ).toEqual([
      {
        type: "worldbuilding.reorder",
        orderedIds: ["world_geography", "world_history"]
      }
    ]);
    expect(
      mutations.reorderCharacter("character_alice", "down").operations
    ).toEqual([
      {
        type: "character.reorder",
        group: "protagonist",
        orderedIds: ["character_bob", "character_alice"]
      }
    ]);
    expect(
      mutations.reorderArc("arc_clock", "up").operations
    ).toEqual([
      {
        type: "arc.reorder",
        volumeId: "volume_one",
        orderedIds: ["arc_clock", "arc_letter"]
      }
    ]);
    expect(
      mutations.reorderChapter("chapter_two", "up").operations
    ).toEqual([
      {
        type: "chapter.reorder",
        volumeId: "volume_one",
        orderedIds: ["chapter_two", "chapter_one"]
      }
    ]);
    expect(workspace).toEqual(before);
    expect(moveLongOrderedId(["a", "b", "c"], "b", "down")).toEqual([
      "a",
      "c",
      "b"
    ]);
    expect(() => moveLongOrderedId(["a"], "a", "up")).toThrow(
      "already at the boundary"
    );
  });

  it("combines field updates with explicit structure moves", () => {
    expect(
      builder().updateCharacter("character_alice", {
        name: "林岚（归来）",
        group: "major_supporting"
      }).operations
    ).toEqual([
      {
        type: "character.update",
        id: "character_alice",
        patch: { name: "林岚（归来）" }
      },
      {
        type: "character.move",
        id: "character_alice",
        toGroup: "major_supporting"
      }
    ]);

    expect(
      builder().updateArc("arc_letter", {
        title: "来信真相",
        volumeId: "volume_two"
      }).operations
    ).toEqual([
      {
        type: "arc.update",
        id: "arc_letter",
        patch: { title: "来信真相" }
      },
      {
        type: "arc.move",
        id: "arc_letter",
        toVolumeId: "volume_two"
      }
    ]);

    expect(
      builder().updateChapter("chapter_one", {
        title: "雨夜再临",
        volumeId: "volume_two",
        primaryArcId: "arc_return"
      }).operations
    ).toEqual([
      {
        type: "chapter.update",
        id: "chapter_one",
        patch: { title: "雨夜再临" }
      },
      {
        type: "chapter.move",
        id: "chapter_one",
        toVolumeId: "volume_two",
        toPrimaryArcId: "arc_return"
      }
    ]);

    expect(
      builder().updateChapter("chapter_one", {
        primaryArcId: null
      }).operations
    ).toEqual([
      {
        type: "chapter.move",
        id: "chapter_one",
        toVolumeId: "volume_one",
        toPrimaryArcId: null
      }
    ]);
  });

  it("always makes cascade intent explicit for every supported delete", () => {
    const mutations = builder();
    expect(
      mutations.deleteWorldbuilding("world_history", false).operations[0]
    ).toEqual({
      type: "worldbuilding.delete",
      id: "world_history",
      cascade: false
    });
    expect(
      mutations.deleteCharacter("character_alice", false).operations[0]
    ).toEqual({
      type: "character.delete",
      id: "character_alice",
      cascade: false
    });
    expect(mutations.deleteVolume("volume_one", true).operations[0]).toEqual({
      type: "volume.delete",
      id: "volume_one",
      cascade: true
    });
    expect(mutations.deleteArc("arc_letter", true).operations[0]).toEqual({
      type: "arc.delete",
      id: "arc_letter",
      cascade: true
    });
    expect(
      mutations.deleteChapter("chapter_one", false).operations[0]
    ).toEqual({
      type: "chapter.delete",
      id: "chapter_one",
      cascade: false
    });
  });

  it("builds complete story-event and event-connection proposals", () => {
    const mutations = builder(plotSnapshot());
    expect(
      mutations.createStoryEvent({
        title: "  码头重逢  ",
        summary: "两人在码头重逢。",
        timeMode: "sequence",
        timeLabel: "第三幕",
        timeValue: "seq:003",
        location: "南码头",
        arcIds: ["arc_return", "arc_return"],
        characterIds: ["character_alice", "character_bob"]
      }).operations
    ).toEqual([
      {
        type: "event.create",
        event: {
          id: "event_generated",
          title: "码头重逢",
          summary: "两人在码头重逢。",
          timeMode: "sequence",
          timeLabel: "第三幕",
          timeValue: "seq:003",
          storyOrder: 3,
          location: "南码头",
          arcIds: ["arc_return"],
          characterIds: ["character_alice", "character_bob"]
        }
      }
    ]);
    expect(
      mutations.updateStoryEvent("event_letter", {
        timeMode: "relative",
        timeLabel: "钟楼停摆前一夜",
        timeValue: "event_clock:-P1D",
        arcIds: ["arc_letter", "arc_clock"]
      }).operations
    ).toEqual([
      {
        type: "event.update",
        id: "event_letter",
        patch: {
          timeMode: "relative",
          timeLabel: "钟楼停摆前一夜",
          timeValue: "event_clock:-P1D",
          arcIds: ["arc_letter", "arc_clock"]
        }
      }
    ]);
    expect(
      mutations.reorderStoryEvent("event_clock", "up").operations
    ).toEqual([
      {
        type: "event.reorder",
        orderedIds: ["event_clock", "event_letter"]
      }
    ]);
    expect(
      mutations.createEventConnection({
        sourceEventId: "event_clock",
        targetEventId: "event_letter",
        type: "conceals",
        note: "倒叙暂时掩盖因果。"
      }).operations[0]
    ).toMatchObject({
      type: "connection.create",
      connection: {
        id: "connection_generated",
        sourceEventId: "event_clock",
        targetEventId: "event_letter",
        type: "conceals",
        note: "倒叙暂时掩盖因果。"
      }
    });
    expect(
      mutations.updateEventConnection("connection_letter_clock", {
        type: "enables",
        note: ""
      }).operations
    ).toEqual([
      {
        type: "connection.update",
        id: "connection_letter_clock",
        patch: { type: "enables", note: "" }
      }
    ]);
    expect(
      mutations.deleteStoryEvent("event_clock", true).operations[0]
    ).toEqual({ type: "event.delete", id: "event_clock", cascade: true });
    expect(
      mutations.deleteEventConnection("connection_letter_clock").operations[0]
    ).toEqual({
      type: "connection.delete",
      id: "connection_letter_clock",
      cascade: false
    });
    expect(() =>
      mutations.createEventConnection({
        sourceEventId: "event_letter",
        targetEventId: "event_letter",
        type: "same_time"
      })
    ).toThrow("two different events");
  });

  it("builds placement proposals with per-chapter order and explicit moves", () => {
    const mutations = builder(plotSnapshot());
    expect(
      mutations.createNarrativePlacement({
        eventId: "event_clock",
        chapterCardId: "chapter_two",
        mode: "flashback",
        disclosure: "partial",
        writingPrompt: "从回忆切入。"
      }).operations
    ).toEqual([
      {
        type: "placement.create",
        placement: {
          id: "placement_generated",
          eventId: "event_clock",
          chapterCardId: "chapter_two",
          orderInChapter: 1,
          mode: "flashback",
          disclosure: "partial",
          writingPrompt: "从回忆切入。",
          status: "planned",
          commitId: null
        }
      }
    ]);
    expect(
      mutations.updateNarrativePlacement("placement_clock", {
        chapterCardId: "chapter_two",
        mode: "reveal",
        disclosure: "full"
      }).operations
    ).toEqual([
      {
        type: "placement.update",
        id: "placement_clock",
        patch: { mode: "reveal", disclosure: "full" }
      },
      {
        type: "placement.move",
        id: "placement_clock",
        toChapterCardId: "chapter_two"
      }
    ]);
    expect(
      mutations.reorderNarrativePlacement("placement_clock", "up").operations
    ).toEqual([
      {
        type: "placement.reorder",
        chapterCardId: "chapter_one",
        orderedIds: ["placement_clock", "placement_letter"]
      }
    ]);
    expect(
      mutations.deleteNarrativePlacement("placement_clock", true).operations[0]
    ).toEqual({
      type: "placement.delete",
      id: "placement_clock",
      cascade: true
    });
  });

  it("builds foreshadowing thread and beat proposals with safe references", () => {
    const mutations = builder(plotSnapshot());
    expect(
      mutations.createForeshadowing({
        title: "  错误日期  ",
        coreQuestion: "日历为何快了一天？",
        hiddenTruth: "寄信人提前撕掉了一页日历。",
        plannedSpan: "within_volume",
        truthEventId: "event_letter",
        expectedReaderEffect: "怀疑叙述时间。",
        status: "planned"
      }).operations[0]
    ).toMatchObject({
      type: "foreshadowing.create",
      thread: {
        id: "foreshadow_generated",
        title: "错误日期",
        hiddenTruth: "寄信人提前撕掉了一页日历。",
        plannedSpan: "within_volume",
        truthEventId: "event_letter",
        status: "planned",
        beats: []
      }
    });
    expect(
      mutations.updateForeshadowing("foreshadow_bell", {
        hiddenTruth: "钟声来自地下机关。",
        plannedSpan: "cross_volume",
        truthEventId: null,
        status: "abandoned"
      }).operations
    ).toEqual([
      {
        type: "foreshadowing.update",
        id: "foreshadow_bell",
        patch: {
          hiddenTruth: "钟声来自地下机关。",
          plannedSpan: "cross_volume",
          truthEventId: null,
          status: "abandoned"
        }
      }
    ]);
    expect(
      mutations.reorderForeshadowing("foreshadow_letter", "up").operations
    ).toEqual([
      {
        type: "foreshadowing.reorder",
        orderedIds: ["foreshadow_letter", "foreshadow_bell"]
      }
    ]);
    expect(
      mutations.createForeshadowingBeat({
        threadId: "foreshadow_letter",
        type: "plant",
        arcId: "arc_letter",
        placementId: "placement_letter",
        eventId: "event_letter",
        chapterCardId: "chapter_one",
        note: "刻意露出笔锋。"
      }).operations
    ).toEqual([
      {
        type: "foreshadowingBeat.create",
        threadId: "foreshadow_letter",
        beat: {
          id: "beat_generated",
          type: "plant",
          order: 1,
          arcId: "arc_letter",
          eventId: "event_letter",
          placementId: "placement_letter",
          chapterCardId: "chapter_one",
          plannedScope: "",
          note: "刻意露出笔锋。",
          status: "planned",
          commitId: null
        }
      }
    ]);
    expect(
      mutations.createForeshadowingBeat({
        threadId: "foreshadow_letter",
        type: "reinforce",
        volumeId: "volume_two",
        plannedScope: "",
        note: "第二卷待落剧情点。"
      }).operations[0]
    ).toMatchObject({
      type: "foreshadowingBeat.create",
      beat: {
        volumeId: "volume_two",
        note: "第二卷待落剧情点。"
      }
    });
    expect(
      mutations.updateForeshadowingBeat("beat_bell_reinforce", {
        threadId: "foreshadow_letter",
        type: "reinforce",
        volumeId: null,
        arcId: "arc_clock",
        note: "再次出现。"
      }).operations
    ).toEqual([
      {
        type: "foreshadowingBeat.update",
        id: "beat_bell_reinforce",
        patch: {
          type: "reinforce",
          volumeId: null,
          arcId: "arc_clock",
          note: "再次出现。"
        }
      },
      {
        type: "foreshadowingBeat.move",
        id: "beat_bell_reinforce",
        toThreadId: "foreshadow_letter"
      }
    ]);
    expect(
      mutations.reorderForeshadowingBeat(
        "beat_bell_reinforce",
        "up"
      ).operations
    ).toEqual([
      {
        type: "foreshadowingBeat.reorder",
        threadId: "foreshadow_bell",
        orderedIds: ["beat_bell_reinforce", "beat_bell_plant"]
      }
    ]);
    expect(
      mutations.deleteForeshadowing("foreshadow_bell", true).operations[0]
    ).toEqual({
      type: "foreshadowing.delete",
      id: "foreshadow_bell",
      cascade: true
    });
    expect(
      mutations.deleteForeshadowingBeat("beat_bell_plant").operations[0]
    ).toEqual({
      type: "foreshadowingBeat.delete",
      id: "beat_bell_plant",
      cascade: false
    });
    expect(() =>
      mutations.createForeshadowingBeat({
        threadId: "foreshadow_letter",
        type: "plant"
      })
    ).toThrow(
      "needs a volume, plot point, event, placement, chapter, or planned scope"
    );
    expect(() =>
      mutations.createForeshadowingBeat({
        threadId: "foreshadow_letter",
        type: "plant",
        volumeId: "volume_two",
        eventId: "event_letter"
      })
    ).toThrow(
      "planning volume must match its concrete event"
    );
  });

  it("produces plot proposals accepted by the shared impact preview engine", () => {
    const workspace = plotSnapshot();
    const mutations = builder(workspace);
    const proposals = [
      mutations.createStoryEvent({
        title: "黎明",
        timeMode: "exact",
        timeLabel: "清晨",
        timeValue: "1897-06-05T05:00:00"
      }),
      mutations.updateStoryEvent("event_letter", {
        summary: "更新摘要",
        timeValue: "1897-06-03T23:30:00"
      }),
      mutations.createEventConnection({
        sourceEventId: "event_clock",
        targetEventId: "event_letter",
        type: "conceals"
      }),
      mutations.createNarrativePlacement({
        eventId: "event_clock",
        chapterCardId: "chapter_two",
        mode: "retelling",
        disclosure: "partial"
      }),
      mutations.createForeshadowing({
        title: "手套",
        truthEventId: "event_letter"
      }),
      mutations.createForeshadowingBeat({
        threadId: "foreshadow_letter",
        type: "plant",
        plannedScope: "第二卷开篇"
      })
    ];
    for (const proposal of proposals) {
      expect(() =>
        previewLongWorkspaceOperations(workspace, proposal)
      ).not.toThrow();
    }
  });
});
