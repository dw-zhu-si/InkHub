import { spawn } from "node:child_process";
import { constants, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { access, copyFile, lstat, mkdir, mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(toolsDirectory, "..");
const appDirectory = resolve(workspaceRoot, "apps/desktop");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, cwd = workspaceRoot) {
  console.log(`PACKAGE_STEP command=${command} ${args.join(" ")}`);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit"
    });
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `${command} ${args.join(" ")} 执行失败（exit=${String(code)}, signal=${String(signal)}）`
        )
      );
    });
  });
}

function parseTarget(args) {
  const [platform, arch] = args;
  if (platform === "all" && arch === undefined) {
    return { buildMacArm64: true, buildMacX64: true, buildWinArm64: true, buildWinX64: true };
  }
  if (platform === "mac" && arch === "all") {
    return { buildMacArm64: true, buildMacX64: true, buildWinArm64: false, buildWinX64: false };
  }
  if (platform === "mac" && arch === "arm64") {
    return { buildMacArm64: true, buildMacX64: false, buildWinArm64: false, buildWinX64: false };
  }
  if (platform === "mac" && arch === "x64") {
    return { buildMacArm64: false, buildMacX64: true, buildWinArm64: false, buildWinX64: false };
  }
  if (platform === "win" && arch === "x64") {
    return { buildMacArm64: false, buildMacX64: false, buildWinArm64: false, buildWinX64: true };
  }
  if (platform === "win" && arch === "arm64") {
    return { buildMacArm64: false, buildMacX64: false, buildWinArm64: true, buildWinX64: false };
  }
  if (platform === "win" && arch === "all") {
    return { buildMacArm64: false, buildMacX64: false, buildWinArm64: true, buildWinX64: true };
  }
  throw new Error(
    "Usage: node tools/run-test-package.mjs <all | mac arm64 | mac x64 | mac all | win arm64 | win x64 | win all>"
  );
}

async function electronVersion() {
  const packageJson = JSON.parse(
    await readFile(resolve(workspaceRoot, "node_modules/electron/package.json"), "utf8")
  );
  return packageJson.version;
}

async function buildMac(target, version) {
  const architectures = [
    ...(target.buildMacArm64 ? ["--arm64"] : []),
    ...(target.buildMacX64 ? ["--x64"] : [])
  ];
  if (!architectures.length) return;
  const packageOutput = await mkdtemp(join(tmpdir(), "inkhub-electron-builder-"));
  try {
    await run(
      pnpmCommand,
      [
        "exec",
        "electron-builder",
        "--config",
        "electron-builder.yml",
        `--config.electronVersion=${version}`,
        `--config.directories.output=${packageOutput}`,
        "--mac",
        "dmg",
        "zip",
        ...architectures,
        "--publish",
        "never"
      ],
      appDirectory
    );

    const appPackageJson = JSON.parse(
      await readFile(resolve(appDirectory, "package.json"), "utf8")
    );
    const releaseDirectory = resolve(appDirectory, "release");
    await mkdir(releaseDirectory, { recursive: true });
    const selectedArchitectures = [
      ...(target.buildMacArm64 ? ["arm64"] : []),
      ...(target.buildMacX64 ? ["x64"] : [])
    ];
    for (const architecture of selectedArchitectures) {
      const base = `InkHub-${appPackageJson.version}-mac-${architecture}-test`;
      for (const suffix of ["dmg", "zip", "dmg.blockmap", "zip.blockmap"]) {
        await copyFile(
          join(packageOutput, `${base}.${suffix}`),
          join(releaseDirectory, `${base}.${suffix}`)
        );
      }
      await run(
        pnpmCommand,
        ["exec", "node", "scripts/verify-test-package.mjs", "mac", architecture],
        appDirectory
      );
    }
  } finally {
    await rm(packageOutput, { recursive: true, force: true });
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function promoteWindowsTestArtifacts({ packageOutput, releaseDirectory, version, architectures }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version) ||
      !architectures.length || new Set(architectures).size !== architectures.length ||
      architectures.some((architecture) => !["arm64", "x64"].includes(architecture))) {
    throw new Error("Windows 测试制品的版本或架构无效。");
  }
  const candidates = [];
  // Preflight the complete family before publishing even its first member.
  for (const architecture of architectures) {
    for (const suffix of ["exe", "exe.blockmap"]) {
      const name = `InkHub-${version}-win-${architecture}-test.${suffix}`;
      const source = join(packageOutput, name);
      const destination = join(releaseDirectory, name);
      const metadata = await lstat(source);
      if (!metadata.isFile() || metadata.size === 0) throw new Error(`Windows 测试制品缺失或不是普通文件：${name}`);
      try {
        await access(destination);
        throw new Error(`Windows 测试制品目标已存在，禁止覆盖：${name}`);
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      candidates.push({ name, source, destination, sha256: await sha256(source) });
    }
  }
  await mkdir(releaseDirectory, { recursive: true });
  const created = [];
  try {
    for (const candidate of candidates) {
      await copyFile(candidate.source, candidate.destination, constants.COPYFILE_EXCL);
      created.push(candidate);
      if (await sha256(candidate.destination) !== candidate.sha256) {
        throw new Error(`Windows 测试制品复制校验失败：${candidate.name}`);
      }
    }
  } catch (failure) {
    // Roll back only bytes created by this invocation and still unchanged;
    // never remove a concurrent writer's replacement or pre-existing output.
    for (const candidate of created.reverse()) {
      try {
        if (await sha256(candidate.destination) === candidate.sha256) await unlink(candidate.destination);
      } catch (error) { if (error.code !== "ENOENT") console.error(`保留待检查的本轮 Windows 部分制品：${candidate.name}`); }
    }
    throw failure;
  }
  return candidates.map(({ name, sha256 }) => ({ name, sha256 }));
}

async function buildWindows(target, version) {
  const architectures = [
    ...(target.buildWinArm64 ? ["--arm64"] : []),
    ...(target.buildWinX64 ? ["--x64"] : [])
  ];
  if (!architectures.length) return;
  const packageOutput = await mkdtemp(join(tmpdir(), "inkhub-windows-builder-"));
  try {
    await run(pnpmCommand, [
      "exec", "electron-builder", "--config", "electron-builder.yml",
      `--config.electronVersion=${version}`, `--config.directories.output=${packageOutput}`,
      "--win", "nsis", ...architectures, "--publish", "never"
    ], appDirectory);
    const selectedArchitectures = [
      ...(target.buildWinArm64 ? ["arm64"] : []),
      ...(target.buildWinX64 ? ["x64"] : [])
    ];
    for (const architecture of selectedArchitectures) {
      await run(pnpmCommand, [
        "exec", "node", "scripts/verify-test-package.mjs", "win", architecture,
        "--release-dir", packageOutput
      ], appDirectory);
    }
    const appPackageJson = JSON.parse(await readFile(join(appDirectory, "package.json"), "utf8"));
    const promoted = await promoteWindowsTestArtifacts({
      packageOutput, releaseDirectory: join(appDirectory, "release"),
      version: appPackageJson.version, architectures: selectedArchitectures
    });
    console.log(`WINDOWS_TEST_ARTIFACTS_VERIFIED ${JSON.stringify(promoted)}`);
  } finally {
    await rm(packageOutput, { recursive: true, force: true });
  }
}

async function main() {
  const target = parseTarget(process.argv.slice(2));
  const initialRuntime = await ensureElectronRuntime();
  const version = await electronVersion();
  console.log(
    `PACKAGE_RUNTIME_BASELINE version=${version} executable=${initialRuntime.executable}`
  );

  let packagingError;
  try {
    await run(pnpmCommand, ["audit"]);
    await run(pnpmCommand, ["verify"]);
    await buildMac(target, version);
    await buildWindows(target, version);
  } catch (error) {
    packagingError = error;
  } finally {
    try {
      const finalRuntime = await ensureElectronRuntime();
      console.log(
        `PACKAGE_RUNTIME_POSTCHECK_OK version=${finalRuntime.version} executable=${finalRuntime.executable}`
      );
    } catch (runtimeError) {
      packagingError = packagingError
        ? new AggregateError(
            [packagingError, runtimeError],
            "测试包构建失败，并且 Electron 开发运行时恢复失败。"
          )
        : runtimeError;
    }
  }
  if (packagingError) throw packagingError;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
