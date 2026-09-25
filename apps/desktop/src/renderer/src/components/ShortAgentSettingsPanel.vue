<script setup lang="ts">
import type {
  LongAgentSettings,
  LongAgentSettingsInput,
  WorkspaceAgentId,
  WorkspaceAgentSettings,
  WorkspaceAgentSettingsInput
} from "@deepwrite/contracts";
import {
  DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES,
  DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";
import LongAgentSettingsPanel from "./LongAgentSettingsPanel.vue";

type EditableAgent = WorkspaceAgentSettingsInput["agents"][number];
type ReadAccessKey = keyof EditableAgent["readAccess"];
type MaterialKind = EditableAgent["readAccess"]["material"][number];
type SkillKind = EditableAgent["readAccess"]["skill"][number];

interface AgentMeta {
  id: WorkspaceAgentId;
  label: string;
  eyebrow: string;
}

interface ReadOption<T extends string> {
  id: T;
  label: string;
  description: string;
}

const props = defineProps<{
  settings: readonly WorkspaceAgentSettings[];
  longSettings: LongAgentSettings | null;
  loading: boolean;
  saving: boolean;
  longLoading: boolean;
  longSaving: boolean;
  longErrorMessage: string | null;
  runtimeAvailable: boolean;
}>();

const emit = defineEmits<{
  retryLong: [];
  save: [input: WorkspaceAgentSettingsInput];
  saveLong: [input: LongAgentSettingsInput];
}>();

const AGENTS = [
  { id: "character_design", label: "人物", eyebrow: "前置阶段" },
  { id: "plot_design", label: "剧情", eyebrow: "前置阶段" },
  {
    id: "expert_draft_coordinator",
    label: "正文专家",
    eyebrow: "正文编写"
  }
] as const satisfies readonly AgentMeta[];

const MATERIAL_OPTIONS = [
  { id: "character", label: "人物素材", description: "人物设定类素材" },
  { id: "gimmick", label: "卖点素材", description: "题材卖点与创意钩子" },
  { id: "plot", label: "剧情素材", description: "剧情结构与桥段参考" },
  { id: "draft", label: "正文素材", description: "正文片段与行文参考" },
  { id: "other", label: "其他素材", description: "未归入以上分类的素材" }
] as const satisfies readonly ReadOption<MaterialKind>[];

const SKILL_OPTIONS = [
  { id: "general", label: "通用技能", description: "跨阶段可复用的通用能力" },
  { id: "plot", label: "剧情技能", description: "人物、剧情与大纲设计能力" },
  { id: "style", label: "文风技能", description: "正文行文与风格执行能力" },
  { id: "other", label: "其他技能", description: "未归入以上分类的技能" }
] as const satisfies readonly ReadOption<SkillKind>[];

const activeAgentId = ref<WorkspaceAgentId>(AGENTS[0].id);
const activeWorkspaceType = ref<"short" | "script" | "long">("short");
const draftAgents = ref<EditableAgent[]>([]);

const visibleAgents = computed(() => AGENTS);

const activeAgent = computed(() =>
  draftAgents.value.find((agent) => agent.id === activeAgentId.value)
);

const activeSettings = computed(() =>
  activeWorkspaceType.value === "long"
    ? undefined
    : props.settings.find(
        (settings) => settings.workspaceType === activeWorkspaceType.value
      )
);

const activeSettingsAgent = computed(() =>
  activeSettings.value?.agents.find((agent) => agent.id === activeAgentId.value)
);

const activeMeta = computed(
  () => AGENTS.find((agent) => agent.id === activeAgentId.value) ?? AGENTS[0]
);

const activeLoading = computed(() =>
  activeWorkspaceType.value === "long" ? props.longLoading : props.loading
);
const activeSaving = computed(() =>
  activeWorkspaceType.value === "long" ? props.longSaving : props.saving
);
const formDisabled = computed(
  () =>
    activeLoading.value ||
    activeSaving.value ||
    !props.runtimeAvailable
);
const activeWorkspaceLabel = computed(() =>
  activeWorkspaceType.value === "long"
    ? "长篇"
    : activeWorkspaceType.value === "script"
      ? "剧本"
      : "短篇"
);

const hasCompleteDraft = computed(() =>
  visibleAgents.value.every(({ id }) =>
    draftAgents.value.some((agent) => agent.id === id)
  )
);

watch(
  () => [props.settings, activeWorkspaceType.value] as const,
  () => {
    const settings = activeSettings.value;
    draftAgents.value = settings
      ? settings.agents.map((agent) => ({
          id: agent.id,
          systemPrompt: agent.systemPrompt,
          welcomeShortcuts: [
            agent.welcomeShortcuts[0],
            agent.welcomeShortcuts[1],
            agent.welcomeShortcuts[2]
          ],
          readAccess: {
            material: [...agent.readAccess.material],
            skill: [...agent.readAccess.skill]
          }
        }))
      : [];

    if (
      settings &&
      !settings.agents.some((agent) => agent.id === activeAgentId.value)
    ) {
      activeAgentId.value = AGENTS[0].id;
    }
  },
  { immediate: true, deep: true }
);

function selectAgent(agentId: WorkspaceAgentId): void {
  activeAgentId.value = agentId;
}

function isReadAccessChecked(scope: ReadAccessKey, id: string): boolean {
  const values = activeAgent.value?.readAccess[scope] as
    | readonly string[]
    | undefined;
  return values?.includes(id) ?? false;
}

function patchReadAccess(
  scope: ReadAccessKey,
  id: string,
  checked: boolean
): void {
  const agent = activeAgent.value;
  if (!agent || formDisabled.value) return;
  const values = new Set(agent.readAccess[scope] as readonly string[]);
  if (checked) values.add(id);
  else values.delete(id);
  Object.assign(agent.readAccess, { [scope]: [...values] });
}

function handleCheckboxChange(
  scope: ReadAccessKey,
  id: string,
  event: Event
): void {
  patchReadAccess(scope, id, (event.target as HTMLInputElement).checked);
}

function resetActiveAgent(): void {
  if (formDisabled.value || !activeAgent.value) return;
  const defaults =
    activeWorkspaceType.value === "script"
      ? DEFAULT_SCRIPT_WORKSPACE_AGENT_PROFILES
      : DEFAULT_SHORT_WORKSPACE_AGENT_PROFILES;
  const builtin = defaults.find(
    (agent) => agent.id === activeAgentId.value
  );
  const index = draftAgents.value.findIndex(
    (agent) => agent.id === activeAgentId.value
  );
  if (!builtin || index < 0) return;
  draftAgents.value[index] = {
    id: builtin.id,
    systemPrompt: builtin.systemPrompt,
    welcomeShortcuts: [
      builtin.welcomeShortcuts[0],
      builtin.welcomeShortcuts[1],
      builtin.welcomeShortcuts[2]
    ],
    readAccess: {
      material: [...builtin.readAccess.material],
      skill: [...builtin.readAccess.skill]
    }
  };
  uiMessage.info("当前智能体已恢复内置默认值；点击保存后生效。");
}

function saveSettings(): void {
  if (
    activeWorkspaceType.value === "long" ||
    formDisabled.value ||
    !hasCompleteDraft.value
  ) {
    return;
  }
  const workspaceType = activeWorkspaceType.value;

  const agents = visibleAgents.value.map(({ id }) => {
    const agent = draftAgents.value.find((candidate) => candidate.id === id);
    if (!agent) return null;

    const shortcuts = agent.welcomeShortcuts.map((value) => value.trim());
    if (shortcuts.some((value) => value.length === 0) || shortcuts.length !== 3) {
      uiMessage.warning("每个智能体的三个欢迎快捷按钮都不能为空");
      return null;
    }

    return {
      id,
      systemPrompt: agent.systemPrompt,
      welcomeShortcuts: [shortcuts[0]!, shortcuts[1]!, shortcuts[2]!],
      readAccess: {
        material: [...agent.readAccess.material],
        skill: [...agent.readAccess.skill]
      }
    };
  }).filter((agent): agent is EditableAgent => agent !== null);

  if (agents.length !== visibleAgents.value.length) return;
  emit("save", {
    workspaceType,
    agents
  } as WorkspaceAgentSettingsInput);
}
</script>

<template>
  <section class="short-agent-settings" aria-labelledby="short-agent-title">
    <header class="panel-header">
      <div>
        <span class="panel-kicker">{{ activeWorkspaceLabel }}创作空间</span>
        <h2 id="short-agent-title">智能体设置</h2>
        <p>
          分别配置{{ activeWorkspaceLabel }}智能体的系统提示词、欢迎快捷按钮，以及可读取的素材和技能范围。创作空间内容始终可以按需互相读取。
        </p>
        <p v-if="!runtimeAvailable" class="runtime-note">
          当前环境仅支持查看；保存和恢复默认设置需要使用墨枢桌面端。
        </p>
      </div>
    </header>

    <div class="workspace-type-tabs" role="tablist" aria-label="创作类型">
      <button
        type="button"
        role="tab"
        :class="{ 'is-active': activeWorkspaceType === 'short' }"
        :aria-selected="activeWorkspaceType === 'short'"
        @click="activeWorkspaceType = 'short'"
      >
        短篇
      </button>
      <button
        type="button"
        role="tab"
        :class="{ 'is-active': activeWorkspaceType === 'script' }"
        :aria-selected="activeWorkspaceType === 'script'"
        @click="activeWorkspaceType = 'script'"
      >
        剧本
      </button>
      <button
        type="button"
        role="tab"
        :class="{ 'is-active': activeWorkspaceType === 'long' }"
        :aria-selected="activeWorkspaceType === 'long'"
        @click="activeWorkspaceType = 'long'"
      >
        长篇
      </button>
    </div>

    <LongAgentSettingsPanel
      v-if="activeWorkspaceType === 'long'"
      :settings="longSettings"
      :loading="longLoading"
      :saving="longSaving"
      :load-error="longErrorMessage"
      :runtime-available="runtimeAvailable"
      @retry="emit('retryLong')"
      @save="emit('saveLong', $event)"
    />
    <div v-else-if="activeLoading" class="panel-state" aria-live="polite">
      正在加载{{ activeWorkspaceType === "script" ? "剧本" : "短篇" }}智能体设置…
    </div>
    <div v-else-if="!activeSettings || !activeAgent" class="panel-state">
      暂无可用的{{ activeWorkspaceType === "script" ? "剧本" : "短篇" }}智能体设置。
    </div>

    <div v-else class="settings-layout">
      <nav class="agent-nav" :aria-label="`${activeWorkspaceType === 'script' ? '剧本' : '短篇'}智能体`">
        <button
          v-for="agent in visibleAgents"
          :key="agent.id"
          type="button"
          class="agent-nav-item"
          :class="{ 'is-active': agent.id === activeAgentId }"
          :aria-current="agent.id === activeAgentId ? 'page' : undefined"
          @click="selectAgent(agent.id)"
        >
          <small>{{ agent.eyebrow }}</small>
          <strong>{{ agent.label }}</strong>
        </button>
      </nav>

      <div class="agent-editor">
        <header class="agent-header">
          <span>{{ activeMeta.eyebrow }}</span>
          <h3>{{ activeSettingsAgent?.label ?? activeMeta.label }}</h3>
          <p>
            {{ activeSettingsAgent?.description ?? "配置当前智能体的职责和读取边界。" }}
          </p>
        </header>

        <section class="settings-card prompt-card">
          <div class="section-heading">
            <div>
              <h4>系统提示词</h4>
              <p>作品标题、类型和当前位置等动态信息会在运行时自动补充。</p>
            </div>
            <span>{{ activeAgent.systemPrompt.length }} 字符</span>
          </div>
          <textarea
            v-model="activeAgent.systemPrompt"
            :disabled="formDisabled"
            spellcheck="false"
            aria-label="系统提示词"
            placeholder="输入当前智能体的系统提示词…"
          />
        </section>

        <section class="settings-card welcome-card">
          <div class="section-heading">
            <div>
              <h4>欢迎快捷按钮</h4>
              <p>空对话欢迎区展示的三个快捷提问；可自定义，也可通过“恢复当前智能体默认”还原。</p>
            </div>
          </div>
          <div class="welcome-shortcut-list">
            <label
              v-for="(_, index) in activeAgent.welcomeShortcuts"
              :key="index"
              class="welcome-shortcut-field"
            >
              <span>按钮 {{ index + 1 }}</span>
              <input
                v-model="activeAgent.welcomeShortcuts[index]"
                type="text"
                :disabled="formDisabled"
                maxlength="120"
                :aria-label="`欢迎快捷按钮 ${index + 1}`"
                placeholder="输入快捷提问文案…"
              />
            </label>
          </div>
        </section>

        <section class="settings-card access-card">
          <div class="section-heading">
            <div>
              <h4>读取范围</h4>
              <p>未勾选的素材或技能不会提供给当前智能体；创作空间各阶段始终可按需读取。</p>
            </div>
          </div>

          <fieldset>
            <legend>素材库</legend>
            <div class="option-grid">
              <label
                v-for="option in MATERIAL_OPTIONS"
                :key="option.id"
                class="read-option"
              >
                <input
                  type="checkbox"
                  :checked="isReadAccessChecked('material', option.id)"
                  :disabled="formDisabled"
                  @change="handleCheckboxChange('material', option.id, $event)"
                />
                <span class="option-copy">
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.description }}</small>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>技能库</legend>
            <div class="option-grid">
              <label
                v-for="option in SKILL_OPTIONS"
                :key="option.id"
                class="read-option"
              >
                <input
                  type="checkbox"
                  :checked="isReadAccessChecked('skill', option.id)"
                  :disabled="formDisabled"
                  @change="handleCheckboxChange('skill', option.id, $event)"
                />
                <span class="option-copy">
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.description }}</small>
                </span>
              </label>
            </div>
          </fieldset>
        </section>

        <footer class="panel-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="formDisabled"
            @click="resetActiveAgent"
          >
            恢复当前智能体默认
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="formDisabled || !hasCompleteDraft"
            @click="saveSettings"
          >
            {{ activeSaving ? "保存中…" : "保存创作空间设置" }}
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.short-agent-settings {
  width: min(100%, 980px);
  color: var(--text-primary);
  font-family: var(--ui-font);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.workspace-type-tabs {
  display: flex;
  gap: 6px;
  margin: -6px 0 18px;
  padding: 5px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 11px;
  background: var(--surface-muted);
}

.workspace-type-tabs button {
  min-width: 104px;
  min-height: 36px;
  padding: 7px 13px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.workspace-type-tabs button.is-active {
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--theme-foreground) 9%, transparent);
}

.workspace-type-tabs button:disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.workspace-type-tabs small {
  margin-left: 4px;
  font-size: 0.714286rem;
  font-weight: 500;
}

.panel-kicker,
.agent-header > span {
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.panel-header h2 {
  margin: 4px 0 5px;
  color: var(--text-primary);
  font-size: 1.57143rem;
  font-weight: 650;
}

.panel-header p,
.agent-header p,
.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.892857rem;
  line-height: 1.55;
}

.runtime-note {
  margin-top: 5px !important;
  color: var(--warning) !important;
}

.panel-state {
  padding: 48px 20px;
  border-radius: 12px;
  background: var(--surface-raised);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--theme-foreground) 4%, transparent);
  color: var(--text-secondary);
  font-size: 0.928571rem;
  text-align: center;
}

.settings-layout {
  display: grid;
  grid-template-columns: 174px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.agent-nav {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 11px;
  background: var(--surface-muted);
}

.agent-nav-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 50px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.agent-nav-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.agent-nav-item.is-active {
  background: var(--surface-raised);
  color: var(--text-primary);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--theme-foreground) 8%, transparent);
}

.agent-nav-item small {
  color: var(--text-tertiary);
  font-size: 0.75rem;
}

.agent-nav-item strong {
  font-size: 0.964286rem;
  font-weight: 590;
}

.agent-editor {
  min-width: 0;
}

.agent-header {
  margin-bottom: 14px;
  padding: 2px 2px 0;
}

.agent-header h3 {
  margin: 3px 0 4px;
  color: var(--text-primary);
  font-size: 1.28571rem;
  font-weight: 640;
}

.settings-card {
  margin-bottom: 14px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--theme-foreground) 3.5%, transparent);
  overflow: hidden;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 15px 17px 12px;
  border-bottom: 1px solid var(--theme-line-soft);
}

.section-heading h4 {
  margin: 0 0 3px;
  font-size: 1rem;
  font-weight: 620;
}

.section-heading > span {
  flex: none;
  color: var(--text-tertiary);
  font-size: 0.821429rem;
}

.prompt-card textarea {
  display: block;
  width: 100%;
  min-height: 280px;
  padding: 16px 17px;
  resize: vertical;
  border: 0;
  background: var(--surface-main);
  color: var(--text-primary);
  font-family: var(--code-font);
  font-size: var(--code-font-size);
  line-height: 1.65;
  outline: none;
  box-sizing: border-box;
}

.prompt-card textarea:focus {
  box-shadow: inset 0 0 0 2px var(--accent-soft);
}

.prompt-card textarea:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
}

.welcome-shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 17px 17px;
  background: var(--surface-main);
}

.welcome-shortcut-field {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.welcome-shortcut-field > span {
  color: var(--text-secondary);
  font-size: 0.857143rem;
  font-weight: 560;
}

.welcome-shortcut-field input {
  width: 100%;
  min-height: 38px;
  padding: 8px 11px;
  border: 1px solid var(--theme-line);
  border-radius: 8px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.928571rem;
  outline: none;
  box-sizing: border-box;
}

.welcome-shortcut-field input:focus {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--theme-line));
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.welcome-shortcut-field input:disabled {
  color: var(--text-secondary);
  background: var(--surface-muted);
  cursor: not-allowed;
}

.access-card fieldset {
  min-width: 0;
  margin: 0;
  padding: 14px 17px 17px;
  border: 0;
}

.access-card fieldset:not(:last-child) {
  border-bottom: 1px solid var(--theme-line-soft);
}

.access-card legend {
  padding: 0;
  color: var(--text-secondary);
  font-size: 0.857143rem;
  font-weight: 620;
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.read-option {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 8px;
  background: var(--surface-raised);
  cursor: pointer;
}

.read-option:hover {
  border-color: var(--theme-line);
  background: var(--surface-muted);
}

.read-option.is-locked {
  background: color-mix(in srgb, var(--success) 6%, var(--surface-muted));
  cursor: default;
}

.read-option input {
  flex: none;
  width: 15px;
  height: 15px;
  margin: 2px 0 0;
  accent-color: var(--accent);
}

.read-option input:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.option-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.option-copy strong {
  color: var(--text-primary);
  font-size: 0.892857rem;
  font-weight: 590;
}

.option-copy small {
  color: var(--text-tertiary);
  font-size: 0.785714rem;
  line-height: 1.4;
}

.option-copy em {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 14%, var(--surface-muted));
  color: var(--success);
  font-size: 0.678571rem;
  font-style: normal;
  font-weight: 600;
  vertical-align: 1px;
}

.panel-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  padding-top: 2px;
}

.panel-actions button {
  min-height: 34px;
  padding: 7px 13px;
  border-radius: 8px;
  font-size: 0.892857rem;
  font-weight: 570;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}

.secondary-button:hover:not(:disabled) {
  background: var(--surface-hover);
}

.primary-button {
  border: 1px solid color-mix(in srgb, var(--neutral-solid) 88%, transparent);
  background: var(--neutral-solid);
  color: var(--accent-contrast, #ffffff);
}

.primary-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--neutral-solid) 88%, var(--theme-foreground));
}

.panel-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

@media (max-width: 760px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .agent-nav {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .option-grid {
    grid-template-columns: 1fr;
  }
}
</style>
