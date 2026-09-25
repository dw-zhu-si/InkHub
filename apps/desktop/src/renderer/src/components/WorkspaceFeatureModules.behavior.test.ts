import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type {
  SubagentAuthoringRuntimeContext
} from "@deepwrite/contracts";
import type { SubagentAuthoringController } from "../composables/useSubagentAuthoring";
import type {
  AgentTeamFeatureModule,
  WorkspaceFeatureModule
} from "./WorkspaceFeatureModules.types";
import {
  generateWorkspaceFeatureSubagent,
  resetWorkspaceFeatureSubagent,
  stopWorkspaceFeatureSubagent
} from "./workspaceFeatureModuleAuthoring";

function authoringController(): SubagentAuthoringController {
  return {
    draft: ref(null),
    status: ref("idle"),
    error: ref(null),
    statusText: ref(null),
    isBusy: ref(false),
    generate: vi.fn(async () => true),
    stop: vi.fn(async () => undefined),
    reset: vi.fn(),
    handleEvent: vi.fn()
  };
}

function agentTeamModule(
  authoring: SubagentAuthoringController | null
): AgentTeamFeatureModule {
  return {
    kind: "agent-team",
    settings: [],
    longSettings: null,
    models: [],
    skills: [],
    preferredModelId: null,
    loading: false,
    saving: false,
    loadError: null,
    longLoading: false,
    longSaving: false,
    longLoadError: null,
    runtimeAvailable: true,
    authoring
  };
}

describe("WorkspaceFeatureModules authoring behavior", () => {
  it("routes generate, stop, and reset to the stable authoring controller", async () => {
    const authoring = authoringController();
    const module = agentTeamModule(authoring);
    const context = {
      workspaceType: "short",
      parentAgentId: "plot_design",
      parentAgentLabel: "剧情"
    } as unknown as SubagentAuthoringRuntimeContext;

    await generateWorkspaceFeatureSubagent(module, {
      context,
      modelId: "model-1"
    });
    await stopWorkspaceFeatureSubagent(module);
    resetWorkspaceFeatureSubagent(module);

    expect(authoring.generate).toHaveBeenCalledWith(context, "model-1");
    expect(authoring.stop).toHaveBeenCalledOnce();
    expect(authoring.reset).toHaveBeenCalledOnce();
  });

  it("suppresses authoring commands for non-agent modules and unloaded controllers", async () => {
    const directory: WorkspaceFeatureModule = {
      kind: "directory",
      path: null,
      loading: false
    };
    const context = {} as SubagentAuthoringRuntimeContext;

    await expect(
      generateWorkspaceFeatureSubagent(directory, {
        context,
        modelId: "model-1"
      })
    ).resolves.toBeUndefined();
    await expect(
      stopWorkspaceFeatureSubagent(directory)
    ).resolves.toBeUndefined();
    resetWorkspaceFeatureSubagent(directory);
    await expect(
      generateWorkspaceFeatureSubagent(agentTeamModule(null), {
        context,
        modelId: "model-1"
      })
    ).resolves.toBeUndefined();
  });

  it("returns controller failures to the host error boundary", async () => {
    const authoring = authoringController();
    vi.mocked(authoring.generate).mockRejectedValueOnce(
      new Error("authoring unavailable")
    );
    const context = {} as SubagentAuthoringRuntimeContext;

    await expect(
      generateWorkspaceFeatureSubagent(agentTeamModule(authoring), {
        context,
        modelId: "model-1"
      })
    ).rejects.toThrow("authoring unavailable");
  });
});
