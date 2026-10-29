import { defineAsyncComponent, h } from "vue";
import { uiMessage } from "../ui-feedback";

// The default three-pane writing surface stays in the entry chunk. Each
// top-level feature and modal-only component gets its own on-demand chunk.
// Approval/subagent panels are not needed by an empty conversation. Keep their
// validation and review behavior intact, but load their UI only when rendered.
const conversationPanelOptions = {
  delay: 120,
  timeout: 10_000,
  loadingComponent: { render: () => h("p", { role: "status", "aria-live": "polite", class: "conversation-panel-load-status" }, "正在加载审阅面板……") },
  errorComponent: { render: () => h("p", { role: "alert", class: "conversation-panel-load-status" }, "面板加载失败，请重新打开作品后重试。原稿未修改。") },
  onError(_error: Error, retry: () => void, fail: () => void, attempts: number) {
    if (attempts < 2) retry();
    else { uiMessage.error("审阅面板加载失败，请重新打开作品后重试。原稿未修改。"); fail(); }
  }
};
export const AgentEditProposalCard = defineAsyncComponent({ ...conversationPanelOptions, loader: () => import("./AgentEditProposalCard.vue") });
export const LongProposalReview = defineAsyncComponent({ ...conversationPanelOptions, loader: () => import("./LongProposalReview.vue") });
export const SubagentRunList = defineAsyncComponent({ ...conversationPanelOptions, loader: () => import("./SubagentRunList.vue") });

export const AgentTeamSettingsPanel = defineAsyncComponent(
  () => import("./AgentTeamSettingsPanel.vue")
);
export const LearningImitationDialog = defineAsyncComponent(
  () => import("./LearningImitationDialog.vue")
);
export const LongWorkspaceEditor = defineAsyncComponent(
  () => import("./LongWorkspaceEditor.vue")
);
export const LongWorkspaceModule = defineAsyncComponent(
  () => import("./LongWorkspaceModule.vue")
);
export const SettingsPage = defineAsyncComponent(
  () => import("./SettingsPage.vue")
);
export const SkillMarketplacePage = defineAsyncComponent(
  () => import("./SkillMarketplacePage.vue")
);
export const CloudBackupPage = defineAsyncComponent(
  () => import("../extras/cloud-backup/CloudBackupPage.vue")
);
export const ModelSettingsFeature = defineAsyncComponent(
  () => import("./ModelSettingsFeature.vue")
);
export const WorkspaceDirectoryFeature = defineAsyncComponent(
  () => import("./WorkspaceDirectoryFeature.vue")
);
export const InkHubLibraryPage = defineAsyncComponent(
  () => import("./InkHubLibraryPage.vue")
);
export const WorkspaceFeatureModules = defineAsyncComponent(
  () => import("./WorkspaceFeatureModules.vue")
);
export const WorkspaceDialogLayer = defineAsyncComponent(
  () => import("./WorkspaceDialogLayer.vue")
);
export const WritingGettingStartedDialog = defineAsyncComponent(
  () => import("./WritingGettingStartedDialog.vue")
);
export const TopicArchiveDialog = defineAsyncComponent(
  () => import("./TopicArchiveDialog.vue")
);
export const AuthorPreferencesDialog = defineAsyncComponent(
  () => import("./AuthorPreferencesDialog.vue")
);

export const BookResourceDialog = defineAsyncComponent(
  () => import("./BookResourceDialog.vue")
);
export const BookTransferDialog = defineAsyncComponent(
  () => import("./BookTransferDialog.vue")
);
export const CharacterItemDialog = defineAsyncComponent(
  () => import("./CharacterItemDialog.vue")
);
export const CreateBookDialog = defineAsyncComponent(
  () => import("./CreateBookDialog.vue")
);
export const CreateExpertSectionDialog = defineAsyncComponent(
  () => import("./CreateExpertSectionDialog.vue")
);
export const CreateLongChapterCardDialog = defineAsyncComponent(
  () => import("./CreateLongChapterCardDialog.vue")
);
export const CreateLongCharacterDialog = defineAsyncComponent(
  () => import("./CreateLongCharacterDialog.vue")
);
export const CreateLongPlotPointDialog = defineAsyncComponent(
  () => import("./CreateLongPlotPointDialog.vue")
);
export const CreateLongVolumeDialog = defineAsyncComponent(
  () => import("./CreateLongVolumeDialog.vue")
);
export const CreateLongWorldbuildingItemDialog = defineAsyncComponent(
  () => import("./CreateLongWorldbuildingItemDialog.vue")
);
export const DeleteExpertSectionDialog = defineAsyncComponent(
  () => import("./DeleteExpertSectionDialog.vue")
);
export const DeleteLongDraftSectionDialog = defineAsyncComponent(
  () => import("./DeleteLongDraftSectionDialog.vue")
);
export const ExportLongManuscriptDialog = defineAsyncComponent(
  () => import("./ExportLongManuscriptDialog.vue")
);
export const ExportShortManuscriptDialog = defineAsyncComponent(
  () => import("./ExportShortManuscriptDialog.vue")
);
export const ExternalSkillImportDialog = defineAsyncComponent(
  () => import("./ExternalSkillImportDialog.vue")
);
export const LibraryEntryMoveDialog = defineAsyncComponent(
  () => import("./LibraryEntryMoveDialog.vue")
);
export const LibraryGroupDialog = defineAsyncComponent(
  () => import("./LibraryGroupDialog.vue")
);
export const LibraryProjectDialog = defineAsyncComponent(
  () => import("./LibraryProjectDialog.vue")
);
export const LibraryRemovalDialog = defineAsyncComponent(
  () => import("./LibraryRemovalDialog.vue")
);
export const LongBookBindingsDialog = defineAsyncComponent(
  () => import("./LongBookBindingsDialog.vue")
);
export const LongBookRemovalDialog = defineAsyncComponent(
  () => import("./LongBookRemovalDialog.vue")
);
export const LongBookRenameDialog = defineAsyncComponent(
  () => import("./LongBookRenameDialog.vue")
);
export const LongContinuationImportDialog = defineAsyncComponent(
  () => import("./LongContinuationImportDialog.vue")
);
export const LongLegacySyncDialog = defineAsyncComponent(
  () => import("./LongLegacySyncDialog.vue")
);
export const LongRollbackDialog = defineAsyncComponent(
  () => import("./LongRollbackDialog.vue")
);
export const LongStructureDialog = defineAsyncComponent(
  () => import("./LongStructureDialog.vue")
);
export const PlotStructureDialog = defineAsyncComponent(
  () => import("./PlotStructureDialog.vue")
);
export const SaveConflictDialog = defineAsyncComponent(
  () => import("./SaveConflictDialog.vue")
);
export const StartupAlertDialog = defineAsyncComponent(
  () => import("./StartupAlertDialog.vue")
);
