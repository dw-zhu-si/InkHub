import { describe, expect, it } from "vitest";
import {
  advanceDraftSectionCreationRevision,
  draftSectionCreationRevisionKey,
  expectedDraftSectionCreationRevision,
  resolveDraftSectionCreationCommitPlan
} from "./draftSectionCreationRevision";

describe("draft section creation revision chain", () => {
  it("continues same-run proposals from the last real directory revision", () => {
    const first = advanceDraftSectionCreationRevision(
      "directory-v1",
      "directory-v2",
      undefined
    );
    const second = advanceDraftSectionCreationRevision(
      "directory-v1",
      "directory-v3",
      first
    );

    expect(expectedDraftSectionCreationRevision("directory-v1", first)).toBe(
      "directory-v2"
    );
    expect(expectedDraftSectionCreationRevision("directory-v1", second)).toBe(
      "directory-v3"
    );
    expect(draftSectionCreationRevisionKey("run-a", "book-b")).toBe(
      "run-a\u0000book-b"
    );
  });

  it("does not reuse a cursor that belongs to another base directory", () => {
    const cursor = advanceDraftSectionCreationRevision(
      "directory-v1",
      "directory-v2",
      undefined
    );

    expect(expectedDraftSectionCreationRevision("external-v4", cursor)).toBe(
      "external-v4"
    );
  });

  it("uses the live project revision while the expected directory still matches", () => {
    expect(
      resolveDraftSectionCreationCommitPlan({
        currentDirectoryRevision: "directory-v2",
        expectedDirectoryRevision: "directory-v2",
        capturedBaseProjectRevision: 4,
        currentProjectRevision: 7
      })
    ).toEqual({
      mode: "current",
      baseProjectRevision: 7
    });
  });

  it("uses the frozen project revision only as an idempotent recovery probe", () => {
    expect(
      resolveDraftSectionCreationCommitPlan({
        currentDirectoryRevision: "directory-v3",
        expectedDirectoryRevision: "directory-v2",
        capturedBaseProjectRevision: 4,
        currentProjectRevision: 8
      })
    ).toEqual({
      mode: "idempotent-recovery",
      baseProjectRevision: 4
    });
  });

  it("blocks a mismatched legacy proposal that has no frozen project revision", () => {
    expect(
      resolveDraftSectionCreationCommitPlan({
        currentDirectoryRevision: "directory-v3",
        expectedDirectoryRevision: "directory-v2",
        capturedBaseProjectRevision: undefined,
        currentProjectRevision: 8
      })
    ).toEqual({ mode: "conflict" });
  });
});
