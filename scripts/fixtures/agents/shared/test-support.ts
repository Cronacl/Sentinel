// Helpers for the fixture self-tests (and later engine tests) that drive a
// fixture as a real child process. Not a test file itself.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Writable } from "node:stream";

export { nodeReadableToWeb } from "./fixture-io";

export type FixtureExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type FixtureProcess = {
  child: ChildProcessWithoutNullStreams;
  /** Every stdout byte so far, decoded as UTF-8. */
  stdoutText(): string;
  stderrText(): string;
  /** Resolves once the process exited. */
  exited: Promise<FixtureExit>;
  /** SIGKILLs the process (and waits for it) unless it already exited. */
  kill(): Promise<FixtureExit>;
};

const running = new Set<FixtureProcess>();

/** Spawns `bun <script> ...args` with `env` merged over the current environment. */
export function spawnFixture(
  script: string,
  options: {
    env?: Record<string, string | undefined>;
    args?: string[];
    cwd?: string;
  } = {},
): FixtureProcess {
  // `undefined` removes a variable from the inherited environment.
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...options.env }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ) as NodeJS.ProcessEnv;
  const child = spawn(process.execPath, [script, ...(options.args ?? [])], {
    cwd: options.cwd ?? process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  // A closed stdin pipe must not crash the test process.
  child.stdin.on("error", () => {});

  let exitState: FixtureExit | undefined;
  const exited = new Promise<FixtureExit>((resolve) => {
    child.on("close", (code, signal) => {
      exitState = { code, signal };
      resolve(exitState);
    });
  });

  const fixture: FixtureProcess = {
    child,
    stdoutText: () => Buffer.concat(stdout).toString("utf8"),
    stderrText: () => Buffer.concat(stderr).toString("utf8"),
    exited,
    kill: async () => {
      if (!exitState) child.kill("SIGKILL");
      return exited;
    },
  };
  running.add(fixture);
  void exited.then(() => running.delete(fixture));
  return fixture;
}

/** Kills every fixture still running; call from `afterEach`. */
export async function killAllFixtures(): Promise<void> {
  await Promise.all([...running].map((fixture) => fixture.kill()));
}

/** Wraps a Node writable (a child's stdin) as a web stream of bytes. */
export function nodeWritableToWeb(
  writable: Writable,
): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write: (chunk) =>
      new Promise<void>((resolve, reject) => {
        writable.write(chunk, (error) => (error ? reject(error) : resolve()));
      }),
    close: () =>
      new Promise<void>((resolve) => {
        writable.end(() => resolve());
      }),
  });
}

export class FixtureTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not settle within ${ms}ms`);
    this.name = "FixtureTimeoutError";
  }
}

/** Rejects with {@link FixtureTimeoutError} when `promise` takes longer than `ms`. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new FixtureTimeoutError(label, ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Polls `predicate` until it returns a truthy value. */
export async function waitFor<T>(
  predicate: () => T | undefined | null | false,
  label: string,
  timeoutMs = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline) throw new FixtureTimeoutError(label, timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Creates a temp directory; remove it with {@link removeTempDir}. */
export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), `sentinel-fixture-${prefix}-`));
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { force: true, recursive: true });
}

/** Splits text on LF only (never on U+2028/U+2029), dropping a trailing CR and empty lines. */
export function splitLfLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line !== "");
}
