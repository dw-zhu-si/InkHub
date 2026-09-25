import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CloudBackupIdentityStore,
  createMachineKey,
  formatMachineKey
} from "./identity";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("cloud backup identity", () => {
  it("normalizes pasted keys and rejects invalid ones", () => {
    expect(formatMachineKey("dw abcd-2345 efgh wxyz")).toBe("DW-ABCD-2345-EFGH-WXYZ");
    expect(formatMachineKey("DWABCD2345EFGHWXYZ")).toBe("DW-ABCD-2345-EFGH-WXYZ");
    expect(() => formatMachineKey("hello")).toThrow("备份密钥格式无效");
  });

  it("creates and persists one machine key per user data directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-cloud-backup-id-"));
    roots.push(root);
    const store = new CloudBackupIdentityStore(root);
    const first = await store.getOrCreate(() => "2026-08-13T00:00:00.000Z");
    const second = await store.getOrCreate();
    expect(first).toMatch(/^DW-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/u);
    expect(second).toBe(first);
    const saved = JSON.parse(
      await readFile(join(root, "config", "cloud-backup-identity.json"), "utf8")
    ) as { machineKey: string };
    expect(saved.machineKey).toBe(first);
  });

  it("creates keys from random bytes without leaking real credentials", () => {
    expect(createMachineKey(Buffer.alloc(10, 1))).toMatch(/^DW-/u);
  });
});
