import { beforeEach, describe, expect, it, vi } from "vitest";

const updaterMocks = vi.hoisted(() => {
  const listeners = new Map<string, (payload?: unknown) => void>();
  return {
    listeners,
    on: vi.fn((event: string, listener: (payload?: unknown) => void) => {
      listeners.set(event, listener);
    }),
    quitAndInstall: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    setFeedURL: vi.fn(),
    netFetch: vi.fn()
  };
});

vi.mock("electron", () => ({
  app: {
    getVersion: () => "1.0.0",
    isPackaged: true
  },
  net: {
    fetch: updaterMocks.netFetch
  }
}));

vi.mock("electron-updater", () => ({
  autoUpdater: updaterMocks
}));

import { UpdateService } from "./update-service";

describe("UpdateService install handoff", () => {
  beforeEach(() => {
    updaterMocks.listeners.clear();
    updaterMocks.on.mockClear();
    updaterMocks.quitAndInstall.mockClear();
    updaterMocks.checkForUpdates.mockClear();
    updaterMocks.netFetch.mockClear();
  });

  it("不访问上游服务并明确返回未配置状态", async () => {
    const service = new UpdateService(() => undefined);

    await expect(service.check()).resolves.toMatchObject({
      status: "unsupported",
      currentVersion: "1.0.0",
      canDownload: false,
      canInstall: false,
      message: "墨枢当前未配置更新源"
    });
    expect(updaterMocks.netFetch).not.toHaveBeenCalled();
    expect(updaterMocks.checkForUpdates).not.toHaveBeenCalled();
  });

  it("publishes an installing state before requesting application shutdown", () => {
    const states: string[] = [];
    const requestInstall = vi.fn(() => {
      states.push(service.getState().status);
    });
    const service = new UpdateService(requestInstall);
    service.subscribe((state) => states.push(state.status));

    updaterMocks.listeners.get("update-downloaded")?.();
    service.install();

    expect(requestInstall).toHaveBeenCalledOnce();
    expect(states).toContain("downloaded");
    expect(states.at(-2)).toBe("installing");
    expect(states.at(-1)).toBe("installing");
    expect(service.getState()).toMatchObject({
      status: "installing",
      canDownload: false,
      canInstall: false
    });
  });

  it("keeps the downloaded update retryable if handoff fails synchronously", () => {
    const service = new UpdateService(() => {
      throw new Error("handoff failed");
    });
    updaterMocks.listeners.get("update-downloaded")?.();

    expect(() => service.install()).toThrow("handoff failed");
    expect(service.getState()).toMatchObject({
      status: "error",
      canDownload: false,
      canInstall: true,
      message: "handoff failed"
    });
  });

  it("keeps installation retryable when the native updater reports an error", () => {
    const service = new UpdateService(() => undefined);
    updaterMocks.listeners.get("update-downloaded")?.();
    service.install();

    updaterMocks.listeners.get("error")?.(new Error("native install failed"));

    expect(service.getState()).toMatchObject({
      status: "error",
      canDownload: false,
      canInstall: true,
      message: "native install failed"
    });
  });
});
