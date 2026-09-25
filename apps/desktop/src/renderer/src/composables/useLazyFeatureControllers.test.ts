import { describe, expect, it, vi } from "vitest";
import type { ModelConfig, SystemEventEnvelope } from "@deepwrite/contracts";
import type { LearningImitationController } from "./useLearningImitation";
import type { SubagentAuthoringController } from "./useSubagentAuthoring";
import {
  useLazyLearningImitationController,
  useLazySubagentAuthoringController
} from "./useLazyFeatureControllers";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(cause: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function learningModule(controller: LearningImitationController) {
  return {
    useLearningImitation: vi.fn(() => controller)
  };
}

function learningController(): LearningImitationController {
  return {
    setConfiguredModels: vi.fn(),
    dispose: vi.fn()
  } as unknown as LearningImitationController;
}

function authoringModule(controller: SubagentAuthoringController) {
  return {
    useSubagentAuthoring: vi.fn(() => controller)
  };
}

function authoringController(): SubagentAuthoringController {
  return {
    handleEvent: vi.fn()
  } as unknown as SubagentAuthoringController;
}

describe("lazy feature controllers", () => {
  it("does not create feature state before the feature is requested", () => {
    const api = () => undefined;
    const learning = useLazyLearningImitationController({ api });
    const authoring = useLazySubagentAuthoringController({ api });

    expect(learning.controller.value).toBeNull();
    expect(learning.isBusy.value).toBe(false);
    expect(authoring.controller.value).toBeNull();
  });

  it("coalesces concurrent learning-controller imports and applies cached models", async () => {
    const learning = useLazyLearningImitationController({
      api: () => undefined
    });
    learning.setConfiguredModels(
      [
        { id: "model-placeholder" } as ModelConfig
      ],
      "model-placeholder"
    );

    const [first, second] = await Promise.all([
      learning.ensureLoaded(),
      learning.ensureLoaded()
    ]);
    expect(first).toBe(second);
    expect(learning.controller.value).toBe(first);
    expect(first.selectedModelId.value).toBe("model-placeholder");
    learning.dispose();
    expect(learning.controller.value).toBeNull();
  });

  it("forwards events only after authoring has been initialized", async () => {
    const authoring = useLazySubagentAuthoringController({
      api: () => undefined
    });
    const event = {
      type: "unrelated-test-event"
    } as unknown as SystemEventEnvelope;

    authoring.handleEvent(event);
    const controller = await authoring.ensureLoaded();
    const handleEvent = vi.spyOn(controller, "handleEvent");
    authoring.handleEvent(event);
    expect(handleEvent).toHaveBeenCalledWith(event);
  });

  it("disposes a late learning controller and can reactivate with a new generation", async () => {
    const firstImport = deferred<ReturnType<typeof learningModule>>();
    const lateController = learningController();
    const reactivatedController = learningController();
    let loadAttempt = 0;
    const learning = useLazyLearningImitationController({
      api: () => undefined,
      loadModule: async () => {
        loadAttempt += 1;
        if (loadAttempt === 1) return await firstImport.promise;
        return learningModule(reactivatedController);
      }
    });

    const staleLoad = learning.ensureLoaded();
    const staleRejection = expect(staleLoad).rejects.toThrow(
      "Learning imitation controller load was cancelled."
    );
    learning.dispose();
    const reactivatedLoad = learning.ensureLoaded();
    firstImport.resolve(learningModule(lateController));

    await staleRejection;
    await expect(reactivatedLoad).resolves.toBe(reactivatedController);
    expect(lateController.dispose).toHaveBeenCalledOnce();
    expect(learning.controller.value).toBe(reactivatedController);
  });

  it("does not publish a late authoring controller after disposal", async () => {
    const firstImport = deferred<ReturnType<typeof authoringModule>>();
    const lateController = authoringController();
    const reactivatedController = authoringController();
    let loadAttempt = 0;
    const authoring = useLazySubagentAuthoringController({
      api: () => undefined,
      loadModule: async () => {
        loadAttempt += 1;
        if (loadAttempt === 1) return await firstImport.promise;
        return authoringModule(reactivatedController);
      }
    });

    const staleLoad = authoring.ensureLoaded();
    const staleRejection = expect(staleLoad).rejects.toThrow(
      "Subagent authoring controller load was cancelled."
    );
    authoring.dispose();
    const reactivatedLoad = authoring.ensureLoaded();
    firstImport.resolve(authoringModule(lateController));

    await staleRejection;
    await expect(reactivatedLoad).resolves.toBe(reactivatedController);
    expect(authoring.controller.value).toBe(reactivatedController);
  });

  it("retries learning and authoring module imports after a failure", async () => {
    const learningLoaded = learningController();
    const authoringLoaded = authoringController();
    const learningLoadModule = vi
      .fn()
      .mockRejectedValueOnce(new Error("learning import failed"))
      .mockResolvedValueOnce(learningModule(learningLoaded));
    const authoringLoadModule = vi
      .fn()
      .mockRejectedValueOnce(new Error("authoring import failed"))
      .mockResolvedValueOnce(authoringModule(authoringLoaded));
    const learning = useLazyLearningImitationController({
      api: () => undefined,
      loadModule: learningLoadModule
    });
    const authoring = useLazySubagentAuthoringController({
      api: () => undefined,
      loadModule: authoringLoadModule
    });

    await expect(learning.ensureLoaded()).rejects.toThrow(
      "learning import failed"
    );
    await expect(authoring.ensureLoaded()).rejects.toThrow(
      "authoring import failed"
    );
    expect(learning.controller.value).toBeNull();
    expect(authoring.controller.value).toBeNull();

    await expect(learning.ensureLoaded()).resolves.toBe(learningLoaded);
    await expect(authoring.ensureLoaded()).resolves.toBe(authoringLoaded);
    expect(learningLoadModule).toHaveBeenCalledTimes(2);
    expect(authoringLoadModule).toHaveBeenCalledTimes(2);
  });
});
