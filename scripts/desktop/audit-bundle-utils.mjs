import path from "node:path";

/**
 * @param {string} filePath
 */
function normalizePathForMatch(filePath) {
  return filePath.replaceAll("\\", "/");
}

/**
 * @param {{
 *   requiredFiles: string[];
 *   serverFiles: string[];
 *   serverPath: string;
 * }} input
 */
export function findMissingServerRuntimeFiles({
  requiredFiles,
  serverFiles,
  serverPath,
}) {
  const normalizedServerFiles = new Set(
    serverFiles.map((filePath) =>
      normalizePathForMatch(path.relative(serverPath, filePath)),
    ),
  );

  return requiredFiles.filter((filePath) => {
    const relativePath = normalizePathForMatch(
      path.relative(serverPath, filePath),
    );
    return !normalizedServerFiles.has(relativePath);
  });
}

const BETTER_SQLITE3_ROOT = "node_modules/better-sqlite3/";
const BETTER_SQLITE3_BUILD_INPUT = /^(?:binding\.gyp$|(?:build|deps|src)\/)/;

/**
 * electron-builder names unpacked bundles `<platform>[-<arch>][-unpacked]`,
 * leaving the arch out for x64.
 *
 * @param {string} bundleDirectoryName
 */
export function inferBundleArch(bundleDirectoryName) {
  if (bundleDirectoryName.includes("arm64")) return "arm64";
  if (bundleDirectoryName.includes("universal")) return "universal";
  return "x64";
}

/**
 * better-sqlite3 13+ loads `prebuilds/<platform>-<arch>.node`, so the packaged
 * server must ship the target prebuild and none of the source build inputs.
 *
 * @param {{
 *   arch: string;
 *   platform: NodeJS.Platform;
 *   serverFiles: string[];
 *   serverPath: string;
 * }} input
 */
export function findBetterSqlite3RuntimeIssues({
  arch,
  platform,
  serverFiles,
  serverPath,
}) {
  const moduleFiles = serverFiles
    .map((filePath) =>
      normalizePathForMatch(path.relative(serverPath, filePath)),
    )
    .filter((relativePath) => relativePath.startsWith(BETTER_SQLITE3_ROOT))
    .map((relativePath) => relativePath.slice(BETTER_SQLITE3_ROOT.length));
  const prebuilds = moduleFiles.filter((filePath) =>
    filePath.startsWith("prebuilds/"),
  );
  const expectedPrebuild =
    arch === "universal" ? null : `prebuilds/${platform}-${arch}.node`;
  const issues = [];

  if (!moduleFiles.includes("lib/index.js")) {
    issues.push(`missing ${BETTER_SQLITE3_ROOT}lib/index.js`);
  }

  if (expectedPrebuild && !prebuilds.includes(expectedPrebuild)) {
    issues.push(`missing ${BETTER_SQLITE3_ROOT}${expectedPrebuild}`);
  }

  const unexpectedPrebuilds = prebuilds.filter((filePath) =>
    expectedPrebuild
      ? filePath !== expectedPrebuild
      : !filePath.startsWith(`prebuilds/${platform}-`),
  );
  const buildInputs = moduleFiles.filter((filePath) =>
    BETTER_SQLITE3_BUILD_INPUT.test(filePath),
  );

  for (const filePath of [...unexpectedPrebuilds, ...buildInputs]) {
    issues.push(`unexpected ${BETTER_SQLITE3_ROOT}${filePath}`);
  }

  return issues;
}
