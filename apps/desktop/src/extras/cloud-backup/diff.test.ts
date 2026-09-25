import { describe, expect, it } from "vitest";
import { countChanges, diffBackupItems } from "./diff";
import type { CloudBackupItem } from "@deepwrite/contracts";

function item(
  id: string,
  hash: string,
  title = id
): CloudBackupItem {
  return { kind: "book", id, title, hash, sizeBytes: 10 };
}

describe("cloud backup diff", () => {
  it("classifies upload add, overwrite, keep and remote drop", () => {
    const changes = diffBackupItems(
      "upload",
      [item("a", "1", "新书"), item("b", "2", "改过的书"), item("c", "3", "没变")],
      [item("b", "old", "改过的书"), item("c", "3", "没变"), item("d", "4", "云端独有")]
    );
    expect(changes).toEqual([
      { kind: "book", change: "add", id: "a", title: "新书", sizeBytes: 10 },
      { kind: "book", change: "overwrite", id: "b", title: "改过的书", sizeBytes: 10 },
      { kind: "book", change: "keep", id: "c", title: "没变", sizeBytes: 10 },
      { kind: "book", change: "drop", id: "d", title: "云端独有", sizeBytes: 10 }
    ]);
    expect(countChanges(changes)).toEqual({
      added: 1,
      overwritten: 1,
      kept: 1,
      dropped: 1
    });
  });

  it("keeps local-only items when downloading and never marks them as drop", () => {
    const changes = diffBackupItems(
      "download",
      [item("local", "1", "本地独有"), item("shared", "old", "将被覆盖")],
      [item("remote", "2", "云端新增"), item("shared", "new", "将被覆盖")]
    );
    expect(changes.map((change) => [change.id, change.change])).toEqual([
      ["local", "keep"],
      ["remote", "add"],
      ["shared", "overwrite"]
    ]);
  });
});
