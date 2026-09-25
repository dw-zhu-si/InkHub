import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const workspaceRoot = resolve(__dirname, "../..");
const appRoot = resolve(__dirname);

const aliases = {
  "@deepwrite/contracts": resolve(workspaceRoot, "packages/contracts/src/index.ts"),
  "@deepwrite/pi-runtime-adapter": resolve(workspaceRoot, "packages/pi-runtime-adapter/src/index.ts"),
  "@deepwrite/shared": resolve(workspaceRoot, "packages/shared/src/index.ts")
};
const workspacePackages = Object.keys(aliases);
const bundledMainPackages = [...workspacePackages, "electron-updater", "pdfjs-dist"];

const rendererAliases = [
  {
    find: /^@deepwrite\/contracts$/,
    replacement: resolve(workspaceRoot, "packages/contracts/src/renderer.ts")
  },
  {
    find: /^@deepwrite\/contracts\/system$/,
    replacement: resolve(workspaceRoot, "packages/contracts/src/system.ts")
  },
  {
    find: "@deepwrite/pi-runtime-adapter",
    replacement: resolve(workspaceRoot, "packages/pi-runtime-adapter/src/index.ts")
  },
  {
    find: "@deepwrite/shared",
    replacement: resolve(workspaceRoot, "packages/shared/src/index.ts")
  }
];

export default defineConfig({
  main: {
    envDir: workspaceRoot,
    plugins: [externalizeDepsPlugin({ exclude: bundledMainPackages })],
    resolve: { alias: aliases },
    build: {
      rollupOptions: {
        external: ["electron"],
        input: {
          index: resolve(appRoot, "src/main/index.ts"),
          "inkhub-quality-worker": resolve(appRoot, "src/main/inkhub-quality-worker.ts"),
          "utilities/core-entry": resolve(appRoot, "src/utilities/core-entry.ts"),
          "utilities/agent-entry": resolve(appRoot, "src/utilities/agent-entry.ts"),
          "utilities/tool-entry": resolve(appRoot, "src/utilities/tool-entry.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: { alias: aliases },
    build: {
      rollupOptions: {
        external: ["electron"],
        input: { index: resolve(appRoot, "src/preload/index.ts") },
        output: { format: "cjs", entryFileNames: "[name].js" }
      }
    }
  },
  renderer: {
    root: resolve(appRoot, "src/renderer"),
    plugins: [vue()],
    resolve: { alias: rendererAliases },
    build: {
      // Vite's Rolldown environment currently preserves readable identifiers
      // unless minification is explicit. Shipping that output adds roughly a
      // megabyte of parse work to the workspace shell.
      minify: true,
      // The app-ready graph has a stricter measured raw/gzip budget in
      // tools/check-renderer-build.mjs. Keep Rollup's per-file warning aligned
      // with that product budget instead of its generic web-page default.
      chunkSizeWarningLimit: 1_000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replaceAll("\\", "/");
            if (
              normalized.includes("/node_modules/vue/") ||
              normalized.includes("/node_modules/@vue/") ||
              normalized.endsWith("/node_modules/pinia/dist/pinia.mjs")
            ) {
              return "vendor-vue";
            }
            if (normalized.includes("/packages/pi-runtime-adapter/src/")) {
              return "agent-runtime";
            }
            if (
              normalized.includes("/skills/story-kernel/") ||
              normalized.endsWith("/utils/inkhubStoryKernelSkills.ts")
            ) {
              return "story-kernel-skills";
            }
            if (normalized.endsWith("/composables/useAgentConversation.ts")) {
              return "conversation-runtime";
            }
            return undefined;
          }
        }
      }
    }
  }
});
