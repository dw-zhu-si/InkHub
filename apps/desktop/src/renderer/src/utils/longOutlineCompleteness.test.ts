import { describe, expect, it } from "vitest";
import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";
import { assessLongOutlineCompleteness } from "./longOutlineCompleteness";

function makeSnapshot() {
  return {
    bookLine: {},
    plot: {
      volumes: [{ id: "volume_one", title: "第一卷" }],
      arcs: [{ id: "arc_one", volumeId: "volume_one", title: "雨夜来信" }],
      chapterCards: [{ id: "chapter_one", volumeId: "volume_one", primaryArcId: "arc_one" }],
      storyPlots: []
    }
  } as unknown as LongWorkspaceIndexSnapshot;
}

describe("assessLongOutlineCompleteness", () => {
  it("reports empty story-beat layer while recognizing volume/arc/chapter links", () => {
    const report = assessLongOutlineCompleteness(makeSnapshot());
    expect(report.totalVolumes).toBe(1);
    expect(report.completeVolumes).toBe(0);
    expect(report.totalArcs).toBe(1);
    expect(report.totalChapterCards).toBe(1);
    expect(report.findings.some(({ id }) => id === "arc-beats:arc_one")).toBe(true);
    expect(report.findings.some(({ id }) => id === "arc-chapters:arc_one")).toBe(false);
  });

  it("never claims semantic quality is complete from structural counts", () => {
    const report = assessLongOutlineCompleteness(makeSnapshot());
    expect(report.readerPromiseNeedsReview).toBe(true);
    expect(report.findings.some(({ id }) => id === "reader-promise")).toBe(true);
    expect(report.findings.find(({ id }) => id === "reader-promise")?.severity).toBe("review");
  });

  it("does not count a volume as complete while any chapter is unassigned or linked across volumes", () => {
    const snapshot = makeSnapshot();
    snapshot.plot.storyPlots = [{ arcId: "arc_one" }] as typeof snapshot.plot.storyPlots;
    expect(assessLongOutlineCompleteness(snapshot).completeVolumes).toBe(1);
    snapshot.plot.chapterCards.push({ id: "chapter_orphan", volumeId: "volume_one", primaryArcId: null } as typeof snapshot.plot.chapterCards[number]);
    expect(assessLongOutlineCompleteness(snapshot).completeVolumes).toBe(0);
    snapshot.plot.chapterCards[1]!.primaryArcId = "arc_other";
    snapshot.plot.arcs.push({ id: "arc_other", volumeId: "volume_other", title: "其他卷" } as typeof snapshot.plot.arcs[number]);
    expect(assessLongOutlineCompleteness(snapshot).findings.find(({ id }) => id === "unassigned-chapters:volume_one")?.message).toContain("1 张章卡");
  });

  it("checks a large outline without rescanning each entire array for every arc", () => {
    const snapshot = makeSnapshot();
    const count = 20_000;
    snapshot.plot.arcs = Array.from({ length: count }, (_, index) => ({ id: `arc_${index}`, volumeId: "volume_one", title: `弧${index}` })) as typeof snapshot.plot.arcs;
    snapshot.plot.storyPlots = snapshot.plot.arcs.map((arc) => ({ arcId: arc.id })) as typeof snapshot.plot.storyPlots;
    snapshot.plot.chapterCards = snapshot.plot.arcs.map((arc, index) => ({ id: `chapter_${index}`, volumeId: "volume_one", primaryArcId: arc.id })) as typeof snapshot.plot.chapterCards;
    // A regression to the old per-arc filter would make this deterministic budget fail.
    let visits = 0;
    for (const collection of [snapshot.plot.arcs, snapshot.plot.storyPlots, snapshot.plot.chapterCards]) {
      for (let index = 0; index < collection.length; index++) {
        const value = collection[index];
        Object.defineProperty(collection, index, { get: () => { visits++; return value; }, configurable: true });
      }
    }
    const report = assessLongOutlineCompleteness(snapshot);
    expect(report.completeVolumes).toBe(1);
    expect(report.findings).toHaveLength(1);
    expect(visits).toBeLessThan(count * 10);
  });
});
