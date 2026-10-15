import type * as acp from "@agentclientprotocol/sdk";

import type { ExternalToolKind } from "@/lib/ai/chat/runtime/external/mirror";
import type { ExternalQuestion } from "@/lib/ai/chat/runtime/external/user-input";
import type { PermissionMode } from "@/server/db/enums";

import { findModelOption, type AcpConfigOptionInfo } from "../config-options";
import type { AcpExtContext } from "../descriptor";
import {
  asRecord,
  readArray,
  readNonEmptyString,
  readRecord,
  type JsonRecord,
} from "../schema";

// Antigravity's wire quirks on the shared ACP engine (design acp-and-agents
// §3.3; ported from t3code apps/server/src/provider/acp/{AntigravityProtocol,
// AntigravityAcpSupport}.ts, MIT):
// - permission requests whose toolCallId starts with `interaction_` are
//   native questions (their options are the answers, not approvals);
// - shell tools carry native field names (CommandLine, combinedOutput, …),
//   mapped onto the names the tool cards read, and tool text is bounded;
// - `start_subagent` calls are ordinary tools: shown as subagent cards;
// - the permission mode is the session mode (full → yolo, …);
// - thinking levels are part of model ids, and the `antigravity-default`
//   alias is never sent.

export const ANTIGRAVITY_DEFAULT_MODEL_ALIAS = "antigravity-default";
const TOOL_TEXT_LIMIT = 8_000;
const TOOL_TEXT_TRUNCATED = "[Earlier output truncated]\n\n";
const QUESTION_LABEL_LIMIT = 512;
const WARNING_LIMIT = 512;
const SECURITY_WARNING_META_KEY = "agy.security.warning";

export function antigravityPermissionModeId(mode: PermissionMode) {
  switch (mode) {
    case "full":
      return "yolo";
    case "accept_edits":
      return "auto_edit";
    default:
      return "default";
  }
}

function modelValues(options: readonly AcpConfigOptionInfo[]) {
  const option = findModelOption(options);
  return {
    current:
      typeof option?.currentValue === "string" ? option.currentValue : null,
    values: option?.values.map((entry) => entry.value) ?? [],
  };
}

/**
 * The model to select: an explicit choice as is; the default (no choice,
 * or the alias) is the manifest's default when the account offers it, else
 * the agent's own current model. Effort is never sent: it is in the id.
 */
export function resolveAntigravityModelSelection(
  selection: { modelId: string | null },
  session: { configOptions: readonly AcpConfigOptionInfo[] },
  defaultModelId: string | null,
): { effort: null; modelId: string | null } {
  const requested = selection.modelId?.trim() || null;
  if (requested && requested !== ANTIGRAVITY_DEFAULT_MODEL_ALIAS) {
    return { effort: null, modelId: requested };
  }
  const { current, values } = modelValues(session.configOptions);
  if (defaultModelId && values.includes(defaultModelId)) {
    return { effort: null, modelId: defaultModelId };
  }
  return { effort: null, modelId: current };
}

function bound(text: string, limit = TOOL_TEXT_LIMIT) {
  return text.length <= limit
    ? text
    : `${TOOL_TEXT_TRUNCATED}${text.slice(-limit)}`;
}

function boundValue(
  value: unknown,
  budget: { nodes: number },
  depth = 0,
): unknown {
  if (depth > 12 || budget.nodes-- <= 0) return undefined;
  if (typeof value === "string") {
    return /^data:image\//i.test(value) ? undefined : bound(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => boundValue(entry, budget, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  const record = asRecord(value);
  if (!record) return value;
  const result: JsonRecord = {};
  for (const [key, entry] of Object.entries(record)) {
    // Inline image bytes stay out of stored tool state.
    if (
      (key === "data" || key === "blob") &&
      typeof record.mimeType === "string" &&
      record.mimeType.startsWith("image/")
    ) {
      continue;
    }
    const next = boundValue(entry, budget, depth + 1);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function firstString(record: JsonRecord | null, keys: readonly string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstInt(record: JsonRecord | null, keys: readonly string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return null;
}

const COMMAND_KEYS = ["CommandLine", "command_line", "commandLine", "command"];
const CWD_KEYS = [
  "Cwd",
  "WorkingDirectory",
  "working_dir",
  "workingDir",
  "cwd",
];
const OUTPUT_KEYS = ["combinedOutput", "combined_output"];
const EXIT_KEYS = ["exitCode", "exit_code"];

/** One tool_call(_update) with native shell fields mapped and text bounded. */
export function normalizeAntigravityToolUpdate(update: JsonRecord): JsonRecord {
  const budget = { nodes: 512 };
  const input = asRecord(update.rawInput);
  const output = asRecord(update.rawOutput);
  const command =
    firstString(input, COMMAND_KEYS) ??
    firstString(output, ["commandLine", "command_line"]);
  const cwd =
    firstString(input, CWD_KEYS) ??
    firstString(output, ["workingDir", "working_dir"]);
  const combined = firstString(output, OUTPUT_KEYS);
  const exitCode = firstInt(output, EXIT_KEYS);

  const next: JsonRecord = { ...update };
  if (typeof update.title === "string") next.title = bound(update.title);
  if (update.rawInput !== undefined) {
    const bounded = boundValue(update.rawInput, budget);
    next.rawInput =
      input && (command || cwd)
        ? {
            ...(asRecord(bounded) ?? {}),
            ...(command ? { command: bound(command) } : {}),
            ...(cwd ? { cwd: bound(cwd) } : {}),
          }
        : bounded;
  }
  if (update.rawOutput !== undefined) {
    const bounded = boundValue(update.rawOutput, budget);
    next.rawOutput =
      output && (combined != null || exitCode != null)
        ? {
            ...(asRecord(bounded) ?? {}),
            ...(combined != null ? { output: bound(combined) } : {}),
            ...(exitCode != null ? { exitCode } : {}),
          }
        : bounded;
  }
  if (Array.isArray(update.content)) {
    next.content = boundValue(update.content, budget);
  }
  if (update._meta !== undefined) {
    next._meta = boundValue(update._meta, budget) ?? null;
  }
  if (command && (update.kind == null || update.kind === "other")) {
    next.kind = "execute";
  }
  return next;
}

function securityWarning(option: unknown) {
  const meta = readRecord(option, "_meta");
  const warning = meta?.[SECURITY_WARNING_META_KEY];
  const text =
    typeof warning === "string"
      ? warning.trim()
      : (readNonEmptyString(warning, "message") ??
        readNonEmptyString(warning, "title"));
  if (!text) return null;
  return text.length > WARNING_LIMIT
    ? `${text.slice(0, WARNING_LIMIT - 3)}...`
    : text;
}

const OPTION_LABELS: Record<string, string> = {
  allow_always: "Allow for this thread",
  allow_once: "Allow once",
  reject_once: "Deny",
};

/**
 * An approval as Sentinel shows it: Antigravity's own labels, with the
 * prompt-injection warning it puts on "allow always" added to the card.
 */
export function normalizeAntigravityPermissionParams(
  params: JsonRecord,
): JsonRecord {
  const toolCall = asRecord(params.toolCall) ?? {};
  if (readNonEmptyString(toolCall, "toolCallId")?.startsWith("interaction_")) {
    return params;
  }
  const options = readArray(params, "options") ?? [];
  const warnings: string[] = [];
  const renamed = options.map((option) => {
    const record = asRecord(option);
    if (!record) return option;
    const warning = securityWarning(record);
    if (warning) warnings.push(warning);
    const label =
      typeof record.kind === "string" ? OPTION_LABELS[record.kind] : undefined;
    return label ? { ...record, name: label } : record;
  });
  const bounded = normalizeAntigravityToolUpdate(toolCall);
  const content = Array.isArray(bounded.content) ? bounded.content : [];
  return {
    ...params,
    options: renamed,
    toolCall: warnings.length
      ? {
          ...bounded,
          content: [
            ...content,
            ...warnings.map((text) => ({
              content: { text: `Allow for this thread: ${text}`, type: "text" },
              type: "content",
            })),
          ],
        }
      : bounded,
  };
}

/** Inbound frames: tool updates and approvals in Sentinel's shape. */
export function normalizeAntigravityInbound(
  message: acp.AnyMessage,
): acp.AnyMessage | null {
  const record = asRecord(message);
  if (!record || typeof record.method !== "string") {
    return message;
  }
  const params = asRecord(record.params);
  if (!params) return message;
  if (record.method === "session/update") {
    const update = asRecord(params.update);
    if (
      update &&
      (update.sessionUpdate === "tool_call" ||
        update.sessionUpdate === "tool_call_update")
    ) {
      return {
        ...record,
        params: { ...params, update: normalizeAntigravityToolUpdate(update) },
      } as acp.AnyMessage;
    }
    return message;
  }
  if (record.method === "session/request_permission" && "id" in record) {
    return {
      ...record,
      params: normalizeAntigravityPermissionParams(params),
    } as acp.AnyMessage;
  }
  return message;
}

/** `start_subagent` calls (not MCP tools of that name) are subagent cards. */
export function antigravityToolKind(
  update: JsonRecord,
): ExternalToolKind | null {
  const kind = update.kind;
  if (kind != null && kind !== "other") return null;
  const title = update.title;
  if (title !== "Running start_subagent" && title !== "Run start_subagent?") {
    return null;
  }
  return readRecord(update, "_meta")?.is_mcp_tool_call === true
    ? null
    : "subagent";
}

function questionLabel(option: JsonRecord) {
  const label =
    readNonEmptyString(option, "name") ??
    readNonEmptyString(option, "optionId") ??
    "";
  return label.length > QUESTION_LABEL_LIMIT
    ? `${label.slice(0, QUESTION_LABEL_LIMIT - 3)}...`
    : label;
}

/** A native question (an `interaction_` permission request), else null. */
export function readAntigravityQuestion(
  params: unknown,
): { optionIds: string[]; question: ExternalQuestion } | null {
  const toolCall = readRecord(params, "toolCall");
  const toolCallId = readNonEmptyString(toolCall, "toolCallId");
  if (!toolCallId?.startsWith("interaction_")) return null;
  const options = (readArray(params, "options") ?? []).flatMap((option) => {
    const record = asRecord(option);
    const id = readNonEmptyString(record, "optionId");
    return record && id ? [{ id, label: questionLabel(record) }] : [];
  });
  if (
    options.length === 0 ||
    new Set(options.map((option) => option.id)).size !== options.length
  ) {
    return null;
  }
  const title = readNonEmptyString(toolCall, "title") ?? "Choose an option.";
  return {
    optionIds: options.map((option) => option.id),
    question: {
      id: toolCallId,
      multiSelect: false,
      options,
      question: bound(title),
    },
  };
}

/**
 * Answers a native question through the user-input card; every other
 * permission request goes to the shared approval flow (null).
 */
export function handleAntigravityPermissionRequest(
  params: unknown,
  context: AcpExtContext,
): Promise<unknown> | null {
  const read = readAntigravityQuestion(params);
  if (!read) return null;
  return (async () => {
    const response = await context.askUser({
      questions: [read.question],
      title: read.question.question,
      toolCallId: read.question.id,
    });
    const selected = response?.answers
      .find((answer) => answer.questionId === read.question.id)
      ?.selectedOptionIds.find((id) => read.optionIds.includes(id));
    return selected
      ? { outcome: { optionId: selected, outcome: "selected" } }
      : { outcome: { outcome: "cancelled" } };
  })();
}
