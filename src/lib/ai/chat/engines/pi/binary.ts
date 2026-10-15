import "server-only";

import type { EngineInstallSource, ResolvedEngineInstance } from "../contract";
import {
  getLoginShellCandidates,
  getLoginShellMarkers,
} from "../platform/runtime/login-shell";
import {
  getInstanceRuntimeKey,
  recordResolvedBinary,
  resolveBinaryStandard,
} from "../platform/runtime/resolve-binary";
import { probeBinaryVersion } from "../platform/runtime/version-probe";

// Finding `pi` (@earendil-works/pi-coding-agent): the instance's binary
// path, SENTINEL_PI_PATH for the default instance, the managed PATH, then a
// login shell. A candidate must answer `pi --version` (4 s, t3code
// PiProvider). Resolutions are cached briefly per instance runtime key.

const RESOLUTION_TTL_MS = 15_000;
const VERSION_TIMEOUT_MS = 4_000;
const LEGACY_ENV_KEYS = ["SENTINEL_PI_PATH"] as const;
const FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash", "/usr/bin/fish"];
const VERSION_PATTERN = /\d+\.\d+\.\d+(?:[-+][\w.-]+)?/;

export type PiBinary = {
  env: Record<string, string | undefined>;
  path: string;
  source: EngineInstallSource;
  version: string | null;
};

export type PiBinaryResolution =
  { binary: PiBinary; error: null } | { binary: null; error: string };

/** "pi 1.0.4", "v1.0.4" or "1.0.4" → "1.0.4". */
export function readPiVersion(output: string | null | undefined) {
  return output ? (VERSION_PATTERN.exec(output)?.[0] ?? null) : null;
}

async function resolveUncached(
  instance: ResolvedEngineInstance,
): Promise<PiBinaryResolution> {
  const env = instance.env;
  const result = await resolveBinaryStandard({
    command: "pi",
    env,
    instance,
    legacyEnvKeys: LEGACY_ENV_KEYS,
    loginShell: {
      markers: getLoginShellMarkers("pi"),
      shells: getLoginShellCandidates(env, FALLBACK_SHELLS),
    },
    strategy: "pathext-or-bare",
    verify: async (candidatePath, candidateEnv) => {
      const probe = await probeBinaryVersion({
        command: candidatePath,
        env: candidateEnv,
        timeoutMs: VERSION_TIMEOUT_MS,
      });
      return probe.launchable
        ? { path: candidatePath, version: readPiVersion(probe.version) }
        : null;
    },
  });
  const resolved = result.resolved;
  if (!resolved) {
    return {
      binary: null,
      error: result.rejectedOverride
        ? `Pi at ${result.rejectedOverride.path} is not launchable.`
        : "Pi was not found in PATH.",
    };
  }
  await recordResolvedBinary(resolved, {
    instanceId: instance.id,
    legacyEnvKey: instance.isDefault ? "SENTINEL_PI_PATH" : null,
  });
  return {
    binary: {
      env: resolved.env,
      path: resolved.path,
      source: resolved.source,
      version: resolved.version,
    },
    error: null,
  };
}

const resolutions = new Map<
  string,
  { expiresAt: number; promise: Promise<PiBinaryResolution> }
>();

export function resolvePiBinary(
  instance: ResolvedEngineInstance,
  options: { forceRefresh?: boolean } = {},
) {
  const key = getInstanceRuntimeKey(instance);
  const cached = resolutions.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }
  const promise = resolveUncached(instance).catch(
    (error: unknown): PiBinaryResolution => ({
      binary: null,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  resolutions.set(key, { expiresAt: Date.now() + RESOLUTION_TTL_MS, promise });
  return promise;
}

export function invalidatePiBinaryResolutions() {
  resolutions.clear();
}
