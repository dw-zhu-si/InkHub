import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  AgentTeamSettingsInputSchema,
  AgentTeamSettingsSchema,
  DEFAULT_AGENT_TEAM_SETTINGS,
  DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS,
  SCRIPT_WORKSPACE_AGENT_IDS,
  ScriptAgentTeamSettingsInputSchema,
  ScriptAgentTeamSettingsSchema,
  SHORT_WORKSPACE_AGENT_IDS,
  WorkspaceAgentTeamSettingsInputSchema,
  ShortWorkspaceAgentIdSchema,
  ScriptWorkspaceAgentIdSchema,
  type AgentTeamSettings,
  type AgentTeamSettingsInput,
  type ScriptAgentTeamSettings,
  type ScriptAgentTeamSettingsInput,
  type ScriptWorkspaceAgentId,
  type ShortAgentSubagentDefinition,
  type ShortWorkspaceAgentId,
  type WorkspaceAgentTeamSettings,
  type WorkspaceAgentTeamSettingsInput,
  type WorkspaceType
} from "@deepwrite/contracts";

interface DiskAgentTeamSettings extends AgentTeamSettingsInput {
  version: 1;
}

interface DiskScriptAgentTeamSettings extends ScriptAgentTeamSettingsInput {
  version: 1;
}

function cloneDefinition(
  definition: ShortAgentSubagentDefinition
): ShortAgentSubagentDefinition {
  return { ...definition };
}

function cloneSettings(settings: AgentTeamSettingsInput): AgentTeamSettings {
  const byParentId = new Map(
    settings.teams.map((team) => [team.parentAgentId, team])
  );
  return AgentTeamSettingsSchema.parse({
    workspaceType: "short",
    teams: SHORT_WORKSPACE_AGENT_IDS.map((parentAgentId) => ({
      parentAgentId,
      subagents:
        byParentId.get(parentAgentId)?.subagents.map(cloneDefinition) ?? []
    }))
  });
}

function defaultSettings(): AgentTeamSettings {
  return cloneSettings(DEFAULT_AGENT_TEAM_SETTINGS);
}

function cloneScriptSettings(
  settings: ScriptAgentTeamSettingsInput
): ScriptAgentTeamSettings {
  const byParentId = new Map(
    settings.teams.map((team) => [team.parentAgentId, team])
  );
  return ScriptAgentTeamSettingsSchema.parse({
    workspaceType: "script",
    teams: SCRIPT_WORKSPACE_AGENT_IDS.map((parentAgentId) => ({
      parentAgentId,
      subagents:
        byParentId.get(parentAgentId)?.subagents.map(cloneDefinition) ?? []
    }))
  });
}

function defaultScriptSettings(): ScriptAgentTeamSettings {
  return cloneScriptSettings(DEFAULT_SCRIPT_AGENT_TEAM_SETTINGS);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(temporary, path);
}

export class AgentTeamConfigStore {
  private readonly shortSettingsPath: string;
  private readonly scriptSettingsPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.shortSettingsPath = join(userDataPath, "config", "agent-teams.json");
    this.scriptSettingsPath = join(
      userDataPath,
      "config",
      "agent-teams-script.json"
    );
  }

  async list(): Promise<AgentTeamSettings>;
  async list(workspaceType: "short"): Promise<AgentTeamSettings>;
  async list(workspaceType: "script"): Promise<ScriptAgentTeamSettings>;
  async list(workspaceType: WorkspaceType): Promise<WorkspaceAgentTeamSettings>;
  async list(
    workspaceType: WorkspaceType = "short"
  ): Promise<WorkspaceAgentTeamSettings> {
    await this.writeChain;
    const raw = await readJson(
      workspaceType === "script"
        ? this.scriptSettingsPath
        : this.shortSettingsPath
    );
    if (raw === undefined) {
      return workspaceType === "script"
        ? defaultScriptSettings()
        : defaultSettings();
    }
    if (
      !raw ||
      typeof raw !== "object" ||
      !("version" in raw) ||
      raw.version !== 1
    ) {
      throw new Error("智能体团队配置版本无效，已停止加载以避免覆盖原文件。");
    }
    const allowedAgentIds =
      workspaceType === "script"
        ? (SCRIPT_WORKSPACE_AGENT_IDS as readonly string[])
        : (SHORT_WORKSPACE_AGENT_IDS as readonly string[]);
    const normalizedRaw = {
      ...(raw as Record<string, unknown>),
      teams: Array.isArray((raw as Record<string, unknown>).teams)
        ? ((raw as Record<string, unknown>).teams as unknown[]).filter(
            (team) =>
              team !== null &&
              typeof team === "object" &&
              typeof (team as Record<string, unknown>).parentAgentId ===
                "string" &&
              allowedAgentIds.includes(
                (team as Record<string, unknown>).parentAgentId as string
              )
          )
        : (raw as Record<string, unknown>).teams
    };
    const parsed = (
      workspaceType === "script"
        ? ScriptAgentTeamSettingsInputSchema
        : AgentTeamSettingsInputSchema
    ).safeParse(normalizedRaw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `智能体团队配置内容无效，已停止加载以避免覆盖原文件${
          issue ? `：${issue.path.join(".") || "root"} ${issue.message}` : "。"
        }`
      );
    }
    return workspaceType === "script"
      ? cloneScriptSettings(parsed.data as ScriptAgentTeamSettingsInput)
      : cloneSettings(parsed.data as AgentTeamSettingsInput);
  }

  async save(rawInput: AgentTeamSettingsInput): Promise<AgentTeamSettings>;
  async save(
    rawInput: ScriptAgentTeamSettingsInput
  ): Promise<ScriptAgentTeamSettings>;
  async save(
    rawInput: WorkspaceAgentTeamSettingsInput
  ): Promise<WorkspaceAgentTeamSettings>;
  async save(
    rawInput: WorkspaceAgentTeamSettingsInput
  ): Promise<WorkspaceAgentTeamSettings> {
    const input = WorkspaceAgentTeamSettingsInputSchema.parse(rawInput);
    let saved: WorkspaceAgentTeamSettings | undefined;
    const operation = this.writeChain.then(async () => {
      if (input.workspaceType === "script") {
        saved = cloneScriptSettings(input);
        const disk: DiskScriptAgentTeamSettings = {
          version: 1,
          workspaceType: "script",
          teams: saved.teams.map((team) => ({
            parentAgentId: team.parentAgentId,
            subagents: team.subagents.map(cloneDefinition)
          }))
        };
        await atomicWriteJson(this.scriptSettingsPath, disk);
        return;
      }
      saved = cloneSettings(input);
      const disk: DiskAgentTeamSettings = {
        version: 1,
        workspaceType: "short",
        teams: saved.teams.map((team) => ({
          parentAgentId: team.parentAgentId,
          subagents: team.subagents.map(cloneDefinition)
        }))
      };
      await atomicWriteJson(this.shortSettingsPath, disk);
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return saved!;
  }

  async resolve(
    rawParentAgentId: ShortWorkspaceAgentId
  ): Promise<ShortAgentSubagentDefinition[]>;
  async resolve(
    workspaceType: "short",
    rawParentAgentId: ShortWorkspaceAgentId
  ): Promise<ShortAgentSubagentDefinition[]>;
  async resolve(
    workspaceType: "script",
    rawParentAgentId: ScriptWorkspaceAgentId
  ): Promise<ShortAgentSubagentDefinition[]>;
  async resolve(
    workspaceType: WorkspaceType,
    rawParentAgentId: ShortWorkspaceAgentId | ScriptWorkspaceAgentId
  ): Promise<ShortAgentSubagentDefinition[]>;
  async resolve(
    workspaceTypeOrParentAgentId: WorkspaceType | ShortWorkspaceAgentId,
    rawParentAgentId?: ShortWorkspaceAgentId | ScriptWorkspaceAgentId
  ): Promise<ShortAgentSubagentDefinition[]> {
    const workspaceType: WorkspaceType =
      workspaceTypeOrParentAgentId === "script" ? "script" : "short";
    const candidate =
      workspaceTypeOrParentAgentId === "short" ||
      workspaceTypeOrParentAgentId === "script"
        ? rawParentAgentId
        : workspaceTypeOrParentAgentId;
    const parentAgentId =
      workspaceType === "script"
        ? ScriptWorkspaceAgentIdSchema.parse(candidate)
        : ShortWorkspaceAgentIdSchema.parse(candidate);
    const settings = await this.list(workspaceType);
    return (
      settings.teams
        .find((team) => team.parentAgentId === parentAgentId)
        ?.subagents.filter((definition) => definition.enabled)
        .map(cloneDefinition) ?? []
    );
  }
}
