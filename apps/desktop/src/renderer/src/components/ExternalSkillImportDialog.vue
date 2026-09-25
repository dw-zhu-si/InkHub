<script setup lang="ts">
import type { ExternalSkillSourceKind } from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";

defineProps<{
  open: boolean;
  libraryTitle: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  choose: [sourceKind: ExternalSkillSourceKind];
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="!pending && emit('close')">
      <section
        class="workspace-dialog external-skill-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-skill-import-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">技能库 · 外部导入</span>
            <h2 id="external-skill-import-title">从其他 skills 加载</h2>
          </div>
          <button
            class="dialog-close"
            type="button"
            aria-label="关闭"
            :disabled="pending"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="dialog-content">
          <p class="dialog-description">
            导入目标为“{{ libraryTitle }}”。请选择一个 skills 总目录进行批量导入，或选择单个 SKILL.md。
          </p>
          <div class="source-options">
            <button
              type="button"
              class="source-option"
              :disabled="pending"
              @click="emit('choose', 'directory')"
            >
              <AppIcon name="folder" :size="22" />
              <span>
                <strong>选择 skills 文件夹</strong>
                <small>读取每个直接子目录根部的 SKILL.md</small>
              </span>
            </button>
            <button
              type="button"
              class="source-option"
              :disabled="pending"
              @click="emit('choose', 'file')"
            >
              <AppIcon name="file" :size="22" />
              <span>
                <strong>选择 SKILL.md</strong>
                <small>导入一个符合墨枢技能规范的文件</small>
              </span>
            </button>
          </div>
          <div class="dialog-actions">
            <button
              class="dialog-secondary-button"
              type="button"
              :disabled="pending"
              @click="emit('close')"
            >
              {{ pending ? "正在导入…" : "取消" }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.external-skill-import-dialog {
  width: min(520px, calc(100vw - 32px));
}

.source-options {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.source-option {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--theme-line);
  border-radius: 12px;
  color: var(--text-primary);
  background: var(--surface-raised);
  text-align: left;
  cursor: pointer;
}

.source-option:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--surface-hover);
}

.source-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.source-option:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.source-option > span {
  display: grid;
  gap: 4px;
}

.source-option strong {
  font-size: 0.95rem;
}

.source-option small {
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.45;
}
</style>
