import { describe, expect, it } from "bun:test";

import {
  applyClaudeTaskToolResult,
  buildClaudeTaskToolOutput,
  isClaudeTaskToolName,
  listClaudeTasks,
  seedClaudeTasksFromMessages,
  type ClaudeTaskSnapshot,
} from "./claude/tasks";

function createTasks() {
  return new Map<string, ClaudeTaskSnapshot>();
}

describe("Claude Task tool accumulation", () => {
  it("recognizes only the Task* tools", () => {
    expect(isClaudeTaskToolName("claude_taskcreate")).toBe(true);
    expect(isClaudeTaskToolName("claude_tasklist")).toBe(true);
    expect(isClaudeTaskToolName("claude_task")).toBe(false);
    expect(isClaudeTaskToolName("claude_taskoutput")).toBe(false);
    expect(isClaudeTaskToolName("claude_todowrite")).toBe(false);
  });

  it("creates, updates and deletes tasks by id", () => {
    const tasks = createTasks();
    applyClaudeTaskToolResult(tasks, {
      input: { activeForm: "Writing tests", subject: "Write tests" },
      output: { task: { id: "1", subject: "Write tests" } },
      toolName: "claude_taskcreate",
    });
    applyClaudeTaskToolResult(tasks, {
      input: { subject: "Ship it" },
      output: { task: { id: "2", subject: "Ship it" } },
      toolName: "claude_taskcreate",
    });
    applyClaudeTaskToolResult(tasks, {
      input: { addBlockedBy: ["1"], status: "in_progress", taskId: "2" },
      output: { success: true, taskId: "2", updatedFields: ["status"] },
      toolName: "claude_taskupdate",
    });
    applyClaudeTaskToolResult(tasks, {
      input: { status: "completed", taskId: "1" },
      output: {
        statusChange: { from: "pending", to: "completed" },
        success: true,
        taskId: "1",
        updatedFields: ["status"],
      },
      toolName: "claude_taskupdate",
    });

    expect(listClaudeTasks(tasks)).toEqual([
      {
        activeForm: "Writing tests",
        id: "1",
        status: "completed",
        subject: "Write tests",
      },
      { blockedBy: ["1"], id: "2", status: "in_progress", subject: "Ship it" },
    ]);

    applyClaudeTaskToolResult(tasks, {
      input: { status: "deleted", taskId: "1" },
      output: { success: true, taskId: "1", updatedFields: ["status"] },
      toolName: "claude_taskupdate",
    });
    expect([...tasks.keys()]).toEqual(["2"]);
  });

  it("ignores failed updates and reads ids from TaskCreate text without a structured result", () => {
    const tasks = createTasks();
    applyClaudeTaskToolResult(tasks, {
      input: { subject: "Fix lint" },
      output: { stdout: "Task #4 created successfully: Fix lint" },
      toolName: "claude_taskcreate",
    });
    applyClaudeTaskToolResult(tasks, {
      input: { status: "completed", taskId: "4" },
      output: { error: "Task not found", success: false, taskId: "4" },
      toolName: "claude_taskupdate",
    });

    expect(listClaudeTasks(tasks)).toEqual([
      { id: "4", status: "pending", subject: "Fix lint" },
    ]);
  });

  it("treats TaskList as authoritative and keeps details earlier calls saw", () => {
    const tasks = createTasks();
    applyClaudeTaskToolResult(tasks, {
      input: { description: "All unit tests", subject: "Run tests" },
      output: { task: { id: "1", subject: "Run tests" } },
      toolName: "claude_taskcreate",
    });
    applyClaudeTaskToolResult(tasks, {
      input: { subject: "Stale" },
      output: { task: { id: "9", subject: "Stale" } },
      toolName: "claude_taskcreate",
    });
    applyClaudeTaskToolResult(tasks, {
      input: {},
      output: {
        tasks: [
          { blockedBy: [], id: "3", status: "pending", subject: "Docs" },
          {
            blockedBy: [],
            id: "1",
            status: "in_progress",
            subject: "Run tests",
          },
        ],
      },
      toolName: "claude_tasklist",
    });

    expect(listClaudeTasks(tasks)).toEqual([
      { id: "3", status: "pending", subject: "Docs" },
      {
        description: "All unit tests",
        id: "1",
        status: "in_progress",
        subject: "Run tests",
      },
    ]);
  });

  it("upserts TaskGet results and drops tasks it reports missing", () => {
    const tasks = createTasks();
    applyClaudeTaskToolResult(tasks, {
      input: { taskId: "5" },
      output: {
        task: {
          blockedBy: [],
          blocks: [],
          description: "Review the diff",
          id: "5",
          status: "pending",
          subject: "Review",
        },
      },
      toolName: "claude_taskget",
    });
    expect(listClaudeTasks(tasks)).toEqual([
      {
        description: "Review the diff",
        id: "5",
        status: "pending",
        subject: "Review",
      },
    ]);

    applyClaudeTaskToolResult(tasks, {
      input: { taskId: "5" },
      output: { task: null },
      toolName: "claude_taskget",
    });
    expect(tasks.size).toBe(0);
  });

  it("stores the list beside the tool's own output", () => {
    const tasks = [{ id: "1", status: "pending" as const, subject: "A" }];

    expect(
      buildClaudeTaskToolOutput({
        output: { task: { id: "1", subject: "A" } },
        tasks,
      }),
    ).toEqual({ task: { id: "1", subject: "A" }, tasks });
    expect(
      buildClaudeTaskToolOutput({ output: "Task #1 created", tasks }),
    ).toEqual({
      stdout: "Task #1 created",
      tasks,
    });
  });

  it("seeds from the latest stored list and replays calls persisted without one", () => {
    const tasks = seedClaudeTasksFromMessages([
      {
        id: "assistant-1",
        metadata: {},
        parts: [
          {
            input: { subject: "Old" },
            output: {
              tasks: [{ id: "1", status: "pending", subject: "Old" }],
            },
            state: "output-available",
            toolCallId: "tool-1",
            toolName: "claude_taskcreate",
            type: "dynamic-tool",
          },
          {
            input: { status: "completed", taskId: "1" },
            output: { stdout: "Updated task #1 status" },
            state: "output-available",
            toolCallId: "tool-2",
            toolName: "claude_taskupdate",
            type: "dynamic-tool",
          },
          {
            input: { subject: "Ignored" },
            state: "output-error",
            errorText: "failed",
            toolCallId: "tool-3",
            toolName: "claude_taskcreate",
            type: "dynamic-tool",
          },
        ],
        role: "assistant",
      },
    ] as any);

    expect(listClaudeTasks(tasks)).toEqual([
      { id: "1", status: "completed", subject: "Old" },
    ]);
  });
});
