import { describe, expect, it } from "bun:test";

import {
  applyEngineUsageLimitsUpdate,
  clampUsagePercent,
  engineUsageLimitsEqual,
  engineUsageLimitsSchema,
  makeEngineUsageLimits,
  makeUnavailableEngineUsageLimits,
  resolveEngineUsageLimitsAfterRead,
  sortEngineUsageWindows,
  type EngineUsageWindow,
} from "./usage-limits";

const AT = "2026-10-08T10:00:00.000Z";
const LATER = "2026-10-08T10:05:00.000Z";

function window(overrides: Partial<EngineUsageWindow> = {}): EngineUsageWindow {
  return {
    id: "five_hour",
    kind: "session",
    label: "Session",
    usedPercent: 10,
    ...overrides,
  };
}

const weekly = window({ id: "seven_day", kind: "weekly", label: "Weekly" });

describe("usage limit helpers", () => {
  it("clamps percentages to 0–100", () => {
    expect(clampUsagePercent(-4)).toBe(0);
    expect(clampUsagePercent(140)).toBe(100);
    expect(clampUsagePercent(Number.NaN)).toBe(0);
    expect(clampUsagePercent(33.5)).toBe(33.5);
  });

  it("orders windows session, weekly, monthly, other", () => {
    expect(
      sortEngineUsageWindows([
        window({ id: "z", kind: "other" }),
        window({ id: "m", kind: "monthly" }),
        weekly,
        window(),
      ]).map((item) => item.id),
    ).toEqual(["five_hour", "seven_day", "m", "z"]);
  });

  it("builds limits that satisfy the schema", () => {
    expect(
      engineUsageLimitsSchema.parse(
        makeUnavailableEngineUsageLimits({
          action: "read-keychain",
          checkedAt: AT,
          message: "Allow access",
          reason: "unsupported",
        }),
      ),
    ).toEqual({
      checkedAt: AT,
      unavailable: {
        action: "read-keychain",
        message: "Allow access",
        reason: "unsupported",
      },
      windows: [],
    });
  });
});

describe("applyEngineUsageLimitsUpdate", () => {
  const previous = makeEngineUsageLimits({
    checkedAt: AT,
    credentialFingerprint: "abc",
    windows: [window({ resetsAt: AT, windowDurationMins: 300 }), weekly],
  });

  it("merges by id and keeps reset times the update omits", () => {
    expect(
      applyEngineUsageLimitsUpdate({
        checkedAt: LATER,
        previous,
        windows: [window({ usedPercent: 140 })],
      }),
    ).toEqual({
      checkedAt: LATER,
      credentialFingerprint: "abc",
      windows: [
        window({ resetsAt: AT, usedPercent: 100, windowDurationMins: 300 }),
        weekly,
      ],
    });
  });

  it("returns the same limits when nothing changed", () => {
    expect(
      applyEngineUsageLimitsUpdate({
        checkedAt: LATER,
        previous,
        windows: [window()],
      }),
    ).toBe(previous);
    expect(
      applyEngineUsageLimitsUpdate({ checkedAt: LATER, previous, windows: [] }),
    ).toBe(previous);
  });

  it("keeps an unsupported account unsupported and starts from nothing", () => {
    const unsupported = makeUnavailableEngineUsageLimits({
      checkedAt: AT,
      reason: "unsupported",
    });
    expect(
      applyEngineUsageLimitsUpdate({
        checkedAt: LATER,
        previous: unsupported,
        windows: [window()],
      }),
    ).toBe(unsupported);
    expect(
      applyEngineUsageLimitsUpdate({
        checkedAt: LATER,
        previous: null,
        windows: [weekly, window()],
      }),
    ).toEqual({ checkedAt: LATER, windows: [window(), weekly] });
  });

  it("replaces a failed read with live windows", () => {
    const failed = makeUnavailableEngineUsageLimits({
      checkedAt: AT,
      reason: "probeFailed",
    });
    expect(
      applyEngineUsageLimitsUpdate({
        checkedAt: LATER,
        previous: failed,
        windows: [window()],
      }),
    ).toEqual({ checkedAt: LATER, windows: [window()] });
  });
});

describe("resolveEngineUsageLimitsAfterRead", () => {
  const good = makeEngineUsageLimits({ checkedAt: AT, windows: [window()] });

  it("keeps the last good windows when a read fails", () => {
    const failed = makeUnavailableEngineUsageLimits({
      checkedAt: LATER,
      reason: "probeFailed",
    });
    expect(
      resolveEngineUsageLimitsAfterRead({ published: good, read: failed }),
    ).toBe(good);
    expect(
      resolveEngineUsageLimitsAfterRead({ published: null, read: failed }),
    ).toBe(failed);
  });

  it("lets unsupported and successful reads replace what was there", () => {
    const unsupported = makeUnavailableEngineUsageLimits({
      checkedAt: LATER,
      reason: "unsupported",
    });
    expect(
      resolveEngineUsageLimitsAfterRead({ published: good, read: unsupported }),
    ).toBe(unsupported);
    const next = makeEngineUsageLimits({
      checkedAt: LATER,
      windows: [window({ usedPercent: 50 })],
    });
    expect(
      resolveEngineUsageLimitsAfterRead({ published: good, read: next }),
    ).toBe(next);
  });
});

describe("engineUsageLimitsEqual", () => {
  it("ignores the read time only", () => {
    const left = makeEngineUsageLimits({ checkedAt: AT, windows: [window()] });
    expect(
      engineUsageLimitsEqual(left, { ...left, checkedAt: LATER }),
    ).toBeTrue();
    expect(
      engineUsageLimitsEqual(left, {
        ...left,
        windows: [window({ usedPercent: 11 })],
      }),
    ).toBeFalse();
    expect(engineUsageLimitsEqual(left, null)).toBeFalse();
    expect(engineUsageLimitsEqual(null, null)).toBeTrue();
  });
});
