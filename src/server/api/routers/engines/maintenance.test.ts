// @ts-nocheck

import { describe, expect, it, mock } from "bun:test";

// api.engines.maintenance over its platform services, all replaced here.

mock.module("server-only", () => ({}));

mock.module("@/server/api/trpc", () => {
  const procedure = (inputSchema?: any) => ({
    mutation: (handler: any) => Object.assign(handler, { inputSchema }),
    query: (handler: any) => Object.assign(handler, { inputSchema }),
    subscription: (handler: any) => Object.assign(handler, { inputSchema }),
  });
  return {
    createTRPCRouter: (routes: Record<string, any>) => routes,
    protectedProcedure: {
      input: (inputSchema: any) => procedure(inputSchema),
      ...procedure(),
    },
  };
});

class EngineMaintenanceError extends Error {
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const status = (instanceId: string) => ({
  installState: null,
  instanceId,
  updateState: { status: "running" },
});
const maintenance = {
  cancel: mock(async (_user: string, instanceId: string) => status(instanceId)),
  checkForUpdate: mock(async (_user: string, instanceId: string) =>
    status(instanceId),
  ),
  install: mock(async (_user: string, instanceId: string) =>
    status(instanceId),
  ),
  status: mock(async (_user: string, instanceId: string) => {
    if (instanceId === "gone") {
      throw new EngineMaintenanceError("gone", "not_found");
    }
    return status(instanceId);
  }),
  update: mock(async (_user: string, _instanceId: string, input: any) => {
    if (input.expectedCommand !== "brew upgrade --cask copilot-cli") {
      throw new EngineMaintenanceError("changed", "changed");
    }
    return status("copilot");
  }),
};
mock.module("@/lib/ai/chat/engines/platform/maintenance/service", () => ({
  EngineMaintenanceError,
  getEngineMaintenanceService: () => maintenance,
}));

const settings = {
  remoteManifest: { enabled: true, lockedByEnv: null, stored: true },
  updateChecks: { enabled: true, lockedByEnv: null, stored: true },
};
const settingsStore = {
  read: mock(async () => settings),
  update: mock(async (patch: any) => {
    for (const [key, value] of Object.entries(patch)) {
      settings[key] = { ...settings[key], enabled: value, stored: value };
    }
    return settings;
  }),
};
mock.module("@/lib/ai/chat/engines/platform/network-settings", () => ({
  getEngineNetworkSettingsStore: () => settingsStore,
}));

const manifestService = {
  refresh: mock(async () => ({ source: "remote" })),
  status: mock(async () => ({ source: "bundled", updatedAt: "2026-10-08" })),
};
mock.module("@/lib/ai/chat/engines/platform/manifest/service", () => ({
  getEngineManifestService: () => manifestService,
}));

const invalidate = mock(() => {});
mock.module("@/lib/ai/chat/engines/platform/snapshot-service", () => ({
  getEngineSnapshotService: () => ({ invalidate }),
}));

const { emitEngineEvent } =
  await import("@/lib/ai/chat/engines/platform/events");
const { engineMaintenanceRouter } = await import("./maintenance");

const ctx = { session: { user: { id: "user-1" } } };

describe("engineMaintenanceRouter", () => {
  it("passes requests to the maintenance service for the session's user", async () => {
    expect(
      await engineMaintenanceRouter.status({
        ctx,
        input: { instanceId: "codex" },
      }),
    ).toEqual(status("codex"));
    await engineMaintenanceRouter.checkForUpdate({
      ctx,
      input: { instanceId: "codex" },
    });
    await engineMaintenanceRouter.install({
      ctx,
      input: {
        expectedCommand: "npm install -g opencode-ai",
        instanceId: "opencode",
        optionId: "npm",
      },
    });
    await engineMaintenanceRouter.cancelInstall({
      ctx,
      input: { instanceId: "opencode" },
    });

    expect(maintenance.checkForUpdate).toHaveBeenCalledWith("user-1", "codex");
    expect(maintenance.install).toHaveBeenCalledWith("user-1", "opencode", {
      expectedCommand: "npm install -g opencode-ai",
      optionId: "npm",
    });
    expect(maintenance.cancel).toHaveBeenCalledWith("user-1", "opencode");
  });

  it("requires the confirmed command and maps service errors", async () => {
    expect(
      engineMaintenanceRouter.update.inputSchema.safeParse({
        instanceId: "copilot",
      }).success,
    ).toBe(false);
    await expect(
      engineMaintenanceRouter.update({
        ctx,
        input: { expectedCommand: "brew upgrade other", instanceId: "copilot" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "changed" });
    await expect(
      engineMaintenanceRouter.status({ ctx, input: { instanceId: "gone" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("streams one instance's maintenance progress", async () => {
    const controller = new AbortController();
    const stream = engineMaintenanceRouter.onProgress({
      ctx,
      input: { instanceId: "copilot" },
      signal: controller.signal,
    });

    const first = await stream.next();
    expect(JSON.stringify(first.value)).toContain('"instanceId":"copilot"');
    expect(JSON.stringify(first.value)).toContain('"status":"running"');

    const pending = stream.next();
    emitEngineEvent({ instanceId: "codex", type: "maintenance" });
    emitEngineEvent({
      instanceId: "copilot",
      type: "maintenance",
      updateState: {
        finishedAt: null,
        message: "Updating",
        output: null,
        startedAt: null,
        status: "running",
      },
    });
    const next = await pending;
    expect(JSON.stringify(next.value)).toContain("Updating");
    expect(JSON.stringify(next.value)).not.toContain('"codex"');

    controller.abort();
    await stream.return(undefined);
  });

  it("reads and changes the network settings", async () => {
    expect(await engineMaintenanceRouter.settings({ ctx })).toEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({ source: "bundled" }),
        remoteManifest: expect.objectContaining({ enabled: true }),
      }),
    );

    await engineMaintenanceRouter.updateSettings({
      ctx,
      input: { updateChecks: false },
    });
    expect(settingsStore.update).toHaveBeenCalledWith({ updateChecks: false });
    expect(manifestService.refresh).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(1);

    await engineMaintenanceRouter.updateSettings({
      ctx,
      input: { remoteManifest: true },
    });
    expect(manifestService.refresh).toHaveBeenCalledWith({ force: true });

    await engineMaintenanceRouter.refreshManifest({ ctx });
    expect(manifestService.refresh).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledTimes(3);

    expect(
      engineMaintenanceRouter.updateSettings.inputSchema.safeParse({}).success,
    ).toBe(false);
  });
});
