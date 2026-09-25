<script setup lang="ts">
import { defineAsyncComponent } from "vue";

const WorkspaceShell = defineAsyncComponent(
  () => import("./WorkspaceShell.vue")
);
</script>

<template>
  <WorkspaceShell />
</template>
