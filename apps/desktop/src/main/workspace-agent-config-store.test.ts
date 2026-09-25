import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS,
  createDefaultCreativePlotStages,
  createShortWorkspaceContentRevision,
  type ShortWorkspaceAgentSettingsInput,
  type ScriptWorkspaceAgentSettingsInput
} from "@deepwrite/contracts";
import {
  RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1,
  RETIRED_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT_V1,
  RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1,
  RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V2,
  RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V3,
  RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V4,
  RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V1,
  RETIRED_SHORT_PLOT_DESIGN_SYSTEM_PROMPT_V1,
  WorkspaceAgentConfigStore
} from "./workspace-agent-config-store";

const temporaryRoots = new Set<string>();

async function makeTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-workspace-agent-store-"));
  temporaryRoots.add(root);
  return root;
}

function defaultInput(): ShortWorkspaceAgentSettingsInput {
  return {
    workspaceType: "short",
    agents: DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES.map((profile) => ({
      id: profile.id,
      systemPrompt: profile.systemPrompt,
      welcomeShortcuts: [
        profile.welcomeShortcuts[0],
        profile.welcomeShortcuts[1],
        profile.welcomeShortcuts[2]
      ],
      readAccess: {
        material: [...profile.readAccess.material],
        skill: [...profile.readAccess.skill]
      }
    }))
  };
}

function customizedInput(prefix: string): ShortWorkspaceAgentSettingsInput {
  return {
    workspaceType: "short",
    agents: defaultInput().agents.map((agent) => ({
      ...agent,
      systemPrompt: `${prefix}:${agent.id}`,
      readAccess: {
        material: [],
        skill: []
      }
    }))
  };
}

function customizedScriptInput(
  prefix: string
): ScriptWorkspaceAgentSettingsInput {
  return {
    workspaceType: "script",
    agents: DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES.map((agent) => ({
      id: agent.id,
      systemPrompt: `${prefix}:${agent.id}`,
      welcomeShortcuts: [...agent.welcomeShortcuts],
      readAccess: {
        material: [],
        skill: []
      }
    }))
  };
}

function byAgentId<T extends { id: string }>(
  agents: readonly T[],
  agentId: T["id"]
): T {
  const agent = agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    throw new Error(`Missing test agent: ${agentId}`);
  }
  return agent;
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map((root) => rm(root, { recursive: true, force: true }))
  );
  temporaryRoots.clear();
});

describe("WorkspaceAgentConfigStore", () => {
  it("returns cloned builtin settings when no persisted config exists", async () => {
    const store = new WorkspaceAgentConfigStore(await makeTemporaryRoot());

    const settings = await store.list();

    expect(settings).toEqual(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS);
    expect(settings).not.toBe(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS);
    expect(settings.agents[0]).not.toBe(DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES[0]);
    expect(settings.agents[0]?.readAccess).not.toBe(
      DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES[0]?.readAccess
    );
  });

  it("drops legacy stage permissions and retired agents", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const current = defaultInput();
    const legacyAgents = current.agents.map((agent) => ({
      ...agent,
      readAccess: {
        ...agent.readAccess,
        workspace:
          agent.id === "character_design"
            ? ["character_design", "plot_design", "outline"]
            : ["plot_design", "intro_design", "plot_refine", "outline", "draft"]
      }
    }));
    legacyAgents.push({
      ...legacyAgents.find(({ id }) => id === "plot_design")!,
      id: "outline" as never,
      systemPrompt: "旧用户自定义大纲提示词"
    });
    legacyAgents.push({
      ...legacyAgents.find(({ id }) => id === "expert_draft_coordinator")!,
      id: "expert_section_writer" as never,
      systemPrompt: "已停用的短篇分节写手提示词"
    });
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({ version: 1, workspaceType: "short", agents: legacyAgents }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list();
    expect(settings.agents).toHaveLength(3);
    expect(settings.agents.some(({ id }) => (id as string) === "outline")).toBe(false);
    expect(
      settings.agents.some(({ id }) => (id as string) === "expert_section_writer")
    ).toBe(false);
    expect(byAgentId(settings.agents, "plot_design").readAccess).not.toHaveProperty(
      "workspace"
    );
    expect(
      byAgentId(settings.agents, "expert_draft_coordinator").readAccess
    ).not.toHaveProperty("workspace");
  });

  it("upgrades the last fixed-stage short and script builtins without overwriting custom prompts", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const short = defaultInput();
    byAgentId(short.agents, "plot_design").systemPrompt =
      RETIRED_SHORT_PLOT_DESIGN_SYSTEM_PROMPT_V1;
    byAgentId(short.agents, "expert_draft_coordinator").systemPrompt =
      RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V4;
    const script = customizedScriptInput("placeholder");
    byAgentId(script.agents, "plot_design").systemPrompt =
      RETIRED_SCRIPT_PLOT_DESIGN_SYSTEM_PROMPT_V1;
    byAgentId(script.agents, "expert_draft_coordinator").systemPrompt =
      RETIRED_SCRIPT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1;
    byAgentId(script.agents, "character_design").systemPrompt =
      "保留剧本人物自定义提示词";
    await Promise.all([
      writeFile(
        join(configDirectory, "workspace-agents.json"),
        JSON.stringify({ version: 1, ...short }),
        "utf8"
      ),
      writeFile(
        join(configDirectory, "workspace-agents-script.json"),
        JSON.stringify({ version: 1, ...script }),
        "utf8"
      )
    ]);

    const store = new WorkspaceAgentConfigStore(root);
    const [shortSettings, scriptSettings] = await Promise.all([
      store.list("short"),
      store.list("script")
    ]);

    for (const agentId of [
      "plot_design",
      "expert_draft_coordinator"
    ] as const) {
      expect(byAgentId(shortSettings.agents, agentId).systemPrompt).toBe(
        byAgentId(DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES, agentId).systemPrompt
      );
      expect(byAgentId(scriptSettings.agents, agentId).systemPrompt).toBe(
        byAgentId(DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES, agentId).systemPrompt
      );
    }
    expect(
      byAgentId(scriptSettings.agents, "character_design").systemPrompt
    ).toBe("保留剧本人物自定义提示词");
  });

  it("keeps short and screenplay settings in independent compatible files", async () => {
    const root = await makeTemporaryRoot();
    const store = new WorkspaceAgentConfigStore(root);
    const shortSaved = await store.save(customizedInput("short-custom"));
    const scriptSaved = await store.save(
      customizedScriptInput("script-custom")
    );

    expect(await store.list("short")).toEqual(shortSaved);
    expect(await store.list("script")).toEqual(scriptSaved);
    expect(
      JSON.parse(
        await readFile(join(root, "config", "workspace-agents.json"), "utf8")
      )
    ).toMatchObject({ version: 2, workspaceType: "short" });
    expect(
      JSON.parse(
        await readFile(
          join(root, "config", "workspace-agents-script.json"),
          "utf8"
        )
      )
    ).toMatchObject({ version: 2, workspaceType: "script" });

    const resetScript = await store.reset("script", "plot_design");
    expect(
      byAgentId(resetScript.agents, "plot_design")
    ).toEqual(
      byAgentId(DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES, "plot_design")
    );
    expect(
      byAgentId((await store.list("short")).agents, "plot_design").systemPrompt
    ).toBe("short-custom:plot_design");
  });

  it("returns isolated screenplay defaults when no screenplay file exists", async () => {
    const store = new WorkspaceAgentConfigStore(await makeTemporaryRoot());

    const settings = await store.list("script");

    expect(settings).toEqual(DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS);
    expect(settings).not.toBe(DEFAULT_SCRIPT_WORKSPACE_AGENT_SETTINGS);
    expect(settings.agents[0]).not.toBe(
      DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES[0]
    );
  });

  it("upgrades only the retired builtin coordinator prompt to the file-based default", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const input = defaultInput();
    expect(
      createHash("sha256")
        .update(RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1, "utf8")
        .digest("hex")
    ).toBe("9164c162be37db9e82eeb7c3d3caf2d3b242f1f426021c3ca619391b5aaa9d49");
    byAgentId(input.agents, "expert_draft_coordinator").systemPrompt =
      RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1;
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({ version: 1, ...input }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list();

    expect(
      byAgentId(settings.agents, "expert_draft_coordinator").systemPrompt
    ).toBe(
      byAgentId(
        DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES,
        "expert_draft_coordinator"
      ).systemPrompt
    );
  });

  it("preserves a customized coordinator prompt even when it is based on the retired default", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const input = defaultInput();
    const customized = `${RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V1}\n自定义要求：保留我的审阅口径。`;
    byAgentId(input.agents, "expert_draft_coordinator").systemPrompt = customized;
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({ version: 1, ...input }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list();

    expect(
      byAgentId(settings.agents, "expert_draft_coordinator").systemPrompt
    ).toBe(customized);
  });

  it("upgrades the previous file-based coordinator default without changing custom prompts", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const input = defaultInput();
    byAgentId(input.agents, "expert_draft_coordinator").systemPrompt =
      RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V2;
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({ version: 1, ...input }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list();

    expect(
      byAgentId(settings.agents, "expert_draft_coordinator").systemPrompt
    ).toContain("create_draft_sections");
    expect(settings.agents.some(({ id }) => (id as string) === "outline")).toBe(false);
  });

  it("upgrades the unified short draft agent prompt", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const input = defaultInput();
    byAgentId(input.agents, "expert_draft_coordinator").systemPrompt =
      RETIRED_SHORT_EXPERT_DRAFT_COORDINATOR_SYSTEM_PROMPT_V3;
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({ version: 1, ...input }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list();

    const prompt = byAgentId(
      settings.agents,
      "expert_draft_coordinator"
    ).systemPrompt;
    expect(prompt).toContain("read_draft_sections");
    expect(prompt).not.toContain("read_all_expert_draft");
    expect(prompt).not.toContain("write_section_body");
  });

  it("discards a persisted short section writer profile after retirement", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const customized = `${RETIRED_SHORT_EXPERT_SECTION_WRITER_SYSTEM_PROMPT_V1}\n自定义要求：保留我的文风口径。`;
    const legacyAgents = [
      ...defaultInput().agents,
      {
        ...defaultInput().agents.find(
          ({ id }) => id === "expert_draft_coordinator"
        )!,
        id: "expert_section_writer",
        systemPrompt: customized
      }
    ];
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({
        version: 1,
        workspaceType: "short",
        agents: legacyAgents
      }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list();

    expect(settings.agents).toHaveLength(3);
    expect(settings.agents.some(({ id }) => id === ("expert_section_writer" as never))).toBe(false);
  });

  it("fills missing welcome shortcuts from builtin defaults without discarding other overrides", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const input = defaultInput();
    byAgentId(input.agents, "character_design").systemPrompt = "自定义人物提示词";
    const legacyAgents = input.agents.map((agent) => {
      const { welcomeShortcuts: _welcomeShortcuts, ...rest } = agent;
      return rest;
    });
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({
        version: 1,
        workspaceType: "short",
        agents: legacyAgents
      }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list();

    expect(byAgentId(settings.agents, "character_design").systemPrompt).toBe(
      "自定义人物提示词"
    );
    expect(byAgentId(settings.agents, "character_design").welcomeShortcuts).toEqual(
      byAgentId(DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES, "character_design")
        .welcomeShortcuts
    );
  });

  it("migrates legacy draft resource access once and preserves later edits", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const legacy = customizedInput("legacy");
    const draft = byAgentId(legacy.agents, "expert_draft_coordinator");
    draft.readAccess.material = ["draft"];
    draft.readAccess.skill = ["plot"];
    await writeFile(
      join(configDirectory, "workspace-agents.json"),
      JSON.stringify({
        version: 1,
        ...legacy,
        agents: legacy.agents.map((agent) => ({
          ...agent,
          readAccess: { ...agent.readAccess, workspace: ["draft"] }
        }))
      }),
      "utf8"
    );

    const store = new WorkspaceAgentConfigStore(root);
    const migrated = await store.list();
    expect(
      byAgentId(migrated.agents, "expert_draft_coordinator").readAccess
    ).toEqual({
      material: ["character", "gimmick", "plot", "draft", "other"],
      skill: ["style", "general", "other"]
    });
    expect(byAgentId(migrated.agents, "character_design").systemPrompt).toBe(
      "legacy:character_design"
    );

    const migratedDisk = JSON.parse(
      await readFile(join(root, "config", "workspace-agents.json"), "utf8")
    ) as { version: number; agents: ShortWorkspaceAgentSettingsInput["agents"] };
    expect(migratedDisk.version).toBe(2);
    expect(migratedDisk.agents[0]?.readAccess).not.toHaveProperty("workspace");

    const edited = structuredClone(migrated);
    byAgentId(edited.agents, "expert_draft_coordinator").readAccess = {
      material: ["draft"],
      skill: ["style"]
    };
    await store.save(edited);
    expect(
      byAgentId((await store.list()).agents, "expert_draft_coordinator")
        .readAccess
    ).toEqual({ material: ["draft"], skill: ["style"] });
  });

  it("migrates legacy script draft resources without changing other agents", async () => {
    const root = await makeTemporaryRoot();
    const configDirectory = join(root, "config");
    await mkdir(configDirectory);
    const legacy = customizedScriptInput("script-legacy");
    byAgentId(legacy.agents, "character_design").readAccess = {
      material: ["character"],
      skill: ["plot"]
    };
    await writeFile(
      join(configDirectory, "workspace-agents-script.json"),
      JSON.stringify({
        version: 1,
        ...legacy,
        agents: legacy.agents.map((agent) => ({
          ...agent,
          readAccess: { ...agent.readAccess, workspace: ["draft"] }
        }))
      }),
      "utf8"
    );

    const settings = await new WorkspaceAgentConfigStore(root).list("script");
    expect(
      byAgentId(settings.agents, "expert_draft_coordinator").readAccess
    ).toEqual({
      material: ["character", "gimmick", "plot", "draft", "other"],
      skill: ["style", "general", "other"]
    });
    expect(byAgentId(settings.agents, "character_design").readAccess).toEqual({
      material: ["character"],
      skill: ["plot"]
    });
    expect(byAgentId(settings.agents, "character_design").systemPrompt).toBe(
      "script-legacy:character_design"
    );
  });

  it("resets only the requested agent and preserves the other overrides", async () => {
    const store = new WorkspaceAgentConfigStore(await makeTemporaryRoot());
    await store.save(customizedInput("custom"));

    const reset = await store.reset("plot_design");

    expect(byAgentId(reset.agents, "plot_design")).toEqual(
      byAgentId(DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES, "plot_design")
    );
    expect(byAgentId(reset.agents, "character_design").systemPrompt).toBe(
      "custom:character_design"
    );
    expect(byAgentId(reset.agents, "expert_draft_coordinator").systemPrompt).toBe(
      "custom:expert_draft_coordinator"
    );

    const reloaded = await store.list();
    expect(reloaded).toEqual(reset);
  });

  it("resets every prompt and read range to the builtin settings", async () => {
    const store = new WorkspaceAgentConfigStore(await makeTemporaryRoot());
    await store.save(customizedInput("discarded"));

    const reset = await store.reset();

    expect(reset).toEqual(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS);
    expect(await store.list()).toEqual(DEFAULT_SHORT_WORKSPACE_AGENT_SETTINGS);
  });

  it("resolves a validated draft section target to the unified draft agent", async () => {
    const store = new WorkspaceAgentConfigStore(await makeTemporaryRoot());
    const emptyRevision = createShortWorkspaceContentRevision("");
    const workspace = {
      id: "short-1",
      title: "雨夜来信",
      categories: ["悬疑"],
      activeStageId: "draft" as const,
      activeAgentId: "expert_draft_coordinator" as const,
      activeSectionId: "section-1",
      characterStructure: { format: "text" as const },
      plotStages: createDefaultCreativePlotStages(),
      expertDraft: {
        id: "draft" as const,
        title: "正文",
        revision: emptyRevision,
        sections: [
          {
            id: "section-1",
            title: "第一节",
            wordCountRequirement: "1000 字",
            body: {
              documentId: "draft:section-1:body",
              title: "第一节",
              content: "",
              revision: emptyRevision
            },
            characterState: {
              documentId: "draft:section-1:character-state",
              title: "第一节 · 人物状态",
              content: "",
              revision: emptyRevision
            }
          }
        ]
      },
      stages: [
        "character_design",
        ...createDefaultCreativePlotStages().map(({ id }) => id)
      ].map((stageId) => ({
        stageId,
        title: stageId,
        content: "",
        revision: emptyRevision
      }))
    };

    await expect(
      store.resolveForWorkspace(workspace, "short")
    ).resolves.toMatchObject({ id: "expert_draft_coordinator" });
    await expect(
      store.resolveForWorkspace(
        { ...workspace, activeSectionId: "missing" },
        "short"
      )
    ).rejects.toThrow(/Unknown expert draft section/u);
  });

  it("continues the write queue after a failed persistence operation", async () => {
    const root = await makeTemporaryRoot();
    const blockingConfigPath = join(root, "config");
    await writeFile(blockingConfigPath, "not-a-directory", "utf8");
    const store = new WorkspaceAgentConfigStore(root);

    await expect(store.save(customizedInput("failed"))).rejects.toMatchObject({
      code: expect.stringMatching(/EEXIST|ENOTDIR/)
    });

    await unlink(blockingConfigPath);
    await mkdir(blockingConfigPath);
    const recovered = await store.save(customizedInput("recovered"));

    expect(byAgentId(recovered.agents, "plot_design").systemPrompt).toBe(
      "recovered:plot_design"
    );
    expect(await store.list()).toEqual(recovered);
  });
});
