import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ClaudeTaskTool } from "./claude-tasks";
import type { RendererProps } from "../renderer";

function renderTaskPart(part: Record<string, unknown>) {
  return renderToStaticMarkup(
    <ClaudeTaskTool
      part={
        {
          state: "output-available",
          toolCallId: "tool-call-task",
          type: "dynamic-tool",
          ...part,
        } as unknown as RendererProps["part"]
      }
    />,
  );
}

describe("ClaudeTaskTool", () => {
  it("summarizes TaskCreate with the new task's subject", () => {
    const markup = renderTaskPart({
      input: { subject: "Run tests" },
      output: {
        task: { id: "1", subject: "Run tests" },
        tasks: [{ id: "1", status: "pending", subject: "Run tests" }],
      },
      toolName: "claude_taskcreate",
    });

    expect(markup).toContain("Added task");
    expect(markup).toContain("Run tests");
  });

  it("names the updated task from the accumulated list and shows the new status", () => {
    const markup = renderTaskPart({
      input: { status: "in_progress", taskId: "2" },
      output: {
        success: true,
        taskId: "2",
        tasks: [
          { id: "1", status: "completed", subject: "Write tests" },
          { id: "2", status: "in_progress", subject: "Ship it" },
        ],
      },
      toolName: "claude_taskupdate",
    });

    expect(markup).toContain("Updated task");
    expect(markup).toContain("Ship it");
    expect(markup).toContain("in progress");
  });

  it("counts completed tasks for TaskList", () => {
    const markup = renderTaskPart({
      input: {},
      output: {
        tasks: [
          { id: "1", status: "completed", subject: "Write tests" },
          { id: "2", status: "pending", subject: "Ship it" },
        ],
      },
      toolName: "claude_tasklist",
    });

    expect(markup).toContain("Listed tasks");
    expect(markup).toContain("1/2 completed");
  });

  it("falls back to the call itself for parts stored without a task list", () => {
    const markup = renderTaskPart({
      input: { status: "completed", taskId: "4" },
      output: { stdout: "Updated task #4 status" },
      toolName: "claude_taskupdate",
    });

    expect(markup).toContain("Updated task");
    expect(markup).toContain("#4");
  });

  it("shows an in-flight TaskGet", () => {
    const markup = renderTaskPart({
      input: { taskId: "9" },
      state: "input-available",
      toolName: "claude_taskget",
    });

    expect(markup).toContain("Checking task");
    expect(markup).toContain("#9");
  });
});
