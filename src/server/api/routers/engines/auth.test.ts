// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

// api.engines.auth resolves the caller's own instance, picks the driver's
// auth controller and hands flows to the flow store; all three are faked.

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

const claudeInstance = { driver: "claude", id: "claude", label: "Claude" };
const registry = {
  get: mock(async (userId: string, instanceId: string) => {
    if (userId !== "user-1") {
      return null;
    }
    if (instanceId === "claude") {
      return { instance: claudeInstance, status: "available" };
    }
    if (instanceId === "sentinel") {
      return {
        instance: { driver: "sentinel", id: "sentinel" },
        status: "available",
      };
    }
    if (instanceId === "grok") {
      return {
        instance: {
          message: "Grok is not available yet.",
          reason: "driver-planned",
        },
        status: "unavailable",
      };
    }
    return null;
  }),
};
mock.module("@/lib/ai/chat/engines/platform/instances", () => ({
  getEngineInstanceRegistry: () => registry,
}));

const claudeAuth = {
  login: mock(async () => {}),
  logout: mock(async () => {}),
  methods: mock(async () => [
    { id: "claude-login", label: "Sign in", type: "terminal-command" },
  ]),
};
mock.module("@/lib/ai/chat/engines/platform/drivers", () => ({
  getEngineDriver: (kind: string) =>
    kind === "claude" ? { auth: claudeAuth, kind } : { kind },
}));

const { EngineAuthFlowError } =
  await import("@/lib/ai/chat/engines/platform/auth/controller");
const flowStore = {
  cancel: mock(async (input: any) => ({ phase: "cancelled", ...input })),
  get: mock((_userId: string, instanceId: string) => ({
    instanceId,
    phase: "idle",
  })),
  respond: mock(async () => {
    throw new EngineAuthFlowError("conflict", "Not waiting.");
  }),
  start: mock(async (input: any) => ({
    instanceId: input.instance.id,
    phase: "waiting",
  })),
};
mock.module("@/lib/ai/chat/engines/platform/auth/flow-store", () => ({
  getEngineAuthFlowStore: () => flowStore,
}));

const { engineAuthRouter } = await import("./auth");

const ctx = { session: { user: { id: "user-1" } } };

beforeEach(() => {
  for (const fn of [
    ...Object.values(flowStore),
    ...Object.values(claudeAuth),
  ]) {
    fn.mockClear();
  }
});

describe("api.engines.auth", () => {
  it("lists a driver's methods for the client it runs in", async () => {
    await expect(
      engineAuthRouter.methods({
        ctx,
        input: { instanceId: "claude", terminal: true },
      }),
    ).resolves.toEqual({
      canLogout: true,
      methods: [
        { id: "claude-login", label: "Sign in", type: "terminal-command" },
      ],
      supported: true,
    });
    expect(claudeAuth.methods).toHaveBeenCalledWith(claudeInstance, {
      terminal: true,
    });

    await expect(
      engineAuthRouter.methods({ ctx, input: { instanceId: "sentinel" } }),
    ).resolves.toEqual({ canLogout: false, methods: [], supported: false });
  });

  it("starts sign-in and sign-out flows on the caller's instance", async () => {
    await engineAuthRouter.start({
      ctx,
      input: { instanceId: "claude", methodId: "claude-login" },
    });
    expect(flowStore.start).toHaveBeenCalledWith({
      client: { terminal: false },
      controller: claudeAuth,
      instance: claudeInstance,
      methodId: "claude-login",
      purpose: "login",
      userId: "user-1",
    });

    await engineAuthRouter.logout({
      ctx,
      input: { instanceId: "claude", terminal: true },
    });
    expect(flowStore.start).toHaveBeenLastCalledWith(
      expect.objectContaining({
        client: { terminal: true },
        purpose: "logout",
      }),
    );
  });

  it("refuses instances that are missing, unavailable or have no sign-in", async () => {
    await expect(
      engineAuthRouter.start({
        ctx: { session: { user: { id: "user-2" } } },
        input: { instanceId: "claude" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      engineAuthRouter.start({ ctx, input: { instanceId: "grok" } }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Grok is not available yet.",
    });
    await expect(
      engineAuthRouter.start({ ctx, input: { instanceId: "sentinel" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(flowStore.start).not.toHaveBeenCalled();
  });

  it("maps flow errors and scopes reads to the caller", async () => {
    await expect(
      engineAuthRouter.respond({
        ctx,
        input: {
          flowId: "flow-1",
          instanceId: "claude",
          interactionId: "flow-1:1",
          response: { exitCode: 0, type: "terminal" },
        },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "Not waiting." });

    await engineAuthRouter.cancel({
      ctx,
      input: { flowId: "flow-1", instanceId: "claude" },
    });
    expect(flowStore.cancel).toHaveBeenCalledWith({
      flowId: "flow-1",
      instanceId: "claude",
      userId: "user-1",
    });

    expect(
      await engineAuthRouter.status({ ctx, input: { instanceId: "claude" } }),
    ).toEqual({ instanceId: "claude", phase: "idle" });
    expect(flowStore.get).toHaveBeenCalledWith("user-1", "claude");
  });

  it("validates answers before they reach the store", () => {
    const schema = engineAuthRouter.respond.inputSchema;
    expect(
      schema.safeParse({
        flowId: "flow-1",
        instanceId: "claude",
        interactionId: "flow-1:1",
        response: { type: "credentials", values: { KEY: "x".repeat(20_000) } },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        flowId: "flow-1",
        instanceId: "claude",
        interactionId: "flow-1:1",
        response: {
          type: "credentials",
          values: Object.fromEntries(
            Array.from({ length: 17 }, (_, index) => [`K${index}`, "v"]),
          ),
        },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        flowId: "flow-1",
        instanceId: "claude",
        interactionId: "flow-1:1",
        response: { exitCode: null, type: "terminal" },
      }).success,
    ).toBe(true);
  });
});
