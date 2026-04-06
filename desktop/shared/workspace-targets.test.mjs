import { describe, expect, it } from "bun:test";

import {
  getOpenCommandForTarget,
  getOpenFileCommandForTarget,
  getRevealInFileManagerCommand,
  resolveOpenTargets,
} from "./workspace-targets.mjs";

const exists = async (candidatePath) => candidatePath.includes("Code.exe");
const whichExecutable = async (candidate) => {
  switch (candidate) {
    case "cursor":
      return "/usr/local/bin/cursor";
    case "windsurf":
      return "/usr/local/bin/windsurf";
    case "code":
      return "/usr/bin/code";
    case "code.cmd":
      return "C:\\Users\\sentinel\\AppData\\Roaming\\npm\\code.cmd";
    case "explorer.exe":
      return "C:\\Windows\\explorer.exe";
    case "powershell.exe":
      return "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
    case "xdg-open":
      return "/usr/bin/xdg-open";
    case "code":
      return "/usr/bin/code";
    case "gnome-terminal":
      return "/usr/bin/gnome-terminal";
    default:
      return null;
  }
};

describe("workspace target resolution", () => {
  it("resolves Windows launch targets", async () => {
    const targets = await resolveOpenTargets({
      env: {
        APPDATA: "C:\\Users\\sentinel\\AppData\\Roaming",
        LOCALAPPDATA: "C:\\Users\\sentinel\\AppData\\Local",
        USERPROFILE: "C:\\Users\\sentinel",
      },
      exists,
      homePath: "C:\\Users\\sentinel",
      platform: "win32",
      whichExecutable,
    });

    expect(targets.map((target) => target.id)).toEqual([
      "cursor",
      "vscode",
      "windsurf",
      "file-manager",
      "terminal",
    ]);
  });

  it("builds Windows editor and file-manager commands", () => {
    expect(
      getOpenFileCommandForTarget(
        {
          commandPath: "C:\\Users\\sentinel\\AppData\\Roaming\\npm\\code.cmd",
          id: "vscode",
          kind: "editor",
          platform: "win32",
          supportsGoto: true,
        },
        "C:\\workspace\\repo\\src\\index.ts",
        12,
      ),
    ).toEqual({
      args: ["-g", "C:\\workspace\\repo\\src\\index.ts:12"],
      command: "C:\\Users\\sentinel\\AppData\\Roaming\\npm\\code.cmd",
    });

    expect(
      getRevealInFileManagerCommand("win32", "C:\\workspace\\repo"),
    ).toEqual({
      args: ["C:\\workspace\\repo"],
      command: "explorer.exe",
    });
  });

  it("builds Linux launcher commands", async () => {
    const targets = await resolveOpenTargets({
      env: {},
      exists: async () => false,
      homePath: "/home/sentinel",
      platform: "linux",
      whichExecutable,
    });
    const vscode = targets.find((target) => target.id === "vscode");
    const terminal = targets.find((target) => target.id === "gnome-terminal");

    expect(vscode).toBeTruthy();
    expect(terminal).toBeTruthy();
    expect(getOpenCommandForTarget(terminal, "/workspace/repo")).toEqual({
      args: ["--working-directory", "/workspace/repo"],
      command: "/usr/bin/gnome-terminal",
    });
  });

  it("prefers the macOS editor CLI for file opens when available", async () => {
    const targets = await resolveOpenTargets({
      env: {},
      exists: async (candidatePath) =>
        candidatePath.includes("Cursor.app") ||
        candidatePath.includes("Visual Studio Code.app") ||
        candidatePath.includes("Contents/Resources/app/bin/cursor"),
      homePath: "/Users/sentinel",
      platform: "darwin",
      whichExecutable: async () => null,
    });
    const cursor = targets.find((target) => target.id === "cursor");

    expect(cursor).toBeTruthy();
    expect(cursor.commandPath).toBe(
      "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    );
    expect(
      getOpenFileCommandForTarget(
        cursor,
        "/Users/sentinel/workspace/src/index.ts",
        18,
      ),
    ).toEqual({
      args: ["-g", "/Users/sentinel/workspace/src/index.ts:18"],
      command: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    });
  });

  it("falls back to opening the file with the macOS app bundle when no CLI exists", () => {
    expect(
      getOpenFileCommandForTarget(
        {
          appPath: "/Applications/Zed.app",
          id: "zed",
          kind: "editor",
          label: "Zed",
          platform: "darwin",
        },
        "/Users/sentinel/workspace/src/index.ts",
        18,
      ),
    ).toEqual({
      args: [
        "-a",
        "/Applications/Zed.app",
        "/Users/sentinel/workspace/src/index.ts",
      ],
      command: "open",
    });
  });
});
