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

/**
 * sqlite-vec resolves `sqlite-vec-<os>-<arch>/vec0.<ext>` at runtime, which
 * Next's output tracing does not copy on its own.
 *
 * @param {{
 *   arch: string;
 *   platform: NodeJS.Platform;
 *   serverFiles: string[];
 *   serverPath: string;
 * }} input
 */
export function findSqliteVecRuntimeIssues({
  arch,
  platform,
  serverFiles,
  serverPath,
}) {
  const relativeFiles = new Set(
    serverFiles.map((filePath) =>
      normalizePathForMatch(path.relative(serverPath, filePath)),
    ),
  );

  if (
    arch === "universal" ||
    !relativeFiles.has("node_modules/sqlite-vec/package.json")
  ) {
    return [];
  }

  const os = platform === "win32" ? "windows" : platform;
  const extension =
    platform === "win32" ? "dll" : platform === "darwin" ? "dylib" : "so";
  const loadablePath = `node_modules/sqlite-vec-${os}-${arch}/vec0.${extension}`;

  return relativeFiles.has(loadablePath) ? [] : [`missing ${loadablePath}`];
}

const RELATIVE_IMPORT_PATTERN =
  /(?:from\s+|import\s*\(\s*|require\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g;

/**
 * Relative imports reachable from the app's main entry that app.asar does
 * not contain. electron-builder ships only build.files, so a missing one
 * crashes the packaged app at launch with ERR_MODULE_NOT_FOUND.
 *
 * @param {{
 *   entries: string[];
 *   main: string;
 *   readFile: (entry: string) => string;
 * }} input `entries` as @electron/asar lists them ("/desktop/main/index.mjs").
 */
export function findMissingAsarImports({ entries, main, readFile }) {
  const files = new Set(
    entries.map((entry) => normalizePathForMatch(entry).replace(/^\/+/, "")),
  );
  /** @type {string[]} */
  const missing = [];
  const seen = new Set();
  /** @type {{ file: string; from: string | null }[]} */
  const queue = [{ file: normalizePathForMatch(main), from: null }];

  while (queue.length > 0) {
    const { file, from } =
      /** @type {{ file: string; from: string | null }} */ (queue.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    if (!files.has(file)) {
      missing.push(from ? `${file} (imported from ${from})` : file);
      continue;
    }
    for (const match of readFile(file).matchAll(RELATIVE_IMPORT_PATTERN)) {
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), match[1] ?? ""),
      );
      if (/\.(?:[cm]?js|json)$/.test(target)) {
        queue.push({ file: target, from: file });
      }
    }
  }

  return missing;
}
