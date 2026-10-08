import { describe, expect, it } from "bun:test";

import {
  makeEngineUsageLimits,
  makeUnavailableEngineUsageLimits,
  type EngineUsageWindow,
} from "@/lib/ai/chat/engines/contract";
import { makeFakeSnapshot } from "@/lib/ai/chat/engines/contract/testing";

import {
  describeUsageCheckedAt,
  describeUsageReset,
  formatUsagePercent,
  formatUsageResetIn,
  getMostConstrainedUsageWindow,
  getUsageLimitsNotice,
  getUsageTone,
  getUsageWindows,
  isUsageLimitsSnapshot,
  isUsageLimitsStale,
  syncUsageLimitsFromEvent,
} from "./usage-limits";

const NOW = Date.parse("2026-10-08T10:00:00.000Z");
const AT = "2026-10-08T10:00:00.000Z";

function window(overrides: Partial<EngineUsageWindow> = {}): EngineUsageWindow {
  return {
    id: "five_hour",
    kind: "session",
    label: "Session",
    usedPercent: 10,
    ...overrides,
  };
}

describe("usage presentation", () => {
  it("phrases resets coarsely", () => {
    const inMs = (ms: number) => new Date(NOW + ms).toISOString();
    expect(formatUsageResetIn(inMs(12 * 60_000), NOW)).toBe("12m");
    expect(formatUsageResetIn(inMs(200 * 60_000), NOW)).toBe("3h 20m");
    expect(formatUsageResetIn(inMs(3 * 3_600_000), NOW)).toBe("3h");
    expect(formatUsageResetIn(inMs(5 * 86_400_000 + 5 * 3_600_000), NOW)).toBe(
      "5d 5h",
    );
    expect(formatUsageResetIn(inMs(-1), NOW)).toBe("now");
    expect(formatUsageResetIn("not a date", NOW)).toBeNull();
    expect(formatUsageResetIn(undefined, NOW)).toBeNull();
    expect(describeUsageReset({ resetsAt: inMs(12 * 60_000) }, NOW)).toBe(
      "Resets in 12m",
    );
  });

  it("colours and rounds percentages", () => {
    expect(getUsageTone(10)).toBe("accent");
    expect(getUsageTone(70)).toBe("warning");
    expect(getUsageTone(95)).toBe("danger");
    expect(formatUsagePercent(41.6)).toBe("42%");
    expect(formatUsagePercent(130)).toBe("100%");
  });

  it("picks the fullest window for the chip", () => {
    const limits = makeEngineUsageLimits({
      checkedAt: AT,
      windows: [
        window(),
        window({ id: "seven_day", kind: "weekly", usedPercent: 64 }),
      ],
    });
    expect(getMostConstrainedUsageWindow(limits)?.id).toBe("seven_day");
    expect(getMostConstrainedUsageWindow(null)).toBeNull();
    expect(
      getUsageWindows(
        makeUnavailableEngineUsageLimits({
          checkedAt: AT,
          reason: "probeFailed",
        }),
      ),
    ).toEqual([]);
  });

  it("lists instances that report usage or can be helped to", () => {
    expect(isUsageLimitsSnapshot(makeFakeSnapshot({ driver: "codex" }))).toBe(
      true,
    );
    expect(isUsageLimitsSnapshot(makeFakeSnapshot({ driver: "copilot" }))).toBe(
      false,
    );
    expect(
      isUsageLimitsSnapshot(
        makeFakeSnapshot({ driver: "codex", enabled: false }),
      ),
    ).toBe(false);
    // Nothing to do about an account that can never report.
    expect(
      isUsageLimitsSnapshot(
        makeFakeSnapshot({
          driver: "opencode",
          usageLimits: makeUnavailableEngineUsageLimits({
            checkedAt: AT,
            reason: "unsupported",
          }),
        }),
      ),
    ).toBe(false);
    expect(
      isUsageLimitsSnapshot(
        makeFakeSnapshot({
          driver: "cursor",
          usageLimits: makeUnavailableEngineUsageLimits({
            action: "read-keychain",
            checkedAt: AT,
            reason: "unsupported",
          }),
        }),
      ),
    ).toBe(true);
  });

  it("explains missing bars", () => {
    expect(
      getUsageLimitsNotice(
        makeFakeSnapshot({
          usageLimits: makeEngineUsageLimits({
            checkedAt: AT,
            windows: [window()],
          }),
        }),
      ),
    ).toBeNull();
    expect(getUsageLimitsNotice(makeFakeSnapshot({ usageLimits: null }))).toBe(
      "Usage has not been read yet.",
    );
    expect(
      getUsageLimitsNotice(
        makeFakeSnapshot({
          usageLimits: makeUnavailableEngineUsageLimits({
            checkedAt: AT,
            message: "Allow Keychain access.",
            reason: "unsupported",
          }),
        }),
      ),
    ).toBe("Allow Keychain access.");
    expect(
      getUsageLimitsNotice(makeFakeSnapshot({ label: "Codex", usable: false })),
    ).toBe("Codex needs to be ready before it can report usage.");
  });
});

describe("usage age", () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it("says when limits were read, with the day once it is not today", () => {
    const timeOf = (iso: string) =>
      new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    const today = new Date(NOW).toISOString();
    expect(describeUsageCheckedAt(today, NOW)).toBe(`Read at ${timeOf(today)}`);
    const old = ago(3 * 86_400_000);
    const day = new Date(old).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    expect(describeUsageCheckedAt(old, NOW)).toBe(
      `Read ${day}, ${timeOf(old)}`,
    );
    expect(describeUsageCheckedAt(undefined, NOW)).toBeNull();
    expect(describeUsageCheckedAt("not a date", NOW)).toBeNull();
  });

  it("flags windows carried over or read long ago", () => {
    const limitsAt = (checkedAt: string) =>
      makeEngineUsageLimits({ checkedAt, windows: [window()] });
    const fresh = limitsAt(ago(4 * 60_000));
    expect(isUsageLimitsStale({ usable: true, usageLimits: fresh }, NOW)).toBe(
      false,
    );
    // Not usable: whatever is shown came from an earlier read.
    expect(isUsageLimitsStale({ usable: false, usageLimits: fresh }, NOW)).toBe(
      true,
    );
    expect(
      isUsageLimitsStale(
        { usable: true, usageLimits: limitsAt(ago(3 * 86_400_000)) },
        NOW,
      ),
    ).toBe(true);
    // Nothing drawn, nothing stale.
    expect(
      isUsageLimitsStale(
        {
          usable: false,
          usageLimits: makeUnavailableEngineUsageLimits({
            checkedAt: AT,
            reason: "unsupported",
          }),
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("syncUsageLimitsFromEvent", () => {
  function cache(initial: Record<string, unknown>) {
    const data = new Map(Object.entries(initial));
    const writes: unknown[] = [];
    return {
      data,
      getData: ({ instanceId }: { instanceId: string }) =>
        data.get(instanceId) as never,
      setData: ({ instanceId }: { instanceId: string }, value: unknown) => {
        writes.push([instanceId, value]);
        data.set(instanceId, value);
      },
      writes,
    };
  }
  const limits = makeEngineUsageLimits({ checkedAt: AT, windows: [window()] });

  it("updates usage something is showing", () => {
    const target = cache({ codex: null });
    syncUsageLimitsFromEvent(target, {
      snapshot: makeFakeSnapshot({ usageLimits: limits }),
      type: "snapshot",
      version: 1,
    });
    expect(target.writes).toEqual([["codex", limits]]);

    // The same limits again: nothing to write.
    syncUsageLimitsFromEvent(target, {
      snapshot: makeFakeSnapshot({ usageLimits: limits }),
      type: "snapshot",
      version: 2,
    });
    expect(target.writes).toHaveLength(1);
  });

  it("leaves instances nothing shows and other events alone", () => {
    const target = cache({});
    syncUsageLimitsFromEvent(target, {
      snapshot: makeFakeSnapshot({ usageLimits: limits }),
      type: "snapshot",
      version: 1,
    });
    syncUsageLimitsFromEvent(target, {
      instanceId: "codex",
      type: "snapshot-removed",
      version: 2,
    });
    expect(target.writes).toEqual([]);
  });
});
