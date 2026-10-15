import {
  chmod,
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

const { parseAcpRegistryIndex } = await import("./schema");
const {
  describeAcpRegistryDistributions,
  getAcpRegistryToolDirectory,
  installAcpRegistryAgent,
  readAcpRegistryLaunch,
  uninstallAcpRegistryAgent,
} = await import("./install");
const { buildTarGz } = await import("@/lib/runtime/managed-install/testing");
const { registryIndex } = await import("./__tests__/fixtures");

// Installs run the real installers: the managed download (a served archive)
// and npm / uv replaced by small fake programs that do what each one does
// to a prefix, spawned through the platform's process handling.

let root: string;
let bin: string;

const agents = parseAcpRegistryIndex(registryIndex())!.agents;
const agent = (id: string) => agents.find((entry) => entry.id === id)!;

const FAKE_NPM = `#!/bin/sh
echo "$@" >> "$FAKE_LOG"
spec="$5"
name="\${spec%@*}"
version="\${spec##*@}"
dir="$npm_config_prefix/lib/node_modules/$name"
mkdir -p "$dir/bundle"
printf '{"name":"%s","version":"%s","bin":{"gemini":"bundle/gemini.js"}}' "$name" "$version" > "$dir/package.json"
echo 'console.log("gemini")' > "$dir/bundle/gemini.js"
`;

const FAKE_UV = `#!/bin/sh
echo "$@" >> "$FAKE_LOG"
mkdir -p "$UV_TOOL_DIR/fast-agent-acp"
printf '#!/bin/sh\\necho fast\\n' > "$UV_TOOL_BIN_DIR/fast-agent-acp"
chmod +x "$UV_TOOL_BIN_DIR/fast-agent-acp"
`;

const FAILING = `#!/bin/sh
echo "npm ERR! 404 Not Found" >&2
exit 1
`;

async function fakeProgram(name: string, script: string) {
  const file = path.join(bin, name);
  await writeFile(file, script);
  await chmod(file, 0o755);
  return file;
}

function env() {
  return { FAKE_LOG: path.join(root, "calls.log"), PATH: process.env.PATH };
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
    expect((await stat(receipt.command)).mode & 0o111).not.toBe(0);
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
