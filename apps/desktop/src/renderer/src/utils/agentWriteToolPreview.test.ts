import { describe, expect, it } from "vitest";
import { writeToolText } from "./agentWriteToolPreview";

describe("writeToolText", () => {
  it("prefers completed write-tool text and content", () => {
    expect(writeToolText({ args: { text: "整章正文" } })).toBe("整章正文");
    expect(writeToolText({ args: { content: "待审阅正文" } })).toBe("待审阅正文");
  });

  it("joins every completed replacement instead of only the first", () => {
    expect(
      writeToolText({
        args: {
          replacements: [
            { original_text: "旧A", new_text: "新A" },
            { original_text: "旧B", new_text: "新B" }
          ]
        }
      })
    ).toBe("新A\n\n新B");
  });

  it("streams a single write-tool text field before execution", () => {
    expect(
      writeToolText({
        argumentsText: '{"section_id":"section-1","text":"第一段'
      })
    ).toBe("第一段");
  });

  it("keeps accumulating later replacement new_text while arguments stream", () => {
    const first = '{"replacements":[{"original_text":"旧A","new_text":"新A正在写';
    expect(writeToolText({ argumentsText: first })).toBe("新A正在写");

    const firstClosed =
      '{"replacements":[{"original_text":"旧A","new_text":"新A"},{"original_text":"旧B","new_text":"';
    expect(writeToolText({ argumentsText: firstClosed })).toBe("新A\n\n");

    const secondPartial = `${firstClosed}新B还在写`;
    expect(writeToolText({ argumentsText: secondPartial })).toBe("新A\n\n新B还在写");
    expect(writeToolText({ argumentsText: secondPartial }).length).toBeGreaterThan(
      writeToolText({ argumentsText: firstClosed }).length
    );

    const completed =
      '{"replacements":[{"original_text":"旧A","new_text":"新A"},{"original_text":"旧B","new_text":"新B"},{"original_text":"旧C","new_text":"新C"}]}';
    expect(writeToolText({ argumentsText: completed })).toBe("新A\n\n新B\n\n新C");
  });

  it("decodes escaped characters inside streamed replacements", () => {
    expect(
      writeToolText({
        argumentsText:
          '{"replacements":[{"new_text":"第一行\\n第二行"},{"new_text":"他说：\\"好\\""}]}'
      })
    ).toBe('第一行\n第二行\n\n他说："好"');
  });

  it("falls back to empty text when no write payload is present", () => {
    expect(writeToolText({})).toBe("");
    expect(writeToolText({ argumentsText: '{"section_id":"section-1"' })).toBe("");
  });
});
