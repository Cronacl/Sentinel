import "server-only";

import type { ThreadChatRequest, ThreadChatTrigger } from "../../types";
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
// Thread handlers run and stop a thread's turns for drivers whose runtime
// owns the run (every external engine); the built-in engine has none and
// runs through the orchestrator. Auth controllers and maintenance hooks are
// added by the phases that build those services (P11).

export type ProbeOptions = {
  /**
   * cheap: resolve the binary and read its version; full: talk to the
   * runtime (models, account). The platform picks it from `reason`.
   */
  depth: EngineProbeDepth;
  forceRefresh: boolean;
  /**
   * With depth "cheap": the last full probe's result (null otherwise). A
   * cheap probe re-checks the binary and carries the rest of it forward
   * while the binary is unchanged.
   */
  previous?: EngineProbeResult | null;
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

/** A thread as the persistence layer loads it (null before its first turn). */
export type LoadedEngineThread = Awaited<
  ReturnType<typeof import("@/lib/ai/chat/persistence").loadThread>
>;

export type EngineThreadRunInput = {
  /** The instance the thread is bound to (the request's, for a new thread). */
  instance: ResolvedEngineInstance;
  request: ThreadChatRequest;
  thread: LoadedEngineThread;
};

export type EngineThreadStopInput = Omit<EngineThreadRunInput, "instance"> & {
  /**
   * Null when the thread's instance can no longer be resolved (removed,
   * disabled): stopping a run never depends on the instance being usable.
   */
  instance: ResolvedEngineInstance | null;
};

export interface EngineThreadHandlers {
  /** Triggers `run` handles; the dispatcher answers others with 409. */
  readonly triggers: readonly ThreadChatTrigger[];
  run(input: EngineThreadRunInput): Promise<Response>;
  stop(input: EngineThreadStopInput): Promise<Response>;
}

/** The run/stop pair every runtime written before the driver contract exports. */
export type LegacyThreadRuntime = {
  run(
    request: ThreadChatRequest,
    thread: LoadedEngineThread,
    instance?: ResolvedEngineInstance | null,
  ): Promise<Response>;
  stop(
    request: ThreadChatRequest,
    thread: LoadedEngineThread,
    instance?: ResolvedEngineInstance | null,
  ): Promise<Response>;
};

/** What the runtimes written before the driver contract accept. */
export const LEGACY_EXTERNAL_THREAD_TRIGGERS = [
  "submit-user-message",
  "edit-user-message",
  "submit-tool-approval",
] as const satisfies readonly ThreadChatTrigger[];

/**
 * Thread handlers over a legacy runtime. The runtime module is loaded on
 * first use: drivers are also imported for status probes (snapshot service,
 * router), which must not pull in every runtime and its dependencies.
 */
export function legacyThreadHandlers(
  load: () => Promise<LegacyThreadRuntime>,
  triggers: readonly ThreadChatTrigger[] = LEGACY_EXTERNAL_THREAD_TRIGGERS,
): EngineThreadHandlers {
  return {
    async run({ instance, request, thread }) {
      const runtime = await load();
      return await runtime.run(request, thread, instance);
    },
    async stop({ instance, request, thread }) {
      const runtime = await load();
      return await runtime.stop(request, thread, instance);
    },
    triggers,
  };
}

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
   * Drivers whose full probe spawns a process use minutes here, and must
   * then answer depth "cheap" without talking to the runtime.
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
  /**
   * Runs and stops threads bound to this driver. Absent for the built-in
   * engine: the dispatcher then leaves the run to the orchestrator.
   */
  readonly thread?: EngineThreadHandlers;
}

export function defineEngineDriver<C extends BaseInstanceConfig>(
  driver: EngineDriver<C>,
): EngineDriver<C> {
  return driver;
}

export const DEFAULT_SNAPSHOT_TTL_MS = 15_000;
