import {
  stepCountIs,
  tool,
  ToolLoopAgent,
  type Experimental_DownloadFunction,
} from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { PermissionMode } from "@/lib/security";
import type { SearchProviderRuntimeMap } from "@/lib/search/providers/runtime";
import type { SearchSettings } from "@/lib/search";
import type { MemorySettings } from "@/lib/memory";
import { z } from "zod";

import type { ToolApprovalPolicyMap } from "./tool-approval-policy";
import {
  assertShellCommandAllowed,
  disposeShellSession,
  streamShellCommand,
} from "./tools/shell";
import {
  executeCreateFile,
  createFileInputSchema,
  createFileOutputSchema,
} from "./tools/create-file";
import {
  executeDeleteFile,
  deleteFileInputSchema,
  deleteFileOutputSchema,
} from "./tools/delete-file";
import { executeEdit, editInputSchema, editOutputSchema } from "./tools/edit";
import { executeGrep, grepInputSchema, grepOutputSchema } from "./tools/grep";
import { executeGlob, globInputSchema, globOutputSchema } from "./tools/glob";
import { executeList, listInputSchema, listOutputSchema } from "./tools/list";
import {
  executeMultiEdit,
  multieditInputSchema,
  multieditOutputSchema,
} from "./tools/multiedit";
import {
  executeForgetMemory,
  forgetMemoryInputSchema,
  forgetMemoryOutputSchema,
} from "./tools/forget-memory";
import { executeRead, readInputSchema, readOutputSchema } from "./tools/read";
import {
  runTaskInputSchema,
  runTaskOutputSchema,
  streamRunTask,
} from "./tools/run-task";
import {
  executeSaveMemory,
  saveMemoryInputSchema,
  saveMemoryOutputSchema,
} from "./tools/save-memory";
import {
  executeSearchMemory,
  searchMemoryInputSchema,
  searchMemoryOutputSchema,
} from "./tools/search-memory";
import {
  executeWebSearch,
  webSearchInputSchema,
  webSearchOutputSchema,
} from "./tools/websearch";
import {
  executeWebFetch,
  webFetchInputSchema,
  webFetchOutputSchema,
} from "./tools/webfetch";
import type { WebFetchSettings } from "@/lib/webfetch";

const shellCommandSchema = z.object({
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

function buildThreadAgentInstructions({
  defaultDirectory,
  memorySettings,
  permissionMode,
  searchProviders,
  searchSettings,
  sourceMessageId,
  systemPrompt,
  toolApprovalPolicies,
  webFetchSettings,
}: {
  defaultDirectory?: string;
  memorySettings: MemorySettings;
  permissionMode: PermissionMode;
  searchProviders: SearchProviderRuntimeMap;
  searchSettings: SearchSettings;
  sourceMessageId?: string | null;
  systemPrompt: string;
  toolApprovalPolicies: ToolApprovalPolicyMap;
  webFetchSettings: WebFetchSettings;
}) {
  const approvalMode = (toolName: keyof ToolApprovalPolicyMap) =>
    toolApprovalPolicies[toolName] ? "after approval" : "without approval";
  const configuredSearchProviders = Object.values(searchProviders).filter(
    (provider) => provider?.isEnabled,
  );
  const webFetchBatchGuidance = webFetchSettings.batchEnabled
    ? `Batch webfetch is enabled. You may use the urls field for up to ${webFetchSettings.batchLimit} URLs in one call when comparing or summarizing multiple pages.`
    : "Batch webfetch is disabled. Use one URL per webfetch call.";
  const webSearchGuidance = configuredSearchProviders.length
    ? `Web search is available through ${configuredSearchProviders
        .map((provider) => provider.provider)
        .join(", ")}. Default provider: ${searchSettings.defaultProvider}.`
    : "Web search is configured with no active providers yet. Configure Exa in Settings > Search before using websearch.";
  const toolGuidance = defaultDirectory
    ? [
        `You can use the list tool to inspect the linked project tree ${approvalMode("list")}.`,
        `You can use the glob tool to find files by pattern ${approvalMode("glob")}.`,
        `You can use the read tool to inspect file contents ${approvalMode("read")}.`,
        `You can use the grep tool to search file contents inside the linked project ${approvalMode("grep")}.`,
        `You can use search_memory to recall durable user or workspace context ${approvalMode("search_memory")}.`,
        `You can use save_memory to store durable facts that should help future conversations ${approvalMode("save_memory")}.`,
        `You can use forget_memory to remove outdated or incorrect memory ${approvalMode("forget_memory")}.`,
        `You can use the websearch tool to discover candidate web sources ${approvalMode("websearch")}.`,
        `You can use the webfetch tool to read documentation, API references, changelogs, and user-shared URLs ${approvalMode("webfetch")}.`,
        webSearchGuidance,
        webFetchBatchGuidance,
        `You can use the edit tool for file changes ${approvalMode("edit")}.`,
        `You can use the multiedit tool for several exact-text changes in the same file ${approvalMode("multiedit")}.`,
        `You can use the create_file tool for new files ${approvalMode("create_file")}.`,
        `You can use the delete_file tool for file removal ${approvalMode("delete_file")}.`,
        `You can use run_task for standard project scripts like test, lint, build, and typecheck ${approvalMode("run_task")}.`,
        `You can use the shell tool to inspect and work inside the selected workspace ${approvalMode("shell_command")}.`,
        `Default directory: ${defaultDirectory}`,
        `Permission mode: ${permissionMode}.`,
        "Rules for project inspection:",
        "- Prefer list when you need to discover folders or get a quick project tree.",
        "- Prefer glob when you know the filename pattern you need.",
        "- Prefer read when you need file contents or a bounded slice of a file.",
        "- Prefer grep when you need to search code or text content by pattern.",
        "- Prefer search_memory before asking the user to repeat stable preferences, habits, or project constraints.",
        "- Use save_memory only for durable facts, preferences, workflows, and recurring project context.",
        "- Never save secrets, API keys, access tokens, passwords, or one-off task state to memory.",
        "- Use forget_memory when the user explicitly says a previously stored fact is outdated or wrong.",
        "- Prefer websearch when you need to discover sources, articles, docs, or references for a topic.",
        "- Prefer webfetch when the answer depends on web documentation or a URL shared in the conversation.",
        "- Prefer webfetch after websearch when you need to open one specific result in full.",
        "- When using the searxng provider, use searchType auto and leave livecrawl unset.",
        "- Prefer format=markdown for web pages unless the user explicitly needs plain text or raw HTML.",
        "- Use batch webfetch only when comparing or gathering multiple URLs is clearly useful.",
        "- Prefer multiedit instead of repeated edit calls when you need several exact replacements in one file.",
        "- Prefer edit, create_file, and delete_file for direct file changes instead of shell commands.",
        "- Prefer run_task for standard package scripts instead of raw shell commands.",
        "- In default permissions mode, list and grep must stay inside the selected workspace root.",
        "- In default permissions mode, read, glob, edit, create_file, delete_file, and run_task must stay inside the selected workspace root.",
        "- In full permissions mode, file and task tools may use absolute paths outside the selected workspace.",
        "Rules for shell usage:",
        "- Propose only one command at a time.",
        "- Explain the command briefly in the rationale field.",
        "- Avoid full-screen or interactive TUI programs.",
        "- Prefer non-interactive flags for scaffolding, installs, and builds.",
        "- When a task can run for several minutes, state that clearly before asking for approval.",
        "- Prefer read-only inspection before mutations or installs.",
        "- When a tool requests approval, wait for the user approval workflow to continue.",
        memorySettings.enabled
          ? `Long-term memory is enabled with ${memorySettings.memoryProvider}:${memorySettings.memoryModel}.${sourceMessageId ? ` Current source message id: ${sourceMessageId}.` : ""}`
          : "Long-term memory is disabled. Do not use memory tools until the user enables Memory in Settings.",
      ].join("\n")
    : [
        "Workspace tools are currently unavailable because there is no selected workspace root.",
        `You can still use search_memory to recall prior context ${approvalMode("search_memory")}.`,
        `You can still use save_memory to store durable context ${approvalMode("save_memory")}.`,
        `You can still use forget_memory to remove outdated memory ${approvalMode("forget_memory")}.`,
        `You can still use the websearch tool to discover sources ${approvalMode("websearch")}.`,
        `You can still use the webfetch tool to read documentation, API references, changelogs, and user-shared URLs ${approvalMode("webfetch")}.`,
        webSearchGuidance,
        webFetchBatchGuidance,
        "Do not mention or attempt list, grep, read, edit, create_file, delete_file, run_task, or shell commands unless the user asks conceptually.",
      ].join("\n");

  return [systemPrompt.trim(), toolGuidance].filter(Boolean).join("\n\n");
}

export function createThreadAgent({
  attachmentDownload,
  defaultDirectory,
  languageModel,
  memorySettings,
  permissionMode,
  providerOptions,
  searchProviders,
  searchSettings,
  sourceMessageId,
  systemPrompt,
  threadId,
  userId,
  toolApprovalPolicies,
  toolsEnabled,
  webFetchSettings,
  workspaceId,
}: {
  attachmentDownload?: Experimental_DownloadFunction;
  defaultDirectory?: string;
  languageModel: unknown;
  memorySettings: MemorySettings;
  permissionMode: PermissionMode;
  providerOptions?: SharedV3ProviderOptions;
  searchProviders: SearchProviderRuntimeMap;
  searchSettings: SearchSettings;
  sourceMessageId?: string | null;
  systemPrompt: string;
  threadId: string;
  userId: string;
  toolApprovalPolicies: ToolApprovalPolicyMap;
  toolsEnabled: boolean;
  webFetchSettings: WebFetchSettings;
  workspaceId?: string | null;
}) {
  const approvalSentence = (toolName: keyof ToolApprovalPolicyMap) =>
    toolApprovalPolicies[toolName]
      ? "Requires approval."
      : "Runs without approval.";
  const tools = {
    search_memory: tool({
      description: `Search Sentinel's long-term memory for durable user or workspace context. ${approvalSentence("search_memory")}`,
      inputSchema: searchMemoryInputSchema,
      needsApproval: () => toolApprovalPolicies.search_memory,
      outputSchema: searchMemoryOutputSchema,
      execute: async (input, { abortSignal }) =>
        executeSearchMemory({
          abortSignal,
          input,
          runtime: {
            settings: memorySettings,
            userId,
            workspaceId,
          },
        }),
    }),
    save_memory: tool({
      description: `Save durable user or workspace context for future chats. ${approvalSentence("save_memory")}`,
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
      description: `Delete a stored memory that is outdated or incorrect. ${approvalSentence("forget_memory")}`,
      inputSchema: forgetMemoryInputSchema,
      needsApproval: () => toolApprovalPolicies.forget_memory,
      outputSchema: forgetMemoryOutputSchema,
      execute: async (input) =>
        executeForgetMemory({
          input,
          runtime: {
            userId,
          },
        }),
    }),
    websearch: tool({
      description: `Search the web for source discovery and summarized results. ${approvalSentence("websearch")}`,
      inputSchema: webSearchInputSchema,
      needsApproval: () => toolApprovalPolicies.websearch,
      outputSchema: webSearchOutputSchema,
      toModelOutput: ({ output }) => ({
        type: "json",
        value: {
          digest: output.digest,
          livecrawl: output.livecrawl,
          provider: output.provider,
          query: output.query,
          resolvedSearchType: output.resolvedSearchType,
          resultCount: output.resultCount,
          results: output.results.map((result) => ({
            author: result.author,
            publishedDate: result.publishedDate,
            summary: result.summary,
            title: result.title,
            url: result.url,
          })),
          searchType: output.searchType,
        },
      }),
      execute: async (input, { abortSignal }) =>
        executeWebSearch({
          abortSignal,
          input,
          runtime: {
            providers: searchProviders,
            settings: searchSettings,
          },
        }),
    }),
    webfetch: tool({
      description: `Fetch a web page or image, then return its contents as markdown, text, or HTML. ${approvalSentence("webfetch")}`,
      inputSchema: webFetchInputSchema,
      needsApproval: () => toolApprovalPolicies.webfetch,
      outputSchema: webFetchOutputSchema,
      toModelOutput: ({ output }) => ({
        type: "json",
        value: {
          ...output,
          results: output.results.map((result) =>
            result.status === "success" && result.isImage
              ? {
                  ...result,
                  imageDataUrl:
                    "[omitted from model output; image preview available in the UI]",
                }
              : result,
          ),
        },
      }),
      execute: async (input, { abortSignal }) =>
        executeWebFetch({
          abortSignal,
          input,
          settings: webFetchSettings,
        }),
    }),
    ...(toolsEnabled
      ? {
          list: tool({
            description: `List files and directories using a concise tree view. ${approvalSentence("list")}`,
            inputSchema: listInputSchema,
            needsApproval: () => toolApprovalPolicies.list,
            outputSchema: listOutputSchema,
            execute: async (input) =>
              executeList({
                defaultDirectory: defaultDirectory!,
                input,
                permissionMode,
              }),
          }),
          glob: tool({
            description: `Find files by glob pattern inside a directory. ${approvalSentence("glob")}`,
            inputSchema: globInputSchema,
            needsApproval: () => toolApprovalPolicies.glob,
            outputSchema: globOutputSchema,
            execute: async (input) =>
              executeGlob({
                defaultDirectory: defaultDirectory!,
                input,
                permissionMode,
              }),
          }),
          read: tool({
            description: `Read file contents or a bounded slice of a directory listing. ${approvalSentence("read")}`,
            inputSchema: readInputSchema,
            needsApproval: () => toolApprovalPolicies.read,
            outputSchema: readOutputSchema,
            execute: async (input) =>
              executeRead({
                defaultDirectory: defaultDirectory!,
                input,
                permissionMode,
              }),
          }),
          grep: tool({
            description: `Search file contents using ripgrep with regular expressions. ${approvalSentence("grep")}`,
            inputSchema: grepInputSchema,
            needsApproval: () => toolApprovalPolicies.grep,
            outputSchema: grepOutputSchema,
            execute: async (input) =>
              executeGrep({
                defaultDirectory: defaultDirectory!,
                input,
                permissionMode,
              }),
          }),
          edit: tool({
            description: `Replace exact text inside an existing file. ${approvalSentence("edit")}`,
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
            description: `Apply multiple exact-text edits to the same file in one step. ${approvalSentence("multiedit")}`,
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
            description: `Create a new file with full contents. ${approvalSentence("create_file")}`,
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
            description: `Delete an existing file. ${approvalSentence("delete_file")}`,
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
          run_task: tool({
            description: `Run a standard project script such as test, lint, build, format, or typecheck. ${approvalSentence("run_task")}`,
            inputSchema: runTaskInputSchema,
            needsApproval: () => toolApprovalPolicies.run_task,
            outputSchema: runTaskOutputSchema,
            toModelOutput: ({ output }) => ({
              type: "json",
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
                  permissionMode,
                  threadId,
                })) {
                  if (event.type === "error") {
                    throw event.error;
                  }

                  if (event.output) {
                    yield event.output;
                  }
                }
              } finally {
                abortSignal?.removeEventListener("abort", abortShell);
              }
            },
          }),
          shell_command: tool({
            description: `Run a single shell command in the workspace. ${approvalSentence("shell_command")}`,
            inputSchema: shellCommandSchema,
            needsApproval: () => toolApprovalPolicies.shell_command,
            outputSchema: shellCommandOutputSchema,
            toModelOutput: ({ output }) => ({
              type: "json",
              value:
                output.phase === "completed" ? output : { phase: "running" },
            }),
            execute: async function* ({ command }, { abortSignal }) {
              if (permissionMode === "default") {
                assertShellCommandAllowed(command);
              }

              const abortShell = () => {
                void disposeShellSession(threadId);
              };

              abortSignal?.addEventListener("abort", abortShell, {
                once: true,
              });

              try {
                for await (const event of streamShellCommand({
                  allowedRoot:
                    permissionMode === "default"
                      ? defaultDirectory!
                      : undefined,
                  command,
                  defaultDirectory: defaultDirectory!,
                  permissionMode,
                  threadId,
                })) {
                  if (event.type === "error") {
                    throw event.error;
                  }

                  yield event.output;
                }
              } finally {
                abortSignal?.removeEventListener("abort", abortShell);
              }
            },
          }),
        }
      : {}),
  };

  return new ToolLoopAgent({
    ...(attachmentDownload
      ? { experimental_download: attachmentDownload }
      : {}),
    instructions: buildThreadAgentInstructions({
      defaultDirectory,
      memorySettings,
      permissionMode,
      searchProviders,
      searchSettings,
      sourceMessageId,
      systemPrompt,
      toolApprovalPolicies,
      webFetchSettings,
    }),
    model: languageModel as ConstructorParameters<
      typeof ToolLoopAgent
    >[0]["model"],
    ...(providerOptions ? { providerOptions } : {}),
    stopWhen: stepCountIs(12),
    tools,
  });
}
