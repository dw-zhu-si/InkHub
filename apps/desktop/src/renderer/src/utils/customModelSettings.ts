import type { ModelConfigInput, ModelSettingsInput } from "@deepwrite/contracts";

export function mergeCustomModelSettings(
  existingModels: readonly ModelConfigInput[],
  customModels: readonly ModelConfigInput[],
  preferredDefaultModelId: string
): ModelSettingsInput {
  const customById = new Map(customModels.map((model) => [model.id, model]));
  const originalCustomIds = new Set(
    existingModels.filter((model) => !model.managedBy).map((model) => model.id)
  );
  const models: ModelConfigInput[] = [];

  for (const model of existingModels) {
    if (model.managedBy) {
      models.push(model);
      continue;
    }
    const draft = customById.get(model.id);
    if (draft) models.push(draft);
  }
  for (const model of customModels) {
    if (!originalCustomIds.has(model.id)) models.push(model);
  }

  return {
    models,
    defaultModelId: models.some((model) => model.id === preferredDefaultModelId)
      ? preferredDefaultModelId
      : models[0]?.id ?? ""
  };
}
