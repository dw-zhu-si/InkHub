import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  InkHubDeepQualityTaskSchema,
  type InkHubDeepQualityTask
} from "@deepwrite/contracts";

interface TaskRow {
  task_json: string;
}

export interface InkHubDeepQualityTaskRepository {
  get(entryId: string): InkHubDeepQualityTask | null;
  put(task: InkHubDeepQualityTask): InkHubDeepQualityTask;
}

export class InkHubDeepQualityTaskStore implements InkHubDeepQualityTaskRepository {
  private readonly database: DatabaseSync;

  constructor(storageDirectory: string) {
    mkdirSync(storageDirectory, { recursive: true, mode: 0o700 });
    const path = join(storageDirectory, "deep-quality-tasks.sqlite");
    this.database = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    this.database.exec(`CREATE TABLE IF NOT EXISTS deep_quality_tasks (
      entry_id TEXT PRIMARY KEY,
      task_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`);
  }

  get(entryId: string): InkHubDeepQualityTask | null {
    const row = this.database.prepare("SELECT task_json FROM deep_quality_tasks WHERE entry_id = ?")
      .get(entryId) as unknown as TaskRow | undefined;
    if (!row) return null;
    try {
      return InkHubDeepQualityTaskSchema.parse(JSON.parse(row.task_json));
    } catch {
      throw new Error("深度质检任务记录已损坏；为避免重复计费，已停止自动恢复。");
    }
  }

  put(rawTask: InkHubDeepQualityTask): InkHubDeepQualityTask {
    const task = InkHubDeepQualityTaskSchema.parse(rawTask);
    this.database.prepare(
      "INSERT OR REPLACE INTO deep_quality_tasks(entry_id,task_json,updated_at) VALUES (?,?,?)"
    ).run(task.entryId, JSON.stringify(task), task.updatedAt);
    return task;
  }
}

export class MemoryInkHubDeepQualityTaskStore implements InkHubDeepQualityTaskRepository {
  private readonly tasks = new Map<string, InkHubDeepQualityTask>();

  get(entryId: string): InkHubDeepQualityTask | null {
    const task = this.tasks.get(entryId);
    return task ? InkHubDeepQualityTaskSchema.parse(structuredClone(task)) : null;
  }

  put(task: InkHubDeepQualityTask): InkHubDeepQualityTask {
    const parsed = InkHubDeepQualityTaskSchema.parse(structuredClone(task));
    this.tasks.set(task.entryId, parsed);
    return parsed;
  }
}
