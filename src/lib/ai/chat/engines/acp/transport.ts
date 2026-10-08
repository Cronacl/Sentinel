import * as acp from "@agentclientprotocol/sdk";

import {
  ACP_V1_METHODS,
  SENTINEL_SESSION_UPDATE_METHOD,
  type AcpMethodTable,
} from "./method-table";
import { asRecord } from "./schema";

// The client end of an ACP connection on @agentclientprotocol/sdk 1.7:
//
//   agent stdout ─▶ stdout-filter (trap 2) ─▶ ndJsonStream ─▶ inbound rewrite
//   (trap 1) ─▶ ClientApp handlers
//
// Trap 1: ClientApp installs a SessionUpdateRouter as its first handler and
// it runs a strict zSessionNotification.parse on every `session/update`. An
// update kind outside the 1.7 union (Grok's subagent_finished, Antigravity's
// legacy shapes, anything newer) throws there, the SDK logs "Error handling
// notification" and no later handler runs. The rewrite renames inbound
// `session/update` notifications to SENTINEL_SESSION_UPDATE_METHOD, which is
// registered with a pass-through parser, so the strict router never sees
// them and Sentinel reads every update leniently (schema.ts).
//
// Every other method is registered with the 3-argument onRequest /
// onNotification form and a pass-through parser too: the SDK then skips its
// own zod parse, so vendor `_meta` and unknown keys survive and a slightly
// off shape never fails a request. Vendor extension methods (cursor/…,
// _x.ai/…) are plain string methods; the SDK adds no `_` prefix on the wire.

export type AcpInboundHandlers = {
  /** Agent → client requests (permission, fs, terminal, elicitation, extensions). */
  onRequest(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
  /** Agent → client notifications other than session updates. */
  onNotification(method: string, params: unknown): void | Promise<void>;
  /** Every `session/update`, whatever its kind. */
  onSessionUpdate(params: unknown): void;
};

export type AcpTransportOptions = {
  clientName?: string;
  methods?: AcpMethodTable;
  /** Rewrites (or drops, with null) an inbound message before routing. */
  normalizeInbound?: (message: acp.AnyMessage) => acp.AnyMessage | null;
  /** Notification methods the client handles (besides session/update). */
  notificationMethods: readonly string[];
  /** Request methods the client serves; others get methodNotFound. */
  requestMethods: readonly string[];
};

export type AcpByteStreams = {
  /** The agent's stdout, already filtered to JSON frames. */
  readable: ReadableStream<Uint8Array>;
  /** The agent's stdin. */
  writable: WritableStream<Uint8Array>;
};

function passthrough(params: unknown) {
  return params;
}

function rewriteMessage(
  message: acp.AnyMessage,
  methods: AcpMethodTable,
  normalize: AcpTransportOptions["normalizeInbound"],
): acp.AnyMessage | null {
  const next = normalize ? normalize(message) : message;
  if (!next) {
    return null;
  }

  const record = asRecord(next);
  if (record && record.method === methods.sessionUpdate && !("id" in record)) {
    return {
      ...record,
      method: SENTINEL_SESSION_UPDATE_METHOD,
    } as acp.AnyMessage;
  }
  return next;
}

/** The inbound rewrite as a stream transform (batches are rewritten per member). */
export function createInboundRewrite(
  methods: AcpMethodTable = ACP_V1_METHODS,
  normalize?: AcpTransportOptions["normalizeInbound"],
) {
  return new TransformStream<acp.AnyMessage, acp.AnyMessage>({
    transform(message, controller) {
      if (Array.isArray(message)) {
        const members = (message as acp.AnyMessage[])
          .map((member) => rewriteMessage(member, methods, normalize))
          .filter((member): member is acp.AnyMessage => member != null);
        if (members.length > 0) {
          controller.enqueue(members as unknown as acp.AnyMessage);
        }
        return;
      }

      const rewritten = rewriteMessage(message, methods, normalize);
      if (rewritten) {
        controller.enqueue(rewritten);
      }
    },
  });
}

/** Connects a ClientApp to an agent over byte streams. */
export function openAcpConnection(
  streams: AcpByteStreams,
  handlers: AcpInboundHandlers,
  options: AcpTransportOptions,
): acp.ClientConnection {
  const methods = options.methods ?? ACP_V1_METHODS;
  let app = acp
    .client({ name: options.clientName ?? "sentinel" })
    .onNotification(
      SENTINEL_SESSION_UPDATE_METHOD,
      passthrough,
      ({ params }) => {
        handlers.onSessionUpdate(params);
      },
    );

  for (const method of new Set(options.requestMethods)) {
    app = app.onRequest(method, passthrough, async ({ params, signal }) => {
      const result = await handlers.onRequest(method, params, signal);
      return result ?? {};
    });
  }
  for (const method of new Set(options.notificationMethods)) {
    if (method === methods.sessionUpdate) {
      continue;
    }
    app = app.onNotification(method, passthrough, async ({ params }) => {
      await handlers.onNotification(method, params);
    });
  }

  const wire = acp.ndJsonStream(streams.writable, streams.readable);
  return app.connect({
    readable: wire.readable.pipeThrough(
      createInboundRewrite(methods, options.normalizeInbound),
    ),
    writable: wire.writable,
  });
}
