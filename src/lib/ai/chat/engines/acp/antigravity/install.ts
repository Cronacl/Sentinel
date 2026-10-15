import "server-only";

import { chmod, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { ResolvedEngineInstance } from "@/lib/ai/chat/engines/contract";
import {
  findExecutableInPath,
  getConfiguredBinaryOverride,
  isExecutableFile,
} from "@/lib/ai/chat/engines/platform/runtime/resolve-binary";
import {
  getManagedToolDirectory,
  installManagedTool,
  ManagedInstallError,
  readActiveManagedTool,
  removeManagedTool,
  type ManagedInstallOptions,
  type ManagedInstallProgress,
} from "@/lib/runtime/managed-install/install";
import { writeActiveManagedToolVersion } from "@/lib/runtime/managed-install/receipts";

import type { AcpAgentProcess } from "../connection";
import type { AcpAgentDescriptor, AcpBinaryResolution } from "../descriptor";
import { getErrorMessage } from "../errors";
import { resolveAcpLaunch, startAcpProcess } from "../launch";
import { readRecord } from "../schema";
import { initializeAcpAgent } from "../session";
import {
  ANTIGRAVITY_AGENT_NAME,
  ANTIGRAVITY_MANAGED_TOOL,
  antigravityFileNames,
  formatDownloadSize,
  resolveAntigravityReleaseAsset,
  type AntigravityReleaseAsset,
} from "./release";

// Where an instance's Antigravity server comes from, and Sentinel's own
// install of it (design acp-and-agents §3.3; behaviour from t3code
// apps/server/src/provider/AntigravityInstallation.ts, MIT):
// - the instance's binaryPath, else (default instance) SENTINEL_ANTIGRAVITY_PATH;
// - else Sentinel's managed install (<state root>/tools/antigravity-acp/);
// - else agy_acp_server.par on PATH.
// The server only runs with its localharness_external sibling. Installing
// downloads the pinned zip (SHA-256 checked while streaming), extracts it,
// and validates it by spawning it once for `initialize` before it becomes
// the active version. Only ever on an explicit, confirmed user action.

export const ANTIGRAVITY_ENV_PATH_KEY = "SENTINEL_ANTIGRAVITY_PATH";
/** Spawning unpacks ~1 GB first: initialize gets a long bound. */
const VALIDATE_TIMEOUT_MS = 120_000;

export type AntigravityInstallation = {
  executablePath: string;
  harnessPath: string;
  source: "config" | "env" | "managed-install" | "managed-path";
  version: string | null;
};

async function isFile(target: string) {
  return (await stat(target).catch(() => null))?.isFile() ?? false;
}

/** The server at `executablePath` with its harness, else null. */
async function withHarness(
  executablePath: string,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const harnessPath = path.join(
    path.dirname(executablePath),
    antigravityFileNames(platform).harness,
  );
  return (await isExecutableFile(executablePath, { platform })) &&
    (await isFile(harnessPath))
    ? harnessPath
    : null;
}

export async function resolveAntigravityInstallation(
  instance: Pick<ResolvedEngineInstance, "config" | "env" | "isDefault">,
  options: { platform?: NodeJS.Platform; stateRoot?: string } = {},
): Promise<{
  error: string | null;
  installation: AntigravityInstallation | null;
}> {
  const platform = options.platform ?? process.platform;
  const names = antigravityFileNames(platform);

  const override = getConfiguredBinaryOverride(instance, instance.env, [
    ANTIGRAVITY_ENV_PATH_KEY,
  ]);
  if (override) {
    const candidate =
      path.isAbsolute(override.path) || /[\\/]/.test(override.path)
        ? path.resolve(override.path)
        : await findExecutableInPath(override.path, instance.env.PATH, {
            platform,
          });
    const harnessPath = candidate
      ? await withHarness(candidate, platform)
      : null;
    if (!candidate || !harnessPath) {
      return {
        error: `The Antigravity server at ${override.path} or its ${names.harness} sibling is missing or not executable.`,
        installation: null,
      };
    }
    return {
      error: null,
      installation: {
        executablePath: candidate,
        harnessPath,
        source: override.source,
        version: null,
      },
    };
  }

  const managed = await readActiveManagedTool(
    ANTIGRAVITY_MANAGED_TOOL,
    options.stateRoot,
  ).catch(() => null);
  if (managed) {
    const harnessPath = await withHarness(managed.executablePath, platform);
    if (harnessPath) {
      return {
        error: null,
        installation: {
          executablePath: managed.executablePath,
          harnessPath,
          source: "managed-install",
          version: managed.receipt.version,
        },
      };
    }
  }

  const onPath = await findExecutableInPath(
    names.executable,
    instance.env.PATH,
    {
      platform,
    },
  );
  const harnessPath = onPath ? await withHarness(onPath, platform) : null;
  if (onPath && harnessPath) {
    return {
      error: null,
      installation: {
        executablePath: onPath,
        harnessPath,
        source: "managed-path",
        version: null,
      },
    };
  }

  return {
    error: managed
      ? "Sentinel's Antigravity install is incomplete. Install it again from Settings > Engines."
      : resolveAntigravityReleaseAsset(platform)
        ? "Antigravity is not installed. Install it from Settings > Engines, or set the server's path on the instance."
        : `Google publishes no Antigravity server for ${platform}-${process.arch}; set a custom server path on the instance.`,
    installation: null,
  };
}

/** The installation as the ACP engine's binary resolution. */
export async function resolveAntigravityBinary(
  instance: ResolvedEngineInstance,
): Promise<
  AcpBinaryResolution & { installation: AntigravityInstallation | null }
> {
  const { error, installation } =
    await resolveAntigravityInstallation(instance);
  return {
    binary: installation
      ? {
          env: instance.env,
          path: installation.executablePath,
          source: installation.source,
          version: installation.version,
        }
      : null,
    error,
    installation,
  };
}

/** Reads `agentCapabilities.auth.logout` (not in the shared flags). */
export function supportsAntigravityLogout(initializeResult: unknown) {
  const auth = readRecord(
    readRecord(initializeResult, "agentCapabilities"),
    "auth",
  );
  return auth != null && auth.logout != null && auth.logout !== false;
}

/**
 * Spawns the server once and checks `initialize` names the expected
 * release: agentInfo, protocol 1 or 2, loadSession, session resume,
 * logout, and the personal Google sign-in.
 */
export async function validateAntigravityServer(input: {
  descriptor: AcpAgentDescriptor;
  executablePath: string;
  expectedVersion: string;
  instance: ResolvedEngineInstance;
  signal?: AbortSignal;
  start?: typeof startAcpProcess;
  timeoutMs?: number;
}) {
  await mkdir(input.instance.stateDir, { mode: 0o700, recursive: true });
  const cwd = await mkdtemp(path.join(input.instance.stateDir, "validate-"));
  let process: AcpAgentProcess | null = null;
  const stop = () => void process?.dispose();
  input.signal?.addEventListener("abort", stop, { once: true });
  try {
    const launch = await resolveAcpLaunch(
      input.descriptor,
      input.instance,
      {
        env: input.instance.env,
        path: input.executablePath,
        source: "managed-install",
        version: input.expectedVersion,
      },
      cwd,
      "probe",
    );
    process = (input.start ?? startAcpProcess)(input.descriptor, launch, {
      instanceId: input.instance.id,
    });
    const init = await initializeAcpAgent(process, {
      context: "probe",
      descriptor: input.descriptor,
      signal: input.signal,
      timeoutMs: input.timeoutMs ?? VALIDATE_TIMEOUT_MS,
    });
    const valid =
      init.agentInfo.name === ANTIGRAVITY_AGENT_NAME &&
      init.agentInfo.version === input.expectedVersion &&
      (init.protocolVersion === 1 || init.protocolVersion === 2) &&
      init.capabilities.loadSession &&
      init.capabilities.resumeSession &&
      supportsAntigravityLogout(init.raw) &&
      init.authMethods.some((method) => method.id === "oauth-personal");
    if (!valid) {
      throw new ManagedInstallError(
        "The downloaded server did not identify as the expected Google Antigravity release.",
        "verify_failed",
      );
    }
  } catch (error) {
    if (error instanceof ManagedInstallError) throw error;
    throw new ManagedInstallError(
      `The downloaded Antigravity server could not start: ${getErrorMessage(error)}`,
      "verify_failed",
    );
  } finally {
    input.signal?.removeEventListener("abort", stop);
    await process?.dispose();
    await rm(cwd, { force: true, recursive: true }).catch(() => undefined);
  }
}

export function describeAntigravityInstall(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
) {
  const asset = resolveAntigravityReleaseAsset(platform, arch);
  return asset
    ? `Downloads Google's Antigravity ACP server ${asset.version} (${formatDownloadSize(asset.archiveBytes)}, SHA-256 checked) into Sentinel's data folder. Each launch unpacks about 1 GB of temporary files.`
    : `Google publishes no Antigravity server for ${platform}-${arch}.`;
}

/**
 * Downloads, verifies, extracts and validates the pinned release, then
 * makes it the active version. A release that fails validation is removed.
 */
export async function installAntigravityServer(input: {
  arch?: string;
  descriptor: AcpAgentDescriptor;
  fetch?: ManagedInstallOptions["fetch"];
  instance: ResolvedEngineInstance;
  onProgress(progress: ManagedInstallProgress): void;
  platform?: NodeJS.Platform;
  signal: AbortSignal;
  start?: typeof startAcpProcess;
  stateRoot?: string;
  /** Test seam: the pinned asset (a local fixture release). */
  asset?: AntigravityReleaseAsset;
  validateTimeoutMs?: number;
}) {
  const platform = input.platform ?? process.platform;
  const asset =
    input.asset ?? resolveAntigravityReleaseAsset(platform, input.arch);
  if (!asset) {
    throw new ManagedInstallError(
      describeAntigravityInstall(platform, input.arch),
      "unsupported",
    );
  }

  let total: number | null = asset.archiveBytes;
  let downloaded = 0;
  const result = await installManagedTool({
    activate: false,
    archive: "zip",
    executable: asset.executable.name,
    fetch: input.fetch,
    onProgress: (progress) => {
      downloaded = progress.downloadedBytes;
      total = progress.totalBytes ?? total;
      // Success is reported once the server validated.
      if (progress.phase !== "succeeded") input.onProgress(progress);
    },
    platform,
    signal: input.signal,
    source: { bytes: asset.archiveBytes, sha256: asset.sha256, url: asset.url },
    stateRoot: input.stateRoot,
    tool: ANTIGRAVITY_MANAGED_TOOL,
    version: asset.version,
  });

  const report = (
    phase: ManagedInstallProgress["phase"],
    message: string | null,
  ) =>
    input.onProgress({
      downloadedBytes: downloaded,
      message,
      phase,
      totalBytes: total,
    });

  try {
    const harnessPath = path.join(result.installDir, asset.harness.name);
    if (!(await isFile(harnessPath))) {
      throw new ManagedInstallError(
        `The download has no ${asset.harness.name}.`,
        "verify_failed",
      );
    }
    if (platform !== "win32") {
      await chmod(harnessPath, 0o755);
    }
    report("verifying", "Starting the Antigravity server once to check it.");
    await validateAntigravityServer({
      descriptor: input.descriptor,
      executablePath: result.executablePath,
      expectedVersion: asset.version,
      instance: input.instance,
      signal: input.signal,
      start: input.start,
      timeoutMs: input.validateTimeoutMs,
    });
    await writeActiveManagedToolVersion(
      getManagedToolDirectory(ANTIGRAVITY_MANAGED_TOOL, input.stateRoot),
      asset.version,
    );
  } catch (error) {
    await removeManagedTool(
      ANTIGRAVITY_MANAGED_TOOL,
      asset.version,
      input.stateRoot,
    ).catch(() => undefined);
    const cancelled = input.signal.aborted;
    report(
      cancelled ? "cancelled" : "failed",
      cancelled ? "The install was cancelled." : getErrorMessage(error),
    );
    throw error;
  }
  report("succeeded", null);
  return result;
}
