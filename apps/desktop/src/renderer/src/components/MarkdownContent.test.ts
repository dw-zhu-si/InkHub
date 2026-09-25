import { describe, expect, it } from "vitest";
import source from "./MarkdownContent.vue?raw";
import longEditorSource from "./LongWorkspaceEditor.vue?raw";
import messageSource from "./MessageMarkdown.vue?raw";

describe("MarkdownContent", () => {
  it("owns the shared safe Markdown rendering path", () => {
    expect(source).toContain('import { renderMarkdown } from "../utils/renderMarkdown"');
    expect(source).toContain('class="markdown-content"');
    expect(source).toContain('v-html="html"');
  });

  it("is also reused by conversation messages", () => {
    expect(messageSource).toContain('import MarkdownContent from "./MarkdownContent.vue"');
    expect(messageSource).toContain('class="message-markdown"');
  });

  it("renders both long-form preview surfaces through the shared component", () => {
    expect(longEditorSource).toContain(
      'import MarkdownContent from "./MarkdownContent.vue"'
    );
    expect(longEditorSource.match(/<MarkdownContent/g)).toHaveLength(2);
    expect(longEditorSource).not.toContain("previewParagraphs");
  });
});
