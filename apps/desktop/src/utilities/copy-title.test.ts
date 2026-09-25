import { describe, expect, it } from "vitest";
import { nextCopyTitle } from "./copy-title";

describe("nextCopyTitle", () => {
  it("increments copy suffixes across originals and existing copies", () => {
    expect(nextCopyTitle("项目", [])).toBe("项目copy1");
    expect(nextCopyTitle("项目", ["项目copy1"])).toBe("项目copy2");
    expect(nextCopyTitle("项目copy1", ["项目copy1", "项目copy2"])).toBe(
      "项目copy3"
    );
    expect(nextCopyTitle("项目copy3", ["项目copy3"])).toBe("项目copy4");
  });

  it("compares NFC and case-insensitively and preserves the suffix limit", () => {
    expect(nextCopyTitle("Café", ["CaféCOPY1"])).toBe("Cafécopy2");
    const result = nextCopyTitle("长".repeat(256), []);
    expect([...result]).toHaveLength(256);
    expect(result.endsWith("copy1")).toBe(true);
  });
});
