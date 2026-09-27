import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InkHubAssetStore } from "./inkhub-agent-skill-registry";
import { InkHubNovelKnowledgeService } from "./inkhub-novel-knowledge";

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

async function createFixture(): Promise<{
  root: string;
  store: InkHubAssetStore;
}> {
  const root = await mkdtemp(join(tmpdir(), "inkhub-assets-"));
  temporaryRoots.push(root);
  const project = join(root, "Desktop", "小说", "长篇", "技能大赛只是书名");
  await mkdir(join(project, "chapters"), { recursive: true });
  await writeFile(join(project, "chapters", "第一章.md"), "第一章\n雨落在旧城。", "utf8");
  await writeFile(join(project, "设定.txt"), "只作为小说资料读取。", "utf8");
  const store = new InkHubAssetStore(join(root, "user-data"), root);
  await store.addNovelRoot(join(root, "Desktop", "小说"));
  return {
    root,
    store
  };
}

describe("InkHubAssetStore", () => {
  it("does not scan a conventional novel folder until the user registers it", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-unregistered-root-"));
    temporaryRoots.push(root);
    const conventionalRoot = join(root, "Desktop", "小说");
    await mkdir(join(conventionalRoot, "长篇", "未授权小说"), { recursive: true });
    await writeFile(join(conventionalRoot, "长篇", "未授权小说", "第一章.md"), "不应被自动扫描", "utf8");
    const store = new InkHubAssetStore(join(root, "user-data"), root);

    await expect(store.listNovels()).resolves.toMatchObject({ roots: [], entries: [] });

    await store.addNovelRoot(conventionalRoot);
    await expect(store.listNovels()).resolves.toMatchObject({
      roots: [expect.objectContaining({ label: "小说", available: true })],
      entries: [expect.objectContaining({ title: "未授权小说" })]
    });
  });

  it("keeps the library empty after the last registered root is removed", async () => {
    const { store } = await createFixture();
    const before = await store.listNovels();
    expect(before.roots).toHaveLength(1);

    const after = await store.removeNovelRoot(before.roots[0]!.id);
    expect(after.roots).toEqual([]);
    expect(after.entries).toEqual([]);
    await expect(store.listNovels()).resolves.toMatchObject({ roots: [], entries: [] });
  });

  it("keeps the production SQLite index out of Electron's main thread", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-worker-boundary-"));
    temporaryRoots.push(root);
    const userData = join(root, "user-data");

    new InkHubAssetStore(
      userData,
      root,
      [],
      join(root, "Desktop", "小说"),
      join(root, "compiled-index-worker.js")
    );

    await expect(access(join(userData, "indexes", "novels", "knowledge.sqlite")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("discovers novels from the real filesystem and keeps Markdown as content", async () => {
    const { store } = await createFixture();
    const snapshot = await store.listNovels();

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      title: "技能大赛只是书名",
      category: "长篇",
      documentCount: 2,
      hasAgentRules: false,
      hasTraeAssets: false
    });
    const documents = await store.listNovelDocuments(snapshot.entries[0]!.id);
    expect(documents.documents.map((document) => document.relativePath).sort())
      .toEqual(["chapters/第一章.md", "设定.txt"]);
  });

  it("previews text read-only and blocks traversal outside the novel", async () => {
    const { root, store } = await createFixture();
    await writeFile(join(root, "secret.txt"), "not available", "utf8");
    const entry = (await store.listNovels()).entries[0]!;

    await expect(store.readNovelDocument(entry.id, "chapters/第一章.md"))
      .resolves.toMatchObject({ readOnly: true, content: "第一章\n雨落在旧城。" });
    await expect(store.readNovelDocument(entry.id, "../../../../secret.txt"))
      .rejects.toThrow(/小说目录/u);
  });

  it("discovers a directly selected novel folder and bounds large previews", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-direct-novel-"));
    temporaryRoots.push(root);
    const novel = join(root, "我的单部小说");
    await mkdir(join(novel, "chapters"), { recursive: true });
    const chapter = join(novel, "chapters", "正文.txt");
    await writeFile(chapter, "开篇", "utf8");
    await truncate(chapter, 2_000_000);
    const store = new InkHubAssetStore(join(root, "user-data"), root);
    await store.addNovelRoot(novel);

    const snapshot = await store.listNovels();
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]?.title).toBe("我的单部小说");
    await expect(store.readNovelDocument(snapshot.entries[0]!.id, "chapters/正文.txt"))
      .resolves.toMatchObject({ truncated: true, readOnly: true });
  });

  it("rejects a project replaced by a symlink after indexing", async () => {
    const { root, store } = await createFixture();
    const entry = (await store.listNovels()).entries[0]!;
    const original = entry.path;
    const moved = `${original}-moved`;
    const outside = join(root, "outside");
    await rename(original, moved);
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "secret.txt"), "should stay outside", "utf8");
    await symlink(outside, original, "dir");

    await expect(store.readNovelDocument(entry.id, "secret.txt"))
      .rejects.toThrow(/替换|路径/u);
  });

  it("fails closed when asset settings are corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-corrupt-settings-"));
    temporaryRoots.push(root);
    const userData = join(root, "user-data");
    await mkdir(join(userData, "config"), { recursive: true });
    await writeFile(join(userData, "config", "inkhub-assets.json"), "{not-json", "utf8");
    const store = new InkHubAssetStore(userData, root, []);
    await expect(store.listNovels()).rejects.toThrow(/已损坏|停止自动覆盖/u);
  });

  it("reports local skills as missing when a profile has no matching assets", async () => {
    const { store } = await createFixture();
    const snapshot = await store.listSkills();
    expect(snapshot.skills.length).toBeGreaterThan(30);
    expect(snapshot.skills.every((skill) => skill.status === "missing")).toBe(true);
    expect(snapshot.skills.every((skill) => skill.enabled === false)).toBe(true);
  });

  it("installs a complete private bundle and keeps the verified copy usable when the source disappears", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-skill-install-"));
    temporaryRoots.push(root);
    const skillRoot = join(root, "local-skills", "outline");
    const skillContent = "# 大纲精修\n\n按因果链检查小说大纲。\n";
    await mkdir(join(skillRoot, "references"), { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), skillContent, "utf8");
    await writeFile(join(skillRoot, "references", "guide.md"), "完整 bundle 资源", "utf8");
    const expectedSha256 = createHash("sha256").update(skillContent).digest("hex");
    const userData = join(root, "user-data");
    const store = new InkHubAssetStore(userData, root, [{
      id: "novel-outline-refine",
      title: "大纲精修",
      source: "codex",
      path: "local-skills/outline/SKILL.md",
      sha256: expectedSha256,
      license: "private-local",
      defaultEnabled: true
    }]);

    await expect(store.listSkills()).resolves.toMatchObject({
      skills: [expect.objectContaining({ installState: "available", enabled: false })]
    });
    const installed = await store.installSkills();
    expect(installed.skills[0]).toMatchObject({
      installState: "installed",
      runtimeState: "ready",
      enabled: true,
      skillKind: "plot"
    });
    const settings = JSON.parse(await readFile(join(userData, "config", "inkhub-assets.json"), "utf8")) as {
      installedSkillBundles: Record<string, string>;
    };
    const bundle = settings.installedSkillBundles["novel-outline-refine"]!;
    await expect(readFile(join(userData, "capabilities", "novel-outline-refine", bundle, "references", "guide.md"), "utf8"))
      .resolves.toBe("完整 bundle 资源");

    await rm(skillRoot, { recursive: true, force: true });
    await expect(store.readSkill("novel-outline-refine")).resolves.toMatchObject({
      content: skillContent,
      readOnly: true
    });
    await expect(store.attachedSkills()).resolves.toEqual({
      skills: [{
        id: "inkhub:novel-outline-refine",
        title: "大纲精修",
        content: skillContent,
        kind: "plot",
        source: "attached-skill"
      }]
    });

    await store.setSkillEnabled("novel-outline-refine", false);
    await expect(store.attachedSkills()).resolves.toEqual({ skills: [] });
  });

  it("detects tampering anywhere in an installed bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-skill-tamper-"));
    temporaryRoots.push(root);
    const skillRoot = join(root, "skills", "safe");
    const skillContent = "# 安全 Skill\n\n完整读取引用。\n";
    await mkdir(join(skillRoot, "references"), { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), skillContent, "utf8");
    await writeFile(join(skillRoot, "references", "guide.md"), "可信内容", "utf8");
    const hash = createHash("sha256").update(skillContent).digest("hex");
    const userData = join(root, "user-data");
    const store = new InkHubAssetStore(userData, root, [{
      id: "safe-skill", title: "安全 Skill", source: "codex", path: "skills/safe/SKILL.md",
      sha256: hash, license: "test", defaultEnabled: true
    }]);
    await store.installSkills();
    const settings = JSON.parse(await readFile(join(userData, "config", "inkhub-assets.json"), "utf8")) as { installedSkillBundles: Record<string, string> };
    await writeFile(
      join(userData, "capabilities", "safe-skill", settings.installedSkillBundles["safe-skill"]!, "references", "guide.md"),
      "已被篡改",
      "utf8"
    );
    await expect(store.listSkills()).resolves.toMatchObject({
      skills: [expect.objectContaining({ installState: "available", runtimeState: "disabled", enabled: false })]
    });
    await expect(store.readSkill("safe-skill")).rejects.toThrow(/完整性/u);
  });

  it("rejects credential-shaped files from skill bundles", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-skill-secret-"));
    temporaryRoots.push(root);
    const skillRoot = join(root, "skills", "unsafe");
    const skillContent = "# 不安全 Skill\n";
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, "SKILL.md"), skillContent, "utf8");
    await writeFile(join(skillRoot, ".env"), "SECRET=test-placeholder", "utf8");
    const store = new InkHubAssetStore(join(root, "user-data"), root, [{
      id: "unsafe-skill", title: "不安全 Skill", source: "codex", path: "skills/unsafe/SKILL.md",
      sha256: createHash("sha256").update(skillContent).digest("hex"), license: "test"
    }]);
    await expect(store.installSkills()).rejects.toThrow(/潜在凭证/u);
  });

  it("serializes concurrent skill enable mutations without losing either update", async () => {
    const root = await mkdtemp(join(tmpdir(), "inkhub-skill-concurrency-"));
    temporaryRoots.push(root);
    const definitions = await Promise.all(["one", "two"].map(async (id) => {
      const content = `# ${id}\n`;
      const path = `skills/${id}/SKILL.md`;
      await mkdir(join(root, "skills", id), { recursive: true });
      await writeFile(join(root, path), content, "utf8");
      return { id, title: id, source: "codex" as const, path, sha256: createHash("sha256").update(content).digest("hex"), license: "test" };
    }));
    const store = new InkHubAssetStore(join(root, "user-data"), root, definitions);
    await store.installSkills();
    await Promise.all([
      store.setSkillEnabled("one", true),
      store.setSkillEnabled("two", true)
    ]);
    const attached = await store.attachedSkills();
    expect(attached.skills.map((skill) => skill.id).sort()).toEqual(["inkhub:one", "inkhub:two"]);
  });

  it("returns a repair re-audit diff after confirmed transactional writeback", async () => {
    const { store } = await createFixture();
    const entry = (await store.listNovels()).entries[0]!;
    await store.buildNovelIndex(entry.id);
    const chapter = (await store.listNovelChapters(entry.id, 0, 10)).chapters[0]!;
    const before = await store.runNovelQualityCheck(entry.id);
    expect(before.issues.some((issue) => issue.rule === "very-short-chapter")).toBe(true);

    const result = await store.applyNovelChapterRepairs({
      entryId: entry.id,
      confirmWrite: true,
      repairs: [{
        chapterId: chapter.id,
        expectedSourceRevision: chapter.sourceRevision,
        content: `第一章\n${"修复后的完整正文。".repeat(40)}`
      }]
    });

    expect(result.reaudit).toMatchObject({ beforeIssueCount: 1, afterIssueCount: 0 });
    expect(result.reaudit?.resolvedIssueIds).toContain(`short:${chapter.id}`);
  });

  it("reads cached library index status without rescanning every novel source", async () => {
    const { store } = await createFixture();
    const entry = (await store.listNovels()).entries[0]!;
    await store.buildNovelIndex(entry.id);
    const freshness = vi.spyOn(
      InkHubNovelKnowledgeService.prototype,
      "refreshSourceFreshness"
    );

    await expect(store.getNovelIndex(entry.id, false)).resolves.toMatchObject({
      entryId: entry.id,
      status: "ready"
    });
    expect(freshness).not.toHaveBeenCalled();
  });

  it("coalesces repeated freshness checks during one reader interaction burst", async () => {
    const { root, store } = await createFixture();
    const entry = (await store.listNovels()).entries[0]!;
    await store.buildNovelIndex(entry.id);
    const reopenedStore = new InkHubAssetStore(join(root, "user-data"), root);
    const reopenedEntry = (await reopenedStore.listNovels()).entries[0]!;
    const freshness = vi.spyOn(
      InkHubNovelKnowledgeService.prototype,
      "refreshSourceFreshness"
    );

    const summary = await reopenedStore.getNovelIndex(reopenedEntry.id);
    const catalog = await reopenedStore.listNovelChapters(reopenedEntry.id, 0, 10);
    await reopenedStore.readNovelChapter(reopenedEntry.id, catalog.chapters[0]!.id, 0, 1_000);
    expect(summary.status).toBe("ready");
    expect(freshness).toHaveBeenCalledTimes(1);
  });
});
