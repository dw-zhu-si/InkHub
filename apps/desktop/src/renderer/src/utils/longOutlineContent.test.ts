import { describe, expect, it, vi } from "vitest";
import type { LongReadDocumentResult } from "@deepwrite/contracts";
import { classifyOutlineText, readOutlineContentBatch, OUTLINE_CONTENT_BATCH, OUTLINE_CONTENT_PAGE, type OutlineContentTarget } from "./longOutlineContent";

const target: OutlineContentTarget = { fileId: "file_card", revision: "v1:0:00000000", volume: "第一卷", label: "第一章" };
const response = (content: string, extra: Partial<LongReadDocumentResult> = {}): LongReadDocumentResult => ({ bookId: "longbook_test", file: { id: target.fileId, revision: target.revision, path: "card.md", updatedAt: "2026-10-29T00:00:00.000Z" }, content, offset: 0, totalCharacters: content.length, nextOffset: null, workspaceRevision: 1, projectRevision: 1, ...extra });
function options(read = vi.fn(async () => response("主角必须在天亮前找到证人。"))) {
  return { bookId: "longbook_test", workspaceRevision: 1, targets: [target], offset: 0, read, isCurrent: () => true };
}

describe("outline content presence", () => {
  it("distinguishes blank, heading/template-only and authored content", () => {
    expect(classifyOutlineText(" \n\t")).toBe("empty");
    for (const text of ["# 第一章\n\n## 核心冲突", "# 主线\n\n- TODO\n主角目标：待填写", "<!-- note -->\n## 概述\n\n失败代价：", "---\ntitle: 测试\n---\n# 大纲\n（待补充）"]) expect(classifyOutlineText(text)).toBe("placeholder");
    expect(classifyOutlineText("# 主线\n\n主角目标：找到失踪的姐姐。\n失败代价：最后的线索会被销毁。")).toBe("filled");
  });

  it("does not call truncated placeholder text empty or complete", async () => {
    const read = vi.fn(async () => response("# 主线", { nextOffset: 3, totalCharacters: 100_000 }));
    const report = await readOutlineContentBatch(options(read));
    expect(report.results[0]?.status).toBe("partial");
    expect(read.mock.calls).toHaveLength(1);
  });

  it("turns read errors and stale source identity into visible per-file failures", async () => {
    const read = vi.fn(async () => { throw new Error("fixture failure"); });
    expect((await readOutlineContentBatch(options(read))).results[0]?.status).toBe("error");
    const stale = vi.fn(async () => response("已修改", { workspaceRevision: 2 }));
    expect((await readOutlineContentBatch(options(stale))).results[0]?.status).toBe("error");
    const wrongFile = vi.fn(async () => response("文本", { file: { ...response("").file, id: "file_other" } }));
    expect((await readOutlineContentBatch(options(wrongFile))).results[0]?.status).toBe("error");
  });

  it("caps a 20,000-document project to one sequential user-triggered batch", async () => {
    const read = vi.fn(async () => response("# 章卡"));
    const result = await readOutlineContentBatch({ ...options(read), targets: Array.from({ length: 20_000 }, () => target) });
    expect(read).toHaveBeenCalledTimes(OUTLINE_CONTENT_BATCH);
    expect(read).toHaveBeenCalledWith({ bookId: "longbook_test", fileId: target.fileId, offset: 0, maxCharacters: OUTLINE_CONTENT_PAGE });
    expect(result.nextOffset).toBe(50);
    expect(result.results.every((item) => item.status === "placeholder")).toBe(true);
  });

  it("discards in-flight results after close, cancellation or project switch", async () => {
    let current = true;
    const read = vi.fn(async () => { current = false; return response("内容"); });
    const result = await readOutlineContentBatch({ ...options(read), isCurrent: () => current });
    expect(result.cancelled).toBe(true);
    expect(result.results).toEqual([]);
    expect(result.nextOffset).toBe(0);
  });
});
