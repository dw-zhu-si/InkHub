import { describe, expect, it } from "vitest";
import { signOssRequest } from "./oss-client";

describe("oss request signing", () => {
  it("builds a stable Aliyun OSS signature without embedding live credentials", () => {
    const first = signOssRequest({
      method: "PUT",
      bucket: "example-bucket",
      objectKey: "backups/DW-TEST-TEST-TEST-TEST/manifest.json",
      date: "Wed, 13 Aug 2026 00:00:00 GMT",
      contentType: "application/json",
      secret: "test-secret"
    });
    const second = signOssRequest({
      method: "PUT",
      bucket: "example-bucket",
      objectKey: "backups/DW-TEST-TEST-TEST-TEST/manifest.json",
      date: "Wed, 13 Aug 2026 00:00:00 GMT",
      contentType: "application/json",
      secret: "test-secret"
    });
    const otherDate = signOssRequest({
      method: "PUT",
      bucket: "example-bucket",
      objectKey: "backups/DW-TEST-TEST-TEST-TEST/manifest.json",
      date: "Wed, 13 Aug 2026 01:00:00 GMT",
      contentType: "application/json",
      secret: "test-secret"
    });
    expect(first).toBe(second);
    expect(first).not.toBe(otherDate);
    expect(first).toMatch(/^[A-Za-z0-9+/=]+$/u);
  });
});
