import type {
  LongPlotFocusSnapshot,
  LongWorkspaceNavigationSnapshot
} from "@deepwrite/contracts";
import type { LongWorkspaceSelection } from "../types/longWorkspace";

/**
 * Captures where the user currently is inside the plot-design root. The
 * snapshot is derived from the already-loaded navigation index, so no
 * document reads are needed before sending a message.
 */
export function buildLongPlotFocusSnapshot(input: {
  selection: LongWorkspaceSelection | null;
  navigation: LongWorkspaceNavigationSnapshot;
}): LongPlotFocusSnapshot | undefined {
  const { selection, navigation } = input;
  if (selection?.root !== "plot_design") return undefined;
  if (selection.key === "plot-design:book-line") {
    return { section: "book_line" };
  }
  if (selection.key === "plot-design:foreshadowing") {
    return { section: "foreshadowing" };
  }
  if (selection.key.startsWith("plot-design:plot-points:")) {
    const volume = navigation.volumes.find(
      ({ id }) => id === selection.plotPointVolumeId
    );
    if (!volume) return undefined;
    const arc = navigation.arcs.find(
      ({ id }) => id === selection.plotPointId
    );
    return {
      section: "plot_point",
      volumeId: volume.id,
      volumeTitle: volume.title,
      ...(arc
        ? { arcId: arc.id, arcTitle: arc.title }
        : {})
    };
  }
  if (selection.key.startsWith("plot-design:chapter-cards:")) {
    const volume = navigation.volumes.find(
      ({ id }) => id === selection.chapterCardVolumeId
    );
    if (!volume) return undefined;
    const chapterCard = navigation.chapterCards.find(
      ({ id }) => id === selection.chapterCardId
    );
    return {
      section: "chapter_card",
      volumeId: volume.id,
      volumeTitle: volume.title,
      ...(chapterCard
        ? { chapterCardId: chapterCard.id, chapterCardTitle: chapterCard.title }
        : {})
    };
  }
  return undefined;
}
