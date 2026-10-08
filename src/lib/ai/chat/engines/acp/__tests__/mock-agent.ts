// Test support for the ACP engine: drives scripts/fixtures/agents/acp's mock
// agent as a real child process over byte-level stdio (design critique G10),
// through the same AcpAgentProcess the app uses. Not a test file itself.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { makeFakeInstance } from "@/lib/ai/chat/engines/contract/testing";

import { readJsonl } from "../../../../../../../scripts/fixtures/agents/shared/fixture-io";
import {
  ACP_MOCK_LOG_ENV,
  ACP_MOCK_SCENARIO_ENV,
  type AcpMockLogEntry,
  type AcpMockScenario,
} from "../../../../../../../scripts/fixtures/agents/acp/scenario";
import { MOCK_AGENT_PATH } from "../../../../../../../scripts/fixtures/agents/acp/test-harness";
import { AcpAgentProcess, type AcpProcessOptions } from "../connection";
import type { AcpAgentDescriptor } from "../descriptor";

export { MOCK_AGENT_PATH };
export type { AcpMockLogEntry, AcpMockScenario };

export function makeTempDir(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), `sentinel-acp-${prefix}-`));
}

export function removeTempDir(dir: string) {
  rmSync(dir, { force: true, recursive: true });
}

export function mockAgentEnv(scenario: AcpMockScenario, logPath: string) {
  return {
    ...process.env,
    [ACP_MOCK_LOG_ENV]: logPath,
    [ACP_MOCK_SCENARIO_ENV]: JSON.stringify(scenario),
  } as Record<string, string | undefined>;
}

export function readMockLog(logPath: string) {
  return readJsonl<AcpMockLogEntry>(logPath);
}

/** The mock agent as an AcpAgentProcess (never recorded in the pid registry). */
export function startMockAgent(
  scenario: AcpMockScenario,
  options: Partial<AcpProcessOptions> & { dir: string },
) {
  const logPath = path.join(options.dir, "mock.jsonl");
  const process_ = AcpAgentProcess.start({
    args: [MOCK_AGENT_PATH],
    command: process.execPath,
    cwd: options.dir,
    env: mockAgentEnv(scenario, logPath),
    label: "Mock agent",
    register: false,
    ...options,
  });
  return { logPath, process: process_ };
}

/**
 * A descriptor that launches the mock agent (the scenario comes from the
 * instance env), with Cursor-like defaults; `overrides` change any field.
 */
export function mockDescriptor(
  overrides: Partial<AcpAgentDescriptor> = {},
): AcpAgentDescriptor {
  return {
    auth: {
      methodId: (methods) => methods[0]?.id ?? null,
      strategy: "lazy",
      timeoutMs: 5_000,
    },
    cancelGraceMs: 2_000,
    driver: "cursor",
    id: "mock",
    label: "Mock",
    launchArgs: [MOCK_AGENT_PATH],
    permissionModes: ["default", "accept_edits", "full"],
    planMode: "native",
    probe: { timeoutMs: 5_000 },
    processLabel: "Mock agent",
    async resolveBinary(instance) {
      return {
        binary: {
          env: instance.env,
          path: process.execPath,
          source: "config",
          version: "1.0.0",
        },
        error: null,
      };
    },
    session: { prefer: "load" },
    toolPrefix: "cursor_",
    ...overrides,
  };
}

/** An instance whose env carries the mock scenario and log path. */
export function mockInstance(
  scenario: AcpMockScenario,
  dir: string,
  overrides: Partial<ResolvedEngineInstance> = {},
): ResolvedEngineInstance & { logPath: string } {
  const logPath = path.join(dir, "mock.jsonl");
  const base = makeFakeInstance({
    driver: "cursor",
    env: mockAgentEnv(scenario, logPath),
    id: "cursor",
    isDefault: true,
    label: "Cursor",
    stateDir: path.join(dir, "state"),
    ...overrides,
  });
  return Object.assign(base, { logPath });
}
