import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Database as SQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/server/db/schema";

mock.module("server-only", () => ({}));

// @ts-expect-error Bun test-only cache-busting import of the real module.
const { ensureTables } = await import("@/server/db/index.ts?dispatch-actual");

const { DRIVER_CATALOG } = await import("@/lib/ai/chat/engines/catalog");
const { createEngineInstanceRegistry } =
  await import("@/lib/ai/chat/engines/platform/instances");
const { EngineInstanceUnavailableError, EngineTriggerUnsupportedError } =
  await import("@/lib/ai/chat/engines/platform/errors");
const { createThreadChatErrorResponse } = await import("../../errors");
const { createEngineDispatcher, resolveThreadEngine } =
  await import("./engine-dispatcher");

import type {
  EngineDriver,
  EngineThreadRunInput,
  EngineThreadStopInput,
} from "@/lib/ai/chat/engines/platform/driver";
import type { ThreadChatRequest } from "../../types";

const USER_ID = "user-1";

function request(overrides: Partial<ThreadChatRequest> = {}) {
  return {
    threadId: "thread-1",
    trigger: "submit-user-message",
    userId: USER_ID,
    workspaceId: "workspace-1",
    ...overrides,
  } satisfies ThreadChatRequest;
}

function fakeDriver(kind: "claude" | "codex" | "sentinel") {
  const runs: EngineThreadRunInput[] = [];
  const stops: EngineThreadStopInput[] = [];
  const meta = DRIVER_CATALOG[kind];
  const driver: EngineDriver = {
    capabilities: meta.capabilities,
    kind,
    meta,
    probe: async () => {
      throw new Error("not probed in dispatcher tests");
    },
    probeTimeoutMs: 1_000,
    ...(meta.runtime === "external"
      ? {
          thread: {
            run: async (input) => {
              runs.push(input);
              return new Response(null, { status: 202 });
            },
            stop: async (input) => {
              stops.push(input);
              return new Response(null, { status: 204 });
            },
            triggers: ["submit-user-message", "submit-tool-approval"],
          },
        }
      : {}),
  };
  return { driver, runs, stops };
}

let sqlite: SQLiteDatabase;
let registry: ReturnType<typeof createEngineInstanceRegistry>;
let resolveCalls: number;

function createDispatcher(drivers: EngineDriver[]) {
  return createEngineDispatcher({
    drivers: (kind) => drivers.find((driver) => driver.kind === kind) ?? null,
    resolveInstance: async (userId, target) => {
      resolveCalls += 1;
      return await registry.resolve(userId, target);
    },
  });
}

beforeEach(() => {
  sqlite = new SQLiteDatabase(":memory:");
  ensureTables(drizzle(sqlite, { schema }) as never, sqlite as never);
  registry = createEngineInstanceRegistry({
    db: drizzle(sqlite, { schema }) as never,
    decrypt: (value) => value,
    encrypt: (value) => value,
    env: () => ({ HOME: "/Users/me", PATH: "/usr/bin" }),
    platform: "darwin",
    runtimePaths: { remove: async () => {} },
    stateRoot: () => "/Users/me/.sentinel",
  });
  resolveCalls = 0;
});

describe("resolveThreadEngine", () => {
  it("keeps an existing thread on its own engine and instance", () => {
    expect(
      resolveThreadEngine(
        { engine: "codex", engineInstanceId: "codex-other" },
        { chatEngine: "claude", chatEngineInstanceId: "claude-work" },
      ),
    ).toEqual({ driver: "claude", instanceId: "claude-work" });
  });

  it("treats a NULL (or driver-named) instance as the default instance", () => {
    expect(
      resolveThreadEngine(
        {},
        { chatEngine: "claude", chatEngineInstanceId: null },
      ),
    ).toEqual({ driver: "claude", instanceId: null });
    expect(
      resolveThreadEngine(
        {},
        { chatEngine: "claude", chatEngineInstanceId: "claude" },
      ),
    ).toEqual({ driver: "claude", instanceId: null });
  });

  it("binds a new thread to the request's engine and instance, else Sentinel", () => {
    expect(
      resolveThreadEngine(
        { engine: "codex", engineInstanceId: "codex-work" },
        null,
      ),
    ).toEqual({ driver: "codex", instanceId: "codex-work" });
    expect(resolveThreadEngine({}, null)).toEqual({
      driver: "sentinel",
      instanceId: null,
    });
  });
});

describe("engine dispatcher", () => {
  it("leaves built-in runs to the orchestrator without resolving an instance", async () => {
    const sentinel = fakeDriver("sentinel");
    const dispatcher = createDispatcher([sentinel.driver]);

    await expect(
      dispatcher.run(
        { driver: "sentinel", instanceId: null },
        request({ trigger: "retry-assistant-message" }),
        null,
      ),
    ).resolves.toBeNull();
    expect(resolveCalls).toBe(0);
  });

  it("runs a NULL-instance thread on the driver's default instance", async () => {
    const claude = fakeDriver("claude");
    const dispatcher = createDispatcher([claude.driver]);

    const response = await dispatcher.run(
      { driver: "claude", instanceId: null },
      request(),
      null,
    );

    expect(response?.status).toBe(202);
    expect(claude.runs).toHaveLength(1);
    expect(claude.runs[0]!.instance.id).toBe("claude");
    expect(claude.runs[0]!.instance.isDefault).toBe(true);
  });

  it("runs on a configured instance of the thread's driver", async () => {
    await registry.create(USER_ID, {
      driver: "codex",
      id: "codex-work",
      label: "Work",
    });
    const codex = fakeDriver("codex");
    const dispatcher = createDispatcher([codex.driver]);

    await dispatcher.run(
      { driver: "codex", instanceId: "codex-work" },
      request(),
      null,
    );

    expect(codex.runs[0]!.instance.id).toBe("codex-work");
    expect(codex.runs[0]!.instance.isDefault).toBe(false);
  });

  it("answers a removed instance with a typed 409 instead of another engine", async () => {
    const claude = fakeDriver("claude");
    const sentinel = fakeDriver("sentinel");
    const dispatcher = createDispatcher([claude.driver, sentinel.driver]);

    const error = await dispatcher
      .run({ driver: "claude", instanceId: "claude-gone" }, request(), null)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EngineInstanceUnavailableError);
    expect(
      (error as InstanceType<typeof EngineInstanceUnavailableError>).reason,
    ).toBe("missing");
    expect(claude.runs).toHaveLength(0);
    const response = createThreadChatErrorResponse(error);
    expect(response.status).toBe(409);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code,
    ).toBe("engine_unavailable");
  });

  it("answers a disabled instance with engine_unavailable", async () => {
    await registry.create(USER_ID, {
      driver: "claude",
      enabled: false,
      id: "claude-off",
    });
    const claude = fakeDriver("claude");
    const dispatcher = createDispatcher([claude.driver]);

    await expect(
      dispatcher.run(
        { driver: "claude", instanceId: "claude-off" },
        request(),
        null,
      ),
    ).rejects.toMatchObject({ code: "engine_unavailable", reason: "disabled" });
    expect(claude.runs).toHaveLength(0);
  });

  it("rejects unknown, planned and default-less drivers rather than falling back", async () => {
    const sentinel = fakeDriver("sentinel");
    const dispatcher = createDispatcher([sentinel.driver]);

    await expect(
      dispatcher.run({ driver: "gemini", instanceId: null }, request(), null),
    ).rejects.toMatchObject({ reason: "driver-unknown" });
    await expect(
      dispatcher.run({ driver: "grok", instanceId: null }, request(), null),
    ).rejects.toMatchObject({ reason: "driver-planned" });
  });

  it("rejects instances of another driver", async () => {
    await registry.create(USER_ID, { driver: "codex", id: "codex-work" });
    const claude = fakeDriver("claude");
    const dispatcher = createDispatcher([claude.driver]);

    await expect(
      dispatcher.run(
        { driver: "claude", instanceId: "codex-work" },
        request(),
        null,
      ),
    ).rejects.toMatchObject({ reason: "driver-mismatch" });
  });

  it("rejects triggers the runtime does not handle before resolving", async () => {
    const claude = fakeDriver("claude");
    const dispatcher = createDispatcher([claude.driver]);

    await expect(
      dispatcher.run(
        { driver: "claude", instanceId: null },
        request({ trigger: "regenerate-assistant-message" }),
        null,
      ),
    ).rejects.toBeInstanceOf(EngineTriggerUnsupportedError);
    expect(resolveCalls).toBe(0);
  });

  it("still stops a run whose instance can no longer be resolved", async () => {
    const claude = fakeDriver("claude");
    const dispatcher = createDispatcher([claude.driver]);

    const response = await dispatcher.stop(
      { driver: "claude", instanceId: "claude-gone" },
      request({ trigger: "stop-stream" }),
      null,
    );

    expect(response?.status).toBe(204);
    expect(claude.stops).toHaveLength(1);
    expect(claude.stops[0]!.instance).toBeNull();
  });

  it("leaves stopping built-in and unknown engines to the generic stop", async () => {
    const sentinel = fakeDriver("sentinel");
    const dispatcher = createDispatcher([sentinel.driver]);

    await expect(
      dispatcher.stop(
        { driver: "sentinel", instanceId: null },
        request({ trigger: "stop-stream" }),
        null,
      ),
    ).resolves.toBeNull();
    await expect(
      dispatcher.stop(
        { driver: "gemini", instanceId: null },
        request({ trigger: "stop-stream" }),
        null,
      ),
    ).resolves.toBeNull();
  });
});
