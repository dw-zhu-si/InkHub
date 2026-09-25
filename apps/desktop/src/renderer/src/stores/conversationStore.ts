import {
  computed,
  markRaw,
  onScopeDispose,
  ref,
  shallowRef,
  triggerRef,
  type ShallowRef
} from "vue";
import { defineStore } from "pinia";
import type {
  AgentConversationController,
  AgentRunSettings
} from "../composables/useAgentConversation";
import type {
  AgentModelSelection,
  AgentRunPreferences,
  AgentRunPreferencesByScope
} from "../utils/agentRunPreferences";

export const MODEL_SELECTION_PERSISTENCE_KEY =
  "conversation-preferences:model-selection:v1";
export const RUN_PREFERENCES_PERSISTENCE_KEY =
  "conversation-preferences:run-options:v1";

export interface ConversationPersistenceAdapter {
  load(key: string): Promise<unknown | undefined>;
  save(key: string, value: unknown): Promise<void>;
  remove?(key: string): Promise<void>;
}

export interface ConversationPersistenceOptions {
  debounceMs?: number;
  onError?: (key: string, error: unknown) => void;
}

export interface DisposeConversationStoreOptions {
  flush?: boolean;
  clearControllerPersistence?: boolean;
}

interface PersistenceQueue {
  key: string;
  hasPending: boolean;
  pendingValue: unknown;
  pendingValueFactory: (() => unknown) | undefined;
  timer: number | undefined;
  inFlight: Promise<void> | undefined;
  lastError: unknown;
}

interface PreferenceUpdateOptions {
  source?: AgentConversationController;
  persist?: boolean;
}

function rawValue<Value>(value: Value): Value {
  return typeof value === "object" && value !== null ? markRaw(value) : value;
}

function captureRunSettings(
  controller: AgentConversationController
): AgentRunSettings {
  return {
    selectedModelId: controller.selectedModelId.value,
    thinkingLevel: controller.thinkingLevel.value,
    temperature: controller.temperature.value,
    approvalMode: controller.approvalMode.value
  };
}

function validModelSelection(value: unknown): value is AgentModelSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.selectedModelId === "string" &&
    candidate.selectedModelId.length <= 120 &&
    typeof candidate.thinkingLevel === "string" &&
    candidate.thinkingLevel.length > 0 &&
    candidate.thinkingLevel.length <= 64
  );
}

function validRunPreference(value: unknown): value is AgentRunPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.temperature === "number" &&
    Number.isFinite(candidate.temperature) &&
    candidate.temperature >= 0 &&
    candidate.temperature <= 2 &&
    (candidate.approvalMode === "request-approval" ||
      candidate.approvalMode === "auto-approve")
  );
}

function validRunPreferencesByScope(
  value: unknown
): value is AgentRunPreferencesByScope {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value as Record<string, unknown>).every(
      ([scope, preference]) => scope.trim().length > 0 && validRunPreference(preference)
    )
  );
}

export const useConversationStore = defineStore("conversation", () => {
  const controllers = shallowRef<Map<string, AgentConversationController>>(
    new Map()
  );
  const scopesByKey = shallowRef<Map<string, string>>(new Map());
  const persistenceCache = shallowRef<Map<string, unknown>>(new Map());
  const persistenceErrors = shallowRef<Map<string, string>>(new Map());
  const sessionAgentModelSelection = shallowRef<AgentModelSelection>();
  const agentRunPreferences = shallowRef<AgentRunPreferencesByScope>({});
  const persistenceStateVersion = ref(0);

  const controllerCount = computed(() => controllers.value.size);
  const persistenceBusy = computed(() => {
    persistenceStateVersion.value;
    return [...persistenceQueues.values()].some(
      (queue) =>
        queue.hasPending || queue.timer !== undefined || queue.inFlight !== undefined
    );
  });

  let persistenceAdapter: ConversationPersistenceAdapter | null = null;
  let persistenceDebounceMs = 180;
  let persistenceErrorHandler:
    | ((key: string, error: unknown) => void)
    | undefined;
  let persistenceAdapterEpoch = 0;
  let acceptsPersistenceSchedules = true;
  const persistenceQueues = new Map<string, PersistenceQueue>();
  const loadPromises = new Map<string, Promise<unknown | undefined>>();
  const loadEpochs = new Map<string, number>();

  function touchPersistenceState(): void {
    persistenceStateVersion.value += 1;
  }

  function replaceMapEntry<Key, Value>(
    target: ShallowRef<Map<Key, Value>>,
    key: Key,
    value: Value
  ): void {
    // Keep the Map identity stable so coordinators can retain the shallow
    // registry without retaining an obsolete snapshot after registration.
    target.value.set(key, value);
    triggerRef(target);
  }

  function deleteMapEntry<Key, Value>(
    target: ShallowRef<Map<Key, Value>>,
    key: Key
  ): void {
    if (!target.value.has(key)) return;
    target.value.delete(key);
    triggerRef(target);
  }

  function cachePersistenceValue(key: string, value: unknown): void {
    replaceMapEntry(persistenceCache, key, rawValue(value));
  }

  function setPersistenceError(key: string, error: unknown): void {
    replaceMapEntry(
      persistenceErrors,
      key,
      error instanceof Error ? error.message : "保存会话状态失败。"
    );
    persistenceErrorHandler?.(key, error);
  }

  function clearPersistenceError(key: string): void {
    deleteMapEntry(persistenceErrors, key);
  }

  function applyGlobalPreferences(
    controller: AgentConversationController,
    scope: string
  ): void {
    const selection = sessionAgentModelSelection.value;
    const preferences = agentRunPreferences.value[scope];
    if (!selection && !preferences) return;
    controller.applyRunSettings({
      ...captureRunSettings(controller),
      ...(selection ?? {}),
      ...(preferences ?? {})
    });
  }

  function registerController(
    key: string,
    scope: string,
    controller: AgentConversationController,
    options: { applyPreferences?: boolean } = {}
  ): AgentConversationController {
    const normalizedKey = key.trim();
    const normalizedScope = scope.trim();
    if (!normalizedKey) throw new Error("会话 key 不能为空。");
    if (!normalizedScope) throw new Error("会话 scope 不能为空。");
    const existing = controllers.value.get(normalizedKey);
    if (existing && existing !== controller) {
      existing.dispose();
    }
    replaceMapEntry(controllers, normalizedKey, markRaw(controller));
    replaceMapEntry(scopesByKey, normalizedKey, normalizedScope);
    if (options.applyPreferences !== false) {
      applyGlobalPreferences(controller, normalizedScope);
    }
    return controller;
  }

  function controllerForKey(
    key: string
  ): AgentConversationController | undefined {
    return controllers.value.get(key);
  }

  function scopeForKey(key: string): string | undefined {
    return scopesByKey.value.get(key);
  }

  function controllersForScope(scope: string): AgentConversationController[] {
    return [...controllers.value.entries()].flatMap(([key, controller]) =>
      scopesByKey.value.get(key) === scope ? [controller] : []
    );
  }

  function listControllers(): AgentConversationController[] {
    return [...controllers.value.values()];
  }

  function setControllerScope(key: string, scope: string): boolean {
    const controller = controllers.value.get(key);
    const normalizedScope = scope.trim();
    if (!controller || !normalizedScope) return false;
    replaceMapEntry(scopesByKey, key, normalizedScope);
    applyGlobalPreferences(controller, normalizedScope);
    return true;
  }

  function removeController(
    key: string,
    options: { dispose?: boolean; clearPersistence?: boolean } = {}
  ): AgentConversationController | undefined {
    const controller = controllers.value.get(key);
    if (!controller) return undefined;
    deleteMapEntry(controllers, key);
    deleteMapEntry(scopesByKey, key);
    if (options.dispose !== false) {
      controller.dispose(
        options.clearPersistence === undefined
          ? undefined
          : { clearPersistence: options.clearPersistence }
      );
    }
    return controller;
  }

  function disposeAllControllers(options: { clearPersistence?: boolean } = {}): void {
    const existing = [...controllers.value.values()];
    controllers.value.clear();
    scopesByKey.value.clear();
    triggerRef(controllers);
    triggerRef(scopesByKey);
    for (const controller of existing) {
      controller.dispose(
        options.clearPersistence === undefined
          ? undefined
          : { clearPersistence: options.clearPersistence }
      );
    }
  }

  function setSessionAgentModelSelection(
    selection: AgentModelSelection | undefined,
    options: PreferenceUpdateOptions = {}
  ): void {
    sessionAgentModelSelection.value = selection
      ? rawValue({ ...selection })
      : undefined;
    if (selection) {
      for (const controller of controllers.value.values()) {
        if (controller === options.source) continue;
        controller.applyRunSettings({
          ...captureRunSettings(controller),
          ...selection
        });
      }
      if (options.persist !== false) {
        schedulePersistence(MODEL_SELECTION_PERSISTENCE_KEY, { ...selection });
      }
    } else if (options.persist !== false) {
      schedulePersistence(MODEL_SELECTION_PERSISTENCE_KEY, null);
    }
  }

  function setAgentRunPreferences(
    scope: string,
    preferences: AgentRunPreferences,
    options: PreferenceUpdateOptions = {}
  ): void {
    const normalizedScope = scope.trim();
    if (!normalizedScope) throw new Error("会话 scope 不能为空。");
    agentRunPreferences.value = rawValue({
      ...agentRunPreferences.value,
      [normalizedScope]: { ...preferences }
    });
    for (const [key, controller] of controllers.value) {
      if (
        scopesByKey.value.get(key) !== normalizedScope ||
        controller === options.source
      ) {
        continue;
      }
      controller.applyRunSettings({
        ...captureRunSettings(controller),
        ...preferences
      });
    }
    if (options.persist !== false) {
      schedulePersistence(RUN_PREFERENCES_PERSISTENCE_KEY, {
        ...agentRunPreferences.value
      });
    }
  }

  function removeAgentRunPreferences(
    scope: string,
    options: { persist?: boolean } = {}
  ): boolean {
    if (!(scope in agentRunPreferences.value)) return false;
    const next = { ...agentRunPreferences.value };
    delete next[scope];
    agentRunPreferences.value = rawValue(next);
    if (options.persist !== false) {
      schedulePersistence(RUN_PREFERENCES_PERSISTENCE_KEY, { ...next });
    }
    return true;
  }

  function configurePersistenceAdapter(
    adapter: ConversationPersistenceAdapter | null,
    options: ConversationPersistenceOptions = {}
  ): void {
    persistenceAdapter = adapter;
    persistenceAdapterEpoch += 1;
    persistenceDebounceMs = Math.max(0, Math.round(options.debounceMs ?? 180));
    persistenceErrorHandler = options.onError;
    acceptsPersistenceSchedules = true;
    if (!adapter) return;
    for (const queue of persistenceQueues.values()) {
      if (queue.hasPending && queue.timer === undefined && !queue.inFlight) {
        scheduleQueueTimer(queue, 0);
      }
    }
    touchPersistenceState();
  }

  function queueForKey(key: string): PersistenceQueue {
    const existing = persistenceQueues.get(key);
    if (existing) return existing;
    const created: PersistenceQueue = {
      key,
      hasPending: false,
      pendingValue: undefined,
      pendingValueFactory: undefined,
      timer: undefined,
      inFlight: undefined,
      lastError: undefined
    };
    persistenceQueues.set(key, created);
    touchPersistenceState();
    return created;
  }

  function scheduleQueueTimer(queue: PersistenceQueue, delay: number): void {
    if (queue.timer !== undefined) {
      globalThis.clearTimeout(queue.timer);
    }
    queue.timer = globalThis.setTimeout(() => {
      queue.timer = undefined;
      touchPersistenceState();
      void startQueueSave(queue);
    }, delay);
    touchPersistenceState();
  }

  function startQueueSave(queue: PersistenceQueue): Promise<void> | undefined {
    if (queue.inFlight || !queue.hasPending || !persistenceAdapter) {
      return queue.inFlight;
    }
    const adapter = persistenceAdapter;
    const adapterEpoch = persistenceAdapterEpoch;
    const value = queue.pendingValue;
    const valueFactory = queue.pendingValueFactory;
    queue.pendingValue = undefined;
    queue.pendingValueFactory = undefined;
    queue.hasPending = false;
    queue.lastError = undefined;
    clearPersistenceError(queue.key);

    let task!: Promise<void>;
    task = Promise.resolve()
      .then(() => {
        const resolvedValue = valueFactory ? valueFactory() : value;
        cachePersistenceValue(queue.key, resolvedValue);
        return adapter.save(queue.key, resolvedValue);
      })
      .then(() => {
        if (adapterEpoch === persistenceAdapterEpoch) {
          clearPersistenceError(queue.key);
        }
      })
      .catch((error: unknown) => {
        queue.lastError = error;
        if (adapterEpoch === persistenceAdapterEpoch) {
          setPersistenceError(queue.key, error);
        }
      })
      .finally(() => {
        if (queue.inFlight === task) {
          queue.inFlight = undefined;
        }
        touchPersistenceState();
        if (queue.hasPending && queue.timer === undefined) {
          void startQueueSave(queue);
        }
      });
    queue.inFlight = task;
    touchPersistenceState();
    return task;
  }

  function schedulePersistence<Value>(key: string, value: Value): void {
    if (!acceptsPersistenceSchedules) {
      throw new Error("会话持久化调度器已经关闭。");
    }
    const normalizedKey = key.trim();
    if (!normalizedKey) throw new Error("持久化 key 不能为空。");
    // A local change wins over an older read that is still in flight. The
    // pending caller may inspect that stale value, but it can no longer
    // replace the newer shallow cache entry when it resolves.
    loadEpochs.set(normalizedKey, (loadEpochs.get(normalizedKey) ?? 0) + 1);
    const queue = queueForKey(normalizedKey);
    queue.pendingValue = rawValue(value);
    queue.pendingValueFactory = undefined;
    queue.hasPending = true;
    queue.lastError = undefined;
    cachePersistenceValue(normalizedKey, value);
    clearPersistenceError(normalizedKey);
    scheduleQueueTimer(queue, persistenceDebounceMs);
  }

  function schedulePersistenceFactory(
    key: string,
    valueFactory: () => unknown
  ): void {
    if (!acceptsPersistenceSchedules) {
      throw new Error("会话持久化调度器已经关闭。");
    }
    const normalizedKey = key.trim();
    if (!normalizedKey) throw new Error("持久化 key 不能为空。");
    loadEpochs.set(normalizedKey, (loadEpochs.get(normalizedKey) ?? 0) + 1);
    const queue = queueForKey(normalizedKey);
    queue.pendingValue = undefined;
    queue.pendingValueFactory = valueFactory;
    queue.hasPending = true;
    queue.lastError = undefined;
    clearPersistenceError(normalizedKey);
    scheduleQueueTimer(queue, persistenceDebounceMs);
  }

  async function flushPersistenceKey(key: string): Promise<void> {
    const queue = persistenceQueues.get(key);
    if (!queue) return;
    if (queue.timer !== undefined) {
      globalThis.clearTimeout(queue.timer);
      queue.timer = undefined;
      touchPersistenceState();
    }
    while (queue.hasPending || queue.inFlight) {
      if (!queue.inFlight && queue.hasPending) {
        if (!persistenceAdapter) {
          throw new Error("会话持久化适配器尚未配置。");
        }
        startQueueSave(queue);
      }
      if (queue.inFlight) {
        await queue.inFlight;
      }
    }
    if (queue.lastError !== undefined) {
      throw queue.lastError;
    }
  }

  async function flushPersistence(key?: string): Promise<void> {
    if (key) {
      await flushPersistenceKey(key);
      return;
    }
    const failures: unknown[] = [];
    for (const queueKey of persistenceQueues.keys()) {
      try {
        await flushPersistenceKey(queueKey);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    if (failures.length) throw failures[0];
  }

  async function loadPersistence<Value>(
    key: string,
    options: { force?: boolean } = {}
  ): Promise<Value | undefined> {
    if (!options.force && persistenceCache.value.has(key)) {
      return persistenceCache.value.get(key) as Value;
    }
    const existing = loadPromises.get(key);
    if (existing) return existing as Promise<Value | undefined>;
    if (!persistenceAdapter) return undefined;

    const epoch = loadEpochs.get(key) ?? 0;
    const adapterEpoch = persistenceAdapterEpoch;
    const adapter = persistenceAdapter;
    let pending!: Promise<unknown | undefined>;
    pending = adapter
      .load(key)
      .then((value) => {
        if (
          value !== undefined &&
          (loadEpochs.get(key) ?? 0) === epoch &&
          persistenceAdapterEpoch === adapterEpoch
        ) {
          cachePersistenceValue(key, value);
        }
        return value;
      })
      .finally(() => {
        if (loadPromises.get(key) === pending) {
          loadPromises.delete(key);
        }
      });
    loadPromises.set(key, pending);
    return pending as Promise<Value | undefined>;
  }

  function invalidatePersistenceCache(key: string): void {
    loadEpochs.set(key, (loadEpochs.get(key) ?? 0) + 1);
    loadPromises.delete(key);
    deleteMapEntry(persistenceCache, key);
  }

  async function removePersistence(key: string): Promise<void> {
    const queue = persistenceQueues.get(key);
    if (queue?.timer !== undefined) {
      globalThis.clearTimeout(queue.timer);
      queue.timer = undefined;
    }
    if (queue) {
      queue.hasPending = false;
      queue.pendingValue = undefined;
      queue.pendingValueFactory = undefined;
      if (queue.inFlight) await queue.inFlight;
      persistenceQueues.delete(key);
      touchPersistenceState();
    }
    invalidatePersistenceCache(key);
    clearPersistenceError(key);
    await persistenceAdapter?.remove?.(key);
  }

  async function hydratePreferences(): Promise<void> {
    const [selection, preferences] = await Promise.all([
      loadPersistence<AgentModelSelection>(MODEL_SELECTION_PERSISTENCE_KEY),
      loadPersistence<AgentRunPreferencesByScope>(RUN_PREFERENCES_PERSISTENCE_KEY)
    ]);
    if (validModelSelection(selection)) {
      setSessionAgentModelSelection(selection, { persist: false });
    }
    if (validRunPreferencesByScope(preferences)) {
      agentRunPreferences.value = rawValue(
        Object.fromEntries(
          Object.entries(preferences).map(([scope, preference]) => [
            scope,
            { ...preference }
          ])
        )
      );
      for (const [key, controller] of controllers.value) {
        applyGlobalPreferences(controller, scopesByKey.value.get(key) ?? "general");
      }
    }
  }

  function discardPendingPersistence(): void {
    for (const queue of persistenceQueues.values()) {
      if (queue.timer !== undefined) {
        globalThis.clearTimeout(queue.timer);
      }
      queue.timer = undefined;
      queue.hasPending = false;
      queue.pendingValue = undefined;
      queue.pendingValueFactory = undefined;
    }
    touchPersistenceState();
  }

  async function dispose(
    options: DisposeConversationStoreOptions = {}
  ): Promise<void> {
    acceptsPersistenceSchedules = false;
    try {
      if (options.flush !== false) {
        await flushPersistence();
      } else {
        discardPendingPersistence();
      }
    } finally {
      disposeAllControllers(
        options.clearControllerPersistence === undefined
          ? {}
          : { clearPersistence: options.clearControllerPersistence }
      );
      persistenceAdapter = null;
      persistenceAdapterEpoch += 1;
      loadPromises.clear();
    }
  }

  onScopeDispose(() => {
    acceptsPersistenceSchedules = false;
    discardPendingPersistence();
    disposeAllControllers();
  });

  return {
    controllers,
    scopesByKey,
    controllerCount,
    persistenceCache,
    persistenceErrors,
    persistenceBusy,
    sessionAgentModelSelection,
    agentRunPreferences,
    registerController,
    controllerForKey,
    scopeForKey,
    controllersForScope,
    listControllers,
    setControllerScope,
    removeController,
    disposeAllControllers,
    setSessionAgentModelSelection,
    setAgentRunPreferences,
    removeAgentRunPreferences,
    configurePersistenceAdapter,
    schedulePersistence,
    schedulePersistenceFactory,
    flushPersistence,
    loadPersistence,
    invalidatePersistenceCache,
    removePersistence,
    hydratePreferences,
    dispose
  };
});
