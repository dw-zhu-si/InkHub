import { describe, expect, it } from "vitest";
import source from "./LongContinuityProjectionPanel.vue?raw";

describe("LongContinuityProjectionPanel", () => {
  it("projects ledger facts into read-only character, worldbuilding, and plot mappings", () => {
    expect(source).toContain("LongContinuityDomain");
    expect(source).toContain("projection.value.facts");
    expect(source).toContain("fact.domain === props.domain");
    expect(source).toContain('props.domain === "character"');
    expect(source).toContain('fact.domain === "relationship"');
    expect(source).toContain('props.domain === "plot"');
    expect(source).toContain('fact.domain === "foreshadowing"');
    expect(source).toContain("fact.subjectId === props.subjectId");
    expect(source).toContain("人物");
    expect(source).toContain("人物关系");
    expect(source).toContain("世界观");
    expect(source).toContain("剧情");
    expect(source).toContain("伏笔");
    expect(source).not.toContain("<textarea");
    expect(source).not.toContain("<input");
  });

  it("keeps every projected fact traceable to its chapter, commit, and evidence", () => {
    expect(source).toContain("sourceCommitId");
    expect(source).toContain("sourceChapterCardId");
    expect(source).toContain("fact.evidence");
    expect(source).toContain("function subjectLabel(");
    expect(source).toContain("props.snapshot.characters.find");
    expect(source).toContain("props.snapshot.worldbuilding.find");
    expect(source).toContain("props.snapshot.plot.storyEvents.find");
    expect(source).toContain("props.snapshot.plot.foreshadowing.find");
    expect(source).toContain("查看入账记录");
    expect(source).toContain("来源证据");
    expect(source).toContain("selectCommit: [commitId: string]");
  });

  it("uses floating feedback and contains no native select control", () => {
    expect(source).toContain("uiMessage.info");
    expect(source).toContain("uiMessage.success");
    expect(source).toContain("uiMessage.error");
    expect(source).not.toContain("<select");
  });

  it("follows the shared theme and collapses cleanly in compact hosts", () => {
    for (const token of [
      "--surface-main",
      "--surface-raised",
      "--surface-muted",
      "--theme-line",
      "--theme-line-soft",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--accent",
      "--accent-soft"
    ]) {
      expect(source).toContain(`var(${token})`);
    }
    expect(source).toContain("container: continuity-projection / inline-size");
    expect(source).toContain(
      "@container continuity-projection (max-width: 32rem)"
    );
    expect(source).toContain(
      "@container continuity-projection (max-width: 22rem)"
    );
    expect(source).toContain("hideHeading");
    expect(source).toContain('class="projection-card"');
    expect(source).toContain("来源映射");
    expect(source).toContain("项");
  });
});
