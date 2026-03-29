type RuntimeStatusLike = {
  binaryDetected?: boolean;
  binaryVersion?: string | null;
  cliDetected?: boolean;
  cliVersion?: string | null;
  lastSuccessfulProbeAt?: string | null;
  state?: string | null;
  usedCachedStatus?: boolean;
};

type RuntimeStatusKind = "Claude" | "Codex";

function formatRuntimeTimestamp(
  value: string,
  formatter: (date: Date) => string = (date) => date.toLocaleString(),
) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return formatter(timestamp);
}

function getRuntimeDetectionLabel(
  status: RuntimeStatusLike | null | undefined,
  options: {
    detectedKey: "binaryDetected" | "cliDetected";
    versionKey: "binaryVersion" | "cliVersion";
  },
) {
  if (!status?.[options.detectedKey]) {
    return "Not detected";
  }

  return status[options.versionKey] ?? "Detected";
}

function getRuntimeBadgeLabel(
  status: RuntimeStatusLike | null | undefined,
  isAvailable: boolean,
  options: {
    detectedKey: "binaryDetected" | "cliDetected";
    missingState: string;
  },
) {
  if (
    status?.usedCachedStatus ||
    (status?.[options.detectedKey] &&
      status?.state !== "ready" &&
      status?.state !== "auth_unavailable" &&
      status?.state !== options.missingState)
  ) {
    return "Degraded";
  }

  return isAvailable ? "Ready" : "Setup needed";
}

function getRuntimeBadgeColor(
  status: RuntimeStatusLike | null | undefined,
  isAvailable: boolean,
  options: {
    detectedKey: "binaryDetected" | "cliDetected";
    missingState: string;
  },
) {
  return getRuntimeBadgeLabel(status, isAvailable, options) === "Ready"
    ? "success"
    : "warning";
}

function getRuntimeFallbackMessage(
  runtime: RuntimeStatusKind,
  status: RuntimeStatusLike | null | undefined,
  formatter?: (date: Date) => string,
) {
  if (
    !status ||
    (!status.usedCachedStatus && status.state !== "timeout_no_cache")
  ) {
    return null;
  }

  const formattedTimestamp = status.lastSuccessfulProbeAt
    ? formatRuntimeTimestamp(status.lastSuccessfulProbeAt, formatter)
    : null;
  const suffix = formattedTimestamp ? ` from ${formattedTimestamp}` : "";

  if (status.state === "timeout_using_cache") {
    return `Live ${runtime} probe timed out; using cached models${suffix}.`;
  }

  if (status.state === "timeout_no_cache") {
    return `Live ${runtime} probe timed out; using fallback ${runtime} models${suffix}.`;
  }

  return `Live ${runtime} probe failed; using cached models${suffix}.`;
}

function getRuntimeComposerUnavailableMessage(
  runtime: RuntimeStatusKind,
  status: RuntimeStatusLike | null | undefined,
) {
  if (!status) {
    return `${runtime} is unavailable in this Sentinel runtime.`;
  }

  if (status.state === "auth_unavailable") {
    return `${runtime} needs authentication before it can be used here.`;
  }

  if (
    status.state === "missing_binary" ||
    status.state === "missing_cli" ||
    (runtime === "Claude" && status.binaryDetected === false) ||
    (runtime === "Codex" && status.cliDetected === false)
  ) {
    return `${runtime} runtime was not detected in this Sentinel session.`;
  }

  if (
    status.usedCachedStatus ||
    status.state === "timeout_no_cache" ||
    status.state === "timeout_using_cache" ||
    status.state === "error"
  ) {
    return `${runtime} is temporarily unavailable in this Sentinel runtime.`;
  }

  return `${runtime} is unavailable in this Sentinel runtime.`;
}

type ClaudeRuntimeStatusLike = RuntimeStatusLike;
type CodexRuntimeStatusLike = RuntimeStatusLike;

export function formatClaudeRuntimeTimestamp(
  value: string,
  formatter?: (date: Date) => string,
) {
  return formatRuntimeTimestamp(value, formatter);
}

export function getClaudeRuntimeBadgeLabel(
  status: ClaudeRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeLabel(status, isAvailable, {
    detectedKey: "binaryDetected",
    missingState: "missing_binary",
  });
}

export function getClaudeRuntimeBadgeColor(
  status: ClaudeRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeColor(status, isAvailable, {
    detectedKey: "binaryDetected",
    missingState: "missing_binary",
  });
}

export function getClaudeRuntimeBinaryLabel(
  status: ClaudeRuntimeStatusLike | null | undefined,
) {
  return getRuntimeDetectionLabel(status, {
    detectedKey: "binaryDetected",
    versionKey: "binaryVersion",
  });
}

export function getClaudeRuntimeFallbackMessage(
  status: ClaudeRuntimeStatusLike | null | undefined,
  formatter?: (date: Date) => string,
) {
  return getRuntimeFallbackMessage("Claude", status, formatter);
}

export function getClaudeComposerUnavailableMessage(
  status: ClaudeRuntimeStatusLike | null | undefined,
) {
  return getRuntimeComposerUnavailableMessage("Claude", status);
}

export function getCodexRuntimeBadgeLabel(
  status: CodexRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeLabel(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_cli",
  });
}

export function getCodexRuntimeBadgeColor(
  status: CodexRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeColor(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_cli",
  });
}

export function getCodexRuntimeCliLabel(
  status: CodexRuntimeStatusLike | null | undefined,
) {
  return getRuntimeDetectionLabel(status, {
    detectedKey: "cliDetected",
    versionKey: "cliVersion",
  });
}

export function getCodexRuntimeFallbackMessage(
  status: CodexRuntimeStatusLike | null | undefined,
  formatter?: (date: Date) => string,
) {
  return getRuntimeFallbackMessage("Codex", status, formatter);
}

export function getCodexComposerUnavailableMessage(
  status: CodexRuntimeStatusLike | null | undefined,
) {
  return getRuntimeComposerUnavailableMessage("Codex", status);
}
