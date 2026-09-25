import { describe, expect, it } from "vitest";
import source from "./ModelUsagePanel.vue?raw";

describe("ModelUsagePanel", () => {
  it("provides a local usage dashboard with time-range queries", () => {
    expect(source).toContain("dashboard: ModelUsageDashboard | null");
    expect(source).toContain("query: [input: ModelUsageQueryInput]");
    expect(source).toContain('{ id: "24h", label: "近 24 小时" }');
    expect(source).toContain('const selectedRange = ref<TimeRange>("24h")');
    expect(source).toContain('{ id: 7, label: "近 7 天" }');
    expect(source).toContain('{ id: 30, label: "近 30 天" }');
    expect(source).toContain('{ id: "all", label: "全部" }');
    expect(source).toContain('emit("query", createQuery(range))');
    expect(source).toContain('emit("query", createQuery(selectedRange.value))');
    expect(source).toContain("trendGranularity");
  });

  it("keeps current and historical model usage visible with safe states", () => {
    expect(source).toContain('if (status === "current") return "当前配置"');
    expect(source).toContain('if (status === "historical") return "历史模型"');
    expect(source).toContain("还没有模型用量");
    expect(source).toContain('v-else-if="isEmpty && !hasModels"');
    expect(source).toContain("<span v-else class=\"usage-model-unused\">未使用</span>");
    expect(source).toContain("正在读取本地用量…");
    expect(source).toContain("模块分布");
    expect(source).toContain("模型状态");
    expect(source).toContain("最近实际调用");
    expect(source).toContain("本地最多保留 100 条");
    expect(source).toContain('return "本地模拟"');
    expect(source).toContain('return "旧版兼容托管"');
    expect(source).toContain('return "旧版兼容免费"');
    expect(source).not.toContain('return "DeepWrite 官方"');
  });
});
