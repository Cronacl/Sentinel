import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ClaudeMcpResourceTool } from "./claude-mcp";
import { ClaudeGlobTool } from "./claude-search";
import { ClaudeSessionUtilityTool } from "./claude-session";
import { ClaudeToolSearchTool } from "./claude-utility";
import { ClaudeWebSearchTool } from "./claude-web";
import type { Renderer, RendererProps } from "../renderer";

const onApprove = mock(() => {});
const onDeny = mock(() => {});

function renderMarkup(part: RendererProps["part"], Renderer: Renderer) {
  return renderToStaticMarkup(
    <Renderer onApprove={onApprove} onDeny={onDeny} part={part} />,
  );
}

describe("Claude renderer consistency", () => {
  it("keeps Claude web search summaries aligned with search renderers", () => {
    const markup = renderMarkup(
      {
        input: { query: "mohamed achaq" },
        output: {
          durationSeconds: 1.2,
          query: "mohamed achaq",
          results: [
            {
              content: [
                { title: "Homepage", url: "https://example.com" },
                { title: "Profile", url: "https://example.org" },
              ],
            },
          ],
        },
        state: "output-available",
        toolCallId: "tool-call-websearch",
        toolName: "claude_websearch",
        type: "dynamic-tool",
      } as any,
      ClaudeWebSearchTool,
    );

    expect(markup).toContain("Searched");
    expect(markup).toContain("2 source");
    expect(markup).toContain("mohamed achaq");
  });

  it("uses action-oriented approval copy for Claude glob", () => {
    const markup = renderMarkup(
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

    expect(markup).toContain("Search for");
    expect(markup).toContain("Approve");
  });

  it("uses action-oriented summaries for Claude configuration tools", () => {
    const approvalMarkup = renderMarkup(
      {
        approval: { id: "approval-config", reason: "Needs permission" },
        input: { setting: "model", value: "opus" },
        state: "approval-requested",
        toolCallId: "tool-call-config-approval",
        toolName: "claude_config",
        type: "dynamic-tool",
      } as any,
      ClaudeSessionUtilityTool,
    );

    const outputMarkup = renderMarkup(
      {
        input: { setting: "model", value: "opus" },
        output: { operation: "set", setting: "model", success: true },
        state: "output-available",
        toolCallId: "tool-call-config-output",
        toolName: "claude_config",
        type: "dynamic-tool",
      } as any,
      ClaudeSessionUtilityTool,
    );

    expect(approvalMarkup).toContain("Update configuration");
    expect(outputMarkup).toContain("Updated configuration");
  });

  it("uses action-oriented summaries for Claude MCP tools", () => {
    const listMarkup = renderMarkup(
      {
        approval: { id: "approval-listmcp", reason: "Needs permission" },
        input: { server: "docs" },
        state: "approval-requested",
        toolCallId: "tool-call-listmcp",
        toolName: "claude_listmcpresources",
        type: "dynamic-tool",
      } as any,
      ClaudeMcpResourceTool,
    );

    const readMarkup = renderMarkup(
      {
        input: { server: "docs", uri: "docs://intro" },
        output: { contents: [{ text: "Intro", uri: "docs://intro" }] },
        state: "output-available",
        toolCallId: "tool-call-readmcp",
        toolName: "claude_readmcpresource",
        type: "dynamic-tool",
      } as any,
      ClaudeMcpResourceTool,
    );

    expect(listMarkup).toContain("List MCP resources");
    expect(readMarkup).toContain("Read MCP resource");
  });

  it("keeps Claude tool lookup aligned with utility renderer copy", () => {
    const markup = renderMarkup(
      {
        input: { query: "search the web" },
        output: [{ tool_name: "WebSearch", type: "tool_reference" }],
        state: "output-available",
        toolCallId: "tool-call-toolsearch",
        toolName: "claude_toolsearch",
        type: "dynamic-tool",
      } as any,
      ClaudeToolSearchTool,
    );

    expect(markup).toContain("Found");
    expect(markup).toContain("1 tool");
  });
});
