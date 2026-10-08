import "server-only";

import { RequestError } from "@agentclientprotocol/sdk";

import {
  readClientTextFile,
  writeClientTextFile,
  type ClientFsPolicy,
} from "@/lib/ai/chat/engines/acp/client-fs";
import {
  createClientTerminals,
  type ClientTerminals,
} from "@/lib/ai/chat/engines/acp/client-terminal";
import type { AcpProcessHandlers } from "@/lib/ai/chat/engines/acp/connection";
import type { AcpExtContext } from "@/lib/ai/chat/engines/acp/descriptor";
import {
  readNonEmptyString,
  readPermissionOptions,
  readRecord,
  readString,
} from "@/lib/ai/chat/engines/acp/schema";
import { createLogger } from "@/lib/logger";

import { UNATTENDED_DECLINE_MESSAGE } from "../unattended";
import { toToolPatch } from "../external/acp-updates";
import {
  isOpenableElicitationUrl,
  readElicitationFields,
  toElicitationContent,
} from "../external/elicitation";
import type {
  ExternalPermissionOption,
  ExternalToolContent,
  ExternalToolKind,
  ToolPatch,
} from "../external/mirror";
import {
  autoApproveOutcome,
  autoDenyOutcome,
  CANCELLED_PERMISSION_OUTCOME,
  resolvePermissionDisposition,
  selectPermissionOutcome,
  toExternalDecision,
  type PermissionOutcome,
} from "../external/permissions";
import {
  buildQuestionInput,
  parseQuestionResponse,
  type ExternalQuestion,
  type ExternalQuestionResponse,
} from "../external/user-input";
import {
  markAwaitingUser,
  nextInteractionId,
  resumeStreaming,
  type AcpRunControl,
  type InteractionAnswer,
} from "./control";

// What the agent asks the client while a turn runs: tool permissions,
// questions (vendor extensions and form elicitations), sign-in links, file
// reads and writes, terminals. Each request settles through the permission
// policy (external/permissions.ts) or waits on the user; Stop and the end of
// the prompt answer whatever still waits as cancelled.

const log = createLogger("ThreadChatAcp");

const DENIED_WITHOUT_TOOLS = "Declined: tools are disabled for this run.";

/** Options Sentinel offers for its own approvals (client writes and terminals). */
const SENTINEL_GATE_OPTIONS: ExternalPermissionOption[] = [
  { kind: "allow_once", name: "Allow", optionId: "allow_once" },
  { kind: "allow_always", name: "Always allow", optionId: "allow_always" },
  { kind: "reject_once", name: "Reject", optionId: "reject_once" },
];

function optionKind(
  options: readonly ExternalPermissionOption[],
  outcome: PermissionOutcome,
) {
  return outcome.outcome.outcome === "selected"
    ? (options.find(
        (option) =>
          outcome.outcome.outcome === "selected" &&
          option.optionId === outcome.outcome.optionId,
      )?.kind ?? null)
    : null;
}

function editPathsOf(
  content: ExternalToolContent | undefined,
  patch: ToolPatch,
) {
  return [
    ...(content?.diffs ?? []).map((diff) => diff.path),
    ...(patch.locations ?? []).map((location) => location.path),
  ];
}

function recordGrant(
  control: AcpRunControl,
  kind: ExternalToolKind,
  paths: string[],
  optionKindValue: string | null,
) {
  if (!optionKindValue?.startsWith("allow")) {
    return;
  }
  if (kind === "execute") {
    control.grants.execute =
      optionKindValue === "allow_always" || control.grants.execute === "session"
        ? "session"
        : "turn";
  }
  if (kind === "edit" || kind === "delete" || kind === "move") {
    for (const path of paths) {
      control.grants.editPaths.add(path);
    }
  }
}

function denialReason(control: AcpRunControl) {
  return control.toolsEnabled
    ? UNATTENDED_DECLINE_MESSAGE
    : DENIED_WITHOUT_TOOLS;
}

/** session/request_permission. */
export async function handlePermissionRequest(
  control: AcpRunControl,
  params: unknown,
): Promise<PermissionOutcome> {
  const toolCall = readRecord(params, "toolCall") ?? {};
  const options = readPermissionOptions(params);
  const toolCallId =
    readNonEmptyString(toolCall, "toolCallId") ??
    `permission-${(control.nextInteractionId += 1)}`;
  const patch: ToolPatch = toToolPatch({
    ...toolCall,
    sessionUpdate: "tool_call_update",
    toolCallId,
  }) ?? { id: toolCallId };
  const existing = control.mirror.getTool(toolCallId);
  const kind = patch.kind ?? existing?.kind ?? "other";
  if (!existing && !patch.kind) {
    patch.kind = kind;
  }
  const disposition = resolvePermissionDisposition({
    interactive: control.interactive,
    kind,
    permissionMode: control.permissionMode,
    toolsEnabled: control.toolsEnabled,
  });

  if (disposition === "allow") {
    control.mirror.upsertTool(patch);
    const outcome = autoApproveOutcome(options);
    recordGrant(
      control,
      kind,
      editPathsOf(control.mirror.getTool(toolCallId)?.content, patch),
      optionKind(options, outcome),
    );
    control.emitter.schedule();
    return outcome;
  }

  if (disposition === "deny") {
    const approvalId = nextInteractionId(control, toolCallId);
    control.mirror.requestApproval({ approvalId, options, patch });
    control.mirror.respondToApproval(toolCallId, {
      approved: false,
      reason: denialReason(control),
    });
    control.emitter.flush();
    return autoDenyOutcome(options);
  }

  const approvalId = nextInteractionId(control, toolCallId);
  control.mirror.requestApproval({ approvalId, options, patch });
  const answer = await waitForUser(control, {
    approvalId,
    kind: "permission",
    toolId: toolCallId,
  });

  if (answer.type !== "decision") {
    control.mirror.respondToApproval(toolCallId, {
      approved: false,
      reason: "Cancelled",
    });
    resumeStreaming(control);
    return CANCELLED_PERMISSION_OUTCOME;
  }

  const outcome = selectPermissionOutcome(options, answer.decision);
  const selectedKind = optionKind(options, outcome);
  const approved = selectedKind?.startsWith("allow") ?? false;
  control.mirror.respondToApproval(toolCallId, {
    approved,
    decision: answer.decision,
    ...(answer.reason ? { reason: answer.reason } : {}),
  });
  recordGrant(
    control,
    kind,
    editPathsOf(control.mirror.getTool(toolCallId)?.content, patch),
    selectedKind,
  );
  resumeStreaming(control);
  return outcome;
}

/** Parks a request until the user (or Stop) answers it. */
async function waitForUser(
  control: AcpRunControl,
  input: {
    approvalId: string;
    elicitationId?: string;
    kind: "gate" | "permission" | "question" | "url";
    toolId: string;
  },
): Promise<InteractionAnswer> {
  const answer = new Promise<InteractionAnswer>((resolve) => {
    control.pending.set(input.approvalId, {
      ...input,
      settle: (value) => {
        control.pending.delete(input.approvalId);
        resolve(value);
      },
    });
  });
  if (control.cancelRequested || control.finished) {
    control.pending.get(input.approvalId)?.settle({ type: "cancel" });
  } else {
    await markAwaitingUser(control);
  }
  return await answer;
}

/**
 * Asks the user questions on the shared card. Null when the user cancelled
 * or nobody can answer (an unattended run declines at once).
 */
export async function askUser(
  control: AcpRunControl,
  input: {
    prompt?: string | null;
    questions: ExternalQuestion[];
    title?: string | null;
    toolCallId: string;
  },
): Promise<ExternalQuestionResponse | null> {
  const patch: ToolPatch = {
    id: input.toolCallId,
    input: buildQuestionInput(input),
    kind: "user_input",
    status: "pending",
    title: input.title ?? input.prompt ?? "Question",
    toolName: `${control.descriptor.toolPrefix}ask_question`,
  };
  const approvalId = nextInteractionId(control, input.toolCallId);
  control.mirror.requestApproval({ approvalId, patch });

  if (!control.interactive) {
    control.mirror.respondToApproval(input.toolCallId, {
      approved: false,
      reason: denialReason(control),
    });
    control.emitter.flush();
    return null;
  }

  const answer = await waitForUser(control, {
    approvalId,
    kind: "question",
    toolId: input.toolCallId,
  });
  if (answer.type !== "response") {
    control.mirror.respondToApproval(input.toolCallId, {
      approved: false,
      reason: answer.type === "cancel" ? "Cancelled" : "Declined",
    });
    resumeStreaming(control);
    return null;
  }

  const parsed = parseQuestionResponse(input.questions, answer.response);
  control.mirror.setToolState(input.toolCallId, "output-available", {
    output: {
      answers: parsed.answers,
      ...(parsed.additionalContext
        ? { additionalContext: parsed.additionalContext }
        : {}),
      response: answer.response,
    },
  });
  resumeStreaming(control);
  return parsed;
}

/**
 * Sentinel's own approval before it acts for the agent (client writes,
 * terminals): granted by the permission mode or an earlier approval, else
 * asked on a tool card.
 */
async function requestGate(
  control: AcpRunControl,
  input: {
    content?: ExternalToolContent;
    grantKey: { editPath?: string; execute?: boolean };
    input: unknown;
    kind: ExternalToolKind;
    title: string;
  },
): Promise<boolean> {
  const disposition = resolvePermissionDisposition({
    interactive: control.interactive,
    kind: input.kind,
    permissionMode: control.permissionMode,
    toolsEnabled: control.toolsEnabled,
  });
  if (disposition === "allow") return true;
  if (disposition === "deny") return false;
  if (input.grantKey.execute && control.grants.execute !== "none") return true;
  if (
    input.grantKey.editPath &&
    control.grants.editPaths.has(input.grantKey.editPath)
  ) {
    return true;
  }

  control.nextInteractionId += 1;
  const toolId = `sentinel-gate-${control.nextInteractionId}`;
  control.mirror.requestApproval({
    approvalId: toolId,
    options: SENTINEL_GATE_OPTIONS,
    patch: {
      content: input.content ?? {},
      id: toolId,
      input: input.input,
      kind: input.kind,
      status: "pending",
      title: input.title,
    },
  });
  const answer = await waitForUser(control, {
    approvalId: toolId,
    kind: "gate",
    toolId,
  });
  const outcome =
    answer.type === "decision"
      ? selectPermissionOutcome(SENTINEL_GATE_OPTIONS, answer.decision)
      : CANCELLED_PERMISSION_OUTCOME;
  const kind = optionKind(SENTINEL_GATE_OPTIONS, outcome);
  const approved = kind?.startsWith("allow") ?? false;
  if (approved) {
    control.mirror.respondToApproval(toolId, {
      approved: true,
      ...(answer.type === "decision" ? { decision: answer.decision } : {}),
    });
    control.mirror.setToolState(toolId, "output-available", { output: {} });
    recordGrant(
      control,
      input.kind,
      input.grantKey.editPath ? [input.grantKey.editPath] : [],
      kind,
    );
  } else {
    control.mirror.respondToApproval(toolId, {
      approved: false,
      reason: answer.type === "cancel" ? "Cancelled" : "Declined",
    });
  }
  resumeStreaming(control);
  return approved;
}

function fsPolicy(control: AcpRunControl): ClientFsPolicy {
  return {
    authorizeWrite: ({ content, path, previous }) =>
      requestGate(control, {
        content: { diffs: [{ newText: content, oldText: previous, path }] },
        grantKey: { editPath: path },
        input: { path },
        kind: "edit",
        title: `Write ${path}`,
      }),
    roots: [control.workspaceRoot],
  };
}

function terminalsFor(control: AcpRunControl): ClientTerminals {
  control.terminals ??= createClientTerminals({
    authorize: ({ args, command, cwd }) =>
      requestGate(control, {
        grantKey: { execute: true },
        input: { args, command, cwd },
        kind: "execute",
        title: [command, ...args].join(" "),
      }),
    cwd: control.workspaceRoot,
    env: control.instance.env,
    instanceId: control.instance.id,
    roots: [control.workspaceRoot],
  });
  return control.terminals;
}

/** elicitation/create (form or url). */
async function handleElicitation(control: AcpRunControl, params: unknown) {
  if (!control.interactive) {
    return { action: "cancel" };
  }
  const message = readString(params, "message");
  const url = readString(params, "url");
  const mode = readString(params, "mode") ?? (url ? "url" : "form");
  control.nextInteractionId += 1;
  const toolCallId =
    readNonEmptyString(params, "elicitationId") ??
    `elicitation-${control.nextInteractionId}`;

  if (mode === "url") {
    if (!url || !isOpenableElicitationUrl(url)) {
      return { action: "decline" };
    }
    const approvalId = nextInteractionId(control, toolCallId);
    control.mirror.requestApproval({
      approvalId,
      options: [
        { kind: "allow_once", name: "Done", optionId: "accept" },
        { kind: "reject_once", name: "Decline", optionId: "decline" },
      ],
      patch: {
        id: toolCallId,
        input: { message, url },
        kind: "auth_link",
        status: "pending",
        title: message ?? "Open link",
      },
    });
    const answer = await waitForUser(control, {
      approvalId,
      elicitationId: readNonEmptyString(params, "elicitationId") ?? undefined,
      kind: "url",
      toolId: toolCallId,
    });
    const accepted = answer.type === "decision" && answer.approved;
    if (accepted) {
      control.mirror.setToolState(toolCallId, "output-available", {
        output: { completed: true },
      });
    } else {
      control.mirror.respondToApproval(toolCallId, {
        approved: false,
        reason: answer.type === "cancel" ? "Cancelled" : "Declined",
      });
    }
    resumeStreaming(control);
    return {
      action: accepted
        ? "accept"
        : answer.type === "cancel"
          ? "cancel"
          : "decline",
    };
  }

  const fields = readElicitationFields(readRecord(params, "requestedSchema"));
  const response = await askUser(control, {
    prompt: message,
    questions: fields.map((field) => field.question),
    title: message ?? "Question",
    toolCallId,
  });
  if (!response) {
    return { action: control.cancelRequested ? "cancel" : "decline" };
  }
  const content = toElicitationContent(fields, response);
  return content ? { action: "accept", content } : { action: "decline" };
}

/** The extension context vendor handlers get. */
export function extContext(control: AcpRunControl): AcpExtContext {
  return {
    askUser: (input) => askUser(control, input),
    interactive: control.interactive,
    log: (event, data) =>
      log.debug(event, {
        ...data,
        runId: control.runId,
        threadId: control.threadId,
      }),
    mirror: control.mirror,
    update: () => control.emitter.schedule(),
  };
}

/** Routes agent → client requests of one run. */
export function createRunHandlers(
  control: AcpRunControl,
  handleSessionUpdate: NonNullable<AcpProcessHandlers["onSessionUpdate"]>,
): AcpProcessHandlers {
  const methods = control.process!.methods;
  const descriptor = control.descriptor;

  return {
    async onNotification(method, params) {
      if (method === methods.elicitationComplete) {
        const elicitationId = readNonEmptyString(params, "elicitationId");
        for (const interaction of control.pending.values()) {
          if (
            interaction.kind === "url" &&
            interaction.elicitationId === elicitationId
          ) {
            interaction.settle({
              approved: true,
              decision: "accept",
              type: "decision",
            });
          }
        }
        return;
      }
      const handler = descriptor.extNotifications?.[method];
      if (handler) {
        await handler(params, extContext(control));
      }
    },

    async onRequest(method, params) {
      switch (method) {
        case methods.requestPermission:
          return await handlePermissionRequest(control, params);
        case methods.elicitationCreate:
          return await handleElicitation(control, params);
        case methods.fsReadTextFile:
          if (!descriptor.clientFs) break;
          return await readClientTextFile(params, fsPolicy(control));
        case methods.fsWriteTextFile:
          if (!descriptor.clientFs) break;
          return await writeClientTextFile(params, fsPolicy(control));
        case methods.terminalCreate:
          if (!descriptor.clientTerminals) break;
          return await terminalsFor(control).create(params);
        case methods.terminalOutput:
          if (!descriptor.clientTerminals) break;
          return terminalsFor(control).output(params);
        case methods.terminalWaitForExit:
          if (!descriptor.clientTerminals) break;
          return await terminalsFor(control).waitForExit(params);
        case methods.terminalKill:
          if (!descriptor.clientTerminals) break;
          return await terminalsFor(control).kill(params);
        case methods.terminalRelease:
          if (!descriptor.clientTerminals) break;
          return await terminalsFor(control).release(params);
        default: {
          const request = descriptor.extRequests?.[method];
          if (request) {
            return await request(params, extContext(control));
          }
          const notification = descriptor.extNotifications?.[method];
          if (notification) {
            await notification(params, extContext(control));
            return {};
          }
        }
      }
      throw RequestError.methodNotFound(method);
    },

    onSessionUpdate: handleSessionUpdate,
  };
}

/** A submitted approval or answer, as the interaction it settles expects. */
export function toInteractionAnswer(
  kind: "gate" | "permission" | "question" | "url",
  response: {
    approved: boolean;
    decision?: string;
    reason?: string;
    response?: string;
  },
): InteractionAnswer | null {
  if (kind === "question") {
    const text = response.response?.trim();
    if (text) {
      return { response: text, type: "response" };
    }
    return response.approved
      ? null
      : { approved: false, decision: "decline", type: "decision" };
  }
  return {
    approved: response.approved,
    decision: toExternalDecision(response),
    ...(response.reason ? { reason: response.reason } : {}),
    type: "decision",
  };
}
