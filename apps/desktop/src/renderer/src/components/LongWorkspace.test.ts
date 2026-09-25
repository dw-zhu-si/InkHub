import { describe, expect, it } from "vitest";
import appSource from "../WorkspaceShell.vue?raw";
import agentConversationSource from "./AgentConversation.vue?raw";
import bindingsSource from "./LongBookBindingsDialog.vue?raw";
import chapterCardDialogSource from "./CreateLongChapterCardDialog.vue?raw";
import characterDialogSource from "./CreateLongCharacterDialog.vue?raw";
import characterNavigationSource from "./LongCharacterNavigation.vue?raw";
import continuityNavigationSource from "./LongContinuityLedgerNavigation.vue?raw";
import plotPointDialogSource from "./CreateLongPlotPointDialog.vue?raw";
import dialogSource from "./CreateBookDialog.vue?raw";
import editorSource from "./LongWorkspaceEditor.vue?raw";
import longWorkspaceModuleSource from "./LongWorkspaceModule.vue?raw";
import manuscriptNavigationSource from "./LongManuscriptNavigation.vue?raw";
import worldbuildingNavigationSource from "./LongWorldbuildingNavigation.vue?raw";
import foreshadowingSource from "./LongForeshadowingWorkspace.vue?raw";
import legacySyncSource from "./LongLegacySyncDialog.vue?raw";
import leftSidebarSource from "./LeftSidebar.vue?raw";
import proposalSource from "./LongProposalReview.vue?raw";
import removalSource from "./LongBookRemovalDialog.vue?raw";
import rollbackSource from "./LongRollbackDialog.vue?raw";
import sectionSource from "./TreeSection.vue?raw";
import structureSource from "./LongStructureManager.vue?raw";
import treeNodeSource from "./TreeNodeItem.vue?raw";
import workspaceDialogLayerSource from "./WorkspaceDialogLayer.vue?raw";
import longWorkspaceTypeSource from "../types/longWorkspace.ts?raw";
import workspaceTypeSource from "../types/workspace.ts?raw";
import writingOrchestratorSource from "../composables/useLongWritingOrchestrator.ts?raw";
import longConversationSource from "../composables/useLongConversationCoordinator.ts?raw";
import writingWorkflowSource from "../composables/useLongWritingWorkflowCoordinator.ts?raw";
import longBookLifecycleSource from "../composables/useLongBookLifecycleCoordinator.ts?raw";
import presentationCoordinatorSource from "../composables/useLongWorkspacePresentationCoordinator.ts?raw";
import longRollbackSource from "../composables/useLongRollbackCoordinator.ts?raw";
import longWorkspaceSessionSource from "../composables/useLongWorkspaceSessionCoordinator.ts?raw";
import longStructureTransactionsSource from "../composables/useLongStructureTransactionsCoordinator.ts?raw";
import lazyLongStructureTransactionsSource from "../composables/useLazyLongStructureTransactionsCoordinator.ts?raw";
import dialogCoordinatorSource from "../composables/useWorkspaceDialogModuleCoordinator.ts?raw";
import resourceTreeCoordinatorSource from "../composables/useWorkspaceResourceTreeCoordinator.ts?raw";
import featureHostCoordinatorSource from "../composables/useWorkspaceFeatureHostCoordinator.ts?raw";
import workspaceSystemEventRoutesSource from "../events/registerWorkspaceSystemEventRoutes.ts?raw";
import conversationStoreSource from "../stores/conversationStore.ts?raw";
import longWorkspaceStoreSource from "../stores/longWorkspaceStore.ts?raw";
import agentRunPreferencesSource from "../utils/agentRunPreferences.ts?raw";
import longWorkspaceResourceTreeSource from "../utils/longWorkspaceResourceTree.ts?raw";
import writingWorkspaceSource from "./WritingWorkspaceModule.vue?raw";

describe("long-form renderer vertical slice", () => {
  it("keeps create-book loading feedback inside the stable action footer", () => {
    const actionsStart = dialogSource.indexOf(
      '<div class="dialog-actions create-short-book-actions">'
    );
    const statusStart = dialogSource.indexOf(
      'class="dialog-action-status"',
      actionsStart
    );
    const cancelStart = dialogSource.indexOf(
      'class="dialog-secondary-button"',
      actionsStart
    );

    expect(actionsStart).toBeGreaterThan(-1);
    expect(statusStart).toBeGreaterThan(actionsStart);
    expect(statusStart).toBeLessThan(cancelStart);
    expect(dialogSource).not.toContain(
      '<p v-if="loading" class="create-short-stable-hint"'
    );
  });

  it("projects one foreshadowing data source into overview, volume, and plot-point views", () => {
    expect(longWorkspaceResourceTreeSource).toContain(
      'key: "plot-design:foreshadowing"'
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      "book.navigation.counts.foreshadowingThreads"
    );
    expect(longWorkspaceTypeSource).toContain(
      'selection.key === "plot-design:foreshadowing"'
    );
    expect(editorSource).toContain("<LongForeshadowingWorkspace");
    expect(editorSource).toContain("currentIsForeshadowingWorkspace");
    expect(editorSource).toContain("currentIsVolumeForeshadowing");
    expect(editorSource).toContain("currentIsPlotPointForeshadowing");
    expect(editorSource).toContain("本卷伏笔");
    expect(editorSource).toContain("伏笔触点");
    expect(editorSource).toContain(
      '@mutation="forwardForeshadowingMutation"'
    );
    expect(editorSource).toContain('if (tab === "foreshadowing")');
    expect(editorSource).toContain(
      "if (!props.locked && !(await saveAllChanges())) return;"
    );
    expect(editorSource).toContain(
      "if (currentIsPlotPointForeshadowing.value)"
    );
    expect(appSource).toContain(
      '@mutation="handleActiveLongStructureMutation"'
    );
    expect(foreshadowingSource).toContain(
      "createLongStructureMutationBuilder"
    );
    expect(foreshadowingSource).toContain('"overview" | "volume" | "plotPoint"');
  });

  it("offers long-book creation in the unified themed creation dialog", () => {
    expect(leftSidebarSource).toContain('label: "新建书籍"');
    expect(leftSidebarSource).toContain('emit("createBook")');
    expect(appSource).toContain('@create-book="openCreateBookDialog"');
    expect(appSource).toContain("function openCreateBookDialog(): void {");
    expect(appSource).toContain("createBookDialogOpen.value = true");
    expect(sectionSource).toContain('"新建作品"');
    expect(sectionSource).not.toContain('id: "create-long-book"');
    expect(dialogSource).toContain('role="tablist"');
    expect(dialogSource).toContain('label: "长篇"');
    expect(dialogSource).toContain("<PopupSelect");
    expect(dialogSource).not.toContain("<select");
    expect(dialogSource).toContain("uiMessage.warning");
    expect(dialogSource).toContain("<Teleport to=\"body\">");
    expect(dialogSource).toContain("linkedMaterialIdsByKind");
    expect(dialogSource).toContain("linkedSkillIdsByKind");
    expect(dialogSource).toContain('workspaceType.value === "long"');
  });

  it("renders all five long-workspace roots from the navigation summary", () => {
    for (const root of [
      "worldbuilding",
      "character_design",
      "plot_design",
      "draft",
      "continuity_ledger"
    ]) {
      expect(longWorkspaceResourceTreeSource).toContain(`${root}:`);
    }
    expect(longWorkspaceResourceTreeSource).toContain("book.navigation.counts");
    expect(longWorkspaceResourceTreeSource).toContain("index.ledger.commits");
    expect(longWorkspaceTypeSource).toContain(
      "isLongMigrationEvidenceCategoryId"
    );
    expect(longWorkspaceTypeSource).toContain("{ readOnly: true }");
    expect(longWorkspaceTypeSource).toContain('role: "body"');
    expect(longWorkspaceTypeSource).toContain('role: "character-state"');
    expect(longWorkspaceTypeSource).toContain('role: "handoff"');
  });

  it("groups characters by each book's dynamic type directory with tab-bar creation", () => {
    expect(longWorkspaceTypeSource).toContain("DEFAULT_LONG_CHARACTER_TYPES");
    expect(longWorkspaceResourceTreeSource).toContain(
      "const characterGroupChildren = [...book.navigation.characterTypes]"
    );
    expect(longWorkspaceResourceTreeSource).toContain('key: "character-overview"');
    expect(longWorkspaceResourceTreeSource).toContain(
      "characterCountByGroup.get(character.group)"
    );
    expect(longWorkspaceResourceTreeSource).toContain("longCharacterGroup: group.id");
    expect(longWorkspaceResourceTreeSource).toContain("label: options.label ?? selection.title");
    expect(longWorkspaceResourceTreeSource).toContain("label: group.title");
    const characterProjection = longWorkspaceResourceTreeSource.slice(
      longWorkspaceResourceTreeSource.indexOf(
        "const characterGroupChildren = [...book.navigation.characterTypes]"
      ),
      longWorkspaceResourceTreeSource.indexOf("const bookLineSelection")
    );
    expect(characterProjection).not.toContain(
      "key: `character:${character.id}`"
    );
    expect(characterProjection).not.toContain("children: characters");
    expect(treeNodeSource).not.toContain("createLongCharacter");
    expect(editorSource).toContain("currentIsCharacterGroup");
    expect(characterNavigationSource).toContain('aria-label="新增人物"');
    expect(characterNavigationSource).toContain('aria-label="删除当前人物"');
    expect(editorSource).toContain('aria-label="删除当前分卷"');
    expect(editorSource).toContain('aria-label="删除当前剧情点"');
    expect(manuscriptNavigationSource).toContain(
      'aria-label="删除当前章卡"'
    );
    expect(worldbuildingNavigationSource).toContain(
      'aria-label="删除当前世界观条目"'
    );
    expect(editorSource).toContain('<AppIcon name="minus" :size="15" />');
    expect(editorSource).toContain('role="alertdialog"');
    expect(editorSource).toContain('emit(\n    "deleteStructure"');
    expect(appSource).toContain(
      '@delete-structure="deleteActiveLongNavigationStructure"'
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.deleteCharacter(target.id, true)"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.deleteVolume(target.id, true)"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.deleteArc(target.id, true)"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.deleteChapter(target.id, true)"
    );
    expect(editorSource).toContain("emit('createCharacter')");
    expect(editorSource).toContain('emit("createWorldbuildingItem")');
    expect(editorSource).toContain("currentEmptyCollection");
    expect(editorSource).toContain("还没有${selection.title}");
    expect(editorSource).toContain("新建第一个人物");
    expect(editorSource).toContain("新建第一个剧情点");
    expect(editorSource).toContain("新建第一张章卡");
    expect(editorSource).toContain("@click=\"createFirstCollectionItem\"");
    expect(appSource).toContain(
      '@create-character="openLongCharacterCreate"'
    );
    expect(appSource).toContain(
      '@create-worldbuilding-item="openLongWorldbuildingItemCreate"'
    );
    expect(longWorkspaceResourceTreeSource).toContain('plot_design: "剧情设计"');
    expect(longWorkspaceResourceTreeSource).toContain('key: "root:plot-points"');
    expect(longWorkspaceResourceTreeSource).toContain(
      "const plotPointVolumeChildren: ResourceTreeNode[]"
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      "key: `plot-design:plot-points:${volume.id}`"
    );
    expect(longWorkspaceResourceTreeSource).toContain("label: volume.title");
    expect(longWorkspaceResourceTreeSource).toContain('title: "剧情点"');
    expect(longWorkspaceResourceTreeSource).toContain('title: "章卡"');
    expect(longWorkspaceResourceTreeSource).toContain('label: "正文"');
    const chapterCardProjection = longWorkspaceResourceTreeSource.slice(
      longWorkspaceResourceTreeSource.indexOf(
        "const chapterCardManagementChildren: ResourceTreeNode[]"
      ),
      longWorkspaceResourceTreeSource.indexOf("const plotChildren: ResourceTreeNode[]")
    );
    expect(chapterCardProjection).toContain(
      "key: `plot-design:chapter-cards:${volume.id}`"
    );
    expect(chapterCardProjection).toContain("chapterCardTabs:");
    expect(chapterCardProjection).not.toContain(
      "root:chapter-card-management:"
    );
    expect(chapterCardProjection).not.toContain("children: chapters");
    const plotChildrenProjection = longWorkspaceResourceTreeSource.slice(
      longWorkspaceResourceTreeSource.indexOf("const plotChildren: ResourceTreeNode[]"),
      longWorkspaceResourceTreeSource.indexOf("const draftChildren")
    );
    const plotPointsPosition = plotChildrenProjection.indexOf(
      'key: "root:plot-points"'
    );
    const foreshadowingPosition = plotChildrenProjection.indexOf(
      "node(foreshadowingSelection"
    );
    expect(plotPointsPosition).toBeGreaterThan(-1);
    expect(foreshadowingPosition).toBeGreaterThan(-1);
    expect(plotPointsPosition).toBeLessThan(foreshadowingPosition);
    expect(plotChildrenProjection).not.toContain('key: "root:plot-volumes"');
    expect(plotChildrenProjection).not.toContain(
      'key: `root:plot-arc:${arc.id}`'
    );
    expect(
      plotChildrenProjection.indexOf('key: "root:plot-points"')
    ).toBeLessThan(
      plotChildrenProjection.indexOf('key: "root:plot-chapter-cards"')
    );
    const longRootProjection = longWorkspaceResourceTreeSource.slice(
      longWorkspaceResourceTreeSource.indexOf("const counts = book.navigation.counts;")
    );
    expect(
      longRootProjection.match(/node\(createLongRootSelection/gu)
    ).toHaveLength(5);
    expect(longRootProjection).not.toContain('title: "章卡"');
    expect(editorSource).toContain("全书总纲");
    expect(editorSource).toContain("orderedBookLineVolumes");
    expect(editorSource).toContain("currentIsPlotPointWorkspace");
    expect(editorSource).toContain("selection.plotPointTabs");
    expect(editorSource).toContain("emit('selectPlotPoint', plotPoint.id)");
    expect(editorSource).toContain("currentIsChapterCardWorkspace");
    expect(editorSource).toContain("selection.chapterCardTabs");
    expect(manuscriptNavigationSource).toContain(
      "emit('selectChapter', chapter.id)"
    );
    expect(appSource).toContain(
      '@select-chapter-card="selectLongChapterCardTab"'
    );
    expect(editorSource).toContain("概要");
    expect(editorSource).toContain("故事情节");
    expect(editorSource).toContain("selection.plotPointId === plotPoint.id");
    expect(editorSource).toContain('aria-label="新建分卷"');
    expect(editorSource).toContain('emit("createVolume")');
    expect(editorSource).toContain('"saveVolumeOutline"');
    expect(appSource).toContain('@create-volume="openLongVolumeCreate"');
    expect(appSource).toContain(
      '@save-volume-outline="saveLongVolumeOutline"'
    );
    expect(editorSource).toContain('"savePlotPointContent"');
    expect(appSource).toContain(
      '@save-plot-point-content="saveLongPlotPointContent"'
    );
    expect(editorSource).toContain("章卡内容");
    expect(editorSource).not.toContain("activeChapterCardTab");
    expect(editorSource).not.toContain(">\n            章节大纲\n");
    expect(editorSource).not.toContain(">\n            世界约束\n");
    expect(editorSource).toContain("currentIsChapterCardContent");
    expect(editorSource).toContain("saveDocumentState(stateKey(selectedFile.file.id)");
    expect(longStructureTransactionsSource).toContain(
      "createLongStructureMutationBuilder(index).createChapter"
    );
    expect(longStructureTransactionsSource).toContain(
      "已新建小节“${input.title}”，并同步创建章卡"
    );
    expect(longStructureTransactionsSource).toContain(
      "createLongChapterSelection(\n                  summary,\n                  nextIndex,\n                  created.chapterCard.id"
    );
    expect(appSource).not.toContain('worldConstraints: ""');
    expect(workspaceDialogLayerSource).toContain("<CreateLongVolumeDialog");
    expect(workspaceDialogLayerSource).toContain(
      "@submit=\"emit('submitCreateLongVolume', $event)\""
    );
    expect(appSource).toContain(
      '@submit-create-long-volume="createLongVolume"'
    );
    expect(workspaceDialogLayerSource).toContain("<CreateLongPlotPointDialog");
    expect(workspaceDialogLayerSource).toContain(
      "@submit=\"emit('submitCreateLongPlotPoint', $event)\""
    );
    expect(appSource).toContain(
      '@submit-create-long-plot-point="createLongPlotPoint"'
    );
    expect(workspaceDialogLayerSource).toContain(
      "<CreateLongWorldbuildingItemDialog"
    );
    expect(workspaceDialogLayerSource).toContain(
      "@submit=\"emit('submitCreateLongWorldbuildingItem', $event)\""
    );
    expect(appSource).toContain(
      '@submit-create-long-worldbuilding-item="createLongWorldbuildingItem"'
    );
    expect(workspaceDialogLayerSource).toContain("<CreateLongChapterCardDialog");
    expect(dialogCoordinatorSource).toContain(
      "source: chapterCardCreation.source"
    );
    expect(workspaceDialogLayerSource).toContain(':source="module.source"');
    expect(appSource).toContain(
      '@submit-create-long-chapter-card="createLongChapterCard"'
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      "longDraftVolumeId: volume.id"
    );
    expect(longStructureTransactionsSource).toContain(
      "function requestCreateLongDraftSection"
    );
    expect(longStructureTransactionsSource).toContain(
      "function handleLongDraftSectionAction"
    );
    expect(longStructureTransactionsSource).toContain(
      "async function confirmDeleteLongDraftSection"
    );
    expect(longStructureTransactionsSource).toContain('source: "draft"');
    expect(appSource).toContain(
      '@create-long-draft-section="requestCreateLongDraftSection"'
    );
    expect(appSource).toContain(
      '@long-draft-section-action="handleLongDraftSectionAction"'
    );
    expect(workspaceDialogLayerSource).toContain(
      "<DeleteLongDraftSectionDialog"
    );
    expect(appSource).toContain(
      '@confirm-delete-long-draft="confirmDeleteLongDraftSection"'
    );
    expect(longStructureTransactionsSource).toContain(
      "createLongStructureMutationBuilder(index).reorderChapter"
    );
    const draftChildrenProjection = longWorkspaceResourceTreeSource.slice(
      longWorkspaceResourceTreeSource.indexOf("const draftChildren"),
      longWorkspaceResourceTreeSource.indexOf("const continuityPendingChildren")
    );
    expect(draftChildrenProjection).toContain("longDraftVolumeId: volume.id");
    expect(draftChildrenProjection).not.toContain("return chapters.length");
    expect(chapterCardDialogSource).toContain("新建{{ unitLabel }}");
    expect(chapterCardDialogSource).toContain("补充完整内容");
    expect(chapterCardDialogSource).toContain(
      "确认后会同步创建对应章卡。建议先在「剧情设计 → 章卡」中维护好章卡，再开始编写正文。"
    );
    expect(chapterCardDialogSource).not.toContain("章节大纲和世界约束");
    expect(chapterCardDialogSource).not.toContain("LongStructureManager");
    expect(plotPointDialogSource).toContain("新建剧情点");
    expect(plotPointDialogSource).not.toContain("LongStructureManager");
    const createVolumeEntry = longStructureTransactionsSource.slice(
      longStructureTransactionsSource.indexOf(
        "async function openLongVolumeCreate"
      ),
      longStructureTransactionsSource.indexOf(
        "async function openLongPlotPointCreateForVolumeInternal"
      )
    );
    expect(createVolumeEntry).toContain("longVolumeCreate.value = { bookId }");
    expect(createVolumeEntry).not.toContain(
      "longStructureDialogOpen.value = true"
    );
    const createPlotPointEntry = longStructureTransactionsSource.slice(
      longStructureTransactionsSource.indexOf(
        "async function openLongPlotPointCreateForVolumeInternal"
      ),
      longStructureTransactionsSource.indexOf(
        "async function saveLongVolumeOutline"
      )
    );
    expect(createPlotPointEntry).toContain(
      "longPlotPointCreate.value = {"
    );
    expect(createPlotPointEntry).not.toContain(
      "longStructureDialogOpen.value = true"
    );
    const createChapterCardEntry = longStructureTransactionsSource.slice(
      longStructureTransactionsSource.indexOf(
        "async function openLongChapterCardCreateInternal"
      ),
      longStructureTransactionsSource.indexOf(
        "async function handleLongDraftSectionAction"
      )
    );
    expect(createChapterCardEntry).toContain(
      "longChapterCardCreate.value = {"
    );
    expect(createChapterCardEntry).not.toContain(
      "请先在当前分卷中新建剧情点"
    );
    expect(createChapterCardEntry).not.toContain(
      "longStructureDialogOpen.value = true"
    );
    expect(appSource).not.toContain("openLongStructureTreeAction");
    expect(appSource).not.toContain("longStructureSection");
    expect(appSource).not.toContain(":initial-section=");
    expect(appSource).not.toContain(":initial-action=");
    expect(appSource).not.toContain(":initial-item-id=");
    expect(longStructureTransactionsSource).toContain(
      "createLongStructureMutationBuilder(index).createCharacter"
    );
    expect(appSource).toContain(
      '@select-character="selectLongCharacterTab"'
    );
    expect(editorSource).toContain(
      '<LongCharacterNavigation\n        v-if="currentUsesTopCharacterTabs"'
    );
    expect(editorSource).toContain(
      '@select-character="requestSelectCharacter"'
    );
    expect(characterNavigationSource).toContain(
      "activeCharacterId === character.id"
    );
    expect(characterNavigationSource).toContain(
      "'is-loading': pendingCharacterId === character.id"
    );
    expect(editorSource).toContain(
      "selection.key.startsWith('character-group:')"
    );
    expect(editorSource).toContain("selection.description ??");
    expect(editorSource).toContain(
      "'has-navigation-tabs':\n        currentUsesTopCharacterTabs ||"
    );
    expect(editorSource).not.toContain(
      "Boolean(selection?.characterTabs?.length) ||"
    );
    expect(characterDialogSource).toContain("新增人物");
    expect(characterDialogSource).toContain(
      "核心档案、人物关系、当前状态和历史轨迹"
    );
    expect(characterDialogSource).toContain("<Teleport to=\"body\">");
    expect(characterDialogSource).toContain("uiMessage.warning");
  });

  it("edits and persists a character name directly from the document title", () => {
    expect(editorSource).toContain('v-else-if="currentIsCharacterDocument"');
    expect(editorSource).toContain('v-model="characterNameDraft"');
    expect(editorSource).toContain('aria-label="人物姓名"');
    expect(editorSource).toContain('@change="saveCharacterName"');
    expect(editorSource).toContain(
      '@keydown="handleCharacterNameKeydown"'
    );
    expect(editorSource).toContain(
      'emit("renameCharacter", { characterId, name }'
    );
    expect(appSource).toContain(
      '@rename-character="renameLongCharacter"'
    );
    expect(longStructureTransactionsSource).toContain(
      "createLongStructureMutationBuilder(index).updateCharacter"
    );
  });

  it("edits and persists long-form structure titles from the document title", () => {
    expect(editorSource).toContain("currentStructureTitleTarget");
    expect(editorSource).toContain('inputLabel: "剧情点标题"');
    expect(editorSource).toContain('inputLabel: "分卷名称"');
    expect(editorSource).toContain('inputLabel: "章卡标题"');
    expect(editorSource).toContain('inputLabel: "世界观分类名称"');
    expect(editorSource).toContain('v-model="structureTitleDraft"');
    expect(editorSource).toContain('@change="saveStructureTitle"');
    expect(editorSource).toContain(
      '@keydown="handleStructureTitleKeydown"'
    );
    expect(editorSource).toContain(
      'emit(\n    "renameStructureTitle"'
    );
    expect(appSource).toContain(
      '@rename-structure-title="renameLongStructureTitle"'
    );
    expect(longStructureTransactionsSource).toContain(
      "createLongStructureMutationBuilder(index)"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.updateWorldbuilding(category.id, { title })"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.updateVolume(volume.id, { title })"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.updateArc(plotPoint.id, { title })"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.updateChapter(chapter.id, { title })"
    );
    expect(editorSource).not.toContain(
      'chapterCardId === target.id && commitId !== null'
    );
  });

  it("lazy-loads selected files and saves Markdown with all CAS revisions", () => {
    expect(editorSource).toContain("api.readDocument({");
    expect(editorSource).toContain("api.writeDocument({");
    expect(editorSource).toContain("baseRevision: state.file.revision");
    expect(editorSource).toContain(
      "baseWorkspaceRevision: state.workspaceRevision"
    );
    expect(editorSource).toContain(
      "baseProjectRevision: state.projectRevision"
    );
    expect(editorSource).toContain("currentReadOnly");
    expect(longWorkspaceTypeSource).toContain('label: "正文"');
    expect(longWorkspaceTypeSource).toContain('label: "章末状态"');
    expect(longWorkspaceTypeSource).toContain('label: "下一章接续包"');
    expect(editorSource).toContain("async function saveAllChanges()");
    expect(editorSource).toContain("离开前已自动保存");
    expect(appSource).toContain("saveActiveLongEditorBeforeLeaving");
    expect(appSource).toContain(
      '@editor-port-change="updateLongWorkspaceEditorPort"'
    );
    expect(longWorkspaceModuleSource).toContain(':ref="captureEditorPort"');
  });

  it("loads only the selected character document and avoids unbounded sibling prefetches", () => {
    expect(editorSource).not.toContain("prefetchCharacterDocuments");
    expect(editorSource).not.toContain(
      "void loadWorkspaceDocument(file, false, true)"
    );
    expect(editorSource).toContain("async function loadSelectedDocument");
    expect(editorSource).toContain("await loadWorkspaceDocument(selectedFile, force)");
    expect(editorSource).toContain(
      "async function prefetchActiveSelectionFiles"
    );
    expect(editorSource).toContain(
      "Avoid unbounded sibling character"
    );
    expect(editorSource).toContain(
      "async function ensureDocumentsLoaded"
    );
    expect(editorSource).toContain(
      "async function selectRole(role: LongWorkspaceFileRole)"
    );
    expect(longWorkspaceSessionSource).toContain(
      "await editor.value?.ensureDocumentsLoaded([preferredFile])"
    );
    expect(longWorkspaceSessionSource).toContain(
      "state.selection.value?.chapterCardId !== nextSelection.chapterCardId"
    );
  });

  it("reconciles structural drafts from the workspace revision without a deep synchronous watcher", () => {
    expect(editorSource).toContain("props.workspaceIndex?.revision");
    expect(editorSource).toContain('flush: "post"');
    expect(editorSource).not.toContain(
      'props.workspaceIndex?.plot.volumes,\n      props.workspaceIndex?.plot.arcs'
    );
    expect(editorSource).not.toContain('{ immediate: true, deep: true, flush: "sync" }');
  });

  it("renders list worldbuilding with top, right-list or left-tree navigation", () => {
    expect(editorSource).toContain(
      'selection.files.find(({ role }) => role === "overview")'
    );
    expect(editorSource).toContain(
      '@select-overview="selectWorldbuildingOverview"'
    );
    expect(worldbuildingNavigationSource).toContain(
      `@click="emit('selectOverview')"`
    );
    expect(longStructureTransactionsSource).toContain(
      'type === "worldbuildingItem.create"'
    );
    expect(editorSource).toContain('emit("createWorldbuildingItem")');
    expect(worldbuildingNavigationSource).toContain(
      'class="section-tabs-bar long-worldbuilding-tabs"'
    );
    expect(worldbuildingNavigationSource).toContain(
      'aria-label="世界观条目"'
    );
    expect(editorSource).toContain("currentUsesTopWorldbuildingTabs");
    expect(editorSource).toContain("currentUsesRightWorldbuildingList");
    expect(editorSource).toContain("currentUsesLeftTreeWorldbuilding");
    expect(editorSource).toContain('=== "left-tree"');
    expect(editorSource).toContain('"right-list"');
    expect(worldbuildingNavigationSource).toContain(
      'aria-label="世界观条目列表"'
    );
    expect(worldbuildingNavigationSource).toContain("long-entry-list-pane");
    expect(worldbuildingNavigationSource).toContain("items.length");
    expect(editorSource).toContain(
      '<style scoped src="./LongWorkspaceEditor.css"></style>'
    );
    expect(editorSource).toContain(
      "!currentIsWorldbuildingList.value"
    );
    expect(editorSource).toContain(
      'v-if="showGenericFileTabs"'
    );
    expect(editorSource).toContain(
      "currentState.value?.content"
    );
    expect(editorSource).toContain('class="long-document-editor"');
    expect(editorSource).not.toContain('"文本 · CAS 保存"');
    expect(longWorkspaceTypeSource).toContain(
      "worldbuildingFormat?: LongWorldbuildingFormat"
    );
  });

  it("uses independent right-side entry layouts for shared and plot workspaces", () => {
    expect(editorSource).toContain("characterAndContinuityItemLayout");
    expect(editorSource).toContain("plotItemLayout");
    expect(editorSource).toContain("currentUsesRightCharacterList");
    expect(editorSource).toContain("currentUsesRightContinuityList");
    expect(editorSource).toContain("currentUsesRightBookLineList");
    expect(editorSource).toContain("currentUsesRightPlotPointList");
    expect(editorSource).toContain("currentUsesRightChapterCardList");
    expect(editorSource).toContain("currentUsesLeftTreeCharacter");
    expect(editorSource).toContain("currentUsesLeftTreePlot");
    expect(editorSource).toContain("currentUsesLeftTreeContinuity");
    expect(continuityNavigationSource).toContain(
      'aria-label="连续性账本文件列表"'
    );
    expect(editorSource).toContain('aria-label="全书故事线列表"');
    expect(editorSource).toContain('aria-label="剧情点列表"');
    expect(manuscriptNavigationSource).toContain('aria-label="章卡列表"');
    expect(manuscriptNavigationSource).toContain("toggleActionMenu");
    expect(manuscriptNavigationSource).toContain("runMenuAction");
    expect(editorSource).toContain('type: "chapter.reorder"');
    expect(editorSource).not.toContain("isChapterCardCommitted");
    expect(editorSource).toContain("!currentUsesRightContinuityList.value");
    expect(editorSource).toContain("long-entry-list-pane");
    expect(editorSource).toContain("captureNavigationSelection");
  });

  it("loads a list worldbuilding item before activating its tab", () => {
    expect(editorSource).toContain(
      "async function selectWorldbuildingItem(itemId: string)"
    );
    expect(editorSource).toContain(
      "await loadWorkspaceDocument(selectedFile)"
    );
    expect(editorSource).toContain(
      "activeWorldbuildingItemId.value = itemId"
    );
    expect(worldbuildingNavigationSource).toContain(
      "'is-loading': pendingItemId === item.id"
    );
    expect(worldbuildingNavigationSource).toContain(
      "'is-loading': pendingOverview"
    );
    expect(editorSource).toContain("await selectWorldbuildingItem(item.id)");
    expect(editorSource).toContain("void selectWorldbuildingItem(nextId)");
  });

  it("keeps the long editor surface stable while documents refresh or switch", () => {
    expect(editorSource).toContain("const showEditorLoading = computed");
    expect(editorSource).toContain(
      "state?.loading && !state.loaded && !state.content"
    );
    expect(editorSource).toContain("const isDocumentSwitchPending = computed");
    expect(editorSource).toContain("heldSelectionFile");
    expect(editorSource).toContain(
      "async function prefetchWorldbuildingSelectionFiles"
    );
    expect(editorSource).toContain("inflightDocumentLoads");
    expect(editorSource).toContain("v-else-if=\"showEditorLoading\"");
    expect(editorSource).toContain(
      "currentReadOnly || isDocumentContentBusy"
    );
  });

  it("uses the shared writing-editor layout without exposing internal revisions", () => {
    expect(editorSource).toContain('class="long-editor-breadcrumbs"');
    expect(editorSource).toContain('class="long-editor-file-tabs"');
    expect(editorSource).toContain('class="long-editor-view-tabs"');
    expect(editorSource).toContain('class="long-document-title"');
    expect(editorSource).toContain('class="long-editor-footer"');
    expect(editorSource).toContain("已保存到本机");
    expect(editorSource).toContain("立即保存");
    expect(editorSource).not.toContain("currentState.file.revision");
  });

  it("refreshes clean long-editor CAS baselines on window focus without touching dirty drafts", () => {
    expect(editorSource).toContain(
      "function synchronizeProjectRevisionsIfClean("
    );
    expect(editorSource).toContain("if (bookId !== props.bookId) return true");
    expect(editorSource).toContain("key.startsWith(prefix)");
    expect(editorSource).toContain(
      "state.loaded && state.content !== state.savedContent"
    );
    expect(editorSource).toContain(
      "synchronizeProjectRevisionsIfClean"
    );
    expect(longWorkspaceSessionSource).toContain(
      "async function refreshOnWindowFocus("
    );
    expect(longWorkspaceSessionSource).toContain(
      "editor.value?.synchronizeProjectRevisionsIfClean("
    );
    expect(longWorkspaceSessionSource).toContain("当前有未保存内容");
  });

  it("mounts the long workspace without routing it through short/script state", () => {
    expect(resourceTreeCoordinatorSource).toContain(
      'catalogNodeType: "long-book"'
    );
    expect(appSource).not.toContain("<LongWorkspaceTree");
    expect(appSource).toContain("<LongWorkspaceModule");
    expect(longWorkspaceModuleSource).toContain("<LongWorkspaceEditor");
    expect(appSource).toContain("isLongWorkspaceActive");
    expect(appSource).toContain("activeFeature === 'long-workspace'");
    const shortWorkspaceMountSource =
      appSource.split("<WritingWorkspaceModule")[1]?.split("/>")[0] ?? "";
    expect(shortWorkspaceMountSource).toContain("activeFeature === 'conversation'");
    expect(writingWorkspaceSource).toContain("<RightEditorPane");
    expect(workspaceDialogLayerSource).toContain("<CreateBookDialog");
    expect(appSource).toContain('@submit-create-book="createCreativeBook"');
    expect(appSource).toContain("async function createCreativeBook(");
    expect(appSource).toContain(
      "await shortBookLifecycle.createBook(input)"
    );
    expect(workspaceTypeSource).toContain(
      'workspaceType?: "short" | "script" | "long";'
    );
    const workspaceDocumentSource =
      workspaceTypeSource.split("export interface WorkspaceDocument")[1] ??
      "";
    expect(workspaceDocumentSource).toContain(
      'workspaceType?: "short" | "script";'
    );
    expect(workspaceDocumentSource).not.toContain(
      'workspaceType?: "short" | "script" | "long";'
    );
  });

  it("keeps the first long-form entry on a stable two-column shell", () => {
    const openSource =
      longWorkspaceSessionSource
        .split("async function openBook(")[1]
        ?.split("async function refreshActiveWorkspace")[0] ?? "";
    expect(openSource).toContain(
      "requestedSelection: LongWorkspaceSelection | null = null"
    );
    expect(openSource).toContain(
      "store.activateBook(bookId, requestedSelection, true)"
    );
    expect(longWorkspaceStoreSource).toContain(
      "selection.value = requestedSelection"
    );
    expect(longStructureTransactionsSource).toContain(
      "node.longWorkspaceSelection ?? null"
    );
    expect(longWorkspaceModuleSource).toContain('<template v-if="book">');
    expect(longWorkspaceModuleSource).toContain(
      'class="long-workspace-editor-loading-state"'
    );
    expect(longWorkspaceModuleSource).toContain(
      '<template v-if="workspaceIndex">'
    );
  });

  it("projects long-form navigation into the same recursive tree used by short books", () => {
    expect(longWorkspaceResourceTreeSource).toContain(
      "function projectLongWorkspaceNavigation("
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      "longWorkspaceSelection: selection"
    );
    expect(resourceTreeCoordinatorSource).toContain(
      "children: projectLongWorkspaceNavigation(book, workspaceIndex)"
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      "index\n      ? reconcileLongWorkspaceSelection(book, index, selection)\n      : selection"
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      "[...book.navigation.worldbuilding]"
    );
    expect(
      longWorkspaceResourceTreeSource.indexOf("[...book.navigation.worldbuilding]")
    ).toBeLessThan(
      longWorkspaceResourceTreeSource.indexOf("...(worldRevealSelection")
    );
    expect(resourceTreeCoordinatorSource).toContain("selectableBranch: true");
    expect(resourceTreeCoordinatorSource).toContain('badge: "长篇"');
    expect(resourceTreeCoordinatorSource).not.toContain(
      "badge: `长篇 · ${book.genre}`"
    );
    expect(longStructureTransactionsSource).toContain(
      "node.longWorkspaceSelection"
    );
    expect(leftSidebarSource).toContain("<TreeSection");
    expect(leftSidebarSource).not.toContain('<slot name="long-workspace" />');
    expect(treeNodeSource).toContain("<TreeNodeItem");
    expect(treeNodeSource).toContain(":depth=\"depth + 1\"");
    for (const label of [
      "世界观",
      "人物设计",
      "剧情设计",
      "正文",
      "连续性账本"
    ]) {
      expect(longWorkspaceResourceTreeSource).toContain(label);
    }
    expect(longWorkspaceModuleSource).toContain(
      "class=\"long-agent-column\""
    );
    expect(longWorkspaceModuleSource).toContain(
      'class="pane-resizer pane-resizer-right"'
    );
    expect(appSource).toContain(':left-collapsed="leftCollapsed"');
    expect(appSource).toContain(':right-pane="writingRightPaneViewModel"');
    expect(appSource).toContain('@toggle-left="leftCollapsed = !leftCollapsed"');
    expect(appSource).toContain('@toggle-right="rightCollapsed = !rightCollapsed"');
    expect(appSource).toContain(
      '@resize-start="startPaneResize(\'right\', $event)"'
    );
    expect(longWorkspaceModuleSource).toContain('v-show="!rightPane.collapsed"');
  });

  it("wires left-tree collection actions through the existing structure pipeline", () => {
    expect(workspaceTypeSource).toContain("longTreeCollection?:");
    expect(workspaceTypeSource).toContain("longTreeItem?:");
    for (const kind of [
      "worldbuilding-item",
      "character",
      "volume",
      "plot-point",
      "chapter-card"
    ]) {
      expect(workspaceTypeSource).toContain(`| "${kind}"`);
    }
    expect(leftSidebarSource).toContain("createLongTreeItem");
    expect(leftSidebarSource).toContain("longTreeItemAction");
    expect(sectionSource).toContain("createLongTreeItem");
    expect(sectionSource).toContain("longTreeItemAction");
    expect(appSource).toContain(
      '@create-long-tree-item="handleCreateLongTreeItem"'
    );
    expect(appSource).toContain(
      '@long-tree-item-action="handleLongTreeItemAction"'
    );
    expect(longStructureTransactionsSource).toContain(
      "openLongWorldbuildingItemCreateForCategoryInternal"
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.reorderWorldbuildingItem("
    );
    expect(longStructureTransactionsSource).toContain(
      "builder.deleteWorldbuildingItem("
    );
    expect(longStructureTransactionsSource).toContain(
      "details.orderedIds[currentIndex + 1] ??\n          details.orderedIds[currentIndex - 1]"
    );
    expect(longStructureTransactionsSource).toContain(
      "details.parentResourceId"
    );
    expect(longStructureTransactionsSource).toContain(
      "selectCreatedLongTreeResource("
    );
    expect(longStructureTransactionsSource).toContain(
      "captureNavigationSelection()"
    );
    expect(resourceTreeCoordinatorSource).toContain(
      "synchronizeSelectedLongResourceForLayout("
    );
    expect(appSource).toContain(
      ':long-tree-actions-disabled="longBookActionPending"'
    );
    expect(dialogCoordinatorSource).toContain(
      "itemLabel: treeDeletion.label"
    );
    expect(workspaceDialogLayerSource).toContain(
      ':item-label="module.itemLabel"'
    );
  });

  it("uses dedicated long agent context and approval surfaces", () => {
    expect(presentationCoordinatorSource).toContain(
      "const activeLongRuntimeContext"
    );
    expect(appSource).toContain(
      "activeRuntimeContext: activeLongRuntimeContext"
    );
    expect(appSource).not.toContain(
      "const activeLongRuntimeContext = computed"
    );
    expect(longConversationSource).toContain(
      "target.conversation.sendLongMessage("
    );
    expect(longConversationSource).toContain(
      "options.catalog.buildAttachments("
    );
    expect(longConversationSource).toContain(
      "options.catalog.filterReadableAttachments("
    );
    expect(longConversationSource).toContain("profile.readAccess.skillKinds");
    expect(longConversationSource).toContain(
      "profile.readAccess.materialKinds"
    );
    expect(appSource).not.toContain("<LongProposalReview");
    expect(agentConversationSource).toContain("<LongProposalReview");
    expect(agentConversationSource).toContain("embedded");
    expect(longWorkspaceModuleSource).toContain(
      ':long-proposal-items="proposalItems"'
    );
    expect(appSource).toContain('@review-edit="reviewLongAgentEdit"');
    expect(proposalSource).toContain("long.mutation_proposal");
    expect(proposalSource).toContain("long.chapter_dispatch_proposal");
    expect(proposalSource).not.toContain("long.chapter_write_proposal");
    expect(appSource).toContain("stageLongDraftEditProposal,");
    expect(workspaceSystemEventRoutesSource).toContain(
      "dependencies.stageLongDraftEditProposal(event);"
    );
    expect(proposalSource).not.toContain("long.ledger_commit_proposal");
    expect(writingWorkflowSource).toContain(
      "canFinalizeContinuity: canApproveProposal"
    );
    expect(proposalSource).toContain("查看具体影响");
    expect(proposalSource).toContain("删除实体");
    expect(proposalSource).toContain("实体完整前后快照");
    expect(proposalSource).toContain("entitySnapshotText(change.before)");
    expect(proposalSource).toContain("entitySnapshotText(change.after)");
    expect(proposalSource).not.toContain(".slice(0, 80)");
    expect(proposalSource).toContain("long.continuity_file_proposal");
    expect(proposalSource).not.toContain("查看提交内容");
    expect(proposalSource).not.toContain("本章六类连续性摘要");
    expect(proposalSource).toContain("item.approvalMode === \"auto-approve\"");
    expect(proposalSource).toContain("自动保存中");
    expect(writingWorkflowSource).toContain(
      "approvalModeForEvent: proposalApprovalMode"
    );
    expect(writingWorkflowSource).toContain(
      "prepareAutoApprove: prepareAutomaticProposal"
    );
    const approvalModeResolver =
      writingWorkflowSource
        .split("function proposalApprovalMode(")[1]
        ?.split("function observeAgentEvent")[0] ?? "";
    expect(approvalModeResolver).toContain(
      "conversationForProposalEvent(event)?.approvalModeForRun("
    );
    expect(approvalModeResolver).not.toContain("continuity_ledger");
    expect(appSource).not.toContain("function longAgentRunApprovalMode(");
    expect(writingWorkflowSource).toContain(
      "conversation.selectApprovalMode(context.approvalMode());"
    );
    expect(longConversationSource).toContain(
      "target.conversation.selectApprovalMode(target.approvalMode);"
    );
    expect(appSource).toContain(
      "permissionMode: () => generalSettings.value.permissionMode"
    );
    expect(writingWorkflowSource).toContain(
      "writingOrchestrator.handleRejected(event)"
    );
    expect(writingWorkflowSource).toContain(
      "workspaceProposals.quarantineSession("
    );
    expect(editorSource).not.toContain("LongLedgerCommitRecordSchema");
    expect(editorSource).not.toContain("本章连续性摘要");
    expect(editorSource).not.toContain("伏笔线状态推导");
    expect(editorSource).not.toContain("查看原始审计记录");
    expect(proposalSource).not.toContain("workspace.editor_mutation");
  });

  it("runs approved chapter, arc, and volume plans through the shared writer conversation", () => {
    expect(writingWorkflowSource).toContain(
      "writingOrchestrator.startDispatch(event)"
    );
    expect(writingWorkflowSource).not.toContain("conversation.newConversation()");
    expect(writingWorkflowSource).toContain('agentId: "draft"');
    expect(writingWorkflowSource).not.toContain("startFreshLongContinuityLedger");
    expect(writingWorkflowSource).toContain("resolveLiveChapterReadiness");
    expect(writingWorkflowSource).toContain("refreshSaveBarrier");
    expect(writingWorkflowSource).toContain("async function cancelWorkflow()");
    expect(writingWorkflowSource).toContain("runExpectation = null");
    expect(appSource).toContain(
      '@cancel-writing-workflow="cancelLongWritingWorkflow"'
    );
    expect(longWorkspaceModuleSource).toContain("取消计划");
    expect(proposalSource).toContain("主弧连续章节");
    expect(proposalSource).toContain("当前卷章节");
    expect(writingOrchestratorSource).toContain(
      'phase: "awaiting_writer_approval"'
    );
    expect(writingOrchestratorSource).not.toContain(
      'phase: "awaiting_ledger_approval"'
    );
    expect(writingOrchestratorSource).toContain(
      'fail(error, "after_write")'
    );
    expect(writingOrchestratorSource).not.toContain("after_ledger");
    expect(writingOrchestratorSource).toContain(
      "guard: LongWritingRunGuard"
    );
    expect(writingOrchestratorSource).toContain(
      "runEpoch === epoch"
    );
    const freshRunSource =
      writingWorkflowSource
        .split("async function startFreshAgentRun(")[1]
        ?.split("async function startFreshChapterWriter(")[0] ?? "";
    expect(
      freshRunSource.match(/guard\.isCurrent\(\)/gu)?.length
    ).toBeGreaterThanOrEqual(5);
    expect(freshRunSource).toContain(
      "context.catalog.readableAttachments(summary, profile)"
    );
    expect(freshRunSource).not.toContain(
      "activeLongReadableAttachments"
    );
    const cancelSource =
      writingWorkflowSource
        .split("async function cancelWorkflow()")[1]
        ?.split("function canApproveProposal(")[0] ?? "";
    expect(cancelSource).toContain(
      "conversation.sessionId.value === expectation.sessionId"
    );
    expect(cancelSource.indexOf("workspaceProposals.quarantineSession("))
      .toBeLessThan(
        cancelSource.indexOf("runExpectation = null")
      );
    expect(cancelSource).toContain(
      "conversation.cancelPendingGeneration()"
    );
    expect(cancelSource).not.toContain("conversation.newConversation()");
    expect(cancelSource.indexOf("conversation.stopGeneration()")).toBeLessThan(
      cancelSource.indexOf("await stopPromise")
    );
    expect(writingOrchestratorSource).toContain(
      "event.payload.agentId !== expectation.agentId"
    );
    expect(writingOrchestratorSource).toContain(
      "event.payload.sessionId !== expectation.sessionId"
    );
    expect(writingOrchestratorSource).toContain(
      "event.payload.runId !== expectation.runId"
    );
    expect(writingWorkflowSource).toContain(
      "if (!canApproveProposal(event)) return;"
    );
  });

  it("guards every plan-invalidating navigation or mutation until cancellation", () => {
    expect(writingWorkflowSource).toContain("function blockActivePlan(");
    for (const action of [
      "新建长篇",
      "打开其他长篇",
      "导入长篇",
      "同步旧版本",
      "管理其他长篇的结构"
    ]) {
      expect(longBookLifecycleSource).toContain(
        `workflow.blockWritingPlan("${action}"`
      );
    }
    expect(longRollbackSource).toContain(
      'options.blockWritingPlan("回滚连续性提交")'
    );
    expect(longStructureTransactionsSource).toContain(
      'blockActiveLongWritingPlan("修改长篇结构")'
    );
    expect(longConversationSource).toContain(
      'options.workspace.blockActiveWritingPlan("新建长篇对话")'
    );
    expect(longConversationSource).toContain(
      'options.workspace.blockActiveWritingPlan("切换长篇对话")'
    );
    expect(longBookLifecycleSource).toContain(
      '"管理其他长篇的技能库绑定"'
    );
    expect(longBookLifecycleSource).toContain(
      '"管理其他长篇的素材库绑定"'
    );
    expect(longBookLifecycleSource).toContain(
      "`修改长篇${bindingLabel}`"
    );
    expect(writingWorkflowSource).toContain("请先取消计划");
    expect(longWorkspaceModuleSource).toContain(
      "writingOrchestrator.state.value.bookId ==="
    );
    expect(longWorkspaceModuleSource).toContain("book.id");
    expect(longConversationSource).toContain(
      "if (conversation.isBusy.value)"
    );
    expect(longConversationSource).toContain(
      "请先停止当前长篇回复，再新建对话。"
    );
    const newConversationSource =
      featureHostCoordinatorSource
        .split("function newConversation(): void {")[1]
        ?.split("async function openWorkspaceDialog(")[0] ?? "";
    expect(newConversationSource).toContain(
      "options.view.activeLongBookId.value !== null"
    );
    expect(newConversationSource).not.toContain(
      "isLongWorkspaceActive.value"
    );
    const newLongConversationSource =
      longConversationSource
        .split("function newConversation(): void {")[1]
        ?.split("function selectConversation(")[0] ?? "";
    expect(newLongConversationSource).toContain(
      "options.showConversation()"
    );
  });

  it("keeps saved revisions atomic and pauses long-agent sends while refreshing", () => {
    expect(longWorkspaceSessionSource).toContain(
      "createLongWorkspaceRefreshClock()"
    );
    expect(longWorkspaceSessionSource).toContain(
      "isMonotonicLongWorkspaceRefresh("
    );
    expect(appSource).toContain("activeLongWorkspaceContextReady");
    expect(longWorkspaceSessionSource).toContain("state.refreshStatus.value = {");
    expect(appSource).toContain("retryActiveLongWorkspaceRefresh");
    expect(longWorkspaceModuleSource).toContain("长篇智能体已暂停发送");
    expect(longWorkspaceModuleSource).toContain(
      'v-if="refreshStatus?.error"'
    );
    expect(appSource).not.toContain(
      'activeLongWorkspaceRefreshStatus.pending\n                    ? "正在同步保存后的最新工作区索引…"'
    );
    const sendLongMessageSource =
      longConversationSource
        .split("function sendLongMessage(")[1]
        ?.split("function synchronizeActiveRunPreferences")[0] ?? "";
    expect(sendLongMessageSource).toContain("await nextTick()");
    expect(
      sendLongMessageSource.match(
        /confirmSendTarget\(target\)/gu
      )?.length
    ).toBeGreaterThanOrEqual(4);
    expect(sendLongMessageSource.indexOf("saveActiveEditorChanges()")).toBeLessThan(
      sendLongMessageSource.indexOf(
        "refreshActiveWorkspace("
      )
    );
    expect(sendLongMessageSource.indexOf(
      "refreshActiveWorkspace("
    )).toBeLessThan(
      sendLongMessageSource.indexOf("activeRuntimeContext.value")
    );
    expect(sendLongMessageSource).toContain(
      "target.conversation.sendLongMessage("
    );
    const sendTargetSource =
      longConversationSource
        .split("interface LongMessageSendTarget")[1]
        ?.split("export interface LongConversationCoordinatorOptions")[0] ?? "";
    for (const field of [
      "bookId:",
      "selectionKey:",
      "preferredRole:",
      "activeRoot:",
      "chapterCardId:",
      "fileId:",
      "agentId:",
      "conversation:",
      "sessionId:",
      "draft:"
    ]) {
      expect(sendTargetSource).toContain(field);
    }
    expect(appSource).toContain(':editor-locked="longEditorLocked"');
    expect(appSource).not.toContain(
      "const longEditorLocked = computed("
    );
    expect(longWorkspaceModuleSource).toContain(':locked="editorLocked"');
    expect(presentationCoordinatorSource).toContain(
      "agentRunScopeHasWriteBarrier(scope)"
    );
    expect(presentationCoordinatorSource).toContain(
      "conversation.hasPendingEditReview.value"
    );
    expect(presentationCoordinatorSource).toContain(
      "正在保存并准备发送，编辑暂时锁定"
    );
    expect(presentationCoordinatorSource).toContain(
      "长篇智能体运行中 · 暂停编辑以防止版本冲突"
    );
    expect(editorSource).toContain("lockedReason?: string");
    expect(editorSource).toContain(':disabled="locked"');
    const approveSource =
      writingWorkflowSource
        .split("async function approveProposal(")[1]
        ?.split("function rejectProposal(")[0] ?? "";
    expect(approveSource).toContain(
      "canApproveProposal(item.event)"
    );
    expect(approveSource).toContain(
      "const wasPlanBound = writingOrchestrator.active.value"
    );
    expect(
      approveSource.indexOf(
        "state.proposalApprovalPending.value = true"
      )
    ).toBeLessThan(
      approveSource.indexOf("await context.workspace.saveActiveEditorChanges()")
    );
    expect(approveSource.indexOf("await nextTick()")).toBeLessThan(
      approveSource.indexOf("await context.workspace.saveActiveEditorChanges()")
    );
    expect(approveSource).toContain(
      "canApproveProposal(currentItem.event)"
    );
    expect(approveSource).toContain(
      "wasPlanBound &&"
    );
    expect(approveSource).toContain(
      "!writingOrchestrator.active.value"
    );
    const readinessSource =
      writingWorkflowSource
        .split("async function resolveLiveChapterReadiness(")[1]
        ?.split("function workflowRuntimeContext")[0] ?? "";
    expect(readinessSource).toContain("workspace.saveActiveEditorChanges()");
    expect(readinessSource).toContain("workspace.refreshActiveWorkspace(bookId)");
    expect(readinessSource).not.toContain(
      "replaceLongBookSummary(longBooks.value, result.summary)"
    );
  });

  it("shares plot-design and draft history across chapters while preserving other isolation", () => {
    expect(writingWorkflowSource).toContain(
      'activeRoot: LongWorkspaceRuntimeContext["activeRoot"]'
    );
    expect(writingWorkflowSource).toContain(
      'agentId === "plot_design" || agentId === "draft"'
    );
    expect(writingWorkflowSource).toContain(
      'conversationChapterCardId ?? "__book__"'
    );
    expect(presentationCoordinatorSource).toContain(
      "options.long.selection.value?.chapterCardId"
    );
    expect(writingWorkflowSource).toContain("input.activeRoot");
    expect(writingWorkflowSource).toContain("input.chapterCardId");
    expect(writingWorkflowSource).toContain(
      "const prefix = `long:${encodeURIComponent(event.payload.bookId)}:`"
    );
    expect(agentRunPreferencesSource).toContain(
      "return `${document.workspaceId}:${agentId}`"
    );
    expect(agentRunPreferencesSource).not.toContain(
      "longConversationKey"
    );
  });

  it("requires a modal confirmation before rolling back the final commit", () => {
    expect(editorSource).toContain("回滚最后提交");
    expect(appSource).toContain('@rollback="openLongRollbackDialog"');
    expect(appSource).toContain("useLazyLongRollbackCoordinator({");
    expect(longRollbackSource).toContain("api.rollbackLastCommit({");
    expect(longRollbackSource).toContain(
      "await session.saveActiveEditorChanges()"
    );
    expect(longRollbackSource).toContain(
      "await session.refreshActiveWorkspace(operationTarget.bookId)"
    );
    expect(rollbackSource).toContain('role="alertdialog"');
    expect(rollbackSource).toContain('aria-modal="true"');
    expect(rollbackSource).toContain("var(--surface-raised)");
  });

  it("keeps a write barrier until rollback revisions are refreshed and adopted", () => {
    const confirmRollbackSource =
      longRollbackSource
        .split("function confirmLongRollback(): Promise<void> {")[1]
        ?.split("function currentTarget():")[0] ?? "";
    const editorLockSource =
      presentationCoordinatorSource
        .split("const longEditorLocked = computed(")[1]
        ?.split("const longEditorLockedReason = computed(")[0] ?? "";
    const retryRefreshSource =
      longWorkspaceSessionSource
        .split("async function retryActiveRefresh(")[1]
        ?.split("async function refreshOnWindowFocus(")[0] ?? "";

    expect(confirmRollbackSource.indexOf("await scheduler.settleUi()")).toBeLessThan(
      confirmRollbackSource.indexOf("session.saveActiveEditorChanges()")
    );
    expect(
      confirmRollbackSource.indexOf("session.saveActiveEditorChanges()")
    ).toBeLessThan(
      confirmRollbackSource.indexOf("session.refreshActiveWorkspace(")
    );
    expect(confirmRollbackSource).toContain(
      "const rollback = await api.rollbackLastCommit({"
    );
    expect(longRollbackSource).toContain(
      "const requirement: LongWorkspaceRevisionSyncRequirement = {"
    );
    expect(longRollbackSource).toContain(
      "workspaceRevision: result.workspaceRevision"
    );
    expect(longRollbackSource).toContain(
      "projectRevision: result.projectRevision"
    );
    const afterRevisionRequirement =
      confirmRollbackSource.split(
        "const requirement = publishRevisionRequirement(rollback);"
      )[1] ?? "";
    expect(
      afterRevisionRequirement.indexOf(
        "session.refreshAndSynchronizeRequiredRevision("
      )
    ).toBeLessThan(
      afterRevisionRequirement.indexOf("completeCurrentTarget(operationTarget)")
    );
    expect(longRollbackSource).toContain(
      "preserveRevisionRequirement(requirement)"
    );

    expect(editorLockSource).toContain(
      "options.long.rollbackPending.value"
    );
    expect(editorLockSource).toContain(
      "options.long.refreshStatus.value?.pending"
    );
    expect(editorLockSource).toContain(
      "options.long.revisionRequirement.value !== null"
    );
    expect(longWorkspaceStoreSource).toContain(
      "activeRevisionRequirement.value === null"
    );
    expect(longWorkspaceSessionSource).toContain(
      "hasReachedLongWorkspaceRevisionTarget("
    );
    expect(retryRefreshSource).toContain(
      "refreshAndSynchronizeRequiredRevision(bookId)"
    );
    expect(longWorkspaceModuleSource).toContain(
      "正文编辑已锁定以防止版本冲突"
    );
  });

  it("provides a continuity review entry without replacing chapter authoring", () => {
    expect(longWorkspaceResourceTreeSource).toContain(
      "createLongChapterSelection"
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      "createLongContinuitySelection"
    );
    expect(longWorkspaceResourceTreeSource).toContain(
      'title: "待处理章节"'
    );
    expect(longWorkspaceTypeSource).toContain(
      "没有候选时不生成伏笔记录"
    );
    expect(longWorkspaceTypeSource).toContain(
      'root: "continuity_ledger"'
    );
    expect(longWorkspaceTypeSource).toContain(
      "chapterCardId: chapter.id"
    );
    expect(longWorkspaceTypeSource).toContain(
      "正文仍可继续修改"
    );
    expect(editorSource).toContain("回滚最后提交");
    expect(editorSource).toContain(
      "本章已有连续性记录；记录仅供参考，不限制正文修改"
    );
    expect(editorSource).toContain("currentIsCommittedEditableDocument");
    expect(editorSource).toContain(
      "章卡已有连续性记录；仍可编辑、移动或删除"
    );
    expect(editorSource).toContain(
      "删除时会同时清理该章正文与记录"
    );
    expect(presentationCoordinatorSource).toContain(
      "chapter.commitId !== null ||"
    );
  });

  it("exposes selective legacy sync and isolated book removal", () => {
    expect(sectionSource).toContain('"choose-open-book"');
    expect(sectionSource).toContain('id: "choose-import-book"');
    expect(workspaceDialogLayerSource).toContain("<BookTransferDialog");
    expect(appSource).toContain(
      '@select-book-transfer="handleBookTransferSelect"'
    );
    expect(longBookLifecycleSource).toContain("api.importPortable()");
    expect(longBookLifecycleSource).toContain("api.chooseLegacySyncSource()");
    expect(longBookLifecycleSource).toContain("api.applyLegacySync({");
    expect(longBookLifecycleSource).not.toContain("api.exportPortable({");
    expect(longBookLifecycleSource).toContain(
      "state.activeBookId.value === bookId &&"
    );
    expect(workspaceDialogLayerSource).toContain("<LongLegacySyncDialog");
    expect(workspaceDialogLayerSource).toContain("<LongBookRemovalDialog");
    expect(appSource).toContain('@confirm-legacy-sync="confirmLegacySync"');
    expect(appSource).toContain(
      '@confirm-long-removal="confirmLongBookRemoval"'
    );
    expect(legacySyncSource).toContain("现有内容不会删除或覆盖");
    expect(removalSource).toContain("整个长篇项目文件夹");
    expect(appSource).toContain(
      "stopBookAgentRuns: stopLongBookAgentRuns"
    );
    expect(longBookLifecycleSource).toContain(
      "await workflow.stopBookAgentRuns(target.bookId)"
    );
    expect(writingWorkflowSource).toContain(
      "context.conversations.remove(key, { clearPersistence: true })"
    );
    expect(conversationStoreSource).toContain(
      "controller.dispose("
    );
    expect(conversationStoreSource).toContain(
      "{ clearPersistence: options.clearPersistence }"
    );
    expect(writingWorkflowSource).toContain(
      "workspaceProposals.discardBook(bookId)"
    );
    expect(writingWorkflowSource).toContain(
      'context.removeAgentRunPreferences(`long:${bookId}`)'
    );
    expect(appSource).toContain("longCatalogDiagnostics");
    expect(resourceTreeCoordinatorSource).toContain("不可用长篇 ·");
    expect(resourceTreeCoordinatorSource).toContain("unavailable: true");
    expect(sectionSource).toContain('id: "refresh-long-books"');
    expect(longWorkspaceSessionSource).toContain(
      "export interface LoadLongBookListOptions"
    );
    expect(longWorkspaceStoreSource).toContain(
      "requestBookListGeneration !== bookListGeneration"
    );
    expect(longBookLifecycleSource).toContain(
      "await catalog.loadBookList({ force: true })"
    );
    expect(longWorkspaceSessionSource).toContain(
      "catalogRetryAttempts < 2"
    );
  });

  it("updates long resource bindings through an isolated CAS command", () => {
    expect(workspaceDialogLayerSource).toContain("<LongBookBindingsDialog");
    expect(appSource).toContain(
      '@submit-long-bindings="updateLongBookBindings"'
    );
    expect(longBookLifecycleSource).toContain("api.updateBindings({");
    expect(longBookLifecycleSource).toContain(
      "expectedProjectRevision: summary.projectRevision"
    );
    expect(appSource).toContain(
      "longWorkspaceEditor.value?.synchronizeProjectRevisions"
    );
    expect(editorSource).toContain("function synchronizeProjectRevisions(");
    expect(bindingsSource).toContain("<PopupSelect");
    expect(bindingsSource).toContain("create-short-binding-panel");
    expect(bindingsSource).toContain("create-short-kind-grid");
    expect(bindingsSource).toContain("Catalog 中缺失");
    expect(bindingsSource).not.toContain('library.materialType === "long"');
    expect(bindingsSource).not.toContain('library.skillType === "long"');
    expect(bindingsSource).not.toContain("catalog.updateBook");
  });

  it("applies manual structure changes directly after an internal impact check", () => {
    expect(workspaceDialogLayerSource).toContain("<LongStructureDialog");
    expect(appSource).toContain("useLazyLongStructureTransactionsCoordinator");
    expect(appSource).not.toContain(
      'from "./composables/useLongStructureTransactionsCoordinator"'
    );
    expect(lazyLongStructureTransactionsSource).toContain(
      'const MIGRATION_EVIDENCE_CATEGORY_PREFIX = "world_migration-evidence-"'
    );
    expect(lazyLongStructureTransactionsSource).toContain(
      "({ id }) => !id.startsWith(MIGRATION_EVIDENCE_CATEGORY_PREFIX)"
    );
    expect(longStructureTransactionsSource).toContain(
      "async function handleLongStructureMutation("
    );
    expect(longStructureTransactionsSource).toContain(
      "async function handleLongWorldbuildingSync("
    );
    expect(longStructureTransactionsSource).toContain(
      "buildLongWorldbuildingSyncBatch"
    );
    expect(workspaceDialogLayerSource).toContain(
      "emit('syncLongWorldbuilding', payload, completion)"
    );
    expect(appSource).toContain(
      '@sync-long-worldbuilding="handleLongWorldbuildingSync"'
    );
    expect(longStructureTransactionsSource).toContain(
      "const preview = await workspaceApi.previewOperations({"
    );
    expect(longStructureTransactionsSource).toContain(
      "const applyResult = await workspaceApi.applyOperations({"
    );
    expect(longStructureTransactionsSource).toContain(
      "expectedImpact: preview.preview.impact"
    );
    expect(longStructureTransactionsSource).not.toContain(
      "longWorkspaceProposals.enqueueManualMutation({"
    );
    expect(structureSource).toContain(
      "completion: LongStructureMutationCompletion"
    );
    expect(structureSource).toContain("builder.createWorldbuilding");
    expect(structureSource).toContain("builder.updateWorldbuilding");
    expect(structureSource).toContain("加载其他书籍世界观");
    expect(structureSource).not.toContain("<LongPlotStructureManager");
    expect(structureSource).toContain('@click="openCreate"');
    expect(structureSource).toContain('@click="openEdit(row)"');
    expect(structureSource).toContain('@click="openDelete(row)"');
  });

  it("keeps every lazy long-structure mutation bound to its originating book and index", () => {
    const lazyMutationLoads = longStructureTransactionsSource.match(
      /await loadLongStructureMutationModule\(\)/g
    );
    expect(lazyMutationLoads).toHaveLength(14);

    for (const resumedPath of longStructureTransactionsSource
      .split("await loadLongStructureMutationModule()")
      .slice(1)) {
      expect(resumedPath.slice(0, 600)).toContain(
        "assertCurrentLongStructureMutationTarget("
      );
    }

    const targetGuard = longStructureTransactionsSource.slice(
      longStructureTransactionsSource.indexOf(
        "function captureLongStructureMutationTarget("
      ),
      longStructureTransactionsSource.indexOf("function acquireMutation(")
    );
    expect(targetGuard).toContain(
      "activeLongBookId.value !== expectedBookId"
    );
    expect(targetGuard).toContain("summary?.id !== expectedBookId");
    expect(targetGuard).toContain("current.index !== target.index");
    expect(targetGuard).toContain("current.revision !== target.revision");

    const applyMutation = longStructureTransactionsSource.slice(
      longStructureTransactionsSource.indexOf(
        "async function executeLongStructureMutation("
      ),
      longStructureTransactionsSource.indexOf("function useLongWorkspaceApi(")
    );
    expect(applyMutation).toContain(
      "const expectedBookId = lease.target.bookId"
    );
    expect(applyMutation).toContain(
      "captureLongStructureMutationTarget(expectedBookId)"
    );
    expect(applyMutation).toContain("bookId: expectedBookId");

    const importGuard = applyMutation.indexOf(
      "assertCurrentLongStructureMutationTarget(latestTarget, lease)"
    );
    const preview = applyMutation.indexOf(
      "const preview = await workspaceApi.previewOperations("
    );
    const previewGuard = applyMutation.indexOf(
      "assertCurrentLongStructureMutationTarget(latestTarget, lease)",
      importGuard + 1
    );
    const previewValidation = applyMutation.indexOf(
      "preview.bookId !== expectedBookId"
    );
    const applyGuard = applyMutation.indexOf(
      "assertCurrentLongStructureMutationTarget(latestTarget, lease)",
      previewGuard + 1
    );
    const apply = applyMutation.indexOf(
      "const applyResult = await workspaceApi.applyOperations("
    );
    expect(importGuard).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(importGuard);
    expect(previewGuard).toBeGreaterThan(preview);
    expect(previewValidation).toBeGreaterThan(previewGuard);
    expect(applyGuard).toBeGreaterThan(previewValidation);
    expect(apply).toBeGreaterThan(applyGuard);

    expect(longWorkspaceStoreSource).toContain(
      "const volumeCreateTarget = shallowRef<{ readonly bookId: string } | null>(null)"
    );
    expect(longStructureTransactionsSource).toContain(
      "longVolumeCreate.value !== target"
    );
    expect(longStructureTransactionsSource).toContain(
      "longPlotPointCreate.value !== target"
    );
    expect(longStructureTransactionsSource).toContain(
      "longChapterCardCreate.value !== target"
    );
    expect(longStructureTransactionsSource).toContain(
      "longCharacterCreate.value !== target"
    );
    expect(longStructureTransactionsSource).toContain(
      "longWorldbuildingItemCreate.value !== target"
    );
    expect(longStructureTransactionsSource).toContain(
      "() => longDraftSectionDelete.value === pending"
    );
  });
});
