import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { Bzip2Error, decodeBzip2 } = await import("./bzip2");

// `bzip2 -c <<< "hello, "` followed by `bzip2 -c` of 1000 "z" bytes.
const CONCATENATED = Buffer.from(
  "QlpoOTFBWSZTWXVqEAUAAAGRAEAEAkSgACGADAFrLhxdyRThQkHVqEAUQlpoOTFBWSZTWT6zhRUAAAGAgYAQAIAACCAAIKptQZi6g8XckU4UJA+s4UVA",
  "base64",
);

function decode(data: Buffer, maxOutputBytes = 1 << 20) {
  return Buffer.concat([...decodeBzip2(data, { maxOutputBytes })]);
}

describe("decodeBzip2", () => {
  it("decodes concatenated streams in order", () => {
    expect(decode(CONCATENATED).toString()).toBe(`hello, ${"z".repeat(1000)}`);
  });

  it("refuses a checksum mismatch, oversized output and non-bzip2 data", () => {
    const corrupt = Buffer.from(CONCATENATED);
    corrupt[10]! ^= 0x01;
    expect(() => decode(corrupt)).toThrow(Bzip2Error);
    expect(() => decode(CONCATENATED, 100)).toThrow(/size limit/);
    expect(() => decode(Buffer.from("hello"))).toThrow(Bzip2Error);
    expect(() => decode(CONCATENATED.subarray(0, 30))).toThrow(Bzip2Error);
  });
});
