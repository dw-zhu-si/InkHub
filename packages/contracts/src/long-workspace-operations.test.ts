import { describe, expect, it } from "vitest";
import {
  LONG_BOOK_LINE_FILE_ID,
  LongWorkspaceIndexSnapshotSchema,
  LongWorkspaceOperationBatchSchema,
  LongWorkspaceOperationError,
  applyLongWorkspaceOperations,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterCharacterContinuityFilePath,
  longChapterCharacterCurrentStateFileId,
  longChapterCharacterHistoryFileId,
  longChapterCharacterStateFileId,
  longChapterContinuityFilePath,
  longChapterWorldRevealsFileId,
  longChapterHandoffFileId,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  longLedgerCommitFileId,
  longWorldbuildingFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  previewLongWorkspaceOperations
} from "./index";
import type {
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperation,
  LongWorkspaceOperationErrorCode
} from "./index";

const now = "2026-07-26T12:00:00.000Z";
const later = "2026-07-26T12:05:00.000Z";
const revision = "v1:0:00000000";

function file(id: string, path: string, updatedAt = now) {
  return { id, path, revision, updatedAt };
}

function characterFiles(characterId: string, slug: string) {
  return {
    characterId,
    coreProfile: file(
      longCharacterCoreProfileFileId(characterId),
      `long/characters/${slug}/core-profile.md`
    ),
    relationships: file(
      longCharacterRelationshipsFileId(characterId),
      `long/characters/${slug}/relationships.md`
    ),
    currentState: file(
      longCharacterCurrentStateFileId(characterId),
      `long/characters/${slug}/current-state.md`
    ),
    history: file(
      longCharacterHistoryFileId(characterId),
      `long/characters/${slug}/history.md`
    )
  };
}

function chapterFiles(chapterCardId: string, slug: string) {
  return {
    chapterCardId,
    body: file(
      longChapterBodyFileId(chapterCardId),
      `long/chapters/${slug}/body.md`
    ),
    card: file(
      longChapterCardFileId(chapterCardId),
      `long/chapters/${slug}/card.md`
    ),
    characterState: file(
      longChapterCharacterStateFileId(chapterCardId),
      `long/chapters/${slug}/character-state.md`
    ),
    handoff: file(
      longChapterHandoffFileId(chapterCardId),
      `long/chapters/${slug}/handoff.md`
    ),
    commitId: null
  };
}

function workspace(): LongWorkspaceIndexSnapshot {
  return LongWorkspaceIndexSnapshotSchema.parse({
    schemaVersion: 1,
    revision: 7,
    bookId: "longbook_operations",
    updatedAt: now,
    bookLine: file(LONG_BOOK_LINE_FILE_ID, "long/plot/book-line.md"),
    worldbuilding: [],
    characters: [
      {
        id: "character_alice",
        name: "林岚",
        group: "protagonist",
        order: 1,
        aliases: []
      }
    ],
    characterFiles: [characterFiles("character_alice", "alice")],
    plot: {
      volumes: [
        {
          id: "volume_one",
          title: "第一卷",
          order: 1,
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
          primaryArcId: "arc_letter",
          title: "旧钟楼",
          narrativeOrder: 2
        }
      ],
      storyEvents: [
        {
          id: "event_letter",
          title: "收到来信",
          summary: "",
          timeMode: "sequence",
          timeLabel: "第一天",
          storyOrder: 1,
          location: "林岚家",
          arcIds: ["arc_letter"],
          characterIds: ["character_alice"]
        }
      ],
      eventConnections: [],
      narrativePlacements: [],
      foreshadowing: []
    },
    chapters: [
      chapterFiles("chapter_one", "one"),
      chapterFiles("chapter_two", "two")
    ],
    ledger: {
      committedThroughChapterId: null,
      commits: []
    }
  });
}

function committedWorkspace(): LongWorkspaceIndexSnapshot {
  const value = workspace();
  value.chapters[0]!.commitId = "commit_first";
  value.ledger.committedThroughChapterId = "chapter_one";
  value.ledger.commits.push({
    id: "commit_first",
    mode: "structured",
    sequence: 1,
    chapterCardId: "chapter_one",
    committedAt: now,
    reversible: true,
    sourceRevision: value.revision,
    placementIds: [],
    foreshadowingBeatIds: [],
    recordFile: file(
      longLedgerCommitFileId("commit_first"),
      "long/ledger/commit-first.json"
    )
  });
  return LongWorkspaceIndexSnapshotSchema.parse(value);
}

function committedForeshadowingWorkspace(): LongWorkspaceIndexSnapshot {
  const value = committedWorkspace();
  value.plot.narrativePlacements.push({
    id: "placement_letter",
    eventId: "event_letter",
    chapterCardId: "chapter_one",
    orderInChapter: 1,
    mode: "scene",
    disclosure: "hint",
    writingPrompt: "",
    status: "committed",
    commitId: "commit_first"
  });
  value.plot.foreshadowing.push({
    id: "foreshadow_letter",
    title: "寄信人身份",
    coreQuestion: "谁寄出了来信？",
    truthEventId: "event_letter",
    expectedReaderEffect: "持续怀疑寄信人。",
    status: "open",
    beats: [
      {
        id: "beat_letter",
        type: "plant",
        order: 1,
        eventId: "event_letter",
        placementId: "placement_letter",
        chapterCardId: "chapter_one",
        plannedScope: "",
        note: "信封留下第一条线索。",
        status: "committed",
        commitId: "commit_first"
      }
    ]
  });
  value.ledger.commits[0]!.placementIds = ["placement_letter"];
  value.ledger.commits[0]!.foreshadowingBeatIds = ["beat_letter"];
  return LongWorkspaceIndexSnapshotSchema.parse(value);
}

function committedAnchorWorkspace(): LongWorkspaceIndexSnapshot {
  const value = committedForeshadowingWorkspace();
  value.plot.volumes[0]!.order = 2;
  value.plot.volumes.unshift({
    id: "volume_setup",
    title: "序卷",
    order: 1,
    summary: ""
  });
  value.plot.volumes.push(
    { id: "volume_tail_a", title: "尾卷甲", order: 3, summary: "" },
    { id: "volume_tail_b", title: "尾卷乙", order: 4, summary: "" }
  );

  value.plot.arcs[0]!.order = 2;
  value.plot.arcs.unshift(
    {
      id: "arc_movable",
      volumeId: "volume_setup",
      title: "可移动弧",
      order: 1,
      outline: ""
    },
    {
      id: "arc_setup",
      volumeId: "volume_one",
      title: "前置弧",
      order: 1,
      outline: ""
    }
  );
  value.plot.arcs.push(
    {
      id: "arc_tail_a",
      volumeId: "volume_one",
      title: "尾弧甲",
      order: 3,
      outline: ""
    },
    {
      id: "arc_tail_b",
      volumeId: "volume_one",
      title: "尾弧乙",
      order: 4,
      outline: ""
    }
  );

  value.plot.storyEvents[0]!.storyOrder = 2;
  value.plot.storyEvents.unshift({
    id: "event_setup",
    title: "前置事件",
    summary: "",
    timeMode: "sequence",
    timeLabel: "",
    storyOrder: 1,
    location: "",
    arcIds: ["arc_setup"],
    characterIds: []
  });
  value.plot.storyEvents.push(
    {
      id: "event_committed_second",
      title: "已提交的第二事件",
      summary: "",
      timeMode: "sequence",
      timeLabel: "",
      storyOrder: 3,
      location: "",
      arcIds: ["arc_letter"],
      characterIds: ["character_alice"]
    },
    {
      id: "event_tail_a",
      title: "尾部事件甲",
      summary: "",
      timeMode: "sequence",
      timeLabel: "",
      storyOrder: 4,
      location: "",
      arcIds: ["arc_tail_a"],
      characterIds: []
    },
    {
      id: "event_tail_b",
      title: "尾部事件乙",
      summary: "",
      timeMode: "sequence",
      timeLabel: "",
      storyOrder: 5,
      location: "",
      arcIds: ["arc_tail_b"],
      characterIds: []
    }
  );

  const committedThread = value.plot.foreshadowing[0]!;
  committedThread.status = "progressing";
  committedThread.beats[0]!.order = 2;
  committedThread.beats.unshift({
    id: "beat_setup",
    type: "source",
    order: 1,
    eventId: "event_setup",
    placementId: null,
    chapterCardId: "chapter_two",
    plannedScope: "",
    note: "尚未提交的前置规划。",
    status: "planned",
    commitId: null
  });
  committedThread.beats.push(
    {
      id: "beat_committed_second",
      type: "reinforce",
      order: 3,
      eventId: "event_committed_second",
      placementId: null,
      chapterCardId: "chapter_one",
      plannedScope: "",
      note: "已提交的强化节拍。",
      status: "committed",
      commitId: "commit_first"
    },
    {
      id: "beat_tail_a",
      type: "reveal",
      order: 4,
      eventId: "event_tail_a",
      placementId: null,
      chapterCardId: "chapter_two",
      plannedScope: "",
      note: "尾部规划甲。",
      status: "planned",
      commitId: null
    },
    {
      id: "beat_tail_b",
      type: "payoff",
      order: 5,
      eventId: "event_tail_b",
      placementId: null,
      chapterCardId: "chapter_two",
      plannedScope: "",
      note: "尾部规划乙。",
      status: "planned",
      commitId: null
    }
  );
  value.plot.foreshadowing.unshift({
    id: "foreshadow_setup",
    title: "前置伏笔线",
    coreQuestion: "",
    truthEventId: null,
    expectedReaderEffect: "",
    status: "planned",
    beats: [
      {
        id: "beat_movable",
        type: "source",
        order: 1,
        eventId: "event_setup",
        placementId: null,
        chapterCardId: "chapter_two",
        plannedScope: "",
        note: "可移动节拍。",
        status: "planned",
        commitId: null
      }
    ]
  });
  value.plot.foreshadowing.push(
    {
      id: "foreshadow_tail_a",
      title: "尾部伏笔线甲",
      coreQuestion: "",
      truthEventId: null,
      expectedReaderEffect: "",
      status: "planned",
      beats: []
    },
    {
      id: "foreshadow_tail_b",
      title: "尾部伏笔线乙",
      coreQuestion: "",
      truthEventId: null,
      expectedReaderEffect: "",
      status: "planned",
      beats: []
    }
  );
  value.ledger.commits[0]!.foreshadowingBeatIds.push(
    "beat_committed_second"
  );
  return LongWorkspaceIndexSnapshotSchema.parse(value);
}

function expectOperationError(
  run: () => unknown,
  code: LongWorkspaceOperationErrorCode
): void {
  try {
    run();
    throw new Error("Expected a long workspace operation error.");
  } catch (error) {
    expect(error).toBeInstanceOf(LongWorkspaceOperationError);
    expect((error as LongWorkspaceOperationError).code).toBe(code);
  }
}

function createBatch() {
  const newWorldFile = file(
    longWorldbuildingFileId("world_magic"),
    "long/worldbuilding/magic.md",
    later
  );
  const newCharacterFiles = characterFiles("character_bob", "bob");
  Object.values(newCharacterFiles)
    .filter(
      (value): value is ReturnType<typeof file> =>
        typeof value === "object"
    )
    .forEach((value) => {
      value.updatedAt = later;
    });
  const newChapterFiles = chapterFiles("chapter_three", "three");
  [
    newChapterFiles.body,
    newChapterFiles.card,
    newChapterFiles.characterState,
    newChapterFiles.handoff
  ].forEach(
    (value) => {
      value.updatedAt = later;
    }
  );

  return LongWorkspaceOperationBatchSchema.parse({
    baseRevision: 7,
    updatedAt: later,
    operations: [
      {
        type: "worldbuilding.create",
        provisionalId: "provisional_world",
        category: {
          id: "world_magic",
          title: "魔法规则",
          order: 99,
          format: "text",
          contentAuthority: "markdown",
          file: newWorldFile
        }
      },
      {
        type: "character.create",
        provisionalId: "provisional_character",
        character: {
          id: "character_bob",
          name: "周野",
          group: "major_supporting",
          order: 99,
          aliases: []
        },
        files: newCharacterFiles
      },
      {
        type: "volume.create",
        provisionalId: "provisional_volume",
        volume: {
          id: "volume_two",
          title: "第二卷",
          order: 99,
          summary: ""
        }
      },
      {
        type: "arc.create",
        arc: {
          id: "arc_tower",
          volumeId: "volume_two",
          title: "钟楼之谜",
          order: 99,
          outline: ""
        }
      },
      {
        type: "chapter.create",
        provisionalId: "provisional_chapter",
        chapterCard: {
          id: "chapter_three",
          volumeId: "volume_two",
          primaryArcId: "arc_tower",
          title: "钟声",
          narrativeOrder: 99
        },
        files: newChapterFiles
      },
      {
        type: "event.create",
        event: {
          id: "event_bell",
          title: "钟声响起",
          summary: "",
          timeMode: "sequence",
          timeLabel: "第二天",
          storyOrder: 99,
          location: "旧钟楼",
          arcIds: ["arc_tower"],
          characterIds: ["character_bob"]
        }
      },
      {
        type: "connection.create",
        connection: {
          id: "connection_letter_enables_bell",
          sourceEventId: "event_letter",
          targetEventId: "event_bell",
          type: "enables",
          note: ""
        }
      },
      {
        type: "placement.create",
        placement: {
          id: "placement_bell",
          eventId: "event_bell",
          chapterCardId: "chapter_three",
          orderInChapter: 99,
          mode: "scene",
          disclosure: "full",
          writingPrompt: "",
          status: "planned",
          commitId: null
        }
      },
      {
        type: "foreshadowing.create",
        thread: {
          id: "foreshadow_bell",
          title: "钟声来源",
          coreQuestion: "是谁敲响钟声？",
          truthEventId: "event_bell",
          expectedReaderEffect: "",
          status: "planned",
          beats: []
        }
      },
      {
        type: "foreshadowingBeat.create",
        provisionalId: "provisional_beat",
        threadId: "foreshadow_bell",
        beat: {
          id: "beat_bell_plant",
          type: "plant",
          order: 99,
          eventId: "event_bell",
          placementId: "placement_bell",
          chapterCardId: "chapter_three",
          plannedScope: "",
          note: "",
          status: "planned",
          commitId: null
        }
      },
      {
        type: "volume.update",
        id: "volume_two",
        patch: { title: "钟楼卷" }
      }
    ],
    documentWrites: [
      {
        proposalId: "proposal_world_magic",
        fileId: newWorldFile.id,
        mode: "create",
        expectedRevision: null,
        nextRevision: newWorldFile.revision,
        updatedAt: later,
        content: "# 魔法规则\n",
        reason: "初始化世界规则分类"
      }
    ]
  });
}

describe("long workspace operation engine", () => {
  it("defaults old projects to top tabs and updates per-book feature settings", () => {
    const source = workspace();
    expect(source.featureSettings.worldbuildingItemLayout).toBe("top-tabs");
    expect(source.featureSettings.characterAndContinuityItemLayout).toBe(
      "top-tabs"
    );
    expect(source.featureSettings.plotItemLayout).toBe("top-tabs");

    const result = applyLongWorkspaceOperations(
      source,
      LongWorkspaceOperationBatchSchema.parse({
        baseRevision: source.revision,
        updatedAt: later,
        operations: [
          {
            type: "featureSettings.update",
            patch: {
              worldbuildingItemLayout: "left-tree",
              characterAndContinuityItemLayout: "left-tree",
              plotItemLayout: "left-tree"
            }
          }
        ]
      })
    );

    expect(result.snapshot.featureSettings.worldbuildingItemLayout).toBe(
      "left-tree"
    );
    expect(
      result.snapshot.featureSettings.characterAndContinuityItemLayout
    ).toBe("left-tree");
    expect(result.snapshot.featureSettings.plotItemLayout).toBe("left-tree");
    expect(result.fileIntents).toEqual([]);
    expect(result.documentWrites).toEqual([]);
  });

  it("applies typed cross-entity CRUD and returns only file/document intentions", () => {
    const source = workspace();
    const result = applyLongWorkspaceOperations(source, createBatch());

    expect(source.revision).toBe(7);
    expect(source.plot.volumes).toHaveLength(1);
    expect(result.resultRevision).toBe(8);
    expect(result.snapshot.plot.volumes.map(({ order }) => order)).toEqual([
      1,
      2
    ]);
    expect(result.snapshot.plot.volumes[1]?.title).toBe("钟楼卷");
    expect(result.snapshot.plot.arcs.find(({ id }) => id === "arc_tower")?.order).toBe(
      1
    );
    expect(
      result.snapshot.plot.chapterCards.find(({ id }) => id === "chapter_three")
        ?.narrativeOrder
    ).toBe(1);
    expect(
      result.snapshot.plot.narrativePlacements.find(
        ({ id }) => id === "placement_bell"
      )?.orderInChapter
    ).toBe(1);
    expect(result.fileIntents.filter(({ action }) => action === "create")).toHaveLength(
      10
    );
    expect(result.documentWrites[0]?.content).toContain("魔法规则");
    expect(result.entityChanges).toHaveLength(
      result.impact.createdEntityIds.length +
        result.impact.updatedEntityIds.length +
        result.impact.deletedEntityIds.length
    );
    expect(
      result.entityChanges.find(({ id }) => id === "volume_two")
    ).toMatchObject({
      kind: "volume",
      action: "create",
      before: null,
      after: expect.objectContaining({ title: "钟楼卷", order: 2 })
    });
    expect(result.provisionalIdMap).toMatchObject({
      provisional_world: "world_magic",
      provisional_character: "character_bob",
      provisional_volume: "volume_two",
      provisional_chapter: "chapter_three",
      provisional_beat: "beat_bell_plant"
    });
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(result.snapshot).success
    ).toBe(true);

    const deletedConnection = applyLongWorkspaceOperations(
      result.snapshot,
      LongWorkspaceOperationBatchSchema.parse({
        baseRevision: 8,
        updatedAt: later,
        operations: [
          {
            type: "connection.delete",
            id: "connection_letter_enables_bell",
            cascade: false
          }
        ]
      })
    );
    expect(deletedConnection.snapshot.plot.eventConnections).toHaveLength(0);
    expect(deletedConnection.impact.deletedEntityIds).toContain(
      "connection_letter_enables_bell"
    );
  });

  it("adds an overview file to every newly-created list worldbuilding category", () => {
    const source = workspace();
    const result = applyLongWorkspaceOperations(
      source,
      LongWorkspaceOperationBatchSchema.parse({
        baseRevision: source.revision,
        updatedAt: later,
        operations: [{
          type: "worldbuilding.create",
          category: {
            id: "world_geography",
            title: "地理",
            order: source.worldbuilding.length + 1,
            format: "list",
            contentAuthority: "files",
            items: []
          }
        }]
      })
    );
    const category = result.snapshot.worldbuilding.find(
      ({ id }) => id === "world_geography"
    );
    expect(category).toMatchObject({
      format: "list",
      overview: {
        id: longWorldbuildingOverviewFileId("world_geography"),
        path: longWorldbuildingOverviewContentPath("world_geography")
      }
    });
    expect(result.fileIntents).toContainEqual(
      expect.objectContaining({
        action: "create",
        file: expect.objectContaining({
          id: longWorldbuildingOverviewFileId("world_geography")
        })
      })
    );
  });

  it("creates optional chapter continuity files and deletes them with the chapter", () => {
    const source = workspace();
    const currentState = file(
      longChapterCharacterCurrentStateFileId(
        "chapter_one",
        "character_alice"
      ),
      longChapterCharacterContinuityFilePath(
        "chapter_one",
        "character_alice",
        "current-state.md"
      ),
      later
    );
    const history = file(
      longChapterCharacterHistoryFileId(
        "chapter_one",
        "character_alice"
      ),
      longChapterCharacterContinuityFilePath(
        "chapter_one",
        "character_alice",
        "history.md"
      ),
      later
    );
    const worldReveals = file(
      longChapterWorldRevealsFileId("chapter_one"),
      longChapterContinuityFilePath("chapter_one", "world-reveals.md"),
      later
    );
    const created = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "chapterContinuity.worldReveals.create",
          chapterCardId: "chapter_one",
          file: worldReveals
        },
        {
          type: "chapterContinuity.character.create",
          chapterCardId: "chapter_one",
          characterId: "character_alice",
          currentState,
          history
        }
      ]
    });
    expect(created.fileIntents).toHaveLength(3);
    expect(created.snapshot.chapters[0]).toMatchObject({
      worldReveals: { id: worldReveals.id },
      characterContinuity: [
        {
          characterId: "character_alice",
          currentState: { id: currentState.id },
          history: { id: history.id }
        }
      ]
    });

    const characterDeleteBatch = {
      baseRevision: created.resultRevision,
      updatedAt: later,
      operations: [
        { type: "character.delete", id: "character_alice", cascade: true }
      ]
    } satisfies Parameters<typeof previewLongWorkspaceOperations>[1];
    const characterDeletePreview = previewLongWorkspaceOperations(
      created.snapshot,
      characterDeleteBatch
    );
    const deletedCharacter = applyLongWorkspaceOperations(created.snapshot, {
      ...characterDeleteBatch,
      expectedImpact: characterDeletePreview.impact
    });
    expect(deletedCharacter.snapshot.chapters[0]!.characterContinuity).toEqual(
      []
    );
    expect(
      deletedCharacter.fileIntents.filter(
        ({ action, file }) =>
          action === "delete" &&
          (file.id === currentState.id || file.id === history.id)
      )
    ).toHaveLength(2);

    const deleted = applyLongWorkspaceOperations(created.snapshot, {
      baseRevision: created.resultRevision,
      updatedAt: later,
      operations: [
        { type: "chapter.delete", id: "chapter_one", cascade: false }
      ]
    });
    expect(deleted.fileIntents.filter(({ action }) => action === "delete"))
      .toHaveLength(8);
  });

  it("creates custom character types and migrates characters atomically on delete", () => {
    const source = workspace();
    const created = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "characterType.create",
          characterType: {
            id: "chartype_antagonist",
            title: "反派",
            order: source.characterTypes.length + 1
          }
        }
      ]
    });
    expect(created.snapshot.characterTypes.at(-1)).toEqual({
      id: "chartype_antagonist",
      title: "反派",
      order: 5
    });

    const originalFiles = structuredClone(created.snapshot.characterFiles);
    const migrated = applyLongWorkspaceOperations(created.snapshot, {
      baseRevision: created.resultRevision,
      updatedAt: later,
      operations: [
        {
          type: "characterType.delete",
          id: "protagonist",
          moveCharactersToTypeId: "chartype_antagonist"
        }
      ]
    });
    expect(
      migrated.snapshot.characterTypes.some(({ id }) => id === "protagonist")
    ).toBe(false);
    expect(migrated.snapshot.characters[0]).toMatchObject({
      id: "character_alice",
      group: "chartype_antagonist",
      order: 1
    });
    expect(migrated.snapshot.characterFiles).toEqual(originalFiles);

    expect(() =>
      applyLongWorkspaceOperations(created.snapshot, {
        baseRevision: created.resultRevision,
        updatedAt: later,
        operations: [{ type: "characterType.delete", id: "protagonist" }]
      })
    ).toThrow(/requires another target type/u);
  });

  it("deletes only optional continuity files from uncommitted chapters", () => {
    const source = workspace();
    const currentState = file(
      longChapterCharacterCurrentStateFileId(
        "chapter_one",
        "character_alice"
      ),
      longChapterCharacterContinuityFilePath(
        "chapter_one",
        "character_alice",
        "current-state.md"
      ),
      later
    );
    const history = file(
      longChapterCharacterHistoryFileId(
        "chapter_one",
        "character_alice"
      ),
      longChapterCharacterContinuityFilePath(
        "chapter_one",
        "character_alice",
        "history.md"
      ),
      later
    );
    const worldReveals = file(
      longChapterWorldRevealsFileId("chapter_one"),
      longChapterContinuityFilePath(
        "chapter_one",
        "world-reveals.md"
      ),
      later
    );
    const created = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "chapterContinuity.worldReveals.create",
          chapterCardId: "chapter_one",
          file: worldReveals
        },
        {
          type: "chapterContinuity.character.create",
          chapterCardId: "chapter_one",
          characterId: "character_alice",
          currentState,
          history
        }
      ]
    });

    const deleted = applyLongWorkspaceOperations(created.snapshot, {
      baseRevision: created.resultRevision,
      updatedAt: later,
      operations: [
        {
          type: "chapterContinuity.worldReveals.delete",
          chapterCardId: "chapter_one"
        },
        {
          type: "chapterContinuity.character.delete",
          chapterCardId: "chapter_one",
          characterId: "character_alice"
        }
      ]
    });
    expect(deleted.snapshot.chapters[0]).toMatchObject({
      worldReveals: null,
      characterContinuity: []
    });
    const deleteIntents = deleted.fileIntents.map(
      ({ action, file: target }) => [action, target.id]
    );
    expect(deleteIntents).toHaveLength(3);
    expect(deleteIntents).toEqual(
      expect.arrayContaining([
        ["delete", worldReveals.id],
        ["delete", currentState.id],
        ["delete", history.id]
      ])
    );

    const committed = structuredClone(created.snapshot);
    committed.chapters[0]!.commitId = "commit_existing";
    committed.ledger.committedThroughChapterId = "chapter_one";
    committed.ledger.commits.push({
      id: "commit_existing",
      mode: "text_files",
      sequence: 1,
      chapterCardId: "chapter_one",
      committedAt: later,
      reversible: true,
      sourceRevision: committed.revision,
      placementIds: [],
      foreshadowingBeatIds: [],
      recordFile: file(
        longLedgerCommitFileId("commit_existing"),
        "long/ledger/commit-existing.json"
      )
    });
    for (const operation of [
      {
        type: "chapterContinuity.worldReveals.delete" as const,
        chapterCardId: "chapter_one"
      },
      {
        type: "chapterContinuity.character.delete" as const,
        chapterCardId: "chapter_one",
        characterId: "character_alice"
      }
    ]) {
      expect(() =>
        applyLongWorkspaceOperations(structuredClone(committed), {
          baseRevision: committed.revision,
          updatedAt: later,
          operations: [operation]
        })
      ).not.toThrow();
    }

    for (const forbiddenType of [
      "chapterContinuity.body.delete",
      "chapterContinuity.chapterEndState.delete",
      "chapterContinuity.handoff.delete",
      "chapterContinuity.foreshadowingChanges.delete"
    ]) {
      expect(
        LongWorkspaceOperationBatchSchema.safeParse({
          baseRevision: source.revision,
          updatedAt: later,
          operations: [
            { type: forbiddenType, chapterCardId: "chapter_one" }
          ]
        }).success
      ).toBe(false);
    }
  });

  it("rejects deleting referenced entities unless cascade is explicit", () => {
    const source = workspace();
    expectOperationError(
      () =>
        applyLongWorkspaceOperations(
          source,
          LongWorkspaceOperationBatchSchema.parse({
            baseRevision: source.revision,
            updatedAt: later,
            operations: [
              { type: "arc.delete", id: "arc_letter", cascade: false }
            ]
          })
        ),
      "cascade_required"
    );
    expectOperationError(
      () =>
        applyLongWorkspaceOperations(
          source,
          LongWorkspaceOperationBatchSchema.parse({
            baseRevision: source.revision,
            updatedAt: later,
            operations: [
              {
                type: "character.delete",
                id: "character_alice",
                cascade: false
              }
            ]
          })
        ),
      "cascade_required"
    );

    expectOperationError(
      () =>
        applyLongWorkspaceOperations(source, {
          baseRevision: source.revision,
          updatedAt: later,
          operations: [
            {
              type: "connection.create",
              connection: {
                id: "connection_missing_target",
                sourceEventId: "event_letter",
                targetEventId: "event_missing",
                type: "causes",
                note: ""
              }
            }
          ]
        }),
      "invalid_result"
    );
  });

  it("deletes a plot point without cascading through weakly linked chapters", () => {
    const source = workspace();
    source.plot.storyEvents = [];
    source.plot.storyPlots = [];
    source.plot.eventConnections = [];
    source.plot.narrativePlacements = [];
    source.plot.foreshadowing = [];

    const result = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        { type: "arc.delete", id: "arc_letter", cascade: false }
      ]
    });

    expect(result.snapshot.plot.arcs).toEqual([]);
    expect(result.snapshot.plot.chapterCards).toHaveLength(2);
    expect(
      result.snapshot.plot.chapterCards.every(
        ({ volumeId, primaryArcId }) =>
          volumeId === "volume_one" && primaryArcId === null
      )
    ).toBe(true);
    expect(result.snapshot.chapters).toHaveLength(2);
    expect(result.fileIntents).toEqual([]);

    const committed = committedWorkspace();
    committed.plot.storyEvents = [];
    const committedResult = applyLongWorkspaceOperations(committed, {
      baseRevision: committed.revision,
      updatedAt: later,
      operations: [
        { type: "arc.delete", id: "arc_letter", cascade: false }
      ]
    });
    expect(
      committedResult.snapshot.plot.chapterCards.find(
        ({ id }) => id === "chapter_one"
      )?.primaryArcId
    ).toBeNull();
    expect(committedResult.snapshot.chapters[0]!.commitId).toBe("commit_first");
  });

  it("requires an exact preview impact for cascading deletion", () => {
    const source = workspace();
    const plan = LongWorkspaceOperationBatchSchema.parse({
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        { type: "arc.delete", id: "arc_letter", cascade: true }
      ]
    });
    const preview = previewLongWorkspaceOperations(source, plan);

    expect(preview.impact.deletedEntityIds).toEqual(["arc_letter"]);
    expect(preview.impact.updatedEntityIds).toEqual(
      expect.arrayContaining(["chapter_one", "chapter_two", "event_letter"])
    );
    expect(preview.impact.updatedEntityIds).toContain("event_letter");
    expect(preview.impact.deletedFileIds).toHaveLength(0);
    expect(
      preview.entityChanges.find(({ id }) => id === "arc_letter")
    ).toMatchObject({
      kind: "arc",
      action: "delete",
      before: expect.objectContaining({ title: "来信之谜" }),
      after: null
    });
    expect(
      preview.entityChanges.find(({ id }) => id === "event_letter")
    ).toMatchObject({
      kind: "story-event",
      action: "update",
      before: expect.objectContaining({ arcIds: ["arc_letter"] }),
      after: expect.objectContaining({ arcIds: [] })
    });
    expect(
      preview.entityChanges.find(({ id }) => id === "chapter_one")
    ).toMatchObject({
      kind: "chapter-card",
      action: "update",
      before: expect.objectContaining({ primaryArcId: "arc_letter" }),
      after: expect.objectContaining({ primaryArcId: null })
    });
    const applied = applyLongWorkspaceOperations(
      source,
      LongWorkspaceOperationBatchSchema.parse({
        ...plan,
        expectedImpact: preview.impact
      })
    );
    expect(applied.snapshot.plot.chapterCards).toHaveLength(2);
    expect(
      applied.snapshot.plot.chapterCards.every(
        ({ primaryArcId }) => primaryArcId === null
      )
    ).toBe(true);
    expect(applied.snapshot.chapters).toHaveLength(2);

    const staleImpact = structuredClone(preview.impact);
    staleImpact.deletedEntityIds = [];
    expectOperationError(
      () =>
        applyLongWorkspaceOperations(
          source,
          LongWorkspaceOperationBatchSchema.parse({
            ...plan,
            expectedImpact: staleImpact
          })
        ),
      "cascade_impact_mismatch"
    );

    const result = applyLongWorkspaceOperations(
      source,
      LongWorkspaceOperationBatchSchema.parse({
        ...plan,
        expectedImpact: preview.impact
      })
    );
    expect(result.snapshot.plot.arcs).toEqual([]);
    expect(result.snapshot.plot.chapterCards).toHaveLength(2);
    expect(
      result.snapshot.plot.chapterCards.every(
        ({ primaryArcId }) => primaryArcId === null
      )
    ).toBe(true);
    expect(result.snapshot.plot.storyEvents[0]?.arcIds).toEqual([]);
    expect(result.fileIntents).toEqual([]);
  });

  it("reports implicit order shifts and omits no-op metadata updates", () => {
    const source = workspace();
    const deletion = previewLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "chapter.delete",
          id: "chapter_one",
          cascade: true
        }
      ]
    });
    expect(deletion.impact.deletedEntityIds).toContain("chapter_one");
    expect(deletion.impact.updatedEntityIds).toContain("chapter_two");
    expect(
      deletion.entityChanges.find(({ id }) => id === "chapter_two")
    ).toMatchObject({
      action: "update",
      before: expect.objectContaining({ narrativeOrder: 2 }),
      after: expect.objectContaining({ narrativeOrder: 1 })
    });

    const noOp = previewLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "arc.update",
          id: "arc_letter",
          patch: { title: "来信之谜" }
        }
      ]
    });
    expect(noOp.impact.updatedEntityIds).not.toContain("arc_letter");
    expect(noOp.entityChanges).toEqual([]);
  });

  it("keeps recorded chapters structurally mutable and cascades their records", () => {
    const source = committedWorkspace();
    const reordered = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "chapter.reorder",
          volumeId: "volume_one",
          orderedIds: ["chapter_two", "chapter_one"]
        }
      ]
    });
    expect(
      reordered.snapshot.plot.chapterCards
        .filter(({ volumeId }) => volumeId === "volume_one")
        .sort((left, right) => left.narrativeOrder - right.narrativeOrder)
        .map(({ id }) => id)
    ).toEqual(["chapter_two", "chapter_one"]);

    const batch = LongWorkspaceOperationBatchSchema.parse({
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        { type: "chapter.delete", id: "chapter_one", cascade: true }
      ]
    });
    const preview = previewLongWorkspaceOperations(source, batch);
    const deleted = applyLongWorkspaceOperations(source, {
      ...batch,
      expectedImpact: preview.impact
    });
    expect(
      deleted.snapshot.plot.chapterCards.some(({ id }) => id === "chapter_one")
    ).toBe(false);
    expect(deleted.snapshot.ledger.commits).toEqual([]);
    expect(
      deleted.fileIntents.some(
        ({ action, file: target }) =>
          action === "delete" &&
          target.id === longLedgerCommitFileId("commit_first")
      )
    ).toBe(true);
  });

  it("allows structure changes around recorded anchors", () => {
    const source = committedWorkspace();
    const result = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "volume.create",
          volume: {
            id: "volume_prologue",
            title: "序卷",
            summary: "",
            order: 1
          }
        },
        {
          type: "chapter.move",
          id: "chapter_one",
          toVolumeId: "volume_prologue",
          toPrimaryArcId: null
        }
      ]
    });
    expect(
      result.snapshot.plot.chapterCards.find(({ id }) => id === "chapter_one")
    ).toMatchObject({
      volumeId: "volume_prologue",
      primaryArcId: null
    });
    expect(result.snapshot.ledger.commits[0]?.chapterCardId).toBe("chapter_one");
  });

  it("keeps the uncommitted suffix editable after every committed anchor", () => {
    const allowed: Array<{
      label: string;
      operation: LongWorkspaceOperation;
    }> = [
      {
        label: "append volume",
        operation: {
          type: "volume.create",
          volume: {
            id: "volume_appended",
            title: "追加卷",
            order: 99,
            summary: ""
          }
        }
      },
      {
        label: "edit committed arc planning text",
        operation: {
          type: "arc.update",
          id: "arc_letter",
          patch: { outline: "只调整规划文本，不改变结构锚点。" }
        }
      },
      {
        label: "append arc",
        operation: {
          type: "arc.create",
          arc: {
            id: "arc_appended",
            volumeId: "volume_one",
            title: "追加弧",
            order: 99,
            outline: ""
          }
        }
      },
      {
        label: "move arc to suffix",
        operation: {
          type: "arc.move",
          id: "arc_movable",
          toVolumeId: "volume_one"
        }
      },
      {
        label: "append event",
        operation: {
          type: "event.create",
          event: {
            id: "event_appended",
            title: "追加事件",
            summary: "",
            timeMode: "sequence",
            timeLabel: "",
            storyOrder: 99,
            location: "",
            arcIds: ["arc_tail_a"],
            characterIds: []
          }
        }
      },
      {
        label: "create placement in future chapter",
        operation: {
          type: "placement.create",
          placement: {
            id: "placement_future",
            eventId: "event_tail_a",
            chapterCardId: "chapter_two",
            orderInChapter: 99,
            mode: "scene",
            disclosure: "hint",
            writingPrompt: "",
            status: "planned",
            commitId: null
          }
        }
      },
      {
        label: "append beat",
        operation: {
          type: "foreshadowingBeat.create",
          threadId: "foreshadow_letter",
          beat: {
            id: "beat_appended",
            type: "aftermath",
            order: 99,
            eventId: "event_tail_a",
            placementId: null,
            chapterCardId: "chapter_two",
            plannedScope: "",
            note: "",
            status: "planned",
            commitId: null
          }
        }
      },
      {
        label: "connect committed event to future event",
        operation: {
          type: "connection.create",
          connection: {
            id: "connection_future",
            sourceEventId: "event_letter",
            targetEventId: "event_tail_a",
            type: "enables",
            note: ""
          }
        }
      },
      {
        label: "reorder volume suffix",
        operation: {
          type: "volume.reorder",
          orderedIds: [
            "volume_setup",
            "volume_one",
            "volume_tail_b",
            "volume_tail_a"
          ]
        }
      },
      {
        label: "reorder arc suffix",
        operation: {
          type: "arc.reorder",
          volumeId: "volume_one",
          orderedIds: [
            "arc_setup",
            "arc_letter",
            "arc_tail_b",
            "arc_tail_a"
          ]
        }
      },
      {
        label: "reorder event suffix",
        operation: {
          type: "event.reorder",
          orderedIds: [
            "event_setup",
            "event_letter",
            "event_committed_second",
            "event_tail_b",
            "event_tail_a"
          ]
        }
      },
      {
        label: "reorder beat suffix",
        operation: {
          type: "foreshadowingBeat.reorder",
          threadId: "foreshadow_letter",
          orderedIds: [
            "beat_setup",
            "beat_letter",
            "beat_committed_second",
            "beat_tail_b",
            "beat_tail_a"
          ]
        }
      },
      {
        label: "reorder thread suffix",
        operation: {
          type: "foreshadowing.reorder",
          orderedIds: [
            "foreshadow_setup",
            "foreshadow_letter",
            "foreshadow_tail_b",
            "foreshadow_tail_a"
          ]
        }
      }
    ];

    for (const { label, operation } of allowed) {
      const source = committedAnchorWorkspace();
      expect(
        () =>
          applyLongWorkspaceOperations(source, {
            baseRevision: source.revision,
            updatedAt: later,
            operations: [operation]
          }),
        label
      ).not.toThrow();
    }
  });

  it("requires new foreshadowing threads to start planned", () => {
    const source = workspace();
    expectOperationError(
      () =>
        applyLongWorkspaceOperations(source, {
          baseRevision: source.revision,
          updatedAt: later,
          operations: [
            {
              type: "foreshadowing.create",
              thread: {
                id: "foreshadow_invalid",
                title: "错误初始状态",
                coreQuestion: "",
                truthEventId: null,
                expectedReaderEffect: "",
                status: "abandoned",
                beats: []
              }
            }
          ]
        }),
      "committed_prefix_protected"
    );
  });

  it("creates, refines, and cascades typed foreshadowing planning anchors", () => {
    const source = workspace();
    const created = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "foreshadowing.create",
          thread: {
            id: "foreshadow_identity",
            title: "寄信人身份",
            coreQuestion: "寄信人究竟是谁？",
            hiddenTruth: "寄信人是林岚失踪的兄长。",
            plannedSpan: "cross_volume",
            truthEventId: null,
            expectedReaderEffect: "先怀疑管家，再回看兄长留下的暗号。",
            status: "planned",
            beats: []
          }
        },
        {
          type: "foreshadowingBeat.create",
          threadId: "foreshadow_identity",
          beat: {
            id: "beat_identity_plant",
            type: "plant",
            order: 1,
            volumeId: "volume_one",
            arcId: null,
            eventId: null,
            placementId: null,
            chapterCardId: null,
            plannedScope: "",
            note: "卷内待选择具体剧情点。",
            status: "planned",
            commitId: null
          }
        }
      ]
    });
    expect(created.snapshot.plot.foreshadowing[0]).toMatchObject({
      hiddenTruth: "寄信人是林岚失踪的兄长。",
      plannedSpan: "cross_volume",
      beats: [{ volumeId: "volume_one", arcId: null }]
    });

    const refined = applyLongWorkspaceOperations(created.snapshot, {
      baseRevision: created.resultRevision,
      updatedAt: later,
      operations: [
        {
          type: "foreshadowingBeat.update",
          id: "beat_identity_plant",
          patch: {
            volumeId: null,
            arcId: "arc_letter",
            note: "已经细化到“来信之谜”剧情点。"
          }
        }
      ]
    });
    expect(
      refined.snapshot.plot.foreshadowing[0]!.beats[0]
    ).toMatchObject({
      volumeId: null,
      arcId: "arc_letter",
      note: "已经细化到“来信之谜”剧情点。"
    });

    expectOperationError(
      () =>
        applyLongWorkspaceOperations(refined.snapshot, {
          baseRevision: refined.resultRevision,
          updatedAt: later,
          operations: [
            {
              type: "arc.delete",
              id: "arc_letter",
              cascade: false
            }
          ]
        }),
      "cascade_required"
    );

    const deletePlan = LongWorkspaceOperationBatchSchema.parse({
      baseRevision: refined.resultRevision,
      updatedAt: later,
      operations: [
        {
          type: "arc.delete",
          id: "arc_letter",
          cascade: true
        }
      ]
    });
    const deletePreview = previewLongWorkspaceOperations(
      refined.snapshot,
      deletePlan
    );
    expect(deletePreview.impact.deletedEntityIds).toContain(
      "beat_identity_plant"
    );
    const deleted = applyLongWorkspaceOperations(
      refined.snapshot,
      LongWorkspaceOperationBatchSchema.parse({
        ...deletePlan,
        expectedImpact: deletePreview.impact
      })
    );
    expect(
      deleted.snapshot.plot.foreshadowing[0]!.beats
    ).toHaveLength(0);
  });

  it("keeps typed foreshadowing anchors aligned when their plot context moves", () => {
    const secondVolume = {
      id: "volume_two",
      title: "第二卷",
      order: 2,
      summary: ""
    } as const;
    const secondArc = {
      id: "arc_two",
      volumeId: "volume_two",
      title: "第二卷主线",
      order: 1,
      outline: ""
    } as const;
    const planningThread = (
      beat: LongWorkspaceIndexSnapshot["plot"]["foreshadowing"][number]["beats"][number]
    ): LongWorkspaceIndexSnapshot["plot"]["foreshadowing"][number] => ({
      id: "foreshadow_moving",
      title: "移动中的线索",
      coreQuestion: "线索最终落在哪里？",
      truthEventId: null,
      expectedReaderEffect: "位置变化后仍保持同一条伏笔线。",
      status: "planned",
      beats: [beat]
    });

    const arcSource = workspace();
    arcSource.plot.volumes.push(secondVolume);
    arcSource.plot.arcs.push({
      id: "arc_stays_in_volume_one",
      volumeId: "volume_one",
      title: "仍在第一卷的支线",
      order: 2,
      outline: ""
    });
    arcSource.plot.storyEvents[0]!.arcIds.push(
      "arc_stays_in_volume_one"
    );
    arcSource.plot.chapterCards[0]!.primaryArcId =
      "arc_stays_in_volume_one";
    arcSource.plot.storyEvents.push({
      id: "event_follows_moved_arc",
      title: "跟随主线移动的事件",
      summary: "",
      timeMode: "sequence",
      timeLabel: "",
      storyOrder: 2,
      location: "",
      arcIds: ["arc_letter"],
      characterIds: []
    });
    const arcThread = planningThread({
      id: "beat_follows_arc",
      type: "plant",
      order: 1,
      volumeId: "volume_one",
      arcId: null,
      eventId: null,
      placementId: null,
      chapterCardId: "chapter_two",
      plannedScope: "",
      note: "",
      status: "planned",
      commitId: null
    });
    arcThread.beats.push(
      {
        id: "beat_follows_event",
        type: "reinforce",
        order: 2,
        volumeId: "volume_one",
        arcId: null,
        eventId: "event_follows_moved_arc",
        placementId: null,
        chapterCardId: null,
        plannedScope: "",
        note: "",
        status: "planned",
        commitId: null
      },
      {
        id: "beat_stays_with_multiarc_event",
        type: "misdirect",
        order: 3,
        volumeId: "volume_one",
        arcId: null,
        eventId: "event_letter",
        placementId: null,
        chapterCardId: null,
        plannedScope: "",
        note: "",
        status: "planned",
        commitId: null
      },
      {
        id: "beat_clears_conflicting_event_volume",
        type: "partial_reveal",
        order: 4,
        volumeId: "volume_one",
        arcId: null,
        eventId: "event_follows_moved_arc",
        placementId: null,
        chapterCardId: "chapter_one",
        plannedScope: "",
        note: "",
        status: "planned",
        commitId: null
      }
    );
    arcSource.plot.foreshadowing.push(arcThread);
    const movedArc = applyLongWorkspaceOperations(arcSource, {
      baseRevision: arcSource.revision,
      updatedAt: later,
      operations: [
        {
          type: "arc.move",
          id: "arc_letter",
          toVolumeId: "volume_two"
        }
      ]
    });
    expect(movedArc.snapshot.plot.chapterCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "chapter_one",
          volumeId: "volume_one",
          primaryArcId: "arc_stays_in_volume_one"
        }),
        expect.objectContaining({
          id: "chapter_two",
          volumeId: "volume_one",
          primaryArcId: null
        })
      ])
    );
    expect(movedArc.snapshot.chapters).toHaveLength(2);
    expect(
      movedArc.snapshot.plot.foreshadowing[0]!.beats[0]
    ).toMatchObject({
      volumeId: "volume_one",
      arcId: null
    });
    expect(
      movedArc.snapshot.plot.foreshadowing[0]!.beats[1]
    ).toMatchObject({
      volumeId: "volume_two",
      eventId: "event_follows_moved_arc"
    });
    expect(
      movedArc.snapshot.plot.foreshadowing[0]!.beats[2]
    ).toMatchObject({
      volumeId: "volume_one",
      eventId: "event_letter"
    });
    expect(
      movedArc.snapshot.plot.foreshadowing[0]!.beats[3]
    ).toMatchObject({
      volumeId: null,
      eventId: "event_follows_moved_arc",
      chapterCardId: "chapter_one"
    });

    const chapterSource = workspace();
    chapterSource.plot.volumes.push(secondVolume);
    chapterSource.plot.arcs.push(secondArc);
    const chapterThread = planningThread({
      id: "beat_follows_chapter",
      type: "reinforce",
      order: 1,
      volumeId: "volume_one",
      arcId: "arc_letter",
      eventId: null,
      placementId: null,
      chapterCardId: "chapter_two",
      plannedScope: "",
      note: "",
      status: "planned",
      commitId: null
    });
    chapterThread.beats.push({
      id: "beat_clears_incompatible_event_anchors",
      type: "misdirect",
      order: 2,
      volumeId: "volume_one",
      arcId: "arc_letter",
      eventId: "event_letter",
      placementId: null,
      chapterCardId: "chapter_two",
      plannedScope: "",
      note: "",
      status: "planned",
      commitId: null
    });
    chapterSource.plot.foreshadowing.push(chapterThread);
    const movedChapter = applyLongWorkspaceOperations(chapterSource, {
      baseRevision: chapterSource.revision,
      updatedAt: later,
      operations: [
        {
          type: "chapter.move",
          id: "chapter_two",
          toVolumeId: "volume_two",
          toPrimaryArcId: "arc_two"
        }
      ]
    });
    expect(
      movedChapter.snapshot.plot.foreshadowing[0]!.beats[0]
    ).toMatchObject({
      volumeId: "volume_two",
      arcId: "arc_two",
      chapterCardId: "chapter_two"
    });
    expect(
      movedChapter.snapshot.plot.foreshadowing[0]!.beats[1]
    ).toMatchObject({
      volumeId: null,
      arcId: null,
      eventId: "event_letter",
      chapterCardId: "chapter_two"
    });

    const placementSource = workspace();
    placementSource.plot.volumes.push(secondVolume);
    placementSource.plot.arcs.push(secondArc);
    const targetChapter = placementSource.plot.chapterCards.find(
      ({ id }) => id === "chapter_two"
    )!;
    targetChapter.volumeId = "volume_two";
    targetChapter.primaryArcId = "arc_two";
    targetChapter.narrativeOrder = 1;
    placementSource.plot.narrativePlacements.push({
      id: "placement_moving",
      eventId: "event_letter",
      chapterCardId: "chapter_one",
      orderInChapter: 1,
      mode: "clue",
      disclosure: "hint",
      writingPrompt: "",
      status: "planned",
      commitId: null
    });
    placementSource.plot.foreshadowing.push(
      planningThread({
        id: "beat_follows_placement",
        type: "misdirect",
        order: 1,
        volumeId: "volume_one",
        arcId: "arc_letter",
        eventId: null,
        placementId: "placement_moving",
        chapterCardId: "chapter_one",
        plannedScope: "",
        note: "",
        status: "planned",
        commitId: null
      })
    );
    const movedPlacement = applyLongWorkspaceOperations(placementSource, {
      baseRevision: placementSource.revision,
      updatedAt: later,
      operations: [
        {
          type: "placement.move",
          id: "placement_moving",
          toChapterCardId: "chapter_two"
        }
      ]
    });
    expect(
      movedPlacement.snapshot.plot.foreshadowing[0]!.beats[0]
    ).toMatchObject({
      volumeId: "volume_two",
      arcId: "arc_two",
      chapterCardId: "chapter_two",
      placementId: "placement_moving"
    });
  });

  it("reconciles event-only volume anchors when an event arc is deleted", () => {
    const source = workspace();
    source.plot.arcs.push({
      id: "arc_same_volume",
      volumeId: "volume_one",
      title: "同卷保留线",
      order: 2,
      outline: ""
    });
    source.plot.storyEvents[0]!.arcIds.push("arc_same_volume");
    source.plot.storyEvents.push({
      id: "event_loses_only_arc",
      title: "失去唯一剧情点的事件",
      summary: "",
      timeMode: "sequence",
      timeLabel: "",
      storyOrder: 2,
      location: "",
      arcIds: ["arc_letter"],
      characterIds: []
    });
    source.plot.foreshadowing.push({
      id: "foreshadow_arc_delete",
      title: "删除剧情点后的触点",
      coreQuestion: "事件触点如何保留？",
      truthEventId: null,
      expectedReaderEffect: "",
      status: "planned",
      beats: [
        {
          id: "beat_clears_orphaned_volume",
          type: "plant",
          order: 1,
          volumeId: "volume_one",
          arcId: null,
          eventId: "event_loses_only_arc",
          placementId: null,
          chapterCardId: null,
          plannedScope: "",
          note: "",
          status: "planned",
          commitId: null
        },
        {
          id: "beat_keeps_same_volume",
          type: "reinforce",
          order: 2,
          volumeId: "volume_one",
          arcId: null,
          eventId: "event_letter",
          placementId: null,
          chapterCardId: null,
          plannedScope: "",
          note: "",
          status: "planned",
          commitId: null
        }
      ]
    });
    const batch = LongWorkspaceOperationBatchSchema.parse({
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "arc.delete",
          id: "arc_letter",
          cascade: true
        }
      ]
    });
    const preview = previewLongWorkspaceOperations(source, batch);
    const result = applyLongWorkspaceOperations(source, {
      ...batch,
      expectedImpact: preview.impact
    });
    const beats = result.snapshot.plot.foreshadowing[0]!.beats;
    expect(
      beats.find(({ id }) => id === "beat_clears_orphaned_volume")
    ).toMatchObject({
      volumeId: null,
      eventId: "event_loses_only_arc"
    });
    expect(
      beats.find(({ id }) => id === "beat_keeps_same_volume")
    ).toMatchObject({
      volumeId: "volume_one",
      eventId: "event_letter"
    });
  });

  it("retargets typed foreshadowing anchors when an event changes plot points", () => {
    const source = workspace();
    source.plot.volumes.push({
      id: "volume_two",
      title: "第二卷",
      order: 2,
      summary: ""
    });
    source.plot.arcs.push({
      id: "arc_two",
      volumeId: "volume_two",
      title: "第二卷主线",
      order: 1,
      outline: ""
    });
    source.plot.foreshadowing.push({
      id: "foreshadow_event_move",
      title: "事件改绑后的触点",
      coreQuestion: "事件改变剧情点后如何投影？",
      truthEventId: null,
      expectedReaderEffect: "",
      status: "planned",
      beats: [
        {
          id: "beat_follows_event_rebind",
          type: "plant",
          order: 1,
          volumeId: "volume_one",
          arcId: "arc_letter",
          eventId: "event_letter",
          placementId: null,
          chapterCardId: null,
          plannedScope: "",
          note: "",
          status: "planned",
          commitId: null
        },
        {
          id: "beat_keeps_concrete_chapter",
          type: "reinforce",
          order: 2,
          volumeId: "volume_one",
          arcId: "arc_letter",
          eventId: "event_letter",
          placementId: null,
          chapterCardId: "chapter_one",
          plannedScope: "",
          note: "",
          status: "planned",
          commitId: null
        }
      ]
    });
    const result = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "event.update",
          id: "event_letter",
          patch: { arcIds: ["arc_two"] }
        }
      ]
    });
    expect(result.snapshot.plot.foreshadowing[0]!.beats[0]).toMatchObject({
      volumeId: "volume_two",
      arcId: "arc_two",
      eventId: "event_letter"
    });
    expect(result.snapshot.plot.foreshadowing[0]!.beats[1]).toMatchObject({
      volumeId: null,
      arcId: null,
      eventId: "event_letter",
      chapterCardId: "chapter_one"
    });
  });

  it("allows recorded foreshadowing facts to be edited", () => {
    const source = committedForeshadowingWorkspace();
    const result = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "foreshadowing.update",
          id: "foreshadow_letter",
          patch: {
            hiddenTruth: "寄信人身份仍可重新设计。",
            plannedSpan: "cross_volume"
          }
        },
        {
          type: "foreshadowingBeat.update",
          id: "beat_letter",
          patch: { note: "记录后仍可调整触点说明。" }
        }
      ]
    });
    expect(result.snapshot.plot.foreshadowing[0]).toMatchObject({
      hiddenTruth: "寄信人身份仍可重新设计。",
      plannedSpan: "cross_volume"
    });
    expect(result.snapshot.plot.foreshadowing[0]!.beats[0]!.note).toBe(
      "记录后仍可调整触点说明。"
    );
  });

  it("normalizes every order-changing operation to a contiguous sequence", () => {
    const source = workspace();
    const result = applyLongWorkspaceOperations(
      source,
      LongWorkspaceOperationBatchSchema.parse({
        baseRevision: source.revision,
        updatedAt: later,
        operations: [
          {
            type: "chapter.reorder",
            volumeId: "volume_one",
            orderedIds: ["chapter_two", "chapter_one"]
          },
          {
            type: "event.create",
            event: {
              id: "event_second",
              title: "第二事件",
              summary: "",
              timeMode: "sequence",
              timeLabel: "",
              storyOrder: 99,
              location: "",
              arcIds: ["arc_letter"],
              characterIds: []
            }
          },
          {
            type: "event.reorder",
            orderedIds: ["event_second", "event_letter"]
          }
        ]
      })
    );

    expect(
      result.snapshot.plot.chapterCards.map(
        ({ id, narrativeOrder }) => [id, narrativeOrder]
      )
    ).toEqual([
      ["chapter_two", 1],
      ["chapter_one", 2]
    ]);
    expect(
      result.snapshot.plot.storyEvents.map(({ id, storyOrder }) => [
        id,
        storyOrder
      ])
    ).toEqual([
      ["event_second", 1],
      ["event_letter", 2]
    ]);
  });

  it("uses base revision and document revisions as optimistic concurrency guards", () => {
    const source = workspace();
    expectOperationError(
      () =>
        applyLongWorkspaceOperations(
          source,
          LongWorkspaceOperationBatchSchema.parse({
            baseRevision: 6,
            updatedAt: later,
            operations: [
              {
                type: "volume.update",
                id: "volume_one",
                patch: { title: "错误版本" }
              }
            ]
          })
        ),
      "revision_conflict"
    );

    expectOperationError(
      () =>
        applyLongWorkspaceOperations(
          source,
          LongWorkspaceOperationBatchSchema.parse({
            baseRevision: source.revision,
            updatedAt: later,
            operations: [
              {
                type: "volume.update",
                id: "volume_one",
                patch: { title: "新标题" }
              }
            ],
            documentWrites: [
              {
                proposalId: "proposal_stale_book_line",
                fileId: LONG_BOOK_LINE_FILE_ID,
                mode: "replace",
                expectedRevision: "v1:1:11111111",
                nextRevision: "v1:2:22222222",
                updatedAt: later,
                content: "新全书线",
                reason: "更新全书线"
              }
            ]
          })
        ),
      "invalid_document_write"
    );
  });

  it("keeps all character design files editable after continuity records", () => {
    const source = committedWorkspace();
    const files = source.characterFiles[0]!;
    const batchFor = (fileId: string) => ({
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "character.update" as const,
          id: "character_alice",
          patch: { aliases: ["阿岚"] }
        }
      ],
      documentWrites: [
        {
          proposalId: `proposal_${fileId.replace(/[^A-Za-z0-9._:-]/gu, "_")}`,
          fileId,
          mode: "replace" as const,
          expectedRevision: revision,
          nextRevision: "v1:1:1234abcd",
          updatedAt: later,
          content: "账本启动后的直接修改",
          reason: "验证连续性资料写锁"
        }
      ]
    });

    for (const fileId of [
      files.relationships.id,
      files.currentState.id,
      files.history.id
    ]) {
      expect(
        applyLongWorkspaceOperations(source, batchFor(fileId))
          .documentWrites[0]?.fileId
      ).toBe(fileId);
    }

    expect(
      applyLongWorkspaceOperations(source, batchFor(files.coreProfile.id))
        .documentWrites[0]?.fileId
    ).toBe(files.coreProfile.id);
  });

  it("does not let a continuation-import checkpoint take ownership of character design files", () => {
    const source = committedWorkspace();
    source.ledger.commits[0]!.mode = "import_checkpoint";
    const relationships = source.characterFiles[0]!.relationships;
    const result = applyLongWorkspaceOperations(source, {
      baseRevision: source.revision,
      updatedAt: later,
      operations: [
        {
          type: "character.update",
          id: "character_alice",
          patch: { aliases: ["阿岚"] }
        }
      ],
      documentWrites: [
        {
          proposalId: "proposal_import_checkpoint_relationships",
          fileId: relationships.id,
          mode: "replace",
          expectedRevision: revision,
          nextRevision: "v1:1:1234abcd",
          updatedAt: later,
          content: "导入后补录的人物关系",
          reason: "导入检查点不接管人物设计"
        }
      ]
    });
    expect(result.documentWrites[0]?.fileId).toBe(relationships.id);
  });

  it("creates, updates, reorders, and deletes story plots bound to an arc", () => {
    const source = workspace();
    const created = applyLongWorkspaceOperations(
      source,
      LongWorkspaceOperationBatchSchema.parse({
        baseRevision: source.revision,
        updatedAt: later,
        operations: [
          {
            type: "storyPlot.create",
            storyPlot: {
              id: "storyplot_daily",
              arcId: "arc_letter",
              title: "日常崩塌",
              order: 1,
              file: file(
                "file_storyplot_daily:body",
                "long/story-plots/storyplot_daily/body.md",
                later
              )
            }
          },
          {
            type: "storyPlot.create",
            storyPlot: {
              id: "storyplot_ripple",
              arcId: "arc_letter",
              title: "不可逆的涟漪",
              order: 2,
              file: file(
                "file_storyplot_ripple:body",
                "long/story-plots/storyplot_ripple/body.md",
                later
              )
            }
          }
        ]
      })
    );
    expect(created.snapshot.plot.storyPlots.map(({ id }) => id)).toEqual([
      "storyplot_daily",
      "storyplot_ripple"
    ]);
    expect(created.fileIntents.map(({ file: entry }) => entry.id)).toEqual([
      "file_storyplot_daily:body",
      "file_storyplot_ripple:body"
    ]);

    const reordered = applyLongWorkspaceOperations(
      created.snapshot,
      LongWorkspaceOperationBatchSchema.parse({
        baseRevision: created.resultRevision,
        updatedAt: later,
        operations: [
          {
            type: "storyPlot.reorder",
            arcId: "arc_letter",
            orderedIds: ["storyplot_ripple", "storyplot_daily"]
          },
          {
            type: "storyPlot.update",
            id: "storyplot_ripple",
            patch: { title: "涟漪扩散" }
          }
        ]
      })
    );
    expect(
      [...reordered.snapshot.plot.storyPlots]
        .sort((left, right) => left.order - right.order)
        .map(({ id, title, order }) => ({
          id,
          title,
          order
        }))
    ).toEqual([
      { id: "storyplot_ripple", title: "涟漪扩散", order: 1 },
      { id: "storyplot_daily", title: "日常崩塌", order: 2 }
    ]);

    const deleted = applyLongWorkspaceOperations(
      reordered.snapshot,
      LongWorkspaceOperationBatchSchema.parse({
        baseRevision: reordered.resultRevision,
        updatedAt: later,
        operations: [
          {
            type: "storyPlot.delete",
            id: "storyplot_daily",
            cascade: false
          }
        ]
      })
    );
    expect(deleted.snapshot.plot.storyPlots.map(({ id }) => id)).toEqual([
      "storyplot_ripple"
    ]);
    expect(deleted.fileIntents.map(({ action, file: entry }) => [action, entry.id])).toEqual([
      ["delete", "file_storyplot_daily:body"]
    ]);
  });
});
