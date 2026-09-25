<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  isBuiltinCreativePlotStageId,
  type Book,
  type BookCharacterFormat,
  type CharacterStructureMutation,
  type PlotStructureMutation
} from "@deepwrite/contracts";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";
import PopupSelect, { type PopupSelectValue } from "./PopupSelect.vue";

export interface PlotStructureMutationCompletion {
  succeed(): void;
  fail(): void;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    book: Book | null;
    pending?: boolean;
  }>(),
  { pending: false }
);

const emit = defineEmits<{
  close: [];
  mutation: [
    mutation: PlotStructureMutation,
    completion: PlotStructureMutationCompletion
  ];
  characterMutation: [
    mutation: CharacterStructureMutation,
    completion: PlotStructureMutationCompletion
  ];
}>();

const dialogElement = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const formOpen = ref(false);
const formMode = ref<"create" | "edit">("create");
const editingStageId = ref<string | null>(null);
const deletingStageId = ref<string | null>(null);
const localPending = ref(false);
const activeStructureTab = ref<"character" | "plot">("character");
const requestedCharacterFormat = ref<BookCharacterFormat | null>(null);
const form = reactive({ title: "", description: "" });
let previousFocus: HTMLElement | null = null;

const locked = computed(() => props.pending || localPending.value);
const rows = computed(() => props.book?.plotStages ?? []);
const deletingStage = computed(() =>
  rows.value.find(({ id }) => id === deletingStageId.value)
);
const deletingDocument = computed(() =>
  props.book?.documents.find(({ id }) => id === deletingStageId.value)
);
const deletingHasContent = computed(
  () => Boolean(deletingDocument.value?.content.trim())
);
const characterOverview = computed(() =>
  props.book?.documents.find(({ id }) => id === "character_design")
);
const orderedCharacterItems = computed(() =>
  props.book?.characterStructure.format === "list"
    ? [...props.book.characterStructure.items].sort(
        (left, right) => left.order - right.order
      )
    : []
);
const characterTextPreview = computed(() => {
  const text = characterOverview.value?.content.trim() ?? "";
  if (!text) return "（当前人物文本为空，将转换为空条目列表）";
  return text.length > 500 ? `${text.slice(0, 500)}\n……` : text;
});
const activeSubdialog = computed<"character-format" | "form" | "delete" | null>(
  () =>
    requestedCharacterFormat.value
      ? "character-format"
      : formOpen.value
        ? "form"
        : deletingStage.value
          ? "delete"
          : null
);

function resetPanels(): void {
  formOpen.value = false;
  editingStageId.value = null;
  deletingStageId.value = null;
  form.title = "";
  form.description = "";
  requestedCharacterFormat.value = null;
}

function close(): void {
  if (locked.value) return;
  if (formOpen.value || deletingStageId.value) {
    resetPanels();
    return;
  }
  emit("close");
}

function openCreate(): void {
  if (locked.value) return;
  deletingStageId.value = null;
  formMode.value = "create";
  editingStageId.value = null;
  form.title = "";
  form.description = "";
  formOpen.value = true;
}

function openEdit(stageId: string): void {
  if (locked.value) return;
  const stage = rows.value.find(({ id }) => id === stageId);
  if (!stage) return;
  deletingStageId.value = null;
  formMode.value = "edit";
  editingStageId.value = stage.id;
  form.title = stage.title;
  form.description = stage.description;
  formOpen.value = true;
}

function beginMutation(mutation: PlotStructureMutation): void {
  if (locked.value) return;
  localPending.value = true;
  emit("mutation", mutation, {
    succeed: () => {
      localPending.value = false;
      resetPanels();
    },
    fail: () => {
      localPending.value = false;
    }
  });
}

function selectCharacterFormat(value: PopupSelectValue): void {
  if ((value !== "text" && value !== "list") || locked.value) return;
  if (value === props.book?.characterStructure.format) return;
  requestedCharacterFormat.value = value;
}

function confirmCharacterFormat(): void {
  const format = requestedCharacterFormat.value;
  if (!format || locked.value) return;
  localPending.value = true;
  emit("characterMutation", { type: "setFormat", format }, {
    succeed: () => {
      localPending.value = false;
      requestedCharacterFormat.value = null;
    },
    fail: () => {
      localPending.value = false;
    }
  });
}

function submitForm(): void {
  const title = form.title.trim();
  const description = form.description.trim();
  if (!title) {
    uiMessage.warning("请输入剧情结构名称。");
    return;
  }
  if (!description) {
    uiMessage.warning("请输入结构说明；该说明会作为智能体阶段边界。");
    return;
  }
  if (
    rows.value.some(
      (stage) =>
        stage.id !== editingStageId.value &&
        stage.title.toLocaleLowerCase() === title.toLocaleLowerCase()
    )
  ) {
    uiMessage.warning(`剧情结构名称“${title}”已存在。`);
    return;
  }
  if (formMode.value === "create") {
    beginMutation({ type: "create", title, description });
    return;
  }
  if (!editingStageId.value) return;
  beginMutation({
    type: "update",
    stageId: editingStageId.value,
    title,
    description
  });
}

function move(stageId: string, direction: "up" | "down"): void {
  beginMutation({ type: "move", stageId, direction });
}

function toggleEnabled(stageId: string, enabled: boolean): void {
  if (locked.value) return;
  if (
    !enabled &&
    !rows.value.some((stage) => stage.id !== stageId && stage.enabled)
  ) {
    uiMessage.warning("至少需要保留一个启用的剧情结构项。");
    return;
  }
  beginMutation({ type: "setEnabled", stageId, enabled });
}

function openDelete(stageId: string): void {
  if (locked.value) return;
  if (isBuiltinCreativePlotStageId(stageId)) {
    uiMessage.warning("默认剧情结构不可删除，可关闭开关隐藏。");
    return;
  }
  if (rows.value.length <= 1) {
    uiMessage.warning("至少需要保留一个剧情结构项。");
    return;
  }
  formOpen.value = false;
  deletingStageId.value = stageId;
}

function confirmDelete(): void {
  const stage = deletingStage.value;
  if (!stage) return;
  if (isBuiltinCreativePlotStageId(stage.id)) {
    uiMessage.warning("默认剧情结构不可删除。");
    return;
  }
  beginMutation({
    type: "delete",
    stageId: stage.id,
    deleteContent: true
  });
}

function focusableElements(): HTMLElement[] {
  return dialogElement.value
    ? Array.from(
        dialogElement.value.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("hidden"))
    : [];
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) return;
  if (event.key === "Escape") {
    close();
    return;
  }
  if (event.key !== "Tab" || !dialogElement.value?.contains(event.target as Node)) {
    return;
  }
  const focusable = focusableElements();
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    dialogElement.value.focus({ preventScroll: true });
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      resetPanels();
      await nextTick();
      (closeButton.value ?? dialogElement.value)?.focus({ preventScroll: true });
    } else {
      const target = previousFocus;
      previousFocus = null;
      await nextTick();
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
  }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && book && !activeSubdialog"
      class="dialog-backdrop plot-structure-dialog-overlay"
      @mousedown.self="close"
    >
      <section
        ref="dialogElement"
        class="plot-structure-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plot-structure-title"
        tabindex="-1"
      >
        <header class="plot-structure-dialog-header">
          <div>
            <span>{{ book.bookType === "script" ? "剧本" : "短篇" }}设置</span>
            <strong id="plot-structure-title">{{ book.title }} · 结构管理</strong>
          </div>
          <button ref="closeButton" type="button" aria-label="关闭结构管理" :disabled="locked" @click="close">
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <section class="plot-structure-manager" aria-label="结构管理">
          <div class="structure-main-tabs" role="tablist" aria-label="结构管理类型">
            <button
              type="button"
              role="tab"
              :aria-selected="activeStructureTab === 'character'"
              @click="activeStructureTab = 'character'"
            >
              人物结构管理
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeStructureTab === 'plot'"
              @click="activeStructureTab = 'plot'"
            >
              剧情结构管理
            </button>
          </div>

          <template v-if="activeStructureTab === 'character'">
            <header class="manager-header">
              <div>
                <p class="manager-eyebrow">CHARACTER STRUCTURE</p>
                <h2>人物结构管理</h2>
                <p>选择人物使用单篇连续文本，或使用概览与独立人物条目。</p>
              </div>
            </header>
            <div class="structure-panel-content character-structure-panel">
              <label class="form-field">
                <span>人物样式</span>
                <PopupSelect
                  :model-value="book.characterStructure.format"
                  :options="[
                    { value: 'list', label: '条目样式' },
                    { value: 'text', label: '文本样式' }
                  ]"
                  accessible-label="人物结构样式"
                  :disabled="locked"
                  :menu-z-index="2300"
                  @update:model-value="selectCharacterFormat"
                />
                <small v-if="book.characterStructure.format === 'list'">
                  人物在资源树中显示为概览与独立条目，可分别编辑和交给智能体管理。
                </small>
                <small v-else>
                  人物继续使用当前单一 Markdown 文本编辑方式。
                </small>
              </label>
            </div>
          </template>

          <template v-else>
          <header class="manager-header">
            <div>
              <p class="manager-eyebrow">CREATIVE PLOT STRUCTURE</p>
              <h2>剧情结构管理</h2>
              <p>
                名称与说明全局生效；启用开关和排序按本书绑定。关闭后不在资源树显示，也不对智能体开放。默认五项不可删除。
              </p>
            </div>
          </header>

          <div class="structure-panel-content">
            <header class="manager-toolbar">
              <div class="section-tabs" role="tablist" aria-label="基础结构类型">
                <button type="button" role="tab" aria-selected="true">
                  剧情结构
                </button>
              </div>
              <button
                class="primary-button"
                type="button"
                :disabled="locked || rows.length >= 32"
                @click="openCreate"
              >
                新建剧情结构
              </button>
            </header>

            <ol class="manager-list">
              <li
                v-for="(stage, index) in rows"
                :key="stage.id"
                class="manager-row"
                :class="{ 'is-disabled': !stage.enabled }"
              >
                <label class="row-toggle">
                  <input
                    type="checkbox"
                    role="switch"
                    :checked="stage.enabled"
                    :disabled="locked"
                    :aria-label="`${stage.enabled ? '关闭' : '启用'}${stage.title}`"
                    @change="
                      toggleEnabled(
                        stage.id,
                        ($event.target as HTMLInputElement).checked
                      )
                    "
                  />
                  <span>{{ stage.enabled ? "启用" : "关闭" }}</span>
                </label>
                <div class="row-copy">
                  <strong>{{ stage.title }}</strong>
                  <span>{{ stage.description }}</span>
                  <code>
                    {{ stage.id }}
                    <template v-if="isBuiltinCreativePlotStageId(stage.id)">
                      · 默认
                    </template>
                  </code>
                </div>
                <div class="row-actions">
                  <button
                    type="button"
                    :aria-label="`上移${stage.title}`"
                    title="上移"
                    :disabled="locked || index === 0"
                    @click="move(stage.id, 'up')"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    :aria-label="`下移${stage.title}`"
                    title="下移"
                    :disabled="locked || index === rows.length - 1"
                    @click="move(stage.id, 'down')"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    :aria-label="`编辑${stage.title}`"
                    :disabled="locked"
                    @click="openEdit(stage.id)"
                  >
                    编辑
                  </button>
                  <button
                    class="delete-button"
                    type="button"
                    :aria-label="`删除${stage.title}`"
                    :disabled="
                      locked ||
                      rows.length <= 1 ||
                      isBuiltinCreativePlotStageId(stage.id)
                    "
                    @click="openDelete(stage.id)"
                  >
                    删除
                  </button>
                </div>
              </li>
            </ol>

            <p class="manager-footnote">
              新建阶段会对全部短篇与剧本生效；启用状态仅绑定当前作品。改名全局同步，不会改变稳定 ID 与文件路径。
            </p>
          </div>
          </template>
        </section>
      </section>
    </div>

    <div
      v-if="open && book && activeSubdialog === 'character-format'"
      class="dialog-backdrop structure-modal-overlay"
      @mousedown.self="requestedCharacterFormat = null"
      @keydown.esc.stop="requestedCharacterFormat = null"
    >
      <section class="structure-modal" role="alertdialog" aria-modal="true" aria-labelledby="character-format-title">
        <header class="modal-header">
          <div>
            <span>CONVERT</span>
            <h3 id="character-format-title">转换人物结构样式</h3>
          </div>
        </header>
        <fieldset class="modal-body" :disabled="locked">
          <p class="delete-copy">
            <template v-if="requestedCharacterFormat === 'list'">
              当前人物文本会完整迁移到一个“人物设定”条目，概览初始化为空。
            </template>
            <template v-else>
              概览与全部人物条目会按当前顺序合并为一个 Markdown 文本；条目文件将在合并成功后移除。
            </template>
          </p>
          <div class="character-conversion-preview">
            <strong>转换预览</strong>
            <template v-if="requestedCharacterFormat === 'list'">
              <span>{{ characterOverview?.content.trim() ? "人物设定 · 1 个条目" : "概览 · 空条目列表" }}</span>
              <pre>{{ characterTextPreview }}</pre>
            </template>
            <template v-else>
              <span>
                概览{{ characterOverview?.content.trim() ? "（有内容）" : "（为空）" }}，其后合并 {{ orderedCharacterItems.length }} 个人物条目
              </span>
              <ol v-if="orderedCharacterItems.length">
                <li v-for="item in orderedCharacterItems" :key="item.id">{{ item.title }}</li>
              </ol>
              <span v-else>当前没有人物条目。</span>
            </template>
          </div>
        </fieldset>
        <footer class="modal-actions">
          <button type="button" :disabled="locked" @click="requestedCharacterFormat = null">取消</button>
          <button class="primary-button" type="button" :disabled="locked" @click="confirmCharacterFormat">
            {{ locked ? "转换中…" : "确认转换" }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-else-if="open && book && activeSubdialog === 'form'"
      class="dialog-backdrop structure-modal-overlay"
      @mousedown.self="close"
      @keydown.esc.stop="close"
    >
      <section
        class="structure-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="formMode === 'create' ? '新建剧情结构' : '编辑剧情结构'"
      >
        <form @submit.prevent="submitForm">
          <header class="modal-header">
            <div>
              <span>{{ formMode === "create" ? "CREATE" : "EDIT" }}</span>
              <h3>{{ formMode === "create" ? "新建剧情结构" : "编辑剧情结构" }}</h3>
            </div>
            <button
              class="close-button"
              type="button"
              aria-label="关闭"
              :disabled="locked"
              @click="close"
            >
              ×
            </button>
          </header>

          <fieldset class="modal-body" :disabled="locked">
            <label class="form-field">
              <span>名称</span>
              <input
                v-model="form.title"
                maxlength="120"
                autocomplete="off"
                autofocus
                required
              />
            </label>
            <label class="form-field">
              <span>结构说明</span>
              <textarea
                v-model="form.description"
                maxlength="20000"
                rows="7"
                required
              />
              <small>该说明会作为剧情智能体在此阶段的任务边界与交付标准。</small>
            </label>
            <p class="stable-id-note">
              稳定 ID 创建后不会因改名或排序而变化，Markdown 文件路径和已有内容也会保持不变。
            </p>
          </fieldset>

          <footer class="modal-actions">
            <button type="button" :disabled="locked" @click="close">取消</button>
            <button class="primary-button" type="submit" :disabled="locked">
              {{ locked ? "保存中…" : formMode === "create" ? "创建" : "保存修改" }}
            </button>
          </footer>
        </form>
      </section>
    </div>

    <div
      v-else-if="open && book && activeSubdialog === 'delete' && deletingStage"
      class="dialog-backdrop structure-modal-overlay"
      @mousedown.self="close"
      @keydown.esc.stop="close"
    >
      <section
        class="structure-modal delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="plot-structure-delete-title"
        aria-describedby="plot-structure-delete-description"
      >
        <header class="modal-header">
          <div>
            <span>DELETE</span>
            <h3 id="plot-structure-delete-title">删除“{{ deletingStage.title }}”</h3>
          </div>
        </header>
        <fieldset class="modal-body" :disabled="locked">
          <p id="plot-structure-delete-description" class="delete-copy">
            该自定义阶段会对全部短篇与剧本生效。确认后将从全局删除，并永久清除各作品中对应的 Markdown 内容。
            {{ deletingHasContent ? "当前作品该阶段已有内容。" : "" }}
          </p>
        </fieldset>
        <footer class="modal-actions">
          <button type="button" :disabled="locked" autofocus @click="close">
            取消
          </button>
          <button
            class="danger-button"
            type="button"
            :disabled="locked"
            @click="confirmDelete"
          >
            {{ locked ? "删除中…" : "确认全局删除" }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.plot-structure-dialog-overlay {
  z-index: 2200;
  padding: clamp(12px, 3vw, 32px);
}

.plot-structure-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(1040px, 96vw);
  max-height: min(880px, 92vh);
  overflow: hidden;
  border: 1px solid var(--theme-line);
  border-radius: 16px;
  background: var(--surface-raised);
  box-shadow: 0 22px 70px color-mix(in srgb, var(--text-primary) 18%, transparent);
  color: var(--text-primary);
}

.plot-structure-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.plot-structure-dialog-header > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.plot-structure-dialog-header span {
  color: var(--text-tertiary);
  font-size: 0.714286rem;
}

.plot-structure-dialog-header strong {
  overflow: hidden;
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plot-structure-dialog-header button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.plot-structure-dialog-header button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.plot-structure-manager {
  display: grid;
  min-width: 0;
  min-height: 0;
  gap: 0.85rem;
  overflow: auto;
  padding: clamp(0.85rem, 2vw, 1.25rem);
  border: 1px solid var(--theme-line);
  border-radius: 0.85rem;
  background: var(--surface-main);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.manager-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.manager-header h2,
.modal-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.1rem;
  line-height: 1.3;
}

.manager-header p,
.modal-header span,
.manager-footnote {
  margin: 0.25rem 0 0;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.manager-eyebrow {
  color: var(--accent) !important;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.11em;
}

.structure-panel-content {
  display: grid;
  min-width: 0;
  gap: 0.85rem;
}

.structure-main-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  padding: 0.25rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.75rem;
  background: var(--surface-muted);
}

.structure-main-tabs button {
  background: transparent;
}

.structure-main-tabs button[aria-selected="true"] {
  border-color: var(--theme-line);
  background: var(--surface-raised);
  color: var(--accent);
  font-weight: 650;
}

.character-structure-panel {
  max-width: 34rem;
  padding: 1rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.75rem;
  background: var(--surface-raised);
}

.manager-toolbar,
.row-actions,
.modal-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.manager-toolbar {
  justify-content: space-between;
}

.section-tabs {
  display: flex;
  min-width: 0;
  overflow-x: auto;
  padding: 0.18rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.65rem;
  background: var(--surface-muted);
}

.section-tabs button {
  flex: 0 0 auto;
  min-height: 1.9rem;
  padding: 0.34rem 0.58rem;
  border-color: var(--theme-line);
  background: var(--surface-raised);
  color: var(--accent);
  white-space: nowrap;
}

button,
input,
textarea {
  font: inherit;
}

button {
  min-height: 2rem;
  padding: 0.38rem 0.7rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.55rem;
  background: var(--surface-raised);
  color: var(--text-secondary);
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 0.2rem var(--accent-soft);
  outline: none;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.primary-button {
  border-color: var(--neutral-solid);
  background: var(--neutral-solid);
  color: var(--accent-contrast);
  font-weight: 650;
}

.primary-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--neutral-solid) 86%, var(--text-primary));
  background: color-mix(in srgb, var(--neutral-solid) 86%, var(--text-primary));
  color: var(--accent-contrast);
}

.manager-list {
  display: grid;
  min-height: 0;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.manager-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
  padding: 0.75rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.7rem;
  background: var(--surface-raised);
}

.manager-row:hover {
  border-color: var(--theme-line);
  background: var(--surface-hover);
}

.manager-row.is-disabled {
  opacity: 0.72;
}

.row-toggle {
  display: grid;
  justify-items: center;
  gap: 0.28rem;
  min-width: 3.2rem;
  color: var(--text-tertiary);
  font-size: 0.72rem;
  cursor: pointer;
}

.row-toggle input {
  width: 2.4rem;
  height: 1.3rem;
  margin: 0;
  appearance: none;
  border: 1px solid var(--theme-line);
  border-radius: 999px;
  background: var(--surface-muted);
  cursor: pointer;
  position: relative;
}

.row-toggle input::after {
  content: "";
  position: absolute;
  top: 1px;
  left: 1px;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  background: var(--text-tertiary);
  transition: transform 120ms ease, background 120ms ease;
}

.row-toggle input:checked {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.row-toggle input:checked::after {
  transform: translateX(1.05rem);
  background: var(--accent);
}

.row-toggle input:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.row-copy {
  display: grid;
  min-width: 0;
  gap: 0.18rem;
}

.row-copy strong,
.row-copy span,
.row-copy code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-copy span {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.row-copy code {
  color: var(--text-tertiary);
  font: 0.72rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.row-actions button {
  min-width: 2rem;
  padding-inline: 0.5rem;
}

.delete-button {
  color: var(--danger);
}

.structure-modal-overlay {
  z-index: 2300;
  overflow: auto;
  padding: 1rem;
}

.structure-modal {
  width: min(36rem, 100%);
  max-height: min(88vh, 48rem);
  overflow: auto;
  border: 1px solid var(--theme-line);
  border-radius: 0.9rem;
  background: var(--surface-main);
  box-shadow: 0 1.2rem 3.5rem color-mix(in srgb, var(--theme-foreground) 24%, transparent);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.modal-header,
.modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
}

.modal-header {
  border-bottom: 1px solid var(--theme-line-soft);
}

.modal-header span {
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.close-button {
  width: 2rem;
  padding: 0;
  border-color: transparent;
  background: transparent;
  font-size: 1.2rem;
}

.modal-body {
  display: grid;
  min-inline-size: 0;
  gap: 0.85rem;
  margin: 0;
  padding: 1rem;
  border: 0;
}

.form-field {
  display: grid;
  gap: 0.4rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.form-field input,
.form-field textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0.6rem 0.65rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.6rem;
  background: var(--surface-raised);
  color: var(--text-primary);
  font-weight: 400;
  line-height: 1.5;
}

.form-field textarea {
  min-height: 8.5rem;
  resize: vertical;
}

.form-field small,
.stable-id-note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.5;
}

.modal-actions {
  justify-content: flex-end;
  border-top: 1px solid var(--theme-line-soft);
  background: var(--surface-muted);
}

.delete-modal {
  width: min(31rem, 100%);
}

.delete-copy {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.character-conversion-preview {
  display: grid;
  gap: 0.45rem;
  padding: 0.75rem;
  border: 1px solid var(--theme-line-soft);
  border-radius: 0.65rem;
  background: var(--surface-muted);
  color: var(--text-secondary);
  line-height: 1.5;
}

.character-conversion-preview strong {
  color: var(--text-primary);
}

.character-conversion-preview pre {
  max-height: 10rem;
  overflow: auto;
  margin: 0;
  padding: 0.55rem;
  border-radius: 0.45rem;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.character-conversion-preview ol {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding-left: 1.25rem;
}

.cascade-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid var(--theme-line);
  border-radius: 0.65rem;
  background: var(--surface-muted);
  color: var(--text-primary);
}

.cascade-option span {
  display: grid;
  gap: 0.2rem;
}

.cascade-option small {
  color: var(--text-tertiary);
}

.cascade-option input {
  margin-top: 0.18rem;
  accent-color: var(--danger);
}

.danger-button {
  border-color: var(--danger);
  background: var(--danger);
  color: #fff;
  font-weight: 650;
}

.danger-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--danger) 84%, var(--text-primary));
  background: color-mix(in srgb, var(--danger) 84%, var(--text-primary));
  color: #fff;
}

@media (max-height: 680px), (max-width: 760px) {
  .plot-structure-dialog-overlay {
    padding: 8px;
  }

  .plot-structure-dialog {
    width: 100%;
    max-height: calc(100vh - 16px);
    border-radius: 12px;
  }
}

@media (max-width: 42rem) {
  .manager-toolbar,
  .manager-header,
  .manager-row {
    align-items: stretch;
  }

  .manager-header,
  .manager-row {
    grid-template-columns: 1fr;
  }

  .manager-header {
    display: grid;
  }

  .manager-toolbar {
    justify-content: space-between;
  }

  .row-actions {
    flex-wrap: wrap;
  }

  .row-actions button {
    flex: 1 1 auto;
  }
}
</style>
