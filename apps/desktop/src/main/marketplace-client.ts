import { safeStorage } from "electron";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CatalogInstallMarketplaceSkillContentResultSchema,
  CatalogSnapshotSchema,
  MarketplaceContentDetailSchema,
  MarketplaceContentPageSchema,
  MarketplaceContentRefSchema,
  MarketplaceContentSummarySchema,
  MarketplaceInstallInputSchema,
  MarketplaceInstallPackageSchema,
  MarketplaceInstallPreviewSchema,
  MarketplaceInstallResultSchema,
  MarketplaceLikeInputSchema,
  MarketplaceLikeResultSchema,
  MarketplaceListFilterSchema,
  MarketplaceLoginInputSchema,
  MarketplacePublishInputSchema,
  MarketplaceRegisterInputSchema,
  MarketplaceSetEnabledInputSchema,
  MarketplaceSessionSchema,
  MarketplaceUpdateInputSchema,
  MarketplaceUserSchema,
  type CatalogInstallMarketplaceSkillContentResult,
  type CatalogSnapshot,
  type MarketplaceContentDetail,
  type MarketplaceContentPage,
  type MarketplaceContentRef,
  type MarketplaceContentSummary,
  type MarketplaceInstallBucket,
  type MarketplaceInstallInput,
  type MarketplaceInstallPackage,
  type MarketplaceInstallPreview,
  type MarketplaceInstallResult,
  type MarketplaceLibraryType,
  type MarketplaceLikeInput,
  type MarketplaceLikeResult,
  type MarketplaceListFilter,
  type MarketplaceLoginInput,
  type MarketplacePublishInput,
  type MarketplaceRegisterInput,
  type MarketplaceSetEnabledInput,
  type MarketplaceSession,
  type MarketplaceSkillDetail,
  type MarketplaceSkillKind,
  type MarketplaceUpdateInput,
  type MarketplaceUser
} from "@deepwrite/contracts";
import { DEEPWRITE_PUBLIC_DATA_API_BASE_URL } from "./deepwrite-public-data-config";

const MARKETPLACE_REQUEST_TIMEOUT_MS = 12_000;
const MARKETPLACE_MAX_RESPONSE_BYTES = 2 * 1_024 * 1_024;
const MARKETPLACE_SESSION_FILE_VERSION = 1;

type MarketplaceFetcher = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

interface SecureStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface StoredMarketplaceSession {
  version: 1;
  encryptedToken: string;
  expiresAt: string;
}

export interface MarketplaceClientOptions {
  baseUrl?: string;
  fetcher?: MarketplaceFetcher;
  secureStorage?: SecureStorageLike;
  now?: () => number;
  loadCatalogSnapshot?: () => Promise<CatalogSnapshot>;
  installPackage?: (
    input: MarketplaceInstallPackage
  ) => Promise<CatalogInstallMarketplaceSkillContentResult>;
}

export class MarketplaceClientError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "MarketplaceClientError";
    this.code = code;
    this.status = status;
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MarketplaceClientError(
      "marketplace.invalid_response",
      `技能广场返回了无效的${label}。`
    );
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function optionalString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" ? value : Number.NaN;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function metadata(record: Record<string, unknown>): Record<string, unknown> {
  const value = record.metadata;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeUser(raw: unknown): MarketplaceUser {
  const value = asRecord(raw, "用户信息");
  return MarketplaceUserSchema.parse({
    id: requiredString(value, "id"),
    username: requiredString(value, "username"),
    ...(optionalString(value, "email")
      ? { email: optionalString(value, "email") }
      : {}),
    displayName:
      requiredString(value, "display_name") || requiredString(value, "username"),
    avatarUrl: requiredString(value, "avatar_url"),
    bio: requiredString(value, "bio"),
    createdAt: requiredString(value, "created_at")
  });
}

function normalizeSummary(raw: unknown): MarketplaceContentSummary {
  const value = asRecord(raw, "内容摘要");
  return MarketplaceContentSummarySchema.parse({
    contentType: requiredString(value, "content_type"),
    id: requiredString(value, "id"),
    ...(optionalString(value, "owner_user_id")
      ? { ownerUserId: optionalString(value, "owner_user_id") }
      : {}),
    title: requiredString(value, "title"),
    overview: requiredString(value, "overview"),
    ...(optionalString(value, "kind")
      ? { kind: optionalString(value, "kind") }
      : {}),
    ...(optionalString(value, "library_type")
      ? { libraryType: optionalString(value, "library_type") }
      : {}),
    ...(optionalString(value, "stage_id")
      ? { stageId: optionalString(value, "stage_id") }
      : {}),
    version: requiredNumber(value, "version"),
    coverUrl: requiredString(value, "cover_url"),
    visibility: requiredString(value, "visibility"),
    status: requiredString(value, "status"),
    enabled: requiredBoolean(value, "enabled"),
    downloadCount: requiredNumber(value, "download_count"),
    likeCount: requiredNumber(value, "like_count"),
    likedByMe: requiredBoolean(value, "liked_by_me"),
    itemCount: requiredNumber(value, "item_count"),
    ownerUsername: requiredString(value, "owner_username"),
    ownerName: requiredString(value, "owner_name"),
    ownerAvatarUrl: requiredString(value, "owner_avatar_url"),
    metadata: metadata(value),
    ...(optionalString(value, "published_at")
      ? { publishedAt: optionalString(value, "published_at") }
      : {}),
    ...(optionalString(value, "deleted_at")
      ? { deletedAt: optionalString(value, "deleted_at") }
      : {}),
    ...(optionalString(value, "purge_at")
      ? { purgeAt: optionalString(value, "purge_at") }
      : {}),
    createdAt: requiredString(value, "created_at"),
    updatedAt: requiredString(value, "updated_at")
  });
}

function normalizeContentPage(raw: unknown): MarketplaceContentPage {
  const value = asRecord(raw, "分页列表");
  if (!Array.isArray(value.items)) {
    throw new MarketplaceClientError(
      "marketplace.invalid_response",
      "技能广场分页列表缺少有效的 items。"
    );
  }
  return MarketplaceContentPageSchema.parse({
    items: value.items.map(normalizeSummary),
    page: requiredNumber(value, "page"),
    pageSize: requiredNumber(value, "page_size"),
    total: requiredNumber(value, "total"),
    totalPages: requiredNumber(value, "total_pages")
  });
}

function normalizeDetailBase(raw: unknown): Record<string, unknown> {
  const value = asRecord(raw, "内容详情");
  return {
    id: requiredString(value, "id"),
    ...(optionalString(value, "owner_user_id")
      ? { ownerUserId: optionalString(value, "owner_user_id") }
      : {}),
    title: requiredString(value, "title"),
    overview: requiredString(value, "overview"),
    version: requiredNumber(value, "version"),
    coverUrl: requiredString(value, "cover_url"),
    visibility: requiredString(value, "visibility"),
    status: requiredString(value, "status"),
    downloadCount: requiredNumber(value, "download_count"),
    metadata: metadata(value),
    ...(optionalString(value, "published_at")
      ? { publishedAt: optionalString(value, "published_at") }
      : {}),
    createdAt: requiredString(value, "created_at"),
    updatedAt: requiredString(value, "updated_at")
  };
}

function normalizeSkillDetail(raw: unknown): MarketplaceSkillDetail {
  const value = asRecord(raw, "单技能详情");
  return MarketplaceContentDetailSchema.parse({
    ...normalizeDetailBase(value),
    contentType: "skill",
    stageId: requiredString(value, "stage_id"),
    kind: requiredString(value, "kind"),
    libraryType: requiredString(value, "library_type"),
    content: requiredString(value, "content")
  }) as MarketplaceSkillDetail;
}

function normalizeDetail(
  contentType: MarketplaceContentRef["contentType"],
  raw: unknown
): MarketplaceContentDetail {
  if (contentType === "skill") return normalizeSkillDetail(raw);
  const value = asRecord(raw, "内容详情");
  if (contentType === "library") {
    const skills = Array.isArray(value.skills) ? value.skills : [];
    return MarketplaceContentDetailSchema.parse({
      ...normalizeDetailBase(value),
      contentType,
      kind: requiredString(value, "kind"),
      libraryType: requiredString(value, "library_type"),
      skills: skills.map(normalizeSkillDetail)
    });
  }
  const items = Array.isArray(value.items) ? value.items : [];
  return MarketplaceContentDetailSchema.parse({
    ...normalizeDetailBase(value),
    contentType,
    items: items.map(normalizeSummary)
  });
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MarketplaceClientError(
      "marketplace.invalid_base_url",
      "技能广场接口基址无效。"
    );
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new MarketplaceClientError(
      "marketplace.invalid_base_url",
      "技能广场接口基址无效。"
    );
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, "")}`;
}

async function readLimitedResponse(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MARKETPLACE_MAX_RESPONSE_BYTES
  ) {
    throw new MarketplaceClientError(
      "marketplace.response_too_large",
      "技能广场响应超过大小限制。"
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MARKETPLACE_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new MarketplaceClientError(
          "marketplace.response_too_large",
          "技能广场响应超过大小限制。"
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
    "utf8"
  );
}

function requestBody(input: MarketplacePublishInput): Record<string, unknown> {
  if (input.contentType === "skill") {
    return {
      title: input.title,
      overview: input.overview,
      stage_id: input.stageId,
      kind: input.kind,
      library_type: input.libraryType,
      content: input.content,
      metadata: { source: "deepwrite-desktop" }
    };
  }
  if (input.contentType === "library") {
    return {
      title: input.title,
      overview: input.overview,
      kind: input.kind,
      library_type: input.libraryType,
      metadata: { source: "deepwrite-desktop" },
      entries: input.entries.map((entry) => ({
        stage_id: entry.stageId,
        title: entry.title,
        body: entry.content
      }))
    };
  }
  return {
    title: input.title,
    overview: input.overview,
    metadata: { source: "deepwrite-desktop" },
    ...("libraries" in input
      ? {
          libraries: input.libraries.map((library) => ({
            title: library.title,
            overview: library.overview,
            kind: library.kind,
            library_type: library.libraryType,
            entries: library.entries.map((entry) => ({
              stage_id: entry.stageId,
              title: entry.title,
              body: entry.content
            }))
          }))
        }
      : {
          items: input.items.map((item) => ({
            item_type: item.contentType,
            item_id: item.id
          }))
        })
  };
}

function publishPath(input: MarketplacePublishInput, id?: string): string {
  const collection =
    input.contentType === "skill"
      ? "skills"
      : input.contentType === "library"
        ? "skill-libraries"
        : "skill-groups";
  return `/market/v1/${collection}${id ? `/${encodeURIComponent(id)}` : ""}`;
}

function uniqueLibraryTypes(
  values: readonly MarketplaceLibraryType[]
): MarketplaceLibraryType[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export class MarketplaceClient {
  private readonly baseUrl: string;
  private readonly fetcher: MarketplaceFetcher;
  private readonly storage: SecureStorageLike;
  private readonly now: () => number;
  private readonly sessionPath: string;
  private readonly loadCatalogSnapshot:
    | (() => Promise<CatalogSnapshot>)
    | undefined;
  private readonly installCatalogPackage:
    | MarketplaceClientOptions["installPackage"]
    | undefined;
  private readonly loadPromise: Promise<void>;
  private token: string | undefined;
  private expiresAt: string | undefined;
  private user: MarketplaceUser | undefined;
  private persistent = false;

  constructor(userDataPath: string, options: MarketplaceClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(
      options.baseUrl ?? DEEPWRITE_PUBLIC_DATA_API_BASE_URL
    );
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.storage = options.secureStorage ?? safeStorage;
    this.now = options.now ?? Date.now;
    this.sessionPath = join(userDataPath, "config", "marketplace-session.json");
    this.loadCatalogSnapshot = options.loadCatalogSnapshot;
    this.installCatalogPackage = options.installPackage;
    this.loadPromise = this.loadSession();
  }

  get insecureTransport(): boolean {
    return new URL(this.baseUrl).protocol === "http:";
  }

  async session(): Promise<MarketplaceSession> {
    await this.loadPromise;
    if (!this.token || this.isExpired()) return this.clearSession();
    try {
      const user = normalizeUser(
        await this.request("GET", "/market/v1/me", { authenticated: true })
      );
      this.user = user;
      return this.sessionSnapshot();
    } catch (error: unknown) {
      if (
        error instanceof MarketplaceClientError &&
        error.code === "marketplace.unauthorized"
      ) {
        return this.sessionSnapshot();
      }
      throw error;
    }
  }

  async register(input: MarketplaceRegisterInput): Promise<MarketplaceSession> {
    const parsed = MarketplaceRegisterInputSchema.parse(input);
    const data = asRecord(
      await this.request("POST", "/market/v1/auth/register", {
        authenticated: false,
        body: {
          username: parsed.username,
          password: parsed.password,
          display_name: parsed.displayName ?? "",
          ...(parsed.email ? { email: parsed.email } : {})
        }
      }),
      "注册结果"
    );
    await this.acceptAuthentication(data);
    return this.sessionSnapshot();
  }

  async login(input: MarketplaceLoginInput): Promise<MarketplaceSession> {
    const parsed = MarketplaceLoginInputSchema.parse(input);
    const data = asRecord(
      await this.request("POST", "/market/v1/auth/login", {
        authenticated: false,
        body: parsed
      }),
      "登录结果"
    );
    await this.acceptAuthentication(data);
    return this.sessionSnapshot();
  }

  async logout(): Promise<MarketplaceSession> {
    await this.loadPromise;
    if (this.token) {
      try {
        await this.request("DELETE", "/market/v1/auth/session", {
          authenticated: true
        });
      } catch (error: unknown) {
        if (
          !(error instanceof MarketplaceClientError) ||
          error.code !== "marketplace.unauthorized"
        ) {
          throw error;
        }
      }
    }
    return this.clearSession();
  }

  async list(
    filter: MarketplaceListFilter = {}
  ): Promise<MarketplaceContentPage> {
    const parsed = MarketplaceListFilterSchema.parse(filter);
    const data = await this.request(
      "GET",
      `/market/v1/skill-content${this.filterQuery(parsed)}`,
      { authenticated: "optional" }
    );
    return normalizeContentPage(data);
  }

  async detail(ref: MarketplaceContentRef): Promise<MarketplaceContentDetail> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    const data = await this.request(
      "GET",
      `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}`,
      { authenticated: false }
    );
    return normalizeDetail(parsed.contentType, data);
  }

  async listMine(
    filter: MarketplaceListFilter = {}
  ): Promise<MarketplaceContentPage> {
    const parsed = MarketplaceListFilterSchema.parse(filter);
    const data = await this.request(
      "GET",
      `/market/v1/me/skill-content${this.filterQuery(parsed)}`,
      { authenticated: true }
    );
    return normalizeContentPage(data);
  }

  async myDetail(ref: MarketplaceContentRef): Promise<MarketplaceContentDetail> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    const data = await this.request(
      "GET",
      `/market/v1/me/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}`,
      { authenticated: true }
    );
    return normalizeDetail(parsed.contentType, data);
  }

  async publish(input: MarketplacePublishInput): Promise<MarketplaceContentDetail> {
    const parsed = MarketplacePublishInputSchema.parse(input);
    const data = await this.request("POST", publishPath(parsed), {
      authenticated: true,
      body: requestBody(parsed)
    });
    return normalizeDetail(parsed.contentType, data);
  }

  async update(input: MarketplaceUpdateInput): Promise<MarketplaceContentDetail> {
    const parsed = MarketplaceUpdateInputSchema.parse(input);
    const data = await this.request(
      "PUT",
      publishPath(parsed.content, parsed.id),
      { authenticated: true, body: requestBody(parsed.content) }
    );
    return normalizeDetail(parsed.content.contentType, data);
  }

  async setEnabled(
    input: MarketplaceSetEnabledInput
  ): Promise<MarketplaceContentSummary> {
    const parsed = MarketplaceSetEnabledInputSchema.parse(input);
    const data = await this.request(
      "PUT",
      `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}/enabled`,
      { authenticated: true, body: { enabled: parsed.enabled } }
    );
    return normalizeSummary(data);
  }

  async delete(ref: MarketplaceContentRef): Promise<void> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    await this.request(
      "DELETE",
      `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}`,
      { authenticated: true }
    );
  }

  async like(input: MarketplaceLikeInput): Promise<MarketplaceLikeResult> {
    const parsed = MarketplaceLikeInputSchema.parse(input);
    const data = asRecord(
      await this.request(
        parsed.liked ? "POST" : "DELETE",
        `/market/v1/skill-content/${parsed.contentType}/${encodeURIComponent(parsed.id)}/like`,
        { authenticated: true }
      ),
      "点赞结果"
    );
    return MarketplaceLikeResultSchema.parse({
      liked: requiredBoolean(data, "liked"),
      likeCount: requiredNumber(data, "like_count")
    });
  }

  async previewInstall(ref: MarketplaceContentRef): Promise<MarketplaceInstallPreview> {
    const parsed = MarketplaceContentRefSchema.parse(ref);
    const detail = await this.detail(parsed);
    const installPackage = await this.buildInstallPackage(detail);
    const snapshot = this.loadCatalogSnapshot
      ? CatalogSnapshotSchema.parse(await this.loadCatalogSnapshot())
      : undefined;
    const alreadyInstalled = snapshot
      ? this.hasInstalledVersion(snapshot, parsed, detail.version)
      : false;
    return MarketplaceInstallPreviewSchema.parse({
      ref: parsed,
      title: detail.title,
      version: detail.version,
      alreadyInstalled,
      buckets: installPackage.buckets,
      ...(detail.contentType === "group" && installPackage.buckets.length > 1
        ? {
            orderNotice:
              "技能组会按技能分类归并为本地技能库；同类成员顺序保留，跨分类的原始交错顺序无法保留。"
          }
        : {})
    });
  }

  async install(input: MarketplaceInstallInput): Promise<MarketplaceInstallResult> {
    const parsed = MarketplaceInstallInputSchema.parse(input);
    if (!this.installCatalogPackage) {
      throw new MarketplaceClientError(
        "marketplace.install_unavailable",
        "本地技能安装服务尚未初始化。"
      );
    }
    const detail = await this.detail(parsed.ref);
    if (detail.contentType === "skill" && !parsed.targetLibraryId) {
      throw new MarketplaceClientError(
        "marketplace.target_library_required",
        "安装单技能前请选择目标技能库。"
      );
    }
    if (detail.contentType !== "skill" && parsed.targetLibraryId) {
      throw new MarketplaceClientError(
        "marketplace.target_library_not_allowed",
        "技能库和技能组会直接创建本地技能库，不能指定已有技能库。"
      );
    }
    const basePackage = await this.buildInstallPackage(detail);
    const installPackage = MarketplaceInstallPackageSchema.parse({
      ...basePackage,
      ...(parsed.targetLibraryId
        ? { targetLibraryId: parsed.targetLibraryId }
        : {}),
      buckets: basePackage.buckets.map((bucket) => ({
        ...bucket,
        libraryType:
          parsed.libraryTypesByKind?.[bucket.kind] ?? bucket.libraryType
      }))
    });
    const installed = CatalogInstallMarketplaceSkillContentResultSchema.parse(
      await this.installCatalogPackage(installPackage)
    );
    if (installed.alreadyInstalled) {
      return MarketplaceInstallResultSchema.parse({
        ...installed,
        downloadCounted: false
      });
    }
    let downloadCounted = true;
    try {
      await this.request(
        "POST",
        `/market/v1/skill-content/${parsed.ref.contentType}/${encodeURIComponent(parsed.ref.id)}/download`,
        { authenticated: false }
      );
    } catch {
      downloadCounted = false;
    }
    return MarketplaceInstallResultSchema.parse({
      ...installed,
      downloadCounted
    });
  }

  private async buildInstallPackage(
    detail: MarketplaceContentDetail
  ): Promise<MarketplaceInstallPackage> {
    const orderedSkills: MarketplaceSkillDetail[] = [];
    if (detail.contentType === "skill") {
      orderedSkills.push(detail);
    } else if (detail.contentType === "library") {
      orderedSkills.push(...detail.skills);
    } else {
      for (const item of detail.items) {
        const child = await this.detail({
          contentType: item.contentType,
          id: item.id
        });
        if (child.contentType === "skill") orderedSkills.push(child);
        if (child.contentType === "library") orderedSkills.push(...child.skills);
      }
    }
    const kinds: MarketplaceSkillKind[] = ["general", "plot", "style", "other"];
    const buckets: MarketplaceInstallBucket[] = kinds.flatMap((kind) => {
      const values = orderedSkills.filter((skill) => skill.kind === kind);
      if (values.length === 0) return [];
      const availableLibraryTypes = uniqueLibraryTypes(
        values.map((skill) => skill.libraryType)
      );
      return [
        {
          kind,
          libraryType: availableLibraryTypes[0]!,
          availableLibraryTypes,
          entries: values.map((skill) => ({
            marketplaceSkillId: skill.id,
            title: skill.title,
            stageId: skill.stageId,
            content: skill.content
          }))
        }
      ];
    });
    if (buckets.length === 0) {
      throw new MarketplaceClientError(
        "marketplace.empty_content",
        "该内容没有可安装的技能。"
      );
    }
    return MarketplaceInstallPackageSchema.parse({
      source: {
        contentType: detail.contentType,
        contentId: detail.id,
        version: detail.version
      },
      title: detail.title,
      overview: detail.overview,
      buckets,
      createGroup: detail.contentType === "group"
    });
  }

  private hasInstalledVersion(
    snapshot: CatalogSnapshot,
    ref: MarketplaceContentRef,
    version: number
  ): boolean {
    const matches = (source: CatalogSnapshot["skills"][number]["marketplaceSource"]) =>
      source?.contentType === ref.contentType &&
      source.contentId === ref.id &&
      source.version === version;
    return (
      snapshot.skills.some(
        (library) =>
          matches(library.marketplaceSource) ||
          library.entries.some((entry) => matches(entry.marketplaceSource))
      ) ||
      snapshot.skillGroups.some((group) => matches(group.marketplaceSource))
    );
  }

  private filterQuery(filter: MarketplaceListFilter): string {
    const query = new URLSearchParams();
    if (filter.query) query.set("q", filter.query);
    if (filter.contentType) query.set("content_type", filter.contentType);
    if (filter.kind) query.set("kind", filter.kind);
    if (filter.libraryType) query.set("library_type", filter.libraryType);
    if (filter.status) query.set("status", filter.status);
    if (filter.sort) query.set("sort", filter.sort);
    query.set("page", String(filter.page ?? 1));
    query.set("page_size", String(filter.pageSize ?? 20));
    const value = query.toString();
    return value ? `?${value}` : "";
  }

  private async request(
    method: string,
    path: string,
    options: {
      authenticated: boolean | "optional";
      body?: unknown;
    }
  ): Promise<unknown> {
    await this.loadPromise;
    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (options.authenticated !== false && this.token && !this.isExpired()) {
      headers.set("Authorization", `Bearer ${this.token}`);
    } else if (options.authenticated === true) {
      await this.clearSession();
      throw new MarketplaceClientError(
        "marketplace.unauthorized",
        "请先登录技能广场。",
        401
      );
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(MARKETPLACE_REQUEST_TIMEOUT_MS),
        headers,
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {})
      });
    } catch (error: unknown) {
      throw new MarketplaceClientError(
        "marketplace.network_error",
        error instanceof Error
          ? `无法连接技能广场：${error.message}`
          : "无法连接技能广场。"
      );
    }
    const text = await readLimitedResponse(response);
    let payload: unknown;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new MarketplaceClientError(
          "marketplace.invalid_response",
          "技能广场返回了无效 JSON。",
          response.status
        );
      }
    }
    if (response.status === 401) {
      await this.clearSession();
      throw new MarketplaceClientError(
        "marketplace.unauthorized",
        "技能广场登录已失效，请重新登录。",
        401
      );
    }
    if (!response.ok) {
      const envelope = payload ? asRecord(payload, "错误信息") : {};
      const rawError = envelope.error;
      const error =
        typeof rawError === "object" && rawError !== null && !Array.isArray(rawError)
          ? (rawError as Record<string, unknown>)
          : {};
      throw new MarketplaceClientError(
        requiredString(error, "code") || `marketplace.http_${response.status}`,
        requiredString(error, "message") || `技能广场请求失败（${response.status}）。`,
        response.status
      );
    }
    if (response.status === 204) return undefined;
    const envelope = asRecord(payload, "响应");
    if (!("data" in envelope)) {
      throw new MarketplaceClientError(
        "marketplace.invalid_response",
        "技能广场响应缺少 data 字段。",
        response.status
      );
    }
    return envelope.data;
  }

  private async acceptAuthentication(data: Record<string, unknown>): Promise<void> {
    const token = requiredString(data, "token");
    const expiresAt = requiredString(data, "expires_at");
    const user = normalizeUser(data.user);
    if (!token.startsWith("dw_user_") || !Number.isFinite(Date.parse(expiresAt))) {
      throw new MarketplaceClientError(
        "marketplace.invalid_response",
        "技能广场登录响应无效。"
      );
    }
    this.token = token;
    this.expiresAt = expiresAt;
    this.user = user;
    await this.persistSession();
  }

  private sessionSnapshot(): MarketplaceSession {
    return MarketplaceSessionSchema.parse({
      authenticated: Boolean(this.token && this.user && !this.isExpired()),
      ...(this.token && this.user && !this.isExpired()
        ? { user: this.user, expiresAt: this.expiresAt }
        : {}),
      persistent: this.persistent,
      insecureTransport: this.insecureTransport
    });
  }

  private isExpired(): boolean {
    return (
      !this.expiresAt ||
      !Number.isFinite(Date.parse(this.expiresAt)) ||
      Date.parse(this.expiresAt) <= this.now()
    );
  }

  private async loadSession(): Promise<void> {
    if (!this.storage.isEncryptionAvailable()) return;
    try {
      const raw = asRecord(
        JSON.parse(await readFile(this.sessionPath, "utf8")) as unknown,
        "本地会话"
      );
      if (
        raw.version !== MARKETPLACE_SESSION_FILE_VERSION ||
        typeof raw.encryptedToken !== "string" ||
        typeof raw.expiresAt !== "string"
      ) {
        return;
      }
      const token = this.storage.decryptString(
        Buffer.from(raw.encryptedToken, "base64")
      );
      if (!token.startsWith("dw_user_")) return;
      this.token = token;
      this.expiresAt = raw.expiresAt;
      this.persistent = true;
      if (this.isExpired()) await this.clearSession();
    } catch {
      this.token = undefined;
      this.expiresAt = undefined;
      this.persistent = false;
    }
  }

  private async persistSession(): Promise<void> {
    this.persistent = false;
    if (!this.token || !this.expiresAt || !this.storage.isEncryptionAvailable()) {
      return;
    }
    const stored: StoredMarketplaceSession = {
      version: MARKETPLACE_SESSION_FILE_VERSION,
      encryptedToken: this.storage.encryptString(this.token).toString("base64"),
      expiresAt: this.expiresAt
    };
    await mkdir(dirname(this.sessionPath), { recursive: true });
    const temporary = `${this.sessionPath}.tmp-${process.pid}-${this.now()}`;
    await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporary, this.sessionPath);
    this.persistent = true;
  }

  private async clearSession(): Promise<MarketplaceSession> {
    this.token = undefined;
    this.expiresAt = undefined;
    this.user = undefined;
    this.persistent = false;
    await unlink(this.sessionPath).catch(() => undefined);
    return this.sessionSnapshot();
  }
}
