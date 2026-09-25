import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LongWorkspaceService } from "./long-workspace-service";

const FIXED_NOW = "2026-08-05T02:00:00.000Z";
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

function legacyBook() {
  return {
    id: "legacy-book-sync-fixture",
    title: "旧版测试书",
    book_type: "long",
    long_workspace: {
      schema_version: 5,
      revision: 3,
      worldbuilding: {
        categories: [
          { id: "rules", name: "旧版规则", format: "text", text: "潮汐决定时间。", items: [] }
        ]
      },
      characters: {
        protagonists: {
          entries: [
            {
              id: "hero",
              name: "林舟",
              aliases: ["小舟"],
              core_profile: "潮汐学者",
              relationships: "沈星的盟友",
              current_state: "正在调查",
              history: "经历过逆潮"
            }
          ]
        },
        major_supporting: { entries: [] },
        minor_supporting: { entries: [] },
        passersby: { entries: [] }
      },
      plot: {
        book_line: "林舟寻找被抹去的历史。",
        volumes: [{ id: "volume-1", name: "潮起", outline: "发现逆潮", order: 1 }],
        arcs: [{ id: "arc-1", volume_id: "volume-1", name: "失忆", outline: "追查线索", order: 1 }],
        chapter_cards: [
          {
            id: "chapter-1",
            volume_id: "volume-1",
            arc_id: "arc-1",
            stage_id: "draft.volume-1.arc-1.chapter-1",
            title: "潮声",
            outline: "林舟醒来",
            characters: ["hero"],
            narrative_order: 1
          }
        ],
        story_events: [
          {
            id: "event-1",
            title: "逆潮发生",
            summary: "全城失忆",
            story_order: 1,
            arc_ids: ["arc-1"],
            character_ids: ["hero"]
          }
        ],
        event_links: [{ source_event_id: "event-1", target_event_id: "event-1", type: "before" }],
        narrative_placements: [{ id: "placement-1" }],
        foreshadowing: [{ id: "thread-1", title: "不应导入" }]
      },
      chapters: {
        "draft.volume-1.arc-1.chapter-1": {
          title: "潮声",
          body: "这段旧版正文绝不能同步。",
          character_state: "旧版人物状态",
          handoff: "旧版交接"
        }
      },
      ledger: { timeline: ["不应导入"] }
    }
  };
}

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "deepwrite-legacy-sync-"))
  );
  temporaryRoots.push(root);
  const books = join(root, "books");
  await mkdir(books, { recursive: true });
  const sourcePath = join(root, "legacy.json");
  await writeFile(sourcePath, JSON.stringify(legacyBook()), "utf8");
  const service = new LongWorkspaceService({
    userDataPath: join(root, "user-data"),
    now: () => FIXED_NOW
  });
  const target = await service.create(books, { title: "当前书", genre: "其他" });
  return { service, sourcePath, target };
}

describe("Write Claw selective long sync", () => {
  it("appends only the selected editable structures and skips them on repeat", async () => {
    const { service, sourcePath, target } = await fixture();
    const preview = await service.previewLegacySync(sourcePath);
    expect(preview.counts).toEqual({
      worldbuilding: 1,
      characters: 1,
      outline: 1,
      volumes: 1,
      plotPoints: 1,
      storyEvents: 1,
      chapterCards: 1
    });

    const first = await service.applyLegacySync({
      bookId: target.book.id,
      sourcePath,
      expectedFingerprint: preview.sourceFingerprint,
      expectedProjectRevision: target.summary.projectRevision,
      modules: ["worldbuilding", "characters", "plot"]
    });
    expect(first.imported).toEqual(preview.counts);

    const snapshot = await service.getWorkspaceIndex({ bookId: target.book.id });
    expect(snapshot.workspaceIndex.worldbuilding).toHaveLength(8);
    expect(snapshot.workspaceIndex.characters).toHaveLength(1);
    expect(snapshot.workspaceIndex.plot.volumes).toHaveLength(2);
    expect(snapshot.workspaceIndex.plot.arcs).toHaveLength(2);
    expect(snapshot.workspaceIndex.plot.storyEvents).toHaveLength(1);
    expect(snapshot.workspaceIndex.plot.chapterCards).toHaveLength(2);
    expect(snapshot.workspaceIndex.plot.eventConnections).toHaveLength(0);
    expect(snapshot.workspaceIndex.plot.narrativePlacements).toHaveLength(0);
    expect(snapshot.workspaceIndex.plot.foreshadowing).toHaveLength(0);

    const importedChapter = snapshot.workspaceIndex.plot.chapterCards.at(-1)!;
    const chapterFiles = snapshot.workspaceIndex.chapters.find(
      ({ chapterCardId }) => chapterCardId === importedChapter.id
    )!;
    const read = (fileId: string) => service.readDocument({
      bookId: target.book.id,
      fileId,
      offset: 0,
      maxCharacters: 262_144
    });
    expect((await read(chapterFiles.body.id)).content).toBe("");
    expect((await read(chapterFiles.characterState.id)).content).toBe("");
    expect((await read(chapterFiles.handoff.id)).content).toBe("");
    expect((await read(chapterFiles.card.id)).content).toContain("林舟醒来");

    const second = await service.applyLegacySync({
      bookId: target.book.id,
      sourcePath,
      expectedFingerprint: preview.sourceFingerprint,
      expectedProjectRevision: first.projectRevision,
      modules: ["worldbuilding", "characters", "plot"]
    });
    expect(Object.values(second.imported).every((count) => count === 0)).toBe(true);
    expect(second.skipped).toEqual(preview.counts);
  });

  it("removes unresolved event character references when only plot is selected", async () => {
    const { service, sourcePath, target } = await fixture();
    const preview = await service.previewLegacySync(sourcePath);
    await service.applyLegacySync({
      bookId: target.book.id,
      sourcePath,
      expectedFingerprint: preview.sourceFingerprint,
      expectedProjectRevision: target.summary.projectRevision,
      modules: ["plot"]
    });
    const snapshot = await service.getWorkspaceIndex({ bookId: target.book.id });
    expect(snapshot.workspaceIndex.characters).toHaveLength(0);
    expect(snapshot.workspaceIndex.plot.storyEvents[0]?.characterIds).toEqual([]);
  });
});
