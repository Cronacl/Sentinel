import { afterAll, describe, expect, it, mock } from "bun:test";

import type { ProbeOptions } from "@/lib/ai/chat/engines/platform/driver";

import type { PiMockScenario } from "./__tests__/mock-pi";

// The Pi probe against the Pi mock behind a real `pi` launcher: the binary
// is resolved and version-checked, a full probe runs an ephemeral
// `pi --mode rpc --no-session`, a cheap one spawns nothing, and an aborted
// probe kills Pi.
mock.module("server-only", () => ({}));

const { probePiEngine } = await import("./probe");
const { invalidatePiBinaryResolutions } = await import("./binary");
const { engineProbeResultSchema } = await import("../contract");
const support = await import("./__tests__/mock-pi");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) support.removeTempDir(dir);
});

function setup(scenario: PiMockScenario = {}) {
  invalidatePiBinaryResolutions();
  const dir = support.makeTempDir("probe");
  dirs.push(dir);
  return support.mockPiInstance(scenario, dir);
}

function options(overrides: Partial<ProbeOptions> = {}): ProbeOptions {
  return {
    depth: "full",
    forceRefresh: true,
    reason: "user",
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe.skipIf(process.platform === "win32")("probePiEngine", () => {
  it("lists Pi's models, commands and skills without a session", async () => {
    const instance = setup({
      commands: [
        {
          name: "fix-tests",
          source: "prompt",
          sourceInfo: { path: "/p/fix.md" },
        },
        {
          name: "skill:review",
          source: "skill",
          sourceInfo: { path: "/s/SKILL.md" },
        },
      ],
      state: { model: "openai/gpt-5.6", thinkingLevel: "high" },
    });
    const result = await probePiEngine(instance, options());

    expect(engineProbeResultSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.install).toMatchObject({
      installed: true,
      path: instance.config.binaryPath,
      source: "config",
      version: support.MOCK_PI_VERSION,
    });
    expect(result.auth.status).toBe("authenticated");
    expect(result.defaultModelId).toBe("default");
    expect(result.models.map((model) => model.id)).toEqual([
      "default",
      "anthropic/claude-sonnet-4-20250514",
      "openai/gpt-5.6",
    ]);
    expect(result.models[0]?.description).toContain("GPT-5.6");
    expect(result.slashCommands?.map((command) => command.name)).toEqual([
      "compact",
      "fix-tests",
      "skill:review",
    ]);
    expect(result.skills?.map((skill) => skill.name)).toEqual(["review"]);
    expect(
      support
        .piCommands(instance.logPath)
        .map((command) => command.type)
        .sort(),
    ).toEqual(["get_available_models", "get_commands", "get_state"]);
  });

  it("reports a signed-out Pi when no model has credentials", async () => {
    const result = await probePiEngine(
      setup({ models: [], state: { model: null } }),
      options(),
    );
    expect(result.status).toBe("warning");
    expect(result.auth.status).toBe("unauthenticated");
    expect(result.models).toEqual([]);
    expect(result.message).toContain("/login");
  });

  it("answers cheap probes from the last full result without spawning", async () => {
    const instance = setup();
    const full = await probePiEngine(instance, options());
    const before = support.piCommands(instance.logPath).length;
    const cheap = await probePiEngine(
      instance,
      options({
        depth: "cheap",
        forceRefresh: false,
        previous: full,
        reason: "interval",
      }),
    );
    expect(cheap).toEqual(full);
    expect(support.piCommands(instance.logPath)).toHaveLength(before);
  });

  it("reports a missing or refused binary as not installed", async () => {
    const instance = setup();
    instance.config.binaryPath = "/nonexistent/pi";
    const missing = await probePiEngine(instance, options());
    expect(missing.install.installed).toBe(false);
    expect(missing.status).toBe("error");
    expect(missing.message).toContain("/nonexistent/pi");

    const refused = setup();
    refused.config.launchArgs = ["--session", "/x.jsonl"];
    const result = await probePiEngine(refused, options());
    expect(result.status).toBe("error");
    expect(result.message).toContain("--session");
  });

  it("kills Pi and reports stale when the platform gives up", async () => {
    const instance = setup({ hangCommands: ["get_available_models"] });
    const controller = new AbortController();
    const pending = probePiEngine(
      instance,
      options({ signal: controller.signal }),
    );
    await support.waitUntil(
      () => support.piCommands(instance.logPath).length > 0,
      "the probe's first command",
    );
    controller.abort();
    const result = await pending;
    expect(result.status).toBe("error");
    expect(result.stale).toBe(true);
    expect(result.install.installed).toBe(true);
  });

  it("fails cleanly when Pi crashes at startup", async () => {
    const result = await probePiEngine(
      setup({
        faults: {
          exitAfterMs: 100,
          exitCode: 2,
          startupStderr: "bad config\n",
        },
        hangCommands: ["get_available_models"],
      }),
      options(),
    );
    expect(result.status).toBe("error");
    expect(result.message).toContain("bad config");
  });
});
