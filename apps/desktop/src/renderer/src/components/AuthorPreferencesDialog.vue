<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import { AUTHOR_PREFERENCE_LIMIT, AUTHOR_PREFERENCE_CONTENT_LIMIT, AUTHOR_PREFERENCES_TOTAL_LIMIT, createAuthorPreferencesStorage, type AuthorPreference, type AuthorPreferenceScope } from "../utils/authorPreferences";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const persistence = createAuthorPreferencesStorage(localStorage);
const preferences = ref<AuthorPreference[]>([]);
const editingId = ref<string | null>(null);
const emptyDraft = () => ({ label: "", content: "", enabled: true, scopes: ["short", "script", "long"] as AuthorPreferenceScope[] });
const draft = ref(emptyDraft());
const editing = ref(false);
const baseline = ref("");
const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
const scopeOptions: Array<{ id: AuthorPreferenceScope; label: string }> = [{ id: "short", label: "短篇" }, { id: "script", label: "剧本" }, { id: "long", label: "长篇" }];
const changed = computed(() => editing.value && JSON.stringify(draft.value) !== baseline.value);
const totalLength = computed(() => preferences.value.reduce((sum, item) => sum + item.content.length, 0));
function discard(): boolean { return !changed.value || window.confirm("作者偏好尚未保存，确定放弃输入吗？"); }
function close(): void { if (discard()) emit("close"); }
function edit(item?: AuthorPreference): void {
  if (!discard()) return;
  editingId.value = item?.id ?? null;
  draft.value = item ? { label: item.label, content: item.content, enabled: item.enabled, scopes: [...item.scopes] } : emptyDraft();
  baseline.value = JSON.stringify(draft.value);
  editing.value = true;
}
function commit(next: AuthorPreference[]): boolean {
  try { persistence.write(next); preferences.value = next; return true; }
  catch (error) { uiMessage.error(error instanceof Error ? error.message : "保存失败，输入已保留。请检查本机存储后重试。"); return false; }
}
function save(): void {
  if (!draft.value.label.trim() || !draft.value.content.trim()) { uiMessage.warning("请填写偏好名称和内容。"); return; }
  if (!draft.value.scopes.length) { uiMessage.warning("至少选择一种适用作品类型。"); return; }
  if (!editingId.value && preferences.value.length >= AUTHOR_PREFERENCE_LIMIT) { uiMessage.warning(`最多保存 ${AUTHOR_PREFERENCE_LIMIT} 条作者偏好。`); return; }
  const saved: AuthorPreference = { id: editingId.value ?? crypto.randomUUID(), ...draft.value, label: draft.value.label.trim(), content: draft.value.content.trim(), scopes: [...draft.value.scopes] };
  const next = editingId.value ? preferences.value.map((item) => item.id === editingId.value ? saved : item) : [...preferences.value, saved];
  if (!commit(next)) return;
  editing.value = false;
  uiMessage.success("作者偏好已保存，将用于下一次适用的创作对话");
}
function remove(item: AuthorPreference): void {
  if (!discard() || !window.confirm(`确定删除作者偏好“${item.label}”吗？`)) return;
  if (commit(preferences.value.filter(({ id }) => id !== item.id))) editing.value = false;
}
function toggle(item: AuthorPreference): void {
  commit(preferences.value.map((entry) => entry.id === item.id ? { ...entry, enabled: !entry.enabled } : entry));
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") { event.stopPropagation(); close(); return; }
  if (event.key !== "Tab") return;
  const elements = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') ?? []).filter((item) => item.getClientRects().length);
  const first = elements[0]; const last = elements.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(() => props.open, (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try { preferences.value = persistence.read(); } catch { uiMessage.error("作者偏好读取失败，原记录已保留，请先恢复记录后重试。"); }
    void nextTick(() => dialog.value?.focus());
  } else { editing.value = false; previousFocus?.focus(); previousFocus = null; }
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop author-preferences-overlay" @mousedown.self="close">
      <section ref="dialog" class="workspace-dialog author-preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="author-preferences-title" tabindex="-1" @keydown="keydown">
        <header><div><span class="dialog-eyebrow">创作空间 · 跨作品</span><h2 id="author-preferences-title">作者偏好</h2></div><button class="dialog-close" type="button" aria-label="关闭作者偏好" @click="close">×</button></header>
        <p class="author-preferences-description">管理希望延续的叙述习惯、节奏与表达方式。启用后仅用于所选类型的下一次 AI 创作对话；当前请求和本书已确认事实优先。请勿保存密钥或隐私资料。</p>
        <div class="author-preferences-toolbar"><span>{{ preferences.length }}/{{ AUTHOR_PREFERENCE_LIMIT }} 条 · {{ totalLength }}/{{ AUTHOR_PREFERENCES_TOTAL_LIMIT }} 字符 · 仅存本机</span><button class="dialog-primary-button" type="button" @click="edit()">新增偏好</button></div>
        <div class="author-preferences-body">
          <form v-if="editing" class="author-preferences-form" @submit.prevent="save">
            <label>偏好名称<input v-model="draft.label" maxlength="80" required placeholder="例如：人物对白" /></label>
            <label>偏好内容<textarea v-model="draft.content" :maxlength="AUTHOR_PREFERENCE_CONTENT_LIMIT" required rows="5" placeholder="描述希望保持的写作习惯" /></label>
            <fieldset><legend>适用类型</legend><label v-for="scope in scopeOptions" :key="scope.id"><input v-model="draft.scopes" type="checkbox" :value="scope.id" />{{ scope.label }}</label></fieldset>
            <label class="author-preferences-toggle"><input v-model="draft.enabled" type="checkbox" />启用此偏好</label>
            <div class="author-preferences-actions"><button class="dialog-secondary-button" type="button" @click="discard() && (editing = false)">取消</button><button class="dialog-primary-button" type="submit">保存偏好</button></div>
          </form>
          <template v-else>
            <p v-if="!preferences.length" class="author-preferences-empty">还没有作者偏好。可以从一条明确的表达习惯开始。</p>
            <article v-for="item in preferences" :key="item.id" class="author-preference-item">
              <div class="author-preference-heading"><h3>{{ item.label }}</h3><span>{{ item.enabled ? '已启用' : '已停用' }} · {{ scopeOptions.filter((scope) => item.scopes.includes(scope.id)).map(({ label }) => label).join(' / ') }}</span></div>
              <p>{{ item.content }}</p>
              <div class="author-preferences-actions"><button class="dialog-secondary-button" type="button" :aria-label="`${item.enabled ? '停用' : '启用'}${item.label}`" @click="toggle(item)">{{ item.enabled ? '停用' : '启用' }}</button><button class="dialog-secondary-button" type="button" @click="edit(item)">编辑</button><button class="dialog-secondary-button" type="button" @click="remove(item)">删除</button></div>
            </article>
          </template>
        </div>
        <footer><span>删除或停用后，后续请求不再附加该偏好；已有会话记录不会被改写。</span><button class="dialog-secondary-button" type="button" @click="close">完成</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.author-preferences-overlay { z-index: 1350; }
.author-preferences-dialog { display:flex; flex-direction:column; width:min(760px, calc(100vw - 32px)); max-height:88vh; overflow:hidden; background:var(--surface-raised); color:var(--text-primary); }
header,footer,.author-preferences-toolbar,.author-preference-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; }
header { padding:20px 24px; border-bottom:1px solid var(--theme-line); }h2 { margin:4px 0 0; }h3 { margin:0; font-size:1rem; }
.author-preferences-description { margin:16px 24px; color:var(--text-secondary); line-height:1.6; }
.author-preferences-toolbar { padding:0 24px 16px; }.author-preferences-toolbar span,footer,.author-preference-heading span { color:var(--text-secondary); font-size:0.85rem; }
.author-preferences-body { min-height:0; overflow:auto; padding:0 24px 20px; }.author-preferences-empty { padding:30px 0; color:var(--text-secondary); text-align:center; }
.author-preferences-form { display:grid; gap:16px; }.author-preferences-form > label:not(.author-preferences-toggle) { display:grid; gap:6px; }.author-preferences-form input:not([type="checkbox"]),textarea { width:100%; padding:10px; border:1px solid var(--theme-line); border-radius:8px; background:var(--surface-main); color:var(--text-primary); }textarea { resize:vertical; }
fieldset { display:flex; flex-wrap:wrap; gap:18px; padding:12px; border:1px solid var(--theme-line); border-radius:8px; }fieldset label,.author-preferences-toggle { display:flex; align-items:center; gap:6px; }
.author-preference-item { margin:0 0 12px; padding:16px; border:1px solid var(--theme-line); border-radius:10px; background:var(--surface-main); overflow-wrap:anywhere; }.author-preference-item p { white-space:pre-wrap; line-height:1.6; }.author-preferences-actions { display:flex; gap:8px; justify-content:flex-end; }
.author-preferences-dialog .dialog-primary-button { color:var(--surface-main); background:var(--text-primary); }footer { padding:14px 24px; border-top:1px solid var(--theme-line); }
@media(max-width:600px) { .author-preferences-dialog { max-height:94vh; }.author-preference-heading,.author-preferences-toolbar,footer { align-items:flex-start; flex-direction:column; } }
</style>
