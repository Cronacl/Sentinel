// Drives mock-agent.ts as a child process through the real SDK client()
// builder over byte-level ndJsonStream (never the in-memory app pair, which
// would bypass the framing these fixtures exist to exercise).
import { fileURLToPath } from "node:url";
import path from "node:path";

import * as acp from "@agentclientprotocol/sdk";

import { readJsonl, type JsonObject } from "../shared/fixture-io";
import {
  makeTempDir,
  nodeReadableToWeb,
  nodeWritableToWeb,
  removeTempDir,
  spawnFixture,
  type FixtureProcess,
} from "../shared/test-support";
import {
  ACP_MOCK_LOG_ENV,
  ACP_MOCK_SCENARIO_ENV,
  type AcpMockLogEntry,
  type AcpMockScenario,
} from "./scenario";

export const MOCK_AGENT_PATH = fileURLToPath(
  new URL("./mock-agent.ts", import.meta.url),
);

type Handler<P, R> = (params: P) => R | Promise<R>;

export type AcpClientHandlers = {
  requestPermission?: Handler<
    acp.RequestPermissionRequest,
    acp.RequestPermissionResponse
  >;
  readTextFile?: Handler<acp.ReadTextFileRequest, acp.ReadTextFileResponse>;
  writeTextFile?: Handler<acp.WriteTextFileRequest, acp.WriteTextFileResponse>;
  createTerminal?: Handler<
    acp.CreateTerminalRequest,
    acp.CreateTerminalResponse
  >;
  terminalOutput?: Handler<
    acp.TerminalOutputRequest,
    acp.TerminalOutputResponse
  >;
  waitForTerminalExit?: Handler<
    acp.WaitForTerminalExitRequest,
    acp.WaitForTerminalExitResponse
  >;
  killTerminal?: Handler<acp.KillTerminalRequest, acp.KillTerminalResponse>;
  releaseTerminal?: Handler<
    acp.ReleaseTerminalRequest,
    acp.ReleaseTerminalResponse
  >;
  createElicitation?: Handler<
    acp.CreateElicitationRequest,
    acp.CreateElicitationResponse
  >;
  /** Extension requests the client answers; others get `methodNotFound`. */
  extRequests?: Record<string, Handler<JsonObject, unknown>>;
  /** Extension notifications the client records. */
  extNotifications?: string[];
};

export type ClientCall = { method: string; params: unknown };

export type AcpHarness = {
  fixture: FixtureProcess;
  connection: acp.ClientConnection;
  agent: acp.ClientContext;
  /** Every `session/update` the SDK delivered to the client handler. */
  updates: acp.SessionNotification[];
  /** Every agent→client request and notification the client handled. */
  calls: ClientCall[];
  logPath: string;
  log(): AcpMockLogEntry[];
  initialize(
    params?: Partial<acp.InitializeRequest>,
  ): Promise<acp.InitializeResponse>;
  newSession(cwd?: string): Promise<acp.NewSessionResponse>;
  prompt(
    sessionId: string,
    text: string,
    meta?: JsonObject,
  ): Promise<acp.PromptResponse>;
  /**
   * Lets queued handlers run. The SDK resolves a request as soon as its
   * response is read, while notifications that preceded it on the wire still
   * pass through async handler chains, so `session/update` and extension
   * notification handlers can run after `prompt()` resolved.
   */
  settle(): Promise<void>;
  dispose(): Promise<void>;
};

const passthrough = (params: unknown): JsonObject =>
  params !== null && typeof params === "object" && !Array.isArray(params)
    ? (params as JsonObject)
    : {};

function missing(method: string): never {
  throw acp.RequestError.methodNotFound(method);
}

export function startAcpHarness(
  scenario: AcpMockScenario,
  handlers: AcpClientHandlers = {},
  options: {
    env?: Record<string, string>;
    stdoutTap?: (chunk: string) => void;
  } = {},
): AcpHarness {
  const dir = makeTempDir("acp");
  const logPath = path.join(dir, "mock.jsonl");
  const fixture = spawnFixture(MOCK_AGENT_PATH, {
    env: {
      [ACP_MOCK_SCENARIO_ENV]: JSON.stringify(scenario),
      [ACP_MOCK_LOG_ENV]: logPath,
      ...options.env,
    },
  });
  const updates: acp.SessionNotification[] = [];
  const calls: ClientCall[] = [];
  const record = <P, R>(method: string, handler: Handler<P, R> | undefined) => {
    return async ({ params }: { params: P }): Promise<R> => {
      calls.push({ method, params });
      if (!handler) return missing(method);
      return handler(params);
    };
  };

  let app = acp
    .client({ name: "sentinel-fixture-test" })
    .onNotification("session/update", ({ params }) => {
      updates.push(params);
    })
    .onRequest(
      "session/request_permission",
      record("session/request_permission", handlers.requestPermission),
    )
    .onRequest(
      "fs/read_text_file",
      record("fs/read_text_file", handlers.readTextFile),
    )
    .onRequest(
      "fs/write_text_file",
      record("fs/write_text_file", handlers.writeTextFile),
    )
    .onRequest(
      "terminal/create",
      record("terminal/create", handlers.createTerminal),
    )
    .onRequest(
      "terminal/output",
      record("terminal/output", handlers.terminalOutput),
    )
    .onRequest(
      "terminal/wait_for_exit",
      record("terminal/wait_for_exit", handlers.waitForTerminalExit),
    )
    .onRequest("terminal/kill", record("terminal/kill", handlers.killTerminal))
    .onRequest(
      "terminal/release",
      record("terminal/release", handlers.releaseTerminal),
    )
    .onRequest(
      "elicitation/create",
      record("elicitation/create", handlers.createElicitation),
    )
    .onNotification("elicitation/complete", ({ params }) => {
      calls.push({ method: "elicitation/complete", params });
    });
  for (const [method, handler] of Object.entries(handlers.extRequests ?? {})) {
    app = app.onRequest(method, passthrough, record(method, handler));
  }
  for (const method of handlers.extNotifications ?? []) {
    app = app.onNotification(method, passthrough, ({ params }) => {
      calls.push({ method, params });
    });
  }

  if (options.stdoutTap) {
    const tap = options.stdoutTap;
    fixture.child.stdout.on("data", (chunk: Buffer) =>
      tap(chunk.toString("utf8")),
    );
  }
  const connection = app.connect(
    acp.ndJsonStream(
      nodeWritableToWeb(fixture.child.stdin),
      nodeReadableToWeb(fixture.child.stdout),
    ),
  );
  const agent = connection.agent;

  return {
    fixture,
    connection,
    agent,
    updates,
    calls,
    logPath,
    log: () => readJsonl<AcpMockLogEntry>(logPath),
    initialize: (params = {}) =>
      agent.request("initialize", {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
        clientInfo: { name: "sentinel-fixture-test", version: "0.0.0" },
        ...params,
      }),
    newSession: (cwd = dir) =>
      agent.request("session/new", { cwd, mcpServers: [] }),
    prompt: (sessionId, text, meta) =>
      agent.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text }],
        ...(meta ? { _meta: meta } : {}),
      }),
    settle: () => new Promise((resolve) => setTimeout(resolve, 20)),
    dispose: async () => {
      connection.close();
      await fixture.kill();
      removeTempDir(dir);
    },
  };
}
