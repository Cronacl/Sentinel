import semver from "semver";

import packageJson from "../../../../../../../package.json";
import { getDriverLabel } from "../../catalog";
import type { EngineCompatibilityAdvisory } from "../../contract";
import {
  normalizeVersionRange,
  stripVersionLeadingZeros,
  type EngineCompatibilityPolicy,
  type EngineCompatibilityStatus,
} from "./schema";

// Version compatibility advisories from the manifest's policies (design
// driver-contract.md §5). Adapted from t3code's providerCompatibility.ts
// (MIT): the first policy whose Sentinel range matches this build applies,
// the first of its ranges that the installed version satisfies sets the
// status, and versions that cannot be read stay "unknown".

export function getSentinelVersion() {
  return typeof packageJson.version === "string" && packageJson.version
    ? packageJson.version
    : "0.0.0";
}

/**
 * A runtime's reported version as a comparable semver, or null.
 *   "2.1.280 (Claude Code)"         → 2.1.280
 *   "codex-cli 0.160.1"             → 0.160.1
 *   "opencode v2.0.18"              → 2.0.18
 *   "grok 0.2.39 (55a20b703aa)"     → 0.2.39
 *   "2026.08.04-aaa8809" (Cursor)   → 2026.8.4 (date plus build hash)
 *   "agy_acp_server_1.3.0"          → 1.3.0
 * Prereleases and snapshot builds ("0.0.0-dev-…") stay null: unknown, never
 * "too old".
 */
export function normalizeEngineVersion(
  driver: string,
  value: string | null | undefined,
) {
  const firstLine = value?.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine) {
    return null;
  }

  const candidates = firstLine
    .split(/\s+/)
    .map((token) =>
      token.replace(/^[^\d]*?v?(?=\d)/, "").replace(/[.,;:)]+$/, ""),
    );
  for (const candidate of candidates) {
    const match = candidate.match(/^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/);
    if (!match) {
      continue;
    }

    let suffix = match[4] ?? "";
    // Cursor appends a build hash to its date version; that is not a
    // prerelease.
    if (driver === "cursor" && /^-[0-9a-f]+$/i.test(suffix)) {
      suffix = "";
    }
    if (suffix) {
      return null;
    }

    const version = stripVersionLeadingZeros(
      `${match[1]}.${match[2]}.${match[3]}`,
    );
    return semver.valid(version) ? version : null;
  }

  return null;
}

/** Whether a normalized version satisfies a manifest range. */
export function satisfiesVersionRange(version: string, range: string) {
  const normalized = normalizeVersionRange(range);
  return normalized !== null && semver.satisfies(version, normalized);
}

/** The policy for this build and driver, if the manifest has one. */
export function findCompatibilityPolicy(
  policies: readonly EngineCompatibilityPolicy[],
  driver: string,
  sentinelVersion = getSentinelVersion(),
) {
  return (
    policies.find(
      (policy) =>
        policy.driver === driver &&
        satisfiesVersionRange(sentinelVersion, policy.sentinelRange),
    ) ?? null
  );
}

function formatRecommendation(policy: EngineCompatibilityPolicy) {
  if (policy.recommendedVersion) {
    return `${policy.recommendedVersion} or newer`;
  }
  const range = policy.recommendedRange?.trim() ?? null;
  const floor = range?.match(/^>=\s*v?(\d+\.\d+\.\d+)$/)?.[1];
  return floor ? `${stripVersionLeadingZeros(floor)} or newer` : range;
}

function fillTemplate(
  template: string,
  values: Record<"label" | "recommended" | "version", string>,
) {
  return template.replace(
    /\{(label|recommended|version)\}/g,
    (_, key: keyof typeof values) => values[key],
  );
}

function defaultMessage(
  status: EngineCompatibilityStatus,
  recommendation: string | null,
) {
  const advice = recommendation ? ` Recommended: {recommended}.` : "";
  switch (status) {
    case "broken":
      return `{label} {version} does not work with this version of Sentinel.${advice}`;
    case "unsupported":
      return `{label} {version} is outside the versions this version of Sentinel supports; some features may not work.${advice}`;
    case "graceful":
      return `{label} {version} works with this version of Sentinel, with some features limited.${advice}`;
    default:
      return null;
  }
}

/**
 * The advisory for one installed runtime version, or null when the
 * manifest has no policy for the driver (on this Sentinel version).
 */
export function resolveEngineCompatibility(input: {
  driver: string;
  label?: string;
  policies: readonly EngineCompatibilityPolicy[];
  sentinelVersion?: string;
  version: string | null | undefined;
}): EngineCompatibilityAdvisory | null {
  const policy = findCompatibilityPolicy(
    input.policies,
    input.driver,
    input.sentinelVersion,
  );
  if (!policy) {
    return null;
  }

  const recommendation = formatRecommendation(policy);
  const advisoryBase = {
    recommendedRange: policy.recommendedRange ?? null,
    recommendedVersion: policy.recommendedVersion ?? null,
  };
  const version = normalizeEngineVersion(input.driver, input.version);
  if (!version) {
    return { ...advisoryBase, message: null, status: "unknown" };
  }

  const entry =
    policy.ranges.find((candidate) =>
      satisfiesVersionRange(version, candidate.range),
    ) ?? null;
  const status = entry?.status ?? "unknown";
  const template = entry?.message ?? defaultMessage(status, recommendation);

  return {
    ...advisoryBase,
    message: template
      ? fillTemplate(template, {
          label: input.label ?? getDriverLabel(input.driver),
          recommended: recommendation ?? "",
          version,
        })
      : null,
    status,
  };
}

const SEVERITY: Record<EngineCompatibilityAdvisory["status"], number> = {
  broken: 4,
  graceful: 2,
  supported: 0,
  unknown: 0,
  unsupported: 3,
};

/**
 * The advisory a snapshot shows when both the runtime (its own protocol
 * floor, e.g. OpenCode) and the manifest have a say: the more severe one,
 * since data can tighten but never lift what the code knows it cannot
 * drive. On a tie the runtime's own (more specific) advisory wins. A
 * manifest "unknown" does not hide what the runtime reported.
 */
export function combineCompatibilityAdvisories(
  runtime: EngineCompatibilityAdvisory | null | undefined,
  manifest: EngineCompatibilityAdvisory | null | undefined,
): EngineCompatibilityAdvisory | null {
  if (!manifest) {
    return runtime ?? null;
  }
  if (!runtime) {
    return manifest;
  }

  const runtimeSeverity = SEVERITY[runtime.status];
  const manifestSeverity = SEVERITY[manifest.status];
  if (manifestSeverity > runtimeSeverity) {
    return manifest;
  }
  if (
    manifestSeverity === runtimeSeverity &&
    runtime.status === "unknown" &&
    manifest.status === "supported"
  ) {
    return manifest;
  }
  return {
    ...runtime,
    recommendedRange: runtime.recommendedRange ?? manifest.recommendedRange,
    recommendedVersion:
      runtime.recommendedVersion ?? manifest.recommendedVersion,
  };
}

/** Whether `version` is older than `minimum` (both runtime-reported forms). */
export function isEngineVersionBelow(
  driver: string,
  version: string | null | undefined,
  minimum: string,
) {
  const current = normalizeEngineVersion(driver, version);
  const floor = normalizeEngineVersion(driver, minimum);
  return current !== null && floor !== null && semver.lt(current, floor);
}

/** semver comparison of two runtime-reported versions (null: unknown). */
export function compareEngineVersions(
  driver: string,
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const a = normalizeEngineVersion(driver, left);
  const b = normalizeEngineVersion(driver, right);
  return a === null || b === null ? null : semver.compare(a, b);
}
