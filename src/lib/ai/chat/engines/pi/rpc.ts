import "server-only";

import type { ChildProcess } from "node:child_process";

import {
  endProcessGroup,
  terminateProcessTree,
} from "@/lib/runtime/process/kill-tree";
import { createLineSplitter } from "@/lib/runtime/process/line-splitter";
import {
  spawnManagedProcess,
  type ManagedSpawnOptions,
} from "@/lib/runtime/process/spawn";

import { asRecord, type JsonRecord } from "../acp/schema";

// One `pi --mode rpc` process (design acp-and-agents §4; protocol after
// t3code packages/provider-pi/src/server/rpc.ts, MIT). Pi speaks strict
// JSONL on stdio: one JSON object per LF-terminated record, split on LF only
// (U+2028/U+2029 are valid inside strings, so never node:readline), one
// trailing CR stripped. Commands are `{id, type, …}`; their answer is
// `{type:"response", id, command, success, data|error}`; every other record
// is an event (extension UI requests included). The process leads its own
// process group, is recorded in the pid registry and is ended as a tree;
// every request races its timeout, the caller's abort and the process exit.

export const PI_REQUEST_TIMEOUT_MS = 30_000;

const DEFAULT_STDERR_LIMIT = 64 * 1024;
const STDERR_TAIL_LINES = 6;
const CLOSE_GRACE_MS = 2_000;
/** How long Pi gets to exit on stdin EOF before it is signalled. */
const EOF_EXIT_WAIT_MS = 500;

export type PiRpcEvent = JsonRecord & { type: string };

export type PiRpcExit = {
  code: number | null;
  error: Error | null;
  signal: string | null;
};

export type PiRpcHandlers = {
  onEvent?(event: PiRpcEvent): void;
  onExit?(error: Error): void;
};

export type PiRpcProcessOptions = {
  args: readonly string[];
  command: string;
  cwd?: string;
  /** The full environment; never extended from process.env. */
  env: Record<string, string | undefined>;
  instanceId?: string | null;
  /** Shown in errors and the pid registry ("Pi"). */
  label: string;
  onStderrLine?: (line: string) => void;
  onStdoutNoise?: (line: string) => void;
  /** Record the pid in the agent registry (default true). */
  register?: boolean;
  spawn?: ManagedSpawnOptions["spawn"];
  stderrLimitBytes?: number;
};

export class PiRpcError extends Error {
  constructor(
    readonly command: string,
    message: string,
  ) {
    super(message);
    this.name = "PiRpcError";
  }
}

export class PiRpcTimeoutError extends Error {
  constructor(
    readonly command: string,
    timeoutMs: number,
  ) {
    super(
      `Pi did not answer ${command} within ${Math.round(timeoutMs / 1000)} s.`,
    );
    this.name = "PiRpcTimeoutError";
  }
}

export class PiRpcCancelledError extends Error {
  constructor(
    readonly command: string,
    options?: { cause?: unknown },
  ) {
    super(`Pi ${command} was cancelled.`, options);
    this.name = "PiRpcCancelledError";
  }
}

export class PiProcessExitedError extends Error {
  constructor(
    message: string,
    readonly exit: PiRpcExit,
  ) {
    super(message);
    this.name = "PiProcessExitedError";
  }
}

type PendingRequest = {
  command: string;
  reject(error: Error): void;
  resolve(data: unknown): void;
};

function swallow() {}

export class PiRpcProcess {
  readonly child: ChildProcess;
  readonly label: string;
  /** Resolves once the process exited (or failed to start). */
  readonly exited: Promise<PiRpcExit>;
  /** Per-process state for the layer that owns it (session, models…). */
  readonly state = new Map<string, unknown>();

  private handlers: PiRpcHandlers | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private nextId = 0;
  private exitState: PiRpcExit | null = null;
  private stderrText = "";
  private readonly stderrLimit: number;
  private disposed = false;

  static start(options: PiRpcProcessOptions) {
    return new PiRpcProcess(options);
  }

  private constructor(options: PiRpcProcessOptions) {
    this.label = options.label;
    this.stderrLimit = options.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT;
    this.child = spawnManagedProcess({
      args: options.args,
      command: options.command,
      cwd: options.cwd,
      env: options.env,
      extendEnv: false,
      instanceId: options.instanceId ?? null,
      label: options.label,
      register: options.register,
      spawn: options.spawn,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let resolveExit: (exit: PiRpcExit) => void = () => {};
    this.exited = new Promise((resolve) => {
      resolveExit = resolve;
    });
    const settleExit = (exit: PiRpcExit) => {
      if (this.exitState) {
        return;
      }
      this.exitState = exit;
      const error = this.exitError()!;
      for (const request of [...this.pending.values()]) {
        request.reject(error);
      }
      this.pending.clear();
      if (!this.disposed) {
        this.handlers?.onExit?.(error);
      }
      resolveExit(exit);
    };
    this.child.once("exit", (code, signal) =>
      settleExit({ code, error: null, signal }),
    );
    this.child.once("error", (error) =>
      settleExit({ code: null, error, signal: null }),
    );

    const { stdin, stdout, stderr } = this.child;
    if (!stdin || !stdout || !stderr) {
      throw new Error(`${options.label} was started without stdio pipes.`);
    }
    stdin.on("error", swallow);

    const lines = createLineSplitter((line) => this.handleLine(line, options));
    stdout.on("data", (chunk: Buffer | string) => lines.push(chunk));
    stdout.on("end", () => lines.flush());

    const stderrLines = createLineSplitter((line) => {
      if (line.trim()) {
        options.onStderrLine?.(line);
      }
    });
    stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.stderrText = (this.stderrText + text).slice(-this.stderrLimit);
      stderrLines.push(chunk);
    });
  }

  private handleLine(line: string, options: PiRpcProcessOptions) {
    if (!line.trim()) {
      return;
    }
    let record: JsonRecord | null = null;
    try {
      record = asRecord(JSON.parse(line));
    } catch {
      record = null;
    }
    if (!record || typeof record.type !== "string") {
      options.onStdoutNoise?.(line);
      return;
    }
    if (record.type === "response") {
      const id = typeof record.id === "string" ? record.id : null;
      const request = id ? this.pending.get(id) : undefined;
      if (request && id) {
        this.pending.delete(id);
        if (record.success === true) {
          request.resolve(record.data);
        } else {
          request.reject(
            new PiRpcError(
              request.command,
              typeof record.error === "string" && record.error
                ? record.error
                : `Pi ${request.command} failed.`,
            ),
          );
        }
      }
      return;
    }
    this.handlers?.onEvent?.(record as PiRpcEvent);
  }

  /** Handlers for one turn; returns their detach. */
  attach(handlers: PiRpcHandlers) {
    this.handlers = handlers;
    return () => {
      if (this.handlers === handlers) {
        this.handlers = null;
      }
    };
  }

  isAlive() {
    return this.exitState === null && !this.disposed;
  }

  exitError(): PiProcessExitedError | null {
    const exit = this.exitState;
    if (!exit) {
      return null;
    }
    const tail = this.stderrTail();
    const reason = exit.error
      ? `failed to start: ${exit.error.message}`
      : exit.signal
        ? `was stopped (${exit.signal})`
        : `exited with code ${exit.code ?? "unknown"}`;
    return new PiProcessExitedError(
      `${this.label} ${reason}.${tail ? `\n${tail}` : ""}`,
      exit,
    );
  }

  /** The last lines Pi wrote to stderr, joined for an error message. */
  stderrTail(lines = STDERR_TAIL_LINES) {
    return this.stderrText
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .slice(-lines)
      .join("\n");
  }

  /** Writes one record (extension_ui_response needs no answer). */
  send(record: JsonRecord) {
    const stdin = this.child.stdin;
    if (!this.isAlive() || !stdin || stdin.destroyed || stdin.writableEnded) {
      return false;
    }
    stdin.write(`${JSON.stringify(record)}\n`);
    return true;
  }

  /** Sends `{id, type, …payload}` and resolves with the response's data. */
  request<T = unknown>(
    type: string,
    payload: JsonRecord = {},
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<T> {
    const exited = this.exitError();
    if (exited) {
      return Promise.reject(exited);
    }
    if (options.signal?.aborted) {
      return Promise.reject(
        new PiRpcCancelledError(type, { cause: options.signal.reason }),
      );
    }
    this.nextId += 1;
    const id = `sentinel-${this.nextId}`;
    const timeoutMs = options.timeoutMs ?? PI_REQUEST_TIMEOUT_MS;

    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        this.pending.delete(id);
      };
      const onAbort = () => {
        cleanup();
        reject(
          new PiRpcCancelledError(type, { cause: options.signal?.reason }),
        );
      };
      this.pending.set(id, {
        command: type,
        reject: (error) => {
          cleanup();
          reject(error);
        },
        resolve: (data) => {
          cleanup();
          resolve(data as T);
        },
      });
      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        timer = setTimeout(() => {
          cleanup();
          reject(new PiRpcTimeoutError(type, timeoutMs));
        }, timeoutMs);
      }
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (!this.send({ ...payload, id, type })) {
        cleanup();
        reject(this.exitError() ?? new PiRpcCancelledError(type));
      }
    });
  }

  /**
   * Ends Pi: closes stdin (Pi aborts its run and exits on EOF), then
   * SIGTERM to the process group and SIGKILL after the grace period; what
   * Pi started (a bash tool's background server) stays in its group, so the
   * group is ended even when Pi left on EOF. Idempotent.
   */
  async dispose() {
    if (this.disposed) {
      await this.exited;
      return;
    }
    this.disposed = true;
    this.handlers = null;
    try {
      this.child.stdin?.end();
    } catch {
      // Already closed.
    }
    if (!this.exitState) {
      await Promise.race([
        this.exited,
        new Promise((resolve) => setTimeout(resolve, EOF_EXIT_WAIT_MS)),
      ]);
    }
    if (!this.exitState) {
      await terminateProcessTree(this.child, { graceMs: CLOSE_GRACE_MS });
    }
    if (this.child.pid != null) {
      await endProcessGroup(this.child.pid, { graceMs: CLOSE_GRACE_MS });
    }
  }
}
