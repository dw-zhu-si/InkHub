<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  InkHubNovelEntry,
  InkHubNovelIndexStatus,
  InkHubNovelIndexSummary,
  ModelConfig
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import { uiMessage } from "../ui-feedback";

const props = defineProps<{
  entries: InkHubNovelEntry[];
  refreshKey?: string;
}>();

const emit = defineEmits<{
  indexBuilt: [entryId: string, summary: InkHubNovelIndexSummary];
}>();

type IndexRow = {
  summary: InkHubNovelIndexSummary | null;
  loading: boolean;
  error: string | null;
};

type ModelHubHealth = "idle" | "checking" | "online" | "offline" | "unconfigured";

const rows = ref<Record<string, IndexRow>>({});
const statusLoading = ref(false);
const batchRunning = ref(false);
const batchStopRequested = ref(false);
const batchCurrentTitle = ref("");
const batchCompleted = ref(0);
const batchTotal = ref(0);
const modelHubHealth = ref<ModelHubHealth>("idle");
const modelHubChecking = ref(false);
const modelHubDetail = ref("尚未检查；点击后才会访问已配置的模型服务");
let statusEpoch = 0;

function inkHubApi() {
  if (!window.deepwrite?.inkHub) {
    throw new Error("全库索引仅在墨枢桌面客户端中可用。");
  }
  return window.deepwrite.inkHub;
}

function rowFor(entryId: string): IndexRow {
  return rows.value[entryId] ?? { summary: null, loading: statusLoading.value, error: null };
}

function updateRow(entryId: string, patch: Partial<IndexRow>): void {
  rows.value = {
    ...rows.value,
    [entryId]: {
      ...rowFor(entryId),
      ...patch
    }
  };
}

function effectiveStatus(entryId: string): InkHubNovelIndexStatus | "checking" {
  const row = rowFor(entryId);
  if (row.loading) return "checking";
  if (row.error) return "failed";
  return row.summary?.status ?? "not-indexed";
}

const totals = computed(() => {
  const counts = {
    total: props.entries.length,
    ready: 0,
    pending: 0,
    stale: 0,
    failed: 0,
    checking: 0
  };
  for (const entry of props.entries) {
    switch (effectiveStatus(entry.id)) {
      case "ready":
        counts.ready += 1;
        break;
      case "stale":
        counts.stale += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "checking":
      case "indexing":
        counts.checking += 1;
        break;
      default:
        counts.pending += 1;
    }
  }
  return counts;
});

const pendingEntries = computed(() => props.entries.filter((entry) => {
  const status = effectiveStatus(entry.id);
  return status !== "ready" && status !== "checking" && status !== "indexing";
}));

const failedEntries = computed(() => props.entries.filter((entry) =>
  effectiveStatus(entry.id) === "failed"
));

const progressPercent = computed(() => batchTotal.value
  ? Math.round((batchCompleted.value / batchTotal.value) * 100)
  : 0);

const modelHubLabel = computed(() => ({
  idle: "未检查",
  checking: "检查中",
  online: "在线",
  offline: "离线",
  unconfigured: "未配置"
})[modelHubHealth.value]);

function statusLabel(entryId: string): string {
  switch (effectiveStatus(entryId)) {
    case "ready": return "已就绪";
    case "stale": return "需更新";
    case "failed": return "失败";
    case "partial": return "部分索引";
    case "indexing": return "索引中";
    case "checking": return "检查中";
    default: return "待索引";
  }
}

function statusDetail(entryId: string): string {
  const row = rowFor(entryId);
  if (row.error) return row.error;
  if (!row.summary) return "尚未构建全文索引";
  const { indexedDocumentCount, documentCount, chapterCount, totalCharacters } = row.summary;
  return `${indexedDocumentCount}/${documentCount} 文档 · ${chapterCount} 章 · ${totalCharacters.toLocaleString("zh-CN")} 字`;
}

async function loadIndexStatuses(): Promise<void> {
  const epoch = ++statusEpoch;
  statusLoading.value = true;
  const nextRows: Record<string, IndexRow> = {};
  for (const entry of props.entries) {
    nextRows[entry.id] = { summary: rows.value[entry.id]?.summary ?? null, loading: true, error: null };
  }
  rows.value = nextRows;

  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(4, props.entries.length) }, async () => {
    while (nextIndex < props.entries.length) {
      const entry = props.entries[nextIndex++];
      if (!entry) return;
      try {
        // The library overview reads the persisted snapshot only. Full source
        // verification is deferred to opening/using a novel, so a 50k-file
        // library cannot monopolize Electron's main process on navigation.
        const summary = await inkHubApi().getNovelIndex(entry.id, false);
        if (epoch !== statusEpoch) return;
        updateRow(entry.id, { summary, loading: false, error: null });
      } catch (error: unknown) {
        if (epoch !== statusEpoch) return;
        updateRow(entry.id, {
          loading: false,
          error: error instanceof Error ? error.message : "索引状态读取失败"
        });
      }
    }
  });
  await Promise.all(workers);
  if (epoch === statusEpoch) statusLoading.value = false;
}

async function buildEntry(entry: InkHubNovelEntry, quiet = false): Promise<boolean> {
  if (rowFor(entry.id).loading) return false;
  updateRow(entry.id, { loading: true, error: null });
  try {
    const summary = await inkHubApi().buildNovelIndex(entry.id);
    updateRow(entry.id, { summary, loading: false, error: null });
    emit("indexBuilt", entry.id, summary);
    if (!quiet) uiMessage.success(`《${entry.title}》全文索引已更新`);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "构建全文索引失败";
    updateRow(entry.id, { loading: false, error: message });
    if (!quiet) uiMessage.error(message);
    return false;
  }
}

async function runBatch(entries: InkHubNovelEntry[]): Promise<void> {
  if (batchRunning.value || entries.length === 0) return;
  batchRunning.value = true;
  batchStopRequested.value = false;
  batchCompleted.value = 0;
  batchTotal.value = entries.length;
  let succeeded = 0;

  for (const entry of entries) {
    if (batchStopRequested.value) break;
    batchCurrentTitle.value = entry.title;
    if (await buildEntry(entry, true)) succeeded += 1;
    batchCompleted.value += 1;
  }

  const stopped = batchStopRequested.value;
  batchRunning.value = false;
  batchCurrentTitle.value = "";
  if (stopped) {
    uiMessage.warning(`索引队列已停止，已处理 ${batchCompleted.value}/${batchTotal.value} 部`);
  } else if (succeeded === entries.length) {
    uiMessage.success(`${succeeded} 部小说的全文索引已完成`);
  } else {
    uiMessage.warning(`索引队列完成：${succeeded} 部成功，${entries.length - succeeded} 部失败`);
  }
}

function stopBatch(): void {
  batchStopRequested.value = true;
}

function preferredModel(models: ModelConfig[], defaultModelId: string): ModelConfig | undefined {
  return models.find((model) => model.id === defaultModelId) ?? models[0];
}

async function checkModelHub(): Promise<void> {
  if (modelHubChecking.value) return;
  const models = window.deepwrite?.models;
  if (!models) {
    modelHubHealth.value = "unconfigured";
    modelHubDetail.value = "当前环境没有提供模型配置接口";
    return;
  }
  modelHubChecking.value = true;
  modelHubHealth.value = "checking";
  modelHubDetail.value = "正在读取本机模型目录…";
  try {
    const settings = await models.list();
    const model = preferredModel(settings.models, settings.defaultModelId);
    if (!model) {
      modelHubHealth.value = "unconfigured";
      modelHubDetail.value = "尚未配置模型，请先前往“模型配置”";
      return;
    }
    if (!model.hasApiKey && !["ollama", "lm-studio"].includes(model.provider.toLowerCase())) {
      modelHubHealth.value = "unconfigured";
      modelHubDetail.value = `${model.label} 尚未配置 API Key 或网关令牌`;
      return;
    }
    const result = await models.listRemote({
      id: model.id,
      provider: model.provider,
      api: model.api,
      baseUrl: model.baseUrl
    });
    modelHubHealth.value = "online";
    modelHubDetail.value = `${model.label} · 可用模型 ${result.models.length} 个`;
  } catch {
    modelHubHealth.value = "offline";
    modelHubDetail.value = "无法连接已选模型服务；本地阅读与索引仍可使用";
  } finally {
    modelHubChecking.value = false;
  }
}

watch(
  () => [props.refreshKey, props.entries.map((entry) => entry.id).join("\n")],
  () => void loadIndexStatuses()
);

onMounted(() => {
  void loadIndexStatuses();
});
</script>

<template>
  <section class="index-center" aria-labelledby="index-center-heading">
    <div class="modelhub-health" :data-status="modelHubHealth" aria-live="polite">
      <span class="health-dot" aria-hidden="true" />
      <div>
        <strong>模型服务运行状态 · {{ modelHubLabel }}</strong>
        <small>{{ modelHubDetail }}</small>
        <small>点击检查会连接已配置的服务并携带所需凭证；只读取模型目录，不会发起生成请求</small>
      </div>
      <button type="button" :disabled="modelHubChecking" @click="checkModelHub">
        {{ modelHubChecking ? '检查中…' : '检查连接' }}
      </button>
    </div>

    <details class="index-details" open>
      <summary>
        <span class="index-heading-copy">
          <span class="index-eyebrow">全量正文可用性</span>
          <strong id="index-center-heading">全库索引中心</strong>
        </span>
        <span class="index-stats" aria-label="全库索引统计">
          <span><b>{{ totals.total }}</b>全部</span>
          <span><b>{{ totals.ready }}</b>已就绪</span>
          <span><b>{{ totals.pending }}</b>待索引</span>
          <span><b>{{ totals.stale }}</b>需更新</span>
          <span><b>{{ totals.failed }}</b>失败</span>
        </span>
      </summary>

      <div class="index-actions">
        <p>这里先读取最近索引快照；打开小说时会在后台校验原稿变化。索引只写入墨枢私有数据库，队列按作品串行处理，不改动小说原文件。</p>
        <div>
          <button type="button" :disabled="batchRunning || statusLoading || pendingEntries.length === 0" @click="runBatch(pendingEntries)">
            <AppIcon name="redo" :size="15" />一键构建待处理
          </button>
          <button type="button" :disabled="batchRunning || failedEntries.length === 0" @click="runBatch(failedEntries)">
            重试失败项
          </button>
          <button v-if="batchRunning" type="button" class="stop-action" @click="stopBatch">
            停止队列
          </button>
          <button type="button" :disabled="statusLoading || batchRunning" @click="loadIndexStatuses">
            刷新状态
          </button>
        </div>
      </div>

      <div v-if="batchRunning || batchCompleted" class="batch-progress" aria-live="polite">
        <div>
          <span>{{ batchRunning ? `正在处理《${batchCurrentTitle}》` : '本次队列已结束' }}</span>
          <strong>{{ batchCompleted }} / {{ batchTotal }}</strong>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          aria-label="全库索引队列进度"
          :aria-valuenow="progressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${progressPercent}%` }" />
        </div>
        <small v-if="batchRunning">停止队列会等待当前作品完成，已完成的索引会保留。</small>
      </div>

      <div class="index-list" :aria-busy="statusLoading">
        <article v-for="entry in entries" :key="entry.id" class="index-row">
          <div class="index-entry-copy">
            <strong>{{ entry.title }}</strong>
            <small :title="entry.relativePath">{{ entry.relativePath }}</small>
          </div>
          <div class="index-state" :data-status="effectiveStatus(entry.id)">
            <strong>{{ statusLabel(entry.id) }}</strong>
            <small>{{ statusDetail(entry.id) }}</small>
          </div>
          <button
            type="button"
            :disabled="batchRunning || rowFor(entry.id).loading"
            :aria-label="`${effectiveStatus(entry.id) === 'failed' ? '重试' : '构建索引'}：${entry.title}`"
            @click="buildEntry(entry)"
          >
            {{ rowFor(entry.id).loading ? '处理中…' : effectiveStatus(entry.id) === 'failed' ? '重试' : '构建索引' }}
          </button>
        </article>
        <p v-if="!entries.length" class="index-empty">添加小说目录后，可在这里统一构建全文索引。</p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.index-center {
  display: grid;
  gap: 10px;
  width: 100%;
  max-width: 1180px;
  min-width: 0;
  margin: 0 auto 14px;
}

.modelhub-health,
.index-details {
  border: 1px solid var(--theme-line);
  border-radius: 13px;
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
}

.modelhub-health {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.health-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--text-tertiary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--text-tertiary) 12%, transparent);
}
.modelhub-health[data-status="online"] .health-dot { background: #438168; }
.modelhub-health[data-status="offline"] .health-dot { background: #b56355; }
.modelhub-health[data-status="unconfigured"] .health-dot { background: #b7813b; }
.modelhub-health > div { display: grid; min-width: 0; gap: 2px; }
.modelhub-health strong { font-size: .82rem; }
.modelhub-health small { overflow-wrap: anywhere; color: var(--text-tertiary); font-size: .72rem; line-height: 1.45; }

button {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--surface-main);
}
button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 48%, var(--theme-line)); color: var(--accent-text, var(--accent)); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { cursor: not-allowed; opacity: .5; }

.index-details > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  cursor: pointer;
  list-style-position: outside;
}
.index-details > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.index-heading-copy { display: grid; min-width: 0; gap: 2px; }
.index-eyebrow { color: var(--accent-text, var(--accent)); font-size: .68rem; font-weight: 700; letter-spacing: .08em; }
.index-heading-copy strong { font-size: .92rem; }
.index-stats { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
.index-stats > span { display: inline-flex; align-items: baseline; gap: 4px; padding: 4px 7px; border-radius: 999px; color: var(--text-tertiary); background: var(--surface-muted); font-size: .68rem; white-space: nowrap; }
.index-stats b { color: var(--text-primary); font-size: .76rem; }

.index-actions,
.batch-progress,
.index-list { border-top: 1px solid var(--theme-line-soft); }
.index-actions { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 11px 14px; }
.index-actions p { max-width: 64ch; margin: 0; color: var(--text-tertiary); font-size: .72rem; line-height: 1.5; }
.index-actions > div { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.index-actions button { display: inline-flex; align-items: center; gap: 6px; }
.index-actions .stop-action { color: #a84c45; }

.batch-progress { display: grid; gap: 7px; padding: 11px 14px; }
.batch-progress > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text-secondary); font-size: .76rem; }
.batch-progress small { color: var(--text-tertiary); font-size: .7rem; }
.progress-track { height: 6px; overflow: hidden; border-radius: 999px; background: var(--surface-muted); }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .18s ease; }

.index-list { display: grid; max-height: min(420px, 46vh); overflow: auto; padding: 7px; }
.index-row { display: grid; grid-template-columns: minmax(150px, .8fr) minmax(220px, 1.2fr) auto; align-items: center; gap: 10px; min-width: 0; padding: 8px; border-radius: 9px; }
.index-row:hover { background: var(--surface-hover); }
.index-entry-copy,
.index-state { display: grid; min-width: 0; gap: 2px; }
.index-entry-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .78rem; }
.index-entry-copy small,
.index-state small { min-width: 0; overflow-wrap: anywhere; color: var(--text-tertiary); font-size: .68rem; }
.index-state strong { color: var(--text-secondary); font-size: .72rem; }
.index-state[data-status="ready"] strong { color: #438168; }
.index-state[data-status="failed"] strong { color: #b56355; }
.index-state[data-status="stale"] strong,
.index-state[data-status="partial"] strong { color: #a56d27; }
.index-empty { margin: 0; padding: 22px; color: var(--text-tertiary); text-align: center; font-size: .78rem; }

@container (max-width: 760px) {
  .index-actions { align-items: stretch; flex-direction: column; }
  .index-actions > div { justify-content: flex-start; }
  .index-row { grid-template-columns: minmax(0, 1fr) auto; }
  .index-state { grid-column: 1; }
  .index-row > button { grid-area: 1 / 2 / span 2 / 3; }
}

@container (max-width: 520px) {
  .modelhub-health { grid-template-columns: auto minmax(0, 1fr); }
  .modelhub-health > button { grid-column: 2; justify-self: start; }
  .index-details > summary { align-items: flex-start; flex-direction: column; }
  .index-stats { justify-content: flex-start; }
}

@media (prefers-reduced-motion: reduce) {
  .progress-track span { transition: none; }
}
</style>
