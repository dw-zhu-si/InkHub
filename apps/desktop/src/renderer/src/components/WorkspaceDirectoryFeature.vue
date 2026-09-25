<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

defineProps<{
  path: string | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  choose: [];
}>();
</script>

<template>
  <section class="workspace-settings-panel">
    <header>
      <div>
        <span class="dialog-eyebrow">墨枢</span>
        <h2>工作目录</h2>
      </div>
    </header>

    <div class="dialog-content">
      <p class="dialog-description">
        这里决定以后新建和导入项目的默认位置。切换目录不会移动或影响已经打开的书籍、素材库和技能库。
      </p>
      <div class="directory-card">
        <AppIcon name="directory" :size="20" />
        <div>
          <strong>{{ path ? "当前工作目录" : "尚未选择工作目录" }}</strong>
          <code>{{ path ?? "首次创建或导入时也会提示选择" }}</code>
        </div>
        <span>{{ path ? "已启用" : "待设置" }}</span>
      </div>
      <div class="dialog-note">
        新书和旧版导入保存在 books，新素材库保存在 materials，新技能库保存在 skills。为兼容既有工程，项目仍保留 deepwrite.json + Markdown 文件结构，可由 Git 或同步盘直接管理。
      </div>
      <div class="dialog-actions">
        <button
          class="dialog-primary-button"
          type="button"
          :disabled="loading"
          @click="emit('choose')"
        >
          {{ loading ? "选择中…" : path ? "切换工作目录" : "选择工作目录" }}
        </button>
      </div>
    </div>
  </section>
</template>
