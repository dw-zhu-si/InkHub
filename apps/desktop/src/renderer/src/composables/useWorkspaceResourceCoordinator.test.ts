import type {
  CatalogSnapshot,
  LongBookSummary,
  LongWorkspaceIndexSnapshot,
  LongWorkspaceRuntimeContext
} from "@deepwrite/contracts";
import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type {
  ResourceTreeNode,
  ResourceTreeSection,
  WorkspaceDocument
} from "../types/workspace";
import { createResourceTreeLookup } from "../utils/resourceTreeLookup";
import {
  useWorkspaceResourceCoordinator,
  type WorkspaceResourceCatalogPort,
  type WorkspaceResourceCoordinatorOptions
} from "./useWorkspaceResourceCoordinator";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function workspaceDocument(id: string): WorkspaceDocument {
  return {
    id,
    domain: "creation",
    title: id,
    eyebrow: "短篇 · 正文",
    path: ["测试作品", id],
    content: `${id} content`,
    workspaceId: "book-1",
    workspaceType: "short",
    stageId: "draft",
    catalogContentLoaded: true
  };
}

const EMPTY_DOCUMENT: WorkspaceDocument = {
  id: "empty",
  domain: "creation",
  title: "未选择",
  eyebrow: "创作空间",
  path: ["未选择"],
  content: "",
  readOnly: true
};

function loadResult(
  document: WorkspaceDocument,
  documents: readonly WorkspaceDocument[]
) {
  return {
    ok: true,
    requestedIds: [document.id],
    loadedIds: [document.id],
    alreadyLoadedIds: [],
    skippedIds: [],
    retriedIds: [],
    failures: [],
    published: false,
    documents,
    document
  } as const;
}

function createHarness(
  ensureOne?: WorkspaceResourceCatalogPort["loader"]["ensureOne"],
  useCatalogReconciliationGate = false
) {
  const documents = ref<WorkspaceDocument[]>([
    workspaceDocument("document-a"),
    workspaceDocument("document-b")
  ]);
  const nodes: ResourceTreeNode[] = [
    {
      id: "resource-a",
      label: "资源 A",
      targetDocumentId: "document-a"
    },
    {
      id: "resource-b",
      label: "资源 B",
      targetDocumentId: "document-b"
    }
  ];
  const sections = ref<ResourceTreeSection[]>([
    {
      id: "creation",
      label: "创作空间",
      icon: "book",
      nodes
    }
  ]);
  const selectedResourceId = ref("");
  const activeCreationResourceId = ref("");
  const rightCollapsed = ref(true);
  const showConversation = vi.fn();
  const catalogProjection = ref<
    WorkspaceResourceCatalogPort["projection"]["value"]
  >(null);
  const reconciledCatalogProjection = ref<
    WorkspaceResourceCatalogPort["projection"]["value"]
  >(null);
  const notifications = {
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  };
  const defaultEnsureOne: WorkspaceResourceCatalogPort["loader"]["ensureOne"] =
    async (target) => {
      const id = typeof target === "string" ? target : target.id;
      const document = documents.value.find((candidate) => candidate.id === id);
      if (!document) {
        return {
          ok: false,
          requestedIds: [id],
          loadedIds: [],
          alreadyLoadedIds: [],
          skippedIds: [],
          retriedIds: [],
          failures: [
            {
              documentId: id,
              code: "document-removed",
              attempts: 0
            }
          ],
          published: false,
          documents: documents.value,
          document: undefined
        };
      }
      return loadResult(document, documents.value);
    };
  const loader: WorkspaceResourceCatalogPort["loader"] = {
    documentsById: computed(
      () => new Map(documents.value.map((document) => [document.id, document]))
    ),
    async ensureLoaded(targets) {
      const requestedIds = (targets ?? documents.value).map((target) =>
        typeof target === "string" ? target : target.id
      );
      return {
        ok: true,
        requestedIds,
        loadedIds: requestedIds,
        alreadyLoadedIds: [],
        skippedIds: [],
        retriedIds: [],
        failures: [],
        published: false,
        documents: documents.value
      };
    },
    ensureOne: ensureOne ?? defaultEnsureOne,
    contextSnapshot(snapshot: CatalogSnapshot | null) {
      return snapshot;
    }
  };
  const options: WorkspaceResourceCoordinatorOptions = {
    state: {
      selectedResourceId,
      activeCreationResourceId,
      selectedExpertSectionIds: ref({}),
      selectedDraftFileKinds: ref({}),
      pendingEditorReferences: ref([]),
      editorReferenceNavigation: ref(),
      documents,
      editorDrafts: ref({})
    },
    catalog: {
      snapshot: ref(null),
      projection: catalogProjection,
      ...(useCatalogReconciliationGate
        ? { reconciledProjection: reconciledCatalogProjection }
        : {}),
      loader,
      findBook: () => undefined
    },
    tree: {
      sections,
      lookup: computed(() => createResourceTreeLookup(sections.value))
    },
    longNavigation: {
      books: ref<LongBookSummary[]>([]),
      activeBookId: ref(null),
      activeBookSummary: ref<LongBookSummary | null>(null),
      workspaceIndex: ref<LongWorkspaceIndexSnapshot | null>(null),
      activeRoot:
        ref<LongWorkspaceRuntimeContext["activeRoot"]>("worldbuilding"),
      workspaceActive: ref(false),
      blockWritingPlan: () => false,
      saveActiveEditorBeforeLeaving: async () => true,
      openBook: async () => undefined,
      selectWorkspaceFile: async () => true,
      deactivateActiveBook: () => undefined
    },
    emptyDocument: EMPTY_DOCUMENT,
    showConversation,
    revealEditor: () => {
      rightCollapsed.value = false;
    },
    notifications
  };
  const coordinator = useWorkspaceResourceCoordinator(options);
  return {
    activeCreationResourceId,
    catalogProjection,
    coordinator,
    documents,
    nodes,
    notifications,
    rightCollapsed,
    reconciledCatalogProjection,
    sections,
    selectedResourceId,
    showConversation
  };
}

describe("useWorkspaceResourceCoordinator", () => {
  it("publishes only the latest resource selection when body reads settle out of order", async () => {
    const pending = new Map<string, Deferred<ReturnType<typeof loadResult>>>();
    let documents: readonly WorkspaceDocument[] = [];
    const harness = createHarness(async (target) => {
      const document = typeof target === "string"
        ? documents.find((candidate) => candidate.id === target)
        : target;
      if (!document) throw new Error("Missing test document");
      const request = deferred<ReturnType<typeof loadResult>>();
      pending.set(document.id, request);
      return request.promise;
    });
    documents = harness.documents.value;

    const selectingA = harness.coordinator.selectResource(harness.nodes[0]!);
    await Promise.resolve();
    const selectingB = harness.coordinator.selectResource(harness.nodes[1]!);
    await Promise.resolve();

    pending.get("document-b")!.resolve(
      loadResult(harness.documents.value[1]!, harness.documents.value)
    );
    await selectingB;
    pending.get("document-a")!.resolve(
      loadResult(harness.documents.value[0]!, harness.documents.value)
    );
    await selectingA;

    expect(harness.selectedResourceId.value).toBe("resource-b");
    expect(harness.activeCreationResourceId.value).toBe("resource-b");
    expect(harness.rightCollapsed.value).toBe(false);
    expect(harness.showConversation).toHaveBeenCalledTimes(1);
  });

  it("invalidates pending navigation and stops selection reconciliation on dispose", async () => {
    const pending = deferred<ReturnType<typeof loadResult>>();
    const harness = createHarness(async (target) => {
      const document = typeof target === "string"
        ? harness.documents.value.find((candidate) => candidate.id === target)
        : target;
      if (!document) throw new Error("Missing test document");
      return pending.promise;
    });

    const selecting = harness.coordinator.selectResource(harness.nodes[0]!);
    await Promise.resolve();
    harness.coordinator.dispose();
    pending.resolve(
      loadResult(harness.documents.value[0]!, harness.documents.value)
    );
    await selecting;

    expect(harness.selectedResourceId.value).toBe("");
    expect(harness.activeCreationResourceId.value).toBe("");
    expect(harness.showConversation).not.toHaveBeenCalled();

    harness.selectedResourceId.value = "resource-a";
    harness.activeCreationResourceId.value = "resource-a";
    harness.sections.value = [];
    expect(harness.selectedResourceId.value).toBe("resource-a");
    expect(harness.activeCreationResourceId.value).toBe("resource-a");
  });

  it("waits for the matching Catalog document overlay before reconciling a tree change", () => {
    const harness = createHarness(undefined, true);
    harness.selectedResourceId.value = "resource-a";
    harness.activeCreationResourceId.value = "resource-a";
    const nextProjection = {
      resourceSections: [],
      workspaceDocuments: [],
      draftDirectories: [],
      index: {
        resourceNodeById: new Map(),
        workspaceDocumentById: new Map(),
        resourceIdByDocumentId: new Map(),
        resourceTargetDocumentIdById: new Map(),
        draftDirectoryById: new Map(),
        draftDirectoryByWorkspaceId: new Map(),
        preferredResourceIdByWorkspaceId: new Map(),
        workspaceIdByResourceId: new Map()
      }
    } as WorkspaceResourceCatalogPort["projection"]["value"];

    harness.catalogProjection.value = nextProjection;
    harness.sections.value = [
      {
        id: "creation",
        label: "创作空间",
        icon: "book",
        nodes: [harness.nodes[1]!]
      }
    ];

    expect(harness.selectedResourceId.value).toBe("resource-a");
    expect(harness.activeCreationResourceId.value).toBe("resource-a");

    // The Catalog projection coordinator owns the matching selection repair;
    // publishing its gate must not replay the earlier tree against stale docs.
    harness.selectedResourceId.value = "resource-b";
    harness.activeCreationResourceId.value = "resource-b";
    harness.reconciledCatalogProjection.value = nextProjection;
    expect(harness.selectedResourceId.value).toBe("resource-b");
    expect(harness.activeCreationResourceId.value).toBe("resource-b");
  });
});
