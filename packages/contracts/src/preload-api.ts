import type {
  SessionAbortAcceptedPayload,
  SessionAbortCommandPayload,
  SessionPromptAcceptedPayload,
  SessionPromptCommandPayload
} from "./session";
import type {
  ModelConnectionTestResult,
  ModelConfigInput,
  OfficialModelBalance,
  ModelSettings,
  ModelSettingsInput,
  RemoteModelListInput,
  RemoteModelListResult
} from "./models";
import type { ModelUsageDashboard, ModelUsageQueryInput } from "./model-usage";
import type { SystemEventEnvelope, SystemHealthPayload } from "./system";
import type {
  WorkspaceAgentId,
  WorkspaceAgentSettings,
  WorkspaceAgentSettingsInput
} from "./workspace";
import type {
  WorkspaceAgentTeamSettings,
  WorkspaceAgentTeamSettingsInput
} from "./agent-team";
import type { WorkspaceType } from "./script-workspace";
import type { WorkspaceDirectorySettings } from "./workspace-directory";
import type {
  AppearanceSettings,
  AppearanceSettingsSnapshot
} from "./appearance";
import type {
  GeneralSettings,
  GeneralSettingsSnapshot
} from "./general-settings";
import type {
  ExportShortManuscriptInput,
  ExportShortManuscriptResult
} from "./short-manuscript-export";
import type {
  ExportLongManuscriptInput,
  ExportLongManuscriptResult
} from "./long-manuscript-export";
import type {
  LearningImitationSettings,
  LearningImitationSettingsInput,
  LearningImitationStageId
} from "./learning-imitation";
import type {
  LibraryAgentDomain,
  LibraryAgentSettings,
  LibraryAgentSettingsInput
} from "./library-agent";
import type {
  CatalogDraftSection,
  CatalogDraftRecovery,
  CatalogLibrary,
  CatalogLibraryGroup,
  CatalogLibraryEntry,
  CatalogOpenProjectResult,
  CatalogProjectDomain,
  CatalogIndexSnapshot,
  CatalogReadDocumentInput,
  CatalogReadDocumentResult,
  CatalogSnapshot,
  CatalogLibraryProjectDomain,
  CreateLibraryEntryInput,
  CreateDraftSectionInput,
  CreateDraftSectionsInput,
  CreateDraftSectionsResult,
  CreateLibraryGroupInput,
  CreateLibraryInput,
  UpdateLibraryInput,
  CreateScriptBookInput,
  CreateShortBookInput,
  DeleteCatalogProjectInput,
  DeleteCatalogProjectResult,
  DuplicateCatalogProjectInput,
  DuplicateCatalogProjectResult,
  ExternalSkillSelectionResult,
  ExternalSkillSourceKind,
  DeleteBookResult,
  DeleteDraftSectionInput,
  DeleteDraftSectionResult,
  MoveDraftSectionInput,
  MoveDraftSectionResult,
  RemoveLibraryEntryInput,
  RemoveLibraryEntryResult,
  MoveLibraryEntryInput,
  MoveLibraryEntryResult,
  SaveDocumentInput,
  SaveDocumentResult,
  SaveLibraryEntryInput,
  ScriptBook,
  ShortBook,
  Book,
  ImportLegacyLibraryResult,
  MutateCharacterStructureInput,
  MutatePlotStructureInput,
  UnregisterCatalogProjectInput,
  UnregisterCatalogProjectResult,
  UpdateBookInput,
  UpdateLibraryGroupInput
} from "./catalog";
import type {
  CreateLongBookInput,
  LongDuplicateBookInput,
  LongImportPortableResult,
  LongApplyLegacySyncInput,
  LongApplyLegacySyncResult,
  LongChooseLegacySyncSourceResult,
  LongChooseContinuationImportSourceResult,
  LongImportContinuationInput,
  LongImportContinuationResult,
  LongApplyOperationsInput,
  LongApplyOperationsResult,
  LongListBooksResult,
  LongOpenBookInput,
  LongOpenBookResult,
  LongPreviewOperationsInput,
  LongPreviewOperationsResult,
  LongReadDocumentInput,
  LongReadDocumentResult,
  LongReadAgentsMdInput,
  LongReadAgentsMdResult,
  LongRenameBookInput,
  LongRemoveBookInput,
  LongRemoveBookResult,
  LongUpdateBindingsInput,
  LongWorkspaceIndexResult,
  LongWriteDocumentInput,
  LongWriteDocumentResult,
  LongWriteAgentsMdInput,
  LongWriteAgentsMdResult
} from "./long-workspace-api";
import type {
  LongCommitChapterInput,
  LongCommitChapterResult,
  LongRollbackLastCommitInput,
  LongRollbackLastCommitResult,
  LongWriteChapterInput,
  LongWriteChapterResult
} from "./long-ledger";
import type {
  LongAgentSettings,
  LongAgentSettingsInput
} from "./long-agent-settings";
import type {
  LongAgentTeamSettings,
  LongAgentTeamSettingsInput
} from "./long-agent-team";
import type { LongAgentId } from "./long-workspace";
import type { UpdateState } from "./update";
import type { AppAlertSnapshot } from "./app-alert";
import type {
  MarketplaceContentDetail,
  MarketplaceContentPage,
  MarketplaceContentRef,
  MarketplaceContentSummary,
  MarketplaceInstallInput,
  MarketplaceInstallPreview,
  MarketplaceInstallResult,
  MarketplaceLikeInput,
  MarketplaceLikeResult,
  MarketplaceListFilter,
  MarketplaceLoginInput,
  MarketplacePublishInput,
  MarketplaceRegisterInput,
  MarketplaceSetEnabledInput,
  MarketplaceSession,
  MarketplaceUpdateInput
} from "./marketplace";
import type {
  CloudBackupApplyResult,
  CloudBackupPreview,
  CloudBackupStatus
} from "./cloud-backup";
import type { ConversationPersistenceApi } from "./renderer-state";
import type {
  InkHubAttachedSkills,
  InkHubNovelDocumentList,
  InkHubNovelDocumentPreview,
  InkHubNovelSnapshot,
  InkHubSkillPreview,
  InkHubSkillSnapshot
} from "./inkhub-assets";
import type {
  InkHubDeepQualityCancelRequest,
  InkHubDeepQualityProgress,
  InkHubDeepQualityReport,
  InkHubDeepQualityRequest,
  InkHubDeepQualityTask
} from "./inkhub-deep-quality";
import type {
  InkHubNovelChapterCatalog,
  InkHubNovelChapterPage,
  InkHubNovelChapterRepairInput,
  InkHubNovelChapterRepairResult,
  InkHubNovelAiRepairPlan,
  InkHubNovelAiRepairProgress,
  InkHubNovelAiRepairRequest,
  InkHubNovelAiRepairTask,
  InkHubNovelAiRepairCancelRequest,
  InkHubNovelBatchRepairInput,
  InkHubNovelBatchRepairResult,
  InkHubNovelContextPacket,
  InkHubNovelIndexSummary,
  InkHubNovelQualityReport,
  InkHubNovelReadingProgress,
  InkHubNovelSearchResponse
} from "./inkhub-reader";
import type {
  InkHubStoryContinuationRequest,
  InkHubStoryContinuationResult,
  InkHubStoryForecastList,
  InkHubStoryForecastRequest,
  InkHubStoryForecastResult,
  InkHubStoryReconstructionProgress,
  InkHubStoryReconstructionRequest,
  InkHubStoryStateSnapshot
} from "./inkhub-story-kernel";
import type {
  InkHubCoverPlatformPreset,
  InkHubCoverStyle,
  InkHubCoverStyleId,
  InkHubGeneratedMedia,
  InkHubIllustrationPlan
} from "./inkhub-media";

export interface DeepWriteApi {
  inkHub?: {
    listNovels(): Promise<InkHubNovelSnapshot>;
    chooseNovelRoot(): Promise<InkHubNovelSnapshot | null>;
    removeNovelRoot(rootId: string): Promise<InkHubNovelSnapshot>;
    listNovelDocuments(entryId: string): Promise<InkHubNovelDocumentList>;
    readNovelDocument(
      entryId: string,
      relativePath: string
    ): Promise<InkHubNovelDocumentPreview>;
    getNovelIndex(entryId: string, verifyFreshness?: boolean): Promise<InkHubNovelIndexSummary>;
    buildNovelIndex(entryId: string): Promise<InkHubNovelIndexSummary>;
    listNovelChapters(entryId: string, offset?: number, limit?: number): Promise<InkHubNovelChapterCatalog>;
    readNovelChapter(entryId: string, chapterId: string, offset?: number, limit?: number): Promise<InkHubNovelChapterPage>;
    searchNovel(entryId: string, query: string, limit?: number): Promise<InkHubNovelSearchResponse>;
    runNovelQualityCheck(entryId: string): Promise<InkHubNovelQualityReport>;
    runNovelDeepQuality(input: InkHubDeepQualityRequest): Promise<InkHubDeepQualityReport>;
    getNovelDeepQualityProgress(entryId: string): Promise<InkHubDeepQualityProgress | null>;
    getNovelDeepQualityTask(entryId: string): Promise<InkHubDeepQualityTask | null>;
    resumeNovelDeepQuality(input: InkHubDeepQualityRequest): Promise<InkHubDeepQualityReport>;
    cancelNovelDeepQuality(input: InkHubDeepQualityCancelRequest): Promise<InkHubDeepQualityTask>;
    applyNovelChapterRepair(input: InkHubNovelChapterRepairInput): Promise<InkHubNovelChapterRepairResult>;
    generateNovelAiRepairs(input: InkHubNovelAiRepairRequest): Promise<InkHubNovelAiRepairPlan>;
    getNovelAiRepairProgress(entryId: string): Promise<InkHubNovelAiRepairProgress | null>;
    getNovelAiRepairTask(entryId: string): Promise<InkHubNovelAiRepairTask | null>;
    resumeNovelAiRepairs(input: InkHubNovelAiRepairRequest): Promise<InkHubNovelAiRepairPlan>;
    cancelNovelAiRepairs(input: InkHubNovelAiRepairCancelRequest): Promise<InkHubNovelAiRepairTask>;
    applyNovelChapterRepairs(input: InkHubNovelBatchRepairInput): Promise<InkHubNovelBatchRepairResult>;
    getStoryState(entryId: string): Promise<InkHubStoryStateSnapshot>;
    getStoryReconstructionProgress(entryId: string): Promise<InkHubStoryReconstructionProgress | null>;
    reconstructStoryState(input: InkHubStoryReconstructionRequest): Promise<InkHubStoryStateSnapshot>;
    generateStoryContinuation(input: InkHubStoryContinuationRequest): Promise<InkHubStoryContinuationResult>;
    generateStoryForecast(input: InkHubStoryForecastRequest): Promise<InkHubStoryForecastResult>;
    listStoryForecasts(entryId: string): Promise<InkHubStoryForecastList>;
    createNovelContext(entryId: string, purpose: "quality-check" | "continue-writing"): Promise<InkHubNovelContextPacket>;
    getNovelReadingProgress(entryId: string): Promise<InkHubNovelReadingProgress | null>;
    saveNovelReadingProgress(input: Omit<InkHubNovelReadingProgress, "updatedAt">): Promise<InkHubNovelReadingProgress>;
    revealNovel(entryId: string): Promise<void>;
    listSkills(): Promise<InkHubSkillSnapshot>;
    installSkills(): Promise<InkHubSkillSnapshot>;
    setSkillEnabled(skillId: string, enabled: boolean): Promise<InkHubSkillSnapshot>;
    readSkill(skillId: string): Promise<InkHubSkillPreview>;
    attachedSkills(): Promise<InkHubAttachedSkills>;
  };
  inkHubMedia?: {
    listCoverPresets(): Promise<InkHubCoverPlatformPreset[]>;
    listCoverStyles(): Promise<InkHubCoverStyle[]>;
    planIllustrations(entryId: string, count: number): Promise<InkHubIllustrationPlan>;
    generateCover(input: {
      entryId: string;
      modelId: string;
      platformId: InkHubCoverPlatformPreset["id"];
      styleId: InkHubCoverStyleId;
      title: string;
      author: string;
      prompt: string;
      confirmBillable: true;
    }): Promise<InkHubGeneratedMedia>;
    generateIllustration(input: {
      entryId: string;
      modelId: string;
      chapterTitle: string;
      prompt: string;
      confirmBillable: true;
    }): Promise<InkHubGeneratedMedia>;
    revealMedia(entryId: string, path: string): Promise<void>;
  };
  system: {
    health(): Promise<SystemHealthPayload>;
  };
  conversationPersistence?: ConversationPersistenceApi;
  updates: {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    install(): Promise<void>;
    subscribe(listener: (state: UpdateState) => void): () => void;
  };
  appAlerts: {
    get(): Promise<AppAlertSnapshot>;
    acknowledgeDesktop(revision: string): Promise<void>;
  };
  marketplace: {
    session(): Promise<MarketplaceSession>;
    register(input: MarketplaceRegisterInput): Promise<MarketplaceSession>;
    login(input: MarketplaceLoginInput): Promise<MarketplaceSession>;
    logout(): Promise<MarketplaceSession>;
    list(filter?: MarketplaceListFilter): Promise<MarketplaceContentPage>;
    detail(ref: MarketplaceContentRef): Promise<MarketplaceContentDetail>;
    listMine(filter?: MarketplaceListFilter): Promise<MarketplaceContentPage>;
    myDetail(ref: MarketplaceContentRef): Promise<MarketplaceContentDetail>;
    publish(input: MarketplacePublishInput): Promise<MarketplaceContentDetail>;
    update(input: MarketplaceUpdateInput): Promise<MarketplaceContentDetail>;
    setEnabled(input: MarketplaceSetEnabledInput): Promise<MarketplaceContentSummary>;
    delete(ref: MarketplaceContentRef): Promise<void>;
    like(input: MarketplaceLikeInput): Promise<MarketplaceLikeResult>;
    previewInstall(ref: MarketplaceContentRef): Promise<MarketplaceInstallPreview>;
    install(input: MarketplaceInstallInput): Promise<MarketplaceInstallResult>;
  };
  cloudBackup: {
    status(): Promise<CloudBackupStatus>;
    previewBackup(): Promise<CloudBackupPreview>;
    applyBackup(previewId: string): Promise<CloudBackupApplyResult>;
    previewRestore(machineKey: string): Promise<CloudBackupPreview>;
    applyRestore(previewId: string): Promise<CloudBackupApplyResult>;
  };
  catalog: {
    index(): Promise<CatalogIndexSnapshot>;
    readDocument(input: CatalogReadDocumentInput): Promise<CatalogReadDocumentResult>;
    snapshot(): Promise<CatalogSnapshot>;
    loadDraftRecovery(): Promise<CatalogDraftRecovery>;
    saveDraftRecovery(drafts: CatalogDraftRecovery): Promise<void>;
    createShortBook(input: CreateShortBookInput): Promise<ShortBook | null>;
    createScriptBook(input: CreateScriptBookInput): Promise<ScriptBook | null>;
    createLibrary(input: CreateLibraryInput): Promise<CatalogLibrary | null>;
    updateLibrary(input: UpdateLibraryInput): Promise<CatalogLibrary>;
    createLibraryGroup(input: CreateLibraryGroupInput): Promise<CatalogLibraryGroup | null>;
    openProject(domain: CatalogProjectDomain): Promise<CatalogOpenProjectResult | null>;
    importLegacyLibrary(
      domain: CatalogLibraryProjectDomain
    ): Promise<ImportLegacyLibraryResult | null>;
    updateBook(input: UpdateBookInput): Promise<Book>;
    mutateCharacterStructure(input: MutateCharacterStructureInput): Promise<Book>;
    mutatePlotStructure(input: MutatePlotStructureInput): Promise<Book>;
    updateLibraryGroup(input: UpdateLibraryGroupInput): Promise<CatalogLibraryGroup>;
    deleteBook(bookId: string): Promise<DeleteBookResult>;
    saveDocument(input: SaveDocumentInput): Promise<SaveDocumentResult>;
    createDraftSection(input: CreateDraftSectionInput): Promise<CatalogDraftSection>;
    createDraftSections(
      input: CreateDraftSectionsInput
    ): Promise<CreateDraftSectionsResult>;
    deleteDraftSection(
      input: DeleteDraftSectionInput
    ): Promise<DeleteDraftSectionResult>;
    moveDraftSection(input: MoveDraftSectionInput): Promise<MoveDraftSectionResult>;
    saveLibraryEntry(input: SaveLibraryEntryInput): Promise<CatalogLibraryEntry>;
    createLibraryEntry(input: CreateLibraryEntryInput): Promise<CatalogLibraryEntry>;
    chooseExternalSkills(
      sourceKind: ExternalSkillSourceKind
    ): Promise<ExternalSkillSelectionResult | null>;
    removeLibraryEntry(input: RemoveLibraryEntryInput): Promise<RemoveLibraryEntryResult>;
    moveLibraryEntry(input: MoveLibraryEntryInput): Promise<MoveLibraryEntryResult>;
    unregisterProject(
      input: UnregisterCatalogProjectInput
    ): Promise<UnregisterCatalogProjectResult>;
    deleteProject(
      input: DeleteCatalogProjectInput
    ): Promise<DeleteCatalogProjectResult>;
    duplicateProject(
      input: DuplicateCatalogProjectInput
    ): Promise<DuplicateCatalogProjectResult>;
  };
  long: {
    list(): Promise<LongListBooksResult>;
    create(input: CreateLongBookInput): Promise<LongOpenBookResult | null>;
    duplicateBook(input: LongDuplicateBookInput): Promise<LongOpenBookResult>;
    chooseLegacySyncSource(): Promise<LongChooseLegacySyncSourceResult | null>;
    applyLegacySync(input: LongApplyLegacySyncInput): Promise<LongApplyLegacySyncResult>;
    importPortable(): Promise<LongImportPortableResult | null>;
    chooseContinuationImportSource(): Promise<LongChooseContinuationImportSourceResult | null>;
    importContinuation(
      input: LongImportContinuationInput
    ): Promise<LongImportContinuationResult | null>;
    open(input: LongOpenBookInput): Promise<LongOpenBookResult>;
    rename(input: LongRenameBookInput): Promise<LongOpenBookResult>;
    updateBindings(
      input: LongUpdateBindingsInput
    ): Promise<LongOpenBookResult>;
    openExisting(): Promise<LongOpenBookResult | null>;
    getWorkspaceIndex(
      input: LongOpenBookInput
    ): Promise<LongWorkspaceIndexResult>;
    readDocument(
      input: LongReadDocumentInput
    ): Promise<LongReadDocumentResult>;
    writeDocument(
      input: LongWriteDocumentInput
    ): Promise<LongWriteDocumentResult>;
    readAgentsMd(
      input: LongReadAgentsMdInput
    ): Promise<LongReadAgentsMdResult>;
    writeAgentsMd(
      input: LongWriteAgentsMdInput
    ): Promise<LongWriteAgentsMdResult>;
    previewOperations(
      input: LongPreviewOperationsInput
    ): Promise<LongPreviewOperationsResult>;
    applyOperations(
      input: LongApplyOperationsInput
    ): Promise<LongApplyOperationsResult>;
    writeChapter(
      input: LongWriteChapterInput
    ): Promise<LongWriteChapterResult>;
    commitChapter(
      input: LongCommitChapterInput
    ): Promise<LongCommitChapterResult>;
    rollbackLastCommit(
      input: LongRollbackLastCommitInput
    ): Promise<LongRollbackLastCommitResult>;
    unregister(input: LongRemoveBookInput): Promise<LongRemoveBookResult>;
    delete(input: LongRemoveBookInput): Promise<LongRemoveBookResult>;
  };
  session: {
    prompt(payload: SessionPromptCommandPayload): Promise<SessionPromptAcceptedPayload>;
    abort(payload: SessionAbortCommandPayload): Promise<SessionAbortAcceptedPayload>;
  };
  models: {
    list(): Promise<ModelSettings>;
    refreshFree(): Promise<ModelSettings>;
    refreshOfficial(): Promise<ModelSettings>;
    queryOfficialBalance(): Promise<OfficialModelBalance>;
    saveOfficialToken(apiKey: string): Promise<ModelSettings>;
    clearOfficialToken(): Promise<ModelSettings>;
    setOfficialModelEnabled(modelId: string, enabled: boolean): Promise<ModelSettings>;
    save(settings: ModelSettingsInput): Promise<ModelSettings>;
    test(model: ModelConfigInput): Promise<ModelConnectionTestResult>;
    listRemote(input: RemoteModelListInput): Promise<RemoteModelListResult>;
  };
  modelUsage: {
    query(input?: ModelUsageQueryInput): Promise<ModelUsageDashboard>;
  };
  workspaceAgents: {
    list(workspaceType: WorkspaceType): Promise<WorkspaceAgentSettings>;
    save(settings: WorkspaceAgentSettingsInput): Promise<WorkspaceAgentSettings>;
    reset(
      workspaceType: WorkspaceType,
      agentId?: WorkspaceAgentId
    ): Promise<WorkspaceAgentSettings>;
  };
  longAgents: {
    list(): Promise<LongAgentSettings>;
    save(settings: LongAgentSettingsInput): Promise<LongAgentSettings>;
    reset(agentId?: LongAgentId): Promise<LongAgentSettings>;
  };
  longAgentTeams: {
    list(): Promise<LongAgentTeamSettings>;
    save(
      settings: LongAgentTeamSettingsInput
    ): Promise<LongAgentTeamSettings>;
  };
  agentTeams: {
    list(workspaceType: WorkspaceType): Promise<WorkspaceAgentTeamSettings>;
    save(
      settings: WorkspaceAgentTeamSettingsInput
    ): Promise<WorkspaceAgentTeamSettings>;
  };
  libraryAgents: {
    list(): Promise<LibraryAgentSettings>;
    save(settings: LibraryAgentSettingsInput): Promise<LibraryAgentSettings>;
    reset(domain?: LibraryAgentDomain): Promise<LibraryAgentSettings>;
  };
  learningImitationSettings: {
    list(): Promise<LearningImitationSettings>;
    save(settings: LearningImitationSettingsInput): Promise<LearningImitationSettings>;
    reset(stageId?: LearningImitationStageId): Promise<LearningImitationSettings>;
  };
  workspaceDirectory: {
    list(): Promise<WorkspaceDirectorySettings>;
    choose(): Promise<WorkspaceDirectorySettings | null>;
  };
  appearance: {
    list(): Promise<AppearanceSettingsSnapshot>;
    save(settings: AppearanceSettings): Promise<AppearanceSettingsSnapshot>;
  };
  generalSettings: {
    list(): Promise<GeneralSettingsSnapshot>;
    save(settings: GeneralSettings): Promise<GeneralSettingsSnapshot>;
  };
  manuscript: {
    exportLong(
      input: ExportLongManuscriptInput
    ): Promise<ExportLongManuscriptResult>;
    exportShort(
      input: ExportShortManuscriptInput
    ): Promise<ExportShortManuscriptResult>;
  };
  events: {
    subscribe(listener: (event: SystemEventEnvelope) => void): () => void;
  };
}
