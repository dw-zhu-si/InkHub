import { describe, expect, it } from "vitest";
import source from "./ModelSettingsFeature.vue?raw";

describe("ModelSettingsFeature model providers", () => {
  it("offers ModelHub as a recommended option instead of a mandatory gateway", () => {
    expect(source).toContain('value: "modelhub", label: "ModelHub（推荐）"');
    expect(source).toContain('provider: "modelhub"');
    expect(source).toContain("supportsDeveloperRole: false");
    expect(source).toContain('baseUrl: "http://127.0.0.1:11435/v1"');
    expect(source).toContain("不要填写 ModelHub Agent/MCP Token");
  });

  it("keeps the managed source marker when saving a selected preset", () => {
    expect(source).toContain("managedBy: model.managedBy");
    expect(source).toContain("applyDeepWriteFreeModel");
  });

  it("renders the editor immediately after the model being edited", () => {
    expect(source).toContain('rows.push({ key: `model:${model.id}`, type: "model", model })');
    expect(source).toContain('rows.push({ key: `editor:${model.id}`, type: "editor" })');
    expect(source).toContain(
      '<template v-for="row in modelConfigRows" :key="row.key">'
    );
  });

  it("scrolls the model editor into view after opening it", () => {
    expect(source).toContain('ref="modelConfigScrollArea"');
    expect(source).toContain('?.scrollIntoView({ block: "nearest", behavior: "auto" })');
    expect(source.match(/scrollModelEditorIntoView\(\);/g)).toHaveLength(2);
  });
});

describe("ModelSettingsFeature provider presets", () => {
  it("offers direct vendor APIs and local runtimes", () => {
    expect(source).toContain('value: "openai", label: "OpenAI"');
    expect(source).toContain('baseUrl: "https://api.openai.com/v1"');
    expect(source).toContain('value: "anthropic", label: "Anthropic / Claude"');
    expect(source).toContain('api: "anthropic-messages"');
    expect(source).toContain('value: "google", label: "Google Gemini"');
    expect(source).toContain('value: "dashscope", label: "阿里巴巴 / 通义千问 Qwen"');
    expect(source).toContain('value: "ollama", label: "Ollama（本机）"');
    expect(source).toContain('value: "lm-studio", label: "LM Studio（本机）"');
  });

  it("supports arbitrary compatible providers and recommends ModelHub downloads", () => {
    expect(source).toContain('value: CUSTOM_MODEL_PROVIDER_VALUE, label: "其他厂家 / 自定义兼容 API"');
    expect(source).toContain('accessible-label="选择模型厂家或接入方式"');
    expect(source).toContain("customModelProviderMode");
    expect(source).toContain("https://apps.apple.com/cn/app/id6797847364");
    expect(source).toContain("https://github.com/dw-zhu-si/ModelHub");
    expect(source).toContain("也可在下方直接配置厂家 API");
  });
});

describe("ModelSettingsFeature managed-model boundary", () => {
  it("does not expose upstream official-model notices or navigation", () => {
    expect(source).not.toContain("modelAlertMessages");
    expect(source).not.toContain("openOfficialModels");
    expect(source).not.toContain("前往设置官方模型");
    expect(source).not.toContain("DeepWrite 官方模型");
    expect(source).not.toContain("DeepWrite 免费模型");
    expect(source).toContain("旧版兼容托管模型");
    expect(source).toContain("旧版兼容免费模型");
  });
});

describe("ModelSettingsFeature remote model ids", () => {
  it("offers a fetch button beside the model id field and turns it into a selector", () => {
    expect(source).toContain('class="model-id-field"');
    expect(source).toContain(":aria-label=\"listingRemoteModels ? '拉取中' : '拉取可用模型'\"");
    expect(source).toContain("{{ listingRemoteModels ? \"拉取中\" : \"拉取\" }}");
    expect(source).toContain("@click=\"fetchRemoteModels\"");
    expect(source).toContain("window.deepwrite.models.listRemote({");
    expect(source).toContain('accessible-label="选择模型 ID"');
    expect(source).toContain('label: "手动输入其他模型 ID"');
    expect(source).toContain("canSelectRemoteModel");
  });

  it("shows a dialog when the api url or key is missing", () => {
    expect(source).toContain("function missingRemoteModelCredentials");
    expect(source).toContain("请先填写 API 地址和 API Key，再拉取可用模型。");
    expect(source).toContain("请先填写 API 地址，再拉取可用模型。");
    expect(source).toContain("请先填写 API Key，再拉取可用模型。");
    expect(source).toContain('class="dialog-backdrop model-fetch-hint-overlay"');
    expect(source).toContain('id="model-fetch-hint-title"');
    expect(source).toContain("无法拉取模型");
    expect(source).toContain("fetchHintDialog.value = missing");
    expect(source).not.toContain("uiMessage.warning(missing)");
  });

  it("reuses saved credentials and allows keyless local runtimes", () => {
    const start = source.indexOf("function missingRemoteModelCredentials");
    const end = source.indexOf("function commandErrorMessage", start);
    const body = source.slice(start, end);
    expect(body).toContain("!editor.hasApiKey");
    expect(body).toContain('["ollama", "lm-studio"]');
  });
});

describe("ModelSettingsFeature model draft lifecycle", () => {
  it("persists a newly selected default model immediately", () => {
    const start = source.indexOf("function setDefaultModel(");
    const end = source.indexOf("function submitModelSettings(", start);
    const body = source.slice(start, end);
    expect(body).toContain("draftDefaultModelId.value = modelId;");
    expect(body).toContain("submitModelSettings();");
    expect(source).toContain(':disabled="modelSaving || Boolean(modelEditor)"');
  });

  it("hydrates saved models when the dialog mounts already active", () => {
    expect(source).toMatch(
      /watch\(\s*\(\) => props\.active,[\s\S]*?\{ immediate: true \}\s*\);/
    );
  });

  it("filters managed models while keeping custom providers in custom scope", () => {
    expect(source).toContain('props.modelScope === "all" || !model.managedBy');
    expect(source).toContain('value: "modelhub", label: "ModelHub（推荐）"');
    expect(source).toContain('modelScope === "custom" ? "尚未配置自定义模型"');
  });

  it("merges custom drafts with hidden managed models before saving", () => {
    expect(source).toContain("mergeCustomModelSettings(");
    expect(source).toContain("(props.modelSettings?.models ?? []).map(toModelInput)");
  });
});
