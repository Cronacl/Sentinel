// Packages that must never ship in the packaged Next server, even when they
// are installed for development.
//   @anthropic-ai/claude-agent-sdk-<platform>: the Agent SDK's per-platform
//   native Claude Code binary (~225 MB each, 0.2.113+). Sentinel always runs
//   the user's own `claude` through `pathToClaudeCodeExecutable`, so the SDK
//   never needs it. bun still installs the host's copy for dev: its optional
//   dependency handling is all-or-nothing (`--omit optional` would also drop
//   @next/swc, sharp, esbuild and the other native builds), and pnpm's "-"
//   override has no bun equivalent.
// next.config.js keeps them out of output tracing, prune-server.mjs deletes
// any that slip into desktop/dist/server, and the bundle audit fails if one
// reaches the packaged app.
export const EXCLUDED_SERVER_PACKAGE_GLOBS = [
  "@anthropic-ai/claude-agent-sdk-*",
];

const EXCLUDED_SERVER_PACKAGE_PATTERNS = [
  /^@anthropic-ai\/claude-agent-sdk-[^/]+$/,
];

/**
 * @param {string} packageName
 */
export function isExcludedServerPackage(packageName) {
  return EXCLUDED_SERVER_PACKAGE_PATTERNS.some((pattern) =>
    pattern.test(packageName),
  );
}

/**
 * The package directory a node_modules child names, for directories directly
 * under `node_modules/` or `node_modules/@scope/`.
 *
 * @param {string} parentDirectoryPath
 * @param {string} entryName
 */
export function getNodeModulesPackageName(parentDirectoryPath, entryName) {
  const segments = parentDirectoryPath.replaceAll("\\", "/").split("/");
  const parentName = segments.at(-1);
  const grandparentName = segments.at(-2);

  if (parentName === "node_modules") {
    return entryName.startsWith("@") ? null : entryName;
  }

  if (parentName?.startsWith("@") && grandparentName === "node_modules") {
    return `${parentName}/${entryName}`;
  }

  return null;
}

/**
 * Packaged-server files that belong to an excluded package, at any
 * node_modules depth. Returns one entry per offending package directory.
 *
 * @param {{ serverFiles: string[]; serverPath: string }} input
 */
export function findExcludedServerPackages({ serverFiles, serverPath }) {
  const normalizedServerPath = serverPath.replaceAll("\\", "/");
  const offendingPackages = new Set();

  for (const filePath of serverFiles) {
    const normalizedFilePath = filePath.replaceAll("\\", "/");
    const relativePath = normalizedFilePath.startsWith(
      `${normalizedServerPath}/`,
    )
      ? normalizedFilePath.slice(normalizedServerPath.length + 1)
      : normalizedFilePath;
    const segments = relativePath.split("/");

    for (let index = 0; index < segments.length - 1; index += 1) {
      if (segments[index] !== "node_modules") continue;

      const first = segments[index + 1] ?? "";
      const packageName = first.startsWith("@")
        ? `${first}/${segments[index + 2] ?? ""}`
        : first;
      if (isExcludedServerPackage(packageName)) {
        offendingPackages.add(
          [...segments.slice(0, index + 1), packageName].join("/"),
        );
      }
    }
  }

  return [...offendingPackages].sort();
}
