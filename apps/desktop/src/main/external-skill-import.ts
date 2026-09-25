import { open, opendir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  CATALOG_LIBRARY_ENTRY_MAX_CHARACTERS,
  ExternalSkillSelectionResultSchema,
  parseSkillMarkdown,
  type ExternalSkillSelectionResult,
  type ExternalSkillSourceKind
} from "@deepwrite/contracts";

const MAX_CATALOG_TITLE_LENGTH = 256;
export const MAX_EXTERNAL_SKILL_FILE_BYTES = 256 * 1024;
export const MAX_EXTERNAL_SKILL_DIRECTORIES = 512;
export const MAX_EXTERNAL_SKILL_CANDIDATES = 256;
const MAX_EXTERNAL_SKILL_DIRECTORY_ENTRIES = 2_048;

type LimitedSkillReadResult =
  | { status: "ok"; content: string }
  | { status: "too-long" };

async function readLimitedSkillFile(path: string): Promise<LimitedSkillReadResult> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw new Error("选择的 Skill 入口不是普通文件。");
    }
    if (info.size > MAX_EXTERNAL_SKILL_FILE_BYTES) {
      return { status: "too-long" };
    }

    const buffer = Buffer.allocUnsafe(MAX_EXTERNAL_SKILL_FILE_BYTES + 1);
    let total = 0;
    while (total < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        total,
        buffer.byteLength - total,
        total
      );
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > MAX_EXTERNAL_SKILL_FILE_BYTES) {
      return { status: "too-long" };
    }
    return { status: "ok", content: buffer.subarray(0, total).toString("utf8") };
  } finally {
    await handle.close();
  }
}

async function directSkillPaths(root: string): Promise<string[]> {
  const directoryNames: string[] = [];
  let entryCount = 0;
  const directory = await opendir(root);
  for await (const entry of directory) {
    entryCount += 1;
    if (entryCount > MAX_EXTERNAL_SKILL_DIRECTORY_ENTRIES) {
      throw new Error(
        `所选目录项目过多；最多扫描 ${MAX_EXTERNAL_SKILL_DIRECTORY_ENTRIES} 个直接项目。`
      );
    }
    if (!entry.isDirectory()) continue;
    if (directoryNames.length >= MAX_EXTERNAL_SKILL_DIRECTORIES) {
      throw new Error(
        `所选 skills 根目录过大；最多支持 ${MAX_EXTERNAL_SKILL_DIRECTORIES} 个直接子目录。`
      );
    }
    directoryNames.push(entry.name);
  }
  return directoryNames
    .sort((left, right) => left.localeCompare(right))
    .map((name) => join(root, name, "SKILL.md"));
}

export async function readExternalSkills(
  sourceKind: ExternalSkillSourceKind,
  selectedPath: string
): Promise<ExternalSkillSelectionResult> {
  const paths: string[] = [];
  const skipped = {
    invalidFormat: 0,
    unreadable: 0,
    invalidName: 0,
    contentTooLong: 0
  };

  if (sourceKind === "file") {
    if (basename(selectedPath) !== "SKILL.md") {
      skipped.invalidName += 1;
    } else {
      paths.push(selectedPath);
    }
  } else {
    paths.push(...await directSkillPaths(selectedPath));
  }

  const candidates: ExternalSkillSelectionResult["candidates"] = [];
  let scanned = sourceKind === "file" ? 1 : 0;
  for (const path of paths) {
    let result: LimitedSkillReadResult;
    try {
      result = await readLimitedSkillFile(path);
      if (sourceKind === "directory") scanned += 1;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      if (sourceKind === "directory") scanned += 1;
      skipped.unreadable += 1;
      continue;
    }
    if (result.status === "too-long") {
      skipped.contentTooLong += 1;
      continue;
    }
    const { content } = result;
    if (content.length > CATALOG_LIBRARY_ENTRY_MAX_CHARACTERS) {
      skipped.contentTooLong += 1;
      continue;
    }
    const parsed = parseSkillMarkdown(content);
    if (!parsed.valid) {
      skipped.invalidFormat += 1;
      continue;
    }
    if (parsed.name.length > MAX_CATALOG_TITLE_LENGTH) {
      skipped.invalidName += 1;
      continue;
    }
    if (candidates.length >= MAX_EXTERNAL_SKILL_CANDIDATES) {
      throw new Error(
        `一次最多导入 ${MAX_EXTERNAL_SKILL_CANDIDATES} 个 Skill，请拆分目录后重试。`
      );
    }
    candidates.push({
      title: parsed.name,
      description: parsed.description,
      content
    });
  }

  return ExternalSkillSelectionResultSchema.parse({
    candidates,
    scanned,
    skipped
  });
}
