<script setup lang="ts">
import {
  BUILT_IN_REASONING_LEVELS,
  LONG_AGENT_IDS,
  LongAgentTeamSettingsInputSchema,
  SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_MAX_COUNT,
  SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH,
  type BuiltInReasoningLevel,
  type LongAgentId,
  type LongAgentTeamSettings,
  type LongAgentTeamSettingsInput,
  type ModelConfig,
  type ShortAgentSubagentDefinition,
  type ShortAgentSubagentModelMode,
  type SkillLibrary,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext,
  type ThinkingLevel
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";
import LoadSubagentFromSkillDialog from "./LoadSubagentFromSkillDialog.vue";
import PopupSelect, { type PopupSelectOption } from "./PopupSelect.vue";

const props = defineProps<{
  settings: LongAgentTeamSettings | null;
  models: readonly ModelConfig[];
  skills: readonly SkillLibrary[];
  preferredModelId: string | null;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  runtimeAvailable: boolean;
  authoringGenerating: boolean;
  authoringDraft: SubagentAuthoringDraft | null;
  authoringStatusText: string | null;
  authoringError: string | null;
}>();

const emit = defineEmits<{
  retry: [];
  save: [settings: LongAgentTeamSettingsInput];
  authoringGenerate: [payload: {
    context: SubagentAuthoringRuntimeContext;
    modelId: string;
  }];
  authoringStop: [];
  authoringReset: [];
}>();

const PARENT_AGENTS = [
  {
    id: "setting",
    label: "设定",
    description: "配置世界规则、人物关系、冲突审阅和设定研究等专项助手。"
  },
  {
    id: "plot_design",
    label: "剧情",
    description: "配置时间线、叙事顺序、章卡和伏笔等专项助手。"
  },
  {
    id: "draft",
    label: "写手",
    description: "配置章节计划、当前章写作、文风和调度检查等专项助手。"
  },
  {
    id: "continuity_ledger",
    label: "连续性",
    description: "配置事实核验、伏笔决策和提交审计等专项助手。"
  }
] as const satisfies readonly {
  id: LongAgentId;
  label: string;
  description: string;
}[];

const activeParentAgentId = ref<LongAgentId>(LONG_AGENT_IDS[0]);
const draftTeams = ref<LongAgentTeamSettingsInput["teams"]>([]);
const editingSubagentId = ref<string | null>(null);
const loadFromSkillOpen = ref(false);
let generatedIdSequence = 0;

const formDisabled = computed(
  () => props.loading || props.saving || !props.runtimeAvailable
);
const activeParentMeta = computed(
  () =>
    PARENT_AGENTS.find((agent) => agent.id === activeParentAgentId.value) ??
    PARENT_AGENTS[0]
);
const activeTeam = computed(() =>
  draftTeams.value.find(
    (team) => team.parentAgentId === activeParentAgentId.value
  )
);
const modelById = computed(
  () => new Map(props.models.map((model) => [model.id, model]))
);
const modelOptions = computed<PopupSelectOption[]>(() =>
  props.models.map((model) => ({ value: model.id, label: model.label }))
);

const THINKING_LABELS: Record<BuiltInReasoningLevel, string> = {
  minimal: "最低",
  low: "较低",
  medium: "标准",
  high: "深度",
  xhigh: "极高",
  max: "最高"
};

watch(
  () => props.settings,
  (settings) => {
    draftTeams.value = settings
      ? settings.teams.map((team) => ({
          parentAgentId: team.parentAgentId,
          subagents: team.subagents.map((definition) => ({
            ...definition,
            modelMode: definition.modelMode ?? "inherit",
            ...(definition.modelId ? { modelId: definition.modelId } : {}),
            ...(definition.thinkingLevel !== undefined
              ? { thinkingLevel: definition.thinkingLevel }
              : {}),
            ...(definition.temperature !== undefined
              ? { temperature: definition.temperature }
              : {})
          }))
        }))
      : [];
    if (
      settings &&
      !settings.teams.some(
        (team) => team.parentAgentId === activeParentAgentId.value
      )
    ) {
      activeParentAgentId.value = LONG_AGENT_IDS[0];
    }
    editingSubagentId.value = null;
  },
  { immediate: true, deep: true }
);

function selectParentAgent(parentAgentId: LongAgentId): void {
  activeParentAgentId.value = parentAgentId;
  editingSubagentId.value = null;
}

function thinkingLabel(level: ThinkingLevel): string {
  if (level === "off") return "关闭";
  return BUILT_IN_REASONING_LEVELS.includes(level as BuiltInReasoningLevel)
    ? THINKING_LABELS[level as BuiltInReasoningLevel]
    : `自定义（${level}）`;
}

function thinkingOptionsFor(
  definition: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = definition.modelId
    ? modelById.value.get(definition.modelId)
    : undefined;
  return [
    { value: "off", label: thinkingLabel("off") },
    ...(model?.thinkingLevelOptions ?? BUILT_IN_REASONING_LEVELS).map(
      (level) => ({ value: level, label: thinkingLabel(level) })
    )
  ];
}

function temperatureOptionsFor(
  definition: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = definition.modelId
    ? modelById.value.get(definition.modelId)
    : undefined;
  return (model?.temperatureOptions ?? [0.1, 0.7, 1]).map((temperature) => ({
    value: temperature,
    label: `温度 ${temperature}`
  }));
}

function applyModelDefaults(
  definition: ShortAgentSubagentDefinition,
  modelId: string | undefined
): void {
  const model = modelId ? modelById.value.get(modelId) : undefined;
  definition.thinkingLevel = model?.defaultThinkingLevel ?? "medium";
  definition.temperature = model?.temperatureOptions[1] ?? 0.7;
}

function setModelMode(
  definition: ShortAgentSubagentDefinition,
  mode: ShortAgentSubagentModelMode
): void {
  if (formDisabled.value) return;
  definition.modelMode = mode;
  if (mode !== "custom") {
    delete definition.modelId;
    delete definition.thinkingLevel;
    delete definition.temperature;
    return;
  }
  if (!definition.modelId && props.models[0]) {
    definition.modelId = props.models[0].id;
  }
  if (definition.thinkingLevel === undefined) {
    applyModelDefaults(definition, definition.modelId);
  }
}

function setModelId(
  definition: ShortAgentSubagentDefinition,
  modelId: string
): void {
  if (formDisabled.value) return;
  definition.modelId = modelId;
  applyModelDefaults(definition, modelId);
}

function setThinkingLevel(
  definition: ShortAgentSubagentDefinition,
  level: ThinkingLevel
): void {
  if (formDisabled.value) return;
  definition.thinkingLevel = level;
  if (level === "off") {
    const options = temperatureOptionsFor(definition);
    if (
      definition.temperature === undefined ||
      !options.some((option) => Object.is(option.value, definition.temperature))
    ) {
      definition.temperature = Number(
        options[1]?.value ?? options[0]?.value ?? 0.7
      );
    }
  }
}

function setTemperature(
  definition: ShortAgentSubagentDefinition,
  temperature: number
): void {
  if (formDisabled.value) return;
  definition.temperature = temperature;
}

function nextSubagentId(): string {
  generatedIdSequence += 1;
  return `long_subagent_${Date.now().toString(36)}_${generatedIdSequence.toString(36)}`;
}

function addSubagent(
  draft?: Partial<
    Pick<ShortAgentSubagentDefinition, "name" | "description" | "systemPrompt">
  >
): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  if (team.subagents.length >= SHORT_AGENT_SUBAGENT_MAX_COUNT) {
    uiMessage.warning(
      `每个长篇主智能体最多配置 ${SHORT_AGENT_SUBAGENT_MAX_COUNT} 个子智能体`
    );
    return;
  }
  const id = nextSubagentId();
  const index = team.subagents.length + 1;
  team.subagents.push({
    id,
    name: draft?.name?.trim() || `新子智能体 ${index}`,
    description: draft?.description?.trim() || "",
    systemPrompt: draft?.systemPrompt?.trim() || "",
    enabled: true,
    modelMode: "inherit"
  });
  editingSubagentId.value = id;
}

function openLoadFromSkill(): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  if (team.subagents.length >= SHORT_AGENT_SUBAGENT_MAX_COUNT) {
    uiMessage.warning(
      `每个长篇主智能体最多配置 ${SHORT_AGENT_SUBAGENT_MAX_COUNT} 个子智能体`
    );
    return;
  }
  if (!props.skills.length) {
    uiMessage.warning("技能库为空，请先在左侧技能库中添加条目");
    return;
  }
  loadFromSkillOpen.value = true;
}

function closeLoadFromSkill(): void {
  if (props.authoringGenerating) return;
  loadFromSkillOpen.value = false;
  emit("authoringReset");
}

function confirmLoadFromSkill(draft: SubagentAuthoringDraft): void {
  addSubagent(draft);
  loadFromSkillOpen.value = false;
  emit("authoringReset");
  uiMessage.success("已加入当前主智能体草稿；保存智能体团队后生效");
}

function subagentModelSummary(
  definition: ShortAgentSubagentDefinition
): string {
  if (definition.modelMode !== "custom") return "跟随主智能体";
  if (!definition.modelId) return "单独配置（未选模型）";
  const modelLabel =
    modelById.value.get(definition.modelId)?.label ?? definition.modelId;
  const thinking =
    definition.thinkingLevel !== undefined
      ? thinkingLabel(definition.thinkingLevel)
      : undefined;
  if (!thinking) return modelLabel;
  if (
    definition.thinkingLevel === "off" &&
    definition.temperature !== undefined
  ) {
    return `${modelLabel} · 关闭 · 温度 ${definition.temperature}`;
  }
  return `${modelLabel} · ${thinking}`;
}

function editSubagent(id: string): void {
  editingSubagentId.value = id;
}

function finishEditing(): void {
  editingSubagentId.value = null;
}

function removeSubagent(index: number): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  const [removed] = team.subagents.splice(index, 1);
  if (removed && editingSubagentId.value === removed.id) {
    editingSubagentId.value = null;
  }
  if (removed) {
    uiMessage.info("已从当前草稿移除；保存智能体团队后生效");
  }
}

function toggleSubagent(
  definition: ShortAgentSubagentDefinition,
  event: Event
): void {
  if (formDisabled.value) return;
  definition.enabled = (event.target as HTMLInputElement).checked;
}

function validationMessage(): string | null {
  for (const team of draftTeams.value) {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const definition of team.subagents) {
      if (!definition.name.trim()) return "子智能体名称不能为空";
      if (!definition.description.trim()) return "子智能体能力说明不能为空";
      if (!definition.systemPrompt.trim()) return "子智能体系统提示词不能为空";
      if (definition.modelMode === "custom") {
        if (!definition.modelId?.trim()) return "单独配置模型时必须选择模型";
        const model = modelById.value.get(definition.modelId);
        if (!model) {
          return `子智能体「${definition.name.trim() || "未命名"}」所选模型不存在，请重新选择`;
        }
        if (definition.thinkingLevel === undefined) {
          return "单独配置模型时必须选择思考等级";
        }
        if (
          definition.thinkingLevel !== "off" &&
          !model.thinkingLevelOptions.includes(definition.thinkingLevel)
        ) {
          return `子智能体「${definition.name.trim() || "未命名"}」的思考等级不在所选模型配置中`;
        }
        if (definition.thinkingLevel === "off") {
          if (definition.temperature === undefined) {
            return "思考等级关闭时必须选择温度";
          }
          if (!model.temperatureOptions.includes(definition.temperature)) {
            return `子智能体「${definition.name.trim() || "未命名"}」的温度不在所选模型配置中`;
          }
        }
      }
      const normalizedId = definition.id.toLocaleLowerCase();
      const normalizedName = definition.name.trim().toLocaleLowerCase();
      if (ids.has(normalizedId)) {
        return "同一主智能体下的子智能体 ID 不能重复";
      }
      if (names.has(normalizedName)) {
        return "同一主智能体下的子智能体名称不能重复";
      }
      ids.add(normalizedId);
      names.add(normalizedName);
    }
  }
  return null;
}

function saveSettings(): void {
  if (formDisabled.value) return;
  const message = validationMessage();
  if (message) {
    uiMessage.warning(message);
    return;
  }
  const parsed = LongAgentTeamSettingsInputSchema.safeParse({
    workspaceType: "long",
    teams: LONG_AGENT_IDS.map((parentAgentId) => {
      const team = draftTeams.value.find(
        (candidate) => candidate.parentAgentId === parentAgentId
      );
      return {
        parentAgentId,
        subagents: (team?.subagents ?? []).map((definition) => ({
          id: definition.id,
          name: definition.name.trim(),
          description: definition.description.trim(),
          systemPrompt: definition.systemPrompt.trim(),
          enabled: definition.enabled,
          modelMode: definition.modelMode ?? "inherit",
          ...(definition.modelMode === "custom" && definition.modelId
            ? {
                modelId: definition.modelId.trim(),
                ...(definition.thinkingLevel !== undefined
                  ? { thinkingLevel: definition.thinkingLevel }
                  : {}),
                ...(definition.thinkingLevel === "off" &&
                definition.temperature !== undefined
                  ? { temperature: definition.temperature }
                  : {})
              }
            : {})
        }))
      };
    })
  });
  if (!parsed.success) {
    uiMessage.warning(
      parsed.error.issues[0]?.message ?? "长篇智能体团队配置不完整"
    );
    return;
  }
  emit("save", parsed.data);
}
</script>

<template>
  <div v-if="loading" class="panel-state" aria-live="polite">
    正在加载长篇智能体团队设置…
  </div>
  <div v-else-if="loadError && !settings" class="panel-state panel-load-error" role="alert">
    <strong>长篇智能体团队设置未加载</strong>
    <p>{{ loadError }}</p>
    <button
      type="button"
      class="secondary-button"
      :disabled="loading"
      @click="emit('retry')"
    >
      重新加载
    </button>
  </div>
  <div v-else-if="!settings || !activeTeam" class="panel-state">
    暂无可用的长篇智能体团队设置。
  </div>

  <div v-else class="team-layout">
    <nav class="parent-agent-tabs" aria-label="长篇主智能体">
      <button
        v-for="parent in PARENT_AGENTS"
        :key="parent.id"
        type="button"
        class="parent-agent-tab"
        :class="{ 'is-active': parent.id === activeParentAgentId }"
        :aria-current="parent.id === activeParentAgentId ? 'page' : undefined"
        @click="selectParentAgent(parent.id)"
      >
        {{ parent.label }}
        <span>
          {{
            draftTeams.find((team) => team.parentAgentId === parent.id)
              ?.subagents.length ?? 0
          }}
        </span>
      </button>
    </nav>

    <div class="team-editor">
      <header class="team-heading">
        <div>
          <span>长篇主智能体</span>
          <h3>{{ activeParentMeta.label }}</h3>
          <p>{{ activeParentMeta.description }}</p>
        </div>
        <div class="team-heading-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="formDisabled || activeTeam.subagents.length >= SHORT_AGENT_SUBAGENT_MAX_COUNT"
            @click="openLoadFromSkill"
          >
            <AppIcon name="wand" :size="15" />
            从技能库加载
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="formDisabled || activeTeam.subagents.length >= SHORT_AGENT_SUBAGENT_MAX_COUNT"
            @click="addSubagent()"
          >
            <AppIcon name="plus" :size="15" />
            新增子智能体
          </button>
        </div>
      </header>

      <div v-if="!activeTeam.subagents.length" class="empty-team">
        <strong>还没有子智能体</strong>
        <p>新增后，主智能体会根据能力说明决定何时委派任务。</p>
      </div>

      <div v-else class="subagent-list">
        <article
          v-for="(definition, index) in activeTeam.subagents"
          :key="definition.id"
          class="subagent-card"
          :class="{ 'is-editing': editingSubagentId === definition.id }"
        >
          <header class="subagent-summary">
            <div class="subagent-copy">
              <div class="subagent-title-row">
                <strong>{{ definition.name || "未命名子智能体" }}</strong>
                <span :class="{ 'is-disabled': !definition.enabled }">
                  {{ definition.enabled ? "已启用" : "已停用" }}
                </span>
                <span class="model-badge">{{ subagentModelSummary(definition) }}</span>
              </div>
              <p>{{ definition.description || "补充能力说明，让主智能体知道何时调用它。" }}</p>
            </div>
            <label class="enable-toggle" :title="definition.enabled ? '停用' : '启用'">
              <input
                type="checkbox"
                :checked="definition.enabled"
                :disabled="formDisabled"
                :aria-label="`${definition.name || '子智能体'}启用状态`"
                @change="toggleSubagent(definition, $event)"
              />
            </label>
            <button
              type="button"
              class="icon-button"
              :disabled="formDisabled"
              :aria-label="`编辑${definition.name}`"
              @click="editSubagent(definition.id)"
            >
              <AppIcon name="edit" :size="15" />
            </button>
            <button
              type="button"
              class="icon-button is-danger"
              :disabled="formDisabled"
              :aria-label="`删除${definition.name}`"
              @click="removeSubagent(index)"
            >
              <AppIcon name="trash" :size="15" />
            </button>
          </header>

          <div v-if="editingSubagentId === definition.id" class="subagent-form">
            <div class="form-field">
              <span>模型配置</span>
              <div class="model-mode-options" role="radiogroup" aria-label="长篇子智能体模型配置">
                <label :class="{ 'is-selected': definition.modelMode !== 'custom' }">
                  <input
                    type="radio"
                    :name="`long-subagent-model-mode-${definition.id}`"
                    value="inherit"
                    :checked="definition.modelMode !== 'custom'"
                    :disabled="formDisabled"
                    @change="setModelMode(definition, 'inherit')"
                  />
                  跟随主智能体
                </label>
                <label :class="{ 'is-selected': definition.modelMode === 'custom' }">
                  <input
                    type="radio"
                    :name="`long-subagent-model-mode-${definition.id}`"
                    value="custom"
                    :checked="definition.modelMode === 'custom'"
                    :disabled="formDisabled"
                    @change="setModelMode(definition, 'custom')"
                  />
                  单独配置模型
                </label>
              </div>
              <div v-if="definition.modelMode === 'custom'" class="model-run-settings">
                <PopupSelect
                  class="model-select"
                  :model-value="definition.modelId ?? ''"
                  :options="modelOptions"
                  accessible-label="选择长篇子智能体模型"
                  placeholder="请选择模型"
                  size="large"
                  :disabled="formDisabled || modelOptions.length === 0"
                  :menu-min-width="260"
                  :menu-z-index="1200"
                  @update:model-value="setModelId(definition, String($event))"
                >
                  <template #prefix><AppIcon name="model" :size="14" /></template>
                </PopupSelect>
                <PopupSelect
                  class="model-select"
                  :model-value="definition.thinkingLevel ?? ''"
                  :options="thinkingOptionsFor(definition)"
                  accessible-label="选择长篇子智能体思考等级"
                  placeholder="请选择思考等级"
                  size="large"
                  :disabled="formDisabled || !definition.modelId"
                  :menu-min-width="200"
                  :menu-z-index="1200"
                  @update:model-value="setThinkingLevel(definition, String($event) as ThinkingLevel)"
                >
                  <template #prefix><AppIcon name="brain" :size="14" /></template>
                </PopupSelect>
                <PopupSelect
                  v-if="definition.thinkingLevel === 'off'"
                  class="model-select"
                  :model-value="definition.temperature ?? ''"
                  :options="temperatureOptionsFor(definition)"
                  accessible-label="选择长篇子智能体温度"
                  placeholder="请选择温度"
                  size="large"
                  :disabled="formDisabled || !definition.modelId"
                  :menu-min-width="180"
                  :menu-z-index="1200"
                  @update:model-value="setTemperature(definition, Number($event))"
                >
                  <template #prefix><AppIcon name="temperature" :size="14" /></template>
                </PopupSelect>
                <p v-if="modelOptions.length === 0" class="model-empty-hint">
                  暂无可用模型，请先在「模型配置」中添加。
                </p>
              </div>
            </div>
            <label class="form-field">
              <span>名称</span>
              <input
                v-model="definition.name"
                type="text"
                :maxlength="SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH"
                :disabled="formDisabled"
                placeholder="例如：连续性审阅"
              />
            </label>
            <label class="form-field">
              <span>能力说明</span>
              <textarea
                v-model="definition.description"
                class="description-input"
                :maxlength="SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH"
                :disabled="formDisabled"
                placeholder="说明擅长处理什么任务，供主智能体选择调用。"
              />
            </label>
            <label class="form-field">
              <span>系统提示词</span>
              <textarea
                v-model="definition.systemPrompt"
                class="prompt-input"
                :maxlength="SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH"
                :disabled="formDisabled"
                spellcheck="false"
                placeholder="定义子智能体的职责、工作方法和交接要求。"
              />
            </label>
            <div class="form-meta">
              <span>ID：<code>{{ definition.id }}</code></span>
              <button type="button" :disabled="formDisabled" @click="finishEditing">
                完成编辑
              </button>
            </div>
          </div>
        </article>
      </div>

      <footer class="panel-actions">
        <span>当前主智能体 {{ activeTeam.subagents.length }}/{{ SHORT_AGENT_SUBAGENT_MAX_COUNT }}</span>
        <button
          type="button"
          class="primary-button"
          :disabled="formDisabled"
          @click="saveSettings"
        >
          <AppIcon name="save" :size="15" />
          {{ saving ? "保存中…" : "保存智能体团队" }}
        </button>
      </footer>
    </div>
  </div>

  <LoadSubagentFromSkillDialog
    :open="loadFromSkillOpen"
    :parent-agent-id="activeParentAgentId"
    :parent-agent-label="activeParentMeta.label"
    :existing-subagent-names="(activeTeam?.subagents ?? []).map((item) => item.name)"
    :skills="skills"
    :models="models"
    :preferred-model-id="preferredModelId"
    :generating="authoringGenerating"
    :draft="authoringDraft"
    :status-text="authoringStatusText"
    :error="authoringError"
    @close="closeLoadFromSkill"
    @generate="emit('authoringGenerate', $event)"
    @stop="emit('authoringStop')"
    @confirm="confirmLoadFromSkill"
  />
</template>

<style scoped>
.panel-state,
.empty-team {
  padding: 42px 20px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-secondary);
  text-align: center;
}
.panel-load-error strong { display: block; margin-bottom: 6px; color: var(--text-primary); }
.panel-load-error p { margin: 0 0 14px; color: var(--text-secondary); }
.panel-load-error .secondary-button { margin: 0 auto; }
.empty-team strong { display: block; margin-bottom: 5px; color: var(--text-primary); }
.empty-team p,
.team-heading p,
.subagent-copy p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.892857rem;
  line-height: 1.55;
}

.team-layout {
  display: grid;
  grid-template-columns: 164px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.parent-agent-tabs {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-muted);
}
.parent-agent-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-weight: 590;
  cursor: pointer;
}
.parent-agent-tab:hover { background: var(--surface-hover); color: var(--text-primary); }
.parent-agent-tab.is-active { background: var(--surface-raised); color: var(--text-primary); box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.parent-agent-tab span { min-width: 22px; padding: 2px 6px; border-radius: 999px; background: var(--surface-selected); color: var(--text-tertiary); font-size: 0.75rem; text-align: center; }

.team-editor { min-width: 0; }
.team-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.team-heading > div > span { color: var(--text-tertiary); font-size: 0.785714rem; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }
.team-heading h3 { margin: 3px 0 4px; font-size: 1.28571rem; font-weight: 640; }
.team-heading-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

.secondary-button,
.primary-button,
.icon-button,
.form-meta button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.secondary-button { flex: none; padding: 8px 11px; background: var(--surface-raised); color: var(--text-primary); }
.secondary-button:hover:not(:disabled), .form-meta button:hover:not(:disabled) { background: var(--surface-hover); }
.primary-button {
  padding: 9px 14px;
  border-color: color-mix(in srgb, var(--theme-foreground) 18%, #15171a);
  background: color-mix(in srgb, var(--theme-foreground) 18%, #15171a);
  color: #fff;
}
.primary-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--theme-foreground) 12%, #0f1113);
  background: color-mix(in srgb, var(--theme-foreground) 12%, #0f1113);
}
button:disabled { cursor: not-allowed; opacity: 0.5; }

.subagent-list { display: flex; flex-direction: column; gap: 10px; }
.subagent-card { overflow: hidden; border: 1px solid var(--theme-line-soft); border-radius: 12px; background: var(--surface-raised); }
.subagent-card.is-editing { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.subagent-summary { display: flex; align-items: center; gap: 9px; padding: 13px 14px; }
.subagent-copy { flex: 1; min-width: 0; }
.subagent-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.subagent-title-row strong { overflow: hidden; font-size: 1rem; font-weight: 630; text-overflow: ellipsis; white-space: nowrap; }
.subagent-title-row span { flex: none; padding: 2px 7px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 0.714286rem; font-weight: 620; }
.subagent-title-row span.is-disabled { background: var(--surface-selected); color: var(--text-tertiary); }
.subagent-title-row .model-badge { max-width: 240px; overflow: hidden; background: var(--surface-selected); color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.subagent-copy p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-button { width: 32px; height: 32px; padding: 0; background: transparent; color: var(--text-secondary); }
.icon-button:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
.icon-button.is-danger:hover:not(:disabled) { border-color: var(--danger, #d65353); background: color-mix(in srgb, var(--danger, #d65353) 12%, transparent); color: var(--danger, #d65353); }

.enable-toggle input { position: relative; width: 38px; height: 22px; margin: 0; appearance: none; border-radius: 12px; background: var(--surface-selected); cursor: pointer; transition: background-color 150ms ease; }
.enable-toggle input::after { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface-main); box-shadow: 0 1px 3px rgb(0 0 0 / 0.22); content: ""; transition: transform 150ms ease; }
.enable-toggle input:checked { background: var(--accent); }
.enable-toggle input:checked::after { transform: translateX(16px); }

.subagent-form { display: grid; gap: 12px; padding: 15px; border-top: 1px solid var(--theme-line-soft); background: var(--surface-muted); }
.form-field { display: grid; gap: 6px; }
.form-field > span { color: var(--text-secondary); font-size: 0.821429rem; font-weight: 620; }
.form-field input,
.form-field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  outline: 0;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.55;
  resize: vertical;
}
.form-field input { min-height: 38px; padding: 8px 10px; }
.form-field textarea { padding: 9px 10px; }
.description-input { min-height: 76px; }
.prompt-input { min-height: 180px; font-family: var(--code-font); font-size: 0.892857rem; }
.form-field input:focus, .form-field textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.form-field input::placeholder, .form-field textarea::placeholder { color: var(--text-tertiary); }
.model-mode-options { display: flex; flex-wrap: wrap; gap: 8px; }
.model-mode-options label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 7px 12px;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  background: var(--surface-main);
  color: var(--text-secondary);
  font-size: 0.857143rem;
  font-weight: 600;
  cursor: pointer;
}
.model-mode-options label.is-selected { border-color: var(--accent); background: var(--accent-soft); color: var(--text-primary); }
.model-mode-options input { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; border: 0; clip: rect(0 0 0 0); white-space: nowrap; }
.model-select { width: 100%; }
.model-run-settings { display: grid; gap: 8px; }
.model-empty-hint { margin: 0; color: var(--text-tertiary); font-size: 0.785714rem; line-height: 1.45; }
.form-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--text-tertiary); font-size: 0.75rem; }
.form-meta code { overflow-wrap: anywhere; color: var(--text-secondary); }
.form-meta button { flex: none; padding: 7px 10px; background: var(--surface-raised); color: var(--text-primary); font-size: 0.821429rem; }

.panel-actions { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--theme-line-soft); }
.panel-actions > span { color: var(--text-tertiary); font-size: 0.821429rem; }

@media (max-width: 900px) {
  .team-layout { grid-template-columns: 1fr; }
  .parent-agent-tabs { position: static; flex-direction: row; overflow-x: auto; }
  .parent-agent-tab { flex: 1 0 104px; }
}

@media (max-width: 680px) {
  .team-heading, .panel-actions { align-items: stretch; flex-direction: column; }
  .secondary-button, .primary-button { width: 100%; }
  .subagent-summary { align-items: flex-start; flex-wrap: wrap; }
  .subagent-copy { flex-basis: calc(100% - 50px); }
  .form-meta { align-items: flex-start; flex-direction: column; }
}
</style>
