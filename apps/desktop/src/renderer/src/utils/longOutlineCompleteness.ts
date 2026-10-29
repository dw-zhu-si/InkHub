import type { LongWorkspaceIndexSnapshot } from "@deepwrite/contracts";

export interface OutlineCompletenessFinding {
  id: string;
  severity: "action" | "review";
  message: string;
  volumeTitle?: string;
}

export interface OutlineCompletenessReport {
  totalVolumes: number;
  completeVolumes: number;
  totalArcs: number;
  totalStoryBeats: number;
  totalChapterCards: number;
  findings: OutlineCompletenessFinding[];
  readerPromiseNeedsReview: boolean;
}

/**
 * Checks the presence and linking of outline layers only. It cannot judge
 * whether the promise, beats, or chapter plans are dramatically effective.
 */
export function assessLongOutlineCompleteness(
  snapshot: LongWorkspaceIndexSnapshot
): OutlineCompletenessReport {
  const findings: OutlineCompletenessFinding[] = [];
  const { volumes, arcs, storyPlots, chapterCards } = snapshot.plot;
  let completeVolumes = 0;
  const arcsByVolume = new Map<string, typeof arcs>();
  const cardsByVolume = new Map<string, typeof chapterCards>();
  const arcVolumes = new Map(arcs.map((arc) => [arc.id, arc.volumeId]));
  const arcsWithBeats = new Set(storyPlots.map((plot) => plot.arcId));
  const arcsWithCards = new Set<string>();
  for (const arc of arcs) {
    const group = arcsByVolume.get(arc.volumeId) ?? [];
    group.push(arc);
    arcsByVolume.set(arc.volumeId, group);
  }
  for (const card of chapterCards) {
    const group = cardsByVolume.get(card.volumeId) ?? [];
    group.push(card);
    cardsByVolume.set(card.volumeId, group);
    if (card.primaryArcId && arcVolumes.get(card.primaryArcId) === card.volumeId) {
      arcsWithCards.add(card.primaryArcId);
    }
  }

  if (!snapshot.bookLine) {
    findings.push({ id: "book-line", severity: "action", message: "缺少全书故事主线文档。" });
  } else {
    findings.push({ id: "reader-promise", severity: "review", message: "请人工确认全书主线已写清读者承诺、主角目标与失败代价。" });
  }

  for (const volume of volumes) {
    const volumeArcs = arcsByVolume.get(volume.id) ?? [];
    const volumeChapterCards = cardsByVolume.get(volume.id) ?? [];
    let volumeHasAction = false;
    if (volumeArcs.length === 0) {
      findings.push({ id: `volume-arcs:${volume.id}`, severity: "action", volumeTitle: volume.title, message: `“${volume.title}”尚未安排剧情弧。` });
      volumeHasAction = true;
    }
    if (volumeChapterCards.length === 0) {
      findings.push({ id: `volume-chapters:${volume.id}`, severity: "action", volumeTitle: volume.title, message: `“${volume.title}”尚无章卡。` });
      volumeHasAction = true;
    }
    for (const arc of volumeArcs) {
      if (!arcsWithBeats.has(arc.id)) {
        findings.push({ id: `arc-beats:${arc.id}`, severity: "action", volumeTitle: volume.title, message: `剧情弧“${arc.title}”没有故事情节节点。` });
        volumeHasAction = true;
      }
      if (!arcsWithCards.has(arc.id)) {
        findings.push({ id: `arc-chapters:${arc.id}`, severity: "action", volumeTitle: volume.title, message: `剧情弧“${arc.title}”没有关联章卡。` });
        volumeHasAction = true;
      }
    }
    const unassigned = volumeChapterCards.filter((card) => !card.primaryArcId || arcVolumes.get(card.primaryArcId) !== volume.id);
    if (unassigned.length) {
      findings.push({ id: `unassigned-chapters:${volume.id}`, severity: "review", volumeTitle: volume.title, message: `“${volume.title}”有 ${unassigned.length} 张章卡尚未关联本卷剧情弧。` });
      volumeHasAction = true;
    }
    if (!volumeHasAction) completeVolumes += 1;
  }

  return {
    totalVolumes: volumes.length,
    completeVolumes,
    totalArcs: arcs.length,
    totalStoryBeats: storyPlots.length,
    totalChapterCards: chapterCards.length,
    findings,
    readerPromiseNeedsReview: true
  };
}
