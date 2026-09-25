import { describe, expect, it } from "vitest";
import {
  countNonWhitespaceCharacters,
  createBoundedTextHistory
} from "./boundedTextHistory";

describe("bounded text history", () => {
  it("coalesces continuous typing without retaining full-document snapshots", () => {
    const history = createBoundedTextHistory();
    const original = "底稿".repeat(256 * 1024);
    let content = original;
    let caret = content.length;

    for (let index = 0; index < 80; index += 1) {
      const nextContent = `${content}字`;
      history.recordInput({
        beforeContent: content,
        afterContent: nextContent,
        selectionBefore: { start: caret, end: caret },
        selectionAfter: { start: caret + 1, end: caret + 1 },
        inputType: "insertText",
        timestamp: index * 10
      });
      content = nextContent;
      caret += 1;
    }

    expect(history.stats()).toEqual({
      undoEntries: 1,
      redoEntries: 0,
      retainedCharacters: 0
    });

    const undone = history.undo(content);
    expect(undone).toEqual({
      content: original,
      start: original.length,
      end: original.length,
      nonWhitespaceDelta: -80
    });
    const redone = history.redo(undone!.content);
    expect(redone).toEqual({
      content,
      start: content.length,
      end: content.length,
      nonWhitespaceDelta: 80
    });
  });

  it("keeps pauses as separate undo boundaries", () => {
    const history = createBoundedTextHistory({ coalesceWindowMs: 100 });
    history.recordInput({
      beforeContent: "",
      afterContent: "甲",
      selectionBefore: { start: 0, end: 0 },
      selectionAfter: { start: 1, end: 1 },
      inputType: "insertText",
      timestamp: 0
    });
    history.recordInput({
      beforeContent: "甲",
      afterContent: "甲乙",
      selectionBefore: { start: 1, end: 1 },
      selectionAfter: { start: 2, end: 2 },
      inputType: "insertText",
      timestamp: 200
    });

    expect(history.stats().undoEntries).toBe(2);
    expect(history.undo("甲乙")?.content).toBe("甲");
    expect(history.undo("甲")?.content).toBe("");
  });

  it("coalesces adjacent backward deletion and restores the original caret", () => {
    const history = createBoundedTextHistory();
    let content = "abcdef";
    for (let index = 0; index < 3; index += 1) {
      const caret = content.length;
      const nextContent = content.slice(0, -1);
      history.recordInput({
        beforeContent: content,
        afterContent: nextContent,
        selectionBefore: { start: caret, end: caret },
        selectionAfter: { start: caret - 1, end: caret - 1 },
        inputType: "deleteContentBackward",
        timestamp: index * 10
      });
      content = nextContent;
    }

    expect(history.stats()).toEqual({
      undoEntries: 1,
      redoEntries: 0,
      retainedCharacters: 3
    });
    expect(history.undo(content)).toEqual({
      content: "abcdef",
      start: 6,
      end: 6,
      nonWhitespaceDelta: 3
    });
    expect(history.redo("abcdef")).toEqual({
      content: "abc",
      start: 3,
      end: 3,
      nonWhitespaceDelta: -3
    });
  });

  it("enforces both entry and retained-character budgets", () => {
    const history = createBoundedTextHistory({
      maxEntries: 3,
      maxRetainedCharacters: 3,
      coalesceWindowMs: 0
    });
    let content = "abcdef";
    for (let index = 0; index < 5; index += 1) {
      const nextContent = content.slice(1);
      history.recordInput({
        beforeContent: content,
        afterContent: nextContent,
        selectionBefore: { start: 0, end: 0 },
        selectionAfter: { start: 0, end: 0 },
        inputType: "deleteContentForward",
        timestamp: index * 10 + 1
      });
      content = nextContent;
    }

    expect(history.stats()).toEqual({
      undoEntries: 3,
      redoEntries: 0,
      retainedCharacters: 3
    });
  });

  it("preserves one oversized atomic edit without allowing history growth", () => {
    const history = createBoundedTextHistory({ maxRetainedCharacters: 4 });
    const beforeContent = "一二三四五六七八九十";
    history.recordChange({
      beforeContent,
      afterContent: "",
      selectionBefore: { start: 0, end: beforeContent.length },
      selectionAfter: { start: 0, end: 0 }
    });

    expect(history.stats()).toEqual({
      undoEntries: 1,
      redoEntries: 0,
      retainedCharacters: beforeContent.length
    });
    expect(history.undo("")?.content).toBe(beforeContent);
  });

  it("records programmatic replacements as one reversible minimal edit", () => {
    const history = createBoundedTextHistory();
    history.recordChange({
      beforeContent: "开头-旧内容-结尾",
      afterContent: "开头-新内容-结尾",
      selectionBefore: { start: 3, end: 6 },
      selectionAfter: { start: 6, end: 6 }
    });

    const undone = history.undo("开头-新内容-结尾");
    expect(undone).toEqual({
      content: "开头-旧内容-结尾",
      start: 3,
      end: 6,
      nonWhitespaceDelta: 0
    });
    expect(history.redo(undone!.content)).toEqual({
      content: "开头-新内容-结尾",
      start: 6,
      end: 6,
      nonWhitespaceDelta: 0
    });
  });

  it("drops stale history instead of applying it to unrelated content", () => {
    const history = createBoundedTextHistory();
    history.recordInput({
      beforeContent: "正文",
      afterContent: "正文甲",
      selectionBefore: { start: 2, end: 2 },
      selectionAfter: { start: 3, end: 3 },
      inputType: "insertText"
    });

    expect(history.undo("别的内容")).toBeNull();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("counts whitespace without allocating a filtered document copy", () => {
    expect(
      countNonWhitespaceCharacters(
        "甲 乙\t丙\n丁\u00a0戊\u3000己\ufeff庚"
      )
    ).toBe(7);
  });
});
