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
  computerActionDescription,
  computerAppDescription,
  computerAppsDescription,
  computerAxActionDescription,
  computerAxFindDescription,
  computerAxTreeDescription,
  computerClipboardDescription,
  computerScreenshotDescription,
  computerStatusDescription,
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
} from "./selection/descriptions";
import {
  applyPatchInputSchema,
  applyPatchOutputSchema,
  executeApplyPatch,
} from "./apply-patch";
import { withToolApproval } from "./approval";
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
  computerActionInputSchema,
  computerAppInputSchema,
  computerAppsInputSchema,
  computerAxActionInputSchema,
  computerAxFindInputSchema,
  computerAxTreeInputSchema,
  computerClipboardInputSchema,
  computerScreenshotInputSchema,
  computerStatusInputSchema,
  computerToolModelOutput,
  computerToolOutputSchema,
  executeComputerTool,
} from "./computer";
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
    list: withToolApproval(
      tool({
        description: listDescription,
        inputSchema: listInputSchema,
        outputSchema: listOutputSchema,
        execute: async (input) =>
          executeList({
            defaultDirectory: filesystemRoot!,
            ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.list,
    ),
    glob: withToolApproval(
      tool({
        description: globDescription,
        inputSchema: globInputSchema,
        outputSchema: globOutputSchema,
        execute: async (input) =>
          executeGlob({
            defaultDirectory: filesystemRoot!,
            ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.glob,
    ),
    read: withToolApproval(
      tool({
        description: readDescription,
        inputSchema: readInputSchema,
        outputSchema: readOutputSchema,
        execute: async (input) =>
          executeRead({
            defaultDirectory: filesystemRoot!,
            ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.read,
    ),
    load_document: withToolApproval(
      tool({
        description: loadDocumentDescription,
        inputSchema: loadDocumentInputSchema,
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
      () => toolApprovalPolicies.load_document,
    ),
    grep: withToolApproval(
      tool({
        description: grepDescription,
        inputSchema: grepInputSchema,
        outputSchema: grepOutputSchema,
        execute: async (input) =>
          executeGrep({
            defaultDirectory: filesystemRoot!,
            ...(skillRoots.length > 0 ? { extraAllowedRoots: skillRoots } : {}),
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.grep,
    ),
    ...(includeExtended
      ? {
          diff: withToolApproval(
            tool({
              description: diffDescription,
              inputSchema: diffInputSchema,
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
            () => toolApprovalPolicies.diff,
          ),
          batch_read: withToolApproval(
            tool({
              description: batchReadDescription,
              inputSchema: batchReadInputSchema,
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
            () => toolApprovalPolicies.batch_read,
          ),
        }
      : {}),
  };
}

function buildMutationTools(options: ThreadAgentCallOptions) {
  const { defaultDirectory, permissionMode, toolApprovalPolicies } = options;

  return {
    edit: withToolApproval(
      tool({
        description: editDescription,
        inputSchema: editInputSchema,
        outputSchema: editOutputSchema,
        execute: async (input) =>
          executeEdit({
            defaultDirectory: defaultDirectory!,
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.edit,
    ),
    multiedit: withToolApproval(
      tool({
        description: multieditDescription,
        inputSchema: multieditInputSchema,
        outputSchema: multieditOutputSchema,
        execute: async (input) =>
          executeMultiEdit({
            defaultDirectory: defaultDirectory!,
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.multiedit,
    ),
    create_file: withToolApproval(
      tool({
        description: createFileDescription,
        inputSchema: createFileInputSchema,
        outputSchema: createFileOutputSchema,
        execute: async (input) =>
          executeCreateFile({
            defaultDirectory: defaultDirectory!,
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.create_file,
    ),
    delete_file: withToolApproval(
      tool({
        description: deleteFileDescription,
        inputSchema: deleteFileInputSchema,
        outputSchema: deleteFileOutputSchema,
        execute: async (input) =>
          executeDeleteFile({
            defaultDirectory: defaultDirectory!,
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.delete_file,
    ),
    move_file: withToolApproval(
      tool({
        description: moveFileDescription,
        inputSchema: moveFileInputSchema,
        outputSchema: moveFileOutputSchema,
        execute: async (input) =>
          executeMoveFile({
            defaultDirectory: defaultDirectory!,
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.move_file,
    ),
    apply_patch: withToolApproval(
      tool({
        description: applyPatchDescription,
        inputSchema: applyPatchInputSchema,
        outputSchema: applyPatchOutputSchema,
        execute: async (input) =>
          executeApplyPatch({
            defaultDirectory: defaultDirectory!,
            input,
            permissionMode,
          }),
      }),
      () => toolApprovalPolicies.apply_patch,
    ),
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
          diagnostics: withToolApproval(
            tool({
              description: diagnosticsDescription,
              inputSchema: diagnosticsInputSchema,
              outputSchema: diagnosticsOutputSchema,
              execute: async (input) =>
                executeDiagnostics({
                  defaultDirectory: defaultDirectory!,
                  input,
                  permissionMode,
                }),
            }),
            () => toolApprovalPolicies.diagnostics,
          ),
          git: withToolApproval(
            tool({
              description: gitDescription,
              inputSchema: gitInputSchema,
              outputSchema: gitOutputSchema,
              execute: async (input) =>
                executeGit({
                  defaultDirectory: defaultDirectory!,
                  input,
                  permissionMode,
                }),
            }),
            () => toolApprovalPolicies.git,
          ),
        }
      : {}),
    ...(defaultDirectory
      ? {
          run_task: withToolApproval(
            tool({
              description: runTaskDescription,
              inputSchema: runTaskInputSchema,
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
            () => toolApprovalPolicies.run_task,
          ),
        }
      : {}),
    shell_command: withToolApproval(
      tool({
        description: shellCommandDescription,
        inputSchema: shellCommandInputSchema,
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
      () => toolApprovalPolicies.shell_command,
    ),
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
    search_memory: withToolApproval(
      tool({
        description: searchMemoryDescription,
        inputSchema: searchMemoryInputSchema,
        outputSchema: searchMemoryOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeSearchMemory({
            abortSignal,
            input,
            runtime: { memoryRuntime, userId, workspaceId },
          }),
      }),
      () => toolApprovalPolicies.search_memory,
    ),
    save_memory: withToolApproval(
      tool({
        description: saveMemoryDescription,
        inputSchema: saveMemoryInputSchema,
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
      () => toolApprovalPolicies.save_memory,
    ),
    forget_memory: withToolApproval(
      tool({
        description: forgetMemoryDescription,
        inputSchema: forgetMemoryInputSchema,
        outputSchema: forgetMemoryOutputSchema,
        execute: async (input) =>
          executeForgetMemory({ input, runtime: { userId } }),
      }),
      () => toolApprovalPolicies.forget_memory,
    ),
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
    websearch: withToolApproval(
      tool({
        description: websearchDescription,
        inputSchema: webSearchInputSchema,
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
      () => toolApprovalPolicies.websearch,
    ),
    webfetch: withToolApproval(
      tool({
        description: webfetchDescription,
        inputSchema: webFetchInputSchema,
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
      () => toolApprovalPolicies.webfetch,
    ),
    ...(Object.keys(imageGenerationRuntime.providers).length > 0
      ? {
          generate_image: withToolApproval(
            tool({
              description: generateImageDescription,
              inputSchema: generateImageInputSchema,
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
            () => toolApprovalPolicies.generate_image,
          ),
        }
      : {}),
    ...(Object.keys(videoGenerationRuntime.providers).length > 0
      ? {
          generate_video: withToolApproval(
            tool({
              description: generateVideoDescription,
              inputSchema: generateVideoInputSchema,
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
            () => toolApprovalPolicies.generate_video,
          ),
        }
      : {}),
  };
}

function buildBrowserTools(options: ThreadAgentCallOptions) {
  const { threadId, toolApprovalPolicies, userId } = options;

  return {
    browser_tabs: withToolApproval(
      tool({
        description: browserTabsDescription,
        inputSchema: browserTabsInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "tabs" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_tabs,
    ),
    browser_open: withToolApproval(
      tool({
        description: browserOpenDescription,
        inputSchema: browserOpenInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "open" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_open,
    ),
    browser_navigate: withToolApproval(
      tool({
        description: browserNavigateDescription,
        inputSchema: browserNavigateInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "navigate" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_navigate,
    ),
    browser_back: withToolApproval(
      tool({
        description: browserBackDescription,
        inputSchema: browserTabActionInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "back" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_back,
    ),
    browser_forward: withToolApproval(
      tool({
        description: browserForwardDescription,
        inputSchema: browserTabActionInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "forward" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_forward,
    ),
    browser_reload: withToolApproval(
      tool({
        description: browserReloadDescription,
        inputSchema: browserTabActionInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "reload" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_reload,
    ),
    browser_snapshot: withToolApproval(
      tool({
        description: browserSnapshotDescription,
        inputSchema: browserTabActionInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "snapshot" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_snapshot,
    ),
    browser_screenshot: withToolApproval(
      tool({
        description: browserScreenshotDescription,
        inputSchema: browserScreenshotInputSchema,
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
      () => toolApprovalPolicies.browser_screenshot,
    ),
    browser_click: withToolApproval(
      tool({
        description: browserClickDescription,
        inputSchema: browserClickInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "click" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_click,
    ),
    browser_fill: withToolApproval(
      tool({
        description: browserFillDescription,
        inputSchema: browserFillInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "fill" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_fill,
    ),
    browser_press: withToolApproval(
      tool({
        description: browserPressDescription,
        inputSchema: browserPressInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "press" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_press,
    ),
    browser_console_logs: withToolApproval(
      tool({
        description: browserConsoleLogsDescription,
        inputSchema: browserConsoleLogsInputSchema,
        outputSchema: browserToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeBrowserTool({
            abortSignal,
            command: { ...input, type: "console_logs" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.browser_console_logs,
    ),
  };
}

function buildComputerTools(options: ThreadAgentCallOptions) {
  const { threadId, toolApprovalPolicies, userId } = options;

  return {
    computer_status: withToolApproval(
      tool({
        description: computerStatusDescription,
        inputSchema: computerStatusInputSchema,
        outputSchema: computerToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "status" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_status,
    ),
    computer_screenshot: withToolApproval(
      tool({
        description: computerScreenshotDescription,
        inputSchema: computerScreenshotInputSchema,
        outputSchema: computerToolOutputSchema,
        toModelOutput: ({ output }) => computerToolModelOutput(output),
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "screenshot" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_screenshot,
    ),
    computer_action: withToolApproval(
      tool({
        description: computerActionDescription,
        inputSchema: computerActionInputSchema,
        outputSchema: computerToolOutputSchema,
        toModelOutput: ({ output }) => computerToolModelOutput(output),
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "action" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_action,
    ),
    computer_apps: withToolApproval(
      tool({
        description: computerAppsDescription,
        inputSchema: computerAppsInputSchema,
        outputSchema: computerToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "apps" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_apps,
    ),
    computer_app: withToolApproval(
      tool({
        description: computerAppDescription,
        inputSchema: computerAppInputSchema,
        outputSchema: computerToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "app" },
            threadId,
            userId,
          }),
      }),
      (input) =>
        input.mode === "focus" ? false : toolApprovalPolicies.computer_app,
    ),
    computer_clipboard: withToolApproval(
      tool({
        description: computerClipboardDescription,
        inputSchema: computerClipboardInputSchema,
        outputSchema: computerToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "clipboard" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_clipboard,
    ),
    computer_ax_tree: withToolApproval(
      tool({
        description: computerAxTreeDescription,
        inputSchema: computerAxTreeInputSchema,
        outputSchema: computerToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "ax_tree" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_ax_tree,
    ),
    computer_ax_find: withToolApproval(
      tool({
        description: computerAxFindDescription,
        inputSchema: computerAxFindInputSchema,
        outputSchema: computerToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "ax_find" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_ax_find,
    ),
    computer_ax_action: withToolApproval(
      tool({
        description: computerAxActionDescription,
        inputSchema: computerAxActionInputSchema,
        outputSchema: computerToolOutputSchema,
        execute: async (input, { abortSignal }) =>
          executeComputerTool({
            abortSignal,
            command: { ...input, type: "ax_action" },
            threadId,
            userId,
          }),
      }),
      () => toolApprovalPolicies.computer_ax_action,
    ),
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
    ...buildComputerTools(options),
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
