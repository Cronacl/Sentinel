import "server-only";

import { z } from "zod";

import { runCommandProbe } from "../runtime/version-probe";

// The newest released version of an installed CLI: the npm registry's
// `latest` for its package, or for a Homebrew install what `brew upgrade`
// can deliver (Homebrew lags npm by hours). Cached for an hour (ten
// minutes after a failure); concurrent lookups share one request. Lookups
// only happen while update checks are on (network-settings.ts).

export const LATEST_VERSION_TTL_MS = 60 * 60 * 1_000;
export const LATEST_VERSION_FAILURE_TTL_MS = 10 * 60 * 1_000;
export const NPM_LOOKUP_TIMEOUT_MS = 4_000;
const BREW_INFO_TIMEOUT_MS = 10_000;
const BREW_INFO_MAX_BYTES = 256 * 1024;

export type LatestVersionSource =
  | { kind: "npm"; packageName: string }
  | {
      brewPath: string;
      cask: boolean;
      env: Record<string, string | undefined>;
      kind: "homebrew";
      name: string;
    };

export type LatestVersion = {
  /** When `version` was read (or, without one, last tried). */
  checkedAt: number;
  /** The last lookup failed at this time (the previous answer is kept). */
  failedAt?: number;
  version: string | null;
};

export type LatestVersionLookupDeps = {
  brewInfo?: (
    source: Extract<LatestVersionSource, { kind: "homebrew" }>,
  ) => Promise<string | null>;
  clock?: { now(): number };
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
};

export interface LatestVersionLookup {
  /** The cached answer, if any (even expired), without a lookup. */
  peek(
    source: LatestVersionSource,
  ): (LatestVersion & { fresh: boolean }) | null;
  /** The cached answer while fresh, else a lookup (`force`: always). */
  get(
    source: LatestVersionSource,
    options?: { force?: boolean },
  ): Promise<LatestVersion>;
  clear(): void;
}

export function latestVersionSourceKey(source: LatestVersionSource) {
  return source.kind === "npm"
    ? `npm:${source.packageName}`
    : `brew:${source.cask ? "cask" : "formula"}:${source.name}`;
}

/** The registry URL for a package's `latest` (scoped names keep their @). */
export function npmLatestUrl(packageName: string) {
  return `https://registry.npmjs.org/${packageName.replace("/", "%2F")}/latest`;
}

const npmLatestSchema = z.object({ version: z.string().trim().min(1).max(64) });

const brewInfoSchema = z.object({
  casks: z
    .array(z.object({ version: z.string().optional() }).loose())
    .optional(),
  formulae: z
    .array(
      z
        .object({
          versions: z
            .object({ stable: z.string().optional() })
            .loose()
            .optional(),
        })
        .loose(),
    )
    .optional(),
});

/** `brew info --json=v2` → the version `brew upgrade` installs. */
export function parseHomebrewLatestVersion(json: string, cask: boolean) {
  try {
    const parsed = brewInfoSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      return null;
    }
    // Cask versions may carry a build suffix after a comma (1.2.3,456).
    const raw = cask
      ? parsed.data.casks?.[0]?.version?.split(",", 1)[0]
      : parsed.data.formulae?.[0]?.versions?.stable;
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

async function defaultBrewInfo(
  source: Extract<LatestVersionSource, { kind: "homebrew" }>,
) {
  const result = await runCommandProbe({
    args: [
      "info",
      "--json=v2",
      ...(source.cask ? ["--cask"] : []),
      source.name,
    ],
    command: source.brewPath,
    env: { ...source.env, HOMEBREW_NO_AUTO_UPDATE: "1" },
    timeoutMs: BREW_INFO_TIMEOUT_MS,
  });
  if (result.error || result.stdout.length > BREW_INFO_MAX_BYTES) {
    return null;
  }
  return parseHomebrewLatestVersion(result.stdout, source.cask);
}

export function createLatestVersionLookup(
  deps: LatestVersionLookupDeps = {},
): LatestVersionLookup {
  const clock = deps.clock ?? { now: () => Date.now() };
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const brewInfo = deps.brewInfo ?? defaultBrewInfo;
  const timeoutMs = deps.timeoutMs ?? NPM_LOOKUP_TIMEOUT_MS;
  const cache = new Map<string, LatestVersion>();
  const inFlight = new Map<string, Promise<LatestVersion>>();

  async function lookupNpm(packageName: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(npmLatestUrl(packageName), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      const parsed = npmLatestSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.version : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function within(since: number | undefined, windowMs: number) {
    const age = since === undefined ? -1 : clock.now() - since;
    return age >= 0 && age < windowMs;
  }

  function isFresh(entry: LatestVersion) {
    return (
      within(entry.failedAt, LATEST_VERSION_FAILURE_TTL_MS) ||
      (entry.version !== null &&
        entry.failedAt === undefined &&
        within(entry.checkedAt, LATEST_VERSION_TTL_MS))
    );
  }

  const lookup: LatestVersionLookup = {
    clear() {
      cache.clear();
    },

    async get(source, options = {}) {
      const key = latestVersionSourceKey(source);
      const cached = cache.get(key);
      if (cached && !options.force && isFresh(cached)) {
        return cached;
      }
      const pending = inFlight.get(key);
      if (pending) {
        return await pending;
      }

      const run = (async () => {
        const version =
          source.kind === "npm"
            ? await lookupNpm(source.packageName)
            : await brewInfo(source).catch(() => null);
        const now = clock.now();
        // A failed lookup keeps the last known version and is not retried
        // for a while.
        const entry: LatestVersion = version
          ? { checkedAt: now, version }
          : {
              checkedAt: cached?.checkedAt ?? now,
              failedAt: now,
              version: cached?.version ?? null,
            };
        cache.set(key, entry);
        return entry;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, run);
      return await run;
    },

    peek(source) {
      const cached = cache.get(latestVersionSourceKey(source));
      return cached ? { ...cached, fresh: isFresh(cached) } : null;
    },
  };

  return lookup;
}

const globalForLatest = globalThis as unknown as {
  __sentinelEngineLatestVersions?: LatestVersionLookup;
};

export function getLatestVersionLookup(): LatestVersionLookup {
  globalForLatest.__sentinelEngineLatestVersions ??=
    createLatestVersionLookup();
  return globalForLatest.__sentinelEngineLatestVersions;
}
