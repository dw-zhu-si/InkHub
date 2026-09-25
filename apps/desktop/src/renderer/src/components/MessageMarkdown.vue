<script setup lang="ts">
import MarkdownContent from "./MarkdownContent.vue";

defineProps<{ content: string }>();
</script>

<template>
  <MarkdownContent class="message-markdown" :content="content" />
</template>
