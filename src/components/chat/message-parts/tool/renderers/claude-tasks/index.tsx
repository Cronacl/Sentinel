"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import { getToolName } from "../../../types";
import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  extractTextFromContent,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";
import { TodoList, type TodoItem } from "../claude-todo";

// Renders Claude Code's Task* tools (TaskCreate, TaskUpdate, TaskGet,
// TaskList), which replaced TodoWrite. The Claude runtime stores the task list
// as it stands after each call on `output.tasks`; parts persisted without it
// fall back to what the call itself carries.

type ClaudeTaskVariant = "create" | "get" | "list" | "update";

type ClaudeTaskEntry = {
  activeForm?: string;
  id?: string;
  status: TodoItem["status"];
  subject: string;
};

type ClaudeTaskInput = {
  activeForm?: string;
  description?: string;
  status?: string;
  subject?: string;
  taskId?: string;
};

function getTaskVariant(toolName: string): ClaudeTaskVariant {
  switch (toolName) {
    case "claude_taskcreate":
      return "create";
    case "claude_taskget":
      return "get";
    case "claude_tasklist":
      return "list";
    default:
      return "update";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readTaskStatus(value: unknown): TodoItem["status"] | null {
  return value === "pending" || value === "in_progress" || value === "completed"
    ? value
    : null;
}

function readTaskEntries(output: unknown): ClaudeTaskEntry[] | null {
  if (!isRecord(output) || !Array.isArray(output.tasks)) {
    return null;
  }

  return output.tasks.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.subject !== "string") {
      return [];
    }

    return [
      {
        activeForm:
          typeof entry.activeForm === "string" ? entry.activeForm : undefined,
        id: typeof entry.id === "string" ? entry.id : undefined,
        status: readTaskStatus(entry.status) ?? "pending",
        subject: entry.subject,
      },
    ];
  });
}

function readSingleTask(output: unknown): ClaudeTaskEntry | null {
  if (!isRecord(output) || !isRecord(output.task)) {
    return null;
  }

  const task = output.task;
  if (typeof task.subject !== "string") {
    return null;
  }

  return {
    id: typeof task.id === "string" ? task.id : undefined,
    status: readTaskStatus(task.status) ?? "pending",
    subject: task.subject,
  };
}

function findTask(tasks: ClaudeTaskEntry[] | null, taskId?: string) {
  return taskId ? (tasks?.find((task) => task.id === taskId) ?? null) : null;
}

function toTodoItems(tasks: ClaudeTaskEntry[]): TodoItem[] {
  return tasks.map((task) => ({
    activeForm: task.activeForm ?? "",
    content: task.subject,
    status: task.status,
  }));
}

function describeTask(
  task: ClaudeTaskEntry | null,
  input: ClaudeTaskInput | null,
) {
  return (
    task?.subject ??
    input?.subject ??
    (input?.taskId ? `#${input.taskId}` : "task")
  );
}

function TaskSummary(input: {
  part: RendererProps["part"];
  subject: string;
  status?: string;
  tasks: ClaudeTaskEntry[] | null;
  variant: ClaudeTaskVariant;
}): ReactNode {
  const { part, subject, tasks, variant } = input;
  const isDone = part.state === "output-available";

  if (part.state === "output-denied") return "Task update denied";
  if (part.state === "output-error") return "Failed to update tasks";

  switch (variant) {
    case "create":
      return (
        <>
          {isDone ? "Added task" : "Adding task"}{" "}
          <span className="text-foreground/60">{subject}</span>
        </>
      );
    case "update":
      return (
        <>
          {isDone ? "Updated task" : "Updating task"}{" "}
          <span className="text-foreground/60">{subject}</span>
          {input.status ? (
            <span className="text-[11px] text-foreground/40">
              {" "}
              → {input.status.replace("_", " ")}
            </span>
          ) : null}
        </>
      );
    case "get":
      return (
        <>
          {isDone ? "Checked task" : "Checking task"}{" "}
          <span className="text-foreground/60">{subject}</span>
        </>
      );
    case "list": {
      if (!isDone || !tasks) return "Listing tasks";
      const completed = tasks.filter((task) => task.status === "completed");
      return (
        <>
          Listed tasks{" "}
          <span className="text-[11px] text-foreground/40">
            {completed.length}/{tasks.length} completed
          </span>
        </>
      );
    }
  }
}

export const ClaudeTaskTool = memo(function ClaudeTaskTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const variant = getTaskVariant(getToolName(part));
  const input = unwrapClaudeInput<ClaudeTaskInput>(
    "input" in part ? part.input : undefined,
  );
  const output = "output" in part ? part.output : undefined;
  const tasks = readTaskEntries(output);
  const singleTask = readSingleTask(output);
  const task =
    findTask(tasks, input?.taskId ?? singleTask?.id) ?? singleTask ?? null;
  const fallbackText =
    !tasks && output !== undefined ? extractTextFromContent(output) : null;
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested",
  );

  const items = tasks ? toTodoItems(tasks) : task ? toTodoItems([task]) : [];
  const status =
    variant === "update" && typeof input?.status === "string"
      ? input.status
      : undefined;
  const summary = (
    <>
      <Icon
        icon="solar:checklist-minimalistic-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {TaskSummary({
        part,
        status,
        subject: describeTask(task, input),
        tasks,
        variant,
      })}
    </>
  );
  const hasBody = items.length > 0 || Boolean(fallbackText?.trim());

  return (
    <ToolLayout
      actions={renderClaudeApprovalActions({ onApprove, onDeny, part })}
      summary={summary}
      isRunning={isClaudeToolRunningState(part.state)}
      isError={isClaudeToolErrorState(part.state)}
      isExpandable={hasBody}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {items.length > 0 ? (
        <TodoList items={items} />
      ) : fallbackText?.trim() ? (
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
          {fallbackText}
        </pre>
      ) : null}
    </ToolLayout>
  );
});
