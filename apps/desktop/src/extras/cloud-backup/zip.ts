import { deflateRawSync, inflateRawSync } from "node:zlib";

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  data: Buffer;
}

function writeUint16(target: Buffer, offset: number, value: number): void {
  target.writeUInt16LE(value, offset);
}

function writeUint32(target: Buffer, offset: number, value: number): void {
  target.writeUInt32LE(value, offset);
}

export function createZip(entries: readonly ZipEntryInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const compressed = deflateRawSync(entry.data);
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length + compressed.length);
    writeUint32(local, 0, LOCAL_FILE_SIGNATURE);
    writeUint16(local, 4, 20);
    writeUint16(local, 8, 8);
    writeUint32(local, 14, checksum);
    writeUint32(local, 18, compressed.length);
    writeUint32(local, 22, entry.data.length);
    writeUint16(local, 26, name.length);
    name.copy(local, 30);
    compressed.copy(local, 30 + name.length);
    locals.push(local);

    const central = Buffer.alloc(46 + name.length);
    writeUint32(central, 0, CENTRAL_DIRECTORY_SIGNATURE);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 10, 8);
    writeUint32(central, 16, checksum);
    writeUint32(central, 20, compressed.length);
    writeUint32(central, 24, entry.data.length);
    writeUint16(central, 28, name.length);
    writeUint32(central, 42, offset);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  writeUint32(end, 0, END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, offset);
  return Buffer.concat([...locals, centralDirectory, end]);
}

export function readZip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let cursor = 0;
  while (cursor + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(cursor);
    if (signature === CENTRAL_DIRECTORY_SIGNATURE || signature === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      break;
    }
    if (signature !== LOCAL_FILE_SIGNATURE) {
      throw new Error("备份压缩包已损坏。");
    }
    const method = buffer.readUInt16LE(cursor + 8);
    const compressedSize = buffer.readUInt32LE(cursor + 18);
    const uncompressedSize = buffer.readUInt32LE(cursor + 22);
    const nameLength = buffer.readUInt16LE(cursor + 26);
    const extraLength = buffer.readUInt16LE(cursor + 28);
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) {
      throw new Error("备份压缩包已损坏。");
    }
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const payload = buffer.subarray(dataStart, dataEnd);
    const data =
      method === 0
        ? Buffer.from(payload)
        : method === 8
          ? inflateRawSync(payload)
          : null;
    if (!data || data.length !== uncompressedSize) {
      throw new Error(`无法读取备份文件：${name}`);
    }
    if (!name.endsWith("/")) {
      files.set(name.replaceAll("\\", "/"), data);
    }
    cursor = dataEnd;
  }
  return files;
}
