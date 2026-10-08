import { describe, expect, it } from "bun:test";

import {
  codexAccountHasNoPlanUsage,
  codexRateLimitsNotificationToWindows,
  codexRateLimitsToLimits,
  codexRateLimitsToWindows,
} from "./codex";

const AT = "2026-10-08T10:00:00.000Z";

describe("Codex usage mapping", () => {
  it("maps the paid-plan pair by duration", () => {
    expect(
      codexRateLimitsToWindows({
        planType: "pro",
        primary: { resetsAt: 1_790_000_000, usedPercent: 20 },
        secondary: { usedPercent: 120, windowDurationMins: 10_080 },
      }),
    ).toEqual([
      {
        id: "primary",
        kind: "session",
        label: "Session",
        resetsAt: new Date(1_790_000_000_000).toISOString(),
        usedPercent: 20,
        windowDurationMins: 300,
      },
      {
        id: "secondary",
        kind: "weekly",
        label: "Weekly",
        usedPercent: 100,
        windowDurationMins: 10_080,
      },
    ]);
  });

  it("treats a Free or Go primary window as monthly", () => {
    expect(
      codexRateLimitsToWindows({ planType: "go", primary: { usedPercent: 5 } }),
    ).toEqual([
      {
        id: "primary",
        kind: "monthly",
        label: "Monthly",
        usedPercent: 5,
        windowDurationMins: 43_200,
      },
    ]);
  });

  it("only shows the main allowance", () => {
    expect(
      codexRateLimitsToWindows({
        limitId: "spark",
        primary: { usedPercent: 9 },
      }),
    ).toEqual([]);
    expect(
      codexRateLimitsToLimits({
        checkedAt: AT,
        rateLimits: { limitId: "spark", primary: { usedPercent: 9 } },
        rateLimitsByLimitId: {
          codex: { primary: { usedPercent: 33, windowDurationMins: 300 } },
        },
      }).windows.map((window) => window.usedPercent),
    ).toEqual([33]);
  });

  it("reads notification params defensively", () => {
    expect(codexRateLimitsNotificationToWindows(null)).toEqual([]);
    expect(codexRateLimitsNotificationToWindows({ rateLimits: 3 })).toEqual([]);
    expect(
      codexRateLimitsNotificationToWindows({
        rateLimits: { primary: { usedPercent: 7, windowDurationMins: 300 } },
      }),
    ).toHaveLength(1);
  });

  it("knows which sign-ins have no plan windows", () => {
    expect(codexAccountHasNoPlanUsage("apiKey")).toBeTrue();
    expect(codexAccountHasNoPlanUsage("amazonBedrock")).toBeTrue();
    expect(codexAccountHasNoPlanUsage("chatgpt")).toBeFalse();
    expect(codexAccountHasNoPlanUsage(null)).toBeFalse();
  });
});
