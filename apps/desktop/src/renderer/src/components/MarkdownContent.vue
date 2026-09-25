<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../utils/renderMarkdown";

const props = defineProps<{ content: string }>();
const html = computed(() => renderMarkdown(props.content));
</script>

<template>
  <!-- renderMarkdown escapes source text before adding its allowlisted HTML subset. -->
  <div class="markdown-content" v-html="html" />
</template>
