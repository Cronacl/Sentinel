import "server-only";

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";

import { applyPrivateFsMode } from "@/lib/runtime/local-state";

import { getEngineNetworkSettingsStore } from "../network-settings";
import { getEnginesStateDirectory } from "../paths";
import { BUNDLED_ENGINE_MANIFEST, ENGINE_MANIFEST_REMOTE_URL } from "./bundled";
import {
  getManifestUpdatedAtMs,
  parseEngineManifest,
  type EngineManifest,
} from "./schema";

// The engine manifest in effect (design driver-contract.md §5, critique
// G20), ported in spirit from t3code's ModelManifest.ts (MIT):
// - preference: the copy fetched from main, else the last good copy on disk
//   (<state root>/engines/model-manifest.json), else the bundle; a cached or
//   fetched copy whose updatedAt is older than the bundle's never wins;
// - refreshed at most hourly, five minutes apart after a failure, 10 s
//   timeout, 1 MB cap, HTTPS only, zod-validated; a 404 (before this file
//   exists on main) or any other failure silently keeps what is in effect;
// - remote refresh on by default, off through Settings → Engines or
//   SENTINEL_DISABLE_REMOTE_MANIFEST. Off means the bundled copy only.
// Snapshot enrichment reads `current()`, which never waits on the network,
// and kicks `refreshInBackground()`; the next probe picks up a new copy.

export const MANIFEST_TTL_MS = 60 * 60 * 1_000;
export const MANIFEST_RETRY_MS = 5 * 60 * 1_000;
export const MANIFEST_FETCH_TIMEOUT_MS = 10_000;
export const MANIFEST_MAX_BYTES = 1024 * 1024;
export const MANIFEST_CACHE_FILE = "model-manifest.json";

export type EngineManifestSource = "bundled" | "cache" | "remote";

export type EngineManifestStatus = {
  /** When the copy in effect was fetched (null for the bundle). */
  fetchedAt: string | null;
  /** Why the last refresh did not apply a remote copy (null after success). */
  lastError: string | null;
  lastAttemptAt: string | null;
  remoteEnabled: boolean;
  source: EngineManifestSource;
  updatedAt: string;
};

export type EngineManifestFs = {
  mkdir(
    target: string,
    options: { mode: number; recursive: true },
  ): Promise<unknown>;
  readFile(target: string, encoding: "utf8"): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  writeFile(
    target: string,
    data: string,
    options: { encoding: "utf8"; mode: number },
  ): Promise<void>;
};

export type EngineManifestServiceDeps = {
  bundled?: EngineManifest;
  cachePath?: () => string;
  clock?: { now(): number };
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  fs?: EngineManifestFs;
  /** Whether remote refresh is on (settings and environment). */
  isRemoteEnabled?: () => Promise<boolean>;
  maxBytes?: number;
  onError?: (error: unknown) => void;
  retryMs?: number;
  timeoutMs?: number;
  ttlMs?: number;
  url?: string;
};

export interface EngineManifestService {
  /** The manifest in effect. Never touches the network. */
  current(): Promise<EngineManifest>;
  /**
   * Fetches a newer copy when the last one is older than the TTL (or
   * `force`), then returns the status. Never throws.
   */
  refresh(options?: { force?: boolean }): Promise<EngineManifestStatus>;
  /** `refresh()` without waiting for it. */
  refreshInBackground(): void;
  status(): Promise<EngineManifestStatus>;
}

type CacheFile = {
  fetchedAt: number;
  manifest: unknown;
  version: 1;
};

const nodeFs: EngineManifestFs = {
  mkdir: (target, options) => nodeMkdir(target, options),
  readFile: (target, encoding) => nodeReadFile(target, encoding),
  rename: (from, to) => nodeRename(from, to),
  writeFile: (target, data, options) => nodeWriteFile(target, data, options),
};

export function getEngineManifestCachePath() {
  return path.join(getEnginesStateDirectory(), MANIFEST_CACHE_FILE);
}

class ManifestFetchError extends Error {}

async function readBodyWithCap(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ManifestFetchError("The remote manifest is too large.");
  }
  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ManifestFetchError("The remote manifest is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createEngineManifestService(
  deps: EngineManifestServiceDeps = {},
): EngineManifestService {
  const bundled = deps.bundled ?? BUNDLED_ENGINE_MANIFEST;
  const fs = deps.fs ?? nodeFs;
  const clock = deps.clock ?? { now: () => Date.now() };
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const cachePath = deps.cachePath ?? getEngineManifestCachePath;
  const isRemoteEnabled =
    deps.isRemoteEnabled ??
    (() => getEngineNetworkSettingsStore().isEnabled("remoteManifest"));
  const url = deps.url ?? ENGINE_MANIFEST_REMOTE_URL;
  const ttlMs = deps.ttlMs ?? MANIFEST_TTL_MS;
  const retryMs = deps.retryMs ?? MANIFEST_RETRY_MS;
  const timeoutMs = deps.timeoutMs ?? MANIFEST_FETCH_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? MANIFEST_MAX_BYTES;

  /** The newest remote copy known (fetched now or cached on disk). */
  let remote: {
    fetchedAt: number;
    manifest: EngineManifest;
    source: "cache" | "remote";
  } | null = null;
  let diskLoaded: Promise<void> | null = null;
  let lastAttemptAt: number | null = null;
  let lastError: string | null = null;
  let inFlight: Promise<void> | null = null;

  const report = (error: unknown) => {
    try {
      deps.onError?.(error);
    } catch {
      // Reporting never breaks a refresh.
    }
  };

  function isUsableRemote(manifest: EngineManifest) {
    return getManifestUpdatedAtMs(manifest) >= getManifestUpdatedAtMs(bundled);
  }

  function loadDisk() {
    diskLoaded ??= (async () => {
      try {
        const raw = JSON.parse(
          await fs.readFile(cachePath(), "utf8"),
        ) as Partial<CacheFile> | null;
        const manifest = parseEngineManifest(raw?.manifest);
        const fetchedAt = Number(raw?.fetchedAt);
        if (
          raw?.version === 1 &&
          manifest &&
          Number.isFinite(fetchedAt) &&
          isUsableRemote(manifest) &&
          !remote
        ) {
          remote = { fetchedAt, manifest, source: "cache" };
        }
      } catch {
        // No cache yet, or an unreadable one: the bundle stands in.
      }
    })();
    return diskLoaded;
  }

  async function persist(manifest: EngineManifest, fetchedAt: number) {
    const target = cachePath();
    const directory = path.dirname(target);
    const temporary = `${target}.${process.pid}.tmp`;
    const payload: CacheFile = { fetchedAt, manifest, version: 1 };
    try {
      await fs.mkdir(directory, { mode: 0o700, recursive: true });
      await applyPrivateFsMode(directory, 0o700);
      await fs.writeFile(temporary, `${JSON.stringify(payload)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.rename(temporary, target);
    } catch (error) {
      report(error);
    }
  }

  async function fetchRemote() {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new ManifestFetchError("The manifest request timed out."),
        ),
      timeoutMs,
    );
    try {
      const response = await doFetch(url, {
        headers: { accept: "application/json" },
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.url && !response.url.startsWith("https://")) {
        throw new ManifestFetchError("The manifest was not served over HTTPS.");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new ManifestFetchError(
          `The manifest request failed (${response.status}).`,
        );
      }
      const text = await readBodyWithCap(response, maxBytes);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ManifestFetchError("The remote manifest is not valid JSON.");
      }
      const manifest = parseEngineManifest(json);
      if (!manifest) {
        throw new ManifestFetchError(
          "The remote manifest does not match this version of Sentinel.",
        );
      }
      return manifest;
    } finally {
      clearTimeout(timer);
    }
  }

  async function runRefresh(force: boolean) {
    await loadDisk();
    if (!(await isRemoteEnabled())) {
      return;
    }

    const now = clock.now();
    // A time in the future means the clock moved back: treat it as expired.
    const within = (since: number | null, windowMs: number) =>
      since !== null && now >= since && now - since < windowMs;
    if (!force && remote && within(remote.fetchedAt, ttlMs)) {
      return;
    }
    if (!force && within(lastAttemptAt, retryMs)) {
      return;
    }

    lastAttemptAt = now;
    try {
      const manifest = await fetchRemote();
      if (!isUsableRemote(manifest)) {
        lastError =
          "The remote manifest is older than the one bundled with Sentinel.";
        return;
      }
      if (
        remote &&
        getManifestUpdatedAtMs(manifest) <
          getManifestUpdatedAtMs(remote.manifest)
      ) {
        // A CDN still serving an earlier edit must not undo a newer one.
        lastError = "The remote manifest is older than the cached one.";
        return;
      }
      remote = { fetchedAt: now, manifest, source: "remote" };
      lastError = null;
      await persist(manifest, now);
    } catch (error) {
      lastError =
        error instanceof ManifestFetchError
          ? error.message
          : "The remote manifest could not be fetched.";
      report(error);
    }
  }

  async function inEffect() {
    await loadDisk();
    return (await isRemoteEnabled()) && remote ? remote : null;
  }

  const service: EngineManifestService = {
    async current() {
      return (await inEffect())?.manifest ?? bundled;
    },

    async refresh(options = {}) {
      const force = options.force ?? false;
      if (force || !inFlight) {
        // A forced refresh waits for the one in flight, then fetches again.
        const previous = inFlight ?? Promise.resolve();
        const run: Promise<void> = previous
          .then(() => runRefresh(force))
          .finally(() => {
            if (inFlight === run) {
              inFlight = null;
            }
          });
        inFlight = run;
      }
      await inFlight;
      return await service.status();
    },

    refreshInBackground() {
      void service.refresh().catch(report);
    },

    async status() {
      const effective = await inEffect();
      return {
        fetchedAt: effective
          ? new Date(effective.fetchedAt).toISOString()
          : null,
        lastAttemptAt:
          lastAttemptAt === null ? null : new Date(lastAttemptAt).toISOString(),
        lastError,
        remoteEnabled: await isRemoteEnabled(),
        source: effective?.source ?? "bundled",
        updatedAt: (effective?.manifest ?? bundled).updatedAt,
      };
    },
  };

  return service;
}

const globalForManifest = globalThis as unknown as {
  __sentinelEngineManifestService?: EngineManifestService;
};

/** The process-wide service (on globalThis so dev-server copies share it). */
export function getEngineManifestService(): EngineManifestService {
  globalForManifest.__sentinelEngineManifestService ??=
    createEngineManifestService();
  return globalForManifest.__sentinelEngineManifestService;
}
