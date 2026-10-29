export type TopicStatus = "idea" | "selected" | "developing" | "archived";
export type EvidenceKind = "source" | "author" | "inference";
export interface TopicEvidence {
  id: string;
  kind: EvidenceKind;
  label: string;
  url: string;
  observedAt: string;
  note: string;
}
export interface TopicRecord {
  id: string;
  title: string;
  genre: string;
  audience: string;
  promise: string;
  conflict: string;
  status: TopicStatus;
  updatedAt: string;
  evidence: TopicEvidence[];
  bookLink?: { bookId: string; workspaceType: "short" | "script" | "long"; title: string };
}
export const TOPIC_STORAGE_KEY = "inkhub-topic-archive-v1";
export const MAX_TOPIC_RECORDS = 1_000;
export const MAX_EVIDENCE_PER_TOPIC = 100;

export function normalizeEvidenceUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.toString() : "";
  } catch { return ""; }
}

/** A failed read or concurrent change blocks writes so an empty view cannot replace stored records. */
export function createTopicArchiveStorage(storage: Pick<Storage, "getItem" | "setItem">) {
  let baseline: string | null = null;
  let readable = false;
  return {
    read(): TopicRecord[] {
      readable = false;
      baseline = storage.getItem(TOPIC_STORAGE_KEY);
      const parsed: unknown = JSON.parse(baseline ?? "[]");
      if (!Array.isArray(parsed)) throw new Error("选题档案格式异常，原记录已保留，请先恢复档案后重试。");
      const ids = new Set<string>();
      for (const item of parsed) {
        if (!item || !["id", "title", "genre", "audience", "promise", "conflict", "updatedAt"].every((field) => typeof item[field] === "string") || !["idea", "selected", "developing", "archived"].includes(item.status) || !Array.isArray(item.evidence) || ids.has(item.id)) {
          throw new Error("选题档案格式异常，原记录已保留，请先恢复档案后重试。");
        }
        ids.add(item.id);
        if (item.bookLink !== undefined && (!item.bookLink || typeof item.bookLink.bookId !== "string" || typeof item.bookLink.title !== "string" || !["short", "script", "long"].includes(item.bookLink.workspaceType))) {
          throw new Error("选题作品关联格式异常，原记录已保留。");
        }
        for (const proof of item.evidence) {
          if (!proof || !["id", "label", "url", "observedAt", "note"].every((field) => typeof proof[field] === "string") || !["source", "author", "inference"].includes(proof.kind)) throw new Error("选题证据格式异常，原记录已保留。");
          proof.url = typeof proof.url === "string" ? normalizeEvidenceUrl(proof.url) : "";
        }
      }
      readable = true;
      return parsed as TopicRecord[];
    },
    write(records: TopicRecord[]): void {
      if (!readable) throw new Error("档案尚未成功读取，无法覆盖原记录。");
      if (storage.getItem(TOPIC_STORAGE_KEY) !== baseline) {
        throw new Error("选题档案已在其他窗口更新，请重新打开后重试。");
      }
      const encoded = JSON.stringify(records);
      storage.setItem(TOPIC_STORAGE_KEY, encoded);
      baseline = encoded;
    }
  };
}
