import { beforeEach, describe, expect, it, mock } from "bun:test";

import { makeFakeInstance } from "../../contract/testing";

// Pi's auth controller against a faked binary resolution and a fake flow
// context; nothing here spawns Pi.
mock.module("server-only", () => ({}));

let binary: { env: Record<string, string>; path: string } | null = null;
mock.module("@/lib/ai/chat/engines/pi/binary", () => ({
  invalidatePiBinaryResolutions: () => {},
  resolvePiBinary: async () =>
    binary
      ? { binary, error: null }
      : { binary: null, error: "Pi was not found in PATH." },
}));

const { piAuth } = await import("./pi");

function createContext(
  options: {
    cleared?: string[];
    credentials?: Record<string, string>;
    terminal?: boolean;
  } = {},
) {
  const calls: unknown[][] = [];
  const context = {
    clearInstanceSecrets: async (names: readonly string[]) => {
      calls.push(["clear", [...names]]);
      return options.cleared ?? [];
    },
    client: { terminal: options.terminal ?? true },
    flowId: "flow-1",
    requestCredentials: async (fields: Array<{ name: string }>) => {
      calls.push(["credentials", fields.map((field) => field.name)]);
      return options.credentials ?? {};
    },
    runBackgroundCommand: async () => ({ exitCode: 0 }),
    runTerminalCommand: async (command: unknown) => {
      calls.push(["terminal", command]);
      return { exitCode: 0 };
    },
    saveInstanceSecrets: async (values: Record<string, string>) => {
      calls.push(["save", values]);
    },
    setMessage: () => {},
    showBrowser: () => {},
    showDeviceCode: () => {},
    signal: new AbortController().signal,
  };
  return { calls, context: context as never };
}

const instance = makeFakeInstance({ driver: "pi" });

beforeEach(() => {
  binary = {
    env: { PATH: "/Users/me/.local/bin" },
    path: "/Users/me/.local/bin/pi",
  };
});

describe("Pi auth", () => {
  it("offers /login in Pi while Pi is installed, and provider keys always", async () => {
    const ids = (await piAuth.methods(instance, { terminal: true })).map(
      (method) => method.id,
    );
    expect(ids).toEqual([
      "cli-login",
      "api-key:anthropic",
      "api-key:openai",
      "api-key:google",
      "api-key:openrouter",
    ]);
    binary = null;
    expect((await piAuth.methods(instance, { terminal: true }))[0]?.id).toBe(
      "api-key:anthropic",
    );
  });

  it("opens Pi in the terminal to sign in", async () => {
    const { calls, context } = createContext();
    await piAuth.login(instance, "cli-login", context);
    expect(calls).toEqual([
      [
        "terminal",
        {
          args: [],
          command: "/Users/me/.local/bin/pi",
          env: { PATH: "/Users/me/.local/bin" },
          title: "Pi sign-in: type /login",
        },
      ],
    ]);
    binary = null;
    await expect(
      piAuth.login(instance, "cli-login", createContext().context),
    ).rejects.toThrow("not found");
  });

  it("stores a provider key as an instance secret", async () => {
    const { calls, context } = createContext({
      credentials: { OPENAI_API_KEY: "sk-1" },
    });
    await piAuth.login(instance, "api-key:openai", context);
    expect(calls).toEqual([
      ["credentials", ["OPENAI_API_KEY"]],
      ["save", { OPENAI_API_KEY: "sk-1" }],
    ]);
    await expect(
      piAuth.login(instance, "api-key:nope", createContext().context),
    ).rejects.toThrow("Unknown");
  });

  it("removes stored keys first, else opens Pi for /logout", async () => {
    const withKeys = createContext({ cleared: ["ANTHROPIC_API_KEY"] });
    expect(await piAuth.logout!(instance, withKeys.context)).toEqual({
      message: "Removed this instance's provider API keys.",
    });
    expect(withKeys.calls).toHaveLength(1);

    const withoutKeys = createContext();
    await piAuth.logout!(instance, withoutKeys.context);
    expect(withoutKeys.calls.at(-1)?.[0]).toBe("terminal");

    await expect(
      piAuth.logout!(instance, createContext({ terminal: false }).context),
    ).rejects.toThrow("/logout");
  });
});
