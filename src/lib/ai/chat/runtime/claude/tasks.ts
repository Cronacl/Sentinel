import type { ThreadUIMessage } from "@/lib/ai/messages/types";

// Claude Code's Task* tools (TaskCreate/TaskUpdate/TaskGet/TaskList) replaced
// TodoWrite in Agent SDK 0.3.142. Unlike TodoWrite, no single call carries the
// whole list, so Sentinel accumulates tasks by id and stores the list as it
// stands after each call on that call's tool output (`output.tasks`), which
// the claude_task* renderers display.

export type ClaudeTaskStatus = "completed" | "in_progress" | "pending";

export type ClaudeTaskSnapshot = {
  activeForm?: string;
  blockedBy?: string[];
  description?: string;
  id: string;
  owner?: string;
  status: ClaudeTaskStatus;
  subject: string;
};

const CLAUDE_TASK_TOOL_NAMES = new Set([
  "claude_taskcreate",
  "claude_taskget",
  "claude_tasklist",
  "claude_taskupdate",
]);

// TaskCreate's text result when no structured tool_use_result is available.
const TASK_CREATED_TEXT_PATTERN = /\bTask #?([\w-]+) created\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

function readStatus(value: unknown): ClaudeTaskStatus | undefined {
  return value === "pending" || value === "in_progress" || value === "completed"
    ? value
    : undefined;
}

function readOutputText(output: unknown): string | null {
  if (typeof output === "string") {
    return output;
  }

  if (isRecord(output) && typeof output.stdout === "string") {
    return output.stdout;
  }

  if (Array.isArray(output)) {
    const text = output
      .map((entry) =>
        isRecord(entry) && typeof entry.text === "string" ? entry.text : "",
      )
      .join("\n");
    return text || null;
  }

  return null;
}

function readTaskEntry(
  value: unknown,
  previous?: ClaudeTaskSnapshot,
): ClaudeTaskSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const subject = readString(value.subject) ?? previous?.subject;
  if (!id || !subject) {
    return null;
  }

  const description = readString(value.description) ?? previous?.description;
  const activeForm = readString(value.activeForm) ?? previous?.activeForm;
  const owner = readString(value.owner) ?? previous?.owner;
  const blockedBy = readStringArray(value.blockedBy) ?? previous?.blockedBy;

  return {
    ...(activeForm ? { activeForm } : {}),
    ...(blockedBy && blockedBy.length > 0 ? { blockedBy } : {}),
    ...(description ? { description } : {}),
    id,
    ...(owner ? { owner } : {}),
    status: readStatus(value.status) ?? previous?.status ?? "pending",
    subject,
  };
}

export function isClaudeTaskToolName(toolName: string) {
  return CLAUDE_TASK_TOOL_NAMES.has(toolName);
}

/**
 * Applies one completed Task* call to the accumulated tasks. `output` is the
 * structured tool_use_result when the SDK sent one, else the tool_result
 * content.
 */
export function applyClaudeTaskToolResult(
  tasks: Map<string, ClaudeTaskSnapshot>,
  call: { input: unknown; output: unknown; toolName: string },
) {
  const input = isRecord(call.input) ? call.input : {};
  const output = isRecord(call.output) ? call.output : {};

  switch (call.toolName) {
    case "claude_taskcreate": {
      const createdTask = isRecord(output.task) ? output.task : {};
      const id =
        readString(createdTask.id) ??
        TASK_CREATED_TEXT_PATTERN.exec(readOutputText(call.output) ?? "")?.[1];
      const subject =
        readString(createdTask.subject) ?? readString(input.subject);
      if (!id || !subject) {
        return tasks;
      }

      const description = readString(input.description);
      const activeForm = readString(input.activeForm);
      tasks.set(id, {
        ...(activeForm ? { activeForm } : {}),
        ...(description ? { description } : {}),
        id,
        status: "pending",
        subject,
      });
      return tasks;
    }
    case "claude_taskupdate": {
      const id = readString(input.taskId) ?? readString(output.taskId);
      if (!id || output.success === false) {
        return tasks;
      }

      if (input.status === "deleted") {
        tasks.delete(id);
        return tasks;
      }

      const previous = tasks.get(id);
      const statusChange = isRecord(output.statusChange)
        ? output.statusChange
        : {};
      const addBlockedBy = readStringArray(input.addBlockedBy) ?? [];
      const blockedBy = [
        ...new Set([...(previous?.blockedBy ?? []), ...addBlockedBy]),
      ];
      const next = readTaskEntry(
        {
          activeForm: input.activeForm,
          blockedBy,
          description: input.description,
          id,
          owner: input.owner,
          status: readStatus(input.status) ?? readStatus(statusChange.to),
          subject: input.subject ?? previous?.subject ?? `Task ${id}`,
        },
        previous,
      );
      if (next) {
        tasks.set(id, next);
      }
      return tasks;
    }
    case "claude_taskget": {
      if (output.task === null) {
        const id = readString(input.taskId);
        if (id) {
          tasks.delete(id);
        }
        return tasks;
      }

      const task = isRecord(output.task) ? output.task : null;
      const id = readString(task?.id);
      const next = id ? readTaskEntry(task, tasks.get(id)) : null;
      if (next) {
        tasks.set(next.id, next);
      }
      return tasks;
    }
    case "claude_tasklist": {
      if (!Array.isArray(output.tasks)) {
        return tasks;
      }

      // TaskList is authoritative: rebuild in its order, keeping details only
      // earlier calls saw (descriptions, active forms).
      const listed = output.tasks.flatMap((entry) => {
        const id = isRecord(entry) ? readString(entry.id) : undefined;
        const next = readTaskEntry(entry, id ? tasks.get(id) : undefined);
        return next ? [next] : [];
      });
      tasks.clear();
      for (const task of listed) {
        tasks.set(task.id, task);
      }
      return tasks;
    }
    default:
      return tasks;
  }
}

export function listClaudeTasks(tasks: Map<string, ClaudeTaskSnapshot>) {
  return [...tasks.values()].map((task) => ({ ...task }));
}

/**
 * The output Sentinel stores on a completed Task* tool part: the list as it
 * stands after the call, tagged with the Claude session that owns its ids.
 */
export function buildClaudeTaskToolOutput(input: {
  output: unknown;
  sessionId: string;
  tasks: ClaudeTaskSnapshot[];
}) {
  const base = isRecord(input.output)
    ? input.output
    : { stdout: readOutputText(input.output) ?? "" };

  return { ...base, claudeSessionId: input.sessionId, tasks: input.tasks };
}

function readTaskSnapshot(output: unknown) {
  if (!isRecord(output) || !Array.isArray(output.tasks)) {
    return null;
  }

  return output.tasks.flatMap((entry) => {
    const task = readTaskEntry(entry);
    return task ? [task] : [];
  });
}

function readTaskSessionId(output: unknown) {
  return isRecord(output) ? readString(output.claudeSessionId) : undefined;
}

/**
 * Rebuilds the accumulated tasks of the Claude session being resumed from the
 * thread transcript. Task ids restart at 1 in every session and a thread
 * starts a new session when its mode changes, so only lists stored for
 * `sessionId` count; the latest wins. Calls stored without a list (e.g. still
 * running when a run ended) are replayed only after that session's own list,
 * since before it they could belong to an earlier session.
 */
export function seedClaudeTasksFromMessages(
  messages: ThreadUIMessage[],
  sessionId: string,
) {
  const tasks = new Map<string, ClaudeTaskSnapshot>();
  let seenSessionList = false;

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type !== "dynamic-tool" ||
        !isClaudeTaskToolName(part.toolName) ||
        part.state !== "output-available"
      ) {
        continue;
      }

      const partSessionId = readTaskSessionId(part.output);
      if (partSessionId !== undefined && partSessionId !== sessionId) {
        continue;
      }

      const snapshot = partSessionId ? readTaskSnapshot(part.output) : null;
      if (snapshot) {
        tasks.clear();
        for (const task of snapshot) {
          tasks.set(task.id, task);
        }
        seenSessionList = true;
        continue;
      }

      if (!seenSessionList) {
        continue;
      }

      applyClaudeTaskToolResult(tasks, {
        input: part.input,
        output: part.output,
        toolName: part.toolName,
      });
    }
  }

  return tasks;
}
