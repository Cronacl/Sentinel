import path from "node:path";

import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  getEngineInstanceStateDirectory,
  getEnginesStateDirectory,
  getRuntimePathsFilePath,
} = await import("./paths");

describe("engine state paths", () => {
  it("derive from the Sentinel state root", () => {
    // The test runner points SENTINEL_STATE_PATH at a per-file temp dir.
    const stateRoot = path.dirname(process.env.SENTINEL_STATE_PATH ?? "");
    expect(process.env.SENTINEL_STATE_PATH).toBeTruthy();

    expect(getEnginesStateDirectory()).toBe(path.join(stateRoot, "engines"));
    expect(getEngineInstanceStateDirectory("codex-work")).toBe(
      path.join(stateRoot, "engines", "codex-work"),
    );
    expect(getRuntimePathsFilePath()).toBe(
      path.join(stateRoot, "engines", "runtime-paths.json"),
    );
  });

  it("honour an explicit root and path flavour", () => {
    expect(
      getEngineInstanceStateDirectory("claude", {
        pathModule: path.win32,
        stateRoot: "C:\\Users\\me\\.sentinel",
      }),
    ).toBe("C:\\Users\\me\\.sentinel\\engines\\claude");
  });

  it("refuse instance ids that are not slugs", () => {
    for (const id of ["../escape", "a/b", "", "Codex", "runtime-paths.json"]) {
      expect(() =>
        getEngineInstanceStateDirectory(id, { stateRoot: "/tmp/s" }),
      ).toThrow();
    }
  });
});
