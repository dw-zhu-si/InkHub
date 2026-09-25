import { describe, expect, it } from "vitest";
import source from "./StartupAlertDialog.vue?raw";

describe("StartupAlertDialog", () => {
  it("renders remote messages as plain text in a centered themed modal", () => {
    expect(source).toContain('<Teleport to="body">');
    expect(source).toContain('class="dialog-backdrop startup-alert-backdrop"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain("{{ messages[0] }}");
    expect(source).toContain('v-for="(message, index) in messages.slice(1)"');
    expect(source).toContain("{{ message }}");
    expect(source).not.toContain("v-html");
    expect(source).toContain("var(--surface-raised)");
  });

  it("gives the lead announcement more emphasis than the supporting messages", () => {
    expect(source).toContain('class="startup-alert-lead"');
    expect(source).toContain("本次公告");
    expect(source).toContain('class="startup-alert-list"');
    expect(source).toContain('class="startup-alert-index"');
    expect(source).toContain("linear-gradient(");
  });

  it("requires an explicit close action before acknowledging the reminder", () => {
    expect(source).toContain("我知道了");
    expect(source).toContain("@click=\"emit('close')\"");
    expect(source).not.toContain("@mousedown.self");
  });
});
