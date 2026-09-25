import { describe, expect, it } from "vitest";
import appSource from "../WorkspaceShell.vue?raw";
import catalogProjectionSource from "./useCatalogWorkspaceProjectionCoordinator.ts?raw";
import lazySource from "./useLazyProposalCoordinator.ts?raw";
import source from "./useProposalCoordinator.ts?raw";

describe("useProposalCoordinator extraction boundary", () => {
  it("keeps App as wiring while proposal implementations live in the coordinator", () => {
    expect(appSource).toContain(
      'import { useLazyProposalCoordinator } from "./composables/useLazyProposalCoordinator"'
    );
    expect(appSource).toContain("} = useLazyProposalCoordinator({");
    expect(appSource).toContain("catalog: {");
    expect(appSource).toContain("editor: {");
    expect(appSource).toContain("conversations: {");
    expect(appSource).toContain(
      "conversationStore.removeController(key, options)"
    );
    expect(appSource).toContain("longWorkspace: {");
    expect(appSource).toContain("navigation: {");

    expect(appSource).not.toContain("type WorkspaceEditorMutationEvent");
    expect(appSource).not.toContain("function stageAgentEditProposal(");
    expect(appSource).not.toContain("function stageLibraryEditProposal(");
    expect(appSource).not.toContain("function applyAgentEdit(");
    expect(appSource).not.toContain("function scheduleQueuedAgentEdits(");
    expect(appSource).not.toContain("agentEditCommitQueue");
    expect(appSource).not.toContain("acceptedDraftSectionCreationRevisions");
  });

  it("loads the coordinator on demand and serializes calls made while loading", () => {
    expect(lazySource).toContain(
      'import type {\n  ProposalCoordinator,\n  ProposalCoordinatorContext\n} from "./useProposalCoordinator"'
    );
    expect(lazySource).not.toContain(
      'import { useProposalCoordinator } from "./useProposalCoordinator"'
    );
    expect(lazySource).toContain('import("./useProposalCoordinator")');
    expect(lazySource).toContain(
      "let invocationTail: Promise<void> = Promise.resolve()"
    );
    expect(lazySource).toContain("const result = invocationTail.then(async () =>");
    expect(lazySource).toContain("invocationTail = result.then(");
    expect(lazySource).toContain("pendingInvocationCount > 0");
    expect(appSource).not.toContain(
      "function resumeRecoveredAutomaticAgentEditsIfNeeded("
    );
    expect(catalogProjectionSource).toContain(
      "function resumeRecoveredAutomaticEditsIfNeeded("
    );
    expect(catalogProjectionSource).toContain(
      'proposal.approvalMode === "auto-approve"'
    );
    expect(catalogProjectionSource).toContain(
      'proposal.status === "pending"'
    );
  });

  it("uses an explicit typed context and injected runtime services", () => {
    expect(source).toContain("export interface ProposalCoordinatorContext");
    expect(source).toContain("api(): DeepWriteApi | undefined");
    expect(source).toContain(
      "notifications: ProposalCoordinatorNotifications"
    );
    expect(source).toContain(
      "snapshot: ShallowRef<CatalogIndexSnapshot | null>"
    );
    expect(source).toContain("documents: ShallowRef<WorkspaceDocument[]>");
    expect(source).toContain(
      "active: ComputedRef<AgentConversationController>"
    );
    expect(source).toContain("const currentApi = api()");
    expect(source).not.toContain("window.deepwrite");
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toMatch(/\[key:\s*string\]\s*:\s*any/u);
    expect(source).not.toContain("Record<string, any>");
    expect(source).toContain("remove: removeConversation");
    expect(source).toContain("removeConversation(conversationKey)");
    expect(source).not.toContain("conversations.delete(conversationKey)");
  });

  it("keeps the queue and revision bookkeeping private and ordered", () => {
    expect(source).toContain(
      "const queuedAgentEdits = new Map<string, QueuedAgentEdit>()"
    );
    expect(source).toContain(
      "const agentEditCommitQueue = createKeyedSerialTaskQueue<string>()"
    );
    expect(source).toContain("stageAgentEditProposalRevision(");
    expect(source).toContain("beginAgentEditProposalCommit(");
    expect(source).toContain("expectedMutationDurableRevision(");
    expect(source).toContain(
      ".enqueue(workspaceId, () =>\n          drainQueuedAgentEditsForWorkspace(workspaceId)"
    );
    expect(source).toContain("function hasQueuedAgentEdits(): boolean");
    expect(source).toContain("activeAgentEditCommitTasks.add(task)");
    expect(source).toContain("async function drain(): Promise<void>");
    expect(source).toContain("function dispose(): Promise<void>");
    expect(source).not.toContain("queue: {");
  });

  it("exposes every App and template entry point after the move", () => {
    for (const method of [
      "resumeRecoveredAutomaticAgentEdits",
      "hasQueuedAgentEdits",
      "reviewAgentEdit",
      "reviewLongAgentEdit",
      "scheduleQueuedAgentEdits",
      "stageAgentEditProposal",
      "stageLibraryEditProposal",
      "stageLongCharacterEditProposal",
      "stageLongDraftEditProposal",
      "stageLongPlotDesignEditProposal",
      "stageLongWorldbuildingEditProposal",
      "drain",
      "dispose"
    ]) {
      expect(source).toContain(method);
      expect(appSource).toContain(method);
    }
  });

  it("retains the critical short, library, and long persistence paths", () => {
    expect(source).toContain("async function acceptLongDraftProposal(");
    expect(source).toContain("await api.previewOperations(");
    expect(source).toContain("await api.applyOperations(");
    expect(source).toContain("async function acceptLibraryCreationProposal(");
    expect(source).toContain("currentApi.catalog.createLibraryEntry({");
    expect(source).toContain("async function acceptDraftSectionCreationProposal(");
    expect(source).toContain("currentApi.catalog.createDraftSections({");
    expect(source).toContain("async function acceptLongPlotDesignProposal(");
    expect(source).toContain("async function acceptLongCharacterFileProposal(");
    expect(source).toContain("async function acceptLongWorldbuildingFileProposal(");
  });
});
