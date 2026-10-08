import { afterEach, describe, expect, it, mock } from "bun:test";

import packageJson from "../../../../../../package.json";

import type { AcpAgentProcess as AcpProcess } from "./connection";
import type { AcpSessionUpdateEnvelope } from "./schema";

// The ACP transport against the mock agent over real stdio: the two SDK
// trap fixes, vendor extensions, _meta passthrough, cancel as a
// notification, and crash / hang handling. Every test spawns
// scripts/fixtures/agents/acp/mock-agent.ts.
mock.module("server-only", () => ({}));

const { AcpAgentProcess } = await import("./connection");
const { AcpProcessExitedError, AcpRequestTimeoutError } =
  await import("./errors");
const { cancelAcpSession, initializeAcpAgent } = await import("./session");
const support = await import("./__tests__/mock-agent");
const { startAcpHarness } =
  await import("../../../../../../scripts/fixtures/agents/acp/test-harness");

const dirs: string[] = [];
const processes: AcpProcess[] = [];

function start(
  scenario: Parameters<typeof support.startMockAgent>[0],
  options: Partial<Parameters<typeof support.startMockAgent>[1]> = {},
) {
  const dir = support.makeTempDir("conn");
  dirs.push(dir);
  const started = support.startMockAgent(scenario, { dir, ...options });
  processes.push(started.process);
  return { ...started, dir };
}

const descriptor = support.mockDescriptor({
  clientCapabilitiesMeta: { parameterizedModelPicker: true },
  initializeMeta: { "sentinel.test/client": "yes" },
});

afterEach(async () => {
  await Promise.all(processes.splice(0).map((process) => process.dispose()));
  for (const dir of dirs.splice(0)) {
    support.removeTempDir(dir);
  }
});

function prompt(
  process: AcpProcess,
  sessionId: string,
  text: string,
  meta?: Record<string, unknown>,
) {
  return process.request("session/prompt", {
    prompt: [{ text, type: "text" }],
    sessionId,
    ...(meta ? { _meta: meta } : {}),
  });
}

async function newSession(process: AcpProcess, cwd: string) {
  await initializeAcpAgent(process, { context: "session", descriptor });
  return (await process.request("session/new", { cwd, mcpServers: [] })) as {
    sessionId: string;
  };
}

describe("ACP transport traps", () => {
  it("filters non-JSON stdout so the SDK never writes a parse error back (trap 2)", async () => {
    const noise: string[] = [];
    const { dir, logPath, process } = start(
      {
        faults: {
          startupStdout: ["Welcome to the agent", "42", "{not json"],
        },
        prompts: [
          {
            steps: [
              {
                lines: ["Open https://example.com/login to sign in"],
                type: "stdout",
              },
              { text: "still fine", type: "text" },
            ],
          },
        ],
      },
      { onStdoutNoise: (line) => noise.push(line) },
    );
    const updates: AcpSessionUpdateEnvelope[] = [];
    process.attach({ onSessionUpdate: (update) => updates.push(update) });

    const { sessionId } = await newSession(process, dir);
    const result = await prompt(process, sessionId, "go");

    expect(result).toEqual(expect.objectContaining({ stopReason: "end_turn" }));
    expect(noise).toEqual([
      "Welcome to the agent",
      "42",
      "{not json",
      "Open https://example.com/login to sign in",
    ]);
    expect(updates.map((update) => update.update.sessionUpdate)).toContain(
      "agent_message_chunk",
    );
    const responses = support
      .readMockLog(logPath)
      .filter((entry) => entry.kind === "response");
    // Only our answers to the agent's own requests; no -32700 / -32600.
    expect(
      responses.filter(
        (entry) =>
          entry.kind === "response" &&
          (entry.error?.code === -32700 || entry.error?.code === -32600),
      ),
    ).toEqual([]);
  });

  it("shows the trap: the bare SDK answers stdout noise with -32700", async () => {
    const harness = startAcpHarness({
      faults: { startupStdout: ["Welcome to the agent"] },
    });
    try {
      await harness.initialize();
      await harness.settle();
      expect(
        harness
          .log()
          .some(
            (entry) =>
              entry.kind === "response" && entry.error?.code === -32700,
          ),
      ).toBe(true);
    } finally {
      await harness.dispose();
    }
  });

  it("delivers update kinds outside the 1.7 union and keeps _meta (trap 1)", async () => {
    const { dir, process } = start({
      prompts: [
        {
          steps: [
            {
              type: "update",
              update: {
                sessionUpdate: "subagent_finished",
                subagentId: "sub-1",
              },
            },
            {
              meta: { "vendor.example/trace": "t-1" },
              notificationMeta: { promptId: "p-1" },
              text: "after the unknown kind",
              type: "text",
            },
          ],
        },
      ],
    });
    const updates: AcpSessionUpdateEnvelope[] = [];
    process.attach({ onSessionUpdate: (update) => updates.push(update) });

    const { sessionId } = await newSession(process, dir);
    await prompt(process, sessionId, "go");

    expect(updates.map((update) => update.update.sessionUpdate)).toEqual([
      "subagent_finished",
      "agent_message_chunk",
    ]);
    expect(updates[0]?.update).toEqual(
      expect.objectContaining({ subagentId: "sub-1" }),
    );
    expect(updates[1]?.meta).toEqual({ promptId: "p-1" });
    expect(updates[1]?.update._meta).toEqual({ "vendor.example/trace": "t-1" });
  });

  it("shows the trap: the bare SDK drops an unknown update kind", async () => {
    const harness = startAcpHarness({
      prompts: [
        {
          steps: [
            {
              type: "update",
              update: { sessionUpdate: "subagent_finished" },
            },
          ],
        },
      ],
    });
    try {
      await harness.initialize();
      const { sessionId } = await harness.newSession();
      await harness.prompt(sessionId, "go");
      await harness.settle();
      expect(
        harness.updates.map(
          (update) =>
            (update.update as { sessionUpdate: string }).sessionUpdate,
        ),
      ).not.toContain("subagent_finished");
    } finally {
      await harness.dispose();
    }
  });
});

describe("ACP connection", () => {
  it("passes _meta through initialize and prompt, and serves vendor requests verbatim", async () => {
    const { dir, logPath, process } = start(
      {
        initialize: { echoMeta: true },
        prompts: [
          {
            steps: [
              {
                echo: true,
                method: "cursor/ask_question",
                params: { questions: [{ id: "q1" }], vendorKey: true },
                type: "extRequest",
              },
            ],
          },
        ],
      },
      { requestMethods: ["cursor/ask_question"] },
    );
    const calls: Array<{ method: string; params: unknown }> = [];
    process.attach({
      onRequest: async (method, params) => {
        calls.push({ method, params });
        return { outcome: { outcome: "skipped" } };
      },
    });

    const init = await initializeAcpAgent(process, {
      context: "session",
      descriptor,
    });
    const echoed = (init.raw as { _meta: Record<string, unknown> })._meta[
      "sentinel.mock/request"
    ] as Record<string, unknown>;
    expect(echoed._meta).toEqual({ "sentinel.test/client": "yes" });
    expect(echoed.clientCapabilities).toEqual(
      expect.objectContaining({
        _meta: { parameterizedModelPicker: true },
        fs: { readTextFile: false, writeTextFile: false },
      }),
    );
    expect(echoed.clientInfo).toEqual({
      name: "sentinel",
      title: "Sentinel",
      version: packageJson.version,
    });

    const { sessionId } = (await process.request("session/new", {
      cwd: dir,
      mcpServers: [],
    })) as { sessionId: string };
    await prompt(process, sessionId, "go", { promptId: "p-9" });

    expect(calls).toEqual([
      {
        method: "cursor/ask_question",
        params: { questions: [{ id: "q1" }], vendorKey: true },
      },
    ]);
    const promptFrame = support
      .readMockLog(logPath)
      .find(
        (entry) =>
          entry.kind === "request" && entry.method === "session/prompt",
      );
    expect(promptFrame).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({ _meta: { promptId: "p-9" } }),
      }),
    );
  });

  it("answers unknown vendor requests with methodNotFound", async () => {
    const { dir, process } = start({
      prompts: [
        {
          steps: [{ echo: true, method: "vendor/unknown", type: "extRequest" }],
        },
      ],
    });
    const updates: AcpSessionUpdateEnvelope[] = [];
    process.attach({ onSessionUpdate: (update) => updates.push(update) });
    const { sessionId } = await newSession(process, dir);
    await prompt(process, sessionId, "go");

    const echoed = updates
      .map((update) => (update.update.content as { text?: string })?.text ?? "")
      .join("");
    expect(echoed).toContain("-32601");
  });

  it("sends session/cancel as a notification and the turn ends cancelled", async () => {
    const { dir, logPath, process } = start({
      prompts: [{ steps: [{ type: "waitForCancel" }] }],
    });
    const { sessionId } = await newSession(process, dir);
    const pending = prompt(process, sessionId, "go");

    await new Promise((resolve) => setTimeout(resolve, 50));
    await cancelAcpSession(process, {
      meta: { reason: "user" },
      sessionId,
    });
    expect(await pending).toEqual(
      expect.objectContaining({ stopReason: "cancelled" }),
    );

    const cancel = support
      .readMockLog(logPath)
      .find((entry) => "method" in entry && entry.method === "session/cancel");
    expect(cancel).toEqual(
      expect.objectContaining({
        kind: "notification",
        params: { _meta: { reason: "user" }, sessionId },
      }),
    );
  });

  it("rejects pending requests at once when the agent crashes, with its stderr", async () => {
    const stderrLines: string[] = [];
    const { dir, process } = start(
      {
        prompts: [
          {
            steps: [{ code: 3, stderr: "panic: out of tokens", type: "exit" }],
          },
        ],
      },
      { onStderrLine: (line) => stderrLines.push(line) },
    );
    const { sessionId } = await newSession(process, dir);

    const error = await prompt(process, sessionId, "go").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AcpProcessExitedError);
    expect((error as Error).message).toContain("code 3");
    expect((error as Error).message).toContain("panic: out of tokens");
    expect(stderrLines).toContain("panic: out of tokens");
    expect(process.isAlive()).toBe(false);
    // Later requests fail without touching the dead process.
    await expect(
      process.request("session/new", { cwd: dir, mcpServers: [] }),
    ).rejects.toBeInstanceOf(AcpProcessExitedError);
  });

  it("times out a request the agent never answers", async () => {
    const { dir, process } = start({
      faults: { hangMethods: ["session/new"] },
    });
    await initializeAcpAgent(process, { context: "session", descriptor });

    await expect(
      process.request(
        "session/new",
        { cwd: dir, mcpServers: [] },
        { timeoutMs: 150 },
      ),
    ).rejects.toBeInstanceOf(AcpRequestTimeoutError);
    expect(process.isAlive()).toBe(true);
  });

  it("stops waiting when the caller aborts", async () => {
    const { dir, process } = start({
      faults: { hangMethods: ["session/new"] },
    });
    await initializeAcpAgent(process, { context: "session", descriptor });
    const controller = new AbortController();
    const pending = process.request(
      "session/new",
      { cwd: dir, mcpServers: [] },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });

  it("refuses an agent that answers another protocol version", async () => {
    const { process } = start({ initialize: { protocolVersion: 2 } });
    await expect(
      initializeAcpAgent(process, { context: "session", descriptor }),
    ).rejects.toThrow(/protocol version 2/);
  });

  it("ends the agent process tree on dispose", async () => {
    const { process } = start({ faults: { exitOnStdinClose: false } });
    await initializeAcpAgent(process, { context: "session", descriptor });
    await process.dispose();
    const exit = await process.exited;
    expect(exit.code !== null || exit.signal !== null).toBe(true);
  });
});
