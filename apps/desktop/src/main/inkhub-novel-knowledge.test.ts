import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InkHubNovelKnowledgeService } from "./inkhub-novel-knowledge";
import { buildDocx, buildEpub } from "./short-manuscript-export";

const repairFsInterception = vi.hoisted(() => ({
  afterRename: undefined as
    | ((source: string, destination: string) => Promise<void> | void)
    | undefined
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    async rename(source: Parameters<typeof actual.rename>[0], destination: Parameters<typeof actual.rename>[1]) {
      await actual.rename(source, destination);
      await repairFsInterception.afterRename?.(String(source), String(destination));
    }
  };
});

const temporaryRoots: string[] = [];

afterEach(async () => {
  repairFsInterception.afterRename = undefined;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; novel: string; service: InkHubNovelKnowledgeService }> {
  const root = await mkdtemp(join(tmpdir(), "inkhub-novel-knowledge-"));
  temporaryRoots.push(root);
  const novel = join(root, "长篇", "雨城");
  await mkdir(join(novel, "正文"), { recursive: true });
  return {
    root,
    novel,
    service: new InkHubNovelKnowledgeService(join(root, "user-data", "novel-index"))
  };
}

describe("InkHubNovelKnowledgeService", () => {
  it("从合订文件拆分章节，自然排序并完整重组跨页 Unicode 内容", async () => {
    const { novel, service } = await fixture();
    await writeFile(join(novel, "正文", "合订本.md"), [
      "# 第1章 入夜",
      "雨落在旧城🌧️。",
      "# 第2章 来信",
      "他拆开了那封信。"
    ].join("\n"), "utf8");
    await writeFile(join(novel, "正文", "第10章.txt"), "第十章 回声\n城外传来回声。", "utf8");
    await writeFile(join(novel, "正文", "第2章.txt"), "第二章 潮声\n潮声越来越近。", "utf8");

    const summary = await service.build({ entryId: "novel-1", title: "雨城", entryPath: novel });
    expect(summary.status).toBe("ready");
    expect(summary.contentComplete).toBe(true);
    const catalog = service.listChapters("novel-1", 0, 20);
    expect(catalog.chapters.map((chapter) => chapter.title)).toEqual([
      "第1章 入夜",
      "第2章 来信",
      "第二章 潮声",
      "第十章 回声"
    ]);

    const chapterId = catalog.chapters[0]!.id;
    const pages: string[] = [];
    let offset = 0;
    do {
      const page = service.readChapter("novel-1", chapterId, offset, 5);
      pages.push(page.content);
      offset = page.nextOffset ?? -1;
    } while (offset >= 0);
    expect(pages.join("")).toContain("雨落在旧城🌧️。");
  });

  it("先按卷自然排序，再按卷内章节排序，并识别合订文件中的卷标题", async () => {
    const { novel, service } = await fixture();
    await mkdir(join(novel, "正文", "第二卷：潮生"), { recursive: true });
    await mkdir(join(novel, "正文", "第一卷：雾起"), { recursive: true });
    await writeFile(join(novel, "正文", "第二卷：潮生", "第1章.md"), "# 第1章 归港\n潮水把船送回港口。", "utf8");
    await writeFile(join(novel, "正文", "第一卷：雾起", "第2章.md"), "# 第2章 追灯\n他们沿长街追逐灯影。", "utf8");
    await writeFile(join(novel, "正文", "第一卷：雾起", "第1章.md"), "# 第1章 入城\n晨雾笼罩着城门。", "utf8");
    await writeFile(join(novel, "正文", "第三卷合订.md"), [
      "# 第三卷：雪落",
      "## 第1章 旧约",
      "旧约在雪夜重新出现。",
      "## 第2章 重逢",
      "故人终于在桥上重逢。"
    ].join("\n"), "utf8");

    await service.build({ entryId: "novel-volumes", title: "分卷测试", entryPath: novel });
    const catalog = service.listChapters("novel-volumes", 0, 20);

    expect(catalog.chapters.map((chapter) => [chapter.volumeTitle, chapter.title])).toEqual([
      ["第一卷：雾起", "第1章 入城"],
      ["第一卷：雾起", "第2章 追灯"],
      ["第二卷：潮生", "第1章 归港"],
      ["第三卷：雪落", "第1章 旧约"],
      ["第三卷：雪落", "第2章 重逢"]
    ]);
  });

  it("超过 2000 章仍可分页访问，且资料不混入章节目录", async () => {
    const { novel, service } = await fixture();
    const body = Array.from({ length: 2_005 }, (_, index) => `# 第${index + 1}章\n正文${index + 1}`).join("\n");
    await writeFile(join(novel, "正文", "全书.md"), body, "utf8");
    await writeFile(join(novel, "全量质检报告.md"), "# 第1章检查\n这是报告，不是正文。", "utf8");

    const summary = await service.build({ entryId: "novel-many", title: "大书", entryPath: novel });
    expect(summary.chapterCount).toBe(2_005);
    expect(summary.indexedDocumentCount).toBe(2);
    const last = service.listChapters("novel-many", 2_000, 20);
    expect(last.total).toBe(2_005);
    expect(last.chapters).toHaveLength(5);
    expect(last.nextOffset).toBeNull();
  });

  it("全文搜索同时覆盖正文和资料，本地质检可发现跨章重复段落", async () => {
    const { novel, service } = await fixture();
    const duplicate = "铜铃连续响了三声，所有人都在潮湿的石廊里沉默下来，连守门人也收起钥匙，不再追问那封信究竟来自哪里。";
    await writeFile(join(novel, "正文", "第1章.md"), `# 第1章\n${duplicate}\n\n星图密钥藏在井下。`, "utf8");
    await writeFile(join(novel, "正文", "第2章.md"), `# 第2章\n${duplicate}\n\n众人继续前行。`, "utf8");
    await writeFile(join(novel, "设定.txt"), "星图密钥属于守夜人。", "utf8");
    await service.build({ entryId: "novel-search", title: "搜索测试", entryPath: novel });

    const results = service.search("novel-search", "星图密钥", 10);
    expect(results.results.map((item) => item.kind).sort()).toEqual(["chapter", "reference"]);
    expect(results.results.every((item) => item.score > 0 && item.matchEnd > item.matchStart)).toBe(true);
    expect(results.results.every((item) => item.snippet.includes("星图密钥"))).toBe(true);
    const report = service.runLocalQualityCheck("novel-search");
    expect(report.issues.some((issue) => issue.rule === "duplicate-paragraph")).toBe(true);
    expect(report.coverage.indexedDocumentCount).toBe(3);
  });

  it("二字中文查询由可回滚的短词索引命中，不再退化为正文全表扫描", async () => {
    const { root, novel, service } = await fixture();
    await writeFile(join(novel, "正文", "第1章.md"), "# 第1章\n潮声越来越近。", "utf8");
    await writeFile(join(novel, "设定.txt"), "潮声来自城外的湾口。", "utf8");
    await service.build({ entryId: "novel-short-index", title: "短词索引", entryPath: novel });

    const results = service.search("novel-short-index", "潮声", 10).results;
    expect(results.map((item) => item.kind).sort()).toEqual(["chapter", "reference"]);

    const database = new DatabaseSync(join(root, "user-data", "novel-index", "knowledge.sqlite"));
    const plan = database.prepare(`EXPLAIN QUERY PLAN
      SELECT content_items.id FROM content_short_fts
      JOIN content_items ON content_items.rowid = content_short_fts.rowid
      WHERE content_short_fts MATCH ? AND content_items.entry_id = ?`).all('tokens : "潮声"', "novel-short-index") as Array<{ detail: string }>;
    expect(plan.some((step) => /VIRTUAL TABLE INDEX/iu.test(step.detail))).toBe(true);
    expect(database.prepare(`SELECT count(*) AS count FROM content_short_fts
      JOIN content_items ON content_items.rowid = content_short_fts.rowid
      WHERE content_short_fts MATCH ? AND content_items.entry_id = ?`).get('tokens : "潮声"', "novel-short-index")).toMatchObject({ count: 2 });
    const schemas = database.prepare(`SELECT name,sql FROM sqlite_master
      WHERE name IN ('content_fts','content_short_fts') ORDER BY name`).all() as Array<{ name: string; sql: string }>;
    expect(schemas).toHaveLength(2);
    expect(schemas.every(({ sql }) => /content\s*=\s*''/iu.test(sql) && /contentless_delete\s*=\s*1/iu.test(sql))).toBe(true);
    expect(database.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 6 });
    database.close();
  });

  it("拒绝无法高效索引的单字全书扫描", async () => {
    const { novel, service } = await fixture();
    await writeFile(join(novel, "正文", "第1章.md"), "# 第1章\n潮声越来越近。", "utf8");
    await service.build({ entryId: "novel-one-character", title: "单字搜索", entryPath: novel });

    expect(() => service.search("novel-one-character", "潮", 10)).toThrow(/至少输入 2 个字/u);
  });

  it("不写入原稿地检测新增、删除和同长内容变更，并能在恢复原内容后清除陈旧标记", async () => {
    const { novel, service } = await fixture();
    const chapterPath = join(novel, "正文", "第1章.md");
    const original = "# 第1章\n潮声越来越近。";
    const changed = "# 第1章\n雨声越来越近。";
    expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(original));
    await writeFile(chapterPath, original, "utf8");
    await service.build({ entryId: "novel-freshness", title: "陈旧检测", entryPath: novel });
    const before = await stat(chapterPath);

    await writeFile(chapterPath, changed, "utf8");
    await utimes(chapterPath, before.atime, before.mtime);
    expect(await service.refreshSourceFreshness("novel-freshness", novel)).toMatchObject({
      status: "stale",
      contentComplete: false
    });
    expect(service.getSummary("novel-freshness").warnings.join(" ")).toMatch(/原稿内容或文件清单已变化/u);
    expect(() => service.search("novel-freshness", "雨声", 10)).toThrow(/原稿内容或文件清单已变化/u);

    await writeFile(chapterPath, original, "utf8");
    expect(await service.refreshSourceFreshness("novel-freshness", novel)).toMatchObject({ status: "ready" });

    const addedPath = join(novel, "正文", "第2章.md");
    await writeFile(addedPath, "# 第2章\n新增章节。", "utf8");
    expect(await service.refreshSourceFreshness("novel-freshness", novel)).toMatchObject({ status: "stale" });
    await rm(addedPath);
    expect(await service.refreshSourceFreshness("novel-freshness", novel)).toMatchObject({ status: "ready" });

    await rm(chapterPath);
    expect(await service.refreshSourceFreshness("novel-freshness", novel)).toMatchObject({ status: "stale" });
  });

  it("来源未变化时不产生 SQLite WAL 写放大，并限制检查点后的 WAL 保留量", async () => {
    const { root, novel, service } = await fixture();
    await writeFile(join(novel, "正文", "第1章.md"), "# 第1章\n潮声越来越近。", "utf8");
    await service.build({ entryId: "novel-noop-freshness", title: "无变化检测", entryPath: novel });
    const databasePath = join(root, "user-data", "novel-index", "knowledge.sqlite");
    const walPath = `${databasePath}-wal`;
    const serviceDatabase = (service as unknown as { database: DatabaseSync }).database;
    expect(serviceDatabase.prepare("PRAGMA journal_size_limit").get()).toMatchObject({
      journal_size_limit: 67_108_864
    });
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    database.close();
    const before = await stat(walPath).then((value) => value.size).catch(() => 0);

    await expect(service.refreshSourceFreshness("novel-noop-freshness", novel))
      .resolves.toMatchObject({ status: "ready" });

    const after = await stat(walPath).then((value) => value.size).catch(() => 0);
    expect(after).toBe(before);
  });

  it("按卷分别检测章节序号缺口，不把跨卷重新从第一章起算误报为缺章", async () => {
    const { novel, service } = await fixture();
    await mkdir(join(novel, "正文", "第一卷"), { recursive: true });
    await mkdir(join(novel, "正文", "第二卷"), { recursive: true });
    await writeFile(join(novel, "正文", "第一卷", "第1章.md"), "# 第1章\n第一卷开始。", "utf8");
    await writeFile(join(novel, "正文", "第一卷", "第3章.md"), "# 第3章\n第一卷第三章。", "utf8");
    await writeFile(join(novel, "正文", "第二卷", "第1章.md"), "# 第1章\n第二卷开始。", "utf8");
    await writeFile(join(novel, "正文", "第二卷", "第2章.md"), "# 第2章\n第二卷继续。", "utf8");
    await service.build({ entryId: "novel-order-gap", title: "缺章检测", entryPath: novel });

    const gapIssues = service.runLocalQualityCheck("novel-order-gap").issues.filter((issue) =>
      issue.rule === "chapter-order-gap"
    );
    expect(gapIssues).toHaveLength(1);
    expect(gapIssues[0]).toMatchObject({ severity: "warning" });
    expect(gapIssues[0]?.title).toContain("第一卷");
    expect(gapIssues[0]?.detail).toMatch(/缺少第 2 章/u);
    expect(gapIssues[0]?.chapterIds).toHaveLength(2);
  });

  it("搜索证据必须来自正文命中，不能用标题命中伪造正文偏移", async () => {
    const { novel, service } = await fixture();
    await mkdir(join(novel, "资料"), { recursive: true });
    await writeFile(join(novel, "正文", "第1章.md"), "# 第1章\n正文只谈港口和潮声。", "utf8");
    await writeFile(join(novel, "资料", "星图密钥.txt"), "这份资料只记录守夜人的旧制服。", "utf8");
    await service.build({ entryId: "novel-evidence", title: "证据测试", entryPath: novel });

    expect(service.search("novel-evidence", "星图密钥", 10).results).toEqual([]);
    const shortMatch = service.search("novel-evidence", "潮声", 10).results;
    expect(shortMatch).toHaveLength(1);
    expect(shortMatch[0]?.snippet).toContain("潮声");
    expect(shortMatch[0]?.matchStart).toBeGreaterThanOrEqual(0);
  });

  it("不把常见短对白误判为可自动改写的重复段落", async () => {
    const { novel, service } = await fixture();
    await writeFile(join(novel, "正文", "第1章.md"), "# 第1章\n\n“你来了。”她说。\n\n这是第一章独有的后续内容。", "utf8");
    await writeFile(join(novel, "正文", "第2章.md"), "# 第2章\n\n“你来了。”她说。\n\n这是第二章独有的后续内容。", "utf8");
    await service.build({ entryId: "novel-short-dialogue", title: "短对白", entryPath: novel });
    expect(service.runLocalQualityCheck("novel-short-dialogue").issues.some((issue) =>
      issue.rule === "duplicate-paragraph"
    )).toBe(false);
  });

  it("把备份、归档和非正文工作目录保留为全文资料，但不混入章节质检", async () => {
    const { root, novel, service } = await fixture();
    const duplicate = "铜铃响了三声，所有人都沉默下来。";
    await writeFile(join(novel, "正文", "第1章.md"), `# 第1章\n${duplicate}\n\n唯一正文。`, "utf8");
    await mkdir(join(novel, "_非正文资料_20260713", "_backup_before_repair", "chapters"), { recursive: true });
    await writeFile(
      join(novel, "_非正文资料_20260713", "_backup_before_repair", "chapters", "第1章.md"),
      `# 第1章\n${duplicate}\n\n旧备份。`,
      "utf8"
    );
    await mkdir(join(novel, "backup_before_expand_v8"), { recursive: true });
    await writeFile(join(novel, "backup_before_expand_v8", "第1章.md"), `# 第1章\n${duplicate}\n\n替代稿。`, "utf8");
    await mkdir(join(novel, "05-记忆系统"), { recursive: true });
    await writeFile(join(novel, "05-记忆系统", "chapter_summaries.md"), `${duplicate}\n章节摘要。`, "utf8");

    const summary = await service.build({ entryId: "novel-backups", title: "备份分层", entryPath: novel });
    expect(summary).toMatchObject({ chapterCount: 1, documentCount: 4, indexedDocumentCount: 4, contentComplete: true });
    const matches = service.search("novel-backups", duplicate, 10).results;
    expect(matches.filter((item) => item.kind === "chapter")).toHaveLength(1);
    expect(matches.filter((item) => item.kind === "reference")).toHaveLength(3);
    expect(service.runLocalQualityCheck("novel-backups").issues.some((issue) => issue.rule === "duplicate-paragraph")).toBe(false);

    const database = new DatabaseSync(join(root, "user-data", "novel-index", "knowledge.sqlite"));
    database.prepare("UPDATE novels SET index_format_version = 1 WHERE entry_id = ?").run("novel-backups");
    database.close();
    const reopened = new InkHubNovelKnowledgeService(join(root, "user-data", "novel-index"));
    expect(reopened.getSummary("novel-backups")).toMatchObject({ status: "stale", contentComplete: false });
    expect(reopened.getSummary("novel-backups").warnings.join(" ")).toMatch(/更新全书索引/u);
    expect(() => reopened.runLocalQualityCheck("novel-backups")).toThrow(/更新全书索引/u);
  });

  it("有明确章节目录或分卷时只把唯一正文稿纳入章节，合订导出仍可全文搜索", async () => {
    const { novel, service } = await fixture();
    await mkdir(join(novel, "第一卷：雾起"), { recursive: true });
    await mkdir(join(novel, "第二卷：潮生"), { recursive: true });
    await writeFile(join(novel, "第一卷：雾起", "第1章.md"), "# 第1章 入城\n唯一口令在城门。", "utf8");
    await writeFile(join(novel, "第二卷：潮生", "第1章.md"), "# 第1章 归港\n潮水送船归港。", "utf8");
    await writeFile(join(novel, "全书完整版.txt"), "第一卷\n第一章\n唯一口令在城门。\n第二卷\n第一章\n潮水送船归港。", "utf8");

    const summary = await service.build({ entryId: "novel-canonical", title: "唯一正文", entryPath: novel });
    expect(summary.chapterCount).toBe(2);
    expect(service.listChapters("novel-canonical", 0, 20).chapters.map((chapter) => chapter.volumeTitle)).toEqual([
      "第一卷：雾起",
      "第二卷：潮生"
    ]);
    expect(service.search("novel-canonical", "唯一口令", 10).results.map((item) => item.kind).sort()).toEqual([
      "chapter",
      "reference"
    ]);
  });

  it("没有标准正文目录时选择章节最完整的工作副本，其余版本作为资料", async () => {
    const { novel, service } = await fixture();
    await writeFile(join(novel, "第01章.md"), "# 第1章\n根目录旧稿。", "utf8");
    await writeFile(join(novel, "第02章.md"), "# 第2章\n根目录旧稿。", "utf8");
    await mkdir(join(novel, "20260507-完整工作稿"), { recursive: true });
    for (let index = 1; index <= 3; index += 1) {
      await writeFile(
        join(novel, "20260507-完整工作稿", `第0${index}章.md`),
        `# 第${index}章\n完整工作稿第${index}章。`,
        "utf8"
      );
    }

    const summary = await service.build({ entryId: "novel-cohort", title: "工作副本", entryPath: novel });
    expect(summary.chapterCount).toBe(3);
    expect(service.listChapters("novel-cohort", 0, 20).chapters.every((chapter) =>
      chapter.relativePath.startsWith("20260507-完整工作稿/")
    )).toBe(true);
    expect(service.search("novel-cohort", "根目录旧稿", 10).results.every((item) => item.kind === "reference")).toBe(true);
  });

  it("识别作品根目录中的正文合订文件，同时把设定保留为资料", async () => {
    const { novel, service } = await fixture();
    await writeFile(join(novel, "正文.txt"), [
      "第一章 灯下相逢",
      "林舟看见星河暗号。",
      "第二章 清晨归途",
      "他沿河回家。"
    ].join("\n"), "utf8");
    await writeFile(join(novel, "人物设定.md"), "# 人物设定\n\n星河暗号属于林舟。", "utf8");

    const summary = await service.build({ entryId: "novel-root-files", title: "根目录测试", entryPath: novel });
    expect(summary).toMatchObject({ chapterCount: 2, documentCount: 2, indexedDocumentCount: 2, contentComplete: true });
    expect(service.search("novel-root-files", "星河暗号", 10).results.map((result) => result.kind).sort()).toEqual([
      "chapter",
      "reference"
    ]);
  });

  it("把阅读进度保存在私有索引中并在重启后恢复", async () => {
    const { root, novel, service } = await fixture();
    await writeFile(join(novel, "正文", "第1章.md"), "# 第1章\n正文", "utf8");
    await service.build({ entryId: "novel-progress", title: "进度测试", entryPath: novel });
    const chapter = service.listChapters("novel-progress", 0, 10).chapters[0]!;
    service.saveProgress({ entryId: "novel-progress", chapterId: chapter.id, characterOffset: 4, scrollFraction: 0.75 });

    const reopened = new InkHubNovelKnowledgeService(join(root, "user-data", "novel-index"));
    expect(reopened.getProgress("novel-progress")).toMatchObject({
      chapterId: chapter.id,
      characterOffset: 4,
      scrollFraction: 0.75
    });
    const database = await stat(join(root, "user-data", "novel-index", "knowledge.sqlite"));
    expect(database.mode & 0o777).toBe(0o600);
  });

  it("安全提取 DOCX 与 EPUB 全文并纳入搜索", async () => {
    const { novel, service } = await fixture();
    const sections = [
      { title: "第一章 雪夜", content: "银叶暗号藏在窗棂下。" },
      { title: "第二章 追踪", content: "她沿着车辙走向城北。" }
    ];
    await writeFile(join(novel, "正文", "副本.docx"), buildDocx({ title: "副本", format: "docx", sections }));
    await writeFile(join(novel, "资料.epub"), buildEpub({ title: "资料", format: "epub", sections: [{ title: "线索", content: "银叶暗号对应守门人。" }] }));

    const summary = await service.build({ entryId: "novel-archive", title: "归档格式", entryPath: novel });
    expect(summary.contentComplete).toBe(true);
    expect(summary.indexedDocumentCount).toBe(2);
    expect(service.search("novel-archive", "银叶暗号", 10).results).toHaveLength(2);
  });

  it("经显式确认后只替换目标章节，保存私有备份并拒绝过期修复稿", async () => {
    const { novel, service } = await fixture();
    const sourcePath = join(novel, "正文", "全书.md");
    await writeFile(sourcePath, [
      "# 第1章 入夜",
      "夜色笼罩长街。",
      "",
      "# 第2章 来信",
      "信纸上还留着雨痕。"
    ].join("\n"), "utf8");
    await service.build({ entryId: "novel-repair", title: "修复测试", entryPath: novel });
    const chapters = service.listChapters("novel-repair", 0, 20).chapters;
    const target = chapters[1]!;

    const repaired = await service.applyChapterRepair({
      entryId: "novel-repair",
      entryPath: novel,
      chapterId: target.id,
      expectedSourceRevision: target.sourceRevision,
      content: "# 第2章 来信\n第二章修复后的正文。",
      confirmWrite: true
    });

    expect(repaired.backupCreated).toBe(true);
    expect(await readFile(sourcePath, "utf8")).toBe([
      "# 第1章 入夜",
      "夜色笼罩长街。",
      "",
      "# 第2章 来信",
      "第二章修复后的正文。"
    ].join("\n"));
    expect(await service.refreshSourceFreshness("novel-repair", novel)).toMatchObject({ status: "ready" });
    await expect(service.applyChapterRepair({
      entryId: "novel-repair",
      entryPath: novel,
      chapterId: target.id,
      expectedSourceRevision: target.sourceRevision,
      content: "# 第2章 来信\n过期内容。",
      confirmWrite: true
    })).rejects.toThrow(/原稿已变化|索引已变化/u);
  });

  it("两个相同 revision 的单章修复并发时只接受先进入队列的写入", async () => {
    const { novel, service } = await fixture();
    const sourcePath = join(novel, "正文", "并发.md");
    await writeFile(sourcePath, "# 第1章 并发\n旧正文。", "utf8");
    await service.build({ entryId: "novel-concurrent-repair", title: "并发修复", entryPath: novel });
    const target = service.listChapters("novel-concurrent-repair", 0, 20).chapters[0]!;
    const common = {
      entryId: "novel-concurrent-repair",
      entryPath: novel,
      chapterId: target.id,
      expectedSourceRevision: target.sourceRevision,
      confirmWrite: true as const
    };

    const [first, second] = await Promise.allSettled([
      service.applyChapterRepair({ ...common, content: "# 第1章 并发\n第一份修复。" }),
      service.applyChapterRepair({ ...common, content: "# 第1章 并发\n第二份修复。" })
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    if (second.status === "rejected") {
      expect(second.reason).toBeInstanceOf(Error);
      expect((second.reason as Error).message).toMatch(/原稿索引已变化|原稿已变化/u);
    }
    expect(await readFile(sourcePath, "utf8")).toBe("# 第1章 并发\n第一份修复。");
  });

  it("整批预检后一次写回同文件多章，任一版本过期时不改任何原稿", async () => {
    const { novel, service } = await fixture();
    const firstPath = join(novel, "正文", "第一卷.md");
    const secondPath = join(novel, "正文", "第二卷.md");
    await writeFile(firstPath, [
      "# 第1卷",
      "## 第1章 入夜",
      "第一章旧正文。",
      "",
      "## 第2章 来信",
      "第二章旧正文。"
    ].join("\n"), "utf8");
    await writeFile(secondPath, "# 第2卷\n## 第1章 归途\n第三章旧正文。", "utf8");
    await service.build({ entryId: "novel-batch-repair", title: "批量修复", entryPath: novel });
    const chapters = service.listChapters("novel-batch-repair", 0, 20).chapters;
    const firstTwo = chapters.filter((chapter) =>
      chapter.relativePath === "正文/第一卷.md" &&
      ["第1章 入夜", "第2章 来信"].includes(chapter.title)
    );
    expect(firstTwo).toHaveLength(2);

    const applied = await service.applyChapterRepairs({
      entryId: "novel-batch-repair",
      entryPath: novel,
      repairs: firstTwo.map((chapter, index) => ({
        chapterId: chapter.id,
        expectedSourceRevision: chapter.sourceRevision,
        content: `${chapter.title}\n第${index + 1}章批量修复正文。`
      }))
    });
    expect(applied).toMatchObject({ appliedChapterCount: 2, appliedFileCount: 1, backupsCreated: 1 });
    expect(await readFile(firstPath, "utf8")).toContain("第1章批量修复正文");
    expect(await readFile(firstPath, "utf8")).toContain("第2章批量修复正文");

    const beforeFirst = await readFile(firstPath, "utf8");
    const beforeSecond = await readFile(secondPath, "utf8");
    const refreshed = service.listChapters("novel-batch-repair", 0, 20).chapters;
    const currentFirst = refreshed.find((chapter) => chapter.relativePath === "正文/第一卷.md")!;
    const currentSecond = refreshed.find((chapter) => chapter.relativePath === "正文/第二卷.md")!;
    await expect(service.applyChapterRepairs({
      entryId: "novel-batch-repair",
      entryPath: novel,
      repairs: [
        { chapterId: currentFirst.id, expectedSourceRevision: currentFirst.sourceRevision, content: `${currentFirst.title}\n不应写入一。` },
        { chapterId: currentSecond.id, expectedSourceRevision: "f".repeat(64), content: `${currentSecond.title}\n不应写入二。` }
      ]
    })).rejects.toThrow(/变化|过期|版本/u);
    expect(await readFile(firstPath, "utf8")).toBe(beforeFirst);
    expect(await readFile(secondPath, "utf8")).toBe(beforeSecond);
  });

  it("批量提交失败时不用旧备份覆盖已经再次变化的文件", async () => {
    const { novel, service } = await fixture();
    const firstPath = join(novel, "正文", "第一卷.md");
    const secondPath = join(novel, "正文", "第二卷.md");
    await writeFile(firstPath, "# 第一卷\n## 第1章\n第一章旧正文。", "utf8");
    await writeFile(secondPath, "# 第二卷\n## 第1章\n第二章旧正文。", "utf8");
    await service.build({ entryId: "novel-rollback-cas", title: "回滚保护", entryPath: novel });
    const chapters = service.listChapters("novel-rollback-cas", 0, 20).chapters;
    const first = chapters.find((chapter) => chapter.relativePath === "正文/第一卷.md")!;
    const second = chapters.find((chapter) => chapter.relativePath === "正文/第二卷.md")!;
    const externallyUpdatedFirst = "# 第一卷\n## 第1章\n提交后的外部新内容。";
    const externallyUpdatedSecond = "# 第二卷\n## 第1章\n提交期间的外部新内容。";
    let injected = false;
    repairFsInterception.afterRename = async (source) => {
      if (!injected && source.includes(".inkhub-repair-batch-")) {
        injected = true;
        await writeFile(firstPath, externallyUpdatedFirst, "utf8");
        await writeFile(secondPath, externallyUpdatedSecond, "utf8");
      }
    };

    await expect(service.applyChapterRepairs({
      entryId: "novel-rollback-cas",
      entryPath: novel,
      repairs: [
        { chapterId: first.id, expectedSourceRevision: first.sourceRevision, content: `${first.title}\n第一章批量修复。` },
        { chapterId: second.id, expectedSourceRevision: second.sourceRevision, content: `${second.title}\n第二章批量修复。` }
      ]
    })).rejects.toThrow(/回滚不完整|再次变化/u);

    expect(injected).toBe(true);
    expect(await readFile(firstPath, "utf8")).toBe(externallyUpdatedFirst);
    expect(await readFile(secondPath, "utf8")).toBe(externallyUpdatedSecond);
  });
});
