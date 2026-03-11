import {
  stepCountIs,
  tool,
  ToolLoopAgent,
  type Experimental_DownloadFunction,
} from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { PermissionMode } from "@/lib/security";
import { z } from "zod";

import {
  assertShellCommandAllowed,
  disposeShellSession,
  streamShellCommand,
} from "./shell-session";
import {
  executeCreateFile,
  createFileInputSchema,
  createFileOutputSchema,
} from "./create-file";
import {
  executeDeleteFile,
  deleteFileInputSchema,
  deleteFileOutputSchema,
} from "./delete-file";
import {
  executeEdit,
  editInputSchema,
  editOutputSchema,
} from "./edit";
import {
  executeGrep,
  grepInputSchema,
  grepOutputSchema,
} from "./grep";
import {
  executeGlob,
  globInputSchema,
  globOutputSchema,
} from "./glob";
import { executeList, listInputSchema, listOutputSchema } from "./list";
import {
  executeRead,
  readInputSchema,
  readOutputSchema,
} from "./read";
import {
  runTaskInputSchema,
  runTaskOutputSchema,
  streamRunTask,
} from "./run-task";

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
  permissionMode,
  systemPrompt,
}: {
  defaultDirectory?: string;
  permissionMode: PermissionMode;
  systemPrompt: string;
}) {
  const toolGuidance = defaultDirectory
    ? [
        "You can use the list tool to inspect the linked project tree without approval.",
        "You can use the glob tool to find files by pattern without approval.",
        "You can use the read tool to inspect file contents without approval.",
        "You can use the grep tool to search file contents inside the linked project without approval.",
        "You can use edit, create_file, and delete_file for file changes that require approval.",
        "You can use run_task for standard project scripts like test, lint, build, and typecheck after approval.",
        "You can use the shell tool to inspect and work inside the selected workspace.",
        `Default directory: ${defaultDirectory}`,
        `Permission mode: ${permissionMode}.`,
        "Rules for project inspection:",
        "- Prefer list when you need to discover folders or get a quick project tree.",
        "- Prefer glob when you know the filename pattern you need.",
        "- Prefer read when you need file contents or a bounded slice of a file.",
        "- Prefer grep when you need to search code or text content by pattern.",
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
        "- Never assume approval; wait for the user approval workflow to continue.",
      ].join("\n")
    : [
        "Tool execution is currently unavailable because there is no selected workspace root.",
        "Do not mention or attempt list, grep, or shell commands unless the user asks conceptually.",
      ].join("\n");

  return [systemPrompt.trim(), toolGuidance].filter(Boolean).join("\n\n");
}

export function createThreadAgent({
  attachmentDownload,
  defaultDirectory,
  languageModel,
  permissionMode,
  providerOptions,
  systemPrompt,
  threadId,
  toolsEnabled,
}: {
  attachmentDownload?: Experimental_DownloadFunction;
  defaultDirectory?: string;
  languageModel: unknown;
  permissionMode: PermissionMode;
  providerOptions?: SharedV3ProviderOptions;
  systemPrompt: string;
  threadId: string;
  toolsEnabled: boolean;
}) {
  const tools = toolsEnabled
    ? {
        list: tool({
          description:
            "List files and directories using a concise tree view.",
          inputSchema: listInputSchema,
          outputSchema: listOutputSchema,
          execute: async (input) =>
            executeList({
              defaultDirectory: defaultDirectory!,
              input,
              permissionMode,
            }),
        }),
        glob: tool({
          description:
            "Find files by glob pattern inside a directory.",
          inputSchema: globInputSchema,
          outputSchema: globOutputSchema,
          execute: async (input) =>
            executeGlob({
              defaultDirectory: defaultDirectory!,
              input,
              permissionMode,
            }),
        }),
        read: tool({
          description:
            "Read file contents or a bounded slice of a directory listing.",
          inputSchema: readInputSchema,
          outputSchema: readOutputSchema,
          execute: async (input) =>
            executeRead({
              defaultDirectory: defaultDirectory!,
              input,
              permissionMode,
            }),
        }),
        grep: tool({
          description:
            "Search file contents using ripgrep with regular expressions.",
          inputSchema: grepInputSchema,
          outputSchema: grepOutputSchema,
          execute: async (input) =>
            executeGrep({
              defaultDirectory: defaultDirectory!,
              input,
              permissionMode,
            }),
        }),
        edit: tool({
          description:
            "Replace exact text inside an existing file after approval.",
          inputSchema: editInputSchema,
          needsApproval: true,
          outputSchema: editOutputSchema,
          execute: async (input) =>
            executeEdit({
              defaultDirectory: defaultDirectory!,
              input,
              permissionMode,
            }),
        }),
        create_file: tool({
          description:
            "Create a new file with full contents after approval.",
          inputSchema: createFileInputSchema,
          needsApproval: true,
          outputSchema: createFileOutputSchema,
          execute: async (input) =>
            executeCreateFile({
              defaultDirectory: defaultDirectory!,
              input,
              permissionMode,
            }),
        }),
        delete_file: tool({
          description:
            "Delete an existing file after approval.",
          inputSchema: deleteFileInputSchema,
          needsApproval: true,
          outputSchema: deleteFileOutputSchema,
          execute: async (input) =>
            executeDeleteFile({
              defaultDirectory: defaultDirectory!,
              input,
              permissionMode,
            }),
        }),
        run_task: tool({
          description:
            "Run a standard project script such as test, lint, build, format, or typecheck after approval.",
          inputSchema: runTaskInputSchema,
          needsApproval: true,
          outputSchema: runTaskOutputSchema,
          toModelOutput: ({ output }) => ({
            type: "json",
            value:
              output.phase === "completed"
                ? output
                : { phase: "running" },
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
          description:
            "Run a single shell command after user approval.",
          inputSchema: shellCommandSchema,
          needsApproval: true,
          outputSchema: shellCommandOutputSchema,
          toModelOutput: ({ output }) => ({
            type: "json",
            value:
              output.phase === "completed"
                ? output
                : { phase: "running" },
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
    : undefined;

  return new ToolLoopAgent({
    ...(attachmentDownload ? { experimental_download: attachmentDownload } : {}),
    instructions: buildThreadAgentInstructions({
      defaultDirectory,
      permissionMode,
      systemPrompt,
    }),
    model: languageModel as ConstructorParameters<typeof ToolLoopAgent>[0]["model"],
    ...(providerOptions ? { providerOptions } : {}),
    stopWhen: stepCountIs(12),
    ...(tools ? { tools } : {}),
  });
}
