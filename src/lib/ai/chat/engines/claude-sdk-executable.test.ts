import { afterEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildClaudeCliLaunch,
  createClaudeNodeScriptSpawner,
  isClaudeNodeScript,
  resolveClaudeWindowsLauncherShim,
} from "./claude-sdk/executable";

const tempRoots: string[] = [];

async function createTempRoot() {
  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "sentinel-claude-exec-"),
  );
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((tempRoot) => rm(tempRoot, { force: true, recursive: true })),
  );
});

describe("isClaudeNodeScript", () => {
  const head = (content: string | null) => () => content;

  it("treats JavaScript entry points as Node scripts by extension", () => {
    expect(isClaudeNodeScript("/opt/claude-code/cli.js", head(null))).toBe(
      true,
    );
    expect(isClaudeNodeScript("C:\\npm\\cli.MJS", head(null))).toBe(true);
    expect(isClaudeNodeScript("/opt/claude/cli.cjs", head(null))).toBe(true);
  });

  it("detects node shebangs on extension-less npm shims", () => {
    expect(
      isClaudeNodeScript(
        "/usr/local/bin/claude",
        head("#!/usr/bin/env node\n"),
      ),
    ).toBe(true);
    expect(
      isClaudeNodeScript(
        "/usr/local/bin/claude",
        head("#!/usr/bin/env -S node --no-warnings --enable-source-maps\n"),
      ),
    ).toBe(true);
    expect(
      isClaudeNodeScript(
        "/usr/local/bin/claude",
        head("#!/usr/local/bin/node\r\n"),
      ),
    ).toBe(true);
  });

  it("leaves native binaries and other interpreters alone", () => {
    expect(
      isClaudeNodeScript(
        "/Users/me/.local/bin/claude",
        head("\u00cf\u00fa\u00ed\u00fe"),
      ),
    ).toBe(false);
    expect(
      isClaudeNodeScript(
        "/Users/me/.claude/local/claude",
        head("#!/bin/bash\n"),
      ),
    ).toBe(false);
    expect(
      isClaudeNodeScript("/usr/local/bin/claude", head("#!/usr/bin/env bun\n")),
    ).toBe(false);
    expect(isClaudeNodeScript("C:\\claude\\claude.exe", head(null))).toBe(
      false,
    );
  });
});

describe("buildClaudeCliLaunch", () => {
  const env = { HOME: "/home/me", PATH: "/usr/bin" };

  it("runs Node-script CLIs under process.execPath as Node", () => {
    expect(
      buildClaudeCliLaunch(
        { args: ["--version"], command: "/usr/local/bin/claude", env },
        () => "#!/usr/bin/env node\n",
      ),
    ).toEqual({
      args: ["/usr/local/bin/claude", "--version"],
      command: process.execPath,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    });
  });

  it("maps the SDK's node/bun runtime commands to process.execPath", () => {
    expect(
      buildClaudeCliLaunch({
        args: ["/opt/claude-code/cli.js", "--output-format", "stream-json"],
        command: "node",
        env,
      }),
    ).toEqual({
      args: ["/opt/claude-code/cli.js", "--output-format", "stream-json"],
      command: process.execPath,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    });
  });

  it("spawns native binaries directly", () => {
    const launch = {
      args: ["--version"],
      command: "/Users/me/.local/bin/claude",
      env,
    };

    expect(buildClaudeCliLaunch(launch, () => "\u007fELF")).toBe(launch);
  });
});

describe("resolveClaudeWindowsLauncherShim", () => {
  const shimPath = "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd";
  const npmRoot = "C:\\Users\\me\\AppData\\Roaming\\npm";

  it("follows an npm .cmd shim to the native claude.exe", () => {
    const nativeEntry = `${npmRoot}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`;

    expect(
      resolveClaudeWindowsLauncherShim(shimPath, {
        isFile: (candidate) => candidate === nativeEntry,
        platform: "win32",
      }),
    ).toBe(nativeEntry);
  });

  it("falls back to cli.js for older package versions", () => {
    const scriptEntry = `${npmRoot}\\node_modules\\@anthropic-ai\\claude-code\\cli.js`;

    expect(
      resolveClaudeWindowsLauncherShim(shimPath, {
        isFile: (candidate) => candidate === scriptEntry,
        platform: "win32",
      }),
    ).toBe(scriptEntry);
  });

  it("keeps the path when no entry is found, off Windows, or for executables", () => {
    expect(
      resolveClaudeWindowsLauncherShim(shimPath, {
        isFile: () => false,
        platform: "win32",
      }),
    ).toBe(shimPath);
    expect(
      resolveClaudeWindowsLauncherShim(shimPath, {
        isFile: () => true,
        platform: "darwin",
      }),
    ).toBe(shimPath);
    expect(
      resolveClaudeWindowsLauncherShim("C:\\tools\\claude.exe", {
        isFile: () => true,
        platform: "win32",
      }),
    ).toBe("C:\\tools\\claude.exe");
  });
});

describe("createClaudeNodeScriptSpawner", () => {
  it("runs an extension-less node shim under process.execPath and returns a SpawnedProcess", async () => {
    const tempRoot = await createTempRoot();
    const scriptPath = path.join(tempRoot, "claude");
    await writeFile(
      scriptPath,
      [
        "#!/usr/bin/env node",
        'process.stderr.write("diagnostics\\n");',
        "process.stdout.write(JSON.stringify({",
        "  args: process.argv.slice(2),",
        "  runAsNode: process.env.ELECTRON_RUN_AS_NODE,",
        "}));",
        "",
      ].join("\n"),
      "utf8",
    );
    await chmod(scriptPath, 0o755);

    const stderrChunks: string[] = [];
    const spawnClaudeCodeProcess = createClaudeNodeScriptSpawner({
      onStderr: (data) => stderrChunks.push(data),
    });
    const child = spawnClaudeCodeProcess({
      args: ["--output-format", "stream-json"],
      command: scriptPath,
      cwd: tempRoot,
      // No PATH: the shebang's `node` must not be needed.
      env: { HOME: tempRoot },
      signal: new AbortController().signal,
    });

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    const [exitCode] = await Promise.all([
      new Promise<number | null>((resolve) => {
        child.once("exit", (code) => resolve(code));
      }),
      new Promise((resolve) => child.stdout.once("end", resolve)),
      // The spawner returns the ChildProcess itself.
      new Promise((resolve) =>
        (child as unknown as ChildProcess).stderr?.once("end", resolve),
      ),
    ]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      args: ["--output-format", "stream-json"],
      runAsNode: "1",
    });
    expect(stderrChunks.join("")).toContain("diagnostics");
  });
});
