import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

interface DiskSecurityScopedBookmarks {
  version: 1;
  entries: Array<{ path: string; bookmark: string }>;
}

export interface SecurityScopedBookmarkRuntime {
  enabled: boolean;
  startAccessing(bookmark: string): () => void;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function normalizeEntry(path: string, bookmark: string): { path: string; bookmark: string } {
  const normalizedPath = path.trim();
  const normalizedBookmark = bookmark.trim();
  if (!normalizedPath || !isAbsolute(normalizedPath) || normalizedPath.includes("\0")) {
    throw new Error("安全作用域书签必须绑定绝对本地路径。");
  }
  if (
    !normalizedBookmark ||
    normalizedBookmark.length > 1024 * 1024 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(normalizedBookmark)
  ) {
    throw new Error("安全作用域书签格式无效。");
  }
  return { path: resolve(normalizedPath), bookmark: normalizedBookmark };
}

function parseDiskBookmarks(raw: unknown): DiskSecurityScopedBookmarks {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !("version" in raw) ||
    raw.version !== 1 ||
    !("entries" in raw) ||
    !Array.isArray(raw.entries) ||
    raw.entries.length > 512
  ) {
    throw new Error("安全作用域书签存储格式无效。");
  }
  return {
    version: 1,
    entries: raw.entries.map((entry) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        !("path" in entry) ||
        typeof entry.path !== "string" ||
        !("bookmark" in entry) ||
        typeof entry.bookmark !== "string"
      ) {
        throw new Error("安全作用域书签条目格式无效。");
      }
      return normalizeEntry(entry.path, entry.bookmark);
    })
  };
}

export class SecurityScopedBookmarkStore {
  readonly settingsPath: string;
  private readonly runtime: SecurityScopedBookmarkRuntime;
  private readonly entries = new Map<string, string>();
  private readonly releaseAccess = new Map<string, () => void>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(userDataPath: string, runtime: SecurityScopedBookmarkRuntime) {
    this.settingsPath = join(userDataPath, "config", "security-scoped-bookmarks.json");
    this.runtime = runtime;
  }

  async initialize(): Promise<number> {
    if (!this.runtime.enabled) return 0;
    let disk: DiskSecurityScopedBookmarks;
    try {
      disk = parseDiskBookmarks(JSON.parse(await readFile(this.settingsPath, "utf8")) as unknown);
    } catch (error: unknown) {
      if (isNodeError(error, "ENOENT")) return 0;
      throw error;
    }
    for (const entry of disk.entries) {
      this.entries.set(entry.path, entry.bookmark);
      this.activate(entry.path, entry.bookmark);
    }
    return this.releaseAccess.size;
  }

  async registerSelection(filePaths: readonly string[], bookmarks?: readonly string[]): Promise<void> {
    if (!this.runtime.enabled || !filePaths.length) return;
    if (!bookmarks || bookmarks.length !== filePaths.length) {
      throw new Error("Mac App Store 文件选择没有返回完整的安全作用域书签。");
    }
    const additions = filePaths.map((path, index) => normalizeEntry(path, bookmarks[index]!));
    const operation = this.writeChain.then(async () => {
      for (const entry of additions) this.entries.set(entry.path, entry.bookmark);
      await this.persist();
      for (const entry of additions) this.activate(entry.path, entry.bookmark);
    });
    this.writeChain = operation.then(() => undefined, () => undefined);
    await operation;
  }

  releaseAll(): void {
    for (const release of this.releaseAccess.values()) {
      try { release(); } catch { /* operating system releases access on process exit */ }
    }
    this.releaseAccess.clear();
  }

  private activate(path: string, bookmark: string): void {
    const previous = this.releaseAccess.get(path);
    if (previous) {
      try { previous(); } catch { /* replace a stale access handle */ }
    }
    this.releaseAccess.set(path, this.runtime.startAccessing(bookmark));
  }

  private async persist(): Promise<void> {
    const disk: DiskSecurityScopedBookmarks = {
      version: 1,
      entries: [...this.entries]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, bookmark]) => ({ path, bookmark }))
    };
    await mkdir(dirname(this.settingsPath), { recursive: true });
    const temporary = `${this.settingsPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(disk, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporary, this.settingsPath);
  }
}
