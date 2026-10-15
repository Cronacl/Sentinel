import "server-only";

import path from "node:path";

import { resolveAllowedPath } from "@/lib/ai/chat/engines/acp/client-fs";
import {
  readArray,
  readNonEmptyString,
  readNumber,
  readString,
} from "@/lib/ai/chat/engines/acp/schema";
import { readPiToolApproval } from "@/lib/ai/chat/engines/pi/extension";
import type { PiRpcProcess } from "@/lib/ai/chat/engines/pi/rpc";

import { UNATTENDED_DECLINE_MESSAGE } from "../unattended";
import type {
  ExternalPermissionOption,
  ExternalToolKind,
  ToolPatch,
} from "../external/mirror";
import {
  isEditKind,
  resolvePermissionDisposition,
  toExternalDecision,
  type EditScope,
} from "../external/permissions";
import {
  buildQuestionInput,
  parseQuestionResponse,
  type ExternalQuestion,
} from "../external/user-input";
import {
  markAwaitingUser,
  nextInteractionId,
  resumeStreaming,
  type PiInteractionAnswer,
  type PiPendingInteraction,
  type PiRunControl,
} from "./control";
import { normalizePiPath, piToolKind, piToolPatch } from "./events";

// Extension UI requests Pi raises while a turn runs (design §4; t3code
// packages/provider-pi/src/server/adapter.ts, MIT): `confirm` becomes an
// approval, `select` / `input` / `editor` a question on the shared card,
// `notify` a notice; terminal decorations (setStatus, setWidget, setTitle,
// set_editor_text) are ignored. Confirms from Sentinel's own extension
// (extension.ts) describe a tool call and settle through the shared
// permission policy; other extensions' confirms always ask (and are
// declined when nobody can answer). Every dialog is answered with an
// `extension_ui_response`: `{confirmed}`, `{value}` or `{cancelled:true}`.

const DENIED_WITHOUT_TOOLS = "Declined: tools are disabled for this run.";
const SESSION_GRANTS_KEY = "sentinel.sessionGrants";

const CONFIRM_OPTIONS: ExternalPermissionOption[] = [
  { kind: "allow_once", name: "Allow", optionId: "allow_once" },
  {
    kind: "allow_always",
    name: "Allow for this session",
    optionId: "allow_always",
  },
  { kind: "reject_once", name: "Deny", optionId: "reject_once" },
];

function denialReason(control: PiRunControl) {
  return control.toolsEnabled
    ? UNATTENDED_DECLINE_MESSAGE
    : DENIED_WITHOUT_TOOLS;
}

/** Tool names the user allowed for the rest of this Pi session. */
export function sessionGrants(process: PiRpcProcess) {
  let grants = process.state.get(SESSION_GRANTS_KEY) as Set<string> | undefined;
  if (!grants) {
    grants = new Set();
    process.state.set(SESSION_GRANTS_KEY, grants);
  }
  return grants;
}

function reply(
  process: PiRpcProcess,
  id: string,
  answer: { cancelled: true } | { confirmed: boolean } | { value: string },
) {
  process.send({ ...answer, id, type: "extension_ui_response" });
}

/** Parks a dialog until the user, Stop, the end of the turn or its timeout answers. */
async function waitForUser(
  control: PiRunControl,
  input: Omit<PiPendingInteraction, "settle">,
  timeoutMs: number | null,
): Promise<PiInteractionAnswer> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const answer = new Promise<PiInteractionAnswer>((resolve) => {
    control.pending.set(input.approvalId, {
      ...input,
      settle: (value) => {
        if (timer) clearTimeout(timer);
        control.pending.delete(input.approvalId);
        resolve(value);
      },
    });
  });
  if (control.cancelRequested || control.finished) {
    control.pending.get(input.approvalId)?.settle({ type: "cancel" });
  } else {
    if (timeoutMs !== null) {
      // Pi gives up on the dialog by itself; the card goes with it.
      timer = setTimeout(
        () => control.pending.get(input.approvalId)?.settle({ type: "cancel" }),
        timeoutMs,
      );
    }
    await markAwaitingUser(control);
  }
  return await answer;
}

async function editScopeOf(
  control: PiRunControl,
  kind: ExternalToolKind,
  input: unknown,
): Promise<EditScope> {
  if (!isEditKind(kind)) {
    return "unknown";
  }
  const raw = readString(input, "path") ?? readString(input, "file_path");
  if (!raw) {
    return "unknown";
  }
  try {
    await resolveAllowedPath(
      path.resolve(control.workspaceRoot, normalizePiPath(raw)),
      {
        roots: [control.workspaceRoot],
      },
    );
    return "inside";
  } catch {
    return "outside";
  }
}

function timeoutOf(event: Record<string, unknown>) {
  const timeout = readNumber(event, "timeout");
  // Pi treats 0 (and no value) as no timeout.
  return timeout && timeout > 0 ? timeout : null;
}

async function handleConfirm(
  control: PiRunControl,
  process: PiRpcProcess,
  id: string,
  event: Record<string, unknown>,
) {
  const title = readString(event, "title") ?? "Confirm";
  const message = readString(event, "message");
  const tool = readPiToolApproval(message);

  let patch: ToolPatch;
  let disposition: "allow" | "ask" | "deny";
  if (tool) {
    const toolId = tool.toolCallId ?? `pi-confirm-${id}`;
    const kind = piToolKind(tool.toolName);
    patch = piToolPatch(toolId, tool.toolName, tool.input);
    const existing = control.mirror.getTool(toolId);
    if (existing?.content && Object.keys(existing.content).length > 0) {
      delete patch.content;
    }
    disposition = resolvePermissionDisposition({
      editScope: await editScopeOf(control, kind, tool.input),
      interactive: control.interactive,
      kind,
      permissionMode: control.permissionMode,
      toolsEnabled: control.toolsEnabled,
    });
    if (disposition === "ask" && sessionGrants(process).has(tool.toolName)) {
      disposition = "allow";
    }
  } else {
    // Another extension's question: only a person can answer it.
    patch = {
      id: `pi-confirm-${id}`,
      input: message ? { message } : {},
      kind: "other",
      rawName: "confirm",
      title,
    };
    disposition = control.interactive ? "ask" : "deny";
  }

  if (disposition === "allow") {
    control.mirror.upsertTool(patch);
    reply(process, id, { confirmed: true });
    control.emitter.schedule();
    return;
  }

  const approvalId = nextInteractionId(control, patch.id);
  control.mirror.requestApproval({
    approvalId,
    options: CONFIRM_OPTIONS,
    patch,
  });
  if (disposition === "deny") {
    control.mirror.respondToApproval(patch.id, {
      approved: false,
      reason: denialReason(control),
    });
    reply(process, id, { confirmed: false });
    control.emitter.flush();
    return;
  }

  const answer = await waitForUser(
    control,
    { approvalId, kind: "confirm", toolId: patch.id },
    timeoutOf(event),
  );
  if (answer.type !== "decision" || answer.decision === "cancel") {
    control.mirror.respondToApproval(patch.id, {
      approved: false,
      reason: "Cancelled",
    });
    reply(process, id, { cancelled: true });
    resumeStreaming(control);
    return;
  }
  const approved =
    answer.decision === "accept" || answer.decision === "acceptForSession";
  if (tool && answer.decision === "acceptForSession") {
    sessionGrants(process).add(tool.toolName);
  }
  control.mirror.respondToApproval(patch.id, {
    approved,
    decision: answer.decision,
  });
  reply(process, id, { confirmed: approved });
  resumeStreaming(control);
}

/** select / input / editor as one question on the shared card. */
export function piQuestion(
  id: string,
  method: string,
  event: Record<string, unknown>,
): ExternalQuestion {
  const title = readNonEmptyString(event, "title");
  const prompt =
    readNonEmptyString(event, "message") ??
    readNonEmptyString(event, "placeholder") ??
    title ??
    "Pi needs an answer";
  const prefill = method === "editor" ? readString(event, "prefill") : null;
  const options =
    method === "select"
      ? (readArray(event, "options") ?? []).flatMap((option, index) =>
          typeof option === "string"
            ? [{ id: `option-${index}`, label: option || "(empty)" }]
            : [],
        )
      : [];
  return {
    ...(title && title !== prompt ? { header: title } : {}),
    id,
    multiSelect: false,
    options,
    question: prefill ? `${prompt}\n\nCurrent text:\n${prefill}` : prompt,
  };
}

/** The value a question's answer sends back to Pi. */
export function piQuestionValue(
  question: ExternalQuestion,
  response: string,
  event: Record<string, unknown>,
) {
  const parsed = parseQuestionResponse([question], response);
  const answer = parsed.answers[0];
  const optionId = answer?.selectedOptionIds[0];
  if (optionId) {
    const index = Number(optionId.slice("option-".length));
    const options = readArray(event, "options") ?? [];
    const value = options[index];
    if (typeof value === "string") {
      return value;
    }
  }
  return answer?.text ?? response.trim();
}

async function handleQuestion(
  control: PiRunControl,
  process: PiRpcProcess,
  id: string,
  method: string,
  event: Record<string, unknown>,
) {
  const question = piQuestion(id, method, event);
  const toolId = `pi-question-${id}`;
  const patch: ToolPatch = {
    id: toolId,
    input: buildQuestionInput({ questions: [question] }),
    kind: "user_input",
    status: "pending",
    title: question.header ?? question.question,
    toolName: "pi_ask_question",
  };
  const approvalId = nextInteractionId(control, toolId);
  control.mirror.requestApproval({ approvalId, patch });

  if (!control.interactive) {
    control.mirror.respondToApproval(toolId, {
      approved: false,
      reason: denialReason(control),
    });
    reply(process, id, { cancelled: true });
    control.emitter.flush();
    return;
  }

  const answer = await waitForUser(
    control,
    { approvalId, kind: "question", toolId },
    timeoutOf(event),
  );
  if (answer.type !== "response") {
    control.mirror.respondToApproval(toolId, {
      approved: false,
      reason: answer.type === "cancel" ? "Cancelled" : "Declined",
    });
    reply(process, id, { cancelled: true });
    resumeStreaming(control);
    return;
  }
  const value = piQuestionValue(question, answer.response, event);
  control.mirror.setToolState(toolId, "output-available", {
    output: {
      answers: [{ questionId: id, text: value }],
      response: answer.response,
    },
  });
  reply(process, id, { value });
  resumeStreaming(control);
}

/** One `extension_ui_request`. */
export async function handlePiUiRequest(
  control: PiRunControl,
  process: PiRpcProcess,
  event: Record<string, unknown>,
) {
  const id = readNonEmptyString(event, "id");
  const method = readString(event, "method");
  if (!id || !method) {
    return;
  }
  switch (method) {
    case "confirm":
      await handleConfirm(control, process, id, event);
      return;
    case "select":
    case "input":
    case "editor":
      await handleQuestion(control, process, id, method, event);
      return;
    case "notify": {
      const title = readString(event, "message") ?? "Pi";
      const severity =
        readString(event, "notifyType") === "error"
          ? "error"
          : readString(event, "notifyType") === "warning"
            ? "warning"
            : "info";
      control.mirror.upsertTool({
        id: `pi-notify-${id}`,
        input: {},
        kind: "notice",
        meta: { severity },
        output: { description: null, severity, title },
        status: "completed",
        title,
      });
      control.emitter.flush();
      return;
    }
    default:
      // Terminal decorations have no place in Sentinel.
      return;
  }
}

/** A submitted approval or answer, as the dialog it settles expects. */
export function toPiInteractionAnswer(
  kind: PiPendingInteraction["kind"],
  response: { approved: boolean; decision?: string; response?: string },
): PiInteractionAnswer | null {
  if (kind === "question") {
    const text = response.response?.trim();
    if (text) {
      return { response: text, type: "response" };
    }
    return response.approved ? null : { type: "cancel" };
  }
  return { decision: toExternalDecision(response), type: "decision" };
}
