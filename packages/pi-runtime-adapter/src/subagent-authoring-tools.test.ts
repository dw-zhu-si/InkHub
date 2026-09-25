import { describe, expect, it } from "vitest";
import {
  buildSubagentAuthoringTools,
  isSubagentAuthoringToolDetails,
  renderSubagentAuthoringSystemPrompt
} from "./subagent-authoring-tools";

const context = {
  parentAgentId: "expert_draft_coordinator" as const,
  parentAgentLabel: "正文",
  outputMode: "handoff" as const,
  skills: [
    {
      id: "skill:lib1:entry1",
      title: "对白节奏",
      libraryTitle: "文风库",
      body: "对白要短，动作穿插其间。"
    }
  ],
  existingSubagentNames: ["场景检查员"]
};

describe("subagent authoring tools", () => {
  it("renders a system prompt that encodes the user-confirmed output mode", () => {
    const prompt = renderSubagentAuthoringSystemPrompt(context);
    expect(prompt).toContain("只交回结论");
    expect(prompt).toContain("不要调用写入");
    expect(prompt).toContain("对白节奏");
    expect(prompt).toContain("场景检查员");
  });

  it("exposes read and draft tools and emits a draft update", async () => {
    const tools = buildSubagentAuthoringTools(context);
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_authoring_skills",
      "read_authoring_skill",
      "write_subagent_draft"
    ]);

    const read = tools.find((tool) => tool.name === "read_authoring_skill");
    const write = tools.find((tool) => tool.name === "write_subagent_draft");
    expect(read && write).toBeTruthy();

    const readResult = await read!.execute("call_read", {
      skill_id: "skill:lib1:entry1"
    });
    expect(readResult.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("对白要短")
    });

    const writeResult = await write!.execute("call_write", {
      name: "对白助手",
      description: "处理对白节奏问题。",
      system_prompt: "你只审阅对白，把问题交回主智能体。"
    });
    expect(isSubagentAuthoringToolDetails(writeResult.details)).toBe(true);
    if (isSubagentAuthoringToolDetails(writeResult.details)) {
      expect(writeResult.details.draft.name).toBe("对白助手");
    }
  });
});
