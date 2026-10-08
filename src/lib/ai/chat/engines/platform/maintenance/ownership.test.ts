import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { getEngineMaintenanceDefinition } = await import("./definitions");
const {
  homebrewOwnershipFromCommandPath,
  npmGlobalPrefixFromCommandPath,
  quoteShellWord,
  resolveUpdatePlan,
} = await import("./ownership");

type Fs = {
  brewPrefix?: string | null;
  exists?: string[];
  files?: Record<string, string>;
  realpaths: Record<string, string>;
  which?: Record<string, string>;
};

function deps(fs: Fs) {
  const brewCalls: string[][] = [];
  return {
    brewCalls,
    deps: {
      exists: async (target: string) => (fs.exists ?? []).includes(target),
      platform: "darwin" as const,
      readFile: async (target: string) => {
        const content = fs.files?.[target];
        if (content === undefined) throw new Error("ENOENT");
        return content;
      },
      realpath: async (target: string) => {
        const real = fs.realpaths[target];
        if (!real) throw new Error("ENOENT");
        return real;
      },
      runBrew: async (_brew: string, args: string[]) => {
        brewCalls.push(args);
        return fs.brewPrefix === undefined ? "/opt/homebrew\n" : fs.brewPrefix;
      },
      size: async (target: string) => fs.files?.[target]?.length ?? 1_000_000,
      which: async (command: string) => fs.which?.[command] ?? null,
    },
  };
}

function plan(
  driver: string,
  binaryPath: string | null,
  fs: Fs,
  options: {
    installedVersion?: string | null;
    targetVersion?: string | null;
  } = {},
) {
  const harness = deps(fs);
  return {
    harness,
    result: resolveUpdatePlan(
      {
        binaryPath,
        definition: getEngineMaintenanceDefinition(driver)!,
        driver,
        env: { PATH: "/usr/local/bin:/opt/homebrew/bin" },
        installedVersion: options.installedVersion ?? null,
        targetVersion: options.targetVersion ?? null,
      },
      harness.deps,
    ),
  };
}

describe("resolveUpdatePlan", () => {
  it("updates the Homebrew cask copilot-cli with brew upgrade --cask", async () => {
    const { harness, result } = plan("copilot", "/opt/homebrew/bin/copilot", {
      exists: ["/opt/homebrew/bin/brew"],
      realpaths: {
        "/opt/homebrew": "/opt/homebrew",
        "/opt/homebrew/bin/copilot":
          "/opt/homebrew/Caskroom/copilot-cli/1.0.22/copilot",
      },
    });

    expect(await result).toEqual({
      command: {
        args: ["upgrade", "--cask", "copilot-cli"],
        display: "brew upgrade --cask copilot-cli",
        executable: "/opt/homebrew/bin/brew",
        lockKey: "homebrew",
      },
      homebrew: {
        brewPath: "/opt/homebrew/bin/brew",
        cask: true,
        name: "copilot-cli",
      },
      kind: "command",
      owner: "homebrew-cask",
      ownerLabel: "Homebrew cask copilot-cli",
    });
    expect(harness.brewCalls).toEqual([["--prefix"]]);
  });

  it("updates a Homebrew formula and refuses a keg another brew owns", async () => {
    const formula = await plan("codex", "/usr/local/bin/codex", {
      exists: ["/usr/local/bin/brew"],
      brewPrefix: "/usr/local",
      realpaths: {
        "/usr/local": "/usr/local",
        "/usr/local/bin/codex": "/usr/local/Cellar/codex/0.160.1/bin/codex",
      },
    }).result;
    expect(formula).toEqual(
      expect.objectContaining({
        command: expect.objectContaining({ display: "brew upgrade codex" }),
        owner: "homebrew-formula",
      }),
    );

    // The keg is not under the prefix of the brew that would run: Codex's
    // own updater only owns its standalone tree, so it stays native.
    const foreign = await plan("codex", "/usr/local/bin/codex", {
      exists: ["/usr/local/bin/brew"],
      brewPrefix: "/opt/homebrew",
      realpaths: {
        "/opt/homebrew": "/opt/homebrew",
        "/usr/local/bin/codex": "/usr/local/Cellar/codex/0.160.1/bin/codex",
      },
      which: { codex: "/usr/local/bin/codex" },
    }).result;
    expect(foreign).toEqual(
      expect.objectContaining({
        command: expect.objectContaining({ display: "codex update" }),
        owner: "native",
      }),
    );
  });

  it("updates npm globals in their own prefix, pinned when a target is known", async () => {
    const fs = {
      realpaths: {
        "/Users/me/.nvm/versions/node/v24.14.1/bin/codex":
          "/Users/me/.nvm/versions/node/v24.14.1/lib/node_modules/@openai/codex/bin/codex.js",
      },
    };
    expect(
      await plan(
        "codex",
        "/Users/me/.nvm/versions/node/v24.14.1/bin/codex",
        fs,
        {
          targetVersion: "0.161.0",
        },
      ).result,
    ).toEqual(
      expect.objectContaining({
        command: {
          args: [
            "install",
            "-g",
            "--prefix",
            "/Users/me/.nvm/versions/node/v24.14.1",
            "--allow-scripts=@openai/codex",
            "@openai/codex@0.161.0",
          ],
          display:
            "npm install -g --prefix /Users/me/.nvm/versions/node/v24.14.1 --allow-scripts=@openai/codex @openai/codex@0.161.0",
          executable: "npm",
          lockKey: "npm-global:/users/me/.nvm/versions/node/v24.14.1",
        },
        owner: "npm",
      }),
    );
  });

  it("lets npm proof outrank a Homebrew Node keg", async () => {
    const result = await plan("claude", "/opt/homebrew/bin/claude", {
      exists: ["/opt/homebrew/bin/brew"],
      realpaths: {
        "/opt/homebrew/bin/claude":
          "/opt/homebrew/Cellar/node/24.14.1/lib/node_modules/@anthropic-ai/claude-code/cli.js",
      },
    }).result;
    expect(result).toEqual(expect.objectContaining({ owner: "npm" }));
  });

  it("recognizes bun and pnpm globals", async () => {
    expect(
      await plan("grok", "/Users/me/.bun/bin/grok", {
        realpaths: {
          "/Users/me/.bun/bin/grok":
            "/Users/me/.bun/install/global/node_modules/@xai-official/grok/bin/grok",
        },
      }).result,
    ).toEqual(
      expect.objectContaining({
        // grok's own updater owns every install.
        owner: "native",
      }),
    );
    expect(
      await plan("claude", "/Users/me/.bun/bin/claude", {
        realpaths: { "/Users/me/.bun/bin/claude": "/Users/me/.bun/bin/claude" },
      }).result,
    ).toEqual(
      expect.objectContaining({
        command: expect.objectContaining({
          display: "bun i -g @anthropic-ai/claude-code@latest",
        }),
        owner: "bun",
      }),
    );
    expect(
      await plan("codex", "/Users/me/Library/pnpm/codex", {
        realpaths: {
          "/Users/me/Library/pnpm/codex":
            "/Users/me/Library/pnpm/global/5/node_modules/@openai/codex/bin/codex.js",
        },
      }).result,
    ).toEqual(
      expect.objectContaining({
        command: expect.objectContaining({
          display: "pnpm add -g @openai/codex@latest",
        }),
        owner: "pnpm",
      }),
    );
  });

  it("runs the CLI's own updater where its installer owns the path", async () => {
    expect(
      await plan("claude", "/Users/me/.local/bin/claude", {
        realpaths: {
          "/Users/me/.local/bin/claude":
            "/Users/me/.local/share/claude/versions/2.1.280",
        },
        which: { claude: "/Users/me/.local/bin/claude" },
      }).result,
    ).toEqual(
      expect.objectContaining({
        command: {
          args: ["update"],
          display: "claude update",
          executable: "/Users/me/.local/bin/claude",
          lockKey:
            "claude-native:/users/me/.local/share/claude/versions/2.1.280",
        },
        owner: "native",
      }),
    );

    // Cursor Agent's installer, shown by its full path when not on PATH.
    expect(
      await plan("cursor", "/Users/me/.local/bin/agent", {
        realpaths: {
          "/Users/me/.local/bin/agent":
            "/Users/me/.local/share/cursor-agent/versions/2026.08.04-aaa8809/cursor-agent",
        },
      }).result,
    ).toEqual(
      expect.objectContaining({
        command: expect.objectContaining({
          display: "/Users/me/.local/bin/agent update",
        }),
        owner: "native",
      }),
    );
  });

  it("only upgrades OpenCode to a pinned version of its own generation", async () => {
    const fs = {
      realpaths: {
        "/Users/me/.opencode/bin/opencode": "/Users/me/.opencode/bin/opencode",
      },
      which: { opencode: "/Users/me/.opencode/bin/opencode" },
    };
    expect(
      await plan("opencode", "/Users/me/.opencode/bin/opencode", fs, {
        installedVersion: "1.3.17",
      }).result,
    ).toEqual(
      expect.objectContaining({
        kind: "manual",
        reason: expect.stringContaining(
          "latest version could not be determined",
        ),
      }),
    );
    expect(
      await plan("opencode", "/Users/me/.opencode/bin/opencode", fs, {
        installedVersion: "1.3.17",
        targetVersion: "1.18.35",
      }).result,
    ).toEqual(
      expect.objectContaining({
        command: expect.objectContaining({
          args: ["upgrade", "1.18.35"],
          display: "opencode upgrade 1.18.35",
        }),
      }),
    );
  });

  it("stays manual for mise, project node_modules and a missing binary", async () => {
    expect(
      await plan("codex", "/Users/me/.local/share/mise/shims/codex", {
        realpaths: {
          "/Users/me/.local/share/mise/shims/codex":
            "/Users/me/.local/share/mise/installs/codex/0.160.1/bin/codex",
        },
      }).result,
    ).toEqual(
      expect.objectContaining({
        kind: "manual",
        reason: expect.stringContaining("mise"),
      }),
    );
    expect(
      await plan("codex", "/Users/me/bin/codex", {
        files: {
          "/Users/me/bin/codex": '#!/bin/sh\nexec mise x codex -- codex "$@"\n',
        },
        realpaths: { "/Users/me/bin/codex": "/Users/me/bin/codex" },
      }).result,
    ).toEqual(expect.objectContaining({ kind: "manual" }));
    expect(
      await plan("claude", "/Users/me/project/node_modules/.bin/claude", {
        realpaths: {
          "/Users/me/project/node_modules/.bin/claude":
            "/Users/me/project/node_modules/@anthropic-ai/claude-code/cli.js",
        },
      }).result,
    ).toEqual(
      expect.objectContaining({
        kind: "manual",
        reason: expect.stringContaining("node_modules"),
      }),
    );
    expect(await plan("claude", null, { realpaths: {} }).result).toEqual({
      kind: "manual",
      reason: "The runtime was not found.",
    });
    expect(
      await plan("claude", "/gone/claude", { realpaths: {} }).result,
    ).toEqual(expect.objectContaining({ kind: "manual" }));
  });
});

describe("ownership helpers", () => {
  it("reads npm prefixes and Homebrew kegs from real paths", () => {
    expect(
      npmGlobalPrefixFromCommandPath(
        "/usr/local/lib/node_modules/@openai/codex/bin/codex.js",
        "@openai/codex",
      ),
    ).toBe("/usr/local");
    expect(
      npmGlobalPrefixFromCommandPath(
        "/repo/node_modules/x/lib/node_modules/@openai/codex/bin.js",
        "@openai/codex",
      ),
    ).toBe(null);
    expect(
      homebrewOwnershipFromCommandPath(
        "/opt/homebrew/Caskroom/copilot-cli/1.0.22/copilot",
      ),
    ).toEqual({ kind: "cask", name: "copilot-cli", prefix: "/opt/homebrew" });
    expect(homebrewOwnershipFromCommandPath("/usr/bin/codex")).toBe(null);
  });

  it("quotes words for the host shell", () => {
    expect(quoteShellWord("@openai/codex@latest", "darwin")).toBe(
      "@openai/codex@latest",
    );
    expect(quoteShellWord("/Users/A B/bin/agent", "darwin")).toBe(
      "'/Users/A B/bin/agent'",
    );
    expect(quoteShellWord("it's", "darwin")).toBe("'it'\\''s'");
    expect(quoteShellWord("C:\\Program Files\\x", "win32")).toBe(
      "'C:\\Program Files\\x'",
    );
  });
});
