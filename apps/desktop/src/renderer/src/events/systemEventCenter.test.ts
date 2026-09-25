import { describe, expect, it, vi } from "vitest";
import type { SystemEventEnvelope } from "@deepwrite/contracts";
import {
  createSystemEventCenter,
  type SystemEventListener
} from "./systemEventCenter";

type SystemReadyEvent = Extract<
  SystemEventEnvelope,
  { type: "system.ready" }
>;
type WorkerRestartedEvent = Extract<
  SystemEventEnvelope,
  { type: "system.worker_restarted" }
>;

function readyEvent(id: string): SystemReadyEvent {
  return {
    protocolVersion: 1,
    id,
    type: "system.ready",
    timestamp: "2026-08-14T00:00:00.000Z",
    context: { correlationId: id },
    payload: {
      status: "ok",
      checkedAt: "2026-08-14T00:00:00.000Z",
      workers: []
    }
  };
}

function workerRestartedEvent(id: string): WorkerRestartedEvent {
  return {
    protocolVersion: 1,
    id,
    type: "system.worker_restarted",
    timestamp: "2026-08-14T00:00:01.000Z",
    context: { correlationId: id },
    payload: {
      worker: "agent",
      reason: "test restart",
      restartedAt: "2026-08-14T00:00:01.000Z"
    }
  };
}

describe("systemEventCenter", () => {
  it("delivers typed and all-event subscriptions in global registration order", () => {
    const center = createSystemEventCenter();
    const calls: string[] = [];
    center.subscribeAll((event) => calls.push(`all-1:${event.id}`));
    center.subscribe("system.ready", (event) => {
      calls.push(`ready:${event.payload.checkedAt}`);
    });
    center.subscribeAll((event) => calls.push(`all-2:${event.id}`));
    center.subscribe("system.worker_restarted", (event) => {
      calls.push(`restart:${event.payload.worker}`);
    });

    center.publish(readyEvent("ready-1"));

    expect(calls).toEqual([
      "all-1:ready-1",
      "ready:2026-08-14T00:00:00.000Z",
      "all-2:ready-1"
    ]);
  });

  it("narrows typed listener events from the discriminant", () => {
    const center = createSystemEventCenter();
    const readyListener: SystemEventListener<"system.ready"> = (event) => {
      const checkedAt: string = event.payload.checkedAt;
      expect(checkedAt).toBe("2026-08-14T00:00:00.000Z");
    };

    center.subscribe("system.ready", readyListener);
    center.publish(readyEvent("ready-typed"));
  });

  it("unsubscribes idempotently and releases the listener from delivery", () => {
    const center = createSystemEventCenter();
    const listener = vi.fn();
    const unsubscribe = center.subscribeAll(listener);

    center.publish(readyEvent("before-unsubscribe"));
    unsubscribe();
    unsubscribe();
    center.publish(readyEvent("after-unsubscribe"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("skips a listener removed before its turn during publication", () => {
    const center = createSystemEventCenter();
    const calls: string[] = [];
    let removeSecond = (): void => {};
    center.subscribeAll(() => {
      calls.push("first");
      removeSecond();
    });
    removeSecond = center.subscribeAll(() => calls.push("second"));
    center.subscribeAll(() => calls.push("third"));

    center.publish(readyEvent("remove-during-publish"));

    expect(calls).toEqual(["first", "third"]);
  });

  it("defers listeners added during publication until the next event", () => {
    const center = createSystemEventCenter();
    const calls: string[] = [];
    let added = false;
    center.subscribeAll((event) => {
      calls.push(`first:${event.id}`);
      if (!added) {
        added = true;
        center.subscribeAll((nextEvent) => calls.push(`late:${nextEvent.id}`));
      }
    });

    center.publish(readyEvent("event-1"));
    center.publish(readyEvent("event-2"));

    expect(calls).toEqual([
      "first:event-1",
      "first:event-2",
      "late:event-2"
    ]);
  });

  it("isolates listener failures, reports context, and continues delivery", () => {
    const failure = new Error("listener failed");
    const onListenerError = vi.fn();
    const center = createSystemEventCenter({ onListenerError });
    const delivered = vi.fn();
    center.subscribe("system.ready", () => {
      throw failure;
    });
    center.subscribeAll(delivered);
    const event = readyEvent("failure-isolation");

    expect(() => center.publish(event)).not.toThrow();
    expect(delivered).toHaveBeenCalledWith(event);
    expect(onListenerError).toHaveBeenCalledWith(failure, {
      event,
      subscribedType: "system.ready"
    });
  });

  it("isolates an error callback that throws", () => {
    const center = createSystemEventCenter({
      onListenerError() {
        throw new Error("diagnostic callback failed");
      }
    });
    const delivered = vi.fn();
    center.subscribeAll(() => {
      throw new Error("listener failed");
    });
    center.subscribeAll(delivered);

    expect(() => center.publish(readyEvent("nested-failure"))).not.toThrow();
    expect(delivered).toHaveBeenCalledOnce();
  });

  it("clears subscriptions during publication without affecting later registrations", () => {
    const center = createSystemEventCenter();
    const calls: string[] = [];
    center.subscribeAll(() => {
      calls.push("clearer");
      center.clear();
    });
    center.subscribeAll(() => calls.push("cleared-before-turn"));

    center.publish(readyEvent("clear-current"));
    const later = vi.fn();
    center.subscribe("system.worker_restarted", later);
    center.publish(workerRestartedEvent("after-clear"));

    expect(calls).toEqual(["clearer"]);
    expect(later).toHaveBeenCalledWith(workerRestartedEvent("after-clear"));
  });

  it("does not let an old unsubscribe remove a registration created after clear", () => {
    const center = createSystemEventCenter();
    const oldUnsubscribe = center.subscribeAll(() => {});
    center.clear();
    const currentListener = vi.fn();
    center.subscribeAll(currentListener);

    oldUnsubscribe();
    center.publish(readyEvent("new-generation"));

    expect(currentListener).toHaveBeenCalledOnce();
  });
});
