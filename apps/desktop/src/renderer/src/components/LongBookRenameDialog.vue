<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";

const props = defineProps<{
  open: boolean;
  title: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [title: string];
}>();

const nameDraft = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

watch(
  () => [props.open, props.title] as const,
  ([open, title]) => {
    if (!open) return;
    nameDraft.value = title;
    void nextTick(() => {
      nameInput.value?.focus();
      nameInput.value?.select();
    });
  },
  { immediate: true }
);

function requestClose(): void {
  if (!props.pending) emit("close");
}

function submit(): void {
  if (props.pending) return;
  const title = nameDraft.value.trim();
  if (!title) {
    uiMessage.warning("请输入长篇名称");
    nameInput.value?.focus();
    return;
  }
  emit("submit", title);
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
      <section
        class="workspace-dialog book-resource-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="long-book-rename-dialog-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">{{ title }}</span>
            <h2 id="long-book-rename-dialog-title">修改长篇名称</h2>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭" :disabled="pending" @click="requestClose">×</button>
        </header>

        <form class="dialog-content" @submit.prevent="submit">
          <label class="book-resource-name-field">
            <span>长篇名称</span>
            <input ref="nameInput" v-model="nameDraft" type="text" maxlength="256" autocomplete="off" aria-label="长篇名称" />
          </label>
          <p class="book-resource-help">侧栏和长篇工作区显示名称会同步更新，本地项目文件夹名称不会被自动修改。</p>

          <div class="dialog-actions">
            <button class="dialog-secondary-button" type="button" :disabled="pending" @click="requestClose">取消</button>
            <button class="dialog-primary-button" type="submit" :disabled="pending">
              {{ pending ? "保存中…" : "保存名称" }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
