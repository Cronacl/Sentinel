// Minimal Pi RPC client for the fixture self-tests: strict LF framing (CR
// stripped, U+2028 kept inside records), id-correlated responses, and every
// other record collected as an event. Not a test file itself.
import { fileURLToPath } from "node:url";
import path from "node:path";

import { readJsonl, type JsonObject } from "../shared/fixture-io";
import {
  makeTempDir,
  removeTempDir,
  spawnFixture,
  waitFor,
  type FixtureProcess,
} from "../shared/test-support";
import {
  PI_MOCK_LOG_ENV,
  PI_MOCK_SCENARIO_ENV,
  type PiMockLogEntry,
  type PiMockScenario,
} from "./scenario";

export const MOCK_PI_PATH = fileURLToPath(
  new URL("./mock-rpc.ts", import.meta.url),
);

export type PiResponse = {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

export type PiDriver = {
  fixture: FixtureProcess;
  /** Every parsed stdout record in arrival order, responses included. */
  records: JsonObject[];
  /** Stdout lines that were not JSON objects. */
  noise: string[];
  /** Every stdout byte, decoded. */
  raw(): string;
  send(record: JsonObject): void;
  /** Sends `{id, type, ...payload}` and resolves with the matching response. */
  request(
    type: string,
    payload?: JsonObject,
    timeoutMs?: number,
  ): Promise<PiResponse>;
  events(): JsonObject[];
  waitForEvent(
    predicate: (record: JsonObject) => boolean,
    label: string,
  ): Promise<JsonObject>;
  log(): PiMockLogEntry[];
  dispose(): Promise<void>;
};

export function startPiDriver(scenario: PiMockScenario): PiDriver {
  const dir = makeTempDir("pi");
  const logPath = path.join(dir, "mock.jsonl");
  const fixture = spawnFixture(MOCK_PI_PATH, {
    env: {
      [PI_MOCK_SCENARIO_ENV]: JSON.stringify(scenario),
      [PI_MOCK_LOG_ENV]: logPath,
    },
  });
  const records: JsonObject[] = [];
  const noise: string[] = [];
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  fixture.child.stdout.on("data", (chunk: Buffer) => {
    const text = decoder.decode(chunk, { stream: true });
    raw += text;
    buffer += text;
    for (
      let index = buffer.indexOf("\n");
      index !== -1;
      index = buffer.indexOf("\n")
    ) {
      let line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          records.push(parsed as JsonObject);
          continue;
        }
      } catch {
        // fall through to noise
      }
      noise.push(line);
    }
  });

  let nextId = 0;
  const send = (record: JsonObject) => {
    fixture.child.stdin.write(`${JSON.stringify(record)}\n`);
  };

  return {
    fixture,
    records,
    noise,
    raw: () => raw,
    send,
    request: async (type, payload = {}, timeoutMs = 5_000) => {
      const id = `req-${++nextId}`;
      send({ id, type, ...payload });
      return (await waitFor(
        () =>
          records.find(
            (record) => record.type === "response" && record.id === id,
          ),
        `${type} response`,
        timeoutMs,
      )) as PiResponse;
    },
    events: () => records.filter((record) => record.type !== "response"),
    waitForEvent: (predicate, label) =>
      waitFor(
        () =>
          records.find(
            (record) => record.type !== "response" && predicate(record),
          ),
        label,
      ),
    log: () => readJsonl<PiMockLogEntry>(logPath),
    dispose: async () => {
      await fixture.kill();
      removeTempDir(dir);
    },
  };
}
