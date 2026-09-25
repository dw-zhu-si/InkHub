import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnvelope } from "@deepwrite/contracts";
import { bootUtility } from "./runtime";

class FakeParentPort extends EventEmitter {
  readonly posted: unknown[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  dispatch(message: unknown): void {
    this.emit("message", { data: message });
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe("utility runtime internal command bridge", () => {
  let port: FakeParentPort;
  let originalParentPort: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    port = new FakeParentPort();
    originalParentPort = Object.getOwnPropertyDescriptor(process, "parentPort");
    Object.defineProperty(process, "parentPort", {
      configurable: true,
      value: port
    });
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    port.removeAllListeners();
    if (originalParentPort) {
      Object.defineProperty(process, "parentPort", originalParentPort);
    } else {
      Reflect.deleteProperty(process, "parentPort");
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("lets an agent handler await a correlated Core command result", async () => {
    const outerCommand = createEnvelope(
      "system.health",
      {},
      { id: "outer_runtime_command" }
    );
    const internalCommand = createEnvelope(
      "system.health",
      {},
      { id: "internal_runtime_command" }
    );

    bootUtility("agent", {
      commandHandler: async (command, _emitEvent, context) => {
        const internalResult = await context!.requestInternalCommand(
          "core",
          internalCommand,
          { timeoutMs: 1_000 }
        );
        return {
          status: "accepted",
          requestId: command.id,
          payload: internalResult
        };
      }
    });

    port.dispatch({
      kind: "utility.command.request",
      requestId: outerCommand.id,
      command: outerCommand
    });
    await flushMicrotasks();

    const internalRequest = port.posted.find(
      (message) =>
        (message as { kind?: string }).kind ===
        "utility.internal.command.request"
    ) as
      | {
          requestId: string;
          parentRequestId: string;
          target: "core";
        }
      | undefined;
    expect(internalRequest).toMatchObject({
      parentRequestId: outerCommand.id,
      target: "core"
    });

    port.dispatch({
      kind: "utility.internal.command.result",
      worker: "agent",
      target: "core",
      requestId: internalRequest!.requestId,
      parentRequestId: outerCommand.id,
      result: {
        status: "accepted",
        requestId: internalCommand.id,
        payload: { reachable: true }
      }
    });
    await flushMicrotasks();

    expect(port.posted).toContainEqual(
      expect.objectContaining({
        kind: "utility.command.result",
        requestId: outerCommand.id,
        result: {
          status: "accepted",
          requestId: outerCommand.id,
          payload: {
            status: "accepted",
            requestId: internalCommand.id,
            payload: { reachable: true }
          }
        }
      })
    );
  });

  it("times out an unanswered internal command without leaking the outer handler", async () => {
    const outerCommand = createEnvelope(
      "system.health",
      {},
      { id: "outer_timeout_command" }
    );
    const internalCommand = createEnvelope(
      "system.health",
      {},
      { id: "internal_timeout_command" }
    );

    bootUtility("agent", {
      commandHandler: async (command, _emitEvent, context) => ({
        status: "accepted",
        requestId: command.id,
        payload: await context!.requestInternalCommand(
          "tool",
          internalCommand,
          { timeoutMs: 10 }
        )
      })
    });

    port.dispatch({
      kind: "utility.command.request",
      requestId: outerCommand.id,
      command: outerCommand
    });
    await vi.advanceTimersByTimeAsync(260);
    await flushMicrotasks();

    expect(port.posted).toContainEqual(
      expect.objectContaining({
        kind: "utility.command.result",
        requestId: outerCommand.id,
        result: expect.objectContaining({
          status: "accepted",
          payload: expect.objectContaining({
            status: "rejected",
            requestId: internalCommand.id,
            error: expect.objectContaining({
              code: "utility.internal_command_timeout"
            })
          })
        })
      })
    );
  });

  it("settles pending internal commands before acknowledging shutdown", async () => {
    const outerCommand = createEnvelope(
      "system.health",
      {},
      { id: "outer_shutdown_command" }
    );
    const internalCommand = createEnvelope(
      "system.health",
      {},
      { id: "internal_shutdown_command" }
    );

    bootUtility("agent", {
      commandHandler: async (command, _emitEvent, context) => ({
        status: "accepted",
        requestId: command.id,
        payload: await context!.requestInternalCommand(
          "core",
          internalCommand,
          { timeoutMs: 30_000 }
        )
      })
    });

    port.dispatch({
      kind: "utility.command.request",
      requestId: outerCommand.id,
      command: outerCommand
    });
    await flushMicrotasks();
    port.dispatch({
      kind: "utility.shutdown",
      requestId: "shutdown_runtime"
    });
    await flushMicrotasks();

    expect(port.posted).toContainEqual(
      expect.objectContaining({
        kind: "utility.command.result",
        requestId: outerCommand.id,
        result: expect.objectContaining({
          payload: expect.objectContaining({
            status: "rejected",
            requestId: internalCommand.id,
            error: expect.objectContaining({
              code: "utility.internal_command_cancelled"
            })
          })
        })
      })
    );
    expect(port.posted).toContainEqual(
      expect.objectContaining({
        kind: "utility.shutdown_ack",
        requestId: "shutdown_runtime"
      })
    );
  });
});
