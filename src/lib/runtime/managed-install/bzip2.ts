import "server-only";

// A bzip2 decoder for `.tar.bz2` tool archives (some ACP Registry agents,
// e.g. Goose, ship only that format), so extraction never shells out to a
// system `bzip2`/`tar`. It follows the format as bzip2 1.0.8 writes it:
// stream header "BZh1".."BZh9", blocks of Huffman/MTF/RLE2-coded
// Burrows-Wheeler output, RLE1 on top, a CRC per block and per stream;
// concatenated streams (pbzip2, lbzip2) are decoded in order. Randomised
// blocks (written only by bzip2 0.9.0 and older) are refused. Every count
// read from the input is bounds-checked, every CRC is verified, and the
// decoded size is capped by the caller.

export class Bzip2Error extends Error {
  readonly code = "archive_invalid";
}

const BLOCK_MAGIC_HI = 0x314159;
const BLOCK_MAGIC_LO = 0x265359;
const END_MAGIC_HI = 0x177245;
const END_MAGIC_LO = 0x385090;
const MAX_GROUPS = 6;
const MAX_CODE_LENGTH = 20;
const MAX_SELECTORS = 18_002;
const GROUP_SIZE = 50;
const CHUNK_BYTES = 64 * 1024;

// bzip2's CRC-32: polynomial 0x04c11db7, most significant bit first.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

class BitReader {
  private buffer = 0;
  private count = 0;
  private offset: number;

  constructor(
    private readonly data: Uint8Array,
    offset = 0,
  ) {
    this.offset = offset;
  }

  /** Reads `n` (≤ 24) bits, most significant first. */
  bits(n: number) {
    while (this.count < n) {
      if (this.offset >= this.data.length) {
        throw new Bzip2Error("The bzip2 data ends early.");
      }
      this.buffer = ((this.buffer << 8) | this.data[this.offset++]!) >>> 0;
      this.count += 8;
    }
    this.count -= n;
    const value = (this.buffer >>> this.count) & ((1 << n) - 1);
    this.buffer &= (1 << this.count) - 1;
    return value;
  }

  bit() {
    return this.bits(1);
  }

  /** Drops the bits left in the current byte; returns the next byte offset. */
  alignToByte() {
    const offset = this.offset - (this.count >> 3);
    this.buffer = 0;
    this.count = 0;
    this.offset = offset;
    return offset;
  }
}

/** A canonical Huffman decoder (codes assigned by length, then symbol). */
type HuffmanTable = { counts: Uint16Array; symbols: Uint16Array };

function buildTable(lengths: Uint8Array, alphaSize: number): HuffmanTable {
  const counts = new Uint16Array(MAX_CODE_LENGTH + 1);
  for (let symbol = 0; symbol < alphaSize; symbol += 1) {
    const length = lengths[symbol]!;
    counts[length] = counts[length]! + 1;
  }
  const offsets = new Uint16Array(MAX_CODE_LENGTH + 2);
  for (let length = 1; length <= MAX_CODE_LENGTH; length += 1) {
    offsets[length + 1] = offsets[length]! + counts[length]!;
  }
  const symbols = new Uint16Array(alphaSize);
  for (let symbol = 0; symbol < alphaSize; symbol += 1) {
    symbols[offsets[lengths[symbol]!]!++] = symbol;
  }
  return { counts, symbols };
}

function decodeSymbol(reader: BitReader, table: HuffmanTable) {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let length = 1; length <= MAX_CODE_LENGTH; length += 1) {
    code |= reader.bit();
    const count = table.counts[length]!;
    if (code - first < count) {
      return table.symbols[index + code - first]!;
    }
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new Bzip2Error("The bzip2 data has an invalid Huffman code.");
}

/** Reads one block's BWT output into `tt`; returns its length and origPtr. */
function readBlock(reader: BitReader, tt: Uint32Array) {
  if (reader.bit()) {
    throw new Bzip2Error("Randomised bzip2 blocks are not supported.");
  }
  const origPtr = reader.bits(24);

  const seqToUnseq = new Uint8Array(256);
  let inUse = 0;
  const used = reader.bits(16);
  for (let hi = 0; hi < 16; hi += 1) {
    if (!(used & (0x8000 >>> hi))) continue;
    const bits = reader.bits(16);
    for (let lo = 0; lo < 16; lo += 1) {
      if (bits & (0x8000 >>> lo)) seqToUnseq[inUse++] = hi * 16 + lo;
    }
  }
  if (inUse === 0) {
    throw new Bzip2Error("A bzip2 block uses no symbols.");
  }
  const alphaSize = inUse + 2;

  const groups = reader.bits(3);
  const selectorCount = reader.bits(15);
  if (groups < 2 || groups > MAX_GROUPS || selectorCount < 1) {
    throw new Bzip2Error("A bzip2 block has an invalid table header.");
  }
  // bzip2 1.0.8 reads (and ignores) selectors past 18002.
  const selectors = new Uint8Array(Math.min(selectorCount, MAX_SELECTORS));
  const order = Array.from({ length: groups }, (_, index) => index);
  for (let index = 0; index < selectorCount; index += 1) {
    let position = 0;
    while (reader.bit()) {
      position += 1;
      if (position >= groups) {
        throw new Bzip2Error("A bzip2 block has an invalid selector.");
      }
    }
    const group = order[position]!;
    order.splice(position, 1);
    order.unshift(group);
    if (index < selectors.length) selectors[index] = group;
  }

  const tables: HuffmanTable[] = [];
  for (let group = 0; group < groups; group += 1) {
    const lengths = new Uint8Array(alphaSize);
    let length = reader.bits(5);
    for (let symbol = 0; symbol < alphaSize; symbol += 1) {
      for (;;) {
        if (length < 1 || length > MAX_CODE_LENGTH) {
          throw new Bzip2Error("A bzip2 block has an invalid code length.");
        }
        if (!reader.bit()) break;
        length += reader.bit() ? -1 : 1;
      }
      lengths[symbol] = length;
    }
    tables.push(buildTable(lengths, alphaSize));
  }

  const endOfBlock = inUse + 1;
  const mtf = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) mtf[index] = index;
  const counts = new Uint32Array(256);
  let length = 0;
  let selectorIndex = 0;
  let groupLeft = 0;
  let table = tables[0]!;
  const next = () => {
    if (groupLeft === 0) {
      if (selectorIndex >= selectors.length) {
        throw new Bzip2Error("A bzip2 block runs past its selectors.");
      }
      table = tables[selectors[selectorIndex++]!]!;
      groupLeft = GROUP_SIZE;
    }
    groupLeft -= 1;
    return decodeSymbol(reader, table);
  };

  let symbol = next();
  for (;;) {
    if (symbol <= 1) {
      // RUNA/RUNB: a bijective base-2 run of the front MTF symbol.
      let run = 0;
      let weight = 1;
      do {
        if (weight > tt.length) {
          throw new Bzip2Error("A bzip2 run is too long.");
        }
        run += symbol === 0 ? weight : weight * 2;
        weight *= 2;
        symbol = next();
      } while (symbol <= 1);
      if (length + run > tt.length) {
        throw new Bzip2Error("A bzip2 block is larger than its header says.");
      }
      const byte = seqToUnseq[mtf[0]!]!;
      counts[byte] = counts[byte]! + run;
      tt.fill(byte, length, length + run);
      length += run;
      continue;
    }
    if (symbol === endOfBlock) break;
    if (symbol > endOfBlock || length >= tt.length) {
      throw new Bzip2Error("A bzip2 block is larger than its header says.");
    }
    const position = symbol - 1;
    const value = mtf[position]!;
    mtf.copyWithin(1, 0, position);
    mtf[0] = value;
    const byte = seqToUnseq[value]!;
    counts[byte] = counts[byte]! + 1;
    tt[length++] = byte;
    symbol = next();
  }
  if (origPtr >= length) {
    throw new Bzip2Error("A bzip2 block has an invalid origin pointer.");
  }

  // Inverse BWT: link each position to the next in the original order.
  let sum = 0;
  const starts = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte += 1) {
    starts[byte] = sum;
    sum += counts[byte]!;
  }
  for (let index = 0; index < length; index += 1) {
    const byte = tt[index]! & 0xff;
    tt[starts[byte]!++]! |= index << 8;
  }
  return { length, origPtr };
}

/**
 * Decodes a complete bzip2 file, yielding the output in chunks so a
 * consumer applies backpressure per chunk. Throws Bzip2Error for malformed
 * input, a CRC mismatch, or output beyond `maxOutputBytes`.
 */
export function* decodeBzip2(
  data: Uint8Array,
  options: { maxOutputBytes: number; signal?: AbortSignal },
): Generator<Buffer> {
  let offset = 0;
  let streams = 0;
  let total = 0;
  let out = Buffer.allocUnsafe(CHUNK_BYTES);
  let outLength = 0;

  while (
    offset + 4 <= data.length &&
    data[offset] === 0x42 &&
    data[offset + 1] === 0x5a &&
    data[offset + 2] === 0x68
  ) {
    const level = data[offset + 3]! - 0x30;
    if (level < 1 || level > 9) {
      throw new Bzip2Error("The bzip2 header has an invalid block size.");
    }
    streams += 1;
    const reader = new BitReader(data, offset + 4);
    const tt = new Uint32Array(level * 100_000);
    let combined = 0;

    for (;;) {
      options.signal?.throwIfAborted();
      const hi = reader.bits(24);
      const lo = reader.bits(24);
      const storedCrc = ((reader.bits(16) << 16) | reader.bits(16)) >>> 0;
      if (hi === END_MAGIC_HI && lo === END_MAGIC_LO) {
        if (storedCrc !== combined) {
          throw new Bzip2Error("The bzip2 stream checksum does not match.");
        }
        break;
      }
      if (hi !== BLOCK_MAGIC_HI || lo !== BLOCK_MAGIC_LO) {
        throw new Bzip2Error("The bzip2 data has an invalid block header.");
      }

      const block = readBlock(reader, tt);
      let crc = 0xffffffff;
      let position = tt[block.origPtr]! >>> 8;
      let previous = -1;
      let repeats = 0;
      const emit = (byte: number) => {
        crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]!) >>> 0;
        out[outLength++] = byte;
        return outLength === CHUNK_BYTES;
      };
      for (let index = 0; index < block.length; index += 1) {
        const entry = tt[position]!;
        position = entry >>> 8;
        const byte = entry & 0xff;
        let copies = 1;
        let value = byte;
        if (repeats === 4) {
          // RLE1: four equal bytes are followed by a count of extra copies.
          copies = byte;
          value = previous;
          repeats = 0;
        } else if (byte === previous) {
          repeats += 1;
        } else {
          previous = byte;
          repeats = 1;
        }
        total += copies;
        if (total > options.maxOutputBytes) {
          throw new Bzip2Error("The bzip2 data expands past the size limit.");
        }
        for (let copy = 0; copy < copies; copy += 1) {
          if (emit(value)) {
            yield out;
            out = Buffer.allocUnsafe(CHUNK_BYTES);
            outLength = 0;
          }
        }
      }
      crc = ~crc >>> 0;
      if (crc !== storedCrc) {
        throw new Bzip2Error("A bzip2 block checksum does not match.");
      }
      combined = (((combined << 1) | (combined >>> 31)) ^ crc) >>> 0;
    }
    offset = reader.alignToByte();
  }
  if (streams === 0) {
    throw new Bzip2Error("The file is not bzip2 data.");
  }
  if (outLength > 0) {
    yield out.subarray(0, outLength);
  }
}
