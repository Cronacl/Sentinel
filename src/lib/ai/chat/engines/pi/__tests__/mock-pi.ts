// Test support for the Pi engine: the Pi RPC mock (scripts/fixtures/agents/
// pi) behind a `pi` launcher script, so binary resolution, the version check
// and the RPC framing all run for real over stdio. Not a test file itself.
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { makeFakeInstance } from "@/lib/ai/chat/engines/contract/testing";

import { readJsonl } from "../../../../../../../scripts/fixtures/agents/shared/fixture-io";
import {
  PI_MOCK_LOG_ENV,
  PI_MOCK_SCENARIO_ENV,
  type PiMockLogEntry,
  type PiMockScenario,
} from "../../../../../../../scripts/fixtures/agents/pi/scenario";
import { MOCK_PI_PATH } from "../../../../../../../scripts/fixtures/agents/pi/test-driver";

export type { PiMockLogEntry, PiMockScenario };

export const MOCK_PI_VERSION = "1.0.4";

export function makeTempDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), `sentinel-pi-${prefix}-`));
}

export function removeTempDir(dir: string) {
  rmSync(dir, { force: true, recursive: true });
}

/** A `pi` that answers --version itself and runs the mock for anything else. */
export function writePiLauncher(dir: string) {
  const launcher = path.join(dir, "bin", "pi");
  mkdirSync(path.dirname(launcher), { recursive: true });
  writeFileSync(
    launcher,
    [
      "#!/bin/sh",
      `if [ "$1" = "--version" ]; then echo "${MOCK_PI_VERSION}"; exit 0; fi`,
      `echo "$*" >> ${JSON.stringify(path.join(dir, "launches.log"))}`,
      `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(MOCK_PI_PATH)} "$@"`,
      "",
    ].join("\n"),
  );
  chmodSync(launcher, 0o755);
  return launcher;
}

/** The arguments of every `pi` launch (one line each). */
export function piLaunches(dir: string) {
  try {
    return readFileSync(path.join(dir, "launches.log"), "utf8")
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function readPiMockLog(logPath: string) {
  return readJsonl<PiMockLogEntry>(logPath);
}

/** Commands the mock received, in order. */
export function piCommands(logPath: string) {
  return readPiMockLog(logPath).flatMap((entry) =>
    entry.kind === "command" ? [entry.record] : [],
  );
}

/** extension_ui_response records the mock received. */
export function piUiResponses(logPath: string) {
  return readPiMockLog(logPath).flatMap((entry) =>
    entry.kind === "ui_response" ? [entry.record] : [],
  );
}

/** A Pi instance whose `pi` is the mock; the env carries the scenario. */
export function mockPiInstance(
  scenario: PiMockScenario,
  dir: string,
  overrides: Partial<ResolvedEngineInstance> = {},
): ResolvedEngineInstance & { logPath: string } {
  const logPath = path.join(dir, "mock.jsonl");
  const binaryPath = writePiLauncher(dir);
  const base = makeFakeInstance({
    config: { binaryPath },
    driver: "pi",
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      [PI_MOCK_LOG_ENV]: logPath,
      [PI_MOCK_SCENARIO_ENV]: JSON.stringify(scenario),
    },
    id: "pi",
    isDefault: true,
    label: "Pi",
    stateDir: path.join(dir, "state"),
    ...overrides,
  });
  return Object.assign(base, { logPath });
}

export async function waitUntil<T>(
  predicate: () => T | null | undefined | false,
  label = "condition",
  timeoutMs = 8_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
