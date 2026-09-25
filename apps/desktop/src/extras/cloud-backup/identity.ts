import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CloudBackupMachineKeySchema } from "@deepwrite/contracts";

const IDENTITY_FILE = "cloud-backup-identity.json";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

interface StoredIdentity {
  version: 1;
  machineKey: string;
  createdAt: string;
}

function toBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31] ?? "";
  }
  return output;
}

export function formatMachineKey(raw: string): string {
  const compact = raw
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/gu, "");
  const body = compact.startsWith("DW") ? compact.slice(2) : compact;
  if (!/^[A-Z2-7]{16}$/u.test(body)) {
    throw new Error("备份密钥格式无效。");
  }
  return CloudBackupMachineKeySchema.parse(
    `DW-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`
  );
}

export function createMachineKey(bytes: Buffer = randomBytes(10)): string {
  return formatMachineKey(`DW${toBase32(bytes).slice(0, 16)}`);
}

export class CloudBackupIdentityStore {
  readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "config", IDENTITY_FILE);
  }

  async getOrCreate(now: () => string = () => new Date().toISOString()): Promise<string> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        "machineKey" in raw &&
        typeof raw.machineKey === "string"
      ) {
        return formatMachineKey(raw.machineKey);
      }
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
      }
    }

    const identity: StoredIdentity = {
      version: 1,
      machineKey: createMachineKey(),
      createdAt: now()
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(identity, null, 2)}\n`, {
      encoding: "utf8"
    });
    await rename(temporary, this.filePath);
    return identity.machineKey;
  }
}
