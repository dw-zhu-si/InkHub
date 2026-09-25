import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("InkHub external service isolation", () => {
  it("returns a local anonymous marketplace session instead of throwing during startup", () => {
    expect(mainSource).toContain('request.operation === "session" || request.operation === "logout"');
    expect(mainSource).toContain("MarketplaceSessionSchema.parse({");
    expect(mainSource).toContain("墨枢本地版未启用技能广场网络服务；本机 Skills 不受影响。");
  });

  it("rejects legacy DeepWrite model channels and permissions in Main", () => {
    expect(mainSource).toContain('code: "models.legacy_channel_disabled"');
    expect(mainSource).toContain("墨枢支持 ModelHub 与用户自定义厂家 API");
    expect(mainSource).toContain("setPermissionRequestHandler");
    expect(mainSource).toContain("setPermissionCheckHandler");
  });
});
