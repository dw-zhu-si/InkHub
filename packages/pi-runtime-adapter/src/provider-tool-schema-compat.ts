import type { Context } from "@earendil-works/pi-ai";

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyObjectBranches(
  schema: Record<string, unknown>,
  keyword: "anyOf" | "oneOf" | "allOf"
): boolean {
  const branches = schema[keyword];
  return (
    Array.isArray(branches) &&
    branches.length > 0 &&
    branches.every(
      (branch) => isSchemaRecord(branch) && branch.type === "object"
    )
  );
}

/**
 * Provider function tools always receive a JSON object as their arguments.
 * TypeBox object unions serialize as a root-level anyOf without an explicit
 * type, which OpenAI-compatible APIs reject before the model can run. Repair
 * only unions/intersections whose every branch is already an object; reject
 * every other non-object root locally instead of sending an invalid request.
 */
export function normalizeProviderToolParameterSchema(
  toolName: string,
  value: unknown
): Record<string, unknown> {
  if (!isSchemaRecord(value)) {
    throw new Error(
      `工具“${toolName}”的参数 schema 必须是 JSON Schema 对象，当前根节点无效。`
    );
  }
  if (value.type === "object") return value;

  const canDeclareObjectRoot =
    (value.type === undefined || value.type === null) &&
    (["anyOf", "oneOf", "allOf"] as const).some((keyword) =>
      hasOnlyObjectBranches(value, keyword)
    );
  if (canDeclareObjectRoot) {
    return { ...value, type: "object" };
  }

  const actualType =
    value.type === undefined || value.type === null
      ? "未声明"
      : JSON.stringify(value.type);
  throw new Error(
    `工具“${toolName}”的参数 schema 根节点必须声明 type: "object"，当前为 ${actualType}。`
  );
}

export function enforceProviderToolSchemaCompatibility(
  context: Context
): Context {
  if (!context.tools?.length) return context;
  let changed = false;
  const tools = context.tools.map((tool) => {
    const parameters = normalizeProviderToolParameterSchema(
      tool.name,
      tool.parameters
    ) as typeof tool.parameters;
    if (parameters === tool.parameters) return tool;
    changed = true;
    return { ...tool, parameters };
  });
  return changed ? { ...context, tools } : context;
}
