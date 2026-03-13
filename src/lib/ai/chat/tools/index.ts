import { tool } from "ai";
import { z } from "zod";

import type { ThreadAgentCallOptions } from "../agent";
import {
  askQuestionDescription,
  createFileDescription,
  createPlanDescription,
  deleteFileDescription,
  editDescription,
  forgetMemoryDescription,
  globDescription,
  grepDescription,
  listDescription,
  manageTaskDescription,
  multieditDescription,
  readDescription,
  runTaskDescription,
  saveMemoryDescription,
  searchMemoryDescription,
  shellCommandDescription,
  updatePlanDescription,
  webfetchDescription,
  websearchDescription,
} from "../tool-descriptions";
import {
  executeAskQuestion,
  askQuestionInputSchema,
  askQuestionOutputSchema,
} from "./ask-question";
import {
  executeCreateFile,
  createFileInputSchema,
  createFileOutputSchema,
} from "./create-file";
import {
  executeCreatePlan,
  createPlanInputSchema,
  createPlanOutputSchema,
} from "./create-plan";
import {
  executeDeleteFile,
  deleteFileInputSchema,
  deleteFileOutputSchema,
} from "./delete-file";
import { executeEdit, editInputSchema, editOutputSchema } from "./edit";
import {
  executeForgetMemory,
  forgetMemoryInputSchema,
  forgetMemoryOutputSchema,
} from "./forget-memory";
import { executeGlob, globInputSchema, globOutputSchema } from "./glob";
import { executeGrep, grepInputSchema, grepOutputSchema } from "./grep";
import { executeList, listInputSchema, listOutputSchema } from "./list";
import {
  executeManageTask,
  manageTaskInputSchema,
  manageTaskOutputSchema,
} from "./manage-task";
import {
  executeMultiEdit,
  multieditInputSchema,
  multieditOutputSchema,
} from "./multiedit";
import { executeRead, readInputSchema, readOutputSchema } from "./read";
import { runTaskInputSchema, runTaskOutputSchema, streamRunTask } from "./run-task";
import {
  executeSaveMemory,
  saveMemoryInputSchema,
  saveMemoryOutputSchema,
} from "./save-memory";
import {
  executeSearchMemory,
  searchMemoryInputSchema,
  searchMemoryOutputSchema,
} from "./search-memory";
import {
  assertShellCommandAllowed,
  disposeShellSession,
  streamShellCommand,
} from "./shell";
import {
  executeUpdatePlan,
  updatePlanInputSchema,
  updatePlanOutputSchema,
} from "./update-plan";
import {
  executeWebFetch,
  webFetchInputSchema,
  webFetchOutputSchema,
} from "./webfetch";
import {
  executeWebSearch,
  webSearchInputSchema,
  webSearchOutputSchema,
} from "./websearch";

export { TOOL_CATALOG, getActiveCategories, getToolsInCategory } from "./catalog";
export type { ToolCategory, ToolCatalogEntry } from "./catalog";

// ---------------------------------------------------------------------------
// Shell command schemas (inline, not exported from shell.ts)
// ---------------------------------------------------------------------------

const shellCommandInputSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe("One shell command to run in the linked workspace root."),
  rationale: z
    .string()
    .min(1)
    .describe("Why this command is needed and what you expect to learn."),
});

const shellCommandRunningOutputSchema = z.object({
  cwd: z.string(),
  durationMs: z.number(),
  phase: z.literal("running"),
  tail: z.string(),
  truncated: z.boolean(),
});

const shellCommandCompletedOutputSchema = z.object({
  cwd: z.string(),
  durationMs: z.number(),
  exitCode: z.number(),
  phase: z.literal("completed"),
  stderr: z.string(),
  stdout: z.string(),
  truncated: z.boolean(),
});

const shellCommandOutputSchema = z.discriminatedUnion("phase", [
  shellCommandRunningOutputSchema,
  shellCommandCompletedOutputSchema,
]);

// ---------------------------------------------------------------------------
// Individual tool group builders
// ---------------------------------------------------------------------------

function buildInspectionTools(options: ThreadAgentCallOptions) {
  const { defaultDirectory, permissionMode, toolApprovalPolicies } = options;

  return {
    list: tool({
      description: listDescription,
      inputSchema: listInputSchema,
      needsApproval: () => toolApprovalPolicies.list,
      outputSchema: listOutputSchema,
      execute: async (input) =>
        executeList({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
    glob: tool({
      description: globDescription,
      inputSchema: globInputSchema,
      needsApproval: () => toolApprovalPolicies.glob,
      outputSchema: globOutputSchema,
      execute: async (input) =>
        executeGlob({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
    read: tool({
      description: readDescription,
      inputSchema: readInputSchema,
      needsApproval: () => toolApprovalPolicies.read,
      outputSchema: readOutputSchema,
      execute: async (input) =>
        executeRead({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
    grep: tool({
      description: grepDescription,
      inputSchema: grepInputSchema,
      needsApproval: () => toolApprovalPolicies.grep,
      outputSchema: grepOutputSchema,
      execute: async (input) =>
        executeGrep({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
  };
}

function buildMutationTools(options: ThreadAgentCallOptions) {
  const { defaultDirectory, permissionMode, toolApprovalPolicies } = options;

  return {
    edit: tool({
      description: editDescription,
      inputSchema: editInputSchema,
      needsApproval: () => toolApprovalPolicies.edit,
      outputSchema: editOutputSchema,
      execute: async (input) =>
        executeEdit({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
    multiedit: tool({
      description: multieditDescription,
      inputSchema: multieditInputSchema,
      needsApproval: () => toolApprovalPolicies.multiedit,
      outputSchema: multieditOutputSchema,
      execute: async (input) =>
        executeMultiEdit({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
    create_file: tool({
      description: createFileDescription,
      inputSchema: createFileInputSchema,
      needsApproval: () => toolApprovalPolicies.create_file,
      outputSchema: createFileOutputSchema,
      execute: async (input) =>
        executeCreateFile({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
    delete_file: tool({
      description: deleteFileDescription,
      inputSchema: deleteFileInputSchema,
      needsApproval: () => toolApprovalPolicies.delete_file,
      outputSchema: deleteFileOutputSchema,
      execute: async (input) =>
        executeDeleteFile({ defaultDirectory: defaultDirectory!, input, permissionMode }),
    }),
  };
}

function buildExecutionTools(options: ThreadAgentCallOptions) {
  const { defaultDirectory, permissionMode, threadId, toolApprovalPolicies } =
    options;

  return {
    run_task: tool({
      description: runTaskDescription,
      inputSchema: runTaskInputSchema,
      needsApproval: () => toolApprovalPolicies.run_task,
      outputSchema: runTaskOutputSchema,
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: output.phase === "completed" ? output : { phase: "running" },
      }),
      execute: async function* (input, { abortSignal }) {
        const abortShell = () => {
          void disposeShellSession(threadId);
        };
        abortSignal?.addEventListener("abort", abortShell, { once: true });
        try {
          for await (const event of streamRunTask({
            allowedRoot:
              permissionMode === "default" ? defaultDirectory! : undefined,
            defaultDirectory: defaultDirectory!,
            input,
            permissionMode,
            threadId,
          })) {
            if (event.type === "error") throw event.error;
            if (event.output) yield event.output;
          }
        } finally {
          abortSignal?.removeEventListener("abort", abortShell);
        }
      },
    }),
    shell_command: tool({
      description: shellCommandDescription,
      inputSchema: shellCommandInputSchema,
      needsApproval: () => toolApprovalPolicies.shell_command,
      outputSchema: shellCommandOutputSchema,
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: output.phase === "completed" ? output : { phase: "running" },
      }),
      execute: async function* ({ command }, { abortSignal }) {
        if (permissionMode === "default") {
          assertShellCommandAllowed(command);
        }
        const abortShell = () => {
          void disposeShellSession(threadId);
        };
        abortSignal?.addEventListener("abort", abortShell, { once: true });
        try {
          for await (const event of streamShellCommand({
            allowedRoot:
              permissionMode === "default" ? defaultDirectory! : undefined,
            command,
            defaultDirectory: defaultDirectory!,
            permissionMode,
            threadId,
          })) {
            if (event.type === "error") throw event.error;
            yield event.output;
          }
        } finally {
          abortSignal?.removeEventListener("abort", abortShell);
        }
      },
    }),
  };
}

function buildMemoryTools(options: ThreadAgentCallOptions) {
  const {
    memorySettings,
    sourceMessageId,
    threadId,
    toolApprovalPolicies,
    userId,
    workspaceId,
  } = options;

  return {
    search_memory: tool({
      description: searchMemoryDescription,
      inputSchema: searchMemoryInputSchema,
      needsApproval: () => toolApprovalPolicies.search_memory,
      outputSchema: searchMemoryOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeSearchMemory({
          abortSignal,
          input,
          runtime: { settings: memorySettings, userId, workspaceId },
        }),
    }),
    save_memory: tool({
      description: saveMemoryDescription,
      inputSchema: saveMemoryInputSchema,
      needsApproval: () => toolApprovalPolicies.save_memory,
      outputSchema: saveMemoryOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeSaveMemory({
          abortSignal,
          input,
          runtime: {
            settings: memorySettings,
            sourceMessageId,
            threadId,
            userId,
            workspaceId,
          },
        }),
    }),
    forget_memory: tool({
      description: forgetMemoryDescription,
      inputSchema: forgetMemoryInputSchema,
      needsApproval: () => toolApprovalPolicies.forget_memory,
      outputSchema: forgetMemoryOutputSchema,
      execute: async (input) =>
        executeForgetMemory({ input, runtime: { userId } }),
    }),
  };
}

function buildWebTools(options: ThreadAgentCallOptions) {
  const { searchProviders, searchSettings, toolApprovalPolicies, webFetchSettings } =
    options;

  return {
    websearch: tool({
      description: websearchDescription,
      inputSchema: webSearchInputSchema,
      needsApproval: () => toolApprovalPolicies.websearch,
      outputSchema: webSearchOutputSchema,
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          digest: output.digest,
          livecrawl: output.livecrawl,
          provider: output.provider,
          query: output.query,
          resolvedSearchType: output.resolvedSearchType,
          resultCount: output.resultCount,
          results: output.results.map((r) => ({
            author: r.author,
            publishedDate: r.publishedDate,
            summary: r.summary,
            title: r.title,
            url: r.url,
          })),
          searchType: output.searchType,
        },
      }),
      execute: async (input, { abortSignal }) =>
        executeWebSearch({
          abortSignal,
          input,
          runtime: { providers: searchProviders, settings: searchSettings },
        }),
    }),
    webfetch: tool({
      description: webfetchDescription,
      inputSchema: webFetchInputSchema,
      needsApproval: () => toolApprovalPolicies.webfetch,
      outputSchema: webFetchOutputSchema,
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value: {
          ...output,
          results: output.results.map((r) =>
            r.status === "success" && r.isImage
              ? {
                  ...r,
                  imageDataUrl:
                    "[omitted from model output; image preview available in the UI]",
                }
              : r,
          ),
        },
      }),
      execute: async (input, { abortSignal }) =>
        executeWebFetch({ abortSignal, input, settings: webFetchSettings }),
    }),
  };
}

function buildPlanTools(options: ThreadAgentCallOptions) {
  const { threadId } = options;

  return {
    create_plan: tool({
      description: createPlanDescription,
      inputSchema: createPlanInputSchema,
      outputSchema: createPlanOutputSchema,
      execute: async (input) =>
        executeCreatePlan({ input, runtime: { threadId } }),
    }),
    update_plan: tool({
      description: updatePlanDescription,
      inputSchema: updatePlanInputSchema,
      outputSchema: updatePlanOutputSchema,
      execute: async (input) =>
        executeUpdatePlan({ input, runtime: { threadId } }),
    }),
    manage_task: tool({
      description: manageTaskDescription,
      inputSchema: manageTaskInputSchema,
      outputSchema: manageTaskOutputSchema,
      execute: async (input) =>
        executeManageTask({ input, runtime: { threadId } }),
    }),
    ask_question: tool({
      description: askQuestionDescription,
      inputSchema: askQuestionInputSchema,
      outputSchema: askQuestionOutputSchema,
      execute: async (input) =>
        executeAskQuestion({ input, runtime: { threadId } }),
    }),
  };
}

function buildPlanToolSchemas(options: ThreadAgentCallOptions) {
  const { threadId } = options;
  const unavailable = async () => {
    throw new Error(
      "This tool is only available in plan mode. Use the workspace tools to implement the plan.",
    );
  };

  return {
    create_plan: tool({
      description: createPlanDescription,
      inputSchema: createPlanInputSchema,
      outputSchema: createPlanOutputSchema,
      execute: unavailable,
    }),
    update_plan: tool({
      description: updatePlanDescription,
      inputSchema: updatePlanInputSchema,
      outputSchema: updatePlanOutputSchema,
      execute: unavailable,
    }),
    manage_task: tool({
      description: manageTaskDescription,
      inputSchema: manageTaskInputSchema,
      outputSchema: manageTaskOutputSchema,
      execute: async (input) =>
        executeManageTask({ input, runtime: { threadId } }),
    }),
    ask_question: tool({
      description: askQuestionDescription,
      inputSchema: askQuestionInputSchema,
      outputSchema: askQuestionOutputSchema,
      execute: unavailable,
    }),
  };
}

// ---------------------------------------------------------------------------
// Public API: single entry point for all tool assembly
// ---------------------------------------------------------------------------

export function buildTools(options: ThreadAgentCallOptions) {
  if (options.threadMode === "plan") {
    return {
      ...(options.toolsEnabled ? buildInspectionTools(options) : {}),
      ...buildPlanTools(options),
    };
  }

  return {
    ...buildPlanToolSchemas(options),
    ...buildMemoryTools(options),
    ...buildWebTools(options),
    ...(options.toolsEnabled
      ? {
          ...buildInspectionTools(options),
          ...buildMutationTools(options),
          ...buildExecutionTools(options),
        }
      : {}),
  };
}
