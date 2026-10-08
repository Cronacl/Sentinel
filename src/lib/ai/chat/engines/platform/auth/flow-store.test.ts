// @ts-nocheck

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance, makeFakeSnapshot } =
  await import("../../contract/testing");
const { EngineAuthError, EngineAuthFlowError } = await import("./controller");
const { createEngineAuthFlowStore, normalizeEngineAuthCredentials } =
  await import("./flow-store");

const TICKET = "a".repeat(64);
const SECRET = "sk-ant-secret-value-123";

function createFakeClock(start = Date.parse("2026-10-08T00:00:00.000Z")) {
  let now = start;
  let sequence = 0;
  const timers = new Map();
  return {
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now && timers.has(id)) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    clearTimeout: (id) => timers.delete(id),
    now: () => now,
    setTimeout(callback, ms) {
      sequence += 1;
      timers.set(sequence, { at: now + ms, callback });
      return sequence;
    },
    timers,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides = {}) {
  const clock = createFakeClock();
  const events = [];
  let tickets = 0;
  let ids = 0;
  const auth = { status: "authenticated" };
  const deps = {
    clock,
    emit: (event) => events.push(event),
    homeDirectory: () => "/Users/me",
    platform: "darwin",
    progressWaitMs: 50,
    randomId: () => `flow-${++ids}`,
    randomTicket: () => String(++tickets).padStart(64, "a"),
    refreshSnapshot: mock(async () =>
      makeFakeSnapshot({ auth: { ...makeFakeSnapshot().auth, ...auth } }),
    ),
    runCommand: mock(async () => ({ exitCode: 0 })),
    secrets: {
      clear: mock(async (_userId, _instanceId, names) => [...names]),
      publicOverrides: mock(async () => ({ CLAUDE_CONFIG_DIR: "/cfg" })),
      save: mock(async () => {}),
    },
    ...overrides,
  };
  return { auth, clock, deps, events, store: createEngineAuthFlowStore(deps) };
}

const instance = makeFakeInstance({
  driver: "claude",
  env: { PATH: "/managed/bin:/usr/bin", SECRET_TOKEN: SECRET },
  envOverrides: { ANTHROPIC_API_KEY: SECRET, CLAUDE_CONFIG_DIR: "/cfg" },
  label: "Claude Code",
});

function controller(login, extra = {}) {
  return {
    login: mock(login),
    methods: mock(async () => [
      { id: "terminal", label: "Sign in", type: "terminal-command" },
      { id: "api-key", label: "API key", type: "credentials" },
    ]),
    ...extra,
  };
}

function startInput(login, extra = {}) {
  return {
    client: { terminal: true },
    controller: controller(login, extra.controller),
    instance,
    purpose: "login",
    userId: "user-1",
    ...extra.input,
  };
}

describe("credentials flows", () => {
  it("collects credentials, stores them as instance secrets and verifies", async () => {
    const { deps, events, store } = setup();
    const input = startInput(async (_instance, methodId, context) => {
      expect(methodId).toBe("api-key");
      const values = await context.requestCredentials([
        { label: "Anthropic API key", name: "ANTHROPIC_API_KEY", secret: true },
      ]);
      await context.saveInstanceSecrets(values);
    });
    input.methodId = "api-key";

    const waiting = await store.start(input);
    expect(waiting).toMatchObject({
      flowId: "flow-1",
      interaction: {
        fields: [{ name: "ANTHROPIC_API_KEY", secret: true }],
        type: "credentials",
      },
      methodId: "api-key",
      phase: "waiting",
      purpose: "login",
    });

    const finished = await store.respond({
      flowId: "flow-1",
      instanceId: "claude",
      interactionId: waiting.interaction.id,
      response: {
        type: "credentials",
        values: { ANTHROPIC_API_KEY: `  ${SECRET} ` },
      },
      userId: "user-1",
    });

    expect(deps.secrets.save).toHaveBeenCalledWith("user-1", "claude", {
      ANTHROPIC_API_KEY: SECRET,
    });
    expect(deps.refreshSnapshot).toHaveBeenCalledWith("user-1", "claude");
    expect(finished).toMatchObject({
      interaction: null,
      message: "Signed in to Claude Code.",
      phase: "succeeded",
    });
    // The secret never leaves through state or events.
    expect(JSON.stringify(store.get("user-1", "claude"))).not.toContain(SECRET);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    expect(events.every((event) => event.state.interaction === null)).toBe(
      true,
    );
  });

  it("rejects answers that do not match the pending step", async () => {
    const { store } = setup();
    const input = startInput(async (_instance, _methodId, context) => {
      await context.requestCredentials([
        { label: "Key", name: "KEY", secret: true },
      ]);
    });
    const waiting = await store.start(input);
    const base = {
      flowId: waiting.flowId,
      instanceId: "claude",
      interactionId: waiting.interaction.id,
      userId: "user-1",
    };

    await expect(
      store.respond({
        ...base,
        response: { type: "credentials", values: { KEY: "   " } },
      }),
    ).rejects.toMatchObject({ code: "invalid", message: "Key is required." });
    await expect(
      store.respond({
        ...base,
        response: { type: "credentials", values: { KEY: "x", OTHER: "y" } },
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.respond({
        ...base,
        response: { exitCode: 0, type: "terminal" },
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      store.respond({
        ...base,
        interactionId: "flow-1:9",
        response: { type: "credentials", values: { KEY: "x" } },
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    // Another user cannot see or answer the flow.
    await expect(
      store.respond({
        ...base,
        response: { type: "credentials", values: { KEY: "x" } },
        userId: "user-2",
      }),
    ).rejects.toBeInstanceOf(EngineAuthFlowError);
    expect(store.get("user-2", "claude").phase).toBe("idle");
  });

  it("normalizes credential values", () => {
    const fields = [{ label: "Token", name: "TOKEN", secret: true }];
    expect(normalizeEngineAuthCredentials(fields, { TOKEN: " t " })).toEqual({
      TOKEN: "t",
    });
    expect(() =>
      normalizeEngineAuthCredentials(fields, { TOKEN: "a\nb" }),
    ).toThrow("Token is not a valid value.");
  });

  it("redacts submitted secrets from failure messages", async () => {
    const { store } = setup();
    const input = startInput(async (_instance, _methodId, context) => {
      const values = await context.requestCredentials([
        { label: "Key", name: "KEY", secret: true },
      ]);
      throw new Error(`Invalid key ${values.KEY}`);
    });
    const waiting = await store.start(input);
    const finished = await store.respond({
      flowId: waiting.flowId,
      instanceId: "claude",
      interactionId: waiting.interaction.id,
      response: { type: "credentials", values: { KEY: SECRET } },
      userId: "user-1",
    });

    expect(finished.phase).toBe("failed");
    expect(finished.message).toBe("Sign-in failed: Invalid key ••••");
  });
});

describe("terminal flows", () => {
  it("issues a one-time launch ticket for the driver's command", async () => {
    const { deps, store } = setup();
    const input = startInput(async (_instance, _methodId, context) => {
      const { exitCode } = await context.runTerminalCommand({
        args: ["auth", "login"],
        command: "/opt/bin/claude",
        title: "Claude sign-in",
      });
      expect(exitCode).toBe(0);
    });

    const waiting = await store.start(input);
    expect(waiting.interaction).toEqual({
      args: ["auth", "login"],
      command: "/opt/bin/claude",
      cwd: "/Users/me",
      displayCommand: "CLAUDE_CONFIG_DIR=/cfg /opt/bin/claude auth login",
      env: { CLAUDE_CONFIG_DIR: "/cfg", PATH: "/managed/bin:/usr/bin" },
      id: "flow-1:1",
      launch: {
        expiresAt: "2026-10-08T00:05:00.000Z",
        ticket: TICKET.slice(0, 63) + "1",
      },
      title: "Claude sign-in",
      type: "terminal-command",
    });
    expect(JSON.stringify(waiting)).not.toContain(SECRET);

    const ticket = waiting.interaction.launch.ticket;
    expect(store.redeemTerminalTicket(ticket)).toEqual({
      args: ["auth", "login"],
      command: "/opt/bin/claude",
      cwd: "/Users/me",
      env: { CLAUDE_CONFIG_DIR: "/cfg", PATH: "/managed/bin:/usr/bin" },
      title: "Claude sign-in",
    });
    // Once only.
    expect(store.redeemTerminalTicket(ticket)).toBeNull();
    expect(store.redeemTerminalTicket("not-a-ticket")).toBeNull();

    const finished = await store.respond({
      flowId: waiting.flowId,
      instanceId: "claude",
      interactionId: waiting.interaction.id,
      response: { exitCode: 0, type: "terminal" },
      userId: "user-1",
    });
    expect(finished).toMatchObject({ phase: "succeeded" });
    expect(deps.refreshSnapshot).toHaveBeenCalledTimes(1);
  });

  it("shows a copyable command without a ticket in a browser", async () => {
    const { store } = setup();
    const input = startInput(async (_instance, _methodId, context) => {
      await context.runTerminalCommand({
        args: ["auth", "login"],
        command: "/opt/node",
        display: { args: ["auth", "login"], command: "/opt/my tools/claude" },
        env: { ELECTRON_RUN_AS_NODE: "1" },
        title: "Claude sign-in",
      });
    });
    input.client = { terminal: false };

    const waiting = await store.start(input);
    expect(waiting.interaction).toMatchObject({
      displayCommand:
        "CLAUDE_CONFIG_DIR=/cfg '/opt/my tools/claude' auth login",
      env: {
        CLAUDE_CONFIG_DIR: "/cfg",
        ELECTRON_RUN_AS_NODE: "1",
        PATH: "/managed/bin:/usr/bin",
      },
      launch: null,
    });
    expect(waiting.message).toBe(
      "Run this command in a terminal, then confirm here.",
    );
  });

  it("fails with the exit code when the command failed and auth is missing", async () => {
    const { auth, store } = setup();
    auth.status = "unauthenticated";
    const input = startInput(async (_instance, _methodId, context) => {
      await context.runTerminalCommand({
        args: ["login"],
        command: "/opt/bin/agent",
        title: "Cursor sign-in",
      });
    });

    const waiting = await store.start(input);
    const finished = await store.respond({
      flowId: waiting.flowId,
      instanceId: "claude",
      interactionId: waiting.interaction.id,
      response: { exitCode: 3, type: "terminal" },
      userId: "user-1",
    });
    expect(finished).toMatchObject({
      message: "The sign-in command exited with code 3.",
      phase: "failed",
    });
    // The ticket died with the answer.
    expect(
      store.redeemTerminalTicket(waiting.interaction.launch.ticket),
    ).toBeNull();
  });
});

describe("flow lifetime", () => {
  it("cancels: the driver's signal aborts and the ticket is revoked", async () => {
    const { deps, store } = setup();
    let signal = null;
    let pendingError = null;
    const input = startInput(async (_instance, _methodId, context) => {
      signal = context.signal;
      try {
        await context.runTerminalCommand({
          args: [],
          command: "/bin/login",
          title: "Login",
        });
      } catch (error) {
        pendingError = error;
        throw error;
      }
    });

    const waiting = await store.start(input);
    const cancelled = await store.cancel({
      flowId: waiting.flowId,
      instanceId: "claude",
      userId: "user-1",
    });
    await flush();

    expect(cancelled).toMatchObject({
      interaction: null,
      message: "Sign-in cancelled.",
      phase: "cancelled",
    });
    expect(signal.aborted).toBe(true);
    expect(pendingError?.name).toBe("EngineAuthFlowEndedError");
    expect(
      store.redeemTerminalTicket(waiting.interaction.launch.ticket),
    ).toBeNull();
    expect(deps.refreshSnapshot).not.toHaveBeenCalled();
    // Cancelling again is harmless.
    await expect(
      store.cancel({
        flowId: waiting.flowId,
        instanceId: "claude",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ phase: "cancelled" });
  });

  it("expires after its TTL and is forgotten after the retention", async () => {
    const { clock, store } = setup({ flowTtlMs: 1_000, retainFinishedMs: 500 });
    const input = startInput(async (_instance, _methodId, context) => {
      context.showBrowser("https://auth.example.com/authorize?x=1");
      await new Promise(() => {});
    });

    const waiting = await store.start(input);
    expect(waiting).toMatchObject({
      interaction: {
        type: "browser",
        url: "https://auth.example.com/authorize?x=1",
      },
      phase: "waiting",
    });

    clock.advance(1_000);
    expect(store.get("user-1", "claude")).toMatchObject({
      message: "Sign-in expired. Start again.",
      phase: "failed",
    });

    clock.advance(500);
    expect(store.get("user-1", "claude").phase).toBe("idle");
  });

  it("replaces a running flow when a new one starts", async () => {
    const { store } = setup();
    let firstSignal = null;
    const first = startInput(async (_instance, _methodId, context) => {
      firstSignal = context.signal;
      context.showDeviceCode({
        url: "https://github.com/login/device",
        userCode: "ABCD-1234",
      });
      await new Promise(() => {});
    });
    const firstState = await store.start(first);
    expect(firstState.interaction).toMatchObject({
      type: "device-code",
      userCode: "ABCD-1234",
    });

    const second = await store.start(
      startInput(async (_instance, _methodId, context) => {
        await context.requestCredentials([
          { label: "Key", name: "KEY", secret: true },
        ]);
      }),
    );

    expect(firstSignal.aborted).toBe(true);
    expect(second.flowId).toBe("flow-2");
    expect(store.get("user-1", "claude").flowId).toBe("flow-2");
    await expect(
      store.cancel({
        flowId: "flow-1",
        instanceId: "claude",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("fails on driver errors, unknown methods and unsafe pages", async () => {
    const { store } = setup();

    const known = await store.start(
      startInput(async () => {
        throw new EngineAuthError("Install Claude Code first.");
      }),
    );
    expect(known).toMatchObject({
      message: "Install Claude Code first.",
      phase: "failed",
    });

    const missing = startInput(async () => {});
    missing.methodId = "sso";
    expect(await store.start(missing)).toMatchObject({
      message: "This sign-in method is not available for this instance.",
      phase: "failed",
    });

    const unsafe = await store.start(
      startInput(async (_instance, _methodId, context) => {
        context.showBrowser("javascript:alert(1)");
      }),
    );
    expect(unsafe).toMatchObject({
      message: "The sign-in page address is not valid.",
      phase: "failed",
    });
  });
});

describe("sign-out", () => {
  it("runs the driver's logout with the instance environment", async () => {
    const { auth, deps, store } = setup();
    auth.status = "unauthenticated";
    const logout = mock(async (_instance, context) => {
      await context.clearInstanceSecrets(["ANTHROPIC_API_KEY"]);
      const { exitCode } = await context.runBackgroundCommand({
        args: ["auth", "logout"],
        command: "/opt/bin/claude",
      });
      expect(exitCode).toBe(0);
    });

    const state = await store.start({
      client: { terminal: false },
      controller: controller(async () => {}, { logout }),
      instance,
      purpose: "logout",
      userId: "user-1",
    });

    expect(state).toMatchObject({
      message: "Signed out of Claude Code.",
      phase: "succeeded",
      purpose: "logout",
    });
    expect(deps.secrets.clear).toHaveBeenCalledWith("user-1", "claude", [
      "ANTHROPIC_API_KEY",
    ]);
    expect(deps.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["auth", "logout"],
        command: "/opt/bin/claude",
        env: instance.env,
      }),
    );
  });

  it("fails when the driver cannot sign out", async () => {
    const { store } = setup();
    const state = await store.start({
      client: { terminal: false },
      controller: controller(async () => {}),
      instance,
      purpose: "logout",
      userId: "user-1",
    });
    expect(state).toMatchObject({
      message: "This engine cannot be signed out from Sentinel.",
      phase: "failed",
    });
  });
});
