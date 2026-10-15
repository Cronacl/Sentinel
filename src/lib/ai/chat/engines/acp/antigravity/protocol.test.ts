import { describe, expect, it } from "bun:test";

import { readConfigOptions } from "../config-options";
import {
  ANTIGRAVITY_DEFAULT_MODEL_ALIAS,
  antigravityPermissionModeId,
  antigravityToolKind,
  handleAntigravityPermissionRequest,
  normalizeAntigravityInbound,
  normalizeAntigravityPermissionParams,
  normalizeAntigravityToolUpdate,
  readAntigravityQuestion,
  resolveAntigravityModelSelection,
} from "./protocol";

const session = {
  configOptions: readConfigOptions([
    {
      category: "model",
      currentValue: "gemini-3.8-flash-medium",
      id: "model",
      name: "Model",
      options: [
        { name: "High", value: "gemini-3.8-flash-high" },
        { name: "Medium", value: "gemini-3.8-flash-medium" },
      ],
      type: "select",
    },
  ]),
};

describe("Antigravity permission modes", () => {
  it("maps Sentinel's modes onto the session modes", () => {
    expect(antigravityPermissionModeId("full")).toBe("yolo");
    expect(antigravityPermissionModeId("accept_edits")).toBe("auto_edit");
    expect(antigravityPermissionModeId("default")).toBe("default");
    expect(antigravityPermissionModeId("auto")).toBe("default");
  });
});

describe("resolveAntigravityModelSelection", () => {
  it("keeps an explicit model and never sends an effort", () => {
    expect(
      resolveAntigravityModelSelection(
        { modelId: "gemini-3.8-flash-medium" },
        session,
        "gemini-3.8-flash-high",
      ),
    ).toEqual({ effort: null, modelId: "gemini-3.8-flash-medium" });
  });

  it("resolves the default (or its alias) to the manifest default the account offers", () => {
    for (const modelId of [null, ANTIGRAVITY_DEFAULT_MODEL_ALIAS]) {
      expect(
        resolveAntigravityModelSelection(
          { modelId },
          session,
          "gemini-3.8-flash-high",
        ).modelId,
      ).toBe("gemini-3.8-flash-high");
    }
  });

  it("keeps the agent's current model when the account lacks the default", () => {
    expect(
      resolveAntigravityModelSelection(
        { modelId: ANTIGRAVITY_DEFAULT_MODEL_ALIAS },
        session,
        "gemini-9-pro",
      ).modelId,
    ).toBe("gemini-3.8-flash-medium");
  });
});

describe("normalizeAntigravityToolUpdate", () => {
  it("maps native shell fields onto the card's names and marks it execute", () => {
    const next = normalizeAntigravityToolUpdate({
      rawInput: { CommandLine: "ls -la", Cwd: "/w" },
      rawOutput: { combinedOutput: "a\nb", exitCode: 0 },
      sessionUpdate: "tool_call",
      title: "Run",
      toolCallId: "t1",
    });
    expect(next.kind).toBe("execute");
    expect(next.rawInput).toEqual({
      command: "ls -la",
      CommandLine: "ls -la",
      cwd: "/w",
      Cwd: "/w",
    });
    expect(next.rawOutput).toEqual({
      combinedOutput: "a\nb",
      exitCode: 0,
      output: "a\nb",
    });
  });

  it("bounds tool text to the last 8,000 characters and drops inline images", () => {
    const next = normalizeAntigravityToolUpdate({
      content: [
        {
          content: { data: "AAAA", mimeType: "image/png", type: "image" },
          type: "content",
        },
      ],
      rawOutput: "x".repeat(20_000),
      sessionUpdate: "tool_call_update",
      toolCallId: "t1",
    });
    expect(String(next.rawOutput).length).toBeLessThan(8_100);
    expect(String(next.rawOutput)).toStartWith("[Earlier output truncated]");
    expect(next.content).toEqual([
      { content: { mimeType: "image/png", type: "image" }, type: "content" },
    ]);
  });
});

describe("Antigravity approvals and questions", () => {
  it("relabels options and shows the allow-always warning on the card", () => {
    const params = normalizeAntigravityPermissionParams({
      options: [
        { kind: "allow_once", name: "Yes", optionId: "a" },
        {
          _meta: {
            "agy.security.warning": { message: "Prompt injection risk." },
          },
          kind: "allow_always",
          name: "Always",
          optionId: "b",
        },
        { kind: "reject_once", name: "No", optionId: "c" },
      ],
      sessionId: "s",
      toolCall: { kind: "execute", title: "Run ls", toolCallId: "exec-1" },
    });
    expect(
      (params.options as Array<{ name: string }>).map((option) => option.name),
    ).toEqual(["Allow once", "Allow for this thread", "Deny"]);
    expect((params.toolCall as { content: unknown[] }).content).toEqual([
      {
        content: {
          text: "Allow for this thread: Prompt injection risk.",
          type: "text",
        },
        type: "content",
      },
    ]);
  });

  it("rewrites only session/update tool frames and permission requests", () => {
    const text = {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s",
        update: { sessionUpdate: "agent_message_chunk" },
      },
    };
    expect(normalizeAntigravityInbound(text as never)).toBe(text as never);
    const tool = normalizeAntigravityInbound({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s",
        update: {
          rawInput: { command_line: "pwd" },
          sessionUpdate: "tool_call",
          toolCallId: "t",
        },
      },
    } as never) as { params: { update: { kind: string } } };
    expect(tool.params.update.kind).toBe("execute");
  });

  it("reads interaction_ requests as one single-choice question", () => {
    const params = {
      options: [
        { kind: "allow_once", name: "main", optionId: "main" },
        { kind: "allow_once", name: "dev", optionId: "dev" },
      ],
      toolCall: { title: "Which branch?", toolCallId: "interaction_1" },
    };
    expect(readAntigravityQuestion(params)).toEqual({
      optionIds: ["main", "dev"],
      question: {
        id: "interaction_1",
        multiSelect: false,
        options: [
          { id: "main", label: "main" },
          { id: "dev", label: "dev" },
        ],
        question: "Which branch?",
      },
    });
    expect(
      readAntigravityQuestion({
        ...params,
        toolCall: { toolCallId: "edit-1" },
      }),
    ).toBeNull();
  });

  it("answers a question with the chosen option, or cancels", async () => {
    const params = {
      options: [{ name: "dev", optionId: "dev" }],
      toolCall: { title: "Branch?", toolCallId: "interaction_2" },
    };
    const context = (answer: string[] | null) =>
      ({
        askUser: async () =>
          answer
            ? {
                additionalContext: null,
                answers: [
                  { questionId: "interaction_2", selectedOptionIds: answer },
                ],
              }
            : null,
      }) as never;
    expect(
      await handleAntigravityPermissionRequest(params, context(["dev"])),
    ).toEqual({ outcome: { optionId: "dev", outcome: "selected" } });
    expect(
      await handleAntigravityPermissionRequest(params, context(null)),
    ).toEqual({ outcome: { outcome: "cancelled" } });
    expect(
      handleAntigravityPermissionRequest(
        { toolCall: { toolCallId: "edit" } },
        context(null),
      ),
    ).toBeNull();
  });

  it("shows start_subagent calls as subagents, not MCP tools of that name", () => {
    expect(
      antigravityToolKind({ kind: "other", title: "Running start_subagent" }),
    ).toBe("subagent");
    expect(
      antigravityToolKind({
        _meta: { is_mcp_tool_call: true },
        title: "Run start_subagent?",
      }),
    ).toBeNull();
    expect(
      antigravityToolKind({ kind: "read", title: "Running start_subagent" }),
    ).toBeNull();
  });
});
