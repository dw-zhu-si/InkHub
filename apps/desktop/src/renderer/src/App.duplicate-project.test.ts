import { describe, expect, it } from "vitest";
import appSource from "./WorkspaceShell.vue?raw";
import libraryTransactionsSource from "./composables/useCatalogLibraryTransactionsCoordinator.ts?raw";
import longBookLifecycleSource from "./composables/useLongBookLifecycleCoordinator.ts?raw";
import lazyShortBookLifecycleSource from "./composables/useLazyShortBookLifecycleCoordinator.ts?raw";
import shortBookLifecycleSource from "./composables/useShortBookLifecycleCoordinator.ts?raw";
import shortStructureSource from "./composables/useShortWorkspaceStructureCoordinator.ts?raw";

describe("project duplicate integration", () => {
  it("saves catalog drafts, calls the duplicate API and navigates to normal copies", () => {
    expect(appSource).toContain("prepareLibraryProjectsForDuplicate");
    expect(shortStructureSource).toContain(
      "prepareBookStructureMutation(book.id)"
    );
    expect(shortStructureSource).toContain("api.duplicateProject");
    expect(shortStructureSource).toContain('domain: "book"');
    expect(libraryTransactionsSource).toContain(
      'payload.action === "duplicate-group"'
    );
    expect(libraryTransactionsSource).toContain(
      "duplicated.copiedMemberLibraryIds.length"
    );
    expect(libraryTransactionsSource).toContain("api.duplicateProject({");
    expect(appSource).toContain("resolvePreferredBookResourceId");
    expect(shortStructureSource).toContain("enqueueWorkspaceMutation(book.id");
    expect(lazyShortBookLifecycleSource).toContain(
      "loaded.duplicateBook(target)"
    );
    expect(shortBookLifecycleSource).toContain(
      "await structure.duplicateBook(target.node as ResourceTreeNode)"
    );
    expect(appSource).toContain("duplicateBook: duplicateCatalogBook");
  });

  it("blocks an active long writing plan, saves the editor and opens the copy", () => {
    expect(longBookLifecycleSource).toContain('case "duplicate"');
    expect(longBookLifecycleSource).toContain(
      "await session.saveActiveEditorChanges()"
    );
    expect(longBookLifecycleSource).toContain(
      "await api.duplicateBook({ bookId })"
    );
    expect(longBookLifecycleSource).toContain(
      "await resources.selectBook(duplicated.book.id)"
    );
    expect(longBookLifecycleSource).toContain("请先取消计划，再复制长篇");
  });
});
