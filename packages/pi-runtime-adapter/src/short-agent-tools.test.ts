import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
  SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS,
  SCRIPT_WORKSPACE_TEXT_STAGE_IDS,
  SHORT_WORKSPACE_TEXT_STAGE_IDS,
  createDefaultCreativePlotStages,
  createShortWorkspaceContentRevision,
  type ScriptWorkspaceAgentProfile,
  type ScriptWorkspaceAgentId,
  type ScriptWorkspaceSnapshot,
  type ShortWorkspaceAgentId,
  type ShortWorkspaceAgentProfile,
  type ShortWorkspaceSnapshot
} from "@deepwrite/contracts";
import { describe, expect, it } from "vitest";
import {
  buildScriptWorkspaceTools,
  buildShortWorkspaceTools,
  createShortWorkspaceToolSharedState,
  SHORT_WORKSPACE_TOOL_MANIFEST,
  type ShortWorkspaceToolDetails
} from "./short-agent-tools";

function profile(agentId: ShortWorkspaceAgentId): ShortWorkspaceAgentProfile {
  const value = DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.find(
    (candidate) => candidate.id === agentId
  );
  if (!value) throw new Error(`Missing profile: ${agentId}`);
  return value;
}

function scriptProfile(
  agentId: ScriptWorkspaceAgentId
): ScriptWorkspaceAgentProfile {
  const value = DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.find(
    (candidate) => candidate.id === agentId
  );
  if (!value) throw new Error(`Missing script profile: ${agentId}`);
  return value;
}

function workspace(
  activeStageId: ShortWorkspaceSnapshot["activeStageId"] = "plot_design"
): ShortWorkspaceSnapshot {
  return {
    id: "short-tool-test",
    title: "雾港回声",
    categories: ["悬疑"],
    activeStageId,
    characterStructure: { format: "text" },
    plotStages: createDefaultCreativePlotStages(),
    expertDraft: {
      id: "draft",
      title: "正文",
      revision: createShortWorkspaceContentRevision("draft-directory"),
      sections: [
        expertSection(
          "intro",
          "导语",
          "150 字",
          "雨夜名单出现了。",
          "林默尚未看清名单。"
        ),
        expertSection(
          "section-1",
          "第一节·迟到的汽笛",
          "1000 字",
          "汽笛迟到了七分钟。共同片段。",
          ""
        ),
        expertSection(
          "section-2",
          "第二节·暗房",
          "1200 字",
          "共同片段。暗房里显出了照片。",
          "苏遥拿着底片。"
        )
      ]
    },
    stages: SHORT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
      stageId,
      title: stageId,
      content: stageId === "plot_design" ? "旧剧情的唯一片段。" : "",
      revision: createShortWorkspaceContentRevision(
        stageId === "plot_design" ? "旧剧情的唯一片段。" : ""
      )
    }))
  };
}

function scriptWorkspace(
  activeStageId: ScriptWorkspaceSnapshot["activeStageId"] = "plot_design"
): ScriptWorkspaceSnapshot {
  const sections = workspace("draft").expertDraft.sections
    .filter((section) => section.id !== "intro")
    .map((section, index) => ({
      ...section,
      title: `第${index + 1}集`,
      body: { ...section.body, title: `第${index + 1}集` },
      characterState: {
        ...section.characterState,
        title: `第${index + 1}集 · 人物状态`
      }
    }));
  return {
    id: "script-tool-test",
    title: "雾港剧本",
    categories: ["悬疑"],
    activeStageId,
    characterStructure: { format: "text" },
    plotStages: createDefaultCreativePlotStages(),
    expertDraft: {
      id: "draft",
      title: "正文",
      revision: createShortWorkspaceContentRevision("script-draft-directory"),
      sections
    },
    stages: SCRIPT_WORKSPACE_TEXT_STAGE_IDS.map((stageId) => ({
      stageId,
      title: stageId,
      content: stageId === "plot_design" ? "旧剧情的唯一片段。" : "",
      revision: createShortWorkspaceContentRevision(
        stageId === "plot_design" ? "旧剧情的唯一片段。" : ""
      )
    }))
  };
}

function expertSection(
  id: string,
  title: string,
  wordCountRequirement: string,
  body: string,
  characterState: string
) {
  return {
    id,
    title,
    wordCountRequirement,
    body: {
      documentId: `draft:${id}:body`,
      title: `${title}·正文`,
      content: body,
      revision: createShortWorkspaceContentRevision(body)
    },
    characterState: {
      documentId: `draft:${id}:state`,
      title: `${title}·人物状态`,
      content: characterState,
      revision: createShortWorkspaceContentRevision(characterState)
    }
  };
}

function toolByName(tools: AgentTool[], name: string): AgentTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool: ${name}`);
  return tool;
}

function focusedDraftWorkspace(): ShortWorkspaceSnapshot {
  const value = workspace("draft");
  return {
    ...value,
    activeAgentId: "expert_draft_coordinator",
    activeSectionId: "section-1"
  };
}

function resultText(result: AgentToolResult<unknown>): string {
  return result.content
    .filter(
      (item): item is Extract<(typeof result.content)[number], { type: "text" }> =>
        item.type === "text"
    )
    .map((item) => item.text)
    .join("\n");
}

describe("short workspace tools", () => {
  it("assembles the reference standard tool set and the plot switch tool", () => {
    const characterNames = buildShortWorkspaceTools({
      workspace: workspace("character_design"),
      profile: profile("character_design")
    }).map((tool) => tool.name);
    const plotNames = buildShortWorkspaceTools({
      workspace: workspace(),
      profile: profile("plot_design")
    }).map((tool) => tool.name);

    expect(characterNames).toEqual(SHORT_WORKSPACE_TOOL_MANIFEST.standard);
    expect(plotNames).toEqual([
      ...SHORT_WORKSPACE_TOOL_MANIFEST.standard.slice(0, -2),
      "switch_storyline_stage",
      ...SHORT_WORKSPACE_TOOL_MANIFEST.standard.slice(-2)
    ]);
  });

  it("lets every short and script agent read all stages and draft sections", async () => {
    const shortSnapshot = workspace("character_design");
    const characterStage = shortSnapshot.stages.find(
      ({ stageId }) => stageId === "character_design"
    )!;
    characterStage.content = "人物阶段全文。";
    characterStage.revision = createShortWorkspaceContentRevision(
      characterStage.content
    );

    for (const agentId of ["character_design", "plot_design"] as const) {
      const tools = buildShortWorkspaceTools({
        workspace: shortSnapshot,
        profile: profile(agentId)
      });
      const readStage = toolByName(tools, "read_workspace_content");
      const readDraft = toolByName(tools, "read_draft_sections");
      expect(
        resultText(
          await readStage.execute(`read-character-${agentId}`, {
            stage_id: "character_design"
          })
        )
      ).toContain("人物阶段全文");
      expect(
        resultText(
          await readStage.execute(`read-plot-${agentId}`, {
            stage_id: "plot_design"
          })
        )
      ).toContain("旧剧情的唯一片段");
      expect(
        resultText(
          await readDraft.execute(`read-draft-${agentId}`, {
            section_ids: ["section-1"],
            include: ["body"],
            mode: "full"
          })
        )
      ).toContain("汽笛迟到了七分钟");
      expect(tools.map(({ name }) => name)).not.toContain("write_draft_section");
    }

    const scriptTools = buildScriptWorkspaceTools({
      workspace: scriptWorkspace("plot_design"),
      profile: scriptProfile("character_design")
    });
    expect(
      resultText(
        await toolByName(scriptTools, "read_draft_sections").execute(
          "read-script-draft",
          {
            section_ids: ["section-1"],
            include: ["body"],
            mode: "full"
          }
        )
      )
    ).toContain("汽笛迟到了七分钟");
    expect(scriptTools.map(({ name }) => name)).not.toContain(
      "write_draft_section"
    );
  });

  it("switches the plot substage before applying an implicit write target", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace(),
      profile: profile("plot_design")
    });

    const selected = await toolByName(tools, "switch_storyline_stage").execute(
      "switch-1",
      { target_stage_id: "intro_design" }
    );
    const written = await toolByName(tools, "write_workspace_editor").execute(
      "write-1",
      { mode: "replace", text: "新的导语。" }
    );

    expect(selected.details).toMatchObject({
      kind: "workspace-stage-selection",
      stageId: "intro_design"
    });
    expect(written.details).toMatchObject({
      kind: "workspace-editor-mutation",
      stageId: "intro_design",
      text: "新的导语。"
    });
  });

  it("uses stable character files with read-before-write protection in list mode", async () => {
    const value = workspace("character_design");
    value.characterStructure = {
      format: "list",
      items: [
        {
          id: "character-linmo",
          title: "林默",
          order: 1,
          content: "林默是守夜人。",
          revision: createShortWorkspaceContentRevision("林默是守夜人。")
        }
      ]
    };
    const tools = buildShortWorkspaceTools({
      workspace: value,
      profile: profile("character_design")
    });
    const names = tools.map(({ name }) => name);
    for (const name of [
      ...SHORT_WORKSPACE_TOOL_MANIFEST.characterRead,
      ...SHORT_WORKSPACE_TOOL_MANIFEST.characterWrite
    ]) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain("write_workspace_editor");
    expect(names).not.toContain("replace_current_stage_text");

    const listed = await toolByName(tools, "list_characters").execute(
      "list-characters",
      {}
    );
    expect(resultText(listed)).toContain('"format": "list"');
    expect(resultText(listed)).toContain('"item_id": "character-linmo"');

    const blocked = await toolByName(tools, "write_character_file").execute(
      "blocked-write",
      {
        item_id: "character-linmo",
        text: "未经读取的覆盖。",
        allow_overwrite_existing: true
      }
    );
    expect(resultText(blocked)).toContain("请先用 read_character");
    await toolByName(tools, "read_character").execute("read-full", {
      item_id: "character-linmo",
      mode: "full"
    });
    const edited = await toolByName(tools, "edit_character_file").execute(
      "edit-character",
      {
        item_id: "character-linmo",
        replacements: [
          { original_text: "守夜人", new_text: "守塔人" }
        ]
      }
    );
    expect(edited.details).toMatchObject({
      kind: "workspace-character-file-mutation",
      itemId: "character-linmo",
      text: "林默是守塔人。"
    });

    const created = await toolByName(tools, "create_character_file").execute(
      "create-character",
      { title: "苏遥" }
    );
    const createDetails = created.details as Extract<
      ShortWorkspaceToolDetails,
      { kind: "workspace-character-structure-mutation" }
    >;
    expect(createDetails.mutation).toMatchObject({
      type: "createItem",
      title: "苏遥"
    });
    const provisionalItemId =
      createDetails.mutation.type === "createItem"
        ? createDetails.mutation.provisionalItemId
        : "";
    const written = await toolByName(tools, "write_character_file").execute(
      "write-created-character",
      { item_id: provisionalItemId, text: "苏遥保管底片。" }
    );
    expect(written.details).toMatchObject({
      kind: "workspace-character-file-mutation",
      itemId: provisionalItemId,
      text: "苏遥保管底片。"
    });

    const deleted = await toolByName(tools, "delete_character_file").execute(
      "delete-character",
      { item_id: "character-linmo" }
    );
    expect(deleted.details).toMatchObject({
      kind: "workspace-character-structure-mutation",
      mutation: {
        type: "deleteItem",
        itemId: "character-linmo",
        deletedText: "林默是守塔人。"
      }
    });
  });

  it("requires every page of an oversized character file before editing", async () => {
    const value = workspace("character_design");
    const tail = "人物档案末尾秘密。";
    const content = `${"人".repeat(40_000)}${tail}`;
    value.characterStructure = {
      format: "list",
      items: [
        {
          id: "character-long",
          title: "长档案人物",
          order: 1,
          content,
          revision: createShortWorkspaceContentRevision(content)
        }
      ]
    };
    const tools = buildShortWorkspaceTools({
      workspace: value,
      profile: profile("character_design")
    });
    const read = toolByName(tools, "read_character");

    const firstPage = await read.execute("character-page-1", {
      item_id: "character-long",
      mode: "full"
    });
    expect(resultText(firstPage)).toContain("next_offset: 32768");
    expect(resultText(firstPage)).not.toContain(tail);

    const blocked = await toolByName(tools, "edit_character_file").execute(
      "character-edit-blocked",
      {
        item_id: "character-long",
        replacements: [{ original_text: tail, new_text: "秘密已公开。" }]
      }
    );
    expect(resultText(blocked)).toContain("请先用 read_character");

    const finalPage = await read.execute("character-page-2", {
      item_id: "character-long",
      mode: "full",
      offset: 32_768
    });
    expect(resultText(finalPage)).toContain("next_offset: null");
    expect(resultText(finalPage)).toContain(tail);

    const edited = await toolByName(tools, "edit_character_file").execute(
      "character-edit-complete",
      {
        item_id: "character-long",
        replacements: [{ original_text: tail, new_text: "秘密已公开。" }]
      }
    );
    expect(edited.details).toMatchObject({
      kind: "workspace-character-file-mutation",
      itemId: "character-long"
    });
  });

  it("exposes the same dynamic plot stages to script tools", async () => {
    const tools = buildScriptWorkspaceTools({
      workspace: scriptWorkspace(),
      profile: scriptProfile("plot_design")
    });
    const switchTool = toolByName(tools, "switch_storyline_stage");

    for (const toolName of [
      "switch_storyline_stage",
      "write_workspace_editor",
      "replace_current_stage_text"
    ]) {
      const parameters = JSON.stringify(toolByName(tools, toolName).parameters);
      expect(parameters).toContain("worldbuilding");
      expect(parameters).toContain("plot_design");
      expect(parameters).toContain("plot_refine");
      expect(parameters).toContain("intro_design");
      expect(parameters).toContain("narrative_perspective");
      expect(parameters).toContain("outline");
    }
    expect(switchTool.description).toContain("剧本剧情父节点");

    const selected = await switchTool.execute("switch-intro", {
      target_stage_id: "intro_design"
    } as never);
    expect(selected.details).toMatchObject({
      kind: "workspace-stage-selection",
      stageId: "intro_design"
    });
  });

  it("switches, reads, and writes an arbitrary configured plot stage", async () => {
    const snapshot = workspace();
    snapshot.plotStages = [
      ...snapshot.plotStages,
      {
        id: "custom_reversal",
        title: "反转校验",
        description: "核对关键反转的证据链与知情边界。"
      }
    ];
    snapshot.stages = [
      ...snapshot.stages,
      {
        stageId: "custom_reversal",
        title: "反转校验",
        content: "旧反转证据。",
        revision: createShortWorkspaceContentRevision("旧反转证据。")
      }
    ];
    const tools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("plot_design")
    });
    const switched = await toolByName(
      tools,
      "switch_storyline_stage"
    ).execute("switch-custom", { target_stage_id: "custom_reversal" });
    expect(switched.details).toMatchObject({
      kind: "workspace-stage-selection",
      stageId: "custom_reversal"
    });
    const read = await toolByName(tools, "read_workspace_content").execute(
      "read-custom",
      { stage_id: "custom_reversal" }
    );
    expect(resultText(read)).toContain("【反转校验】（custom_reversal）");
    expect(resultText(read)).toContain("旧反转证据");
    const written = await toolByName(tools, "write_workspace_editor").execute(
      "write-custom",
      {
        target_stage_id: "custom_reversal",
        text: "新反转证据。",
        allow_overwrite_existing: true
      }
    );
    expect(written.details).toMatchObject({
      kind: "workspace-editor-mutation",
      stageId: "custom_reversal",
      text: "新反转证据。"
    });
  });

  it("marks script draft tools with episode wording and immutable format rules", async () => {
    const value: ScriptWorkspaceSnapshot = {
      ...scriptWorkspace("draft"),
      activeAgentId: "expert_draft_coordinator"
    };
    const tools = buildScriptWorkspaceTools({
      workspace: value,
      profile: scriptProfile("expert_draft_coordinator")
    });
    const create = toolByName(tools, "create_draft_sections");
    const read = toolByName(tools, "read_draft_sections");
    const write = toolByName(tools, "write_draft_section");
    const replace = toolByName(tools, "replace_draft_section_text");

    expect(create.label).toBe("创建剧集文件");
    expect(read.label).toBe("读取剧集正文");
    expect(write.label).toBe("写入剧集正文");
    expect(replace.label).toBe("替换剧集正文文本");
    for (const tool of [write, replace]) {
      expect(tool.description).toContain(
        SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS.trim()
      );
      expect(tool.description).toContain("不得包含 Markdown 表格、分析标题或格式讲解");
    }

    const directory = await toolByName(tools, "read_workspace_content").execute(
      "read-directory",
      { stage_id: "draft" }
    );
    expect(resultText(directory)).toContain("剧名：《雾港剧本》");
    expect(resultText(directory)).not.toContain("书名：《雾港剧本》");
    expect(resultText(directory)).toContain("剧集数：2");

    const shortWrite = toolByName(
      buildShortWorkspaceTools({
        workspace: workspace("draft"),
        profile: profile("expert_draft_coordinator")
      }),
      "write_draft_section"
    );
    expect(shortWrite.description).not.toContain(
      SCRIPT_SCREENPLAY_FORMAT_REQUIREMENTS.trim()
    );
  });

  it("protects existing text unless a whole-stage overwrite is explicit", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace(),
      profile: profile("plot_design")
    });
    const write = toolByName(tools, "write_workspace_editor");

    const blocked = await write.execute("write-1", {
      target_stage_id: "plot_design",
      mode: "replace",
      text: "覆盖内容"
    });
    const allowed = await write.execute("write-2", {
      target_stage_id: "plot_design",
      mode: "replace",
      text: "覆盖内容",
      allow_overwrite_existing: true
    });

    expect(blocked.details).toEqual({ kind: "none" });
    expect(resultText(blocked)).toContain("已有内容");
    expect(allowed.details).toMatchObject({
      kind: "workspace-editor-mutation",
      stageId: "plot_design",
      text: "覆盖内容"
    });
  });

  it("describes automatic approval without claiming the text is already saved", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace(),
      profile: profile("plot_design"),
      writeApprovalMode: "auto-approve"
    });
    const write = toolByName(tools, "write_workspace_editor");

    const result = await write.execute("write-auto", {
      target_stage_id: "plot_design",
      mode: "replace",
      text: "自动写入内容",
      allow_overwrite_existing: true
    });

    expect(resultText(result)).toContain("将立即提交自动保存队列");
    expect(resultText(result)).not.toContain("已经保存");
  });

  it("requires a unique original fragment for local replacement", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace(),
      profile: profile("plot_design")
    });
    const replace = toolByName(tools, "replace_current_stage_text");

    const missing = await replace.execute("replace-1", {
      target_stage_id: "plot_design",
      replacements: [{ original_text: "不存在", new_text: "新文本" }]
    });
    const replaced = await replace.execute("replace-2", {
      target_stage_id: "plot_design",
      replacements: [{ original_text: "唯一片段", new_text: "新片段" }]
    });

    expect(missing.details).toEqual({ kind: "none" });
    expect(resultText(missing)).toContain("没有找到原文片段");
    expect(replaced.details).toMatchObject({
      kind: "workspace-editor-mutation",
      text: "旧剧情的新片段。"
    });
  });

  it("shares the mutation overlay without sharing per-agent read evidence", async () => {
    const snapshot = workspace("draft");
    const sharedState = createShortWorkspaceToolSharedState(snapshot);
    const parentTools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator"),
      sharedState
    });
    const childTools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator"),
      sharedState
    });

    await toolByName(childTools, "read_draft_sections").execute("child-read", {
      section_ids: ["section-1"]
    });
    const childWrite = await toolByName(
      childTools,
      "replace_draft_section_text"
    ).execute("child-write", {
      section_id: "section-1",
      replacements: [{ original_text: "迟到了七分钟", new_text: "提前了三分钟" }]
    });
    expect(childWrite.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      text: "汽笛提前了三分钟。共同片段。"
    });

    const blockedParentWrite = await toolByName(
      parentTools,
      "replace_draft_section_text"
    ).execute("parent-write", {
      section_id: "section-1",
      replacements: [{ original_text: "共同片段", new_text: "独有片段" }]
    });
    expect(blockedParentWrite.details).toEqual({ kind: "none" });
    expect(resultText(blockedParentWrite)).toContain("请先读取");

    const parentRead = await toolByName(parentTools, "read_draft_sections").execute(
      "parent-read",
      { section_ids: ["section-1"] }
    );
    expect(resultText(parentRead)).toContain("汽笛提前了三分钟");
  });

  it("refuses local replacement when the stage snapshot is truncated", async () => {
    const truncated = workspace();
    truncated.stages = truncated.stages.map((stage) =>
      stage.stageId === "plot_design"
        ? { ...stage, truncated: true, originalLength: stage.content.length + 20_000 }
        : stage
    );
    const replace = toolByName(
      buildShortWorkspaceTools({
        workspace: truncated,
        profile: profile("plot_design")
      }),
      "replace_current_stage_text"
    );
    const write = toolByName(
      buildShortWorkspaceTools({
        workspace: truncated,
        profile: profile("plot_design")
      }),
      "write_workspace_editor"
    );

    const result = await replace.execute("replace-truncated", {
      target_stage_id: "plot_design",
      replacements: [{ original_text: "唯一片段", new_text: "新片段" }]
    });

    expect(result.details).toEqual({ kind: "none" });
    expect(resultText(result)).toContain("超过本轮安全快照上限");

    const writeResult = await write.execute("write-truncated", {
      target_stage_id: "plot_design",
      mode: "replace",
      text: "整体重写",
      allow_overwrite_existing: true
    });
    expect(writeResult.details).toEqual({ kind: "none" });
    expect(resultText(writeResult)).toContain("超过本轮安全快照上限");
  });

  it("projects the draft route as a physical file index", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace("draft"),
      profile: profile("expert_draft_coordinator")
    });

    const result = await toolByName(tools, "read_workspace_content").execute(
      "read-draft-index",
      { stage_id: "draft" }
    );

    expect(resultText(result)).toContain("正文目录");
    expect(resultText(result)).toContain("draft:section-2:body");
    expect(resultText(result)).toContain("read_draft_sections");
    expect(resultText(result)).not.toContain("暗房里显出了照片");
  });

  it("shares create→write overlay across parent and child tool sets", async () => {
    const snapshot = workspace("draft");
    const sharedState = createShortWorkspaceToolSharedState(snapshot);
    const parentTools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator"),
      sharedState
    });
    const childTools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator"),
      sharedState
    });

    const created = await toolByName(parentTools, "create_draft_sections").execute(
      "parent-create",
      { sections: [{ title: "第五节·尾声" }] }
    );
    const details = created.details as Extract<
      ShortWorkspaceToolDetails,
      { kind: "workspace-expert-draft-section-creation" }
    >;
    const sectionId = details.sections[0]!.provisionalSectionId;

    const written = await toolByName(childTools, "write_draft_section").execute(
      "child-write",
      {
        section_id: sectionId,
        text: "尾声里只剩下潮水声。"
      }
    );
    expect(written.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      sectionId,
      text: "尾声里只剩下潮水声。"
    });

    const readBack = await toolByName(parentTools, "read_draft_sections").execute(
      "parent-read",
      { section_ids: [sectionId] }
    );
    expect(resultText(readBack)).toContain("尾声里只剩下潮水声。");
  });

  it("proposes deleting an existing chapter for approval", async () => {
    const snapshot = workspace("draft");
    const tools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator")
    });

    const deleted = await toolByName(tools, "delete_draft_section").execute(
      "delete-section",
      { section_id: "section-2" }
    );
    expect(deleted.details).toMatchObject({
      kind: "workspace-expert-draft-section-deletion",
      workspaceId: snapshot.id,
      stageId: "draft",
      sectionId: "section-2",
      title: "第二节·暗房",
      baseRevision: snapshot.expertDraft.revision,
      summary:
        "已生成删除章节「第二节·暗房」及其正文与人物状态文件的变更，等待用户审阅。"
    });

    const directory = await toolByName(tools, "read_workspace_content").execute(
      "read-after-delete",
      { stage_id: "draft" }
    );
    expect(resultText(directory)).not.toContain("section-2");
    expect(resultText(directory)).toContain("section-1");

    expect(SHORT_WORKSPACE_TOOL_MANIFEST.draft).toContain("delete_draft_section");
    expect(SHORT_WORKSPACE_TOOL_MANIFEST.coordinator).toContain(
      "delete_draft_section"
    );
    expect(SHORT_WORKSPACE_TOOL_MANIFEST.sectionWriter).toContain(
      "delete_draft_section"
    );
  });

  it("rejects deleting the last remaining chapter", async () => {
    const snapshot = workspace("draft");
    const sharedState = createShortWorkspaceToolSharedState(snapshot);
    const tools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator"),
      sharedState
    });
    await toolByName(tools, "delete_draft_section").execute("delete-1", {
      section_id: "intro"
    });
    await toolByName(tools, "delete_draft_section").execute("delete-2", {
      section_id: "section-1"
    });
    const last = await toolByName(tools, "delete_draft_section").execute(
      "delete-last",
      { section_id: "section-2" }
    );
    expect(last.details).toEqual({ kind: "none" });
    expect(resultText(last)).toContain("至少需要保留一个章节");
  });

  it("proposes renaming an existing chapter title for approval", async () => {
    const snapshot = workspace("draft");
    const tools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator")
    });

    const renamed = await toolByName(tools, "rename_draft_section").execute(
      "rename-section",
      {
        section_id: "section-2",
        title: "第二节·底片"
      }
    );
    expect(renamed.details).toMatchObject({
      kind: "workspace-expert-draft-section-rename",
      workspaceId: snapshot.id,
      stageId: "draft",
      sectionId: "section-2",
      previousTitle: "第二节·暗房",
      title: "第二节·底片",
      baseRevision: snapshot.expertDraft.revision,
      summary: "已生成将章节「第二节·暗房」改名为「第二节·底片」的变更，等待用户审阅。"
    });

    const directory = await toolByName(tools, "read_workspace_content").execute(
      "read-after-rename",
      { stage_id: "draft" }
    );
    expect(resultText(directory)).toContain("第二节·底片");
    expect(resultText(directory)).not.toContain("第二节·暗房");

    const duplicate = await toolByName(tools, "rename_draft_section").execute(
      "rename-duplicate",
      {
        section_id: "section-1",
        title: "第二节·底片"
      }
    );
    expect(duplicate.details).toEqual({ kind: "none" });
    expect(resultText(duplicate)).toContain("已存在同名章节");

    expect(SHORT_WORKSPACE_TOOL_MANIFEST.draft).toContain("rename_draft_section");
    expect(SHORT_WORKSPACE_TOOL_MANIFEST.coordinator).toContain(
      "rename_draft_section"
    );
    expect(SHORT_WORKSPACE_TOOL_MANIFEST.sectionWriter).toContain(
      "rename_draft_section"
    );
  });

  it("rejects renaming provisional chapters and pins section writers to the active chapter", async () => {
    const snapshot = workspace("draft");
    const sharedState = createShortWorkspaceToolSharedState(snapshot);
    const coordinatorTools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator"),
      sharedState
    });
    const created = await toolByName(
      coordinatorTools,
      "create_draft_sections"
    ).execute("create-for-rename", {
      sections: [{ title: "第五节·潮汐" }]
    });
    const details = created.details as Extract<
      ShortWorkspaceToolDetails,
      { kind: "workspace-expert-draft-section-creation" }
    >;
    const provisionalId = details.sections[0]!.provisionalSectionId;
    const provisionalRename = await toolByName(
      coordinatorTools,
      "rename_draft_section"
    ).execute("rename-provisional", {
      section_id: provisionalId,
      title: "第五节·落潮"
    });
    expect(provisionalRename.details).toEqual({ kind: "none" });
    expect(resultText(provisionalRename)).toContain("尚在本轮待创建");

    const focusedTools = buildShortWorkspaceTools({
      workspace: {
        ...snapshot,
        activeAgentId: "expert_draft_coordinator",
        activeSectionId: "section-1"
      },
      profile: profile("expert_draft_coordinator")
    });
    const cross = await toolByName(focusedTools, "rename_draft_section").execute(
      "rename-other",
      {
        section_id: "section-2",
        title: "第二节·别名"
      }
    );
    expect(cross.details).toMatchObject({
      kind: "workspace-expert-draft-section-rename",
      sectionId: "section-2",
      title: "第二节·别名"
    });

    const own = await toolByName(focusedTools, "rename_draft_section").execute(
      "rename-own",
      {
        title: "第一节·夜车"
      }
    );
    expect(own.details).toMatchObject({
      kind: "workspace-expert-draft-section-rename",
      sectionId: "section-1",
      previousTitle: "第一节·迟到的汽笛",
      title: "第一节·夜车"
    });
  });

  it("lets only the draft coordinator propose one batch of blank chapter files", async () => {
    const snapshot = workspace("draft");
    const coordinatorTools = buildShortWorkspaceTools({
      workspace: snapshot,
      profile: profile("expert_draft_coordinator")
    });
    const create = toolByName(coordinatorTools, "create_draft_sections");

    const result = await create.execute("create-sections", {
      sections: [
        { title: "第三节·钟楼", word_count_requirement: "1300 字" },
        { title: "第四节·回声" }
      ],
      after_section_id: "section-2"
    });

    expect(result.details).toMatchObject({
      kind: "workspace-expert-draft-section-creation",
      workspaceId: snapshot.id,
      stageId: "draft",
      sections: [
        {
          title: "第三节·钟楼",
          wordCountRequirement: "1300 字",
          provisionalSectionId: "pending:section:1"
        },
        {
          title: "第四节·回声",
          wordCountRequirement: "",
          provisionalSectionId: "pending:section:2"
        }
      ],
      afterSectionId: "section-2",
      baseRevision: snapshot.expertDraft.revision,
      summary: "已生成创建 2 个空白章节文件的变更，等待用户审阅。"
    });
    expect(resultText(result)).toContain("创建 2 个空白章节文件");
    expect(resultText(result)).toContain("section_id=pending:section:1");

    const directory = await toolByName(
      coordinatorTools,
      "read_workspace_content"
    ).execute("read-after-create", { stage_id: "draft" });
    expect(resultText(directory)).toContain("pending:section:1");
    expect(resultText(directory)).toContain("本轮待创建");

    const written = await toolByName(
      coordinatorTools,
      "write_draft_section"
    ).execute("write-pending", {
      section_id: "pending:section:1",
      text: "钟楼的指针停在十三分。"
    });
    expect(written.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      sectionId: "pending:section:1",
      fileKind: "body",
      text: "钟楼的指针停在十三分。"
    });

    const repeated = await create.execute("create-sections-again", {
      sections: [{ title: "第三节·钟楼" }]
    });
    expect(repeated.details).toEqual({ kind: "none" });
    expect(resultText(repeated)).toContain("同名章节");

    for (const agentId of [
      "character_design",
      "plot_design"
    ] as const) {
      expect(
        buildShortWorkspaceTools({
          workspace: snapshot,
          profile: profile(agentId)
        }).map((tool) => tool.name)
      ).not.toContain("create_draft_sections");
    }
  });

  it("does not expose untyped or out-of-scope attached material bodies", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace("character_design"),
      profile: profile("character_design"),
      attachedMaterials: [
        {
          id: "allowed",
          title: "人物卡",
          source: "attached-material",
          kind: "character",
          content: "人物素材正文"
        },
        {
          id: "blocked-kind",
          title: "剧情卡",
          source: "attached-material",
          kind: "plot",
          content: "剧情素材正文"
        },
        {
          id: "blocked-untyped",
          title: "旧素材",
          source: "attached-material",
          content: "未分类素材正文"
        }
      ]
    });
    const query = toolByName(tools, "query_linked_material_entries");

    const listed = await query.execute("material-list", { mode: "list" });
    const readBlocked = await query.execute("material-read", {
      mode: "read",
      entry_name: "旧素材"
    });

    expect(resultText(listed)).toContain("人物卡");
    expect(resultText(listed)).not.toContain("剧情卡");
    expect(resultText(listed)).not.toContain("旧素材");
    expect(resultText(readBlocked)).toContain("没有找到");
  });

  it("loads attached skills by full title or unique short name", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace("plot_design"),
      profile: profile("plot_design"),
      attachedSkills: [
        {
          id: "skill:plot-lib:entry-1",
          title: "剧情设计技能库 · 三幕式因果",
          source: "attached-skill",
          kind: "plot",
          content: "三幕方法正文"
        },
        {
          id: "skill:style-lib:entry-1",
          title: "文风技能 · 文风执行",
          source: "attached-skill",
          kind: "style",
          content: "文风方法正文"
        }
      ]
    });
    const load = toolByName(tools, "load_skill");

    const byShort = await load.execute("load-short", { name: "三幕式因果" });
    expect(resultText(byShort)).toContain("三幕方法正文");

    const byFuzzy = await load.execute("load-fuzzy", { name: "剧情设计" });
    expect(resultText(byFuzzy)).toContain("三幕方法正文");

    const blocked = await load.execute("load-blocked", { name: "文风执行" });
    expect(resultText(blocked)).toContain("不在当前智能体读取范围内");
    expect(resultText(blocked)).toContain("三幕式因果");
    expect(resultText(blocked)).not.toContain("文风方法正文");
  });

  it("gives the unified draft agent the complete draft tool set", () => {
    const coordinatorNames = buildShortWorkspaceTools({
      workspace: workspace("draft"),
      profile: profile("expert_draft_coordinator")
    }).map((tool) => tool.name);
    expect(coordinatorNames).toEqual([
      ...SHORT_WORKSPACE_TOOL_MANIFEST.standard.slice(0, -2),
      "create_draft_sections",
      ...SHORT_WORKSPACE_TOOL_MANIFEST.draft
    ]);
    expect(coordinatorNames).not.toContain("initialize_expert_draft");
  });

  it("reads the complete draft tail and emits a body-file revision", async () => {
    const value = workspace("draft");
    const oldTail = "这是超过旧二万字符快照的全文尾部。";
    const longBody = `${"正".repeat(20_050)}${oldTail}`;
    value.expertDraft.sections[2] = expertSection(
      "section-2",
      "第二节·暗房",
      "1200 字",
      longBody,
      "不应混入正文读取的人物状态。"
    );
    const tools = buildShortWorkspaceTools({
      workspace: value,
      profile: profile("expert_draft_coordinator")
    });

    const blocked = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-before-read",
      {
        section_id: "section-2",
        replacements: [{ original_text: oldTail, new_text: "新尾部。" }]
      }
    );
    expect(blocked.details).toEqual({ kind: "none" });
    expect(resultText(blocked)).toContain("请先读取");

    const readAll = await toolByName(tools, "read_draft_sections").execute("read-all", {
      section_ids: ["intro", "section-1", "section-2"]
    });
    expect(resultText(readAll)).toContain(oldTail);
    expect(resultText(readAll)).not.toContain("不应混入正文读取的人物状态");

    const replaced = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-after-read",
      {
        section_id: "section-2",
        replacements: [{ original_text: oldTail, new_text: "新尾部。" }]
      }
    );
    expect(replaced.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      stageId: "draft",
      documentId: "draft:section-2:body",
      sectionId: "section-2",
      fileKind: "body",
      baseRevision: createShortWorkspaceContentRevision(longBody)
    });
  });

  it("pages a batch read and withholds overwrite rights for unread chapters", async () => {
    const value = workspace("draft");
    const chapterBody = (marker: string) => `${"章".repeat(40_000)}${marker}`;
    value.expertDraft.sections = [
      expertSection("section-1", "第一节", "", chapterBody("甲尾"), ""),
      expertSection("section-2", "第二节", "", chapterBody("乙尾"), ""),
      expertSection("section-3", "第三节", "", chapterBody("丙尾"), "")
    ];
    const tools = buildShortWorkspaceTools({
      workspace: value,
      profile: profile("expert_draft_coordinator")
    });

    const firstPage = await toolByName(tools, "read_draft_sections").execute("page-1", {
      section_ids: ["section-1", "section-2", "section-3"]
    });
    expect(resultText(firstPage)).toContain("甲尾");
    expect(resultText(firstPage)).not.toContain("乙尾");
    expect(resultText(firstPage)).toContain("本次未读取 2 章");

    const blocked = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-unread",
      {
        section_id: "section-2",
        replacements: [{ original_text: "乙尾", new_text: "乙新尾" }]
      }
    );
    expect(blocked.details).toEqual({ kind: "none" });
    expect(resultText(blocked)).toContain("请先读取");

    await toolByName(tools, "read_draft_sections").execute("page-2", {
      section_ids: ["section-2"]
    });
    const replaced = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-read",
      {
        section_id: "section-2",
        replacements: [{ original_text: "乙尾", new_text: "乙新尾" }]
      }
    );
    expect(replaced.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      sectionId: "section-2"
    });
  });

  it("pages one oversized draft file and grants write rights only after contiguous full reading", async () => {
    const value = workspace("draft");
    const tail = "超长章节的最终证据。";
    const longBody = `${"长".repeat(100_000)}${tail}`;
    value.expertDraft.sections = [
      expertSection("section-long", "超长章节", "", longBody, "")
    ];
    const tools = buildShortWorkspaceTools({
      workspace: value,
      profile: profile("expert_draft_coordinator")
    });
    const read = toolByName(tools, "read_draft_sections");

    const firstPage = await read.execute("long-page-1", {
      section_ids: ["section-long"]
    });
    expect(resultText(firstPage)).toContain("next_offset: 60000");
    expect(resultText(firstPage)).not.toContain(tail);

    const blocked = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-before-tail",
      {
        section_id: "section-long",
        replacements: [{ original_text: tail, new_text: "新结尾。" }]
      }
    );
    expect(resultText(blocked)).toContain("请先读取");

    const finalPage = await read.execute("long-page-2", {
      section_ids: ["section-long"],
      include: ["body"],
      offset: 60_000,
      max_characters: 60_000
    });
    expect(resultText(finalPage)).toContain("next_offset: null");
    expect(resultText(finalPage)).toContain(tail);

    const replaced = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-after-tail",
      {
        section_id: "section-long",
        replacements: [{ original_text: tail, new_text: "新结尾。" }]
      }
    );
    expect(replaced.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      sectionId: "section-long"
    });
  });

  it("paginates a complete non-draft stage instead of exposing a fixed prefix", async () => {
    const value = workspace("plot_design");
    const tail = "剧情文件末尾证据。";
    const content = `${"纲".repeat(40_000)}${tail}`;
    const stage = value.stages.find(({ stageId }) => stageId === "plot_design")!;
    stage.content = content;
    stage.revision = createShortWorkspaceContentRevision(content);
    const tools = buildShortWorkspaceTools({
      workspace: value,
      profile: profile("plot_design")
    });
    const read = toolByName(tools, "read_workspace_content");

    const firstPage = await read.execute("stage-page-1", {
      stage_id: "plot_design"
    });
    expect(resultText(firstPage)).toContain("next_offset: 32768");
    expect(resultText(firstPage)).not.toContain(tail);

    const finalPage = await read.execute("stage-page-2", {
      stage_id: "plot_design",
      offset: 32_768
    });
    expect(resultText(finalPage)).toContain("next_offset: null");
    expect(resultText(finalPage)).toContain(tail);
  });

  it("previews chapters without granting whole-chapter overwrite rights", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace("draft"),
      profile: profile("expert_draft_coordinator")
    });

    const preview = await toolByName(tools, "read_draft_sections").execute("preview", {
      section_ids: ["section-1", "section-2"],
      mode: "preview"
    });
    expect(resultText(preview)).toContain("第一节·迟到的汽笛");
    expect(resultText(preview)).toContain("预览不算完整读取");

    const blocked = await toolByName(tools, "write_draft_section").execute(
      "write-after-preview",
      {
        section_id: "section-1",
        text: "整章覆盖",
        allow_overwrite_existing: true
      }
    );
    expect(blocked.details).toEqual({ kind: "none" });
    expect(resultText(blocked)).toContain("请先读取");
  });

  it("lets the coordinator maintain character state alongside chapter bodies", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: workspace("draft"),
      profile: profile("expert_draft_coordinator")
    });

    const read = await toolByName(tools, "read_draft_sections").execute("read-state", {
      section_ids: ["section-2"],
      include: ["body", "character_state"]
    });
    expect(resultText(read)).toContain("暗房里显出了照片");
    expect(resultText(read)).toContain("苏遥拿着底片");

    const updated = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-state",
      {
        section_id: "section-2",
        file: "character_state",
        replacements: [{ original_text: "拿着底片", new_text: "烧掉了底片" }]
      }
    );
    expect(updated.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      sectionId: "section-2",
      fileKind: "characterState",
      text: "苏遥烧掉了底片。"
    });
  });

  it("uses the focused section by default while allowing cross-section writes", async () => {
    const writerWorkspace = focusedDraftWorkspace();
    const originalBody = writerWorkspace.expertDraft.sections[1]!.body;
    const originalState = writerWorkspace.expertDraft.sections[1]!.characterState;
    const tools = buildShortWorkspaceTools({
      workspace: writerWorkspace,
      profile: profile("expert_draft_coordinator")
    });

    await toolByName(tools, "read_draft_sections").execute("read-neighbours", {
      section_ids: ["intro", "section-1", "section-2"],
      include: ["body", "character_state"]
    });

    const crossSection = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-other-section",
      {
        section_id: "section-2",
        replacements: [{ original_text: "共同片段", new_text: "越权修改" }]
      }
    );
    expect(crossSection.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      sectionId: "section-2",
      fileKind: "body"
    });

    const replaced = await toolByName(tools, "replace_draft_section_text").execute(
      "replace-section",
      {
        replacements: [{ original_text: "共同片段", new_text: "只改第一节的片段" }]
      }
    );
    expect(replaced.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      documentId: originalBody.documentId,
      sectionId: "section-1",
      fileKind: "body",
      text: "汽笛迟到了七分钟。只改第一节的片段。",
      baseRevision: originalBody.revision
    });

    const state = await toolByName(tools, "write_draft_section").execute(
      "write-empty-state",
      { file: "character_state", text: "林默确认汽笛晚了七分钟。" }
    );
    expect(state.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      documentId: originalState.documentId,
      sectionId: "section-1",
      fileKind: "characterState",
      baseRevision: originalState.revision
    });
  });

  it("lets the focused draft agent search the whole draft for continuity", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: focusedDraftWorkspace(),
      profile: profile("expert_draft_coordinator")
    });
    const search = toolByName(tools, "search_workspace_text");

    const current = await search.execute("search-current", {
      stage_id: "draft",
      query: "汽笛迟到了"
    });
    const later = await search.execute("search-later", {
      stage_id: "draft",
      query: "暗房里显出了照片"
    });

    expect(resultText(current)).toContain("第一节·迟到的汽笛");
    expect(resultText(later)).toContain("第二节·暗房");
  });

  it("requires reading an existing file before whole-section overwrite", async () => {
    const tools = buildShortWorkspaceTools({
      workspace: focusedDraftWorkspace(),
      profile: profile("expert_draft_coordinator")
    });
    const write = toolByName(tools, "write_draft_section");

    const unread = await write.execute("write-unread", {
      text: "整节覆盖",
      allow_overwrite_existing: true
    });
    expect(resultText(unread)).toContain("请先读取");

    await toolByName(tools, "read_draft_sections").execute("read-current", {
      section_ids: ["section-1"]
    });
    const unconfirmed = await write.execute("write-unconfirmed", {
      text: "整节覆盖"
    });
    expect(resultText(unconfirmed)).toContain("已有内容");

    const allowed = await write.execute("write-confirmed", {
      text: "整节覆盖",
      allow_overwrite_existing: true
    });
    expect(allowed.details).toMatchObject({
      kind: "workspace-expert-draft-file-mutation",
      documentId: "draft:section-1:body",
      baseRevision: createShortWorkspaceContentRevision("汽笛迟到了七分钟。共同片段。")
    });
  });
});
