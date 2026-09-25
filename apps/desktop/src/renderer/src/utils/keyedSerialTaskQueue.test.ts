import { describe, expect, it } from "vitest";
import { createKeyedSerialTaskQueue } from "./keyedSerialTaskQueue";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("keyed serial task queue", () => {
  it("serializes saves for one workspace", async () => {
    const queue = createKeyedSerialTaskQueue<string>();
    const firstGate = deferred();
    const order: string[] = [];

    const first = queue.enqueue("book-1", async () => {
      order.push("v1-start");
      await firstGate.promise;
      order.push("v1-end");
    });
    const second = queue.enqueue("book-1", async () => {
      order.push("v2");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["v1-start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(["v1-start", "v1-end", "v2"]);
    expect(queue.isPending("book-1")).toBe(false);
  });

  it("allows different workspaces to save independently", async () => {
    const queue = createKeyedSerialTaskQueue<string>();
    const firstGate = deferred();
    const order: string[] = [];

    const first = queue.enqueue("book-1", async () => {
      order.push("book-1-start");
      await firstGate.promise;
      order.push("book-1-end");
    });
    const other = queue.enqueue("book-2", async () => {
      order.push("book-2");
    });

    await other;
    expect(order).toEqual(["book-1-start", "book-2"]);
    firstGate.resolve();
    await first;
  });

  it("continues after an earlier task fails", async () => {
    const queue = createKeyedSerialTaskQueue<string>();
    const failed = queue.enqueue("book-1", async () => {
      throw new Error("disk unavailable");
    });
    const order: string[] = [];
    const recovered = queue.enqueue("book-1", async () => {
      order.push("recovered");
    });

    await expect(failed).rejects.toThrow("disk unavailable");
    await recovered;
    expect(order).toEqual(["recovered"]);
  });
});
