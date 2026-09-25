import { createId } from "@deepwrite/shared";

export interface ContinuationImportPreviewRegistration {
  webContentsId: number;
  sourcePath: string;
  sourceFingerprint: string;
  expiresAt: number;
}

export class ContinuationImportPreviewRegistry {
  private readonly entries = new Map<
    string,
    ContinuationImportPreviewRegistration
  >();

  constructor(
    private readonly ttlMs = 30 * 60 * 1_000,
    private readonly now: () => number = Date.now
  ) {}

  register(input: {
    webContentsId: number;
    sourcePath: string;
    sourceFingerprint: string;
  }): { previewId: string; expiresAt: number } {
    const now = this.now();
    for (const [previewId, registration] of this.entries) {
      if (
        registration.expiresAt <= now ||
        registration.webContentsId === input.webContentsId
      ) {
        this.entries.delete(previewId);
      }
    }
    const previewId = createId("continuation-preview");
    const expiresAt = now + this.ttlMs;
    this.entries.set(previewId, { ...input, expiresAt });
    return { previewId, expiresAt };
  }

  resolve(
    previewId: string,
    webContentsId: number
  ): ContinuationImportPreviewRegistration {
    const registration = this.entries.get(previewId);
    if (!registration) {
      throw new Error("续写导入预览已失效，请重新选择文件夹。");
    }
    if (registration.expiresAt <= this.now()) {
      this.entries.delete(previewId);
      throw new Error("续写导入预览已失效，请重新选择文件夹。");
    }
    if (registration.webContentsId !== webContentsId) {
      throw new Error("续写导入预览已失效，请重新选择文件夹。");
    }
    return registration;
  }

  consume(previewId: string): void {
    this.entries.delete(previewId);
  }

  clearForWebContents(webContentsId: number): void {
    for (const [previewId, registration] of this.entries) {
      if (registration.webContentsId === webContentsId) {
        this.entries.delete(previewId);
      }
    }
  }
}
