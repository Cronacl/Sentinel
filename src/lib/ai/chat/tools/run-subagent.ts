import { z } from "zod";

import type { ThreadAgentCallOptions } from "../agent";
import {
  ensureVirtualThread,
  getLatestVisibleChildThreadForVirtualThread,
  loadThread,
  loadThreadMessages,
  promoteVirtualThreadToVisibleChild,
} from "../persistence";
import { buildActiveThreadMessages } from "../../messages/branches";
import type { ThreadUIMessage } from "../../messages/types";
import { toCompositeModelId } from "@/lib/ai/providers/models";
import { getThreadPlanState } from "@/lib/plan/service";

const WAIT_INTERVAL_MS = 150;
const MAX_WAIT_MS = 110_000;

const subagentToolHintsSchema = z
  .object({
    categories: z.array(z.string().trim().min(1)).max(8).optional(),
    integrationNamespaces: z.array(z.string().trim().min(1)).max(8).optional(),
    mcpNamespaces: z.array(z.string().trim().min(1)).max(8).optional(),
    note: z.string().trim().min(1).max(1_000).optional(),
  })
  .partial();

export const runSubagentInputSchema = z.object({
  allowMutations: z.boolean().optional().default(true),
  prompt: z.string().trim().min(1).max(20_000),
  toolHints: subagentToolHintsSchema.optional(),
  virtualKey: z.string().trim().min(1).max(120).optional(),
});

export const runSubagentOutputSchema = z.object({
  childThreadId: z.string().nullable(),
  status: z.enum([
    "completed",
    "approval_required",
    "question_required",
    "failed",
  ]),
  summaryText: z.string().nullable(),
  virtualThreadId: z.string(),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildVirtualThreadTitle(
  input: z.infer<typeof runSubagentInputSchema>,
) {
  if (input.virtualKey) {
    return `Sub-agent: ${input.virtualKey}`;
  }

  return `Sub-agent: ${input.prompt.slice(0, 72).trim()}`;
}

function buildChildThreadTitle(input: z.infer<typeof runSubagentInputSchema>) {
  if (input.virtualKey) {
    return `Sub-agent approval: ${input.virtualKey}`;
  }

  return `Sub-agent approval: ${input.prompt.slice(0, 64).trim()}`;
}

function buildDelegatedPrompt(input: z.infer<typeof runSubagentInputSchema>) {
  const hintSections = [
    input.toolHints?.categories?.length
      ? `Preferred tool categories: ${input.toolHints.categories.join(", ")}`
      : null,
    input.toolHints?.integrationNamespaces?.length
      ? `Preferred integration namespaces: ${input.toolHints.integrationNamespaces.join(", ")}`
      : null,
    input.toolHints?.mcpNamespaces?.length
      ? `Preferred MCP namespaces: ${input.toolHints.mcpNamespaces.join(", ")}`
      : null,
    input.toolHints?.note ? `Delegation note: ${input.toolHints.note}` : null,
  ].filter(Boolean);

  return [
    "You are running as a delegated Sentinel sub-agent.",
    "Handle the delegated task thoroughly, but keep your final answer as a detailed standalone markdown summary.",
    "That final summary is the only text that will be returned to the parent agent, so it must preserve the findings, evidence, tools or commands that mattered, decisions, blockers, approvals, and next steps.",
    input.allowMutations
      ? "Mutations are allowed when the runtime exposes the necessary tools and approvals."
      : "Do not mutate files or external systems in this delegation. Stay read-only.",
    hintSections.length > 0 ? hintSections.join("\n") : null,
    "",
    "Delegated task:",
    input.prompt.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSummaryOnlyPrompt() {
  return [
    "Do not do any more investigation or tool calls.",
    "Based only on the work already completed in this thread, provide the required final answer now.",
    "Return a detailed standalone markdown summary that preserves findings, evidence, commands or tools that mattered, blockers, approvals, decisions, and next steps.",
  ].join("\n");
}

function resolveDelegatedModelId(runtime: ThreadAgentCallOptions) {
  if (!runtime.resolvedModelId) {
    return null;
  }

  if (runtime.resolvedModelId.includes(":")) {
    return runtime.resolvedModelId;
  }

  if (!runtime.resolvedProviderId) {
    return runtime.resolvedModelId;
  }

  return toCompositeModelId(
    runtime.resolvedProviderId,
    runtime.resolvedModelId,
  );
}

function getLastAssistantOutcome(messages: ThreadUIMessage[]) {
  let errorMessage: string | null = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }

    const text = message.parts
      .filter(
        (
          part,
        ): part is Extract<
          ThreadUIMessage["parts"][number],
          { type: "text" }
        > => part.type === "text",
      )
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (text) {
      return {
        errorMessage:
          typeof message.metadata?.errorMessage === "string"
            ? message.metadata.errorMessage.trim() || null
            : null,
        summaryText: text,
      };
    }

    if (
      !errorMessage &&
      typeof message.metadata?.errorMessage === "string" &&
      message.metadata.errorMessage.trim().length > 0
    ) {
      errorMessage = message.metadata.errorMessage.trim();
    }
  }

  return {
    errorMessage,
    summaryText: null,
  };
}

async function loadSubagentOutcome(threadId: string) {
  const transcript = buildActiveThreadMessages(
    await loadThreadMessages(threadId),
  );
  return {
    transcript,
    ...getLastAssistantOutcome(transcript),
  };
}

async function waitForThreadToSettle(input: {
  abortSignal?: AbortSignal;
  threadId: string;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    if (input.abortSignal?.aborted) {
      throw new Error("Sub-agent execution aborted.");
    }

    const thread = await loadThread(input.threadId);
    if (!thread) {
      throw new Error("Sub-agent thread disappeared.");
    }

    if (thread.activeRunId == null && thread.status !== "streaming") {
      return thread;
    }

    await sleep(WAIT_INTERVAL_MS);
  }

  throw new Error("Sub-agent execution timed out.");
}

export function toRunSubagentModelOutput(
  output: z.infer<typeof runSubagentOutputSchema>,
) {
  const text =
    output.status === "completed"
      ? (output.summaryText ??
        "Delegated sub-agent completed without a summary.")
      : output.status === "approval_required"
        ? `Delegated sub-agent needs approval in child thread ${output.childThreadId ?? "unknown"}.`
        : output.status === "question_required"
          ? `Delegated sub-agent needs user input in child thread ${output.childThreadId ?? "unknown"}.`
          : (output.summaryText ?? "Delegated sub-agent failed.");

  return {
    type: "text" as const,
    value: text,
  };
}

export async function executeRunSubagent({
  abortSignal,
  input,
  runtime,
}: {
  abortSignal?: AbortSignal;
  input: z.infer<typeof runSubagentInputSchema>;
  runtime: ThreadAgentCallOptions;
}) {
  if (!runtime.workspaceId) {
    throw new Error("Sub-agents require a workspace-backed parent thread.");
  }

  const delegatedModelId = resolveDelegatedModelId(runtime);
  if (!delegatedModelId) {
    throw new Error("Sub-agents require a resolved model selection.");
  }

  const virtualThreadId = await ensureVirtualThread({
    engine: "sentinel",
    mode: "chat",
    parentThreadId: runtime.threadId,
    title: buildVirtualThreadTitle(input),
    userId: runtime.userId,
    virtualKey: input.virtualKey ?? null,
    workspaceId: runtime.workspaceId,
  });

  const existingChild =
    await getLatestVisibleChildThreadForVirtualThread(virtualThreadId);
  if (
    existingChild &&
    (existingChild.status === "awaiting_approval" ||
      existingChild.activeRunId != null)
  ) {
    return {
      childThreadId: existingChild.id,
      status:
        existingChild.status === "awaiting_approval"
          ? ("approval_required" as const)
          : ("question_required" as const),
      summaryText: null,
      virtualThreadId,
    };
  }

  const virtualThread = await loadThread(virtualThreadId);
  if (!virtualThread) {
    throw new Error("Failed to load sub-agent thread.");
  }

  if (virtualThread.status === "awaiting_approval") {
    const childThreadId = await promoteVirtualThreadToVisibleChild({
      parentThreadId: runtime.threadId,
      title: buildChildThreadTitle(input),
      userId: runtime.userId,
      virtualThreadId,
      workspaceId: runtime.workspaceId,
    });

    return {
      childThreadId,
      status: "approval_required" as const,
      summaryText: null,
      virtualThreadId,
    };
  }

  const delegatedMessage: ThreadUIMessage = {
    id: crypto.randomUUID(),
    metadata: {},
    parts: [
      {
        text: buildDelegatedPrompt(input),
        type: "text",
      },
    ],
    role: "user",
  };

  const { runThreadChat } = await import("../runtime/run-thread-chat");
  const response = await runThreadChat(
    {
      engine: "sentinel",
      id: virtualThreadId,
      message: delegatedMessage,
      modelId: delegatedModelId,
      threadMode: "chat",
      toolsEnabled: runtime.toolsEnabled && input.allowMutations,
      trigger: "submit-user-message",
      workspaceId: runtime.workspaceId,
    },
    runtime.userId,
  );

  if (response.status >= 400) {
    throw new Error(`Sub-agent launch failed with status ${response.status}.`);
  }

  const settledThread = await waitForThreadToSettle({
    abortSignal,
    threadId: virtualThreadId,
  });
  let subagentOutcome = await loadSubagentOutcome(virtualThreadId);
  const planState = await getThreadPlanState({
    threadId: virtualThreadId,
  }).catch(() => ({
    pendingQuestionSet: null,
    plan: null,
  }));

  if (
    settledThread.status === "awaiting_approval" ||
    planState.pendingQuestionSet
  ) {
    const childThreadId = await promoteVirtualThreadToVisibleChild({
      parentThreadId: runtime.threadId,
      title: buildChildThreadTitle(input),
      userId: runtime.userId,
      virtualThreadId,
      workspaceId: runtime.workspaceId,
    });

    return {
      childThreadId,
      status:
        settledThread.status === "awaiting_approval"
          ? ("approval_required" as const)
          : ("question_required" as const),
      summaryText: null,
      virtualThreadId,
    };
  }

  if (!subagentOutcome.summaryText && !subagentOutcome.errorMessage) {
    const summaryOnlyMessage: ThreadUIMessage = {
      id: crypto.randomUUID(),
      metadata: {},
      parts: [
        {
          text: buildSummaryOnlyPrompt(),
          type: "text",
        },
      ],
      role: "user",
    };

    const summaryResponse = await runThreadChat(
      {
        engine: "sentinel",
        id: virtualThreadId,
        message: summaryOnlyMessage,
        modelId: delegatedModelId,
        threadMode: "chat",
        toolsEnabled: false,
        trigger: "submit-user-message",
        workspaceId: runtime.workspaceId,
      },
      runtime.userId,
    );

    if (summaryResponse.status >= 400) {
      throw new Error(
        `Sub-agent summary retry failed with status ${summaryResponse.status}.`,
      );
    }

    const summaryThread = await waitForThreadToSettle({
      abortSignal,
      threadId: virtualThreadId,
    });
    const summaryPlanState = await getThreadPlanState({
      threadId: virtualThreadId,
    }).catch(() => ({
      pendingQuestionSet: null,
      plan: null,
    }));

    if (
      summaryThread.status === "awaiting_approval" ||
      summaryPlanState.pendingQuestionSet
    ) {
      const childThreadId = await promoteVirtualThreadToVisibleChild({
        parentThreadId: runtime.threadId,
        title: buildChildThreadTitle(input),
        userId: runtime.userId,
        virtualThreadId,
        workspaceId: runtime.workspaceId,
      });

      return {
        childThreadId,
        status:
          summaryThread.status === "awaiting_approval"
            ? ("approval_required" as const)
            : ("question_required" as const),
        summaryText: null,
        virtualThreadId,
      };
    }

    subagentOutcome = await loadSubagentOutcome(virtualThreadId);
  }

  if (subagentOutcome.errorMessage) {
    return {
      childThreadId: null,
      status: "failed" as const,
      summaryText: subagentOutcome.errorMessage,
      virtualThreadId,
    };
  }

  if (!subagentOutcome.summaryText) {
    return {
      childThreadId: null,
      status: "failed" as const,
      summaryText:
        "Delegated sub-agent finished without a final assistant text summary.",
      virtualThreadId,
    };
  }

  return {
    childThreadId: null,
    status: "completed" as const,
    summaryText: subagentOutcome.summaryText,
    virtualThreadId,
  };
}
