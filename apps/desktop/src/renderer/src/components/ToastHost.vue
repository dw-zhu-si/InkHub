<script setup lang="ts">
import { dismissUiMessage, uiMessageItems } from "../ui-feedback";

const kindLabel = {
  success: "成功",
  error: "错误",
  warning: "提醒",
  info: "提示"
} as const;
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast-list">
        <button
          v-for="item in uiMessageItems"
          :key="item.id"
          type="button"
          class="toast-message"
          :class="`is-${item.kind}`"
          :aria-label="`${kindLabel[item.kind]}：${item.content}`"
          @click="dismissUiMessage(item.id)"
        >
          <span class="toast-message__mark" aria-hidden="true" />
          <span>{{ item.content }}</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 10000;
  top: 18px;
  left: 50%;
  display: grid;
  width: min(520px, calc(100vw - 32px));
  gap: 9px;
  pointer-events: none;
  transform: translateX(-50%);
}

.toast-message {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 42px;
  padding: 10px 14px;
  border: 1px solid var(--theme-line);
  border-radius: 10px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  box-shadow: 0 12px 34px color-mix(in srgb, #000 18%, transparent);
  font: inherit;
  line-height: 1.45;
  text-align: left;
  pointer-events: auto;
  backdrop-filter: blur(14px);
  cursor: pointer;
}

.toast-message__mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.toast-message.is-success .toast-message__mark {
  background: #32a56b;
}

.toast-message.is-warning .toast-message__mark {
  background: #d59024;
}

.toast-message.is-error .toast-message__mark {
  background: #d84b55;
}

.toast-list-enter-active,
.toast-list-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.toast-list-enter-from,
.toast-list-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .toast-list-enter-active,
  .toast-list-leave-active {
    transition: none;
  }
}
</style>
