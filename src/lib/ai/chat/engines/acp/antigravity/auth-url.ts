import "server-only";

import http from "node:http";

import { AUTH_URL_MARKER } from "@/lib/ai/chat/engines/platform/auth/browser-helper";

import type { AcpAgentProcess } from "../connection";

// Antigravity's Google sign-in (design acp-and-agents §3.3; ported from
// t3code apps/server/src/provider/{antigravityAuthSupport,antigravityCallback}.ts,
// MIT). `authenticate` makes the agent print its Google authorization URL
// on stdout ("Open the following link…") or hand it to $BROWSER, which is
// Sentinel's helper printing it behind a marker on stderr. The URL must be
// Google's OAuth endpoint with exactly one loopback redirect_uri; the agent
// listens there for the redirect. A user signing in on another machine
// pastes the redirect URL back, which is validated against the pending
// request and replayed to that listener.

export const ANTIGRAVITY_AUTH_STDOUT_PREFIX =
  "Open the following link to authenticate the ACP server: ";
export const ANTIGRAVITY_SIGN_IN_REQUIRED_MESSAGE =
  "Antigravity needs you to sign in with Google: open Settings > Engines > Antigravity and choose Sign in, then retry.";

const MAX_URL_LENGTH = 16_384;
const MAX_LINE_LENGTH =
  Math.max(AUTH_URL_MARKER.length, ANTIGRAVITY_AUTH_STDOUT_PREFIX.length) +
  MAX_URL_LENGTH +
  2;
const REDIRECT_PATTERN = /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/$/;
const GOOGLE_ISSUER = "https://accounts.google.com";
const FORWARD_TIMEOUT_MS = 10_000;

export type AntigravityAuthorizationRequest = {
  authorizationUrl: string;
  redirectUri: string;
  state: string;
};

/** Google's authorization request with one loopback redirect, else null. */
export function parseAntigravityAuthorizationUrl(
  value: string,
): AntigravityAuthorizationRequest | null {
  if (value.length > MAX_URL_LENGTH || /\s/.test(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const params = url.searchParams;
  const state = params.get("state");
  const redirectUri = params.get("redirect_uri");
  if (
    url.origin !== GOOGLE_ISSUER ||
    url.pathname !== "/o/oauth2/v2/auth" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    params.getAll("state").length !== 1 ||
    params.getAll("redirect_uri").length !== 1 ||
    params.getAll("response_type").length !== 1 ||
    params.get("response_type") !== "code" ||
    !state ||
    state.length > 512 ||
    /\s/.test(state) ||
    !redirectUri ||
    !REDIRECT_PATTERN.test(redirectUri)
  ) {
    return null;
  }
  // The pattern lets through ports above 65535, which `new URL` rejects:
  // this runs inside the agent's output handlers, so it must not throw.
  const port = Number(redirectUri.slice("http://127.0.0.1:".length, -1));
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    return null;
  }
  return { authorizationUrl: value, redirectUri, state };
}

/** The authorization request one agent output line carries, else null. */
export function readAntigravityAuthLine(
  rawLine: string,
): AntigravityAuthorizationRequest | null {
  const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
  if (line.length > MAX_LINE_LENGTH) {
    return null;
  }
  if (line.startsWith(ANTIGRAVITY_AUTH_STDOUT_PREFIX)) {
    return parseAntigravityAuthorizationUrl(
      line.slice(ANTIGRAVITY_AUTH_STDOUT_PREFIX.length).trim(),
    );
  }
  const index = line.indexOf(AUTH_URL_MARKER);
  if (index === -1) {
    return null;
  }
  const rest = line.slice(index + AUTH_URL_MARKER.length).trim();
  if (!rest.startsWith('"') || !rest.endsWith('"') || rest.length < 3) {
    return null;
  }
  return parseAntigravityAuthorizationUrl(rest.slice(1, -1));
}

const CAPTURED_KEY = "antigravity.authRequest";
const LISTENERS_KEY = "antigravity.authListeners";

type AuthListener = (request: AntigravityAuthorizationRequest) => void;

function listenersOf(process: AcpAgentProcess) {
  let listeners = process.state.get(LISTENERS_KEY) as
    Set<AuthListener> | undefined;
  if (!listeners) {
    listeners = new Set();
    process.state.set(LISTENERS_KEY, listeners);
  }
  return listeners;
}

/** Records a sign-in URL found in an agent line (the descriptor's line handlers). */
export function captureAntigravityAuthLine(
  process: AcpAgentProcess,
  line: string,
) {
  const request = readAntigravityAuthLine(line);
  if (!request) {
    return;
  }
  process.state.set(CAPTURED_KEY, request);
  for (const listener of [...listenersOf(process)]) {
    listener(request);
  }
}

/** Calls `listener` with the process's sign-in request (now, or once it appears). */
export function onAntigravityAuthRequest(
  process: AcpAgentProcess,
  listener: AuthListener,
) {
  const listeners = listenersOf(process);
  listeners.add(listener);
  const captured = process.state.get(CAPTURED_KEY) as
    AntigravityAuthorizationRequest | undefined;
  if (captured) {
    listener(captured);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function forgetAntigravityAuthRequest(process: AcpAgentProcess) {
  process.state.delete(CAPTURED_KEY);
}

/** A pasted callback URL that is not this sign-in's Google redirect. */
export class AntigravityCallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AntigravityCallbackError";
  }
}

/**
 * The pasted redirect URL when it belongs to the pending sign-in: the same
 * loopback origin and path, the same state, exactly one code or error, and
 * Google as the issuer when one is named.
 */
export function validateAntigravityCallbackUrl(
  pending: Pick<AntigravityAuthorizationRequest, "redirectUri" | "state">,
  callbackUrl: string,
): URL {
  const value = callbackUrl.trim();
  if (value.length > MAX_URL_LENGTH) {
    throw new AntigravityCallbackError("The redirect URL is too long.");
  }
  let callback: URL;
  try {
    callback = new URL(value);
  } catch {
    throw new AntigravityCallbackError(
      "Paste the complete address from the page Google sent you to.",
    );
  }
  const expected = new URL(pending.redirectUri);
  const foreign = new AntigravityCallbackError(
    "This redirect URL does not belong to the current sign-in.",
  );
  if (
    callback.protocol !== "http:" ||
    callback.hostname !== "127.0.0.1" ||
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname ||
    callback.username !== "" ||
    callback.password !== "" ||
    callback.hash !== ""
  ) {
    throw foreign;
  }
  const params = callback.searchParams;
  const states = params.getAll("state");
  if (states.length !== 1 || states[0] !== pending.state) {
    throw foreign;
  }
  const codes = params.getAll("code");
  const errors = params.getAll("error");
  const single =
    (codes.length === 1 && Boolean(codes[0]) && errors.length === 0) ||
    (errors.length === 1 && Boolean(errors[0]) && codes.length === 0);
  if (!single) {
    throw new AntigravityCallbackError(
      "The redirect URL must contain one Google sign-in response.",
    );
  }
  const issuers = params.getAll("iss");
  if (
    issuers.length > 1 ||
    (issuers.length === 1 && issuers[0] !== GOOGLE_ISSUER)
  ) {
    throw new AntigravityCallbackError(
      "The redirect URL is not a Google sign-in response.",
    );
  }
  return callback;
}

/**
 * Replays a validated redirect to the agent's loopback listener: one GET,
 * no proxy, no redirects, the response body discarded. The whole exchange
 * is bounded (not only socket idle time).
 */
export function forwardAntigravityCallback(
  callback: URL,
  options: { timeoutMs?: number } = {},
) {
  return new Promise<void>((resolve, reject) => {
    const failed = () =>
      new AntigravityCallbackError(
        "Sentinel could not deliver the sign-in response. Start the sign-in again.",
      );
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const request = http.request(
      {
        agent: false,
        hostname: callback.hostname,
        method: "GET",
        path: `${callback.pathname}${callback.search}`,
        port: callback.port,
        protocol: "http:",
      },
      (response) => {
        response.once("error", () => finish(failed()));
        response.once("end", () => {
          const status = response.statusCode ?? 0;
          finish(status >= 200 && status < 300 ? undefined : failed());
        });
        response.resume();
      },
    );
    const timer = setTimeout(() => {
      // Ends the response too (it reads from the request's socket).
      request.destroy();
      finish(failed());
    }, options.timeoutMs ?? FORWARD_TIMEOUT_MS);
    request.once("error", () => finish(failed()));
    request.end();
  });
}
