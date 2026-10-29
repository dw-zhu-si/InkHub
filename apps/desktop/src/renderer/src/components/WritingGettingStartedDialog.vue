<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppIcon from "./AppIcon.vue";

type Workflow = "short" | "script" | "long";
type Destination = "create-book" | "library" | "conversation";
type StepId = "topic" | "outline" | "draft" | "quality" | "repair" | "export";
type StepStatus = "done" | "skipped";

interface GuideStep {
  id: StepId;
  title: string;
  summary: string;
  where: string;
  destination: Destination;
}

interface SavedGuideState {
  version: 1;
  workflow: Workflow;
  currentStep: Record<Workflow, StepId>;
  statuses: Record<Workflow, Partial<Record<StepId, StepStatus>>>;
}

const STORAGE_KEY = "inkhub-writing-getting-started-v1";
const workflows: Array<{ id: Workflow; label: string; hint: string }> = [
  { id: "short", label: "短篇", hint: "从创意到成稿，适合单篇完整闭环。" },
  { id: "script", label: "剧本", hint: "聚焦剧本大纲、场次/剧集正文与复审。" },
  { id: "long", label: "长篇", hint: "先分卷规划，再按卷推进剧情点与章卡。" }
];
const stepIds: StepId[] = ["topic", "outline", "draft", "quality", "repair", "export"];

function stepsFor(workflow: Workflow): GuideStep[] {
  const outline = workflow === "long"
    ? { title: "搭建全书与分卷大纲", where: "我的小说 → 选中长篇 → 剧情设计", summary: "先定全书主线，再逐卷设计目标、升级、高潮和卷末结算；剧情点与章卡都归属到对应卷。", destination: "library" as const }
    : workflow === "script"
      ? { title: "设计剧本大纲", where: "选中剧本 → 大纲 / 剧情设计", summary: "明确主题、人物目标、冲突升级、场次或剧集结构，并区分观众看到的信息顺序。", destination: "library" as const }
      : { title: "设计短篇大纲", where: "选中短篇 → 大纲 / 剧情设计", summary: "围绕单一核心冲突安排开端、转折、高潮和结局，控制篇幅并兑现开篇承诺。", destination: "library" as const };
  const draft = workflow === "long"
    ? { title: "按卷写作", where: "选中长篇 → 当前卷章卡 / 正文", summary: "逐章推进，每章对齐所属分卷和剧情点；写作前可查看既有设定与连续性证据。", destination: "library" as const }
    : workflow === "script"
      ? { title: "撰写场次或剧集", where: "选中剧本 → 正文", summary: "按已确认大纲推进场次/剧集，保持人物状态、时间线和场景衔接。", destination: "library" as const }
      : { title: "撰写短篇正文", where: "选中短篇 → 正文", summary: "按大纲逐节完成正文；可单节创作，也可按已有正文目录继续。", destination: "library" as const };
  return [
    { id: "topic", title: "确定故事立项", where: "AI 创作对话 → 故事策划师", summary: "整理题材、读者承诺、核心冲突和候选方向。市场判断要有可核验来源；没有来源时标为推断。", destination: "conversation" },
    { id: "outline", ...outline },
    { id: "draft", ...draft },
    { id: "quality", title: "运行质检", where: "作品工作台 → 质检与续写", summary: "导入或完成正文后执行检查；先看问题证据和涉及卷/章，再决定是否修订。", destination: "library" },
    { id: "repair", title: "审阅并应用修复", where: "质检结果 → AI 修复审阅", summary: "可逐条或批量生成修复建议；逐项检查原文、修复稿与使用的 Agent / Skill，再由作者接受或保留原稿。", destination: "library" },
    { id: "export", title: "导出作品", where: "我的小说 → 选择作品 → 导出", summary: "检查章节顺序、分卷范围和导出格式后生成本地文件；导出不会覆盖原稿。", destination: "library" }
  ];
}

function emptyState(): SavedGuideState {
  return {
    version: 1,
    workflow: "short",
    currentStep: { short: "topic", script: "topic", long: "topic" },
    statuses: { short: {}, script: {}, long: {} }
  };
}

function readState(): SavedGuideState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const base = emptyState();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
    const value = parsed as Partial<SavedGuideState>;
    if (
      value.version !== 1 ||
      !value.currentStep ||
      typeof value.currentStep !== "object" ||
      !value.statuses ||
      typeof value.statuses !== "object"
    ) {
      return base;
    }
    const currentStep = { ...base.currentStep };
    const statuses = { ...base.statuses };
    for (const { id: workflow } of workflows) {
      const candidateStep: unknown = value.currentStep[workflow];
      if (stepIds.includes(candidateStep as StepId)) {
        currentStep[workflow] = candidateStep as StepId;
      }
      const candidateStatuses: unknown = value.statuses[workflow];
      if (
        !candidateStatuses ||
        typeof candidateStatuses !== "object" ||
        Array.isArray(candidateStatuses)
      ) {
        continue;
      }
      const safeStatuses: Partial<Record<StepId, StepStatus>> = {};
      for (const step of stepIds) {
        const status = (candidateStatuses as Record<string, unknown>)[step];
        if (status === "done" || status === "skipped") safeStatuses[step] = status;
      }
      statuses[workflow] = safeStatuses;
    }
    return {
      version: 1,
      workflow: workflows.some(({ id }) => id === value.workflow) ? value.workflow! : "short",
      currentStep,
      statuses
    };
  } catch {
    return emptyState();
  }
}

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  navigate: [destination: Destination];
}>();
const state = ref<SavedGuideState>(readState());
const dialogElement = ref<HTMLElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;
const activeWorkflow = computed(() => state.value.workflow);
const steps = computed(() => stepsFor(activeWorkflow.value));
const activeStepId = computed(() => state.value.currentStep[activeWorkflow.value]);
const activeStep = computed(() => steps.value.find(({ id }) => id === activeStepId.value) ?? steps.value[0]!);
const activeIndex = computed(() => steps.value.findIndex(({ id }) => id === activeStep.value.id));
const completedCount = computed(() => Object.values(state.value.statuses[activeWorkflow.value]).filter(Boolean).length);

watch(state, (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The guide remains usable for this session if storage is unavailable.
  }
}, { deep: true });

watch(() => props.open, (open) => {
  if (open) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    state.value.currentStep[activeWorkflow.value] = activeStep.value.id;
    void nextTick(() => dialogElement.value?.focus());
  } else {
    previouslyFocusedElement?.focus();
    previouslyFocusedElement = null;
  }
}, { immediate: true });

function selectWorkflow(workflow: Workflow): void {
  state.value.workflow = workflow;
  const savedStep = state.value.currentStep[workflow];
  if (!stepsFor(workflow).some(({ id }) => id === savedStep)) {
    state.value.currentStep[workflow] = "topic";
  }
}

function selectStep(id: StepId): void {
  state.value.currentStep[activeWorkflow.value] = id;
}

function mark(status: StepStatus): void {
  const current = activeStep.value;
  state.value.statuses[activeWorkflow.value][current.id] = status;
  const next = steps.value[activeIndex.value + 1];
  if (next) selectStep(next.id);
}

function continueStep(): void {
  emit("navigate", activeStep.value.destination);
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="emit('close')">
      <section
        ref="dialogElement"
        class="workspace-dialog getting-started-dialog"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby="getting-started-title"
        @keydown.esc.stop="emit('close')"
      >
        <header class="getting-started-header">
          <div>
            <span class="dialog-eyebrow">创作空间 · 指引</span>
            <h2 id="getting-started-title">从灵感到成稿</h2>
            <p>按你的作品类型查看完整路径。进度会保存在本机，可随时跳过或回来继续。</p>
          </div>
          <button class="dialog-close" type="button" aria-label="关闭上手向导" @click="emit('close')">×</button>
        </header>

        <div class="getting-started-content">
          <div class="getting-started-workflows" role="group" aria-label="作品类型">
            <button
              v-for="workflow in workflows"
              :key="workflow.id"
              type="button"
              :aria-pressed="activeWorkflow === workflow.id"
              :class="{ 'is-active': activeWorkflow === workflow.id }"
              @click="selectWorkflow(workflow.id)"
            >{{ workflow.label }}</button>
          </div>
          <p class="getting-started-hint">{{ workflows.find(({ id }) => id === activeWorkflow)?.hint }}</p>

          <div class="getting-started-layout">
            <nav class="getting-started-steps" aria-label="创作步骤">
              <button
                v-for="(step, index) in steps"
                :key="step.id"
                type="button"
                :aria-current="activeStep.id === step.id ? 'step' : undefined"
                :class="{ 'is-active': activeStep.id === step.id }"
                @click="selectStep(step.id)"
              >
                <span class="getting-started-step-number">
                  <AppIcon v-if="state.statuses[activeWorkflow][step.id] === 'done'" name="check" :size="13" />
                  <span v-else>{{ index + 1 }}</span>
                </span>
                <span>{{ step.title }}</span>
                <small v-if="state.statuses[activeWorkflow][step.id] === 'skipped'">已跳过</small>
              </button>
            </nav>

            <article class="getting-started-detail" aria-live="polite">
              <span class="getting-started-kicker">步骤 {{ activeIndex + 1 }} / {{ steps.length }} · 已完成或跳过 {{ completedCount }} 项</span>
              <h3>{{ activeStep.title }}</h3>
              <p>{{ activeStep.summary }}</p>
              <div class="getting-started-location">
                <AppIcon name="book" :size="16" />
                <span>{{ activeStep.where }}</span>
              </div>
              <p class="getting-started-boundary">向导只带你前往对应功能，不会自动发起模型请求、写入小说或接受 AI 修复。</p>
              <div class="getting-started-actions">
                <button class="dialog-secondary-button" type="button" @click="mark('skipped')">跳过此步</button>
                <button class="getting-started-complete" type="button" @click="mark('done')">标记完成并继续</button>
                <button class="getting-started-go" type="button" @click="continueStep">前往此功能</button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.getting-started-dialog { width: min(900px, calc(100vw - 32px)); max-height: min(760px, calc(100vh - 32px)); display: flex; flex-direction: column; }
.getting-started-header { display: flex; justify-content: space-between; gap: 20px; padding: 22px 24px; border-bottom: 1px solid var(--theme-line-soft); }
.getting-started-header h2 { margin: 5px 0 4px; color: var(--text-primary); font-size: 1.35rem; }
.getting-started-header p, .getting-started-hint { margin: 0; color: var(--text-secondary); line-height: 1.55; }
.getting-started-content { min-height: 0; overflow: auto; padding: 20px 24px 24px; }
.getting-started-workflows { display: flex; gap: 8px; }
.getting-started-workflows button { border: 1px solid var(--theme-line); border-radius: 9px; padding: 8px 16px; color: var(--text-secondary); background: var(--surface-main); cursor: pointer; }
.getting-started-workflows button.is-active { border-color: var(--accent); color: var(--text-primary); background: var(--surface-selected); }
.getting-started-workflows button:focus-visible, .getting-started-steps button:focus-visible, .getting-started-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.getting-started-hint { margin: 10px 0 18px; }
.getting-started-layout { display: grid; grid-template-columns: minmax(210px, 0.8fr) minmax(0, 1.6fr); gap: 18px; }
.getting-started-steps { display: grid; align-content: start; gap: 6px; }
.getting-started-steps button { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 43px; border: 1px solid transparent; border-radius: 9px; padding: 7px 9px; text-align: left; color: var(--text-secondary); background: transparent; cursor: pointer; }
.getting-started-steps button.is-active { border-color: var(--theme-line); color: var(--text-primary); background: var(--surface-selected); }
.getting-started-step-number { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--theme-line); border-radius: 50%; color: var(--text-secondary); font-size: 0.78rem; }
.getting-started-steps small { color: var(--text-tertiary); }
.getting-started-detail { min-height: 320px; border: 1px solid var(--theme-line); border-radius: 12px; padding: 20px; background: var(--surface-raised); }
.getting-started-kicker { color: var(--accent); font-size: 0.78rem; }
.getting-started-detail h3 { margin: 9px 0; color: var(--text-primary); font-size: 1.2rem; }
.getting-started-detail > p { color: var(--text-secondary); line-height: 1.65; }
.getting-started-location { display: flex; align-items: center; gap: 8px; margin: 18px 0; color: var(--text-primary); }
.getting-started-location :deep(svg) { flex: 0 0 auto; color: var(--accent); }
.getting-started-boundary { padding: 10px 12px; border-radius: 8px; background: var(--surface-muted); font-size: 0.88rem; }
.getting-started-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.getting-started-actions button { min-height: 38px; border: 1px solid var(--theme-line); border-radius: 8px; padding: 7px 12px; color: var(--text-primary); background: var(--surface-main); cursor: pointer; }
.getting-started-actions .getting-started-complete { background: var(--surface-selected); }
.getting-started-actions .getting-started-go { border-color: transparent; color: var(--surface-main); background: var(--text-primary); }
@media (max-width: 680px) { .getting-started-layout { grid-template-columns: 1fr; } .getting-started-detail { min-height: 0; } .getting-started-actions { justify-content: stretch; } .getting-started-actions button { flex: 1 1 130px; } }
</style>
