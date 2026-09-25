<script setup lang="ts">
defineProps<{
  activeFeature: string;
}>();
</script>

<template>
  <slot :active-feature="activeFeature" />
</template>
