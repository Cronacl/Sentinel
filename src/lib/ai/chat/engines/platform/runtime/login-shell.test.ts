import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  buildLoginShellLookupScript,
  getLoginShellCandidates,
  getLoginShellMarkers,
  lookupInLoginShell,
  parseLoginShellLookupOutput,
} = await import("./login-shell");

const markers = getLoginShellMarkers("cursor");

function shellOutput(commandPath: string | null, pathValue: string | null) {
  return [
    "Welcome to zsh",
    ...(commandPath
      ? [markers.commandStart, commandPath, markers.commandEnd]
      : []),
    "noise",
    ...(pathValue ? [markers.pathStart, pathValue, markers.pathEnd] : []),
  ].join("\n");
}

describe("login shell markers and scripts", () => {
  it("derives the legacy marker names from the engine name", () => {
    expect(markers).toEqual({
      commandEnd: "__SENTINEL_CURSOR_PATH_END__",
      commandStart: "__SENTINEL_CURSOR_PATH_START__",
      pathEnd: "__SENTINEL_CURSOR_SHELL_PATH_END__",
      pathStart: "__SENTINEL_CURSOR_SHELL_PATH_START__",
    });
  });

  it("builds POSIX and fish scripts that print both blocks", () => {
    const posix = buildLoginShellLookupScript("agent", {
      fish: false,
      markers,
    });
    expect(posix).toContain("if command -v agent >/dev/null 2>&1; then");
    expect(posix).toContain(`printf '%s\\n' "$PATH"`);
    expect(posix).toContain("fi");

    const fish = buildLoginShellLookupScript("agent", { fish: true, markers });
    expect(fish).toContain("if command -v agent >/dev/null 2>/dev/null");
    expect(fish).toContain("(string join : -- $PATH)");
    expect(fish).toContain("end");
  });

  it("refuses anything but a bare command name", () => {
    expect(() =>
      buildLoginShellLookupScript("agent; rm -rf ~", { fish: false, markers }),
    ).toThrow("Not a bare command name");
  });
});

describe("parseLoginShellLookupOutput", () => {
  it("reads both blocks through shell noise", () => {
    expect(
      parseLoginShellLookupOutput(
        shellOutput("/opt/homebrew/bin/agent", "/opt/homebrew/bin:/usr/bin"),
        { markers },
      ),
    ).toEqual({
      commandPath: "/opt/homebrew/bin/agent",
      pathValue: "/opt/homebrew/bin:/usr/bin",
    });
  });

  it("only accepts reported paths with the expected file name when asked", () => {
    expect(
      parseLoginShellLookupOutput(
        shellOutput("alias codex='npx codex'", "/usr/bin"),
        { commandBasenamePrefix: "codex", markers },
      ).commandPath,
    ).toBeNull();
  });

  it("ignores incomplete blocks", () => {
    expect(
      parseLoginShellLookupOutput(`${markers.commandStart}\n/bin/agent`, {
        markers,
      }),
    ).toEqual({ commandPath: null, pathValue: null });
  });
});

describe("getLoginShellCandidates", () => {
  it("uses $SHELL, else zsh, and appends fallbacks without duplicates", () => {
    expect(getLoginShellCandidates({ SHELL: "/usr/bin/fish" })).toEqual([
      "/usr/bin/fish",
    ]);
    expect(getLoginShellCandidates({})).toEqual(["/bin/zsh"]);
    expect(
      getLoginShellCandidates({ SHELL: "/bin/zsh" }, ["/bin/zsh", "/bin/bash"]),
    ).toEqual(["/bin/zsh", "/bin/bash"]);
    expect(getLoginShellCandidates({}, ["/bin/bash"])).toEqual(["/bin/bash"]);
  });
});

describe("lookupInLoginShell", () => {
  function createExecFile(outputs: Record<string, string>) {
    const calls: Array<{
      args: readonly string[];
      env: NodeJS.ProcessEnv | undefined;
      shell: string;
      timeout: number | undefined;
    }> = [];
    const execFile = (
      shell: string,
      args: readonly string[],
      options: { env?: NodeJS.ProcessEnv; timeout?: number },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      calls.push({ args, env: options.env, shell, timeout: options.timeout });
      const output = outputs[shell];
      queueMicrotask(() =>
        output === undefined
          ? callback(new Error("ENOENT"), "", "")
          : callback(null, output, ""),
      );
      return undefined;
    };
    return { calls, execFile };
  }

  it("asks the user's login shell with a fish script for fish", async () => {
    const { calls, execFile } = createExecFile({
      "/opt/homebrew/bin/fish": shellOutput("/Users/me/.local/bin/agent", "/x"),
    });

    const lookup = await lookupInLoginShell({
      command: "agent",
      env: {
        HOME: "/Users/me",
        PATH: "/usr/bin",
        SHELL: "/opt/homebrew/bin/fish",
      },
      execFile,
      markers,
      platform: "darwin",
    });

    expect(lookup).toEqual({
      commandPath: "/Users/me/.local/bin/agent",
      pathValue: "/x",
      shellPath: "/opt/homebrew/bin/fish",
    });
    expect(calls[0]?.args[0]).toBe("-l");
    expect(calls[0]?.args[1]).toBe("-c");
    expect(calls[0]?.args[2]).toContain("string join");
    expect(calls[0]?.timeout).toBe(1_200);
    expect(calls[0]?.env).toEqual(
      expect.objectContaining({ HOME: "/Users/me", TERM: "dumb" }),
    );
  });

  it("tries fallback shells until one reports the command", async () => {
    const { calls, execFile } = createExecFile({
      "/bin/bash": shellOutput("/usr/local/bin/agent", "/usr/local/bin"),
      "/bin/zsh": shellOutput(null, "/usr/bin"),
    });

    const lookup = await lookupInLoginShell({
      command: "agent",
      env: { SHELL: "/broken/shell" },
      execFile,
      markers,
      platform: "linux",
      shells: getLoginShellCandidates({ SHELL: "/broken/shell" }, [
        "/bin/zsh",
        "/bin/bash",
      ]),
    });

    expect(calls.map((call) => call.shell)).toEqual([
      "/broken/shell",
      "/bin/zsh",
      "/bin/bash",
    ]);
    expect(lookup?.commandPath).toBe("/usr/local/bin/agent");
  });

  it("can settle for a shell PATH without the command", async () => {
    const { execFile } = createExecFile({
      "/bin/zsh": shellOutput(null, "/usr/bin:/bin"),
    });

    expect(
      await lookupInLoginShell({
        command: "opencode",
        env: {},
        execFile,
        markers,
        platform: "darwin",
        stopWhen: "command-or-path",
      }),
    ).toEqual({
      commandPath: null,
      pathValue: "/usr/bin:/bin",
      shellPath: "/bin/zsh",
    });
    expect(
      await lookupInLoginShell({
        command: "opencode",
        env: {},
        execFile,
        markers,
        platform: "darwin",
      }),
    ).toBeNull();
  });

  it("uses the markers a failing shell still printed", async () => {
    const execFile = (
      _shell: string,
      _args: readonly string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(new Error("exit 1"), shellOutput("/bin/agent", "/bin"), "");
      return undefined;
    };

    expect(
      (
        await lookupInLoginShell({
          command: "agent",
          env: {},
          execFile,
          markers,
          platform: "linux",
        })
      )?.commandPath,
    ).toBe("/bin/agent");
  });

  it("never runs on Windows", async () => {
    const execFile = mock(() => undefined);

    expect(
      await lookupInLoginShell({
        command: "agent",
        execFile,
        platform: "win32",
      }),
    ).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });
});
