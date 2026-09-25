import { describe, expect, it } from "vitest";
import {
  parseLongWorldbuildingMarkdownList,
  serializeLongWorldbuildingMarkdownList
} from "./index";

describe("long worldbuilding Markdown list", () => {
  it("round-trips stable item ids and readable Markdown bodies", () => {
    const items = [
      {
        id: "worlditem_magic",
        title: "魔法代价",
        content: "每次施法都会遗忘一段记忆。\n\n- 不可逆\n- 可被记录"
      },
      {
        id: "worlditem_letters",
        title: "来信",
        content: "普通火焰无法烧毁。"
      }
    ];
    const markdown = serializeLongWorldbuildingMarkdownList(items);
    expect(markdown).toContain("## 魔法代价");
    expect(parseLongWorldbuildingMarkdownList(markdown)).toEqual(items);
  });

  it("rejects unversioned, duplicate or ambiguous item content", () => {
    expect(() =>
      parseLongWorldbuildingMarkdownList("## 未声明格式")
    ).toThrow();
    expect(() =>
      serializeLongWorldbuildingMarkdownList([
        { id: "worlditem_same", title: "一", content: "" },
        { id: "worlditem_same", title: "二", content: "" }
      ])
    ).toThrow();
    expect(() =>
      serializeLongWorldbuildingMarkdownList([
        {
          id: "worlditem_marker",
          title: "保留标记",
          content: "<!-- deepwrite-world-item:worlditem_nested -->"
        }
      ])
    ).toThrow();
  });
});
