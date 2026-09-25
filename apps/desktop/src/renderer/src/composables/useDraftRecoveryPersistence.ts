import type { CatalogDraftRecovery } from "@deepwrite/contracts";
import {
  ref,
  watch,
  type Ref,
  type ShallowRef
} from "vue";
import type { EditorDraftState } from "../types/workspace";
import {
  createDraftRecoveryClock,
  dirtyDraftRecovery,
  mergeRecoveredEditorDrafts
} from "../utils/draftRecoveryState";

export interface DraftRecoveryApi {
  loadDraftRecovery(): Promise<CatalogDraftRecovery>;
  saveDraftRecovery(drafts: CatalogDraftRecovery): Promise<void>;
}

export interface DraftRecoveryPersistenceOptions {
  drafts: ShallowRef<Record<string, EditorDraftState>>;
  api(): DraftRecoveryApi | undefined;
  warning(message: string): void;
  debounceMs?: number;
  now?: () => number;
}

export type DraftRecoveryPersistencePhase =
  | "idle"
  | "loading"
  | "ready"
  | "failed"
  | "disposed";

export interface DraftRecoveryPersistence {
  phase: Ref<DraftRecoveryPersistencePhase>;
  recoveredCount: Ref<number>;
  load(): Promise<number>;
  flush(options?: { notify?: boolean }): Promise<void>;
  beforeUnload(): void;
  nextTimestamp(): string;
  dispose(): Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 250;

function loadWarning(error: unknown): string {
  return error instanceof Error
    ? `草稿恢复文件读取失败：${error.message}`
    : "草稿恢复文件暂时无法读取";
}

/**
 * Owns draft-recovery loading, debounce, and serialized persistence.
 *
 * Writes remain closed until the Core snapshot has loaded successfully. This
 * prevents startup typing—or a temporary read failure—from overwriting a
 * recovery file that the renderer has not reconciled yet.
 */
export function useDraftRecoveryPersistence(
  options: DraftRecoveryPersistenceOptions
): DraftRecoveryPersistence {
  const phase = ref<DraftRecoveryPersistencePhase>("idle");
  const recoveredCount = ref(0);
  const clock = createDraftRecoveryClock(options.now);
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let revision = 0;
  let persistedRevision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loadGeneration = 0;
  let loadPromise: Promise<number> | null = null;
  let drainPromise: Promise<void> | null = null;
  let disposePromise: Promise<void> | null = null;
  let warningShown = false;
  let notifyPendingFailure = false;
  let lastFailedRevision = -1;
  let disposing = false;
  let disposed = false;

  function cancelTimer(): void {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule(): void {
    if (phase.value !== "ready" || disposing || disposed) return;
    cancelTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, debounceMs);
  }

  const stopWatchingDrafts = watch(
    options.drafts,
    () => {
      revision += 1;
      schedule();
    },
    { flush: "sync" }
  );

  async function load(): Promise<number> {
    if (disposed) return recoveredCount.value;
    if (phase.value === "ready") return recoveredCount.value;
    if (loadPromise) return loadPromise;

    const generation = ++loadGeneration;
    phase.value = "loading";
    const operation = (async () => {
      const api = options.api();
      if (!api) {
        if (generation === loadGeneration && !disposed) {
          phase.value = "ready";
          recoveredCount.value = 0;
        }
        return 0;
      }

      try {
        const coreDrafts = await api.loadDraftRecovery();
        if (generation !== loadGeneration || disposing || disposed) {
          return recoveredCount.value;
        }

        const recoveredCoreDrafts = mergeRecoveredEditorDrafts(
          coreDrafts,
          {},
          clock
        );
        const liveDrafts = dirtyDraftRecovery(options.drafts.value);
        const mergedDrafts = mergeRecoveredEditorDrafts(
          coreDrafts,
          liveDrafts,
          clock
        );
        recoveredCount.value = Object.keys(recoveredCoreDrafts).length;
        phase.value = "ready";
        options.drafts.value = mergedDrafts;
        return recoveredCount.value;
      } catch (error: unknown) {
        if (generation === loadGeneration && !disposing && !disposed) {
          phase.value = "failed";
          options.warning(loadWarning(error));
        }
        return recoveredCount.value;
      }
    })();

    loadPromise = operation;
    try {
      return await operation;
    } finally {
      if (loadPromise === operation) {
        loadPromise = null;
      }
    }
  }

  async function drain(): Promise<void> {
    while (!disposed && phase.value === "ready") {
      const targetRevision = revision;
      if (targetRevision <= persistedRevision) return;
      const api = options.api();
      if (!api) return;
      const snapshot = dirtyDraftRecovery(options.drafts.value);

      try {
        await api.saveDraftRecovery(snapshot);
        persistedRevision = targetRevision;
        lastFailedRevision = -1;
        warningShown = false;
        notifyPendingFailure = false;
      } catch {
        lastFailedRevision = targetRevision;
        if (notifyPendingFailure && !warningShown) {
          warningShown = true;
          options.warning(
            "未保存草稿暂时无法写入恢复文件，请先保存文稿再关闭应用"
          );
        }
        return;
      }
    }
  }

  async function flush(
    flushOptions: { notify?: boolean } = {}
  ): Promise<void> {
    if (disposed || phase.value !== "ready") return;
    cancelTimer();
    notifyPendingFailure ||= flushOptions.notify !== false;
    if (drainPromise) return drainPromise;

    const operation = drain();
    drainPromise = operation;
    try {
      await operation;
    } finally {
      if (drainPromise === operation) {
        drainPromise = null;
      }
      if (
        phase.value === "ready" &&
        !disposing &&
        !disposed &&
        lastFailedRevision >= 0 &&
        revision > lastFailedRevision
      ) {
        schedule();
      }
    }
  }

  function beforeUnload(): void {
    void flush({ notify: false });
  }

  async function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    if (disposed) return;

    const operation = (async () => {
      disposing = true;
      loadGeneration += 1;
      stopWatchingDrafts();
      cancelTimer();
      if (phase.value === "ready") {
        await flush({ notify: false });
      }
      disposed = true;
      disposing = false;
      phase.value = "disposed";
    })();
    disposePromise = operation;
    await operation;
  }

  return {
    phase,
    recoveredCount,
    load,
    flush,
    beforeUnload,
    nextTimestamp: () => clock.next(),
    dispose
  };
}
