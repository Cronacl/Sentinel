import { describe, expect, it } from "bun:test";

import { resolveRenderer } from "./registry";
import { CodexRuntimeTool } from "./renderers/codex-runtime";
import { CodexFileChangeTool } from "./renderers/codex-file-change";
import { CodexImageViewTool } from "./renderers/codex-image-view";
import { CodexMcpTool } from "./renderers/codex-mcp";
import { CodexPlanTool } from "./renderers/codex-plan";
import { CodexShellTool } from "./renderers/codex-shell";
import {
  CodexCollabAgentTool,
  CodexContextCompactionTool,
  CodexReviewModeTool,
} from "./renderers/codex-status";
import { CodexUserInputTool } from "./renderers/codex-user-input";
import { CodexWebSearchTool } from "./renderers/codex-web-search";
import { GCalCreateEventTool } from "./renderers/integrations/gcal/gcal-create-event";
import { IntegrationGenericTool } from "./renderers/integrations/shared/generic";

describe("resolveRenderer", () => {
  it("uses the generic integration renderer for approval-requested integration tools", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-1" },
      input: { summary: "Sentinel Test Event" },
      state: "approval-requested",
      toolCallId: "tool-call-1",
      toolName: "gcal_create_event",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(IntegrationGenericTool);
  });

  it("uses the generic integration renderer for approval-requested static integration tools", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-1" },
      input: { summary: "Sentinel Test Event" },
      state: "approval-requested",
      toolCallId: "tool-call-1",
      type: "tool-gcal_create_event",
    } as const);

    expect(renderer).toBe(IntegrationGenericTool);
  });

  it("keeps the specialized integration renderer for completed integration tools", () => {
    const renderer = resolveRenderer({
      input: {
        endDateTime: "2026-03-16T11:00:00Z",
        startDateTime: "2026-03-16T10:00:00Z",
        summary: "Sentinel Test Event",
      },
      output: {
        end: "2026-03-16T11:00:00Z",
        htmlLink: "https://calendar.google.com",
        id: "event-1",
        start: "2026-03-16T10:00:00Z",
        status: "created",
        summary: "Sentinel Test Event",
      },
      state: "output-available",
      toolCallId: "tool-call-1",
      toolName: "gcal_create_event",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(GCalCreateEventTool);
  });

  it("uses the CodexShellTool renderer for codex_command_execution", () => {
    const renderer = resolveRenderer({
      input: { command: "npm test", cwd: "/workspace" },
      output: {
        output: "ok",
        exitCode: 0,
        durationMs: 52,
        status: "completed",
      },
      state: "output-available",
      toolCallId: "tool-call-codex-1",
      toolName: "codex_command_execution",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexShellTool);
  });

  it("uses the CodexFileChangeTool renderer for codex_file_change", () => {
    const renderer = resolveRenderer({
      input: { changes: [{ path: "src/main.ts", kind: "update" }] },
      output: { output: "diff --git ...", status: "completed" },
      state: "output-available",
      toolCallId: "tool-call-codex-fc",
      toolName: "codex_file_change",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexFileChangeTool);
  });

  it("uses the CodexWebSearchTool renderer for codex_web_search", () => {
    const renderer = resolveRenderer({
      input: { query: "how to test" },
      output: { action: null },
      state: "output-available",
      toolCallId: "tool-call-codex-ws",
      toolName: "codex_web_search",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexWebSearchTool);
  });

  it("uses the CodexMcpTool renderer for codex_mcp_tool_call", () => {
    const renderer = resolveRenderer({
      input: { arguments: {}, server: "test-server", tool: "list" },
      output: {
        durationMs: 100,
        error: null,
        result: null,
        status: "completed",
      },
      state: "output-available",
      toolCallId: "tool-call-codex-mcp",
      toolName: "codex_mcp_tool_call",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexMcpTool);
  });

  it("uses the CodexImageViewTool renderer for codex_image_view", () => {
    const renderer = resolveRenderer({
      input: { path: "/workspace/image.png" },
      output: { path: "/workspace/image.png" },
      state: "output-available",
      toolCallId: "tool-call-codex-iv",
      toolName: "codex_image_view",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexImageViewTool);
  });

  it("uses the CodexPlanTool renderer for codex_plan", () => {
    const renderer = resolveRenderer({
      input: { kind: "plan" },
      output: { text: "Step 1: do thing" },
      state: "output-available",
      toolCallId: "tool-call-codex-plan",
      toolName: "codex_plan",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexPlanTool);
  });

  it("uses the CodexReviewModeTool renderer for codex_review_mode", () => {
    const renderer = resolveRenderer({
      input: { review: "", transition: "enteredReviewMode" },
      output: { review: "", transition: "enteredReviewMode" },
      state: "output-available",
      toolCallId: "tool-call-codex-rm",
      toolName: "codex_review_mode",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexReviewModeTool);
  });

  it("uses the CodexContextCompactionTool renderer for codex_context_compaction", () => {
    const renderer = resolveRenderer({
      input: { kind: "contextCompaction" },
      output: { kind: "contextCompaction" },
      state: "output-available",
      toolCallId: "tool-call-codex-cc",
      toolName: "codex_context_compaction",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexContextCompactionTool);
  });

  it("uses the CodexUserInputTool renderer for codex_user_input", () => {
    const renderer = resolveRenderer({
      input: { prompt: "Enter your name", requestId: "req-1" },
      output: { response: null },
      state: "approval-requested",
      toolCallId: "tool-call-codex-ui",
      toolName: "codex_user_input",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CodexUserInputTool);
  });

  it("uses the CodexCollabAgentTool renderer for codex_collab_agent", () => {
    const renderer = resolveRenderer({
      input: {
        prompt: null,
        receiverThreadIds: ["t1"],
        senderThreadId: "t0",
        tool: "agent",
      },
      output: { agentsStates: {}, status: "completed" },
      state: "output-available",
      toolCallId: "tool-call-codex-ca",
      toolName: "codex_collab_agent",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexCollabAgentTool);
  });

  it("uses the generic Codex renderer for other codex tools", () => {
    const renderer = resolveRenderer({
      input: { path: "/workspace/file.ts", content: "hello" },
      output: { status: "ok" },
      state: "output-available",
      toolCallId: "tool-call-codex-2",
      toolName: "codex_file_write",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(CodexRuntimeTool);
  });
});
