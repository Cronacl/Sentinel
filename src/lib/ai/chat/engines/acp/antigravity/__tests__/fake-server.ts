// Test support for the Antigravity driver: a fake agy_acp_server.par that is
// the ACP mock agent (scripts/fixtures/agents/acp, antigravityProfile) over
// real stdio, next to a localharness_external sibling, and an Antigravity
// instance pointing at it. Never downloads or runs Google's server. Not a
// test file itself.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import { makeFakeInstance } from "@/lib/ai/chat/engines/contract/testing";

import type { AcpMockScenario } from "../../../../../../../../scripts/fixtures/agents/acp/scenario";
import { MOCK_AGENT_PATH } from "../../../../../../../../scripts/fixtures/agents/acp/test-harness";
import { mockAgentEnv } from "../../__tests__/mock-agent";

export const FAKE_SERVER_NAME = "agy_acp_server.par";
export const FAKE_HARNESS_NAME = "localharness_external";

/** The shell script that starts the mock agent as the server. */
export function fakeServerScript() {
  return `#!/bin/sh\nexec "${process.execPath}" "${MOCK_AGENT_PATH}" "$@"\n`;
}

/** Writes the fake server and its harness into `dir`; returns the server path. */
export async function writeFakeServer(dir: string) {
  await mkdir(dir, { recursive: true });
  const server = path.join(dir, FAKE_SERVER_NAME);
  await writeFile(server, fakeServerScript(), "utf8");
  await chmod(server, 0o755);
  await writeFile(path.join(dir, FAKE_HARNESS_NAME), "harness\n", "utf8");
  return server;
}

/** An Antigravity instance whose env carries the mock scenario. */
export function antigravityInstance(
  scenario: AcpMockScenario,
  dir: string,
  overrides: Partial<ResolvedEngineInstance> = {},
): ResolvedEngineInstance & { logPath: string } {
  const logPath = path.join(dir, "mock.jsonl");
  const base = makeFakeInstance({
    driver: "antigravity",
    env: mockAgentEnv(scenario, logPath),
    id: "antigravity",
    isDefault: true,
    label: "Antigravity",
    stateDir: path.join(dir, "state"),
    ...overrides,
  });
  return Object.assign(base, { logPath });
}
