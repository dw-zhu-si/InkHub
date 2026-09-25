import type { Ref, ShallowRef } from "vue";
import type { EditorDraftState, WorkspaceDocument } from "../types/workspace";

export interface EditorSavePayload {
  id: string;
  title: string;
  content: string;
}

export type EditorPersistOutcome = "saved" | "retry" | "paused";

export interface EditorAutoSaveTimerPort {
  setTimeout(callback: () => void, delay?: number): number;
  clearTimeout(timerId?: number): void;
}

export interface EditorAutoSaveCoordinatorOptions {
  enabled: Readonly<Ref<boolean>>;
  drafts: Readonly<ShallowRef<Record<string, EditorDraftState>>>;
  documents: Readonly<ShallowRef<WorkspaceDocument[]>>;
  timer: EditorAutoSaveTimerPort;
  persist(
    payload: EditorSavePayload,
    announceSuccess: boolean
  ): Promise<EditorPersistOutcome>;
  isConflicted(documentId: string): boolean;
  isWriteBlocked(document: WorkspaceDocument): boolean;
  /** Flushes deferred catalog reconciliation once the save lane is quiet. */
  onIdle?(): Promise<void>;
  onUnexpectedError?(error: unknown): void;
  debounceMs?: number;
  retryMs?: number;
  maxRetryMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 800;
const DEFAULT_RETRY_MS = 250;
const DEFAULT_MAX_RETRY_MS = 30_000;

/**
 * Owns editor save timers and the single serialized persistence lane. Durable
 * catalog writes remain behind the injected port, so scheduling and conflict
 * state can be tested independently.
 */
export function useEditorAutoSaveCoordinator(
  options: EditorAutoSaveCoordinatorOptions
) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const maxRetryMs = options.maxRetryMs ?? DEFAULT_MAX_RETRY_MS;
  const timers = new Map<string, number>();
  const retryAttempts = new Map<string, number>();
  let saveChain: Promise<void> = Promise.resolve();
  let pendingTaskCount = 0;
  let disposed = false;

  function clearTimer(documentId: string): void {
    const timer = timers.get(documentId);
    if (timer !== undefined) options.timer.clearTimeout(timer);
    timers.delete(documentId);
  }

  function cancel(documentId?: string): void {
    if (documentId !== undefined) {
      clearTimer(documentId);
      retryAttempts.delete(documentId);
      return;
    }
    for (const timer of timers.values()) {
      options.timer.clearTimeout(timer);
    }
    timers.clear();
    retryAttempts.clear();
    enqueue(notifyIdleIfNeeded);
  }

  function enqueue(task: () => Promise<void>): void {
    if (disposed) return;
    pendingTaskCount += 1;
    const operation = saveChain.catch(() => undefined).then(async () => {
      try {
        await task();
      } finally {
        pendingTaskCount -= 1;
      }
    });
    saveChain = operation.catch((error: unknown) => {
      options.onUnexpectedError?.(error);
    });
  }

  function arm(documentId: string, delay: number): void {
    if (disposed || !options.enabled.value) return;
    clearTimer(documentId);
    timers.set(
      documentId,
      options.timer.setTimeout(() => {
        timers.delete(documentId);
        enqueue(() => run(documentId));
      }, delay)
    );
  }

  function schedule(documentId: string, delay = debounceMs): void {
    retryAttempts.delete(documentId);
    arm(documentId, delay);
  }

  function scheduleRetry(documentId: string): void {
    const attempt = (retryAttempts.get(documentId) ?? 0) + 1;
    retryAttempts.set(documentId, attempt);
    const exponent = Math.min(attempt - 1, 20);
    arm(documentId, Math.min(maxRetryMs, retryMs * 2 ** exponent));
  }

  function scheduleDirty(): void {
    if (disposed || !options.enabled.value) return;
    for (const [documentId, draft] of Object.entries(options.drafts.value)) {
      if (draft.dirty) schedule(documentId);
    }
  }

  async function notifyIdleIfNeeded(): Promise<void> {
    if (timers.size === 0 && pendingTaskCount <= 1) {
      await options.onIdle?.();
    }
  }

  async function run(documentId: string): Promise<void> {
    try {
      if (disposed || !options.enabled.value) return;
      const draft = options.drafts.value[documentId];
      const document = options.documents.value.find(
        (candidate) => candidate.id === documentId
      );
      if (!draft?.dirty || !document || document.readOnly) return;

      const conflicted = options.isConflicted(documentId);
      if (conflicted || options.isWriteBlocked(document)) {
        if (!conflicted) {
          scheduleRetry(documentId);
        }
        return;
      }

      const submittedPayload: EditorSavePayload = {
        id: documentId,
        title: draft.title,
        content: draft.content
      };
      const outcome = await options.persist(submittedPayload, false);

      // A conflict can reveal that submittedPayload already exists on disk while
      // the user has typed a newer draft. Requeue that newer draft independently
      // of the submitted outcome; otherwise it remains dirty until another input.
      const latestDraft = options.drafts.value[documentId];
      if (
        latestDraft?.dirty &&
        (latestDraft.title !== submittedPayload.title ||
          latestDraft.content !== submittedPayload.content)
      ) {
        schedule(documentId);
      } else if (outcome === "retry") {
        scheduleRetry(documentId);
      } else {
        retryAttempts.delete(documentId);
      }
    } finally {
      await notifyIdleIfNeeded();
    }
  }

  function apply(payload: EditorSavePayload): void {
    cancel(payload.id);
    enqueue(async () => {
      await options.persist(payload, true);
    });
  }

  async function drain(): Promise<void> {
    await saveChain;
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    cancel();
    await drain();
    await options.onIdle?.();
  }

  return {
    apply,
    cancel,
    dispose,
    drain,
    schedule,
    scheduleDirty
  };
}

export type EditorAutoSaveCoordinator = ReturnType<
  typeof useEditorAutoSaveCoordinator
>;
