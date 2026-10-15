import "server-only";

import { getDriverMeta } from "../catalog";
import type { DriverKind, ResolvedEngineInstance } from "../contract";

// Where an instance keeps its own configuration (CODEX_HOME,
// CLAUDE_CONFIG_DIR, COPILOT_HOME, …): its home directory when the driver
// declares a home variable and the instance sets one (homePath or its own
// environment). Null means the runtime's usual location.

export function getInstanceHomeDirectory(
  instance: Pick<ResolvedEngineInstance, "driver" | "envOverrides">,
) {
  const homeEnvVar = getDriverMeta(instance.driver)?.homeEnvVar;
  const home = homeEnvVar ? instance.envOverrides[homeEnvVar]?.trim() : null;
  return home || null;
}

/**
 * A driver's default instance for features that act on "the" engine
 * outside a thread (skills, account panels). Null when it cannot be
 * resolved (disabled, misconfigured); callers then use the runtime's usual
 * location. The registry is loaded on demand.
 */
export async function resolveDefaultEngineInstance(
  userId: string,
  driver: DriverKind,
): Promise<ResolvedEngineInstance | null> {
  try {
    const { getEngineInstanceRegistry } = await import("./instances");
    return await getEngineInstanceRegistry().resolve(userId, {
      driver,
      instanceId: null,
    });
  } catch {
    return null;
  }
}
