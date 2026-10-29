<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import PopupSelect from "./PopupSelect.vue";
import { uiMessage } from "../ui-feedback";
import { createTopicArchiveStorage, normalizeEvidenceUrl, MAX_TOPIC_RECORDS, MAX_EVIDENCE_PER_TOPIC, type TopicStatus, type EvidenceKind, type TopicRecord } from "../utils/topicArchiveStorage";
const statuses: Array<{ id: TopicStatus; label: string }> = [
  { id: "idea", label: "灵感" },
  { id: "selected", label: "待立项" },
  { id: "developing", label: "创作中" },
  { id: "archived", label: "已归档" }
];
const evidenceKinds: Array<{ id: EvidenceKind; label: string }> = [
  { id: "source", label: "外部来源" },
  { id: "author", label: "作者判断" },
  { id: "inference", label: "推断/待核实" }
];
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emptyDraft = () => ({ title: "", genre: "", audience: "", promise: "", conflict: "", status: "idea" as TopicStatus });

type BookLink = NonNullable<TopicRecord["bookLink"]>;
const props = defineProps<{ open: boolean; bookOptions?: BookLink[] }>();
const emit = defineEmits<{ close: []; createBook: [topic: TopicRecord]; openBook: [book: BookLink] }>();
const archiveStorage = createTopicArchiveStorage(localStorage);
const records = ref<TopicRecord[]>([]);
const search = ref("");
const selectedId = ref<string | null>(records.value[0]?.id ?? null);
const editing = ref(false);
const bindingBookId = ref("");
const draft = ref(emptyDraft());
const emptyEvidence = () => ({ kind: "source" as EvidenceKind, label: "", url: "", observedAt: new Date().toISOString().slice(0, 10), note: "" });
const evidenceDraft = ref(emptyEvidence());
const draftBaseline = ref(JSON.stringify(emptyDraft()));
const dialogElement = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
const selectedRecord = computed(() => records.value.find(({ id }) => id === selectedId.value) ?? null);
const filteredRecords = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  return records.value.filter((record) => !term || [record.title, record.genre, record.audience, record.promise, record.conflict, ...record.evidence.map((item) => `${item.label} ${item.note}`)].some((value) => value.toLocaleLowerCase().includes(term)));
});
const visibleRecords = computed(() => filteredRecords.value.slice(0, 200));

function commit(next: TopicRecord[]): boolean {
  try {
    archiveStorage.write(next);
    records.value = next;
    return true;
  } catch {
    uiMessage.error("选题档案保存失败，请检查本机存储或重新打开档案。未保存的输入仍保留。");
    return false;
  }
}
const hasDraft = computed(() => (editing.value && JSON.stringify(draft.value) !== draftBaseline.value) || Boolean(evidenceDraft.value.label || evidenceDraft.value.url || evidenceDraft.value.note));
function discardDraft(): boolean {
  return !hasDraft.value || window.confirm("输入尚未保存，确定放弃这些输入吗？");
}
function close(): void { if (discardDraft()) emit("close"); }
function selectRecord(id: string): void {
  if (!discardDraft()) return;
  selectedId.value = id;
  editing.value = false;
  evidenceDraft.value = emptyEvidence();
}
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") { event.stopPropagation(); close(); return; }
  if (event.key !== "Tab" || document.querySelector('.popup-select-menu')) return;
  const elements = Array.from(dialogElement.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, [tabindex="0"]') ?? []).filter((item) => item.getClientRects().length);
  const first = elements[0];
  const last = elements.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogElement.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(() => props.open, (open) => {
  if (open) {
    try { records.value = archiveStorage.read(); selectedId.value = records.value[0]?.id ?? null; }
    catch (error) { uiMessage.error(error instanceof Error ? error.message : "选题档案读取失败，原记录已保留。"); }
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void nextTick(() => dialogElement.value?.focus());
  } else {
    previousFocus?.focus();
    previousFocus = null;
    editing.value = false;
    evidenceDraft.value = emptyEvidence();
  }
}, { immediate: true });
onBeforeUnmount(() => previousFocus?.focus());

function startCreate(): void {
  if (!discardDraft()) return;
  selectedId.value = null;
  draft.value = emptyDraft();
  editing.value = true;
  draftBaseline.value = JSON.stringify(draft.value);
  evidenceDraft.value = emptyEvidence();
}
function startEdit(record: TopicRecord): void {
  if (!discardDraft()) return;
  selectedId.value = record.id;
  draft.value = { title: record.title, genre: record.genre, audience: record.audience, promise: record.promise, conflict: record.conflict, status: record.status };
  editing.value = true;
  draftBaseline.value = JSON.stringify(draft.value);
  evidenceDraft.value = emptyEvidence();
}
function saveRecord(): void {
  const title = draft.value.title.trim();
  if (!title) { uiMessage.warning("请先填写选题名称。"); return; }
  if (!selectedRecord.value && records.value.length >= MAX_TOPIC_RECORDS) { uiMessage.warning(`最多保存 ${MAX_TOPIC_RECORDS} 个选题，请先删除不再需要的记录；归档不会释放名额。`); return; }
  const now = new Date().toISOString();
  const current = selectedRecord.value;
  const saved: TopicRecord = { ...current, id: current?.id ?? makeId(), ...draft.value, title, updatedAt: now, evidence: current?.evidence ?? [] };
  if (!commit(current ? records.value.map((item) => item.id === current.id ? saved : item) : [saved, ...records.value])) return;
  selectedId.value = saved.id;
  editing.value = false;
  uiMessage.success("选题档案已保存");
}
function addEvidence(): void {
  if (!selectedRecord.value) { uiMessage.warning("请先保存选题，再添加证据。"); return; }
  if (selectedRecord.value.evidence.length >= MAX_EVIDENCE_PER_TOPIC) { uiMessage.warning(`每个选题最多保存 ${MAX_EVIDENCE_PER_TOPIC} 条证据。`); return; }
  if (!evidenceDraft.value.label.trim() && !evidenceDraft.value.note.trim()) { uiMessage.warning("证据至少需要来源名称或观察内容。"); return; }
  const rawUrl = evidenceDraft.value.url.trim();
  const safeUrl = normalizeEvidenceUrl(rawUrl);
  if (rawUrl && !safeUrl) { uiMessage.warning("来源链接必须为不含账号或密码的 HTTP(S) 地址。"); return; }
  const current = selectedRecord.value;
  const evidence = [...current.evidence, { ...evidenceDraft.value, id: makeId(), label: evidenceDraft.value.label.trim(), url: safeUrl, note: evidenceDraft.value.note.trim() }];
  if (!commit(records.value.map((item) => item.id === current.id ? { ...item, evidence, updatedAt: new Date().toISOString() } : item))) return;
  evidenceDraft.value = emptyEvidence();
}
function removeEvidence(id: string): void {
  if (!selectedRecord.value) return;
  const current = selectedRecord.value;
  commit(records.value.map((item) => item.id === current.id ? { ...item, evidence: item.evidence.filter((proof) => proof.id !== id), updatedAt: new Date().toISOString() } : item));
}
function removeRecord(record: TopicRecord): void {
  if (!window.confirm(`确定删除选题“${record.title}”及其证据记录吗？此操作不能撤销。`)) return;
  if (!commit(records.value.filter(({ id }) => id !== record.id))) return;
  selectedId.value = records.value[0]?.id ?? null;
  editing.value = false;
  evidenceDraft.value = emptyEvidence();
}
function bindBook(): void {
  const book = props.bookOptions?.find((item) => `${item.workspaceType}:${item.bookId}` === bindingBookId.value);
  const current = selectedRecord.value;
  if (!book || !current || !discardDraft()) return;
  if (commit(records.value.map((item) => item.id === current.id ? { ...item, bookLink: book, status: "developing", updatedAt: new Date().toISOString() } : item))) {
    uiMessage.success("选题已关联作品");
  }
}
function createFromTopic(): void {
  if (selectedRecord.value && discardDraft()) emit("createBook", selectedRecord.value);
}
function openBookFromTopic(): void {
  if (selectedRecord.value?.bookLink && discardDraft()) emit("openBook", selectedRecord.value.bookLink);
}
function unbindBook(): void {
  const current = selectedRecord.value;
  if (!current || !window.confirm("解除作品关联？选题和作品内容均保留。")) return;
  commit(records.value.map((item) => { if (item.id !== current.id) return item; const { bookLink: _link, ...rest } = item; return rest; }));
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop topic-archive-backdrop" @mousedown.self="close">
      <section ref="dialogElement" class="workspace-dialog topic-archive-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="topic-archive-title" @keydown="handleKeydown">
        <header class="topic-archive-header">
          <div><span class="dialog-eyebrow">创作空间 · 选题</span><h2 id="topic-archive-title">选题档案</h2><p>保存故事方向、读者承诺与证据来源。仅存本机，不会自动联网或调用模型。</p></div>
          <button class="dialog-close" type="button" aria-label="关闭选题档案" @click="close">×</button>
        </header>
        <div class="topic-archive-toolbar">
          <label class="topic-archive-search"><span>搜索档案</span><input v-model="search" type="search" placeholder="名称、题材、证据或观察" /></label>
          <button class="dialog-primary-button" type="button" @click="startCreate">＋ 新建选题</button>
        </div>
        <p class="topic-archive-boundary">外部来源、作者判断和模型推断分开标注；本工具不会伪称实时市场调研。</p>
        <div class="topic-archive-layout">
          <nav class="topic-archive-list" aria-label="选题列表">
            <p v-if="!filteredRecords.length" class="topic-archive-empty">{{ records.length ? '没有匹配的选题。' : '还没有选题，先保存一个灵感。' }}</p>
            <button v-for="record in visibleRecords" :key="record.id" class="topic-archive-record" :class="{ 'is-active': selectedId === record.id && !editing }" type="button" @click="selectRecord(record.id)">
              <strong>{{ record.title }}</strong><span>{{ record.genre || '未分类' }} · {{ statuses.find(({ id }) => id === record.status)?.label }}</span><small>{{ record.evidence.length }} 条证据</small>
            </button>
            <p v-if="filteredRecords.length > visibleRecords.length" class="topic-archive-empty">仅显示前 200 条，请缩小搜索范围。</p>
          </nav>
          <div class="topic-archive-detail">
            <form v-if="editing" class="topic-archive-form" novalidate @submit.prevent="saveRecord">
              <label>选题名称<input v-model="draft.title" maxlength="160" required placeholder="例如：被遗忘的城市档案员" /></label>
              <div class="topic-archive-form-grid">
                <label>题材<input v-model="draft.genre" maxlength="120" placeholder="悬疑 / 奇幻 / 现实" /></label>
                <label>目标读者<input v-model="draft.audience" maxlength="240" placeholder="想吸引的读者及阅读场景" /></label>
              </div>
              <label>读者承诺<textarea v-model="draft.promise" maxlength="2000" rows="3" placeholder="读者会持续期待什么体验？" /></label>
              <label>核心冲突<textarea v-model="draft.conflict" maxlength="2000" rows="3" placeholder="主角目标、阻力与失败代价" /></label>
              <label>推进状态<PopupSelect :model-value="draft.status" :options="statuses.map(({ id, label }) => ({ value: id, label }))" accessible-label="选题推进状态" :menu-z-index="1400" @update:model-value="draft.status = $event as TopicStatus" /></label>
              <div class="topic-archive-form-actions"><button class="dialog-secondary-button" type="button" @click="discardDraft() && (editing = false)">取消</button><button class="dialog-primary-button" type="submit">保存档案</button></div>
            </form>
            <template v-else-if="selectedRecord">
              <div class="topic-archive-record-header"><div><span class="dialog-eyebrow">{{ statuses.find(({ id }) => id === selectedRecord?.status)?.label }}</span><h3>{{ selectedRecord.title }}</h3></div><div class="topic-archive-record-actions"><button class="dialog-secondary-button" type="button" @click="startEdit(selectedRecord)">编辑</button><button class="dialog-secondary-button" type="button" @click="removeRecord(selectedRecord)">删除</button></div></div>
              <dl class="topic-archive-facts"><div><dt>题材</dt><dd>{{ selectedRecord.genre || '未填写' }}</dd></div><div><dt>目标读者</dt><dd>{{ selectedRecord.audience || '未填写' }}</dd></div><div><dt>读者承诺</dt><dd>{{ selectedRecord.promise || '未填写' }}</dd></div><div><dt>核心冲突</dt><dd>{{ selectedRecord.conflict || '未填写' }}</dd></div></dl>
              <section class="topic-book-link" aria-label="关联作品">
                <template v-if="selectedRecord.bookLink">
                  <p>已关联：{{ selectedRecord.bookLink.title }}</p>
                  <button class="dialog-primary-button" type="button" data-topic-open-book @click="openBookFromTopic">进入本书策划</button>
                  <button class="dialog-secondary-button" type="button" @click="unbindBook">解除关联</button>
                </template>
                <template v-else>
                  <button class="dialog-primary-button" type="button" data-topic-create-book @click="createFromTopic">用此选题创建书籍</button>
                  <PopupSelect v-model="bindingBookId" :options="(bookOptions ?? []).map((book) => ({ value: `${book.workspaceType}:${book.bookId}`, label: book.title }))" accessible-label="关联已有作品" placeholder="或选择已有作品" :menu-z-index="1400" />
                  <button class="dialog-secondary-button" type="button" :disabled="!bindingBookId" @click="bindBook">关联作品</button>
                </template>
              </section>
              <section class="topic-archive-evidence"><div class="topic-archive-section-heading"><h4>证据与判断</h4><span>{{ selectedRecord.evidence.length }} 条</span></div>
                <article v-for="proof in selectedRecord.evidence" :key="proof.id" class="topic-archive-proof"><div><strong>{{ proof.label || evidenceKinds.find(({ id }) => id === proof.kind)?.label }}</strong><span>{{ evidenceKinds.find(({ id }) => id === proof.kind)?.label }} · {{ proof.observedAt || '未注明日期' }}</span></div><p>{{ proof.note || '无观察记录' }}</p><a v-if="proof.url" :href="proof.url" target="_blank" rel="noreferrer">打开来源 ↗</a><button type="button" aria-label="移除此证据" @click="removeEvidence(proof.id)">移除</button></article>
                <form class="topic-archive-evidence-form" @submit.prevent="addEvidence"><h5>添加证据</h5><div class="topic-archive-form-grid"><label>类型<PopupSelect :model-value="evidenceDraft.kind" :options="evidenceKinds.map(({ id, label }) => ({ value: id, label }))" accessible-label="选题证据类型" :menu-z-index="1400" @update:model-value="evidenceDraft.kind = $event as EvidenceKind" /></label><label>日期<input v-model="evidenceDraft.observedAt" type="date" /></label></div><label>来源/标签<input v-model="evidenceDraft.label" maxlength="200" placeholder="平台榜单名称、作者经验等" /></label><label>来源链接<input v-model="evidenceDraft.url" maxlength="1000" type="url" placeholder="https://…（可留空）" /></label><label>观察记录<textarea v-model="evidenceDraft.note" maxlength="2000" rows="2" placeholder="记录观察到的信号，不等同于结论" /></label><button class="dialog-secondary-button" type="submit">添加到选题</button></form>
              </section>
            </template>
            <div v-else class="topic-archive-empty-detail">创建或选择一个选题，记录方向、承诺、冲突和证据。</div>
          </div>
        </div>
        <footer class="topic-archive-footer"><span>{{ records.length }} 个选题 · 本机存储</span><button class="dialog-secondary-button" type="button" @click="close">完成</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.topic-archive-backdrop { z-index: 1300; }
.topic-archive-dialog { width: min(1060px, calc(100vw - 48px)); max-height: min(88vh, 900px); display: flex; flex-direction: column; overflow: hidden; }
.topic-archive-dialog .dialog-primary-button { background:var(--text-primary); color:var(--surface-main); white-space:nowrap; }
.topic-archive-search { min-width:0; }
.topic-archive-search > span { flex-shrink:0; white-space:nowrap; }
.topic-archive-search > input { min-width:0; }
.topic-archive-dialog .topic-archive-proof button { float:none; display:block; margin-left:auto; }
.topic-archive-proof p,.topic-archive-proof a,.topic-archive-record strong { overflow-wrap:anywhere; }
.topic-archive-header, .topic-archive-toolbar, .topic-archive-footer, .topic-archive-record-header, .topic-archive-section-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.topic-archive-header { padding:24px 28px 16px; border-bottom:1px solid var(--theme-line); }
.topic-archive-header h2 { margin:5px 0; }.topic-archive-header p,.topic-archive-boundary { color:var(--text-secondary); }
.topic-archive-toolbar { padding:14px 28px 4px; }.topic-archive-search { flex:1; display:flex; align-items:center; gap:12px; }
.topic-archive-search input,.topic-archive-form input,.topic-archive-form textarea,.topic-archive-form select,.topic-archive-evidence-form input,.topic-archive-evidence-form textarea,.topic-archive-evidence-form select { width:100%; border:1px solid var(--theme-line); border-radius:8px; padding:9px 11px; color:var(--text-primary); background:var(--surface-main); }
.topic-archive-boundary { margin:6px 28px 12px; font-size:12px; }.topic-archive-layout { display:grid; grid-template-columns:minmax(220px, 0.8fr) minmax(0, 1.8fr); min-height:0; flex:1; border-top:1px solid var(--theme-line); }
.topic-archive-list { overflow:auto; padding:12px; border-right:1px solid var(--theme-line); }.topic-archive-record { display:grid; width:100%; gap:5px; padding:12px; text-align:left; border:1px solid transparent; border-radius:9px; color:var(--text-primary); background:transparent; cursor:pointer; }.topic-archive-record.is-active { border-color:var(--accent); background:var(--surface-selected); }.topic-archive-record span,.topic-archive-record small { color:var(--text-secondary); }
.topic-archive-detail { overflow:auto; padding:20px 24px; }.topic-archive-form,.topic-archive-evidence-form { display:grid; gap:12px; }.topic-archive-form label,.topic-archive-evidence-form label { display:grid; gap:6px; color:var(--text-secondary); }.topic-archive-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }.topic-archive-form textarea,.topic-archive-evidence-form textarea { resize:vertical; }.topic-archive-form-actions,.topic-archive-record-actions { display:flex; justify-content:flex-end; gap:8px; }
.topic-archive-record-header h3 { margin:5px 0 18px; }.topic-archive-facts { display:grid; gap:12px; }.topic-archive-facts div { border-bottom:1px solid var(--theme-line); padding-bottom:10px; }.topic-archive-facts dt { color:var(--text-secondary); font-size:12px; }.topic-archive-facts dd { margin:4px 0 0; white-space:pre-wrap; }.topic-archive-evidence { margin-top:22px; }.topic-archive-evidence h4 { margin:0; }.topic-archive-proof { position:relative; margin:10px 0; padding:12px; border:1px solid var(--theme-line); border-radius:9px; }.topic-archive-proof div { display:flex; justify-content:space-between; gap:8px; }.topic-archive-proof span,.topic-archive-proof a { color:var(--text-secondary); font-size:12px; }.topic-archive-proof p { white-space:pre-wrap; }.topic-archive-proof button { float:right; }.topic-archive-evidence-form { margin-top:18px; padding:14px; border-radius:10px; background:var(--surface-subtle, var(--surface-main)); }.topic-archive-empty,.topic-archive-empty-detail { padding:24px; color:var(--text-secondary); text-align:center; }.topic-archive-error { padding:0 28px; color:var(--color-danger, #b33); }.topic-archive-footer { padding:12px 28px; border-top:1px solid var(--theme-line); color:var(--text-secondary); }
@media(max-width:720px) { .topic-archive-dialog { width:calc(100vw - 20px); max-height:94vh; }.topic-archive-layout { grid-template-columns:1fr; grid-template-rows:minmax(130px, 0.5fr) minmax(0, 1.5fr); }.topic-archive-list { border-right:0; border-bottom:1px solid var(--theme-line); }.topic-archive-form-grid { grid-template-columns:1fr; }.topic-archive-toolbar { align-items:stretch; flex-direction:column; } }
</style>
