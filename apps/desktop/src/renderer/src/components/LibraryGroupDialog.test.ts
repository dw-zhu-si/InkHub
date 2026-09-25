import { describe, expect, it } from "vitest";
import source from "./LibraryGroupDialog.vue?raw";

describe("LibraryGroupDialog default library option", () => {
  it("offers creating a default library when existing ones are unavailable", () => {
    expect(source).toContain('label: "＋ 新建默认库"');
    expect(source).toContain("CREATE_DEFAULT_LIBRARY_VALUE");
    expect(source).toContain("catalog.createLibrary");
    expect(source).toContain("也可以选择「新建默认库」当场创建");
  });

  it("supports both material and skill kind labels for default names", () => {
    expect(source).toContain("人设素材库");
    expect(source).toContain("通用技能库");
    expect(source).toContain("defaultLibraryName");
  });

  it("allows updating a group's name together with its bindings", () => {
    expect(source).toContain('title: name');
    expect(source).toContain('editing ? "编辑分组" : "新建分组"');
    expect(source).toContain('v-model="title"');
  });

  it("groups libraries without separating them by historical writing type", () => {
    expect(source).not.toContain('library.materialType === "short"');
    expect(source).not.toContain('library.skillType === "short"');
  });
});
