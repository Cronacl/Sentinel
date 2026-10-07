import type {
  EngineAuthSummary,
  EngineSnapshot,
} from "@/lib/ai/chat/engines/contract";

// How Settings → Engines and the composer describe an engine instance, from
// its snapshot alone. Replaces the per-engine runtime-status helpers, whose
// badge ignored the status and whose fallback notice was always empty.

export type SnapshotBadge = {
  color: "danger" | "default" | "success" | "warning";
  label: string;
};

type SnapshotLike = Pick<
  EngineSnapshot,
  | "auth"
  | "availability"
  | "checkedAt"
  | "compatibilityAdvisory"
  | "enabled"
  | "install"
  | "label"
  | "message"
  | "stale"
  | "status"
  | "usable"
>;

export function getSnapshotBadge(snapshot: SnapshotLike): SnapshotBadge {
  if (snapshot.availability === "unavailable") {
    return { color: "danger", label: "Unavailable" };
  }
  if (!snapshot.enabled || snapshot.status === "disabled") {
    return { color: "default", label: "Disabled" };
  }
  if (snapshot.status === "checking") {
    return { color: "default", label: "Checking" };
  }
  return snapshot.usable
    ? { color: "success", label: "Ready" }
    : { color: "warning", label: "Setup needed" };
}

/** The runtime row: its version, or why there is none. */
export function getInstallLabel(
  snapshot: Pick<SnapshotLike, "install" | "status">,
) {
  if (snapshot.install.installed) {
    return snapshot.install.version ?? "Detected";
  }
  if (snapshot.status === "checking") {
    return "Checking…";
  }
  return snapshot.install.path ? "Path retained" : "Not detected";
}

const INSTALL_SOURCE_LABELS: Record<
  NonNullable<EngineSnapshot["install"]["source"]>,
  string
> = {
  config: "Instance setting",
  env: "Path override",
  "login-shell": "Login shell",
  "managed-install": "Installed by Sentinel",
  "managed-path": "PATH",
  "sdk-bundled": "Bundled with Sentinel",
};

export function getInstallSourceLabel(snapshot: Pick<SnapshotLike, "install">) {
  return snapshot.install.source
    ? INSTALL_SOURCE_LABELS[snapshot.install.source]
    : "Not detected";
}

export function getAuthLabel(snapshot: Pick<SnapshotLike, "auth" | "usable">) {
  switch (snapshot.auth.status) {
    case "authenticated":
      return "Ready";
    case "unauthenticated":
      return "Login needed";
    default:
      return snapshot.usable ? "Ready" : "Unavailable";
  }
}

function capitalize(value: string) {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

const AUTH_METHOD_LABELS: Record<string, string> = {
  amazonBedrock: "Amazon Bedrock",
  apiKey: "API key",
  chatgpt: "ChatGPT",
};

/**
 * The account row. Emails and logins are sensitive (masked until the user
 * reveals them); a method or plan alone is not.
 */
export function getAccountDisplay(
  auth: Pick<
    EngineAuthSummary,
    "email" | "label" | "method" | "plan" | "status"
  >,
): { isSensitive: boolean; value: string } {
  const email = auth.email?.trim();
  if (email) {
    return { isSensitive: true, value: email };
  }
  const label = auth.label?.trim();
  if (label) {
    return { isSensitive: true, value: label };
  }

  const plan = auth.plan?.trim();
  const method = auth.method ? (AUTH_METHOD_LABELS[auth.method] ?? null) : null;
  if (method) {
    return {
      isSensitive: false,
      value:
        plan && plan.toLowerCase() !== "unknown"
          ? `${method} ${capitalize(plan)}`
          : method,
    };
  }

  return {
    isSensitive: false,
    value:
      auth.status === "authenticated" ? "Authenticated" : "Not authenticated",
  };
}

/**
 * A notice for the instance card: why it is not usable, that the status
 * shown is the last known one, or a version advisory. Null when there is
 * nothing to say.
 */
export function getSnapshotNotice(
  snapshot: SnapshotLike,
  formatter: (date: Date) => string = (date) => date.toLocaleString(),
) {
  if (snapshot.status === "checking" || !snapshot.enabled) {
    return null;
  }

  if (snapshot.stale) {
    const checkedAt = snapshot.checkedAt ? new Date(snapshot.checkedAt) : null;
    const when =
      checkedAt && !Number.isNaN(checkedAt.getTime())
        ? ` (checked ${formatter(checkedAt)})`
        : "";
    return `${snapshot.message ?? `${snapshot.label} did not answer the last check.`} Showing the last known status${when}.`;
  }

  const advisory = snapshot.compatibilityAdvisory;
  if (
    advisory?.message &&
    advisory.status !== "supported" &&
    advisory.status !== "unknown"
  ) {
    return advisory.message;
  }

  return snapshot.usable ? null : snapshot.message;
}

/** Why the composer cannot use the instance right now. */
export function getComposerUnavailableMessage(snapshot: SnapshotLike) {
  const { label } = snapshot;
  if (snapshot.availability === "unavailable") {
    return (
      snapshot.message ?? `${label} is unavailable in this Sentinel build.`
    );
  }
  if (!snapshot.enabled || snapshot.status === "disabled") {
    return `${label} is disabled.`;
  }
  if (snapshot.status === "checking") {
    return `${label} is being checked.`;
  }
  if (snapshot.auth.status === "unauthenticated") {
    return `${label} needs authentication before it can be used here.`;
  }
  if (!snapshot.install.installed) {
    return `${label} runtime was not detected in this Sentinel session.`;
  }
  if (snapshot.compatibilityAdvisory?.status === "broken") {
    return (
      snapshot.compatibilityAdvisory.message ??
      `${label} needs an update before it can be used here.`
    );
  }
  if (snapshot.status === "error" || snapshot.stale) {
    return `${label} is temporarily unavailable in this Sentinel runtime.`;
  }
  return `${label} is unavailable in this Sentinel runtime.`;
}
