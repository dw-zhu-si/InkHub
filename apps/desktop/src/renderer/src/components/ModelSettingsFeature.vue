<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  BUILT_IN_REASONING_LEVELS,
  type BuiltInReasoningLevel,
  type ModelApi,
  type ModelConfig,
  type ModelConfigInput,
  type ModelSettings,
  type ModelSettingsInput,
  type ReasoningLevel,
  type RemoteModelListItem,
  type TemperatureOptions,
  type ThinkingLevelOptions,
  type ThinkingLevel
} from "@deepwrite/contracts";
import { createId } from "@deepwrite/shared";
import { uiMessage } from "../ui-feedback";
import { mergeCustomModelSettings } from "../utils/customModelSettings";
import AppIcon from "./AppIcon.vue";
import PopupSelect from "./PopupSelect.vue";

interface DraftModel extends ModelConfig {
  apiKey?: string;
  clearApiKey?: boolean;
  customThinkingLevel?: string;
  originalId?: string;
}

type ModelConfigRow =
  | { key: string; type: "model"; model: DraftModel }
  | { key: string; type: "editor" };

const props = withDefaults(defineProps<{
  active?: boolean;
  modelScope?: "all" | "custom";
  embedded?: boolean;
  modelSettings: ModelSettings | null;
  modelLoading: boolean;
  modelSaving: boolean;
  freeModelsRefreshing: boolean;
  modelError: string | null;
  modelTestMessage: string | null;
  testingModelId: string | null;
}>(), {
  active: false,
  modelScope: "all",
  embedded: false
});
const emit = defineEmits<{
  saveModels: [settings: ModelSettingsInput];
  refreshFreeModels: [];
  testModel: [model: ModelConfigInput];
}>();

const MANUAL_MODEL_ID_VALUE = "__deepwrite-manual-model-id__";
const CUSTOM_MODEL_PROVIDER_VALUE = "__custom-model-provider__";

const draftModels = ref<DraftModel[]>([]);
const draftDefaultModelId = ref("");
const modelEditor = ref<DraftModel | null>(null);
const modelConfigScrollArea = ref<HTMLElement | null>(null);
const fetchedRemoteModels = ref<RemoteModelListItem[]>([]);
const listingRemoteModels = ref(false);
const fetchHintDialog = ref<string | null>(null);
const fetchHintConfirmButton = ref<HTMLButtonElement | null>(null);
const customModelProviderMode = ref(false);
const modelConfigRows = computed<ModelConfigRow[]>(() => {
  const rows: ModelConfigRow[] = [];
  const editedModelId = modelEditor.value?.originalId;

  for (const model of draftModels.value) {
    rows.push({ key: `model:${model.id}`, type: "model", model });
    if (editedModelId === model.id) {
      rows.push({ key: `editor:${model.id}`, type: "editor" });
    }
  }

  if (modelEditor.value && !editedModelId) {
    rows.push({ key: `editor:${modelEditor.value.id}`, type: "editor" });
  }

  return rows;
});

const builtInThinkingLabels: Record<BuiltInReasoningLevel, string> = {
  minimal: "最低",
  low: "较低",
  medium: "标准",
  high: "深度",
  xhigh: "极高",
  max: "最高"
};
const reasoningOptions = BUILT_IN_REASONING_LEVELS.map((value) => ({
  value,
  label: builtInThinkingLabels[value]
}));
interface ProviderPreset {
  value: string;
  label: string;
  api: ModelApi;
  baseUrl: string;
  supportsDeveloperRole?: boolean;
}

const providerPresets: readonly ProviderPreset[] = [
  { value: "modelhub", label: "ModelHub（推荐）", api: "openai-completions", baseUrl: "http://127.0.0.1:11435/v1", supportsDeveloperRole: false },
  { value: "openai", label: "OpenAI", api: "openai-responses", baseUrl: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic / Claude", api: "anthropic-messages", baseUrl: "https://api.anthropic.com" },
  { value: "google", label: "Google Gemini", api: "google-generative-ai", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { value: "xai", label: "xAI / Grok", api: "openai-responses", baseUrl: "https://api.x.ai/v1" },
  { value: "deepseek", label: "DeepSeek", api: "openai-completions", baseUrl: "https://api.deepseek.com", supportsDeveloperRole: false },
  { value: "dashscope", label: "阿里巴巴 / 通义千问 Qwen", api: "openai-completions", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", supportsDeveloperRole: false },
  { value: "doubao", label: "字节跳动 / 豆包", api: "openai-completions", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { value: "zhipu", label: "智谱 AI / GLM", api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", supportsDeveloperRole: false },
  { value: "moonshot", label: "月之暗面 / Kimi", api: "openai-completions", baseUrl: "https://api.moonshot.cn/v1" },
  { value: "minimax", label: "MiniMax", api: "openai-completions", baseUrl: "https://api.minimaxi.com/v1" },
  { value: "baidu-qianfan", label: "百度智能云 / 千帆", api: "openai-completions", baseUrl: "https://qianfan.baidubce.com/v2" },
  { value: "tencent-hunyuan", label: "腾讯 / 混元 TokenHub", api: "openai-completions", baseUrl: "https://tokenhub.tencentmaas.com/v1" },
  { value: "lingyiwanwu", label: "零一万物", api: "openai-completions", baseUrl: "https://api.lingyiwanwu.com/v1" },
  { value: "stepfun", label: "阶跃星辰", api: "openai-completions", baseUrl: "https://api.stepfun.com/v1" },
  { value: "mistral", label: "Mistral AI", api: "openai-completions", baseUrl: "https://api.mistral.ai/v1" },
  { value: "cohere", label: "Cohere", api: "openai-completions", baseUrl: "https://api.cohere.ai/compatibility/v1" },
  { value: "nvidia", label: "NVIDIA NIM", api: "openai-completions", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { value: "siliconflow", label: "硅基流动 SiliconFlow", api: "openai-completions", baseUrl: "https://api.siliconflow.cn/v1" },
  { value: "openrouter", label: "OpenRouter", api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1" },
  { value: "together", label: "Together AI", api: "openai-completions", baseUrl: "https://api.together.xyz/v1" },
  { value: "groq", label: "Groq", api: "openai-completions", baseUrl: "https://api.groq.com/openai/v1" },
  { value: "fireworks", label: "Fireworks AI", api: "openai-completions", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { value: "perplexity", label: "Perplexity", api: "openai-completions", baseUrl: "https://api.perplexity.ai" },
  { value: "ollama", label: "Ollama（本机）", api: "openai-completions", baseUrl: "http://127.0.0.1:11434/v1", supportsDeveloperRole: false },
  { value: "lm-studio", label: "LM Studio（本机）", api: "openai-completions", baseUrl: "http://127.0.0.1:1234/v1", supportsDeveloperRole: false }
];
const providerOptions = [
  ...providerPresets.map(({ value, label }) => ({ value, label })),
  { value: CUSTOM_MODEL_PROVIDER_VALUE, label: "其他厂家 / 自定义兼容 API" }
];
const deepwriteFreeModels = computed(() => props.modelSettings?.deepwriteFreeModels ?? []);
const deepwriteFreeModelOptions = computed(() =>
  deepwriteFreeModels.value.map((model) => ({
    value: model.id,
    label: model.label,
    description: model.modelId,
    title: model.modelId
  }))
);
const isDeepWriteFreeEditor = computed(
  () => modelEditor.value?.managedBy === "deepwrite-free"
);
const canSelectRemoteModel = computed(() => fetchedRemoteModels.value.length > 0);
const remoteModelOptions = computed(() => {
  const current = modelEditor.value?.modelId.trim() ?? "";
  const options = fetchedRemoteModels.value.map((model) => ({
    value: model.id,
    label: model.label && model.label !== model.id ? model.label : model.id,
    ...(model.label && model.label !== model.id
      ? { description: model.id, title: model.id }
      : { title: model.id })
  }));
  if (current && !options.some((option) => option.value === current)) {
    options.unshift({
      value: current,
      label: current,
      title: current
    });
  }
  options.push({
    value: MANUAL_MODEL_ID_VALUE,
    label: "手动输入其他模型 ID",
    title: "返回手动填写"
  });
  return options;
});
const apiOptions: ReadonlyArray<{ value: ModelApi; label: string }> = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" }
];
const modelModeOptions = [
  { value: "reasoning", label: "思考模式" },
  { value: "temperature", label: "不思考模式" }
] as const;
const defaultThinkingOptions = computed(() =>
  (modelEditor.value?.thinkingLevelOptions ?? []).map((level) => ({
    value: level,
    label: thinkingLabel(level),
    title: level
  }))
);
const customThinkingLevelPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isBuiltInThinkingLevel(level: string): level is BuiltInReasoningLevel {
  return BUILT_IN_REASONING_LEVELS.some((candidate) => candidate === level);
}

function findCustomThinkingLevel(options: ThinkingLevelOptions): string {
  return options.find((level) => !isBuiltInThinkingLevel(level)) ?? "";
}

function isValidCustomThinkingLevel(level: string): boolean {
  return (
    level.length <= 64 &&
    level !== "off" &&
    !isBuiltInThinkingLevel(level) &&
    customThinkingLevelPattern.test(level)
  );
}

function cloneTemperatureOptions(options: TemperatureOptions): TemperatureOptions {
  return [options[0], options[1], options[2]];
}

function cloneThinkingLevelOptions(options: ThinkingLevelOptions): ThinkingLevelOptions {
  return [...options];
}

function thinkingLabel(level: ThinkingLevel): string {
  if (level === "off") {
    return "关闭";
  }
  return isBuiltInThinkingLevel(level)
    ? builtInThinkingLabels[level]
    : `自定义（${level}）`;
}

function isPresetModelProvider(provider: string): boolean {
  return providerPresets.some((preset) => preset.value === provider);
}

function prepareModelProviderEditor(provider?: string): void {
  customModelProviderMode.value = Boolean(provider && !isPresetModelProvider(provider));
}

function selectedModelProvider(provider?: string): string {
  if (customModelProviderMode.value) {
    return CUSTOM_MODEL_PROVIDER_VALUE;
  }
  return provider && isPresetModelProvider(provider)
    ? provider
    : CUSTOM_MODEL_PROVIDER_VALUE;
}

function updateCustomModelProvider(event: Event): void {
  const editor = modelEditor.value;
  if (!editor) {
    return;
  }
  editor.provider = (event.target as HTMLInputElement).value;
}

function modelProviderLabel(provider: string): string {
  return providerPresets.find((preset) => preset.value === provider)?.label ?? provider;
}

function resetModelDraft(settings: ModelSettings | null): void {
  draftModels.value = (settings?.models ?? [])
    .filter((model) => props.modelScope === "all" || !model.managedBy)
    .map((model) => ({
      ...model,
      thinkingLevelOptions: cloneThinkingLevelOptions(model.thinkingLevelOptions),
      temperatureOptions: cloneTemperatureOptions(model.temperatureOptions),
      customThinkingLevel: findCustomThinkingLevel(model.thinkingLevelOptions)
    }));
  draftDefaultModelId.value = settings?.defaultModelId ?? "";
  modelEditor.value = null;
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      resetModelDraft(props.modelSettings);
    }
  },
  { immediate: true }
);

watch(
  () => [props.modelSettings, props.modelSaving] as const,
  ([settings, saving]) => {
    if (props.active && !saving) {
      const editor = modelEditor.value;
      if (editor?.managedBy === "deepwrite-free" && settings) {
        draftModels.value = draftModels.value.map((model) => {
          if (model.managedBy !== "deepwrite-free") {
            return model;
          }
          const refreshed = settings.models.find((candidate) => candidate.id === model.id);
          return refreshed
            ? {
                ...refreshed,
                thinkingLevelOptions: cloneThinkingLevelOptions(
                  refreshed.thinkingLevelOptions
                ),
                temperatureOptions: cloneTemperatureOptions(refreshed.temperatureOptions),
                customThinkingLevel: findCustomThinkingLevel(
                  refreshed.thinkingLevelOptions
                )
              }
            : model;
        });
        const refreshedEditor =
          settings.deepwriteFreeModels?.find((candidate) => candidate.id === editor.id) ??
          settings.deepwriteFreeModels?.find(
            (candidate) => candidate.id === settings.deepwriteFreeDefaultModelId
          ) ??
          settings.deepwriteFreeModels?.[0];
        if (refreshedEditor) {
          modelEditor.value = {
            ...refreshedEditor,
            apiKey: "",
            clearApiKey: false,
            customThinkingLevel: findCustomThinkingLevel(
              refreshedEditor.thinkingLevelOptions
            ),
            ...(editor.originalId ? { originalId: editor.originalId } : {})
          };
        }
        return;
      }
      resetModelDraft(settings);
    }
  }
);

watch(
  () => props.modelError,
  (error) => {
    if (error) {
      uiMessage.error(error);
    }
  }
);

watch(
  () => props.modelTestMessage,
  (successMessage) => {
    if (successMessage) {
      uiMessage.success(successMessage);
    }
  }
);

watch(
  () =>
    modelEditor.value
      ? [
          modelEditor.value.id,
          modelEditor.value.provider,
          modelEditor.value.api,
          modelEditor.value.baseUrl.trim()
        ]
      : null,
  () => {
    fetchedRemoteModels.value = [];
  }
);

watch(fetchHintDialog, (message) => {
  if (message) {
    void nextTick(() => fetchHintConfirmButton.value?.focus());
  }
});

function createModel(): void {
  prepareModelProviderEditor("modelhub");
  modelEditor.value = {
    id: createId("model"),
    label: "",
    provider: "modelhub",
    modelId: "",
    supportsDeveloperRole: false,
    api: "openai-completions",
    baseUrl: "http://127.0.0.1:11435/v1",
    reasoning: true,
    defaultThinkingLevel: "medium",
    thinkingLevelOptions: [...BUILT_IN_REASONING_LEVELS],
    temperatureOptions: [0.1, 0.7, 1],
    hasApiKey: false,
    apiKey: "",
    customThinkingLevel: ""
  };
  scrollModelEditorIntoView();
}

function editModel(model: DraftModel): void {
  if (model.managedBy === "deepwrite-official") {
    return;
  }
  prepareModelProviderEditor(model.provider);
  modelEditor.value = {
    ...model,
    thinkingLevelOptions: cloneThinkingLevelOptions(model.thinkingLevelOptions),
    temperatureOptions: cloneTemperatureOptions(model.temperatureOptions),
    apiKey: "",
    clearApiKey: false,
    customThinkingLevel: findCustomThinkingLevel(model.thinkingLevelOptions),
    originalId: model.id
  };
  scrollModelEditorIntoView();
}

function scrollModelEditorIntoView(): void {
  void nextTick(() => {
    modelConfigScrollArea.value
      ?.querySelector<HTMLElement>(".model-editor")
      ?.scrollIntoView({ block: "nearest", behavior: "auto" });
  });
}

function applyDeepWriteFreeModel(modelId: string): void {
  const editor = modelEditor.value;
  const preset = deepwriteFreeModels.value.find((model) => model.id === modelId);
  if (!editor || !preset) {
    uiMessage.warning(
      props.modelSettings?.deepwriteFreeMessage ||
        "旧版兼容免费模型配置暂时不可用，请稍后重试。"
    );
    return;
  }
  prepareModelProviderEditor(preset.provider);
  modelEditor.value = {
    ...preset,
    apiKey: "",
    clearApiKey: false,
    customThinkingLevel: findCustomThinkingLevel(preset.thinkingLevelOptions),
    ...(editor.originalId ? { originalId: editor.originalId } : {})
  };
}

function applyProviderPreset(provider: string): void {
  const editor = modelEditor.value;
  if (!editor) {
    return;
  }
  if (provider === "deepwrite-free") {
    const defaultModelId =
      props.modelSettings?.deepwriteFreeDefaultModelId ??
      deepwriteFreeModels.value[0]?.id;
    if (defaultModelId) {
      applyDeepWriteFreeModel(defaultModelId);
    } else {
      uiMessage.warning(
        props.modelSettings?.deepwriteFreeMessage ||
          "旧版兼容免费模型配置暂时不可用，请稍后重试。"
      );
    }
    return;
  }
  const wasManaged = editor.managedBy === "deepwrite-free";
  delete editor.managedBy;
  if (wasManaged && !editor.originalId) {
    editor.id = createId("model");
  }
  if (wasManaged) {
    editor.label = "";
    editor.modelId = "";
    editor.hasApiKey = false;
    editor.apiKey = "";
    editor.clearApiKey = false;
  }
  if (provider === CUSTOM_MODEL_PROVIDER_VALUE) {
    customModelProviderMode.value = true;
    editor.provider = "";
    editor.baseUrl = "";
    editor.api = "openai-completions";
    delete editor.supportsDeveloperRole;
    return;
  }
  const preset = providerPresets.find((candidate) => candidate.value === provider);
  if (!preset) {
    return;
  }
  customModelProviderMode.value = false;
  editor.provider = preset.value;
  editor.api = preset.api;
  editor.baseUrl = preset.baseUrl;
  if (preset.supportsDeveloperRole === undefined) {
    delete editor.supportsDeveloperRole;
  } else {
    editor.supportsDeveloperRole = preset.supportsDeveloperRole;
  }
}

function setModelApi(value: string | number): void {
  if (modelEditor.value) {
    modelEditor.value.api = String(value) as ModelApi;
  }
}

function setDefaultThinkingLevel(value: string | number): void {
  if (modelEditor.value) {
    modelEditor.value.defaultThinkingLevel = String(value);
  }
}

function setModelMode(mode: "reasoning" | "temperature"): void {
  if (!modelEditor.value) {
    return;
  }
  const reasoning = mode === "reasoning";
  modelEditor.value.reasoning = reasoning;
  modelEditor.value.defaultThinkingLevel = reasoning
    ? modelEditor.value.thinkingLevelOptions.includes("medium")
      ? "medium"
      : modelEditor.value.thinkingLevelOptions[0] ?? "medium"
    : "off";
}

function toggleThinkingLevelOption(level: BuiltInReasoningLevel, event: Event): void {
  const editor = modelEditor.value;
  if (!editor) {
    return;
  }
  const input = event.target as HTMLInputElement;
  const checked = input.checked;
  if (!checked && editor.thinkingLevelOptions.length === 1) {
    input.checked = true;
    uiMessage.warning("思考模式至少需要保留一个思考等级。");
    return;
  }
  const selected = new Set(editor.thinkingLevelOptions);
  if (checked) {
    selected.add(level);
  } else {
    selected.delete(level);
  }
  const customLevel = findCustomThinkingLevel(editor.thinkingLevelOptions);
  editor.thinkingLevelOptions = reasoningOptions
    .map((option) => option.value)
    .filter((option) => selected.has(option)) as ThinkingLevelOptions;
  if (customLevel) {
    editor.thinkingLevelOptions.push(customLevel);
  }
  if (
    editor.reasoning &&
    !editor.thinkingLevelOptions.includes(editor.defaultThinkingLevel as ReasoningLevel)
  ) {
    editor.defaultThinkingLevel = editor.thinkingLevelOptions[0] ?? "medium";
  }
}

function updateCustomThinkingLevel(event: Event): void {
  const editor = modelEditor.value;
  if (!editor) {
    return;
  }
  const previousCustomLevel = findCustomThinkingLevel(editor.thinkingLevelOptions);
  const customWasDefault = previousCustomLevel === editor.defaultThinkingLevel;
  const rawValue = (event.target as HTMLInputElement).value;
  const customLevel = rawValue.trim();
  editor.customThinkingLevel = rawValue;
  editor.thinkingLevelOptions = editor.thinkingLevelOptions.filter(isBuiltInThinkingLevel);
  if (isValidCustomThinkingLevel(customLevel)) {
    editor.thinkingLevelOptions.push(customLevel);
  }
  if (customWasDefault) {
    editor.defaultThinkingLevel = isValidCustomThinkingLevel(customLevel)
      ? customLevel
      : editor.thinkingLevelOptions[0] ?? "medium";
  }
}

function saveModelEditor(): void {
  const editor = modelEditor.value;
  if (!editor) {
    return;
  }
  if (!editor.label.trim() || !editor.provider.trim() || !editor.modelId.trim()) {
    uiMessage.warning("请填写名称、模型厂家和模型 ID。");
    return;
  }
  if (!editor.baseUrl.trim()) {
    uiMessage.warning("请填写 API 地址。");
    return;
  }
  const customThinkingLevel = editor.customThinkingLevel?.trim() ?? "";
  if (customThinkingLevel && !isValidCustomThinkingLevel(customThinkingLevel)) {
    uiMessage.warning(
      "自定义思考等级不能与内置等级重复，且只能包含英文字母、数字、点、下划线或连字符。"
    );
    return;
  }
  if (
    !editor.reasoning &&
    (editor.temperatureOptions.some(
      (temperature) => !Number.isFinite(temperature) || temperature < 0 || temperature > 2
    ) ||
      new Set(editor.temperatureOptions).size !== editor.temperatureOptions.length)
  ) {
    uiMessage.warning("请填写 3 个不同的温度值，范围为 0 到 2。");
    return;
  }
  if (
    editor.reasoning &&
    (!editor.thinkingLevelOptions.length ||
      !editor.thinkingLevelOptions.includes(editor.defaultThinkingLevel as ReasoningLevel))
  ) {
    uiMessage.warning("请配置至少一个思考等级，并选择有效的默认等级。");
    return;
  }
  const {
    apiKey,
    customThinkingLevel: _customThinkingLevel,
    originalId,
    ...editorWithoutApiKey
  } = editor;
  const normalized: DraftModel = {
    ...editorWithoutApiKey,
    label: editor.label.trim(),
    provider: editor.provider.trim().toLowerCase(),
    modelId: editor.modelId.trim(),
    baseUrl: editor.baseUrl.trim(),
    defaultThinkingLevel: editor.reasoning ? editor.defaultThinkingLevel : "off",
    thinkingLevelOptions: cloneThinkingLevelOptions(editor.thinkingLevelOptions),
    temperatureOptions: cloneTemperatureOptions(editor.temperatureOptions),
    ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {})
  };
  const index = draftModels.value.findIndex(
    (model) => model.id === (originalId ?? normalized.id)
  );
  const duplicateIndex = draftModels.value.findIndex(
    (model, candidateIndex) => model.id === normalized.id && candidateIndex !== index
  );
  if (duplicateIndex >= 0) {
    uiMessage.warning("这个旧版兼容免费模型已经添加过了。");
    return;
  }
  if (index >= 0) {
    draftModels.value[index] = normalized;
  } else {
    draftModels.value.push(normalized);
  }
  if (!draftDefaultModelId.value) {
    draftDefaultModelId.value = normalized.id;
  }
  modelEditor.value = null;
}

function toModelInput(model: DraftModel): ModelConfigInput {
  return {
    id: model.id,
    label: model.label.trim(),
    provider: model.provider.trim().toLowerCase(),
    modelId: model.modelId.trim(),
    ...(model.requestModelId ? { requestModelId: model.requestModelId } : {}),
    ...(model.supportsDeveloperRole !== undefined
      ? { supportsDeveloperRole: model.supportsDeveloperRole }
      : {}),
    api: model.api,
    baseUrl: model.baseUrl.trim(),
    reasoning: model.reasoning,
    defaultThinkingLevel: model.reasoning ? model.defaultThinkingLevel : "off",
    thinkingLevelOptions: cloneThinkingLevelOptions(model.thinkingLevelOptions),
    temperatureOptions: cloneTemperatureOptions(model.temperatureOptions),
    ...(model.managedBy ? { managedBy: model.managedBy } : {}),
    ...(model.apiKey?.trim() ? { apiKey: model.apiKey.trim() } : {}),
    ...(model.clearApiKey ? { clearApiKey: true } : {})
  };
}

function missingRemoteModelCredentials(editor: DraftModel): string | null {
  const missingUrl = !editor.baseUrl.trim();
  const localKeyOptional = ["ollama", "lm-studio"].includes(
    editor.provider.trim().toLowerCase()
  );
  const missingKey = !localKeyOptional && !editor.apiKey?.trim() && !editor.hasApiKey;
  if (missingUrl && missingKey) {
    return "请先填写 API 地址和 API Key，再拉取可用模型。";
  }
  if (missingUrl) {
    return "请先填写 API 地址，再拉取可用模型。";
  }
  if (missingKey) {
    return "请先填写 API Key，再拉取可用模型。";
  }
  return null;
}

function commandErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback;
  }
  const separator = error.message.indexOf(": ");
  return separator >= 0 ? error.message.slice(separator + 2) : error.message;
}

function setFetchedModelId(value: string | number): void {
  const editor = modelEditor.value;
  if (!editor) {
    return;
  }
  if (String(value) === MANUAL_MODEL_ID_VALUE) {
    fetchedRemoteModels.value = [];
    return;
  }
  editor.modelId = String(value);
}

async function fetchRemoteModels(): Promise<void> {
  const editor = modelEditor.value;
  if (!editor || listingRemoteModels.value) {
    return;
  }
  const missing = missingRemoteModelCredentials(editor);
  if (missing) {
    fetchHintDialog.value = missing;
    return;
  }
  if (!window.deepwrite) {
    uiMessage.error("当前环境无法拉取模型列表。");
    return;
  }
  listingRemoteModels.value = true;
  try {
    const result = await window.deepwrite.models.listRemote({
      id: editor.originalId ?? editor.id,
      provider: editor.provider.trim(),
      api: editor.api,
      baseUrl: editor.baseUrl.trim(),
      ...(editor.apiKey?.trim() ? { apiKey: editor.apiKey.trim() } : {}),
      ...(editor.clearApiKey ? { clearApiKey: true } : {})
    });
    fetchedRemoteModels.value = result.models;
    if (result.models.length === 0) {
      uiMessage.warning("当前接口没有返回可用模型。");
      return;
    }
    if (!editor.modelId.trim()) {
      editor.modelId = result.models[0]!.id;
    }
    uiMessage.success(`已拉取 ${result.models.length} 个可用模型，请选择模型 ID。`);
  } catch (error: unknown) {
    uiMessage.error(commandErrorMessage(error, "拉取模型列表失败。"));
  } finally {
    listingRemoteModels.value = false;
  }
}

function testDraftModel(model: DraftModel): void {
  if (!model.label.trim() || !model.provider.trim() || !model.modelId.trim()) {
    uiMessage.warning("请先填写名称、模型厂家和模型 ID，再测试连接。");
    return;
  }
  emit("testModel", toModelInput(model));
}

function removeModel(modelId: string): void {
  if (
    draftModels.value.find((model) => model.id === modelId)?.managedBy ===
    "deepwrite-official"
  ) {
    return;
  }
  draftModels.value = draftModels.value.filter((model) => model.id !== modelId);
  if (draftDefaultModelId.value === modelId) {
    if (props.modelScope === "custom") {
      const remainingCustomIds = new Set(draftModels.value.map((model) => model.id));
      draftDefaultModelId.value =
        props.modelSettings?.models.find(
          (model) => model.id !== modelId && (Boolean(model.managedBy) || remainingCustomIds.has(model.id))
        )?.id ?? draftModels.value[0]?.id ?? "";
    } else {
      draftDefaultModelId.value = draftModels.value[0]?.id ?? "";
    }
  }
  if (modelEditor.value?.id === modelId) {
    modelEditor.value = null;
  }
}

function setDefaultModel(modelId: string): void {
  if (
    props.modelSaving ||
    modelEditor.value ||
    draftDefaultModelId.value === modelId
  ) {
    return;
  }
  draftDefaultModelId.value = modelId;
  submitModelSettings();
}

function submitModelSettings(): void {
  const draftInputs = draftModels.value.map(toModelInput);
  if (props.modelScope === "custom") {
    emit(
      "saveModels",
      mergeCustomModelSettings(
        (props.modelSettings?.models ?? []).map(toModelInput),
        draftInputs,
        draftDefaultModelId.value
      )
    );
    return;
  }
  emit("saveModels", {
    models: draftInputs,
    defaultModelId: draftDefaultModelId.value || draftInputs[0]?.id || ""
  });
}

function discardModelChanges(): void {
  resetModelDraft(props.modelSettings);
}
</script>

<template>
      <section
        class="workspace-settings-panel is-model-config"
        :class="{ 'is-embedded': embedded }"
      >
        <header v-if="!embedded">
          <div>
            <span class="dialog-eyebrow">墨枢 · MULTI MODEL</span>
            <h2>模型配置</h2>
          </div>
        </header>

        <div class="dialog-content model-config-content">
          <div ref="modelConfigScrollArea" class="model-config-scroll-area">
            <div v-if="modelLoading" class="dialog-note">正在读取模型配置…</div>
            <template v-else>
              <div v-if="draftModels.length === 0" class="model-empty-state">
                <strong>{{ modelScope === "custom" ? "尚未配置自定义模型" : "尚未配置真实模型" }}</strong>
                <span>可直接添加各厂家 API，也可使用推荐的 ModelHub 统一管理和切换模型。</span>
              </div>

              <template v-for="row in modelConfigRows" :key="row.key">
              <section v-if="row.type === 'editor' && modelEditor" class="model-editor">
                <div class="model-editor-heading">
                  <strong>{{ draftModels.some((model) => model.id === (modelEditor?.originalId ?? modelEditor?.id)) ? "编辑模型" : "添加模型" }}</strong>
                  <button type="button" @click="modelEditor = null">取消</button>
                </div>
                <div class="model-form-grid">
                  <label>
                    <span>名称</span>
                    <input
                      v-model="modelEditor.label"
                      type="text"
                      placeholder="例如：我的小说写作模型"
                      :readonly="isDeepWriteFreeEditor"
                    />
                  </label>
                  <label>
                    <span>模型厂家 / 接入方式</span>
                    <PopupSelect
                      :model-value="isDeepWriteFreeEditor ? 'deepwrite-free' : selectedModelProvider(modelEditor.provider)"
                      :options="providerOptions"
                      accessible-label="选择模型厂家或接入方式"
                      :menu-min-width="300"
                      @update:model-value="applyProviderPreset(String($event))"
                    />
                  </label>
                  <label v-if="!isDeepWriteFreeEditor && customModelProviderMode">
                    <span>自定义 Provider ID</span>
                    <input
                      :value="modelEditor.provider"
                      type="text"
                      maxlength="120"
                      placeholder="例如：my-provider"
                      @input="updateCustomModelProvider"
                    />
                  </label>
                  <p v-if="!isDeepWriteFreeEditor" class="model-managed-note is-wide">
                    推荐安装 ModelHub 统一管理厂家密钥、模型路由、用量和故障切换；也可在下方直接配置厂家 API。
                    <a href="https://apps.apple.com/cn/app/id6797847364" target="_blank" rel="noreferrer">App Store 下载</a>
                    ·
                    <a href="https://github.com/dw-zhu-si/ModelHub" target="_blank" rel="noreferrer">GitHub</a>
                  </p>
                  <label>
                    <span>模型 ID</span>
                    <PopupSelect
                      v-if="isDeepWriteFreeEditor"
                      :model-value="modelEditor.id"
                      :options="deepwriteFreeModelOptions"
                      accessible-label="选择旧版兼容免费模型"
                      :menu-min-width="300"
                      @update:model-value="applyDeepWriteFreeModel(String($event))"
                    />
                    <div v-else class="model-id-field">
                      <PopupSelect
                        v-if="canSelectRemoteModel"
                        :model-value="modelEditor.modelId"
                        :options="remoteModelOptions"
                        accessible-label="选择模型 ID"
                        placeholder="请选择模型 ID"
                        :menu-min-width="280"
                        :disabled="listingRemoteModels"
                        @update:model-value="setFetchedModelId"
                      />
                      <input
                        v-else
                        v-model="modelEditor.modelId"
                        type="text"
                        placeholder="拉取厂家目录或手动填写模型 ID"
                      />
                      <button
                        class="model-id-fetch-button"
                        type="button"
                        :disabled="listingRemoteModels"
                        :title="listingRemoteModels ? '拉取中…' : '根据 API 地址和 Key 拉取可用模型'"
                        :aria-label="listingRemoteModels ? '拉取中' : '拉取可用模型'"
                        @click="fetchRemoteModels"
                      >
                        {{ listingRemoteModels ? "拉取中" : "拉取" }}
                      </button>
                    </div>
                  </label>
                  <label v-if="!isDeepWriteFreeEditor">
                    <span>兼容协议</span>
                    <PopupSelect
                      :model-value="modelEditor.api"
                      :options="apiOptions"
                      accessible-label="选择 API 类型"
                      :menu-min-width="240"
                      @update:model-value="setModelApi"
                    />
                  </label>
                  <label v-if="!isDeepWriteFreeEditor" class="is-wide">
                    <span>API 地址</span>
                    <input v-model="modelEditor.baseUrl" type="url" placeholder="https://api.example.com/v1" />
                  </label>
                  <label v-if="!isDeepWriteFreeEditor" class="is-wide">
                    <span>{{ modelEditor.provider === "modelhub" ? "ModelHub 项目网关令牌" : "API Key" }}</span>
                    <input
                      v-model="modelEditor.apiKey"
                      type="password"
                      :placeholder="modelEditor.hasApiKey ? '已安全保存；留空表示保持不变' : modelEditor.provider === 'modelhub' ? '不要填写 ModelHub Agent/MCP Token' : '请填写该厂家的 API Key'"
                      autocomplete="new-password"
                      @input="modelEditor.clearApiKey = false"
                    />
                  </label>
                  <label v-if="!isDeepWriteFreeEditor">
                    <span>模型模式</span>
                    <PopupSelect
                      :model-value="modelEditor.reasoning ? 'reasoning' : 'temperature'"
                      :options="modelModeOptions"
                      accessible-label="选择模型模式"
                      @update:model-value="setModelMode(String($event) as 'reasoning' | 'temperature')"
                    />
                  </label>
                  <label v-if="!isDeepWriteFreeEditor && modelEditor.reasoning">
                    <span>默认思考等级</span>
                    <PopupSelect
                      :model-value="modelEditor.defaultThinkingLevel"
                      :options="defaultThinkingOptions"
                      accessible-label="选择默认思考等级"
                      @update:model-value="setDefaultThinkingLevel"
                    />
                  </label>
                  <label v-else-if="!isDeepWriteFreeEditor">
                    <span class="model-field-label">
                      温度选项
                      <span
                        class="model-help-icon"
                        tabindex="0"
                        aria-label="温度说明：温度越低，输出越稳定和确定；温度越高，表达越多样和有创造性。可填写 0 到 2。"
                        data-tooltip="温度越低，输出越稳定、确定；温度越高，表达越多样、有创造性。可填写 0–2。"
                      >!</span>
                    </span>
                    <span class="model-temperature-options">
                      <input
                        v-for="(_, index) in modelEditor.temperatureOptions"
                        :key="index"
                        v-model.number="modelEditor.temperatureOptions[index]"
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        :aria-label="`温度选项 ${index + 1}`"
                      />
                    </span>
                  </label>
                  <label v-if="!isDeepWriteFreeEditor && modelEditor.reasoning" class="is-wide">
                    <span>思考等级选项</span>
                    <span class="model-thinking-options">
                      <label
                        v-for="option in reasoningOptions"
                        :key="option.value"
                        class="model-thinking-option"
                        tabindex="0"
                        :title="option.value"
                        :data-tooltip="option.value"
                      >
                        <input
                          type="checkbox"
                          :checked="modelEditor.thinkingLevelOptions.includes(option.value)"
                          @change="toggleThinkingLevelOption(option.value, $event)"
                        />
                        <span>{{ option.label }}</span>
                      </label>
                      <span
                        class="model-custom-thinking"
                        :title="modelEditor.customThinkingLevel?.trim() || 'custom'"
                        :data-tooltip="modelEditor.customThinkingLevel?.trim() || 'custom'"
                      >
                        <span>自定义</span>
                        <input
                          :value="modelEditor.customThinkingLevel"
                          type="text"
                          maxlength="64"
                          placeholder="例如 ultra"
                          aria-label="自定义思考等级英文值"
                          @input="updateCustomThinkingLevel"
                        />
                      </span>
                    </span>
                  </label>
                  <p v-if="isDeepWriteFreeEditor" class="model-managed-note is-wide">
                    这是为旧版数据保留的兼容模型；名称和参数由兼容配置自动维护，运行环境提供密钥，无需在此填写。
                  </p>
                </div>
                <div
                  v-if="modelEditor.hasApiKey && !isDeepWriteFreeEditor"
                  class="model-key-row"
                >
                  <span>已有密钥会保持不变。</span>
                  <button
                    type="button"
                    @click="modelEditor.hasApiKey = false; modelEditor.clearApiKey = true; modelEditor.apiKey = ''"
                  >
                    清除已保存密钥
                  </button>
                </div>
                <div class="dialog-actions">
                  <button
                    v-if="isDeepWriteFreeEditor"
                    class="dialog-secondary-button"
                    type="button"
                    :disabled="freeModelsRefreshing || testingModelId !== null"
                    @click="emit('refreshFreeModels')"
                  >
                    {{ freeModelsRefreshing ? "刷新中…" : "刷新免费模型" }}
                  </button>
                  <button
                    class="dialog-secondary-button"
                    type="button"
                    :disabled="testingModelId !== null"
                    @click="testDraftModel(modelEditor)"
                  >
                    {{ testingModelId === modelEditor.id ? "测试中…" : "发起计费连接测试" }}
                  </button>
                  <button class="dialog-primary-button" type="button" @click="saveModelEditor">
                    应用到配置
                  </button>
                </div>
              </section>

              <article
                v-else-if="row.type === 'model'"
                class="model-card model-config-card"
                :class="{ 'is-default': draftDefaultModelId === row.model.id }"
              >
              <span class="model-logo">{{ row.model.label.slice(0, 1).toUpperCase() }}</span>
              <div>
                <strong>{{ row.model.label }}</strong>
                <small>{{ row.model.managedBy === "deepwrite-official" ? "旧版兼容托管模型" : row.model.managedBy === "deepwrite-free" ? "旧版兼容免费模型" : modelProviderLabel(row.model.provider) }} · {{ row.model.modelId }} · {{ row.model.api }}</small>
                <small>
                  {{ row.model.reasoning ? `思考：${row.model.thinkingLevelOptions.map(thinkingLabel).join(" / ")}（默认 ${thinkingLabel(row.model.defaultThinkingLevel)}）` : `温度：${row.model.temperatureOptions.join(" / ")}` }} ·
                  {{ row.model.hasApiKey || row.model.apiKey ? "密钥已配置" : "未配置密钥" }}
                </small>
              </div>
              <div class="model-card-actions">
                <button
                  type="button"
                  :class="{ 'is-active': draftDefaultModelId === row.model.id }"
                  :disabled="modelSaving || Boolean(modelEditor)"
                  @click="setDefaultModel(row.model.id)"
                >
                  {{ modelSaving && draftDefaultModelId === row.model.id ? "保存中…" : draftDefaultModelId === row.model.id ? "默认" : "设为默认" }}
                </button>
                <button v-if="row.model.managedBy !== 'deepwrite-official'" type="button" @click="editModel(row.model)">编辑</button>
                <button
                  type="button"
                  :disabled="testingModelId !== null"
                  title="使用当前未保存的配置测试连接"
                  @click="testDraftModel(row.model)"
                >
                  {{ testingModelId === row.model.id ? "测试中…" : "计费测试" }}
                </button>
                <button v-if="row.model.managedBy !== 'deepwrite-official'" class="is-danger" type="button" @click="removeModel(row.model.id)">删除</button>
              </div>
              </article>
              </template>

              <button
                v-if="!modelEditor"
                class="dialog-secondary-button model-add-button"
                type="button"
                @click="createModel"
              >
                <AppIcon name="plus" :size="15" />添加模型
              </button>
            </template>
          </div>

          <div v-if="!modelLoading" class="dialog-actions model-save-actions">
            <button class="dialog-secondary-button" type="button" @click="discardModelChanges">还原未保存</button>
            <button
              class="dialog-primary-button"
              type="button"
              :disabled="modelSaving || Boolean(modelEditor)"
              @click="submitModelSettings"
            >
              {{ modelSaving ? "保存中…" : "保存模型配置" }}
            </button>
          </div>
        </div>

      </section>

      <Teleport to="body">
        <div
          v-if="fetchHintDialog"
          class="dialog-backdrop model-fetch-hint-overlay"
          @mousedown.self="fetchHintDialog = null"
          @keydown.esc.stop="fetchHintDialog = null"
        >
          <section
            class="model-fetch-hint-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="model-fetch-hint-title"
            aria-describedby="model-fetch-hint-message"
            tabindex="-1"
            @keydown.esc.stop="fetchHintDialog = null"
          >
            <header>
              <div>
                <span class="dialog-eyebrow">模型配置</span>
                <h2 id="model-fetch-hint-title">无法拉取模型</h2>
              </div>
            </header>
            <p id="model-fetch-hint-message">{{ fetchHintDialog }}</p>
            <footer class="dialog-actions">
              <button
                ref="fetchHintConfirmButton"
                class="dialog-primary-button"
                type="button"
                @click="fetchHintDialog = null"
              >
                知道了
              </button>
            </footer>
          </section>
        </div>
      </Teleport>
</template>
