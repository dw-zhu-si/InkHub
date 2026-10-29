import { describe, expect, it } from "vitest";
import { createTopicArchiveStorage, normalizeEvidenceUrl, TOPIC_STORAGE_KEY, type TopicRecord } from "./topicArchiveStorage";

function fixture() {
  let value: string | null = null;
  let failWrite = false;
  return {
    getItem: (_key: string) => value,
    setItem: (_key: string, next: string) => { if (failWrite) throw new Error("QuotaExceededError"); value = next; },
    setRaw: (next: string) => { value = next; },
    fail: () => { failWrite = true; }
  };
}
const record: TopicRecord = { id: "topic_test", title: "测试选题", genre: "悬疑", audience: "读者", promise: "谜题", conflict: "代价", status: "idea", updatedAt: "2026-10-29", evidence: [] };

describe("topic archive persistence", () => {
  it("preserves previous data when the write fails", () => {
    const storage = fixture();
    const archive = createTopicArchiveStorage(storage);
    expect(archive.read()).toEqual([]);
    archive.write([record]);
    storage.fail();
    expect(() => archive.write([{ ...record, title: "未保存的修改" }])).toThrow();
    expect(JSON.parse(storage.getItem(TOPIC_STORAGE_KEY)!)).toEqual([record]);
  });
  it("does not overwrite corrupted data after a failed read", () => {
    const storage = fixture();
    storage.setRaw("broken JSON");
    const archive = createTopicArchiveStorage(storage);
    expect(() => archive.read()).toThrow();
    expect(() => archive.write([])).toThrow("尚未成功读取");
    expect(storage.getItem(TOPIC_STORAGE_KEY)).toBe("broken JSON");
  });
  it("rejects malformed records without dropping them on the next save", () => {
    const storage = fixture();
    storage.setRaw(JSON.stringify([{ ...record, genre: 123 }]));
    const archive = createTopicArchiveStorage(storage);
    expect(() => archive.read()).toThrow("格式异常");
    expect(() => archive.write([])).toThrow();
  });
  it("guards against another window replacing the same archive", () => {
    const storage = fixture();
    const archive = createTopicArchiveStorage(storage);
    archive.read();
    storage.setRaw(JSON.stringify([record]));
    expect(() => archive.write([])).toThrow("其他窗口更新");
    expect(JSON.parse(storage.getItem(TOPIC_STORAGE_KEY)!)).toEqual([record]);
  });
  it("only accepts public HTTP(S) URL syntax without embedded credentials", () => {
    expect(normalizeEvidenceUrl("https://example.test/source")).toBe("https://example.test/source");
    for (const url of ["javascript:alert(1)", "file:///tmp/notes", "https://test-user:test-password@example.test/", "invalid"]) {
      expect(normalizeEvidenceUrl(url)).toBe("");
    }
  });
});
