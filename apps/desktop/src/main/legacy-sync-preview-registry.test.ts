import { describe, expect, it } from "vitest";
import { LegacySyncPreviewRegistry } from "./legacy-sync-preview-registry";

describe("LegacySyncPreviewRegistry", () => {
  it("binds previews to one renderer, expires them, and consumes them", () => {
    let now = 100;
    const registry = new LegacySyncPreviewRegistry(50, () => now);
    const preview = registry.register({
      webContentsId: 7,
      sourcePath: "/books/legacy.zip",
      sourceFingerprint: "a".repeat(64)
    });
    expect(registry.resolve(preview.previewId, 7).sourcePath).toBe("/books/legacy.zip");
    expect(() => registry.resolve(preview.previewId, 8)).toThrow("已失效");
    registry.consume(preview.previewId);
    expect(() => registry.resolve(preview.previewId, 7)).toThrow("已失效");

    const expiring = registry.register({
      webContentsId: 7,
      sourcePath: "/books/legacy.zip",
      sourceFingerprint: "b".repeat(64)
    });
    now = 151;
    expect(() => registry.resolve(expiring.previewId, 7)).toThrow("已失效");
  });
});
