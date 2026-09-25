<script setup lang="ts">
import {
  DEFAULT_LONG_AGENT_SETTINGS,
  LONG_AGENT_IDS,
  LongAgentSettingsInputSchema,
  getDefaultLongAgentProfile,
  type LongAgentId,
  type LongAgentSettings,
  type LongAgentSettingsInput,
  type LongWorkspaceRoot
} from "@deepwrite/contracts";
import { computed, ref, watch } from "vue";
import { uiMessage } from "../ui-feedback";

interface ReadOption<T extends string> {
  id: T;
  label: string;
  description?: string;
}

const props = defineProps<{
  settings: LongAgentSettings | null;
  loading: boolean;
  saving: boolean;
  loadError?: string | null;
  runtimeAvailable: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  save: [settings: LongAgentSettingsInput];
}>();

const AGENT_META = [
  { id: "setting", eyebrow: "设定", label: "设定" },
  { id: "plot_design", eyebrow: "结构", label: "剧情设计" },
  { id: "draft", eyebrow: "正文", label: "写手" },
  { id: "continuity_ledger", eyebrow: "连续性", label: "连续性账本" }
] as const satisfies readonly {
  id: LongAgentId;
  eyebrow: string;
  label: string;
}[];

const WORKSPACE_OPTIONS = [
  {
    id: "worldbuilding",
    label: "世界观",
    description: "规则、势力、地理、历史、术语、境界与物品"
  },
  {
    id: "character_design",
    label: "人物设计",
    description: "人物核心、关系、当前状态与历史"
  },
  {
    id: "plot_design",
    label: "剧情结构",
    description: "卷、剧情弧、章卡、事件、落点与伏笔"
  },
  {
    id: "draft",
    label: "正文",
    description: "章节正文、人物状态与下一章交接"
  },
  {
    id: "continuity_ledger",
    label: "连续性账本",
    description: "已提交事实、摘要、决策与审计记录"
  }
] as const satisfies readonly ReadOption<LongWorkspaceRoot>[];

const activeAgentId = ref<LongAgentId>(LONG_AGENT_IDS[0]);
const draftAgents = ref<LongAgentSettingsInput["agents"]>([]);

const activeAgent = computed(() =>
  draftAgents.value.find((agent) => agent.id === activeAgentId.value)
);
const activeProfile = computed(() =>
  props.settings?.agents.find((agent) => agent.id === activeAgentId.value)
);
const activeMeta = computed(
  () =>
    AGENT_META.find((agent) => agent.id === activeAgentId.value) ??
    AGENT_META[0]
);
const immutableProfile = computed(() =>
  getDefaultLongAgentProfile(activeAgentId.value)
);
const formDisabled = computed(
  () =>
    props.loading ||
    props.saving ||
    Boolean(props.loadError) ||
    !props.runtimeAvailable
);
const hasCompleteDraft = computed(() =>
  LONG_AGENT_IDS.every((id) =>
    draftAgents.value.some((agent) => agent.id === id)
  )
);

watch(
  () => props.settings,
  (settings) => {
    draftAgents.value = settings
      ? settings.agents.map((agent) => ({
          id: agent.id,
          systemPrompt: agent.systemPrompt,
          welcomeShortcuts: [
            agent.welcomeShortcuts[0],
            agent.welcomeShortcuts[1],
            agent.welcomeShortcuts[2]
          ]
        }))
      : [];
  },
  { immediate: true, deep: true }
);

function resetActiveAgent(): void {
  if (formDisabled.value) return;
  const builtin = DEFAULT_LONG_AGENT_SETTINGS.agents.find(
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
    ]
  };
  uiMessage.info("当前长篇智能体已恢复内置值；点击保存后生效。");
}

function saveSettings(): void {
  if (formDisabled.value || !hasCompleteDraft.value) return;
  const agents = LONG_AGENT_IDS.map((id) => {
    const agent = draftAgents.value.find((candidate) => candidate.id === id);
    if (!agent) return null;
    const shortcuts = agent.welcomeShortcuts.map((value) => value.trim());
    if (shortcuts.length !== 3 || shortcuts.some((value) => !value)) {
      uiMessage.warning("每个长篇智能体的三个欢迎快捷按钮都不能为空");
      return null;
    }
    return {
      id,
      systemPrompt: agent.systemPrompt,
      welcomeShortcuts: [shortcuts[0]!, shortcuts[1]!, shortcuts[2]!] as [
        string,
        string,
        string
      ]
    };
  }).filter(
    (agent): agent is LongAgentSettingsInput["agents"][number] =>
      agent !== null
  );
  if (agents.length !== LONG_AGENT_IDS.length) return;
  const parsed = LongAgentSettingsInputSchema.safeParse({
    workspaceType: "long",
    agents
  });
  if (!parsed.success) {
    uiMessage.warning(
      parsed.error.issues[0]?.message ?? "长篇智能体设置不完整"
    );
    return;
  }
  emit("save", parsed.data);
}
</script>

<template>
  <div v-if="loading" class="panel-state" aria-live="polite">
    正在加载长篇智能体设置…
  </div>
  <div v-else-if="loadError" class="panel-state" role="alert">
    <strong>长篇智能体设置未加载</strong>
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
  <div v-else-if="!settings || !activeAgent" class="panel-state">
    暂无可用的长篇智能体设置。
  </div>
  <div v-else class="settings-layout">
    <nav class="agent-nav" aria-label="长篇智能体">
      <button
        v-for="agent in AGENT_META"
        :key="agent.id"
        type="button"
        class="agent-nav-item"
        :class="{ 'is-active': agent.id === activeAgentId }"
        :aria-current="agent.id === activeAgentId ? 'page' : undefined"
        @click="activeAgentId = agent.id"
      >
        <small>{{ agent.eyebrow }}</small>
        <strong>{{ agent.label }}</strong>
      </button>
    </nav>

    <div class="agent-editor">
      <header class="agent-header">
        <span>{{ activeMeta.eyebrow }}</span>
        <h3>{{ activeProfile?.label ?? activeMeta.label }}</h3>
        <p>{{ activeProfile?.description }}</p>
      </header>

      <section class="settings-card prompt-card">
        <div class="section-heading">
          <div>
            <h4>系统提示词</h4>
            <p>作品、当前位置和已授权长篇工具会在运行时自动补充。</p>
          </div>
          <span>{{ activeAgent.systemPrompt.length }} 字符</span>
        </div>
        <textarea
          v-model="activeAgent.systemPrompt"
          :disabled="formDisabled"
          spellcheck="false"
          aria-label="长篇智能体系统提示词"
          placeholder="输入当前长篇智能体的系统提示词…"
        />
      </section>

      <section class="settings-card">
        <div class="section-heading">
          <div>
            <h4>欢迎快捷按钮</h4>
            <p>空对话欢迎区显示三个快捷提问。</p>
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
              maxlength="200"
              :disabled="formDisabled"
              :aria-label="`长篇欢迎快捷按钮 ${index + 1}`"
            />
          </label>
        </div>
      </section>

      <section class="settings-card immutable-card">
        <div class="section-heading">
          <div>
            <h4>读取、写入与工具边界</h4>
            <p>以下边界由应用内置并在 Main 与工具层强制校验，不能通过设置修改。</p>
          </div>
          <span>固定</span>
        </div>
        <p class="immutable-label">
          读取范围：四个阶段均可读取设定、剧情、正文与连续性账本，互相可读；素材与技能读取范围由内置决定
        </p>
        <div class="immutable-list">
          <span
            v-for="option in WORKSPACE_OPTIONS"
            :key="`read:${option.id}`"
          >
            {{ option.label }}
          </span>
        </div>
        <p class="immutable-label">写入与可用工具</p>
        <div class="immutable-list">
          <span
            v-for="root in immutableProfile.writeAccess.workspaceRoots"
            :key="`root:${root}`"
          >
            {{ WORKSPACE_OPTIONS.find((option) => option.id === root)?.label ?? root }}
          </span>
          <span
            v-for="capability in immutableProfile.writeAccess.capabilities"
            :key="`capability:${capability}`"
          >
            {{ capability }}
          </span>
        </div>
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
          {{ saving ? "保存中…" : "保存长篇智能体设置" }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.panel-state {
  padding: 28px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--text-secondary);
}

.settings-layout {
  display: grid;
  grid-template-columns: minmax(150px, 190px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.agent-nav {
  display: grid;
  gap: 7px;
  position: sticky;
  top: 18px;
}

.agent-nav-item {
  display: grid;
  gap: 3px;
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.agent-nav-item:hover {
  background: var(--surface-hover);
}

.agent-nav-item.is-active {
  border-color: var(--theme-line);
  background: var(--surface-selected);
  color: var(--text-primary);
}

.agent-nav-item small {
  color: var(--text-tertiary);
}

.agent-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.agent-header span,
.section-heading span {
  color: var(--text-tertiary);
  font-size: 12px;
}

.agent-header h3 {
  margin: 4px 0;
  color: var(--text-primary);
  font-size: 20px;
}

.agent-header p,
.section-heading p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.settings-card {
  padding: 16px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 12px;
  background: var(--surface-raised);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.section-heading h4 {
  margin: 0 0 4px;
  color: var(--text-primary);
  font-size: 15px;
}

textarea,
input[type="text"] {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--theme-line);
  border-radius: 9px;
  outline: none;
  background: var(--surface-main);
  color: var(--text-primary);
  font: inherit;
}

textarea {
  min-height: 230px;
  padding: 12px;
  resize: vertical;
  line-height: 1.55;
}

input[type="text"] {
  min-height: 38px;
  padding: 8px 10px;
}

textarea:focus,
input[type="text"]:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.welcome-shortcut-list {
  display: grid;
  gap: 10px;
}

.welcome-shortcut-field {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  color: var(--text-secondary);
}

.immutable-label {
  margin: 10px 0 8px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.immutable-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.immutable-list span {
  padding: 5px 9px;
  border: 1px solid var(--theme-line-soft);
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 12px;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.secondary-button,
.primary-button {
  min-height: 38px;
  padding: 8px 14px;
  border-radius: 9px;
  font: inherit;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid var(--theme-line);
  background: var(--surface-raised);
  color: var(--text-primary);
}

.primary-button {
  border: 1px solid var(--text-primary);
  background: var(--text-primary);
  color: var(--surface-main);
}

button:disabled,
textarea:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

@media (max-width: 760px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .agent-nav {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
