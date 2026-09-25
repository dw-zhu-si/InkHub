import { describe, expect, it } from "vitest";
import dialogSource from "./LongLegacySyncDialog.vue?raw";
import appSource from "../WorkspaceShell.vue?raw";
import longBookLifecycleSource from "../composables/useLongBookLifecycleCoordinator.ts?raw";

describe("LongLegacySyncDialog", () => {
  it("defaults to every non-empty module and requires at least one selection", () => {
    expect(dialogSource).toContain('id: "worldbuilding"');
    expect(dialogSource).toContain('id: "characters"');
    expect(dialogSource).toContain('id: "plot"');
    expect(dialogSource).toContain(".filter(({ count }) => count > 0)");
    expect(dialogSource).toContain("selected.length === 0");
    expect(dialogSource).toContain("现有内容不会删除或覆盖");
  });

  it("emits cloneable selections and uses the shared dialog actions", () => {
    expect(dialogSource).toContain('emit("confirm", [...selected.value])');
    expect(dialogSource).toContain('class="dialog-actions"');
    expect(dialogSource).toContain('class="dialog-secondary-button"');
    expect(dialogSource).toContain('class="dialog-primary-button"');
    expect(dialogSource).not.toContain('class="modal-actions"');
  });

  it("uses the protected preview and transactional commit APIs", () => {
    expect(appSource).toContain('@confirm-legacy-sync="confirmLegacySync"');
    expect(longBookLifecycleSource).toContain("api.chooseLegacySyncSource()");
    expect(longBookLifecycleSource).toContain("api.applyLegacySync({");
    expect(longBookLifecycleSource).toContain(
      "expectedProjectRevision: summary.projectRevision"
    );
    expect(longBookLifecycleSource).toContain("modules: [...modules]");
    expect(longBookLifecycleSource).toContain(
      "await session.saveActiveEditorChanges()"
    );
    expect(longBookLifecycleSource).toContain(
      "await session.refreshActiveWorkspace(bookId)"
    );
  });
});
