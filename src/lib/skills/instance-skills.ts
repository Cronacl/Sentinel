import "server-only";

import path from "node:path";

import type {
  DriverKind,
  ResolvedEngineInstance,
} from "@/lib/ai/chat/engines/contract";
import {
  getInstanceHomeDirectory,
  resolveDefaultEngineInstance,
} from "@/lib/ai/chat/engines/platform/instance-homes";

import type { SkillGlobalDirectories } from "./index";

// Global skill folders per engine instance (critique G11). Codex, Claude,
// Copilot and Pi read their global skills from `<home>/skills`, where home
// is the instance's CODEX_HOME, CLAUDE_CONFIG_DIR, COPILOT_HOME or
// PI_CODING_AGENT_DIR; without one, the usual ~/.codex, ~/.claude,
// ~/.copilot and ~/.pi/agent folders apply (and skillsBasePath keeps moving
// those). Discovery, the composer and installs
// all go through the instance the user picked, else the driver's default.

export const HOME_SKILL_DRIVERS = ["codex", "claude", "copilot", "pi"] as const;

export type HomeSkillDriver = (typeof HOME_SKILL_DRIVERS)[number];

/** The drivers whose home moves a conventional skills folder. */
const HOME_SKILL_FOLDER_DRIVERS = ["claude", "copilot", "pi"] as const;
type HomeSkillFolderDriver = (typeof HOME_SKILL_FOLDER_DRIVERS)[number];

function isHomeSkillDriver(driver: DriverKind): driver is HomeSkillDriver {
  return (HOME_SKILL_DRIVERS as readonly string[]).includes(driver);
}

/** `<home>/skills` when the instance sets a home, else null. */
export function getInstanceGlobalSkillsDirectory(
  instance: Pick<ResolvedEngineInstance, "driver" | "envOverrides"> | null,
) {
  const home = instance ? getInstanceHomeDirectory(instance) : null;
  return home ? path.join(home, "skills") : null;
}

export type SkillInstanceContext = {
  /** Claude's, Copilot's and Pi's global folders moved by instance homes. */
  globalDirectories: SkillGlobalDirectories;
  /** The instance whose skills are shown or installed, per driver. */
  instances: Record<HomeSkillDriver, ResolvedEngineInstance | null>;
};

export type SkillInstanceDeps = {
  getInstance?: (
    userId: string,
    instanceId: string,
  ) => Promise<ResolvedEngineInstance | null>;
  resolveDefault?: typeof resolveDefaultEngineInstance;
};

async function getAvailableInstance(userId: string, instanceId: string) {
  try {
    const { getEngineInstanceRegistry } =
      await import("@/lib/ai/chat/engines/platform/instances");
    const lookup = await getEngineInstanceRegistry().get(userId, instanceId);
    return lookup?.status === "available" ? lookup.instance : null;
  } catch {
    return null;
  }
}

/**
 * The instances whose homes decide where skills live: the selected one for
 * its driver, every other driver's default instance.
 */
export async function resolveSkillInstanceContext(
  userId: string,
  selectedInstanceId?: string | null,
  deps: SkillInstanceDeps = {},
): Promise<SkillInstanceContext> {
  const selected = selectedInstanceId
    ? await (deps.getInstance ?? getAvailableInstance)(
        userId,
        selectedInstanceId,
      )
    : null;
  const resolveDefault = deps.resolveDefault ?? resolveDefaultEngineInstance;

  const entries = await Promise.all(
    HOME_SKILL_DRIVERS.map(
      async (driver) =>
        [
          driver,
          selected &&
          isHomeSkillDriver(selected.driver) &&
          selected.driver === driver
            ? selected
            : await resolveDefault(userId, driver),
        ] as const,
    ),
  );
  const instances = Object.fromEntries(entries) as Record<
    HomeSkillDriver,
    ResolvedEngineInstance | null
  >;

  const globalDirectories: SkillGlobalDirectories = {};
  // Codex's home is handled by the Codex skill context instead.
  for (const driver of HOME_SKILL_FOLDER_DRIVERS) {
    const directory = getInstanceGlobalSkillsDirectory(instances[driver]);
    if (directory) {
      globalDirectories[driver] = directory;
    }
  }
  return { globalDirectories, instances };
}

/** Where a global install for `target` goes, when an instance moves it. */
export function getGlobalInstallDirectory(
  context: SkillInstanceContext,
  target: string,
) {
  return (HOME_SKILL_FOLDER_DRIVERS as readonly string[]).includes(target)
    ? (context.globalDirectories[target as HomeSkillFolderDriver] ?? null)
    : null;
}
