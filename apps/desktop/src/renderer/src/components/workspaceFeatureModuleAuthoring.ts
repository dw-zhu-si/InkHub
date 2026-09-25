import type { SubagentAuthoringRuntimeContext } from "@deepwrite/contracts";
import type { WorkspaceFeatureModule } from "./WorkspaceFeatureModules.types";

export interface WorkspaceFeatureAuthoringInput {
  context: SubagentAuthoringRuntimeContext;
  modelId: string;
}

export function generateWorkspaceFeatureSubagent(
  module: WorkspaceFeatureModule,
  input: WorkspaceFeatureAuthoringInput
): Promise<void> {
  if (module.kind !== "agent-team") return Promise.resolve();
  return Promise.resolve(
    module.authoring?.generate(input.context, input.modelId)
  ).then(() => undefined);
}

export function stopWorkspaceFeatureSubagent(
  module: WorkspaceFeatureModule
): Promise<void> {
  if (module.kind !== "agent-team") return Promise.resolve();
  return Promise.resolve(module.authoring?.stop()).then(() => undefined);
}

export function resetWorkspaceFeatureSubagent(
  module: WorkspaceFeatureModule
): void {
  if (module.kind !== "agent-team") return;
  module.authoring?.reset();
}
