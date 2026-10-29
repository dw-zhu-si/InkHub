import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const vueRequire = createRequire(require.resolve("vue/package.json"));
const contractsRequire = createRequire(new URL("../../../packages/contracts/package.json", import.meta.url));
const { z } = contractsRequire("zod") as { z: {
  string: () => unknown;
  array: (schema: unknown) => { max: (limit: number) => { safeParse: (value: unknown) =>
    { success: true } | { success: false; error: { issues: Array<{ code: string }> } } } };
} };

describe("release security dependency patches", () => {
  it("pins the reviewed fixed versions instead of bypassing production audit", async () => {
    const [desktop, contracts, workspace] = await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../../../packages/contracts/package.json", import.meta.url), "utf8"),
      readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8")
    ]);
    expect(JSON.parse(desktop).dependencies.vue).toBe("3.5.42");
    expect(JSON.parse(contracts).dependencies.zod).toBe("4.6.6");
    expect(workspace).toMatch(/source-map-js:\s*1\.2\.2/u);
    expect(workspace).toMatch(/'zod@4':\s*4\.6\.6/u);
    expect(vueRequire("vue/package.json").version).toBe("3.5.42");
    expect(contractsRequire("zod/package.json").version).toBe("4.6.6");
    const compilerRequire = createRequire(vueRequire.resolve("@vue/compiler-sfc/package.json"));
    expect(compilerRequire("source-map-js/package.json").version).toBe("1.2.2");
  });

  it("rejects an oversized constrained collection without generating an issue per item", () => {
    const result = z.array(z.string()).max(2).safeParse(Array.from({ length: 1000 }, () => false));
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Oversized collection was accepted.");
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0]?.code).toBe("too_big");
  });

  it("pins the runtime and build-chain fixes on compatible release branches", async () => {
    const [root, desktop, workspace, release, mas, windows] = await Promise.all([
      readFile(new URL("../../../package.json", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../../../pnpm-workspace.yaml", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/run-release-package.mjs", import.meta.url), "utf8"),
      readFile(new URL("./run-mas-package.mjs", import.meta.url), "utf8"),
      readFile(new URL("../../../tools/run-test-package.mjs", import.meta.url), "utf8")
    ]);
    const development = JSON.parse(root).devDependencies;
    expect(development.electron).toBe("44.10.0");
    expect(JSON.parse(desktop).devDependencies.electron).toBe("44.10.0");
    expect(require("electron/package.json").version).toBe("44.10.0");
    expect(development.vite).toBe("7.3.7");
    expect(require("vite/package.json").version).toBe("7.3.7");
    expect(development.vitest).toBe("4.1.12");
    expect(development["@vitest/coverage-v8"]).toBe("4.1.12");
    for (const pin of [
      "fast-uri: 3.1.9", "'undici@6': 6.29.1", "'undici@7': 7.30.1",
      "'brace-expansion@1': 1.1.21", "'brace-expansion@2': 2.1.7", "'brace-expansion@5': 5.0.12",
      "browserslist: 4.28.7", "baseline-browser-mapping: 2.11.0",
      "'@xmldom/xmldom@0.8': 0.8.15", "'@xmldom/xmldom@0.9': 0.9.12"
    ]) expect(workspace).toContain(pin);
    expect(release).toContain('run("pnpm", ["audit"])');
    expect(mas).toContain('run("pnpm", ["audit"]');
    expect(windows).toContain('run(pnpmCommand, ["audit"])');
  });

  it("does not render a carriage-return attribute-name injection in SSR", () => {
    const { ssrRenderAttrs } = vueRequire("@vue/server-renderer") as {
      ssrRenderAttrs: (attributes: Record<string, string>) => string;
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const rendered = ssrRenderAttrs({ "data-safe": "fixture", ["x\rautofocus\ronfocus"]: "invalid-fixture" });
      expect(rendered).toContain('data-safe="fixture"');
      expect(rendered).not.toContain("\r");
      expect(rendered).not.toContain("autofocus");
      expect(rendered).not.toContain("onfocus");
    } finally { warning.mockRestore(); }
  });
});
