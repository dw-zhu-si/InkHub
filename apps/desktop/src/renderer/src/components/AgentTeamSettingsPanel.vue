<script setup lang="ts">
import {
  WorkspaceAgentTeamSettingsInputSchema,
  BUILT_IN_REASONING_LEVELS,
  SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_MAX_COUNT,
  SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH,
  SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH,
  SCRIPT_WORKSPACE_AGENT_IDS,
  SHORT_WORKSPACE_AGENT_IDS,
  type WorkspaceAgentTeamSettings,
  type WorkspaceAgentTeamSettingsInput,
  type BuiltInReasoningLevel,
  type ModelConfig,
  type LongAgentTeamSettings,
  type LongAgentTeamSettingsInput,
  type ShortAgentSubagentDefinition,
  type ShortAgentSubagentModelMode,
  type WorkspaceAgentId,
  type SkillLibrary,
  type SubagentAuthoringDraft,
  type SubagentAuthoringRuntimeContext,
  type ThinkingLevel
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import AppIcon from "./AppIcon.vue";
import LoadSubagentFromSkillDialog from "./LoadSubagentFromSkillDialog.vue";
import LongAgentTeamSettingsPanel from "./LongAgentTeamSettingsPanel.vue";
import PopupSelect, { type PopupSelectOption } from "./PopupSelect.vue";

interface ParentAgentMeta {
  id: WorkspaceAgentId;
  label: string;
  description: string;
}

const props = defineProps<{
  settings: readonly WorkspaceAgentTeamSettings[];
  longSettings: LongAgentTeamSettings | null;
  models: readonly ModelConfig[];
  skills?: readonly SkillLibrary[];
  preferredModelId?: string | null | undefined;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  longLoading: boolean;
  longSaving: boolean;
  longLoadError?: string | null;
  runtimeAvailable: boolean;
  authoringGenerating?: boolean;
  authoringDraft?: SubagentAuthoringDraft | null | undefined;
  authoringStatusText?: string | null | undefined;
  authoringError?: string | null | undefined;
}>();

const emit = defineEmits<{
  retry: [];
  save: [settings: WorkspaceAgentTeamSettingsInput];
  saveLong: [settings: LongAgentTeamSettingsInput];
  authoringGenerate: [payload: {
    context: SubagentAuthoringRuntimeContext;
    modelId: string;
  }];
  authoringStop: [];
  authoringReset: [];
}>();

const loadFromSkillOpen = ref(false);

const PARENT_AGENTS = [
  {
    id: "character_design",
    label: "人设",
    description: "为人物设计主智能体配置研究、审阅和设定补全助手。"
  },
  {
    id: "plot_design",
    label: "剧情",
    description: "为剧情主智能体配置结构、因果和钩子等专项助手。"
  },
  {
    id: "expert_draft_coordinator",
    label: "正文",
    description: "为正文总控配置审阅、润色和一致性检查助手。"
  }
] as const satisfies readonly ParentAgentMeta[];

const activeParentAgentId = ref<WorkspaceAgentId>(PARENT_AGENTS[0].id);
const activeWorkspaceType = ref<"short" | "script" | "long">("short");
type EditableTeam = WorkspaceAgentTeamSettingsInput["teams"][number];
const draftTeams = ref<EditableTeam[]>([]);
const editingSubagentId = ref<string | null>(null);
let generatedIdSequence = 0;

const formDisabled = computed(
  () =>
    props.loading ||
    props.saving ||
    !props.runtimeAvailable
);

const activeParentMeta = computed(
  () =>
    PARENT_AGENTS.find((agent) => agent.id === activeParentAgentId.value) ??
    PARENT_AGENTS[0]
);
const activeParentDisplayLabel = computed(() => activeParentMeta.value.label);

const visibleParentAgents = computed(() => PARENT_AGENTS);

const activeSettings = computed(() =>
  activeWorkspaceType.value === "long"
    ? undefined
    : props.settings.find(
        (settings) => settings.workspaceType === activeWorkspaceType.value
      )
);

const activeSkills = computed(() => props.skills ?? []);

const activeTeam = computed(() =>
  draftTeams.value.find(
    (team) => team.parentAgentId === activeParentAgentId.value
  )
);

const modelOptions = computed<PopupSelectOption[]>(() =>
  props.models.map((model) => ({ value: model.id, label: model.label }))
);

const modelById = computed(() => {
  const map = new Map<string, ModelConfig>();
  for (const model of props.models) {
    map.set(model.id, model);
  }
  return map;
});

const builtInThinkingLabels: Record<BuiltInReasoningLevel, string> = {
  minimal: "最低",
  low: "较低",
  medium: "标准",
  high: "深度",
  xhigh: "极高",
  max: "最高"
};

function thinkingLabel(level: ThinkingLevel): string {
  if (level === "off") return "关闭";
  return BUILT_IN_REASONING_LEVELS.includes(level as BuiltInReasoningLevel)
    ? builtInThinkingLabels[level as BuiltInReasoningLevel]
    : `自定义（${level}）`;
}

function modelDefaults(model: ModelConfig | undefined): {
  thinkingLevel: ThinkingLevel;
  temperature: number;
} {
  return {
    thinkingLevel: model?.defaultThinkingLevel ?? "medium",
    temperature: model?.temperatureOptions[1] ?? 0.7
  };
}

function thinkingOptionsFor(
  subagent: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = subagent.modelId ? modelById.value.get(subagent.modelId) : undefined;
  if (!model) {
    return [
      { value: "off", label: thinkingLabel("off") },
      ...BUILT_IN_REASONING_LEVELS.map((value) => ({
        value,
        label: thinkingLabel(value)
      }))
    ];
  }
  return [
    { value: "off", label: thinkingLabel("off") },
    ...model.thinkingLevelOptions.map((value) => ({
      value,
      label: thinkingLabel(value)
    }))
  ];
}

function temperatureOptionsFor(
  subagent: ShortAgentSubagentDefinition
): PopupSelectOption[] {
  const model = subagent.modelId ? modelById.value.get(subagent.modelId) : undefined;
  return (model?.temperatureOptions ?? [0.1, 0.7, 1]).map((value) => ({
    value,
    label: `温度 ${value}`
  }));
}

function applyModelRunDefaults(
  subagent: ShortAgentSubagentDefinition,
  modelId: string | undefined
): void {
  const defaults = modelDefaults(
    modelId ? modelById.value.get(modelId) : undefined
  );
  subagent.thinkingLevel = defaults.thinkingLevel;
  subagent.temperature = defaults.temperature;
}

watch(
  () => [props.settings, activeWorkspaceType.value] as const,
  () => {
    const settings = activeSettings.value;
    draftTeams.value = settings
      ? settings.teams.map((team) => ({
          parentAgentId: team.parentAgentId,
          subagents: team.subagents.map((subagent) => ({
            ...subagent,
            modelMode: subagent.modelMode ?? "inherit",
            ...(subagent.modelId ? { modelId: subagent.modelId } : {}),
            ...(subagent.thinkingLevel !== undefined
              ? { thinkingLevel: subagent.thinkingLevel }
              : {}),
            ...(subagent.temperature !== undefined
              ? { temperature: subagent.temperature }
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
      activeParentAgentId.value = PARENT_AGENTS[0].id;
    }
    editingSubagentId.value = null;
  },
  { immediate: true, deep: true }
);

function selectParentAgent(parentAgentId: WorkspaceAgentId): void {
  activeParentAgentId.value = parentAgentId;
  editingSubagentId.value = null;
}

function nextSubagentId(): string {
  generatedIdSequence += 1;
  return `subagent_${Date.now().toString(36)}_${generatedIdSequence.toString(36)}`;
}

function addSubagent(
  draft?: Partial<Pick<ShortAgentSubagentDefinition, "name" | "description" | "systemPrompt">>
): void {
  const team = activeTeam.value;
  if (!team || formDisabled.value) return;
  if (team.subagents.length >= SHORT_AGENT_SUBAGENT_MAX_COUNT) {
    uiMessage.warning(`每个主智能体最多配置 ${SHORT_AGENT_SUBAGENT_MAX_COUNT} 个子智能体`);
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
  if (formDisabled.value) return;
  if (!activeTeam.value) return;
  if (activeTeam.value.subagents.length >= SHORT_AGENT_SUBAGENT_MAX_COUNT) {
    uiMessage.warning(`每个主智能体最多配置 ${SHORT_AGENT_SUBAGENT_MAX_COUNT} 个子智能体`);
    return;
  }
  if (!activeSkills.value.length) {
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

function setSubagentModelMode(
  subagent: ShortAgentSubagentDefinition,
  mode: ShortAgentSubagentModelMode
): void {
  if (formDisabled.value) return;
  subagent.modelMode = mode;
  if (mode !== "custom") {
    delete subagent.modelId;
    delete subagent.thinkingLevel;
    delete subagent.temperature;
    return;
  }
  if (!subagent.modelId && props.models[0]) {
    subagent.modelId = props.models[0].id;
  }
  if (subagent.thinkingLevel === undefined) {
    applyModelRunDefaults(subagent, subagent.modelId);
  }
}

function setSubagentModelId(
  subagent: ShortAgentSubagentDefinition,
  modelId: string
): void {
  if (formDisabled.value) return;
  subagent.modelId = modelId;
  applyModelRunDefaults(subagent, modelId);
}

function setSubagentThinkingLevel(
  subagent: ShortAgentSubagentDefinition,
  level: ThinkingLevel
): void {
  if (formDisabled.value) return;
  subagent.thinkingLevel = level;
  if (level === "off") {
    const options = temperatureOptionsFor(subagent);
    const current = subagent.temperature;
    if (
      current === undefined ||
      !options.some((option) => Object.is(option.value, current))
    ) {
      subagent.temperature = Number(options[1]?.value ?? options[0]?.value ?? 0.7);
    }
  }
}

function setSubagentTemperature(
  subagent: ShortAgentSubagentDefinition,
  temperature: number
): void {
  if (formDisabled.value) return;
  subagent.temperature = temperature;
}

function subagentModelSummary(subagent: ShortAgentSubagentDefinition): string {
  if (subagent.modelMode !== "custom") return "跟随主智能体";
  if (!subagent.modelId) return "单独配置（未选模型）";
  const modelLabel =
    modelById.value.get(subagent.modelId)?.label ?? subagent.modelId;
  const thinking =
    subagent.thinkingLevel !== undefined
      ? thinkingLabel(subagent.thinkingLevel)
      : undefined;
  if (!thinking) return modelLabel;
  if (subagent.thinkingLevel === "off" && subagent.temperature !== undefined) {
    return `${modelLabel} · 关闭 · 温度 ${subagent.temperature}`;
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
  subagent: ShortAgentSubagentDefinition,
  event: Event
): void {
  if (formDisabled.value) return;
  subagent.enabled = (event.target as HTMLInputElement).checked;
}

function validationMessage(
  teams: WorkspaceAgentTeamSettingsInput["teams"]
): string | null {
  for (const team of teams) {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const subagent of team.subagents) {
      if (!subagent.name.trim()) return "子智能体名称不能为空";
      if (!subagent.description.trim()) return "子智能体能力说明不能为空";
      if (!subagent.systemPrompt.trim()) return "子智能体系统提示词不能为空";
      if (subagent.modelMode === "custom") {
        if (!subagent.modelId?.trim()) return "单独配置模型时必须选择模型";
        const model = props.models.find((candidate) => candidate.id === subagent.modelId);
        if (!model) {
          return `子智能体「${subagent.name.trim() || "未命名"}」所选模型不存在，请重新选择`;
        }
        if (subagent.thinkingLevel === undefined) {
          return "单独配置模型时必须选择思考等级";
        }
        if (
          subagent.thinkingLevel !== "off" &&
          !model.thinkingLevelOptions.includes(subagent.thinkingLevel)
        ) {
          return `子智能体「${subagent.name.trim() || "未命名"}」的思考等级不在所选模型配置中`;
        }
        if (subagent.thinkingLevel === "off") {
          if (subagent.temperature === undefined) {
            return "思考等级关闭时必须选择温度";
          }
          if (!model.temperatureOptions.includes(subagent.temperature)) {
            return `子智能体「${subagent.name.trim() || "未命名"}」的温度不在所选模型配置中`;
          }
        }
      }
      const id = subagent.id.toLocaleLowerCase();
      const name = subagent.name.trim().toLocaleLowerCase();
      if (ids.has(id)) return "同一主智能体下的子智能体 ID 不能重复";
      if (names.has(name)) return "同一主智能体下的子智能体名称不能重复";
      ids.add(id);
      names.add(name);
    }
  }
  return null;
}

function saveSettings(): void {
  if (formDisabled.value || activeWorkspaceType.value === "long") return;
  const workspaceType = activeWorkspaceType.value;
  const parentAgentIds =
    workspaceType === "script"
      ? SCRIPT_WORKSPACE_AGENT_IDS
      : SHORT_WORKSPACE_AGENT_IDS;
  const teams = parentAgentIds.map(
    (parentAgentId) => {
      const team = draftTeams.value.find(
        (candidate) => candidate.parentAgentId === parentAgentId
      );
      return {
        parentAgentId,
        subagents: (team?.subagents ?? []).map((subagent) => ({
          id: subagent.id,
          name: subagent.name.trim(),
          description: subagent.description.trim(),
          systemPrompt: subagent.systemPrompt.trim(),
          enabled: subagent.enabled,
          modelMode: subagent.modelMode ?? "inherit",
          ...(subagent.modelMode === "custom" && subagent.modelId
            ? {
                modelId: subagent.modelId.trim(),
                ...(subagent.thinkingLevel !== undefined
                  ? { thinkingLevel: subagent.thinkingLevel }
                  : {}),
                ...(subagent.thinkingLevel === "off" &&
                subagent.temperature !== undefined
                  ? { temperature: subagent.temperature }
                  : {})
              }
            : {})
        }))
      };
    }
  );
  const message = validationMessage(teams);
  if (message) {
    uiMessage.warning(message);
    return;
  }
  const parsed = WorkspaceAgentTeamSettingsInputSchema.safeParse({
    workspaceType,
    teams
  });
  if (!parsed.success) {
    uiMessage.warning(parsed.error.issues[0]?.message ?? "智能体团队配置不完整");
    return;
  }
  emit("save", parsed.data);
}
</script>

<template>
  <section class="agent-team-settings" aria-labelledby="agent-team-title">
    <header class="panel-header">
      <div>
        <span class="panel-kicker">学习仿写 · 智能体团队</span>
        <h2 id="agent-team-title">智能体团队</h2>
        <p>提前为每个主智能体配置可调用的专项子智能体。</p>
        <p class="inheritance-note">
          子智能体默认跟随所属主智能体的模型；也可单独配置模型。它继承主智能体的工具与审批策略，但继承的工具不包含技能加载；不继承主智能体提示词、会话或技能库，且不能继续创建子智能体、不能绕过用户审批。每次调用以自己的系统提示词为主，运行时只额外附带可用工具清单和交接回主智能体的长度约束——它是直接用工具改文档，还是只把结论交回主智能体，完全由你写的系统提示词决定。
        </p>
        <p v-if="!runtimeAvailable" class="runtime-note">
          当前环境仅支持查看；保存设置需要使用墨枢桌面端。
        </p>
      </div>
    </header>

    <div class="workspace-tabs" role="tablist" aria-label="创作类型">
      <button
        class="workspace-tab"
        :class="{ 'is-active': activeWorkspaceType === 'short' }"
        type="button"
        role="tab"
        :aria-selected="activeWorkspaceType === 'short'"
        @click="activeWorkspaceType = 'short'"
      >
        短篇
      </button>
      <button
        class="workspace-tab"
        :class="{ 'is-active': activeWorkspaceType === 'script' }"
        type="button"
        role="tab"
        :aria-selected="activeWorkspaceType === 'script'"
        @click="activeWorkspaceType = 'script'"
      >
        <span>剧本</span>
      </button>
      <button
        class="workspace-tab"
        type="button"
        role="tab"
        :class="{ 'is-active': activeWorkspaceType === 'long' }"
        :aria-selected="activeWorkspaceType === 'long'"
        @click="activeWorkspaceType = 'long'"
      >
        <span>长篇</span>
      </button>
    </div>

    <LongAgentTeamSettingsPanel
      v-if="activeWorkspaceType === 'long'"
      :settings="longSettings"
      :models="models"
      :skills="activeSkills"
      :preferred-model-id="preferredModelId ?? null"
      :loading="longLoading"
      :saving="longSaving"
      :load-error="longLoadError ?? null"
      :runtime-available="runtimeAvailable"
      :authoring-generating="Boolean(authoringGenerating)"
      :authoring-draft="authoringDraft ?? null"
      :authoring-status-text="authoringStatusText ?? null"
      :authoring-error="authoringError ?? null"
      @retry="emit('retry')"
      @save="emit('saveLong', $event)"
      @authoring-generate="emit('authoringGenerate', $event)"
      @authoring-stop="emit('authoringStop')"
      @authoring-reset="emit('authoringReset')"
    />
    <div v-else-if="loading" class="panel-state" aria-live="polite">
      正在加载智能体团队设置…
    </div>
    <div
      v-else-if="loadError && !activeSettings"
      class="panel-state panel-load-error"
      role="alert"
    >
      <strong>智能体团队设置未加载</strong>
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
    <div v-else-if="!activeSettings || !activeTeam" class="panel-state">
      暂无可用的智能体团队设置。
    </div>

    <div v-else class="team-layout">
      <nav class="parent-agent-tabs" :aria-label="`${activeWorkspaceType === 'script' ? '剧本' : '短篇'}主智能体`">
        <button
          v-for="agent in visibleParentAgents"
          :key="agent.id"
          type="button"
          class="parent-agent-tab"
          :class="{ 'is-active': activeParentAgentId === agent.id }"
          :aria-current="activeParentAgentId === agent.id ? 'page' : undefined"
          @click="selectParentAgent(agent.id)"
        >
          {{ agent.label }}
          <span>{{ draftTeams.find((team) => team.parentAgentId === agent.id)?.subagents.length ?? 0 }}</span>
        </button>
      </nav>

      <div class="team-editor">
        <header class="team-heading">
          <div>
            <span>主智能体</span>
            <h3>{{ activeParentDisplayLabel }}</h3>
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
            v-for="(subagent, index) in activeTeam.subagents"
            :key="subagent.id"
            class="subagent-card"
            :class="{ 'is-editing': editingSubagentId === subagent.id }"
          >
            <header class="subagent-summary">
              <div class="subagent-copy">
                <div class="subagent-title-row">
                  <strong>{{ subagent.name || "未命名子智能体" }}</strong>
                  <span :class="{ 'is-disabled': !subagent.enabled }">
                    {{ subagent.enabled ? "已启用" : "已停用" }}
                  </span>
                  <span class="model-badge">{{ subagentModelSummary(subagent) }}</span>
                </div>
                <p>{{ subagent.description || "补充能力说明，让主智能体知道何时调用它。" }}</p>
              </div>
              <label class="enable-toggle" :title="subagent.enabled ? '停用' : '启用'">
                <input
                  type="checkbox"
                  :checked="subagent.enabled"
                  :disabled="formDisabled"
                  :aria-label="`${subagent.name || '子智能体'}启用状态`"
                  @change="toggleSubagent(subagent, $event)"
                />
              </label>
              <button
                type="button"
                class="icon-button"
                :disabled="formDisabled"
                :aria-label="`编辑${subagent.name}`"
                @click="editSubagent(subagent.id)"
              >
                <AppIcon name="edit" :size="15" />
              </button>
              <button
                type="button"
                class="icon-button is-danger"
                :disabled="formDisabled"
                :aria-label="`删除${subagent.name}`"
                @click="removeSubagent(index)"
              >
                <AppIcon name="trash" :size="15" />
              </button>
            </header>

            <div v-if="editingSubagentId === subagent.id" class="subagent-form">
              <div class="form-field">
                <span>模型配置</span>
                <div class="model-mode-options" role="radiogroup" aria-label="子智能体模型配置">
                  <label :class="{ 'is-selected': subagent.modelMode !== 'custom' }">
                    <input
                      type="radio"
                      :name="`subagent-model-mode-${subagent.id}`"
                      value="inherit"
                      :checked="subagent.modelMode !== 'custom'"
                      :disabled="formDisabled"
                      @change="setSubagentModelMode(subagent, 'inherit')"
                    />
                    跟随主智能体
                  </label>
                  <label :class="{ 'is-selected': subagent.modelMode === 'custom' }">
                    <input
                      type="radio"
                      :name="`subagent-model-mode-${subagent.id}`"
                      value="custom"
                      :checked="subagent.modelMode === 'custom'"
                      :disabled="formDisabled"
                      @change="setSubagentModelMode(subagent, 'custom')"
                    />
                    单独配置模型
                  </label>
                </div>
                <div v-if="subagent.modelMode === 'custom'" class="model-run-settings">
                  <PopupSelect
                    class="model-select"
                    :model-value="subagent.modelId ?? ''"
                    :options="modelOptions"
                    accessible-label="选择子智能体模型"
                    placeholder="请选择模型"
                    size="large"
                    :disabled="formDisabled || modelOptions.length === 0"
                    :menu-min-width="260"
                    :menu-z-index="1200"
                    @update:model-value="setSubagentModelId(subagent, String($event))"
                  >
                    <template #prefix><AppIcon name="model" :size="14" /></template>
                  </PopupSelect>
                  <PopupSelect
                    class="model-select"
                    :model-value="subagent.thinkingLevel ?? ''"
                    :options="thinkingOptionsFor(subagent)"
                    accessible-label="选择思考等级"
                    placeholder="请选择思考等级"
                    size="large"
                    :disabled="formDisabled || !subagent.modelId"
                    :menu-min-width="200"
                    :menu-z-index="1200"
                    @update:model-value="setSubagentThinkingLevel(subagent, String($event) as ThinkingLevel)"
                  >
                    <template #prefix><AppIcon name="brain" :size="14" /></template>
                  </PopupSelect>
                  <PopupSelect
                    v-if="subagent.thinkingLevel === 'off'"
                    class="model-select"
                    :model-value="subagent.temperature ?? ''"
                    :options="temperatureOptionsFor(subagent)"
                    accessible-label="选择温度"
                    placeholder="请选择温度"
                    size="large"
                    :disabled="formDisabled || !subagent.modelId"
                    :menu-min-width="180"
                    :menu-z-index="1200"
                    @update:model-value="setSubagentTemperature(subagent, Number($event))"
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
                  v-model="subagent.name"
                  type="text"
                  :maxlength="SHORT_AGENT_SUBAGENT_NAME_MAX_LENGTH"
                  :disabled="formDisabled"
                  placeholder="例如：连续性审阅"
                />
              </label>
              <label class="form-field">
                <span>能力说明</span>
                <textarea
                  v-model="subagent.description"
                  class="description-input"
                  :maxlength="SHORT_AGENT_SUBAGENT_DESCRIPTION_MAX_LENGTH"
                  :disabled="formDisabled"
                  placeholder="说明擅长处理什么任务，供主智能体选择调用。"
                />
              </label>
              <label class="form-field">
                <span>系统提示词</span>
                <textarea
                  v-model="subagent.systemPrompt"
                  class="prompt-input"
                  :maxlength="SHORT_AGENT_SUBAGENT_SYSTEM_PROMPT_MAX_LENGTH"
                  :disabled="formDisabled"
                  spellcheck="false"
                  placeholder="定义子智能体的职责、工作方法和交接要求。"
                />
              </label>
              <div class="form-meta">
                <span>ID：<code>{{ subagent.id }}</code></span>
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
      :parent-agent-label="activeParentDisplayLabel"
      :existing-subagent-names="(activeTeam?.subagents ?? []).map((item) => item.name)"
      :skills="activeSkills"
      :models="models"
      :preferred-model-id="preferredModelId ?? null"
      :generating="Boolean(authoringGenerating)"
      :draft="authoringDraft ?? null"
      :status-text="authoringStatusText ?? null"
      :error="authoringError ?? null"
      @close="closeLoadFromSkill"
      @generate="emit('authoringGenerate', $event)"
      @stop="emit('authoringStop')"
      @confirm="confirmLoadFromSkill"
    />
  </section>
</template>

<style scoped>
.agent-team-settings {
  width: min(100%, 980px);
  color: var(--text-primary);
}

.panel-header { margin-bottom: 18px; }
.panel-kicker,
.team-heading > div > span {
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.panel-header h2 { margin: 4px 0 5px; font-size: 1.57143rem; font-weight: 650; }
.panel-header p,
.team-heading p,
.subagent-copy p,
.empty-team p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.892857rem;
  line-height: 1.55;
}
.inheritance-note { margin-top: 7px !important; }
.runtime-note { margin-top: 5px !important; color: var(--warning-text, #8a6731) !important; }

.workspace-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 18px;
  padding: 5px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-muted);
}
.workspace-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 108px;
  padding: 8px 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-weight: 600;
}
.workspace-tab.is-active { background: var(--surface-raised); color: var(--text-primary); box-shadow: 0 1px 3px rgb(0 0 0 / 0.08); }
.workspace-tab:disabled { color: var(--text-tertiary); }
.workspace-tab small { font-size: 0.714286rem; font-weight: 520; }

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
.team-heading h3 { margin: 3px 0 4px; font-size: 1.28571rem; font-weight: 640; }
.team-heading-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
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
.subagent-title-row .model-badge {
  max-width: 240px;
  overflow: hidden;
  background: var(--surface-selected);
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
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
.model-mode-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
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
.model-mode-options label.is-selected {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--text-primary);
}
.model-mode-options input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.model-select { width: 100%; }
.model-run-settings {
  display: grid;
  gap: 8px;
}
.model-empty-hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  line-height: 1.45;
}
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
  .workspace-tabs { overflow-x: auto; }
  .workspace-tab { min-width: 96px; }
  .team-heading, .panel-actions { align-items: stretch; flex-direction: column; }
  .secondary-button, .primary-button { width: 100%; }
  .subagent-summary { align-items: flex-start; flex-wrap: wrap; }
  .subagent-copy { flex-basis: calc(100% - 50px); }
  .form-meta { align-items: flex-start; flex-direction: column; }
}
</style>
