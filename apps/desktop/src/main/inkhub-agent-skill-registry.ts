import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  InkHubAttachedSkills,
  InkHubNovelDocumentList,
  InkHubNovelDocumentPreview,
  InkHubNovelChapterCatalog,
  InkHubNovelChapterPage,
  InkHubNovelChapterRepairInput,
  InkHubNovelChapterRepairResult,
  InkHubNovelBatchRepairInput,
  InkHubNovelBatchRepairResult,
  InkHubNovelContextPacket,
  InkHubNovelEntry,
  InkHubNovelIndexSummary,
  InkHubIllustrationPlan,
  InkHubNovelQualityReport,
  InkHubNovelReadingProgress,
  InkHubNovelRoot,
  InkHubNovelSearchResponse,
  InkHubNovelSnapshot,
  InkHubSkillPreview,
  InkHubSkillRecord,
  InkHubSkillSnapshot,
  InkHubSkillSource
} from "@deepwrite/contracts";
import { InkHubNovelKnowledgeService } from "./inkhub-novel-knowledge";
import { InkHubQualityWorkerClient } from "./inkhub-quality-worker-client";

const NOVEL_EXTENSIONS = new Set([".md", ".txt", ".docx", ".pdf", ".epub"]);
const PREVIEW_EXTENSIONS = new Set([".md", ".txt"]);
const MAX_ENTRIES = 400;
const MAX_DOCUMENTS_PER_ENTRY = 2_000;
const MAX_DIRECTORIES_PER_ENTRY = 5_000;
const MAX_PREVIEW_BYTES = 1_000_000;
const MAX_SKILL_BYTES = 20_000;
const NOVEL_FRESHNESS_CACHE_MS = 30_000;
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".svn",
  "node_modules",
  "output",
  "dist",
  "build",
  "novel_qc_report",
  "jingu-xuntian-qc-full",
  "jingu-qc-final-report"
]);

interface DiskAssetSettings {
  version: 2;
  novelRoots: string[];
  enabledSkillIds: string[];
  installedSkillBundles: Record<string, string>;
}

export interface InkHubLocalSkillDefinition {
  id: string;
  title: string;
  source: InkHubSkillSource;
  path: string;
  sha256: string;
  license: string;
  executable?: boolean;
  defaultEnabled?: boolean;
  conflictGroup?: string;
  note?: string;
}

interface ScannedDocument {
  absolutePath: string;
  relativePath: string;
  size: number;
  updatedAt: string;
  extension: string;
}

const SKILL_DEFINITIONS: readonly InkHubLocalSkillDefinition[] = [
  { id: "codex-chinese-novelist", title: "中文小说家（Codex）", source: "codex", path: ".codex/skills/chinese-novelist/SKILL.md", sha256: "a2746bc6ab29b6a4e4b1dfe5975d2fd4a51303d24aac336de4ba52a7361e8f8f", license: "MIT 声明；许可证文件待核验", defaultEnabled: true, conflictGroup: "chinese-novelist", note: "墨枢默认锁定版本。" },
  { id: "trae-chinese-novelist", title: "中文小说家（TRAE）", source: "trae", path: ".trae-cn/skills/chinese-novelist-skill-master/SKILL.md", sha256: "d761876757b02f958fc3d07f382afd4e17cc08bacd54dec6a1e398044333ba39", license: "MIT 声明；许可证文件待核验", conflictGroup: "chinese-novelist", note: "与 Codex 版不同，启用时会停用同组版本。" },
  { id: "novel-chapter-generate", title: "章节生成", source: "trae", path: ".trae-cn/skills/novelchaptergenerate/SKILL.md", sha256: "86ecf77d1f71be4b5ab478b581e24b1ab66b0234e7341222610165c40d325bfe", license: "未声明" },
  { id: "novel-outline-refine", title: "大纲精修", source: "trae", path: ".trae-cn/skills/noveloutlinerefine/SKILL.md", sha256: "c4e450577896508dfffaa5347485d676a953198ff92edf1bd87399ef5e8b0fd4", license: "未声明" },
  { id: "chapter-hook-generate", title: "章节钩子", source: "trae", path: ".trae-cn/skills/chapter_hookgenerate/SKILL.md", sha256: "c00592a651b4838f7674b84b6a6b374433dc326be65d1e910f2caaeb2caa4bf7", license: "未声明" },
  { id: "plot-pleasure-rhythm", title: "爽点节奏", source: "trae", path: ".trae-cn/skills/plot_pleasurerhythm/SKILL.md", sha256: "89b1ed9766557ff52717c33ed01389c3598dd65d1fddefe93ce5e755122922e1", license: "未声明" },
  { id: "novel-anti-trope", title: "反套路检查", source: "trae", path: ".trae-cn/skills/novelai_antitrope/SKILL.md", sha256: "998cbde92c7860327cd96a72addd6be64b50c512f2a3d72146194130bcd25545", license: "未声明" },
  { id: "emotion-write", title: "情感写作", source: "trae", path: ".trae-cn/skills/claude_emotionwrite/SKILL.md", sha256: "63ca2f2007f00fce519f8eb7042d224f3a9baa693ff76f03aa6df5b9f8d8d5e7", license: "未声明" },
  { id: "novel-text-polish", title: "文本润色", source: "trae", path: ".trae-cn/skills/noveltextpolish/SKILL.md", sha256: "1ea50b696da0c98dfafc4036e012ed55c0113aa64ae3e536f9a8a6cd04282949", license: "未声明" },
  { id: "dialogue-vivid", title: "对话生动化", source: "trae", path: ".trae-cn/skills/dialogue_vividoptimize/SKILL.md", sha256: "a9f86657045a96ff6063b5315f869bd68187df3127d179bfeb6ac1d554b1b3d7", license: "未声明" },
  { id: "emotion-detail", title: "情绪细节", source: "trae", path: ".trae-cn/skills/emotion_detailoptimize/SKILL.md", sha256: "3a8178f856f89334351fae7b98b0a94422fd5234662ecfe8ef298dcb78d69796", license: "未声明" },
  { id: "character-vivid", title: "角色生动化", source: "trae", path: ".trae-cn/skills/character_vividoptimize/SKILL.md", sha256: "9d5a89c194bf3c7593fb99621da30b445dfa96873184521d2ef01625a46cc9ad", license: "未声明" },
  { id: "scene-visual", title: "场景视觉增强", source: "trae", path: ".trae-cn/skills/scene_visualenhance/SKILL.md", sha256: "3edd9bfb77604c1169391253369e8d9e258124c2672ca4c76f583bce9732dade", license: "未声明" },
  { id: "layout-fluent", title: "排版流畅化", source: "trae", path: ".trae-cn/skills/layout_fluentoptimize/SKILL.md", sha256: "7a1690e68a227e644c4d6ce5075d014f67327354205824e89f3eed7d71c0f9e6", license: "未声明" },
  { id: "novel-setting-check", title: "小说设定检查", source: "trae", path: ".trae-cn/skills/novelsettingcheck/SKILL.md", sha256: "c2fda153b3835f9c52a749e5aaf40f36202e23febcff22340f55b01cc61affd2", license: "未声明" },
  { id: "consistency-check", title: "一致性检查", source: "trae", path: ".trae-cn/skills/kimi_consistencycheck/SKILL.md", sha256: "8ebc8123cc4ee3a5258bc0804a9e4ca58c88c1252c9c8c1b2e500702d1c83fc7", license: "未声明" },
  { id: "logic-check", title: "逻辑检查", source: "trae", path: ".trae-cn/skills/deepseek_logicchec/SKILL.md", sha256: "6799c1022361741ca2879dcf3dd11820e948d6ed00e88f397ca33b3229307f89", license: "未声明" },
  { id: "sensitive-check", title: "平台敏感词检查", source: "trae", path: ".trae-cn/skills/platform_sensitivecheck/SKILL.md", sha256: "133c8d9c485162801407239da621963aef6cf5749b54858054039c8b345b27dd", license: "未声明" },
  { id: "scrivener-structure", title: "Scrivener 结构管理", source: "trae", path: ".trae-cn/skills/scrivener_structuremanage/SKILL.md", sha256: "301ac312838c6cfcb61d3a3011fc909c0769c34b0a04852c8edff8eeb45c1d15", license: "未声明" },
  { id: "xmind-relations", title: "XMind 关系图", source: "trae", path: ".trae-cn/skills/xmind_relationmap/SKILL.md", sha256: "6c07a7aa1af793cd82e97a93bc80b55e5690f26f5a0c92f147a1c116db3d099e", license: "未声明" },
  { id: "guofeng-history", title: "国风历史资料", source: "trae", path: ".trae-cn/skills/wenxin_guofenghistorydata/SKILL.md", sha256: "05a71d2cb3a707350f052765676146c3f56d83fff2a4b25b3d5c76b39aead338", license: "未声明" },
  { id: "qc-antidup", title: "小说反重复规范", source: "novel-project", path: "Desktop/小说/长篇/.trae/skills/Novel_AntiDuplication/SKILL.md", sha256: "4a33e6e31aa07c48d94fd303b964e24c65df41c7e2f2242f28a66cf955be0475", license: "未声明", executable: false, note: "规范/伪代码，尚非正式扫描器。" },
  { id: "qc-plotguard", title: "小说情节护栏规范", source: "novel-project", path: "Desktop/小说/长篇/.trae/skills/Novel_PlotGuard/SKILL.md", sha256: "dc7d4627c7d8663e78f6ae9a0e93afcd296363dbd9af59c958260a02e49943a3", license: "未声明", executable: false, note: "规范/伪代码，尚非正式扫描器。" },
  { id: "qc-fullscan", title: "小说全量质检规范", source: "novel-project", path: "Desktop/小说/长篇/.trae/skills/Novel_QC_FullScan/SKILL.md", sha256: "582e9f57e4489ea154e99f2b986177acd380e621de41204feb24e3fcd53b92a4", license: "未声明", executable: false, note: "规范/伪代码，尚非正式扫描器。" },
  { id: "qc-styleguard", title: "小说风格护栏规范", source: "novel-project", path: "Desktop/小说/长篇/.trae/skills/Novel_StyleGuard/SKILL.md", sha256: "31a056fdd1bb48901fcfcce1bb736bb9c5409b52e1bb01caa6fc8648156348d6", license: "未声明", executable: false, note: "规范/伪代码，尚非正式扫描器。" },
  { id: "project-context", title: "项目上下文", source: "collaboration", path: ".codex/skills/project-context/SKILL.md", sha256: "1f97e449a1f1a404652ab537cd7dfef99f2dffbe785bf8bb8593d761a2a94870", license: "未声明" },
  { id: "conversation-sync", title: "对话同步", source: "collaboration", path: ".codex/skills/conversation-sync/SKILL.md", sha256: "e8ac4d744117eb8ad67627de7206e421ab7ccbed6e57496805b76bc986d7bf84", license: "未声明" },
  { id: "session-memory", title: "会话记忆连续性", source: "collaboration", path: ".codex/skills/session-memory-continuity/SKILL.md", sha256: "601140bc23e2df82163a52050109db1e9e70f8cbee069e326ef8936edc2096e3", license: "未声明" },
  { id: "context-governance", title: "上下文工程治理", source: "collaboration", path: ".codex/skills/context-engineering-governance/SKILL.md", sha256: "38424524db7b4067439db7c29e20638beaacc69ae4bdbdce51f1af35bf541595", license: "未声明" },
  { id: "context-handoff", title: "上下文交接优化", source: "collaboration", path: ".codex/skills/context-handoff-optimizer/SKILL.md", sha256: "bee1eea05a9369fb556e938f5ee6c3a4a297277a10a3d2f1e8ea39f38d1716db", license: "未声明" },
  { id: "direct-tool-assignment", title: "直接工具分派", source: "collaboration", path: ".codex/skills/direct-tool-assignment/SKILL.md", sha256: "830311a2534d465d89cca196f97a87c883a931786df2924c5bc4ee6adfd261ed", license: "未声明" },
  { id: "cross-agent-delegation", title: "跨 Agent 委派", source: "collaboration", path: ".codex/skills/cross-agent-delegation/SKILL.md", sha256: "e79a63ea6675058768ca45d2be5fe647ac791fc5f241994bc8c4d0df031428ed", license: "未声明" },
  { id: "agent-team-orchestration", title: "Agent 团队编排", source: "collaboration", path: ".codex/skills/agent-team-orchestration/SKILL.md", sha256: "a99a2a459e13e295696eb1fc716d38d14961780989b6531d5334ad6d7489fce9", license: "未声明" },
  { id: "handoff-contract", title: "交接合同索引", source: "collaboration", path: ".codex/skills/handoff-contract-index/SKILL.md", sha256: "21902724ea92b6ed4aa15e775842a04625541436a13855344824e394a5cf95d8", license: "未声明" },
  { id: "output-attribution", title: "输出归属索引", source: "collaboration", path: ".codex/skills/output-attribution-index/SKILL.md", sha256: "06c8d79f5a29b69c575a461310af8415ceb357ffe204ca30fe101ed9bbe209e6", license: "未声明" },
  { id: "tri-agent-collaboration", title: "Codex / TRAE 三端协作", source: "collaboration", path: ".codex/skills/tri-agent-collaboration/SKILL.md", sha256: "382cc510206901c02290012e937d35e8dba0108b8eea28e6e8e2a384eb5aa828", license: "未声明", note: "仅通过公开 tri-agent CLI 适配，不接入 TRAE 私有 IPC。" },
  { id: "agent-narratologist", title: "叙事学 Agent", source: "codex-agent", path: ".codex/agents/academic-narratologist.toml", sha256: "807fa94b4655bde718ce82845f98a75450bf0c8d37512a2365150eedb160dea2", license: "未声明", executable: false, note: "能力标签；不复制私有提示词。" },
  { id: "agent-psychologist", title: "心理学 Agent", source: "codex-agent", path: ".codex/agents/academic-psychologist.toml", sha256: "001fdd6fdb0ec48afd2fdb9345ed9533dee4fb7ec0cb76483b5c975b524eed90", license: "未声明", executable: false, note: "能力标签；不复制私有提示词。" },
  { id: "agent-historian", title: "历史学 Agent", source: "codex-agent", path: ".codex/agents/academic-historian.toml", sha256: "987e29c7a0fceb9e8f60fd8b791df93f75e218d3d3e97034f733b6392b10783e", license: "未声明", executable: false, note: "能力标签；不复制私有提示词。" },
  { id: "agent-anthropologist", title: "人类学 Agent", source: "codex-agent", path: ".codex/agents/academic-anthropologist.toml", sha256: "9f80ca52af0281b2d7dea679c6dfdf077b9c28ac5d7b36d1ff5b41652a8a4f20", license: "未声明", executable: false, note: "能力标签；不复制私有提示词。" },
  { id: "agent-geographer", title: "地理学 Agent", source: "codex-agent", path: ".codex/agents/academic-geographer.toml", sha256: "952aabfd6fac2800587a8081b960f50659e4c47ed8f9062f30a13748ac651696", license: "未声明", executable: false, note: "能力标签；不复制私有提示词。" }
];

export const INKHUB_ACCEPTANCE_SKILL_DEFINITIONS: readonly InkHubLocalSkillDefinition[] = [
  { id: "novel-chapter-generate", title: "章节生成", source: "trae", path: ".inkhub-acceptance/skills/novel-chapter-generate/SKILL.md", sha256: "fa2e8e70ff9a6bdb2d8b49489d731b6744f7cb1344c9d37f43a829af8f563b05", license: "墨枢内置演示夹具", defaultEnabled: true },
  { id: "chapter-hook-generate", title: "章节钩子", source: "trae", path: ".inkhub-acceptance/skills/chapter-hook-generate/SKILL.md", sha256: "fa2e8e70ff9a6bdb2d8b49489d731b6744f7cb1344c9d37f43a829af8f563b05", license: "墨枢内置演示夹具", defaultEnabled: true },
  { id: "plot-pleasure-rhythm", title: "爽点节奏", source: "trae", path: ".inkhub-acceptance/skills/plot-pleasure-rhythm/SKILL.md", sha256: "fa2e8e70ff9a6bdb2d8b49489d731b6744f7cb1344c9d37f43a829af8f563b05", license: "墨枢内置演示夹具", defaultEnabled: true }
] as const;

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function containsPath(parent: string, candidate: string): boolean {
  const offset = relative(parent, candidate);
  return offset === "" || (!offset.startsWith(`..${sep}`) && offset !== ".." && !isAbsolute(offset));
}

function ignoredDirectory(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRECTORY_NAMES.has(name) || /^backup(?:_|-)/iu.test(name) || /(?:^|[-_])report$/iu.test(name);
}

function sensitiveBundleFile(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === ".env" ||
    normalized.startsWith(".env.") ||
    /\.(?:pem|key|p12|pfx|jks|keystore)$/u.test(normalized) ||
    /^(?:id_rsa|id_ed25519)$/u.test(normalized);
}

export class InkHubAssetStore {
  private readonly settingsPath: string;
  private readonly capabilitiesPath: string;
  private readonly initialNovelRoot: string | null;
  private readonly novelKnowledge: InkHubNovelKnowledgeService | null;
  private readonly qualityWorker: InkHubQualityWorkerClient | null;
  private writeChain: Promise<void> = Promise.resolve();
  private entries = new Map<string, InkHubNovelEntry>();
  private readonly freshnessCache = new Map<string, {
    entryPath: string;
    checkedAt: number;
    summary: InkHubNovelIndexSummary;
  }>();
  private readonly freshnessInFlight = new Map<string, Promise<InkHubNovelIndexSummary>>();

  constructor(
    userDataPath: string,
    private readonly homePath: string,
    private readonly skillDefinitions: readonly InkHubLocalSkillDefinition[] = SKILL_DEFINITIONS,
    initialNovelRoot?: string,
    qualityWorkerPath?: string
  ) {
    this.settingsPath = join(userDataPath, "config", "inkhub-assets.json");
    this.capabilitiesPath = join(userDataPath, "capabilities");
    const indexDirectory = join(userDataPath, "indexes", "novels");
    // Production never opens the multi-gigabyte SQLite index on Electron's
    // main thread. Tests without a compiled Worker keep the local fallback.
    this.novelKnowledge = qualityWorkerPath
      ? null
      : new InkHubNovelKnowledgeService(indexDirectory);
    this.qualityWorker = qualityWorkerPath
      ? new InkHubQualityWorkerClient(qualityWorkerPath, indexDirectory)
      : null;
    // A root may be injected by the isolated acceptance harness, but normal
    // installations start with no filesystem access until the user selects a
    // folder explicitly.
    this.initialNovelRoot = initialNovelRoot ? resolve(initialNovelRoot) : null;
  }

  private knowledge(): InkHubNovelKnowledgeService {
    if (!this.novelKnowledge) {
      throw new Error("小说索引后台服务尚未就绪。");
    }
    return this.novelKnowledge;
  }

  private async readSettingsUnlocked(): Promise<DiskAssetSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.settingsPath, "utf8")) as Omit<Partial<DiskAssetSettings>, "version"> & { version?: number };
      if (parsed.version !== 1 && parsed.version !== 2) throw new Error("unsupported settings version");
      return {
        version: 2,
        novelRoots: Array.isArray(parsed.novelRoots) ? parsed.novelRoots.filter((value): value is string => typeof value === "string") : [],
        enabledSkillIds: Array.isArray(parsed.enabledSkillIds) ? parsed.enabledSkillIds.filter((value): value is string => typeof value === "string") : [],
        installedSkillBundles: parsed.version === 2 && parsed.installedSkillBundles && typeof parsed.installedSkillBundles === "object"
          ? Object.fromEntries(Object.entries(parsed.installedSkillBundles).filter(([id, hash]) => typeof id === "string" && typeof hash === "string"))
          : {}
      };
    } catch (error: unknown) {
      if (isNodeError(error, "ENOENT")) {
        return {
          version: 2,
          novelRoots: [],
          enabledSkillIds: this.skillDefinitions.filter((skill) => skill.defaultEnabled).map((skill) => skill.id),
          installedSkillBundles: {}
        };
      }
      if (error instanceof SyntaxError || (error instanceof Error && error.message === "unsupported settings version")) {
        throw new Error("墨枢资产设置已损坏或版本不受支持；为保护现有目录和 Skill 状态，已停止自动覆盖。", { cause: error });
      }
      throw error;
    }
  }

  private async readSettings(): Promise<DiskAssetSettings> {
    await this.writeChain;
    return this.readSettingsUnlocked();
  }

  private async writeSettingsUnlocked(settings: DiskAssetSettings): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    const temporary = `${this.settingsPath}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, this.settingsPath);
    } catch (error: unknown) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async updateSettings(
    mutate: (settings: DiskAssetSettings) => DiskAssetSettings | Promise<DiskAssetSettings>
  ): Promise<void> {
    const operation = this.writeChain.then(async () => {
      const settings = await this.readSettingsUnlocked();
      await this.writeSettingsUnlocked(await mutate(settings));
    });
    this.writeChain = operation.then(() => undefined, () => undefined);
    await operation;
  }

  private async existingRoots(settings: DiskAssetSettings): Promise<string[]> {
    const requested = settings.novelRoots.length
      ? settings.novelRoots
      : this.initialNovelRoot
        ? [this.initialNovelRoot]
        : [];
    return [...new Set(requested.map((root) => resolve(root)))];
  }

  async addNovelRoot(rawPath: string): Promise<InkHubNovelSnapshot> {
    const info = await lstat(rawPath);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("小说来源必须是本地真实文件夹，不能是符号链接。");
    const canonical = await realpath(rawPath);
    await this.updateSettings(async (settings) => {
      const roots = await this.existingRoots(settings);
      if (!roots.includes(canonical)) roots.push(canonical);
      return { ...settings, novelRoots: roots };
    });
    return this.listNovels();
  }

  async removeNovelRoot(rootId: string): Promise<InkHubNovelSnapshot> {
    await this.updateSettings(async (settings) => {
      const roots = await this.existingRoots(settings);
      const retained = roots.filter((root) => sha256(root).slice(0, 20) !== rootId);
      if (retained.length === roots.length) throw new Error("没有找到要移除的小说来源。");
      return { ...settings, novelRoots: retained };
    });
    return this.listNovels();
  }

  private async rootSnapshot(path: string): Promise<InkHubNovelRoot> {
    try {
      const original = await lstat(path);
      if (original.isSymbolicLink() || !original.isDirectory()) {
        throw new Error("小说来源不再是原始本地目录。");
      }
      const canonical = await realpath(path);
      const info = await stat(canonical);
      return { id: sha256(canonical).slice(0, 20), path: canonical, label: basename(canonical), available: info.isDirectory() };
    } catch {
      return { id: sha256(path).slice(0, 20), path, label: basename(path), available: false };
    }
  }

  private async scanDocuments(projectPath: string): Promise<{ documents: ScannedDocument[]; truncated: boolean }> {
    const projectRoot = await realpath(projectPath);
    const documents: ScannedDocument[] = [];
    const pending: Array<{ path: string; depth: number }> = [{ path: projectRoot, depth: 0 }];
    let visitedDirectories = 0;
    let truncated = false;
    while (
      pending.length &&
      documents.length < MAX_DOCUMENTS_PER_ENTRY &&
      visitedDirectories < MAX_DIRECTORIES_PER_ENTRY
    ) {
      const current = pending.pop()!;
      visitedDirectories += 1;
      const directory = await opendir(current.path);
      for await (const item of directory) {
        if (item.isSymbolicLink()) continue;
        const absolutePath = join(current.path, item.name);
        if (item.isDirectory()) {
          if (current.depth < 12 && !ignoredDirectory(item.name)) pending.push({ path: absolutePath, depth: current.depth + 1 });
          continue;
        }
        const extension = extname(item.name).toLowerCase();
        if (!item.isFile() || !NOVEL_EXTENSIONS.has(extension)) continue;
        const info = await stat(absolutePath);
        documents.push({ absolutePath, relativePath: relative(projectRoot, absolutePath), size: info.size, updatedAt: info.mtime.toISOString(), extension });
        if (documents.length >= MAX_DOCUMENTS_PER_ENTRY) {
          truncated = true;
          break;
        }
      }
    }
    return { documents, truncated: truncated || pending.length > 0 };
  }

  private async candidateProjects(root: InkHubNovelRoot): Promise<Array<{ path: string; category: InkHubNovelEntry["category"] }>> {
    if (!root.available) return [];
    const candidates: Array<{ path: string; category: InkHubNovelEntry["category"] }> = [];
    const rootDirectory = await opendir(root.path);
    let rootContainsNovelFiles = false;
    let rootLooksLikeProject = false;
    const childDirectories: Array<{ name: string; path: string }> = [];
    for await (const item of rootDirectory) {
      if (item.isFile() && NOVEL_EXTENSIONS.has(extname(item.name).toLowerCase())) {
        rootContainsNovelFiles = true;
      } else if (item.isDirectory() && !item.isSymbolicLink()) {
        if (["chapters", "正文", "章节", "设定", ".trae"].includes(item.name)) {
          rootLooksLikeProject = true;
        }
        if (!ignoredDirectory(item.name)) {
          childDirectories.push({ name: item.name, path: join(root.path, item.name) });
        }
      }
      if (childDirectories.length > MAX_ENTRIES) break;
    }
    const hasCategoryDirectories = childDirectories.some((item) => item.name === "长篇" || item.name === "短篇");
    if (!hasCategoryDirectories && (rootContainsNovelFiles || rootLooksLikeProject)) {
      candidates.push({ path: root.path, category: "其他" });
      return candidates;
    }
    for (const item of childDirectories) {
      if (item.name === "长篇" || item.name === "短篇") {
        const categoryDirectory = await opendir(item.path);
        for await (const project of categoryDirectory) {
          if (project.isDirectory() && !project.isSymbolicLink() && !ignoredDirectory(project.name)) {
            candidates.push({ path: join(item.path, project.name), category: item.name });
            if (candidates.length >= MAX_ENTRIES) break;
          }
        }
      } else {
        candidates.push({ path: item.path, category: item.name.includes("系列") || item.name === "星河机甲" ? "系列" : "其他" });
      }
      if (candidates.length >= MAX_ENTRIES) break;
    }
    return candidates;
  }

  async listNovels(): Promise<InkHubNovelSnapshot> {
    const settings = await this.readSettings();
    const roots = await Promise.all((await this.existingRoots(settings)).map((root) => this.rootSnapshot(root)));
    const entries: InkHubNovelEntry[] = [];
    let truncated = false;
    for (const root of roots) {
      const projects = await this.candidateProjects(root);
      for (const project of projects) {
        try {
          const canonical = await realpath(project.path);
          if (!containsPath(root.path, canonical)) continue;
          const scan = await this.scanDocuments(canonical);
          if (!scan.documents.length) continue;
          const formats = [...new Set(scan.documents.map((document) => document.extension.slice(1)))].sort();
          const updatedAt = scan.documents.reduce<string | null>((latest, document) => !latest || document.updatedAt > latest ? document.updatedAt : latest, null);
          const id = sha256(canonical).slice(0, 24);
          entries.push({
            id,
            rootId: root.id,
            title: basename(canonical),
            category: project.category,
            path: canonical,
            relativePath: relative(root.path, canonical),
            documentCount: scan.documents.length,
            formats,
            updatedAt,
            hasAgentRules: await this.pathExists(join(canonical, "AGENTS.md")),
            hasTraeAssets: await this.pathExists(join(canonical, ".trae")),
            truncated: scan.truncated
          });
          if (entries.length >= MAX_ENTRIES) { truncated = true; break; }
        } catch {
          // A single unreadable project must not hide the rest of the library.
        }
      }
      if (entries.length >= MAX_ENTRIES) break;
    }
    entries.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.title.localeCompare(right.title, "zh-CN"));
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
    return { roots, entries, scannedAt: new Date().toISOString(), truncated };
  }

  private async pathExists(path: string): Promise<boolean> {
    try { await lstat(path); return true; } catch { return false; }
  }

  private async requireEntry(entryId: string): Promise<InkHubNovelEntry> {
    let entry = this.entries.get(entryId);
    if (!entry) {
      await this.listNovels();
      entry = this.entries.get(entryId);
    }
    if (!entry) throw new Error("小说条目不存在或来源当前不可用。");
    const entryInfo = await lstat(entry.path);
    if (entryInfo.isSymbolicLink() || !entryInfo.isDirectory()) {
      throw new Error("小说目录已被替换或不再可用，请刷新资料库后重试。");
    }
    const canonical = await realpath(entry.path);
    if (canonical !== entry.path) {
      throw new Error("小说目录路径在索引后发生变化，请刷新资料库后重试。");
    }
    const settings = await this.readSettings();
    const roots = await Promise.all((await this.existingRoots(settings)).map((root) => this.rootSnapshot(root)));
    const authorizedRoot = roots.find((root) => root.id === entry!.rootId && root.available);
    if (!authorizedRoot || !containsPath(authorizedRoot.path, canonical)) {
      throw new Error("小说目录已超出当前授权的来源范围。");
    }
    return entry;
  }

  async listNovelDocuments(entryId: string): Promise<InkHubNovelDocumentList> {
    const entry = await this.requireEntry(entryId);
    const scan = await this.scanDocuments(entry.path);
    return {
      entryId,
      documents: scan.documents.map((document) => ({ relativePath: document.relativePath, title: basename(document.relativePath), extension: document.extension.slice(1), size: document.size, updatedAt: document.updatedAt })),
      truncated: scan.truncated
    };
  }

  async readNovelDocument(entryId: string, rawRelativePath: string): Promise<InkHubNovelDocumentPreview> {
    const entry = await this.requireEntry(entryId);
    const entryRoot = await realpath(entry.path);
    const requested = resolve(entryRoot, rawRelativePath);
    if (!containsPath(entryRoot, requested) || !PREVIEW_EXTENSIONS.has(extname(requested).toLowerCase())) {
      throw new Error("只支持预览小说目录内的 Markdown 或 TXT 文件。");
    }
    const canonical = await realpath(requested);
    if (!containsPath(entryRoot, canonical)) throw new Error("文档路径超出小说目录。");
    const info = await stat(canonical);
    if (!info.isFile()) throw new Error("所选路径不是文件。");
    const handle = await open(canonical, "r");
    try {
      const buffer = Buffer.alloc(Math.min(MAX_PREVIEW_BYTES + 1, info.size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
      const truncated = info.size > MAX_PREVIEW_BYTES || bytesRead > MAX_PREVIEW_BYTES;
      return {
        entryId,
        relativePath: relative(entryRoot, canonical),
        content: buffer.subarray(0, Math.min(bytesRead, MAX_PREVIEW_BYTES)).toString("utf8"),
        truncated,
        readOnly: true
      };
    } finally {
      await handle.close();
    }
  }

  async getNovelPath(entryId: string): Promise<string> {
    return (await this.requireEntry(entryId)).path;
  }

  async getNovelEntry(entryId: string): Promise<InkHubNovelEntry> {
    return { ...(await this.requireEntry(entryId)) };
  }

  private rememberFreshness(
    entryId: string,
    entryPath: string,
    summary: InkHubNovelIndexSummary
  ): InkHubNovelIndexSummary {
    this.freshnessCache.set(entryId, {
      entryPath,
      checkedAt: Date.now(),
      summary
    });
    return summary;
  }

  private async ensureNovelFreshness(
    entryId: string,
    entryPath: string
  ): Promise<InkHubNovelIndexSummary> {
    const cached = this.freshnessCache.get(entryId);
    if (
      cached?.entryPath === entryPath &&
      Date.now() - cached.checkedAt < NOVEL_FRESHNESS_CACHE_MS
    ) {
      return cached.summary;
    }
    const pending = this.freshnessInFlight.get(entryId);
    if (pending) return pending;
    const operation = (
      this.qualityWorker
        ? this.qualityWorker.refresh(entryId, entryPath)
        : this.knowledge().refreshSourceFreshness(entryId, entryPath)
    ).then((summary) => this.rememberFreshness(entryId, entryPath, summary));
    this.freshnessInFlight.set(entryId, operation);
    try {
      return await operation;
    } finally {
      if (this.freshnessInFlight.get(entryId) === operation) {
        this.freshnessInFlight.delete(entryId);
      }
    }
  }

  async getNovelIndex(
    entryId: string,
    verifyFreshness = true
  ): Promise<InkHubNovelIndexSummary> {
    const entry = await this.requireEntry(entryId);
    if (!verifyFreshness) {
      return this.qualityWorker
        ? this.qualityWorker.summary(entryId)
        : this.knowledge().getSummary(entryId);
    }
    return this.ensureNovelFreshness(entryId, entry.path);
  }

  async buildNovelIndex(entryId: string): Promise<InkHubNovelIndexSummary> {
    const entry = await this.requireEntry(entryId);
    const input = { entryId, title: entry.title, entryPath: entry.path };
    const summary = this.qualityWorker
      ? await this.qualityWorker.build(input)
      : await this.knowledge().build(input);
    return this.rememberFreshness(entryId, entry.path, summary);
  }

  async listNovelChapters(entryId: string, offset: number, limit: number): Promise<InkHubNovelChapterCatalog> {
    const entry = await this.requireEntry(entryId);
    await this.ensureNovelFreshness(entryId, entry.path);
    return this.qualityWorker
      ? this.qualityWorker.listChapters(entryId, offset, limit)
      : this.knowledge().listChapters(entryId, offset, limit);
  }

  async readNovelChapter(entryId: string, chapterId: string, offset: number, limit: number): Promise<InkHubNovelChapterPage> {
    const entry = await this.requireEntry(entryId);
    await this.ensureNovelFreshness(entryId, entry.path);
    return this.qualityWorker
      ? this.qualityWorker.readChapter(entryId, chapterId, offset, limit)
      : this.knowledge().readChapter(entryId, chapterId, offset, limit);
  }

  async searchNovel(entryId: string, query: string, limit: number): Promise<InkHubNovelSearchResponse> {
    const entry = await this.requireEntry(entryId);
    await this.ensureNovelFreshness(entryId, entry.path);
    return this.qualityWorker
      ? this.qualityWorker.search(entryId, query, limit)
      : this.knowledge().search(entryId, query, limit);
  }

  async runNovelQualityCheck(entryId: string): Promise<InkHubNovelQualityReport> {
    const entry = await this.requireEntry(entryId);
    await this.ensureNovelFreshness(entryId, entry.path);
    return this.qualityWorker
      ? this.qualityWorker.run(entryId)
      : this.knowledge().runLocalQualityCheck(entryId);
  }

  async applyNovelChapterRepair(input: InkHubNovelChapterRepairInput): Promise<InkHubNovelChapterRepairResult> {
    const entry = await this.requireEntry(input.entryId);
    const result = this.qualityWorker
      ? await this.qualityWorker.applyChapterRepair(input, entry.path)
      : await this.knowledge().applyChapterRepair({ ...input, entryPath: entry.path });
    this.rememberFreshness(input.entryId, entry.path, result.summary);
    return result;
  }

  async applyNovelChapterRepairs(input: InkHubNovelBatchRepairInput): Promise<InkHubNovelBatchRepairResult> {
    const entry = await this.requireEntry(input.entryId);
    const before = await this.runNovelQualityCheck(input.entryId);
    const applied = this.qualityWorker
      ? await this.qualityWorker.applyChapterRepairs(input, entry.path)
      : await this.knowledge().applyChapterRepairs({
          entryId: input.entryId,
          entryPath: entry.path,
          repairs: input.repairs
        });
    this.rememberFreshness(input.entryId, entry.path, applied.summary);
    const after = await this.runNovelQualityCheck(input.entryId);
    const beforeIds = new Set(before.issues.map((issue) => issue.id));
    const afterIds = new Set(after.issues.map((issue) => issue.id));
    return {
      ...applied,
      reaudit: {
        generatedAt: after.generatedAt,
        beforeIssueCount: before.issues.length,
        afterIssueCount: after.issues.length,
        resolvedIssueIds: [...beforeIds].filter((id) => !afterIds.has(id)),
        remainingIssueIds: [...beforeIds].filter((id) => afterIds.has(id)),
        newIssueIds: [...afterIds].filter((id) => !beforeIds.has(id))
      }
    };
  }

  async createNovelContext(entryId: string, purpose: "quality-check" | "continue-writing"): Promise<InkHubNovelContextPacket> {
    const entry = await this.requireEntry(entryId);
    await this.ensureNovelFreshness(entryId, entry.path);
    return this.qualityWorker
      ? this.qualityWorker.context(entryId, purpose)
      : this.knowledge().createContextPacket(entryId, purpose);
  }

  async getNovelReadingProgress(entryId: string): Promise<InkHubNovelReadingProgress | null> {
    await this.requireEntry(entryId);
    return this.qualityWorker
      ? this.qualityWorker.getProgress(entryId)
      : this.knowledge().getProgress(entryId);
  }

  async saveNovelReadingProgress(input: Omit<InkHubNovelReadingProgress, "updatedAt">): Promise<InkHubNovelReadingProgress> {
    await this.requireEntry(input.entryId);
    return this.qualityWorker
      ? this.qualityWorker.saveProgress(input)
      : this.knowledge().saveProgress(input);
  }

  async planIllustrations(entryId: string, count: number): Promise<InkHubIllustrationPlan> {
    const entry = await this.requireEntry(entryId);
    if (entry.category !== "短篇") {
      throw new Error("自动插图当前只面向短篇小说；长篇请先选择具体章节后再生成。");
    }
    const documents = (await this.listNovelDocuments(entryId)).documents
      .filter((document) => document.extension === "md" || document.extension === "txt")
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN", { numeric: true }));
    if (!documents.length) throw new Error("这部短篇没有可读取的 Markdown 或 TXT 正文。");
    const selected = Array.from({ length: Math.min(count, documents.length) }, (_, index) =>
      documents[Math.min(documents.length - 1, Math.floor(index * documents.length / Math.min(count, documents.length)))]!
    ).filter((document, index, values) => values.findIndex((value) => value.relativePath === document.relativePath) === index);
    const items = [];
    for (const document of selected) {
      const preview = await this.readNovelDocument(entryId, document.relativePath);
      const paragraphs = preview.content
        .replace(/^---[\s\S]*?---/u, "")
        .split(/\n\s*\n/u)
        .map((paragraph) => paragraph.replace(/^#{1,6}\s+/gmu, "").replace(/[`*_>]/gu, "").replace(/\s+/gu, " ").trim())
        .filter((paragraph) => paragraph.length >= 45 && !paragraph.startsWith("http"));
      const excerpt = (paragraphs[0] ?? preview.content.replace(/\s+/gu, " ").trim()).slice(0, 700);
      if (!excerpt) continue;
      const chapterTitle = document.title.replace(/\.(?:md|txt)$/iu, "");
      items.push({
        id: sha256(`${entryId}:${document.relativePath}`).slice(0, 20),
        documentPath: document.relativePath,
        chapterTitle,
        excerpt,
        prompt: `为中文短篇小说《${entry.title}》的“${chapterTitle}”创作一幅叙事插图。画面必须对应这个片段：${excerpt}。突出一个清晰的情绪焦点与动作瞬间，人物外观、时代、服饰、光线和色彩保持统一；不要出现文字、水印、边框或界面元素。`
      });
    }
    if (!items.length) throw new Error("没有从短篇正文中提取到适合配图的场景。");
    return { entryId, novelTitle: entry.title, items, localHeuristic: true };
  }

  async createMediaOutputPath(
    entryId: string,
    kind: "cover" | "illustration",
    rawStem: string
  ): Promise<string> {
    const entryRoot = await realpath((await this.requireEntry(entryId)).path);
    const assetsPath = join(entryRoot, "assets");
    try {
      if ((await lstat(assetsPath)).isSymbolicLink()) throw new Error("小说 assets 目录不能是符号链接。");
    } catch (error: unknown) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
    const folderPath = join(assetsPath, kind === "cover" ? "墨枢封面" : "墨枢插图");
    await mkdir(folderPath, { recursive: true });
    const canonicalFolder = await realpath(folderPath);
    if (!containsPath(entryRoot, canonicalFolder)) throw new Error("媒体输出目录超出小说目录。");
    await access(canonicalFolder, fsConstants.W_OK);
    const safeStem = rawStem
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "-")
      .replace(/\s+/gu, "-")
      .replace(/-+/gu, "-")
      .slice(0, 80) || kind;
    return join(canonicalFolder, `${Date.now()}-${safeStem}.png`);
  }

  async assertMediaPath(entryId: string, rawPath: string): Promise<string> {
    const entryRoot = await realpath((await this.requireEntry(entryId)).path);
    const canonical = await realpath(rawPath);
    if (!containsPath(entryRoot, canonical) || extname(canonical).toLowerCase() !== ".png") {
      throw new Error("只能打开当前小说目录内由墨枢保存的 PNG 图片。");
    }
    return canonical;
  }

  private resolveSkillPath(definition: InkHubLocalSkillDefinition): string {
    return resolve(this.homePath, definition.path);
  }

  private capabilityKind(definition: InkHubLocalSkillDefinition): InkHubSkillRecord["capabilityKind"] {
    if (definition.source === "codex-agent") return "agent-template";
    if (definition.source === "novel-project") return "spec";
    if (definition.source === "collaboration") return "reference";
    return "prompt-skill";
  }

  private skillKind(definition: InkHubLocalSkillDefinition): "general" | "plot" | "style" | "other" {
    const plot = new Set([
      "novel-outline-refine", "chapter-hook-generate", "plot-pleasure-rhythm",
      "novel-anti-trope", "novel-setting-check", "consistency-check", "logic-check"
    ]);
    const style = new Set([
      "novel-chapter-generate", "emotion-write", "novel-text-polish", "dialogue-vivid",
      "emotion-detail", "character-vivid", "scene-visual", "layout-fluent"
    ]);
    const other = new Set(["sensitive-check", "scrivener-structure", "xmind-relations", "guofeng-history"]);
    if (plot.has(definition.id)) return "plot";
    if (style.has(definition.id)) return "style";
    if (other.has(definition.id)) return "other";
    return "general";
  }

  private installedSkillPath(definition: InkHubLocalSkillDefinition, settings: DiskAssetSettings): string | null {
    const bundle = settings.installedSkillBundles[definition.id];
    return bundle ? join(this.capabilitiesPath, definition.id, bundle, "SKILL.md") : null;
  }

  private async verifyInstalledSkillBundle(
    definition: InkHubLocalSkillDefinition,
    settings: DiskAssetSettings
  ): Promise<{ installed: boolean; runtimeEligible: boolean }> {
    const skillPath = this.installedSkillPath(definition, settings);
    if (!skillPath) return { installed: false, runtimeEligible: false };
    const bundleRoot = dirname(skillPath);
    const bundleHash = basename(bundleRoot);
    try {
      const rawManifest = JSON.parse(await readFile(join(bundleRoot, "capability.json"), "utf8")) as {
        id?: unknown;
        sourceSkillSha256?: unknown;
        bundleSha256?: unknown;
        files?: unknown;
      };
      if (
        rawManifest.id !== definition.id ||
        rawManifest.sourceSkillSha256 !== definition.sha256 ||
        rawManifest.bundleSha256 !== bundleHash ||
        !Array.isArray(rawManifest.files) ||
        rawManifest.files.length === 0 ||
        rawManifest.files.length > 1_000
      ) {
        return { installed: false, runtimeEligible: false };
      }
      const verifiedEntries: Array<{ path: string; sha256: string; size: number }> = [];
      let totalBytes = 0;
      for (const rawEntry of rawManifest.files) {
        if (!rawEntry || typeof rawEntry !== "object") return { installed: false, runtimeEligible: false };
        const record = rawEntry as Record<string, unknown>;
        if (
          typeof record.path !== "string" ||
          typeof record.sha256 !== "string" ||
          typeof record.size !== "number" ||
          isAbsolute(record.path) ||
          record.path.includes("\\")
        ) {
          return { installed: false, runtimeEligible: false };
        }
        const filePath = resolve(bundleRoot, record.path);
        if (!containsPath(bundleRoot, filePath) || sensitiveBundleFile(basename(filePath))) {
          return { installed: false, runtimeEligible: false };
        }
        const fileInfo = await lstat(filePath);
        if (fileInfo.isSymbolicLink() || !fileInfo.isFile() || fileInfo.size !== record.size) {
          return { installed: false, runtimeEligible: false };
        }
        const content = await readFile(filePath);
        totalBytes += content.byteLength;
        if (totalBytes > 20_000_000 || sha256(content) !== record.sha256) {
          return { installed: false, runtimeEligible: false };
        }
        verifiedEntries.push({ path: record.path, sha256: record.sha256, size: record.size });
      }
      verifiedEntries.sort((left, right) => left.path.localeCompare(right.path));
      const installed = sha256(JSON.stringify(verifiedEntries)) === bundleHash &&
        verifiedEntries.some((entry) => entry.path === "SKILL.md" && entry.sha256 === definition.sha256);
      const skillEntry = verifiedEntries.find((entry) => entry.path === "SKILL.md");
      return {
        installed,
        runtimeEligible: installed && Boolean(skillEntry && skillEntry.size <= MAX_SKILL_BYTES)
      };
    } catch {
      return { installed: false, runtimeEligible: false };
    }
  }

  private async installSkillBundle(definition: InkHubLocalSkillDefinition): Promise<string> {
    const sourceRoot = dirname(this.resolveSkillPath(definition));
    const staging = join(this.capabilitiesPath, `.staging-${definition.id}-${process.pid}-${Date.now()}`);
    const entries: Array<{ path: string; sha256: string; size: number }> = [];
    let totalBytes = 0;
    try {
      await mkdir(staging, { recursive: true });
      const pending: Array<{ source: string; relativePath: string }> = [{ source: sourceRoot, relativePath: "" }];
      while (pending.length) {
        const current = pending.pop()!;
        const directory = await opendir(current.source);
        for await (const item of directory) {
          if ([".DS_Store", "__pycache__"].includes(item.name) || item.name.endsWith(".pyc")) continue;
          if (item.isSymbolicLink()) throw new Error(`Skill bundle 含符号链接，已拒绝安装：${item.name}`);
          const childSource = join(current.source, item.name);
          const childRelative = current.relativePath ? join(current.relativePath, item.name) : item.name;
          if (item.isDirectory()) {
            pending.push({ source: childSource, relativePath: childRelative });
            continue;
          }
          if (!item.isFile()) continue;
          if (sensitiveBundleFile(item.name)) {
            throw new Error(`Skill bundle 含潜在凭证文件，已拒绝安装：${item.name}`);
          }
          const content = await readFile(childSource);
          totalBytes += content.byteLength;
          if (entries.length >= 1_000 || totalBytes > 20_000_000) throw new Error("Skill bundle 超过本地安装安全上限。");
          const destination = join(staging, childRelative);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, content, { mode: 0o600 });
          entries.push({ path: childRelative.split(sep).join("/"), sha256: sha256(content), size: content.byteLength });
        }
      }
      if (!entries.some((entry) => entry.path === "SKILL.md")) throw new Error("Skill bundle 缺少 SKILL.md。");
      entries.sort((left, right) => left.path.localeCompare(right.path));
      const bundleHash = sha256(JSON.stringify(entries));
      await writeFile(join(staging, "capability.json"), `${JSON.stringify({
        schemaVersion: 1,
        id: definition.id,
        sourcePath: sourceRoot,
        sourceSkillSha256: definition.sha256,
        bundleSha256: bundleHash,
        files: entries
      }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      const parent = join(this.capabilitiesPath, definition.id);
      const destination = join(parent, bundleHash);
      await mkdir(parent, { recursive: true });
      try {
        await rename(staging, destination);
      } catch (error: unknown) {
        if (!isNodeError(error, "EEXIST") && !isNodeError(error, "ENOTEMPTY")) throw error;
        await rm(staging, { recursive: true, force: true });
      }
      return bundleHash;
    } catch (error: unknown) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async installSkills(): Promise<InkHubSkillSnapshot> {
    await this.updateSettings(async (settings) => {
      const installedSkillBundles = { ...settings.installedSkillBundles };
      for (const definition of this.skillDefinitions) {
        if (this.capabilityKind(definition) !== "prompt-skill" || definition.executable === false) continue;
        const current = await this.inspectSkill(definition, { ...settings, installedSkillBundles });
        if (current.status !== "verified" || current.installState === "installed") continue;
        installedSkillBundles[definition.id] = await this.installSkillBundle(definition);
      }
      return { ...settings, installedSkillBundles };
    });
    return this.listSkills();
  }

  private async inspectSkill(definition: InkHubLocalSkillDefinition, settings: DiskAssetSettings): Promise<InkHubSkillRecord> {
    const path = this.resolveSkillPath(definition);
    let actualSha256: string | null = null;
    try {
      const content = await readFile(path);
      actualSha256 = sha256(content);
    } catch {
      // Missing is represented explicitly in the returned record.
    }
    const capabilityKind = this.capabilityKind(definition);
    const executable = capabilityKind === "prompt-skill" && definition.executable !== false;
    const { installed, runtimeEligible } = await this.verifyInstalledSkillBundle(definition, settings);
    const enabled = settings.enabledSkillIds.includes(definition.id) && runtimeEligible && executable;
    const runtimeState = capabilityKind === "reference" || capabilityKind === "spec"
      ? "adapter-required" as const
      : capabilityKind === "agent-template"
        ? "disabled" as const
        : runtimeEligible
          ? enabled ? "ready" as const : "disabled" as const
          : actualSha256 === definition.sha256 ? "disabled" as const : "source-error" as const;
    return {
      id: definition.id,
      title: definition.title,
      source: definition.source,
      path,
      expectedSha256: definition.sha256,
      actualSha256,
      status: actualSha256 === null ? "missing" : actualSha256 === definition.sha256 ? "verified" : "changed",
      license: definition.license,
      enabled,
      executable,
      capabilityKind,
      ...(capabilityKind === "prompt-skill" ? { skillKind: this.skillKind(definition) } : {}),
      installState: installed
        ? runtimeEligible ? "installed" : "blocked"
        : executable && actualSha256 === definition.sha256 ? "available" : "blocked",
      runtimeState,
      ...(definition.conflictGroup ? { conflictGroup: definition.conflictGroup } : {}),
      ...(definition.note ? { note: definition.note } : {})
    };
  }

  async listSkills(): Promise<InkHubSkillSnapshot> {
    const settings = await this.readSettings();
    const skills = await Promise.all(this.skillDefinitions.map((definition) => this.inspectSkill(definition, settings)));
    return { skills, verifiedAt: new Date().toISOString() };
  }

  async setSkillEnabled(skillId: string, enabled: boolean): Promise<InkHubSkillSnapshot> {
    const definition = this.skillDefinitions.find((skill) => skill.id === skillId);
    if (!definition) throw new Error("没有找到该本机 Skill。");
    await this.updateSettings(async (settings) => {
      const current = await this.inspectSkill(definition, settings);
      if (enabled && (current.installState !== "installed" || !current.executable)) {
        throw new Error(current.executable ? "该 Skill 未通过完整性或运行大小校验，不能启用。" : "该条目是参考规范或 Agent 模板，不能作为 Skill 注入。");
      }
      let enabledIds = settings.enabledSkillIds.filter((id) => id !== skillId);
      if (enabled) {
        if (definition.conflictGroup) {
          const conflicts = new Set(this.skillDefinitions.filter((item) => item.conflictGroup === definition.conflictGroup).map((item) => item.id));
          enabledIds = enabledIds.filter((id) => !conflicts.has(id));
        }
        enabledIds.push(skillId);
      }
      return { ...settings, enabledSkillIds: [...new Set(enabledIds)] };
    });
    return this.listSkills();
  }

  async readSkill(skillId: string): Promise<InkHubSkillPreview> {
    const definition = this.skillDefinitions.find((skill) => skill.id === skillId);
    if (!definition) throw new Error("没有找到该本机 Skill。");
    const settings = await this.readSettings();
    const path = this.installedSkillPath(definition, settings);
    if (!path) throw new Error("Skill 尚未安装到墨枢本机能力目录。");
    const verified = await this.verifyInstalledSkillBundle(definition, settings);
    if (!verified.installed || !verified.runtimeEligible) {
      throw new Error("已安装 Skill bundle 完整性或运行大小校验失败；墨枢已拒绝读取。");
    }
    const content = await readFile(path);
    const currentSha = sha256(content);
    if (currentSha !== definition.sha256) throw new Error("已安装 Skill 入口校验失败；为避免执行损坏内容，墨枢已拒绝读取。");
    return { id: skillId, content: content.subarray(0, MAX_SKILL_BYTES).toString("utf8"), truncated: content.byteLength > MAX_SKILL_BYTES, readOnly: true };
  }

  async attachedSkills(): Promise<InkHubAttachedSkills> {
    const snapshot = await this.listSkills();
    const enabled = snapshot.skills.filter((skill) => skill.enabled && skill.installState === "installed" && skill.runtimeState === "ready" && skill.skillKind);
    const skills = await Promise.all(enabled.map(async (skill) => {
      const preview = await this.readSkill(skill.id);
      return { id: `inkhub:${skill.id}`, title: skill.title, content: preview.content, kind: skill.skillKind!, source: "attached-skill" as const };
    }));
    return { skills };
  }
}
