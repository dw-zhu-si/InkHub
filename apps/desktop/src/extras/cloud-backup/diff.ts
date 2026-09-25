import type {
  CloudBackupChange,
  CloudBackupDirection,
  CloudBackupItem
} from "@deepwrite/contracts";

function itemKey(item: Pick<CloudBackupItem, "kind" | "id">): string {
  return `${item.kind}:${item.id}`;
}

function toChange(
  item: CloudBackupItem,
  change: CloudBackupChange["change"]
): CloudBackupChange {
  return {
    kind: item.kind,
    change,
    id: item.id,
    title: item.title,
    sizeBytes: item.sizeBytes
  };
}

function resolveChange(
  direction: CloudBackupDirection,
  local: CloudBackupItem | undefined,
  remote: CloudBackupItem | undefined
): CloudBackupChange["change"] {
  if (direction === "upload") {
    if (local && !remote) return "add";
    if (local && remote && local.hash !== remote.hash) return "overwrite";
    if (local && remote) return "keep";
    return "drop";
  }
  if (remote && !local) return "add";
  if (remote && local && remote.hash !== local.hash) return "overwrite";
  return "keep";
}

export function diffBackupItems(
  direction: CloudBackupDirection,
  localItems: readonly CloudBackupItem[],
  remoteItems: readonly CloudBackupItem[]
): CloudBackupChange[] {
  const localByKey = new Map(localItems.map((item) => [itemKey(item), item]));
  const remoteByKey = new Map(remoteItems.map((item) => [itemKey(item), item]));
  const keys = new Set([...localByKey.keys(), ...remoteByKey.keys()]);
  const changes: CloudBackupChange[] = [];

  for (const key of [...keys].sort()) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    const source = direction === "upload" ? local ?? remote : remote ?? local;
    if (!source) continue;
    const change = toChange(source, resolveChange(direction, local, remote));
    if (change) changes.push(change);
  }

  return changes;
}

export function countChanges(changes: readonly CloudBackupChange[]): {
  added: number;
  overwritten: number;
  kept: number;
  dropped: number;
} {
  return {
    added: changes.filter((change) => change.change === "add").length,
    overwritten: changes.filter((change) => change.change === "overwrite").length,
    kept: changes.filter((change) => change.change === "keep").length,
    dropped: changes.filter((change) => change.change === "drop").length
  };
}
