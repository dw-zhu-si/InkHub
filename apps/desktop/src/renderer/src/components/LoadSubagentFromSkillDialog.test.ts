import { describe, expect, it } from "vitest";
import source from "./LoadSubagentFromSkillDialog.vue?raw";

describe("LoadSubagentFromSkillDialog", () => {
  it("keeps generation controls and progress feedback from shifting the form", () => {
    expect(source).toContain('class="secondary-button authoring-stop-button"');
    expect(source).toContain(":class=\"{ 'is-placeholder': !generating }\"");
    expect(source).toContain('class="authoring-status-slot"');
    expect(source).toContain("height: 2.65rem;");
    expect(source).not.toContain('v-if="generating"\n                type="button"');
  });

  it("routes generation errors through floating feedback", () => {
    expect(source).toContain("uiMessage.error(error)");
    expect(source).not.toContain('class="error-text"');
  });
});
