import { describe, expect, it } from "vitest";
import configSource from "../../electron.vite.config.ts?raw";

describe("Renderer production chunking", () => {
  it("keeps framework and large runtime domains out of the WorkspaceShell chunk", () => {
    expect(configSource).toContain("manualChunks");
    expect(configSource).toContain('return "vendor-vue"');
    expect(configSource).toContain('return "agent-runtime"');
    expect(configSource).toContain('return "story-kernel-skills"');
    expect(configSource).toContain('return "conversation-runtime"');
    expect(configSource).toContain("chunkSizeWarningLimit: 1_000");
  });
});
