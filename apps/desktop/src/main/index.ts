import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  session,
  shell,
  type OpenDialogOptions,
  type OpenDialogReturnValue
} from "electron";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { release } from "node:os";
import { join, resolve } from "node:path";
import {
  WorkspaceAgentTeamSettingsSchema,
  BookSchema,
  SaveDocumentResultSchema,
  CatalogDraftSectionSchema,
  CreateDraftSectionsResultSchema,
  CatalogDraftRecoverySaveResultSchema,
  CatalogDraftRecoverySchema,
  CatalogLibrarySchema,
  CatalogLibraryGroupSchema,
  CatalogLibraryEntrySchema,
  CatalogOpenProjectResultSchema,
  AppearanceSettingsSnapshotSchema,
  APP_ALERT_ACKNOWLEDGE_DESKTOP_CHANNEL,
  APP_ALERT_GET_CHANNEL,
  AppAlertDesktopRevisionSchema,
  AppAlertSnapshotSchema,
  CatalogIndexSnapshotSchema,
  CatalogReadDocumentResultSchema,
  CatalogSnapshotSchema,
  CommandEnvelopeSchema,
  DeleteCatalogProjectResultSchema,
  DeleteBookResultSchema,
  DeleteDraftSectionResultSchema,
  MoveDraftSectionResultSchema,
  DuplicateCatalogProjectResultSchema,
  ExportLongManuscriptResultSchema,
  ExportShortManuscriptResultSchema,
  ExternalSkillSelectionResultSchema,
  GeneralSettingsSnapshotSchema,
  IPC_COMMAND_CHANNEL,
  IPC_EVENT_CHANNEL,
  INKHUB_ASSETS_IPC_CHANNEL,
  INKHUB_MEDIA_IPC_CHANNEL,
  INKHUB_REPAIR_IPC_CHANNEL,
  INKHUB_STORY_KERNEL_IPC_CHANNEL,
  InkHubAssetsRequestSchema,
  InkHubCoverPlatformPresetSchema,
  InkHubCoverStyleSchema,
  InkHubGeneratedMediaSchema,
  InkHubIllustrationPlanSchema,
  InkHubMediaRequestSchema,
  InkHubAttachedSkillsSchema,
  InkHubNovelDocumentListSchema,
  InkHubNovelDocumentPreviewSchema,
  InkHubNovelSnapshotSchema,
  InkHubNovelChapterCatalogSchema,
  InkHubNovelChapterPageSchema,
  InkHubNovelChapterRepairResultSchema,
  InkHubNovelAiRepairPlanSchema,
  InkHubNovelAiRepairProgressSchema,
  InkHubNovelAiRepairTaskSchema,
  InkHubNovelBatchRepairResultSchema,
  InkHubRepairIpcRequestSchema,
  InkHubStoryKernelIpcRequestSchema,
  InkHubStoryStateSnapshotSchema,
  InkHubStoryReconstructionProgressSchema,
  InkHubStoryContinuationResultSchema,
  InkHubStoryForecastResultSchema,
  InkHubStoryForecastListSchema,
  InkHubNovelContextPacketSchema,
  InkHubNovelIndexSummarySchema,
  InkHubNovelQualityReportSchema,
  InkHubDeepQualityProgressSchema,
  InkHubDeepQualityReportSchema,
  InkHubDeepQualityTaskSchema,
  InkHubNovelReadingProgressSchema,
  InkHubNovelSearchResponseSchema,
  InkHubSkillPreviewSchema,
  InkHubSkillSnapshotSchema,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_STATE_EVENT_CHANNEL,
  LearningImitationSettingsSchema,
  MARKETPLACE_IPC_CHANNEL,
  MarketplaceIpcRequestSchema,
  MarketplaceSessionSchema,
  CatalogInstallMarketplaceSkillContentResultSchema,
  LibraryAgentSettingsSchema,
  LongApplyOperationsResultSchema,
  LongApplyLegacySyncResultSchema,
  LongAgentSettingsSchema,
  LongAgentTeamSettingsSchema,
  LongCommitChapterResultSchema,
  LongImportPortableResultSchema,
  LongChooseContinuationImportSourceResultSchema,
  LongImportContinuationResultSchema,
  LongPreviewContinuationImportAtPathResultSchema,
  LongPreviewLegacySyncAtPathResultSchema,
  LongChooseLegacySyncSourceResultSchema,
  LongListBooksResultSchema,
  LongOpenBookResultSchema,
  LongPreviewOperationsResultSchema,
  LongReadDocumentResultSchema,
  LongReadAgentsMdResultSchema,
  LongRemoveBookResultSchema,
  LongRollbackLastCommitResultSchema,
  LongSearchResultSchema,
  LongWorkspaceIndexResultSchema,
  LongWriteChapterResultSchema,
  LongWriteDocumentResultSchema,
  LongWriteAgentsMdResultSchema,
  ModelConnectionTestResultSchema,
  ModelSettingsSchema,
  RemoteModelListResultSchema,
  RendererStateLoadResultSchema,
  RendererStateMutationResultSchema,
  ModelUsageDashboardSchema,
  RemoveLibraryEntryResultSchema,
  MoveLibraryEntryResultSchema,
  SessionAbortAcceptedPayloadSchema,
  SessionPromptAcceptedPayloadSchema,
  ScriptBookSchema,
  ShortBookSchema,
  WorkspaceAgentSettingsSchema,
  SystemEventEnvelopeSchema,
  SystemHealthPayloadSchema,
  SystemReadyEventEnvelopeSchema,
  UnregisterCatalogProjectResultSchema,
  WorkspaceDirectorySettingsSchema,
  createDefaultAppearanceSettings,
  createDefaultGeneralSettings,
  createEnvelope,
  type AgentProviderRuntimeConfig,
  type AgentRuntimeRef,
  type AppearanceSettings,
  type AppAlertSnapshot,
  type CommandResult,
  type GeneralSettings,
  type ModelUsageModelSnapshot,
  type ModelUsageModule,
  type SessionPromptCommandPayload,
  type SystemEventEnvelope,
  type UpdateState,
  type UtilityWorkerName
} from "@deepwrite/contracts";
import { createId, nowIso } from "@deepwrite/shared";
import {
  LEGACY_LIBRARY_FILE_SELECTION_PROPERTIES,
  importLegacyLibraryArchives
} from "./legacy-library-import-batch";
import { AppearanceConfigStore } from "./appearance-config-store";
import { AgentTeamConfigStore } from "./agent-team-config-store";
import { GeneralSettingsStore } from "./general-settings-store";
import { ModelConfigStore } from "./model-config-store";
import { listRemoteModels } from "./list-remote-models";
import {
  createModelUsageRevisionId,
  ModelUsageStore
} from "./model-usage-store";
import { SoftwareTokenUsageReporter } from "./software-token-usage-reporter";
import { LearningImitationConfigStore } from "./learning-imitation-config-store";
import { LibraryAgentConfigStore } from "./library-agent-config-store";
import { LongAgentConfigStore } from "./long-agent-config-store";
import { LongAgentTeamConfigStore } from "./long-agent-team-config-store";
import {
  assertModelRunSettings,
  resolveModelRunSettings
} from "./model-run-settings";
import {
  applyNativeAppearanceChrome,
  resolveNativeBackgroundColor
} from "./native-appearance-chrome";
import { exportShortManuscript } from "./short-manuscript-export";
import { exportLongManuscript } from "./long-manuscript-export";
import {
  UtilityCommandTimeoutError,
  UtilitySupervisor
} from "./supervisor";
import {
  catalogCommandTimeoutMessage,
  catalogCommandTimeoutMs
} from "./catalog-command-timeout";
import {
  AGENT_CORE_LONG_QUERY_COMMANDS,
  authorizeMainInternalCommand,
  type MainInternalCommandActiveRun
} from "./internal-command-authorizer";
import { WorkspaceAgentConfigStore } from "./workspace-agent-config-store";
import { WorkspaceDirectoryStore } from "./workspace-directory-store";
import { SecurityScopedBookmarkStore } from "./security-scoped-bookmark-store";
import type { UpdateService } from "./update-service";
import { AppAlertStore } from "./app-alert-store";
import { MarketplaceClient } from "./marketplace-client";
import {
  CloudBackupService,
  registerCloudBackupIpc
} from "../extras/cloud-backup";
import { ContinuationImportPreviewRegistry } from "./continuation-import-preview-registry";
import { LegacySyncPreviewRegistry } from "./legacy-sync-preview-registry";
import { readExternalSkills } from "./external-skill-import";
import { createMainWindowStartupGate } from "./main-window-startup-gate";
import { runInkHubRendererAcceptance } from "./inkhub-renderer-acceptance";
import { resolveDeepWriteAppMode } from "./app-run-mode";
import { INKHUB_ACCEPTANCE_SKILL_DEFINITIONS, InkHubAssetStore } from "./inkhub-agent-skill-registry";
import { InkHubMediaService } from "./inkhub-media-service";
import {
  InkHubAiRepairService,
  type InkHubRepairModelRunner
} from "./inkhub-ai-repair-service";
import { InkHubAiRepairTaskStore } from "./inkhub-ai-repair-task-store";
import {
  InkHubDeepQualityCoordinator,
  type InkHubDeepQualityRunner
} from "./inkhub-deep-quality-coordinator";
import { InkHubDeepQualityTaskStore } from "./inkhub-deep-quality-task-store";
import {
  InkHubStoryKernelService,
  type InkHubStoryKernelModelRunner
} from "./inkhub-story-kernel-service";
import {
  resolveDevelopmentRendererUrl,
  trustedRendererUrl
} from "./renderer-security";

interface ActiveRun extends MainInternalCommandActiveRun {
  correlationId: string;
  runtime: AgentRuntimeRef;
  usageContext?: UsageRunContext;
}

interface UsageRunContext {
  module: ModelUsageModule;
  snapshotsByConfigId: ReadonlyMap<string, ModelUsageModelSnapshot>;
  snapshotsByRuntime: ReadonlyMap<string, ModelUsageModelSnapshot>;
}

const activeRuns = new Map<string, ActiveRun>();
const terminalRuns = new Set<string>();
const pendingUsageContexts = new Map<string, UsageRunContext>();
let smokeEventTap: ((event: SystemEventEnvelope) => void) | undefined;
let mainWindow: BrowserWindow | undefined;
let modelConfigStore: ModelConfigStore | undefined;
let modelUsageStore: ModelUsageStore | undefined;
let softwareTokenUsageReporter: SoftwareTokenUsageReporter | undefined;
let agentTeamConfigStore: AgentTeamConfigStore | undefined;
let appearanceConfigStore: AppearanceConfigStore | undefined;
let generalSettingsStore: GeneralSettingsStore | undefined;
let learningImitationConfigStore: LearningImitationConfigStore | undefined;
let libraryAgentConfigStore: LibraryAgentConfigStore | undefined;
let longAgentConfigStore: LongAgentConfigStore | undefined;
let longAgentTeamConfigStore: LongAgentTeamConfigStore | undefined;
let cachedAppearanceSettings: AppearanceSettings = createDefaultAppearanceSettings();
let cachedGeneralSettings: GeneralSettings = createDefaultGeneralSettings();
let nativeAppearanceListenerBound = false;
let workspaceAgentConfigStore: WorkspaceAgentConfigStore | undefined;
let workspaceDirectoryStore: WorkspaceDirectoryStore | undefined;
let securityScopedBookmarkStore: SecurityScopedBookmarkStore | undefined;
let quitting = false;
let shutdownComplete = false;
let menuBarTray: Tray | undefined;
type UpdateServiceContract = Pick<
  UpdateService,
  "getState" | "subscribe" | "check" | "download" | "install" | "quitAndInstall"
>;
let updateService: UpdateServiceContract | undefined;
let appAlertStore: AppAlertStore | undefined;
let marketplaceClient: MarketplaceClient | undefined;
let cloudBackupService: CloudBackupService | undefined;
let inkHubAssetStore: InkHubAssetStore | undefined;
let inkHubMediaService: InkHubMediaService | undefined;
let inkHubAiRepairService: InkHubAiRepairService | undefined;
let inkHubAiRepairTaskStore: InkHubAiRepairTaskStore | undefined;
let inkHubDeepQualityCoordinator: InkHubDeepQualityCoordinator | undefined;
let inkHubStoryKernelService: InkHubStoryKernelService | undefined;
let installUpdateAfterShutdown = false;
let exitProcessAfterShutdown = false;
const INKHUB_EXTERNAL_SERVICES_ENABLED = false;
const RENDERER_DRAFT_FLUSH_GRACE_MS = 500;
const continuationImportPreviews = new ContinuationImportPreviewRegistry();
const legacySyncPreviews = new LegacySyncPreviewRegistry();
const mainWindowStartupGate = createMainWindowStartupGate(() => showMainWindow());

const isMacAppStoreBuild = process.platform === "darwin" && process.mas === true;

function createMacAppStoreUpdateService(): UpdateServiceContract {
  const unsupportedState = (): UpdateState => ({
    status: "unsupported",
    currentVersion: app.getVersion(),
    releaseNotes: [],
    mandatory: false,
    canDownload: false,
    canInstall: false,
    message: "Mac App Store 版本由 App Store 统一更新。"
  });
  return {
    getState: unsupportedState,
    subscribe: () => () => undefined,
    check: async () => unsupportedState(),
    download: async () => unsupportedState(),
    install: () => {
      throw new Error("Mac App Store 版本由 App Store 统一更新。");
    },
    quitAndInstall: () => undefined
  };
}

async function showOpenDialogWithBookmarks(
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  const selection = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, {
        ...options,
        ...(isMacAppStoreBuild ? { securityScopedBookmarks: true } : {})
      })
    : await dialog.showOpenDialog({
        ...options,
        ...(isMacAppStoreBuild ? { securityScopedBookmarks: true } : {})
      });
  if (isMacAppStoreBuild && !selection.canceled && selection.filePaths.length) {
    if (!securityScopedBookmarkStore) {
      throw new Error("Mac App Store 安全作用域书签存储尚未初始化。");
    }
    await securityScopedBookmarkStore.registerSelection(
      selection.filePaths,
      selection.bookmarks
    );
  }
  return selection;
}

function requiresMacOs26ExitWorkaround(): boolean {
  return process.platform === "darwin" && release().split(".")[0] === "25";
}

function forceExitAfterVerifiedShutdown(): void {
  if (process.env.DEEPWRITE_SMOKE === "1") {
    console.log("DEEPWRITE_SMOKE_SHUTDOWN_OK");
  }
  if (process.env.INKHUB_ACCEPTANCE === "1") {
    console.log("INKHUB_ACCEPTANCE_SHUTDOWN_OK");
  }
  process.kill(process.pid, "SIGKILL");
}

function broadcastEvent(event: SystemEventEnvelope): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_EVENT_CHANNEL, event);
    }
  }
}

function beginGracefulShutdown(options: { installUpdate?: boolean; exitProcess?: boolean } = {}): void {
  installUpdateAfterShutdown ||= options.installUpdate === true;
  exitProcessAfterShutdown ||= options.exitProcess === true;
  if (quitting) {
    if (shutdownComplete && installUpdateAfterShutdown && updateService) {
      updateService.quitAndInstall();
    }
    return;
  }
  quitting = true;
  destroyMenuBarTray();
  setTimeout(() => {
    void (async () => {
      try {
        await supervisor.shutdownAll();
      } catch (error: unknown) {
        console.warn(
          "InkHub utilities did not shut down cleanly:",
          error instanceof Error ? error.message : "unknown error"
        );
      } finally {
        try {
          await modelUsageStore?.flush();
        } catch (error: unknown) {
          console.warn(
            "InkHub model usage records could not finish flushing:",
            error instanceof Error ? error.message : "unknown error"
          );
        }
        try {
          await softwareTokenUsageReporter?.reportBeforeShutdown();
        } catch {
          console.warn("InkHub software token usage was not reported before shutdown.");
        }
        securityScopedBookmarkStore?.releaseAll();
        shutdownComplete = true;
        if (!installUpdateAfterShutdown && requiresMacOs26ExitWorkaround()) {
          forceExitAfterVerifiedShutdown();
        } else if (exitProcessAfterShutdown) {
          app.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
        } else if (installUpdateAfterShutdown && updateService) {
          updateService.quitAndInstall();
        } else {
          app.quit();
        }
      }
    })();
  }, RENDERER_DRAFT_FLUSH_GRACE_MS);
}

type AgentEventEnvelope = Extract<
  SystemEventEnvelope,
  {
    type:
      | "agent.evaluation_snapshot"
      | "agent.turn_started"
      | "agent.retry_scheduled"
      | "agent.message_delta"
      | "agent.thinking_delta"
      | "agent.message_completed"
      | "agent.usage_observed"
      | "agent.error"
      | "tool.call_stream"
      | "tool.call_requested"
      | "tool.execution_completed"
      | "learning_imitation.result_updated"
      | "subagent_authoring.draft_updated"
      | "library.editor_mutation"
      | "workspace.editor_mutation"
      | "workspace.stage_selection"
      | "long.mutation_proposal"
      | "long.chapter_write_proposal"
      | "long.chapter_dispatch_proposal"
      | "long.ledger_commit_proposal"
      | "subagent.started"
      | "subagent.activity"
      | "subagent.completed";
  }
>;

function isAgentEvent(event: SystemEventEnvelope): event is AgentEventEnvelope {
  return (
    event.type === "agent.evaluation_snapshot" ||
    event.type === "agent.turn_started" ||
    event.type === "agent.retry_scheduled" ||
    event.type === "agent.message_delta" ||
    event.type === "agent.thinking_delta" ||
    event.type === "agent.message_completed" ||
    event.type === "agent.usage_observed" ||
    event.type === "agent.error" ||
    event.type === "tool.call_stream" ||
    event.type === "tool.call_requested" ||
    event.type === "tool.execution_completed" ||
    event.type === "learning_imitation.result_updated" ||
    event.type === "subagent_authoring.draft_updated" ||
    event.type === "library.editor_mutation" ||
    event.type === "workspace.editor_mutation" ||
    event.type === "workspace.stage_selection" ||
    event.type === "long.mutation_proposal" ||
    event.type === "long.chapter_write_proposal" ||
    event.type === "long.chapter_dispatch_proposal" ||
    event.type === "long.ledger_commit_proposal" ||
    event.type === "subagent.started" ||
    event.type === "subagent.activity" ||
    event.type === "subagent.completed"
  );
}

function rememberTerminalRun(runId: string): void {
  terminalRuns.add(runId);
  while (terminalRuns.size > 2_000) {
    const oldest = terminalRuns.values().next().value as string | undefined;
    if (!oldest) {
      return;
    }
    terminalRuns.delete(oldest);
  }
}

function recordUsageObservation(
  event: Extract<SystemEventEnvelope, { type: "agent.usage_observed" }>
): void {
  if (!modelUsageStore || event.payload.runtime.mode === "local-faux") return;
  const activeRun = activeRuns.get(event.payload.runId);
  const usageContext =
    activeRun?.usageContext ??
    pendingUsageContexts.get(event.context.correlationId);
  const snapshot = usageSnapshotForRuntime(usageContext, event.payload.runtime);
  void modelUsageStore
    .record({
      id: `v2:${event.payload.observationId}`,
      occurredAt: event.payload.observedAt,
      model: snapshot,
      module: usageContext?.module ?? "unknown",
      actor: event.payload.subagentRunId ? "subagent" : "main-agent",
      status: event.payload.status,
      usage: event.payload.usage
    })
    .catch((error: unknown) => {
      console.warn(
        "InkHub model usage record was not persisted:",
        error instanceof Error ? error.message : "unknown error"
      );
    });
}

function handleUtilityEvent(event: SystemEventEnvelope, worker: UtilityWorkerName): void {
  if (isAgentEvent(event) && worker !== "agent") {
    return;
  }

  const validated = SystemEventEnvelopeSchema.parse(event) as SystemEventEnvelope;
  if (validated.type === "agent.usage_observed") {
    recordUsageObservation(validated);
    return;
  }
  if (isAgentEvent(validated)) {
    const runId = validated.payload.runId;
    if (validated.type === "agent.message_completed" || validated.type === "agent.error") {
      const activeRun = activeRuns.get(runId);
      rememberTerminalRun(runId);
      activeRuns.delete(runId);
      pendingUsageContexts.delete(
        activeRun?.correlationId ?? validated.context.correlationId
      );
    } else if (!terminalRuns.has(runId) && !activeRuns.has(runId)) {
      const usageContext = pendingUsageContexts.get(validated.context.correlationId);
      activeRuns.set(runId, {
        sessionId: validated.payload.sessionId,
        correlationId: validated.context.correlationId,
        runtime: validated.payload.runtime,
        accepted: false,
        ...(usageContext ? { usageContext } : {})
      });
    }
  }
  smokeEventTap?.(validated);
  broadcastEvent(validated);
}

function handleUnexpectedExit(worker: UtilityWorkerName, reason: string): void {
  if (worker === "agent") {
    for (const [runId, run] of activeRuns) {
      const event = SystemEventEnvelopeSchema.parse(
        createEnvelope(
          "agent.error",
          {
            sessionId: run.sessionId,
            runId,
            code: "agent.utility_exited",
            message: "Agent Utility 意外退出，本轮对话已终止。",
            details: { reason },
            runtime: run.runtime
          },
          {
            id: createId("evt"),
            context: {
              correlationId: run.correlationId,
              sessionId: run.sessionId,
              runId
            }
          }
        )
      ) as SystemEventEnvelope;
      rememberTerminalRun(runId);
      smokeEventTap?.(event);
      broadcastEvent(event);
    }
    activeRuns.clear();
    pendingUsageContexts.clear();
  }

  broadcastEvent(
    SystemEventEnvelopeSchema.parse(
      createEnvelope(
        "system.worker_restarting",
        { worker, reason, detectedAt: nowIso() },
        { id: createId("evt_restarting") }
      )
    ) as SystemEventEnvelope
  );
}

function handleWorkerRestarted(worker: UtilityWorkerName, reason: string): void {
  broadcastEvent(
    SystemEventEnvelopeSchema.parse(
      createEnvelope(
        "system.worker_restarted",
        { worker, reason, restartedAt: nowIso() },
        { id: createId("evt_restarted") }
      )
    ) as SystemEventEnvelope
  );
}

const supervisor = new UtilitySupervisor({
  onUtilityEvent: handleUtilityEvent,
  onUnexpectedExit: handleUnexpectedExit,
  onWorkerRestarted: handleWorkerRestarted,
  internalCommandAllowlist: {
    core: AGENT_CORE_LONG_QUERY_COMMANDS
  },
  internalCommandAuthorize: (context) =>
    authorizeMainInternalCommand(context, activeRuns)
});

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function createMainWindow(): BrowserWindow {
  const isDarwin = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1560,
    height: 940,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    backgroundColor: resolveNativeBackgroundColor(cachedAppearanceSettings),
    title: "墨枢",
    icon: join(__dirname, "../../build/icon.png"),
    ...(isDarwin
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 14, y: 10 }
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  const windowWebContentsId = window.webContents.id;

  applyNativeAppearanceChrome(cachedAppearanceSettings, [window]);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url === window.webContents.getURL()) {
      return;
    }
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  if (process.env.DEEPWRITE_SMOKE !== "1" && process.env.INKHUB_ACCEPTANCE !== "1") {
    window.once("ready-to-show", () => window.show());
  }

  const rendererFilePath = join(__dirname, "../renderer/index.html");
  const rendererUrl = app.isPackaged
    ? null
    : resolveDevelopmentRendererUrl(process.env.ELECTRON_RENDERER_URL);
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(rendererFilePath);
  }

  window.webContents.once("did-finish-load", () => void announceReady(window));
  window.on("close", (event) => {
    if (
      cachedGeneralSettings.showInMenuBar &&
      !quitting &&
      !shutdownComplete
    ) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    continuationImportPreviews.clearForWebContents(windowWebContentsId);
    legacySyncPreviews.clearForWebContents(windowWebContentsId);
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });
  return window;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function destroyMenuBarTray(): void {
  menuBarTray?.destroy();
  menuBarTray = undefined;
}

function syncMenuBarTray(): void {
  if (!cachedGeneralSettings.showInMenuBar) {
    destroyMenuBarTray();
    return;
  }
  if (menuBarTray && !menuBarTray.isDestroyed()) {
    return;
  }

  const rendererIconPath = join(__dirname, "../renderer/app-icon.png");
  const buildIconPath = join(__dirname, "../../build/icon.png");
  const sourceIcon = existsSync(rendererIconPath)
    ? rendererIconPath
    : buildIconPath;
  let trayIcon = nativeImage.createFromPath(sourceIcon);
  if (process.platform === "darwin" && !trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 18, height: 18 });
    trayIcon.setTemplateImage(true);
  }
  menuBarTray = new Tray(trayIcon);
  menuBarTray.setToolTip("墨枢");
  menuBarTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示墨枢",
        click: showMainWindow
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => app.quit()
      }
    ])
  );
  menuBarTray.on("click", showMainWindow);
}

function syncGeneralSettings(settings: GeneralSettings): void {
  cachedGeneralSettings = settings;
  syncMenuBarTray();
}

function safeErrorDetails(error: unknown): Record<string, unknown> {
  return { kind: error instanceof Error ? error.name : "unknown" };
}

function extractCommandRequestId(rawCommand: unknown): string {
  if (
    rawCommand &&
    typeof rawCommand === "object" &&
    "id" in rawCommand &&
    typeof (rawCommand as { id: unknown }).id === "string"
  ) {
    const requestId = (rawCommand as { id: string }).id.trim();
    if (requestId) {
      return requestId;
    }
  }
  return "unknown";
}

function summarizeCommandValidationIssues(
  issues: readonly { path: PropertyKey[]; message: string }[]
): Record<string, unknown> {
  const preview = issues.slice(0, 3).map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message
  }));
  return {
    issueCount: issues.length,
    issues: preview
  };
}

function requireModelConfigStore(): ModelConfigStore {
  if (!modelConfigStore) {
    throw new Error("模型配置存储尚未初始化。");
  }
  return modelConfigStore;
}

function requireModelUsageStore(): ModelUsageStore {
  if (!modelUsageStore) {
    throw new Error("模型用量存储尚未初始化。");
  }
  return modelUsageStore;
}

function usageRuntimeKey(runtime: Pick<AgentRuntimeRef, "provider" | "model">): string {
  return `${runtime.provider}\u0000${runtime.model}`;
}

function usageEndpointOrigin(baseUrl: string): string {
  if (!baseUrl) return "";
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "";
  }
}

function createUsageModelSnapshot(
  runtime: AgentRuntimeRef,
  config?: AgentProviderRuntimeConfig
): ModelUsageModelSnapshot {
  const provider = config?.provider ?? runtime.provider;
  const modelId = config?.modelId ?? runtime.model;
  const api = config?.api;
  const endpointOrigin = config ? usageEndpointOrigin(config.baseUrl) : "";
  const revisionId = config
    ? createModelUsageRevisionId(config)
    : createHash("sha256")
        .update(JSON.stringify({ provider, modelId, api: api ?? "", endpointOrigin }))
        .digest("hex");
  const configId =
    config?.id ??
    runtime.configId ??
    `runtime:${provider}:${modelId}`;
  return {
    configId,
    revisionId,
    label: config?.label ?? modelId,
    provider,
    modelId,
    ...(api ? { api } : {}),
    ...(config?.managedBy ? { managedBy: config.managedBy } : {})
  };
}

function usageModuleForPrompt(payload: SessionPromptCommandPayload): ModelUsageModule {
  const context = payload.workspaceContext;
  if (!context) return "unknown";
  if (context.shortWorkspace) return "short-writing";
  if (context.scriptWorkspace) return "script-writing";
  if (context.longWorkspace) return "long-writing";
  if (context.libraryWorkspace) {
    return context.libraryWorkspace.domain === "skill"
      ? "skill-library"
      : "material-library";
  }
  if (context.learningImitation) return "learning-imitation";
  if (context.subagentAuthoring) return "subagent-authoring";
  return "unknown";
}

function createUsageRunContext(
  payload: SessionPromptCommandPayload,
  runtimeConfig: AgentProviderRuntimeConfig | undefined,
  subagentRuntimeConfigs: Readonly<Record<string, AgentProviderRuntimeConfig>>
): UsageRunContext {
  const snapshotsByConfigId = new Map<string, ModelUsageModelSnapshot>();
  const snapshotsByRuntime = new Map<string, ModelUsageModelSnapshot>();
  const add = (config: AgentProviderRuntimeConfig | undefined): void => {
    if (!config) return;
    const runtime: AgentRuntimeRef = {
      provider: config.provider,
      model: config.modelId,
      mode: "provider",
      configId: config.id
    };
    const snapshot = createUsageModelSnapshot(runtime, config);
    snapshotsByConfigId.set(config.id, snapshot);
    snapshotsByRuntime.set(usageRuntimeKey(runtime), snapshot);
  };
  add(runtimeConfig);
  for (const config of Object.values(subagentRuntimeConfigs)) {
    add(config);
  }
  return {
    module: usageModuleForPrompt(payload),
    snapshotsByConfigId,
    snapshotsByRuntime
  };
}

function usageSnapshotForRuntime(
  context: UsageRunContext | undefined,
  runtime: AgentRuntimeRef
): ModelUsageModelSnapshot {
  const byConfigId = runtime.configId
    ? context?.snapshotsByConfigId.get(runtime.configId)
    : undefined;
  return (
    byConfigId ??
    context?.snapshotsByRuntime.get(usageRuntimeKey(runtime)) ??
    createUsageModelSnapshot(runtime)
  );
}

function requireWorkspaceAgentConfigStore(): WorkspaceAgentConfigStore {
  if (!workspaceAgentConfigStore) {
    throw new Error("创作空间智能体设置存储尚未初始化。");
  }
  return workspaceAgentConfigStore;
}

function requireAgentTeamConfigStore(): AgentTeamConfigStore {
  if (!agentTeamConfigStore) {
    throw new Error("智能体团队设置存储尚未初始化。");
  }
  return agentTeamConfigStore;
}

function requireLibraryAgentConfigStore(): LibraryAgentConfigStore {
  if (!libraryAgentConfigStore) {
    throw new Error("资料库智能体设置存储尚未初始化。");
  }
  return libraryAgentConfigStore;
}

function requireLongAgentConfigStore(): LongAgentConfigStore {
  if (!longAgentConfigStore) {
    throw new Error("长篇智能体设置存储尚未初始化。");
  }
  return longAgentConfigStore;
}

function requireLongAgentTeamConfigStore(): LongAgentTeamConfigStore {
  if (!longAgentTeamConfigStore) {
    throw new Error("长篇智能体团队设置存储尚未初始化。");
  }
  return longAgentTeamConfigStore;
}

function requireLearningImitationConfigStore(): LearningImitationConfigStore {
  if (!learningImitationConfigStore) {
    throw new Error("学习仿写设置存储尚未初始化。");
  }
  return learningImitationConfigStore;
}

function requireWorkspaceDirectoryStore(): WorkspaceDirectoryStore {
  if (!workspaceDirectoryStore) {
    throw new Error("工作目录配置存储尚未初始化。");
  }
  return workspaceDirectoryStore;
}

function requireAppearanceConfigStore(): AppearanceConfigStore {
  if (!appearanceConfigStore) {
    throw new Error("外观设置存储尚未初始化。");
  }
  return appearanceConfigStore;
}

function requireGeneralSettingsStore(): GeneralSettingsStore {
  if (!generalSettingsStore) {
    throw new Error("常规设置存储尚未初始化。");
  }
  return generalSettingsStore;
}

function syncNativeAppearanceChrome(settings: AppearanceSettings): void {
  cachedAppearanceSettings = settings;
  applyNativeAppearanceChrome(settings);
  if (!nativeAppearanceListenerBound) {
    nativeAppearanceListenerBound = true;
    nativeTheme.on("updated", () => {
      if (cachedAppearanceSettings.mode === "system") {
        applyNativeAppearanceChrome(cachedAppearanceSettings);
      }
    });
  }
}

async function loadAndSyncNativeAppearanceChrome(): Promise<void> {
  try {
    const snapshot = await requireAppearanceConfigStore().list();
    syncNativeAppearanceChrome(snapshot.settings);
  } catch {
    syncNativeAppearanceChrome(createDefaultAppearanceSettings());
  }
}

async function chooseWorkspaceDirectory(): Promise<
  ReturnType<typeof WorkspaceDirectorySettingsSchema.parse> | null
> {
  const current = await requireWorkspaceDirectoryStore().list();
  const selection = await showOpenDialogWithBookmarks({
    title: "选择墨枢工作目录",
    defaultPath: current.path ?? app.getPath("documents"),
    properties: ["openDirectory", "createDirectory"]
  });
  const selectedDirectory = selection.filePaths[0];
  if (selection.canceled || !selectedDirectory) {
    return null;
  }
  return WorkspaceDirectorySettingsSchema.parse(
    await requireWorkspaceDirectoryStore().save(selectedDirectory)
  );
}

async function requireSelectedWorkspaceDirectory(): Promise<string | null> {
  const current = await requireWorkspaceDirectoryStore().list();
  if (current.path) {
    return current.path;
  }
  return (await chooseWorkspaceDirectory())?.path ?? null;
}

function workspaceResourceParent(
  workspaceDirectory: string,
  domain: "book" | "material" | "skill"
): string {
  return join(
    workspaceDirectory,
    domain === "book" ? "books" : domain === "material" ? "materials" : "skills"
  );
}

function workspaceGroupParent(
  workspaceDirectory: string,
  domain: "material" | "skill"
): string {
  return join(
    workspaceDirectory,
    domain === "material" ? "material-groups" : "skill-groups"
  );
}

function configureCatalogEnvironment(): string {
  const userDataPath = app.getPath("userData");
  process.env.DEEPWRITE_USER_DATA_PATH = userDataPath;
  process.env.DEEPWRITE_APP_MODE = resolveDeepWriteAppMode(
    import.meta.env.MAIN_VITE_DEEPWRITE_APP_MODE
  );

  const currentLegacyRoot = join(
    app.getPath("home"),
    "Library",
    "Application Support",
    "InkHub",
    ".data"
  );
  const configuredProjectRoot =
    process.env.DEEPWRITE_LEGACY_PROJECT_DATA_ROOT?.trim();
  const repositoryCandidates = [
    ...(configuredProjectRoot ? [resolve(configuredProjectRoot)] : []),
    join(app.getPath("home"), "project", "openwrite", "write-claw", ".data"),
    resolve(process.cwd(), "../openwrite/write-claw/.data"),
    resolve(app.getAppPath(), "../../../openwrite/write-claw/.data")
  ];
  const repositoryFallback =
    repositoryCandidates.find((candidate) => existsSync(candidate)) ??
    repositoryCandidates[0]!;
  const legacyDataRoots = [
    ...(existsSync(currentLegacyRoot) ? [currentLegacyRoot] : []),
    ...(existsSync(repositoryFallback) ? [repositoryFallback] : [])
  ].filter((root, index, roots) => roots.indexOf(root) === index);
  if (legacyDataRoots.length > 0) {
    process.env.DEEPWRITE_LEGACY_DATA_ROOT = legacyDataRoots[0];
    process.env.DEEPWRITE_LEGACY_DATA_ROOTS = JSON.stringify(legacyDataRoots);
  } else {
    delete process.env.DEEPWRITE_LEGACY_DATA_ROOT;
    delete process.env.DEEPWRITE_LEGACY_DATA_ROOTS;
  }
  return userDataPath;
}

function registerIpc(): void {
  const isTrustedRendererEvent = (event: Electron.IpcMainInvokeEvent): boolean => {
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      !event.senderFrame ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      return false;
    }
    return trustedRendererUrl({
      candidateUrl: event.senderFrame.url,
      packaged: app.isPackaged,
      rendererFilePath: join(__dirname, "../renderer/index.html"),
      developmentUrl: process.env.ELECTRON_RENDERER_URL
    });
  };
  const requireInkHubAssetStore = (
    event: Electron.IpcMainInvokeEvent
  ): InkHubAssetStore => {
    if (
      !isTrustedRendererEvent(event)
    ) {
      throw new Error("墨枢资产 IPC 请求来源无效。");
    }
    if (!inkHubAssetStore) throw new Error("墨枢资产服务尚未初始化。");
    return inkHubAssetStore;
  };
  ipcMain.handle(
    INKHUB_ASSETS_IPC_CHANNEL,
    async (event, rawRequest: unknown): Promise<unknown> => {
      const request = InkHubAssetsRequestSchema.parse(rawRequest);
      const store = requireInkHubAssetStore(event);
      switch (request.operation) {
        case "listNovels":
          return InkHubNovelSnapshotSchema.parse(await store.listNovels());
        case "chooseNovelRoot": {
          const selection = await showOpenDialogWithBookmarks({
            title: "添加小说目录",
            defaultPath: join(app.getPath("home"), "Desktop", "小说"),
            buttonLabel: "引用此目录",
            properties: ["openDirectory"]
          });
          const selectedPath = selection.filePaths[0];
          if (selection.canceled || !selectedPath) return null;
          return InkHubNovelSnapshotSchema.parse(
            await store.addNovelRoot(selectedPath)
          );
        }
        case "removeNovelRoot":
          return InkHubNovelSnapshotSchema.parse(
            await store.removeNovelRoot(request.rootId)
          );
        case "listNovelDocuments":
          return InkHubNovelDocumentListSchema.parse(
            await store.listNovelDocuments(request.entryId)
          );
        case "readNovelDocument":
          return InkHubNovelDocumentPreviewSchema.parse(
            await store.readNovelDocument(
              request.entryId,
              request.relativePath
            )
          );
        case "getNovelIndex":
          return InkHubNovelIndexSummarySchema.parse(
            await store.getNovelIndex(request.entryId, request.verifyFreshness)
          );
        case "buildNovelIndex":
          return InkHubNovelIndexSummarySchema.parse(
            await store.buildNovelIndex(request.entryId)
          );
        case "listNovelChapters":
          return InkHubNovelChapterCatalogSchema.parse(
            await store.listNovelChapters(request.entryId, request.offset, request.limit)
          );
        case "readNovelChapter":
          return InkHubNovelChapterPageSchema.parse(
            await store.readNovelChapter(request.entryId, request.chapterId, request.offset, request.limit)
          );
        case "searchNovel":
          return InkHubNovelSearchResponseSchema.parse(
            await store.searchNovel(request.entryId, request.query, request.limit)
          );
        case "runNovelQualityCheck":
          return InkHubNovelQualityReportSchema.parse(await store.runNovelQualityCheck(request.entryId));
        case "applyNovelChapterRepair":
          return InkHubNovelChapterRepairResultSchema.parse(
            await store.applyNovelChapterRepair({
              entryId: request.entryId, chapterId: request.chapterId,
              expectedSourceRevision: request.expectedSourceRevision, content: request.content,
              confirmWrite: request.confirmWrite })
          );
        case "createNovelContext":
          return InkHubNovelContextPacketSchema.parse(await store.createNovelContext(request.entryId, request.purpose));
        case "getNovelReadingProgress": {
          const progress = await store.getNovelReadingProgress(request.entryId);
          return progress === null ? null : InkHubNovelReadingProgressSchema.parse(progress);
        }
        case "saveNovelReadingProgress":
          return InkHubNovelReadingProgressSchema.parse(
            await store.saveNovelReadingProgress({
              entryId: request.entryId,
              chapterId: request.chapterId,
              characterOffset: request.characterOffset,
              scrollFraction: request.scrollFraction
            })
          );
        case "revealNovel":
          shell.showItemInFolder(await store.getNovelPath(request.entryId));
          return undefined;
        case "listSkills":
          return InkHubSkillSnapshotSchema.parse(await store.listSkills());
        case "installSkills":
          return InkHubSkillSnapshotSchema.parse(await store.installSkills());
        case "setSkillEnabled":
          return InkHubSkillSnapshotSchema.parse(
            await store.setSkillEnabled(request.skillId, request.enabled)
          );
        case "readSkill":
          return InkHubSkillPreviewSchema.parse(
            await store.readSkill(request.skillId)
          );
        case "attachedSkills":
          return InkHubAttachedSkillsSchema.parse(await store.attachedSkills());
      }
    }
  );
  ipcMain.handle(
    INKHUB_MEDIA_IPC_CHANNEL,
    async (event, rawRequest: unknown): Promise<unknown> => {
      if (!isTrustedRendererEvent(event)) {
        throw new Error("墨枢媒体 IPC 请求来源无效。");
      }
      if (!inkHubMediaService || !inkHubAssetStore) throw new Error("墨枢媒体服务尚未初始化。");
      const request = InkHubMediaRequestSchema.parse(rawRequest);
      switch (request.operation) {
        case "listCoverPresets":
          return inkHubMediaService.listCoverPresets().map((preset) => InkHubCoverPlatformPresetSchema.parse(preset));
        case "listCoverStyles":
          return inkHubMediaService.listCoverStyles().map((style) => InkHubCoverStyleSchema.parse(style));
        case "planIllustrations":
          return InkHubIllustrationPlanSchema.parse(
            await inkHubAssetStore.planIllustrations(request.entryId, request.count)
          );
        case "generateCover":
          return InkHubGeneratedMediaSchema.parse(await inkHubMediaService.generateCover(request));
        case "generateIllustration":
          return InkHubGeneratedMediaSchema.parse(await inkHubMediaService.generateIllustration(request));
        case "revealMedia":
          shell.showItemInFolder(await inkHubAssetStore.assertMediaPath(request.entryId, request.path));
          return undefined;
      }
    }
  );
  ipcMain.handle(
    INKHUB_REPAIR_IPC_CHANNEL,
    async (event, rawRequest: unknown): Promise<unknown> => {
      if (!isTrustedRendererEvent(event)) {
        throw new Error("墨枢 AI 修复 IPC 请求来源无效。");
      }
      if (!inkHubAiRepairService || !inkHubAiRepairTaskStore || !inkHubDeepQualityCoordinator || !inkHubAssetStore) {
        throw new Error("墨枢 AI 修复服务尚未初始化。");
      }
      const request = InkHubRepairIpcRequestSchema.parse(rawRequest);
      switch (request.operation) {
        case "getNovelDeepQualityProgress": {
          const progress = inkHubDeepQualityCoordinator.getProgress(request.entryId);
          return progress === null ? null : InkHubDeepQualityProgressSchema.parse(progress);
        }
        case "getNovelDeepQualityTask": {
          const task = inkHubDeepQualityCoordinator.getTask(request.entryId);
          return task === null ? null : InkHubDeepQualityTaskSchema.parse(task);
        }
        case "runNovelDeepQuality":
          return InkHubDeepQualityReportSchema.parse(
            await inkHubDeepQualityCoordinator.run(request.input)
          );
        case "resumeNovelDeepQuality":
          return InkHubDeepQualityReportSchema.parse(
            await inkHubDeepQualityCoordinator.resume(request.input)
          );
        case "cancelNovelDeepQuality":
          return InkHubDeepQualityTaskSchema.parse(
            inkHubDeepQualityCoordinator.cancel(request.input)
          );
        case "getNovelAiRepairProgress": {
          const progress = inkHubAiRepairService.getProgress(request.entryId);
          return progress === null ? null : InkHubNovelAiRepairProgressSchema.parse(progress);
        }
        case "getNovelAiRepairTask": {
          const task = inkHubAiRepairService.getTask(request.entryId);
          return task === null ? null : InkHubNovelAiRepairTaskSchema.parse(task);
        }
        case "generateNovelAiRepairs":
          return InkHubNovelAiRepairPlanSchema.parse(
            await inkHubAiRepairService.generate(request.input)
          );
        case "resumeNovelAiRepairs":
          return InkHubNovelAiRepairPlanSchema.parse(
            await inkHubAiRepairService.resume(request.input)
          );
        case "cancelNovelAiRepairs":
          return InkHubNovelAiRepairTaskSchema.parse(
            inkHubAiRepairService.cancel(request.input)
          );
        case "applyNovelChapterRepairs": {
          const result = await inkHubAssetStore.applyNovelChapterRepairs(request.input);
          inkHubAiRepairTaskStore.consume(request.input.entryId);
          return InkHubNovelBatchRepairResultSchema.parse(result);
        }
      }
    }
  );
  ipcMain.handle(
    INKHUB_STORY_KERNEL_IPC_CHANNEL,
    async (event, rawRequest: unknown): Promise<unknown> => {
      if (!isTrustedRendererEvent(event)) throw new Error("墨枢创作内核 IPC 请求来源无效。");
      if (!inkHubStoryKernelService) throw new Error("墨枢创作内核服务尚未初始化。");
      const request = InkHubStoryKernelIpcRequestSchema.parse(rawRequest);
      switch (request.operation) {
        case "getStoryState":
          return InkHubStoryStateSnapshotSchema.parse(await inkHubStoryKernelService.getState(request.entryId));
        case "getStoryReconstructionProgress": {
          const progress = inkHubStoryKernelService.getProgress(request.entryId);
          return progress === null ? null : InkHubStoryReconstructionProgressSchema.parse(progress);
        }
        case "reconstructStoryState":
          return InkHubStoryStateSnapshotSchema.parse(await inkHubStoryKernelService.reconstruct(request.input));
        case "generateStoryContinuation":
          return InkHubStoryContinuationResultSchema.parse(await inkHubStoryKernelService.generateContinuation(request.input));
        case "generateStoryForecast":
          return InkHubStoryForecastResultSchema.parse(await inkHubStoryKernelService.generateForecast(request.input));
        case "listStoryForecasts":
          return InkHubStoryForecastListSchema.parse(await inkHubStoryKernelService.listForecasts(request.entryId));
      }
    }
  );
  const requireUpdateService = (event: Electron.IpcMainInvokeEvent): UpdateServiceContract => {
    if (
      !isTrustedRendererEvent(event)
    ) {
      throw new Error("IPC update request sender is not the active InkHub window.");
    }
    if (!updateService) throw new Error("更新服务尚未初始化。");
    return updateService;
  };
  ipcMain.handle(UPDATE_GET_STATE_CHANNEL, (event): UpdateState =>
    requireUpdateService(event).getState()
  );
  ipcMain.handle(UPDATE_CHECK_CHANNEL, (event): Promise<UpdateState> =>
    requireUpdateService(event).check()
  );
  ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, (event): Promise<UpdateState> =>
    requireUpdateService(event).download()
  );
  ipcMain.handle(UPDATE_INSTALL_CHANNEL, (event): void => {
    requireUpdateService(event).install();
  });
  const requireAppAlertStore = (
    event: Electron.IpcMainInvokeEvent
  ): AppAlertStore => {
    if (
      !isTrustedRendererEvent(event)
    ) {
      throw new Error("IPC app alert request sender is not the active InkHub window.");
    }
    if (!appAlertStore) throw new Error("提醒服务尚未初始化。");
    return appAlertStore;
  };
  ipcMain.handle(APP_ALERT_GET_CHANNEL, async (event): Promise<AppAlertSnapshot> =>
    AppAlertSnapshotSchema.parse(await requireAppAlertStore(event).getSnapshot())
  );
  ipcMain.handle(
    APP_ALERT_ACKNOWLEDGE_DESKTOP_CHANNEL,
    async (event, rawRevision: unknown): Promise<void> => {
      const revision = AppAlertDesktopRevisionSchema.parse(rawRevision);
      await requireAppAlertStore(event).acknowledgeDesktop(revision);
    }
  );

  ipcMain.handle(
    MARKETPLACE_IPC_CHANNEL,
    async (event, rawRequest: unknown): Promise<unknown> => {
      if (
        !isTrustedRendererEvent(event)
      ) {
        throw new Error("技能广场 IPC 请求来源无效。");
      }
      const request = MarketplaceIpcRequestSchema.parse(rawRequest);
      if (!marketplaceClient) {
        if (request.operation === "session" || request.operation === "logout") {
          return MarketplaceSessionSchema.parse({
            authenticated: false,
            persistent: false,
            insecureTransport: false
          });
        }
        throw new Error("墨枢本地版未启用技能广场网络服务；本机 Skills 不受影响。");
      }
      switch (request.operation) {
        case "session":
          return marketplaceClient.session();
        case "register":
          return marketplaceClient.register(request.input);
        case "login":
          return marketplaceClient.login(request.input);
        case "logout":
          return marketplaceClient.logout();
        case "list":
          return marketplaceClient.list(request.filter);
        case "detail":
          return marketplaceClient.detail(request.ref);
        case "listMine":
          return marketplaceClient.listMine(request.filter);
        case "myDetail":
          return marketplaceClient.myDetail(request.ref);
        case "publish":
          return marketplaceClient.publish(request.input);
        case "update":
          return marketplaceClient.update(request.input);
        case "setEnabled":
          return marketplaceClient.setEnabled(request.input);
        case "delete":
          return marketplaceClient.delete(request.ref);
        case "like":
          return marketplaceClient.like(request.input);
        case "previewInstall":
          return marketplaceClient.previewInstall(request.ref);
        case "install":
          return marketplaceClient.install(request.input);
      }
    }
  );

  registerCloudBackupIpc(
    () => cloudBackupService,
    () => mainWindow
  );

  ipcMain.handle(
    IPC_COMMAND_CHANNEL,
    async (event, rawCommand: unknown): Promise<CommandResult> => {
      const requestId = extractCommandRequestId(rawCommand);
      if (
        !isTrustedRendererEvent(event)
      ) {
        return {
          status: "rejected",
          requestId,
          error: {
            code: "ipc.untrusted_sender",
            message: "IPC command sender is not the active InkHub window."
          }
        };
      }
      const parsed = CommandEnvelopeSchema.safeParse(rawCommand);
      if (!parsed.success) {
        const details = summarizeCommandValidationIssues(parsed.error.issues);
        const firstIssue = Array.isArray(details.issues)
          ? (details.issues[0] as { path?: string; message?: string } | undefined)
          : undefined;
        const issueHint =
          firstIssue?.path && firstIssue.message
            ? ` (${firstIssue.path}: ${firstIssue.message})`
            : "";
        console.error(
          `InkHub IPC rejected invalid command ${requestId}:`,
          details
        );
        return {
          status: "rejected",
          requestId,
          error: {
            code: "ipc.invalid_command",
            message: `Command envelope failed schema validation.${issueHint}`,
            details
          }
        };
      }

      const command = parsed.data;
      if (
        command.type === "agent.prompt" ||
        command.type === "agent.abort" ||
        command.type === "agent.model_test" ||
        command.type === "catalog.createShortBookAtPath" ||
        command.type === "catalog.createScriptBookAtPath" ||
        command.type === "long.createBookAtPath" ||
        command.type === "long.previewLegacySyncAtPath" ||
        command.type === "long.applyLegacySyncAtPath" ||
        command.type === "long.importPortableAtPath" ||
        command.type === "long.previewContinuationImportAtPath" ||
        command.type === "long.importContinuationAtPath" ||
        command.type === "long.openAtPath" ||
        command.type === "catalog.createLibraryAtPath" ||
        command.type === "catalog.createLibraryGroupAtPath" ||
        command.type === "catalog.openProjectAtPath" ||
        command.type === "catalog.importLegacyLibraryAtPath"
        || command.type === "catalog.installMarketplaceSkillContent"
      ) {
        return {
          status: "rejected",
          requestId: command.id,
          error: {
            code: "ipc.forbidden_internal_command",
            message: "Renderer cannot invoke internal commands."
          }
        };
      }
      if (command.type === "system.health") {
        return {
          status: "accepted",
          requestId: command.id,
          payload: SystemHealthPayloadSchema.parse(await supervisor.collectHealth())
        };
      }

      if (command.type === "manuscript.exportShort") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: ExportShortManuscriptResultSchema.parse(
              await exportShortManuscript(mainWindow!, command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "manuscript.export_failed",
              message: error instanceof Error ? error.message : "导出正文失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "manuscript.exportLong") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: ExportLongManuscriptResultSchema.parse(
              await exportLongManuscript(mainWindow!, command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "manuscript.export_failed",
              message: error instanceof Error ? error.message : "导出长篇失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "workspaceDirectory.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: WorkspaceDirectorySettingsSchema.parse(
              await requireWorkspaceDirectoryStore().list()
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "workspace_directory.list_failed",
              message: error instanceof Error ? error.message : "加载工作目录失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "workspaceDirectory.choose") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: await chooseWorkspaceDirectory()
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "workspace_directory.choose_failed",
              message: error instanceof Error ? error.message : "切换工作目录失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "appearance.list") {
        try {
          const snapshot = AppearanceSettingsSnapshotSchema.parse(
            await requireAppearanceConfigStore().list()
          );
          syncNativeAppearanceChrome(snapshot.settings);
          return {
            status: "accepted",
            requestId: command.id,
            payload: snapshot
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "appearance.list_failed",
              message: error instanceof Error ? error.message : "加载外观设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "appearance.save") {
        try {
          const snapshot = AppearanceSettingsSnapshotSchema.parse(
            await requireAppearanceConfigStore().save(command.payload)
          );
          syncNativeAppearanceChrome(snapshot.settings);
          return {
            status: "accepted",
            requestId: command.id,
            payload: snapshot
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "appearance.save_failed",
              message: error instanceof Error ? error.message : "保存外观设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "generalSettings.list") {
        try {
          const snapshot = GeneralSettingsSnapshotSchema.parse(
            await requireGeneralSettingsStore().list()
          );
          syncGeneralSettings(snapshot.settings);
          return {
            status: "accepted",
            requestId: command.id,
            payload: snapshot
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "general_settings.list_failed",
              message:
                error instanceof Error ? error.message : "加载常规设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "generalSettings.save") {
        try {
          const snapshot = GeneralSettingsSnapshotSchema.parse(
            await requireGeneralSettingsStore().save(command.payload)
          );
          syncGeneralSettings(snapshot.settings);
          return {
            status: "accepted",
            requestId: command.id,
            payload: snapshot
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "general_settings.save_failed",
              message:
                error instanceof Error ? error.message : "保存常规设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (
        command.type === "long.createBook" ||
        command.type === "long.openExisting"
      ) {
        try {
          const workspaceDirectory =
            await requireSelectedWorkspaceDirectory();
          if (!workspaceDirectory) {
            return {
              status: "accepted",
              requestId: command.id,
              payload: null
            };
          }
          const defaultPath = workspaceResourceParent(
            workspaceDirectory,
            "book"
          );
          let selectedPath = defaultPath;
          if (command.type === "long.openExisting") {
            const selection = await showOpenDialogWithBookmarks({
              title: "打开已有长篇项目",
              defaultPath,
              properties: ["openDirectory"]
            });
            if (
              selection.canceled ||
              selection.filePaths.length === 0
            ) {
              return {
                status: "accepted",
                requestId: command.id,
                payload: null
              };
            }
            selectedPath = selection.filePaths[0]!;
          }
          const internalCommand = CommandEnvelopeSchema.parse(
            command.type === "long.createBook"
              ? createEnvelope(
                  "long.createBookAtPath",
                  {
                    parentDirectory: selectedPath,
                    input: command.payload
                  },
                  { id: command.id, context: command.context }
                )
              : createEnvelope(
                  "long.openAtPath",
                  { projectDirectory: selectedPath },
                  { id: command.id, context: command.context }
                )
          );
          const result = await supervisor.requestCommand(
            "core",
            internalCommand,
            0
          );
          if (result.status === "rejected") return result;
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongOpenBookResultSchema.parse(result.payload)
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long.forward_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "长篇目录操作失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "long.chooseContinuationImportSource") {
        try {
          const selection = await showOpenDialogWithBookmarks({
            title: "选择续写章节文件夹",
            defaultPath: app.getPath("documents"),
            buttonLabel: "扫描章节",
            properties: ["openDirectory"]
          });
          const sourcePath = selection.filePaths[0];
          if (selection.canceled || !sourcePath) {
            return {
              status: "accepted",
              requestId: command.id,
              payload: null
            };
          }
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "long.previewContinuationImportAtPath",
              { sourcePath },
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand(
            "core",
            internalCommand,
            0
          );
          if (result.status === "rejected") return result;
          const preview = LongPreviewContinuationImportAtPathResultSchema.parse(
            result.payload
          );
          const { previewId, expiresAt } = continuationImportPreviews.register({
            webContentsId: event.sender.id,
            sourcePath,
            sourceFingerprint: preview.sourceFingerprint
          });
          const { sourceFingerprint: _sourceFingerprint, ...publicPreview } =
            preview;
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongChooseContinuationImportSourceResultSchema.parse({
              ...publicPreview,
              previewId,
              expiresAt: new Date(expiresAt).toISOString()
            })
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long.preview_continuation_import_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "扫描续写章节文件夹失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "long.chooseLegacySyncSource") {
        try {
          const selection = await showOpenDialogWithBookmarks({
            title: "选择旧版本长篇压缩包",
            defaultPath: app.getPath("documents"),
            buttonLabel: "上传并预览",
            filters: [{ name: "旧版本长篇压缩包", extensions: ["zip"] }],
            properties: ["openFile"]
          });
          const sourcePath = selection.filePaths[0];
          if (selection.canceled || !sourcePath) {
            return { status: "accepted", requestId: command.id, payload: null };
          }
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "long.previewLegacySyncAtPath",
              { sourcePath },
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand("core", internalCommand, 0);
          if (result.status === "rejected") return result;
          const preview = LongPreviewLegacySyncAtPathResultSchema.parse(result.payload);
          const { previewId, expiresAt } = legacySyncPreviews.register({
            webContentsId: event.sender.id,
            sourcePath,
            sourceFingerprint: preview.sourceFingerprint
          });
          const { sourceFingerprint: _fingerprint, ...publicPreview } = preview;
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongChooseLegacySyncSourceResultSchema.parse({
              ...publicPreview,
              previewId,
              expiresAt: new Date(expiresAt).toISOString()
            })
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long.preview_legacy_sync_failed",
              message: error instanceof Error ? error.message : "读取旧版本压缩包失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "long.applyLegacySync") {
        try {
          const registration = legacySyncPreviews.resolve(
            command.payload.previewId,
            event.sender.id
          );
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "long.applyLegacySyncAtPath",
              {
                bookId: command.payload.bookId,
                expectedProjectRevision: command.payload.expectedProjectRevision,
                modules: command.payload.modules,
                sourcePath: registration.sourcePath,
                expectedFingerprint: registration.sourceFingerprint
              },
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand("core", internalCommand, 0);
          if (result.status === "rejected") return result;
          legacySyncPreviews.consume(command.payload.previewId);
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongApplyLegacySyncResultSchema.parse(result.payload)
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long.apply_legacy_sync_failed",
              message: error instanceof Error ? error.message : "同步旧版本失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "long.importContinuation") {
        try {
          const registration = continuationImportPreviews.resolve(
            command.payload.previewId,
            event.sender.id
          );
          const workspaceDirectory =
            await requireSelectedWorkspaceDirectory();
          if (!workspaceDirectory) {
            return {
              status: "accepted",
              requestId: command.id,
              payload: null
            };
          }
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "long.importContinuationAtPath",
              {
                parentDirectory: workspaceResourceParent(
                  workspaceDirectory,
                  "book"
                ),
                sourcePath: registration.sourcePath,
                expectedFingerprint: registration.sourceFingerprint,
                title: command.payload.title,
                genre: command.payload.genre
              },
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand(
            "core",
            internalCommand,
            0
          );
          if (result.status === "rejected") return result;
          continuationImportPreviews.consume(command.payload.previewId);
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongImportContinuationResultSchema.parse(result.payload)
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long.import_continuation_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "续写导入失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "long.importPortable") {
        try {
          const workspaceDirectory =
            await requireSelectedWorkspaceDirectory();
          if (!workspaceDirectory) {
            return {
              status: "accepted",
              requestId: command.id,
              payload: null
            };
          }
          const selection = await showOpenDialogWithBookmarks({
            title: "导入旧版长篇可移植工程",
            defaultPath: app.getPath("documents"),
            buttonLabel: "选择并导入",
            filters: [
              {
                name: "旧版长篇可移植工程",
                extensions: ["json"]
              }
            ],
            properties: ["openFile"]
          });
          const sourcePath = selection.filePaths[0];
          if (selection.canceled || !sourcePath) {
            return {
              status: "accepted",
              requestId: command.id,
              payload: null
            };
          }
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "long.importPortableAtPath",
              {
                parentDirectory: workspaceResourceParent(
                  workspaceDirectory,
                  "book"
                ),
                sourcePath
              },
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand(
            "core",
            internalCommand,
            0
          );
          if (result.status === "rejected") return result;
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongImportPortableResultSchema.parse(result.payload)
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long.import_portable_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "导入长篇可移植工程失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (
        command.type === "catalog.createShortBook" ||
        command.type === "catalog.createScriptBook" ||
        command.type === "catalog.createLibrary" ||
        command.type === "catalog.createLibraryGroup" ||
        command.type === "catalog.openProject" ||
        command.type === "catalog.importLegacyLibrary"
      ) {
        try {
          const workspaceDirectory = await requireSelectedWorkspaceDirectory();
          if (!workspaceDirectory) {
            return {
              status: "accepted",
              requestId: command.id,
              payload: null
            };
          }

          const domain =
            command.type === "catalog.createShortBook" ||
            command.type === "catalog.createScriptBook"
              ? "book"
              : command.payload.domain;
          const defaultPath =
            command.type === "catalog.createLibraryGroup"
              ? workspaceGroupParent(workspaceDirectory, command.payload.domain)
              : workspaceResourceParent(workspaceDirectory, domain);
          let selectedPaths: string[];
          if (
            command.type === "catalog.createShortBook" ||
            command.type === "catalog.createScriptBook" ||
            command.type === "catalog.createLibrary" ||
            command.type === "catalog.createLibraryGroup"
          ) {
            selectedPaths = [defaultPath];
          } else {
            const selection = await showOpenDialogWithBookmarks({
              title:
                command.type === "catalog.importLegacyLibrary"
                    ? `导入旧版${domain === "material" ? "素材" : "技能"}库压缩包`
                  : domain === "book"
                    ? "打开已有书籍"
                    : domain === "material"
                      ? "打开已有素材库"
                      : "打开已有技能库",
              defaultPath,
              ...(
                command.type === "catalog.importLegacyLibrary"
                ? {
                    properties:
                      command.type === "catalog.importLegacyLibrary"
                        ? LEGACY_LIBRARY_FILE_SELECTION_PROPERTIES
                        : (["openFile"] as const),
                    filters: [
                      {
                        name: `旧版${domain === "material" ? "素材" : "技能"}库压缩包`,
                        extensions: ["zip"]
                      }
                    ]
                  }
                : { properties: ["openDirectory"] as const }
              )
            });
            if (selection.canceled || selection.filePaths.length === 0) {
              return {
                status: "accepted",
                requestId: command.id,
                payload: null
              };
            }
            selectedPaths = selection.filePaths;
          }

          const selectedPath = selectedPaths[0]!;

          const internalCommand = CommandEnvelopeSchema.parse(
            command.type === "catalog.createShortBook"
              ? createEnvelope(
                  "catalog.createShortBookAtPath",
                  {
                    parentDirectory: selectedPath,
                    input: command.payload
                  },
                  { id: command.id, context: command.context }
                )
              : command.type === "catalog.createScriptBook"
                ? createEnvelope(
                    "catalog.createScriptBookAtPath",
                    {
                      parentDirectory: selectedPath,
                      input: command.payload
                    },
                    { id: command.id, context: command.context }
                  )
                : command.type === "catalog.createLibrary"
                  ? createEnvelope(
                      "catalog.createLibraryAtPath",
                      {
                        ...command.payload,
                        parentDirectory: selectedPath
                      },
                      { id: command.id, context: command.context }
                    )
                  : command.type === "catalog.createLibraryGroup"
                    ? createEnvelope(
                        "catalog.createLibraryGroupAtPath",
                        {
                          parentDirectory: selectedPath,
                          input: command.payload
                        },
                        { id: command.id, context: command.context }
                      )
                    : command.type === "catalog.openProject"
                      ? createEnvelope(
                          "catalog.openProjectAtPath",
                          {
                            projectDirectory: selectedPath,
                            domain: command.payload.domain
                          },
                          { id: command.id, context: command.context }
                        )
                      : createEnvelope(
                            "catalog.importLegacyLibraryAtPath",
                            {
                              domain: command.payload.domain,
                              archivePath: selectedPath,
                              parentDirectory: defaultPath
                            },
                            { id: command.id, context: command.context }
                          )
          );

          if (command.type === "catalog.importLegacyLibrary") {
            const payload = await importLegacyLibraryArchives(
              selectedPaths,
              async (archivePath, index) => {
                const result = await supervisor.requestCommand(
                  "core",
                  createEnvelope(
                    "catalog.importLegacyLibraryAtPath",
                    {
                      domain: command.payload.domain,
                      archivePath,
                      parentDirectory: defaultPath
                    },
                    {
                      id: `${command.id}_${index + 1}`,
                      context: command.context
                    }
                  ),
                  0
                );
                if (result.status === "rejected") {
                  throw new Error(result.error.message);
                }
                return result.payload;
              }
            );
            return {
              status: "accepted",
              requestId: command.id,
              payload
            };
          }

          const result = await supervisor.requestCommand(
            "core",
            internalCommand,
            0
          );
          if (result.status === "rejected") {
            return result;
          }
          const payload =
            command.type === "catalog.createShortBook"
              ? ShortBookSchema.parse(result.payload)
              : command.type === "catalog.createScriptBook"
                ? ScriptBookSchema.parse(result.payload)
                : command.type === "catalog.createLibrary"
                  ? CatalogLibrarySchema.parse(result.payload)
                  : command.type === "catalog.createLibraryGroup"
                    ? CatalogLibraryGroupSchema.parse(result.payload)
                    : command.type === "catalog.openProject"
                      ? CatalogOpenProjectResultSchema.parse(result.payload)
                      : CatalogLibrarySchema.parse(result.payload);
          return { status: "accepted", requestId: command.id, payload };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "catalog.forward_failed",
              message: error instanceof Error ? error.message : "目录操作失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (
        command.type === "long.list" ||
        command.type === "long.open" ||
        command.type === "long.duplicateBook" ||
        command.type === "long.rename" ||
        command.type === "long.updateBindings" ||
        command.type === "long.getWorkspaceIndex" ||
        command.type === "long.readDocument" ||
        command.type === "long.readAgentsMd" ||
        command.type === "long.search" ||
        command.type === "long.writeDocument" ||
        command.type === "long.writeAgentsMd" ||
        command.type === "long.previewOperations" ||
        command.type === "long.applyOperations" ||
        command.type === "long.writeChapter" ||
        command.type === "long.commitChapter" ||
        command.type === "long.rollbackLastCommit" ||
        command.type === "long.unregister" ||
        command.type === "long.delete"
      ) {
        try {
          const result = await supervisor.requestCommand(
            "core",
            command,
            0
          );
          if (result.status === "rejected") return result;
          let payload: unknown;
          switch (command.type) {
            case "long.list":
              payload = LongListBooksResultSchema.parse(result.payload);
              break;
            case "long.open":
            case "long.duplicateBook":
            case "long.rename":
            case "long.updateBindings":
              payload = LongOpenBookResultSchema.parse(result.payload);
              break;
            case "long.getWorkspaceIndex":
              payload = LongWorkspaceIndexResultSchema.parse(
                result.payload
              );
              break;
            case "long.readDocument":
              payload = LongReadDocumentResultSchema.parse(result.payload);
              break;
            case "long.readAgentsMd":
              payload = LongReadAgentsMdResultSchema.parse(result.payload);
              break;
            case "long.search":
              payload = LongSearchResultSchema.parse(result.payload);
              break;
            case "long.writeDocument":
              payload = LongWriteDocumentResultSchema.parse(result.payload);
              break;
            case "long.writeAgentsMd":
              payload = LongWriteAgentsMdResultSchema.parse(result.payload);
              break;
            case "long.previewOperations":
              payload = LongPreviewOperationsResultSchema.parse(
                result.payload
              );
              break;
            case "long.applyOperations":
              payload = LongApplyOperationsResultSchema.parse(
                result.payload
              );
              break;
            case "long.writeChapter":
              payload = LongWriteChapterResultSchema.parse(result.payload);
              break;
            case "long.commitChapter":
              payload = LongCommitChapterResultSchema.parse(result.payload);
              break;
            case "long.rollbackLastCommit":
              payload = LongRollbackLastCommitResultSchema.parse(
                result.payload
              );
              break;
            case "long.unregister":
            case "long.delete":
              payload = LongRemoveBookResultSchema.parse(result.payload);
              break;
          }
          return { status: "accepted", requestId: command.id, payload };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long.forward_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "长篇操作失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "catalog.chooseExternalSkills") {
        try {
          const selection = command.payload.sourceKind === "directory"
            ? await showOpenDialogWithBookmarks({
                title: "选择 skills 文件夹",
                properties: ["openDirectory"]
              })
            : await showOpenDialogWithBookmarks({
                title: "选择 SKILL.md",
                properties: ["openFile"],
                filters: [{ name: "SKILL.md", extensions: ["md"] }]
              });
          if (selection.canceled || selection.filePaths.length === 0) {
            return {
              status: "accepted",
              requestId: command.id,
              payload: null
            };
          }
          return {
            status: "accepted",
            requestId: command.id,
            payload: ExternalSkillSelectionResultSchema.parse(
              await readExternalSkills(
                command.payload.sourceKind,
                selection.filePaths[0]!
              )
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "catalog.choose_external_skills_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "读取外部技能失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (
        command.type === "rendererState.load" ||
        command.type === "rendererState.save" ||
        command.type === "rendererState.remove"
      ) {
        try {
          const result = await supervisor.requestCommand("core", command, 60_000);
          if (result.status === "rejected") return result;
          return {
            status: "accepted",
            requestId: command.id,
            payload:
              command.type === "rendererState.load"
                ? RendererStateLoadResultSchema.parse(result.payload)
                : RendererStateMutationResultSchema.parse(result.payload)
          };
        } catch (error: unknown) {
          const timedOut = error instanceof UtilityCommandTimeoutError;
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: timedOut
                ? "renderer_state.command_timeout"
                : "renderer_state.forward_failed",
              message: timedOut
                ? "会话历史持久化操作超时。"
                : error instanceof Error
                  ? error.message
                  : "会话历史持久化操作失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (
        command.type === "catalog.index" ||
        command.type === "catalog.readDocument" ||
        command.type === "catalog.snapshot" ||
        command.type === "catalog.loadDraftRecovery" ||
        command.type === "catalog.saveDraftRecovery" ||
        command.type === "catalog.updateBook" ||
        command.type === "catalog.mutateCharacterStructure" ||
        command.type === "catalog.mutatePlotStructure" ||
        command.type === "catalog.updateLibraryGroup" ||
        command.type === "catalog.updateLibrary" ||
        command.type === "catalog.deleteBook" ||
        command.type === "catalog.saveDocument" ||
        command.type === "catalog.createDraftSection" ||
        command.type === "catalog.createDraftSections" ||
        command.type === "catalog.deleteDraftSection" ||
        command.type === "catalog.moveDraftSection" ||
        command.type === "catalog.saveLibraryEntry" ||
        command.type === "catalog.createLibraryEntry" ||
        command.type === "catalog.removeLibraryEntry" ||
        command.type === "catalog.moveLibraryEntry" ||
        command.type === "catalog.unregisterProject" ||
        command.type === "catalog.deleteProject" ||
        command.type === "catalog.duplicateProject"
      ) {
        try {
          const result = await supervisor.requestCommand(
            "core",
            command,
            catalogCommandTimeoutMs(command.type)
          );
          if (result.status === "rejected") {
            return result;
          }
          let payload: unknown;
          switch (command.type) {
            case "catalog.index":
              payload = CatalogIndexSnapshotSchema.parse(result.payload);
              break;
            case "catalog.readDocument":
              payload = CatalogReadDocumentResultSchema.parse(result.payload);
              break;
            case "catalog.snapshot":
              payload = CatalogSnapshotSchema.parse(result.payload);
              break;
            case "catalog.loadDraftRecovery":
              payload = CatalogDraftRecoverySchema.parse(result.payload);
              break;
            case "catalog.saveDraftRecovery":
              payload = CatalogDraftRecoverySaveResultSchema.parse(result.payload);
              break;
            case "catalog.deleteBook":
              payload = DeleteBookResultSchema.parse(result.payload);
              break;
            case "catalog.saveDocument":
              payload = SaveDocumentResultSchema.parse(result.payload);
              break;
            case "catalog.createDraftSection":
              payload = CatalogDraftSectionSchema.parse(result.payload);
              break;
            case "catalog.createDraftSections":
              payload = CreateDraftSectionsResultSchema.parse(result.payload);
              break;
            case "catalog.deleteDraftSection":
              payload = DeleteDraftSectionResultSchema.parse(result.payload);
              break;
            case "catalog.moveDraftSection":
              payload = MoveDraftSectionResultSchema.parse(result.payload);
              break;
            case "catalog.saveLibraryEntry":
            case "catalog.createLibraryEntry":
              payload = CatalogLibraryEntrySchema.parse(result.payload);
              break;
            case "catalog.removeLibraryEntry":
              payload = RemoveLibraryEntryResultSchema.parse(result.payload);
              break;
            case "catalog.moveLibraryEntry":
              payload = MoveLibraryEntryResultSchema.parse(result.payload);
              break;
            case "catalog.updateLibrary":
              payload = CatalogLibrarySchema.parse(result.payload);
              break;
            case "catalog.unregisterProject":
              payload = UnregisterCatalogProjectResultSchema.parse(result.payload);
              break;
            case "catalog.deleteProject":
              payload = DeleteCatalogProjectResultSchema.parse(result.payload);
              break;
            case "catalog.duplicateProject":
              payload = DuplicateCatalogProjectResultSchema.parse(result.payload);
              break;
            case "catalog.updateBook":
            case "catalog.mutateCharacterStructure":
            case "catalog.mutatePlotStructure":
              payload = BookSchema.parse(result.payload);
              break;
            case "catalog.updateLibraryGroup":
              payload = CatalogLibraryGroupSchema.parse(result.payload);
              break;
          }
          return { status: "accepted", requestId: command.id, payload };
        } catch (error: unknown) {
          const timedOut = error instanceof UtilityCommandTimeoutError;
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: timedOut ? "catalog.command_timeout" : "catalog.forward_failed",
              message: timedOut
                ? catalogCommandTimeoutMessage(command.type)
                : error instanceof Error
                  ? error.message
                  : "目录操作失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "models.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: ModelSettingsSchema.parse(await requireModelConfigStore().list())
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "models.list_failed",
              message: error instanceof Error ? error.message : "加载模型配置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }


      if (
        command.type === "models.refreshFree" ||
        command.type === "models.refreshOfficial" ||
        command.type === "models.queryOfficialBalance" ||
        command.type === "models.saveOfficialToken" ||
        command.type === "models.clearOfficialToken" ||
        command.type === "models.setOfficialModelEnabled"
      ) {
        return {
          status: "rejected",
          requestId: command.id,
          error: {
            code: "models.legacy_channel_disabled",
            message: "墨枢支持 ModelHub 与用户自定义厂家 API；旧版托管/免费模型通道已禁用。"
          }
        };
      }

      if (command.type === "modelUsage.query") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: ModelUsageDashboardSchema.parse(
              await requireModelUsageStore().query(command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "model_usage.query_failed",
              message: error instanceof Error ? error.message : "加载模型用量失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "models.save") {
        try {
          const settings = ModelSettingsSchema.parse(
            await requireModelConfigStore().save(command.payload)
          );
          void requireModelUsageStore()
            .syncConfiguredModels(settings.models)
            .catch((error: unknown) => {
              console.warn(
                "InkHub model usage registry was not synchronized:",
                error instanceof Error ? error.message : "unknown error"
              );
            });
          return {
            status: "accepted",
            requestId: command.id,
            payload: settings
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "models.save_failed",
              message: error instanceof Error ? error.message : "保存模型配置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "models.listRemote") {
        try {
          const apiKey = await requireModelConfigStore().resolveDraftApiKey({
            ...(command.payload.id ? { id: command.payload.id } : {}),
            provider: command.payload.provider,
            api: command.payload.api,
            baseUrl: command.payload.baseUrl,
            ...(command.payload.apiKey ? { apiKey: command.payload.apiKey } : {}),
            ...(command.payload.clearApiKey ? { clearApiKey: true } : {})
          });
          const models = await listRemoteModels({
            provider: command.payload.provider,
            api: command.payload.api,
            baseUrl: command.payload.baseUrl,
            apiKey
          });
          return {
            status: "accepted",
            requestId: command.id,
            payload: RemoteModelListResultSchema.parse({ models })
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "models.list_remote_failed",
              message:
                error instanceof Error ? error.message : "拉取可用模型失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "models.test") {
        try {
          const runtimeConfig = await requireModelConfigStore().resolveDraft(
            command.payload.model
          );
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "agent.model_test",
              { runtimeConfig },
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand("agent", internalCommand, 20_000);
          if (result.status === "accepted") {
            const payload = ModelConnectionTestResultSchema.parse(result.payload);
            if (payload.usage) {
              const runtime: AgentRuntimeRef = {
                provider: runtimeConfig.provider,
                model: runtimeConfig.modelId,
                mode: "provider",
                configId: runtimeConfig.id
              };
              void requireModelUsageStore()
                .record({
                  id: `v2:model-test:${command.id}`,
                  occurredAt: payload.testedAt,
                  model: createUsageModelSnapshot(runtime, runtimeConfig),
                  module: "model-test",
                  actor: "connection-test",
                  status: "completed",
                  usage: payload.usage
                })
                .catch((error: unknown) => {
                  console.warn(
                    "InkHub model-test usage was not persisted:",
                    error instanceof Error ? error.message : "unknown error"
                  );
                });
            }
            return {
              status: "accepted",
              requestId: command.id,
              payload
            };
          }
          return result;
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "models.test_failed",
              message: error instanceof Error ? error.message : "模型连接测试失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "workspaceAgents.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: WorkspaceAgentSettingsSchema.parse(
              await requireWorkspaceAgentConfigStore().list(
                command.payload.workspaceType
              )
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "workspace_agents.list_failed",
              message: error instanceof Error ? error.message : "加载创作空间智能体设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "agentTeams.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: WorkspaceAgentTeamSettingsSchema.parse(
              await requireAgentTeamConfigStore().list(
                command.payload.workspaceType
              )
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "agent_teams.list_failed",
              message: error instanceof Error ? error.message : "加载智能体团队设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "agentTeams.save") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: WorkspaceAgentTeamSettingsSchema.parse(
              await requireAgentTeamConfigStore().save(command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "agent_teams.save_failed",
              message: error instanceof Error ? error.message : "保存智能体团队设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "workspaceAgents.save") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: WorkspaceAgentSettingsSchema.parse(
              await requireWorkspaceAgentConfigStore().save(command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "workspace_agents.save_failed",
              message: error instanceof Error ? error.message : "保存创作空间智能体设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "workspaceAgents.reset") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: WorkspaceAgentSettingsSchema.parse(
              await requireWorkspaceAgentConfigStore().reset(
                command.payload.workspaceType,
                command.payload.agentId
              )
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "workspace_agents.reset_failed",
              message: error instanceof Error ? error.message : "恢复创作空间默认设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "longAgents.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongAgentSettingsSchema.parse(
              await requireLongAgentConfigStore().list()
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long_agents.list_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "加载长篇智能体设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "longAgents.save") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongAgentSettingsSchema.parse(
              await requireLongAgentConfigStore().save(command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long_agents.save_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "保存长篇智能体设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "longAgents.reset") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongAgentSettingsSchema.parse(
              await requireLongAgentConfigStore().reset(command.payload.agentId)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long_agents.reset_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "恢复长篇智能体默认设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "longAgentTeams.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongAgentTeamSettingsSchema.parse(
              await requireLongAgentTeamConfigStore().list()
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long_agent_teams.list_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "加载长篇智能体团队设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "longAgentTeams.save") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LongAgentTeamSettingsSchema.parse(
              await requireLongAgentTeamConfigStore().save(command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "long_agent_teams.save_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "保存长篇智能体团队设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "libraryAgents.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LibraryAgentSettingsSchema.parse(
              await requireLibraryAgentConfigStore().list()
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "library_agents.list_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "加载资料库智能体设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "libraryAgents.save") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LibraryAgentSettingsSchema.parse(
              await requireLibraryAgentConfigStore().save(command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "library_agents.save_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "保存资料库智能体设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "libraryAgents.reset") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LibraryAgentSettingsSchema.parse(
              await requireLibraryAgentConfigStore().reset(command.payload.domain)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "library_agents.reset_failed",
              message:
                error instanceof Error
                  ? error.message
                  : "恢复资料库智能体默认设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "learningImitationSettings.list") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LearningImitationSettingsSchema.parse(
              await requireLearningImitationConfigStore().list()
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "learning_imitation_settings.list_failed",
              message: error instanceof Error ? error.message : "加载学习仿写设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "learningImitationSettings.save") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LearningImitationSettingsSchema.parse(
              await requireLearningImitationConfigStore().save(command.payload)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "learning_imitation_settings.save_failed",
              message: error instanceof Error ? error.message : "保存学习仿写设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "learningImitationSettings.reset") {
        try {
          return {
            status: "accepted",
            requestId: command.id,
            payload: LearningImitationSettingsSchema.parse(
              await requireLearningImitationConfigStore().reset(command.payload.stageId)
            )
          };
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "learning_imitation_settings.reset_failed",
              message: error instanceof Error ? error.message : "恢复学习仿写默认设置失败。",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "session.abort") {
        try {
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "agent.abort",
              command.payload,
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand("agent", internalCommand, 10_000);
          if (result.status === "accepted") {
            const accepted = SessionAbortAcceptedPayloadSchema.parse(result.payload);
            if (
              accepted.sessionId !== command.payload.sessionId ||
              accepted.runId !== command.payload.runId
            ) {
              return {
                status: "rejected",
                requestId: command.id,
                error: {
                  code: "ipc.invalid_agent_abort_result",
                  message: "Agent abort result does not match the requested run."
                }
              };
            }
            return { status: "accepted", requestId: command.id, payload: accepted };
          }
          return result;
        } catch (error: unknown) {
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "ipc.agent_abort_failed",
              message: error instanceof Error ? error.message : "Agent abort failed.",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      if (command.type === "session.prompt") {
        try {
          const runtimeConfig = await requireModelConfigStore().resolve(command.payload.modelId);
          const shortWorkspace = command.payload.workspaceContext?.shortWorkspace;
          const scriptWorkspace = command.payload.workspaceContext?.scriptWorkspace;
          const longWorkspace = command.payload.workspaceContext?.longWorkspace;
          const libraryWorkspace = command.payload.workspaceContext?.libraryWorkspace;
          const learningImitation = command.payload.workspaceContext?.learningImitation;
          const creativeWorkspace = shortWorkspace ?? scriptWorkspace;
          const creativeWorkspaceType = scriptWorkspace ? "script" : "short";
          const agentProfile = creativeWorkspace
            ? await requireWorkspaceAgentConfigStore().resolveForWorkspace(
                creativeWorkspace,
                creativeWorkspaceType
              )
            : undefined;
          const longAgentProfile = longWorkspace
            ? await requireLongAgentConfigStore().resolve(
                longWorkspace.activeAgentId
              )
            : undefined;
          const subagentDefinitions = agentProfile
            ? await requireAgentTeamConfigStore().resolve(
                creativeWorkspaceType,
                agentProfile.id
              )
            : longAgentProfile
              ? await requireLongAgentTeamConfigStore().resolve(
                  longAgentProfile.id
                )
              : undefined;
          const subagentRuntimeConfigs: Record<string, AgentProviderRuntimeConfig> =
            {};
          if (subagentDefinitions?.length) {
            for (const definition of subagentDefinitions) {
              if (definition.modelMode !== "custom" || !definition.modelId) {
                continue;
              }
              const resolved =
                subagentRuntimeConfigs[definition.modelId] ??
                (await requireModelConfigStore().resolve(definition.modelId));
              if (!resolved) {
                throw new Error(
                  `子智能体「${definition.name}」配置的模型不存在，请刷新模型配置后重试。`
                );
              }
              assertModelRunSettings(resolved, {
                thinkingLevel: definition.thinkingLevel,
                temperature: definition.temperature
              });
              subagentRuntimeConfigs[definition.modelId] = resolved;
            }
          }
          const libraryAgentProfile = libraryWorkspace
            ? await requireLibraryAgentConfigStore().resolve(
                libraryWorkspace.domain
              )
            : undefined;
          const learningImitationProfile = learningImitation
            ? await requireLearningImitationConfigStore().resolve(
                learningImitation.stageId
              )
            : undefined;
          const { thinkingLevel, temperature } = resolveModelRunSettings(runtimeConfig, {
            thinkingLevel: command.payload.thinkingLevel,
            temperature: command.payload.temperature
          });
          const {
            thinkingLevel: _requestedThinkingLevel,
            temperature: _requestedTemperature,
            ...promptPayload
          } = command.payload;
          const usageContext = createUsageRunContext(
            command.payload,
            runtimeConfig,
            subagentRuntimeConfigs
          );
          pendingUsageContexts.set(command.context.correlationId, usageContext);
          const internalCommand = CommandEnvelopeSchema.parse(
            createEnvelope(
              "agent.prompt",
              {
                ...promptPayload,
                ...(thinkingLevel ? { thinkingLevel } : {}),
                ...(temperature !== undefined ? { temperature } : {}),
                ...(runtimeConfig ? { runtimeConfig } : {}),
                ...(agentProfile
                  ? scriptWorkspace
                    ? { scriptAgentProfile: agentProfile }
                    : { agentProfile }
                  : {}),
                ...(longAgentProfile ? { longAgentProfile } : {}),
                ...(subagentDefinitions ? { subagentDefinitions } : {}),
                ...(Object.keys(subagentRuntimeConfigs).length > 0
                  ? { subagentRuntimeConfigs }
                  : {}),
                ...(libraryAgentProfile ? { libraryAgentProfile } : {}),
                ...(learningImitationProfile ? { learningImitationProfile } : {})
              },
              { id: command.id, context: command.context }
            )
          );
          const result = await supervisor.requestCommand("agent", internalCommand, 10_000);
          if (result.status === "accepted") {
            const accepted = SessionPromptAcceptedPayloadSchema.parse(result.payload);
            if (accepted.sessionId !== command.payload.sessionId) {
              return {
                status: "rejected",
                requestId: command.id,
                error: {
                  code: "ipc.invalid_agent_acceptance",
                  message: "Agent acceptance sessionId does not match the prompt command."
                }
              };
            }
            const provisional = [...activeRuns.entries()].find(
              ([, run]) => run.correlationId === command.context.correlationId
            );
            if (provisional && provisional[0] !== accepted.runId) {
              return {
                status: "rejected",
                requestId: command.id,
                error: {
                  code: "ipc.invalid_agent_acceptance",
                  message: "Agent acceptance runId does not match the provisional event stream."
                }
              };
            }
            if (!terminalRuns.has(accepted.runId)) {
              activeRuns.set(accepted.runId, {
                sessionId: accepted.sessionId,
                correlationId: command.context.correlationId,
                runtime: accepted.runtime,
                accepted: true,
                promptRequestId: internalCommand.id,
                usageContext,
                ...(longWorkspace
                  ? { resourceId: longWorkspace.bookId }
                  : {})
              });
            }
            pendingUsageContexts.delete(command.context.correlationId);
            return { status: "accepted", requestId: command.id, payload: accepted };
          }
          pendingUsageContexts.delete(command.context.correlationId);
          return result;
        } catch (error: unknown) {
          pendingUsageContexts.delete(command.context.correlationId);
          return {
            status: "rejected",
            requestId: command.id,
            error: {
              code: "ipc.agent_command_failed",
              message: error instanceof Error ? error.message : "Agent command failed.",
              details: safeErrorDetails(error)
            }
          };
        }
      }

      throw new Error("Unreachable command variant after schema validation.");
    }
  );
}

async function runAgentSmoke(health: ReturnType<typeof SystemHealthPayloadSchema.parse>): Promise<void> {
  const sessionId = "session_electron_smoke";
  const commandId = createId("cmd_smoke");
  const events: SystemEventEnvelope[] = [];
  let resolveTerminal: (() => void) | undefined;
  const terminal = new Promise<void>((resolve) => {
    resolveTerminal = resolve;
  });

  smokeEventTap = (event) => {
    if (isAgentEvent(event) && "sessionId" in event.payload && event.payload.sessionId === sessionId) {
      events.push(event);
      if (event.type === "agent.message_completed" || event.type === "agent.error") {
        resolveTerminal?.();
      }
    }
  };

  try {
    const command = CommandEnvelopeSchema.parse(
      createEnvelope(
        "agent.prompt",
        {
          sessionId,
          message: "验证 InkHub Electron Faux 流式链路",
          thinkingLevel: "medium" as const,
          workspaceContext: {
            activeResource: {
              id: "chapter_smoke",
              domain: "creation" as const,
              title: "冒烟测试章节",
              path: ["测试作品", "冒烟测试章节"],
              format: "正文",
              source: "live-editor" as const,
              content: "这是发送瞬间的实时文稿。"
            }
          }
        },
        {
          id: commandId,
          context: { correlationId: commandId, sessionId, resourceId: "chapter_smoke" }
        }
      )
    );

    const result = await supervisor.requestCommand("agent", command);
    if (result.status === "rejected") {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    const accepted = SessionPromptAcceptedPayloadSchema.parse(result.payload);
    await Promise.race([
      terminal,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Agent smoke timed out.")), 8_000)
      )
    ]);

    const completed = events.find((event) => event.type === "agent.message_completed");
    const errors = events.filter((event) => event.type === "agent.error");
    const deltas = events.filter((event) => event.type === "agent.message_delta");
    const thinking = events.filter((event) => event.type === "agent.thinking_delta");
    const deltaText = deltas
      .map((event) => event.type === "agent.message_delta" ? event.payload.delta : "")
      .join("");

    if (
      accepted.runtime.mode !== "local-faux" ||
      !completed ||
      errors.length > 0 ||
      deltas.length < 2 ||
      thinking.length < 1 ||
      (completed.type === "agent.message_completed" && completed.payload.content !== deltaText)
    ) {
      throw new Error("Agent smoke event assertions failed.");
    }

    console.log(
      `DEEPWRITE_SMOKE_OK ${JSON.stringify({
        health,
        agent: {
          status: "ok",
          runtime: accepted.runtime,
          deltaCount: deltas.length,
          thinkingDeltaCount: thinking.length,
          completed: true
        }
      })}`
    );
  } finally {
    smokeEventTap = undefined;
  }
}

async function announceReady(window: BrowserWindow): Promise<void> {
  const health = SystemHealthPayloadSchema.parse(await supervisor.collectHealth());
  const event = SystemReadyEventEnvelopeSchema.parse(
    createEnvelope("system.ready", health, { id: createId("evt_ready") })
  ) as SystemEventEnvelope;
  if (!window.isDestroyed()) {
    window.webContents.send(IPC_EVENT_CHANNEL, event);
  }

  if (process.env.INKHUB_ACCEPTANCE === "1") {
    try {
      const result = await runInkHubRendererAcceptance(window);
      console.log(`INKHUB_ACCEPTANCE_OK ${JSON.stringify(result)}`);
    } catch (error: unknown) {
      console.error(`INKHUB_ACCEPTANCE_FAIL ${error instanceof Error ? error.message : "unknown"}`);
      process.exitCode = 1;
    } finally {
      app.quit();
    }
  } else if (process.env.DEEPWRITE_SMOKE === "1") {
    try {
      await runAgentSmoke(health);
    } catch (error: unknown) {
      console.error(`DEEPWRITE_SMOKE_FAIL ${error instanceof Error ? error.message : "unknown"}`);
      process.exitCode = 1;
    } finally {
      beginGracefulShutdown({ exitProcess: true });
    }
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  shutdownComplete = true;
  app.quit();
} else {
  app.on("second-instance", () => {
    mainWindowStartupGate.requestShow();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);
    const userDataPath = configureCatalogEnvironment();
    securityScopedBookmarkStore = new SecurityScopedBookmarkStore(userDataPath, {
      enabled: isMacAppStoreBuild,
      startAccessing: (bookmark) => {
        const releaseAccess = app.startAccessingSecurityScopedResource(bookmark);
        return () => releaseAccess();
      }
    });
    try {
      await securityScopedBookmarkStore.initialize();
    } catch (error: unknown) {
      console.warn(
        "InkHub security-scoped bookmarks could not be restored:",
        error instanceof Error ? error.message : "unknown error"
      );
    }
    modelConfigStore = new ModelConfigStore(userDataPath, {
      appVersion: app.getVersion(),
      externalCatalogsEnabled: false
    });
    modelUsageStore = new ModelUsageStore(userDataPath);
    softwareTokenUsageReporter = new SoftwareTokenUsageReporter(
      userDataPath,
      modelUsageStore,
      { enabled: false }
    );
    void softwareTokenUsageReporter.reportAtStartup().catch(() => {
      console.warn("InkHub software token usage was not reported at startup.");
    });
    void modelConfigStore.initialize();
    void modelConfigStore
      .list()
      .then((settings) => modelUsageStore?.syncConfiguredModels(settings.models))
      .catch((error: unknown) => {
        console.warn(
          "InkHub model usage registry could not initialize:",
          error instanceof Error ? error.message : "unknown error"
        );
      });
    workspaceAgentConfigStore = new WorkspaceAgentConfigStore(userDataPath);
    agentTeamConfigStore = new AgentTeamConfigStore(userDataPath);
    libraryAgentConfigStore = new LibraryAgentConfigStore(userDataPath);
    longAgentConfigStore = new LongAgentConfigStore(userDataPath);
    longAgentTeamConfigStore = new LongAgentTeamConfigStore(userDataPath);
    learningImitationConfigStore = new LearningImitationConfigStore(userDataPath);
    workspaceDirectoryStore = new WorkspaceDirectoryStore(userDataPath);
    const acceptanceNovelRoot = process.env.INKHUB_ACCEPTANCE === "1"
      ? process.env.INKHUB_ACCEPTANCE_NOVEL_ROOT
      : undefined;
    const acceptanceSkillDefinitions = process.env.INKHUB_ACCEPTANCE === "1"
      ? INKHUB_ACCEPTANCE_SKILL_DEFINITIONS
      : undefined;
    const assetHomePath = acceptanceNovelRoot
      ? resolve(acceptanceNovelRoot, "..", "..")
      : app.getPath("home");
    inkHubAssetStore = new InkHubAssetStore(
      userDataPath,
      assetHomePath,
      acceptanceSkillDefinitions,
      acceptanceNovelRoot,
      join(__dirname, "inkhub-quality-worker.js")
    );
    inkHubMediaService = new InkHubMediaService(inkHubAssetStore, modelConfigStore);
    const acceptanceRepairRunner: InkHubRepairModelRunner | undefined =
      process.env.INKHUB_ACCEPTANCE === "1"
        ? {
            async run(input) {
              return {
                content: JSON.stringify({
                  repairs: input.chapters.map((chapter) => ({
                    chapterId: chapter.chapterId,
                    content: `${chapter.content.trimEnd()}\n\n雨声越过檐角，青铜铃在寂静里轻轻一响。林舟循着信纸留下的暗号，终于看见通往雾河旧站的第一条线索。`,
                    rationale: "连续性审校、语言与文风编辑及读者体验测试共同生成候选稿；确认前不会写回原稿。"
                  }))
                }),
                runtime: {
                  provider: "modelhub",
                  model: "inkhub-acceptance-faux",
                  mode: "local-faux" as const,
                  configId: "inkhub-acceptance-faux"
                }
              };
            }
          }
        : undefined;
    const acceptanceDeepQualityRunner: InkHubDeepQualityRunner | undefined =
      process.env.INKHUB_ACCEPTANCE === "1"
        ? {
            async run() {
              return {
                content: JSON.stringify({ findings: [] }),
                runtime: {
                  provider: "modelhub",
                  model: "inkhub-acceptance-faux",
                  mode: "local-faux" as const,
                  configId: "inkhub-acceptance-faux"
                }
              };
            }
          }
        : undefined;
    inkHubDeepQualityCoordinator = new InkHubDeepQualityCoordinator({
      assets: inkHubAssetStore,
      models: modelConfigStore,
      taskStore: new InkHubDeepQualityTaskStore(join(userDataPath, "indexes", "novels")),
      ...(acceptanceDeepQualityRunner
        ? { runner: acceptanceDeepQualityRunner, allowFauxWithoutModel: true }
        : {}),
      recordUsage: async ({ runtimeConfig, runtime, usage, observationId, occurredAt }) => {
        if (runtime.mode === "local-faux") return;
        await requireModelUsageStore().record({
          id: `v2:inkhub-deep-quality:${observationId}`,
          occurredAt,
          model: {
            configId: runtimeConfig.id,
            revisionId: createModelUsageRevisionId(runtimeConfig),
            label: runtimeConfig.label,
            provider: runtimeConfig.provider,
            modelId: runtimeConfig.modelId,
            api: runtimeConfig.api,
            ...(runtimeConfig.managedBy ? { managedBy: runtimeConfig.managedBy } : {})
          },
          module: "novel-quality-repair",
          actor: "main-agent",
          status: "completed",
          usage
        });
      }
    });
    inkHubAiRepairTaskStore = new InkHubAiRepairTaskStore(
      join(userDataPath, "indexes", "novels")
    );
    inkHubAiRepairService = new InkHubAiRepairService({
      assets: inkHubAssetStore,
      models: modelConfigStore,
      taskStore: inkHubAiRepairTaskStore,
      getDeepQualityReport: (entryId, sourceContentHash) => {
        const task = inkHubDeepQualityCoordinator?.getTask(entryId);
        return task?.status === "completed" && task.sourceContentHash === sourceContentHash
          ? task.report
          : null;
      },
      loadAgents: async () => {
        const [shortTeams, longTeams] = await Promise.all([
          requireAgentTeamConfigStore().list("short"),
          requireLongAgentTeamConfigStore().list()
        ]);
        const byId = new Map<string, (typeof shortTeams.teams)[number]["subagents"][number]>();
        for (const settings of [shortTeams, longTeams]) {
          for (const team of settings.teams) {
            for (const agent of team.subagents) {
              if (!byId.has(agent.id)) byId.set(agent.id, agent);
            }
          }
        }
        return [...byId.values()];
      },
      ...(acceptanceRepairRunner ? { runner: acceptanceRepairRunner, allowFauxWithoutModel: true } : {}),
      recordUsage: async ({ runtimeConfig, runtime, usage, observationId, occurredAt }) => {
        if (runtime.mode === "local-faux") return;
        await requireModelUsageStore().record({
          id: `v2:inkhub-repair:${observationId}`,
          occurredAt,
          model: {
            configId: runtimeConfig.id,
            revisionId: createModelUsageRevisionId(runtimeConfig),
            label: runtimeConfig.label,
            provider: runtimeConfig.provider,
            modelId: runtimeConfig.modelId,
            api: runtimeConfig.api,
            ...(runtimeConfig.managedBy ? { managedBy: runtimeConfig.managedBy } : {})
          },
          module: "novel-quality-repair",
          actor: "main-agent",
          status: "completed",
          usage
        });
      }
    });
    const acceptanceStoryRunner: InkHubStoryKernelModelRunner | undefined =
      process.env.INKHUB_ACCEPTANCE === "1"
        ? {
            async run(input) {
              const runtime = { provider: "modelhub", model: "inkhub-acceptance-faux", mode: "local-faux" as const, configId: "inkhub-acceptance-faux" };
              if (input.operation === "reconstruct") {
                return {
                  content: JSON.stringify({ chapters: input.chapters.map((chapter) => ({
                    chapterId: chapter.chapterId,
                    summary: `${chapter.chapterTitle}验收摘要`,
                    facts: [{ category: "event", subject: "验收角色", predicate: "出现在", object: chapter.chapterTitle,
                      status: "active", confidence: 1, startOffset: 0, endOffset: Math.min(1, chapter.content.length), excerpt: chapter.content.slice(0, 1) }]
                  })) }),
                  runtime
                };
              }
              if (input.operation === "continuation") {
                return { content: JSON.stringify({ title: "墨枢验收续写", plan: ["延续现有线索"], draft: "这是一份未写回原稿的验收续写草稿。", continuityNotes: ["保持分卷边界"], evidenceChapterIds: input.chapters.slice(-1).map((chapter) => chapter.chapterId) }), runtime };
              }
              return { content: JSON.stringify({ branches: [
                { title: "推进", premise: "直接推进", beats: ["承接", "转折"], opportunities: ["节奏明确"], risks: ["信息较快"], evidenceChapterIds: input.chapters.slice(-1).map((chapter) => chapter.chapterId) },
                { title: "蓄势", premise: "先行蓄势", beats: ["观察", "行动"], opportunities: ["补足伏笔"], risks: ["节奏放缓"], evidenceChapterIds: input.chapters.slice(-1).map((chapter) => chapter.chapterId) }
              ] }), runtime };
            }
          }
        : undefined;
    inkHubStoryKernelService = new InkHubStoryKernelService({
      storageDirectory: join(userDataPath, "indexes", "novels"),
      assets: inkHubAssetStore,
      models: modelConfigStore,
      ...(acceptanceStoryRunner ? { runner: acceptanceStoryRunner, allowFauxWithoutModel: true } : {}),
      recordUsage: async ({ runtimeConfig, runtime, usage, observationId, occurredAt }) => {
        if (runtime.mode === "local-faux") return;
        await requireModelUsageStore().record({
          id: `v2:inkhub-story:${observationId}`,
          occurredAt,
          model: {
            configId: runtimeConfig.id,
            revisionId: createModelUsageRevisionId(runtimeConfig),
            label: runtimeConfig.label,
            provider: runtimeConfig.provider,
            modelId: runtimeConfig.modelId,
            api: runtimeConfig.api,
            ...(runtimeConfig.managedBy ? { managedBy: runtimeConfig.managedBy } : {})
          },
          module: "novel-story-kernel",
          actor: "main-agent",
          status: "completed",
          usage
        });
      }
    });
    appearanceConfigStore = new AppearanceConfigStore(userDataPath);
    generalSettingsStore = new GeneralSettingsStore(userDataPath);
    await workspaceDirectoryStore.initializeDefault(
      isMacAppStoreBuild ? join(userDataPath, "workspace") : app.getPath("documents")
    );
    await loadAndSyncNativeAppearanceChrome();
    syncGeneralSettings(
      (await generalSettingsStore.list()).settings
    );
    if (isMacAppStoreBuild) {
      updateService = createMacAppStoreUpdateService();
    } else {
      const { UpdateService } = await import("./update-service");
      updateService = new UpdateService(() => {
        beginGracefulShutdown({ installUpdate: true });
      });
    }
    appAlertStore = new AppAlertStore(userDataPath, { enabled: false });
    if (INKHUB_EXTERNAL_SERVICES_ENABLED) {
      cloudBackupService = new CloudBackupService(userDataPath, {
        getWorkspaceDirectory: async () => {
          const current = await requireWorkspaceDirectoryStore().list();
          return current.path;
        },
        registerCatalogProject: async ({ projectDirectory, domain }) => {
          const id = createId("cmd_cloud_backup_open");
          const command = CommandEnvelopeSchema.parse(
            createEnvelope(
              "catalog.openProjectAtPath",
              { projectDirectory, domain },
              { id, correlationId: id }
            )
          );
          const result = await supervisor.requestCommand("core", command, 0);
          if (result.status === "rejected") {
            throw new Error(result.error.message);
          }
        },
        registerLongBook: async (projectDirectory) => {
          const id = createId("cmd_cloud_backup_open_long");
          const command = CommandEnvelopeSchema.parse(
            createEnvelope(
              "long.openAtPath",
              { projectDirectory },
              { id, correlationId: id }
            )
          );
          const result = await supervisor.requestCommand("core", command, 0);
          if (result.status === "rejected") {
            throw new Error(result.error.message);
          }
        }
      });
      marketplaceClient = new MarketplaceClient(userDataPath, {
        loadCatalogSnapshot: async () => {
          const id = createId("cmd_marketplace_snapshot");
          const command = CommandEnvelopeSchema.parse(
            createEnvelope("catalog.snapshot", {}, { id, correlationId: id })
          );
          const result = await supervisor.requestCommand("core", command, 0);
          if (result.status === "rejected") {
            throw new Error(result.error.message);
          }
          return CatalogSnapshotSchema.parse(result.payload);
        },
        installPackage: async (input) => {
          const id = createId("cmd_marketplace_install");
          const command = CommandEnvelopeSchema.parse(
            createEnvelope("catalog.installMarketplaceSkillContent", input, {
              id,
              correlationId: id
            })
          );
          const result = await supervisor.requestCommand("core", command, 0);
          if (result.status === "rejected") {
            throw new Error(result.error.message);
          }
          return CatalogInstallMarketplaceSkillContentResultSchema.parse(
            result.payload
          );
        }
      });
    }
    updateService.subscribe((state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(UPDATE_STATE_EVENT_CHANNEL, state);
      }
    });
    registerIpc();
    supervisor.startAll();
    mainWindow = createMainWindow();
    mainWindowStartupGate.markReady();

    app.on("activate", () => {
      showMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (shutdownComplete) {
    return;
  }
  event.preventDefault();
  beginGracefulShutdown();
});
