"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { Icon } from "@iconify/react";

import type { RendererProps } from "../../renderer";
import { ToolLayout } from "../shared/tool-layout";
import { renderClaudeApprovalActions } from "../claude-approval-actions";
import {
  extractTextFromContent,
  isClaudeToolErrorState,
  isClaudeToolRunningState,
  tryParseClaudeOutput,
  useClaudeExpansionState,
  unwrapClaudeInput,
} from "../claude-helpers";

type TodoItem = {
  activeForm: string;
  content: string;
  status: "completed" | "in_progress" | "pending";
};

type ClaudeTodoInput = {
  todos: TodoItem[];
};

type ClaudeTodoOutput = {
  newTodos: TodoItem[];
  oldTodos: TodoItem[];
};

function isTodoInput(value: unknown): value is ClaudeTodoInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.todos);
}

function isTodoOutput(value: unknown): value is ClaudeTodoOutput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.newTodos);
}

function parseTodosFromText(text: string | null): TodoItem[] | null {
  if (!text) return null;

  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const items = parsed.filter(
          (v): v is TodoItem =>
            v &&
            typeof v === "object" &&
            typeof (v as Record<string, unknown>).content === "string" &&
            typeof (v as Record<string, unknown>).status === "string",
        );
        if (items.length > 0) return items;
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>).newTodos)
      ) {
        return (parsed as ClaudeTodoOutput).newTodos;
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>).todos)
      ) {
        return (parsed as ClaudeTodoInput).todos;
      }
    } catch {
      /* not JSON */
    }
  }

  const lines = trimmed.split("\n").filter(Boolean);
  const items: TodoItem[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-•*\d.)\]]+\s*/, "").trim();
    if (!cleaned) continue;

    let status: TodoItem["status"] = "pending";
    if (/\[x\]/i.test(line) || /✅|completed|done/i.test(line)) {
      status = "completed";
    } else if (/🔄|in.?progress|working/i.test(line)) {
      status = "in_progress";
    }

    items.push({ activeForm: "", content: cleaned, status });
  }

  return items.length > 0 ? items : null;
}

const STATUS_ICON: Record<TodoItem["status"], string> = {
  completed: "solar:check-circle-bold",
  in_progress: "solar:play-circle-bold",
  pending: "solar:record-circle-linear",
};

const STATUS_COLOR: Record<TodoItem["status"], string> = {
  completed: "text-success",
  in_progress: "text-primary",
  pending: "text-foreground/30",
};

function TodoList({ items }: { items: TodoItem[] }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <Icon
            icon={STATUS_ICON[item.status]}
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${STATUS_COLOR[item.status]}`}
          />
          <span
            className={`text-[12px] leading-[18px] ${
              item.status === "completed"
                ? "text-foreground/50 line-through decoration-foreground/20"
                : item.status === "in_progress"
                  ? "font-medium text-foreground/90"
                  : "text-foreground/60"
            }`}
          >
            {item.content}
          </span>
        </div>
      ))}
    </div>
  );
}

function TodoSummary(
  part: RendererProps["part"],
  items: TodoItem[],
): ReactNode {
  const completed = items.filter((t) => t.status === "completed").length;
  const total = items.length;

  if (part.state === "output-denied") return "Task update denied";
  if (part.state === "output-error") return "Failed to update tasks";

  if (part.state === "output-available") {
    return (
      <>
        Updated tasks{" "}
        <span className="text-[11px] text-foreground/40">
          {completed}/{total} completed
        </span>
      </>
    );
  }

  if (part.state === "approval-requested") {
    return "Update tasks";
  }

  return "Updating tasks";
}

export const ClaudeTodoWriteTool = memo(function ClaudeTodoWriteTool({
  onApprove,
  onDeny,
  part,
}: RendererProps) {
  const hasInput = "input" in part && part.input !== undefined;
  const hasOutput = "output" in part && part.output !== undefined;
  const unwrapped = unwrapClaudeInput<ClaudeTodoInput>(
    hasInput ? part.input : undefined,
  );
  const todoInput = unwrapped && isTodoInput(unwrapped) ? unwrapped : null;
  const todoOutput = hasOutput
    ? tryParseClaudeOutput(part.output, isTodoOutput)
    : null;
  const fallbackOutputText =
    hasOutput && !todoOutput ? extractTextFromContent(part.output) : null;
  const parsedFromText = !todoOutput
    ? parseTodosFromText(fallbackOutputText)
    : null;

  const isRunning = isClaudeToolRunningState(part.state);
  const isError = isClaudeToolErrorState(part.state);

  const items =
    todoOutput?.newTodos ?? parsedFromText ?? todoInput?.todos ?? [];
  if (items.length === 0 && !fallbackOutputText?.trim()) return null;
  const [isExpanded, setIsExpanded] = useClaudeExpansionState(
    part,
    part.state === "approval-requested" || isRunning,
  );

  const summary = (
    <>
      <Icon
        icon="solar:checklist-minimalistic-linear"
        className="mr-1 inline-block h-3.5 w-3.5 shrink-0 align-text-bottom text-foreground/50"
      />
      {TodoSummary(part, items)}
    </>
  );
  const actions = renderClaudeApprovalActions({ onApprove, onDeny, part });

  return (
    <ToolLayout
      actions={actions}
      summary={summary}
      isRunning={isRunning}
      isError={isError}
      isExpandable
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {items.length > 0 ? (
        <TodoList items={items} />
      ) : (
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[18px] text-foreground/70">
          {fallbackOutputText}
        </pre>
      )}
    </ToolLayout>
  );
});
