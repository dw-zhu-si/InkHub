import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface PostedWorkerRequest {
  id: number;
  operation: string;
}

interface FakeWorkerHarness {
  readonly posted: PostedWorkerRequest[];
  readonly terminate: ReturnType<typeof vi.fn>;
  emit(event: "message", message: unknown): boolean;
}

const workerMocks = vi.hoisted(() => ({
  instances: [] as FakeWorkerHarness[]
}));

vi.mock("node:worker_threads", async () => {
  const { EventEmitter: NodeEventEmitter } = await import("node:events");

  class FakeWorker extends NodeEventEmitter {
    readonly posted: PostedWorkerRequest[] = [];
    readonly terminate = vi.fn(async () => 0);

    constructor(_workerPath: string) {
      super();
      workerMocks.instances.push(this);
    }

    unref(): this {
      return this;
    }

    postMessage(message: PostedWorkerRequest): void {
      this.posted.push(message);
    }
  }

  return { Worker: FakeWorker };
});

import { InkHubQualityWorkerClient } from "./inkhub-quality-worker-client";

const READY_SUMMARY = {
  entryId: "novel-one",
  status: "ready" as const,
  documentCount: 1,
  indexedDocumentCount: 1,
  skippedDocumentCount: 0,
  chapterCount: 1,
  totalCharacters: 100,
  contentComplete: true,
  contentHash: "a".repeat(64),
  indexedAt: "2026-09-27T00:00:00.000Z",
  warnings: []
};

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}

describe("InkHubQualityWorkerClient queue boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    workerMocks.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not time out a queued read while a long build is still running", async () => {
    const client = new InkHubQualityWorkerClient("worker.js", "/tmp/indexes");
    const build = client.build({
      entryId: "novel-one",
      title: "测试小说",
      entryPath: "/tmp/novel-one"
    });
    void build.catch(() => undefined);
    const worker = workerMocks.instances[0]!;
    const buildRequest = worker.posted[0]!;
    worker.emit("message", { id: buildRequest.id, started: true });

    const progress = client.getProgress("novel-one");
    void progress.catch(() => undefined);
    const progressRequest = worker.posted[1]!;
    let progressSettled = false;
    void progress.then(
      () => { progressSettled = true; },
      () => { progressSettled = true; }
    );

    await vi.advanceTimersByTimeAsync(30_001);

    expect(progressSettled).toBe(false);
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.emit("message", { id: buildRequest.id, ok: true, result: READY_SUMMARY });
    worker.emit("message", { id: progressRequest.id, started: true });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(progressSettled).toBe(false);

    worker.emit("message", { id: progressRequest.id, ok: true, result: null });
    await expect(build).resolves.toMatchObject({ entryId: "novel-one", status: "ready" });
    await expect(progress).resolves.toBeNull();
  });

  it("starts the execution timeout only after the worker reports started", async () => {
    const client = new InkHubQualityWorkerClient("worker.js", "/tmp/indexes");
    const progress = client.getProgress("novel-one");
    void progress.catch(() => undefined);
    const worker = workerMocks.instances[0]!;
    const request = worker.posted[0]!;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.emit("message", { id: request.id, started: true });
    await vi.advanceTimersByTimeAsync(30_001);

    await expect(progress).rejects.toThrow(/超过安全时限/u);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects excess work with an explicit busy error instead of growing the queue", async () => {
    const client = new InkHubQualityWorkerClient("worker.js", "/tmp/indexes");
    const requests = Array.from({ length: 65 }, (_, index) =>
      client.summary(`novel-${index}`)
    );
    const worker = workerMocks.instances[0]!;
    await flushMicrotasks();

    for (const request of worker.posted) {
      worker.emit("message", { id: request.id, started: true });
      worker.emit("message", {
        id: request.id,
        ok: true,
        result: { ...READY_SUMMARY, entryId: `novel-${request.id - 1}` }
      });
    }
    const outcomes = await Promise.allSettled(requests);
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected"
    );

    expect(worker.posted).toHaveLength(64);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(Error);
    expect((rejected[0]!.reason as Error).message).toMatch(/繁忙.*64/u);
  });

  it("announces actual execution before awaiting the worker operation", () => {
    const source = readFileSync(new URL("./inkhub-quality-worker.ts", import.meta.url), "utf8");
    const queueStart = source.indexOf("operationChain = operationChain.then");
    const startedMessage = source.indexOf(
      "parentPort!.postMessage({ id: request.id, started: true });",
      queueStart
    );
    const handleCall = source.indexOf("await handle(request)", queueStart);

    expect(queueStart).toBeGreaterThanOrEqual(0);
    expect(startedMessage).toBeGreaterThan(queueStart);
    expect(handleCall).toBeGreaterThan(startedMessage);
  });
});
