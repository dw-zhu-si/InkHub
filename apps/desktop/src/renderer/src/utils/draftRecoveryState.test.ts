import type { CatalogDraftRecovery } from "@deepwrite/contracts";
import { describe, expect, it } from "vitest";
import type { EditorDraftState } from "../types/workspace";
import {
  createDraftRecoveryClock,
  dirtyDraftRecovery,
  mergeRecoveredEditorDrafts
} from "./draftRecoveryState";

const FIXED_NOW_MS = Date.parse("2026-08-14T08:00:00.000Z");

function recovery(
  title: string,
  recoveryUpdatedAt?: string
): CatalogDraftRecovery[string] {
  return {
    title,
    content: `${title}正文`,
    dirty: true,
    ...(recoveryUpdatedAt === undefined ? {} : { recoveryUpdatedAt })
  };
}

describe("draft recovery state", () => {
  it("generates strictly monotonic timestamps with a fixed time source", () => {
    const clock = createDraftRecoveryClock(() => FIXED_NOW_MS);

    expect(clock.next()).toBe("2026-08-14T08:00:00.000Z");
    expect(clock.next()).toBe("2026-08-14T08:00:00.001Z");
    expect(clock.next()).toBe("2026-08-14T08:00:00.002Z");
  });

  it("advances beyond observed timestamps and ignores invalid observations", () => {
    const clock = createDraftRecoveryClock(() => FIXED_NOW_MS);
    clock.observe("not-a-timestamp");
    clock.observe("2026-08-15T09:30:00.000Z");

    expect(clock.next()).toBe("2026-08-15T09:30:00.001Z");
  });

  it("keeps only dirty drafts and copies their recovery metadata", () => {
    const dirty: EditorDraftState = {
      title: "第一章",
      content: "尚未保存的正文",
      dirty: true,
      recoveryUpdatedAt: "2026-08-14T07:00:00.000Z",
      baseRevision: "revision-placeholder",
      baseProjectRevision: 3
    };
    const clean: EditorDraftState = {
      title: "第二章",
      content: "已保存的正文",
      dirty: false
    };

    const result = dirtyDraftRecovery({ dirty, clean });

    expect(result).toEqual({
      dirty: {
        title: "第一章",
        content: "尚未保存的正文",
        dirty: true,
        recoveryUpdatedAt: "2026-08-14T07:00:00.000Z",
        baseRevision: "revision-placeholder",
        baseProjectRevision: 3
      }
    });
    expect(result.dirty).not.toBe(dirty);
  });

  it("selects whichever valid recovery timestamp is newer", () => {
    const older = "2026-08-14T06:00:00.000Z";
    const newer = "2026-08-14T07:00:00.000Z";

    expect(
      mergeRecoveredEditorDrafts(
        { chapter: recovery("Core 较新", newer) },
        { chapter: recovery("Live 较旧", older) },
        createDraftRecoveryClock(() => FIXED_NOW_MS)
      ).chapter?.title
    ).toBe("Core 较新");
    expect(
      mergeRecoveredEditorDrafts(
        { chapter: recovery("Core 较旧", older) },
        { chapter: recovery("Live 较新", newer) },
        createDraftRecoveryClock(() => FIXED_NOW_MS)
      ).chapter?.title
    ).toBe("Live 较新");
  });

  it("prefers live recovery when timestamps are equal", () => {
    const timestamp = "2026-08-14T07:00:00.000Z";
    const result = mergeRecoveredEditorDrafts(
      { chapter: recovery("Core", timestamp) },
      { chapter: recovery("Live", timestamp) },
      createDraftRecoveryClock(() => FIXED_NOW_MS)
    );

    expect(result.chapter).toEqual({
      title: "Live",
      content: "Live正文",
      dirty: true,
      recoveryUpdatedAt: timestamp
    });
  });

  it("prefers live recovery when timestamps cannot be compared", () => {
    const coreTimestamp = "2026-08-14T07:00:00.000Z";
    const live = recovery("Live 无时间戳");
    const result = mergeRecoveredEditorDrafts(
      { chapter: recovery("Core", coreTimestamp) },
      { chapter: live },
      createDraftRecoveryClock(() => FIXED_NOW_MS)
    );

    expect(result.chapter).toEqual({
      title: "Live 无时间戳",
      content: "Live 无时间戳正文",
      dirty: true,
      recoveryUpdatedAt: "2026-08-14T08:00:00.000Z"
    });
    expect(result.chapter).not.toBe(live);
  });

  it("retains independent recoveries from both sources", () => {
    const result = mergeRecoveredEditorDrafts(
      { coreOnly: recovery("Core 独有") },
      { liveOnly: recovery("Live 独有") },
      createDraftRecoveryClock(() => FIXED_NOW_MS)
    );

    expect(Object.keys(result)).toEqual(["coreOnly", "liveOnly"]);
    expect(result.coreOnly?.recoveryUpdatedAt).toBe(
      "2026-08-14T08:00:00.000Z"
    );
    expect(result.liveOnly?.recoveryUpdatedAt).toBe(
      "2026-08-14T08:00:00.001Z"
    );
  });
});
