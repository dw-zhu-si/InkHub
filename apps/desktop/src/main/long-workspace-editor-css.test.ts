import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styleSource = readFileSync(
  resolve(import.meta.dirname, "../renderer/src/components/LongWorkspaceEditor.css"),
  "utf8"
);

describe("LongWorkspaceEditor extracted styles", () => {
  it("preserves stacked-layout resize behavior after stylesheet extraction", () => {
    expect(styleSource).toContain("@container (max-width: 26rem)");
    expect(styleSource).toContain("@container (max-width: 31rem)");
    expect(styleSource).toMatch(/\.long-story-plot-resizer\s*\{\s*display:\s*none;/u);
    expect(styleSource).toMatch(/\.long-entry-list-resizer\s*\{\s*display:\s*none;/u);
  });

  it("anchors find panels to the complete editor toolbar", () => {
    expect(styleSource).toMatch(
      /\.long-editor-text-tools\s*\{\s*position:\s*static;/u
    );
    expect(styleSource).toMatch(
      /\.long-editor-find-panel\s*\{[\s\S]*?right:\s*13px;[\s\S]*?width:\s*min\(350px, calc\(100% - 26px\)\);/u
    );
    expect(styleSource).toMatch(
      /\.long-story-plot-text-toolbar\s*\{\s*position:\s*relative;/u
    );
    expect(styleSource).toMatch(
      /\.long-story-plot-text-toolbar \.long-editor-find-panel\s*\{\s*right:\s*0;\s*left:\s*auto;/u
    );
  });

  it("keeps platform selectors scoped to editor descendants", () => {
    expect(styleSource).not.toMatch(
      /:global\(html\[data-(?:platform|theme)="[^"]+"\]\)\s+\./u
    );
    expect(styleSource).toContain(
      ':global(html[data-platform="darwin"] .long-workspace-editor)'
    );
    expect(styleSource).toContain(
      ':global(html[data-platform="darwin"] .long-editor-header)'
    );
  });
});
