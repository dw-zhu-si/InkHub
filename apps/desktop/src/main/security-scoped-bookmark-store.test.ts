import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecurityScopedBookmarkStore } from "./security-scoped-bookmark-store";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bookmark(seed: string): string {
  return Buffer.from(seed.repeat(12), "utf8").toString("base64");
}

describe("SecurityScopedBookmarkStore", () => {
  it("does nothing outside a Mac App Store runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-bookmarks-disabled-"));
    roots.push(root);
    const startAccessing = vi.fn(() => vi.fn());
    const store = new SecurityScopedBookmarkStore(root, { enabled: false, startAccessing });
    await store.registerSelection([join(root, "novel")], [bookmark("novel")]);
    expect(await store.initialize()).toBe(0);
    expect(startAccessing).not.toHaveBeenCalled();
  });

  it("persists selections with private permissions and restores access", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-bookmarks-"));
    roots.push(root);
    const selectedPath = join(root, "novel");
    const firstRelease = vi.fn();
    const firstStart = vi.fn(() => firstRelease);
    const first = new SecurityScopedBookmarkStore(root, { enabled: true, startAccessing: firstStart });
    await first.registerSelection([selectedPath], [bookmark("selected")]);
    expect(firstStart).toHaveBeenCalledTimes(1);

    const disk = JSON.parse(await readFile(first.settingsPath, "utf8")) as {
      version: number;
      entries: Array<{ path: string; bookmark: string }>;
    };
    expect(disk).toEqual({
      version: 1,
      entries: [{ path: selectedPath, bookmark: bookmark("selected") }]
    });

    const restoredRelease = vi.fn();
    const restoredStart = vi.fn(() => restoredRelease);
    const restored = new SecurityScopedBookmarkStore(root, { enabled: true, startAccessing: restoredStart });
    expect(await restored.initialize()).toBe(1);
    expect(restoredStart).toHaveBeenCalledWith(bookmark("selected"));
    restored.releaseAll();
    expect(restoredRelease).toHaveBeenCalledTimes(1);
    first.releaseAll();
    expect(firstRelease).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete or malformed bookmark selections", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-bookmarks-invalid-"));
    roots.push(root);
    const store = new SecurityScopedBookmarkStore(root, { enabled: true, startAccessing: () => vi.fn() });
    await expect(store.registerSelection([join(root, "a")], [])).rejects.toThrow("完整");
    await expect(store.registerSelection(["relative"], [bookmark("relative")])).rejects.toThrow("绝对");
  });
});
