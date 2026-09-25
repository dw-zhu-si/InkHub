export interface CloudBackupOssConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  region: string;
}

function runtimeValue(name: string): string {
  const runtimeValue = process.env[name];
  return typeof runtimeValue === "string" ? runtimeValue.trim() : "";
}

export function loadCloudBackupOssConfig(): CloudBackupOssConfig | null {
  // Never read credentials through import.meta.env: electron-vite can compile
  // those values into the distributed main-process bundle. These variables are
  // runtime-only compatibility inputs for private launchers; the public build
  // remains disabled unless all required values are explicitly injected.
  const accessKeyId = runtimeValue("INKHUB_OSS_ACCESS_KEY_ID");
  const accessKeySecret = runtimeValue("INKHUB_OSS_ACCESS_KEY_SECRET");
  const bucket = runtimeValue("INKHUB_OSS_BUCKET");
  const endpoint =
    runtimeValue("INKHUB_OSS_ENDPOINT") || "oss-cn-beijing.aliyuncs.com";
  const region = runtimeValue("INKHUB_OSS_REGION") || "oss-cn-beijing";
  if (!accessKeyId || !accessKeySecret || !bucket) {
    return null;
  }
  return { accessKeyId, accessKeySecret, bucket, endpoint, region };
}
