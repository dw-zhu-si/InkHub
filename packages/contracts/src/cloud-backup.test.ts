import { describe, expect, it } from "vitest";
import {
  CLOUD_BACKUP_QUOTA_BYTES,
  CloudBackupIpcRequestSchema,
  CloudBackupMachineKeySchema,
  CloudBackupPreviewSchema,
  CloudBackupStatusSchema
} from "./cloud-backup";

describe("cloud backup contracts", () => {
  it("accepts a well-formed machine key and rejects obvious invalid values", () => {
    expect(CloudBackupMachineKeySchema.parse("DW-ABCD-2345-EFGH-WXYZ")).toBe(
      "DW-ABCD-2345-EFGH-WXYZ"
    );
    expect(() => CloudBackupMachineKeySchema.parse("not-a-key")).toThrow();
    expect(() => CloudBackupMachineKeySchema.parse("DW-0000-1111-2222-3333")).toThrow();
  });

  it("keeps the temporary quota at 100MB and requires a preview id before apply", () => {
    expect(CLOUD_BACKUP_QUOTA_BYTES).toBe(100 * 1024 * 1024);
    expect(
      CloudBackupIpcRequestSchema.parse({
        operation: "applyRestore",
        previewId: "preview_test"
      }).operation
    ).toBe("applyRestore");
    expect(() =>
      CloudBackupIpcRequestSchema.parse({ operation: "applyRestore" })
    ).toThrow();
  });

  it("parses status and preview payloads used by the extra feature", () => {
    const status = CloudBackupStatusSchema.parse({
      configured: true,
      machineKey: "DW-ABCD-2345-EFGH-WXYZ",
      quotaBytes: CLOUD_BACKUP_QUOTA_BYTES,
      usedBytes: 12,
      localItemCount: 3,
      remoteItemCount: 2,
      lastBackupAt: "2026-08-13T00:00:00.000Z"
    });
    expect(status.remoteItemCount).toBe(2);

    const preview = CloudBackupPreviewSchema.parse({
      previewId: "preview_test",
      direction: "download",
      machineKey: "DW-ABCD-2345-EFGH-WXYZ",
      remoteUpdatedAt: "2026-08-13T00:00:00.000Z",
      totalBytes: 12,
      quotaBytes: CLOUD_BACKUP_QUOTA_BYTES,
      changes: [
        {
          kind: "book",
          change: "overwrite",
          id: "book_1",
          title: "测试书",
          sizeBytes: 12
        }
      ]
    });
    expect(preview.changes[0]?.change).toBe("overwrite");
  });
});
