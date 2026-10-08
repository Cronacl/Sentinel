import "server-only";

import path from "node:path";

import { buildManagedExecutablePathValue } from "@/lib/runtime/platform-paths";

import type {
  EngineInstallState,
  EngineSnapshot,
  EngineUpdateState,
  ResolvedEngineInstance,
} from "../../contract";
import type { EngineDriver } from "../driver";
import { disposeInstanceResources } from "../instance-resources";
import { getEngineInstanceRegistry } from "../instances";
import {
  compareEngineVersions,
  normalizeEngineVersion,
} from "../manifest/compatibility";
import { findExecutableInPath } from "../runtime/resolve-binary";
import { getEngineSnapshotService } from "../snapshot-service";
import { getEngineMaintenanceDefinition } from "./definitions";
import { getMaintenanceInspectDeps } from "./enricher";
import { buildMaintenanceEnv } from "./env";
import {
  inspectMaintenance,
  MANAGED_INSTALL_OPTION_ID,
  type EngineInstallOptionView,
  type MaintenanceInspectDeps,
  type MaintenanceInspection,
} from "./inspect";
import {
  getMaintenanceRunner,
  MaintenanceBusyError,
  type MaintenanceRunner,
  type MaintenanceVerification,
} from "./runner";

// api.engines.maintenance behind the router: what can be installed or
// updated for an instance, and running it. Every command runs only after
// the user confirmed it, and the command the user confirmed must still be
// the one Sentinel would run when the request arrives (ownership is derived
// again at that moment); otherwise the request is refused and the UI shows
// the new command for another confirmation. Commands run with Sentinel's
// own environment, not the instance's home and secrets (env.ts).

export type EngineMaintenanceErrorCode =
  "busy" | "changed" | "not_found" | "unavailable";

export class EngineMaintenanceError extends Error {
  constructor(
    message: string,
    readonly code: EngineMaintenanceErrorCode,
  ) {
    super(message);
  }
}

export type EngineMaintenanceStatus = {
  bundled: boolean;
  /** One-click update offered (a proven updater, a supported latest). */
  canUpdate: boolean;
  checkedAt: string | null;
  currentVersion: string | null;
  driver: string;
  installed: boolean;
  installHint: string | null;
  installOptions: EngineInstallOptionView[];
  installState: EngineInstallState | null;
  instanceId: string;
  label: string;
  latestVersion: string | null;
  running: boolean;
  /** The exact update command, when there is one. */
  updateCommand: string | null;
  updateBlockedReason: string | null;
  /** Who updates the binary ("npm global", "Homebrew cask copilot-cli"…). */
  updateOwner: string | null;
  updateChecksEnabled: boolean;
  updateState: EngineUpdateState | null;
  versionStatus: "behind_latest" | "current" | "unknown";
};

type SnapshotAccess = {
  getSnapshot(
    userId: string,
    instanceId: string,
  ): Promise<EngineSnapshot | null>;
  refresh(
    userId: string,
    instanceId: string,
    reason?: "update",
  ): Promise<EngineSnapshot | null>;
};

type InstanceLookup = {
  get(
    userId: string,
    instanceId: string,
  ): Promise<
    | { instance: ResolvedEngineInstance; status: "available" }
    | { instance: { label: string }; status: "unavailable" }
    | null
  >;
};

export type EngineMaintenanceServiceDeps = {
  /** The server environment instance overrides are reset to (tests). */
  baseEnv?: Record<string, string | undefined>;
  /** Ends the instance's long-lived runtimes so the new binary is used. */
  disposeInstance: (instanceId: string) => Promise<void>;
  drivers: (kind: string) => EngineDriver | null | Promise<EngineDriver | null>;
  inspect?: Partial<MaintenanceInspectDeps>;
  platform?: NodeJS.Platform;
  registry: () => InstanceLookup;
  runner?: () => MaintenanceRunner;
  snapshots: () => SnapshotAccess;
  which?: (command: string, pathValue: string) => Promise<string | null>;
};

export interface EngineMaintenanceService {
  status(userId: string, instanceId: string): Promise<EngineMaintenanceStatus>;
  /** Looks the latest version up now and re-probes the instance. */
  checkForUpdate(
    userId: string,
    instanceId: string,
  ): Promise<EngineMaintenanceStatus>;
  update(
    userId: string,
    instanceId: string,
    input: { expectedCommand: string },
  ): Promise<EngineMaintenanceStatus>;
  install(
    userId: string,
    instanceId: string,
    input: { expectedCommand: string | null; optionId: string },
  ): Promise<EngineMaintenanceStatus>;
  cancel(userId: string, instanceId: string): Promise<EngineMaintenanceStatus>;
}

function displayVersion(driver: string, snapshot: EngineSnapshot) {
  return (
    normalizeEngineVersion(driver, snapshot.install.version) ??
    snapshot.install.version
  );
}

export function createEngineMaintenanceService(
  deps: EngineMaintenanceServiceDeps,
): EngineMaintenanceService {
  const runner = () => (deps.runner ?? getMaintenanceRunner)();
  const inspectDeps = () => getMaintenanceInspectDeps(deps.inspect);
  const platform = deps.platform ?? process.platform;
  const which =
    deps.which ??
    ((command: string, pathValue: string) =>
      findExecutableInPath(command, pathValue, { platform }));

  async function load(userId: string, instanceId: string) {
    const lookup = await deps.registry().get(userId, instanceId);
    if (!lookup) {
      throw new EngineMaintenanceError(
        `Engine instance "${instanceId}" does not exist.`,
        "not_found",
      );
    }
    if (lookup.status !== "available") {
      throw new EngineMaintenanceError(
        `${lookup.instance.label} is not available in this version of Sentinel.`,
        "unavailable",
      );
    }
    const driver = await deps.drivers(lookup.instance.driver);
    const snapshot = await deps.snapshots().getSnapshot(userId, instanceId);
    if (!driver || !snapshot) {
      throw new EngineMaintenanceError(
        `${lookup.instance.label} is not available in this version of Sentinel.`,
        "unavailable",
      );
    }
    return {
      driver,
      env: buildMaintenanceEnv(lookup.instance, deps.baseEnv),
      instance: lookup.instance,
      snapshot,
      target: { instanceId, userId },
    };
  }

  async function inspect(
    loaded: Awaited<ReturnType<typeof load>>,
    options: { fresh?: boolean; latest: "force" | "wait" },
  ) {
    return await inspectMaintenance(
      {
        driver: loaded.driver,
        env: loaded.env,
        freshPlan: options.fresh,
        latestMode: options.latest,
        snapshot: loaded.snapshot,
        waitMs: 5_000,
      },
      inspectDeps(),
    );
  }

  async function toStatus(
    loaded: Awaited<ReturnType<typeof load>>,
    inspection: MaintenanceInspection,
  ): Promise<EngineMaintenanceStatus> {
    const record = runner().get(loaded.target);
    return {
      bundled: inspection.bundled,
      canUpdate: inspection.canUpdate,
      checkedAt:
        inspection.checkedAt === null
          ? null
          : new Date(inspection.checkedAt).toISOString(),
      currentVersion: inspection.currentVersion,
      driver: loaded.instance.driver,
      installed: loaded.snapshot.install.installed,
      installHint: inspection.installHint,
      installOptions: inspection.installOptions,
      installState: record?.installState ?? null,
      instanceId: loaded.instance.id,
      label: loaded.instance.label,
      latestVersion: inspection.latestVersion,
      running: record?.running ?? false,
      updateBlockedReason: inspection.updateBlockedReason,
      updateChecksEnabled: await inspectDeps().updateChecksEnabled(),
      updateCommand:
        inspection.plan?.kind === "command"
          ? inspection.plan.command.display
          : null,
      updateOwner:
        inspection.plan?.kind === "command" ? inspection.plan.ownerLabel : null,
      updateState: record?.updateState ?? null,
      versionStatus: inspection.versionStatus,
    };
  }

  /** Forget cached runtime state, end old runtimes, probe again. */
  async function reprobe(
    userId: string,
    loaded: Awaited<ReturnType<typeof load>>,
  ) {
    loaded.driver.invalidate?.({
      driver: loaded.instance.driver,
      id: loaded.instance.id,
    });
    await deps.disposeInstance(loaded.instance.id).catch(() => undefined);
    return await deps.snapshots().refresh(userId, loaded.instance.id, "update");
  }

  /** A program the command names, as an absolute path on the managed PATH. */
  async function resolveExecutable(
    executable: string,
    env: Record<string, string | undefined>,
  ) {
    if (path.isAbsolute(executable)) {
      return executable;
    }
    const found = await which(
      executable,
      await buildManagedExecutablePathValue(env.PATH, {
        env: env as NodeJS.ProcessEnv,
        platform,
      }),
    );
    if (!found) {
      throw new EngineMaintenanceError(
        `${executable} was not found on this machine.`,
        "unavailable",
      );
    }
    return found;
  }

  function busy(error: unknown): never {
    if (error instanceof MaintenanceBusyError) {
      throw new EngineMaintenanceError(error.message, "busy");
    }
    throw error;
  }

  const service: EngineMaintenanceService = {
    async cancel(userId, instanceId) {
      const loaded = await load(userId, instanceId);
      runner().cancel(loaded.target);
      // A queued operation is settled at once; a running one once its
      // process tree has ended.
      if (runner().isRunning(loaded.target)) {
        await runner().whenSettled(loaded.target);
      }
      return await toStatus(loaded, await inspect(loaded, { latest: "wait" }));
    },

    async checkForUpdate(userId, instanceId) {
      let loaded = await load(userId, instanceId);
      await inspect(loaded, { fresh: true, latest: "force" });
      // The snapshot (and every client) picks up the new advisory.
      const refreshed = await deps
        .snapshots()
        .refresh(userId, instanceId, "update");
      if (refreshed) {
        loaded = { ...loaded, snapshot: refreshed };
      }
      return await toStatus(loaded, await inspect(loaded, { latest: "wait" }));
    },

    async install(userId, instanceId, input) {
      const loaded = await load(userId, instanceId);
      const { driver, env, instance, snapshot } = loaded;
      if (snapshot.install.installed) {
        throw new EngineMaintenanceError(
          `${instance.label} is already installed.`,
          "changed",
        );
      }
      const definition = getEngineMaintenanceDefinition(driver);
      const inspection = await inspect(loaded, { fresh: true, latest: "wait" });
      const option = inspection.installOptions.find(
        (candidate) => candidate.id === input.optionId,
      );
      if (!definition || !option) {
        throw new EngineMaintenanceError(
          `This install option is not available for ${instance.label}.`,
          "unavailable",
        );
      }
      if (!option.available) {
        throw new EngineMaintenanceError(
          option.reason ?? "This install option is not available.",
          "unavailable",
        );
      }
      if ((input.expectedCommand ?? null) !== option.command) {
        throw new EngineMaintenanceError(
          "The install command changed. Review it again before installing.",
          "changed",
        );
      }

      const verify = async (): Promise<MaintenanceVerification> => {
        const after = await reprobe(userId, loaded);
        const version = after ? displayVersion(instance.driver, after) : null;
        return after?.install.installed
          ? {
              message: `${instance.label}${version ? ` ${version}` : ""} is installed.`,
              status: "succeeded",
            }
          : {
              message: `The installer finished, but Sentinel cannot find ${instance.label} yet. If it went to a new folder, set the binary path on the instance or restart Sentinel.`,
              status: "unchanged",
            };
      };

      try {
        if (
          option.id === MANAGED_INSTALL_OPTION_ID &&
          definition.managedInstall
        ) {
          const managed = definition.managedInstall;
          runner().runManaged({
            instanceId,
            label: instance.label,
            lockKey: `${instance.driver}-managed`,
            run: ({ onProgress, signal }) =>
              managed.run({ instance, onProgress, signal }),
            userId,
            verify,
          });
        } else {
          const choice = definition.install.find(
            (candidate) => candidate.id === option.id,
          )!;
          const tools: Record<string, string> = {};
          for (const tool of choice.requires) {
            tools[tool] = await resolveExecutable(tool, env);
          }
          const command = choice.command(tools);
          runner().runCommand({
            action: "install",
            args: command.args,
            display: command.display,
            env,
            executable: command.executable,
            instanceId,
            label: instance.label,
            // Installs through the same program (npm) run one at a time.
            lockKey: `install:${choice.requires[0] ?? choice.id}`,
            userId,
            verify,
          });
        }
      } catch (error) {
        busy(error);
      }
      return await toStatus(loaded, inspection);
    },

    async status(userId, instanceId) {
      const loaded = await load(userId, instanceId);
      return await toStatus(loaded, await inspect(loaded, { latest: "wait" }));
    },

    async update(userId, instanceId, input) {
      const loaded = await load(userId, instanceId);
      const { env, instance, snapshot } = loaded;
      if (!snapshot.install.installed) {
        throw new EngineMaintenanceError(
          `${instance.label} is not installed.`,
          "unavailable",
        );
      }
      // Ownership is derived again now: the command that runs matches the
      // binary as it is at click time, not at the last refresh.
      const inspection = await inspect(loaded, { fresh: true, latest: "wait" });
      const plan = inspection.plan;
      if (!inspection.canUpdate || plan?.kind !== "command") {
        throw new EngineMaintenanceError(
          inspection.updateBlockedReason ??
            `${instance.label} cannot be updated from Sentinel.`,
          "unavailable",
        );
      }
      if (input.expectedCommand !== plan.command.display) {
        throw new EngineMaintenanceError(
          "The update command changed. Review it again before updating.",
          "changed",
        );
      }

      const target = inspection.latestVersion;
      const executable = await resolveExecutable(plan.command.executable, env);
      try {
        runner().runCommand({
          action: "update",
          args: plan.command.args,
          display: plan.command.display,
          env: { ...env, ...plan.command.env },
          executable,
          instanceId,
          label: instance.label,
          lockKey: plan.command.lockKey,
          userId,
          verify: async () => {
            const after = await reprobe(userId, loaded);
            if (!after?.install.installed) {
              return {
                message: `The update finished, but Sentinel cannot find ${instance.label} anymore.`,
                status: "unchanged",
              };
            }
            const comparison = compareEngineVersions(
              instance.driver,
              after.install.version,
              target,
            );
            const version = displayVersion(instance.driver, after);
            return comparison !== null && comparison < 0
              ? {
                  message: `The update finished, but ${instance.label} still reports ${version}.`,
                  status: "unchanged",
                }
              : {
                  message: `${instance.label} updated${version ? ` to ${version}` : ""}.`,
                  status: "succeeded",
                };
          },
        });
      } catch (error) {
        busy(error);
      }
      return await toStatus(loaded, inspection);
    },
  };

  return service;
}

const globalForMaintenance = globalThis as unknown as {
  __sentinelEngineMaintenanceService?: EngineMaintenanceService;
};

/** The process-wide service, wired to the platform singletons. */
export function getEngineMaintenanceService(): EngineMaintenanceService {
  globalForMaintenance.__sentinelEngineMaintenanceService ??=
    createEngineMaintenanceService({
      disposeInstance: disposeInstanceResources,
      // Loaded on first use: the drivers pull in every engine's runtime.
      drivers: async (kind) =>
        (await import("../drivers")).getEngineDriver(kind),
      registry: getEngineInstanceRegistry,
      snapshots: getEngineSnapshotService,
    });
  return globalForMaintenance.__sentinelEngineMaintenanceService;
}
