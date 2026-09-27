import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseReleaseTarget, runReleaseStages } from "../../../tools/run-release-package.mjs";
import { notarizeDmg, preflightNotarization, releaseEnvironment, releaseIdentityTemplate, runReleaseCommand, sha256File, validateReleaseSigningConfig } from "../../../tools/release-notarization.mjs";
import { selectAppleSigningIdentity } from "../../../tools/apple-signing-identities.mjs";
import { masBuildEnvironment, masBuildVersion, validateMasPreflight, validateMasProfilePayload } from "./run-mas-package.mjs";

const temporary: string[] = [];
const submissionId = "00000000-0000-4000-8000-000000000001";
const teamId = "ABCDE12345";
const qualifier = `Example Publisher (${teamId})`;
const releaseIdentity = `Developer ID Application: ${qualifier}`;
afterEach(async () => {
  vi.restoreAllMocks();
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "inkhub-release-pipeline-test-"));
  temporary.push(root);
  const dmgPath = join(root, "InkHub-0.0.0-mac-arm64.dmg");
  const receiptPath = join(root, "notarization.json");
  await writeFile(dmgPath, "synthetic disk image");
  const run = vi.fn(async (_command: string, args: string[]) => {
    if (args[1] === "submit") return JSON.stringify({ id: submissionId });
    if (args[1] === "wait") return JSON.stringify({ id: submissionId, status: "Accepted" });
    if (args[1] === "log") return JSON.stringify({ jobId: submissionId, status: "Accepted", issues: null });
    if (args[1] === "staple") await writeFile(dmgPath, "synthetic disk image with ticket");
    return "";
  });
  return { dmgPath, receiptPath, run, profile: "test-profile" };
}

describe("release preflight and safe stage order", () => {
  it("fails the MAS path closed before signing when the host or profile path is invalid", async () => {
    await expect(validateMasPreflight({
      profilePath: "/tmp/not-used.provisionprofile",
      platform: "linux"
    })).rejects.toThrow("macOS");
    await expect(validateMasPreflight({
      profilePath: "relative.provisionprofile",
      platform: "darwin"
    })).rejects.toThrow("绝对路径");
  });

  it("passes only a minimal non-secret environment to MAS build subprocesses", () => {
    expect(masBuildEnvironment({
      PATH: "/bin",
      HOME: "/example/home",
      LANG: "zh_CN.UTF-8",
      GH_TOKEN: "synthetic-github-value",
      NPM_TOKEN: "synthetic-npm-value",
      MODEL_PROVIDER_API_KEY: "synthetic-model-value"
    })).toEqual({
      PATH: "/bin",
      HOME: "/example/home",
      LANG: "zh_CN.UTF-8"
    });
  });

  it("requires one positive MAS build version from the release config", () => {
    expect(masBuildVersion('buildVersion: "2"\nmas:\n  type: distribution\n')).toBe("2");
    expect(() => masBuildVersion("mas:\n  type: distribution\n")).toThrow("buildVersion");
    expect(() => masBuildVersion('buildVersion: "0"\n')).toThrow("buildVersion");
  });

  it("accepts an Apple macOS App Store distribution profile without requiring app entitlements in the profile", () => {
    const profile = {
      Platform: ["OSX"],
      TeamIdentifier: [teamId],
      ExpirationDate: "2030-01-01T00:00:00.000Z",
      Entitlements: {
        "com.apple.application-identifier": `${teamId}.com.zhusi.inkhub`,
        "com.apple.developer.team-identifier": teamId
      }
    };
    expect(validateMasProfilePayload(profile, Date.parse("2029-01-01T00:00:00.000Z")))
      .toEqual({ profile, teamId });
    expect(() => validateMasProfilePayload({ ...profile, ProvisionedDevices: ["device"] }))
      .toThrow("App Store 分发");
  });

  it("rejects the certificate-type prefix before electron-builder runs", () => {
    expect(() => validateReleaseSigningConfig(`forceCodeSigning: true\nidentity: "${releaseIdentity}"`)).toThrow("硬编码");
    expect(() => validateReleaseSigningConfig(`forceCodeSigning: false\nidentity: "${releaseIdentityTemplate}"`)).toThrow("强制签名");
    expect(() => validateReleaseSigningConfig(`forceCodeSigning: true\nidentity: "${releaseIdentityTemplate}"`)).toThrow("非 Mach-O");
    expect(() => validateReleaseSigningConfig(`forceCodeSigning: true\nidentity: "${releaseIdentityTemplate}"\n    - "\\\\.(?:bin|dat|nib|pak)$"`)).not.toThrow();
  });
  it("limits release targets to native macOS and exact architecture", () => {
    expect(parseReleaseTarget(["mac", "arm64"], "darwin")).toBe("arm64");
    expect(parseReleaseTarget(["mac", "x64"], "darwin")).toBe("x64");
    expect(() => parseReleaseTarget(["mac", "arm64"], "linux")).toThrow("macOS");
    expect(() => parseReleaseTarget(["mac", "arm64", "extra"], "darwin")).toThrow("Usage");
  });

  it("requires a named Keychain profile and refuses alternative secret overrides without echoing them", () => {
    expect(() => releaseEnvironment({})).toThrow("Keychain");
    expect(() => releaseEnvironment({ APPLE_KEYCHAIN_PROFILE: "profile\ninvalid" })).toThrow("Keychain");
    const input = {
      APPLE_KEYCHAIN_PROFILE: " test-profile ",
      INKHUB_APPLE_TEAM_ID: teamId.toLowerCase(),
      DEBUG: "*",
      PATH: "/bin",
      MODEL_PROVIDER_API_KEY: "synthetic-model-secret"
    };
    expect(releaseEnvironment(input)).toEqual({
      APPLE_KEYCHAIN_PROFILE: "test-profile",
      INKHUB_APPLE_TEAM_ID: teamId,
      PATH: "/bin"
    });
    const secret = "not-a-real-password-for-test-only";
    try { releaseEnvironment({ ...input, APPLE_APP_SPECIFIC_PASSWORD: secret }); }
    catch (error) { expect(String(error)).not.toContain(secret); }
    expect(() => releaseEnvironment({ ...input, APPLE_APP_SPECIFIC_PASSWORD: secret })).toThrow("凭证覆盖");
    expect(input.DEBUG).toBe("*");
  });

  it("validates signing identity and Keychain without returning unrelated submission history", async () => {
    const run = vi.fn().mockResolvedValueOnce(`1) TEST_HASH "${releaseIdentity}"`)
      .mockResolvedValueOnce(JSON.stringify({ history: [{ name: "unrelated-app.zip" }] }));
    const result = await preflightNotarization(run, "test-profile", teamId);
    expect(result.status).toBe("ready");
    expect(result).toMatchObject({ identity: releaseIdentity, qualifier, teamId });
    expect(JSON.stringify(result)).not.toContain("unrelated-app");
    expect(run.mock.calls[1][1]).toContain("test-profile");
  });

  it("rejects revoked identities before contacting Apple", async () => {
    const run = vi.fn().mockResolvedValue(`1) TEST_HASH "${releaseIdentity}" (CSSMERR_TP_CERT_REVOKED)`);
    await expect(preflightNotarization(run, "test-profile", teamId)).rejects.toThrow("签名身份");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed Apple preflight output", async () => {
    const run = vi.fn().mockResolvedValueOnce(`1) TEST_HASH "${releaseIdentity}"`).mockResolvedValueOnce("{}");
    await expect(preflightNotarization(run, "test-profile", teamId)).rejects.toThrow("预检");
  });

  it("selects one active Apple identity without persisting publisher metadata", () => {
    const report = [
      `1) HASH "Developer ID Application: ${qualifier}"`,
      `2) OLD "Developer ID Application: Old Publisher (${teamId})" (CSSMERR_TP_CERT_REVOKED)`
    ].join("\n");
    expect(selectAppleSigningIdentity(report, "Developer ID Application", teamId))
      .toEqual({ identity: releaseIdentity, qualifier, teamId });
  });

  it("verifies, builds, notarizes, checks artifacts and restores the runtime in that order", async () => {
    const calls: string[] = [];
    const stages = Object.fromEntries(["ensureRuntime", "verify", "build", "notarize", "verifyArtifacts"]
      .map((name) => [name, vi.fn(async () => { calls.push(name); return { status: "verified" }; })]));
    await expect(runReleaseStages(stages)).resolves.toEqual({ status: "verified" });
    expect(calls).toEqual(["ensureRuntime", "verify", "build", "notarize", "verifyArtifacts", "ensureRuntime"]);
  });

  it.each(["verify", "build", "notarize", "verifyArtifacts"])("restores the runtime when %s fails and stops subsequent stages", async (failed) => {
    const order = ["ensureRuntime", "verify", "build", "notarize", "verifyArtifacts"];
    const calls: string[] = [];
    const stages = Object.fromEntries(order.map((name) => [name, vi.fn(async () => {
      calls.push(name);
      if (name === failed) throw new Error(`failure:${failed}`);
    })]));
    await expect(runReleaseStages(stages)).rejects.toThrow(`failure:${failed}`);
    expect(calls).toEqual([...order.slice(0, order.indexOf(failed) + 1), "ensureRuntime"]);
  });

  it("keeps both packaging and runtime restoration failures", async () => {
    const first = new Error("build failure");
    const second = new Error("runtime failure");
    const stages = { ensureRuntime: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(second),
      verify: vi.fn(), build: vi.fn().mockRejectedValue(first), notarize: vi.fn(), verifyArtifacts: vi.fn() };
    await expect(runReleaseStages(stages)).rejects.toMatchObject({ errors: [first, second] });
    expect(stages.notarize).not.toHaveBeenCalled();
  });

  it("captures Unicode stdout and never returns stderr for credential errors", async () => {
    expect(await runReleaseCommand(process.execPath, ["-e", "process.stdout.write('验证通过')"], { capture: true })).toBe("验证通过");
    await expect(runReleaseCommand(process.execPath, ["-e", "process.stderr.write('synthetic-private-value');process.exit(3)"],
      { capture: true })).rejects.toThrow("exit=3");
  });
});

describe("DMG notarization receipts", () => {
  it("persists a traceable submission, requires Accepted and checks the post-stapling hash", async () => {
    const input = await fixture();
    const original = await sha256File(input.dmgPath);
    const result = await notarizeDmg(input);
    expect(result).toMatchObject({ id: submissionId, status: "Accepted", stapled: true, issueCount: 0, archiveSha256: original });
    expect(result.stapledSha256).toBe(await sha256File(input.dmgPath));
    expect(result.stapledSha256).not.toBe(original);
    expect(JSON.parse(await readFile(input.receiptPath, "utf8"))).toEqual(result);
    expect(input.run.mock.calls.map(([, args]) => args[1])).toEqual(["submit", "wait", "log", "staple", "validate"]);
  });

  it("retains the receipt and does not resubmit after a wait failure", async () => {
    const input = await fixture();
    const originalRun = input.run.getMockImplementation()!;
    input.run.mockImplementation(async (command, args) => {
      if (args[1] === "wait") throw new Error("synthetic timeout");
      return originalRun(command, args);
    });
    await expect(notarizeDmg(input)).rejects.toThrow("timeout");
    expect(JSON.parse(await readFile(input.receiptPath, "utf8")).id).toBe(submissionId);
    input.run.mockImplementation(originalRun);
    await notarizeDmg(input);
    expect(input.run.mock.calls.filter(([, args]) => args[1] === "submit")).toHaveLength(1);
  });

  it("validates an already-stapled receipt without resubmitting", async () => {
    const input = await fixture();
    await notarizeDmg(input);
    input.run.mockClear();
    await notarizeDmg(input);
    expect(input.run.mock.calls.map(([, args]) => args[1])).toEqual(["validate"]);
  });

  it("rejects a changed candidate before any remote request", async () => {
    const input = await fixture();
    await notarizeDmg(input);
    input.run.mockClear();
    await writeFile(input.dmgPath, "changed candidate");
    await expect(notarizeDmg(input)).rejects.toThrow("不匹配");
    expect(input.run).not.toHaveBeenCalled();
  });

  it.each(["Invalid", "In Progress"])("does not staple when Apple returns %s", async (status) => {
    const input = await fixture();
    const originalRun = input.run.getMockImplementation()!;
    input.run.mockImplementation((command, args) => args[1] === "wait"
      ? Promise.resolve(JSON.stringify({ id: submissionId, status })) : originalRun(command, args));
    await expect(notarizeDmg(input)).rejects.toThrow("公证未通过");
    expect(input.run.mock.calls.some(([, args]) => args[1] === "staple")).toBe(false);
  });

  it("stops on notary-log issues even if status is Accepted", async () => {
    const input = await fixture();
    const originalRun = input.run.getMockImplementation()!;
    input.run.mockImplementation((command, args) => args[1] === "log"
      ? Promise.resolve(JSON.stringify({ jobId: submissionId, status: "Accepted", issues: [{ severity: "warning" }] }))
      : originalRun(command, args));
    await expect(notarizeDmg(input)).rejects.toThrow("待审查事项");
    expect(input.run.mock.calls.some(([, args]) => args[1] === "staple")).toBe(false);
  });
});
