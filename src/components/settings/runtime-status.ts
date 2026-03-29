type ClaudeRuntimeStatusLike = {
  binaryDetected?: boolean;
  binaryVersion?: string | null;
  error?: string | null;
  lastSuccessfulProbeAt?: string | null;
  state?: string | null;
  usedCachedStatus?: boolean;
};

export function formatClaudeRuntimeTimestamp(
  value: string,
  formatter: (date: Date) => string = (date) => date.toLocaleString(),
) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return formatter(timestamp);
}

export function getClaudeRuntimeBadgeLabel(
  status: ClaudeRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  if (
    status?.usedCachedStatus ||
    (status?.binaryDetected &&
      status?.state !== "ready" &&
      status?.state !== "auth_unavailable" &&
      status?.state !== "missing_binary")
  ) {
    return "Degraded";
  }

  return isAvailable ? "Ready" : "Setup needed";
}

export function getClaudeRuntimeBadgeColor(
  status: ClaudeRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getClaudeRuntimeBadgeLabel(status, isAvailable) === "Ready"
    ? "success"
    : "warning";
}

export function getClaudeRuntimeBinaryLabel(
  status: ClaudeRuntimeStatusLike | null | undefined,
) {
  if (!status?.binaryDetected) {
    return "Not detected";
  }

  return status.binaryVersion ?? "Detected";
}

export function getClaudeRuntimeFallbackMessage(
  status: ClaudeRuntimeStatusLike | null | undefined,
  formatter?: (date: Date) => string,
) {
  if (
    !status ||
    (!status.usedCachedStatus && status.state !== "timeout_no_cache")
  ) {
    return null;
  }

  const formattedTimestamp = status.lastSuccessfulProbeAt
    ? formatClaudeRuntimeTimestamp(status.lastSuccessfulProbeAt, formatter)
    : null;
  const suffix = formattedTimestamp ? ` from ${formattedTimestamp}` : "";

  if (status.state === "timeout_using_cache") {
    return `Live Claude probe timed out; using cached models${suffix}.`;
  }

  if (status.state === "timeout_no_cache") {
    return `Live Claude probe timed out; using fallback Claude models${suffix}.`;
  }

  return `Live Claude probe failed; using cached models${suffix}.`;
}
