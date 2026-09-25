import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  ModelConfigInputSchema,
  OfficialModelBalanceSchema,
  type OfficialModelBalance,
  type ModelConfigInput
} from "@deepwrite/contracts";
import {
  deepWritePublicDataHeaders,
  deepWritePublicDataUrl
} from "./deepwrite-public-data-config";

export const DEEPWRITE_OFFICIAL_MODEL_CONFIG_URL =
  deepWritePublicDataUrl("MODELDEEPWRITE.json");
export const DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID = "deepwrite-official-token";

const OFFICIAL_PROVIDER = "deepseek-official";
const OFFICIAL_API = "openai-completions" as const;
export const DEEPWRITE_OFFICIAL_MODEL_BASE_URL = "https://www.moxing.pro";
export const DEEPWRITE_OFFICIAL_BALANCE_URL =
  `${DEEPWRITE_OFFICIAL_MODEL_BASE_URL}/v1/account/balance`;
const REMOTE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REMOTE_CONFIG_BYTES = 1_000_000;

interface RemoteOfficialModelConfigCache {
  version: 1;
  fetchedAt: string;
  manifest: unknown;
}

export interface DeepWriteOfficialModelCatalog {
  revision: string;
  enabled: boolean;
  message: string;
  manifestAvailable: boolean;
  defaultModelId: string;
  models: ModelConfigInput[];
  balance?: DeepWriteOfficialBalanceConfig;
}

interface DeepWriteOfficialBalanceConfig {
  url: string;
  key: string;
}

type RemoteConfigFetcher = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface DeepWriteOfficialModelCatalogStoreOptions {
  fetcher?: RemoteConfigFetcher;
  now?: () => number;
  configUrl?: string;
}

export function isOfficialModelAvailable(model: ModelConfigInput): boolean {
  return model.status !== 1;
}

const EMPTY_CATALOG: DeepWriteOfficialModelCatalog = {
  revision: "",
  enabled: false,
  message: "官方模型配置暂时不可用，请稍后刷新。",
  manifestAvailable: false,
  defaultModelId: "",
  models: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOfficialModel(raw: unknown): { model: ModelConfigInput; sort: number } {
  if (!isRecord(raw)) {
    throw new Error("远程官方模型列表中存在无效项目。");
  }
  if ("apiKey" in raw || "clearApiKey" in raw || "managedBy" in raw) {
    throw new Error("远程官方模型配置不得包含密钥或本地管理字段。");
  }
  if (
    "provider" in raw &&
    (typeof raw.provider !== "string" || raw.provider.toLowerCase() !== OFFICIAL_PROVIDER)
  ) {
    throw new Error("远程官方模型 Provider 无效。");
  }

  const parsed = ModelConfigInputSchema.safeParse({
    ...raw,
    provider: OFFICIAL_PROVIDER,
    managedBy: "deepwrite-official"
  });
  if (!parsed.success) {
    throw new Error("远程托管模型参数不符合兼容模型格式。");
  }
  const model = parsed.data;
  if (!model.id.startsWith("deepwrite-") || model.id.startsWith("deepwrite-free-")) {
    throw new Error("远程官方模型 ID 必须使用保留的 deepwrite- 前缀。");
  }
  if (model.api !== OFFICIAL_API) {
    throw new Error("远程官方模型只允许使用 OpenAI Completions 协议。");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(model.baseUrl);
  } catch {
    throw new Error("远程官方模型 API 地址无效。");
  }
  if (
    endpoint.origin !== DEEPWRITE_OFFICIAL_MODEL_BASE_URL ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error("远程官方模型 API 地址不在受信任范围内。");
  }

  return {
    model: {
      ...model,
      provider: OFFICIAL_PROVIDER,
      api: OFFICIAL_API,
      baseUrl: `${DEEPWRITE_OFFICIAL_MODEL_BASE_URL}${endpoint.pathname.replace(/\/+$/u, "")}`,
      managedBy: "deepwrite-official"
    },
    sort: typeof raw.sort === "number" && Number.isFinite(raw.sort) ? raw.sort : 0
  };
}

function parseBalanceConfig(raw: unknown): DeepWriteOfficialBalanceConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  const rawUrl = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!key && !rawUrl) return undefined;
  // The on-disk cache deliberately omits the remotely supplied integration token.
  if (!key) return undefined;
  if (!key.startsWith("itk-mxai-") || key.length > 16_000) {
    throw new Error("官方模型余额配置中的集成 Token 无效。");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(rawUrl);
  } catch {
    throw new Error("官方模型余额接口地址无效。");
  }
  if (
    endpoint.origin !== DEEPWRITE_OFFICIAL_MODEL_BASE_URL ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !["/v1/balance", "/v1/account/balance"].includes(endpoint.pathname.replace(/\/+$/u, ""))
  ) {
    throw new Error("官方模型余额接口地址不在受信任范围内。");
  }
  return {
    url: DEEPWRITE_OFFICIAL_BALANCE_URL,
    key
  };
}

export function parseDeepWriteOfficialModelManifest(
  raw: unknown
): DeepWriteOfficialModelCatalog {
  if (!isRecord(raw) || !Array.isArray(raw.models) || raw.models.length > 50) {
    throw new Error("远程官方模型配置格式无效或模型数量超过限制。");
  }
  const enabled = raw.enabled !== false;
  const message =
    typeof raw.message === "string" && raw.message.trim()
      ? raw.message.trim().slice(0, 500)
      : enabled
        ? ""
        : "官方模型当前已暂停使用。";
  const models = raw.models
    .filter((model) => !isRecord(model) || model.enabled !== false)
    .map(parseOfficialModel)
    .sort((left, right) => left.sort - right.sort)
    .map(({ model }) => model);
  const ids = new Set(models.map((model) => model.id));
  if (ids.size !== models.length) {
    throw new Error("远程官方模型 ID 不能重复。");
  }
  const availableModels = models.filter(isOfficialModelAvailable);
  if (enabled && availableModels.length === 0 && models.length === 0) {
    throw new Error("远程官方模型配置没有模型。");
  }
  const requestedDefaultModelId =
    typeof raw.defaultModelId === "string" ? raw.defaultModelId.trim() : "";
  const availableIds = new Set(availableModels.map((model) => model.id));
  const defaultModelId = availableIds.has(requestedDefaultModelId)
    ? requestedDefaultModelId
    : availableModels[0]?.id ?? "";
  const revision = createHash("sha256")
    .update(JSON.stringify(raw), "utf8")
    .digest("hex");
  const balance = parseBalanceConfig(raw.balance);

  return {
    revision,
    enabled,
    message,
    manifestAvailable: true,
    defaultModelId: enabled ? defaultModelId : "",
    models: enabled ? models : [],
    ...(balance ? { balance } : {})
  };
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(temporary, path);
}

export class DeepWriteOfficialModelCatalogStore {
  private readonly cachePath: string;
  private readonly fetcher: RemoteConfigFetcher;
  private readonly now: () => number;
  private readonly configUrl: string;
  private readonly cacheLoad: Promise<void>;
  private catalog: DeepWriteOfficialModelCatalog = structuredClone(EMPTY_CATALOG);
  private refreshPromise: Promise<void> | undefined;

  constructor(
    userDataPath: string,
    options: DeepWriteOfficialModelCatalogStoreOptions = {}
  ) {
    this.cachePath = join(
      userDataPath,
      "config",
      "deepwrite-official-models-cache.json"
    );
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.configUrl = options.configUrl ?? DEEPWRITE_OFFICIAL_MODEL_CONFIG_URL;
    this.cacheLoad = this.loadCache();
  }

  async initialize(): Promise<void> {
    await this.cacheLoad;
    await this.refresh(false);
  }

  async getCatalog(): Promise<DeepWriteOfficialModelCatalog> {
    await this.cacheLoad;
    return structuredClone(this.catalog);
  }

  async refreshCatalog(): Promise<DeepWriteOfficialModelCatalog> {
    await this.cacheLoad;
    await this.refresh(true);
    return structuredClone(this.catalog);
  }

  async queryBalance(currentKeySuffix?: string): Promise<OfficialModelBalance> {
    await this.cacheLoad;
    const balance = this.catalog.balance;
    if (!balance) {
      throw new Error("官方模型余额配置暂时不可用，请刷新后重试。");
    }
    const endpoint = new URL(balance.url);
    endpoint.searchParams.set("include_keys", "true");
    const response = await this.fetcher(endpoint.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(REMOTE_REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${balance.key}`
      }
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_REMOTE_CONFIG_BYTES) {
      throw new Error("官方模型余额响应超过大小限制。");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new Error("官方模型余额响应格式无效。");
    }
    if (!response.ok || !isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
      const message = isRecord(payload) && typeof payload.message === "string"
        ? payload.message.trim()
        : "";
      throw new Error(message || `查询官方模型余额失败（HTTP ${response.status}）。`);
    }
    const keys = Array.isArray(payload.data.keys) ? payload.data.keys : undefined;
    const currentKey = keys?.find(
      (item) =>
        isRecord(item) &&
        typeof item.key_suffix === "string" &&
        item.key_suffix === currentKeySuffix
    );
    const usedQuota = keys?.reduce(
      (total, item) => total + (isRecord(item) && typeof item.used_quota === "number" ? item.used_quota : 0),
      0
    );
    const usedYuan = keys?.reduce(
      (total, item) => total + (isRecord(item) && typeof item.used_yuan === "number" ? item.used_yuan : 0),
      0
    );
    return OfficialModelBalanceSchema.parse({
      queriedAt: payload.data.queried_at,
      accountBalance: payload.data.account_balance,
      accountBalanceYuan: payload.data.account_balance_yuan,
      keyQuotaRemaining: payload.data.key_quota_remaining,
      keyQuotaRemainingYuan: payload.data.key_quota_remaining_yuan,
      ...(isRecord(currentKey) && typeof currentKey.remain_quota === "number"
        ? { currentKeyRemaining: currentKey.remain_quota }
        : {}),
      ...(isRecord(currentKey) && typeof currentKey.remain_yuan === "number"
        ? { currentKeyRemainingYuan: currentKey.remain_yuan }
        : {}),
      ...(isRecord(currentKey) && typeof currentKey.granted_quota === "number"
        ? { currentKeyGranted: currentKey.granted_quota }
        : {}),
      ...(isRecord(currentKey) && typeof currentKey.granted_yuan === "number"
        ? { currentKeyGrantedYuan: currentKey.granted_yuan }
        : {}),
      ...(isRecord(currentKey) && typeof currentKey.used_quota === "number"
        ? { currentKeyUsed: currentKey.used_quota }
        : {}),
      ...(isRecord(currentKey) && typeof currentKey.used_yuan === "number"
        ? { currentKeyUsedYuan: currentKey.used_yuan }
        : {}),
      ...(isRecord(currentKey) && typeof currentKey.unlimited === "boolean"
        ? { currentKeyUnlimited: currentKey.unlimited }
        : {}),
      ...(usedQuota === undefined ? {} : { usedQuota }),
      ...(usedYuan === undefined ? {} : { usedYuan }),
      quotaPerUnit: payload.data.quota_per_unit
    });
  }

  private async refresh(reportFailure: boolean): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }
    const operation = this.fetchAndCache(reportFailure);
    this.refreshPromise = operation;
    try {
      await operation;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async fetchAndCache(reportFailure: boolean): Promise<void> {
    try {
      const response = await this.fetcher(this.configUrl, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(REMOTE_REQUEST_TIMEOUT_MS),
        headers: deepWritePublicDataHeaders({ Accept: "application/json" })
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_REMOTE_CONFIG_BYTES) {
        throw new Error("配置文件超过大小限制");
      }
      const manifest = JSON.parse(text) as unknown;
      this.catalog = parseDeepWriteOfficialModelManifest(manifest);
      try {
        const cachedManifest = isRecord(manifest) && isRecord(manifest.balance)
          ? { ...manifest, balance: { url: manifest.balance.url } }
          : manifest;
        await atomicWriteJson(this.cachePath, {
          version: 1,
          fetchedAt: new Date(this.now()).toISOString(),
          manifest: cachedManifest
        } satisfies RemoteOfficialModelConfigCache);
      } catch {
        // The validated in-memory catalog remains usable if cache persistence fails.
      }
    } catch (error: unknown) {
      if (!this.catalog.manifestAvailable) {
        this.catalog = structuredClone(EMPTY_CATALOG);
      }
      if (reportFailure) {
        const reason = error instanceof Error ? error.message : "未知错误";
        throw new Error(`刷新官方模型配置失败：${reason}`);
      }
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.cachePath, "utf8")) as unknown;
      if (!isRecord(raw) || raw.version !== 1 || !("manifest" in raw)) {
        return;
      }
      this.catalog = parseDeepWriteOfficialModelManifest(raw.manifest);
    } catch {
      this.catalog = structuredClone(EMPTY_CATALOG);
    }
  }
}
