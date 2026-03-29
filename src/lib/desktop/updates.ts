import type { DesktopUpdateState } from "@/lib/desktop/contracts";

const FALLBACK_RELEASES_URL = "https://github.com/Cronacl/Sentinel/releases";

export function formatUpdateBytes(bytes: number | null | undefined) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatUpdateTimestamp(timestamp: string | null | undefined) {
  if (!timestamp) {
    return "Never checked";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Never checked";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function getUpdateStatusLabel(state: DesktopUpdateState) {
  if (!state.isSupported) {
    return "Unavailable";
  }

  switch (state.status) {
    case "checking":
      return "Checking";
    case "available":
      return "Update found";
    case "downloading":
      return "Downloading";
    case "downloaded":
      return "Ready to install";
    case "up_to_date":
      return "Up to date";
    case "error":
      return "Attention needed";
    default:
      return "Idle";
  }
}

export function getUpdateStatusColor(state: DesktopUpdateState) {
  if (!state.isSupported) {
    return "default" as const;
  }

  switch (state.status) {
    case "downloaded":
    case "up_to_date":
      return "success" as const;
    case "available":
    case "downloading":
      return "accent" as const;
    case "checking":
      return "warning" as const;
    case "error":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

export function getUpdatePrimaryActionLabel(state: DesktopUpdateState) {
  if (state.status === "downloaded") {
    return "Restart to install";
  }

  if (state.status === "checking") {
    return "Checking for updates";
  }

  if (state.status === "available" || state.status === "downloading") {
    return "Downloading update";
  }

  return "Check for updates";
}

export function getUpdateReleaseUrl(state: DesktopUpdateState) {
  return state.releasePageUrl ?? FALLBACK_RELEASES_URL;
}

export function getUpdateProgressText(state: DesktopUpdateState) {
  if (
    state.status !== "downloading" &&
    state.status !== "downloaded" &&
    state.status !== "available"
  ) {
    return null;
  }

  if (
    typeof state.bytesTransferred === "number" &&
    typeof state.bytesTotal === "number" &&
    state.bytesTotal > 0
  ) {
    return `${formatUpdateBytes(state.bytesTransferred)} of ${formatUpdateBytes(state.bytesTotal)}`;
  }

  if (
    typeof state.bytesTransferred === "number" &&
    state.bytesTransferred > 0
  ) {
    return `${formatUpdateBytes(state.bytesTransferred)} downloaded`;
  }

  return "Preparing download";
}
