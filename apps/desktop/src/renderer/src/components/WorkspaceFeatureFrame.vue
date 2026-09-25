<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

defineProps<{
  leftCollapsed: boolean;
  expandButtonClass: string;
  label: string;
}>();

const emit = defineEmits<{
  expandLeft: [];
}>();
</script>

<template>
  <main :aria-label="label">
    <button
      v-if="leftCollapsed"
      class="icon-button"
      :class="expandButtonClass"
      type="button"
      aria-label="展开左侧栏"
      @click="emit('expandLeft')"
    >
      <AppIcon name="panel-left" :size="18" />
    </button>
    <slot />
  </main>
</template>
