import { describe, expect, it } from "vitest";
import source from "./InkHubNovelReader.vue?raw";

describe("InkHubNovelReader", () => {
  it("提供完整索引、章节目录、上下章、搜索、质检和续写入口", () => {
    expect(source).toContain("构建全书索引");
    expect(source).toContain("上一章");
    expect(source).toContain("下一章");
    expect(source).toContain("全文搜索");
    expect(source).toContain("本地全书质检");
    expect(source).toContain("应用内续写草稿");
    expect(source).toContain("reconstructStoryState");
    expect(source).toContain("generateStoryContinuation");
    expect(source).toContain("生成非正史候选");
    expect(source).toContain("generateStoryForecast");
    expect(source).toContain(":aria-current=");
    expect(source).toContain("? 'page' : undefined");
    expect(source).toContain("saveNovelReadingProgress");
    expect(source).toContain("!chapters.value.some((chapter) => chapter.id === progress.chapterId)");
    expect(source).not.toContain("<pre");
  });

  it("按卷分组章节，并为每项质检问题提供定位和修复工作台", () => {
    expect(source).toContain("volumeGroups");
    expect(source).toContain("volume-group");
    expect(source).toContain("未分卷");
    expect(source).toContain("定位章节");
    expect(source).toContain("开始修复");
    expect(source).toContain("repair-editor");
    expect(source).toContain("确认写回原稿");
    expect(source).toContain("applyNovelChapterRepair");
  });

  it("一键 AI 修复先确认计费、展示 Agent/Skill 与逐章审阅，再单独确认批量写回", () => {
    expect(source).toContain("一键 AI 修复全部");
    expect(source).toContain("本次会调用当前已选模型");
    expect(source).toContain("generateNovelAiRepairs");
    expect(source).toContain("getNovelAiRepairProgress");
    expect(source).toContain("AI 一键修复未开始或已停止");
    expect(source).toContain("预计至少");
    expect(source).toContain("ai-repair-review");
    expect(source).toContain("InkHubRepairReviewList");
    expect(source).toContain("@decision=\"decideAiRepairDraft\"");
    expect(source).toContain("@update=\"updateAiRepairDraft\"");
    expect(source).toContain("@accept-all=\"chooseAllAiRepairs('accepted')\"");
    expect(source).toContain("@keep-all=\"chooseAllAiRepairs('kept')\"");
    expect(source).toContain("applyNovelChapterRepairs");
    expect(source).toContain("确认批量写回");
    expect(source).toContain("resumeNovelAiRepairs");
    expect(source).toContain("cancelNovelAiRepairs");
    expect(source).toContain("每个完整批次都会立即保存在私有任务记录中");
    expect(source).toContain("修复后自动复检");
  });

  it("提供按卷七维深度质检、持久检查点和深度问题到 Agent/Skill 修复闭环", () => {
    expect(source).toContain("深度 AI 全书质检");
    expect(source).toContain("runNovelDeepQuality");
    expect(source).toContain("getNovelDeepQualityProgress");
    expect(source).toContain("resumeNovelDeepQuality");
    expect(source).toContain("cancelNovelDeepQuality");
    expect(source).toContain("时间线、人物知识与称谓、地点与世界观、因果、POV、文风和伏笔");
    expect(source).toContain("用对应 Agent / Skill 一键修复");
    expect(source).toContain("定位证据章节");
  });
});
