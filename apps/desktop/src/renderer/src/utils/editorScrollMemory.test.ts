import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEditorScrollMemory,
  editorScrollMemoryKey,
  recalledEditorScrollPosition,
  rememberEditorScrollPosition
} from "./editorScrollMemory";

beforeEach(() => {
  clearEditorScrollMemory();
});

describe("editor scroll memory", () => {
  it("remembers each document and view independently", () => {
    const first = editorScrollMemoryKey({
      domain: "creation",
      id: "draft-section:section-1:body",
      workspaceId: "book-1"
    });
    const second = editorScrollMemoryKey({
      domain: "creation",
      id: "draft-section:section-2:body",
      workspaceId: "book-1"
    });

    rememberEditorScrollPosition(first, "edit", 420);
    rememberEditorScrollPosition(first, "preview", 180);
    rememberEditorScrollPosition(second, "edit", 72);

    expect(recalledEditorScrollPosition(first, "edit")).toBe(420);
    expect(recalledEditorScrollPosition(first, "preview")).toBe(180);
    expect(recalledEditorScrollPosition(second, "edit")).toBe(72);
  });

  it("starts unseen documents at the top and isolates identical ids by workspace", () => {
    const firstBook = editorScrollMemoryKey({
      domain: "creation",
      id: "draft-section:intro:body",
      workspaceId: "book-1"
    });
    const secondBook = editorScrollMemoryKey({
      domain: "creation",
      id: "draft-section:intro:body",
      workspaceId: "book-2"
    });

    rememberEditorScrollPosition(firstBook, "edit", 260);

    expect(recalledEditorScrollPosition(secondBook, "edit")).toBe(0);
  });
});
