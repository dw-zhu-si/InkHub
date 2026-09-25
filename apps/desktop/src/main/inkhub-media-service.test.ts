import { describe, expect, it } from "vitest";
import {
  INKHUB_COVER_PRESETS,
  modelHubImagesEndpoint,
  modelImagesEndpoint,
  parseModelHubImageResponse,
  readLimitedJsonResponse
} from "./inkhub-media-service";

describe("InkHub media service", () => {
  it("ships distinct, provenance-labelled platform cover presets", () => {
    expect(INKHUB_COVER_PRESETS.map((preset) => preset.id)).toEqual([
      "qimao",
      "fanqie",
      "jinjiang",
      "kindle",
      "web-fiction"
    ]);
    expect(INKHUB_COVER_PRESETS.find((preset) => preset.id === "kindle")).toMatchObject({ width: 1600, height: 2560, evidence: "official" });
  });

  it("fails closed unless image calls stay on the local ModelHub gateway", () => {
    expect(modelHubImagesEndpoint("http://127.0.0.1:11435/v1")).toBe(
      "http://127.0.0.1:11435/v1/images/generations"
    );
    expect(() => modelHubImagesEndpoint("https://api.example.test/v1")).toThrow(/本机 ModelHub/u);
    expect(() => modelHubImagesEndpoint("http://127.0.0.1:11434/v1")).toThrow(/本机 ModelHub/u);
  });

  it("supports direct HTTPS and loopback image providers", () => {
    expect(modelImagesEndpoint("openai", "https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/images/generations"
    );
    expect(modelImagesEndpoint("ollama", "http://127.0.0.1:11434/v1")).toBe(
      "http://127.0.0.1:11434/v1/images/generations"
    );
    expect(() => modelImagesEndpoint("custom", "http://models.example.test/v1"))
      .toThrow(/必须使用 HTTPS/u);
  });

  it("accepts only inline base64 output and rejects remote image URLs", () => {
    expect(parseModelHubImageResponse({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }).toString()).toBe("png");
    expect(() => parseModelHubImageResponse({ data: [{ url: "https://example.test/image.png" }] })).toThrow(/未知外部 URL/u);
    expect(() => parseModelHubImageResponse({ data: [{ b64_json: "%%%" }] })).toThrow(/编码无效/u);
  });

  it("limits streamed JSON before parsing even without content-length", async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"data":'));
        controller.enqueue(new TextEncoder().encode('[{"b64_json":"AAAA"}]}'));
        controller.close();
      }
    }));
    await expect(readLimitedJsonResponse(response, 10)).rejects.toThrow(/安全大小上限/u);
  });
});
