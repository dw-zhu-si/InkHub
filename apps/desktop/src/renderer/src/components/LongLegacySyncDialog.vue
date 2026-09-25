<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  LongApplyLegacySyncResult,
  LongChooseLegacySyncSourceResult,
  LongLegacySyncModule
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  preview: LongChooseLegacySyncSourceResult | null;
  result?: LongApplyLegacySyncResult | null;
  pending?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [modules: LongLegacySyncModule[]];
}>();

const selected = ref<LongLegacySyncModule[]>([]);

const options = computed(() => {
  const counts = props.preview?.counts;
  return [
    {
      id: "worldbuilding" as const,
      title: "世界观",
      description: `分类、概览、正文和条目（${counts?.worldbuilding ?? 0} 个分类）`,
      count: counts?.worldbuilding ?? 0
    },
    {
      id: "characters" as const,
      title: "人物",
      description: `人物档案、关系、状态和历史（${counts?.characters ?? 0} 人）`,
      count: counts?.characters ?? 0
    },
    {
      id: "plot" as const,
      title: "剧情",
      description:
        `大纲 ${counts?.outline ?? 0}、卷纲 ${counts?.volumes ?? 0}、剧情点 ${counts?.plotPoints ?? 0}、` +
        `故事事件 ${counts?.storyEvents ?? 0}、章卡 ${counts?.chapterCards ?? 0}`,
      count:
        (counts?.outline ?? 0) +
        (counts?.volumes ?? 0) +
        (counts?.plotPoints ?? 0) +
        (counts?.storyEvents ?? 0) +
        (counts?.chapterCards ?? 0)
    }
  ];
});

watch(
  () => props.preview?.previewId,
  () => {
    selected.value = options.value
      .filter(({ count }) => count > 0)
      .map(({ id }) => id);
  },
  { immediate: true }
);

function toggle(module: LongLegacySyncModule): void {
  if (props.pending || props.result) return;
  selected.value = selected.value.includes(module)
    ? selected.value.filter((candidate) => candidate !== module)
    : [...selected.value, module];
}

function confirm(): void {
  if (props.pending || props.result || selected.value.length === 0) return;
  emit("confirm", [...selected.value]);
}

function total(counts: LongApplyLegacySyncResult["imported"]): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="preview" class="dialog-backdrop" @mousedown.self="!pending && emit('close')">
      <section class="workspace-dialog legacy-sync-dialog" role="dialog" aria-modal="true" aria-labelledby="legacy-sync-title">
        <header>
          <div>
            <span class="dialog-eyebrow">同步旧版本</span>
            <h2 id="legacy-sync-title">{{ preview.sourceTitle }}</h2>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭" :disabled="pending" @click="emit('close')">×</button>
        </header>

        <div class="dialog-content legacy-sync-content">
          <template v-if="!result">
            <p>选择要追加到当前长篇的内容。现有内容不会删除或覆盖，重复同步的条目会自动跳过。</p>
            <div class="legacy-sync-options">
              <button
                v-for="option in options"
                :key="option.id"
                type="button"
                class="legacy-sync-option"
                :class="{ 'is-selected': selected.includes(option.id) }"
                :disabled="pending || option.count === 0"
                @click="toggle(option.id)"
              >
                <span class="legacy-sync-checkbox" aria-hidden="true">
                  <AppIcon v-if="selected.includes(option.id)" name="check" :size="14" />
                </span>
                <span><strong>{{ option.title }}</strong><small>{{ option.description }}</small></span>
              </button>
            </div>
            <p v-if="preview.warnings.length" class="legacy-sync-warning">压缩包有 {{ preview.warnings.length }} 项解析提示，同步完成后会一并显示。</p>
          </template>
          <template v-else>
            <div class="legacy-sync-result">
              <AppIcon name="check" :size="24" />
              <strong>同步完成</strong>
              <span>新增 {{ total(result.imported) }} 项，跳过 {{ total(result.skipped) }} 项。</span>
            </div>
            <details v-if="result.warnings.length">
              <summary>{{ result.warnings.length }} 项同步说明</summary>
              <ul><li v-for="warning in result.warnings" :key="warning">{{ warning }}</li></ul>
            </details>
          </template>
          <footer class="dialog-actions">
            <button
              v-if="!result"
              class="dialog-secondary-button"
              type="button"
              :disabled="pending"
              @click="emit('close')"
            >取消</button>
            <button
              v-if="!result"
              class="dialog-primary-button"
              type="button"
              :disabled="pending || selected.length === 0"
              @click="confirm"
            >{{ pending ? "同步中…" : "确认同步" }}</button>
            <button
              v-else
              class="dialog-primary-button"
              type="button"
              @click="emit('close')"
            >完成</button>
          </footer>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.legacy-sync-dialog { width: min(620px, calc(100vw - 40px)); }
.legacy-sync-content { display: grid; gap: 14px; }
.legacy-sync-content > p { margin: 0; color: var(--text-secondary); line-height: 1.6; }
.legacy-sync-options { display: grid; gap: 8px; }
.legacy-sync-option { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--theme-line-soft); border-radius: 10px; background: var(--surface-raised); color: var(--text-primary); text-align: left; }
.legacy-sync-option.is-selected { border-color: var(--accent); background: var(--accent-soft); }
.legacy-sync-option:disabled { opacity: .5; }
.legacy-sync-checkbox { display: grid; place-items: center; width: 20px; height: 20px; border: 1px solid var(--theme-line); border-radius: 5px; }
.legacy-sync-option > span:last-child { display: grid; gap: 4px; }
.legacy-sync-option small { color: var(--text-tertiary); line-height: 1.45; }
.legacy-sync-warning { font-size: .785714rem; }
.legacy-sync-result { display: grid; justify-items: center; gap: 8px; padding: 22px; border-radius: 12px; background: var(--surface-muted); }
details { color: var(--text-secondary); }
details ul { max-height: 220px; overflow: auto; padding-left: 22px; }
</style>
