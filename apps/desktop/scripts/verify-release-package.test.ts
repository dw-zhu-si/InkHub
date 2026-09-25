import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyReleasePackage } from "./verify-release-package.mjs";

const fixtureRoots: string[] = [];
const expectedTeamId = "ABCDE12345";
const expectedSigningIdentity = `Developer ID Application: Example Publisher (${expectedTeamId})`;
const signature = [
  `Authority=${expectedSigningIdentity}`,
  `TeamIdentifier=${expectedTeamId}`,
  "CodeDirectory v=20500 flags=0x10000(runtime)",
  "Runtime Version=26.0.0"
].join("\n");
const jitEntitlement = "<plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>";
const licenseResourceNames = ["LICENSE", "THIRD_PARTY_NOTICES.md", "THIRD_PARTY_LICENSES.txt", "LICENSE.electron.txt", "LICENSES.chromium.html"];

type FixtureOptions = {
  architecture?: "arm64" | "x64";
  reportedArchitecture?: string;
  dmgContent?: string;
  dmgVersion?: string;
  dmgExecutableMode?: number;
  dmgLinkTarget?: string;
  signature?: string;
  entitlements?: string;
  failDetach?: boolean;
  failAttach?: boolean;
  invalidMountInfo?: boolean;
  failDmgGatekeeper?: boolean;
  licenseProblem?: { bundle: "zip" | "dmg"; name: string; state: "missing" | "empty" | "symlink" };
  linkedResourceDirectory?: "zip" | "dmg";
};

async function createFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "inkhub-verifier-test-"));
  fixtureRoots.push(root);
  const releaseDirectory = join(root, "custom-release");
  const temporaryDirectory = join(root, "scratch");
  await mkdir(releaseDirectory);
  await mkdir(temporaryDirectory);
  const architecture = options.architecture ?? "arm64";
  const artifactBase = `InkHub-0.0.0-mac-${architecture}`;
  await writeFile(join(releaseDirectory, `${artifactBase}.dmg`), "fixture disk image");
  await writeFile(join(releaseDirectory, `${artifactBase}.zip`), "fixture zip archive");

  let mountPoint = "";
  let mounted = false;
  async function makeApp(directory: string, content: string, bundle: "zip" | "dmg") {
    const app = join(directory, "墨枢.app");
    await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
    await mkdir(join(app, "Contents", "Resources"));
    await writeFile(join(app, "Contents", "Info.plist"), "fixture plist");
    await writeFile(join(app, "Contents", "MacOS", "墨枢"), "fixture executable");
    await chmod(join(app, "Contents", "MacOS", "墨枢"), 0o755);
    await writeFile(join(app, "Contents", "Resources", "app.asar"), content);
    for (const name of licenseResourceNames) {
      await writeFile(join(app, "Contents", "Resources", name), `Synthetic test-only license resource: ${name}.`);
    }
    if (options.licenseProblem?.bundle === bundle) {
      const licensePath = join(app, "Contents", "Resources", options.licenseProblem.name);
      if (options.licenseProblem.state === "empty") await writeFile(licensePath, "");
      else {
        await rm(licensePath);
        if (options.licenseProblem.state === "symlink") await symlink("app.asar", licensePath);
      }
    }
    if (options.linkedResourceDirectory === bundle) {
      const linkedDirectory = join(directory, "outside-app-resources");
      await mkdir(linkedDirectory);
      for (const name of licenseResourceNames) await writeFile(join(linkedDirectory, name), "Synthetic linked license resource.");
      await rm(join(app, "Contents", "Resources"), { recursive: true });
      await symlink("../../outside-app-resources", join(app, "Contents", "Resources"));
    }
    await symlink("Resources/app.asar", join(app, "Contents", "resource-link"));
  }

  const run = vi.fn(async (command: string, args: string[], invocation?: { input?: string }) => {
    if (command === "ditto") {
      await makeApp(args.at(-1)!, "same application content", "zip");
      return "";
    }
    if (command === "hdiutil") {
      if (args[0] === "verify") return "verified";
      if (args[0] === "attach") {
        mountPoint = args[args.indexOf("-mountpoint") + 1]!;
        mounted = true;
        await makeApp(mountPoint, options.dmgContent ?? "same application content", "dmg");
        if (options.dmgExecutableMode !== undefined) await chmod(join(mountPoint, "墨枢.app", "Contents", "MacOS", "墨枢"), options.dmgExecutableMode);
        if (options.dmgLinkTarget !== undefined) {
          const link = join(mountPoint, "墨枢.app", "Contents", "resource-link");
          await rm(link);
          await symlink(options.dmgLinkTarget, link);
        }
        if (options.failAttach) throw new Error("fixture partial attach failure");
        if (options.invalidMountInfo) return "invalid fixture plist";
        return JSON.stringify({ "system-entities": [{ "mount-point": mountPoint, "dev-entry": "/dev/fixture-disk" }] });
      }
      if (args[0] === "detach") {
        if (options.failDetach) throw new Error("fixture disk busy");
        mounted = false;
        return "detached";
      }
    }
    if (command === "plutil") return invocation?.input ?? "";
    if (command === "/usr/libexec/PlistBuddy") {
      if (args[1] === "Print :CFBundleIdentifier") return "com.zhusi.inkhub";
      if (args[1] === "Print :CFBundleShortVersionString") {
        return args.at(-1)!.startsWith(mountPoint) && mountPoint ? options.dmgVersion ?? "0.0.0" : "0.0.0";
      }
      if (args[1] === "Print :CFBundleExecutable") return "墨枢";
    }
    if (command === "lipo") return options.reportedArchitecture ?? (architecture === "x64" ? "x86_64" : "arm64");
    if (command === "codesign") {
      if (args.includes("--entitlements")) return options.entitlements ?? jitEntitlement;
      if (args.includes("-d")) return options.signature ?? signature;
      return "valid on disk";
    }
    if (command === "xcrun") return "The validate action worked!";
    if (command === "spctl") {
      if (options.failDmgGatekeeper && args.at(-1)!.endsWith(".dmg")) return "source=Unnotarized Developer ID";
      return "accepted\nsource=Notarized Developer ID";
    }
    throw new Error(`Unexpected fixture command: ${command}`);
  });

  return {
    root,
    releaseDirectory,
    temporaryDirectory,
    architecture,
    artifactBase,
    expectedSigningIdentity,
    expectedTeamId,
    run,
    isMounted: () => mounted
  };
}

afterEach(async () => {
  // These are ordinary fixture directories; no test invokes a native mount command.
  for (const root of fixtureRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("release package verification", () => {
  it("verifies both packaged applications and the DMG with redacted, non-runtime evidence", async () => {
    const fixture = await createFixture();
    const report = await verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture);

    expect(report).toMatchObject({
      status: "verified",
      architecture: "arm64",
      bundleIdentifier: "com.zhusi.inkhub",
      runtimeAcceptance: "not-run",
      licenseResourcesVerified: true,
      applications: {
        zip: { signature: "Developer ID", notarization: "validated", gatekeeper: "accepted", architecture: "arm64", licenseResourcesVerified: true },
        dmg: { signature: "Developer ID", notarization: "validated", gatekeeper: "accepted", architecture: "arm64", licenseResourcesVerified: true }
      },
      applicationContentMatch: true
    });
    expect(report.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual([
      `${fixture.artifactBase}.dmg`, `${fixture.artifactBase}.zip`
    ]);
    expect(report.artifacts[0].sha256).toBe(createHash("sha256").update("fixture disk image").digest("hex"));
    expect(JSON.stringify(report)).not.toContain(fixture.root);
    expect(fixture.isMounted()).toBe(false);
    expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
    const attachCall = fixture.run.mock.calls.find(([command, args]) => command === "hdiutil" && args[0] === "attach");
    expect(attachCall?.[1]).toEqual(expect.arrayContaining(["-readonly", "-nobrowse", "-noautoopen"]));
  });

  it("maps the x64 release target to the Mach-O x86_64 architecture", async () => {
    const fixture = await createFixture({ architecture: "x64" });
    const report = await verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture);
    expect(report.applications.zip.architecture).toBe("x86_64");
    expect(report.applications.dmg.architecture).toBe("x86_64");
  });

  for (const bundle of ["zip", "dmg"] as const) {
    for (const name of licenseResourceNames) {
      for (const state of ["missing", "empty", "symlink"] as const) {
        it(`rejects ${bundle} application when ${name} is ${state}`, async () => {
          const fixture = await createFixture({ licenseProblem: { bundle, name, state } });
          await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(
            new RegExp(`${bundle}.*license resource`, "iu")
          );
          expect(fixture.isMounted()).toBe(false);
          expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
        });
      }
    }
    it(`rejects ${bundle} license resources reached through a linked Resources directory`, async () => {
      const fixture = await createFixture({ linkedResourceDirectory: bundle });
      await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(
        new RegExp(`${bundle}.*license resource`, "iu")
      );
      expect(fixture.isMounted()).toBe(false);
      expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
    });
  }

  it("rejects a mislabeled executable architecture", async () => {
    const fixture = await createFixture({ reportedArchitecture: "x86_64" });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/architecture/iu);
    expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
  });

  it("rejects different app content between ZIP and DMG and unmounts on failure", async () => {
    const fixture = await createFixture({ dmgContent: "stale application content" });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/contents differ/iu);
    expect(fixture.isMounted()).toBe(false);
    expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
  });

  it("checks the identity inside the mounted DMG rather than relying on the ZIP", async () => {
    const fixture = await createFixture({ dmgVersion: "0.0.1" });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/DMG.*identity/iu);
    expect(fixture.isMounted()).toBe(false);
  });

  it("compares executable permissions as well as the application's file bytes", async () => {
    const fixture = await createFixture({ dmgExecutableMode: 0o644 });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/contents differ/iu);
    expect(fixture.isMounted()).toBe(false);
  });

  it("compares symlink targets without following them while fingerprinting", async () => {
    const fixture = await createFixture({ dmgLinkTarget: "Info.plist" });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/contents differ/iu);
    expect(fixture.isMounted()).toBe(false);
  });

  it("rejects a bundle symlink pointing outside the application", async () => {
    const fixture = await createFixture({ dmgLinkTarget: "../../outside-fixture" });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/outside its bundle/iu);
    expect(fixture.isMounted()).toBe(false);
  });

  it("requires a true JIT entitlement, not just the presence of its name", async () => {
    const fixture = await createFixture({ entitlements: jitEntitlement.replace("<true/>", "<false/>") });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/JIT/iu);
  });

  it("requires the hardened runtime flag, not only the runtime version text", async () => {
    const fixture = await createFixture({ signature: signature.replace("0x10000(runtime)", "0x0(none)") });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/hardened/iu);
  });

  it("requires notarized Gatekeeper approval for the DMG itself", async () => {
    const fixture = await createFixture({ failDmgGatekeeper: true });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/DMG.*Gatekeeper/iu);
  });

  it("unmounts even when attachment reports failure after creating a mount", async () => {
    const fixture = await createFixture({ failAttach: true });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/attach/iu);
    expect(fixture.isMounted()).toBe(false);
    expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
  });

  it("retains its entire scratch directory when detach fails instead of deleting a mounted volume", async () => {
    const fixture = await createFixture({ failDetach: true });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/cleanup.*retained/iu);
    expect(fixture.isMounted()).toBe(true);
    const [retained] = await readdir(fixture.temporaryDirectory);
    expect(retained).toMatch(/^inkhub-release-verify-/u);
    expect(await readFile(join(fixture.temporaryDirectory, retained!, "dmg", "墨枢.app", "Contents", "Resources", "app.asar"), "utf8")).toBe("same application content");
  });

  it("still refuses recursive cleanup when both mount metadata and detachment fail", async () => {
    const fixture = await createFixture({ failDetach: true, invalidMountInfo: true });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow(/cleanup.*retained/iu);
    expect(await readdir(fixture.temporaryDirectory)).toHaveLength(1);
  });

  it("detaches and cleans its scratch if attachment returns invalid metadata", async () => {
    const fixture = await createFixture({ invalidMountInfo: true });
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow();
    expect(fixture.isMounted()).toBe(false);
    expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
  });

  it("rejects unsupported architecture before running native commands", async () => {
    const fixture = await createFixture();
    await expect(verifyReleasePackage({ ...fixture, architecture: "universal", version: "0.0.0" }, fixture)).rejects.toThrow(/Usage/u);
    expect(fixture.run).not.toHaveBeenCalled();
  });

  it("rejects missing artifacts without leaving a scratch directory", async () => {
    const fixture = await createFixture();
    await rm(join(fixture.releaseDirectory, `${fixture.artifactBase}.dmg`));
    await expect(verifyReleasePackage({ ...fixture, version: "0.0.0" }, fixture)).rejects.toThrow();
    expect(await readdir(fixture.temporaryDirectory)).toEqual([]);
    expect(basename(fixture.releaseDirectory)).toBe("custom-release");
  });
});
