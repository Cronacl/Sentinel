import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

mock.module("server-only", () => ({}));

const {
  buildCodexCliInvocation,
  installWindowsTreeKill,
  parseShellLookupOutput,
  resetCodexCliResolutionCache,
  resolveCodexCli,
  // @ts-expect-error Bun test-only cache-busting import for module isolation.
} = await import("./codex-cli.ts?codex-cli-test");

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "platform",
)!;
const originalPathExt = process.env.PATHEXT;

async function withWin32Platform<T>(run: () => Promise<T>) {
  Object.defineProperty(process, "platform", {
    ...originalPlatformDescriptor,
    value: "win32",
  });
  // Lower-case so lookups also match on case-sensitive test filesystems;
  // Windows itself matches PATHEXT case-insensitively.
  process.env.PATHEXT = ".com;.exe;.bat;.cmd;.vbs;.js";
  try {
    return await run();
  } finally {
    Object.defineProperty(process, "platform", originalPlatformDescriptor);
    if (originalPathExt === undefined) {
      delete process.env.PATHEXT;
    } else {
      process.env.PATHEXT = originalPathExt;
    }
  }
}

// npm's cmd-shim output on Windows: an extensionless sh script, the .cmd
// batch shim and a PowerShell shim side by side.
async function writeNpmCodexShims(directory: string) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "codex"), "#!/bin/sh\nexit 0\n");
  await writeFile(path.join(directory, "codex.cmd"), "@ECHO off\r\n");
  await writeFile(path.join(directory, "codex.ps1"), "#!/usr/bin/env pwsh\n");
}

const originalPath = process.env.PATH;
const originalHome = process.env.HOME;
const originalSentinelCodexPath = process.env.SENTINEL_CODEX_PATH;
const originalSentinelStatePath = process.env.SENTINEL_STATE_PATH;

function useTempSentinelHome(tempRoot: string) {
  process.env.HOME = tempRoot;
  process.env.SENTINEL_STATE_PATH = path.join(
    tempRoot,
    ".sentinel",
    "state.json",
  );
}

afterEach(async () => {
  process.env.PATH = originalPath;
  process.env.HOME = originalHome;
  if (originalSentinelStatePath) {
    process.env.SENTINEL_STATE_PATH = originalSentinelStatePath;
  } else {
    delete process.env.SENTINEL_STATE_PATH;
  }
  if (originalSentinelCodexPath) {
    process.env.SENTINEL_CODEX_PATH = originalSentinelCodexPath;
  } else {
    delete process.env.SENTINEL_CODEX_PATH;
  }
  resetCodexCliResolutionCache();
});

describe("parseShellLookupOutput", () => {
  it("extracts the codex path and shell PATH markers even with extra shell noise", () => {
    const parsed = parseShellLookupOutput(`
Welcome to zsh
__SENTINEL_CODEX_PATH_START__
/Users/test/.local/state/fnm_multishells/123/bin/codex
__SENTINEL_CODEX_PATH_END__
some extra line
__SENTINEL_PATH_START__
/Users/test/.local/state/fnm_multishells/123/bin:/opt/homebrew/bin:/usr/bin
__SENTINEL_PATH_END__
`);

    expect(parsed).toEqual({
      codexPath: "/Users/test/.local/state/fnm_multishells/123/bin/codex",
      pathValue:
        "/Users/test/.local/state/fnm_multishells/123/bin:/opt/homebrew/bin:/usr/bin",
    });
  });
});

describe("resolveCodexCli", () => {
  it("detects codex directly from the current PATH", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const executablePath = path.join(tempRoot, "codex");

    try {
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      useTempSentinelHome(tempRoot);
      process.env.PATH = `${tempRoot}${path.delimiter}${originalPath ?? ""}`;

      const resolved = await resolveCodexCli({ forceRefresh: true });

      expect(resolved).not.toBeNull();
      expect(resolved?.command).toBe(executablePath);
      expect(process.env.SENTINEL_CODEX_PATH).toBe(executablePath);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("detects codex from common user bin locations when PATH is stripped", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const bunBinRoot = path.join(tempRoot, ".bun", "bin");
    const executablePath = path.join(bunBinRoot, "codex");

    try {
      await mkdir(bunBinRoot, { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      useTempSentinelHome(tempRoot);
      process.env.PATH = "/usr/bin:/bin";

      const resolved = await resolveCodexCli({ forceRefresh: true });
      const savedEnv = await readFile(
        path.join(tempRoot, ".sentinel", "desktop.env"),
        "utf8",
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.command).toBe(executablePath);
      expect(resolved?.env.PATH).toContain(bunBinRoot);
      expect(process.env.SENTINEL_CODEX_PATH).toBe(executablePath);
      expect(savedEnv).toContain(`SENTINEL_CODEX_PATH="${executablePath}"`);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("does not persist transient fnm multishell paths", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const fnmBinRoot = path.join(
      tempRoot,
      ".local",
      "state",
      "fnm_multishells",
      "123",
      "bin",
    );
    const executablePath = path.join(fnmBinRoot, "codex");

    try {
      await mkdir(fnmBinRoot, { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      useTempSentinelHome(tempRoot);
      process.env.PATH = `${fnmBinRoot}${path.delimiter}/usr/bin:/bin`;

      const resolved = await resolveCodexCli({ forceRefresh: true });
      const savedEnv = await readFile(
        path.join(tempRoot, ".sentinel", "desktop.env"),
        "utf8",
      ).catch(() => "");

      expect(resolved).not.toBeNull();
      expect(resolved?.command).toBe(executablePath);
      expect(process.env.SENTINEL_CODEX_PATH).toBe(executablePath);
      expect(savedEnv).not.toContain("SENTINEL_CODEX_PATH=");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("clears a stale persisted override before falling back to PATH discovery", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const stableBinRoot = path.join(tempRoot, ".bun", "bin");
    const executablePath = path.join(stableBinRoot, "codex");
    const staleOverridePath = path.join(tempRoot, "missing", "codex");

    try {
      await mkdir(stableBinRoot, { recursive: true });
      await mkdir(path.join(tempRoot, ".sentinel"), { recursive: true });
      await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(executablePath, 0o755);
      useTempSentinelHome(tempRoot);
      process.env.PATH = "/usr/bin:/bin";
      process.env.SENTINEL_CODEX_PATH = staleOverridePath;
      await writeFile(
        path.join(tempRoot, ".sentinel", "desktop.env"),
        `SENTINEL_CODEX_PATH="${staleOverridePath}"\n`,
        "utf8",
      );

      const resolved = await resolveCodexCli({ forceRefresh: true });
      const savedEnv = await readFile(
        path.join(tempRoot, ".sentinel", "desktop.env"),
        "utf8",
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.command).toBe(executablePath);
      expect(process.env.SENTINEL_CODEX_PATH).toBe(executablePath);
      expect(savedEnv).toContain(`SENTINEL_CODEX_PATH="${executablePath}"`);
      expect(savedEnv).not.toContain(staleOverridePath);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("resolveCodexCli on Windows", () => {
  it("picks npm's codex.cmd over the extensionless sh shim and wraps it in cmd.exe", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const npmBin = path.join(tempRoot, "npm");

    try {
      await writeNpmCodexShims(npmBin);
      useTempSentinelHome(tempRoot);
      delete process.env.SENTINEL_CODEX_PATH;
      process.env.PATH = npmBin;

      const resolved: { command: string } | null = await withWin32Platform(() =>
        resolveCodexCli({ forceRefresh: true }),
      );

      expect(resolved?.command).toBe(path.join(npmBin, "codex.cmd"));
      const invocation = buildCodexCliInvocation(
        resolved!.command,
        ["app-server"],
        { comSpec: "cmd.exe", platform: "win32" },
      );
      expect(invocation.command).toBe("cmd.exe");
      expect(invocation.windowsVerbatimArguments).toBe(true);
      expect(invocation.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
      expect(invocation.args[3]).toEndWith('\\npm\\codex.cmd ^"app-server^""');
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("maps a persisted extensionless override to its .cmd sibling", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "sentinel-codex-"));
    const npmBin = path.join(tempRoot, "npm");

    try {
      await writeNpmCodexShims(npmBin);
      useTempSentinelHome(tempRoot);
      process.env.SENTINEL_CODEX_PATH = path.join(npmBin, "codex");
      process.env.PATH = path.join(tempRoot, "empty");

      const resolved: { command: string } | null = await withWin32Platform(() =>
        resolveCodexCli({ forceRefresh: true }),
      );

      expect(resolved?.command).toBe(path.join(npmBin, "codex.cmd"));
      expect(process.env.SENTINEL_CODEX_PATH).toBe(
        path.join(npmBin, "codex.cmd"),
      );
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});

describe("installWindowsTreeKill", () => {
  function createChild(overrides?: { exitCode?: number | null }) {
    return {
      exitCode: overrides?.exitCode ?? null,
      kill: mock((_signal?: NodeJS.Signals | number) => true),
      pid: 4242,
      signalCode: null,
    };
  }

  it("ends the whole process tree with taskkill on Windows", async () => {
    const child = createChild();
    const directKill = child.kill;
    const taskkill = mock(async (_pid: number) => {});

    installWindowsTreeKill(child, { platform: "win32", taskkill });
    expect(child.kill()).toBe(true);
    await Promise.resolve();

    expect(taskkill).toHaveBeenCalledWith(4242);
    expect(directKill).not.toHaveBeenCalled();
  });

  it("falls back to the direct kill when taskkill fails", async () => {
    const child = createChild();
    const directKill = child.kill;

    installWindowsTreeKill(child, {
      platform: "win32",
      taskkill: async () => {
        throw new Error("taskkill missing");
      },
    });
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(directKill).toHaveBeenCalledWith("SIGTERM");
  });

  it("leaves kill() alone outside Windows and after exit", () => {
    const posixChild = createChild();
    const posixKill = posixChild.kill;
    installWindowsTreeKill(posixChild, { platform: "darwin" });
    expect(posixChild.kill).toBe(posixKill);

    const exitedChild = createChild({ exitCode: 0 });
    const exitedKill = exitedChild.kill;
    const taskkill = mock(async (_pid: number) => {});
    installWindowsTreeKill(exitedChild, { platform: "win32", taskkill });
    exitedChild.kill();

    expect(taskkill).not.toHaveBeenCalled();
    expect(exitedKill).toHaveBeenCalled();
  });
});

describe("buildCodexCliInvocation", () => {
  it("spawns the resolved binary directly outside Windows batch shims", () => {
    expect(
      buildCodexCliInvocation("/usr/local/bin/codex", ["app-server"], {
        platform: "darwin",
      }),
    ).toEqual({ args: ["app-server"], command: "/usr/local/bin/codex" });
    expect(
      buildCodexCliInvocation(
        "C:\\Program Files\\Codex\\codex.exe",
        ["app-server"],
        { platform: "win32" },
      ),
    ).toEqual({
      args: ["app-server"],
      command: "C:\\Program Files\\Codex\\codex.exe",
    });
  });

  it("runs a Windows codex.cmd shim through cmd.exe with escaped arguments", () => {
    const invocation = buildCodexCliInvocation(
      "C:\\Users\\Jo Doe\\AppData\\Roaming\\npm\\codex.cmd",
      [
        "exec",
        "--config",
        'model_reasoning_effort="high"',
        "--output-schema",
        "C:\\Temp\\a&b\\schema.json",
      ],
      { comSpec: "C:\\Windows\\system32\\cmd.exe", platform: "win32" },
    );

    expect(invocation.command).toBe("C:\\Windows\\system32\\cmd.exe");
    expect(invocation.windowsVerbatimArguments).toBe(true);
    expect(invocation.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(invocation.args[3]).toBe(
      [
        '"C:\\Users\\Jo^ Doe\\AppData\\Roaming\\npm\\codex.cmd',
        '^"exec^"',
        '^"--config^"',
        '^"model_reasoning_effort=\\^"high\\^"^"',
        '^"--output-schema^"',
        '^"C:\\Temp\\a^&b\\schema.json^""',
      ].join(" "),
    );
  });

  it("treats .bat shims like .cmd shims", () => {
    expect(
      buildCodexCliInvocation("D:\\tools\\codex.BAT", ["--version"], {
        comSpec: "cmd.exe",
        platform: "win32",
      }),
    ).toEqual({
      args: ["/d", "/s", "/c", '"D:\\tools\\codex.BAT ^"--version^""'],
      command: "cmd.exe",
      windowsVerbatimArguments: true,
    });
  });
});
