import { describe, expect, it } from "vitest";
import {
  resolveDevelopmentRendererUrl,
  trustedRendererUrl
} from "./renderer-security";

describe("renderer security policy", () => {
  it("allows only a local HTTP development renderer", () => {
    expect(resolveDevelopmentRendererUrl("http://127.0.0.1:5173/")).toBe("http://127.0.0.1:5173/");
    expect(resolveDevelopmentRendererUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
    expect(resolveDevelopmentRendererUrl("https://example.test/")).toBeNull();
    expect(resolveDevelopmentRendererUrl("http://localhost.example.test:5173/")).toBeNull();
    expect(resolveDevelopmentRendererUrl("http://user:pass@localhost:5173/")).toBeNull();
  });

  it("ignores development URLs for a packaged renderer", () => {
    const rendererFilePath = "/Applications/墨枢.app/Contents/Resources/app.asar/out/renderer/index.html";
    expect(trustedRendererUrl({
      candidateUrl: "file:///Applications/%E5%A2%A8%E6%9E%A2.app/Contents/Resources/app.asar/out/renderer/index.html",
      packaged: true,
      rendererFilePath,
      developmentUrl: "http://127.0.0.1:5173/"
    })).toBe(true);
    expect(trustedRendererUrl({
      candidateUrl: "http://127.0.0.1:5173/",
      packaged: true,
      rendererFilePath,
      developmentUrl: "http://127.0.0.1:5173/"
    })).toBe(false);
    expect(trustedRendererUrl({
      candidateUrl: "file://evil-host/Applications/%E5%A2%A8%E6%9E%A2.app/Contents/Resources/app.asar/out/renderer/index.html",
      packaged: true,
      rendererFilePath
    })).toBe(false);
    expect(trustedRendererUrl({
      candidateUrl: "file:///Applications/%E5%A2%A8%E6%9E%A2.app/Contents/Resources/app.asar/out/renderer/index.html?unexpected=1",
      packaged: true,
      rendererFilePath
    })).toBe(false);
  });
});
