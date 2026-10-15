// Test-only archive builders for the managed-install tests: minimal ustar
// and zip writers, enough to produce well-formed and hostile archives
// without shelling out to `tar`/`zip`. App code never imports this module.
import { deflateRawSync, gzipSync } from "node:zlib";

import { crc32 } from "./archive";

export type TarFixtureEntry = {
  data?: Buffer | string;
  linkname?: string;
  mode?: number;
  name: string;
  /** "0" file, "5" directory, "2" symlink, "1" hard link, "L" long name. */
  type?: string;
};

function octal(value: number, width: number) {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

function tarHeader(entry: TarFixtureEntry, size: number) {
  const block = Buffer.alloc(512);
  block.write(entry.name.slice(0, 100), 0, 100, "utf8");
  block.write(octal(entry.mode ?? 0o644, 8), 100, 8, "latin1");
  block.write(octal(0, 8), 108, 8, "latin1");
  block.write(octal(0, 8), 116, 8, "latin1");
  block.write(octal(size, 12), 124, 12, "latin1");
  block.write(octal(0, 12), 136, 12, "latin1");
  block.fill(0x20, 148, 156);
  block.write(entry.type ?? "0", 156, 1, "latin1");
  block.write(entry.linkname ?? "", 157, 100, "utf8");
  block.write("ustar\0", 257, 6, "latin1");
  block.write("00", 263, 2, "latin1");
  let sum = 0;
  for (const byte of block) {
    sum += byte;
  }
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return block;
}

export function buildTar(entries: TarFixtureEntry[]) {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "");
    parts.push(tarHeader(entry, data.length));
    parts.push(data);
    parts.push(Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

export function buildTarGz(entries: TarFixtureEntry[]) {
  return gzipSync(buildTar(entries));
}

export type ZipFixtureEntry = {
  data?: Buffer | string;
  /** Unix mode with type bits (0o100755, 0o120777 for a symlink…). */
  mode?: number;
  method?: 0 | 8;
  name: string;
  /** Overrides the CRC written to the directory. */
  crc?: number;
};

export function buildZip(entries: ZipFixtureEntry[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "");
    const method = entry.method ?? 8;
    const compressed = method === 8 ? deflateRawSync(data) : data;
    const name = Buffer.from(entry.name, "utf8");
    const crc = entry.crc ?? crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
