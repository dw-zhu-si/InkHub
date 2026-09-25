import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const budgets = new Map([
  ["apps/desktop/src/main/index.ts", 3_800],
  ["apps/desktop/src/preload/index.ts", 2_450],
  ["apps/desktop/src/renderer/src/WorkspaceShell.vue", 2_850],
  ["apps/desktop/src/renderer/src/components/LongWorkspaceEditor.vue", 5_400],
  ["apps/desktop/src/renderer/src/composables/useAgentConversation.ts", 3_000],
  ["apps/desktop/src/utilities/folder-catalog-store.ts", 6_700],
  ["apps/desktop/src/renderer/src/components/InkHubNovelReader.vue", 1_100],
  ["apps/desktop/src/main/inkhub-ai-repair-service.ts", 700],
  ["apps/desktop/src/main/inkhub-deep-quality-coordinator.ts", 450],
  ["apps/desktop/src/main/inkhub-deep-quality-service.ts", 500]
]);

const failures = [];
for (const [relativePath, maximumLines] of budgets) {
  const source = await readFile(resolve(root, relativePath), "utf8");
  const lines = source.split(/\r?\n/u).length;
  if (lines > maximumLines) failures.push(`${relativePath}: ${lines} > ${maximumLines}`);
}

if (failures.length) {
  console.error("Source complexity budget exceeded:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Source complexity budget passed for ${budgets.size} high-risk modules.`);
}
