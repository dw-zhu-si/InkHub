import { describe, expect, it } from "vitest";
import { LONG_AGENT_IDS } from "./long-workspace";
import { SubagentAuthoringRuntimeContextSchema } from "./subagent-authoring";

describe("SubagentAuthoringRuntimeContextSchema", () => {
  it("accepts every long-form parent agent", () => {
    for (const parentAgentId of LONG_AGENT_IDS) {
      expect(
        SubagentAuthoringRuntimeContextSchema.safeParse({
          parentAgentId,
          parentAgentLabel: parentAgentId,
          outputMode: "handoff",
          skills: [
            {
              id: "skill:test",
              title: "测试技能",
              libraryTitle: "测试技能库",
              body: "测试正文"
            }
          ],
          existingSubagentNames: []
        }).success
      ).toBe(true);
    }
  });
});
