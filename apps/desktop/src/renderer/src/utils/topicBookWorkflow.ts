import { createTopicArchiveStorage, type TopicRecord } from "./topicArchiveStorage";
import type { CreateLongBookInput, CreateShortBookInput, CreateScriptBookInput } from "@deepwrite/contracts";
type CreateInput = ({ workspaceType: "long" } & CreateLongBookInput) | ({ workspaceType: "short" } & CreateShortBookInput) | ({ workspaceType: "script" } & CreateScriptBookInput);

export type TopicBookLink = NonNullable<TopicRecord["bookLink"]>;
export async function createTopicBook(input: CreateInput, options: {
  topic: TopicRecord | undefined; storage: Pick<Storage, "getItem" | "setItem">;
  books: () => TopicBookLink[]; dialogOpen: () => boolean;
  createLong: (input: CreateLongBookInput) => Promise<void>;
  createShort: (input: Exclude<CreateInput, { workspaceType: "long" }>) => Promise<void>;
  notify: { error: (message: string) => unknown; warning: (message: string) => unknown };
}): Promise<boolean> {
  const before = new Set(options.books().map((book) => `${book.workspaceType}:${book.bookId}`));
  if (input.workspaceType === "long") {
    const { workspaceType: _type, ...payload } = input;
    await options.createLong(payload);
  } else await options.createShort(input);
  if (!options.topic || options.dialogOpen()) return false;
  const created = options.books().find((book) => !before.has(`${book.workspaceType}:${book.bookId}`) && book.workspaceType === input.workspaceType && book.title === input.title);
  if (created) {
    try { associateTopicWithBook(options.storage, options.topic.id, created); }
    catch (error) { options.notify.error(error instanceof Error ? error.message : "作品已创建，选题关联失败，可从档案关联已有作品。"); }
  } else options.notify.warning("作品创建后列表尚未更新，请从选题档案关联已有作品，避免重复创建。");
  return true;
}

export async function openTopicBookTarget(book: TopicBookLink, options: {
  books: TopicBookLink[]; openLong: (id: string) => Promise<void>; loadedLong: () => string | null;
  openShort: (id: string) => Promise<boolean>; missing: () => void;
}): Promise<boolean> {
  if (!options.books.some((item) => item.bookId === book.bookId && item.workspaceType === book.workspaceType)) { options.missing(); return false; }
  if (book.workspaceType === "long") { await options.openLong(book.bookId); return options.loadedLong() === book.bookId; }
  if (await options.openShort(book.bookId)) return true;
  options.missing(); return false;
}
export function associateTopicWithBook(storage: Pick<Storage, "getItem" | "setItem">, topicId: string, book: TopicBookLink): void {
  const archive = createTopicArchiveStorage(storage);
  const records = archive.read();
  if (!records.some((record) => record.id === topicId)) throw new Error("作品已创建，但选题已不存在，请从选题档案关联已有作品。");
  const current = records.find((record) => record.id === topicId)!;
  if (current.bookLink && (current.bookLink.bookId !== book.bookId || current.bookLink.workspaceType !== book.workspaceType)) throw new Error("作品已创建，但选题已关联其他作品，请在选题档案中确认关联。");
  archive.write(records.map((record) => record.id === topicId ? { ...record, bookLink: book, status: "developing", updatedAt: new Date().toISOString() } : record));
}

export function topicContextForBook(storage: Pick<Storage, "getItem" | "setItem">, bookId: string, scope: TopicBookLink["workspaceType"]): string {
  try {
    const topics = createTopicArchiveStorage(storage).read().filter((record) => record.bookLink?.bookId === bookId && record.bookLink.workspaceType === scope);
    if (!topics.length) return "";
    return "【本书选题档案：作者参考资料；与已确认正文冲突时先询问作者】\n" + topics.slice(0, 3).map((topic) => [
      `选题：${topic.title}`, `目标读者：${topic.audience}`, `读者承诺：${topic.promise}`, `核心冲突：${topic.conflict}`,
      ...topic.evidence.slice(0, 5).map((proof) => `证据类型=${proof.kind}；日期=${proof.observedAt}；来源=${proof.label}；观察=${proof.note.slice(0, 500)}`)
    ].join("\n")).join("\n\n").slice(0, 8_000);
  } catch { return ""; }
}
