import { Worker } from "node:worker_threads";
import {
  InkHubNovelBatchRepairResultSchema,
  InkHubNovelChapterCatalogSchema,
  InkHubNovelChapterPageSchema,
  InkHubNovelChapterRepairResultSchema,
  InkHubNovelContextPacketSchema,
  InkHubNovelIndexSummarySchema,
  InkHubNovelQualityReportSchema,
  InkHubNovelReadingProgressSchema,
  InkHubNovelSearchResponseSchema,
  type InkHubNovelBatchRepairInput,
  type InkHubNovelBatchRepairResult,
  type InkHubNovelChapterCatalog,
  type InkHubNovelChapterPage,
  type InkHubNovelChapterRepairInput,
  type InkHubNovelChapterRepairResult,
  type InkHubNovelContextPacket,
  type InkHubNovelIndexSummary,
  type InkHubNovelQualityReport,
  type InkHubNovelReadingProgress,
  type InkHubNovelSearchResponse
} from "@deepwrite/contracts";

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

type WorkerRequest = {
  operation: "summary";
  entryId: string;
} | {
  operation: "quality";
  entryId: string;
} | {
  operation: "refresh";
  entryId: string;
  entryPath: string;
} | {
  operation: "build";
  entryId: string;
  title: string;
  entryPath: string;
} | {
  operation: "list-chapters";
  entryId: string;
  offset: number;
  limit: number;
} | {
  operation: "read-chapter";
  entryId: string;
  chapterId: string;
  offset: number;
  limit: number;
} | {
  operation: "search";
  entryId: string;
  query: string;
  limit: number;
} | {
  operation: "context";
  entryId: string;
  purpose: "quality-check" | "continue-writing";
} | {
  operation: "get-progress";
  entryId: string;
} | {
  operation: "save-progress";
  input: Omit<InkHubNovelReadingProgress, "updatedAt">;
} | {
  operation: "apply-chapter-repair";
  input: InkHubNovelChapterRepairInput;
  entryPath: string;
} | {
  operation: "apply-chapter-repairs";
  input: InkHubNovelBatchRepairInput;
  entryPath: string;
};

interface PendingRequest {
  label: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class InkHubQualityWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly workerPath: string,
    private readonly indexDirectory: string
  ) {}

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private stopWorker(error?: Error): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.removeAllListeners();
      void worker.terminate();
    }
    if (error) this.rejectPending(error);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(this.workerPath);
    this.worker = worker;
    // This reusable database worker is a performance boundary, not an app
    // lifetime owner. Active calls keep their own promises and timeouts.
    worker.unref();
    worker.on("message", (raw: WorkerResponse) => {
      const pending = this.pending.get(raw.id);
      if (!pending) return;
      this.pending.delete(raw.id);
      clearTimeout(pending.timeout);
      if (!raw.ok) {
        pending.reject(new Error(raw.error || `${pending.label}后台任务失败。`));
        return;
      }
      pending.resolve(raw.result);
    });
    worker.once("error", (error) => {
      if (this.worker !== worker) return;
      this.stopWorker(new Error(
        `小说索引后台服务失败：${error instanceof Error ? error.message : "未知错误"}`,
        { cause: error }
      ));
    });
    worker.once("exit", (code) => {
      if (this.worker !== worker) return;
      this.stopWorker(new Error(`小说索引后台服务提前退出（code ${code}）。`));
    });
    return worker;
  }

  private runWorker(
    request: WorkerRequest,
    timeoutMs: number,
    label: string
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const worker = this.ensureWorker();
      const id = this.nextRequestId++;
      const timeout = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.stopWorker(new Error(`${label}超过安全时限，已停止并重置后台任务。`));
      }, timeoutMs);
      this.pending.set(id, { label, resolve, reject, timeout });
      worker.postMessage({ id, ...request, indexDirectory: this.indexDirectory });
    });
  }

  async summary(entryId: string): Promise<InkHubNovelIndexSummary> {
    return InkHubNovelIndexSummarySchema.parse(
      await this.runWorker({ operation: "summary", entryId }, 120_000, "小说索引状态读取")
    );
  }

  async run(entryId: string): Promise<InkHubNovelQualityReport> {
    try {
      return InkHubNovelQualityReportSchema.parse(
        await this.runWorker({ operation: "quality", entryId }, 120_000, "本地全书质检")
      );
    } catch (error) {
      if (error instanceof Error && /无效报告/u.test(error.message)) throw error;
      throw new Error(
        error instanceof Error && /后台|安全时限/u.test(error.message)
          ? error.message
          : "本地质检后台任务返回了无效报告。",
        { cause: error }
      );
    }
  }

  async refresh(entryId: string, entryPath: string): Promise<InkHubNovelIndexSummary> {
    try {
      return InkHubNovelIndexSummarySchema.parse(
        await this.runWorker(
          { operation: "refresh", entryId, entryPath },
          120_000,
          "小说来源校验"
        )
      );
    } catch (error) {
      if (error instanceof Error && /后台|安全时限/u.test(error.message)) throw error;
      throw new Error("小说来源校验 Worker 返回了无效状态。", { cause: error });
    }
  }

  async build(input: {
    entryId: string;
    title: string;
    entryPath: string;
  }): Promise<InkHubNovelIndexSummary> {
    try {
      return InkHubNovelIndexSummarySchema.parse(
        await this.runWorker(
          { operation: "build", ...input },
          600_000,
          "全书索引"
        )
      );
    } catch (error) {
      if (error instanceof Error && /后台|安全时限/u.test(error.message)) throw error;
      throw new Error("全书索引 Worker 返回了无效状态。", { cause: error });
    }
  }

  async listChapters(entryId: string, offset: number, limit: number): Promise<InkHubNovelChapterCatalog> {
    return InkHubNovelChapterCatalogSchema.parse(await this.runWorker(
      { operation: "list-chapters", entryId, offset, limit },
      120_000,
      "章节目录读取"
    ));
  }

  async readChapter(
    entryId: string,
    chapterId: string,
    offset: number,
    limit: number
  ): Promise<InkHubNovelChapterPage> {
    return InkHubNovelChapterPageSchema.parse(await this.runWorker(
      { operation: "read-chapter", entryId, chapterId, offset, limit },
      120_000,
      "章节正文读取"
    ));
  }

  async search(entryId: string, query: string, limit: number): Promise<InkHubNovelSearchResponse> {
    return InkHubNovelSearchResponseSchema.parse(await this.runWorker(
      { operation: "search", entryId, query, limit },
      120_000,
      "全书搜索"
    ));
  }

  async context(
    entryId: string,
    purpose: "quality-check" | "continue-writing"
  ): Promise<InkHubNovelContextPacket> {
    return InkHubNovelContextPacketSchema.parse(await this.runWorker(
      { operation: "context", entryId, purpose },
      120_000,
      "全书上下文构建"
    ));
  }

  async getProgress(entryId: string): Promise<InkHubNovelReadingProgress | null> {
    const result = await this.runWorker({ operation: "get-progress", entryId }, 30_000, "阅读进度读取");
    return result === null ? null : InkHubNovelReadingProgressSchema.parse(result);
  }

  async saveProgress(
    input: Omit<InkHubNovelReadingProgress, "updatedAt">
  ): Promise<InkHubNovelReadingProgress> {
    return InkHubNovelReadingProgressSchema.parse(await this.runWorker(
      { operation: "save-progress", input },
      30_000,
      "阅读进度保存"
    ));
  }

  async applyChapterRepair(
    input: InkHubNovelChapterRepairInput,
    entryPath: string
  ): Promise<InkHubNovelChapterRepairResult> {
    try {
      return InkHubNovelChapterRepairResultSchema.parse(
        await this.runWorker(
          { operation: "apply-chapter-repair", input, entryPath },
          600_000,
          "章节修复写回"
        )
      );
    } catch (error) {
      if (error instanceof Error && /后台|安全时限/u.test(error.message)) throw error;
      throw new Error("章节修复 Worker 返回了无效结果。", { cause: error });
    }
  }

  async applyChapterRepairs(
    input: InkHubNovelBatchRepairInput,
    entryPath: string
  ): Promise<InkHubNovelBatchRepairResult> {
    try {
      return InkHubNovelBatchRepairResultSchema.parse(
        await this.runWorker(
          { operation: "apply-chapter-repairs", input, entryPath },
          600_000,
          "批量修复写回"
        )
      );
    } catch (error) {
      if (error instanceof Error && /后台|安全时限/u.test(error.message)) throw error;
      throw new Error("批量修复 Worker 返回了无效结果。", { cause: error });
    }
  }
}
