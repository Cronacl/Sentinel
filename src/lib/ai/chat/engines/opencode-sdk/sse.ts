import "server-only";

// Sentinel's reader for OpenCode's server-sent events (both generations):
// - each frame is decoded on its own; one that is not JSON is skipped;
// - comments (2.x `: heartbeat`) count as activity;
// - an optional silence limit fails a stream that went quiet.
// The 1.x SDK's own reader retries a dead connection forever and leaves a
// rejected cancel() unhandled when its signal aborts, so it is not used.

export class OpenCode2SilentStreamError extends Error {
  constructor() {
    super("The OpenCode server stopped sending events.");
    this.name = "OpenCode2SilentStreamError";
  }
}

export type OpenCodeEventFrame = { [key: string]: unknown; type: string };

function decodeFrame(block: string): OpenCodeEventFrame | null {
  const data = block
    .split("\n")
    .flatMap((line) =>
      line.startsWith("data:") ? [line.slice(5).replace(/^ /, "")] : [],
    )
    .join("\n");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { type?: unknown }).type === "string"
      ? (parsed as OpenCodeEventFrame)
      : null;
  } catch {
    return null;
  }
}

/**
 * Opens an OpenCode event stream (`/event` on 1.x, `/api/event` on 2.x).
 * Resolves once the server accepted it; the iterable yields every
 * decodable frame and, with `silenceMs`, throws
 * OpenCode2SilentStreamError after that long without a byte. Aborting
 * `signal` ends it (the read rejects; nothing is left unhandled).
 */
export async function openOpenCodeEventStream(input: {
  authorization: string;
  headers?: Record<string, string>;
  signal: AbortSignal;
  /** Null: no silence limit. */
  silenceMs: number | null;
  url: URL;
}): Promise<AsyncIterable<OpenCodeEventFrame>> {
  const silenceMs = input.silenceMs;
  const response = await fetch(input.url, {
    headers: {
      ...input.headers,
      accept: "text/event-stream",
      authorization: input.authorization,
    },
    signal: input.signal,
  });
  const mediaType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (!response.ok || mediaType !== "text/event-stream" || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(
      `OpenCode refused the event stream (HTTP ${response.status}).`,
    );
  }
  const body = response.body;

  return {
    async *[Symbol.asyncIterator]() {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let timer: ReturnType<typeof setTimeout> | null = null;
      let silent = false;
      const arm = () => {
        if (silenceMs === null) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          silent = true;
          void reader.cancel().catch(() => undefined);
        }, silenceMs);
      };
      arm();
      try {
        for (;;) {
          let next: ReadableStreamReadResult<Uint8Array>;
          try {
            next = await reader.read();
          } catch (error) {
            if (silent) throw new OpenCode2SilentStreamError();
            throw error;
          }
          if (silent) throw new OpenCode2SilentStreamError();
          if (next.done) return;
          arm();
          buffer += decoder
            .decode(next.value, { stream: true })
            .replace(/\r\n?/g, "\n");
          for (
            let index = buffer.indexOf("\n\n");
            index !== -1;
            index = buffer.indexOf("\n\n")
          ) {
            const frame = decodeFrame(buffer.slice(0, index));
            buffer = buffer.slice(index + 2);
            if (frame) yield frame;
          }
        }
      } finally {
        if (timer) clearTimeout(timer);
        await reader.cancel().catch(() => undefined);
      }
    },
  };
}
