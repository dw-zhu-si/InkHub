import { describe, expect, it } from "vitest";
import source from "./ui-feedback.ts?raw";
import hostSource from "./components/ToastHost.vue?raw";

describe("ui-feedback", () => {
  it("keeps global floating messages lightweight and centered at the top", () => {
    expect(source).toContain("const MAX_VISIBLE_MESSAGES = 3");
    expect(source).toContain("export const uiMessage = {");
    expect(source).not.toContain("naive-ui");
    expect(source).not.toContain("createDiscreteApi");
    expect(hostSource).toContain('<Teleport to="body">');
    expect(hostSource).toContain("position: fixed");
    expect(hostSource).toContain("left: 50%");
    expect(hostSource).toContain("var(--surface-raised)");
  });
});
