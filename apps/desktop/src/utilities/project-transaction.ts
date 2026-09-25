import { createHash } from "node:crypto";
import { constants as fsConstants, type BigIntStats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  unlink
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import { randomHex8 } from "@deepwrite/shared";

const INTERNAL_DIRECTORY = ".deepwrite";
const TRANSACTION_DIRECTORY = "transactions";
const JOURNAL_FILE = "transaction.json";
const LOCK_FILE = "transaction.lock";
const DEFAULT_MAX_FILE_BYTES = 32 * 1024 * 1024;
const LOCK_WAIT_TIMEOUT_MS = 2 * 60 * 1000;
const LOCK_RETRY_MS = 25;
const LOCK_INITIALIZATION_GRACE_MS = 5 * 1000;
// A long-form import contains at least three files per chapter and four per
// character. Keep one recoverable transaction for book-level atomicity while
// still enforcing a finite journal bound.
const MAX_TRANSACTION_FILES = 20_000;

interface ProjectTransactionFileOperationBase {
  /** Normalized, forward-slash-separated path inside the project root. */
  path: string;
  /**
   * `undefined` disables the precondition, `null` requires a missing target,
   * and a SHA-256 string requires the exact current file contents.
   */
  expectedSha256?: string | null;
}

export type ProjectTransactionFileOperation =
  | (ProjectTransactionFileOperationBase & {
      action?: "write";
      content: string;
    })
  | (ProjectTransactionFileOperationBase & {
      action: "delete";
    })
  | (ProjectTransactionFileOperationBase & {
      action: "check";
      expectedSha256: string | null;
    });

export interface CommitProjectTransactionInput {
  projectRoot: string;
  operations: readonly ProjectTransactionFileOperation[];
  maxFileBytes?: number;
}

export interface ProjectTransactionResult {
  transactionId: string;
  files: readonly {
    path: string;
    sha256: string | null;
  }[];
}

interface JournalOperation {
  action: "write" | "delete" | "check";
  path: string;
  stagePath: string | null;
  backupPath: string | null;
  beforeSha256: string | null;
  afterSha256: string | null;
}

interface TransactionJournal {
  schemaVersion: 1;
  transactionId: string;
  phase: "prepared" | "committing" | "committed";
  appliedCount: number;
  operations: JournalOperation[];
}

export class ProjectTransactionConflictError extends Error {
  constructor(
    readonly path: string,
    readonly expectedSha256: string | null,
    readonly actualSha256: string | null
  ) {
    super(
      `项目文件已在其他位置更新：${path}（期望 ${
        expectedSha256 ?? "不存在"
      }，实际 ${actualSha256 ?? "不存在"}）。`
    );
    this.name = "ProjectTransactionConflictError";
  }
}

export function projectTransactionContentSha256(
  content: string | Uint8Array
): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Node's default numeric fs.Stats can round 64-bit device and inode values on
 * filesystems whose identifiers exceed Number.MAX_SAFE_INTEGER. Keep both
 * components as bigint all the way through identity comparisons so distinct
 * files cannot be mistaken for hard-link aliases on those filesystems.
 */
export function projectTransactionFileIdentity(
  details: Readonly<{ dev: bigint; ino: bigint }>
): string {
  return `${details.dev}:${details.ino}`;
}

/**
 * Finishes an interrupted, already-prepared project transaction. Recovery
 * deliberately rolls forward: all next contents were durably staged before
 * the journal became visible, so completing the transaction preserves one
 * coherent revision without guessing which partial files should win.
 */
export async function recoverProjectTransaction(
  rawProjectRoot: string,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES
): Promise<ProjectTransactionResult | undefined> {
  const projectRoot = await secureProjectRoot(rawProjectRoot);
  const byteLimit = positiveByteLimit(maxFileBytes);
  return await withProjectTransactionLock(
    projectRoot,
    async () =>
      await recoverProjectTransactionLocked(projectRoot, byteLimit, false)
  );
}

async function recoverProjectTransactionLocked(
  projectRoot: string,
  maxFileBytes: number,
  abortPreparedConflict: boolean
): Promise<ProjectTransactionResult | undefined> {
  const journalPath = join(projectRoot, INTERNAL_DIRECTORY, JOURNAL_FILE);
  const journalBytes = await readRegularFileOptional(
    projectRoot,
    journalPath,
    maxFileBytes
  );
  if (!journalBytes) return undefined;

  const journal = parseJournal(journalBytes.toString("utf8"));
  if (journal.phase === "committed") {
    await cleanupTransaction(projectRoot, journal);
    return transactionResult(journal);
  }

  if (journal.phase === "prepared") {
    try {
      // A project directory can be moved or copied while the source is
      // finishing a commit. The destination may then contain the durable
      // prepared journal together with one or more files that already match
      // their staged contents. Hash equality makes those replacements
      // idempotent, so recover them just like a journal already marked as
      // committing instead of rejecting a valid migrated project as stale.
      await assertJournalPreconditions(
        projectRoot,
        journal,
        maxFileBytes,
        true
      );
    } catch (error: unknown) {
      if (
        abortPreparedConflict &&
        error instanceof ProjectTransactionConflictError
      ) {
        await cleanupTransaction(projectRoot, journal);
      }
      throw error;
    }
  } else {
    await assertJournalPreconditions(
      projectRoot,
      journal,
      maxFileBytes,
      true
    );
  }

  const committing: TransactionJournal = {
    ...journal,
    phase: "committing"
  };
  await writeJournal(projectRoot, committing, maxFileBytes);
  const changedDirectories = new Set<string>();

  for (let index = 0; index < committing.operations.length; index += 1) {
    const operation = committing.operations[index]!;
    const target = await resolveProjectFileTarget(projectRoot, operation.path);
    const current = await readRegularFileOptional(
      projectRoot,
      target,
      maxFileBytes
    );
    const currentSha256 = current
      ? projectTransactionContentSha256(current)
      : null;

    if (operation.action === "check") {
      if (currentSha256 !== operation.beforeSha256) {
        throw new ProjectTransactionConflictError(
          operation.path,
          operation.beforeSha256,
          currentSha256
        );
      }
    } else if (operation.action === "delete") {
      if (currentSha256 !== null) {
        if (currentSha256 !== operation.beforeSha256) {
          throw new ProjectTransactionConflictError(
            operation.path,
            operation.beforeSha256,
            currentSha256
          );
        }
        await ensureSafeParent(projectRoot, target);
        await unlink(target);
        changedDirectories.add(dirname(target));
      }
    } else if (currentSha256 !== operation.afterSha256) {
      if (currentSha256 !== operation.beforeSha256) {
        throw new ProjectTransactionConflictError(
          operation.path,
          operation.beforeSha256,
          currentSha256
        );
      }
      const staged = await resolveInternalFile(
        projectRoot,
        operation.stagePath!,
        maxFileBytes
      );
      const stagedBytes = await readRegularFileRequired(
        projectRoot,
        staged,
        maxFileBytes
      );
      const stagedSha256 = projectTransactionContentSha256(stagedBytes);
      if (stagedSha256 !== operation.afterSha256) {
        throw new Error(`事务暂存文件校验失败：${operation.path}`);
      }
      await ensureSafeParent(projectRoot, target);
      await rename(staged, target);
      changedDirectories.add(dirname(target));
    }

    committing.appliedCount = index + 1;
  }
  for (const directory of changedDirectories) {
    await syncDirectory(directory);
  }

  committing.phase = "committed";
  await writeJournal(projectRoot, committing, maxFileBytes);
  await cleanupTransaction(projectRoot, committing);
  return transactionResult(committing);
}

export async function commitProjectTransaction(
  rawInput: CommitProjectTransactionInput
): Promise<ProjectTransactionResult> {
  const projectRoot = await secureProjectRoot(rawInput.projectRoot);
  const maxFileBytes = positiveByteLimit(rawInput.maxFileBytes);
  const operations = validateOperations(rawInput.operations, maxFileBytes);
  return await withProjectTransactionLock(projectRoot, async () => {
    await recoverProjectTransactionLocked(projectRoot, maxFileBytes, false);
    return await commitProjectTransactionLocked(
      projectRoot,
      operations,
      maxFileBytes
    );
  });
}

async function commitProjectTransactionLocked(
  projectRoot: string,
  operations: readonly ProjectTransactionFileOperation[],
  maxFileBytes: number
): Promise<ProjectTransactionResult> {
  const transactionId = `txn-${Date.now()}-${randomHex8()}`;
  const transactionRoot = join(
    projectRoot,
    INTERNAL_DIRECTORY,
    TRANSACTION_DIRECTORY,
    transactionId
  );
  await ensureSafeDirectory(projectRoot, transactionRoot);

  const journalOperations: JournalOperation[] = [];
  const firstPathByIdentity = new Map<string, string>();
  const stagedDirectories = new Set<string>();
  let journalWritten = false;
  try {
    for (const [index, operation] of operations.entries()) {
      const target = await resolveProjectFileTarget(projectRoot, operation.path);
      const existing = await readRegularFileOptionalWithIdentity(
        projectRoot,
        target,
        maxFileBytes
      );
      if (existing?.identity) {
        const firstPath = firstPathByIdentity.get(existing.identity);
        if (firstPath) {
          throw new Error(
            `同一事务中的文件身份重复：${firstPath} 与 ${operation.path}。` +
              "可能存在硬链接别名，或当前文件系统返回了重复的文件身份。"
          );
        }
        firstPathByIdentity.set(existing.identity, operation.path);
      }
      const beforeSha256 = existing
        ? projectTransactionContentSha256(existing.bytes)
        : null;
      if (
        operation.expectedSha256 !== undefined &&
        operation.expectedSha256 !== beforeSha256
      ) {
        throw new ProjectTransactionConflictError(
          operation.path,
          operation.expectedSha256,
          beforeSha256
        );
      }

      const action = operation.action ?? "write";
      const stagePath =
        action === "write"
          ? `${INTERNAL_DIRECTORY}/${TRANSACTION_DIRECTORY}/${transactionId}/stage/${index}.next`
          : null;
      const backupPath =
        action === "check"
          ? null
          : `${INTERNAL_DIRECTORY}/${TRANSACTION_DIRECTORY}/${transactionId}/backup/${index}.previous`;
      let afterSha256: string | null = null;
      if (operation.action === undefined || operation.action === "write") {
        const staged = await resolveInternalWritableFile(
          projectRoot,
          stagePath!
        );
        await writeDurableNewFile(staged, operation.content);
        stagedDirectories.add(dirname(staged));
        afterSha256 = projectTransactionContentSha256(operation.content);
      } else if (operation.action === "check") {
        afterSha256 = beforeSha256;
      }
      if (existing && backupPath) {
        const backup = await resolveInternalWritableFile(
          projectRoot,
          backupPath
        );
        await writeDurableNewFile(backup, existing.bytes);
        stagedDirectories.add(dirname(backup));
      }
      journalOperations.push({
        action,
        path: operation.path,
        stagePath,
        backupPath,
        beforeSha256,
        afterSha256
      });
    }

    const journal: TransactionJournal = {
      schemaVersion: 1,
      transactionId,
      phase: "prepared",
      appliedCount: 0,
      operations: journalOperations
    };
    for (const directory of stagedDirectories) {
      await syncDirectory(directory);
    }
    await writeJournal(projectRoot, journal, maxFileBytes);
    journalWritten = true;
    const recovered = await recoverProjectTransactionLocked(
      projectRoot,
      maxFileBytes,
      true
    );
    if (!recovered) {
      throw new Error("项目事务提交后未返回恢复结果。");
    }
    if (recovered.transactionId !== transactionId) {
      throw new Error(
        `项目事务身份不一致：期望 ${transactionId}，实际 ${recovered.transactionId}。`
      );
    }
    return recovered;
  } catch (error: unknown) {
    if (!journalWritten) {
      await rm(transactionRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

function validateOperations(
  rawOperations: readonly ProjectTransactionFileOperation[],
  maxFileBytes: number
): ProjectTransactionFileOperation[] {
  if (
    rawOperations.length < 1 ||
    rawOperations.length > MAX_TRANSACTION_FILES
  ) {
    throw new Error(
      `项目事务必须包含 1 到 ${MAX_TRANSACTION_FILES} 个文件。`
    );
  }
  const normalized = rawOperations.map((operation) => {
    const path = validateBusinessProjectPath(operation.path);
    if (operation.action === "check" && operation.expectedSha256 === undefined) {
      throw new Error(`项目事务只校验操作必须包含 revision：${path}`);
    }
    if (
      operation.expectedSha256 !== undefined &&
      operation.expectedSha256 !== null &&
      !/^[0-9a-f]{64}$/u.test(operation.expectedSha256)
    ) {
      throw new Error(`项目事务文件 revision 格式无效：${path}`);
    }
    if (operation.action === "delete") {
      return { ...operation, action: "delete" as const, path };
    }
    if (operation.action === "check") {
      return { ...operation, action: "check" as const, path };
    }
    if (Buffer.byteLength(operation.content, "utf8") > maxFileBytes) {
      throw new Error(`项目事务文件超过大小限制：${path}`);
    }
    return { ...operation, action: "write" as const, path };
  });
  const keys = normalized.map(({ path }) =>
    path.normalize("NFC").toLocaleLowerCase("en-US")
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("项目事务不能包含重复或大小写等价的文件路径。");
  }
  return normalized;
}

function validateRelativeProjectPath(value: string): string {
  const path = value.trim();
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("项目事务路径必须是规范化的项目内相对路径。");
  }
  return path;
}

function validateBusinessProjectPath(value: string): string {
  const path = validateRelativeProjectPath(value);
  if (
    path === INTERNAL_DIRECTORY ||
    path.startsWith(`${INTERNAL_DIRECTORY}/`)
  ) {
    throw new Error("业务文件不能写入墨枢内部事务目录。");
  }
  return path;
}

function parseJournal(text: string): TransactionJournal {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("项目事务日志不是有效 JSON。");
  }
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("项目事务日志版本无效。");
  }
  const transactionId = parseTransactionId(value.transactionId);
  if (
    value.phase !== "prepared" &&
    value.phase !== "committing" &&
    value.phase !== "committed"
  ) {
    throw new Error("项目事务日志阶段无效。");
  }
  if (
    !Number.isSafeInteger(value.appliedCount) ||
    (value.appliedCount as number) < 0
  ) {
    throw new Error("项目事务日志进度无效。");
  }
  if (
    !Array.isArray(value.operations) ||
    value.operations.length < 1 ||
    value.operations.length > MAX_TRANSACTION_FILES
  ) {
    throw new Error("项目事务日志操作列表无效。");
  }
  const operations = value.operations.map((raw, index): JournalOperation => {
    if (!isRecord(raw)) {
      throw new Error(`项目事务日志操作 ${index} 无效。`);
    }
    const path = validateBusinessProjectPath(stringField(raw.path, "path"));
    const action =
      raw.action === undefined || raw.action === "write"
        ? "write"
        : raw.action === "delete"
          ? "delete"
          : raw.action === "check"
            ? "check"
          : undefined;
    if (!action) {
      throw new Error(`项目事务日志操作 ${index} 的动作无效。`);
    }
    const stagePath =
      action === "write"
        ? validateInternalTransactionPath(
            stringField(raw.stagePath, "stagePath"),
            transactionId
          )
        : raw.stagePath === null || raw.stagePath === undefined
          ? null
          : (() => {
              throw new Error(
                `项目事务日志 ${action} 操作 ${index} 不能包含暂存写文件。`
              );
            })();
    const backupPath =
      action === "check"
        ? raw.backupPath === null || raw.backupPath === undefined
          ? null
          : (() => {
              throw new Error(
                `项目事务日志只校验操作 ${index} 不能包含备份文件。`
              );
            })()
        : validateInternalTransactionPath(
            stringField(raw.backupPath, "backupPath"),
            transactionId
          );
    const beforeSha256 =
      raw.beforeSha256 === null
        ? null
        : validateSha256(stringField(raw.beforeSha256, "beforeSha256"));
    const afterSha256 =
      action === "write"
        ? validateSha256(stringField(raw.afterSha256, "afterSha256"))
        : action === "check"
          ? raw.afterSha256 === null
            ? null
            : validateSha256(
                stringField(raw.afterSha256, "afterSha256")
              )
          : raw.afterSha256 === null || raw.afterSha256 === undefined
            ? null
            : (() => {
                throw new Error(
                  `项目事务日志删除操作 ${index} 的结果哈希必须为空。`
                );
              })();
    if (action === "check" && afterSha256 !== beforeSha256) {
      throw new Error(
        `项目事务日志只校验操作 ${index} 的前后哈希必须一致。`
      );
    }
    return {
      action,
      path,
      stagePath,
      backupPath,
      beforeSha256,
      afterSha256
    };
  });
  if ((value.appliedCount as number) > operations.length) {
    throw new Error("项目事务日志进度超出操作数量。");
  }
  return {
    schemaVersion: 1,
    transactionId,
    phase: value.phase,
    appliedCount: value.appliedCount as number,
    operations
  };
}

async function assertJournalPreconditions(
  projectRoot: string,
  journal: TransactionJournal,
  maxFileBytes: number,
  allowAppliedState: boolean
): Promise<void> {
  for (const operation of journal.operations) {
    const target = await resolveProjectFileTarget(projectRoot, operation.path);
    const current = await readRegularFileOptional(
      projectRoot,
      target,
      maxFileBytes
    );
    const currentSha256 = current
      ? projectTransactionContentSha256(current)
      : null;
    const appliedStateAllowed =
      allowAppliedState &&
      operation.action !== "check" &&
      currentSha256 === operation.afterSha256;
    if (
      currentSha256 !== operation.beforeSha256 &&
      !appliedStateAllowed
    ) {
      throw new ProjectTransactionConflictError(
        operation.path,
        operation.beforeSha256,
        currentSha256
      );
    }
  }
}

function validateInternalTransactionPath(
  value: string,
  transactionId: string
): string {
  const path = validateRelativeProjectPath(value);
  const prefix = `${INTERNAL_DIRECTORY}/${TRANSACTION_DIRECTORY}/${transactionId}/`;
  if (!path.startsWith(prefix)) {
    throw new Error("项目事务日志引用了事务目录外的内部文件。");
  }
  return path;
}

function parseTransactionId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^txn-[0-9]+-[0-9a-f]{8}$/u.test(value)
  ) {
    throw new Error("项目事务标识无效。");
  }
  return value;
}

function validateSha256(value: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("项目事务哈希无效。");
  }
  return value;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`项目事务日志字段 ${name} 无效。`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ProjectTransactionLockOwner {
  pid: number;
  token: string;
  acquiredAt: string;
}

async function withProjectTransactionLock<T>(
  projectRoot: string,
  task: () => Promise<T>
): Promise<T> {
  const release = await acquireProjectTransactionLock(projectRoot);
  try {
    return await task();
  } finally {
    await release();
  }
}

async function acquireProjectTransactionLock(
  projectRoot: string
): Promise<() => Promise<void>> {
  const lockPath = await resolveInternalWritableFile(
    projectRoot,
    `${INTERNAL_DIRECTORY}/${LOCK_FILE}`
  );
  const token = randomHex8();
  const owner: ProjectTransactionLockOwner = {
    pid: process.pid,
    token,
    acquiredAt: new Date().toISOString()
  };
  const serialized = `${JSON.stringify(owner)}\n`;
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  for (;;) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let acquiredIdentity: string | undefined;
    try {
      handle = await open(
        lockPath,
        fsConstants.O_WRONLY |
          fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_NOFOLLOW,
        0o600
      );
      const acquiredInfo = await handle.stat({ bigint: true });
      if (!acquiredInfo.isFile() || acquiredInfo.nlink !== 1n) {
        throw new Error("新建项目事务锁不是安全的普通文件。");
      }
      acquiredIdentity = projectTransactionFileIdentity(acquiredInfo);
      await handle.writeFile(serialized);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await syncDirectory(dirname(lockPath));
      const published = await lstat(lockPath, { bigint: true });
      if (
        published.isSymbolicLink() ||
        !published.isFile() ||
        published.nlink !== 1n ||
        projectTransactionFileIdentity(published) !== acquiredIdentity
      ) {
        throw new Error("项目事务锁在获取期间发生路径替换。");
      }
      const ownedIdentity = acquiredIdentity;
      return async () => {
        const current = await readRegularFileOptionalWithIdentity(
          projectRoot,
          lockPath,
          4 * 1024
        );
        if (!current) {
          throw new Error("项目事务锁在持有期间消失，拒绝无条件释放。");
        }
        const parsed = parseLockOwnerOptional(current.bytes.toString("utf8"));
        if (
          parsed?.token !== token ||
          parsed.pid !== process.pid ||
          current.identity !== ownedIdentity
        ) {
          throw new Error("项目事务锁所有者发生变化，拒绝释放其他进程的锁。");
        }
        if (
          !(await unlinkProjectTransactionLockIfIdentity(
            lockPath,
            ownedIdentity
          ))
        ) {
          throw new Error("项目事务锁在释放前发生路径替换，拒绝删除替代锁。");
        }
      };
    } catch (error: unknown) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }
      if (!isNodeError(error, "EEXIST")) {
        if (acquiredIdentity) {
          await unlinkProjectTransactionLockIfIdentity(
            lockPath,
            acquiredIdentity
          ).catch(() => false);
        }
        throw error;
      }
    }

    await removeStaleProjectTransactionLock(projectRoot, lockPath);
    if (Date.now() >= deadline) {
      throw new Error("等待项目事务锁超时，请确认没有其他实例仍在写入该项目。");
    }
    await delay(LOCK_RETRY_MS);
  }
}

async function removeStaleProjectTransactionLock(
  projectRoot: string,
  lockPath: string
): Promise<void> {
  let details: BigIntStats;
  try {
    details = await lstat(lockPath, { bigint: true });
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return;
    throw error;
  }
  if (details.isSymbolicLink() || !details.isFile() || details.nlink > 1n) {
    throw new Error("项目事务锁不是安全的普通文件。");
  }
  if (
    details.size === 0n &&
    Date.now() - Number(details.mtimeMs) < LOCK_INITIALIZATION_GRACE_MS
  ) {
    return;
  }
  const current = await readRegularFileOptionalWithIdentity(
    projectRoot,
    lockPath,
    4 * 1024,
    { pathRaceAsMissing: true }
  );
  if (!current) return;
  const owner = parseLockOwnerOptional(current.bytes.toString("utf8"));
  if (owner && isProcessAlive(owner.pid)) return;
  if (
    !owner &&
    Date.now() - Number(details.mtimeMs) < LOCK_INITIALIZATION_GRACE_MS
  ) {
    return;
  }

  await unlinkProjectTransactionLockIfIdentity(lockPath, current.identity);
}

async function unlinkProjectTransactionLockIfIdentity(
  lockPath: string,
  expectedIdentity: string
): Promise<boolean> {
  const latest = await lstat(lockPath, { bigint: true }).catch(
    (error: unknown) => {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    }
  );
  if (
    !latest ||
    latest.isSymbolicLink() ||
    !latest.isFile() ||
    latest.nlink !== 1n ||
    projectTransactionFileIdentity(latest) !== expectedIdentity
  ) {
    return false;
  }
  await unlink(lockPath);
  await syncDirectory(dirname(lockPath));
  return true;
}

function parseLockOwnerOptional(
  text: string
): ProjectTransactionLockOwner | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.pid) ||
    (value.pid as number) <= 0 ||
    typeof value.token !== "string" ||
    !/^[0-9a-f]{8}$/u.test(value.token) ||
    typeof value.acquiredAt !== "string" ||
    !Number.isFinite(Date.parse(value.acquiredAt))
  ) {
    return undefined;
  }
  return {
    pid: value.pid as number,
    token: value.token,
    acquiredAt: value.acquiredAt
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return !isNodeError(error, "ESRCH");
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

async function writeJournal(
  projectRoot: string,
  journal: TransactionJournal,
  maxFileBytes: number
): Promise<void> {
  const serialized = `${JSON.stringify(journal, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > maxFileBytes) {
    throw new Error("项目事务日志超过大小限制。");
  }
  const journalPath = await resolveInternalWritableFile(
    projectRoot,
    `${INTERNAL_DIRECTORY}/${JOURNAL_FILE}`
  );
  const temporary = `${journalPath}.${randomHex8()}.tmp`;
  try {
    await writeDurableNewFile(temporary, serialized);
    await rename(temporary, journalPath);
    await syncDirectory(dirname(journalPath));
  } catch (error: unknown) {
    await unlinkOptional(temporary);
    throw error;
  }
}

async function writeDurableNewFile(
  path: string,
  content: string | Uint8Array
): Promise<void> {
  const handle = await open(
    path,
    fsConstants.O_WRONLY |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_NOFOLLOW,
    0o600
  );
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, fsConstants.O_RDONLY);
  } catch (error: unknown) {
    if (
      isNodeError(error, "EPERM") ||
      isNodeError(error, "EISDIR") ||
      isNodeError(error, "ENOTSUP")
    ) {
      return;
    }
    throw error;
  }
  try {
    await handle.sync();
  } catch (error: unknown) {
    if (
      !isNodeError(error, "EINVAL") &&
      !isNodeError(error, "ENOTSUP") &&
      !isNodeError(error, "EPERM")
    ) {
      throw error;
    }
  } finally {
    await handle.close();
  }
}

async function cleanupTransaction(
  projectRoot: string,
  journal: TransactionJournal
): Promise<void> {
  const journalPath = join(projectRoot, INTERNAL_DIRECTORY, JOURNAL_FILE);
  await unlinkOptional(journalPath);
  await syncDirectory(dirname(journalPath));
  const transactionRoot = resolve(
    projectRoot,
    INTERNAL_DIRECTORY,
    TRANSACTION_DIRECTORY,
    journal.transactionId
  );
  assertContained(projectRoot, transactionRoot);
  await rm(transactionRoot, { recursive: true, force: true });
  await syncDirectory(dirname(transactionRoot));
}

function transactionResult(
  journal: TransactionJournal
): ProjectTransactionResult {
  return {
    transactionId: journal.transactionId,
    files: journal.operations.map(({ path, afterSha256 }) => ({
      path,
      sha256: afterSha256
    }))
  };
}

async function secureProjectRoot(path: string): Promise<string> {
  const resolved = resolve(path);
  const info = await lstat(resolved);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error("项目事务根目录必须是真实目录。");
  }
  return await realpath(resolved);
}

async function resolveProjectFileTarget(
  projectRoot: string,
  relativePath: string
): Promise<string> {
  const normalized = validateRelativeProjectPath(relativePath);
  const target = resolve(projectRoot, normalized);
  assertContained(projectRoot, target);
  await ensureSafeParent(projectRoot, target);
  return target;
}

async function resolveInternalWritableFile(
  projectRoot: string,
  relativePath: string
): Promise<string> {
  const normalized = validateRelativeProjectPath(relativePath);
  if (!normalized.startsWith(`${INTERNAL_DIRECTORY}/`)) {
    throw new Error("内部事务文件必须位于墨枢内部目录。");
  }
  const target = resolve(projectRoot, normalized);
  assertContained(projectRoot, target);
  await ensureSafeParent(projectRoot, target);
  return target;
}

async function resolveInternalFile(
  projectRoot: string,
  relativePath: string,
  maxFileBytes: number
): Promise<string> {
  const target = await resolveInternalWritableFile(projectRoot, relativePath);
  await readRegularFileRequired(projectRoot, target, maxFileBytes);
  return target;
}

async function ensureSafeDirectory(
  projectRoot: string,
  directory: string
): Promise<void> {
  assertContained(projectRoot, directory);
  await ensureSafeParent(projectRoot, join(directory, ".placeholder"));
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error: unknown) {
    if (!isNodeError(error, "EEXIST")) throw error;
  }
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error("项目事务目录不是安全的真实目录。");
  }
}

async function ensureSafeParent(
  projectRoot: string,
  target: string
): Promise<void> {
  const parent = dirname(target);
  assertContained(projectRoot, parent);
  const offset = relative(projectRoot, parent);
  let current = projectRoot;
  for (const segment of offset ? offset.split(sep) : []) {
    current = join(current, segment);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error: unknown) {
      if (!isNodeError(error, "EEXIST")) throw error;
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error("项目事务父目录包含符号链接或非目录节点。");
    }
    assertContained(projectRoot, await realpath(current));
  }
}

async function readRegularFileOptional(
  projectRoot: string,
  path: string,
  maxFileBytes: number
): Promise<Buffer | undefined> {
  return (
    await readRegularFileOptionalWithIdentity(
      projectRoot,
      path,
      maxFileBytes
    )
  )?.bytes;
}

async function readRegularFileOptionalWithIdentity(
  projectRoot: string,
  path: string,
  maxFileBytes: number,
  options: { pathRaceAsMissing?: boolean } = {}
): Promise<{ bytes: Buffer; identity: string } | undefined> {
  assertContained(projectRoot, path);
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
    );
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return undefined;
    if (isNodeError(error, "ELOOP")) {
      throw new Error("项目事务目标不能是符号链接。");
    }
    throw error;
  }
  try {
    const info = await handle.stat({ bigint: true });
    if (!info.isFile() || info.nlink > 1n) {
      throw new Error("项目事务目标必须是普通文件。");
    }
    if (info.nlink === 0n) {
      if (options.pathRaceAsMissing) return undefined;
      throw new Error("项目事务目标在读取前已从目录中移除。");
    }
    if (info.size > BigInt(maxFileBytes)) {
      throw new Error("项目事务目标超过大小限制。");
    }
    let canonical: string;
    try {
      canonical = await realpath(path);
    } catch (error: unknown) {
      if (
        options.pathRaceAsMissing &&
        isNodeError(error, "ENOENT")
      ) {
        return undefined;
      }
      throw error;
    }
    assertContained(projectRoot, canonical);
    let pathInfo: BigIntStats;
    try {
      pathInfo = await lstat(path, { bigint: true });
    } catch (error: unknown) {
      if (
        options.pathRaceAsMissing &&
        isNodeError(error, "ENOENT")
      ) {
        return undefined;
      }
      throw error;
    }
    if (
      pathInfo.isSymbolicLink() ||
      pathInfo.dev !== info.dev ||
      pathInfo.ino !== info.ino
    ) {
      if (options.pathRaceAsMissing) return undefined;
      throw new Error("项目事务目标在读取期间发生替换。");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const changedDuringRead =
      after.dev !== info.dev ||
      after.ino !== info.ino ||
      after.nlink !== 1n ||
      after.size !== BigInt(bytes.byteLength) ||
      bytes.byteLength > maxFileBytes;
    if (changedDuringRead) {
      if (options.pathRaceAsMissing && after.nlink !== 1n) {
        return undefined;
      }
      throw new Error("项目事务目标在读取期间发生变化。");
    }
    return {
      bytes,
      identity: projectTransactionFileIdentity(after)
    };
  } finally {
    await handle.close();
  }
}

async function readRegularFileRequired(
  projectRoot: string,
  path: string,
  maxFileBytes: number
): Promise<Buffer> {
  const bytes = await readRegularFileOptional(projectRoot, path, maxFileBytes);
  if (!bytes) throw new Error("项目事务内部文件不存在。");
  return bytes;
}

function assertContained(root: string, candidate: string): void {
  const offset = relative(root, candidate);
  if (
    offset === "" ||
    (!offset.startsWith(`..${sep}`) &&
      offset !== ".." &&
      !isAbsolute(offset))
  ) {
    return;
  }
  throw new Error("项目事务路径越过项目根目录。");
}

function positiveByteLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_MAX_FILE_BYTES;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("项目事务文件大小限制必须是正整数。");
  }
  return limit;
}

async function unlinkOptional(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error: unknown) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

function isNodeError(
  error: unknown,
  code: string
): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
