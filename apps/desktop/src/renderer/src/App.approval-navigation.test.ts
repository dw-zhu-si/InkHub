import { describe, expect, it } from "vitest";
import appSource from "./WorkspaceShell.vue?raw";
import editorSource from "./components/LongWorkspaceEditor.vue?raw";
import coordinatorSource from "./composables/useApprovalNavigationCoordinator.ts?raw";
import lazyCoordinatorSource from "./composables/useLazyApprovalNavigationCoordinator.ts?raw";
import resourceTreeSource from "./composables/useWorkspaceResourceTreeCoordinator.ts?raw";

describe("accepted approval navigation wiring", () => {
  it("routes both approval card families into the central navigator", () => {
    expect(appSource).toContain(
      '@locate-edit-proposal="locateAcceptedEditProposal"'
    );
    expect(appSource).toContain(
      '@locate-long-proposal="locateAcceptedLongProposal"'
    );
    expect(appSource).toContain("resolveAgentEditApprovalTarget(proposal)");
    expect(appSource).toContain("resolveLongProposalApprovalTarget(item)");
  });

  it("preserves the long editor save barrier and retries stale indexes", () => {
    expect(coordinatorSource).toContain(
      "context.longWorkspace.saveActiveEditorChanges()"
    );
    expect(coordinatorSource).toContain("resolved.candidateIndex > 0");
    expect(coordinatorSource).toContain(
      "await context.longWorkspace.refresh(target.bookId)"
    );
    expect(appSource).toContain("resolveLongApprovalNavigation(");
    expect(appSource).toContain("rightCollapsed.value = false");
    expect(lazyCoordinatorSource).toContain(
      '() => import("./useApprovalNavigationCoordinator")'
    );
    expect(appSource).not.toContain(
      'import { useApprovalNavigationCoordinator }'
    );
  });

  it("selects exact left-tree items and uses parent fallbacks", () => {
    expect(resourceTreeSource).toContain(
      "function preferredLongResourceIdForSelection("
    );
    expect(resourceTreeSource).toContain('selection.key.startsWith("chapter:")');
    expect(editorSource).toContain(
      "if (explicitlySelectedFile) return explicitlySelectedFile;"
    );
    expect(appSource).toContain(
      "preferredLongResourceId: preferredLongResourceIdForSelection"
    );
    expect(coordinatorSource).toContain("if (!target.sectionId)");
    expect(coordinatorSource).toContain("await context.catalog.refresh()");
    expect(coordinatorSource).toContain("requestIsCurrent(requestId)");
    expect(appSource).toContain(
      'uiMessage.warning("目标文件或所属条目已不存在，无法跳转。")'
    );
  });

  it("lets the long editor focus exact files and structured targets", () => {
    expect(editorSource).toContain("async function focusFile(fileId: string)");
    expect(editorSource).toContain(
      "async function focusTarget(target: LongApprovalEditorFocus)"
    );
    expect(editorSource).toContain("selectWorldbuildingItem(item.id)");
    expect(editorSource).toContain('selectPlotPointTab("storyline")');
    expect(editorSource).toContain("foreshadowingWorkspace.value?.focusTarget(");
    expect(editorSource).toContain("defineExpose({");
  });
});
