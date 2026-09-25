<script setup lang="ts">
import type { LongImportWriteClawResult } from "@deepwrite/contracts";
import { computed, onBeforeUnmount, onMounted } from "vue";
import AppIcon from "./AppIcon.vue";

type LongMigrationSourceKind = LongImportWriteClawResult["sourceKind"];

const props = defineProps<{
  open: boolean;
  title: string;
  sourceKind: LongMigrationSourceKind;
  legacySchemaVersion: number;
  committedChapterPolicy:
    LongImportWriteClawResult["committedChapterPolicy"];
  warnings: string[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const sourceLabels: Record<LongMigrationSourceKind, string> = {
  "write-claw-zip": "旧版本长篇压缩包",
  "long-workspace-json": "long_workspace.json",
  "book-json": "book.json"
};

const sourceLabel = computed(() => sourceLabels[props.sourceKind]);
const legacyVersionLabel = computed(() =>
  props.legacySchemaVersion > 0
    ? `v${props.legacySchemaVersion}`
    : "未知版本"
);

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") {
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
      class="dialog-backdrop long-migration-backdrop"
      @mousedown.self="emit('close')"
    >
      <section
        class="long-migration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="long-migration-dialog-title"
        aria-describedby="long-migration-summary"
      >
        <header>
          <span class="long-migration-icon">
            <AppIcon name="check" :size="20" />
          </span>
          <div>
            <span>旧版本长篇导入</span>
            <h2 id="long-migration-dialog-title">导入完成</h2>
          </div>
        </header>

        <main class="long-migration-content">
          <p id="long-migration-summary" class="long-migration-summary">
            “<strong :title="title">{{ title }}</strong
            >”已创建为独立的墨枢长篇项目，可以继续编辑。
          </p>

          <dl class="long-migration-meta">
            <div>
              <dt>导入来源</dt>
              <dd>{{ sourceLabel }}</dd>
            </div>
            <div>
              <dt>旧数据版本</dt>
              <dd>{{ legacyVersionLabel }}</dd>
            </div>
          </dl>

          <section class="long-migration-policy">
            <h3>
              {{
                committedChapterPolicy === "legacy-checkpoints"
                  ? "已提交章已恢复为迁移检查点"
                  : "未发现可恢复的旧版提交链"
              }}
            </h3>
            <p v-if="committedChapterPolicy === 'legacy-checkpoints'">
              旧版已提交前缀及其判定已恢复为只读、不可逆的连续性检查点；缺少精确
              before/after 的旧记录不会伪造成可回滚提交。
            </p>
            <p v-else>
              当前来源没有完整的旧版提交链；正文与全部迁移证据已保留，可在核验后按当前账本规则提交。
            </p>
          </section>

          <section class="long-migration-source-note">
            <h3>源文件保持不变</h3>
            <p>
              导入只会新建墨枢长篇项目，不会修改、覆盖或删除所选的旧版本源文件。
            </p>
          </section>

          <section
            v-if="warnings.length > 0"
            class="long-migration-warnings"
            aria-labelledby="long-migration-warnings-title"
          >
            <h3 id="long-migration-warnings-title">
              需要留意的迁移提示（{{ warnings.length }}）
            </h3>
            <ol>
              <li v-for="(warning, index) in warnings" :key="index">
                <span>{{ index + 1 }}</span>
                <p>{{ warning }}</p>
              </li>
            </ol>
          </section>

          <section v-else class="long-migration-complete">
            <AppIcon name="check" :size="16" />
            <p>全部可迁移内容已完成处理，没有需要额外留意的迁移提示。</p>
          </section>
        </main>

        <footer>
          <button
            class="long-migration-close"
            type="button"
            autofocus
            @click="emit('close')"
          >
            关闭
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.long-migration-backdrop {
  z-index: 1800;
  padding: clamp(14px, 3vw, 24px);
}

.long-migration-dialog {
  display: flex;
  flex-direction: column;
  width: min(590px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  overflow: hidden;
  border: 1px solid var(--theme-line);
  border-radius: 16px;
  background: var(--surface-raised);
  box-shadow: 0 24px 68px rgb(0 0 0 / 32%);
  color: var(--text-primary);
}

.long-migration-dialog > header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 11px;
  padding: clamp(16px, 3vw, 21px) clamp(16px, 3vw, 21px) 0;
}

.long-migration-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--success-soft);
  color: var(--success);
}

.long-migration-dialog > header > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.long-migration-dialog > header span {
  color: var(--text-tertiary);
  font-size: 0.678571rem;
}

.long-migration-dialog h2 {
  font-size: 1.142857rem;
  font-weight: 650;
}

.long-migration-content {
  display: grid;
  min-height: 0;
  gap: 11px;
  padding: 16px clamp(16px, 3vw, 21px) 3px;
  overflow: auto;
}

.long-migration-summary {
  color: var(--text-secondary);
  font-size: 0.821429rem;
  line-height: 1.65;
}

.long-migration-summary strong {
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.long-migration-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.long-migration-meta > div {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 9px;
  background: var(--surface-muted);
}

.long-migration-meta dt {
  color: var(--text-tertiary);
  font-size: 0.678571rem;
}

.long-migration-meta dd {
  margin-top: 3px;
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 0.785714rem;
  font-weight: 620;
}

.long-migration-policy,
.long-migration-source-note,
.long-migration-warnings,
.long-migration-complete {
  padding: 10px 11px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  background: var(--surface-muted);
}

.long-migration-policy h3,
.long-migration-source-note h3,
.long-migration-warnings h3 {
  color: var(--text-primary);
  font-size: 0.75rem;
  font-weight: 650;
}

.long-migration-policy p,
.long-migration-source-note p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.714286rem;
  line-height: 1.6;
}

.long-migration-policy {
  border-color: color-mix(
    in srgb,
    var(--accent) 22%,
    var(--theme-line-soft)
  );
  background: color-mix(
    in srgb,
    var(--accent-soft) 62%,
    var(--surface-raised)
  );
}

.long-migration-source-note {
  border-color: color-mix(
    in srgb,
    var(--success) 22%,
    var(--theme-line-soft)
  );
  background: color-mix(
    in srgb,
    var(--success-soft) 72%,
    var(--surface-raised)
  );
}

.long-migration-warnings {
  border-color: color-mix(
    in srgb,
    var(--warning) 26%,
    var(--theme-line-soft)
  );
  background: color-mix(
    in srgb,
    var(--warning-soft) 70%,
    var(--surface-raised)
  );
}

.long-migration-warnings ol {
  display: grid;
  gap: 7px;
  margin-top: 8px;
}

.long-migration-warnings li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
}

.long-migration-warnings li > span {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--surface-raised);
  color: var(--warning);
  font-size: 0.642857rem;
  font-weight: 700;
}

.long-migration-warnings li > p {
  min-width: 0;
  padding-top: 1px;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font-size: 0.714286rem;
  line-height: 1.55;
}

.long-migration-complete {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  border-color: color-mix(
    in srgb,
    var(--success) 24%,
    var(--theme-line-soft)
  );
  background: var(--success-soft);
  color: var(--success);
}

.long-migration-complete p {
  color: color-mix(
    in srgb,
    var(--success) 76%,
    var(--text-primary)
  );
  font-size: 0.714286rem;
  line-height: 1.55;
}

.long-migration-dialog footer {
  display: flex;
  flex: 0 0 auto;
  justify-content: flex-end;
  padding: 13px clamp(16px, 3vw, 21px) clamp(16px, 3vw, 21px);
}

.long-migration-close {
  min-height: 34px;
  padding: 6px 18px;
  border: 1px solid var(--neutral-solid);
  border-radius: 8px;
  background: var(--neutral-solid);
  color: var(--accent-contrast, #fff);
  font-size: 0.75rem;
  cursor: pointer;
}

.long-migration-close:hover {
  border-color: color-mix(
    in srgb,
    var(--neutral-solid) 88%,
    var(--theme-foreground)
  );
  background: color-mix(
    in srgb,
    var(--neutral-solid) 88%,
    var(--theme-foreground)
  );
}

.long-migration-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 460px) {
  .long-migration-meta {
    grid-template-columns: 1fr;
  }
}

@media (max-height: 560px) {
  .long-migration-dialog > header {
    padding-top: 14px;
  }

  .long-migration-content {
    gap: 8px;
    padding-top: 12px;
  }

  .long-migration-policy,
  .long-migration-source-note,
  .long-migration-warnings,
  .long-migration-complete {
    padding-block: 8px;
  }

  .long-migration-dialog footer {
    padding-block: 10px 14px;
  }
}
</style>
