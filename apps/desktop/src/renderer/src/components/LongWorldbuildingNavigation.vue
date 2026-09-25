<script setup lang="ts">
import { computed } from "vue";
import { handleHorizontalOverflowWheel } from "../utils/horizontalOverflow";
import AppIcon from "./AppIcon.vue";

export interface LongWorldbuildingNavigationItem {
  id: string;
  title: string;
}

const props = defineProps<{
  mode: "top-tabs" | "right-list";
  items: LongWorldbuildingNavigationItem[];
  activeItemId: string | null;
  pendingItemId: string | null;
  pendingOverview: boolean;
  readOnly: boolean;
  locked?: boolean;
}>();

const emit = defineEmits<{
  selectOverview: [];
  selectItem: [itemId: string];
  addItem: [];
  deleteItem: [itemId: string];
}>();

const activeItem = computed(
  () => props.items.find(({ id }) => id === props.activeItemId) ?? null
);
</script>

<template>
  <nav
    v-if="mode === 'top-tabs'"
    class="section-tabs-bar long-worldbuilding-tabs"
    aria-label="世界观条目"
  >
    <div
      class="section-tabs-scroll"
      role="tablist"
      @wheel="handleHorizontalOverflowWheel"
    >
      <button
        class="section-tab"
        :class="{
          'is-active': activeItemId === null,
          'is-loading': pendingOverview
        }"
        type="button"
        role="tab"
        :aria-selected="activeItemId === null"
        :aria-busy="pendingOverview"
        title="概览"
        @click="emit('selectOverview')"
      >
        概览
      </button>
      <button
        v-for="item in items"
        :key="item.id"
        class="section-tab"
        :class="{
          'is-active': activeItemId === item.id,
          'is-loading': pendingItemId === item.id
        }"
        type="button"
        role="tab"
        :aria-selected="activeItemId === item.id"
        :aria-busy="pendingItemId === item.id"
        :title="item.title"
        @click="emit('selectItem', item.id)"
      >
        {{ item.title }}
      </button>
    </div>
    <button
      v-if="!readOnly"
      class="long-worldbuilding-add"
      type="button"
      aria-label="新建世界观条目"
      title="新建条目"
      @click="emit('addItem')"
    >
      <AppIcon name="plus" :size="15" />
    </button>
    <button
      v-if="!readOnly"
      class="long-worldbuilding-remove"
      type="button"
      aria-label="删除当前世界观条目"
      :title="activeItem ? '删除当前世界观条目' : '请先选择一个世界观条目'"
      :disabled="locked || !activeItem"
      @click="activeItem && emit('deleteItem', activeItem.id)"
    >
      <AppIcon name="minus" :size="15" />
    </button>
  </nav>

  <aside
    v-else
    class="long-story-plot-pane long-entry-list-pane"
    aria-label="世界观条目列表"
  >
    <header>
      <div>
        <strong>世界观条目</strong>
        <span>{{ items.length }}</span>
      </div>
      <div v-if="!readOnly" class="long-entry-list-actions">
        <button
          type="button"
          aria-label="新建世界观条目"
          title="新建条目"
          :disabled="locked"
          @click="emit('addItem')"
        >
          <AppIcon name="plus" :size="14" />
        </button>
        <button
          type="button"
          aria-label="删除当前世界观条目"
          :title="activeItem ? '删除当前世界观条目' : '请先选择一个世界观条目'"
          :disabled="locked || !activeItem"
          @click="activeItem && emit('deleteItem', activeItem.id)"
        >
          <AppIcon name="minus" :size="14" />
        </button>
      </div>
    </header>
    <div class="long-story-plot-list" role="list">
      <article
        class="long-story-plot-card"
        :class="{
          'is-active': activeItemId === null,
          'is-loading': pendingOverview
        }"
        role="listitem"
      >
        <button
          class="long-story-plot-card-main"
          type="button"
          :aria-pressed="activeItemId === null"
          :aria-busy="pendingOverview"
          @click="emit('selectOverview')"
        >
          <span class="long-story-plot-card-order">—</span>
          <span class="long-story-plot-card-title">概览</span>
        </button>
      </article>
      <article
        v-for="(item, index) in items"
        :key="item.id"
        class="long-story-plot-card"
        :class="{
          'is-active': activeItemId === item.id,
          'is-loading': pendingItemId === item.id
        }"
        role="listitem"
      >
        <button
          class="long-story-plot-card-main"
          type="button"
          :aria-pressed="activeItemId === item.id"
          :aria-busy="pendingItemId === item.id"
          :title="item.title"
          @click="emit('selectItem', item.id)"
        >
          <span class="long-story-plot-card-order">{{ index + 1 }}</span>
          <span class="long-story-plot-card-title">{{ item.title }}</span>
        </button>
      </article>
    </div>
  </aside>
</template>

<!--
  These class contracts are also used by the remaining character/plot/ledger
  navigation during staged extraction, so they intentionally stay unscoped.
-->
<style>
.long-worldbuilding-tabs.section-tabs-bar {
  min-height: 42px;
  padding-right: 10px;
  border-color: var(--theme-line-soft);
  background: var(--surface-raised);
}

.long-worldbuilding-tabs .section-tab {
  color: var(--text-tertiary);
}

.long-worldbuilding-tabs .section-tab:hover,
.long-worldbuilding-tabs .section-tab.is-active {
  color: var(--text-primary);
}

.long-worldbuilding-tabs .section-tab.is-loading {
  color: var(--text-secondary);
  cursor: progress;
}

.long-worldbuilding-add,
.long-worldbuilding-remove {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  align-self: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.long-worldbuilding-remove {
  margin-left: 2px;
}

.long-worldbuilding-add:hover,
.long-worldbuilding-remove:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.long-worldbuilding-remove:hover:not(:disabled) {
  color: var(--danger);
}

.long-worldbuilding-add:disabled,
.long-worldbuilding-remove:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.long-entry-list-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
}

.long-entry-list-actions button {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.long-entry-list-actions button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.long-entry-list-actions button:disabled {
  cursor: default;
  opacity: 0.35;
}

.long-entry-list-pane .long-story-plot-card.is-loading {
  opacity: 0.62;
}

.long-entry-list-pane
  .long-story-plot-card.is-loading
  .long-story-plot-card-main {
  cursor: progress;
}
</style>
