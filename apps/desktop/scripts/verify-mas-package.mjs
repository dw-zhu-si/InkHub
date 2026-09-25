import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ID = "com.zhusi.inkhub";

function run(command, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let failure;
    const timer = setTimeout(() => {
      failure = new Error(`${basename(command)} MAS 验证超时。`);
      child.kill("SIGTERM");
    }, timeoutMs);
    for (const [stream, append] of [
      [child.stdout, (value) => { stdout += value; }],
      [child.stderr, (value) => { stderr += value; }]
    ]) {
      stream.setEncoding("utf8");
      stream.on("data", (value) => {
        bytes += Buffer.byteLength(value);
        if (bytes > 8 * 1024 * 1024) {
          failure = new Error(`${basename(command)} MAS 验证输出超出限制。`);
          child.kill("SIGTERM");
          return;
        }
        append(value);
      });
    }
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0) {
        rejectPromise(failure ?? new Error(
          `${basename(command)} MAS 验证失败 (exit=${code}, signal=${signal})。`
        ));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

async function parsePlist(path) {
  const { stdout } = await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", path]);
  return JSON.parse(stdout);
}

async function readSignedEntitlements(appPath) {
  const output = await run("/usr/bin/codesign", ["-d", "--entitlements", ":-", "--xml", appPath]);
  const combined = `${output.stdout}\n${output.stderr}`;
  const start = combined.indexOf("<?xml");
  const end = combined.lastIndexOf("</plist>");
  if (start < 0 || end < start) throw new Error("无法读取 MAS 应用签名权限。\n");
  const directory = await mkdtemp(join(tmpdir(), "inkhub-mas-entitlements-"));
  try {
    const path = join(directory, "entitlements.plist");
    await writeFile(path, combined.slice(start, end + "</plist>".length), { flag: "wx" });
    return await parsePlist(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyRequiredMacAppIcon(appPath, info) {
  const configuredIcon = typeof info.CFBundleIconFile === "string" && info.CFBundleIconFile.trim()
    ? info.CFBundleIconFile.trim()
    : "icon.icns";
  const iconName = configuredIcon.endsWith(".icns") ? configuredIcon : `${configuredIcon}.icns`;
  const iconPath = join(appPath, "Contents", "Resources", iconName);
  const iconStat = await stat(iconPath);
  if (!iconStat.isFile() || iconStat.size === 0) {
    throw new Error("MAS 应用缺少有效的 ICNS 图标。\n");
  }

  const directory = await mkdtemp(join(tmpdir(), "inkhub-mas-icon-"));
  try {
    const iconsetPath = join(directory, "InkHub.iconset");
    await run("/usr/bin/iconutil", ["-c", "iconset", iconPath, "-o", iconsetPath]);
    const requiredRepresentation = join(iconsetPath, "icon_512x512@2x.png");
    const requiredStat = await stat(requiredRepresentation);
    if (!requiredStat.isFile() || requiredStat.size === 0) {
      throw new Error("MAS 应用图标缺少 512pt @2x 表示层。\n");
    }
    const dimensions = (await run("/usr/bin/sips", [
      "-g", "pixelWidth", "-g", "pixelHeight", requiredRepresentation
    ])).stdout;
    if (!dimensions.includes("pixelWidth: 1024") || !dimensions.includes("pixelHeight: 1024")) {
      throw new Error("MAS 应用图标的 512pt @2x 表示层不是 1024×1024。\n");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return iconName;
}

function requireTrue(value, message) {
  if (value !== true) throw new Error(message);
}

export async function verifyMasPackage({
  appPath,
  packagePath,
  expectedVersion,
  expectedBuildVersion = "1",
  expectedTeamId,
  applicationIdentity,
  installerIdentity
}) {
  if (!/^[A-Z0-9]{10}$/u.test(expectedTeamId ?? "") ||
      !applicationIdentity?.endsWith?.(`(${expectedTeamId})`) ||
      !installerIdentity?.endsWith?.(`(${expectedTeamId})`)) {
    throw new Error("MAS 验证需要与描述文件一致的精确团队和签名身份。\n");
  }
  const appIdPrefix = `${expectedTeamId}.${APP_ID}`;
  const resolvedApp = resolve(appPath);
  const resolvedPackage = resolve(packagePath);
  if (!(await stat(resolvedApp)).isDirectory()) throw new Error("MAS .app 候选不存在。\n");
  if (!(await stat(resolvedPackage)).isFile()) throw new Error("MAS .pkg 候选不存在。\n");

  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", resolvedApp]);
  const signature = await run("/usr/bin/codesign", ["-d", "--verbose=4", resolvedApp]);
  const signatureDetails = `${signature.stdout}\n${signature.stderr}`;
  if (!signatureDetails.includes(`Authority=${applicationIdentity}`) ||
      !signatureDetails.includes(`TeamIdentifier=${expectedTeamId}`)) {
    throw new Error("MAS 应用未由预期 Apple Distribution 身份签名。\n");
  }

  const info = await parsePlist(join(resolvedApp, "Contents", "Info.plist"));
  if (info.CFBundleIdentifier !== APP_ID || info.ElectronTeamID !== expectedTeamId) {
    throw new Error("MAS 应用标识或 ElectronTeamID 不匹配。\n");
  }
  if (expectedVersion && info.CFBundleShortVersionString !== expectedVersion) {
    throw new Error("MAS 应用版本与项目版本不匹配。\n");
  }
  if (info.CFBundleVersion !== expectedBuildVersion) {
    throw new Error("MAS 应用构建号与本次发布决策不匹配。\n");
  }
  const appIcon = await verifyRequiredMacAppIcon(resolvedApp, info);
  const executable = join(resolvedApp, "Contents", "MacOS", info.CFBundleExecutable);
  const architecture = (await run("/usr/bin/lipo", ["-archs", executable])).stdout.trim();
  if (architecture !== "arm64") {
    throw new Error("MAS 应用主程序不是纯 arm64 构建。\n");
  }

  const entitlements = await readSignedEntitlements(resolvedApp);
  requireTrue(entitlements["com.apple.security.app-sandbox"], "MAS 应用缺少 App Sandbox 权限。\n");
  requireTrue(entitlements["com.apple.security.network.client"], "MAS 应用缺少出站网络权限。\n");
  requireTrue(entitlements["com.apple.security.files.user-selected.read-write"], "MAS 应用缺少用户所选文件读写权限。\n");
  requireTrue(entitlements["com.apple.security.files.bookmarks.app-scope"], "MAS 应用缺少应用级安全书签权限。\n");
  if (entitlements["com.apple.application-identifier"] !== appIdPrefix ||
      entitlements["com.apple.developer.team-identifier"] !== expectedTeamId) {
    throw new Error("MAS 应用签名权限中的团队或应用标识不匹配。\n");
  }

  const packageSignature = await run("/usr/sbin/pkgutil", ["--check-signature", resolvedPackage]);
  const packageDetails = `${packageSignature.stdout}\n${packageSignature.stderr}`;
  if (!packageDetails.includes(installerIdentity)) {
    throw new Error("MAS 安装包未由预期 3rd Party Mac Developer Installer 身份签名。\n");
  }

  return {
    status: "verified",
    appId: APP_ID,
    teamId: expectedTeamId,
    version: info.CFBundleShortVersionString,
    buildVersion: info.CFBundleVersion,
    architecture,
    applicationIdentity,
    installerIdentity,
    appIcon,
    appIcon512PtAt2x: true,
    package: basename(resolvedPackage),
    packageSha256: await sha256(resolvedPackage),
    sandbox: true,
    securityScopedBookmarkEntitlement: true
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [appPath, packagePath, expectedVersion] = process.argv.slice(2);
  if (!appPath || !packagePath) {
    console.error("Usage: node scripts/verify-mas-package.mjs <app-path> <pkg-path> [version]");
    process.exitCode = 1;
  } else {
    verifyMasPackage({
      appPath,
      packagePath,
      expectedVersion,
      expectedTeamId: process.env.INKHUB_APPLE_TEAM_ID?.trim(),
      applicationIdentity: process.env.INKHUB_APPLE_SIGNING_IDENTITY
        ? `Apple Distribution: ${process.env.INKHUB_APPLE_SIGNING_IDENTITY.trim()}`
        : "",
      installerIdentity: process.env.INKHUB_APPLE_SIGNING_IDENTITY
        ? `3rd Party Mac Developer Installer: ${process.env.INKHUB_APPLE_SIGNING_IDENTITY.trim()}`
        : ""
    })
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
