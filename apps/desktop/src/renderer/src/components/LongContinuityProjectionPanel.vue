<script setup lang="ts">
import { computed } from "vue";
import type {
  LongContinuityDomain,
  LongContinuityFact,
  LongWorkspaceIndexSnapshot
} from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(
  defineProps<{
    snapshot: LongWorkspaceIndexSnapshot;
    domain?: LongContinuityDomain;
    subjectId?: string;
    /** 嵌在已有视图标题下时隐藏面板级标题，避免双标题叠层。 */
    hideHeading?: boolean;
  }>(),
  {
    hideHeading: false
  }
);

const emit = defineEmits<{
  selectCommit: [commitId: string];
}>();

const domainMeta = {
  character: { label: "人物", icon: "user" },
  relationship: { label: "人物关系", icon: "user" },
  world: { label: "世界观", icon: "globe" },
  plot: { label: "剧情", icon: "history" },
  foreshadowing: { label: "伏笔", icon: "pin" }
} as const;

const projection = computed(() => props.snapshot.ledger.projection);

const facts = computed(() =>
  [...projection.value.facts]
    .filter(
      (fact) =>
        !props.domain ||
        fact.domain === props.domain ||
        (props.domain === "character" &&
          fact.domain === "relationship") ||
        (props.domain === "plot" &&
          fact.domain === "foreshadowing")
    )
    .filter((fact) => !props.subjectId || fact.subjectId === props.subjectId)
    .sort(
      (left, right) =>
        left.domain.localeCompare(right.domain) ||
        subjectLabel(left).localeCompare(subjectLabel(right), "zh-CN") ||
        left.field.localeCompare(right.field, "zh-CN")
    )
);

const groupedFacts = computed(() => {
  const groups = new Map<
    string,
    {
      key: string;
      domain: LongContinuityDomain;
      subjectId: string;
      subjectLabel: string;
      facts: LongContinuityFact[];
    }
  >();
  for (const fact of facts.value) {
    const key = `${fact.domain}:${fact.subjectId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.facts.push(fact);
      continue;
    }
    groups.set(key, {
      key,
      domain: fact.domain,
      subjectId: fact.subjectId,
      subjectLabel: subjectLabel(fact),
      facts: [fact]
    });
  }
  return [...groups.values()];
});

function subjectLabel(
  fact: Pick<LongContinuityFact, "domain" | "subjectId">
): string {
  const id = fact.subjectId;
  if (fact.domain === "character" || fact.domain === "relationship") {
    const character = props.snapshot.characters.find(
      (candidate) => candidate.id === id
    );
    if (character) {
      return fact.domain === "relationship"
        ? `${character.name} · 人物关系`
        : character.name;
    }
  }
  if (fact.domain === "world") {
    const category = props.snapshot.worldbuilding.find(
      (candidate) => candidate.id === id
    );
    if (category) return category.title;
  }
  if (fact.domain === "plot") {
    const chapter = props.snapshot.plot.chapterCards.find(
      (candidate) => candidate.id === id
    );
    if (chapter) return chapter.title;
    const event = props.snapshot.plot.storyEvents.find(
      (candidate) => candidate.id === id
    );
    if (event) return event.title;
    const arc = props.snapshot.plot.arcs.find(
      (candidate) => candidate.id === id
    );
    if (arc) return arc.title;
    const volume = props.snapshot.plot.volumes.find(
      (candidate) => candidate.id === id
    );
    if (volume) return volume.title;
    const placement = props.snapshot.plot.narrativePlacements.find(
      (candidate) => candidate.id === id
    );
    if (placement) {
      const placementEvent = props.snapshot.plot.storyEvents.find(
        (candidate) => candidate.id === placement.eventId
      );
      return placementEvent?.title ?? id;
    }
  }
  if (fact.domain === "foreshadowing") {
    const thread = props.snapshot.plot.foreshadowing.find(
      (candidate) => candidate.id === id
    );
    if (thread) return thread.title;
    for (const candidate of props.snapshot.plot.foreshadowing) {
      const beat = candidate.beats.find((item) => item.id === id);
      if (beat) return `${candidate.title} · 触点 ${beat.order}`;
    }
  }
  return id;
}

function chapterLabel(chapterCardId: string | null): string {
  if (!chapterCardId) return "未关联章节";
  return (
    props.snapshot.plot.chapterCards.find(({ id }) => id === chapterCardId)
      ?.title ?? chapterCardId
  );
}

function commitLabel(commitId: string | null): string {
  if (!commitId) return "尚未入账";
  const commit = props.snapshot.ledger.commits.find(({ id }) => id === commitId);
  return commit ? `提交 #${commit.sequence}` : commitId;
}

async function copyEvidence(fact: LongContinuityFact): Promise<void> {
  const evidence = fact.evidence.trim();
  if (!evidence) {
    uiMessage.info("该事实没有可复制的来源证据。");
    return;
  }
  try {
    await navigator.clipboard.writeText(evidence);
    uiMessage.success("来源证据已复制。");
  } catch {
    uiMessage.error("复制失败，请稍后重试。");
  }
}
</script>

<template>
  <section
    class="continuity-projection"
    aria-label="连续性账本来源映射"
  >
    <article class="projection-card">
      <header v-if="!hideHeading" class="projection-heading">
        <div>
          <span class="projection-kicker">来源映射</span>
          <strong>连续性来源</strong>
        </div>
        <span>{{ facts.length }} 项</span>
      </header>

      <div v-if="groupedFacts.length" class="projection-groups">
        <article
          v-for="group in groupedFacts"
          :key="group.key"
          class="projection-group"
        >
          <header>
            <span class="projection-domain-icon">
              <AppIcon :name="domainMeta[group.domain].icon" :size="15" />
            </span>
            <div>
              <small>{{ domainMeta[group.domain].label }}</small>
              <strong>{{ group.subjectLabel }}</strong>
            </div>
            <span>{{ group.facts.length }}</span>
          </header>

          <dl>
            <div
              v-for="fact in group.facts"
              :key="fact.factId"
              class="projection-fact"
            >
              <dt>{{ fact.field }}</dt>
              <dd>
                <p>{{ fact.value }}</p>
                <div class="projection-source">
                  <span>
                    {{ chapterLabel(fact.sourceChapterCardId) }}
                    ·
                    {{ commitLabel(fact.sourceCommitId) }}
                  </span>
                  <button
                    type="button"
                    @click="emit('selectCommit', fact.sourceCommitId)"
                  >
                    查看入账记录
                  </button>
                </div>
                <details class="projection-evidence">
                  <summary>来源证据</summary>
                  <p>{{ fact.evidence }}</p>
                  <button type="button" @click="copyEvidence(fact)">
                    <AppIcon name="copy" :size="13" />
                    复制证据
                  </button>
                </details>
              </dd>
            </div>
          </dl>
        </article>
      </div>

      <div v-else class="projection-empty" role="status">
        <span class="projection-empty-icon">
          <AppIcon name="ledger" :size="18" />
        </span>
        <strong>还没有已入账的当前事实</strong>
        <p>
          {{
            subjectId || domain
              ? "当前对象尚无连续性来源映射。完成相关章节核验后会显示在这里。"
              : "完成第一章连续性核验后，人物、世界观与剧情的当前事实会显示在这里。"
          }}
        </p>
      </div>
    </article>
  </section>
</template>

<style scoped>
.continuity-projection {
  container: continuity-projection / inline-size;
  display: grid;
  min-width: 0;
  color: var(--text-primary);
}

.projection-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
}

.projection-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 12px;
  padding: 11px 13px;
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.projection-heading > div,
.projection-group > header > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.projection-kicker,
.projection-group small {
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  letter-spacing: 0.04em;
}

.projection-heading strong {
  font-size: 0.785714rem;
}

.projection-heading > span {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

.projection-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  min-width: 0;
  gap: 10px;
  padding: 12px;
  background: var(--surface-main);
}

.projection-group {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--theme-line-soft);
  border-radius: 10px;
  background: var(--surface-raised);
}

.projection-group > header {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.projection-group > header > span:last-child {
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

.projection-domain-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}

.projection-group dl {
  display: grid;
  margin: 0;
}

.projection-fact {
  display: grid;
  grid-template-columns: minmax(78px, 0.32fr) minmax(0, 1fr);
  gap: 10px;
  padding: 11px 12px;
}

.projection-fact + .projection-fact {
  border-top: 1px solid var(--theme-line-soft);
}

.projection-fact dt {
  color: var(--text-secondary);
  font-size: 0.714286rem;
  line-height: 1.55;
}

.projection-fact dd {
  display: grid;
  min-width: 0;
  gap: 7px;
  margin: 0;
}

.projection-fact dd > p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
  line-height: 1.65;
  white-space: pre-wrap;
}

.projection-source {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 8px;
}

.projection-source span {
  min-width: 0;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 0.642857rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.projection-source button,
.projection-evidence button {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.642857rem;
  cursor: pointer;
}

.projection-source button:hover,
.projection-evidence button:hover {
  color: var(--text-primary);
}

.projection-source button:focus-visible,
.projection-evidence button:focus-visible {
  outline: 2px solid var(--theme-line);
  outline-offset: 2px;
}

.projection-evidence {
  padding: 7px 9px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-main);
}

.projection-evidence summary {
  color: var(--text-secondary);
  font-size: 0.678571rem;
  cursor: pointer;
}

.projection-evidence p {
  margin: 8px 0;
  color: var(--text-secondary);
  font-size: 0.714286rem;
  line-height: 1.6;
  white-space: pre-wrap;
}

.projection-evidence button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
}

.projection-empty {
  display: grid;
  place-items: center;
  min-height: 168px;
  gap: 8px;
  padding: 28px 24px;
  background: var(--surface-main);
  text-align: center;
}

.projection-empty-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}

.projection-empty strong {
  color: var(--text-primary);
  font-size: 0.785714rem;
}

.projection-empty p {
  max-width: 440px;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.714286rem;
  line-height: 1.6;
}

@container continuity-projection (max-width: 32rem) {
  .projection-fact {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .projection-heading,
  .projection-source {
    align-items: flex-start;
    flex-direction: column;
  }

  .projection-source span {
    white-space: normal;
  }
}

@container continuity-projection (max-width: 22rem) {
  .projection-groups {
    grid-template-columns: 1fr;
  }

  .projection-heading > span {
    display: none;
  }
}
</style>
