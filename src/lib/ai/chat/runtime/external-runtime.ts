import type { PermissionMode } from "@/server/db/enums";
import type { ThreadUIMessage } from "@/lib/ai/messages/types";
import { serializeComposerContextToText } from "@/lib/composer-context/serialize";

import {
  beginThreadRepoCheckpointRun,
  clearThreadRepoCheckpointRun,
  finalizeThreadRepoCheckpointRun,
} from "../repo-checkpoints";
import { buildPlanModePromptPreamble } from "./plan-mode-instructions";

function getTextContent(message: ThreadUIMessage) {
  return message.parts
    .filter(
      (
        part,
      ): part is Extract<ThreadUIMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function formatTranscriptMessage(message: ThreadUIMessage) {
  const text = getTextContent(message);
  if (!text) return null;
  return `${message.role.toUpperCase()}:\n${text}`;
}

export function buildExternalRuntimePromptText(input: {
  message: ThreadUIMessage;
  threadMode: "chat" | "plan";
  transcript: ThreadUIMessage[];
  workspaceRoot: string | null;
}) {
  const composerContextText = input.message.metadata?.composerContext
    ? serializeComposerContextToText(input.message.metadata.composerContext)
    : null;
  const latestText = getTextContent(input.message);
  const history = input.transcript
    .filter((message) => message.id !== input.message.id)
    .map(formatTranscriptMessage)
    .filter(Boolean)
    .join("\n\n");

  const sections = [
    input.threadMode === "plan" ? buildPlanModePromptPreamble() : null,
    composerContextText,
    [
      "External runtime context:",
      `Current mode: ${input.threadMode}.`,
      `Workspace root: ${input.workspaceRoot ?? "unavailable"}.`,
    ].join("\n"),
    history ? `Conversation so far:\n${history}` : null,
    latestText ? `Latest user request:\n${latestText}` : null,
  ];

  return sections.filter(Boolean).join("\n\n");
}

export function shouldAutoApproveExternalPermission(input: {
  permissionMode: PermissionMode;
  toolsEnabled: boolean;
}) {
  return input.permissionMode === "full" && input.toolsEnabled;
}

export function shouldAutoDenyExternalPermission(input: {
  toolsEnabled: boolean;
}) {
  return !input.toolsEnabled;
}

export async function beginExternalRuntimeRepoCheckpoint(input: {
  projectPath: string | null;
  runId: string;
  thread: { chatEngineState?: unknown } | null;
}) {
  return beginThreadRepoCheckpointRun(input);
}

export async function clearExternalRuntimeRepoCheckpoint(runId: string) {
  await clearThreadRepoCheckpointRun(runId);
}

export async function finalizeExternalRuntimeRepoCheckpoint(input: {
  assistantMessageId: string;
  runId: string;
  threadId: string;
}) {
  return finalizeThreadRepoCheckpointRun(input);
}
