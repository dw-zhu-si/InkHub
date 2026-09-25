<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { MaterialStageId } from "@deepwrite/contracts";
import PopupSelect from "./PopupSelect.vue";

const props = defineProps<{
  open: boolean;
  entryTitle: string;
  targetLibraryTitle: string;
  options: readonly { value: MaterialStageId; label: string }[];
  initialStageId: MaterialStageId;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [stageId: MaterialStageId];
}>();

const stageId = ref<MaterialStageId>(props.initialStageId);
const heading = computed(() => `移动“${props.entryTitle}”`);

function requestClose(): void {
  if (!props.submitting) emit("close");
}

function submit(): void {
  if (!props.submitting) emit("submit", stageId.value);
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") requestClose();
}

watch(
  () => [props.open, props.initialStageId, props.options] as const,
  ([open, initialStageId, options]) => {
    if (!open) return;
    stageId.value = options.some(({ value }) => value === initialStageId)
      ? initialStageId
      : (options[0]?.value ?? initialStageId);
    void nextTick();
  },
  { immediate: true }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section class="workspace-dialog library-entry-move-dialog" role="dialog" aria-modal="true" aria-labelledby="library-entry-move-title">
        <header>
          <div>
            <span class="dialog-eyebrow">素材库 · 调整分类</span>
            <h2 id="library-entry-move-title">{{ heading }}</h2>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭" :disabled="submitting" @click="requestClose">×</button>
        </header>
        <form class="dialog-content catalog-resource-form" @submit.prevent="submit">
          <p class="dialog-description">目标素材库“{{ targetLibraryTitle }}”使用不同分类。请选择该素材在目标库中的内容阶段。</p>
          <label class="book-resource-name-field catalog-resource-stage-field">
            <span>内容阶段</span>
            <PopupSelect v-model="stageId" :options="options" accessible-label="移动后的内容阶段" size="large" :disabled="submitting" :menu-min-width="220" />
          </label>
          <div class="dialog-actions">
            <button class="dialog-secondary-button" type="button" :disabled="submitting" @click="requestClose">取消</button>
            <button class="dialog-primary-button" type="submit" :disabled="submitting">{{ submitting ? "移动中…" : "确认移动" }}</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
