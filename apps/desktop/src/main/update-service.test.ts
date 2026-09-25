import { describe, expect, it } from "vitest";
import { compareVersions } from "./update-version";

describe("compareVersions", () => {
  it("compares stable semantic versions", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.1.9", "1.2.0")).toBeLessThan(0);
  });

  it("orders prereleases before stable releases", () => {
    expect(compareVersions("1.2.0-beta.2", "1.2.0-beta.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0-beta.1", "1.2.0")).toBeLessThan(0);
  });
});
