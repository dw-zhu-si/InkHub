import { describe, expect, it } from "vitest";
import { associateTopicWithBook, createTopicBook, openTopicBookTarget, topicContextForBook } from "./topicBookWorkflow";
import type { TopicRecord } from "./topicArchiveStorage";
const topic: TopicRecord = { id: "topic_test", title: "雾城", genre: "悬疑", audience: "悬疑读者", promise: "解谜", conflict: "秘密与代价", status: "idea", updatedAt: "", evidence: [] };
function fixture(records: TopicRecord[]) { let raw = JSON.stringify(records); return { getItem: (_key: string) => raw, setItem: (_key: string, next: string) => { raw = next; } }; }
describe("topic to book workflow", () => {
  it("links only a newly created book and keeps a cancelled creation unlinked", async () => {
    const storage = fixture([topic]);
    const books: Array<{ bookId: string; title: string; workspaceType: "short" }> = [];
    const input = { workspaceType: "short" as const, title: topic.title, genre: "悬疑" as const, linkedMaterialIdsByKind: { character: [], gimmick: [], plot: [], draft: [], other: [] }, linkedSkillIdsByKind: { general: [], plot: [], style: [], other: [] } };
    const options = { topic, storage, books: () => books, dialogOpen: () => true, createLong: async () => {}, createShort: async () => {}, notify: { error: () => {}, warning: () => {} } };
    expect(await createTopicBook(input, options)).toBe(false);
    expect(JSON.parse(storage.getItem("")!)[0].bookLink).toBeUndefined();
    expect(await createTopicBook(input, { ...options, dialogOpen: () => false, createShort: async () => { books.push({ bookId: "book_created", title: topic.title, workspaceType: "short" }); } })).toBe(true);
    expect(JSON.parse(storage.getItem("")!)[0].bookLink.bookId).toBe("book_created");
  });
  it("does not navigate a missing or failed-to-open long book", async () => {
    const book = { bookId: "longbook_one", title: "测试长篇", workspaceType: "long" as const };
    const options = { books: [book], openLong: async () => {}, loadedLong: () => "longbook_other", openShort: async () => false, missing: () => {} };
    expect(await openTopicBookTarget(book, options)).toBe(false);
    expect(await openTopicBookTarget(book, { ...options, loadedLong: () => null })).toBe(false);
    expect(await openTopicBookTarget(book, { ...options, loadedLong: () => book.bookId })).toBe(true);
    expect(await openTopicBookTarget(book, { ...options, books: [] })).toBe(false);
  });
  it("associates an existing topic without losing evidence and makes it available only to its own book", () => {
    const storage = fixture([topic]);
    expect(topicContextForBook(storage, "book_one", "short")).toBe("");
    associateTopicWithBook(storage, topic.id, { bookId: "book_one", title: "雾城", workspaceType: "short" });
    expect(JSON.parse(storage.getItem("")!)[0].status).toBe("developing");
    expect(topicContextForBook(storage, "book_one", "short")).toContain("读者承诺：解谜");
    expect(topicContextForBook(storage, "book_other", "short")).toBe("");
    expect(topicContextForBook(storage, "book_one", "long")).toBe("");
    expect(() => associateTopicWithBook(storage, topic.id, { bookId: "book_other", title: "另一作品", workspaceType: "short" })).toThrow("已关联其他作品");
  });
  it("does not silently recreate a deleted topic or overwrite malformed archives", () => {
    expect(() => associateTopicWithBook(fixture([]), topic.id, { bookId: "book_one", title: "雾城", workspaceType: "long" })).toThrow("选题已不存在");
    const bad = { getItem: () => "broken", setItem: () => { throw new Error("unexpected write"); } };
    expect(() => associateTopicWithBook(bad, topic.id, { bookId: "book_one", title: "雾城", workspaceType: "long" })).toThrow();
    expect(topicContextForBook(bad, "book_one", "long")).toBe("");
  });
});
