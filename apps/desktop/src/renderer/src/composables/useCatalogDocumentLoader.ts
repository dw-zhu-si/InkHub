import type {
  CatalogReadDocumentInput,
  CatalogReadDocumentResult,
  CatalogSnapshot
} from "@deepwrite/contracts";
import { computed, shallowRef, type ShallowRef } from "vue";
import type { CatalogWorkspaceProjection } from "../data/catalogWorkspace";
import {
  CatalogDocumentReadInvalidatedError,
  useCatalogIndexStore
} from "../stores/catalogIndexStore";
import type { WorkspaceDocument } from "../types/workspace";
import {
  applyCatalogDocumentResult,
  catalogDocumentReadDescriptor,
  catalogSnapshotWithDocumentContents,
  type CatalogDocumentReadDescriptor
} from "../utils/catalogDocumentContent";

export interface CatalogDocumentReaderPort {
  readDocument(
    input: CatalogReadDocumentInput
  ): Promise<CatalogReadDocumentResult>;
}

export type CatalogDocumentIndexPort = Pick<
  ReturnType<typeof useCatalogIndexStore>,
  "readDocument" | "invalidateDocument"
>;

export interface CatalogDocumentLoaderOptions {
  catalogIndex: CatalogDocumentIndexPort;
  reader(): CatalogDocumentReaderPort | undefined;
  /** Lets WorkspaceShell keep its existing shallow document ref while migrating. */
  documents?: ShallowRef<WorkspaceDocument[]>;
}

export type CatalogDocumentLoadFailureCode =
  | "reader-unavailable"
  | "read-failed"
  | "invalid-result"
  | "stale-descriptor"
  | "document-removed";

export interface CatalogDocumentLoadFailure {
  documentId: string;
  code: CatalogDocumentLoadFailureCode;
  attempts: 0 | 1 | 2;
  descriptor?: CatalogDocumentReadDescriptor;
  error?: unknown;
}

export interface CatalogDocumentsLoadResult {
  ok: boolean;
  requestedIds: readonly string[];
  loadedIds: readonly string[];
  alreadyLoadedIds: readonly string[];
  skippedIds: readonly string[];
  retriedIds: readonly string[];
  failures: readonly CatalogDocumentLoadFailure[];
  published: boolean;
  documents: readonly WorkspaceDocument[];
}

export interface CatalogDocumentLoadResult
  extends CatalogDocumentsLoadResult {
  document: WorkspaceDocument | undefined;
}

export interface EnsureCatalogDocumentsOptions {
  /** Re-read even if the current overlay already contains a body. */
  refresh?: boolean;
}

export interface InvalidateCatalogDocumentOptions {
  /** Restore the last projected metadata-only document in the overlay. */
  discardContent?: boolean;
}

export interface CatalogProjectionReconcileResult {
  documents: readonly WorkspaceDocument[];
  retainedBodyIds: readonly string[];
  discardedBodyIds: readonly string[];
  removedIds: readonly string[];
}

export type CatalogDocumentTarget = string | WorkspaceDocument;

interface ReadRequest {
  documentId: string;
  descriptor: CatalogDocumentReadDescriptor;
  generation: number;
  attempt: 1 | 2;
  refresh: boolean;
}

interface SettledRead {
  request: ReadRequest;
  result?: Readonly<CatalogReadDocumentResult>;
  error?: unknown;
  readerUnavailable?: boolean;
}

function targetId(target: CatalogDocumentTarget): string {
  return typeof target === "string" ? target : target.id;
}

function uniqueTargetIds(
  targets: readonly CatalogDocumentTarget[]
): string[] {
  return [...new Set(targets.map(targetId))];
}

function descriptorKey(
  document: WorkspaceDocument | undefined
): string | undefined {
  return document
    ? catalogDocumentReadDescriptor(document)?.cacheKey
    : undefined;
}

/**
 * Owns the metadata projection/body overlay boundary. Catalog projection stays
 * metadata-only; bodies are carried forward only while the stamped descriptor
 * is unchanged and every asynchronous read is revalidated before publication.
 */
export function useCatalogDocumentLoader(
  options: CatalogDocumentLoaderOptions
) {
  const documents =
    options.documents ?? shallowRef<WorkspaceDocument[]>([]);
  const documentsById = computed<ReadonlyMap<string, WorkspaceDocument>>(
    () => new Map(documents.value.map((document) => [document.id, document]))
  );
  const documentGenerations = new Map<string, number>();
  let projectedDocumentsById: ReadonlyMap<string, WorkspaceDocument> =
    new Map();
  let disposed = false;

  function generation(documentId: string): number {
    return documentGenerations.get(documentId) ?? 0;
  }

  function invalidateGeneration(documentId: string): void {
    documentGenerations.set(documentId, generation(documentId) + 1);
  }

  function invalidateDescriptor(
    descriptor: CatalogDocumentReadDescriptor | undefined
  ): boolean {
    return descriptor
      ? options.catalogIndex.invalidateDocument(descriptor.cacheKey)
      : false;
  }

  function reconcileProjection(
    projection: CatalogWorkspaceProjection
  ): CatalogProjectionReconcileResult {
    if (disposed) {
      return {
        documents: documents.value,
        retainedBodyIds: [],
        discardedBodyIds: [],
        removedIds: []
      };
    }
    const previousById = documentsById.value;
    const nextProjectedById = projection.index.workspaceDocumentById;
    const retainedBodyIds: string[] = [];
    const discardedBodyIds: string[] = [];
    const removedIds: string[] = [];

    for (const previous of previousById.values()) {
      const next = nextProjectedById.get(previous.id);
      const previousDescriptor = catalogDocumentReadDescriptor(previous);
      if (!next) {
        removedIds.push(previous.id);
        invalidateGeneration(previous.id);
        invalidateDescriptor(previousDescriptor);
        continue;
      }
      if (previousDescriptor?.cacheKey !== descriptorKey(next)) {
        invalidateGeneration(previous.id);
        invalidateDescriptor(previousDescriptor);
        if (previous.catalogContentLoaded !== false) {
          discardedBodyIds.push(previous.id);
        }
      }
    }

    const nextDocuments = projection.workspaceDocuments.map((projected) => {
      const previous = previousById.get(projected.id);
      if (
        !previous ||
        previous.catalogContentLoaded === false ||
        descriptorKey(previous) !== descriptorKey(projected)
      ) {
        return projected;
      }
      retainedBodyIds.push(projected.id);
      return {
        ...projected,
        content: previous.content,
        catalogContentLoaded: true
      };
    });

    projectedDocumentsById = nextProjectedById;
    documents.value = nextDocuments;
    return {
      documents: nextDocuments,
      retainedBodyIds,
      discardedBodyIds,
      removedIds
    };
  }

  function invalidate(
    target: CatalogDocumentTarget,
    invalidateOptions: InvalidateCatalogDocumentOptions = {}
  ): boolean {
    const documentId = targetId(target);
    const supplied = typeof target === "string" ? undefined : target;
    const current = documentsById.value.get(documentId);
    const descriptors = new Map<string, CatalogDocumentReadDescriptor>();
    for (const descriptor of [
      supplied ? catalogDocumentReadDescriptor(supplied) : undefined,
      current ? catalogDocumentReadDescriptor(current) : undefined
    ]) {
      if (descriptor) descriptors.set(descriptor.cacheKey, descriptor);
    }

    invalidateGeneration(documentId);
    let invalidated = false;
    for (const descriptor of descriptors.values()) {
      invalidateDescriptor(descriptor);
      invalidated = true;
    }

    if (invalidateOptions.discardContent && current) {
      const projected = projectedDocumentsById.get(documentId);
      if (projected) {
        documents.value = documents.value.map((document) =>
          document.id === documentId ? projected : document
        );
      }
    }
    return invalidated;
  }

  async function performRead(request: ReadRequest): Promise<SettledRead> {
    const reader = options.reader();
    if (!reader) {
      return { request, readerUnavailable: true };
    }
    try {
      const result = await options.catalogIndex.readDocument<CatalogReadDocumentResult>(
        request.descriptor.cacheKey,
        () => reader.readDocument(request.descriptor.input),
        request.refresh ? { refresh: true } : undefined
      );
      return { request, result };
    } catch (error: unknown) {
      return { request, error };
    }
  }

  function requestIsCurrent(request: ReadRequest): boolean {
    const current = documentsById.value.get(request.documentId);
    return Boolean(
      !disposed &&
        current &&
        descriptorKey(current) === request.descriptor.cacheKey &&
        generation(request.documentId) === request.generation
    );
  }

  function retryRequest(settled: SettledRead): ReadRequest | undefined {
    if (disposed) return undefined;
    const invalidatedByNewerRead =
      settled.error instanceof CatalogDocumentReadInvalidatedError;
    if (
      settled.request.attempt !== 1 ||
      (requestIsCurrent(settled.request) && !invalidatedByNewerRead)
    ) {
      return undefined;
    }
    const current = documentsById.value.get(settled.request.documentId);
    if (!current) return undefined;
    const descriptor = catalogDocumentReadDescriptor(current);
    if (!descriptor) return undefined;
    return {
      documentId: current.id,
      descriptor,
      generation: generation(current.id),
      attempt: 2,
      refresh: false
    };
  }

  async function settleWithLatestDescriptor(
    initial: readonly ReadRequest[]
  ): Promise<SettledRead[]> {
    const settled = await Promise.all(initial.map(performRead));

    // Another request in the same batch may keep the batch open while a
    // projection changes. Iterate until every first attempt that became stale
    // has consumed its one allowed retry. Each document still reads at most twice.
    while (true) {
      const retryEntries = settled.flatMap((item, index) => {
        const request = retryRequest(item);
        return request ? [{ index, request }] : [];
      });
      if (!retryEntries.length) return settled;
      const replacements = await Promise.all(
        retryEntries.map(({ request }) => performRead(request))
      );
      retryEntries.forEach(({ index }, replacementIndex) => {
        settled[index] = replacements[replacementIndex]!;
      });
    }
  }

  function failureForSettledRead(
    settled: SettledRead
  ): CatalogDocumentLoadFailure | undefined {
    const { request } = settled;
    const current = documentsById.value.get(request.documentId);
    if (!current) {
      return {
        documentId: request.documentId,
        code: "document-removed",
        attempts: request.attempt,
        descriptor: request.descriptor
      };
    }
    if (!requestIsCurrent(request)) {
      return {
        documentId: request.documentId,
        code: "stale-descriptor",
        attempts: request.attempt,
        descriptor: request.descriptor
      };
    }
    if (settled.readerUnavailable) {
      return {
        documentId: request.documentId,
        code: "reader-unavailable",
        attempts: request.attempt,
        descriptor: request.descriptor
      };
    }
    if (settled.error !== undefined) {
      return {
        documentId: request.documentId,
        code: "read-failed",
        attempts: request.attempt,
        descriptor: request.descriptor,
        error: settled.error
      };
    }
    return undefined;
  }

  async function ensureLoaded(
    targets: readonly CatalogDocumentTarget[] = documents.value,
    ensureOptions: EnsureCatalogDocumentsOptions = {}
  ): Promise<CatalogDocumentsLoadResult> {
    const requestedIds = uniqueTargetIds(targets);
    if (disposed) {
      return {
        ok: false,
        requestedIds,
        loadedIds: [],
        alreadyLoadedIds: [],
        skippedIds: [],
        retriedIds: [],
        failures: requestedIds.map((documentId) => {
          const current = documentsById.value.get(documentId);
          const descriptor = current
            ? catalogDocumentReadDescriptor(current)
            : undefined;
          return {
            documentId,
            code: "stale-descriptor" as const,
            attempts: 0 as const,
            ...(descriptor ? { descriptor } : {})
          };
        }),
        published: false,
        documents: documents.value
      };
    }
    const alreadyLoadedIds: string[] = [];
    const skippedIds: string[] = [];
    const retriedIds: string[] = [];
    const failures: CatalogDocumentLoadFailure[] = [];
    const requests: ReadRequest[] = [];

    for (const documentId of requestedIds) {
      const current = documentsById.value.get(documentId);
      if (!current) {
        failures.push({
          documentId,
          code: "document-removed",
          attempts: 0
        });
        continue;
      }
      if (!ensureOptions.refresh && current.catalogContentLoaded !== false) {
        alreadyLoadedIds.push(documentId);
        continue;
      }
      const descriptor = catalogDocumentReadDescriptor(current);
      if (!descriptor) {
        skippedIds.push(documentId);
        continue;
      }
      if (ensureOptions.refresh) {
        // A later explicit refresh must supersede a settled result that is
        // still waiting for other documents in an older batch to finish.
        invalidateGeneration(documentId);
      }
      requests.push({
        documentId,
        descriptor,
        generation: generation(documentId),
        attempt: 1,
        refresh: ensureOptions.refresh ?? false
      });
    }

    const settled = await settleWithLatestDescriptor(requests);
    const hydratedById = new Map<string, WorkspaceDocument>();
    for (const item of settled) {
      if (item.request.attempt === 2) retriedIds.push(item.request.documentId);
      const failure = failureForSettledRead(item);
      if (failure) {
        failures.push(failure);
        continue;
      }
      const current = documentsById.value.get(item.request.documentId)!;
      try {
        hydratedById.set(
          current.id,
          applyCatalogDocumentResult(
            current,
            item.result as CatalogReadDocumentResult
          )
        );
      } catch (error: unknown) {
        failures.push({
          documentId: current.id,
          code: "invalid-result",
          attempts: item.request.attempt,
          descriptor: item.request.descriptor,
          error
        });
      }
    }

    if (hydratedById.size) {
      documents.value = documents.value.map(
        (document) => hydratedById.get(document.id) ?? document
      );
    }
    const loadedIds = [...hydratedById.keys()];
    return {
      ok: failures.length === 0,
      requestedIds,
      loadedIds,
      alreadyLoadedIds,
      skippedIds,
      retriedIds,
      failures,
      published: hydratedById.size > 0,
      documents: documents.value
    };
  }

  async function ensureOne(
    target: CatalogDocumentTarget,
    ensureOptions: EnsureCatalogDocumentsOptions = {}
  ): Promise<CatalogDocumentLoadResult> {
    const documentId = targetId(target);
    const result = await ensureLoaded([target], ensureOptions);
    return {
      ...result,
      document: documentsById.value.get(documentId)
    };
  }

  function contextSnapshot(
    snapshot: CatalogSnapshot | null,
    overlayDocuments: readonly WorkspaceDocument[] = documents.value
  ): CatalogSnapshot | null {
    return snapshot
      ? catalogSnapshotWithDocumentContents(snapshot, overlayDocuments)
      : null;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const documentId of new Set([
      ...documentGenerations.keys(),
      ...documentsById.value.keys(),
      ...projectedDocumentsById.keys()
    ])) {
      invalidateGeneration(documentId);
    }
  }

  return {
    documents,
    documentsById,
    reconcileProjection,
    ensureLoaded,
    ensureOne,
    invalidate,
    contextSnapshot,
    dispose
  };
}
