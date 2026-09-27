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
  consume(entryId: string, consumedAt?: string): InkHubNovelAiRepairTask | null;
}

export class InkHubAiRepairTaskStore implements InkHubAiRepairTaskRepository {
  private databaseInstance: DatabaseSync | null = null;
  private readonly databasePath: string;

  constructor(storageDirectory: string) {
    this.databasePath = join(storageDirectory, "ai-repair-tasks.sqlite");
  }

  private database(): DatabaseSync {
    if (this.databaseInstance) return this.databaseInstance;
    const storageDirectory = join(this.databasePath, "..");
    mkdirSync(storageDirectory, { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(this.databasePath);
    chmodSync(this.databasePath, 0o600);
    database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    database.exec(`CREATE TABLE IF NOT EXISTS ai_repair_tasks (
      entry_id TEXT PRIMARY KEY,
      task_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`);
    this.databaseInstance = database;
    return database;
  }

  private read(entryId: string): InkHubNovelAiRepairTask | null {
    const row = this.database().prepare("SELECT task_json FROM ai_repair_tasks WHERE entry_id = ?").get(entryId) as unknown as TaskRow | undefined;
    if (!row) return null;
    try {
      return InkHubNovelAiRepairTaskSchema.parse(JSON.parse(row.task_json));
    } catch {
      throw new Error("AI 修复任务记录已损坏；为避免重复计费，已停止自动恢复。");
    }
  }

  get(entryId: string): InkHubNovelAiRepairTask | null {
    const task = this.read(entryId);
    return task?.status === "consumed" ? null : task;
  }

  put(rawTask: InkHubNovelAiRepairTask): InkHubNovelAiRepairTask {
    const task = InkHubNovelAiRepairTaskSchema.parse(rawTask);
    this.database().prepare("INSERT OR REPLACE INTO ai_repair_tasks(entry_id,task_json,updated_at) VALUES (?,?,?)")
      .run(task.entryId, JSON.stringify(task), task.updatedAt);
    return task;
  }

  consume(
    entryId: string,
    consumedAt = new Date().toISOString()
  ): InkHubNovelAiRepairTask | null {
    const task = this.read(entryId);
    if (!task || task.status === "consumed") return task;
    return this.put({
      ...task,
      status: "consumed",
      lastError: null,
      updatedAt: consumedAt
    });
  }

  close(): void {
    this.databaseInstance?.close();
    this.databaseInstance = null;
  }
}

export class MemoryInkHubAiRepairTaskStore implements InkHubAiRepairTaskRepository {
  private readonly tasks = new Map<string, InkHubNovelAiRepairTask>();

  get(entryId: string): InkHubNovelAiRepairTask | null {
    const task = this.tasks.get(entryId);
    if (!task || task.status === "consumed") return null;
    return InkHubNovelAiRepairTaskSchema.parse(structuredClone(task));
  }

  put(task: InkHubNovelAiRepairTask): InkHubNovelAiRepairTask {
    const parsed = InkHubNovelAiRepairTaskSchema.parse(structuredClone(task));
    this.tasks.set(task.entryId, parsed);
    return parsed;
  }

  consume(
    entryId: string,
    consumedAt = new Date().toISOString()
  ): InkHubNovelAiRepairTask | null {
    const task = this.tasks.get(entryId);
    if (!task) return null;
    if (task.status === "consumed") {
      return InkHubNovelAiRepairTaskSchema.parse(structuredClone(task));
    }
    return this.put({
      ...task,
      status: "consumed",
      lastError: null,
      updatedAt: consumedAt
    });
  }
}
