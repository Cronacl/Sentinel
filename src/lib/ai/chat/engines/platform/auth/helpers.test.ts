// @ts-nocheck

import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";

mock.module("server-only", () => ({}));

const { makeFakeInstance } = await import("../../contract/testing");
const {
  buildAuthTerminalEnv,
  formatAuthDisplayCommand,
  isSafeAuthUrl,
  quotePosixArgument,
  resolveWindowsComSpec,
  toAuthTerminalInvocation,
} = await import("./terminal-command");
const { resolveEngineAuthFlowOutcome } = await import("./outcome");
const {
  createEngineInstanceSecrets,
  getPublicInstanceOverrides,
  mergeEngineInstanceSecrets,
} = await import("./instance-secrets");
const { runAuthCommand } = await import("./run-command");

describe("terminal commands", () => {
  it("never passes Sentinel's private variables", () => {
    expect(
      buildAuthTerminalEnv({
        commandEnv: { ELECTRON_RUN_AS_NODE: "1" },
        path: "/bin",
        publicOverrides: {
          CLAUDE_CONFIG_DIR: "/cfg",
          ENCRYPTION_KEY: "k",
          SENTINEL_INTERNAL_TOKEN: "t",
        },
      }),
    ).toEqual({
      CLAUDE_CONFIG_DIR: "/cfg",
      ELECTRON_RUN_AS_NODE: "1",
      PATH: "/bin",
    });
  });

  it("formats a command to paste into POSIX shells and PowerShell", () => {
    const input = {
      args: ["auth", "login", "it's"],
      command: "/opt/my tools/claude",
      env: { CLAUDE_CONFIG_DIR: "/home/me/.claude work", PATH: "/bin" },
    };
    expect(formatAuthDisplayCommand(input, "darwin")).toBe(
      `CLAUDE_CONFIG_DIR='/home/me/.claude work' '/opt/my tools/claude' auth login 'it'\\''s'`,
    );
    expect(formatAuthDisplayCommand(input, "win32")).toBe(
      `$env:CLAUDE_CONFIG_DIR='/home/me/.claude work'; & '/opt/my tools/claude' auth login 'it''s'`,
    );
    expect(quotePosixArgument("")).toBe("''");
  });

  it("runs Windows shims through cmd.exe", () => {
    expect(
      toAuthTerminalInvocation("C:\\npm\\agent.cmd", ["login"], {
        comSpec: "C:\\Windows\\System32\\cmd.exe",
        platform: "win32",
      }),
    ).toEqual({
      args: ["/d", "/s", "/c", '"C:\\npm\\agent.cmd ^"login^""'],
      command: "C:\\Windows\\System32\\cmd.exe",
      windowsVerbatimArguments: true,
    });
    expect(
      toAuthTerminalInvocation("/usr/bin/agent", ["login"], {
        platform: "darwin",
      }),
    ).toEqual({ args: ["login"], command: "/usr/bin/agent" });
  });

  it("names cmd.exe by absolute path, as Electron main requires", () => {
    expect(
      resolveWindowsComSpec({ ComSpec: "D:\\Windows\\system32\\cmd.exe" }),
    ).toBe("D:\\Windows\\system32\\cmd.exe");
    // Missing or relative: from the system root.
    expect(
      resolveWindowsComSpec({ ComSpec: "cmd.exe", SystemRoot: "E:\\Win" }),
    ).toBe("E:\\Win\\System32\\cmd.exe");
    expect(resolveWindowsComSpec({})).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(
      toAuthTerminalInvocation("C:\\npm\\agent.cmd", ["login"], {
        env: {},
        platform: "win32",
      }).command,
    ).toBe("C:\\Windows\\System32\\cmd.exe");
  });

  it("only shows https pages, or http on loopback", () => {
    expect(isSafeAuthUrl("https://auth.openai.com/oauth/authorize?x=1")).toBe(
      true,
    );
    expect(isSafeAuthUrl("http://localhost:1455/auth/callback")).toBe(true);
    expect(isSafeAuthUrl("http://127.0.0.1:1455/")).toBe(true);
    expect(isSafeAuthUrl("http://example.com/login")).toBe(false);
    expect(isSafeAuthUrl("https://user:pass@example.com/")).toBe(false);
    expect(isSafeAuthUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeAuthUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeAuthUrl("not a url")).toBe(false);
  });
});

describe("flow outcomes", () => {
  const base = { label: "Claude Code" };

  it("trusts the fresh snapshot for sign-in", () => {
    expect(
      resolveEngineAuthFlowOutcome({
        ...base,
        auth: { status: "authenticated" },
        exitCode: 1,
        purpose: "login",
      }),
    ).toEqual({ message: "Signed in to Claude Code.", phase: "succeeded" });
    expect(
      resolveEngineAuthFlowOutcome({
        ...base,
        auth: { status: "unknown" },
        exitCode: 2,
        purpose: "login",
      }),
    ).toEqual({
      message: "The sign-in command exited with code 2.",
      phase: "failed",
    });
    expect(
      resolveEngineAuthFlowOutcome({
        ...base,
        auth: { status: "unauthenticated" },
        exitCode: null,
        purpose: "login",
      }),
    ).toMatchObject({ phase: "failed" });
    expect(
      resolveEngineAuthFlowOutcome({
        ...base,
        auth: null,
        purpose: "login",
      }),
    ).toMatchObject({ phase: "succeeded" });
  });

  it("explains a sign-out that left credentials behind", () => {
    expect(
      resolveEngineAuthFlowOutcome({
        ...base,
        auth: { status: "authenticated" },
        purpose: "logout",
      }).message,
    ).toContain("still finds credentials");
    expect(
      resolveEngineAuthFlowOutcome({
        ...base,
        auth: { status: "unauthenticated" },
        purpose: "logout",
      }),
    ).toEqual({ message: "Signed out of Claude Code.", phase: "succeeded" });
    expect(
      resolveEngineAuthFlowOutcome({
        ...base,
        auth: { status: "unauthenticated" },
        exitCode: 1,
        purpose: "logout",
      }),
    ).toMatchObject({ phase: "failed" });
  });
});

describe("instance secrets", () => {
  const environment = [
    {
      name: "HTTPS_PROXY",
      needsReentry: false,
      sensitive: false,
      value: "http://proxy",
      valueRedacted: false,
    },
    {
      name: "OPENAI_API_KEY",
      needsReentry: false,
      sensitive: true,
      value: "",
      valueRedacted: true,
    },
    {
      name: "CURSOR_API_KEY",
      needsReentry: false,
      sensitive: true,
      value: "",
      valueRedacted: true,
    },
  ];

  it("keeps stored secrets and replaces only what changes", () => {
    expect(
      mergeEngineInstanceSecrets(environment, {
        remove: ["OPENAI_API_KEY"],
        set: { CURSOR_API_KEY: "key_new" },
      }),
    ).toEqual([
      { name: "HTTPS_PROXY", sensitive: false, value: "http://proxy" },
      { name: "CURSOR_API_KEY", sensitive: true, value: "key_new" },
    ]);
    expect(() =>
      mergeEngineInstanceSecrets([], { set: { "not valid": "x" } }),
    ).toThrow("not a valid variable name");
  });

  it("exposes only non-secret variables and the home variable", () => {
    const instance = makeFakeInstance({
      driver: "claude",
      envOverrides: {
        CLAUDE_CONFIG_DIR: "/cfg",
        CURSOR_API_KEY: "secret",
        HTTPS_PROXY: "http://proxy",
      },
    });
    expect(getPublicInstanceOverrides(instance, environment)).toEqual({
      CLAUDE_CONFIG_DIR: "/cfg",
      HTTPS_PROXY: "http://proxy",
    });
    expect(getPublicInstanceOverrides(instance, null)).toEqual({
      CLAUDE_CONFIG_DIR: "/cfg",
    });
  });

  it("saves and clears through the registry", async () => {
    const registry = {
      listSummaries: mock(async () => [{ environment, id: "cursor" }]),
      update: mock(async () => ({})),
    };
    const secrets = createEngineInstanceSecrets(registry);

    await secrets.save("user-1", "cursor", { CURSOR_API_KEY: "key_2" });
    expect(registry.update).toHaveBeenLastCalledWith("user-1", "cursor", {
      environment: [
        { name: "HTTPS_PROXY", sensitive: false, value: "http://proxy" },
        { name: "OPENAI_API_KEY", sensitive: true, valueRedacted: true },
        { name: "CURSOR_API_KEY", sensitive: true, value: "key_2" },
      ],
    });

    expect(
      await secrets.clear("user-1", "cursor", ["CURSOR_API_KEY", "NOPE"]),
    ).toEqual(["CURSOR_API_KEY"]);
    registry.update.mockClear();
    expect(await secrets.clear("user-1", "cursor", ["NOPE"])).toEqual([]);
    expect(registry.update).not.toHaveBeenCalled();

    await expect(
      secrets.save("user-1", "missing", { KEY: "x" }),
    ).rejects.toThrow("no longer exists");
  });
});

function fakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = Object.assign(new EventEmitter(), { resume: mock(() => {}) });
  child.stderr = Object.assign(new EventEmitter(), { resume: mock(() => {}) });
  child.kill = mock(() => {
    child.emit("exit", null, "SIGTERM");
    return true;
  });
  return child;
}

describe("background auth commands", () => {
  it("resolves the exit code and passes only the given environment", async () => {
    const child = fakeChild();
    const spawn = mock(() => child);
    const result = runAuthCommand({
      args: ["auth", "logout"],
      command: "/opt/bin/claude",
      env: { HOME: "/Users/me", SENTINEL_INTERNAL_TOKEN: "t" },
      killDeps: { kill: mock(() => true), platform: "darwin" },
      spawn,
    });
    child.emit("exit", 0, null);

    await expect(result).resolves.toEqual({ exitCode: 0 });
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe("/opt/bin/claude");
    expect(args).toEqual(["auth", "logout"]);
    expect(options.env).toEqual({ HOME: "/Users/me" });
    expect(child.stdout.resume).toHaveBeenCalled();
  });

  it("kills the command when the flow ends", async () => {
    const child = fakeChild();
    const kill = mock(() => true);
    const controller = new AbortController();
    const result = runAuthCommand({
      args: ["logout"],
      command: "/opt/bin/agent",
      env: {},
      killDeps: { kill, platform: "darwin" },
      signal: controller.signal,
      spawn: () => child,
    });
    controller.abort();

    await expect(result).resolves.toEqual({ exitCode: null });
    // The detached process group, never a real pid of this machine.
    expect(kill).toHaveBeenCalledWith(-4242, "SIGTERM");
  });
});
