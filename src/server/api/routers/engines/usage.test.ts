// @ts-nocheck

import { beforeEach, describe, expect, it, mock } from "bun:test";

// api.engines.usage: the procedures hand the signed-in user's id to the
// usage service (which only resolves that user's instances) and map its
// errors to tRPC codes. The service and its dependencies are replaced.

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

mock.module("@/lib/ai/chat/engines/platform/instances", () => ({
  getEngineInstanceRegistry: () => ({ get: async () => null }),
}));
mock.module("@/lib/ai/chat/engines/platform/snapshot-service", () => ({
  getEngineSnapshotService: () => ({ getSnapshot: async () => null }),
}));
mock.module("@/lib/ai/chat/engines/platform/drivers", () => ({
  getEngineDriver: () => null,
}));

class CursorKeychainUnavailableError extends Error {}
const readCursorKeychainToken = mock(
  async (_userId: string, _instanceId: string) => "token",
);
mock.module("@/lib/ai/chat/engines/usage/cursor-keychain", () => ({
  CursorKeychainUnavailableError,
  readCursorKeychainToken,
}));

class EngineUsageError extends Error {
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const service = {
  get: mock(async (_userId: string, _instanceId: string) => null as unknown),
  readCursorKeychain: mock(
    async (_userId: string, _instanceId: string) => null as unknown,
  ),
  refresh: mock(
    async (_userId: string, _instanceId: string) => null as unknown,
  ),
};
let serviceDeps: any = null;
mock.module("@/lib/ai/chat/engines/platform/usage/service", () => ({
  EngineUsageError,
  createEngineUsageService: (deps: any) => {
    serviceDeps = deps;
    return service;
  },
}));

const { engineUsageRouter } = await import("./usage");

const ctx = { session: { user: { id: "user-1" } } };
const LIMITS = {
  checkedAt: "2026-10-08T10:00:00.000Z",
  windows: [
    { id: "primary", kind: "session", label: "Session", usedPercent: 5 },
  ],
};

beforeEach(() => {
  for (const method of [
    service.get,
    service.refresh,
    service.readCursorKeychain,
  ]) {
    method.mockReset();
    method.mockImplementation(async () => null);
  }
  readCursorKeychainToken.mockClear();
});

describe("engines usage router", () => {
  it("answers for the signed-in user's instance", async () => {
    service.get.mockResolvedValueOnce(LIMITS);
    service.refresh.mockResolvedValueOnce(LIMITS);

    expect(
      await engineUsageRouter.get({ ctx, input: { instanceId: "codex" } }),
    ).toEqual(LIMITS);
    expect(
      await engineUsageRouter.refresh({ ctx, input: { instanceId: "codex" } }),
    ).toEqual(LIMITS);

    expect(service.get).toHaveBeenCalledWith("user-1", "codex");
    expect(service.refresh).toHaveBeenCalledWith("user-1", "codex");
  });

  it("rejects instance ids that are not ids", () => {
    const schema = engineUsageRouter.get.inputSchema;
    expect(schema.safeParse({ instanceId: "codex" }).success).toBeTrue();
    expect(schema.safeParse({ instanceId: "../etc" }).success).toBeFalse();
    expect(schema.safeParse({}).success).toBeFalse();
  });

  it("maps usage errors to tRPC codes", async () => {
    const cases = [
      ["not-found", "NOT_FOUND"],
      ["not-ready", "PRECONDITION_FAILED"],
      ["unsupported", "BAD_REQUEST"],
    ] as const;
    for (const [code, trpcCode] of cases) {
      service.refresh.mockRejectedValueOnce(
        new EngineUsageError(code, `${code} message`),
      );
      await expect(
        engineUsageRouter.refresh({ ctx, input: { instanceId: "codex" } }),
      ).rejects.toMatchObject({ code: trpcCode, message: `${code} message` });
    }

    service.get.mockRejectedValueOnce(new Error("boom"));
    await expect(
      engineUsageRouter.get({ ctx, input: { instanceId: "codex" } }),
    ).rejects.toThrow("boom");
  });

  it("reads the Keychain only through its own procedure, for the signed-in user", async () => {
    // Building the service reads nothing.
    await engineUsageRouter.get({ ctx, input: { instanceId: "cursor" } });
    expect(readCursorKeychainToken).not.toHaveBeenCalled();

    service.readCursorKeychain.mockResolvedValueOnce(LIMITS);
    expect(
      await engineUsageRouter.readCursorKeychain({
        ctx,
        input: { instanceId: "cursor" },
      }),
    ).toEqual(LIMITS);
    expect(service.readCursorKeychain).toHaveBeenCalledWith("user-1", "cursor");

    // The service's Keychain dependency keeps the login per user.
    await serviceDeps.readCursorKeychainToken("user-1", "cursor");
    expect(readCursorKeychainToken).toHaveBeenCalledWith("user-1", "cursor");

    service.readCursorKeychain.mockRejectedValueOnce(
      new CursorKeychainUnavailableError("Denied."),
    );
    await expect(
      engineUsageRouter.readCursorKeychain({
        ctx,
        input: { instanceId: "cursor" },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Denied.",
    });
  });
});
