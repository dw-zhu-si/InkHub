<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { LongManuscriptExportSection } from "@deepwrite/contracts";
import type { IconName } from "../types/workspace";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  open: boolean;
  bookTitle: string;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  export: [sections: LongManuscriptExportSection[]];
}>();

const options: ReadonlyArray<{
  id: LongManuscriptExportSection;
  label: string;
  description: string;
  icon: IconName;
}> = [
  { id: "worldbuilding", label: "世界观", description: "分类正文与全部条目", icon: "globe" },
  { id: "characters", label: "人物", description: "概览、档案、关系与状态", icon: "user" },
  { id: "plot", label: "剧情", description: "卷、剧情点、章节卡与伏笔", icon: "book" },
  { id: "manuscript", label: "正文", description: "按章节顺序导出正文", icon: "file" }
];

const selected = ref<LongManuscriptExportSection[]>(options.map(({ id }) => id));
const canSubmit = computed(() => selected.value.length > 0 && !props.submitting);

watch(
  () => props.open,
  (open) => {
    if (open) selected.value = options.map(({ id }) => id);
  }
);

function requestClose(): void {
  if (!props.submitting) emit("close");
}

function submit(): void {
  if (canSubmit.value) emit("export", [...selected.value]);
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") requestClose();
}

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section class="workspace-dialog export-long-dialog" role="dialog" aria-modal="true" aria-labelledby="export-long-title">
        <header>
          <div>
            <span class="dialog-eyebrow">{{ bookTitle }}</span>
            <h2 id="export-long-title">导出长篇</h2>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭" :disabled="submitting" @click="requestClose">×</button>
        </header>

        <form class="dialog-content export-long-content" @submit.prevent="submit">
          <div class="export-long-notice" role="note">
            <AppIcon name="folder" :size="18" />
            <p>所选内容会导出到同一个文件夹，全部使用页面中可见的名称生成 TXT 文件，不使用内部 ID。</p>
          </div>

          <fieldset class="export-long-options">
            <legend>选择导出内容</legend>
            <div class="export-long-grid">
              <label v-for="option in options" :key="option.id" class="export-long-card" :class="{ 'is-selected': selected.includes(option.id) }">
                <input v-model="selected" type="checkbox" :value="option.id" :disabled="submitting" />
                <span class="export-long-icon"><AppIcon :name="option.icon" :size="20" /></span>
                <span class="export-long-copy"><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
                <span class="export-long-check" aria-hidden="true">✓</span>
              </label>
            </div>
          </fieldset>

          <div class="dialog-actions export-long-actions">
            <button class="dialog-secondary-button" type="button" :disabled="submitting" @click="requestClose">取消</button>
            <button class="dialog-primary-button" type="submit" :disabled="!canSubmit">
              <AppIcon name="download" :size="15" />
              {{ submitting ? "正在整理并导出…" : "选择导出位置" }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.export-long-dialog { width: min(650px, calc(100vw - 48px)); }
.export-long-content { display: grid; gap: 18px; }
.export-long-notice { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 10px; align-items: start; padding: 13px 14px; border: 1px solid var(--theme-line-soft); border-radius: 10px; background: var(--surface-muted); color: var(--text-secondary); }
.export-long-notice p { margin: 0; font-size: 0.75rem; line-height: 1.65; }
.export-long-options { min-width: 0; padding: 0; border: 0; }
.export-long-options legend { margin-bottom: 9px; color: var(--text-primary); font-size: 0.785714rem; font-weight: 620; }
.export-long-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.export-long-card { position: relative; display: grid; grid-template-columns: 38px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 78px; padding: 12px; border: 1px solid var(--theme-line); border-radius: 11px; background: var(--surface-raised); cursor: pointer; transition: 120ms ease; }
.export-long-card:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--theme-line)); background: var(--surface-hover); }
.export-long-card.is-selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface-raised)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent); }
.export-long-card input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.export-long-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 9px; background: var(--surface-muted); color: var(--text-secondary); }
.is-selected .export-long-icon { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.export-long-copy { display: grid; gap: 4px; min-width: 0; }
.export-long-copy strong { color: var(--text-primary); font-size: 0.785714rem; font-weight: 620; }
.export-long-copy small { color: var(--text-tertiary); font-size: 0.678571rem; line-height: 1.45; }
.export-long-check { position: absolute; top: 8px; right: 9px; display: none; color: var(--accent); font-size: 0.714286rem; font-weight: 700; }
.is-selected .export-long-check { display: block; }
.export-long-actions { margin-top: 0; padding-top: 2px; }
@media (max-width: 580px) { .export-long-grid { grid-template-columns: 1fr; } }
</style>
