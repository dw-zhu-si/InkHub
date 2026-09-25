<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ content: string }>();

const host = ref<HTMLElement>();
let textNode: Text | undefined;
let renderedContent = "";
let renderedHead = "";
let renderedTail = "";
let renderFrame: number | undefined;
let renderFallbackTimer: number | undefined;

const CONTENT_BOUNDARY_LENGTH = 64;
const BACKGROUND_RENDER_FALLBACK_MS = 120;

function clearRenderSchedule(): void {
  if (renderFrame !== undefined) {
    globalThis.cancelAnimationFrame?.(renderFrame);
    renderFrame = undefined;
  }
  if (renderFallbackTimer !== undefined) {
    globalThis.clearTimeout(renderFallbackTimer);
    renderFallbackTimer = undefined;
  }
}

function rememberRenderedBoundaries(content: string): void {
  renderedHead = content.slice(0, CONTENT_BOUNDARY_LENGTH);
  renderedTail = content.slice(-CONTENT_BOUNDARY_LENGTH);
}

function isAppendOnlyUpdate(content: string): boolean {
  if (content.length <= renderedContent.length) return false;
  if (content.slice(0, renderedHead.length) !== renderedHead) return false;
  const previousTailStart = Math.max(0, renderedContent.length - renderedTail.length);
  return content.slice(previousTailStart, renderedContent.length) === renderedTail;
}

function renderContent(): void {
  const element = host.value;
  if (!element || props.content === renderedContent) return;

  const nextContent = props.content;
  if (textNode && isAppendOnlyUpdate(nextContent)) {
    textNode.appendData(nextContent.slice(renderedContent.length));
  } else {
    textNode = element.ownerDocument.createTextNode(nextContent);
    element.replaceChildren(textNode);
  }
  renderedContent = nextContent;
  rememberRenderedBoundaries(nextContent);
}

function scheduleRender(): void {
  if (!host.value) return;
  if (typeof globalThis.requestAnimationFrame !== "function") {
    renderContent();
    return;
  }
  if (renderFrame !== undefined || renderFallbackTimer !== undefined) return;

  renderFrame = globalThis.requestAnimationFrame(() => {
    renderFrame = undefined;
    if (renderFallbackTimer !== undefined) {
      globalThis.clearTimeout(renderFallbackTimer);
      renderFallbackTimer = undefined;
    }
    renderContent();
  });
  renderFallbackTimer = globalThis.setTimeout(() => {
    renderFallbackTimer = undefined;
    if (renderFrame !== undefined) {
      globalThis.cancelAnimationFrame(renderFrame);
      renderFrame = undefined;
    }
    renderContent();
  }, BACKGROUND_RENDER_FALLBACK_MS);
}

onMounted(renderContent);
watch(() => props.content, scheduleRender, { flush: "post" });
onBeforeUnmount(clearRenderSchedule);
</script>

<template>
  <div ref="host" class="markdown-content message-markdown streaming-text" />
</template>

<style scoped>
.streaming-text {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
