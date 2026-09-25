<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { InkHubRepairReviewDecision, InkHubRepairReviewDraft } from "../utils/inkhubRepairReview";
import { isWritableNovelRepairPath } from "../utils/inkhubRepairReview";
import { createBoundedRepairReviewPage, repairReviewPageAfterKey } from "../utils/inkhubDeepQualityReview";

const props = withDefaults(defineProps<{
  drafts: readonly InkHubRepairReviewDraft[];
  modelLabel: string;
  issueCount: number;
  loading?: boolean;
  pageSize?: number;
}>(), { loading: false, pageSize: 8 });

const emit = defineEmits<{
  update: [proposalId: string, content: string];
  decision: [proposalId: string, decision: Exclude<InkHubRepairReviewDecision, "pending">];
  acceptAll: [];
  keepAll: [];
  confirmWrite: [];
}>();

const currentPage = ref(1);
const page = computed(() => createBoundedRepairReviewPage(props.drafts, currentPage.value, props.pageSize));
const acceptedCount = computed(() => props.drafts.filter(({ decision }) => decision === "accepted").length);
watch(() => [props.drafts.length, props.pageSize], () => { currentPage.value = page.value.page; });

function changePage(nextPage: number): void {
  currentPage.value = createBoundedRepairReviewPage(props.drafts, nextPage, props.pageSize).page;
}

function handlePagerKeydown(event: KeyboardEvent): void {
  const next = repairReviewPageAfterKey(page.value.page, page.value.totalPages, event.key);
  if (next === page.value.page) return;
  event.preventDefault();
  changePage(next);
}

function updateContent(proposalId: string, event: Event): void {
  emit("update", proposalId, (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <section class="repair-review" aria-labelledby="repair-review-title">
    <header class="repair-review__header">
      <div><span>AI 修复审阅</span><h2 id="repair-review-title">{{ drafts.length }} 章待审 · {{ modelLabel }}</h2></div>
      <small>已分析 {{ issueCount }} 项问题；仅当前页挂载编辑器</small>
    </header>

    <div class="repair-review__batch">
      <p role="status" aria-live="polite">已选择 {{ acceptedCount }} / {{ drafts.length }} 章</p>
      <div>
        <button type="button" :disabled="loading || !drafts.length" @click="emit('acceptAll')">全部接受</button>
        <button type="button" :disabled="loading || !drafts.length" @click="emit('keepAll')">全部保留</button>
        <button class="primary" type="button" :disabled="loading || !acceptedCount" @click="emit('confirmWrite')">确认写回 {{ acceptedCount }} 章</button>
      </div>
    </div>

    <p v-if="!drafts.length" class="repair-review__empty" role="status">当前没有待审修复稿。</p>
    <div v-else id="repair-review-items" class="repair-review__items">
      <article v-for="draft in page.items" :key="draft.proposal.id" :class="['repair-card', `is-${draft.decision}`]">
        <header>
          <div><span>{{ draft.proposal.volumeTitle || '未分卷' }}</span><h3>{{ draft.proposal.chapterTitle }}</h3><small>{{ draft.proposal.relativePath }}</small></div>
          <div class="repair-card__choices">
            <button type="button" :disabled="loading || !isWritableNovelRepairPath(draft.proposal.relativePath)" :aria-pressed="draft.decision === 'accepted'" @click="emit('decision', draft.proposal.id, 'accepted')">接受修复</button>
            <button type="button" :disabled="loading" :aria-pressed="draft.decision === 'kept'" @click="emit('decision', draft.proposal.id, 'kept')">保留原稿</button>
          </div>
        </header>
        <p>{{ draft.proposal.rationale }}</p>
        <div class="repair-card__route" aria-label="参与修复的智能体与技能">
          <span>Agents</span><i v-for="agent in draft.proposal.agents" :key="agent.id">{{ agent.name }}</i>
          <span>Skills</span><i v-for="skill in draft.proposal.skills" :key="skill.id">{{ skill.name }}</i>
        </div>
        <div class="repair-card__comparison">
          <details><summary>查看原稿</summary><div>{{ draft.proposal.originalContent }}</div></details>
          <label><span>{{ draft.proposal.chapterTitle }} AI 完整修复稿</span><textarea :value="draft.content" maxlength="2000000" spellcheck="true" :disabled="loading" :aria-label="`${draft.proposal.chapterTitle} AI 完整修复稿`" @input="updateContent(draft.proposal.id, $event)"></textarea></label>
        </div>
      </article>
    </div>

    <nav v-if="drafts.length" class="repair-review__pager" aria-label="修复审阅分页" aria-controls="repair-review-items" aria-keyshortcuts="ArrowLeft ArrowRight Home End" tabindex="0" @keydown="handlePagerKeydown">
      <button type="button" :disabled="page.page <= 1" @click="changePage(page.page - 1)">上一页</button>
      <span role="status" aria-live="polite">第 {{ page.page }} / {{ page.totalPages }} 页 · 第 {{ page.startIndex + 1 }}–{{ page.endIndex }} 章</span>
      <button type="button" :disabled="page.page >= page.totalPages" @click="changePage(page.page + 1)">下一页</button>
    </nav>
  </section>
</template>

<style scoped>
.repair-review { display: grid; gap: 14px; padding: 18px; border: 1px solid var(--accent); border-radius: 15px; background: var(--surface-raised); }
.repair-review__header,.repair-review__batch,.repair-card > header,.repair-review__pager { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.repair-review__header > div,.repair-card > header > div:first-child { display: grid; gap: 3px; }.repair-review h2,.repair-review h3,.repair-review p { margin: 0; }.repair-review h2 { font-size: 1rem; }.repair-review h3 { font-size: .95rem; }
.repair-review__header span,.repair-card > header span { color: var(--accent-text, var(--accent)); font-size: .7rem; }.repair-review small { color: var(--text-tertiary); }
.repair-review__batch { position: sticky; top: 0; z-index: 3; padding: 11px 12px; border: 1px solid var(--theme-line); border-radius: 11px; background: color-mix(in srgb, var(--surface-raised) 94%, transparent); }.repair-review__batch > div,.repair-card__choices { display: flex; flex-wrap: wrap; gap: 6px; }
.repair-review button { min-height: 34px; padding: 0 11px; border: 1px solid var(--theme-line); border-radius: 9px; color: var(--text-secondary); background: var(--surface-main); }.repair-review button.primary,.repair-card__choices button[aria-pressed="true"] { color: var(--accent-contrast, white); border-color: var(--accent); background: var(--accent); }.repair-review button:focus-visible,.repair-review__pager:focus-visible,.repair-review textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.repair-review__items { display: grid; }.repair-card { display: grid; gap: 12px; padding: 16px 0; border-top: 1px solid var(--theme-line-soft); }.repair-card.is-kept { opacity: .72; }.repair-card.is-accepted { padding-left: 12px; border-left: 3px solid var(--accent); }.repair-card > p { color: var(--text-secondary); line-height: 1.65; }
.repair-card__route { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }.repair-card__route span { color: var(--text-tertiary); font-size: .67rem; font-weight: 700; text-transform: uppercase; }.repair-card__route i { padding: 3px 7px; border: 1px solid var(--theme-line-soft); border-radius: 999px; color: var(--text-secondary); background: var(--surface-main); font-size: .68rem; font-style: normal; }
.repair-card__comparison { display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 10px; }.repair-card__comparison details,.repair-card__comparison label { min-width: 0; padding: 10px; border: 1px solid var(--theme-line-soft); border-radius: 10px; background: var(--surface-main); }.repair-card__comparison details div { max-height: 320px; margin-top: 10px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }.repair-card__comparison label { display: grid; gap: 7px; }.repair-card__comparison textarea { width: 100%; min-height: 300px; resize: vertical; padding: 10px; border: 1px solid var(--theme-line); border-radius: 8px; color: var(--text-primary); background: var(--surface-raised); font: .84rem/1.75 var(--editor-font,"Songti SC",serif); }
.repair-review__pager { justify-content: center; border-top: 1px solid var(--theme-line-soft); padding-top: 12px; }.repair-review__empty { padding: 36px 12px; color: var(--text-tertiary); text-align: center; }
@media (max-width: 760px) { .repair-review__header,.repair-review__batch,.repair-card > header { align-items: stretch; flex-direction: column; }.repair-card__comparison { grid-template-columns: 1fr; }.repair-review__batch > div,.repair-card__choices { justify-content: flex-start; } }
</style>
