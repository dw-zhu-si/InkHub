import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("renderer state IPC wiring", () => {
  it("exposes an asynchronous conversation persistence API without renderer serialization", () => {
    const preloadSource = readFileSync(
      new URL("../preload/index.ts", import.meta.url),
      "utf8"
    );
    const apiContractSource = readFileSync(
      new URL("../../../../packages/contracts/src/preload-api.ts", import.meta.url),
      "utf8"
    );
    const persistenceFunctions = preloadSource.slice(
      preloadSource.indexOf("async function loadConversationPersistence"),
      preloadSource.indexOf("async function getUpdateState")
    );

    expect(apiContractSource).toContain(
      "conversationPersistence?: ConversationPersistenceApi"
    );
    expect(preloadSource).toContain("conversationPersistence: {");
    expect(preloadSource).toContain('"rendererState.load"');
    expect(preloadSource).toContain('"rendererState.save"');
    expect(preloadSource).toContain('"rendererState.remove"');
    expect(persistenceFunctions).not.toContain("localStorage");
    expect(persistenceFunctions).not.toContain("JSON.stringify");
    expect(persistenceFunctions).not.toContain("JSON.parse");
  });

  it("forwards renderer state commands through main to the core utility", () => {
    const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const coreSource = readFileSync(
      new URL("../utilities/core-entry.ts", import.meta.url),
      "utf8"
    );
    const forwarding = mainSource.slice(
      mainSource.indexOf('command.type === "rendererState.load"'),
      mainSource.indexOf('command.type === "catalog.snapshot"')
    );

    expect(forwarding).toContain('supervisor.requestCommand("core", command, 60_000)');
    expect(forwarding).toContain("RendererStateLoadResultSchema.parse");
    expect(forwarding).toContain("RendererStateMutationResultSchema.parse");
    expect(coreSource).toContain(
      "const rendererStateStore = new RendererStateStore(resolvedUserDataPath)"
    );
    expect(coreSource).toContain(
      "await rendererStateStore.load(command.payload.key)"
    );
    expect(coreSource).toContain(
      "await rendererStateStore.save(command.payload.key, command.payload.value)"
    );
    expect(coreSource).toContain(
      "await rendererStateStore.remove(command.payload.key)"
    );
  });
});
