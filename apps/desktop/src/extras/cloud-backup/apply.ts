import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { CloudBackupItemKind } from "@deepwrite/contracts";

const PARENT_BY_KIND: Record<CloudBackupItemKind, string> = {
  book: "books",
  "long-book": "books",
  "material-library": "materials",
  "material-group": "material-groups",
  "skill-library": "skills",
  "skill-group": "skill-groups"
};

export function workspaceParentForKind(
  workspaceDirectory: string,
  kind: CloudBackupItemKind
): string {
  return join(workspaceDirectory, PARENT_BY_KIND[kind]);
}

export function sanitizeProjectFolderName(value: string): string {
  const normalized = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[. ]+$/gu, "")
    .trim();
  return [...normalized].slice(0, 80).join("") || "未命名项目";
}

export async function allocateProjectDirectory(
  workspaceDirectory: string,
  kind: CloudBackupItemKind,
  title: string
): Promise<string> {
  const parent = workspaceParentForKind(workspaceDirectory, kind);
  await mkdir(parent, { recursive: true });
  const name = sanitizeProjectFolderName(title);
  for (let index = 1; index < 10_000; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const candidate = join(parent, `${name}${suffix}`);
    try {
      await readdir(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("无法为同步项目分配文件夹。");
}

export async function writeProjectFiles(
  projectDirectory: string,
  files: ReadonlyArray<{ relativePath: string; data: Buffer }>,
  options: { replaceExisting?: boolean } = {}
): Promise<void> {
  const root = resolve(projectDirectory);
  await mkdir(root, { recursive: true });
  const written = new Set<string>();
  for (const file of files) {
    const relativePath = file.relativePath.replaceAll("\\", "/");
    if (!relativePath || relativePath.includes("..") || relativePath.startsWith("/")) {
      throw new Error("备份文件路径无效。");
    }
    const target = resolve(root, ...relativePath.split("/"));
    if (target !== root && !target.startsWith(`${root}/`) && !target.startsWith(`${root}\\`)) {
      throw new Error("备份文件路径超出项目目录。");
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.data);
    written.add(relativePath);
  }

  if (!options.replaceExisting) return;

  async function removeStale(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      const relativePath = fullPath
        .slice(root.length + 1)
        .split(/[/\\]/u)
        .join("/");
      if (entry.isDirectory()) {
        await removeStale(fullPath);
        continue;
      }
      if (!written.has(relativePath) && entry.name !== ".DS_Store") {
        await rm(fullPath, { force: true });
      }
    }
  }

  await removeStale(root);
}

export function catalogOpenDomain(
  kind: CloudBackupItemKind
): "book" | "material" | "skill" | null {
  if (kind === "book") return "book";
  if (kind === "material-library") return "material";
  if (kind === "skill-library") return "skill";
  return null;
}
