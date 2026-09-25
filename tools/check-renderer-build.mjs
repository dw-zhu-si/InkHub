import { gzipSync } from "node:zlib";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rendererOut = fileURLToPath(new URL("../apps/desktop/out/renderer/", import.meta.url));
const indexPath = join(rendererOut, "index.html");
// Keep a narrow allowance for minifier output differences across the supported
// Vite 7 toolchain while still enforcing the original 40% baseline reduction.
const APP_READY_JS_BUDGET_BYTES = 1_010_000;
const APP_READY_BASELINE_BYTES = 2_504_722;

try {
  await access(indexPath);
} catch {
  console.error("Renderer build is missing. Run `pnpm build` first.");
  process.exit(1);
}

const html = await readFile(indexPath, "utf8");
const assets = await readdir(join(rendererOut, "assets"));
const hasScript = /<script[^>]+src=["'][^"']+["']/.test(html);
const hasJavaScript = assets.some((asset) => asset.endsWith(".js"));
const hasCss = assets.some((asset) => asset.endsWith(".css"));

if (!html.includes("墨枢") || !hasScript || !hasJavaScript || !hasCss) {
  console.error("Renderer build does not contain the expected 墨枢 HTML, JavaScript, and CSS assets.");
  process.exit(1);
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1] ?? "";
}

function resolveHtmlAsset(assetPath) {
  const normalizedPath = normalize(assetPath.replace(/^\.\//, ""));
  const resolvedPath = join(rendererOut, normalizedPath);
  if (!resolvedPath.startsWith(rendererOut)) {
    throw new Error(`Renderer asset escaped its output directory: ${assetPath}`);
  }
  return resolvedPath;
}

const scriptSources = [...html.matchAll(/<script\b[^>]*>/gi)]
  .map(([tag]) => attribute(tag, "src"))
  .filter((source) => source.endsWith(".js"));
const modulePreloads = [...html.matchAll(/<link\b[^>]*>/gi)]
  .filter(([tag]) => attribute(tag, "rel") === "modulepreload")
  .map(([tag]) => attribute(tag, "href"))
  .filter((source) => source.endsWith(".js"));

if (scriptSources.length !== 1) {
  console.error(`Expected one Renderer module entry, found ${scriptSources.length}.`);
  process.exit(1);
}

const entryPath = resolveHtmlAsset(scriptSources[0]);
const entrySource = await readFile(entryPath, "utf8");
const dependencyTableMatch = entrySource.match(
  /\.f\s*\|\|\s*\([^)]*?\.f\s*=\s*(\[[^\]]*\])\s*\)/,
);
const shellImportMatch = entrySource.match(
  /import\([`"'](\.\/WorkspaceShell-[^`"']+\.js)[`"']\)(?:\.then\([^)]*\))?\s*,\s*__vite__mapDeps\(\[([\d,\s]+)\]\)/,
);

if (!dependencyTableMatch || !shellImportMatch) {
  console.error(
    "Unable to identify the async WorkspaceShell preload graph; Renderer performance budget cannot be verified.",
  );
  process.exit(1);
}

let dependencyTable;
try {
  dependencyTable = JSON.parse(dependencyTableMatch[1]);
} catch (error) {
  console.error("Renderer dependency table is invalid JSON.", error);
  process.exit(1);
}

const shellDependencyIndices = shellImportMatch[2]
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10));
const shellDependencies = shellDependencyIndices
  .map((index) => dependencyTable[index])
  .filter((assetPath) => typeof assetPath === "string" && assetPath.endsWith(".js"))
  .map((assetPath) => join(dirname(entryPath), assetPath));

const strictInitialPaths = [...new Set([...scriptSources, ...modulePreloads].map(resolveHtmlAsset))];
const appReadyPaths = [...new Set([...strictInitialPaths, ...shellDependencies])];

async function measureJavaScript(paths) {
  const files = await Promise.all(paths.map((path) => readFile(path)));
  return {
    rawBytes: files.reduce((total, contents) => total + contents.byteLength, 0),
    gzipBytes: files.reduce((total, contents) => total + gzipSync(contents).byteLength, 0),
  };
}

const strictInitial = await measureJavaScript(strictInitialPaths);
const appReady = await measureJavaScript(appReadyPaths);
const reductionPercent = (1 - appReady.rawBytes / APP_READY_BASELINE_BYTES) * 100;

console.log(
  `Renderer JS: strict initial ${strictInitial.rawBytes.toLocaleString("en-US")} B raw / ${strictInitial.gzipBytes.toLocaleString("en-US")} B gzip; ` +
    `app-ready ${appReady.rawBytes.toLocaleString("en-US")} B raw / ${appReady.gzipBytes.toLocaleString("en-US")} B gzip ` +
    `(${reductionPercent.toFixed(1)}% below baseline).`,
);

if (appReady.rawBytes >= APP_READY_JS_BUDGET_BYTES) {
  console.error(
    `Renderer app-ready JavaScript exceeds the ${APP_READY_JS_BUDGET_BYTES.toLocaleString("en-US")} B budget.`,
  );
  process.exit(1);
}

if (reductionPercent < 40) {
  console.error("Renderer app-ready JavaScript has not reached the required 40% reduction.");
  process.exit(1);
}

console.log("Renderer build smoke and performance budgets passed.");
