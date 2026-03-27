import { describe, expect, it } from "bun:test";

import {
  extractClaudeAssistantToolResultBlock,
  extractClaudeUserToolResults,
  normalizeClaudeToolOutput,
} from "./claude-tool-output";

describe("normalizeClaudeToolOutput", () => {
  it("unwraps nested bash tool results", () => {
    const output = normalizeClaudeToolOutput({
      content: {
        interrupted: false,
        return_code: 0,
        stderr: "",
        stdout: "total 0",
        type: "bash_code_execution_result",
      },
      tool_use_id: "tool-1",
      type: "bash_code_execution_tool_result",
    });

    expect(output).toEqual({
      exitCode: 0,
      interrupted: false,
      return_code: 0,
      stderr: "",
      stdout: "total 0",
      type: "bash_code_execution_result",
    });
  });

  it("converts content block arrays to stdout", () => {
    const output = normalizeClaudeToolOutput([
      { type: "text", text: "line 1" },
      { type: "text", text: "line 2" },
    ]);

    expect(output).toEqual({ stdout: "line 1\nline 2" });
  });

  it("passes through non-text arrays unchanged", () => {
    const arr = [{ type: "image", data: "abc" }];
    const output = normalizeClaudeToolOutput(arr);
    expect(output).toBe(arr);
  });

  it("promotes structured content text into stdout for bash outputs", () => {
    const output = normalizeClaudeToolOutput({
      interrupted: false,
      stderr: "",
      stdout: "",
      structuredContent: [
        { type: "text", text: "total 16" },
        { type: "text", text: "drwxr-xr-x  4 me  staff  128 ." },
      ],
    });

    expect(output).toEqual({
      interrupted: false,
      stderr: "",
      stdout: "total 16\ndrwxr-xr-x  4 me  staff  128 .",
      structuredContent: [
        { type: "text", text: "total 16" },
        { type: "text", text: "drwxr-xr-x  4 me  staff  128 ." },
      ],
    });
  });

  it("falls back to persisted output paths when inline stdout is empty", () => {
    const output = normalizeClaudeToolOutput({
      interrupted: false,
      persistedOutputPath: "/tmp/tool-results/bash-1.txt",
      stderr: "",
      stdout: "",
    });

    expect(output).toEqual({
      interrupted: false,
      persistedOutputPath: "/tmp/tool-results/bash-1.txt",
      stderr: "",
      stdout: "[Full output saved to /tmp/tool-results/bash-1.txt]",
    });
  });
});

describe("extractClaudeAssistantToolResultBlock", () => {
  it("extracts completed bash tool results from assistant blocks", () => {
    const result = extractClaudeAssistantToolResultBlock({
      content: {
        interrupted: false,
        return_code: 0,
        stderr: "",
        stdout: "total 0",
        type: "bash_code_execution_result",
      },
      tool_use_id: "tool-1",
      type: "bash_code_execution_tool_result",
    });

    expect(result).toEqual({
      output: {
        exitCode: 0,
        interrupted: false,
        return_code: 0,
        stderr: "",
        stdout: "total 0",
        type: "bash_code_execution_result",
      },
      state: "output-available",
      toolCallId: "tool-1",
      toolName: "claude_bash",
    });
  });
});

describe("extractClaudeUserToolResults", () => {
  it("extracts tool_result blocks from synthetic user messages", () => {
    const results = extractClaudeUserToolResults({
      message: {
        content: [
          {
            content: {
              interrupted: false,
              return_code: 0,
              stderr: "",
              stdout: "total 0",
              type: "bash_code_execution_result",
            },
            tool_use_id: "tool-1",
            type: "tool_result",
          },
        ],
        role: "user",
      },
      parent_tool_use_id: null,
      session_id: "session-1",
      type: "user",
    });

    expect(results).toEqual([
      {
        output: {
          exitCode: 0,
          interrupted: false,
          return_code: 0,
          stderr: "",
          stdout: "total 0",
          type: "bash_code_execution_result",
        },
        state: "output-available",
        toolCallId: "tool-1",
        toolName: "claude_bash",
      },
    ]);
  });

  it("prefers the structured top-level tool_use_result when present", () => {
    const results = extractClaudeUserToolResults({
      message: {
        content: "accepted",
        role: "user",
      },
      parent_tool_use_id: "tool-1",
      session_id: "session-1",
      tool_use_result: {
        interrupted: false,
        stderr: "",
        stdout: "ok",
        type: "bash_code_execution_result",
      },
      type: "user",
    });

    expect(results).toEqual([
      {
        output: {
          interrupted: false,
          stderr: "",
          stdout: "ok",
          type: "bash_code_execution_result",
        },
        state: "output-available",
        toolCallId: "tool-1",
        toolName: "claude_bash",
      },
    ]);
  });
});
