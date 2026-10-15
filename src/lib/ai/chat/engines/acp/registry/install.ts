import "server-only";

import type { ChildProcess } from "node:child_process";
import {
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { findExecutableInPath } from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import { isPathInside } from "@/lib/runtime/managed-install/archive";
import {
  getManagedToolDirectory,
  getManagedToolsRoot,
  installManagedTool,
  ManagedInstallError,
  removeManagedTool,
  type ManagedInstallOptions,
  type ManagedInstallProgress,
} from "@/lib/runtime/managed-install/install";
import {
  spawnManagedProcess,
  type ManagedSpawnOptions,
} from "@/lib/runtime/process/spawn";

import {
  ACP_REGISTRY_DISTRIBUTIONS,
  ACP_REGISTRY_NATIVE_ENGINES,
  isSupportedAcpRegistryArchive,
  parseAcpRegistryPackageSpec,
  resolveAcpRegistryDistribution,
  resolveAcpRegistryPlatformTarget,
  type AcpRegistryAgent,
  type AcpRegistryDistributionPreference,
  type AcpRegistryDistributionView,
  type ResolvedAcpRegistryDistribution,
} from "./schema";

// Installing a registry agent (only ever on an explicit, confirmed user
// action), per distribution (t3code AcpRegistrySupport.ts ensureGlobalPackage
// and the binary installer, MIT):
// - binary: the P11 managed installer (HTTPS, size cap, streaming SHA-256
//   when the registry pins one, safe extraction, receipt) into
//   <state root>/tools/acp/<agentId>/<version>/;
// - npx: `npm install --global <pkg@exact>` with a private prefix,
//   <state root>/tools/npm/<agentId>; the package's bin script then runs
//   under the user's node (else Sentinel's own runtime as Node);
// - uvx: `uv tool install --force <pkg>` with UV_TOOL_DIR and
//   UV_TOOL_BIN_DIR under <state root>/tools/uv/<agentId>.
// Every install ends with a launch receipt (.launch.json in the agent's
// tools directory): what to run, with the registry's arguments and
// variables, so launching never needs the catalog.

export const ACP_REGISTRY_PACKAGE_INSTALL_TIMEOUT_MS = 20 * 60 * 1_000;
const LAUNCH_FILE = ".launch.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const OUTPUT_TAIL_CHARS = 4_000;
const COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const acpRegistryLaunchReceiptSchema = z.object({
  agentId: z.string(),
  args: z.array(z.string()),
  /** Absolute path: the executable, or the bin script for `launcher: node`. */
  command: z.string(),
  distribution: z.enum(ACP_REGISTRY_DISTRIBUTIONS),
  env: z.record(z.string(), z.string()),
  installedAt: z.string(),
  /** node: run `command` as a script under Node. */
  launcher: z.enum(["direct", "node"]),
  name: z.string(),
  packageSpec: z.string().nullable(),
  schemaVersion: z.literal(1),
  /** Binary archives: the registry pinned the SHA-256 that was checked. */
  verified: z.boolean().nullable(),
  version: z.string(),
});

type PackageDistribution = Extract<
  ResolvedAcpRegistryDistribution,
  { packageSpec: string }
>;

export type AcpRegistryLaunchReceipt = z.infer<
  typeof acpRegistryLaunchReceiptSchema
>;

export type AcpRegistryCommandRunner = (input: {
  args: string[];
  command: string;
  cwd: string;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
  timeoutMs: number;
}) => Promise<{ exitCode: number | null; output: string }>;

export type AcpRegistryInstallDeps = {
  arch?: string;
  fetch?: ManagedInstallOptions["fetch"];
  now?: () => number;
  platform?: NodeJS.Platform;
  runCommand?: AcpRegistryCommandRunner;
  /** Injected into the default command runner (tests). */
  spawn?: ManagedSpawnOptions["spawn"];
  stateRoot?: string;
  which?: (
    command: string,
    pathValue: string | undefined,
  ) => Promise<string | null>;
};

function which(deps: AcpRegistryInstallDeps) {
  return (
    deps.which ??
    ((command: string, pathValue: string | undefined) =>
      findExecutableInPath(command, pathValue, { platform: deps.platform }))
  );
}

export function getAcpRegistryToolDirectory(
  agentId: string,
  stateRoot?: string,
) {
  return getManagedToolDirectory(`acp/${agentId}`, stateRoot);
}

function npmPrefix(agentId: string, stateRoot?: string) {
  getAcpRegistryToolDirectory(agentId, stateRoot); // validates the id
  return path.join(getManagedToolsRoot(stateRoot), "npm", agentId);
}

function uvRoot(agentId: string, stateRoot?: string) {
  getAcpRegistryToolDirectory(agentId, stateRoot);
  return path.join(getManagedToolsRoot(stateRoot), "uv", agentId);
}

export async function readAcpRegistryLaunch(
  agentId: string,
  stateRoot?: string,
): Promise<AcpRegistryLaunchReceipt | null> {
  try {
    const file = path.join(
      getAcpRegistryToolDirectory(agentId, stateRoot),
      LAUNCH_FILE,
    );
    const parsed = acpRegistryLaunchReceiptSchema.safeParse(
      JSON.parse(await readFile(file, "utf8")),
    );
    return parsed.success && parsed.data.agentId === agentId
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

async function writeLaunch(
  receipt: AcpRegistryLaunchReceipt,
  stateRoot: string | undefined,
) {
  const dir = getAcpRegistryToolDirectory(receipt.agentId, stateRoot);
  await mkdir(dir, { mode: 0o700, recursive: true });
  const file = path.join(dir, LAUNCH_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temp, file);
}

function tail(text: string) {
  return text.length > OUTPUT_TAIL_CHARS
    ? text.slice(-OUTPUT_TAIL_CHARS)
    : text;
}

/** Runs a package manager with the platform's process handling. */
export function createAcpRegistryCommandRunner(
  deps: Pick<AcpRegistryInstallDeps, "spawn"> = {},
): AcpRegistryCommandRunner {
  return (input) =>
    new Promise((resolve, reject) => {
      let output = "";
      let child: ChildProcess;
      try {
        child = spawnManagedProcess({
          args: input.args,
          command: input.command,
          cwd: input.cwd,
          env: input.env,
          extendEnv: false,
          label: "ACP Registry install",
          spawn: deps.spawn,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        reject(error);
        return;
      }
      const append = (chunk: Buffer) => {
        output = tail(output + chunk.toString("utf8"));
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      const stop = () => child.kill();
      const timer = setTimeout(stop, input.timeoutMs);
      input.signal.addEventListener("abort", stop, { once: true });
      const settle = () => {
        clearTimeout(timer);
        input.signal.removeEventListener("abort", stop);
      };
      child.once("error", (error) => {
        settle();
        reject(error);
      });
      child.once("close", (code) => {
        settle();
        resolve({ exitCode: code, output });
      });
    });
}

async function runPackageManager(
  label: string,
  input: Parameters<AcpRegistryCommandRunner>[0],
  deps: AcpRegistryInstallDeps,
) {
  const run = deps.runCommand ?? createAcpRegistryCommandRunner(deps);
  const result = await run(input);
  if (input.signal.aborted) {
    throw new ManagedInstallError("The install was cancelled.", "cancelled");
  }
  if (result.exitCode !== 0) {
    const detail = result.output.trim().split(/\r?\n/).slice(-6).join("\n");
    throw new ManagedInstallError(
      `${label} failed (exit code ${result.exitCode ?? "unknown"})${detail ? `:\n${detail}` : "."}`,
      "install_failed",
    );
  }
}

function commandCandidates(agent: AcpRegistryAgent, packageName: string) {
  const unscoped = packageName.split("/").pop() ?? packageName;
  return [
    ...new Set([agent.id, unscoped, unscoped.replace(/-acp$/, "")]),
  ].filter((name) => COMMAND_NAME.test(name));
}

async function isFileInside(file: string, root: string) {
  const [real, realRoot] = await Promise.all([
    realpath(file).catch(() => null),
    realpath(root).catch(() => null),
  ]);
  return Boolean(
    real &&
    realRoot &&
    isPathInside(real, realRoot) &&
    (await stat(real)).isFile(),
  );
}

const NATIVE_MAGIC = [
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O 64-bit
  [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32-bit
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O universal
  [0x4d, 0x5a], // PE (MZ)
];

/**
 * How to run an npm bin target: JavaScript (a .js/.cjs/.mjs file, a node
 * shebang or no shebang at all) under Node, anything else - a native
 * executable, as packages like @xai-official/grok link their bin to after
 * postinstall, or a script for another interpreter - directly.
 */
export async function detectNpmBinLauncher(
  file: string,
): Promise<"direct" | "node"> {
  if (/\.[cm]?js$/i.test(file)) {
    return "node";
  }
  const handle = await open(file, "r");
  let head: Buffer;
  try {
    const buffer = Buffer.alloc(256);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    head = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  if (
    NATIVE_MAGIC.some((magic) => magic.every((byte, i) => head[i] === byte))
  ) {
    return "direct";
  }
  if (head[0] === 0x23 && head[1] === 0x21) {
    const shebang = head.toString("latin1").split("\n", 1)[0]!;
    return /[\s/]node(?:\s|$)/.test(shebang) ? "node" : "direct";
  }
  return "node";
}

/** The bin script npm installed for the agent (package.json `bin`). */
async function resolveNpmBin(
  agent: AcpRegistryAgent,
  prefix: string,
  spec: { name: string; version: string },
  platform: NodeJS.Platform,
) {
  const packageRoot = path.join(
    prefix,
    ...(platform === "win32" ? [] : ["lib"]),
    "node_modules",
    ...spec.name.split("/"),
  );
  const manifestPath = path.join(packageRoot, "package.json");
  const info = await stat(manifestPath).catch(() => null);
  if (!info || info.size > MAX_MANIFEST_BYTES) {
    return null;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    bin?: unknown;
    name?: unknown;
    version?: unknown;
  };
  if (manifest.name !== spec.name || manifest.version !== spec.version) {
    return null;
  }
  const unscoped = spec.name.split("/").pop() ?? spec.name;
  let relative: string | null = null;
  if (typeof manifest.bin === "string") {
    relative = manifest.bin;
  } else if (manifest.bin && typeof manifest.bin === "object") {
    const bins = Object.entries(manifest.bin as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    const named = commandCandidates(agent, spec.name)
      .map((name) => bins.find(([bin]) => bin === name)?.[1])
      .find(Boolean);
    relative = named ?? (bins.length === 1 ? bins[0]![1] : null);
  }
  if (!relative) {
    return null;
  }
  const script = path.resolve(packageRoot, relative);
  if (!(await isFileInside(script, packageRoot))) {
    return null;
  }
  // Judged by the real file: a bin linked to a native executable (after a
  // postinstall swap) runs directly, through the link.
  return {
    launcher: await detectNpmBinLauncher(await realpath(script)),
    name: unscoped,
    script,
  };
}

async function installNpx(
  agent: AcpRegistryAgent,
  distribution: PackageDistribution,
  input: AcpRegistryInstallInput,
  deps: AcpRegistryInstallDeps,
): Promise<Omit<AcpRegistryLaunchReceipt, "installedAt" | "schemaVersion">> {
  const platform = deps.platform ?? process.platform;
  const npm = await which(deps)("npm", input.env.PATH);
  if (!npm) {
    throw new ManagedInstallError(
      `${agent.name} installs with npm, which was not found. Install Node.js, then try again.`,
      "runner_unavailable",
    );
  }
  const prefix = npmPrefix(agent.id, deps.stateRoot);
  await mkdir(prefix, { mode: 0o700, recursive: true });
  input.onProgress?.({
    downloadedBytes: 0,
    message: `npm install --global ${distribution.packageSpec}`,
    phase: "downloading",
    totalBytes: null,
  });
  await runPackageManager(
    "npm install",
    {
      args: [
        "install",
        "--global",
        "--no-audit",
        "--no-fund",
        distribution.packageSpec,
      ],
      command: npm,
      cwd: prefix,
      env: {
        ...input.env,
        npm_config_prefix: prefix,
        npm_config_update_notifier: "false",
      },
      signal: input.signal,
      timeoutMs: ACP_REGISTRY_PACKAGE_INSTALL_TIMEOUT_MS,
    },
    deps,
  );
  const spec = parseAcpRegistryPackageSpec("npx", distribution.packageSpec);
  const bin = await resolveNpmBin(agent, prefix, spec, platform);
  if (!bin) {
    throw new ManagedInstallError(
      `npm installed ${distribution.packageSpec}, but Sentinel could not find its command.`,
      "install_failed",
    );
  }
  return {
    agentId: agent.id,
    args: distribution.args,
    command: bin.script,
    distribution: "npx",
    env: distribution.env,
    launcher: bin.launcher,
    name: agent.name,
    packageSpec: distribution.packageSpec,
    verified: null,
    version: agent.version,
  };
}

async function installUvx(
  agent: AcpRegistryAgent,
  distribution: PackageDistribution,
  input: AcpRegistryInstallInput,
  deps: AcpRegistryInstallDeps,
): Promise<Omit<AcpRegistryLaunchReceipt, "installedAt" | "schemaVersion">> {
  const platform = deps.platform ?? process.platform;
  const uv = await which(deps)("uv", input.env.PATH);
  if (!uv) {
    throw new ManagedInstallError(
      `${agent.name} installs with uv, which was not found. Install uv (https://docs.astral.sh/uv/), then try again.`,
      "runner_unavailable",
    );
  }
  const root = uvRoot(agent.id, deps.stateRoot);
  const toolDir = path.join(root, "tools");
  const binDir = path.join(root, "bin");
  await mkdir(binDir, { mode: 0o700, recursive: true });
  input.onProgress?.({
    downloadedBytes: 0,
    message: `uv tool install --force ${distribution.packageSpec}`,
    phase: "downloading",
    totalBytes: null,
  });
  await runPackageManager(
    "uv tool install",
    {
      args: ["tool", "install", "--force", distribution.packageSpec],
      command: uv,
      cwd: root,
      env: { ...input.env, UV_TOOL_BIN_DIR: binDir, UV_TOOL_DIR: toolDir },
      signal: input.signal,
      timeoutMs: ACP_REGISTRY_PACKAGE_INSTALL_TIMEOUT_MS,
    },
    deps,
  );
  const spec = parseAcpRegistryPackageSpec("uvx", distribution.packageSpec);
  const suffix = platform === "win32" ? ".exe" : "";
  let command: string | null = null;
  for (const name of commandCandidates(agent, spec.name)) {
    const candidate = path.join(binDir, `${name}${suffix}`);
    if (await isFileInside(candidate, root)) {
      command = candidate;
      break;
    }
  }
  if (!command) {
    const entries = await readdir(binDir).catch(() => [] as string[]);
    const only = entries.length === 1 ? path.join(binDir, entries[0]!) : null;
    command = only && (await isFileInside(only, root)) ? only : null;
  }
  if (!command) {
    throw new ManagedInstallError(
      `uv installed ${distribution.packageSpec}, but Sentinel could not find its command.`,
      "install_failed",
    );
  }
  return {
    agentId: agent.id,
    args: distribution.args,
    command,
    distribution: "uvx",
    env: distribution.env,
    launcher: "direct",
    name: agent.name,
    packageSpec: distribution.packageSpec,
    verified: null,
    version: agent.version,
  };
}

export type AcpRegistryInstallInput = {
  /** The environment installers run with (PATH finds npm and uv). */
  env: Record<string, string | undefined>;
  onProgress?: (progress: ManagedInstallProgress) => void;
  preference: AcpRegistryDistributionPreference;
  signal: AbortSignal;
};

const locks = new Map<string, Promise<unknown>>();

/**
 * Removes what the new launch receipt replaced: the other distributions'
 * folders and a previous binary version. The old install stays in place
 * until the new one is complete, so a failed update keeps it usable.
 */
async function pruneReplacedInstall(
  previous: AcpRegistryLaunchReceipt | null,
  current: AcpRegistryLaunchReceipt,
  stateRoot: string | undefined,
) {
  const removals: Promise<unknown>[] = [];
  if (current.distribution !== "npx") {
    removals.push(
      rm(npmPrefix(current.agentId, stateRoot), {
        force: true,
        recursive: true,
      }),
    );
  }
  if (current.distribution !== "uvx") {
    removals.push(
      rm(uvRoot(current.agentId, stateRoot), { force: true, recursive: true }),
    );
  }
  if (
    previous?.distribution === "binary" &&
    (current.distribution !== "binary" || previous.version !== current.version)
  ) {
    removals.push(
      removeManagedTool(`acp/${current.agentId}`, previous.version, stateRoot),
    );
  }
  // A file still in use (Windows) is left for the next uninstall.
  await Promise.allSettled(removals);
}

async function runInstall(
  agent: AcpRegistryAgent,
  input: AcpRegistryInstallInput,
  deps: AcpRegistryInstallDeps,
): Promise<AcpRegistryLaunchReceipt> {
  const target = resolveAcpRegistryPlatformTarget(
    deps.platform ?? process.platform,
    deps.arch ?? process.arch,
  );
  const distribution = resolveAcpRegistryDistribution(
    agent,
    input.preference,
    target,
  );
  if (!distribution) {
    throw new ManagedInstallError(
      input.preference === "auto"
        ? `${agent.name} has no distribution for this platform.`
        : `${agent.name} has no ${input.preference} distribution for this platform.`,
      "unavailable",
    );
  }

  const previous = await readAcpRegistryLaunch(agent.id, deps.stateRoot);
  let launch: Omit<AcpRegistryLaunchReceipt, "installedAt" | "schemaVersion">;
  if (distribution.kind === "binary") {
    const result = await installManagedTool({
      executable: distribution.target.cmd,
      fetch: deps.fetch,
      now: deps.now,
      onProgress: input.onProgress,
      platform: deps.platform,
      signal: input.signal,
      source: {
        sha256: distribution.target.sha256 ?? null,
        url: distribution.target.archive,
      },
      stateRoot: deps.stateRoot,
      tool: `acp/${agent.id}`,
      version: agent.version,
    });
    launch = {
      agentId: agent.id,
      args: distribution.args,
      command: result.executablePath,
      distribution: "binary",
      env: distribution.env,
      launcher: "direct",
      name: agent.name,
      packageSpec: null,
      verified: result.receipt.source.verified,
      version: agent.version,
    };
  } else if (distribution.kind === "npx") {
    launch = await installNpx(agent, distribution, input, deps);
  } else {
    launch = await installUvx(agent, distribution, input, deps);
  }

  const receipt: AcpRegistryLaunchReceipt = {
    ...launch,
    installedAt: new Date((deps.now ?? Date.now)()).toISOString(),
    schemaVersion: 1,
  };
  await writeLaunch(receipt, deps.stateRoot);
  await pruneReplacedInstall(previous, receipt, deps.stateRoot);
  if (distribution.kind !== "binary") {
    input.onProgress?.({
      downloadedBytes: 0,
      message: null,
      phase: "succeeded",
      totalBytes: null,
    });
  }
  return receipt;
}

/** Installs the agent's registry version; installs of one agent run in turn. */
export async function installAcpRegistryAgent(
  agent: AcpRegistryAgent,
  input: AcpRegistryInstallInput,
  deps: AcpRegistryInstallDeps = {},
): Promise<AcpRegistryLaunchReceipt> {
  const key = getAcpRegistryToolDirectory(agent.id, deps.stateRoot);
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(() => runInstall(agent, input, deps));
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) {
      locks.delete(key);
    }
  }
}

/** Removes everything Sentinel installed for the agent. */
export async function uninstallAcpRegistryAgent(
  agentId: string,
  stateRoot?: string,
) {
  await Promise.all(
    [
      getAcpRegistryToolDirectory(agentId, stateRoot),
      npmPrefix(agentId, stateRoot),
      uvRoot(agentId, stateRoot),
    ].map((dir) => rm(dir, { force: true, recursive: true })),
  );
}

export type AcpRegistryPackageManagers = {
  npm: string | null;
  uv: string | null;
};

/** npm and uv on PATH, looked up once per catalog listing. */
export async function findAcpRegistryPackageManagers(
  env: Record<string, string | undefined>,
  deps: AcpRegistryInstallDeps = {},
): Promise<AcpRegistryPackageManagers> {
  const [npm, uv] = await Promise.all([
    which(deps)("npm", env.PATH),
    which(deps)("uv", env.PATH),
  ]);
  return { npm, uv };
}

/** What the browser shows per distribution, with the npm/uv advisory. */
export async function describeAcpRegistryDistributions(
  agent: AcpRegistryAgent,
  env: Record<string, string | undefined>,
  deps: AcpRegistryInstallDeps = {},
  managers?: AcpRegistryPackageManagers,
): Promise<AcpRegistryDistributionView[]> {
  const tools = managers ?? (await findAcpRegistryPackageManagers(env, deps));
  const target = resolveAcpRegistryPlatformTarget(
    deps.platform ?? process.platform,
    deps.arch ?? process.arch,
  );
  const views: AcpRegistryDistributionView[] = [];
  const binary = target ? agent.distribution.binary?.[target] : undefined;
  if (binary) {
    let host = binary.archive;
    try {
      host = new URL(binary.archive).host;
    } catch {
      // Validated as HTTPS already.
    }
    const supported = isSupportedAcpRegistryArchive(binary.archive);
    views.push({
      advisory: supported
        ? null
        : "Sentinel cannot unpack this archive format yet.",
      available: supported,
      detail: host,
      kind: "binary",
      verified: Boolean(binary.sha256),
    });
  } else if (agent.distribution.binary) {
    views.push({
      advisory: "No binary for this platform.",
      available: false,
      detail: Object.keys(agent.distribution.binary).join(", "),
      kind: "binary",
      verified: null,
    });
  }
  for (const kind of ["npx", "uvx"] as const) {
    const pkg = agent.distribution[kind];
    if (!pkg) continue;
    const found = kind === "npx" ? tools.npm : tools.uv;
    views.push({
      advisory: found
        ? null
        : kind === "npx"
          ? "Needs Node.js (npm) on this computer."
          : "Needs uv on this computer.",
      available: found !== null,
      detail: pkg.package,
      kind,
      verified: null,
    });
  }
  return views;
}

export function nativeEngineFor(agentId: string) {
  return ACP_REGISTRY_NATIVE_ENGINES[agentId] ?? null;
}
