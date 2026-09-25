<script setup lang="ts">
import type {
  LongLedgerCommitRecord,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import MarkdownContent from "./MarkdownContent.vue";

/**
 * Compatibility-only shell for callers kept across a rolling renderer update.
 * The active editor now opens each chapter continuity Markdown file through
 * its normal read-only file tabs; no projection dashboard lives here anymore.
 */
withDefaults(
  defineProps<{
    bookId: string;
    snapshot: LongWorkspaceIndexSnapshot;
    activeChapterId?: string;
    evidenceContent?: string | null;
    currentRecord?: LongLedgerCommitRecord | null;
  }>(),
  {
    evidenceContent: null,
    currentRecord: null
  }
);
</script>

<template>
  <section class="continuity-text-preview" aria-label="连续性章节文本预览">
    <MarkdownContent
      v-if="evidenceContent?.trim()"
      :content="evidenceContent"
    />
    <p v-else>请从“待处理章节”或“章节记录”中选择一份 Markdown 文件。</p>
  </section>
</template>

<style scoped>
.continuity-text-preview {
  height: 100%;
  min-height: 0;
  padding: clamp(18px, 3vw, 32px);
  overflow: auto;
  background: var(--surface-main);
  color: var(--text-primary);
}

.continuity-text-preview p {
  margin: 0;
  color: var(--text-tertiary);
}
</style>
