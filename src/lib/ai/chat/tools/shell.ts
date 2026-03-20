import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { PermissionMode } from "@/lib/security";

const COMMAND_INACTIVITY_TIMEOUT_MS = 5 * 60_000;
const COMMAND_MAX_DURATION_MS = 30 * 60_000;
const IDLE_TIMEOUT_MS = 15 * 60_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_LIVE_TAIL_BYTES = 8 * 1024;
const PROGRESS_HEARTBEAT_INTERVAL_MS = 1_000;
const PROGRESS_UPDATE_INTERVAL_MS = 75;
type Timer = ReturnType<typeof setTimeout>;

export type ShellCommandRunningOutput = {
  boundaryRoot: string | null;
  cwd: string;
  durationMs: number;
  phase: "running";
  tail: string;
  truncated: boolean;
};

export type ShellCommandCompletedOutput = {
  boundaryRoot: string | null;
  cwd: string;
  durationMs: number;
  exitCode: number;
  failureKind: ShellCommandFailureKind | null;
  missingCommand: string | null;
  phase: "completed";
  stderr: string;
  stdout: string;
  suggestedNextAction: ShellCommandSuggestedNextAction | null;
  truncated: boolean;
};

export type ShellCommandOutput =
  | ShellCommandRunningOutput
  | ShellCommandCompletedOutput;

export type ShellCommandResult = ShellCommandCompletedOutput;

export type ShellCommandFailureKind =
  | "missing_command"
  | "missing_toolchain"
  | "other"
  | "permission";

export type ShellCommandSuggestedNextAction =
  | "install"
  | "inspect"
  | "none"
  | "retry";

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
  allowedRoot?: string;
  allowedRoots?: string[];
  command: string;
  eventQueue: AsyncEventQueue<ShellCommandStreamEvent>;
  inactivityTimeoutMs: number;
  heartbeatTimer: Timer | null;
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
  currentDirectory: string;
  defaultDirectory: string;
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

        const nextValue = await new Promise<IteratorResult<T>>(
          (resolve, reject) => {
            resolvers.push({ reject, resolve });
          },
        );

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

  const truncatedChunk = chunkBuffer
    .subarray(0, remainingBytes)
    .toString("utf8");
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
    next: nextBuffer
      .subarray(nextBuffer.byteLength - maxOutputBytes)
      .toString("utf8"),
    truncated: true,
  };
}

function getShellCommand() {
  const preferredShell = process.env.SHELL?.trim();
  const preferredShellName = preferredShell
    ? path.basename(preferredShell)
    : null;
  const shellCandidates = [
    "bash",
    "sh",
    "/bin/bash",
    "/usr/bin/bash",
    preferredShell &&
    (preferredShellName === "bash" || preferredShellName === "zsh")
      ? preferredShell
      : null,
    os.platform() === "darwin" ? "/bin/zsh" : null,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const executable =
    shellCandidates.find((candidate) =>
      candidate.includes(path.sep) ? existsSync(candidate) : true,
    ) ?? "sh";
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

function clearHeartbeatTimer(pending: PendingExecution) {
  if (!pending.heartbeatTimer) {
    return;
  }

  clearTimeout(pending.heartbeatTimer);
  pending.heartbeatTimer = null;
}

function clearExecutionTimers(pending: PendingExecution) {
  clearTimeout(pending.maxDurationTimeout);
  clearHeartbeatTimer(pending);
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
      boundaryRoot:
        pending.allowedRoot ?? pending.allowedRoots?.[0] ?? null,
      cwd: session.currentDirectory,
      durationMs: Math.max(0, Date.now() - pending.startedAt),
      phase: "running",
      tail,
      truncated: pending.previewTruncated || pending.truncated,
    },
    type: "running",
  });
}

function scheduleHeartbeat(session: ShellSession) {
  const pending = session.pending;
  if (!pending || !pending.started || pending.heartbeatTimer) {
    return;
  }

  pending.heartbeatTimer = createTimer(() => {
    pending.heartbeatTimer = null;

    const activePending = session.pending;
    if (!activePending || activePending.marker !== pending.marker) {
      return;
    }

    emitRunningUpdate(session, true);
    scheduleHeartbeat(session);
  }, PROGRESS_HEARTBEAT_INTERVAL_MS);
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
  clearHeartbeatTimer(pending);
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
  const appended = appendTailChunk(
    pending.previewTail,
    content,
    MAX_LIVE_TAIL_BYTES,
  );
  pending.previewTail = appended.next;
  pending.previewTruncated ||= appended.truncated;
  scheduleRunningUpdate(session, content.includes("\n"));
}

function toComparablePath(candidatePath: string) {
  try {
    return realpathSync.native(candidatePath);
  } catch {
    return path.resolve(candidatePath);
  }
}

function isPathInsideRoot(candidatePath: string, allowedRoot: string) {
  const normalizedCandidatePath = toComparablePath(candidatePath);
  const normalizedAllowedRoot = toComparablePath(allowedRoot);
  const relative = path.relative(
    normalizedAllowedRoot,
    normalizedCandidatePath,
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assertShellWorkingDirectoryAvailable(defaultDirectory: string) {
  const candidate = defaultDirectory.trim();
  if (!candidate) {
    throw new Error("Shell working directory is unavailable.");
  }

  let stats;
  try {
    stats = statSync(candidate);
  } catch {
    throw new Error(`Shell working directory is unavailable: ${candidate}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Shell working directory is not a directory: ${candidate}`);
  }
}

function normalizeAllowedRoots({
  allowedRoot,
  allowedRoots,
}: {
  allowedRoot?: string;
  allowedRoots?: string[];
}) {
  const roots = [
    ...(allowedRoot ? [allowedRoot] : []),
    ...(allowedRoots ?? []),
  ].map((root) => toComparablePath(root));

  return Array.from(new Set(roots));
}

function isPathInsideAllowedRoots(
  candidatePath: string,
  allowedRoots: readonly string[],
) {
  return allowedRoots.some((allowedRoot) =>
    isPathInsideRoot(candidatePath, allowedRoot),
  );
}

function extractMissingCommand(text: string) {
  const patterns = [
    /(?:^|\n)\s*([a-z0-9._+-]+): command not found\b/i,
    /(?:^|\n)(?:bash|zsh|sh):\s*(?:line\s+\d+:\s*)?([a-z0-9._+-]+):\s*command not found\b/i,
    /(?:^|\n)(?:\/bin\/sh|\/bin\/bash|\/bin\/zsh):\s*(?:line\s+\d+:\s*)?([a-z0-9._+-]+):\s*(?:not found|command not found)\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function classifyShellCommandFailure({
  exitCode,
  stderr,
  stdout,
}: {
  exitCode: number;
  stderr: string;
  stdout: string;
}): {
  failureKind: ShellCommandFailureKind | null;
  missingCommand: string | null;
  suggestedNextAction: ShellCommandSuggestedNextAction | null;
} {
  if (exitCode === 0) {
    return {
      failureKind: null,
      missingCommand: null,
      suggestedNextAction: "none",
    };
  }

  const combined = `${stderr}\n${stdout}`;
  const missingCommand = extractMissingCommand(combined);

  if (missingCommand || exitCode === 127) {
    return {
      failureKind: "missing_command",
      missingCommand,
      suggestedNextAction: "install",
    };
  }

  if (
    /\b(toolchain|sdk|compiler)\b.*\b(missing|not found|not installed|unavailable)\b/i.test(
      combined,
    ) ||
    /\brequires\b.*\b(toolchain|sdk|compiler)\b/i.test(combined)
  ) {
    return {
      failureKind: "missing_toolchain",
      missingCommand: null,
      suggestedNextAction: "install",
    };
  }

  if (
    /\b(permission denied|operation not permitted|eacces|eperm)\b/i.test(combined)
  ) {
    return {
      failureKind: "permission",
      missingCommand: null,
      suggestedNextAction: "inspect",
    };
  }

  return {
    failureKind: "other",
    missingCommand: null,
    suggestedNextAction: "inspect",
  };
}

function finalizePendingExecution(
  session: ShellSession,
  exitCode: number,
  marker: string,
  nextDirectory?: string,
) {
  const pending = session.pending;
  if (!pending || pending.marker !== marker) {
    return;
  }

  clearExecutionTimers(pending);
  clearProgressTimer(pending);
  session.pending = null;
  resetIdleTimer(session);
  const resolvedDirectory = nextDirectory?.trim() || session.currentDirectory;
  session.currentDirectory = resolvedDirectory;
  const stdout = `${pending.stdout}${pending.stdoutCarry}`.trimEnd();
  const stderr = pending.stderr.trimEnd();
  const failure = classifyShellCommandFailure({
    exitCode,
    stderr,
    stdout,
  });

  const output: ShellCommandCompletedOutput = {
    boundaryRoot: pending.allowedRoot ?? pending.allowedRoots?.[0] ?? null,
    cwd: resolvedDirectory,
    durationMs: Math.max(0, Date.now() - pending.startedAt),
    exitCode,
    failureKind: failure.failureKind,
    missingCommand: failure.missingCommand,
    phase: "completed",
    stderr,
    stdout,
    suggestedNextAction: failure.suggestedNextAction,
    truncated: pending.truncated,
  };

  const allowedRoots = normalizeAllowedRoots({
    allowedRoot: pending.allowedRoot,
    allowedRoots: pending.allowedRoots,
  });

  if (
    allowedRoots.length > 0 &&
    !isPathInsideAllowedRoots(resolvedDirectory, allowedRoots)
  ) {
    const error = new Error(
      "Shell command left the selected workspace root or discovered skill directories and the session was reset.",
    );
    pending.eventQueue.push({ error, type: "error" });
    pending.eventQueue.fail(error);
    pending.rejectCompletion(error);
    void disposeShellSession(session.threadId);
    return;
  }

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
    scheduleHeartbeat(session);
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
  const exitMatch = exitChunk.match(
    /^__sentinel_exit__:[^:]+:(-?\d+):(.*)\r?\n?/,
  );

  if (!exitMatch) {
    pending.stdoutCarry = exitChunk;
    return;
  }

  pending.stdoutCarry = "";
  finalizePendingExecution(
    session,
    Number(exitMatch[1] ?? 1),
    pending.marker,
    exitMatch[2],
  );
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

  const chunk =
    typeof rawChunk === "string" ? rawChunk : rawChunk.toString("utf8");
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
  assertShellWorkingDirectoryAvailable(cwd);
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
    currentDirectory: cwd,
    defaultDirectory: cwd,
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
  child.once("error", (error) => {
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
      pending.eventQueue.push({ error, type: "error" });
      pending.eventQueue.fail(error);
      pending.rejectCompletion(error);
    }
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

  if (existing.defaultDirectory !== cwd) {
    void disposeShellSession(threadId);
    return createShellSession(threadId, cwd);
  }

  return existing;
}

function runCommandInSession(
  session: ShellSession,
  command: string,
  {
    allowedRoot,
    allowedRoots,
    maxOutputBytes = MAX_OUTPUT_BYTES,
    timeoutMs = COMMAND_MAX_DURATION_MS,
    inactivityTimeoutMs = COMMAND_INACTIVITY_TIMEOUT_MS,
  }: {
    allowedRoot?: string;
    allowedRoots?: string[];
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

  const completion = new Promise<ShellCommandCompletedOutput>(
    (resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    },
  );

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
    allowedRoot,
    allowedRoots,
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
    heartbeatTimer: null,
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
    'sentinel_cwd="$(pwd)"',
    `printf '__sentinel_exit__:${marker}:%s:%s\\n' "$sentinel_exit_code" "$sentinel_cwd"`,
  ].join("\n");

  session.process.stdin.write(`${payload}\n`);

  return {
    completion,
    stream: eventQueue,
  };
}

export function assertShellCommandAllowed(
  command: string,
  allowedRootsInput?: string[],
) {
  const allowedRoots = normalizeAllowedRoots({
    allowedRoots: allowedRootsInput,
  });
  const forbiddenPatterns = [
    /\bpushd\b/i,
    /\bcd\s+\.\.(?:\s|$|\/|\\)/i,
    /\bcd\s+-/i,
  ];

  if (forbiddenPatterns.some((pattern) => pattern.test(command))) {
    throw new Error(
      "Shell command violates default permissions mode by attempting to change directories outside the selected workspace root or discovered skill directories.",
    );
  }

  const absoluteCdMatches = Array.from(
    command.matchAll(/\bcd\s+((?:~\/[^\s;&|]+)|(?:\/[^\s;&|]+))/gi),
  );

  for (const match of absoluteCdMatches) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget) {
      continue;
    }

    const resolvedTarget = rawTarget.startsWith("~/")
      ? path.join(os.homedir(), rawTarget.slice(2))
      : rawTarget;

    if (
      allowedRoots.length > 0 &&
      isPathInsideAllowedRoots(path.resolve(resolvedTarget), allowedRoots)
    ) {
      continue;
    }

    throw new Error(
      "Shell command violates default permissions mode by attempting to change directories outside the selected workspace root or discovered skill directories.",
    );
  }
}

export async function* streamShellCommand({
  allowedRoot,
  allowedRoots,
  command,
  defaultDirectory,
  maxOutputBytes,
  permissionMode,
  timeoutMs,
  inactivityTimeoutMs,
  threadId,
}: {
  allowedRoot?: string;
  allowedRoots?: string[];
  command: string;
  defaultDirectory: string;
  inactivityTimeoutMs?: number;
  maxOutputBytes?: number;
  permissionMode: PermissionMode;
  timeoutMs?: number;
  threadId: string;
}): AsyncIterable<ShellCommandStreamEvent> {
  assertShellWorkingDirectoryAvailable(defaultDirectory);
  const session = getOrCreateSession(threadId, defaultDirectory);
  await session.queue.catch(() => undefined);

  const execution = runCommandInSession(session, command, {
    allowedRoot: permissionMode === "default" ? allowedRoot : undefined,
    allowedRoots: permissionMode === "default" ? allowedRoots : undefined,
    inactivityTimeoutMs,
    maxOutputBytes,
    timeoutMs,
  });
  session.queue = execution.completion.catch(() => undefined);

  for await (const event of execution.stream) {
    yield event;
  }
}

export async function executeShellCommand({
  allowedRoot,
  allowedRoots,
  command,
  defaultDirectory,
  maxOutputBytes,
  permissionMode,
  timeoutMs,
  inactivityTimeoutMs,
  threadId,
}: {
  allowedRoot?: string;
  allowedRoots?: string[];
  command: string;
  defaultDirectory: string;
  inactivityTimeoutMs?: number;
  maxOutputBytes?: number;
  permissionMode: PermissionMode;
  timeoutMs?: number;
  threadId: string;
}) {
  let completed: ShellCommandCompletedOutput | null = null;

  for await (const event of streamShellCommand({
    allowedRoot,
    allowedRoots,
    command,
    defaultDirectory,
    inactivityTimeoutMs,
    maxOutputBytes,
    permissionMode,
    timeoutMs,
    threadId,
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
    const error = new Error(
      "Shell session was closed before the command completed.",
    );
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

export const __internal = {
  classifyShellCommandFailure,
  extractMissingCommand,
};
