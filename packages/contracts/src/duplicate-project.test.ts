import { describe, expect, it } from "vitest";
import {
  CommandEnvelopeSchema,
  DuplicateCatalogProjectInputSchema,
  DuplicateCatalogProjectResultSchema,
  LongDuplicateBookInputSchema,
  createEnvelope
} from "./index";

describe("project duplicate contracts", () => {
  it("validates catalog duplicate inputs and results", () => {
    expect(
      DuplicateCatalogProjectInputSchema.parse({
        domain: "material-group",
        projectId: "group-1"
      })
    ).toEqual({ domain: "material-group", projectId: "group-1" });
    expect(
      DuplicateCatalogProjectResultSchema.parse({
        sourceProjectId: "group-1",
        projectId: "group-2",
        domain: "material-group",
        title: "素材组copy1",
        copiedMemberLibraryIds: ["material-2"]
      }).copiedMemberLibraryIds
    ).toEqual(["material-2"]);
  });

  it("includes catalog and long duplicate commands in the system union", () => {
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope("catalog.duplicateProject", {
          domain: "book",
          projectId: "book-1"
        }, { id: "duplicate-catalog" })
      ).type
    ).toBe("catalog.duplicateProject");
    expect(LongDuplicateBookInputSchema.parse({ bookId: "longbook_one" })).toEqual({
      bookId: "longbook_one"
    });
    expect(
      CommandEnvelopeSchema.parse(
        createEnvelope(
          "long.duplicateBook",
          { bookId: "longbook_one" },
          { id: "duplicate-long" }
        )
      ).type
    ).toBe("long.duplicateBook");
  });
});
