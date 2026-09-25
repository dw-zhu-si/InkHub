import { computed, shallowRef, type ComputedRef, type ShallowRef } from "vue";
import type {
  DeepWriteApi,
  ModelConfig,
  SystemEventEnvelope
} from "@deepwrite/contracts";
import type { LearningImitationController } from "./useLearningImitation";
import type { SubagentAuthoringController } from "./useSubagentAuthoring";

export interface LazyLearningImitationController {
  controller: ShallowRef<LearningImitationController | null>;
  isBusy: ComputedRef<boolean>;
  ensureLoaded(): Promise<LearningImitationController>;
  setConfiguredModels(
    models: readonly ModelConfig[],
    defaultModelId?: string
  ): void;
  handleEvent(event: SystemEventEnvelope): void;
  dispose(): void;
}

export interface LazySubagentAuthoringController {
  controller: ShallowRef<SubagentAuthoringController | null>;
  ensureLoaded(): Promise<SubagentAuthoringController>;
  handleEvent(event: SystemEventEnvelope): void;
  dispose(): void;
}

type LearningImitationModule = Pick<
  typeof import("./useLearningImitation"),
  "useLearningImitation"
>;

type SubagentAuthoringModule = Pick<
  typeof import("./useSubagentAuthoring"),
  "useSubagentAuthoring"
>;

function cancelledLoadError(feature: string): Error {
  return new Error(`${feature} controller load was cancelled.`);
}

export function useLazyLearningImitationController(options: {
  api: () => DeepWriteApi | undefined;
  loadModule?: () => Promise<LearningImitationModule>;
}): LazyLearningImitationController {
  const controller = shallowRef<LearningImitationController | null>(null);
  const isBusy = computed(() => controller.value?.isBusy.value ?? false);
  let loadPromise: Promise<LearningImitationController> | null = null;
  let generation = 0;
  let active = true;
  let configuredModels: readonly ModelConfig[] = [];
  let configuredDefaultModelId: string | undefined;

  async function ensureLoaded(): Promise<LearningImitationController> {
    if (controller.value) return controller.value;
    if (loadPromise) return await loadPromise;
    active = true;
    const loadGeneration = generation;
    const pending = (async () => {
      const { useLearningImitation } = await (
        options.loadModule?.() ?? import("./useLearningImitation")
      );
      const loaded = useLearningImitation({ api: options.api });
      loaded.setConfiguredModels(
        configuredModels,
        configuredDefaultModelId
      );
      if (!active || generation !== loadGeneration) {
        loaded.dispose();
        throw cancelledLoadError("Learning imitation");
      }
      controller.value = loaded;
      return loaded;
    })();
    loadPromise = pending;
    try {
      return await pending;
    } finally {
      if (loadPromise === pending) loadPromise = null;
    }
  }

  return {
    controller,
    isBusy,
    ensureLoaded,
    setConfiguredModels(models, defaultModelId) {
      configuredModels = models;
      configuredDefaultModelId = defaultModelId;
      controller.value?.setConfiguredModels(models, defaultModelId);
    },
    handleEvent(event) {
      controller.value?.handleEvent(event);
    },
    dispose() {
      active = false;
      generation += 1;
      loadPromise = null;
      controller.value?.dispose();
      controller.value = null;
    }
  };
}

export function useLazySubagentAuthoringController(options: {
  api: () => DeepWriteApi | undefined;
  loadModule?: () => Promise<SubagentAuthoringModule>;
}): LazySubagentAuthoringController {
  const controller = shallowRef<SubagentAuthoringController | null>(null);
  let loadPromise: Promise<SubagentAuthoringController> | null = null;
  let generation = 0;
  let active = true;

  async function ensureLoaded(): Promise<SubagentAuthoringController> {
    if (controller.value) return controller.value;
    if (loadPromise) return await loadPromise;
    active = true;
    const loadGeneration = generation;
    const pending = (async () => {
      const { useSubagentAuthoring } = await (
        options.loadModule?.() ?? import("./useSubagentAuthoring")
      );
      const loaded = useSubagentAuthoring({ api: options.api });
      if (!active || generation !== loadGeneration) {
        throw cancelledLoadError("Subagent authoring");
      }
      controller.value = loaded;
      return loaded;
    })();
    loadPromise = pending;
    try {
      return await pending;
    } finally {
      if (loadPromise === pending) loadPromise = null;
    }
  }

  return {
    controller,
    ensureLoaded,
    handleEvent(event) {
      controller.value?.handleEvent(event);
    },
    dispose() {
      active = false;
      generation += 1;
      loadPromise = null;
      controller.value = null;
    }
  };
}
