import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CloudBackupItemKind } from "@deepwrite/contracts";

interface RegistryProject {
  id: string;
  domain: string;
  projectDirectory: string;
  registeredAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function catalogGroupDomain(
  kind: CloudBackupItemKind
): "material-group" | "skill-group" | null {
  if (kind === "material-group") return "material-group";
  if (kind === "skill-group") return "skill-group";
  return null;
}

export async function registerGroupInCatalogRegistry(
  userDataPath: string,
  input: {
    id: string;
    kind: CloudBackupItemKind;
    projectDirectory: string;
    now: string;
  }
): Promise<void> {
  const domain = catalogGroupDomain(input.kind);
  if (!domain) {
    throw new Error("只能把分组注册到目录表。");
  }
  const registryPath = join(userDataPath, "catalog-registry.json");
  const rawText = await readFile(registryPath, "utf8");
  const parsed: unknown = JSON.parse(rawText);
  if (!isRecord(parsed) || !Array.isArray(parsed.projects)) {
    throw new Error("本地目录表无效，无法注册同步分组。");
  }
  const projects = parsed.projects.filter((item): item is RegistryProject => {
    if (!isRecord(item)) return false;
    return !(item.id === input.id && item.domain === domain);
  });
  projects.push({
    id: input.id,
    domain,
    projectDirectory: input.projectDirectory,
    registeredAt: input.now
  });
  const next = {
    ...parsed,
    revision:
      typeof parsed.revision === "number" && Number.isFinite(parsed.revision)
        ? parsed.revision + 1
        : 1,
    updatedAt: input.now,
    projects
  };
  await mkdir(dirname(registryPath), { recursive: true });
  const temporary = `${registryPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8"
  });
  await rename(temporary, registryPath);
}
