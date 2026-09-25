import { describe, expect, it } from "vitest";
import source from "./LibraryProjectDialog.vue?raw";

describe("LibraryProjectDialog create-library form", () => {
  it("submits the material or skill classification into the shared library pool", () => {
    expect(source).toContain("materialKind: libraryKind.value");
    expect(source).toContain("skillKind: libraryKind.value");
    expect(source).not.toContain("libraryType: libraryType.value");
    expect(source).not.toContain("适用创作类型");
    expect(source).toContain("此资料库由短篇、剧本和长篇共用");
    expect(source).toContain("通用技能库");
    expect(source).not.toContain('{ value: "mixed", label: "综合素材库" }');
  });

  it("uses the configured workspace directory without offering another location step", () => {
    expect(source).toContain("新资料库会自动保存在当前工作目录中，无需再次选择目录。");
    expect(source).not.toContain("下一步会选择保存位置");
    expect(source).not.toContain("选择位置并创建");
  });
});

describe("LibraryProjectDialog create-entry form", () => {
  it("only asks for a name when creating skill entries", () => {
    expect(source).toContain('domain: "skill"');
    expect(source).toContain("title: normalizedTitle");
    expect(source).toContain(
      '() => props.operation === "create-entry" && props.domain === "material"'
    );
    expect(source).toContain('v-if="showEntryStageField"');
    expect(source).not.toContain("stageId: stageId.value as SkillStageId");
    expect(source).not.toContain('{ value: "character_design", label: "人物设计" }');
  });

  it("keeps all material stages available because libraries are shared", () => {
    expect(source).not.toContain("effectiveLibraryType");
    expect(source).toContain('{ value: "intro", label: "导语设计" }');
  });
});
