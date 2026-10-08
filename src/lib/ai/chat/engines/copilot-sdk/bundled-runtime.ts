import { constants as fsConstants } from "node:fs";
import { access, chmod, stat } from "node:fs/promises";
import path from "node:path";

// @github/copilot-sdk 1.x ships the Copilot CLI runtime in optional platform
// packages (`@github/copilot-sdk-<platform>`): a small `copilot-runtime`
// wrapper executable next to `runtime.node`. The platform naming and file
// layout below are ported from the SDK's dist/runtimeArtifacts.js
// (getRuntimePlatform, getRuntimePackageName, ensureRuntimeBundle; MIT,
// https://github.com/github/copilot-sdk).
//
// Sentinel resolves the path itself and hands it to
// RuntimeConnection.forStdio({ path }): Next bundles the SDK into server
// chunks, where the SDK's own `createRequire(import.meta.url)` lookup does not
// start from node_modules. The packaged desktop server runs with its cwd at
// `<resources>/server`, and after-pack copies the target platform package to
// `<resources>/server/node_modules`; dev and `next start` run from the repo
// root, so both resolve from `<cwd>/node_modules`.

export const COPILOT_RUNTIME_PLATFORMS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "linuxmusl-arm64",
  "linuxmusl-x64",
  "win32-arm64",
  "win32-x64",
] as const;

export type CopilotRuntimePlatform = (typeof COPILOT_RUNTIME_PLATFORMS)[number];

export type BundledCopilotRuntime = {
  cliPath: string;
  packageName: string;
  packageRoot: string;
  runtimeNodePath: string;
  runtimePlatform: CopilotRuntimePlatform;
};

let cachedMuslLinux: boolean | undefined;

function detectMuslFromProcessReport() {
  // `excludeNetwork` (Node 22+) skips the report's network lookups, as
  // detect-libc does; @types/node does not declare it yet.
  const report = process.report as
    (NodeJS.ProcessReport & { excludeNetwork?: boolean }) | undefined;
  if (!report) {
    return false;
  }

  const excludeNetwork = report.excludeNetwork;
  try {
    report.excludeNetwork = true;
    const { header } = report.getReport() as {
      header?: { glibcVersionRuntime?: string };
    };
    return header !== undefined && header.glibcVersionRuntime === undefined;
  } catch {
    return false;
  } finally {
    report.excludeNetwork = excludeNetwork;
  }
}

/**
 * Only a report header without a glibc version means musl, as in the SDK
 * client's own isMusl (dist/client.js): a missing report or header counts as
 * glibc, the only Linux libc Electron (which runs the packaged server) ships
 * for. Cached, since the report is costly to build.
 */
function isMuslLinux() {
  if (process.platform !== "linux") {
    return false;
  }

  cachedMuslLinux ??= detectMuslFromProcessReport();
  return cachedMuslLinux;
}

export function getCopilotRuntimePlatform(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  musl: boolean = isMuslLinux(),
): CopilotRuntimePlatform | null {
  if (arch !== "x64" && arch !== "arm64") {
    return null;
  }

  if (platform === "linux") {
    return `${musl ? "linuxmusl" : "linux"}-${arch}`;
  }

  if (platform === "darwin" || platform === "win32") {
    return `${platform}-${arch}`;
  }

  return null;
}

/**
 * The runtime platforms to look for, preferred first. On Linux the other libc
 * build follows, so a misdetected libc still finds the one runtime installed
 * (packaged builds ship only the glibc runtime).
 */
function getCopilotRuntimePlatformCandidates(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  musl: boolean = isMuslLinux(),
): CopilotRuntimePlatform[] {
  const preferred = getCopilotRuntimePlatform(platform, arch, musl);
  if (!preferred) {
    return [];
  }

  const alternate =
    platform === "linux"
      ? getCopilotRuntimePlatform(platform, arch, !musl)
      : null;
  return alternate ? [preferred, alternate] : [preferred];
}

export function getCopilotRuntimePackageName(
  runtimePlatform: CopilotRuntimePlatform,
) {
  return `@github/copilot-sdk-${runtimePlatform}`;
}

export function getCopilotRuntimeExecutableName(
  runtimePlatform: CopilotRuntimePlatform,
) {
  return runtimePlatform.startsWith("win32")
    ? "copilot-runtime.exe"
    : "copilot-runtime";
}

async function isNonEmptyFile(filePath: string) {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile() && fileStats.size > 0;
  } catch {
    return false;
  }
}

async function ensureExecutable(filePath: string) {
  if (process.platform === "win32") {
    return true;
  }

  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    // The SDK restores the execute bit the same way when an installer drops it.
  }

  try {
    const fileStats = await stat(filePath);
    await chmod(filePath, fileStats.mode | 0o111);
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds the SDK's platform runtime under `<root>/node_modules` for each search
 * root, in order, trying the preferred runtime platform in every root before
 * the other Linux libc build. Returns null when no root has a complete runtime
 * (wrapper and runtime.node present and non-empty, wrapper executable).
 */
export async function resolveBundledCopilotRuntime(options?: {
  arch?: string;
  musl?: boolean;
  platform?: NodeJS.Platform;
  searchRoots?: string[];
}): Promise<BundledCopilotRuntime | null> {
  const searchRoots = [
    ...new Set(
      (options?.searchRoots ?? [process.cwd()]).map((root) =>
        path.resolve(root),
      ),
    ),
  ];

  for (const runtimePlatform of getCopilotRuntimePlatformCandidates(
    options?.platform,
    options?.arch,
    options?.musl,
  )) {
    const runtime = await findBundledCopilotRuntime(
      runtimePlatform,
      searchRoots,
    );
    if (runtime) {
      return runtime;
    }
  }

  return null;
}

async function findBundledCopilotRuntime(
  runtimePlatform: CopilotRuntimePlatform,
  searchRoots: string[],
): Promise<BundledCopilotRuntime | null> {
  const packageName = getCopilotRuntimePackageName(runtimePlatform);

  for (const root of searchRoots) {
    const packageRoot = path.join(
      root,
      "node_modules",
      ...packageName.split("/"),
    );
    const prebuildDirectory = path.join(
      packageRoot,
      "prebuilds",
      runtimePlatform,
    );
    const cliPath = path.join(
      prebuildDirectory,
      getCopilotRuntimeExecutableName(runtimePlatform),
    );
    const runtimeNodePath = path.join(prebuildDirectory, "runtime.node");

    if (
      !(await isNonEmptyFile(path.join(packageRoot, "package.json"))) ||
      !(await isNonEmptyFile(cliPath)) ||
      !(await isNonEmptyFile(runtimeNodePath)) ||
      !(await ensureExecutable(cliPath))
    ) {
      continue;
    }

    return {
      cliPath,
      packageName,
      packageRoot,
      runtimeNodePath,
      runtimePlatform,
    };
  }

  return null;
}
