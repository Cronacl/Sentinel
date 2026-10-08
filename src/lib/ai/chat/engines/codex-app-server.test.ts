import { afterEach, describe, expect, it, mock } from "bun:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../../../../../package.json";

// Drives CodexAppServerManager against the mock app-server peer over real
// stdio NDJSON framing (no codex binary needed).

mock.module("server-only", () => ({}));

const debugLogs: Array<{ data: unknown; message: string }> = [];
mock.module("@/lib/logger", () => ({
  createLogger: () => ({
    debug: (message: string, data?: unknown) => {
      debugLogs.push({ data, message });
    },
    error() {},
    info() {},
    warn() {},
  }),
}));

const MOCK_PEER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "codex-app-server",
  "__fixtures__",
  "mock-codex-app-server.ts",
);

let currentScenario: Record<string, unknown> = {};

const spawnCodexCliMock = mock(async (args: string[]) =>
  spawn(process.execPath, [MOCK_PEER_PATH, ...args], {
    env: {
      ...process.env,
      MOCK_CODEX_SCENARIO: JSON.stringify(currentScenario),
    },
    stdio: ["pipe", "pipe", "pipe"],
  }),
);

mock.module("./codex-cli", () => ({
  readCodexCliVersion: mock(async () => null),
  resolveCodexCli: mock(async () => null),
  spawnCodexCli: spawnCodexCliMock,
}));

const {
  CodexAppServerManager,
  getCodexAppServerManager,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./codex-app-server.ts?codex-app-server-protocol-test");
const { retireInstanceResources } =
  await import("./platform/instance-resources");
const { getInstanceRuntimeKey } =
  await import("./platform/runtime/resolve-binary");

type Manager = InstanceType<typeof CodexAppServerManager> & {
  call: (method: string, params?: unknown) => Promise<unknown>;
};

const managers: Manager[] = [];

function createManager(scenario: Record<string, unknown> = {}) {
  currentScenario = scenario;
  const manager = new CodexAppServerManager() as Manager;
  managers.push(manager);
  return manager;
}

async function receivedFrames(manager: Manager) {
  const response = (await manager.call("mock/received", {})) as {
    frames: Array<Record<string, any>>;
  };
  return response.frames;
}

async function emitFromPeer(
  manager: Manager,
  messages: unknown[],
  chunkSize?: number,
) {
  await manager.call("mock/emit", {
    messages,
    ...(chunkSize ? { chunkSize } : {}),
  });
}

function collectEvents(manager: Manager) {
  const events: Array<Record<string, any>> = [];
  manager.subscribe((event: Record<string, any>) => {
    events.push(event);
  });
  return events;
}

function findReply(frames: Array<Record<string, any>>, id: number) {
  return frames.find(
    (frame) => frame.id === id && ("result" in frame || "error" in frame),
  );
}

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    await manager.reloadRuntime();
  }
  debugLogs.length = 0;
});

describe("per-instance app-server managers", () => {
  function instance(overrides: Record<string, unknown> = {}) {
    return {
      config: {},
      envOverrides: {},
      envUnset: [],
      id: "codex",
      isDefault: true,
      ...overrides,
    };
  }

  it("keeps one manager per instance and shares the default's", () => {
    const work = instance({
      envOverrides: { CODEX_HOME: "/homes/work" },
      id: "codex-work",
      isDefault: false,
    });

    expect(getCodexAppServerManager(instance())).toBe(
      getCodexAppServerManager(),
    );
    expect(getCodexAppServerManager(work)).toBe(getCodexAppServerManager(work));
    expect(getCodexAppServerManager(work)).not.toBe(getCodexAppServerManager());
  });

  it("starts the instance's app-server and replaces it when its configuration changes", async () => {
    spawnCodexCliMock.mockClear();
    const work = instance({
      envOverrides: { CODEX_HOME: "/homes/work-2" },
      id: "codex-work-2",
      isDefault: false,
    });
    const manager = getCodexAppServerManager(work) as Manager;
    managers.push(manager);

    await manager.ensureStarted();
    expect(spawnCodexCliMock.mock.calls.at(-1)).toEqual([
      ["app-server"],
      { instance: work },
    ]);
    const child = await spawnCodexCliMock.mock.results.at(-1)!.value;

    const moved = { ...work, envOverrides: { CODEX_HOME: "/homes/moved" } };
    const replacement = getCodexAppServerManager(moved) as Manager;
    managers.push(replacement);
    expect(replacement).not.toBe(manager);
    // A lookup leaves the old process to whoever still uses it; handling
    // the instance change retires it.
    expect(child.exitCode).toBeNull();
    await retireInstanceResources(work.id, getInstanceRuntimeKey(moved));

    const exited = await new Promise<boolean>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve(true);
        return;
      }
      const timer = setTimeout(() => resolve(false), 3_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    expect(exited).toBe(true);
  });
});

describe("CodexAppServerManager handshake", () => {
  it("initializes with client info and experimentalApi, then notifies initialized", async () => {
    const manager = createManager();
    await manager.ensureStarted();

    const frames = await receivedFrames(manager);
    expect(frames[0]).toEqual({
      id: "1",
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: ["turn/diff/updated"],
        },
        clientInfo: {
          name: "sentinel",
          title: "Sentinel",
          version: packageJson.version,
        },
      },
    });
    expect(frames[1]).toEqual({ jsonrpc: "2.0", method: "initialized" });
    expect(manager.getServerVersion()).toBe("0.160.1");
    expect(manager.supportsCollaborationMode()).toBe(true);
  });

  it("tolerates -32600 Already initialized and still sends initialized", async () => {
    const manager = createManager({
      initialize: { error: { code: -32600, message: "Already initialized" } },
    });
    await manager.ensureStarted();

    const frames = await receivedFrames(manager);
    expect(frames.map((frame) => frame.method)).toEqual([
      "initialize",
      "initialized",
    ]);
  });

  it("fails the start on any other initialize error", async () => {
    const manager = createManager({
      initialize: { error: { code: -32603, message: "boom" } },
    });

    await expect(manager.ensureStarted()).rejects.toThrow("boom");
  });

  it("reports app-servers below 0.156 as lacking native collaboration mode", async () => {
    const manager = createManager({
      initialize: { userAgent: "codex_cli_rs/0.150.2 (Linux; x86_64)" },
    });
    await manager.ensureStarted();

    expect(manager.getServerVersion()).toBe("0.150.2");
    expect(manager.supportsCollaborationMode()).toBe(false);
  });

  it("reassembles notifications split across stdout chunks", async () => {
    const manager = createManager();
    const events = collectEvents(manager);
    const notifications = [
      {
        jsonrpc: "2.0",
        method: "item/agentMessage/delta",
        params: {
          delta: "héllo ✓",
          itemId: "item-1",
          threadId: "thr",
          turnId: "turn",
        },
      },
      {
        jsonrpc: "2.0",
        method: "turn/plan/updated",
        params: {
          plan: [{ status: "inProgress", step: "Read" }],
          threadId: "thr",
          turnId: "turn",
        },
      },
    ];

    await emitFromPeer(manager, notifications, 7);

    expect(events).toEqual(
      notifications.map((notification) => ({
        method: notification.method,
        params: notification.params,
        type: "notification",
      })),
    );
  });
});

describe("CodexAppServerManager server requests", () => {
  it("answers item/tool/requestUserInput with answers keyed by question id", async () => {
    const manager = createManager();
    const events = collectEvents(manager);

    await emitFromPeer(manager, [
      {
        id: 41,
        jsonrpc: "2.0",
        method: "item/tool/requestUserInput",
        params: {
          isBlocking: true,
          itemId: "item-ask",
          questions: [
            {
              header: "Approach",
              id: "approach",
              options: [
                { description: "Small patch", label: "Patch" },
                { description: "Start over", label: "Rewrite" },
              ],
              question: "How should I fix it?",
            },
          ],
          threadId: "thr",
          turnId: "turn",
        },
      },
    ]);

    expect(events[0]).toMatchObject({
      id: "41",
      method: "item/tool/requestUserInput",
      type: "user-input-request",
    });

    await manager.respondToUserInput("41", "2");

    expect(findReply(await receivedFrames(manager), 41)).toEqual({
      id: 41,
      jsonrpc: "2.0",
      result: { answers: { approach: { answers: ["Rewrite"] } } },
    });
  });

  it("keeps the legacy tool/requestUserInput {response} shape", async () => {
    const manager = createManager();
    collectEvents(manager);
    await emitFromPeer(manager, [
      {
        id: "legacy-1",
        jsonrpc: "2.0",
        method: "tool/requestUserInput",
        params: { prompt: "Which branch?", threadId: "thr" },
      },
    ]);

    await manager.respondToUserInput("legacy-1", "main");

    const frames = await receivedFrames(manager);
    expect(
      frames.find((frame) => frame.id === "legacy-1" && "result" in frame),
    ).toEqual({
      id: "legacy-1",
      jsonrpc: "2.0",
      result: { response: "main" },
    });
  });

  it("maps item/permissions/requestApproval decisions to granted permissions", async () => {
    const manager = createManager();
    collectEvents(manager);
    const permissions = {
      fileSystem: { write: ["/tmp/project/out"] },
      network: { enabled: true },
    };
    const request = (id: number) => ({
      id,
      jsonrpc: "2.0",
      method: "item/permissions/requestApproval",
      params: {
        cwd: "/tmp/project",
        itemId: `item-${id}`,
        permissions,
        reason: "Needs network",
        startedAtMs: 1,
        threadId: "thr",
        turnId: "turn",
      },
    });

    await emitFromPeer(manager, [request(51), request(52), request(53)]);
    await manager.respondToApproval("51", "accept");
    await manager.respondToApproval("52", "acceptForSession");
    await manager.respondToApproval("53", "decline");

    const frames = await receivedFrames(manager);
    expect(findReply(frames, 51)?.result).toEqual({
      permissions,
      scope: "turn",
    });
    expect(findReply(frames, 52)?.result).toEqual({
      permissions,
      scope: "session",
    });
    expect(findReply(frames, 53)?.result).toEqual({
      permissions: {},
      scope: "turn",
    });
  });

  it("answers MCP elicitations instead of rejecting them", async () => {
    const manager = createManager();
    collectEvents(manager);
    await emitFromPeer(manager, [
      {
        id: 61,
        jsonrpc: "2.0",
        method: "mcpServer/elicitation/request",
        params: {
          message: "Allow the tool to run?",
          mode: "form",
          requestedSchema: {
            properties: {
              choice: { enum: ["allow_once", "deny"], type: "string" },
            },
            required: ["choice"],
            type: "object",
          },
          serverName: "docs",
          threadId: "thr",
          turnId: "turn",
        },
      },
      {
        id: 62,
        jsonrpc: "2.0",
        method: "mcpServer/elicitation/request",
        params: {
          elicitationId: "e-1",
          message: "Sign in",
          mode: "url",
          serverName: "docs",
          threadId: "thr",
          url: "https://example.com/login",
        },
      },
      {
        id: 63,
        jsonrpc: "2.0",
        method: "mcpServer/elicitation/request",
        params: {
          message: "Continue?",
          mode: "form",
          requestedSchema: { properties: {}, type: "object" },
          serverName: "docs",
          threadId: "thr",
        },
      },
    ]);

    expect(await manager.respondToApproval("61", "accept")).toEqual({
      declinedReason: null,
    });
    // An accept on a URL elicitation is sent as a decline; the caller is
    // told why so the transcript does not show it as approved.
    expect(await manager.respondToApproval("62", "accept")).toEqual({
      declinedReason:
        "Sentinel cannot open MCP sign-in links yet, so the request was declined.",
    });
    expect(await manager.respondToApproval("63", "cancel")).toEqual({
      declinedReason: null,
    });

    const frames = await receivedFrames(manager);
    expect(findReply(frames, 61)?.result).toEqual({
      action: "accept",
      content: { choice: "allow_once" },
    });
    expect(findReply(frames, 62)?.result).toEqual({ action: "decline" });
    expect(findReply(frames, 63)?.result).toEqual({ action: "cancel" });
  });

  it("keeps v2 approval decisions and maps the execpolicy amendment object", async () => {
    const manager = createManager();
    collectEvents(manager);
    await emitFromPeer(manager, [
      {
        id: 71,
        jsonrpc: "2.0",
        method: "item/commandExecution/requestApproval",
        params: {
          command: "git status",
          itemId: "cmd-1",
          proposedExecpolicyAmendment: ["git", "status"],
          startedAtMs: 1,
          threadId: "thr",
          turnId: "turn",
        },
      },
      {
        id: 72,
        jsonrpc: "2.0",
        method: "item/fileChange/requestApproval",
        params: {
          itemId: "patch-1",
          startedAtMs: 1,
          threadId: "thr",
          turnId: "turn",
        },
      },
    ]);

    await manager.respondToApproval("71", "acceptWithExecpolicyAmendment");
    await manager.respondToApproval("72", "acceptForSession");

    const frames = await receivedFrames(manager);
    expect(findReply(frames, 71)?.result).toEqual({
      decision: {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ["git", "status"],
        },
      },
    });
    expect(findReply(frames, 72)?.result).toEqual({
      decision: "acceptForSession",
    });
  });

  it("maps legacy execCommandApproval and applyPatchApproval to review decisions", async () => {
    const manager = createManager();
    collectEvents(manager);
    await emitFromPeer(manager, [
      {
        id: 81,
        jsonrpc: "2.0",
        method: "execCommandApproval",
        params: {
          callId: "call-1",
          command: ["ls"],
          conversationId: "thr",
          cwd: "/tmp",
        },
      },
      {
        id: 82,
        jsonrpc: "2.0",
        method: "applyPatchApproval",
        params: { callId: "call-2", conversationId: "thr", fileChanges: {} },
      },
      {
        id: 83,
        jsonrpc: "2.0",
        method: "execCommandApproval",
        params: {
          callId: "call-3",
          command: ["rm"],
          conversationId: "thr",
          cwd: "/tmp",
        },
      },
    ]);

    await manager.respondToApproval("81", "accept");
    await manager.respondToApproval("82", "decline");
    await manager.respondToApproval("83", "cancel");

    const frames = await receivedFrames(manager);
    expect(findReply(frames, 81)?.result).toEqual({ decision: "approved" });
    expect(findReply(frames, 82)?.result).toEqual({
      decision: { denied: { rejection: "User declined the request." } },
    });
    expect(findReply(frames, 83)?.result).toEqual({ decision: "abort" });
  });

  it("rejects capabilities Sentinel never advertised with -32601", async () => {
    const manager = createManager();
    await emitFromPeer(manager, [
      {
        id: 91,
        jsonrpc: "2.0",
        method: "item/tool/call",
        params: { callId: "c", threadId: "thr", tool: "x", turnId: "turn" },
      },
    ]);

    const reply = findReply(await receivedFrames(manager), 91);
    expect(reply?.error).toEqual({
      code: -32601,
      message: "Unsupported server request: item/tool/call",
    });
    expect(debugLogs).toContainEqual({
      data: { method: "item/tool/call" },
      message: "unsupported_server_request",
    });
  });

  it("drops a pending request once Codex reports it resolved", async () => {
    const manager = createManager();
    collectEvents(manager);
    await emitFromPeer(manager, [
      {
        id: 101,
        jsonrpc: "2.0",
        method: "item/commandExecution/requestApproval",
        params: {
          itemId: "cmd-2",
          startedAtMs: 1,
          threadId: "thr",
          turnId: "turn",
        },
      },
      {
        jsonrpc: "2.0",
        method: "serverRequest/resolved",
        params: { requestId: 101, threadId: "thr" },
      },
    ]);

    await expect(manager.respondToApproval("101", "accept")).rejects.toThrow(
      "no longer active",
    );
  });
});

describe("CodexAppServerManager unclaimed server requests", () => {
  it("declines approvals and user input when no Sentinel run is listening", async () => {
    const manager = createManager();
    await emitFromPeer(manager, [
      {
        id: 111,
        jsonrpc: "2.0",
        method: "item/commandExecution/requestApproval",
        params: { itemId: "cmd", startedAtMs: 1, threadId: "thr", turnId: "t" },
      },
      {
        id: 112,
        jsonrpc: "2.0",
        method: "mcpServer/elicitation/request",
        params: {
          message: "?",
          mode: "form",
          requestedSchema: { properties: {}, type: "object" },
          serverName: "docs",
          threadId: "thr",
        },
      },
      {
        id: 113,
        jsonrpc: "2.0",
        method: "item/tool/requestUserInput",
        params: { itemId: "ask", questions: [], threadId: "thr", turnId: "t" },
      },
    ]);

    const frames = await receivedFrames(manager);
    expect(findReply(frames, 111)?.result).toEqual({ decision: "decline" });
    expect(findReply(frames, 112)?.result).toEqual({ action: "decline" });
    expect(findReply(frames, 113)?.result).toEqual({ answers: {} });
    await expect(manager.respondToApproval("111", "accept")).rejects.toThrow(
      "no longer active",
    );
  });
});

describe("CodexAppServerManager notification listeners", () => {
  it("hears notifications without claiming Codex's requests", async () => {
    const manager = createManager();
    const notifications: Array<{ method: string; params: unknown }> = [];
    const unsubscribe = manager.subscribeNotifications(
      (event: { method: string; params: unknown }) =>
        notifications.push({ method: event.method, params: event.params }),
    );
    await emitFromPeer(manager, [
      {
        jsonrpc: "2.0",
        method: "account/login/completed",
        params: { error: null, loginId: "login-1", success: true },
      },
      {
        id: 131,
        jsonrpc: "2.0",
        method: "item/commandExecution/requestApproval",
        params: { itemId: "cmd", startedAtMs: 1, threadId: "thr", turnId: "t" },
      },
    ]);

    const frames = await receivedFrames(manager);
    expect(notifications).toEqual([
      {
        method: "account/login/completed",
        params: { error: null, loginId: "login-1", success: true },
      },
    ]);
    // A sign-in listening is no run: the approval is still declined.
    expect(findReply(frames, 131)?.result).toEqual({ decision: "decline" });

    unsubscribe();
    await emitFromPeer(manager, [
      { jsonrpc: "2.0", method: "account/updated", params: {} },
    ]);
    await receivedFrames(manager);
    expect(notifications).toHaveLength(1);
  });
});

describe("CodexAppServerManager declined server requests", () => {
  it("declines a pending approval or question for an unattended run", async () => {
    const manager = createManager();
    collectEvents(manager);
    await emitFromPeer(manager, [
      {
        id: 121,
        jsonrpc: "2.0",
        method: "item/commandExecution/requestApproval",
        params: { itemId: "cmd", startedAtMs: 1, threadId: "thr", turnId: "t" },
      },
      {
        id: 122,
        jsonrpc: "2.0",
        method: "item/tool/requestUserInput",
        params: { itemId: "ask", questions: [], threadId: "thr", turnId: "t" },
      },
    ]);

    expect(manager.declineServerRequest("121")).toBe(true);
    expect(manager.declineServerRequest("122")).toBe(true);
    // Answered once: a late answer or a second decline is refused.
    expect(manager.declineServerRequest("121")).toBe(false);

    const frames = await receivedFrames(manager);
    expect(findReply(frames, 121)?.result).toEqual({ decision: "decline" });
    expect(findReply(frames, 122)?.result).toEqual({ answers: {} });
    await expect(manager.respondToUserInput("122", "x")).rejects.toThrow(
      "no longer active",
    );
  });
});

describe("CodexAppServerManager client requests", () => {
  it("reverts turns by paging thread/turns/list and calling thread/revert", async () => {
    const manager = createManager({
      responses: {
        "thread/revert": {
          result: { thread: { id: "thr" }, turnsBackwardsCursor: null },
        },
        "thread/turns/list": [
          {
            result: {
              data: [{ id: "turn-5" }, { id: "turn-4" }],
              nextCursor: "cursor-1",
            },
          },
          { result: { data: [{ id: "turn-3" }], nextCursor: null } },
        ],
      },
    });

    const result = await manager.revertThreadTurns("thr", 3);

    expect(result).toMatchObject({
      beforeTurnId: "turn-3",
      reverted: true,
    });
    const frames = (await receivedFrames(manager)).filter(
      (frame) => frame.method && frame.method.startsWith("thread/"),
    );
    expect(frames.map((frame) => [frame.method, frame.params])).toEqual([
      [
        "thread/turns/list",
        {
          cursor: null,
          itemsView: "summary",
          limit: 3,
          sortDirection: "desc",
          threadId: "thr",
        },
      ],
      [
        "thread/turns/list",
        {
          cursor: "cursor-1",
          itemsView: "summary",
          limit: 1,
          sortDirection: "desc",
          threadId: "thr",
        },
      ],
      ["thread/revert", { beforeTurnId: "turn-3", threadId: "thr" }],
    ]);
  });

  it("reads the thread instead of reverting when there are no turns", async () => {
    const manager = createManager({
      responses: {
        "thread/read": { result: { thread: { id: "thr" } } },
        "thread/turns/list": {
          result: { data: [], nextCursor: null },
        },
      },
    });

    const result = await manager.revertThreadTurns("thr", 1);

    expect(result.reverted).toBe(false);
    const frames = await receivedFrames(manager);
    expect(frames.at(-1)).toMatchObject({
      method: "thread/read",
      params: { includeTurns: false, threadId: "thr" },
    });
  });

  it("pages model/list, skips hidden models and remembers the default", async () => {
    const model = (id: string, extra: Record<string, unknown> = {}) => ({
      defaultReasoningEffort: "medium",
      description: `${id} model`,
      displayName: id,
      hidden: false,
      id,
      isDefault: false,
      model: id,
      supportedReasoningEfforts: [
        { description: "", reasoningEffort: "low" },
        { description: "", reasoningEffort: "max" },
        { description: "", reasoningEffort: "medium" },
      ],
      ...extra,
    });
    const manager = createManager({
      responses: {
        "model/list": [
          {
            result: {
              data: [model("gpt-6.1-sol"), model("internal", { hidden: true })],
              nextCursor: "page-2",
            },
          },
          {
            result: {
              data: [model("gpt-6-astra", { isDefault: true })],
              nextCursor: null,
            },
          },
        ],
      },
    });

    const models = await manager.listModels();

    expect(models.map((entry: { id: string }) => entry.id)).toEqual([
      "gpt-6.1-sol",
      "gpt-6-astra",
    ]);
    expect(
      models[0].supportedReasoningEfforts.map(
        (option: { effort: string }) => option.effort,
      ),
    ).toEqual(["low", "medium"]);
    expect(manager.getDefaultModel()?.id).toBe("gpt-6-astra");
    const frames = (await receivedFrames(manager)).filter(
      (frame) => frame.method === "model/list",
    );
    expect(frames.map((frame) => frame.params)).toEqual([
      {},
      { cursor: "page-2" },
    ]);
  });

  it("uses the 0.160 shapes for steer, review, login and logout", async () => {
    const manager = createManager({
      responses: {
        "account/login/cancel": { result: { status: "canceled" } },
        "account/login/start": {
          result: {
            authUrl: "https://auth.openai.com/x",
            loginId: "login-1",
            type: "chatgpt",
          },
        },
        "account/logout": { result: {} },
        "review/start": {
          result: { reviewThreadId: "thr", turn: { id: "turn-r" } },
        },
        "turn/steer": { result: { turnId: "turn-1" } },
      },
    });

    await manager.steerTurn({
      expectedTurnId: "turn-1",
      input: [{ text: "also", text_elements: [], type: "text" }],
      threadId: "thr",
    });
    await manager.startReview("thr");
    const login = await manager.startLogin({ type: "chatgpt" });
    await manager.cancelLogin("login-1");
    await manager.logout();

    expect(login).toEqual({
      authUrl: "https://auth.openai.com/x",
      loginId: "login-1",
      type: "chatgpt",
    });
    const frames = (await receivedFrames(manager)).filter(
      (frame) =>
        frame.method &&
        frame.method !== "initialize" &&
        frame.method !== "initialized",
    );
    expect(frames).toEqual([
      expect.objectContaining({
        method: "turn/steer",
        params: {
          expectedTurnId: "turn-1",
          input: [{ text: "also", text_elements: [], type: "text" }],
          threadId: "thr",
        },
      }),
      expect.objectContaining({
        method: "review/start",
        params: { target: { type: "uncommittedChanges" }, threadId: "thr" },
      }),
      expect.objectContaining({
        method: "account/login/start",
        params: { type: "chatgpt" },
      }),
      expect.objectContaining({
        method: "account/login/cancel",
        params: { loginId: "login-1" },
      }),
      expect.not.objectContaining({ params: expect.anything() }),
    ]);
    expect(frames.at(-1)?.method).toBe("account/logout");
  });

  it("writes config with keyPath/mergeStrategy and batch edits", async () => {
    const writeResponse = {
      filePath: "/home/u/.codex/config.toml",
      status: "ok",
      version: "v2",
    };
    const manager = createManager({
      responses: {
        "config/batchWrite": { result: writeResponse },
        "config/value/write": [
          { result: writeResponse },
          { result: writeResponse },
        ],
      },
    });

    expect(await manager.writeConfigValue("model", "gpt-6-astra")).toEqual(
      writeResponse,
    );
    // A missing value clears the key (Codex treats null as "remove").
    await manager.writeConfigValue("model_reasoning_effort", undefined);
    await manager.batchWriteConfig([
      { keyPath: "features.web_search", value: true },
      {
        keyPath: "mcp_servers.docs",
        mergeStrategy: "upsert",
        value: { command: "docs-mcp" },
      },
    ]);

    const frames = (await receivedFrames(manager)).filter((frame) =>
      String(frame.method).startsWith("config/"),
    );
    expect(frames.map((frame) => frame.params)).toEqual([
      { keyPath: "model", mergeStrategy: "replace", value: "gpt-6-astra" },
      {
        keyPath: "model_reasoning_effort",
        mergeStrategy: "replace",
        value: null,
      },
      {
        edits: [
          {
            keyPath: "features.web_search",
            mergeStrategy: "replace",
            value: true,
          },
          {
            keyPath: "mcp_servers.docs",
            mergeStrategy: "upsert",
            value: { command: "docs-mcp" },
          },
        ],
      },
    ]);
  });

  it("flattens skills/list entries and writes skill config by path", async () => {
    const manager = createManager({
      responses: {
        "skills/config/write": { result: { effectiveEnabled: true } },
        "skills/list": {
          result: {
            data: [
              {
                cwd: "/tmp/project",
                errors: [],
                skills: [
                  {
                    description: "Writes docs",
                    enabled: false,
                    name: "docs",
                    path: "/home/u/.codex/skills/docs/SKILL.md",
                    scope: "user",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const { skills } = await manager.listSkills();
    await manager.writeSkillConfig(skills[0].id, true);

    expect(skills).toEqual([
      {
        description: "Writes docs",
        enabled: false,
        id: "/home/u/.codex/skills/docs/SKILL.md",
        name: "docs",
        path: "/home/u/.codex/skills/docs/SKILL.md",
        scope: "user",
      },
    ]);
    const frames = await receivedFrames(manager);
    expect(frames.at(-1)).toMatchObject({
      method: "skills/config/write",
      params: { enabled: true, path: "/home/u/.codex/skills/docs/SKILL.md" },
    });
  });
});
