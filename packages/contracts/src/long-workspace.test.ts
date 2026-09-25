import { describe, expect, it } from "vitest";
import {
  BookSchema,
  CatalogProjectManifestSchema,
  DEFAULT_LONG_AGENT_PROFILES,
  DEFAULT_LONG_AGENTS_MD,
  LONG_AGENTS_MD_PATH,
  LONG_BOOK_LINE_FILE_ID,
  LONG_WORKSPACE_INDEX_FILE_ID,
  LONG_WORKSPACE_INDEX_PATH,
  LongAgentProfileSchema,
  LongBookSchema,
  LongBookSummarySchema,
  LongContinuityProjectionSchema,
  LongEventConnectionSchema,
  LongFileRevisionSchema,
  LongProjectManifestSchema,
  LongWorkspaceIndexSnapshotSchema,
  LongWorkspaceSchemaVersionSchema,
  WorkspaceTypeSchema,
  createLongBookSummary,
  createLongWorkspaceNavigationSnapshot,
  longChapterBodyFileId,
  longChapterCardFileId,
  longChapterContinuityFilePath,
  longChapterForeshadowingChangesFileId,
  longChapterCharacterStateFileId,
  longChapterHandoffFileId,
  longCharacterCoreProfileFileId,
  longCharacterCurrentStateFileId,
  longCharacterHistoryFileId,
  longCharacterRelationshipsFileId,
  longLedgerCommitFileId,
  longWorldbuildingFileId,
  longAgentAcceptsWorldbuildingDirectory,
  resolveLongAgentIdForRoot
} from "./index";
import { longAgentAcceptsWorldbuildingDirectory as rendererLongAgentAcceptsWorldbuildingDirectory } from "./renderer";

const now = "2026-07-26T10:00:00.000Z";
const revision = "v1:0:00000000";

function file(id: string, path: string) {
  return { id, path, revision, updatedAt: now };
}

function chapterFiles(chapterCardId: string, order: number) {
  return {
    chapterCardId,
    body: file(
      longChapterBodyFileId(chapterCardId),
      `long/chapters/${order}/body.md`
    ),
    card: file(
      longChapterCardFileId(chapterCardId),
      `long/chapters/${order}/card.md`
    ),
    characterState: file(
      longChapterCharacterStateFileId(chapterCardId),
      `long/chapters/${order}/character-state.md`
    ),
    handoff: file(
      longChapterHandoffFileId(chapterCardId),
      `long/chapters/${order}/handoff.md`
    ),
    commitId: null as string | null
  };
}

function workspaceIndex() {
  return {
    schemaVersion: 1 as const,
    revision: 4,
    bookId: "longbook_alpha",
    updatedAt: now,
    bookLine: file(LONG_BOOK_LINE_FILE_ID, "long/plot/book-line.md"),
    worldbuilding: [
      {
        id: "world_rules",
        title: "世界规则",
        order: 1,
        format: "text" as const,
        contentAuthority: "markdown" as const,
        file: file(
          longWorldbuildingFileId("world_rules"),
          "long/worldbuilding/rules.md"
        )
      }
    ],
    characters: [
      {
        id: "character_alice",
        name: "林岚",
        group: "protagonist" as const,
        order: 1,
        aliases: ["阿岚"]
      }
    ],
    characterFiles: [
      {
        characterId: "character_alice",
        coreProfile: file(
          longCharacterCoreProfileFileId("character_alice"),
          "long/characters/alice/core-profile.md"
        ),
        relationships: file(
          longCharacterRelationshipsFileId("character_alice"),
          "long/characters/alice/relationships.md"
        ),
        currentState: file(
          longCharacterCurrentStateFileId("character_alice"),
          "long/characters/alice/current-state.md"
        ),
        history: file(
          longCharacterHistoryFileId("character_alice"),
          "long/characters/alice/history.md"
        )
      }
    ],
    plot: {
      volumes: [
        {
          id: "volume_one",
          title: "第一卷",
          order: 1,
          summary: "林岚找到被隐藏的来信。"
        }
      ],
      arcs: [
        {
          id: "arc_letter",
          volumeId: "volume_one",
          title: "来信之谜",
          order: 1,
          outline: "追查来信来源。"
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
          id: "event_letter_sent",
          title: "寄出来信",
          summary: "匿名人寄出了来信。",
          timeMode: "sequence" as const,
          timeLabel: "故事开始前",
          storyOrder: 1,
          location: "未知",
          arcIds: ["arc_letter"],
          characterIds: []
        },
        {
          id: "event_letter_received",
          title: "收到来信",
          summary: "林岚在雨夜收到来信。",
          timeMode: "sequence" as const,
          timeLabel: "第一天",
          storyOrder: 2,
          location: "林岚家",
          arcIds: ["arc_letter"],
          characterIds: ["character_alice"]
        }
      ],
      eventConnections: [
        {
          id: "connection_sent_before_received",
          sourceEventId: "event_letter_sent",
          targetEventId: "event_letter_received",
          type: "before" as const,
          note: ""
        }
      ],
      narrativePlacements: [
        {
          id: "placement_receive_letter",
          eventId: "event_letter_received",
          chapterCardId: "chapter_one",
          orderInChapter: 1,
          mode: "scene" as const,
          disclosure: "full" as const,
          writingPrompt: "现场呈现来信出现。",
          status: "planned" as
            | "planned"
            | "written"
            | "committed"
            | "missed",
          commitId: null as string | null
        }
      ],
      foreshadowing: [
        {
          id: "foreshadow_sender",
          title: "寄信人身份",
          coreQuestion: "是谁寄出了来信？",
          truthEventId: "event_letter_sent",
          expectedReaderEffect: "让读者持续怀疑寄信人的身份。",
          status: "planned" as const,
          beats: [
            {
              id: "beat_first_clue",
              type: "plant" as const,
              order: 1,
              eventId: "event_letter_received",
              placementId: "placement_receive_letter",
              chapterCardId: "chapter_one",
              plannedScope: "",
              note: "信封上的蜡封是第一条线索。",
              status: "planned" as
                | "planned"
                | "written"
                | "committed"
                | "missed",
              commitId: null as string | null
            }
          ]
        }
      ]
    },
    chapters: [
      chapterFiles("chapter_one", 1),
      chapterFiles("chapter_two", 2)
    ],
    ledger: {
      committedThroughChapterId: null as string | null,
      commits: [] as Array<{
        id: string;
        sequence: number;
        chapterCardId: string;
        committedAt: string;
        reversible: boolean;
        sourceRevision: number;
        placementIds: string[];
        foreshadowingBeatIds: string[];
        recordFile: ReturnType<typeof file>;
      }>
    }
  };
}

function commitFirstChapter(workspace: ReturnType<typeof workspaceIndex>) {
  const commitId = "commit_first";
  workspace.chapters[0]!.commitId = commitId;
  workspace.plot.narrativePlacements[0]!.status = "committed";
  workspace.plot.narrativePlacements[0]!.commitId = commitId;
  workspace.plot.foreshadowing[0]!.beats[0]!.status = "committed";
  workspace.plot.foreshadowing[0]!.beats[0]!.commitId = commitId;
  (
    workspace.plot.foreshadowing[0]! as {
      status: "planned" | "open" | "progressing" | "resolved" | "abandoned";
    }
  ).status = "open";
  workspace.ledger.committedThroughChapterId = "chapter_one";
  workspace.ledger.commits.push({
    id: commitId,
    sequence: 1,
    chapterCardId: "chapter_one",
    committedAt: now,
    reversible: true,
    sourceRevision: workspace.revision,
    placementIds: ["placement_receive_letter"],
    foreshadowingBeatIds: ["beat_first_clue"],
    recordFile: file(
      longLedgerCommitFileId(commitId),
      "long/ledger/commit-first.json"
    )
  });
  return workspace;
}

function longBook() {
  return {
    schemaVersion: 1 as const,
    id: "longbook_alpha",
    title: "雨夜来信",
    bookType: "long" as const,
    genre: "悬疑",
    status: "editing" as const,
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
    projectRevision: 4,
    createdAt: now,
    updatedAt: now,
    workspaceIndex: workspaceIndex()
  };
}

describe("independent long-form workspace contracts", () => {
  it("ships a default AGENTS.md that explains the five long-form stages", () => {
    expect(LONG_AGENTS_MD_PATH).toBe("AGENTS.md");
    expect(DEFAULT_LONG_AGENTS_MD).toContain("# 长篇上下文");
    expect(DEFAULT_LONG_AGENTS_MD).toContain("## 世界观阶段");
    expect(DEFAULT_LONG_AGENTS_MD).toContain("## 人物阶段");
    expect(DEFAULT_LONG_AGENTS_MD).toContain("## 剧情点阶段");
    expect(DEFAULT_LONG_AGENTS_MD).toContain("## 正文阶段");
    expect(DEFAULT_LONG_AGENTS_MD).toContain("## 持续性账本阶段");
  });

  it("parses a full index, lightweight navigation, book and manifest without joining existing unions", () => {
    const book = LongBookSchema.parse(longBook());
    const navigation = createLongWorkspaceNavigationSnapshot(
      book.workspaceIndex
    );
    const summary = createLongBookSummary(book);
    const manifest = {
      schemaVersion: 1,
      revision: 4,
      kind: "deepwrite.long-book",
      id: "longbook_alpha",
      title: "雨夜来信",
      bookType: "long",
      genre: "悬疑",
      status: "editing",
      linkedMaterialIdsByKind: book.linkedMaterialIdsByKind,
      linkedSkillIdsByKind: book.linkedSkillIdsByKind,
      createdAt: now,
      updatedAt: now,
      workspaceIndexFile: file(
        LONG_WORKSPACE_INDEX_FILE_ID,
        LONG_WORKSPACE_INDEX_PATH
      )
    };

    expect(navigation.counts.chapterCards).toBe(2);
    expect(book.workspaceIndex.characterTypes.map(({ id }) => id)).toEqual([
      "protagonist",
      "major_supporting",
      "minor_supporting",
      "passerby"
    ]);
    expect(navigation.characterTypes).toEqual(book.workspaceIndex.characterTypes);
    expect(book.workspaceIndex.ledger.projection).toEqual({
      throughCommitId: null,
      facts: [],
      knowledge: [],
      openLoops: [],
      latestHandoff: null
    });
    expect(book.workspaceIndex.chapters[0]?.foreshadowingChanges).toMatchObject({
      id: longChapterForeshadowingChangesFileId("chapter_one"),
      path: longChapterContinuityFilePath(
        "chapter_one",
        "foreshadowing-changes.md"
      )
    });
    expect(book.workspaceIndex.chapters[0]?.worldReveals).toBeNull();
    expect(book.workspaceIndex.chapters[0]?.characterContinuity).toEqual([]);
    expect(navigation.chapterCards[0]).toEqual({
      id: "chapter_one",
      volumeId: "volume_one",
      primaryArcId: "arc_letter",
      title: "雨夜来信",
      narrativeOrder: 1,
      bodyStatus: "empty"
    });
    expect(navigation).not.toHaveProperty("chapters");
    expect(navigation.chapterCards[0]).not.toHaveProperty("outline");
    expect(summary.navigation.bookId).toBe(book.id);
    expect(LongProjectManifestSchema.parse(manifest).kind).toBe(
      "deepwrite.long-book"
    );

    expect(BookSchema.safeParse(book).success).toBe(false);
    expect(WorkspaceTypeSchema.safeParse("long").success).toBe(false);
    expect(CatalogProjectManifestSchema.safeParse(manifest).success).toBe(
      false
    );
  });

  it("validates structured continuity projection keys and provenance", () => {
    const fact = {
      factId: "fact_alice-location",
      domain: "character" as const,
      subjectId: "character_alice",
      field: "location",
      value: "林岚家",
      sourceCommitId: "commit_first",
      sourceChapterCardId: "chapter_one",
      evidence: "正文写明林岚在家中。"
    };
    const projection = {
      throughCommitId: "commit_first",
      facts: [fact],
      knowledge: [
        {
          factId: fact.factId,
          audienceType: "reader" as const,
          audienceId: null,
          level: "knows" as const,
          sourceCommitId: "commit_first",
          sourceChapterCardId: "chapter_one",
          evidence: "读者直接读到地点。"
        }
      ],
      openLoops: [
        {
          loopId: "loop_sender",
          kind: "foreshadowing" as const,
          status: "open" as const,
          detail: "寄信人身份尚未揭晓。",
          subjectId: "foreshadow_sender",
          factId: null,
          sourceCommitId: "commit_first",
          sourceChapterCardId: "chapter_one",
          evidence: "正文只给出蜡封线索。"
        }
      ],
      latestHandoff: {
        chapterCardId: "chapter_one",
        commitId: "commit_first",
        summary: "下一章追查旧邮戳。",
        mustCarry: ["林岚持有旧信。"],
        nextChapterConstraints: ["不能提前揭晓寄信人。"],
        openLoops: ["loop_sender"]
      }
    };
    expect(LongContinuityProjectionSchema.safeParse(projection).success).toBe(
      true
    );
    expect(
      LongContinuityProjectionSchema.safeParse({
        ...projection,
        facts: [
          fact,
          {
            ...fact,
            factId: "fact_duplicate-location"
          }
        ]
      }).success
    ).toBe(false);
    expect(
      LongContinuityProjectionSchema.safeParse({
        ...projection,
        knowledge: [
          {
            ...projection.knowledge[0],
            factId: "fact_missing"
          }
        ]
      }).success
    ).toBe(false);
  });

  it("anchors workspace continuity projections to indexed commits and domain objects", () => {
    const committed = commitFirstChapter(workspaceIndex());
    Object.assign(committed.ledger, {
      projection: {
        throughCommitId: "commit_first",
        facts: [
          {
            factId: "fact_alice-location",
            domain: "character",
            subjectId: "character_alice",
            field: "location",
            value: "林岚家",
            sourceCommitId: "commit_first",
            sourceChapterCardId: "chapter_one",
            evidence: "正文写明林岚仍在家中。"
          }
        ],
        knowledge: [],
        openLoops: [],
        latestHandoff: null
      }
    });
    const parsedCommitted =
      LongWorkspaceIndexSnapshotSchema.parse(committed);
    expect(parsedCommitted.ledger.commits[0]?.mode).toBe("structured");

    const orphanSubject = structuredClone(parsedCommitted);
    orphanSubject.ledger.projection.facts[0]!.subjectId =
      "character_missing";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(orphanSubject).success
    ).toBe(false);

    const unknownSource = structuredClone(parsedCommitted);
    unknownSource.ledger.projection.facts[0]!.sourceCommitId =
      "commit_missing";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(unknownSource).success
    ).toBe(false);

    const wrongSourceChapter = structuredClone(parsedCommitted);
    wrongSourceChapter.ledger.projection.facts[0]!.sourceChapterCardId =
      "chapter_two";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(wrongSourceChapter).success
    ).toBe(false);
  });

  it("enforces versioned opaque ids and canonical three-file indexes", () => {
    expect(LongWorkspaceSchemaVersionSchema.safeParse(1).success).toBe(true);
    expect(LongWorkspaceSchemaVersionSchema.safeParse(2).success).toBe(false);
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse({
        ...workspaceIndex(),
        bookId: "第一部长篇"
      }).success
    ).toBe(false);

    const wrongFile = workspaceIndex();
    wrongFile.chapters[0]!.handoff.id = "file_custom:handoff";
    expect(LongWorkspaceIndexSnapshotSchema.safeParse(wrongFile).success).toBe(
      false
    );

    const duplicatePath = workspaceIndex();
    duplicatePath.chapters[1]!.body.path =
      duplicatePath.chapters[0]!.body.path;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(duplicatePath).success
    ).toBe(false);

    const portableDuplicatePath = workspaceIndex();
    portableDuplicatePath.chapters[1]!.body.path =
      portableDuplicatePath.chapters[0]!.body.path.replace(
        "body.md",
        "BODY.md"
      );
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(portableDuplicatePath)
        .success
    ).toBe(false);

    expect(
      LongFileRevisionSchema.safeParse(`v2:${"1".repeat(100)}:${"a".repeat(64)}`)
        .success
    ).toBe(false);
  });

  it("rejects duplicate and unresolved entity references", () => {
    const duplicateIds = workspaceIndex();
    duplicateIds.plot.chapterCards[1]!.id = "chapter_one";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(duplicateIds).success
    ).toBe(false);

    const duplicateReferences = workspaceIndex();
    duplicateReferences.plot.storyEvents[0]!.characterIds = [
      "character_alice",
      "character_alice"
    ];
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(duplicateReferences).success
    ).toBe(false);

    const missingReference = workspaceIndex();
    missingReference.plot.arcs[0]!.volumeId = "volume_missing";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(missingReference).success
    ).toBe(false);

    const unassociatedChapter = LongWorkspaceIndexSnapshotSchema.parse(
      workspaceIndex()
    );
    unassociatedChapter.plot.chapterCards[0]!.primaryArcId = null;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(unassociatedChapter).success
    ).toBe(true);

    const missingChapterArc = LongWorkspaceIndexSnapshotSchema.parse(
      workspaceIndex()
    );
    missingChapterArc.plot.chapterCards[0]!.primaryArcId = "arc_missing";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(missingChapterArc).success
    ).toBe(false);
  });

  it("accepts custom character type ids and rejects unresolved character types", () => {
    const source = workspaceIndex();
    const custom = {
      ...source,
      characterTypes: [
        { id: "chartype_viewpoint", title: "视角人物", order: 1 }
      ],
      characters: source.characters.map((character) => ({
        ...character,
        group: "chartype_viewpoint"
      }))
    };
    expect(LongWorkspaceIndexSnapshotSchema.parse(custom).characters[0]?.group)
      .toBe("chartype_viewpoint");

    expect(() =>
      LongWorkspaceIndexSnapshotSchema.parse({
        ...custom,
        characters: custom.characters.map((character) => ({
          ...character,
          group: "chartype_missing"
        }))
      })
    ).toThrow(
      /existing character type/u
    );
  });

  it("requires contiguous volume, arc, chapter, event and placement order", () => {
    const volumeOrder = workspaceIndex();
    volumeOrder.plot.volumes[0]!.order = 2;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(volumeOrder).success
    ).toBe(false);

    const chapterOrder = workspaceIndex();
    chapterOrder.plot.chapterCards[1]!.narrativeOrder = 1;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(chapterOrder).success
    ).toBe(false);

    const eventOrder = workspaceIndex();
    eventOrder.plot.storyEvents[1]!.storyOrder = 1;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(eventOrder).success
    ).toBe(false);

    const placementOrder = workspaceIndex();
    placementOrder.plot.narrativePlacements[0]!.orderInChapter = 2;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(placementOrder).success
    ).toBe(false);
  });

  it("keeps full books and lightweight summaries on one revision", () => {
    const mismatchedBookRevision = longBook();
    mismatchedBookRevision.projectRevision = 5;
    expect(LongBookSchema.safeParse(mismatchedBookRevision).success).toBe(
      false
    );

    const mismatchedBookTime = longBook();
    mismatchedBookTime.updatedAt = "2026-07-26T11:00:00.000Z";
    expect(LongBookSchema.safeParse(mismatchedBookTime).success).toBe(false);

    const summary = createLongBookSummary(LongBookSchema.parse(longBook()));
    expect(summary.projectRevision).toBe(summary.navigation.revision);
    expect(
      LongBookSummarySchema.safeParse({
        ...summary,
        projectRevision: summary.projectRevision + 1
      }).success
    ).toBe(false);
    expect(
      LongBookSummarySchema.safeParse({
        ...summary,
        updatedAt: "2026-07-26T11:00:00.000Z"
      }).success
    ).toBe(false);
  });

  it("rejects event self-references and before cycles", () => {
    expect(
      LongEventConnectionSchema.safeParse({
        id: "connection_self",
        sourceEventId: "event_letter_sent",
        targetEventId: "event_letter_sent",
        type: "before",
        note: ""
      }).success
    ).toBe(false);

    const cycle = workspaceIndex();
    cycle.plot.eventConnections.push({
      id: "connection_received_before_sent",
      sourceEventId: "event_letter_received",
      targetEventId: "event_letter_sent",
      type: "before",
      note: ""
    });
    expect(LongWorkspaceIndexSnapshotSchema.safeParse(cycle).success).toBe(
      false
    );
  });

  it("accepts coherent sparse records and rejects mismatched record state", () => {
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(
        commitFirstChapter(workspaceIndex())
      ).success
    ).toBe(true);

    const skippedFirst = workspaceIndex();
    skippedFirst.chapters[1]!.commitId = "commit_second";
    skippedFirst.ledger.committedThroughChapterId = null;
    skippedFirst.ledger.commits.push({
      id: "commit_second",
      sequence: 1,
      chapterCardId: "chapter_two",
      committedAt: now,
      reversible: true,
      sourceRevision: skippedFirst.revision,
      placementIds: [],
      foreshadowingBeatIds: [],
      recordFile: file(
        longLedgerCommitFileId("commit_second"),
        "long/ledger/commit-second.json"
      )
    });
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(skippedFirst).success
    ).toBe(true);

    const undecidedPlacement = commitFirstChapter(workspaceIndex());
    undecidedPlacement.plot.narrativePlacements[0]!.status = "planned";
    undecidedPlacement.plot.narrativePlacements[0]!.commitId = null;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(undecidedPlacement).success
    ).toBe(false);

    const wrongCommittedThrough = commitFirstChapter(workspaceIndex());
    wrongCommittedThrough.ledger.committedThroughChapterId = "chapter_two";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(wrongCommittedThrough).success
    ).toBe(false);
  });

  it("requires a committed beat's bound placement and event to agree", () => {
    const missedPlacement = commitFirstChapter(workspaceIndex());
    missedPlacement.plot.narrativePlacements[0]!.status = "missed";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(missedPlacement).success
    ).toBe(false);

    const missingBeatEvent = commitFirstChapter(workspaceIndex());
    (
      missingBeatEvent.plot.foreshadowing[0]!.beats[0]! as {
        eventId: string | null;
      }
    ).eventId = null;
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(missingBeatEvent).success
    ).toBe(false);
  });

  it("keeps legacy foreshadowing records compatible while validating planning anchors", () => {
    const legacy = LongWorkspaceIndexSnapshotSchema.parse(workspaceIndex());
    const legacyThread = legacy.plot.foreshadowing[0]!;
    const legacyBeat = legacyThread.beats[0]!;
    expect("hiddenTruth" in legacyThread).toBe(false);
    expect("plannedSpan" in legacyThread).toBe(false);
    expect("volumeId" in legacyBeat).toBe(false);
    expect("arcId" in legacyBeat).toBe(false);

    const volumePlanned = workspaceIndex();
    const volumeThread = volumePlanned.plot.foreshadowing[0]!;
    Object.assign(volumeThread, {
      hiddenTruth: "寄信人正是失踪多年的兄长。",
      plannedSpan: "cross_volume"
    });
    Object.assign(volumeThread.beats[0]!, {
      volumeId: "volume_one",
      eventId: null,
      placementId: null,
      chapterCardId: null
    });
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(volumePlanned).success
    ).toBe(true);

    const arcPlanned = workspaceIndex();
    Object.assign(arcPlanned.plot.foreshadowing[0]!.beats[0]!, {
      arcId: "arc_letter"
    });
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(arcPlanned).success
    ).toBe(true);

    const missingAnchor = workspaceIndex();
    Object.assign(missingAnchor.plot.foreshadowing[0]!.beats[0]!, {
      volumeId: "volume_missing"
    });
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(missingAnchor).success
    ).toBe(false);

    const conflictingAnchors = workspaceIndex();
    conflictingAnchors.plot.volumes.push({
      id: "volume_two",
      title: "第二卷",
      order: 2,
      summary: ""
    });
    Object.assign(
      conflictingAnchors.plot.foreshadowing[0]!.beats[0]!,
      {
        volumeId: "volume_two",
        arcId: "arc_letter"
      }
    );
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(conflictingAnchors)
        .success
    ).toBe(false);

    const conflictingEventVolume = workspaceIndex();
    conflictingEventVolume.plot.volumes.push({
      id: "volume_two",
      title: "第二卷",
      order: 2,
      summary: ""
    });
    conflictingEventVolume.plot.arcs.push({
      id: "arc_second",
      volumeId: "volume_two",
      title: "第二卷主线",
      order: 1,
      outline: ""
    });
    Object.assign(
      conflictingEventVolume.plot.foreshadowing[0]!.beats[0]!,
      {
        volumeId: "volume_two",
        arcId: null,
        placementId: null,
        chapterCardId: null
      }
    );
    const conflictingEventVolumeResult =
      LongWorkspaceIndexSnapshotSchema.safeParse(conflictingEventVolume);
    expect(conflictingEventVolumeResult.success).toBe(false);
    if (!conflictingEventVolumeResult.success) {
      expect(
        conflictingEventVolumeResult.error.issues.some(({ message }) =>
          message.includes(
            "planning volume must match its concrete event"
          )
        )
      ).toBe(true);
    }
  });

  it("derives non-abandoned foreshadowing status from committed beats", () => {
    const inconsistent = commitFirstChapter(workspaceIndex());
    (
      inconsistent.plot.foreshadowing[0]! as {
        status: "planned" | "open" | "progressing" | "resolved" | "abandoned";
      }
    ).status = "planned";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(inconsistent).success
    ).toBe(false);

    const explicitlyAbandoned = commitFirstChapter(workspaceIndex());
    (
      explicitlyAbandoned.plot.foreshadowing[0]! as {
        status: "planned" | "open" | "progressing" | "resolved" | "abandoned";
      }
    ).status = "abandoned";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(explicitlyAbandoned)
        .success
    ).toBe(true);

    const uncommittedButOpen = workspaceIndex();
    (
      uncommittedButOpen.plot.foreshadowing[0]! as {
        status: "planned" | "open" | "progressing" | "resolved" | "abandoned";
      }
    ).status = "open";
    expect(
      LongWorkspaceIndexSnapshotSchema.safeParse(uncommittedButOpen)
        .success
    ).toBe(false);
  });

  it("validates a long before-chain iteratively without overflowing the stack", () => {
    const large = workspaceIndex();
    const eventCount = 2_500;
    large.plot.storyEvents = Array.from({ length: eventCount }, (_, index) => ({
      id: `event_e${index}`,
      title: `事件 ${index + 1}`,
      summary: "",
      timeMode: "sequence" as const,
      timeLabel: "",
      storyOrder: index + 1,
      location: "",
      arcIds: [],
      characterIds: []
    }));
    large.plot.eventConnections = Array.from(
      { length: eventCount - 1 },
      (_, index) => ({
        id: `connection_c${index}`,
        sourceEventId: `event_e${index}`,
        targetEventId: `event_e${index + 1}`,
        type: "before" as const,
        note: ""
      })
    );
    large.plot.narrativePlacements = [];
    large.plot.foreshadowing = [];

    expect(LongWorkspaceIndexSnapshotSchema.safeParse(large).success).toBe(
      true
    );
  });

  it("defines a long-only agent profile without widening shared agent schemas", () => {
    const profile = LongAgentProfileSchema.parse({
      workspaceType: "long",
      id: "draft",
      label: "写手",
      description: "规划正文进度，并撰写或修改当前章正文。",
      systemPrompt: "根据章卡规划并编写当前章小说正文。",
      welcomeShortcuts: ["写当前章", "续写当前章", "规划下一章"],
      readAccess: {
        workspaceRoots: ["plot_design", "draft", "continuity_ledger"],
        materialKinds: ["draft"],
        skillKinds: ["general", "style"]
      },
      writeAccess: {
        workspaceRoots: ["draft"],
        capabilities: ["write_chapter_files", "dispatch_chapter_writer"]
      }
    });

    expect(profile.id).toBe("draft");
    expect(WorkspaceTypeSchema.safeParse(profile.workspaceType).success).toBe(
      false
    );
  });

  it("provides an exhaustive isolated default agent set", () => {
    expect(
      DEFAULT_LONG_AGENT_PROFILES.map(({ id }) => id)
    ).toEqual([
      "setting",
      "plot_design",
      "draft",
      "continuity_ledger"
    ]);
    expect(resolveLongAgentIdForRoot("worldbuilding")).toBe("setting");
    expect(resolveLongAgentIdForRoot("character_design")).toBe("setting");
    expect(resolveLongAgentIdForRoot("draft")).toBe("draft");
    expect(longAgentAcceptsWorldbuildingDirectory("setting")).toBe(true);
    expect(longAgentAcceptsWorldbuildingDirectory("plot_design")).toBe(true);
    expect(longAgentAcceptsWorldbuildingDirectory("draft")).toBe(true);
    expect(longAgentAcceptsWorldbuildingDirectory("continuity_ledger")).toBe(
      false
    );
    expect(rendererLongAgentAcceptsWorldbuildingDirectory).toBe(
      longAgentAcceptsWorldbuildingDirectory
    );
    const settingProfile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "setting"
    )!;
    expect(settingProfile.label).toBe("设定智能体");
    expect(settingProfile.writeAccess.workspaceRoots).toEqual([
      "worldbuilding",
      "character_design"
    ]);
    expect(settingProfile.systemPrompt).toContain("category_id");
    expect(settingProfile.systemPrompt).toContain("item_id");
    expect(settingProfile.systemPrompt).toContain("character_id 唯一定位");
    expect(settingProfile.systemPrompt).toContain("list_setting");
    expect(settingProfile.systemPrompt).toContain("search_setting");
    expect(settingProfile.systemPrompt).toContain("read_setting");
    expect(settingProfile.systemPrompt).toContain("create_setting");
    expect(settingProfile.systemPrompt).toContain("write_setting");
    expect(settingProfile.systemPrompt).toContain("edit_setting");
    expect(settingProfile.systemPrompt).toContain("domain=worldbuilding");
    expect(settingProfile.systemPrompt).toContain("domain=character");
    expect(settingProfile.systemPrompt).toContain("document=overview");
    expect(settingProfile.systemPrompt).not.toContain("list_worldbuilding");
    expect(settingProfile.systemPrompt).not.toContain("list_characters");
    expect(settingProfile.systemPrompt).not.toContain(
      "get_long_workspace_index"
    );
    expect(settingProfile.systemPrompt).not.toContain(
      "read_long_document"
    );
    expect(settingProfile.systemPrompt).not.toContain(
      "search_long_workspace"
    );
    expect(settingProfile.systemPrompt).not.toContain("fileId");
    expect(settingProfile.systemPrompt).not.toContain("file_id");
    expect(settingProfile.systemPrompt).not.toContain("bookId");
    expect(settingProfile.systemPrompt).not.toContain("路径");
    expect(settingProfile.systemPrompt).toContain("不接管或锁定人物文档");
    expect(settingProfile.systemPrompt).toContain("长篇结构导航");
    expect(settingProfile.systemPrompt).toContain("不得修改剧情结构");
    const plotProfile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "plot_design"
    )!;
    expect(plotProfile.systemPrompt).toContain("list_plot_design");
    expect(plotProfile.systemPrompt).toContain("search_plot_design");
    expect(plotProfile.systemPrompt).toContain("read_plot_design");
    expect(plotProfile.systemPrompt).toContain(
      "读取剧情点会一次返回概要、挂到该剧情点的全部故事事件正文"
    );
    expect(plotProfile.systemPrompt).toContain("create_plot_design");
    expect(plotProfile.systemPrompt).toContain("write_plot_design");
    expect(plotProfile.systemPrompt).toContain("edit_plot_design");
    expect(plotProfile.systemPrompt).toContain("伏笔线与伏笔触点继续完全使用");
    expect(plotProfile.systemPrompt).toContain("连续性记录只供参考");
    expect(plotProfile.systemPrompt).toContain("不锁定剧情结构");
    expect(plotProfile.systemPrompt).toContain("固定上下文已包含世界观与人物目录");
    expect(plotProfile.systemPrompt).toContain(
      "不要仅为重复取得同一列表而调用 list_setting"
    );
    expect(plotProfile.systemPrompt).not.toContain("get_long_workspace_index");
    expect(plotProfile.systemPrompt).not.toContain("fileId");
    const writerProfile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "draft"
    )!;
    expect(writerProfile.label).toBe("写手智能体");
    expect(writerProfile.writeAccess.capabilities).toEqual([
      "query_structure",
      "dispatch_chapter_writer",
      "write_chapter_files"
    ]);
    expect(writerProfile.systemPrompt).toContain(
      "固定上下文已包含世界观与人物目录"
    );
    expect(writerProfile.systemPrompt).toContain(
      "不要仅为重复取得同一列表而调用 list_setting"
    );
    expect(writerProfile.systemPrompt).toContain(
      "每张章卡对应一个独立的 Markdown 正文文件"
    );
    expect(writerProfile.systemPrompt).toContain("write_chapter_draft");
    expect(writerProfile.systemPrompt).toContain("edit_chapter_draft");
    expect(writerProfile.systemPrompt).toContain(
      "propose_long_chapter_dispatch"
    );
    expect(writerProfile.systemPrompt).toContain(
      "同一写手智能体和同一对话历史"
    );
    expect(writerProfile.systemPrompt).not.toContain(
      "每章独立的写手运行"
    );
    expect(writerProfile.systemPrompt).toContain(
      "每次写入工具调用只能提交运行时锁定的当前章"
    );
    expect(writerProfile.systemPrompt).toContain(
      "content 只放完整小说正文"
    );
    expect(writerProfile.systemPrompt).toContain("会话 diff 审批卡");
    expect(writerProfile.systemPrompt).toContain(
      "写作产物只限当前锁定章的小说正文"
    );
    expect(writerProfile.systemPrompt).toContain(
      "不得编写、草拟、补全或修改章末人物状态、交接文档"
    );
    expect(writerProfile.systemPrompt).toContain(
      "连续性记录由用户之后按需触发"
    );
    expect(writerProfile.welcomeShortcuts).toEqual([
      "写当前章",
      "续写当前章",
      "规划下一章"
    ]);
    const continuityProfile = DEFAULT_LONG_AGENT_PROFILES.find(
      ({ id }) => id === "continuity_ledger"
    )!;
    expect(continuityProfile.systemPrompt).toContain("list_continuity_files");
    expect(continuityProfile.systemPrompt).toContain("read_continuity_file");
    expect(continuityProfile.systemPrompt).toContain("create_continuity_file");
    expect(continuityProfile.systemPrompt).toContain("write_continuity_file");
    expect(continuityProfile.systemPrompt).toContain("edit_continuity_file");
    expect(continuityProfile.systemPrompt).toContain("propose_continuity_commit");
    expect(continuityProfile.systemPrompt).toContain("pending_catchup");
    expect(continuityProfile.systemPrompt).toContain("批量提交所有未提交章节");
    expect(continuityProfile.systemPrompt).toContain("suggested_record=brief");
    expect(continuityProfile.welcomeShortcuts).toEqual([
      "提交当前章",
      "批量提交所有未提交章节",
      "检查连续性"
    ]);
    expect(continuityProfile.systemPrompt).not.toContain("set_long_ledger_");
    expect(continuityProfile.systemPrompt).not.toContain(
      "propose_long_ledger_commit"
    );
  });
});
