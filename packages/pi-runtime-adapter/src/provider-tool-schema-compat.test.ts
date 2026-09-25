import { describe, expect, it } from "vitest";
import { Type } from "typebox";
import type { Context } from "@earendil-works/pi-ai";
import {
  enforceProviderToolSchemaCompatibility,
  normalizeProviderToolParameterSchema
} from "./provider-tool-schema-compat";

describe("provider tool schema compatibility", () => {
  it("keeps object-root schemas unchanged", () => {
    const schema = Type.Object({ query: Type.String() });
    expect(normalizeProviderToolParameterSchema("search", schema)).toBe(
      schema
    );
  });

  it.each(["anyOf", "oneOf", "allOf"] as const)(
    "adds an object root to an object-only %s schema without mutating it",
    (keyword) => {
      const schema = {
        [keyword]: [
          { type: "object", properties: { left: { type: "string" } } },
          { type: "object", properties: { right: { type: "string" } } }
        ]
      };
      const normalized = normalizeProviderToolParameterSchema(
        "object_union",
        schema
      );

      expect(normalized).toEqual({ ...schema, type: "object" });
      expect(normalized).not.toBe(schema);
      expect(schema).not.toHaveProperty("type");
    }
  );

  it("rejects non-object and mixed-root schemas locally", () => {
    expect(() =>
      normalizeProviderToolParameterSchema("text_tool", Type.String())
    ).toThrow(/text_tool.*type: "object"/u);
    expect(() =>
      normalizeProviderToolParameterSchema("mixed_tool", {
        anyOf: [{ type: "object" }, { type: "string" }]
      })
    ).toThrow(/mixed_tool.*type: "object"/u);
    expect(() => normalizeProviderToolParameterSchema("null_tool", null)).toThrow(
      /null_tool.*JSON Schema/u
    );
  });

  it("normalizes every tool at the provider boundary and preserves local schemas", () => {
    const union = Type.Union([
      Type.Object({ domain: Type.Literal("left") }),
      Type.Object({ domain: Type.Literal("right") })
    ]);
    const context = {
      systemPrompt: "test",
      messages: [],
      tools: [
        {
          name: "union_tool",
          description: "test",
          parameters: union
        }
      ]
    } satisfies Context;

    const compatible = enforceProviderToolSchemaCompatibility(context);
    expect(compatible.tools?.[0]?.parameters).toMatchObject({
      type: "object",
      anyOf: expect.any(Array)
    });
    expect(union).not.toHaveProperty("type");
  });
});
