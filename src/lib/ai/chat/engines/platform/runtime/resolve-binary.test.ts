import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const setLocalRuntimeEnvValue = mock(
  async (_key: string, _value: string) => {},
);
mock.module("@/lib/runtime/local-runtime-env", () => ({
  setLocalRuntimeEnvValue,
}));

const {
  findExecutableInPath,
  getConfiguredBinaryOverride,
  getExecutableNames,
  getInstanceProcessEnv,
  getInstanceRuntimeKey,
  isPersistableBinaryPath,
  readEnvOverride,
  recordResolvedBinary,
  resolveBinaryStandard,
  resolveRunnablePath,
} = await import("./resolve-binary");
const { getLoginShellMarkers } = await import("./login-shell");

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-resolve-binary-"));
  setLocalRuntimeEnvValue.mockClear();
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

async function writeExecutable(relativePath: string, mode = 0o755) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "#!/bin/sh\necho tool 1.2.3\n");
  await chmod(filePath, mode);
  return filePath;
}

describe("getExecutableNames", () => {
  const pathExt = ".COM;.EXE;.BAT;.CMD;.VBS;.JS";

  it("uses the bare name on POSIX", () => {
    expect(getExecutableNames("codex", { platform: "linux" })).toEqual([
      "codex",
    ]);
  });

  it("only lists names Node can spawn for the spawnable strategy", () => {
    expect(getExecutableNames("codex", { pathExt, platform: "win32" })).toEqual(
      ["codex.COM", "codex.EXE", "codex.BAT", "codex.CMD"],
    );
    expect(
      getExecutableNames("codex.cmd", { pathExt, platform: "win32" }),
    ).toEqual(["codex.cmd"]);
    expect(
      getExecutableNames("codex", { pathExt: ".VBS", platform: "win32" }),
    ).toEqual(["codex.EXE", "codex.CMD", "codex.BAT", "codex.COM"]);
  });

  it("supports the PATHEXT-only and bare-first strategies", () => {
    expect(
      getExecutableNames("claude", {
        pathExt: ".EXE;.CMD",
        platform: "win32",
        strategy: "pathext",
      }),
    ).toEqual(["claude.EXE", "claude.CMD"]);
    expect(
      getExecutableNames("claude.cmd", {
        pathExt: ".EXE;.CMD",
        platform: "win32",
        strategy: "pathext",
      }),
    ).toEqual(["claude.cmd"]);
    expect(
      getExecutableNames("agent", {
        pathExt: ".EXE;.CMD",
        platform: "win32",
        strategy: "pathext-or-bare",
      }),
    ).toEqual(["agent", "agent.EXE", "agent.CMD"]);
  });
});

describe("PATH search", () => {
  it("finds the first executable match and skips non-executable files", async () => {
    if (process.platform === "win32") return;
    await writeExecutable("first/tool", 0o644);
    const second = await writeExecutable("second/tool");

    expect(
      await findExecutableInPath(
        "tool",
        [
          path.join(root, "missing"),
          path.join(root, "first"),
          path.join(root, "second"),
        ].join(path.delimiter),
      ),
    ).toBe(second);
    expect(await findExecutableInPath("tool", "")).toBeNull();
  });

  it("resolves relative PATH entries against the working directory", async () => {
    if (process.platform === "win32") return;
    const tool = await writeExecutable("bin/tool");

    expect(await findExecutableInPath("tool", "bin", { cwd: () => root })).toBe(
      tool,
    );
  });

  it("maps a known path to its runnable Windows sibling", async () => {
    await writeFile(path.join(root, "codex"), "#!/bin/sh\n");
    await writeFile(path.join(root, "codex.cmd"), "@echo off\r\n");

    expect(
      // Lower case so the lookup also matches on case-sensitive test
      // filesystems; Windows matches PATHEXT case-insensitively.
      await resolveRunnablePath(path.join(root, "codex"), {
        pathExt: ".exe;.cmd",
        platform: "win32",
      }),
    ).toBe(path.join(root, "codex.cmd"));
    expect(await resolveRunnablePath(path.join(root, "missing"))).toBeNull();
  });
});

describe("instance environment and overrides", () => {
  it("layers the instance's variables over the server environment", () => {
    const base = { CODEX_HOME: "/global", KEEP: "1", TOKEN: "global-token" };

    expect(
      getInstanceProcessEnv(null, base as unknown as NodeJS.ProcessEnv),
    ).toBe(base);
    expect(
      getInstanceProcessEnv(
        { envOverrides: { CODEX_HOME: "/work" }, envUnset: ["TOKEN"] },
        base as unknown as NodeJS.ProcessEnv,
      ),
    ).toEqual({ CODEX_HOME: "/work", KEEP: "1" });
    expect(base.TOKEN).toBe("global-token");
  });

  it("prefers the configured binary and keeps legacy variables to the default instance", () => {
    const env = { CODEX_PATH: "/env/codex", SENTINEL_CODEX_PATH: " " };
    const keys = ["SENTINEL_CODEX_PATH", "CODEX_PATH"];

    expect(readEnvOverride(env, keys)).toEqual({
      key: "CODEX_PATH",
      path: "/env/codex",
    });
    expect(getConfiguredBinaryOverride(null, env, keys)).toEqual({
      key: "CODEX_PATH",
      path: "/env/codex",
      source: "env",
    });
    expect(
      getConfiguredBinaryOverride(
        { config: { binaryPath: " /cfg/codex " }, isDefault: false },
        env,
        keys,
      ),
    ).toEqual({ key: null, path: "/cfg/codex", source: "config" });
    expect(
      getConfiguredBinaryOverride({ config: {}, isDefault: false }, env, keys),
    ).toBeNull();
    expect(
      getConfiguredBinaryOverride({ config: {}, isDefault: true }, env, keys)
        ?.source,
    ).toBe("env");
  });

  it("never remembers fnm's per-shell paths", () => {
    expect(isPersistableBinaryPath("/Users/me/.local/bin/codex")).toBe(true);
    expect(
      isPersistableBinaryPath(
        "/Users/me/.local/state/fnm_multishells/1_2/bin/codex",
      ),
    ).toBe(false);
    expect(
      isPersistableBinaryPath("C:\\Users\\me\\fnm_multishells\\1\\codex.cmd"),
    ).toBe(false);
  });
});

describe("resolveBinaryStandard", () => {
  const noShell = (
    _command: string,
    _args: readonly string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    callback(new Error("no shell"), "", "");
    return undefined;
  };

  it("uses the configured binary first and reports how it was found", async () => {
    if (process.platform === "win32") return;
    const configured = await writeExecutable("custom/grok");
    await writeExecutable("bin/grok");

    const result = await resolveBinaryStandard({
      command: "grok",
      env: { PATH: path.join(root, "bin") },
      execFile: noShell,
      instance: { config: { binaryPath: configured }, isDefault: false },
      managedPathValue: path.join(root, "bin"),
    });

    expect(result).toEqual({
      rejectedOverride: null,
      resolved: {
        env: { PATH: path.join(root, "bin") },
        path: configured,
        source: "config",
        version: null,
      },
    });
  });

  it("falls back to the managed PATH when the override cannot run", async () => {
    if (process.platform === "win32") return;
    const onPath = await writeExecutable("bin/grok");
    const verify = mock(async (candidate: string) =>
      candidate === onPath ? { path: candidate, version: "grok 1.0.13" } : null,
    );

    const result = await resolveBinaryStandard({
      command: "grok",
      env: { SENTINEL_GROK_PATH: path.join(root, "missing/grok") },
      execFile: noShell,
      legacyEnvKeys: ["SENTINEL_GROK_PATH"],
      managedPathValue: path.join(root, "bin"),
      verify,
    });

    expect(result.rejectedOverride).toEqual({
      path: path.join(root, "missing/grok"),
      source: "env",
    });
    expect(result.resolved).toEqual(
      expect.objectContaining({
        path: onPath,
        source: "managed-path",
        version: "grok 1.0.13",
      }),
    );
  });

  it("asks the login shell last and launches with its PATH", async () => {
    if (process.platform === "win32") return;
    const shellBin = path.join(root, "shell-bin");
    const tool = await writeExecutable("shell-bin/pi");
    const markers = getLoginShellMarkers("pi");
    const execFile = (
      _command: string,
      _args: readonly string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(
        null,
        [
          markers.commandStart,
          tool,
          markers.commandEnd,
          markers.pathStart,
          shellBin,
          markers.pathEnd,
        ].join("\n"),
        "",
      );
      return undefined;
    };

    const result = await resolveBinaryStandard({
      command: "pi",
      env: { PATH: "/nowhere", SHELL: "/bin/zsh" },
      execFile,
      managedPathValue: path.join(root, "empty"),
      platform: "darwin",
    });

    expect(result.resolved).toEqual({
      env: { PATH: shellBin, SHELL: "/bin/zsh" },
      path: tool,
      source: "login-shell",
      version: null,
    });
  });

  it("returns nothing when no step finds the binary", async () => {
    expect(
      await resolveBinaryStandard({
        command: "nope",
        env: {},
        execFile: noShell,
        managedPathValue: path.join(root, "empty"),
      }),
    ).toEqual({ rejectedOverride: null, resolved: null });
  });
});

describe("recordResolvedBinary", () => {
  function createStore() {
    const entries = new Map<string, Record<string, unknown>>();
    return {
      entries,
      get: mock(async (id: string) => (entries.get(id) as never) ?? null),
      set: mock(async (id: string, entry: Record<string, unknown>) => {
        entries.set(id, entry);
        return entry as never;
      }),
    };
  }

  it("records the instance's binary with its real path, once per change", async () => {
    if (process.platform === "win32") return;
    const target = await writeExecutable("cellar/codex");
    const link = path.join(root, "codex");
    await symlink(target, link);
    const store = createStore();

    const binary = {
      path: link,
      source: "managed-path" as const,
      version: "1",
    };
    await recordResolvedBinary(binary, { instanceId: "codex-work", store });
    await recordResolvedBinary(binary, { instanceId: "codex-work", store });

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.entries.get("codex-work")).toEqual({
      binaryPath: link,
      realPath: expect.stringContaining("cellar/codex"),
      source: "managed-path",
      version: "1",
    });
    expect(setLocalRuntimeEnvValue).not.toHaveBeenCalled();
  });

  it("keeps the legacy desktop.env hint for a default instance", async () => {
    const store = createStore();
    const original = process.env.SENTINEL_TEST_TOOL_PATH;

    try {
      await recordResolvedBinary(
        { path: "/usr/local/bin/codex", source: "login-shell", version: null },
        { instanceId: "codex", legacyEnvKey: "SENTINEL_TEST_TOOL_PATH", store },
      );
      expect(setLocalRuntimeEnvValue.mock.calls).toEqual([
        ["SENTINEL_TEST_TOOL_PATH", "/usr/local/bin/codex"],
      ]);

      // Per-shell fnm paths only live in this process.
      await recordResolvedBinary(
        {
          path: "/Users/me/.local/state/fnm_multishells/9/bin/codex",
          source: "login-shell",
          version: null,
        },
        { instanceId: "codex", legacyEnvKey: "SENTINEL_TEST_TOOL_PATH", store },
      );
      expect(setLocalRuntimeEnvValue).toHaveBeenCalledTimes(1);
      expect(process.env.SENTINEL_TEST_TOOL_PATH).toBe(
        "/Users/me/.local/state/fnm_multishells/9/bin/codex",
      );
      expect(store.set).toHaveBeenCalledTimes(1);
    } finally {
      if (original === undefined) {
        delete process.env.SENTINEL_TEST_TOOL_PATH;
      } else {
        process.env.SENTINEL_TEST_TOOL_PATH = original;
      }
    }
  });

  it("never turns a configured binaryPath into the legacy override", async () => {
    const store = createStore();
    const original = process.env.SENTINEL_TEST_TOOL_PATH;
    delete process.env.SENTINEL_TEST_TOOL_PATH;

    try {
      await recordResolvedBinary(
        { path: "/opt/tools/codex", source: "config", version: null },
        { instanceId: "codex", legacyEnvKey: "SENTINEL_TEST_TOOL_PATH", store },
      );

      expect(setLocalRuntimeEnvValue).not.toHaveBeenCalled();
      expect(process.env.SENTINEL_TEST_TOOL_PATH).toBeUndefined();
      // Clearing binaryPath must fall back to discovery, not to this path.
      expect(
        getConfiguredBinaryOverride(
          { config: {}, isDefault: true },
          process.env,
          ["SENTINEL_TEST_TOOL_PATH"],
        ),
      ).toBeNull();
      expect(store.entries.get("codex")).toEqual(
        expect.objectContaining({
          binaryPath: "/opt/tools/codex",
          source: "config",
        }),
      );
    } finally {
      if (original === undefined) {
        delete process.env.SENTINEL_TEST_TOOL_PATH;
      } else {
        process.env.SENTINEL_TEST_TOOL_PATH = original;
      }
    }
  });

  it("never throws when the store fails", async () => {
    await expect(
      recordResolvedBinary(
        { path: "/bin/tool", source: "config", version: null },
        {
          instanceId: "tool",
          store: {
            get: async () => {
              throw new Error("disk full");
            },
            set: async () => {
              throw new Error("disk full");
            },
          },
        },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("getInstanceRuntimeKey", () => {
  const base = {
    config: {},
    envOverrides: {},
    envUnset: [] as string[],
    id: "codex",
    isDefault: true,
  };

  it("shares the default key between no instance and a plain default instance", () => {
    expect(getInstanceRuntimeKey(null)).toBe("default");
    expect(getInstanceRuntimeKey(base)).toBe("default");
  });

  it("keys customized and non-default instances by id and configuration", () => {
    const work = { ...base, id: "codex-work", isDefault: false };
    const key = getInstanceRuntimeKey(work);

    expect(key).toStartWith("codex-work:");
    expect(getInstanceRuntimeKey({ ...work })).toBe(key);
    expect(
      getInstanceRuntimeKey({ ...work, envOverrides: { CODEX_HOME: "/h" } }),
    ).not.toBe(key);
    expect(
      getInstanceRuntimeKey({ ...base, config: { binaryPath: "/bin/codex" } }),
    ).toStartWith("codex:");
    // Order of variables does not matter.
    expect(
      getInstanceRuntimeKey({ ...work, envOverrides: { A: "1", B: "2" } }),
    ).toBe(
      getInstanceRuntimeKey({ ...work, envOverrides: { B: "2", A: "1" } }),
    );
  });
});
