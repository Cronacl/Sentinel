import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { BUNDLED_ENGINE_MANIFEST, ENGINE_MANIFEST_REMOTE_URL } =
  await import("./bundled");
const { createEngineManifestService } = await import("./service");

import type { EngineManifest } from "./schema";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-manifest-"));
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

function newer(updatedAt = "2027-01-01T00:00:00.000Z"): EngineManifest {
  const manifest = structuredClone(BUNDLED_ENGINE_MANIFEST);
  manifest.updatedAt = updatedAt;
  manifest.drivers.codex!.defaults = { chat: "gpt-6-luna" };
  return manifest;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });
}

function createHarness(
  options: {
    fetch?: (url: string, init: RequestInit) => Promise<Response>;
    remoteEnabled?: boolean;
    timeoutMs?: number;
  } = {},
) {
  let now = Date.parse("2026-10-08T12:00:00.000Z");
  const calls: string[] = [];
  const errors: unknown[] = [];
  const state = { remoteEnabled: options.remoteEnabled ?? true };
  const fetch = mock(async (url: string, init: RequestInit) => {
    calls.push(url);
    return await (options.fetch?.(url, init) ?? jsonResponse(newer()));
  });
  const service = createEngineManifestService({
    cachePath: () => path.join(root, "engines", "model-manifest.json"),
    clock: { now: () => now },
    fetch,
    isRemoteEnabled: async () => state.remoteEnabled,
    onError: (error) => errors.push(error),
    timeoutMs: options.timeoutMs,
  });
  return {
    advance: (ms: number) => {
      now += ms;
    },
    calls,
    errors,
    fetch,
    service,
    state,
  };
}

describe("engine manifest service", () => {
  it("starts from the bundle and never fetches for current()", async () => {
    const { calls, service } = createHarness();

    expect(await service.current()).toBe(BUNDLED_ENGINE_MANIFEST);
    expect(calls).toEqual([]);
    expect(await service.status()).toEqual(
      expect.objectContaining({ source: "bundled", remoteEnabled: true }),
    );
  });

  it("fetches main's copy, applies it and caches it on disk", async () => {
    const { calls, service } = createHarness();

    const status = await service.refresh();

    expect(calls).toEqual([ENGINE_MANIFEST_REMOTE_URL]);
    expect(ENGINE_MANIFEST_REMOTE_URL).toBe(
      "https://raw.githubusercontent.com/Cronacl/Sentinel/main/manifests/engine-manifest.v1.json",
    );
    expect(status).toEqual(
      expect.objectContaining({
        fetchedAt: "2026-10-08T12:00:00.000Z",
        lastError: null,
        source: "remote",
        updatedAt: "2027-01-01T00:00:00.000Z",
      }),
    );
    expect((await service.current()).drivers.codex?.defaults?.chat).toBe(
      "gpt-6-luna",
    );

    const cached = JSON.parse(
      await readFile(path.join(root, "engines", "model-manifest.json"), "utf8"),
    );
    expect(cached).toEqual(
      expect.objectContaining({
        fetchedAt: Date.parse("2026-10-08T12:00:00.000Z"),
        version: 1,
      }),
    );

    // A cold service starts from the disk copy.
    const cold = createHarness();
    expect((await cold.service.current()).updatedAt).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect((await cold.service.status()).source).toBe("cache");
  });

  it("refreshes at most hourly and backs off five minutes after a failure", async () => {
    let fail = false;
    const { advance, calls, service } = createHarness({
      fetch: async () =>
        fail
          ? new Response("Not Found", { status: 404 })
          : jsonResponse(newer()),
    });

    await service.refresh();
    advance(30 * 60 * 1_000);
    await service.refresh();
    expect(calls).toHaveLength(1);

    advance(31 * 60 * 1_000);
    fail = true;
    const failed = await service.refresh();
    expect(calls).toHaveLength(2);
    // The last good copy stays in effect.
    expect(failed).toEqual(
      expect.objectContaining({
        lastError: "The manifest request failed (404).",
        source: "remote",
      }),
    );

    advance(60 * 1_000);
    await service.refresh();
    expect(calls).toHaveLength(2);
    advance(5 * 60 * 1_000);
    await service.refresh();
    expect(calls).toHaveLength(3);

    // A forced refresh ignores both timers.
    await service.refresh({ force: true });
    expect(calls).toHaveLength(4);
  });

  it("keeps the bundle when main has no manifest yet (404)", async () => {
    const { errors, service } = createHarness({
      fetch: async () => new Response("Not Found", { status: 404 }),
    });

    const status = await service.refresh();

    expect(status.source).toBe("bundled");
    expect(await service.current()).toBe(BUNDLED_ENGINE_MANIFEST);
    expect(errors).toHaveLength(1);
  });

  it("rejects invalid, oversized, older and non-HTTPS copies", async () => {
    const cases: Array<[() => Promise<Response>, string]> = [
      [async () => jsonResponse({ schemaVersion: 2 }), "does not match"],
      [async () => new Response("{not json"), "not valid JSON"],
      [
        async () =>
          new Response("x".repeat(2 * 1024 * 1024), {
            headers: { "content-length": String(2 * 1024 * 1024) },
          }),
        "too large",
      ],
      [
        async () =>
          new Response(new Blob(["x".repeat(1024 * 1024 + 1)]).stream()),
        "too large",
      ],
      [
        async () => jsonResponse(newer("2020-01-01T00:00:00.000Z")),
        "older than the one bundled",
      ],
      [
        async () => {
          const response = jsonResponse(newer());
          Object.defineProperty(response, "url", {
            value: "http://raw.githubusercontent.com/x",
          });
          return response;
        },
        "HTTPS",
      ],
    ];

    for (const [fetch, message] of cases) {
      const { service } = createHarness({ fetch });
      const status = await service.refresh();
      expect(status.source).toBe("bundled");
      expect(status.lastError).toContain(message);
    }
  });

  it("times out a hanging request", async () => {
    const { service } = createHarness({
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
      timeoutMs: 20,
    });

    const status = await service.refresh();
    expect(status.lastError).toBe("The manifest request timed out.");
  });

  it("ignores a disk copy older than the bundle", async () => {
    await mkdir(path.join(root, "engines"), { recursive: true });
    await writeFile(
      path.join(root, "engines", "model-manifest.json"),
      JSON.stringify({
        fetchedAt: Date.now(),
        manifest: newer("2020-01-01T00:00:00.000Z"),
        version: 1,
      }),
    );
    const { service } = createHarness();
    expect(await service.current()).toBe(BUNDLED_ENGINE_MANIFEST);
  });

  it("uses only the bundle and fetches nothing while remote refresh is off", async () => {
    const first = createHarness();
    await first.service.refresh();

    const { calls, service, state } = createHarness({ remoteEnabled: false });
    expect(await service.current()).toBe(BUNDLED_ENGINE_MANIFEST);
    const status = await service.refresh({ force: true });
    expect(status).toEqual(
      expect.objectContaining({ remoteEnabled: false, source: "bundled" }),
    );
    expect(calls).toEqual([]);

    // Turning it back on brings the cached copy back at once.
    state.remoteEnabled = true;
    expect((await service.current()).updatedAt).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("shares one request between concurrent refreshes", async () => {
    const { calls, service } = createHarness();
    await Promise.all([
      service.refresh(),
      service.refresh(),
      service.refresh(),
    ]);
    expect(calls).toHaveLength(1);
  });
});
