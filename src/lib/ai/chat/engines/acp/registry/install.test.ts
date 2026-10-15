import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { parseAcpRegistryIndex, resolveAcpRegistryDistribution } =
  await import("./schema");
const {
  describeAcpRegistryDistributions,
  getAcpRegistryToolDirectory,
  installAcpRegistryAgent,
  readAcpRegistryLaunch,
  uninstallAcpRegistryAgent,
} = await import("./install");
const { buildTarGz } = await import("@/lib/runtime/managed-install/testing");
const { writeFakeCli } =
  await import("@/lib/ai/chat/engines/platform/testing/fake-cli");
const { registryIndex } = await import("./__tests__/fixtures");

// Installs run the real installers: the managed download (a served archive)
// and npm / uv replaced by small fake programs that do what each one does
// to a prefix, spawned through the platform's process handling.

let root: string;
let bin: string;

const agents = parseAcpRegistryIndex(registryIndex())!.agents;
const agent = (id: string) => agents.find((entry) => entry.id === id)!;

// The fakes are Node scripts (run through a .cmd shim on Windows), so they
// behave the same on every host. Arguments start at process.argv[2].
const FAKE_PROGRAM_PRELUDE = `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
`;

// npm install --global --no-audit --no-fund <spec>, into the prefix layout
// of the injected platform: <prefix>/lib/node_modules on POSIX,
// <prefix>/node_modules on Windows (FAKE_WINDOWS_LAYOUT).
const FAKE_NPM_PACKAGE = `
const spec = args[4];
const at = spec.lastIndexOf("@");
const name = spec.slice(0, at);
const version = spec.slice(at + 1);
const dir = path.join(
  process.env.npm_config_prefix,
  ...(process.env.FAKE_WINDOWS_LAYOUT ? [] : ["lib"]),
  "node_modules",
  name,
);
`;

const FAKE_NPM = `${FAKE_PROGRAM_PRELUDE}
fs.appendFileSync(process.env.FAKE_LOG, args.join(" ") + "\\n");
${FAKE_NPM_PACKAGE}
fs.mkdirSync(path.join(dir, "bundle"), { recursive: true });
fs.writeFileSync(
  path.join(dir, "package.json"),
  JSON.stringify({ name, version, bin: { gemini: "bundle/gemini.js" } }),
);
fs.writeFileSync(path.join(dir, "bundle", "gemini.js"), 'console.log("gemini")\\n');
`;

// Like @xai-official/grok: after postinstall the bin is a link to a native
// executable (here, a file starting with the ELF magic).
const FAKE_NPM_NATIVE_BIN = `${FAKE_PROGRAM_PRELUDE}
${FAKE_NPM_PACKAGE}
fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
fs.writeFileSync(
  path.join(dir, "package.json"),
  JSON.stringify({ name, version, bin: { gemini: "bin/gemini" } }),
);
const native = path.join(dir, "bin", "gemini-native");
fs.writeFileSync(native, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]), { mode: 0o755 });
try {
  fs.symlinkSync("gemini-native", path.join(dir, "bin", "gemini"));
} catch {
  // Windows without the symlink privilege: the native file itself.
  fs.copyFileSync(native, path.join(dir, "bin", "gemini"));
}
`;

const FAKE_UV = `${FAKE_PROGRAM_PRELUDE}
fs.appendFileSync(process.env.FAKE_LOG, args.join(" ") + "\\n");
fs.mkdirSync(path.join(process.env.UV_TOOL_DIR, "fast-agent-acp"), { recursive: true });
fs.writeFileSync(
  path.join(
    process.env.UV_TOOL_BIN_DIR,
    process.env.FAKE_WINDOWS_LAYOUT ? "fast-agent-acp.exe" : "fast-agent-acp",
  ),
  "#!/bin/sh\\necho fast\\n",
  { mode: 0o755 },
);
`;

const FAILING = `
process.stderr.write("npm ERR! 404 Not Found\\n");
process.exitCode = 1;
`;

function fakeProgram(name: string, source: string) {
  return writeFakeCli(path.join(bin, name), source);
}

function env() {
  // The whole host env: Windows' cmd.exe and runtime need SystemRoot & co.
  return { ...process.env, FAKE_LOG: path.join(root, "calls.log") };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "sentinel-acp-install-"));
  bin = path.join(root, "fake-bin");
  await mkdir(bin);
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

describe("installAcpRegistryAgent", () => {
  it("installs an npx agent into a private npm prefix and launches its bin script", async () => {
    const npm = await fakeProgram("npm", FAKE_NPM);
    const phases: string[] = [];
    const receipt = await installAcpRegistryAgent(
      agent("gemini"),
      {
        env: env(),
        onProgress: (progress) => phases.push(progress.phase),
        preference: "auto",
        signal: new AbortController().signal,
      },
      {
        platform: "darwin",
        stateRoot: root,
        which: async (command) => (command === "npm" ? npm : null),
      },
    );

    const prefix = path.join(root, "tools", "npm", "gemini");
    expect(receipt).toMatchObject({
      args: ["--acp"],
      command: path.join(
        prefix,
        "lib/node_modules/@google/gemini-cli/bundle/gemini.js",
      ),
      distribution: "npx",
      launcher: "node",
      packageSpec: "@google/gemini-cli@0.63.0",
      version: "0.63.0",
    });
    expect(await readFile(path.join(root, "calls.log"), "utf8")).toBe(
      "install --global --no-audit --no-fund @google/gemini-cli@0.63.0\n",
    );
    expect(phases).toEqual(["downloading", "succeeded"]);
    expect(await readAcpRegistryLaunch("gemini", root)).toEqual(receipt);
  });

  it("installs a uvx agent with its tool and bin directories under the state root", async () => {
    const uv = await fakeProgram("uv", FAKE_UV);
    const receipt = await installAcpRegistryAgent(
      agent("fast-agent"),
      { env: env(), preference: "auto", signal: new AbortController().signal },
      {
        platform: "darwin",
        stateRoot: root,
        which: async (command) => (command === "uv" ? uv : null),
      },
    );
    expect(receipt).toMatchObject({
      args: ["-x"],
      command: path.join(
        root,
        "tools",
        "uv",
        "fast-agent",
        "bin",
        "fast-agent-acp",
      ),
      distribution: "uvx",
      launcher: "direct",
    });
    expect(await readFile(path.join(root, "calls.log"), "utf8")).toBe(
      "tool install --force fast-agent-acp==0.10.1\n",
    );
  });

  it("finds npm and uv installs where they land on Windows", async () => {
    const npm = await fakeProgram("npm", FAKE_NPM);
    const uv = await fakeProgram("uv", FAKE_UV);
    const windowsEnv = { ...env(), FAKE_WINDOWS_LAYOUT: "1" };
    const deps = {
      arch: "x64",
      platform: "win32" as const,
      stateRoot: root,
      which: async (command: string) =>
        command === "npm" ? npm : command === "uv" ? uv : null,
    };
    const signal = new AbortController().signal;
    expect(
      await installAcpRegistryAgent(
        agent("gemini"),
        { env: windowsEnv, preference: "npx", signal },
        deps,
      ),
    ).toMatchObject({
      command: path.join(
        root,
        "tools/npm/gemini/node_modules/@google/gemini-cli/bundle/gemini.js",
      ),
      launcher: "node",
    });
    expect(
      await installAcpRegistryAgent(
        agent("fast-agent"),
        { env: windowsEnv, preference: "auto", signal },
        deps,
      ),
    ).toMatchObject({
      command: path.join(root, "tools/uv/fast-agent/bin/fast-agent-acp.exe"),
      launcher: "direct",
    });
  });

  it("downloads a binary agent with the managed installer", async () => {
    const archive = buildTarGz([
      { data: "#!/bin/sh\necho devin\n", mode: 0o755, name: "bin/devin" },
    ]);
    const fetch = mock(async (url: string) => {
      const response = new Response(archive);
      Object.defineProperty(response, "url", { value: url });
      return response;
    });
    const receipt = await installAcpRegistryAgent(
      agent("devin"),
      { env: env(), preference: "auto", signal: new AbortController().signal },
      { arch: "x64", fetch, platform: "linux", stateRoot: root },
    );
    expect(fetch.mock.calls[0]![0]).toBe(
      "https://static.devin.ai/cli/3000.11.3/devin-linux-x64.tar.gz",
    );
    expect(receipt).toMatchObject({
      args: ["acp"],
      command: path.join(
        root,
        "tools",
        "acp",
        "devin",
        "3000.11.3",
        "bin",
        "devin",
      ),
      distribution: "binary",
      // linux-x86_64 publishes no checksum.
      verified: false,
    });
    // Windows has no execute bits.
    if (process.platform !== "win32") {
      expect((await stat(receipt.command)).mode & 0o111).not.toBe(0);
    }
  });

  it("refuses a pinned checksum that does not match", async () => {
    const fetch = async (url: string) => {
      const response = new Response(
        buildTarGz([{ data: "x", name: "bin/devin" }]),
      );
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
    await expect(
      installAcpRegistryAgent(
        agent("devin"),
        {
          env: env(),
          preference: "binary",
          signal: new AbortController().signal,
        },
        { arch: "arm64", fetch, platform: "darwin", stateRoot: root },
      ),
    ).rejects.toThrow();
    expect(await readAcpRegistryLaunch("devin", root)).toBeNull();
  });

  it("runs an npm bin linked to a native executable directly, not under node", async () => {
    const npm = await fakeProgram("npm", FAKE_NPM_NATIVE_BIN);
    const receipt = await installAcpRegistryAgent(
      agent("gemini"),
      { env: env(), preference: "npx", signal: new AbortController().signal },
      { platform: "darwin", stateRoot: root, which: async () => npm },
    );
    expect(receipt).toMatchObject({
      command: path.join(
        root,
        "tools/npm/gemini/lib/node_modules/@google/gemini-cli/bin/gemini",
      ),
      launcher: "direct",
    });
  });

  it("keeps the installed release until an update succeeds, then prunes it", async () => {
    let fail = false;
    const fetch = async (url: string) => {
      const response = fail
        ? new Response("unavailable", { status: 503 })
        : new Response(
            buildTarGz([
              { data: "#!/bin/sh\n", mode: 0o755, name: "bin/devin" },
            ]),
          );
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
    const deps = {
      arch: "x64",
      fetch,
      platform: "linux" as const,
      stateRoot: root,
    };
    const install = (target: ReturnType<typeof agent>) =>
      installAcpRegistryAgent(
        target,
        {
          env: env(),
          preference: "auto",
          signal: new AbortController().signal,
        },
        deps,
      );
    const old = await install(agent("devin"));
    const next = {
      ...agent("devin"),
      distribution: {
        binary: {
          "linux-x86_64": {
            archive:
              "https://static.devin.ai/cli/3000.12.0/devin-linux-x64.tar.gz",
            args: ["acp"],
            cmd: "./bin/devin",
          },
        },
      },
      version: "3000.12.0",
    };

    fail = true;
    await expect(install(next)).rejects.toThrow();
    expect(await readAcpRegistryLaunch("devin", root)).toEqual(old);
    expect(await stat(old.command).catch(() => null)).not.toBeNull();

    fail = false;
    const updated = await install(next);
    expect(updated.version).toBe("3000.12.0");
    expect(await stat(updated.command).catch(() => null)).not.toBeNull();
    expect(await stat(old.command).catch(() => null)).toBeNull();
  });

  it("explains a missing npm or uv, and reports a failing installer", async () => {
    await expect(
      installAcpRegistryAgent(
        agent("gemini"),
        { env: env(), preference: "npx", signal: new AbortController().signal },
        { stateRoot: root, which: async () => null },
      ),
    ).rejects.toThrow("Install Node.js");

    const npm = await fakeProgram("npm", FAILING);
    await expect(
      installAcpRegistryAgent(
        agent("gemini"),
        { env: env(), preference: "npx", signal: new AbortController().signal },
        { stateRoot: root, which: async () => npm },
      ),
    ).rejects.toThrow("npm ERR! 404 Not Found");
    expect(await readAcpRegistryLaunch("gemini", root)).toBeNull();
  });

  it("uninstalls everything it installed for the agent", async () => {
    const npm = await fakeProgram("npm", FAKE_NPM);
    await installAcpRegistryAgent(
      agent("gemini"),
      { env: env(), preference: "npx", signal: new AbortController().signal },
      { platform: "darwin", stateRoot: root, which: async () => npm },
    );
    await uninstallAcpRegistryAgent("gemini", root);
    expect(await readAcpRegistryLaunch("gemini", root)).toBeNull();
    expect(
      await stat(path.join(root, "tools", "npm", "gemini")).catch(() => null),
    ).toBeNull();
    expect(() => getAcpRegistryToolDirectory("../x", root)).toThrow();
  });
});

describe("binary archive formats", () => {
  const withArchive = (archive: string) => ({
    ...agent("gemini"),
    distribution: {
      ...agent("gemini").distribution,
      binary: { "linux-x86_64": { archive, cmd: "./gemini" } },
    },
  });

  it("offers tar.bz2 binaries and skips formats the installer cannot unpack", async () => {
    const npm = { which: async () => "/usr/bin/npm" };
    const linux = { arch: "x64", platform: "linux" as const, ...npm };
    const bz2 = withArchive("https://example.com/gemini.tar.bz2");
    expect(
      resolveAcpRegistryDistribution(bz2, "auto", "linux-x86_64")?.kind,
    ).toBe("binary");
    expect(
      (await describeAcpRegistryDistributions(bz2, {}, linux))[0],
    ).toMatchObject({ available: true, kind: "binary" });

    const xz = withArchive("https://example.com/gemini.tar.xz");
    expect(
      resolveAcpRegistryDistribution(xz, "auto", "linux-x86_64")?.kind,
    ).toBe("npx");
    expect(
      resolveAcpRegistryDistribution(xz, "binary", "linux-x86_64"),
    ).toBeNull();
    expect(
      (await describeAcpRegistryDistributions(xz, {}, linux))[0],
    ).toMatchObject({
      advisory: "Sentinel cannot unpack this archive format yet.",
      available: false,
      kind: "binary",
    });
  });
});

describe("describeAcpRegistryDistributions", () => {
  it("advises installing Node or uv when the package manager is missing", async () => {
    expect(
      await describeAcpRegistryDistributions(
        agent("mistral-vibe"),
        {},
        {
          arch: "x64",
          platform: "linux",
          which: async () => null,
        },
      ),
    ).toEqual([
      {
        advisory: null,
        available: true,
        detail: "example.com",
        kind: "binary",
        verified: false,
      },
      {
        advisory: "Needs Node.js (npm) on this computer.",
        available: false,
        detail: "@mistralai/vibe@2.26.0",
        kind: "npx",
        verified: null,
      },
    ]);
    expect(
      (
        await describeAcpRegistryDistributions(
          agent("fast-agent"),
          {},
          {
            which: async () => "/usr/local/bin/uv",
          },
        )
      )[0],
    ).toMatchObject({ advisory: null, available: true, kind: "uvx" });
  });
});
