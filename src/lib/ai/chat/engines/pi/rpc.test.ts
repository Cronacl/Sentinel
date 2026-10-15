import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import path from "node:path";

import type { PiMockScenario } from "./__tests__/mock-pi";
import type { PiRpcProcess as PiRpcProcessType } from "./rpc";

// The Pi RPC client against the Pi mock over real stdio: LF framing (CRLF,
// split frames, U+2028 inside strings, noise), id-correlated responses,
// command failures, timeouts, aborts and a crash with its stderr.
mock.module("server-only", () => ({}));

const { PiRpcProcess, PiRpcCancelledError, PiRpcError, PiRpcTimeoutError } =
  await import("./rpc");
const support = await import("./__tests__/mock-pi");
const { MOCK_PI_PATH } =
  await import("../../../../../../scripts/fixtures/agents/pi/test-driver");

const dirs: string[] = [];
const started: PiRpcProcessType[] = [];
afterEach(async () => {
  await Promise.all(started.splice(0).map((process) => process.dispose()));
});
afterAll(() => {
  for (const dir of dirs) support.removeTempDir(dir);
});

function start(
  scenario: PiMockScenario,
  options: { noise?: string[]; stderr?: string[] } = {},
) {
  const dir = support.makeTempDir("rpc");
  dirs.push(dir);
  const logPath = path.join(dir, "mock.jsonl");
  const process_ = PiRpcProcess.start({
    args: [MOCK_PI_PATH, "--mode", "rpc"],
    command: process.execPath,
    cwd: dir,
    env: {
      ...process.env,
      SENTINEL_PI_MOCK_LOG: logPath,
      SENTINEL_PI_MOCK_SCENARIO: JSON.stringify(scenario),
    },
    label: "Pi",
    onStderrLine: (line) => options.stderr?.push(line),
    onStdoutNoise: (line) => options.noise?.push(line),
    register: false,
  });
  started.push(process_);
  return { logPath, process: process_ };
}

describe("PiRpcProcess", () => {
  it("correlates responses by id and delivers events in order", async () => {
    const { process } = start({
      prompts: [{ steps: [{ text: ["Hel", "lo   there"], type: "text" }] }],
    });
    const events: string[] = [];
    let text = "";
    process.attach({
      onEvent(event) {
        events.push(event.type);
        const update = event.assistantMessageEvent as
          { delta?: string; type?: string } | undefined;
        if (update?.type === "text_delta") text += update.delta;
      },
    });

    const [models, state] = await Promise.all([
      process.request<{ models: unknown[] }>("get_available_models"),
      process.request<{ sessionFile: string }>("get_state"),
    ]);
    expect(models.models.length).toBeGreaterThan(0);
    expect(state.sessionFile).toContain("mock-pi-session-1");

    expect(await process.request("prompt", { message: "hi" })).toEqual({
      disposition: "started",
    });
    await support.waitUntil(() => events.includes("agent_settled"));
    expect(text).toBe("Hello   there");
    expect(events.indexOf("agent_start")).toBeLessThan(
      events.indexOf("agent_end"),
    );
    expect(events.at(-1)).toBe("agent_settled");
  });

  it("frames CRLF records written in small chunks and skips noise", async () => {
    const noise: string[] = [];
    const { process } = start(
      {
        faults: {
          crlf: true,
          splitFramesBytes: 3,
          startupStdout: ["not json", "[1,2]"],
        },
      },
      { noise },
    );
    const state = await process.request<{ sessionId: string }>("get_state");
    expect(state.sessionId).toBe("mock-pi-session-1");
    expect(noise).toEqual(["not json", "[1,2]"]);
  });

  it("rejects a failed command with Pi's own error", async () => {
    const { process } = start({
      commandErrors: { set_model: "Model not found" },
    });
    const error = await process
      .request("set_model", { modelId: "x", provider: "y" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PiRpcError);
    expect((error as Error).message).toBe("Model not found");
    // The process keeps serving.
    expect(await process.request("get_state")).toBeTruthy();
  });

  it("times out and cancels requests without waiting for Pi", async () => {
    const { process } = start({ hangCommands: ["get_state", "get_messages"] });
    await expect(
      process.request("get_state", {}, { timeoutMs: 100 }),
    ).rejects.toBeInstanceOf(PiRpcTimeoutError);

    const controller = new AbortController();
    const pending = process.request(
      "get_messages",
      {},
      { signal: controller.signal },
    );
    controller.abort(new Error("stop"));
    await expect(pending).rejects.toBeInstanceOf(PiRpcCancelledError);
    await expect(
      process.request("get_state", {}, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PiRpcCancelledError);
  });

  it("fails pending requests when Pi exits, with its stderr", async () => {
    const { process } = start({
      faults: {
        exitAfterMs: 150,
        exitCode: 3,
        startupStderr: "boom: no auth\n",
      },
      hangCommands: ["get_state"],
    });
    let exitError: Error | null = null;
    process.attach({ onExit: (error) => (exitError = error) });
    const error = await process
      .request("get_state", {}, { timeoutMs: 5_000 })
      .catch((caught: unknown) => caught);
    expect((error as Error).message).toContain("exited with code 3");
    expect((error as Error).message).toContain("boom: no auth");
    expect(exitError).not.toBeNull();
    expect(process.isAlive()).toBe(false);
    await expect(process.request("get_state")).rejects.toThrow("exited");
  });

  it("ends the process on dispose", async () => {
    const { process } = start({});
    await process.request("get_state");
    await process.dispose();
    const exit = await process.exited;
    expect(exit.code === 0 || exit.signal !== null).toBe(true);
    expect(process.isAlive()).toBe(false);
  });
});
