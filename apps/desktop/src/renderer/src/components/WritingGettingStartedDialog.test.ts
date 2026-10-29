import { describe, expect, it } from "vitest";
import source from "./WritingGettingStartedDialog.vue?raw";
import sidebarSource from "./LeftSidebar.vue?raw";
import shellSource from "../WorkspaceShell.vue?raw";

describe("WritingGettingStartedDialog", () => {
  it("maps the core creation journey for short fiction, scripts, and long novels", () => {
    for (const workflow of ["短篇", "剧本", "长篇"]) {
      expect(source).toContain(`label: "${workflow}"`);
    }
    for (const step of ["故事立项", "大纲", "正文", "质检", "修复", "导出作品"]) {
      expect(source).toContain(step);
    }
    expect(source).toContain("剧情点与章卡都归属到对应卷");
    expect(source).toContain("撰写场次或剧集");
  });

  it("persists resumable progress locally and allows steps to be skipped", () => {
    expect(source).toContain('const STORAGE_KEY = "inkhub-writing-getting-started-v1"');
    expect(source).toContain("localStorage.getItem(STORAGE_KEY)");
    expect(source).toContain("localStorage.setItem(STORAGE_KEY");
    expect(source).toContain('function mark(status: StepStatus)');
    expect(source).toContain('@click="mark(\'skipped\')"');
    expect(source).toContain("state.value.currentStep[workflow]");
  });

  it("only navigates to existing destinations and never triggers model or manuscript writes", () => {
    expect(source).toContain('emit("navigate", activeStep.value.destination)');
    expect(source).toContain("不会自动发起模型请求、写入小说或接受 AI 修复");
    expect(source).not.toContain("window.deepwrite");
    expect(source).not.toContain("sendMessage(");
    expect(source).not.toContain("write_workspace");
  });

  it("is discoverable from the sidebar more-features list", () => {
    expect(sidebarSource).toContain('id: "writing-guide", label: "创作上手"');
    expect(sidebarSource).toContain('emit("openWritingGuide")');
    expect(shellSource).toContain('@open-writing-guide="writingGuideOpen = true"');
    expect(shellSource).toContain("<WritingGettingStartedDialog");
    expect(shellSource).toContain('layoutStore.showWorkspaceFeature("inkhub-library")');
  });
});
