import "server-only";

import type { ChildProcess } from "node:child_process";

import { RequestError } from "@agentclientprotocol/sdk";
import type * as acp from "@agentclientprotocol/sdk";

import {
  endProcessGroup,
  terminateProcessTree,
} from "@/lib/runtime/process/kill-tree";
import { createLineSplitter } from "@/lib/runtime/process/line-splitter";
import {
  spawnManagedProcess,
  type ManagedSpawnOptions,
} from "@/lib/runtime/process/spawn";

import {
  AcpProcessExitedError,
  AcpRequestCancelledError,
  AcpRequestTimeoutError,
} from "./errors";
import { ACP_V1_METHODS, type AcpMethodTable } from "./method-table";
import {
  parseSessionUpdateEnvelope,
  type AcpSessionUpdateEnvelope,
} from "./schema";
import { createJsonLineStream } from "./stdout-filter";
import { openAcpConnection } from "./transport";

// One agent process and its ACP connection. The process leads its own
// process group (spawnManagedProcess), is recorded in the pid registry and
// is ended as a tree. Whoever uses the process attaches its handlers for the
// duration of a turn (attach/detach); while nothing is attached, permission
// requests are answered `cancelled`, elicitations `cancel`, and updates are
// dropped. Every request races the process exit, so a crash rejects pending
// requests at once with the stderr tail instead of hanging.

export type AcpProcessHandlers = {
  onNotification?(method: string, params: unknown): void | Promise<void>;
  onRequest?(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
  onSessionUpdate?(envelope: AcpSessionUpdateEnvelope): void;
};

export type AcpProcessExit = {
  code: number | null;
  error: Error | null;
  signal: string | null;
};

export type AcpTimers = {
  clearTimeout(handle: unknown): void;
  setTimeout(callback: () => void, ms: number): unknown;
};

export type AcpProcessOptions = {
  args: readonly string[];
  command: string;
  cwd?: string;
  /** The full environment (the instance's resolved env); never extended. */
  env: Record<string, string | undefined>;
  instanceId?: string | null;
  /** Shown in errors and the pid registry ("Cursor Agent"). */
  label: string;
  methods?: AcpMethodTable;
  normalizeInbound?: (message: acp.AnyMessage) => acp.AnyMessage | null;
  /** Vendor notifications the client handles. */
  notificationMethods?: readonly string[];
  onStderrLine?: (line: string) => void;
  onStdoutNoise?: (line: string) => void;
  /** Record the pid in the agent registry (default true). */
  register?: boolean;
  /** Vendor requests the client serves. */
  requestMethods?: readonly string[];
  spawn?: ManagedSpawnOptions["spawn"];
  /** Bytes of stderr kept for error messages (default 64 KiB). */
  stderrLimitBytes?: number;
  timers?: AcpTimers;
};

const DEFAULT_STDERR_LIMIT = 64 * 1024;
const STDERR_TAIL_LINES = 6;
const CLOSE_GRACE_MS = 2_000;
/** How long an agent gets to exit on stdin EOF before it is signalled. */
const EOF_EXIT_WAIT_MS = 500;
/** How long a closed connection waits for the exit it usually precedes. */
const EXIT_SETTLE_MS = 250;

const systemTimers: AcpTimers = {
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
};

/** The client methods every ACP process serves (capability-gated by the run). */
function clientRequestMethods(methods: AcpMethodTable) {
  return [
    methods.requestPermission,
    methods.fsReadTextFile,
    methods.fsWriteTextFile,
    methods.terminalCreate,
    methods.terminalOutput,
    methods.terminalWaitForExit,
    methods.terminalKill,
    methods.terminalRelease,
    methods.elicitationCreate,
  ];
}

function swallow() {}

export class AcpAgentProcess {
  readonly child: ChildProcess;
  readonly connection: acp.ClientConnection;
  readonly label: string;
  readonly methods: AcpMethodTable;
  /** Resolves once the process exited (or failed to start). */
  readonly exited: Promise<AcpProcessExit>;

  /** Set once by `initializeAcpAgent` (session.ts). */
  initializeResult: unknown = null;
  /** Arbitrary per-process state for the layer that owns the process. */
  readonly state = new Map<string, unknown>();

  private handlers: AcpProcessHandlers | null = null;
  private exitState: AcpProcessExit | null = null;
  private stderrText = "";
  private readonly stderrLimit: number;
  private readonly timers: AcpTimers;
  private disposed = false;

  private constructor(options: AcpProcessOptions) {
    this.label = options.label;
    this.methods = options.methods ?? ACP_V1_METHODS;
    this.stderrLimit = options.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT;
    this.timers = options.timers ?? systemTimers;

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

    let resolveExit: (exit: AcpProcessExit) => void = () => {};
    this.exited = new Promise((resolve) => {
      resolveExit = resolve;
    });
    const settleExit = (exit: AcpProcessExit) => {
      if (this.exitState) {
        return;
      }
      this.exitState = exit;
      resolveExit(exit);
      this.connection?.close(this.exitError());
    };
    this.child.once("exit", (code, signal) =>
      settleExit({ code, error: null, signal }),
    );
    this.child.once("error", (error) =>
      settleExit({ code: null, error, signal: null }),
    );

    const stdin = this.child.stdin;
    const stdout = this.child.stdout;
    const stderr = this.child.stderr;
    if (!stdin || !stdout || !stderr) {
      throw new Error(`${options.label} was started without stdio pipes.`);
    }
    stdin.on("error", swallow);

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

    const writable = new WritableStream<Uint8Array>({
      close: () =>
        new Promise<void>((resolve) => {
          stdin.end(() => resolve());
        }),
      write: (chunk) =>
        new Promise<void>((resolve, reject) => {
          if (stdin.destroyed || stdin.writableEnded) {
            reject(
              this.exitError() ?? new Error(`${this.label} stdin closed.`),
            );
            return;
          }
          stdin.write(chunk, (error) => (error ? reject(error) : resolve()));
        }),
    });

    this.connection = openAcpConnection(
      {
        readable: createJsonLineStream(stdout, {
          onNoise: options.onStdoutNoise,
        }),
        writable,
      },
      {
        onNotification: (method, params) =>
          this.handlers?.onNotification?.(method, params),
        onRequest: (method, params, signal) =>
          this.handleRequest(method, params, signal),
        onSessionUpdate: (params) => {
          const envelope = parseSessionUpdateEnvelope(params);
          if (envelope) {
            this.handlers?.onSessionUpdate?.(envelope);
          }
        },
      },
      {
        methods: this.methods,
        normalizeInbound: options.normalizeInbound,
        notificationMethods: [
          this.methods.elicitationComplete,
          ...(options.notificationMethods ?? []),
        ],
        requestMethods: [
          ...clientRequestMethods(this.methods),
          ...(options.requestMethods ?? []),
        ],
      },
    );
    void this.connection.closed.catch(swallow);
  }

  /** Spawns the agent and opens the connection (initialize is separate). */
  static start(options: AcpProcessOptions) {
    return new AcpAgentProcess(options);
  }

  get pid() {
    return this.child.pid ?? null;
  }

  isAlive() {
    return this.exitState === null && !this.disposed;
  }

  /** The last lines the agent wrote to stderr, joined for an error message. */
  stderrTail(lines = STDERR_TAIL_LINES) {
    return this.stderrText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-lines)
      .join(" | ");
  }

  exitError(): AcpProcessExitedError | null {
    if (!this.exitState) {
      return null;
    }
    if (this.exitState.error) {
      return new AcpProcessExitedError({
        code: null,
        label: this.label,
        signal: null,
        stderrTail: this.exitState.error.message,
      });
    }
    return new AcpProcessExitedError({
      code: this.exitState.code,
      label: this.label,
      signal: this.exitState.signal,
      stderrTail: this.stderrTail(),
    });
  }

  /** Routes agent → client traffic to `handlers` until the returned detach runs. */
  attach(handlers: AcpProcessHandlers) {
    this.handlers = handlers;
    return () => {
      if (this.handlers === handlers) {
        this.handlers = null;
      }
    };
  }

  private async handleRequest(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ) {
    if (this.handlers?.onRequest) {
      return await this.handlers.onRequest(method, params, signal);
    }
    // Nobody to ask: settle instead of leaving the agent waiting.
    if (method === this.methods.requestPermission) {
      return { outcome: { outcome: "cancelled" } };
    }
    if (method === this.methods.elicitationCreate) {
      return { action: "cancel" };
    }
    throw RequestError.methodNotFound(method);
  }

  /**
   * A request to the agent. Rejects with AcpProcessExitedError when the
   * process dies first, AcpRequestTimeoutError after `timeoutMs` (the
   * request is then cancelled), AcpRequestCancelledError when `signal`
   * aborts (an already aborted signal sends nothing), or the agent's
   * JSON-RPC error.
   */
  async request<T = unknown>(
    method: string,
    params: unknown,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<T> {
    const exited = this.exitError();
    if (exited) {
      throw exited;
    }
    if (options.signal?.aborted) {
      throw new AcpRequestCancelledError(method, {
        cause: options.signal.reason,
      });
    }

    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    let timer: unknown = null;

    const pending = this.connection.agent.request<T>(method, params, {
      cancellationSignal: controller.signal,
    });
    pending.catch(swallow);
    const exit = this.exited.then((): never => {
      throw this.exitError() ?? new Error(`${this.label} exited.`);
    });
    exit.catch(swallow);
    const races: Promise<T>[] = [pending, exit];
    // The SDK only tells the agent ($/cancel_request) and keeps waiting for
    // its answer; the caller stops waiting at once.
    if (options.signal) {
      const signal = options.signal;
      const aborted = new Promise<never>((_resolve, reject) => {
        const fail = () =>
          reject(
            new AcpRequestCancelledError(method, { cause: signal.reason }),
          );
        if (signal.aborted) {
          fail();
        } else {
          signal.addEventListener("abort", fail, { once: true });
        }
      });
      aborted.catch(swallow);
      races.push(aborted);
    }
    if (options.timeoutMs != null) {
      const timeoutMs = options.timeoutMs;
      races.push(
        new Promise<never>((_resolve, reject) => {
          timer = this.timers.setTimeout(() => {
            timer = null;
            controller.abort();
            reject(new AcpRequestTimeoutError(method, timeoutMs));
          }, timeoutMs);
        }),
      );
    }

    try {
      return await Promise.race(races);
    } catch (error) {
      // A crash closes stdout (and the connection) a moment before the exit
      // event: report the exit, with its stderr, rather than "closed".
      if (this.connection.signal.aborted && !this.exitState) {
        await this.waitForExit(EXIT_SETTLE_MS);
      }
      throw this.exitError() ?? error;
    } finally {
      if (timer !== null) {
        this.timers.clearTimeout(timer);
      }
      options.signal?.removeEventListener("abort", abort);
    }
  }

  private async waitForExit(ms: number) {
    let timer: unknown = null;
    await Promise.race([
      this.exited,
      new Promise<void>((resolve) => {
        timer = this.timers.setTimeout(resolve, ms);
      }),
    ]);
    if (timer !== null) {
      this.timers.clearTimeout(timer);
    }
  }

  /** A notification to the agent (session/cancel goes here, never `request`). */
  async notify(method: string, params: unknown) {
    if (!this.isAlive()) {
      return;
    }
    await this.connection.agent.notify(method, params).catch(swallow);
  }

  /**
   * Ends the agent: closes the connection and stdin (agents exit on EOF),
   * then SIGTERM to the process group and SIGKILL after the grace period.
   * What the agent started stays in its group after it exits (a shell
   * tool's background server, an MCP server ignoring EOF), so the group is
   * ended even when the agent left on EOF. Idempotent.
   */
  async dispose() {
    if (this.disposed) {
      await this.exited;
      return;
    }
    this.disposed = true;
    this.handlers = null;
    try {
      this.connection.close();
    } catch {
      // Already closed.
    }
    try {
      this.child.stdin?.end();
    } catch {
      // Already closed.
    }
    if (!this.exitState) {
      await this.waitForExit(EOF_EXIT_WAIT_MS);
    }
    if (!this.exitState) {
      await terminateProcessTree(this.child, { graceMs: CLOSE_GRACE_MS });
    }
    if (this.child.pid != null) {
      await endProcessGroup(this.child.pid, { graceMs: CLOSE_GRACE_MS });
    }
  }
}
