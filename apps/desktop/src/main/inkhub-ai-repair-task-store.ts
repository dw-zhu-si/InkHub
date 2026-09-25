import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  InkHubNovelAiRepairTaskSchema,
  type InkHubNovelAiRepairTask
} from "@deepwrite/contracts";

interface TaskRow {
  task_json: string;
}

export interface InkHubAiRepairTaskRepository {
  get(entryId: string): InkHubNovelAiRepairTask | null;
  put(task: InkHubNovelAiRepairTask): InkHubNovelAiRepairTask;
}

export class InkHubAiRepairTaskStore implements InkHubAiRepairTaskRepository {
  private readonly database: DatabaseSync;

  constructor(storageDirectory: string) {
    mkdirSync(storageDirectory, { recursive: true, mode: 0o700 });
    const path = join(storageDirectory, "ai-repair-tasks.sqlite");
    this.database = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    this.database.exec(`CREATE TABLE IF NOT EXISTS ai_repair_tasks (
      entry_id TEXT PRIMARY KEY,
      task_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`);
  }

  get(entryId: string): InkHubNovelAiRepairTask | null {
    const row = this.database.prepare("SELECT task_json FROM ai_repair_tasks WHERE entry_id = ?").get(entryId) as unknown as TaskRow | undefined;
    if (!row) return null;
    try {
      return InkHubNovelAiRepairTaskSchema.parse(JSON.parse(row.task_json));
    } catch {
      throw new Error("AI 修复任务记录已损坏；为避免重复计费，已停止自动恢复。");
    }
  }

  put(rawTask: InkHubNovelAiRepairTask): InkHubNovelAiRepairTask {
    const task = InkHubNovelAiRepairTaskSchema.parse(rawTask);
    this.database.prepare("INSERT OR REPLACE INTO ai_repair_tasks(entry_id,task_json,updated_at) VALUES (?,?,?)")
      .run(task.entryId, JSON.stringify(task), task.updatedAt);
    return task;
  }
}

export class MemoryInkHubAiRepairTaskStore implements InkHubAiRepairTaskRepository {
  private readonly tasks = new Map<string, InkHubNovelAiRepairTask>();

  get(entryId: string): InkHubNovelAiRepairTask | null {
    const task = this.tasks.get(entryId);
    return task ? InkHubNovelAiRepairTaskSchema.parse(structuredClone(task)) : null;
  }

  put(task: InkHubNovelAiRepairTask): InkHubNovelAiRepairTask {
    const parsed = InkHubNovelAiRepairTaskSchema.parse(structuredClone(task));
    this.tasks.set(task.entryId, parsed);
    return parsed;
  }
}
