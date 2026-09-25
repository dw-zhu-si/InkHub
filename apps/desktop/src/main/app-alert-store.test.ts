import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppAlertStore, DEFAULT_MODEL_ALERT_MESSAGES } from "./app-alert-store";

const temporaryRoots: string[] = [];

function manifest(desketop = ["欢迎使用 DeepWrite"], model = ["模型公告"]): unknown {
  return { desketop, model };
}

async function temporaryRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), label));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("AppAlertStore", () => {
  it("shows each desktop message revision once and keeps model messages visible", async () => {
    const root = await temporaryRoot("deepwrite-alerts-once-");
    const fetcher = async () => new Response(JSON.stringify(manifest()));
    const firstStore = new AppAlertStore(root, { fetcher });
    const first = await firstStore.getSnapshot();

    expect(first.desktopMessages).toEqual(["欢迎使用 DeepWrite"]);
    expect(first.modelMessages).toEqual(["模型公告"]);
    expect(first.shouldShowDesktop).toBe(true);

    await firstStore.acknowledgeDesktop(first.desktopRevision);
    expect((await firstStore.getSnapshot()).shouldShowDesktop).toBe(false);

    const reopenedStore = new AppAlertStore(root, { fetcher });
    expect((await reopenedStore.getSnapshot()).shouldShowDesktop).toBe(false);
  });

  it("shows the desktop dialog again when its normalized content changes", async () => {
    const root = await temporaryRoot("deepwrite-alerts-changed-");
    const firstStore = new AppAlertStore(root, {
      fetcher: async () => new Response(JSON.stringify(manifest(["第一版"])))
    });
    const first = await firstStore.getSnapshot();
    await firstStore.acknowledgeDesktop(first.desktopRevision);

    const changedStore = new AppAlertStore(root, {
      fetcher: async () => new Response(JSON.stringify(manifest(["第二版"])))
    });
    const changed = await changedStore.getSnapshot();

    expect(changed.desktopMessages).toEqual(["第二版"]);
    expect(changed.shouldShowDesktop).toBe(true);
    expect(changed.desktopRevision).not.toBe(first.desktopRevision);
  });

  it("checks again in the same process and bypasses the raw-file cache", async () => {
    const root = await temporaryRoot("deepwrite-alerts-recheck-");
    let desktopMessage = "第一版";
    const requestedUrls: string[] = [];
    let now = 1_000;
    const store = new AppAlertStore(root, {
      now: () => now,
      fetcher: async (url) => {
        requestedUrls.push(url);
        return new Response(JSON.stringify(manifest([desktopMessage])));
      }
    });
    const first = await store.getSnapshot();
    await store.acknowledgeDesktop(first.desktopRevision);

    desktopMessage = "第一版增加几个字";
    now += 1;
    const changed = await store.getSnapshot();

    expect(changed.desktopMessages).toEqual(["第一版增加几个字"]);
    expect(changed.shouldShowDesktop).toBe(true);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("deepwrite_cache_bust=1000");
    expect(requestedUrls[1]).toContain("deepwrite_cache_bust=1001");
  });

  it("uses the last validated cache when the remote address is unavailable", async () => {
    const root = await temporaryRoot("deepwrite-alerts-cache-");
    await new AppAlertStore(root, {
      fetcher: async () =>
        new Response(JSON.stringify(manifest(["缓存提醒"], ["缓存模型公告"])))
    }).getSnapshot();

    const offlineStore = new AppAlertStore(root, {
      fetcher: async () => {
        throw new Error("offline");
      }
    });
    const cached = await offlineStore.getSnapshot();

    expect(cached.desktopMessages).toEqual(["缓存提醒"]);
    expect(cached.modelMessages).toEqual(["缓存模型公告"]);
  });

  it("falls back safely when no valid remote or cached config exists", async () => {
    const root = await temporaryRoot("deepwrite-alerts-fallback-");
    const store = new AppAlertStore(root, {
      fetcher: async () => new Response('{"desketop":"invalid"}')
    });
    const fallback = await store.getSnapshot();

    expect(fallback.desktopMessages).toEqual([]);
    expect(fallback.modelMessages).toEqual(DEFAULT_MODEL_ALERT_MESSAGES);
    expect(fallback.shouldShowDesktop).toBe(false);
  });
});
