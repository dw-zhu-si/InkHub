import { describe, expect, it } from "vitest";
import { createBoundedRepairReviewPage } from "./inkhubDeepQualityReview";

describe("createBoundedRepairReviewPage", () => {
  it("clamps invalid pages and preserves the original collection", () => {
    const items = Array.from({ length: 21 }, (_, index) => index + 1);
    const page = createBoundedRepairReviewPage(items, 99, 10);

    expect(page.page).toBe(3);
    expect(page.items).toEqual([21]);
    expect(items).toHaveLength(21);
  });

  it("returns an accessible empty first page", () => {
    expect(createBoundedRepairReviewPage([], 4)).toMatchObject({
      page: 1,
      totalPages: 1,
      totalItems: 0,
      items: []
    });
  });
});
