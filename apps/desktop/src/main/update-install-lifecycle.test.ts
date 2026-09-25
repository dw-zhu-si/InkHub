import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("update install lifecycle", () => {
  it("finishes the graceful shutdown before handing control to the updater", () => {
    const helperStart = source.indexOf("function beginGracefulShutdown(");
    const helperEnd = source.indexOf("function broadcastEvent", helperStart + 1);
    const helper = source.slice(
      helperStart,
      helperEnd === -1 ? source.indexOf("type AgentEventEnvelope", helperStart) : helperEnd
    );

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helper).toContain("await supervisor.shutdownAll()");
    expect(helper).toContain("await modelUsageStore?.flush()");
    const shutdownCompleteIndex = helper.indexOf("shutdownComplete = true");
    expect(shutdownCompleteIndex).toBeLessThan(
      helper.indexOf("updateService.quitAndInstall()", shutdownCompleteIndex)
    );
  });

  it("does not start a normal app quit before invoking the update installer", () => {
    const constructorStart = source.indexOf("updateService = new UpdateService(");
    const constructorEnd = source.indexOf("appAlertStore =", constructorStart);
    const installRequest = source.slice(constructorStart, constructorEnd);

    expect(installRequest).toContain(
      "beginGracefulShutdown({ installUpdate: true })"
    );
    expect(installRequest).not.toContain("app.quit()");
  });

  it("keeps electron-updater out of the Mac App Store runtime path", () => {
    expect(source).toContain('import type { UpdateService } from "./update-service"');
    expect(source).toContain('const { UpdateService } = await import("./update-service")');
    expect(source).toContain("if (isMacAppStoreBuild)");
    expect(source).toContain("createMacAppStoreUpdateService()");
    expect(source).toContain("Mac App Store 版本由 App Store 统一更新。");
  });

  it("retries the native installer directly after graceful shutdown is complete", () => {
    const helperStart = source.indexOf("function beginGracefulShutdown(");
    const helperEnd = source.indexOf("type AgentEventEnvelope", helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(helper).toContain(
      "if (shutdownComplete && installUpdateAfterShutdown && updateService)"
    );
    expect(helper.indexOf("updateService.quitAndInstall()")).toBeLessThan(
      helper.indexOf("return;", helper.indexOf("if (quitting)"))
    );
  });

  it("exposes an installing state before starting graceful shutdown", () => {
    const updateServiceSource = readFileSync(
      new URL("./update-service.ts", import.meta.url),
      "utf8"
    );
    const installStart = updateServiceSource.indexOf("  install(): void {");
    const installEnd = updateServiceSource.indexOf(
      "  quitAndInstall(): void {",
      installStart
    );
    const install = updateServiceSource.slice(installStart, installEnd);

    expect(install.indexOf('status: "installing"')).toBeLessThan(
      install.indexOf("this.requestInstall()")
    );
    expect(install).toContain('message: "正在安全退出并准备安装，请稍候…"');
  });

  it("exits packaged smoke runs only after the shared graceful shutdown path finishes", () => {
    const helperStart = source.indexOf("function beginGracefulShutdown(");
    const helperEnd = source.indexOf("type AgentEventEnvelope", helperStart);
    const helper = source.slice(helperStart, helperEnd);
    const announceReadyStart = source.indexOf("async function announceReady(");
    const smokeStart = source.indexOf('process.env.DEEPWRITE_SMOKE === "1"', announceReadyStart);
    const smokeEnd = source.indexOf("\n  }\n}", smokeStart);
    const smokeBranch = source.slice(smokeStart, smokeEnd);

    expect(helper).toContain("exitProcessAfterShutdown ||= options.exitProcess === true");
    expect(helper).toContain("requiresMacOs26ExitWorkaround()");
    expect(helper).toContain("forceExitAfterVerifiedShutdown()");
    expect(source).toContain('console.log("DEEPWRITE_SMOKE_SHUTDOWN_OK")');
    expect(smokeBranch).toContain("process.exitCode = 1");
    expect(smokeBranch).toContain("beginGracefulShutdown({ exitProcess: true })");
  });
});
