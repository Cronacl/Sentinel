import { describe, expect, it } from "bun:test";

import { createLineSplitter } from "./line-splitter";

function collect(options?: Parameters<typeof createLineSplitter>[1]) {
  const lines: string[] = [];
  const splitter = createLineSplitter((line) => lines.push(line), options);
  return { lines, splitter };
}

describe("createLineSplitter", () => {
  it("emits complete lines across chunks and keeps the partial tail", () => {
    const { lines, splitter } = collect();

    splitter.push('{"a":1}\n{"b"');
    expect(lines).toEqual(['{"a":1}']);

    splitter.push(":2}\n\n");
    expect(lines).toEqual(['{"a":1}', '{"b":2}', ""]);
  });

  it("splits on LF only and strips one trailing CR", () => {
    const { lines, splitter } = collect();

    splitter.push('{"text":"a b c"}\r\nnext\r\r\n');

    expect(lines).toEqual(['{"text":"a b c"}', "next\r"]);
  });

  it("decodes multi-byte characters split across Buffer chunks", () => {
    const { lines, splitter } = collect();
    const bytes = Buffer.from("héllo\n", "utf8");

    splitter.push(bytes.subarray(0, 2));
    splitter.push(bytes.subarray(2));

    expect(lines).toEqual(["héllo"]);
  });

  it("flushes the last unterminated line", () => {
    const { lines, splitter } = collect();

    splitter.push("tail\r");
    splitter.flush();
    splitter.flush();

    expect(lines).toEqual(["tail"]);
  });

  it("drops a partial line that grows past the limit", () => {
    const overflows: number[] = [];
    const { lines, splitter } = collect({
      maxBufferedChars: 4,
      onOverflow: (size) => overflows.push(size),
    });

    splitter.push("abcdef");
    splitter.push("gh\nok\n");

    expect(overflows).toEqual([6]);
    expect(lines).toEqual(["gh", "ok"]);
  });
});
