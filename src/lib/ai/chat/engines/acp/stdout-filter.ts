import type { Readable } from "node:stream";

import { createLineSplitter } from "@/lib/runtime/process/line-splitter";

// Trap 2 (design acp-and-agents §2.1): the SDK's ndJsonStream answers every
// stdout line that is not JSON by writing a -32700 parse-error response back
// to the agent, and a scalar JSON line by an invalid-request response. Agents
// print banners and sign-in URLs on stdout, so the agent's stdout goes
// through this filter first: only lines that parse as a JSON object or array
// reach the SDK, everything else goes to `onNoise` (URL capture, logs).

/** True when the line is a JSON-RPC frame candidate (object or array). */
export function isJsonFrameLine(line: string) {
  const trimmed = line.trim();
  const first = trimmed[0];
  if (first !== "{" && first !== "[") {
    return false;
  }

  try {
    const value: unknown = JSON.parse(trimmed);
    return value !== null && typeof value === "object";
  } catch {
    return false;
  }
}

export type JsonLineFilterOptions = {
  /** Every non-empty line that is not a frame. */
  onNoise?: (line: string) => void;
  /** A frame larger than this is dropped (default 32 MiB, the SDK's limit). */
  maxLineChars?: number;
};

const DEFAULT_MAX_LINE_CHARS = 32 * 1024 * 1024;

/**
 * The agent's stdout as a byte stream that only carries JSON frames, one
 * per LF-terminated line, for `ndJsonStream`. Splits on LF only (never on
 * U+2028/2029, which are valid inside JSON strings).
 */
export function createJsonLineStream(
  source: Readable,
  options: JsonLineFilterOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let done = false;

  const splitter = createLineSplitter(
    (line) => {
      if (done || !line.trim()) {
        return;
      }
      if (isJsonFrameLine(line)) {
        controller?.enqueue(encoder.encode(`${line.trim()}\n`));
        return;
      }
      options.onNoise?.(line);
    },
    {
      maxBufferedChars: options.maxLineChars ?? DEFAULT_MAX_LINE_CHARS,
      onOverflow: (chars) =>
        options.onNoise?.(`[dropped an unterminated ${chars}-char line]`),
    },
  );

  const onData = (chunk: Buffer | string) => splitter.push(chunk);
  const finish = () => {
    if (done) {
      return;
    }
    splitter.flush();
    done = true;
    try {
      controller?.close();
    } catch {
      // Already closed or errored.
    }
  };
  const fail = (error: unknown) => {
    if (done) {
      return;
    }
    done = true;
    try {
      controller?.error(error);
    } catch {
      // Already closed.
    }
  };

  return new ReadableStream<Uint8Array>({
    cancel() {
      done = true;
      source.off("data", onData);
    },
    start(nextController) {
      controller = nextController;
      source.on("data", onData);
      source.once("end", finish);
      source.once("close", finish);
      source.once("error", fail);
    },
  });
}
