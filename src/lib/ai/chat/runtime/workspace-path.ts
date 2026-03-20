import { stat } from "node:fs/promises";
import path from "node:path";

function normalizeWorkspaceRootPath(rootPath: string | null | undefined) {
  const trimmed = rootPath?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = path.normalize(trimmed);
  if (!path.isAbsolute(normalized)) {
    return null;
  }

  const root = path.parse(normalized).root;
  if (normalized.length <= root.length) {
    return normalized;
  }

  return normalized.replace(/[\\/]+$/, "");
}

export async function resolveAvailableWorkspaceRootPath(
  rootPath: string | null | undefined,
) {
  const normalizedRootPath = normalizeWorkspaceRootPath(rootPath);
  if (!normalizedRootPath) {
    return null;
  }

  const rootStats = await stat(normalizedRootPath).catch(() => null);
  if (!rootStats?.isDirectory()) {
    return null;
  }

  return normalizedRootPath;
}
