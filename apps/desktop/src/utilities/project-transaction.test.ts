import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProjectTransactionConflictError,
  commitProjectTransaction,
  projectTransactionContentSha256,
  projectTransactionFileIdentity,
  recoverProjectTransaction
} from "./project-transaction";

const temporaryRoots: string[] = [];

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deepwrite-project-transaction-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("project transaction", () => {
  it("keeps filesystem identities exact beyond the safe integer range", () => {
    const device = 9_007_199_254_740_992n;
    const firstInode = 9_007_199_254_740_992n;
    const secondInode = firstInode + 1n;

    expect(Number(firstInode)).toBe(Number(secondInode));
    expect(
      projectTransactionFileIdentity({ dev: device, ino: firstInode })
    ).not.toBe(
      projectTransactionFileIdentity({ dev: device, ino: secondInode })
    );
  });

  it("commits multiple existing and new files as one recoverable unit", async () => {
    const root = await temporaryProject();
    await mkdir(join(root, "long"), { recursive: true });
    await writeFile(join(root, "deepwrite.json"), "old manifest", "utf8");

    const result = await commitProjectTransaction({
      projectRoot: root,
      operations: [
        {
          path: "deepwrite.json",
          content: "new manifest",
          expectedSha256: projectTransactionContentSha256("old manifest")
        },
        {
          path: "long/index.json",
          content: "new index",
          expectedSha256: null
        },
        {
          path: "long/chapters/chapter-1/body.md",
          content: "第一章正文",
          expectedSha256: null
        }
      ]
    });

    expect(result.files).toEqual([
      {
        path: "deepwrite.json",
        sha256: projectTransactionContentSha256("new manifest")
      },
      {
        path: "long/index.json",
        sha256: projectTransactionContentSha256("new index")
      },
      {
        path: "long/chapters/chapter-1/body.md",
        sha256: projectTransactionContentSha256("第一章正文")
      }
    ]);
    await expect(readFile(join(root, "deepwrite.json"), "utf8")).resolves.toBe(
      "new manifest"
    );
    await expect(readFile(join(root, "long/index.json"), "utf8")).resolves.toBe(
      "new index"
    );
    await expect(
      readFile(join(root, "long/chapters/chapter-1/body.md"), "utf8")
    ).resolves.toBe("第一章正文");
    await expect(
      lstat(join(root, ".deepwrite", "transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it(
    "keeps imports larger than the former 512-file ceiling atomic",
    async () => {
      const root = await temporaryProject();
      const operations = Array.from({ length: 520 }, (_, index) => ({
        path: `long/bulk/file-${index}.md`,
        content: `document-${index}`,
        expectedSha256: null
      }));

      await expect(
        commitProjectTransaction({
          projectRoot: root,
          operations
        })
      ).resolves.toMatchObject({ files: expect.any(Array) });
      await expect(
        readFile(join(root, "long", "bulk", "file-0.md"), "utf8")
      ).resolves.toBe("document-0");
      await expect(
        readFile(join(root, "long", "bulk", "file-519.md"), "utf8")
      ).resolves.toBe("document-519");
    },
    20_000
  );

  it("rejects a stale precondition without touching the target", async () => {
    const root = await temporaryProject();
    await writeFile(join(root, "deepwrite.json"), "latest", "utf8");

    await expect(
      commitProjectTransaction({
        projectRoot: root,
        operations: [
          {
            path: "deepwrite.json",
            content: "stale overwrite",
            expectedSha256: projectTransactionContentSha256("older")
          }
        ]
      })
    ).rejects.toBeInstanceOf(ProjectTransactionConflictError);
    await expect(readFile(join(root, "deepwrite.json"), "utf8")).resolves.toBe(
      "latest"
    );
  });

  it("serializes concurrent writers and preserves the successful request identity", async () => {
    const root = await temporaryProject();
    const expectedSha256 = projectTransactionContentSha256("before");
    for (let round = 0; round < 12; round += 1) {
      const path = `shared-${round}.md`;
      await writeFile(join(root, path), "before", "utf8");
      const attempts = ["writer-one", "writer-two"].map(
        async (writer) => {
          const content = `${writer}-${round}`;
          return {
            content,
            result: await commitProjectTransaction({
              projectRoot: root,
              operations: [
                {
                  path,
                  content,
                  expectedSha256
                }
              ]
            })
          };
        }
      );

      const settled = await Promise.allSettled(attempts);
      const fulfilled = settled.filter(
        (
          result
        ): result is PromiseFulfilledResult<
          Awaited<(typeof attempts)[number]>
        > => result.status === "fulfilled"
      );
      const rejected = settled.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (
        !(rejected[0]!.reason instanceof ProjectTransactionConflictError)
      ) {
        throw rejected[0]!.reason;
      }
      expect(
        fulfilled[0]!.value.result.transactionId
      ).toMatch(/^txn-[0-9]+-[0-9a-f]{8}$/u);
      await expect(readFile(join(root, path), "utf8")).resolves.toBe(
        fulfilled[0]!.value.content
      );
    }
    await expect(
      lstat(join(root, ".deepwrite", "transaction.lock"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it(
    "does not unlink an ABA replacement that reuses the same lock owner data",
    async () => {
      const root = await temporaryProject();
      const lockPath = join(root, ".deepwrite", "transaction.lock");
      const commit = commitProjectTransaction({
        projectRoot: root,
        operations: Array.from({ length: 1_000 }, (_, index) => ({
          path: `long/aba/file-${index}.md`,
          content: `content-${index}`,
          expectedSha256: null
        }))
      }).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason })
      );

      let ownerText: string | undefined;
      for (let attempt = 0; attempt < 2_000; attempt += 1) {
        try {
          const candidate = await readFile(lockPath, "utf8");
          const owner = JSON.parse(candidate) as {
            pid?: unknown;
            token?: unknown;
          };
          if (
            typeof owner.pid === "number" &&
            typeof owner.token === "string"
          ) {
            ownerText = candidate;
            break;
          }
        } catch {
          // The lock file may exist briefly before its tiny owner record is
          // fully written. Poll until acquisition has durably published it.
        }
        await new Promise<void>((resolveDelay) => {
          setTimeout(resolveDelay, 1);
        });
      }
      expect(ownerText).toBeDefined();

      const original = await lstat(lockPath);
      const replacementPath = join(
        root,
        ".deepwrite",
        "transaction.replacement"
      );
      await writeFile(replacementPath, ownerText!, {
        encoding: "utf8",
        flag: "wx"
      });
      const replacement = await lstat(replacementPath);
      expect(`${replacement.dev}:${replacement.ino}`).not.toBe(
        `${original.dev}:${original.ino}`
      );
      try {
        await rename(replacementPath, lockPath);
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST" && code !== "EPERM") throw error;
        await unlink(lockPath);
        await rename(replacementPath, lockPath);
      }

      const outcome = await commit;
      expect(outcome.status).toBe("rejected");
      if (outcome.status !== "rejected") {
        throw new Error("替换事务锁后，原事务不应继续提交。");
      }
      expect(outcome.reason).toBeInstanceOf(Error);
      expect((outcome.reason as Error).message).toMatch(
        /所有者发生变化|路径替换/u
      );
      const remaining = await lstat(lockPath);
      expect(`${remaining.dev}:${remaining.ino}`).toBe(
        `${replacement.dev}:${replacement.ino}`
      );
      await expect(readFile(lockPath, "utf8")).resolves.toBe(ownerText);
    },
    30_000
  );

  it("reclaims a transaction lock left by a terminated process", async () => {
    const root = await temporaryProject();
    await mkdir(join(root, ".deepwrite"), { recursive: true });
    await writeFile(
      join(root, ".deepwrite", "transaction.lock"),
      `${JSON.stringify({
        pid: 2_147_483_647,
        token: "a1b2c3d4",
        acquiredAt: "2026-07-26T12:00:00.000Z"
      })}\n`,
      "utf8"
    );

    await expect(
      commitProjectTransaction({
        projectRoot: root,
        operations: [
          {
            path: "recovered.md",
            content: "已恢复写入",
            expectedSha256: null
          }
        ]
      })
    ).resolves.toMatchObject({
      files: [
        {
          path: "recovered.md",
          sha256: projectTransactionContentSha256("已恢复写入")
        }
      ]
    });
    await expect(
      lstat(join(root, ".deepwrite", "transaction.lock"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("supports compare-only checks in the same atomic transaction", async () => {
    const root = await temporaryProject();
    await writeFile(join(root, "pinned.md"), "pinned", "utf8");
    await writeFile(join(root, "index.json"), "old index", "utf8");

    const result = await commitProjectTransaction({
      projectRoot: root,
      operations: [
        {
          action: "check",
          path: "pinned.md",
          expectedSha256: projectTransactionContentSha256("pinned")
        },
        {
          path: "index.json",
          content: "new index",
          expectedSha256: projectTransactionContentSha256("old index")
        }
      ]
    });

    expect(result.files).toEqual([
      {
        path: "pinned.md",
        sha256: projectTransactionContentSha256("pinned")
      },
      {
        path: "index.json",
        sha256: projectTransactionContentSha256("new index")
      }
    ]);
    await expect(readFile(join(root, "pinned.md"), "utf8")).resolves.toBe(
      "pinned"
    );
    await expect(readFile(join(root, "index.json"), "utf8")).resolves.toBe(
      "new index"
    );
  });

  it("revalidates all prepared checks before applying any write", async () => {
    const root = await temporaryProject();
    const transactionId = "txn-1003-d1e2f3a4";
    const transactionRoot = join(
      root,
      ".deepwrite",
      "transactions",
      transactionId
    );
    await mkdir(join(transactionRoot, "stage"), { recursive: true });
    await writeFile(join(root, "pinned.md"), "tampered", "utf8");
    await writeFile(join(root, "index.json"), "old index", "utf8");
    await writeFile(
      join(transactionRoot, "stage", "1.next"),
      "new index",
      "utf8"
    );
    await writeFile(
      join(root, ".deepwrite", "transaction.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          transactionId,
          phase: "prepared",
          appliedCount: 0,
          operations: [
            {
              action: "check",
              path: "pinned.md",
              stagePath: null,
              backupPath: null,
              beforeSha256: projectTransactionContentSha256("pinned"),
              afterSha256: projectTransactionContentSha256("pinned")
            },
            {
              action: "write",
              path: "index.json",
              stagePath: `.deepwrite/transactions/${transactionId}/stage/1.next`,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/1.previous`,
              beforeSha256: projectTransactionContentSha256("old index"),
              afterSha256: projectTransactionContentSha256("new index")
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await expect(recoverProjectTransaction(root)).rejects.toBeInstanceOf(
      ProjectTransactionConflictError
    );
    await expect(readFile(join(root, "index.json"), "utf8")).resolves.toBe(
      "old index"
    );
  });

  it("refuses hard-linked business files instead of modifying aliases", async () => {
    if (process.platform === "win32") return;
    const root = await temporaryProject();
    const target = join(root, "target.md");
    const alias = join(root, "alias.md");
    await writeFile(target, "shared", "utf8");
    await link(target, alias);

    await expect(
      commitProjectTransaction({
        projectRoot: root,
        operations: [
          {
            path: "target.md",
            content: "replacement",
            expectedSha256: projectTransactionContentSha256("shared")
          }
        ]
      })
    ).rejects.toThrow(/普通文件/u);
    await expect(readFile(target, "utf8")).resolves.toBe("shared");
    await expect(readFile(alias, "utf8")).resolves.toBe("shared");
  });

  it("commits file deletion and index replacement as one recoverable unit", async () => {
    const root = await temporaryProject();
    await writeFile(join(root, "orphan.md"), "待删除正文", "utf8");
    await writeFile(join(root, "index.json"), "old index", "utf8");

    const result = await commitProjectTransaction({
      projectRoot: root,
      operations: [
        {
          action: "delete",
          path: "orphan.md",
          expectedSha256: projectTransactionContentSha256("待删除正文")
        },
        {
          path: "index.json",
          content: "new index",
          expectedSha256: projectTransactionContentSha256("old index")
        }
      ]
    });

    expect(result.files).toEqual([
      { path: "orphan.md", sha256: null },
      {
        path: "index.json",
        sha256: projectTransactionContentSha256("new index")
      }
    ]);
    await expect(lstat(join(root, "orphan.md"))).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(readFile(join(root, "index.json"), "utf8")).resolves.toBe(
      "new index"
    );
  });

  it("rolls forward a transaction interrupted between file replacements", async () => {
    const root = await temporaryProject();
    const transactionId = "txn-1000-a1b2c3d4";
    const transactionRoot = join(
      root,
      ".deepwrite",
      "transactions",
      transactionId
    );
    await mkdir(join(transactionRoot, "stage"), { recursive: true });
    await mkdir(join(transactionRoot, "backup"), { recursive: true });
    await writeFile(join(root, "one.md"), "one-next", "utf8");
    await writeFile(join(root, "two.md"), "two-before", "utf8");
    await writeFile(join(transactionRoot, "stage", "1.next"), "two-next", "utf8");
    await writeFile(
      join(transactionRoot, "backup", "0.previous"),
      "one-before",
      "utf8"
    );
    await writeFile(
      join(transactionRoot, "backup", "1.previous"),
      "two-before",
      "utf8"
    );
    const journal = {
      schemaVersion: 1,
      transactionId,
      phase: "committing",
      appliedCount: 0,
      operations: [
        {
          path: "one.md",
          stagePath: `.deepwrite/transactions/${transactionId}/stage/0.next`,
          backupPath: `.deepwrite/transactions/${transactionId}/backup/0.previous`,
          beforeSha256: projectTransactionContentSha256("one-before"),
          afterSha256: projectTransactionContentSha256("one-next")
        },
        {
          path: "two.md",
          stagePath: `.deepwrite/transactions/${transactionId}/stage/1.next`,
          backupPath: `.deepwrite/transactions/${transactionId}/backup/1.previous`,
          beforeSha256: projectTransactionContentSha256("two-before"),
          afterSha256: projectTransactionContentSha256("two-next")
        }
      ]
    };
    await writeFile(
      join(root, ".deepwrite", "transaction.json"),
      `${JSON.stringify(journal, null, 2)}\n`,
      "utf8"
    );

    const result = await recoverProjectTransaction(root);

    expect(result?.transactionId).toBe(transactionId);
    await expect(readFile(join(root, "one.md"), "utf8")).resolves.toBe(
      "one-next"
    );
    await expect(readFile(join(root, "two.md"), "utf8")).resolves.toBe(
      "two-next"
    );
    await expect(
      lstat(join(root, ".deepwrite", "transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers a copied prepared transaction when some files already contain the staged contents", async () => {
    const root = await temporaryProject();
    const transactionId = "txn-1004-e1f2a3b4";
    const transactionRoot = join(
      root,
      ".deepwrite",
      "transactions",
      transactionId
    );
    await mkdir(join(transactionRoot, "stage"), { recursive: true });
    await mkdir(join(transactionRoot, "backup"), { recursive: true });
    await writeFile(join(root, "deepwrite.json"), "new manifest", "utf8");
    await writeFile(join(root, "index.json"), "old index", "utf8");
    await writeFile(
      join(transactionRoot, "stage", "1.next"),
      "new index",
      "utf8"
    );
    await writeFile(
      join(transactionRoot, "backup", "0.previous"),
      "old manifest",
      "utf8"
    );
    await writeFile(
      join(transactionRoot, "backup", "1.previous"),
      "old index",
      "utf8"
    );
    await writeFile(
      join(root, ".deepwrite", "transaction.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          transactionId,
          phase: "prepared",
          appliedCount: 0,
          operations: [
            {
              action: "write",
              path: "deepwrite.json",
              stagePath: `.deepwrite/transactions/${transactionId}/stage/0.next`,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/0.previous`,
              beforeSha256: projectTransactionContentSha256("old manifest"),
              afterSha256: projectTransactionContentSha256("new manifest")
            },
            {
              action: "write",
              path: "index.json",
              stagePath: `.deepwrite/transactions/${transactionId}/stage/1.next`,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/1.previous`,
              beforeSha256: projectTransactionContentSha256("old index"),
              afterSha256: projectTransactionContentSha256("new index")
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await expect(recoverProjectTransaction(root)).resolves.toMatchObject({
      transactionId,
      files: [
        {
          path: "deepwrite.json",
          sha256: projectTransactionContentSha256("new manifest")
        },
        {
          path: "index.json",
          sha256: projectTransactionContentSha256("new index")
        }
      ]
    });
    await expect(readFile(join(root, "deepwrite.json"), "utf8")).resolves.toBe(
      "new manifest"
    );
    await expect(readFile(join(root, "index.json"), "utf8")).resolves.toBe(
      "new index"
    );
    await expect(
      lstat(join(root, ".deepwrite", "transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls forward an interrupted deletion from its durable journal", async () => {
    const root = await temporaryProject();
    const transactionId = "txn-1002-c1d2e3f4";
    const transactionRoot = join(
      root,
      ".deepwrite",
      "transactions",
      transactionId
    );
    await mkdir(join(transactionRoot, "backup"), { recursive: true });
    await writeFile(join(root, "deleted.md"), "before delete", "utf8");
    await writeFile(
      join(transactionRoot, "backup", "0.previous"),
      "before delete",
      "utf8"
    );
    await writeFile(
      join(root, ".deepwrite", "transaction.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          transactionId,
          phase: "committing",
          appliedCount: 0,
          operations: [
            {
              action: "delete",
              path: "deleted.md",
              stagePath: null,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/0.previous`,
              beforeSha256: projectTransactionContentSha256("before delete"),
              afterSha256: null
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await expect(recoverProjectTransaction(root)).resolves.toMatchObject({
      transactionId,
      files: [{ path: "deleted.md", sha256: null }]
    });
    await expect(lstat(join(root, "deleted.md"))).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(
      lstat(join(root, ".deepwrite", "transaction.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stops recovery rather than overwriting an unrelated external change", async () => {
    const root = await temporaryProject();
    const transactionId = "txn-1001-b1c2d3e4";
    const transactionRoot = join(
      root,
      ".deepwrite",
      "transactions",
      transactionId
    );
    await mkdir(join(transactionRoot, "stage"), { recursive: true });
    await writeFile(join(root, "target.md"), "external edit", "utf8");
    await writeFile(join(transactionRoot, "stage", "0.next"), "next", "utf8");
    await writeFile(
      join(root, ".deepwrite", "transaction.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          transactionId,
          phase: "prepared",
          appliedCount: 0,
          operations: [
            {
              path: "target.md",
              stagePath: `.deepwrite/transactions/${transactionId}/stage/0.next`,
              backupPath: `.deepwrite/transactions/${transactionId}/backup/0.previous`,
              beforeSha256: projectTransactionContentSha256("before"),
              afterSha256: projectTransactionContentSha256("next")
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await expect(recoverProjectTransaction(root)).rejects.toBeInstanceOf(
      ProjectTransactionConflictError
    );
    await expect(readFile(join(root, "target.md"), "utf8")).resolves.toBe(
      "external edit"
    );
  });
});
