import { afterEach, describe, expect, it, mock } from "bun:test";

import type { AcpSessionUpdateEnvelope } from "./schema";

// Session selection, lazy auth, config options and plan mode against the
// mock agent over real stdio.
mock.module("server-only", () => ({}));

const { AcpAuthRequiredError, AcpRequestCancelledError } =
  await import("./errors");
const session = await import("./session");
const support = await import("./__tests__/mock-agent");
const { cursorProfile } =
  await import("../../../../../../scripts/fixtures/agents/acp/profiles");

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function start(scenario: Parameters<typeof support.startMockAgent>[0]) {
  const dir = support.makeTempDir("session");
  const started = support.startMockAgent(scenario, { dir });
  cleanups.push(() => support.removeTempDir(dir));
  cleanups.push(() => started.process.dispose());
  return { ...started, dir };
}

const descriptor = support.mockDescriptor({
  auth: {
    methodId: (methods) =>
      methods.find((method) => method.id === "cursor_login")?.id ?? null,
    strategy: "lazy",
    timeoutMs: 5_000,
  },
});

async function open(
  started: ReturnType<typeof start>,
  input: Partial<Parameters<typeof session.openAcpSession>[1]> = {},
) {
  const init = await session.initializeAcpAgent(started.process, {
    context: "session",
    descriptor,
  });
  return await session.openAcpSession(started.process, {
    auth: { binaryPath: "/bin/agent", interactive: true },
    cwd: started.dir,
    descriptor,
    init,
    mcpServers: [],
    persistedSessionId: null,
    ...input,
  });
}

function methodsCalled(logPath: string) {
  return support
    .readMockLog(logPath)
    .flatMap((entry) =>
      entry.kind === "request" || entry.kind === "notification"
        ? [entry.method]
        : [],
    );
}

describe("lazy auth", () => {
  it("never authenticates when the agent does not ask", async () => {
    const started = start({});
    await open(started);
    expect(methodsCalled(started.logPath)).not.toContain("authenticate");
  });

  it("authenticates once when a session needs it, then retries", async () => {
    const started = start({
      auth: { acceptMethodIds: ["cursor_login"], requireAuth: true },
      initialize: {
        authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      },
    });
    const authenticating: string[] = [];
    const result = await open(started, {
      auth: {
        binaryPath: "/bin/agent",
        interactive: true,
        onAuthenticating: (method) => authenticating.push(method.id),
      },
    });
    expect(result.session.sessionId).toBeTruthy();
    expect(authenticating).toEqual(["cursor_login"]);
    expect(methodsCalled(started.logPath)).toEqual([
      "initialize",
      "session/new",
      "authenticate",
      "session/new",
    ]);
  });

  it("does not start a sign-in in an unattended run", async () => {
    const started = start({
      auth: { requireAuth: true },
      initialize: {
        authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      },
    });
    const error = await open(started, {
      auth: { binaryPath: "/bin/agent", interactive: false },
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AcpAuthRequiredError);
    expect((error as Error).message).toContain(
      "automation runs cannot sign in",
    );
    expect(methodsCalled(started.logPath)).not.toContain("authenticate");
  });

  it("reports terminal and env_var methods instead of running them", async () => {
    for (const method of [
      { args: ["login"], id: "cursor_login", name: "Login", type: "terminal" },
      {
        id: "cursor_login",
        name: "Key",
        type: "env_var",
        vars: [{ name: "CURSOR_API_KEY" }],
      },
    ]) {
      const started = start({
        auth: { requireAuth: true },
        initialize: { authMethods: [method] },
      });
      const error = await open(started).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AcpAuthRequiredError);
      expect((error as Error).message).toMatch(
        method.type === "terminal" ? /\/bin\/agent login/ : /CURSOR_API_KEY/,
      );
      expect(methodsCalled(started.logPath)).not.toContain("authenticate");
    }
  });
});

describe("session selection", () => {
  it("loads a persisted session, drops its replay and reports the history delivered", async () => {
    const started = start({
      session: {
        load: {
          knownSessionIds: ["persisted"],
          replay: [
            {
              content: { text: "old question", type: "text" },
              sessionUpdate: "user_message_chunk",
            },
            {
              content: { text: "old answer", type: "text" },
              sessionUpdate: "agent_message_chunk",
            },
          ],
        },
      },
    });
    const updates: AcpSessionUpdateEnvelope[] = [];
    let replaying = false;
    started.process.attach({
      onSessionUpdate: (update) => {
        if (!replaying) updates.push(update);
      },
    });

    const result = await open(started, {
      onReplay: (value) => {
        replaying = value;
      },
      persistedSessionId: "persisted",
    });

    expect(result).toEqual(
      expect.objectContaining({
        historyDelivered: true,
        session: expect.objectContaining({
          origin: "load",
          sessionId: "persisted",
        }),
      }),
    );
    expect(updates).toEqual([]);
    expect(methodsCalled(started.logPath)).not.toContain("session/new");
  });

  it("starts a new session when the persisted one is gone, so the transcript is sent once", async () => {
    const started = start({
      session: {
        load: { knownSessionIds: ["other"] },
        resume: { knownSessionIds: ["other"] },
      },
    });
    const lost: unknown[] = [];
    const result = await open(started, {
      onSessionLost: (error) => lost.push(error),
      persistedSessionId: "gone",
    });
    expect(result.historyDelivered).toBe(false);
    expect(result.session.origin).toBe("new");
    expect(lost).toHaveLength(1);
    expect(methodsCalled(started.logPath)).toEqual([
      "initialize",
      "session/load",
      "session/new",
    ]);
  });

  it("keeps the persisted session when the sign-in during its load fails", async () => {
    const started = start({
      auth: { acceptMethodIds: ["other"], requireAuth: true },
      initialize: {
        authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      },
      session: { load: { knownSessionIds: ["persisted"] } },
    });
    const lost: unknown[] = [];
    const error = await open(started, {
      onSessionLost: (caught) => lost.push(caught),
      persistedSessionId: "persisted",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AcpAuthRequiredError);
    expect((error as Error).message).toContain("sign-in did not complete");
    expect(lost).toEqual([]);
    expect(methodsCalled(started.logPath)).toEqual([
      "initialize",
      "session/load",
      "authenticate",
    ]);
  });

  it("stops on Stop during a load instead of starting a new session", async () => {
    const started = start({
      faults: { hangMethods: ["session/load"] },
      session: { load: { knownSessionIds: ["persisted"] } },
    });
    const controller = new AbortController();
    const pending = open(started, {
      auth: {
        binaryPath: null,
        interactive: true,
        signal: controller.signal,
      },
      persistedSessionId: "persisted",
    });
    for (let tries = 0; tries < 200; tries += 1) {
      if (methodsCalled(started.logPath).includes("session/load")) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    controller.abort(new Error("Generation stopped."));
    expect(await pending.catch((caught: unknown) => caught)).toBeInstanceOf(
      AcpRequestCancelledError,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(methodsCalled(started.logPath)).not.toContain("session/new");
  });

  it("resumes when the descriptor prefers it and the agent supports it", async () => {
    const started = start({ session: { resume: { knownSessionIds: ["s"] } } });
    const init = await session.initializeAcpAgent(started.process, {
      context: "session",
      descriptor,
    });
    const result = await session.openAcpSession(started.process, {
      auth: { binaryPath: null, interactive: true },
      cwd: started.dir,
      descriptor: { ...descriptor, session: { prefer: "resume" } },
      init,
      mcpServers: [],
      persistedSessionId: "s",
    });
    expect(result.session.origin).toBe("resume");
    expect(methodsCalled(started.logPath)).toEqual([
      "initialize",
      "session/resume",
    ]);
  });

  it("reuses the live session of the process without any request", async () => {
    const started = start({});
    const first = await open(started);
    const second = await open(started, {
      persistedSessionId: first.session.sessionId,
    });
    expect(second.session).toBe(first.session);
    expect(second.historyDelivered).toBe(true);
    expect(
      methodsCalled(started.logPath).filter((method) =>
        method.startsWith("session/"),
      ),
    ).toEqual(["session/new"]);
  });

  it("passes the forwarded MCP servers to the agent", async () => {
    const started = start({});
    await open(started, {
      mcpServers: [{ args: [], command: "mcp", env: [], name: "tools" }],
    });
    const request = support
      .readMockLog(started.logPath)
      .find(
        (entry) => entry.kind === "request" && entry.method === "session/new",
      );
    expect(request).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          mcpServers: [{ args: [], command: "mcp", env: [], name: "tools" }],
        }),
      }),
    );
  });
});

describe("model, effort and plan mode", () => {
  it("sets the model, then the effort from that model's own options", async () => {
    const profile = cursorProfile();
    const started = start({ ...profile, auth: undefined });
    const { session: live } = await open(started);

    await session.applyAcpModelSelection(started.process, live, {
      effort: "xhigh",
      modelId: "gpt-5.4",
    });
    const sets = support
      .readMockLog(started.logPath)
      .flatMap((entry) =>
        entry.kind === "request" && entry.method === "session/set_config_option"
          ? [entry.params]
          : [],
      );
    expect(sets).toEqual([
      expect.objectContaining({ configId: "model", value: "gpt-5.4" }),
      expect.objectContaining({ configId: "reasoning", value: "extra-high" }),
    ]);

    // Nothing changes: nothing is sent.
    await session.applyAcpModelSelection(started.process, live, {
      effort: "xhigh",
      modelId: "gpt-5.4",
    });
    expect(
      methodsCalled(started.logPath).filter(
        (method) => method === "session/set_config_option",
      ),
    ).toHaveLength(2);
  });

  it("enters plan mode with set_mode and restores the build mode on a chat turn", async () => {
    const profile = cursorProfile();
    const started = start({ ...profile, auth: undefined });
    const { session: live } = await open(started);

    const plan = await session.applyAcpPlanMode(started.process, live, {
      descriptor: { planMode: "native" },
      rememberedBuildModeId: null,
      threadMode: "plan",
    });
    expect(plan).toEqual({
      buildModeId: "agent",
      modeId: "plan",
      usePreamble: false,
    });

    const chat = await session.applyAcpPlanMode(started.process, live, {
      descriptor: { planMode: "native" },
      rememberedBuildModeId: plan.buildModeId,
      threadMode: "chat",
    });
    expect(chat).toEqual({
      buildModeId: null,
      modeId: "agent",
      usePreamble: false,
    });
    expect(
      support
        .readMockLog(started.logPath)
        .flatMap((entry) =>
          entry.kind === "request" && entry.method === "session/set_mode"
            ? [(entry.params as { modeId: string }).modeId]
            : [],
        ),
    ).toEqual(["plan", "agent"]);
  });

  it("falls back to the plan preamble when the agent has no plan mode", async () => {
    const started = start({ session: { configOptions: [], modes: null } });
    const { session: live } = await open(started);
    expect(
      await session.applyAcpPlanMode(started.process, live, {
        descriptor: { planMode: "native" },
        rememberedBuildModeId: null,
        threadMode: "plan",
      }),
    ).toEqual(expect.objectContaining({ usePreamble: true }));
  });
});
