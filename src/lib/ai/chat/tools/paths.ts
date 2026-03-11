import path from "node:path";

import type { PermissionMode } from "@/lib/security";

export function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

export function normalizeRelativePath(value: string) {
  const normalized = toPosixPath(value.trim()).replace(/\/+/g, "/");
  if (!normalized || normalized === ".") {
    return ".";
  }

  const withoutDotPrefix = normalized.replace(/^\.\//, "");
  return withoutDotPrefix.replace(/\/$/, "") || ".";
}

export function isPathWithinRoot(candidatePath: string, allowedRoot: string) {
  const relative = path.relative(allowedRoot, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveToolPath({
  defaultDirectory,
  permissionMode,
  requestedPath,
  toolName,
}: {
  defaultDirectory: string;
  permissionMode: PermissionMode;
  requestedPath?: string;
  toolName: string;
}) {
  const rawPath = requestedPath?.trim() || ".";

  if (permissionMode === "default" && path.isAbsolute(rawPath)) {
    throw new Error(
      `The ${toolName} tool only accepts relative paths in default permissions mode.`,
    );
  }

  const resolvedPath = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(defaultDirectory, rawPath);

  if (
    permissionMode === "default" &&
    !isPathWithinRoot(resolvedPath, defaultDirectory)
  ) {
    throw new Error(
      "The requested path must stay inside the selected workspace root.",
    );
  }

  const label = path.isAbsolute(rawPath)
    ? toPosixPath(path.normalize(resolvedPath))
    : normalizeRelativePath(path.relative(defaultDirectory, resolvedPath) || ".");

  return {
    label,
    rawPath,
    resolvedPath,
  };
}

export function resolveToolDirectory(input: {
  defaultDirectory: string;
  permissionMode: PermissionMode;
  requestedPath?: string;
  toolName: string;
}) {
  const resolved = resolveToolPath(input);

  return {
    resolvedDirectory: resolved.resolvedPath,
    rootLabel: resolved.label,
  };
}
