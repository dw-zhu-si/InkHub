import { describe, expect, it } from "vitest";
import { createZip, readZip } from "./zip";

describe("cloud backup zip", () => {
  it("round-trips utf8 files including nested paths", () => {
    const zip = createZip([
      { name: "items/book/a/deepwrite.json", data: Buffer.from('{"title":"测试"}', "utf8") },
      { name: "items/book/a/docs/body.md", data: Buffer.from("# 正文\n", "utf8") }
    ]);
    const files = readZip(zip);
    expect(files.get("items/book/a/deepwrite.json")?.toString("utf8")).toBe(
      '{"title":"测试"}'
    );
    expect(files.get("items/book/a/docs/body.md")?.toString("utf8")).toBe("# 正文\n");
  });
});
