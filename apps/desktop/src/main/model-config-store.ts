import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { safeStorage } from "electron";
import {
  AgentProviderRuntimeConfigSchema,
  ModelConfigInputSchema,
  ModelSettingsInputSchema,
  ModelSettingsSchema,
  type AgentProviderRuntimeConfig,
  type ModelConfig,
  type ModelConfigInput,
  type OfficialModelBalance,
  type ModelSettings,
  type ModelSettingsInput
} from "@deepwrite/contracts";
import {
  DeepWriteFreeModelCatalogStore,
  type DeepWriteFreeModelCatalog
} from "./deepwrite-free-model-config";
import {
  DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID,
  DeepWriteOfficialModelCatalogStore,
  isOfficialModelAvailable,
  type DeepWriteOfficialModelCatalog
} from "./deepwrite-official-model-config";
import {
  assertSupportedModelEndpoint,
  isSupportedModelEndpoint
} from "./modelhub-endpoint";

interface DiskModelConfig {
  id: string;
  label: string;
  provider: string;
  modelId: string;
  requestModelId?: string | undefined;
  supportsDeveloperRole?: boolean | undefined;
  api: ModelConfig["api"];
  baseUrl: string;
  reasoning: boolean;
  defaultThinkingLevel: ModelConfig["defaultThinkingLevel"];
  thinkingLevelOptions: ModelConfig["thinkingLevelOptions"];
  temperatureOptions: ModelConfig["temperatureOptions"];
  managedBy?: ModelConfig["managedBy"];
}

interface DiskModelSettings {
  version: 1;
  defaultModelId: string;
  models: DiskModelConfig[];
  disabledOfficialModelIds: string[];
}

interface DiskModelSecrets {
  version: 2;
  encryptedApiKeys: Record<string, string>;
  credentialTargets: Record<string, string>;
}

const EMPTY_SETTINGS: DiskModelSettings = {
  version: 1,
  defaultModelId: "",
  models: [],
  disabledOfficialModelIds: []
};

const EMPTY_SECRETS: DiskModelSecrets = {
  version: 2,
  encryptedApiKeys: {},
  credentialTargets: {}
};

const OFFICIAL_CREDENTIAL_TARGET = "managed:deepwrite-official";

function credentialTarget(model: Pick<ModelConfigInput, "provider" | "api" | "baseUrl">): string {
  const url = new URL(model.baseUrl);
  const normalizedPath = url.pathname.replace(/\/+$/u, "") || "/";
  return JSON.stringify([
    model.provider.trim().toLowerCase(),
    model.api,
    `${url.protocol}//${url.host}${normalizedPath}${url.search}`
  ]);
}

function secretTargetForModel(model: Pick<ModelConfigInput, "provider" | "api" | "baseUrl" | "managedBy">): string {
  return model.managedBy === "deepwrite-official"
    ? OFFICIAL_CREDENTIAL_TARGET
    : credentialTarget(model);
}

interface FreeModelCatalogReader {
  initialize(): Promise<void>;
  getCatalog(): Promise<DeepWriteFreeModelCatalog>;
  refreshCatalog?(): Promise<DeepWriteFreeModelCatalog>;
}

interface OfficialModelCatalogReader {
  initialize(): Promise<void>;
  getCatalog(): Promise<DeepWriteOfficialModelCatalog>;
  refreshCatalog?(): Promise<DeepWriteOfficialModelCatalog>;
  queryBalance?(currentKeySuffix?: string): Promise<OfficialModelBalance>;
}

export interface ModelConfigStoreOptions {
  appVersion?: string;
  externalCatalogsEnabled?: boolean;
  freeModelCatalog?: FreeModelCatalogReader;
  officialModelCatalog?: OfficialModelCatalogReader;
}

const DISABLED_FREE_CATALOG: DeepWriteFreeModelCatalog = {
  revision: "inkhub-local-only",
  enabled: false,
  message: "墨枢未启用旧版兼容免费模型目录。",
  manifestAvailable: true,
  defaultModelId: "",
  models: [],
  apiKeys: {}
};

const DISABLED_OFFICIAL_CATALOG: DeepWriteOfficialModelCatalog = {
  revision: "inkhub-local-only",
  enabled: false,
  message: "墨枢未启用旧版兼容托管模型通道。",
  manifestAvailable: true,
  defaultModelId: "",
  models: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDiskSettings(raw: unknown): DiskModelSettings {
  if (!isRecord(raw)) {
    return structuredClone(EMPTY_SETTINGS);
  }
  const parsed = ModelSettingsInputSchema.safeParse({
    models: raw.models,
    defaultModelId: raw.defaultModelId
  });
  if (!parsed.success) {
    return structuredClone(EMPTY_SETTINGS);
  }
  const models = parsed.data.models
    .filter((model) => !model.managedBy && isSupportedModelEndpoint(model.provider, model.baseUrl))
    .map(({ apiKey: _apiKey, clearApiKey: _clear, ...model }) => model);
  return {
    version: 1,
    defaultModelId: models.some((model) => model.id === parsed.data.defaultModelId)
      ? parsed.data.defaultModelId
      : models[0]?.id ?? "",
    models,
    disabledOfficialModelIds: Array.isArray(raw.disabledOfficialModelIds)
      ? [...new Set(raw.disabledOfficialModelIds.filter((id): id is string => typeof id === "string" && id.length <= 120))]
      : []
  };
}

function normalizeDiskSecrets(raw: unknown, settings: DiskModelSettings): DiskModelSecrets {
  if (!isRecord(raw) || !isRecord(raw.encryptedApiKeys)) {
    return structuredClone(EMPTY_SECRETS);
  }
  const encryptedApiKeys: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw.encryptedApiKeys)) {
    if (typeof value === "string" && value.length > 0) {
      encryptedApiKeys[id] = value;
    }
  }
  const credentialTargets: Record<string, string> = {};
  if (isRecord(raw.credentialTargets)) {
    for (const [id, value] of Object.entries(raw.credentialTargets)) {
      if (typeof value === "string" && value.length > 0) credentialTargets[id] = value;
    }
  }
  // Version 1 stored only ciphertext by model id. Bind a legacy credential to
  // the endpoint that was persisted alongside it before it can be reused.
  for (const model of settings.models) {
    if (encryptedApiKeys[model.id] && !credentialTargets[model.id]) {
      credentialTargets[model.id] = secretTargetForModel(model);
    }
  }
  if (encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID]) {
    credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] = OFFICIAL_CREDENTIAL_TARGET;
  }
  return { version: 2, encryptedApiKeys, credentialTargets };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
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

export class ModelConfigStore {
  private readonly settingsPath: string;
  private readonly secretsPath: string;
  private readonly freeModelCatalog: FreeModelCatalogReader;
  private readonly officialModelCatalog: OfficialModelCatalogReader;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(userDataPath: string, options: ModelConfigStoreOptions = {}) {
    const configDirectory = join(userDataPath, "config");
    this.settingsPath = join(configDirectory, "models.json");
    this.secretsPath = join(configDirectory, "model-secrets.json");
    this.freeModelCatalog = options.freeModelCatalog ??
      (options.externalCatalogsEnabled !== false
        ? new DeepWriteFreeModelCatalogStore(
            userDataPath,
            options.appVersion ? { appVersion: options.appVersion } : {}
          )
        : {
            async initialize() {},
            async getCatalog() { return structuredClone(DISABLED_FREE_CATALOG); }
          });
    this.officialModelCatalog = options.officialModelCatalog ??
      (options.externalCatalogsEnabled !== false
        ? new DeepWriteOfficialModelCatalogStore(userDataPath)
        : {
            async initialize() {},
            async getCatalog() { return structuredClone(DISABLED_OFFICIAL_CATALOG); }
          });
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.freeModelCatalog.initialize(),
      this.officialModelCatalog.initialize()
    ]);
    await this.persistDeepWriteFreeApiKeys(await this.freeModelCatalog.getCatalog());
  }

  async list(): Promise<ModelSettings> {
    const { freeCatalog, officialCatalog } = await this.getCatalogs();
    await this.writeChain;
    const [settings, secrets] = await this.readState();
    return this.toPublicSettings(
      this.synchronizeSettings(settings, secrets, freeCatalog, officialCatalog),
      secrets,
      freeCatalog,
      officialCatalog
    );
  }

  async refreshFreeModels(): Promise<ModelSettings> {
    const freeCatalog = this.freeModelCatalog.refreshCatalog
      ? await this.freeModelCatalog.refreshCatalog()
      : await this.freeModelCatalog.getCatalog();
    const officialCatalog = await this.officialModelCatalog.getCatalog();
    await this.persistDeepWriteFreeApiKeys(freeCatalog);
    await this.writeChain;
    const [settings, secrets] = await this.readState();
    return this.toPublicSettings(
      this.synchronizeSettings(settings, secrets, freeCatalog, officialCatalog),
      secrets,
      freeCatalog,
      officialCatalog
    );
  }

  async refreshOfficialModels(): Promise<ModelSettings> {
    const [freeCatalog, officialCatalog] = await Promise.all([
      this.freeModelCatalog.getCatalog(),
      this.officialModelCatalog.refreshCatalog
        ? this.officialModelCatalog.refreshCatalog()
        : this.officialModelCatalog.getCatalog()
    ]);
    await this.persistDeepWriteFreeApiKeys(freeCatalog);
    await this.writeChain;
    const [settings, secrets] = await this.readState();
    return this.toPublicSettings(
      this.synchronizeSettings(settings, secrets, freeCatalog, officialCatalog),
      secrets,
      freeCatalog,
      officialCatalog
    );
  }

  async queryOfficialBalance(): Promise<OfficialModelBalance> {
    if (!this.officialModelCatalog.queryBalance) {
      throw new Error("当前官方模型配置不支持余额查询。");
    }
    await this.writeChain;
    const [, secrets] = await this.readState();
    const encrypted =
      secrets.encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID];
    if (!encrypted) {
      return this.officialModelCatalog.queryBalance();
    }
    if (secrets.credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] !== OFFICIAL_CREDENTIAL_TARGET) {
      throw new Error("官方令牌的凭证绑定无效，请重新填写并保存。");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储当前不可用，无法查询当前 Key 的剩余用量。");
    }
    let apiKey: string;
    try {
      apiKey = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      throw new Error("官方令牌解密失败，请重新填写并保存。");
    }
    return this.officialModelCatalog.queryBalance(apiKey.slice(-4));
  }

  async saveOfficialToken(rawApiKey: string): Promise<ModelSettings> {
    const apiKey = rawApiKey.trim();
    if (!apiKey) {
      throw new Error("请输入官方令牌。");
    }
    if (apiKey.length > 16_000) {
      throw new Error("官方令牌长度超过限制。");
    }
    const { freeCatalog, officialCatalog } = await this.getCatalogs();
    let saved: ModelSettings | undefined;
    const operation = this.writeChain.then(async () => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          "当前系统安全存储不可用，墨枢不会把托管模型令牌以明文写入磁盘。"
        );
      }
      const [settings, existingSecrets] = await this.readState();
      const nextSecrets: DiskModelSecrets = {
        version: 2,
        encryptedApiKeys: {
          ...existingSecrets.encryptedApiKeys,
          [DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID]: safeStorage
            .encryptString(apiKey)
            .toString("base64")
        },
        credentialTargets: {
          ...existingSecrets.credentialTargets,
          [DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID]: OFFICIAL_CREDENTIAL_TARGET
        }
      };
      const nextSettings = this.synchronizeSettings(
        settings,
        nextSecrets,
        freeCatalog,
        officialCatalog
      );
      await atomicWriteJson(this.secretsPath, nextSecrets);
      await atomicWriteJson(this.settingsPath, nextSettings);
      saved = this.toPublicSettings(
        nextSettings,
        nextSecrets,
        freeCatalog,
        officialCatalog
      );
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return saved!;
  }

  async clearOfficialToken(): Promise<ModelSettings> {
    const { freeCatalog, officialCatalog } = await this.getCatalogs();
    let saved: ModelSettings | undefined;
    const operation = this.writeChain.then(async () => {
      const [settings, existingSecrets] = await this.readState();
      const encryptedApiKeys = { ...existingSecrets.encryptedApiKeys };
      const credentialTargets = { ...existingSecrets.credentialTargets };
      delete encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID];
      delete credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID];
      const nextSecrets: DiskModelSecrets = { version: 2, encryptedApiKeys, credentialTargets };
      const nextSettings = this.synchronizeSettings(
        settings,
        nextSecrets,
        freeCatalog,
        officialCatalog
      );
      await atomicWriteJson(this.secretsPath, nextSecrets);
      await atomicWriteJson(this.settingsPath, nextSettings);
      saved = this.toPublicSettings(
        nextSettings,
        nextSecrets,
        freeCatalog,
        officialCatalog
      );
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return saved!;
  }

  async setOfficialModelEnabled(modelId: string, enabled: boolean): Promise<ModelSettings> {
    const { freeCatalog, officialCatalog } = await this.getCatalogs();
    const officialModel = officialCatalog.models.find((model) => model.id === modelId);
    if (!officialModel) {
      throw new Error("这个旧版兼容托管模型已不再受支持。");
    }
    if (enabled && !isOfficialModelAvailable(officialModel)) {
      throw new Error("这个旧版兼容托管模型当前不可用。");
    }
    let saved: ModelSettings | undefined;
    const operation = this.writeChain.then(async () => {
      const [settings, secrets] = await this.readState();
      const disabledIds = new Set(settings.disabledOfficialModelIds);
      if (enabled) disabledIds.delete(modelId);
      else disabledIds.add(modelId);
      const nextSettings = this.synchronizeSettings(
        { ...settings, disabledOfficialModelIds: [...disabledIds] },
        secrets,
        freeCatalog,
        officialCatalog
      );
      await atomicWriteJson(this.settingsPath, nextSettings);
      saved = this.toPublicSettings(nextSettings, secrets, freeCatalog, officialCatalog);
    });
    this.writeChain = operation.then(() => undefined, () => undefined);
    await operation;
    return saved!;
  }

  async save(rawInput: ModelSettingsInput): Promise<ModelSettings> {
    const input = ModelSettingsInputSchema.parse(rawInput);
    for (const model of input.models) {
      if (!model.managedBy) assertSupportedModelEndpoint(model.provider, model.baseUrl);
    }
    const { freeCatalog, officialCatalog } = await this.getCatalogs();
    let saved: ModelSettings | undefined;
    const operation = this.writeChain.then(async () => {
      const [existingSettings, existingSecrets] = await this.readState();
      const encryptedApiKeys: Record<string, string> = {};
      const credentialTargets: Record<string, string> = {};

      const officialToken =
        existingSecrets.encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID];
      if (
        officialToken &&
        existingSecrets.credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] === OFFICIAL_CREDENTIAL_TARGET
      ) {
        encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] = officialToken;
        credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] = OFFICIAL_CREDENTIAL_TARGET;
      }

      // Managed free-model credentials are refreshed independently from the
      // editable model list and must survive a normal settings save.
      for (const model of freeCatalog.models) {
        const encrypted = existingSecrets.encryptedApiKeys[model.id];
        const target = secretTargetForModel(model);
        if (encrypted && existingSecrets.credentialTargets[model.id] === target) {
          encryptedApiKeys[model.id] = encrypted;
          credentialTargets[model.id] = target;
        }
      }

      for (const model of input.models) {
        if (model.managedBy) {
          continue;
        }
        const apiKey = model.apiKey?.trim();
        if (apiKey) {
          if (!safeStorage.isEncryptionAvailable()) {
            throw new Error(
              "当前系统安全存储不可用，墨枢不会把 API Key 以明文写入磁盘。"
            );
          }
          encryptedApiKeys[model.id] = safeStorage.encryptString(apiKey).toString("base64");
          credentialTargets[model.id] = secretTargetForModel(model);
          continue;
        }
        if (model.clearApiKey) {
          continue;
        }
        const previous = existingSecrets.encryptedApiKeys[model.id];
        const previousModel = existingSettings.models.find((candidate) => candidate.id === model.id);
        const target = secretTargetForModel(model);
        if (
          previous &&
          previousModel &&
          secretTargetForModel(previousModel) === target &&
          existingSecrets.credentialTargets[model.id] === target
        ) {
          encryptedApiKeys[model.id] = previous;
          credentialTargets[model.id] = target;
        }
      }

      const nextSecrets: DiskModelSecrets = { version: 2, encryptedApiKeys, credentialTargets };
      const editableModels = input.models
        .filter((model) => model.managedBy !== "deepwrite-official")
        .map((model) =>
          this.toDiskModel(
            this.synchronizeManagedModel(model, freeCatalog, officialCatalog)
          )
        );
      const requestedSettings: DiskModelSettings = {
        version: 1,
        defaultModelId: input.defaultModelId,
        models: editableModels,
        disabledOfficialModelIds: existingSettings.disabledOfficialModelIds
      };
      const nextSettings = this.synchronizeSettings(
        requestedSettings,
        nextSecrets,
        freeCatalog,
        officialCatalog
      );

      // Extra encrypted secrets are harmless after a crash; missing metadata is not.
      await atomicWriteJson(this.secretsPath, nextSecrets);
      await atomicWriteJson(this.settingsPath, nextSettings);
      saved = this.toPublicSettings(
        nextSettings,
        nextSecrets,
        freeCatalog,
        officialCatalog
      );
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return saved!;
  }

  async resolve(modelId?: string): Promise<AgentProviderRuntimeConfig | undefined> {
    const { freeCatalog, officialCatalog } = await this.getCatalogs();
    await this.writeChain;
    const [storedSettings, secrets] = await this.readState();
    const settings = this.synchronizeSettings(
      storedSettings,
      secrets,
      freeCatalog,
      officialCatalog
    );
    if (settings.models.length === 0) {
      if (modelId) {
        throw new Error("所选模型不存在，请刷新模型配置后重试。");
      }
      return undefined;
    }

    const effectiveId = modelId || settings.defaultModelId || settings.models[0]!.id;
    const storedModel = settings.models.find((candidate) => candidate.id === effectiveId);
    const model = storedModel
      ? this.synchronizeManagedModel(
          storedModel,
          freeCatalog,
          officialCatalog,
          true
        )
      : undefined;
    if (!model) {
      throw new Error("所选模型不存在，请刷新模型配置后重试。");
    }
    assertSupportedModelEndpoint(model.provider, model.baseUrl);

    const secretId =
      model.managedBy === "deepwrite-official"
        ? DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID
        : model.id;
    const encrypted = secrets.encryptedApiKeys[secretId];
    let apiKey = "";
    if (!apiKey && encrypted) {
      if (secrets.credentialTargets[secretId] !== secretTargetForModel(model)) {
        throw new Error("模型凭证与当前服务地址不匹配，请重新填写 API Key 并保存。");
      }
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("系统安全存储当前不可用，无法解密这个模型的 API Key。");
      }
      try {
        apiKey = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
      } catch {
        throw new Error("模型 API Key 解密失败，请在模型配置中重新填写并保存。");
      }
    }

    return AgentProviderRuntimeConfigSchema.parse({ ...model, apiKey });
  }

  async resolveDraft(rawModel: ModelConfigInput): Promise<AgentProviderRuntimeConfig> {
    const parsedModel = ModelConfigInputSchema.parse(rawModel);
    assertSupportedModelEndpoint(parsedModel.provider, parsedModel.baseUrl);
    const { freeCatalog, officialCatalog } = await this.getCatalogs();
    await this.writeChain;
    const model = this.synchronizeManagedModel(
      parsedModel,
      freeCatalog,
      officialCatalog,
      true
    );

    let apiKey = model.managedBy ? "" : model.apiKey ?? "";
    if (!apiKey && !model.clearApiKey) {
      const [, secrets] = await this.readState();
      const secretId =
        model.managedBy === "deepwrite-official"
          ? DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID
          : model.id;
      const encrypted = secrets.encryptedApiKeys[secretId];
      if (encrypted) {
        if (secrets.credentialTargets[secretId] !== secretTargetForModel(model)) {
          throw new Error("模型服务地址或厂家已改变，请重新填写 API Key 后再测试连接。");
        }
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("系统安全存储当前不可用，无法解密这个模型的 API Key。");
        }
        try {
          apiKey = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
        } catch {
          throw new Error("模型 API Key 解密失败，请在模型配置中重新填写并保存。");
        }
      }
    }
    if (model.managedBy === "deepwrite-official" && !apiKey) {
      throw new Error("请先在“设置 → 旧版兼容托管模型”中添加访问令牌。");
    }

    const { apiKey: _apiKey, clearApiKey: _clearApiKey, ...identity } = model;
    return AgentProviderRuntimeConfigSchema.parse({ ...identity, apiKey });
  }

  async resolveDraftApiKey(input: {
    id?: string;
    provider: string;
    api: ModelConfig["api"];
    baseUrl: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }): Promise<string> {
    assertSupportedModelEndpoint(input.provider, input.baseUrl);
    const provided = input.apiKey?.trim() ?? "";
    if (provided) {
      return provided;
    }
    if (input.clearApiKey) {
      return "";
    }
    const modelId = input.id?.trim() ?? "";
    if (!modelId) {
      return "";
    }
    await this.writeChain;
    const [, secrets] = await this.readState();
    const encrypted = secrets.encryptedApiKeys[modelId];
    if (!encrypted) {
      return "";
    }
    const target = credentialTarget(input);
    if (secrets.credentialTargets[modelId] !== target) {
      throw new Error("模型服务地址或厂家已改变，请重新填写 API Key 后再读取远程模型。");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储当前不可用，无法解密这个模型的 API Key。");
    }
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      throw new Error("模型 API Key 解密失败，请在模型配置中重新填写并保存。");
    }
  }

  private async getCatalogs(): Promise<{
    freeCatalog: DeepWriteFreeModelCatalog;
    officialCatalog: DeepWriteOfficialModelCatalog;
  }> {
    const [freeCatalog, officialCatalog] = await Promise.all([
      this.freeModelCatalog.getCatalog(),
      this.officialModelCatalog.getCatalog()
    ]);
    await this.persistDeepWriteFreeApiKeys(freeCatalog);
    return { freeCatalog, officialCatalog };
  }

  private async readState(): Promise<[DiskModelSettings, DiskModelSecrets]> {
    const [rawSettings, rawSecrets] = await Promise.all([
      readJson(this.settingsPath),
      readJson(this.secretsPath)
    ]);
    const settings = normalizeDiskSettings(rawSettings);
    return [settings, normalizeDiskSecrets(rawSecrets, settings)];
  }

  /**
   * Remote managed-model credentials are accepted only in Main and immediately
   * moved into the same encrypted store as user-provided credentials.
   */
  private async persistDeepWriteFreeApiKeys(
    catalog: DeepWriteFreeModelCatalog
  ): Promise<void> {
    const entries = Object.entries(catalog.apiKeys).filter(([, apiKey]) => Boolean(apiKey));
    if (entries.length === 0) {
      return;
    }
    const operation = this.writeChain.then(async () => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          "当前系统安全存储不可用，墨枢不会把远程免费模型 API Key 以明文写入磁盘。"
        );
      }
      const [, existingSecrets] = await this.readState();
      const encryptedApiKeys = { ...existingSecrets.encryptedApiKeys };
      const credentialTargets = { ...existingSecrets.credentialTargets };
      const modelById = new Map(catalog.models.map((model) => [model.id, model]));
      for (const [id, apiKey] of entries) {
        const model = modelById.get(id);
        if (!model) continue;
        encryptedApiKeys[id] = safeStorage.encryptString(apiKey).toString("base64");
        credentialTargets[id] = secretTargetForModel(model);
      }
      await atomicWriteJson(this.secretsPath, {
        version: 2,
        encryptedApiKeys,
        credentialTargets
      } satisfies DiskModelSecrets);
    });
    this.writeChain = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
  }

  private toPublicSettings(
    settings: DiskModelSettings,
    secrets: DiskModelSecrets,
    freeCatalog: DeepWriteFreeModelCatalog,
    officialCatalog: DeepWriteOfficialModelCatalog
  ): ModelSettings {
    return ModelSettingsSchema.parse({
      defaultModelId: settings.defaultModelId,
      models: settings.models.map((model) => ({
        ...model,
        hasApiKey: (() => {
          const secretId = model.managedBy === "deepwrite-official"
            ? DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID
            : model.id;
          return Boolean(secrets.encryptedApiKeys[secretId]) &&
            secrets.credentialTargets[secretId] === secretTargetForModel(model);
        })()
      })),
      deepwriteFreeModels: freeCatalog.models.map((model) => ({
        ...model,
        hasApiKey: Boolean(secrets.encryptedApiKeys[model.id]) &&
          secrets.credentialTargets[model.id] === secretTargetForModel(model)
      })),
      ...(freeCatalog.defaultModelId
        ? { deepwriteFreeDefaultModelId: freeCatalog.defaultModelId }
        : {}),
      ...(freeCatalog.message ? { deepwriteFreeMessage: freeCatalog.message } : {}),
      deepwriteOfficialModels: officialCatalog.models.map((model) => ({
        ...model,
        hasApiKey: Boolean(
          secrets.encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID]
        ) && secrets.credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] === OFFICIAL_CREDENTIAL_TARGET
      })),
      deepwriteOfficialEnabledModelIds: officialCatalog.models
        .filter(
          (model) =>
            isOfficialModelAvailable(model) &&
            !settings.disabledOfficialModelIds.includes(model.id)
        )
        .map((model) => model.id),
      deepwriteOfficialTokenConfigured: Boolean(
        secrets.encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID]
      ) && secrets.credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] === OFFICIAL_CREDENTIAL_TARGET
    });
  }

  private synchronizeSettings(
    settings: DiskModelSettings,
    secrets: DiskModelSecrets,
    freeCatalog: DeepWriteFreeModelCatalog,
    officialCatalog: DeepWriteOfficialModelCatalog
  ): DiskModelSettings {
    const officialModelIds = new Set(
      officialCatalog.models.map((model) => model.id)
    );
    const disabledOfficialModelIds = new Set(settings.disabledOfficialModelIds);
    const officialModels = secrets.encryptedApiKeys[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] &&
      secrets.credentialTargets[DEEPWRITE_OFFICIAL_TOKEN_SECRET_ID] === OFFICIAL_CREDENTIAL_TARGET
      ? officialCatalog.models
          .filter(
            (model) =>
              isOfficialModelAvailable(model) &&
              !disabledOfficialModelIds.has(model.id)
          )
          .map((model) => this.toDiskModel(model))
      : [];
    const otherModels = settings.models
      .filter(
        (model) =>
          model.managedBy !== "deepwrite-official" &&
          !officialModelIds.has(model.id)
      )
      .map((model) =>
        this.toDiskModel(
          this.synchronizeManagedModel(model, freeCatalog, officialCatalog)
        )
      );
    const models = [...officialModels, ...otherModels];
    const requestedDefaultModelId = settings.defaultModelId;
    const defaultModelId = models.some((model) => model.id === requestedDefaultModelId)
      ? requestedDefaultModelId
      : models[0]?.id ?? "";
    return {
      ...settings,
      defaultModelId,
      models,
      disabledOfficialModelIds: [...disabledOfficialModelIds].filter((id) =>
        officialModelIds.has(id)
      )
    };
  }

  private synchronizeManagedModel(
    model: ModelConfigInput,
    freeCatalog: DeepWriteFreeModelCatalog,
    officialCatalog: DeepWriteOfficialModelCatalog,
    enforceRemoteStatus = false
  ): ModelConfigInput {
    if (model.managedBy === "deepwrite-official") {
      if (
        enforceRemoteStatus &&
        officialCatalog.manifestAvailable &&
        !officialCatalog.enabled
      ) {
        throw new Error(
          officialCatalog.message || "旧版兼容托管模型当前已暂停使用。"
        );
      }
      const officialModel = officialCatalog.models.find(
        (candidate) =>
          candidate.id === model.id && isOfficialModelAvailable(candidate)
      );
      if (!officialModel) {
        throw new Error("这个旧版兼容托管模型已不再受支持。");
      }
      return structuredClone(officialModel);
    }
    if (model.managedBy !== "deepwrite-free") {
      return model;
    }
    if (enforceRemoteStatus && freeCatalog.manifestAvailable && !freeCatalog.enabled) {
      throw new Error(freeCatalog.message || "旧版兼容免费模型当前已暂停使用。");
    }
    const remoteModel =
      freeCatalog.models.find((candidate) => candidate.id === model.id) ??
      freeCatalog.models.find((candidate) => candidate.id === freeCatalog.defaultModelId);
    return {
      ...(remoteModel ? { ...remoteModel, id: model.id } : model),
      managedBy: "deepwrite-free"
    };
  }

  private toDiskModel(model: ModelConfigInput): DiskModelConfig {
    const { apiKey: _apiKey, clearApiKey: _clearApiKey, ...identity } = model;
    return identity;
  }
}
