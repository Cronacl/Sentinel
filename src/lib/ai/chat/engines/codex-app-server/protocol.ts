// Pure Codex app-server protocol helpers (no process or persistence access) so
// the engine, the runtime mirror and the tests share one wire mapping. Shapes
// follow codex-rs/app-server-protocol at rust-v0.160.1.
import packageJson from "../../../../../../package.json";

export const CODEX_CLIENT_NAME = "sentinel";
export const CODEX_CLIENT_TITLE = "Sentinel";

/**
 * Notifications Sentinel never consumes. `turn/diff/updated` re-sends the full
 * turn diff on every change, so opting out saves the largest payloads.
 */
export const CODEX_OPT_OUT_NOTIFICATION_METHODS = Object.freeze([
  "turn/diff/updated",
]);

/**
 * The protocol baseline this engine targets: `thread/revert` replaced
 * count-based rollback in 0.156, and `experimentalApi` (needed for
 * `turn/start.collaborationMode`) is negotiated through `initialize`.
 */
export const CODEX_PROTOCOL_BASELINE_VERSION = "0.156.0";

export const CODEX_ALREADY_INITIALIZED_ERROR_CODE = -32600;
export const CODEX_METHOD_NOT_FOUND_ERROR_CODE = -32601;

export function getSentinelClientVersion() {
  return typeof packageJson.version === "string" && packageJson.version
    ? packageJson.version
    : "0.0.0";
}

export function buildCodexInitializeParams() {
  return {
    capabilities: {
      experimentalApi: true,
      optOutNotificationMethods: [...CODEX_OPT_OUT_NOTIFICATION_METHODS],
    },
    clientInfo: {
      name: CODEX_CLIENT_NAME,
      title: CODEX_CLIENT_TITLE,
      version: getSentinelClientVersion(),
    },
  };
}

export function isCodexAlreadyInitializedError(error: {
  code?: unknown;
  message?: unknown;
}) {
  return (
    error.code === CODEX_ALREADY_INITIALIZED_ERROR_CODE &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("already initialized")
  );
}

/**
 * Reads the semver out of `initialize.userAgent` (for example
 * `codex_cli_rs/0.160.1 (Mac OS 26.1.0; arm64) …`) or `codex --version`
 * output (`codex-cli 0.160.1`).
 */
export function parseCodexVersion(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function compareCodexVersions(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number(part) || 0);
  const rightParts = right.split(".").map((part) => Number(part) || 0);

  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }

  return 0;
}

/**
 * Unknown versions are treated as current: only a CLI that reports a version
 * below the baseline gets the legacy fallbacks.
 */
export function isCodexVersionAtLeast(
  version: string | null | undefined,
  minimum: string,
) {
  const parsed = parseCodexVersion(version);
  if (!parsed) {
    return true;
  }

  return compareCodexVersions(parsed, minimum) >= 0;
}

export const CODEX_APPROVAL_REQUEST_METHODS = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/permissions/requestApproval",
  "mcpServer/elicitation/request",
  // Deprecated v1 requests; 0.160 still defines them for legacy turn APIs.
  "execCommandApproval",
  "applyPatchApproval",
] as const;

export type CodexApprovalRequestMethod =
  (typeof CODEX_APPROVAL_REQUEST_METHODS)[number];

export const CODEX_USER_INPUT_REQUEST_METHODS = [
  "item/tool/requestUserInput",
  // Pre-v2 name with a single free-form `prompt`.
  "tool/requestUserInput",
] as const;

export type CodexUserInputRequestMethod =
  (typeof CODEX_USER_INPUT_REQUEST_METHODS)[number];

export function isCodexApprovalRequestMethod(
  method: string,
): method is CodexApprovalRequestMethod {
  return (CODEX_APPROVAL_REQUEST_METHODS as readonly string[]).includes(method);
}

export function isCodexUserInputRequestMethod(
  method: string,
): method is CodexUserInputRequestMethod {
  return (CODEX_USER_INPUT_REQUEST_METHODS as readonly string[]).includes(
    method,
  );
}

export type CodexApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "acceptWithExecpolicyAmendment"
  | "cancel"
  | "decline";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isApprovingDecision(decision: CodexApprovalDecision) {
  return (
    decision === "accept" ||
    decision === "acceptForSession" ||
    decision === "acceptWithExecpolicyAmendment"
  );
}

function toCommandExecutionDecision(
  params: Record<string, unknown> | null,
  decision: CodexApprovalDecision,
) {
  if (decision !== "acceptWithExecpolicyAmendment") {
    return decision;
  }

  // The amendment variant is an object on the wire; without a proposed
  // amendment there is nothing to persist, so it degrades to a plain accept.
  const amendment = params?.proposedExecpolicyAmendment;
  return Array.isArray(amendment)
    ? { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } }
    : "accept";
}

// Ported from t3code (MIT), apps/server/src/orchestration-v2/Adapters/
// CodexAdapterV2.ts `approvalDecisionToLegacyReviewDecision`.
function toLegacyReviewDecision(decision: CodexApprovalDecision) {
  switch (decision) {
    case "accept":
    case "acceptWithExecpolicyAmendment":
      return "approved";
    case "acceptForSession":
      return "approved_for_session";
    case "cancel":
      return "abort";
    case "decline":
      return { denied: { rejection: "User declined the request." } };
  }
}

// Ported from t3code (MIT), CodexAdapterV2.ts `permissionsResponseFromDecision`.
function toPermissionsResponse(
  params: Record<string, unknown> | null,
  decision: CodexApprovalDecision,
) {
  if (!isApprovingDecision(decision)) {
    return { permissions: {}, scope: "turn" as const };
  }

  return {
    permissions: asRecord(params?.permissions) ?? {},
    scope:
      decision === "acceptForSession"
        ? ("session" as const)
        : ("turn" as const),
  };
}

type McpElicitationField = {
  default?: unknown;
  description?: string | null;
  enum?: string[] | null;
  enumNames?: string[] | null;
  oneOf?: Array<{ const: string; title?: string | null }> | null;
  title?: string | null;
  type?: string | null;
};

type McpElicitationForm = {
  properties?: Record<string, McpElicitationField>;
  required?: string[] | null;
};

type McpPersistenceDecision = "acceptAlways" | "acceptForSession";

function mcpElicitationPersistenceDecision(
  value: string,
): McpPersistenceDecision | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("session")) return "acceptForSession";
  if (
    normalized.includes("always") ||
    normalized.includes("permanent") ||
    normalized.includes("forever") ||
    normalized.includes("persistent")
  ) {
    return "acceptAlways";
  }
  return null;
}

function getMcpElicitationForm(
  params: Record<string, unknown> | null,
): McpElicitationForm | undefined {
  if (!params || params.mode === "url") {
    return undefined;
  }

  const schema = asRecord(params.requestedSchema);
  if (!schema) {
    return undefined;
  }

  const properties = asRecord(schema.properties);
  return {
    properties: (properties ?? {}) as Record<string, McpElicitationField>,
    required: Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : null,
  };
}

function getMcpElicitationFieldOptions(field: McpElicitationField) {
  if (Array.isArray(field.oneOf)) {
    return field.oneOf.map((option) => ({
      label: option.title ?? undefined,
      value: option.const,
    }));
  }

  return (field.enum ?? []).map((value, index) => ({
    label: field.enumNames?.[index],
    value,
  }));
}

function isMcpElicitationPersistenceField(
  key: string,
  field: McpElicitationField,
) {
  return (
    mcpElicitationPersistenceDecision(key) !== null ||
    key.toLowerCase() === "persist" ||
    mcpElicitationPersistenceDecision(field.title ?? "") !== null ||
    mcpElicitationPersistenceDecision(field.description ?? "") !== null
  );
}

/**
 * Converts an approval decision into the `mcpServer/elicitation/request`
 * response. Ported from t3code (MIT),
 * apps/server/src/provider/CodexMcpElicitation.ts `toMcpElicitationResponse`.
 * URL-mode and user-verification elicitations cannot be completed in
 * Sentinel, so an accept on those is sent as a decline.
 */
export function toCodexMcpElicitationResponse(
  paramsValue: unknown,
  decision: CodexApprovalDecision,
) {
  const params = asRecord(paramsValue);
  if (decision === "decline" || decision === "cancel") {
    return { action: decision };
  }

  if (
    params?.mode === "url" ||
    params?.mode === "openai/userVerification" ||
    !params
  ) {
    return { action: "decline" as const };
  }

  // Sentinel offers no "always allow" choice, so only session persistence
  // is ever requested.
  const persist = decision === "acceptForSession" ? "session" : undefined;
  const form = getMcpElicitationForm(params);
  const content: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(form?.properties ?? {})) {
    if (!field || typeof field !== "object") {
      continue;
    }

    const options = getMcpElicitationFieldOptions(field);
    const chosenOption = options.find((option) =>
      persist
        ? mcpElicitationPersistenceDecision(option.value) === "acceptForSession"
        : /once|accept|approve|allow/i.test(option.value) &&
          mcpElicitationPersistenceDecision(option.value) === null,
    );
    if (chosenOption) {
      content[key] = chosenOption.value;
    } else if (
      field.type === "boolean" &&
      isMcpElicitationPersistenceField(key, field)
    ) {
      content[key] = false;
    } else if (field.default !== undefined && field.default !== null) {
      content[key] = field.default;
    }
  }

  if (form?.required?.some((key) => !Object.hasOwn(content, key))) {
    return { action: "decline" as const };
  }

  return {
    action: "accept" as const,
    ...(persist ? { _meta: { persist } } : {}),
    ...(form ? { content } : {}),
  };
}

/**
 * Why an accepted MCP elicitation was answered with a decline, or null when
 * the reply carries the user's decision. Sentinel's Allow/Deny card cannot
 * open URLs, run user verification or fill required form fields.
 */
export function getCodexMcpElicitationDeclineReason(
  paramsValue: unknown,
  decision: CodexApprovalDecision,
) {
  if (decision === "decline" || decision === "cancel") {
    return null;
  }

  if (
    toCodexMcpElicitationResponse(paramsValue, decision).action !== "decline"
  ) {
    return null;
  }

  switch (asRecord(paramsValue)?.mode) {
    case "url":
      return "Sentinel cannot open MCP sign-in links yet, so the request was declined.";
    case "openai/userVerification":
      return "Sentinel cannot complete MCP user verification yet, so the request was declined.";
    default:
      return "Sentinel cannot fill in this MCP form yet, so the request was declined.";
  }
}

/**
 * Builds the JSON-RPC `result` for an approval-style server request.
 */
export function buildCodexApprovalResult(
  method: CodexApprovalRequestMethod,
  paramsValue: unknown,
  decision: CodexApprovalDecision,
) {
  const params = asRecord(paramsValue);

  switch (method) {
    case "item/commandExecution/requestApproval":
      return { decision: toCommandExecutionDecision(params, decision) };
    case "item/fileChange/requestApproval":
      return {
        decision:
          decision === "acceptWithExecpolicyAmendment" ? "accept" : decision,
      };
    case "item/permissions/requestApproval":
      return toPermissionsResponse(params, decision);
    case "mcpServer/elicitation/request":
      return toCodexMcpElicitationResponse(params, decision);
    case "execCommandApproval":
    case "applyPatchApproval":
      return { decision: toLegacyReviewDecision(decision) };
  }
}

export type CodexUserInputQuestion = {
  header: string;
  id: string;
  isOther: boolean;
  isSecret: boolean;
  options: Array<{ description: string; label: string }>;
  question: string;
};

export function parseCodexUserInputQuestions(
  paramsValue: unknown,
): CodexUserInputQuestion[] {
  const params = asRecord(paramsValue);
  if (!params || !Array.isArray(params.questions)) {
    return [];
  }

  return params.questions.flatMap((value) => {
    const question = asRecord(value);
    if (!question || typeof question.id !== "string") {
      return [];
    }

    const options = Array.isArray(question.options)
      ? question.options.flatMap((optionValue) => {
          const option = asRecord(optionValue);
          if (!option || typeof option.label !== "string") {
            return [];
          }

          return [
            {
              description:
                typeof option.description === "string"
                  ? option.description
                  : "",
              label: option.label,
            },
          ];
        })
      : [];

    return [
      {
        header: typeof question.header === "string" ? question.header : "",
        id: question.id,
        isOther: question.isOther === true,
        isSecret: question.isSecret === true,
        options,
        question:
          typeof question.question === "string" ? question.question : "",
      },
    ];
  });
}

function formatCodexUserInputQuestion(question: CodexUserInputQuestion) {
  const title = [question.header.trim(), question.question.trim()]
    .filter(Boolean)
    .join(": ");
  const options = question.options.map(
    (option, index) =>
      `  ${index + 1}. ${option.label}${
        option.description.trim() ? ` - ${option.description.trim()}` : ""
      }`,
  );

  return [title || question.id, ...options].join("\n");
}

/**
 * Renders the request as one free-form prompt for the existing
 * `codex_user_input` renderer. Legacy requests carry `prompt` directly.
 */
export function buildCodexUserInputPrompt(paramsValue: unknown) {
  const questions = parseCodexUserInputQuestions(paramsValue);
  if (questions.length === 1) {
    return formatCodexUserInputQuestion(questions[0]!);
  }

  if (questions.length > 1) {
    return [
      ...questions.map(
        (question, index) =>
          `${index + 1}) ${formatCodexUserInputQuestion(question)}`,
      ),
      "Answer each question on its own line, starting with its number (for example `1: your answer`).",
    ].join("\n\n");
  }

  const params = asRecord(paramsValue);
  return typeof params?.prompt === "string" && params.prompt.trim()
    ? params.prompt
    : "Codex is requesting input";
}

function resolveCodexUserInputAnswer(
  question: CodexUserInputQuestion,
  rawAnswer: string,
) {
  const answer = rawAnswer.trim();
  const optionIndex = /^\d+$/.test(answer) ? Number(answer) - 1 : -1;
  const byIndex = question.options[optionIndex];
  if (byIndex) {
    return byIndex.label;
  }

  const normalized = answer.toLowerCase();
  return (
    question.options.find((option) => option.label.toLowerCase() === normalized)
      ?.label ?? answer
  );
}

function matchCodexUserInputLineKey(
  questions: CodexUserInputQuestion[],
  key: string,
) {
  const normalized = key.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return questions[Number(normalized) - 1] ?? null;
  }

  return (
    questions.find(
      (question) =>
        question.id.toLowerCase() === normalized ||
        question.header.trim().toLowerCase() === normalized ||
        question.question.trim().toLowerCase() === normalized,
    ) ?? null
  );
}

/**
 * Maps the free-form response from the composer onto
 * `ToolRequestUserInputResponse.answers` (`{[questionId]: {answers}}`).
 * A single question takes the whole response; several questions read
 * `1: answer` / `<header>: answer` lines, then fall back to line order, then
 * to the whole response for every question.
 */
export function mapCodexUserInputAnswers(
  questions: CodexUserInputQuestion[],
  response: string,
): Record<string, { answers: string[] }> {
  const trimmed = response.trim();
  if (questions.length === 1) {
    const question = questions[0]!;
    return {
      [question.id]: {
        answers: [resolveCodexUserInputAnswer(question, trimmed)],
      },
    };
  }

  const answers = new Map<string, string>();
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const unkeyedLines: string[] = [];

  for (const line of lines) {
    const match =
      line.match(/^(.+?)\s*[:.)]\s+(.+)$/) ??
      line.match(/^(\d+)\s*[:.)]\s*(.+)$/);
    const question = match
      ? matchCodexUserInputLineKey(questions, match[1] ?? "")
      : null;
    if (question && match?.[2]) {
      answers.set(question.id, match[2]);
      continue;
    }
    unkeyedLines.push(line);
  }

  if (answers.size === 0 && unkeyedLines.length === questions.length) {
    questions.forEach((question, index) => {
      answers.set(question.id, unkeyedLines[index]!);
    });
  }

  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      {
        answers: [
          resolveCodexUserInputAnswer(
            question,
            answers.get(question.id) ?? trimmed,
          ),
        ],
      },
    ]),
  );
}

/**
 * The `result` that declines a server request nobody can answer: approvals
 * are declined and questions get no answers. Sent for requests no run
 * listens to, and in unattended runs (automations).
 */
export function buildCodexDeclinedServerRequestResult(
  method: CodexApprovalRequestMethod | CodexUserInputRequestMethod,
  paramsValue: unknown,
) {
  if (isCodexApprovalRequestMethod(method)) {
    return buildCodexApprovalResult(method, paramsValue, "decline");
  }

  return method === "tool/requestUserInput"
    ? { response: "" }
    : { answers: {} };
}

export function buildCodexUserInputResult(
  method: CodexUserInputRequestMethod,
  paramsValue: unknown,
  response: string,
) {
  if (method === "tool/requestUserInput") {
    return { response };
  }

  return {
    answers: mapCodexUserInputAnswers(
      parseCodexUserInputQuestions(paramsValue),
      response,
    ),
  };
}

type CodexTurnsListPage = {
  data?: Array<{ id?: unknown }>;
  nextCursor?: string | null;
};

const CODEX_TURNS_PAGE_LIMIT = 100;

/**
 * Codex 0.156 replaced count-based `thread/rollback` with a boundary turn in
 * paginated history: page `thread/turns/list` newest-first until `numTurns`
 * turns are seen, then `thread/revert` before the oldest of them. Ported from
 * t3code (MIT), apps/server/src/provider/CodexThreadRevert.ts.
 */
export async function revertCodexThreadTurns(
  request: (method: string, params: unknown) => Promise<unknown>,
  threadId: string,
  numTurns: number,
) {
  let remaining = Math.max(0, Math.floor(numTurns));
  let beforeTurnId: string | undefined;
  let cursor: string | null = null;
  const visited = new Set<string | null>();

  while (remaining > 0) {
    if (visited.has(cursor)) {
      throw new Error("Codex thread history pagination repeated a cursor.");
    }
    visited.add(cursor);

    const page = (await request("thread/turns/list", {
      cursor,
      itemsView: "summary",
      limit: Math.min(remaining, CODEX_TURNS_PAGE_LIMIT),
      sortDirection: "desc",
      threadId,
    })) as CodexTurnsListPage | null;

    for (const turn of page?.data ?? []) {
      if (typeof turn?.id !== "string") {
        continue;
      }
      beforeTurnId = turn.id;
      remaining -= 1;
      if (remaining === 0) break;
    }

    cursor = page?.nextCursor ?? null;
    if (cursor === null) break;
  }

  if (beforeTurnId === undefined) {
    return {
      reverted: false as const,
      response: await request("thread/read", { includeTurns: false, threadId }),
    };
  }

  return {
    beforeTurnId,
    reverted: true as const,
    response: await request("thread/revert", { beforeTurnId, threadId }),
  };
}
