import { describe, expect, it } from "vitest";
import source from "./TopicArchiveDialog.vue?raw";
import sidebarSource from "./LeftSidebar.vue?raw";
import shellSource from "../WorkspaceShell.vue?raw";
import lazySource from "./lazyAppComponents.ts?raw";
import storageSource from "../utils/topicArchiveStorage.ts?raw";

describe("TopicArchiveDialog", () => {
  it("keeps a local project-level record with promise, conflict, lifecycle status, and traceable evidence", () => {
    expect(storageSource).toContain('TOPIC_STORAGE_KEY = "inkhub-topic-archive-v1"');
    expect(storageSource).toContain("promise: string");
    expect(storageSource).toContain("conflict: string");
    expect(source).toContain('id: "idea", label: "灵感"');
    expect(source).toContain('id: "selected", label: "待立项"');
    expect(source).toContain('id: "developing", label: "创作中"');
    expect(source).toContain('id: "archived", label: "已归档"');
    expect(storageSource).toContain("observedAt: string");
    expect(source).toContain('id: "source", label: "外部来源"');
    expect(source).toContain('id: "author", label: "作者判断"');
    expect(source).toContain('id: "inference", label: "推断/待核实"');
  });

  it("does not imply live research or call models, and requires confirmation before deletion", () => {
    expect(source).toContain("不会自动联网或调用模型");
    expect(source).toContain("不会伪称实时市场调研");
    expect(source).not.toContain("window.deepwrite");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("sendMessage(");
    expect(source).toContain("window.confirm(");
    expect(source).toContain("normalizeEvidenceUrl");
    expect(storageSource).toContain('url.protocol === "https:" || url.protocol === "http:"');
    expect(source).toContain("MAX_TOPIC_RECORDS");
    expect(source).toContain("filteredRecords.value.slice(0, 200)");
  });

  it("is discoverable from the sidebar and mounts lazily in the workspace shell", () => {
    expect(sidebarSource).toContain('id: "topic-archive", label: "选题档案"');
    expect(sidebarSource).toContain('emit("openTopicArchive")');
    expect(shellSource).toContain('@open-topic-archive="topicArchiveOpen = true"');
    expect(shellSource).toContain("<TopicArchiveDialog");
    expect(lazySource).toContain('() => import("./TopicArchiveDialog.vue")');
  });
});
