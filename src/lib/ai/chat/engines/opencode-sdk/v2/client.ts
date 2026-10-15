import "server-only";

import { OpenCode } from "@opencode/client/promise";

import { openOpenCodeEventStream } from "../sse";

// The OpenCode 2.x client (design acp-and-agents §5): the generated
// Promise client of @opencode/client for requests, plus Sentinel's own
// reader for `/api/event` (../sse.ts). The client's `event.subscribe`
// throws on the first frame it cannot parse and has no silence limit
// (after t3code OpenCode2Client.ts, MIT): 2.x writes a `: heartbeat`
// every 10-15 s, so 45 s without a byte means the server is stuck.

export type OpenCode2Client = ReturnType<typeof OpenCode.make>;

export const OPENCODE2_SILENT_STREAM_TIMEOUT_MS = 45_000;

export function createOpenCode2Client(input: {
  authorization: string;
  baseUrl: string;
}): OpenCode2Client {
  return OpenCode.make({
    baseUrl: input.baseUrl,
    headers: { Authorization: input.authorization },
  });
}

export {
  OpenCode2SilentStreamError,
  type OpenCodeEventFrame as OpenCode2EventFrame,
} from "../sse";

/**
 * Subscribes to `/api/event`. Resolves once the server accepted the
 * subscription (the stream is volatile: subscribe before starting the work
 * whose events are needed); the iterable then yields every decodable
 * frame and throws OpenCode2SilentStreamError after `silenceMs` without a
 * byte. Aborting `signal` ends it.
 */
export function openOpenCode2EventStream(input: {
  authorization: string;
  baseUrl: string;
  signal: AbortSignal;
  silenceMs?: number;
}) {
  return openOpenCodeEventStream({
    authorization: input.authorization,
    signal: input.signal,
    silenceMs: input.silenceMs ?? OPENCODE2_SILENT_STREAM_TIMEOUT_MS,
    url: new URL("/api/event", input.baseUrl),
  });
}
