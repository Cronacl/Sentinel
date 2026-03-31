import { describe, expect, it } from "bun:test";

import {
  DEFAULT_RIGHT_SIDEBAR_STATE,
  clearRightSidebarState,
} from "./right-sidebar-state";

describe("right sidebar state helpers", () => {
  it("clears panel content and resets layout metadata", () => {
    expect(
      clearRightSidebarState({
        content: "Diff panel",
        open: true,
        panelId: "repo-diff",
        size: "wide",
      }),
    ).toEqual(DEFAULT_RIGHT_SIDEBAR_STATE);
  });

  it("returns the same snapshot when already cleared", () => {
    expect(clearRightSidebarState(DEFAULT_RIGHT_SIDEBAR_STATE)).toBe(
      DEFAULT_RIGHT_SIDEBAR_STATE,
    );
  });
});
