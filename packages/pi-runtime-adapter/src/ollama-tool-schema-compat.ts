import type { WorkspaceRuntimeContext } from "@deepwrite/contracts";
import type { Context } from "@earendil-works/pi-ai";

const GRAMMAR_REPETITION_THRESHOLD = 2_000;
const WRITING_WORKSPACE_OMITTED_KEYWORDS = new Set([
  "maxLength",
  "maxItems",
  "pattern",
  "uniqueItems"
]);
const SCHEMA_MAP_KEYWORDS = new Set([
  "$defs",
  "definitions",
  "dependencies",
  "dependentSchemas",
  "patternProperties",
  "properties"
]);
const PROPERTY_SCHEMA_MAP_KEYWORDS = new Set([
  "patternProperties",
  "properties"
]);
const SCHEMA_CHILD_KEYWORDS = new Set([
  "additionalItems",
  "additionalProperties",
  "contains",
  "contentSchema",
  "else",
  "if",
  "items",
  "not",
  "propertyNames",
  "then",
  "unevaluatedItems",
  "unevaluatedProperties"
]);
const SCHEMA_ARRAY_KEYWORDS = new Set([
  "allOf",
  "anyOf",
  "oneOf",
  "prefixItems"
]);

export type OllamaToolSchemaProfile = "default" | "writing-workspace";

export interface ProviderRuntimeCompatibilityOptions {
  ollamaToolSchemaProfile?: OllamaToolSchemaProfile;
}

type SchemaKeywordFilter = (
  key: string,
  schemaNode: Record<string, unknown>,
  propertyDepth: number
) => boolean;

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSchemaData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSchemaData);
  if (!isSchemaRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneSchemaData(child)])
  );
}

function cloneToolSchema(
  value: unknown,
  shouldOmitKeyword: SchemaKeywordFilter,
  propertyDepth = 0
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      cloneToolSchema(item, shouldOmitKeyword, propertyDepth)
    );
  }
  if (!isSchemaRecord(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (shouldOmitKeyword(key, value, propertyDepth)) continue;
    if (SCHEMA_MAP_KEYWORDS.has(key) && isSchemaRecord(child)) {
      const childDepth = PROPERTY_SCHEMA_MAP_KEYWORDS.has(key)
        ? propertyDepth + 1
        : propertyDepth;
      output[key] = Object.fromEntries(
        Object.entries(child).map(([schemaName, childSchema]) => [
          schemaName,
          cloneToolSchema(childSchema, shouldOmitKeyword, childDepth)
        ])
      );
      continue;
    }
    if (SCHEMA_CHILD_KEYWORDS.has(key) || SCHEMA_ARRAY_KEYWORDS.has(key)) {
      output[key] = cloneToolSchema(
        child,
        shouldOmitKeyword,
        key === "items" ? propertyDepth + 1 : propertyDepth
      );
      continue;
    }
    output[key] = cloneSchemaData(child);
  }
  return output;
}

export function isOllamaProviderName(provider: string): boolean {
  return provider.trim().toLowerCase() === "ollama";
}

export function resolveOllamaToolSchemaProfile(
  workspaceContext?: WorkspaceRuntimeContext
): OllamaToolSchemaProfile {
  return workspaceContext?.shortWorkspace ||
    workspaceContext?.scriptWorkspace ||
    workspaceContext?.longWorkspace
    ? "writing-workspace"
    : "default";
}

/**
 * llama.cpp can reject nested strings whose maxLength reaches its grammar
 * repetition threshold. This provider-only clone keeps local validation intact.
 */
export function sanitizeOllamaToolSchema(value: unknown): unknown {
  return cloneToolSchema(
    value,
    (key, schemaNode, propertyDepth) =>
      key === "maxLength" &&
      schemaNode.type === "string" &&
      propertyDepth > 1 &&
      typeof schemaNode.maxLength === "number" &&
      schemaNode.maxLength >= GRAMMAR_REPETITION_THRESHOLD
  );
}

/**
 * Writing workspaces expose larger tool sets and schemas. Their Ollama transport
 * copy omits validation-only keywords that expand or destabilize tool grammars;
 * the original AgentTool schema remains authoritative during tool execution.
 */
export function sanitizeOllamaWritingToolSchema(value: unknown): unknown {
  return cloneToolSchema(value, (key) =>
    WRITING_WORKSPACE_OMITTED_KEYWORDS.has(key)
  );
}

export function applyOllamaToolSchemaCompatibility(
  context: Context,
  provider: string,
  profile: OllamaToolSchemaProfile = "default"
): Context {
  if (!isOllamaProviderName(provider) || !context.tools?.length) return context;
  const sanitize =
    profile === "writing-workspace"
      ? sanitizeOllamaWritingToolSchema
      : sanitizeOllamaToolSchema;
  return {
    ...context,
    tools: context.tools.map((tool) => ({
      ...tool,
      parameters: sanitize(tool.parameters) as typeof tool.parameters
    }))
  };
}
