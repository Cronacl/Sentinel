import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { makeFakeInstance, makeFakeSnapshot } =
  await import("../../contract/testing");
const { DRIVER_CATALOG } = await import("../../catalog");
const { BUNDLED_ENGINE_MANIFEST } = await import("../manifest/bundled");
const { createLatestVersionLookup } = await import("./latest-version");
const { createUpdateStateEnricher } = await import("./enricher");
const { ENGINE_MAINTENANCE_DEFINITIONS } = await import("./definitions");

import type { EngineDriver } from "../driver";

const signal = new AbortController().signal;

function createEnricher() {
  return createUpdateStateEnricher({
    inspect: {
      latest: createLatestVersionLookup({
        fetch: async () => new Response(JSON.stringify({ version: "2.1.300" })),
      }),
      managedPath: async () => "/usr/bin",
      manifest: async () => BUNDLED_ENGINE_MANIFEST,
      ownership: {
        exists: async () => false,
        realpath: async (target: string) => target,
        which: async () => null,
      },
      planCache: new Map(),
      updateChecksEnabled: async () => true,
      which: async () => null,
    },
  });
}

describe("update-state enricher", () => {
  it("adds the version advisory", async () => {
    const snapshot = makeFakeSnapshot({
      driver: "claude",
      install: {
        installed: true,
        path: "/Users/me/.local/bin/claude",
        source: "managed-path",
        version: "2.1.280 (Claude Code)",
      },
    });

    const result = await createEnricher().enrich(
      {
        driver: {
          kind: "claude",
          meta: DRIVER_CATALOG.claude,
        } as unknown as EngineDriver,
        instance: makeFakeInstance({ driver: "claude" }),
        probe: null,
        snapshot,
      },
      { signal },
    );

    // Live install and update state is the snapshot service's overlay.
    expect(result.updateState).toBe(null);
    expect(result.versionAdvisory).toEqual(
      expect.objectContaining({
        canUpdate: true,
        currentVersion: "2.1.280",
        latestVersion: "2.1.300",
        status: "behind_latest",
        updateCommand: "/Users/me/.local/bin/claude update",
      }),
    );
  });

  it("leaves disabled or unavailable instances alone", async () => {
    const snapshot = makeFakeSnapshot({ driver: "claude", enabled: false });
    const result = await createEnricher().enrich(
      {
        driver: { kind: "claude" } as unknown as EngineDriver,
        instance: makeFakeInstance({ driver: "claude" }),
        probe: null,
        snapshot,
      },
      { signal },
    );
    expect(result).toEqual(snapshot);
  });
});

describe("maintenance definitions", () => {
  it("cover every external driver with vetted commands", () => {
    for (const [kind, meta] of Object.entries(DRIVER_CATALOG)) {
      if (meta.runtime === "external") {
        expect(ENGINE_MAINTENANCE_DEFINITIONS[kind]).toBeDefined();
      }
    }
    const tools = {
      curl: "curl",
      npm: "npm",
      powershell: "powershell",
      sh: "sh",
    };
    const displays = Object.fromEntries(
      Object.entries(ENGINE_MAINTENANCE_DEFINITIONS).map(
        ([kind, definition]) => [
          kind,
          definition.install.map((option) => option.command(tools).display),
        ],
      ),
    );
    expect(displays).toEqual({
      acp: [],
      antigravity: [],
      claude: [
        "npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code",
      ],
      codex: [
        "npm install -g --allow-scripts=@openai/codex @openai/codex",
        "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
        "irm https://chatgpt.com/codex/install.ps1 | iex",
      ],
      copilot: [],
      cursor: ["curl -fsS https://cursor.com/install | bash"],
      grok: [
        "npm install -g --allow-scripts=@xai-official/grok @xai-official/grok",
        "curl -fsSL https://x.ai/cli/install.sh | bash",
      ],
      opencode: [
        "npm install -g --allow-scripts=opencode-ai opencode-ai",
        "npm install -g --allow-scripts=@opencode/cli @opencode/cli",
      ],
      pi: [
        "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
        "curl -fsSL https://pi.dev/install.sh | sh",
      ],
    });
  });

  it("follow OpenCode's package by generation", () => {
    const opencode = ENGINE_MAINTENANCE_DEFINITIONS.opencode!;
    expect(opencode.packageName("1.3.17")).toBe("opencode-ai");
    expect(opencode.packageName("opencode v2.0.18")).toBe("@opencode/cli");
    expect(opencode.packageName(null)).toBe("opencode-ai");
  });
});
