<script setup lang="ts">
import type { LongWorkspaceSelection } from "../types/longWorkspace";
import AppIcon from "./AppIcon.vue";

type StoryPlot = NonNullable<LongWorkspaceSelection["storyPlots"]>[number];
type StoryPlotMenuAction = "up" | "down" | "delete";

defineProps<{
  plots: StoryPlot[];
  activeStoryPlotId: string | null;
  pendingStoryPlotId: string | null;
  actionMenuId: string | null;
  readOnly: boolean;
  locked?: boolean;
}>();

const emit = defineEmits<{
  select: [storyPlotId: string];
  toggleActionMenu: [storyPlotId: string];
  closeActionMenu: [];
  menuAction: [storyPlotId: string, action: StoryPlotMenuAction];
}>();
</script>

<template>
  <aside class="long-story-plot-pane" aria-label="故事情节列表">
    <header>
      <div>
        <strong>当前剧情点涉及</strong>
        <span>{{ plots.length }}</span>
      </div>
    </header>
    <div v-if="plots.length" class="long-story-plot-list" role="list">
      <article
        v-for="(plot, index) in plots"
        :key="plot.id"
        class="long-story-plot-card"
        :class="{
          'is-active': plot.id === activeStoryPlotId,
          'is-loading': pendingStoryPlotId === plot.id,
          'is-menu-open': actionMenuId === plot.id
        }"
        role="listitem"
      >
        <button
          class="long-story-plot-card-main"
          type="button"
          :aria-pressed="plot.id === activeStoryPlotId"
          @click="emit('select', plot.id)"
        >
          <span class="long-story-plot-card-order">{{ index + 1 }}</span>
          <span class="long-story-plot-card-title">{{ plot.title }}</span>
        </button>
        <div
          v-if="!readOnly"
          class="long-story-plot-card-actions"
          :class="{ 'is-menu-open': actionMenuId === plot.id }"
        >
          <button
            class="long-story-plot-more-button"
            :class="{ 'is-active': actionMenuId === plot.id }"
            type="button"
            :aria-label="`${plot.title}更多操作`"
            :aria-expanded="actionMenuId === plot.id"
            aria-haspopup="menu"
            :disabled="locked"
            @click.stop="emit('toggleActionMenu', plot.id)"
          >
            <AppIcon name="more" :size="16" />
          </button>
          <div
            v-if="actionMenuId === plot.id"
            class="long-story-plot-action-menu"
            role="menu"
            @keydown.esc.stop="emit('closeActionMenu')"
          >
            <button
              class="long-story-plot-action-menu-item"
              type="button"
              role="menuitem"
              :disabled="index === 0"
              @click.stop="emit('menuAction', plot.id, 'up')"
            >
              <AppIcon name="arrow-up" :size="14" />
              <span>上移</span>
            </button>
            <button
              class="long-story-plot-action-menu-item"
              type="button"
              role="menuitem"
              :disabled="index === plots.length - 1"
              @click.stop="emit('menuAction', plot.id, 'down')"
            >
              <AppIcon
                class="long-story-plot-arrow-down"
                name="arrow-up"
                :size="14"
              />
              <span>下移</span>
            </button>
            <button
              class="long-story-plot-action-menu-item is-danger"
              type="button"
              role="menuitem"
              @click.stop="emit('menuAction', plot.id, 'delete')"
            >
              <AppIcon name="trash" :size="14" />
              <span>删除</span>
            </button>
          </div>
        </div>
      </article>
    </div>
    <div v-else class="long-story-plot-pane-empty">
      <AppIcon name="sparkles" :size="22" />
      <strong>当前范围还没有故事情节</strong>
      <span>新增情节后会出现在这里，左侧可直接编写正文。</span>
    </div>
  </aside>
</template>

<!--
  These class names are shared by the staged worldbuilding, character, plot,
  chapter and continuity list extraction. Keeping the primitives unscoped
  preserves those existing panes while their templates move independently.
-->
<style>
.long-story-plot-pane {
  order: 2;
  grid-row: 1;
  grid-column: 3;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--theme-line-soft);
  background: var(--surface-raised);
}

.long-story-plot-pane > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 8px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--theme-line-soft);
}

.long-story-plot-pane > header > div {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.long-story-plot-pane > header strong {
  font-size: 0.75rem;
}

.long-story-plot-pane > header span {
  color: var(--text-tertiary);
  font-size: 0.642857rem;
}

.long-story-plot-list {
  min-height: 0;
  padding: 7px;
  overflow-y: auto;
}

.long-story-plot-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 9px;
}

.long-story-plot-card + .long-story-plot-card {
  margin-top: 4px;
}

.long-story-plot-card:hover,
.long-story-plot-card.is-active {
  border-color: var(--theme-line-soft);
  background: var(--surface-hover);
}

.long-story-plot-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--theme-line));
  background: var(--surface-selected);
}

.long-story-plot-card-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  padding: 9px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.long-story-plot-card-main:disabled {
  cursor: default;
  opacity: 0.55;
}

.long-story-plot-card-order {
  flex: 0 0 auto;
  min-width: 0.9rem;
  color: var(--text-tertiary);
  font-size: 0.535714rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-align: right;
}

.long-story-plot-card-title {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.long-story-plot-card-actions {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  padding-right: 5px;
}

.long-story-plot-card.is-menu-open,
.long-story-plot-card-actions.is-menu-open {
  z-index: 8;
}

.long-story-plot-more-button {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.long-story-plot-more-button:hover:not(:disabled),
.long-story-plot-more-button.is-active {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.long-story-plot-more-button:disabled {
  opacity: 0.35;
  cursor: default;
}

.long-story-plot-action-menu {
  position: absolute;
  z-index: 50;
  top: calc(100% + 3px);
  right: 0;
  display: grid;
  width: max-content;
  min-width: 112px;
  gap: 2px;
  padding: 5px;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  background: var(--surface-raised);
  box-shadow:
    0 10px 28px color-mix(in srgb, var(--theme-foreground) 13%, transparent),
    0 2px 6px color-mix(in srgb, var(--theme-foreground) 8%, transparent);
}

.long-story-plot-action-menu.opens-upward {
  top: auto;
  bottom: calc(100% + 3px);
}

.long-story-plot-action-menu-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 30px;
  padding: 5px 8px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.75rem;
  font-weight: 540;
  text-align: left;
  cursor: pointer;
}

.long-story-plot-action-menu-item:hover:not(:disabled),
.long-story-plot-action-menu-item:focus-visible:not(:disabled) {
  outline: none;
  background: var(--surface-hover);
}

.long-story-plot-action-menu-item > svg {
  color: var(--text-secondary);
}

.long-story-plot-action-menu-item:disabled {
  opacity: 0.38;
  cursor: default;
}

.long-story-plot-action-menu-item.is-danger {
  color: var(--danger);
}

.long-story-plot-action-menu-item.is-danger > svg {
  color: var(--danger);
}

.long-story-plot-action-menu-item.is-danger:hover:not(:disabled),
.long-story-plot-action-menu-item.is-danger:focus-visible:not(:disabled) {
  background: var(--danger-soft);
  color: var(--danger-text);
}

.long-story-plot-arrow-down {
  transform: rotate(180deg);
}

.long-story-plot-pane-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  min-height: 0;
  gap: 6px;
  padding: 24px;
  color: var(--text-tertiary);
  text-align: center;
}

.long-story-plot-pane-empty strong {
  color: var(--text-primary);
  font-size: 0.785714rem;
}

.long-story-plot-pane-empty span {
  max-width: 18rem;
  font-size: 0.678571rem;
  line-height: 1.5;
}
</style>
