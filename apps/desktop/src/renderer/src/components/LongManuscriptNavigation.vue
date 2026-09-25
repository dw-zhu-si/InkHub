<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { LongChapterCardId } from "@deepwrite/contracts";
import { handleHorizontalOverflowWheel } from "../utils/horizontalOverflow";
import AppIcon from "./AppIcon.vue";

export interface LongManuscriptNavigationItem {
  id: LongChapterCardId;
  label: string;
}

const props = defineProps<{
  mode: "top-tabs" | "right-list";
  label: string;
  items: LongManuscriptNavigationItem[];
  activeChapterId: LongChapterCardId | null;
  locked?: boolean;
  committed?: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterCardId: LongChapterCardId];
  createChapter: [];
  deleteChapter: [chapterCardId: LongChapterCardId];
  reorderChapter: [
    chapterCardId: LongChapterCardId,
    direction: "up" | "down"
  ];
}>();

const actionMenuId = ref<LongChapterCardId | null>(null);
const activeChapter = computed(
  () => props.items.find(({ id }) => id === props.activeChapterId) ?? null
);

function toggleActionMenu(chapterCardId: LongChapterCardId): void {
  actionMenuId.value =
    actionMenuId.value === chapterCardId ? null : chapterCardId;
}

function runMenuAction(
  chapterCardId: LongChapterCardId,
  action: "up" | "down" | "delete"
): void {
  actionMenuId.value = null;
  if (action === "delete") {
    emit("deleteChapter", chapterCardId);
  } else {
    emit("reorderChapter", chapterCardId, action);
  }
}

function handleWindowPointerDown(event: PointerEvent): void {
  if (!actionMenuId.value) return;
  const target = event.target;
  if (
    !(target instanceof Element) ||
    !target.closest(".long-manuscript-card-actions")
  ) {
    actionMenuId.value = null;
  }
}

onMounted(() => {
  window.addEventListener("pointerdown", handleWindowPointerDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleWindowPointerDown, true);
});
</script>

<template>
  <nav
    v-if="mode === 'top-tabs'"
    class="section-tabs-bar long-worldbuilding-tabs long-chapter-card-tabs"
    :aria-label="label"
  >
    <div
      class="section-tabs-scroll"
      role="tablist"
      @wheel="handleHorizontalOverflowWheel"
    >
      <button
        v-for="chapter in items"
        :key="chapter.id"
        class="section-tab"
        :class="{ 'is-active': activeChapterId === chapter.id }"
        type="button"
        role="tab"
        :aria-selected="activeChapterId === chapter.id"
        :title="chapter.label"
        @click="emit('selectChapter', chapter.id)"
      >
        {{ chapter.label }}
      </button>
    </div>
    <button
      class="long-worldbuilding-add"
      type="button"
      aria-label="新增章卡"
      title="新增章卡"
      :disabled="locked"
      @click="emit('createChapter')"
    >
      <AppIcon name="plus" :size="15" />
    </button>
    <button
      class="long-worldbuilding-remove"
      type="button"
      aria-label="删除当前章卡"
      :title="
        committed
          ? '删除当前章卡及对应正文和连续性记录'
          : activeChapter
            ? '删除当前章卡'
            : '请先选择一张章卡'
      "
      :disabled="locked || !activeChapter"
      @click="activeChapter && emit('deleteChapter', activeChapter.id)"
    >
      <AppIcon name="minus" :size="15" />
    </button>
  </nav>

  <aside
    v-else
    class="long-story-plot-pane long-entry-list-pane"
    aria-label="章卡列表"
  >
    <header>
      <div>
        <strong>章卡</strong>
        <span>{{ items.length }}</span>
      </div>
      <div class="long-entry-list-actions">
        <button
          type="button"
          aria-label="新增章卡"
          title="新增章卡"
          :disabled="locked"
          @click="emit('createChapter')"
        >
          <AppIcon name="plus" :size="14" />
        </button>
        <button
          type="button"
          aria-label="删除当前章卡"
          :disabled="locked || !activeChapter"
          @click="activeChapter && emit('deleteChapter', activeChapter.id)"
        >
          <AppIcon name="minus" :size="14" />
        </button>
      </div>
    </header>
    <div class="long-story-plot-list" role="list">
      <article
        v-for="(chapter, index) in items"
        :key="chapter.id"
        class="long-story-plot-card"
        :class="{
          'is-active': activeChapterId === chapter.id,
          'is-menu-open': actionMenuId === chapter.id
        }"
        role="listitem"
      >
        <button
          class="long-story-plot-card-main"
          type="button"
          :aria-pressed="activeChapterId === chapter.id"
          :title="chapter.label"
          @click="emit('selectChapter', chapter.id)"
        >
          <span class="long-story-plot-card-order">{{ index + 1 }}</span>
          <span class="long-story-plot-card-title">{{ chapter.label }}</span>
        </button>
        <div
          class="long-story-plot-card-actions long-manuscript-card-actions"
          :class="{ 'is-menu-open': actionMenuId === chapter.id }"
        >
          <button
            class="long-story-plot-more-button"
            :class="{ 'is-active': actionMenuId === chapter.id }"
            type="button"
            :aria-label="`${chapter.label}更多操作`"
            :aria-expanded="actionMenuId === chapter.id"
            aria-haspopup="menu"
            :disabled="locked"
            @click.stop="toggleActionMenu(chapter.id)"
          >
            <AppIcon name="more" :size="16" />
          </button>
          <div
            v-if="actionMenuId === chapter.id"
            class="long-story-plot-action-menu"
            :class="{
              'opens-upward':
                index >= 2 && index >= items.length - 2
            }"
            role="menu"
            @keydown.esc.stop="actionMenuId = null"
          >
            <button
              class="long-story-plot-action-menu-item"
              type="button"
              role="menuitem"
              :disabled="locked || index === 0"
              @click.stop="runMenuAction(chapter.id, 'up')"
            >
              <AppIcon name="arrow-up" :size="14" />
              <span>上移</span>
            </button>
            <button
              class="long-story-plot-action-menu-item"
              type="button"
              role="menuitem"
              :disabled="locked || index === items.length - 1"
              @click.stop="runMenuAction(chapter.id, 'down')"
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
              :disabled="locked"
              @click.stop="runMenuAction(chapter.id, 'delete')"
            >
              <AppIcon name="trash" :size="14" />
              <span>删除</span>
            </button>
          </div>
        </div>
      </article>
    </div>
  </aside>
</template>
