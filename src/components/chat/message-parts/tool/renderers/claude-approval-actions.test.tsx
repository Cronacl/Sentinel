import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ClaudeAgentTool } from "./claude-agent";
import { ClaudeFileReadTool } from "./claude-file-read";
import { ClaudeMcpResourceTool } from "./claude-mcp";
import { ClaudeGlobTool } from "./claude-search";
import { ClaudeSessionUtilityTool } from "./claude-session";
import { ClaudeTodoWriteTool } from "./claude-todo";
import { ClaudeToolSearchTool, ClaudeListDirTool } from "./claude-utility";
import { ClaudeWebSearchTool } from "./claude-web";
import type { Renderer, RendererProps } from "../renderer";

const onApprove = mock(() => {});
const onDeny = mock(() => {});

function renderApprovalMarkup(part: RendererProps["part"], Renderer: Renderer) {
  return renderToStaticMarkup(
    <Renderer onApprove={onApprove} onDeny={onDeny} part={part} />,
  );
}

describe("Claude specialized approval actions", () => {
  it("renders approval actions for claude_websearch", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-web", reason: "Needs permission" },
        input: { query: "mohamed achaq" },
        state: "approval-requested",
        toolCallId: "tool-call-web",
        toolName: "claude_websearch",
        type: "dynamic-tool",
      } as any,
      ClaudeWebSearchTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_glob", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-glob", reason: "Needs permission" },
        input: { pattern: "**/*.ts" },
        state: "approval-requested",
        toolCallId: "tool-call-glob",
        toolName: "claude_glob",
        type: "dynamic-tool",
      } as any,
      ClaudeGlobTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_agent", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-agent", reason: "Needs permission" },
        input: {
          description: "Search for a source",
          prompt: "Find relevant sources",
          subagent_type: "general-purpose",
        },
        state: "approval-requested",
        toolCallId: "tool-call-agent",
        toolName: "claude_agent",
        type: "dynamic-tool",
      } as any,
      ClaudeAgentTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_read", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-read", reason: "Needs permission" },
        input: { file_path: "/tmp/test.txt" },
        state: "approval-requested",
        toolCallId: "tool-call-read",
        toolName: "claude_read",
        type: "dynamic-tool",
      } as any,
      ClaudeFileReadTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_toolsearch", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-toolsearch", reason: "Needs permission" },
        input: { query: "search the web" },
        state: "approval-requested",
        toolCallId: "tool-call-toolsearch",
        toolName: "claude_toolsearch",
        type: "dynamic-tool",
      } as any,
      ClaudeToolSearchTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_ls", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-ls", reason: "Needs permission" },
        input: { path: "." },
        state: "approval-requested",
        toolCallId: "tool-call-ls",
        toolName: "claude_ls",
        type: "dynamic-tool",
      } as any,
      ClaudeListDirTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_todowrite", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-todo", reason: "Needs permission" },
        input: {
          todos: [
            {
              activeForm: "Searching",
              content: "Search for sources",
              status: "pending",
            },
          ],
        },
        state: "approval-requested",
        toolCallId: "tool-call-todo",
        toolName: "claude_todowrite",
        type: "dynamic-tool",
      } as any,
      ClaudeTodoWriteTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_config", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-config", reason: "Needs permission" },
        input: { setting: "model", value: "opus" },
        state: "approval-requested",
        toolCallId: "tool-call-config",
        toolName: "claude_config",
        type: "dynamic-tool",
      } as any,
      ClaudeSessionUtilityTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });

  it("renders approval actions for claude_readmcpresource", () => {
    const markup = renderApprovalMarkup(
      {
        approval: { id: "approval-readmcp", reason: "Needs permission" },
        input: { server: "docs", uri: "docs://index" },
        state: "approval-requested",
        toolCallId: "tool-call-readmcp",
        toolName: "claude_readmcpresource",
        type: "dynamic-tool",
      } as any,
      ClaudeMcpResourceTool,
    );

    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
  });
});
