import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, mock } from "bun:test";

// Sentinel's managed install of the Antigravity server, against a local
// HTTP server that serves a fixture release (the ACP mock agent as the
// server). Google's real download is never fetched.

process.env.SENTINEL_STATE_PATH ??= path.join(
  await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-install-state-")),
  "state.json",
);
mock.module("server-only", () => ({}));

const install = await import("./install");
const { antigravityAcpAgent } = await import("../agents/antigravity");
const { buildZip } = await import("@/lib/runtime/managed-install/testing");
const { readActiveManagedTool } =
  await import("@/lib/runtime/managed-install/install");
const { antigravityProfile } =
  await import("../../../../../../../scripts/fixtures/agents/acp/profiles");
const fake = await import("./__tests__/fake-server");

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(
    roots.map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sentinel-agy-install-"));
  roots.push(dir);
  return dir;
}

function releaseZip() {
  return buildZip([
    {
      data: fake.fakeServerScript(),
      mode: 0o100755,
      name: fake.FAKE_SERVER_NAME,
    },
    { data: "harness\n", mode: 0o100644, name: fake.FAKE_HARNESS_NAME },
  ]);
}

/** Serves `zip` over real HTTP; `fetch` maps the pinned URL onto it. */
async function serveRelease(zip: Buffer) {
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url ?? "");
    response.setHeader("content-length", String(zip.byteLength));
    response.end(zip);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    // The pinned https URL, answered by the local server (the response
    // keeps the URL that was asked for, as a TLS proxy would).
    fetch: async (url: string, init: RequestInit) => {
      const local = await fetch(
        `http://127.0.0.1:${port}${new URL(url).pathname}`,
        init,
      );
      const response = new Response(local.body, {
        headers: local.headers,
        status: local.status,
      });
      Object.defineProperty(response, "url", { value: url });
      return response;
    },
    requests,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function assetFor(zip: Buffer, sha256?: string) {
  return {
    archiveBytes: zip.byteLength,
    executable: { bytes: 0, name: fake.FAKE_SERVER_NAME },
    harness: { bytes: 0, name: fake.FAKE_HARNESS_NAME },
    sha256: sha256 ?? createHash("sha256").update(zip).digest("hex"),
    url: "https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.3.0-darwin-arm64.zip",
    version: "1.3.0",
  };
}

async function setup(scenario = antigravityProfile()) {
  const dir = await tempDir();
  return {
    dir,
    instance: fake.antigravityInstance(scenario, dir, {
      env: {
        ...fake.antigravityInstance(scenario, dir).env,
        HOME: dir,
        PATH: "/usr/bin:/bin",
      },
    }),
    stateRoot: path.join(dir, "root"),
  };
}

describe.skipIf(process.platform === "win32")(
  "installAntigravityServer",
  () => {
    it("downloads the pinned release, validates it by initialize and activates it", async () => {
      const { instance, stateRoot } = await setup();
      const zip = releaseZip();
      const release = await serveRelease(zip);
      const phases: string[] = [];
      try {
        const result = await install.installAntigravityServer({
          asset: assetFor(zip),
          descriptor: antigravityAcpAgent,
          fetch: release.fetch,
          instance,
          onProgress: (progress) => phases.push(progress.phase),
          platform: "darwin",
          signal: new AbortController().signal,
          stateRoot,
          validateTimeoutMs: 40_000,
        });
        expect(release.requests).toEqual([
          "/agy-extensions/releases/macos/agy-acp-server-1.3.0-darwin-arm64.zip",
        ]);
        expect(result.receipt.source).toEqual(
          expect.objectContaining({
            sha256: assetFor(zip).sha256,
            verified: true,
          }),
        );
        expect(phases).toContain("downloading");
        expect(phases).toContain("verifying");
        expect(phases.at(-1)).toBe("succeeded");
        expect(phases.filter((phase) => phase === "succeeded")).toHaveLength(1);

        const resolved = await install.resolveAntigravityInstallation(
          instance,
          {
            stateRoot,
          },
        );
        expect(resolved.installation).toEqual(
          expect.objectContaining({
            executablePath: result.executablePath,
            source: "managed-install",
            version: "1.3.0",
          }),
        );
      } finally {
        await release.stop();
      }
    }, 60_000);

    it("refuses a download whose SHA-256 differs from the pin", async () => {
      const { instance, stateRoot } = await setup();
      const zip = releaseZip();
      const release = await serveRelease(zip);
      try {
        await expect(
          install.installAntigravityServer({
            asset: assetFor(zip, "0".repeat(64)),
            descriptor: antigravityAcpAgent,
            fetch: release.fetch,
            instance,
            onProgress: () => {},
            platform: "darwin",
            signal: new AbortController().signal,
            stateRoot,
          }),
        ).rejects.toThrow();
        expect(
          await readActiveManagedTool("antigravity-acp", stateRoot),
        ).toBeNull();
      } finally {
        await release.stop();
      }
    });

    it("removes a release that does not identify as Antigravity", async () => {
      const scenario = antigravityProfile();
      scenario.initialize = {
        ...scenario.initialize,
        agentInfo: { name: "something-else", version: "1.3.0" },
      };
      const { instance, stateRoot } = await setup(scenario);
      const zip = releaseZip();
      const release = await serveRelease(zip);
      const phases: string[] = [];
      try {
        await expect(
          install.installAntigravityServer({
            asset: assetFor(zip),
            descriptor: antigravityAcpAgent,
            fetch: release.fetch,
            instance,
            onProgress: (progress) => phases.push(progress.phase),
            platform: "darwin",
            signal: new AbortController().signal,
            stateRoot,
            validateTimeoutMs: 40_000,
          }),
        ).rejects.toThrow("did not identify");
        expect(phases.at(-1)).toBe("failed");
        expect(
          await readActiveManagedTool("antigravity-acp", stateRoot),
        ).toBeNull();
        const resolved = await install.resolveAntigravityInstallation(
          instance,
          {
            stateRoot,
          },
        );
        expect(resolved.installation).toBeNull();
      } finally {
        await release.stop();
      }
    }, 60_000);
  },
);

describe.skipIf(process.platform === "win32")(
  "resolveAntigravityInstallation",
  () => {
    it("takes the configured path only with its harness", async () => {
      const dir = await tempDir();
      const server = await fake.writeFakeServer(path.join(dir, "bin"));
      const configured = fake.antigravityInstance({}, dir, {
        config: { binaryPath: server },
      });
      expect(
        (
          await install.resolveAntigravityInstallation(configured, {
            stateRoot: path.join(dir, "root"),
          })
        ).installation?.source,
      ).toBe("config");

      await unlink(path.join(dir, "bin", fake.FAKE_HARNESS_NAME));
      const missing = await install.resolveAntigravityInstallation(configured, {
        stateRoot: path.join(dir, "root"),
      });
      expect(missing.installation).toBeNull();
      expect(missing.error).toContain("localharness_external");
    });

    it("falls back to SENTINEL_ANTIGRAVITY_PATH, then PATH", async () => {
      const dir = await tempDir();
      const binDir = path.join(dir, "bin");
      const server = await fake.writeFakeServer(binDir);
      const viaEnv = fake.antigravityInstance({}, dir, {
        env: { SENTINEL_ANTIGRAVITY_PATH: server },
      });
      expect(
        (
          await install.resolveAntigravityInstallation(viaEnv, {
            stateRoot: path.join(dir, "root"),
          })
        ).installation?.source,
      ).toBe("env");
      const viaPath = fake.antigravityInstance({}, dir, {
        env: { PATH: binDir },
      });
      expect(
        (
          await install.resolveAntigravityInstallation(viaPath, {
            platform: "darwin",
            stateRoot: path.join(dir, "root"),
          })
        ).installation,
      ).toEqual(
        expect.objectContaining({
          executablePath: server,
          source: "managed-path",
        }),
      );
      const none = fake.antigravityInstance({}, dir, { env: { PATH: dir } });
      expect(
        (
          await install.resolveAntigravityInstallation(none, {
            stateRoot: path.join(dir, "root"),
          })
        ).error,
      ).toContain("not installed");
    });
  },
);
