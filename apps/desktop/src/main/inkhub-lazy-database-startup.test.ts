import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InkHubAiRepairTaskStore } from "./inkhub-ai-repair-task-store";
import { InkHubDeepQualityTaskStore } from "./inkhub-deep-quality-task-store";
import { InkHubStoryKernelService } from "./inkhub-story-kernel-service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("InkHub optional database startup", () => {
  it("does not open optional SQLite files while the first app window is being assembled", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-lazy-databases-"));
    roots.push(root);
    const aiStore = new InkHubAiRepairTaskStore(root);
    const deepStore = new InkHubDeepQualityTaskStore(root);
    new InkHubStoryKernelService({
      storageDirectory: root,
      assets: {} as never,
      models: {} as never
    });

    await expect(access(join(root, "ai-repair-tasks.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(root, "deep-quality-tasks.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(root, "story-kernel.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });

    expect(aiStore.get("not-created")).toBeNull();
    expect(deepStore.get("not-created")).toBeNull();
    await expect(access(join(root, "ai-repair-tasks.sqlite"))).resolves.toBeUndefined();
    await expect(access(join(root, "deep-quality-tasks.sqlite"))).resolves.toBeUndefined();
    aiStore.close();
    deepStore.close();
  });
});
