import { describe, expect, it } from "bun:test";

import { KNOWN_CLAUDE_RENDERER_TOOL_NAMES, resolveRenderer } from "./registry";
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
import { ClaudeAgentTool } from "./renderers/claude-agent";
import {
  ClaudeFileEditTool,
  ClaudeFileWriteTool,
} from "./renderers/claude-file-change";
import { ClaudeFileReadTool } from "./renderers/claude-file-read";
import { ClaudeMcpResourceTool } from "./renderers/claude-mcp";
import { ClaudePlanTool } from "./renderers/claude-plan";
import { ClaudeRuntimeTool } from "./renderers/claude-runtime";
import { ClaudeSessionUtilityTool } from "./renderers/claude-session";
import { ClaudeGlobTool, ClaudeGrepTool } from "./renderers/claude-search";
import { ClaudeShellTool } from "./renderers/claude-shell";
import { ClaudeTodoWriteTool } from "./renderers/claude-todo";
import { ClaudeUserInputTool } from "./renderers/claude-user-input";
import {
  ClaudeListDirTool,
  ClaudeToolSearchTool,
} from "./renderers/claude-utility";
import {
  ClaudeWebFetchTool,
  ClaudeWebSearchTool,
} from "./renderers/claude-web";
import { SkillTool } from "./renderers/skill";
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
    } as any);

    expect(renderer).toBe(IntegrationGenericTool);
  });

  it("uses the generic integration renderer for approval-requested static integration tools", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-1" },
      input: { summary: "Sentinel Test Event" },
      state: "approval-requested",
      toolCallId: "tool-call-1",
      type: "tool-gcal_create_event",
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

    expect(renderer).toBe(CodexRuntimeTool);
  });

  it("uses the ClaudeShellTool renderer for claude_bash", () => {
    const renderer = resolveRenderer({
      input: { command: "ls -la" },
      output: { stdout: "total 0", stderr: "", interrupted: false },
      state: "output-available",
      toolCallId: "tool-call-claude-bash",
      toolName: "claude_bash",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeShellTool);
  });

  it("uses the ClaudeFileEditTool renderer for claude_edit", () => {
    const renderer = resolveRenderer({
      input: {
        file_path: "src/main.ts",
        old_string: "foo",
        new_string: "bar",
      },
      state: "output-available",
      toolCallId: "tool-call-claude-edit",
      toolName: "claude_edit",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeFileEditTool);
  });

  it("uses the ClaudeFileWriteTool renderer for claude_write", () => {
    const renderer = resolveRenderer({
      input: { file_path: "src/new.ts", content: "hello" },
      state: "output-available",
      toolCallId: "tool-call-claude-write",
      toolName: "claude_write",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeFileWriteTool);
  });

  it("uses the ClaudeFileReadTool renderer for claude_read", () => {
    const renderer = resolveRenderer({
      input: { file_path: "src/main.ts" },
      state: "output-available",
      toolCallId: "tool-call-claude-read",
      toolName: "claude_read",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeFileReadTool);
  });

  it("uses the SkillTool renderer for claude_skill", () => {
    const renderer = resolveRenderer({
      input: { skill: "simplify" },
      output: "Launching skill: simplify",
      state: "output-available",
      toolCallId: "tool-call-claude-skill",
      toolName: "claude_skill",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(SkillTool);
  });

  it("uses the ClaudeGlobTool renderer for claude_glob", () => {
    const renderer = resolveRenderer({
      input: { pattern: "**/*.ts" },
      output: {
        filenames: ["a.ts"],
        numFiles: 1,
        durationMs: 10,
        truncated: false,
      },
      state: "output-available",
      toolCallId: "tool-call-claude-glob",
      toolName: "claude_glob",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeGlobTool);
  });

  it("uses the ClaudeGlobTool renderer for approval-requested claude_glob", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-claude-glob", reason: "Needs permission" },
      input: { pattern: "**/*.ts" },
      state: "approval-requested",
      toolCallId: "tool-call-claude-glob-approval",
      toolName: "claude_glob",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeGlobTool);
  });

  it("uses the ClaudeGrepTool renderer for claude_grep", () => {
    const renderer = resolveRenderer({
      input: { pattern: "TODO" },
      output: { filenames: ["a.ts"], numFiles: 1 },
      state: "output-available",
      toolCallId: "tool-call-claude-grep",
      toolName: "claude_grep",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeGrepTool);
  });

  it("uses the ClaudeGrepTool renderer for approval-requested claude_grep", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-claude-grep", reason: "Needs permission" },
      input: { pattern: "TODO" },
      state: "approval-requested",
      toolCallId: "tool-call-claude-grep-approval",
      toolName: "claude_grep",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeGrepTool);
  });

  it("uses the ClaudeWebSearchTool renderer for claude_websearch", () => {
    const renderer = resolveRenderer({
      input: { query: "bun test" },
      output: { query: "bun test", results: [], durationSeconds: 1.2 },
      state: "output-available",
      toolCallId: "tool-call-claude-ws",
      toolName: "claude_websearch",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeWebSearchTool);
  });

  it("uses the ClaudeWebSearchTool renderer for approval-requested claude_websearch", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-claude-websearch", reason: "Needs permission" },
      input: { query: "bun test" },
      state: "approval-requested",
      toolCallId: "tool-call-claude-ws-approval",
      toolName: "claude_websearch",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeWebSearchTool);
  });

  it("uses the ClaudeWebFetchTool renderer for claude_webfetch", () => {
    const renderer = resolveRenderer({
      input: { url: "https://example.com", prompt: "summarize" },
      state: "output-available",
      toolCallId: "tool-call-claude-wf",
      toolName: "claude_webfetch",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeWebFetchTool);
  });

  it("uses the ClaudeWebFetchTool renderer for approval-requested claude_webfetch", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-claude-webfetch", reason: "Needs permission" },
      input: { prompt: "summarize", url: "https://example.com" },
      state: "approval-requested",
      toolCallId: "tool-call-claude-wf-approval",
      toolName: "claude_webfetch",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeWebFetchTool);
  });

  it("uses the ClaudeAgentTool renderer for claude_agent", () => {
    const renderer = resolveRenderer({
      input: {
        description: "test",
        prompt: "do thing",
        subagent_type: "general",
      },
      state: "output-available",
      toolCallId: "tool-call-claude-agent",
      toolName: "claude_agent",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeAgentTool);
  });

  it("uses the ClaudeAgentTool renderer for approval-requested claude_agent", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-claude-agent", reason: "Needs permission" },
      input: {
        description: "test",
        prompt: "do thing",
        subagent_type: "general",
      },
      state: "approval-requested",
      toolCallId: "tool-call-claude-agent-approval",
      toolName: "claude_agent",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeAgentTool);
  });

  it("uses the ClaudeAgentTool renderer for claude_task (alias)", () => {
    const renderer = resolveRenderer({
      input: {
        description: "test",
        prompt: "do thing",
        subagent_type: "general",
      },
      state: "output-available",
      toolCallId: "tool-call-claude-task",
      toolName: "claude_task",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeAgentTool);
  });

  it("uses the ClaudeUserInputTool renderer for claude_user_input", () => {
    const renderer = resolveRenderer({
      input: {
        questions: [
          { question: "name?", header: "", options: [], multiSelect: false },
        ],
      },
      state: "approval-requested",
      toolCallId: "tool-call-claude-ui",
      toolName: "claude_user_input",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeUserInputTool);
  });

  it("keeps the specialized Claude approval renderer for claude_bash", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-claude-bash", reason: "Needs permission" },
      input: { command: "ls -la" },
      state: "approval-requested",
      toolCallId: "tool-call-claude-bash-approval",
      toolName: "claude_bash",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeShellTool);
  });

  it("uses the ClaudeTodoWriteTool renderer for claude_todowrite", () => {
    const renderer = resolveRenderer({
      input: {
        todos: [{ content: "task 1", status: "pending", activeForm: "" }],
      },
      state: "output-available",
      toolCallId: "tool-call-claude-todo",
      toolName: "claude_todowrite",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeTodoWriteTool);
  });

  it("uses the ClaudePlanTool renderer for claude_exitplanmode", () => {
    const renderer = resolveRenderer({
      input: { plan: "# Plan\n\nDo stuff", planFilePath: "/tmp/plan.md" },
      output: { plan: "# Plan\n\nDo stuff", isAgent: false },
      state: "output-available",
      toolCallId: "tool-call-claude-plan",
      toolName: "claude_exitplanmode",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudePlanTool);
  });

  it("uses the ClaudeFileEditTool renderer for claude_notebookedit", () => {
    const renderer = resolveRenderer({
      input: {
        notebook_path: "nb.ipynb",
        new_source: "print(1)",
        edit_mode: "replace",
      },
      state: "output-available",
      toolCallId: "tool-call-claude-nb",
      toolName: "claude_notebookedit",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeFileEditTool);
  });

  it("uses the ClaudeToolSearchTool renderer for claude_toolsearch", () => {
    const renderer = resolveRenderer({
      input: { query: "select:ExitPlanMode", max_results: 1 },
      output: [{ type: "tool_reference", tool_name: "ExitPlanMode" }],
      state: "output-available",
      toolCallId: "tool-call-claude-ts",
      toolName: "claude_toolsearch",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeToolSearchTool);
  });

  it("uses the ClaudeListDirTool renderer for claude_ls", () => {
    const renderer = resolveRenderer({
      input: { path: "/workspace/src" },
      state: "output-available",
      toolCallId: "tool-call-claude-ls",
      toolName: "claude_ls",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeListDirTool);
  });

  it("uses the ClaudeFileEditTool renderer for claude_multiedit", () => {
    const renderer = resolveRenderer({
      input: {
        edits: [{ file_path: "a.ts", old_string: "a", new_string: "b" }],
      },
      state: "output-available",
      toolCallId: "tool-call-claude-me",
      toolName: "claude_multiedit",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeFileEditTool);
  });

  it("uses the ClaudeFileReadTool renderer for claude_notebookread", () => {
    const renderer = resolveRenderer({
      input: { notebook_path: "nb.ipynb" },
      state: "output-available",
      toolCallId: "tool-call-claude-nbr",
      toolName: "claude_notebookread",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeFileReadTool);
  });

  it("uses the ClaudeTodoWriteTool renderer for claude_todoread", () => {
    const renderer = resolveRenderer({
      input: {},
      output: {
        newTodos: [{ content: "task", status: "pending", activeForm: "" }],
      },
      state: "output-available",
      toolCallId: "tool-call-claude-tr",
      toolName: "claude_todoread",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeTodoWriteTool);
  });

  it("uses the ClaudeAgentTool renderer for claude_dispatch_agent", () => {
    const renderer = resolveRenderer({
      input: { prompt: "do thing" },
      state: "output-available",
      toolCallId: "tool-call-claude-da",
      toolName: "claude_dispatch_agent",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeAgentTool);
  });

  it("uses the ClaudeSessionUtilityTool renderer for claude_config", () => {
    const renderer = resolveRenderer({
      input: { setting: "model" },
      output: { success: true },
      state: "output-available",
      toolCallId: "tool-call-claude-config",
      toolName: "claude_config",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(ClaudeSessionUtilityTool);
  });

  it("uses the ClaudeSessionUtilityTool renderer for claude_enterworktree", () => {
    const renderer = resolveRenderer({
      input: {},
      output: { message: "Created worktree", worktreePath: "/tmp/worktree" },
      state: "output-available",
      toolCallId: "tool-call-claude-enterworktree",
      toolName: "claude_enterworktree",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(ClaudeSessionUtilityTool);
  });

  it("uses the ClaudeSessionUtilityTool renderer for claude_taskoutput", () => {
    const renderer = resolveRenderer({
      input: { task_id: "task-1" },
      output: { stdout: "working", stderr: "" },
      state: "output-available",
      toolCallId: "tool-call-claude-taskoutput",
      toolName: "claude_taskoutput",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(ClaudeSessionUtilityTool);
  });

  it("uses the ClaudeSessionUtilityTool renderer for claude_taskstop", () => {
    const renderer = resolveRenderer({
      input: { task_id: "task-1" },
      output: { message: "Stopped", task_id: "task-1", task_type: "bash" },
      state: "output-available",
      toolCallId: "tool-call-claude-taskstop",
      toolName: "claude_taskstop",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(ClaudeSessionUtilityTool);
  });

  it("uses the ClaudeMcpResourceTool renderer for claude_listmcpresources", () => {
    const renderer = resolveRenderer({
      input: { server: "docs" },
      output: [{ name: "Docs", server: "docs", uri: "docs://index" }],
      state: "output-available",
      toolCallId: "tool-call-claude-listmcpresources",
      toolName: "claude_listmcpresources",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(ClaudeMcpResourceTool);
  });

  it("uses the ClaudeMcpResourceTool renderer for claude_readmcpresource", () => {
    const renderer = resolveRenderer({
      input: { server: "docs", uri: "docs://index" },
      output: { contents: [{ text: "Hello", uri: "docs://index" }] },
      state: "output-available",
      toolCallId: "tool-call-claude-readmcpresource",
      toolName: "claude_readmcpresource",
      type: "dynamic-tool",
    } as const);

    expect(renderer).toBe(ClaudeMcpResourceTool);
  });

  it("uses the ClaudeMcpResourceTool renderer for Claude subscription tools", () => {
    const toolNames = [
      "claude_subscribemcpresource",
      "claude_subscribepolling",
      "claude_unsubscribemcpresource",
      "claude_unsubscribepolling",
    ] as const;

    for (const toolName of toolNames) {
      const renderer = resolveRenderer({
        input: { server: "docs", uri: "docs://index" },
        output: { ok: true },
        state: "output-available",
        toolCallId: `tool-call-${toolName}`,
        toolName,
        type: "dynamic-tool",
      } as any);

      expect(renderer).toBe(ClaudeMcpResourceTool);
    }
  });

  it("uses the generic Claude renderer for unknown claude tools", () => {
    const renderer = resolveRenderer({
      input: { foo: "bar" },
      output: { success: true },
      state: "output-available",
      toolCallId: "tool-call-claude-unknown",
      toolName: "claude_unknown_future_tool",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeRuntimeTool);
  });

  it("tracks the full known Claude renderer inventory", () => {
    const sdkToolNames = [
      "Agent",
      "Bash",
      "Config",
      "Edit",
      "EnterWorktree",
      "ExitPlanMode",
      "Glob",
      "Grep",
      "ListMcpResources",
      "NotebookEdit",
      "Read",
      "ReadMcpResource",
      "SubscribeMcpResource",
      "SubscribePolling",
      "TaskOutput",
      "TaskStop",
      "TodoWrite",
      "UnsubscribeMcpResource",
      "UnsubscribePolling",
      "WebFetch",
      "WebSearch",
      "Write",
    ].map(
      (name) =>
        `claude_${name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")}`,
    );
    const localAliases = [
      "claude_dispatchagent",
      "claude_dispatch_agent",
      "claude_listdir",
      "claude_ls",
      "claude_multiedit",
      "claude_notebookread",
      "claude_skill",
      "claude_task",
      "claude_todoread",
      "claude_toolsearch",
      "claude_user_input",
    ];

    expect(KNOWN_CLAUDE_RENDERER_TOOL_NAMES).toEqual(
      [...new Set([...sdkToolNames, ...localAliases])].sort(),
    );
  });
});
