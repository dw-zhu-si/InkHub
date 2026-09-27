import { describe, expect, it } from "vitest";
import source from "./InkHubIndexCenter.vue?raw";

describe("InkHubIndexCenter", () => {
  it("汇总全库索引状态并提供批量构建、取消和失败重试", () => {
    expect(source).toContain("全库索引中心");
    expect(source).toContain("已就绪");
    expect(source).toContain("待索引");
    expect(source).toContain("需更新");
    expect(source).toContain("失败");
    expect(source).toContain("一键构建待处理");
    expect(source).toContain("停止队列");
    expect(source).toContain("重试失败项");
    expect(source).toContain("getNovelIndex(entry.id, false)");
    expect(source).toContain("先读取最近索引快照");
    expect(source).toContain("buildNovelIndex");
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('aria-live="polite"');
  });

  it("只在用户明确点击后用模型列表端点探测服务", () => {
    expect(source).toContain("模型服务运行状态");
    expect(source).toContain("models.list()");
    expect(source).toContain("models.listRemote");
    expect(source).toContain("检查连接");
    expect(source).toContain("点击检查会连接已配置的服务并携带所需凭证");
    expect(source).toContain("void loadIndexStatuses();");
    expect(source).not.toContain("Promise.all([loadIndexStatuses(), checkModelHub()])");
    expect(source).not.toContain("models.test(");
  });

  it("每部作品都有独立状态和可键盘操作的构建入口", () => {
    expect(source).toContain('v-for="entry in entries"');
    expect(source).toContain("构建索引");
    expect(source).toContain("重试");
    expect(source).toContain(":disabled=");
    expect(source).toContain("min-width: 0");
    expect(source).toContain("overflow-wrap: anywhere");
  });
});
