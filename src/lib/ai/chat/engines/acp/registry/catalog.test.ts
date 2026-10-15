import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  ACP_REGISTRY_URL,
  acpRegistryIconUrl,
  parseAcpRegistryIndex,
  parseAcpRegistryPackageSpec,
  resolveAcpRegistryDistribution,
  resolveAcpRegistryPlatformTarget,
} = await import("./schema");
const {
  fetchAcpRegistry,
  getAcpRegistryCachePath,
  loadAcpRegistry,
  readAcpRegistryCache,
} = await import("./catalog");
const { registryIndex, startFakeRegistry } =
  await import("./__tests__/fixtures");

let root: string;
let registry: Awaited<ReturnType<typeof startFakeRegistry>> | null = null;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-acp-registry-"));
});

afterEach(async () => {
  registry?.stop();
  registry = null;
  await rm(root, { force: true, recursive: true });
});

describe("registry index parsing", () => {
  it("keeps valid agents and drops invalid ones, never the index", () => {
    const index = parseAcpRegistryIndex(registryIndex());
    expect(index?.version).toBe("1.0.0");
    expect(index?.agents.map((agent) => agent.id)).toEqual([
      "gemini",
      "devin",
      "fast-agent",
      "mistral-vibe",
    ]);
    expect(parseAcpRegistryIndex({ agents: "nope" })).toBeNull();
  });

  it("trusts only the agent's own icon on the registry CDN", () => {
    const [gemini, devin] = parseAcpRegistryIndex(registryIndex())!.agents;
    expect(acpRegistryIconUrl(gemini!)).toBe(
      "https://cdn.agentclientprotocol.com/registry/v1/latest/gemini.svg",
    );
    expect(acpRegistryIconUrl(devin!)).toBeNull();
    expect(
      acpRegistryIconUrl({
        icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/devin.svg",
        id: "gemini",
      }),
    ).toBeNull();
  });

  it("maps platforms to registry targets", () => {
    expect(resolveAcpRegistryPlatformTarget("darwin", "arm64")).toBe(
      "darwin-aarch64",
    );
    expect(resolveAcpRegistryPlatformTarget("win32", "x64")).toBe(
      "windows-x86_64",
    );
    expect(resolveAcpRegistryPlatformTarget("aix", "ppc64")).toBeNull();
  });

  it("prefers binary, then npx, then uvx, and honours an explicit choice", () => {
    const agents = parseAcpRegistryIndex(registryIndex())!.agents;
    const vibe = agents.find((agent) => agent.id === "mistral-vibe")!;
    expect(
      resolveAcpRegistryDistribution(vibe, "auto", "linux-x86_64")?.kind,
    ).toBe("binary");
    expect(
      resolveAcpRegistryDistribution(vibe, "auto", "darwin-aarch64")?.kind,
    ).toBe("npx");
    expect(resolveAcpRegistryDistribution(vibe, "uvx", "linux-x86_64")).toBe(
      null,
    );
    const devin = agents.find((agent) => agent.id === "devin")!;
    expect(
      resolveAcpRegistryDistribution(devin, "auto", "darwin-aarch64"),
    ).toMatchObject({ args: ["acp"], kind: "binary" });
  });

  it("splits exact package specs", () => {
    expect(
      parseAcpRegistryPackageSpec("npx", "@google/gemini-cli@0.63.0"),
    ).toEqual({ name: "@google/gemini-cli", version: "0.63.0" });
    expect(
      parseAcpRegistryPackageSpec("uvx", "fast-agent-acp==0.10.1"),
    ).toEqual({ name: "fast-agent-acp", version: "0.10.1" });
  });
});

describe("registry fetch", () => {
  it("fetches over HTTP framing, validates and caches the index", async () => {
    registry = await startFakeRegistry();
    const cache = await fetchAcpRegistry({
      fetch: registry.fetch,
      now: () => Date.parse("2026-10-15T08:00:00Z"),
      stateRoot: root,
    });
    expect(cache.etag).toBe('"v1"');
    expect(cache.index.agents).toHaveLength(4);
    expect(registry.requests[0]!.headers.get("accept")).toBe(
      "application/json",
    );
    const stored = JSON.parse(
      await readFile(getAcpRegistryCachePath(root), "utf8"),
    );
    expect(stored.fetchedAt).toBe("2026-10-15T08:00:00.000Z");
    expect(
      (await readAcpRegistryCache({ stateRoot: root }))?.index.version,
    ).toBe("1.0.0");
  });

  it("revalidates with the ETag and keeps the index on 304", async () => {
    registry = await startFakeRegistry((request) =>
      request.headers.get("if-none-match") === '"v1"'
        ? new Response(null, { status: 304 })
        : Response.json(registryIndex(), { headers: { etag: '"v1"' } }),
    );
    await fetchAcpRegistry({ fetch: registry.fetch, stateRoot: root });
    const again = await fetchAcpRegistry({
      fetch: registry.fetch,
      now: () => Date.parse("2026-10-16T08:00:00Z"),
      stateRoot: root,
    });
    expect(registry.requests).toHaveLength(2);
    expect(again.index.agents).toHaveLength(4);
    expect(again.fetchedAt).toBe("2026-10-16T08:00:00.000Z");
  });

  it("refuses an index over the size cap", async () => {
    registry = await startFakeRegistry(
      () =>
        new Response(
          JSON.stringify({ agents: [], pad: "x".repeat(4_000), version: "1" }),
        ),
    );
    await expect(
      fetchAcpRegistry({
        fetch: registry.fetch,
        maxBytes: 1_000,
        stateRoot: root,
      }),
    ).rejects.toThrow("too large");
    expect(await readAcpRegistryCache({ stateRoot: root })).toBeNull();
  });

  it("refuses a response that was not served over HTTPS", async () => {
    const response = Response.json(registryIndex());
    Object.defineProperty(response, "url", {
      value: "http://cdn.example/r.json",
    });
    await expect(
      fetchAcpRegistry({ fetch: async () => response, stateRoot: root }),
    ).rejects.toThrow("HTTPS");
  });

  it("gives up after the timeout", async () => {
    await expect(
      fetchAcpRegistry({
        fetch: (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(init.signal!.reason),
            ),
          ),
        stateRoot: root,
        timeoutMs: 20,
      }),
    ).rejects.toThrow("in time");
  });

  it("targets the registry CDN by default", async () => {
    const seen: string[] = [];
    await fetchAcpRegistry({
      fetch: async (url) => {
        seen.push(url);
        return Response.json(registryIndex());
      },
      stateRoot: root,
    });
    expect(seen).toEqual([ACP_REGISTRY_URL]);
  });
});

describe("loadAcpRegistry", () => {
  it("only reads with never, refetches when stale, and keeps the cache on failure", async () => {
    let fail = false;
    registry = await startFakeRegistry(() =>
      fail
        ? new Response("down", { status: 503 })
        : Response.json(registryIndex()),
    );
    let now = Date.parse("2026-10-15T08:00:00Z");
    const deps = { fetch: registry.fetch, now: () => now, stateRoot: root };

    expect(await loadAcpRegistry({ refresh: "never" }, deps)).toEqual({
      cache: null,
      error: null,
    });
    expect(registry.requests).toHaveLength(0);

    await loadAcpRegistry({ refresh: "if-stale" }, deps);
    expect(registry.requests).toHaveLength(1);
    now += 60_000;
    await loadAcpRegistry({ refresh: "if-stale" }, deps);
    expect(registry.requests).toHaveLength(1);

    fail = true;
    const forced = await loadAcpRegistry({ refresh: "force" }, deps);
    expect(registry.requests).toHaveLength(2);
    expect(forced.error).toContain("503");
    expect(forced.cache?.index.agents).toHaveLength(4);
  });
});
