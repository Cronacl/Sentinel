import "server-only";

import { constants as fsConstants, createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  realpath,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createInflateRaw } from "node:zlib";

// Safe extraction of downloaded tool archives (zip, tar, tar.gz) into a
// directory Sentinel owns, without shelling out to `tar`/`unzip`:
// - every member path is relative, with no `..` segment, no drive letter
//   and no NUL; members are written below the destination only, checked
//   against the real path of their parent (a symlink member cannot redirect
//   a later member outside the tree);
// - symlinks must point inside the tree and are created last, once every
//   file and directory is written, so no member is ever written through a
//   link; once all exist, each must still resolve inside the tree (a chain
//   of links cannot climb out); hard links are copies of a member already
//   extracted; devices and FIFOs are skipped;
// - entry count and total extracted bytes are capped (zip bombs), zip
//   members must match their declared size and CRC-32;
// - modes are normalized (0755 for executables, 0644 otherwise), so no
//   setuid bit or world-writable file is created;
// - files are created exclusively: a duplicate member is an error.
// Encrypted and ZIP64 archives are refused. Formats the registry may add
// later (bz2, xz) are refused too rather than handed to a system tool.

export type ArchiveKind = "raw" | "tar" | "tar.gz" | "zip";

export class ArchiveError extends Error {
  readonly code = "archive_invalid";
}

export type ExtractLimits = {
  maxEntries: number;
  maxTotalBytes: number;
};

export const DEFAULT_EXTRACT_LIMITS: ExtractLimits = {
  maxEntries: 50_000,
  maxTotalBytes: 4 * 1024 * 1024 * 1024,
};

const SYMLINK_TARGET_MAX_BYTES = 4_096;

/** The archive kind a download URL or file name names. */
export function detectArchiveKind(name: string): ArchiveKind {
  let pathname = name;
  try {
    pathname = new URL(name).pathname;
  } catch {
    // A plain file name.
  }
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".tar")) return "tar";
  if (/\.(?:tar\.)?(?:bz2|xz|zst|7z|rar)$|\.tbz2?$|\.txz$/.test(lower)) {
    throw new ArchiveError(`Unsupported archive format: ${pathname}`);
  }
  return "raw";
}

/**
 * A member path as a safe relative path ("a/b/c"), null for the archive
 * root itself ("./"), or an ArchiveError for anything that could escape.
 */
export function toSafeRelativePath(name: string): string | null {
  if (name.includes("\0")) {
    throw new ArchiveError("An archive member has a NUL in its name.");
  }
  const slashed = name.replaceAll("\\", "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) {
    throw new ArchiveError(`Archive member "${name}" has an absolute path.`);
  }
  const segments = slashed.split("/").filter((part) => part && part !== ".");
  if (segments.some((part) => part === "..")) {
    throw new ArchiveError(`Archive member "${name}" escapes the archive.`);
  }
  // NTFS reads "name:stream" as an alternate data stream.
  if (segments.some((part) => part.includes(":"))) {
    throw new ArchiveError(`Archive member "${name}" has an invalid name.`);
  }
  return segments.length > 0 ? segments.join("/") : null;
}

export function isPathInside(child: string, root: string) {
  const relative = path.relative(root, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function normalizedFileMode(mode: number) {
  return mode & 0o111 ? 0o755 : 0o644;
}

// CRC-32 (IEEE 802.3), table-driven, for zip member checks.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, previous = 0) {
  let crc = ~previous >>> 0;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return ~crc >>> 0;
}

type ExtractContext = {
  entries: number;
  limits: ExtractLimits;
  /** Symlinks to create once everything else is written. */
  links: Array<{ relativePath: string; target: string }>;
  root: string;
  signal?: AbortSignal;
  totalBytes: number;
};

function checkAborted(context: ExtractContext) {
  if (context.signal?.aborted) {
    throw context.signal.reason instanceof Error
      ? context.signal.reason
      : new Error("Extraction was cancelled.");
  }
}

function countEntry(context: ExtractContext) {
  context.entries += 1;
  if (context.entries > context.limits.maxEntries) {
    throw new ArchiveError("The archive has too many members.");
  }
}

async function ensureParent(context: ExtractContext, relativePath: string) {
  const target = path.join(context.root, ...relativePath.split("/"));
  const parent = path.dirname(target);
  await mkdir(parent, { mode: 0o755, recursive: true });
  const realParent = await realpath(parent);
  if (!isPathInside(realParent, context.root)) {
    throw new ArchiveError(
      `Archive member "${relativePath}" would be written outside the archive.`,
    );
  }
  return path.join(realParent, path.basename(target));
}

async function writeDirectory(context: ExtractContext, relativePath: string) {
  countEntry(context);
  const target = await ensureParent(context, relativePath);
  const existing = await lstat(target).catch(() => null);
  if (existing && !existing.isDirectory()) {
    throw new ArchiveError(`Archive member "${relativePath}" is duplicated.`);
  }
  if (!existing) {
    await mkdir(target, { mode: 0o755 });
  }
}

/** Counts bytes against the archive's cap and the member's declared size. */
function byteCounter(
  context: ExtractContext,
  relativePath: string,
  declaredSize: number | null,
) {
  let written = 0;
  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      written += chunk.byteLength;
      context.totalBytes += chunk.byteLength;
      if (context.totalBytes > context.limits.maxTotalBytes) {
        callback(new ArchiveError("The archive expands beyond its size cap."));
        return;
      }
      if (declaredSize !== null && written > declaredSize) {
        callback(
          new ArchiveError(
            `Archive member "${relativePath}" is larger than declared.`,
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
  return { transform, written: () => written };
}

async function writeFileEntry(
  context: ExtractContext,
  input: {
    declaredSize: number | null;
    mode: number;
    relativePath: string;
    source: Readable;
    verify?: (bytes: number) => void;
  },
) {
  countEntry(context);
  const target = await ensureParent(context, input.relativePath);
  const handle = await open(
    target,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
    0o600,
  ).catch((error: NodeJS.ErrnoException) => {
    throw error.code === "EEXIST"
      ? new ArchiveError(
          `Archive member "${input.relativePath}" is duplicated.`,
        )
      : error;
  });
  const counter = byteCounter(context, input.relativePath, input.declaredSize);
  try {
    await pipeline(
      input.source,
      counter.transform,
      handle.createWriteStream(),
      context.signal ? { signal: context.signal } : {},
    );
  } finally {
    await handle.close().catch(() => undefined);
  }
  if (input.declaredSize !== null && counter.written() !== input.declaredSize) {
    throw new ArchiveError(
      `Archive member "${input.relativePath}" is truncated.`,
    );
  }
  input.verify?.(counter.written());
  await chmod(target, normalizedFileMode(input.mode));
}

function queueSymlink(
  context: ExtractContext,
  relativePath: string,
  linkTarget: string,
) {
  countEntry(context);
  const outside = new ArchiveError(
    `Archive symlink "${relativePath}" points outside the archive.`,
  );
  if (
    !linkTarget ||
    linkTarget.includes("\0") ||
    path.isAbsolute(linkTarget) ||
    /^[A-Za-z]:/.test(linkTarget)
  ) {
    throw outside;
  }
  const location = path.join(context.root, ...relativePath.split("/"));
  if (
    !isPathInside(
      path.resolve(path.dirname(location), linkTarget),
      context.root,
    )
  ) {
    throw outside;
  }
  context.links.push({ relativePath, target: linkTarget });
}

async function createSymlinks(context: ExtractContext) {
  const created: string[] = [];
  for (const link of context.links) {
    checkAborted(context);
    const location = await ensureParent(context, link.relativePath);
    await symlink(link.target, location).catch(
      (error: NodeJS.ErrnoException) => {
        throw error.code === "EEXIST"
          ? new ArchiveError(
              `Archive member "${link.relativePath}" is duplicated.`,
            )
          : error;
      },
    );
    created.push(location);
  }
  // Only now can a chain of links be followed to its end.
  for (const [index, location] of created.entries()) {
    const real = await realpath(location).catch(() => null);
    if (real && !isPathInside(real, context.root)) {
      throw new ArchiveError(
        `Archive symlink "${context.links[index]!.relativePath}" points outside the archive.`,
      );
    }
  }
}

async function writeHardLink(
  context: ExtractContext,
  relativePath: string,
  linkName: string,
) {
  const sourceRelative = toSafeRelativePath(linkName);
  if (!sourceRelative) {
    throw new ArchiveError(`Archive link "${relativePath}" has no target.`);
  }
  const source = await realpath(
    path.join(context.root, ...sourceRelative.split("/")),
  ).catch(() => null);
  if (!source || !isPathInside(source, context.root)) {
    throw new ArchiveError(
      `Archive link "${relativePath}" points outside the archive.`,
    );
  }
  const stats = await lstat(source);
  if (!stats.isFile()) {
    throw new ArchiveError(`Archive link "${relativePath}" is not a file.`);
  }
  countEntry(context);
  context.totalBytes += stats.size;
  if (context.totalBytes > context.limits.maxTotalBytes) {
    throw new ArchiveError("The archive expands beyond its size cap.");
  }
  const target = await ensureParent(context, relativePath);
  await copyFile(source, target, fsConstants.COPYFILE_EXCL);
  await chmod(target, normalizedFileMode(stats.mode));
}

// --- zip ----------------------------------------------------------------

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_UNIX_HOST = 3;

type ZipEntry = {
  compressedSize: number;
  crc: number;
  externalAttributes: number;
  flags: number;
  hostSystem: number;
  localHeaderOffset: number;
  method: number;
  name: string;
  uncompressedSize: number;
};

async function readZipEntries(
  handle: Awaited<ReturnType<typeof open>>,
  size: number,
  limits: ExtractLimits,
) {
  const tailSize = Math.min(size, 0xffff + 22);
  const tail = Buffer.alloc(tailSize);
  await handle.read(tail, 0, tailSize, size - tailSize);
  let eocd = -1;
  for (let index = tailSize - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === ZIP_EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    throw new ArchiveError("The download is not a zip archive.");
  }

  const count = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  if (
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    throw new ArchiveError("ZIP64 archives are not supported.");
  }
  if (count > limits.maxEntries) {
    throw new ArchiveError("The archive has too many members.");
  }
  if (directoryOffset + directorySize > size) {
    throw new ArchiveError("The zip archive is truncated.");
  }

  const directory = Buffer.alloc(directorySize);
  await handle.read(directory, 0, directorySize, directoryOffset);
  const entries: ZipEntry[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    if (
      offset + 46 > directory.length ||
      directory.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE
    ) {
      throw new ArchiveError("The zip directory is corrupt.");
    }
    const flags = directory.readUInt16LE(offset + 8);
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);
    const nameBytes = directory.subarray(offset + 46, offset + 46 + nameLength);
    entries.push({
      compressedSize: directory.readUInt32LE(offset + 20),
      crc: directory.readUInt32LE(offset + 16),
      externalAttributes: directory.readUInt32LE(offset + 38),
      flags,
      hostSystem: directory.readUInt16LE(offset + 4) >> 8,
      localHeaderOffset: directory.readUInt32LE(offset + 42),
      method: directory.readUInt16LE(offset + 10),
      // Bit 11: UTF-8 names; older tools write their code page.
      name: nameBytes.toString(flags & 0x800 ? "utf8" : "latin1"),
      uncompressedSize: directory.readUInt32LE(offset + 24),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function zipEntryStream(
  archivePath: string,
  handle: Awaited<ReturnType<typeof open>>,
  size: number,
  entry: ZipEntry,
): Promise<Readable> {
  const local = Buffer.alloc(30);
  await handle.read(local, 0, 30, entry.localHeaderOffset);
  if (local.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE) {
    throw new ArchiveError(`Zip member "${entry.name}" is corrupt.`);
  }
  const dataStart =
    entry.localHeaderOffset +
    30 +
    local.readUInt16LE(26) +
    local.readUInt16LE(28);
  if (dataStart + entry.compressedSize > size) {
    throw new ArchiveError(`Zip member "${entry.name}" is truncated.`);
  }

  const raw =
    entry.compressedSize === 0
      ? Readable.from([])
      : createReadStream(archivePath, {
          end: dataStart + entry.compressedSize - 1,
          start: dataStart,
        });
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      throw new ArchiveError(`Zip member "${entry.name}" is corrupt.`);
    }
    return raw;
  }
  if (entry.method === 8) {
    return raw.pipe(createInflateRaw());
  }
  throw new ArchiveError(
    `Zip member "${entry.name}" uses an unsupported compression method.`,
  );
}

async function readSmallStream(stream: Readable, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += (chunk as Buffer).byteLength;
    if (total > maxBytes) {
      stream.destroy();
      throw new ArchiveError("An archive symlink target is too long.");
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function extractZip(archivePath: string, context: ExtractContext) {
  const handle = await open(archivePath, "r");
  try {
    const { size } = await handle.stat();
    const entries = await readZipEntries(handle, size, context.limits);
    for (const entry of entries) {
      checkAborted(context);
      if (entry.flags & 0x1) {
        throw new ArchiveError("Encrypted zip archives are not supported.");
      }
      const relativePath = toSafeRelativePath(entry.name);
      if (!relativePath) {
        continue;
      }

      const unixMode =
        entry.hostSystem === ZIP_UNIX_HOST
          ? entry.externalAttributes >>> 16
          : 0;
      const type = unixMode & 0o170000;
      const isDirectory =
        entry.name.endsWith("/") ||
        entry.name.endsWith("\\") ||
        type === 0o040000 ||
        (entry.externalAttributes & 0x10) !== 0;
      if (isDirectory) {
        await writeDirectory(context, relativePath);
        continue;
      }
      if (type === 0o120000) {
        const target = await readSmallStream(
          await zipEntryStream(archivePath, handle, size, entry),
          SYMLINK_TARGET_MAX_BYTES,
        );
        queueSymlink(context, relativePath, target);
        continue;
      }
      if (type !== 0 && type !== 0o100000) {
        // Devices, FIFOs, sockets: never extracted.
        continue;
      }

      let crc = 0;
      const source = (
        await zipEntryStream(archivePath, handle, size, entry)
      ).pipe(
        new Transform({
          transform(chunk: Buffer, _encoding, callback: TransformCallback) {
            crc = crc32(chunk, crc);
            callback(null, chunk);
          },
        }),
      );
      await writeFileEntry(context, {
        declaredSize: entry.uncompressedSize,
        mode: unixMode,
        relativePath,
        source,
        verify: () => {
          if (crc !== entry.crc) {
            throw new ArchiveError(
              `Zip member "${relativePath}" failed its CRC-32 check.`,
            );
          }
        },
      });
    }
  } finally {
    await handle.close();
  }
}

// --- tar ----------------------------------------------------------------

/** Reads exact byte counts from a stream of chunks. */
class ChunkReader {
  private buffered: Buffer[] = [];
  private bufferedBytes = 0;
  private done = false;
  private readonly iterator: AsyncIterator<Buffer>;

  constructor(source: AsyncIterable<Buffer>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  private async fill(bytes: number) {
    while (this.bufferedBytes < bytes && !this.done) {
      const next = await this.iterator.next();
      if (next.done) {
        this.done = true;
        break;
      }
      const chunk = Buffer.isBuffer(next.value)
        ? next.value
        : Buffer.from(next.value);
      this.buffered.push(chunk);
      this.bufferedBytes += chunk.byteLength;
    }
  }

  private take(bytes: number) {
    const all = Buffer.concat(this.buffered);
    this.buffered = all.byteLength > bytes ? [all.subarray(bytes)] : [];
    this.bufferedBytes = all.byteLength - bytes;
    return all.subarray(0, bytes);
  }

  /** Exactly `bytes`, or null at a clean end of stream. */
  async read(bytes: number) {
    await this.fill(bytes);
    if (this.bufferedBytes === 0 && this.done) {
      return null;
    }
    if (this.bufferedBytes < bytes) {
      throw new ArchiveError("The tar archive is truncated.");
    }
    return this.take(bytes);
  }

  /** `bytes` as a stream of chunks, without holding them all. */
  async *stream(bytes: number) {
    let remaining = bytes;
    while (remaining > 0) {
      await this.fill(1);
      if (this.bufferedBytes === 0) {
        throw new ArchiveError("The tar archive is truncated.");
      }
      const size = Math.min(remaining, this.bufferedBytes);
      remaining -= size;
      yield this.take(size);
    }
  }

  async skip(bytes: number) {
    for await (const _chunk of this.stream(bytes)) {
      // Discarded.
    }
  }

  async close() {
    await this.iterator.return?.();
  }
}

function readTarString(block: Buffer, start: number, length: number) {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

function readTarNumber(block: Buffer, start: number, length: number) {
  const field = block.subarray(start, start + length);
  if (field[0]! & 0x80) {
    // GNU base-256: big-endian, first byte's high bit set.
    let value = field[0]! & 0x7f;
    for (let index = 1; index < field.length; index += 1) {
      value = value * 256 + field[index]!;
    }
    return value;
  }
  const text = readTarString(block, start, length).trim();
  if (!text) {
    return 0;
  }
  if (!/^[0-7]+$/.test(text)) {
    throw new ArchiveError("The tar archive has a corrupt header.");
  }
  return Number.parseInt(text, 8);
}

function tarChecksumMatches(block: Buffer) {
  const expected = readTarNumber(block, 148, 8);
  let sum = 0;
  for (let index = 0; index < 512; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : block[index]!;
  }
  return sum === expected;
}

function parsePaxRecords(data: Buffer) {
  const records: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(data.subarray(offset, space).toString(), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = data
      .subarray(space + 1, offset + length - 1)
      .toString("utf8");
    const equals = record.indexOf("=");
    if (equals > 0) {
      records[record.slice(0, equals)] = record.slice(equals + 1);
    }
    offset += length;
  }
  return records;
}

const TAR_METADATA_MAX_BYTES = 1024 * 1024;

async function extractTar(source: Readable, context: ExtractContext) {
  const reader = new ChunkReader(source as AsyncIterable<Buffer>);
  let longName: string | null = null;
  let longLink: string | null = null;
  let pax: Record<string, string> = {};

  try {
    for (;;) {
      checkAborted(context);
      const block = await reader.read(512);
      if (!block || block.every((byte) => byte === 0)) {
        break;
      }
      if (!tarChecksumMatches(block)) {
        throw new ArchiveError("The tar archive has a corrupt header.");
      }

      const type = String.fromCharCode(block[156] || 0x30);
      const declared = readTarNumber(block, 124, 12);
      const size = pax.size !== undefined ? Number(pax.size) : declared;
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new ArchiveError("The tar archive has a corrupt header.");
      }
      const padding = (512 - (size % 512)) % 512;

      if (type === "L" || type === "K" || type === "x" || type === "g") {
        if (size > TAR_METADATA_MAX_BYTES) {
          throw new ArchiveError("The tar archive has an oversized header.");
        }
        const data = (await reader.read(size)) ?? Buffer.alloc(0);
        await reader.skip(padding);
        if (type === "L") longName = data.toString("utf8").replace(/\0+$/, "");
        if (type === "K") longLink = data.toString("utf8").replace(/\0+$/, "");
        if (type === "x") pax = parsePaxRecords(data);
        continue;
      }

      const ustar = block.subarray(257, 262).toString("latin1") === "ustar";
      const prefix = ustar ? readTarString(block, 345, 155) : "";
      const headerName = readTarString(block, 0, 100);
      const name =
        pax.path ??
        longName ??
        (prefix ? `${prefix}/${headerName}` : headerName);
      const linkName =
        pax.linkpath ?? longLink ?? readTarString(block, 157, 100);
      const mode = readTarNumber(block, 100, 8);
      longName = null;
      longLink = null;
      pax = {};

      const relativePath = toSafeRelativePath(name);
      if (!relativePath) {
        await reader.skip(size + padding);
        continue;
      }

      if (type === "0" || type === "\0" || type === "7") {
        await writeFileEntry(context, {
          declaredSize: size,
          mode,
          relativePath,
          source: Readable.from(reader.stream(size)),
        });
        await reader.skip(padding);
      } else if (type === "5") {
        await writeDirectory(context, relativePath);
        await reader.skip(size + padding);
      } else if (type === "2") {
        queueSymlink(context, relativePath, linkName);
        await reader.skip(size + padding);
      } else if (type === "1") {
        await writeHardLink(context, relativePath, linkName);
        await reader.skip(size + padding);
      } else {
        // Devices, FIFOs and unknown types: skipped.
        await reader.skip(size + padding);
      }
    }
  } finally {
    await reader.close();
    source.destroy();
  }
}

/**
 * Extracts `archivePath` into `destination` (created if missing; it should
 * be a fresh staging directory). Throws ArchiveError for anything unsafe;
 * the caller removes the staging directory on failure.
 */
export async function extractArchive(input: {
  archivePath: string;
  destination: string;
  kind: Exclude<ArchiveKind, "raw">;
  limits?: Partial<ExtractLimits>;
  signal?: AbortSignal;
}) {
  await mkdir(input.destination, { mode: 0o755, recursive: true });
  const context: ExtractContext = {
    entries: 0,
    limits: { ...DEFAULT_EXTRACT_LIMITS, ...input.limits },
    links: [],
    root: await realpath(input.destination),
    signal: input.signal,
    totalBytes: 0,
  };

  if (input.kind === "zip") {
    await extractZip(input.archivePath, context);
  } else {
    const file = createReadStream(input.archivePath);
    const source = input.kind === "tar.gz" ? file.pipe(createGunzip()) : file;
    if (input.kind === "tar.gz") {
      file.on("error", (error) => source.destroy(error));
    }
    await extractTar(source, context);
  }
  await createSymlinks(context);

  return { entries: context.entries, totalBytes: context.totalBytes };
}
