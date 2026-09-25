<script setup lang="ts">
import {
  SUBAGENT_AUTHORING_MAX_SKILLS,
  SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS,
  SUBAGENT_AUTHORING_SKILL_BODY_MAX_LENGTH,
  type SkillLibrary,
  type SkillStageId,
  type SubagentAuthoringDraft,
  type SubagentAuthoringOutputMode,
  type SubagentAuthoringParentAgentId,
  type SubagentAuthoringRuntimeContext,
} from "@deepwrite/contracts";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import PopupSelect, { type PopupSelectOption } from "./PopupSelect.vue";

export interface SubagentAuthoringSkillOption {
  id: string;
  libraryId: string;
  entryId: string;
  libraryTitle: string;
  title: string;
  body: string;
  stageId: SkillStageId;
}

const props = defineProps<{
  open: boolean;
  parentAgentId: SubagentAuthoringParentAgentId;
  parentAgentLabel: string;
  existingSubagentNames: readonly string[];
  skills: readonly SkillLibrary[];
  models: readonly { id: string; label: string }[];
  preferredModelId: string | null;
  generating: boolean;
  draft: SubagentAuthoringDraft | null;
  statusText: string | null;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  generate: [payload: {
    context: SubagentAuthoringRuntimeContext;
    modelId: string;
  }];
  stop: [];
  confirm: [draft: SubagentAuthoringDraft];
}>();

const selectedSkillIds = ref<string[]>([]);
const showAllStages = ref(false);
const outputMode = ref<SubagentAuthoringOutputMode>("handoff");
const modelId = ref("");
const draftName = ref("");
const draftDescription = ref("");
const draftSystemPrompt = ref("");

watch(
  () => [props.open, props.error] as const,
  ([open, error], previous) => {
    if (open && error && (!previous || !previous[0] || previous[1] !== error)) {
      uiMessage.error(error);
    }
  }
);

function skillStageForParent(
  parentAgentId: SubagentAuthoringParentAgentId
): SkillStageId | null {
  if (parentAgentId === "expert_draft_coordinator" || parentAgentId === "draft") {
    return "draft";
  }
  if (parentAgentId === "character_design" || parentAgentId === "plot_design") {
    return parentAgentId;
  }
  return null;
}

const skillOptions = computed<SubagentAuthoringSkillOption[]>(() => {
  const preferredStage = skillStageForParent(props.parentAgentId);
  const options: SubagentAuthoringSkillOption[] = [];
  for (const library of props.skills) {
    for (const entry of library.entries) {
      if (!entry.body.trim()) continue;
      if (preferredStage && !showAllStages.value && entry.stageId !== preferredStage) {
        continue;
      }
      options.push({
        id: `skill:${library.id}:${entry.id}`,
        libraryId: library.id,
        entryId: entry.id,
        libraryTitle: library.title,
        title: entry.title,
        body: entry.body.slice(0, SUBAGENT_AUTHORING_SKILL_BODY_MAX_LENGTH),
        stageId: entry.stageId
      });
    }
  }
  return options;
});

const modelOptions = computed<PopupSelectOption[]>(() =>
  props.models.map((model) => ({ value: model.id, label: model.label }))
);

const selectedSkills = computed(() =>
  skillOptions.value.filter((skill) => selectedSkillIds.value.includes(skill.id))
);

const canGenerate = computed(
  () =>
    !props.generating &&
    selectedSkills.value.length > 0 &&
    Boolean(modelId.value) &&
    Boolean(outputMode.value)
);

const canConfirm = computed(
  () =>
    !props.generating &&
    draftName.value.trim() &&
    draftDescription.value.trim() &&
    draftSystemPrompt.value.trim()
);

function toggleSkill(skillId: string): void {
  if (props.generating) return;
  const index = selectedSkillIds.value.indexOf(skillId);
  if (index >= 0) {
    selectedSkillIds.value = selectedSkillIds.value.filter((id) => id !== skillId);
    return;
  }
  if (selectedSkillIds.value.length >= SUBAGENT_AUTHORING_MAX_SKILLS) {
    uiMessage.warning(`一次最多选择 ${SUBAGENT_AUTHORING_MAX_SKILLS} 条技能`);
    return;
  }
  selectedSkillIds.value = [...selectedSkillIds.value, skillId];
}

function requestClose(): void {
  if (props.generating) {
    uiMessage.warning("生成进行中，请先停止后再关闭");
    return;
  }
  emit("close");
}

function generate(): void {
  if (!canGenerate.value) {
    if (!selectedSkills.value.length) uiMessage.warning("请先选择至少一条技能");
    else if (!modelId.value) uiMessage.warning("请选择用于生成的模型");
    return;
  }
  emit("generate", {
    modelId: modelId.value,
    context: {
      parentAgentId: props.parentAgentId,
      parentAgentLabel: props.parentAgentLabel,
      outputMode: outputMode.value,
      skills: selectedSkills.value.map((skill) => ({
        id: skill.id,
        title: skill.title,
        libraryTitle: skill.libraryTitle,
        body: skill.body
      })),
      existingSubagentNames: [...props.existingSubagentNames]
    }
  });
}

function confirmDraft(): void {
  if (!canConfirm.value) {
    uiMessage.warning("请先生成并填写完整的子智能体草稿");
    return;
  }
  emit("confirm", {
    name: draftName.value.trim(),
    description: draftDescription.value.trim(),
    systemPrompt: draftSystemPrompt.value.trim()
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") requestClose();
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    selectedSkillIds.value = [];
    showAllStages.value = skillStageForParent(props.parentAgentId) === null;
    outputMode.value = "handoff";
    modelId.value =
      (props.preferredModelId &&
      props.models.some((model) => model.id === props.preferredModelId)
        ? props.preferredModelId
        : props.models[0]?.id) ?? "";
    draftName.value = "";
    draftDescription.value = "";
    draftSystemPrompt.value = "";
  }
);

watch(
  () => props.draft,
  (draft) => {
    if (!draft) return;
    draftName.value = draft.name;
    draftDescription.value = draft.description;
    draftSystemPrompt.value = draft.systemPrompt;
  }
);

onMounted(() => document.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="requestClose">
      <section
        class="workspace-dialog load-subagent-skill-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-subagent-skill-title"
      >
        <header>
          <div>
            <span class="dialog-eyebrow">智能体团队 · 技能转子智能体</span>
            <h2 id="load-subagent-skill-title">从技能库加载</h2>
            <p>
              为「{{ parentAgentLabel }}」从技能库生成子智能体草稿。请先确认产出方式，再由带工具的小智能体整理提示词。
            </p>
          </div>
          <button
            class="dialog-close"
            type="button"
            aria-label="关闭"
            :disabled="generating"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <div class="dialog-content authoring-body">
          <section class="authoring-section">
            <div class="section-heading">
              <strong>1. 选择技能</strong>
              <label class="show-all">
                <input v-model="showAllStages" type="checkbox" :disabled="generating" />
                查看全部阶段
              </label>
            </div>
            <p class="section-hint">
              默认只显示匹配当前主智能体阶段的条目。子智能体运行时不能加载技能，技能要点会写入系统提示词。
            </p>
            <div v-if="!skillOptions.length" class="empty-skills">
              当前没有可加载的技能条目。请先在技能库中补充正文，或勾选「查看全部阶段」。
            </div>
            <ul v-else class="skill-list">
              <li v-for="skill in skillOptions" :key="skill.id">
                <label>
                  <input
                    type="checkbox"
                    :checked="selectedSkillIds.includes(skill.id)"
                    :disabled="generating"
                    @change="toggleSkill(skill.id)"
                  />
                  <span>
                    <strong>{{ skill.title }}</strong>
                    <em>{{ skill.libraryTitle }}</em>
                  </span>
                </label>
              </li>
            </ul>
          </section>

          <section class="authoring-section">
            <strong>2. 确认产出方式</strong>
            <p class="section-hint">
              这决定生成的系统提示词如何约束子智能体：直接改文档，还是只把结论交回主智能体。
            </p>
            <div class="mode-options" role="radiogroup" aria-label="产出方式">
              <label
                v-for="mode in (['write', 'handoff'] as const)"
                :key="mode"
                :class="{ 'is-selected': outputMode === mode }"
              >
                <input
                  v-model="outputMode"
                  type="radio"
                  name="subagent-output-mode"
                  :value="mode"
                  :disabled="generating"
                />
                <span>
                  <strong>{{ SUBAGENT_AUTHORING_OUTPUT_MODE_LABELS[mode] }}</strong>
                  <em v-if="mode === 'write'">子智能体用写入 / 替换工具改文档，交接摘要只说明改动。</em>
                  <em v-else>子智能体只交回结论与要点，不直接改文档。</em>
                </span>
              </label>
            </div>
          </section>

          <section class="authoring-section">
            <strong>3. 生成草稿</strong>
            <label class="form-field">
              <span>生成模型</span>
              <PopupSelect
                :model-value="modelId"
                :options="modelOptions"
                accessible-label="生成模型"
                :disabled="generating || !modelOptions.length"
                placeholder="选择模型"
                @update:model-value="modelId = String($event)"
              />
            </label>
            <div class="generate-row">
              <button
                type="button"
                class="primary-button"
                :disabled="!canGenerate"
                @click="generate"
              >
                {{ generating ? "生成中…" : "生成子智能体草稿" }}
              </button>
              <button
                type="button"
                class="secondary-button authoring-stop-button"
                :class="{ 'is-placeholder': !generating }"
                :disabled="!generating"
                :aria-hidden="!generating"
                @click="emit('stop')"
              >
                停止
              </button>
            </div>
            <div class="authoring-status-slot" aria-live="polite">
              <p v-if="statusText && !error" class="status-text" :title="statusText">
                {{ statusText }}
              </p>
            </div>
          </section>

          <section v-if="draft || draftName" class="authoring-section draft-section">
            <strong>4. 确认草稿</strong>
            <label class="form-field">
              <span>名称</span>
              <input v-model="draftName" type="text" :disabled="generating" maxlength="80" />
            </label>
            <label class="form-field">
              <span>能力说明</span>
              <textarea
                v-model="draftDescription"
                rows="3"
                :disabled="generating"
                maxlength="1000"
              />
            </label>
            <label class="form-field">
              <span>系统提示词</span>
              <textarea
                v-model="draftSystemPrompt"
                rows="10"
                :disabled="generating"
                maxlength="20000"
              />
            </label>
          </section>
        </div>

        <footer class="dialog-actions">
          <button type="button" class="secondary-button" :disabled="generating" @click="requestClose">
            取消
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="!canConfirm"
            @click="confirmDraft"
          >
            加入团队草稿
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.load-subagent-skill-dialog {
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: var(--surface-raised);
  color: var(--text-primary);
  border: 1px solid var(--theme-line);
  border-radius: 16px;
  overflow: hidden;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--text-primary) 28%, transparent);
  padding: 24px;
}

header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 12px;
  border-bottom: 1px solid var(--theme-line-soft);
}

.dialog-eyebrow {
  display: block;
  color: var(--text-tertiary);
  font-size: 12px;
  margin-bottom: 4px;
}

header h2 {
  margin: 0;
  font-size: 1.25rem;
}

header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 0.92rem;
  line-height: 1.45;
}

.dialog-close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.authoring-body {
  overflow: auto;
  padding: 16px 22px;
  display: grid;
  gap: 18px;
}

.authoring-section {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-muted);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.section-hint,
.status-text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.45;
}

.authoring-stop-button.is-placeholder {
  visibility: hidden;
}

.generate-row .primary-button {
  min-width: 10.5rem;
}

.authoring-status-slot {
  height: 2.65rem;
  overflow: hidden;
}

.authoring-status-slot .status-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.show-all {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.empty-skills {
  padding: 16px;
  border-radius: 10px;
  background: var(--surface-main);
  color: var(--text-secondary);
}

.skill-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
  max-height: 180px;
  overflow: auto;
}

.skill-list label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-main);
  border: 1px solid var(--theme-line-soft);
  cursor: pointer;
}

.skill-list strong {
  display: block;
}

.skill-list em {
  display: block;
  margin-top: 2px;
  font-style: normal;
  color: var(--text-tertiary);
  font-size: 0.84rem;
}

.mode-options {
  display: grid;
  gap: 8px;
}

.mode-options label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--theme-line-soft);
  background: var(--surface-main);
  cursor: pointer;
}

.mode-options label.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.mode-options strong,
.mode-options em {
  display: block;
}

.mode-options em {
  margin-top: 4px;
  font-style: normal;
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.form-field {
  display: grid;
  gap: 6px;
}

.form-field > span {
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.form-field input,
.form-field textarea {
  width: 100%;
  border: 1px solid var(--theme-line);
  border-radius: 10px;
  background: var(--surface-main);
  color: var(--text-primary);
  padding: 10px 12px;
  font: inherit;
  resize: vertical;
}

.generate-row,
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-actions {
  padding: 14px 22px 18px;
  border-top: 1px solid var(--theme-line-soft);
}

.primary-button,
.secondary-button {
  border-radius: 10px;
  padding: 8px 14px;
  font: inherit;
  cursor: pointer;
}

.primary-button {
  border: none;
  background: var(--text-primary);
  color: var(--surface-main);
}

.primary-button:disabled,
.secondary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.secondary-button {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}
</style>
