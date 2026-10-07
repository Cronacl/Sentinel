// Mock `codex app-server` peer for tests: speaks NDJSON JSON-RPC over stdio
// like the real binary, so the engine's framing, request ids and server
// request replies are exercised without a Codex install. Not a test file
// (the runner only picks up *.test.*) and never imported by app code.
// Idea ported from t3code (MIT), packages/effect-codex-app-server/test/
// fixtures/codex-app-server-mock-peer.ts.
//
// MOCK_CODEX_SCENARIO (JSON):
//   initialize?: { error?: {code, message}; userAgent?: string }
//   responses?: { [method]: Reply | Reply[] }   arrays are consumed in order
//     Reply = { result: unknown } | { error: {code, message} }
// Control requests (handled by the peer itself, never recorded):
//   mock/emit {messages: object[], chunkSize?: number}
//     writes each message (server requests and notifications) to stdout,
//     optionally split into chunkSize-byte writes, then replies {}.
//   mock/received {} → {frames}: every frame the peer has received so far.

type Reply = { result: unknown } | { error: { code: number; message: string } };

type Scenario = {
  initialize?: {
    error?: { code: number; message: string };
    userAgent?: string;
  };
  responses?: Record<string, Reply | Reply[]>;
};

const scenario = JSON.parse(
  process.env.MOCK_CODEX_SCENARIO ?? "{}",
) as Scenario;
const received: unknown[] = [];

function serialize(message: unknown) {
  return `${JSON.stringify(message)}\n`;
}

function write(message: unknown) {
  process.stdout.write(serialize(message));
}

async function writeChunked(text: string, chunkSize: number) {
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    process.stdout.write(text.slice(offset, offset + chunkSize));
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function nextReply(method: string): Reply | null {
  const configured = scenario.responses?.[method];
  if (configured === undefined) {
    return null;
  }

  if (Array.isArray(configured)) {
    return configured.shift() ?? null;
  }

  return configured;
}

async function handleRequest(message: Record<string, unknown>) {
  const id = message.id as number | string;
  const method = message.method as string;

  if (method === "mock/emit") {
    const params = (message.params ?? {}) as {
      chunkSize?: number;
      messages?: unknown[];
    };
    const text = (params.messages ?? []).map(serialize).join("");
    if (params.chunkSize && params.chunkSize > 0) {
      await writeChunked(text, params.chunkSize);
    } else {
      process.stdout.write(text);
    }
    write({ id, jsonrpc: "2.0", result: {} });
    return;
  }

  if (method === "mock/received") {
    write({ id, jsonrpc: "2.0", result: { frames: received } });
    return;
  }

  if (method === "initialize") {
    if (scenario.initialize?.error) {
      write({ error: scenario.initialize.error, id, jsonrpc: "2.0" });
      return;
    }

    write({
      id,
      jsonrpc: "2.0",
      result: {
        codexHome: process.cwd(),
        platformFamily: process.platform === "win32" ? "windows" : "unix",
        platformOs: process.platform === "darwin" ? "macos" : process.platform,
        userAgent:
          scenario.initialize?.userAgent ??
          "codex_cli_rs/0.160.1 (Mac OS 26.1.0; arm64) sentinel/0.0.0",
      },
    });
    return;
  }

  const reply = nextReply(method);
  if (!reply) {
    write({
      error: { code: -32601, message: `Unhandled request: ${method}` },
      id,
      jsonrpc: "2.0",
    });
    return;
  }

  write({ id, jsonrpc: "2.0", ...reply });
}

let remainder = "";
let queue = Promise.resolve();

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  remainder += chunk;
  const lines = remainder.split("\n");
  remainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const message = JSON.parse(trimmed) as Record<string, unknown>;
    const isControl =
      typeof message.method === "string" && message.method.startsWith("mock/");
    if (!isControl) {
      // Requests, notifications (`initialized`) and server-request replies,
      // in arrival order.
      received.push(message);
    }

    if (typeof message.method === "string" && message.id !== undefined) {
      // Requests are answered strictly in arrival order.
      queue = queue.then(() => handleRequest(message));
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
