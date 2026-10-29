import type { LongReadDocumentInput, LongReadDocumentResult, LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";

export type OutlineContentStatus = "empty" | "placeholder" | "filled" | "partial" | "error";
export interface OutlineContentTarget { fileId: string; revision: string; label: string; volume: string; }
export interface OutlineContentResult extends OutlineContentTarget { status: OutlineContentStatus; characters: number; }
export const OUTLINE_CONTENT_BATCH = 50;
export const OUTLINE_CONTENT_PAGE = 32_768;

/** Presence heuristics only: authored prose still needs editorial judgement. */
export function classifyOutlineText(content: string): "empty" | "placeholder" | "filled" {
  if (!content.trim()) return "empty";
  const lines = content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, "").replace(/<!--[\s\S]*?-->/gu, "").split(/\r?\n/u);
  const authored = lines.filter((line) => {
    const value = line.trim();
    if (!value || /^#{1,6}\s/u.test(value) || /^[-*_]{3,}$/u.test(value) || /^```/u.test(value)) return false;
    const text = value.replace(/^[-*>\s]+/u, "").replace(/\*\*/gu, "").replace(/^[（(<【\[]|[）)>】\]]$/gu, "").trim();
    if (/^(?:todo|tbd|待补充|待填写|待定|暂无|请填写|在此填写|此处填写|占位)(?:[：:。.!！\s].*)?$/iu.test(text)) return false;
    if (/^[^：:\n]{1,24}[：:]\s*(?:待补充|待填写|待定|todo|tbd|[（(]?请填写[^）)]*[）)]?)?\s*$/iu.test(text)) return false;
    if (/^\|?(?:\s*[-:]+\s*\|)+\s*$/u.test(text)) return false;
    return true;
  });
  return authored.length ? "filled" : "placeholder";
}

export function outlineContentTargets(snapshot: LongWorkspaceIndexSnapshot): OutlineContentTarget[] {
  const files = new Map(snapshot.chapters.map((chapter) => [chapter.chapterCardId, chapter.card]));
  const volumes = new Map(snapshot.plot.volumes.map((volume) => [volume.id, volume.title]));
  return [
    { fileId: snapshot.bookLine.id, revision: snapshot.bookLine.revision, label: "全书主线", volume: "全书" },
    ...snapshot.plot.chapterCards.map((card) => ({
      fileId: files.get(card.id)?.id ?? "",
      revision: files.get(card.id)?.revision ?? "",
      label: card.title,
      volume: volumes.get(card.volumeId) ?? "未分卷"
    }))
  ];
}

/** One user-triggered batch; no background whole-book scan or retained manuscript text. */
export async function readOutlineContentBatch(options: {
  bookId: string; workspaceRevision: number; targets: OutlineContentTarget[]; offset: number;
  read: (input: LongReadDocumentInput) => Promise<LongReadDocumentResult>;
  isCurrent: () => boolean;
}): Promise<{ results: OutlineContentResult[]; nextOffset: number; cancelled: boolean }> {
  const results: OutlineContentResult[] = [];
  const end = Math.min(options.offset + OUTLINE_CONTENT_BATCH, options.targets.length);
  for (let index = options.offset; index < end; index++) {
    if (!options.isCurrent()) return { results: [], nextOffset: options.offset, cancelled: true };
    const target = options.targets[index]!;
    try {
      if (!target.fileId) throw new Error("Missing indexed chapter card");
      const page = await options.read({ bookId: options.bookId, fileId: target.fileId, offset: 0, maxCharacters: OUTLINE_CONTENT_PAGE });
      if (!options.isCurrent()) return { results: [], nextOffset: options.offset, cancelled: true };
      if (page.bookId !== options.bookId || page.file.id !== target.fileId || page.offset !== 0 || page.workspaceRevision !== options.workspaceRevision || page.file.revision !== target.revision) {
        throw new Error("Outline source changed during inspection");
      }
      const presence = classifyOutlineText(page.content);
      results.push({ ...target, status: presence === "filled" ? "filled" : page.nextOffset !== null ? "partial" : presence, characters: page.totalCharacters });
    } catch {
      if (!options.isCurrent()) return { results: [], nextOffset: options.offset, cancelled: true };
      results.push({ ...target, status: "error", characters: 0 });
    }
  }
  return { results, nextOffset: end, cancelled: false };
}
