import { describe, expect, it } from "vitest";
import { catalogLoadRequestIsCurrent } from "./catalogLoadFreshness";

describe("catalogLoadRequestIsCurrent", () => {
  it("rejects a delayed legacy recovery result after a newer index is published", () => {
    const olderSnapshot = { revision: 1 };
    const olderProjection = { revision: 1 };
    const newerSnapshot = { revision: 2 };
    const newerProjection = { revision: 2 };

    expect(
      catalogLoadRequestIsCurrent({
        currentSnapshot: newerSnapshot,
        currentProjection: newerProjection,
        requestedSnapshot: olderSnapshot,
        requestedProjection: olderProjection
      })
    ).toBe(false);
  });

  it("accepts the exact snapshot and projection pair captured by the request", () => {
    const snapshot = { revision: 1 };
    const projection = { revision: 1 };

    expect(
      catalogLoadRequestIsCurrent({
        currentSnapshot: snapshot,
        currentProjection: projection,
        requestedSnapshot: snapshot,
        requestedProjection: projection
      })
    ).toBe(true);
  });
});
