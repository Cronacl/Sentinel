import { chmod } from "node:fs/promises";
import path from "node:path";

import { getPlatformHomeDirectory } from "./platform-paths";

type EnvLike = NodeJS.ProcessEnv;

function getPathModule(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

export function getSentinelStateRoot(options?: {
  env?: EnvLike;
  platform?: NodeJS.Platform;
}) {
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;
  const pathModule = getPathModule(platform);
  const explicitStatePath = env.SENTINEL_STATE_PATH?.trim();

  if (explicitStatePath) {
    return pathModule.dirname(explicitStatePath);
  }

  return pathModule.join(
    getPlatformHomeDirectory({ env, platform }),
    ".sentinel",
  );
}

export function getSentinelStateFilePath(options?: {
  env?: EnvLike;
  platform?: NodeJS.Platform;
}) {
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;
  const pathModule = getPathModule(platform);
  const explicitStatePath = env.SENTINEL_STATE_PATH?.trim();

  if (explicitStatePath) {
    return explicitStatePath;
  }

  return pathModule.join(
    getSentinelStateRoot({ ...options, platform }),
    "state.json",
  );
}

export function getSentinelDbFilePath(options?: {
  env?: EnvLike;
  platform?: NodeJS.Platform;
}) {
  const env = options?.env ?? process.env;
  const platform = options?.platform ?? process.platform;
  const pathModule = getPathModule(platform);
  const explicitDbPath = env.SENTINEL_DB_PATH?.trim();

  if (explicitDbPath) {
    return explicitDbPath;
  }

  return pathModule.join(
    getSentinelStateRoot({ ...options, platform }),
    "sentinel.db",
  );
}

export async function applyPrivateFsMode(
  targetPath: string,
  mode: number,
  options?: {
    platform?: NodeJS.Platform;
  },
) {
  const platform = options?.platform ?? process.platform;

  if (platform === "win32") {
    return;
  }

  await chmod(targetPath, mode).catch(() => undefined);
}
