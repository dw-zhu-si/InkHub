<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from "vue";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: { title: string; summary: string }];
}>();

const dialogElement = ref<HTMLElement | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);
const title = ref("");
const summary = ref("");
let previousFocus: HTMLElement | null = null;

function close(): void {
  if (!props.pending) emit("close");
}

function submit(): void {
  const normalizedTitle = title.value.trim();
  if (!normalizedTitle) {
    uiMessage.warning("请输入分卷名称。");
    titleInput.value?.focus({ preventScroll: true });
    return;
  }
  emit("submit", {
    title: normalizedTitle,
    summary: summary.value
  });
}

function focusableElements(): HTMLElement[] {
  return dialogElement.value
    ? Array.from(
        dialogElement.value.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("hidden"))
    : [];
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) return;
  if (event.key === "Escape") {
    close();
    return;
  }
  if (
    event.key !== "Tab" ||
    !(event.target instanceof Node) ||
    !dialogElement.value?.contains(event.target)
  ) {
    return;
  }
  const focusable = focusableElements();
  if (!focusable.length) {
    event.preventDefault();
    dialogElement.value.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      title.value = "";
      summary.value = "";
      await nextTick();
      titleInput.value?.focus({ preventScroll: true });
      return;
    }
    const target = previousFocus;
    previousFocus = null;
    await nextTick();
    if (target?.isConnected) target.focus({ preventScroll: true });
  }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() =>
  document.removeEventListener("keydown", handleKeydown)
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-backdrop create-volume-overlay"
      @mousedown.self="close"
    >
      <section
        ref="dialogElement"
        class="create-volume-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-long-volume-title"
        tabindex="-1"
      >
        <form @submit.prevent="submit">
          <header>
            <div>
              <span>剧情设计 · 全书故事线</span>
              <h2 id="create-long-volume-title">新建分卷</h2>
            </div>
            <button
              class="close-button"
              type="button"
              aria-label="关闭新建分卷弹窗"
              :disabled="pending"
              @click="close"
            >
              <AppIcon name="close" :size="16" />
            </button>
          </header>

          <fieldset :disabled="pending">
            <label>
              <span>分卷名称</span>
              <input
                ref="titleInput"
                v-model="title"
                maxlength="256"
                autocomplete="off"
                placeholder="例如：第一卷"
                required
              />
            </label>
            <label>
              <span>卷纲</span>
              <textarea
                v-model="summary"
                rows="8"
                maxlength="200000"
                placeholder="可选；创建后也可以在对应分卷 Tab 中继续编辑"
              />
            </label>
          </fieldset>

          <footer>
            <button type="button" :disabled="pending" @click="close">
              取消
            </button>
            <button class="primary-button" type="submit" :disabled="pending">
              {{ pending ? "创建中…" : "创建分卷" }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.create-volume-overlay {
  z-index: 2400;
  padding: 1rem;
}

.create-volume-dialog {
  width: min(36rem, 94vw);
  max-height: min(44rem, 92vh);
  overflow: auto;
  border: 1px solid var(--theme-line);
  border-radius: 1rem;
  background: var(--surface-raised);
  box-shadow: 0 1.4rem 4rem
    color-mix(in srgb, var(--text-primary) 18%, transparent);
  color: var(--text-primary);
}

form,
fieldset {
  display: grid;
}

header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

header {
  padding: 1rem 1.1rem;
  border-bottom: 1px solid var(--theme-line-soft);
}

header span {
  color: var(--text-tertiary);
  font-size: 0.75rem;
}

h2 {
  margin: 0.2rem 0 0;
  font-size: 1.05rem;
}

.close-button {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
}

fieldset {
  min-width: 0;
  margin: 0;
  padding: 1.1rem;
  border: 0;
  gap: 0.9rem;
}

label {
  display: grid;
  gap: 0.4rem;
}

label > span {
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 650;
}

input,
textarea,
button {
  border: 1px solid var(--theme-line);
  border-radius: 0.65rem;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
}

input,
textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.75rem;
  outline: none;
}

textarea {
  min-height: 9rem;
  resize: vertical;
}

input:focus,
textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 0.16rem var(--accent-soft);
}

footer {
  justify-content: flex-end;
  padding: 0.9rem 1.1rem;
  border-top: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

button {
  min-height: 2.25rem;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--surface-hover);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.primary-button {
  border-color: var(--neutral-solid);
  background: var(--neutral-solid);
  color: var(--accent-contrast, #fff);
}

.primary-button:hover:not(:disabled) {
  border-color: color-mix(
    in srgb,
    var(--neutral-solid) 86%,
    var(--text-primary)
  );
  background: color-mix(
    in srgb,
    var(--neutral-solid) 86%,
    var(--text-primary)
  );
}
</style>
