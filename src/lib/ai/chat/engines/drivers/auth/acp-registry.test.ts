import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { AcpAuthMethodInfo } from "../../acp/schema";
import type { EngineAuthFlowContext } from "../../platform/auth/controller";

import type { AcpMockScenario } from "../../acp/__tests__/mock-agent";

mock.module("server-only", () => ({}));

const support = await import("../../acp/__tests__/mock-agent");
const { makeFakeInstance } = await import("../../contract/testing");
const { writeAcpRegistryProbeInfo } =
  await import("../../acp/registry/probe-info");
const { acpRegistryAuth } = await import("./acp-registry");
const { EngineAuthError } = await import("../../platform/auth/controller");

// Registry sign-in against the mock ACP agent over real stdio, with the
// methods a probe recorded.

let dir: string;

function methodsOf(logPath: string) {
  return support
    .readMockLog(logPath)
    .flatMap((entry) => ("method" in entry ? [entry.method] : []));
}

beforeEach(() => {
  dir = support.makeTempDir("registry-auth");
});

afterEach(() => {
  support.removeTempDir(dir);
});

const METHODS: AcpAuthMethodInfo[] = [
  {
    args: [],
    description: "Browser sign-in",
    env: {},
    id: "login",
    kind: "agent",
    link: null,
    name: "Mock login",
    vars: [],
  },
  {
    args: [],
    description: null,
    env: {},
    id: "key",
    kind: "env_var",
    link: "https://example.com/keys",
    name: "API key",
    vars: [
      { label: "Mock API key", name: "MOCK_API_KEY", optional: false },
      { label: null, name: "MOCK_ORG", optional: true },
    ],
  },
  {
    args: ["login", "--tty"],
    description: null,
    env: { MODE: "tty" },
    id: "tty",
    kind: "terminal",
    link: null,
    name: "Terminal login",
    vars: [],
  },
];

async function instanceWith(scenario: AcpMockScenario, canLogout = false) {
  const logPath = path.join(dir, "mock.jsonl");
  const instance = makeFakeInstance({
    config: {
      agentId: "mock-agent",
      commandArgs: [support.MOCK_AGENT_PATH],
      commandPath: process.execPath,
    },
    driver: "acp",
    env: support.mockAgentEnv(scenario, logPath),
    id: "acp-mock",
    isDefault: false,
    stateDir: path.join(dir, "state"),
  });
  await writeAcpRegistryProbeInfo(instance.stateDir, {
    agentName: "mock",
    agentVersion: "1.0.0",
    authMethods: METHODS,
    canLogout,
    checkedAt: new Date().toISOString(),
  });
  return { instance, logPath };
}

function flowContext(overrides: Partial<EngineAuthFlowContext> = {}) {
  return {
    clearInstanceSecrets: mock(async (names: readonly string[]) => [...names]),
    client: { terminal: true },
    flowId: "flow-1",
    requestCredentials: mock(async () => ({ MOCK_API_KEY: "sk-test" })),
    runBackgroundCommand: mock(async () => ({ exitCode: 0 })),
    runTerminalCommand: mock(async () => ({ exitCode: 0 })),
    saveInstanceSecrets: mock(async () => {}),
    setMessage: mock(() => {}),
    showBrowser: mock(() => {}),
    showDeviceCode: mock(() => {}),
    signal: new AbortController().signal,
    ...overrides,
  } satisfies EngineAuthFlowContext;
}

describe("acpRegistryAuth.methods", () => {
  it("offers the recorded methods, terminal ones only with an embedded terminal", async () => {
    const { instance } = await instanceWith({});
    expect(
      (await acpRegistryAuth.methods(instance, { terminal: true })).map(
        (method) => [method.id, method.type],
      ),
    ).toEqual([
      ["login", "agent"],
      ["key", "credentials"],
      ["tty", "terminal-command"],
    ]);
    expect(
      (await acpRegistryAuth.methods(instance, { terminal: false })).map(
        (method) => method.id,
      ),
    ).toEqual(["login", "key"]);
  });

  it("offers nothing before a probe recorded methods", async () => {
    const instance = makeFakeInstance({
      driver: "acp",
      stateDir: path.join(dir, "none"),
    });
    expect(await acpRegistryAuth.methods(instance, { terminal: true })).toEqual(
      [],
    );
  });
});

describe("acpRegistryAuth.login", () => {
  it("authenticates an agent method in a short-lived agent process", async () => {
    const { instance, logPath } = await instanceWith({
      auth: { acceptMethodIds: ["login"], requireAuth: true },
    });
    await acpRegistryAuth.login(instance, "login", flowContext());
    const frame = support
      .readMockLog(logPath)
      .find((entry) => "method" in entry && entry.method === "authenticate");
    expect(frame && "params" in frame ? frame.params : null).toEqual({
      methodId: "login",
    });
  });

  it("fails with a safe message when the agent refuses", async () => {
    const { instance } = await instanceWith({
      auth: { acceptMethodIds: ["other"], requireAuth: true },
    });
    await expect(
      acpRegistryAuth.login(instance, "login", flowContext()),
    ).rejects.toBeInstanceOf(EngineAuthError);
  });

  it("stores env_var credentials as instance secrets and never sends the method", async () => {
    const { instance, logPath } = await instanceWith({});
    const context = flowContext();
    await acpRegistryAuth.login(instance, "key", context);
    expect(context.requestCredentials).toHaveBeenCalledWith(
      [
        { label: "Mock API key", name: "MOCK_API_KEY", secret: true },
        { label: "MOCK_ORG", name: "MOCK_ORG", secret: true },
      ],
      { description: "https://example.com/keys" },
    );
    expect(context.saveInstanceSecrets).toHaveBeenCalledWith({
      MOCK_API_KEY: "sk-test",
    });
    expect(support.readMockLog(logPath)).toEqual([]);
  });

  it("runs a terminal method as the agent's own command with its arguments", async () => {
    const { instance } = await instanceWith({});
    const context = flowContext();
    await acpRegistryAuth.login(instance, "tty", context);
    const [command] = context.runTerminalCommand.mock.calls[0]! as unknown as [
      Record<string, unknown>,
    ];
    expect(command).toMatchObject({
      args: [support.MOCK_AGENT_PATH, "login", "--tty"],
      command: process.execPath,
      display: { args: ["login", "--tty"], command: process.execPath },
      env: { MODE: "tty" },
    });
  });

  it("refuses a method the agent no longer offers", async () => {
    const { instance } = await instanceWith({});
    await expect(
      acpRegistryAuth.login(instance, "gone", flowContext()),
    ).rejects.toThrow("no longer offered");
  });
});

describe("acpRegistryAuth.logout", () => {
  it("clears env_var secrets and sends logout when the agent supports it", async () => {
    const { instance, logPath } = await instanceWith(
      { initialize: { agentCapabilities: { auth: { logout: {} } } } },
      true,
    );
    const context = flowContext();
    await acpRegistryAuth.logout!(instance, context);
    expect(context.clearInstanceSecrets).toHaveBeenCalledWith([
      "MOCK_API_KEY",
      "MOCK_ORG",
    ]);
    expect(methodsOf(logPath)).toContain("logout");
  });
});
