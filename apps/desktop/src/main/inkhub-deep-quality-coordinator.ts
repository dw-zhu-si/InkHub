import { randomUUID } from "node:crypto";
import {
  InkHubDeepQualityCancelRequestSchema,
  InkHubDeepQualityCheckpointSchema,
  InkHubDeepQualityProgressSchema,
  InkHubDeepQualityReportSchema,
  InkHubDeepQualityRequestSchema,
  InkHubDeepQualityTaskSchema,
  type AgentProviderRuntimeConfig,
  type AgentRuntimeRef,
  type AgentUsage,
  type InkHubDeepQualityProgress,
  type InkHubDeepQualityReport,
  type InkHubDeepQualityTask,
  type InkHubNovelChapter,
  type InkHubNovelChapterCatalog,
  type InkHubNovelChapterPage,
  type InkHubNovelIndexSummary
} from "@deepwrite/contracts";
import { PiAgentRuntimeAdapter } from "@deepwrite/pi-runtime-adapter";
import { assertSupportedModelEndpoint } from "./modelhub-endpoint";
import {
  InkHubDeepQualityCancelledError,
  InkHubDeepQualityService,
  type InkHubDeepQualityExecutorInput
} from "./inkhub-deep-quality-service";
import {
  MemoryInkHubDeepQualityTaskStore,
  type InkHubDeepQualityTaskRepository
} from "./inkhub-deep-quality-task-store";

const MAX_DEEP_QUALITY_CHAPTER_CHARACTERS = 500_000;
const MAX_DEEP_QUALITY_TOTAL_CHARACTERS = 100_000_000;

interface InkHubDeepQualityAssets {
  getNovelIndex(entryId: string): Promise<InkHubNovelIndexSummary>;
  listNovelChapters(entryId: string, offset: number, limit: number): Promise<InkHubNovelChapterCatalog>;
  readNovelChapter(entryId: string, chapterId: string, offset: number, limit: number): Promise<InkHubNovelChapterPage>;
}

interface InkHubDeepQualityModels {
  resolve(modelId?: string): Promise<AgentProviderRuntimeConfig | undefined>;
}

export interface InkHubDeepQualityRunnerResult {
  content: string;
  runtime: AgentRuntimeRef;
  usage?: AgentUsage;
}

export interface InkHubDeepQualityRunner {
  run(input: InkHubDeepQualityExecutorInput & {
    runtimeConfig: AgentProviderRuntimeConfig;
  }): Promise<InkHubDeepQualityRunnerResult>;
}

class PiInkHubDeepQualityRunner implements InkHubDeepQualityRunner {
  async run(input: InkHubDeepQualityExecutorInput & {
    runtimeConfig: AgentProviderRuntimeConfig;
  }): Promise<InkHubDeepQualityRunnerResult> {
    const runtime = new PiAgentRuntimeAdapter({
      systemPrompt: input.systemPrompt,
      idleTimeoutMs: 180_000
    });
    let completed: InkHubDeepQualityRunnerResult | undefined;
    for await (const event of runtime.start({
      runId: `inkhub_deep_quality_${input.domain}_${randomUUID()}`,
      sessionId: `inkhub_deep_quality_session_${randomUUID()}`,
      prompt: input.prompt,
      runtimeConfig: input.runtimeConfig,
      thinkingLevel: input.runtimeConfig.defaultThinkingLevel,
      ...(input.runtimeConfig.defaultThinkingLevel === "off" ? { temperature: 0.1 } : {})
    })) {
      if (event.type === "agent.error") {
        throw new Error(`模型深度质检失败：${event.payload.message}`);
      }
      if (event.type === "agent.completed") {
        completed = {
          content: event.payload.content,
          runtime: event.payload.runtime,
          ...(event.payload.usage ? { usage: event.payload.usage } : {})
        };
      }
    }
    if (!completed) throw new Error("模型深度质检没有返回完整结果。");
    return completed;
  }
}

export interface InkHubDeepQualityCoordinatorOptions {
  assets: InkHubDeepQualityAssets;
  models: InkHubDeepQualityModels;
  runner?: InkHubDeepQualityRunner;
  allowFauxWithoutModel?: boolean;
  taskStore?: InkHubDeepQualityTaskRepository;
  recordUsage?: (input: {
    runtimeConfig: AgentProviderRuntimeConfig;
    runtime: AgentRuntimeRef;
    usage: AgentUsage;
    observationId: string;
    occurredAt: string;
  }) => Promise<void> | void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "深度质检失败").slice(0, 2_000);
}

export class InkHubDeepQualityCoordinator {
  private readonly runner: InkHubDeepQualityRunner;
  private readonly taskStore: InkHubDeepQualityTaskRepository;
  private generationInProgress = false;

  constructor(private readonly options: InkHubDeepQualityCoordinatorOptions) {
    this.runner = options.runner ?? new PiInkHubDeepQualityRunner();
    this.taskStore = options.taskStore ?? new MemoryInkHubDeepQualityTaskStore();
  }

  getTask(entryId: string): InkHubDeepQualityTask | null {
    return this.taskStore.get(entryId);
  }

  getProgress(entryId: string): InkHubDeepQualityProgress | null {
    return this.taskStore.get(entryId)?.progress ?? null;
  }

  getCompletedReport(entryId: string): InkHubDeepQualityReport | null {
    const task = this.taskStore.get(entryId);
    return task?.status === "completed" ? task.report : null;
  }

  cancel(rawInput: unknown): InkHubDeepQualityTask {
    const input = InkHubDeepQualityCancelRequestSchema.parse(rawInput);
    const task = this.taskStore.get(input.entryId);
    if (!task) throw new Error("没有可取消的深度质检任务。");
    if (task.status === "completed") throw new Error("深度质检任务已经完成，无需取消。");
    const updatedAt = nowIso();
    return this.taskStore.put(InkHubDeepQualityTaskSchema.parse({
      ...task,
      status: "cancelled",
      progress: {
        ...task.progress,
        stage: "cancelled",
        message: "用户已取消；已完成窗口仍保存在私有任务记录中。",
        updatedAt
      },
      lastError: null,
      updatedAt
    }));
  }

  run(rawInput: unknown): Promise<InkHubDeepQualityReport> {
    return this.runAudit(rawInput, false);
  }

  resume(rawInput: unknown): Promise<InkHubDeepQualityReport> {
    return this.runAudit(rawInput, true);
  }

  private async readAllChapters(entryId: string): Promise<Array<{
    chapterId: string;
    chapterTitle: string;
    volumeTitle: string | null;
    relativePath: string;
    ordinal: number;
    sourceRevision: string;
    content: string;
  }>> {
    const chapters: InkHubNovelChapter[] = [];
    let catalogOffset = 0;
    while (true) {
      const catalog = await this.options.assets.listNovelChapters(entryId, catalogOffset, 500);
      chapters.push(...catalog.chapters);
      if (catalog.nextOffset === null) break;
      catalogOffset = catalog.nextOffset;
      if (chapters.length > 100_000) throw new Error("章节目录超过深度质检安全上限。");
    }

    const result = [];
    let aggregateCharacters = 0;
    for (let index = 0; index < chapters.length; index += 1) {
      const chapter = chapters[index]!;
      const parts: string[] = [];
      let offset = 0;
      let chapterCharacters = 0;
      while (true) {
        const page = await this.options.assets.readNovelChapter(entryId, chapter.id, offset, 200_000);
        if (page.sourceRevision !== chapter.sourceRevision) {
          throw new Error(`《${chapter.title}》在深度质检准备期间已变化，请更新索引后重试。`);
        }
        parts.push(page.content);
        chapterCharacters += page.content.length;
        if (chapterCharacters > MAX_DEEP_QUALITY_CHAPTER_CHARACTERS) {
          throw new Error(`《${chapter.title}》超过单章 50 万字的深度质检安全上限。`);
        }
        if (page.nextOffset === null) break;
        offset = page.nextOffset;
      }
      const content = parts.join("");
      if (!content.trim()) throw new Error(`《${chapter.title}》为空，请先完成本地质检修复再运行深度质检。`);
      aggregateCharacters += content.length;
      if (aggregateCharacters > MAX_DEEP_QUALITY_TOTAL_CHARACTERS) {
        throw new Error("全书正文超过一亿字符的深度质检安全上限，请按作品拆分后处理。");
      }
      result.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        volumeTitle: chapter.volumeTitle,
        relativePath: chapter.relativePath,
        ordinal: chapter.ordinal,
        sourceRevision: chapter.sourceRevision,
        content
      });
      if ((index + 1) % 20 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return result;
  }

  private async runAudit(rawInput: unknown, resumeOnly: boolean): Promise<InkHubDeepQualityReport> {
    const input = InkHubDeepQualityRequestSchema.parse(rawInput);
    if (this.generationInProgress) throw new Error("已有深度质检任务正在运行，请等待或取消后再试。");
    this.generationInProgress = true;
    let task: InkHubDeepQualityTask | null = null;
    try {
      const summary = await this.options.assets.getNovelIndex(input.entryId);
      if (summary.status === "stale") throw new Error("小说原文件已变化，请先更新全书索引。");
      if (!summary.contentComplete || !summary.contentHash) {
        throw new Error("全书索引尚未完整，不能执行深度质检。请先处理索引警告并更新全书索引。");
      }
      const previous = resumeOnly ? this.taskStore.get(input.entryId) : null;
      if (resumeOnly && !previous) throw new Error("没有可恢复的深度质检任务，请重新开始。");
      if (previous && previous.sourceContentHash !== summary.contentHash) {
        throw new Error("全书内容自上次任务后已变化；为避免复用旧证据，请重新开始深度质检。");
      }
      if (previous?.status === "completed" && previous.report) return previous.report;

      const resolved = await this.options.models.resolve(input.modelId ?? previous?.requestedModelId ?? undefined);
      const runtimeConfig = resolved ?? (this.options.allowFauxWithoutModel
        ? {
            id: "inkhub-acceptance-faux",
            label: "墨枢验收 Faux",
            provider: "modelhub",
            modelId: "inkhub-acceptance-faux",
            api: "openai-completions" as const,
            baseUrl: "http://127.0.0.1:11435/v1",
            reasoning: false,
            defaultThinkingLevel: "off" as const,
            thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"] as const,
            temperatureOptions: [0.1, 0.7, 1] as const,
            apiKey: ""
          }
        : undefined);
      if (!runtimeConfig) throw new Error("请先在模型配置中添加并选择一个文本模型。");
      assertSupportedModelEndpoint(runtimeConfig.provider, runtimeConfig.baseUrl);

      const checkpoint = InkHubDeepQualityCheckpointSchema.parse(previous?.checkpoint ?? {
        nextInvocation: 0,
        findings: []
      });
      const initialProgress = InkHubDeepQualityProgressSchema.parse({
        entryId: input.entryId,
        stage: "preparing",
        completedWindows: checkpoint.nextInvocation,
        totalWindows: Math.max(previous?.progress.totalWindows ?? 0, checkpoint.nextInvocation),
        findingCount: checkpoint.findings.length,
        message: "正在读取全书章节并核对源文件版本…",
        updatedAt: nowIso()
      });
      task = this.taskStore.put(InkHubDeepQualityTaskSchema.parse({
        entryId: input.entryId,
        status: "running",
        sourceContentHash: summary.contentHash,
        requestedModelId: input.modelId ?? previous?.requestedModelId ?? null,
        modelId: runtimeConfig.id,
        modelLabel: runtimeConfig.label,
        progress: initialProgress,
        checkpoint,
        report: null,
        lastError: null,
        updatedAt: initialProgress.updatedAt
      }));

      const chapters = await this.readAllChapters(input.entryId);
      const service = new InkHubDeepQualityService({
        executor: {
          execute: async (executorInput) => {
            const result = await this.runner.run({ ...executorInput, runtimeConfig });
            if (result.usage && this.options.recordUsage) {
              await this.options.recordUsage({
                runtimeConfig,
                runtime: result.runtime,
                usage: result.usage,
                observationId: randomUUID(),
                occurredAt: nowIso()
              });
            }
            return { content: result.content };
          }
        },
        isCancelled: () => this.taskStore.get(input.entryId)?.status === "cancelled",
        onCheckpoint: (nextCheckpoint, totalInvocations) => {
          const current = this.taskStore.get(input.entryId);
          const updatedAt = nowIso();
          const cancelled = current?.status === "cancelled";
          task = this.taskStore.put(InkHubDeepQualityTaskSchema.parse({
            ...(current ?? task!),
            status: cancelled ? "cancelled" : "running",
            progress: {
              entryId: input.entryId,
              stage: cancelled ? "cancelled" : "analyzing",
              completedWindows: nextCheckpoint.nextInvocation,
              totalWindows: totalInvocations,
              findingCount: nextCheckpoint.findings.length,
              message: cancelled
                ? "用户已取消；已完成窗口仍已保存。"
                : `已完成 ${nextCheckpoint.nextInvocation}/${totalInvocations} 个分卷质检窗口。`,
              updatedAt
            },
            checkpoint: nextCheckpoint,
            report: null,
            lastError: null,
            updatedAt
          }));
        }
      });
      const report = InkHubDeepQualityReportSchema.parse(await service.audit({
        entryId: input.entryId,
        chapters,
        checkpoint: {
          nextInvocation: checkpoint.nextInvocation,
          findings: checkpoint.findings.map(({ repairInstruction, ...finding }) => ({
            ...finding,
            ...(repairInstruction ? { repairInstruction } : {})
          }))
        }
      }));
      const updatedAt = nowIso();
      task = this.taskStore.put(InkHubDeepQualityTaskSchema.parse({
        ...task,
        status: "completed",
        progress: {
          ...task.progress,
          stage: "completed",
          completedWindows: task.progress.totalWindows,
          findingCount: report.findings.length,
          message: `深度质检完成，发现 ${report.findings.length} 项需复核问题。`,
          updatedAt
        },
        checkpoint: { nextInvocation: task.progress.totalWindows, findings: report.findings },
        report,
        lastError: null,
        updatedAt
      }));
      return report;
    } catch (error: unknown) {
      if (task) {
        const current = this.taskStore.get(input.entryId) ?? task;
        const cancelled = error instanceof InkHubDeepQualityCancelledError || current.status === "cancelled";
        const updatedAt = nowIso();
        this.taskStore.put(InkHubDeepQualityTaskSchema.parse({
          ...current,
          status: cancelled ? "cancelled" : "failed",
          progress: {
            ...current.progress,
            stage: cancelled ? "cancelled" : "failed",
            message: cancelled ? "任务已取消；可从已保存窗口继续。" : errorMessage(error),
            updatedAt
          },
          lastError: cancelled ? null : errorMessage(error),
          updatedAt
        }));
      }
      throw error;
    } finally {
      this.generationInProgress = false;
    }
  }
}
