import { describe, expect, it, vi } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createHash } from "node:crypto";
import { Check } from "typebox/value";
import {
  DEFAULT_LONG_AGENT_PROFILES,
  LONG_BOOK_LINE_FILE_ID,
  LONG_CHARACTER_OVERVIEW_FILE_ID,
  LONG_CHARACTER_OVERVIEW_PATH,
  LongWorkspaceIndexSnapshotSchema,
  createLongWorkspaceNavigationSnapshot,
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
  longLedgerCommitFileId,
  longStoryPlotBodyFileId,
  longStoryPlotFilePath,
  longWorldbuildingFileId,
  longWorldbuildingItemContentPath,
  longWorldbuildingItemFileId,
  longWorldbuildingOverviewContentPath,
  longWorldbuildingOverviewFileId,
  type LongAgentId,
  type LongAgentProfile,
  type LongWorkspaceIndexSnapshot,
  type LongWorkspaceRoot,
  type LongWorkspaceRuntimeContext
} from "@deepwrite/contracts";
import {
  buildLongWorkspaceTools,
  selectLongChaptersForWritingScope,
  selectNextLongChapterForDispatch,
  type LongAgentToolDetails,
  type LongCommandExecutor
} from "./long-agent-tools";
import { toRuntimeEvents } from "./index";

const NOW = "2026-07-26T12:00:00.000Z";
const REVISION = "v1:0:00000000";
function file(id: string, path: string) {
  return { id, path, revision: REVISION, updatedAt: NOW };
}

function fixtureIndex(): LongWorkspaceIndexSnapshot {
  return LongWorkspaceIndexSnapshotSchema.parse({
    schemaVersion: 1,
    revision: 7,
    bookId: "longbook_tools",
    updatedAt: NOW,
    bookLine: file(LONG_BOOK_LINE_FILE_ID, "long/plot/book-line.md"),
    worldbuilding: [
      {
        id: "world_rules",
        title: "世界规则",
        order: 1,
        format: "text",
        contentAuthority: "markdown",
        file: file(
          longWorldbuildingFileId("world_rules"),
          "long/worldbuilding/rules.md"
        )
      }
    ],
    characterOverview: file(
      LONG_CHARACTER_OVERVIEW_FILE_ID,
      LONG_CHARACTER_OVERVIEW_PATH
    ),
    characters: [
      {
        id: "character_alice",
        name: "林岚",
        group: "protagonist",
        order: 1,
        aliases: []
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
          summary: ""
        }
      ],
      arcs: [
        {
          id: "arc_one",
          volumeId: "volume_one",
          title: "主线",
          order: 1,
          outline: ""
        }
      ],
      chapterCards: [
        {
          id: "chapter_one",
          volumeId: "volume_one",
          primaryArcId: "arc_one",
          title: "第一章",
          narrativeOrder: 1
        }
      ],
      storyEvents: [],
      storyPlots: [],
      eventConnections: [],
      narrativePlacements: [],
      foreshadowing: []
    },
    chapters: [
      {
        chapterCardId: "chapter_one",
        body: file(
          longChapterBodyFileId("chapter_one"),
          "long/chapters/one/body.md"
        ),
        card: file(
          longChapterCardFileId("chapter_one"),
          "long/chapters/one/card.md"
        ),
        characterState: file(
          longChapterCharacterStateFileId("chapter_one"),
          "long/chapters/one/character-state.md"
        ),
        handoff: file(
          longChapterHandoffFileId("chapter_one"),
          "long/chapters/one/handoff.md"
        ),
        commitId: null
      }
    ],
    ledger: {
      committedThroughChapterId: null,
      commits: []
    }
  });
}

function twoWrittenChaptersIndex(): LongWorkspaceIndexSnapshot {
  const index = fixtureIndex();
  index.chapters[0]!.bodyStatus = "written";
  index.plot.chapterCards.push({
    id: "chapter_two",
    volumeId: "volume_one",
    primaryArcId: "arc_one",
    title: "第二章",
    narrativeOrder: 2
  });
  index.chapters.push({
    chapterCardId: "chapter_two",
    bodyStatus: "written",
    body: file(
      longChapterBodyFileId("chapter_two"),
      "long/chapters/two/body.md"
    ),
    card: file(
      longChapterCardFileId("chapter_two"),
      "long/chapters/two/card.md"
    ),
    characterState: file(
      longChapterCharacterStateFileId("chapter_two"),
      "long/chapters/two/character-state.md"
    ),
    handoff: file(
      longChapterHandoffFileId("chapter_two"),
      "long/chapters/two/handoff.md"
    ),
    foreshadowingChanges: file(
      longChapterForeshadowingChangesFileId("chapter_two"),
      longChapterContinuityFilePath("chapter_two", "foreshadowing-changes.md")
    ),
    worldReveals: null,
    characterContinuity: [],
    commitId: null
  });
  return LongWorkspaceIndexSnapshotSchema.parse(index);
}

function fixtureWorldFile(index = fixtureIndex()) {
  const category = index.worldbuilding[0]!;
  if (category.format !== "text") {
    throw new Error("Expected the fixture worldbuilding category to be text.");
  }
  return category.file;
}

function fixtureWorldbuildingIndex(): LongWorkspaceIndexSnapshot {
  const index = fixtureIndex();
  return LongWorkspaceIndexSnapshotSchema.parse({
    ...index,
    worldbuilding: [
      ...index.worldbuilding,
      {
        id: "world_magic",
        title: "魔法体系",
        order: 2,
        format: "list",
        contentAuthority: "files",
        overview: file(
          longWorldbuildingOverviewFileId("world_magic"),
          longWorldbuildingOverviewContentPath("world_magic")
        ),
        items: [
          {
            id: "worlditem_memory",
            title: "记忆代价",
            order: 1,
            file: file(
              longWorldbuildingItemFileId("worlditem_memory"),
              longWorldbuildingItemContentPath(
                "world_magic",
                "worlditem_memory"
              )
            )
          },
          {
            id: "worlditem_blood",
            title: "血脉门槛",
            order: 2,
            file: file(
              longWorldbuildingItemFileId("worlditem_blood"),
              longWorldbuildingItemContentPath(
                "world_magic",
                "worlditem_blood"
              )
            )
          }
        ]
      }
    ]
  });
}

const STORY_PLOT_BODY = "城门外初遇追兵，埋下北上线索。";

function fixtureStoryPlotIndex(): LongWorkspaceIndexSnapshot {
  const index = fixtureIndex();
  return LongWorkspaceIndexSnapshotSchema.parse({
    ...index,
    plot: {
      ...index.plot,
      storyPlots: [
        {
          id: "storyplot_one",
          arcId: "arc_one",
          title: "城门初遇",
          order: 1,
          file: file(
            longStoryPlotBodyFileId("storyplot_one"),
            longStoryPlotFilePath("storyplot_one")
          )
        }
      ]
    }
  });
}

function storyPlotExecutor(index: LongWorkspaceIndexSnapshot) {
  return vi.fn<LongCommandExecutor>(async (command) => {
    if (command.type === "long.getWorkspaceIndex") {
      return indexResult(index);
    }
    if (command.type === "long.readDocument") {
      const storyPlot = index.plot.storyPlots[0]!;
      if (command.payload.fileId !== storyPlot.file.id) {
        throw new Error("Unexpected story plot file.");
      }
      return {
        status: "accepted" as const,
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          file: storyPlot.file,
          content: STORY_PLOT_BODY,
          offset: command.payload.offset,
          totalCharacters: Array.from(STORY_PLOT_BODY).length,
          nextOffset: null,
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    }
    throw new Error(`Unexpected command: ${command.type}`);
  });
}

function resultText(result: { content: readonly unknown[] }): string {
  const block = result.content[0];
  if (
    !block ||
    typeof block !== "object" ||
    !((block as { type?: unknown }).type === "text") ||
    typeof (block as { text?: unknown }).text !== "string"
  ) {
    throw new Error("Expected a text tool result.");
  }
  return (block as { text: string }).text;
}

function expectNoPhysicalWorldbuildingMetadata(text: string) {
  expect(text).not.toContain("longbook_tools");
  expect(text).not.toContain("file_");
  expect(text).not.toContain("long/worldbuilding/");
  expect(text).not.toContain(REVISION);
  expect(text).not.toContain("workspaceRevision");
  expect(text).not.toContain("projectRevision");
  expect(text).not.toContain("updatedAt");
}

function committedFixtureIndex(): LongWorkspaceIndexSnapshot {
  const index = structuredClone(fixtureIndex());
  index.chapters[0]!.bodyStatus = "written";
  index.chapters[0]!.commitId = "commit_one";
  index.ledger.committedThroughChapterId = "chapter_one";
  index.ledger.commits = [
      {
        id: "commit_one",
        mode: "structured",
        sequence: 1,
      chapterCardId: "chapter_one",
      committedAt: NOW,
      reversible: true,
      sourceRevision: 6,
      placementIds: [],
      foreshadowingBeatIds: [],
      recordFile: file(
        longLedgerCommitFileId("commit_one"),
        "long/ledger/commit-one.json"
      )
    }
  ];
  return LongWorkspaceIndexSnapshotSchema.parse(index);
}

function profile(id: LongAgentId): LongAgentProfile {
  return structuredClone(
    DEFAULT_LONG_AGENT_PROFILES.find((candidate) => candidate.id === id)!
  );
}

function workspace(
  agentId: LongAgentId,
  activeRoot: LongWorkspaceRoot,
  activeChapterCardId?: string
): LongWorkspaceRuntimeContext {
  const index = fixtureIndex();
  return {
    bookId: index.bookId,
    title: "工具测试",
    activeRoot,
    activeAgentId: agentId,
    ...(activeChapterCardId ? { activeChapterCardId } : {}),
    workspaceRevision: index.revision,
    projectRevision: 11,
    navigation: createLongWorkspaceNavigationSnapshot(index)
  };
}

function toolByName(tools: AgentTool[], name: string): AgentTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool: ${name}`);
  return tool;
}

function indexResult(
  index: LongWorkspaceIndexSnapshot = fixtureIndex(),
  projectRevision = 11
) {
  return {
    status: "accepted" as const,
    requestId: "query-index",
    payload: {
      bookId: index.bookId,
      workspaceIndex: index,
      projectRevision
    }
  };
}

describe("long workspace agent tools", () => {
  it("assembles exact query and proposal tools by long capability only", () => {
    const worldNames = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-world",
      runId: "run-world"
    }).map((tool) => tool.name);
    const characterNames = buildLongWorkspaceTools({
      workspace: workspace("setting", "character_design"),
      profile: profile("setting"),
      sessionId: "session-character",
      runId: "run-character"
    }).map((tool) => tool.name);
    const writerNames = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft", "chapter_one"),
      profile: profile("draft"),
      sessionId: "session-writer",
      runId: "run-writer"
    }).map((tool) => tool.name);
    const ledgerNames = buildLongWorkspaceTools({
      workspace: workspace("continuity_ledger", "continuity_ledger", "chapter_one"),
      profile: profile("continuity_ledger"),
      sessionId: "session-ledger",
      runId: "run-ledger"
    }).map((tool) => tool.name);
    const ledgerReadOnlyNames = buildLongWorkspaceTools({
      workspace: workspace("continuity_ledger", "continuity_ledger"),
      profile: profile("continuity_ledger"),
      sessionId: "session-ledger-read-only",
      runId: "run-ledger-read-only"
    }).map((tool) => tool.name);
    const draftNames = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft"),
      profile: profile("draft"),
      sessionId: "session-draft",
      runId: "run-draft"
    }).map((tool) => tool.name);
    const plotNames = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-plot",
      runId: "run-plot"
    }).map((tool) => tool.name);
    const forgedSettingProfile = profile("setting");
    forgedSettingProfile.writeAccess.capabilities.push(
      "write_chapter_files"
    );
    forgedSettingProfile.writeAccess.workspaceRoots.push("draft");
    const forgedSettingNames = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding", "chapter_one"),
      profile: forgedSettingProfile,
      sessionId: "session-forged-setting",
      runId: "run-forged-setting"
    }).map((tool) => tool.name);
    const rootlessLedgerProfile = profile("continuity_ledger");
    rootlessLedgerProfile.writeAccess.workspaceRoots =
      rootlessLedgerProfile.writeAccess.workspaceRoots.filter(
        (root) => root !== "continuity_ledger"
      );
    const rootlessLedgerNames = buildLongWorkspaceTools({
      workspace: workspace(
        "continuity_ledger",
        "continuity_ledger",
        "chapter_one"
      ),
      profile: rootlessLedgerProfile,
      sessionId: "session-rootless-ledger",
      runId: "run-rootless-ledger"
    }).map((tool) => tool.name);

    const settingNames = [
      "query_linked_material_entries",
      "load_skill",
      "get_long_chapter_readiness",
      "list_setting",
      "search_setting",
      "read_setting",
      "create_setting",
      "write_setting",
      "edit_setting",
      "list_plot_design",
      "search_plot_design",
      "read_plot_design",
      "propose_long_mutation",
      "list_chapters",
      "search_chapters",
      "read_chapter",
      "list_continuity_files",
      "read_continuity_file"
    ];
    expect(worldNames).toEqual(settingNames);
    expect(characterNames).toEqual(settingNames);
    expect(worldNames).not.toEqual(
      expect.arrayContaining([
        "get_long_workspace_index",
        "read_long_document",
        "search_long_workspace",
        "list_worldbuilding",
        "list_characters"
      ])
    );
    const characterMutationSchema = JSON.stringify(
      toolByName(
        buildLongWorkspaceTools({
          workspace: workspace("setting", "character_design"),
          profile: profile("setting"),
          sessionId: "session-character-schema",
          runId: "run-character-schema"
        }),
        "propose_long_mutation"
      ).parameters
    );
    expect(characterMutationSchema).toContain('"character.update"');
    expect(characterMutationSchema).toContain('"worldbuilding.update"');
    expect(characterMutationSchema).not.toContain('"character.create"');
    expect(characterMutationSchema).not.toContain('"worldbuildingItem.create"');
    expect(characterMutationSchema).not.toContain('"document_updates"');
    expect(writerNames).toEqual([
      "query_linked_material_entries",
      "load_skill",
      "get_long_chapter_readiness",
      "list_setting",
      "search_setting",
      "read_setting",
      "list_plot_design",
      "search_plot_design",
      "read_plot_design",
      "propose_long_chapter_dispatch",
      "list_chapters",
      "search_chapters",
      "read_chapter",
      "write_chapter_draft",
      "edit_chapter_draft",
      "list_continuity_files",
      "read_continuity_file"
    ]);
    expect(ledgerNames).toEqual([
      "query_linked_material_entries",
      "load_skill",
      "get_long_chapter_readiness",
      "list_setting",
      "search_setting",
      "read_setting",
      "list_plot_design",
      "search_plot_design",
      "read_plot_design",
      "list_chapters",
      "search_chapters",
      "read_chapter",
      "list_continuity_files",
      "read_continuity_file",
      "create_continuity_file",
      "delete_continuity_file",
      "write_continuity_file",
      "edit_continuity_file",
      "propose_continuity_commit"
    ]);
    expect(ledgerReadOnlyNames).toEqual([
      "query_linked_material_entries",
      "load_skill",
      "get_long_chapter_readiness",
      "list_setting",
      "search_setting",
      "read_setting",
      "list_plot_design",
      "search_plot_design",
      "read_plot_design",
      "list_chapters",
      "search_chapters",
      "read_chapter",
      "list_continuity_files",
      "read_continuity_file",
      "create_continuity_file",
      "delete_continuity_file",
      "write_continuity_file",
      "edit_continuity_file",
      "propose_continuity_commit"
    ]);
    expect(draftNames).toEqual([
      "query_linked_material_entries",
      "load_skill",
      "get_long_chapter_readiness",
      "list_setting",
      "search_setting",
      "read_setting",
      "list_plot_design",
      "search_plot_design",
      "read_plot_design",
      "propose_long_chapter_dispatch",
      "list_chapters",
      "search_chapters",
      "read_chapter",
      "list_continuity_files",
      "read_continuity_file"
    ]);
    expect(plotNames).toEqual([
      "query_linked_material_entries",
      "load_skill",
      "get_long_chapter_readiness",
      "list_setting",
      "search_setting",
      "read_setting",
      "list_plot_design",
      "search_plot_design",
      "read_plot_design",
      "create_plot_design",
      "write_plot_design",
      "edit_plot_design",
      "propose_long_mutation",
      "propose_long_chapter_dispatch",
      "list_chapters",
      "search_chapters",
      "read_chapter",
      "list_continuity_files",
      "read_continuity_file"
    ]);
    const plotTools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-plot-schema",
      runId: "run-plot-schema"
    });
    const plotMutationSchema = JSON.stringify(
      toolByName(plotTools, "propose_long_mutation").parameters
    );
    const plotMutationDescription = toolByName(
      plotTools,
      "propose_long_mutation"
    ).description;
    expect(plotMutationDescription).toContain("连续性记录只作参考");
    expect(plotMutationDescription).toContain("不锁定这些结构");
    expect(plotMutationDescription).toContain("级联清理该章正文与记录");
    expect(plotMutationDescription).toContain("剧情点关联可为 null");
    expect(plotMutationDescription).toContain("预检失败不会生成审批卡");
    expect(toolByName(plotTools, "read_plot_design").description).toContain(
      "读取剧情点时一次返回概要"
    );
    expect(toolByName(plotTools, "write_plot_design").description).toContain(
      "读取剧情点（mode=full）也会同时建立其下故事事件与故事情节的完整读取凭据"
    );
    expect(toolByName(plotTools, "edit_plot_design").description).toContain(
      "读取剧情点（mode=full）后可直接局部修改该剧情点及其下故事事件、故事情节"
    );
    expect(plotMutationSchema).toContain("toPrimaryArcId 非空时必须属于该分卷");
    expect(plotMutationSchema).toContain('"null"');
    expect(plotMutationSchema).toContain('"foreshadowing.create"');
    expect(plotMutationSchema).toContain('"foreshadowingBeat.create"');
    expect(plotMutationSchema).toContain('"volume.update"');
    expect(plotMutationSchema).toContain('"storyPlot.update"');
    expect(plotMutationSchema).toContain('"storyPlot.delete"');
    expect(plotMutationSchema).toContain('"storyPlot.reorder"');
    expect(plotMutationSchema).not.toContain('"storyPlot.create"');
    expect(plotMutationSchema).not.toContain('"volume.create"');
    expect(plotMutationSchema).not.toContain('"arc.create"');
    expect(plotMutationSchema).not.toContain('"chapter.create"');
    expect(plotMutationSchema).not.toContain('"event.create"');
    expect(plotMutationSchema).not.toContain('"connection.create"');
    expect(plotMutationSchema).not.toContain('"placement.create"');
    expect(plotMutationSchema).not.toContain('"document_updates"');
    expect(
      [...worldNames, ...characterNames, ...writerNames, ...ledgerNames]
    ).not.toContain("write_workspace_editor");
    expect(forgedSettingNames).not.toContain("write_chapter_draft");
    expect(rootlessLedgerNames).not.toContain(
      "propose_continuity_commit"
    );
  });

  it("publishes unified setting tools with provider-compatible object roots", () => {
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-setting-provider-schema",
      runId: "run-setting-provider-schema"
    });

    for (const name of [
      "list_setting",
      "search_setting",
      "read_setting",
      "create_setting",
      "write_setting",
      "edit_setting"
    ]) {
      const schema = toolByName(tools, name).parameters as {
        type?: unknown;
        anyOf?: unknown;
      };
      expect(schema.type).toBe("object");
      expect(schema.anyOf).toBeInstanceOf(Array);
    }

    const listSchema = toolByName(tools, "list_setting").parameters;
    expect(Check(listSchema, { domain: "worldbuilding" })).toBe(true);
    expect(Check(listSchema, { domain: "character" })).toBe(true);
    expect(Check(listSchema, {})).toBe(false);
  });

  it("rejects a cross-volume chapter move before creating an approval proposal", async () => {
    const source = fixtureIndex();
    source.plot.volumes.push({
      id: "volume_prologue",
      title: "开篇/楔子卷",
      order: 2,
      summary: ""
    });
    const index = LongWorkspaceIndexSnapshotSchema.parse(source);
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-cross-volume-chapter-move",
      runId: "run-cross-volume-chapter-move",
      executor
    });

    const result = await toolByName(
      tools,
      "propose_long_mutation"
    ).execute("cross-volume-chapter-move", {
      operations: [
        {
          type: "chapter.move",
          id: "chapter_one",
          toVolumeId: "volume_prologue",
          toPrimaryArcId: "arc_one"
        }
      ],
      summary: "将楔子章移入开篇卷并保留正片弧"
    });

    expect(result.details).toEqual({ kind: "none" });
    expect(resultText(result)).toContain("未形成长篇结构变更提案");
    expect(resultText(result)).toContain("开篇/楔子卷");
    expect(resultText(result)).toContain("主线");
    expect(resultText(result)).toContain("非空剧情点关联必须与章卡属于同一分卷");
    expect(resultText(result)).toContain("不会生成审批卡");
    expect(resultText(result)).toContain("将剧情点关联设为 null");

    const createResult = await toolByName(
      tools,
      "create_plot_design"
    ).execute("cross-volume-chapter-create", {
      domain: "worldbuilding", item: {
        kind: "chapter",
        volume_id: "volume_prologue",
        primary_arc_id: "arc_one",
        title: "楔子章"
      },
      summary: "在开篇卷创建绑定正片弧的楔子章"
    });
    expect(createResult.details).toEqual({ kind: "none" });
    expect(resultText(createResult)).toContain("章卡创建存在跨卷绑定");
    expect(resultText(createResult)).toContain("不会生成审批卡");

    const orderedResult = await toolByName(
      tools,
      "propose_long_mutation"
    ).execute("move-arc-before-chapter", {
      operations: [
        {
          type: "arc.move",
          id: "arc_one",
          toVolumeId: "volume_prologue"
        },
        {
          type: "chapter.move",
          id: "chapter_one",
          toVolumeId: "volume_prologue",
          toPrimaryArcId: "arc_one"
        }
      ],
      summary: "先移动主线，再核对章卡归属"
    });
    expect(orderedResult.details).toMatchObject({
      kind: "long-mutation-proposal"
    });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("preflights plot-specific writes against committed event locks", async () => {
    const source = fixtureIndex();
    source.plot.storyEvents.push({
      id: "event_committed",
      title: "楔子事件",
      summary: "楔子中已经发生的事件。",
      timeMode: "sequence",
      timeLabel: "故事开始前",
      storyOrder: 1,
      location: "旧城门",
      arcIds: ["arc_one"],
      characterIds: ["character_alice"]
    });
    source.plot.narrativePlacements.push({
      id: "placement_committed",
      eventId: "event_committed",
      chapterCardId: "chapter_one",
      orderInChapter: 1,
      mode: "scene",
      disclosure: "full",
      writingPrompt: "完整呈现楔子事件。",
      status: "committed",
      commitId: "commit_one"
    });
    source.chapters[0]!.commitId = "commit_one";
    source.ledger.committedThroughChapterId = "chapter_one";
    source.ledger.commits.push({
      id: "commit_one",
      mode: "structured",
      sequence: 1,
      chapterCardId: "chapter_one",
      committedAt: NOW,
      reversible: true,
      sourceRevision: 6,
      placementIds: ["placement_committed"],
      foreshadowingBeatIds: [],
      recordFile: file(
        longLedgerCommitFileId("commit_one"),
        "long/ledger/commit-one.json"
      )
    });
    const index = LongWorkspaceIndexSnapshotSchema.parse(source);
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-committed-event-write",
      runId: "run-committed-event-write",
      executor
    });

    await toolByName(tools, "read_plot_design").execute(
      "read-committed-event",
      {
        target: { kind: "event", event_id: "event_committed" },
        mode: "full"
      }
    );
    const result = await toolByName(tools, "write_plot_design").execute(
      "write-committed-event",
      {
        domain: "character", item: {
          kind: "event",
          event_id: "event_committed",
          summary: "试图改变已经提交的事件。",
          time_mode: "sequence",
          time_label: "故事开始前",
          location: "旧城门",
          arc_ids: ["arc_one"],
          character_ids: ["character_alice"]
        },
        allow_overwrite_existing: true,
        summary: "修改已提交事件"
      }
    );

    expect(result.details).toMatchObject({
      kind: "long-mutation-proposal"
    });
  });

  it("loads only long-bound resources allowed by the active long profile", async () => {
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-resources",
      runId: "run-resources",
      attachedMaterials: [
        {
          id: "material-plot",
          title: "潮汐设定",
          source: "attached-material",
          kind: "plot",
          content: "逆潮每十年出现一次。"
        },
        {
          id: "material-draft",
          title: "正文样章",
          source: "attached-material",
          kind: "draft",
          content: "世界观智能体不应读取这段。"
        }
      ],
      attachedSkills: [
        {
          id: "skill-general",
          title: "规则一致性",
          source: "attached-skill",
          kind: "general",
          content: "先检查规则是否自洽。"
        }
      ]
    });
    const listed = await toolByName(
      tools,
      "query_linked_material_entries"
    ).execute("list-materials", { mode: "list" });
    expect(listed.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("潮汐设定")
    });
    expect(JSON.stringify(listed.content)).toContain("正文样章");

    const skill = await toolByName(tools, "load_skill").execute(
      "load-skill",
      { name: "规则一致性" }
    );
    expect(skill.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("先检查规则是否自洽")
    });
  });

  it("lists plot design as paragraph text without pagination", async () => {
    const index = fixtureIndex();
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-plot-list",
      runId: "run-plot-list",
      executor
    });
    const list = toolByName(tools, "list_plot_design");

    expect(JSON.stringify(list.parameters)).not.toContain('"page"');
    expect(JSON.stringify(list.parameters)).not.toContain('"limit"');
    expect(Check(list.parameters, {})).toBe(true);
    expect(Check(list.parameters, { kind: "arc", volume_id: "volume_one" })).toBe(
      true
    );
    expect(Check(list.parameters, { page: 1, limit: 1 })).toBe(false);

    const kindsText = resultText(await list.execute("list-kinds", {}));
    expect(() => JSON.parse(kindsText)).toThrow();
    expect(kindsText).toBe(
      [
        "剧情结构",
        "",
        "全书故事线",
        "kind=book_line",
        "条目数=1",
        "",
        "分卷",
        "kind=volume",
        "条目数=1",
        "",
        "剧情点",
        "kind=arc",
        "条目数=1",
        "",
        "故事情节",
        "kind=story_plot",
        "条目数=0",
        "",
        "章卡",
        "kind=chapter",
        "条目数=1",
        "",
        "故事事件",
        "kind=event",
        "条目数=0",
        "",
        "事件连接",
        "kind=connection",
        "条目数=0",
        "",
        "叙事落点",
        "kind=placement",
        "条目数=0"
      ].join("\n")
    );
    expect(kindsText).not.toContain("next_page");
    expect(kindsText).not.toContain("fileId");

    const bookLineText = resultText(
      await list.execute("list-book-line", { kind: "book_line" })
    );
    expect(bookLineText).toBe(["全书故事线", "kind=book_line"].join("\n"));

    const arcsText = resultText(
      await list.execute("list-arcs", { kind: "arc", volume_id: "volume_one" })
    );
    expect(() => JSON.parse(arcsText)).toThrow();
    expect(arcsText).toBe(
      [
        "剧情点",
        "",
        "主线",
        "arc_id=arc_one",
        "volume_id=volume_one",
        "顺序=1"
      ].join("\n")
    );

    const chaptersText = resultText(
      await list.execute("list-chapters", { kind: "chapter" })
    );
    expect(chaptersText).toBe(
      [
        "章卡",
        "",
        "第一章",
        "chapter_card_id=chapter_one",
        "volume_id=volume_one",
        "primary_arc_id=arc_one",
        "叙事顺序=1"
      ].join("\n")
    );

    const emptyEventsText = resultText(
      await list.execute("list-events", { kind: "event" })
    );
    expect(emptyEventsText).toBe(["故事事件", "（暂无故事事件）"].join("\n\n"));
  });

  it("reads plot design as paragraph text instead of JSON", async () => {
    const index = structuredClone(fixtureIndex());
    index.plot.volumes[0]!.title = "第一卷 青阳城·凡界蝼蚁";
    index.plot.volumes[0]!.summary = [
      "约1—180章，境界从凡人、炼气推进至筑基。核心是从被家族判定无望的蝼蚁，到拥有走出凡界资格的修士。本卷承担世界与金手指落地、主角性格建立、第一批敌友登场，青云宗成长体系展开，以及父亲失踪主线第一次抬头。",
      "外部矛盾：凌家主脉及赵昊凭天资和资源垄断羞辱主角；进入青云宗后，外门规则、资深弟子与资源匮乏继续压迫。"
    ].join("\n\n");
    index.plot.arcs[0]!.summary = "从凡界蝼蚁走到宗门门槛。";
    index.plot.arcs[0]!.outline = "城门受辱后转入青云宗试炼。";
    const snapshot = LongWorkspaceIndexSnapshotSchema.parse(index);
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(snapshot);
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-plot-read-paragraphs",
      runId: "run-plot-read-paragraphs",
      executor
    });
    const read = toolByName(tools, "read_plot_design");

    const volumeText = resultText(
      await read.execute("read-volume", {
        target: { kind: "volume", volume_id: "volume_one" },
        mode: "full"
      })
    );
    expect(() => JSON.parse(volumeText)).toThrow();
    expect(volumeText).not.toContain('"kind"');
    expect(volumeText).not.toContain('"volume_id"');
    expect(volumeText).not.toContain("\\n");
    expect(volumeText).toBe(
      [
        "完整内容：",
        "",
        "第一卷 青阳城·凡界蝼蚁",
        "kind=volume",
        "volume_id=volume_one",
        "顺序=1",
        "",
        "概要",
        "约1—180章，境界从凡人、炼气推进至筑基。核心是从被家族判定无望的蝼蚁，到拥有走出凡界资格的修士。本卷承担世界与金手指落地、主角性格建立、第一批敌友登场，青云宗成长体系展开，以及父亲失踪主线第一次抬头。",
        "",
        "外部矛盾：凌家主脉及赵昊凭天资和资源垄断羞辱主角；进入青云宗后，外门规则、资深弟子与资源匮乏继续压迫。"
      ].join("\n")
    );

    const arcText = resultText(
      await read.execute("read-arc", {
        target: { kind: "arc", arc_id: "arc_one" },
        mode: "full"
      })
    );
    expect(() => JSON.parse(arcText)).toThrow();
    expect(arcText).toBe(
      [
        "完整内容：",
        "",
        "主线",
        "kind=arc",
        "arc_id=arc_one",
        "volume_id=volume_one",
        "顺序=1",
        "",
        "概要",
        "从凡界蝼蚁走到宗门门槛。",
        "",
        "大纲",
        "城门受辱后转入青云宗试炼。",
        "",
        "故事事件",
        "",
        "（暂无故事事件）",
        "",
        "故事情节",
        "",
        "（暂无故事情节）"
      ].join("\n")
    );
    expect(read.description).toContain("读取剧情点时一次返回概要");
    expect(read.description).toContain("全部故事事件");
    expect(read.description).toContain("不要再分别为这些故事事件或故事情节调用本工具");
  });

  it("reads a plot point with story-event bodies, story-plot bodies, and related foreshadowing", async () => {
    const index = structuredClone(fixtureStoryPlotIndex());
    index.plot.arcs[0]!.summary = "从城门走到北上。";
    index.plot.arcs.push({
      id: "arc_two",
      volumeId: "volume_one",
      title: "支线",
      order: 2,
      outline: ""
    });
    index.plot.storyPlots.push({
      id: "storyplot_two",
      arcId: "arc_one",
      title: "北上启程",
      order: 2,
      file: file(
        longStoryPlotBodyFileId("storyplot_two"),
        longStoryPlotFilePath("storyplot_two")
      )
    });
    index.plot.storyEvents.push(
      {
        id: "event_gate",
        title: "城门初遇",
        summary: "追兵在城门外拦住主角，埋下北上线索。",
        timeMode: "sequence",
        timeLabel: "第一夜",
        storyOrder: 1,
        location: "南城门",
        arcIds: ["arc_one"],
        characterIds: ["character_alice"]
      },
      {
        id: "event_depart",
        title: "连夜北上",
        summary: "主角带着旧信离开青阳城。",
        timeMode: "sequence",
        timeLabel: "第二夜",
        storyOrder: 2,
        location: "官道",
        arcIds: ["arc_one"],
        characterIds: ["character_alice"]
      },
      {
        id: "event_other",
        title: "支线密谈",
        summary: "不该出现在主线剧情点里。",
        timeMode: "sequence",
        timeLabel: "同时",
        storyOrder: 3,
        location: "茶馆",
        arcIds: ["arc_two"],
        characterIds: ["character_alice"]
      }
    );
    index.plot.foreshadowing.push(
      {
        id: "foreshadow_letter",
        title: "旧信来源",
        coreQuestion: "旧信是谁留下的？",
        hiddenTruth: "父亲仍在北境。",
        plannedSpan: "within_volume",
        truthEventId: null,
        expectedReaderEffect: "让读者盯住蜡封。",
        status: "planned",
        beats: [
          {
            id: "beat_letter_plant",
            type: "plant",
            order: 1,
            arcId: "arc_one",
            eventId: "event_gate",
            placementId: null,
            chapterCardId: null,
            plannedScope: "城门初遇时露出半张旧信。",
            note: "只给图案，不给署名。",
            status: "planned",
            commitId: null
          }
        ]
      },
      {
        id: "foreshadow_other",
        title: "无关伏笔",
        coreQuestion: "茶馆里的人是谁？",
        truthEventId: null,
        expectedReaderEffect: "不应出现在主线剧情点。",
        status: "planned",
        beats: [
          {
            id: "beat_other",
            type: "plant",
            order: 1,
            arcId: "arc_two",
            eventId: "event_other",
            placementId: null,
            chapterCardId: null,
            plannedScope: "支线密谈",
            note: "只属于支线。",
            status: "planned",
            commitId: null
          }
        ]
      }
    );
    const snapshot = LongWorkspaceIndexSnapshotSchema.parse(index);
    const storyPlotBodies = new Map([
      [longStoryPlotBodyFileId("storyplot_one"), STORY_PLOT_BODY],
      [longStoryPlotBodyFileId("storyplot_two"), "连夜收拾行装，按旧信指示北上。"]
    ]);
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(snapshot);
      }
      if (command.type === "long.readDocument") {
        const content = storyPlotBodies.get(command.payload.fileId);
        if (content === undefined) {
          throw new Error(`Unexpected document: ${command.payload.fileId}`);
        }
        const storyPlot = snapshot.plot.storyPlots.find(
          (entry) => entry.file.id === command.payload.fileId
        );
        if (!storyPlot) {
          throw new Error("Missing story plot file.");
        }
        return {
          status: "accepted" as const,
          requestId: command.id,
          payload: {
            bookId: snapshot.bookId,
            file: storyPlot.file,
            content,
            offset: command.payload.offset,
            totalCharacters: Array.from(content).length,
            nextOffset: null,
            workspaceRevision: snapshot.revision,
            projectRevision: 11
          }
        };
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-plot-point-bundle",
      runId: "run-plot-point-bundle",
      executor
    });
    const read = toolByName(tools, "read_plot_design");
    const arcText = resultText(
      await read.execute("read-arc-bundle", {
        target: { kind: "arc", arc_id: "arc_one" },
        mode: "full"
      })
    );

    expect(arcText).toContain("概要");
    expect(arcText).toContain("从城门走到北上。");
    expect(arcText).toContain("故事事件");
    expect(arcText).toContain("event_id=event_gate");
    expect(arcText).toContain("追兵在城门外拦住主角，埋下北上线索。");
    expect(arcText).toContain("event_id=event_depart");
    expect(arcText).toContain("主角带着旧信离开青阳城。");
    expect(arcText).not.toContain("event_id=event_other");
    expect(arcText).not.toContain("不该出现在主线剧情点里");
    expect(arcText).toContain("故事情节");
    expect(arcText).toContain("story_plot_id=storyplot_one");
    expect(arcText).toContain(STORY_PLOT_BODY);
    expect(arcText).toContain("story_plot_id=storyplot_two");
    expect(arcText).toContain("连夜收拾行装，按旧信指示北上。");
    expect(arcText).toContain("关联伏笔");
    expect(arcText).toContain("foreshadowing_id=foreshadow_letter");
    expect(arcText).toContain("旧信是谁留下的？");
    expect(arcText).toContain("父亲仍在北境。");
    expect(arcText).toContain("beat_id=beat_letter_plant");
    expect(arcText).toContain("只给图案，不给署名。");
    expect(arcText).not.toContain("foreshadowing_id=foreshadow_other");
    expect(arcText).not.toContain("不应出现在主线剧情点");

    const writeEvent = await toolByName(tools, "write_plot_design").execute(
      "write-event-after-arc-read",
      {
        item: {
          kind: "event",
          event_id: "event_gate",
          summary: "追兵改从西门包抄。",
          time_mode: "sequence",
          time_label: "第一夜",
          location: "西城门",
          arc_ids: ["arc_one"],
          character_ids: ["character_alice"]
        },
        allow_overwrite_existing: true,
        summary: "改写城门事件"
      }
    );
    expect(writeEvent.details).toMatchObject({
      kind: "long-mutation-proposal",
      summary: "改写城门事件"
    });

    const writePlot = await toolByName(tools, "write_plot_design").execute(
      "write-story-plot-after-arc-read",
      {
        item: {
          kind: "story_plot",
          story_plot_id: "storyplot_one",
          text: "城门外改道西门，北上线索仍在。"
        },
        allow_overwrite_existing: true,
        summary: "改写故事情节正文"
      }
    );
    expect(writePlot.details).toMatchObject({
      kind: "long-mutation-proposal",
      summary: "改写故事情节正文",
      batch: {
        documentWrites: [
          {
            fileId: longStoryPlotBodyFileId("storyplot_one"),
            content: "城门外改道西门，北上线索仍在。"
          }
        ]
      }
    });
  });

  it("uses business-level plot tools for non-foreshadowing content", async () => {
    const index = fixtureIndex();
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-plot-business-tools",
      runId: "run-plot-business-tools",
      executor
    });

    const listed = await toolByName(tools, "list_plot_design").execute(
      "list-arcs",
      { kind: "arc", volume_id: "volume_one" }
    );
    const listedText = listed.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    expect(listedText).toContain("arc_id=arc_one");
    expect(listedText).not.toContain("fileId");

    await toolByName(tools, "read_plot_design").execute("read-arc", {
      target: { kind: "arc", arc_id: "arc_one" },
      mode: "full"
    });
    const edit = await toolByName(tools, "edit_plot_design").execute(
      "edit-arc",
      {
        item: {
          kind: "arc",
          arc_id: "arc_one",
          patch: { outline: "更新后的剧情点故事情节" }
        },
        summary: "细化剧情点"
      }
    );
    expect(edit.details).toMatchObject({
      kind: "long-mutation-proposal",
      summary: "细化剧情点",
      batch: {
        operations: [
          {
            type: "arc.update",
            id: "arc_one",
            patch: { outline: "更新后的剧情点故事情节" }
          }
        ]
      }
    });

    const create = await toolByName(tools, "create_plot_design").execute(
      "create-arc",
      {
        domain: "worldbuilding", item: {
          kind: "arc",
          volume_id: "volume_one",
          title: "新的剧情点",
          summary: "概要",
          outline: "故事情节"
        }
      }
    );
    expect(create.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [
          {
            type: "arc.create",
            arc: {
              id: expect.stringMatching(/^arc_[0-9a-f]{8}$/u),
              volumeId: "volume_one",
              title: "新的剧情点",
              outline: "故事情节"
            }
          }
        ]
      }
    });
  });

  it("lists, reads, writes and edits story plots attached to a plot point", async () => {
    const index = fixtureStoryPlotIndex();
    const executor = storyPlotExecutor(index);
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-story-plot-tools",
      runId: "run-story-plot-tools",
      executor
    });

    const listed = await toolByName(tools, "list_plot_design").execute(
      "list-story-plots",
      { kind: "story_plot", arc_id: "arc_one" }
    );
    const listedText = listed.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    expect(listedText).toContain("story_plot_id=storyplot_one");
    expect(listedText).toContain("arc_id=arc_one");
    expect(listedText).not.toContain("fileId");

    const premature = await toolByName(tools, "write_plot_design").execute(
      "write-without-read",
      {
        item: {
          kind: "story_plot",
          story_plot_id: "storyplot_one",
          text: "未读先写"
        },
        allow_overwrite_existing: true
      }
    );
    expect(resultText(premature)).toContain(
      "未写入：请先调用 read_plot_design"
    );

    const read = await toolByName(tools, "read_plot_design").execute(
      "read-story-plot",
      {
        target: { kind: "story_plot", story_plot_id: "storyplot_one" },
        mode: "full"
      }
    );
    const readText = resultText(read);
    expect(() => JSON.parse(readText)).toThrow();
    expect(readText).toContain("story_plot_id=storyplot_one");
    expect(readText).not.toContain('"story_plot_id"');
    expect(readText).toContain(STORY_PLOT_BODY);

    const unconfirmed = await toolByName(tools, "write_plot_design").execute(
      "write-without-confirm",
      {
        item: {
          kind: "story_plot",
          story_plot_id: "storyplot_one",
          text: "覆盖"
        }
      }
    );
    expect(resultText(unconfirmed)).toContain("allow_overwrite_existing=true");

    const nextBody = "城门内重逢，线索兑现。";
    const write = await toolByName(tools, "write_plot_design").execute(
      "write-story-plot",
      {
        item: {
          kind: "story_plot",
          story_plot_id: "storyplot_one",
          text: nextBody
        },
        allow_overwrite_existing: true,
        summary: "重写故事情节正文"
      }
    );
    expect(write.details).toMatchObject({
      kind: "long-mutation-proposal",
      summary: "重写故事情节正文",
      batch: {
        operations: [],
        documentWrites: [
          {
            fileId: longStoryPlotBodyFileId("storyplot_one"),
            content: nextBody,
            mode: "replace",
            expectedRevision: REVISION
          }
        ]
      }
    });
    const writeText = resultText(write);
    expect(writeText).toContain("已写入故事情节");
    expect(writeText).not.toContain("提案");
    expect(writeText).not.toContain("审批");

    const reread = await toolByName(tools, "read_plot_design").execute(
      "reread-after-write",
      {
        target: { kind: "story_plot", story_plot_id: "storyplot_one" },
        mode: "full"
      }
    );
    expect(resultText(reread)).toContain(nextBody);

    const editTools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-story-plot-edit",
      runId: "run-story-plot-edit",
      executor
    });
    await toolByName(editTools, "read_plot_design").execute("read-for-edit", {
      target: { kind: "story_plot", story_plot_id: "storyplot_one" },
      mode: "full"
    });
    const ambiguous = await toolByName(editTools, "edit_plot_design").execute(
      "edit-ambiguous",
      {
        item: {
          kind: "story_plot",
          story_plot_id: "storyplot_one",
          replacements: [{ original_text: "城中旧宅", new_text: "伏笔" }]
        }
      }
    );
    expect(resultText(ambiguous)).toContain("未替换：原文片段必须唯一存在");

    const edit = await toolByName(editTools, "edit_plot_design").execute(
      "edit-story-plot",
      {
        item: {
          kind: "story_plot",
          story_plot_id: "storyplot_one",
          replacements: [
            { original_text: "埋下北上线索", new_text: "北上线索改为南归" }
          ]
        },
        summary: "局部修改故事情节"
      }
    );
    expect(edit.details).toMatchObject({
      kind: "long-mutation-proposal",
      summary: "局部修改故事情节",
      batch: {
        operations: [],
        documentWrites: [
          {
            fileId: longStoryPlotBodyFileId("storyplot_one"),
            content: "城门外初遇追兵，北上线索改为南归。",
            mode: "replace",
            expectedRevision: REVISION
          }
        ]
      }
    });
  });

  it("allows plot design to refine a committed chapter card", async () => {
    const index = committedFixtureIndex();
    const chapter = index.chapters[0]!;
    const cardContent = "旧章卡内容";
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      expect(command.payload.fileId).toBe(chapter.card.id);
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          file: chapter.card,
          content: cardContent,
          offset: 0,
          totalCharacters: Array.from(cardContent).length,
          nextOffset: null,
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-refine-committed-card",
      runId: "run-refine-committed-card",
      executor
    });

    await toolByName(tools, "read_plot_design").execute(
      "read-committed-card",
      {
        target: { kind: "chapter", chapter_card_id: "chapter_one" },
        mode: "full"
      }
    );
    const result = await toolByName(tools, "edit_plot_design").execute(
      "edit-committed-card",
      {
        item: {
          kind: "chapter",
          chapter_card_id: "chapter_one",
          replacements: [
            { original_text: cardContent, new_text: "精修后的章卡内容" }
          ]
        },
        summary: "精修已提交章卡"
      }
    );

    expect(result.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [],
        documentWrites: [
          {
            fileId: chapter.card.id,
            content: "精修后的章卡内容",
            mode: "replace"
          }
        ]
      }
    });
  });

  it("creates a chapter card and writes its complete text once without an extra read", async () => {
    const index = fixtureIndex();
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-chapter-card-tools",
      runId: "run-chapter-card-tools",
      executor
    });

    const create = await toolByName(tools, "create_plot_design").execute(
      "create-chapter-card",
      {
        domain: "worldbuilding", item: {
          kind: "chapter",
          volume_id: "volume_one",
          primary_arc_id: null,
          title: "第二章"
        },
        summary: "创建第二章章卡"
      }
    );
    const createDetails = create.details;
    if (!createDetails || createDetails.kind !== "long-mutation-proposal") {
      throw new Error("Expected a chapter-card creation proposal.");
    }
    const createOperation = createDetails.batch.operations[0];
    if (!createOperation || createOperation.type !== "chapter.create") {
      throw new Error("Expected a chapter.create operation.");
    }
    const chapterCardId = createOperation.chapterCard.id;
    expect(createOperation.chapterCard).toMatchObject({
      volumeId: "volume_one",
      primaryArcId: null,
      title: "第二章",
      narrativeOrder: 2
    });
    expect(createDetails.batch.documentWrites).toHaveLength(0);
    expect(resultText(create)).toContain("无需再次读取");

    const initialText = "本章从北门追逐开始，结尾揭示内应身份。";
    const write = await toolByName(tools, "write_plot_design").execute(
      "write-new-chapter-card",
      {
        item: {
          kind: "chapter",
          chapter_card_id: chapterCardId,
          text: initialText
        },
        summary: "一次性写入第二章章卡"
      }
    );
    expect(write.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [],
        documentWrites: [
          {
            fileId: createOperation.files.card.id,
            content: initialText,
            mode: "replace",
            expectedRevision: createOperation.files.card.revision
          }
        ]
      }
    });
    expect(resultText(write)).toContain("已写入章卡");

    const edit = await toolByName(tools, "edit_plot_design").execute(
      "edit-new-chapter-card",
      {
        item: {
          kind: "chapter",
          chapter_card_id: chapterCardId,
          replacements: [
            {
              original_text: "结尾揭示内应身份",
              new_text: "结尾只留下内应线索"
            }
          ]
        },
        summary: "调整第二章结尾"
      }
    );
    expect(edit.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [],
        documentWrites: [
          {
            fileId: createOperation.files.card.id,
            content: "本章从北门追逐开始，结尾只留下内应线索。",
            mode: "replace"
          }
        ]
      }
    });
  });

  it("creates story plots under a plot point and proposes story plot structure changes", async () => {
    const index = fixtureStoryPlotIndex();
    const executor = storyPlotExecutor(index);
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-story-plot-create",
      runId: "run-story-plot-create",
      executor
    });

    const create = await toolByName(tools, "create_plot_design").execute(
      "create-story-plot",
      {
        domain: "worldbuilding", item: {
          kind: "story_plot",
          arc_id: "arc_one",
          title: "新的故事情节"
        },
        summary: "创建故事情节"
      }
    );
    const createDetails = create.details;
    if (!createDetails || createDetails.kind !== "long-mutation-proposal") {
      throw new Error("Expected a mutation proposal.");
    }
    const createOperation = createDetails.batch.operations[0];
    if (!createOperation || createOperation.type !== "storyPlot.create") {
      throw new Error("Expected a storyPlot.create operation.");
    }
    expect(createOperation.storyPlot).toMatchObject({
      id: expect.stringMatching(/^storyplot_[0-9a-f]{8}$/u),
      arcId: "arc_one",
      title: "新的故事情节",
      order: 2,
      file: {
        id: longStoryPlotBodyFileId(createOperation.storyPlot.id),
        path: longStoryPlotFilePath(createOperation.storyPlot.id)
      }
    });
    expect(createDetails.batch.documentWrites).toHaveLength(0);

    const createdStoryPlotId = createOperation.storyPlot.id;
    const createText = resultText(create);
    expect(createText).toContain("已形成故事情节");
    expect(createText).toContain(createdStoryPlotId);
    expect(createText).toContain("创建提案");
    expect(createText).toContain("等待本创建提案获批");

    const secondCreate = await toolByName(tools, "create_plot_design").execute(
      "create-second-story-plot",
      {
        domain: "worldbuilding", item: {
          kind: "story_plot",
          arc_id: "arc_one",
          title: "第二个故事情节"
        },
        summary: "创建第二个故事情节"
      }
    );
    const secondDetails = secondCreate.details;
    if (!secondDetails || secondDetails.kind !== "long-mutation-proposal") {
      throw new Error("Expected a mutation proposal.");
    }
    const secondOperation = secondDetails.batch.operations[0];
    if (!secondOperation || secondOperation.type !== "storyPlot.create") {
      throw new Error("Expected a storyPlot.create operation.");
    }
    // 同一轮内第二个创建必须基于待落盘的第一个故事情节继续递增 order，
    // 否则落盘校验会因 order 不连续而失败。
    expect(secondOperation.storyPlot.order).toBe(3);
    expect(secondDetails.batch.documentWrites).toHaveLength(0);

    const pendingRead = await toolByName(tools, "read_plot_design").execute(
      "read-pending-story-plot",
      {
        target: { kind: "story_plot", story_plot_id: createdStoryPlotId },
        mode: "full"
      }
    );
    expect(resultText(pendingRead)).toContain(createdStoryPlotId);
    expect(resultText(pendingRead)).toContain("（内容为空）");

    const pendingList = await toolByName(tools, "list_plot_design").execute(
      "list-with-pending",
      { kind: "story_plot", arc_id: "arc_one" }
    );
    const pendingListText = resultText(pendingList);
    expect(pendingListText).toContain("story_plot_id=storyplot_one");
    expect(pendingListText).toContain(createdStoryPlotId);

    const pendingSearch = await toolByName(
      tools,
      "search_plot_design"
    ).execute("search-pending", { domain: "worldbuilding", query: "新的故事情节", kind: "story_plot" });
    expect(resultText(pendingSearch)).toContain(createdStoryPlotId);

    const pendingWrite = await toolByName(tools, "write_plot_design").execute(
      "write-pending-story-plot",
      {
        item: {
          kind: "story_plot",
          story_plot_id: createdStoryPlotId,
          text: "落盘前重写的正文。"
        },
        allow_overwrite_existing: true,
        summary: "重写待审故事情节"
      }
    );
    expect(resultText(pendingWrite)).toContain("已写入故事情节");
    expect(pendingWrite.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [],
        documentWrites: [
          {
            fileId: createOperation.storyPlot.file.id,
            content: "落盘前重写的正文。",
            mode: "replace"
          }
        ]
      }
    });

    const rereadPending = await toolByName(tools, "read_plot_design").execute(
      "reread-pending-story-plot",
      {
        target: { kind: "story_plot", story_plot_id: createdStoryPlotId },
        mode: "full"
      }
    );
    expect(resultText(rereadPending)).toContain("落盘前重写的正文。");

    const mutation = await toolByName(tools, "propose_long_mutation").execute(
      "story-plot-structure",
      {
        domain: "worldbuilding", operations: [
          {
            type: "storyPlot.update",
            id: "storyplot_one",
            patch: { title: "城门初遇（改）" }
          },
          {
            type: "storyPlot.reorder",
            arcId: "arc_one",
            orderedIds: ["storyplot_one"]
          },
          { type: "storyPlot.delete", id: "storyplot_one", cascade: true }
        ],
        summary: "调整故事情节结构"
      }
    );
    expect(mutation.details).toMatchObject({
      kind: "long-mutation-proposal",
      summary: "调整故事情节结构",
      batch: {
        operations: [
          {
            type: "storyPlot.update",
            id: "storyplot_one",
            patch: { title: "城门初遇（改）" }
          },
          {
            type: "storyPlot.reorder",
            arcId: "arc_one",
            orderedIds: ["storyplot_one"]
          },
          { type: "storyPlot.delete", id: "storyplot_one", cascade: true }
        ],
        documentWrites: []
      }
    });
  });

  it("lists worldbuilding through semantic ids and rejects physical-id parameters", async () => {
    const index = fixtureWorldbuildingIndex();
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type === "long.readDocument") {
        const category = index.worldbuilding.find(
          ({ id }) => id === "world_magic"
        );
        if (!category || category.format !== "list" || !category.overview) {
          throw new Error("Expected a list category overview.");
        }
        const overviewContent = "记忆代价：施法会消耗施法者的记忆。";
        return {
          status: "accepted",
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: category.overview,
            content: overviewContent,
            offset: command.payload.offset,
            totalCharacters: Array.from(overviewContent).length,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-world-list",
      runId: "run-world-list",
      executor
    });
    const list = toolByName(tools, "list_setting");
    const read = toolByName(tools, "read_setting");
    const search = toolByName(tools, "search_setting");
    const write = toolByName(tools, "write_setting");

    for (const tool of [list, read, search, write]) {
      const parameterSchema = JSON.stringify(tool.parameters);
      for (const forbidden of [
        "file_id",
        "fileId",
        "book_id",
        "bookId",
        "path",
        "revision",
        "cursor"
      ]) {
        expect(parameterSchema).not.toContain(`\"${forbidden}\"`);
      }
    }
    expect(JSON.stringify(list.parameters)).not.toContain('"page"');
    expect(JSON.stringify(list.parameters)).not.toContain('"limit"');
    expect(JSON.stringify(search.parameters)).toContain('"page"');
    expect(JSON.stringify(search.parameters)).toContain('"limit"');
    expect(Check(list.parameters, {})).toBe(false);
    expect(Check(list.parameters, { domain: "worldbuilding" })).toBe(true);
    expect(Check(list.parameters, { page: 1, limit: 1 })).toBe(false);
    expect(Check(list.parameters, {
      domain: "worldbuilding",
      category_id: "world_rules",
      file_id: "file_world_rules:content"
    })).toBe(false);
    expect(Check(search.parameters, { query: "记忆", limit: 101 })).toBe(
      false
    );
    expect(Check(read.parameters, {
      domain: "worldbuilding",
      category_id: "world_rules",
      mode: "preview"
    })).toBe(true);
    expect(Check(read.parameters, {
      domain: "worldbuilding",
      category_id: "world_rules",
      file_id: "file_world_rules:content"
    })).toBe(false);
    expect(Check(read.parameters, {
      domain: "worldbuilding",
      category_id: "file_world_rules:content",
      mode: "preview"
    })).toBe(false);
    expect(Check(read.parameters, {
      domain: "worldbuilding",
      category_id: "world_magic",
      item_id: "file_worlditem_memory:content",
      mode: "full"
    })).toBe(false);
    expect(Check(write.parameters, {
      domain: "worldbuilding",
      category_id: "file_world_rules:content",
      text: "不应接受文件 ID"
    })).toBe(false);

    const categoriesText = resultText(
      await list.execute("list-world-categories", { domain: "worldbuilding" })
    );
    expect(() => JSON.parse(categoriesText)).toThrow();
    expect(categoriesText).toBe(
      [
        "世界观分类",
        "",
        "世界规则",
        "category_id=world_rules",
        "类型=文本",
        "",
        "魔法体系",
        "category_id=world_magic",
        "类型=条目列表",
        "条目数=2"
      ].join("\n")
    );
    expectNoPhysicalWorldbuildingMetadata(categoriesText);

    const itemsText = resultText(
      await list.execute("list-world-items", {
        domain: "worldbuilding", category_id: "world_magic"
      })
    );
    expect(() => JSON.parse(itemsText)).toThrow();
    expect(itemsText).toBe(
      [
        "分类：魔法体系",
        "category_id=world_magic",
        "类型=条目列表",
        "",
        "概览",
        "记忆代价：施法会消耗施法者的记忆。",
        "",
        "条目",
        "",
        "记忆代价",
        "item_id=worlditem_memory",
        "",
        "血脉门槛",
        "item_id=worlditem_blood"
      ].join("\n")
    );
    expectNoPhysicalWorldbuildingMetadata(itemsText);
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("reads worldbuilding through internal file mappings without leaking them", async () => {
    const index = fixtureWorldbuildingIndex();
    const category = index.worldbuilding.find(
      ({ id }) => id === "world_magic"
    );
    if (!category || category.format !== "list") {
      throw new Error("Expected the fixture magic category to be a list.");
    }
    const item = category.items[0]!;
    const replacementSource = "每次施法都会遗忘一段记忆。";
    const middleMarker = "WORLD_BUILDING_MIDDLE_SENTINEL";
    const content = `${"开篇".repeat(130)}${replacementSource}${middleMarker}${"收束".repeat(130)}`;
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const isOverview = command.payload.fileId === category.overview?.id;
      expect([item.file.id, category.overview?.id]).toContain(
        command.payload.fileId
      );
      const resultContent = isOverview
        ? "记忆代价：施法会消耗施法者的记忆。"
        : content;
      const resultFile = isOverview ? category.overview! : item.file;
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          file: resultFile,
          content: resultContent,
          offset: command.payload.offset,
          totalCharacters: Array.from(resultContent).length,
          nextOffset: null,
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-world-read",
      runId: "run-world-read",
      executor
    });
    const read = toolByName(tools, "read_setting");
    const edit = toolByName(tools, "edit_setting");

    const preview = await read.execute("preview-world-item", {
      domain: "worldbuilding", category_id: category.id,
      item_id: item.id,
      mode: "preview"
    });
    const previewText = resultText(preview);
    expect(previewText).toContain("【魔法体系 / 记忆代价】");
    expect(previewText).toContain("预览（不建立整体覆盖凭据）");
    expect(previewText).not.toContain(middleMarker);
    expectNoPhysicalWorldbuildingMetadata(previewText);

    const blockedEdit = await edit.execute("edit-after-preview", {
      domain: "worldbuilding", category_id: category.id,
      item_id: item.id,
      replacements: [{
        original_text: replacementSource,
        new_text: "每次施法都会遗忘一段珍贵记忆。"
      }]
    });
    expect(resultText(blockedEdit)).toContain(
      "read_setting（domain=worldbuilding，mode=full）"
    );

    const full = await read.execute("full-world-item", {
      domain: "worldbuilding", category_id: category.id,
      item_id: item.id,
      mode: "full"
    });
    const fullText = resultText(full);
    expect(fullText).toContain(middleMarker);
    expect(fullText).toContain(replacementSource);
    expectNoPhysicalWorldbuildingMetadata(fullText);

    const edited = await edit.execute("edit-after-full", {
      domain: "worldbuilding", category_id: category.id,
      item_id: item.id,
      replacements: [{
        original_text: replacementSource,
        new_text: "每次施法都会遗忘一段珍贵记忆。"
      }]
    });
    expect(edited.details).toMatchObject({
      kind: "long-worldbuilding-file-proposal",
      files: [{
        categoryId: category.id,
        itemId: item.id,
        operation: "edit",
        afterText: expect.stringContaining("珍贵记忆")
      }]
    });
    await expect(
      read.execute("text-category-with-item", {
        domain: "worldbuilding", category_id: "world_rules",
        item_id: item.id,
        mode: "full"
      })
    ).rejects.toThrow(/do not have items/u);
    const overview = await read.execute("list-category-without-item", {
      domain: "worldbuilding", category_id: category.id,
      mode: "full"
    });
    expect(resultText(overview)).toContain("【魔法体系 / 概览】");
    expect(resultText(overview)).toContain(
      "记忆代价：施法会消耗施法者的记忆。"
    );
  });

  it("maps Core worldbuilding search hits back to category and item ids", async () => {
    const index = fixtureWorldbuildingIndex();
    const textCategory = index.worldbuilding.find(
      ({ id }) => id === "world_rules"
    );
    const listCategory = index.worldbuilding.find(
      ({ id }) => id === "world_magic"
    );
    if (
      !textCategory ||
      textCategory.format !== "text" ||
      !listCategory ||
      listCategory.format !== "list"
    ) {
      throw new Error("Expected both worldbuilding fixture categories.");
    }
    const item = listCategory.items[0]!;
    let returnUnknownFile = false;
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type !== "long.search") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      expect(command.payload.bookId).toBe(index.bookId);
      expect(command.payload.scope).toBe("worldbuilding");
      expect(command.payload.limit).toBe(2);
      expect(command.payload).not.toHaveProperty("path");
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          query: command.payload.query,
          scope: "worldbuilding",
          hits: returnUnknownFile
            ? [{
                fileId: "file_worlditem_unknown:content",
                path: "long/worldbuilding/world_magic/items/worlditem_unknown.md",
                root: "worldbuilding",
                title: "不应映射的文件",
                start: 0,
                end: 2,
                snippet: "未知命中",
                revision: REVISION
              }]
            : [
                {
                  fileId: textCategory.file.id,
                  path: textCategory.file.path,
                  root: "worldbuilding",
                  title: "Core 内部标题",
                  start: 0,
                  end: 2,
                  snippet: "规则命中",
                  revision: textCategory.file.revision
                },
                {
                  fileId: item.file.id,
                  path: item.file.path,
                  root: "worldbuilding",
                  title: "Core 内部条目标题",
                  start: 3,
                  end: 5,
                  snippet: "记忆命中",
                  revision: item.file.revision
                }
              ],
          nextCursor: "core-private-page-token",
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-world-search",
      runId: "run-world-search",
      executor
    });
    const search = toolByName(tools, "search_setting");

    const result = JSON.parse(resultText(
      await search.execute("search-world", { domain: "worldbuilding", query: "记忆", page: 1, limit: 2 })
    ));
    expect(result).toEqual({
      hits: [
        {
          category_id: "world_rules",
          title: "世界规则",
          snippet: "规则命中"
        },
        {
          category_id: "world_magic",
          item_id: "worlditem_memory",
          title: "记忆代价",
          snippet: "记忆命中"
        }
      ],
      next_page: 2
    });
    const resultTextValue = JSON.stringify(result);
    expect(resultTextValue).not.toContain("core-private-page-token");
    expectNoPhysicalWorldbuildingMetadata(resultTextValue);

    const filtered = JSON.parse(resultText(
      await search.execute("search-world-category", {
        domain: "worldbuilding", query: "记忆",
        category_id: "world_magic",
        page: 1,
        limit: 2
      })
    ));
    expect(filtered.hits).toEqual([{
      category_id: "world_magic",
      item_id: "worlditem_memory",
      title: "记忆代价",
      snippet: "记忆命中"
    }]);
    expectNoPhysicalWorldbuildingMetadata(JSON.stringify(filtered));

    returnUnknownFile = true;
    await expect(
      search.execute("search-world-unknown-file", {
        domain: "worldbuilding", query: "未知",
        page: 1,
        limit: 2
      })
    ).rejects.toThrow(/unknown worldbuilding document/u);
  });

  it("selects the continuous next chapter by volume and in-volume narrative order", () => {
    const index = {
      plot: {
        volumes: [
          { id: "volume_two", order: 2 },
          { id: "volume_one", order: 1 }
        ],
        chapterCards: [
          {
            id: "chapter_volume_two",
            volumeId: "volume_two",
            narrativeOrder: 1
          },
          {
            id: "chapter_one_second",
            volumeId: "volume_one",
            narrativeOrder: 2
          },
          {
            id: "chapter_one_first",
            volumeId: "volume_one",
            narrativeOrder: 1
          }
        ]
      },
      ledger: {
        commits: [{ chapterCardId: "chapter_one_first" }]
      },
      chapters: [
        { chapterCardId: "chapter_one_first", bodyStatus: "written" },
        { chapterCardId: "chapter_one_second", bodyStatus: "empty" },
        { chapterCardId: "chapter_volume_two", bodyStatus: "empty" }
      ]
    } as unknown as LongWorkspaceIndexSnapshot;

    expect(selectNextLongChapterForDispatch(index)).toMatchObject({
      id: "chapter_one_second"
    });
    index.chapters[1]!.bodyStatus = "written";
    index.chapters[2]!.bodyStatus = "written";
    expect(selectNextLongChapterForDispatch(index)).toBeUndefined();
  });

  it("selects chapter, contiguous arc, or current volume without allowing book scope", () => {
    const index = {
      plot: {
        volumes: [
          { id: "volume_two", order: 2 },
          { id: "volume_one", order: 1 }
        ],
        chapterCards: [
          {
            id: "chapter_four",
            volumeId: "volume_one",
            primaryArcId: "arc_one",
            narrativeOrder: 4
          },
          {
            id: "chapter_five",
            volumeId: "volume_two",
            primaryArcId: "arc_three",
            narrativeOrder: 1
          },
          {
            id: "chapter_two",
            volumeId: "volume_one",
            primaryArcId: "arc_one",
            narrativeOrder: 2
          },
          {
            id: "chapter_three",
            volumeId: "volume_one",
            primaryArcId: "arc_two",
            narrativeOrder: 3
          },
          {
            id: "chapter_one",
            volumeId: "volume_one",
            primaryArcId: "arc_one",
            narrativeOrder: 1
          }
        ]
      },
      ledger: { commits: [] }
    } as unknown as LongWorkspaceIndexSnapshot;

    expect(
      selectLongChaptersForWritingScope(index, { scope: "chapter" }).map(
        ({ id }) => id
      )
    ).toEqual(["chapter_one"]);
    expect(
      selectLongChaptersForWritingScope(index, { scope: "arc" }).map(
        ({ id }) => id
      )
    ).toEqual(["chapter_one", "chapter_two"]);
    expect(
      selectLongChaptersForWritingScope(index, { scope: "volume" }).map(
        ({ id }) => id
      )
    ).toEqual([
      "chapter_one",
      "chapter_two",
      "chapter_three",
      "chapter_four"
    ]);
    expect(() =>
      selectLongChaptersForWritingScope(index, {
        scope: "book" as never
      })
    ).toThrow(/whole-book/u);
    expect(() =>
      selectLongChaptersForWritingScope(index, {
        scope: "chapter",
        arcId: "arc_one"
      })
    ).toThrow(/selector.*another scope/u);
    expect(() =>
      selectLongChaptersForWritingScope(index, {
        scope: "arc",
        volumeId: "volume_one"
      })
    ).toThrow(/selector.*another scope/u);
    expect(() =>
      selectLongChaptersForWritingScope(index, {
        scope: "volume",
        chapterCardId: "chapter_one"
      })
    ).toThrow(/selector.*another scope/u);

    index.ledger.commits.push({} as never, {} as never);
    expect(
      selectLongChaptersForWritingScope(index, { scope: "arc" }).map(
        ({ id }) => id
      )
    ).toEqual(["chapter_three"]);

    index.ledger.commits.length = 0;
    index.plot.chapterCards.find(({ id }) => id === "chapter_one")!.primaryArcId = null;
    expect(() =>
      selectLongChaptersForWritingScope(index, { scope: "arc" })
    ).toThrow(/primary arc/u);
    expect(
      selectLongChaptersForWritingScope(index, { scope: "volume" }).map(
        ({ id }) => id
      )
    ).toEqual([
      "chapter_one",
      "chapter_two",
      "chapter_three",
      "chapter_four"
    ]);
  });

  it("lists and searches chapters as paragraph text", async () => {
    const index = fixtureIndex();
    const first = index.chapters[0]!;
    index.plot.chapterCards.push({
      id: "chapter_two",
      volumeId: "volume_one",
      primaryArcId: "arc_one",
      title: "第二章",
      narrativeOrder: 2
    });
    index.chapters.push({
      ...first,
      chapterCardId: "chapter_two",
      bodyStatus: "written",
      body: file(
        longChapterBodyFileId("chapter_two"),
        "long/chapters/two/body.md"
      ),
      card: file(
        longChapterCardFileId("chapter_two"),
        "long/chapters/two/card.md"
      ),
      characterState: file(
        longChapterCharacterStateFileId("chapter_two"),
        "long/chapters/two/character-state.md"
      ),
      handoff: file(
        longChapterHandoffFileId("chapter_two"),
        "long/chapters/two/handoff.md"
      ),
      foreshadowingChanges: file(
        longChapterForeshadowingChangesFileId("chapter_two"),
        longChapterContinuityFilePath(
          "chapter_two",
          "foreshadowing-changes.md"
        )
      )
    });
    const parsed = LongWorkspaceIndexSnapshotSchema.parse(index);
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(parsed);
      }
      if (command.type !== "long.search") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      expect(command.payload.scope).toBe("draft");
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: parsed.bookId,
          query: command.payload.query,
          scope: "draft",
          hits: [
            {
              fileId: first.body.id,
              path: first.body.path,
              root: "draft",
              title: "第一章",
              start: 0,
              end: 4,
              snippet: "测灵台上那团青光",
              revision: first.body.revision
            }
          ],
          nextCursor: "chapter-search-next",
          workspaceRevision: parsed.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft", "chapter_one"),
      profile: profile("draft"),
      sessionId: "session-chapter-paragraphs",
      runId: "run-chapter-paragraphs",
      executor
    });
    const list = toolByName(tools, "list_chapters");
    const search = toolByName(tools, "search_chapters");

    expect(list.description).toContain("按行段落返回");
    expect(list.description).toContain("不包装成 JSON");
    expect(search.description).toContain("按行段落返回");
    expect(toolByName(tools, "read_chapter").description).toContain(
      "不包装成 JSON"
    );

    const listText = resultText(await list.execute("list-chapters", {}));
    expect(() => JSON.parse(listText)).toThrow();
    expect(listText).not.toContain('"chapter_card_id"');
    expect(listText).toBe(
      [
        "正文章节",
        "第 1 页 / 共 2 条",
        "",
        "第一章",
        "chapter_card_id=chapter_one",
        "叙事顺序=1",
        "正文状态=空",
        "提交状态=未记录",
        "当前章=是",
        "",
        "第二章",
        "chapter_card_id=chapter_two",
        "叙事顺序=2",
        "正文状态=已写",
        "提交状态=未记录",
        "当前章=否"
      ].join("\n")
    );

    const searchText = resultText(
      await search.execute("search-chapters", { query: "测灵台" })
    );
    expect(() => JSON.parse(searchText)).toThrow();
    expect(searchText).toBe(
      [
        "搜索",
        "query=测灵台",
        "",
        "第一章",
        "chapter_card_id=chapter_one",
        "document=body",
        "摘录",
        "测灵台上那团青光",
        "",
        "next_cursor=chapter-search-next"
      ].join("\n")
    );
  });

  it("derives chapter readiness from body content only", async () => {
    const index = fixtureIndex();
    const entry = index.chapters[0]!;
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") return indexResult();
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      expect(command.payload.fileId).toBe(entry.body.id);
      const content = "已有正文";
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          file: entry.body,
          content,
          offset: 0,
          totalCharacters: Array.from(content).length,
          nextOffset: null,
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace(
        "draft",
        "draft",
        "chapter_one"
      ),
      profile: profile("draft"),
      sessionId: "session-readiness",
      runId: "run-readiness",
      executor
    });
    const result = await toolByName(
      tools,
      "get_long_chapter_readiness"
    ).execute("readiness", {});
    const readinessText = resultText(result);
    expect(() => JSON.parse(readinessText)).toThrow();
    expect(readinessText).toBe(
      [
        "第一章",
        "chapter_card_id=chapter_one",
        "状态=可结算",
        "缺失文件=（无）"
      ].join("\n")
    );
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("forms a dispatch proposal from one index query and stops cleanly when complete", async () => {
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult();
      }
      if (command.type === "long.readDocument") {
        const index = fixtureIndex();
        const entry = index.chapters[0]!;
        const requested = entry.body;
        if (requested.id !== command.payload.fileId) {
          throw new Error("Unexpected chapter file.");
        }
        return {
          status: "accepted",
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: requested,
            content: "",
            offset: 0,
            totalCharacters: 0,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft"),
      profile: profile("draft"),
      sessionId: "session-dispatch",
      runId: "run-dispatch",
      executor
    });
    const proposal = await toolByName(
      tools,
      "propose_long_chapter_dispatch"
    ).execute("dispatch-next", { summary: "调度连续下一章" });

    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls[0]?.[0].type).toBe("long.getWorkspaceIndex");
    expect(proposal.details).toMatchObject({
      kind: "long-chapter-dispatch-proposal",
      bookId: "longbook_tools",
      agentId: "draft",
      scope: "chapter",
      chapterCardId: "chapter_one",
      title: "第一章",
      chapters: [
        {
          chapterCardId: "chapter_one",
          title: "第一章",
          status: "empty",
          missingFiles: ["body"]
        }
      ],
      workspaceRevision: 7,
      projectRevision: 11,
      summary: "调度连续下一章"
    });
    expect(
      toRuntimeEvents(
        {
          type: "tool_execution_end",
          toolCallId: "dispatch-next",
          toolName: "propose_long_chapter_dispatch",
          result: proposal,
          isError: false
        },
        {
          runId: "run-dispatch",
          sessionId: "session-dispatch",
          prompt: "调度下一章"
        },
        {
          provider: "deepwrite",
          model: "test",
          mode: "local-faux"
        },
        "message-dispatch"
      )
    ).toMatchObject([
      { type: "agent.tool_completed" },
      {
        type: "long.chapter_dispatch_proposal",
        payload: {
          scope: "chapter",
          chapterCardId: "chapter_one",
          title: "第一章",
          chapters: [
            expect.objectContaining({
              chapterCardId: "chapter_one",
              status: "empty"
            })
          ],
          workspaceRevision: 7,
          projectRevision: 11
        }
      }
    ]);

    const completeExecutor = vi.fn<LongCommandExecutor>(
      async (command) => ({
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: "longbook_tools",
          workspaceIndex: committedFixtureIndex(),
          projectRevision: 12
        }
      })
    );
    const completeTools = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft"),
      profile: profile("draft"),
      sessionId: "session-complete",
      runId: "run-complete",
      executor: completeExecutor
    });
    const complete = await toolByName(
      completeTools,
      "propose_long_chapter_dispatch"
    ).execute("dispatch-complete", {});
    expect(complete.details).toEqual({ kind: "none" });
    expect(complete.content).toEqual([
      {
        type: "text",
        text: "全部章卡均已有正文，没有可调度的下一章。"
      }
    ]);
    expect(
      toRuntimeEvents(
        {
          type: "tool_execution_end",
          toolCallId: "dispatch-complete",
          toolName: "propose_long_chapter_dispatch",
          result: complete,
          isError: false
        },
        {
          runId: "run-complete",
          sessionId: "session-complete",
          prompt: "继续"
        },
        {
          provider: "deepwrite",
          model: "test",
          mode: "local-faux"
        },
        "message-complete"
      ).map((event) => event.type)
    ).toEqual(["agent.tool_completed"]);
  });

  it("locks Core queries to the active book, read roots and AbortSignal", async () => {
    const index = fixtureIndex();
    const characterFile = index.characterFiles[0]!.coreProfile;
    const seenSignals: Array<AbortSignal | undefined> = [];
    const executor = vi.fn<LongCommandExecutor>(async (command, signal) => {
      seenSignals.push(signal);
      if (command.type === "long.getWorkspaceIndex") return indexResult(index);
      if (command.type === "long.readDocument") {
        return {
          status: "accepted",
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: characterFile,
            content: "人物档案正文",
            offset: 0,
            totalCharacters: 6,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      }
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          query: command.payload.query,
          scope: command.payload.scope,
          hits: [],
          nextCursor: null,
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    });
    const characterProfile = profile("setting");
    characterProfile.readAccess.workspaceRoots = ["character_design"];
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "character_design"),
      profile: characterProfile,
      sessionId: "session-query",
      runId: "run-query",
      executor
    });
    const controller = new AbortController();
    await toolByName(tools, "read_setting").execute(
      "read-character",
      {
        domain: "character", character_id: "character_alice",
        document: "core_profile",
        mode: "full"
      },
      controller.signal
    );
    await toolByName(tools, "search_setting").execute(
      "search-character",
      { domain: "character", query: "人物" },
      controller.signal
    );

    expect(executor).toHaveBeenCalledTimes(3);
    expect(executor.mock.calls.map(([command]) => command.type)).toEqual([
      "long.getWorkspaceIndex",
      "long.readDocument",
      "long.search"
    ]);
    expect(
      executor.mock.calls.every(
        ([command]) =>
          command.payload.bookId === index.bookId &&
          !("path" in command.payload)
      )
    ).toBe(true);
    expect(seenSignals.every((signal) => signal === controller.signal)).toBe(true);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      toolByName(tools, "search_setting").execute(
        "search-aborted",
        { domain: "character", query: "人物" },
        aborted.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it("uses unique command ids for concurrent document reads in one run", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(123);
    try {
      const index = fixtureIndex();
      const characterFile = index.characterFiles[0]!.coreProfile;
      const executor = vi.fn<LongCommandExecutor>(async (command) => {
        if (command.type === "long.getWorkspaceIndex") {
          return indexResult(index);
        }
        if (command.type !== "long.readDocument") {
          throw new Error(`Unexpected command: ${command.type}`);
        }
        return {
          status: "accepted",
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: characterFile,
            content: "人物档案正文",
            offset: command.payload.offset,
            totalCharacters: 6,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      });
      const tools = buildLongWorkspaceTools({
        workspace: workspace("setting", "character_design"),
        profile: profile("setting"),
        sessionId: "session-concurrent-query",
        runId: "run-concurrent-query",
        executor
      });
      const readTool = toolByName(tools, "read_setting");

      await Promise.all([
        readTool.execute("read-character-one", {
          domain: "character", character_id: "character_alice",
          document: "core_profile",
          mode: "full"
        }),
        readTool.execute("read-character-two", {
          domain: "character", character_id: "character_alice",
          document: "core_profile",
          mode: "full"
        })
      ]);

      const readCommandIds = executor.mock.calls
        .map(([command]) => command)
        .filter((command) => command.type === "long.readDocument")
        .map(({ id }) => id);
      expect(readCommandIds).toHaveLength(2);
      expect(new Set(readCommandIds).size).toBe(2);
    } finally {
      now.mockRestore();
    }
  });

  it("rejects a Core worldbuilding response that changes the internally mapped file", async () => {
    const index = fixtureIndex();
    const worldFile = fixtureWorldFile(index);
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          file: {
            ...worldFile,
            path: "long/worldbuilding/other/content.md"
          },
          content: "错误文件",
          offset: command.payload.offset,
          totalCharacters: 4,
          nextOffset: null,
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-wrong-file",
      runId: "run-wrong-file",
      executor
    });

    await expect(
      toolByName(tools, "read_setting").execute(
        "read-wrong-file",
        { domain: "worldbuilding", category_id: "world_rules", mode: "full" }
      )
    ).rejects.toThrow(/different worldbuilding document/u);
  });

  it("builds typed mutation batches from the latest index without invoking a write command", async () => {
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type !== "long.getWorkspaceIndex") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      return indexResult();
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-mutation",
      runId: "run-mutation",
      executor
    });
    const proposal = await toolByName(tools, "propose_long_mutation").execute(
      "mutation-1",
      {
        domain: "worldbuilding", operations: [
          {
            type: "worldbuilding.update",
            id: "world_rules",
            patch: { title: "世界硬规则" }
          }
        ],
        summary: "更新世界规则标题"
      }
    );

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor.mock.calls[0]?.[0].type).toBe(
      "long.getWorkspaceIndex"
    );
    expect(proposal.details).toMatchObject({
      kind: "long-mutation-proposal",
      bookId: "longbook_tools",
      agentId: "setting",
      baseProjectRevision: 11,
      summary: "更新世界规则标题",
      batch: {
        baseRevision: 7,
        operations: [
          {
            type: "worldbuilding.update",
            id: "world_rules",
            patch: { title: "世界硬规则" }
          }
        ],
        documentWrites: []
      }
    });
    const parameterSchema = JSON.stringify(
      toolByName(tools, "propose_long_mutation").parameters
    );
    expect(parameterSchema).not.toMatch(
      /"batch"|"baseRevision"|"updatedAt"|"fileId"|"file_id"|"path"|"nextRevision"|"expectedRevision"/u
    );
    expect(parameterSchema).toContain('"worldbuilding.create"');
    expect(parameterSchema).not.toContain('"worldbuildingItem.create"');
    expect(parameterSchema).not.toContain('"document_updates"');
    expect(parameterSchema).not.toContain('"character.create"');
    expect(parameterSchema).not.toContain('"chapter.create"');
    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "list_setting",
        "search_setting",
        "read_setting",
        "create_setting",
        "write_setting",
        "edit_setting"
      ])
    );

    const createProposal = await toolByName(
      tools,
      "propose_long_mutation"
    ).execute("mutation-create", {
      domain: "worldbuilding", operations: [
        {
          type: "worldbuilding.create",
          client_ref: "weather",
          title: "气候",
          format: "text"
        }
      ],
      summary: "新增气候设定"
    });
    expect(createProposal.details).toMatchObject({
      kind: "long-mutation-proposal"
    });
    if (createProposal.details?.kind !== "long-mutation-proposal") {
      throw new Error("Expected a mutation proposal.");
    }
    const createdCategory = createProposal.details.batch.operations[0];
    expect(createdCategory).toMatchObject({
      type: "worldbuilding.create",
      category: {
        id: expect.stringMatching(/^world_[0-9a-f]{8}$/u),
        title: "气候",
        order: 2,
        format: "text",
        contentAuthority: "markdown",
        file: {
          revision:
            "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        }
      }
    });
    if (createdCategory.type !== "worldbuilding.create") {
      throw new Error("Expected a worldbuilding create operation.");
    }
    expect(createdCategory.category.file.id).toBe(
      longWorldbuildingFileId(createdCategory.category.id)
    );
    expect(createdCategory.category.file.path).toBe(
      `long/worldbuilding/${createdCategory.category.id}/content.md`
    );

    await expect(
      toolByName(tools, "propose_long_mutation").execute("mutation-bad", {
        operations: [
          {
            type: "volume.update",
            id: "volume_one",
            patch: { title: "越权修改" }
          }
        ],
        summary: "越权"
      })
    ).rejects.toThrow(/outside the agent's write roots/u);
    await expect(
      toolByName(tools, "propose_long_mutation").execute(
        "mutation-empty-summary",
        {
          operations: [],
          summary: "   "
        }
      )
    ).rejects.toThrow(/non-whitespace text/u);
  });

  it("creates exactly one empty worldbuilding file and returns its stable item id", async () => {
    const index = fixtureIndex();
    index.worldbuilding = [{
      id: "world_rules",
      title: "世界规则",
      order: 1,
      format: "list",
      contentAuthority: "files",
      items: []
    }];
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-world-items",
      runId: "run-world-items",
      executor
    });
    const createParameters = JSON.stringify(
      toolByName(tools, "create_setting").parameters
    );
    expect(createParameters).toContain('"title"');
    expect(createParameters).not.toContain('"content"');

    const proposal = await toolByName(
      tools,
      "create_setting"
    ).execute("create-world-items", {
      domain: "worldbuilding", category_id: "world_rules",
      title: "记忆代价"
    });

    expect(proposal.details).toMatchObject({
      kind: "long-worldbuilding-file-proposal",
      batch: {
        operations: [{
          type: "worldbuildingItem.create",
          categoryId: "world_rules",
          item: {
            id: expect.stringMatching(/^worlditem_[0-9a-f]{8}$/u),
            title: "记忆代价",
            file: {
              path: expect.stringContaining("/items/")
            }
          }
        }],
        documentWrites: []
      },
      files: [{
        categoryId: "world_rules",
        itemId: expect.stringMatching(/^worlditem_[0-9a-f]{8}$/u),
        title: "记忆代价",
        operation: "create",
        beforeText: "",
        afterText: "",
        beforeRevision: null,
        filePath: expect.stringContaining("/items/")
      }]
    });
    if (
      proposal.details?.kind !== "long-worldbuilding-file-proposal"
    ) {
      throw new Error("Expected a worldbuilding file creation proposal.");
    }
    const createdItemId = proposal.details.files[0]!.itemId!;
    const write = await toolByName(
      tools,
      "write_setting"
    ).execute("write-created-world-file", {
      domain: "worldbuilding", category_id: "world_rules",
      item_id: createdItemId,
      text: "每次施法都会遗忘一段记忆。"
    });
    expect(write.details).toMatchObject({
      kind: "long-worldbuilding-file-proposal",
      batch: {
        operations: [],
        documentWrites: [{
          mode: "replace",
          content: "每次施法都会遗忘一段记忆。"
        }]
      },
      files: [{
        itemId: createdItemId,
        operation: "write",
        beforeText: "",
        afterText: "每次施法都会遗忘一段记忆。"
      }]
    });
  });

  it("returns independent long worldbuilding file proposals for full writes and edits", async () => {
    const index = fixtureIndex();
    const category = index.worldbuilding[0]!;
    if (category.format !== "text") {
      throw new Error("Expected a text worldbuilding category.");
    }
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type === "long.readDocument") {
        return {
          status: "accepted",
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: category.file,
            content: "旧规则。",
            offset: command.payload.offset,
            totalCharacters: 4,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-world-files",
      runId: "run-world-files",
      executor
    });

    await toolByName(tools, "read_setting").execute(
      "read-world-file",
      { domain: "worldbuilding", category_id: category.id, mode: "full" }
    );
    const write = await toolByName(
      tools,
      "write_setting"
    ).execute("write-world-file", {
      domain: "worldbuilding", category_id: category.id,
      text: "完整新规则。",
      allow_overwrite_existing: true
    });
    expect(write.details).toMatchObject({
      kind: "long-worldbuilding-file-proposal",
      files: [{
        categoryId: category.id,
        fileId: category.file.id,
        filePath: category.file.path,
        title: category.title,
        operation: "write",
        beforeText: "旧规则。",
        afterText: "完整新规则。",
        beforeRevision: category.file.revision
      }]
    });

    const edit = await toolByName(
      tools,
      "edit_setting"
    ).execute("edit-world-file", {
      domain: "worldbuilding", category_id: category.id,
      replacements: [{
        original_text: "完整新规则",
        new_text: "精炼新规则"
      }]
    });
    expect(edit.details).toMatchObject({
      kind: "long-worldbuilding-file-proposal",
      files: [{
        operation: "edit",
        beforeText: "完整新规则。",
        afterText: "精炼新规则。"
      }]
    });
  });

  it("creates one empty character and then writes its independent files", async () => {
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult();
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "character_design"),
      profile: profile("setting"),
      sessionId: "session-character-items",
      runId: "run-character-items",
      executor
    });

    const proposal = await toolByName(
      tools,
      "create_setting"
    ).execute("create-character", {
      domain: "character", name: "沈砚",
      type_id: "major_supporting",
      aliases: ["阿砚"]
    });

    expect(proposal.details).toMatchObject({
      kind: "long-character-file-proposal",
      batch: {
        operations: [{
          type: "character.create",
          character: {
            id: expect.stringMatching(/^character_[0-9a-f]{8}$/u),
            name: "沈砚",
            group: "major_supporting",
            aliases: ["阿砚"]
          },
          files: {
            coreProfile: {
              path: expect.stringMatching(
                /^long\/characters\/character_[0-9a-f]{8}\/core-profile\.md$/u
              )
            },
            relationships: {
              path: expect.stringMatching(
                /^long\/characters\/character_[0-9a-f]{8}\/relationships\.md$/u
              )
            },
            currentState: {
              path: expect.stringMatching(
                /^long\/characters\/character_[0-9a-f]{8}\/current-state\.md$/u
              )
            },
            history: {
              path: expect.stringMatching(
                /^long\/characters\/character_[0-9a-f]{8}\/history\.md$/u
              )
            }
          }
        }],
        documentWrites: []
      },
      files: expect.arrayContaining([
        expect.objectContaining({
          document: "core_profile",
          operation: "create",
          beforeRevision: null
        }),
        expect.objectContaining({
          document: "relationships",
          operation: "create",
          beforeRevision: null
        })
      ])
    });
    expect(proposal.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("character_id=character_")
    });
    if (proposal.details?.kind !== "long-character-file-proposal") {
      throw new Error("Expected a character file proposal.");
    }
    const characterId = proposal.details.files[0]!.characterId;
    const write = await toolByName(tools, "write_setting").execute(
      "write-created-character",
      {
        domain: "character", character_id: characterId,
        document: "core_profile",
        text: "沈砚是负责追查旧案的年轻捕快。"
      }
    );
    expect(write.details).toMatchObject({
      kind: "long-character-file-proposal",
      files: [{
        characterId,
        document: "core_profile",
        operation: "write",
        beforeText: "",
        afterText: "沈砚是负责追查旧案的年轻捕快。"
      }]
    });
  });

  it("lists and creates characters with a custom dynamic type id", async () => {
    const index = LongWorkspaceIndexSnapshotSchema.parse({
      ...fixtureIndex(),
      characterTypes: [
        ...fixtureIndex().characterTypes,
        { id: "chartype_antagonist", title: "反派", order: 5 }
      ]
    });
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") return indexResult(index);
      if (command.type === "long.readDocument") {
        return {
          status: "accepted" as const,
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: index.characterOverview!,
            content: "",
            offset: 0,
            totalCharacters: 0,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "character_design"),
      profile: profile("setting"),
      sessionId: "session-character-custom-type",
      runId: "run-character-custom-type",
      executor
    });

    expect(
      Check(
        toolByName(tools, "create_setting").parameters,
        { domain: "character", name: "陆烬", type_id: "chartype_antagonist" }
      )
    ).toBe(true);
    const listedText = resultText(
      await toolByName(tools, "list_setting").execute(
        "list-custom-types",
        { domain: "character", type_id: "chartype_antagonist" }
      )
    );
    expect(() => JSON.parse(listedText)).toThrow();
    expect(listedText).toContain("type_id=chartype_antagonist");
    expect(listedText).toContain("反派");
    expect(listedText).not.toContain("next_page");
    expect(JSON.stringify(
      toolByName(tools, "list_setting").parameters
    )).not.toContain('"page"');

    const created = await toolByName(tools, "create_setting").execute(
      "create-custom-type-character",
      { domain: "character", name: "陆烬", type_id: "chartype_antagonist" }
    );
    expect(created.details).toMatchObject({
      batch: {
        operations: [
          {
            type: "character.create",
            character: { name: "陆烬", group: "chartype_antagonist" }
          }
        ]
      }
    });
  });

  it("requires a full character-document read before safe replacement", async () => {
    const index = fixtureIndex();
    const coreProfile = index.characterFiles[0]!.coreProfile;
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type === "long.readDocument") {
        return {
          status: "accepted",
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: coreProfile,
            content: "林岚害怕深水。",
            offset: command.payload.offset,
            totalCharacters: 7,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "character_design"),
      profile: profile("setting"),
      sessionId: "session-character-document",
      runId: "run-character-document",
      executor
    });

    const beforeRead = await toolByName(
      tools,
      "edit_setting"
    ).execute("replace-before-read", {
      domain: "character", character_id: "character_alice",
      document: "core_profile",
      replacements: [{
        original_text: "害怕深水",
        new_text: "擅长潜水"
      }]
    });
    expect(beforeRead.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("请先调用 read_setting")
    });

    await toolByName(tools, "read_setting").execute(
      "read-character",
      {
        domain: "character", character_id: "character_alice",
        document: "core_profile",
        mode: "full"
      }
    );
    const proposal = await toolByName(
      tools,
      "edit_setting"
    ).execute("replace-after-read", {
      domain: "character", character_id: "character_alice",
      document: "core_profile",
      replacements: [{
        original_text: "害怕深水",
        new_text: "擅长潜水"
      }]
    });
    expect(proposal.details).toMatchObject({
      kind: "long-character-file-proposal",
      batch: {
        operations: [],
        documentWrites: [{
          fileId: coreProfile.id,
          expectedRevision: coreProfile.revision,
          content: "林岚擅长潜水。"
        }]
      }
    });
  });

  it("allows direct character state writes after continuity records exist", async () => {
    const index = committedFixtureIndex();
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(index);
      }
      if (command.type === "long.readDocument") {
        const target = index.characterFiles[0]!.currentState;
        return {
          status: "accepted",
          requestId: command.id,
          payload: {
            bookId: index.bookId,
            file: target,
            content: "",
            offset: 0,
            totalCharacters: 0,
            nextOffset: null,
            workspaceRevision: index.revision,
            projectRevision: 11
          }
        };
      }
      throw new Error(`Unexpected command: ${command.type}`);
    });
    const tools = buildLongWorkspaceTools({
      workspace: {
        ...workspace("setting", "character_design"),
        workspaceRevision: index.revision,
        navigation: createLongWorkspaceNavigationSnapshot(index)
      },
      profile: profile("setting"),
      sessionId: "session-character-ledger-owned",
      runId: "run-character-ledger-owned",
      executor
    });

    const result = await toolByName(tools, "write_setting").execute(
        "write-ledger-owned-state",
        {
          domain: "character", character_id: "character_alice",
          document: "current_state",
          text: "试图绕过连续性账本。"
        }
      );
    expect(result.details).toMatchObject({
      kind: "long-character-file-proposal"
    });
  });

  it("pins a mutation proposal to the Core index revision instead of stale session metadata", async () => {
    const latest = fixtureIndex();
    latest.revision = 9;
    const executor = vi.fn<LongCommandExecutor>(async (command) => ({
      status: "accepted",
      requestId: command.id,
      payload: {
        bookId: latest.bookId,
        workspaceIndex: latest,
        projectRevision: 17
      }
    }));
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-latest-revision",
      runId: "run-latest-revision",
      executor
    });
    const proposal = await toolByName(
      tools,
      "propose_long_mutation"
    ).execute("latest-revision", {
      domain: "worldbuilding", operations: [
        {
          type: "worldbuilding.update",
          id: "world_rules",
          patch: { title: "最新规则" }
        }
      ],
      summary: "基于最新索引"
    });

    expect(proposal.details).toMatchObject({
      kind: "long-mutation-proposal",
      baseProjectRevision: 17,
      batch: { baseRevision: 9 }
    });
  });

  it("creates character files and chapter triplets with runtime-owned ids and empty content revisions", async () => {
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type !== "long.getWorkspaceIndex") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      return indexResult();
    });
    const characterTools = buildLongWorkspaceTools({
      workspace: workspace("setting", "character_design"),
      profile: profile("setting"),
      sessionId: "session-character-create",
      runId: "run-character-create",
      executor
    });
    const characterProposal = await toolByName(
      characterTools,
      "propose_long_mutation"
    ).execute("create-character", {
      domain: "character", operations: [
        {
          type: "character.create",
          name: "沈砚",
          type_id: "major_supporting",
          aliases: ["阿砚"]
        }
      ],
      summary: "创建人物"
    });
    expect(characterProposal.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [
          {
            type: "character.create",
            character: {
              id: expect.stringMatching(/^character_[0-9a-f]{8}$/u),
              name: "沈砚",
              group: "major_supporting",
              order: 1,
              aliases: ["阿砚"]
            },
            files: {
              coreProfile: {
                revision:
                  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              },
              relationships: {
                revision:
                  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              },
              currentState: {
                revision:
                  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              },
              history: {
                revision:
                  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              }
            }
          }
        ]
      }
    });

    const plotProfile = profile("plot_design");
    expect(plotProfile.writeAccess.workspaceRoots).toEqual([
      "plot_design"
    ]);
    const plotTools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: plotProfile,
      sessionId: "session-chapter-create",
      runId: "run-chapter-create",
      executor
    });
    const chapterProposal = await toolByName(
      plotTools,
      "propose_long_mutation"
    ).execute("create-chapter", {
      domain: "worldbuilding", operations: [
        {
          type: "chapter.create",
          volumeId: "volume_one",
          primaryArcId: "arc_one",
          title: "第二章",
          characterIds: ["character_alice"]
        }
      ],
      summary: "创建章卡"
    });
    expect(chapterProposal.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [
          {
            type: "chapter.create",
            chapterCard: {
              id: expect.stringMatching(/^chapter_[0-9a-f]{8}$/u),
              volumeId: "volume_one",
              primaryArcId: "arc_one",
              narrativeOrder: 2,
              title: "第二章"
            },
            files: {
              body: {
                revision:
                  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              },
              characterState: {
                revision:
                  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              },
              handoff: {
                revision:
                  "v2:0:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
              },
              commitId: null
            }
          }
        ],
        documentWrites: []
      }
    });
  });

  it("translates foreshadowing thread and beat planning fields while preserving legacy calls", async () => {
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type !== "long.getWorkspaceIndex") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      return indexResult();
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-foreshadowing-planning",
      runId: "run-foreshadowing-planning",
      executor
    });
    const mutationTool = toolByName(tools, "propose_long_mutation");
    const parameterSchema = JSON.stringify(mutationTool.parameters);
    expect(parameterSchema).toContain('"hiddenTruth"');
    expect(parameterSchema).toContain('"plannedSpan"');
    expect(parameterSchema).toContain('"volumeId"');
    expect(parameterSchema).toContain('"arcId"');
    expect(parameterSchema).toContain("卷级计划锚点");
    expect(parameterSchema).toContain("剧情点计划锚点");
    expect(
      Check(mutationTool.parameters, {
        operations: [
          {
            type: "foreshadowing.create",
            client_ref: "legacy-thread",
            title: "旧式伏笔调用"
          },
          {
            type: "foreshadowingBeat.create",
            threadId: "ref:legacy-thread",
            beatType: "plant",
            plannedScope: "第一卷"
          }
        ],
        summary: "旧调用仍可使用"
      })
    ).toBe(true);

    const proposal = await mutationTool.execute(
      "foreshadowing-planning",
      {
        domain: "worldbuilding", operations: [
          {
            type: "volume.create",
            client_ref: "second-volume",
            title: "第二卷"
          },
          {
            type: "arc.create",
            client_ref: "second-plot-point",
            volumeId: "ref:second-volume",
            title: "身份疑云"
          },
          {
            type: "foreshadowing.create",
            client_ref: "identity-thread",
            title: "失踪者身份",
            coreQuestion: "失踪者究竟是谁？",
            hiddenTruth: "失踪者一直以管家的身份留在宅邸。",
            plannedSpan: "within_volume"
          },
          {
            type: "foreshadowingBeat.create",
            client_ref: "identity-touch",
            threadId: "ref:identity-thread",
            beatType: "plant",
            volumeId: "ref:second-volume",
            arcId: "ref:second-plot-point",
            note: "先让旧照片露出半张侧脸。"
          },
          {
            type: "foreshadowing.update",
            id: "ref:identity-thread",
            patch: {
              hiddenTruth: "失踪者就是冒名顶替的现任管家。",
              plannedSpan: "cross_volume"
            }
          },
          {
            type: "foreshadowingBeat.update",
            id: "ref:identity-touch",
            patch: {
              volumeId: null,
              arcId: "ref:second-plot-point",
              note: "触点已细化到第一剧情点。"
            }
          }
        ],
        summary: "创建并细化伏笔线与触点"
      }
    );

    expect(proposal.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [
          {
            type: "volume.create",
            volume: {
              id: expect.stringMatching(/^volume_[0-9a-f]{8}$/u),
              title: "第二卷"
            }
          },
          {
            type: "arc.create",
            arc: {
              id: expect.stringMatching(/^arc_[0-9a-f]{8}$/u),
              volumeId: expect.stringMatching(/^volume_[0-9a-f]{8}$/u),
              title: "身份疑云"
            }
          },
          {
            type: "foreshadowing.create",
            thread: {
              id: expect.stringMatching(/^foreshadow_[0-9a-f]{8}$/u),
              title: "失踪者身份",
              coreQuestion: "失踪者究竟是谁？",
              hiddenTruth: "失踪者一直以管家的身份留在宅邸。",
              plannedSpan: "within_volume",
              beats: []
            }
          },
          {
            type: "foreshadowingBeat.create",
            threadId: expect.stringMatching(/^foreshadow_[0-9a-f]{8}$/u),
            beat: {
              id: expect.stringMatching(/^beat_[0-9a-f]{8}$/u),
              type: "plant",
              volumeId: expect.stringMatching(/^volume_[0-9a-f]{8}$/u),
              arcId: expect.stringMatching(/^arc_[0-9a-f]{8}$/u),
              note: "先让旧照片露出半张侧脸。"
            }
          },
          {
            type: "foreshadowing.update",
            id: expect.stringMatching(/^foreshadow_[0-9a-f]{8}$/u),
            patch: {
              hiddenTruth: "失踪者就是冒名顶替的现任管家。",
              plannedSpan: "cross_volume"
            }
          },
          {
            type: "foreshadowingBeat.update",
            id: expect.stringMatching(/^beat_[0-9a-f]{8}$/u),
            patch: {
              volumeId: null,
              arcId: expect.stringMatching(/^arc_[0-9a-f]{8}$/u),
              note: "触点已细化到第一剧情点。"
            }
          }
        ]
      }
    });
    if (proposal.details?.kind !== "long-mutation-proposal") {
      throw new Error("Expected a long mutation proposal.");
    }
    const operations = proposal.details.batch.operations;
    const createdVolume = operations[0];
    const createdArc = operations[1];
    const createdThread = operations[2];
    const createdBeat = operations[3];
    const updatedThread = operations[4];
    const updatedBeat = operations[5];
    if (
      createdVolume?.type !== "volume.create" ||
      createdArc?.type !== "arc.create" ||
      createdThread?.type !== "foreshadowing.create" ||
      createdBeat?.type !== "foreshadowingBeat.create" ||
      updatedThread?.type !== "foreshadowing.update" ||
      updatedBeat?.type !== "foreshadowingBeat.update"
    ) {
      throw new Error("Expected translated foreshadowing operations.");
    }
    expect(createdArc.arc.volumeId).toBe(createdVolume.volume.id);
    expect(createdBeat.threadId).toBe(createdThread.thread.id);
    expect(createdBeat.beat.volumeId).toBe(createdVolume.volume.id);
    expect(createdBeat.beat.arcId).toBe(createdArc.arc.id);
    expect(updatedThread.id).toBe(createdThread.thread.id);
    expect(updatedBeat.id).toBe(createdBeat.beat.id);
    expect(updatedBeat.patch.arcId).toBe(createdArc.arc.id);
  });

  it("computes document revisions from logical targets and rejects the generic draft-write bypass", async () => {
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult();
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const index = fixtureIndex();
      const worldFile = fixtureWorldFile(index);
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: index.bookId,
          file: {
            ...worldFile,
            revision: "v1:2:77777777"
          },
          content: "旧",
          offset: 0,
          totalCharacters: 1,
          nextOffset: null,
          workspaceRevision: index.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("setting", "worldbuilding"),
      profile: profile("setting"),
      sessionId: "session-document-replace",
      runId: "run-document-replace",
      executor
    });
    const content = "潮汐规则只允许在月蚀时逆转。";
    const proposal = await toolByName(
      tools,
      "propose_long_mutation"
    ).execute("replace-world-document", {
      domain: "worldbuilding", operations: [
        {
          type: "worldbuilding.update",
          id: "world_rules",
          patch: { title: "潮汐规则" }
        }
      ],
      document_updates: [
        {
          target: {
            kind: "worldbuilding",
            categoryId: "world_rules"
          },
          content,
          reason: "同步完整规则正文"
        }
      ],
      summary: "更新规则标题与正文"
    });
    const expectedHash = createHash("sha256")
      .update(content, "utf8")
      .digest("hex");
    expect(proposal.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        documentWrites: [
          {
            fileId: longWorldbuildingFileId("world_rules"),
            content,
            mode: "replace",
            expectedRevision: "v1:2:77777777",
            nextRevision: `v2:${Buffer.byteLength(content, "utf8")}:${expectedHash}`,
            reason: "同步完整规则正文"
          }
        ]
      }
    });

    const plotTools = buildLongWorkspaceTools({
      workspace: workspace("plot_design", "plot_design"),
      profile: profile("plot_design"),
      sessionId: "session-no-draft-bypass",
      runId: "run-no-draft-bypass",
      executor
    });
    expect(
      JSON.stringify(
        toolByName(plotTools, "propose_long_mutation").parameters
      )
    ).not.toContain('"kind":"draft"');
    await expect(
      toolByName(plotTools, "propose_long_mutation").execute(
        "draft-bypass",
        {
          domain: "worldbuilding", operations: [
            {
              type: "chapter.update",
              id: "chapter_one",
              patch: { title: "第一章（修订章卡）" }
            }
          ],
          document_updates: [
            {
              target: {
                kind: "draft",
                chapterCardId: "chapter_one",
                role: "body"
              },
              content: "试图绕过三件套工具",
              reason: "越权"
            }
          ],
          summary: "越权"
        } as never
      )
    ).rejects.toThrow(/not valid generic mutation targets/u);
  });

  it("locks chapter writes to the active chapter and accepts body content only", async () => {
    const latest = fixtureIndex();
    latest.chapters[0]!.body.revision = "v1:4:11111111";
    latest.chapters[0]!.characterState.revision = "v1:5:22222222";
    latest.chapters[0]!.handoff.revision = "v1:6:33333333";
    const chapter = latest.chapters[0]!;
    const liveRevisions = new Map([
      [chapter.body.id, "v1:7:44444444"],
      [chapter.characterState.id, "v1:8:55555555"],
      [chapter.handoff.id, "v1:9:66666666"]
    ]);
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const requested = [
        chapter.body,
        chapter.characterState,
        chapter.handoff
      ].find(({ id }) => id === command.payload.fileId)!;
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: {
            ...requested,
            revision: liveRevisions.get(requested.id)!
          },
          content: requested.id === chapter.body.id ? "" : "x",
          offset: 0,
          totalCharacters: requested.id === chapter.body.id ? 0 : 1,
          nextOffset: null,
          workspaceRevision: latest.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft", "chapter_one"),
      profile: profile("draft"),
      sessionId: "session-chapter",
      runId: "run-chapter",
      writeApprovalMode: "auto-approve",
      executor
    });
    const writeInput = {
      content: "正文",
      summary: "完成第一章"
    };
    const result = await toolByName(
      tools,
      "write_chapter_draft"
    ).execute("chapter-write", writeInput);

    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls[0]?.[0].type).toBe("long.getWorkspaceIndex");
    expect(result.details).toMatchObject({
      kind: "long-chapter-write-proposal",
      bookId: "longbook_tools",
      batch: {
        baseRevision: 7,
        operations: [],
        documentWrites: [{
          fileId: longChapterBodyFileId("chapter_one"),
          content: "正文",
          mode: "replace",
          expectedRevision: "v1:7:44444444"
        }]
      },
      baseProjectRevision: 11,
      file: {
        chapterCardId: "chapter_one",
        operation: "write",
        beforeText: "",
        afterText: "正文",
        beforeRevision: "v1:7:44444444"
      }
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("正文写入提案")
    });
    const tool = toolByName(tools, "write_chapter_draft");
    const parameters = JSON.stringify(tool.parameters);
    expect(parameters).not.toMatch(
      /bookId|book_id|chapter_card_id|character_state|handoff|path|revision/u
    );
    expect(Check(tool.parameters, writeInput)).toBe(true);
    expect(
      Check(tool.parameters, {
        content: "正文",
        base_revision: REVISION,
        summary: "旧参数"
      })
    ).toBe(false);
    await expect(
      tool.execute("chapter-write-empty", {
        ...writeInput,
        content: "   "
      })
    ).rejects.toThrow(/non-empty/u);
    await expect(
      tool.execute("chapter-write-empty-summary", {
        ...writeInput,
        summary: "   "
      })
    ).rejects.toThrow(/non-empty/u);
  });

  it("requires a full read and explicit permission before overwriting non-empty chapter text", async () => {
    const latest = fixtureIndex();
    const chapter = latest.chapters[0]!;
    chapter.bodyStatus = "written";
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: chapter.body,
          content: "旧正文",
          offset: 0,
          totalCharacters: 3,
          nextOffset: null,
          workspaceRevision: latest.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft", "chapter_one"),
      profile: profile("draft"),
      sessionId: "session-existing-chapter",
      runId: "run-existing-chapter",
      executor
    });
    const write = toolByName(tools, "write_chapter_draft");
    const input = {
      content: "新正文",
      summary: "重写第一章"
    };

    expect(resultText(await write.execute("without-confirmation", input))).toContain(
      "allow_overwrite_existing=true"
    );
    expect(
      resultText(
        await write.execute("without-full-read", {
          ...input,
          allow_overwrite_existing: true
        })
      )
    ).toContain("read_chapter（mode=full）");

    await toolByName(tools, "read_chapter").execute("full-read", {
      mode: "full"
    });
    const result = await write.execute("confirmed-overwrite", {
      ...input,
      allow_overwrite_existing: true
    });
    expect(result.details).toMatchObject({
      kind: "long-chapter-write-proposal",
      file: {
        operation: "write",
        beforeText: "旧正文",
        afterText: "新正文"
      }
    });
  });

  it("lets the chapter writer read any chapter body while writes stay active-only", async () => {
    const latest = fixtureIndex();
    const first = latest.chapters[0]!;
    latest.plot.chapterCards.push({
      id: "chapter_two",
      volumeId: "volume_one",
      primaryArcId: "arc_one",
      title: "第二章",
      narrativeOrder: 2
    });
    latest.chapters.push({
      ...first,
      chapterCardId: "chapter_two",
      bodyStatus: "written",
      body: file(
        longChapterBodyFileId("chapter_two"),
        "long/chapters/two/body.md"
      ),
      card: file(
        longChapterCardFileId("chapter_two"),
        "long/chapters/two/card.md"
      ),
      characterState: file(
        longChapterCharacterStateFileId("chapter_two"),
        "long/chapters/two/character-state.md"
      ),
      handoff: file(
        longChapterHandoffFileId("chapter_two"),
        "long/chapters/two/handoff.md"
      ),
      foreshadowingChanges: file(
        longChapterForeshadowingChangesFileId("chapter_two"),
        longChapterContinuityFilePath(
          "chapter_two",
          "foreshadowing-changes.md"
        )
      )
    });
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const chapter = latest.chapters.find(
        ({ body }) => body.id === command.payload.fileId
      )!;
      const content =
        chapter.chapterCardId === "chapter_one" ? "第一章正文" : "第二章正文";
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: chapter.body,
          content,
          offset: 0,
          totalCharacters: content.length,
          nextOffset: null,
          workspaceRevision: latest.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace("draft", "draft", "chapter_two"),
      profile: profile("draft"),
      sessionId: "session-read-any-chapter",
      runId: "run-read-any-chapter",
      executor
    });
    const read = toolByName(tools, "read_chapter");

    const firstText = resultText(
      await read.execute("read-first", {
        chapter_card_id: "chapter_one",
        mode: "full"
      })
    );
    expect(() => JSON.parse(firstText)).toThrow();
    expect(firstText).not.toContain('"chapter_card_id"');
    expect(firstText).toBe(
      [
        "完整内容：",
        "",
        "第一章",
        "chapter_card_id=chapter_one",
        "document=body",
        "mode=full",
        "",
        "正文",
        "第一章正文"
      ].join("\n")
    );
    const secondText = resultText(
      await read.execute("read-second", {
        chapter_card_id: "chapter_two",
        mode: "full"
      })
    );
    expect(secondText).toContain("chapter_card_id=chapter_two");
    expect(secondText).toContain("第二章正文");
    expect(toolByName(tools, "write_chapter_draft").description).toContain(
      "运行时锁定章节"
    );
  });

  it("allows the chapter writer to refine a committed chapter body", async () => {
    const latest = committedFixtureIndex();
    const chapter = latest.chapters[0]!;
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: chapter.body,
          content: "旧正文措辞",
          offset: 0,
          totalCharacters: 5,
          nextOffset: null,
          workspaceRevision: latest.revision,
          projectRevision: 11
        }
      };
    });
    const committedWorkspace = workspace(
      "draft",
      "draft",
      "chapter_one"
    );
    committedWorkspace.navigation =
      createLongWorkspaceNavigationSnapshot(latest);
    const tools = buildLongWorkspaceTools({
      workspace: committedWorkspace,
      profile: profile("draft"),
      sessionId: "session-refine-committed-chapter",
      runId: "run-refine-committed-chapter",
      executor
    });

    await toolByName(tools, "read_chapter").execute("read-committed", {
      mode: "full"
    });
    const result = await toolByName(
      tools,
      "edit_chapter_draft"
    ).execute("refine-committed", {
      replacements: [
        { original_text: "旧正文措辞", new_text: "精修后的正文措辞" }
      ],
      summary: "精修已提交正文措辞"
    });

    expect(result.details).toMatchObject({
      kind: "long-chapter-write-proposal",
      file: {
        chapterCardId: "chapter_one",
        operation: "edit",
        beforeText: "旧正文措辞",
        afterText: "精修后的正文措辞"
      }
    });
    expect(
      toolByName(tools, "edit_chapter_draft").description
    ).toContain("不限制局部或大幅修改");
  });

  it("creates, writes, edits, and commits chapter continuity text files", async () => {
    const latest = fixtureIndex();
    const chapter = latest.chapters[0]!;
    chapter.bodyStatus = "written";
    latest.plot.foreshadowing.push({
      id: "foreshadow_seal",
      title: "蜡封来源",
      coreQuestion: "蜡封来自谁？",
      truthEventId: null,
      expectedReaderEffect: "让读者注意蜡封图案。",
      status: "planned",
      beats: [
        {
          id: "beat_seal_plant",
          type: "plant",
          order: 1,
          eventId: null,
          placementId: null,
          chapterCardId: "chapter_one",
          plannedScope: "",
          note: "正文首次呈现蜡封。",
          status: "planned",
          commitId: null
        }
      ]
    });
    const fileContents = new Map([
      [chapter.body.id, "第一章正文。"],
      [chapter.characterState.id, "章末状态：林岚抵达北门。"],
      [chapter.handoff.id, "接续包：追兵即将封锁北门。"],
      [chapter.foreshadowingChanges.id, "无变化。"]
    ]);
    const indexedFiles = [
      chapter.body,
      chapter.characterState,
      chapter.handoff,
      chapter.foreshadowingChanges
    ];
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const requested = indexedFiles.find(
        ({ id }) => id === command.payload.fileId
      );
      if (!requested) {
        throw new Error(`Unknown test file: ${command.payload.fileId}`);
      }
      const content = fileContents.get(requested.id) ?? "";
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: requested,
          content,
          offset: 0,
          totalCharacters: content.length,
          nextOffset: null,
          workspaceRevision: latest.revision,
          projectRevision: 11
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace(
        "continuity_ledger",
        "continuity_ledger",
        "chapter_one"
      ),
      profile: profile("continuity_ledger"),
      sessionId: "session-continuity-files",
      runId: "run-continuity-files",
      executor
    });

    const list = await toolByName(tools, "list_continuity_files").execute(
      "list-continuity",
      { chapter_card_id: "chapter_one" }
    );
    expect(resultText(list)).toContain("foreshadowing_changes");
    expect(resultText(list)).toContain("foreshadow_seal");
    expect(resultText(list)).toContain("beat_seal_plant");
    expect(resultText(list)).toContain("not_created");

    await toolByName(tools, "read_continuity_file").execute(
      "read-foreshadowing",
      {
        domain: "character", target: { document: "foreshadowing_changes" },
        mode: "full"
      }
    );
    const edit = await toolByName(
      tools,
      "edit_continuity_file"
    ).execute("edit-foreshadowing", {
      domain: "character", target: { document: "foreshadowing_changes" },
      replacements: [
        { original_text: "无变化。", new_text: "蜡封伏笔已种下。" }
      ]
    });
    expect(edit.details).toMatchObject({
      kind: "long-continuity-file-proposal",
      files: [
        {
          role: "foreshadowing_changes",
          operation: "edit",
          beforeText: "无变化。",
          afterText: "蜡封伏笔已种下。"
        }
      ]
    });

    const characterId = latest.characters[0]!.id;
    const createCharacter = await toolByName(
      tools,
      "create_continuity_file"
    ).execute("create-character-continuity", {
      domain: "character", target: { document: "character", character_id: characterId }
    });
    expect(createCharacter.details).toMatchObject({
      kind: "long-continuity-file-proposal",
      batch: {
        operations: [
          { type: "chapterContinuity.character.create", characterId }
        ],
        documentWrites: [
          { mode: "create", expectedRevision: null },
          { mode: "create", expectedRevision: null }
        ]
      },
      files: [
        { role: "character_current_state", operation: "create" },
        { role: "character_history", operation: "create" }
      ]
    });

    for (const [document, text] of [
      ["character_current_state", "当前状态：林岚抵达北门。"],
      ["character_history", "第一章：林岚在追兵前抵达北门。"]
    ] as const) {
      const write = await toolByName(
        tools,
        "write_continuity_file"
      ).execute(`write-${document}`, {
        target: { document, character_id: characterId },
        text
      });
      expect(write.details).toMatchObject({
        kind: "long-continuity-file-proposal",
        files: [{ role: document, operation: "write", afterText: text }]
      });
    }

    await toolByName(tools, "create_continuity_file").execute(
      "create-world-reveals",
      { domain: "character", target: { document: "world_reveals" } }
    );
    await toolByName(tools, "write_continuity_file").execute(
      "write-world-reveals",
      {
        domain: "character", target: { document: "world_reveals" },
        text: "本章揭露北门蜡封可感知灵力。"
      }
    );

    const commitTool = toolByName(tools, "propose_continuity_commit");
    await expect(
      commitTool.execute("reject-missing-touchpoint-decision", {
        summary: "不应遗漏伏笔触点决策",
        foreshadowing_touchpoint_decisions: []
      })
    ).rejects.toThrow(/必须完整覆盖/u);
    await expect(
      commitTool.execute("reject-wrong-foreshadowing-link", {
        summary: "不应关联错误伏笔线",
        foreshadowing_touchpoint_decisions: [
          {
            foreshadowing_id: "foreshadow_other",
            beat_id: "beat_seal_plant",
            status: "committed",
            evidence: "正文明确写出信封上的蜡封图案。"
          }
        ]
      })
    ).rejects.toThrow(/不属于伏笔线/u);
    const commit = await commitTool.execute("commit-continuity", {
      summary: "留存第一章连续性记录",
      foreshadowing_touchpoint_decisions: [
        {
          foreshadowing_id: "foreshadow_seal",
          beat_id: "beat_seal_plant",
          status: "committed",
          evidence: "正文明确写出信封上的蜡封图案。"
        }
      ]
    });
    expect(commit.details).toMatchObject({
      kind: "long-ledger-commit-proposal",
      input: {
        mode: "text_files",
        bookId: "longbook_tools",
        chapterCardId: "chapter_one",
        chapterFileRevisions: { body: chapter.body.revision },
        foreshadowingBeatDecisions: {
          beat_seal_plant: {
            status: "committed",
            note: "正文明确写出信封上的蜡封图案。"
          }
        },
        commitMessage: "留存第一章连续性记录",
        baseWorkspaceRevision: 7,
        baseProjectRevision: 11
      }
    });
    if (
      !commit.details ||
      commit.details.kind !== "long-ledger-commit-proposal" ||
      commit.details.input.mode !== "text_files"
    ) {
      throw new Error("Expected a text-file continuity commit proposal.");
    }
    expect(commit.details.input.continuityFileRevisions).toHaveLength(6);
    expect(JSON.stringify(commitTool.parameters)).not.toMatch(
      /file_id|revision|fact_mutations|open_loop/u
    );
    expect(tools.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining([
        "set_long_ledger_fact_mutation",
        "propose_long_ledger_commit"
      ])
    );

    const deleteTool = toolByName(tools, "delete_continuity_file");
    const deleteWorld = await deleteTool.execute(
      "delete-world-reveals",
      { domain: "character", target: { document: "world_reveals" } }
    );
    expect(deleteWorld.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [
          {
            type: "chapterContinuity.worldReveals.delete",
            chapterCardId: "chapter_one"
          }
        ],
        documentWrites: []
      }
    });
    const deleteCharacter = await deleteTool.execute(
      "delete-character-continuity",
      {
        domain: "character", target: {
          document: "character",
          character_id: characterId
        }
      }
    );
    expect(deleteCharacter.details).toMatchObject({
      kind: "long-mutation-proposal",
      batch: {
        operations: [
          {
            type: "chapterContinuity.character.delete",
            chapterCardId: "chapter_one",
            characterId
          }
        ],
        documentWrites: []
      }
    });
    expect(JSON.stringify(deleteTool.parameters)).not.toMatch(
      /body|chapter_end_state|handoff|foreshadowing_changes/u
    );
    expect(deleteTool.description).toMatch(/误创建|不再适用/u);
    const commitAfterOptionalDeletes = await commitTool.execute(
      "commit-after-optional-deletes",
      {
        summary: "删除误建文件后留存第一章连续性记录",
        foreshadowing_touchpoint_decisions: [
          {
            foreshadowing_id: "foreshadow_seal",
            beat_id: "beat_seal_plant",
            status: "missed",
            evidence: "正文未出现计划中的蜡封图案。"
          }
        ]
      }
    );
    if (
      !commitAfterOptionalDeletes.details ||
      commitAfterOptionalDeletes.details.kind !==
        "long-ledger-commit-proposal" ||
      commitAfterOptionalDeletes.details.input.mode !== "text_files"
    ) {
      throw new Error("Expected a text-file continuity commit proposal.");
    }
    expect(
      commitAfterOptionalDeletes.details.input.continuityFileRevisions
    ).toHaveLength(3);
    expect(
      commitAfterOptionalDeletes.details.input.foreshadowingBeatDecisions
    ).toEqual({
      beat_seal_plant: {
        status: "missed",
        note: "正文未出现计划中的蜡封图案。"
      }
    });

  });

  it("lists catch-up hints and writes unrecorded chapters without an active selection", async () => {
    const latest = twoWrittenChaptersIndex();
    const first = latest.chapters[0]!;
    const second = latest.chapters[1]!;
    const fileContents = new Map([
      [first.body.id, "第一章正文。"],
      [first.characterState.id, ""],
      [first.handoff.id, ""],
      [second.body.id, "第二章正文。"],
      [second.characterState.id, ""],
      [second.handoff.id, ""]
    ]);
    const indexedFiles = [
      first.body,
      first.characterState,
      first.handoff,
      second.body,
      second.characterState,
      second.handoff
    ];
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const requested = indexedFiles.find(
        ({ id }) => id === command.payload.fileId
      );
      if (!requested) {
        throw new Error(`Unknown test file: ${command.payload.fileId}`);
      }
      const content = fileContents.get(requested.id) ?? "";
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: requested,
          content,
          offset: 0,
          totalCharacters: content.length,
          nextOffset: null,
          workspaceRevision: latest.revision,
          projectRevision: 11
        }
      };
    });
    const bookLevelWorkspace: LongWorkspaceRuntimeContext = {
      bookId: latest.bookId,
      title: "工具测试",
      activeRoot: "continuity_ledger",
      activeAgentId: "continuity_ledger",
      workspaceRevision: latest.revision,
      projectRevision: 11,
      navigation: createLongWorkspaceNavigationSnapshot(latest)
    };
    const tools = buildLongWorkspaceTools({
      workspace: bookLevelWorkspace,
      profile: profile("continuity_ledger"),
      sessionId: "session-continuity-catchup",
      runId: "run-continuity-catchup",
      executor
    });
    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "write_continuity_file",
        "propose_continuity_commit"
      ])
    );

    const listed = JSON.parse(
      resultText(
        await toolByName(tools, "list_continuity_files").execute(
          "list-catchup",
          {}
        )
      )
    ) as {
      pending_catchup: Array<{
        chapter_card_id: string;
        suggested_record: string;
      }>;
    };
    expect(listed.pending_catchup).toEqual([
      { chapter_card_id: "chapter_one", title: "第一章", suggested_record: "brief" },
      { chapter_card_id: "chapter_two", title: "第二章", suggested_record: "full" }
    ]);

    await expect(
      toolByName(tools, "write_continuity_file").execute(
        "missing-chapter",
        {
          target: { document: "chapter_end_state" },
          text: "缺少章卡。"
        }
      )
    ).rejects.toThrow(/chapter_card_id/u);

    await toolByName(tools, "write_continuity_file").execute(
      "write-first-state",
      {
        chapter_card_id: "chapter_one",
        target: { document: "chapter_end_state" },
        text: "简短章末：林岚离开北门。"
      }
    );
    await toolByName(tools, "write_continuity_file").execute(
      "write-first-handoff",
      {
        chapter_card_id: "chapter_one",
        target: { document: "handoff" },
        text: "简短接续：追兵未至。"
      }
    );
    const firstCommit = await toolByName(
      tools,
      "propose_continuity_commit"
    ).execute("commit-first", {
      chapter_card_id: "chapter_one",
      summary: "简记第一章",
      foreshadowing_touchpoint_decisions: []
    });
    expect(firstCommit.details).toMatchObject({
      kind: "long-ledger-commit-proposal",
      input: {
        chapterCardId: "chapter_one",
        continuityFileRevisions: expect.arrayContaining([
          expect.objectContaining({ fileId: first.characterState.id }),
          expect.objectContaining({ fileId: first.handoff.id })
        ])
      }
    });
    if (
      !firstCommit.details ||
      firstCommit.details.kind !== "long-ledger-commit-proposal" ||
      firstCommit.details.input.mode !== "text_files"
    ) {
      throw new Error("Expected a brief first-chapter continuity commit.");
    }
    expect(firstCommit.details.input.continuityFileRevisions).toHaveLength(2);

    await toolByName(tools, "write_continuity_file").execute(
      "write-second-state",
      {
        chapter_card_id: "chapter_two",
        target: { document: "chapter_end_state" },
        text: "完整章末：林岚在北门与追兵对峙，旧伤复发。"
      }
    );
    await toolByName(tools, "write_continuity_file").execute(
      "write-second-handoff",
      {
        chapter_card_id: "chapter_two",
        target: { document: "handoff" },
        text: "完整接续：下一章从封锁后的北门巷战开始。"
      }
    );
    const secondCommit = await toolByName(
      tools,
      "propose_continuity_commit"
    ).execute("commit-second", {
      chapter_card_id: "chapter_two",
      summary: "完整记录第二章",
      foreshadowing_touchpoint_decisions: []
    });
    expect(secondCommit.details).toMatchObject({
      kind: "long-ledger-commit-proposal",
      input: {
        chapterCardId: "chapter_two"
      }
    });
  });

  it("registers continuity finalization after unrelated file approvals advance global revisions", async () => {
    const latest = fixtureIndex();
    const chapter = latest.chapters[0]!;
    chapter.bodyStatus = "written";
    const fileContents = new Map([
      [chapter.body.id, "第一章正文。"],
      [chapter.characterState.id, "章末状态：林岚抵达北门。"],
      [chapter.handoff.id, "接续包：追兵即将封锁北门。"],
      [chapter.foreshadowingChanges.id, ""]
    ]);
    const indexedFiles = [
      chapter.body,
      chapter.characterState,
      chapter.handoff,
      chapter.foreshadowingChanges
    ];
    let liveWorkspaceRevision = latest.revision;
    let liveProjectRevision = 11;
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const requested = indexedFiles.find(
        ({ id }) => id === command.payload.fileId
      );
      if (!requested) {
        throw new Error(`Unknown test file: ${command.payload.fileId}`);
      }
      const content = fileContents.get(requested.id) ?? "";
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: requested,
          content,
          offset: 0,
          totalCharacters: content.length,
          nextOffset: null,
          workspaceRevision: liveWorkspaceRevision,
          projectRevision: liveProjectRevision
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace(
        "continuity_ledger",
        "continuity_ledger",
        "chapter_one"
      ),
      profile: profile("continuity_ledger"),
      sessionId: "session-continuity-rebased-read",
      runId: "run-continuity-rebased-read",
      executor
    });

    const list = await toolByName(
      tools,
      "list_continuity_files"
    ).execute("list-no-foreshadowing", {
      chapter_card_id: "chapter_one"
    });
    expect(resultText(list)).not.toContain("foreshadowing_changes");
    expect(resultText(list)).toContain(
      '"foreshadowing_touchpoint_candidates": []'
    );
    await expect(
      toolByName(tools, "write_continuity_file").execute(
        "reject-unmodeled-foreshadowing",
        {
          domain: "character", target: { document: "foreshadowing_changes" },
          text: "不应创建的伏笔记录。"
        }
      )
    ).rejects.toThrow(/没有关联伏笔总览中的既有触点/u);

    await toolByName(tools, "read_chapter").execute("read-body", {
      mode: "full"
    });
    liveWorkspaceRevision += 3;
    liveProjectRevision += 3;

    const commit = await toolByName(
      tools,
      "propose_continuity_commit"
    ).execute("commit-after-file-approvals", {
      summary: "连续性文件获批后归档第一章",
      foreshadowing_touchpoint_decisions: []
    });

    expect(commit.details).toMatchObject({
      kind: "long-ledger-commit-proposal",
      input: {
        chapterFileRevisions: { body: chapter.body.revision },
        continuityFileRevisions: expect.not.arrayContaining([
          expect.objectContaining({ fileId: chapter.foreshadowingChanges.id })
        ]),
        foreshadowingBeatDecisions: {},
        baseWorkspaceRevision: latest.revision,
        baseProjectRevision: 11
      }
    });
  });

  it("still rejects continuity finalization when the chapter file itself changed", async () => {
    const latest = fixtureIndex();
    const chapter = latest.chapters[0]!;
    chapter.bodyStatus = "written";
    const changedBody = {
      ...chapter.body,
      revision: `v2:15:${"a".repeat(64)}`
    };
    let bodyChanged = false;
    const executor = vi.fn<LongCommandExecutor>(async (command) => {
      if (command.type === "long.getWorkspaceIndex") {
        return indexResult(latest);
      }
      if (command.type !== "long.readDocument") {
        throw new Error(`Unexpected command: ${command.type}`);
      }
      const isBody = command.payload.fileId === chapter.body.id;
      const content = isBody
        ? bodyChanged
          ? "正文已在外部更新。"
          : "初始正文。"
        : "已有连续性内容。";
      return {
        status: "accepted",
        requestId: command.id,
        payload: {
          bookId: latest.bookId,
          file: isBody
            ? bodyChanged
              ? changedBody
              : chapter.body
            : [
                chapter.characterState,
                chapter.handoff,
                chapter.foreshadowingChanges
              ].find(({ id }) => id === command.payload.fileId)!,
          content,
          offset: 0,
          totalCharacters: content.length,
          nextOffset: null,
          workspaceRevision: latest.revision + 1,
          projectRevision: 12
        }
      };
    });
    const tools = buildLongWorkspaceTools({
      workspace: workspace(
        "continuity_ledger",
        "continuity_ledger",
        "chapter_one"
      ),
      profile: profile("continuity_ledger"),
      sessionId: "session-continuity-changed-body",
      runId: "run-continuity-changed-body",
      executor
    });

    await toolByName(tools, "read_chapter").execute("read-initial-body", {
      mode: "full"
    });
    bodyChanged = true;

    await expect(
      toolByName(tools, "propose_continuity_commit").execute(
        "commit-changed-body",
        {
          summary: "不应归档已变化的正文",
          foreshadowing_touchpoint_decisions: []
        }
      )
    ).rejects.toThrow(/changed after continuity analysis/u);
  });

  it("rejects chapter mutations against stale, mismatched, or committed workspace context", async () => {
    const writeInput = {
      content: "正文",
      summary: "完成第一章"
    };
    const staleWorkspace = workspace(
      "draft",
      "draft",
      "chapter_one"
    );
    staleWorkspace.projectRevision = 10;
    const staleTools = buildLongWorkspaceTools({
      workspace: staleWorkspace,
      profile: profile("draft"),
      sessionId: "session-stale-chapter",
      runId: "run-stale-chapter",
      executor: vi.fn<LongCommandExecutor>(async () => indexResult())
    });
    await expect(
      toolByName(staleTools, "write_chapter_draft").execute(
        "stale-chapter",
        writeInput
      )
    ).rejects.toThrow(/context no longer matches/u);

    const mismatchedWorkspace = workspace(
      "draft",
      "draft",
      "chapter_one"
    );
    mismatchedWorkspace.navigation.chapterCards[0]!.title = "过期章名";
    const mismatchedTools = buildLongWorkspaceTools({
      workspace: mismatchedWorkspace,
      profile: profile("draft"),
      sessionId: "session-mismatched-chapter",
      runId: "run-mismatched-chapter",
      executor: vi.fn<LongCommandExecutor>(async () => indexResult())
    });
    await expect(
      toolByName(mismatchedTools, "write_chapter_draft").execute(
        "mismatched-chapter",
        writeInput
      )
    ).rejects.toThrow(/target chapter no longer matches/u);

    const otherBookIndex = fixtureIndex();
    otherBookIndex.bookId = "longbook_other";
    const otherBookTools = buildLongWorkspaceTools({
      workspace: workspace(
        "draft",
        "draft",
        "chapter_one"
      ),
      profile: profile("draft"),
      sessionId: "session-other-book",
      runId: "run-other-book",
      executor: vi.fn<LongCommandExecutor>(async () =>
        indexResult(otherBookIndex)
      )
    });
    await expect(
      toolByName(otherBookTools, "write_chapter_draft").execute(
        "other-book",
        writeInput
      )
    ).rejects.toThrow(/another book/u);

    const committedIndex = committedFixtureIndex();
    const committedWorkspace = workspace(
      "continuity_ledger",
      "continuity_ledger",
      "chapter_one"
    );
    committedWorkspace.navigation =
      createLongWorkspaceNavigationSnapshot(committedIndex);
    const committedTools = buildLongWorkspaceTools({
      workspace: committedWorkspace,
      profile: profile("continuity_ledger"),
      sessionId: "session-committed-chapter",
      runId: "run-committed-chapter",
      executor: vi.fn<LongCommandExecutor>(async () =>
        indexResult(committedIndex)
      )
    });
    await expect(
      toolByName(committedTools, "write_continuity_file").execute(
        "committed-chapter",
        {
          domain: "character", target: { document: "foreshadowing_changes" },
          text: "重复提交"
        }
      )
    ).rejects.toThrow(/already committed/u);
    await expect(
      toolByName(committedTools, "delete_continuity_file").execute(
        "delete-from-committed-chapter",
        { domain: "character", target: { document: "world_reveals" } }
      )
    ).rejects.toThrow(/already committed/u);
  });

  it("maps proposal details to independent long runtime events", () => {
    const batch = {
      baseRevision: 7,
      updatedAt: NOW,
      operations: [
        {
          type: "worldbuilding.update" as const,
          id: "world_rules",
          patch: { title: "新规则" }
        }
      ],
      documentWrites: []
    };
    const details: LongAgentToolDetails = {
      kind: "long-mutation-proposal",
      bookId: "longbook_tools",
      agentId: "setting",
      batch,
      baseProjectRevision: 11,
      summary: "更新规则"
    };
    const events = toRuntimeEvents(
      {
        type: "tool_execution_end",
        toolCallId: "tool-long",
        toolName: "propose_long_mutation",
        result: {
          content: [{ type: "text", text: "已形成提案" }],
          details
        },
        isError: false
      },
      {
        runId: "run-long",
        sessionId: "session-long",
        prompt: "更新规则"
      },
      {
        provider: "deepwrite",
        model: "test",
        mode: "local-faux"
      },
      "message-long"
    );

    expect(events.map((event) => event.type)).toEqual([
      "agent.tool_completed",
      "long.mutation_proposal"
    ]);
    expect(events[1]).toMatchObject({
      type: "long.mutation_proposal",
      payload: {
        toolCallId: "tool-long",
        bookId: "longbook_tools",
        batch,
        baseProjectRevision: 11
      }
    });
  });
});
