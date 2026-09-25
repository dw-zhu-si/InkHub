import { describe, expect, it } from "vitest";
import { INKHUB_REPAIR_ROUTES, repairRouteForRule } from "./inkhub-repair-routing";

describe("InkHub quality repair routing", () => {
  it("routes every local quality rule to concrete agents and skills", () => {
    for (const rule of [
      "duplicate-paragraph",
      "empty-chapter",
      "very-short-chapter",
      "chapter-order-gap"
    ] as const) {
      const route = repairRouteForRule(rule);
      expect(route.agents.length).toBeGreaterThan(0);
      expect(route.skills.length).toBeGreaterThan(0);
      expect(route.instruction.length).toBeGreaterThan(30);
    }
  });

  it("uses stable unique ids so installed capabilities can be verified", () => {
    for (const route of Object.values(INKHUB_REPAIR_ROUTES)) {
      expect(new Set(route.agents).size).toBe(route.agents.length);
      expect(new Set(route.skills).size).toBe(route.skills.length);
      expect(route.agents.every((id) => id.startsWith("inkhub_"))).toBe(true);
    }
  });
});
