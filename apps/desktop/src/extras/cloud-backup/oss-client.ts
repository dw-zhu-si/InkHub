import { createHmac } from "node:crypto";
import type { CloudBackupOssConfig } from "./config";

const DEFAULT_TIMEOUT_MS = 60_000;
const LARGE_TIMEOUT_MS = 5 * 60_000;

export interface CloudBackupObjectStore {
  getObject(key: string): Promise<Buffer | null>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
}

export function signOssRequest(input: {
  method: string;
  bucket: string;
  objectKey: string;
  date: string;
  contentType?: string;
  secret: string;
  query?: string;
}): string {
  const resource = `/${input.bucket}/${input.objectKey}${input.query ?? ""}`;
  const stringToSign = [
    input.method,
    "",
    input.contentType ?? "",
    input.date,
    resource
  ].join("\n");
  return createHmac("sha1", input.secret).update(stringToSign).digest("base64");
}

export class AliyunOssObjectStore implements CloudBackupObjectStore {
  constructor(
    private readonly config: CloudBackupOssConfig,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async getObject(key: string): Promise<Buffer | null> {
    const response = await this.request("GET", key, undefined, undefined, LARGE_TIMEOUT_MS);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`读取云端备份失败（${response.status}）。`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const response = await this.request("PUT", key, body, contentType, LARGE_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`上传云端备份失败（${response.status}）。`);
    }
  }

  private async request(
    method: string,
    objectKey: string,
    body?: Buffer,
    contentType?: string,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<Response> {
    const date = new Date().toUTCString();
    const signature = signOssRequest({
      method,
      bucket: this.config.bucket,
      objectKey,
      date,
      ...(contentType ? { contentType } : {}),
      secret: this.config.accessKeySecret
    });
    const headers = new Headers({
      Date: date,
      Authorization: `OSS ${this.config.accessKeyId}:${signature}`
    });
    if (contentType) {
      headers.set("Content-Type", contentType);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal
      };
      if (body) {
        init.body = new Uint8Array(body);
      }
      return await this.fetcher(this.objectUrl(objectKey), init);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("连接云端备份超时。");
      }
      throw new Error(error instanceof Error ? error.message : "连接云端备份失败。");
    } finally {
      clearTimeout(timer);
    }
  }

  private objectUrl(objectKey: string): string {
    return `https://${this.config.bucket}.${this.config.endpoint}/${objectKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
  }
}
