import { describe, expect, it } from "vitest";
import source from "./LongBookRemovalDialog.vue?raw";

describe("LongBookRemovalDialog", () => {
  it("clearly distinguishes unregister from permanent folder deletion", () => {
    expect(source).toContain(
      "只会取消该长篇在当前创作空间中的登记"
    );
    expect(source).toContain("不会删除磁盘上的项目文件夹");
    expect(source).toContain("永久删除整个长篇项目文件夹");
    expect(source).toContain("此操作不可恢复");
    expect(source).toContain("打开已有作品");
  });

  it("uses danger styling only when the action is delete", () => {
    expect(source).toContain(
      'const isDelete = computed(() => props.action === "delete")'
    );
    expect(source).toContain(
      'class="long-removal-primary"'
    );
    expect(source).toContain(
      ':class="{ \'is-danger\': isDelete }"'
    );
    expect(source).toContain(
      ".long-removal-primary.is-danger"
    );
    expect(source).toContain("background: var(--neutral-solid)");
    expect(source).toContain("background: var(--danger)");
  });

  it("is teleported, modal, theme-aware and compact-window safe", () => {
    expect(source).toContain('<Teleport to="body">');
    expect(source).toContain('role="alertdialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain(
      'aria-describedby="long-removal-dialog-description"'
    );
    expect(source).toContain('ref="dialogElement"');
    expect(source).toContain("focusableElements()");
    expect(source).toContain("previousFocus");
    expect(source).toContain("var(--surface-raised)");
    expect(source).toContain("var(--theme-line)");
    expect(source).toContain("max-height: calc(100vh - 28px)");
    expect(source).toContain("@media (max-height: 520px)");
  });

  it("exposes close and confirm events and blocks dismissal while pending", () => {
    expect(source).toContain("close: []");
    expect(source).toContain("confirm: []");
    expect(source).toContain(
      'function close(): void {\n  if (!props.pending) emit("close");\n}'
    );
    expect(source).toContain('@mousedown.self="close"');
    expect(source).toContain(':disabled="pending"');
  });
});
