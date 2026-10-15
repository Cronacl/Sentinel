// Spawns fake-server.ts the way Sentinel spawns `opencode serve` and parses its
// readiness output; plus a minimal SSE reader for the 2.x tests. Not a test file.
import { fileURLToPath } from "node:url";

import type { JsonObject } from "../shared/fixture-io";
import {
  spawnFixture,
  waitFor,
  type FixtureProcess,
} from "../shared/test-support";
import {
  OPENCODE_FAKE_GENERATION_ENV,
  OPENCODE_FAKE_SCENARIO_ENV,
  type OpenCodeFakeScenario,
  type OpenCodeGeneration,
} from "./scenario";

export const FAKE_OPENCODE_PATH = fileURLToPath(
  new URL("./fake-server.ts", import.meta.url),
);

export type SpawnedOpenCode = {
  fixture: FixtureProcess;
  url: string;
  /** The password the server prints (2.x without OPENCODE_PASSWORD), else the one passed in. */
  password: string | null;
};

export async function spawnFakeOpenCode(
  generation: OpenCodeGeneration,
  scenario: OpenCodeFakeScenario = {},
  env: Record<string, string | undefined> = {},
): Promise<SpawnedOpenCode> {
  const fixture = spawnFixture(FAKE_OPENCODE_PATH, {
    args: ["serve", "--hostname=127.0.0.1", "--port=0"],
    env: {
      [OPENCODE_FAKE_GENERATION_ENV]: String(generation),
      [OPENCODE_FAKE_SCENARIO_ENV]: JSON.stringify(scenario),
      OPENCODE_SERVER_PASSWORD: undefined,
      OPENCODE_PASSWORD: undefined,
      ...env,
    },
  });
  const pattern =
    generation === 1
      ? /^opencode server listening on (http:\/\/\S+)$/m
      : /^server listening on (http:\/\/\S+)$/m;
  const url = await waitFor(
    () => pattern.exec(fixture.stdoutText())?.[1],
    "readiness line",
  );
  let password: string | null =
    (generation === 1 ? env.OPENCODE_SERVER_PASSWORD : env.OPENCODE_PASSWORD) ??
    null;
  if (generation === 2 && password === null) {
    password = await waitFor(
      () => /^server password (\S+)$/m.exec(fixture.stdoutText())?.[1],
      "password line",
    );
  }
  return { fixture, url, password };
}

export type SseItem = { data?: JsonObject; comment?: string };

/**
 * Reads a `text/event-stream` body: `data:` lines become parsed events, `:`
 * lines are comments (heartbeats). Stops when `signal` aborts.
 */
export async function readSse(
  response: Response,
  onItem: (item: SseItem) => void,
): Promise<void> {
  if (!response.body) throw new Error("SSE response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
      for (
        let index = buffer.indexOf("\n\n");
        index !== -1;
        index = buffer.indexOf("\n\n")
      ) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          else if (line.startsWith(":"))
            onItem({ comment: line.slice(1).trim() });
        }
        if (data.length > 0)
          onItem({ data: JSON.parse(data.join("\n")) as JsonObject });
      }
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") throw error;
  }
}
