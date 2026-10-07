import { describe, expect, it } from "bun:test";

import { CHAT_ENGINES } from "@/server/db/enums";

import {
  AVAILABLE_DRIVER_KINDS,
  BUILTIN_DRIVER_KINDS,
  DEFAULT_DRIVER_PERMISSION_MODES,
  DRIVER_CATALOG,
  getDriverLabel,
  getDriverMeta,
  getDriverPermissionModes,
  isAvailableDriverKind,
  isDefaultInstanceId,
  listDefaultInstanceDrivers,
} from "./catalog";
import { ENGINE_SLUG, engineCapabilitiesSchema } from "./contract";

describe("DRIVER_CATALOG", () => {
  it("describes every builtin kind under its own key", () => {
    expect(Object.keys(DRIVER_CATALOG).sort()).toEqual(
      [...BUILTIN_DRIVER_KINDS].sort(),
    );

    for (const kind of BUILTIN_DRIVER_KINDS) {
      const meta = DRIVER_CATALOG[kind];
      expect(meta.kind).toBe(kind);
      expect(ENGINE_SLUG.test(kind)).toBe(true);
      expect(engineCapabilitiesSchema.parse(meta.capabilities)).toEqual(
        meta.capabilities,
      );
      expect(meta.multiInstance).toBe(
        meta.capabilities.supportsMultipleInstances,
      );
    }
  });

  it("implements exactly the engines threads and requests accept today", () => {
    expect([...AVAILABLE_DRIVER_KINDS]).toEqual([...CHAT_ENGINES]);
    for (const kind of ["grok", "antigravity", "pi", "acp"]) {
      expect(isAvailableDriverKind(kind)).toBe(false);
      expect(getDriverMeta(kind)?.status).toBe("planned");
    }
  });

  it("uses one tool prefix per external driver", () => {
    const prefixes = new Set<string>();

    for (const kind of BUILTIN_DRIVER_KINDS) {
      const meta = DRIVER_CATALOG[kind];
      if (meta.runtime === "builtin") {
        expect(meta.toolPrefix).toBeNull();
        continue;
      }

      expect(meta.toolPrefix).toMatch(/^[a-z][a-z0-9]*_$/);
      expect(prefixes.has(meta.toolPrefix!)).toBe(false);
      prefixes.add(meta.toolPrefix!);
    }
  });

  it("lets every external driver run several instances", () => {
    for (const kind of BUILTIN_DRIVER_KINDS) {
      expect(DRIVER_CATALOG[kind].multiInstance).toBe(kind !== "sentinel");
    }
  });

  it("isolates instance homes where the runtime supports it", () => {
    expect(DRIVER_CATALOG.codex.homeEnvVar).toBe("CODEX_HOME");
    expect(DRIVER_CATALOG.claude.homeEnvVar).toBe("CLAUDE_CONFIG_DIR");
    expect(DRIVER_CATALOG.copilot.homeEnvVar).toBe("COPILOT_HOME");
    expect(DRIVER_CATALOG.grok.homeEnvVar).toBe("GROK_HOME");
    expect(DRIVER_CATALOG.antigravity.homeEnvVar).toBe("GEMINI_HOME");
  });

  it("keeps today's permission modes for every existing driver", () => {
    for (const kind of CHAT_ENGINES) {
      expect(getDriverPermissionModes(kind)).toEqual(
        DEFAULT_DRIVER_PERMISSION_MODES,
      );
    }
    expect(getDriverPermissionModes("gemini")).toEqual(
      DEFAULT_DRIVER_PERMISSION_MODES,
    );
  });
});

describe("driver config schemas", () => {
  it("accept an empty config except where a field is required", () => {
    for (const kind of BUILTIN_DRIVER_KINDS) {
      const result = DRIVER_CATALOG[kind].config.safeParse({});
      expect(result.success).toBe(kind !== "acp");
    }
    expect(
      DRIVER_CATALOG.acp.config.parse({
        agentId: "gemini",
        distribution: "npx",
      }),
    ).toEqual({ agentId: "gemini", distribution: "npx" });
  });

  it("keep unknown keys so newer config round-trips", () => {
    expect(
      DRIVER_CATALOG.codex.config.parse({
        binaryPath: "/opt/codex",
        futureFlag: true,
        homePath: "/Users/me/.codex-work",
      }),
    ).toEqual({
      binaryPath: "/opt/codex",
      futureFlag: true,
      homePath: "/Users/me/.codex-work",
    });
  });

  it("reject malformed known keys", () => {
    expect(
      DRIVER_CATALOG.claude.config.safeParse({ homePath: "" }).success,
    ).toBe(false);
    expect(
      DRIVER_CATALOG.pi.config.safeParse({ launchArgs: "--x" }).success,
    ).toBe(false);
  });
});

describe("catalog lookups", () => {
  it("treat unknown and prototype kinds as unknown", () => {
    expect(getDriverMeta("gemini")).toBeNull();
    expect(getDriverMeta("toString")).toBeNull();
    expect(getDriverMeta("__proto__")).toBeNull();
    expect(getDriverLabel("gemini")).toBe("gemini");
    expect(getDriverLabel("opencode")).toBe("OpenCode");
  });

  it("synthesize default instances for implemented drivers only", () => {
    expect(listDefaultInstanceDrivers()).toEqual([...CHAT_ENGINES]);
    expect(isDefaultInstanceId("codex", "codex")).toBe(true);
    expect(isDefaultInstanceId("codex-work", "codex")).toBe(false);
    expect(isDefaultInstanceId("acp", "acp")).toBe(false);
  });
});
