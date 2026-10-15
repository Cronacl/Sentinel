// @ts-nocheck
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

// api.engines.acpRegistry over a cached index in a temporary state root;
// the instance registry, maintenance service and snapshots are fakes.

mock.module("server-only", () => ({}));
mock.module("@/server/api/trpc", () => {
  const procedure = (inputSchema?: any) => ({
    mutation: (handler: any) => Object.assign(handler, { inputSchema }),
    query: (handler: any) => Object.assign(handler, { inputSchema }),
  });
  return {
    createTRPCRouter: (routes: Record<string, any>) => routes,
    protectedProcedure: {
      input: (inputSchema: any) => procedure(inputSchema),
      ...procedure(),
    },
  };
});

const root = await mkdtemp(path.join(os.tmpdir(), "sentinel-acp-router-"));
process.env.SENTINEL_STATE_PATH = path.join(root, "state.json");

let summaries: any[] = [];
const registry = {
  create: mock(async (_user: string, input: any) => {
    const summary = {
      config: input.config,
      driver: "acp",
      id: "acp-gemini-cli",
      label: input.label,
    };
    summaries.push(summary);
    return summary;
  }),
  listSummaries: mock(async () => summaries),
  update: mock(async (_user: string, id: string, patch: any) => {
    const summary = summaries.find((entry) => entry.id === id);
    summary.config = patch.config;
    return summary;
  }),
};
mock.module("@/lib/ai/chat/engines/platform/instances", () => ({
  getEngineInstanceRegistry: () => registry,
}));
const maintenance = {
  install: mock(async (_user: string, instanceId: string) => ({
    instanceId,
    running: true,
  })),
  status: mock(async (_user: string, instanceId: string) => ({
    instanceId,
    running: false,
  })),
};
mock.module("@/lib/ai/chat/engines/platform/maintenance/service", () => ({
  EngineMaintenanceError: class extends Error {},
  getEngineMaintenanceService: () => maintenance,
}));
const refresh = mock(async () => null);
mock.module("@/lib/ai/chat/engines/platform/snapshot-service", () => ({
  getEngineSnapshotService: () => ({ refresh }),
}));

const { engineAcpRegistryRouter: router } = await import("./acp-registry");
const { getAcpRegistryCachePath } =
  await import("@/lib/ai/chat/engines/acp/registry/catalog");
const { registryIndex } =
  await import("@/lib/ai/chat/engines/acp/registry/__tests__/fixtures");
const { getAcpRegistryToolDirectory, readAcpRegistryLaunch } =
  await import("@/lib/ai/chat/engines/acp/registry/install");

const ctx = { session: { user: { id: "user-1" } } };

beforeEach(async () => {
  summaries = [];
  registry.create.mockClear();
  maintenance.install.mockClear();
  const file = getAcpRegistryCachePath(root);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({
      etag: null,
      fetchedAt: new Date().toISOString(),
      index: registryIndex(),
    }),
  );
});

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("acpRegistry.list and search", () => {
  it("lists a fresh cache without fetching, Gemini first", async () => {
    const view = await router.list({ ctx, input: {} });
    expect(view.fetchError).toBeNull();
    expect(view.agents.map((agent) => agent.id)).toEqual([
      "gemini",
      "devin",
      "fast-agent",
      "mistral-vibe",
    ]);
    expect(view.agents[0]).toMatchObject({
      featured: true,
      iconUrl:
        "https://cdn.agentclientprotocol.com/registry/v1/latest/gemini.svg",
      nativeEngine: null,
    });
    expect(view.agents[1].iconUrl).toBeNull();
  });

  it("filters by name, id and description", async () => {
    const view = await router.search({ ctx, input: { query: "software" } });
    expect(view.agents.map((agent) => agent.id)).toEqual(["devin"]);
  });
});

describe("acpRegistry.install", () => {
  it("adds an instance for the agent and runs the managed install", async () => {
    const result = await router.install({
      ctx,
      input: { agentId: "gemini", distribution: "auto" },
    });
    expect(registry.create).toHaveBeenCalledWith("user-1", {
      config: {
        agentId: "gemini",
        agentName: "Gemini CLI",
        agentVersion: "0.63.0",
        distribution: "auto",
        iconUrl:
          "https://cdn.agentclientprotocol.com/registry/v1/latest/gemini.svg",
      },
      driver: "acp",
      label: "Gemini CLI",
    });
    expect(maintenance.install).toHaveBeenCalledWith(
      "user-1",
      "acp-gemini-cli",
      {
        expectedCommand: null,
        optionId: "managed",
      },
    );
    expect(result.instanceId).toBe("acp-gemini-cli");

    // A second install reuses the instance, with the distribution chosen.
    await router.install({
      ctx,
      input: { agentId: "gemini", distribution: "npx" },
    });
    expect(registry.create).toHaveBeenCalledTimes(1);
    expect(summaries[0].config.distribution).toBe("npx");
  });

  it("keeps the installed older release when the update cannot start", async () => {
    const dir = getAcpRegistryToolDirectory("gemini");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, ".launch.json"),
      JSON.stringify({
        agentId: "gemini",
        args: ["--acp"],
        command: path.join(root, "gemini.js"),
        distribution: "npx",
        env: {},
        installedAt: new Date().toISOString(),
        launcher: "node",
        name: "Gemini CLI",
        packageSpec: "@google/gemini-cli@0.62.0",
        schemaVersion: 1,
        verified: null,
        version: "0.62.0",
      }),
    );
    maintenance.install.mockImplementationOnce(async () => {
      throw new Error("busy");
    });
    await expect(
      router.install({
        ctx,
        input: { agentId: "gemini", distribution: "auto" },
      }),
    ).rejects.toThrow("busy");
    expect((await readAcpRegistryLaunch("gemini"))?.version).toBe("0.62.0");
    await rm(dir, { force: true, recursive: true });
  });

  it("refuses an agent the registry does not list", async () => {
    await expect(
      router.install({ ctx, input: { agentId: "nope", distribution: "auto" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
