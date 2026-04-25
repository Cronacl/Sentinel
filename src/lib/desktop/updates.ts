import type {
  DesktopArchitecture,
  DesktopPlatform,
  DesktopUpdateState,
} from "@/lib/desktop/contracts";

const FALLBACK_RELEASES_URL = "https://github.com/Cronacl/Sentinel/releases";
export const LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/Cronacl/Sentinel/releases/latest";

export type DesktopReleaseAsset = {
  downloadUrl: string;
  name: string;
  size: number | null;
};

export type DesktopLatestRelease = {
  assets: DesktopReleaseAsset[];
  name: string | null;
  publishedAt: string | null;
  releasePageUrl: string;
  version: string;
};

type GitHubReleaseAsset = {
  browser_download_url?: unknown;
  name?: unknown;
  size?: unknown;
};

type GitHubReleaseResponse = {
  assets?: unknown;
  html_url?: unknown;
  name?: unknown;
  published_at?: unknown;
  tag_name?: unknown;
};

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

export function normalizeGitHubLatestRelease(
  release: GitHubReleaseResponse,
): DesktopLatestRelease | null {
  const tagName = typeof release.tag_name === "string" ? release.tag_name : "";
  const version = tagName.trim().replace(/^v/i, "");

  if (!version) {
    return null;
  }

  const releasePageUrl =
    typeof release.html_url === "string" && release.html_url.trim()
      ? release.html_url
      : `${FALLBACK_RELEASES_URL}/tag/v${version}`;

  const assets = Array.isArray(release.assets)
    ? release.assets
        .map((asset): DesktopReleaseAsset | null => {
          const candidate = asset as GitHubReleaseAsset;
          const name = typeof candidate.name === "string" ? candidate.name : "";
          const downloadUrl =
            typeof candidate.browser_download_url === "string"
              ? candidate.browser_download_url
              : "";

          if (!name.trim() || !downloadUrl.trim()) {
            return null;
          }

          return {
            downloadUrl,
            name,
            size:
              typeof candidate.size === "number" &&
              Number.isFinite(candidate.size) &&
              candidate.size >= 0
                ? candidate.size
                : null,
          };
        })
        .filter((asset): asset is DesktopReleaseAsset => asset !== null)
    : [];

  return {
    assets,
    name: typeof release.name === "string" ? release.name : null,
    publishedAt:
      typeof release.published_at === "string" ? release.published_at : null,
    releasePageUrl,
    version,
  };
}

export function selectDesktopReleaseAsset(
  release: DesktopLatestRelease | null,
  platform: DesktopPlatform,
  arch: DesktopArchitecture,
) {
  if (!release) {
    return null;
  }

  const normalizedArch = arch.toLowerCase();
  const preferredExtension =
    platform === "darwin"
      ? ".dmg"
      : platform === "win32"
        ? ".exe"
        : ".appimage";
  const ignoredExtensions = [".blockmap", ".yml", ".yaml", ".deb", ".rpm"];

  const candidates = release.assets.filter((asset) => {
    const name = asset.name.toLowerCase();

    if (ignoredExtensions.some((extension) => name.endsWith(extension))) {
      return false;
    }

    return name.endsWith(preferredExtension);
  });

  if (candidates.length === 0) {
    return null;
  }

  const archMatches = candidates.filter((asset) => {
    const name = asset.name.toLowerCase();

    if (normalizedArch === "arm64") {
      return name.includes("arm64") || name.includes("aarch64");
    }

    if (normalizedArch === "x64") {
      return (
        name.includes("x64") ||
        name.includes("x86_64") ||
        name.includes("amd64")
      );
    }

    return name.includes(normalizedArch);
  });

  return archMatches[0] ?? candidates[0] ?? null;
}
