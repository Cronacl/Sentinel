import { describe, expect, it } from "bun:test";

import type { DesktopUpdateState } from "./contracts";
import {
  formatUpdateBytes,
  formatUpdateTimestamp,
  getUpdatePrimaryActionLabel,
  getUpdateProgressText,
  getUpdateReleaseUrl,
  getUpdateStatusColor,
  getUpdateStatusLabel,
  normalizeGitHubLatestRelease,
  normalizeReleaseNotesContent,
  selectDesktopReleaseAsset,
} from "./updates";

function createState(
  overrides: Partial<DesktopUpdateState> = {},
): DesktopUpdateState {
  return {
    availableVersion: null,
    bytesTotal: null,
    bytesTransferred: null,
    checkedAt: null,
    currentVersion: "1.0.0",
    downloadPercent: null,
    errorMessage: null,
    isSupported: true,
    releaseDate: null,
    releaseName: null,
    releaseNotes: null,
    releasePageUrl: null,
    status: "idle",
    supportReason: null,
    ...overrides,
  };
}

describe("desktop update formatting helpers", () => {
  it("formats byte counts and timestamps", () => {
    expect(formatUpdateBytes(0)).toBe("0 B");
    expect(formatUpdateBytes(1536)).toBe("1.5 KB");
    expect(formatUpdateTimestamp("2026-03-29T10:00:00.000Z")).toContain("2026");
    expect(formatUpdateTimestamp(null)).toBe("Never checked");
  });

  it("derives UI labels for update states", () => {
    expect(getUpdateStatusLabel(createState({ status: "idle" }))).toBe("Idle");
    expect(getUpdateStatusLabel(createState({ status: "checking" }))).toBe(
      "Checking",
    );
    expect(getUpdateStatusLabel(createState({ status: "downloading" }))).toBe(
      "Downloading",
    );
    expect(getUpdateStatusLabel(createState({ status: "downloaded" }))).toBe(
      "Ready to install",
    );
    expect(getUpdateStatusLabel(createState({ status: "error" }))).toBe(
      "Attention needed",
    );
    expect(
      getUpdateStatusLabel(
        createState({
          isSupported: false,
          supportReason: "No AppImage",
        }),
      ),
    ).toBe("Unavailable");
  });

  it("derives primary actions and release URLs", () => {
    expect(
      getUpdatePrimaryActionLabel(createState({ status: "up_to_date" })),
    ).toBe("Check for updates");
    expect(
      getUpdatePrimaryActionLabel(createState({ status: "checking" })),
    ).toBe("Checking for updates");
    expect(
      getUpdatePrimaryActionLabel(createState({ status: "downloading" })),
    ).toBe("Downloading update");
    expect(
      getUpdatePrimaryActionLabel(createState({ status: "downloaded" })),
    ).toBe("Restart to install");

    expect(
      getUpdateReleaseUrl(
        createState({
          availableVersion: "1.1.0",
          releasePageUrl:
            "https://github.com/Cronacl/Sentinel/releases/tag/v1.1.0",
        }),
      ),
    ).toBe("https://github.com/Cronacl/Sentinel/releases/tag/v1.1.0");
    expect(getUpdateReleaseUrl(createState())).toBe(
      "https://github.com/Cronacl/Sentinel/releases",
    );
  });

  it("derives status colors and progress text", () => {
    expect(getUpdateStatusColor(createState({ status: "up_to_date" }))).toBe(
      "success",
    );
    expect(getUpdateStatusColor(createState({ status: "checking" }))).toBe(
      "warning",
    );
    expect(getUpdateStatusColor(createState({ status: "downloading" }))).toBe(
      "accent",
    );
    expect(getUpdateStatusColor(createState({ status: "error" }))).toBe(
      "danger",
    );

    expect(
      getUpdateProgressText(
        createState({
          bytesTotal: 1024,
          bytesTransferred: 512,
          status: "downloading",
        }),
      ),
    ).toBe("512 B of 1.0 KB");
    expect(getUpdateProgressText(createState({ status: "available" }))).toBe(
      "Preparing download",
    );
    expect(getUpdateProgressText(createState({ status: "idle" }))).toBeNull();
  });

  it("normalizes latest GitHub releases and picks platform installers", () => {
    const release = normalizeGitHubLatestRelease({
      assets: [
        {
          browser_download_url: "https://example.com/Sentinel-1.2.0-arm64.dmg",
          name: "Sentinel-1.2.0-arm64.dmg",
          size: 1024,
        },
        {
          browser_download_url: "https://example.com/Sentinel-1.2.0-x64.dmg",
          name: "Sentinel-1.2.0-x64.dmg",
          size: 2048,
        },
        {
          browser_download_url:
            "https://example.com/Sentinel-1.2.0-x64.dmg.blockmap",
          name: "Sentinel-1.2.0-x64.dmg.blockmap",
          size: 512,
        },
      ],
      html_url: "https://github.com/Cronacl/Sentinel/releases/tag/v1.2.0",
      body: "## Features\n\n- Faster updates",
      name: "Sentinel 1.2.0",
      published_at: "2026-03-29T10:00:00.000Z",
      tag_name: "v1.2.0",
    });

    expect(release).toMatchObject({
      releaseNotes: "## Features\n\n- Faster updates",
      releasePageUrl: "https://github.com/Cronacl/Sentinel/releases/tag/v1.2.0",
      version: "1.2.0",
    });
    expect(selectDesktopReleaseAsset(release, "darwin", "arm64")).toMatchObject(
      {
        downloadUrl: "https://example.com/Sentinel-1.2.0-arm64.dmg",
        name: "Sentinel-1.2.0-arm64.dmg",
      },
    );
    expect(selectDesktopReleaseAsset(release, "darwin", "x64")).toMatchObject({
      downloadUrl: "https://example.com/Sentinel-1.2.0-x64.dmg",
      name: "Sentinel-1.2.0-x64.dmg",
    });
  });

  it("picks Windows and Linux installer assets without metadata files", () => {
    const release = normalizeGitHubLatestRelease({
      assets: [
        {
          browser_download_url: "https://example.com/latest.yml",
          name: "latest.yml",
          size: 10,
        },
        {
          browser_download_url: "https://example.com/Sentinel-1.2.0-x64.exe",
          name: "Sentinel-1.2.0-x64.exe",
          size: 1024,
        },
        {
          browser_download_url:
            "https://example.com/Sentinel-1.2.0-arm64.AppImage",
          name: "Sentinel-1.2.0-arm64.AppImage",
          size: 2048,
        },
      ],
      tag_name: "v1.2.0",
    });

    expect(selectDesktopReleaseAsset(release, "win32", "x64")).toMatchObject({
      name: "Sentinel-1.2.0-x64.exe",
    });
    expect(selectDesktopReleaseAsset(release, "linux", "arm64")).toMatchObject({
      name: "Sentinel-1.2.0-arm64.AppImage",
    });
  });

  it("converts HTML release notes into readable markdown", () => {
    expect(
      normalizeReleaseNotesContent(
        "<h2>v0.0.48</h2><h3>Features</h3><ul><li><strong>diff-sidebar:</strong> enhance repo diff sidebar functionality</li></ul>",
      ),
    ).toBe(
      "## v0.0.48\n\n### Features\n\n- **diff-sidebar:** enhance repo diff sidebar functionality",
    );
  });
});
