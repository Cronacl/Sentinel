import "server-only";

import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import {
  applyPrivateFsMode,
  getSentinelStateRoot,
} from "@/lib/runtime/local-state";

import {
  ArchiveError,
  detectArchiveKind,
  extractArchive,
  isPathInside,
  toSafeRelativePath,
  type ArchiveKind,
  type ExtractLimits,
} from "./archive";
import { downloadFile, DownloadError } from "./download";
import {
  readActiveManagedToolVersion,
  readManagedToolReceipt,
  writeActiveManagedToolVersion,
  writeManagedToolReceipt,
  type ManagedToolReceipt,
} from "./receipts";

// Installs a tool Sentinel manages itself (P13: the Antigravity ACP server,
// ACP Registry binaries) under <state root>/tools/<tool>/<version>/:
//   download (HTTPS, size cap, streaming SHA-256)
//   → extract into a staging directory (safe extraction, archive.ts)
//   → check the executable is a file inside the tree, make it executable
//   → write the receipt → move the staging tree into place → active.json.
// A failure or cancellation at any step removes the staging directory and
// leaves the previous version in place. Progress uses the snapshot's
// installState phases. Only ever run on an explicit user action.

export type ManagedInstallPhase =
  | "cancelled"
  | "downloading"
  | "extracting"
  | "failed"
  | "succeeded"
  | "verifying";

export type ManagedInstallProgress = {
  downloadedBytes: number;
  message: string | null;
  phase: ManagedInstallPhase;
  totalBytes: number | null;
};

export class ManagedInstallError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export const DEFAULT_MANAGED_DOWNLOAD_MAX_BYTES = 1024 * 1024 * 1024;

const TOOL_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;

export function getManagedToolsRoot(stateRoot = getSentinelStateRoot()) {
  return path.join(stateRoot, "tools");
}

/** "antigravity-acp" or "acp/devin": slug segments only. */
export function getManagedToolDirectory(tool: string, stateRoot?: string) {
  const segments = tool.split("/");
  if (
    segments.length === 0 ||
    segments.length > 3 ||
    !segments.every((segment) => TOOL_SEGMENT.test(segment) && segment !== "..")
  ) {
    throw new ManagedInstallError(
      `Invalid managed tool id "${tool}".`,
      "invalid",
    );
  }
  return path.join(getManagedToolsRoot(stateRoot), ...segments);
}

export type ManagedInstallOptions = {
  /** Default: from the URL's extension. */
  archive?: ArchiveKind;
  /** Write active.json for this version (default true). */
  activate?: boolean;
  /** Path of the executable inside the install (raw: its file name). */
  executable: string;
  extractLimits?: Partial<ExtractLimits>;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  maxDownloadBytes?: number;
  now?: () => number;
  onProgress?: (progress: ManagedInstallProgress) => void;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
  source: {
    /** Pinned size, when the release publishes it. */
    bytes?: number | null;
    /** Pinned SHA-256 (hex); without one the receipt says unverified. */
    sha256?: string | null;
    url: string;
  };
  stateRoot?: string;
  tool: string;
  version: string;
};

export type ManagedInstallResult = {
  executablePath: string;
  installDir: string;
  receipt: ManagedToolReceipt;
};

const installLocks = new Map<string, Promise<unknown>>();

function cancelledError(signal: AbortSignal | undefined) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new ManagedInstallError("The install was cancelled.", "cancelled");
}

async function exists(target: string) {
  return (await lstat(target).catch(() => null)) !== null;
}

async function runInstall(
  options: ManagedInstallOptions,
): Promise<ManagedInstallResult> {
  const platform = options.platform ?? process.platform;
  if (!VERSION_PATTERN.test(options.version)) {
    throw new ManagedInstallError(
      `Invalid version "${options.version}".`,
      "invalid",
    );
  }
  const executable = toSafeRelativePath(options.executable);
  if (!executable) {
    throw new ManagedInstallError("The executable path is invalid.", "invalid");
  }

  const toolDir = getManagedToolDirectory(options.tool, options.stateRoot);
  const installDir = path.join(toolDir, options.version);
  const kind = options.archive ?? detectArchiveKind(options.source.url);
  const report = (
    progress: Omit<ManagedInstallProgress, "message"> & {
      message?: string | null;
    },
  ) => options.onProgress?.({ message: null, ...progress });

  await mkdir(toolDir, { mode: 0o700, recursive: true });
  await applyPrivateFsMode(toolDir, 0o700, { platform });
  const staging = await mkdtemp(path.join(toolDir, ".staging-"));
  let downloaded = 0;
  let total: number | null = options.source.bytes ?? null;

  try {
    const root = path.join(staging, "root");
    await mkdir(root, { mode: 0o755 });
    const archivePath =
      kind === "raw"
        ? path.join(root, ...executable.split("/"))
        : path.join(staging, `download.${kind}`);
    if (kind === "raw") {
      await mkdir(path.dirname(archivePath), { mode: 0o755, recursive: true });
    }

    const download = await downloadFile({
      destination: archivePath,
      expectedBytes: options.source.bytes ?? null,
      fetch: options.fetch,
      maxBytes: options.maxDownloadBytes ?? DEFAULT_MANAGED_DOWNLOAD_MAX_BYTES,
      now: options.now,
      onProgress: (progress) => {
        downloaded = progress.downloadedBytes;
        total = progress.totalBytes;
        report({
          downloadedBytes: progress.downloadedBytes,
          phase: "downloading",
          totalBytes: progress.totalBytes,
        });
      },
      sha256: options.source.sha256 ?? null,
      signal: options.signal,
      url: options.source.url,
    });

    report({
      downloadedBytes: downloaded,
      message: download.verified
        ? "Checked the download's SHA-256."
        : "No checksum is published for this download.",
      phase: "verifying",
      totalBytes: total,
    });
    if (options.signal?.aborted) {
      throw cancelledError(options.signal);
    }

    if (kind !== "raw") {
      report({
        downloadedBytes: downloaded,
        phase: "extracting",
        totalBytes: total,
      });
      await extractArchive({
        archivePath,
        destination: root,
        kind,
        limits: options.extractLimits,
        signal: options.signal,
      });
      await rm(archivePath, { force: true });
    }

    const executablePath = path.join(root, ...executable.split("/"));
    const real = await realpath(executablePath).catch(() => null);
    const realRoot = await realpath(root);
    if (
      !real ||
      !isPathInside(real, realRoot) ||
      !(await stat(real)).isFile()
    ) {
      throw new ManagedInstallError(
        `The download does not contain "${options.executable}".`,
        "archive_invalid",
      );
    }
    if (platform !== "win32") {
      await chmod(real, 0o755);
    }

    const receipt: ManagedToolReceipt = {
      archive: kind,
      executable,
      installedAt: new Date((options.now ?? Date.now)()).toISOString(),
      schemaVersion: 1,
      source: {
        bytes: download.bytes,
        sha256: download.sha256,
        url: options.source.url,
        verified: download.verified,
      },
      tool: options.tool,
      version: options.version,
    };
    await writeManagedToolReceipt(root, receipt);

    if (options.signal?.aborted) {
      throw cancelledError(options.signal);
    }

    // Swap in the new tree; a previous install of the same version is
    // replaced only once the new one is complete.
    let previous: string | null = null;
    if (await exists(installDir)) {
      previous = path.join(
        toolDir,
        `.old-${options.version}-${randomBytes(4).toString("hex")}`,
      );
      await rename(installDir, previous);
    }
    try {
      await rename(root, installDir);
    } catch (error) {
      if (previous) {
        await rename(previous, installDir).catch(() => undefined);
      }
      throw error;
    }
    if (previous) {
      await rm(previous, { force: true, recursive: true }).catch(
        () => undefined,
      );
    }
    if (options.activate !== false) {
      await writeActiveManagedToolVersion(toolDir, options.version);
    }

    report({
      downloadedBytes: downloaded,
      message: null,
      phase: "succeeded",
      totalBytes: total,
    });
    return {
      executablePath: path.join(installDir, ...executable.split("/")),
      installDir,
      receipt,
    };
  } catch (error) {
    const cancelled = options.signal?.aborted ?? false;
    report({
      downloadedBytes: downloaded,
      message: cancelled
        ? "The install was cancelled."
        : error instanceof Error
          ? error.message
          : "The install failed.",
      phase: cancelled ? "cancelled" : "failed",
      totalBytes: total,
    });
    if (cancelled) {
      throw cancelledError(options.signal);
    }
    if (error instanceof ArchiveError || error instanceof DownloadError) {
      throw new ManagedInstallError(error.message, error.code);
    }
    throw error;
  } finally {
    await rm(staging, { force: true, recursive: true }).catch(() => undefined);
  }
}

/**
 * Downloads, verifies and installs one version of a managed tool. Installs
 * of the same tool run one at a time.
 */
export async function installManagedTool(
  options: ManagedInstallOptions,
): Promise<ManagedInstallResult> {
  const key = getManagedToolDirectory(options.tool, options.stateRoot);
  const previous = installLocks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => runInstall(options));
  installLocks.set(key, run);
  try {
    return await run;
  } finally {
    if (installLocks.get(key) === run) {
      installLocks.delete(key);
    }
  }
}

/** The active install of a tool (receipt included), or null. */
export async function readActiveManagedTool(tool: string, stateRoot?: string) {
  const toolDir = getManagedToolDirectory(tool, stateRoot);
  const version = await readActiveManagedToolVersion(toolDir);
  if (!version || !VERSION_PATTERN.test(version)) {
    return null;
  }
  const installDir = path.join(toolDir, version);
  const receipt = await readManagedToolReceipt(installDir);
  if (!receipt) {
    return null;
  }
  return {
    executablePath: path.join(installDir, ...receipt.executable.split("/")),
    installDir,
    receipt,
  };
}

/** Removes one installed version (and active.json when it pointed there). */
export async function removeManagedTool(
  tool: string,
  version: string,
  stateRoot?: string,
) {
  if (!VERSION_PATTERN.test(version)) {
    throw new ManagedInstallError(`Invalid version "${version}".`, "invalid");
  }
  const toolDir = getManagedToolDirectory(tool, stateRoot);
  if ((await readActiveManagedToolVersion(toolDir)) === version) {
    await rm(path.join(toolDir, "active.json"), { force: true });
  }
  await rm(path.join(toolDir, version), { force: true, recursive: true });
}
