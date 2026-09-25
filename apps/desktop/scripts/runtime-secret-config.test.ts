import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCloudBackupOssConfig } from "../src/extras/cloud-backup/config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("runtime-only optional integration configuration", () => {
  it("does not accept legacy Vite-prefixed OSS credentials", () => {
    vi.stubEnv("MAIN_VITE_OSS_ACCESS_KEY_ID", "legacy-id");
    vi.stubEnv("MAIN_VITE_OSS_ACCESS_KEY_SECRET", "legacy-secret");
    vi.stubEnv("MAIN_VITE_OSS_BUCKET", "legacy-bucket");
    expect(loadCloudBackupOssConfig()).toBeNull();
  });

  it("accepts an explicitly injected runtime-only OSS configuration", () => {
    vi.stubEnv("INKHUB_OSS_ACCESS_KEY_ID", "synthetic-id");
    vi.stubEnv("INKHUB_OSS_ACCESS_KEY_SECRET", "synthetic-secret");
    vi.stubEnv("INKHUB_OSS_BUCKET", "synthetic-bucket");
    expect(loadCloudBackupOssConfig()).toEqual({
      accessKeyId: "synthetic-id",
      accessKeySecret: "synthetic-secret",
      bucket: "synthetic-bucket",
      endpoint: "oss-cn-beijing.aliyuncs.com",
      region: "oss-cn-beijing"
    });
  });

  it("keeps public-data disabled for old build-time variables and never emits a bearer token", async () => {
    vi.stubEnv("MAIN_VITE_DEEPWRITE_PUBLIC_DATA_API_BASE_URL", "https://legacy.example.test");
    vi.stubEnv("MAIN_VITE_DEEPWRITE_PUBLIC_DATA_API_KEY", "legacy-secret");
    const legacy = await import("../src/main/deepwrite-public-data-config");
    expect(legacy.DEEPWRITE_PUBLIC_DATA_API_CONFIGURED).toBe(false);
    expect(legacy.deepWritePublicDataHeaders().get("Authorization")).toBeNull();

    vi.resetModules();
    vi.stubEnv("INKHUB_PUBLIC_DATA_API_BASE_URL", "https://public.example.test/prefix/");
    const configured = await import("../src/main/deepwrite-public-data-config");
    expect(configured.DEEPWRITE_PUBLIC_DATA_API_CONFIGURED).toBe(true);
    expect(configured.deepWritePublicDataUrl("MODEL.json"))
      .toBe("https://public.example.test/prefix/deepwrite/v1/MODEL.json");
    expect(configured.deepWritePublicDataHeaders().get("Authorization")).toBeNull();
  });
});
