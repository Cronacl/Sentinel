export type ResolvedWorkspaceFileLink = {
  filePath: string;
  lineNumber: number | null;
};

const FILE_URL_PREFIX = "file://";
const KNOWN_POSIX_FILE_PREFIXES = [
  "/Users/",
  "/home/",
  "/tmp/",
  "/var/",
  "/private/",
  "/opt/",
  "/etc/",
  "/mnt/",
  "/srv/",
  "/Volumes/",
];

function decodeHrefPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractHashLineNumber(hash: string) {
  const match = /^#L(\d+)(?:C\d+)?$/i.exec(hash.trim());
  if (!match) {
    return null;
  }

  const lineNumber = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(lineNumber) ? lineNumber : null;
}

function extractPathLineNumber(pathname: string) {
  if (/^[A-Za-z]:[\\/]/.test(pathname)) {
    return { filePath: pathname, lineNumber: null };
  }

  const match = /^(.*):(\d+)(?::\d+)?$/.exec(pathname);
  if (!match) {
    return { filePath: pathname, lineNumber: null };
  }

  const filePath = match[1] ?? pathname;
  const lineNumber = Number.parseInt(match[2] ?? "", 10);
  return {
    filePath,
    lineNumber: Number.isFinite(lineNumber) ? lineNumber : null,
  };
}

function isAbsoluteWorkspaceFilePath(
  pathname: string,
  workspaceRootPath: string | null | undefined,
) {
  const normalizedWorkspaceRoot = workspaceRootPath?.trim() ?? "";
  if (
    normalizedWorkspaceRoot &&
    (pathname === normalizedWorkspaceRoot ||
      pathname.startsWith(`${normalizedWorkspaceRoot}/`))
  ) {
    return true;
  }

  if (/^[A-Za-z]:[\\/]/.test(pathname)) {
    return true;
  }

  return KNOWN_POSIX_FILE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function resolveWorkspaceFileLink(
  href: string | null | undefined,
  workspaceRootPath: string | null | undefined,
): ResolvedWorkspaceFileLink | null {
  const trimmedHref = href?.trim();
  const normalizedWorkspaceRoot = workspaceRootPath?.trim();
  if (!trimmedHref) {
    return null;
  }

  if (!normalizedWorkspaceRoot) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedHref)) {
    if (!trimmedHref.toLowerCase().startsWith(FILE_URL_PREFIX)) {
      return null;
    }

    const url = new URL(trimmedHref);
    const decodedPath = decodeHrefPath(url.pathname);
    const resolvedPath = extractPathLineNumber(decodedPath);
    if (
      !isAbsoluteWorkspaceFilePath(
        resolvedPath.filePath,
        normalizedWorkspaceRoot,
      )
    ) {
      return null;
    }

    return {
      filePath: resolvedPath.filePath,
      lineNumber: resolvedPath.lineNumber ?? extractHashLineNumber(url.hash),
    };
  }

  const hashIndex = trimmedHref.indexOf("#");
  const queryIndex = trimmedHref.indexOf("?");
  const suffixIndex = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .reduce<number>(
      (smallest, index) => Math.min(smallest, index),
      trimmedHref.length,
    );
  const rawPathname = trimmedHref.slice(0, suffixIndex);
  const hash = hashIndex >= 0 ? trimmedHref.slice(hashIndex) : "";
  const decodedPath = decodeHrefPath(rawPathname);
  const resolvedPath = extractPathLineNumber(decodedPath);

  if (
    !isAbsoluteWorkspaceFilePath(resolvedPath.filePath, normalizedWorkspaceRoot)
  ) {
    return null;
  }

  return {
    filePath: resolvedPath.filePath,
    lineNumber: resolvedPath.lineNumber ?? extractHashLineNumber(hash),
  };
}
