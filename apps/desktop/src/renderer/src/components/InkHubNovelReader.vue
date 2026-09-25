<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  InkHubNovelChapter,
  InkHubNovelChapterPage,
  InkHubNovelAiRepairPlan,
  InkHubNovelAiRepairProgress,
  InkHubNovelAiRepairTask,
  InkHubNovelBatchRepairResult,
  InkHubNovelContextPacket,
  InkHubNovelEntry,
  InkHubNovelIndexSummary,
  InkHubNovelQualityIssue,
  InkHubNovelQualityReport,
  InkHubNovelSearchResult,
  InkHubDeepQualityFinding,
  InkHubDeepQualityProgress,
  InkHubDeepQualityReport,
  InkHubDeepQualityTask,
  InkHubStoryContinuationResult,
  InkHubStoryForecastResult,
  InkHubStoryReconstructionProgress,
  InkHubStoryStateSnapshot
} from "@deepwrite/contracts";
import AppIcon from "./AppIcon.vue";
import InkHubRepairReviewList from "./InkHubRepairReviewList.vue";
import { uiMessage } from "../ui-feedback";
import {
  acceptedInkHubRepairDrafts,
  createInkHubRepairReviewDrafts,
  isWritableNovelRepairPath,
  type InkHubRepairReviewDecision,
  type InkHubRepairReviewDraft
} from "../utils/inkhubRepairReview";

const MAX_AI_REPAIR_CHAPTERS = 500;

const props = defineProps<{ entry: InkHubNovelEntry }>();
const emit = defineEmits<{ close: [] }>();

type ReaderMode = "read" | "search" | "quality";

const mode = ref<ReaderMode>("read");
const summary = ref<InkHubNovelIndexSummary | null>(null);
const chapters = ref<InkHubNovelChapter[]>([]);
const nextCatalogOffset = ref<number | null>(null);
const activeChapterId = ref<string | null>(null);
const activePage = ref<InkHubNovelChapterPage | null>(null);
const chapterContent = ref("");
const chapterNextOffset = ref<number | null>(null);
const loading = ref(false);
const readerBody = ref<HTMLElement | null>(null);
const searchQuery = ref("");
const searchResults = ref<InkHubNovelSearchResult[]>([]);
const qualityReport = ref<InkHubNovelQualityReport | null>(null);
const contextPacket = ref<InkHubNovelContextPacket | null>(null);
const repairIssue = ref<InkHubNovelQualityIssue | null>(null);
const repairChapter = ref<InkHubNovelChapter | null>(null);
const repairContent = ref("");
const repairOriginalContent = ref("");
const confirmRepairOpen = ref(false);
const confirmAiRepairOpen = ref(false);
const confirmBatchWriteOpen = ref(false);
const aiGenerating = ref(false);
const aiRepairProgress = ref<InkHubNovelAiRepairProgress | null>(null);
const aiRepairError = ref<string | null>(null);
const aiRepairPlan = ref<InkHubNovelAiRepairPlan | null>(null);
const aiRepairTask = ref<InkHubNovelAiRepairTask | null>(null);
const aiResumeMode = ref(false);
const lastReaudit = ref<NonNullable<InkHubNovelBatchRepairResult["reaudit"]> | null>(null);
const storyState = ref<InkHubStoryStateSnapshot | null>(null);
const storyProgress = ref<InkHubStoryReconstructionProgress | null>(null);
const storyAction = ref<"reconstruct" | "continuation" | "forecast" | null>(null);
const storyBusy = ref(false);
const authorIntent = ref("");
const currentFocus = ref("");
const targetCharacters = ref(3_000);
const continuationResult = ref<InkHubStoryContinuationResult | null>(null);
const forecastQuestion = ref("");
const forecastBranchCount = ref(3);
const forecastResult = ref<InkHubStoryForecastResult | null>(null);
const forecastHistory = ref<InkHubStoryForecastResult[]>([]);
const aiRepairDrafts = ref<InkHubRepairReviewDraft[]>([]);
const deepQualityReport = ref<InkHubDeepQualityReport | null>(null);
const deepQualityProgress = ref<InkHubDeepQualityProgress | null>(null);
const deepQualityTask = ref<InkHubDeepQualityTask | null>(null);
const deepQualityError = ref<string | null>(null);
const deepQualityRunning = ref(false);
const confirmDeepQualityOpen = ref(false);
const deepQualityResumeMode = ref(false);
let requestEpoch = 0;
let progressTimer: ReturnType<typeof setTimeout> | null = null;
let aiProgressTimer: ReturnType<typeof setInterval> | null = null;
let storyProgressTimer: ReturnType<typeof setInterval> | null = null;
let deepQualityProgressTimer: ReturnType<typeof setInterval> | null = null;

const activeChapter = computed(() => chapters.value.find((chapter) => chapter.id === activeChapterId.value) ?? null);
const indexReady = computed(() => summary.value?.status === "ready" || summary.value?.status === "partial");
const progressPercent = computed(() => {
  if (!summary.value?.chapterCount || !activeChapter.value) return 0;
  return Math.round(((activeChapter.value.ordinal + 1) / summary.value.chapterCount) * 100);
});
const paragraphs = computed(() => chapterContent.value.split(/\n\s*\n/u).filter((paragraph) => paragraph.trim()));
const volumeGroups = computed(() => {
  const groups = new Map<string, { key: string; title: string; chapters: Array<{ chapter: InkHubNovelChapter; localOrdinal: number }> }>();
  for (const chapter of chapters.value) {
    const title = chapter.volumeTitle?.trim() || "未分卷";
    const key = chapter.volumeTitle?.trim() || "__unassigned__";
    const group = groups.get(key) ?? { key, title, chapters: [] };
    group.chapters.push({ chapter, localOrdinal: group.chapters.length + 1 });
    groups.set(key, group);
  }
  return [...groups.values()];
});
const activeVolumePosition = computed(() => {
  for (const group of volumeGroups.value) {
    const item = group.chapters.find(({ chapter }) => chapter.id === activeChapterId.value);
    if (item) return { title: group.title, localOrdinal: item.localOrdinal };
  }
  return null;
});
const repairWriteSupported = computed(() => /\.(?:md|txt)$/iu.test(repairChapter.value?.relativePath ?? ""));
const repairChanged = computed(() => repairContent.value !== repairOriginalContent.value);
const acceptedAiRepairs = computed(() => acceptedInkHubRepairDrafts(aiRepairDrafts.value));
const aiRepairTargetCount = computed(() => {
  const targets = new Set<string>();
  for (const issue of qualityReport.value?.issues ?? []) {
    const ids = issue.rule === "duplicate-paragraph" ? issue.chapterIds.slice(1) : issue.chapterIds;
    ids.forEach((id) => targets.add(id));
  }
  for (const finding of deepQualityReport.value?.findings ?? []) {
    finding.evidence.forEach(({ chapterId }) => targets.add(chapterId));
  }
  return targets.size;
});
const totalRepairIssueCount = computed(() =>
  (qualityReport.value?.issues.length ?? 0) + (deepQualityReport.value?.findings.length ?? 0)
);
const minimumAiBatches = computed(() => Math.ceil(aiRepairTargetCount.value / 8));

function api() {
  if (!window.deepwrite?.inkHub) throw new Error("逐章阅读只在墨枢桌面端可用。");
  return window.deepwrite.inkHub;
}

async function loadSummary(): Promise<void> {
  summary.value = await api().getNovelIndex(props.entry.id);
  if (indexReady.value) {
    await loadCatalog(true);
    await restoreCreativeState();
  }
}

function restoreRepairPlan(task: InkHubNovelAiRepairTask | null): void {
  aiRepairTask.value = task;
  if (!task) return;
  aiRepairProgress.value = task.progress;
  if (task.plan.proposals.length) {
    aiRepairPlan.value = task.plan;
    aiRepairDrafts.value = createInkHubRepairReviewDrafts(task.plan);
  }
  if (task.status === "failed") aiRepairError.value = task.lastError || "上次 AI 修复未完成，可从检查点继续。";
}

function chooseAiRepair(
  draft: InkHubRepairReviewDraft,
  decision: Exclude<InkHubRepairReviewDecision, "pending">
): void {
  if (decision === "accepted" && !isWritableNovelRepairPath(draft.proposal.relativePath)) {
    uiMessage.warning("该章节不是 Markdown / TXT 文件，暂不支持安全写回。");
    return;
  }
  draft.decision = decision;
  if (decision === "accepted") {
    uiMessage.success(`已选择《${draft.proposal.chapterTitle}》修复稿；尚未写回，请再点击“确认写回”。`);
  } else {
    uiMessage.info(`《${draft.proposal.chapterTitle}》将保留原稿。`);
  }
}

function chooseAllAiRepairs(
  decision: Exclude<InkHubRepairReviewDecision, "pending">
): void {
  let changed = 0;
  for (const draft of aiRepairDrafts.value) {
    const nextDecision = decision === "accepted" && !isWritableNovelRepairPath(draft.proposal.relativePath)
      ? "kept"
      : decision;
    if (draft.decision !== nextDecision) changed += 1;
    draft.decision = nextDecision;
  }
  const message = decision === "accepted"
    ? `已选择 ${acceptedAiRepairs.value.length} 章修复稿；尚未写回。`
    : "已将全部章节设为保留原稿。";
  if (changed > 0) uiMessage.info(message);
}

function updateAiRepairDraft(proposalId: string, content: string): void {
  const draft = aiRepairDrafts.value.find(({ proposal }) => proposal.id === proposalId);
  if (draft) draft.content = content;
}

function decideAiRepairDraft(
  proposalId: string,
  decision: Exclude<InkHubRepairReviewDecision, "pending">
): void {
  const draft = aiRepairDrafts.value.find(({ proposal }) => proposal.id === proposalId);
  if (draft) chooseAiRepair(draft, decision);
}

async function restoreCreativeState(): Promise<void> {
  const [state, task, forecasts, deepTask] = await Promise.all([
    api().getStoryState(props.entry.id),
    api().getNovelAiRepairTask(props.entry.id),
    api().listStoryForecasts(props.entry.id),
    api().getNovelDeepQualityTask(props.entry.id)
  ]);
  storyState.value = state;
  forecastHistory.value = forecasts.forecasts;
  restoreRepairPlan(task);
  deepQualityTask.value = deepTask;
  deepQualityProgress.value = deepTask?.progress ?? null;
  deepQualityReport.value = deepTask?.report ?? null;
  if (deepTask?.status === "failed") deepQualityError.value = deepTask.lastError;
}

async function buildIndex(): Promise<void> {
  loading.value = true;
  aiRepairError.value = null;
  aiRepairProgress.value = null;
  aiRepairPlan.value = null;
  aiRepairDrafts.value = [];
  const epoch = ++requestEpoch;
  try {
    summary.value = await api().buildNovelIndex(props.entry.id);
    if (epoch !== requestEpoch) return;
    chapters.value = [];
    await loadCatalog(true);
    storyState.value = await api().getStoryState(props.entry.id);
    uiMessage.success(`全书索引已建立：${summary.value.chapterCount} 章、${summary.value.indexedDocumentCount} 个文档`);
  } catch (error: unknown) {
    if (epoch === requestEpoch) uiMessage.error(error instanceof Error ? error.message : "构建全书索引失败");
  } finally {
    if (epoch === requestEpoch) loading.value = false;
  }
}

async function loadCatalog(reset = false): Promise<void> {
  if (!indexReady.value && !reset) return;
  const offset = reset ? 0 : nextCatalogOffset.value;
  if (offset === null) return;
  const catalog = await api().listNovelChapters(props.entry.id, offset, 200);
  summary.value = catalog.summary;
  chapters.value = reset ? catalog.chapters : [...chapters.value, ...catalog.chapters];
  nextCatalogOffset.value = catalog.nextOffset;
  if (reset && catalog.chapters.length) {
    const progress = await api().getNovelReadingProgress(props.entry.id);
    while (
      progress &&
      nextCatalogOffset.value !== null &&
      !chapters.value.some((chapter) => chapter.id === progress.chapterId)
    ) {
      await loadCatalog(false);
    }
    const target = progress && chapters.value.some((chapter) => chapter.id === progress.chapterId)
      ? progress.chapterId
      : chapters.value[0]!.id;
    await openChapter(target, progress?.chapterId === target ? progress.characterOffset : 0);
  }
}

async function openChapter(chapterId: string, offset = 0): Promise<void> {
  saveProgressNow();
  const epoch = ++requestEpoch;
  loading.value = true;
  activeChapterId.value = chapterId;
  chapterContent.value = "";
  activePage.value = null;
  try {
    const page = await api().readNovelChapter(props.entry.id, chapterId, 0, 100_000);
    if (epoch !== requestEpoch || activeChapterId.value !== chapterId) return;
    activePage.value = page;
    chapterContent.value = page.content;
    chapterNextOffset.value = page.nextOffset;
    await nextTick();
    const fraction = page.totalCharacters ? Math.min(1, offset / page.totalCharacters) : 0;
    if (readerBody.value) readerBody.value.scrollTop = fraction * Math.max(0, readerBody.value.scrollHeight - readerBody.value.clientHeight);
  } catch (error: unknown) {
    if (epoch === requestEpoch) uiMessage.error(error instanceof Error ? error.message : "读取章节失败");
  } finally {
    if (epoch === requestEpoch) loading.value = false;
  }
}

async function loadMoreChapter(): Promise<void> {
  const offset = chapterNextOffset.value;
  const chapterId = activeChapterId.value;
  if (offset === null || !chapterId) return;
  loading.value = true;
  try {
    const page = await api().readNovelChapter(props.entry.id, chapterId, offset, 100_000);
    if (activeChapterId.value !== chapterId) return;
    chapterContent.value += page.content;
    chapterNextOffset.value = page.nextOffset;
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "继续读取本章失败");
  } finally {
    loading.value = false;
  }
}

async function navigateChapter(direction: "previous" | "next"): Promise<void> {
  const chapterId = direction === "previous" ? activePage.value?.previousChapterId : activePage.value?.nextChapterId;
  if (!chapterId) return;
  if (!chapters.value.some((chapter) => chapter.id === chapterId) && nextCatalogOffset.value !== null) {
    await loadCatalog(false);
  }
  await openChapter(chapterId);
}

async function searchFullText(): Promise<void> {
  const query = searchQuery.value.trim();
  if (!query) return;
  loading.value = true;
  try {
    searchResults.value = (await api().searchNovel(props.entry.id, query, 30)).results;
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "全文搜索失败");
  } finally {
    loading.value = false;
  }
}

async function openSearchResult(result: InkHubNovelSearchResult): Promise<void> {
  if (!result.chapterId) return;
  mode.value = "read";
  if (!chapters.value.some((chapter) => chapter.id === result.chapterId)) {
    while (nextCatalogOffset.value !== null && !chapters.value.some((chapter) => chapter.id === result.chapterId)) await loadCatalog(false);
  }
  await openChapter(result.chapterId);
}

async function runQualityCheck(): Promise<void> {
  loading.value = true;
  aiRepairError.value = null;
  aiRepairProgress.value = null;
  aiRepairPlan.value = null;
  aiRepairDrafts.value = [];
  try {
    qualityReport.value = await api().runNovelQualityCheck(props.entry.id);
    contextPacket.value = null;
    uiMessage.success(`本地质检完成，发现 ${qualityReport.value.issues.length} 项可复核问题`);
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "全书质检失败");
  } finally {
    loading.value = false;
  }
}

async function ensureChapterLoaded(chapterId: string): Promise<InkHubNovelChapter | null> {
  while (!chapters.value.some((chapter) => chapter.id === chapterId) && nextCatalogOffset.value !== null) {
    await loadCatalog(false);
  }
  return chapters.value.find((chapter) => chapter.id === chapterId) ?? null;
}

async function readFullChapter(chapterId: string): Promise<string> {
  const pages: string[] = [];
  let offset = 0;
  do {
    const page = await api().readNovelChapter(props.entry.id, chapterId, offset, 200_000);
    pages.push(page.content);
    if (pages.reduce((total, item) => total + item.length, 0) > 2_000_000) {
      throw new Error("本章超过 200 万字的修复编辑上限，请在原编辑器中修改。");
    }
    offset = page.nextOffset ?? -1;
  } while (offset >= 0);
  return pages.join("");
}

async function locateQualityIssue(issue: InkHubNovelQualityIssue): Promise<void> {
  const chapterId = issue.chapterIds[0];
  if (!chapterId) return;
  const chapter = await ensureChapterLoaded(chapterId);
  if (!chapter) {
    uiMessage.warning("该问题对应的章节已不在当前索引中，请更新全书索引后重试。");
    return;
  }
  mode.value = "read";
  await openChapter(chapter.id);
}

async function startRepair(issue: InkHubNovelQualityIssue): Promise<void> {
  const chapterId = issue.chapterIds[0];
  if (!chapterId) return;
  loading.value = true;
  try {
    const chapter = await ensureChapterLoaded(chapterId);
    if (!chapter) throw new Error("该问题对应的章节已不在当前索引中，请重新质检。");
    const content = await readFullChapter(chapter.id);
    repairIssue.value = issue;
    repairChapter.value = chapter;
    repairOriginalContent.value = content;
    repairContent.value = content;
    await nextTick();
    document.querySelector<HTMLElement>(".repair-editor textarea")?.focus();
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "无法打开修复工作台");
  } finally {
    loading.value = false;
  }
}

function closeRepair(): void {
  repairIssue.value = null;
  repairChapter.value = null;
  repairOriginalContent.value = "";
  repairContent.value = "";
  confirmRepairOpen.value = false;
}

async function copyRepairTask(): Promise<void> {
  if (!repairIssue.value || !repairChapter.value) return;
  const text = [
    `请修复《${props.entry.title}》${repairChapter.value.volumeTitle ? `「${repairChapter.value.volumeTitle}」` : ""}${repairChapter.value.title}。`,
    `质检问题：${repairIssue.value.title}`,
    repairIssue.value.detail,
    "必须保持既有事实、人物动机和前后连续性；输出完整修复章节，不要覆盖原稿。",
    "",
    repairContent.value
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    uiMessage.success("修复任务已复制，可交给创作对话继续处理");
  } catch {
    uiMessage.warning("系统未允许剪贴板写入，请手动选择修复稿。");
  }
}

async function applyRepair(): Promise<void> {
  const chapter = repairChapter.value;
  if (!chapter || !repairChanged.value || !repairWriteSupported.value) return;
  loading.value = true;
  try {
    const result = await api().applyNovelChapterRepair({
      entryId: props.entry.id,
      chapterId: chapter.id,
      expectedSourceRevision: chapter.sourceRevision,
      content: repairContent.value
    });
    confirmRepairOpen.value = false;
    closeRepair();
    summary.value = result.summary;
    chapters.value = [];
    nextCatalogOffset.value = 0;
    await loadCatalog(true);
    qualityReport.value = await api().runNovelQualityCheck(props.entry.id);
    deepQualityReport.value = null;
    deepQualityTask.value = null;
    deepQualityProgress.value = null;
    uiMessage.success(`已写回 ${result.relativePath}；原稿备份已保存到墨枢私有目录`);
  } catch (error: unknown) {
    confirmRepairOpen.value = false;
    uiMessage.error(error instanceof Error ? error.message : "写回修复稿失败");
  } finally {
    loading.value = false;
  }
}

function openAiRepairConfirmation(resume = false): void {
  if (!totalRepairIssueCount.value) return;
  aiRepairError.value = null;
  if (aiRepairTargetCount.value > MAX_AI_REPAIR_CHAPTERS) {
    aiRepairError.value = `当前质检涉及 ${aiRepairTargetCount.value} 章，超过单次安全上限 ${MAX_AI_REPAIR_CHAPTERS} 章。请先更新全书索引，确保备份与非正文资料没有混入章节；若更新后仍超限，请分卷处理。`;
    return;
  }
  aiResumeMode.value = resume;
  confirmAiRepairOpen.value = true;
}

function openDeepQualityConfirmation(resume = false): void {
  deepQualityError.value = null;
  deepQualityResumeMode.value = resume;
  confirmDeepQualityOpen.value = true;
}

async function refreshDeepQualityProgress(): Promise<void> {
  deepQualityProgress.value = await api().getNovelDeepQualityProgress(props.entry.id)
    .catch(() => deepQualityProgress.value);
}

function startDeepQualityProgressPolling(): void {
  if (deepQualityProgressTimer) clearInterval(deepQualityProgressTimer);
  void refreshDeepQualityProgress();
  deepQualityProgressTimer = setInterval(() => void refreshDeepQualityProgress(), 900);
}

function stopDeepQualityProgressPolling(): void {
  if (deepQualityProgressTimer) clearInterval(deepQualityProgressTimer);
  deepQualityProgressTimer = null;
}

async function runDeepQuality(): Promise<void> {
  confirmDeepQualityOpen.value = false;
  deepQualityRunning.value = true;
  deepQualityError.value = null;
  startDeepQualityProgressPolling();
  try {
    deepQualityReport.value = await (deepQualityResumeMode.value
      ? api().resumeNovelDeepQuality
      : api().runNovelDeepQuality)({ entryId: props.entry.id, confirmBillable: true });
    deepQualityTask.value = await api().getNovelDeepQualityTask(props.entry.id);
    uiMessage.success(`深度 AI 质检完成：${deepQualityReport.value.findings.length} 项问题，七个维度均已按卷审计`);
  } catch (error: unknown) {
    deepQualityError.value = error instanceof Error ? error.message : "深度 AI 质检失败";
    deepQualityTask.value = await api().getNovelDeepQualityTask(props.entry.id).catch(() => null);
    uiMessage.error(deepQualityError.value);
  } finally {
    await refreshDeepQualityProgress();
    stopDeepQualityProgressPolling();
    deepQualityRunning.value = false;
  }
}

async function cancelDeepQuality(): Promise<void> {
  try {
    deepQualityTask.value = await api().cancelNovelDeepQuality({ entryId: props.entry.id, confirmCancel: true });
    deepQualityProgress.value = deepQualityTask.value.progress;
    stopDeepQualityProgressPolling();
    uiMessage.warning("已取消后续深度质检窗口；已完成结果已保存，可稍后恢复。", { duration: 5_000 });
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "取消深度质检失败");
  }
}

async function locateDeepQualityFinding(finding: InkHubDeepQualityFinding): Promise<void> {
  const chapterId = finding.evidence[0]?.chapterId;
  if (!chapterId) return;
  const chapter = await ensureChapterLoaded(chapterId);
  if (!chapter) {
    uiMessage.warning("该证据章节已不在当前索引中，请更新全书索引。");
    return;
  }
  mode.value = "read";
  await openChapter(chapterId);
}

async function refreshAiRepairProgress(): Promise<void> {
  try {
    aiRepairProgress.value = await api().getNovelAiRepairProgress(props.entry.id);
  } catch {
    // The generation request remains authoritative; a transient progress poll
    // failure must not start a duplicate billable model call.
  }
}

function startAiProgressPolling(): void {
  if (aiProgressTimer) clearInterval(aiProgressTimer);
  void refreshAiRepairProgress();
  aiProgressTimer = setInterval(() => void refreshAiRepairProgress(), 800);
}

function stopAiProgressPolling(): void {
  if (aiProgressTimer) clearInterval(aiProgressTimer);
  aiProgressTimer = null;
}

async function generateAllAiRepairs(): Promise<void> {
  confirmAiRepairOpen.value = false;
  aiGenerating.value = true;
  aiRepairError.value = null;
  aiRepairProgress.value = {
    entryId: props.entry.id,
    stage: "preparing",
    completedBatches: 0,
    totalBatches: 0,
    completedChapters: 0,
    totalChapters: aiRepairTargetCount.value,
    message: "正在核对全书索引、Agent、Skill 与模型配置…",
    updatedAt: new Date().toISOString()
  };
  startAiProgressPolling();
  try {
    const plan = await (aiResumeMode.value ? api().resumeNovelAiRepairs : api().generateNovelAiRepairs)({
      entryId: props.entry.id,
      confirmBillable: true
    });
    aiRepairPlan.value = plan;
    aiRepairDrafts.value = createInkHubRepairReviewDrafts(plan);
    if (!plan.proposals.length) {
      uiMessage.success("当前质检结果无需调用模型修复。");
    } else {
      uiMessage.success(`AI 已生成 ${plan.proposals.length} 章修复稿；请逐章审阅，尚未写回原稿`);
      await nextTick();
      document.querySelector<HTMLElement>(".ai-repair-review")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error: unknown) {
    aiRepairError.value = error instanceof Error ? error.message : "一键 AI 修复失败";
    restoreRepairPlan(await api().getNovelAiRepairTask(props.entry.id).catch(() => null));
    uiMessage.error(aiRepairError.value);
  } finally {
    await refreshAiRepairProgress();
    stopAiProgressPolling();
    aiGenerating.value = false;
  }
}

async function cancelAiRepairs(): Promise<void> {
  try {
    const task = await api().cancelNovelAiRepairs({ entryId: props.entry.id, confirmCancel: true });
    restoreRepairPlan(task);
    aiGenerating.value = false;
    stopAiProgressPolling();
    uiMessage.warning("已请求取消；正在返回的当前批次会先安全落盘，不再开始下一批。", { duration: 5_000 });
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "取消 AI 修复失败");
  }
}

async function applyAcceptedAiRepairs(): Promise<void> {
  if (!acceptedAiRepairs.value.length) return;
  loading.value = true;
  try {
    const result = await api().applyNovelChapterRepairs({
      entryId: props.entry.id,
      confirmWrite: true,
      repairs: acceptedAiRepairs.value.map(({ proposal, content }) => ({
        chapterId: proposal.chapterId,
        expectedSourceRevision: proposal.expectedSourceRevision,
        content
      }))
    });
    confirmBatchWriteOpen.value = false;
    aiRepairPlan.value = null;
    aiRepairDrafts.value = [];
    summary.value = result.summary;
    chapters.value = [];
    nextCatalogOffset.value = 0;
    await loadCatalog(true);
    qualityReport.value = await api().runNovelQualityCheck(props.entry.id);
    deepQualityReport.value = null;
    deepQualityTask.value = null;
    deepQualityProgress.value = null;
    lastReaudit.value = result.reaudit ?? null;
    const reauditMessage = result.reaudit
      ? `；复检从 ${result.reaudit.beforeIssueCount} 项降至 ${result.reaudit.afterIssueCount} 项，已解决 ${result.reaudit.resolvedIssueIds.length} 项`
      : "";
    uiMessage.success(`已事务化写回 ${result.appliedChapterCount} 章、${result.appliedFileCount} 个文件；${result.backupsCreated} 份私有备份已保存${reauditMessage}`);
  } catch (error: unknown) {
    confirmBatchWriteOpen.value = false;
    uiMessage.error(error instanceof Error ? error.message : "批量写回 AI 修复稿失败");
  } finally {
    loading.value = false;
  }
}

async function refreshStoryProgress(): Promise<void> {
  storyProgress.value = await api().getStoryReconstructionProgress(props.entry.id).catch(() => storyProgress.value);
}

function startStoryProgressPolling(): void {
  if (storyProgressTimer) clearInterval(storyProgressTimer);
  void refreshStoryProgress();
  storyProgressTimer = setInterval(() => void refreshStoryProgress(), 900);
}

function stopStoryProgressPolling(): void {
  if (storyProgressTimer) clearInterval(storyProgressTimer);
  storyProgressTimer = null;
}

function confirmStoryAction(action: "reconstruct" | "continuation" | "forecast"): void {
  if (action === "continuation" && !authorIntent.value.trim()) {
    uiMessage.warning("请先写明这次续写要实现的作者意图。");
    return;
  }
  if (action === "forecast" && !forecastQuestion.value.trim()) {
    uiMessage.warning("请先写明希望推演的问题。");
    return;
  }
  storyAction.value = action;
}

async function executeStoryAction(): Promise<void> {
  const action = storyAction.value;
  if (!action) return;
  storyAction.value = null;
  storyBusy.value = true;
  try {
    if (action === "reconstruct") {
      startStoryProgressPolling();
      storyState.value = await api().reconstructStoryState({ entryId: props.entry.id, confirmBillable: true });
      uiMessage.success(storyState.value.summary.message);
    } else if (action === "continuation") {
      continuationResult.value = await api().generateStoryContinuation({
        entryId: props.entry.id, authorIntent: authorIntent.value.trim(), currentFocus: currentFocus.value.trim(),
        targetCharacters: targetCharacters.value, confirmBillable: true
      });
      uiMessage.success("续写草稿已在应用内生成；尚未写回，也不是正史。", { duration: 5_000 });
    } else {
      forecastResult.value = await api().generateStoryForecast({
        entryId: props.entry.id, question: forecastQuestion.value.trim(), branchCount: forecastBranchCount.value, confirmBillable: true
      });
      forecastHistory.value = (await api().listStoryForecasts(props.entry.id)).forecasts;
      uiMessage.success("非正史推演已生成；不会修改正文或故事状态。", { duration: 5_000 });
    }
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "创作内核任务失败");
  } finally {
    stopStoryProgressPolling();
    await refreshStoryProgress();
    storyBusy.value = false;
  }
}

async function prepareContext(purpose: "quality-check" | "continue-writing"): Promise<void> {
  loading.value = true;
  try {
    contextPacket.value = await api().createNovelContext(props.entry.id, purpose);
    if (purpose === "quality-check") qualityReport.value = await api().runNovelQualityCheck(props.entry.id);
  } catch (error: unknown) {
    uiMessage.error(error instanceof Error ? error.message : "准备上下文失败");
  } finally {
    loading.value = false;
  }
}

async function copyContext(): Promise<void> {
  if (!contextPacket.value) return;
  const text = [contextPacket.value.prompt, ...contextPacket.value.excerpts.map((item) => `\n## ${item.title}\n${item.content}`)].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    uiMessage.success("已复制可核对的续写 / 质检上下文");
  } catch {
    uiMessage.warning("系统未允许剪贴板写入，请手动选择下方内容。");
  }
}

function scheduleProgressSave(): void {
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = setTimeout(saveProgressNow, 700);
}

function saveProgressNow(): void {
  if (progressTimer) clearTimeout(progressTimer);
  progressTimer = null;
  const body = readerBody.value;
  const page = activePage.value;
  if (!body || !page || !activeChapterId.value) return;
  const available = Math.max(1, body.scrollHeight - body.clientHeight);
  const scrollFraction = Math.max(0, Math.min(1, body.scrollTop / available));
  void api().saveNovelReadingProgress({
    entryId: props.entry.id,
    chapterId: activeChapterId.value,
    characterOffset: Math.round(page.totalCharacters * scrollFraction),
    scrollFraction
  }).catch(() => undefined);
}

function closeReader(): void {
  saveProgressNow();
  emit("close");
}

onMounted(() => void loadSummary().catch((error: unknown) => uiMessage.error(error instanceof Error ? error.message : "加载阅读器失败")));
onBeforeUnmount(() => {
  requestEpoch += 1;
  stopAiProgressPolling();
  stopDeepQualityProgressPolling();
  stopStoryProgressPolling();
  saveProgressNow();
});
</script>

<template>
  <Teleport to="body">
    <section class="reader-shell" role="dialog" aria-modal="true" :aria-label="`${entry.title}逐章阅读器`">
      <header class="reader-header">
        <button class="back-button" type="button" @click="closeReader"><AppIcon name="undo" :size="16" />返回小说库</button>
        <div><span>只读全书工作台</span><h1>{{ entry.title }}</h1></div>
        <div class="reader-progress" role="status"><strong>{{ progressPercent }}%</strong><span>{{ summary?.chapterCount ?? 0 }} 章</span></div>
      </header>

      <nav class="reader-tabs" aria-label="全书工作台分类">
        <button type="button" :class="{ active: mode === 'read' }" :aria-current="mode === 'read' ? 'page' : undefined" @click="mode = 'read'">逐章阅读</button>
        <button type="button" :class="{ active: mode === 'search' }" :aria-current="mode === 'search' ? 'page' : undefined" @click="mode = 'search'">全文搜索</button>
        <button type="button" :class="{ active: mode === 'quality' }" :aria-current="mode === 'quality' ? 'page' : undefined" @click="mode = 'quality'">质检与续写</button>
        <button class="rebuild-button" type="button" :disabled="loading" @click="buildIndex"><AppIcon name="redo" :size="15" />{{ indexReady ? '更新全书索引' : '构建全书索引' }}</button>
      </nav>

      <div v-if="!indexReady" class="index-empty">
        <AppIcon name="library" :size="36" />
        <h2>先构建全书索引</h2>
        <p>墨枢会读取小说的全部可支持文本，区分正文与资料，把可搜索索引保存到应用私有目录；不改写原文件。</p>
        <button type="button" :disabled="loading" @click="buildIndex">{{ loading ? '正在逐文档读取…' : '构建全书索引' }}</button>
      </div>

      <div v-else-if="mode === 'read'" class="reader-layout">
        <aside class="chapter-sidebar" aria-label="章节目录">
          <header><strong>章节目录</strong><span>{{ chapters.length }} / {{ summary?.chapterCount }}</span></header>
          <div class="chapter-list">
            <section v-for="group in volumeGroups" :key="group.key" class="volume-group" :aria-label="group.title">
              <header><strong>{{ group.title }}</strong><span>{{ group.chapters.length }} 章</span></header>
              <button v-for="item in group.chapters" :key="item.chapter.id" type="button" :class="{ active: item.chapter.id === activeChapterId }" :aria-current="item.chapter.id === activeChapterId ? 'page' : undefined" @click="openChapter(item.chapter.id)">
                <span>{{ item.localOrdinal }}</span><div><strong>{{ item.chapter.title }}</strong><small>{{ item.chapter.relativePath }}</small></div>
              </button>
            </section>
            <button v-if="nextCatalogOffset !== null" class="load-more" type="button" :disabled="loading" @click="loadCatalog(false)">加载更多章节</button>
          </div>
        </aside>

        <main ref="readerBody" class="reading-pane" tabindex="0" @scroll.passive="scheduleProgressSave">
          <article v-if="activePage" class="reading-article">
            <header><span>{{ activeVolumePosition?.title }} · 卷内第 {{ activeVolumePosition?.localOrdinal ?? '—' }} 章</span><h2>{{ activePage.title }}</h2><small>{{ activeChapter?.relativePath }} · {{ activePage.totalCharacters.toLocaleString('zh-CN') }} 字</small></header>
            <div class="reading-content"><p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p></div>
            <button v-if="chapterNextOffset !== null" class="load-chapter" type="button" :disabled="loading" @click="loadMoreChapter">继续加载本章</button>
            <footer>
              <button type="button" :disabled="!activePage.previousChapterId || loading" @click="navigateChapter('previous')">上一章</button>
              <span>{{ progressPercent }}% · 只读</span>
              <button type="button" :disabled="!activePage.nextChapterId || loading" @click="navigateChapter('next')">下一章</button>
            </footer>
          </article>
          <div v-else class="pane-empty">从左侧选择一章开始阅读。</div>
        </main>
      </div>

      <main v-else-if="mode === 'search'" class="tool-pane">
        <header><span>完整本地索引</span><h2>全文搜索</h2><p>同时匹配正文和设定、大纲等资料；结果不会上传。</p></header>
        <form class="search-form" @submit.prevent="searchFullText"><label><AppIcon name="search" :size="16" /><input v-model="searchQuery" maxlength="200" placeholder="搜索人物、地点、伏笔或原句" /></label><button type="submit" :disabled="loading || !searchQuery.trim()">搜索</button></form>
        <div class="search-results">
          <button v-for="result in searchResults" :key="result.id" type="button" :disabled="!result.chapterId" @click="openSearchResult(result)"><span>{{ result.kind === 'chapter' ? '正文' : '资料' }}</span><div><strong>{{ result.title }}</strong><p>{{ result.snippet }}</p><small>{{ result.relativePath }}</small></div></button>
          <div v-if="searchQuery && !loading && !searchResults.length" class="pane-empty">没有找到匹配内容。</div>
        </div>
      </main>

      <main v-else class="tool-pane quality-pane">
        <header><span>全书工作流</span><h2>质检与续写</h2><p>本地质检不调用模型；故事状态、续写与推演只在确认后调用已选模型，生成结果默认不写回原稿。</p></header>
        <div class="workflow-actions">
          <button type="button" :disabled="loading" @click="runQualityCheck"><AppIcon name="check" :size="17" /><span><strong>本地全书质检</strong><small>空章、篇幅异常、跨章重复，每项可回到章节复核</small></span></button>
          <button type="button" :disabled="loading || deepQualityRunning" @click="openDeepQualityConfirmation(false)"><AppIcon name="sparkles" :size="17" /><span><strong>深度 AI 全书质检</strong><small>七个维度按卷审计，保存进度并可取消、恢复</small></span></button>
          <button type="button" :disabled="loading" @click="prepareContext('quality-check')"><AppIcon name="search" :size="17" /><span><strong>准备深度质检上下文</strong><small>生成可交给 AI 对话的有界证据包</small></span></button>
          <button type="button" :disabled="loading || storyBusy" @click="confirmStoryAction('reconstruct')"><AppIcon name="sparkles" :size="17" /><span><strong>{{ storyState?.summary.status === 'ready' ? '增量更新故事状态' : '构建故事状态' }}</strong><small>按卷和章节重建人物、事件、知识边界与伏笔证据</small></span></button>
          <button type="button" :disabled="loading" @click="prepareContext('continue-writing')"><AppIcon name="copy" :size="17" /><span><strong>复制兼容续写包</strong><small>供外部创作对话使用；应用内续写请使用下方工作台</small></span></button>
        </div>
        <section class="story-kernel-panel" aria-labelledby="story-kernel-title">
          <header><div><span>结构化创作内核</span><strong id="story-kernel-title">{{ storyState?.summary.message || '尚未构建故事状态' }}</strong></div><small v-if="storyState">{{ storyState.summary.analyzedChapters }}/{{ storyState.summary.totalChapters }} 章 · {{ storyState.summary.factCount }} 条事实 · 本次复用 {{ storyState.summary.reusedChapters }} 章</small></header>
          <progress v-if="storyProgress?.totalChapters && storyBusy" :value="storyProgress.completedChapters" :max="storyProgress.totalChapters">{{ storyProgress.completedChapters }}/{{ storyProgress.totalChapters }}</progress>
          <p v-if="storyProgress && storyBusy">{{ storyProgress.message }}</p>
          <div class="story-generator-grid">
            <section>
              <h3>应用内续写草稿</h3>
              <label><span>作者意图</span><textarea v-model="authorIntent" maxlength="4000" placeholder="例如：承接上一章，让林舟试探北门，但暂不揭晓钥匙来源"></textarea></label>
              <label><span>当前聚焦</span><input v-model="currentFocus" maxlength="2000" placeholder="可选：人物、冲突、场景或必须回收的伏笔" /></label>
              <label><span>目标字数</span><input v-model.number="targetCharacters" type="number" min="300" max="20000" step="100" /></label>
              <button type="button" :disabled="storyBusy || storyState?.summary.status !== 'ready' || !authorIntent.trim()" @click="confirmStoryAction('continuation')">用故事状态生成待审草稿</button>
            </section>
            <section>
              <h3>非正史剧情推演</h3>
              <label><span>推演问题</span><textarea v-model="forecastQuestion" maxlength="4000" placeholder="例如：北门之后有哪些相互不同且不破坏既有事实的发展路径？"></textarea></label>
              <label><span>分支数量</span><select v-model.number="forecastBranchCount"><option :value="2">2 个</option><option :value="3">3 个</option><option :value="4">4 个</option><option :value="5">5 个</option></select></label>
              <button type="button" :disabled="storyBusy || storyState?.summary.status !== 'ready' || !forecastQuestion.trim()" @click="confirmStoryAction('forecast')">生成非正史候选</button>
              <small v-if="forecastHistory.some((item) => item.stale)">历史推演中有基于旧故事状态的结果，已标记为过期。</small>
            </section>
          </div>
          <article v-if="continuationResult" class="continuation-result"><header><div><span>待审续写 · 非正史</span><strong>{{ continuationResult.title }}</strong></div><small>未写回原稿 · {{ continuationResult.evidence.length }} 条证据</small></header><ol><li v-for="item in continuationResult.plan" :key="item">{{ item }}</li></ol><textarea :value="continuationResult.draft" readonly aria-label="应用内续写草稿"></textarea><details><summary>连续性说明与证据</summary><p v-for="note in continuationResult.continuityNotes" :key="note">{{ note }}</p><blockquote v-for="evidence in continuationResult.evidence" :key="`${evidence.chapterId}:${evidence.startOffset}`">{{ evidence.volumeTitle }} · {{ evidence.chapterTitle }}：{{ evidence.excerpt }}</blockquote></details></article>
          <section v-if="forecastResult" class="forecast-result"><header><strong>非正史推演</strong><small>不会更新正文或故事状态</small></header><article v-for="branch in forecastResult.branches" :key="branch.id"><span>候选分支</span><h3>{{ branch.title }}</h3><p>{{ branch.premise }}</p><ol><li v-for="beat in branch.beats" :key="beat">{{ beat }}</li></ol><div><small>机会：{{ branch.opportunities.join('；') || '—' }}</small><small>风险：{{ branch.risks.join('；') || '—' }}</small></div></article></section>
        </section>
        <section v-if="deepQualityProgress || deepQualityError" class="ai-repair-status" :class="{ failed: !!deepQualityError }" :role="deepQualityError ? 'alert' : 'status'" aria-live="polite">
          <div><strong>{{ deepQualityError ? '深度 AI 质检已停止' : '深度 AI 质检进度' }}</strong><span>{{ deepQualityError || deepQualityProgress?.message }}</span></div>
          <progress v-if="deepQualityProgress?.totalWindows" :value="deepQualityProgress.completedWindows" :max="deepQualityProgress.totalWindows">{{ deepQualityProgress.completedWindows }}/{{ deepQualityProgress.totalWindows }}</progress>
          <small v-if="deepQualityProgress?.totalWindows">{{ deepQualityProgress.completedWindows }}/{{ deepQualityProgress.totalWindows }} 个分卷窗口 · {{ deepQualityProgress.findingCount }} 项发现</small>
          <div class="task-actions"><button v-if="deepQualityTask && ['failed', 'paused', 'cancelled'].includes(deepQualityTask.status)" type="button" :disabled="deepQualityRunning" @click="openDeepQualityConfirmation(true)">从已保存窗口继续</button><button v-if="deepQualityRunning" type="button" @click="cancelDeepQuality">取消后续窗口</button></div>
        </section>
        <section v-if="deepQualityReport" class="quality-report deep-quality-report">
          <header><div><strong>{{ deepQualityReport.findings.length }} 项深度发现</strong><span>{{ deepQualityReport.volumesAnalyzed }} 卷 · {{ deepQualityReport.chaptersAnalyzed }} 章 · 时间线/人物/世界/因果/POV/文风/伏笔</span></div><button v-if="deepQualityReport.findings.length" class="ai-repair-all" type="button" :disabled="loading || aiGenerating" @click="openAiRepairConfirmation(false)"><AppIcon name="sparkles" :size="15" />用对应 Agent / Skill 一键修复</button></header>
          <div v-if="!deepQualityReport.findings.length" class="quality-clear">七个深度质检维度均未返回需要复核的问题。</div>
          <article v-for="finding in deepQualityReport.findings.slice(0, 200)" :key="finding.id"><span>{{ finding.domain }}</span><div><strong>{{ finding.title }}</strong><p>{{ finding.detail }}</p><small>{{ finding.evidence.map((item) => `${item.volumeTitle || '未分卷'} · ${item.chapterTitle}`).join('；') }}</small><div class="capability-route"><span>Agents</span><i v-for="agent in finding.agents" :key="agent.id">{{ agent.name }}</i><span>Skills</span><i v-for="skill in finding.skills" :key="skill.id">{{ skill.name }}</i></div><div class="issue-actions"><button type="button" @click="locateDeepQualityFinding(finding)">定位证据章节</button></div></div></article>
          <p v-if="deepQualityReport.findings.length > 200" class="limit-note">界面先展示 200 项；完整报告与续作检查点仍保存在应用私有任务记录中。</p>
        </section>
        <section v-if="aiRepairProgress || aiRepairError" class="ai-repair-status" :class="{ failed: !!aiRepairError }" :role="aiRepairError ? 'alert' : 'status'" aria-live="polite">
          <div><strong>{{ aiRepairError ? 'AI 一键修复未开始或已停止' : 'AI 一键修复进度' }}</strong><span>{{ aiRepairError || aiRepairProgress?.message }}</span></div>
          <progress v-if="aiRepairProgress?.totalBatches" :value="aiRepairProgress.completedBatches" :max="aiRepairProgress.totalBatches">{{ aiRepairProgress.completedBatches }}/{{ aiRepairProgress.totalBatches }}</progress>
          <small v-if="aiRepairProgress?.totalChapters">{{ aiRepairProgress.completedChapters }}/{{ aiRepairProgress.totalChapters }} 章 · {{ aiRepairProgress.completedBatches }}/{{ aiRepairProgress.totalBatches }} 批</small>
          <div class="task-actions"><button v-if="aiRepairTask && ['failed', 'paused', 'cancelled'].includes(aiRepairTask.status)" type="button" :disabled="aiGenerating" @click="openAiRepairConfirmation(true)">从已保存批次继续</button><button v-if="aiGenerating" type="button" @click="cancelAiRepairs">取消后续批次</button></div>
        </section>
        <section v-if="lastReaudit" class="reaudit-summary"><strong>修复后自动复检</strong><span>{{ lastReaudit.beforeIssueCount }} → {{ lastReaudit.afterIssueCount }} 项；已解决 {{ lastReaudit.resolvedIssueIds.length }} 项，仍有 {{ lastReaudit.remainingIssueIds.length }} 项，新发现 {{ lastReaudit.newIssueIds.length }} 项。</span></section>
        <section v-if="qualityReport" class="quality-report"><header><div><strong>{{ qualityReport.issues.length }} 项问题</strong><span>覆盖 {{ qualityReport.coverage.indexedDocumentCount }}/{{ qualityReport.coverage.documentCount }} 个文档</span></div><button v-if="qualityReport.issues.length" class="ai-repair-all" type="button" :disabled="loading || aiGenerating" @click="openAiRepairConfirmation(false)"><AppIcon name="sparkles" :size="15" />{{ aiGenerating ? 'AI 正在分批修复…' : '一键 AI 修复全部' }}</button></header><div v-if="!qualityReport.issues.length" class="quality-clear">当前本地规则未发现问题；仍建议按需执行深度质检。</div><article v-for="issue in qualityReport.issues.slice(0, 200)" :key="issue.id"><span>{{ issue.severity === 'error' ? '错误' : issue.severity === 'warning' ? '警告' : '提示' }}</span><div><strong>{{ issue.title }}</strong><p>{{ issue.detail }}</p><div class="issue-actions"><button type="button" @click="locateQualityIssue(issue)">定位章节</button><button type="button" @click="startRepair(issue)">开始修复</button></div></div></article><p v-if="qualityReport.issues.length > 200" class="limit-note">界面先展示 200 项，索引中仍保留完整报告结果。</p></section>
        <InkHubRepairReviewList
          v-if="aiRepairPlan"
          class="ai-repair-review"
          :drafts="aiRepairDrafts"
          :model-label="aiRepairPlan.modelLabel"
          :issue-count="aiRepairPlan.issueCount"
          :loading="loading"
          @accept-all="chooseAllAiRepairs('accepted')"
          @keep-all="chooseAllAiRepairs('kept')"
          @decision="decideAiRepairDraft"
          @update="updateAiRepairDraft"
          @confirm-write="confirmBatchWriteOpen = true"
        />
        <section v-if="repairIssue && repairChapter" class="repair-editor" aria-labelledby="repair-editor-title"><header><div><span>修复工作台</span><strong id="repair-editor-title">{{ repairChapter.volumeTitle ? `${repairChapter.volumeTitle} · ` : '' }}{{ repairChapter.title }}</strong></div><button type="button" @click="closeRepair">关闭</button></header><p><strong>{{ repairIssue.title }}</strong>：{{ repairIssue.detail }}</p><label><span>完整修复稿</span><textarea v-model="repairContent" maxlength="2000000" spellcheck="true" aria-label="完整修复稿"></textarea></label><footer><small v-if="repairWriteSupported">写回前会再次核对源文件版本，并把原稿备份到墨枢私有目录。</small><small v-else>此来源格式暂不支持安全写回；可复制修复任务，在原编辑器中应用。</small><div><button type="button" @click="copyRepairTask"><AppIcon name="copy" :size="14" />复制修复任务</button><button type="button" :disabled="!repairChanged || !repairWriteSupported || loading" @click="confirmRepairOpen = true">确认写回原稿</button></div></footer></section>
        <section v-if="contextPacket" class="context-packet"><header><div><span>{{ contextPacket.purpose === 'continue-writing' ? '续写准备包' : '质检证据包' }}</span><strong>{{ contextPacket.excerpts.length }} 个可核对片段</strong></div><button type="button" @click="copyContext"><AppIcon name="copy" :size="15" />复制到创作对话</button></header><p>{{ contextPacket.prompt }}</p><details v-for="excerpt in contextPacket.excerpts" :key="`${excerpt.relativePath}:${excerpt.chapterId}`"><summary>{{ excerpt.title }} · {{ excerpt.relativePath }}</summary><div class="excerpt-text">{{ excerpt.content }}</div></details></section>
      </main>

      <div v-if="confirmRepairOpen && repairChapter" class="repair-confirm-backdrop" @click.self="confirmRepairOpen = false"><section role="alertdialog" aria-modal="true" aria-labelledby="repair-confirm-title"><span>高影响操作</span><h2 id="repair-confirm-title">确认写回原稿？</h2><p>将替换 <strong>{{ repairChapter.relativePath }}</strong> 中当前章节。墨枢会先保存私有备份；若文件自索引后有任何变化，将拒绝覆盖。</p><div><button type="button" @click="confirmRepairOpen = false">取消</button><button type="button" :disabled="loading" @click="applyRepair">{{ loading ? '正在安全写回…' : '确认写回' }}</button></div></section></div>
      <div v-if="confirmDeepQualityOpen" class="repair-confirm-backdrop" @click.self="confirmDeepQualityOpen = false"><section role="alertdialog" aria-modal="true" aria-labelledby="deep-quality-confirm-title"><span>可能产生模型费用</span><h2 id="deep-quality-confirm-title">{{ deepQualityResumeMode ? '从检查点继续深度质检？' : '执行七维深度 AI 质检？' }}</h2><p>墨枢会按卷隔离章节，调用当前已选模型分别检查时间线、人物知识与称谓、地点与世界观、因果、POV、文风和伏笔。每个完成窗口都会保存，正文证据必须逐字符匹配当前源文件。</p><p>只生成可复核报告，不会改写小说。{{ deepQualityResumeMode ? '已完成窗口会直接复用，不会重复调用。' : '' }}</p><div><button type="button" @click="confirmDeepQualityOpen = false">取消</button><button type="button" :disabled="deepQualityRunning" @click="runDeepQuality">确认并调用模型</button></div></section></div>
      <div v-if="confirmAiRepairOpen" class="repair-confirm-backdrop" @click.self="confirmAiRepairOpen = false"><section role="alertdialog" aria-modal="true" aria-labelledby="ai-repair-confirm-title"><span>可能产生模型费用</span><h2 id="ai-repair-confirm-title">{{ aiResumeMode ? '从检查点继续 AI 修复？' : '一键生成全部 AI 修复稿？' }}</h2><p>本次会调用当前已选模型，按问题匹配已安装的专家 Agent 与 Skill，处理 {{ totalRepairIssueCount }} 项本地与深度质检问题、涉及 {{ aiRepairTargetCount }} 章，预计至少 {{ minimumAiBatches }} 批模型调用。{{ aiResumeMode ? '已完成批次会直接复用，不会重复调用。' : '' }}</p><p>模型只生成待审稿，不会自动写回；每个完整批次都会立即保存在私有任务记录中。</p><div><button type="button" @click="confirmAiRepairOpen = false">取消</button><button type="button" :disabled="aiGenerating" @click="generateAllAiRepairs">{{ aiResumeMode ? '确认并继续' : '确认并开始 AI 修复' }}</button></div></section></div>
      <div v-if="storyAction" class="repair-confirm-backdrop" @click.self="storyAction = null"><section role="alertdialog" aria-modal="true" aria-labelledby="story-action-confirm-title"><span>可能产生模型费用</span><h2 id="story-action-confirm-title">确认执行{{ storyAction === 'reconstruct' ? '故事状态重建' : storyAction === 'continuation' ? '应用内续写' : '非正史推演' }}？</h2><p>将调用当前已选模型。{{ storyAction === 'reconstruct' ? '未变化章节会复用，只增量分析变化章节。' : '结果是待审候选，不会写回正文或改变正史状态。' }}</p><div><button type="button" @click="storyAction = null">取消</button><button type="button" :disabled="storyBusy" @click="executeStoryAction">确认并调用模型</button></div></section></div>
      <div v-if="confirmBatchWriteOpen" class="repair-confirm-backdrop" @click.self="confirmBatchWriteOpen = false"><section role="alertdialog" aria-modal="true" aria-labelledby="batch-repair-confirm-title"><span>高影响操作</span><h2 id="batch-repair-confirm-title">确认批量写回 {{ acceptedAiRepairs.length }} 章？</h2><p>墨枢会先预检全部章节并为每个源文件保存私有备份，再事务化提交。任一文件已变化、无法定位或写入失败时，将拒绝整批或自动回滚。</p><div><button type="button" @click="confirmBatchWriteOpen = false">继续审阅</button><button type="button" :disabled="loading || !acceptedAiRepairs.length" @click="applyAcceptedAiRepairs">{{ loading ? '正在安全写回…' : '确认批量写回' }}</button></div></section></div>

      <div v-if="summary?.warnings.length" class="index-warning" role="status"><strong>{{ summary.contentComplete ? '索引提示' : '索引尚未完整' }}</strong><span>{{ summary.warnings.slice(0, 3).join('；') }}</span></div>
    </section>
  </Teleport>
</template>

<style scoped>
.reader-shell { position: fixed; inset: 0; z-index: 4000; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; color: var(--text-primary); background: var(--surface-main); font-family: var(--ui-font); }
.reader-header { display: grid; grid-template-columns: 180px minmax(0, 1fr) 100px; align-items: center; gap: 20px; padding: 18px clamp(18px, 3vw, 42px) 12px; border-bottom: 1px solid var(--theme-line-soft); background: var(--surface-raised); }
.reader-header > div:nth-child(2) { text-align: center; }
.reader-header span { color: var(--text-tertiary); font-size: .72rem; letter-spacing: .08em; }
.reader-header h1 { margin: 3px 0 0; font: 700 clamp(21px, 2.4vw, 30px)/1.2 "Songti SC", "STSong", serif; }
.back-button,.rebuild-button,.reader-tabs button,.reading-article footer button,.load-more,.load-chapter,.search-form button,.context-packet header button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 38px; padding: 0 13px; border: 1px solid var(--theme-line); border-radius: 10px; color: var(--text-secondary); background: var(--surface-raised); white-space: nowrap; }
.back-button { justify-self: start; }
.reader-progress { display: grid; justify-items: end; }
.reader-progress strong { font: 600 24px/1 Georgia, serif; }
.reader-tabs { display: flex; align-items: center; gap: 6px; padding: 9px clamp(18px, 3vw, 42px); border-bottom: 1px solid var(--theme-line-soft); background: var(--surface-main); }
.reader-tabs button.active { color: var(--text-primary); border-color: var(--theme-line); background: var(--surface-selected); }
.reader-tabs .rebuild-button { margin-left: auto; color: var(--accent-text, var(--accent)); }
.reader-layout { display: grid; grid-template-columns: minmax(230px, 290px) minmax(0, 1fr); min-height: 0; }
.chapter-sidebar { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; border-right: 1px solid var(--theme-line); background: var(--surface-raised); }
.chapter-sidebar > header { display: flex; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--theme-line-soft); }
.chapter-sidebar > header span { color: var(--text-tertiary); font-size: .72rem; }
.chapter-list { min-height: 0; padding: 7px; overflow: auto; }
.volume-group { padding: 3px 0 8px; border-bottom: 1px solid var(--theme-line-soft); }.volume-group > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 9px 5px; color: var(--text-primary); }.volume-group > header strong { font-size: .74rem; }.volume-group > header span { color: var(--text-tertiary); font-size: .64rem; white-space: nowrap; }
.volume-group > button { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 7px; width: 100%; padding: 9px; border: 0; border-radius: 9px; color: var(--text-secondary); background: transparent; text-align: left; }
.volume-group > button:hover,.volume-group > button.active { color: var(--text-primary); background: var(--surface-selected); }
.volume-group > button > span { color: var(--text-tertiary); font: 600 .72rem/1.5 Georgia, serif; text-align: right; }
.chapter-list div { display: grid; gap: 3px; min-width: 0; }
.chapter-list strong,.chapter-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chapter-list strong { font-size: .78rem; }.chapter-list small { color: var(--text-tertiary); font-size: .66rem; }
.load-more { width: 100%; margin-top: 8px; }
.reading-pane { min-height: 0; overflow: auto; scroll-behavior: smooth; outline: 0; background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 36%); }
.reading-article { width: min(760px, calc(100% - 48px)); margin: 0 auto; padding: clamp(36px, 6vw, 72px) 0 60px; }
.reading-article > header { margin-bottom: 34px; text-align: center; }
.reading-article > header span,.reading-article > header small { color: var(--text-tertiary); font-size: .72rem; }
.reading-article h2 { margin: 7px 0 9px; font: 700 clamp(25px, 3vw, 35px)/1.35 "Songti SC", "STSong", serif; }
.reading-content { color: var(--text-primary); font-family: var(--editor-font, "Songti SC", "STSong", serif); font-size: 1.08rem; line-height: 2; }
.reading-content p { margin: 0 0 1.25em; white-space: pre-wrap; overflow-wrap: anywhere; }
.reading-article footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 38px; padding-top: 18px; border-top: 1px solid var(--theme-line-soft); }
.reading-article footer span { color: var(--text-tertiary); font-size: .72rem; }
.load-chapter { display: flex; margin: 24px auto 0; }
.tool-pane { min-height: 0; overflow: auto; padding: 34px clamp(20px, 5vw, 70px) 60px; }
.tool-pane > header { width: min(900px, 100%); margin: 0 auto 22px; }.tool-pane > header span { color: var(--accent-text, var(--accent)); font-size: .72rem; font-weight: 700; letter-spacing: .1em; }.tool-pane h2 { margin: 5px 0; font: 700 28px/1.3 "Songti SC", "STSong", serif; }.tool-pane > header p { margin: 0; color: var(--text-secondary); }
.search-form { display: flex; gap: 9px; width: min(900px, 100%); margin: 0 auto 18px; }.search-form label { display: flex; flex: 1; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--theme-line); border-radius: 11px; background: var(--surface-raised); }.search-form input { width: 100%; min-width: 0; padding: 11px 0; border: 0; outline: 0; color: var(--text-primary); background: transparent; }
.search-results,.workflow-actions,.quality-report,.context-packet,.repair-editor,.ai-repair-review { display: grid; gap: 9px; width: min(900px, 100%); margin: 0 auto; }
.search-results > button,.workflow-actions > button,.quality-report article { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: 14px; border: 1px solid var(--theme-line-soft); border-radius: 12px; color: var(--text-secondary); background: var(--surface-raised); text-align: left; }.search-results > button > span,.quality-report article > span { color: var(--accent-text, var(--accent)); font-size: .7rem; }.search-results p,.quality-report p { margin: 5px 0; line-height: 1.65; }.search-results small { color: var(--text-tertiary); }
.workflow-actions { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 20px; }.workflow-actions > button { display: flex; align-items: flex-start; }.workflow-actions span { display: grid; gap: 5px; }.workflow-actions small { color: var(--text-tertiary); line-height: 1.5; }
.ai-repair-status { display: grid; gap: 9px; width: min(900px, 100%); margin: 0 auto 18px; padding: 14px 16px; border: 1px solid var(--accent); border-radius: 12px; background: color-mix(in srgb, var(--accent) 6%, var(--surface-raised)); }.ai-repair-status.failed { border-color: var(--danger, #b84a4a); background: color-mix(in srgb, var(--danger, #b84a4a) 7%, var(--surface-raised)); }.ai-repair-status > div { display: grid; gap: 4px; }.ai-repair-status span,.ai-repair-status small { color: var(--text-secondary); line-height: 1.55; }.ai-repair-status progress { width: 100%; accent-color: var(--accent); }
.task-actions { display: flex !important; flex-wrap: wrap; gap: 8px; }.task-actions button,.story-kernel-panel button { min-height: 36px; padding: 0 12px; border: 1px solid var(--accent); border-radius: 9px; color: var(--accent-contrast, white); background: var(--accent); }.task-actions button:last-child { color: var(--danger, #b84a4a); border-color: var(--danger, #b84a4a); background: transparent; }
.story-kernel-panel { display: grid; gap: 14px; width: min(900px, 100%); margin: 0 auto 20px; padding: 18px; border: 1px solid var(--theme-line); border-radius: 15px; background: var(--surface-raised); }.story-kernel-panel > header,.continuation-result > header,.forecast-result > header { display: flex; align-items: center; justify-content: space-between; gap: 14px; }.story-kernel-panel > header > div,.continuation-result > header > div { display: grid; gap: 4px; }.story-kernel-panel > header span,.continuation-result > header span,.forecast-result article > span { color: var(--accent-text, var(--accent)); font-size: .7rem; font-weight: 700; }.story-kernel-panel > header small,.continuation-result > header small,.forecast-result > header small { color: var(--text-tertiary); }.story-kernel-panel > progress { width: 100%; accent-color: var(--accent); }.story-kernel-panel > p { margin: 0; color: var(--text-secondary); }
.story-generator-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.story-generator-grid > section { display: grid; align-content: start; gap: 10px; min-width: 0; padding: 14px; border: 1px solid var(--theme-line-soft); border-radius: 12px; background: var(--surface-main); }.story-generator-grid h3 { margin: 0; font: 700 18px/1.35 "Songti SC", serif; }.story-generator-grid label { display: grid; gap: 5px; color: var(--text-secondary); font-size: .72rem; }.story-generator-grid textarea,.story-generator-grid input,.story-generator-grid select { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid var(--theme-line); border-radius: 8px; outline: 0; color: var(--text-primary); background: var(--surface-raised); font: inherit; }.story-generator-grid textarea { min-height: 86px; resize: vertical; line-height: 1.6; }.story-generator-grid small { color: var(--text-tertiary); line-height: 1.5; }
.continuation-result,.forecast-result { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--accent); border-radius: 12px; background: color-mix(in srgb, var(--accent) 4%, var(--surface-main)); }.continuation-result > textarea { width: 100%; min-height: 320px; resize: vertical; padding: 14px; border: 1px solid var(--theme-line); border-radius: 10px; color: var(--text-primary); background: var(--surface-raised); font: .92rem/1.85 var(--editor-font, "Songti SC", serif); }.continuation-result details { color: var(--text-secondary); line-height: 1.6; }.continuation-result blockquote { margin: 8px 0; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--surface-raised); }.forecast-result { grid-template-columns: repeat(2, minmax(0, 1fr)); }.forecast-result > header { grid-column: 1 / -1; }.forecast-result article { padding: 12px; border: 1px solid var(--theme-line-soft); border-radius: 10px; background: var(--surface-raised); }.forecast-result article h3 { margin: 4px 0; }.forecast-result article p,.forecast-result article li { color: var(--text-secondary); line-height: 1.6; }.forecast-result article > div { display: grid; gap: 5px; color: var(--text-tertiary); }
.reaudit-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: min(900px, 100%); margin: 0 auto 18px; padding: 12px 16px; border: 1px solid var(--accent); border-radius: 11px; color: var(--text-secondary); background: color-mix(in srgb, var(--accent) 5%, var(--surface-raised)); }.reaudit-summary strong { color: var(--text-primary); white-space: nowrap; }
.quality-report,.context-packet { margin-top: 18px; padding: 18px; border: 1px solid var(--theme-line); border-radius: 15px; background: var(--surface-raised); }.quality-report > header,.context-packet > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.quality-report > header > div { display: grid; gap: 3px; }.quality-report > header span { color: var(--text-tertiary); }.quality-report article { padding: 10px 0; border: 0; border-top: 1px solid var(--theme-line-soft); border-radius: 0; }.context-packet header > div { display: grid; gap: 4px; }.context-packet header span { color: var(--accent-text, var(--accent)); font-size: .72rem; }.context-packet > p,.excerpt-text { color: var(--text-secondary); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }.context-packet details { padding: 9px 0; border-top: 1px solid var(--theme-line-soft); }.context-packet summary { cursor: pointer; }.excerpt-text { padding: 12px 4px; }
.ai-repair-all { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 14px; border: 1px solid var(--accent); border-radius: 10px; color: var(--accent-contrast, white); background: var(--accent); white-space: nowrap; }.ai-repair-review { margin-top: 18px; padding: 18px; border: 1px solid var(--accent); border-radius: 15px; background: var(--surface-raised); }.ai-repair-review > header,.ai-repair-review article > header,.ai-repair-review > footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; }.ai-repair-review > header > div,.ai-repair-review article > header > div { display: grid; gap: 3px; }.ai-repair-review > header span,.ai-repair-review article > header span { color: var(--accent-text, var(--accent)); font-size: .7rem; }.ai-repair-review > header small,.ai-repair-review article > header small { color: var(--text-tertiary); }.review-batch-actions { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 12px -8px 0; padding: 11px 12px; border: 1px solid var(--theme-line); border-radius: 11px; background: color-mix(in srgb, var(--surface-raised) 94%, transparent); box-shadow: 0 8px 20px color-mix(in srgb, var(--text-primary) 8%, transparent); backdrop-filter: blur(10px); }.review-batch-actions > div:first-child { display: grid; gap: 2px; }.review-batch-actions small { color: var(--text-tertiary); }.review-batch-actions > div:last-child { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }.review-batch-actions button { min-height: 34px; padding: 0 11px; border: 1px solid var(--theme-line); border-radius: 9px; color: var(--text-secondary); background: var(--surface-main); white-space: nowrap; }.review-batch-actions button:last-child { color: var(--accent-contrast, white); border-color: var(--accent); background: var(--accent); }.ai-repair-review article { display: grid; gap: 12px; padding: 16px 0; border-top: 1px solid var(--theme-line-soft); }.ai-repair-review article.rejected { opacity: .72; }.ai-repair-review article.accepted { border-left: 3px solid var(--accent); padding-left: 12px; }.ai-repair-review article > p,.ai-repair-review > footer p { margin: 0; color: var(--text-secondary); line-height: 1.65; }.review-choice { display: flex; gap: 6px; }.review-choice button,.ai-repair-review > footer button { min-height: 34px; padding: 0 11px; border: 1px solid var(--theme-line); border-radius: 9px; color: var(--text-secondary); background: var(--surface-main); white-space: nowrap; }.review-choice button.active,.ai-repair-review > footer button { color: var(--accent-contrast, white); border-color: var(--accent); background: var(--accent); }.review-decision-status { color: var(--text-tertiary); font-size: .72rem; }.ai-repair-review article.accepted .review-decision-status { color: var(--accent-text, var(--accent)); }.capability-route { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }.capability-route span { color: var(--text-tertiary); font-size: .67rem; font-weight: 700; text-transform: uppercase; }.capability-route i { padding: 3px 7px; border: 1px solid var(--theme-line-soft); border-radius: 999px; color: var(--text-secondary); background: var(--surface-main); font-size: .68rem; font-style: normal; }.repair-comparison { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 10px; }.repair-comparison details,.repair-comparison label { min-width: 0; padding: 10px; border: 1px solid var(--theme-line-soft); border-radius: 10px; background: var(--surface-main); }.repair-comparison summary,.repair-comparison label > span { color: var(--text-secondary); font-size: .72rem; cursor: pointer; }.original-content { max-height: 320px; margin: 10px 0 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: .8rem/1.7 var(--editor-font, "Songti SC", serif); }.repair-comparison label { display: grid; gap: 7px; }.repair-comparison textarea { width: 100%; min-height: 300px; resize: vertical; padding: 10px; border: 1px solid var(--theme-line); border-radius: 8px; outline: 0; color: var(--text-primary); background: var(--surface-raised); font: .84rem/1.75 var(--editor-font, "Songti SC", serif); }.ai-repair-review > footer { align-items: flex-end; }.ai-repair-review > footer p { max-width: 610px; font-size: .72rem; }
.quality-clear { padding: 22px 10px; color: var(--text-secondary); text-align: center; }.issue-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }.issue-actions button,.repair-editor button,.repair-confirm-backdrop button { min-height: 34px; padding: 0 11px; border: 1px solid var(--theme-line); border-radius: 9px; color: var(--text-secondary); background: var(--surface-main); }.issue-actions button:last-child { color: var(--accent-text, var(--accent)); }
.repair-editor { margin-top: 18px; padding: 18px; border: 1px solid var(--accent); border-radius: 15px; background: var(--surface-raised); }.repair-editor > header,.repair-editor > footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.repair-editor > header > div { display: grid; gap: 3px; }.repair-editor > header span { color: var(--accent-text, var(--accent)); font-size: .7rem; font-weight: 700; }.repair-editor > p { margin: 5px 0; color: var(--text-secondary); line-height: 1.65; }.repair-editor label { display: grid; gap: 7px; }.repair-editor label > span { color: var(--text-secondary); font-size: .74rem; }.repair-editor textarea { width: 100%; min-height: 360px; resize: vertical; padding: 14px; border: 1px solid var(--theme-line); border-radius: 11px; outline: 0; color: var(--text-primary); background: var(--surface-main); font: .92rem/1.8 var(--editor-font, "Songti SC", serif); }.repair-editor footer small { max-width: 520px; color: var(--text-tertiary); line-height: 1.5; }.repair-editor footer > div { display: flex; gap: 8px; }.repair-editor footer > div button:last-child,.repair-confirm-backdrop button:last-child { color: var(--accent-contrast, white); border-color: var(--accent); background: var(--accent); }
.repair-confirm-backdrop { position: fixed; inset: 0; z-index: 4010; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--text-primary) 28%, transparent); backdrop-filter: blur(5px); }.repair-confirm-backdrop > section { width: min(480px, 100%); padding: 22px; border: 1px solid var(--theme-line); border-radius: 16px; background: var(--surface-raised); box-shadow: 0 22px 65px rgba(0,0,0,.22); }.repair-confirm-backdrop span { color: var(--accent-text, var(--accent)); font-size: .7rem; font-weight: 700; letter-spacing: .08em; }.repair-confirm-backdrop h2 { margin: 6px 0 10px; font: 700 24px/1.3 "Songti SC", serif; }.repair-confirm-backdrop p { color: var(--text-secondary); line-height: 1.7; }.repair-confirm-backdrop > section > div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
.index-empty,.pane-empty { display: grid; place-items: center; align-content: center; min-height: 0; padding: 40px; color: var(--text-secondary); text-align: center; }.index-empty h2 { margin: 12px 0 6px; }.index-empty p { max-width: 620px; line-height: 1.7; }.index-empty button { min-height: 42px; margin-top: 12px; padding: 0 18px; border: 0; border-radius: 10px; color: var(--accent-contrast, white); background: var(--accent); }
.index-warning { display: flex; gap: 10px; padding: 9px clamp(18px, 3vw, 42px); border-top: 1px solid var(--theme-line); color: var(--text-secondary); background: var(--surface-muted); font-size: .72rem; }.index-warning strong { color: var(--text-primary); white-space: nowrap; }
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,[tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }button:disabled { opacity: .45; cursor: not-allowed; }
@media (max-width: 1100px) { .workflow-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 820px) { .reader-header { grid-template-columns: auto minmax(0, 1fr); }.reader-progress { display: none; }.reader-tabs { flex-wrap: wrap; }.reader-tabs .rebuild-button { margin-left: 0; }.reader-layout { grid-template-columns: 210px minmax(0, 1fr); }.workflow-actions,.repair-comparison,.story-generator-grid,.forecast-result { grid-template-columns: 1fr; }.reading-article { width: min(680px, calc(100% - 30px)); }.reader-header > div:nth-child(2) { text-align: right; }.ai-repair-review > header,.ai-repair-review article > header,.ai-repair-review > footer,.review-batch-actions,.story-kernel-panel > header,.continuation-result > header,.reaudit-summary { align-items: stretch; flex-direction: column; }.review-batch-actions > div:last-child { justify-content: stretch; }.review-batch-actions button { flex: 1 1 auto; } }
@media (max-width: 620px) { .reader-layout { grid-template-columns: 1fr; }.chapter-sidebar { position: absolute; z-index: 2; width: min(78vw, 300px); height: calc(100% - 112px); box-shadow: 14px 0 30px rgba(0,0,0,.12); }.reading-pane { margin-left: 56px; }.reader-tabs button { flex: 1 1 auto; }.reader-tabs .rebuild-button { flex-basis: 100%; } }
</style>
