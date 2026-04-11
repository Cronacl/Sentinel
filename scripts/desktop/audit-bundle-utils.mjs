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
