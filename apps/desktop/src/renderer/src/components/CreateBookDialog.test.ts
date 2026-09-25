import { describe, expect, it } from "vitest";
import source from "./CreateBookDialog.vue?raw";

describe("CreateBookDialog shared libraries", () => {
  it("offers one material and skill pool to short, script, and long books", () => {
    expect(source).toContain("const workspaceMaterials = computed(() => props.materials)");
    expect(source).toContain("const workspaceSkills = computed(() => props.skills)");
    expect(source).not.toContain("material.materialType === workspaceType.value");
    expect(source).not.toContain("skill.skillType === workspaceType.value");
    expect(source).toContain("linkedMaterialIdsByKind");
    expect(source).toContain("linkedSkillIdsByKind");
  });
});
