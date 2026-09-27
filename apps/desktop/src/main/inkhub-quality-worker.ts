import { parentPort } from "node:worker_threads";
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
  type InkHubNovelChapterRepairInput,
  type InkHubNovelReadingProgress
} from "@deepwrite/contracts";
import { InkHubNovelKnowledgeService } from "./inkhub-novel-knowledge";

type QualityWorkerRequest = {
  id: number;
  indexDirectory: string;
  operation: "summary";
  entryId: string;
} | {
  id: number;
  indexDirectory: string;
  operation: "quality";
  entryId: string;
} | {
  id: number;
  indexDirectory: string;
  operation: "refresh";
  entryId: string;
  entryPath: string;
} | {
  id: number;
  indexDirectory: string;
  operation: "build";
  entryId: string;
  title: string;
  entryPath: string;
} | {
  id: number;
  indexDirectory: string;
  operation: "list-chapters";
  entryId: string;
  offset: number;
  limit: number;
} | {
  id: number;
  indexDirectory: string;
  operation: "read-chapter";
  entryId: string;
  chapterId: string;
  offset: number;
  limit: number;
} | {
  id: number;
  indexDirectory: string;
  operation: "search";
  entryId: string;
  query: string;
  limit: number;
} | {
  id: number;
  indexDirectory: string;
  operation: "context";
  entryId: string;
  purpose: "quality-check" | "continue-writing";
} | {
  id: number;
  indexDirectory: string;
  operation: "get-progress";
  entryId: string;
} | {
  id: number;
  indexDirectory: string;
  operation: "save-progress";
  input: Omit<InkHubNovelReadingProgress, "updatedAt">;
} | {
  id: number;
  indexDirectory: string;
  operation: "apply-chapter-repair";
  input: InkHubNovelChapterRepairInput;
  entryPath: string;
} | {
  id: number;
  indexDirectory: string;
  operation: "apply-chapter-repairs";
  input: InkHubNovelBatchRepairInput;
  entryPath: string;
};

if (!parentPort) throw new Error("墨枢本地质检 Worker 缺少父线程通道。");

let service: InkHubNovelKnowledgeService | null = null;
let activeIndexDirectory: string | null = null;
let operationChain = Promise.resolve();

function knowledge(indexDirectory: string): InkHubNovelKnowledgeService {
  if (activeIndexDirectory && activeIndexDirectory !== indexDirectory) {
    throw new Error("小说索引 Worker 收到了不一致的数据目录。");
  }
  activeIndexDirectory = indexDirectory;
  service ??= new InkHubNovelKnowledgeService(indexDirectory);
  return service;
}

async function handle(request: QualityWorkerRequest): Promise<unknown> {
  const novelKnowledge = knowledge(request.indexDirectory);
  switch (request.operation) {
    case "summary":
      return InkHubNovelIndexSummarySchema.parse(novelKnowledge.getSummary(request.entryId));
    case "quality":
      return InkHubNovelQualityReportSchema.parse(novelKnowledge.runLocalQualityCheck(request.entryId));
    case "refresh":
      return InkHubNovelIndexSummarySchema.parse(
        await novelKnowledge.refreshSourceFreshness(request.entryId, request.entryPath)
      );
    case "build":
      return InkHubNovelIndexSummarySchema.parse(await novelKnowledge.build({
        entryId: request.entryId,
        title: request.title,
        entryPath: request.entryPath
      }));
    case "list-chapters":
      return InkHubNovelChapterCatalogSchema.parse(
        novelKnowledge.listChapters(request.entryId, request.offset, request.limit)
      );
    case "read-chapter":
      return InkHubNovelChapterPageSchema.parse(novelKnowledge.readChapter(
        request.entryId,
        request.chapterId,
        request.offset,
        request.limit
      ));
    case "search":
      return InkHubNovelSearchResponseSchema.parse(
        novelKnowledge.search(request.entryId, request.query, request.limit)
      );
    case "context":
      return InkHubNovelContextPacketSchema.parse(
        novelKnowledge.createContextPacket(request.entryId, request.purpose)
      );
    case "get-progress": {
      const progress = novelKnowledge.getProgress(request.entryId);
      return progress === null ? null : InkHubNovelReadingProgressSchema.parse(progress);
    }
    case "save-progress":
      return InkHubNovelReadingProgressSchema.parse(novelKnowledge.saveProgress(request.input));
    case "apply-chapter-repair":
      return InkHubNovelChapterRepairResultSchema.parse(await novelKnowledge.applyChapterRepair({
        ...request.input,
        entryPath: request.entryPath
      }));
    case "apply-chapter-repairs":
      return InkHubNovelBatchRepairResultSchema.parse(await novelKnowledge.applyChapterRepairs({
        entryId: request.input.entryId,
        entryPath: request.entryPath,
        repairs: request.input.repairs
      }));
  }
}

parentPort.on("message", (request: QualityWorkerRequest) => {
  operationChain = operationChain.then(async () => {
    try {
      parentPort!.postMessage({ id: request.id, started: true });
      const result = await handle(request);
      parentPort!.postMessage({ id: request.id, ok: true, result });
    } catch (error: unknown) {
      parentPort!.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : "小说索引 Worker 失败"
      });
    }
  });
});
