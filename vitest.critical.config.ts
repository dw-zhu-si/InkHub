import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/desktop/src/main/inkhub-deep-quality-service.test.ts",
      "apps/desktop/src/main/inkhub-deep-quality-coordinator.test.ts",
      "apps/desktop/src/main/inkhub-novel-knowledge.test.ts",
      "apps/desktop/src/main/inkhub-repair-routing.test.ts",
      "apps/desktop/src/main/modelhub-endpoint.test.ts",
      "apps/desktop/src/renderer/src/utils/inkhubDeepQualityReview.test.ts",
      "apps/desktop/src/renderer/src/utils/inkhubRepairReview.test.ts"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/critical",
      include: [
        "apps/desktop/src/main/inkhub-deep-quality-service.ts",
        "apps/desktop/src/main/inkhub-deep-quality-coordinator.ts",
        "apps/desktop/src/main/inkhub-novel-knowledge.ts",
        "apps/desktop/src/main/inkhub-repair-routing.ts",
        "apps/desktop/src/main/modelhub-endpoint.ts",
        "apps/desktop/src/renderer/src/utils/inkhubDeepQualityReview.ts",
        "apps/desktop/src/renderer/src/utils/inkhubRepairReview.ts"
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    }
  }
});
