import { ref, shallowRef } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorDraftState, WorkspaceDocument } from "../types/workspace";
import {
  useEditorAutoSaveCoordinator,
  type EditorPersistOutcome
} from "./useEditorAutoSaveCoordinator";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function workspaceDocument(id: string): WorkspaceDocument {
  return {
    id,
    domain: "creation",
    title: `文档 ${id}`,
    eyebrow: "测试正文",
    path: ["测试书籍", `文档 ${id}`],
    content: "磁盘正文",
    workspaceId: "book-one",
    catalogDocumentId: id
  };
}

function draft(content: string): EditorDraftState {
  return { title: "测试标题", content, dirty: true };
}

function harness(
  persist = vi.fn(async (): Promise<EditorPersistOutcome> => "saved"),
  overrides: {
    blocked?: boolean;
    conflicted?: boolean;
    debounceMs?: number;
    retryMs?: number;
    maxRetryMs?: number;
    onIdle?: () => Promise<void>;
  } = {}
) {
  const enabled = ref(true);
  const drafts = shallowRef<Record<string, EditorDraftState>>({
    first: draft("草稿 A")
  });
  const documents = shallowRef<WorkspaceDocument[]>([
    workspaceDocument("first"),
    workspaceDocument("second")
  ]);
  let blocked = overrides.blocked ?? false;
  let conflicted = overrides.conflicted ?? false;
  const coordinator = useEditorAutoSaveCoordinator({
    enabled,
    drafts,
    documents,
    timer: {
      setTimeout(callback, delay) {
        return globalThis.setTimeout(callback, delay) as unknown as number;
      },
      clearTimeout(timerId) {
        globalThis.clearTimeout(
          timerId as unknown as ReturnType<typeof globalThis.setTimeout>
        );
      }
    },
    persist,
    isConflicted: () => conflicted,
    isWriteBlocked: () => blocked,
    ...(overrides.onIdle === undefined ? {} : { onIdle: overrides.onIdle }),
    debounceMs: overrides.debounceMs ?? 800,
    retryMs: overrides.retryMs ?? 250,
    ...(overrides.maxRetryMs === undefined
      ? {}
      : { maxRetryMs: overrides.maxRetryMs })
  });
  return {
    coordinator,
    drafts,
    enabled,
    persist,
    setBlocked(value: boolean) {
      blocked = value;
    },
    setConflicted(value: boolean) {
      conflicted = value;
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("editor auto-save coordinator", () => {
  it("debounces a document and persists only its latest draft", async () => {
    vi.useFakeTimers();
    const { coordinator, drafts, persist } = harness();
    coordinator.schedule("first");
    drafts.value = { first: draft("草稿 B") };
    coordinator.schedule("first");

    await vi.advanceTimersByTimeAsync(799);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await coordinator.drain();

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(
      { id: "first", title: "测试标题", content: "草稿 B" },
      false
    );
  });

  it("serializes writes across different documents", async () => {
    vi.useFakeTimers();
    const firstSave = deferred<EditorPersistOutcome>();
    const secondSave = deferred<EditorPersistOutcome>();
    const persist = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const { coordinator, drafts } = harness(persist, { debounceMs: 0 });
    drafts.value = {
      first: draft("第一份"),
      second: draft("第二份")
    };

    coordinator.schedule("first");
    coordinator.schedule("second");
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledTimes(1);

    firstSave.resolve("saved");
    await Promise.resolve();
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    secondSave.resolve("saved");
    await coordinator.drain();
  });

  it("flushes deferred reconciliation only after the serialized lane is quiet", async () => {
    vi.useFakeTimers();
    const firstSave = deferred<EditorPersistOutcome>();
    const persist = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce("saved");
    const onIdle = vi.fn(async () => undefined);
    const { coordinator, drafts } = harness(persist, {
      debounceMs: 0,
      onIdle
    });
    drafts.value = {
      first: draft("第一份"),
      second: draft("第二份")
    };

    coordinator.schedule("first");
    coordinator.schedule("second");
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledOnce();
    expect(onIdle).not.toHaveBeenCalled();

    firstSave.resolve("saved");
    await coordinator.drain();
    expect(persist).toHaveBeenCalledTimes(2);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("flushes deferred reconciliation when disabling auto-save cancels the last timer", async () => {
    vi.useFakeTimers();
    const onIdle = vi.fn(async () => undefined);
    const { coordinator, persist } = harness(undefined, { onIdle });
    coordinator.schedule("first");

    coordinator.cancel();
    await coordinator.drain();

    expect(persist).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("retries a temporary write barrier but pauses on a save conflict", async () => {
    vi.useFakeTimers();
    const blockedHarness = harness(undefined, {
      blocked: true,
      debounceMs: 0,
      retryMs: 50
    });
    blockedHarness.coordinator.schedule("first");
    await vi.advanceTimersByTimeAsync(0);
    expect(blockedHarness.persist).not.toHaveBeenCalled();
    blockedHarness.setBlocked(false);
    await vi.advanceTimersByTimeAsync(50);
    await blockedHarness.coordinator.drain();
    expect(blockedHarness.persist).toHaveBeenCalledOnce();

    const conflictHarness = harness(undefined, {
      conflicted: true,
      debounceMs: 0,
      retryMs: 50
    });
    conflictHarness.coordinator.schedule("first");
    await vi.runAllTimersAsync();
    expect(conflictHarness.persist).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requeues newer typing independently of the submitted outcome", async () => {
    vi.useFakeTimers();
    const firstSave = deferred<EditorPersistOutcome>();
    const persist = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce("saved");
    const { coordinator, drafts } = harness(persist, { debounceMs: 20 });

    coordinator.schedule("first");
    await vi.advanceTimersByTimeAsync(20);
    expect(persist).toHaveBeenCalledOnce();
    drafts.value = { first: draft("保存期间的新草稿 B") };
    firstSave.resolve("paused");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);
    await coordinator.drain();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(
      {
        id: "first",
        title: "测试标题",
        content: "保存期间的新草稿 B"
      },
      false
    );
  });

  it("retries an unchanged draft after a transient persistence failure", async () => {
    vi.useFakeTimers();
    const persist = vi
      .fn()
      .mockResolvedValueOnce("retry")
      .mockResolvedValueOnce("saved");
    const { coordinator } = harness(persist, {
      debounceMs: 20,
      retryMs: 10
    });

    coordinator.schedule("first");
    await vi.advanceTimersByTimeAsync(20);
    expect(persist).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10);
    await coordinator.drain();

    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("backs repeated transient failures off instead of polling at a fixed rate", async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async (): Promise<EditorPersistOutcome> => "retry");
    const { coordinator } = harness(persist, {
      debounceMs: 0,
      retryMs: 10,
      maxRetryMs: 25
    });

    coordinator.schedule("first");
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9);
    expect(persist).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(19);
    expect(persist).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(24);
    expect(persist).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(4);
    await coordinator.dispose();
  });

  it("cancels pending timers and waits for the active save on dispose", async () => {
    vi.useFakeTimers();
    const pendingSave = deferred<EditorPersistOutcome>();
    const persist = vi.fn(() => pendingSave.promise);
    const { coordinator } = harness(persist, { debounceMs: 0 });
    coordinator.schedule("first");
    await vi.advanceTimersByTimeAsync(0);
    coordinator.schedule("second", 100);

    let disposed = false;
    const disposing = coordinator.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    pendingSave.resolve("saved");
    await disposing;
    expect(disposed).toBe(true);
  });
});
