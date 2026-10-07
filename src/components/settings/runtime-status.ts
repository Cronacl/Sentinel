type RuntimeStatusLike = {
  binaryDetected?: boolean;
  binaryPath?: string | null;
  binaryVersion?: string | null;
  cliDetected?: boolean;
  cliPath?: string | null;
  cliVersion?: string | null;
  lastSuccessfulProbeAt?: string | null;
  state?: string | null;
  usedCachedStatus?: boolean;
};

type RuntimeStatusKind = "Claude" | "Codex" | "Copilot" | "Cursor" | "OpenCode";

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
    const retainedPath =
      options.detectedKey === "binaryDetected"
        ? status?.binaryPath
        : status?.cliPath;
    if (retainedPath) {
      return "Path retained";
    }

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
  void status;
  void options;
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
  void runtime;
  void status;
  void formatter;
  return null;
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
    status.state === "missing_runtime" ||
    (runtime === "Claude" && status.binaryDetected === false) ||
    ((runtime === "Codex" ||
      runtime === "Copilot" ||
      runtime === "Cursor" ||
      runtime === "OpenCode") &&
      status.cliDetected === false)
  ) {
    return `${runtime} runtime was not detected in this Sentinel session.`;
  }

  if (status.state === "error" || status.state === "timeout_using_cache") {
    return `${runtime} is temporarily unavailable in this Sentinel runtime.`;
  }

  return `${runtime} is unavailable in this Sentinel runtime.`;
}

type ClaudeRuntimeStatusLike = RuntimeStatusLike;
type CopilotRuntimeStatusLike = RuntimeStatusLike;
type CodexRuntimeStatusLike = RuntimeStatusLike;
type CursorRuntimeStatusLike = RuntimeStatusLike;
type OpenCodeRuntimeStatusLike = RuntimeStatusLike & {
  compatibilityAdvisory?: { message: string | null } | null;
};

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

export function getCopilotRuntimeBadgeLabel(
  status: CopilotRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeLabel(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_runtime",
  });
}

export function getCopilotRuntimeBadgeColor(
  status: CopilotRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeColor(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_runtime",
  });
}

export function getCopilotRuntimeCliLabel(
  status: CopilotRuntimeStatusLike | null | undefined,
) {
  return getRuntimeDetectionLabel(status, {
    detectedKey: "cliDetected",
    versionKey: "cliVersion",
  });
}

export function getCopilotRuntimeSourceLabel(
  status: { runtimeSource?: string | null } | null | undefined,
) {
  switch (status?.runtimeSource) {
    case "bundled":
      return "Bundled with Sentinel";
    case "env_override":
      return "Path override";
    case "user_cli":
      return "Installed Copilot CLI";
    default:
      return "Not detected";
  }
}

export function getCopilotRuntimeFallbackMessage(
  status: CopilotRuntimeStatusLike | null | undefined,
  formatter?: (date: Date) => string,
) {
  return getRuntimeFallbackMessage("Copilot", status, formatter);
}

export function getCopilotComposerUnavailableMessage(
  status: CopilotRuntimeStatusLike | null | undefined,
) {
  return getRuntimeComposerUnavailableMessage("Copilot", status);
}

export function getCursorRuntimeBadgeLabel(
  status: CursorRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeLabel(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_runtime",
  });
}

export function getCursorRuntimeBadgeColor(
  status: CursorRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeColor(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_runtime",
  });
}

export function getCursorRuntimeCliLabel(
  status: CursorRuntimeStatusLike | null | undefined,
) {
  return getRuntimeDetectionLabel(status, {
    detectedKey: "cliDetected",
    versionKey: "cliVersion",
  });
}

export function getCursorRuntimeFallbackMessage(
  status: CursorRuntimeStatusLike | null | undefined,
  formatter?: (date: Date) => string,
) {
  return getRuntimeFallbackMessage("Cursor", status, formatter);
}

export function getCursorComposerUnavailableMessage(
  status: CursorRuntimeStatusLike | null | undefined,
) {
  return getRuntimeComposerUnavailableMessage("Cursor", status);
}

export function getOpenCodeRuntimeBadgeLabel(
  status: OpenCodeRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeLabel(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_runtime",
  });
}

export function getOpenCodeRuntimeBadgeColor(
  status: OpenCodeRuntimeStatusLike | null | undefined,
  isAvailable: boolean,
) {
  return getRuntimeBadgeColor(status, isAvailable, {
    detectedKey: "cliDetected",
    missingState: "missing_runtime",
  });
}

export function getOpenCodeRuntimeCliLabel(
  status: OpenCodeRuntimeStatusLike | null | undefined,
) {
  return getRuntimeDetectionLabel(status, {
    detectedKey: "cliDetected",
    versionKey: "cliVersion",
  });
}

export function getOpenCodeRuntimeFallbackMessage(
  status: OpenCodeRuntimeStatusLike | null | undefined,
  formatter?: (date: Date) => string,
) {
  // The version advisory ("update recommended", "too old", "2.x not supported
  // yet") is the only OpenCode-specific notice the card shows.
  return (
    getRuntimeFallbackMessage("OpenCode", status, formatter) ??
    status?.compatibilityAdvisory?.message ??
    null
  );
}

export function getOpenCodeComposerUnavailableMessage(
  status: OpenCodeRuntimeStatusLike | null | undefined,
) {
  return getRuntimeComposerUnavailableMessage("OpenCode", status);
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

type CodexAccountLike = {
  email?: string | null;
  planType?: string | null;
  type: string;
};

function formatCodexPlanType(planType: string | null | undefined) {
  const trimmed = planType?.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }

  return trimmed[0]!.toUpperCase() + trimmed.slice(1);
}

/**
 * The Codex account row on the engines settings page. Only an email is
 * sensitive (masked until the user reveals it); a ChatGPT login without an
 * email and an Amazon Bedrock login are authenticated too.
 */
export function getCodexAccountDisplay(
  account: CodexAccountLike | null | undefined,
): { isSensitive: boolean; value: string } {
  switch (account?.type) {
    case "apiKey":
      return { isSensitive: false, value: "API key" };
    case "chatgpt": {
      const email = account.email?.trim();
      if (email) {
        return { isSensitive: true, value: email };
      }

      const plan = formatCodexPlanType(account.planType);
      return {
        isSensitive: false,
        value: plan ? `ChatGPT ${plan}` : "ChatGPT",
      };
    }
    case "amazonBedrock":
      return { isSensitive: false, value: "Amazon Bedrock" };
    default:
      return { isSensitive: false, value: "Not authenticated" };
  }
}
