import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "deepwrite-test-source",
      enforce: "pre",
      resolveId(id) {
        if (id === "virtual:deepwrite-renderer-styles") {
          return "\0virtual:deepwrite-renderer-styles";
        }
        return null;
      },
      load(id) {
        if (id !== "\0virtual:deepwrite-renderer-styles") return null;
        const source = readFileSync(
          new URL(
            "./apps/desktop/src/renderer/src/styles.css",
            import.meta.url
          ),
          "utf8"
        );
        return `export default ${JSON.stringify(source)};`;
      }
    }
  ],
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/desktop/scripts/**/*.test.ts",
      "apps/desktop/src/main/**/*.test.ts",
      "apps/desktop/src/utilities/**/*.test.ts",
      "apps/desktop/src/extras/**/*.test.ts",
      "apps/desktop/src/renderer/**/*.test.ts"
    ],
    environment: "node"
  }
});
