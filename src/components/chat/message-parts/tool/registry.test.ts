import { describe, expect, it } from "bun:test";

import {
  ENGINE_TOOL_RENDERING_COVERAGE,
  KNOWN_CODEX_RENDERER_TOOL_NAMES,
  KNOWN_CLAUDE_RENDERER_TOOL_NAMES,
  KNOWN_COPILOT_RENDERER_TOOL_NAMES,
  KNOWN_CURSOR_RENDERER_TOOL_NAMES,
  KNOWN_OPENCODE_RENDERER_TOOL_NAMES,
  resolveRenderer,
} from "./registry";
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
import { CopilotAgentTool } from "./renderers/copilot-agent";
import {
  CopilotApplyPatchTool,
  CopilotEditTool,
  CopilotViewTool,
} from "./renderers/copilot-file";
import { CopilotMemoryTool } from "./renderers/copilot-memory";
import { CopilotRuntimeTool } from "./renderers/copilot-runtime";
import { CopilotGlobTool, CopilotGrepTool } from "./renderers/copilot-search";
import { CopilotSessionUtilityTool } from "./renderers/copilot-session";
import { CopilotShellTool } from "./renderers/copilot-shell";
import { CopilotTodoTool } from "./renderers/copilot-todo";
import { CopilotUserInputTool } from "./renderers/copilot-user-input";
import { CopilotWebFetchTool } from "./renderers/copilot-web";
import {
  CursorFileTool,
  CursorPermissionTool,
  CursorPlanTool,
  CursorRuntimeTool,
  CursorSearchTool,
  CursorShellTool,
  CursorUserInputTool,
  OpenCodeFileTool,
  OpenCodePermissionTool,
  OpenCodePlanTool,
  OpenCodeRuntimeTool,
  OpenCodeSearchTool,
  OpenCodeShellTool,
  OpenCodeUserInputTool,
} from "./renderers/external-runtime";
import { GenericTool } from "./generic";
import { SkillTool } from "./renderers/skill";
import { GenerateVideoTool } from "./renderers/generate-video";
import { RunSubagentTool } from "./renderers/run-subagent";
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

  it("uses the GenerateVideoTool renderer for generate_video", () => {
    const renderer = resolveRenderer({
      input: { prompt: "a calm ocean shot" },
      output: {
        failureCount: 0,
        mode: "single",
        prompt: "a calm ocean shot",
        requestedCount: 1,
        successCount: 1,
        targets: [],
      },
      state: "output-available",
      toolCallId: "tool-call-video-1",
      toolName: "generate_video",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(GenerateVideoTool);
  });

  it("uses the RunSubagentTool renderer for run_subagent", () => {
    const renderer = resolveRenderer({
      input: {
        allowMutations: true,
        prompt: "Discover the repository layout",
      },
      output: {
        childThreadId: null,
        status: "completed",
        summaryText: "Summary",
        virtualThreadId: "virtual-thread-1",
      },
      state: "output-available",
      toolCallId: "tool-call-subagent-1",
      toolName: "run_subagent",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(RunSubagentTool);
  });

  it("uses the CopilotUserInputTool renderer for structured Copilot prompts", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-copilot-1" },
      input: { prompt: "How should I continue?" },
      state: "approval-requested",
      toolCallId: "tool-call-copilot-ui",
      toolName: "copilot_request_user_input",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotUserInputTool);
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
    expect(renderer).not.toBe(ClaudeRuntimeTool);
  });

  it("uses the ClaudeUserInputTool renderer for raw Askuserquestion tools", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-ask-user-question" },
      input: {
        questions: [
          {
            header: "Approach",
            multiSelect: false,
            options: [
              {
                description: "Start with the highest-priority fixes first.",
                label: "Implement incrementally",
              },
              {
                description: "Plan everything before making changes.",
                label: "Comprehensive refactoring plan",
              },
            ],
            question:
              "Would you like me to implement improvements incrementally or create a comprehensive refactoring plan?",
          },
        ],
      },
      state: "approval-requested",
      toolCallId: "tool-call-ask-user-question",
      toolName: "Askuserquestion",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeUserInputTool);
    expect(renderer).not.toBe(ClaudeRuntimeTool);
  });

  it("uses the ClaudeUserInputTool renderer for claude_askuserquestion tools", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-claude-ask-user-question" },
      input: {
        questions: [
          {
            header: "Approach",
            multiSelect: false,
            options: [
              {
                description: "Start with the highest-priority fixes first.",
                label: "Implement incrementally",
              },
              {
                description: "Plan everything before making changes.",
                label: "Comprehensive refactoring plan",
              },
            ],
            question:
              "Would you like me to implement improvements incrementally or create a comprehensive refactoring plan?",
          },
        ],
      },
      state: "approval-requested",
      toolCallId: "tool-call-claude-ask-user-question",
      toolName: "claude_askuserquestion",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(ClaudeUserInputTool);
    expect(renderer).not.toBe(ClaudeRuntimeTool);
  });

  it("uses the ClaudeUserInputTool renderer for static AskUserQuestion tool parts", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-static-ask-user-question" },
      input: {
        questions: [
          {
            header: "Priority Focus",
            multiSelect: false,
            options: [
              {
                description: "Address stability issues first.",
                label: "Critical fixes",
              },
              {
                description: "Focus on UX and polish first.",
                label: "UI improvements",
              },
            ],
            question: "Which improvements would you like to prioritize first?",
          },
        ],
      },
      state: "approval-requested",
      toolCallId: "tool-call-static-ask-user-question",
      type: "tool-AskUserQuestion",
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

  it("uses the CopilotShellTool renderer for copilot_bash", () => {
    const renderer = resolveRenderer({
      input: { command: "npm test" },
      output: { content: "ok" },
      state: "output-available",
      toolCallId: "tool-call-copilot-bash",
      toolName: "copilot_bash",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotShellTool);
  });

  it("uses the CopilotViewTool renderer for copilot_view", () => {
    const renderer = resolveRenderer({
      input: { path: "src/index.ts", view_range: [1, 20] },
      output: { content: "console.log('hello')" },
      state: "output-available",
      toolCallId: "tool-call-copilot-view",
      toolName: "copilot_view",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotViewTool);
  });

  it("uses the CopilotEditTool renderer for copilot_edit", () => {
    const renderer = resolveRenderer({
      input: { path: "src/index.ts", old_str: "old", new_str: "new" },
      output: { content: "updated" },
      state: "output-available",
      toolCallId: "tool-call-copilot-edit",
      toolName: "copilot_edit",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotEditTool);
  });

  it("uses the CopilotApplyPatchTool renderer for copilot_apply_patch", () => {
    const renderer = resolveRenderer({
      input: { command: "apply_patch", patch: "*** Begin Patch" },
      output: { content: "updated" },
      state: "output-available",
      toolCallId: "tool-call-copilot-apply-patch",
      toolName: "copilot_apply_patch",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotApplyPatchTool);
  });

  it("uses the CopilotGlobTool renderer for copilot_glob", () => {
    const renderer = resolveRenderer({
      input: { pattern: "**/*.ts" },
      output: { content: "src/index.ts" },
      state: "output-available",
      toolCallId: "tool-call-copilot-glob",
      toolName: "copilot_glob",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotGlobTool);
  });

  it("uses the CopilotGrepTool renderer for copilot_grep", () => {
    const renderer = resolveRenderer({
      input: { pattern: "TODO" },
      output: { content: "src/index.ts:1: TODO" },
      state: "output-available",
      toolCallId: "tool-call-copilot-grep",
      toolName: "copilot_grep",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotGrepTool);
  });

  it("uses the CopilotWebFetchTool renderer for copilot_web_fetch", () => {
    const renderer = resolveRenderer({
      input: { url: "https://docs.github.com", prompt: "Fetch docs" },
      output: { content: "Docs content" },
      state: "output-available",
      toolCallId: "tool-call-copilot-web",
      toolName: "copilot_web_fetch",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotWebFetchTool);
  });

  it("uses the CopilotTodoTool renderer for copilot_update_todo", () => {
    const renderer = resolveRenderer({
      input: {
        todos: [{ content: "Ship feature", status: "pending" }],
      },
      output: {
        newTodos: [{ content: "Ship feature", status: "completed" }],
      },
      state: "output-available",
      toolCallId: "tool-call-copilot-todo",
      toolName: "copilot_update_todo",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotTodoTool);
  });

  it("uses the CopilotMemoryTool renderer for copilot_store_memory", () => {
    const renderer = resolveRenderer({
      input: { fact: "The deploy key is rotated weekly." },
      output: { content: "Stored" },
      state: "output-available",
      toolCallId: "tool-call-copilot-memory",
      toolName: "copilot_store_memory",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotMemoryTool);
  });

  it("uses the CopilotAgentTool renderer for copilot_task", () => {
    const renderer = resolveRenderer({
      input: { agent_type: "explorer", description: "Inspect repo" },
      output: { content: "Started" },
      state: "output-available",
      toolCallId: "tool-call-copilot-task",
      toolName: "copilot_task",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotAgentTool);
  });

  it("uses the structured user input renderer for copilot_ask_user", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-copilot-ask-user" },
      input: { prompt: "Pick one" },
      state: "approval-requested",
      toolCallId: "tool-call-copilot-ask-user",
      toolName: "copilot_ask_user",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotUserInputTool);
  });

  it("uses the OpenCode user input renderer for OpenCode questions", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-1" },
      input: { prompt: "Need more detail?" },
      state: "approval-requested",
      toolCallId: "tool-call-1",
      toolName: "opencode_ask_question",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(OpenCodeUserInputTool);
  });

  it("uses the OpenCode shell renderer for OpenCode shell approvals", () => {
    const renderer = resolveRenderer({
      approval: { id: "approval-1" },
      input: { command: "bun test" },
      state: "approval-requested",
      toolCallId: "tool-call-1",
      toolName: "opencode_bash",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(OpenCodeShellTool);
  });

  it("uses Cursor engine renderers by tool category", () => {
    const cases = [
      ["cursor_bash", CursorShellTool],
      ["cursor_read_file", CursorFileTool],
      ["cursor_search", CursorSearchTool],
      ["cursor_update_plan", CursorPlanTool],
      ["cursor_ask_question", CursorUserInputTool],
      ["cursor_permission", CursorPermissionTool],
    ] as const;

    for (const [toolName, expected] of cases) {
      const renderer = resolveRenderer({
        approval:
          toolName === "cursor_permission" || toolName === "cursor_ask_question"
            ? { id: `approval-${toolName}` }
            : undefined,
        input: {
          command: "bun test",
          path: "src/index.ts",
          prompt: "Continue?",
        },
        state:
          toolName === "cursor_permission" || toolName === "cursor_ask_question"
            ? "approval-requested"
            : "output-available",
        toolCallId: `tool-call-${toolName}`,
        toolName,
        type: "dynamic-tool",
      } as any);

      expect(renderer).toBe(expected);
    }
  });

  it("uses OpenCode engine renderers by tool category", () => {
    const cases = [
      ["opencode_bash", OpenCodeShellTool],
      ["opencode_read", OpenCodeFileTool],
      ["opencode_grep", OpenCodeSearchTool],
      ["opencode_update_plan", OpenCodePlanTool],
      ["opencode_ask_question", OpenCodeUserInputTool],
      ["opencode_permission", OpenCodePermissionTool],
    ] as const;

    for (const [toolName, expected] of cases) {
      const renderer = resolveRenderer({
        approval:
          toolName === "opencode_permission" ||
          toolName === "opencode_ask_question"
            ? { id: `approval-${toolName}` }
            : undefined,
        input: {
          command: "bun test",
          path: "src/index.ts",
          prompt: "Continue?",
        },
        state:
          toolName === "opencode_permission" ||
          toolName === "opencode_ask_question"
            ? "approval-requested"
            : "output-available",
        toolCallId: `tool-call-${toolName}`,
        toolName,
        type: "dynamic-tool",
      } as any);

      expect(renderer).toBe(expected);
    }
  });

  it("uses Cursor and OpenCode runtime fallbacks for unknown engine tools", () => {
    const cursorRenderer = resolveRenderer({
      input: { foo: "bar" },
      output: { ok: true },
      state: "output-available",
      toolCallId: "tool-call-cursor-unknown",
      toolName: "cursor_unknown_future_tool",
      type: "dynamic-tool",
    } as any);
    const openCodeRenderer = resolveRenderer({
      input: { foo: "bar" },
      output: { ok: true },
      state: "output-available",
      toolCallId: "tool-call-opencode-unknown",
      toolName: "opencode_unknown_future_tool",
      type: "dynamic-tool",
    } as any);

    expect(cursorRenderer).toBe(CursorRuntimeTool);
    expect(openCodeRenderer).toBe(OpenCodeRuntimeTool);
  });

  it("uses the CopilotSessionUtilityTool renderer for copilot_report_intent", () => {
    const renderer = resolveRenderer({
      input: { description: "Planning next steps" },
      output: { content: "Plan recorded" },
      state: "output-available",
      toolCallId: "tool-call-copilot-report-intent",
      toolName: "copilot_report_intent",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotSessionUtilityTool);
  });

  it("uses the generic Copilot renderer for unknown copilot tools", () => {
    const renderer = resolveRenderer({
      input: { foo: "bar" },
      output: { success: true },
      state: "output-available",
      toolCallId: "tool-call-copilot-unknown",
      toolName: "copilot_unknown_future_tool",
      type: "dynamic-tool",
    } as any);

    expect(renderer).toBe(CopilotRuntimeTool);
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

  it("tracks the full known Codex renderer inventory", () => {
    expect(KNOWN_CODEX_RENDERER_TOOL_NAMES).toEqual(
      [
        "codex_collab_agent",
        "codex_command_execution",
        "codex_context_compaction",
        "codex_file_change",
        "codex_image_view",
        "codex_mcp_tool_call",
        "codex_plan",
        "codex_review_mode",
        "codex_user_input",
        "codex_web_search",
      ].sort(),
    );
  });

  it("tracks the full known Copilot renderer inventory", () => {
    const cliToolNames = [
      "apply_patch",
      "ask_user",
      "bash",
      "create",
      "edit",
      "exit_plan_mode",
      "fetch_copilot_cli_documentation",
      "glob",
      "grep",
      "list_agents",
      "list_bash",
      "list_powershell",
      "lsp",
      "powershell",
      "read_agent",
      "read_bash",
      "read_powershell",
      "report_intent",
      "rg",
      "show_file",
      "skill",
      "sql",
      "stop_bash",
      "stop_powershell",
      "store_memory",
      "task",
      "task_complete",
      "update_todo",
      "view",
      "web_fetch",
      "write_bash",
      "write_powershell",
    ].map((toolName) => `copilot_${toolName}`);
    const runtimeBridgeToolNames = [
      "copilot_custom_tool",
      "copilot_hook",
      "copilot_mcp",
      "copilot_memory",
      "copilot_read",
      "copilot_request_user_input",
      "copilot_runtime",
      "copilot_shell",
      "copilot_url",
      "copilot_write",
    ];

    expect(KNOWN_COPILOT_RENDERER_TOOL_NAMES).toEqual(
      [...new Set([...cliToolNames, ...runtimeBridgeToolNames])].sort(),
    );
  });

  it("tracks the known Cursor renderer inventory", () => {
    expect(KNOWN_CURSOR_RENDERER_TOOL_NAMES).toEqual(
      [
        "cursor_apply_patch",
        "cursor_approval",
        "cursor_ask_question",
        "cursor_ask_user",
        "cursor_ask_user_question",
        "cursor_bash",
        "cursor_command",
        "cursor_create_file",
        "cursor_create_plan",
        "cursor_delete_file",
        "cursor_edit",
        "cursor_edit_file",
        "cursor_execute_command",
        "cursor_file",
        "cursor_file_edit",
        "cursor_find",
        "cursor_glob",
        "cursor_grep",
        "cursor_list",
        "cursor_list_dir",
        "cursor_list_files",
        "cursor_ls",
        "cursor_permission",
        "cursor_plan",
        "cursor_read",
        "cursor_read_file",
        "cursor_request_permission",
        "cursor_request_user_input",
        "cursor_rg",
        "cursor_run_command",
        "cursor_search",
        "cursor_session",
        "cursor_shell",
        "cursor_terminal",
        "cursor_todo",
        "cursor_todo_read",
        "cursor_todo_write",
        "cursor_tool_permission",
        "cursor_update_file",
        "cursor_update_plan",
        "cursor_update_todo",
        "cursor_view",
        "cursor_write",
        "cursor_write_file",
      ].sort(),
    );
  });

  it("tracks the known OpenCode renderer inventory", () => {
    expect(KNOWN_OPENCODE_RENDERER_TOOL_NAMES).toEqual(
      [
        "opencode_apply_patch",
        "opencode_approval",
        "opencode_ask_question",
        "opencode_ask_user",
        "opencode_ask_user_question",
        "opencode_bash",
        "opencode_command",
        "opencode_create_file",
        "opencode_create_plan",
        "opencode_delete_file",
        "opencode_edit",
        "opencode_edit_file",
        "opencode_execute",
        "opencode_execute_command",
        "opencode_file",
        "opencode_file_edit",
        "opencode_find",
        "opencode_glob",
        "opencode_grep",
        "opencode_list",
        "opencode_list_dir",
        "opencode_list_files",
        "opencode_ls",
        "opencode_permission",
        "opencode_plan",
        "opencode_read",
        "opencode_read_file",
        "opencode_request_permission",
        "opencode_request_user_input",
        "opencode_rg",
        "opencode_run_command",
        "opencode_search",
        "opencode_session",
        "opencode_shell",
        "opencode_terminal",
        "opencode_todo",
        "opencode_todo_read",
        "opencode_todo_write",
        "opencode_tool_permission",
        "opencode_update_file",
        "opencode_update_plan",
        "opencode_update_todo",
        "opencode_view",
        "opencode_write",
        "opencode_write_file",
      ].sort(),
    );
  });

  it("resolves every covered engine tool to an intentional non-generic renderer", () => {
    for (const toolNames of Object.values(ENGINE_TOOL_RENDERING_COVERAGE)) {
      for (const toolName of toolNames) {
        const renderer = resolveRenderer({
          approval:
            toolName.includes("ask") || toolName.includes("permission")
              ? { id: `approval-${toolName}` }
              : undefined,
          input: { command: "bun test", path: "src/index.ts", prompt: "Go?" },
          output: { ok: true },
          state:
            toolName.includes("ask") || toolName.includes("permission")
              ? "approval-requested"
              : "output-available",
          toolCallId: `tool-call-${toolName}`,
          toolName,
          type: "dynamic-tool",
        } as any);

        expect(renderer).toBeDefined();
        expect(renderer).not.toBe(GenericTool);
      }
    }
  });
});
