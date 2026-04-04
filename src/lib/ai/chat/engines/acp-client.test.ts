import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

const { AcpClient } =
  // @ts-expect-error Bun cache-busting import for test isolation.
  await import("./acp-client.ts?acp-client-test");

class CapturingWritable extends Writable {
  chunks: string[] = [];

  _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.chunks.push(String(chunk));
    callback();
  }

  readJsonLines() {
    return this.chunks
      .join("")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

class FakeAcpProcess extends EventEmitter {
  stderr = new PassThrough();
  stdin = new CapturingWritable();
  stdout = new PassThrough();

  kill() {
    this.emit("exit", 0, null);
    return true;
  }

  off(event: string | symbol, listener: (...args: any[]) => void) {
    super.off(event, listener);
    return this;
  }

  once(event: string | symbol, listener: (...args: any[]) => void) {
    super.once(event, listener);
    return this;
  }

  on(event: string | symbol, listener: (...args: any[]) => void) {
    super.on(event, listener);
    return this;
  }
}

const processes: FakeAcpProcess[] = [];

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createClient() {
  return new AcpClient({
    args: ["--acp"],
    command: "gemini",
    spawnProcess: () => {
      const child = new FakeAcpProcess();
      processes.push(child);
      return child as any;
    },
  });
}

afterEach(async () => {
  processes.length = 0;
});

describe("AcpClient", () => {
  it("correlates request responses", async () => {
    const client = createClient();
    const promise = client.initialize({ protocolVersion: 1 });
    await flushMicrotasks();
    const process = processes[0]!;
    const sent = process.stdin.readJsonLines();

    expect(sent[0]?.method).toBe("initialize");
    process.stdout.write(
      `${JSON.stringify({
        id: sent[0]?.id,
        jsonrpc: "2.0",
        result: { ok: true },
      })}\n`,
    );

    await expect(promise).resolves.toEqual({ ok: true });
    await client.close();
  });

  it("delivers notifications to subscribers", async () => {
    const client = createClient();
    const events: string[] = [];
    const unsubscribe = client.subscribe((event: { method: string }) => {
      events.push(event.method);
    });

    const pending = client.initialize({ protocolVersion: 1 });
    await flushMicrotasks();
    const process = processes[0]!;
    const sent = process.stdin.readJsonLines();
    process.stdout.write(
      `${JSON.stringify({
        id: sent[0]?.id,
        jsonrpc: "2.0",
        result: {},
      })}\n`,
    );
    await pending;

    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: { update: { sessionUpdate: "agent_message_chunk" } },
      })}\n`,
    );
    await flushMicrotasks();

    expect(events).toEqual(["session/update"]);
    unsubscribe();
    await client.close();
  });

  it("routes server requests through registered handlers", async () => {
    const client = createClient();
    client.onRequest("fs/read_text_file", async () => ({ content: "hello" }));

    const pending = client.initialize({ protocolVersion: 1 });
    await flushMicrotasks();
    const process = processes[0]!;
    const sent = process.stdin.readJsonLines();
    process.stdout.write(
      `${JSON.stringify({
        id: sent[0]?.id,
        jsonrpc: "2.0",
        result: {},
      })}\n`,
    );
    await pending;

    process.stdout.write(
      `${JSON.stringify({
        id: "request-1",
        jsonrpc: "2.0",
        method: "fs/read_text_file",
        params: { path: "/tmp/test.txt" },
      })}\n`,
    );
    await flushMicrotasks();

    const written = process.stdin.readJsonLines();
    expect(written.at(-1)).toEqual(
      expect.objectContaining({
        id: "request-1",
        result: { content: "hello" },
      }),
    );
    await client.close();
  });

  it("sends cancel notifications", async () => {
    const client = createClient();
    const pending = client.initialize({ protocolVersion: 1 });
    await flushMicrotasks();
    const process = processes[0]!;
    const sent = process.stdin.readJsonLines();
    process.stdout.write(
      `${JSON.stringify({
        id: sent[0]?.id,
        jsonrpc: "2.0",
        result: {},
      })}\n`,
    );
    await pending;

    await client.cancel({ sessionId: "session-1" });

    const written = process.stdin.readJsonLines();
    expect(written.at(-1)).toEqual(
      expect.objectContaining({
        method: "session/cancel",
        params: { sessionId: "session-1" },
      }),
    );
    await client.close();
  });

  it("rejects in-flight requests when the process exits", async () => {
    const client = createClient();
    const pending = client.initialize({ protocolVersion: 1 });
    await flushMicrotasks();
    const process = processes[0]!;
    process.emit("exit", 1, null);

    await expect(pending).rejects.toThrow("ACP process exited with code 1");
  });
});
