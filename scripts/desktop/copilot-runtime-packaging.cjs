"use strict";

const path = require("node:path");

const COPILOT_SDK_PACKAGE = "@github/copilot-sdk";
const COPILOT_RUNTIME_PACKAGE_PREFIX = "@github/copilot-sdk-";

// koffi (with its @koromix/koffi-<platform> binaries) backs only the SDK's
// experimental RuntimeConnection.forInProcess() transport, which the SDK
// imports lazily. Sentinel spawns the runtime over stdio, so the packaged
// server leaves koffi out.
const COPILOT_SDK_IN_PROCESS_ONLY_DEPENDENCIES = new Set(["koffi"]);
const PRUNED_SERVER_PACKAGE_PREFIXES = ["@koromix/koffi-"];

// electron-builder passes its Arch enum (builder-util), where x64 is 1 and
// arm64 is 3. The SDK publishes x64 and arm64 runtimes only.
const ELECTRON_BUILDER_ARCHS = new Map([
  [1, "x64"],
  [3, "arm64"],
]);

/**
 * @returns {string[]}
 */
function getRequiredServerRuntimePackages() {
  return [COPILOT_SDK_PACKAGE];
}

/**
 * @param {number | string} arch
 */
function normalizeTargetArch(arch) {
  if (typeof arch === "number") {
    return ELECTRON_BUILDER_ARCHS.get(arch) ?? null;
  }

  return arch === "x64" || arch === "arm64" ? arch : null;
}

/**
 * The runtime platform the packaged app needs, named like the SDK's
 * `@github/copilot-sdk-<platform>` packages. Electron only ships glibc Linux
 * builds, so Linux never maps to the linuxmusl runtimes.
 *
 * @param {{ arch: number | string; platform: string }} target
 */
function getCopilotRuntimePlatform({ arch, platform }) {
  const normalizedArch = normalizeTargetArch(arch);
  const normalizedPlatform =
    platform === "mas" || platform === "mac" ? "darwin" : platform;

  if (
    !normalizedArch ||
    !["darwin", "linux", "win32"].includes(normalizedPlatform)
  ) {
    throw new Error(
      `The Copilot SDK ships no runtime for ${platform}-${arch}; desktop builds support x64 and arm64 on macOS, Windows and Linux.`,
    );
  }

  return `${normalizedPlatform}-${normalizedArch}`;
}

/**
 * @param {{ arch: number | string; platform: string }} target
 */
function getCopilotRuntimePackageName(target) {
  return `${COPILOT_RUNTIME_PACKAGE_PREFIX}${getCopilotRuntimePlatform(target)}`;
}

/**
 * @param {string} packageName
 */
function isCopilotRuntimePackage(packageName) {
  return packageName.startsWith(COPILOT_RUNTIME_PACKAGE_PREFIX);
}

/**
 * Dependencies to copy next to a package. For the Copilot SDK this keeps the
 * target platform's runtime package and drops the other platforms' runtimes
 * and the in-process-only koffi.
 *
 * @param {{
 *   packageJson: {
 *     dependencies?: Record<string, string>;
 *     optionalDependencies?: Record<string, string>;
 *   };
 *   packageName: string;
 *   target: { arch: number | string; platform: string };
 * }} options
 */
function getDependencyNamesForPackage({ packageJson, packageName, target }) {
  const dependencyNames = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];

  if (packageName !== COPILOT_SDK_PACKAGE) {
    return dependencyNames;
  }

  const runtimePackageName = getCopilotRuntimePackageName(target);
  return dependencyNames.filter(
    (dependencyName) =>
      !COPILOT_SDK_IN_PROCESS_ONLY_DEPENDENCIES.has(dependencyName) &&
      (!isCopilotRuntimePackage(dependencyName) ||
        dependencyName === runtimePackageName),
  );
}

/**
 * Packages that must not ship in the packaged server for this target: every
 * other platform's Copilot runtime and koffi with its platform binaries.
 *
 * @param {string} packageName
 * @param {{ arch: number | string; platform: string }} target
 */
function isPrunedServerPackage(packageName, target) {
  if (isCopilotRuntimePackage(packageName)) {
    return packageName !== getCopilotRuntimePackageName(target);
  }

  return (
    COPILOT_SDK_IN_PROCESS_ONLY_DEPENDENCIES.has(packageName) ||
    PRUNED_SERVER_PACKAGE_PREFIXES.some((prefix) =>
      packageName.startsWith(prefix),
    )
  );
}

/**
 * @param {{
 *   arch: number | string;
 *   platform: string;
 *   serverNodeModulesPath: string;
 * }} options
 */
function getExpectedPackagedCopilotFiles({
  arch,
  platform,
  serverNodeModulesPath,
}) {
  const runtimePlatform = getCopilotRuntimePlatform({ arch, platform });
  const runtimeRoot = path.join(
    serverNodeModulesPath,
    ...getCopilotRuntimePackageName({ arch, platform }).split("/"),
  );
  const prebuildRoot = path.join(runtimeRoot, "prebuilds", runtimePlatform);

  return [
    path.join(serverNodeModulesPath, "@github", "copilot-sdk", "package.json"),
    path.join(runtimeRoot, "package.json"),
    path.join(
      prebuildRoot,
      runtimePlatform.startsWith("win32")
        ? "copilot-runtime.exe"
        : "copilot-runtime",
    ),
    path.join(prebuildRoot, "runtime.node"),
  ];
}

/**
 * Packaged server files that belong to another platform's Copilot runtime or
 * to koffi, reported as paths relative to the server root.
 *
 * @param {{
 *   arch: number | string;
 *   platform: string;
 *   serverFiles: string[];
 *   serverPath: string;
 * }} options
 */
function findUnexpectedPackagedCopilotFiles({
  arch,
  platform,
  serverFiles,
  serverPath,
}) {
  const target = { arch, platform };
  /** @type {Set<string>} */
  const unexpectedPackages = new Set();

  for (const filePath of serverFiles) {
    const relativePath = path
      .relative(serverPath, filePath)
      .replaceAll("\\", "/");
    const segments = relativePath.split("/");
    const nodeModulesIndex = segments.lastIndexOf("node_modules");
    if (nodeModulesIndex === -1) {
      continue;
    }

    const [scopeOrName, scopedName] = segments.slice(nodeModulesIndex + 1);
    if (!scopeOrName) {
      continue;
    }

    const packageName = scopeOrName.startsWith("@")
      ? `${scopeOrName}/${scopedName ?? ""}`
      : scopeOrName;
    if (isPrunedServerPackage(packageName, target)) {
      unexpectedPackages.add(
        [...segments.slice(0, nodeModulesIndex + 1), packageName].join("/"),
      );
    }
  }

  return [...unexpectedPackages].sort();
}

module.exports = {
  findUnexpectedPackagedCopilotFiles,
  getCopilotRuntimePackageName,
  getCopilotRuntimePlatform,
  getDependencyNamesForPackage,
  getExpectedPackagedCopilotFiles,
  getRequiredServerRuntimePackages,
  isPrunedServerPackage,
  normalizeTargetArch,
};
