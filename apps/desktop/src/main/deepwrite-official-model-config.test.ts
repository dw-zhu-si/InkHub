import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEEPWRITE_OFFICIAL_BALANCE_URL,
  DEEPWRITE_OFFICIAL_MODEL_BASE_URL,
  DEEPWRITE_OFFICIAL_MODEL_CONFIG_URL,
  DeepWriteOfficialModelCatalogStore,
  parseDeepWriteOfficialModelManifest
} from "./deepwrite-official-model-config";

const temporaryRoots: string[] = [];

function manifest(label = "官方模型-DeepSeekFlash正式版本"): unknown {
  return {
    balance: {
      url: `${DEEPWRITE_OFFICIAL_MODEL_BASE_URL}/v1/balance`,
      key: "itk-mxai-invalid-placeholder"
    },
    models: [
      {
        id: "deepwrite-deepseek-v4-flash",
        label,
        modelId: "deepseek-v4-flash-202605",
        api: "openai-completions",
        baseUrl: `${DEEPWRITE_OFFICIAL_MODEL_BASE_URL}/v1`,
        reasoning: true,
        defaultThinkingLevel: "high",
        supportsDeveloperRole: false,
        thinkingLevelOptions: ["low", "high", "max"],
        temperatureOptions: [0.7, 1, 1.5],
        input: 1,
        output: 2,
        cache: 0.02,
        discount: 0.65,
        status: 0
      }
    ]
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("DeepWrite official remote model manifest", () => {
  it("turns the published model fields into an immutable managed catalog", () => {
    const catalog = parseDeepWriteOfficialModelManifest(manifest());

    expect(DEEPWRITE_OFFICIAL_MODEL_CONFIG_URL).toContain(
      "/deepwrite/v1/MODELDEEPWRITE.json"
    );
    expect(catalog.manifestAvailable).toBe(true);
    expect(catalog.defaultModelId).toBe("deepwrite-deepseek-v4-flash");
    expect(catalog.models).toEqual([
      expect.objectContaining({
        id: "deepwrite-deepseek-v4-flash",
        label: "官方模型-DeepSeekFlash正式版本",
        provider: "deepseek-official",
        modelId: "deepseek-v4-flash-202605",
        baseUrl: `${DEEPWRITE_OFFICIAL_MODEL_BASE_URL}/v1`,
        reasoning: true,
        defaultThinkingLevel: "high",
        supportsDeveloperRole: false,
        thinkingLevelOptions: ["low", "high", "max"],
        temperatureOptions: [0.7, 1, 1.5],
        input: 1,
        output: 2,
        cache: 0.02,
        discount: 0.65,
        status: 0,
        managedBy: "deepwrite-official"
      })
    ]);
    expect(catalog.models[0]).not.toHaveProperty("requestModelId");
    expect(catalog.balance).toEqual({
      url: DEEPWRITE_OFFICIAL_BALANCE_URL,
      key: "itk-mxai-invalid-placeholder"
    });
  });

  it("queries account balance with the integration token and returns aggregate consumption", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-official-balance-"));
    temporaryRoots.push(root);
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.includes("account/balance")) {
        expect(input).toContain("include_keys=true");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer itk-mxai-invalid-placeholder"
        );
        return new Response(JSON.stringify({
          code: 200,
          success: true,
          message: "",
          data: {
            queried_at: "2026-07-06T18:04:00+08:00",
            account_balance: 800000,
            account_balance_yuan: 80,
            key_quota_remaining: 400000,
            key_quota_remaining_yuan: 40,
            quota_per_unit: 10000,
            keys: [
              {
                key_suffix: "a1b2",
                unlimited: false,
                granted_quota: 500000,
                granted_yuan: 50,
                remain_quota: 400000,
                remain_yuan: 40,
                used_quota: 100000,
                used_yuan: 10
              },
              { used_quota: 50000, used_yuan: 5 }
            ]
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify(manifest()), { status: 200 });
    });
    const store = new DeepWriteOfficialModelCatalogStore(root, { fetcher });
    await store.initialize();
    const cachedConfig = await readFile(
      join(root, "config", "deepwrite-official-models-cache.json"),
      "utf8"
    );
    expect(cachedConfig).not.toContain("itk-mxai-invalid-placeholder");

    await expect(store.queryBalance("a1b2")).resolves.toEqual({
      queriedAt: "2026-07-06T18:04:00+08:00",
      accountBalance: 800000,
      accountBalanceYuan: 80,
      keyQuotaRemaining: 400000,
      keyQuotaRemainingYuan: 40,
      currentKeyRemaining: 400000,
      currentKeyRemainingYuan: 40,
      currentKeyGranted: 500000,
      currentKeyGrantedYuan: 50,
      currentKeyUsed: 100000,
      currentKeyUsedYuan: 10,
      currentKeyUnlimited: false,
      usedQuota: 150000,
      usedYuan: 15,
      quotaPerUnit: 10000
    });
  });

  it("keeps unavailable models in the display catalog while excluding them from defaults", () => {
    const payload = {
      models: [
        {
          id: "deepwrite-deepseek-v4-flash",
          label: "可用模型",
          modelId: "deepseek-v4-flash",
          api: "openai-completions",
          baseUrl: `${DEEPWRITE_OFFICIAL_MODEL_BASE_URL}/v1`,
          reasoning: true,
          defaultThinkingLevel: "high",
          supportsDeveloperRole: false,
          thinkingLevelOptions: ["low", "high", "max"],
          temperatureOptions: [0.7, 1, 1.5],
          status: 0
        },
        {
          id: "deepwrite-qwen3.8-max-preview",
          label: "不可用模型",
          modelId: "qwen3.8-max-preview",
          api: "openai-completions",
          baseUrl: `${DEEPWRITE_OFFICIAL_MODEL_BASE_URL}/v1`,
          reasoning: true,
          defaultThinkingLevel: "high",
          supportsDeveloperRole: false,
          thinkingLevelOptions: ["low", "high", "max"],
          temperatureOptions: [0.7, 1, 1.5],
          status: 1
        }
      ]
    };

    const catalog = parseDeepWriteOfficialModelManifest(payload);
    expect(catalog.models).toHaveLength(2);
    expect(catalog.models[0]?.id).toBe("deepwrite-deepseek-v4-flash");
    expect(catalog.models[1]).toMatchObject({
      id: "deepwrite-qwen3.8-max-preview",
      status: 1
    });
    expect(catalog.defaultModelId).toBe("deepwrite-deepseek-v4-flash");
  });

  it("refuses manifests that could redirect the saved official token", () => {
    const unsafe = manifest() as { models: Array<Record<string, unknown>> };
    unsafe.models[0]!.baseUrl = "https://attacker.example/v1";
    expect(() => parseDeepWriteOfficialModelManifest(unsafe)).toThrow(
      /受信任范围/u
    );

    const secretBearing = manifest() as {
      models: Array<Record<string, unknown>>;
    };
    secretBearing.models[0]!.apiKey = "must-not-be-accepted";
    expect(() => parseDeepWriteOfficialModelManifest(secretBearing)).toThrow(
      /不得包含密钥/u
    );
  });

  it("refreshes on demand and retains the last successful cache when the network fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "deepwrite-official-catalog-"));
    temporaryRoots.push(root);
    let currentManifest = manifest();
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(currentManifest), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const store = new DeepWriteOfficialModelCatalogStore(root, { fetcher });
    await store.initialize();

    currentManifest = manifest("远程更新后的模型名称");
    const refreshed = await store.refreshCatalog();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refreshed.models[0]?.label).toBe("远程更新后的模型名称");

    const offlineStore = new DeepWriteOfficialModelCatalogStore(root, {
      fetcher: async () => {
        throw new Error("offline");
      }
    });
    await offlineStore.initialize();
    expect((await offlineStore.getCatalog()).models[0]?.label).toBe(
      "远程更新后的模型名称"
    );
    await expect(offlineStore.refreshCatalog()).rejects.toThrow(/offline/u);
    expect((await offlineStore.getCatalog()).models[0]?.label).toBe(
      "远程更新后的模型名称"
    );
  });
});
