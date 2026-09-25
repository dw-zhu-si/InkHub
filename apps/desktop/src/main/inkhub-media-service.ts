import { rename, rm, writeFile } from "node:fs/promises";
import { BrowserWindow, nativeImage } from "electron";
import {
  InkHubCoverPlatformPresetSchema,
  InkHubCoverStyleSchema,
  InkHubGeneratedMediaSchema,
  type InkHubCoverPlatformId,
  type InkHubCoverPlatformPreset,
  type InkHubCoverStyle,
  type InkHubCoverStyleId,
  type InkHubGeneratedMedia
} from "@deepwrite/contracts";
import type { InkHubAssetStore } from "./inkhub-agent-skill-registry";
import type { ModelConfigStore } from "./model-config-store";
import {
  assertLocalModelHubEndpoint,
  assertSupportedModelEndpoint
} from "./modelhub-endpoint";
import {
  INKHUB_COVER_STYLES,
  compileInkHubCoverBackgroundPrompt,
  coverOverlayByStyleId,
  publicCoverStyle
} from "./inkhub-cover-skill";

const MAX_IMAGE_RESPONSE_BODY_BYTES = 45_000_000;
const MAX_IMAGE_BINARY_BYTES = 20_000_000;
const MAX_OUTPUT_PNG_BYTES = 20_000_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const IMAGE_TIMEOUT_MS = 180_000;

export const INKHUB_COVER_PRESETS: readonly InkHubCoverPlatformPreset[] = [
  {
    id: "qimao",
    label: "七猫小说",
    width: 600,
    height: 800,
    format: "png",
    safeInsetRatio: 0.08,
    evidence: "official",
    note: "七猫自定义封面技术文档规定保存为 600 × 800；发布前仍建议在作者端预览。",
    sourceUrl: "https://tech.qimao.com/zi-ding-yi-feng-mian-ji-zhu-wen-dang/"
  },
  {
    id: "fanqie",
    label: "番茄小说",
    width: 600,
    height: 800,
    format: "png",
    safeInsetRatio: 0.08,
    evidence: "platform-reference",
    note: "按常用 3:4 网文封面工作尺寸导出；番茄规则可能更新，上传前请在作家助手复核。"
  },
  {
    id: "jinjiang",
    label: "晋江文学城",
    width: 200,
    height: 280,
    format: "png",
    safeInsetRatio: 0.08,
    evidence: "official",
    note: "晋江官方客服说明自定义封面按 200 × 280 显示，并要求登记封面文字字体。",
    sourceUrl: "https://bbs.jjwxc.net/showmsg.php?board=22&boardpagemsg=2278&id=466688"
  },
  {
    id: "kindle",
    label: "Kindle eBook",
    width: 1600,
    height: 2560,
    format: "png",
    safeInsetRatio: 0.07,
    evidence: "official",
    note: "Amazon KDP 官方推荐 1600 × 2560、RGB，理想高宽比 1.6:1。",
    sourceUrl: "https://kdp.amazon.com/en_US/help/topic/G200645690"
  },
  {
    id: "web-fiction",
    label: "通用网文封面",
    width: 600,
    height: 800,
    format: "png",
    safeInsetRatio: 0.08,
    evidence: "generic",
    note: "通用 3:4 RGB PNG；没有对应平台时先用此尺寸，再按发布页要求转换。"
  }
].map((preset) => InkHubCoverPlatformPresetSchema.parse(preset));

export function modelHubImagesEndpoint(baseUrl: string): string {
  const endpoint = assertLocalModelHubEndpoint("modelhub", baseUrl);
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, "")}/images/generations`;
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

export function modelImagesEndpoint(provider: string, baseUrl: string): string {
  const endpoint = assertSupportedModelEndpoint(provider, baseUrl);
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, "")}/images/generations`;
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

export function parseModelHubImageResponse(raw: unknown): Buffer {
  if (!raw || typeof raw !== "object" || !("data" in raw) || !Array.isArray(raw.data)) {
    throw new Error("图片模型响应格式无效。");
  }
  const first = raw.data[0];
  if (!first || typeof first !== "object" || !("b64_json" in first) || typeof first.b64_json !== "string") {
    throw new Error("图片模型没有返回内嵌图片；为避免访问未知外部 URL，本次生成已停止。");
  }
  if (
    first.b64_json.length > Math.ceil(MAX_IMAGE_BINARY_BYTES * 4 / 3) + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(first.b64_json)
  ) {
    throw new Error("生成图片编码无效或超过安全大小上限。");
  }
  const buffer = Buffer.from(first.b64_json, "base64");
  if (!buffer.length || buffer.byteLength > MAX_IMAGE_BINARY_BYTES) {
    throw new Error("图片模型返回了空图片或图片超过安全大小上限。");
  }
  return buffer;
}

export async function readLimitedJsonResponse(
  response: Response,
  maxBytes = MAX_IMAGE_RESPONSE_BODY_BYTES
): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("图片模型响应超过安全大小上限。");
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("图片模型响应超过安全大小上限。");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function assertImageDimensions(image: Electron.NativeImage): void {
  const size = image.getSize();
  if (
    size.width <= 0 ||
    size.height <= 0 ||
    size.width > 10_000 ||
    size.height > 10_000 ||
    size.width * size.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("生成图片尺寸超过安全上限。");
  }
}

async function writeMediaAtomically(path: string, content: Buffer): Promise<void> {
  if (content.byteLength > MAX_OUTPUT_PNG_BYTES) {
    throw new Error("生成的 PNG 超过保存大小上限。");
  }
  const temporary = `${path}.partial-${process.pid}`;
  try {
    await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } catch (error: unknown) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function presetById(id: InkHubCoverPlatformId): InkHubCoverPlatformPreset {
  const preset = INKHUB_COVER_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error("没有找到封面平台规格。");
  return preset;
}

async function renderCover(
  background: Buffer,
  preset: InkHubCoverPlatformPreset,
  styleId: InkHubCoverStyleId,
  title: string,
  author: string
): Promise<Buffer> {
  const backgroundImage = nativeImage.createFromBuffer(background);
  if (backgroundImage.isEmpty()) throw new Error("生成结果不是可读取的图片。");
  assertImageDimensions(backgroundImage);
  const backgroundUrl = backgroundImage.toDataURL();
  const inset = Math.round(preset.width * preset.safeInsetRatio);
  const overlay = coverOverlayByStyleId(styleId);
  const copyPosition = overlay.placement === "top"
    ? `top:${Math.round(inset * 1.2)}px`
    : overlay.placement === "center"
      ? "top:50%;transform:translateY(-50%)"
      : `bottom:${Math.round(inset * 1.2)}px`;
  const fontFamily = overlay.font === "sans"
    ? "-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"
    : "'Songti SC','STSong','Noto Serif CJK SC',serif";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#101814}
    body{position:relative;font-family:${fontFamily};color:#fff}
    img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .shade{position:absolute;inset:0;background:${overlay.shade}}
    .copy{position:absolute;left:${inset}px;right:${inset}px;${copyPosition};text-align:${overlay.align};text-shadow:0 2px 12px rgba(0,0,0,.58)}
    h1{margin:0;color:${overlay.titleColor};font-size:${Math.max(24, Math.round(preset.width * .105))}px;line-height:1.12;letter-spacing:.04em;word-break:break-word}
    p{margin:${Math.max(8, Math.round(preset.width * .035))}px 0 0;color:${overlay.authorColor};font:500 ${Math.max(12, Math.round(preset.width * .035))}px/1.3 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;letter-spacing:.14em}
  </style></head><body><img src="${backgroundUrl}" alt=""><div class="shade"></div><div class="copy"><h1>${escapeHtml(title)}</h1>${author ? `<p>${escapeHtml(author)} · 著</p>` : ""}</div></body></html>`;
  const window = new BrowserWindow({
    show: false,
    width: preset.width,
    height: preset.height,
    useContentSize: true,
    frame: false,
    transparent: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await window.webContents.executeJavaScript("document.fonts.ready.then(() => true)", true);
    return (await window.webContents.capturePage()).toPNG();
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

export class InkHubMediaService {
  private generationInProgress = false;

  constructor(
    private readonly assets: InkHubAssetStore,
    private readonly models: ModelConfigStore,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  listCoverPresets(): readonly InkHubCoverPlatformPreset[] {
    return INKHUB_COVER_PRESETS.map((preset) => ({ ...preset }));
  }

  listCoverStyles(): readonly InkHubCoverStyle[] {
    return INKHUB_COVER_STYLES.map((style) => InkHubCoverStyleSchema.parse(publicCoverStyle(style)));
  }

  private async runGeneration<T>(operation: () => Promise<T>): Promise<T> {
    if (this.generationInProgress) {
      throw new Error("已有图片生成任务正在运行，请等待完成后再试。");
    }
    this.generationInProgress = true;
    try {
      return await operation();
    } finally {
      this.generationInProgress = false;
    }
  }

  private async generateImage(modelId: string, prompt: string, size: string): Promise<Buffer> {
    const model = await this.models.resolve(modelId);
    if (!model) throw new Error("请先在模型配置中添加一个图片模型。");
    const endpoint = modelImagesEndpoint(model.provider, model.baseUrl);
    const response = await this.fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: model.requestModelId ?? model.modelId,
        prompt,
        n: 1,
        size,
        quality: "high",
        response_format: "b64_json"
      }),
      redirect: "error",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS)
    });
    const payload = await readLimitedJsonResponse(response);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify(payload.error).slice(0, 500)
        : `HTTP ${response.status}`;
      throw new Error(`图片生成失败：${message}`);
    }
    return parseModelHubImageResponse(payload);
  }

  async generateCover(input: {
    entryId: string;
    modelId: string;
    platformId: InkHubCoverPlatformId;
    styleId: InkHubCoverStyleId;
    title: string;
    author: string;
    prompt: string;
  }): Promise<InkHubGeneratedMedia> {
    return this.runGeneration(async () => {
      const preset = presetById(input.platformId);
      const entry = await this.assets.getNovelEntry(input.entryId);
      // Verify/create the exact destination before the potentially billable call.
      const path = await this.assets.createMediaOutputPath(input.entryId, "cover", `${input.platformId}-${input.title || entry.title}`);
      const title = input.title || entry.title;
      const art = await this.generateImage(input.modelId, compileInkHubCoverBackgroundPrompt({
        title,
        author: input.author,
        visualDirection: input.prompt,
        styleId: input.styleId
      }), "1024x1536");
      const png = await renderCover(art, preset, input.styleId, title, input.author);
      await writeMediaAtomically(path, png);
      return InkHubGeneratedMediaSchema.parse({
        entryId: input.entryId,
        kind: "cover",
        path,
        width: preset.width,
        height: preset.height,
        mimeType: "image/png",
        dataUrl: `data:image/png;base64,${png.toString("base64")}`
      });
    });
  }

  async generateIllustration(input: {
    entryId: string;
    modelId: string;
    chapterTitle: string;
    prompt: string;
  }): Promise<InkHubGeneratedMedia> {
    return this.runGeneration(async () => {
      await this.assets.getNovelEntry(input.entryId);
      // Verify/create the exact destination before the potentially billable call.
      const path = await this.assets.createMediaOutputPath(input.entryId, "illustration", input.chapterTitle);
      const raw = await this.generateImage(input.modelId, input.prompt, "1024x1024");
      const image = nativeImage.createFromBuffer(raw);
      if (image.isEmpty()) throw new Error("生成结果不是可读取的图片。");
      assertImageDimensions(image);
      const png = image.toPNG();
      await writeMediaAtomically(path, png);
      const size = image.getSize();
      return InkHubGeneratedMediaSchema.parse({
        entryId: input.entryId,
        kind: "illustration",
        path,
        width: size.width,
        height: size.height,
        mimeType: "image/png",
        dataUrl: `data:image/png;base64,${png.toString("base64")}`
      });
    });
  }
}
