import type { InkHubNovelIndexSummary, InkHubStoryStateSummary } from "@deepwrite/contracts";

export type HealthStatus = "current" | "stale" | "missing" | "partial" | "busy" | "failed" | "unknown";
export interface HealthIndicator { status: HealthStatus; label: string; detail: string }
export interface NovelHealthResult {
  entryId: string;
  checkedAt: string;
  index: InkHubNovelIndexSummary | null;
  story: InkHubStoryStateSummary | null;
  indexError: string | null;
  storyError: string | null;
}
export interface NovelHealthApi {
  getNovelIndex(entryId: string, verifyFreshness: boolean): Promise<InkHubNovelIndexSummary>;
  getStoryState(entryId: string): Promise<{ summary: InkHubStoryStateSummary }>;
}

/** At most one source verification and one story snapshot, strictly sequential. */
export async function checkNovelHealth(
  entryId: string,
  api: NovelHealthApi,
  active: () => boolean = () => true,
  now: () => string = () => new Date().toISOString()
): Promise<NovelHealthResult | null> {
  const result: NovelHealthResult = { entryId, checkedAt: now(), index: null, story: null, indexError: null, storyError: null };
  try { result.index = await api.getNovelIndex(entryId, true); }
  catch (error) { result.indexError = error instanceof Error ? error.message : "全文索引读取失败"; }
  if (!active()) return null;
  // Source/index errors cannot establish a reliable base version for derived data.
  if (result.index && result.index.status !== "not-indexed") {
    try { result.story = (await api.getStoryState(entryId)).summary; }
    catch (error) { result.storyError = error instanceof Error ? error.message : "故事状态读取失败"; }
  }
  if (!active()) return null;
  result.checkedAt = now();
  return result;
}

export function indexHealth(result: NovelHealthResult | null): HealthIndicator {
  if (!result) return { status: "unknown", label: "未检查", detail: "点击检查后校验原稿变化" };
  if (result.indexError) return { status: "failed", label: "读取失败", detail: result.indexError };
  const index = result.index;
  if (!index) return { status: "unknown", label: "未知", detail: "没有可用的索引状态" };
  const detail = `${index.indexedDocumentCount}/${index.documentCount} 文档 · ${index.chapterCount} 章`;
  if (index.status === "not-indexed") return { status: "missing", label: "尚未索引", detail };
  if (index.status === "stale") return { status: "stale", label: "原稿已变化", detail: `${detail}，请更新索引` };
  if (index.status === "indexing") return { status: "busy", label: "正在索引", detail };
  if (index.status === "failed") return { status: "failed", label: "索引失败", detail: index.warnings.join("；") || detail };
  if (index.status === "partial" || !index.contentComplete) return { status: "partial", label: "索引不完整", detail };
  if (!index.contentHash) return { status: "unknown", label: "版本未知", detail };
  return { status: "current", label: "与原稿一致", detail };
}

/** Facts and chapter summaries share the same reconstruction version and coverage. */
export function storyHealth(result: NovelHealthResult | null): HealthIndicator {
  if (!result) return { status: "unknown", label: "未检查", detail: "故事事实和章节摘要使用同一重建版本" };
  if (result.storyError) return { status: "failed", label: "读取失败", detail: result.storyError };
  const story = result.story;
  if (!story) return { status: "unknown", label: "未确认", detail: "先建立可用全文索引，再核对故事事实与摘要" };
  if (story.status === "not-built") return { status: "missing", label: "尚未生成", detail: "在阅读器的质检与续写中显式重建故事状态" };
  if (indexHealth(result).status !== "current") return { status: "stale", label: "来源待更新", detail: "当前索引未与完整原稿对齐，已有事实和摘要不可视为最新" };
  if (story.status === "stale" || (story.sourceContentHash && story.sourceContentHash !== result.index?.contentHash)) return { status: "stale", label: "版本已陈旧", detail: "故事状态的来源版本与当前索引不同" };
  if (story.status === "building") return { status: "busy", label: "正在重建", detail: `${story.analyzedChapters}/${story.totalChapters} 章` };
  if (story.status === "failed") return { status: "failed", label: "重建失败", detail: story.message };
  if (story.status === "partial" || story.pendingChapters > 0 || story.failedChapters > 0 || story.analyzedChapters < story.totalChapters) return { status: "partial", label: "覆盖不完整", detail: `${story.analyzedChapters}/${story.totalChapters} 章，${story.failedChapters} 章失败` };
  if (!story.sourceContentHash || !story.stateVersion) return { status: "unknown", label: "版本未知", detail: "缺少可比对的来源或状态版本" };
  return { status: "current", label: "与索引一致", detail: `${story.analyzedChapters}/${story.totalChapters} 章 · ${story.factCount} 条事实；AI 内容仍需作者审阅` };
}
