<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from "vue";
import type {
  LongWorkspaceIndexSnapshot,
  LongWorkspaceOperationBatch
} from "@deepwrite/contracts";
import type { LongStructureMutationCompletion } from "../types/longWorkspace";
import AppIcon from "./AppIcon.vue";
import LongStructureManager from "./LongStructureManager.vue";
import LongOutlineContentReport from "./LongOutlineContentReport.vue";
import { assessLongOutlineCompleteness } from "../utils/longOutlineCompleteness";

const props = defineProps<{
  open: boolean;
  bookTitle: string;
  bookId?: string | null;
  agentsMd?: string | null;
  agentsMdPending?: boolean;
  syncBookOptions?: ReadonlyArray<{
    id: string;
    title: string;
    categoryCount: number;
  }>;
  snapshot: LongWorkspaceIndexSnapshot | null;
  pending?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  mutation: [
    batch: LongWorkspaceOperationBatch,
    completion: LongStructureMutationCompletion
  ];
  syncWorldbuilding: [
    payload: { sourceBookId: string; sourceTitle: string },
    completion: LongStructureMutationCompletion
  ];
  saveAgentsMd: [
    content: string,
    completion: LongStructureMutationCompletion
  ];
}>();

const dialogElement = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const manager = ref<{
  flushAgentsMdIfNeeded(): Promise<boolean>;
} | null>(null);
const childModalActive = ref(false);
const outlineReport = computed(() => props.open && props.snapshot ? assessLongOutlineCompleteness(props.snapshot) : null);
const visibleOutlineFindings = computed(() => outlineReport.value?.findings.slice(0, 200) ?? []);
let previousFocus: HTMLElement | null = null;

async function close(): Promise<void> {
  if (props.pending) return;
  if (manager.value && !(await manager.value.flushAgentsMdIfNeeded())) {
    return;
  }
  emit("close");
}

function forwardMutation(
  batch: LongWorkspaceOperationBatch,
  completion: LongStructureMutationCompletion
): void {
  emit("mutation", batch, completion);
}

function forwardSyncWorldbuilding(
  payload: { sourceBookId: string; sourceTitle: string },
  completion: LongStructureMutationCompletion
): void {
  emit("syncWorldbuilding", payload, completion);
}

function forwardSaveAgentsMd(
  content: string,
  completion: LongStructureMutationCompletion
): void {
  emit("saveAgentsMd", content, completion);
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
  if (!props.open || childModalActive.value) return;
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
      await nextTick();
      (closeButton.value ?? dialogElement.value)?.focus({
        preventScroll: true
      });
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
      class="dialog-backdrop long-structure-dialog-overlay"
      @mousedown.self="close"
    >
      <section
        ref="dialogElement"
        class="long-structure-dialog"
        :class="{ 'is-suspended': childModalActive }"
        :role="childModalActive ? undefined : 'dialog'"
        :aria-modal="childModalActive ? undefined : 'true'"
        :aria-hidden="childModalActive ? 'true' : undefined"
        :inert="childModalActive ? true : undefined"
        aria-labelledby="long-structure-dialog-title"
        tabindex="-1"
      >
        <header class="long-structure-dialog-header">
          <div>
            <span>长篇设置</span>
            <strong id="long-structure-dialog-title">
              {{ bookTitle }} · 结构管理
            </strong>
          </div>
          <button
            ref="closeButton"
            type="button"
            aria-label="关闭结构管理"
            :disabled="pending"
            @click="close"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </header>
        <section v-if="outlineReport" class="outline-completeness" aria-label="大纲结构完整性" aria-live="polite">
          <div class="outline-completeness-summary">
            <strong>大纲完整性</strong>
            <span>{{ outlineReport.completeVolumes }} / {{ outlineReport.totalVolumes }} 卷结构齐备</span>
            <small>{{ outlineReport.totalArcs }} 条剧情弧 · {{ outlineReport.totalStoryBeats }} 个情节点 · {{ outlineReport.totalChapterCards }} 张章卡</small>
          </div>
          <details>
            <summary>{{ outlineReport.findings.length ? `${outlineReport.findings.length} 项待补齐或人工确认` : "结构层级已覆盖，仍需人工审阅内容质量" }}</summary>
            <ul>
              <li v-for="finding in visibleOutlineFindings" :key="finding.id" :data-severity="finding.severity">{{ finding.message }}</li>
              <li v-if="outlineReport.findings.length > visibleOutlineFindings.length">显示前 200 项，请先补齐结构再检查剩余项。</li>
              <li>数量和关联关系不代表情节质量；请作者人工确认读者承诺、因果、节奏与人物动机。</li>
            </ul>
          </details>
        </section>
        <LongOutlineContentReport v-if="snapshot" :open="open" :snapshot="snapshot" />
        <LongStructureManager
          v-if="snapshot"
          ref="manager"
          :snapshot="snapshot"
          :current-book-id="bookId"
          :agents-md="agentsMd"
          :agents-md-pending="agentsMdPending"
          :sync-book-options="syncBookOptions"
          :disabled="pending"
          @mutation="forwardMutation"
          @modal-active-change="childModalActive = $event"
          @sync-worldbuilding="forwardSyncWorldbuilding"
          @save-agents-md="forwardSaveAgentsMd"
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.long-structure-dialog-overlay {
  z-index: 2200;
  padding: clamp(12px, 3vw, 32px);
}

.long-structure-dialog {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: min(1040px, 96vw);
  max-height: min(880px, 92vh);
  overflow: hidden;
  border: 1px solid var(--theme-line);
  border-radius: 16px;
  background: var(--surface-raised);
  box-shadow: 0 22px 70px
    color-mix(in srgb, var(--text-primary) 18%, transparent);
  color: var(--text-primary);
}

.outline-completeness { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:10px 18px; border-bottom:1px solid var(--theme-line); background:var(--surface-subtle, var(--surface-main)); }
.outline-completeness-summary { display:grid; grid-template-columns:auto auto; gap:2px 12px; align-items:baseline; }
.outline-completeness-summary strong { grid-row:span 2; }
.outline-completeness-summary small { color:var(--text-secondary); }
.outline-completeness details { max-width:55%; color:var(--text-secondary); }
.outline-completeness summary { cursor:pointer; }
.outline-completeness ul { max-height:160px; overflow:auto; margin:8px 0 0; padding-left:20px; }
.outline-completeness li[data-severity="action"] { color:var(--text-primary); }
@media(max-width:700px) { .outline-completeness { align-items:flex-start; flex-direction:column; }.outline-completeness details { max-width:100%; } }

.long-structure-dialog.is-suspended {
  visibility: hidden;
  pointer-events: none;
}

.long-structure-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.long-structure-dialog-header > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.long-structure-dialog-header span {
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

.long-structure-dialog-header strong {
  overflow: hidden;
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.long-structure-dialog-header button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.long-structure-dialog-header button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.long-structure-dialog :deep(.long-structure-manager) {
  min-height: 0;
  overflow: auto;
}

@media (max-height: 680px), (max-width: 760px) {
  .long-structure-dialog-overlay {
    padding: 8px;
  }

  .long-structure-dialog {
    width: 100%;
    max-height: calc(100vh - 16px);
    border-radius: 12px;
  }
}
</style>
