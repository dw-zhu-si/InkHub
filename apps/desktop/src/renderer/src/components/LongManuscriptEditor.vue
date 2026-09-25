<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import MarkdownContent from "./MarkdownContent.vue";

defineProps<{
  title: string;
  titleDraft: string;
  titleEditable: boolean;
  titleReadOnly: boolean;
  eyebrow: string;
  format: string;
  content: string;
  viewMode: "edit" | "preview";
  readOnly: boolean;
  busy: boolean;
  committedNotice: string | undefined;
}>();

const emit = defineEmits<{
  "update:titleDraft": [value: string];
  titleChange: [event: Event];
  titleKeydown: [event: KeyboardEvent];
  beforeinput: [event: InputEvent];
  input: [event: Event];
  keydown: [event: KeyboardEvent];
  editorElementChange: [element: HTMLTextAreaElement | null];
}>();

const editorElement = ref<HTMLTextAreaElement | null>(null);

watch(
  editorElement,
  (element) => emit("editorElementChange", element),
  { flush: "post" }
);

onBeforeUnmount(() => emit("editorElementChange", null));

function updateTitle(event: Event): void {
  const input = event.currentTarget;
  if (input instanceof HTMLInputElement) {
    emit("update:titleDraft", input.value);
  }
}
</script>

<template>
  <section
    class="long-manuscript-editor long-editor-writing-surface"
    :class="{ 'is-readonly': readOnly || busy }"
    aria-label="章节正文编辑区"
  >
    <div class="long-document-meta-row">
      <span>{{ eyebrow }}</span>
      <span v-if="format" class="long-document-format">
        {{ format }}
      </span>
      <span v-if="committedNotice" class="long-committed-content-notice">
        {{ committedNotice }}
      </span>
      <span v-else-if="readOnly" class="long-readonly-badge">
        只读内容
      </span>
    </div>

    <input
      v-if="titleEditable"
      :value="titleDraft"
      class="long-document-title-input"
      :readonly="titleReadOnly"
      maxlength="256"
      autocomplete="off"
      aria-label="章卡标题"
      @input="updateTitle"
      @change="emit('titleChange', $event)"
      @keydown="emit('titleKeydown', $event)"
    />
    <h1 v-else class="long-document-title">
      {{ title }}
    </h1>

    <textarea
      v-if="viewMode === 'edit' && !readOnly"
      ref="editorElement"
      :value="content"
      class="long-document-editor"
      :readonly="busy"
      :aria-label="`${title}${format || '正文'}`"
      spellcheck="false"
      @beforeinput="emit('beforeinput', $event)"
      @input="emit('input', $event)"
      @keydown="emit('keydown', $event)"
    />
    <article v-else class="long-document-preview">
      <MarkdownContent v-if="content.trim()" :content="content" />
      <p v-else class="is-empty">暂无正文</p>
    </article>
  </section>
</template>

<style scoped>
.long-editor-writing-surface {
  --long-document-inline-padding: clamp(18px, 2vw, 24px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  padding: 28px 0 18px;
  overflow: hidden;
  background: var(--surface-main);
}

.long-editor-writing-surface.is-readonly {
  background: var(--surface-raised);
}

.long-document-meta-row {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
  padding-inline: var(--long-document-inline-padding);
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

.long-document-format,
.long-readonly-badge,
.long-committed-content-notice {
  padding: 2px 6px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  font-size: 0.607143rem;
}

.long-readonly-badge {
  border-color: color-mix(in srgb, var(--warning) 28%, var(--theme-line));
  background: color-mix(in srgb, var(--warning) 10%, var(--surface-raised));
  color: var(--warning);
}

.long-committed-content-notice {
  min-width: 0;
  border-color: color-mix(in srgb, var(--accent) 24%, var(--theme-line));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-raised));
  color: var(--text-secondary);
  line-height: 1.45;
  white-space: normal;
}

.long-document-title-input,
.long-document-title {
  width: 100%;
  margin: 8px 0 13px;
  padding: 0 var(--long-document-inline-padding);
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--editor-font);
  font-size: clamp(1.71429rem, 2.2vw, 2.42857rem);
  font-weight: 600;
  line-height: 1.28;
  letter-spacing: -0.025em;
}

.long-document-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.long-document-title-input[readonly] {
  color: var(--text-primary);
}

.long-document-editor,
.long-document-preview {
  width: 100%;
  min-height: 0;
  padding: 0 var(--long-document-inline-padding) 80px;
  overflow-x: hidden;
  overflow-y: auto;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--editor-font);
  font-size: 1.07143rem;
  line-height: 1.95;
  letter-spacing: 0.025em;
}

.long-document-editor {
  resize: none;
  white-space: pre-wrap;
}

.long-document-title-input:focus-visible,
.long-document-editor:focus-visible {
  outline: 1px solid
    color-mix(in srgb, var(--theme-foreground) 22%, transparent);
}

:global(html[data-theme="dark"] .long-document-title-input:focus-visible),
:global(html[data-theme="dark"] .long-document-editor:focus-visible) {
  outline-color: rgb(255 255 255 / 22%);
}

.long-document-editor[readonly] {
  color: var(--text-secondary);
}

.long-document-preview :deep(.markdown-content) {
  white-space: normal;
}

.long-document-preview .is-empty {
  color: var(--text-tertiary);
}

@container (max-width: 40rem) {
  .long-editor-writing-surface {
    --long-document-inline-padding: clamp(14px, 4cqw, 20px);
    padding-top: 18px;
  }

  .long-document-title-input,
  .long-document-title {
    font-size: clamp(1.45rem, 7cqw, 2rem);
  }
}
</style>
