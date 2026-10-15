import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// The per-instance `opencode serve` pool against the fake server spawned as
// the `opencode` binary (real process, HTTP readiness and Basic auth).

mock.module("server-only", () => ({}));

const tempRoot = await mkdtemp(
  path.join(os.tmpdir(), "sentinel-opencode-pool-"),
);
const originalStatePath = process.env.SENTINEL_STATE_PATH;
process.env.SENTINEL_STATE_PATH = path.join(tempRoot, "state", "state.json");

const {
  acquireOpenCodeServer,
  disposeAllOpenCodeServers,
  getOpenCodeServerPool,
  peekOpenCodeServer,
} = await import("./server-pool");
const { disposeInstanceResources } =
  await import("@/lib/ai/chat/engines/platform/instance-resources");
const { getInstanceProcessEnv, getInstanceRuntimeKey } =
  await import("@/lib/ai/chat/engines/platform/runtime/resolve-binary");
const { createFakeOpenCode, waitUntil } =
  await import("./__tests__/fake-opencode");

afterEach(async () => {
  await disposeAllOpenCodeServers();
});

afterAll(async () => {
  if (originalStatePath === undefined) delete process.env.SENTINEL_STATE_PATH;
  else process.env.SENTINEL_STATE_PATH = originalStatePath;
  await rm(tempRoot, { force: true, recursive: true });
});

async function launchFor(generation: 1 | 2, version: string | null) {
  const fake = await createFakeOpenCode({ generation });
  return {
    fake,
    launch: {
      binaryPath: (fake.instance.config as { binaryPath: string }).binaryPath,
      env: getInstanceProcessEnv(fake.instance),
      instanceId: fake.instance.id,
      runtimeKey: getInstanceRuntimeKey(fake.instance),
      version,
    },
  };
}

describe("acquireOpenCodeServer", () => {
  it("starts one server per instance and reuses it across turns", async () => {
    const { launch } = await launchFor(1, "1.18.32");
    const first = await acquireOpenCodeServer(launch);
    first.release();
    const second = await acquireOpenCodeServer(launch);
    expect(second.server).toBe(first.server);
    expect(second.server.generation).toBe("v1");
    expect(peekOpenCodeServer(launch)).toBe(second.server);
    second.release();
  });

  it("confirms the generation over HTTP even when --version was unknown", async () => {
    const { launch } = await launchFor(2, null);
    const lease = await acquireOpenCodeServer(launch);
    expect(lease.server.generation).toBe("v2");
    expect(lease.server.version).toBe("2.0.18");
    // The generated password is the only one the server accepts.
    const response = await fetch(new URL("/api/info", lease.server.url), {
      headers: { authorization: lease.server.authorization },
    });
    expect(response.status).toBe(200);
    const denied = await fetch(new URL("/api/info", lease.server.url));
    expect(denied.status).toBe(401);
    lease.release();
  });

  it("replaces the server when the configuration changes", async () => {
    const { launch } = await launchFor(1, "1.18.32");
    const first = await acquireOpenCodeServer(launch);
    first.release();
    const second = await acquireOpenCodeServer({
      ...launch,
      runtimeKey: `${launch.runtimeKey}:changed`,
    });
    expect(second.server).not.toBe(first.server);
    await waitUntil(() => first.server.hasExited(), "old server exit");
    second.release();
  });

  it("drops a crashed server and starts a new one", async () => {
    const { launch } = await launchFor(1, "1.18.32");
    const first = await acquireOpenCodeServer(launch);
    first.release();
    first.server.close();
    await first.server.exited;
    await waitUntil(
      () => getOpenCodeServerPool().peek(launch.instanceId) === null,
      "pool drop",
    );
    const second = await acquireOpenCodeServer(launch);
    expect(second.server).not.toBe(first.server);
    expect(second.server.hasExited()).toBe(false);
    second.release();
  });

  it("ends an instance's server when the instance goes away", async () => {
    const { launch } = await launchFor(2, "opencode v2.0.18");
    const lease = await acquireOpenCodeServer(launch);
    lease.release();
    await disposeInstanceResources(launch.instanceId);
    await lease.server.exited;
    expect(peekOpenCodeServer(launch)).toBeNull();
  });
});
