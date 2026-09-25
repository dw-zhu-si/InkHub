import { describe, expect, it } from "vitest";
import pageSource from "./InkHubLibraryPage.vue?raw";
import featureSource from "./WorkspaceFeatureModules.vue?raw";

describe("InkHub library layout", () => {
  it("spans the writing canvas instead of leaving the right grid column empty", () => {
    expect(featureSource).toContain('class="inkhub-library-main-view"');
    expect(featureSource).toContain('expand-button-class="inkhub-library-expand-sidebar"');
  });

  it("keeps primary actions legible and gives the page one scrolling owner", () => {
    expect(pageSource).toContain("white-space: nowrap");
    expect(pageSource).toContain("flex: 0 0 auto");
    expect(pageSource).toContain("height: 100%");
    expect(pageSource).toContain("container-type: inline-size");
  });

  it("exposes the installed cover Skill through an explicit style picker and generation request", () => {
    expect(pageSource).toContain("INKHUB_COVER_SKILLS");
    expect(pageSource).toContain("listCoverStyles()");
    expect(pageSource).toContain('accessible-label="小说封面风格"');
    expect(pageSource).toContain("styleId: coverStyleId.value");
    expect(pageSource).toContain("图片模型只生成无文字底图");
  });

  it("在小说库挂载全库索引与 ModelHub 状态中心", () => {
    expect(pageSource).toContain('import InkHubIndexCenter from "./InkHubIndexCenter.vue"');
    expect(pageSource).toContain("<InkHubIndexCenter");
    expect(pageSource).toContain(':entries="novelSnapshot?.entries ?? []"');
    expect(pageSource).toContain(':refresh-key="novelSnapshot?.scannedAt ?? \'\'"');
  });
});
