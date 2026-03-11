import {
  stepCountIs,
  tool,
  ToolLoopAgent,
  type Experimental_DownloadFunction,
} from "ai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import { z } from "zod";

import {
  disposeShellSession,
  streamWorkspaceShellCommand,
} from "./shell-session";

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
  shellEnabled,
  systemPrompt,
  workspaceRoot,
}: {
  shellEnabled: boolean;
  systemPrompt: string;
  workspaceRoot?: string;
}) {
  const shellGuidance = shellEnabled
    ? [
        "You can use the shell tool to inspect and work inside the selected workspace.",
        `Workspace root: ${workspaceRoot}`,
        "Rules for shell usage:",
        "- Propose only one command at a time.",
        "- Explain the command briefly in the rationale field.",
        "- Avoid full-screen or interactive TUI programs.",
        "- Prefer non-interactive flags for scaffolding, installs, and builds.",
        "- When a task can run for several minutes, state that clearly before asking for approval.",
        "- Prefer read-only inspection before mutations.",
        "- Never assume approval; wait for the user approval workflow to continue.",
      ].join("\n")
    : [
        "Shell execution is currently unavailable.",
        "Do not mention or attempt shell commands unless the user asks conceptually.",
      ].join("\n");

  return [systemPrompt.trim(), shellGuidance].filter(Boolean).join("\n\n");
}

export function createThreadAgent({
  attachmentDownload,
  languageModel,
  providerOptions,
  shellEnabled,
  systemPrompt,
  threadId,
  workspaceRoot,
}: {
  attachmentDownload?: Experimental_DownloadFunction;
  languageModel: unknown;
  providerOptions?: SharedV3ProviderOptions;
  shellEnabled: boolean;
  systemPrompt: string;
  threadId: string;
  workspaceRoot?: string;
}) {
  const tools = shellEnabled
    ? {
        shell_command: tool({
          description:
            "Run a single shell command in the linked workspace after user approval.",
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
            const abortShell = () => {
              void disposeShellSession(threadId);
            };

            abortSignal?.addEventListener("abort", abortShell, { once: true });

            try {
              for await (const event of streamWorkspaceShellCommand({
                command,
                threadId,
                workspaceRoot: workspaceRoot!,
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
      shellEnabled,
      systemPrompt,
      workspaceRoot,
    }),
    model: languageModel as ConstructorParameters<typeof ToolLoopAgent>[0]["model"],
    ...(providerOptions ? { providerOptions } : {}),
    stopWhen: stepCountIs(12),
    ...(tools ? { tools } : {}),
  });
}
