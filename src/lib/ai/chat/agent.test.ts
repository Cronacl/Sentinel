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

const { createThreadAgent } = await import("./agent.ts");

afterEach(() => {
  aiTestState.agentConfig = null;
  mock.restore();
});

describe("createThreadAgent", () => {
  it("registers workspace inspection tools and guidance", () => {
    createThreadAgent({
      defaultDirectory: "/tmp/workspace",
      languageModel: { kind: "model" },
      permissionMode: "default",
      systemPrompt: "System prompt",
      threadId: "thread-1",
      toolsEnabled: true,
    });

    expect(aiTestState.agentConfig.tools).toHaveProperty("list");
    expect(aiTestState.agentConfig.tools).toHaveProperty("glob");
    expect(aiTestState.agentConfig.tools).toHaveProperty("read");
    expect(aiTestState.agentConfig.tools).toHaveProperty("grep");
    expect(aiTestState.agentConfig.tools).toHaveProperty("edit");
    expect(aiTestState.agentConfig.tools).toHaveProperty("create_file");
    expect(aiTestState.agentConfig.tools).toHaveProperty("delete_file");
    expect(aiTestState.agentConfig.tools).toHaveProperty("run_task");
    expect(aiTestState.agentConfig.tools).toHaveProperty("shell_command");
    expect(aiTestState.agentConfig.instructions).toContain("Permission mode: default");
    expect(aiTestState.agentConfig.instructions).toContain("read");
    expect(aiTestState.agentConfig.instructions).toContain("run_task");
    expect(aiTestState.agentConfig.instructions).toContain("grep");
    expect(aiTestState.agentConfig.instructions).toContain("list");
  });
});
