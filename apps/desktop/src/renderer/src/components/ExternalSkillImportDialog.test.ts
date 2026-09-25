import { describe, expect, it } from "vitest";
import source from "./ExternalSkillImportDialog.vue?raw";
import treeSource from "./TreeNodeItem.vue?raw";
import libraryTransactionsSource from "../composables/useCatalogLibraryTransactionsCoordinator.ts?raw";

describe("external skill import UI", () => {
  it("offers directory and SKILL.md choices for a concrete target library", () => {
    expect(source).toContain("选择 skills 文件夹");
    expect(source).toContain("选择 SKILL.md");
    expect(source).toContain("libraryTitle");
    expect(source).toContain("emit('choose', 'directory')");
    expect(source).toContain("emit('choose', 'file')");
  });

  it("shows the action only for writable skill libraries", () => {
    expect(treeSource).toContain("从其他 skills 加载");
    expect(treeSource).toContain("libraryDomain === 'skill' && !node.readOnly && !node.unavailable");
    expect(treeSource).toContain("activateResourceNodeAction('import-external-skills')");
  });

  it("imports through the selected library and preserves complete content", () => {
    expect(libraryTransactionsSource).toContain(
      "api.chooseExternalSkills(sourceKind)"
    );
    expect(libraryTransactionsSource).toContain("content: candidate.content");
    expect(libraryTransactionsSource).toContain(
      "externalSkillStageId(library.skillKind)"
    );
  });
});
