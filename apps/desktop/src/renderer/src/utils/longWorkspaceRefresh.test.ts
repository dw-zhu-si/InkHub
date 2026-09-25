import { describe, expect, it } from "vitest";
import {
  createLongWorkspaceRefreshClock,
  hasReachedLongWorkspaceRevisionTarget,
  isMonotonicLongWorkspaceRefresh
} from "./longWorkspaceRefresh";

describe("long workspace refresh coordination", () => {
  it("keeps request clocks isolated by book and rejects older requests", () => {
    const clock = createLongWorkspaceRefreshClock();
    const firstBookOne = clock.begin("book-one");
    const bookTwo = clock.begin("book-two");
    const secondBookOne = clock.begin("book-one");

    expect(clock.isCurrent("book-one", firstBookOne)).toBe(false);
    expect(clock.isCurrent("book-one", secondBookOne)).toBe(true);
    expect(clock.isCurrent("book-two", bookTwo)).toBe(true);

    clock.invalidate("book-two");
    expect(clock.isCurrent("book-two", bookTwo)).toBe(false);
  });

  it("only publishes workspace and project revisions monotonically", () => {
    const current = {
      workspaceRevision: 8,
      projectRevision: 13
    };

    expect(
      isMonotonicLongWorkspaceRefresh(current, {
        workspaceRevision: 9,
        projectRevision: 14
      })
    ).toBe(true);
    expect(
      isMonotonicLongWorkspaceRefresh(current, {
        workspaceRevision: 7,
        projectRevision: 14
      })
    ).toBe(false);
    expect(
      isMonotonicLongWorkspaceRefresh(current, {
        workspaceRevision: 9,
        projectRevision: 12
      })
    ).toBe(false);
  });

  it("only releases a mutation barrier after both revisions reach its target", () => {
    const target = {
      workspaceRevision: 9,
      projectRevision: 14
    };

    expect(
      hasReachedLongWorkspaceRevisionTarget(
        { workspaceRevision: 9, projectRevision: 14 },
        target
      )
    ).toBe(true);
    expect(
      hasReachedLongWorkspaceRevisionTarget(
        { workspaceRevision: 10, projectRevision: 15 },
        target
      )
    ).toBe(true);
    expect(
      hasReachedLongWorkspaceRevisionTarget(
        { workspaceRevision: 8, projectRevision: 15 },
        target
      )
    ).toBe(false);
    expect(
      hasReachedLongWorkspaceRevisionTarget(
        { workspaceRevision: 10, projectRevision: 13 },
        target
      )
    ).toBe(false);
    expect(hasReachedLongWorkspaceRevisionTarget(null, target)).toBe(false);
  });
});
