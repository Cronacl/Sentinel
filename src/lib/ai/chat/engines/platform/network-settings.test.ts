import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { createEngineNetworkSettingsStore, getEngineNetworkSettingsFilePath } =
  await import("./network-settings");

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-network-settings-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function store(env: Record<string, string | undefined> = {}) {
  return createEngineNetworkSettingsStore({
    env: () => env,
    filePath: () => path.join(root, "engines", "settings.json"),
  });
}

describe("engine network settings", () => {
  it("is on by default", async () => {
    expect(await store().read()).toEqual({
      remoteManifest: { enabled: true, lockedByEnv: null, stored: true },
      updateChecks: { enabled: true, lockedByEnv: null, stored: true },
    });
  });

  it("persists each setting on its own", async () => {
    const settings = store();
    await settings.update({ remoteManifest: false });
    await settings.update({ updateChecks: false });
    await settings.update({ remoteManifest: true });

    expect(await store().read()).toEqual({
      remoteManifest: { enabled: true, lockedByEnv: null, stored: true },
      updateChecks: { enabled: false, lockedByEnv: null, stored: false },
    });
    expect(
      JSON.parse(
        await readFile(path.join(root, "engines", "settings.json"), "utf8"),
      ),
    ).toEqual({ remoteManifest: true, updateChecks: false, version: 1 });
  });

  it("lets the environment turn a setting off", async () => {
    const settings = store({
      SENTINEL_DISABLE_ENGINE_UPDATE_CHECKS: "0",
      SENTINEL_DISABLE_REMOTE_MANIFEST: "1",
    });
    expect(await settings.read()).toEqual({
      remoteManifest: {
        enabled: false,
        lockedByEnv: "SENTINEL_DISABLE_REMOTE_MANIFEST",
        stored: true,
      },
      updateChecks: { enabled: true, lockedByEnv: null, stored: true },
    });
    expect(await settings.isEnabled("remoteManifest")).toBe(false);
  });

  it("serializes concurrent updates", async () => {
    const settings = store();
    await Promise.all([
      settings.update({ remoteManifest: false }),
      settings.update({ updateChecks: false }),
    ]);
    const current = await settings.read();
    expect(current.remoteManifest.stored).toBe(false);
    expect(current.updateChecks.stored).toBe(false);
  });

  it("lives under the engines state directory", () => {
    expect(getEngineNetworkSettingsFilePath()).toEndWith(
      path.join("engines", "settings.json"),
    );
  });
});
