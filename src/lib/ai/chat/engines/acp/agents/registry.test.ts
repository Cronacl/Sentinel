import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";

import type { AcpMockScenario } from "../__tests__/mock-agent";

mock.module("server-only", () => ({}));

const support = await import("../__tests__/mock-agent");
const stateRoot = support.makeTempDir("registry-state");
process.env.SENTINEL_STATE_PATH = path.join(stateRoot, "state.json");

const { makeFakeInstance } =
  await import("@/lib/ai/chat/engines/contract/testing");
const { acpRegistryDriver } = await import("../../drivers/acp-registry");
const { getAcpRegistryDescriptor } = await import("./registry");
const { readAcpRegistryProbeInfo } = await import("../registry/probe-info");

// The registry driver's probe against the mock ACP agent over real stdio:
// a custom command (`commandPath`) launches the mock, the instance env
// carries its scenario.

let dir: string;

function methodsOf(logPath: string) {
  return support
    .readMockLog(logPath)
    .flatMap((entry) => ("method" in entry ? [entry.method] : []));
}

beforeEach(() => {
  dir = support.makeTempDir("registry");
});

afterEach(() => {
  support.removeTempDir(dir);
});

function probeOptions(reason: "startup" | "user", previous = null) {
  return {
    depth: "full" as const,
    forceRefresh: true,
    previous,
    reason,
    signal: new AbortController().signal,
  };
}

function registryInstance(
  scenario: AcpMockScenario,
  config: Record<string, unknown> = {},
): ResolvedEngineInstance & { logPath: string } {
  const logPath = path.join(dir, "mock.jsonl");
  return Object.assign(
    makeFakeInstance({
      config: {
        agentId: "mock-agent",
        commandArgs: [support.MOCK_AGENT_PATH],
        commandPath: process.execPath,
        iconUrl:
          "https://cdn.agentclientprotocol.com/registry/v1/latest/mock-agent.svg",
        ...config,
      },
      driver: "acp",
      env: support.mockAgentEnv(scenario, logPath),
      id: `acp-${Math.random().toString(36).slice(2, 8)}`,
      isDefault: false,
      stateDir: path.join(dir, "state"),
    }),
    { logPath },
  );
}

const SCENARIO: AcpMockScenario = {
  initialize: {
    agentCapabilities: { auth: { logout: {} }, loadSession: true },
    agentInfo: { name: "mock-agent", version: "2.1.0" },
    authMethods: [
      { id: "login", name: "Mock login" },
      {
        id: "key",
        name: "API key",
        type: "env_var",
        vars: [{ name: "MOCK_API_KEY" }],
      },
    ],
  },
  session: {
    afterNew: [
      {
        availableCommands: [{ description: "Review the diff", name: "review" }],
        sessionUpdate: "available_commands_update",
      },
    ],
    configOptions: [
      {
        category: "model",
        currentValue: "fast",
        id: "model",
        name: "Model",
        options: [
          { name: "Fast", value: "fast" },
          { name: "Deep", value: "deep" },
        ],
        type: "select",
      },
    ],
  },
};

describe("acpRegistryDriver.probe", () => {
  it("opens one session on an explicit refresh: models, commands and sign-in methods", async () => {
    const instance = registryInstance(SCENARIO);
    const result = await acpRegistryDriver.probe(
      instance,
      probeOptions("user"),
    );

    expect(result.status).toBe("ready");
    expect(result.auth.status).toBe("authenticated");
    expect(result.install).toMatchObject({
      installed: true,
      path: process.execPath,
      source: "config",
      version: "2.1.0",
    });
    expect(
      result.models.map((model) => [model.id, model.isDefault ?? false]),
    ).toEqual([
      ["fast", true],
      ["deep", false],
    ]);
    expect(result.slashCommands).toEqual([
      { description: "Review the diff", name: "review", source: "native" },
    ]);
    expect(result.iconUrl).toBe(
      "https://cdn.agentclientprotocol.com/registry/v1/latest/mock-agent.svg",
    );
    const info = await readAcpRegistryProbeInfo(instance.stateDir);
    expect(info).toMatchObject({ agentName: "mock-agent", canLogout: true });
    expect(info?.authMethods.map((method) => [method.id, method.kind])).toEqual(
      [
        ["login", "agent"],
        ["key", "env_var"],
      ],
    );
    const methods = methodsOf(instance.logPath);
    expect(methods).toContain("session/new");
    expect(methods).not.toContain("authenticate");
  });

  it("reports a signed-out agent without signing in", async () => {
    const instance = registryInstance({
      ...SCENARIO,
      auth: { acceptMethodIds: ["login"], requireAuth: true },
    });
    const result = await acpRegistryDriver.probe(
      instance,
      probeOptions("user"),
    );
    expect(result.status).toBe("warning");
    expect(result.auth.status).toBe("unauthenticated");
    expect(methodsOf(instance.logPath)).not.toContain("authenticate");
  });

  it("never starts the agent for a startup probe", async () => {
    const instance = registryInstance(SCENARIO);
    const result = await acpRegistryDriver.probe(
      instance,
      probeOptions("startup"),
    );
    expect(result).toMatchObject({
      install: { installed: true, path: process.execPath },
      status: "ready",
    });
    expect(existsSync(instance.logPath)).toBe(false);
  });

  it("reports an agent that is not installed", async () => {
    const instance = registryInstance(SCENARIO, {
      agentId: "gemini",
      commandArgs: undefined,
      commandPath: undefined,
    });
    const result = await acpRegistryDriver.probe(
      instance,
      probeOptions("user"),
    );
    expect(result.status).toBe("error");
    expect(result.install.installed).toBe(false);
    expect(result.message).toContain("Install it from the ACP Registry");
  });
});

describe("registry descriptor", () => {
  it("launches an npx install's bin script under Node with the registry's arguments", async () => {
    const toolDir = path.join(stateRoot, "tools", "acp", "gemini");
    const script = path.join(dir, "gemini.js");
    await mkdir(toolDir, { recursive: true });
    await writeFile(script, "");
    await writeFile(
      path.join(toolDir, ".launch.json"),
      JSON.stringify({
        agentId: "gemini",
        args: ["--acp"],
        command: script,
        distribution: "npx",
        env: { GEMINI_CLI_IDE: "0" },
        installedAt: "2026-10-15T00:00:00.000Z",
        launcher: "node",
        name: "Gemini CLI",
        packageSpec: "@google/gemini-cli@0.63.0",
        schemaVersion: 1,
        verified: null,
        version: "0.63.0",
      }),
    );
    const instance = registryInstance(
      {},
      {
        agentId: "gemini",
        agentName: "Gemini CLI",
        commandArgs: undefined,
        commandPath: undefined,
      },
    );
    const descriptor = getAcpRegistryDescriptor(instance);
    const { binary } = await descriptor.resolveBinary(instance);

    expect(descriptor).toMatchObject({ clientFs: false, label: "Gemini CLI" });
    expect(binary).toMatchObject({
      path: script,
      source: "managed-install",
      version: "0.63.0",
    });
    expect(binary?.launch?.args).toEqual([script, "--acp"]);
    expect(binary?.launch?.env).toMatchObject({ GEMINI_CLI_IDE: "0" });
    expect(path.basename(binary!.launch!.command)).toMatch(/^(node|bun)/);
  });

  it("picks the configured sign-in method, else the first agent method", () => {
    const methods = [
      {
        args: [],
        description: null,
        env: {},
        id: "key",
        kind: "env_var" as const,
        link: null,
        name: "Key",
        vars: [],
      },
      {
        args: [],
        description: null,
        env: {},
        id: "oauth",
        kind: "agent" as const,
        link: null,
        name: "OAuth",
        vars: [],
      },
    ];
    expect(
      getAcpRegistryDescriptor(registryInstance({})).auth.methodId(methods),
    ).toBe("oauth");
    expect(
      getAcpRegistryDescriptor(
        registryInstance({}, { authMethodId: "key" }),
      ).auth.methodId(methods),
    ).toBe("key");
  });
});

describe("acpRegistryDriver managed install", () => {
  it("refuses a release other than the one the user confirmed", async () => {
    const { getAcpRegistryCachePath } = await import("../registry/catalog");
    const { registryIndex } = await import("../registry/__tests__/fixtures");
    const file = getAcpRegistryCachePath(stateRoot);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        etag: null,
        fetchedAt: new Date().toISOString(),
        index: registryIndex(),
      }),
    );
    const instance = registryInstance(
      {},
      { agentId: "gemini", agentVersion: "0.62.0", commandPath: undefined },
    );
    await expect(
      acpRegistryDriver.maintenance!.managedInstall!.run({
        instance,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("not the 0.62.0 you confirmed");
  });
});
