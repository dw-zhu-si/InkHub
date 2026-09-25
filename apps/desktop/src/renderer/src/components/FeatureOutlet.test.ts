import { describe, expect, it } from "vitest";
import source from "./FeatureOutlet.vue?raw";

describe("FeatureOutlet", () => {
  it("provides one active feature boundary without retaining hidden pages", () => {
    expect(source).toContain("activeFeature: string");
    expect(source).toContain(':active-feature="activeFeature"');
    expect(source).not.toContain("KeepAlive");
    expect(source).not.toContain("v-show");
  });
});
