import { describe, expect, it } from "bun:test";

import {
  getOpenFileCommandForTarget,
  getOpenCommandForTarget,
  resolveMacOpenTargets,
} from "./workspace-targets.mjs";

describe("resolveMacOpenTargets", () => {
  it("returns finder plus installed apps in curated order", async () => {
    const targets = await resolveMacOpenTargets({
      exists: async (candidatePath) =>
        candidatePath.endsWith("Cursor.app") ||
        candidatePath.endsWith("Ghostty.app"),
      homePath: "/Users/sentinel",
    });

    expect(targets.map((target) => target.id)).toEqual([
      "cursor",
      "finder",
      "ghostty",
    ]);
  });
});

describe("getOpenCommandForTarget", () => {
  it("builds open commands for editors and finder", () => {
    expect(
      getOpenCommandForTarget(
        {
          appPath: "/Applications/Cursor.app",
          id: "cursor",
          kind: "editor",
          label: "Cursor",
        },
        "/tmp/project",
      ),
    ).toEqual({
      args: ["-a", "/Applications/Cursor.app", "/tmp/project"],
      command: "open",
    });

    expect(
      getOpenCommandForTarget(
        {
          id: "finder",
          kind: "file_manager",
          label: "Finder",
          systemApp: "Finder",
        },
        "/tmp/project",
      ),
    ).toEqual({
      args: ["/tmp/project"],
      command: "open",
    });
  });
});

describe("getOpenFileCommandForTarget", () => {
  it("builds file open commands for editors and finder", () => {
    expect(
      getOpenFileCommandForTarget(
        {
          appPath: "/Applications/Cursor.app",
          id: "cursor",
          kind: "editor",
          label: "Cursor",
        },
        "/tmp/project/src/file.ts",
        42,
      ),
    ).toEqual({
      args: [
        "-a",
        "/Applications/Cursor.app",
        "--args",
        "-g",
        "/tmp/project/src/file.ts:42",
      ],
      command: "open",
    });

    expect(
      getOpenFileCommandForTarget(
        {
          id: "finder",
          kind: "file_manager",
          label: "Finder",
          systemApp: "Finder",
        },
        "/tmp/project/src/file.ts",
      ),
    ).toEqual({
      args: ["-R", "/tmp/project/src/file.ts"],
      command: "open",
    });
  });
});
