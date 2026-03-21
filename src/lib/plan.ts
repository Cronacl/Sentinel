export const THREAD_MODES = ["chat", "plan"] as const;
export type ThreadMode = (typeof THREAD_MODES)[number];

export const THREAD_PLAN_TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "blocked",
] as const;
export type ThreadPlanTaskStatus = (typeof THREAD_PLAN_TASK_STATUSES)[number];

export const THREAD_PLAN_QUESTION_STATUSES = [
  "pending",
  "answered",
  "cancelled",
] as const;
export type ThreadPlanQuestionStatus =
  (typeof THREAD_PLAN_QUESTION_STATUSES)[number];

export const THREAD_PLAN_AUDIENCES = ["technical", "general"] as const;
export type ThreadPlanAudience = (typeof THREAD_PLAN_AUDIENCES)[number];

export type ThreadPlanQuestionOption = {
  description: string;
  label: string;
};

export type ThreadPlanQuestion = {
  allowMultiple?: boolean;
  header: string;
  id: string;
  options: ThreadPlanQuestionOption[];
  question: string;
};

export type ThreadPlanAnswer = {
  answer: string;
  optionLabel?: string | null;
  questionId: string;
};

export type ThreadPlanTask = {
  createdAt: Date;
  description: string | null;
  id: string;
  status: ThreadPlanTaskStatus;
  title: string;
  updatedAt: Date;
};

export type ThreadPlan = {
  audience: ThreadPlanAudience;
  createdAt: Date;
  document: string;
  goal: string;
  id: string;
  summary: string;
  tasks: ThreadPlanTask[];
  threadId: string;
  title: string;
  updatedAt: Date;
};

export type ThreadPlanQuestionSet = {
  answeredAt: Date | null;
  answers: ThreadPlanAnswer[] | null;
  createdAt: Date;
  id: string;
  questions: ThreadPlanQuestion[];
  status: ThreadPlanQuestionStatus;
  threadId: string;
  updatedAt: Date;
};

export function getDefaultThreadMode(): ThreadMode {
  return "chat";
}

export function normalizeThreadMode(value: unknown): ThreadMode {
  return value === "plan" ? "plan" : "chat";
}

export function getTaskStatusLabel(status: ThreadPlanTaskStatus) {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "blocked":
      return "Blocked";
    default:
      return "Pending";
  }
}

export function getPlanAudienceLabel(audience: ThreadPlanAudience) {
  return audience === "general" ? "General" : "Technical";
}

function buildWorkBreakdown(
  tasks: Array<{
    description?: string | null;
    status: ThreadPlanTaskStatus;
    title: string;
  }>,
) {
  if (tasks.length === 0) {
    return [
      "1. Inspect the relevant repository areas and confirm the implementation boundaries.",
      "2. Break the work into concrete milestones before execution begins.",
      "3. Add validation checkpoints so the implementer can confirm progress safely.",
    ].join("\n");
  }

  return tasks
    .map((task, index) =>
      [
        `${index + 1}. ${task.title}`,
        task.description ? `   - ${task.description}` : null,
        `   - Status: ${getTaskStatusLabel(task.status)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
}

export function buildDefaultPlanDocument(plan: {
  audience: ThreadPlanAudience;
  goal: string;
  summary: string;
  tasks: Array<{
    description?: string | null;
    status: ThreadPlanTaskStatus;
    title: string;
  }>;
  title: string;
}) {
  if (plan.audience === "general") {
    return [
      `# ${plan.title}`,
      "## Overview",
      plan.summary,
      "## Current Understanding",
      [
        `- Goal: ${plan.goal}`,
        "- This plan is intended for a broad audience and should stay readable without deep implementation detail.",
        "- The exact implementation should follow the existing product and workspace constraints discovered during inspection.",
      ].join("\n"),
      "## Recommended Approach",
      [
        "- Confirm the current product/workspace behavior and identify the smallest safe path to the desired outcome.",
        "- Sequence the work so visible user impact and key decisions are easy to review before broader rollout.",
        "- Keep communication clear about what changes, what stays the same, and how success will be verified.",
      ].join("\n"),
      "## Work Breakdown",
      buildWorkBreakdown(plan.tasks),
      "## Risks and Open Questions",
      [
        "- Clarify any unresolved scope, content, or rollout questions before implementation begins.",
        "- Watch for dependencies on existing workflows, messaging, or data that may affect the final experience.",
      ].join("\n"),
      "## Validation",
      [
        "- Confirm the delivered result matches the stated goal and summary.",
        "- Verify the final experience is understandable to the intended audience.",
        "- Check that any related workflows remain coherent after the change.",
      ].join("\n"),
    ].join("\n\n");
  }

  return [
    `# ${plan.title}`,
    "## Overview",
    plan.summary,
    "## Current Understanding",
    [
      `- Goal: ${plan.goal}`,
      "- This is a technical implementation plan intended for an engineer or agent.",
      "- The plan should align with existing repository patterns, interfaces, and architectural boundaries.",
    ].join("\n"),
    "## Recommended Approach",
    [
      "- Inspect the relevant entry points, schemas, persistence layers, and UI surfaces before changing behavior.",
      "- Prefer extending the existing plan/task/question model instead of introducing a parallel representation.",
      "- Keep the persisted markdown document as the human-facing artifact while structured task state remains the execution source of truth.",
    ].join("\n"),
    "## Architecture and Touchpoints",
    [
      "- Identify the backend surfaces responsible for plan persistence and migration/backfill behavior.",
      "- Identify the planner/tool interfaces that generate and update plan content.",
      "- Identify the UI surfaces that render the plan document, task state, and clarification state.",
    ].join("\n"),
    "## Work Breakdown",
    buildWorkBreakdown(plan.tasks),
    "## Risks and Open Questions",
    [
      "- Ensure backfilled plans remain stable for existing threads and do not lose task/question state.",
      "- Ensure plan updates revise the long-form markdown document without collapsing into terse summaries.",
      "- Confirm the richer renderer remains readable on both mobile and desktop layouts.",
    ].join("\n"),
    "## Validation",
    [
      "- Verify persistence returns audience and markdown document fields consistently.",
      "- Verify plan-mode prompts remain read-only and inspection-first.",
      "- Verify the expanded plan UI renders the markdown document and task controls together without regressions.",
    ].join("\n"),
    "## Critical Implementation Touchpoints",
    [
      "- Persistence and backfill logic for plan records.",
      "- Planner tool schemas/outputs and system instructions.",
      "- Document-first plan rendering in the thread view and tool cards.",
    ].join("\n"),
  ].join("\n\n");
}

export function buildPlanPromptLines(
  plan: {
    audience: ThreadPlanAudience;
    document: string;
    goal: string;
    questions?: ThreadPlanQuestionSet | null;
    summary: string;
    tasks: Array<{
      description?: string | null;
      status: ThreadPlanTaskStatus;
      title: string;
    }>;
    title: string;
  } | null,
) {
  if (!plan) {
    return [];
  }

  const lines = [
    `Current plan title: ${plan.title}`,
    `Current plan audience: ${getPlanAudienceLabel(plan.audience)}`,
    `Current plan goal: ${plan.goal}`,
    `Current plan summary: ${plan.summary}`,
  ];

  if (plan.tasks.length > 0) {
    lines.push("Current plan tasks:");
    for (const task of plan.tasks) {
      lines.push(
        `- [${getTaskStatusLabel(task.status)}] ${task.title}${task.description ? `: ${task.description}` : ""}`,
      );
    }
  }

  if (plan.questions?.status === "pending") {
    lines.push("There is an unanswered clarification set pending.");
  }

  lines.push("Current plan markdown document:");
  lines.push(plan.document);

  return lines;
}
