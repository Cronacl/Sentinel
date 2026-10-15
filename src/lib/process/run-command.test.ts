import { afterEach, describe, expect, it } from "bun:test";

import { runCommand } from "./run-command";

const previous = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (previous === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = previous;
  }
});

describe("runCommand", () => {
  it("runs without Sentinel's own secrets and keeps the caller's env", async () => {
    process.env.ENCRYPTION_KEY = "e".repeat(64);

    const result = await runCommand({
      args: [
        "-e",
        "process.stdout.write(JSON.stringify([process.env.ENCRYPTION_KEY ?? null, process.env.SENTINEL_INTERNAL_TOKEN ?? null, process.env.RUN_COMMAND_MARKER ?? null]))",
      ],
      command: process.execPath,
      cwd: process.cwd(),
      env: {
        RUN_COMMAND_MARKER: "kept",
        SENTINEL_INTERNAL_TOKEN: "t".repeat(64),
      } as unknown as NodeJS.ProcessEnv,
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([null, null, "kept"]);
  });
});
