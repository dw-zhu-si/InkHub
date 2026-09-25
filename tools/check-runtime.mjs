import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

const minimumNodeMajor = Number.parseInt(
  String(packageJson.engines?.node ?? "").match(/\d+/u)?.[0] ?? "0",
  10
);
const currentNodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

if (!minimumNodeMajor || currentNodeMajor < minimumNodeMajor) {
  console.error(
    `墨枢需要 Node ${minimumNodeMajor || 24}+；当前为 ${process.version}。请使用项目 .node-version 或 Codex bundled Node 24 运行。`
  );
  process.exit(1);
}

const packageManager = String(packageJson.packageManager ?? "");
const expectedPnpm = packageManager.match(/^pnpm@(.+)$/u)?.[1];
const userAgent = process.env.npm_config_user_agent ?? "";
const activePnpm = userAgent.match(/pnpm\/([^\s]+)/u)?.[1];

if (expectedPnpm && activePnpm && activePnpm !== expectedPnpm) {
  console.warn(
    `墨枢锁定 pnpm ${expectedPnpm}；当前为 ${activePnpm}。本次继续执行，但正式验收应使用锁定版本。`
  );
}

console.log(
  `Runtime preflight passed: Node ${process.versions.node}${activePnpm ? `, pnpm ${activePnpm}` : ""}.`
);
