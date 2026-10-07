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

function isMuslLinux() {
  if (process.platform !== "linux") {
    return false;
  }

  const report = process.report?.getReport() as
    { header?: { glibcVersionRuntime?: string } } | undefined;
  return report?.header?.glibcVersionRuntime === undefined;
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
 * root, in order. Returns null when no root has a complete runtime (wrapper and
 * runtime.node present and non-empty, wrapper executable).
 */
export async function resolveBundledCopilotRuntime(options?: {
  arch?: string;
  musl?: boolean;
  platform?: NodeJS.Platform;
  searchRoots?: string[];
}): Promise<BundledCopilotRuntime | null> {
  const runtimePlatform = getCopilotRuntimePlatform(
    options?.platform,
    options?.arch,
    options?.musl,
  );
  if (!runtimePlatform) {
    return null;
  }

  const packageName = getCopilotRuntimePackageName(runtimePlatform);
  const searchRoots = [
    ...new Set(
      (options?.searchRoots ?? [process.cwd()]).map((root) =>
        path.resolve(root),
      ),
    ),
  ];

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
