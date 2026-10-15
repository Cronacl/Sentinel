import "server-only";

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { applyPrivateFsMode } from "@/lib/runtime/local-state";

import { getEnginesStateDirectory } from "./paths";

// What the engine platform may fetch from the network on its own: the
// remote engine manifest (models, compatibility ranges) and the latest
// released versions of installed CLIs (npm registry, Homebrew). Both are on
// by default and switched off in Settings → Engines, or for the whole
// process with SENTINEL_DISABLE_REMOTE_MANIFEST / SENTINEL_DISABLE_ENGINE_
// UPDATE_CHECKS. They are machine settings (one local profile; the services
// reading them are process-wide), kept in
// <state root>/engines/settings.json so SENTINEL_STATE_PATH relocates them.

export const ENGINE_NETWORK_SETTINGS_FILE = "settings.json";

export const REMOTE_MANIFEST_DISABLE_ENV = "SENTINEL_DISABLE_REMOTE_MANIFEST";
export const UPDATE_CHECKS_DISABLE_ENV =
  "SENTINEL_DISABLE_ENGINE_UPDATE_CHECKS";

const storedSettingsSchema = z.object({
  remoteManifest: z.boolean().optional(),
  updateChecks: z.boolean().optional(),
  version: z.literal(1),
});

export type EngineNetworkSettingKey = "remoteManifest" | "updateChecks";

export type EngineNetworkSetting = {
  /** In effect: the stored choice unless the environment turns it off. */
  enabled: boolean;
  /** Turned off by an environment variable (the toggle cannot change it). */
  lockedByEnv: string | null;
  /** The stored choice (default on). */
  stored: boolean;
};

export type EngineNetworkSettings = Record<
  EngineNetworkSettingKey,
  EngineNetworkSetting
>;

const ENV_KEYS: Record<EngineNetworkSettingKey, string> = {
  remoteManifest: REMOTE_MANIFEST_DISABLE_ENV,
  updateChecks: UPDATE_CHECKS_DISABLE_ENV,
};

function isTruthyFlag(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized !== undefined &&
    normalized !== "" &&
    normalized !== "0" &&
    normalized !== "false" &&
    normalized !== "no" &&
    normalized !== "off"
  );
}

export type EngineNetworkSettingsFs = {
  mkdir(
    target: string,
    options: { mode: number; recursive: true },
  ): Promise<unknown>;
  readFile(target: string, encoding: "utf8"): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  writeFile(
    target: string,
    data: string,
    options: { encoding: "utf8"; mode: number },
  ): Promise<void>;
};

export type EngineNetworkSettingsStoreDeps = {
  env?: () => Record<string, string | undefined>;
  filePath?: () => string;
  fs?: EngineNetworkSettingsFs;
};

export interface EngineNetworkSettingsStore {
  read(): Promise<EngineNetworkSettings>;
  isEnabled(key: EngineNetworkSettingKey): Promise<boolean>;
  update(
    patch: Partial<Record<EngineNetworkSettingKey, boolean>>,
  ): Promise<EngineNetworkSettings>;
}

const nodeFs: EngineNetworkSettingsFs = {
  mkdir: (target, options) => nodeMkdir(target, options),
  readFile: (target, encoding) => nodeReadFile(target, encoding),
  rename: (from, to) => nodeRename(from, to),
  writeFile: (target, data, options) => nodeWriteFile(target, data, options),
};

export function getEngineNetworkSettingsFilePath() {
  return path.join(getEnginesStateDirectory(), ENGINE_NETWORK_SETTINGS_FILE);
}

export function createEngineNetworkSettingsStore(
  deps: EngineNetworkSettingsStoreDeps = {},
): EngineNetworkSettingsStore {
  const fs = deps.fs ?? nodeFs;
  const env = deps.env ?? (() => process.env);
  const filePath = deps.filePath ?? getEngineNetworkSettingsFilePath;
  let writes: Promise<unknown> = Promise.resolve();

  async function readStored() {
    try {
      const parsed = storedSettingsSchema.safeParse(
        JSON.parse(await fs.readFile(filePath(), "utf8")),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function toSettings(
    stored: z.infer<typeof storedSettingsSchema> | null,
  ): EngineNetworkSettings {
    const current = env();
    const entry = (key: EngineNetworkSettingKey): EngineNetworkSetting => {
      const lockedByEnv = isTruthyFlag(current[ENV_KEYS[key]])
        ? ENV_KEYS[key]
        : null;
      const value = stored?.[key] ?? true;
      return { enabled: value && !lockedByEnv, lockedByEnv, stored: value };
    };
    return {
      remoteManifest: entry("remoteManifest"),
      updateChecks: entry("updateChecks"),
    };
  }

  const store: EngineNetworkSettingsStore = {
    async isEnabled(key) {
      return (await store.read())[key].enabled;
    },

    async read() {
      return toSettings(await readStored());
    },

    async update(patch) {
      const run = async () => {
        const stored = await readStored();
        const next = {
          remoteManifest: patch.remoteManifest ?? stored?.remoteManifest,
          updateChecks: patch.updateChecks ?? stored?.updateChecks,
          version: 1 as const,
        };
        const target = filePath();
        const directory = path.dirname(target);
        const temporary = `${target}.${process.pid}.tmp`;
        await fs.mkdir(directory, { mode: 0o700, recursive: true });
        await applyPrivateFsMode(directory, 0o700);
        await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
        await fs.rename(temporary, target);
        return toSettings(next);
      };
      // One write at a time, each reading what the previous one wrote.
      const result = writes.then(run, run);
      writes = result.catch(() => undefined);
      return await result;
    },
  };

  return store;
}

const globalForSettings = globalThis as unknown as {
  __sentinelEngineNetworkSettings?: EngineNetworkSettingsStore;
};

export function getEngineNetworkSettingsStore(): EngineNetworkSettingsStore {
  globalForSettings.__sentinelEngineNetworkSettings ??=
    createEngineNetworkSettingsStore();
  return globalForSettings.__sentinelEngineNetworkSettings;
}
