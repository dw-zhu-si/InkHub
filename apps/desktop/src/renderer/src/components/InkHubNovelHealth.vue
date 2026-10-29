<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { InkHubNovelEntry, InkHubNovelRoot } from "@deepwrite/contracts";
import PopupSelect from "./PopupSelect.vue";
import { uiMessage } from "../ui-feedback";
import { checkNovelHealth, indexHealth, storyHealth, type NovelHealthResult } from "../utils/novelHealth";

const props = defineProps<{ entries: InkHubNovelEntry[]; roots: InkHubNovelRoot[]; scannedAt?: string }>();
const emit = defineEmits<{ openReader: [entry: InkHubNovelEntry] }>();
const selectedId = ref(props.entries[0]?.id ?? "");
const result = ref<NovelHealthResult | null>(null);
const checking = ref(false);
const updating = ref(false);
let epoch = 0;
const entry = computed(() => props.entries.find((value) => value.id === selectedId.value) ?? null);
const root = computed(() => props.roots.find((value) => value.id === entry.value?.rootId) ?? null);
const options = computed(() => props.entries.map((value) => ({ value: value.id, label: `${value.title} · ${value.category}` })));
const indexState = computed(() => indexHealth(result.value));
const storyState = computed(() => storyHealth(result.value));
const sourceState = computed(() => !root.value ? "来源未知" : !root.value.available ? "目录不可用" : result.value?.indexError ? "本次校验失败" : result.value?.index?.status === "not-indexed" ? "未索引，尚无版本基准" : result.value?.index ? "已读取，详见索引状态" : "已登记，待校验");

function cancel(): void { epoch++; checking.value = false; }
watch(() => [selectedId.value, props.scannedAt], () => { cancel(); result.value = null; });
watch(() => props.entries.map(({ id }) => id).join("\n"), () => {
  if (!entry.value) selectedId.value = props.entries[0]?.id ?? "";
  cancel(); result.value = null;
});
onBeforeUnmount(cancel);

async function check(): Promise<void> {
  const api = window.deepwrite?.inkHub;
  if (!entry.value || !api || checking.value || updating.value) return;
  const current = ++epoch;
  const id = entry.value.id;
  checking.value = true;
  result.value = null;
  try {
    const checked = await checkNovelHealth(id, api, () => current === epoch);
    if (current === epoch) result.value = checked;
  } catch (error) {
    if (current === epoch) uiMessage.error(error instanceof Error ? error.message : "体检失败");
  } finally {
    if (current === epoch) checking.value = false;
  }
}

async function updateIndex(): Promise<void> {
  const api = window.deepwrite?.inkHub;
  if (!entry.value || !api || checking.value || updating.value) return;
  const id = entry.value.id;
  const current = ++epoch;
  updating.value = true;
  try {
    await api.buildNovelIndex(id);
    if (current !== epoch) return;
    uiMessage.success("全文索引已更新，正在重新体检");
  } catch (error) {
    if (current === epoch) uiMessage.error(error instanceof Error ? error.message : "更新索引失败");
    return;
  } finally {
    updating.value = false;
  }
  if (current === epoch) await check();
}
function date(value: string | null | undefined): string { return value ? new Date(value).toLocaleString("zh-CN") : "暂无记录"; }
</script>

<template>
  <section class="novel-health-panel" aria-labelledby="novel-health-title">
    <header><div><span>本地作品状态</span><h2 id="novel-health-title">作品体检</h2><p>统一核对原稿、全文索引、故事事实与章节摘要。选择作品后点击检查，不会自动调用模型。</p></div></header>
    <div class="health-toolbar">
      <PopupSelect :model-value="selectedId" :options="options" :disabled="updating" accessible-label="选择体检作品" @update:model-value="selectedId = String($event)" />
      <button class="health-check" type="button" :disabled="!entry || checking || updating" @click="check">{{ checking ? '检查中…' : '检查新鲜度' }}</button>
      <button v-if="checking" type="button" @click="cancel">停止等待</button>
    </div>
    <p class="health-check-time" aria-live="polite">本次体检：{{ date(result?.checkedAt) }} · 目录登记扫描：{{ date(scannedAt) }}</p>
    <p v-if="!entries.length" class="health-empty">添加小说目录后，可在这里体检作品。</p>
    <div v-else class="health-grid" :aria-busy="checking || updating">
      <article class="health-source"><h3>原稿来源</h3><strong>{{ sourceState }}</strong><p>{{ entry?.relativePath }}</p><small>来源目录：{{ root?.label ?? '未找到' }}。目录可用性来自最近一次小说库扫描；本次检查会额外校验作品文件。</small></article>
      <article class="health-index" :data-status="indexState.status"><h3>全文索引</h3><strong>{{ indexState.label }}</strong><p>{{ indexState.detail }}</p><small>索引更新：{{ date(result?.index?.indexedAt) }}</small></article>
      <article class="health-facts" :data-status="storyState.status"><h3>结构化故事事实</h3><strong>{{ storyState.label }}</strong><p>{{ storyState.detail }}</p><small>状态更新：{{ date(result?.story?.updatedAt) }}</small></article>
      <article class="health-summaries" :data-status="storyState.status"><h3>章节摘要</h3><strong>{{ storyState.label }}</strong><p>{{ result?.story ? `${result.story.analyzedChapters}/${result.story.totalChapters} 章已有摘要` : '尚未确认摘要覆盖' }}</p><small>章节摘要与故事事实共用同一次重建及来源版本；版本一致不代表 AI 内容正确。</small></article>
    </div>
    <footer v-if="entry"><button class="health-update-index" type="button" :disabled="checking || updating || !root?.available" @click="updateIndex">{{ updating ? '更新索引中…' : '更新全文索引并复查' }}</button><button class="health-open-reader" type="button" :disabled="updating" @click="emit('openReader', entry)">前往阅读器处理事实与摘要</button><small>事实/摘要重建在“质检与续写”中由作者显式发起；此处更新索引只写入墨枢私有索引。</small></footer>
    <p v-if="checking" class="health-wait-note">每次仅检查一部作品，来源校验与故事状态读取串行执行。停止等待会忽略迟到结果，当前文件校验可能仍会完成。</p>
  </section>
</template>

<style scoped>
.novel-health-panel { width:100%; max-width:1180px; min-width:0; margin:0 auto; padding:20px; border:1px solid var(--theme-line); border-radius:14px; background:var(--surface-raised); color:var(--text-primary); }
header span { color:var(--accent); font-size:.75rem; } h2 { margin:4px 0 9px; } header p,.health-check-time,.health-wait-note { color:var(--text-secondary); line-height:1.55; }
.health-toolbar { display:flex; gap:10px; align-items:center; margin-top:18px; }.health-toolbar :deep(.popup-select) { flex:1; min-width:0; }
button { min-height:36px; padding:7px 12px; border:1px solid var(--theme-line); border-radius:8px; background:var(--surface-main); color:var(--text-primary); cursor:pointer; } button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }button:disabled { opacity:.5; cursor:not-allowed; }.health-check { background:var(--text-primary); color:var(--surface-main); }
.health-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.health-grid article { min-width:0; padding:16px; border:1px solid var(--theme-line); border-radius:10px; background:var(--surface-main); overflow-wrap:anywhere; }.health-grid h3 { margin:0 0 12px; font-size:.9rem; }.health-grid p { line-height:1.5; }.health-grid small,footer small { color:var(--text-secondary); line-height:1.5; }.health-grid strong { color:var(--text-primary); }.health-grid [data-status="stale"] strong,.health-grid [data-status="failed"] strong { text-decoration:underline; text-underline-offset:4px; }
footer { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }footer small { flex-basis:100%; }.health-check-time { font-size:.78rem; }.health-empty { padding:24px; color:var(--text-secondary); text-align:center; }
@media(max-width:720px) { .health-grid { grid-template-columns:1fr; }.health-toolbar { align-items:stretch; flex-wrap:wrap; }.health-toolbar :deep(.popup-select) { flex-basis:100%; }.novel-health-panel { padding:14px; } }
</style>
