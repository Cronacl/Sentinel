import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { probeBinaryVersion, readFirstOutputLine, runCommandProbe } =
  await import("./version-probe");

type ExecCall = {
  args: readonly string[];
  command: string;
  options: Record<string, unknown>;
};

function createExecFile(result: {
  error?: Error | null;
  stderr?: string;
  stdout?: string;
}) {
  const calls: ExecCall[] = [];
  const execFile = (
    command: string,
    args: readonly string[],
    options: Record<string, unknown>,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    calls.push({ args, command, options });
    queueMicrotask(() =>
      callback(result.error ?? null, result.stdout ?? "", result.stderr ?? ""),
    );
    return undefined;
  };
  return { calls, execFile };
}

describe("runCommandProbe", () => {
  it("runs `--version` with the given env and timeout", async () => {
    const { calls, execFile } = createExecFile({
      stdout: "codex-cli 0.160.0\n",
    });

    const result = await runCommandProbe({
      command: "/usr/local/bin/codex",
      env: { PATH: "/usr/bin" },
      execFile,
      platform: "darwin",
      timeoutMs: 900,
    });

    expect(result).toEqual({
      error: null,
      stderr: "",
      stdout: "codex-cli 0.160.0\n",
    });
    expect(calls).toEqual([
      {
        args: ["--version"],
        command: "/usr/local/bin/codex",
        options: { env: { PATH: "/usr/bin" }, timeout: 900, windowsHide: true },
      },
    ]);
  });

  it("runs Windows batch shims through cmd.exe", async () => {
    const { calls, execFile } = createExecFile({ stdout: "1.0.0" });

    await runCommandProbe({
      args: ["--help"],
      command: "C:\\npm\\copilot.cmd",
      execFile,
      platform: "win32",
    });

    expect(calls[0]?.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(calls[0]?.options.windowsVerbatimArguments).toBe(true);
  });

  it("never throws", async () => {
    const throwing = () => {
      throw new Error("spawn EACCES");
    };

    expect(
      (await runCommandProbe({ command: "x", execFile: throwing })).error
        ?.message,
    ).toBe("spawn EACCES");
  });
});

describe("probeBinaryVersion", () => {
  it("reports the first output line of a clean exit", async () => {
    const { execFile } = createExecFile({
      stderr: "",
      stdout: "\n  agent 2026.08.04  \nmore",
    });

    expect(await probeBinaryVersion({ command: "agent", execFile })).toEqual({
      launchable: true,
      version: "agent 2026.08.04",
    });
  });

  it("rejects a failing binary unless failure output is accepted", async () => {
    const { execFile } = createExecFile({
      error: new Error("exit 1"),
      stderr: "opencode 1.3.17",
    });
    const silent = createExecFile({ error: new Error("ENOENT") });

    expect(await probeBinaryVersion({ command: "opencode", execFile })).toEqual(
      { launchable: false, version: null },
    );
    expect(
      await probeBinaryVersion({
        acceptFailureOutput: true,
        command: "opencode",
        execFile,
      }),
    ).toEqual({ launchable: true, version: "opencode 1.3.17" });
    expect(
      await probeBinaryVersion({
        acceptFailureOutput: true,
        command: "opencode",
        execFile: silent.execFile,
      }),
    ).toEqual({ launchable: false, version: null });
  });
});

describe("readFirstOutputLine", () => {
  it("skips blank lines across outputs", () => {
    expect(readFirstOutputLine("", "\r\n warn \r\n")).toBe("warn");
    expect(readFirstOutputLine(null, undefined, "")).toBeNull();
  });
});
