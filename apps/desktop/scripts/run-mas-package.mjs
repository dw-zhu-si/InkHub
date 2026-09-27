import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { verifyMasPackage } from "./verify-mas-package.mjs";
import {
  normalizeOptionalTeamId,
  selectAppleSigningIdentity
} from "../../../tools/apple-signing-identities.mjs";

const DESKTOP_ROOT = resolve(import.meta.dirname, "..");
const WORKSPACE_ROOT = resolve(DESKTOP_ROOT, "../..");
const APP_ID = "com.zhusi.inkhub";

const BUILD_ENVIRONMENT_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TERM",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
  "DEVELOPER_DIR",
  "SDKROOT",
  "ELECTRON_CACHE",
  "XDG_CACHE_HOME"
];

export function masBuildEnvironment(source, additions = {}) {
  return {
    ...Object.fromEntries(
      BUILD_ENVIRONMENT_KEYS.flatMap((name) =>
        typeof source[name] === "string" && source[name] ? [[name, source[name]]] : []
      )
    ),
    ...additions
  };
}

export function masBuildVersion(configSource) {
  const match = /^buildVersion:\s*["']?([1-9][0-9]*)["']?\s*$/mu.exec(configSource);
  if (!match) throw new Error("MAS 配置缺少有效的正整数 buildVersion。");
  return match[1];
}

export function validateMasProfilePayload(decoded, now = Date.now(), expectedTeamId = "") {
  const entitlements = decoded?.Entitlements ?? {};
  const applicationIdentifier = entitlements["com.apple.application-identifier"] ??
    entitlements["application-identifier"];
  const platforms = Array.isArray(decoded?.Platform) ? decoded.Platform : [];
  const teams = Array.isArray(decoded?.TeamIdentifier) ? decoded.TeamIdentifier : [];
  if (teams.length !== 1) throw new Error("MAS provisioning profile 必须只属于一个 Apple 团队。");
  const teamId = normalizeOptionalTeamId(teams[0]);
  if (!teamId) throw new Error("MAS provisioning profile 缺少有效的 Apple Team ID。");
  const requestedTeam = normalizeOptionalTeamId(expectedTeamId);
  if ((requestedTeam && requestedTeam !== teamId) ||
      applicationIdentifier !== `${teamId}.${APP_ID}` ||
      entitlements["com.apple.developer.team-identifier"] !== teamId) {
    throw new Error("MAS provisioning profile 与墨枢应用 ID 或团队不匹配。");
  }
  // macOS App Store distribution profiles do not necessarily duplicate the
  // sandbox entitlement carried by the signed app. Distinguish distribution
  // profiles from development/Developer ID profiles using their platform and
  // device-scoping fields, then verify the app's sandbox entitlements after
  // electron-builder signs the candidate.
  if (!platforms.includes("OSX") ||
      Array.isArray(decoded?.ProvisionedDevices) ||
      decoded?.ProvisionsAllDevices === true ||
      entitlements["get-task-allow"] === true) {
    throw new Error("MAS provisioning profile 不是墨枢的 App Store 分发描述文件。");
  }
  if (Date.parse(decoded.ExpirationDate) <= now) {
    throw new Error("MAS provisioning profile 已过期。");
  }
  return { profile: decoded, teamId };
}

function run(command, args, {
  cwd = WORKSPACE_ROOT,
  capture = false,
  timeoutMs = 0,
  environment = masBuildEnvironment(process.env)
} = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let bytes = 0;
    let failure;
    const timer = timeoutMs ? setTimeout(() => {
      failure = new Error(`${basename(command)} MAS 打包步骤超时。`);
      child.kill("SIGTERM");
    }, timeoutMs) : undefined;
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (value) => {
        bytes += Buffer.byteLength(value);
        if (bytes > 8 * 1024 * 1024) {
          failure = new Error(`${basename(command)} MAS 打包输出超出限制。`);
          child.kill("SIGTERM");
        } else {
          stdout += value;
        }
      });
      // Certificate lookup errors can identify local accounts. Keep them out
      // of durable release reports while retaining the command exit status.
      child.stderr.resume();
    }
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0) {
        rejectPromise(failure ?? new Error(
          `${basename(command)} MAS 打包步骤失败 (exit=${code}, signal=${signal})。`
        ));
      } else {
        resolvePromise(stdout);
      }
    });
  });
}

async function assertMissing(path) {
  try {
    await access(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`MAS 正式制品目标已存在，禁止覆盖：${path}`);
}

async function readPlistValue(path, key, format = "json", optional = false) {
  try {
    const value = await run("/usr/bin/plutil", ["-extract", key, format, "-o", "-", path], { capture: true });
    return format === "json" ? JSON.parse(value) : value.trim();
  } catch (error) {
    if (optional) return undefined;
    throw error;
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function validateMasPreflight({
  profilePath,
  platform = process.platform,
  expectedTeamId = ""
}) {
  if (platform !== "darwin") throw new Error("Mac App Store 正式包只能在 macOS 签名环境构建。");
  if (!profilePath || !isAbsolute(profilePath)) {
    throw new Error("请通过 INKHUB_MAS_PROVISIONING_PROFILE 提供绝对路径，不要把描述文件复制进仓库。");
  }
  const profile = resolve(profilePath);
  if (!(await stat(profile)).isFile()) throw new Error("MAS provisioning profile 不是普通文件。");

  const temporary = await mkdtemp(join(tmpdir(), "inkhub-mas-profile-"));
  let validatedProfile;
  try {
    const decodedPath = join(temporary, "profile.plist");
    await run("/usr/bin/security", ["cms", "-D", "-i", profile, "-o", decodedPath]);
    // A provisioning profile contains certificate blobs, so converting the
    // complete plist to JSON fails. Extract only the auditable fields used by
    // preflight and leave the certificate payload untouched.
    const decoded = {
      Entitlements: await readPlistValue(decodedPath, "Entitlements"),
      Platform: await readPlistValue(decodedPath, "Platform"),
      TeamIdentifier: await readPlistValue(decodedPath, "TeamIdentifier"),
      ExpirationDate: await readPlistValue(decodedPath, "ExpirationDate", "raw"),
      ProvisionedDevices: await readPlistValue(decodedPath, "ProvisionedDevices", "json", true),
      ProvisionsAllDevices: await readPlistValue(decodedPath, "ProvisionsAllDevices", "json", true)
    };
    validatedProfile = validateMasProfilePayload(decoded, Date.now(), expectedTeamId);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const identities = await run("/usr/bin/security", ["find-identity", "-v"], { capture: true });
  const application = selectAppleSigningIdentity(
    identities,
    "Apple Distribution",
    validatedProfile.teamId
  );
  const installer = selectAppleSigningIdentity(
    identities,
    "3rd Party Mac Developer Installer",
    validatedProfile.teamId
  );
  if (application.qualifier !== installer.qualifier) {
    throw new Error("MAS 应用与安装包签名身份的名称限定符不一致。");
  }
  return {
    profilePath: profile,
    teamId: validatedProfile.teamId,
    qualifier: application.qualifier,
    applicationIdentity: application.identity,
    installerIdentity: installer.identity
  };
}

async function main() {
  const forbidden = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_API_KEY", "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER", "APPLE_TEAM_ID", "CSC_LINK", "CSC_KEY_PASSWORD", "CSC_NAME", "CSC_KEYCHAIN"];
  if (forbidden.some((name) => process.env[name])) {
    throw new Error("MAS 打包仅使用已核验的本机证书；请移除 Apple/CSC 凭证覆盖，且不要输出其内容。");
  }
  const signing = await validateMasPreflight({
    profilePath: process.env.INKHUB_MAS_PROVISIONING_PROFILE?.trim(),
    expectedTeamId: process.env.INKHUB_APPLE_TEAM_ID
  });
  const buildEnvironment = masBuildEnvironment(process.env, {
    INKHUB_APPLE_SIGNING_IDENTITY: signing.qualifier,
    INKHUB_APPLE_TEAM_ID: signing.teamId
  });
  const appPackage = JSON.parse(await readFile(join(DESKTOP_ROOT, "package.json"), "utf8"));
  const buildVersion = masBuildVersion(
    await readFile(join(DESKTOP_ROOT, "electron-builder.mas.yml"), "utf8")
  );
  const electronPackage = JSON.parse(await readFile(join(WORKSPACE_ROOT, "node_modules/electron/package.json"), "utf8"));
  const base = `InkHub-${appPackage.version}-mas-arm64`;
  const releaseDirectory = join(DESKTOP_ROOT, "release");
  await mkdir(releaseDirectory, { recursive: true });
  const packageName = `${base}.pkg`;
  const verificationName = `${base}-verification.json`;
  const sumsName = `${base}-SHA256SUMS.txt`;
  for (const name of [packageName, verificationName, sumsName]) {
    await assertMissing(join(releaseDirectory, name));
  }

  const output = await mkdtemp(join(tmpdir(), "inkhub-mas-release-work-"));
  let promoted = false;
  try {
    await run("pnpm", ["verify"], { environment: buildEnvironment });
    await run(process.execPath, [join(WORKSPACE_ROOT, "tools/generate-third-party-licenses.mjs"), "--check"], {
      environment: buildEnvironment
    });
    await run("pnpm", ["exec", "electron-builder", "--config", "electron-builder.mas.yml",
      `--config.electronVersion=${electronPackage.version}`,
      `--config.buildVersion=${buildVersion}`,
      `--config.directories.output=${output}`,
      `--config.mas.provisioningProfile=${signing.profilePath}`,
      `--config.mas.identity=${signing.qualifier}`,
      `--config.mas.extendInfo.ElectronTeamID=${signing.teamId}`,
      "--mac", "mas", "--arm64", "--publish", "never"], {
        cwd: DESKTOP_ROOT,
        environment: buildEnvironment
      });

    const appPath = join(output, "mas-arm64", "墨枢.app");
    // electron-builder emits the MAS installer beside the signed app rather
    // than at the configured output root.
    const packagePath = join(output, "mas-arm64", packageName);
    const verification = await verifyMasPackage({
      appPath,
      packagePath,
      expectedVersion: appPackage.version,
      expectedBuildVersion: buildVersion,
      expectedTeamId: signing.teamId,
      applicationIdentity: signing.applicationIdentity,
      installerIdentity: signing.installerIdentity
    });
    await writeFile(join(output, verificationName), `${JSON.stringify(verification, null, 2)}\n`, { flag: "wx" });
    await writeFile(join(output, sumsName), `${verification.packageSha256}  ${packageName}\n`, { flag: "wx" });

    for (const name of [packageName, verificationName, sumsName]) {
      const source = name === packageName ? packagePath : join(output, name);
      await copyFile(source, join(releaseDirectory, name), constants.COPYFILE_EXCL);
      if (await sha256(source) !== await sha256(join(releaseDirectory, name))) {
        throw new Error(`MAS 正式制品复制校验失败：${name}`);
      }
    }
    promoted = true;
    console.log(`MAS_RELEASE_VERIFIED version=${appPackage.version} architecture=arm64 package=${packageName}`);
  } finally {
    if (promoted) await rm(output, { recursive: true, force: true });
    else console.error(`MAS_RELEASE_INCOMPLETE 保留本轮候选：${output}；尚未上传或发布。`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
