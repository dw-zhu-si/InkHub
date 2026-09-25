import type { BrowserWindow } from "electron";
import { app, dialog } from "electron";
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ExportLongManuscriptInputSchema,
  ExportLongManuscriptResultSchema,
  type ExportLongManuscriptInput,
  type ExportLongManuscriptResult
} from "@deepwrite/contracts";

const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const LONG_EXPORT_STAGING_PREFIX = ".inkhub-long-export-";
let exportCommitTail: Promise<void> = Promise.resolve();

export function safeLongExportName(label: string, fallback = "未命名"): string {
  const safe = Array.from(
    label
      .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .replace(/[. ]+$/gu, "")
  )
    .slice(0, 120)
    .join("");
  if (!safe || WINDOWS_RESERVED_NAMES.test(safe)) return fallback;
  return safe;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function withExportCommitLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = exportCommitTail;
  let release!: () => void;
  exportCommitTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function commitStagingDirectory(stagingPath: string, directoryBase: string): Promise<string> {
  return withExportCommitLock(async () => {
    for (let index = 1; index < 100_000; index += 1) {
      const candidate = index === 1 ? directoryBase : `${directoryBase} (${index})`;
      try {
        await lstat(candidate);
        continue;
      } catch (error: unknown) {
        if (!isNodeError(error, "ENOENT")) throw error;
      }
      try {
        await rename(stagingPath, candidate);
        return candidate;
      } catch (error: unknown) {
        if (isNodeError(error, "EEXIST") || isNodeError(error, "ENOTEMPTY")) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("导出目录中存在过多同名文件，请更换导出位置。");
  });
}

export async function writeLongManuscriptExport(
  parentDirectory: string,
  rawInput: ExportLongManuscriptInput
): Promise<{ directoryPath: string; fileCount: number }> {
  const input = ExportLongManuscriptInputSchema.parse(rawInput);
  const directoryBase = join(
    parentDirectory,
    `${safeLongExportName(input.title, "长篇")}-导出`
  );
  const stagingPath = await mkdtemp(join(parentDirectory, LONG_EXPORT_STAGING_PREFIX));
  try {
    const usedRelativePaths = new Set<string>();
    for (const file of input.files) {
      const directories = file.path
        .slice(0, -1)
        .map((segment) => safeLongExportName(segment));
      const filename = safeLongExportName(file.path.at(-1) ?? "未命名");
      const parentPath = join(stagingPath, ...directories);
      await mkdir(parentPath, { recursive: true });

      const relativeBase = join(...directories, filename).toLocaleLowerCase();
      let suffix = 1;
      let relativeKey = `${relativeBase}.txt`;
      while (usedRelativePaths.has(relativeKey)) {
        suffix += 1;
        relativeKey = `${relativeBase} (${suffix}).txt`;
      }
      usedRelativePaths.add(relativeKey);
      const targetBase = join(parentPath, suffix === 1 ? filename : `${filename} (${suffix})`);
      await writeFile(`${targetBase}.txt`, `\ufeff${file.content}`, "utf8");
    }

    const directoryPath = await commitStagingDirectory(stagingPath, directoryBase);
    return { directoryPath, fileCount: input.files.length };
  } catch (error: unknown) {
    try {
      await rm(stagingPath, { recursive: true, force: true });
    } catch (cleanupError: unknown) {
      throw new AggregateError(
        [error, cleanupError],
        "长篇导出失败，且临时目录清理失败。"
      );
    }
    throw error;
  }
}

export async function exportLongManuscript(
  window: BrowserWindow,
  rawInput: ExportLongManuscriptInput
): Promise<ExportLongManuscriptResult> {
  const input = ExportLongManuscriptInputSchema.parse(rawInput);
  const selection = await dialog.showOpenDialog(window, {
    title: "选择长篇导出位置",
    buttonLabel: "导出到这里",
    properties: ["openDirectory", "createDirectory"],
    ...(process.mas === true ? { securityScopedBookmarks: true } : {})
  });
  const parentDirectory = selection.filePaths[0];
  if (selection.canceled || !parentDirectory) {
    return ExportLongManuscriptResultSchema.parse({ status: "cancelled" });
  }
  const releaseAccess = process.mas === true && selection.bookmarks?.[0]
    ? app.startAccessingSecurityScopedResource(selection.bookmarks[0])
    : undefined;
  try {
    return ExportLongManuscriptResultSchema.parse({
      status: "saved",
      ...(await writeLongManuscriptExport(parentDirectory, input))
    });
  } finally {
    releaseAccess?.();
  }
}
