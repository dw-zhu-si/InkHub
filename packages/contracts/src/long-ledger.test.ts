import { describe, expect, it } from "vitest";
import {
  LongCommitChapterInputSchema,
  LongLedgerCommitRecordSchema
} from "./index";

const record = {
  schemaVersion: 1 as const,
  id: "commit_first",
  bookId: "longbook_alpha",
  sequence: 1,
  chapterCardId: "chapter_one",
  committedAt: "2026-07-26T10:00:00.000Z",
  reversible: true,
  sourceWorkspaceRevision: 3,
  committedWorkspaceRevision: 4,
  sourceProjectRevision: 7,
  committedProjectRevision: 8,
  previousCommittedThroughChapterId: null,
  committedThroughChapterId: "chapter_one",
  previousChapterCommitId: null,
  placementChanges: [
    {
      placementId: "placement_letter",
      before: { status: "planned" as const, commitId: null },
      after: { status: "committed" as const, commitId: "commit_first" }
    }
  ],
  foreshadowingBeatChanges: [],
  fileChanges: [
    {
      fileId: "file_character_alice:current-state",
      path: "long/characters/alice/current-state.md",
      before: { revision: "v1:0:00000000", content: "" },
      after: {
        revision: "v1:1:1234abcd",
        content: "林岚已经收到来信。"
      }
    }
  ]
};

const chapterSummary = {
  timeline: "第一天雨夜收到旧信。",
  characterStates: "林岚开始怀疑寄信人。",
  factionStates: "守夜人尚未介入。",
  realmStates: "本章无境界变化。",
  foreshadowingStates: "蜡封线索已经种下。",
  continuityNotes: "下一章追查旧邮戳。"
};

const coverage = {
  character: { status: "changed" as const, note: "人物状态发生变化。" },
  plot: { status: "changed" as const, note: "来信事件已经发生。" },
  foreshadowing: {
    status: "changed" as const,
    note: "寄信人伏笔已经种下。"
  },
  world: { status: "unchanged" as const, note: "世界规则没有变化。" },
  knowledge: {
    status: "changed" as const,
    note: "林岚得知来信存在。"
  },
  openLoops: {
    status: "changed" as const,
    note: "新增寄信人身份悬而未决事项。"
  }
};

const chapterOutputs = {
  characterState: "林岚收到旧信，开始追查寄信人。",
  handoff: {
    summary: "下一章追查旧邮戳。",
    mustCarry: ["林岚持有不可燃烧的旧信。"],
    nextChapterConstraints: ["不能提前揭露寄信人身份。"],
    openLoops: ["loop_sender"]
  }
};

describe("long ledger contracts", () => {
  it("keeps schemaVersion 1 records readable with explicit legacy defaults", () => {
    const parsed = LongLedgerCommitRecordSchema.parse(record);
    expect(parsed.id).toBe("commit_first");
    expect(parsed.commitMessage).toBe("");
    expect(parsed.chapterSummary).toEqual({
      timeline: "",
      characterStates: "",
      factionStates: "",
      realmStates: "",
      foreshadowingStates: "",
      continuityNotes: ""
    });
    expect(parsed.placementChanges[0]?.note).toBe("");
    expect(parsed.foreshadowingThreadChanges).toEqual([]);
    expect(parsed.coverage.character).toEqual({
      status: "not_applicable",
      note: ""
    });
    expect(parsed.factChanges).toEqual([]);
    expect(parsed.knowledgeChanges).toEqual([]);
    expect(parsed.openLoopChanges).toEqual([]);
    expect(parsed.chapterOutputs).toEqual({
      characterState: "",
      handoff: {
        summary: "",
        mustCarry: [],
        nextChapterConstraints: [],
        openLoops: []
      }
    });
    expect(parsed.continuityFiles).toEqual([]);
  });

  it("round-trips commit message, six summaries, evidence and thread status", () => {
    const input = LongCommitChapterInputSchema.parse({
      bookId: "longbook_alpha",
      chapterCardId: "chapter_one",
      chapterFileRevisions: {
        body: "v1:0:00000000",
        characterState: "v1:0:00000000",
        handoff: "v1:0:00000000"
      },
      commitMessage: "确认雨夜来信章连续性",
      chapterSummary,
      placementDecisions: {
        placement_letter: {
          status: "committed",
          note: "正文明确写出林岚接过旧信。"
        }
      },
      foreshadowingBeatDecisions: {
        beat_letter: {
          status: "committed",
          note: "正文展示了不可熔化的蜡封。"
        }
      },
      fileUpdates: [],
      coverage,
      factMutations: [],
      knowledgeMutations: [],
      openLoopMutations: [],
      chapterOutputs,
      baseWorkspaceRevision: 3,
      baseProjectRevision: 7
    });
    if (input.mode !== "structured") {
      throw new Error("Expected legacy structured commit input.");
    }
    expect(input.mode).toBe("structured");
    expect(input.chapterSummary).toEqual(chapterSummary);

    const parsed = LongLedgerCommitRecordSchema.parse({
      ...record,
      commitMessage: input.commitMessage,
      chapterSummary: input.chapterSummary,
      placementChanges: [
        {
          ...record.placementChanges[0],
          note: input.placementDecisions.placement_letter!.note
        }
      ],
      foreshadowingThreadChanges: [
        {
          foreshadowingId: "foreshadow_letter",
          before: "planned",
          after: "open"
        }
      ]
    });
    expect(parsed).toMatchObject({
      commitMessage: "确认雨夜来信章连续性",
      chapterSummary,
      placementChanges: [
        { note: "正文明确写出林岚接过旧信。" }
      ],
      foreshadowingThreadChanges: [
        {
          foreshadowingId: "foreshadow_letter",
          before: "planned",
          after: "open"
        }
      ]
    });
  });

  it("accepts revision-only text-file commits and rejects duplicate files", () => {
    const input = {
      mode: "text_files" as const,
      bookId: "longbook_alpha",
      chapterCardId: "chapter_one",
      chapterFileRevisions: { body: "v1:0:00000000" },
      continuityFileRevisions: [
        {
          fileId: "file_chapter_one:character-state",
          revision: "v1:1:1234abcd"
        },
        {
          fileId: "file_chapter_one:continuity:foreshadowing-changes",
          revision: "v1:2:2345bcde"
        }
      ],
      foreshadowingBeatDecisions: {
        beat_letter: {
          status: "committed" as const,
          note: "正文明确写出旧信火漆上的月纹。"
        }
      },
      commitMessage: "提交第一章连续性文本文件",
      baseWorkspaceRevision: 3,
      baseProjectRevision: 7
    };
    const parsed = LongCommitChapterInputSchema.parse(input);
    expect(parsed).toMatchObject({
      mode: "text_files",
      chapterFileRevisions: { body: "v1:0:00000000" },
      continuityFileRevisions: input.continuityFileRevisions,
      foreshadowingBeatDecisions: input.foreshadowingBeatDecisions
    });
    expect(parsed).not.toHaveProperty("chapterSummary");
    expect(
      LongCommitChapterInputSchema.safeParse({
        ...input,
        continuityFileRevisions: [
          input.continuityFileRevisions[0],
          input.continuityFileRevisions[0]
        ]
      }).success
    ).toBe(false);
  });

  it("stores v4 continuity revisions without copied file text", () => {
    const continuityFiles = [
      {
        fileId: "file_chapter_one:continuity:foreshadowing-changes",
        path: "long/continuity/chapters/chapter_one/foreshadowing-changes.md",
        revision: "v1:2:2345bcde"
      }
    ];
    const parsed = LongLedgerCommitRecordSchema.parse({
      ...record,
      schemaVersion: 4,
      commitMessage: "提交第一章连续性文本文件",
      fileChanges: [],
      continuityFiles
    });
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.continuityFiles).toEqual(continuityFiles);
    expect(parsed.fileChanges).toEqual([]);
    expect(parsed.chapterSummary.timeline).toBe("");

    expect(
      LongLedgerCommitRecordSchema.safeParse({
        ...record,
        schemaVersion: 4,
        commitMessage: "错误地复制正文",
        continuityFiles
      }).success
    ).toBe(false);
  });

  it("round-trips v3 projection changes, coverage and chapter outputs", () => {
    const fact = {
      factId: "fact_alice-location",
      domain: "character" as const,
      subjectId: "character_alice",
      field: "location",
      value: "林岚家",
      sourceCommitId: "commit_first",
      sourceChapterCardId: "chapter_one",
      evidence: "正文写明林岚在家中接过旧信。"
    };
    const knowledge = {
      factId: "fact_alice-location",
      audienceType: "reader" as const,
      audienceId: null,
      level: "knows" as const,
      sourceCommitId: "commit_first",
      sourceChapterCardId: "chapter_one",
      evidence: "正文直接展示林岚所在地点。"
    };
    const openLoop = {
      loopId: "loop_sender",
      kind: "foreshadowing" as const,
      status: "open" as const,
      detail: "寄信人的身份尚未揭晓。",
      subjectId: "foreshadow_sender",
      factId: null,
      sourceCommitId: "commit_first",
      sourceChapterCardId: "chapter_one",
      evidence: "本章只展示蜡封线索。"
    };
    const parsed = LongLedgerCommitRecordSchema.parse({
      ...record,
      schemaVersion: 3,
      commitMessage: "核验并入账第一章",
      chapterSummary,
      placementChanges: [
        {
          ...record.placementChanges[0],
          note: "正文明确写出林岚收到旧信。"
        }
      ],
      coverage,
      factChanges: [{ before: null, after: fact }],
      knowledgeChanges: [{ before: null, after: knowledge }],
      openLoopChanges: [{ before: null, after: openLoop }],
      chapterOutputs
    });

    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.factChanges[0]?.after).toEqual(fact);
    expect(parsed.knowledgeChanges[0]?.after).toEqual(knowledge);
    expect(parsed.openLoopChanges[0]?.after).toEqual(openLoop);
    expect(parsed.chapterOutputs).toEqual(chapterOutputs);
  });

  it("rejects incomplete v3 records and duplicate mutation keys", () => {
    expect(
      LongLedgerCommitRecordSchema.safeParse({
        ...record,
        schemaVersion: 3,
        commitMessage: "核验并入账第一章",
        chapterSummary,
        placementChanges: [
          {
            ...record.placementChanges[0],
            note: "正文明确写出林岚收到旧信。"
          }
        ]
      }).success
    ).toBe(false);

    const mutation = {
      factId: "fact_alice-location",
      domain: "character" as const,
      subjectId: "character_alice",
      field: "location",
      value: "林岚家",
      evidence: "正文写明林岚在家中。"
    };
    expect(
      LongCommitChapterInputSchema.safeParse({
        bookId: "longbook_alpha",
        chapterCardId: "chapter_one",
        chapterFileRevisions: {
          body: "v1:0:00000000",
          characterState: "v1:0:00000000",
          handoff: "v1:0:00000000"
        },
        commitMessage: "核验并入账第一章",
        chapterSummary,
        placementDecisions: {},
        foreshadowingBeatDecisions: {},
        fileUpdates: [],
        coverage,
        factMutations: [mutation, mutation],
        knowledgeMutations: [],
        openLoopMutations: [],
        chapterOutputs,
        baseWorkspaceRevision: 3,
        baseProjectRevision: 7
      }).success
    ).toBe(false);
  });

  it("rejects revision skips and decisions assigned to another commit", () => {
    expect(
      LongLedgerCommitRecordSchema.safeParse({
        ...record,
        committedWorkspaceRevision: 5
      }).success
    ).toBe(false);
    expect(
      LongLedgerCommitRecordSchema.safeParse({
        ...record,
        placementChanges: [
          {
            ...record.placementChanges[0],
            after: {
              status: "committed",
              commitId: "commit_other"
            }
          }
        ]
      }).success
    ).toBe(false);
  });

  it("requires complete audit evidence for new records and commit commands", () => {
    expect(
      LongLedgerCommitRecordSchema.safeParse({
        ...record,
        schemaVersion: 2
      }).success
    ).toBe(false);
    expect(
      LongCommitChapterInputSchema.safeParse({
        bookId: "longbook_alpha",
        chapterCardId: "chapter_one",
        chapterFileRevisions: {
          body: "v1:0:00000000",
          characterState: "v1:0:00000000",
          handoff: "v1:0:00000000"
        },
        placementDecisions: {},
        foreshadowingBeatDecisions: {},
        fileUpdates: [],
        baseWorkspaceRevision: 3,
        baseProjectRevision: 7
      }).success
    ).toBe(false);
  });

  it("rejects duplicate decisions in persisted audit records", () => {
    expect(
      LongLedgerCommitRecordSchema.safeParse({
        ...record,
        placementChanges: [
          record.placementChanges[0],
          record.placementChanges[0]
        ]
      }).success
    ).toBe(false);
  });
});
