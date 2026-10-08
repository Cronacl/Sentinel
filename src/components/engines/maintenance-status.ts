import type { EngineSnapshot } from "@/lib/ai/chat/engines/contract";

// How Settings → Engines presents an instance's version advisories and its
// install/update state, from the snapshot alone (pure, client-safe).

export type AdvisoryBadge = {
  color: "accent" | "danger" | "default" | "success" | "warning";
  label: string;
};

type SnapshotLike = Pick<
  EngineSnapshot,
  | "availability"
  | "compatibilityAdvisory"
  | "enabled"
  | "install"
  | "installState"
  | "setup"
  | "updateState"
  | "versionAdvisory"
>;

function isActive(snapshot: SnapshotLike) {
  return (
    snapshot.enabled &&
    snapshot.availability === "available" &&
    snapshot.install.installed
  );
}

/** The compatibility advisory as a badge (none while it is fine). */
export function getCompatibilityBadge(
  snapshot: SnapshotLike,
): AdvisoryBadge | null {
  if (!isActive(snapshot)) {
    return null;
  }
  switch (snapshot.compatibilityAdvisory?.status) {
    case "broken":
      return { color: "danger", label: "Update required" };
    case "unsupported":
      return { color: "warning", label: "Unsupported version" };
    case "graceful":
      return { color: "warning", label: "Update recommended" };
    default:
      return null;
  }
}

/** A newer release than the installed one, as a badge. */
export function getVersionBadge(snapshot: SnapshotLike): AdvisoryBadge | null {
  const advisory = snapshot.versionAdvisory;
  if (!isActive(snapshot) || advisory?.status !== "behind_latest") {
    return null;
  }
  return {
    color: "accent",
    label: advisory.latestVersion
      ? `${advisory.latestVersion} available`
      : "Update available",
  };
}

export function getAdvisoryBadges(snapshot: SnapshotLike) {
  return [getCompatibilityBadge(snapshot), getVersionBadge(snapshot)].filter(
    (badge): badge is AdvisoryBadge => badge !== null,
  );
}

const INSTALL_PHASES_IN_PROGRESS = new Set([
  "downloading",
  "extracting",
  "verifying",
]);

/** An install or update is queued or running. */
export function isMaintenanceRunning(
  snapshot: Pick<EngineSnapshot, "installState" | "updateState">,
) {
  return (
    snapshot.updateState?.status === "queued" ||
    snapshot.updateState?.status === "running" ||
    INSTALL_PHASES_IN_PROGRESS.has(snapshot.installState?.phase ?? "")
  );
}

export type MaintenanceAction = {
  kind: "install" | "update";
  label: string;
};

/**
 * The action the instance card offers: Install for a missing CLI that can
 * be installed from here, Update when a newer (or, for a version Sentinel
 * cannot drive, any) release can be applied. Nothing while one runs.
 */
export function getMaintenanceAction(
  snapshot: SnapshotLike,
): MaintenanceAction | null {
  if (
    !snapshot.enabled ||
    snapshot.availability !== "available" ||
    isMaintenanceRunning(snapshot)
  ) {
    return null;
  }
  if (!snapshot.install.installed) {
    return snapshot.setup.canInstall
      ? { kind: "install", label: "Install" }
      : null;
  }

  const advisory = snapshot.versionAdvisory;
  if (!advisory?.canUpdate) {
    return null;
  }
  const needsUpdate =
    snapshot.compatibilityAdvisory?.status === "broken" ||
    snapshot.compatibilityAdvisory?.status === "unsupported" ||
    snapshot.compatibilityAdvisory?.status === "graceful";
  if (advisory.status === "behind_latest" || needsUpdate) {
    return { kind: "update", label: "Update" };
  }
  return null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** One line describing the running install or update. */
export function getMaintenanceProgressText(
  snapshot: Pick<EngineSnapshot, "installState" | "updateState">,
) {
  const install = snapshot.installState;
  if (install && INSTALL_PHASES_IN_PROGRESS.has(install.phase)) {
    if (install.phase === "downloading") {
      const total = install.totalBytes
        ? ` of ${formatBytes(install.totalBytes)}`
        : "";
      return `Downloading ${formatBytes(install.downloadedBytes)}${total}…`;
    }
    return install.phase === "extracting" ? "Extracting…" : "Verifying…";
  }
  const update = snapshot.updateState;
  if (update?.status === "queued" || update?.status === "running") {
    return update.message ?? "Working…";
  }
  return null;
}

export type MaintenanceResult = {
  message: string;
  output: string | null;
  tone: "danger" | "success" | "warning";
};

/** The outcome of the last install or update, while it is worth showing. */
export function getMaintenanceResult(
  snapshot: Pick<EngineSnapshot, "installState" | "updateState">,
): MaintenanceResult | null {
  const update = snapshot.updateState;
  if (
    update &&
    (update.status === "succeeded" ||
      update.status === "failed" ||
      update.status === "unchanged")
  ) {
    return {
      message:
        update.message ??
        (update.status === "succeeded" ? "Done." : "It did not finish."),
      output: update.output,
      tone:
        update.status === "succeeded"
          ? "success"
          : update.status === "failed"
            ? "danger"
            : "warning",
    };
  }
  const install = snapshot.installState;
  if (
    install &&
    (install.phase === "succeeded" ||
      install.phase === "failed" ||
      install.phase === "cancelled")
  ) {
    return {
      message:
        install.message ??
        (install.phase === "succeeded" ? "Installed." : "Cancelled."),
      output: null,
      tone:
        install.phase === "succeeded"
          ? "success"
          : install.phase === "failed"
            ? "danger"
            : "warning",
    };
  }
  return null;
}
