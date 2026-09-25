<script setup lang="ts">
import type { LongCharacterId } from "@deepwrite/contracts";
import { handleHorizontalOverflowWheel } from "../utils/horizontalOverflow";
import AppIcon from "./AppIcon.vue";

export interface LongCharacterNavigationItem {
  id: LongCharacterId;
  label: string;
}

defineProps<{
  mode: "top-tabs" | "right-list";
  label: string;
  title: string;
  items: LongCharacterNavigationItem[];
  activeCharacterId: LongCharacterId | null;
  pendingCharacterId: LongCharacterId | null;
  locked?: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  selectCharacter: [characterId: LongCharacterId];
  createCharacter: [];
  deleteCharacter: [];
}>();
</script>

<template>
  <nav
    v-if="mode === 'top-tabs'"
    class="section-tabs-bar long-worldbuilding-tabs long-character-tabs"
    :aria-label="label"
  >
    <div
      class="section-tabs-scroll"
      role="tablist"
      @wheel="handleHorizontalOverflowWheel"
    >
      <button
        v-for="character in items"
        :key="character.id"
        class="section-tab"
        :class="{
          'is-active': activeCharacterId === character.id,
          'is-loading': pendingCharacterId === character.id
        }"
        type="button"
        role="tab"
        :aria-selected="activeCharacterId === character.id"
        :aria-busy="pendingCharacterId === character.id"
        :title="character.label"
        @click="emit('selectCharacter', character.id)"
      >
        {{ character.label }}
      </button>
    </div>
    <button
      class="long-worldbuilding-add"
      type="button"
      aria-label="新增人物"
      title="新增人物"
      :disabled="locked"
      @click="emit('createCharacter')"
    >
      <AppIcon name="plus" :size="15" />
    </button>
    <button
      class="long-worldbuilding-remove"
      type="button"
      aria-label="删除当前人物"
      title="删除当前人物"
      :disabled="locked || !canDelete"
      @click="emit('deleteCharacter')"
    >
      <AppIcon name="minus" :size="15" />
    </button>
  </nav>

  <aside
    v-else
    class="long-story-plot-pane long-entry-list-pane"
    :aria-label="`${label}列表`"
  >
    <header>
      <div>
        <strong>{{ title }}</strong>
        <span>{{ items.length }}</span>
      </div>
      <div class="long-entry-list-actions">
        <button
          type="button"
          aria-label="新增人物"
          title="新增人物"
          :disabled="locked"
          @click="emit('createCharacter')"
        >
          <AppIcon name="plus" :size="14" />
        </button>
        <button
          type="button"
          aria-label="删除当前人物"
          title="删除当前人物"
          :disabled="locked || !canDelete"
          @click="emit('deleteCharacter')"
        >
          <AppIcon name="minus" :size="14" />
        </button>
      </div>
    </header>
    <div class="long-story-plot-list" role="list">
      <article
        v-for="(character, index) in items"
        :key="character.id"
        class="long-story-plot-card"
        :class="{
          'is-active': activeCharacterId === character.id,
          'is-loading': pendingCharacterId === character.id
        }"
        role="listitem"
      >
        <button
          class="long-story-plot-card-main"
          type="button"
          :aria-pressed="activeCharacterId === character.id"
          :aria-busy="pendingCharacterId === character.id"
          :title="character.label"
          @click="emit('selectCharacter', character.id)"
        >
          <span class="long-story-plot-card-order">{{ index + 1 }}</span>
          <span class="long-story-plot-card-title">{{ character.label }}</span>
        </button>
      </article>
    </div>
  </aside>
</template>
