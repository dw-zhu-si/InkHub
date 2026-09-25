import { describe, expect, it, vi } from "vitest";
import {
  listRemoteModels,
  parseRemoteModelList,
  resolveRemoteModelsUrl
} from "./list-remote-models";

describe("listRemoteModels", () => {
  it("builds OpenAI-compatible, Anthropic, and Google list endpoints", () => {
    expect(
      resolveRemoteModelsUrl({
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11435/v1/",
        apiKey: "project-token",
        provider: "modelhub"
      })
    ).toBe("http://127.0.0.1:11435/v1/models/available");
    expect(
      resolveRemoteModelsUrl({
        api: "openai-completions",
        baseUrl: "https://api.example.test/v1/",
        apiKey: "sk-test",
        provider: "custom"
      })
    ).toBe("https://api.example.test/v1/models");
    expect(
      resolveRemoteModelsUrl({
        api: "anthropic-messages",
        baseUrl: "https://api.example.test",
        apiKey: "sk-test",
        provider: "anthropic"
      })
    ).toBe("https://api.example.test/v1/models");
    expect(
      resolveRemoteModelsUrl({
        api: "google-generative-ai",
        baseUrl: "https://generativelanguage.example.test/v1beta",
        apiKey: "sk-test",
        provider: "google"
      })
    ).toBe(
      "https://generativelanguage.example.test/v1beta/models?key=sk-test"
    );
  });

  it("uses the dedicated ModelHub availability endpoint", async () => {
    await expect(
      listRemoteModels(
        {
          api: "openai-completions",
          baseUrl: "http://127.0.0.1:11435/v1",
          apiKey: "project-token",
          provider: "ModelHub"
        },
        async (url, init) => {
          expect(url).toBe("http://127.0.0.1:11435/v1/models/available");
          expect(new Headers(init?.headers).get("Authorization")).toBe(
            "Bearer project-token"
          );
          return Response.json({ models: [{ id: "writer-model" }] });
        }
      )
    ).resolves.toEqual([{ id: "writer-model" }]);
  });

  it("parses OpenAI, Anthropic, and Google list payloads", () => {
    expect(
      parseRemoteModelList({
        data: [{ id: "writer-b" }, { id: "writer-a" }, { id: "writer-a" }]
      })
    ).toEqual([{ id: "writer-a" }, { id: "writer-b" }]);
    expect(
      parseRemoteModelList({
        data: [{ id: "claude-test", display_name: "Claude Test" }]
      })
    ).toEqual([{ id: "claude-test", label: "Claude Test" }]);
    expect(
      parseRemoteModelList({
        models: [{ name: "models/gemini-flash", displayName: "Gemini Flash" }]
      })
    ).toEqual([{ id: "gemini-flash", label: "Gemini Flash" }]);
  });

  it("fetches and returns available ModelHub model ids", async () => {
    const requested: Array<{ url: string; authorization: string | null }> = [];
    const models = await listRemoteModels(
      {
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11435/v1",
        apiKey: "project-token-test-only",
        provider: "modelhub"
      },
      async (url, init) => {
        requested.push({
          url,
          authorization: new Headers(init?.headers).get("Authorization")
        });
        return Response.json({
          data: [{ id: "model-b" }, { id: "model-a" }]
        });
      }
    );

    expect(requested).toEqual([
      {
        url: "http://127.0.0.1:11435/v1/models/available",
        authorization: "Bearer project-token-test-only"
      }
    ]);
    expect(models).toEqual([{ id: "model-a" }, { id: "model-b" }]);
  });

  it("supports a keyless local Ollama model catalog", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ id: "qwen-local" }] }));
    await expect(
      listRemoteModels(
        {
          api: "openai-completions",
          baseUrl: "http://127.0.0.1:11434/v1",
          apiKey: "",
          provider: "ollama"
        },
        fetcher
      )
    ).resolves.toEqual([{ id: "qwen-local" }]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("supports direct HTTPS providers and rejects insecure remote HTTP", async () => {
    await expect(
      listRemoteModels(
        {
          api: "openai-completions",
          baseUrl: "https://api.example.test/v1",
          apiKey: "direct-test-key",
          provider: "custom"
        },
        async () => Response.json({ data: [{ id: "writer-direct" }] })
      )
    ).resolves.toEqual([{ id: "writer-direct" }]);
    await expect(
      listRemoteModels({
        api: "openai-completions",
        baseUrl: "http://api.example.test/v1",
        apiKey: "direct-test-key",
        provider: "custom"
      })
    ).rejects.toThrow("必须使用 HTTPS");
  });

  it("rejects invalid local endpoints and missing ModelHub credentials before fetching", async () => {
    await expect(
      listRemoteModels({
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11436/v1",
        apiKey: "project-token-test-only",
        provider: "modelhub"
      })
    ).rejects.toThrow("127.0.0.1:11435");
    await expect(
      listRemoteModels({
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11435/v1",
        apiKey: "",
        provider: "modelhub"
      })
    ).rejects.toThrow("请先填写 API Key");
  });

  it("maps unauthorized responses to a key error", async () => {
    await expect(
      listRemoteModels(
        {
          api: "openai-completions",
          baseUrl: "http://127.0.0.1:11435/v1",
          apiKey: "project-token-test-only",
          provider: "modelhub"
        },
        async () => new Response("denied", { status: 401 })
      )
    ).rejects.toThrow("密钥无效或没有权限拉取模型列表。");
  });
});
