import { describe, expect, it } from "vitest";
import source from "./WorkspaceShell.vue?raw";
import coordinatorSource from "./composables/useProposalCoordinator.ts?raw";
import structureSource from "./composables/useShortWorkspaceStructureCoordinator.ts?raw";

describe("App agent chapter-file creation", () => {
  it("keeps shared draft conversations out of per-section cleanup", () => {
    expect(structureSource).toContain("function legacyDraftSectionConversationKeys(");
    expect(structureSource).toContain(
      "`${workspaceId}:expert_draft_coordinator:${suffix}`"
    );
    expect(structureSource).toContain(
      "`${workspaceId}:expert_section_writer:${suffix}`"
    );
    expect(structureSource).toContain(
      "for (const key of legacyDraftSectionConversationKeys(bookId, sectionId))"
    );
    expect(structureSource).not.toContain("function draftSectionConversationKeys(");
    expect(source).toContain("legacyDraftSectionConversationKeys,");
  });

  it("stages one structural proposal and atomically persists its chapters", () => {
    expect(coordinatorSource).toContain(
      'mutationTarget?.kind === "expert-draft-section-creation"'
    );
    expect(coordinatorSource).toContain(
      'mutationTarget?.kind === "expert-draft-section-rename"'
    );
    expect(coordinatorSource).toContain(
      'mutationTarget?.kind === "expert-draft-section-deletion"'
    );
    expect(coordinatorSource).toContain("draftSectionCreationTarget: {");
    expect(coordinatorSource).toContain("draftSectionRenameTarget: {");
    expect(coordinatorSource).toContain("draftSectionDeletionTarget: {");
    expect(coordinatorSource).toContain("acceptDraftSectionCreationProposal(");
    expect(coordinatorSource).toContain("acceptDraftSectionRenameProposal(");
    expect(coordinatorSource).toContain("acceptDraftSectionDeletionProposal(");
    expect(coordinatorSource).toContain(
      "await currentApi.catalog.deleteDraftSection({"
    );
    expect(coordinatorSource).toContain(
      "await currentApi.catalog.createDraftSections({"
    );
    expect(coordinatorSource).toContain(
      "operationId: draftSectionCreationOperationId(proposal)"
    );
    expect(coordinatorSource).toContain(
      "clientSectionId: section.provisionalSectionId"
    );
    expect(coordinatorSource).toContain(
      "createdCount = created.sections.length"
    );
    expect(coordinatorSource).toContain("await loadCatalogSnapshot()");
    expect(coordinatorSource).toContain(
      "expectedDraftSectionCreationBaseRevision(proposal)"
    );
    expect(coordinatorSource).toContain(
      "rememberAcceptedDraftSectionCreation(proposal, savedDirectoryRevision)"
    );
    expect(coordinatorSource).toContain("remapProvisionalExpertSectionFileProposals(");
    expect(coordinatorSource).toContain("restoreAcceptedDraftSectionCreationMappings(");
    expect(coordinatorSource).toContain("acceptedDirectoryRevision: savedDirectoryRevision");
    expect(coordinatorSource).toContain("realSectionId: createdMapping.get(");
    expect(coordinatorSource).toContain("requiresIdempotentRecoveryProbe");
    expect(coordinatorSource).toContain("resolveDraftSectionCreationCommitPlan({");
    expect(coordinatorSource).toContain("target.baseProjectRevision");
    expect(coordinatorSource).toContain("pauseDependentProvisionalFileProposals(");
    expect(coordinatorSource).toContain("provisionalExpertSection: true");
    expect(coordinatorSource).toContain("createExpertDraftDirectoryRevision(");
    expect(coordinatorSource).toContain("autoApproveEditPriority(");
    expect(coordinatorSource).toContain("scheduleQueuedAgentEdits(");
    expect(coordinatorSource).toContain("agentEditCommitQueue");
    expect(coordinatorSource).toContain("decisionToken");
    expect(coordinatorSource).toContain("section.hasBody && section.hasCharacterState");
    expect(coordinatorSource).toContain("expectedDirectoryRevision");
    expect(coordinatorSource).toContain("resolveProvisionalWriteStagingMode(");
    expect(coordinatorSource).toContain('stagingMode === "mapped-real"');
    expect(coordinatorSource).toContain("draftSectionCreationRevisionKey(");
    expect(coordinatorSource).toContain("resolveAgentEditProposalGeneration(");
    expect(coordinatorSource).toContain("expectedMutationDurableRevision(");
  });
});
