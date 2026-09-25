import { createId } from "@deepwrite/shared";

export interface LegacySyncPreviewRegistration {
  webContentsId: number;
  sourcePath: string;
  sourceFingerprint: string;
  expiresAt: number;
}

export class LegacySyncPreviewRegistry {
  private readonly entries = new Map<string, LegacySyncPreviewRegistration>();

  constructor(
    private readonly ttlMs = 30 * 60 * 1_000,
    private readonly now: () => number = Date.now
  ) {}

  register(input: Omit<LegacySyncPreviewRegistration, "expiresAt">): {
    previewId: string;
    expiresAt: number;
  } {
    const now = this.now();
    for (const [previewId, registration] of this.entries) {
      if (registration.expiresAt <= now || registration.webContentsId === input.webContentsId) {
        this.entries.delete(previewId);
      }
    }
    const previewId = createId("legacy-sync-preview");
    const expiresAt = now + this.ttlMs;
    this.entries.set(previewId, { ...input, expiresAt });
    return { previewId, expiresAt };
  }

  resolve(previewId: string, webContentsId: number): LegacySyncPreviewRegistration {
    const registration = this.entries.get(previewId);
    if (!registration || registration.expiresAt <= this.now() || registration.webContentsId !== webContentsId) {
      this.entries.delete(previewId);
      throw new Error("旧版本同步预览已失效，请重新选择压缩包。");
    }
    return registration;
  }

  consume(previewId: string): void {
    this.entries.delete(previewId);
  }

  clearForWebContents(webContentsId: number): void {
    for (const [previewId, registration] of this.entries) {
      if (registration.webContentsId === webContentsId) this.entries.delete(previewId);
    }
  }
}
