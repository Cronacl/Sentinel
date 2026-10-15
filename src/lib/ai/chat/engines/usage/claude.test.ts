import { describe, expect, it } from "bun:test";

import {
  claudeRateLimitEventToWindows,
  claudeUsageResponseToLimits,
  getClaudeScopedLimitNames,
  setClaudeScopedLimitNames,
} from "./claude";

const AT = "2026-10-08T10:00:00.000Z";

describe("Claude usage mapping", () => {
  it("maps a usage read to windows and remembers the scoped bucket", () => {
    const { limits, names } = claudeUsageResponseToLimits({
      checkedAt: AT,
      response: {
        rate_limits: {
          five_hour: { resets_at: "2026-10-08T12:00:00Z", utilization: 12 },
          model_scoped: [
            {
              display_name: "Fable",
              resets_at: "2026-10-12T00:00:00Z",
              utilization: 30,
            },
          ],
          seven_day: { resets_at: null, utilization: 140 },
          seven_day_opus: { resets_at: null, utilization: null },
        } as never,
        rate_limits_available: true,
      },
    });

    expect(limits).toEqual({
      checkedAt: AT,
      windows: [
        {
          id: "five_hour",
          kind: "session",
          label: "Session",
          resetsAt: "2026-10-08T12:00:00.000Z",
          usedPercent: 12,
          windowDurationMins: 300,
        },
        {
          id: "seven_day",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 100,
          windowDurationMins: 10_080,
        },
        {
          id: "seven_day_fable",
          kind: "weekly",
          label: "Weekly · Fable",
          resetsAt: "2026-10-12T00:00:00.000Z",
          usedPercent: 30,
          windowDurationMins: 10_080,
        },
      ],
    });
    expect(names).toEqual({ overageIncluded: "Fable" });
  });

  it("reports API-key sessions as unsupported", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt: AT,
        response: { rate_limits: null, rate_limits_available: false },
      }).limits.unavailable,
    ).toEqual({
      message: "Plan usage is only reported for Claude subscription logins.",
      reason: "unsupported",
    });
  });

  it("says when a subscription login cannot be read on demand", () => {
    // A token without the profile scope: runs still stream rate limits.
    expect(
      claudeUsageResponseToLimits({
        checkedAt: AT,
        response: {
          rate_limits: null,
          rate_limits_available: false,
          subscription_type: "max",
        },
      }).limits.unavailable?.message,
    ).toContain("shows during runs");
  });

  it("treats plan limits that did not come back as a failed read", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt: AT,
        response: { rate_limits: null, rate_limits_available: true },
      }).limits.unavailable?.reason,
    ).toBe("probeFailed");
  });

  it("maps streamed events onto the same window ids", () => {
    expect(
      claudeRateLimitEventToWindows(
        {
          rateLimitType: "five_hour",
          resetsAt: 1_790_000_000,
          utilization: 0.5,
        },
        { overageIncluded: null },
      ),
    ).toEqual([
      {
        id: "five_hour",
        kind: "session",
        label: "Session",
        resetsAt: new Date(1_790_000_000_000).toISOString(),
        usedPercent: 50,
        windowDurationMins: 300,
      },
    ]);
    expect(
      claudeRateLimitEventToWindows(
        { rateLimitType: "seven_day_overage_included", utilization: 0.25 },
        { overageIncluded: "Fable" },
      )?.[0]?.id,
    ).toBe("seven_day_fable");
  });

  it("drops events no read can draw", () => {
    const names = { overageIncluded: null };
    expect(
      claudeRateLimitEventToWindows(
        { rateLimitType: "seven_day_overage_included", utilization: 0.25 },
        names,
      ),
    ).toBeNull();
    expect(
      claudeRateLimitEventToWindows(
        { rateLimitType: "overage", utilization: 0.25 },
        names,
      ),
    ).toBeNull();
    expect(
      claudeRateLimitEventToWindows({ rateLimitType: "five_hour" }, names),
    ).toBeNull();
  });

  it("keeps scoped names per instance", () => {
    setClaudeScopedLimitNames("claude-work", { overageIncluded: "Fable" });
    expect(getClaudeScopedLimitNames("claude-work")).toEqual({
      overageIncluded: "Fable",
    });
    expect(getClaudeScopedLimitNames("claude-other")).toEqual({
      overageIncluded: null,
    });
  });
});
