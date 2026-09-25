import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { safeLongExportName, writeLongManuscriptExport } from "./long-manuscript-export";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("long manuscript folder export", () => {
  it("uses display labels, creates list folders, and resolves duplicate names", async () => {
    const parent = await mkdtemp(join(tmpdir(), "deepwrite-long-export-"));
    temporaryDirectories.push(parent);
    const result = await writeLongManuscriptExport(parent, {
      title: "雾港:/长篇",
      sections: ["worldbuilding", "manuscript"],
      files: [
        { path: ["世界观", "势力", "巡夜司"], content: "第一份设定" },
        { path: ["世界观", "势力", "巡夜司"], content: "第二份设定" },
        { path: ["正文", "第一节"], content: "正文内容" }
      ]
    });

    expect(result.fileCount).toBe(3);
    expect(result.directoryPath).toContain("雾港 长篇-导出");
    expect((await readdir(join(result.directoryPath, "世界观", "势力"))).sort()).toEqual([
      "巡夜司 (2).txt",
      "巡夜司.txt"
    ]);
    expect(
      await readFile(join(result.directoryPath, "正文", "第一节.txt"), "utf8")
    ).toBe("\ufeff正文内容");
  });

  it("sanitizes reserved and unsafe filename characters", () => {
    expect(safeLongExportName('  第一节:/\\*?<>|" ...  ')).toBe("第一节");
    expect(safeLongExportName("CON", "备用名")).toBe("备用名");
  });

  it("cleans the sibling staging directory when an export fails midway", async () => {
    const parent = await mkdtemp(join(tmpdir(), "deepwrite-long-export-failure-"));
    temporaryDirectories.push(parent);

    await expect(
      writeLongManuscriptExport(parent, {
        title: "失败清理",
        sections: ["manuscript"],
        files: [
          { path: ["正文", "冲突"], content: "已经写入 staging 的内容" },
          { path: ["正文", "冲突.txt", "下一节"], content: "目录与文件冲突" }
        ]
      })
    ).rejects.toThrow();

    expect(await readdir(parent)).toEqual([]);
  });

  it("commits concurrent same-title exports to distinct complete directories", async () => {
    const parent = await mkdtemp(join(tmpdir(), "deepwrite-long-export-concurrent-"));
    temporaryDirectories.push(parent);
    const exports = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        writeLongManuscriptExport(parent, {
          title: "并发长篇",
          sections: ["manuscript"],
          files: [{ path: ["正文", "第一节"], content: `正文 ${index}` }]
        })
      )
    );

    expect(new Set(exports.map((result) => result.directoryPath)).size).toBe(8);
    expect((await readdir(parent)).every((name) => !name.startsWith(".inkhub-long-export-"))).toBe(true);
    await Promise.all(
      exports.map(async (result, index) => {
        expect(await readFile(join(result.directoryPath, "正文", "第一节.txt"), "utf8"))
          .toBe(`\ufeff正文 ${index}`);
      })
    );
  });
});
