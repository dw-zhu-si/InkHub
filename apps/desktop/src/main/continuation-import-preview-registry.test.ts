import { describe, expect, it } from "vitest";
import { ContinuationImportPreviewRegistry } from "./continuation-import-preview-registry";

describe("ContinuationImportPreviewRegistry", () => {
  it("scopes previews to one renderer and consumes them explicitly", () => {
    const registry = new ContinuationImportPreviewRegistry(1_000, () => 100);
    const preview = registry.register({
      webContentsId: 7,
      sourcePath: "/books/source",
      sourceFingerprint: "a".repeat(64)
    });
    expect(registry.resolve(preview.previewId, 7).sourcePath).toBe(
      "/books/source"
    );
    expect(() => registry.resolve(preview.previewId, 8)).toThrow("已失效");
    expect(registry.resolve(preview.previewId, 7).sourcePath).toBe(
      "/books/source"
    );
    expect(() => registry.resolve("forged", 7)).toThrow("已失效");
  });

  it("expires previews and replaces a previous preview from the same renderer", () => {
    let now = 100;
    const registry = new ContinuationImportPreviewRegistry(50, () => now);
    const first = registry.register({
      webContentsId: 7,
      sourcePath: "/books/first",
      sourceFingerprint: "a".repeat(64)
    });
    const second = registry.register({
      webContentsId: 7,
      sourcePath: "/books/second",
      sourceFingerprint: "b".repeat(64)
    });
    expect(() => registry.resolve(first.previewId, 7)).toThrow("已失效");
    now = 151;
    expect(() => registry.resolve(second.previewId, 7)).toThrow("已失效");
  });
});
