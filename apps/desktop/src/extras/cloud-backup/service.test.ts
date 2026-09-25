import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CloudBackupService } from "./service";
import type { CloudBackupObjectStore } from "./oss-client";
import { CLOUD_BACKUP_QUOTA_BYTES } from "@deepwrite/contracts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

class MemoryStore implements CloudBackupObjectStore {
  readonly objects = new Map<string, Buffer>();

  async getObject(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body);
  }
}

async function setupWorkspace(): Promise<{
  userData: string;
  workspace: string;
}> {
  const userData = await mkdtemp(join(tmpdir(), "deepwrite-cloud-backup-user-"));
  const workspace = await mkdtemp(join(tmpdir(), "deepwrite-cloud-backup-ws-"));
  roots.push(userData, workspace);
  const bookDir = join(workspace, "books", "测试书");
  await mkdir(bookDir, { recursive: true });
  await writeFile(
    join(bookDir, "deepwrite.json"),
    `${JSON.stringify({ id: "book_test", title: "测试书", kind: "book" }, null, 2)}\n`
  );
  await writeFile(join(bookDir, "body.md"), "# hello\n");
  await writeFile(
    join(userData, "catalog-registry.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        revision: 1,
        updatedAt: "2026-08-13T00:00:00.000Z",
        sourceCatalogMigrated: true,
        creativePlotStages: [],
        projects: [
          {
            id: "book_test",
            domain: "book",
            projectDirectory: bookDir,
            registeredAt: "2026-08-13T00:00:00.000Z"
          }
        ]
      },
      null,
      2
    )}\n`
  );
  return { userData, workspace };
}

describe("cloud backup service", () => {
  it("uploads a packed snapshot and restores it onto another workspace after confirm", async () => {
    const { userData, workspace } = await setupWorkspace();
    const store = new MemoryStore();
    const registered: string[] = [];
    const service = new CloudBackupService(
      userData,
      {
        getWorkspaceDirectory: async () => workspace,
        registerCatalogProject: async ({ projectDirectory }) => {
          registered.push(projectDirectory);
        },
        registerLongBook: async () => undefined
      },
      store,
      () => new Date("2026-08-13T01:00:00.000Z")
    );

    const status = await service.status();
    expect(status.configured).toBe(true);
    expect(status.localItemCount).toBe(1);
    expect(status.quotaBytes).toBe(CLOUD_BACKUP_QUOTA_BYTES);

    const uploadPreview = await service.previewBackup();
    expect(uploadPreview.changes.some((change) => change.change === "add")).toBe(true);
    const uploaded = await service.applyBackup(uploadPreview.previewId);
    expect(uploaded.added).toBe(1);
    expect(store.objects.size).toBe(2);

    const otherUser = await mkdtemp(join(tmpdir(), "deepwrite-cloud-backup-other-"));
    const otherWorkspace = await mkdtemp(join(tmpdir(), "deepwrite-cloud-backup-other-ws-"));
    roots.push(otherUser, otherWorkspace);
    await writeFile(
      join(otherUser, "catalog-registry.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          revision: 1,
          updatedAt: "2026-08-13T00:00:00.000Z",
          sourceCatalogMigrated: true,
          creativePlotStages: [],
          projects: []
        },
        null,
        2
      )}\n`
    );
    const other = new CloudBackupService(
      otherUser,
      {
        getWorkspaceDirectory: async () => otherWorkspace,
        registerCatalogProject: async ({ projectDirectory }) => {
          registered.push(projectDirectory);
        },
        registerLongBook: async () => undefined
      },
      store,
      () => new Date("2026-08-13T02:00:00.000Z")
    );
    const restorePreview = await other.previewRestore(status.machineKey);
    expect(restorePreview.changes.map((change) => change.change)).toEqual(["add"]);
    await other.applyRestore(restorePreview.previewId);
    expect(registered.length).toBe(1);
    const restored = await readFile(
      join(registered[0]!, "deepwrite.json"),
      "utf8"
    );
    expect(restored).toContain("测试书");
  });

  it("rejects applying an unknown preview instead of writing blindly", async () => {
    const { userData, workspace } = await setupWorkspace();
    const service = new CloudBackupService(
      userData,
      {
        getWorkspaceDirectory: async () => workspace,
        registerCatalogProject: async () => undefined,
        registerLongBook: async () => undefined
      },
      new MemoryStore()
    );
    await expect(service.applyRestore("preview_missing")).rejects.toThrow("同步预览已过期");
  });
});
