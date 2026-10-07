import { StringDecoder } from "node:string_decoder";

// Line framing for newline-delimited protocols (JSON-RPC over stdio, NDJSON
// logs). Splits on LF only and strips one trailing CR. Never use
// node:readline for this: it also splits on U+2028/U+2029, which are valid
// inside JSON strings.

export type LineSplitterOptions = {
  /**
   * Drop the buffered partial line once it grows past this many characters
   * (default 16 MiB): a peer that never sends a newline cannot grow the
   * buffer without bound.
   */
  maxBufferedChars?: number;
  onOverflow?: (bufferedChars: number) => void;
};

export type LineSplitter = {
  /** Emits every complete line in `chunk`; keeps the trailing partial line. */
  push(chunk: Buffer | string): void;
  /** Emits the buffered partial line, if any (call on stream end). */
  flush(): void;
};

const DEFAULT_MAX_BUFFERED_CHARS = 16 * 1024 * 1024;

function stripCarriageReturn(line: string) {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

export function createLineSplitter(
  onLine: (line: string) => void,
  options: LineSplitterOptions = {},
): LineSplitter {
  const maxBufferedChars =
    options.maxBufferedChars ?? DEFAULT_MAX_BUFFERED_CHARS;
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  function drain() {
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = stripCarriageReturn(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      onLine(line);
      newlineIndex = buffer.indexOf("\n");
    }

    if (buffer.length > maxBufferedChars) {
      const dropped = buffer.length;
      buffer = "";
      options.onOverflow?.(dropped);
    }
  }

  return {
    flush() {
      buffer += decoder.end();
      if (buffer.length > 0) {
        const line = stripCarriageReturn(buffer);
        buffer = "";
        onLine(line);
      }
    },
    push(chunk) {
      buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
      drain();
    },
  };
}
