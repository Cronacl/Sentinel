"use client";

import { useRef } from "react";

import type { ThreadPlanAudience } from "@/lib/plan";

export type PlanToolName =
  | "ask_question"
  | "create_plan"
  | "manage_task"
  | "update_plan";

export type PlanDraftPart = {
  input?: unknown;
  output?: unknown;
  state: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
};

export type PlanDocumentDraft = {
  audience: ThreadPlanAudience;
  document: string;
  goal: string;
  isStreaming: boolean;
  summary: string;
  taskCount?: number;
  tasks?: Array<{
    description?: string | null;
    title: string;
  }>;
  title: string;
};

function readStringField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function readNumberField(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" ? candidate : undefined;
}

function readFieldFromSources<T>(
  sources: unknown[],
  reader: (value: unknown) => T | undefined,
) {
  for (const source of sources) {
    const value = reader(source);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function readAudienceField(value: unknown): ThreadPlanAudience | undefined {
  const audience = readStringField(value, "audience");
  return audience === "general" || audience === "technical"
    ? audience
    : undefined;
}

function readTaskDrafts(value: unknown) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const tasks = (value as Record<string, unknown>).tasks;
  if (!Array.isArray(tasks)) {
    return undefined;
  }

  return tasks
    .map((task) => {
      if (!task || typeof task !== "object") {
        return null;
      }

      const candidate = task as Record<string, unknown>;
      if (typeof candidate.title !== "string" || !candidate.title.trim()) {
        return null;
      }

      return {
        description:
          typeof candidate.description === "string"
            ? candidate.description
            : null,
        title: candidate.title,
      };
    })
    .filter((task): task is { description: string | null; title: string } =>
      Boolean(task),
    );
}

function getDraftSources(part: PlanDraftPart) {
  const sources: unknown[] = [];

  if ("output" in part && part.output !== undefined) {
    sources.push(part.output);
  }

  if ("input" in part && part.input !== undefined) {
    sources.push(part.input);
  }

  return sources;
}

export function getPlanToolName(
  part: PlanDraftPart,
): PlanToolName | null {
  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);

  if (
    toolName === "create_plan" ||
    toolName === "update_plan" ||
    toolName === "manage_task" ||
    toolName === "ask_question"
  ) {
    return toolName;
  }

  return null;
}

export function getPlanDraft(
  toolName: PlanToolName | null,
  part: PlanDraftPart,
): PlanDocumentDraft | null {
  if (toolName !== "create_plan" && toolName !== "update_plan") {
    return null;
  }

  const sources = getDraftSources(part);
  const document =
    readFieldFromSources(sources, (source) => readStringField(source, "document")) ??
    "";
  const goal =
    readFieldFromSources(sources, (source) => readStringField(source, "goal")) ??
    "";
  const summary =
    readFieldFromSources(sources, (source) => readStringField(source, "summary")) ??
    "";
  const title =
    readFieldFromSources(sources, (source) => readStringField(source, "title")) ??
    (toolName === "create_plan" ? "Drafting plan" : "Updating plan");
  const tasks = readFieldFromSources(sources, readTaskDrafts);
  const taskCount =
    readFieldFromSources(sources, (source) => readNumberField(source, "taskCount")) ??
    tasks?.length;
  const audience =
    readFieldFromSources(sources, readAudienceField) ?? "technical";
  const isStreaming =
    part.state === "input-streaming" || part.state === "input-available";

  if (sources.length === 0 && !title) {
    return null;
  }

  return {
    audience,
    document,
    goal,
    isStreaming,
    summary,
    taskCount,
    tasks,
    title,
  };
}

function areDraftTasksEqual(
  a: PlanDocumentDraft["tasks"],
  b: PlanDocumentDraft["tasks"],
) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every(
    (t, i) => t.title === b[i]?.title && t.description === b[i]?.description,
  );
}

function areDraftsEqual(
  a: PlanDocumentDraft | null,
  b: PlanDocumentDraft | null,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.audience === b.audience &&
    a.document === b.document &&
    a.goal === b.goal &&
    a.isStreaming === b.isStreaming &&
    a.summary === b.summary &&
    a.taskCount === b.taskCount &&
    a.title === b.title &&
    areDraftTasksEqual(a.tasks, b.tasks)
  );
}

export function useStablePlanDraft(
  toolName: PlanToolName | null,
  part: PlanDraftPart,
): PlanDocumentDraft | null {
  const ref = useRef<PlanDocumentDraft | null>(null);
  const next = getPlanDraft(toolName, part);

  if (!areDraftsEqual(ref.current, next)) {
    ref.current = next;
  }

  return ref.current;
}
