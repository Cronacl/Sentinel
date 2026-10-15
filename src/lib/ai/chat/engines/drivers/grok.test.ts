import path from "node:path";

import { describe, expect, it, mock } from "bun:test";

import type { EngineProbeResult } from "../contract";

// The Grok driver's probe additions (sign-in state, skills, the update hint)
// with a fake CLI; the ACP part of the probe is tested in acp/agents/grok.

mock.module("server-only", () => ({}));

const { enrichGrokProbe, parseGrokInspectSkills, parseGrokModelsLogin } =
  await import("./grok");
const { makeFakeInstance } = await import("../contract/testing");

const instance = makeFakeInstance({
  driver: "grok",
  env: { PATH: "/usr/bin" },
  id: "grok",
  stateDir: "/state/grok",
});

function acpResult(
  overrides: Partial<EngineProbeResult> = {},
): EngineProbeResult {
  return {
    auth: {
      canLogin: false,
      canLogout: false,
      email: null,
      label: null,
      method: null,
      plan: null,
      status: "authenticated",
    },
    install: {
      installed: true,
      path: "/opt/bin/grok",
      source: "managed-path",
      version: "grok 1.0.50 (abc)",
    },
    models: [],
    status: "ready",
    ...overrides,
  };
}

/** A fake `grok` answering `models` and `inspect --json`. */
function fakeCli(outputs: Record<string, { code?: number; stdout: string }>) {
  const calls: Array<{ args: readonly string[]; cwd?: string }> = [];
  const execFile = ((
    _command: string,
    args: readonly string[],
    options: { cwd?: string },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    calls.push({ args, cwd: options.cwd });
    const output = outputs[args.join(" ")];
    queueMicrotask(() =>
      output
        ? callback(
            output.code
              ? Object.assign(new Error("exit"), { code: output.code })
              : null,
            output.stdout,
            "",
          )
        : callback(
            Object.assign(new Error("spawn"), { code: "ENOENT" }),
            "",
            "",
          ),
    );
    return {};
  }) as never;
  return { calls, execFile };
}

// The login files are looked up with POSIX paths on every host.
const noLogin = {
  homeDirectory: "/home/me",
  platform: "linux" as const,
  readFile: async () => {
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  },
};

const inspect = JSON.stringify({
  skills: [
    {
      description: "Review code",
      name: "review",
      source: { path: "/home/me/.grok/skills/review/SKILL.md", type: "user" },
      userInvocable: true,
    },
    {
      name: "hidden",
      source: { path: "/p/SKILL.md", type: "plugin" },
      userInvocable: false,
    },
    { name: "broken" },
  ],
});

describe("parseGrokModelsLogin", () => {
  it("reads the login line `grok models` prints", () => {
    expect(parseGrokModelsLogin("You are logged in with grok.com.\n")).toBe(
      true,
    );
    expect(parseGrokModelsLogin("Not logged in. Run grok login")).toBe(false);
    expect(parseGrokModelsLogin("Available models:\n  * grok-4.7")).toBeNull();
  });
});

describe("parseGrokInspectSkills", () => {
  it("maps skills with a path, sorted, keeping non-invocable ones disabled", () => {
    expect(parseGrokInspectSkills(inspect)).toEqual([
      {
        enabled: false,
        name: "hidden",
        path: "/p/SKILL.md",
        scope: "plugin",
        userInvocable: false,
      },
      {
        description: "Review code",
        enabled: true,
        name: "review",
        path: "/home/me/.grok/skills/review/SKILL.md",
        scope: "user",
      },
    ]);
    expect(parseGrokInspectSkills("not json")).toBeNull();
  });
});

describe("enrichGrokProbe", () => {
  it("reports a signed-out CLI as a warning with how to sign in, and its skills", async () => {
    const cli = fakeCli({
      "inspect --json": { stdout: inspect },
      models: { stdout: "Not logged in.\n" },
    });
    const result = await enrichGrokProbe(instance, acpResult(), {
      ...noLogin,
      execFile: cli.execFile,
    });

    expect(result.auth.status).toBe("unauthenticated");
    expect(result.status).toBe("warning");
    expect(result.message).toContain("grok login");
    expect(result.skills?.map((skill) => skill.name)).toEqual([
      "hidden",
      "review",
    ]);
    expect(cli.calls.find((call) => call.args[0] === "inspect")?.cwd).toBe(
      path.join("/state/grok", "probe-cwd"),
    );
  });

  it("trusts XAI_API_KEY or the grok.com login without running `grok models`", async () => {
    const cli = fakeCli({ "inspect --json": { stdout: "{}" } });
    const withKey = await enrichGrokProbe(
      { ...instance, env: { XAI_API_KEY: "k" } },
      acpResult(),
      { ...noLogin, execFile: cli.execFile },
    );
    expect(withKey.auth).toMatchObject({
      method: "xAI API key",
      status: "authenticated",
    });

    const login = await enrichGrokProbe(instance, acpResult(), {
      execFile: cli.execFile,
      homeDirectory: "/home/me",
      platform: "linux",
      readFile: async (target) => {
        if (target === "/home/me/.grok/auth.json") {
          return JSON.stringify({
            "https://accounts.x.ai/sign-in": { email: "me@x.ai", key: "tok" },
          });
        }
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    });
    expect(login.auth).toMatchObject({
      email: "me@x.ai",
      method: "Grok account",
      status: "authenticated",
    });
    expect(login.status).toBe("ready");
    expect(cli.calls.some((call) => call.args[0] === "models")).toBe(false);
  });

  it("leaves the sign-in unknown when `grok models` fails, and skills out when inspect fails", async () => {
    const cli = fakeCli({ models: { code: 2, stdout: "You are logged in" } });
    const result = await enrichGrokProbe(instance, acpResult(), {
      ...noLogin,
      execFile: cli.execFile,
    });
    expect(result.auth.status).toBe("unknown");
    expect(result.status).toBe("ready");
    expect(result.skills).toBeUndefined();
  });

  it("says to run `grok update` when an old CLI could not start the agent", async () => {
    const cli = fakeCli({});
    const result = await enrichGrokProbe(
      instance,
      acpResult({
        install: {
          installed: true,
          path: "/opt/bin/grok",
          source: "managed-path",
          version: "grok 0.2.39 (55a20b703aa)",
        },
        message: "Grok Build took too long to answer.",
        status: "error",
      }),
      { ...noLogin, execFile: cli.execFile },
    );
    expect(result.message).toContain("Update it with `grok update`");
    expect(result.message).toContain("1.0.13");
    expect(cli.calls).toEqual([]);
  });

  it("returns a missing CLI unchanged", async () => {
    const missing = acpResult({
      install: { installed: false, path: null, source: null, version: null },
      status: "error",
    });
    expect(await enrichGrokProbe(instance, missing)).toBe(missing);
  });
});
