<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  open: boolean;
  bookTitle: string;
  chapterTitle: string;
  commitSequence: number;
  pending: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && !props.pending && event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() =>
  document.removeEventListener("keydown", handleKeydown)
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="dialog-backdrop long-rollback-backdrop"
      @mousedown.self="!pending && emit('close')"
    >
      <section
        class="long-rollback-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="long-rollback-title"
      >
        <header>
          <span class="long-rollback-icon">
            <AppIcon name="history" :size="20" />
          </span>
          <div>
            <span>连续性账本</span>
            <h2 id="long-rollback-title">回滚最后一次提交？</h2>
          </div>
        </header>

        <p>
          将在“{{ bookTitle }}”中撤销提交 #{{ commitSequence }}（{{
            chapterTitle
          }}），并按该提交记录恢复相关人物、剧情与账本文件。
        </p>
        <p class="long-rollback-note">
          仅允许回滚当前最后一次且标记为可回滚的提交。若项目版本已变化，操作会因 CAS 冲突停止，不会覆盖新内容。
        </p>

        <footer>
          <button
            class="long-rollback-secondary"
            type="button"
            :disabled="pending"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="long-rollback-danger"
            type="button"
            :disabled="pending"
            @click="emit('confirm')"
          >
            {{ pending ? "正在回滚…" : "确认回滚" }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.long-rollback-backdrop {
  z-index: 1800;
  padding: 22px;
}

.long-rollback-dialog {
  width: min(480px, calc(100vw - 40px));
  padding: 20px;
  border: 1px solid var(--theme-line);
  border-radius: 16px;
  background: var(--surface-raised);
  box-shadow: 0 24px 68px rgb(0 0 0 / 32%);
  color: var(--text-primary);
}

.long-rollback-dialog header {
  display: flex;
  align-items: center;
  gap: 11px;
}

.long-rollback-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--danger-soft);
  color: var(--danger);
}

.long-rollback-dialog header > div {
  display: grid;
  gap: 2px;
}

.long-rollback-dialog header span {
  color: var(--text-tertiary);
  font-size: 0.678571rem;
}

.long-rollback-dialog h2 {
  font-size: 1.142857rem;
  font-weight: 650;
}

.long-rollback-dialog > p {
  margin-top: 15px;
  color: var(--text-secondary);
  font-size: 0.821429rem;
  line-height: 1.65;
}

.long-rollback-dialog .long-rollback-note {
  margin-top: 9px;
  padding: 9px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

.long-rollback-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 19px;
}

.long-rollback-dialog button {
  min-height: 33px;
  padding: 6px 13px;
  border-radius: 8px;
  font-size: 0.75rem;
  cursor: pointer;
}

.long-rollback-dialog button:disabled {
  cursor: default;
  opacity: 0.55;
}

.long-rollback-secondary {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-secondary);
}

.long-rollback-secondary:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.long-rollback-danger {
  background: var(--danger);
  color: #fff;
}
</style>
