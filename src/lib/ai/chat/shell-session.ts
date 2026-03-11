import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

const COMMAND_INACTIVITY_TIMEOUT_MS = 5 * 60_000;
const COMMAND_MAX_DURATION_MS = 30 * 60_000;
const IDLE_TIMEOUT_MS = 15 * 60_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_LIVE_TAIL_BYTES = 8 * 1024;
const PROGRESS_UPDATE_INTERVAL_MS = 75;
type Timer = ReturnType<typeof setTimeout>;

export type ShellCommandRunningOutput = {
  cwd: string;
  durationMs: number;
  phase: "running";
  tail: string;
  truncated: boolean;
};

export type ShellCommandCompletedOutput = {
  cwd: string;
  durationMs: number;
  exitCode: number;
  phase: "completed";
  stderr: string;
  stdout: string;
  truncated: boolean;
};

export type ShellCommandOutput =
  | ShellCommandRunningOutput
  | ShellCommandCompletedOutput;

export type ShellCommandResult = ShellCommandCompletedOutput;

export type ShellCommandStreamEvent =
  | { output: ShellCommandRunningOutput; type: "running" }
  | { output: ShellCommandCompletedOutput; type: "completed" }
  | { error: Error; type: "error" };

type AsyncEventQueue<T> = {
  close: () => void;
  fail: (error: Error) => void;
  push: (value: T) => void;
  [Symbol.asyncIterator]: () => AsyncIterator<T>;
};

type PendingExecution = {
  command: string;
  eventQueue: AsyncEventQueue<ShellCommandStreamEvent>;
  inactivityTimeoutMs: number;
  lastProgressAt: number;
  lastPreviewSent: string;
  marker: string;
  maxOutputBytes: number;
  previewTail: string;
  previewTruncated: boolean;
  progressTimer: Timer | null;
  rejectCompletion: (error: Error) => void;
  resolveCompletion: (result: ShellCommandCompletedOutput) => void;
  started: boolean;
  startedAt: number;
  inactivityTimeout: Timer | null;
  maxDurationTimeout: Timer;
  stderr: string;
  stderrBytes: number;
  stdout: string;
  stdoutCarry: string;
  stdoutBytes: number;
  truncated: boolean;
};

type ShellSession = {
  cwd: string;
  idleTimer: Timer | null;
  lastActivityAt: number;
  pending: PendingExecution | null;
  process: ChildProcessWithoutNullStreams;
  queue: Promise<unknown>;
  threadId: string;
};

const sessions = new Map<string, ShellSession>();

function isNodeTimer(value: Timer): value is NodeJS.Timeout {
  return typeof value === "object" && value !== null && "unref" in value;
}

function createTimer(callback: () => void, timeoutMs: number) {
  const timer = setTimeout(callback, timeoutMs);
  if (isNodeTimer(timer)) {
    timer.unref();
  }
  return timer;
}

function createAsyncEventQueue<T>(): AsyncEventQueue<T> {
  const values: T[] = [];
  const resolvers: Array<{
    reject: (error: Error) => void;
    resolve: (value: IteratorResult<T>) => void;
  }> = [];
  let closed = false;
  let failure: Error | null = null;

  const flushValue = (value: T) => {
    const resolver = resolvers.shift();
    if (resolver) {
      resolver.resolve({ done: false, value });
      return;
    }

    values.push(value);
  };

  const flushDone = () => {
    while (resolvers.length > 0) {
      resolvers.shift()?.resolve({ done: true, value: undefined });
    }
  };

  const flushError = (error: Error) => {
    while (resolvers.length > 0) {
      resolvers.shift()?.reject(error);
    }
  };

  return {
    push(value) {
      if (closed || failure) {
        return;
      }

      flushValue(value);
    },
    close() {
      if (closed || failure) {
        return;
      }

      closed = true;
      flushDone();
    },
    fail(error) {
      if (failure || closed) {
        return;
      }

      failure = error;
      flushError(error);
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (values.length > 0) {
          yield values.shift() as T;
          continue;
        }

        if (failure) {
          throw failure;
        }

        if (closed) {
          return;
        }

        const nextValue = await new Promise<IteratorResult<T>>((resolve, reject) => {
          resolvers.push({ reject, resolve });
        });

        if (nextValue.done) {
          return;
        }

        yield nextValue.value;
      }
    },
  };
}

function appendChunk(
  current: string,
  currentBytes: number,
  chunk: string,
  maxOutputBytes: number,
): { next: string; nextBytes: number; truncated: boolean } {
  if (currentBytes >= maxOutputBytes) {
    return { next: current, nextBytes: currentBytes, truncated: true };
  }

  const remainingBytes = maxOutputBytes - currentBytes;
  const chunkBuffer = Buffer.from(chunk, "utf8");
  if (chunkBuffer.byteLength <= remainingBytes) {
    return {
      next: current + chunk,
      nextBytes: currentBytes + chunkBuffer.byteLength,
      truncated: false,
    };
  }

  const truncatedChunk = chunkBuffer.subarray(0, remainingBytes).toString("utf8");
  return {
    next: current + truncatedChunk,
    nextBytes: maxOutputBytes,
    truncated: true,
  };
}

function appendTailChunk(
  current: string,
  chunk: string,
  maxOutputBytes: number,
): { next: string; truncated: boolean } {
  if (!chunk) {
    return { next: current, truncated: false };
  }

  const nextBuffer = Buffer.from(`${current}${chunk}`, "utf8");
  if (nextBuffer.byteLength <= maxOutputBytes) {
    return { next: nextBuffer.toString("utf8"), truncated: false };
  }

  return {
    next: nextBuffer.subarray(nextBuffer.byteLength - maxOutputBytes).toString("utf8"),
    truncated: true,
  };
}

function getShellCommand() {
  const preferredShell = process.env.SHELL?.trim();
  const preferredShellName = preferredShell ? path.basename(preferredShell) : null;
  const executable =
    preferredShell && (preferredShellName === "bash" || preferredShellName === "zsh")
      ? preferredShell
      : os.platform() === "darwin"
        ? "/bin/zsh"
        : "/bin/bash";
  const shellName = path.basename(executable);

  if (shellName === "bash") {
    return {
      args: ["--noprofile", "--norc"],
      executable,
    };
  }

  if (shellName === "zsh") {
    return {
      args: ["-f"],
      executable,
    };
  }

  return {
    args: [],
    executable,
  };
}

function resetIdleTimer(session: ShellSession) {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
  }

  session.lastActivityAt = Date.now();
  session.idleTimer = createTimer(() => {
    void disposeShellSession(session.threadId);
  }, IDLE_TIMEOUT_MS);
}

function clearProgressTimer(pending: PendingExecution) {
  if (!pending.progressTimer) {
    return;
  }

  clearTimeout(pending.progressTimer);
  pending.progressTimer = null;
}

function clearExecutionTimers(pending: PendingExecution) {
  clearTimeout(pending.maxDurationTimeout);
  if (pending.inactivityTimeout) {
    clearTimeout(pending.inactivityTimeout);
    pending.inactivityTimeout = null;
  }
}

function resetInactivityTimer(
  session: ShellSession,
  pending: PendingExecution,
  inactivityTimeoutMs: number,
) {
  if (pending.inactivityTimeout) {
    clearTimeout(pending.inactivityTimeout);
  }

  pending.inactivityTimeout = createTimer(() => {
    const activePending = session.pending;
    if (!activePending || activePending.marker !== pending.marker) {
      return;
    }

    rejectPendingExecution(
      session,
      new Error(
        `Shell command produced no output for ${inactivityTimeoutMs} ms and the session was reset.`,
      ),
    );
    void disposeShellSession(session.threadId);
  }, inactivityTimeoutMs);
}

function emitRunningUpdate(session: ShellSession, force = false) {
  const pending = session.pending;
  if (!pending || !pending.started) {
    return;
  }

  clearProgressTimer(pending);

  const tail = pending.previewTail.trimEnd();
  if (!force && (!tail || tail === pending.lastPreviewSent)) {
    return;
  }

  pending.lastPreviewSent = tail;
  pending.lastProgressAt = Date.now();
  pending.eventQueue.push({
    output: {
      cwd: session.cwd,
      durationMs: Math.max(0, Date.now() - pending.startedAt),
      phase: "running",
      tail,
      truncated: pending.previewTruncated || pending.truncated,
    },
    type: "running",
  });
}

function scheduleRunningUpdate(session: ShellSession, flushNow = false) {
  const pending = session.pending;
  if (!pending || !pending.started) {
    return;
  }

  if (flushNow) {
    emitRunningUpdate(session, true);
    return;
  }

  if (pending.progressTimer) {
    return;
  }

  const elapsed = Date.now() - pending.lastProgressAt;
  const delay = Math.max(0, PROGRESS_UPDATE_INTERVAL_MS - elapsed);
  pending.progressTimer = createTimer(() => {
    emitRunningUpdate(session);
  }, delay);
}

function rejectPendingExecution(session: ShellSession, error: Error) {
  const pending = session.pending;
  if (!pending) {
    return;
  }

  clearExecutionTimers(pending);
  clearProgressTimer(pending);
  session.pending = null;
  pending.eventQueue.push({ error, type: "error" });
  pending.eventQueue.fail(error);
  pending.rejectCompletion(error);
}

function appendPreviewContent(
  session: ShellSession,
  pending: PendingExecution,
  content: string,
) {
  if (!content) {
    return;
  }

  resetInactivityTimer(session, pending, pending.inactivityTimeoutMs);
  const appended = appendTailChunk(pending.previewTail, content, MAX_LIVE_TAIL_BYTES);
  pending.previewTail = appended.next;
  pending.previewTruncated ||= appended.truncated;
  scheduleRunningUpdate(session, content.includes("\n"));
}

function finalizePendingExecution(
  session: ShellSession,
  exitCode: number,
  marker: string,
) {
  const pending = session.pending;
  if (!pending || pending.marker !== marker) {
    return;
  }

  clearExecutionTimers(pending);
  clearProgressTimer(pending);
  session.pending = null;
  resetIdleTimer(session);

  const output: ShellCommandCompletedOutput = {
    cwd: session.cwd,
    durationMs: Math.max(0, Date.now() - pending.startedAt),
    exitCode,
    phase: "completed",
    stderr: pending.stderr.trimEnd(),
    stdout: `${pending.stdout}${pending.stdoutCarry}`.trimEnd(),
    truncated: pending.truncated,
  };

  pending.eventQueue.push({ output, type: "completed" });
  pending.eventQueue.close();
  pending.resolveCompletion(output);
}

function appendStdoutContent(
  session: ShellSession,
  pending: PendingExecution,
  content: string,
) {
  if (!content) {
    return;
  }

  const appended = appendChunk(
    pending.stdout,
    pending.stdoutBytes,
    content,
    pending.maxOutputBytes,
  );
  pending.stdout = appended.next;
  pending.stdoutBytes = appended.nextBytes;
  pending.truncated ||= appended.truncated;
  appendPreviewContent(session, pending, content);
}

function handleStdoutChunk(session: ShellSession, chunk: string) {
  const pending = session.pending;
  if (!pending) {
    return;
  }

  const startMarker = `__sentinel_start__:${pending.marker}`;
  const exitMarkerPrefix = `__sentinel_exit__:${pending.marker}:`;
  const combined = `${pending.stdoutCarry}${chunk}`;

  if (!pending.started) {
    const markerIndex = combined.indexOf(startMarker);
    if (markerIndex === -1) {
      pending.stdoutCarry = combined.slice(-startMarker.length);
      return;
    }

    pending.started = true;
    pending.stdoutCarry = "";
    resetInactivityTimer(session, pending, pending.inactivityTimeoutMs);
    const rest = combined
      .slice(markerIndex + startMarker.length)
      .replace(/^\r?\n/, "");
    if (rest) {
      handleStdoutChunk(session, rest);
    }
    return;
  }

  resetInactivityTimer(session, pending, pending.inactivityTimeoutMs);
  const exitMarkerIndex = combined.indexOf(exitMarkerPrefix);
  if (exitMarkerIndex === -1) {
    const safeLength = Math.max(0, combined.length - exitMarkerPrefix.length);
    appendStdoutContent(session, pending, combined.slice(0, safeLength));
    pending.stdoutCarry = combined.slice(safeLength);
    return;
  }

  appendStdoutContent(session, pending, combined.slice(0, exitMarkerIndex));
  const exitChunk = combined.slice(exitMarkerIndex);
  const exitMatch = exitChunk.match(/^__sentinel_exit__:[^:]+:(-?\d+)\r?\n?/);

  if (!exitMatch) {
    pending.stdoutCarry = exitChunk;
    return;
  }

  pending.stdoutCarry = "";
  finalizePendingExecution(session, Number(exitMatch[1] ?? 1), pending.marker);
}

function handleStreamChunk(
  session: ShellSession,
  streamName: "stdout" | "stderr",
  rawChunk: Buffer | string,
) {
  const pending = session.pending;
  if (!pending) {
    return;
  }

  const chunk = typeof rawChunk === "string" ? rawChunk : rawChunk.toString("utf8");
  if (streamName === "stdout") {
    handleStdoutChunk(session, chunk);
    return;
  }

  if (!pending.started) {
    return;
  }

  const appended = appendChunk(
    pending.stderr,
    pending.stderrBytes,
    chunk,
    pending.maxOutputBytes,
  );
  pending.stderr = appended.next;
  pending.stderrBytes = appended.nextBytes;
  pending.truncated ||= appended.truncated;
  appendPreviewContent(session, pending, chunk);
}

function createShellSession(threadId: string, cwd: string): ShellSession {
  const shell = getShellCommand();
  const child = spawn(shell.executable, shell.args, {
    cwd,
    env: {
      ...process.env,
      BASH_ENV: "",
      ENV: "",
      TERM: "dumb",
      ZDOTDIR: os.tmpdir(),
    },
    stdio: "pipe",
  });

  const session: ShellSession = {
    cwd,
    idleTimer: null,
    lastActivityAt: Date.now(),
    pending: null,
    process: child,
    queue: Promise.resolve(),
    threadId,
  };

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    handleStreamChunk(session, "stdout", chunk);
  });
  child.stderr.on("data", (chunk) => {
    handleStreamChunk(session, "stderr", chunk);
  });
  child.once("exit", (code, signal) => {
    const pending = session.pending;
    session.pending = null;
    sessions.delete(threadId);
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }

    if (pending) {
      clearExecutionTimers(pending);
      clearProgressTimer(pending);
      const error = new Error(
        signal
          ? `Shell session exited with signal ${signal}.`
          : `Shell session exited with code ${code ?? 1}.`,
      );
      pending.eventQueue.push({ error, type: "error" });
      pending.eventQueue.fail(error);
      pending.rejectCompletion(error);
    }
  });

  resetIdleTimer(session);
  sessions.set(threadId, session);
  return session;
}

function getOrCreateSession(threadId: string, cwd: string) {
  const existing = sessions.get(threadId);
  if (!existing) {
    return createShellSession(threadId, cwd);
  }

  if (existing.cwd !== cwd) {
    void disposeShellSession(threadId);
    return createShellSession(threadId, cwd);
  }

  return existing;
}

function runCommandInSession(
  session: ShellSession,
  command: string,
  {
    maxOutputBytes = MAX_OUTPUT_BYTES,
    timeoutMs = COMMAND_MAX_DURATION_MS,
    inactivityTimeoutMs = COMMAND_INACTIVITY_TIMEOUT_MS,
  }: {
    inactivityTimeoutMs?: number;
    maxOutputBytes?: number;
    timeoutMs?: number;
  } = {},
) {
  if (!command.trim()) {
    throw new Error("Shell command cannot be empty.");
  }

  const marker = crypto.randomUUID();
  const eventQueue = createAsyncEventQueue<ShellCommandStreamEvent>();
  let resolveCompletion!: (result: ShellCommandCompletedOutput) => void;
  let rejectCompletion!: (error: Error) => void;

  const completion = new Promise<ShellCommandCompletedOutput>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  const maxDurationTimeout = createTimer(() => {
    const pending = session.pending;
    if (!pending || pending.marker !== marker) {
      return;
    }

    rejectPendingExecution(
      session,
      new Error(
        `Shell command exceeded the ${timeoutMs} ms maximum runtime and the session was reset.`,
      ),
    );
    void disposeShellSession(session.threadId);
  }, timeoutMs);

  session.pending = {
    command,
    eventQueue,
    inactivityTimeoutMs,
    lastProgressAt: 0,
    lastPreviewSent: "",
    marker,
    maxOutputBytes,
    previewTail: "",
    previewTruncated: false,
    progressTimer: null,
    rejectCompletion,
    resolveCompletion,
    started: false,
    startedAt: Date.now(),
    inactivityTimeout: null,
    maxDurationTimeout,
    stderr: "",
    stderrBytes: 0,
    stdout: "",
    stdoutCarry: "",
    stdoutBytes: 0,
    truncated: false,
  };

  resetIdleTimer(session);

  const payload = [
    `printf '__sentinel_start__:${marker}\\n'`,
    command,
    "sentinel_exit_code=$?",
    `printf '__sentinel_exit__:${marker}:%s\\n' "$sentinel_exit_code"`,
  ].join("\n");

  session.process.stdin.write(`${payload}\n`);

  return {
    completion,
    stream: eventQueue,
  };
}

export async function* streamWorkspaceShellCommand({
  command,
  maxOutputBytes,
  timeoutMs,
  inactivityTimeoutMs,
  threadId,
  workspaceRoot,
}: {
  command: string;
  inactivityTimeoutMs?: number;
  maxOutputBytes?: number;
  timeoutMs?: number;
  threadId: string;
  workspaceRoot: string;
}): AsyncIterable<ShellCommandStreamEvent> {
  const session = getOrCreateSession(threadId, workspaceRoot);
  await session.queue.catch(() => undefined);

  const execution = runCommandInSession(session, command, {
    inactivityTimeoutMs,
    maxOutputBytes,
    timeoutMs,
  });
  session.queue = execution.completion.catch(() => undefined);

  for await (const event of execution.stream) {
    yield event;
  }
}

export async function executeWorkspaceShellCommand({
  command,
  maxOutputBytes,
  timeoutMs,
  inactivityTimeoutMs,
  threadId,
  workspaceRoot,
}: {
  command: string;
  inactivityTimeoutMs?: number;
  maxOutputBytes?: number;
  timeoutMs?: number;
  threadId: string;
  workspaceRoot: string;
}) {
  let completed: ShellCommandCompletedOutput | null = null;

  for await (const event of streamWorkspaceShellCommand({
    command,
    inactivityTimeoutMs,
    maxOutputBytes,
    timeoutMs,
    threadId,
    workspaceRoot,
  })) {
    if (event.type === "completed") {
      completed = event.output;
    }
  }

  if (!completed) {
    throw new Error("Shell command finished without a completed result.");
  }

  return completed;
}

export async function disposeShellSession(threadId: string) {
  const session = sessions.get(threadId);
  if (!session) {
    return;
  }

  sessions.delete(threadId);

  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }

  const pending = session.pending;
  session.pending = null;
  if (pending) {
    clearExecutionTimers(pending);
    clearProgressTimer(pending);
    const error = new Error("Shell session was closed before the command completed.");
    pending.eventQueue.push({ error, type: "error" });
    pending.eventQueue.fail(error);
    pending.rejectCompletion(error);
  }

  if (!session.process.killed) {
    session.process.kill("SIGKILL");
  }
}

export function getShellSessionCount() {
  return sessions.size;
}
