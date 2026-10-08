import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "bun:test";
import { z } from "zod";

import {
  ENGINE_MODEL_ID_PATTERN,
  computeEngineSnapshotUsable,
  createEngineInstanceInputSchema,
  customEngineModelSchema,
  defaultInstanceIdForDriver,
  driverKindSchema,
  engineEnvVarInputSchema,
  engineEventSchema,
  engineInstanceSummarySchema,
  engineOptionDescriptorSchema,
  engineProbeResultSchema,
  engineSnapshotSchema,
  fromStoredEngineInstanceId,
  mergeEngineUsageWindows,
  parseEngineSnapshot,
  toStoredEngineInstanceId,
  updateEngineInstanceInputSchema,
} from ".";
import { makeFakeInstance, makeFakeModel, makeFakeSnapshot } from "./testing";

describe("ids", () => {
  it("accepts driver slugs and keeps unknown kinds open", () => {
    for (const kind of ["codex", "gemini", "acp-registry", "my_fork"]) {
      expect(driverKindSchema.parse(kind)).toBe(kind);
    }
    for (const kind of ["", "Codex", "1codex", "codex:default", "a b"]) {
      expect(driverKindSchema.safeParse(kind).success).toBe(false);
    }
    expect(defaultInstanceIdForDriver("claude")).toBe("claude");
  });

  it("stores NULL for the default instance and reads NULL back as it", () => {
    expect(toStoredEngineInstanceId("codex", undefined)).toBeNull();
    expect(toStoredEngineInstanceId("codex", null)).toBeNull();
    expect(toStoredEngineInstanceId("codex", "codex")).toBeNull();
    expect(toStoredEngineInstanceId("codex", "codex-work")).toBe("codex-work");

    expect(fromStoredEngineInstanceId("codex", null)).toEqual({
      driver: "codex",
      instanceId: "codex",
    });
    expect(fromStoredEngineInstanceId("gemini", "gemini-cli")).toEqual({
      driver: "gemini",
      instanceId: "gemini-cli",
    });
  });
});

describe("models", () => {
  it("round-trips select and boolean option descriptors", () => {
    const descriptors = [
      {
        choices: [
          { id: "low", label: "Low" },
          { id: "max", isDefault: true, label: "Max" },
        ],
        id: "effort",
        label: "Reasoning",
        promptInjectedValues: ["ultrathink"],
        role: "reasoning",
        type: "select",
      },
      {
        defaultValue: false,
        id: "fastMode",
        label: "Fast",
        role: "fast",
        type: "boolean",
      },
    ];

    expect(z.array(engineOptionDescriptorSchema).parse(descriptors)).toEqual(
      descriptors as never,
    );
  });

  it("limits configured model ids to a shell-safe character set", () => {
    for (const id of [
      "claude-opus-5-5",
      "claude-opus-5-5[1m]",
      "anthropic/claude-sonnet-4-5",
      "gpt-5.6@high",
      "models:gemini-3",
    ]) {
      expect(ENGINE_MODEL_ID_PATTERN.test(id)).toBe(true);
      expect(customEngineModelSchema.safeParse({ id }).success).toBe(true);
    }
    for (const id of [
      "",
      "a b",
      "x;rm -rf /",
      "$(id)",
      "a`b`",
      "x".repeat(129),
    ]) {
      expect(customEngineModelSchema.safeParse({ id }).success).toBe(false);
    }
  });
});

describe("snapshots", () => {
  it("builds valid fake values", () => {
    expect(engineSnapshotSchema.parse(makeFakeSnapshot())).toEqual(
      makeFakeSnapshot(),
    );
    expect(makeFakeModel({ id: "m" }).id).toBe("m");
    expect(makeFakeInstance({ driver: "claude" })).toMatchObject({
      id: "claude",
      isDefault: true,
    });
  });

  it("computes usable in one place", () => {
    expect(makeFakeSnapshot().usable).toBe(true);

    const notUsable = [
      makeFakeSnapshot({ availability: "unavailable" }),
      makeFakeSnapshot({ enabled: false }),
      makeFakeSnapshot({ status: "error" }),
      makeFakeSnapshot({ status: "checking" }),
      makeFakeSnapshot({
        install: { installed: false, path: null, source: null, version: null },
      }),
      makeFakeSnapshot({
        auth: { ...makeFakeSnapshot().auth, status: "unauthenticated" },
      }),
      makeFakeSnapshot({
        compatibilityAdvisory: {
          message: null,
          recommendedRange: ">=1.0.13",
          recommendedVersion: null,
          status: "broken",
        },
      }),
    ];
    for (const snapshot of notUsable) {
      expect(computeEngineSnapshotUsable(snapshot)).toBe(false);
    }

    expect(
      computeEngineSnapshotUsable(
        makeFakeSnapshot({
          auth: { ...makeFakeSnapshot().auth, status: "unknown" },
          status: "warning",
        }),
      ),
    ).toBe(true);
  });

  it("drops persisted snapshots that no longer validate", () => {
    expect(parseEngineSnapshot(makeFakeSnapshot())).not.toBeNull();
    expect(parseEngineSnapshot({ instanceId: "codex" })).toBeNull();
    expect(parseEngineSnapshot("not json")).toBeNull();
  });

  it("never carries environment values or credentials", () => {
    const forbidden =
      /^(env|environment|token|accessToken|refreshToken|apiKey|secret|password|credentials?)$/i;
    const keys: string[] = [];
    const visit = (schema: z.ZodType) => {
      const def = (schema as unknown as { def?: Record<string, unknown> }).def;
      const shape = (schema as unknown as { shape?: Record<string, z.ZodType> })
        .shape;
      for (const [key, child] of Object.entries(shape ?? {})) {
        keys.push(key);
        visit(child);
      }
      for (const key of ["innerType", "element", "in", "out"]) {
        const child = def?.[key];
        if (child && typeof child === "object") {
          visit(child as z.ZodType);
        }
      }
      for (const option of (def?.options as z.ZodType[] | undefined) ?? []) {
        visit(option);
      }
    };

    visit(engineSnapshotSchema);
    visit(engineProbeResultSchema);

    expect(keys).toContain("usageLimits");
    expect(keys.filter((key) => forbidden.test(key))).toEqual([]);
  });
});

describe("instances", () => {
  it("validates env var names and defaults", () => {
    expect(engineEnvVarInputSchema.parse({ name: "XAI_API_KEY" })).toEqual({
      name: "XAI_API_KEY",
      sensitive: false,
      value: "",
    });
    for (const name of ["1X", "A-B", "", "A B", "x".repeat(129)]) {
      expect(engineEnvVarInputSchema.safeParse({ name }).success).toBe(false);
    }
  });

  it("describes instance summaries with redacted environment", () => {
    const summary = {
      accentColor: "#ff8800",
      availability: "available",
      config: { homePath: "/Users/me/.codex-work" },
      customModels: [{ id: "gpt-6-preview", name: "GPT-6 preview" }],
      driver: "codex",
      enabled: true,
      environment: [
        {
          name: "OPENAI_API_KEY",
          needsReentry: false,
          sensitive: true,
          value: "",
          valueRedacted: true,
        },
      ],
      id: "codex-work",
      isDefault: false,
      label: "Codex (work)",
      persisted: true,
      sortOrder: 1,
      unavailableReason: null,
    };

    expect(engineInstanceSummarySchema.parse(summary)).toEqual(
      summary as never,
    );
  });

  it("validates create and update inputs", () => {
    expect(
      createEngineInstanceInputSchema.parse({
        config: { homePath: "~/.codex-work" },
        driver: "codex",
        environment: [{ name: "OPENAI_API_KEY", sensitive: true, value: "x" }],
        label: "Work",
      }),
    ).toMatchObject({
      driver: "codex",
      environment: [{ name: "OPENAI_API_KEY", sensitive: true, value: "x" }],
    });

    for (const input of [
      { driver: "Codex" },
      { driver: "codex", id: "codex:work" },
      { accentColor: "orange", driver: "codex" },
      { driver: "codex", label: "" },
      { config: "binary", driver: "codex" },
    ]) {
      expect(createEngineInstanceInputSchema.safeParse(input).success).toBe(
        false,
      );
    }

    expect(
      updateEngineInstanceInputSchema.parse({
        accentColor: null,
        sortOrder: 2,
      }),
    ).toEqual({ accentColor: null, sortOrder: 2 });
    expect(
      updateEngineInstanceInputSchema.safeParse({ sortOrder: -1 }).success,
    ).toBe(false);
  });
});

describe("usage limits", () => {
  it("merges sparse window updates by id", () => {
    const session = {
      id: "five_hour",
      kind: "session" as const,
      label: "5h",
      usedPercent: 10,
    };
    const weekly = {
      id: "weekly",
      kind: "weekly" as const,
      label: "Week",
      usedPercent: 40,
    };

    expect(
      mergeEngineUsageWindows(
        [session, weekly],
        [{ ...session, usedPercent: 55 }],
      ),
    ).toEqual([{ ...session, usedPercent: 55 }, weekly]);
  });
});

describe("events", () => {
  it("round-trips every event type", () => {
    const events = [
      { snapshot: makeFakeSnapshot(), type: "snapshot", version: 1 },
      { instanceId: "codex-work", type: "snapshot-removed", version: 2 },
      {
        state: {
          expiresAt: null,
          flowId: "flow-1",
          instanceId: "claude",
          interaction: {
            args: ["login"],
            command: "/usr/local/bin/claude",
            env: { CLAUDE_CONFIG_DIR: "/tmp/claude" },
            id: "i-1",
            type: "terminal-command",
          },
          message: null,
          phase: "waiting",
        },
        type: "auth",
        version: 3,
      },
      {
        instanceId: "grok",
        type: "maintenance",
        updateState: {
          finishedAt: null,
          message: null,
          output: null,
          startedAt: "2026-10-07T00:00:00.000Z",
          status: "running",
        },
        version: 4,
      },
    ];

    for (const event of events) {
      expect(engineEventSchema.parse(event)).toEqual(event as never);
    }
  });
});

describe("client safety", () => {
  it("keeps contract/, state/ and catalog.ts free of Node and SDK imports", () => {
    const root = path.join(process.cwd(), "src/lib/ai/chat/engines");
    const files = [
      ...readdirSync(path.join(root, "contract")).map((file) =>
        path.join(root, "contract", file),
      ),
      ...readdirSync(path.join(root, "state")).map((file) =>
        path.join(root, "state", file),
      ),
      path.join(root, "catalog.ts"),
      path.join(root, "types.ts"),
    ].filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
        (match) => match[1],
      );

      for (const specifier of imports) {
        expect(
          /^(node:|fs$|path$|os$|child_process$|server-only$|@anthropic-ai\/|@github\/|@opencode-ai\/|@agentclientprotocol\/)/.test(
            specifier!,
          ),
        ).toBe(false);
      }
    }
  });
});
