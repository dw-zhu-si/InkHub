import { describe, expect, it } from "vitest";
import chapterCardDialogSource from "./CreateLongChapterCardDialog.vue?raw";
import deleteDraftSectionDialogSource from "./DeleteLongDraftSectionDialog.vue?raw";
import characterDialogSource from "./CreateLongCharacterDialog.vue?raw";
import plotPointDialogSource from "./CreateLongPlotPointDialog.vue?raw";
import worldbuildingItemDialogSource from "./CreateLongWorldbuildingItemDialog.vue?raw";
import volumeDialogSource from "./CreateLongVolumeDialog.vue?raw";
import removalDialogSource from "./LongBookRemovalDialog.vue?raw";
import migrationDialogSource from "./LongMigrationReportDialog.vue?raw";
import plotManagerSource from "./LongPlotStructureManager.vue?raw";
import rollbackDialogSource from "./LongRollbackDialog.vue?raw";
import structureDialogSource from "./LongStructureDialog.vue?raw";
import structureManagerSource from "./LongStructureManager.vue?raw";
import workspaceEditorSource from "./LongWorkspaceEditor.vue?raw";

describe("long-form dialog backdrops", () => {
  it("reuse the same backdrop treatment as short-form dialogs", () => {
    for (const source of [
      chapterCardDialogSource,
      deleteDraftSectionDialogSource,
      characterDialogSource,
      plotPointDialogSource,
      worldbuildingItemDialogSource,
      volumeDialogSource,
      removalDialogSource,
      migrationDialogSource,
      plotManagerSource,
      rollbackDialogSource,
      structureDialogSource,
      structureManagerSource,
      workspaceEditorSource
    ]) {
      expect(source).toMatch(/class="dialog-backdrop [^"]+"/);
      expect(source).not.toContain("backdrop-filter:");
    }
  });

  it("suspends the parent structure dialog while its child modal owns focus", () => {
    expect(structureDialogSource).toContain("const childModalActive = ref(false)");
    expect(structureDialogSource).toContain('@modal-active-change="childModalActive = $event"');
    expect(structureDialogSource).toContain(":role=\"childModalActive ? undefined : 'dialog'\"");
    expect(structureDialogSource).toContain(".long-structure-dialog.is-suspended");
  });
});
