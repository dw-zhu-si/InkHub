import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedArchitectures = new Set(["arm64", "x64"]);
const expectedIdentifier = "com.zhusi.inkhub";
const usage = "Usage: node scripts/verify-release-package.mjs <arm64|x64> [release-directory]";
const requiredLicenseResources = [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "THIRD_PARTY_LICENSES.txt",
  "LICENSE.electron.txt",
  "LICENSES.chromium.html"
];

function executeCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: options.input,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 60_000
  });
  if (result.error || result.status !== 0) {
    // Do not echo arbitrary command output, local paths, or signing details into a release report.
    throw new Error(`${command} failed (exit ${result.status ?? "unavailable"}).`);
  }
  return (options.stdoutOnly ? result.stdout || "" : `${result.stdout || ""}\n${result.stderr || ""}`).trim();
}

async function sha256(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

function isWithin(root, path) {
  const difference = relative(root, path);
  return difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference);
}

async function fingerprintApplication(appBundle) {
  const records = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory)).sort()) {
      const path = join(directory, entry);
      const entryStat = await lstat(path);
      const name = relative(appBundle, path).split(sep).join("/");
      if (entryStat.isSymbolicLink()) {
        const target = await readlink(path);
        if (!isWithin(appBundle, resolve(dirname(path), target))) {
          throw new Error("Packaged application contains a symbolic link outside its bundle.");
        }
        records.push({ name, type: "symlink", target });
      } else if (entryStat.isDirectory()) {
        records.push({ name, type: "directory" });
        await visit(path);
      } else if (entryStat.isFile()) {
        records.push({ name, type: "file", bytes: entryStat.size, executable: entryStat.mode & 0o111, sha256: await sha256(path) });
      } else {
        throw new Error("Packaged application contains an unsupported filesystem entry.");
      }
    }
  }
  await visit(appBundle);
  return { entries: records.length, sha256: createHash("sha256").update(JSON.stringify(records)).digest("hex") };
}

function hasTrueEntitlement(entitlements, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`<key>\\s*${escapedName}\\s*</key>\\s*<true\\s*/>`, "u").test(entitlements);
}

function checkDeveloperSignature(signature, label, expectedSigningIdentity, expectedTeamId, hardenedRuntime = false) {
  const lines = signature.split(/\r?\n/u);
  if (!lines.includes(`Authority=${expectedSigningIdentity}`) ||
      !lines.includes(`TeamIdentifier=${expectedTeamId}`)) {
    throw new Error(`${label} does not have the expected Developer ID signature.`);
  }
  if (hardenedRuntime && !/flags=0x[\da-f]+\([^)]*\bruntime\b[^)]*\)/iu.test(signature)) {
    throw new Error(`${label} does not have the hardened runtime flag.`);
  }
}

function checkGatekeeper(output, label) {
  if (!/^source=Notarized Developer ID\s*$/mu.test(output)) {
    throw new Error(`${label} Gatekeeper did not report a notarized Developer ID source.`);
  }
}

async function verifyLicenseResources(appBundle, label) {
  // Reject linked ancestors too: lstat(file) alone would still follow a linked Resources directory.
  for (const directory of [join(appBundle, "Contents"), join(appBundle, "Contents", "Resources")]) {
    const directoryStat = await lstat(directory).catch(() => null);
    if (!directoryStat?.isDirectory()) {
      throw new Error(`${label} application license resource directory must be a real directory.`);
    }
  }
  for (const name of requiredLicenseResources) {
    const resourceStat = await lstat(join(appBundle, "Contents", "Resources", name)).catch(() => null);
    if (!resourceStat?.isFile() || resourceStat.size === 0) {
      throw new Error(`${label} application license resource must be a nonempty regular file: ${name}`);
    }
  }
}

/** Native commands are injectable so offline tests never sign, mount, or launch a real application. */
export async function verifyReleasePackage(options, dependencies = {}) {
  const { architecture } = options;
  if (!allowedArchitectures.has(architecture)) throw new Error(usage);
  const expectedSigningIdentity = options.expectedSigningIdentity;
  const expectedTeamId = options.expectedTeamId;
  if (!/^Developer ID Application: .+ \([A-Z0-9]{10}\)$/u.test(expectedSigningIdentity ?? "") ||
      !/^[A-Z0-9]{10}$/u.test(expectedTeamId ?? "") ||
      !expectedSigningIdentity.endsWith(`(${expectedTeamId})`)) {
    throw new Error("Release verification requires an exact Developer ID identity and Team ID.");
  }
  const version = options.version ?? JSON.parse(await readFile(join(appDirectory, "package.json"), "utf8")).version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(version)) {
    throw new Error("Invalid release version.");
  }
  const releaseDirectory = resolve(options.releaseDirectory ?? join(appDirectory, "release"));
  const artifactBase = `InkHub-${version}-mac-${architecture}`;
  const dmgPath = join(releaseDirectory, `${artifactBase}.dmg`);
  const zipPath = join(releaseDirectory, `${artifactBase}.zip`);
  const run = dependencies.run ?? executeCommand;
  async function step(label, command, args, invocation) {
    try {
      return await run(command, args, invocation);
    } catch {
      throw new Error(`${label} failed (${command}).`);
    }
  }

  for (const artifact of [dmgPath, zipPath]) {
    const artifactStat = await lstat(artifact);
    if (!artifactStat.isFile() || artifactStat.size === 0) {
      throw new Error(`Release artifact must be a nonempty regular file: ${basename(artifact)}`);
    }
  }

  await step("DMG checksum verification", "hdiutil", ["verify", dmgPath]);
  await step("DMG signature verification", "codesign", ["--verify", "--strict", "--verbose=4", dmgPath]);
  checkDeveloperSignature(
    await step("DMG signature inspection", "codesign", ["-d", "--verbose=4", dmgPath]),
    "DMG",
    expectedSigningIdentity,
    expectedTeamId
  );
  await step("DMG notarization ticket validation", "xcrun", ["stapler", "validate", dmgPath]);
  checkGatekeeper(await step("DMG Gatekeeper assessment", "spctl", [
    "--assess", "--verbose=4", "--type", "open", "--context", "context:primary-signature", dmgPath
  ]), "DMG");

  const scratchDirectory = await realpath(await mkdtemp(join(dependencies.temporaryDirectory ?? tmpdir(), "inkhub-release-verify-")));
  const extractedRoot = join(scratchDirectory, "zip");
  const mountPoint = join(scratchDirectory, "dmg");
  let attachAttempted = false;
  let verificationError;
  let report;

  async function verifyApplication(appBundle, label) {
    const bundleStat = await lstat(appBundle);
    if (!bundleStat.isDirectory()) throw new Error(`${label} application is not a real bundle directory.`);
    await verifyLicenseResources(appBundle, label);
    const infoPlist = join(appBundle, "Contents", "Info.plist");
    const readProperty = async (key) => (await step(`${label} bundle property inspection`, "/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, infoPlist], { stdoutOnly: true })).trim();
    const identifier = await readProperty("CFBundleIdentifier");
    const bundleVersion = await readProperty("CFBundleShortVersionString");
    const executable = await readProperty("CFBundleExecutable");
    if (identifier !== expectedIdentifier || bundleVersion !== version) {
      throw new Error(`${label} application has an unexpected release identity.`);
    }
    if (!executable || basename(executable) !== executable || executable === "." || executable === "..") {
      throw new Error(`${label} application has an invalid executable name.`);
    }
    const expectedArchitecture = architecture === "x64" ? "x86_64" : "arm64";
    const executablePath = join(appBundle, "Contents", "MacOS", executable);
    if (!(await lstat(executablePath)).isFile()) throw new Error(`${label} application executable is not a regular file.`);
    const actualArchitecture = (await step(`${label} executable architecture inspection`, "lipo", ["-archs", executablePath], { stdoutOnly: true })).trim();
    if (actualArchitecture !== expectedArchitecture) {
      throw new Error(`${label} application executable architecture does not match the release target.`);
    }
    await step(`${label} application signature verification`, "codesign", ["--verify", "--deep", "--strict", "--verbose=4", appBundle]);
    checkDeveloperSignature(
      await step(`${label} application signature inspection`, "codesign", ["-d", "--verbose=4", appBundle]),
      `${label} application`,
      expectedSigningIdentity,
      expectedTeamId,
      true
    );
    const entitlements = await step(`${label} application entitlement inspection`, "codesign", ["-d", "--entitlements", ":-", appBundle]);
    if (!hasTrueEntitlement(entitlements, "com.apple.security.cs.allow-jit")) {
      throw new Error(`${label} application is missing a true Electron JIT entitlement.`);
    }
    if (hasTrueEntitlement(entitlements, "com.apple.security.get-task-allow") || hasTrueEntitlement(entitlements, "com.apple.security.cs.disable-library-validation")) {
      throw new Error(`${label} application has an unsafe development entitlement.`);
    }
    await step(`${label} application notarization ticket validation`, "xcrun", ["stapler", "validate", appBundle]);
    checkGatekeeper(await step(`${label} application Gatekeeper assessment`, "spctl", ["--assess", "--verbose=4", "--type", "exec", appBundle]), `${label} application`);
    return {
      architecture: actualArchitecture,
      signature: "Developer ID",
      hardenedRuntime: true,
      jitEntitlement: true,
      licenseResourcesVerified: true,
      notarization: "validated",
      gatekeeper: "accepted",
      content: await fingerprintApplication(appBundle)
    };
  }

  try {
    await mkdir(extractedRoot);
    await mkdir(mountPoint);
    await step("ZIP extraction", "ditto", ["-x", "-k", zipPath, extractedRoot]);
    const zip = await verifyApplication(join(extractedRoot, "墨枢.app"), "ZIP");

    // Always attempt to detach this exact, unique mount point, including partial attach failures.
    attachAttempted = true;
    const attached = await step("DMG attach", "hdiutil", ["attach", dmgPath, "-readonly", "-nobrowse", "-noautoopen", "-mountpoint", mountPoint, "-plist"], { stdoutOnly: true });
    const attachment = JSON.parse(await step("DMG mount metadata inspection", "plutil", ["-convert", "json", "-o", "-", "-"], { input: attached, stdoutOnly: true }));
    const entities = attachment["system-entities"];
    const mountedEntities = Array.isArray(entities) ? entities.filter((entry) => entry?.["mount-point"]) : [];
    if (!Array.isArray(mountedEntities) || mountedEntities.length !== 1 || mountedEntities[0]["mount-point"] !== mountPoint) {
      throw new Error("DMG did not mount exclusively at this verifier's temporary mount point.");
    }
    const dmg = await verifyApplication(join(mountPoint, "墨枢.app"), "DMG");
    if (zip.content.entries !== dmg.content.entries || zip.content.sha256 !== dmg.content.sha256) {
      throw new Error("ZIP and DMG application contents differ.");
    }
    const artifacts = [];
    for (const path of [dmgPath, zipPath]) {
      artifacts.push({ name: basename(path), bytes: (await lstat(path)).size, sha256: await sha256(path) });
    }
    report = {
      status: "verified",
      verificationScope: "package-identity-content-licenses-signature-notarization-gatekeeper",
      runtimeAcceptance: "not-run",
      version,
      platform: "mac",
      architecture,
      bundleIdentifier: expectedIdentifier,
      licenseResourcesVerified: true,
      applications: { zip, dmg },
      diskImage: { checksum: "verified", signature: "Developer ID", notarization: "validated", gatekeeper: "accepted" },
      applicationContentMatch: true,
      artifacts
    };
  } catch (error) {
    verificationError = error;
  } finally {
    if (attachAttempted) {
      try {
        await step("DMG detach", "hdiutil", ["detach", mountPoint]);
      } catch {
        // Never recursively remove a possibly mounted volume, even after another validation error.
        throw new Error(`Release verification cleanup failed; scratch retained at ${scratchDirectory}. Unmount its dmg directory before cleanup.`, { cause: verificationError });
      }
    }
    await rm(scratchDirectory, { recursive: true, force: true });
  }
  if (verificationError) throw verificationError;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [architecture, releaseDirectory, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error(usage);
    const qualifier = process.env.INKHUB_APPLE_SIGNING_IDENTITY?.trim();
    console.log(JSON.stringify(await verifyReleasePackage({
      architecture,
      releaseDirectory,
      expectedSigningIdentity: qualifier ? `Developer ID Application: ${qualifier}` : "",
      expectedTeamId: process.env.INKHUB_APPLE_TEAM_ID?.trim()
    }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Release package verification failed.");
    process.exitCode = 1;
  }
}
