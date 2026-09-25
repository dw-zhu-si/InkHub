import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { normalizeOptionalTeamId, selectAppleSigningIdentity } from "./apple-signing-identities.mjs";

export const releaseIdentityTemplate = "${env.INKHUB_APPLE_SIGNING_IDENTITY}";
const RELEASE_ENVIRONMENT_KEYS = [
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

export function validateReleaseSigningConfig(config) {
  // electron-builder 26 rejects the certificate-type prefix in the name qualifier.
  if (/identity:\s*["']?Developer ID Application:/u.test(config) ||
      !config.includes(`identity: "${releaseIdentityTemplate}"`) ||
      !/forceCodeSigning:\s*true/u.test(config)) {
    throw new Error("正式签名配置必须使用发布器注入的证书名称限定符，不得硬编码账号身份或关闭强制签名。");
  }
  if (!config.includes('    - "\\\\.(?:bin|dat|nib|pak)$"')) {
    throw new Error("正式包必须跳过 Electron 的非 Mach-O 数据资源签名，防止生成 resource-fork detritus。");
  }
}

export function releaseEnvironment(environment) {
  const profile = environment.APPLE_KEYCHAIN_PROFILE?.trim();
  if (!profile || !/^[a-zA-Z0-9_.-]+$/u.test(profile)) {
    throw new Error("请先由发布者建立 notarytool Keychain profile，再通过 APPLE_KEYCHAIN_PROFILE 提供 profile 名称。");
  }
  const forbidden = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_API_KEY", "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER", "APPLE_KEYCHAIN", "CSC_LINK", "CSC_KEY_PASSWORD", "CSC_NAME", "CSC_KEYCHAIN"];
  if (forbidden.some((key) => environment[key])) {
    throw new Error("正式发布仅使用已批准的本机签名身份与 Keychain profile；请移除其他 Apple/CSC 凭证覆盖，勿输出其内容。");
  }
  const result = {
    ...Object.fromEntries(RELEASE_ENVIRONMENT_KEYS.flatMap((name) =>
      typeof environment[name] === "string" && environment[name] ? [[name, environment[name]]] : []
    )),
    APPLE_KEYCHAIN_PROFILE: profile
  };
  const teamId = normalizeOptionalTeamId(environment.INKHUB_APPLE_TEAM_ID);
  if (teamId) result.INKHUB_APPLE_TEAM_ID = teamId;
  return result;
}

export function runReleaseCommand(command, args, { cwd, env, capture = false, timeoutMs = 0 } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, env, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let stdout = "";
    let bytes = 0;
    let failure;
    const timer = timeoutMs ? setTimeout(() => {
      failure = new Error(`${command} 发布步骤超时；不会自动重新提交。`);
      child.kill("SIGTERM");
    }, timeoutMs) : undefined;
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (data) => {
        bytes += Buffer.byteLength(data);
        if (bytes > 8 * 1024 * 1024) {
          failure = new Error(`${command} 输出超出发布检查上限。`);
          child.kill("SIGTERM");
        } else stdout += data;
      });
      // Authentication errors may identify an account; never echo them into a release log.
      child.stderr.resume();
    }
    child.once("error", (error) => { clearTimeout(timer); rejectPromise(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0) rejectPromise(failure ?? new Error(`${command} 发布步骤失败 (exit=${code}, signal=${signal})。`));
      else resolvePromise(stdout);
    });
  });
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function preflightNotarization(run, profile, expectedTeamId = "") {
  const identities = await run("security", ["find-identity", "-v", "-p", "codesigning"], { capture: true });
  const signing = selectAppleSigningIdentity(identities, "Developer ID Application", expectedTeamId);
  const history = JSON.parse(await run("xcrun", ["notarytool", "history", "--keychain-profile", profile,
    "--output-format", "json"], { capture: true, timeoutMs: 60_000 }));
  if (!Array.isArray(history.history)) throw new Error("Apple 公证凭证预检未返回有效结果。");
  return { status: "ready", ...signing };
}

export async function notarizeDmg({ run, profile, dmgPath, receiptPath }) {
  const archiveSha256 = await sha256File(dmgPath);
  let receipt;
  try {
    receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    const expectedHash = receipt.stapled ? receipt.stapledSha256 : receipt.archiveSha256;
    if (expectedHash !== archiveSha256 || receipt.artifact !== basename(dmgPath) || !/^[0-9a-f-]{36}$/iu.test(receipt.id ?? "")) {
      throw new Error("公证回执与当前 DMG 不匹配；禁止复用或覆盖。");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (receipt?.stapled && receipt.status === "Accepted") {
    await run("xcrun", ["stapler", "validate", dmgPath]);
    return receipt;
  }
  if (!receipt) {
    const submitted = JSON.parse(await run("xcrun", ["notarytool", "submit", dmgPath,
      "--keychain-profile", profile, "--no-wait", "--output-format", "json"], { capture: true }));
    if (!/^[0-9a-f-]{36}$/iu.test(submitted.id ?? "")) throw new Error("Apple 未返回可追踪的公证提交 ID；停止自动处理。");
    receipt = { artifact: basename(dmgPath), archiveSha256, id: submitted.id, status: "Submitted" };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }
  console.log(`NOTARIZATION_SUBMITTED id=${receipt.id} artifact=${receipt.artifact}`);
  const completed = JSON.parse(await run("xcrun", ["notarytool", "wait", receipt.id,
    "--keychain-profile", profile, "--timeout", "15m", "--output-format", "json"], { capture: true }));
  if (completed.id !== receipt.id) throw new Error("Apple 公证返回的提交身份不匹配。");
  receipt.status = completed.status;
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  if (receipt.status !== "Accepted") throw new Error(`DMG 公证未通过：${receipt.status}；保留提交 ID，禁止发布。`);
  const log = JSON.parse(await run("xcrun", ["notarytool", "log", receipt.id,
    "--keychain-profile", profile], { capture: true }));
  receipt.issueCount = Array.isArray(log.issues) ? log.issues.length : 0;
  if (log.status !== "Accepted" || (log.jobId && log.jobId !== receipt.id)) throw new Error("Apple 公证日志与完成状态不一致。");
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  if (receipt.issueCount) throw new Error("Apple 公证日志含待审查事项；停止发布并保留提交 ID。");
  await run("xcrun", ["stapler", "staple", dmgPath]);
  await run("xcrun", ["stapler", "validate", dmgPath]);
  receipt.stapledSha256 = await sha256File(dmgPath);
  receipt.stapled = true;
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}
