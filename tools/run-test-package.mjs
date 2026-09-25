import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

async function buildWindows(target, version) {
  const architectures = [
    ...(target.buildWinArm64 ? ["--arm64"] : []),
    ...(target.buildWinX64 ? ["--x64"] : [])
  ];
  if (!architectures.length) return;
  await run(
    pnpmCommand,
    [
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.yml",
      `--config.electronVersion=${version}`,
      "--win",
      "nsis",
      ...architectures,
      "--publish",
      "never"
    ],
    appDirectory
  );
  for (const architecture of [
    ...(target.buildWinArm64 ? ["arm64"] : []),
    ...(target.buildWinX64 ? ["x64"] : [])
  ]) {
    await run(pnpmCommand, ["exec", "node", "scripts/verify-test-package.mjs", "win", architecture], appDirectory);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
