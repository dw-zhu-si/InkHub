<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  InkHubCoverPlatformPreset,
  InkHubCoverStyle,
  InkHubCoverStyleId,
  InkHubGeneratedMedia,
  InkHubIllustrationPlan,
  InkHubNovelDocument,
  InkHubNovelDocumentPreview,
  InkHubNovelEntry,
  InkHubNovelSnapshot,
  InkHubSkillPreview,
  InkHubSkillSnapshot
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import PopupSelect from "./PopupSelect.vue";
import InkHubNovelReader from "./InkHubNovelReader.vue";
import InkHubIndexCenter from "./InkHubIndexCenter.vue";
import { uiMessage } from "../ui-feedback";
import {
  INKHUB_NATIVE_AGENTS,
  ensureInkHubCapabilities
} from "../utils/inkhubNativeCapabilities";
import { INKHUB_STYLE_PRESETS } from "../utils/inkhubStylePresets";
import { INKHUB_PLOT_SKILLS } from "../utils/inkhubPlotSkills";
import { INKHUB_STORY_KERNEL_SKILLS } from "../utils/inkhubStoryKernelSkills";
import { INKHUB_COVER_SKILLS } from "../utils/inkhubCoverSkills";

type Tab = "novels" | "skills" | "agents" | "media";

const emit = defineEmits<{ catalogChanged: [] }>();

const tab = ref<Tab>("novels");
const loading = ref(false);
const novelSnapshot = ref<InkHubNovelSnapshot | null>(null);
const skillSnapshot = ref<InkHubSkillSnapshot | null>(null);
const query = ref("");
const category = ref("全部");
const selectedEntry = ref<InkHubNovelEntry | null>(null);
const readerEntry = ref<InkHubNovelEntry | null>(null);
const documents = ref<InkHubNovelDocument[]>([]);
const documentsTruncated = ref(false);
const documentPreview = ref<InkHubNovelDocumentPreview | null>(null);
const selectedDocument = ref<string | null>(null);
const selectedSkillId = ref<string | null>(null);
const skillPreview = ref<InkHubSkillPreview | null>(null);
const skillSource = ref("全部");
const capabilityInstalling = ref(false);
const capabilityMessage = ref("正在检查本机能力…");
const installedAgentIds = ref(new Set<string>());
const installedNativeSkillIds = ref(new Set<string>());
const installedStylePresetIds = ref(new Set<string>());
const installedPlotSkillIds = ref(new Set<string>());
const installedStoryKernelSkillIds = ref(new Set<string>());
const installedCoverSkillIds = ref(new Set<string>());
const coverPresets = ref<InkHubCoverPlatformPreset[]>([]);
const coverStyles = ref<InkHubCoverStyle[]>([]);
const mediaEntryId = ref("");
const mediaModelId = ref("");
const coverPlatformId = ref("web-fiction");
const coverStyleId = ref<InkHubCoverStyleId>("ink-gold-fantasy");
const coverTitle = ref("");
const coverAuthor = ref("");
const coverPrompt = ref("具有辨识度的核心意象，电影感光影，克制的东方美学，主体适合缩略图阅读");
const billableConfirmed = ref(false);
const mediaLoading = ref(false);
const generatedCover = ref<InkHubGeneratedMedia | null>(null);
const illustrationCount = ref("4");
const illustrationPlan = ref<InkHubIllustrationPlan | null>(null);
const generatedIllustrations = ref<Record<string, InkHubGeneratedMedia>>({});
const generatingIllustrationId = ref<string | null>(null);
let novelSelectionRequest = 0;
let documentPreviewRequest = 0;
let mediaSelectionEpoch = 0;

const categoryOptions = ["全部", "长篇", "短篇", "系列", "其他"].map((value) => ({ value, label: value }));
const sourceOptions = [
  { value: "全部", label: "全部来源" },
  { value: "codex", label: "Codex" },
  { value: "trae", label: "TRAE" },
  { value: "novel-project", label: "小说项目" },
  { value: "collaboration", label: "协作" },
  { value: "codex-agent", label: "Codex Agents" }
];
const illustrationCountOptions = ["2", "4", "6", "8"].map((value) => ({
  value,
  label: `${value} 张`
}));

const filteredEntries = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase("zh-CN");
  return (novelSnapshot.value?.entries ?? []).filter((entry) =>
    (category.value === "全部" || entry.category === category.value) &&
    (!keyword || `${entry.title}\n${entry.relativePath}`.toLocaleLowerCase("zh-CN").includes(keyword))
  );
});

const filteredSkills = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase("zh-CN");
  return (skillSnapshot.value?.skills ?? []).filter((skill) => skill.capabilityKind !== "agent-template" &&
    (skillSource.value === "全部" || skill.source === skillSource.value) &&
    (!keyword || `${skill.title}\n${skill.path}`.toLocaleLowerCase("zh-CN").includes(keyword))
  );
});

const promptSkillCount = computed(() => (skillSnapshot.value?.skills ?? []).filter((skill) => skill.capabilityKind === "prompt-skill").length);
const installedPromptSkillCount = computed(() => (skillSnapshot.value?.skills ?? []).filter((skill) => skill.capabilityKind === "prompt-skill" && skill.installState === "installed").length);
const mediaEntry = computed(() => (novelSnapshot.value?.entries ?? []).find((entry) => entry.id === mediaEntryId.value) ?? null);
const mediaNovelOptions = computed(() => (novelSnapshot.value?.entries ?? []).map((entry) => ({ value: entry.id, label: `${entry.title} · ${entry.category}` })));
const mediaModelOptions = ref<Array<{ value: string; label: string }>>([]);
const coverPresetOptions = computed(() => coverPresets.value.map((preset) => ({ value: preset.id, label: `${preset.label} · ${preset.width}×${preset.height}` })));
const coverStyleOptions = computed(() => coverStyles.value.map((style) => ({ value: style.id, label: style.label })));
const selectedCoverPreset = computed(() => coverPresets.value.find((preset) => preset.id === coverPlatformId.value) ?? null);
const selectedCoverStyle = computed(() => coverStyles.value.find((style) => style.id === coverStyleId.value) ?? null);

function api() {
  if (!window.deepwrite?.inkHub) throw new Error("墨枢资料库只在桌面客户端中可用。");
  return window.deepwrite.inkHub;
}

function formatDate(value: string | null): string {
  if (!value) return "暂无修改时间";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 ** 2) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_024 ** 2).toFixed(1)} MB`;
}

async function refreshNovels(): Promise<void> {
  loading.value = true;
  try {
    novelSnapshot.value = await api().listNovels();
    if (selectedEntry.value) {
      selectedEntry.value = novelSnapshot.value.entries.find((entry) => entry.id === selectedEntry.value?.id) ?? null;
    }
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "读取小说目录失败");
  } finally {
    loading.value = false;
  }
}

async function addNovelRoot(): Promise<void> {
  loading.value = true;
  try {
    const snapshot = await api().chooseNovelRoot();
    if (snapshot) {
      novelSnapshot.value = snapshot;
      uiMessage.success("小说目录已加入；墨枢只保存引用，不会搬移原文件");
    }
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "添加小说目录失败");
  } finally {
    loading.value = false;
  }
}

async function removeRoot(rootId: string): Promise<void> {
  try {
    novelSnapshot.value = await api().removeNovelRoot(rootId);
    selectedEntry.value = null;
    documents.value = [];
    documentPreview.value = null;
    uiMessage.success("已移除目录引用；磁盘中的小说文件没有变化");
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "移除引用失败");
  }
}

async function selectNovel(entry: InkHubNovelEntry): Promise<void> {
  const request = ++novelSelectionRequest;
  selectedEntry.value = entry;
  documents.value = [];
  documentPreview.value = null;
  selectedDocument.value = null;
  try {
    const result = await api().listNovelDocuments(entry.id);
    if (request !== novelSelectionRequest || selectedEntry.value?.id !== entry.id) return;
    documents.value = result.documents;
    documentsTruncated.value = result.truncated;
  } catch (error: unknown) {
    if (request !== novelSelectionRequest) return;
    uiMessage.error(error instanceof Error ? error.message : "读取小说文档失败");
  }
}

async function previewDocument(document: InkHubNovelDocument): Promise<void> {
  if (!selectedEntry.value) return;
  if (!['md', 'txt'].includes(document.extension)) {
    uiMessage.warning("PDF、EPUB 与 DOCX 当前只登记，不在应用内解析；可在 Finder 中打开");
    return;
  }
  const entryId = selectedEntry.value.id;
  const request = ++documentPreviewRequest;
  selectedDocument.value = document.relativePath;
  try {
    const preview = await api().readNovelDocument(entryId, document.relativePath);
    if (
      request !== documentPreviewRequest ||
      selectedEntry.value?.id !== entryId ||
      selectedDocument.value !== document.relativePath
    ) return;
    documentPreview.value = preview;
  } catch (error: unknown) {
    if (request !== documentPreviewRequest) return;
    uiMessage.error(error instanceof Error ? error.message : "预览文档失败");
  }
}

async function refreshSkills(): Promise<void> {
  loading.value = true;
  try {
    skillSnapshot.value = await api().listSkills();
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "核验本机 Skills 失败");
  } finally {
    loading.value = false;
  }
}

async function installCapabilities(): Promise<void> {
  const desktop = window.deepwrite;
  if (!desktop?.inkHub) return;
  capabilityInstalling.value = true;
  capabilityMessage.value = "正在把本机小说 Skills 安装到墨枢私有能力目录…";
  try {
    const { snapshot, result: installed } = await ensureInkHubCapabilities(desktop);
    skillSnapshot.value = snapshot;
    capabilityMessage.value = "正在同步原生技能库与专家智能体团队…";
    installedAgentIds.value = new Set(installed.installedAgentIds);
    installedNativeSkillIds.value = new Set(installed.installedSkillIds);
    installedStylePresetIds.value = new Set(installed.installedStylePresetIds);
    installedPlotSkillIds.value = new Set(installed.installedPlotSkillIds);
    installedStoryKernelSkillIds.value = new Set(installed.installedStoryKernelSkillIds);
    installedCoverSkillIds.value = new Set(installed.installedCoverSkillIds);
    capabilityMessage.value = `${installedPromptSkillCount.value}/${promptSkillCount.value} 个小说 Skills 已安装；${installedPlotSkillIds.value.size}/${INKHUB_PLOT_SKILLS.length} 个剧情设计 Skills 已安装；${installedStoryKernelSkillIds.value.size}/${INKHUB_STORY_KERNEL_SKILLS.length} 个全书创作内核 Skills 已安装；${installedCoverSkillIds.value.size}/${INKHUB_COVER_SKILLS.length} 个小说封面 Skills 已安装；${installedStylePresetIds.value.size}/${INKHUB_STYLE_PRESETS.length} 个通用文风预设已安装；${installedAgentIds.value.size}/${INKHUB_NATIVE_AGENTS.length} 位专家智能体已加入团队`;
    emit("catalogChanged");
  } catch (error: unknown) {
    capabilityMessage.value = "能力装配未完成";
    uiMessage.error(error instanceof Error ? error.message : "安装本机能力失败");
  } finally {
    capabilityInstalling.value = false;
  }
}

async function toggleSkill(skillId: string, enabled: boolean): Promise<void> {
  try {
    skillSnapshot.value = await api().setSkillEnabled(skillId, enabled);
    uiMessage.success(enabled ? "Skill 已启用，将在模型请求前重新核验" : "Skill 已停用");
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "更新 Skill 状态失败");
  }
}

async function previewSkill(skillId: string): Promise<void> {
  selectedSkillId.value = skillId;
  try {
    skillPreview.value = await api().readSkill(skillId);
  } catch (error: unknown) {
    skillPreview.value = null;
    uiMessage.error(error instanceof Error ? error.message : "读取 Skill 失败");
  }
}

function switchTab(next: Tab): void {
  tab.value = next;
  query.value = "";
  if (next === "media") void loadMediaOptions();
}

function openMedia(entry: InkHubNovelEntry): void {
  mediaEntryId.value = entry.id;
  switchTab("media");
}

function openReader(entry: InkHubNovelEntry): void {
  readerEntry.value = entry;
}

async function loadMediaOptions(): Promise<void> {
  if (!window.deepwrite?.inkHubMedia) return;
  try {
    const [presets, styles, models] = await Promise.all([
      window.deepwrite.inkHubMedia.listCoverPresets(),
      window.deepwrite.inkHubMedia.listCoverStyles(),
      window.deepwrite.models.list()
    ]);
    coverPresets.value = presets;
    coverStyles.value = styles;
    if (!styles.some((style) => style.id === coverStyleId.value)) {
      coverStyleId.value = styles[0]?.id ?? "ink-gold-fantasy";
    }
    const imageLike = models.models.filter((model) => /image|seedream|flux|dall-e|imagen|z-image|wan\d/iu.test(`${model.label} ${model.modelId}`));
    mediaModelOptions.value = imageLike.map((model) => ({ value: model.id, label: `${model.label} · ${model.modelId}` }));
    if (!mediaModelId.value) mediaModelId.value = mediaModelOptions.value[0]?.value ?? "";
    if (!mediaEntryId.value) mediaEntryId.value = selectedEntry.value?.id ?? novelSnapshot.value?.entries[0]?.id ?? "";
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "加载视觉工坊失败");
  }
}

async function generateCover(): Promise<void> {
  if (!window.deepwrite?.inkHubMedia || !mediaEntry.value || !billableConfirmed.value || !mediaModelId.value) return;
  const entry = mediaEntry.value;
  const epoch = mediaSelectionEpoch;
  mediaLoading.value = true;
  try {
    const generated = await window.deepwrite.inkHubMedia.generateCover({
      entryId: entry.id,
      modelId: mediaModelId.value,
      platformId: coverPlatformId.value as InkHubCoverPlatformPreset["id"],
      styleId: coverStyleId.value,
      title: coverTitle.value || entry.title,
      author: coverAuthor.value,
      prompt: coverPrompt.value,
      confirmBillable: true
    });
    if (epoch !== mediaSelectionEpoch || mediaEntry.value?.id !== entry.id) return;
    generatedCover.value = generated;
    uiMessage.success("封面已生成并保存到小说 assets/墨枢封面");
  } catch (error: unknown) {
    if (epoch !== mediaSelectionEpoch) return;
    uiMessage.error(error instanceof Error ? error.message : "生成封面失败");
  } finally {
    if (epoch === mediaSelectionEpoch) mediaLoading.value = false;
  }
}

async function planShortIllustrations(): Promise<void> {
  if (!window.deepwrite?.inkHubMedia || !mediaEntry.value) return;
  const entryId = mediaEntry.value.id;
  const epoch = mediaSelectionEpoch;
  mediaLoading.value = true;
  try {
    const plan = await window.deepwrite.inkHubMedia.planIllustrations(entryId, Number(illustrationCount.value));
    if (epoch !== mediaSelectionEpoch || mediaEntry.value?.id !== entryId || plan.entryId !== entryId) return;
    illustrationPlan.value = plan;
    generatedIllustrations.value = {};
  } catch (error: unknown) {
    if (epoch !== mediaSelectionEpoch) return;
    uiMessage.error(error instanceof Error ? error.message : "提取短篇插图场景失败");
  } finally {
    if (epoch === mediaSelectionEpoch) mediaLoading.value = false;
  }
}

async function generateIllustration(
  item: InkHubIllustrationPlan["items"][number],
  entryId = illustrationPlan.value?.entryId,
  notifyError = true
): Promise<boolean> {
  if (
    !window.deepwrite?.inkHubMedia ||
    !entryId ||
    !mediaEntry.value ||
    mediaEntry.value.id !== entryId ||
    illustrationPlan.value?.entryId !== entryId ||
    !billableConfirmed.value ||
    !mediaModelId.value
  ) return false;
  const epoch = mediaSelectionEpoch;
  generatingIllustrationId.value = item.id;
  try {
    const generated = await window.deepwrite.inkHubMedia.generateIllustration({
      entryId,
      modelId: mediaModelId.value,
      chapterTitle: item.chapterTitle,
      prompt: item.prompt,
      confirmBillable: true
    });
    if (epoch !== mediaSelectionEpoch || mediaEntry.value?.id !== entryId) return false;
    generatedIllustrations.value = { ...generatedIllustrations.value, [item.id]: generated };
    return true;
  } catch (error: unknown) {
    if (notifyError && epoch === mediaSelectionEpoch) {
      uiMessage.error(error instanceof Error ? error.message : "生成插图失败");
    }
    return false;
  } finally {
    if (epoch === mediaSelectionEpoch) generatingIllustrationId.value = null;
  }
}

async function generateAllIllustrations(): Promise<void> {
  const plan = illustrationPlan.value;
  if (!plan || !billableConfirmed.value || mediaEntry.value?.id !== plan.entryId) return;
  let succeeded = 0;
  let failed = 0;
  for (const item of plan.items) {
    if (generatedIllustrations.value[item.id]) continue;
    if (await generateIllustration(item, plan.entryId, false)) succeeded += 1;
    else failed += 1;
    if (mediaEntry.value?.id !== plan.entryId) return;
  }
  if (failed === 0 && succeeded > 0) {
    uiMessage.success(`已生成 ${succeeded} 张插图并保存到小说 assets/墨枢插图`);
  } else if (succeeded > 0) {
    uiMessage.warning(`${succeeded} 张插图生成成功，${failed} 张失败；可重新生成失败项`);
  } else if (failed > 0) {
    uiMessage.error(`${failed} 张插图均生成失败，请检查图片模型和对应服务状态`);
  }
}

async function revealNovel(entryId: string): Promise<void> {
  try {
    await api().revealNovel(entryId);
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "无法在 Finder 中显示小说目录");
  }
}

async function revealGeneratedMedia(media: InkHubGeneratedMedia): Promise<void> {
  try {
    await window.deepwrite?.inkHubMedia?.revealMedia(media.entryId, media.path);
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "无法在 Finder 中显示图片");
  }
}

watch(mediaEntry, (entry) => {
  mediaSelectionEpoch += 1;
  generatingIllustrationId.value = null;
  mediaLoading.value = false;
  if (!entry) return;
  coverTitle.value = entry.title;
  generatedCover.value = null;
  illustrationPlan.value = null;
  generatedIllustrations.value = {};
});

onMounted(async () => {
  // Reuse the startup single-flight promise so the first visit cannot render a
  // stale capability state while background installation is running. Novel
  // discovery is independent and must not block capability status or retries.
  await Promise.all([refreshNovels(), installCapabilities()]);
});
</script>

<template>
  <section class="inkhub-library" aria-label="墨枢资料库">
    <header class="library-hero">
      <div>
        <span class="eyebrow">INKHUB · LOCAL FIRST</span>
        <h1>我的小说</h1>
        <p>你的故事，都有归处。原文件保持原位，默认只读。</p>
      </div>
      <div class="hero-stat">
        <strong>{{ novelSnapshot?.entries.length ?? 0 }}</strong>
        <span>部作品</span>
      </div>
    </header>

    <nav class="library-tabs" aria-label="资料库分类">
      <button :class="{ active: tab === 'novels' }" type="button" :aria-current="tab === 'novels' ? 'page' : undefined" @click="switchTab('novels')">
        <AppIcon name="book" :size="16" />小说库
      </button>
      <button :class="{ active: tab === 'skills' }" type="button" :aria-current="tab === 'skills' ? 'page' : undefined" @click="switchTab('skills')">
        <AppIcon name="sparkles" :size="16" />Skills
      </button>
      <button :class="{ active: tab === 'agents' }" type="button" :aria-current="tab === 'agents' ? 'page' : undefined" @click="switchTab('agents')">
        <AppIcon name="brain" :size="16" />Agents
      </button>
      <button :class="{ active: tab === 'media' }" type="button" :aria-current="tab === 'media' ? 'page' : undefined" @click="switchTab('media')">
        <AppIcon name="image" :size="16" />视觉工坊
      </button>
    </nav>

    <div v-if="tab === 'novels' || tab === 'skills'" class="library-toolbar">
      <label class="search-box">
        <AppIcon name="search" :size="15" />
        <span class="sr-only">{{ tab === 'novels' ? '搜索小说与路径' : '搜索 Skill 标题与路径' }}</span>
        <input v-model="query" type="search" :placeholder="tab === 'novels' ? '搜索小说与路径' : '搜索 Skill 标题与路径'" />
      </label>
      <PopupSelect
        v-if="tab === 'novels'"
        class="toolbar-select"
        :model-value="category"
        :options="categoryOptions"
        accessible-label="筛选小说类别"
        @update:model-value="category = String($event)"
      />
      <PopupSelect
        v-else
        class="toolbar-select"
        :model-value="skillSource"
        :options="sourceOptions"
        accessible-label="筛选 Skill 来源"
        @update:model-value="skillSource = String($event)"
      />
      <button v-if="tab === 'novels'" class="primary-action" type="button" :disabled="loading" @click="addNovelRoot">
        <AppIcon name="plus" :size="15" />添加小说目录
      </button>
      <button class="icon-action" type="button" :disabled="loading" :aria-label="tab === 'novels' ? '刷新小说库' : '重新核验 Skills'" @click="tab === 'novels' ? refreshNovels() : refreshSkills()">
        <AppIcon name="redo" :size="16" />
      </button>
    </div>

    <template v-if="tab === 'novels'">
      <InkHubIndexCenter
        :entries="novelSnapshot?.entries ?? []"
        :refresh-key="novelSnapshot?.scannedAt ?? ''"
      />
      <div class="source-strip">
        <span class="source-label">来源</span>
        <div v-for="root in novelSnapshot?.roots ?? []" :key="root.id" class="source-chip" :class="{ unavailable: !root.available }" :title="root.path">
          <i aria-hidden="true" />{{ root.label }}<span class="sr-only">（{{ root.available ? '可用' : '不可用' }}）</span>
          <button v-if="(novelSnapshot?.roots.length ?? 0) > 1" type="button" :aria-label="`移除小说目录 ${root.label} 的引用`" @click="removeRoot(root.id)">×</button>
        </div>
        <small>只保存目录引用，不复制、不改名、不删除原文件</small>
      </div>

      <div class="novel-layout">
        <div class="novel-grid" aria-live="polite" :aria-busy="loading">
          <button
            v-for="entry in filteredEntries"
            :key="entry.id"
            class="novel-card"
            :class="{ selected: selectedEntry?.id === entry.id }"
            :aria-pressed="selectedEntry?.id === entry.id"
            type="button"
            @click="selectNovel(entry)"
          >
            <span class="novel-monogram">{{ entry.title.slice(0, 1) }}</span>
            <span class="novel-copy">
              <span class="novel-title-row"><strong>{{ entry.title }}</strong><em>{{ entry.category }}</em></span>
              <small>{{ entry.documentCount }} 个文档 · {{ entry.formats.join(' / ').toUpperCase() }}</small>
              <small>{{ formatDate(entry.updatedAt) }}</small>
              <span class="badges">
                <i v-if="entry.hasAgentRules">AGENTS</i>
                <i v-if="entry.hasTraeAssets">TRAE</i>
                <i v-if="entry.truncated">部分索引</i>
              </span>
            </span>
          </button>
          <div v-if="!loading && filteredEntries.length === 0" class="empty-panel">没有符合条件的小说目录。</div>
        </div>

        <aside class="detail-panel" :class="{ empty: !selectedEntry }">
          <template v-if="selectedEntry">
          <header>
            <div><span>只读档案</span><h2>{{ selectedEntry.title }}</h2></div>
            <div class="detail-actions"><button class="reader-action" type="button" @click="openReader(selectedEntry)">逐章阅读 / 全文</button><button type="button" @click="openMedia(selectedEntry)">封面 / 插图</button><button type="button" @click="revealNovel(selectedEntry.id)">Finder</button></div>
          </header>
          <p class="entry-path" :title="selectedEntry.path">{{ selectedEntry.relativePath }}</p>
          <div class="document-list">
            <button v-for="document in documents" :key="document.relativePath" type="button" :class="{ active: selectedDocument === document.relativePath }" :aria-pressed="selectedDocument === document.relativePath" @click="previewDocument(document)">
              <AppIcon name="file" :size="14" />
              <span><strong>{{ document.title }}</strong><small>{{ document.relativePath }} · {{ formatBytes(document.size) }}</small></span>
            </button>
          </div>
          <small v-if="documentsTruncated" class="limit-note">文档较多，当前只展示安全上限内的索引。</small>
          <pre v-if="documentPreview" class="preview-content">{{ documentPreview.content }}</pre>
          <div v-else class="preview-placeholder">选择 Markdown 或 TXT 文档查看只读预览。</div>
          </template>
          <div v-else class="detail-empty-state"><AppIcon name="book" :size="28" /><strong>选择一部作品查看文档</strong><span>Markdown / TXT 可只读预览；其他格式可在 Finder 中打开。</span></div>
        </aside>
      </div>
    </template>

    <template v-else-if="tab === 'skills'">
      <div class="capability-status" aria-live="polite" :aria-busy="capabilityInstalling">
        <span><AppIcon name="check" :size="16" />{{ capabilityMessage }}</span>
        <button type="button" :disabled="capabilityInstalling" @click="installCapabilities">{{ capabilityInstalling ? '装配中…' : '重新核验并补全' }}</button>
      </div>
      <div class="skill-notice">
        <AppIcon name="check" :size="16" />
        <span>小说 prompt Skills 以完整 bundle 私有安装到本机用户数据，并镜像到原生技能库；外部无许可证资源保持隔离，仅用净室重写的项目自有能力进入墨枢。</span>
      </div>
      <div class="skill-layout">
        <div class="skill-list">
          <article v-for="skill in filteredSkills" :key="skill.id" :class="['skill-card', `status-${skill.status}`, { selected: selectedSkillId === skill.id }]">
            <button class="skill-main" type="button" @click="previewSkill(skill.id)">
              <span class="skill-source">{{ skill.source }}</span>
              <span><strong>{{ skill.title }}</strong><small :title="skill.path">{{ skill.path }}</small></span>
            </button>
            <div class="skill-meta">
              <span>{{ skill.installState === 'installed' ? '已安装 bundle' : skill.installState === 'available' ? '可安装' : '不可安装' }}</span>
              <span v-if="installedNativeSkillIds.has(skill.id)">已镜像原生技能库</span>
              <span>{{ skill.status === 'verified' ? '来源已核验' : skill.status === 'changed' ? '来源有更新' : '来源缺失' }}</span>
              <span v-if="skill.skillKind">{{ skill.skillKind }}</span>
              <span>{{ skill.license }}</span>
              <span v-if="!skill.executable">{{ skill.capabilityKind === 'spec' ? '参考规范' : '需适配器' }}</span>
            </div>
            <label class="skill-toggle">
              <input :checked="skill.enabled" type="checkbox" :disabled="skill.installState !== 'installed' || !skill.executable" @change="toggleSkill(skill.id, ($event.target as HTMLInputElement).checked)" />
              <span>{{ skill.enabled ? '已启用' : '未启用' }}</span>
            </label>
            <p v-if="skill.note">{{ skill.note }}</p>
          </article>
        </div>
        <aside class="skill-preview">
          <header><span>只读预览</span><strong>{{ selectedSkillId ? '已核验源文件' : '选择一个 Skill' }}</strong></header>
          <pre v-if="skillPreview">{{ skillPreview.content }}</pre>
          <div v-else class="preview-placeholder">只有锁定哈希与当前文件一致时，才允许读取或注入模型上下文。</div>
        </aside>
      </div>
      <section class="style-preset-section" aria-labelledby="plot-skill-heading">
        <header>
          <div><span>全网研究 · 安全适配</span><h2 id="plot-skill-heading">剧情设计 Skills</h2></div>
          <strong>{{ installedPlotSkillIds.size }} / {{ INKHUB_PLOT_SKILLS.length }} 可用</strong>
        </header>
        <p>从三套有明确许可证的公开写作项目中提取高层方法，重写为墨枢的纯指令能力；未带入第三方脚本、Hook、示例正文或自动写文件行为。创建书籍时可在“剧情设计技能库”直接绑定。</p>
        <div class="style-preset-grid plot-skill-grid">
          <article v-for="skill in INKHUB_PLOT_SKILLS" :key="skill.id">
            <header><strong>{{ skill.title }}</strong><span>{{ installedPlotSkillIds.has(skill.id) ? '已安装 · 可调用' : '待核验' }}</span></header>
            <p>{{ skill.description }}</p>
            <details><summary>查看工作流与来源</summary><ul><li v-for="item in skill.workflow.slice(0, 3)" :key="item">{{ item }}</li><li>{{ skill.sourceLabel }} · {{ skill.license }}</li></ul></details>
          </article>
        </div>
      </section>
      <section class="style-preset-section" aria-labelledby="cover-skill-heading">
        <header>
          <div><span>Punk-Skill 方法参考 · 净室适配</span><h2 id="cover-skill-heading">小说封面 Skills</h2></div>
          <strong>{{ installedCoverSkillIds.size }} / {{ INKHUB_COVER_SKILLS.length }} 可用</strong>
        </header>
        <p>已将单风格封面工作流装入原生技能库，并在视觉工坊提供 24 种项目自有风格。图片模型只生成无文字底图，书名和作者名由墨枢本地排版。</p>
        <div class="style-preset-grid cover-skill-grid">
          <article v-for="skill in INKHUB_COVER_SKILLS" :key="skill.id">
            <header><strong>{{ skill.title }}</strong><span>{{ installedCoverSkillIds.has(skill.id) ? '已安装 · 可调用' : '待核验' }}</span></header>
            <p>{{ skill.description }}</p>
            <details><summary>查看来源边界</summary><ul><li>{{ skill.sourceLabel }}</li><li>不复制上游提示词、图片或脚本</li><li>使用已选的 ModelHub 或直连厂家图片模型</li></ul></details>
          </article>
        </div>
      </section>
      <section class="style-preset-section" aria-labelledby="style-preset-heading">
        <header>
          <div><span>xin-skills 安全适配</span><h2 id="style-preset-heading">通用文风预设</h2></div>
          <strong>{{ installedStylePresetIds.size }} / {{ INKHUB_STYLE_PRESETS.length }} 可用</strong>
        </header>
        <p>以下预设已进入写作智能体的 <code>load_skill</code> 列表；每次只按需加载一套，不复制上游小说片段。</p>
        <div class="style-preset-grid">
          <article v-for="style in INKHUB_STYLE_PRESETS" :key="style.id">
            <header><strong>{{ style.title }}</strong><span>{{ installedStylePresetIds.has(style.id) ? '已安装 · 可调用' : '待核验' }}</span></header>
            <p>{{ style.summary }}</p>
            <details><summary>查看十维写作约束</summary><ul><li>{{ style.perspective }}</li><li>{{ style.sentence }}</li><li>{{ style.dialogue }}</li><li>{{ style.pacing }}</li><li>{{ style.avoid }}</li></ul></details>
          </article>
        </div>
      </section>
    </template>

    <template v-else-if="tab === 'agents'">
      <div class="capability-status" aria-live="polite" :aria-busy="capabilityInstalling">
        <span><AppIcon name="brain" :size="16" />{{ capabilityMessage }}</span>
        <button type="button" :disabled="capabilityInstalling" @click="installCapabilities">{{ capabilityInstalling ? '装配中…' : '重新核验并补全' }}</button>
      </div>
      <div class="agent-grid">
        <article v-for="agent in INKHUB_NATIVE_AGENTS" :key="agent.id" class="agent-card">
          <span class="agent-avatar" aria-hidden="true">{{ agent.name.slice(0, 1) }}</span>
          <div><div class="agent-title"><strong>{{ agent.name }}</strong><span>{{ installedAgentIds.has(agent.id) ? '已加入团队' : '待安装' }}</span></div><p>{{ agent.description }}</p><small>{{ agent.specialty }} · {{ agent.sourceLabel }}</small></div>
        </article>
      </div>
      <div class="agent-callout"><strong>真实调用链</strong><span>这些不是标签：安装后会进入短篇、剧本和长篇的 Agent Team，由主智能体通过 spawn_subagent 调用，并继承当前已选模型。</span></div>
    </template>

    <template v-else>
      <div class="media-toolbar">
        <PopupSelect v-model="mediaEntryId" :options="mediaNovelOptions" accessible-label="选择要制作视觉素材的小说" />
        <PopupSelect v-model="mediaModelId" :options="mediaModelOptions" accessible-label="选择图片模型" placeholder="先在模型配置添加图片模型" :aria-describedby="!mediaModelOptions.length ? 'media-model-warning' : undefined" />
      </div>
      <div v-if="!mediaModelOptions.length" id="media-model-warning" class="media-warning" role="status">没有发现已配置的图片模型。请先到“模型配置”添加 ModelHub 或厂家 API 中的 Seedream、GPT Image、Qwen Image、Flux 等图片模型。</div>
      <div class="media-grid">
        <section class="studio-card">
          <header><span class="studio-icon"><AppIcon name="image" :size="20" /></span><div><h2>一键配封面</h2><p>自动按发布平台输出尺寸，本地叠加清晰书名与作者名。</p></div></header>
          <label>发布平台<PopupSelect v-model="coverPlatformId" :options="coverPresetOptions" accessible-label="封面发布平台" /></label>
          <div v-if="selectedCoverPreset" class="preset-note"><strong>{{ selectedCoverPreset.width }} × {{ selectedCoverPreset.height }} px</strong><span>{{ selectedCoverPreset.note }}</span></div>
          <label>封面风格<PopupSelect v-model="coverStyleId" :options="coverStyleOptions" accessible-label="小说封面风格" /></label>
          <div v-if="selectedCoverStyle" class="preset-note cover-style-note"><strong>{{ selectedCoverStyle.label }}</strong><span>{{ selectedCoverStyle.description }} · 适合：{{ selectedCoverStyle.bestFor }}</span></div>
          <label>书名<input v-model="coverTitle" maxlength="120" /></label>
          <label>作者 / 笔名<input v-model="coverAuthor" maxlength="80" placeholder="可留空" /></label>
          <label>画面方向<textarea v-model="coverPrompt" rows="4" maxlength="8000" /></label>
          <button class="generate-action" type="button" :aria-describedby="!mediaModelOptions.length ? 'media-model-warning' : undefined" :disabled="mediaLoading || !billableConfirmed || !mediaModelId || !mediaEntry" @click="generateCover"><AppIcon name="wand" :size="16" />{{ mediaLoading ? '正在生成…' : '生成并保存封面' }}</button>
          <div v-if="generatedCover" class="generated-preview"><img :src="generatedCover.dataUrl" alt="刚生成的小说封面" /><button type="button" @click="revealGeneratedMedia(generatedCover)">在 Finder 显示</button></div>
        </section>

        <section class="studio-card">
          <header><span class="studio-icon"><AppIcon name="sparkles" :size="20" /></span><div><h2>短篇自动插图</h2><p>本地扫描正文并均匀提取场景，确认画面方案后批量生成。</p></div></header>
          <label>插图数量<PopupSelect v-model="illustrationCount" :options="illustrationCountOptions" accessible-label="短篇插图数量" /></label>
          <button class="secondary-action" type="button" :disabled="mediaLoading || mediaEntry?.category !== '短篇'" @click="planShortIllustrations">提取插图场景</button>
          <p v-if="mediaEntry && mediaEntry.category !== '短篇'" class="field-hint">当前选择的是{{ mediaEntry.category }}；自动插图只对短篇开放。</p>
          <div v-if="illustrationPlan" class="illustration-plan">
            <article v-for="item in illustrationPlan.items" :key="item.id">
              <div><strong>{{ item.chapterTitle }}</strong><small>{{ item.documentPath }}</small></div>
              <textarea v-model="item.prompt" rows="4" maxlength="8000" />
              <img v-if="generatedIllustrations[item.id]" :src="generatedIllustrations[item.id]?.dataUrl" :alt="`${item.chapterTitle} 插图`" />
              <button type="button" :disabled="!billableConfirmed || !mediaModelId || generatingIllustrationId !== null" @click="generateIllustration(item)">{{ generatingIllustrationId === item.id ? '生成中…' : '生成这一张' }}</button>
            </article>
            <button class="generate-action" type="button" :disabled="!billableConfirmed || !mediaModelId || generatingIllustrationId !== null" @click="generateAllIllustrations">生成全部 {{ illustrationPlan.items.length }} 张</button>
          </div>
        </section>
      </div>
      <label class="billing-confirm"><input v-model="billableConfirmed" type="checkbox" /><span>我确认：点击生成会调用所选图片模型，可能产生费用；小说正文仅在我点击生成时用于画面提示。</span></label>
    </template>
    <InkHubNovelReader v-if="readerEntry" :entry="readerEntry" @close="readerEntry = null" />
  </section>
</template>

<style scoped>
.inkhub-library {
  container-type: inline-size;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 24px clamp(20px, 3vw, 38px) 38px;
  overflow: auto;
  color: var(--text-primary);
  background: radial-gradient(circle at 85% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 34%), var(--surface-main);
}

.library-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;
  max-width: 1180px;
  margin: 0 auto 16px;
  padding: 20px 24px;
  border: 1px solid var(--theme-line);
  border-radius: 20px;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .07);
}

.eyebrow { color: var(--accent-text, var(--accent)); font-size: .72rem; font-weight: 700; letter-spacing: .16em; }
.library-hero h1 { margin: 5px 0 3px; font-family: "Songti SC", "STSong", serif; font-size: clamp(28px, 3vw, 40px); font-weight: 700; letter-spacing: -.03em; }
.library-hero p { margin: 0; color: var(--text-secondary); }
.hero-stat { display: flex; align-items: baseline; gap: 7px; min-width: 110px; color: var(--text-secondary); }
.hero-stat strong { color: var(--text-primary); font: 600 38px/1 Georgia, serif; }

.library-tabs,
.library-toolbar,
.source-strip,
.skill-notice,
.novel-layout,
.skill-layout,
.capability-status,
.agent-grid,
.agent-callout,
.media-toolbar,
.media-warning,
.media-grid,
.billing-confirm {
  max-width: 1180px;
  margin-left: auto;
  margin-right: auto;
}

.style-preset-section {
  max-width: 1180px;
  margin: 18px auto 0;
  padding: 18px;
  border: 1px solid var(--theme-line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
}
.style-preset-section > header { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
.style-preset-section > header span { color: var(--accent-text, var(--accent)); font-size: .7rem; font-weight: 700; letter-spacing: .09em; }
.style-preset-section h2 { margin: 4px 0 0; font: 700 22px/1.3 "Songti SC", "STSong", serif; }
.style-preset-section > header > strong { color: var(--text-secondary); font-size: .8rem; }
.style-preset-section > p { margin: 8px 0 15px; color: var(--text-secondary); font-size: .8rem; line-height: 1.6; }
.style-preset-section code { padding: 2px 5px; border-radius: 4px; background: var(--surface-muted); }
.style-preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.style-preset-grid article { min-width: 0; padding: 12px 13px; border: 1px solid var(--theme-line-soft); border-radius: 11px; background: var(--surface-main); }
.style-preset-grid article > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.style-preset-grid article > header span { flex: 0 0 auto; color: #438168; font-size: .68rem; }
.style-preset-grid article > p { margin: 7px 0; color: var(--text-secondary); font-size: .76rem; line-height: 1.55; }
.style-preset-grid details { color: var(--text-tertiary); font-size: .72rem; }
.style-preset-grid summary { cursor: pointer; color: var(--accent-text, var(--accent)); }
.style-preset-grid ul { margin: 8px 0 0; padding-left: 18px; line-height: 1.55; }

.library-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.library-tabs button { display: flex; align-items: center; gap: 7px; min-height: 40px; padding: 9px 14px; border: 0; border-radius: 10px; color: var(--text-secondary); background: transparent; }
.library-tabs button.active { color: var(--text-primary); background: var(--surface-raised); box-shadow: inset 0 0 0 1px var(--theme-line); }
.library-tabs button:focus-visible,
.primary-action:focus-visible,
.icon-action:focus-visible,
.generate-action:focus-visible,
.secondary-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.library-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 13px; }
.search-box { display: flex; flex: 1 1 280px; align-items: center; gap: 8px; min-width: 0; padding: 0 12px; border: 1px solid var(--theme-line); border-radius: 11px; background: var(--surface-raised); }
.search-box:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent); }
.search-box input { width: 100%; min-width: 0; padding: 10px 0; border: 0; outline: 0; color: var(--text-primary); background: transparent; }
.toolbar-select { flex: 0 0 168px; width: 168px; }
.primary-action,
.icon-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; border: 1px solid var(--theme-line); border-radius: 11px; }
.primary-action { flex: 0 0 auto; padding: 0 15px; white-space: nowrap; color: var(--accent-contrast, white); border-color: var(--accent); background: var(--accent); }
.icon-action { flex: 0 0 40px; width: 40px; color: var(--text-secondary); background: var(--surface-raised); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.source-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; color: var(--text-secondary); }
.source-strip small { margin-left: auto; }
.source-label { font-size: .82rem; font-weight: 700; }
.source-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 260px; padding: 5px 9px; border: 1px solid var(--theme-line); border-radius: 999px; font-size: .82rem; background: var(--surface-raised); }
.source-chip i { width: 7px; height: 7px; border-radius: 50%; background: #4a9b71; }
.source-chip.unavailable i { background: #b56355; }
.source-chip button { min-width: 24px; min-height: 24px; border: 0; color: var(--text-tertiary); background: transparent; }

.novel-layout,
.skill-layout { display: grid; grid-template-columns: minmax(390px, 1.15fr) minmax(320px, .85fr); gap: 16px; align-items: start; }
.novel-grid,
.skill-list { display: grid; gap: 10px; min-width: 0; }
.novel-card { display: flex; width: 100%; gap: 14px; padding: 15px; text-align: left; border: 1px solid var(--theme-line); border-radius: 15px; color: var(--text-primary); background: var(--surface-raised); transition: transform .16s ease, border-color .16s ease; }
.novel-card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 48%, var(--theme-line)); }
.novel-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 13%, transparent); }
.novel-monogram { display: grid; place-items: center; flex: 0 0 46px; height: 58px; border-radius: 6px 13px 13px 6px; color: #f5eee1; background: linear-gradient(145deg, #182825, #45645b); font: 600 22px/1 "Songti SC", serif; box-shadow: inset 4px 0 rgba(255, 255, 255, .07); }
.novel-copy { display: grid; flex: 1; gap: 4px; min-width: 0; }
.novel-title-row { display: flex; justify-content: space-between; gap: 12px; }
.novel-title-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.novel-title-row em { flex: 0 0 auto; color: var(--accent-text, var(--accent)); font-size: .76rem; font-style: normal; }
.novel-copy small,
.document-list small,
.skill-main small { overflow: hidden; color: var(--text-tertiary); text-overflow: ellipsis; white-space: nowrap; }
.badges { display: flex; gap: 5px; min-height: 17px; }
.badges i { padding: 2px 5px; border-radius: 4px; color: var(--text-secondary); background: var(--surface-muted); font-size: .68rem; font-style: normal; letter-spacing: .05em; }

.detail-panel,
.skill-preview { position: sticky; top: 0; display: flex; flex-direction: column; min-width: 0; min-height: 420px; max-height: calc(100vh - 250px); overflow: hidden; border: 1px solid var(--theme-line); border-radius: 16px; background: var(--surface-raised); }
.detail-panel.empty { justify-content: center; }
.detail-panel header,
.skill-preview header { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 15px 16px; border-bottom: 1px solid var(--theme-line); }
.detail-panel header span,
.skill-preview header span { display: block; color: var(--accent-text, var(--accent)); font-size: .72rem; font-weight: 700; letter-spacing: .1em; }
.detail-panel h2 { margin: 3px 0 0; font-size: 17px; }
.detail-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.detail-panel header button { min-height: 32px; padding: 0 8px; border: 0; border-radius: 7px; color: var(--accent-text, var(--accent)); background: transparent; }
.detail-panel header button:hover { background: var(--surface-muted); }
.detail-empty-state { display: grid; place-items: center; gap: 9px; padding: 32px; color: var(--text-tertiary); text-align: center; }
.detail-empty-state strong { color: var(--text-secondary); }
.entry-path { margin: 10px 16px 0; overflow: hidden; color: var(--text-tertiary); font-size: .76rem; text-overflow: ellipsis; white-space: nowrap; }
.document-list { display: grid; max-height: 250px; overflow: auto; padding: 10px; }
.document-list button { display: flex; align-items: center; gap: 9px; padding: 8px; text-align: left; border: 0; border-radius: 8px; color: var(--text-primary); background: transparent; }
.document-list button:hover,
.document-list button.active { background: var(--surface-muted); }
.document-list span { display: grid; min-width: 0; }
.document-list strong { overflow: hidden; font-size: .82rem; text-overflow: ellipsis; white-space: nowrap; }
.preview-content,
.skill-preview pre { flex: 1; min-height: 180px; margin: 0; padding: 15px 17px; overflow: auto; border-top: 1px solid var(--theme-line); color: var(--text-secondary); background: color-mix(in srgb, var(--surface-main) 70%, transparent); font: .82rem/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
.preview-placeholder,
.empty-panel { padding: 28px; color: var(--text-tertiary); text-align: center; }
.limit-note { padding: 0 16px 10px; color: var(--text-tertiary); }

.capability-status { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; padding: 11px 13px; border: 1px solid var(--theme-line); border-radius: 11px; background: var(--surface-raised); }
.capability-status span { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: .82rem; }
.capability-status button { flex: 0 0 auto; min-height: 34px; padding: 0 11px; border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--theme-line)); border-radius: 8px; color: var(--accent-text, var(--accent)); background: color-mix(in srgb, var(--accent) 7%, transparent); white-space: nowrap; }
.skill-notice { display: flex; gap: 9px; align-items: flex-start; margin-bottom: 14px; padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--theme-line)); border-radius: 11px; color: var(--text-secondary); background: color-mix(in srgb, var(--accent) 7%, var(--surface-raised)); font-size: .82rem; line-height: 1.55; }
.skill-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 14px; padding: 13px 14px; border: 1px solid var(--theme-line); border-radius: 13px; background: var(--surface-raised); }
.skill-card.selected { border-color: var(--accent); }
.skill-card.status-changed,
.skill-card.status-missing { opacity: .7; }
.skill-main { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 10px; text-align: left; border: 0; color: var(--text-primary); background: transparent; }
.skill-main > span:last-child { display: grid; min-width: 0; }
.skill-source { align-self: start; overflow: hidden; padding: 4px 6px; border-radius: 5px; color: var(--accent-text, var(--accent)); background: color-mix(in srgb, var(--accent) 10%, transparent); font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
.skill-meta { grid-column: 1; display: flex; flex-wrap: wrap; gap: 5px; }
.skill-meta span { padding: 2px 6px; border-radius: 4px; color: var(--text-tertiary); background: var(--surface-muted); font-size: .68rem; }
.skill-toggle { grid-area: 1 / 2 / span 2 / 3; display: flex; align-items: center; gap: 5px; color: var(--text-secondary); font-size: .76rem; }
.skill-card p { grid-column: 1 / -1; margin: 0; color: var(--text-tertiary); font-size: .76rem; }
.skill-preview { min-height: 420px; }

.agent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.agent-card { display: flex; gap: 13px; padding: 16px; border: 1px solid var(--theme-line); border-radius: 15px; background: var(--surface-raised); }
.agent-avatar { display: grid; place-items: center; flex: 0 0 44px; height: 44px; border-radius: 14px; color: #f8f2e7; background: linear-gradient(145deg, #172723, #3c675a); font: 600 20px/1 "Songti SC", serif; }
.agent-card > div { min-width: 0; }
.agent-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.agent-title span { flex: 0 0 auto; padding: 3px 7px; border-radius: 999px; color: #438168; background: color-mix(in srgb, #438168 12%, transparent); font-size: .72rem; }
.agent-card p { margin: 7px 0 9px; color: var(--text-secondary); font-size: .82rem; line-height: 1.55; }
.agent-card small { color: var(--text-tertiary); }
.agent-callout { display: grid; gap: 5px; margin-top: 12px; padding: 13px 15px; border-left: 3px solid var(--accent); color: var(--text-secondary); background: color-mix(in srgb, var(--accent) 6%, var(--surface-raised)); font-size: .82rem; }

.media-toolbar { display: grid; grid-template-columns: minmax(250px, 1fr) minmax(250px, 1fr); gap: 10px; margin-bottom: 12px; }
.media-warning { margin-bottom: 12px; padding: 11px 13px; border: 1px solid #b7813b; border-radius: 10px; color: var(--text-secondary); background: color-mix(in srgb, #b7813b 9%, var(--surface-raised)); font-size: .82rem; }
.media-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
.studio-card { display: grid; gap: 13px; min-width: 0; padding: 18px; border: 1px solid var(--theme-line); border-radius: 17px; background: var(--surface-raised); }
.studio-card > header { display: flex; gap: 12px; align-items: flex-start; }
.studio-icon { display: grid; place-items: center; flex: 0 0 42px; height: 42px; border-radius: 13px; color: var(--accent-text, var(--accent)); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.studio-card h2 { margin: 1px 0 5px; font-size: 17px; }
.studio-card header p { margin: 0; color: var(--text-tertiary); font-size: .76rem; line-height: 1.5; }
.studio-card > label { display: grid; gap: 6px; color: var(--text-secondary); font-size: .76rem; font-weight: 600; }
.studio-card input[type="text"],
.studio-card input:not([type]),
.studio-card textarea { width: 100%; padding: 10px 11px; border: 1px solid var(--theme-line); border-radius: 9px; outline: 0; resize: vertical; color: var(--text-primary); background: var(--surface-main); font: inherit; font-weight: 400; }
.studio-card input:focus,
.studio-card textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 12%, transparent); }
.preset-note { display: grid; gap: 3px; padding: 10px 11px; border-radius: 9px; color: var(--text-secondary); background: var(--surface-muted); font-size: .76rem; }
.preset-note strong { color: var(--text-primary); }
.generate-action,
.secondary-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 0 13px; border-radius: 10px; font-weight: 600; }
.generate-action { border: 1px solid var(--accent); color: var(--accent-contrast, white); background: var(--accent); }
.secondary-action { border: 1px solid var(--theme-line); color: var(--text-secondary); background: var(--surface-main); }
.generate-action:disabled,
.secondary-action:disabled { opacity: .5; }
.generated-preview { display: grid; gap: 8px; justify-items: start; }
.generated-preview img { width: min(190px, 100%); max-height: 300px; object-fit: contain; border-radius: 10px; box-shadow: 0 9px 24px rgba(0, 0, 0, .16); }
.generated-preview button,
.illustration-plan button { min-height: 34px; padding: 0 10px; border: 1px solid var(--theme-line); border-radius: 8px; color: var(--accent-text, var(--accent)); background: var(--surface-main); }
.field-hint { margin: 0; color: var(--text-tertiary); font-size: .76rem; }
.illustration-plan { display: grid; gap: 10px; }
.illustration-plan article { display: grid; gap: 8px; padding: 11px; border: 1px solid var(--theme-line); border-radius: 10px; background: var(--surface-main); }
.illustration-plan article > div { display: grid; gap: 3px; }
.illustration-plan small { overflow: hidden; color: var(--text-tertiary); text-overflow: ellipsis; white-space: nowrap; }
.illustration-plan img { width: 100%; max-height: 320px; object-fit: contain; border-radius: 8px; }
.billing-confirm { display: flex; align-items: flex-start; gap: 9px; margin-top: 13px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--theme-line)); border-radius: 11px; color: var(--text-secondary); background: color-mix(in srgb, var(--accent) 6%, var(--surface-raised)); font-size: .82rem; line-height: 1.5; }
.billing-confirm input { flex: 0 0 auto; margin-top: 2px; }

@container (max-width: 760px) {
  .novel-layout,
  .skill-layout,
  .media-grid,
  .style-preset-grid { grid-template-columns: 1fr; }
  .detail-panel,
  .skill-preview { position: static; max-height: 560px; }
  .source-strip small { width: 100%; margin-left: 0; }
}

@container (max-width: 620px) {
  .library-hero { align-items: flex-start; padding: 17px 18px; }
  .library-hero p { max-width: 32ch; }
  .hero-stat { min-width: auto; }
  .hero-stat strong { font-size: 32px; }
  .library-tabs button { flex: 1 1 calc(50% - 6px); justify-content: center; }
  .toolbar-select { flex: 1 1 150px; width: auto; }
  .media-toolbar,
  .agent-grid { grid-template-columns: 1fr; }
  .capability-status { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 920px) {
  .inkhub-library { padding: 20px; }
}
</style>
