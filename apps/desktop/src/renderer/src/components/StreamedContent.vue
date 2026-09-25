<script setup lang="ts">
import { computed } from "vue";
import MessageMarkdown from "./MessageMarkdown.vue";
import StreamingText from "./StreamingText.vue";

const props = withDefaults(
  defineProps<{
    content: string;
    streaming?: boolean;
  }>(),
  { streaming: false }
);

// A completed response only needs one Markdown pass. Very large model traces stay
// as a single text node so opening a completed thinking disclosure is also safe.
const MAX_SAFE_MARKDOWN_LENGTH = 100_000;
const useIncrementalText = computed(
  () => props.streaming || props.content.length > MAX_SAFE_MARKDOWN_LENGTH
);
</script>

<template>
  <StreamingText v-if="useIncrementalText" :content="content" />
  <MessageMarkdown v-else :content="content" />
</template>
