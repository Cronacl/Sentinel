import "server-only";

import { type ChildProcessByStdio } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import type { Readable } from "node:stream";

import { terminateProcessTree } from "@/lib/runtime/process/kill-tree";
import { spawnManagedProcess } from "@/lib/runtime/process/spawn";

import { probeOpenCodeServer, type OpenCodeGeneration } from "./version";

// One `opencode serve` process (design acp-and-agents §5). The pool
// (server-pool.ts) keeps one per instance alive between turns; status
// probes start a short-lived one when none is running.
//
// - Command: `serve --hostname=127.0.0.1 --port=<free>`.
// - Password: a fresh one per spawn. 1.x reads OPENCODE_SERVER_PASSWORD;
//   2.x reads OPENCODE_PASSWORD, which wins over the 1.x variable there, so
//   the inherited 1.x variable is dropped (t3code OpenCode2Server.ts).
//   When the generation is not known yet both are set. Auth is HTTP Basic
//   with user `opencode`.
// - Readiness: HTTP polling of `/api/info` (2.x) and `/global/health`
//   (1.x), JSON answers only, which also tells the generation. The stdout
//   readiness line only triggers an early poll.

// `opencode serve` prints "opencode server listening on http://…" (1.x) or
// "server listening on http://…" (2.x). Matched loosely, like t3code's
// opencodeRuntime.ts, so a log prefix cannot break startup.
const OPENCODE_SERVER_READY_PATTERN = /server listening on\s+(https?:\/\/\S+)/i;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const OPENCODE_EXIT_STDERR_GRACE_MS = 250;

export const OPENCODE_SERVER_HOSTNAME = "127.0.0.1";
// Basic-auth user; set explicitly so an inherited OPENCODE_SERVER_USERNAME
// cannot desynchronize server and client.
export const OPENCODE_SERVER_USERNAME = "opencode";
const OPENCODE_READY_POLL_INTERVAL_MS = 100;
const OPENCODE_SERVER_KILL_GRACE_MS = 2_000;
const OPENCODE_SERVER_OUTPUT_MAX_CHARS = 64 * 1024;
// Default bound for a server start, matching t3code's
// DEFAULT_OPENCODE_SERVER_TIMEOUT_MS. A warm start is ~1 s, but the first
// launch of a freshly installed ~120 MB binary can sit in Gatekeeper or
// Defender scanning for several seconds.
export const OPENCODE_SERVER_START_TIMEOUT_MS = 30_000;

export type OpenCodeServerExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type OpenCodeServerProcess = {
  /** `Basic …` header for the per-spawn password. */
  authorization: string;
  /** Ends the server (process group); idempotent. */
  close: () => void;
  exited: Promise<OpenCodeServerExit>;
  /** Confirmed over HTTP at startup. */
  generation: OpenCodeGeneration;
  hasExited: () => boolean;
  password: string;
  pid: number | null;
  stderr: () => string;
  stdout: () => string;
  url: string;
  /** What the server reported at startup. */
  version: string;
};

export function buildOpenCodeServerAuthorization(password: string) {
  // OpenCode decodes Basic credentials as UTF-8 (t3code OpenCode2Client.ts).
  return `Basic ${Buffer.from(
    `${OPENCODE_SERVER_USERNAME}:${password}`,
    "utf8",
  ).toString("base64")}`;
}

/** The environment for a spawned server of `generation` (null: unknown). */
export function buildOpenCodeServerEnv(
  baseEnv: NodeJS.ProcessEnv,
  generation: OpenCodeGeneration | null,
  password: string,
): NodeJS.ProcessEnv {
  const {
    OPENCODE_SERVER_PASSWORD: _v1,
    OPENCODE_PASSWORD: _v2,
    ...rest
  } = baseEnv;
  return {
    ...rest,
    // Keep a caller's or the user's OPENCODE_CONFIG_CONTENT; forcing "{}"
    // clobbered it (t3code resolveOpenCodeConfigContent).
    OPENCODE_CONFIG_CONTENT: baseEnv.OPENCODE_CONFIG_CONTENT ?? "{}",
    ...(generation !== "v2"
      ? {
          OPENCODE_SERVER_PASSWORD: password,
          OPENCODE_SERVER_USERNAME,
        }
      : {}),
    ...(generation !== "v1" ? { OPENCODE_PASSWORD: password } : {}),
  };
}

async function findAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, OPENCODE_SERVER_HOSTNAME, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("Unable to reserve a local OpenCode server port."));
      });
    });
  });
}

// Only complete lines count: a chunk can end mid-URL, and matching that
// partial line would hand back a truncated address.
export function parseOpenCodeServerUrl(output: string) {
  const lines = output.split(/\r?\n/);
  lines.pop();
  for (const line of lines) {
    const match = line
      .replace(ANSI_ESCAPE_PATTERN, "")
      .match(OPENCODE_SERVER_READY_PATTERN);
    if (match?.[1]) return match[1];
  }
  return null;
}

type OpenCodeServerChild = ChildProcessByStdio<null, Readable, Readable>;

function hasChildExited(child: OpenCodeServerChild) {
  return child.exitCode !== null || child.signalCode !== null;
}

function appendCappedOutput(current: string, chunk: string | Buffer) {
  const next = current + String(chunk);
  return next.length > OPENCODE_SERVER_OUTPUT_MAX_CHARS
    ? next.slice(-OPENCODE_SERVER_OUTPUT_MAX_CHARS)
    : next;
}

export async function startOpenCodeServerProcess(input: {
  binaryPath: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** From `--version`; null when unknown (both passwords are then set). */
  generation?: OpenCodeGeneration | null;
  /** Recorded in the pid registry. */
  instanceId?: string | null;
  /** Aborting it before the server is ready kills the server. */
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<OpenCodeServerProcess> {
  const cancelled = () => new Error("OpenCode server start was cancelled.");
  if (input.signal?.aborted) {
    throw cancelled();
  }
  const port = await findAvailablePort();
  if (input.signal?.aborted) {
    throw cancelled();
  }
  // A fresh password per server: the server only accepts Sentinel's
  // requests, and a password inherited from the user's shell can no longer
  // lock Sentinel's own client out with a 401.
  const password = randomBytes(24).toString("base64url");
  const authorization = buildOpenCodeServerAuthorization(password);
  const timeoutMs = input.timeoutMs ?? OPENCODE_SERVER_START_TIMEOUT_MS;
  const child = spawnManagedProcess({
    args: ["serve", `--hostname=${OPENCODE_SERVER_HOSTNAME}`, `--port=${port}`],
    command: input.binaryPath,
    cwd: input.cwd,
    env: buildOpenCodeServerEnv(
      input.env ?? process.env,
      input.generation ?? null,
      password,
    ),
    // Only the given env: the caller's copy already starts from process.env.
    extendEnv: false,
    instanceId: input.instanceId ?? null,
    label: "opencode serve",
    stdio: ["ignore", "pipe", "pipe"],
  }) as OpenCodeServerChild;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  let settled = false;
  let resolveExited!: (exit: OpenCodeServerExit) => void;
  const exited = new Promise<OpenCodeServerExit>((resolve) => {
    resolveExited = resolve;
  });
  const close = () => {
    if (hasChildExited(child)) return;
    // SIGTERM to the process group (the npm launcher forwards it), SIGKILL
    // after the grace period so a wedged server cannot outlive Sentinel.
    void terminateProcessTree(child, {
      graceMs: OPENCODE_SERVER_KILL_GRACE_MS,
    });
  };
  const baseUrl = `http://${OPENCODE_SERVER_HOSTNAME}:${port}`;

  return await new Promise<OpenCodeServerProcess>((resolve, reject) => {
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let polling = false;

    const settle = () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeoutId);
      if (pollTimer) clearTimeout(pollTimer);
      input.signal?.removeEventListener("abort", onAbort);
      return true;
    };

    const fail = (error: Error) => {
      if (!settle()) return;
      close();
      reject(error);
    };
    const onAbort = () => fail(cancelled());
    input.signal?.addEventListener("abort", onAbort, { once: true });

    const poll = async () => {
      pollTimer = null;
      if (settled || polling) return;
      polling = true;
      const probed = await probeOpenCodeServer({ authorization, baseUrl });
      polling = false;
      if (settled) return;
      if (probed === "unauthorized") {
        fail(
          new Error(
            "OpenCode server rejected Sentinel's generated password (HTTP 401).",
          ),
        );
        return;
      }
      if (probed) {
        if (!settle()) return;
        resolve({
          authorization,
          close,
          exited,
          generation: probed.generation,
          hasExited: () => hasChildExited(child),
          password,
          pid: child.pid ?? null,
          stderr: () => stderr,
          stdout: () => stdout,
          url: baseUrl,
          version: probed.version,
        });
        return;
      }
      pollTimer = setTimeout(poll, OPENCODE_READY_POLL_INTERVAL_MS);
    };

    const timeoutId = setTimeout(() => {
      fail(
        new Error(
          `Timed out waiting for OpenCode server start after ${timeoutMs}ms.`,
        ),
      );
    }, timeoutMs);

    // Both pipes stay drained for the server's lifetime; a full pipe would
    // block OpenCode. Output is capped and kept only for diagnostics.
    let announced = false;
    child.stdout.on("data", (chunk: string | Buffer) => {
      stdout = appendCappedOutput(stdout, chunk);
      if (settled || announced || !parseOpenCodeServerUrl(stdout)) return;
      announced = true;
      if (pollTimer) clearTimeout(pollTimer);
      void poll();
    });
    child.stderr.on("data", (chunk: string | Buffer) => {
      stderr = appendCappedOutput(stderr, chunk);
    });
    // Stays attached after startup: an unhandled "error" event would throw.
    child.on("error", (error) => {
      fail(error);
    });
    child.on("exit", (code, signal) => {
      resolveExited({ code, signal });
      // "exit" can fire before the last stderr chunk is read; report once
      // the pipes close (bounded, in case a grandchild keeps them open).
      const report = () =>
        fail(
          new Error(
            [
              `OpenCode server exited before startup completed`,
              code != null ? `with code ${code}` : null,
              signal ? `(${signal})` : null,
              stderr.trim() ? `stderr: ${stderr.trim()}` : null,
            ]
              .filter(Boolean)
              .join(" "),
          ),
        );
      child.once("close", report);
      setTimeout(report, OPENCODE_EXIT_STDERR_GRACE_MS).unref?.();
    });

    pollTimer = setTimeout(poll, OPENCODE_READY_POLL_INTERVAL_MS);
  });
}
