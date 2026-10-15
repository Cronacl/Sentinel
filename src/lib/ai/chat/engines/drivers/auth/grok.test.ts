// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

// Grok's auth controller against a faked binary resolution and a fake flow
// context; nothing here spawns the CLI.

mock.module("server-only", () => ({}));

let binary: { env: Record<string, string>; path: string } | null = null;
mock.module("@/lib/ai/chat/engines/acp/agents/grok", () => ({
  resolveGrokBinary: mock(async () =>
    binary
      ? {
          binary: { ...binary, source: "managed-path", version: "1.0.50" },
          error: null,
        }
      : { binary: null, error: "not found" },
  ),
}));

const { makeFakeInstance } = await import("../../contract/testing");
const { EngineAuthError } = await import("../../platform/auth/controller");
const { grokAuth } = await import("./grok");

function createContext(
  options: { cleared?: string[]; exitCode?: number } = {},
) {
  const calls: unknown[] = [];
  return {
    calls,
    context: {
      clearInstanceSecrets: mock(async (names) => {
        calls.push(["clear", names]);
        return options.cleared ?? [];
      }),
      client: { terminal: true },
      flowId: "flow-1",
      requestCredentials: mock(async (fields) => {
        calls.push(["credentials", fields.map((field) => field.name)]);
        return { XAI_API_KEY: "xai-key" };
      }),
      runBackgroundCommand: mock(async (command) => {
        calls.push(["background", command]);
        return { exitCode: options.exitCode ?? 0 };
      }),
      runTerminalCommand: mock(async (command) => {
        calls.push(["terminal", command]);
        return { exitCode: 0 };
      }),
      saveInstanceSecrets: mock(async (values) => {
        calls.push(["save", values]);
      }),
      setMessage: mock(() => {}),
      showBrowser: mock(() => {}),
      showDeviceCode: mock(() => {}),
      signal: new AbortController().signal,
    },
  };
}

const instance = makeFakeInstance({ driver: "grok", id: "grok" });

beforeEach(() => {
  binary = {
    env: { PATH: "/Users/me/.grok/bin" },
    path: "/Users/me/.grok/bin/grok",
  };
});

describe("grokAuth", () => {
  it("offers `grok login` when the CLI is found, and an xAI API key always", async () => {
    expect(
      (await grokAuth.methods(instance)).map((method) => method.id),
    ).toEqual(["cli-login", "api-key"]);
    binary = null;
    expect(
      (await grokAuth.methods(instance)).map((method) => method.id),
    ).toEqual(["api-key"]);
  });

  it("runs `grok login` in the terminal with the PATH it was found on", async () => {
    const { calls, context } = createContext();
    await grokAuth.login(instance, "cli-login", context);
    expect(calls).toEqual([
      [
        "terminal",
        expect.objectContaining({
          args: ["login"],
          command: "/Users/me/.grok/bin/grok",
          env: { PATH: "/Users/me/.grok/bin" },
          title: "Grok sign-in",
        }),
      ],
    ]);
  });

  it("stores the API key as the instance's XAI_API_KEY secret", async () => {
    const { calls, context } = createContext();
    await grokAuth.login(instance, "api-key", context);
    expect(calls).toContainEqual(["credentials", ["XAI_API_KEY"]]);
    expect(calls).toContainEqual(["save", { XAI_API_KEY: "xai-key" }]);
  });

  it("refuses a CLI login without the CLI", async () => {
    binary = null;
    const { context } = createContext();
    await expect(
      grokAuth.login(instance, "cli-login", context),
    ).rejects.toThrow(EngineAuthError);
  });

  it("signs out with `grok logout` and drops the instance's key", async () => {
    const { calls, context } = createContext({ cleared: ["XAI_API_KEY"] });
    expect(await grokAuth.logout(instance, context)).toEqual({
      message: "Signed out and removed this instance's API key.",
    });
    expect(calls).toContainEqual([
      "background",
      {
        args: ["logout"],
        command: "/Users/me/.grok/bin/grok",
        env: { PATH: "/Users/me/.grok/bin" },
      },
    ]);

    const failed = createContext({ exitCode: 2 });
    await expect(grokAuth.logout(instance, failed.context)).rejects.toThrow(
      "`grok logout` did not finish",
    );
  });

  it("warns that a shared login signs out the CLI, unless the instance has its own GROK_HOME", () => {
    expect(grokAuth.logoutNotice(instance)).toContain("the Grok CLI");
    expect(
      grokAuth.logoutNotice({
        ...instance,
        envOverrides: { GROK_HOME: "/Users/me/.grok-work" },
      }),
    ).toBeNull();
  });
});
