import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeSnapshot } = await import("../../contract/testing");
const { BUNDLED_ENGINE_MANIFEST } = await import("../manifest/bundled");
const { createLatestVersionLookup } = await import("./latest-version");
const { inspectMaintenance, MANAGED_INSTALL_OPTION_ID } =
  await import("./inspect");
const { applyMaintenanceInspection } = await import("./enricher");

import type { EngineSnapshot } from "../../contract";

const NPM_CODEX = {
  realpaths: {
    "/usr/local/bin/codex":
      "/usr/local/lib/node_modules/@openai/codex/bin/codex.js",
  },
};

function harness(
  options: {
    latest?: Record<string, string | null>;
    realpaths?: Record<string, string>;
    tools?: Record<string, string>;
    updateChecks?: boolean;
  } = {},
) {
  const lookups: string[] = [];
  const latest = createLatestVersionLookup({
    fetch: async (url: string) => {
      lookups.push(url);
      const name = decodeURIComponent(
        url.replace("https://registry.npmjs.org/", "").replace("/latest", ""),
      );
      const version = options.latest?.[name];
      return version
        ? new Response(JSON.stringify({ version }))
        : new Response("missing", { status: 404 });
    },
  });
  return {
    deps: {
      latest,
      managedPath: async () => "/usr/local/bin:/usr/bin",
      manifest: async () => BUNDLED_ENGINE_MANIFEST,
      ownership: {
        exists: async () => false,
        realpath: async (target: string) => {
          const real = options.realpaths?.[target];
          if (!real) throw new Error("ENOENT");
          return real;
        },
        which: async () => null,
      },
      planCache: new Map(),
      platform: "darwin" as const,
      updateChecksEnabled: async () => options.updateChecks ?? true,
      which: async (command: string) => options.tools?.[command] ?? null,
    },
    lookups,
  };
}

function snapshotOf(overrides: Partial<EngineSnapshot>) {
  return makeFakeSnapshot(overrides);
}

const installed = (
  driver: string,
  path: string,
  version: string,
  source: EngineSnapshot["install"]["source"] = "managed-path",
) =>
  snapshotOf({
    driver,
    install: { installed: true, path, source, version },
    label: driver[0]!.toUpperCase() + driver.slice(1),
  });

const missing = (driver: string) =>
  snapshotOf({
    driver,
    install: { installed: false, path: null, source: null, version: null },
    label: driver[0]!.toUpperCase() + driver.slice(1),
    status: "error",
  });

describe("inspectMaintenance", () => {
  it("finds an update behind the npm latest and pins the command to it", async () => {
    const { deps, lookups } = harness({
      latest: { "@openai/codex": "0.161.0" },
      realpaths: NPM_CODEX.realpaths,
    });

    const inspection = await inspectMaintenance(
      {
        driver: "codex",
        env: {},
        latestMode: "wait",
        snapshot: installed(
          "codex",
          "/usr/local/bin/codex",
          "codex-cli 0.160.1",
        ),
        waitMs: 1_000,
      },
      deps,
    );

    expect(lookups).toEqual([
      "https://registry.npmjs.org/@openai%2Fcodex/latest",
    ]);
    expect(inspection).toEqual(
      expect.objectContaining({
        canUpdate: true,
        currentVersion: "0.160.1",
        latestVersion: "0.161.0",
        updateBlockedReason: null,
        versionStatus: "behind_latest",
      }),
    );
    expect(
      inspection.plan?.kind === "command" && inspection.plan.command.display,
    ).toBe(
      "npm install -g --prefix /usr/local --allow-scripts=@openai/codex @openai/codex@0.161.0",
    );

    const snapshot = applyMaintenanceInspection(
      installed("codex", "/usr/local/bin/codex", "codex-cli 0.160.1"),
      inspection,
    );
    expect(snapshot.versionAdvisory).toEqual(
      expect.objectContaining({
        canUpdate: true,
        currentVersion: "0.160.1",
        latestVersion: "0.161.0",
        status: "behind_latest",
        updateCommand:
          "npm install -g --prefix /usr/local --allow-scripts=@openai/codex @openai/codex@0.161.0",
      }),
    );
    expect(snapshot.setup.canUpdate).toBe(true);
  });

  it("reports current and unknown versions", async () => {
    const current = await inspectMaintenance(
      {
        driver: "codex",
        env: {},
        latestMode: "wait",
        snapshot: installed("codex", "/usr/local/bin/codex", "0.161.0"),
        waitMs: 1_000,
      },
      harness({
        latest: { "@openai/codex": "0.161.0" },
        realpaths: NPM_CODEX.realpaths,
      }).deps,
    );
    expect(current.versionStatus).toBe("current");

    // Update checks off: nothing is looked up.
    const { deps, lookups } = harness({
      latest: { "@openai/codex": "0.161.0" },
      realpaths: NPM_CODEX.realpaths,
      updateChecks: false,
    });
    const unknown = await inspectMaintenance(
      {
        driver: "codex",
        env: {},
        latestMode: "wait",
        snapshot: installed("codex", "/usr/local/bin/codex", "0.160.1"),
      },
      deps,
    );
    expect(unknown).toEqual(
      expect.objectContaining({
        canUpdate: true,
        latestVersion: null,
        versionStatus: "unknown",
      }),
    );
    expect(lookups).toEqual([]);
  });

  it("blocks an update to a release this Sentinel does not support", async () => {
    // Grok installed through npm; its latest is fine, but a manifest that
    // marks it broken blocks the update.
    const realpaths = {
      "/usr/local/bin/grok":
        "/usr/local/lib/node_modules/@xai-official/grok/bin/grok",
    };
    const { deps } = harness({
      latest: { "@xai-official/grok": "0.3.0" },
      realpaths,
    });
    const inspection = await inspectMaintenance(
      {
        driver: "grok",
        env: {},
        latestMode: "wait",
        snapshot: installed("grok", "/usr/local/bin/grok", "grok 0.2.39"),
        waitMs: 1_000,
      },
      deps,
    );
    expect(inspection.canUpdate).toBe(false);
    expect(inspection.latestCompatibility?.status).toBe("broken");
    expect(inspection.updateBlockedReason).toBe(
      "Grok 0.3.0 is not supported by this version of Sentinel yet.",
    );
  });

  it("never offers updates for the runtime bundled with Sentinel", async () => {
    const inspection = await inspectMaintenance(
      {
        driver: "copilot",
        env: {},
        latestMode: "wait",
        snapshot: installed(
          "copilot",
          "/app/node_modules/@github/copilot-sdk-darwin-arm64/copilot-runtime",
          "1.0.16",
          "sdk-bundled",
        ),
      },
      harness().deps,
    );
    expect(inspection).toEqual(
      expect.objectContaining({ bundled: true, canUpdate: false, plan: null }),
    );
    const snapshot = applyMaintenanceInspection(
      installed("copilot", "/x", "1.0.16", "sdk-bundled"),
      inspection,
    );
    expect(snapshot.setup.installHint).toBe("Bundled with Sentinel.");
    expect(snapshot.versionAdvisory?.canUpdate).toBe(false);
  });

  it("lists install options with their availability", async () => {
    const inspection = await inspectMaintenance(
      {
        driver: "opencode",
        env: {},
        latestMode: "cache",
        snapshot: missing("opencode"),
      },
      harness({ tools: { npm: "/usr/local/bin/npm" } }).deps,
    );

    expect(inspection.installOptions).toEqual([
      expect.objectContaining({
        available: true,
        command: "npm install -g --allow-scripts=opencode-ai opencode-ai",
        id: "npm",
      }),
      expect.objectContaining({
        available: false,
        command: "npm install -g --allow-scripts=@opencode/cli @opencode/cli",
        id: "npm-v2",
        reason: "This version of Sentinel does not support it yet.",
      }),
    ]);

    const snapshot = applyMaintenanceInspection(
      missing("opencode"),
      inspection,
    );
    expect(snapshot.setup).toEqual(
      expect.objectContaining({
        canInstall: true,
        canUpdate: false,
        installHint: "npm install -g --allow-scripts=opencode-ai opencode-ai",
      }),
    );
  });

  it("explains which programs an install needs and skips other platforms", async () => {
    const inspection = await inspectMaintenance(
      {
        driver: "codex",
        env: {},
        latestMode: "cache",
        snapshot: missing("codex"),
      },
      harness({ tools: { curl: "/usr/bin/curl", sh: "/bin/sh" } }).deps,
    );
    expect(inspection.installOptions.map((option) => option.id)).toEqual([
      "npm",
      "script",
    ]);
    expect(inspection.installOptions[0]).toEqual(
      expect.objectContaining({
        available: false,
        reason: "Needs npm on this machine.",
      }),
    );
    expect(inspection.installOptions[1]).toEqual(
      expect.objectContaining({
        available: true,
        command: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      }),
    );
  });

  it("offers a driver's managed install", async () => {
    const inspection = await inspectMaintenance(
      {
        driver: {
          kind: "antigravity",
          maintenance: {
            install: [],
            installHint: "Installed by Sentinel.",
            managedInstall: {
              label: "Download Antigravity",
              run: async () => {},
            },
            packageName: () => null,
          },
        },
        env: {},
        latestMode: "cache",
        snapshot: missing("antigravity"),
      },
      harness().deps,
    );
    expect(inspection.installOptions).toEqual([
      expect.objectContaining({
        available: true,
        command: null,
        id: MANAGED_INSTALL_OPTION_ID,
        label: "Download Antigravity",
      }),
    ]);
  });

  it("leaves drivers without maintenance alone", async () => {
    const snapshot = installed("sentinel", "/x", "1.0.0");
    const inspection = await inspectMaintenance(
      { driver: "sentinel", env: {}, latestMode: "cache", snapshot },
      harness().deps,
    );
    expect(applyMaintenanceInspection(snapshot, inspection)).toBe(snapshot);
  });
});
