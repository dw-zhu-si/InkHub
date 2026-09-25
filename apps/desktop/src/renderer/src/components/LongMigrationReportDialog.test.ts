import { describe, expect, it } from "vitest";
import source from "./LongMigrationReportDialog.vue?raw";

describe("LongMigrationReportDialog", () => {
  it("reports the conservative committed-chapter migration policy", () => {
    expect(source).toContain("已提交章已恢复为迁移检查点");
    expect(source).toContain("只读、不可逆的连续性检查点");
    expect(source).toContain("不会伪造成可回滚提交");
  });

  it("states that the legacy source is never modified", () => {
    expect(source).toContain("源文件保持不变");
    expect(source).toContain("独立的墨枢长篇项目");
    expect(source).not.toContain("独立的 DeepWrite 长篇项目");
    expect(source).toContain(
      "不会修改、覆盖或删除所选的旧版本源文件"
    );
  });

  it("renders every warning or a warning-free completion summary", () => {
    expect(source).toContain('v-if="warnings.length > 0"');
    expect(source).toContain(
      'v-for="(warning, index) in warnings"'
    );
    expect(source).toContain("{{ warning }}");
    expect(source).toContain(
      "没有需要额外留意的迁移提示"
    );
  });

  it("shows source metadata and exposes only a close event", () => {
    expect(source).toContain(
      'type LongMigrationSourceKind = LongImportWriteClawResult["sourceKind"]'
    );
    expect(source).toContain("legacySchemaVersion: number");
    expect(source).toContain("sourceLabels");
    expect(source).toContain("close: []");
    expect(source).not.toContain("confirm: []");
  });

  it("uses a teleported theme-aware compact dialog with a neutral button", () => {
    expect(source).toContain('<Teleport to="body">');
    expect(source).toContain('role="dialog"');
    expect(source).toContain("var(--surface-raised)");
    expect(source).toContain("var(--theme-line)");
    expect(source).toContain("background: var(--neutral-solid)");
    expect(source).toContain("max-height: calc(100vh - 28px)");
    expect(source).toContain("@media (max-height: 560px)");
  });
});
