<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import { outlineContentTargets, readOutlineContentBatch, OUTLINE_CONTENT_BATCH, type OutlineContentResult, type OutlineContentStatus } from "../utils/longOutlineContent";

const props = defineProps<{ open: boolean; snapshot: LongWorkspaceIndexSnapshot }>();
const results = ref<OutlineContentResult[]>([]);
const busy = ref(false);
const offset = ref(0);
const page = ref(0);
let generation = 0;
const targets = computed(() => outlineContentTargets(props.snapshot));
const visibleResults = computed(() => results.value.slice(page.value * 50, page.value * 50 + 50));
const filled = computed(() => results.value.filter((item) => item.status === "filled").length);
const labels: Record<OutlineContentStatus, string> = { empty: "空白待填写", placeholder: "仅标题/占位待补充", filled: "已填写 · 待作者审阅", partial: "首段未见内容 · 待全文检查", error: "读取失败/版本变化 · 请重查" };

function cancel(): void { generation++; busy.value = false; }
function reset(): void { cancel(); results.value = []; offset.value = 0; page.value = 0; }
watch(() => [props.open, props.snapshot.bookId, props.snapshot.revision], reset);
onBeforeUnmount(cancel);
async function inspect(): Promise<void> {
  const api = window.deepwrite?.long;
  if (!api || busy.value || !props.open) return;
  const current = ++generation;
  busy.value = true;
  try {
    const batch = await readOutlineContentBatch({ bookId: props.snapshot.bookId, workspaceRevision: props.snapshot.revision, targets: targets.value, offset: offset.value, read: (input) => api.readDocument(input), isCurrent: () => props.open && current === generation });
    if (current !== generation || batch.cancelled) return;
    page.value = Math.floor(results.value.length / 50);
    results.value.push(...batch.results);
    offset.value = batch.nextOffset;
  } catch { uiMessage.error("内容检查未完成，请重试。"); }
  finally { if (current === generation) busy.value = false; }
}
</script>

<template>
  <section class="outline-content-report" aria-label="主线与章卡正文完成度">
    <div class="outline-content-toolbar">
      <div><strong>主线与章卡正文</strong><span role="status">已检查 {{ results.length }} / {{ targets.length }} 份 · {{ filled }} 份已填写</span></div>
      <div class="outline-content-actions">
        <button v-if="busy" type="button" data-action="cancel-outline-content" @click="cancel">取消检查</button>
        <button v-else-if="offset < targets.length" type="button" data-action="inspect-outline-content" @click="inspect">{{ offset ? `继续检查下 ${OUTLINE_CONTENT_BATCH} 份` : '检查主线与章卡正文' }}</button>
        <button v-if="results.length && !busy" type="button" @click="reset">重新检查</button>
      </div>
    </div>
    <small>按需每批最多读取 50 份的首 32,768 字。未检查与首段截断不视为完成；已填写仅说明存在内容，承诺、因果与节奏仍需作者审阅。</small>
    <details v-if="results.length" class="outline-content-results">
      <summary>查看逐项结果（{{ results.length }}）</summary>
      <ul><li v-for="item in visibleResults" :key="item.fileId || `${item.volume}:${item.label}`" :data-content-status="item.status"><strong>{{ item.volume }} / {{ item.label }}</strong><span>{{ labels[item.status] }}</span></li></ul>
      <div v-if="results.length > 50" class="outline-content-pagination"><button type="button" :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ Math.ceil(results.length / 50) }}</span><button type="button" :disabled="(page + 1) * 50 >= results.length" @click="page++">下一页</button></div>
    </details>
  </section>
</template>

<style scoped>
.outline-content-report { padding:10px 18px; border-bottom:1px solid var(--theme-line); color:var(--text-primary); background:var(--surface-main); }
.outline-content-toolbar,.outline-content-actions,.outline-content-pagination { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.outline-content-toolbar > div:first-child { display:flex; flex-wrap:wrap; gap:12px; }.outline-content-toolbar span,.outline-content-report small { color:var(--text-secondary); }.outline-content-report small { display:block; margin-top:6px; line-height:1.5; }
button { min-height:30px; padding:4px 10px; border:1px solid var(--theme-line); border-radius:7px; background:var(--surface-raised); color:var(--text-primary); cursor:pointer; }button:disabled { opacity:0.5; cursor:default; }button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.outline-content-results { margin-top:8px; }.outline-content-results summary { cursor:pointer; }.outline-content-results ul { list-style:none; max-height:160px; overflow:auto; margin:8px 0; padding:0; }.outline-content-results li { display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid var(--theme-line-soft); }.outline-content-results li span { color:var(--text-secondary); }.outline-content-pagination { justify-content:flex-end; }
@media(max-width:700px) { .outline-content-results li { flex-direction:column; } }
</style>
