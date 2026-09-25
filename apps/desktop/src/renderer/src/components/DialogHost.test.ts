import { describe, expect, it } from "vitest";
import source from "./DialogHost.vue?raw";

describe("DialogHost", () => {
  it("does not create dialog content while no dialog is active", () => {
    expect(source).toContain("activeDialog: string | null");
    expect(source).toContain('v-if="activeDialog"');
    expect(source).not.toContain("KeepAlive");
    expect(source).not.toContain("v-show");
  });
});
