import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_EXTERNAL_SKILL_CANDIDATES,
  MAX_EXTERNAL_SKILL_DIRECTORIES,
  MAX_EXTERNAL_SKILL_FILE_BYTES,
  readExternalSkills
} from "./external-skill-import";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-external-skills-"));
  roots.push(root);
  return root;
}

function skill(name: string): string {
  return `---\nname: ${name}\ndescription: ${name}说明\n---\n\n# ${name}\n\n执行步骤。\n`;
}

describe("readExternalSkills", () => {
  it("loads a single SKILL.md and preserves its complete text", async () => {
    const root = await temporaryRoot();
    const path = join(root, "SKILL.md");
    const content = skill("单项技能");
    await writeFile(path, content, "utf8");

    const result = await readExternalSkills("file", path);

    expect(result.candidates).toEqual([
      { title: "单项技能", description: "单项技能说明", content }
    ]);
    expect(result.scanned).toBe(1);
  });

  it("only loads SKILL.md files in direct child directories", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "first"));
    await mkdir(join(root, "nested", "child"), { recursive: true });
    await mkdir(join(root, "invalid"));
    await writeFile(join(root, "first", "SKILL.md"), skill("第一项"), "utf8");
    await writeFile(join(root, "nested", "child", "SKILL.md"), skill("嵌套项"), "utf8");
    await writeFile(join(root, "invalid", "SKILL.md"), "not a skill", "utf8");
    await writeFile(join(root, "SKILL.md"), skill("根技能"), "utf8");

    const result = await readExternalSkills("directory", root);

    expect(result.candidates.map(({ title }) => title)).toEqual(["第一项"]);
    expect(result.scanned).toBe(2);
    expect(result.skipped.invalidFormat).toBe(1);
  });

  it("rejects a selected file whose basename is not SKILL.md", async () => {
    const root = await temporaryRoot();
    const path = join(root, "other.md");
    await writeFile(path, skill("错误文件名"), "utf8");

    const result = await readExternalSkills("file", path);

    expect(result.candidates).toEqual([]);
    expect(result.skipped.invalidName).toBe(1);
  });

  it("rejects an oversized SKILL.md by byte size before importing content", async () => {
    const root = await temporaryRoot();
    const path = join(root, "SKILL.md");
    await writeFile(path, skill("超大技能"), "utf8");
    await truncate(path, MAX_EXTERNAL_SKILL_FILE_BYTES + 1);

    const result = await readExternalSkills("file", path);

    expect(result.candidates).toEqual([]);
    expect(result.scanned).toBe(1);
    expect(result.skipped.contentTooLong).toBe(1);
    expect(result.skipped.unreadable).toBe(0);
  });

  it("fails closed when a skills root contains too many direct directories", async () => {
    const root = await temporaryRoot();
    await Promise.all(
      Array.from({ length: MAX_EXTERNAL_SKILL_DIRECTORIES + 1 }, (_, index) =>
        mkdir(join(root, `skill-${String(index).padStart(4, "0")}`))
      )
    );

    await expect(readExternalSkills("directory", root)).rejects.toThrow(
      `最多支持 ${MAX_EXTERNAL_SKILL_DIRECTORIES} 个直接子目录`
    );
  });

  it("fails closed instead of returning an oversized candidate batch", async () => {
    const root = await temporaryRoot();
    await Promise.all(
      Array.from({ length: MAX_EXTERNAL_SKILL_CANDIDATES + 1 }, async (_, index) => {
        const directory = join(root, `skill-${String(index).padStart(4, "0")}`);
        await mkdir(directory);
        await writeFile(join(directory, "SKILL.md"), skill(`技能${index}`), "utf8");
      })
    );

    await expect(readExternalSkills("directory", root)).rejects.toThrow(
      `一次最多导入 ${MAX_EXTERNAL_SKILL_CANDIDATES} 个 Skill`
    );
  });
});
