import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelConfigInput } from "@deepwrite/contracts";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8")
  }
}));

const { ModelConfigStore } = await import("./model-config-store");
const temporaryRoots: string[] = [];

function modelHubModel(
  overrides: Partial<ModelConfigInput> = {}
): ModelConfigInput {
  return {
    id: "modelhub-writer",
    label: "ModelHub 写作模型",
    provider: "modelhub",
    modelId: "qwen3.8-max",
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:11435/v1",
    supportsDeveloperRole: false,
    reasoning: false,
    defaultThinkingLevel: "off",
    thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
    temperatureOptions: [0.1, 0.7, 1],
    ...overrides
  };
}

function createStore(root: string) {
  return new ModelConfigStore(root, { externalCatalogsEnabled: false });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("ModelConfigStore provider boundary", () => {
  it("stores a local ModelHub model, encrypts its key, and resolves it", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-model-store-"));
    temporaryRoots.push(root);
    const store = createStore(root);

    const saved = await store.save({
      models: [{ ...modelHubModel(), apiKey: "project-token-test-only" }],
      defaultModelId: "modelhub-writer"
    });

    expect(saved.models).toHaveLength(1);
    expect(saved.models[0]).toMatchObject({
      provider: "modelhub",
      baseUrl: "http://127.0.0.1:11435/v1",
      supportsDeveloperRole: false,
      hasApiKey: true
    });
    expect(saved.models[0]).not.toHaveProperty("apiKey");
    await expect(store.resolve()).resolves.toMatchObject({
      provider: "modelhub",
      apiKey: "project-token-test-only",
      supportsDeveloperRole: false
    });

    const secrets = await readFile(join(root, "config", "model-secrets.json"), "utf8");
    expect(secrets).not.toContain("project-token-test-only");
  });

  it("stores and resolves a direct HTTPS provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-model-boundary-"));
    temporaryRoots.push(root);
    const store = createStore(root);
    const remote = modelHubModel({
      id: "direct-provider",
      provider: "openai-compatible",
      baseUrl: "https://api.example.test/v1"
    });

    await expect(
      store.save({ models: [{ ...remote, apiKey: "direct-test-key" }], defaultModelId: remote.id })
    ).resolves.toMatchObject({ models: [{ provider: "openai-compatible" }] });
    await expect(store.resolveDraft(remote)).resolves.toMatchObject({
      provider: "openai-compatible",
      baseUrl: "https://api.example.test/v1"
    });
  });

  it("accepts localhost only on the fixed ModelHub port", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-model-localhost-"));
    temporaryRoots.push(root);
    const store = createStore(root);

    await expect(
      store.resolveDraft(modelHubModel({ baseUrl: "http://localhost:11435/v1" }))
    ).resolves.toMatchObject({ provider: "modelhub" });
    await expect(
      store.resolveDraft(modelHubModel({ baseUrl: "http://localhost:11436/v1" }))
    ).rejects.toThrow("127.0.0.1:11435");
  });

  it("persists an arbitrary custom manufacturer and endpoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-model-provider-"));
    temporaryRoots.push(root);
    const store = createStore(root);
    const model = modelHubModel({
      id: "custom-provider",
      provider: "我的私有模型厂家",
      baseUrl: "https://models.example.test/v1",
      modelId: "private-writer-v1"
    });

    const saved = await store.save({
      models: [model],
      defaultModelId: model.id
    });

    expect(saved.models[0]).toMatchObject({
      provider: "我的私有模型厂家",
      baseUrl: "https://models.example.test/v1",
      modelId: "private-writer-v1"
    });
    await expect(store.resolve()).resolves.toMatchObject({
      provider: "我的私有模型厂家"
    });
  });
});

describe("ModelConfigStore draft API keys", () => {
  it("reuses a saved key when the draft key field is blank", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-model-draft-key-"));
    temporaryRoots.push(root);
    const store = createStore(root);
    await store.save({
      models: [{ ...modelHubModel(), apiKey: "project-token-saved-test-only" }],
      defaultModelId: "modelhub-writer"
    });

    await expect(
      store.resolveDraftApiKey({ id: "modelhub-writer" })
    ).resolves.toBe("project-token-saved-test-only");
    await expect(
      store.resolveDraftApiKey({
        id: "modelhub-writer",
        apiKey: "project-token-typed-test-only"
      })
    ).resolves.toBe("project-token-typed-test-only");
    await expect(
      store.resolveDraftApiKey({ id: "modelhub-writer", clearApiKey: true })
    ).resolves.toBe("");
  });
});
