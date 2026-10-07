import "server-only";

import { execFile as nodeExecFile } from "node:child_process";

import { buildSpawnInvocation } from "@/lib/runtime/process/spawn";

import type { ExecFileLike } from "./login-shell";

// Short-lived commands that verify a candidate binary (`--version`,
// `--help`). They never throw: the outcome and whatever the command printed
// are returned for the caller to judge.

export const VERSION_PROBE_TIMEOUT_MS = 1_500;

export type CommandProbeResult = {
  error: Error | null;
  stderr: string;
  stdout: string;
};

export type CommandProbeOptions = {
  args?: readonly string[];
  command: string;
  env?: Record<string, string | undefined>;
  execFile?: ExecFileLike;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
};

/**
 * Runs `command args` (Windows .cmd/.bat shims through cmd.exe with quoted
 * arguments) and resolves its output and error.
 */
export function runCommandProbe(
  options: CommandProbeOptions,
): Promise<CommandProbeResult> {
  const invocation = buildSpawnInvocation(
    options.command,
    options.args ?? ["--version"],
    { platform: options.platform },
  );
  const execFile = options.execFile ?? (nodeExecFile as ExecFileLike);

  return new Promise((resolve) => {
    try {
      const child = execFile(
        invocation.command,
        invocation.args,
        {
          env: (options.env ?? process.env) as NodeJS.ProcessEnv,
          timeout: options.timeoutMs ?? VERSION_PROBE_TIMEOUT_MS,
          windowsHide: true,
          ...(invocation.windowsVerbatimArguments
            ? { windowsVerbatimArguments: true }
            : {}),
        },
        (error, stdout, stderr) =>
          resolve({
            error,
            stderr: String(stderr ?? ""),
            stdout: String(stdout ?? ""),
          }),
      ) as { on?: (event: "error", listener: (error: Error) => void) => void };
      child?.on?.("error", (error) =>
        resolve({ error, stderr: "", stdout: "" }),
      );
    } catch (error) {
      resolve({
        error: error instanceof Error ? error : new Error(String(error)),
        stderr: "",
        stdout: "",
      });
    }
  });
}

/** The first non-empty line across the given outputs, trimmed. */
export function readFirstOutputLine(
  ...outputs: Array<string | null | undefined>
) {
  return (
    outputs
      .join("\n")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

/**
 * `<binary> --version`: launchable when it exited cleanly (or, with
 * `acceptFailureOutput`, printed anything), with the first output line as the
 * version.
 */
export async function probeBinaryVersion(
  options: CommandProbeOptions & { acceptFailureOutput?: boolean },
): Promise<{ launchable: boolean; version: string | null }> {
  const result = await runCommandProbe(options);
  const version = readFirstOutputLine(result.stdout, result.stderr);

  if (!result.error) {
    return { launchable: true, version };
  }

  return options.acceptFailureOutput && version
    ? { launchable: true, version }
    : { launchable: false, version: null };
}
