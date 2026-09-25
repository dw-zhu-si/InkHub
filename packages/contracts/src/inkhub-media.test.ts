import { describe, expect, it } from "vitest";
import {
  InkHubCoverStyleIdSchema,
  InkHubMediaRequestSchema
} from "./inkhub-media";

describe("InkHub media contracts", () => {
  it("keeps the cover style catalog finite and unique", () => {
    expect(InkHubCoverStyleIdSchema.options).toHaveLength(24);
    expect(new Set(InkHubCoverStyleIdSchema.options).size).toBe(24);
  });

  it("requires an explicit cover style before a billable generation request", () => {
    const base = {
      operation: "generateCover",
      entryId: "novel-1",
      modelId: "image-model",
      platformId: "web-fiction",
      title: "测试小说",
      author: "",
      prompt: "一座孤城",
      confirmBillable: true
    } as const;
    expect(InkHubMediaRequestSchema.safeParse(base).success).toBe(false);
    expect(InkHubMediaRequestSchema.safeParse({ ...base, styleId: "minimal-symbolic" }).success).toBe(true);
  });
});
