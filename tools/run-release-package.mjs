import { constants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";
import { verifyReleasePackage } from "../apps/desktop/scripts/verify-release-package.mjs";
import { notarizeDmg, preflightNotarization, releaseEnvironment, runReleaseCommand, sha256File, validateReleaseSigningConfig } from "./release-notarization.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");
const appDirectory = join(workspaceRoot, "apps/desktop");

export function parseReleaseTarget(args, hostPlatform = process.platform) {
  const [platform, architecture, ...extra] = args;
  if (platform !== "mac" || !["arm64", "x64"].includes(architecture) || extra.length) {
    throw new Error("Usage: node tools/run-release-package.mjs mac <arm64|x64>");
  }
  if (hostPlatform !== "darwin") throw new Error("macOS 正式包只能在 macOS 原生签名环境构建。");
  return architecture;
}

export async function runReleaseStages(stages) {
  let result;
  let failure;
  try {
    await stages.ensureRuntime();
    await stages.verify();
    await stages.build();
    await stages.notarize();
    result = await stages.verifyArtifacts();
  } catch (error) {
    failure = error;
  } finally {
    try { await stages.ensureRuntime(); }
    catch (error) {
      failure = failure ? new AggregateError([failure, error], "正式包流程失败，并且开发运行时恢复失败。") : error;
    }
  }
  if (failure) throw failure;
  return result;
}

async function assertMissing(path) {
  try { await access(path); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error(`正式制品目标已存在，禁止覆盖：${path}`);
}

async function main() {
  const architecture = parseReleaseTarget(process.argv.slice(2));
  const environment = releaseEnvironment(process.env);
  validateReleaseSigningConfig(await readFile(join(appDirectory, "electron-builder.release.yml"), "utf8"));
  let buildEnvironment = environment;
  const run = (command, args, options = {}) => runReleaseCommand(command, args, {
    cwd: workspaceRoot, env: buildEnvironment, ...options
  });
  // Fail before an expensive verify/build; never fall back to ad-hoc signing.
  const signing = await preflightNotarization(
    run,
    environment.APPLE_KEYCHAIN_PROFILE,
    environment.INKHUB_APPLE_TEAM_ID
  );
  buildEnvironment = {
    ...environment,
    INKHUB_APPLE_SIGNING_IDENTITY: signing.qualifier,
    INKHUB_APPLE_TEAM_ID: signing.teamId
  };
  await run(process.execPath, [join(workspaceRoot, "tools/generate-third-party-licenses.mjs"), "--check"]);
  console.log("RELEASE_PREFLIGHT_OK Developer ID and Keychain profile validated");
  const appPackage = JSON.parse(await readFile(join(appDirectory, "package.json"), "utf8"));
  const electronPackage = JSON.parse(await readFile(join(workspaceRoot, "node_modules/electron/package.json"), "utf8"));
  const base = `InkHub-${appPackage.version}-mac-${architecture}`;
  const releaseDirectory = join(appDirectory, "release");
  await mkdir(releaseDirectory, { recursive: true });
  const candidates = [`${base}.dmg`, `${base}.zip`, `${base}.zip.blockmap`, `${base}-verification.json`,
    `${base}-notarization.json`, `${base}-SHA256SUMS.txt`];
  for (const name of candidates) await assertMissing(join(releaseDirectory, name));
  // Desktop is managed by File Provider on this host. It can immediately
  // reattach Finder/provenance attributes after afterPack clears them, which
  // makes Developer ID reject the bundle. Build the ephemeral candidate away
  // from File Provider, then promote only verified artifacts to release/.
  const output = await mkdtemp(join(tmpdir(), "inkhub-release-work-"));
  console.log(`RELEASE_WORK_DIRECTORY ${output}`);
  const receiptPath = join(output, `${base}-notarization.json`);
  let promoted = false;
  try {
    const report = await runReleaseStages({
      ensureRuntime: async () => {
        const runtime = await ensureElectronRuntime();
        console.log(`RELEASE_RUNTIME_OK version=${runtime.version}`);
      },
      verify: () => run("pnpm", ["verify"]),
      build: () => run("pnpm", ["exec", "electron-builder", "--config", "electron-builder.release.yml",
        `--config.electronVersion=${electronPackage.version}`, `--config.directories.output=${output}`,
        "--mac", "dmg", "zip", `--${architecture}`, "--publish", "never"], { cwd: appDirectory }),
      notarize: () => notarizeDmg({ run, profile: environment.APPLE_KEYCHAIN_PROFILE,
        dmgPath: join(output, `${base}.dmg`), receiptPath }),
      verifyArtifacts: async () => {
        const result = await verifyReleasePackage({
          architecture,
          releaseDirectory: output,
          expectedSigningIdentity: signing.identity,
          expectedTeamId: signing.teamId
        });
        if (result.status !== "verified") throw new Error("正式制品未通过完整验收，禁止晋升。");
        return result;
      }
    });
    await writeFile(join(output, `${base}-verification.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    const names = [];
    for (const name of candidates.filter((name) => !name.endsWith("-SHA256SUMS.txt"))) {
      try { await stat(join(output, name)); names.push(name); }
      catch (error) { if (error.code !== "ENOENT" || !name.endsWith(".blockmap")) throw error; }
    }
    const hashes = new Map();
    for (const name of names) hashes.set(name, await sha256File(join(output, name)));
    const sumsName = `${base}-SHA256SUMS.txt`;
    await writeFile(join(output, sumsName), `${[...hashes].map(([name, hash]) => `${hash}  ${name}`).join("\n")}\n`, { flag: "wx" });
    names.push(sumsName);
    // Exclusive creation prevents a concurrent/new release from being overwritten.
    for (const name of names) {
      await copyFile(join(output, name), join(releaseDirectory, name), constants.COPYFILE_EXCL);
      if (await sha256File(join(output, name)) !== await sha256File(join(releaseDirectory, name))) {
        throw new Error(`正式制品复制校验失败：${name}；保留候选以便恢复。`);
      }
    }
    promoted = true;
    console.log(`RELEASE_VERIFIED version=${appPackage.version} architecture=${architecture} artifacts=${names.join(",")}`);
  } finally {
    if (promoted) await rm(output, { recursive: true, force: true });
    else console.error(`RELEASE_INCOMPLETE 保留本轮候选和公证回执：${output}；尚未完成发布。`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
