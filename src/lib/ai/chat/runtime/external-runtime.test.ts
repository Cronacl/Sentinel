import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("../repo-checkpoints", () => ({
  beginThreadRepoCheckpointRun: mock(async () => true),
  clearThreadRepoCheckpointRun: mock(async () => {}),
  finalizeThreadRepoCheckpointRun: mock(async () => "checkpoint-1"),
  getThreadCheckpointAnchorMessageId: mock(() => null),
}));

const { buildExternalRuntimePromptText } = await import("./external-runtime");

describe("buildExternalRuntimePromptText", () => {
  it("includes minimal chat handoff context without tool expansion", () => {
    const prompt = buildExternalRuntimePromptText({
      message: {
        id: "user-2",
        metadata: {
          composerContext: {
            paths: [
              {
                absolutePath: "/tmp/workspace/src/app.ts",
                kind: "file",
                label: "src/app.ts",
                relativePath: "src/app.ts",
              },
            ],
            skills: [],
          },
        },
        parts: [
          { text: "Fix the failing test", type: "text" },
          {
            state: "output-available",
            toolCallId: "tool-1",
            toolName: "read",
            type: "dynamic-tool",
          } as any,
        ],
        role: "user",
      },
      threadMode: "chat",
      transcript: [
        {
          id: "user-1",
          metadata: {},
          parts: [{ text: "Earlier request", type: "text" }],
          role: "user",
        },
      ],
      workspaceRoot: "/tmp/workspace",
    });

    expect(prompt).toContain("Workspace root: /tmp/workspace.");
    expect(prompt).toContain("USER:\nEarlier request");
    expect(prompt).toContain("Latest user request:\nFix the failing test");
    expect(prompt).toContain("src/app.ts");
    expect(prompt).not.toContain("tool-1");
    expect(prompt).not.toContain("output-available");
  });

  it("prepends the plan-mode contract in plan mode", () => {
    const prompt = buildExternalRuntimePromptText({
      message: {
        id: "user-1",
        metadata: {},
        parts: [{ text: "Make a plan", type: "text" }],
        role: "user",
      },
      threadMode: "plan",
      transcript: [],
      workspaceRoot: null,
    });

    expect(prompt).toContain("Plan Mode");
    expect(prompt).toContain("<proposed_plan>");
    expect(prompt).toContain("Workspace root: unavailable.");
  });
});
