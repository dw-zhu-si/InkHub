import {
  CLOUD_BACKUP_MANIFEST_VERSION,
  CLOUD_BACKUP_QUOTA_BYTES,
  CloudBackupItemSchema,
  type CloudBackupItem,
  type CloudBackupItemKind
} from "@deepwrite/contracts";
import { createZip, readZip, type ZipEntryInput } from "./zip";
import type { LocalBackupProject } from "./catalog-reader";
import { toManifestItems } from "./catalog-reader";

export interface CloudBackupSnapshotManifest {
  version: typeof CLOUD_BACKUP_MANIFEST_VERSION;
  machineKey: string;
  updatedAt: string;
  sizeBytes: number;
  items: CloudBackupItem[];
}

export function snapshotObjectPrefix(machineKey: string): string {
  return `backups/${machineKey}`;
}

export function snapshotObjectKeys(machineKey: string): {
  manifest: string;
  archive: string;
} {
  const prefix = snapshotObjectPrefix(machineKey);
  return {
    manifest: `${prefix}/manifest.json`,
    archive: `${prefix}/snapshot.zip`
  };
}

export function itemArchivePrefix(kind: CloudBackupItemKind, id: string): string {
  return `items/${kind}/${id}/`;
}

export function packBackupSnapshot(
  machineKey: string,
  updatedAt: string,
  projects: readonly LocalBackupProject[]
): { manifest: CloudBackupSnapshotManifest; zip: Buffer } {
  const entries: ZipEntryInput[] = [];
  for (const project of projects) {
    const prefix = itemArchivePrefix(project.kind, project.id);
    for (const file of project.files) {
      entries.push({
        name: `${prefix}${file.relativePath}`,
        data: file.data
      });
    }
  }
  const zip = createZip(entries);
  if (zip.length > CLOUD_BACKUP_QUOTA_BYTES) {
    throw new Error(
      `备份体积 ${formatBytes(zip.length)} 已超过当前 ${formatBytes(CLOUD_BACKUP_QUOTA_BYTES)} 上限。`
    );
  }
  return {
    manifest: {
      version: CLOUD_BACKUP_MANIFEST_VERSION,
      machineKey,
      updatedAt,
      sizeBytes: zip.length,
      items: toManifestItems(projects)
    },
    zip
  };
}

export function parseSnapshotManifest(raw: unknown): CloudBackupSnapshotManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("云端备份清单无效。");
  }
  const value = raw as Partial<CloudBackupSnapshotManifest>;
  if (value.version !== CLOUD_BACKUP_MANIFEST_VERSION) {
    throw new Error("云端备份版本不受支持。");
  }
  if (typeof value.machineKey !== "string" || typeof value.updatedAt !== "string") {
    throw new Error("云端备份清单无效。");
  }
  if (!Array.isArray(value.items) || typeof value.sizeBytes !== "number") {
    throw new Error("云端备份清单无效。");
  }
  return {
    version: CLOUD_BACKUP_MANIFEST_VERSION,
    machineKey: value.machineKey,
    updatedAt: value.updatedAt,
    sizeBytes: value.sizeBytes,
    items: CloudBackupItemSchema.array().parse(value.items)
  };
}

export function extractProjectFiles(
  zip: Buffer,
  kind: CloudBackupItemKind,
  id: string
): Array<{ relativePath: string; data: Buffer }> {
  const prefix = itemArchivePrefix(kind, id);
  const files: Array<{ relativePath: string; data: Buffer }> = [];
  for (const [name, data] of readZip(zip)) {
    if (!name.startsWith(prefix) || name.endsWith("/")) continue;
    const relativePath = name.slice(prefix.length);
    if (!relativePath || relativePath.includes("..")) {
      throw new Error("备份压缩包包含非法路径。");
    }
    files.push({ relativePath, data });
  }
  return files;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
