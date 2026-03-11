// @ts-nocheck

import { afterEach, describe, expect, it, mock } from "bun:test";

const tool = mock((config) => config);
const stepCountIs = mock(() => ({ kind: "stop-when" }));
const aiTestState = ((globalThis as any).__sentinelAiTestState ??= {
  agentConfig: null,
});

class MockToolLoopAgent {
  constructor(config) {
    aiTestState.agentConfig = config;
  }
}

mock.module("ai", () => ({
  stepCountIs,
  tool,
  ToolLoopAgent: MockToolLoopAgent,
}));

const { getDefaultToolApprovalPolicies } =
  await import("./tool-approval-policy");
const { createThreadAgent } = await import("./agent.ts");

afterEach(() => {
  aiTestState.agentConfig = null;
  mock.restore();
});

describe("createThreadAgent", () => {
  it("registers workspace inspection tools and guidance", async () => {
    createThreadAgent({
      defaultDirectory: "/tmp/workspace",
      languageModel: { kind: "model" },
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      systemPrompt: "System prompt",
      threadId: "thread-1",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: true, batchLimit: 10 },
    });

    expect(aiTestState.agentConfig.tools).toHaveProperty("websearch");
    expect(aiTestState.agentConfig.tools).toHaveProperty("webfetch");
    expect(aiTestState.agentConfig.tools).toHaveProperty("list");
    expect(aiTestState.agentConfig.tools).toHaveProperty("glob");
    expect(aiTestState.agentConfig.tools).toHaveProperty("read");
    expect(aiTestState.agentConfig.tools).toHaveProperty("grep");
    expect(aiTestState.agentConfig.tools).toHaveProperty("edit");
    expect(aiTestState.agentConfig.tools).toHaveProperty("create_file");
    expect(aiTestState.agentConfig.tools).toHaveProperty("delete_file");
    expect(aiTestState.agentConfig.tools).toHaveProperty("run_task");
    expect(aiTestState.agentConfig.tools).toHaveProperty("shell_command");
    expect(aiTestState.agentConfig.instructions).toContain(
      "Permission mode: default",
    );
    expect(aiTestState.agentConfig.instructions).toContain("read");
    expect(aiTestState.agentConfig.instructions).toContain("run_task");
    expect(aiTestState.agentConfig.instructions).toContain("grep");
    expect(aiTestState.agentConfig.instructions).toContain("list");
    expect(aiTestState.agentConfig.instructions).toContain("websearch");
    expect(aiTestState.agentConfig.instructions).toContain("webfetch");
    expect(aiTestState.agentConfig.instructions).toContain(
      "When using the searxng provider, use searchType auto and leave livecrawl unset.",
    );
    expect(aiTestState.agentConfig.instructions).toContain(
      "Batch webfetch is enabled",
    );
    expect(await aiTestState.agentConfig.tools.list.needsApproval({}, {})).toBe(
      false,
    );
    expect(await aiTestState.agentConfig.tools.edit.needsApproval({}, {})).toBe(
      true,
    );
    expect(
      await aiTestState.agentConfig.tools.websearch.needsApproval({}, {}),
    ).toBe(true);
  });

  it("keeps webfetch available without a workspace root", () => {
    createThreadAgent({
      languageModel: { kind: "model" },
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      systemPrompt: "System prompt",
      threadId: "thread-2",
      toolApprovalPolicies: getDefaultToolApprovalPolicies(),
      toolsEnabled: false,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
    });

    expect(Object.keys(aiTestState.agentConfig.tools)).toEqual([
      "websearch",
      "webfetch",
    ]);
    expect(aiTestState.agentConfig.instructions).toContain(
      "Workspace tools are currently unavailable because there is no selected workspace root.",
    );
    expect(aiTestState.agentConfig.instructions).toContain("websearch");
    expect(aiTestState.agentConfig.instructions).toContain("webfetch");
    expect(aiTestState.agentConfig.instructions).toContain(
      "Batch webfetch is disabled",
    );
  });

  it("uses per-tool approval overrides when deciding whether to pause", async () => {
    const toolApprovalPolicies = getDefaultToolApprovalPolicies();
    toolApprovalPolicies.list = true;
    toolApprovalPolicies.edit = false;

    createThreadAgent({
      defaultDirectory: "/tmp/workspace",
      languageModel: { kind: "model" },
      permissionMode: "default",
      searchProviders: {},
      searchSettings: {
        defaultProvider: "exa",
        defaultResultCount: 5,
        maxResultCount: 10,
      },
      systemPrompt: "System prompt",
      threadId: "thread-3",
      toolApprovalPolicies,
      toolsEnabled: true,
      webFetchSettings: { batchEnabled: false, batchLimit: 10 },
    });

    expect(await aiTestState.agentConfig.tools.list.needsApproval({}, {})).toBe(
      true,
    );
    expect(await aiTestState.agentConfig.tools.edit.needsApproval({}, {})).toBe(
      false,
    );
    expect(aiTestState.agentConfig.instructions).toContain(
      "list tool to inspect the linked project tree after approval.",
    );
    expect(aiTestState.agentConfig.instructions).toContain(
      "You can use the edit tool for file changes without approval.",
    );
  });
});
