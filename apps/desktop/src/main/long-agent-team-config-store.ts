import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DEFAULT_LONG_AGENT_TEAM_SETTINGS,
  LONG_AGENT_IDS,
  LongAgentIdSchema,
  LongAgentTeamSettingsInputSchema,
  LongAgentTeamSettingsSchema,
  type LongAgentId,
  type LongAgentTeamSettings,
  type LongAgentTeamSettingsInput,
  type ShortAgentSubagentDefinition
} from "@deepwrite/contracts";

interface DiskLongAgentTeamSettings extends LongAgentTeamSettingsInput {
  version: 1;
}

function cloneDefinition(
  definition: ShortAgentSubagentDefinition
): ShortAgentSubagentDefinition {
  return { ...definition };
}

function cloneSettings(
  input: LongAgentTeamSettingsInput
): LongAgentTeamSettings {
  const byParentId = new Map(
    input.teams.map((team) => [team.parentAgentId, team])
  );
  return LongAgentTeamSettingsSchema.parse({
    workspaceType: "long",
    teams: LONG_AGENT_IDS.map((parentAgentId) => ({
      parentAgentId,
      subagents:
        byParentId.get(parentAgentId)?.subagents.map(cloneDefinition) ?? []
    }))
  });
}

function defaultSettings(): LongAgentTeamSettings {
  return cloneSettings(DEFAULT_LONG_AGENT_TEAM_SETTINGS);
}

function collectSubagents(
  source: Record<string, unknown> | undefined,
  usedNames: Set<string>,
  suffix: string
): ShortAgentSubagentDefinition[] {
  const merged: ShortAgentSubagentDefinition[] = [];
  const subagents = Array.isArray(source?.subagents) ? source.subagents : [];
  for (const raw of subagents) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const definition = cloneDefinition(raw as ShortAgentSubagentDefinition);
    let name = definition.name;
    if (usedNames.has(name) && suffix) {
      name = `${definition.name}${suffix}`;
      definition.name = name;
    }
    usedNames.add(name);
    merged.push(definition);
  }
  return merged;
}

function migrateLegacyLongAgentTeams(
  settings: LongAgentTeamSettingsInput | Record<string, unknown>
): Record<string, unknown> {
  const teams = Array.isArray((settings as { teams?: unknown }).teams)
    ? ((settings as { teams: unknown[] }).teams)
    : [];
  let records = teams.filter(
    (team): team is Record<string, unknown> =>
      Boolean(team) && typeof team === "object" && !Array.isArray(team)
  );
  const world = records.find((team) => team.parentAgentId === "worldbuilding");
  const character = records.find(
    (team) => team.parentAgentId === "character_design"
  );
  if (world || character) {
    const remaining = records.filter(
      (team) =>
        team.parentAgentId !== "worldbuilding" &&
        team.parentAgentId !== "character_design" &&
        team.parentAgentId !== "setting"
    );
    const usedNames = new Set<string>();
    const merged = [
      ...collectSubagents(world, usedNames, "（世界观）"),
      ...collectSubagents(character, usedNames, "（人物）")
    ];
    records = [
      { parentAgentId: "setting", subagents: merged },
      ...remaining
    ];
  }
  const writer = records.find(
    (team) => team.parentAgentId === "expert_section_writer"
  );
  if (writer) {
    const draft = records.find((team) => team.parentAgentId === "draft");
    const remaining = records.filter(
      (team) =>
        team.parentAgentId !== "expert_section_writer" &&
        team.parentAgentId !== "draft"
    );
    const usedNames = new Set<string>();
    const merged = [
      ...collectSubagents(draft, usedNames, ""),
      ...collectSubagents(writer, usedNames, "（单章写手）")
    ];
    records = [
      ...remaining.filter((team) => team.parentAgentId !== "continuity_ledger"),
      { parentAgentId: "draft", subagents: merged },
      ...remaining.filter((team) => team.parentAgentId === "continuity_ledger")
    ];
  }
  if (!world && !character && !writer) {
    return settings as Record<string, unknown>;
  }
  return {
    ...(settings as Record<string, unknown>),
    teams: records
  };
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

export class LongAgentTeamConfigStore {
  private readonly settingsPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.settingsPath = join(
      userDataPath,
      "config",
      "long-agent-teams.json"
    );
  }

  async list(): Promise<LongAgentTeamSettings> {
    await this.writeChain;
    const raw = await readJson(this.settingsPath);
    if (raw === undefined) return defaultSettings();
    if (
      !raw ||
      typeof raw !== "object" ||
      !("version" in raw) ||
      raw.version !== 1
    ) {
      throw new Error("长篇智能体团队配置版本无效，已停止加载以避免覆盖原文件。");
    }
    const { version: _version, ...settings } =
      raw as DiskLongAgentTeamSettings;
    const parsed = LongAgentTeamSettingsInputSchema.safeParse(
      migrateLegacyLongAgentTeams(settings)
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `长篇智能体团队配置内容无效，已停止加载以避免覆盖原文件${
          issue ? `：${issue.path.join(".") || "root"} ${issue.message}` : "。"
        }`
      );
    }
    return cloneSettings(parsed.data);
  }

  async save(
    rawInput: LongAgentTeamSettingsInput
  ): Promise<LongAgentTeamSettings> {
    const input = LongAgentTeamSettingsInputSchema.parse(rawInput);
    let saved: LongAgentTeamSettings | undefined;
    const operation = this.writeChain.then(async () => {
      saved = cloneSettings(input);
      const disk: DiskLongAgentTeamSettings = {
        version: 1,
        workspaceType: "long",
        teams: saved.teams.map((team) => ({
          parentAgentId: team.parentAgentId,
          subagents: team.subagents.map(cloneDefinition)
        }))
      };
      await atomicWriteJson(this.settingsPath, disk);
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return saved!;
  }

  async resolve(
    rawParentAgentId: LongAgentId
  ): Promise<ShortAgentSubagentDefinition[]> {
    const parentAgentId = LongAgentIdSchema.parse(rawParentAgentId);
    const settings = await this.list();
    return (
      settings.teams
        .find((team) => team.parentAgentId === parentAgentId)
        ?.subagents.filter((definition) => definition.enabled)
        .map(cloneDefinition) ?? []
    );
  }
}
