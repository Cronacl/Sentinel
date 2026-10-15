import "server-only";

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import path from "node:path";

import { createLogger } from "@/lib/logger";
import { getSentinelStateRoot } from "@/lib/runtime/local-state";

import {
  ACP_REGISTRY_URL,
  parseAcpRegistryIndex,
  type AcpRegistryAgent,
  type AcpRegistryIndex,
} from "./schema";

// The ACP Registry index, fetched only on an explicit browse or refresh in
// Settings (and at most daily in the background while the user has registry
// instances): HTTPS, 1 MB cap, 30 s timeout, validated, cached in
// <state root>/acp-registry/registry.json (t3code AcpRegistrySupport.ts:
// 48-57, MIT). A failed fetch keeps the cached index.

const log = createLogger("AcpRegistryCatalog");

export const ACP_REGISTRY_MAX_BYTES = 1024 * 1024;
export const ACP_REGISTRY_FETCH_TIMEOUT_MS = 30_000;
/** A browse refetches an index older than this; Refresh always does. */
export const ACP_REGISTRY_BROWSE_TTL_MS = 6 * 60 * 60 * 1_000;
export const ACP_REGISTRY_BACKGROUND_TTL_MS = 24 * 60 * 60 * 1_000;

export type AcpRegistryCache = {
  etag: string | null;
  fetchedAt: string;
  index: AcpRegistryIndex;
};

export type AcpRegistryCatalogDeps = {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  fs?: {
    mkdir?: typeof nodeMkdir;
    readFile?: typeof nodeReadFile;
    rename?: typeof nodeRename;
    writeFile?: typeof nodeWriteFile;
  };
  maxBytes?: number;
  now?: () => number;
  stateRoot?: string;
  timeoutMs?: number;
  url?: string;
};

export class AcpRegistryFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcpRegistryFetchError";
  }
}

export function getAcpRegistryCachePath(stateRoot = getSentinelStateRoot()) {
  return path.join(stateRoot, "acp-registry", "registry.json");
}

async function readBodyWithCap(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AcpRegistryFetchError("The ACP Registry index is too large.");
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      throw new AcpRegistryFetchError("The ACP Registry index is too large.");
    }
    return text;
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
      throw new AcpRegistryFetchError("The ACP Registry index is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readAcpRegistryCache(
  deps: AcpRegistryCatalogDeps = {},
): Promise<AcpRegistryCache | null> {
  const readFile = deps.fs?.readFile ?? nodeReadFile;
  try {
    const raw = JSON.parse(
      await readFile(getAcpRegistryCachePath(deps.stateRoot), "utf8"),
    ) as Partial<AcpRegistryCache> | null;
    const index = parseAcpRegistryIndex(raw?.index);
    if (!index || typeof raw?.fetchedAt !== "string") {
      return null;
    }
    return {
      etag: typeof raw.etag === "string" ? raw.etag : null,
      fetchedAt: raw.fetchedAt,
      index,
    };
  } catch {
    return null;
  }
}

async function writeCache(
  cache: AcpRegistryCache,
  deps: AcpRegistryCatalogDeps,
) {
  const file = getAcpRegistryCachePath(deps.stateRoot);
  const mkdir = deps.fs?.mkdir ?? nodeMkdir;
  const writeFile = deps.fs?.writeFile ?? nodeWriteFile;
  const rename = deps.fs?.rename ?? nodeRename;
  await mkdir(path.dirname(file), { mode: 0o700, recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(cache), { mode: 0o600 });
  await rename(temp, file);
}

/** Fetches the index now (conditional on the cached ETag) and caches it. */
export async function fetchAcpRegistry(
  deps: AcpRegistryCatalogDeps = {},
): Promise<AcpRegistryCache> {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const now = deps.now ?? Date.now;
  const url = deps.url ?? ACP_REGISTRY_URL;
  const cached = await readAcpRegistryCache(deps);
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new AcpRegistryFetchError("The ACP Registry did not answer in time."),
      ),
    deps.timeoutMs ?? ACP_REGISTRY_FETCH_TIMEOUT_MS,
  );
  try {
    let response: Response;
    try {
      response = await doFetch(url, {
        headers: {
          accept: "application/json",
          ...(cached?.etag ? { "if-none-match": cached.etag } : {}),
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      throw controller.signal.aborted
        ? (controller.signal.reason as Error)
        : new AcpRegistryFetchError(
            `Could not reach the ACP Registry: ${error instanceof Error ? error.message : String(error)}`,
          );
    }
    if (response.url && !response.url.startsWith("https://")) {
      await response.body?.cancel().catch(() => undefined);
      throw new AcpRegistryFetchError(
        "The ACP Registry was not served over HTTPS.",
      );
    }
    if (response.status === 304 && cached) {
      await response.body?.cancel().catch(() => undefined);
      const next = { ...cached, fetchedAt: new Date(now()).toISOString() };
      await writeCache(next, deps);
      return next;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new AcpRegistryFetchError(
        `The ACP Registry answered ${response.status}.`,
      );
    }
    const text = await readBodyWithCap(
      response,
      deps.maxBytes ?? ACP_REGISTRY_MAX_BYTES,
    );
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AcpRegistryFetchError("The ACP Registry index is not JSON.");
    }
    const index = parseAcpRegistryIndex(json);
    if (!index) {
      throw new AcpRegistryFetchError(
        "The ACP Registry index does not have the expected shape.",
      );
    }
    const next: AcpRegistryCache = {
      etag: response.headers.get("etag"),
      fetchedAt: new Date(now()).toISOString(),
      index,
    };
    await writeCache(next, deps);
    return next;
  } finally {
    clearTimeout(timer);
  }
}

function ageOf(cache: AcpRegistryCache | null, now: number) {
  const fetched = cache ? Date.parse(cache.fetchedAt) : Number.NaN;
  // A time in the future means the clock moved back: treat it as expired.
  return Number.isFinite(fetched) && fetched <= now
    ? now - fetched
    : Number.POSITIVE_INFINITY;
}

export type AcpRegistryLoadResult = {
  cache: AcpRegistryCache | null;
  error: string | null;
};

const inflight = new Map<string, Promise<AcpRegistryCache>>();

function fetchOnce(deps: AcpRegistryCatalogDeps) {
  const key = getAcpRegistryCachePath(deps.stateRoot);
  const running = inflight.get(key);
  if (running) {
    return running;
  }
  const next = fetchAcpRegistry(deps).finally(() => inflight.delete(key));
  inflight.set(key, next);
  return next;
}

/**
 * The index for the browser: the cache, refetched when `refresh` is
 * "force" or the cache is older than `maxAgeMs`; "never" only reads.
 */
export async function loadAcpRegistry(
  options: {
    maxAgeMs?: number;
    refresh: "force" | "if-stale" | "never";
  },
  deps: AcpRegistryCatalogDeps = {},
): Promise<AcpRegistryLoadResult> {
  const cache = await readAcpRegistryCache(deps);
  const now = (deps.now ?? Date.now)();
  const stale =
    ageOf(cache, now) >= (options.maxAgeMs ?? ACP_REGISTRY_BROWSE_TTL_MS);
  if (
    options.refresh === "never" ||
    (options.refresh === "if-stale" && !stale)
  ) {
    return { cache, error: null };
  }
  try {
    return { cache: await fetchOnce(deps), error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The ACP Registry fetch failed.";
    log.warn("acp_registry_fetch_failed", { error: message });
    return { cache, error: message };
  }
}

export async function findAcpRegistryAgent(
  agentId: string,
  deps: AcpRegistryCatalogDeps = {},
): Promise<AcpRegistryAgent | null> {
  const cache = await readAcpRegistryCache(deps);
  return cache?.index.agents.find((agent) => agent.id === agentId) ?? null;
}

let lastBackgroundAttempt = 0;

/**
 * The daily background refresh, asked for by registry instances' probes
 * (so only users with registry instances ever trigger it) when update
 * checks are on. Never in tests; never blocks the caller.
 */
export function scheduleAcpRegistryBackgroundRefresh(
  deps: AcpRegistryCatalogDeps & { enabled: () => Promise<boolean> },
) {
  const now = (deps.now ?? Date.now)();
  if (
    process.env.NODE_ENV === "test" ||
    now - lastBackgroundAttempt < ACP_REGISTRY_BACKGROUND_TTL_MS
  ) {
    return;
  }
  lastBackgroundAttempt = now;
  void (async () => {
    if (!(await deps.enabled())) {
      return;
    }
    await loadAcpRegistry(
      { maxAgeMs: ACP_REGISTRY_BACKGROUND_TTL_MS, refresh: "if-stale" },
      deps,
    );
  })().catch(() => undefined);
}
