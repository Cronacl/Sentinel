import { tool } from "ai";
import { z } from "zod";

import type { ThreadAgentCallOptions } from "../agent";
import {
  applyPatchDescription,
  askQuestionDescription,
  browserBackDescription,
  browserClickDescription,
  browserConsoleLogsDescription,
  browserFillDescription,
  browserForwardDescription,
  browserNavigateDescription,
  browserOpenDescription,
  browserPressDescription,
  browserReloadDescription,
  browserScreenshotDescription,
  browserSnapshotDescription,
  browserTabsDescription,
  batchReadDescription,
  createFileDescription,
  createPlanDescription,
  deleteFileDescription,
  diagnosticsDescription,
  diffDescription,
  editDescription,
  forgetMemoryDescription,
  generateImageDescription,
  generateVideoDescription,
  gitDescription,
  globDescription,
  grepDescription,
  loadDocumentDescription,
  loadSkillDescription,
  listDescription,
  manageTaskDescription,
  moveFileDescription,
  multieditDescription,
  readDescription,
  runSubagentDescription,
  runTaskDescription,
  saveMemoryDescription,
  searchMemoryDescription,
  shellCommandDescription,
  updatePlanDescription,
  webfetchDescription,
  websearchDescription,
} from "../tool-descriptions";
import {
  applyPatchInputSchema,
  applyPatchOutputSchema,
  executeApplyPatch,
} from "./apply-patch";
import {
  executeAskQuestion,
  askQuestionInputSchema,
  askQuestionOutputSchema,
} from "./ask-question";
import {
  batchReadInputSchema,
  batchReadOutputSchema,
  executeBatchRead,
} from "./batch-read";
import {
  browserClickInputSchema,
  browserConsoleLogsInputSchema,
  browserFillInputSchema,
  browserNavigateInputSchema,
  browserOpenInputSchema,
  browserPressInputSchema,
  browserScreenshotInputSchema,
  browserTabActionInputSchema,
  browserTabsInputSchema,
  browserToolModelOutput,
  browserToolOutputSchema,
  executeBrowserTool,
} from "./browser";
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
  diagnosticsInputSchema,
  diagnosticsOutputSchema,
  executeDiagnostics,
} from "./diagnostics";
import { diffInputSchema, diffOutputSchema, executeDiff } from "./diff";
import {
  executeForgetMemory,
  forgetMemoryInputSchema,
  forgetMemoryOutputSchema,
} from "./forget-memory";
import { executeGit, gitInputSchema, gitOutputSchema } from "./git";
import { executeGlob, globInputSchema, globOutputSchema } from "./glob";
import { executeGrep, grepInputSchema, grepOutputSchema } from "./grep";
import { executeList, listInputSchema, listOutputSchema } from "./list";
import {
  executeLoadDocument,
  loadDocumentInputSchema,
  loadDocumentOutputSchema,
  toLoadDocumentModelOutput,
} from "./load-document";
import {
  executeLoadSkill,
  loadSkillInputSchema,
  loadSkillOutputSchema,
} from "./load-skill";
import {
  executeManageTask,
  manageTaskInputSchema,
  manageTaskOutputSchema,
} from "./manage-task";
import {
  executeMoveFile,
  moveFileInputSchema,
  moveFileOutputSchema,
} from "./move-file";
import {
  executeMultiEdit,
  multieditInputSchema,
  multieditOutputSchema,
} from "./multiedit";
import { executeRead, readInputSchema, readOutputSchema } from "./read";
import {
  executeRunSubagent,
  runSubagentInputSchema,
  runSubagentOutputSchema,
  toRunSubagentModelOutput,
} from "./run-subagent";
import {
  runTaskInputSchema,
  runTaskOutputSchema,
  streamRunTask,
} from "./run-task";
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
  getBackgroundShellCommand,
  startBackgroundShellCommand,
  stopBackgroundShellCommand,
  streamShellCommand,
} from "./shell";
import {
  executeUpdatePlan,
  updatePlanInputSchema,
  updatePlanOutputSchema,
} from "./update-plan";
import {
  executeGenerateImage,
  generateImageInputSchema,
  generateImageOutputSchema,
  toGenerateImageModelOutput,
} from "./generate-image";
import {
  executeGenerateVideo,
  generateVideoInputSchema,
  generateVideoOutputSchema,
  toGenerateVideoModelOutput,
} from "./generate-video";
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

export {
  TOOL_CATALOG,
  getActiveCategories,
  getToolsInCategory,
} from "./catalog";
export type { ToolCategory, ToolCatalogEntry } from "./catalog";

// ---------------------------------------------------------------------------
// Shell command schemas (inline, not exported from shell.ts)
// ---------------------------------------------------------------------------

const shellCommandInputSchema = z
  .object({
    command: z
      .string()
      .min(1)
      .max(2_000)
      .optional()
      .describe(
        "One shell command to run in the linked workspace root or discovered skill directory. Required for run and start_background modes.",
      ),
    mode: z
      .enum(["run", "start_background", "check_background", "stop_background"])
      .optional()
      .describe(
        "How to use the shell. Use run for normal foreground commands, start_background for long-running commands, check_background to poll a background task, and stop_background to stop one.",
      ),
    runInBackground: z
      .boolean()
      .optional()
      .describe(
        "Convenience flag equivalent to mode=start_background when true.",
      ),
    backgroundTaskId: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Background task id returned by start_background. Required for check_background and stop_background.",
      ),
    waitForCompletion: z
      .boolean()
      .optional()
      .describe(
        "For check_background, wait until the background command completes instead of returning the current snapshot.",
      ),
    rationale: z
      .string()
      .min(1)
      .max(500)
      .describe("Why this command is needed and what you expect to learn."),
  })
  .superRefine((input, ctx) => {
    const mode =
      input.mode ??
      (input.backgroundTaskId
        ? "check_background"
        : input.runInBackground
          ? "start_background"
          : "run");

    if ((mode === "run" || mode === "start_background") && !input.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "command is required for run and start_background modes.",
        path: ["command"],
      });
    }

    if (
      (mode === "check_background" || mode === "stop_background") &&
      !input.backgroundTaskId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "backgroundTaskId is required for check_background and stop_background modes.",
        path: ["backgroundTaskId"],
      });
    }
  });

const shellCommandRunningOutputSchema = z.object({
  boundaryRoot: z.string().nullable(),
  cwd: z.string(),
  durationMs: z.number(),
  phase: z.literal("running"),
  tail: z.string(),
  truncated: z.boolean(),
});

const shellCommandCompletedOutputSchema = z.object({
  boundaryRoot: z.string().nullable(),
  cwd: z.string(),
  durationMs: z.number(),
  exitCode: z.number(),
  failureKind: z
    .enum(["missing_command", "missing_toolchain", "permission", "other"])
    .nullable(),
  missingCommand: z.string().nullable(),
  phase: z.literal("completed"),
  stderr: z.string(),
  stdout: z.string(),
  suggestedNextAction: z
    .enum(["install", "inspect", "none", "retry"])
    .nullable(),
  truncated: z.boolean(),
});

const shellCommandBackgroundOutputSchema = z.object({
  backgroundTaskId: z.string(),
  boundaryRoot: z.string().nullable(),
  command: z.string(),
  cwd: z.string(),
  durationMs: z.number(),
  error: z.string().nullable(),
  exitCode: z.number().nullable(),
  failureKind: z
    .enum(["missing_command", "missing_toolchain", "permission", "other"])
    .nullable(),
  missingCommand: z.string().nullable(),
  phase: z.literal("background"),
  status: z.enum(["completed", "failed", "running", "stopped"]),
  stderr: z.string(),
  stdout: z.string(),
  suggestedNextAction: z
    .enum(["install", "inspect", "none", "retry"])
    .nullable(),
  tail: z.string(),
  truncated: z.boolean(),
});

const shellCommandOutputSchema = z.discriminatedUnion("phase", [
  shellCommandRunningOutputSchema,
  shellCommandCompletedOutputSchema,
  shellCommandBackgroundOutputSchema,
]);

// ---------------------------------------------------------------------------
// Individual tool group builders
// ---------------------------------------------------------------------------

function buildInspectionTools(
  options: ThreadAgentCallOptions,
  {
    includeExtended = true,
  }: {
    includeExtended?: boolean;
  } = {},
) {
  const { defaultDirectory, permissionMode, skillRoots, toolApprovalPolicies } =
    options;
  const filesystemRoot = defaultDirectory ?? skillRoots[0];

  return {
    list: tool({
      description: listDescription,
      inputSchema: listInputSchema,
      needsApproval: () => toolApprovalPolicies.list,
      outputSchema: listOutputSchema,
      execute: async (input) =>
        executeList({
          defaultDirectory: filesystemRoot!,
          ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
          input,
          permissionMode,
        }),
    }),
    glob: tool({
      description: globDescription,
      inputSchema: globInputSchema,
      needsApproval: () => toolApprovalPolicies.glob,
      outputSchema: globOutputSchema,
      execute: async (input) =>
        executeGlob({
          defaultDirectory: filesystemRoot!,
          ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
          input,
          permissionMode,
        }),
    }),
    read: tool({
      description: readDescription,
      inputSchema: readInputSchema,
      needsApproval: () => toolApprovalPolicies.read,
      outputSchema: readOutputSchema,
      execute: async (input) =>
        executeRead({
          defaultDirectory: filesystemRoot!,
          ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
          input,
          permissionMode,
        }),
    }),
    load_document: tool({
      description: loadDocumentDescription,
      inputSchema: loadDocumentInputSchema,
      needsApproval: () => toolApprovalPolicies.load_document,
      outputSchema: loadDocumentOutputSchema,
      toModelOutput: ({ output }) => toLoadDocumentModelOutput(output),
      execute: async (input) =>
        executeLoadDocument({
          defaultDirectory: filesystemRoot!,
          ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
          input,
          permissionMode,
          sourceMessageId: options.sourceMessageId,
          threadId: options.threadId,
        }),
    }),
    grep: tool({
      description: grepDescription,
      inputSchema: grepInputSchema,
      needsApproval: () => toolApprovalPolicies.grep,
      outputSchema: grepOutputSchema,
      execute: async (input) =>
        executeGrep({
          defaultDirectory: filesystemRoot!,
          ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
          input,
          permissionMode,
        }),
    }),
    ...(includeExtended
      ? {
          diff: tool({
            description: diffDescription,
            inputSchema: diffInputSchema,
            needsApproval: () => toolApprovalPolicies.diff,
            outputSchema: diffOutputSchema,
            execute: async (input) =>
              executeDiff({
                defaultDirectory: filesystemRoot!,
                ...(skillRoots.length > 0
                  ? { extraAllowedRoots: skillRoots }
                  : {}),
                input,
                permissionMode,
              }),
          }),
          batch_read: tool({
            description: batchReadDescription,
            inputSchema: batchReadInputSchema,
            needsApproval: () => toolApprovalPolicies.batch_read,
            outputSchema: batchReadOutputSchema,
            execute: async (input) =>
              executeBatchRead({
                defaultDirectory: filesystemRoot!,
                ...(skillRoots.length > 0
                  ? { extraAllowedRoots: skillRoots }
                  : {}),
                input,
                permissionMode,
              }),
          }),
        }
      : {}),
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
        executeEdit({
          defaultDirectory: defaultDirectory!,
          input,
          permissionMode,
        }),
    }),
    multiedit: tool({
      description: multieditDescription,
      inputSchema: multieditInputSchema,
      needsApproval: () => toolApprovalPolicies.multiedit,
      outputSchema: multieditOutputSchema,
      execute: async (input) =>
        executeMultiEdit({
          defaultDirectory: defaultDirectory!,
          input,
          permissionMode,
        }),
    }),
    create_file: tool({
      description: createFileDescription,
      inputSchema: createFileInputSchema,
      needsApproval: () => toolApprovalPolicies.create_file,
      outputSchema: createFileOutputSchema,
      execute: async (input) =>
        executeCreateFile({
          defaultDirectory: defaultDirectory!,
          input,
          permissionMode,
        }),
    }),
    delete_file: tool({
      description: deleteFileDescription,
      inputSchema: deleteFileInputSchema,
      needsApproval: () => toolApprovalPolicies.delete_file,
      outputSchema: deleteFileOutputSchema,
      execute: async (input) =>
        executeDeleteFile({
          defaultDirectory: defaultDirectory!,
          input,
          permissionMode,
        }),
    }),
    move_file: tool({
      description: moveFileDescription,
      inputSchema: moveFileInputSchema,
      needsApproval: () => toolApprovalPolicies.move_file,
      outputSchema: moveFileOutputSchema,
      execute: async (input) =>
        executeMoveFile({
          defaultDirectory: defaultDirectory!,
          input,
          permissionMode,
        }),
    }),
    apply_patch: tool({
      description: applyPatchDescription,
      inputSchema: applyPatchInputSchema,
      needsApproval: () => toolApprovalPolicies.apply_patch,
      outputSchema: applyPatchOutputSchema,
      execute: async (input) =>
        executeApplyPatch({
          defaultDirectory: defaultDirectory!,
          input,
          permissionMode,
        }),
    }),
  };
}

function buildExecutionTools(options: ThreadAgentCallOptions) {
  const {
    defaultDirectory,
    permissionMode,
    preferredProjectRoot,
    shellStartDirectory,
    skillRoots,
    threadId,
    toolApprovalPolicies,
  } = options;
  const filesystemRoot = defaultDirectory ?? skillRoots[0];
  const preferredExecutionDirectory = preferredProjectRoot ?? defaultDirectory;
  const shellDirectory =
    shellStartDirectory ?? preferredExecutionDirectory ?? filesystemRoot;

  return {
    ...(defaultDirectory
      ? {
          diagnostics: tool({
            description: diagnosticsDescription,
            inputSchema: diagnosticsInputSchema,
            needsApproval: () => toolApprovalPolicies.diagnostics,
            outputSchema: diagnosticsOutputSchema,
            execute: async (input) =>
              executeDiagnostics({
                defaultDirectory: defaultDirectory!,
                input,
                permissionMode,
              }),
          }),
          git: tool({
            description: gitDescription,
            inputSchema: gitInputSchema,
            needsApproval: () => toolApprovalPolicies.git,
            outputSchema: gitOutputSchema,
            execute: async (input) =>
              executeGit({
                defaultDirectory: defaultDirectory!,
                input,
                permissionMode,
              }),
          }),
        }
      : {}),
    ...(defaultDirectory
      ? {
          run_task: tool({
            description: runTaskDescription,
            inputSchema: runTaskInputSchema,
            needsApproval: () => toolApprovalPolicies.run_task,
            outputSchema: runTaskOutputSchema,
            toModelOutput: ({ output }) => ({
              type: "json" as const,
              value:
                output.phase === "completed" ? output : { phase: "running" },
            }),
            execute: async function* (input, { abortSignal }) {
              const abortShell = () => {
                void disposeShellSession(threadId);
              };
              abortSignal?.addEventListener("abort", abortShell, {
                once: true,
              });
              try {
                for await (const event of streamRunTask({
                  allowedRoot:
                    permissionMode === "default"
                      ? defaultDirectory!
                      : undefined,
                  defaultDirectory: defaultDirectory!,
                  input,
                  ...(preferredExecutionDirectory
                    ? { projectDirectory: preferredExecutionDirectory }
                    : {}),
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
        }
      : {}),
    shell_command: tool({
      description: shellCommandDescription,
      inputSchema: shellCommandInputSchema,
      needsApproval: () => toolApprovalPolicies.shell_command,
      outputSchema: shellCommandOutputSchema,
      toModelOutput: ({ output }) => ({
        type: "json" as const,
        value:
          output.phase === "completed" || output.phase === "background"
            ? output
            : { phase: "running" },
      }),
      execute: async function* (input, { abortSignal }) {
        const mode =
          input.mode ??
          (input.backgroundTaskId
            ? "check_background"
            : input.runInBackground
              ? "start_background"
              : "run");
        const command = input.command ?? "";

        if (
          permissionMode === "default" &&
          (mode === "run" || mode === "start_background")
        ) {
          assertShellCommandAllowed(command, [
            ...(defaultDirectory ? [defaultDirectory] : []),
            ...skillRoots,
          ]);
        }

        if (mode === "check_background") {
          yield await getBackgroundShellCommand({
            backgroundTaskId: input.backgroundTaskId!,
            threadId,
            waitForCompletion: input.waitForCompletion,
          });
          return;
        }

        if (mode === "stop_background") {
          yield await stopBackgroundShellCommand({
            backgroundTaskId: input.backgroundTaskId!,
            threadId,
          });
          return;
        }

        if (mode === "start_background") {
          yield await startBackgroundShellCommand({
            allowedRoots:
              permissionMode === "default"
                ? [
                    ...(defaultDirectory ? [defaultDirectory] : []),
                    ...skillRoots,
                  ]
                : undefined,
            command,
            defaultDirectory: shellDirectory!,
            permissionMode,
            threadId,
          });
          return;
        }

        const abortShell = () => {
          void disposeShellSession(threadId);
        };
        abortSignal?.addEventListener("abort", abortShell, { once: true });
        try {
          for await (const event of streamShellCommand({
            allowedRoots:
              permissionMode === "default"
                ? [
                    ...(defaultDirectory ? [defaultDirectory] : []),
                    ...skillRoots,
                  ]
                : undefined,
            command,
            defaultDirectory: shellDirectory!,
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

function buildSkillTools(options: ThreadAgentCallOptions) {
  const { availableSkills, defaultDirectory, globalSkillsBasePath } = options;

  if (availableSkills.length === 0) {
    return {};
  }

  return {
    load_skill: tool({
      description: loadSkillDescription,
      inputSchema: loadSkillInputSchema,
      outputSchema: loadSkillOutputSchema,
      execute: async (input) =>
        executeLoadSkill({
          globalBase: globalSkillsBasePath ?? null,
          input,
          workspaceRoot: defaultDirectory ?? null,
        }),
    }),
  };
}

function buildMemoryTools(options: ThreadAgentCallOptions) {
  const {
    memoryRuntime,
    sourceMessageId,
    threadId,
    toolApprovalPolicies,
    userId,
    workspaceId,
  } = options;

  if (!memoryRuntime.available) {
    return {};
  }

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
          runtime: { memoryRuntime, userId, workspaceId },
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
            memoryRuntime,
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
  const {
    imageGenerationRuntime,
    searchProviders,
    searchSettings,
    sourceMessageId,
    threadId,
    toolApprovalPolicies,
    userId,
    videoGenerationRuntime,
    webFetchSettings,
  } = options;

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
    ...(Object.keys(imageGenerationRuntime.providers).length > 0
      ? {
          generate_image: tool({
            description: generateImageDescription,
            inputSchema: generateImageInputSchema,
            needsApproval: () => toolApprovalPolicies.generate_image,
            outputSchema: generateImageOutputSchema,
            toModelOutput: ({ output }) => ({
              type: "json" as const,
              value: toGenerateImageModelOutput(output),
            }),
            execute: async (input, { abortSignal }) =>
              executeGenerateImage({
                abortSignal,
                input,
                runtime: {
                  imageGeneration: imageGenerationRuntime,
                  sourceMessageId,
                  threadId,
                },
              }),
          }),
        }
      : {}),
    ...(Object.keys(videoGenerationRuntime.providers).length > 0
      ? {
          generate_video: tool({
            description: generateVideoDescription,
            inputSchema: generateVideoInputSchema,
            needsApproval: () => toolApprovalPolicies.generate_video,
            outputSchema: generateVideoOutputSchema,
            toModelOutput: ({ output }) => ({
              type: "json" as const,
              value: toGenerateVideoModelOutput(output),
            }),
            execute: async (input, { abortSignal }) =>
              executeGenerateVideo({
                abortSignal,
                input,
                runtime: {
                  sourceMessageId,
                  threadId,
                  userId,
                  videoGeneration: videoGenerationRuntime,
                },
              }),
          }),
        }
      : {}),
  };
}

function buildBrowserTools(options: ThreadAgentCallOptions) {
  const { threadId, toolApprovalPolicies, userId } = options;

  return {
    browser_tabs: tool({
      description: browserTabsDescription,
      inputSchema: browserTabsInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_tabs,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "tabs" },
          threadId,
          userId,
        }),
    }),
    browser_open: tool({
      description: browserOpenDescription,
      inputSchema: browserOpenInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_open,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "open" },
          threadId,
          userId,
        }),
    }),
    browser_navigate: tool({
      description: browserNavigateDescription,
      inputSchema: browserNavigateInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_navigate,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "navigate" },
          threadId,
          userId,
        }),
    }),
    browser_back: tool({
      description: browserBackDescription,
      inputSchema: browserTabActionInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_back,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "back" },
          threadId,
          userId,
        }),
    }),
    browser_forward: tool({
      description: browserForwardDescription,
      inputSchema: browserTabActionInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_forward,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "forward" },
          threadId,
          userId,
        }),
    }),
    browser_reload: tool({
      description: browserReloadDescription,
      inputSchema: browserTabActionInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_reload,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "reload" },
          threadId,
          userId,
        }),
    }),
    browser_snapshot: tool({
      description: browserSnapshotDescription,
      inputSchema: browserTabActionInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_snapshot,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "snapshot" },
          threadId,
          userId,
        }),
    }),
    browser_screenshot: tool({
      description: browserScreenshotDescription,
      inputSchema: browserScreenshotInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_screenshot,
      outputSchema: browserToolOutputSchema,
      toModelOutput: ({ output }) => browserToolModelOutput(output),
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "screenshot" },
          threadId,
          userId,
        }),
    }),
    browser_click: tool({
      description: browserClickDescription,
      inputSchema: browserClickInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_click,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "click" },
          threadId,
          userId,
        }),
    }),
    browser_fill: tool({
      description: browserFillDescription,
      inputSchema: browserFillInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_fill,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "fill" },
          threadId,
          userId,
        }),
    }),
    browser_press: tool({
      description: browserPressDescription,
      inputSchema: browserPressInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_press,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "press" },
          threadId,
          userId,
        }),
    }),
    browser_console_logs: tool({
      description: browserConsoleLogsDescription,
      inputSchema: browserConsoleLogsInputSchema,
      needsApproval: () => toolApprovalPolicies.browser_console_logs,
      outputSchema: browserToolOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeBrowserTool({
          abortSignal,
          command: { ...input, type: "console_logs" },
          threadId,
          userId,
        }),
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
    ...buildTaskTools(options),
    ask_question: tool({
      description: askQuestionDescription,
      inputSchema: askQuestionInputSchema,
      outputSchema: askQuestionOutputSchema,
      execute: async (input) =>
        executeAskQuestion({ input, runtime: { threadId } }),
    }),
  };
}

function buildTaskTools(options: ThreadAgentCallOptions) {
  const { threadId } = options;

  return {
    manage_task: tool({
      description: manageTaskDescription,
      inputSchema: manageTaskInputSchema,
      outputSchema: manageTaskOutputSchema,
      execute: async (input) =>
        executeManageTask({ input, runtime: { threadId } }),
    }),
  };
}

function buildDelegationTools(options: ThreadAgentCallOptions) {
  return {
    run_subagent: tool({
      description: runSubagentDescription,
      inputSchema: runSubagentInputSchema,
      outputSchema: runSubagentOutputSchema,
      toModelOutput: ({ output }) => toRunSubagentModelOutput(output),
      execute: async (input, { abortSignal, toolCallId }) =>
        executeRunSubagent({
          abortSignal,
          input: {
            ...input,
            delegationId: toolCallId,
          },
          runtime: options,
        }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Public API: single entry point for all tool assembly
// ---------------------------------------------------------------------------

export function buildTools(options: ThreadAgentCallOptions) {
  const hasFilesystemTools =
    Boolean(options.defaultDirectory) || options.skillRoots.length > 0;

  if (options.threadMode === "plan") {
    return {
      ...buildSkillTools(options),
      ...(hasFilesystemTools
        ? buildInspectionTools(options, { includeExtended: false })
        : {}),
      ...buildPlanTools(options),
    };
  }

  return {
    ...buildMemoryTools(options),
    ...(options.mcpTools ?? {}),
    ...(options.integrationTools ?? {}),
    ...buildSkillTools(options),
    ...buildTaskTools(options),
    ...buildDelegationTools(options),
    ...buildBrowserTools(options),
    ...buildWebTools(options),
    ...(hasFilesystemTools
      ? {
          ...buildInspectionTools(options),
          ...buildExecutionTools(options),
          ...(options.toolsEnabled ? buildMutationTools(options) : {}),
        }
      : {}),
  };
}
