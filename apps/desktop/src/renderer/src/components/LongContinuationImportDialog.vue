<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  LONG_BOOK_GENRES,
  type LongChooseContinuationImportSourceResult,
  type LongImportContinuationInput
} from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import PopupSelect from "./PopupSelect.vue";

const props = defineProps<{
  preview: LongChooseContinuationImportSourceResult | null;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [input: LongImportContinuationInput];
}>();

const title = ref("");
const genre = ref("其他");
const titleInput = ref<HTMLInputElement | null>(null);
const genreOptions = LONG_BOOK_GENRES.map((value) => ({ value, label: value }));

function requestClose(): void {
  if (!props.submitting) emit("close");
}

function submit(): void {
  if (!props.preview) return;
  const normalizedTitle = title.value.trim();
  if (!normalizedTitle) {
    uiMessage.warning("请输入书名");
    titleInput.value?.focus();
    return;
  }
  emit("confirm", {
    previewId: props.preview.previewId,
    title: normalizedTitle,
    genre: genre.value
  });
}

function encodingLabel(encoding: string): string {
  return encoding === "utf-8" ? "UTF-8" : encoding.toUpperCase();
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.preview && event.key === "Escape") requestClose();
}

watch(
  () => props.preview,
  (preview) => {
    if (!preview) return;
    title.value = preview.defaultTitle;
    genre.value = "其他";
    void nextTick(() => titleInput.value?.focus());
  },
  { immediate: true }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="preview" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        class="workspace-dialog continuation-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="continuation-import-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">长篇 · 续写导入</span>
            <h2 id="continuation-import-title">核对 TXT 章节顺序</h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            aria-label="关闭"
            :disabled="submitting"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <form class="dialog-content continuation-import-form" @submit.prevent="submit">
          <section class="continuation-import-basics">
            <label>
              <span>书名</span>
              <input
                ref="titleInput"
                v-model="title"
                type="text"
                maxlength="256"
                autocomplete="off"
                :disabled="submitting"
              />
            </label>
            <label>
              <span>题材</span>
              <PopupSelect
                :model-value="genre"
                :options="genreOptions"
                accessible-label="长篇题材"
                size="large"
                :disabled="submitting"
                :menu-min-width="180"
                @update:model-value="genre = String($event)"
              />
            </label>
          </section>

          <section class="continuation-import-summary" aria-label="导入摘要">
            <span><strong>{{ preview.volumeCount }}</strong> 卷</span>
            <span><strong>{{ preview.chapterCount }}</strong> 章</span>
            <span><strong>{{ preview.checkpointCount }}</strong> 个历史检查点</span>
            <span>待核验：<strong>{{ preview.pendingVolumeTitle }} · {{ preview.pendingChapterTitle }}</strong></span>
          </section>

          <p class="continuation-import-note">
            前 {{ preview.checkpointCount }} 章只会封存为不可逆的导入检查点，不会生成或推断人物事实、世界观揭露和接续包。最后一章导入后会成为唯一待处理章节。
          </p>

          <section
            v-if="preview.warnings.length"
            class="continuation-import-order-notes"
            aria-label="排序提示"
          >
            <strong>排序提示</strong>
            <span v-for="warning in preview.warnings" :key="warning">{{ warning }}</span>
          </section>

          <section class="continuation-import-tree" aria-label="卷章导入顺序">
            <article v-for="volume in preview.volumes" :key="`${volume.order}:${volume.sourceName}`">
              <header>
                <strong>{{ volume.order }}. {{ volume.title }}</strong>
                <span>{{ volume.chapters.length }} 章</span>
              </header>
              <ol>
                <li
                  v-for="chapter in volume.chapters"
                  :key="`${chapter.order}:${chapter.sourceName}`"
                >
                  <span>{{ chapter.order }}. {{ chapter.title }}</span>
                  <small :class="{ 'is-non-utf8': chapter.encoding !== 'utf-8' }">
                    {{ encodingLabel(chapter.encoding) }}
                  </small>
                </li>
              </ol>
            </article>
          </section>

          <footer class="dialog-actions">
            <button type="button" :disabled="submitting" @click="requestClose">取消</button>
            <button class="dialog-primary-button" type="submit" :disabled="submitting">
              {{ submitting ? "导入中…" : "确认导入" }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.continuation-import-dialog {
  width: min(760px, calc(100vw - 40px));
  max-height: min(820px, calc(100vh - 40px));
  border-color: var(--theme-line);
  background: var(--surface-main);
}

.continuation-import-form {
  display: grid;
  min-height: 0;
  gap: 14px;
}

.continuation-import-basics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 0.32fr);
  gap: 12px;
}

.continuation-import-basics label {
  display: grid;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 0.785714rem;
}

.continuation-import-basics input {
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  outline: none;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
}

.continuation-import-basics input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.continuation-import-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.continuation-import-summary span {
  padding: 6px 9px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.continuation-import-summary strong {
  color: var(--text-primary);
}

.continuation-import-note,
.continuation-import-order-notes {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 9px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.65;
}

.continuation-import-order-notes {
  display: grid;
  gap: 3px;
}

.continuation-import-order-notes strong {
  color: var(--text-primary);
}

.continuation-import-tree {
  min-height: 160px;
  max-height: min(390px, 45vh);
  overflow: auto;
  border: 1px solid var(--theme-line);
  border-radius: 10px;
  background: var(--surface-raised);
}

.continuation-import-tree article + article {
  border-top: 1px solid var(--theme-line-soft);
}

.continuation-import-tree article > header {
  position: sticky;
  top: 0;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font-size: 0.785714rem;
}

.continuation-import-tree article > header span {
  color: var(--text-tertiary);
}

.continuation-import-tree ol {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.continuation-import-tree li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding: 5px 12px;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.continuation-import-tree li + li {
  border-top: 1px solid var(--theme-line-soft);
}

.continuation-import-tree li span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.continuation-import-tree small {
  flex: 0 0 auto;
  color: var(--text-tertiary);
}

.continuation-import-tree small.is-non-utf8 {
  color: var(--accent);
}

.continuation-import-form footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.continuation-import-form footer button {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}

.continuation-import-form footer button:not(.dialog-primary-button) {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}

.continuation-import-form footer button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 620px) {
  .continuation-import-basics {
    grid-template-columns: 1fr;
  }
}
</style>
