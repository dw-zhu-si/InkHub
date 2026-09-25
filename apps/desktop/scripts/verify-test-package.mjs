import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const releaseDir = join(appDir, "release");
const [targetPlatform, targetArch] = process.argv.slice(2);

if (
  !(
    (targetPlatform === "mac" && (targetArch === "arm64" || targetArch === "x64")) ||
    (targetPlatform === "win" && (targetArch === "arm64" || targetArch === "x64"))
  )
) {
  console.error("Usage: node scripts/verify-test-package.mjs <mac arm64|mac x64|win arm64|win x64>");
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"));
const artifactBase = `InkHub-${packageJson.version}-${targetPlatform}-${targetArch}-test`;
const artifact = join(releaseDir, `${artifactBase}.${targetPlatform === "mac" ? "dmg" : "exe"}`);
const artifactStat = await stat(artifact);
if (!artifactStat.isFile() || artifactStat.size === 0) {
  throw new Error(`Test package is missing or empty: ${artifact}`);
}

let extractedMacRoot;
try {
  let macAppBundle;
  if (targetPlatform === "mac") {
    const verification = spawnSync("hdiutil", ["verify", artifact], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    if (verification.status !== 0) {
      throw new Error(`DMG verification failed:\n${verification.stderr || verification.stdout}`);
    }

    const zipArtifact = join(releaseDir, `${artifactBase}.zip`);
    const zipStat = await stat(zipArtifact);
    if (!zipStat.isFile() || zipStat.size === 0) {
      throw new Error(`ZIP package is missing or empty: ${zipArtifact}`);
    }
    extractedMacRoot = await mkdtemp(join(tmpdir(), "inkhub-package-verify-"));
    const extraction = spawnSync("ditto", ["-x", "-k", zipArtifact, extractedMacRoot], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    if (extraction.status !== 0) {
      throw new Error(`ZIP extraction failed:\n${extraction.stderr || extraction.stdout}`);
    }
    macAppBundle = join(extractedMacRoot, "墨枢.app");
    await stat(macAppBundle);
    const infoPlist = join(macAppBundle, "Contents", "Info.plist");
    const identifier = spawnSync(
      "/usr/libexec/PlistBuddy",
      ["-c", "Print :CFBundleIdentifier", infoPlist],
      { encoding: "utf8" }
    );
    const bundleName = spawnSync(
      "/usr/libexec/PlistBuddy",
      ["-c", "Print :CFBundleName", infoPlist],
      { encoding: "utf8" }
    );
    if (identifier.status !== 0 || identifier.stdout.trim() !== "com.zhusi.inkhub") {
      throw new Error(`Unexpected macOS bundle identifier: ${identifier.stdout || identifier.stderr}`);
    }
    if (bundleName.status !== 0 || bundleName.stdout.trim() !== "墨枢") {
      throw new Error(`Unexpected macOS bundle name: ${bundleName.stdout || bundleName.stderr}`);
    }
    const iconStat = await stat(join(macAppBundle, "Contents", "Resources", "icon.icns"));
    if (!iconStat.isFile() || iconStat.size === 0) {
      throw new Error("Packaged macOS icon is missing or empty.");
    }

    const signatureVerification = spawnSync(
      "codesign",
      ["--verify", "--deep", "--strict", "--verbose=4", macAppBundle],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    if (signatureVerification.status !== 0) {
      throw new Error(
        `Ad-hoc signature verification failed:\n${signatureVerification.stderr || signatureVerification.stdout}`
      );
    }

    const signatureDetails = spawnSync("codesign", ["-d", "--verbose=4", macAppBundle], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    const signatureOutput = `${signatureDetails.stdout || ""}\n${signatureDetails.stderr || ""}`;
    if (signatureDetails.status !== 0 || !signatureOutput.includes("Signature=adhoc")) {
      throw new Error(`Expected an ad-hoc signed app bundle:\n${signatureOutput}`);
    }
  } else {
    // NSIS uses a 32-bit bootstrap executable for installers of every target
    // architecture.  The bootstrap's machine type therefore cannot prove the
    // architecture of the packaged Electron application.  Verify the NSIS
    // container and the application executable emitted for the requested
    // architecture separately.
    const fileProbe = spawnSync("file", [artifact], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    if (
      fileProbe.status !== 0 ||
      !/PE32 executable/iu.test(fileProbe.stdout) ||
      !/Nullsoft Installer/iu.test(fileProbe.stdout)
    ) {
      throw new Error(`Unexpected Windows NSIS installer format:\n${fileProbe.stderr || fileProbe.stdout}`);
    }

    const packagedExecutable = join(
      releaseDir,
      targetArch === "arm64" ? "win-arm64-unpacked" : "win-unpacked",
      "墨枢.exe"
    );
    await stat(packagedExecutable);
    const executableProbe = spawnSync("file", [packagedExecutable], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const expectedArchitecture = targetArch === "arm64" ? /Aarch64|ARM64/iu : /x86[-_ ]?64/iu;
    if (
      executableProbe.status !== 0 ||
      !/PE32\+/u.test(executableProbe.stdout) ||
      !expectedArchitecture.test(executableProbe.stdout)
    ) {
      throw new Error(
        `Unexpected packaged Windows application architecture for ${targetArch}:\n${
          executableProbe.stderr || executableProbe.stdout
        }`
      );
    }
  }

  const hostCanRunTarget =
    (targetPlatform === "mac" && process.platform === "darwin") ||
    (targetPlatform === "win" && process.platform === "win32");

  if (!hostCanRunTarget) {
    console.log(
      `PACKAGE_SMOKE_SKIPPED target=${targetPlatform}-${targetArch} host=${process.platform}-${process.arch} artifact=${artifact}`
    );
  } else {
    const executable =
      targetPlatform === "mac"
        ? join(macAppBundle, "Contents", "MacOS", "墨枢")
        : join(releaseDir, targetArch === "arm64" ? "win-arm64-unpacked" : "win-unpacked", "墨枢.exe");
    await stat(executable);

    const smokeUserData = await mkdtemp(join(tmpdir(), "inkhub-packaged-smoke-"));
    let output = "";
    try {
      const result = await new Promise((resolveResult) => {
        let timedOut = false;
        const child = spawn(executable, [`--user-data-dir=${smokeUserData}`], {
          cwd: appDir,
          env: {
            ...process.env,
            DEEPWRITE_SMOKE: "1",
            ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
          },
          stdio: ["ignore", "pipe", "pipe"]
        });
        child.stdout.on("data", (chunk) => {
          output += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          output += chunk.toString();
        });
        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, 120_000);
        child.once("error", (error) => {
          clearTimeout(timeout);
          resolveResult({ code: null, signal: null, timedOut, error });
        });
        child.once("close", (code, signal) => {
          clearTimeout(timeout);
          resolveResult({ code, signal, timedOut });
        });
      });

      if (result.error) throw result.error;
      const marker = output
        .split(/\r?\n/)
        .find((line) => line.startsWith("DEEPWRITE_SMOKE_OK "));
      const shutdownMarker = output
        .split(/\r?\n/)
        .some((line) => line === "DEEPWRITE_SMOKE_SHUTDOWN_OK");
      const expectedMacOs26Workaround =
        process.platform === "darwin" &&
        release().split(".")[0] === "25" &&
        result.timedOut === false &&
        result.signal === "SIGKILL" &&
        shutdownMarker;
      if ((result.code !== 0 && !expectedMacOs26Workaround) || !marker) {
        throw new Error(
          `Packaged app smoke failed with exit code ${String(result.code)}, signal ${String(result.signal)}, timedOut ${String(result.timedOut)}:\n${output}`
        );
      }

      const summary = JSON.parse(marker.slice("DEEPWRITE_SMOKE_OK ".length));
      if (
        summary.health?.status !== "ok" ||
        summary.health?.workers?.length !== 3 ||
        summary.agent?.status !== "ok" ||
        summary.agent?.runtime?.mode !== "local-faux" ||
        summary.agent?.completed !== true
      ) {
        throw new Error(`Packaged app returned an invalid smoke summary: ${JSON.stringify(summary)}`);
      }

      console.log(
        `PACKAGE_TEST_OK target=${targetPlatform}-${targetArch} bytes=${artifactStat.size} artifact=${artifact}`
      );
    } finally {
      await rm(smokeUserData, { recursive: true, force: true });
    }
  }
} finally {
  if (extractedMacRoot) {
    await rm(extractedMacRoot, { recursive: true, force: true });
  }
}
