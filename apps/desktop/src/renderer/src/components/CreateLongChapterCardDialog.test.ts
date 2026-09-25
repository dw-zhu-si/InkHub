import { describe, expect, it } from "vitest";
import source from "./CreateLongChapterCardDialog.vue?raw";

describe("CreateLongChapterCardDialog", () => {
  it("uses a focused create form instead of the full structure manager", () => {
    expect(source).toContain("新建{{ unitLabel }}");
    expect(source).toContain("章卡标题");
    expect(source).toContain("小节名称");
    expect(source).toContain("关联剧情点（可选）");
    expect(source).toContain("不关联剧情点");
    expect(source).toContain('uiMessage.warning(`请输入${titleFieldLabel.value}。`)');
    expect(source).toContain("<PopupSelect");
    expect(source).not.toContain("<select");
    expect(source).toContain("<Teleport to=\"body\">");
    expect(source).not.toContain("LongStructureManager");
  });

  it("warns that creating a draft section also creates a chapter card", () => {
    expect(source).toContain('source?: "chapter-card" | "draft"');
    expect(source).toContain('props.source === "draft"');
    expect(source).toContain("fromDraft ? \"正文\" : \"剧情设计\"");
    expect(source).toContain(
      "确认后会同步创建对应章卡。建议先在「剧情设计 → 章卡」中维护好章卡，再开始编写正文。"
    );
    expect(source).toContain("创建后可在章卡中继续补充完整内容。");
    expect(source).toContain(
      'pending ? "创建中…" : fromDraft ? "确认新建" : "创建章卡"'
    );
    expect(source).not.toContain("is-danger");
  });

  it("submits the title with an optional plot point", () => {
    expect(source).toContain(
      "submit: [input: { title: string; primaryArcId: string | null }]"
    );
    expect(source).toContain("title: normalizedTitle");
    expect(source).toContain("primaryArcId: primaryArcId.value || null");
    expect(source).toContain('primaryArcId.value = ""');
    expect(source).not.toContain("请选择主剧情点");
  });
});
