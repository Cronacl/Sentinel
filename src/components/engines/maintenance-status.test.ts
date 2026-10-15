import { describe, expect, it } from "bun:test";

import { makeFakeSnapshot } from "@/lib/ai/chat/engines/contract/testing";

import {
  getAdvisoryBadges,
  getCompatibilityBadge,
  getMaintenanceAction,
  getMaintenanceProgressText,
  getMaintenanceResult,
  getVersionBadge,
  isMaintenanceRunning,
} from "./maintenance-status";

const advisory = (
  status: "broken" | "graceful" | "supported" | "unknown" | "unsupported",
) => ({
  message: `${status} message`,
  recommendedRange: null,
  recommendedVersion: null,
  status,
});

const versionAdvisory = (
  overrides: Partial<
    NonNullable<ReturnType<typeof makeFakeSnapshot>["versionAdvisory"]>
  > = {},
) => ({
  canUpdate: true,
  checkedAt: null,
  currentVersion: "1.0.0",
  latestVersion: "1.1.0",
  status: "behind_latest" as const,
  updateCommand: "npm install -g x@1.1.0",
  ...overrides,
});

const notInstalled = {
  installed: false,
  path: null,
  source: null,
  version: null,
};

describe("advisory badges", () => {
  it("shows compatibility problems and newer releases", () => {
    expect(
      getCompatibilityBadge(
        makeFakeSnapshot({ compatibilityAdvisory: advisory("broken") }),
      ),
    ).toEqual({ color: "danger", label: "Update required" });
    expect(
      getCompatibilityBadge(
        makeFakeSnapshot({ compatibilityAdvisory: advisory("graceful") }),
      ),
    ).toEqual({ color: "warning", label: "Update recommended" });
    expect(
      getCompatibilityBadge(
        makeFakeSnapshot({ compatibilityAdvisory: advisory("supported") }),
      ),
    ).toBe(null);
    expect(
      getVersionBadge(makeFakeSnapshot({ versionAdvisory: versionAdvisory() })),
    ).toEqual({ color: "accent", label: "1.1.0 available" });
    expect(
      getAdvisoryBadges(
        makeFakeSnapshot({
          compatibilityAdvisory: advisory("unsupported"),
          versionAdvisory: versionAdvisory(),
        }),
      ).map((badge) => badge.label),
    ).toEqual(["Unsupported version", "1.1.0 available"]);
  });

  it("shows nothing for disabled or missing runtimes", () => {
    expect(
      getAdvisoryBadges(
        makeFakeSnapshot({
          compatibilityAdvisory: advisory("broken"),
          enabled: false,
          versionAdvisory: versionAdvisory(),
        }),
      ),
    ).toEqual([]);
    expect(
      getAdvisoryBadges(
        makeFakeSnapshot({
          compatibilityAdvisory: advisory("broken"),
          install: notInstalled,
        }),
      ),
    ).toEqual([]);
  });
});

describe("getMaintenanceAction", () => {
  it("offers Install for a missing CLI that can be installed", () => {
    const missing = makeFakeSnapshot({
      install: notInstalled,
      status: "error",
    });
    expect(getMaintenanceAction(missing)).toBe(null);
    expect(
      getMaintenanceAction({
        ...missing,
        setup: { ...missing.setup, canInstall: true },
      }),
    ).toEqual({ kind: "install", label: "Install" });
  });

  it("offers Update when behind or when the version needs one", () => {
    expect(
      getMaintenanceAction(
        makeFakeSnapshot({ versionAdvisory: versionAdvisory() }),
      ),
    ).toEqual({ kind: "update", label: "Update" });
    expect(
      getMaintenanceAction(
        makeFakeSnapshot({
          compatibilityAdvisory: advisory("broken"),
          versionAdvisory: versionAdvisory({ status: "unknown" }),
        }),
      ),
    ).toEqual({ kind: "update", label: "Update" });
    expect(
      getMaintenanceAction(
        makeFakeSnapshot({
          versionAdvisory: versionAdvisory({ status: "current" }),
        }),
      ),
    ).toBe(null);
    expect(
      getMaintenanceAction(
        makeFakeSnapshot({
          versionAdvisory: versionAdvisory({ canUpdate: false }),
        }),
      ),
    ).toBe(null);
  });

  it("offers nothing while an install or update runs", () => {
    const snapshot = makeFakeSnapshot({
      updateState: {
        finishedAt: null,
        message: "Updating",
        output: null,
        startedAt: null,
        status: "running",
      },
      versionAdvisory: versionAdvisory(),
    });
    expect(isMaintenanceRunning(snapshot)).toBe(true);
    expect(getMaintenanceAction(snapshot)).toBe(null);
  });
});

describe("progress and results", () => {
  it("describes downloads and running commands", () => {
    expect(
      getMaintenanceProgressText({
        installState: {
          downloadedBytes: 5 * 1024 * 1024,
          message: null,
          phase: "downloading",
          totalBytes: 20 * 1024 * 1024,
        },
        updateState: null,
      }),
    ).toBe("Downloading 5.0 MB of 20.0 MB…");
    expect(
      getMaintenanceProgressText({
        installState: null,
        updateState: {
          finishedAt: null,
          message: "Waiting for another install or update to finish.",
          output: null,
          startedAt: null,
          status: "queued",
        },
      }),
    ).toBe("Waiting for another install or update to finish.");
    expect(
      getMaintenanceProgressText({ installState: null, updateState: null }),
    ).toBe(null);
  });

  it("reports outcomes with their tone and output", () => {
    expect(
      getMaintenanceResult({
        installState: null,
        updateState: {
          finishedAt: "2026-10-08T12:00:00.000Z",
          message: "The command exited with code 1.",
          output: "npm ERR!",
          startedAt: null,
          status: "failed",
        },
      }),
    ).toEqual({
      message: "The command exited with code 1.",
      output: "npm ERR!",
      tone: "danger",
    });
    expect(
      getMaintenanceResult({
        installState: {
          downloadedBytes: 1,
          message: null,
          phase: "succeeded",
          totalBytes: 1,
        },
        updateState: null,
      }),
    ).toEqual({ message: "Installed.", output: null, tone: "success" });
    expect(
      getMaintenanceResult({ installState: null, updateState: null }),
    ).toBe(null);
  });
});
