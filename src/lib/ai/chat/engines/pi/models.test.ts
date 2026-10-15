import { describe, expect, it, mock } from "bun:test";

import { engineModelSchema } from "../contract";
import {
  parsePiCompactCommand,
  PI_GATE_COMMAND,
  readPiCommands,
} from "./commands";
import {
  clampPiThinkingLevel,
  parsePiModelSlug,
  piLevelFromEffort,
  supportedPiThinkingLevels,
  toPiEngineModels,
} from "./models";

mock.module("server-only", () => ({}));
const { buildPiLaunch, PiLaunchArgumentError, validatePiLaunchArgs } =
  await import("./launch");
const { PI_EXTENSION_SOURCE, readPiToolApproval } = await import("./extension");

const sonnet = {
  contextWindow: 200_000,
  id: "claude-sonnet-4",
  input: ["text", "image"],
  name: "Claude Sonnet 4",
  provider: "anthropic",
  reasoning: true,
  thinkingLevelMap: { max: null, minimal: null, xhigh: null },
};
const gpt = {
  id: "gpt-5.6",
  name: "GPT-5.6",
  provider: "openai",
  reasoning: true,
  thinkingLevelMap: { xhigh: "xhigh" },
};

describe("Pi thinking levels", () => {
  it("follows pi-ai's per-model ladder", () => {
    expect(supportedPiThinkingLevels(sonnet)).toEqual([
      "off",
      "low",
      "medium",
      "high",
    ]);
    expect(supportedPiThinkingLevels(gpt)).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(supportedPiThinkingLevels({ ...gpt, reasoning: false })).toEqual([]);
  });

  it("clamps up first, then down", () => {
    expect(clampPiThinkingLevel("minimal", ["off", "low", "high"])).toBe("low");
    expect(clampPiThinkingLevel("max", ["off", "low", "high"])).toBe("high");
    expect(clampPiThinkingLevel("high", [])).toBeNull();
    expect(piLevelFromEffort("none")).toBe("off");
    expect(piLevelFromEffort("xhigh")).toBe("xhigh");
    expect(piLevelFromEffort(undefined)).toBeNull();
  });
});

describe("Pi models", () => {
  it("splits slugs at the first slash and never sends default", () => {
    expect(parsePiModelSlug("openrouter/anthropic/claude")).toEqual({
      modelId: "anthropic/claude",
      provider: "openrouter",
    });
    expect(parsePiModelSlug("default")).toBeNull();
    expect(parsePiModelSlug("nope")).toBeNull();
    expect(parsePiModelSlug("/x")).toBeNull();
  });

  it("lists Pi default first, then every provider/id with its levels", () => {
    const models = toPiEngineModels({
      current: sonnet,
      models: [sonnet, gpt, sonnet],
      thinkingLevel: "high",
    });
    expect(models.map((model) => model.id)).toEqual([
      "default",
      "anthropic/claude-sonnet-4",
      "openai/gpt-5.6",
    ]);
    for (const model of models) {
      expect(engineModelSchema.safeParse(model).success).toBe(true);
    }
    expect(models[0]).toMatchObject({
      inputModalities: ["text", "image"],
      isDefault: true,
    });
    const choices = models[1]!.options[0];
    expect(choices).toMatchObject({ id: "effort", role: "reasoning" });
    expect(
      choices?.type === "select"
        ? choices.choices.map((choice) => choice.id)
        : [],
    ).toEqual(["none", "low", "medium", "high"]);
    expect(
      choices?.type === "select"
        ? choices.choices.find((choice) => choice.isDefault)?.id
        : null,
    ).toBe("high");
    expect(models[1]).toMatchObject({
      contextWindow: 200_000,
      subProvider: "anthropic",
    });
    expect(toPiEngineModels({ models: [] })).toEqual([]);
  });
});

describe("Pi commands", () => {
  it("adds /compact, lists skills and spots Sentinel's gate", () => {
    const commands = readPiCommands({
      commands: [
        {
          name: "fix-tests",
          source: "prompt",
          sourceInfo: { path: "/p/fix.md" },
        },
        {
          description: "Review code",
          name: "skill:review",
          source: "skill",
          sourceInfo: { path: "/s/review/SKILL.md", scope: "user" },
        },
        { name: PI_GATE_COMMAND, source: "extension", sourceInfo: {} },
        { name: "compact", source: "extension", sourceInfo: {} },
      ],
    });
    expect(commands.gateLoaded).toBe(true);
    expect(commands.slashCommands.map((command) => command.name)).toEqual([
      "compact",
      "fix-tests",
      "skill:review",
    ]);
    expect(commands.skills).toEqual([
      {
        description: "Review code",
        enabled: true,
        name: "review",
        path: "/s/review/SKILL.md",
        scope: "user",
        userInvocable: true,
      },
    ]);
    expect(readPiCommands(null).gateLoaded).toBe(false);
  });

  it("parses /compact with optional instructions", () => {
    expect(parsePiCompactCommand("/compact")).toEqual({});
    expect(parsePiCompactCommand("  /compact keep the API notes ")).toEqual({
      customInstructions: "keep the API notes",
    });
    expect(parsePiCompactCommand("/compacting")).toBeNull();
    expect(parsePiCompactCommand("please /compact")).toBeNull();
  });
});

describe("Pi launch", () => {
  const binary = {
    env: { PATH: "/login/bin" },
    path: "/bin/pi",
    source: "config" as const,
    version: "1.0.4",
  };

  it("refuses arguments that pick the mode or the session", () => {
    for (const arg of [
      "--mode",
      "--session=/x",
      "--no-session",
      "-c",
      "--resume",
      "--print",
    ]) {
      expect(() => validatePiLaunchArgs([arg])).toThrow(PiLaunchArgumentError);
    }
    expect(
      validatePiLaunchArgs(["--provider", "openai", "--model", "gpt-5.6"]),
    ).toEqual(["--provider", "openai", "--model", "gpt-5.6"]);
    expect(() => validatePiLaunchArgs(["--", "--mode"])).toThrow(
      PiLaunchArgumentError,
    );
  });

  it("splits built-in equals forms and refuses prompts, unknown short flags and a provider without a model", () => {
    expect(
      validatePiLaunchArgs([
        "--model=anthropic/claude-sonnet-5",
        "--no-skills",
        "--my-flag",
        "on",
        "--other=1",
      ]),
    ).toEqual([
      "--model",
      "anthropic/claude-sonnet-5",
      "--no-skills",
      "--my-flag",
      "on",
      "--other=1",
    ]);
    for (const args of [
      ["fix the bug"],
      ["-z"],
      ["--provider", "anthropic"],
      ["--thinking"],
    ]) {
      expect(() => validatePiLaunchArgs(args)).toThrow(PiLaunchArgumentError);
    }
  });

  it("puts the mode first, the user's arguments next and Sentinel's extension last", () => {
    const launch = buildPiLaunch({
      binary,
      cwd: "/repo",
      extensionPath: "/state/pi/ext.ts",
      instance: {
        config: { launchArgs: ["--thinking", "high"] },
        env: { A: "1", PATH: "/usr/bin" },
      },
    });
    expect(launch).toEqual({
      args: [
        "--mode",
        "rpc",
        "--thinking",
        "high",
        "--extension",
        "/state/pi/ext.ts",
      ],
      command: "/bin/pi",
      cwd: "/repo",
      env: { A: "1", PATH: "/login/bin" },
    });
    expect(
      buildPiLaunch({
        binary,
        cwd: "/p",
        ephemeral: true,
        instance: { config: {}, env: {} },
      }).args,
    ).toEqual(["--mode", "rpc", "--no-session"]);
  });
});

describe("Pi extension", () => {
  it("asks about every tool call and reads its own confirms back", () => {
    expect(PI_EXTENSION_SOURCE).toContain(`pi.on("tool_call"`);
    expect(PI_EXTENSION_SOURCE).toContain(PI_GATE_COMMAND);
    expect(PI_EXTENSION_SOURCE).not.toContain("import ");
    const message = `sentinel-tool-call:${JSON.stringify({
      input: { command: "ls" },
      toolCallId: "t1",
      toolName: "bash",
    })}`;
    expect(readPiToolApproval(message)).toEqual({
      input: { command: "ls" },
      toolCallId: "t1",
      toolName: "bash",
    });
    expect(readPiToolApproval("Delete the file?")).toBeNull();
    expect(readPiToolApproval("sentinel-tool-call:{oops")).toBeNull();
  });
});
