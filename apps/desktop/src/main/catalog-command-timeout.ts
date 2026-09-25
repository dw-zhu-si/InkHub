import type { CommandEnvelope } from "@deepwrite/contracts";

export const CATALOG_INTERACTIVE_COMMAND_TIMEOUT_MS = 60_000;

/**
 * Bound catalog calls that sit directly on the editor startup/read/save path.
 *
 * Other catalog operations keep their existing unlimited timeout because
 * project import, duplication, and deletion can legitimately take longer on
 * large external folders.
 */
export function catalogCommandTimeoutMs(
  commandType: CommandEnvelope["type"]
): number {
  return commandType === "catalog.saveDocument" ||
    commandType === "catalog.snapshot" ||
    commandType === "catalog.index" ||
    commandType === "catalog.readDocument"
    ? CATALOG_INTERACTIVE_COMMAND_TIMEOUT_MS
    : 0;
}

export function catalogCommandTimeoutMessage(
  commandType: CommandEnvelope["type"]
): string {
  const seconds = CATALOG_INTERACTIVE_COMMAND_TIMEOUT_MS / 1_000;
  return commandType === "catalog.saveDocument"
    ? `保存本地 Markdown 超过 ${seconds} 秒仍未完成。保存结果尚未确认，请检查文件后重试。`
    : `读取本地目录超过 ${seconds} 秒仍未完成，请检查项目所在磁盘后重试。`;
}
