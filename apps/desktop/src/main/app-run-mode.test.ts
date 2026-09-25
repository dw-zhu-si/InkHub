import { describe, expect, it } from "vitest";
import { resolveDeepWriteAppMode } from "./app-run-mode";

describe("resolveDeepWriteAppMode", () => {
  it("defaults missing and unsupported values to runtime mode", () => {
    expect(resolveDeepWriteAppMode(undefined)).toBe("runtime");
    expect(resolveDeepWriteAppMode("")).toBe("runtime");
    expect(resolveDeepWriteAppMode("unexpected")).toBe("runtime");
  });

  it("enables evaluation capture only for an explicit evaluation value", () => {
    expect(resolveDeepWriteAppMode("evaluation")).toBe("evaluation");
    expect(resolveDeepWriteAppMode(" Evaluation ")).toBe("evaluation");
    expect(resolveDeepWriteAppMode("runtime")).toBe("runtime");
  });
});
