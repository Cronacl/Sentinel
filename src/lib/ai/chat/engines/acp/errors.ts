import { asRecord, type AcpAuthMethodInfo } from "./schema";

// Errors the ACP engine raises and how agent errors are classified. ACP's
// auth-required error is JSON-RPC -32000 (RequestError.authRequired); some
// agents only say so in the message.

export const ACP_AUTH_REQUIRED_CODE = -32000;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_METHOD_NOT_FOUND = -32601;
/** ACP resource-not-found (an unknown session id). */
export const ACP_RESOURCE_NOT_FOUND = -32002;

const AUTH_MESSAGE_PATTERN =
  /\bauth(?:entication|enticate|orization)?\b|\blog ?in\b|unauthori[sz]ed|credentials|not (?:signed|logged) in/i;
const UNKNOWN_SESSION_PATTERN =
  /session[^.]*\b(?:not found|unknown|does not exist|no longer exists|expired|invalid)\b|\b(?:unknown|invalid|missing|no such) session\b/i;

export function getRpcErrorCode(error: unknown): number | null {
  const code = asRecord(error)?.code;
  return typeof code === "number" ? code : null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const message = asRecord(error)?.message;
  return typeof message === "string" ? message : String(error);
}

/** The agent refused because the user is not signed in. */
export function isAuthRequiredError(error: unknown) {
  if (error instanceof AcpAuthRequiredError) {
    return true;
  }
  const code = getRpcErrorCode(error);
  if (code === ACP_AUTH_REQUIRED_CODE) {
    return true;
  }
  return code == null || code === -32603
    ? AUTH_MESSAGE_PATTERN.test(getErrorMessage(error))
    : false;
}

/** A load or resume of a session id the agent no longer knows. */
export function isUnknownSessionError(error: unknown) {
  const code = getRpcErrorCode(error);
  return (
    code === ACP_RESOURCE_NOT_FOUND ||
    code === JSON_RPC_INVALID_PARAMS ||
    UNKNOWN_SESSION_PATTERN.test(getErrorMessage(error))
  );
}

export function isMethodNotFoundError(error: unknown) {
  return getRpcErrorCode(error) === JSON_RPC_METHOD_NOT_FOUND;
}

/**
 * The agent needs a sign-in Sentinel cannot do inside this run: an
 * unattended run, a terminal login (handed to the auth flow), or an
 * environment variable to set on the instance.
 */
export class AcpAuthRequiredError extends Error {
  readonly methods: AcpAuthMethodInfo[];

  constructor(message: string, methods: AcpAuthMethodInfo[] = []) {
    super(message);
    this.name = "AcpAuthRequiredError";
    this.methods = methods;
  }
}

export class AcpProcessExitedError extends Error {
  readonly code: number | null;
  readonly signal: string | null;
  readonly stderrTail: string;

  constructor(input: {
    code: number | null;
    label: string;
    signal: string | null;
    stderrTail: string;
  }) {
    super(
      [
        `${input.label} exited unexpectedly`,
        input.code != null ? `with code ${input.code}` : null,
        input.signal ? `(${input.signal})` : null,
      ]
        .filter(Boolean)
        .join(" ") + (input.stderrTail ? `: ${input.stderrTail}` : "."),
    );
    this.name = "AcpProcessExitedError";
    this.code = input.code;
    this.signal = input.signal;
    this.stderrTail = input.stderrTail;
  }
}

export class AcpRequestTimeoutError extends Error {
  readonly method: string;

  constructor(method: string, timeoutMs: number) {
    super(`The agent did not answer ${method} within ${timeoutMs / 1000}s.`);
    this.name = "AcpRequestTimeoutError";
    this.method = method;
  }
}

/** The caller aborted the request (Stop, a probe abort); `cause` is the abort reason. */
export class AcpRequestCancelledError extends Error {
  readonly method: string;

  constructor(method: string, options?: { cause?: unknown }) {
    super(`${method} was cancelled.`, options);
    this.name = "AcpRequestCancelledError";
    this.method = method;
  }
}

export class AcpProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcpProtocolError";
  }
}
