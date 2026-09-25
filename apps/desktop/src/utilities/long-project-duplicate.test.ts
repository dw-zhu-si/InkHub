import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LongProjectStore, createLongFileRevision } from "./long-project-store";

const NOW = "2026-08-05T09:00:00.000Z";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("LongProjectStore duplicateBook", () => {
  it("copies current content and turns existing commits into a non-reversible baseline", async () => {
    const parent = await mkdtemp(join(tmpdir(), "deepwrite-long-copy-"));
    roots.push(parent);
    const store = new LongProjectStore({ now: () => NOW });
    const source = await store.createBook(parent, {
      id: "longbook_source-copy",
      title: "长篇原稿",
      genre: "悬疑",
      linkedMaterialIdsByKind: {
        character: ["material-one"],
        gimmick: [],
        plot: [],
        draft: [],
        other: []
      },
      linkedSkillIdsByKind: {
        general: [],
        plot: ["skill-one"],
        style: [],
        other: []
      }
    });
    const chapter = source.book.workspaceIndex.chapters[0]!;
    const writes = [
      [chapter.body, "复制后的第一章正文"],
      [chapter.characterState, "人物保持警觉"],
      [chapter.handoff, "下一章继续追查"]
    ] as const;
    const written = await store.applyWorkspaceOperations(
      source.projectDirectory,
      {
        batch: {
          baseRevision: 0,
          updatedAt: NOW,
          operations: [],
          documentWrites: writes.map(([reference, content], index) => ({
            proposalId: `proposal_copy_${index}`,
            fileId: reference.id,
            mode: "replace" as const,
            expectedRevision: reference.revision,
            nextRevision: createLongFileRevision(content),
            updatedAt: NOW,
            content,
            reason: "准备长篇复制测试"
          }))
        },
        expectedProjectRevision: 0
      }
    );
    const writtenChapter = written.book.workspaceIndex.chapters[0]!;
    const committed = await store.commitChapter(source.projectDirectory, {
      mode: "text_files",
      chapterCardId: writtenChapter.chapterCardId,
      chapterFileRevisions: { body: writtenChapter.body.revision },
      continuityFileRevisions: [
        {
          fileId: writtenChapter.characterState.id,
          revision: writtenChapter.characterState.revision
        },
        {
          fileId: writtenChapter.handoff.id,
          revision: writtenChapter.handoff.revision
        }
      ],
      foreshadowingBeatDecisions: {},
      commitMessage: "建立复制测试基线",
      baseWorkspaceRevision: 1,
      baseProjectRevision: 1
    });

    const copy = await store.duplicateBook(
      parent,
      source.projectDirectory,
      "长篇原稿copy1"
    );
    const copiedChapter = copy.book.workspaceIndex.chapters[0]!;
    const copiedCommit = copy.book.workspaceIndex.ledger.commits[0]!;

    expect(copy.book.id).not.toBe(source.book.id);
    expect(copy.book.title).toBe("长篇原稿copy1");
    expect(copy.book.linkedMaterialIdsByKind).toEqual(
      source.book.linkedMaterialIdsByKind
    );
    expect(copy.book.linkedSkillIdsByKind).toEqual(
      source.book.linkedSkillIdsByKind
    );
    expect(copiedCommit.id).toBe(committed.record.id);
    expect(copiedCommit.reversible).toBe(false);
    expect(committed.record.reversible).toBe(true);
    await expect(
      store.readDocument(copy.projectDirectory, {
        fileId: copiedChapter.body.id
      })
    ).resolves.toMatchObject({ content: "复制后的第一章正文" });
    await expect(
      store.rollbackLastCommit(copy.projectDirectory, {
        expectedCommitId: copiedCommit.id,
        baseWorkspaceRevision: copy.book.workspaceIndex.revision,
        baseProjectRevision: copy.summary.projectRevision
      })
    ).rejects.toThrow(/不可回滚/u);
  });
});
