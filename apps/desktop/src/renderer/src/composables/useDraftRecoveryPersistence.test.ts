import type { CatalogDraftRecovery } from "@deepwrite/contracts";
import { shallowRef } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorDraftState } from "../types/workspace";
import { useDraftRecoveryPersistence } from "./useDraftRecoveryPersistence";

const NOW = Date.parse("2026-08-14T08:00:00.000Z");

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function draft(
  title: string,
  recoveryUpdatedAt = "2026-08-14T07:00:00.000Z"
): EditorDraftState {
  return {
    title,
    content: `${title}正文`,
    dirty: true,
    recoveryUpdatedAt
  };
}

function recovery(
  title: string,
  recoveryUpdatedAt = "2026-08-14T07:00:00.000Z"
): CatalogDraftRecovery[string] {
  return {
    title,
    content: `${title}正文`,
    dirty: true,
    recoveryUpdatedAt
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("draft recovery persistence", () => {
  it("keeps startup typing in memory and reconciles it before enabling writes", async () => {
    const pendingLoad = deferred<CatalogDraftRecovery>();
    const saveDraftRecovery = vi.fn(async () => undefined);
    const drafts = shallowRef<Record<string, EditorDraftState>>({});
    const persistence = useDraftRecoveryPersistence({
      drafts,
      api: () => ({
        loadDraftRecovery: () => pendingLoad.promise,
        saveDraftRecovery
      }),
      warning: vi.fn(),
      now: () => NOW
    });

    const loading = persistence.load();
    drafts.value = {
      shared: draft("窗口内较新", "2026-08-14T07:30:00.000Z")
    };
    await vi.advanceTimersByTimeAsync(1_000);
    expect(saveDraftRecovery).not.toHaveBeenCalled();

    pendingLoad.resolve({
      shared: recovery("磁盘较旧", "2026-08-14T07:00:00.000Z"),
      diskOnly: recovery("磁盘独有")
    });
    await expect(loading).resolves.toBe(2);

    expect(drafts.value.shared?.title).toBe("窗口内较新");
    expect(drafts.value.diskOnly?.title).toBe("磁盘独有");
    await vi.advanceTimersByTimeAsync(250);
    expect(saveDraftRecovery).toHaveBeenCalledOnce();
  });

  it("does not replace or persist live drafts after a recovery read failure", async () => {
    const saveDraftRecovery = vi.fn(async () => undefined);
    const warning = vi.fn();
    const drafts = shallowRef<Record<string, EditorDraftState>>({
      live: draft("保留的窗口草稿")
    });
    const persistence = useDraftRecoveryPersistence({
      drafts,
      api: () => ({
        loadDraftRecovery: () => Promise.reject(new Error("读取暂时失败")),
        saveDraftRecovery
      }),
      warning,
      now: () => NOW
    });

    await persistence.load();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(persistence.phase.value).toBe("failed");
    expect(drafts.value.live?.title).toBe("保留的窗口草稿");
    expect(saveDraftRecovery).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "草稿恢复文件读取失败：读取暂时失败"
    );
  });

  it("serializes a newer revision behind an in-flight save", async () => {
    const firstSave = deferred<void>();
    const saveDraftRecovery = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce(undefined);
    const drafts = shallowRef<Record<string, EditorDraftState>>({});
    const persistence = useDraftRecoveryPersistence({
      drafts,
      api: () => ({
        loadDraftRecovery: async () => ({}),
        saveDraftRecovery
      }),
      warning: vi.fn(),
      now: () => NOW
    });
    await persistence.load();
    await persistence.flush();
    saveDraftRecovery.mockClear();

    drafts.value = { chapter: draft("版本 A") };
    await vi.advanceTimersByTimeAsync(250);
    expect(saveDraftRecovery).toHaveBeenCalledOnce();
    expect(saveDraftRecovery.mock.calls[0]?.[0].chapter?.title).toBe("版本 A");

    drafts.value = { chapter: draft("版本 B") };
    await vi.advanceTimersByTimeAsync(250);
    expect(saveDraftRecovery).toHaveBeenCalledOnce();

    firstSave.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(saveDraftRecovery).toHaveBeenCalledTimes(2);
    expect(saveDraftRecovery.mock.calls[1]?.[0].chapter?.title).toBe("版本 B");
  });

  it("shares an in-flight flush between before-unload and disposal", async () => {
    const pendingSave = deferred<void>();
    const saveDraftRecovery = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => pendingSave.promise);
    const drafts = shallowRef<Record<string, EditorDraftState>>({});
    const persistence = useDraftRecoveryPersistence({
      drafts,
      api: () => ({
        loadDraftRecovery: async () => ({}),
        saveDraftRecovery
      }),
      warning: vi.fn(),
      now: () => NOW
    });
    await persistence.load();
    await persistence.flush();
    saveDraftRecovery.mockClear();
    drafts.value = { chapter: draft("关闭前草稿") };

    persistence.beforeUnload();
    const disposing = persistence.dispose();
    expect(saveDraftRecovery).toHaveBeenCalledOnce();

    pendingSave.resolve();
    await disposing;
    expect(saveDraftRecovery).toHaveBeenCalledOnce();
    expect(persistence.phase.value).toBe("disposed");
  });

  it("ignores a late load after disposal", async () => {
    const pendingLoad = deferred<CatalogDraftRecovery>();
    const saveDraftRecovery = vi.fn(async () => undefined);
    const drafts = shallowRef<Record<string, EditorDraftState>>({
      live: draft("仍在窗口中的草稿")
    });
    const persistence = useDraftRecoveryPersistence({
      drafts,
      api: () => ({
        loadDraftRecovery: () => pendingLoad.promise,
        saveDraftRecovery
      }),
      warning: vi.fn(),
      now: () => NOW
    });

    const loading = persistence.load();
    await persistence.dispose();
    pendingLoad.resolve({ disk: recovery("迟到的磁盘草稿") });
    await loading;

    expect(drafts.value).toEqual({ live: draft("仍在窗口中的草稿") });
    expect(saveDraftRecovery).not.toHaveBeenCalled();
    expect(persistence.phase.value).toBe("disposed");
  });
});
