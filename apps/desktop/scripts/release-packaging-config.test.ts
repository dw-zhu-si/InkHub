import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const desktopRoot = new URL("../", import.meta.url);
const workspaceRoot = new URL("../../../", import.meta.url);
const require = createRequire(import.meta.url);
const electronBuilderRequire = createRequire(
  require.resolve("electron-builder/package.json")
);
const yaml = electronBuilderRequire("js-yaml") as {
  load: (source: string) => Record<string, unknown>;
};
const { validateConfiguration } = electronBuilderRequire(
  "app-builder-lib/out/util/config/config"
) as {
  validateConfiguration: (
    config: Record<string, unknown>,
    debugLogger: { isEnabled: boolean; add: () => void }
  ) => Promise<void>;
};

describe("release packaging configuration", () => {
  it("keeps test signing separate and requires Developer ID, hardened runtime and notarization for release", async () => {
    const [testConfig, releaseConfig] = await Promise.all([
      readFile(new URL("electron-builder.yml", desktopRoot), "utf8"),
      readFile(new URL("electron-builder.release.yml", desktopRoot), "utf8")
    ]);

    expect(testConfig).toMatch(/identity:\s*"-"/u);
    expect(testConfig).toMatch(/notarize:\s*false/u);
    expect(releaseConfig).toMatch(/forceCodeSigning:\s*true/u);
    expect(releaseConfig).toContain('identity: "${env.INKHUB_APPLE_SIGNING_IDENTITY}"');
    expect(releaseConfig).not.toMatch(/identity:\s*["']?Developer ID Application:/u);
    expect(releaseConfig).toMatch(/hardenedRuntime:\s*true/u);
    expect(releaseConfig).toContain('    - "\\\\.(?:bin|dat|nib|pak)$"');
    expect(releaseConfig).toMatch(/notarize:\s*true/u);
    expect(releaseConfig).toMatch(/dmg:\s*\n\s+sign:\s*true/u);
    expect(releaseConfig).toMatch(/writeUpdateInfo:\s*false/u);
    expect(releaseConfig).not.toMatch(/APPLE_(?:ID|APP_SPECIFIC_PASSWORD)|BEGIN PRIVATE KEY|ghp_/u);
    for (const resource of ["THIRD_PARTY_LICENSES.txt", "LICENSE.electron.txt", "LICENSES.chromium.html"]) {
      expect(testConfig).toContain(`to: ${resource}`);
    }
    const releaseRunner = await readFile(new URL("tools/run-release-package.mjs", workspaceRoot), "utf8");
    expect(releaseRunner).toContain('mkdtemp(join(tmpdir(), "inkhub-release-work-"))');
    expect(releaseRunner).not.toContain('mkdtemp(join(releaseDirectory, ".release-work-"))');
  });

  it("detects File Provider and signing detritus without treating ordinary metadata as forbidden", async () => {
    const hookPath = fileURLToPath(new URL("scripts/electron-builder-after-pack.cjs", desktopRoot));
    const { findSigningDetritus } = require(hookPath) as {
      findSigningDetritus: (report: string) => Array<{ path: string; attribute: string }>;
    };
    const hookSource = await readFile(new URL("scripts/electron-builder-after-pack.cjs", desktopRoot), "utf8");
    expect(hookSource).toContain("setTimeout(resolve, 1_000)");
    expect(findSigningDetritus([
      "/tmp/App.app: com.apple.provenance:",
      "/tmp/App.app/Framework: com.apple.fileprovider.fpfs#P:",
      "/tmp/App.app/icon: com.apple.FinderInfo:",
      "/tmp/App.app/readme: com.apple.TextEncoding:"
    ].join("\n"))).toEqual([
      { path: "/tmp/App.app", attribute: "com.apple.provenance" },
      { path: "/tmp/App.app/Framework", attribute: "com.apple.fileprovider.fpfs#P" },
      { path: "/tmp/App.app/icon", attribute: "com.apple.FinderInfo" }
    ]);
  });

  it("declares the Electron JIT entitlement without weakening library validation", async () => {
    const [appEntitlements, inheritedEntitlements] = await Promise.all([
      readFile(new URL("build/entitlements.mac.plist", desktopRoot), "utf8"),
      readFile(new URL("build/entitlements.mac.inherit.plist", desktopRoot), "utf8")
    ]);

    for (const content of [appEntitlements, inheritedEntitlements]) {
      expect(content).toContain("com.apple.security.cs.allow-jit");
      expect(content).not.toContain("disable-library-validation");
      expect(content).not.toContain("get-task-allow");
    }
  });

  it("keeps the Mac App Store build sandboxed and separate from Developer ID distribution", async () => {
    const [configSource, appEntitlements, inheritedEntitlements, runner, verifier, packageSource] =
      await Promise.all([
        readFile(new URL("electron-builder.mas.yml", desktopRoot), "utf8"),
        readFile(new URL("build/entitlements.mas.plist", desktopRoot), "utf8"),
        readFile(new URL("build/entitlements.mas.inherit.plist", desktopRoot), "utf8"),
        readFile(new URL("scripts/run-mas-package.mjs", desktopRoot), "utf8"),
        readFile(new URL("scripts/verify-mas-package.mjs", desktopRoot), "utf8"),
        readFile(new URL("package.json", desktopRoot), "utf8")
      ]);

    const config = yaml.load(configSource);
    await expect(validateConfiguration(config, {
      isEnabled: false,
      add() {}
    })).resolves.toBeUndefined();
    expect(configSource).toMatch(/target:\s*\n\s+- mas/u);
    expect(configSource).toContain('identity: "${env.INKHUB_APPLE_SIGNING_IDENTITY}"');
    expect(configSource).toContain("type: distribution");
    expect(configSource).toContain('bundleVersion: "1"');
    expect(configSource).toContain('ElectronTeamID: "${env.INKHUB_APPLE_TEAM_ID}"');
    expect(configSource).toContain("entitlements: build/entitlements.mas.plist");
    expect(configSource).toContain("entitlementsInherit: build/entitlements.mas.inherit.plist");
    expect(configSource).toContain("icon: build/icon.icns");
    expect(configSource).toMatch(/notarize:\s*false/u);
    expect(configSource).toContain('    - "\\\\.(?:bin|dat|nib|pak)$"');
    expect(configSource).not.toContain("Developer ID Application");
    expect(configSource).not.toContain("provisioningProfile:");

    expect(appEntitlements).toContain("com.apple.security.app-sandbox");
    expect(appEntitlements).not.toContain("com.apple.security.application-groups");
    expect(appEntitlements).toContain("com.apple.security.network.client");
    expect(appEntitlements).toContain("com.apple.security.files.user-selected.read-write");
    expect(appEntitlements).toContain("com.apple.security.files.bookmarks.app-scope");
    expect(appEntitlements).not.toContain("com.apple.security.network.server");
    expect(appEntitlements).not.toContain("get-task-allow");
    expect(inheritedEntitlements).toContain("com.apple.security.app-sandbox");
    expect(inheritedEntitlements).toContain("com.apple.security.inherit");

    expect(runner).toContain("INKHUB_MAS_PROVISIONING_PROFILE");
    expect(runner).toContain('selectAppleSigningIdentity');
    expect(runner).toContain('INKHUB_APPLE_SIGNING_IDENTITY');
    expect(configSource).not.toMatch(/ElectronTeamID:\s*[A-Z0-9]{10}/u);
    expect(configSource).not.toMatch(/identity:\s*"(?!\$\{env\.)/u);
    expect(runner).toContain('"--mac", "mas", "--arm64"');
    expect(verifier).toContain('"--verify", "--deep", "--strict"');
    expect(verifier).toContain('"--check-signature"');
    expect(verifier).toContain('"/usr/bin/lipo", ["-archs", executable]');
    expect(verifier).toContain("icon_512x512@2x.png");
    expect(verifier).toContain("pixelWidth: 1024");
    expect(JSON.parse(packageSource).scripts).toMatchObject({
      "pack:mas:arm64": "node scripts/run-mas-package.mjs"
    });
  });

  it("supports native Windows ARM64 and x64 test packages", async () => {
    const [runner, verifier, rootPackage] = await Promise.all([
      readFile(new URL("tools/run-test-package.mjs", workspaceRoot), "utf8"),
      readFile(new URL("scripts/verify-test-package.mjs", desktopRoot), "utf8"),
      readFile(new URL("package.json", workspaceRoot), "utf8")
    ]);

    expect(runner).toContain('platform === "win" && arch === "arm64"');
    expect(runner).toContain('platform === "win" && arch === "all"');
    expect(verifier).toContain('targetArch === "arm64"');
    expect(JSON.parse(rootPackage).scripts).toMatchObject({
      "pack:test:win:arm64": "node tools/run-test-package.mjs win arm64",
      "pack:test:win:all": "node tools/run-test-package.mjs win all"
    });
  });
});
