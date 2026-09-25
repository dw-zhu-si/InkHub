import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const workspaceRoot = resolve(appDir, "../..");
const electronDist = resolve(workspaceRoot, "node_modules/electron/dist");
const packagedExecutable = process.env.INKHUB_ACCEPTANCE_EXECUTABLE?.trim();
const electronBinary = packagedExecutable
  ? resolve(packagedExecutable)
  : process.platform === "darwin"
    ? resolve(electronDist, "Electron.app/Contents/MacOS/Electron")
    : process.platform === "win32"
      ? resolve(electronDist, "electron.exe")
      : resolve(electronDist, "electron");

try {
  if (!packagedExecutable) await access(resolve(appDir, "out/main/index.js"));
  await access(electronBinary);
} catch {
  console.error(packagedExecutable
    ? `Installed/package acceptance executable is missing: ${electronBinary}`
    : "Desktop build or Electron binary is missing. Run `pnpm build` first.");
  process.exit(1);
}

const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const hasXvfb = spawnSync("sh", ["-c", "command -v xvfb-run"], { encoding: "utf8" }).status === 0;
const userData = await mkdtemp(join(tmpdir(), "inkhub-electron-acceptance-"));
const screenshotDirectory = process.env.INKHUB_ACCEPTANCE_SCREENSHOTS_DIR?.trim();
const fixtureHome = join(userData, "fixture-home");
const fixtureNovel = join(fixtureHome, "Desktop", "小说", "雾河书简");
const fixtureNotes = join(fixtureNovel, "创作资料", "伏笔记录");
const acceptanceSkillContent = "---\nname: inkhub-acceptance-repair\ndescription: 墨枢桌面验收用的本地指令 Skill。\n---\n\n# 验收\n\n仅验证安装、路由和审阅，不调用真实模型。\n";
const acceptanceSkillPaths = [
  "novel-chapter-generate",
  "chapter-hook-generate",
  "plot-pleasure-rhythm"
].map((id) => join(fixtureHome, ".inkhub-acceptance", "skills", id, "SKILL.md"));
await mkdir(fixtureNovel, { recursive: true });
await mkdir(fixtureNotes, { recursive: true });
await Promise.all(acceptanceSkillPaths.map((path) => mkdir(dirname(path), { recursive: true })));
if (screenshotDirectory) {
  const modelConfigDirectory = join(userData, "config");
  await mkdir(modelConfigDirectory, { recursive: true });
  await writeFile(join(modelConfigDirectory, "models.json"), `${JSON.stringify({
    version: 1,
    defaultModelId: "modelhub-writing-demo",
    models: [
      {
        id: "vendor-writing-demo",
        label: "厂家直连小说模型",
        provider: "openai-compatible",
        modelId: "vendor-novel-pro",
        supportsDeveloperRole: true,
        api: "openai-responses",
        baseUrl: "https://api.example.invalid/v1",
        reasoning: true,
        defaultThinkingLevel: "medium",
        thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
        temperatureOptions: [0.1, 0.7, 1],
      },
      {
        id: "modelhub-writing-demo",
        label: "ModelHub 小说创作模型",
        provider: "modelhub",
        modelId: "qwen3.8-max",
        supportsDeveloperRole: false,
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11435/v1",
        reasoning: false,
        defaultThinkingLevel: "off",
        thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
        temperatureOptions: [0.1, 0.7, 1]
      },
      {
        id: "modelhub-image-demo",
        label: "ModelHub 视觉创作模型",
        provider: "modelhub",
        modelId: "qwen-image-demo",
        supportsDeveloperRole: false,
        api: "openai-completions",
        baseUrl: "http://127.0.0.1:11435/v1",
        reasoning: false,
        defaultThinkingLevel: "off",
        thinkingLevelOptions: ["minimal", "low", "medium", "high", "xhigh", "max"],
        temperatureOptions: [0.1, 0.7, 1]
      }
    ],
    disabledOfficialModelIds: []
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
await Promise.all([
  writeFile(join(fixtureNovel, "正文.txt"), [
    "# 第一卷：雨夜",
    "## 第一章 灯下相逢",
    "林舟在雨夜走进旧书店，看见柜台后的青铜铃。",
    "",
    "## 第二章 未寄出的信",
    "他在夹页里找到一封写着星河暗号的旧信。",
    "",
    "# 第二卷：归途",
    "## 第一章 清晨归途",
    "天亮时，林舟带着答案沿河回家。"
  ].join("\n"), "utf8"),
  writeFile(join(fixtureNovel, "人物设定.md"), "# 人物设定\n\n林舟：旧书修复师，记得星河暗号。\n", "utf8"),
  writeFile(join(fixtureNotes, "青铜铃.md"), "# 青铜铃线索\n\n林舟记得信纸上的星河暗号，也记得青铜铃在雨夜响过一次。\n", "utf8"),
  ...acceptanceSkillPaths.map((path) => writeFile(path, acceptanceSkillContent, "utf8"))
]);
const command = !hasDisplay && hasXvfb ? "xvfb-run" : electronBinary;
const appArgs = packagedExecutable
  ? ["--no-sandbox", `--user-data-dir=${userData}`]
  : [".", "--no-sandbox", `--user-data-dir=${userData}`];
const args = !hasDisplay && hasXvfb
  ? ["-a", electronBinary, ...appArgs]
  : appArgs;

const child = spawn(command, args, {
  cwd: appDir,
  env: {
    ...process.env,
    INKHUB_ACCEPTANCE: "1",
    INKHUB_ACCEPTANCE_NOVEL_ROOT: join(fixtureHome, "Desktop", "小说"),
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill("SIGKILL");
}, 45_000);

child.on("close", async (code, signal) => {
  clearTimeout(timeout);
  await rm(userData, { recursive: true, force: true });
  const marker = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith("INKHUB_ACCEPTANCE_OK "));
  const shutdownMarker = output
    .split(/\r?\n/u)
    .some((line) => line === "INKHUB_ACCEPTANCE_SHUTDOWN_OK");
  const expectedMacOs26Workaround =
    process.platform === "darwin" &&
    release().split(".")[0] === "25" &&
    !timedOut &&
    signal === "SIGKILL" &&
    shutdownMarker;
  if ((code !== 0 && !expectedMacOs26Workaround) || !marker) {
    console.error(output.trim());
    console.error(`墨枢 Electron 验收失败，退出码 ${String(code)}，信号 ${String(signal)}。`);
    process.exit(1);
  }
  const summary = JSON.parse(marker.slice("INKHUB_ACCEPTANCE_OK ".length));
  console.log(
    `墨枢 Electron 验收通过：${summary.visited.length} 个界面，Skills/Agents ${summary.skillStatus}，无水平溢出或未命名控件。`
  );
});
