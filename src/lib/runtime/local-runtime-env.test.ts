import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const { readLocalRuntimeEnvValue, setLocalRuntimeEnvValue } =
  await import("./local-runtime-env");

const originalStatePath = process.env.SENTINEL_STATE_PATH;
const originalTestKey = process.env.SENTINEL_TEST_RUNTIME_PATH;
let stateRoot = "";

beforeEach(async () => {
  stateRoot = await mkdtemp(path.join(os.tmpdir(), "local-runtime-env-"));
  // desktop.env lives next to the state file.
  process.env.SENTINEL_STATE_PATH = path.join(stateRoot, "state.json");
});

afterEach(async () => {
  await rm(stateRoot, { force: true, recursive: true });
  if (originalStatePath === undefined) {
    delete process.env.SENTINEL_STATE_PATH;
  } else {
    process.env.SENTINEL_STATE_PATH = originalStatePath;
  }
  if (originalTestKey === undefined) {
    delete process.env.SENTINEL_TEST_RUNTIME_PATH;
  } else {
    process.env.SENTINEL_TEST_RUNTIME_PATH = originalTestKey;
  }
});

describe("readLocalRuntimeEnvValue", () => {
  it("returns null without a desktop.env or the key", async () => {
    expect(
      await readLocalRuntimeEnvValue("SENTINEL_TEST_RUNTIME_PATH"),
    ).toBeNull();

    await writeFile(
      path.join(stateRoot, "desktop.env"),
      'ENCRYPTION_KEY="abc"\n',
    );
    expect(
      await readLocalRuntimeEnvValue("SENTINEL_TEST_RUNTIME_PATH"),
    ).toBeNull();
  });

  it("reads back what setLocalRuntimeEnvValue saved, as the env loaders parse it", async () => {
    await writeFile(
      path.join(stateRoot, "desktop.env"),
      '# comment\nENCRYPTION_KEY="abc"\n',
    );
    await setLocalRuntimeEnvValue(
      "SENTINEL_TEST_RUNTIME_PATH",
      "/opt/tools/copilot=1/bin/copilot",
    );

    expect(
      await readFile(path.join(stateRoot, "desktop.env"), "utf8"),
    ).toContain(
      'SENTINEL_TEST_RUNTIME_PATH="/opt/tools/copilot=1/bin/copilot"',
    );
    expect(await readLocalRuntimeEnvValue("SENTINEL_TEST_RUNTIME_PATH")).toBe(
      "/opt/tools/copilot=1/bin/copilot",
    );
    expect(await readLocalRuntimeEnvValue("ENCRYPTION_KEY")).toBe("abc");
  });

  it("uses the last assignment, like the env loaders", async () => {
    await writeFile(
      path.join(stateRoot, "desktop.env"),
      "SENTINEL_TEST_RUNTIME_PATH=/first\n  SENTINEL_TEST_RUNTIME_PATH = /second  \n",
    );

    expect(await readLocalRuntimeEnvValue("SENTINEL_TEST_RUNTIME_PATH")).toBe(
      "/second",
    );
  });
});
