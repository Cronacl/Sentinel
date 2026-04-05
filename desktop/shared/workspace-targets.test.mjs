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
      "vscode",
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
});
