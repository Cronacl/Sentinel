import "server-only";

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  rm as nodeRm,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";

import { applyPrivateFsMode } from "@/lib/runtime/local-state";

import { getDriverMeta } from "../catalog";
import {
  computeEngineSnapshotUsable,
  mergeEngineUsageWindows,
  parseEngineSnapshot,
  type EngineCapabilities,
  type EngineInstanceSummary,
  type EngineProbeDepth,
  type EngineProbeReason,
  type EngineProbeResult,
  type EngineSnapshot,
  type EngineUsageWindow,
  type ResolvedEngineInstance,
} from "../contract";
import { DEFAULT_SNAPSHOT_TTL_MS, type EngineDriver } from "./driver";
import { getEngineDriver } from "./drivers";
import { emitEngineEvent, type EngineEventInput } from "./events";
import {
  disposeInstanceResources,
  retireInstanceResources,
} from "./instance-resources";
import {
  getEngineInstanceRegistry,
  subscribeToEngineInstanceChanges,
  type EngineInstanceChange,
  type EngineInstanceRegistry,
} from "./instances";
import { createUpdateStateEnricher } from "./maintenance/enricher";
import { getMaintenanceRunner } from "./maintenance/runner";
import {
  createCompatibilityEnricher,
  createCustomModelsEnricher,
  createManifestEnricher,
} from "./manifest/enrichers";
import { getInstanceRuntimeKey } from "./runtime/resolve-binary";

// One place that turns driver probes into the snapshots the UI, composer,
// automations and skills read (design/driver-contract.md §2, §6):
// - per-driver TTL and full/cheap probe cadence (a cheap probe gets the
//   last full result to carry forward), in-flight dedupe, and results
//   stored in the order their probes started;
// - a timeout that aborts the probe (drivers kill their children) and
//   serves the last snapshot, marked stale;
// - the last good snapshot persisted per instance
//   (<state root>/engines/<id>/status.json, 7 days), served stale on a
//   cold start until the first probe settles;
// - enrichment hooks (manifest, custom models, compatibility, update state,
//   usage) that P11 fills in, bounded by their own deadline;
// - the live install/update state laid over every snapshot it returns or
//   emits (never cached or persisted), so a refetch, reload or reconnect
//   shows a run in progress;
// - change events on the engine event bus.

const SNAPSHOT_FILE = "status.json";
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const STATE_DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const DEFAULT_STARTUP_CONCURRENCY = 2;
const DEFAULT_ENRICH_TIMEOUT_MS = 5_000;

/** Reasons that always ask the driver for a full probe. */
const FULL_PROBE_REASONS = new Set<EngineProbeReason>([
  "auth",
  "config-change",
  "run-error",
  "startup",
  "update",
  "user",
]);

export const ENGINE_SNAPSHOT_ENRICHER_IDS = [
  "manifest",
  "custom-models",
  "compatibility",
  "update-state",
  "usage",
] as const;

export type EngineSnapshotEnricherId =
  (typeof ENGINE_SNAPSHOT_ENRICHER_IDS)[number] | (string & {});

export type EngineSnapshotEnrichmentInput = {
  driver: EngineDriver;
  instance: ResolvedEngineInstance;
  /** The probe the snapshot was built from; null when it timed out. */
  probe: EngineProbeResult | null;
  snapshot: EngineSnapshot;
};

/**
 * Adds what the driver does not know to a fresh snapshot: manifest models
 * and classifications, the instance's custom models, version and
 * compatibility advisories, update state, usage limits. Must not throw (a
 * failing enricher is skipped). Enrichment as a whole has a deadline
 * (`enrichTimeoutMs`): `signal` aborts when it passes, the remaining
 * enrichers are skipped and the snapshot keeps what finished in time.
 */
export type EngineSnapshotEnricher = {
  enrich(
    input: EngineSnapshotEnrichmentInput,
    options: { signal: AbortSignal },
  ): EngineSnapshot | Promise<EngineSnapshot>;
  id: EngineSnapshotEnricherId;
};

function passthroughEnricher(
  id: EngineSnapshotEnricherId,
): EngineSnapshotEnricher {
  return { enrich: ({ snapshot }) => snapshot, id };
}

/**
 * The platform's enrichers, in the order they run (one per
 * ENGINE_SNAPSHOT_ENRICHER_IDS entry). Hooks no service fills yet pass the
 * snapshot through.
 */
export const DEFAULT_ENGINE_SNAPSHOT_ENRICHERS: readonly EngineSnapshotEnricher[] =
  [
    createManifestEnricher(),
    createCustomModelsEnricher(),
    createCompatibilityEnricher(),
    createUpdateStateEnricher(),
    passthroughEnricher("usage"),
  ];

export type EngineSnapshotClock = {
  clearTimeout(handle: unknown): void;
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
};

export type EngineSnapshotFs = {
  mkdir(
    target: string,
    options: { mode: number; recursive: true },
  ): Promise<unknown>;
  readFile(target: string, encoding: "utf8"): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  rm(target: string, options: { force: true }): Promise<void>;
  writeFile(
    target: string,
    data: string,
    options: { encoding: "utf8"; mode: number },
  ): Promise<void>;
};

export type EngineSnapshotServiceDeps = {
  clock?: EngineSnapshotClock;
  /** Driver lookup by kind (default: platform/drivers.ts). */
  drivers?: (kind: string) => EngineDriver | null;
  enrichers?: readonly EngineSnapshotEnricher[];
  /** Deadline for all enrichers of one snapshot (default 5 s). */
  enrichTimeoutMs?: number;
  /** Ends an instance's long-lived processes (default: instance resources). */
  disposeInstance?: (instanceId: string) => Promise<void>;
  /** An instance's live install/update state (default: maintenance runner). */
  maintenanceState?: (
    userId: string,
    instanceId: string,
  ) => Partial<Pick<EngineSnapshot, "installState" | "updateState">> | null;
  emit?: (event: EngineEventInput) => void;
  fs?: EngineSnapshotFs;
  /**
   * Ends an instance's runtimes for configurations other than `keepKey`
   * (default: instance resources).
   */
  retireInstance?: (instanceId: string, keepKey: string) => Promise<void>;
  onError?: (
    error: unknown,
    context: { instanceId: string; stage: string },
  ) => void;
  registry: Pick<EngineInstanceRegistry, "get" | "list" | "listSummaries">;
};

export type SnapshotRequestOptions = {
  depth?: EngineProbeDepth;
  forceRefresh?: boolean;
  reason?: EngineProbeReason;
};

export interface EngineSnapshotService {
  /**
   * Every instance's snapshot without waiting on probes: the cached one,
   * else the last persisted one (stale), else `checking`. Missing or
   * expired snapshots are probed in the background.
   */
  peekAll(userId: string): Promise<EngineSnapshot[]>;
  /** Every instance's snapshot, probing whatever is missing or expired. */
  getAll(
    userId: string,
    options?: SnapshotRequestOptions,
  ): Promise<EngineSnapshot[]>;
  /** One instance's snapshot (null for an unknown id). */
  getSnapshot(
    userId: string,
    instanceId: string,
    options?: SnapshotRequestOptions,
  ): Promise<EngineSnapshot | null>;
  /** Probes now (forced) and resolves the new snapshot. */
  refresh(
    userId: string,
    instanceId: string,
    reason?: EngineProbeReason,
  ): Promise<EngineSnapshot | null>;
  /** Forget cached probes (one instance, or all). */
  invalidate(instanceId?: string): void;
  /** Sparse usage-limit update from a run (rate-limit events). */
  reportUsageLimits(
    userId: string,
    instanceId: string,
    windows: readonly EngineUsageWindow[],
  ): void;
  /**
   * Startup policy: probe only instances that are enabled, were installed
   * and usable at their last persisted probe, `concurrency` at a time.
   */
  probeAtStartup(
    userId: string,
    options?: { concurrency?: number },
  ): Promise<void>;
  /** React to an instance change (the registry's change listener). */
  handleInstanceChange(change: EngineInstanceChange): void;
}

type CachedProbe = {
  checkedAt: number;
  fullCheckedAt: number | null;
  /** The last full probe's own result, carried forward by cheap probes. */
  fullResult: EngineProbeResult | null;
  runtimeKey: string;
  snapshot: EngineSnapshot;
};

type Entry = {
  cached: CachedProbe | null;
  driverKind: string;
  generation: number;
  inFlight: {
    forced: boolean;
    generation: number;
    promise: Promise<EngineSnapshot>;
  } | null;
  instanceId: string;
  /** Persists run one after another, newest result last. */
  persistQueue: Promise<void>;
  persistedLoaded: boolean;
  /** Sequence of the last probe started, and of the last result stored. */
  probeSeq: number;
  storedSeq: number;
  userId: string;
};

type PersistedSnapshot = {
  runtimeKey: string;
  savedAt: string;
  snapshot: unknown;
  version: 1;
};

const nodeFs: EngineSnapshotFs = {
  mkdir: (target, options) => nodeMkdir(target, options),
  readFile: (target, encoding) => nodeReadFile(target, encoding),
  rename: (from, to) => nodeRename(from, to),
  rm: (target, options) => nodeRm(target, options),
  writeFile: (target, data, options) => nodeWriteFile(target, data, options),
};

const systemClock: EngineSnapshotClock = {
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
};

const NO_AUTH: EngineSnapshot["auth"] = {
  canLogin: false,
  canLogout: false,
  email: null,
  label: null,
  method: null,
  plan: null,
  status: "unknown",
};

/** For instances whose driver this build does not know: nothing is offered. */
const NO_CAPABILITIES: EngineCapabilities = {
  messageActions: {
    edit: false,
    planAnswers: false,
    regenerate: false,
    retry: false,
  },
  permissionModes: [],
  planModeChangeRequiresNewSession: false,
  reportsContextWindow: false,
  reportsNativeSkills: false,
  reportsSlashCommands: false,
  reportsUsageLimits: false,
  supportsApprovals: false,
  supportsConversationRollback: false,
  supportsCustomModels: false,
  supportsFork: false,
  supportsImages: false,
  supportsMcpInjection: false,
  supportsMultipleInstances: false,
  supportsPlanMode: false,
  supportsResume: false,
  supportsSteer: false,
  supportsTextGeneration: false,
  supportsUnattendedTools: false,
  supportsUserInput: false,
};

const UNAVAILABLE_MESSAGES: Record<
  NonNullable<EngineInstanceSummary["unavailableReason"]>,
  (label: string) => string
> = {
  "config-invalid": (label) => `${label} has an invalid configuration.`,
  disabled: (label) => `${label} is disabled.`,
  "driver-mismatch": (label) => `${label} has an invalid configuration.`,
  "driver-planned": (label) =>
    `${label} is not available in this version of Sentinel yet.`,
  "driver-unknown": (label) =>
    `${label} uses an engine this version of Sentinel does not know.`,
  missing: (label) => `${label} no longer exists.`,
  "no-default-instance": (label) => `${label} needs an instance to be added.`,
};

const NOT_INSTALLED: EngineSnapshot["install"] = {
  installed: false,
  path: null,
  source: null,
  version: null,
};

function toIso(time: number) {
  return new Date(time).toISOString();
}

/**
 * Snapshots compared without their probe times, so an unchanged re-probe
 * emits nothing.
 */
function snapshotSignature(snapshot: EngineSnapshot) {
  const {
    checkedAt: _checkedAt,
    lastSuccessfulProbeAt: _lastSuccessfulProbeAt,
    ...rest
  } = snapshot;
  return JSON.stringify(rest);
}

function mergeCapabilities(
  base: EngineCapabilities,
  overrides: Partial<EngineCapabilities> | undefined,
): EngineCapabilities {
  return overrides ? { ...base, ...overrides } : base;
}

type InstanceIdentity = Pick<
  EngineSnapshot,
  | "accentColor"
  | "description"
  | "driver"
  | "enabled"
  | "instanceId"
  | "isDefaultInstance"
  | "label"
>;

function identityOf(
  instance: Pick<
    ResolvedEngineInstance,
    "accentColor" | "driver" | "enabled" | "id" | "isDefault" | "label"
  >,
): InstanceIdentity {
  return {
    accentColor: instance.accentColor,
    description: getDriverMeta(instance.driver)?.description ?? "",
    driver: instance.driver,
    enabled: instance.enabled,
    instanceId: instance.id,
    isDefaultInstance: instance.isDefault,
    label: instance.label,
  };
}

function baseSnapshot(
  identity: InstanceIdentity,
  capabilities: EngineCapabilities,
): EngineSnapshot {
  const meta = getDriverMeta(identity.driver);
  return {
    ...identity,
    auth: NO_AUTH,
    availability: "available",
    badgeLabel: null,
    capabilities,
    checkedAt: null,
    compatibilityAdvisory: null,
    defaultModelId: null,
    iconUrl: null,
    install: NOT_INSTALLED,
    installState: null,
    lastSuccessfulProbeAt: null,
    message: null,
    models: [],
    runtimePaths: null,
    setup: {
      canAuthenticate: false,
      canInstall: false,
      canUpdate: false,
      docsUrl: meta?.docsUrl ?? null,
      installHint: null,
    },
    skills: [],
    slashCommands: [],
    stale: false,
    status: "checking",
    unavailableReason: null,
    updateState: null,
    usable: false,
    usageLimits: null,
    versionAdvisory: null,
  };
}

function withUsable(snapshot: EngineSnapshot): EngineSnapshot {
  return { ...snapshot, usable: computeEngineSnapshotUsable(snapshot) };
}

/** The snapshot of an instance that cannot be used at all. */
export function buildUnavailableSnapshot(
  summary: Pick<
    EngineInstanceSummary,
    "accentColor" | "driver" | "enabled" | "id" | "isDefault" | "label"
  >,
  message: string,
): EngineSnapshot {
  const meta = getDriverMeta(summary.driver);
  return {
    ...baseSnapshot(
      identityOf({ ...summary }),
      meta?.capabilities ?? NO_CAPABILITIES,
    ),
    availability: "unavailable",
    message,
    status: "error",
    unavailableReason: message,
    usable: false,
  };
}

function buildProbedSnapshot(input: {
  checkedAt: number;
  driver: EngineDriver;
  instance: ResolvedEngineInstance;
  previous: EngineSnapshot | null;
  result: EngineProbeResult;
}): EngineSnapshot {
  const { driver, instance, result } = input;
  const now = toIso(input.checkedAt);
  const succeeded =
    result.install.installed &&
    (result.status === "ready" || result.status === "warning") &&
    !result.stale;

  return withUsable({
    ...baseSnapshot(identityOf(instance), driver.capabilities),
    auth: result.auth,
    capabilities: mergeCapabilities(
      driver.capabilities,
      result.capabilityOverrides,
    ),
    checkedAt: now,
    compatibilityAdvisory: result.compatibilityAdvisory ?? null,
    defaultModelId:
      result.defaultModelId ??
      result.models.find((model) => model.isDefault)?.id ??
      null,
    iconUrl: result.iconUrl ?? null,
    install: result.install,
    lastSuccessfulProbeAt: succeeded
      ? now
      : (input.previous?.lastSuccessfulProbeAt ?? null),
    message: result.message ?? null,
    models: result.models,
    runtimePaths: {
      homePath:
        (driver.meta.homeEnvVar
          ? instance.envOverrides[driver.meta.homeEnvVar]
          : null) ??
        instance.config.homePath ??
        null,
    },
    skills: result.skills ?? [],
    slashCommands: result.slashCommands ?? [],
    stale: result.stale ?? false,
    status: result.status,
    usageLimits: result.usageLimits ?? input.previous?.usageLimits ?? null,
  });
}

/** A probe that did not answer in time: the last snapshot, stale. */
function buildTimedOutSnapshot(input: {
  checkedAt: number;
  driver: EngineDriver;
  instance: ResolvedEngineInstance;
  previous: EngineSnapshot | null;
  timeoutMs: number;
}): EngineSnapshot {
  const message = `${input.instance.label} did not answer within ${Math.round(
    input.timeoutMs / 1_000,
  )} s.`;
  if (input.previous) {
    return withUsable({
      ...input.previous,
      ...identityOf(input.instance),
      checkedAt: toIso(input.checkedAt),
      message,
      stale: true,
    });
  }

  return withUsable({
    ...baseSnapshot(identityOf(input.instance), input.driver.capabilities),
    checkedAt: toIso(input.checkedAt),
    message,
    stale: true,
    status: "error",
  });
}

function buildFailedSnapshot(input: {
  checkedAt: number;
  driver: EngineDriver;
  error: unknown;
  instance: ResolvedEngineInstance;
  previous: EngineSnapshot | null;
}): EngineSnapshot {
  return withUsable({
    ...baseSnapshot(identityOf(input.instance), input.driver.capabilities),
    checkedAt: toIso(input.checkedAt),
    install: input.previous?.install ?? NOT_INSTALLED,
    lastSuccessfulProbeAt: input.previous?.lastSuccessfulProbeAt ?? null,
    message:
      input.error instanceof Error
        ? input.error.message
        : `${input.instance.label} could not be checked.`,
    status: "error",
  });
}

function overlayIdentity(
  snapshot: EngineSnapshot,
  instance: ResolvedEngineInstance,
): EngineSnapshot {
  return withUsable({ ...snapshot, ...identityOf(instance) });
}

function buildDisabledSnapshot(
  instance: ResolvedEngineInstance,
  driver: EngineDriver,
  previous: EngineSnapshot | null,
): EngineSnapshot {
  return withUsable({
    ...(previous ?? baseSnapshot(identityOf(instance), driver.capabilities)),
    ...identityOf(instance),
    message: null,
    status: "disabled",
  });
}

export function createEngineSnapshotService(
  deps: EngineSnapshotServiceDeps,
): EngineSnapshotService {
  const clock = deps.clock ?? systemClock;
  const fs = deps.fs ?? nodeFs;
  const drivers = deps.drivers ?? getEngineDriver;
  const enrichers = deps.enrichers ?? DEFAULT_ENGINE_SNAPSHOT_ENRICHERS;
  const emit = deps.emit ?? ((event) => void emitEngineEvent(event));
  const disposeInstance = deps.disposeInstance ?? disposeInstanceResources;
  const retireInstance = deps.retireInstance ?? retireInstanceResources;
  const enrichTimeoutMs = deps.enrichTimeoutMs ?? DEFAULT_ENRICH_TIMEOUT_MS;
  const maintenanceState =
    deps.maintenanceState ??
    ((userId: string, instanceId: string) =>
      getMaintenanceRunner().get({ instanceId, userId }));
  const entries = new Map<string, Entry>();

  /** The snapshot with the instance's install/update state as it is now. */
  function withMaintenance(
    userId: string,
    snapshot: EngineSnapshot,
  ): EngineSnapshot {
    const state = maintenanceState(userId, snapshot.instanceId);
    const installState = state?.installState ?? null;
    const updateState = state?.updateState ?? null;
    return snapshot.installState === installState &&
      snapshot.updateState === updateState
      ? snapshot
      : { ...snapshot, installState, updateState };
  }

  const reportError = (
    error: unknown,
    context: { instanceId: string; stage: string },
  ) => {
    try {
      deps.onError?.(error, context);
    } catch {
      // Reporting must never break a probe.
    }
  };

  function entryKey(userId: string, instanceId: string) {
    return `${userId}\u0000${instanceId}`;
  }

  function getEntry(userId: string, instanceId: string, driverKind: string) {
    const key = entryKey(userId, instanceId);
    let entry = entries.get(key);
    if (!entry || entry.driverKind !== driverKind) {
      entry = {
        cached: null,
        driverKind,
        generation: 0,
        inFlight: null,
        instanceId,
        persistQueue: Promise.resolve(),
        persistedLoaded: false,
        probeSeq: 0,
        storedSeq: 0,
        userId,
      };
      entries.set(key, entry);
    }
    return entry;
  }

  function snapshotPath(instance: Pick<ResolvedEngineInstance, "stateDir">) {
    return path.join(instance.stateDir, SNAPSHOT_FILE);
  }

  async function loadPersisted(entry: Entry, instance: ResolvedEngineInstance) {
    if (entry.persistedLoaded) {
      return;
    }
    entry.persistedLoaded = true;

    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(snapshotPath(instance), "utf8"));
    } catch {
      return;
    }

    const persisted = raw as Partial<PersistedSnapshot> | null;
    const savedAt = Date.parse(String(persisted?.savedAt ?? ""));
    const snapshot = parseEngineSnapshot(persisted?.snapshot);
    if (
      persisted?.version !== 1 ||
      !snapshot ||
      !Number.isFinite(savedAt) ||
      clock.now() - savedAt > SNAPSHOT_MAX_AGE_MS ||
      persisted.runtimeKey !== getInstanceRuntimeKey(instance) ||
      entry.cached
    ) {
      return;
    }

    // Served stale until this process probes the instance itself; expired
    // so the first read schedules that probe.
    entry.cached = {
      checkedAt: Number.NEGATIVE_INFINITY,
      fullCheckedAt: null,
      fullResult: null,
      runtimeKey: persisted.runtimeKey,
      snapshot: { ...snapshot, stale: true },
    };
  }

  async function persist(
    instance: ResolvedEngineInstance,
    snapshot: EngineSnapshot,
  ) {
    const filePath = snapshotPath(instance);
    const directory = path.dirname(filePath);
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    const payload: PersistedSnapshot = {
      runtimeKey: getInstanceRuntimeKey(instance),
      savedAt: toIso(clock.now()),
      snapshot,
      version: 1,
    };

    try {
      await fs.mkdir(directory, {
        mode: STATE_DIRECTORY_MODE,
        recursive: true,
      });
      await applyPrivateFsMode(directory, STATE_DIRECTORY_MODE);
      await fs.writeFile(
        temporaryPath,
        `${JSON.stringify(payload, null, 2)}\n`,
        {
          encoding: "utf8",
          mode: FILE_MODE,
        },
      );
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      reportError(error, { instanceId: instance.id, stage: "persist" });
    }
  }

  /**
   * Runs the enrichers in order within `enrichTimeoutMs`. A hung enricher
   * cannot hold the probe (and every caller sharing it): at the deadline
   * the signal aborts and the snapshot keeps what finished in time.
   */
  async function enrich(input: EngineSnapshotEnrichmentInput) {
    const controller = new AbortController();
    let current = input.snapshot;
    let timer: unknown = null;
    const deadline = new Promise<void>((resolve) => {
      timer = clock.setTimeout(() => {
        controller.abort(new Error("Engine snapshot enrichment timed out."));
        reportError(controller.signal.reason, {
          instanceId: input.instance.id,
          stage: "enrich",
        });
        resolve();
      }, enrichTimeoutMs);
    });
    const work = (async () => {
      for (const enricher of enrichers) {
        if (controller.signal.aborted) {
          return;
        }
        try {
          const next = await enricher.enrich(
            { ...input, snapshot: current },
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) {
            current = next;
          }
        } catch (error) {
          reportError(error, {
            instanceId: input.instance.id,
            stage: `enrich:${enricher.id}`,
          });
        }
      }
    })();

    try {
      await Promise.race([work, deadline]);
    } finally {
      if (timer !== null) {
        clock.clearTimeout(timer);
      }
    }
    return withUsable(current);
  }

  function store(entry: Entry, cached: CachedProbe) {
    const previous = entry.cached?.snapshot ?? null;
    entry.cached = cached;
    if (
      !previous ||
      snapshotSignature(previous) !== snapshotSignature(cached.snapshot)
    ) {
      emit({
        snapshot: withMaintenance(entry.userId, cached.snapshot),
        type: "snapshot",
      });
    }
  }

  function chooseDepth(
    entry: Entry,
    driver: EngineDriver,
    options: SnapshotRequestOptions,
  ): EngineProbeDepth {
    if (options.depth) {
      return options.depth;
    }
    const reason = options.reason ?? "user";
    if (options.forceRefresh || FULL_PROBE_REASONS.has(reason)) {
      return "full";
    }
    const fullTtl =
      driver.fullProbeTtlMs ?? driver.snapshotTtlMs ?? DEFAULT_SNAPSHOT_TTL_MS;
    const fullCheckedAt = entry.cached?.fullCheckedAt ?? null;
    return fullCheckedAt !== null &&
      entry.cached?.fullResult &&
      clock.now() - fullCheckedAt < fullTtl
      ? "cheap"
      : "full";
  }

  async function runProbe(
    entry: Entry,
    driver: EngineDriver,
    instance: ResolvedEngineInstance,
    options: SnapshotRequestOptions,
  ): Promise<EngineSnapshot> {
    const generation = entry.generation;
    entry.probeSeq += 1;
    const seq = entry.probeSeq;
    const depth = chooseDepth(entry, driver, options);
    const previous = entry.cached?.snapshot ?? null;
    const previousFull =
      depth === "cheap" ? (entry.cached?.fullResult ?? null) : null;
    const controller = new AbortController();
    const startedAt = clock.now();
    let timer: unknown = null;

    const timedOut = new Promise<"timeout">((resolve) => {
      timer = clock.setTimeout(() => {
        controller.abort(new Error("Engine probe timed out."));
        resolve("timeout");
      }, driver.probeTimeoutMs);
    });

    let outcome: EngineProbeResult | "timeout" | { error: unknown };
    try {
      outcome = await Promise.race([
        // A driver that throws synchronously is a failed probe too.
        Promise.resolve()
          .then(() =>
            driver.probe(instance, {
              depth,
              forceRefresh: options.forceRefresh ?? false,
              previous: previousFull,
              reason: options.reason ?? "user",
              signal: controller.signal,
            }),
          )
          .catch((error: unknown) => ({ error })),
        timedOut,
      ]);
    } finally {
      if (timer !== null) {
        clock.clearTimeout(timer);
      }
    }

    const checkedAt = clock.now();
    let probe: EngineProbeResult | null = null;
    let snapshot: EngineSnapshot;
    if (outcome === "timeout") {
      snapshot = buildTimedOutSnapshot({
        checkedAt,
        driver,
        instance,
        previous,
        timeoutMs: driver.probeTimeoutMs,
      });
    } else if ("error" in outcome) {
      reportError(outcome.error, { instanceId: instance.id, stage: "probe" });
      snapshot = buildFailedSnapshot({
        checkedAt,
        driver,
        error: outcome.error,
        instance,
        previous,
      });
    } else {
      probe = outcome;
      snapshot = buildProbedSnapshot({
        checkedAt,
        driver,
        instance,
        previous,
        result: outcome,
      });
    }

    snapshot = await enrich({ driver, instance, probe, snapshot });

    if (entry.generation !== generation) {
      // Invalidated while probing (the instance changed): the result
      // describes an older configuration.
      return snapshot;
    }

    if (seq < entry.storedSeq) {
      // A probe that started later (a forced refresh after a login) has
      // already stored its answer; this older one must not replace it.
      return entry.cached
        ? overlayIdentity(entry.cached.snapshot, instance)
        : snapshot;
    }
    entry.storedSeq = seq;

    const fullProbe = probe !== null && depth === "full";
    store(entry, {
      checkedAt,
      fullCheckedAt: fullProbe
        ? startedAt
        : (entry.cached?.fullCheckedAt ?? null),
      fullResult: fullProbe ? probe : (entry.cached?.fullResult ?? null),
      runtimeKey: getInstanceRuntimeKey(instance),
      snapshot,
    });

    if (
      probe &&
      snapshot.install.installed &&
      (snapshot.status === "ready" || snapshot.status === "warning") &&
      !snapshot.stale
    ) {
      // One write at a time per instance, skipped once a newer result was
      // stored, so the file never ends up older than the cache.
      entry.persistQueue = entry.persistQueue.then(() =>
        entry.storedSeq === seq && entry.generation === generation
          ? persist(instance, snapshot)
          : undefined,
      );
      await entry.persistQueue;
    }

    return snapshot;
  }

  function probe(
    entry: Entry,
    driver: EngineDriver,
    instance: ResolvedEngineInstance,
    options: SnapshotRequestOptions,
  ) {
    const forced = options.forceRefresh ?? false;
    const inFlight = entry.inFlight;
    if (
      inFlight &&
      inFlight.generation === entry.generation &&
      (!forced || inFlight.forced)
    ) {
      return inFlight.promise;
    }

    const promise = runProbe(entry, driver, instance, options).finally(() => {
      if (entry.inFlight?.promise === promise) {
        entry.inFlight = null;
      }
    });
    entry.inFlight = { forced, generation: entry.generation, promise };
    return promise;
  }

  function isFresh(
    entry: Entry,
    driver: EngineDriver,
    instance: ResolvedEngineInstance,
  ) {
    const cached = entry.cached;
    return (
      cached !== null &&
      cached.runtimeKey === getInstanceRuntimeKey(instance) &&
      clock.now() - cached.checkedAt <
        (driver.snapshotTtlMs ?? DEFAULT_SNAPSHOT_TTL_MS)
    );
  }

  type Resolved =
    | { kind: "missing" }
    | { kind: "unavailable"; snapshot: EngineSnapshot }
    | { driver: EngineDriver; instance: ResolvedEngineInstance; kind: "ok" };

  async function resolveInstance(
    userId: string,
    instanceId: string,
  ): Promise<Resolved> {
    const lookup = await deps.registry.get(userId, instanceId);
    if (!lookup) {
      return { kind: "missing" };
    }

    if (lookup.status === "unavailable") {
      return {
        kind: "unavailable",
        snapshot: buildUnavailableSnapshot(
          {
            accentColor: null,
            driver: lookup.instance.driver,
            enabled: true,
            id: lookup.instance.id,
            isDefault: false,
            label: lookup.instance.label,
          },
          lookup.instance.message,
        ),
      };
    }

    const driver = drivers(lookup.instance.driver);
    if (!driver) {
      return {
        kind: "unavailable",
        snapshot: buildUnavailableSnapshot(
          { ...lookup.instance },
          UNAVAILABLE_MESSAGES["driver-planned"](lookup.instance.label),
        ),
      };
    }

    return { driver, instance: lookup.instance, kind: "ok" };
  }

  async function snapshotFor(
    userId: string,
    resolved: Extract<Resolved, { kind: "ok" }>,
    options: SnapshotRequestOptions & { wait: boolean },
  ): Promise<EngineSnapshot> {
    return withMaintenance(
      userId,
      await cachedOrProbed(userId, resolved, options),
    );
  }

  async function cachedOrProbed(
    userId: string,
    resolved: Extract<Resolved, { kind: "ok" }>,
    options: SnapshotRequestOptions & { wait: boolean },
  ): Promise<EngineSnapshot> {
    const { driver, instance } = resolved;
    const entry = getEntry(userId, instance.id, driver.kind);
    await loadPersisted(entry, instance);
    const previous = entry.cached?.snapshot ?? null;

    if (!instance.enabled) {
      return buildDisabledSnapshot(instance, driver, previous);
    }

    if (!options.forceRefresh && isFresh(entry, driver, instance)) {
      return overlayIdentity(entry.cached!.snapshot, instance);
    }

    const pending = probe(entry, driver, instance, options);
    if (options.wait) {
      return overlayIdentity(await pending, instance);
    }

    void pending.catch((error: unknown) =>
      reportError(error, { instanceId: instance.id, stage: "background" }),
    );
    if (
      previous &&
      entry.cached?.runtimeKey === getInstanceRuntimeKey(instance)
    ) {
      return overlayIdentity(previous, instance);
    }
    return overlayIdentity(
      baseSnapshot(identityOf(instance), driver.capabilities),
      instance,
    );
  }

  async function listResolved(userId: string): Promise<Resolved[]> {
    const [summaries, instances] = await Promise.all([
      deps.registry.listSummaries(userId),
      deps.registry.list(userId),
    ]);
    const byId = new Map(instances.map((instance) => [instance.id, instance]));

    return summaries.map((summary): Resolved => {
      const instance = byId.get(summary.id);
      if (summary.availability === "unavailable" || !instance) {
        const reason = summary.unavailableReason ?? "config-invalid";
        return {
          kind: "unavailable",
          snapshot: buildUnavailableSnapshot(
            summary,
            UNAVAILABLE_MESSAGES[reason](summary.label),
          ),
        };
      }

      const driver = drivers(instance.driver);
      return driver
        ? { driver, instance, kind: "ok" }
        : {
            kind: "unavailable",
            snapshot: buildUnavailableSnapshot(
              summary,
              UNAVAILABLE_MESSAGES["driver-planned"](summary.label),
            ),
          };
    });
  }

  const service: EngineSnapshotService = {
    async getAll(userId, options = {}) {
      const resolved = await listResolved(userId);
      const snapshots = await Promise.all(
        resolved.map((item) =>
          item.kind === "ok"
            ? snapshotFor(userId, item, { ...options, wait: true })
            : item.kind === "unavailable"
              ? item.snapshot
              : null,
        ),
      );
      return snapshots.filter(
        (snapshot): snapshot is EngineSnapshot => snapshot !== null,
      );
    },

    async getSnapshot(userId, instanceId, options = {}) {
      const resolved = await resolveInstance(userId, instanceId);
      if (resolved.kind === "missing") {
        return null;
      }
      if (resolved.kind === "unavailable") {
        return resolved.snapshot;
      }
      return await snapshotFor(userId, resolved, { ...options, wait: true });
    },

    handleInstanceChange(change) {
      for (const entry of [...entries.values()]) {
        if (entry.instanceId !== change.instanceId) {
          continue;
        }

        entry.generation += 1;
        entry.inFlight = null;
        entry.cached = null;
        entry.persistedLoaded = false;
        drivers(entry.driverKind)?.invalidate?.({
          driver: entry.driverKind,
          id: entry.instanceId,
        });

        if (change.type === "removed") {
          entries.delete(entryKey(entry.userId, entry.instanceId));
          continue;
        }

        // Re-probe what a client is looking at: the new configuration, or
        // the disabled state (which also ends the instance's processes).
        // Runtimes started for the old configuration end here, not when a
        // caller first asks for the new one.
        void (async () => {
          const resolved = await resolveInstance(
            entry.userId,
            entry.instanceId,
          );
          if (resolved.kind === "ok" && !resolved.instance.enabled) {
            await disposeInstance(entry.instanceId);
          } else if (resolved.kind === "ok") {
            await retireInstance(
              entry.instanceId,
              getInstanceRuntimeKey(resolved.instance),
            );
          }
          if (resolved.kind === "ok") {
            const snapshot = await snapshotFor(entry.userId, resolved, {
              reason: "config-change",
              wait: true,
            });
            if (!resolved.instance.enabled) {
              emit({ snapshot, type: "snapshot" });
            }
          } else if (resolved.kind === "unavailable") {
            emit({ snapshot: resolved.snapshot, type: "snapshot" });
          }
        })().catch((error: unknown) =>
          reportError(error, {
            instanceId: entry.instanceId,
            stage: "instance-change",
          }),
        );
      }

      if (change.type === "removed") {
        void disposeInstance(change.instanceId).catch((error: unknown) =>
          reportError(error, {
            instanceId: change.instanceId,
            stage: "dispose",
          }),
        );
        emit({ instanceId: change.instanceId, type: "snapshot-removed" });
      }
    },

    invalidate(instanceId) {
      for (const entry of entries.values()) {
        if (instanceId && entry.instanceId !== instanceId) {
          continue;
        }
        entry.generation += 1;
        entry.inFlight = null;
        if (entry.cached) {
          // Forgotten probes include the full one a cheap probe would
          // carry forward: the next probe is full.
          entry.cached = {
            ...entry.cached,
            checkedAt: Number.NEGATIVE_INFINITY,
            fullCheckedAt: null,
            fullResult: null,
          };
        }
      }
    },

    async peekAll(userId) {
      const resolved = await listResolved(userId);
      const snapshots = await Promise.all(
        resolved.map((item) =>
          item.kind === "ok"
            ? snapshotFor(userId, item, { reason: "interval", wait: false })
            : item.kind === "unavailable"
              ? item.snapshot
              : null,
        ),
      );
      return snapshots.filter(
        (snapshot): snapshot is EngineSnapshot => snapshot !== null,
      );
    },

    async probeAtStartup(userId, options = {}) {
      const concurrency = Math.max(
        1,
        options.concurrency ?? DEFAULT_STARTUP_CONCURRENCY,
      );
      const candidates: Array<Extract<Resolved, { kind: "ok" }>> = [];
      for (const item of await listResolved(userId)) {
        if (item.kind !== "ok" || !item.instance.enabled) {
          continue;
        }
        const entry = getEntry(userId, item.instance.id, item.driver.kind);
        await loadPersisted(entry, item.instance);
        const last = entry.cached?.snapshot;
        if (last?.install.installed && last.usable) {
          candidates.push(item);
        }
      }

      let next = 0;
      const workers = Array.from(
        { length: Math.min(concurrency, candidates.length) },
        async () => {
          while (next < candidates.length) {
            const item = candidates[next++]!;
            await snapshotFor(userId, item, {
              reason: "startup",
              wait: true,
            }).catch((error: unknown) =>
              reportError(error, {
                instanceId: item.instance.id,
                stage: "startup",
              }),
            );
          }
        },
      );
      await Promise.all(workers);
    },

    async refresh(userId, instanceId, reason = "user") {
      return await service.getSnapshot(userId, instanceId, {
        forceRefresh: true,
        reason,
      });
    },

    reportUsageLimits(userId, instanceId, windows) {
      const entry = [...entries.values()].find(
        (candidate) =>
          candidate.userId === userId && candidate.instanceId === instanceId,
      );
      if (!entry?.cached || windows.length === 0) {
        return;
      }

      const current = entry.cached.snapshot.usageLimits;
      store(entry, {
        ...entry.cached,
        snapshot: {
          ...entry.cached.snapshot,
          usageLimits: {
            ...(current ?? {}),
            checkedAt: toIso(clock.now()),
            windows: mergeEngineUsageWindows(current?.windows ?? [], windows),
          },
        },
      });
    },
  };

  return service;
}

const globalForSnapshots = globalThis as unknown as {
  __sentinelEngineSnapshotService?: EngineSnapshotService;
};

/**
 * The process-wide service, wired to the instance registry and its change
 * notifications (on globalThis so dev-server module copies share it).
 */
export function getEngineSnapshotService(): EngineSnapshotService {
  if (!globalForSnapshots.__sentinelEngineSnapshotService) {
    const service = createEngineSnapshotService({
      registry: getEngineInstanceRegistry(),
    });
    subscribeToEngineInstanceChanges((change) =>
      service.handleInstanceChange(change),
    );
    globalForSnapshots.__sentinelEngineSnapshotService = service;
  }
  return globalForSnapshots.__sentinelEngineSnapshotService;
}
