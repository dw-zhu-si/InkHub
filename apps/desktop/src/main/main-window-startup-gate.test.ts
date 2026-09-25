import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createMainWindowStartupGate } from "./main-window-startup-gate";

describe("main window startup gate", () => {
  it("coalesces early show requests until startup is ready", () => {
    const showMainWindow = vi.fn();
    const gate = createMainWindowStartupGate(showMainWindow);

    gate.requestShow();
    gate.requestShow();
    expect(showMainWindow).not.toHaveBeenCalled();

    gate.markReady();
    expect(showMainWindow).toHaveBeenCalledOnce();

    gate.requestShow();
    expect(showMainWindow).toHaveBeenCalledTimes(2);
  });

  it("does not create a window merely because startup became ready", () => {
    const showMainWindow = vi.fn();
    const gate = createMainWindowStartupGate(showMainWindow);

    gate.markReady();
    gate.markReady();
    expect(showMainWindow).not.toHaveBeenCalled();
  });

  it("marks the gate ready only after IPC registration and initial window creation", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const startup = source.slice(source.indexOf("const hasSingleInstanceLock"));
    const registerIpcIndex = startup.indexOf("registerIpc();");
    const createWindowIndex = startup.indexOf("mainWindow = createMainWindow();");
    const markReadyIndex = startup.indexOf("mainWindowStartupGate.markReady();");

    expect(startup).toContain(
      'app.on("second-instance", () => {\n    mainWindowStartupGate.requestShow();'
    );
    expect(registerIpcIndex).toBeGreaterThanOrEqual(0);
    expect(createWindowIndex).toBeGreaterThan(registerIpcIndex);
    expect(markReadyIndex).toBeGreaterThan(createWindowIndex);
  });
});
