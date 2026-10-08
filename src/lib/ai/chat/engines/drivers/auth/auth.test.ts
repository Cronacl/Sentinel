// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

// Each driver's auth controller against faked engine modules and a fake
// flow context; nothing here spawns a CLI.

mock.module("server-only", () => ({}));

const runtimes = {
  claude: null,
  codex: null,
  copilotCli: null,
  cursor: null,
  opencode: null,
};

const forgetClaudeEngineStatus = mock(async () => {});
mock.module("@/lib/ai/chat/engines/claude-sdk", () => ({
  forgetClaudeEngineStatus,
  resolveClaudeCodeRuntime: mock(async () => runtimes.claude),
}));
mock.module("@/lib/ai/chat/engines/codex-cli", () => ({
  resolveCodexCli: mock(async () => runtimes.codex),
}));
const copilotClient = {
  rpc: { account: { logout: mock(async () => ({ hasMoreUsers: false })) } },
};
const copilotManager = {
  dispose: mock(async () => {}),
  getClient: mock(async () => copilotClient),
};
mock.module("@/lib/ai/chat/engines/copilot-sdk", () => ({
  getCopilotClientManager: mock(() => copilotManager),
  resolveCopilotLoginCli: mock(async () => runtimes.copilotCli),
}));
mock.module("@/lib/ai/chat/engines/cursor-acp", () => ({
  resolveCursorRuntime: mock(async () => runtimes.cursor),
}));
mock.module("@/lib/ai/chat/engines/opencode-sdk", () => ({
  resolveOpenCodeRuntime: mock(async () => runtimes.opencode),
}));

const { makeFakeInstance } = await import("../../contract/testing");
const { EngineAuthError } = await import("../../platform/auth/controller");
const { claudeAuth } = await import("./claude");
const { createCodexAuth, waitForCodexLoginCompletion } =
  await import("./codex");
const { copilotAuth, validateCopilotToken } = await import("./copilot");
const { cursorAuth } = await import("./cursor");
const { openCodeAuth } = await import("./opencode");

function createContext(options = {}) {
  const controller = new AbortController();
  const calls = [];
  return {
    abort: () => controller.abort(new Error("cancelled")),
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
        return options.credentials ?? {};
      }),
      runBackgroundCommand: mock(async (command) => {
        calls.push(["background", command]);
        return { exitCode: options.exitCode ?? 0 };
      }),
      runTerminalCommand: mock(async (command) => {
        calls.push(["terminal", command]);
        return { exitCode: options.exitCode ?? 0 };
      }),
      saveInstanceSecrets: mock(async (values) => {
        calls.push(["save", values]);
      }),
      setMessage: mock(() => {}),
      showBrowser: mock((url) => calls.push(["browser", url])),
      showDeviceCode: mock((input) => calls.push(["device-code", input])),
      signal: controller.signal,
    },
  };
}

beforeEach(() => {
  runtimes.claude = {
    binaryDetected: true,
    env: { PATH: "/shell/bin" },
    executablePath: "/opt/bin/claude",
  };
  runtimes.codex = {
    command: "/opt/bin/codex",
    env: {},
    source: "managed-path",
  };
  runtimes.copilotCli = {
    cliPath: "/opt/homebrew/bin/copilot",
    env: { PATH: "/opt/homebrew/bin" },
    nodeScript: false,
  };
  runtimes.cursor = {
    cliDetected: true,
    cliPath: "/Users/me/.local/bin/agent",
    env: { PATH: "/Users/me/.local/bin" },
  };
  runtimes.opencode = {
    cliDetected: true,
    cliPath: "/Users/me/.opencode/bin/opencode",
    env: { PATH: "/usr/bin" },
  };
  copilotManager.dispose.mockClear();
  copilotClient.rpc.account.logout.mockClear();
  forgetClaudeEngineStatus.mockClear();
});

describe("Claude", () => {
  const instance = makeFakeInstance({ driver: "claude" });

  it("offers `claude auth login` only when Claude Code is installed", async () => {
    expect((await claudeAuth.methods(instance)).map((m) => m.id)).toEqual([
      "cli-login",
      "api-key",
    ]);
    runtimes.claude = { binaryDetected: false, env: {}, executablePath: null };
    expect((await claudeAuth.methods(instance)).map((m) => m.id)).toEqual([
      "api-key",
    ]);
    const { context } = createContext();
    await expect(
      claudeAuth.login(instance, "cli-login", context),
    ).rejects.toBeInstanceOf(EngineAuthError);
  });

  it("runs the CLI's own sign-in in the terminal", async () => {
    const { calls, context } = createContext();
    await claudeAuth.login(instance, "cli-login", context);
    // The probe that verifies it must not answer from the old snapshot.
    expect(forgetClaudeEngineStatus).toHaveBeenCalledWith(instance);

    expect(calls).toEqual([
      [
        "terminal",
        {
          args: ["auth", "login"],
          command: "/opt/bin/claude",
          display: { args: ["auth", "login"], command: "/opt/bin/claude" },
          env: { PATH: "/shell/bin" },
          title: "Claude Code sign-in",
        },
      ],
    ]);
  });

  it("runs a JavaScript CLI under the server's Node runtime", async () => {
    runtimes.claude.executablePath = "/npm/claude-code/cli.js";
    const { calls, context } = createContext();
    await claudeAuth.login(instance, "cli-login", context);

    expect(calls[0][1]).toEqual({
      args: ["/npm/claude-code/cli.js", "auth", "login"],
      command: process.execPath,
      display: { args: ["auth", "login"], command: "/npm/claude-code/cli.js" },
      env: { ELECTRON_RUN_AS_NODE: "1", PATH: "/shell/bin" },
      title: "Claude Code sign-in",
    });
  });

  it("stores an API key as the instance's ANTHROPIC_API_KEY", async () => {
    const { calls, context } = createContext({
      credentials: { ANTHROPIC_API_KEY: "sk-ant-1" },
    });
    await claudeAuth.login(instance, "api-key", context);
    expect(calls).toEqual([
      ["credentials", ["ANTHROPIC_API_KEY"]],
      ["save", { ANTHROPIC_API_KEY: "sk-ant-1" }],
    ]);
  });

  it("signs out with `claude auth logout` and drops the instance key", async () => {
    const { calls, context } = createContext({
      cleared: ["ANTHROPIC_API_KEY"],
    });
    const result = await claudeAuth.logout(instance, context);

    expect(calls).toEqual([
      ["clear", ["ANTHROPIC_API_KEY"]],
      [
        "background",
        {
          args: ["auth", "logout"],
          command: "/opt/bin/claude",
          env: { PATH: "/shell/bin" },
        },
      ],
    ]);
    expect(result).toEqual({
      message: "Signed out and removed this instance's API key.",
    });
    expect(forgetClaudeEngineStatus).toHaveBeenCalledWith(instance);

    const failing = createContext({ exitCode: 1 });
    await expect(claudeAuth.logout(instance, failing.context)).rejects.toThrow(
      "claude auth logout",
    );
  });
});

function fakeCodexManager() {
  const listeners = new Set();
  return {
    cancelLogin: mock(async () => ({ status: "canceled" })),
    emit(params) {
      for (const listener of listeners) {
        listener({
          method: "account/login/completed",
          params,
          type: "notification",
        });
      }
    },
    listeners,
    logout: mock(async () => {}),
    startLogin: mock(async () => ({
      authUrl: "https://auth.openai.com/oauth/authorize?state=x",
      loginId: "login-1",
      type: "chatgpt",
    })),
    subscribeNotifications(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

describe("Codex", () => {
  const instance = makeFakeInstance({ driver: "codex" });

  it("offers ChatGPT, device code and API key while Codex is installed", async () => {
    const auth = createCodexAuth(async () => fakeCodexManager());
    expect((await auth.methods(instance)).map((m) => [m.id, m.type])).toEqual([
      ["chatgpt", "browser"],
      ["chatgpt-device-code", "device-code"],
      ["api-key", "credentials"],
    ]);
    runtimes.codex = null;
    expect(await auth.methods(instance)).toEqual([]);
  });

  it("shows the ChatGPT page and finishes on account/login/completed", async () => {
    const manager = fakeCodexManager();
    const auth = createCodexAuth(async () => manager);
    const { calls, context } = createContext();

    const login = auth.login(instance, "chatgpt", context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([
      ["browser", "https://auth.openai.com/oauth/authorize?state=x"],
    ]);
    manager.emit({ loginId: "other", success: false });
    manager.emit({ loginId: "login-1", success: true });

    await expect(login).resolves.toBeUndefined();
    expect(manager.startLogin).toHaveBeenCalledWith({ type: "chatgpt" });
    expect(manager.listeners.size).toBe(0);
    expect(manager.cancelLogin).not.toHaveBeenCalled();
  });

  it("reports a failed login and cancels an abandoned one", async () => {
    const manager = fakeCodexManager();
    manager.startLogin.mockImplementation(async () => {
      // Completion can arrive before startLogin answers.
      manager.emit({ error: "Token exchange failed", loginId: "login-2" });
      return {
        loginId: "login-2",
        type: "chatgptDeviceCode",
        userCode: "ABCD-EFGH",
        verificationUrl: "https://auth.openai.com/codex/device",
      };
    });
    const auth = createCodexAuth(async () => manager);
    const failed = createContext();
    await expect(
      auth.login(instance, "chatgpt-device-code", failed.context),
    ).rejects.toThrow("Token exchange failed");
    expect(failed.calls).toEqual([
      [
        "device-code",
        {
          url: "https://auth.openai.com/codex/device",
          userCode: "ABCD-EFGH",
        },
      ],
    ]);

    const pending = fakeCodexManager();
    const cancelled = createContext();
    const login = createCodexAuth(async () => pending).login(
      instance,
      "chatgpt",
      cancelled.context,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    cancelled.abort();
    await expect(login).rejects.toThrow("cancelled");
    expect(pending.cancelLogin).toHaveBeenCalledWith("login-1");
  });

  it("hands an API key to Codex and signs out through the app-server", async () => {
    const manager = fakeCodexManager();
    const auth = createCodexAuth(async () => manager);
    const { context } = createContext({
      credentials: { OPENAI_API_KEY: "sk-1" },
    });
    await auth.login(instance, "api-key", context);
    expect(manager.startLogin).toHaveBeenCalledWith({
      apiKey: "sk-1",
      type: "apiKey",
    });
    expect(context.saveInstanceSecrets).not.toHaveBeenCalled();

    await auth.logout(instance, context);
    expect(manager.logout).toHaveBeenCalled();
  });

  it("ignores completions held for another login", async () => {
    const manager = fakeCodexManager();
    const completion = waitForCodexLoginCompletion(
      manager,
      new AbortController().signal,
    );
    manager.emit({ loginId: "stale", success: true });
    completion.setLoginId("login-9");
    manager.emit({ loginId: "login-9", success: true });
    await expect(completion.promise).resolves.toBeUndefined();
    completion.dispose();
  });
});

describe("Copilot", () => {
  const instance = makeFakeInstance({
    driver: "copilot",
    envOverrides: { COPILOT_HOME: "/Users/me/.copilot-work" },
  });

  it("signs in with the user's Copilot CLI into the instance's home", async () => {
    expect((await copilotAuth.methods(instance)).map((m) => m.id)).toEqual([
      "cli-login",
      "api-key",
    ]);
    const { calls, context } = createContext();
    await copilotAuth.login(instance, "cli-login", context);

    expect(calls).toEqual([
      [
        "terminal",
        {
          args: ["login", "--config-dir", "/Users/me/.copilot-work"],
          command: "/opt/homebrew/bin/copilot",
          env: { PATH: "/opt/homebrew/bin" },
          title: "GitHub Copilot sign-in",
        },
      ],
    ]);
    // The runtime restarts to read the new login.
    expect(copilotManager.dispose).toHaveBeenCalled();
  });

  it("offers only a token without a Copilot CLI", async () => {
    runtimes.copilotCli = null;
    expect((await copilotAuth.methods(instance)).map((m) => m.id)).toEqual([
      "api-key",
    ]);
  });

  it("stores a fine-grained token and refuses classic ones", async () => {
    expect(validateCopilotToken("ghp_abc")).toContain("Classic");
    expect(validateCopilotToken("github_pat_abc")).toBeNull();

    const classic = createContext({
      credentials: { COPILOT_GITHUB_TOKEN: "ghp_abc" },
    });
    await expect(
      copilotAuth.login(instance, "api-key", classic.context),
    ).rejects.toThrow("Classic");
    expect(classic.context.saveInstanceSecrets).not.toHaveBeenCalled();

    const fine = createContext({
      credentials: { COPILOT_GITHUB_TOKEN: "github_pat_abc" },
    });
    await copilotAuth.login(instance, "api-key", fine.context);
    expect(fine.calls.at(-1)).toEqual([
      "save",
      { COPILOT_GITHUB_TOKEN: "github_pat_abc" },
    ]);
  });

  it("signs out of the runtime and drops token variables", async () => {
    const { calls, context } = createContext({
      cleared: ["COPILOT_GITHUB_TOKEN"],
    });
    const result = await copilotAuth.logout(instance, context);

    expect(copilotClient.rpc.account.logout).toHaveBeenCalledWith({});
    // Only the token this panel stores: GH_TOKEN and GITHUB_TOKEN may be
    // there for other tools.
    expect(calls).toEqual([["clear", ["COPILOT_GITHUB_TOKEN"]]]);
    expect(result).toEqual({
      message: "Signed out and removed this instance's GitHub token.",
    });

    const withGhToken = makeFakeInstance({
      driver: "copilot",
      envOverrides: { GH_TOKEN: "gho_x" },
    });
    const kept = await copilotAuth.logout(withGhToken, createContext().context);
    expect(kept.message).toBe(
      "Signed out. This instance still sets GH_TOKEN, which Copilot can sign in with: remove it from its environment to sign out completely.",
    );
    expect(JSON.stringify(kept)).not.toContain("gho_x");

    copilotClient.rpc.account.logout.mockImplementationOnce(async () => {
      throw new Error("not signed in");
    });
    await expect(
      copilotAuth.logout(instance, createContext().context),
    ).rejects.toThrow("/logout");
  });
});

describe("Cursor", () => {
  const instance = makeFakeInstance({ driver: "cursor" });

  it("runs `agent login` and `agent logout`", async () => {
    const login = createContext();
    await cursorAuth.login(instance, "cli-login", login.context);
    expect(login.calls).toEqual([
      [
        "terminal",
        {
          args: ["login"],
          command: "/Users/me/.local/bin/agent",
          env: { PATH: "/Users/me/.local/bin" },
          title: "Cursor sign-in",
        },
      ],
    ]);

    const logout = createContext();
    await cursorAuth.logout(instance, logout.context);
    expect(logout.calls).toEqual([
      ["clear", ["CURSOR_API_KEY"]],
      [
        "background",
        {
          args: ["logout"],
          command: "/Users/me/.local/bin/agent",
          env: { PATH: "/Users/me/.local/bin" },
        },
      ],
    ]);
  });

  it("stores CURSOR_API_KEY for the instance", async () => {
    const { calls, context } = createContext({
      credentials: { CURSOR_API_KEY: "key_1" },
    });
    await cursorAuth.login(instance, "api-key", context);
    expect(calls.at(-1)).toEqual(["save", { CURSOR_API_KEY: "key_1" }]);
  });
});

describe("OpenCode", () => {
  const instance = makeFakeInstance({ driver: "opencode" });

  it("adds and removes provider logins in the terminal", async () => {
    expect((await openCodeAuth.methods(instance)).map((m) => m.id)).toEqual([
      "cli-login",
    ]);

    const login = createContext();
    await openCodeAuth.login(instance, "cli-login", login.context);
    expect(login.calls[0][1]).toMatchObject({
      args: ["auth", "login"],
      command: "/Users/me/.opencode/bin/opencode",
    });

    const logout = createContext();
    expect(await openCodeAuth.logout(instance, logout.context)).toEqual({
      message: "Removed the provider login you chose.",
    });
    expect(logout.calls[0][1]).toMatchObject({
      args: ["auth", "logout"],
      title: "OpenCode sign-out",
    });

    runtimes.opencode = { cliDetected: false, cliPath: null, env: {} };
    expect(await openCodeAuth.methods(instance)).toEqual([]);
  });
});

describe("sign-out notices", () => {
  it("say when signing out also signs the CLI out on this computer", async () => {
    const { codexAuth } = await import("./codex");
    const shared = (driver) => makeFakeInstance({ driver });
    const ownHome = (driver, name) =>
      makeFakeInstance({ driver, envOverrides: { [name]: "/Users/me/.w" } });

    expect(claudeAuth.logoutNotice(shared("claude"))).toBe(
      "This also signs out Claude Code on this computer, which shares this sign-in.",
    );
    expect(
      claudeAuth.logoutNotice(ownHome("claude", "CLAUDE_CONFIG_DIR")),
    ).toBeNull();
    expect(codexAuth.logoutNotice(shared("codex"))).toContain("Codex CLI");
    expect(codexAuth.logoutNotice(ownHome("codex", "CODEX_HOME"))).toBeNull();
    // Copilot restarts either way.
    expect(copilotAuth.logoutNotice(shared("copilot"))).toBe(
      "This also signs out the GitHub Copilot CLI on this computer, which shares this sign-in. Copilot restarts on this instance, which stops chats running on it.",
    );
    expect(copilotAuth.logoutNotice(ownHome("copilot", "COPILOT_HOME"))).toBe(
      "Copilot restarts on this instance, which stops chats running on it.",
    );
    // Cursor keeps one login per OS user.
    expect(cursorAuth.logoutNotice(ownHome("cursor", "CURSOR_HOME"))).toContain(
      "every Cursor instance",
    );
    expect(openCodeAuth.logoutNotice(shared("opencode"))).toContain(
      "OpenCode CLI",
    );
    expect(
      openCodeAuth.logoutNotice(ownHome("opencode", "XDG_DATA_HOME")),
    ).toBeNull();
  });
});
