import { describe, expect, it } from "vitest";
import {
  CATALOG_INTERACTIVE_COMMAND_TIMEOUT_MS,
  catalogCommandTimeoutMessage,
  catalogCommandTimeoutMs
} from "./catalog-command-timeout";

describe("catalog command timeout", () => {
  it("bounds editor index, reads, saves, and compatibility snapshots at 60 seconds", () => {
    expect(CATALOG_INTERACTIVE_COMMAND_TIMEOUT_MS).toBe(60_000);
    expect(catalogCommandTimeoutMs("catalog.saveDocument")).toBe(60_000);
    expect(catalogCommandTimeoutMs("catalog.snapshot")).toBe(60_000);
    expect(catalogCommandTimeoutMs("catalog.index")).toBe(60_000);
    expect(catalogCommandTimeoutMs("catalog.readDocument")).toBe(60_000);
  });

  it("leaves potentially long catalog operations on their existing policy", () => {
    expect(catalogCommandTimeoutMs("catalog.duplicateProject")).toBe(0);
    expect(catalogCommandTimeoutMs("catalog.deleteProject")).toBe(0);
  });

  it("warns that a timed-out save can have an ambiguous disk result", () => {
    expect(catalogCommandTimeoutMessage("catalog.saveDocument")).toContain(
      "保存结果尚未确认"
    );
    expect(catalogCommandTimeoutMessage("catalog.snapshot")).toContain(
      "检查项目所在磁盘"
    );
    expect(catalogCommandTimeoutMessage("catalog.index")).toContain(
      "检查项目所在磁盘"
    );
    expect(catalogCommandTimeoutMessage("catalog.readDocument")).toContain(
      "检查项目所在磁盘"
    );
  });
});
