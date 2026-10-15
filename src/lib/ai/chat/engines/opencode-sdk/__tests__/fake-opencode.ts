// Test helpers: the scripts/fixtures OpenCode fake as an `opencode` binary
// (a launcher script) that Sentinel resolves, spawns and talks to through
// real HTTP and SSE. Not a test file; tests only.

import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeFakeInstance } from "@/lib/ai/chat/engines/contract/testing";
import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";

import type { OpenCodeFakeScenario } from "../../../../../../../scripts/fixtures/agents/opencode/scenario";

export const FAKE_OPENCODE_SERVER = fileURLToPath(
  new URL(
    "../../../../../../../scripts/fixtures/agents/opencode/fake-server.ts",
    import.meta.url,
  ),
);

export type FakeOpenCodeRequest = {
  body: unknown;
  method: string;
  path: string;
};

export type FakeOpenCodeBinary = {
  /** Every request the fake servers received, in order. */
  requests(): Promise<FakeOpenCodeRequest[]>;
  instance: ResolvedEngineInstance;
};

let counter = 0;

/**
 * An `opencode` launcher for the fake server (generation 1 or 2) and an
 * engine instance pointing at it. Each call is its own instance (pool slot
 * and runtime cache key).
 */
export async function createFakeOpenCode(input: {
  generation: 1 | 2;
  scenario?: OpenCodeFakeScenario;
}): Promise<FakeOpenCodeBinary> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sentinel-fake-opencode-"));
  const binaryPath = path.join(dir, "opencode");
  const logPath = path.join(dir, "requests.jsonl");
  await writeFile(
    binaryPath,
    `#!/bin/sh\nexec "${process.execPath}" "${FAKE_OPENCODE_SERVER}" "$@"\n`,
  );
  await chmod(binaryPath, 0o755);
  counter += 1;
  const id = `opencode-test-${process.pid}-${counter}`;
  const instance = makeFakeInstance({
    config: { binaryPath } as never,
    driver: "opencode",
    envOverrides: {
      SENTINEL_OPENCODE_FAKE_GENERATION: String(input.generation),
      SENTINEL_OPENCODE_FAKE_LOG: logPath,
      SENTINEL_OPENCODE_FAKE_SCENARIO: JSON.stringify(input.scenario ?? {}),
    },
    id,
    isDefault: false,
  });
  return {
    instance,
    async requests() {
      const text = await readFile(logPath, "utf8").catch(() => "");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as FakeOpenCodeRequest);
    },
  };
}

export async function waitUntil<T>(
  read: () => T | Promise<T>,
  label: string,
  timeoutMs = 10_000,
): Promise<NonNullable<T>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value as NonNullable<T>;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
