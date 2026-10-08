import { describe, expect, it } from "bun:test";

import {
  catalogFromConfigOptions,
  findBuildModeId,
  findEffortOption,
  findModelOption,
  findPlanModeId,
  matchEffortValue,
  planEffortChange,
  planModelChange,
  readConfigOptions,
  toAcpEngineModels,
} from "./config-options";
import { readAgentCapabilities, readAuthMethods } from "./schema";
import { isJsonFrameLine } from "./stdout-filter";
import {
  buildAcpMcpServers,
  resolveForwardedStdioCwd,
  wrapStdioCommand,
} from "./mcp-forwarding";

const OPTIONS = readConfigOptions([
  {
    category: "mode",
    currentValue: "agent",
    id: "mode",
    name: "Mode",
    options: [
      { name: "Agent", value: "agent" },
      { name: "Plan", value: "plan" },
    ],
    type: "select",
  },
  {
    category: "model",
    currentValue: "default",
    id: "model",
    name: "Model",
    options: [
      {
        group: "auto",
        name: "Auto",
        options: [{ name: "Auto", value: "default" }],
      },
      {
        group: "frontier",
        name: "Frontier",
        options: [{ name: "GPT-5.4", value: "gpt-5.4" }],
      },
    ],
    type: "select",
  },
  {
    category: "thought_level",
    currentValue: "medium",
    id: "reasoning",
    name: "Reasoning",
    options: [
      { name: "Low", value: "low" },
      { name: "Medium", value: "medium" },
      { name: "Extra high", value: "extra-high" },
    ],
    type: "select",
  },
]);

describe("config options", () => {
  it("flattens grouped values and finds options by category", () => {
    expect(
      findModelOption(OPTIONS)?.values.map((value) => value.value),
    ).toEqual(["default", "gpt-5.4"]);
    expect(findEffortOption(OPTIONS)?.id).toBe("reasoning");
  });

  it("only sends a model the option lists and that differs", () => {
    expect(planModelChange(OPTIONS, "gpt-5.4")).toEqual({
      configId: "model",
      value: "gpt-5.4",
    });
    expect(planModelChange(OPTIONS, "default")).toBeNull();
    expect(planModelChange(OPTIONS, "unknown-model")).toBeNull();
    expect(planModelChange(OPTIONS, null)).toBeNull();
  });

  it("matches efforts with synonyms and never sends a value the agent lacks", () => {
    const values = findEffortOption(OPTIONS)!.values;
    expect(matchEffortValue("xhigh", values)).toBe("extra-high");
    expect(matchEffortValue("max", values)).toBe("extra-high");
    expect(matchEffortValue("high", values)).toBeNull();
    expect(planEffortChange(OPTIONS, "low")).toEqual({
      configId: "reasoning",
      value: "low",
    });
    expect(planEffortChange(OPTIONS, "medium")).toBeNull();
  });

  it("finds plan and build modes", () => {
    const modes = {
      availableModes: [
        { description: null, id: "agent", name: "Agent" },
        { description: null, id: "plan", name: "Plan" },
      ],
      currentModeId: "plan",
    };
    expect(findPlanModeId(modes)).toBe("plan");
    expect(findBuildModeId(modes, null)).toBe("agent");
    expect(findBuildModeId(modes, "plan")).toBe("agent");
  });

  it("learns the catalog from a session's options", () => {
    // A model picked for a thread is not the agent's default.
    expect(
      catalogFromConfigOptions(OPTIONS).map((model) => model.isDefault),
    ).toEqual([undefined, undefined]);
    const catalog = catalogFromConfigOptions(OPTIONS, {
      currentIsDefault: true,
    });
    expect(
      catalog.map((model) => [model.id, model.isDefault ?? false]),
    ).toEqual([
      ["default", true],
      ["gpt-5.4", false],
    ]);
    const [model] = toAcpEngineModels(catalog, { imageInput: true });
    expect(model).toEqual(
      expect.objectContaining({
        id: "default",
        inputModalities: ["text", "image"],
        options: [
          expect.objectContaining({
            choices: [
              { id: "low", label: "Low" },
              { id: "medium", isDefault: true, label: "Medium" },
              { id: "xhigh", label: "Extra high" },
            ],
            id: "effort",
          }),
        ],
      }),
    );
  });
});

describe("schema readers", () => {
  it("reads agent, terminal and env_var auth methods", () => {
    expect(
      readAuthMethods({
        authMethods: [
          { id: "cursor_login", name: "Cursor Login" },
          { args: ["login"], id: "tty", name: "Terminal", type: "terminal" },
          {
            id: "key",
            name: "API key",
            type: "env_var",
            vars: [{ name: "XAI_API_KEY" }],
          },
          { name: "no id" },
        ],
      }).map((method) => [method.id, method.kind, method.args, method.vars]),
    ).toEqual([
      ["cursor_login", "agent", [], []],
      ["tty", "terminal", ["login"], []],
      [
        "key",
        "env_var",
        [],
        [{ label: null, name: "XAI_API_KEY", optional: false }],
      ],
    ]);
  });

  it("reads capability flags leniently", () => {
    expect(
      readAgentCapabilities({
        agentCapabilities: {
          loadSession: true,
          mcpCapabilities: { http: true },
          promptCapabilities: { image: true },
          session: { resume: {} },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        imagePrompts: true,
        loadSession: true,
        mcpHttp: true,
        resumeSession: true,
      }),
    );
  });

  it("only lets JSON objects and arrays through the stdout filter", () => {
    expect(isJsonFrameLine('{"jsonrpc":"2.0"}')).toBe(true);
    expect(isJsonFrameLine("[1]")).toBe(true);
    expect(isJsonFrameLine("42")).toBe(false);
    expect(isJsonFrameLine("{oops")).toBe(false);
    expect(isJsonFrameLine("Open https://x")).toBe(false);
  });
});

describe("MCP forwarding", () => {
  const stdio = {
    config: {
      args: ["--port", "1"],
      command: "mcp-server",
      cwd: "/srv",
      envPassthrough: ["TOKEN"],
      envVars: [{ key: "MODE", value: "x" }],
    },
    id: "1",
    isEnabled: true,
    name: "My Server",
    transport: "stdio" as const,
  };
  const http = {
    config: {
      bearerTokenEnvVar: "API",
      headers: [{ key: "X-A", value: "1" }],
      headersFromEnv: [],
      url: "https://mcp.example.com",
    },
    id: "2",
    isEnabled: true,
    name: "Remote",
    transport: "http" as const,
  };

  it("forwards stdio (wrapped for its cwd) and http servers with resolved headers", async () => {
    const result = await buildAcpMcpServers([stdio, http], {
      capabilities: { mcpHttp: true },
      env: { API: "secret", TOKEN: "t" },
      exists: () => true,
      platform: "darwin",
    });
    expect(result.skipped).toEqual([]);
    expect(result.servers).toEqual([
      {
        args: [
          "-c",
          'cd "$1" && shift && exec "$@"',
          "sh",
          "/srv",
          "mcp-server",
          "--port",
          "1",
        ],
        command: "/bin/sh",
        env: [
          { name: "MODE", value: "x" },
          { name: "TOKEN", value: "t" },
        ],
        name: "My_Server",
      },
      {
        headers: [
          { name: "X-A", value: "1" },
          { name: "Authorization", value: "Bearer secret" },
        ],
        name: "Remote",
        type: "http",
        url: "https://mcp.example.com",
      },
    ]);
  });

  it("skips http servers for agents without http MCP, and servers missing their env", async () => {
    const result = await buildAcpMcpServers([stdio, http], {
      capabilities: { mcpHttp: false },
      env: {},
    });
    expect(result.servers).toEqual([]);
    expect(result.skipped.map((entry) => entry.name)).toEqual([
      "My Server",
      "Remote",
    ]);
  });

  it("resolves a server's cwd like Sentinel's own MCP client", () => {
    const withCwd = (cwd: string) => ({ config: { ...stdio.config, cwd } });
    const options = {
      exists: (directory: string) => directory !== "/gone",
      homeDir: "/Users/me",
    };
    expect(resolveForwardedStdioCwd(withCwd("~/tools/x"), options)).toBe(
      "/Users/me/tools/x",
    );
    expect(resolveForwardedStdioCwd(withCwd("~"), options)).toBe("/Users/me");
    // Missing: the agent starts it in the session's cwd, the workspace.
    expect(resolveForwardedStdioCwd(withCwd("/gone"), options)).toBeNull();
    expect(resolveForwardedStdioCwd(withCwd("  "), options)).toBeNull();
  });

  it("leaves commands without a cwd alone and wraps with cmd on Windows", () => {
    expect(wrapStdioCommand({ args: ["a"], command: "x" })).toEqual({
      args: ["a"],
      command: "x",
    });
    expect(
      wrapStdioCommand({ args: ["a"], command: "x", cwd: "C:\\w" }, "win32")
        .command,
    ).toBe("cmd.exe");
  });
});
