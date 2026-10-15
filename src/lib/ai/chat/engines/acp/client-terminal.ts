import "server-only";

import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

import { RequestError } from "@agentclientprotocol/sdk";

import { terminateProcessTree } from "@/lib/runtime/process/kill-tree";
import {
  spawnManagedProcess,
  type ManagedSpawnOptions,
} from "@/lib/runtime/process/spawn";

import { resolveAllowedPath } from "./client-fs";
import {
  readArray,
  readNonEmptyString,
  readNumber,
  readString,
} from "./schema";

// terminal/* for agents that ask the client to run commands (design §2.13).
// Non-PTY: each command runs in its own process group through
// spawnManagedProcess, its output kept in a buffer that drops from the
// start once it passes the agent's outputByteLimit. Every command is
// authorized by the run first (permission mode, a granted execute, or an
// approval), its cwd must be inside the workspace, and every terminal is
// killed when the run ends.

export type ClientTerminalPolicy = {
  /** Asked before every command; false rejects it. */
  authorize(input: {
    args: string[];
    command: string;
    cwd: string;
  }): Promise<boolean>;
  /** Default cwd (the thread's workspace). */
  cwd: string;
  /** Environment commands start from (the instance env). */
  env: Record<string, string | undefined>;
  instanceId?: string | null;
  roots: readonly string[];
  spawn?: ManagedSpawnOptions["spawn"];
};

type TerminalExit = { exitCode: number | null; signal: string | null };

type Terminal = {
  child: ChildProcess;
  exit: TerminalExit | null;
  exited: Promise<TerminalExit>;
  limit: number | null;
  output: string;
  truncated: boolean;
};

const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;

function truncateStart(text: string, limitBytes: number) {
  if (Buffer.byteLength(text, "utf8") <= limitBytes) {
    return { text, truncated: false };
  }
  const buffer = Buffer.from(text, "utf8");
  let start = buffer.length - limitBytes;
  // Never start inside a UTF-8 sequence.
  while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) {
    start += 1;
  }
  return { text: buffer.subarray(start).toString("utf8"), truncated: true };
}

export function createClientTerminals(policy: ClientTerminalPolicy) {
  const terminals = new Map<string, Terminal>();

  function get(params: unknown) {
    const id = readNonEmptyString(params, "terminalId");
    const terminal = id ? terminals.get(id) : undefined;
    if (!id || !terminal) {
      throw RequestError.resourceNotFound(id ?? undefined);
    }
    return { id, terminal };
  }

  return {
    async create(params: unknown) {
      const command = readNonEmptyString(params, "command");
      if (!command) {
        throw RequestError.invalidParams({ message: "command is required" });
      }
      const args = (readArray(params, "args") ?? []).filter(
        (arg): arg is string => typeof arg === "string",
      );
      const rawCwd = readString(params, "cwd");
      const cwd = rawCwd
        ? await resolveAllowedPath(rawCwd, { roots: policy.roots })
        : policy.cwd;
      if (!(await policy.authorize({ args, command, cwd }))) {
        throw new RequestError(-32603, `Running ${command} was not allowed.`);
      }

      const extraEnv = Object.fromEntries(
        (readArray(params, "env") ?? []).flatMap((entry) => {
          const name = readNonEmptyString(entry, "name");
          const value = readString(entry, "value");
          return name && value != null ? [[name, value]] : [];
        }),
      );
      const child = spawnManagedProcess({
        args,
        command,
        cwd,
        env: { ...policy.env, ...extraEnv },
        extendEnv: false,
        instanceId: policy.instanceId ?? null,
        label: `agent terminal: ${command}`,
        spawn: policy.spawn,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const limit = readNumber(params, "outputByteLimit");
      const terminal: Terminal = {
        child,
        exit: null,
        exited: Promise.resolve({ exitCode: null, signal: null }),
        limit: limit != null && limit >= 0 ? limit : DEFAULT_OUTPUT_LIMIT,
        output: "",
        truncated: false,
      };
      const append = (chunk: Buffer | string) => {
        const next = truncateStart(
          terminal.output +
            (typeof chunk === "string" ? chunk : chunk.toString("utf8")),
          terminal.limit ?? DEFAULT_OUTPUT_LIMIT,
        );
        terminal.output = next.text;
        terminal.truncated ||= next.truncated;
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      terminal.exited = new Promise<TerminalExit>((resolve) => {
        const settle = (exit: TerminalExit) => {
          if (!terminal.exit) {
            terminal.exit = exit;
            resolve(exit);
          }
        };
        child.once("exit", (code, signal) =>
          settle({ exitCode: code, signal: signal ?? null }),
        );
        child.once("error", (error) => {
          append(`${error.message}\n`);
          settle({ exitCode: null, signal: null });
        });
      });

      const terminalId = `term_${randomUUID()}`;
      terminals.set(terminalId, terminal);
      return { terminalId };
    },

    output(params: unknown) {
      const { terminal } = get(params);
      return {
        output: terminal.output,
        truncated: terminal.truncated,
        ...(terminal.exit ? { exitStatus: terminal.exit } : {}),
      };
    },

    /** The current output of a terminal (for tool cards); null when unknown. */
    peek(terminalId: string) {
      const terminal = terminals.get(terminalId);
      return terminal
        ? {
            exitStatus: terminal.exit,
            output: terminal.output,
            truncated: terminal.truncated,
          }
        : null;
    },

    async waitForExit(params: unknown) {
      const { terminal } = get(params);
      return await terminal.exited;
    },

    async kill(params: unknown) {
      const { terminal } = get(params);
      if (!terminal.exit) {
        await terminateProcessTree(terminal.child, { graceMs: 2_000 });
      }
      return {};
    },

    async release(params: unknown) {
      const { id, terminal } = get(params);
      terminals.delete(id);
      if (!terminal.exit) {
        await terminateProcessTree(terminal.child, { graceMs: 2_000 });
      }
      return {};
    },

    /** Kills every terminal (the run ended). */
    async disposeAll() {
      const all = [...terminals.values()];
      terminals.clear();
      await Promise.all(
        all
          .filter((terminal) => !terminal.exit)
          .map((terminal) =>
            terminateProcessTree(terminal.child, { graceMs: 2_000 }),
          ),
      );
    },
  };
}

export type ClientTerminals = ReturnType<typeof createClientTerminals>;
