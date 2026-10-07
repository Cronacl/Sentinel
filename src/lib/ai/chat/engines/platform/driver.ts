import "server-only";

import type { EngineDriverMeta } from "../catalog";
import type {
  BaseInstanceConfig,
  DriverKind,
  EngineCapabilities,
  EngineInstallSource,
  EngineModel,
  EngineProbeDepth,
  EngineProbeReason,
  EngineProbeResult,
  EngineSkill,
  EngineSlashCommand,
  EngineUsageLimits,
  ResolvedEngineInstance,
} from "../contract";

// The server half of an engine: what the platform needs to know about an
// instance of it. Drivers stay small and stateless: they probe, and the
// platform (snapshot-service.ts) owns caching, in-flight dedupe, timeouts,
// persistence, enrichment and change events. Long-lived processes belong in
// platform/instance-resources.ts. Static metadata, capabilities and the
// instance config schema live in the client-safe catalog (`meta`).
//
// Thread handlers (run/stop through the dispatcher), auth controllers and
// maintenance hooks are added to this interface by the phases that build
// those services (P10c dispatcher, P11 auth/maintenance).

export type ProbeOptions = {
  /**
   * cheap: resolve the binary and read its version; full: talk to the
   * runtime (models, account). The platform picks it from `reason`.
   */
  depth: EngineProbeDepth;
  forceRefresh: boolean;
  reason: EngineProbeReason;
  /** Aborted on timeout: a probe MUST stop and kill what it started. */
  signal: AbortSignal;
};

export type ResolvedEngineRuntime = {
  env: Record<string, string | undefined>;
  executablePath: string | null;
  realPath: string | null;
  source: EngineInstallSource | null;
  version: string | null;
};

export interface EngineDriver<
  C extends BaseInstanceConfig = BaseInstanceConfig,
> {
  readonly kind: DriverKind;
  /** DRIVER_CATALOG[kind]: label, transport, config schema, home env… */
  readonly meta: EngineDriverMeta;
  /** Static capabilities; a probe may narrow them (capabilityOverrides). */
  readonly capabilities: EngineCapabilities;
  /**
   * The platform aborts a probe after this long and serves the last
   * snapshot, marked stale.
   */
  readonly probeTimeoutMs: number;
  /** How long a snapshot stays fresh (default 15 s). */
  readonly snapshotTtlMs?: number;
  /**
   * How long a full probe's result is trusted before a cheap refresh
   * (interval, focus) is upgraded to a full one (default: snapshotTtlMs).
   * Drivers whose full probe spawns a process use minutes here.
   */
  readonly fullProbeTtlMs?: number;

  /** MUST NOT throw; MUST honour `signal`. */
  probe(
    instance: ResolvedEngineInstance<C>,
    options: ProbeOptions,
  ): Promise<EngineProbeResult>;
  resolveRuntime?(
    instance: ResolvedEngineInstance<C>,
    options: ProbeOptions,
  ): Promise<ResolvedEngineRuntime>;
  /** Cheaper than a full probe when only the model list is needed. */
  listModels?(
    instance: ResolvedEngineInstance<C>,
    options: ProbeOptions,
  ): Promise<EngineModel[]>;
  /**
   * Forget runtime and status caches (the instance changed or was
   * removed). Only the id and driver are known by then.
   */
  invalidate?(instance: Pick<ResolvedEngineInstance<C>, "driver" | "id">): void;
  /**
   * Optional deeper warm-up (an ACP `session/new`), scheduled by the
   * platform at most once a day per instance.
   */
  warm?(
    instance: ResolvedEngineInstance<C>,
    options: { signal: AbortSignal },
  ): Promise<void>;
  workspaceCatalog?(
    instance: ResolvedEngineInstance<C>,
    options: ProbeOptions & { cwd: string },
  ): Promise<{ skills: EngineSkill[]; slashCommands: EngineSlashCommand[] }>;
  usageLimits?: {
    read(
      instance: ResolvedEngineInstance<C>,
      options: { signal: AbortSignal },
    ): Promise<EngineUsageLimits>;
    ttlMs?: number;
  };
  /** End the instance's long-lived processes (removed or disabled). */
  dispose?(instance: Pick<ResolvedEngineInstance<C>, "id">): Promise<void>;
}

export function defineEngineDriver<C extends BaseInstanceConfig>(
  driver: EngineDriver<C>,
): EngineDriver<C> {
  return driver;
}

export const DEFAULT_SNAPSHOT_TTL_MS = 15_000;
