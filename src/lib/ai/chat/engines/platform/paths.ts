import "server-only";

import path from "node:path";

import { getSentinelStateRoot } from "@/lib/runtime/local-state";

import { engineInstanceIdSchema } from "../contract";

// Engine state on disk, always under the Sentinel state root so
// SENTINEL_STATE_PATH (tests, E2E isolation) relocates all of it:
//   <state root>/engines/<instanceId>/        per-instance state (status
//                                             snapshot, learned catalogs,
//                                             private homes)
//   <state root>/engines/runtime-paths.json   resolved binaries per instance
// Instance ids are slugs (no dots), so they never collide with the files.

export type EnginePathOptions = {
  /** path.posix / path.win32 when computing paths for another platform. */
  pathModule?: path.PlatformPath;
  stateRoot?: string;
};

export function getEnginesStateDirectory(options: EnginePathOptions = {}) {
  const pathModule = options.pathModule ?? path;
  return pathModule.join(
    options.stateRoot ?? getSentinelStateRoot(),
    "engines",
  );
}

/** <state root>/engines/<instanceId>; throws for a non-slug id. */
export function getEngineInstanceStateDirectory(
  instanceId: string,
  options: EnginePathOptions = {},
) {
  const pathModule = options.pathModule ?? path;
  return pathModule.join(
    getEnginesStateDirectory(options),
    engineInstanceIdSchema.parse(instanceId),
  );
}

export function getRuntimePathsFilePath(options: EnginePathOptions = {}) {
  const pathModule = options.pathModule ?? path;
  return pathModule.join(
    getEnginesStateDirectory(options),
    "runtime-paths.json",
  );
}
