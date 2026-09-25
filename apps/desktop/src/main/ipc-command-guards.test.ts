import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("IPC command requestId handling", () => {
  it("main preserves raw command id on early rejects and surfaces validation issues", () => {
    const source = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("function extractCommandRequestId");
    expect(source).toContain("function summarizeCommandValidationIssues");
    expect(source).toContain("const requestId = extractCommandRequestId(rawCommand)");
    expect(source).toContain("mainWindow.isDestroyed()");
    expect(source).not.toContain("requestId: \"unknown\"");
    expect(source).toContain('return "unknown"');
    expect(source).toContain("Command envelope failed schema validation.");
  });

  it("preload surfaces rejected IPC errors instead of masking them as requestId mismatches", () => {
    const source = readFileSync(
      new URL("../preload/index.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("const expectedRequestId = command.id");
    expect(source).toContain('if (result.status === "rejected")');
    expect(source).toContain(
      "`IPC result requestId does not match command id. expected=${expectedRequestId} actual=${result.requestId}`"
    );
    expect(source).not.toContain(
      'throw new Error("IPC result requestId does not match command id.");'
    );
  });

  it("routes screenplay creation through preload, main, and the core utility", () => {
    const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const preloadSource = readFileSync(
      new URL("../preload/index.ts", import.meta.url),
      "utf8"
    );
    const coreSource = readFileSync(
      new URL("../utilities/core-entry.ts", import.meta.url),
      "utf8"
    );

    expect(preloadSource).toContain("async function createScriptBook");
    expect(preloadSource).toContain('"catalog.createScriptBook"');
    expect(mainSource).toContain('"catalog.createScriptBookAtPath"');
    expect(mainSource).toContain("ScriptBookSchema.parse(result.payload)");
    expect(coreSource).toContain(
      'command.type === "catalog.createScriptBookAtPath"'
    );
    expect(coreSource).toContain("catalogStore.createScriptBook(");
    expect(mainSource).toContain(
      "command.payload.workspaceContext?.scriptWorkspace"
    );
    expect(mainSource).toContain("creativeWorkspaceType");
    expect(mainSource).toContain(
      "creativeWorkspace,\n                creativeWorkspaceType"
    );
    expect(mainSource).toContain("{ scriptAgentProfile: agentProfile }");
  });

  it("routes idempotent draft-section batches through preload, main, and core", () => {
    const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const preloadSource = readFileSync(
      new URL("../preload/index.ts", import.meta.url),
      "utf8"
    );
    const coreSource = readFileSync(
      new URL("../utilities/core-entry.ts", import.meta.url),
      "utf8"
    );

    expect(preloadSource).toContain("async function createDraftSections");
    expect(preloadSource).toContain('"catalog.createDraftSections"');
    expect(mainSource).toContain(
      'command.type === "catalog.createDraftSections"'
    );
    expect(mainSource).toContain(
      "CreateDraftSectionsResultSchema.parse(result.payload)"
    );
    expect(coreSource).toContain(
      "await catalogStore.createDraftSections(command.payload)"
    );
  });

  it("routes remote model listing through preload and main", () => {
    const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const preloadSource = readFileSync(
      new URL("../preload/index.ts", import.meta.url),
      "utf8"
    );

    expect(preloadSource).toContain("async function listRemoteModels");
    expect(preloadSource).toContain('"models.listRemote"');
    expect(preloadSource).toContain("listRemote: listRemoteModels");
    expect(mainSource).toContain('command.type === "models.listRemote"');
    expect(mainSource).toContain("resolveDraftApiKey(");
    expect(mainSource).toContain("listRemoteModels({");
    expect(mainSource).toContain("RemoteModelListResultSchema.parse({ models })");
  });

  it("routes metadata index and on-demand document reads through every boundary", () => {
    const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const preloadSource = readFileSync(
      new URL("../preload/index.ts", import.meta.url),
      "utf8"
    );
    const apiSource = readFileSync(
      new URL("../../../../packages/contracts/src/preload-api.ts", import.meta.url),
      "utf8"
    );
    const coreSource = readFileSync(
      new URL("../utilities/core-entry.ts", import.meta.url),
      "utf8"
    );
    const initialization = coreSource.slice(
      coreSource.indexOf("async function requireCatalogStore"),
      coreSource.indexOf("async function handleCatalogCommand")
    );

    expect(apiSource).toContain("index(): Promise<CatalogIndexSnapshot>");
    expect(apiSource).toContain(
      "readDocument(input: CatalogReadDocumentInput): Promise<CatalogReadDocumentResult>"
    );
    expect(preloadSource).toContain("async function getCatalogIndex");
    expect(preloadSource).toContain("async function readCatalogDocument");
    expect(preloadSource).toContain('"catalog.index"');
    expect(preloadSource).toContain('"catalog.readDocument"');
    expect(mainSource).toContain('command.type === "catalog.index"');
    expect(mainSource).toContain('command.type === "catalog.readDocument"');
    expect(mainSource).toContain("CatalogIndexSnapshotSchema.parse(result.payload)");
    expect(mainSource).toContain("CatalogReadDocumentResultSchema.parse(result.payload)");
    expect(coreSource).toContain("await catalogStore.indexSnapshot()");
    expect(coreSource).toContain("await catalogStore.readDocument(command.payload)");
    expect(initialization).toContain("await existingFolderStore.indexSnapshot()");
    expect(initialization).toContain("await folderStore.indexSnapshot()");
    expect(initialization).not.toContain("existingFolderStore.snapshot()");
    expect(initialization).not.toContain("folderStore.snapshot()");
  });

  it("bounds editor index, reads, saves, and snapshots instead of waiting forever", () => {
    const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const catalogForwarding = mainSource.slice(
      mainSource.indexOf('command.type === "catalog.index"'),
      mainSource.indexOf('if (command.type === "models.list")')
    );

    expect(catalogForwarding).toContain("catalogCommandTimeoutMs(command.type)");
    expect(catalogForwarding).toContain(
      "error instanceof UtilityCommandTimeoutError"
    );
    expect(catalogForwarding).toContain('code: timedOut ? "catalog.command_timeout"');
    expect(catalogForwarding).not.toContain(
      'supervisor.requestCommand("core", command, 0)'
    );
  });
});
