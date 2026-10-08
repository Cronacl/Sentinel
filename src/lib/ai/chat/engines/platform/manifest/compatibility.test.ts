import { describe, expect, it } from "bun:test";

import bundledManifestJson from "../../../../../../../manifests/engine-manifest.v1.json";
import {
  combineCompatibilityAdvisories,
  compareEngineVersions,
  findCompatibilityPolicy,
  isEngineVersionBelow,
  normalizeEngineVersion,
  resolveEngineCompatibility,
} from "./compatibility";
import { engineManifestSchema, type EngineCompatibilityPolicy } from "./schema";

const policies = engineManifestSchema.parse(bundledManifestJson).compatibility;

describe("normalizeEngineVersion", () => {
  it("reads the versions each runtime prints", () => {
    expect(normalizeEngineVersion("claude", "2.1.280 (Claude Code)")).toBe(
      "2.1.280",
    );
    expect(normalizeEngineVersion("codex", "codex-cli 0.160.1")).toBe(
      "0.160.1",
    );
    expect(
      normalizeEngineVersion(
        "codex",
        "codex_cli_rs/0.160.1 (Mac OS 26.1.0; arm64)",
      ),
    ).toBe("0.160.1");
    expect(normalizeEngineVersion("opencode", "opencode v2.0.18")).toBe(
      "2.0.18",
    );
    expect(normalizeEngineVersion("grok", "grok 0.2.39 (55a20b703aa)")).toBe(
      "0.2.39",
    );
    expect(
      normalizeEngineVersion("copilot", "GitHub Copilot CLI 1.0.36."),
    ).toBe("1.0.36");
    expect(normalizeEngineVersion("antigravity", "agy_acp_server_1.3.0")).toBe(
      "1.3.0",
    );
  });

  it("strips Cursor's build hash and leading zeros", () => {
    expect(normalizeEngineVersion("cursor", "2026.08.04-aaa8809")).toBe(
      "2026.8.4",
    );
  });

  it("keeps prereleases and snapshot builds unknown", () => {
    expect(normalizeEngineVersion("opencode", "0.0.0-dev-202610062254")).toBe(
      null,
    );
    expect(normalizeEngineVersion("codex", "0.161.0-alpha.1")).toBe(null);
    expect(normalizeEngineVersion("codex", null)).toBe(null);
    expect(normalizeEngineVersion("codex", "unknown")).toBe(null);
  });
});

describe("resolveEngineCompatibility", () => {
  const resolve = (driver: string, version: string | null) =>
    resolveEngineCompatibility({ driver, policies, version })!;

  it("marks the locally installed Grok 0.2.39 broken", () => {
    expect(resolve("grok", "grok 0.2.39 (55a20b703aa)")).toEqual({
      message:
        "Grok 0.2.39 predates the Grok Build agent protocol Sentinel drives. Update it with `grok update`.",
      recommendedRange: ">=1.0.13",
      recommendedVersion: null,
      status: "broken",
    });
    expect(resolve("grok", "1.0.13").status).toBe("supported");
  });

  it("evaluates Cursor date versions", () => {
    expect(resolve("cursor", "2026.08.04-aaa8809").status).toBe("supported");
    expect(resolve("cursor", "2026.04.01-abc").status).toBe("unknown");
  });

  it("splits the OpenCode generations", () => {
    expect(resolve("opencode", "1.18.35").status).toBe("supported");
    expect(resolve("opencode", "1.3.17")).toEqual(
      expect.objectContaining({
        message:
          "OpenCode 1.3.17 still works with Sentinel, but 1.14.19 or newer is recommended. Update it with `opencode upgrade`.",
        status: "graceful",
      }),
    );
    expect(resolve("opencode", "opencode v2.0.18").status).toBe("unsupported");
  });

  it("writes a default message with the recommendation", () => {
    expect(resolve("claude", "2.1.200")).toEqual(
      expect.objectContaining({
        message:
          "Claude 2.1.200 works with this version of Sentinel, with some features limited. Recommended: 2.1.280 or newer.",
        status: "graceful",
      }),
    );
    expect(resolve("claude", "2.1.300").message).toBe(null);
  });

  it("is unknown for versions it cannot read and null without a policy", () => {
    expect(resolve("codex", null)).toEqual(
      expect.objectContaining({ message: null, status: "unknown" }),
    );
    expect(
      resolveEngineCompatibility({ driver: "acp", policies, version: "1.0.0" }),
    ).toBe(null);
  });

  it("applies the policy for this Sentinel version only", () => {
    const scoped: EngineCompatibilityPolicy[] = [
      {
        driver: "codex",
        ranges: [{ range: ">=1.0.0", status: "supported" }],
        sentinelRange: ">=1.0.0",
      },
      {
        driver: "codex",
        ranges: [{ range: "<1.0.0", status: "broken" }],
        sentinelRange: "<1.0.0",
      },
    ];
    expect(
      findCompatibilityPolicy(scoped, "codex", "0.0.66")?.sentinelRange,
    ).toBe("<1.0.0");
    expect(
      resolveEngineCompatibility({
        driver: "codex",
        policies: scoped,
        sentinelVersion: "1.2.0",
        version: "0.5.0",
      })?.status,
    ).toBe("unknown");
  });
});

describe("combineCompatibilityAdvisories", () => {
  const advisory = (
    status: "broken" | "graceful" | "supported" | "unknown" | "unsupported",
    message: string | null = null,
  ) => ({
    message,
    recommendedRange: null,
    recommendedVersion: null,
    status,
  });

  it("keeps the more severe advisory", () => {
    expect(
      combineCompatibilityAdvisories(
        advisory("graceful", "runtime"),
        advisory("broken", "manifest"),
      )?.message,
    ).toBe("manifest");
    expect(
      combineCompatibilityAdvisories(
        advisory("unsupported", "runtime"),
        advisory("supported"),
      )?.message,
    ).toBe("runtime");
  });

  it("prefers the runtime on a tie and fills its recommendation", () => {
    expect(
      combineCompatibilityAdvisories(advisory("graceful", "runtime"), {
        ...advisory("graceful", "manifest"),
        recommendedVersion: "1.2.3",
      }),
    ).toEqual({
      message: "runtime",
      recommendedRange: null,
      recommendedVersion: "1.2.3",
      status: "graceful",
    });
  });

  it("lets a known manifest status replace a runtime unknown", () => {
    expect(
      combineCompatibilityAdvisories(advisory("unknown"), advisory("supported"))
        ?.status,
    ).toBe("supported");
    expect(
      combineCompatibilityAdvisories(advisory("supported"), advisory("unknown"))
        ?.status,
    ).toBe("supported");
  });

  it("falls back to whichever exists", () => {
    expect(combineCompatibilityAdvisories(null, null)).toBe(null);
    expect(
      combineCompatibilityAdvisories(advisory("broken"), null)?.status,
    ).toBe("broken");
    expect(
      combineCompatibilityAdvisories(null, advisory("graceful"))?.status,
    ).toBe("graceful");
  });
});

describe("version comparisons", () => {
  it("compares runtime-reported versions", () => {
    expect(
      isEngineVersionBelow("claude", "2.1.257 (Claude Code)", "2.1.280"),
    ).toBe(true);
    expect(isEngineVersionBelow("claude", "2.1.280", "2.1.280")).toBe(false);
    expect(isEngineVersionBelow("claude", null, "2.1.280")).toBe(false);
    expect(
      compareEngineVersions("cursor", "2026.08.04-a", "2026.10.01-b"),
    ).toBe(-1);
    expect(compareEngineVersions("codex", "x", "0.1.0")).toBe(null);
  });
});
