import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance, makeFakeSnapshot } =
  await import("../../contract/testing");
const { makeEngineUsageLimits } = await import("../../contract");
const { createEngineUsageLimitsStore } = await import("./limits-store");
const { createEngineUsageService, EngineUsageError } =
  await import("./service");

import type { EngineSnapshot } from "../../contract";

const USER = "user-1";

function setup(
  input: {
    driver?: string;
    snapshot?: Partial<EngineSnapshot>;
    withReader?: boolean;
  } = {},
) {
  const driverKind = input.driver ?? "codex";
  const instance = makeFakeInstance({ driver: driverKind, id: driverKind });
  const read = mock(async () =>
    makeEngineUsageLimits({
      checkedAt: "2026-10-08T10:00:00.000Z",
      windows: [
        { id: "primary", kind: "session", label: "Session", usedPercent: 12 },
      ],
    }),
  );
  const keychain = mock(
    async (_userId: string, _instanceId: string) => "token",
  );
  const store = createEngineUsageLimitsStore();
  const service = createEngineUsageService({
    drivers: (kind) =>
      kind === driverKind
        ? {
            kind,
            ...(input.withReader === false ? {} : { usageLimits: { read } }),
          }
        : null,
    readCursorKeychainToken: keychain,
    registry: {
      get: async (_userId, id) =>
        id === instance.id ? { instance, status: "available" } : null,
    },
    snapshots: {
      getSnapshot: async () =>
        makeFakeSnapshot({ driver: driverKind, ...input.snapshot }),
    },
    store,
  });
  return { keychain, read, service, store };
}

describe("usage service", () => {
  it("waits for a first read, then answers from the store", async () => {
    const { read, service } = setup();

    expect((await service.get(USER, "codex"))?.windows).toHaveLength(1);
    await service.get(USER, "codex");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not read for instances that cannot be used", async () => {
    const { read, service } = setup({ snapshot: { usable: false } });
    expect(await service.get(USER, "codex")).toBeNull();
    await expect(service.refresh(USER, "codex")).rejects.toMatchObject({
      code: "not-ready",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("refreshes on request", async () => {
    const { read, service } = setup();
    await service.get(USER, "codex");
    await service.refresh(USER, "codex");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("names unknown instances and drivers without usage", async () => {
    const { service } = setup({ withReader: false });
    await expect(service.get(USER, "missing")).rejects.toBeInstanceOf(
      EngineUsageError,
    );
    await expect(service.refresh(USER, "codex")).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("reads the Cursor Keychain only for Cursor, then reads usage", async () => {
    const cursor = setup({ driver: "cursor" });
    await cursor.service.readCursorKeychain(USER, "cursor");
    expect(cursor.keychain).toHaveBeenCalledWith(USER, "cursor");
    expect(cursor.read).toHaveBeenCalledTimes(1);

    const codex = setup();
    await expect(
      codex.service.readCursorKeychain(USER, "codex"),
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(codex.keychain).not.toHaveBeenCalled();
  });
});
