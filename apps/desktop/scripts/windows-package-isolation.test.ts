import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const workspaceRoot = new URL("../../../", import.meta.url);
const runnerPath = new URL("tools/run-test-package.mjs", workspaceRoot);
const verifierPath = new URL("./verify-test-package.mjs", import.meta.url);
const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function loadRunner() {
  const source = await readFile(runnerPath, "utf8");
  // The old script immediately starts a full build when imported. Never execute
  // it merely to demonstrate the missing isolation behavior.
  if (!source.includes("pathToFileURL(resolve(process.argv[1])).href === import.meta.url")) {
    throw new Error("Test runner must be safe to import without starting packaging.");
  }
  return import("../../../tools/run-test-package.mjs");
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "inkhub-windows-isolation-test-"));
  temporary.push(root);
  const packageOutput = join(root, "candidate");
  const releaseDirectory = join(root, "release");
  await mkdir(packageOutput);
  await mkdir(releaseDirectory);
  return { packageOutput, releaseDirectory, version: "0.0.0" };
}

async function artifacts(output: string, architectures: string[]) {
  for (const arch of architectures) {
    for (const suffix of ["exe", "exe.blockmap"]) {
      await writeFile(join(output, `InkHub-0.0.0-win-${arch}-test.${suffix}`), `synthetic-${arch}-${suffix}`);
    }
  }
}

describe("Windows test-package output isolation", () => {
  it("builds and verifies in a private output directory before promotion", async () => {
    const source = await readFile(runnerPath, "utf8");
    const windowsSource = source.split("async function buildWindows")[1]?.split("async function main")[0] ?? "";
    expect(windowsSource).toContain('mkdtemp(join(tmpdir(), "inkhub-windows-builder-"))');
    expect(windowsSource).toContain("`--config.directories.output=${packageOutput}`");
    expect(windowsSource).toContain('"--release-dir", packageOutput');
    expect(windowsSource.indexOf('"scripts/verify-test-package.mjs"')).toBeLessThan(windowsSource.indexOf("await promoteWindowsTestArtifacts"));
    expect(windowsSource).toContain("finally");
    expect(windowsSource).toContain("await rm(packageOutput, { recursive: true, force: true })");
    expect(source).toContain('await run(pnpmCommand, ["verify"])');
    expect(source.indexOf('await run(pnpmCommand, ["audit"])')).toBeLessThan(source.indexOf('await run(pnpmCommand, ["verify"])'));
    expect(source).toContain("const finalRuntime = await ensureElectronRuntime()");
  });

  it("promotes only matching installers and blockmaps while retaining old working outputs", async () => {
    const { promoteWindowsTestArtifacts } = await loadRunner();
    const input = await fixture();
    await artifacts(input.packageOutput, ["arm64", "x64"]);
    await writeFile(join(input.packageOutput, "builder-debug.yml"), "new metadata");
    await writeFile(join(input.releaseDirectory, "builder-debug.yml"), "old metadata");
    await mkdir(join(input.releaseDirectory, "win-unpacked"));
    const results = await promoteWindowsTestArtifacts({ ...input, architectures: ["arm64", "x64"] });
    expect(results).toHaveLength(4);
    expect(await readFile(join(input.releaseDirectory, "builder-debug.yml"), "utf8")).toBe("old metadata");
    await expect(access(join(input.releaseDirectory, "win-unpacked"))).resolves.toBeUndefined();
    expect(await readFile(join(input.releaseDirectory, "InkHub-0.0.0-win-arm64-test.exe"), "utf8")).toBe("synthetic-arm64-exe");
    expect((await readdir(input.releaseDirectory)).sort()).toEqual([
      "InkHub-0.0.0-win-arm64-test.exe", "InkHub-0.0.0-win-arm64-test.exe.blockmap",
      "InkHub-0.0.0-win-x64-test.exe", "InkHub-0.0.0-win-x64-test.exe.blockmap",
      "builder-debug.yml", "win-unpacked"
    ]);
  });

  it("rejects an existing target before copying any part of the family", async () => {
    const { promoteWindowsTestArtifacts } = await loadRunner();
    const input = await fixture();
    await artifacts(input.packageOutput, ["x64"]);
    await writeFile(join(input.releaseDirectory, "InkHub-0.0.0-win-x64-test.exe.blockmap"), "existing bytes");
    await expect(promoteWindowsTestArtifacts({ ...input, architectures: ["x64"] })).rejects.toThrow("禁止覆盖");
    expect(await readFile(join(input.releaseDirectory, "InkHub-0.0.0-win-x64-test.exe.blockmap"), "utf8")).toBe("existing bytes");
    expect(await readdir(input.releaseDirectory)).toEqual(["InkHub-0.0.0-win-x64-test.exe.blockmap"]);
  });

  it("fails closed for an incomplete family and unsafe version or architecture", async () => {
    const { promoteWindowsTestArtifacts } = await loadRunner();
    const input = await fixture();
    await writeFile(join(input.packageOutput, "InkHub-0.0.0-win-x64-test.exe"), "synthetic-installer");
    await expect(promoteWindowsTestArtifacts({ ...input, architectures: ["x64"] })).rejects.toThrow();
    expect(await readdir(input.releaseDirectory)).toEqual([]);
    await expect(promoteWindowsTestArtifacts({ ...input, version: "../invalid", architectures: ["x64"] })).rejects.toThrow();
    await expect(promoteWindowsTestArtifacts({ ...input, architectures: ["../invalid"] })).rejects.toThrow();
  });

  it("rejects ambiguous, relative, or extra verifier output arguments before probing packages", () => {
    for (const extra of [["--release-dir", "relative"], ["--unknown", "invalid"], ["--release-dir"], ["extra"]]) {
      const result = spawnSync(process.execPath, [fileURLToPath(verifierPath), "win", "x64", ...extra], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
      expect(result.stderr).not.toContain("ENOENT");
    }
  });
});
