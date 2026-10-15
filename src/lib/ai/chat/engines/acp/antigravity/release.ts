// Google's Antigravity ACP server (`agy-acp-server`) releases Sentinel
// installs itself (design acp-and-agents §3.3). URLs come from the ACP
// registry entry `antigravity-acp`; the SHA-256 pins and sizes are copied
// from t3code (apps/server/src/provider/antigravityRelease.ts, MIT), which
// checked them on 2026-10-05 against
// https://github.com/agentclientprotocol/registry/blob/dc55a34900fdd60e5e97c1cbd7825c5a1df673fc/antigravity-acp/agent.json
// Each zip holds the server (a PyInstaller one-file bundle that unpacks
// ~1 GB into TMPDIR per launch) and its `localharness_external` sibling.

export const ANTIGRAVITY_RELEASE_VERSION = "1.3.0";
/** The managed-install tool id: <state root>/tools/antigravity-acp/<version>/. */
export const ANTIGRAVITY_MANAGED_TOOL = "antigravity-acp";
/** The name the server reports in `initialize` (agentInfo.name). */
export const ANTIGRAVITY_AGENT_NAME = "antigravity-acp";

export type AntigravityReleaseAsset = {
  archiveBytes: number;
  executable: { bytes: number; name: string };
  harness: { bytes: number; name: string };
  sha256: string;
  url: string;
  version: string;
};

const POSIX_FILES = {
  executable: "agy_acp_server.par",
  harness: "localharness_external",
};
const WINDOWS_FILES = {
  executable: "agy_acp_server.exe",
  harness: "localharness_external.exe",
};

function asset(
  os: "linux" | "macos" | "windows",
  file: string,
  sha256: string,
  archiveBytes: number,
  executableBytes: number,
  harnessBytes: number,
): AntigravityReleaseAsset {
  const names = os === "windows" ? WINDOWS_FILES : POSIX_FILES;
  return {
    archiveBytes,
    executable: { bytes: executableBytes, name: names.executable },
    harness: { bytes: harnessBytes, name: names.harness },
    sha256,
    url: `https://dl.google.com/agy-extensions/releases/${os}/agy-acp-server-${ANTIGRAVITY_RELEASE_VERSION}-${file}.zip`,
    version: ANTIGRAVITY_RELEASE_VERSION,
  };
}

const RELEASE_ASSETS: Readonly<Record<string, AntigravityReleaseAsset>> = {
  "darwin-arm64": asset(
    "macos",
    "darwin-arm64",
    "7cd97045f7b4fe81175a107cdf16f9c51484e3c78a5162cae415338bb6aa5b88",
    111_456_962,
    278_535_456,
    118_611_392,
  ),
  "darwin-x64": asset(
    "macos",
    "darwin-x86_64",
    "bb23956b89984bf5d354af2c3725e6c57f0cc1b7228e77a0e91c9c2bc1d47646",
    117_245_544,
    282_840_688,
    124_175_392,
  ),
  "linux-arm64": asset(
    "linux",
    "linux-arm64",
    "500b0bc0fb858e88f4df404d4cedf80bf9298c178291e39e383d6c50b111cbdf",
    321_690_363,
    930_848_992,
    123_224_968,
  ),
  "linux-x64": asset(
    "linux",
    "linux-x86_64",
    "9fb60956af0a9d76220a4db91ca9ac88e2a2372ad68f985ab5fceace6b825b96",
    333_727_150,
    926_533_965,
    130_388_040,
  ),
  "win32-arm64": asset(
    "windows",
    "windows-arm64",
    "4a0f469720e9beb9438a979f543fdbfad5022ebe0992c052c590bd78b3144ca3",
    124_654_803,
    85_893_472,
    135_640_216,
  ),
  "win32-x64": asset(
    "windows",
    "windows-x86_64",
    "65215e0688681fa3116e048a9eab27ef53af1bbd6f3da3f1c52bd4911d8b17f9",
    124_509_787,
    81_437_336,
    145_548_952,
  ),
};

/** The pinned release for a platform, or null where Google publishes none. */
export function resolveAntigravityReleaseAsset(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): AntigravityReleaseAsset | null {
  return RELEASE_ASSETS[`${platform}-${arch}`] ?? null;
}

/** File names of the server and its harness on a platform. */
export function antigravityFileNames(
  platform: NodeJS.Platform = process.platform,
) {
  return platform === "win32" ? WINDOWS_FILES : POSIX_FILES;
}

/** "112 MB" for an install confirmation. */
export function formatDownloadSize(bytes: number) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}
