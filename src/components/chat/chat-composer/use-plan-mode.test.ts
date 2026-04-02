import { describe, expect, it } from "bun:test";

import { resolvePreferredPlanMode, syncPlanModeState } from "./use-plan-mode";

describe("usePlanMode helpers", () => {
  it("prefers the thread mode over draft and global defaults", () => {
    expect(
      resolvePreferredPlanMode({
        draftMode: "chat",
        globalMode: "chat",
        threadMode: "plan",
      }),
    ).toBe("plan");
  });

  it("hydrates the current scope from the persisted thread mode", () => {
    const result = syncPlanModeState(
      {
        hydratedScopeKey: null,
        lastSyncedThreadMode: null,
        planMode: false,
      },
      {
        draftMode: "chat",
        globalMode: "chat",
        planModeAvailable: true,
        preferencesReady: true,
        selectionScopeKey: "thread-1",
        threadMode: "plan",
      },
    );

    expect(result).toEqual({
      hydratedScopeKey: "thread-1",
      lastSyncedThreadMode: "plan",
      planMode: true,
    });
  });

  it("reinitializes from the next thread scope instead of carrying stale plan mode", () => {
    const staleState = {
      hydratedScopeKey: "thread-1",
      lastSyncedThreadMode: "plan" as const,
      planMode: true,
    };

    const waitingForPreferences = syncPlanModeState(staleState, {
      draftMode: null,
      globalMode: "chat",
      planModeAvailable: true,
      preferencesReady: false,
      selectionScopeKey: "thread-2",
      threadMode: null,
    });

    expect(waitingForPreferences).toBe(staleState);

    const hydratedNextScope = syncPlanModeState(waitingForPreferences, {
      draftMode: null,
      globalMode: "chat",
      planModeAvailable: true,
      preferencesReady: true,
      selectionScopeKey: "thread-2",
      threadMode: "chat",
    });

    expect(hydratedNextScope).toEqual({
      hydratedScopeKey: "thread-2",
      lastSyncedThreadMode: "chat",
      planMode: false,
    });
  });
});
