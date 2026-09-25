<script setup lang="ts">
defineProps<{
  activeDialog: string | null;
}>();
</script>

<template>
  <slot v-if="activeDialog" :active-dialog="activeDialog" />
</template>
