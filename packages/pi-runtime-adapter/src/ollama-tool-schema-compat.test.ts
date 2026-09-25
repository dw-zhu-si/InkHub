import { describe, expect, it } from "vitest";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type {
  AgentProviderRuntimeConfig,
  WorkspaceRuntimeContext
} from "@deepwrite/contracts";
import { buildProviderRuntime } from "./index";
import {
  isOllamaProviderName,
  resolveOllamaToolSchemaProfile,
  sanitizeOllamaToolSchema,
  sanitizeOllamaWritingToolSchema
} from "./ollama-tool-schema-compat";

function workspaceContext(
  kind: "shortWorkspace" | "scriptWorkspace" | "longWorkspace"
): WorkspaceRuntimeContext {
  return { [kind]: {} } as unknown as WorkspaceRuntimeContext;
}

function writingGrammarTool(): AgentTool {
  const parameters = Type.Object({
    direct_text: Type.String({ minLength: 1, maxLength: 200_000 }),
    pattern: Type.Optional(Type.String({ maxLength: 256 })),
    replacements: Type.Array(
      Type.Object({
        original_text: Type.String({ minLength: 1, maxLength: 2_400 }),
        new_text: Type.String({ maxLength: 20_000 })
      }),
      { minItems: 1, maxItems: 100, uniqueItems: true }
    )
  });
  return {
    name: "edit_writing_text",
    label: "Edit writing text",
    description: "Edit writing text with exact replacements.",
    parameters,
    execute: async () => ({
      content: [{ type: "text", text: "ok" }],
      details: {}
    })
  };
}

async function captureToolParameters(
  config: AgentProviderRuntimeConfig,
  profile: "default" | "writing-workspace"
): Promise<Record<string, unknown>> {
  const tool = writingGrammarTool();
  const { model, streamFn } = buildProviderRuntime(config, 0.7, "off", {
    ollamaToolSchemaProfile: profile
  });
  let payload: unknown;
  const stream = await streamFn(
    model,
    {
      systemPrompt: "Use the available tool.",
      messages: [{ role: "user", content: "Edit the text.", timestamp: 0 }],
      tools: [tool]
    },
    {
      onPayload: (value) => {
        payload = value;
        throw new Error("payload captured");
      }
    }
  );
  await stream.result();
  return (
    payload as {
      tools: Array<{ function: { parameters: Record<string, unknown> } }>;
    }
  ).tools[0]!.function.parameters;
}

describe("Ollama tool schema compatibility", () => {
  it("selects the writing profile only for writing workspaces", () => {
    expect(resolveOllamaToolSchemaProfile()).toBe("default");
    expect(resolveOllamaToolSchemaProfile({})).toBe("default");
    expect(
      resolveOllamaToolSchemaProfile(workspaceContext("shortWorkspace"))
    ).toBe("writing-workspace");
    expect(
      resolveOllamaToolSchemaProfile(workspaceContext("scriptWorkspace"))
    ).toBe("writing-workspace");
    expect(
      resolveOllamaToolSchemaProfile(workspaceContext("longWorkspace"))
    ).toBe("writing-workspace");
  });

  it("recognizes only the explicit Ollama provider name", () => {
    expect(isOllamaProviderName("ollama")).toBe(true);
    expect(isOllamaProviderName(" OLLAMA ")).toBe(true);
    expect(isOllamaProviderName("custom")).toBe(false);
    expect(isOllamaProviderName("ollama-compatible")).toBe(false);
  });

  it("keeps the default sanitizer limited to the known nested maxLength bug", () => {
    const schema = {
      type: "object",
      properties: {
        direct_text: { type: "string", maxLength: 200_000 },
        nested: {
          type: "object",
          properties: {
            text: { type: "string", minLength: 1, maxLength: 2_000 }
          }
        }
      }
    };
    const sanitized = sanitizeOllamaToolSchema(schema) as typeof schema;

    expect(sanitized.properties.direct_text.maxLength).toBe(200_000);
    expect(sanitized.properties.nested.properties.text).not.toHaveProperty(
      "maxLength"
    );
    expect(schema.properties.nested.properties.text.maxLength).toBe(2_000);
  });

  it("removes writing grammar constraints without deleting same-named parameters", () => {
    const schema = {
      type: "object",
      default: {
        pattern: "literal default value",
        maxItems: 3
      },
      properties: {
        pattern: { type: "string", maxLength: 256 },
        maxItems: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: { type: "string", pattern: "^[A-Z]+$" }
        }
      }
    };
    const sanitized = sanitizeOllamaWritingToolSchema(schema) as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect(sanitized.properties).toHaveProperty("pattern");
    expect(sanitized.properties).toHaveProperty("maxItems");
    expect(sanitized.properties.pattern).not.toHaveProperty("maxLength");
    const maxItemsParameter = sanitized.properties.maxItems;
    if (!maxItemsParameter) throw new Error("Missing maxItems test parameter.");
    expect(maxItemsParameter).toMatchObject({
      type: "array",
      minItems: 1
    });
    expect(maxItemsParameter).not.toHaveProperty("maxItems");
    expect(maxItemsParameter).not.toHaveProperty("uniqueItems");
    expect(maxItemsParameter.items as Record<string, unknown>).not.toHaveProperty(
      "pattern"
    );
    expect(sanitized).toMatchObject({
      default: {
        pattern: "literal default value",
        maxItems: 3
      }
    });
    expect(schema.properties.maxItems.maxItems).toBe(100);
  });

  it("applies the writing profile only to Ollama provider payloads", async () => {
    const config: AgentProviderRuntimeConfig = {
      id: "local-writing-model",
      label: "Local writing model",
      provider: "ollama",
      modelId: "writer-model",
      api: "openai-completions",
      baseUrl: "https://ollama.example.test/v1",
      reasoning: false,
      defaultThinkingLevel: "off",
      thinkingLevelOptions: ["low", "medium", "high"],
      temperatureOptions: [0.2, 0.7, 1.2],
      apiKey: ""
    };

    const writingParameters = await captureToolParameters(
      config,
      "writing-workspace"
    );
    const writingSchema = JSON.stringify(writingParameters);
    expect(writingSchema).not.toContain('"maxLength"');
    expect(writingSchema).not.toContain('"maxItems"');
    expect(writingSchema).not.toContain('"uniqueItems"');
    expect(writingSchema).toContain('"minLength"');
    expect(writingSchema).toContain('"minItems"');
    expect(writingParameters).toMatchObject({
      properties: {
        pattern: { type: "string" },
        replacements: {
          items: {
            properties: {
              original_text: { type: "string", minLength: 1 },
              new_text: { type: "string" }
            }
          }
        }
      }
    });

    const defaultParameters = await captureToolParameters(config, "default");
    expect(defaultParameters).toMatchObject({
      properties: {
        direct_text: { maxLength: 200_000 },
        replacements: { maxItems: 100, uniqueItems: true }
      }
    });

    const customParameters = await captureToolParameters(
      { ...config, provider: "custom", apiKey: "test-only" },
      "writing-workspace"
    );
    expect(customParameters).toMatchObject({
      properties: {
        direct_text: { maxLength: 200_000 },
        replacements: {
          maxItems: 100,
          uniqueItems: true,
          items: {
            properties: {
              original_text: { maxLength: 2_400 },
              new_text: { maxLength: 20_000 }
            }
          }
        }
      }
    });
  });
});
