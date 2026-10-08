import { afterAll, describe, expect, it, mock } from "bun:test";

import type { ProbeOptions } from "@/lib/ai/chat/engines/platform/driver";

// The ACP probe against the mock agent: cheap probes never spawn, full
// probes initialize without a session and never authenticate, and an
// aborted probe kills the agent.
mock.module("server-only", () => ({}));

const { RequestError } = await import("@agentclientprotocol/sdk");
const { probeAcpAgent } = await import("./probe");
const { readAcpCatalog, updateAcpCatalog } = await import("./catalog-cache");
const support = await import("./__tests__/mock-agent");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) support.removeTempDir(dir);
});

function setup(scenario: Parameters<typeof support.mockInstance>[0] = {}) {
  const dir = support.makeTempDir("probe");
  dirs.push(dir);
  return support.mockInstance(scenario, dir);
}

function options(overrides: Partial<ProbeOptions> = {}): ProbeOptions {
  return {
    depth: "full",
    forceRefresh: true,
    reason: "user",
    signal: new AbortController().signal,
    ...overrides,
  };
}

function requests(logPath: string) {
  return support
    .readMockLog(logPath)
    .flatMap((entry) => (entry.kind === "request" ? [entry.method] : []));
}

describe("probeAcpAgent", () => {
  it("initializes without a session and lists the descriptor's models", async () => {
    const instance = setup({
      auth: { requireAuth: true },
      initialize: {
        authMethods: [{ id: "cursor_login", name: "Cursor Login" }],
      },
    });
    const result = await probeAcpAgent(
      support.mockDescriptor({
        probe: {
          listModels: async () => [
            { effortOption: null, id: "fast", name: "Fast" },
            { id: "smart", isDefault: true, name: "Smart" },
          ],
          timeoutMs: 5_000,
        },
      }),
      instance,
      options(),
    );

    expect(result.status).toBe("ready");
    expect(result.auth).toEqual(
      expect.objectContaining({
        method: "Cursor Login",
        status: "authenticated",
      }),
    );
    expect(result.models.map((model) => model.id)).toEqual(["fast", "smart"]);
    expect(result.defaultModelId).toBe("smart");
    expect(result.capabilityOverrides).toEqual(
      expect.objectContaining({
        supportsImages: true,
        supportsResume: "native",
      }),
    );
    // Never authenticate, never open a session.
    expect(requests(instance.logPath)).toEqual(["initialize"]);
    expect((await readAcpCatalog(instance.stateDir))?.models).toHaveLength(2);
  });

  it("reports a signed-out agent from its model list", async () => {
    const instance = setup();
    const result = await probeAcpAgent(
      support.mockDescriptor({
        auth: {
          loginHint: () => "run `agent login`",
          methodId: () => null,
          strategy: "lazy",
        },
        probe: {
          listModels: async () => {
            throw RequestError.authRequired();
          },
          timeoutMs: 5_000,
        },
      }),
      instance,
      options(),
    );
    expect(result.status).toBe("warning");
    expect(result.auth.status).toBe("unauthenticated");
    expect(result.message).toBe("Mock is signed out. run `agent login`");
  });

  it("answers a cheap probe from the last full result without spawning, with learned commands", async () => {
    const instance = setup();
    await updateAcpCatalog(instance.stateDir, {
      commands: [{ description: "Review", inputHint: null, name: "review" }],
    });
    const previous = await probeAcpAgent(
      support.mockDescriptor(),
      instance,
      options(),
    );
    const before = requests(instance.logPath).length;

    const cheap = await probeAcpAgent(support.mockDescriptor(), instance, {
      ...options({ depth: "cheap" }),
      previous,
    });
    expect(requests(instance.logPath).length).toBe(before);
    expect(cheap.install).toEqual(previous.install);
    expect(cheap.slashCommands).toEqual([
      { description: "Review", name: "review", source: "native" },
    ]);
  });

  it("reports a missing binary without spawning anything", async () => {
    const instance = setup();
    const result = await probeAcpAgent(
      support.mockDescriptor({
        resolveBinary: async () => ({
          binary: null,
          error: "Mock agent was not found in PATH.",
        }),
      }),
      instance,
      options(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        install: { installed: false, path: null, source: null, version: null },
        message: "Mock agent was not found in PATH.",
        status: "error",
      }),
    );
  });

  it("kills the agent when the platform aborts the probe", async () => {
    const instance = setup({ faults: { hangMethods: ["initialize"] } });
    const controller = new AbortController();
    const pending = probeAcpAgent(
      support.mockDescriptor({ probe: { timeoutMs: 30_000 } }),
      instance,
      options({ signal: controller.signal }),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    controller.abort();
    const result = await pending;
    expect(result.status).toBe("error");
    expect(result.stale).toBe(true);
    const lifecycle = support
      .readMockLog(instance.logPath)
      .filter((entry) => entry.kind === "lifecycle");
    expect(lifecycle.length).toBeGreaterThan(0);
  });
});
